import shutil, time, os, sys, json, tempfile, copy, shlex, atexit, subprocess
from subprocess import Popen, PIPE, STDOUT
from tempfile import mkstemp

__rootpath__ = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
def path_from_root(*pathelems):
  return os.path.join(__rootpath__, *pathelems)

# Emscripten configuration is done through the EM_CONFIG environment variable.
# If the string value contained in this environment variable contains newline
# separated definitions, then these definitions will be used to configure
# Emscripten.  Otherwise, the string is understood to be a path to a settings
# file that contains the required definitions.

EM_CONFIG = os.environ.get('EM_CONFIG')
if not EM_CONFIG:
  EM_CONFIG = '~/.emscripten'
if '\n' in EM_CONFIG:
  CONFIG_FILE = None
else:
  CONFIG_FILE = os.path.expanduser(EM_CONFIG)
  if not os.path.exists(CONFIG_FILE):
    shutil.copy(path_from_root('settings.py'), CONFIG_FILE)
    print >> sys.stderr, '''
==============================================================================
Welcome to Emscripten!

This is the first time any of the Emscripten tools has been run.

A settings file has been copied to %s, at absolute path: %s

Please edit that file and change the paths to fit your system. Specifically,
make sure LLVM_ROOT and NODE_JS are correct.

This command will now exit. When you are done editing those paths, re-run it.
==============================================================================
''' % (EM_CONFIG, CONFIG_FILE)
    sys.exit(0)
try:
  config_text = open(CONFIG_FILE, 'r').read() if CONFIG_FILE else EM_CONFIG
  exec(config_text)
except Exception, e:
  print >> sys.stderr, 'Error in evaluating %s (at %s): %s, text: %s' % (EM_CONFIG, CONFIG_FILE, str(e), config_text)
  sys.exit(1)

# Expectations

EXPECTED_LLVM_VERSION = (3,1)

def check_llvm_version():
  try:
    expected = 'clang version ' + '.'.join(map(str, EXPECTED_LLVM_VERSION))
    actual = Popen([CLANG, '-v'], stderr=PIPE).communicate()[1].split('\n')[0][0:len(expected)]
    if expected != actual:
      print >> sys.stderr, 'warning: LLVM version appears incorrect (seeing "%s", expected "%s")' % (actual, expected)
  except Exception, e:
    print >> sys.stderr, 'warning: Could not verify LLVM version: %s' % str(e)

# Check that basic stuff we need (a JS engine to compile, Node.js, and Clang and LLVM)
# exists.
# The test runner always does this check (through |force|). emcc does this less frequently,
# only when ${EM_CONFIG}_sanity does not exist or is older than EM_CONFIG (so,
# we re-check sanity when the settings are changed)
def check_sanity(force=False):
  try:
    if not force:
      if not CONFIG_FILE:
        return # config stored directly in EM_CONFIG => skip sanity checks
      settings_mtime = os.stat(CONFIG_FILE).st_mtime
      sanity_file = CONFIG_FILE + '_sanity'
      try:
        sanity_mtime = os.stat(sanity_file).st_mtime
        if sanity_mtime > settings_mtime:
          return # sanity has been checked
      except:
        pass

      print >> sys.stderr, '(Emscripten: Config file changed, clearing cache)' # LLVM may have changed, etc.
      Cache.erase()

    check_llvm_version() # just a warning, not a fatal check - do it even if EM_IGNORE_SANITY is on

    if os.environ.get('EM_IGNORE_SANITY'):
      print >> sys.stderr, 'EM_IGNORE_SANITY set, ignoring sanity checks'
      return

    print >> sys.stderr, '(Emscripten: Running sanity checks)'

    if not check_engine(COMPILER_ENGINE):
      print >> sys.stderr, 'FATAL: The JavaScript shell used for compiling (%s) does not seem to work, check the paths in %s' % (COMPILER_ENGINE, EM_CONFIG)
      sys.exit(0)

    if NODE_JS != COMPILER_ENGINE:
      if not check_engine(NODE_JS):
        print >> sys.stderr, 'FATAL: Node.js (%s) does not seem to work, check the paths in %s' % (NODE_JS, EM_CONFIG)
        sys.exit(0)

    for cmd in [CLANG, LLVM_DIS]:
      if not os.path.exists(cmd) and not os.path.exists(cmd + '.exe'): # .exe extension required for Windows
        print >> sys.stderr, 'FATAL: Cannot find %s, check the paths in %s' % (cmd, EM_CONFIG)
        sys.exit(0)

    try:
      subprocess.call([JAVA, '-version'], stdout=PIPE, stderr=PIPE)
    except:
      print >> sys.stderr, 'WARNING: java does not seem to exist, required for closure compiler. -O2 and above will fail. You need to define JAVA in ~/.emscripten (see settings.py)'

    if not os.path.exists(CLOSURE_COMPILER):
      print >> sys.stderr, 'WARNING: Closure compiler (%s) does not exist, check the paths in %s. -O2 and above will fail' % (CLOSURE_COMPILER, EM_CONFIG)

    # Sanity check passed!

    if not force:
      # Only create/update this file if the sanity check succeeded, i.e., we got here
      f = open(sanity_file, 'w')
      f.write('certified\n')
      f.close()

  except Exception, e:
    # Any error here is not worth failing on
    print 'WARNING: sanity check failed to run', e

# Tools/paths

CLANG_CC=os.path.expanduser(os.path.join(LLVM_ROOT, 'clang'))
CLANG_CPP=os.path.expanduser(os.path.join(LLVM_ROOT, 'clang++'))
CLANG=CLANG_CPP
LLVM_LINK=os.path.join(LLVM_ROOT, 'llvm-link')
LLVM_AR=os.path.join(LLVM_ROOT, 'llvm-ar')
LLVM_OPT=os.path.expanduser(os.path.join(LLVM_ROOT, 'opt'))
LLVM_AS=os.path.expanduser(os.path.join(LLVM_ROOT, 'llvm-as'))
LLVM_DIS=os.path.expanduser(os.path.join(LLVM_ROOT, 'llvm-dis'))
LLVM_NM=os.path.expanduser(os.path.join(LLVM_ROOT, 'llvm-nm'))
LLVM_INTERPRETER=os.path.expanduser(os.path.join(LLVM_ROOT, 'lli'))
LLVM_COMPILER=os.path.expanduser(os.path.join(LLVM_ROOT, 'llc'))
LLVM_EXTRACT=os.path.expanduser(os.path.join(LLVM_ROOT, 'llvm-extract'))
COFFEESCRIPT = path_from_root('tools', 'eliminator', 'node_modules', 'coffee-script', 'bin', 'coffee')

EMSCRIPTEN = path_from_root('emscripten.py')
DEMANGLER = path_from_root('third_party', 'demangler.py')
NAMESPACER = path_from_root('tools', 'namespacer.py')
EMCC = path_from_root('emcc')
EMXX = path_from_root('em++')
EMAR = path_from_root('emar')
EMRANLIB = path_from_root('emranlib')
EMLIBTOOL = path_from_root('emlibtool')
EMCONFIG = path_from_root('em-config')
EMMAKEN = path_from_root('tools', 'emmaken.py')
AUTODEBUGGER = path_from_root('tools', 'autodebugger.py')
BINDINGS_GENERATOR = path_from_root('tools', 'bindings_generator.py')
EXEC_LLVM = path_from_root('tools', 'exec_llvm.py')
VARIABLE_ELIMINATOR = path_from_root('tools', 'eliminator', 'eliminator.coffee')
JS_OPTIMIZER = path_from_root('tools', 'js-optimizer.js')
FILE_PACKAGER = path_from_root('tools', 'file_packager.py')

# Temp dir. Create a random one, unless EMCC_DEBUG is set, in which case use TEMP_DIR/emscripten_temp

try:
  TEMP_DIR
except:
  print >> sys.stderr, 'TEMP_DIR not defined in ~/.emscripten, using /tmp'
  TEMP_DIR = '/tmp'

CANONICAL_TEMP_DIR = os.path.join(TEMP_DIR, 'emscripten_temp')
EMSCRIPTEN_TEMP_DIR = None

if os.environ.get('EMCC_DEBUG'):
  try:
    EMSCRIPTEN_TEMP_DIR = CANONICAL_TEMP_DIR
    if not os.path.exists(EMSCRIPTEN_TEMP_DIR):
      os.makedirs(EMSCRIPTEN_TEMP_DIR)
  except:
    print >> sys.stderr, 'Could not create canonical temp dir. Check definition of TEMP_DIR in ~/.emscripten'

if not EMSCRIPTEN_TEMP_DIR:
  EMSCRIPTEN_TEMP_DIR = tempfile.mkdtemp(prefix='emscripten_temp_')
  def clean_temp():
    try_delete(EMSCRIPTEN_TEMP_DIR)
  atexit.register(clean_temp)

# EM_CONFIG stuff

try:
  JS_ENGINES
except:
  try:
    JS_ENGINES = [JS_ENGINE]
  except Exception, e:
    print 'ERROR: %s does not seem to have JS_ENGINES or JS_ENGINE set up' % EM_CONFIG
    raise

try:
  CLOSURE_COMPILER
except:
  CLOSURE_COMPILER = path_from_root('third_party', 'closure-compiler', 'compiler.jar')

try:
  JAVA
except:
  print >> sys.stderr, 'JAVA not defined in ~/.emscripten, using "java"'
  JAVA = 'java'

# Additional compiler options

try:
  COMPILER_OPTS # Can be set in EM_CONFIG, optionally
except:
  COMPILER_OPTS = []
# Force a simple, standard target as much as possible: target 32-bit linux, and disable various flags that hint at other platforms
COMPILER_OPTS = COMPILER_OPTS + ['-m32', '-U__i386__', '-U__x86_64__', '-U__i386', '-U__x86_64', '-U__SSE__', '-U__SSE2__', '-U__MMX__',
                                 '-UX87_DOUBLE_ROUNDING', '-UHAVE_GCC_ASM_FOR_X87', '-DEMSCRIPTEN', '-U__STRICT_ANSI__', '-U__CYGWIN__',
                                 '-D__STDC__', '-Xclang', '-triple=i386-pc-linux-gnu', '-D__IEEE_LITTLE_ENDIAN']


USE_EMSDK = not os.environ.get('EMMAKEN_NO_SDK')

if USE_EMSDK:
  # Disable system C and C++ include directories, and add our own (using -idirafter so they are last, like system dirs, which
  # allows projects to override them)
  # Note that -nostdinc++ is not needed, since -nostdinc implies that!
  EMSDK_OPTS = ['-nostdinc', '-Xclang', '-nobuiltininc', '-Xclang', '-nostdsysteminc',
    '-Xclang', '-isystem' + path_from_root('system', 'local', 'include'),
    '-Xclang', '-isystem' + path_from_root('system', 'include'),
    '-Xclang', '-isystem' + path_from_root('system', 'include', 'emscripten'),
    '-Xclang', '-isystem' + path_from_root('system', 'include', 'bsd'), # posix stuff
    '-Xclang', '-isystem' + path_from_root('system', 'include', 'libc'),
    '-Xclang', '-isystem' + path_from_root('system', 'include', 'libcxx'),
    '-Xclang', '-isystem' + path_from_root('system', 'include', 'gfx'),
    '-Xclang', '-isystem' + path_from_root('system', 'include', 'net'),
    '-Xclang', '-isystem' + path_from_root('system', 'include', 'SDL'),
  ] + [
    '-U__APPLE__', '-U__linux__'
  ]
  COMPILER_OPTS += EMSDK_OPTS
else:
  EMSDK_OPTS = []

# Engine tweaks

try:
  if 'gcparam' not in str(SPIDERMONKEY_ENGINE):
    if type(SPIDERMONKEY_ENGINE) is str:
      SPIDERMONKEY_ENGINE = [SPIDERMONKEY_ENGINE]
    SPIDERMONKEY_ENGINE += ['-e', "gcparam('maxBytes', 1024*1024*1024);"] # Our very large files need lots of gc heap
except NameError:
  pass

WINDOWS = sys.platform.startswith('win')

# If we have 'env', we should use that to find python, because |python| may fail while |env python| may work
# (For example, if system python is 3.x while we need 2.x, and env gives 2.x if told to do so.)
ENV_PREFIX = []
if not WINDOWS:
  try:
    assert 'Python' in Popen(['env', 'python', '-V'], stdout=PIPE, stderr=STDOUT).communicate()[0]
    ENV_PREFIX = ['env']
  except:
    pass

# Temp file utilities

def try_delete(filename):
  try:
    os.unlink(filename)
  except:
    try:
      shutil.rmtree(filename)
    except:
      pass

class TempFiles:
  def __init__(self):
    self.to_clean = []

  def note(self, filename):
    self.to_clean.append(filename)

  def get(self, suffix):
    """Returns a named temp file  with the given prefix."""
    named_file = tempfile.NamedTemporaryFile(dir=TEMP_DIR, suffix=suffix, delete=False)
    self.note(named_file.name)
    return named_file

  def clean(self):
    for filename in self.to_clean:
      try_delete(filename)
    self.to_clean = []

  def run_and_clean(self, func):
    try:
      func()
    finally:
      self.clean()

# Utilities

def check_engine(engine):
  # TODO: we call this several times, perhaps cache the results?
  try:
    if not CONFIG_FILE:
      return True # config stored directly in EM_CONFIG => skip engine check
    return 'hello, world!' in run_js(path_from_root('tests', 'hello_world.js'), engine)
  except Exception, e:
    print 'Checking JS engine %s failed. Check %s. Details: %s' % (str(engine), EM_CONFIG, str(e))
    return False

def timeout_run(proc, timeout, note='unnamed process'):
  start = time.time()
  if timeout is not None:
    while time.time() - start < timeout and proc.poll() is None:
      time.sleep(0.1)
    if proc.poll() is None:
      proc.kill() # XXX bug: killing emscripten.py does not kill it's child process!
      raise Exception("Timed out: " + note)
  return proc.communicate()[0]

EM_DEBUG = os.environ.get('EM_DEBUG')

def run_js(filename, engine=None, args=[], check_timeout=False, stdout=PIPE, stderr=None, cwd=None):
  if engine is None: engine = JS_ENGINES[0]
  if type(engine) is not list: engine = [engine]
  command = engine + [filename] + (['--'] if 'd8' in engine[0] else []) + args
  if EM_DEBUG: print >> sys.stderr, 'run_js: ' + ' '.join(command)
  return timeout_run(Popen(command, stdout=stdout, stderr=stderr, cwd=cwd), 15*60 if check_timeout else None, 'Execution')

def to_cc(cxx):
  # By default, LLVM_GCC and CLANG are really the C++ versions. This gets an explicit C version
  return cxx.replace('clang++', 'clang').replace('g++', 'gcc')

def line_splitter(data):
  """Silly little tool to split JSON arrays over many lines."""

  out = ''
  counter = 0

  for i in range(len(data)):
    out += data[i]
    if data[i] == ' ' and counter > 60:
      out += '\n'
      counter = 0
    else:
      counter += 1

  return out

def limit_size(string, MAX=80*20):
  if len(string) < MAX: return string
  return string[0:MAX/2] + '\n[..]\n' + string[-MAX/2:]

def read_pgo_data(filename):
  '''
    Reads the output of PGO and generates proper information for CORRECT_* == 2 's *_LINES options
  '''
  signs_lines = []
  overflows_lines = []

  for line in open(filename, 'r'):
    try:
      if line.rstrip() == '': continue
      if '%0 failures' in line: continue
      left, right = line.split(' : ')
      signature = left.split('|')[1]
      if 'Sign' in left:
        signs_lines.append(signature)
      elif 'Overflow' in left:
        overflows_lines.append(signature)
    except:
      pass

  return {
    'signs_lines': signs_lines,
    'overflows_lines': overflows_lines
  }

# Settings. A global singleton. Not pretty, but nicer than passing |, settings| everywhere

class Settings:
  @classmethod
  def reset(self):
    class Settings2:
      QUANTUM_SIZE = 4
      reset = Settings.reset

      # Given some emcc-type args (-O3, -s X=Y, etc.), fill Settings with the right settings
      @classmethod
      def load(self, args=[]):
        # Load the JS defaults into python
        settings = open(path_from_root('src', 'settings.js')).read().replace('var ', 'Settings.').replace('//', '#')
        exec settings in globals()

        # Apply additional settings. First -O, then -s
        for i in range(len(args)):
          if args[i].startswith('-O'):
            level = eval(args[i][2])
            Settings.apply_opt_level(level)
        for i in range(len(args)):
          if args[i] == '-s':
            exec 'Settings.' + args[i+1] in globals() # execute the setting

      # Transforms the Settings information into emcc-compatible args (-s X=Y, etc.). Basically
      # the reverse of load_settings, except for -Ox which is relevant there but not here
      @classmethod
      def serialize(self):
        ret = []
        for key, value in Settings.__dict__.iteritems():
          if key == key.upper(): # this is a hack. all of our settings are ALL_CAPS, python internals are not
            jsoned = json.dumps(value)
            ret += ['-s', key + '=' + jsoned]
        return ret

      @classmethod
      def apply_opt_level(self, opt_level, noisy=False):
        if opt_level >= 1:
          Settings.ASSERTIONS = 0
          Settings.DISABLE_EXCEPTION_CATCHING = 1
        if opt_level >= 2:
          Settings.RELOOP = 1
        if opt_level >= 3:
          Settings.INLINING_LIMIT = 0
          Settings.DOUBLE_MODE = 0
          Settings.PRECISE_I64_MATH = 0
          Settings.CORRECT_SIGNS = 0
          Settings.CORRECT_OVERFLOWS = 0
          Settings.CORRECT_ROUNDINGS = 0
          if noisy: print >> sys.stderr, 'Warning: Applying some potentially unsafe optimizations! (Use -O2 if this fails.)'

    global Settings
    Settings = Settings2
    Settings.load() # load defaults

Settings.reset()

# Building

class Building:
  COMPILER = CLANG
  LLVM_OPTS = False
  COMPILER_TEST_OPTS = [] # For use of the test runner

  @staticmethod
  def get_building_env():
    env = os.environ.copy()
    env['CC'] = EMCC if not WINDOWS else 'python %r' % EMCC
    env['CXX'] = EMXX if not WINDOWS else 'python %r' % EMXX
    env['AR'] = EMAR if not WINDOWS else 'python %r' % EMAR
    env['LD'] = EMCC if not WINDOWS else 'python %r' % EMCC
    env['RANLIB'] = EMRANLIB if not WINDOWS else 'python %r' % EMRANLIB
    #env['LIBTOOL'] = EMLIBTOOL if not WINDOWS else 'python %r' % EMLIBTOOL
    env['EMMAKEN_COMPILER'] = Building.COMPILER
    env['EMSCRIPTEN_TOOLS'] = path_from_root('tools')
    env['CFLAGS'] = env['EMMAKEN_CFLAGS'] = ' '.join(Building.COMPILER_TEST_OPTS)
    env['HOST_CC'] = CLANG_CC
    env['HOST_CXX'] = CLANG_CPP
    env['HOST_CFLAGS'] = "-W" #if set to nothing, CFLAGS is used, which we don't want
    env['HOST_CXXFLAGS'] = "-W" #if set to nothing, CXXFLAGS is used, which we don't want
    env['PKG_CONFIG_LIBDIR'] = path_from_root('system', 'local', 'lib', 'pkgconfig') + os.path.pathsep + path_from_root('system', 'lib', 'pkgconfig')
    env['PKG_CONFIG_PATH'] = os.environ.get ('EM_PKG_CONFIG_PATH') or ''
    return env

  @staticmethod
  def handle_CMake_toolchain(args, env):
    CMakeToolchain = ('''# the name of the target operating system
SET(CMAKE_SYSTEM_NAME Linux)

# which C and C++ compiler to use
SET(CMAKE_C_COMPILER   %(winfix)s$EMSCRIPTEN_ROOT/emcc)
SET(CMAKE_CXX_COMPILER %(winfix)s$EMSCRIPTEN_ROOT/em++)
SET(CMAKE_AR           %(winfix)s$EMSCRIPTEN_ROOT/emar)
SET(CMAKE_RANLIB       %(winfix)s$EMSCRIPTEN_ROOT/emranlib)
SET(CMAKE_C_FLAGS      $CFLAGS)
SET(CMAKE_CXX_FLAGS    $CXXFLAGS)

# here is the target environment located
SET(CMAKE_FIND_ROOT_PATH  $EMSCRIPTEN_ROOT/system/include )

# adjust the default behaviour of the FIND_XXX() commands:
# search headers and libraries in the target environment, search
# programs in the host environment
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE BOTH)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)''' % { 'winfix': '' if not WINDOWS else 'python ' }) \
      .replace('$EMSCRIPTEN_ROOT', path_from_root('').replace('\\', '/')) \
      .replace('$CFLAGS', env['CFLAGS']) \
      .replace('$CXXFLAGS', env['CFLAGS'])
    toolchainFile = mkstemp(suffix='.txt')[1]
    open(toolchainFile, 'w').write(CMakeToolchain)
    args.append('-DCMAKE_TOOLCHAIN_FILE=%s' % os.path.abspath(toolchainFile))
    return args

  @staticmethod
  def configure(args, stdout=None, stderr=None, env=None):
    if env is None:
      env = Building.get_building_env()
    env['EMMAKEN_JUST_CONFIGURE'] = '1'
    if 'cmake' in args[0]:
      args = Building.handle_CMake_toolchain(args, env)
    Popen(args, stdout=stdout, stderr=stderr, env=env).communicate()
    del env['EMMAKEN_JUST_CONFIGURE']

  @staticmethod
  def make(args, stdout=None, stderr=None, env=None):
    if env is None:
      env = Building.get_building_env()
    Popen(args, stdout=stdout, stderr=stderr, env=env).communicate()

  @staticmethod
  def build_library(name, build_dir, output_dir, generated_libs, configure=['sh', './configure'], configure_args=[], make=['make'], make_args=['-j', '2'], cache=None, cache_name=None, copy_project=False, env_init={}, source_dir=None):
    ''' Build a library into a .bc file. We build the .bc file once and cache it for all our tests. (We cache in
        memory since the test directory is destroyed and recreated for each test. Note that we cache separately
        for different compilers).
        This cache is just during the test runner. There is a different concept of caching as well, see |Cache|. '''

    if type(generated_libs) is not list: generated_libs = [generated_libs]
    if source_dir is None: source_dir = path_from_root('tests', name)

    temp_dir = build_dir
    if copy_project:
      project_dir = os.path.join(temp_dir, name)
      if os.path.exists(project_dir):
        shutil.rmtree(project_dir)
      shutil.copytree(source_dir, project_dir) # Useful in debugging sometimes to comment this out, and two lines above
    else:
      project_dir = build_dir
    try:
      old_dir = os.getcwd()
    except:
      old_dir = None
    os.chdir(project_dir)
    generated_libs = map(lambda lib: os.path.join(project_dir, lib), generated_libs)
    #for lib in generated_libs:
    #  try:
    #    os.unlink(lib) # make sure compilation completed successfully
    #  except:
    #    pass
    env = Building.get_building_env()
    for k, v in env_init.iteritems():
      env[k] = v
    if configure: # Useful in debugging sometimes to comment this out (and the lines below up to and including the |link| call)
      Building.configure(configure + configure_args, stdout=open(os.path.join(project_dir, 'configure_'), 'w'),
                                                     stderr=open(os.path.join(project_dir, 'configure_err'), 'w'), env=env)
    for i in range(2): # workaround for some build systems that need to be run twice to succeed (e.g. poppler)
      Building.make(make + make_args, stdout=open(os.path.join(project_dir, 'make_' + str(i)), 'w'),
                                      stderr=open(os.path.join(project_dir, 'make_err' + str(i)), 'w'), env=env)
      try:
        if cache is not None:
          cache[cache_name] = []
          for f in generated_libs:
            basename = os.path.basename(f)
            cache[cache_name].append((basename, open(f, 'rb').read()))
        break
      except:
        if i > 0: raise Exception('could not build library ' + name)
    if old_dir:
      os.chdir(old_dir)
    return generated_libs

  @staticmethod
  def link(files, target, remove_duplicates=False):
    actual_files = []
    unresolved_symbols = set(['main']) # tracking unresolveds is necessary for .a linking, see below. (and main is always a necessary symbol)
    resolved_symbols = set()
    temp_dir = None
    for f in files:
      if not Building.is_ar(f):
        if Building.is_bitcode(f):
          new_symbols = Building.llvm_nm(f)
          resolved_symbols = resolved_symbols.union(new_symbols.defs)
          unresolved_symbols = unresolved_symbols.union(new_symbols.undefs.difference(resolved_symbols)).difference(new_symbols.defs)
          actual_files.append(f)
      else:
        # Extract object files from ar archives, and link according to gnu ld semantics
        # (link in an entire .o from the archive if it supplies symbols still unresolved)
        cwd = os.getcwd()
        try:
          temp_dir = os.path.join(EMSCRIPTEN_TEMP_DIR, 'ar_output_' + str(os.getpid()))
          if not os.path.exists(temp_dir):
            os.makedirs(temp_dir)
          os.chdir(temp_dir)
          contents = filter(lambda x: len(x) > 0, Popen([LLVM_AR, 't', f], stdout=PIPE).communicate()[0].split('\n'))
          if len(contents) == 0:
            print >> sys.stderr, 'Warning: Archive %s appears to be empty (recommendation: link an .so instead of .a)' % f
          else:
            for content in contents: # ar will silently fail if the directory for the file does not exist, so make all the necessary directories
              dirname = os.path.dirname(content)
              if dirname and not os.path.exists(dirname):
                os.makedirs(dirname)
            Popen([LLVM_AR, 'x', f], stdout=PIPE).communicate() # if absolute paths, files will appear there. otherwise, in this directory
            contents = map(lambda content: os.path.join(temp_dir, content), contents)
            contents = filter(os.path.exists, map(os.path.abspath, contents))
            needed = False # We add or do not add the entire archive. We let llvm dead code eliminate parts we do not need, instead of
                           # doing intra-dependencies between archive contents
            for content in contents:
              new_symbols = Building.llvm_nm(content)
              # Link in the .o if it provides symbols, *or* this is a singleton archive (which is apparently an exception in gcc ld)
              if new_symbols.defs.intersection(unresolved_symbols) or len(files) == 1:
                needed = True
            if needed:
              for content in contents:
                if Building.is_bitcode(content):
                  new_symbols = Building.llvm_nm(content)
                  resolved_symbols = resolved_symbols.union(new_symbols.defs)
                  unresolved_symbols = unresolved_symbols.union(new_symbols.undefs.difference(resolved_symbols)).difference(new_symbols.defs)
                  actual_files.append(content)
        finally:
          os.chdir(cwd)
    try_delete(target)

    if remove_duplicates:
      # Remove duplicate symbols. This is a workaround for how we compile .a files, we try to
      # emulate ld behavior which is permissive TODO: cache llvm-nm results
      seen_symbols = set()
      print >> sys.stderr, actual_files
      for actual in actual_files:
        symbols = Building.llvm_nm(actual)
        dupes = seen_symbols.intersection(symbols.defs)
        if len(dupes) > 0:
          print >> sys.stderr, 'emcc: warning: removing duplicates in', actual
          for dupe in dupes:
            print >> sys.stderr, 'emcc: warning: removing duplicate', dupe
            Popen([LLVM_EXTRACT, actual, '-delete', '-glob=' + dupe, '-o', actual], stderr=PIPE).communicate()
            Popen([LLVM_EXTRACT, actual, '-delete', '-func=' + dupe, '-o', actual], stderr=PIPE).communicate()
          Popen([LLVM_EXTRACT, actual, '-delete', '-glob=.str', '-o', actual], stderr=PIPE).communicate() # garbage that appears here
        seen_symbols = seen_symbols.union(symbols.defs)

    # Finish link
    output = Popen([LLVM_LINK] + actual_files + ['-o', target], stdout=PIPE).communicate()[0]
    assert os.path.exists(target) and (output is None or 'Could not open input file' not in output), 'Linking error: ' + output + '\nemcc: If you get duplicate symbol errors, try --remove-duplicates'
    if temp_dir:
      try_delete(temp_dir)

  # Emscripten optimizations that we run on the .ll file
  @staticmethod
  def ll_opts(filename):
    ## Remove target info. This helps LLVM opts, if we run them later
    #cleaned = filter(lambda line: not line.startswith('target datalayout = ') and not line.startswith('target triple = '),
    #                 open(filename + '.o.ll', 'r').readlines())
    #os.unlink(filename + '.o.ll')
    #open(filename + '.o.ll.orig', 'w').write(''.join(cleaned))
    pass

  # LLVM optimizations
  # @param opt Either an integer, in which case it is the optimization level (-O1, -O2, etc.), or a list of raw
  #            optimization passes passed to llvm opt
  @staticmethod
  def llvm_opt(filename, opts):
    if type(opts) is int:
      opts = Building.pick_llvm_opts(opts)
    output = Popen([LLVM_OPT, filename] + opts + ['-o=' + filename + '.opt.bc'], stdout=PIPE).communicate()[0]
    assert os.path.exists(filename + '.opt.bc'), 'Failed to run llvm optimizations: ' + output
    shutil.move(filename + '.opt.bc', filename)

  @staticmethod
  def llvm_opts(filename): # deprecated version, only for test runner. TODO: remove
    if Building.LLVM_OPTS:
      shutil.move(filename + '.o', filename + '.o.pre')
      output = Popen([LLVM_OPT, filename + '.o.pre'] + Building.LLVM_OPT_OPTS + ['-o=' + filename + '.o'], stdout=PIPE).communicate()[0]
      assert os.path.exists(filename + '.o'), 'Failed to run llvm optimizations: ' + output

  @staticmethod
  def llvm_dis(input_filename, output_filename=None):
    # LLVM binary ==> LLVM assembly
    if output_filename is None:
      # use test runner conventions
      output_filename = input_filename + '.o.ll'
      input_filename = input_filename + '.o'
    try_delete(output_filename)
    output = Popen([LLVM_DIS, input_filename, '-o=' + output_filename], stdout=PIPE).communicate()[0]
    assert os.path.exists(output_filename), 'Could not create .ll file: ' + output
    return output_filename

  @staticmethod
  def llvm_as(input_filename, output_filename=None):
    # LLVM assembly ==> LLVM binary
    if output_filename is None:
      # use test runner conventions
      output_filename = input_filename + '.o'
      input_filename = input_filename + '.o.ll'
    try_delete(output_filename)
    output = Popen([LLVM_AS, input_filename, '-o=' + output_filename], stdout=PIPE).communicate()[0]
    assert os.path.exists(output_filename), 'Could not create bc file: ' + output
    return output_filename

  @staticmethod
  def llvm_nm(filename, stdout=PIPE, stderr=None):
    # LLVM binary ==> list of symbols
    output = Popen([LLVM_NM, filename], stdout=stdout, stderr=stderr).communicate()[0]
    class ret:
      defs = []
      undefs = []
      commons = []
    for line in output.split('\n'):
      if len(line) == 0: continue
      parts = filter(lambda seg: len(seg) > 0, line.split(' '))
      if len(parts) == 2: # ignore lines with absolute offsets, these are not bitcode anyhow (e.g. |00000630 t d_source_name|)
        status, symbol = parts
        if status == 'U':
          ret.undefs.append(symbol)
        elif status != 'C':
          ret.defs.append(symbol)
        else:
          ret.commons.append(symbol)
    ret.defs = set(ret.defs)
    ret.undefs = set(ret.undefs)
    ret.commons = set(ret.commons)
    return ret

  @staticmethod
  def emcc(filename, args=[], output_filename=None, stdout=None, stderr=None, env=None):
    if output_filename is None:
      output_filename = filename + '.o'
    try_delete(output_filename)
    Popen(ENV_PREFIX + ['python', EMCC, filename] + args + ['-o', output_filename], stdout=stdout, stderr=stderr, env=env).communicate()
    assert os.path.exists(output_filename), 'emcc could not create output file'

  @staticmethod
  def emar(action, output_filename, filenames, stdout=None, stderr=None, env=None):
    try_delete(output_filename)
    Popen(ENV_PREFIX + ['python', EMAR, action, output_filename] + filenames, stdout=stdout, stderr=stderr, env=env).communicate()
    if 'c' in action:
      assert os.path.exists(output_filename), 'emar could not create output file'

  @staticmethod
  def emscripten(filename, append_ext=True, extra_args=[]):
    # Allow usage of emscripten.py without warning
    os.environ['EMSCRIPTEN_SUPPRESS_USAGE_WARNING'] = '1'

    # Run Emscripten
    settings = Settings.serialize()
    compiler_output = timeout_run(Popen(ENV_PREFIX + ['python', EMSCRIPTEN, filename + ('.o.ll' if append_ext else ''), '-o', filename + '.o.js'] + settings + extra_args, stdout=PIPE), None, 'Compiling')
    #print compiler_output

    # Detect compilation crashes and errors
    if compiler_output is not None and 'Traceback' in compiler_output and 'in test_' in compiler_output: print compiler_output; assert 0
    assert os.path.exists(filename + '.o.js') and len(open(filename + '.o.js', 'r').read()) > 0, 'Emscripten failed to generate .js: ' + str(compiler_output)

    return filename + '.o.js'

  @staticmethod
  def can_build_standalone():
    return not Settings.BUILD_AS_SHARED_LIB and not Settings.LINKABLE

  @staticmethod
  def can_use_unsafe_opts():
    return Settings.USE_TYPED_ARRAYS == 2

  @staticmethod
  def can_inline():
    return Settings.INLINING_LIMIT == 0

  @staticmethod
  def pick_llvm_opts(optimization_level):
    '''
      It may be safe to use nonportable optimizations (like -OX) if we remove the platform info from the .ll
      (which we do in do_ll_opts) - but even there we have issues (even in TA2) with instruction combining
      into i64s. In any case, the handpicked ones here should be safe and portable. They are also tuned for
      things that look useful.

      An easy way to see LLVM's standard list of passes is

        llvm-as < /dev/null | opt -std-compile-opts -disable-output -debug-pass=Arguments
    '''
    assert 0 <= optimization_level <= 3
    unsafe = Building.can_use_unsafe_opts()
    opts = []
    if optimization_level > 0:
      if unsafe:
        if not Building.can_inline():
          opts.append('-disable-inlining')
        if not Building.can_build_standalone():
          # -O1 does not have -gobaldce, which removes stuff that is needed for libraries and linkables
          optimization_level = min(1, optimization_level)
        opts.append('-O%d' % optimization_level)
        #print '[unsafe: %s]' % ','.join(opts)
      else:
        allow_nonportable = False
        optimize_size = True
        use_aa = False

        # PassManagerBuilder::populateModulePassManager
        if allow_nonportable and use_aa: # ammo.js results indicate this can be nonportable
          opts.append('-tbaa')
          opts.append('-basicaa') # makes fannkuch slow but primes fast

        if Building.can_build_standalone():
          opts.append('-internalize')

        opts.append('-globalopt')
        opts.append('-ipsccp')
        opts.append('-deadargelim')
        if allow_nonportable: opts.append('-instcombine')
        opts.append('-simplifycfg')

        opts.append('-prune-eh')
        if Building.can_inline(): opts.append('-inline')
        opts.append('-functionattrs')
        if optimization_level > 2:
          opts.append('-argpromotion')

        # XXX Danger: Can turn a memcpy into something that violates the
        #             load-store consistency hypothesis. See hashnum() in Lua.
        #             Note: this opt is of great importance for raytrace...
        if allow_nonportable: opts.append('-scalarrepl')

        if allow_nonportable: opts.append('-early-cse') # ?
        opts.append('-simplify-libcalls')
        opts.append('-jump-threading')
        if allow_nonportable: opts.append('-correlated-propagation') # ?
        opts.append('-simplifycfg')
        if allow_nonportable: opts.append('-instcombine')

        opts.append('-tailcallelim')
        opts.append('-simplifycfg')
        opts.append('-reassociate')
        opts.append('-loop-rotate')
        opts.append('-licm')
        opts.append('-loop-unswitch') # XXX should depend on optimize_size
        if allow_nonportable: opts.append('-instcombine')
        if Settings.QUANTUM_SIZE == 4: opts.append('-indvars') # XXX this infinite-loops raytrace on q1 (loop in |new node_t[count]| has 68 hardcoded &not fixed)
        if allow_nonportable: opts.append('-loop-idiom') # ?
        opts.append('-loop-deletion')
        opts.append('-loop-unroll')

        ##### not in llvm-3.0. but have |      #addExtensionsToPM(EP_LoopOptimizerEnd, MPM);| if allow_nonportable: opts.append('-instcombine')

        # XXX Danger: Messes up Lua output for unknown reasons
        #             Note: this opt is of minor importance for raytrace...
        if optimization_level > 1 and allow_nonportable: opts.append('-gvn')

        opts.append('-memcpyopt') # Danger?
        opts.append('-sccp')

        if allow_nonportable: opts.append('-instcombine')
        opts.append('-jump-threading')
        opts.append('-correlated-propagation')
        opts.append('-dse')
        #addExtensionsToPM(EP_ScalarOptimizerLate, MPM);

        opts.append('-adce')
        opts.append('-simplifycfg')
        if allow_nonportable: opts.append('-instcombine')

        opts.append('-strip-dead-prototypes')

        if Building.can_build_standalone():
          opts.append('-globaldce')

        if optimization_level > 1: opts.append('-constmerge')

    Building.LLVM_OPT_OPTS = opts
    return opts

  @staticmethod
  def js_optimizer(filename, passes):
    if not check_engine(NODE_JS):
      raise Exception('Node.js appears to be missing or broken, looked at: ' + str(NODE_JS))

    if type(passes) == str:
      passes = [passes]
    # XXX Disable crankshaft to work around v8 bug 1895
    output = Popen([NODE_JS, '--nocrankshaft', JS_OPTIMIZER, filename] + passes, stdout=PIPE).communicate()[0]
    assert len(output) > 0 and not output.startswith('Assertion failed'), 'Error in js optimizer: ' + output
    filename += '.jo.js'
    f = open(filename, 'w')
    f.write(output)
    f.close()
    return filename

  @staticmethod
  def eliminator(filename):
    if not check_engine(NODE_JS):
      raise Exception('Node.js appears to be missing or broken, looked at: ' + str(NODE_JS))

    coffee = path_from_root('tools', 'eliminator', 'node_modules', 'coffee-script', 'bin', 'coffee')
    eliminator = path_from_root('tools', 'eliminator', 'eliminator.coffee')
    input = open(filename, 'r').read()
    output = Popen([NODE_JS, coffee, eliminator, filename], stdout=PIPE).communicate()[0]
    assert len(output) > 0, 'Error in eliminator: ' + output
    filename += '.el.js'
    f = open(filename, 'w')
    f.write(output)
    f.close()
    return filename

  @staticmethod
  def closure_compiler(filename):
    if not os.path.exists(CLOSURE_COMPILER):
      raise Exception('Closure compiler appears to be missing, looked at: ' + str(CLOSURE_COMPILER))

    # Something like this (adjust memory as needed):
    #   java -Xmx1024m -jar CLOSURE_COMPILER --compilation_level ADVANCED_OPTIMIZATIONS --variable_map_output_file src.cpp.o.js.vars --js src.cpp.o.js --js_output_file src.cpp.o.cc.js
    args = [JAVA,
            '-Xmx1024m',
            '-jar', CLOSURE_COMPILER,
            '--compilation_level', 'ADVANCED_OPTIMIZATIONS',
            '--formatting', 'PRETTY_PRINT',
            #'--variable_map_output_file', filename + '.vars',
            '--js', filename, '--js_output_file', filename + '.cc.js']
    if os.environ.get('EMCC_CLOSURE_ARGS'):
      args += shlex.split(os.environ.get('EMCC_CLOSURE_ARGS'))
    process = Popen(args, stdout=PIPE, stderr=STDOUT)
    cc_output = process.communicate()[0]
    if process.returncode != 0 or not os.path.exists(filename + '.cc.js'):
      raise Exception('closure compiler error: ' + cc_output + ' (rc: %d)' % process.returncode)

    return filename + '.cc.js'

  _is_ar_cache = {}
  @staticmethod
  def is_ar(filename):
    try:
      if Building._is_ar_cache.get(filename):
        return Building._is_ar_cache[filename]
      b = open(filename, 'r').read(8)
      sigcheck = b[0] == '!' and b[1] == '<' and \
                 b[2] == 'a' and b[3] == 'r' and \
                 b[4] == 'c' and b[5] == 'h' and \
                 b[6] == '>' and ord(b[7]) == 10
      Building._is_ar_cache[filename] = sigcheck
      return sigcheck
    except:
      return False

  @staticmethod
  def is_bitcode(filename):
    # checks if a file contains LLVM bitcode
    # if the file doesn't exist or doesn't have valid symbols, it isn't bitcode
    try:
      defs = Building.llvm_nm(filename, stderr=PIPE)
      # If no symbols found, it might just be an empty bitcode file, try to dis it
      if len(defs.defs) + len(defs.undefs) + len(defs.commons) == 0:
        # llvm-nm 3.0 has a bug when reading symbols from ar files
        # so try to see if we're dealing with an ar file, in which
        # case we should try to dis it.
        if not Building.is_ar(filename):
          test_ll = os.path.join(EMSCRIPTEN_TEMP_DIR, 'test.ll')
          Building.llvm_dis(filename, test_ll)
          assert os.path.exists(test_ll)
    except:
      return False

    # look for magic signature
    b = open(filename, 'r').read(4)
    if b[0] == 'B' and b[1] == 'C':
      return True
    # look for ar signature
    elif Building.is_ar(filename):
      return True
    # on OS X, there is a 20-byte prefix
    elif ord(b[0]) == 222 and ord(b[1]) == 192 and ord(b[2]) == 23 and ord(b[3]) == 11:
      b = open(filename, 'r').read(24)
      return b[20] == 'B' and b[21] == 'C'

    return False

# Permanent cache for dlmalloc and stdlibc++
class Cache:
  dirname = os.environ.get('EM_CACHE')
  if not dirname:
    dirname = os.path.expanduser(os.path.join('~', '.emscripten_cache'))

  @staticmethod
  def erase():
    try:
      shutil.rmtree(Cache.dirname)
    except:
      pass

  # Request a cached file. If it isn't in the cache, it will be created with
  # the given creator function
  @staticmethod
  def get(shortname, creator):
    if not shortname.endswith('.bc'): shortname += '.bc'
    cachename = os.path.join(Cache.dirname, shortname)
    if os.path.exists(cachename):
      return cachename
    if not os.path.exists(Cache.dirname):
      os.makedirs(Cache.dirname)
    shutil.copyfile(creator(), cachename)
    return cachename

# Compression of code and data for smaller downloads
class Compression:
  on = False

  @staticmethod
  def compressed_name(filename):
    return filename + '.compress'

  @staticmethod
  def compress(filename):
    execute(Compression.encoder, stdin=open(filename, 'rb'), stdout=open(Compression.compressed_name(filename), 'wb'))

  @staticmethod
  def worth_it(original, compressed):
    return compressed < original - 1500 # save at least one TCP packet or so

def execute(cmd, *args, **kw):
  try:
    return subprocess.Popen(cmd, *args, **kw).communicate() # let compiler frontend print directly, so colors are saved (PIPE kills that)
  except:
    if not isinstance(cmd, str):
      cmd = ' '.join(cmd)
    print >> sys.stderr, 'Invoking Process failed: <<< ' + cmd + ' >>>'
    raise

def suffix(name):
  parts = name.split('.')
  if len(parts) > 1:
    return parts[-1]
  else:
    return None

def unsuffixed(name):
  return '.'.join(name.split('.')[:-1])

def unsuffixed_basename(name):
  return os.path.basename(unsuffixed(name))


# This file will be edited (the {{{ }}} things), and then ~/.emscripten created with the result, if ~/.emscripten doesn't exist.

# Note: If you put paths relative to the home directory, do not forget os.path.expanduser

import os

# this helps projects using emscripten find it
EMSCRIPTEN_ROOT = os.path.expanduser(os.getenv('EMSCRIPTEN') or '{{{ EMSCRIPTEN_ROOT }}}')
LLVM_ROOT = os.path.expanduser(os.getenv('LLVM') or '{{{ LLVM_ROOT }}}')

# See below for notes on which JS engine(s) you need
NODE_JS = '{{{ NODE }}}'
SPIDERMONKEY_ENGINE = [
  os.path.expanduser(os.getenv('SPIDERMONKEY') or 'js'), '-m', '-n']
V8_ENGINE = os.path.expanduser(os.getenv('V8') or 'd8')

JAVA = 'java'

TEMP_DIR = '/tmp' # You will need to modify this on Windows

#CLOSURE_COMPILER = '..' # define this to not use the bundled version

########################################################################################################


# Pick the JS engine to use for running the compiler. This engine must exist, or
# nothing can be compiled.
#
# Recommendation: If you already have node installed, use that. Otherwise, build v8 or
#                 spidermonkey from source. Any of these three is fine, as long as it's
#                 a recent version (especially for v8 and spidermonkey).

COMPILER_ENGINE = NODE_JS
#COMPILER_ENGINE = V8_ENGINE
#COMPILER_ENGINE = SPIDERMONKEY_ENGINE


# All JS engines to use when running the automatic tests. Not all the engines in this list
# must exist (if they don't, they will be skipped in the test runner).
#
# Recommendation: If you already have node installed, use that. If you can, also build
#                 spidermonkey from source as well to get more test coverage (node can't
#                 run all the tests due to node issue 1669). v8 is currently not recommended
#                 here because of v8 issue 1822.

JS_ENGINES = [NODE_JS, SPIDERMONKEY_ENGINE]


.. _Interacting-with-code:

========================================
Interacting with code (ready-for-review)
========================================


Emscripten provides numerous methods to connect and interact between JavaScript and compiled C or C++:

- Call compiled **C** functions from normal JavaScript:

	- Using :js:func:`ccall` or :js:func:`cwrap`.
	- Directly from JavaScript (faster but more complicated).
	
- Call JavaScript functions from **C/C++**:

	- Using :c:func:`emscripten_run_script`.
	- Using :c:type:`EM_ASM` (faster).
	- Implement a C API in JavaScript.
	- As function pointers from **C**.
	
- Call compiled **C++** classes from JavaScript using bindings created with:

	- :ref:`embind`.
	- :ref:`WebIDL-Binder`. *Embind* also supports calling JavaScript from the C++.


- Access compiled code memory from JavaScript.
- Affect execution behaviour.
- Access environment variables.

The JavaScript methods for calling compiled C functions are efficient, but cannot be used with name-mangled C++ functions. Both :ref:`embind` or :ref:`WebIDL-Binder` create bindings glue between C++ and JavaScript: *Embind* allows binding in both directions, while the more-efficient *WebIDL Binder* only supports calling compiled code from JavaScript. 

This article explains each of the methods, or provides links to more detailed information.

.. note:: For information on how compiled code interacts with the browser environment, see :ref:`Emscripten-Browser-Environment`. For file system related manners, see the :ref:`Filesystem-Guide`. 


Calling compiled C functions from JavaScript
============================================

The easiest way to call compiled C functions from JavaScript is to use :js:func:`ccall` or :js:func:`cwrap`. 

:js:func:`ccall` calls a compiled C function with specified parameters and returns the result, while :js:func:`cwrap` "wraps" a compiled C function and returns a JavaScript function you can call normally. :js:func:`cwrap` is therefore more useful if you plan to call a compiled function a number of times.

Consider the **tests/hello_function.cpp** file shown below. The ``int_sqrt()`` function to be compiled is wrapped in ``extern "C"`` to prevent C++ name mangling.

.. include:: ../../../../../tests/hello_function.cpp
	:literal:

To compile this code run the following command in the Emscripten home directory:

::

    ./emcc tests/hello_function.cpp -o function.html -s EXPORTED_FUNCTIONS="['_int_sqrt']"

After compiling, you can call this function with :js:func:`cwrap` using the following JavaScript: 

::

    int_sqrt = Module.cwrap('int_sqrt', 'number', ['number'])
    int_sqrt(12)
    int_sqrt(28)

The first parameter is the name of the function to be wrapped, the second is the return type of the function, then an array of parameter types (which may be omitted if there are no parameters). The types are native JavaScript types, "number" (for a C integer, float, or general pointer) or "string" (for a C ``char*`` that represents a string).

You can run this yourself by first opening the generated page **function.html** in a web browser (nothing will happen on page load because there is no ``main()``). Open a JavaScript environment (**Control-Shift-K** on Firefox, **Control-Shift-J** on Chrome), and enter the above commands as three separate commands, pressing **Enter** after each one. You should get the results ``3`` and ``5``, which are the correct output as the compiled function works on integers.

:js:func:`ccall` is similar, but receives another parameter with the parameters to pass to the function:

.. code-block:: javascript

	// Call C from JavaScript
	var result = Module.ccall('int_sqrt', // name of C function
		'number', // return type
		['number'], // argument types
		[28]); // arguments

	// result is 5

.. note::

	This example illustrates a few other points, which you should remember when using :js:func:`ccall` or :js:func:`cwrap`:

		-  These methods can be used with compiled **C** functions — name-mangled C++ functions won't work.
		-  We highly recommended that you *export* functions that are to be called from JavaScript:
		
			- Exporting is done at compile time. For example: ``-s EXPORTED_FUNCTIONS='["_main","_other_function"]'`` exports ``main()`` and ``other_function()``. You need ``_`` at the beginning of the function names in the ``EXPORTED_FUNCTIONS`` list.
			- Emscripten does :ref:`dead code elimination <faq-dead-code-elimination>` to minimize code size — exporting ensures the functions you need aren't removed.
			- At higher optimisation levels (``-O2`` and above), the :term:`closure compiler` runs and minifies (changes) function names. Exporting functions allows you to continue to access them using the original name through the global ``Module`` object.
			
		- Use ``Module.ccall`` and not ``ccall`` by itself. The former will work at all optimisation levels (even if the :term:`Closure Compiler` minifies the function names).
		

   
Call compiled C/C++ code "directly" from JavaScript
===================================================

Functions in the original source become JavaScript functions, so you can call them directly if you do type translations yourself — this will be faster than using :js:func:`ccall` or :js:func:`cwrap`, but a little more complicated. 

To call the method directly, you will need to use the full name as it appears in the generated code. This will be the same as the original C function, but with a leading ``_``.

.. note:: If you use :js:func:`ccall` or :js:func:`cwrap`, you do not need to prefix function calls with ``_`` — just use the C name.

The types of the parameters you pass to functions need to make sense. Integers and floating point values can be passed as is. Pointers are simply integers in the generated code.

Strings in JavaScript must be converted to pointers for compiled code — the relevant function is :js:func:`Pointer_stringify` which given a pointer returns a JavaScript string. Converting a JavaScript string ``someString`` to a pointer can be accomplished using :js:func:`allocate(intArrayFromString(someString), 'i8', ALLOC_STACK) <allocate>`.

.. note:: The conversion to a pointer allocates memory (that's the call to :js:func:`allocate` there), and in this case we allocate it on the stack (if you are called from a compiled function, it will rewind the stack for you; otherwise, you should do ``Runtime.stackSave()`` before and ``Runtime.stackRestore(..that value..)`` afterwards).

There are other convenience functions for converting strings and encodings in :ref:`preamble-js`.

.. todo:: **HamishW** Might be better to show the allocate above using _malloc, as allocate is an advanced API. We also need to better explain the note about stackRestore etc, or remove it - as it doesn't mean a lot to me.

Calling JavaScript from C/C++
=============================

Emscripten provides two main approaches for calling JavaScript from C/C++: running the script using :c:func:`emscripten_run_script` or writing "inline JavaScript".

The most direct, but slightly slower, way is to use :c:func:`emscripten_run_script`. This effectively runs the specified JavaScript code from C/C++ using ``eval()``. For example, to call the browser's ``alert()`` function with the text 'hi', you would call the following JavaScript: 

.. code-block:: javascript

	emscripten_run_script("alert('hi')");

.. note:: The function ``alert`` is present in browsers, but not in *node* or other JavaScript shells. An more generic alternative is to call :js:func:`Module.print`. 


A faster way to call JavaScript from C is to write "inline JavaScript", using :c:func:`EM_ASM` (and related macros). These are used in a similar manner to inline assembly code. The "alert" example above might be written using inline JavaScript as:

.. code-block:: c++

	#include <emscripten.h>
	
	int main() {
		EM_ASM(
			alert('hello world!');
			throw 'all done';
			);
		return 0;
	}

When compiled and run, Emscripten will execute the two lines of JavaScript as if they appeared directly in the generated code. The result would be an alert, followed by an exception. (Note, however, that under the hood Emscripten still does a function call even in this case, which has some amount of overhead.)

You can also send values from C into JavaScript inside :c:macro:`EM_ASM_`, as well as receive values back (see the :c:macro:`linked macro <EM_ASM_>` for details. For example, the following example will print out ``I received: 100`` and then ``101``.

.. code-block:: cpp

      int x = EM_ASM_INT({
        Module.print('I received: ' + $0);
        return $0 + 1;
      }, 100);
      printf("%d\n", x);

.. note:: 

	- You need to specify if the return value is an ``int`` or a ``double`` using the appropriate macro :c:macro:`EM_ASM_INT` or :c:macro:`EM_ASM_DOUBLE`.
	- The input values appear as ``$0``, ``$1``, etc.
	- ``return`` is used to provide the value sent from JavaScript back to C.
	- See how ``{, }`` are used here to enclose the code. This is necessary to differentiate the code from the arguments passed later which are the input values (this is how C macros work).
	- When using the :c:macro:`EM_ASM` macro, ensure that you only use single quotes('). Double quotes(") will cause a syntax error that is not detected by the compiler and is only shown when looking at a JavaScript console while running the offending code.


Implement a C API in JavaScript
===============================

It is possible to implement a C API in JavaScript! This is the approach that was used to write Emscripten's implementations of :term:`SDL` and *libc*.

You can use it to write your own APIs to call from C/C++. To do this you define the interface, decorating with ``extern`` to mark the methods in the API as external symbols. You then implement the symbols in JavaScript by simply adding their definition to `library.js <https://github.com/kripken/emscripten/blob/master/src/library.js>`_ (by default). When compiling the C code, the compiler looks in the JavaScript libraries for relevant external symbols. 

By default, the implementation is added to **library.js** (and this is where you'll find the Emscripten implementation of *libc*). You can put the JavaScript implementation in your own library file and add it using the :ref:`emcc option <emcc-js-library>` ``--js-library``. See `test_js_libraries <https://github.com/kripken/emscripten/blob/master/tests/test_core.py#L4800>`_ in **tests/test_other.py** for a complete working example, including the syntax you should use inside the JavaScript library file.

As a simple example, consider the case where you have some C code like this:

.. code-block:: c

    extern void my_js();

    int main() {
      my_js();
      return 1;
    }

.. note:: When using C++ you should encapsulate ``extern void my_js();`` in ``extern "C" {}`` block to prevent C++ name mangling:

	.. code-block:: cpp

		extern "C" {
		  extern void my_js();
		}

Then you can implement ``my_js`` in JavaScript by simply adding the implementation to **library.js** (or your own file). Like our other examples of calling JavaScript from C, the example below just launches the browser ``alert()``:

.. code-block:: javascript

       my_js: function() {
         alert('hi');
       },


See the `library_*.js <https://github.com/kripken/emscripten/tree/master/src>`_ files for other examples.

.. note:: 

	- JavaScript libraries can declare dependencies (``__deps``), however those are only for other JavaScript libraries. See examples in **library*.js**)
	- If a JavaScript library depends on a compiled C library (like most of *libc*), you must edit `src/deps_info.json <https://github.com/kripken/emscripten/blob/master/src/deps_info.json>`_. Search for "deps_info" in `tools/system_libs.py <https://github.com/kripken/emscripten/blob/master/tools/system_libs.py>`_.

Calling JavaScript functions as function pointers from C
========================================================

You can use ``Runtime.addFunction`` to return an integer value that represents a function pointer. Passing that integer to C code then lets it call that value as a function pointer, and the JavaScript function you sent to ``Runtime.addFunction`` will be called. 

See ``test_add_function`` in `tests/test_core.py <https://github.com/kripken/emscripten/blob/master/tests/test_core.py#L5904>`_ for an example.


Access memory from JavaScript
=============================

You can access memory using :js:func:`getValue(ptr, type) <getValue>` and :js:func:`setValue(ptr, value, type) <setValue>`. The first argument is a pointer (a number representing a memory address). ``type`` must be an LLVM IR type, one of ``i8``, ``i16``, ``i32``, ``i64``, ``float``, ``double`` or a pointer type like ``i8*`` (or just ``*``). 

There are example of these functions being used in the tests `here <https://github.com/kripken/emscripten/blob/master/tests/core/test_utf.in>`_ and `here <https://github.com/kripken/emscripten/blob/master/tests/test_core.py#L5704>`_.

.. note:: This is a lower-level operation than :js:func:`ccall` and :js:func:`cwrap` — we *do* need to care what specific type (e.g. integer) is being used.

You can also access memory 'directly' by manipulating the arrays that represent memory. This is not recommended unless you are sure you know what you are doing, and need the additional speed over :js:func:`getValue`/:js:func:`setValue`. 

A case where this might be required is if you want to import a large amount of data from JavaScript to be processed by compiled code. For example, the following code allocates a buffer, copies in some data, calls a C function to process the data, and finally frees the buffer. 

.. code-block:: javascript

	var buf = Module._malloc(myTypedArray.length*myTypedArray.BYTES_PER_ELEMENT);
	Module.HEAPU8.set(myTypedArray, buf);
	Module.ccall('my_function', 'number', ['number'], [buf]);
	Module._free(buf);

Here ``my_function`` is a C function that receives a single integer parameter (or a pointer, they are both just 32-bit integers for us) and returns an integer. This could be something like ``int my_function(char *buf)``.


Affect execution behaviour
==========================

``Module`` is a global JavaScript object, with attributes that Emscripten-generated code calls at various points in its execution. 

Developers provide an implementation of ``Module`` to control how notifications from Emscripten are displayed, which files that are loaded before the main loop is run, and a number other behaviours. For more information see :ref:`module`.


Environment variables
=====================

Sometimes compiled code needs to access environment variables (for instance, in C, by calling the ``getenv()`` function). Emscripten generated JavaScript cannot access the computer's environment variables directly, so a "virtualised" environment is provided. 

The JavaScript object ``ENV`` contains the virtualised environment variables, and by modifying it you can pass variables to your compiled code. Care must be taken to ensure that the ``ENV`` variable has been initialised by Emscripten before it is modified — using :js:attr:`Module.preRun` is a convenient way to do this. 

For example, to set an environment variable ``MY_FILE_ROOT`` to be ``"/usr/lib/test/"`` you could add the following JavaScript to your ``Module`` :ref:`setup code <module-creating>`:

.. code:: javascript

    Module.preRun.push(function() {ENV.MY_FILE_ROOT = "/usr/lib/test"})

	
WebIDL Binder
=============

The :ref:`WebIDL-Binder` is a tool to make C++ classes usable from JavaScript, as JavaScript classes.

The WebIDL binder is a fairly simple and lightweight approach to binding C++ to call from JavaScript. It was used to port Bullet Physics to the web in the `ammo.js <https://github.com/kripken/ammo.js/>`_ project.



Embind
======

:ref:`embind` is a tool to communicate between JavaScript and C++, in a C++-like manner. It is not as lightweight or as optimizable as Emscripten JavaScript libraries or the :ref:`WebIDL-Binder`, but it does allow communication in both directions between JavaScript and the C code.


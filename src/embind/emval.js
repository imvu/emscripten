/*global Module, Runtime*/
/*global HEAP32*/
/*global readLatin1String, writeStringToMemory*/
/*global requireRegisteredType, throwBindingError*/

var _emval_handle_array = [{}]; // reserve zero
var _emval_free_list = [];

// Public JS API

/** @expose */
Module.count_emval_handles = function() {
    var count = 0;
    for (var i = 1; i < _emval_handle_array.length; ++i) {
        if (_emval_handle_array[i] !== undefined) {
            ++count;
        }
    }
    return count;
};

/** @expose */
Module.get_first_emval = function() {
    for (var i = 1; i < _emval_handle_array.length; ++i) {
        if (_emval_handle_array[i] !== undefined) {
            return _emval_handle_array[i];
        }
    }
    return null;
};

// Private C++ API

var _emval_symbols = {}; // address -> string

function __emval_register_symbol(address) {
    _emval_symbols[address] = readLatin1String(address);
}

function getStringOrSymbol(address) {
    var symbol = _emval_symbols[address];
    if (symbol === undefined) {
        return readLatin1String(address);
    } else {
        return symbol;
    }
}

function requireHandle(handle) {
    if (!handle) {
        throwBindingError('Cannot use deleted val. handle = ' + handle);
    }
}

function __emval_register(value) {
    var handle = _emval_free_list.length ?
        _emval_free_list.pop() :
        _emval_handle_array.length;

    _emval_handle_array[handle] = {refcount: 1, value: value};
    return handle;
}

function __emval_incref(handle) {
    if (handle) {
        _emval_handle_array[handle].refcount += 1;
    }
}

function __emval_decref(handle) {
    if (handle && 0 === --_emval_handle_array[handle].refcount) {
        delete _emval_handle_array[handle];
        _emval_free_list.push(handle);

        var actual_length = _emval_handle_array.length;
        while (actual_length > 0 && _emval_handle_array[actual_length - 1] === undefined) {
            --actual_length;
        }
        _emval_handle_array.length = actual_length;
    }
}

function __emval_new_array() {
    return __emval_register([]);
}

function __emval_new_object() {
    return __emval_register({});
}

function __emval_undefined() {
    return __emval_register(undefined);
}

function __emval_null() {
    return __emval_register(null);
}

function __emval_new_cstring(v) {
    return __emval_register(getStringOrSymbol(v));
}

function __emval_take_value(type, v) {
    type = requireRegisteredType(type, '_emval_take_value');
    v = type.fromWireType(v);
    return __emval_register(v);
}

var __newers = {}; // arity -> function

function __emval_new(handle, argCount, argTypes) {
    requireHandle(handle);

    var args = parseParameters(
        argCount,
        argTypes,
        Array.prototype.slice.call(arguments, 3));

    // Alas, we are forced to use operator new until WebKit enables
    // constructing typed arrays without new.
    // In WebKit, Uint8Array(10) throws an error.
    // In every other browser, it's identical to new Uint8Array(10).

    var newer = __newers[argCount];
    if (!newer) {
        var parameters = new Array(argCount);
        for (var i = 0; i < argCount; ++i) {
            parameters[i] = 'a' + i;
        }
        /*jshint evil:true*/
        newer = __newers[argCount] = new Function(
            ['c'].concat(parameters),
            "return new c(" + parameters.join(',') + ");");
    }
    
    var constructor = _emval_handle_array[handle].value;
    var obj = newer.apply(undefined, [constructor].concat(args));
/*
    // implement what amounts to operator new
    function dummy(){}
    dummy.prototype = constructor.prototype;
    var obj = new constructor;
    var rv = constructor.apply(obj, args);
    if (typeof rv === 'object') {
        obj = rv;
    }
*/
    return __emval_register(obj);
}

// appease jshint (technically this code uses eval)
var global = (function(){return Function;})()('return this')();

function __emval_get_global(name) {
    name = getStringOrSymbol(name);
    return __emval_register(global[name]);
}

function __emval_get_module_property(name) {
    name = getStringOrSymbol(name);
    return __emval_register(Module[name]);
}

function __emval_get_property(handle, key) {
    requireHandle(handle);
    return __emval_register(_emval_handle_array[handle].value[_emval_handle_array[key].value]);
}

function __emval_set_property(handle, key, value) {
    requireHandle(handle);
    _emval_handle_array[handle].value[_emval_handle_array[key].value] = _emval_handle_array[value].value;
}

function __emval_as(handle, returnType) {
    requireHandle(handle);
    returnType = requireRegisteredType(returnType, 'emval::as');
    var destructors = [];
    // caller owns destructing
    return returnType.toWireType(destructors, _emval_handle_array[handle].value);
}

function parseParameters(argCount, argTypes, argWireTypes) {
    var a = new Array(argCount);
    for (var i = 0; i < argCount; ++i) {
        var argType = requireRegisteredType(
            HEAP32[(argTypes >> 2) + i],
            "parameter " + i);
        a[i] = argType.fromWireType(argWireTypes[i]);
    }
    return a;
}

function __emval_call(handle, argCount, argTypes) {
    requireHandle(handle);
    var fn = _emval_handle_array[handle].value;
    var args = parseParameters(
        argCount,
        argTypes,
        Array.prototype.slice.call(arguments, 3));
    var rv = fn.apply(undefined, args);
    return __emval_register(rv);
}

function lookupTypes(argCount, argTypes, argWireTypes) {
    var a = new Array(argCount);
    for (var i = 0; i < argCount; ++i) {
        a[i] = requireRegisteredType(
            HEAP32[(argTypes >> 2) + i],
            "parameter " + i);
    }
    return a;
}

function __emval_get_method_caller(argCount, argTypes) {
    var types = lookupTypes(argCount, argTypes);

    return Runtime.addFunction(function(handle, name) {
        requireHandle(handle);
        name = getStringOrSymbol(name);

        var args = new Array(argCount - 1);
        for (var i = 1; i < argCount; ++i) {
            args[i - 1] = types[i].fromWireType(arguments[1 + i]);
        }

        var obj = _emval_handle_array[handle].value;
        return types[0].toWireType([], obj[name].apply(obj, args));
    });
}

function __emval_has_function(handle, name) {
    name = getStringOrSymbol(name);
    return _emval_handle_array[handle].value[name] instanceof Function;
}

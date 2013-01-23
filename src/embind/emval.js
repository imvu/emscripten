/*global Module*/
/*global HEAP32*/
/*global Pointer_stringify, writeStringToMemory*/
/*global requireRegisteredType*/

var _emval_handle_array = [];
var _emval_free_list = [];

// Public JS API

/** @expose */
Module.count_emval_handles = function() {
    return _emval_handle_array.length;
};

// Private C++ API

function __emval_register(value) {
    var handle = _emval_free_list.length ?
        _emval_free_list.pop() :
        _emval_handle_array.length;

    _emval_handle_array[handle] = {refcount: 1, value: value};
    return handle;
}

function __emval_incref(handle) {
    _emval_handle_array[handle].refcount += 1;
}

function __emval_decref(handle) {
    if (0 === --_emval_handle_array[handle].refcount) {
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
    return __emval_register(Pointer_stringify(v));
}

function __emval_take_value(type, v) {
    type = requireRegisteredType(type, '_emval_take_value');
    v = type.fromWireType(v);
    return __emval_register(v);
}

var global = (function(){return Function;})()('return this')();

function __emval_get_global(name) {
    name = Pointer_stringify(name);
    return __emval_register(global[name]);
}

function __emval_get_property(handle, key) {
    return __emval_register(_emval_handle_array[handle].value[_emval_handle_array[key].value]);
}

function __emval_set_property(handle, key, value) {
    _emval_handle_array[handle].value[_emval_handle_array[key].value] = _emval_handle_array[value].value;
}

function __emval_as(handle, returnType) {
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
    var fn = _emval_handle_array[handle].value;
    var args = parseParameters(
        argCount,
        argTypes,
        Array.prototype.slice.call(arguments, 3));
    var rv = fn.apply(undefined, args);
    return __emval_register(rv);
}

function __emval_call_method(handle, name, argCount, argTypes) {
    name = Pointer_stringify(name);

    var args = parseParameters(
        argCount,
        argTypes,
        Array.prototype.slice.call(arguments, 4));
    var obj = _emval_handle_array[handle].value;
    var rv = obj[name].apply(obj, args);
    return __emval_register(rv);
}

function __emval_call_void_method(handle, name, argCount, argTypes) {
    name = Pointer_stringify(name);

    var args = parseParameters(
        argCount,
        argTypes,
        Array.prototype.slice.call(arguments, 4));
    var obj = _emval_handle_array[handle].value;
    obj[name].apply(obj, args);
}

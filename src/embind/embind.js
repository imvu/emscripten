/*global Module*/
/*global _malloc, _free, _memcpy*/
/*global FUNCTION_TABLE, HEAP32*/
/*global Pointer_stringify, writeStringToMemory*/
/*global __emval_register, _emval_handle_array, __emval_decref*/
/*global ___getDynamicPointerType: false*/
/*global ___dynamicPointerCast: false*/
/*global ___typeName:false*/
/*global ___staticPointerCast: false*/

function exposePublicSymbol(name, value) {
    if (Module.hasOwnProperty(name)) {
        throw new BindingError("Cannot register public name '" + name + "' twice");
    }
    Module[name] = value;
}

function createNamedFunction(name, body) {
    /*jshint evil:true*/
    return new Function(
        "body",
        "return function " + name + "() {\n" +
        "    return body.apply(this, arguments);\n" +
        "};\n"
    )(body);
}

function _embind_repr(v) {
    var t = typeof v;
    if (t === 'object' || t === 'array' || t === 'function') {
        return v.toString();
    } else {
        return '' + v;
    }
}

var typeRegistry = {};

function registerType(rawType, name, registeredInstance) {
    if (!rawType) {
        throw new BindingError('type "' + name + '" must have a positive integer typeid pointer');
    }
    if (typeRegistry.hasOwnProperty(rawType)) {
        throw new BindingError("Cannot register type '" + name + "' twice");
    }
    registeredInstance.rawType = rawType;
    registeredInstance.name = name;
    typeRegistry[rawType] = registeredInstance;
    return registeredInstance;
}

function requireRegisteredType(rawType, humanName) {
    var impl = typeRegistry[rawType];
    if (undefined === impl) {
        throw new BindingError(humanName + " has unknown type " + typeName(rawType));
    }
    return impl;
}

function typeName(rawType) {
    return Pointer_stringify(___typeName(rawType));
}

function requireArgumentTypes(argCount, rawArgTypes, name) {
    var argTypes = new Array(argCount);
    for (var i = 0; i < argCount; ++i) {
        var rawArgType = HEAP32[(rawArgTypes >> 2) + i];
        if (i === 0) {
            argTypes[i] = requireRegisteredType(rawArgType, name + " return value");
        } else {
            argTypes[i] = requireRegisteredType(rawArgType, name + " parameter " + i);
        }
    }
    return argTypes;
}

function RegisteredVoid() {
}

RegisteredVoid.prototype.fromWireType = function() {
    return undefined;
};

function __embind_register_void(rawType, name) {
    name = Pointer_stringify(name);
    registerType(rawType, name, new RegisteredVoid());
}

function RegisteredBool(trueValue, falseValue) {
    this.trueValue = trueValue;
    this.falseValue = falseValue;
}

RegisteredBool.prototype.toWireType = function(destructors, o) {
    return o ? this.trueValue : this.falseValue;
};

RegisteredBool.prototype.fromWireType = function(wt) {
            // ambiguous emscripten ABI: sometimes return values are
            // true or false, and sometimes integers (0 or 1)
            return !!wt;
};

function __embind_register_bool(rawType, name, trueValue, falseValue) {
    name = Pointer_stringify(name);
    registerType(rawType, name, new RegisteredBool(trueValue, falseValue));
}

function RegisteredInteger() {
}

RegisteredInteger.prototype.toWireType = function(destructors, value) {
    if (typeof value !== "number") {
        throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
    }
    return value | 0;
};

RegisteredInteger.prototype.fromWireType = function(value) {
    return value;
};

function __embind_register_integer(rawType, name) {
    name = Pointer_stringify(name);
    registerType(rawType, name, new RegisteredInteger());
}

function RegisteredFloat() {
}

RegisteredFloat.prototype.toWireType = function(destructors, value) {
    if (typeof value !== "number") {
        throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' +this.name);
    }
    return value;
};

RegisteredFloat.prototype.fromWireType = function(value) {
    return value;
};

function __embind_register_float(rawType, name) {
    name = Pointer_stringify(name);
    registerType(rawType, name, new RegisteredFloat());
}

function RegisteredString(stringType, name) {

}

RegisteredString.prototype.toWireType = function(destructors, value) {
    var ptr = _malloc(value.length + 1);
    writeStringToMemory(value, ptr);
    destructors.push(_free);
    destructors.push(ptr);
    return ptr;
};

RegisteredString.prototype.fromWireType = function(value) {
    var rv = Pointer_stringify(value);
    _free(value);
    return rv;
};

function __embind_register_cstring(rawType, name) {
    name = Pointer_stringify(name);
    registerType(rawType, name, new RegisteredString());
}

function RegisteredEmval() {
}

RegisteredEmval.prototype.toWireType = function(destructors, value) {
    return __emval_register(value);
};

RegisteredEmval.prototype.fromWireType = function(handle) {
    var rv = _emval_handle_array[handle].value;
    __emval_decref(handle);
    return rv;
};

function __embind_register_emval(rawType, name) {
    name = Pointer_stringify(name);
    registerType(rawType, name, new RegisteredEmval());
}

var BindingError = Error;
/** @expose */
Module.BindingError = BindingError;

function runDestructors(destructors) {
    while (destructors.length) {
        var ptr = destructors.pop();
        var del = destructors.pop();
        del(ptr);
    }
}

function makeInvoker(name, argCount, argTypes, invoker, fn) {
    return function() {
        if (arguments.length !== argCount - 1) {
            throw new BindingError('function ' + name + ' called with ' + arguments.length + ' arguments, expected ' + (argCount - 1));
        }
        var destructors = [];
        var args = new Array(argCount);
        args[0] = fn;
        for (var i = 1; i < argCount; ++i) {
            args[i] = argTypes[i].toWireType(destructors, arguments[i-1]);
        }
        var rv = invoker.apply(null, args);
        if (argTypes[0].fromWireTypeAutoDowncast) {
            rv = argTypes[0].fromWireTypeAutoDowncast(rv);
        } else {
            rv = argTypes[0].fromWireType(rv);
        }
        runDestructors(destructors);
        return rv;
    };
}

function __embind_register_function(name, argCount, rawArgTypes, invoker, fn) {
    name = Pointer_stringify(name);
    invoker = FUNCTION_TABLE[invoker];
    var argTypes = requireArgumentTypes(argCount, rawArgTypes, name);
    exposePublicSymbol(name, makeInvoker(name, argCount, argTypes, invoker, fn));
}

function RegisteredTuple(constructor, destructor) {
    this.constructor = constructor;
    this.destructor = destructor;
    this.elements = [];
}

RegisteredTuple.prototype.toWireType = function(destructors, o) {
    var len = this.elements.length;
    if (len !== o.length) {
        throw new TypeError("Incorrect number of tuple elements");
    }
    var ptr = this.constructor();
    for (var i = 0; i < len; ++i) {
        this.elements[i].write(ptr, o[i]);
    }
    destructors.push(this.destructor);
    destructors.push(ptr);
    return ptr;
};

RegisteredTuple.prototype.fromWireType = function(ptr) {
    var len = this.elements.length;
    var rv = new Array(len);
    for (var i = 0; i < len; ++i) {
        rv[i] = this.elements[i].read(ptr);
    }
    this.destructor(ptr);
    return rv;
};

function __embind_register_tuple(type, name, constructor, destructor) {
    name = Pointer_stringify(name);
    constructor = FUNCTION_TABLE[constructor];
    destructor = FUNCTION_TABLE[destructor];
    registerType(type, name, new RegisteredTuple(constructor, destructor));
}

function copyMemberPointer(memberPointer, memberPointerSize) {
    var copy = _malloc(memberPointerSize);
    if (!copy) {
        throw new Error('Failed to allocate member pointer copy');
    }
    _memcpy(copy, memberPointer, memberPointerSize);
    return copy;
}

function __embind_register_tuple_element(
    tupleType,
    elementType,
    getter,
    setter,
    memberPointerSize,
    memberPointer
) {
    tupleType = requireRegisteredType(tupleType, 'tuple');
    elementType = requireRegisteredType(elementType, "element " + tupleType.name + "[" + tupleType.elements.length + "]");
    getter = FUNCTION_TABLE[getter];
    setter = FUNCTION_TABLE[setter];
    memberPointer = copyMemberPointer(memberPointer, memberPointerSize);

    tupleType.elements.push({
        read: function(ptr) {
            return elementType.fromWireType(getter(ptr, memberPointer));
        },
        write: function(ptr, o) {
            var destructors = [];
            setter(ptr, memberPointer, elementType.toWireType(destructors, o));
            runDestructors(destructors);
        }
    });
}

function __embind_register_tuple_element_accessor(
    tupleType,
    elementType,
    staticGetter,
    getterSize,
    getter,
    staticSetter,
    setterSize,
    setter
) {
    tupleType = requireRegisteredType(tupleType, 'tuple');
    elementType = requireRegisteredType(elementType, "element " + tupleType.name + "[" + tupleType.elements.length + "]");
    staticGetter = FUNCTION_TABLE[staticGetter];
    getter = copyMemberPointer(getter, getterSize);
    staticSetter = FUNCTION_TABLE[staticSetter];
    setter = copyMemberPointer(setter, setterSize);

    tupleType.elements.push({
        read: function(ptr) {
            return elementType.fromWireType(staticGetter(ptr, HEAP32[getter >> 2]));
        },
        write: function(ptr, o) {
            var destructors = [];
            staticSetter(
                ptr,
                HEAP32[setter >> 2],
                elementType.toWireType(destructors, o));
            runDestructors(destructors);
        }
    });
}

function RegisteredStruct(constructor, destructor) {
    this.constructor = constructor;
    this.destructor = destructor;
    this.fields = {};
}

RegisteredStruct.prototype.toWireType = function(destructors, o) {
    var fields = this.fields;
    for (var fieldName in fields) {
        if (!(fieldName in o)) {
            throw new TypeError('Missing field');
        }
    }
    var ptr = this.constructor();
    for (fieldName in fields) {
        fields[fieldName].write(ptr, o[fieldName]);
    }
    destructors.push(this.destructor);
    destructors.push(ptr);
    return ptr;
};

RegisteredStruct.prototype.fromWireType = function(ptr) {
    var fields = this.fields;
    var rv = {};
    for (var i in fields) {
        rv[i] = fields[i].read(ptr);
    }
    this.destructor(ptr);
    return rv;
};

function __embind_register_struct(
    type,
    name,
    constructor,
    destructor
) {
    name = Pointer_stringify(name);
    constructor = FUNCTION_TABLE[constructor];
    destructor = FUNCTION_TABLE[destructor];

    registerType(type, name, new RegisteredStruct(constructor, destructor));
}

function __embind_register_struct_field(
    structType,
    fieldName,
    fieldType,
    getter,
    setter,
    memberPointerSize,
    memberPointer
) {
    structType = requireRegisteredType(structType, 'struct');
    fieldName = Pointer_stringify(fieldName);
    fieldType = requireRegisteredType(fieldType, 'field "' + structType.name + '.' + fieldName + '"');
    getter = FUNCTION_TABLE[getter];
    setter = FUNCTION_TABLE[setter];
    memberPointer = copyMemberPointer(memberPointer, memberPointerSize);

    structType.fields[fieldName] = {
        read: function(ptr) {
            return fieldType.fromWireType(getter(ptr, memberPointer));
        },
        write: function(ptr, o) {
            var destructors = [];
            setter(ptr, memberPointer, fieldType.toWireType(destructors, o));
            runDestructors(destructors);
        }
    };
}

function RegisteredSmartPointer(getPointee, Handle, destructor, isPolymorphic, pointeeType) {
    this.getPointee = getPointee;
    this.Handle = Handle;
    this.destructor = destructor;
    this.isPolymorphic = isPolymorphic;
    this.pointeeType = pointeeType;
}

RegisteredSmartPointer.prototype.toWireType = function(destructors, o) {
    if (null === o) {
        return 0;
    } else {
        return o.smartPointer;
    }
};

RegisteredSmartPointer.prototype.fromWireType = function(ptr) {
    if (!this.getPointee(ptr)) {
        this.destructor(ptr);
        return null;
    }
    return new this.Handle(ptr);
};

RegisteredSmartPointer.prototype.fromWireTypeAutoDowncast = function(ptr) {
    if (!this.getPointee(ptr)) {
        this.destructor(ptr);
        return null;
    }
    if (this.isPolymorphic) {
        // todo: clean up this code
        var pointee = this.getPointee(ptr);
        var toRawType = ___getDynamicPointerType(pointee);
        if (toRawType === null || toRawType === this.pointeeType.rawType) {
            return new this.Handle(ptr);
        }
        // todo: getDerivationPath is expensive -- cache the result
        var derivation = Module.__getDerivationPath(toRawType, this.pointeeType.rawType);
        var rawCandidateType = null;
        var candidateType = null;
        for (var i = 0; i < derivation.size(); i++) {
            rawCandidateType = derivation.at(i);
            candidateType = typeRegistry[rawCandidateType];
            if (candidateType) {
                break;
            }
        }
        derivation.delete();
        if (candidateType === null) {
            return new this.Handle(ptr);
        }
        // todo: need to clone the ptr here (really??)
        // todo: we need to release the pre-cast pointer, don't we? how did this get past the tests?
        return candidateType.smartPointerType.fromWireType(ptr);
    } else {
        return new this.Handle(ptr);
    }
};

function __embind_register_smart_ptr(
    rawType,
    rawPointeeType,
    isPolymorphic,
    name,
    destructor,
    getPointee
) {
    name = Pointer_stringify(name);
    var pointeeType = requireRegisteredType(rawPointeeType, 'class');
    destructor = FUNCTION_TABLE[destructor];
    getPointee = FUNCTION_TABLE[getPointee];
    
    var Handle = createNamedFunction(name, function(ptr) {
        this.count = {value: 1};
        this.smartPointer = ptr; // std::shared_ptr<T>*
        this.ptr = getPointee(ptr); // T*
    });

    // TODO: test for SmartPtr.prototype.constructor property?
    // We likely want it distinct from pointeeType.prototype.constructor
    Handle.prototype = Object.create(pointeeType.Handle.prototype);
    
    Handle.prototype.clone = function() {
        if (!this.ptr) {
            throw new BindingError(pointeeType.name + ' instance already deleted');
        }

        var clone = Object.create(Handle.prototype);
        clone.count = this.count;
        clone.smartPointer = this.smartPointer;
        clone.ptr = this.ptr;
        
        clone.count.value += 1;
        return clone;
    };
    
    Handle.prototype['delete'] = function() {
        if (!this.ptr) {
            throw new BindingError(pointeeType.name + ' instance already deleted');
        }
        
        this.count.value -= 1;
        if (0 === this.count.value) {
            destructor(this.smartPointer);
        }
        this.smartPointer = undefined;
        this.ptr = undefined;
    };
    pointeeType.smartPointerType = registerType(rawType, name, new RegisteredSmartPointer(getPointee, Handle, destructor, isPolymorphic, pointeeType));
}

function RegisteredRawPointer(isPolymorphic, classType, Handle) {
    this.isPolymorphic = isPolymorphic;
    this.pointeeType = classType;
    this.Handle = Handle;
}

RegisteredRawPointer.prototype.toWireType = function(destructors, o) {
    return o.ptr;
};

RegisteredRawPointer.prototype.fromWireType = function(ptr) {
    return new this.Handle(ptr);
};

RegisteredRawPointer.prototype.fromWireTypeAutoDowncast = function(ptr) {
    if (this.isPolymorphic) {
        var toRawType = ___getDynamicPointerType(ptr);
        if (toRawType === null || toRawType === this.pointeeType.rawType) {
            return new this.Handle(ptr);
        }
        var derivation = Module.__getDerivationPath(toRawType, this.pointeeType.rawType);
        var candidateType = null;
        for (var i = 0; i < derivation.size(); i++) {
            candidateType = typeRegistry[derivation.at(i)];
            if (candidateType) {
                break;
            }
        }
        derivation.delete();
        if (candidateType === null) {
            return new this.Handle(ptr);
        }
        var handle = candidateType.fromWireType(ptr);
        handle.ptr = ___staticPointerCast(handle.ptr, this.pointeeType.rawType, candidateType.rawType);
        // todo: can come back -1 or -2!! Throw appropriate exception
        return handle;
    } else {
        handle = new this.Handle(ptr);
    }
    return handle;
};

function RegisteredClassInstance(constructor, Handle) {
    this.constructor = constructor;
    this.Handle = Handle;
}

function __embind_register_vector(
    vectorType,
    elementType,
    name,
    constructor,
    destructor,
    length,
    getter,
    setter
) {
    name = Pointer_stringify(name);
    elementType = requireRegisteredType(elementType, 'vector ' + name);
    
    constructor = FUNCTION_TABLE[constructor];
    destructor = FUNCTION_TABLE[destructor];
    length = FUNCTION_TABLE[length];
    getter = FUNCTION_TABLE[getter];
    setter = FUNCTION_TABLE[setter];

    registerType(vectorType, name, {
        name: name,
        fromWireType: function(ptr) {
            var arr = [];
            Object.defineProperty(arr, 'delete', {
                writable: false,
                enumerable: false,
                configurable: false,
                value: function() {
                    var needsToBeDeleted = elementType.hasOwnProperty('Handle');
                    for (var i = 0; i < arr.length; i++) {
                        if (needsToBeDeleted) {
                            arr[i].delete();
                        }
                    }
                }
            });

            var n = length(ptr);
            for (var i = 0; i < n; i++) {
                var v = elementType.fromWireType(getter(ptr, i));
                arr.push(v);
            }

            destructor(ptr);
            return arr;
        },
        toWireType: function(destructors, o) {
            var vec = constructor();
            for (var val in o) {
                setter(vec, elementType.toWireType(destructors, o[val]));
            }
            runDestructors(destructors);

            destructors.push(destructor);
            destructors.push(vec);
            return vec;
        }
    });
}

RegisteredClassInstance.prototype.toWireType = function(destructors, o) {
    return o.ptr;
};

RegisteredClassInstance.prototype.fromWireType = function(ptr) {
    return new this.Handle(ptr);
};

function RegisteredRawConstPointer() {
}

RegisteredRawConstPointer.prototype.toWireType = function(destructors, o) {
    return o.ptr;
};

>>>>>>> Refactoring preparatory to code clean-up (no functional changes, all tests pass).
// TODO: null pointers are always zero (not a Handle) in Javascript
/*global ___staticPointerCast: false*/
function __embind_register_class(
    rawType,
    rawPointerType,
    rawConstPointerType,
    isPolymorphic,
    name,
    destructor
) {
    name = Pointer_stringify(name);
    destructor = FUNCTION_TABLE[destructor];

    var Handle = createNamedFunction(name, function(ptr) {
        var h = function() {
            if(h.operator_call !== undefined) {
                return h.operator_call.apply(h, arguments);
            } else {
                throw new BindingError(name + ' does not define call operator');
            }
        };
        
        h.count = {value: 1, ptr: ptr };
        h.ptr = ptr;

        for(var prop in Handle.prototype) {
            var dp = Object.getOwnPropertyDescriptor(Handle.prototype, prop);
            Object.defineProperty(h, prop, dp);
        }
        
        return h; 
    });

    Handle.prototype.clone = function() {
        if (!this.ptr) {
            throw new BindingError(type.name + ' instance already deleted');
        }

        var clone = Object.create(Handle.prototype);
        clone.count = this.count;
        clone.ptr = this.ptr;

        clone.count.value += 1;
        return clone;
    };

    Handle.prototype.move = function() {
        var rv = this.clone();
        this.delete();
        return rv;
    };

    // todo: test delete with upcast and downcast multiply derived pointers
    // todo: then replace this.count.ptr below with this.ptr and make sure it fails
    Handle.prototype['delete'] = function() {
        if (!this.ptr) {
            throw new BindingError(type.name + ' instance already deleted'); // todo: but 'type' hasn't been resolved!?!
        }

        this.count.value -= 1;
        if (0 === this.count.value) {
            destructor(this.count.ptr);
        }
        this.ptr = undefined;
    };

    var constructor = createNamedFunction(name, function() {
        var body = constructor.body;
        return body.apply(this, arguments);
    });
    constructor.prototype = Handle.prototype;
    constructor.rawType = rawType;

    var classType = registerType(rawType, name, new RegisteredClassInstance(constructor, Handle));
    registerType(rawPointerType, name + '*', new RegisteredRawPointer(isPolymorphic, classType, Handle));
    registerType(rawConstPointerType, name + ' const*', new RegisteredRawConstPointer());

    exposePublicSymbol(name, constructor);
}

function __embind_register_class_constructor(
    rawClassType,
    argCount,
    rawArgTypes,
    constructor
) {
    var classType = requireRegisteredType(rawClassType, 'class');
    var humanName = 'constructor ' + classType.name;
    var argTypes = requireArgumentTypes(argCount, rawArgTypes, humanName);
    constructor = FUNCTION_TABLE[constructor];

    classType.constructor.body = function() {
        if (arguments.length !== argCount - 1) {
            throw new BindingError('emscripten binding ' + humanName + ' called with ' + arguments.length + ' arguments, expected ' + (argCount-1));
        }
        var destructors = [];
        var args = new Array(argCount-1);
        for (var i = 1; i < argCount; ++i) {
            args[i-1] = argTypes[i].toWireType(destructors, arguments[i-1]);
        }

        var ptr = constructor.apply(null, args);
        runDestructors(destructors);
        
        return classType.Handle.call(this, ptr);
    };
}

function __embind_register_class_method(
    rawClassType,
    methodName,
    argCount,
    rawArgTypes,
    invoker,
    memberFunctionSize,
    memberFunction
) {
    var classType = requireRegisteredType(rawClassType, 'class');
    methodName = Pointer_stringify(methodName);
    var humanName = classType.name + '.' + methodName;

    var argTypes = requireArgumentTypes(argCount, rawArgTypes, 'method ' + humanName);
    invoker = FUNCTION_TABLE[invoker];
    memberFunction = copyMemberPointer(memberFunction, memberFunctionSize);

    classType.Handle.prototype[methodName] = function() {
        
        if (!this.ptr) {
            throw new BindingError('cannot call emscripten binding method ' + humanName + ' on deleted object');
        }
        if (arguments.length !== argCount - 1) {
            throw new BindingError('emscripten binding method ' + humanName + ' called with ' + arguments.length + ' arguments, expected ' + (argCount-1));
        }
        
        var destructors = [];
        var args = new Array(argCount + 1);
        args[0] = this.ptr;
        args[1] = memberFunction;
        for (var i = 1; i < argCount; ++i) {
            args[i + 1] = argTypes[i].toWireType(destructors, arguments[i-1]);
        }
        var rv = invoker.apply(null, args);
        if (argTypes[0].fromWireTypeAutoDowncast) {
            rv = argTypes[0].fromWireTypeAutoDowncast(rv);
        } else {
            rv = argTypes[0].fromWireType(rv);
        }
        runDestructors(destructors);
        return rv;
    };
}

function __embind_register_raw_cast_method(
    rawClassType,
    isPolymorphic,
    methodName,
    rawReturnType,
    invoker
) {
    var classType = requireRegisteredType(rawClassType, 'class');
    methodName = Pointer_stringify(methodName);
    var humanName = classType.name + '.' + methodName;

    var returnType = requireRegisteredType(rawReturnType, 'method ' + humanName + ' return value');
    invoker = FUNCTION_TABLE[invoker];

    classType.Handle.prototype[methodName] = function() {
        if (!this.ptr) {
            throw new BindingError('cannot call emscripten binding method ' + humanName + ' on deleted object');
        }
        if (arguments.length !== 0) {
            throw new BindingError('emscripten binding method ' + humanName + ' called with arguments, none expected');
        }
        if (isPolymorphic) {
            // todo: this is all only to validate the cast -- cache the result
            var runtimeType = ___getDynamicPointerType(this.ptr);
            var derivation = Module.__getDerivationPath(rawReturnType, runtimeType); // downcast is valid
            var size = derivation.size();
            derivation.delete();
            if (size === 0) {
                derivation = Module.__getDerivationPath(runtimeType, rawReturnType); // upcast is valid
                size = derivation.size();
                derivation.delete();
                if (size === 0) {
                    // todo: return zero
                    return returnType.fromWireType(0);
                }
            }
        }
        var args = new Array(1);
        args[0] = this.ptr;
        var rv = returnType.fromWireType(invoker.apply(null, args));
        rv.count = this.count;
        this.count.value ++;
        return rv;
    };
}

function __embind_register_smart_cast_method(
    rawPointerType,
    rawReturnType,
    returnPointeeType,
    isPolymorphic,
    methodName,
    invoker
) {
    var pointerType = requireRegisteredType(rawPointerType, 'smart pointer class');
    methodName = Pointer_stringify(methodName);
    var humanName = pointerType.name + '.' + methodName;

    var returnType = requireRegisteredType(rawReturnType, 'method ' + humanName + ' return value');
    invoker = FUNCTION_TABLE[invoker];

    pointerType.Handle.prototype[methodName] = function() {
        if (!this.ptr) {
            throw new BindingError('cannot call emscripten binding method ' + humanName + ' on deleted object');
        }
        if (arguments.length !== 0) {
            throw new BindingError('emscripten binding method ' + humanName + ' called with arguments, none expected');
        }
        if (isPolymorphic) {
            // todo: just validating the cast -- cache the result
            // todo: throw exception instead of returning zero
            var runtimeType = ___getDynamicPointerType(this.ptr);
            var derivation = Module.__getDerivationPath(returnPointeeType, runtimeType); // downcast is valid
            var size = derivation.size();
            derivation.delete();
            if (size === 0) {
                derivation = Module.__getDerivationPath(runtimeType, returnPointeeType); // upcast is valid
                size = derivation.size();
                derivation.delete();
                if (size === 0) {
                    return 0;
                }
            }
        }
        var args = new Array(2);
        var newPtr = _malloc(8);
        args[0] = newPtr;
        args[1] = this.smartPointer;
        invoker.apply(null,args);
        var rv = returnType.fromWireType(newPtr);
        return rv;
    };
}

function __embind_register_class_classmethod(
    rawClassType,
    methodName,
    argCount,
    rawArgTypes,
    invoker,
    fn
) {
    var classType = requireRegisteredType(rawClassType, 'class');
    methodName = Pointer_stringify(methodName);
    var humanName = classType.name + '.' + methodName;
    var argTypes = requireArgumentTypes(argCount, rawArgTypes, 'classmethod ' + humanName);
    invoker = FUNCTION_TABLE[invoker];
    classType.constructor[methodName] = makeInvoker(humanName, argCount, argTypes, invoker, fn);
}

function __embind_register_class_operator_call(
    rawClassType,
    argCount,
    rawArgTypes,
    invoker
) {
    var classType = requireRegisteredType(rawClassType, 'class');
    var humanName = classType.name + '.' + 'operator_call';
    var argTypes = requireArgumentTypes(argCount, rawArgTypes, 'method ' + humanName);
    invoker = FUNCTION_TABLE[invoker];
    
    
    classType.Handle.prototype.operator_call = function() {
        if (!this.ptr) {
            throw new BindingError('cannot call emscripten binding method ' + humanName + ' on deleted object');
        }
        if (arguments.length !== argCount - 1) {
            throw new BindingError('emscripten binding method ' + humanName + ' called with ' + arguments.length + ' arguments, expected ' + (argCount-1));
        }
        
        var destructors = [];
        var args = new Array(argCount);
        args[0] = this.ptr;
        for (var i = 1; i < argCount; ++i) {
            args[i] = argTypes[i].toWireType(destructors, arguments[i-1]);
        }

        var rv = argTypes[0].fromWireType(invoker.apply(null, args));
        runDestructors(destructors);
        return rv;
    };
}

function __embind_register_class_operator_array_get(
    rawClassType,
    elementType,
    indexType,
    invoker
) {
    var classType = requireRegisteredType(rawClassType, 'class');
    indexType = requireRegisteredType(indexType, 'array access index ' + classType.name);
    elementType = requireRegisteredType(elementType, 'array access element' + classType.name);
    invoker = FUNCTION_TABLE[invoker];
    var humanName = classType.name + '.' + 'operator_array_get';
    
    classType.Handle.prototype.array_get = function() {
        if (!this.ptr) {
            throw new BindingError('cannot call emscripten binding method ' + humanName + ' on deleted object');
        }
        
        if (arguments.length !== 1) {
            throw new BindingError('emscripten binding method ' + humanName + ' called with ' + arguments.length + ' arguments, expected ' + 1);
        }
        
        var destructors = [];
        var args = new Array(2);
        args[0] = this.ptr;
        args[1] = indexType.toWireType(destructors, arguments[0]);
        
        var rv = elementType.fromWireType(invoker.apply(null, args));
        runDestructors(destructors);
        return rv;
    };
}

function __embind_register_class_operator_array_set(
    rawClassType,
    elementType,
    rawIndexType,
    invoker
) {
    var classType = requireRegisteredType(rawClassType, 'class');
    var indexType = requireRegisteredType(rawIndexType, 'array access index ' + classType.name);
    elementType = requireRegisteredType(elementType, 'array access element ' + classType.name);
    invoker = FUNCTION_TABLE[invoker];
    var humanName = classType.name + '.' + 'operator_array_get';
    
    classType.Handle.prototype.array_set = function() {
        if (!this.ptr) {
            throw new BindingError('cannot call emscripten binding method ' + humanName + ' on deleted object');
        }
        
        if (arguments.length !== 2) {
            throw new BindingError('emscripten binding method ' + humanName + ' called with ' + arguments.length + ' arguments, expected ' + 2);
        }
        
        var destructors = [];
        var args = new Array(2);
        args[0] = this.ptr;
        args[1] = indexType.toWireType(destructors, arguments[0]);
        args[2] = elementType.toWireType(destructors, arguments[1]);
        
        var rv = elementType.fromWireType(invoker.apply(null, args));
        runDestructors(destructors);
        return rv;
    };
}

function __embind_register_class_field(
    rawClassType,
    fieldName,
    rawFieldType,
    getter,
    setter,
    memberPointerSize,
    memberPointer
) {
    var classType = requireRegisteredType(rawClassType, 'class');
    fieldName = Pointer_stringify(fieldName);
    var humanName = classType.name + '.' + fieldName;
    var fieldType = requireRegisteredType(rawFieldType, 'field ' + humanName);
    getter = FUNCTION_TABLE[getter];
    setter = FUNCTION_TABLE[setter];
    memberPointer = copyMemberPointer(memberPointer, memberPointerSize);

    Object.defineProperty(classType.Handle.prototype, fieldName, {
        get: function() {
            if (!this.ptr) {
                throw new BindingError('cannot access emscripten binding field ' + humanName + ' on deleted object');
            }
            return fieldType.fromWireType(getter(this.ptr, memberPointer));
        },
        set: function(v) {
            if (!this.ptr) {
                throw new BindingError('cannot modify emscripten binding field ' + humanName + ' on deleted object');
            }
            var destructors = [];
            setter(this.ptr, memberPointer, fieldType.toWireType(destructors, v));
            runDestructors(destructors);
        },
        enumerable: true
    });
}

function RegisteredEnum() {
    this.constructor = function() {};
    this.constructor.values = {};
}

RegisteredEnum.prototype.toWireType = function(destructors, c) {
    return c.value;
};

RegisteredEnum.prototype.fromWireType = function(c) {
    return this.constructor.values[c];
};

function __embind_register_enum(
    rawType,
    name
) {
    name = Pointer_stringify(name);
    var newEnum = new RegisteredEnum();
    registerType(rawType, name, newEnum);
    exposePublicSymbol(name, newEnum.constructor);
}

function __embind_register_enum_value(
    rawType,
    name,
    enumValue
) {
    var type = requireRegisteredType(rawType, 'enum');
    name = Pointer_stringify(name);

    var Enum = type.constructor;

    var Value = Object.create(type.constructor.prototype, {
        value: {value: enumValue},
        constructor: {value: createNamedFunction(type.name + '_' + name, function() {})},
    });
    Enum.values[enumValue] = Value;
    Enum[name] = Value;
}

function RegisteredInterface(constructor, destructor) {
    this.constructor = constructor;
    this.destructor = destructor;
}

RegisteredInterface.prototype.toWireType = function(destructors, o) {
    var handle = __emval_register(o);
    var ptr = this.constructor(handle);
    destructors.push(this.destructor);
    destructors.push(ptr);
    return ptr;
};

function __embind_register_interface(
    rawType,
    name,
    constructor,
    destructor
) {
    name = Pointer_stringify(name);
    constructor = FUNCTION_TABLE[constructor];
    destructor = FUNCTION_TABLE[destructor];

    registerType(rawType, name, new RegisteredInterface(constructor, destructor));
}

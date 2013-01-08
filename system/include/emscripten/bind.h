#pragma once

#include <stddef.h>
#include <string>
#include <functional>
#include <vector>
#include <map>
#include <type_traits>
#include <emscripten/val.h>
#include <emscripten/wire.h>

namespace emscripten {
    namespace internal {
        typedef void (*GenericFunction)();
        typedef long GenericEnumValue;

        // Implemented in JavaScript.  Don't call these directly.
        extern "C" {
            void _embind_fatal_error(
                const char* name,
                const char* payload) __attribute__((noreturn));

            void _embind_register_void(
                TYPEID voidType,
                const char* name);

            void _embind_register_bool(
                TYPEID boolType,
                const char* name,
                bool trueValue,
                bool falseValue);

            void _embind_register_integer(
                TYPEID integerType,
                const char* name);

            void _embind_register_float(
                TYPEID floatType,
                const char* name);
            
            void _embind_register_cstring(
                TYPEID stringType,
                const char* name);

            void _embind_register_emval(
                TYPEID emvalType,
                const char* name);

            void _embind_register_function(
                const char* name,
                unsigned argCount,
                TYPEID argTypes[],
                GenericFunction invoker,
                GenericFunction function);

            void _embind_register_tuple(
                TYPEID tupleType,
                const char* name,
                GenericFunction constructor,
                GenericFunction destructor);
            
            void _embind_register_tuple_element(
                TYPEID tupleType,
                TYPEID elementType,
                GenericFunction getter,
                GenericFunction setter,
                size_t memberPointerSize,
                void* memberPointer);

            void _embind_register_tuple_element_accessor(
                TYPEID tupleType,
                TYPEID elementType,
                GenericFunction staticGetter,
                size_t getterSize,
                void* getter,
                GenericFunction staticSetter,
                size_t setterSize,
                void* setter);

            void _embind_register_struct(
                TYPEID structType,
                const char* name,
                GenericFunction constructor,
                GenericFunction destructor);
            
            void _embind_register_struct_field(
                TYPEID structType,
                const char* name,
                TYPEID fieldType,
                GenericFunction getter,
                GenericFunction setter,
                size_t memberPointerSize,
                void* memberPointer);

            void _embind_register_smart_ptr(
                TYPEID pointerType,
                TYPEID pointeeType,
                bool isPolymorphic,
                const char* pointerName,
                GenericFunction constructor,
                GenericFunction destructor,
                GenericFunction getPointee);

            void _embind_register_class(
                TYPEID classType,
                TYPEID pointerType,
                TYPEID constPointerType,
                bool isPolymorphic,
                const char* className,
                GenericFunction destructor);

            void _embind_register_class_constructor(
                TYPEID classType,
                unsigned argCount,
                TYPEID argTypes[],
                GenericFunction constructor);

            void _embind_register_class_method(
                TYPEID classType,
                const char* methodName,
                unsigned argCount,
                TYPEID argTypes[],
                GenericFunction invoker,
                size_t memberFunctionSize,
                void* memberFunction);

            void _embind_register_raw_cast_method(
                TYPEID classType,
                bool isPolymorphic,
                const char* methodName,
                TYPEID returnType,
                GenericFunction invoker);

            void _embind_register_smart_cast_method(
                TYPEID pointerType,
                TYPEID returnType,
                TYPEID returnPointeeType,
                bool isPolymorphic,
                const char* methodName,
                GenericFunction invoker);

            void _embind_register_class_field(
                TYPEID classType,
                const char* fieldName,
                TYPEID fieldType,
                GenericFunction getter,
                GenericFunction setter,
                size_t memberPointerSize,
                void* memberPointer);

            void _embind_register_class_classmethod(
                TYPEID classType,
                const char* methodName,
                unsigned argCount,
                TYPEID argTypes[],
                GenericFunction invoker,
                GenericFunction method);

            void _embind_register_class_operator_call(
                TYPEID classType,
                unsigned argCount,
                TYPEID argTypes[],
                GenericFunction invoker);

            void _embind_register_class_operator_array_get(
                TYPEID classType,
                TYPEID elementType,
                TYPEID indexType,
                GenericFunction invoker);

            void _embind_register_class_operator_array_set(
                TYPEID classType,
                TYPEID elementType,
                TYPEID indexType,
                GenericFunction invoker);

            void _embind_register_enum(
                TYPEID enumType,
                const char* name);

            void _embind_register_enum_value(
                TYPEID enumType,
                const char* valueName,
                GenericEnumValue value);

            void _embind_register_interface(
                TYPEID interfaceType,
                const char* name,
                GenericFunction constructor,
                GenericFunction destructor);
        }

        extern void registerStandardTypes();

        class BindingsDefinition {
        public:
            template<typename Function>
            BindingsDefinition(Function fn) {
                fn();
            }
        };
    }
}

namespace emscripten {
    ////////////////////////////////////////////////////////////////////////////////
    // POLICIES
    ////////////////////////////////////////////////////////////////////////////////

    template<int Index>
    struct arg {
        static constexpr int index = Index + 1;
    };

    struct ret_val {
        static constexpr int index = 0;
    };

    template<typename Slot>
    struct allow_raw_pointer {
        template<typename InputType, int Index>
        struct Transform {
            typedef typename std::conditional<
                Index == Slot::index,
                internal::AllowedRawPointer<typename std::remove_pointer<InputType>::type>,
                InputType
            >::type type;
        };
    };

    // whitelist all raw pointers
    struct allow_raw_pointers {
        template<typename InputType, int Index>
        struct Transform {
            typedef typename std::conditional<
                std::is_pointer<InputType>::value,
                internal::AllowedRawPointer<typename std::remove_pointer<InputType>::type>,
                InputType
            >::type type;
        };
    };

    namespace internal {
        template<typename ReturnType, typename... Args>
        struct Invoker {
            static typename internal::BindingType<ReturnType>::WireType invoke(
                ReturnType (fn)(Args...),
                typename internal::BindingType<Args>::WireType... args
            ) {
                return internal::BindingType<ReturnType>::toWireType(
                    fn(
                        internal::BindingType<Args>::fromWireType(args)...
                    )
                );
            }
        };

        template<typename... Args>
        struct Invoker<void, Args...> {
            static void invoke(
                void (fn)(Args...),
                typename internal::BindingType<Args>::WireType... args
            ) {
                return fn(
                    internal::BindingType<Args>::fromWireType(args)...
                );
            }
        };
    }

    ////////////////////////////////////////////////////////////////////////////////
    // FUNCTIONS
    ////////////////////////////////////////////////////////////////////////////////

    extern "C" {
        int __getDynamicPointerType(int p);
        int __dynamicPointerCast(int p, int to);
    }

    template<typename FromType, typename ToType>
    ToType& performRawStaticCast(FromType& from) {
        return *static_cast<ToType*>(&from);
    };

    template<typename FromRawType, typename ToRawType, bool isPolymorphic>
    struct performShared {
        static std::shared_ptr<ToRawType> cast(std::shared_ptr<FromRawType> from) {
            return std::dynamic_pointer_cast<ToRawType>(from);
        };
    };

    template<typename FromRawType, typename ToRawType>
    struct performShared<FromRawType, ToRawType, false> {
        static std::shared_ptr<ToRawType> cast(std::shared_ptr<FromRawType> from) {
            return std::shared_ptr<ToRawType>(from, static_cast<ToRawType*>(from.get()));
        };
    };

    template<typename ReturnType, typename... Args, typename... Policies>
    void function(const char* name, ReturnType (fn)(Args...), Policies...) {
        using namespace internal;

        registerStandardTypes();

        typename WithPolicies<Policies...>::template ArgTypeList<ReturnType, Args...> args;
        _embind_register_function(
            name,
            args.count,
            args.types,
            reinterpret_cast<GenericFunction>(&Invoker<ReturnType, Args...>::invoke),
            reinterpret_cast<GenericFunction>(fn));
    }

    namespace internal {
        template<typename ClassType, typename... Args>
        ClassType* raw_constructor(
            typename internal::BindingType<Args>::WireType... args
        ) {
            return new ClassType(
                internal::BindingType<Args>::fromWireType(args)...
            );
        }

        template<typename PointerType>
        void nullDeallocator(PointerType* p) {}

        template<typename PointerType>
        typename std::shared_ptr<PointerType> raw_smart_pointer_constructor(PointerType *ptr, void (PointerType*)) {
            return std::shared_ptr<PointerType>(ptr, nullDeallocator<PointerType>);
        }

        template<typename ClassType>
        void raw_destructor(ClassType* ptr) {
            delete ptr;
        }

        template<typename PointerType>
        typename PointerType::element_type* get_pointee(const PointerType& ptr) {
            // TODO: replace with general pointer traits implementation
            return ptr.get();
        }

        template<typename FunctorType, typename ReturnType, typename... Args>
        struct FunctorInvoker {
            static typename internal::BindingType<ReturnType>::WireType invoke(
                const FunctorType& ptr,
                typename internal::BindingType<Args>::WireType... args
            ) {
                return internal::BindingType<ReturnType>::toWireType(
                    ptr(
                        internal::BindingType<Args>::fromWireType(args)...
                    )
                );
            }
        };

        template<typename FunctorType, typename... Args>
        struct FunctorInvoker<FunctorType, void, Args...> {
            static void invoke(
                const FunctorType& ptr,
                typename internal::BindingType<Args>::WireType... args
            ) {
                ptr(internal::BindingType<Args>::fromWireType(args)...);
            }
        };

        template<typename ClassType, typename ElementType, typename IndexType>
        struct ArrayAccessGetInvoker {
            static typename internal::BindingType<ElementType>::WireType invoke(
                ClassType* ptr,
                typename internal::BindingType<IndexType>::WireType index
            ) {
                return internal::BindingType<ElementType>::toWireType(
                        (*ptr)[internal::BindingType<IndexType>::fromWireType(index)]
                );
            }
        };

        template<typename ClassType, typename ElementType, typename IndexType>
        struct ArrayAccessSetInvoker {
            static void invoke(
                ClassType* ptr,
                typename internal::BindingType<IndexType>::WireType index,
                typename internal::BindingType<ElementType>::WireType item
            ) {
                (*ptr)[internal::BindingType<IndexType>::fromWireType(index)] = internal::BindingType<ElementType>::fromWireType(item);
            }
        };

        template<typename ClassType, typename ReturnType, typename... Args>
        struct MethodInvoker {
            typedef ReturnType (ClassType::*MemberPointer)(Args...);
            static typename internal::BindingType<ReturnType>::WireType invoke(
                ClassType* ptr,
                const MemberPointer& method,
                typename internal::BindingType<Args>::WireType... args
            ) {
                return internal::BindingType<ReturnType>::toWireType(
                    (ptr->*method)(
                        internal::BindingType<Args>::fromWireType(args)...
                    )
                );
            }
        };

        template<typename ClassType, typename... Args>
        struct MethodInvoker<ClassType, void, Args...> {
            typedef void (ClassType::*MemberPointer)(Args...);
            static void invoke(
                ClassType* ptr,
                const MemberPointer& method,
                typename internal::BindingType<Args>::WireType... args
            ) {
                return (ptr->*method)(
                    internal::BindingType<Args>::fromWireType(args)...
                );
            }
        };

        template<typename ClassType, typename ReturnType, typename... Args>
        struct ConstMethodInvoker {
            typedef ReturnType (ClassType::*MemberPointer)(Args...) const;
            static typename internal::BindingType<ReturnType>::WireType invoke(
                const ClassType* ptr,
                const MemberPointer& method,
                typename internal::BindingType<Args>::WireType... args
            ) {
                return internal::BindingType<ReturnType>::toWireType(
                    (ptr->*method)(
                        internal::BindingType<Args>::fromWireType(args)...
                    )
                );
            }
        };

        template<typename ClassType, typename... Args>
        struct ConstMethodInvoker<ClassType, void, Args...> {
            typedef void (ClassType::*MemberPointer)(Args...) const;
            static void invoke(
                const ClassType* ptr,
                const MemberPointer& method,
                typename internal::BindingType<Args>::WireType... args
            ) {
                return (ptr->*method)(
                    internal::BindingType<Args>::fromWireType(args)...
                );
            }
        };

        template<typename ClassType, typename FieldType>
        struct FieldAccess {
            typedef FieldType ClassType::*MemberPointer;
            typedef internal::BindingType<FieldType> FieldBinding;
            typedef typename FieldBinding::WireType WireType;
            
            static WireType get(
                ClassType& ptr,
                const MemberPointer& field
            ) {
                return FieldBinding::toWireType(ptr.*field);
            }
            
            static void set(
                ClassType& ptr,
                const MemberPointer& field,
                WireType value
            ) {
                ptr.*field = FieldBinding::fromWireType(value);
            }

            template<typename Getter>
            static WireType propertyGet(
                ClassType& ptr,
                const Getter& getter
            ) {
                return FieldBinding::toWireType(getter(ptr));
            }

            template<typename Setter>
            static void propertySet(
                ClassType& ptr,
                const Setter& setter,
                WireType value
            ) {
                setter(ptr, FieldBinding::fromWireType(value));
            }
        };
    }

    ////////////////////////////////////////////////////////////////////////////////
    // VALUE TUPLES
    ////////////////////////////////////////////////////////////////////////////////

    template<typename ClassType>
    class value_tuple {
    public:
        value_tuple(const char* name) {
            internal::registerStandardTypes();
            internal::_embind_register_tuple(
                internal::TypeID<ClassType>::get(),
                name,
                reinterpret_cast<internal::GenericFunction>(&internal::raw_constructor<ClassType>),
                reinterpret_cast<internal::GenericFunction>(&internal::raw_destructor<ClassType>));
        }

        template<typename ElementType>
        value_tuple& element(ElementType ClassType::*field) {
            internal::_embind_register_tuple_element(
                internal::TypeID<ClassType>::get(),
                internal::TypeID<ElementType>::get(),
                reinterpret_cast<internal::GenericFunction>(&internal::FieldAccess<ClassType, ElementType>::get),
                reinterpret_cast<internal::GenericFunction>(&internal::FieldAccess<ClassType, ElementType>::set),
                sizeof(field),
                &field);
                                
            return *this;
        }

        template<typename ElementType>
        value_tuple& element(ElementType (*getter)(const ClassType&), void (*setter)(ClassType&, ElementType)) {
            internal::_embind_register_tuple_element_accessor(
                internal::TypeID<ClassType>::get(),
                internal::TypeID<ElementType>::get(),
                reinterpret_cast<internal::GenericFunction>(&internal::FieldAccess<ClassType, ElementType>::template propertyGet<ElementType(const ClassType&)>),
                sizeof(getter),
                &getter,
                reinterpret_cast<internal::GenericFunction>(&internal::FieldAccess<ClassType, ElementType>::template propertySet<void(ClassType&, ElementType)>),
                sizeof(setter),
                &setter);
            return *this;
        }

        template<typename ElementType>
        value_tuple& element(ElementType (*getter)(const ClassType&), void (*setter)(ClassType&, const ElementType&)) {
            internal::_embind_register_tuple_element_accessor(
                internal::TypeID<ClassType>::get(),
                internal::TypeID<ElementType>::get(),
                reinterpret_cast<internal::GenericFunction>(&internal::FieldAccess<ClassType, ElementType>::template propertyGet<ElementType(const ClassType&)>),
                sizeof(getter),
                &getter,
                reinterpret_cast<internal::GenericFunction>(&internal::FieldAccess<ClassType, ElementType>::template propertySet<void(ClassType&, ElementType)>),
                sizeof(setter),
                &setter);
            return *this;
        }

        template<typename ElementType>
        value_tuple& element(ElementType (*getter)(const ClassType&), void (*setter)(ClassType&, const ElementType&&)) {
            internal::_embind_register_tuple_element_accessor(
                internal::TypeID<ClassType>::get(),
                internal::TypeID<ElementType>::get(),
                reinterpret_cast<internal::GenericFunction>(&internal::FieldAccess<ClassType, ElementType>::template propertyGet<ElementType(const ClassType&)>),
                sizeof(getter),
                &getter,
                reinterpret_cast<internal::GenericFunction>(&internal::FieldAccess<ClassType, ElementType>::template propertySet<void(ClassType&, ElementType)>),
                sizeof(setter),
                &setter);
            return *this;
        }

        template<typename ElementType>
        value_tuple& element(ElementType (*getter)(const ClassType&), void (*setter)(ClassType&, ElementType&)) {
            internal::_embind_register_tuple_element_accessor(
                internal::TypeID<ClassType>::get(),
                internal::TypeID<ElementType>::get(),
                reinterpret_cast<internal::GenericFunction>(&internal::FieldAccess<ClassType, ElementType>::template propertyGet<ElementType(const ClassType&)>),
                sizeof(getter),
                &getter,
                reinterpret_cast<internal::GenericFunction>(&internal::FieldAccess<ClassType, ElementType>::template propertySet<void(ClassType&, ElementType)>),
                sizeof(setter),
                &setter);
            return *this;
        }
    };

    ////////////////////////////////////////////////////////////////////////////////
    // VALUE STRUCTS
    ////////////////////////////////////////////////////////////////////////////////

    template<typename ClassType>
    class value_struct {
    public:
        value_struct(const char* name) {
            internal::registerStandardTypes();
            internal::_embind_register_struct(
                internal::TypeID<ClassType>::get(),
                name,
                reinterpret_cast<internal::GenericFunction>(&internal::raw_constructor<ClassType>),
                reinterpret_cast<internal::GenericFunction>(&internal::raw_destructor<ClassType>));
        }

        template<typename FieldType>
        value_struct& field(const char* fieldName, FieldType ClassType::*field) {
            internal::_embind_register_struct_field(
                internal::TypeID<ClassType>::get(),
                fieldName,
                internal::TypeID<FieldType>::get(),
                reinterpret_cast<internal::GenericFunction>(&internal::FieldAccess<ClassType, FieldType>::get),
                reinterpret_cast<internal::GenericFunction>(&internal::FieldAccess<ClassType, FieldType>::set),
                sizeof(field),
                &field);
                                
            return *this;
        }
    };

    ////////////////////////////////////////////////////////////////////////////////
    // SMART POINTERS
    ////////////////////////////////////////////////////////////////////////////////

    template<typename PointerType>
    class register_smart_ptr {
    public:
        register_smart_ptr(const char* name) {
            using namespace internal;
            typedef typename PointerType::element_type PointeeType;

            registerStandardTypes();
            _embind_register_smart_ptr(
                 TypeID<PointerType>::get(),
                 TypeID<PointeeType>::get(),
                 std::is_polymorphic<PointeeType>::value,
                 name,
                 reinterpret_cast<GenericFunction>(&raw_smart_pointer_constructor<PointeeType*>),
                 reinterpret_cast<GenericFunction>(&raw_destructor<PointerType>),
                 reinterpret_cast<GenericFunction>(&get_pointee<PointerType>));

        }

        template<typename ReturnType>
        register_smart_ptr& cast(const char* methodName) {
            using namespace internal;
            typedef typename ReturnType::element_type ReturnPointeeType;
            typedef typename PointerType::element_type PointeeType;
            _embind_register_smart_cast_method(
                 TypeID<PointerType>::get(),
                 TypeID<ReturnType>::get(),
                 TypeID<ReturnPointeeType>::get(),
                 std::is_polymorphic<PointeeType>::value,
                 methodName,
                 reinterpret_cast<GenericFunction>(&performShared<PointeeType, ReturnPointeeType, std::is_polymorphic<PointeeType>::value>::cast));
            return *this;
        }
    };

    ////////////////////////////////////////////////////////////////////////////////
    // CLASSES
    ////////////////////////////////////////////////////////////////////////////////
    // TODO: support class definitions without constructors.
    // TODO: support external class constructors
    template<typename ClassType>
    class class_ {
    public:
        class_(const char* name) {
            using namespace internal;

            registerStandardTypes();
            _embind_register_class(
                TypeID<ClassType>::get(),
                TypeID<AllowedRawPointer<ClassType>>::get(),
                TypeID<AllowedRawPointer<const ClassType>>::get(),
                std::is_polymorphic<ClassType>::value,
                name,
                reinterpret_cast<GenericFunction>(&raw_destructor<ClassType>));
        }

        template<typename... ConstructorArgs, typename... Policies>
        class_& constructor(Policies...) {
            using namespace internal;

            typename WithPolicies<Policies...>::template ArgTypeList<void, ConstructorArgs...> args;
            _embind_register_class_constructor(
                TypeID<ClassType>::get(),
                args.count,
                args.types,
                reinterpret_cast<GenericFunction>(&raw_constructor<ClassType, ConstructorArgs...>));
        }

        template<typename ReturnType, typename... Args, typename... Policies>
        class_& method(const char* methodName, ReturnType (ClassType::*memberFunction)(Args...), Policies...) {
            using namespace internal;

            typename WithPolicies<Policies...>::template ArgTypeList<ReturnType, Args...> args;
            _embind_register_class_method(
                TypeID<ClassType>::get(),
                methodName,
                args.count,
                args.types,
                reinterpret_cast<GenericFunction>(&MethodInvoker<ClassType, ReturnType, Args...>::invoke),
                sizeof(memberFunction),
                &memberFunction);
            return *this;
        }

        template<typename ReturnType, typename... Args, typename... Policies>
        class_& method(const char* methodName, ReturnType (ClassType::*memberFunction)(Args...) const, Policies...) {
            using namespace internal;

            typename WithPolicies<Policies...>::template ArgTypeList<ReturnType, Args...> args;
            _embind_register_class_method(
                TypeID<ClassType>::get(),
                methodName,
                args.count,
                args.types,
                reinterpret_cast<GenericFunction>(&ConstMethodInvoker<ClassType, ReturnType, Args...>::invoke),
                sizeof(memberFunction),
                &memberFunction);
            return *this;
        }

        template<typename FieldType>
        class_& field(const char* fieldName, FieldType ClassType::*field) {
            using namespace internal;

            _embind_register_class_field(
                TypeID<ClassType>::get(),
                fieldName,
                TypeID<FieldType>::get(),
                reinterpret_cast<GenericFunction>(&FieldAccess<ClassType, FieldType>::get),
                reinterpret_cast<GenericFunction>(&FieldAccess<ClassType, FieldType>::set),
                sizeof(field),
                &field);
            return *this;
        }

        template<typename ReturnType, typename... Args, typename... Policies>
        class_& classmethod(const char* methodName, ReturnType (*classMethod)(Args...), Policies...) {
            using namespace internal;

            typename WithPolicies<Policies...>::template ArgTypeList<ReturnType, Args...> args;
            _embind_register_class_classmethod(
                TypeID<ClassType>::get(),
                methodName,
                args.count,
                args.types,
                reinterpret_cast<internal::GenericFunction>(&internal::Invoker<ReturnType, Args...>::invoke),
                reinterpret_cast<GenericFunction>(classMethod));
            return *this;
        }

        template<typename ReturnType, typename... Args, typename... Policies>
        class_& calloperator(Policies...) {
            using namespace internal;

            typename WithPolicies<Policies...>::template ArgTypeList<ReturnType, Args...> args;
            _embind_register_class_operator_call(
                TypeID<ClassType>::get(),
                args.count,
                args.types,
                reinterpret_cast<internal::GenericFunction>(&internal::FunctorInvoker<ClassType, ReturnType, Args...>::invoke));
            return *this;
        }

        template<typename ElementType, typename IndexType>
        class_& arrayoperatorget() {
            using namespace internal;

            _embind_register_class_operator_array_get(
                TypeID<ClassType>::get(),
                TypeID<ElementType>::get(),
                TypeID<IndexType>::get(),
                reinterpret_cast<internal::GenericFunction>(&internal::ArrayAccessGetInvoker<ClassType, ElementType, IndexType>::invoke));
        }

        template<typename ElementType, typename IndexType>
        class_& arrayoperatorset() {
            using namespace internal;

            _embind_register_class_operator_array_set(
                TypeID<ClassType>::get(),
                TypeID<ElementType>::get(),
                TypeID<IndexType>::get(),
                reinterpret_cast<internal::GenericFunction>(&internal::ArrayAccessSetInvoker<ClassType, ElementType, IndexType>::invoke));
            return *this;
        }

        template<typename ReturnType>
        class_& cast(const char* methodName) {
            using namespace internal;

            _embind_register_raw_cast_method(
                TypeID<ClassType>::get(),
                std::is_polymorphic<ClassType>::value,
                methodName,
                TypeID<ReturnType>::get(),
                reinterpret_cast<GenericFunction>(&performRawStaticCast<ClassType,ReturnType>));
            return *this;
        }
    };

    ////////////////////////////////////////////////////////////////////////////////
    // VECTORS
    ////////////////////////////////////////////////////////////////////////////////
    template<typename T>
    std::vector<T> vecFromJSArray(val v) {
        auto l = v.get("length").as<unsigned>();

        std::vector<T> rv;
        for(unsigned i = 0; i < l; ++i) {
            rv.push_back(v.get(i).as<T>());
        }

        return rv;
    };

    template<typename T>
    class_<std::vector<T>> register_vector(const char* name) {
        using namespace std;
        typedef vector<T> VecType;

        void (VecType::*push_back)(const T&) = &VecType::push_back;
        const T& (VecType::*at)(size_t) const = &VecType::at;
        auto c = class_<std::vector<T>>(name)
            .template constructor<>()
            .method("push_back", push_back)
            .method("at", at)
            .method("size", &vector<T>::size)
            .template arrayoperatorget<T, size_t>()
            .template arrayoperatorset<T, size_t>()
            ;

        return c;
    }

    ////////////////////////////////////////////////////////////////////////////////
    // MAPS
    ////////////////////////////////////////////////////////////////////////////////
    template<typename K, typename V>
    class_<std::map<K, V>> register_map(const char* name) {
        using namespace std;
        typedef map<K,V> MapType;

        auto c = class_<MapType>(name)
            .method("size", &MapType::size)
            .template arrayoperatorget<V, K>()
            .template arrayoperatorset<V, K>()
        ;

        return c;
    }


    ////////////////////////////////////////////////////////////////////////////////
    // ENUMS
    ////////////////////////////////////////////////////////////////////////////////

    template<typename EnumType>
    class enum_ {
    public:
        enum_(const char* name) {
            _embind_register_enum(
                internal::TypeID<EnumType>::get(),
                name);
        }

        enum_& value(const char* name, EnumType value) {
            // TODO: there's still an issue here.
            // if EnumType is an unsigned long, then JS may receive it as a signed long
            static_assert(sizeof(value) <= sizeof(internal::GenericEnumValue), "enum type must fit in a GenericEnumValue");

            _embind_register_enum_value(
                internal::TypeID<EnumType>::get(),
                name,
                static_cast<internal::GenericEnumValue>(value));
            return *this;
        }
    };

    namespace internal {
        template<typename T>
        class optional {
        public:            
            optional()
                : initialized(false)
            {}

            ~optional() {
                if (initialized) {
                    get()->~T();
                }
            }

            optional(const optional&) = delete;

            T& operator*() {
                assert(initialized);
                return *get();
            }

            explicit operator bool() const {
                return initialized;
            }

            optional& operator=(const T& v) {
                if (initialized) {
                    get()->~T();
                }
                new(get()) T(v);
                initialized = true;
            }

            optional& operator=(optional& o) {
                if (initialized) {
                    get()->~T();
                }
                new(get()) T(*o);
                initialized = true;
            }

        private:
            T* get() {
                return reinterpret_cast<T*>(&data);
            }

            bool initialized;
            typename std::aligned_storage<sizeof(T)>::type data;
        };
    }

    ////////////////////////////////////////////////////////////////////////////////
    // NEW INTERFACE
    ////////////////////////////////////////////////////////////////////////////////

    class JSInterface {
    public:
        JSInterface(internal::EM_VAL handle) {
            initialize(handle);
        }

        JSInterface(JSInterface& obj) {
            jsobj = obj.jsobj;
        }

        template<typename ReturnType, typename... Args>
        ReturnType call(const char* name, Args... args) {
            assertInitialized();
            return Caller<ReturnType, Args...>::call(*jsobj, name, args...);
        }

        static std::shared_ptr<JSInterface> cloneToSharedPtr(JSInterface& i) {
            return std::make_shared<JSInterface>(i);
        }

    private:
        void initialize(internal::EM_VAL handle) {
            if (jsobj) {
                internal::_embind_fatal_error(
                    "Cannot initialize interface wrapper twice",
                    "JSInterface");
            }
            jsobj = val::take_ownership(handle);
        }

        // this class only exists because you can't partially specialize function templates
        template<typename ReturnType, typename... Args>
        struct Caller {
            static ReturnType call(val& v, const char* name, Args... args) {
                return v.call(name, args...).template as<ReturnType>();
            }
        };

        template<typename... Args>
        struct Caller<void, Args...> {
            static void call(val& v, const char* name, Args... args) {
                v.call_void(name, args...);
            }
        };

        void assertInitialized() {
            if (!jsobj) {
                internal::_embind_fatal_error(
                    "Cannot invoke call on uninitialized Javascript interface wrapper.", "JSInterface");
            }
        }

        internal::optional<val> jsobj;
    };

    namespace internal {
        extern JSInterface* create_js_interface(EM_VAL e);
    }

    class register_js_interface {
    public:
        register_js_interface() {
            _embind_register_interface(
                internal::TypeID<JSInterface>::get(),
                "JSInterface",
                reinterpret_cast<internal::GenericFunction>(&internal::create_js_interface),
                reinterpret_cast<internal::GenericFunction>(&internal::raw_destructor<JSInterface>));
        }
    };
}

#define EMSCRIPTEN_BINDINGS(fn) static emscripten::internal::BindingsDefinition anon_symbol(fn);

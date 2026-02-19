cmake_minimum_required(VERSION 3.15)
project(jq-node-bindings)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Aggressive production optimizations
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

set(COMMON_OPT_FLAGS "-O3 -DNDEBUG -funroll-loops -ftree-vectorize -fomit-frame-pointer")

# Platform-specific optimizations
if(CMAKE_SYSTEM_PROCESSOR MATCHES "arm64|aarch64")
    set(ARCH_FLAGS "-mcpu=native")
elseif(CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|AMD64")
    set(ARCH_FLAGS "-march=native -mtune=native")
else()
    set(ARCH_FLAGS "")
endif()

# LTO (Link Time Optimization) for whole-program optimization
set(CMAKE_INTERPROCEDURAL_OPTIMIZATION TRUE)

set(CMAKE_C_FLAGS_RELEASE "${COMMON_OPT_FLAGS} ${ARCH_FLAGS}")
set(CMAKE_CXX_FLAGS_RELEASE "${COMMON_OPT_FLAGS} ${ARCH_FLAGS} -fno-exceptions -fno-rtti")

# Hide symbols by default (smaller binary, faster load)
set(CMAKE_C_VISIBILITY_PRESET hidden)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)
set(CMAKE_VISIBILITY_INLINES_HIDDEN ON)

# cmake-js integration
include_directories(${CMAKE_JS_INC})

# Build jq using ExternalProject (runs autoconf/make)
include(ExternalProject)

set(JQ_SOURCE_DIR ${CMAKE_SOURCE_DIR}/deps/jq)
set(JQ_INSTALL_DIR ${CMAKE_BINARY_DIR}/jq-install)

set(JQ_OPT_FLAGS "-fPIC -O3 -DNDEBUG -funroll-loops -ftree-vectorize -fomit-frame-pointer -fvisibility=hidden ${ARCH_FLAGS}")

ExternalProject_Add(jq_build
    SOURCE_DIR ${JQ_SOURCE_DIR}
    CONFIGURE_COMMAND ${CMAKE_COMMAND} -E env
        "CFLAGS=${JQ_OPT_FLAGS}"
        "CPPFLAGS=-D_REENTRANT -DNDEBUG"
        ${JQ_SOURCE_DIR}/configure
            --with-oniguruma=builtin
            --disable-maintainer-mode
            --enable-static
            --disable-shared
            --prefix=${JQ_INSTALL_DIR}
    BUILD_COMMAND make -j4
    INSTALL_COMMAND make install
    BUILD_IN_SOURCE 0
    BUILD_BYPRODUCTS
        ${JQ_INSTALL_DIR}/lib/libjq.a
        ${JQ_INSTALL_DIR}/lib/libonig.a
)

# Run autoreconf before configure if needed
ExternalProject_Add_Step(jq_build autoreconf
    COMMAND autoreconf -fi
    WORKING_DIRECTORY ${JQ_SOURCE_DIR}
    DEPENDERS configure
    DEPENDEES download
)

# Create imported target for libjq
add_library(jq_static STATIC IMPORTED)
set_target_properties(jq_static PROPERTIES
    IMPORTED_LOCATION ${JQ_INSTALL_DIR}/lib/libjq.a
)
add_dependencies(jq_static jq_build)

# Create imported target for libonig
add_library(onig_static STATIC IMPORTED)
set_target_properties(onig_static PROPERTIES
    IMPORTED_LOCATION ${JQ_INSTALL_DIR}/lib/libonig.a
)
add_dependencies(onig_static jq_build)

# Build the NAPI addon
add_library(${PROJECT_NAME} SHARED
    src/binding.cc
)

# Wait for jq to be built before compiling our addon
add_dependencies(${PROJECT_NAME} jq_build)

target_include_directories(${PROJECT_NAME} PRIVATE
    ${CMAKE_JS_INC}
    ${JQ_INSTALL_DIR}/include
)

target_link_libraries(${PROJECT_NAME} PRIVATE
    ${CMAKE_JS_LIB}
    ${JQ_INSTALL_DIR}/lib/libjq.a
    ${JQ_INSTALL_DIR}/lib/libonig.a
)

# Strip debug symbols in release for smaller binary
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    if(APPLE)
        add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
            COMMAND strip -x $<TARGET_FILE:${PROJECT_NAME}>
            COMMENT "Stripping debug symbols"
        )
    elseif(UNIX)
        add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
            COMMAND strip --strip-unneeded $<TARGET_FILE:${PROJECT_NAME}>
            COMMENT "Stripping debug symbols"
        )
    endif()
endif()

# Platform-specific settings
if(APPLE)
    set_target_properties(${PROJECT_NAME} PROPERTIES
        MACOSX_DEPLOYMENT_TARGET "12.0"
    )
endif()

# Set output name and extension for Node.js addon
set_target_properties(${PROJECT_NAME} PROPERTIES
    PREFIX ""
    SUFFIX ".node"
)

# Define NAPI version
target_compile_definitions(${PROJECT_NAME} PRIVATE
    NAPI_VERSION=8
    NAPI_DISABLE_CPP_EXCEPTIONS
)

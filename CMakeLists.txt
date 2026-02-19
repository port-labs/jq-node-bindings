cmake_minimum_required(VERSION 3.15)
project(jq-node-bindings)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# cmake-js integration
include_directories(${CMAKE_JS_INC})

# Build jq using ExternalProject (runs autoconf/make)
include(ExternalProject)

set(JQ_SOURCE_DIR ${CMAKE_SOURCE_DIR}/deps/jq)
set(JQ_INSTALL_DIR ${CMAKE_BINARY_DIR}/jq-install)

ExternalProject_Add(jq_build
    SOURCE_DIR ${JQ_SOURCE_DIR}
    CONFIGURE_COMMAND ${CMAKE_COMMAND} -E env
        CFLAGS=-fPIC
        CPPFLAGS=-D_REENTRANT
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

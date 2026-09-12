cmake_minimum_required(VERSION 3.9.0)
project(shaheen)

set(CMAKE_CXX_STANDARD 17)

# Support prebuilt jniLibs or Cargo cross-compile target directories
if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/src/main/jniLibs/${ANDROID_ABI}/libshaheen_core.so")
    set(SHAHEEN_CORE_BIN "${CMAKE_CURRENT_SOURCE_DIR}/src/main/jniLibs/${ANDROID_ABI}/libshaheen_core.so")
elseif(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/../rust/target/${ANDROID_ABI}/release/libshaheen_core.so")
    set(SHAHEEN_CORE_BIN "${CMAKE_CURRENT_SOURCE_DIR}/../rust/target/${ANDROID_ABI}/release/libshaheen_core.so")
else()
    set(SHAHEEN_CORE_BIN "${CMAKE_CURRENT_SOURCE_DIR}/../rust/target/release/libshaheen_core.so")
endif()

add_library(shaheen_core SHARED IMPORTED)
set_target_properties(shaheen_core PROPERTIES IMPORTED_LOCATION "${SHAHEEN_CORE_BIN}")

add_library(shaheen SHARED
    src/main/cpp/ShaheenModule.cpp
)

target_link_libraries(shaheen shaheen_core log)

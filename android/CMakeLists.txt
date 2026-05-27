cmake_minimum_required(VERSION 3.9.0)
project(shaheen)

set(CMAKE_CXX_STANDARD 17)

# Dynamically autolink matching platform architecture target outputs of Cargo cross-compiles
add_library(shaheen_core SHARED IMPORTED)
set_target_properties(shaheen_core PROPERTIES IMPORTED_LOCATION
    ${CMAKE_CURRENT_SOURCE_DIR}/../rust/target/${ANDROID_ABI}/release/libshaheen_core.so)

add_library(shaheen SHARED
    ../cpp/ShaheenJSI.cpp
    src/main/cpp/ShaheenModule.cpp
)

target_link_libraries(shaheen shaheen_core log)

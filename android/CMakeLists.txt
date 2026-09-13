cmake_minimum_required(VERSION 3.9.0)
project(shaheen)

set(CMAKE_CXX_STANDARD 17)

# Support prebuilt jniLibs or Cargo cross-compile target directories
if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/src/main/jniLibs/${ANDROID_ABI}/libshaheen_core.so")
    set(SHAHEEN_CORE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/src/main/jniLibs/${ANDROID_ABI}")
elseif(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/../rust/target/${ANDROID_ABI}/release/libshaheen_core.so")
    set(SHAHEEN_CORE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../rust/target/${ANDROID_ABI}/release")
else()
    set(SHAHEEN_CORE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../rust/target/release")
endif()

add_library(shaheen SHARED
    src/main/cpp/ShaheenModule.cpp
)

target_link_directories(shaheen PRIVATE "${SHAHEEN_CORE_DIR}")
target_link_libraries(shaheen shaheen_core log)

#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# Shaheen: Cross-Compile Rust Core (.so) for All Android ABIs
# Supported ABIs: arm64-v8a, armeabi-v7a, x86_64, x86
# -----------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUST_DIR="${ROOT_DIR}/rust"
JNILIBS_DIR="${ROOT_DIR}/android/src/main/jniLibs"

echo "=== Shaheen Android Native Cross-Compilation ==="

# Check for cargo-ndk
if ! command -v cargo-ndk &> /dev/null; then
    echo "cargo-ndk not found. Installing..."
    cargo install cargo-ndk
fi

# Ensure required rustup targets are installed
TARGETS=("aarch64-linux-android" "armv7-linux-androideabi" "x86_64-linux-android" "i686-linux-android")
for target in "${TARGETS[@]}"; do
    if ! rustup target list --installed | grep -q "^${target}$"; then
        echo "Installing rustup target: ${target}"
        rustup target add "${target}"
    fi
done

# Ensure NDK is available
if [ -z "${ANDROID_NDK_HOME:-}" ] && [ -n "${ANDROID_HOME:-}" ]; then
    if [ -d "${ANDROID_HOME}/ndk" ]; then
        LATEST_NDK=$(ls -1d "${ANDROID_HOME}/ndk/"* 2>/dev/null | sort -V | tail -n 1 || true)
        if [ -n "${LATEST_NDK}" ]; then
            export ANDROID_NDK_HOME="${LATEST_NDK}"
        fi
    fi
fi

if [ -z "${ANDROID_NDK_HOME:-}" ]; then
    echo "ERROR: ANDROID_NDK_HOME is not set."
    echo "Please set ANDROID_NDK_HOME to your Android NDK path."
    echo "Example: export ANDROID_NDK_HOME=/path/to/android-sdk/ndk/26.1.10909125"
    exit 1
fi

echo "Using Android NDK: ${ANDROID_NDK_HOME}"
mkdir -p "${JNILIBS_DIR}"

echo "Building release shared libraries (.so) across all 4 Android ABIs..."
cd "${RUST_DIR}"
cargo ndk \
    -t arm64-v8a \
    -t armeabi-v7a \
    -t x86_64 \
    -t x86 \
    -o "${JNILIBS_DIR}" \
    build --release

echo ""
echo "=== Verification of Generated Android Libraries ==="
ABIS=("arm64-v8a" "armeabi-v7a" "x86_64" "x86")
ALL_OK=true

for abi in "${ABIS[@]}"; do
    SO_PATH="${JNILIBS_DIR}/${abi}/libshaheen_core.so"
    if [ -f "${SO_PATH}" ]; then
        SIZE=$(du -h "${SO_PATH}" | cut -f1)
        echo "  [OK] ${abi}: ${SO_PATH} (${SIZE})"
    else
        echo "  [FAILED] Missing: ${SO_PATH}"
        ALL_OK=false
    fi
done

if [ "${ALL_OK}" = true ]; then
    echo "✅ Successfully built libshaheen_core.so for all 4 Android architectures!"
else
    echo "❌ One or more architectures failed to build."
    exit 1
fi

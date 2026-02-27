#!/bin/bash
# Build Claude Remote APK
# Handles the non-ASCII path workaround by building in C:\ccr-build
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="/c/ccr-build"
JAVA_HOME="C:/Program Files/Android/Android Studio/jbr"
SDK_DIR="$(cygpath -m "$LOCALAPPDATA/Android/Sdk")"
APK_NAME="claude-remote-release.apk"

echo "=== Claude Remote APK Build ==="
echo ""

# Step 1: Clean and copy
echo "[1/5] Copying to build directory..."
rm -rf "$BUILD_DIR"/* 2>/dev/null || true
mkdir -p "$BUILD_DIR"
powershell -Command "Copy-Item -Path '$(cygpath -w "$SCRIPT_DIR")\*' -Destination 'C:\ccr-build' -Recurse -Force -Exclude '*.apk','build-apk.sh'" 2>/dev/null
echo "  Done."

# Step 2: Install dependencies
echo "[2/5] Installing dependencies..."
cd "$BUILD_DIR"
npm install --silent 2>&1 | tail -1
echo "  Done."

# Step 3: Expo prebuild
echo "[3/5] Running expo prebuild..."
npx expo prebuild --clean 2>&1 | grep -E "✔|error|Error" || true
echo "  Done."

# Step 4: Patch build.gradle + local.properties
echo "[4/5] Patching build config..."
sed -i "s/namespace 'com.anonymous.app'/namespace 'com.anonymous.app'\n    archivesBaseName = \"claude-remote\"/" "$BUILD_DIR/android/app/build.gradle"
echo "sdk.dir=$SDK_DIR" > "$BUILD_DIR/android/local.properties"
echo "  Done."

# Step 5: Gradle build
echo "[5/5] Building APK (this takes ~2 minutes)..."
export JAVA_HOME
cd "$BUILD_DIR/android"
./gradlew assembleRelease 2>&1 | grep -E "BUILD|FAILURE|error:" || true

# Copy APK back
APK_PATH="$BUILD_DIR/android/app/build/outputs/apk/release/$APK_NAME"
if [ -f "$APK_PATH" ]; then
  powershell -Command "Copy-Item -Path '$(cygpath -w "$APK_PATH")' -Destination '$(cygpath -w "$SCRIPT_DIR/$APK_NAME")' -Force"
  SIZE=$(du -h "$SCRIPT_DIR/$APK_NAME" | cut -f1)
  echo ""
  echo "=== Build complete: $APK_NAME ($SIZE) ==="
else
  echo ""
  echo "=== Build FAILED ==="
  exit 1
fi

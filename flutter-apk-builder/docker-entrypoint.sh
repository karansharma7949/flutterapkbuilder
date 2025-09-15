#!/usr/bin/env bash
set -euo pipefail

# Directories
: "${TOOLING_DIR:=/app/.tooling}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:=${TOOLING_DIR}/android-sdk}"
export FLUTTER_HOME="${FLUTTER_HOME:=${TOOLING_DIR}/flutter}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:=/app/.gradle}"
export PUB_CACHE="${PUB_CACHE:=/app/.pub-cache}"

mkdir -p "$TOOLING_DIR" "$ANDROID_SDK_ROOT" "$GRADLE_USER_HOME" "$PUB_CACHE"

# Paths
export PATH="$FLUTTER_HOME/bin:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools:$PATH"

flutter_url="https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_3.24.0-stable.tar.xz"
cmdline_tools_url="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"

# Install Flutter SDK if missing
if [ ! -x "$FLUTTER_HOME/bin/flutter" ]; then
  echo "[entrypoint] Installing Flutter SDK to $FLUTTER_HOME ..."
  tmp_tar="$TOOLING_DIR/flutter.tar.xz"
  mkdir -p "$FLUTTER_HOME"
  curl -L "$flutter_url" -o "$tmp_tar"
  tar -xJf "$tmp_tar" -C "$TOOLING_DIR"
  # The archive extracts to $TOOLING_DIR/flutter
  rm -f "$tmp_tar"
fi

# Mark Flutter SDK as a safe git directory (inside container)
git config --global --add safe.directory "$FLUTTER_HOME" || true

# Install Android cmdline-tools if missing
if [ ! -x "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "[entrypoint] Installing Android cmdline-tools to $ANDROID_SDK_ROOT ..."
  mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools"
  tmp_zip="$TOOLING_DIR/cmdline-tools.zip"
  curl -L "$cmdline_tools_url" -o "$tmp_zip"
  unzip -q "$tmp_zip" -d "$ANDROID_SDK_ROOT/cmdline-tools"
  # The zip unpacks to a folder named 'cmdline-tools'; rename to 'latest'
  if [ -d "$ANDROID_SDK_ROOT/cmdline-tools/cmdline-tools" ]; then
    mv "$ANDROID_SDK_ROOT/cmdline-tools/cmdline-tools" "$ANDROID_SDK_ROOT/cmdline-tools/latest"
  fi
  rm -f "$tmp_zip"
fi

# Accept Android licenses and install minimal packages
yes "y" | sdkmanager --sdk_root="$ANDROID_SDK_ROOT" --licenses > /dev/null || true
sdkmanager --sdk_root="$ANDROID_SDK_ROOT" \
  "platform-tools" \
  "platforms;android-34" \
  "build-tools;34.0.0"

# Lightweight doctor (non-fatal)
flutter --version || true
flutter doctor -v || true

# Pre-warm pub for template (best effort)
if [ -d "/app/webview-template-main" ]; then
  (cd /app/webview-template-main && flutter pub get) || true
fi

# Start the Node server
cd /app/flutter-apk-builder
exec npm start

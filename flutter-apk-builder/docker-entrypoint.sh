#!/usr/bin/env bash
set -euo pipefail

# Directories
: "${TOOLING_DIR:=/app/.tooling}"
TMP_DIR="/tmp/tooling-cache"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:=${TOOLING_DIR}/android-sdk}"
export FLUTTER_HOME="${FLUTTER_HOME:=${TOOLING_DIR}/flutter}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:=/app/.gradle}"
export PUB_CACHE="${PUB_CACHE:=/app/.pub-cache}"

mkdir -p "$TOOLING_DIR" "$ANDROID_SDK_ROOT" "$GRADLE_USER_HOME" "$PUB_CACHE" "$TMP_DIR"

# Wait for the volume (TOOLING_DIR) to be mounted and writable (Railway may mount after start)
echo "[entrypoint] Ensuring tooling volume at $TOOLING_DIR is mounted and writable..."
retries=30
until (mkdir -p "$TOOLING_DIR" && touch "$TOOLING_DIR/.rw_test" && rm -f "$TOOLING_DIR/.rw_test"); do
  retries=$((retries-1)) || true
  if [ "$retries" -le 0 ]; then
    echo "[entrypoint] ERROR: $TOOLING_DIR not writable after waiting. Exiting." >&2
    exit 1
  fi
  echo "[entrypoint] Waiting for volume to mount... ($retries)"
  sleep 2
done

# Paths
export PATH="$FLUTTER_HOME/bin:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools:$PATH"

flutter_url="https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_3.24.0-stable.tar.xz"
cmdline_tools_url="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"

download_with_resume() {
  local url="$1"; shift
  local dest="$2"; shift
  local tmp="${dest}.part"
  local attempts=5
  echo "[entrypoint] Downloading $url -> $dest (resumable)"
  while [ $attempts -gt 0 ]; do
    # Use curl with resume, retries, and fail-fast on HTTP errors
    if curl -L --fail --retry 5 --retry-delay 5 --retry-connrefused -C - -o "$tmp" "$url"; then
      mv -f "$tmp" "$dest"
      return 0
    fi
    rc=$?
    echo "[entrypoint] Download failed with code $rc; retrying..." >&2
    attempts=$((attempts-1))
    sleep 3
  done
  echo "[entrypoint] ERROR: failed to download $url after retries" >&2
  return 1
}

# Prepare installer function
install_tooling() {
  # Install Flutter SDK if missing
  if [ ! -x "$FLUTTER_HOME/bin/flutter" ]; then
    echo "[entrypoint] Installing Flutter SDK to $FLUTTER_HOME ..."
    tmp_tar="$TMP_DIR/flutter.tar.xz"
    mkdir -p "$FLUTTER_HOME"
    download_with_resume "$flutter_url" "$tmp_tar"
    # Extract to temp and then move atomically into volume directory
    rm -rf "$TMP_DIR/flutter-extract" && mkdir -p "$TMP_DIR/flutter-extract"
    if ! tar -xJf "$tmp_tar" -C "$TMP_DIR/flutter-extract"; then
      echo "[entrypoint] Extraction failed, retrying download..."
      rm -f "$tmp_tar"
      download_with_resume "$flutter_url" "$tmp_tar"
      tar -xJf "$tmp_tar" -C "$TMP_DIR/flutter-extract"
    fi
    rm -f "$tmp_tar"
    # The archive extracts to $TMP_DIR/flutter-extract/flutter
    rm -rf "$FLUTTER_HOME" && mv "$TMP_DIR/flutter-extract/flutter" "$FLUTTER_HOME"
    rm -rf "$TMP_DIR/flutter-extract"
  fi

# Mark Flutter SDK as a safe git directory (inside container)
git config --global --add safe.directory "$FLUTTER_HOME" || true

  # Install Android cmdline-tools if missing
  if [ ! -x "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" ]; then
    echo "[entrypoint] Installing Android cmdline-tools to $ANDROID_SDK_ROOT ..."
    mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools"
    tmp_zip="$TMP_DIR/cmdline-tools.zip"
    download_with_resume "$cmdline_tools_url" "$tmp_zip"
    rm -rf "$TMP_DIR/cmdline-tools-extract" && mkdir -p "$TMP_DIR/cmdline-tools-extract"
    unzip -q "$tmp_zip" -d "$TMP_DIR/cmdline-tools-extract"
    if [ -d "$ANDROID_SDK_ROOT/cmdline-tools/cmdline-tools" ]; then
      mv "$ANDROID_SDK_ROOT/cmdline-tools/cmdline-tools" "$ANDROID_SDK_ROOT/cmdline-tools/latest"
    fi
    # Move extracted folder into place
    if [ -d "$TMP_DIR/cmdline-tools-extract/cmdline-tools" ]; then
      rm -rf "$ANDROID_SDK_ROOT/cmdline-tools/latest"
      mv "$TMP_DIR/cmdline-tools-extract/cmdline-tools" "$ANDROID_SDK_ROOT/cmdline-tools/latest"
    fi
    rm -rf "$TMP_DIR/cmdline-tools-extract" "$tmp_zip"
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

  touch "$TOOLING_DIR/.ready"
  echo "[entrypoint] Tooling ready."
}

# If tooling not ready, install in background to avoid platform startup timeouts
if [ ! -f "$TOOLING_DIR/.ready" ]; then
  echo "[entrypoint] Tooling not ready; starting background installer..."
  install_tooling &
fi

# Start the Node server (main process)
cd /app/flutter-apk-builder
exec npm start

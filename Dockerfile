# Dockerfile to run Node backend and build APKs using Flutter + Android SDK
# Base image with Flutter SDK (stable channel). Includes Android tooling in stable image.
FROM ghcr.io/cirruslabs/flutter:stable as runtime

# Install Node.js (LTS) and other utilities
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    node -v && npm -v && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy only package files first for better cache
COPY flutter-apk-builder/package*.json ./flutter-apk-builder/

# Install backend dependencies
WORKDIR /app/flutter-apk-builder
RUN npm ci --omit=dev || npm install --omit=dev

# Go back to repo root and copy the rest of the code
WORKDIR /app
COPY . .

# Ensure Flutter is available and pre-downloads
RUN flutter --version && \
    yes "y" | flutter doctor --android-licenses && \
    flutter doctor

# Pre-warm pub packages for the template to speed up first build (optional)
# This step is best-effort; it won’t fail the build if it doesn’t work.
RUN set -eux; \
    if [ -d "/app/webview-template-main" ]; then \
      cd /app/webview-template-main && flutter pub get || true; \
    fi

# Expose backend port
ENV PORT=3000
EXPOSE 3000

# Provide dedicated Gradle cache location within the app directory
ENV GRADLE_USER_HOME=/app/.gradle
RUN mkdir -p /app/.gradle && chmod -R 777 /app/.gradle

# Create a non-root user to run Flutter/Gradle more safely
RUN useradd -m -u 10001 app && \
    mkdir -p /home/app/.android /home/app/.gradle /home/app/.pub-cache && \
    # Make a user-local writable copy of the Flutter SDK
    cp -a /sdks/flutter /home/app/flutter && \
    chown -R app:app /home/app /app /home/app/flutter && \
    chown -R app:app /opt/android-sdk /opt/android-sdk-linux 2>/dev/null || true

# Configure environment for Flutter and Dart pub cache (point to user-local SDK)
ENV FLUTTER_ROOT=/home/app/flutter
ENV FLUTTER_HOME=/home/app/flutter
ENV PUB_CACHE=/home/app/.pub-cache
ENV PATH="$FLUTTER_ROOT/bin:$PATH"

# Switch to non-root user
USER app

# Default working dir for the server (after switching user)
WORKDIR /app/flutter-apk-builder

# Configure git safe.directory so Flutter SDK can use git
RUN git config --global --add safe.directory /home/app/flutter && \
    git config --global --add safe.directory /app

# Start the Node.js server
CMD ["npm", "start"]

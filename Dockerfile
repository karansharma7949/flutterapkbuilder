# Slim image: install tooling at runtime in entrypoint (Flutter/Android)
FROM node:18-slim

# Install minimal tools required to download and run Flutter/Android SDK
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash ca-certificates curl unzip xz-utils git openssh-client \
    openjdk-17-jdk \
    libglu1-mesa \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only package files first for better cache, then install dependencies
COPY flutter-apk-builder/package*.json ./flutter-apk-builder/
WORKDIR /app/flutter-apk-builder
RUN npm ci --omit=dev || npm install --omit=dev
WORKDIR /app
COPY . .

# Environment and cache directories (persist via Railway Volume if configured)
ENV PORT=3000
EXPOSE 3000
ENV TOOLING_DIR=/app/.tooling
ENV ANDROID_SDK_ROOT=/app/.tooling/android-sdk
ENV FLUTTER_HOME=/app/.tooling/flutter
ENV GRADLE_USER_HOME=/app/.gradle
ENV PUB_CACHE=/app/.pub-cache
RUN mkdir -p "$TOOLING_DIR" "$ANDROID_SDK_ROOT" "$GRADLE_USER_HOME" "$PUB_CACHE"

# Entrypoint performs runtime install of Flutter/Android if missing, accepts licenses, then starts server
WORKDIR /app
RUN chmod +x /app/flutter-apk-builder/docker-entrypoint.sh
CMD ["/bin/bash", "/app/flutter-apk-builder/docker-entrypoint.sh"]

# Full Flutter image with pre-installed SDK and Android tools
FROM ghcr.io/cirruslabs/flutter:stable

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
RUN set -eux; \
    if [ -d "/app/webview-template-main" ]; then \
      cd /app/webview-template-main && flutter pub get || true; \
    fi

# Expose backend port
ENV PORT=3000
EXPOSE 3000

# Provide dedicated cache locations within the app directory (will be persisted via volume)
ENV GRADLE_USER_HOME=/app/.gradle
ENV PUB_CACHE=/app/.pub-cache
RUN mkdir -p /app/.gradle /app/.pub-cache && chmod -R 777 /app/.gradle /app/.pub-cache

# Configure git safe.directory so Flutter SDK (preinstalled in the image under /sdks/flutter) can use git
RUN git config --global --add safe.directory /sdks/flutter && \
    git config --global --add safe.directory /app

# Default working dir for the server
WORKDIR /app/flutter-apk-builder

# Start the Node.js server
CMD ["npm", "start"]

# Flutter APK Builder API

A Node.js Express server that builds custom Flutter APKs from a webview template.

## Features

- Build Flutter APKs with custom app names, URLs, logos, and package names
- Download generated APK files
- Track build status and history
- RESTful API endpoints

## Installation

1. Install dependencies:
```bash
npm install
```

2. Make sure Flutter is installed and available in PATH
3. Ensure the `webview-template-main.zip` file is in the parent directory

## Usage

### Start the server
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The server will run on `http://localhost:3000`

## API Endpoints

### POST /build-apk
Build a custom Flutter APK

**Request Body:**
```json
{
  "app_name": "My Custom App",
  "app_url": "https://example.com",
  "logo_url": "https://example.com/logo.png",
  "package_name": "com.example.myapp"
}
```

**Response:**
```json
{
  "success": true,
  "buildId": "uuid-here",
  "message": "APK built successfully",
  "downloadUrl": "/builds/uuid-here/My_Custom_App-release.apk",
  "buildDetails": {
    "app_name": "My Custom App",
    "app_url": "https://example.com",
    "package_name": "com.example.myapp",
    "logo_url": "https://example.com/logo.png"
  }
}
```

### GET /build-status/:buildId
Check the status of a build

### GET /builds
List all builds with their status

### GET /health
Health check endpoint

## Build Process

The server performs the following steps when building an APK:

1. Extract the webview template from zip
2. Update the `.env` file with the provided URL
3. Run `flutter pub get` to get dependencies
4. Change the app name using the rename package
5. Download and set the custom logo
6. Generate launcher icons
7. Change the package name
8. Build the APK using `flutter build apk`
9. Make the APK available for download

## Requirements

- Node.js 16+
- Flutter SDK
- Android SDK (for APK building)

## Directory Structure

```
flutter-apk-builder/
├── server.js          # Main server file
├── package.json       # Dependencies
├── builds/            # Generated APK files
└── public/            # Static files (if needed)
```

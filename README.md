# Flutter APK Builder + Flutter WebView Template (Monorepo)

This repository contains two related projects:

- `flutter-apk-builder/` — A Node.js Express backend that builds custom Flutter APKs from a template.
- `webview-template-main/` — A Flutter app template configured to load a webview URL from `.env`.

The backend unzips `webview-template-main.zip` at build time, customizes values (app name, URL, icons, package name), and runs Flutter to produce a signed release APK inside `flutter-apk-builder/builds/`.

## Repository Layout

```
/                        # Monorepo root
├─ flutter-apk-builder/  # Node.js backend (Express)
│  ├─ server.js
│  ├─ package.json
│  └─ builds/            # Build outputs (gitignored)
├─ webview-template-main/ # Flutter app template
│  ├─ lib/
│  ├─ android/
│  ├─ ios/
│  ├─ web/
│  ├─ .env               # WEBVIEW_URL and icon path
│  └─ pubspec.yaml
└─ webview-template-main.zip # Zipped copy of the Flutter template used by the backend
```

## Getting Started

### Prerequisites
- Node.js 16+
- Flutter SDK
- Android SDK (for Android builds)
- Java/Keytool (for keystore generation during build)

### Backend (flutter-apk-builder)

```bash
cd flutter-apk-builder
npm install
npm start
# Server runs on http://localhost:3000
```

API endpoints are documented in `flutter-apk-builder/README.md`.

### Flutter template (webview-template-main)

```bash
cd webview-template-main
flutter pub get
flutter run
```

Update `WEBVIEW_URL` in `webview-template-main/.env` to point to your website when running locally.

## Git Hygiene

- Large build artifacts and OS/IDE files are excluded via the root `.gitignore`.
- The only zip tracked by Git is `webview-template-main.zip`, required by the backend.

## Pushing to GitHub (quick guide)

1) Initialize Git and commit:
```bash
git init -b main
git add .
git commit -m "Initial commit: backend + Flutter template"
```

2) Create a new GitHub repository (via web UI or `gh` CLI) and set the remote:
```bash
# Using gh CLI (replace REPO_NAME and optionally org/username)
gh repo create REPO_NAME --public --source . --remote origin --push

# Or manually if you created the repo in the browser
git remote add origin https://github.com/<your-username>/<repo>.git
git push -u origin main
```

## Notes
- `flutter-apk-builder/server.js` expects `webview-template-main.zip` to be located at the repository root (one level above the backend). If you move files, update the path in `server.js` accordingly.
- The Flutter Android Gradle wrapper is pinned to 8.4 (see `webview-template-main/android/gradle/wrapper/gradle-wrapper.properties`).

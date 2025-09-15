/// Global configuration constants for the WebView app.
/// These are intentionally plain constants (not secrets) to avoid .env usage.

/// The URL the WebView should load on startup.
/// During automated builds, the backend replaces APP_URL_PLACEHOLDER with the
/// desired URL.
const String kWebviewUrl = 'APP_URL_PLACEHOLDER';

/// The splash logo path. Can be a network URL (http/https) or a local asset path.
/// Defaults to the bundled asset path.
const String kSplashLogo = 'assets/icons/logo.png';

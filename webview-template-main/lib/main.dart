import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:flutter/services.dart';
import 'config/constants.dart';
import 'dart:async';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Set a safe default overlay right away
  final brightness =
      WidgetsBinding.instance.platformDispatcher.platformBrightness;
  SystemChrome.setSystemUIOverlayStyle(
    brightness == Brightness.dark
        ? const SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness: Brightness.light,
            systemNavigationBarColor: Colors.black,
            systemNavigationBarIconBrightness: Brightness.light,
          )
        : const SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness: Brightness.dark,
            systemNavigationBarColor: Colors.white,
            systemNavigationBarIconBrightness: Brightness.dark,
          ),
  );

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'apk',
      theme: ThemeData(
        brightness: Brightness.light,
        scaffoldBackgroundColor: Colors.white,
      ),
      darkTheme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: Colors.black,
      ),
      themeMode: ThemeMode.system,
      home: Builder(
        builder: (context) {
          final brightness = MediaQuery.of(context).platformBrightness;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            SystemChrome.setSystemUIOverlayStyle(
              brightness == Brightness.dark
                  ? const SystemUiOverlayStyle(
                      statusBarColor: Colors.transparent,
                      statusBarIconBrightness: Brightness.light,
                      systemNavigationBarColor: Colors.black,
                      systemNavigationBarIconBrightness: Brightness.light,
                    )
                  : const SystemUiOverlayStyle(
                      statusBarColor: Colors.transparent,
                      statusBarIconBrightness: Brightness.dark,
                      systemNavigationBarColor: Colors.white,
                      systemNavigationBarIconBrightness: Brightness.dark,
                    ),
            );
          });
          return const MyHomePage(title: 'apk');
        },
      ),
    );
  }
}

class MyHomePage extends StatefulWidget {
  const MyHomePage({super.key, required this.title});
  final String title;

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  WebViewController? controller;
  bool _showSplash = true;
  Timer? _splashTimer;
  Brightness? _lastBrightness;

  @override
  void initState() {
    super.initState();
    _initializeWebView();

    // Start timer for splash screen
    _splashTimer = Timer(const Duration(seconds: 2), () {
      if (mounted) {
        setState(() => _showSplash = false);
      }
    });
  }

  void _initializeWebView() {
    final String initialUrl = kWebviewUrl;

    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (NavigationRequest request) {
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(Uri.parse(initialUrl));
  }

  @override
  void dispose() {
    _splashTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final brightness = MediaQuery.of(context).platformBrightness;
    final String logoPath = kSplashLogo;

    if (controller != null && _lastBrightness != brightness) {
      controller!.setBackgroundColor(
        brightness == Brightness.dark ? Colors.black : Colors.white,
      );
      _lastBrightness = brightness;
    }

    // ✅ This will always enforce system UI style correctly
    final overlayStyle = brightness == Brightness.dark
        ? const SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness: Brightness.light,
            systemNavigationBarColor: Colors.black,
            systemNavigationBarIconBrightness: Brightness.light,
          )
        : const SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness: Brightness.dark,
            systemNavigationBarColor: Colors.white,
            systemNavigationBarIconBrightness: Brightness.dark,
          );

    final splashLogo = ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: Image.asset(
        logoPath,
        width: 130,
        height: 130,
        fit: BoxFit.contain,
      ),
    );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: overlayStyle,
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: SafeArea(
          child: PopScope(
            canPop: false,
            onPopInvokedWithResult: (bool didPop, Object? result) async {
              if (!didPop && controller != null) {
                if (await controller!.canGoBack()) {
                  controller!.goBack();
                } else {
                  SystemNavigator.pop();
                }
              } else if (!didPop) {
                SystemNavigator.pop();
              }
            },
            child: _showSplash
                ? Container(
                    color: brightness == Brightness.dark
                        ? Colors.black
                        : Colors.white,
                    child: Center(child: splashLogo),
                  )
                : controller != null
                    ? Container(
                        color: brightness == Brightness.dark
                            ? Colors.black
                            : Colors.white,
                        child: WebViewWidget(controller: controller!),
                      )
                    : Container(
                        color: brightness == Brightness.dark
                            ? Colors.black
                            : Colors.white,
                        child: const Center(child: CircularProgressIndicator()),
                      ),
          ),
        ),
      ),
    );
  }
}

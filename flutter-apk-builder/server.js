import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import yauzl from 'yauzl';
import yazl from 'yazl';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const execAsync = promisify(exec);
const SKIP_TOOLING_CHECK = String(process.env.SKIP_TOOLING_CHECK || '').toLowerCase() === 'true' || process.env.SKIP_TOOLING_CHECK === '1';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/builds', express.static(path.join(__dirname, 'builds')));

// Utility function to extract zip file
function extractZip(zipPath, extractPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      
      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName)) {
          // Directory entry
          fs.ensureDirSync(path.join(extractPath, entry.fileName));
          zipfile.readEntry();
        } else {
          // File entry
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) return reject(err);
            
            const filePath = path.join(extractPath, entry.fileName);
            fs.ensureDirSync(path.dirname(filePath));
            
            const writeStream = fs.createWriteStream(filePath);
            readStream.pipe(writeStream);
            writeStream.on('close', () => zipfile.readEntry());
          });

// Tooling readiness endpoint
app.get('/tooling-status', async (req, res) => {
  try {
    const toolingDir = path.join('/', 'app', '.tooling');
    const readyPath = path.join(toolingDir, '.ready');
    const installing = !(await fs.pathExists(readyPath));
    const exists = await fs.pathExists(toolingDir);
    res.json({
      exists,
      installing,
      ready: !installing,
      paths: {
        toolingDir,
        readyPath
      }
    });
  } catch (e) {
    res.status(500).json({ error: 'StatusError', message: e.message });
  }
});
        }
      });
      
      zipfile.on('end', () => resolve());
      zipfile.on('error', reject);
    });
  });
}

// Utility function to create zip file
function createZip(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const zipfile = new yazl.ZipFile();
    
    function addDirectory(dir, zipPath = '') {
      const items = fs.readdirSync(dir);
      
      items.forEach(item => {
        const fullPath = path.join(dir, item);
        const zipItemPath = path.join(zipPath, item).replace(/\\/g, '/');
        
        if (fs.statSync(fullPath).isDirectory()) {
          addDirectory(fullPath, zipItemPath);
        } else {
          zipfile.addFile(fullPath, zipItemPath);
        }
      });
    }
    
    addDirectory(sourceDir);
    zipfile.end();
    
    zipfile.outputStream.pipe(fs.createWriteStream(outputPath))
      .on('close', resolve)
      .on('error', reject);
  });
}

// Download file from URL
async function downloadFile(url, outputPath) {
  const response = await axios({
    method: 'GET',
    url: url,
    responseType: 'stream'
  });
  
  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);
  
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// Main POST endpoint to build Flutter APK
app.post('/build-apk', async (req, res) => {
  const { app_name, app_url, logo_url, package_name } = req.body;
  // No tooling check needed - Flutter/Android are pre-installed in the base image
  
  // Validate required fields
  if (!app_name || !app_url || !logo_url || !package_name) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['app_name', 'app_url', 'logo_url', 'package_name']
    });
  }
  
  const buildId = uuidv4();
  const buildDir = path.join(__dirname, 'builds', buildId);
  const templateZipPath = path.join(__dirname, '..', 'webview-template-main.zip');
  const workingDir = path.join(buildDir, 'webview-template-main');
  
  try {
    // Create build directory
    await fs.ensureDir(buildDir);
    
    // Extract template zip
    console.log('Extracting template...');
    await extractZip(templateZipPath, buildDir);
    
    // Overwrite extracted template files with refactored versions from repo
    // to ensure we use constants-based config instead of .env
    console.log('Syncing refactored template files...');
    const repoTemplateDir = path.join(__dirname, '..', 'webview-template-main');
    try {
      const srcMain = path.join(repoTemplateDir, 'lib', 'main.dart');
      const destMain = path.join(workingDir, 'lib', 'main.dart');
      await fs.copy(srcMain, destMain, { overwrite: true, errorOnExist: false });
    } catch (e) {
      console.warn('Warning: Failed to sync main.dart from repo template:', e.message);
    }
    try {
      const srcPubspec = path.join(repoTemplateDir, 'pubspec.yaml');
      const destPubspec = path.join(workingDir, 'pubspec.yaml');
      await fs.copy(srcPubspec, destPubspec, { overwrite: true, errorOnExist: false });
    } catch (e) {
      console.warn('Warning: Failed to sync pubspec.yaml from repo template:', e.message);
    }
    
    // Ensure/update Flutter constants file with provided URL
    console.log('Configuring Flutter constants...');
    const constantsDir = path.join(workingDir, 'lib', 'config');
    const constantsPath = path.join(constantsDir, 'constants.dart');
    await fs.ensureDir(constantsDir);
    const defaultConstants = `/// Global configuration constants for the WebView app.\n`
      + `/// These are intentionally plain constants (not secrets) to avoid .env usage.\n\n`
      + `/// The URL the WebView should load on startup.\n`
      + `const String kWebviewUrl = 'APP_URL_PLACEHOLDER';\n\n`
      + `/// The splash logo path. Can be a network URL (http/https) or a local asset path.\n`
      + `const String kSplashLogo = 'assets/icons/logo.png';\n`;
    let constantsContent;
    if (await fs.pathExists(constantsPath)) {
      constantsContent = await fs.readFile(constantsPath, 'utf8');
      constantsContent = constantsContent.replace('APP_URL_PLACEHOLDER', app_url);
    } else {
      constantsContent = defaultConstants.replace('APP_URL_PLACEHOLDER', app_url);
    }
    await fs.writeFile(constantsPath, constantsContent);
    
    // Fix Gradle version compatibility and reduce distribution size (use bin over all)
    console.log('Updating Gradle version...');
    const gradleWrapperPath = path.join(workingDir, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties');
    let gradleContent = await fs.readFile(gradleWrapperPath, 'utf8');
    gradleContent = gradleContent
      .replace(/gradle-8\.3-(all|bin)\.zip/g, 'gradle-8.4-bin.zip')
      .replace(/gradle-8\.4-(all)\.zip/g, 'gradle-8.4-bin.zip');
    await fs.writeFile(gradleWrapperPath, gradleContent);

    // Constrain Gradle memory and disable daemon to avoid OOM/daemon crash in limited environments
    console.log('Configuring Gradle properties for low-memory environment...');
    const gradlePropsPath = path.join(workingDir, 'android', 'gradle.properties');
    const gradleProps = `# Added by server.js for Railway build stability\n`
      + `org.gradle.daemon=false\n`
      + `org.gradle.parallel=false\n`
      + `org.gradle.workers.max=2\n`
      + `org.gradle.jvmargs=-Xmx3g -XX:MaxMetaspaceSize=1g -Dfile.encoding=UTF-8\n`
      + `android.useAndroidX=true\n`
      + `android.enableJetifier=false\n`;
    try {
      if (await fs.pathExists(gradlePropsPath)) {
        const existing = await fs.readFile(gradlePropsPath, 'utf8');
        const merged = existing + (existing.endsWith('\n') ? '' : '\n') + gradleProps;
        await fs.writeFile(gradlePropsPath, merged);
      } else {
        await fs.writeFile(gradlePropsPath, gradleProps);
      }
    } catch (e) {
      console.warn('Warning: failed to write gradle.properties:', e.message);
    }

    // Change to working directory and run Flutter commands
    process.chdir(workingDir);
    
    // Git safe.directory already configured in Dockerfile

    // Get dependencies
    console.log('Getting Flutter dependencies...');
    await execAsync('flutter pub get');
    
    // Change app name
    console.log('Changing app name...');
    await execAsync(`flutter pub run rename setAppName --targets android,ios --value "${app_name}"`);
    
    // Download app icon
    console.log('Downloading app icon...');
    const logoPath = path.join(workingDir, 'assets', 'icons', 'logo.png');
    await fs.ensureDir(path.dirname(logoPath));
    await downloadFile(logo_url, logoPath);
    
    // Generate launcher icons
    console.log('Generating launcher icons...');
    await execAsync('flutter pub run flutter_launcher_icons:main');
    
    // Change package name
    console.log('Changing package name...');
    await execAsync(`flutter pub run rename setBundleId --targets android,ios --value "${package_name}"`);
    
    // Create keystore for release signing
    console.log('Creating keystore...');
    const keystorePath = path.join(workingDir, 'android', 'app', 'upload-keystore.jks');
    const keyPropertiesPath = path.join(workingDir, 'android', 'key.properties');
    
    // Ensure the android/app directory exists
    await fs.ensureDir(path.dirname(keystorePath));
    
    // Generate keystore
    await execAsync(`keytool -genkey -v -keystore "${keystorePath}" -alias upload -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=Flutter APK Builder, OU=Development, O=Company, L=City, S=State, C=US"`);
    
    // Create key.properties file
    const keyProperties = `storePassword=android
keyPassword=android
keyAlias=upload
storeFile=upload-keystore.jks`;
    await fs.writeFile(keyPropertiesPath, keyProperties);
    
    // Build APK (release version) with reduced memory usage
    console.log('Building APK...');
    await execAsync('flutter build apk --release --no-shrink --no-tree-shake-icons --android-skip-build-dependency-validation', {
      env: {
        ...process.env,
        CI: 'true',
        GRADLE_OPTS: '-Xmx3g -Dorg.gradle.daemon=false -Dorg.gradle.parallel=false -Dorg.gradle.workers.max=2',
        JAVA_TOOL_OPTIONS: '-Xmx3g -XX:MaxMetaspaceSize=1g -Dfile.encoding=UTF-8'
      }
    });
    
    // Copy APK to builds directory
    const apkSourcePath = path.join(workingDir, 'build', 'app', 'outputs', 'flutter-apk', 'app-release.apk');
    const apkDestPath = path.join(buildDir, `${app_name.replace(/\s+/g, '_')}-release.apk`);
    
    if (await fs.pathExists(apkSourcePath)) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      await fs.copy(apkSourcePath, apkDestPath);
      
      // Return success response with download link
      res.json({
        success: true,
        buildId: buildId,
        message: 'APK built successfully',
        downloadUrl: `${baseUrl}/builds/${buildId}/${path.basename(apkDestPath)}`,
        apkPath: apkDestPath,
        buildDetails: {
          app_name,
          app_url,
          package_name,
          logo_url
        }
      });
    } else {
      throw new Error('APK file not found after build');
    }
    
  } catch (error) {
    console.error('Build error:', error);
    
    // Clean up build directory on error
    try {
      await fs.remove(buildDir);
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError);
    }
    
    res.status(500).json({
      error: 'Build failed',
      message: error.message,
      buildId: buildId
    });
  }
});

// Get build status endpoint
app.get('/build-status/:buildId', async (req, res) => {
  const { buildId } = req.params;
  const buildDir = path.join(__dirname, 'builds', buildId);
  
  try {
    const exists = await fs.pathExists(buildDir);
    if (!exists) {
      return res.status(404).json({ error: 'Build not found' });
    }
    
    const files = await fs.readdir(buildDir);
    const apkFile = files.find(file => file.endsWith('.apk'));
    
    if (apkFile) {
      res.json({
        status: 'completed',
        buildId: buildId,
        downloadUrl: `/builds/${buildId}/${apkFile}`
      });
    } else {
      res.json({
        status: 'building',
        buildId: buildId
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Failed to check build status',
      message: error.message
    });
  }
});

// List all builds endpoint
app.get('/builds', async (req, res) => {
  try {
    const buildsDir = path.join(__dirname, 'builds');
    const exists = await fs.pathExists(buildsDir);
    
    if (!exists) {
      return res.json({ builds: [] });
    }
    
    const buildDirs = await fs.readdir(buildsDir);
    const builds = [];
    
    for (const buildId of buildDirs) {
      const buildDir = path.join(buildsDir, buildId);
      const stat = await fs.stat(buildDir);
      
      if (stat.isDirectory()) {
        const files = await fs.readdir(buildDir);
        const apkFile = files.find(file => file.endsWith('.apk'));
        
        builds.push({
          buildId,
          createdAt: stat.birthtime,
          status: apkFile ? 'completed' : 'building',
          downloadUrl: apkFile ? `${req.protocol}://${req.get('host')}/builds/${buildId}/${apkFile}` : null
        });
      }
    }
    
    res.json({ builds: builds.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list builds',
      message: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Tooling readiness endpoint for introspection
app.get('/tooling', async (req, res) => {
  try {
    // With full Flutter image, tooling is always ready
    res.json({
      ready: true,
      preInstalled: true,
      flutterPath: '/sdks/flutter'
    });
  } catch (e) {
    res.status(500).json({ error: 'ToolingCheckFailed', message: e.message });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Flutter APK Builder API',
    version: '1.0.0',
    endpoints: {
      'POST /build-apk': 'Build Flutter APK from webview template',
      'GET /build-status/:buildId': 'Check build status',
      'GET /builds': 'List all builds',
      'GET /health': 'Health check'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Flutter APK Builder server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Tooling status: http://localhost:${PORT}/tooling`);
  console.log(`API Documentation: http://localhost:${PORT}/`);
});

export default app;

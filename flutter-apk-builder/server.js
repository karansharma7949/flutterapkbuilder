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
    
    // Update .env file
    console.log('Updating .env file...');
    const envPath = path.join(workingDir, '.env');
    let envContent = await fs.readFile(envPath, 'utf8');
    envContent = envContent.replace('APP_URL_PLACEHOLDER', app_url);
    await fs.writeFile(envPath, envContent);
    
    // Fix Gradle version compatibility
    console.log('Updating Gradle version...');
    const gradleWrapperPath = path.join(workingDir, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties');
    let gradleContent = await fs.readFile(gradleWrapperPath, 'utf8');
    gradleContent = gradleContent.replace('gradle-8.3-all.zip', 'gradle-8.4-all.zip');
    await fs.writeFile(gradleWrapperPath, gradleContent);
    
    // Change to working directory and run Flutter commands
    process.chdir(workingDir);
    
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
    
    // Build APK (release version)
    console.log('Building APK...');
    await execAsync('flutter build apk --release');
    
    // Copy APK to builds directory
    const apkSourcePath = path.join(workingDir, 'build', 'app', 'outputs', 'flutter-apk', 'app-release.apk');
    const apkDestPath = path.join(buildDir, `${app_name.replace(/\s+/g, '_')}-release.apk`);
    
    if (await fs.pathExists(apkSourcePath)) {
      await fs.copy(apkSourcePath, apkDestPath);
      
      // Return success response with download link
      res.json({
        success: true,
        buildId: buildId,
        message: 'APK built successfully',
        downloadUrl: `http://localhost:3000/builds/${buildId}/${path.basename(apkDestPath)}`,
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
          downloadUrl: apkFile ? `/builds/${buildId}/${apkFile}` : null
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
  console.log(`API Documentation: http://localhost:${PORT}/`);
});

export default app;

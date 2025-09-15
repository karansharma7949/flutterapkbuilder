import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

// Test data
const testBuildData = {
  app_name: "Test WebView App",
  app_url: "https://www.google.com",
  logo_url: "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png",
  package_name: "com.test.webviewapp"
};

async function testAPI() {
  try {
    console.log('Testing Flutter APK Builder API...\n');

    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Health check:', healthResponse.data);

    // Test root endpoint
    console.log('\n2. Testing root endpoint...');
    const rootResponse = await axios.get(`${BASE_URL}/`);
    console.log('✅ Root endpoint:', rootResponse.data);

    // Test builds list (should be empty initially)
    console.log('\n3. Testing builds list...');
    const buildsResponse = await axios.get(`${BASE_URL}/builds`);
    console.log('✅ Builds list:', buildsResponse.data);

    // Test build APK endpoint (this will take time)
    console.log('\n4. Testing build APK endpoint...');
    console.log('⏳ Starting APK build (this may take several minutes)...');
    
    const buildResponse = await axios.post(`${BASE_URL}/build-apk`, testBuildData, {
      timeout: 300000 // 5 minutes timeout
    });
    
    console.log('✅ Build response:', buildResponse.data);

    if (buildResponse.data.success) {
      const buildId = buildResponse.data.buildId;
      
      // Test build status
      console.log('\n5. Testing build status...');
      const statusResponse = await axios.get(`${BASE_URL}/build-status/${buildId}`);
      console.log('✅ Build status:', statusResponse.data);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Always run the test when this file is executed directly
testAPI();

export { testAPI };

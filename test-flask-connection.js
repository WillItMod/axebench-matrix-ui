#!/usr/bin/env node

/**
 * Diagnostic script to test Flask backend connection
 * Tests the /api/devices endpoint that the Matrix UI uses
 */

const API_BASE_URL = 'http://localhost:5000';

async function testFlaskConnection() {
  console.log('='.repeat(60));
  console.log('AxeBench Flask Backend Connection Test');
  console.log('='.repeat(60));
  console.log(`Testing connection to: ${API_BASE_URL}`);
  console.log('');

  // Test 1: Basic connectivity
  console.log('Test 1: Basic connectivity to /api/devices');
  console.log('-'.repeat(60));
  try {
    const response = await fetch(`${API_BASE_URL}/api/devices`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Headers:`, Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✓ SUCCESS: Received ${Array.isArray(data) ? data.length : 0} devices`);
      console.log('Response data:', JSON.stringify(data, null, 2));
      
      // Test 2: Device status endpoint
      if (Array.isArray(data) && data.length > 0) {
        console.log('');
        console.log('Test 2: Device status endpoint');
        console.log('-'.repeat(60));
        const firstDevice = data[0];
        console.log(`Testing status for device: ${firstDevice.name}`);
        
        try {
          const statusResponse = await fetch(
            `${API_BASE_URL}/api/devices/${encodeURIComponent(firstDevice.name)}/status`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );
          
          console.log(`Status: ${statusResponse.status} ${statusResponse.statusText}`);
          
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            console.log(`✓ SUCCESS: Received device status`);
            console.log('Status data:', JSON.stringify(statusData, null, 2));
          } else {
            const errorText = await statusResponse.text();
            console.log(`✗ FAILED: ${errorText}`);
          }
        } catch (error) {
          console.log(`✗ ERROR: ${error.message}`);
        }
      }
    } else {
      const errorText = await response.text();
      console.log(`✗ FAILED: ${errorText}`);
    }
  } catch (error) {
    console.log(`✗ ERROR: ${error.message}`);
    console.log('');
    console.log('Possible causes:');
    console.log('  1. Flask backend is not running on port 5000');
    console.log('  2. Flask backend is running on a different port');
    console.log('  3. Network/firewall blocking the connection');
    console.log('  4. CORS configuration issue');
    console.log('');
    console.log('To fix:');
    console.log('  - Make sure web_interface.py is running: python web_interface.py');
    console.log('  - Check Flask console for any startup errors');
    console.log('  - Verify Flask is listening on 0.0.0.0:5000 or localhost:5000');
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Test complete');
  console.log('='.repeat(60));
}

testFlaskConnection();

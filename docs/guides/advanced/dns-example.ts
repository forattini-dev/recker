/**
 * Custom DNS Configuration Examples
 * Demonstrates how to use DNS override and custom DNS servers
 */

import { createClient } from '../src/index.js';

// Example 1: DNS Override (hostname to IP mapping)
// Useful for testing or bypassing DNS resolution
const clientWithOverride = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    override: {
      'api.example.com': '93.184.216.34', // Example IP
      'cdn.example.com': '151.101.129.67'
    }
  }
});

// Example 2: Custom DNS Servers
// Use Google DNS and Cloudflare DNS
const clientWithCustomDNS = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    servers: [
      '8.8.8.8',    // Google DNS
      '1.1.1.1'     // Cloudflare DNS
    ]
  }
});

// Example 3: Combined - Override + Custom DNS Servers
// Override takes precedence, then custom servers, then system DNS
const clientWithBoth = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    override: {
      'api.example.com': '1.2.3.4'
    },
    servers: ['8.8.8.8', '1.1.1.1'],
    timeout: 5000,        // DNS lookup timeout in ms
    preferIPv4: true      // Prefer IPv4 over IPv6
  }
});

// Example 4: DNS Override for Testing
// Redirect production API to local development server
const clientForTesting = createClient({
  baseUrl: 'https://production-api.com',
  dns: {
    override: {
      'production-api.com': '127.0.0.1'  // Redirect to localhost
    }
  }
});

// Example 5: Using with Proxy and DNS together
const clientWithProxyAndDNS = createClient({
  baseUrl: 'https://api.example.com',
  proxy: 'http://proxy.example.com:8080',
  dns: {
    servers: ['8.8.8.8']  // DNS is applied before proxy
  }
});

// Example usage
async function examples() {
  try {
    // This request will resolve api.example.com to 1.2.3.4 instead of actual DNS
    const response = await clientWithOverride.get('/users');
    console.log('Response from overridden DNS:', response.status);

    // This request will use Google DNS for resolution
    const response2 = await clientWithCustomDNS.get('/data');
    console.log('Response from custom DNS:', response2.status);

    // Testing scenario - redirect production to localhost
    const response3 = await clientForTesting.get('/health');
    console.log('Response from localhost:', response3.status);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run examples
if (import.meta.url === `file://${process.argv[1]}`) {
  examples();
}

export {
  clientWithOverride,
  clientWithCustomDNS,
  clientWithBoth,
  clientForTesting,
  clientWithProxyAndDNS
};

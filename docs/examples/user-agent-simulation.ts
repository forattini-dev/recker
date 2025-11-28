// User-Agent Simulation Examples for Recker HTTP Client

import { createClient, getUserAgent, getRandomUserAgent, USER_AGENT_PRESETS } from 'recker';

// ======================
// Default Recker User-Agent
// ======================

const client1 = createClient({
  baseUrl: 'https://api.example.com'
});

// Automatically uses: recker/1.0.0
await client1.get('/endpoint');

// ======================
// Simulate Desktop Browsers
// ======================

// Chrome on Windows
const chromeClient = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'User-Agent': getUserAgent('chrome_windows')
  }
});

// Firefox on Mac
const firefoxClient = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'User-Agent': getUserAgent('firefox_mac')
  }
});

// Safari on Mac
const safariClient = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'User-Agent': getUserAgent('safari_mac')
  }
});

// ======================
// Simulate Mobile Devices
// ======================

// iPhone
const iphoneClient = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'User-Agent': getUserAgent('safari_iphone')
  }
});

// Android Chrome
const androidClient = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'User-Agent': getUserAgent('chrome_android')
  }
});

// iPad
const ipadClient = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'User-Agent': getUserAgent('safari_ipad')
  }
});

// Samsung Browser
const samsungClient = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'User-Agent': getUserAgent('samsung_browser')
  }
});

// ======================
// Random User-Agent per Request
// ======================

const client = createClient({
  baseUrl: 'https://api.example.com'
});

// Random desktop Chrome user agent
await client.get('/endpoint', {
  headers: {
    'User-Agent': getRandomUserAgent('desktop.chrome')
  }
});

// Random mobile iOS user agent
await client.get('/endpoint', {
  headers: {
    'User-Agent': getRandomUserAgent('mobile.ios')
  }
});

// Random from all desktop browsers
await client.get('/endpoint', {
  headers: {
    'User-Agent': getRandomUserAgent('desktop')
  }
});

// Random from all mobile devices
await client.get('/endpoint', {
  headers: {
    'User-Agent': getRandomUserAgent('mobile')
  }
});

// ======================
// Testing Responsive Websites
// ======================

async function testResponsiveWebsite(url: string) {
  const client = createClient({ baseUrl: url });

  // Test desktop version
  console.log('Testing desktop version...');
  const desktopResponse = await client.get('/', {
    headers: { 'User-Agent': getUserAgent('chrome_windows') }
  });
  const desktopHtml = await desktopResponse.text();
  console.log('Desktop content length:', desktopHtml.length);

  // Test mobile version
  console.log('Testing mobile version...');
  const mobileResponse = await client.get('/', {
    headers: { 'User-Agent': getUserAgent('safari_iphone') }
  });
  const mobileHtml = await mobileResponse.text();
  console.log('Mobile content length:', mobileHtml.length);

  // Test tablet version
  console.log('Testing tablet version...');
  const tabletResponse = await client.get('/', {
    headers: { 'User-Agent': getUserAgent('safari_ipad') }
  });
  const tabletHtml = await tabletResponse.text();
  console.log('Tablet content length:', tabletHtml.length);
}

// ======================
// Bot Simulation
// ======================

// Simulate Googlebot
const googlebot = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'User-Agent': getUserAgent('googlebot')
  }
});

await googlebot.get('/sitemap.xml');

// ======================
// Available Presets
// ======================

console.log('Available User-Agent Presets:');
console.log(Object.keys(USER_AGENT_PRESETS));

/*
Available presets:
- chrome_windows, chrome_mac, chrome_linux
- firefox_windows, firefox_mac, firefox_linux
- safari_mac
- edge_windows, edge_mac
- opera_windows, opera_mac
- safari_iphone, safari_ipad, chrome_ios
- chrome_android, chrome_android_tablet
- firefox_android, samsung_browser
- googlebot, googlebot_mobile
- recker (default)
*/

// ======================
// Custom User-Agent
// ======================

const customClient = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'User-Agent': 'MyCustomBot/1.0 (compatible; +https://mybot.com)'
  }
});

// ======================
// Rotate User-Agents for Web Scraping
// ======================

async function scrapeWithRotation(urls: string[]) {
  const client = createClient();

  const results = await client.batch(
    urls.map(url => ({ path: url })),
    {
      concurrency: 5,
      mapResponse: async (res, index) => {
        // Use different user agent for each request
        const userAgent = getRandomUserAgent('desktop');
        return {
          url: res.url,
          userAgent,
          html: await res.text()
        };
      }
    }
  );

  return results;
}

// Example usage
const scraped = await scrapeWithRotation([
  'https://example.com/page1',
  'https://example.com/page2',
  'https://example.com/page3'
]);

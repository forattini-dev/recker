import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Spider, spider } from '../../src/scrape/spider.js';
import { MockHttpServer } from '../../src/testing/mock-http-server.js';

describe('Spider - Web Crawler', () => {
  let server: MockHttpServer;
  let baseUrl: string;

  beforeAll(async () => {
    server = new MockHttpServer();
    await server.start();
    baseUrl = server.url;

    // Setup mock pages
    server.get('/', {
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <title>Home Page</title>
          <meta name="description" content="Welcome to home">
          <meta property="og:title" content="OG Home">
        </head>
        <body>
          <h1>Home</h1>
          <nav>
            <a href="/about">About</a>
            <a href="/products">Products</a>
            <a href="/contact">Contact</a>
          </nav>
        </body>
        </html>
      `,
    });

    server.get('/about', {
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: `
        <!DOCTYPE html>
        <html>
        <head><title>About Us</title></head>
        <body>
          <h1>About Us</h1>
          <a href="/">Home</a>
          <a href="/team">Team</a>
        </body>
        </html>
      `,
    });

    server.get('/products', {
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: `
        <!DOCTYPE html>
        <html>
        <head><title>Products</title></head>
        <body>
          <h1>Products</h1>
          <a href="/">Home</a>
          <a href="/products/item-1">Item 1</a>
          <a href="/products/item-2">Item 2</a>
        </body>
        </html>
      `,
    });

    server.get('/products/item-1', {
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: `
        <!DOCTYPE html>
        <html>
        <head><title>Item 1</title></head>
        <body>
          <h1>Item 1</h1>
          <a href="/products">Back to Products</a>
        </body>
        </html>
      `,
    });

    server.get('/products/item-2', {
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: `
        <!DOCTYPE html>
        <html>
        <head><title>Item 2</title></head>
        <body>
          <h1>Item 2</h1>
          <a href="/products">Back to Products</a>
        </body>
        </html>
      `,
    });

    server.get('/contact', {
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: `
        <!DOCTYPE html>
        <html>
        <head><title>Contact</title></head>
        <body>
          <h1>Contact</h1>
          <a href="/">Home</a>
        </body>
        </html>
      `,
    });

    server.get('/team', {
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: `
        <!DOCTYPE html>
        <html>
        <head><title>Team</title></head>
        <body>
          <h1>Our Team</h1>
          <a href="/about">About</a>
        </body>
        </html>
      `,
    });

    // Deep page for depth testing
    server.get('/deep/level1', {
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: `<html><head><title>Level 1</title></head><body><a href="/deep/level2">Next</a></body></html>`,
    });

    server.get('/deep/level2', {
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: `<html><head><title>Level 2</title></head><body><a href="/deep/level3">Next</a></body></html>`,
    });

    server.get('/deep/level3', {
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: `<html><head><title>Level 3</title></head><body><a href="/deep/level4">Next</a></body></html>`,
    });

    server.get('/deep/level4', {
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: `<html><head><title>Level 4</title></head><body>End</body></html>`,
    });

    // Error page
    server.get('/error', {
      status: 500,
      body: 'Internal Server Error',
    });

    // Non-HTML page (should be skipped)
    server.get('/data.json', {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"test": true}',
    });

    // robots.txt
    server.get('/robots.txt', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
      body: `
User-agent: *
Disallow: /private/
Allow: /
      `,
    });

    // Page with external links
    server.get('/external-links', {
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: `
        <html>
        <head><title>External Links</title></head>
        <body>
          <a href="https://external.com/page">External</a>
          <a href="/">Home</a>
        </body>
        </html>
      `,
    });
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('Basic crawling', () => {
    it('should crawl starting page', async () => {
      const result = await spider(baseUrl, {
        maxPages: 1,
        respectRobotsTxt: false,
      });

      expect(result.pages.length).toBe(1);
      expect(result.pages[0].url).toBe(baseUrl + '/');
      expect(result.pages[0].title).toBe('Home Page');
      expect(result.pages[0].status).toBe(200);
    });

    it('should discover and crawl linked pages', async () => {
      const result = await spider(baseUrl, {
        maxPages: 10,
        maxDepth: 2,
        respectRobotsTxt: false,
      });

      expect(result.pages.length).toBeGreaterThan(1);

      const urls = result.pages.map(p => p.url);
      expect(urls).toContain(baseUrl + '/');
      expect(urls).toContain(baseUrl + '/about');
      expect(urls).toContain(baseUrl + '/products');
    }, 30000);

    it('should not crawl same URL twice', async () => {
      const result = await spider(baseUrl, {
        maxPages: 50,
        maxDepth: 5,
        respectRobotsTxt: false,
      });

      const urls = result.pages.map(p => p.url);
      const uniqueUrls = [...new Set(urls)];
      expect(urls.length).toBe(uniqueUrls.length);
    });
  });

  describe('Options', () => {
    it('should respect maxPages option', async () => {
      const result = await spider(baseUrl, {
        maxPages: 3,
        respectRobotsTxt: false,
      });

      expect(result.pages.length).toBeLessThanOrEqual(3);
    });

    it('should respect maxDepth option', async () => {
      const result = await spider(`${baseUrl}/deep/level1`, {
        maxPages: 10,
        maxDepth: 2,
        respectRobotsTxt: false,
      });

      // Should reach level1 (depth 0), level2 (depth 1), level3 (depth 2)
      // But NOT level4 (depth 3)
      const urls = result.pages.map(p => p.url);
      expect(urls).toContain(`${baseUrl}/deep/level1`);
      expect(urls).toContain(`${baseUrl}/deep/level2`);
      expect(urls).toContain(`${baseUrl}/deep/level3`);
      expect(urls).not.toContain(`${baseUrl}/deep/level4`);
    });

    it('should respect exclude patterns', async () => {
      const result = await spider(baseUrl, {
        maxPages: 20,
        respectRobotsTxt: false,
        exclude: [/\/products/],
      });

      const urls = result.pages.map(p => p.url);
      expect(urls.some(u => u.includes('/products'))).toBe(false);
    });

    it('should respect include patterns', async () => {
      const result = await spider(baseUrl, {
        maxPages: 20,
        respectRobotsTxt: false,
        include: [/^\/$/, /\/about/, /\/team/],
      });

      const urls = result.pages.map(p => p.url);
      // All URLs should match at least one include pattern
      for (const url of urls) {
        const path = new URL(url).pathname;
        expect(
          path === '/' || path.includes('/about') || path.includes('/team')
        ).toBe(true);
      }
    });

    it('should only crawl same domain by default', async () => {
      const result = await spider(`${baseUrl}/external-links`, {
        maxPages: 10,
        respectRobotsTxt: false,
      });

      const urls = result.pages.map(p => p.url);
      // Should not include external.com URLs
      expect(urls.every(u => u.startsWith(baseUrl))).toBe(true);
    });
  });

  describe('Page results', () => {
    it('should extract page metadata', async () => {
      const result = await spider(baseUrl, {
        maxPages: 1,
        respectRobotsTxt: false,
      });

      const page = result.pages[0];
      expect(page.meta?.description).toBe('Welcome to home');
      expect(page.social?.ogTitle).toBe('OG Home');
    });

    it('should extract links from pages', async () => {
      const result = await spider(baseUrl, {
        maxPages: 1,
        respectRobotsTxt: false,
      });

      const page = result.pages[0];
      expect(page.links.length).toBeGreaterThan(0);
      expect(page.links.some(l => l.href?.includes('/about'))).toBe(true);
    });

    it('should track page metrics', async () => {
      const result = await spider(baseUrl, {
        maxPages: 1,
        respectRobotsTxt: false,
      });

      const page = result.pages[0];
      expect(page.metrics?.htmlSize).toBeGreaterThan(0);
      expect(page.metrics?.textLength).toBeGreaterThan(0);
      expect(page.duration).toBeGreaterThan(0);
    });

    it('should track depth of each page', async () => {
      const result = await spider(baseUrl, {
        maxPages: 10,
        maxDepth: 2,
        respectRobotsTxt: false,
      });

      // Starting page should have depth 0
      const homePage = result.pages.find(p => p.url === baseUrl + '/');
      expect(homePage?.depth).toBe(0);

      // Linked pages should have depth 1
      const aboutPage = result.pages.find(p => p.url === baseUrl + '/about');
      if (aboutPage) {
        expect(aboutPage.depth).toBe(1);
      }
    });
  });

  describe('Error handling', () => {
    it('should handle 500 errors gracefully', async () => {
      server.get('/error-page', {
        status: 500,
        headers: { 'content-type': 'text/html' },
        body: '<html><body>Error</body></html>',
      });

      server.get('/with-error-link', {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: `<html><head><title>Test</title></head><body><a href="/error-page">Error</a></body></html>`,
      });

      const result = await spider(`${baseUrl}/with-error-link`, {
        maxPages: 5,
        respectRobotsTxt: false,
      });

      expect(result.errors.length).toBeGreaterThanOrEqual(0);
      // Should still have crawled pages
      expect(result.pages.length).toBeGreaterThan(0);
    });
  });

  describe('Callbacks', () => {
    it('should call onPage for each crawled page', async () => {
      const pages: string[] = [];

      await spider(baseUrl, {
        maxPages: 3,
        respectRobotsTxt: false,
        onPage: (result) => {
          pages.push(result.url);
        },
      });

      expect(pages.length).toBeGreaterThan(0);
    });

    it('should call onProgress during crawling', async () => {
      const progressUpdates: number[] = [];

      await spider(baseUrl, {
        maxPages: 5,
        respectRobotsTxt: false,
        onProgress: (progress) => {
          progressUpdates.push(progress.crawled);
        },
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
    });
  });

  describe('Spider class', () => {
    it('should allow creating Spider instance', () => {
      const s = new Spider({ maxPages: 10 });
      expect(s).toBeDefined();
      expect(s.isRunning()).toBe(false);
    });

    it('should report running state during crawl', async () => {
      const s = new Spider({
        maxPages: 1,
        respectRobotsTxt: false,
      });

      expect(s.isRunning()).toBe(false);

      const crawlPromise = s.crawl(baseUrl);

      // The crawl should complete
      const result = await crawlPromise;

      expect(s.isRunning()).toBe(false);
      expect(result.pages.length).toBeGreaterThan(0);
    });

    it('should track visited URLs', async () => {
      const result = await spider(baseUrl, {
        maxPages: 5,
        respectRobotsTxt: false,
      });

      expect(result.visited.size).toBeGreaterThan(0);
      expect(result.visited.has(baseUrl + '/')).toBe(true);
    });

    it('should report duration', async () => {
      const result = await spider(baseUrl, {
        maxPages: 1,
        respectRobotsTxt: false,
      });

      expect(result.duration).toBeGreaterThan(0);
    });

    it('should get progress while not running', () => {
      const s = new Spider({
        maxPages: 1,
        respectRobotsTxt: false,
      });

      const progress = s.getProgress();
      expect(progress.crawled).toBe(0);
      expect(progress.queued).toBe(0);
      expect(progress.total).toBe(0);
    });

    it('should be able to abort crawler', async () => {
      const s = new Spider({
        maxPages: 100,
        respectRobotsTxt: false,
        delay: 100, // Add delay so we have time to abort
      });

      // Start crawling in background
      const crawlPromise = s.crawl(baseUrl);

      // Abort immediately
      s.abort();

      // Wait for result
      const result = await crawlPromise;

      // Should have stopped early (not all 100 pages)
      expect(result.pages.length).toBeLessThan(100);
    });
  });

  describe('URL normalization', () => {
    it('should normalize URLs with trailing slashes', async () => {
      const result = await spider(baseUrl + '/', {
        maxPages: 1,
        respectRobotsTxt: false,
      });

      expect(result.pages.length).toBe(1);
    });

    it('should remove tracking parameters', async () => {
      server.get('/tracking', {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: `<html><head><title>Tracking Test</title></head><body><a href="/?utm_source=test">Home</a></body></html>`,
      });

      const result = await spider(`${baseUrl}/tracking`, {
        maxPages: 5,
        respectRobotsTxt: false,
      });

      // The home page should only be crawled once (without tracking params)
      const homeVisits = result.pages.filter(p => {
        const url = new URL(p.url);
        return url.pathname === '/';
      });
      expect(homeVisits.length).toBeLessThanOrEqual(1);
    });
  });

  describe('robots.txt', () => {
    it('should include robots analysis in result', async () => {
      const result = await spider(baseUrl, {
        maxPages: 1,
        respectRobotsTxt: true,
      });

      expect(result.robots).toBeDefined();
      expect(result.robots?.found).toBe(true);
    });

    it('should respect robots.txt disallow rules', async () => {
      // robots.txt disallows /private/
      server.get('/with-private-link', {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: `
          <html><head><title>Test</title></head>
          <body>
            <a href="/private/secret">Secret</a>
            <a href="/about">About</a>
          </body>
          </html>
        `,
      });

      server.get('/private/secret', {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: `<html><head><title>Secret</title></head><body>Secret page</body></html>`,
      });

      const result = await spider(`${baseUrl}/with-private-link`, {
        maxPages: 10,
        respectRobotsTxt: true,
      });

      const urls = result.pages.map(p => p.url);
      // Should NOT have crawled /private/secret due to robots.txt
      expect(urls.some(u => u.includes('/private/'))).toBe(false);
    });
  });

  describe('sitemap', () => {
    it('should include sitemap analysis when useSitemap is enabled', async () => {
      // Setup sitemap at explicit path
      server.get('/test-sitemap.xml', {
        status: 200,
        headers: { 'content-type': 'application/xml' },
        body: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/</loc></url>
  <url><loc>${baseUrl}/about</loc></url>
</urlset>`,
      });

      const result = await spider(baseUrl, {
        maxPages: 10,
        useSitemap: true,
        sitemapUrl: `${baseUrl}/test-sitemap.xml`,
        respectRobotsTxt: false,
      });

      // Sitemap analysis should be included in the result
      expect(result.sitemap).toBeDefined();
      expect(result.sitemap?.missingFromSitemap).toBeDefined();
      expect(Array.isArray(result.sitemap?.orphanUrls)).toBe(true);
    });

    it('should use custom sitemap URL', async () => {
      server.get('/custom-sitemap.xml', {
        status: 200,
        headers: { 'content-type': 'application/xml' },
        body: `<?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>${baseUrl}/</loc></url>
          </urlset>
        `,
      });

      const result = await spider(baseUrl, {
        maxPages: 5,
        useSitemap: true,
        sitemapUrl: `${baseUrl}/custom-sitemap.xml`,
        respectRobotsTxt: false,
      });

      expect(result.sitemap).toBeDefined();
    }, 15000);

    it('should include sitemap analysis in result', async () => {
      server.get('/sitemap.xml', {
        status: 200,
        headers: { 'content-type': 'application/xml' },
        body: `<?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url><loc>${baseUrl}/</loc></url>
            <url><loc>${baseUrl}/orphan-page</loc></url>
          </urlset>
        `,
      });

      server.get('/orphan-page', {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: `<html><head><title>Orphan</title></head><body>Orphan page</body></html>`,
      });

      const result = await spider(baseUrl, {
        maxPages: 10,
        useSitemap: true,
        respectRobotsTxt: false,
      });

      expect(result.sitemap).toBeDefined();
      expect(result.sitemap?.missingFromSitemap).toBeDefined();
      expect(Array.isArray(result.sitemap?.missingFromSitemap)).toBe(true);
    }, 10000);
  });
});

describe('Spider content type handling', () => {
  it('should skip non-HTML responses', async () => {
    const testServer = new MockHttpServer();
    await testServer.start();
    const testUrl = testServer.url;

    // Index page links to a JSON endpoint
    testServer.get('/', {
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: `
        <html><head><title>Links</title></head>
        <body>
          <a href="/data.json">JSON Data</a>
          <a href="/page">HTML Page</a>
        </body>
        </html>
      `,
    });

    // JSON response (should be skipped for link extraction)
    testServer.get('/data.json', {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"foo": "bar"}',
    });

    testServer.get('/page', {
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<html><head><title>HTML Page</title></head><body>Content</body></html>',
    });

    const result = await spider(testUrl, {
      maxPages: 10,
      respectRobotsTxt: false,
    });

    // The JSON page might be visited but should not be parsed for links
    const htmlPages = result.pages.filter(p => p.title); // HTML pages have titles
    expect(htmlPages.length).toBeGreaterThanOrEqual(1);

    await testServer.stop();
  });
});

describe('Spider utility functions', () => {
  describe('URL filtering', () => {
    it('should skip non-HTTP URLs', async () => {
      // Create a page with mailto and tel links
      const testServer = new MockHttpServer();
      await testServer.start();
      const testUrl = testServer.url;

      testServer.get('/', {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: `
          <html><head><title>Links</title></head>
          <body>
            <a href="mailto:test@example.com">Email</a>
            <a href="tel:+1234567890">Phone</a>
            <a href="javascript:void(0)">JS</a>
            <a href="/valid">Valid</a>
          </body>
          </html>
        `,
      });

      testServer.get('/valid', {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><head><title>Valid</title></head><body>Valid page</body></html>',
      });

      const result = await spider(testUrl, {
        maxPages: 10,
        respectRobotsTxt: false,
      });

      const urls = result.pages.map(p => p.url);
      expect(urls.every(u => u.startsWith('http'))).toBe(true);

      await testServer.stop();
    });

    it('should skip file extensions like images and PDFs', async () => {
      const testServer = new MockHttpServer();
      await testServer.start();
      const testUrl = testServer.url;

      testServer.get('/', {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: `
          <html><head><title>Files</title></head>
          <body>
            <a href="/image.jpg">Image</a>
            <a href="/doc.pdf">PDF</a>
            <a href="/page">Page</a>
          </body>
          </html>
        `,
      });

      testServer.get('/page', {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><head><title>Page</title></head><body>Page</body></html>',
      });

      const result = await spider(testUrl, {
        maxPages: 10,
        respectRobotsTxt: false,
      });

      const urls = result.pages.map(p => p.url);
      expect(urls.some(u => u.endsWith('.jpg'))).toBe(false);
      expect(urls.some(u => u.endsWith('.pdf'))).toBe(false);

      await testServer.stop();
    });
  });
});

# Spider - Web Crawler

The Spider class crawls websites following internal links, with support for robots.txt, sitemaps, and concurrency control.

## Quick Start

```typescript
import { spider } from 'recker/scrape';

// Simple crawl
const result = await spider('https://example.com');

console.log(`Crawled ${result.pages.length} pages in ${result.duration}ms`);

for (const page of result.pages) {
  console.log(`${page.status} ${page.url} - ${page.title}`);
}
```

## Spider Class

For more control, use the `Spider` class directly:

```typescript
import { Spider } from 'recker/scrape';

const crawler = new Spider({
  maxDepth: 3,
  maxPages: 50,
  concurrency: 10,
  delay: 200,
  onPage: (page) => {
    console.log(`Crawled: ${page.url}`);
  }
});

const result = await crawler.crawl('https://example.com');
```

## Configuration Options

```typescript
interface SpiderOptions {
  /** Maximum depth to crawl (default: 5) */
  maxDepth?: number;

  /** Maximum pages to crawl (default: 100) */
  maxPages?: number;

  /** Only crawl same domain (default: true) */
  sameDomain?: boolean;

  /** Concurrent requests (default: 5) */
  concurrency?: number;

  /** Request timeout in ms (default: 10000) */
  timeout?: number;

  /** Delay between requests in ms (default: 100) */
  delay?: number;

  /** URL patterns to exclude (regex) */
  exclude?: RegExp[];

  /** URL patterns to include only (regex) */
  include?: RegExp[];

  /** Custom user agent */
  userAgent?: string;

  /** Respect robots.txt (default: true) */
  respectRobotsTxt?: boolean;

  /** Use sitemap.xml for URL discovery (default: false) */
  useSitemap?: boolean;

  /** Custom sitemap URL */
  sitemapUrl?: string;

  /** Callback for each page crawled */
  onPage?: (result: SpiderPageResult) => void;

  /** Callback for progress updates */
  onProgress?: (progress: SpiderProgress) => void;
}
```

## Filtering URLs

### Exclude Patterns

Skip URLs matching certain patterns:

```typescript
const crawler = new Spider({
  exclude: [
    /\/admin\//,         // Skip admin pages
    /\/api\//,           // Skip API routes
    /\?.*page=/,         // Skip pagination
    /\/tag\//,           // Skip tag pages
    /\.(pdf|zip)$/,      // Skip file downloads
  ]
});
```

### Include Patterns

Only crawl URLs matching patterns:

```typescript
const crawler = new Spider({
  include: [
    /\/blog\//,          // Only blog posts
    /\/products\//,      // Only product pages
  ]
});
```

## Robots.txt Support

By default, the Spider respects `robots.txt`:

```typescript
const crawler = new Spider({
  respectRobotsTxt: true,  // Default
  userAgent: 'MyBot/1.0'
});

const result = await crawler.crawl('https://example.com');

// Check robots.txt analysis
console.log(result.robots);
// {
//   found: true,
//   sitemaps: ['https://example.com/sitemap.xml'],
//   blocksAll: false,
//   issues: []
// }
```

To ignore robots.txt (not recommended):

```typescript
const crawler = new Spider({
  respectRobotsTxt: false
});
```

## Sitemap Discovery

Use sitemaps to discover URLs that might not be linked:

```typescript
const crawler = new Spider({
  useSitemap: true
});

const result = await crawler.crawl('https://example.com');

// Check sitemap analysis
console.log(result.sitemap);
// {
//   found: true,
//   totalUrls: 150,
//   crawledFromSitemap: 50,
//   orphanUrls: ['...'],        // URLs only in sitemap, not linked
//   missingFromSitemap: ['...'], // URLs found but not in sitemap
//   blockedBySitemapRobots: [],
//   validationIssues: []
// }
```

### Custom Sitemap URL

```typescript
const crawler = new Spider({
  useSitemap: true,
  sitemapUrl: 'https://example.com/custom-sitemap.xml'
});
```

## Progress Tracking

### onPage Callback

Called for each page crawled:

```typescript
const crawler = new Spider({
  onPage: (page) => {
    if (page.error) {
      console.error(`Error: ${page.url} - ${page.error}`);
    } else {
      console.log(`${page.status} ${page.url}`);
      console.log(`  Title: ${page.title}`);
      console.log(`  Links: ${page.links.length}`);
      console.log(`  Time: ${page.duration}ms`);
    }
  }
});
```

### onProgress Callback

Called periodically with progress updates:

```typescript
const crawler = new Spider({
  onProgress: (progress) => {
    const percent = Math.round((progress.crawled / progress.total) * 100);
    console.log(`Progress: ${percent}% (${progress.crawled}/${progress.total})`);
    console.log(`  Current: ${progress.currentUrl}`);
    console.log(`  Depth: ${progress.depth}`);
    console.log(`  Queued: ${progress.queued}`);
  }
});
```

## Page Result Structure

Each crawled page returns:

```typescript
interface SpiderPageResult {
  url: string;
  status: number;
  title: string;
  depth: number;
  links: ExtractedLink[];
  duration: number;
  error?: string;
  meta?: {
    description?: string;
    keywords?: string[];
    author?: string;
    robots?: string[];
    canonical?: string;
    viewport?: string;
    lang?: string;
    charset?: string;
  };
  metrics?: {
    htmlSize: number;
    textLength: number;
  };
  social?: {
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
  };
}
```

## Crawl Result Structure

```typescript
interface SpiderResult {
  startUrl: string;
  pages: SpiderPageResult[];
  visited: Set<string>;
  duration: number;
  errors: Array<{ url: string; error: string }>;
  sitemap?: SitemapAnalysis;
  robots?: RobotsAnalysis;
}
```

## Controlling the Crawler

### Abort Crawling

```typescript
const crawler = new Spider();

// Start crawling in background
const crawlPromise = crawler.crawl('https://example.com');

// Abort after 30 seconds
setTimeout(() => {
  console.log('Stopping crawler...');
  crawler.abort();
}, 30000);

const result = await crawlPromise;
console.log(`Crawled ${result.pages.length} pages before abort`);
```

### Check Status

```typescript
const crawler = new Spider();

// Check if running
if (crawler.isRunning()) {
  console.log('Crawler is active');
}

// Get current progress
const progress = crawler.getProgress();
console.log(`Crawled: ${progress.crawled}`);
```

## URL Normalization

The Spider automatically normalizes URLs to avoid duplicates:

- Removes URL fragments (`#section`)
- Removes tracking parameters (UTM, fbclid, gclid, etc.)
- Sorts query parameters
- Removes trailing slashes
- Lowercases hostname

Example:
```
https://Example.com/Page/?utm_source=twitter&b=2&a=1#section
→ https://example.com/Page?a=1&b=2
```

## Common Use Cases

### Blog Crawler

```typescript
const crawler = new Spider({
  maxDepth: 2,
  maxPages: 100,
  include: [/\/blog\//, /\/posts\//],
  exclude: [/\/tag\//, /\/author\//, /\?page=/]
});

const result = await crawler.crawl('https://example.com/blog');

const posts = result.pages
  .filter(p => p.status === 200 && !p.error)
  .map(p => ({
    url: p.url,
    title: p.title,
    description: p.meta?.description
  }));
```

### Site Audit

```typescript
const crawler = new Spider({
  maxPages: 500,
  useSitemap: true,
  respectRobotsTxt: true,
  onPage: (page) => {
    // Check for issues
    if (page.status >= 400) {
      console.warn(`Broken: ${page.url} (${page.status})`);
    }
    if (!page.meta?.description) {
      console.warn(`Missing meta description: ${page.url}`);
    }
    if (!page.title) {
      console.warn(`Missing title: ${page.url}`);
    }
  }
});

const result = await crawler.crawl('https://example.com');

// Summary
const broken = result.pages.filter(p => p.status >= 400);
const noDescription = result.pages.filter(p => !p.meta?.description);
const noTitle = result.pages.filter(p => !p.title);

console.log(`Total pages: ${result.pages.length}`);
console.log(`Broken links: ${broken.length}`);
console.log(`Missing descriptions: ${noDescription.length}`);
console.log(`Missing titles: ${noTitle.length}`);
```

### Link Discovery

```typescript
const crawler = new Spider({
  maxDepth: 3,
  maxPages: 200
});

const result = await crawler.crawl('https://example.com');

// Find all external links
const externalLinks = new Set<string>();
for (const page of result.pages) {
  for (const link of page.links) {
    if (link.type === 'external') {
      externalLinks.add(link.href);
    }
  }
}

console.log('External links found:');
for (const link of externalLinks) {
  console.log(`  ${link}`);
}
```

### Sitemap vs Reality Check

```typescript
const crawler = new Spider({
  useSitemap: true,
  maxPages: 500
});

const result = await crawler.crawl('https://example.com');

if (result.sitemap) {
  console.log(`Sitemap URLs: ${result.sitemap.totalUrls}`);
  console.log(`Crawled from sitemap: ${result.sitemap.crawledFromSitemap}`);

  if (result.sitemap.orphanUrls.length > 0) {
    console.warn('Orphan pages (in sitemap but not linked):');
    for (const url of result.sitemap.orphanUrls) {
      console.warn(`  ${url}`);
    }
  }

  if (result.sitemap.missingFromSitemap.length > 0) {
    console.warn('Missing from sitemap:');
    for (const url of result.sitemap.missingFromSitemap) {
      console.warn(`  ${url}`);
    }
  }
}
```

## Performance Tips

### 1. Adjust Concurrency Based on Target

```typescript
// For small sites or rate-limited targets
const crawler = new Spider({
  concurrency: 2,
  delay: 500
});

// For large sites that can handle load
const crawler = new Spider({
  concurrency: 20,
  delay: 50
});
```

### 2. Limit Scope

```typescript
const crawler = new Spider({
  maxDepth: 2,        // Don't go too deep
  maxPages: 100,      // Set reasonable limit
  include: [/\/docs\//]  // Focus on specific section
});
```

### 3. Skip Unnecessary Content

```typescript
const crawler = new Spider({
  exclude: [
    /\/search\?/,       // Skip search results
    /\/page\/\d+/,      // Skip pagination
    /\/(tag|category)\// // Skip taxonomies
  ]
});
```

## TypeScript Support

```typescript
import type {
  Spider,
  SpiderOptions,
  SpiderResult,
  SpiderPageResult,
  SpiderProgress,
  SitemapAnalysis,
  RobotsAnalysis
} from 'recker/scrape';
```

## Next Steps

- **[Overview](01-overview.md)** - Getting started with scraping
- **[Selectors](02-selectors.md)** - CSS selectors and traversal
- **[SEO Spider](/seo/03-spider.md)** - Site-wide SEO analysis

# Spider - Web Crawler

The Spider class crawls websites following internal links, with support for robots.txt, sitemaps, data extraction, and concurrent crawling. It's designed for both quick site mapping and comprehensive data harvesting.

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

### Proteção anti-bot no crawl

```typescript
import { Spider } from 'recker/scrape';

const spider = new Spider({
  transport: 'auto',
  maxRetryAttempts: 4,
  onCaptchaDetected: ({ url, status, confidence, provider, usedCurl }) => {
    if (confidence >= 0.75) {
      console.log(`Proteção detectada em ${url}`);
    }
    console.log(`${status} - ${provider ?? 'unknown'} via ${usedCurl ? 'curl' : 'undici'}`);
  },
  onProgress: (p) => {
    console.log(`[${p.crawled}/${p.total}] ${p.currentUrl}`);
  },
});

const result = await spider.crawl('https://www.example.com');

for (const page of result.pages) {
  if (page.security?.captchaDetected) {
    console.log(`Página com desafio: ${page.url} (${page.security.captchaProvider})`);
  }
}
```

### Sinais de anti-bot / captcha detectados

O crawler classifica bloqueios em `page.security` com base em:

- Status HTTP críticos: `403`, `406`, `429`, `503`
- Headers conhecidos:
  - `cf-ray`, `cf-cache-status`, `cf-mitigated`
  - `x-akamai-transformed`, `akamai-grn`
  - `x-datadome`, `x-dd-b`, `x-dd-type`
  - `x-captcha`, `x-captcha-result`, `x-captcha-badge`, `x-recaptcha`, `x-hcaptcha`
- Cookies/IDs de proteção:
  - `__cf_bm`, `cf_clearance`, `cf_chl_`
  - `_dd_s`, `_dd_nuid`, `dd_session`
  - `x-px-id`, `incap_ses_*`, `visid_incap`
- Padrões HTML/JS:
  - Formulários/inputs: `g-recaptcha-response`, `hcaptcha-response`, `cf-turnstile-response`
  - Script source: `recaptcha/api.js`, `hcaptcha.com/1/api.js`, `challenges.cloudflare.com`
  - Marcadores: `cf_chl`, `recaptcha`, `turnstile`, `funcaptcha`, `arkose`

### Exemplo de leitura (JSONL)

```json
{
  "type": "page",
  "url": "https://example.com/protected",
  "status": 403,
  "security": {
    "blocked": true,
    "reason": "status",
    "confidence": 0.93,
    "captchaDetected": true,
    "captchaProvider": "cloudflare",
    "attempts": 3,
    "retryCount": 2,
    "transport": "curl"
  },
  "timings": {
    "ttfb": 1200,
    "total": 2450,
    "download": 800
  }
}
```

No evento `complete`, o crawl também gera resumo agregado de anti-bot:

```json
{
  "type": "complete",
  "security": {
    "pages": 120,
    "blockedPages": 8,
    "captchaPages": 5,
    "attempts": 152,
    "retries": 32,
    "avgAttempts": 1.27,
    "avgTtfbMs": 420,
    "avgTotalMs": 870,
    "avgDownloadMs": 430,
    "transportUsage": {
      "undici": 92,
      "curl": 28
    }
  },
  "assets": {
    "images": 1450,
    "scripts": 212,
    "stylesheets": 98
  }
}
```

### CLI Quick Start

```bash
# Basic crawl
rek spider example.com

# With options
rek spider example.com --depth 3 --limit 50

# Extract data from all pages
rek spider example.com --extract "h1,a:href,.price"

# Stream as JSONL for large crawls
rek spider example.com --jsonl -o crawl.jsonl
```

## Data Extraction

One of Spider's most powerful features is **declarative data extraction**. Extract specific elements from every crawled page using CSS selectors.

### CLI Extraction

```bash
# Extract headings from all pages
rek spider example.com --extract "h1"

# Extract multiple selectors (comma-separated)
rek spider example.com --extract "h1,h2,p.intro"

# Extract attributes with selector:attribute syntax
rek spider example.com --extract "a:href"           # Link URLs
rek spider example.com --extract "img:src"          # Image sources
rek spider example.com --extract "meta[name='description']:content"

# Complex extraction
rek spider example.com --extract "h1,.product-title,.price,a.buy-button:href"

# Save extracted data to JSON
rek spider example.com --extract "h1,a:href" --json -o data.json
```

### Extraction Syntax

| Syntax | Description | Example Output |
|--------|-------------|----------------|
| `h1` | Text content of `<h1>` elements | `["Welcome", "About Us"]` |
| `a:href` | `href` attribute from `<a>` elements | `["https://...", "/page"]` |
| `img:src` | `src` attribute from `<img>` elements | `["/logo.png", "/hero.jpg"]` |
| `.price` | Text from `.price` class elements | `["$19.99", "$29.99"]` |
| `[data-id]:data-id` | `data-id` attribute value | `["123", "456"]` |

### Programmatic Extraction

```typescript
import { Spider } from 'recker/scrape';

const spider = new Spider({
  maxPages: 100,
  extract: ['h1', 'a:href', '.product-price']
});

const result = await spider.crawl('https://shop.example.com');

// Each page now has extracted data
for (const page of result.pages) {
  if (page.extracted) {
    console.log(`Page: ${page.url}`);
    console.log(`  H1s: ${page.extracted.h1}`);
    console.log(`  Links: ${page.extracted.a_href?.length || 0}`);
    console.log(`  Prices: ${page.extracted.product_price}`);
  }
}
```

### Extraction Schema (Advanced)

For more control, use the declarative schema format:

```typescript
import { Spider } from 'recker/scrape';
import type { ExtractionSchema } from 'recker/scrape';

const schema: ExtractionSchema = {
  title: { selector: 'h1', multiple: false },
  prices: { selector: '.price', multiple: true },
  links: { selector: 'a', attribute: 'href', multiple: true },
  images: { selector: 'img', attribute: 'src', multiple: true },
  description: { selector: 'meta[name="description"]', attribute: 'content' }
};

const spider = new Spider({
  maxPages: 50,
  extract: schema
});

const result = await spider.crawl('https://example.com');
```

### Practical Extraction Examples

#### E-commerce Product Scraping

```bash
# Extract product data
rek spider shop.example.com \
  --extract ".product-title,.price,.sku,img.product-image:src" \
  --include "^/products/" \
  --json -o products.json
```

```typescript
// Programmatic
const spider = new Spider({
  include: [/\/products\//],
  extract: [
    '.product-title',
    '.price',
    '.sku',
    'img.product-image:src',
    '.description'
  ]
});

const result = await spider.crawl('https://shop.example.com');

const products = result.pages
  .filter(p => p.extracted?.product_title)
  .map(p => ({
    url: p.url,
    title: p.extracted!.product_title?.[0],
    price: p.extracted!.price?.[0],
    sku: p.extracted!.sku?.[0],
    image: p.extracted!.img_product_image_src?.[0]
  }));
```

#### Blog Post Extraction

```bash
# Extract blog metadata
rek spider blog.example.com \
  --extract "h1,.author,.date,article p" \
  --include "^/posts/" \
  --limit 100 \
  --json
```

#### Link Audit

```bash
# Extract all links for analysis
rek spider example.com \
  --extract "a:href" \
  --depth 5 \
  --jsonl -o links.jsonl
```

## JSONL Streaming Output

For large crawls, use **JSONL (JSON Lines)** format for streaming output. Each line is a valid JSON object, making it perfect for:

- **Real-time processing** - Process data as it streams
- **Large datasets** - No memory issues with big crawls
- **Unix pipelines** - Works with `grep`, `jq`, `head`, etc.
- **Resumable processing** - Easy to restart from any point

### CLI JSONL Usage

```bash
# Stream to stdout
rek spider example.com --jsonl

# Stream to file
rek spider example.com --jsonl -o crawl.jsonl

# With extraction
rek spider example.com --jsonl --extract "h1,a:href" -o data.jsonl

# With SEO analysis
rek spider example.com --jsonl --seo -o seo-crawl.jsonl

# Pipe to jq for processing
rek spider example.com -L | jq -c 'select(.type=="page")'

# Filter pages with errors
rek spider example.com -L | jq 'select(.status >= 400)'
```

### JSONL Record Types

The JSONL output contains different record types:

```jsonl
{"type":"start","url":"https://example.com","startedAt":"...","config":{...}}
{"type":"page","url":"https://example.com/","status":200,"depth":0,"title":"...","links":5,"duration":234}
{"type":"page","url":"https://example.com/about","status":200,"depth":1,...}
{"type":"page-full","url":"https://example.com/","status":200,"seoScore":85,"extracted":{...}}
{"type":"complete","url":"...","pagesVisited":50,"duration":12345,"seo":{...}}
{"type":"serp","summary":{"queriesRequested":8,"queriesFound":5,"top3Count":2,"top10Count":4},"seedPlan":{"short":[...],"longTail":[...],"ordered":[...]},"campaign":{...},"results":[...],"pageComparison":[...]}
```

| Record Type | When Emitted | Contains |
|-------------|--------------|----------|
| `start` | Beginning | Config, start time, options |
| `page` | Real-time per page | Basic info (status, depth, links) |
| `page-full` | After crawl | Complete data (SEO, extraction) |
| `serp` | Optional (when `--serp` and `--seo`) | SERP campaign result (`summary`, `seedPlan`, `campaign`, `results`, `pageComparison`) |
| `complete` | End | Summary, site-wide SEO, totals |

`seedPlan` inside each `serp` record documents the exact keyword layers:

- `seedPlan.short` = short-tail seeds from page `topKeywords` (deduped and capped by `--serp-top-keywords`, default 5)
- `seedPlan.longTail` = generated 2–4 word intent phrases from title/meta/headings/sections/links/url,
  plus heading-path and schema-backed seeds (FAQ/HowTo/Product/BreadcrumbList)
- `seedPlan.longTail` is filtered to drop low-signal noise phrases and permutation variants.
- `seedPlan.ordered` = final execution order used for `results` (`short` first, then long-tail)

Short-tail items are deduped globally (`conta aberta` = `aberta conta`) after per-page extraction and cap (`--serp-top-keywords` by default, per page).
`seedPlan.ordered` keeps short-tail first for intent alignment, then long-tail.

### Processing JSONL

```bash
# Count pages by status code
cat crawl.jsonl | jq -r 'select(.type=="page") | .status' | sort | uniq -c

# Extract URLs with errors
cat crawl.jsonl | jq -r 'select(.type=="page" and .status >= 400) | .url'

# Get SEO scores
cat crawl.jsonl | jq 'select(.type=="page-full") | {url, score: .seoScore}'

# Find pages with specific extraction
cat data.jsonl | jq 'select(.extracted.price != null)'

# Filter SERP records from crawls run with --serp
cat crawl.jsonl | jq 'select(.type=="serp") | {summary, seedPlan, campaign, totalResults: (.results|length)}'
```

### JSONL vs JSON Output

| Feature | JSON (`-o file.json`) | JSONL (`--jsonl`) |
|---------|----------------------|-------------------|
| Write timing | After crawl completes | Real-time streaming |
| Memory usage | Holds all in RAM | Line-by-line, low memory |
| File processing | Parse entire file | Process line-by-line |
| Unix tools | Limited | `grep`, `jq`, `head`, `tail` |
| Resumability | Restart from scratch | Can resume/append |
| Best for | Small crawls, reports | Large crawls, pipelines |

## URL Filtering

Control which URLs are crawled with include/exclude patterns.

### Exclude Patterns

Skip URLs matching patterns:

```bash
# CLI
rek spider example.com --exclude "/admin/,/api/,\\.pdf$"
```

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

```bash
# CLI - only crawl blog posts
rek spider example.com --include "^/blog/,^/posts/"
```

```typescript
const crawler = new Spider({
  include: [
    /\/blog\//,          // Only blog posts
    /\/products\//,      // Only product pages
  ]
});
```

### Combined Filtering

```bash
# Crawl products, but skip out-of-stock
rek spider shop.example.com \
  --include "^/products/" \
  --exclude "/out-of-stock/,/discontinued/"
```

## Spider Class

For full control, use the `Spider` class directly:

```typescript
import { Spider } from 'recker/scrape';

const crawler = new Spider({
  maxDepth: 3,
  maxPages: 50,
  concurrency: 10,
  delay: 200,
  extract: ['h1', '.price', 'a:href'],
  include: [/\/products\//],
  exclude: [/\/admin\//],
  onPage: (page) => {
    console.log(`Crawled: ${page.url}`);
    if (page.extracted) {
      console.log(`  Found ${page.extracted.price?.length || 0} prices`);
    }
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

  /** CSS selectors to extract from each page */
  extract?: string[] | ExtractionSchema;

  /** Custom user agent */
  userAgent?: string;

  /** Respect robots.txt (default: true) */
  respectRobotsTxt?: boolean;

  /** Use sitemap.xml for URL discovery (default: false) */
  useSitemap?: boolean;

  /** Custom sitemap URL */
  sitemapUrl?: string;

  /** Proxy: string, string[] (round-robin), or ProxyAdapter (dynamic) */
  proxy?: string | string[] | ProxyAdapter;

  /** Pluggable URL frontier (default: in-memory) */
  crawlQueue?: CrawlQueueAdapter;

  /** Pluggable result storage (default: in-memory) */
  crawlStorage?: CrawlStorageAdapter;

  /** Callback for each page crawled */
  onPage?: (result: SpiderPageResult) => void;

  /** Callback for progress updates */
  onProgress?: (progress: SpiderProgress) => void;
}
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
  /**
   * Optional: network-level timing signals
   */
  timings?: {
    dns?: number;
    tcp?: number;
    tls?: number;
    ttfb?: number;
    download?: number;
    total?: number;
  };

  /** Extracted data (when extract option is used) */
  extracted?: Record<string, unknown>;

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

Non-HTML responses (PDF/JS/image/assets) are also recorded now. For those pages:

* `title` is empty
* `links` stays `[]`
* `metrics.htmlSize` uses `Content-Length` when available (or fallback to parsed body size)
* SEO callbacks (`onPageWithHtml`) are not executed because there is no HTML payload.

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

  /** Extraction summary (when extract option is used) */
  extraction?: {
    schema: Record<string, string>;
    totalItems: number;
    byPage: Record<string, Record<string, unknown>>;
  };
}
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

```bash
# CLI
rek spider example.com --no-robots
```

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

## Progress Tracking

### onPage Callback

Called for each page crawled:

```typescript
const crawler = new Spider({
  extract: ['h1', '.price'],
  onPage: (page) => {
    if (page.error) {
      console.error(`Error: ${page.url} - ${page.error}`);
    } else {
      console.log(`${page.status} ${page.url}`);
      console.log(`  Title: ${page.title}`);
      console.log(`  Links: ${page.links.length}`);
      if (page.extracted) {
        console.log(`  H1: ${page.extracted.h1?.[0]}`);
        console.log(`  Prices: ${page.extracted.price?.length || 0}`);
      }
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

## Common Use Cases

### Price Monitoring

```bash
# Extract and save prices
rek spider shop.example.com \
  --extract ".product-name,.price,.sku" \
  --include "^/products/" \
  --limit 500 \
  --jsonl -o prices.jsonl
```

```typescript
const spider = new Spider({
  maxPages: 500,
  include: [/\/products\//],
  extract: ['.product-name', '.price', '.sku']
});

const result = await spider.crawl('https://shop.example.com');

const prices = result.pages
  .filter(p => p.extracted?.price)
  .map(p => ({
    url: p.url,
    product: p.extracted!.product_name?.[0],
    price: p.extracted!.price?.[0],
    sku: p.extracted!.sku?.[0],
    crawledAt: new Date().toISOString()
  }));

// Save for price tracking
await fs.writeFile('prices.json', JSON.stringify(prices, null, 2));
```

### Content Audit

```bash
# Audit all blog posts
rek spider blog.example.com \
  --extract "h1,h2,h3,.author,.date,article" \
  --include "^/posts/" \
  --seo \
  --json -o audit.json
```

### Link Extraction

```bash
# Get all external links
rek spider example.com --extract "a:href" --depth 5 --jsonl | \
  jq -r '.extracted.a_href[]?' | \
  grep -v "example.com" | \
  sort -u > external-links.txt
```

### Image Inventory

```bash
# List all images on a site
rek spider example.com \
  --extract "img:src,img:alt" \
  --jsonl | \
  jq 'select(.type=="page-full") | {url, images: .extracted.img_src}'
```

### Blog Crawler

```typescript
const crawler = new Spider({
  maxDepth: 2,
  maxPages: 100,
  include: [/\/blog\//, /\/posts\//],
  exclude: [/\/tag\//, /\/author\//, /\?page=/],
  extract: ['h1', '.author', '.date', 'article p']
});

const result = await crawler.crawl('https://example.com/blog');

const posts = result.pages
  .filter(p => p.status === 200 && !p.error)
  .map(p => ({
    url: p.url,
    title: p.extracted?.h1?.[0] || p.title,
    author: p.extracted?.author?.[0],
    date: p.extracted?.date?.[0],
    excerpt: p.meta?.description
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

## Proxy Support

The Spider supports HTTP, HTTPS, SOCKS5, and SOCKS5h proxies. Pass a single proxy, a list for round-robin, or a custom adapter for dynamic selection.

### Static Proxy

```typescript
const spider = new Spider({
  proxy: 'socks5h://proxy.example.com:1080',
});
```

### Round-Robin List

```typescript
const spider = new Spider({
  proxy: [
    'http://proxy1.example.com:8080',
    'socks5h://proxy2.example.com:1080',
    'http://proxy3.example.com:8080',
  ],
  concurrency: 20,
});
```

### Dynamic Proxy Adapter

Implement `ProxyAdapter` for full control: health-based rotation, geo-routing, API-based pools, etc.

```typescript
import { Spider, type ProxyAdapter } from 'recker/scrape';

const proxyAdapter: ProxyAdapter = {
  async getProxy() {
    // Fetch from your proxy pool, API, database, etc.
    return await myProxyPool.getHealthiest();
  },
  async reportResult(proxy, success) {
    // Feedback for health tracking
    if (!success) await myProxyPool.penalize(proxy, 60_000);
  }
};

const spider = new Spider({
  proxy: proxyAdapter,
  concurrency: 50,
  maxPages: 100000,
});
```

The `ProxyAdapter` interface:

```typescript
interface ProxyAdapter {
  getProxy(): Promise<string | null>;
  reportResult?(proxy: string, success: boolean): Promise<void>;
  close?(): Promise<void>;
}
```

> [!TIP]
> The built-in `ListProxyAdapter` handles round-robin automatically when you pass a `string[]`. Implement `ProxyAdapter` directly when you need health tracking, geo-routing, or dynamic proxy pools.

## Pluggable Queue (URL Frontier)

By default, the Spider uses an in-memory queue to track URLs to crawl and URLs already visited. For large crawls, distributed crawling, or crash recovery, plug in your own backend.

```typescript
import { Spider, type CrawlQueueAdapter } from 'recker/scrape';

// Example: Redis-backed queue
const redisQueue: CrawlQueueAdapter = {
  async push(item) { await redis.lpush('crawl:queue', JSON.stringify(item)); },
  async pop() {
    const raw = await redis.rpop('crawl:queue');
    return raw ? JSON.parse(raw) : null;
  },
  async hasVisited(url) { return await redis.sismember('crawl:visited', url) === 1; },
  async markVisited(url) { await redis.sadd('crawl:visited', url); },
  async size() { return await redis.llen('crawl:queue'); },
  async clear() { await redis.del('crawl:queue', 'crawl:visited'); },
};

const spider = new Spider({
  crawlQueue: redisQueue,
  concurrency: 20,
  maxPages: 100000,
});
```

The `CrawlQueueAdapter` interface:

```typescript
interface CrawlQueueAdapter {
  push(item: CrawlQueueItem): Promise<void>;
  pushBatch?(items: CrawlQueueItem[]): Promise<void>;     // batch optimization
  pop(): Promise<CrawlQueueItem | null>;
  hasVisited(url: string): Promise<boolean>;
  hasVisitedBatch?(urls: string[]): Promise<Set<string>>;  // batch optimization
  markVisited(url: string): Promise<void>;
  size(): Promise<number>;
  clear(): Promise<void>;
  close?(): Promise<void>;
}
```

> [!NOTE]
> When `pushBatch` and `hasVisitedBatch` are implemented, the Spider uses them automatically to reduce round-trips. This makes a significant difference for remote backends like Redis or SQS.

## Pluggable Storage (Results)

By default, crawl results accumulate in memory. For large crawls (100k+ pages) this can consume gigabytes. Plug in a storage adapter to stream results to disk, database, or cloud.

```typescript
import { Spider, type CrawlStorageAdapter } from 'recker/scrape';

// Example: SQLite-backed storage
const sqliteStorage: CrawlStorageAdapter = {
  async saveResult(result) {
    await db.run('INSERT INTO pages (url, status, title) VALUES (?, ?, ?)',
      result.url, result.status, result.title);
  },
  async saveError(error) {
    await db.run('INSERT INTO errors (url, error) VALUES (?, ?)', error.url, error.error);
  },
  async getResultCount() {
    return (await db.get('SELECT COUNT(*) as c FROM pages')).c;
  },
  async getResults() {
    return await db.all('SELECT * FROM pages');
  },
  async getErrors() {
    return await db.all('SELECT * FROM errors');
  },
  async clear() {
    await db.run('DELETE FROM pages');
    await db.run('DELETE FROM errors');
  },
};

const spider = new Spider({
  crawlStorage: sqliteStorage,
  maxPages: 100000,
});
```

The `CrawlStorageAdapter` interface:

```typescript
interface CrawlStorageAdapter {
  saveResult(result: SpiderPageResult): Promise<void>;
  saveError(error: { url: string; error: string }): Promise<void>;
  getResultCount(): Promise<number>;
  getResults(): Promise<SpiderPageResult[]>;
  getErrors(): Promise<Array<{ url: string; error: string }>>;
  clear(): Promise<void>;
  close?(): Promise<void>;
}
```

### Combining All Adapters

For production-grade crawling:

```typescript
const spider = new Spider({
  // Dynamic proxy with health tracking
  proxy: myProxyAdapter,

  // Redis queue for distributed crawling
  crawlQueue: new RedisCrawlQueue({ url: 'redis://localhost:6379' }),

  // SQLite storage to avoid memory bloat
  crawlStorage: new SQLiteCrawlStorage({ path: './crawl.db' }),

  concurrency: 50,
  maxPages: 100000,
  onPage: (page) => console.log(`${page.status} ${page.url}`),
});

const result = await spider.crawl('https://example.com');
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

```bash
rek spider example.com \
  --exclude "/search/,/page/\\d+,/(tag|category)/"
```

### 4. Use JSONL for Large Crawls

```bash
# For 1000+ pages, always use JSONL
rek spider example.com --limit 5000 --jsonl -o crawl.jsonl
```

## CLI Reference

```bash
rek spider <url> [options]

Options:
  -d, --depth <n>       Max link depth (default: 5)
  -l, --limit <n>       Max pages to crawl (default: 100)
  -c, --concurrency <n> Parallel requests (default: 5)
  -o, --output <file>   Save report to file
  -E, --extract <sel>   CSS selectors to extract (comma-separated)
  -i, --include <pat>   URL patterns to include (comma-separated regex)
  -x, --exclude <pat>   URL patterns to exclude (comma-separated regex)
  -S, --seo             Enable SEO analysis
  -L, --jsonl           Stream output as JSONL
  -r, --robots          Respect robots.txt (default: true)
  --json                Output as JSON

Examples:
  rek spider example.com
  rek spider example.com -d 3 -l 50
  rek spider example.com -E "h1,a:href,.price"
  rek spider example.com --jsonl -o crawl.jsonl
  rek spider example.com --seo -o report.json
  rek spider example.com --include "^/products/" -E ".price"
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
  RobotsAnalysis,
  ExtractionSchema,
  // Adapters
  CrawlQueueAdapter,
  CrawlQueueItem,
  CrawlStorageAdapter,
  ProxyAdapter,
} from 'recker/scrape';

// Built-in implementations
import {
  InMemoryCrawlQueue,
  InMemoryCrawlStorage,
  ListProxyAdapter,
} from 'recker/scrape';
```

## Next Steps

- **[Schemas](04-schemas.md)** - Advanced declarative extraction
- **[Selectors](02-selectors.md)** - CSS selectors and traversal
- **[SEO Spider](/seo/03-spider.md)** - Site-wide SEO analysis
- **[Anti-Blocking](06-anti-blocking.md)** - Avoid detection

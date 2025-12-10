# Web Scraping

HTML scraping with Cheerio, declarative extraction schemas, and built-in extractors for common data types.

## Installation

Cheerio is an **optional peer dependency** loaded dynamically only when needed:

```bash
pnpm add cheerio
```

If you try to use scraping without cheerio installed, you'll get a clear error:
```
cheerio is required for scraping but not installed. Install it with: pnpm add cheerio
```

## Quick Start

### Using `client.scrape()`

```typescript
import { createClient } from 'recker';

const client = createClient();

// Scrape a URL directly
const doc = await client.scrape('https://news.ycombinator.com');

// Get page title
console.log(doc.title()); // "Hacker News"

// Select elements
const headlines = doc.selectAll('.titleline > a').map(el => el.text());
console.log(headlines);
```

### Using the `scrape()` Helper

```typescript
import { createClient, scrape } from 'recker';

const client = createClient({ baseUrl: 'https://example.com' });

// Wrap any request with scrape()
const doc = await scrape(client.get('/products'));

// Extract product data
const products = doc.selectAll('.product').map(el => ({
  name: el.find('.name').text(),
  price: el.find('.price').text(),
  image: el.find('img').attr('src')
}));
```

### Direct HTML Parsing

Parse HTML strings without HTTP requests:

```typescript
import { ScrapeDocument } from 'recker/scrape';

const html = '<html><body><h1>Hello World</h1></body></html>';
const doc = await ScrapeDocument.create(html);

console.log(doc.select('h1').text()); // "Hello World"
```

Or use `parseHtml()`:

```typescript
import { parseHtml } from 'recker/plugins/scrape';

const doc = await parseHtml('<html><body><h1>Hello</h1></body></html>');
```

## Features

| Feature | Description |
|---------|-------------|
| **CSS Selectors** | jQuery-like selection with `select()`, `selectAll()`, `selectFirst()` |
| **DOM Traversal** | Navigate with `parent()`, `children()`, `siblings()`, `find()` |
| **Built-in Extractors** | Links, images, meta tags, OpenGraph, Twitter Card, JSON-LD, forms, tables |
| **Declarative Schemas** | Extract complex data structures with `extract()` |
| **Rate Limiting** | Built-in concurrency control for respectful scraping |
| **Caching** | Cache responses to avoid redundant requests |

## Configuration for Scraping

```typescript
const client = createClient({
  baseUrl: 'https://example.com',
  headers: {
    'User-Agent': 'MyScraper/1.0 (+https://mysite.com/bot)'
  },
  plugins: [
    cachePlugin({ ttl: 3600000 })  // Cache for 1 hour
  ],
  concurrency: {
    max: 5,                      // Max 5 concurrent requests
    requestsPerInterval: 2,      // 2 requests per second
    interval: 1000
  }
});
```

## Batch Scraping

```typescript
const urls = ['/page1', '/page2', '/page3', '/page4', '/page5'];

const { results } = await client.batch(
  urls.map(path => ({ path })),
  {
    concurrency: 3,
    mapResponse: async (res) => {
      const doc = await scrape(res);
      return doc.selectFirst('h1').text();
    }
  }
);
```

## TypeScript Support

All scraping methods are fully typed:

```typescript
import type {
  ScrapeDocument,
  ScrapeElement,
  ExtractedLink,
  ExtractedImage,
  ExtractedMeta,
  OpenGraphData,
  TwitterCardData,
  JsonLdData,
  ExtractedForm,
  ExtractedTable,
  ExtractionSchema
} from 'recker';
```

## Best Practices

### 1. Use Specific Selectors

```typescript
// Good: Stable, specific selector
const title = doc.selectFirst('.product-title').text();

// Bad: May break if structure changes
const title = doc.selectFirst('div > div > h1').text();
```

### 2. Handle Missing Elements

```typescript
// Check existence
const author = doc.exists('.author')
  ? doc.selectFirst('.author').text()
  : 'Unknown';

// Optional chaining
const price = doc.selectFirst('.price')?.text() || '0';
```

### 3. Respect Rate Limits

```typescript
const client = createClient({
  baseUrl: 'https://example.com',
  concurrency: {
    max: 5,
    requestsPerInterval: 2,
    interval: 1000
  }
});
```

## Next Steps

- **[Selectors](02-selectors.md)** - CSS selectors and DOM traversal
- **[Extractors](03-extractors.md)** - Built-in data extractors
- **[Schemas](04-schemas.md)** - Declarative extraction schemas
- **[SEO Spider](/seo/03-spider.md)** - Site-wide crawling with SEO analysis

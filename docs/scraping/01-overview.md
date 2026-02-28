# Web Scraping

Recker provides powerful web scraping capabilities with a built-in HTML parser and jQuery-like API.

## Features

- **Zero Dependencies**: Custom HTML parser without external dependencies
- **jQuery-like API**: Familiar selector syntax for DOM traversal
- **Declarative Extraction**: Define schemas to extract structured data
- **Built-in Extractors**: Links, images, meta tags, OpenGraph, JSON-LD, forms, tables
- **Spider/Crawler**: Site-wide crawling with concurrency control

## Quick Start

### Parse HTML Directly

```typescript
import { ScrapeDocument } from 'recker/scrape';

const html = `
  <html>
    <head><title>Example</title></head>
    <body>
      <h1>Hello World</h1>
      <p class="intro">Welcome to our site</p>
    </body>
  </html>
`;

const doc = await ScrapeDocument.create(html);

// Get page title
console.log(doc.title()); // "Example"

// Select elements
console.log(doc.select('h1').text()); // "Hello World"
console.log(doc.selectFirst('.intro').text()); // "Welcome to our site"
```

### Scrape from HTTP Response

```typescript
import { createClient, scrape } from 'recker';

const client = createClient();

// Fetch and scrape a URL
const doc = await scrape(client.get('https://news.ycombinator.com'));

// Extract headlines
const headlines = doc.selectAll('.titleline > a').map(el => ({
  title: el.text(),
  url: el.attr('href')
}));

console.log(headlines);
```

### Using the `parseHtml` Helper

```typescript
import { parseHtml } from 'recker/plugins/scrape';

const doc = await parseHtml('<html><body><h1>Hello</h1></body></html>');
console.log(doc.selectFirst('h1').text()); // "Hello"
```

### Custom parser behavior

`parserOptions` lets you control low-level parser behavior when you need deterministic extraction.

```typescript
import { parseHtml } from 'recker/plugins/scrape';

const doc = await parseHtml('<DIV><A HREF="/Produto">Produto</A></DIV>', {
  parserOptions: {
    lowerCaseTagName: true,
    selectorCache: true,
  },
});

console.log(doc.select('a').text()); // normalized parse works even with uppercase tags/attrs
```

```typescript
import { ScrapeDocument } from 'recker/scrape';

const raw = '<a><a>nested</a></a>';
const doc = ScrapeDocument.createSync(raw, {
  parserOptions: {
    fixNestedATags: true,
  },
});

console.log(doc.select('a').length); // nested links are normalized before selection
```

## Imports

```typescript
// Main classes
import { ScrapeDocument, ScrapeElement } from 'recker/scrape';

// Helper function
import { scrape, parseHtml } from 'recker/plugins/scrape';

// HTML Parser (for advanced use - synchronous low-level API)
import { parseHtmlSync, HTMLElement, Node } from 'recker';
```

## Core API

### ScrapeDocument Methods

| Method | Description |
|--------|-------------|
| `select(selector)` | Select all matching elements (returns ScrapeElement) |
| `selectFirst(selector)` | Select first matching element |
| `selectAll(selector)` | Select all as array of ScrapeElement |
| `text(selector)` | Get text from first match |
| `texts(selector)` | Get text from all matches |
| `attr(selector, name)` | Get attribute from first match |
| `attrs(selector, name)` | Get attribute from all matches |
| `exists(selector)` | Check if element exists |
| `count(selector)` | Count matching elements |
| `title()` | Get page title |
| `html()` | Get full HTML |

### Built-in Extractors

| Method | Description |
|--------|-------------|
| `links(options?)` | Extract all links with classification |
| `images(options?)` | Extract images with metadata |
| `meta()` | Extract meta tags |
| `openGraph()` | Extract OpenGraph data |
| `twitterCard()` | Extract Twitter Card data |
| `jsonLd()` | Extract JSON-LD structured data |
| `forms(selector?)` | Extract form structure |
| `tables(selector?)` | Extract tables as data |
| `scripts()` | Extract script tags |
| `styles()` | Extract stylesheets |

### Schema Extraction

```typescript
const product = doc.extract({
  name: 'h1.product-title',
  price: {
    selector: '.price',
    transform: (v) => parseFloat(v.replace('$', ''))
  },
  images: {
    selector: '.gallery img',
    attribute: 'src',
    multiple: true
  }
});
```

## Complete Example

```typescript
import { createClient, scrape } from 'recker';

const client = createClient({
  headers: {
    'User-Agent': 'MyScraper/1.0'
  }
});

async function scrapeProduct(url: string) {
  const doc = await scrape(client.get(url));

  return {
    // Schema extraction
    ...doc.extract({
      name: 'h1.product-name',
      price: {
        selector: '.price',
        transform: (v) => parseFloat(v.replace(/[$,]/g, ''))
      },
      description: '.description',
      sku: {
        selector: '[data-sku]',
        attribute: 'data-sku'
      }
    }),

    // Built-in extractors
    images: doc.images({ selector: '.product-images img' }),
    meta: doc.meta(),
    jsonLd: doc.jsonLd(),

    // Manual selection
    reviews: doc.selectAll('.review').map(el => ({
      author: el.find('.author').text(),
      rating: el.find('.rating').text(),
      text: el.find('.text').text()
    }))
  };
}
```

## Best Practices

### 1. Use Specific Selectors

```typescript
// Good: Stable, specific selector
const title = doc.selectFirst('.product-title').text();

// Fragile: May break if structure changes
const title = doc.selectFirst('div > div > h1').text();
```

### 2. Handle Missing Elements

```typescript
// Check existence
const author = doc.exists('.author')
  ? doc.selectFirst('.author').text()
  : 'Unknown';

// Safe chaining (ScrapeElement returns empty, not null)
const price = doc.selectFirst('.price').text() || '0';
```

### 3. Set Base URL for Relative Links

```typescript
const doc = await ScrapeDocument.create(html, {
  baseUrl: 'https://example.com'
});

// Now links() and images() resolve relative URLs
const links = doc.links({ absolute: true });
```

### 4. Use Rate Limiting for Respectful Scraping

```typescript
import { createClient, rateLimitPlugin } from 'recker';

const client = createClient();
client.use(rateLimitPlugin({
  limit: 10,
  window: 60000  // 10 requests per minute
}));
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

## Next Steps

- **[Selectors](02-selectors.md)** - CSS selectors and DOM traversal
- **[Extractors](03-extractors.md)** - Built-in data extractors
- **[Schemas](04-schemas.md)** - Declarative extraction schemas
- **[Spider](05-spider.md)** - Site-wide crawling
- **[Anti-Blocking](06-anti-blocking.md)** - Bypass detection techniques

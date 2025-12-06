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

## Selection Methods

### `select(selector)` - jQuery-like Selection

Returns a `ScrapeElement` containing all matching elements:

```typescript
// Select all links
const links = doc.select('a');
console.log(links.length); // Number of matches

// Iterate with each()
links.each((el, i) => {
  console.log(`${i}: ${el.attr('href')}`);
});

// Map to values
const urls = links.map(el => el.attr('href'));
```

### `selectFirst(selector)` - Single Element

```typescript
const title = doc.selectFirst('h1').text();
const logo = doc.selectFirst('img.logo').attr('src');
```

### `selectAll(selector)` - Array of Elements

```typescript
const articles = doc.selectAll('article');

for (const article of articles) {
  console.log(article.find('h2').text());
}
```

## Element Traversal

Chainable traversal methods:

```typescript
const item = doc.selectFirst('.item');

// Navigate DOM
item.parent()           // Parent element
item.children()         // Direct children
item.children('li')     // Filtered children
item.siblings()         // Sibling elements
item.next()             // Next sibling
item.prev()             // Previous sibling
item.nextAll()          // All following siblings
item.prevAll()          // All preceding siblings
item.closest('div')     // Closest ancestor matching selector

// Search within element
item.find('.nested')    // Descendants matching selector

// Filter selection
item.filter('.active')  // Keep matching elements
item.not('.disabled')   // Exclude matching elements
item.has('img')         // Elements containing selector
item.first()            // First in selection
item.last()             // Last in selection
item.eq(2)              // Element at index
```

## Content Extraction

### Text Content

```typescript
const text = el.text();       // Combined text content (trimmed)
const html = el.html();       // Inner HTML
const outer = el.outerHtml(); // Outer HTML (including element)
```

### Attributes

```typescript
// Single attribute
const href = el.attr('href');
const src = el.attr('src');

// All attributes as object
const attrs = el.attrs();
// { href: '/path', class: 'link active', id: 'main-link' }

// Data attributes
const userId = el.data('user-id');  // data-user-id="123" → 123
const allData = el.data();          // All data-* attributes
```

### Form Values

```typescript
const input = doc.selectFirst('input[name="email"]');
const value = input.val();

// For select elements, returns selected value(s)
const select = doc.selectFirst('select');
const selected = select.val();
```

## Built-in Extractors

### Links

```typescript
const links = doc.links();
// [
//   { href: '/about', text: 'About Us', type: 'internal' },
//   { href: 'https://twitter.com/...', text: 'Twitter', type: 'external' },
//   { href: 'mailto:info@example.com', text: 'Email', type: 'mailto' },
//   { href: '#section', text: 'Jump to section', type: 'anchor' }
// ]

// Convert relative URLs to absolute
const absoluteLinks = doc.links({ absolute: true });

// Custom selector
const navLinks = doc.links({ selector: 'nav a' });
```

### Images

```typescript
const images = doc.images();
// [
//   { src: '/logo.png', alt: 'Company Logo', width: 200, height: 50 },
//   { src: '/hero.jpg', alt: 'Hero image', loading: 'lazy', srcset: '...' }
// ]

const absoluteImages = doc.images({ absolute: true });
```

### Meta Tags

```typescript
const meta = doc.meta();
// {
//   title: 'Page Title',
//   description: 'Page description...',
//   keywords: ['keyword1', 'keyword2'],
//   author: 'Author Name',
//   robots: 'index, follow',
//   canonical: 'https://example.com/page',
//   viewport: 'width=device-width, initial-scale=1',
//   charset: 'utf-8'
// }
```

### OpenGraph

```typescript
const og = doc.openGraph();
// {
//   title: 'Article Title',
//   type: 'article',
//   url: 'https://example.com/article',
//   image: 'https://example.com/image.jpg',
//   description: 'Article description...',
//   siteName: 'Example Site',
//   locale: 'en_US'
// }
```

### Twitter Card

```typescript
const twitter = doc.twitterCard();
// {
//   card: 'summary_large_image',
//   site: '@example',
//   creator: '@author',
//   title: 'Article Title',
//   description: 'Article description...',
//   image: 'https://example.com/card.jpg'
// }
```

### JSON-LD Structured Data

```typescript
const jsonLd = doc.jsonLd();
// [
//   {
//     '@context': 'https://schema.org',
//     '@type': 'Article',
//     'headline': 'Article Title',
//     'author': { '@type': 'Person', 'name': 'Author' },
//     'datePublished': '2024-01-15'
//   }
// ]
```

### Forms

```typescript
const forms = doc.forms();
// [
//   {
//     action: '/submit',
//     method: 'POST',
//     name: 'contact-form',
//     fields: [
//       { name: 'email', type: 'email', required: true },
//       { name: 'message', type: 'textarea' },
//       { name: 'country', type: 'select', options: [...] }
//     ]
//   }
// ]

// Get specific form
const loginForm = doc.forms('form#login')[0];
```

### Tables

```typescript
const tables = doc.tables();
// [
//   {
//     headers: ['Name', 'Price', 'Stock'],
//     rows: [
//       ['Product A', '$99', '10'],
//       ['Product B', '$149', '5']
//     ],
//     caption: 'Product Inventory'
//   }
// ]
```

### Scripts & Styles

```typescript
const scripts = doc.scripts();
// [
//   { src: '/app.js', type: 'module', async: true },
//   { inline: 'console.log("Hello")' }
// ]

const styles = doc.styles();
// [
//   { href: '/styles.css', media: 'all' },
//   { inline: 'body { margin: 0; }' }
// ]
```

## Declarative Extraction Schema

For complex extraction, use `extract()` with a schema:

```typescript
interface Product {
  name: string;
  price: number;
  description: string;
  images: string[];
  inStock: boolean;
}

const product = doc.extract<Product>({
  // Simple selector (text content)
  name: 'h1.product-title',

  // With transformation
  price: {
    selector: '.price',
    transform: (v) => parseFloat(v.replace('$', ''))
  },

  description: '.product-description',

  // Extract attribute, multiple values
  images: {
    selector: '.gallery img',
    attribute: 'src',
    multiple: true
  },

  // Boolean from existence/text
  inStock: {
    selector: '.stock-status',
    transform: (v) => v.toLowerCase().includes('in stock')
  }
});

console.log(product);
// {
//   name: 'Premium Widget',
//   price: 99.99,
//   description: 'A premium widget...',
//   images: ['/img1.jpg', '/img2.jpg', '/img3.jpg'],
//   inStock: true
// }
```

## Advanced Patterns

### Scraping with Authentication

```typescript
const client = createClient({
  baseUrl: 'https://example.com',
  headers: {
    'Cookie': 'session=abc123'
  }
});

const doc = await client.scrape('/dashboard');
```

### Pagination Scraping

```typescript
async function* scrapeAllPages(client: Client, startUrl: string) {
  let url = startUrl;

  while (url) {
    const doc = await client.scrape(url);

    // Yield items from current page
    for (const item of doc.selectAll('.item')) {
      yield {
        title: item.find('.title').text(),
        url: item.find('a').attr('href')
      };
    }

    // Find next page link
    const nextLink = doc.selectFirst('a.next');
    url = nextLink.exists() ? nextLink.attr('href') : null;
  }
}

// Use the generator
for await (const item of scrapeAllPages(client, '/products')) {
  console.log(item);
}
```

### Conditional Extraction

```typescript
const doc = await client.scrape('/article');

// Check if element exists before extracting
const author = doc.exists('.author')
  ? doc.selectFirst('.author').text()
  : 'Unknown';

// Count elements
const imageCount = doc.count('img');
console.log(`Found ${imageCount} images`);
```

### Finding by Text

```typescript
// Find elements containing text
const elements = doc.findByText('Add to Cart');

// Find with exact text match
const exactMatch = doc.findByExactText('$99.99');

// Filter by element type
const buttons = doc.findByText('Submit', 'button');
```

### Data Attributes

```typescript
// Find by data attribute
const products = doc.findByData('product-id');

// Find by data attribute with value
const featured = doc.findByData('featured', 'true');

// Access data on element
const productId = doc.selectFirst('.product').data('product-id');
```

## Utility Methods

```typescript
// Check element state
el.exists()           // Has elements in selection
el.is('a')            // Matches selector
el.hasClass('active') // Has specific class
el.index()            // Position among siblings

// Get tag name
el.tagName()          // 'div', 'a', 'span', etc.

// Clone element
const cloned = el.clone();

// Get raw Cheerio object
const $el = el.raw;

// Get raw DOM element at index
const domEl = el.get(0);
```

## Iteration Methods

```typescript
const items = doc.select('.item');

// each - iterate with callback
items.each((el, index) => {
  console.log(`${index}: ${el.text()}`);
});

// map - transform to array
const titles = items.map(el => el.find('h3').text());

// toArray - convert to ScrapeElement array
const arr = items.toArray();

// reduce - accumulate values
const totalPrice = items.reduce((sum, el) => {
  return sum + parseFloat(el.find('.price').text());
}, 0);

// some - check if any match
const hasDiscount = items.some(el => el.hasClass('discounted'));

// every - check if all match
const allInStock = items.every(el => el.find('.stock').text() !== 'Out');
```

## Direct HTML Parsing

Parse HTML strings without HTTP requests:

```typescript
import { ScrapeDocument } from 'recker/scrape';

// Create from HTML string (async factory method)
const html = '<html><body><h1>Hello World</h1></body></html>';
const doc = await ScrapeDocument.create(html);

console.log(doc.select('h1').text()); // "Hello World"
```

Or use `parseHtml()`:

```typescript
import { parseHtml } from 'recker/plugins/scrape';

const doc = await parseHtml('<html><body><h1>Hello</h1></body></html>');
console.log(doc.title()); // undefined (no <title> tag)
```

## Best Practices

### 1. Use Specific Selectors

```typescript
// ✅ Good: Stable, specific selector
const title = doc.selectFirst('.product-title').text();

// ❌ Bad: May break if structure changes
const title = doc.selectFirst('div > div > h1').text();
```

### 2. Handle Missing Elements

```typescript
// ✅ Good: Check existence
const author = doc.exists('.author')
  ? doc.selectFirst('.author').text()
  : 'Unknown';

// ✅ Good: Optional chaining
const price = doc.selectFirst('.price')?.text() || '0';
```

### 3. Configure Client for Scraping

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
    requestsPerInterval: 10,
    interval: 1000  // Max 10 requests per second
  }
});
```

### 4. Respect Rate Limits

```typescript
const client = createClient({
  baseUrl: 'https://example.com',
  concurrency: {
    max: 5,                      // Max 5 concurrent requests
    requestsPerInterval: 2,      // 2 requests per second
    interval: 1000
  }
});
```

### 5. Use Batch Scraping

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

## Next Steps

- **[GraphQL](13-graphql.md)** - GraphQL queries and mutations
- **[Concurrency](08-concurrency.md)** - Batch requests and rate limiting
- **[Caching](09-cache.md)** - Cache scraped responses

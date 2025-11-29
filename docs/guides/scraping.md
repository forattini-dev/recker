# HTML Scraping

Recker includes a powerful HTML scraping system built on [Cheerio](https://cheerio.js.org/), providing a jQuery-like API for extracting data from web pages.

## Installation

Cheerio is an **optional peer dependency** that is loaded dynamically only when you use scraping features. This means:

- Recker works without cheerio installed (scraping features will throw a helpful error)
- No cheerio code is loaded until you actually call a scraping method
- Bundle size stays minimal for users who don't need scraping

```bash
pnpm add cheerio
```

If you try to use scraping without cheerio installed, you'll get a clear error:
```
cheerio is required for scraping but not installed. Install it with: pnpm add cheerio
```

## Basic Usage

### Using `client.scrape()`

The simplest way to scrape a page:

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

For more control, use the `scrape()` helper function:

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

Returns the first matching element:

```typescript
const title = doc.selectFirst('h1').text();
const logo = doc.selectFirst('img.logo').attr('src');
```

### `selectAll(selector)` - Array of Elements

Returns an array of `ScrapeElement` objects:

```typescript
const articles = doc.selectAll('article');

for (const article of articles) {
  console.log(article.find('h2').text());
}
```

## Element Traversal

`ScrapeElement` provides chainable traversal methods:

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
// Combined text content (trimmed)
const text = el.text();

// Inner HTML
const html = el.html();

// Outer HTML (including element itself)
const outer = el.outerHtml();
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

Recker provides specialized extractors for common data types:

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

For complex extraction, use the `extract()` method with a schema:

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

### Scraping with Custom Options

```typescript
// POST request for scraping
const doc = await client.scrape('/search', {
  method: 'POST',
  json: { query: 'nodejs' }
});
```

### Base URL for Relative Links

```typescript
const doc = await client.scrape('https://example.com/page', {
  baseUrl: 'https://example.com'  // Used to resolve relative URLs
});

// All links will be absolute
const links = doc.links({ absolute: true });
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

## Best Practices

1. **Use specific selectors** - Prefer `.product-title` over `h1` for stability
2. **Handle missing elements** - Always check `exists()` or use optional chaining
3. **Respect robots.txt** - Check site policies before scraping
4. **Rate limit requests** - Use Recker's built-in rate limiting
5. **Cache responses** - Use Recker's cache plugin for repeated scrapes
6. **Set appropriate User-Agent** - Identify your scraper properly

```typescript
const client = createClient({
  baseUrl: 'https://example.com',
  headers: {
    'User-Agent': 'MyScraper/1.0 (+https://mysite.com/bot)'
  },
  plugins: [
    cache({ ttl: 3600000 }),  // Cache for 1 hour
  ],
  concurrency: {
    requestsPerInterval: 10,
    interval: 1000  // Max 10 requests per second
  }
});
```

## Direct ScrapeDocument Usage

If you need to parse HTML strings directly without making HTTP requests, use `ScrapeDocument.create()`:

```typescript
import { ScrapeDocument } from 'recker/scrape';

// Create from HTML string (async factory method)
const html = '<html><body><h1>Hello World</h1></body></html>';
const doc = await ScrapeDocument.create(html);

console.log(doc.select('h1').text()); // "Hello World"
```

You can also use `parseHtml()` from the scrape plugin:

```typescript
import { parseHtml } from 'recker/plugins/scrape';

const doc = await parseHtml('<html><body><h1>Hello</h1></body></html>');
console.log(doc.title()); // undefined (no <title> tag)
```

> **Note:** `ScrapeDocument.create()` is an async factory method because cheerio is loaded dynamically. This keeps the bundle size small for users who don't use scraping features.

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

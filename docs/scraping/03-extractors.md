# Built-in Extractors

Pre-built extractors for common data types: links, images, meta tags, social cards, structured data, forms, and tables.

## Links

Extract all links from a page with classification:

```typescript
const links = doc.links();
// [
//   { href: '/about', text: 'About Us', type: 'internal' },
//   { href: 'https://twitter.com/...', text: 'Twitter', type: 'external' },
//   { href: 'mailto:info@example.com', text: 'Email', type: 'mailto' },
//   { href: 'tel:+1234567890', text: 'Call us', type: 'tel' },
//   { href: '#section', text: 'Jump to section', type: 'anchor' }
// ]
```

### Options

```typescript
// Convert relative URLs to absolute
const absoluteLinks = doc.links({ absolute: true });
// [{ href: 'https://example.com/about', text: 'About Us', type: 'internal' }]

// Custom selector
const navLinks = doc.links({ selector: 'nav a' });
const footerLinks = doc.links({ selector: 'footer a' });

// Combined options
const allNavLinks = doc.links({
  selector: 'nav a, header a',
  absolute: true
});
```

### Link Types

| Type | Pattern | Example |
|------|---------|---------|
| `internal` | Same domain paths | `/about`, `/products/123` |
| `external` | Different domains | `https://google.com` |
| `mailto` | Email links | `mailto:user@example.com` |
| `tel` | Phone links | `tel:+1234567890` |
| `anchor` | Hash fragments | `#section`, `#top` |
| `javascript` | JS links | `javascript:void(0)` |
| `file` | File protocols | `file:///path/to/file` |

### ExtractedLink Type

```typescript
interface ExtractedLink {
  href: string;
  text: string;
  type: 'internal' | 'external' | 'mailto' | 'tel' | 'anchor' | 'javascript' | 'file';
  title?: string;
  rel?: string;
  target?: string;
}
```

## Images

Extract all images with metadata:

```typescript
const images = doc.images();
// [
//   {
//     src: '/logo.png',
//     alt: 'Company Logo',
//     width: 200,
//     height: 50
//   },
//   {
//     src: '/hero.jpg',
//     alt: 'Hero image',
//     loading: 'lazy',
//     srcset: '/hero-2x.jpg 2x, /hero-3x.jpg 3x',
//     sizes: '(max-width: 600px) 100vw, 50vw'
//   }
// ]
```

### Options

```typescript
// Convert relative URLs to absolute
const absoluteImages = doc.images({ absolute: true });

// Custom selector
const galleryImages = doc.images({ selector: '.gallery img' });
const productImages = doc.images({ selector: '.product-carousel img' });
```

### ExtractedImage Type

```typescript
interface ExtractedImage {
  src: string;
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'auto' | 'sync';
  srcset?: string;
  sizes?: string;
  class?: string;
  id?: string;
}
```

## Meta Tags

Extract all meta information:

```typescript
const meta = doc.meta();
// {
//   title: 'Page Title',
//   description: 'Page description for search results...',
//   keywords: ['keyword1', 'keyword2', 'keyword3'],
//   author: 'Author Name',
//   robots: 'index, follow',
//   canonical: 'https://example.com/page',
//   viewport: 'width=device-width, initial-scale=1',
//   charset: 'utf-8',
//   generator: 'WordPress 6.0',
//   language: 'en',
//   themeColor: '#ffffff'
// }
```

### ExtractedMeta Type

```typescript
interface ExtractedMeta {
  title?: string;
  description?: string;
  keywords?: string[];
  author?: string;
  robots?: string;
  canonical?: string;
  viewport?: string;
  charset?: string;
  generator?: string;
  language?: string;
  themeColor?: string;
  // Plus any custom meta tags
  [key: string]: string | string[] | undefined;
}
```

## OpenGraph

Extract Facebook/LinkedIn OpenGraph data:

```typescript
const og = doc.openGraph();
// {
//   title: 'Article Title',
//   type: 'article',
//   url: 'https://example.com/article',
//   image: 'https://example.com/og-image.jpg',
//   imageWidth: 1200,
//   imageHeight: 630,
//   description: 'Article description for social sharing...',
//   siteName: 'Example Site',
//   locale: 'en_US',
//   localeAlternate: ['fr_FR', 'de_DE'],
//   // Article-specific
//   'article:author': 'https://example.com/author/john',
//   'article:published_time': '2024-01-15T10:00:00Z',
//   'article:section': 'Technology'
// }
```

### OpenGraphData Type

```typescript
interface OpenGraphData {
  title?: string;
  type?: string;  // website, article, product, video.movie, etc.
  url?: string;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageAlt?: string;
  description?: string;
  siteName?: string;
  locale?: string;
  localeAlternate?: string[];
  // Type-specific properties
  [key: string]: string | number | string[] | undefined;
}
```

## Twitter Card

Extract Twitter/X Card metadata:

```typescript
const twitter = doc.twitterCard();
// {
//   card: 'summary_large_image',
//   site: '@example',
//   siteId: '123456789',
//   creator: '@author',
//   creatorId: '987654321',
//   title: 'Article Title',
//   description: 'Article description for Twitter...',
//   image: 'https://example.com/twitter-card.jpg',
//   imageAlt: 'Description of the image'
// }
```

### Twitter Card Types

| Card Type | Description |
|-----------|-------------|
| `summary` | Small thumbnail |
| `summary_large_image` | Large featured image |
| `player` | Video/audio player |
| `app` | App download card |

### TwitterCardData Type

```typescript
interface TwitterCardData {
  card?: 'summary' | 'summary_large_image' | 'player' | 'app';
  site?: string;       // @username
  siteId?: string;     // Twitter user ID
  creator?: string;    // @username of content creator
  creatorId?: string;
  title?: string;
  description?: string;
  image?: string;
  imageAlt?: string;
  // Player card specific
  player?: string;
  playerWidth?: number;
  playerHeight?: number;
  // App card specific
  appIdIphone?: string;
  appIdIpad?: string;
  appIdGoogleplay?: string;
}
```

## JSON-LD Structured Data

Extract all JSON-LD schema.org blocks:

```typescript
const jsonLd = doc.jsonLd();
// [
//   {
//     '@context': 'https://schema.org',
//     '@type': 'Article',
//     'headline': 'Article Title',
//     'author': {
//       '@type': 'Person',
//       'name': 'John Doe',
//       'url': 'https://example.com/author/john'
//     },
//     'datePublished': '2024-01-15T10:00:00Z',
//     'dateModified': '2024-01-16T08:30:00Z',
//     'publisher': {
//       '@type': 'Organization',
//       'name': 'Example News',
//       'logo': {
//         '@type': 'ImageObject',
//         'url': 'https://example.com/logo.png'
//       }
//     }
//   },
//   {
//     '@context': 'https://schema.org',
//     '@type': 'BreadcrumbList',
//     'itemListElement': [
//       { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': '/' },
//       { '@type': 'ListItem', 'position': 2, 'name': 'Tech', 'item': '/tech' }
//     ]
//   }
// ]
```

### Common Schema Types

| Type | Usage |
|------|-------|
| `Article` | Blog posts, news articles |
| `Product` | E-commerce products |
| `Organization` | Company info |
| `LocalBusiness` | Local business details |
| `BreadcrumbList` | Navigation breadcrumbs |
| `FAQPage` | FAQ sections |
| `HowTo` | Instructions |
| `Recipe` | Cooking recipes |
| `Event` | Events and shows |
| `Review` | Product/service reviews |

### JsonLdData Type

```typescript
interface JsonLdData {
  '@context': string;
  '@type': string;
  [key: string]: unknown;
}

// Returns array (pages can have multiple JSON-LD blocks)
type JsonLdResult = JsonLdData[];
```

## Forms

Extract form structure and fields:

```typescript
const forms = doc.forms();
// [
//   {
//     action: '/submit',
//     method: 'POST',
//     name: 'contact-form',
//     id: 'contact',
//     enctype: 'multipart/form-data',
//     fields: [
//       { name: 'name', type: 'text', required: true, placeholder: 'Your name' },
//       { name: 'email', type: 'email', required: true, pattern: '[^@]+@[^@]+' },
//       { name: 'phone', type: 'tel', required: false },
//       { name: 'message', type: 'textarea', required: true, maxlength: 500 },
//       { name: 'country', type: 'select', options: [
//         { value: 'us', label: 'United States' },
//         { value: 'uk', label: 'United Kingdom' }
//       ]},
//       { name: 'newsletter', type: 'checkbox', checked: false },
//       { name: 'submit', type: 'submit', value: 'Send Message' }
//     ]
//   }
// ]
```

### Custom Selector

```typescript
// Get specific form
const loginForm = doc.forms('form#login')[0];
const searchForm = doc.forms('form[role="search"]')[0];
```

### ExtractedForm Type

```typescript
interface ExtractedForm {
  action?: string;
  method?: 'GET' | 'POST';
  name?: string;
  id?: string;
  enctype?: string;
  target?: string;
  novalidate?: boolean;
  fields: ExtractedFormField[];
}

interface ExtractedFormField {
  name: string;
  type: string;  // text, email, password, select, textarea, checkbox, etc.
  id?: string;
  value?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  pattern?: string;
  minlength?: number;
  maxlength?: number;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  multiple?: boolean;
  checked?: boolean;
  options?: Array<{ value: string; label: string; selected?: boolean }>;
}
```

## Tables

Extract tables as structured data:

```typescript
const tables = doc.tables();
// [
//   {
//     caption: 'Product Inventory',
//     headers: ['Name', 'SKU', 'Price', 'Stock'],
//     rows: [
//       ['Product A', 'SKU-001', '$99.99', '10'],
//       ['Product B', 'SKU-002', '$149.99', '5'],
//       ['Product C', 'SKU-003', '$79.99', '25']
//     ],
//     id: 'inventory-table',
//     class: 'data-table sortable'
//   }
// ]
```

### Custom Selector

```typescript
// Get specific table
const priceTable = doc.tables('table#pricing')[0];
const statsTable = doc.tables('table.statistics')[0];
```

### ExtractedTable Type

```typescript
interface ExtractedTable {
  caption?: string;
  headers: string[];
  rows: string[][];
  id?: string;
  class?: string;
}
```

### Working with Table Data

```typescript
const tables = doc.tables();
const inventoryTable = tables[0];

// Convert to objects
const products = inventoryTable.rows.map(row => ({
  name: row[0],
  sku: row[1],
  price: parseFloat(row[2].replace('$', '')),
  stock: parseInt(row[3], 10)
}));

// Filter and transform
const lowStock = products.filter(p => p.stock < 10);
const totalValue = products.reduce((sum, p) => sum + p.price * p.stock, 0);
```

## Scripts & Styles

Extract script and stylesheet information:

```typescript
// Scripts
const scripts = doc.scripts();
// [
//   { src: '/app.js', type: 'module', async: true },
//   { src: '/vendor.js', defer: true },
//   { inline: 'console.log("Hello")', type: 'text/javascript' }
// ]

// Styles
const styles = doc.styles();
// [
//   { href: '/styles.css', media: 'all' },
//   { href: '/print.css', media: 'print' },
//   { inline: 'body { margin: 0; }' }
// ]
```

### ExtractedScript Type

```typescript
interface ExtractedScript {
  src?: string;
  inline?: string;
  type?: string;
  async?: boolean;
  defer?: boolean;
  module?: boolean;
  nomodule?: boolean;
  integrity?: string;
  crossorigin?: string;
}
```

### ExtractedStyle Type

```typescript
interface ExtractedStyle {
  href?: string;
  inline?: string;
  media?: string;
  rel?: string;
  type?: string;
  integrity?: string;
  crossorigin?: string;
}
```

## Page Title

Quick access to page title:

```typescript
const title = doc.title();
// "Page Title | Site Name"
```

## Combining Extractors

```typescript
// Extract everything useful from a page
async function extractPageData(url: string) {
  const doc = await client.scrape(url);

  return {
    // Basic info
    title: doc.title(),
    meta: doc.meta(),

    // Social
    openGraph: doc.openGraph(),
    twitterCard: doc.twitterCard(),

    // Structured data
    jsonLd: doc.jsonLd(),

    // Content
    links: doc.links({ absolute: true }),
    images: doc.images({ absolute: true }),

    // Interactive
    forms: doc.forms(),

    // Data tables
    tables: doc.tables()
  };
}
```

## TypeScript Support

```typescript
import type {
  ExtractedLink,
  ExtractedImage,
  ExtractedMeta,
  OpenGraphData,
  TwitterCardData,
  JsonLdData,
  ExtractedForm,
  ExtractedTable,
  ExtractedScript,
  ExtractedStyle
} from 'recker';
```

## Next Steps

- **[Schemas](04-schemas.md)** - Declarative extraction schemas
- **[Selectors](02-selectors.md)** - CSS selectors and traversal
- **[Overview](01-overview.md)** - Getting started
- **[SEO Spider](/seo/03-spider.md)** - Site-wide crawling with SEO analysis

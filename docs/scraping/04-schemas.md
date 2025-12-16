# Declarative Extraction Schemas

Extract structured data with type-safe, declarative schemas using `extract()`.

## Basic Usage

```typescript
interface Product {
  name: string;
  price: string;
  description: string;
}

const product = doc.extract<Product>({
  name: 'h1.product-title',
  price: '.price',
  description: '.product-description'
});

console.log(product);
// { name: 'Premium Widget', price: '$99.99', description: '...' }
```

## Schema Definition

Each field can be defined as:
- **String**: CSS selector (extracts text content)
- **Object**: Advanced configuration with attribute extraction and transformations

### Simple Selectors

```typescript
const data = doc.extract({
  title: 'h1',
  author: '.author-name',
  date: 'time.published'
});
```

### Field Configuration Object

```typescript
interface FieldConfig {
  selector: string;       // CSS selector
  attribute?: string;     // Extract attribute instead of text
  multiple?: boolean;     // Return array of values
  transform?: (value: string) => any;  // Transform the value
  default?: any;          // Default value if not found
  optional?: boolean;     // Exclude key if not found (default: false)
}
```

## Extracting Attributes

```typescript
const data = doc.extract({
  // Text content (default)
  title: 'h1',

  // Attribute value
  imageUrl: {
    selector: 'img.hero',
    attribute: 'src'
  },

  link: {
    selector: 'a.cta',
    attribute: 'href'
  },

  dataId: {
    selector: '.product',
    attribute: 'data-product-id'
  }
});
```

## Multiple Values

```typescript
const data = doc.extract({
  // Single value (default)
  title: 'h1',

  // Array of values
  tags: {
    selector: '.tag',
    multiple: true
  },

  // Array of attributes
  imageUrls: {
    selector: '.gallery img',
    attribute: 'src',
    multiple: true
  }
});

// {
//   title: 'Article Title',
//   tags: ['javascript', 'web', 'tutorial'],
//   imageUrls: ['/img1.jpg', '/img2.jpg', '/img3.jpg']
// }
```

## Transformations

Transform extracted values to the desired type or format:

```typescript
const product = doc.extract({
  name: 'h1',

  // Parse price from string
  price: {
    selector: '.price',
    transform: (v) => parseFloat(v.replace(/[$,]/g, ''))
  },

  // Parse date
  publishedAt: {
    selector: 'time',
    attribute: 'datetime',
    transform: (v) => new Date(v)
  },

  // Boolean from text
  inStock: {
    selector: '.stock-status',
    transform: (v) => v.toLowerCase().includes('in stock')
  },

  // Parse JSON from attribute
  config: {
    selector: '[data-config]',
    attribute: 'data-config',
    transform: (v) => JSON.parse(v)
  },

  // Split to array
  categories: {
    selector: '.categories',
    transform: (v) => v.split(',').map(s => s.trim())
  }
});
```

## Default Values

Provide fallback values when elements are not found:

```typescript
const data = doc.extract({
  title: 'h1',

  // Default string
  author: {
    selector: '.author',
    default: 'Unknown'
  },

  // Default number
  rating: {
    selector: '.rating',
    transform: (v) => parseFloat(v),
    default: 0
  },

  // Default array
  tags: {
    selector: '.tag',
    multiple: true,
    default: []
  }
});

// If .author doesn't exist: { title: 'Hello', author: 'Unknown', ... }
```

## Optional Fields

Mark fields as optional to exclude them from the result when not found:

```typescript
const data = doc.extract({
  title: 'h1',

  // Optional - key won't exist in result if not found
  subtitle: {
    selector: '.subtitle',
    optional: true
  },

  // Optional with default - uses default if not found
  author: {
    selector: '.author',
    optional: true,
    default: 'Anonymous'  // Still uses default if not found
  }
});

// If .subtitle doesn't exist: { title: 'Hello' }
// (no 'subtitle' key in result)
```

### Difference Between Default and Optional

- **default**: Field is always included in result; uses default value if not found
- **optional**: Field is excluded from result if not found (unless default is provided)

```typescript
const data = doc.extract({
  // Always in result (undefined if not found)
  author: '.author',

  // Always in result (default value if not found)
  rating: { selector: '.rating', default: 0 },

  // NOT in result if not found
  subtitle: { selector: '.subtitle', optional: true },

  // In result with default if not found (optional + default = uses default)
  category: { selector: '.category', optional: true, default: 'General' }
});
```

## Real-World Examples

### E-commerce Product Page

```typescript
interface ProductPage {
  name: string;
  price: number;
  sku: string;
  description: string;
  images: string[];
  inStock: boolean;
}

const product = doc.extract<ProductPage>({
  name: 'h1.product-title',

  price: {
    selector: '.price-current',
    transform: (v) => parseFloat(v.replace(/[$,]/g, ''))
  },

  sku: {
    selector: '[data-sku]',
    attribute: 'data-sku'
  },

  description: '.product-description',

  images: {
    selector: '.product-gallery img',
    attribute: 'src',
    multiple: true
  },

  inStock: {
    selector: '.stock-status',
    transform: (v) => v.toLowerCase() !== 'out of stock'
  }
});
```

### News Article

```typescript
interface Article {
  headline: string;
  author: string;
  published: Date;
  category: string;
  tags: string[];
  content: string;
}

const article = doc.extract<Article>({
  headline: 'h1.article-headline',

  author: '.author-name',

  published: {
    selector: 'time[itemprop="datePublished"]',
    attribute: 'datetime',
    transform: (v) => new Date(v)
  },

  category: '.article-category',

  tags: {
    selector: '.article-tag',
    multiple: true
  },

  content: '.article-body'
});
```

### Job Listing

```typescript
interface JobListing {
  title: string;
  company: string;
  location: string;
  salary: string;
  type: string;
  posted: Date;
  requirements: string[];
}

const job = doc.extract<JobListing>({
  title: 'h1.job-title',

  company: '.company-name',

  location: '.job-location',

  salary: '.salary-range',

  type: '.job-type',

  posted: {
    selector: 'time.posted-date',
    attribute: 'datetime',
    transform: (v) => new Date(v)
  },

  requirements: {
    selector: '.requirements li',
    multiple: true
  }
});
```

## Combining with Manual Extraction

For complex nested structures, combine schema extraction with manual selection:

```typescript
const pageData = {
  // Schema extraction for simple fields
  ...doc.extract({
    title: 'h1',
    description: '.description'
  }),

  // Manual extraction for nested data
  reviews: doc.selectAll('.review').map(el => ({
    author: el.find('.author').text(),
    rating: parseFloat(el.find('.rating').text()),
    text: el.find('.text').text(),
    date: el.find('time').attr('datetime')
  })),

  // Built-in extractors
  meta: doc.meta(),
  links: doc.links({ selector: 'article a' }),
  images: doc.images({ selector: 'article img' })
};
```

## Extracting Lists with Items

For repeated items, use manual extraction:

```typescript
interface ProductListing {
  products: Array<{
    name: string;
    price: number;
    image: string;
    url: string;
  }>;
  currentPage: number;
  totalPages: number;
}

// Extract products manually
const products = doc.selectAll('.product-card').map(el => ({
  name: el.find('.product-name').text(),
  price: parseFloat(el.find('.price').text().replace('$', '')),
  image: el.find('img').attr('src') || '',
  url: el.find('a').attr('href') || ''
}));

// Extract pagination with schema
const pagination = doc.extract({
  currentPage: {
    selector: '.pagination .current',
    transform: (v) => parseInt(v)
  },
  totalPages: {
    selector: '.pagination .total',
    transform: (v) => parseInt(v)
  }
});

const listing: ProductListing = {
  products,
  currentPage: pagination.currentPage || 1,
  totalPages: pagination.totalPages || 1
};
```

## TypeScript Support

```typescript
import type { ExtractionSchema } from 'recker';

interface Product {
  name: string;
  price: number;
}

// The schema type is inferred
const schema = {
  name: 'h1',
  price: {
    selector: '.price',
    transform: (v: string) => parseFloat(v)
  }
};

// Generic extraction with type assertion
const product = doc.extract<Product>(schema);
```

## Best Practices

### 1. Use Specific Selectors

```typescript
// Good: Specific, stable selectors
const data = doc.extract({
  title: 'h1.product-title',
  price: '.product-info .price-current'
});

// Fragile: Position-dependent selectors
const data = doc.extract({
  title: 'div > div > h1',
  price: 'span:nth-child(3)'
});
```

### 2. Always Transform Numeric Values

```typescript
// Good: Transform to number
price: {
  selector: '.price',
  transform: (v) => parseFloat(v.replace(/[$,]/g, ''))
}

// Bad: Returns string
price: '.price'  // "$99.99" as string
```

### 3. Handle Empty Values in Transform

```typescript
rating: {
  selector: '.rating',
  transform: (v) => v ? parseFloat(v) : 0
}
```

### 4. Use Attribute Extraction for Data Attributes

```typescript
// Good: Clean data from attributes
productId: {
  selector: '.product',
  attribute: 'data-product-id'
}

// Avoid: Parsing from visible text
productId: {
  selector: '.product-id',
  transform: (v) => v.replace('ID: ', '')
}
```

## Next Steps

- **[Overview](01-overview.md)** - Getting started with scraping
- **[Selectors](02-selectors.md)** - CSS selectors and traversal
- **[Extractors](03-extractors.md)** - Built-in data extractors
- **[Spider](05-spider.md)** - Site-wide crawling

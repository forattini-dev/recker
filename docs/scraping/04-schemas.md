# Declarative Extraction Schemas

Extract complex data structures with type-safe, declarative schemas using `extract()`.

## Basic Usage

```typescript
interface Product {
  name: string;
  price: number;
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
- **Object**: Advanced configuration with transformations

### Simple Selectors

```typescript
const data = doc.extract({
  title: 'h1',
  author: '.author-name',
  date: 'time.published'
});
```

### Advanced Field Configuration

```typescript
interface FieldConfig {
  selector: string;
  attribute?: string;     // Extract attribute instead of text
  multiple?: boolean;     // Return array of values
  transform?: (value: string) => any;  // Transform the value
  default?: any;          // Default if not found
  optional?: boolean;     // Don't error if missing
  nested?: Schema;        // Nested schema for child elements
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

```typescript
const data = doc.extract({
  title: 'h1',

  // Default if element not found
  author: {
    selector: '.author',
    default: 'Unknown'
  },

  // Default with type transformation
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
```

## Optional Fields

Mark fields as optional to skip them if not found:

```typescript
const data = doc.extract({
  title: 'h1',

  // Optional - won't error if missing
  subtitle: {
    selector: '.subtitle',
    optional: true
  },

  // Optional with default
  author: {
    selector: '.author',
    optional: true,
    default: 'Anonymous'
  }
});
```

## Nested Schemas

Extract nested structures from child elements:

```typescript
interface Article {
  title: string;
  author: {
    name: string;
    avatar: string;
    bio: string;
  };
  metadata: {
    published: Date;
    updated: Date;
    readTime: number;
  };
}

const article = doc.extract<Article>({
  title: 'h1',

  author: {
    selector: '.author-card',
    nested: {
      name: '.name',
      avatar: {
        selector: 'img',
        attribute: 'src'
      },
      bio: '.bio'
    }
  },

  metadata: {
    selector: '.article-meta',
    nested: {
      published: {
        selector: 'time.published',
        attribute: 'datetime',
        transform: (v) => new Date(v)
      },
      updated: {
        selector: 'time.updated',
        attribute: 'datetime',
        transform: (v) => new Date(v)
      },
      readTime: {
        selector: '.read-time',
        transform: (v) => parseInt(v)
      }
    }
  }
});
```

## Extracting Lists

Extract arrays of objects from repeated elements:

```typescript
interface ProductListing {
  products: Array<{
    name: string;
    price: number;
    image: string;
    url: string;
  }>;
  pagination: {
    current: number;
    total: number;
    hasNext: boolean;
  };
}

const listing = doc.extract<ProductListing>({
  products: {
    selector: '.product-card',
    multiple: true,
    nested: {
      name: '.product-name',
      price: {
        selector: '.price',
        transform: (v) => parseFloat(v.replace('$', ''))
      },
      image: {
        selector: 'img',
        attribute: 'src'
      },
      url: {
        selector: 'a',
        attribute: 'href'
      }
    }
  },

  pagination: {
    selector: '.pagination',
    nested: {
      current: {
        selector: '.current',
        transform: (v) => parseInt(v)
      },
      total: {
        selector: '.total',
        transform: (v) => parseInt(v)
      },
      hasNext: {
        selector: '.next',
        transform: (_, el) => el.exists()
      }
    }
  }
});

// {
//   products: [
//     { name: 'Widget A', price: 99.99, image: '/a.jpg', url: '/products/a' },
//     { name: 'Widget B', price: 149.99, image: '/b.jpg', url: '/products/b' }
//   ],
//   pagination: { current: 1, total: 10, hasNext: true }
// }
```

## Element Access in Transform

Access the element itself in transformations:

```typescript
const data = doc.extract({
  items: {
    selector: '.item',
    multiple: true,
    nested: {
      name: '.name',

      // Access element for complex logic
      status: {
        selector: '',  // Empty = use parent element
        transform: (_, el) => {
          if (el.hasClass('sold-out')) return 'sold-out';
          if (el.hasClass('low-stock')) return 'low-stock';
          return 'available';
        }
      },

      // Check existence
      featured: {
        selector: '.featured-badge',
        transform: (_, el) => el.exists()
      }
    }
  }
});
```

## Conditional Extraction

```typescript
const data = doc.extract({
  // Extract based on page type
  content: {
    selector: 'body',
    transform: (_, el) => {
      // Article page
      if (el.find('article').exists()) {
        return {
          type: 'article',
          body: el.find('article').text(),
          author: el.find('.author').text()
        };
      }
      // Product page
      if (el.find('.product').exists()) {
        return {
          type: 'product',
          price: el.find('.price').text(),
          sku: el.find('.sku').text()
        };
      }
      return { type: 'unknown' };
    }
  }
});
```

## Combining with Extractors

Mix schemas with built-in extractors:

```typescript
const pageData = {
  // Schema extraction
  ...doc.extract({
    title: 'h1',
    description: '.description'
  }),

  // Built-in extractors
  meta: doc.meta(),
  openGraph: doc.openGraph(),
  links: doc.links({ selector: 'article a' }),
  images: doc.images({ selector: 'article img' })
};
```

## Real-World Examples

### E-commerce Product Page

```typescript
interface ProductPage {
  name: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  sku: string;
  description: string;
  images: string[];
  variants: Array<{
    name: string;
    value: string;
    available: boolean;
  }>;
  reviews: {
    average: number;
    count: number;
  };
  inStock: boolean;
}

const product = doc.extract<ProductPage>({
  name: 'h1.product-title',

  price: {
    selector: '.price-current',
    transform: (v) => parseFloat(v.replace(/[$,]/g, ''))
  },

  originalPrice: {
    selector: '.price-original',
    optional: true,
    transform: (v) => parseFloat(v.replace(/[$,]/g, ''))
  },

  discount: {
    selector: '.discount-badge',
    optional: true,
    transform: (v) => parseInt(v)
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

  variants: {
    selector: '.variant-option',
    multiple: true,
    nested: {
      name: {
        selector: '',
        attribute: 'data-variant-name'
      },
      value: '.variant-value',
      available: {
        selector: '',
        transform: (_, el) => !el.hasClass('out-of-stock')
      }
    }
  },

  reviews: {
    selector: '.reviews-summary',
    nested: {
      average: {
        selector: '.rating-value',
        transform: (v) => parseFloat(v)
      },
      count: {
        selector: '.review-count',
        transform: (v) => parseInt(v.replace(/[^\d]/g, ''))
      }
    }
  },

  inStock: {
    selector: '.stock-status',
    transform: (v) => v.toLowerCase() !== 'out of stock'
  }
});
```

### News Article

```typescript
interface NewsArticle {
  headline: string;
  subheadline?: string;
  author: {
    name: string;
    url: string;
    avatar?: string;
  };
  published: Date;
  updated?: Date;
  category: string;
  tags: string[];
  content: string;
  relatedArticles: Array<{
    title: string;
    url: string;
    thumbnail: string;
  }>;
}

const article = doc.extract<NewsArticle>({
  headline: 'h1.article-headline',

  subheadline: {
    selector: '.article-subheadline',
    optional: true
  },

  author: {
    selector: '.author-info',
    nested: {
      name: '.author-name',
      url: {
        selector: 'a',
        attribute: 'href'
      },
      avatar: {
        selector: 'img',
        attribute: 'src',
        optional: true
      }
    }
  },

  published: {
    selector: 'time[itemprop="datePublished"]',
    attribute: 'datetime',
    transform: (v) => new Date(v)
  },

  updated: {
    selector: 'time[itemprop="dateModified"]',
    attribute: 'datetime',
    optional: true,
    transform: (v) => new Date(v)
  },

  category: '.article-category',

  tags: {
    selector: '.article-tag',
    multiple: true
  },

  content: '.article-body',

  relatedArticles: {
    selector: '.related-article',
    multiple: true,
    nested: {
      title: '.related-title',
      url: {
        selector: 'a',
        attribute: 'href'
      },
      thumbnail: {
        selector: 'img',
        attribute: 'src'
      }
    }
  }
});
```

### Job Listing

```typescript
interface JobListing {
  title: string;
  company: {
    name: string;
    logo: string;
    url: string;
  };
  location: string;
  remote: boolean;
  salary?: {
    min: number;
    max: number;
    currency: string;
  };
  type: string;
  posted: Date;
  description: string;
  requirements: string[];
  benefits: string[];
}

const job = doc.extract<JobListing>({
  title: 'h1.job-title',

  company: {
    selector: '.company-info',
    nested: {
      name: '.company-name',
      logo: {
        selector: 'img.company-logo',
        attribute: 'src'
      },
      url: {
        selector: 'a',
        attribute: 'href'
      }
    }
  },

  location: '.job-location',

  remote: {
    selector: '.job-tags',
    transform: (v) => v.toLowerCase().includes('remote')
  },

  salary: {
    selector: '.salary-range',
    optional: true,
    transform: (v) => {
      const match = v.match(/\$?([\d,]+)\s*-\s*\$?([\d,]+)\s*(\w+)?/);
      if (!match) return undefined;
      return {
        min: parseInt(match[1].replace(',', '')),
        max: parseInt(match[2].replace(',', '')),
        currency: 'USD'
      };
    }
  },

  type: '.job-type',

  posted: {
    selector: 'time.posted-date',
    attribute: 'datetime',
    transform: (v) => new Date(v)
  },

  description: '.job-description',

  requirements: {
    selector: '.requirements li',
    multiple: true
  },

  benefits: {
    selector: '.benefits li',
    multiple: true
  }
});
```

## TypeScript Support

```typescript
import type { ExtractionSchema } from 'recker';

// Type-safe schema definition
const schema: ExtractionSchema<Product> = {
  name: 'h1',
  price: {
    selector: '.price',
    transform: (v) => parseFloat(v)
  }
};

// Generic extraction with type inference
const product = doc.extract<Product>(schema);
```

## Next Steps

- **[Overview](01-overview.md)** - Getting started with scraping
- **[Selectors](02-selectors.md)** - CSS selectors and traversal
- **[Extractors](03-extractors.md)** - Built-in data extractors
- **[SEO Spider](/seo/03-spider.md)** - Site-wide crawling

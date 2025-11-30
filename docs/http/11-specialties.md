# Specialties

GraphQL, SOAP, XML-RPC, web scraping, and AI/LLM text extraction.

## GraphQL

### Basic GraphQL Request

```typescript
import { graphql, graphqlPlugin } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com/graphql',
  plugins: [graphqlPlugin()]
});

// Using helper function
const data = await graphql(client, `
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      name
      email
    }
  }
`, { id: '123' });

console.log(data.user); // { id: '123', name: 'John', email: '...' }
```

### GraphQL Error Handling

The plugin automatically detects GraphQL errors in responses:

```typescript
import { GraphQLError } from 'recker';

try {
  const data = await graphql(client, `
    query { invalidField }
  `);
} catch (error) {
  if (error instanceof GraphQLError) {
    console.log('GraphQL errors:', error.errors);
    // [{ message: 'Cannot query field "invalidField"', ... }]
  }
}
```

### Disable Automatic Error Throwing

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com/graphql',
  plugins: [
    graphqlPlugin({ throwOnErrors: false })
  ]
});

// Errors won't throw - check response manually
const response = await client.post('', {
  query: 'query { users { name } }'
});

const { data, errors } = await response.json();
if (errors) {
  console.log('GraphQL errors:', errors);
}
```

### GraphQL with GET Method

```typescript
const data = await graphql(client, `
  query GetUsers {
    users { name }
  }
`, {}, { method: 'GET' });
```

### Manual GraphQL Requests

```typescript
// Without helper - full control
const response = await client.post('', {
  query: `
    mutation CreateUser($input: CreateUserInput!) {
      createUser(input: $input) {
        id
        name
      }
    }
  `,
  variables: { input: { name: 'John', email: 'john@example.com' } },
  operationName: 'CreateUser'
});

const { data, errors } = await response.json();
```

## SOAP

### Create SOAP Client

```typescript
import { createSoapClient, soap } from 'recker';

// Option 1: Using factory function
const client = createClient({ baseUrl: 'https://api.example.com' });
const soapClient = createSoapClient(client, {
  endpoint: '/soap',
  namespace: 'http://example.com/service',
  version: '1.2'
});

// Option 2: Using plugin
const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [soap()]
});

const soapClient = client.soap({
  endpoint: '/soap',
  namespace: 'http://example.com/service'
});
```

### Call SOAP Methods

```typescript
const result = await soapClient.call('GetUser', { userId: 123 });

if (result.success) {
  console.log('User:', result.result);
} else {
  console.log('SOAP Fault:', result.fault);
  // { code: 'Server', string: 'User not found', ... }
}
```

### SOAP with Custom Headers

```typescript
const result = await soapClient.call('SecureMethod',
  { data: 'sensitive' },
  {
    soapHeaders: {
      AuthToken: 'secret-token',
      Timestamp: new Date().toISOString()
    },
    soapAction: 'http://example.com/SecureMethod'
  }
);
```

### SOAP 1.1 vs 1.2

```typescript
// SOAP 1.1 (legacy systems)
const soap11 = createSoapClient(client, {
  endpoint: '/soap',
  version: '1.1',  // Uses text/xml content type
  namespace: 'http://example.com/service'
});

// SOAP 1.2 (default)
const soap12 = createSoapClient(client, {
  endpoint: '/soap',
  version: '1.2',  // Uses application/soap+xml
  namespace: 'http://example.com/service'
});
```

### Fetch WSDL

```typescript
const soapClient = createSoapClient(client, {
  endpoint: '/soap',
  wsdl: '/soap?wsdl',
  namespace: 'http://example.com/service'
});

// Fetch and parse WSDL
const wsdl = await soapClient.getWsdl();
console.log(wsdl); // Raw WSDL XML
```

## XML-RPC

### Create XML-RPC Client

```typescript
import { createXmlRpcClient, soap } from 'recker';

// Option 1: Factory function
const xmlrpc = createXmlRpcClient(client, {
  endpoint: '/xmlrpc'
});

// Option 2: Using plugin
const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [soap()]
});

const xmlrpc = client.xmlrpc('/xmlrpc');
```

### Call XML-RPC Methods

```typescript
// Simple call
const methods = await xmlrpc.call('system.listMethods');
console.log(methods.result); // ['add', 'subtract', 'multiply', ...]

// Call with parameters
const sum = await xmlrpc.call('math.add', [1, 2, 3]);
console.log(sum.result); // 6

// Complex data types
const result = await xmlrpc.call('user.create', [{
  name: 'John',
  age: 30,
  tags: ['developer', 'admin'],
  metadata: { active: true }
}]);
```

### Handle XML-RPC Faults

```typescript
const result = await xmlrpc.call('method.that.fails');

if (!result.success) {
  console.log('Fault code:', result.fault.faultCode);
  console.log('Fault string:', result.fault.faultString);
}
```

### XML-RPC Data Types

Automatic type conversion:

| JavaScript | XML-RPC |
|------------|---------|
| `number` (int) | `<int>` |
| `number` (float) | `<double>` |
| `boolean` | `<boolean>` |
| `string` | `<string>` |
| `Date` | `<dateTime.iso8601>` |
| `Buffer` | `<base64>` |
| `Array` | `<array>` |
| `Object` | `<struct>` |
| `null` | `<nil/>` |

## Web Scraping

### Basic Scraping

```typescript
import { scrape } from 'recker/plugins/scrape';

const client = createClient();

// Get full document control
const doc = await scrape(client.get('https://example.com')).scrape();

// Query elements
const title = doc.select('h1').text();
const links = doc.selectAll('a').map(el => el.attr('href'));
```

### Quick Extraction Methods

```typescript
// Extract all links
const links = await scrape(client.get('/page')).links();
// [{ href: '/about', text: 'About', rel: 'noopener', ... }]

// Extract all images
const images = await scrape(client.get('/page')).images();
// [{ src: '/img.jpg', alt: 'Description', width: 800, ... }]

// Extract meta tags
const meta = await scrape(client.get('/page')).meta();
// { title: 'Page Title', description: '...', keywords: [...], ... }
```

### Extract Structured Data

```typescript
// OpenGraph metadata
const og = await scrape(client.get('/article')).openGraph();
// { title: 'Article Title', description: '...', image: '...', ... }

// Twitter Card data
const twitter = await scrape(client.get('/article')).twitterCard();
// { card: 'summary_large_image', title: '...', ... }

// JSON-LD structured data
const jsonLd = await scrape(client.get('/product')).jsonLd();
// [{ '@type': 'Product', name: '...', price: '...' }]
```

### Declarative Extraction Schema

```typescript
const data = await scrape(client.get('/product')).extract({
  // Simple selector (text content)
  title: 'h1.product-title',

  // With transformation
  price: {
    selector: '.price',
    transform: v => parseFloat(v.replace('$', ''))
  },

  // Extract attribute
  image: {
    selector: '.main-image',
    attribute: 'src'
  },

  // Multiple values
  tags: {
    selector: '.tag',
    multiple: true
  },

  // Multiple attributes
  gallery: {
    selector: '.gallery img',
    attribute: 'src',
    multiple: true
  }
});

console.log(data);
// {
//   title: 'Product Name',
//   price: 29.99,
//   image: '/product.jpg',
//   tags: ['electronics', 'new'],
//   gallery: ['/img1.jpg', '/img2.jpg']
// }
```

### ScrapeDocument API

```typescript
const doc = await scrape(client.get('/page')).scrape();

// Query methods
doc.select('h1');           // First match as ScrapeElement
doc.selectFirst('h1');      // Same as select
doc.selectAll('.item');     // Array of ScrapeElement

// Quick text extraction
doc.text('h1');             // Get text from first h1
doc.texts('.item');         // Get text from all .item
doc.attr('a', 'href');      // Get href from first <a>
doc.attrs('a', 'href');     // Get href from all <a>

// HTML extraction
doc.innerHtml('.content');  // Inner HTML
doc.outerHtml('.content');  // Outer HTML
doc.html();                 // Full document HTML

// Utilities
doc.title();                // Page title
doc.exists('.selector');    // Check if element exists
doc.count('.item');         // Count matching elements

// Advanced queries
doc.findByText('Contact');        // Find elements containing text
doc.findByExactText('Contact');   // Find elements with exact text
doc.findByData('id', '123');      // Find by data attribute
```

### ScrapeElement API

```typescript
const el = doc.select('.product');

// Content
el.text();              // Text content
el.html();              // Inner HTML
el.outerHtml();         // Outer HTML

// Attributes
el.attr('class');       // Get attribute
el.data('id');          // Get data-id attribute
el.hasClass('active');  // Check class

// Traversal
el.parent();            // Parent element
el.children();          // Direct children
el.find('.nested');     // Find within element
el.next();              // Next sibling
el.prev();              // Previous sibling
el.closest('.wrapper'); // Closest ancestor
```

### Extract Forms

```typescript
const forms = await scrape(client.get('/login')).forms();
// [{
//   action: '/api/login',
//   method: 'POST',
//   fields: [
//     { name: 'username', type: 'text', value: '' },
//     { name: 'password', type: 'password', value: '' }
//   ]
// }]
```

### Extract Tables

```typescript
const tables = await scrape(client.get('/data')).tables();
// [{
//   headers: ['Name', 'Age', 'City'],
//   rows: [
//     ['John', '30', 'NYC'],
//     ['Jane', '25', 'LA']
//   ]
// }]
```

### Parse HTML String

```typescript
import { parseHtml } from 'recker/plugins/scrape';

const html = '<html><body><h1>Hello</h1></body></html>';
const doc = await parseHtml(html);

console.log(doc.text('h1')); // 'Hello'
```

### Absolute URLs

```typescript
// Enable absolute URL resolution
const links = await scrape(client.get('https://example.com')).links({
  absolute: true
});
// [{ href: 'https://example.com/about', ... }]

const images = await scrape(client.get('https://example.com')).images({
  absolute: true
});
// [{ src: 'https://example.com/img.jpg', ... }]
```

### Raw Cheerio Access

```typescript
const doc = await scrape(client.get('/page')).scrape();

// Access underlying Cheerio instance
const $ = doc.raw;
$('h1').addClass('highlighted');
```

## AI/LLM Text Extraction

### Clean Text for AI

Strip HTML and extract clean text for LLM processing:

```typescript
// Get clean text from HTML response
const text = await client.get('/article').cleanText();
// Pure text without HTML tags, scripts, styles

// Use in AI context
const prompt = `Summarize: ${text}`;
```

### Scraping for AI

```typescript
import { scrape } from 'recker/plugins/scrape';

// Extract article content
const doc = await scrape(client.get('/article')).scrape();

// Get main content (without navigation, ads, etc.)
const content = doc.select('article').text();

// Get structured data for context
const meta = doc.meta();
const og = doc.openGraph();

const context = {
  title: meta.title,
  description: meta.description,
  content,
  publishDate: og.publishedTime
};
```

### Web Page Summarization

```typescript
async function summarizeUrl(url: string) {
  // Extract clean content
  const doc = await scrape(client.get(url)).scrape();

  const title = doc.title();
  const content = doc.select('main, article, .content').text();
  const wordCount = content.split(/\s+/).length;

  // Extract key metadata
  const meta = doc.meta();
  const og = doc.openGraph();

  return {
    title,
    description: meta.description,
    content: content.slice(0, 10000), // Limit for LLM context
    wordCount,
    author: og.author,
    publishDate: og.publishedTime
  };
}
```

### Extract Links for Crawling

```typescript
async function crawlLinks(startUrl: string, depth: number = 2) {
  const visited = new Set<string>();
  const queue = [{ url: startUrl, depth: 0 }];

  while (queue.length > 0) {
    const { url, depth: currentDepth } = queue.shift()!;

    if (visited.has(url) || currentDepth > depth) continue;
    visited.add(url);

    const links = await scrape(client.get(url)).links({
      absolute: true
    });

    // Filter internal links
    const internalLinks = links.filter(
      link => link.href.startsWith(new URL(startUrl).origin)
    );

    for (const link of internalLinks) {
      if (!visited.has(link.href)) {
        queue.push({ url: link.href, depth: currentDepth + 1 });
      }
    }
  }

  return Array.from(visited);
}
```

## Best Practices

### 1. Use Appropriate Protocol

```typescript
// REST API
await client.get('/api/users');

// GraphQL API
await graphql(client, 'query { users { name } }');

// SOAP Web Service
await soapClient.call('GetUsers');

// XML-RPC Service
await xmlrpc.call('users.list');
```

### 2. Handle Protocol-Specific Errors

```typescript
try {
  // GraphQL
  await graphql(client, query);
} catch (error) {
  if (error instanceof GraphQLError) {
    // Handle GraphQL validation errors
  }
}

// SOAP
const result = await soapClient.call('Method');
if (!result.success) {
  // Handle SOAP fault
  console.log(result.fault);
}
```

### 3. Rate Limit Scraping

```typescript
const client = createClient({
  concurrency: {
    max: 5,
    requestsPerInterval: 10,
    interval: 1000
  }
});

// Scrape politely
const urls = [/* many urls */];
const { results } = await client.batch(
  urls.map(url => ({ path: url })),
  {
    concurrency: 3,
    mapResponse: async (res) => scrape(Promise.resolve(res)).extract(schema)
  }
);
```

### 4. Cache GraphQL Responses

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com/graphql',
  plugins: [graphqlPlugin()],
  cache: {
    strategy: 'cache-first',
    ttl: 60000,
    methods: ['POST'] // Cache GraphQL POST requests
  }
});
```

### 5. Install Peer Dependencies

```bash
# For scraping
pnpm add cheerio

# Cheerio is loaded dynamically only when scraping
```

## Next Steps

- **[Observability](12-observability.md)** - Debug, timings, logging
- **[Testing](../reference/testing.md)** - Mock and test HTTP requests

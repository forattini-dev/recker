# Header Parsing Utilities

> Extract useful information from HTTP response headers

Recker includes powerful utilities for parsing common HTTP response headers to extract cache information, cloud provider metadata, and rate limit details. These utilities help you understand how your requests are being served and handled by CDNs, proxies, and APIs.

## Quick Start

```typescript
import { parseHeaders, parseCacheInfo, parseCloudInfo, parseRateLimitInfo } from 'recker';

const client = createClient({ baseUrl: 'https://api.example.com' });
const response = await client.get('/data');

// Parse all headers at once
const info = parseHeaders(response.headers, response.status);

console.log('Cache:', info.cache);
console.log('Cloud Provider:', info.cloud);
console.log('Rate Limit:', info.rateLimit);

// Or parse individually
const cacheInfo = parseCacheInfo(response.headers);
const cloudInfo = parseCloudInfo(response.headers);
const rateLimitInfo = parseRateLimitInfo(response.headers, response.status);
```

## Cache Information

Extract cache status from CDN and proxy headers.

### parseCacheInfo()

Detects cache hits/misses and identifies the caching provider.

```typescript
import { parseCacheInfo } from 'recker';

const cacheInfo = parseCacheInfo(response.headers);

console.log(cacheInfo);
// {
//   hit: true,
//   status: 'HIT',
//   age: 120,          // Cache age in seconds
//   maxAge: 3600,      // Max age from Cache-Control
//   provider: 'cloudflare'
// }
```

### Supported CDNs & Proxies

| Provider | Detection Header | Status Header |
|----------|-----------------|---------------|
| **Cloudflare** | `cf-cache-status` | `cf-cache-status` |
| **Fastly** | `x-cache` | `x-cache` |
| **Akamai** | `x-akamai-cache-status` | `x-akamai-cache-status` |
| **CloudFront** | `x-amz-cf-id` | `x-cache` |
| **Varnish** | `x-cache` | `x-cache` |
| **Nginx** | `x-cache` | `x-cache` |

### Cache Statuses

- `HIT` - Response served from cache
- `MISS` - Response not in cache, fetched from origin
- `EXPIRED` - Cached response expired, revalidated
- `STALE` - Serving stale cached response
- `BYPASS` - Cache bypassed for this request
- `REVALIDATED` - Cache revalidated with origin

### Examples

#### Cloudflare Cache Detection

```typescript
const client = createClient({ baseUrl: 'https://example.com' });
const response = await client.get('/api/data');

const cache = parseCacheInfo(response.headers);

if (cache.provider === 'cloudflare') {
  console.log(`Cloudflare Cache Status: ${cache.status}`);
  console.log(`Cache Hit: ${cache.hit}`);

  if (cache.age) {
    console.log(`Cached ${cache.age} seconds ago`);
  }

  if (cache.maxAge) {
    const remaining = cache.maxAge - (cache.age || 0);
    console.log(`Expires in ${remaining} seconds`);
  }
}
```

#### Fastly Cache Monitoring

```typescript
async function monitorCacheHitRate(urls: string[]) {
  const client = createClient({ baseUrl: 'https://cdn.example.com' });

  let hits = 0;
  let total = 0;

  for (const url of urls) {
    const response = await client.get(url);
    const cache = parseCacheInfo(response.headers);

    total++;
    if (cache.hit) hits++;

    console.log(`${url}: ${cache.status} (${cache.provider || 'unknown'})`);
  }

  const hitRate = (hits / total * 100).toFixed(1);
  console.log(`\nCache Hit Rate: ${hitRate}% (${hits}/${total})`);
}

await monitorCacheHitRate(['/page1', '/page2', '/page3']);
```

#### Cache Performance Analysis

```typescript
async function analyzeCachePerformance(endpoint: string) {
  const client = createClient({ baseUrl: 'https://api.example.com' });

  const results = [];

  // Test multiple requests to same endpoint
  for (let i = 0; i < 10; i++) {
    const start = Date.now();
    const response = await client.get(endpoint);
    const duration = Date.now() - start;

    const cache = parseCacheInfo(response.headers);

    results.push({
      attempt: i + 1,
      hit: cache.hit,
      status: cache.status,
      duration,
      age: cache.age
    });

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Analyze results
  const cached = results.filter(r => r.hit);
  const uncached = results.filter(r => !r.hit);

  console.log('\nPerformance Analysis:');
  console.log(`  Cache Hits: ${cached.length}`);
  console.log(`  Cache Misses: ${uncached.length}`);

  if (cached.length > 0) {
    const avgCached = cached.reduce((sum, r) => sum + r.duration, 0) / cached.length;
    console.log(`  Avg Cached Response: ${avgCached.toFixed(0)}ms`);
  }

  if (uncached.length > 0) {
    const avgUncached = uncached.reduce((sum, r) => sum + r.duration, 0) / uncached.length;
    console.log(`  Avg Uncached Response: ${avgUncached.toFixed(0)}ms`);
  }

  return results;
}

await analyzeCachePerformance('/api/expensive-operation');
```

## Cloud Provider Detection

Identify the cloud provider, CDN, or hosting platform serving your requests.

### parseCloudInfo()

Detects cloud providers from their specific headers.

```typescript
import { parseCloudInfo } from 'recker';

const cloudInfo = parseCloudInfo(response.headers);

console.log(cloudInfo);
// {
//   provider: 'cloudflare',
//   region: 'SJC',
//   ray: '7f1234567890abcd-SJC',
//   server: 'cloudflare'
// }
```

### Supported Providers

| Provider | Detection Headers | Metadata |
|----------|------------------|----------|
| **Cloudflare** | `cf-ray` | Ray ID, region (airport code) |
| **AWS CloudFront** | `x-amz-cf-id`, `x-amz-cf-pop` | Request ID, POP location |
| **Fastly** | `x-served-by` | Server name |
| **Vercel** | `x-vercel-id` | Request ID |
| **Netlify** | `x-nf-request-id` | Request ID |
| **Google Cloud** | `x-cloud-trace-context` | Trace context |
| **Azure** | `x-ms-request-id` | Request ID |
| **Akamai** | `server` header | Server info |

### Examples

#### Cloudflare Detection

```typescript
const response = await client.get('https://example.com');
const cloud = parseCloudInfo(response.headers);

if (cloud.provider === 'cloudflare') {
  console.log(`Served by Cloudflare`);
  console.log(`Ray ID: ${cloud.ray}`);
  console.log(`Edge Location: ${cloud.region}`);

  // Cloudflare region codes are IATA airport codes
  const locations: Record<string, string> = {
    'SJC': 'San Jose, CA',
    'LAX': 'Los Angeles, CA',
    'ORD': 'Chicago, IL',
    'IAD': 'Ashburn, VA',
    'LHR': 'London, UK',
    'FRA': 'Frankfurt, Germany'
  };

  if (cloud.region && locations[cloud.region]) {
    console.log(`Location: ${locations[cloud.region]}`);
  }
}
```

#### Multi-Provider Detection

```typescript
async function detectProviders(urls: string[]) {
  const providers = new Map<string, number>();

  for (const url of urls) {
    try {
      const response = await fetch(url);
      const headers = response.headers;
      const cloud = parseCloudInfo(headers);

      const provider = cloud.provider || 'unknown';
      providers.set(provider, (providers.get(provider) || 0) + 1);

      console.log(`${url} → ${provider}`);
    } catch (error) {
      console.error(`Failed to check ${url}`);
    }
  }

  console.log('\nProvider Distribution:');
  for (const [provider, count] of providers.entries()) {
    console.log(`  ${provider}: ${count}`);
  }
}

await detectProviders([
  'https://github.com',
  'https://vercel.com',
  'https://netlify.com',
  'https://cloudflare.com'
]);
```

#### Request Tracing

```typescript
async function traceRequest(url: string) {
  const client = createClient({});
  const response = await client.get(url);

  const cloud = parseCloudInfo(response.headers);
  const cache = parseCacheInfo(response.headers);

  console.log('\nRequest Trace:');
  console.log(`  URL: ${url}`);
  console.log(`  Provider: ${cloud.provider || 'unknown'}`);
  console.log(`  Region: ${cloud.region || 'unknown'}`);
  console.log(`  Request ID: ${cloud.requestId || 'N/A'}`);
  console.log(`  Cache Status: ${cache.status || 'N/A'}`);
  console.log(`  Cache Provider: ${cache.provider || 'N/A'}`);

  if (cloud.ray) {
    console.log(`  Cloudflare Ray ID: ${cloud.ray}`);
  }

  if (cloud.server) {
    console.log(`  Server: ${cloud.server}`);
  }

  return { cloud, cache };
}

await traceRequest('https://example.com/api/data');
```

#### Geographic Distribution Analysis

```typescript
async function analyzeGeography(endpoint: string, iterations: number = 10) {
  const client = createClient({ baseUrl: 'https://api.example.com' });
  const regions = new Map<string, number>();

  for (let i = 0; i < iterations; i++) {
    const response = await client.get(endpoint);
    const cloud = parseCloudInfo(response.headers);

    if (cloud.region) {
      regions.set(cloud.region, (regions.get(cloud.region) || 0) + 1);
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\nGeographic Distribution:');
  const sorted = Array.from(regions.entries()).sort((a, b) => b[1] - a[1]);

  for (const [region, count] of sorted) {
    const percentage = (count / iterations * 100).toFixed(1);
    console.log(`  ${region}: ${count} (${percentage}%)`);
  }

  return regions;
}

await analyzeGeography('/api/data', 20);
```

## Rate Limit Information

Parse rate limit headers from API responses.

### parseRateLimitInfo()

Extracts rate limit details from standard headers.

```typescript
import { parseRateLimitInfo } from 'recker';

const rateLimitInfo = parseRateLimitInfo(response.headers, response.status);

console.log(rateLimitInfo);
// {
//   limited: false,
//   limit: 5000,              // Total requests allowed
//   remaining: 4850,          // Requests remaining
//   reset: Date('YYYY-MM-DDTHH:MM:SSZ'), // Example reset moment
//   retryAfter: 300,          // Seconds to wait (if limited)
//   policy: '5000;w=3600'     // Rate limit policy
// }
```

### Supported Header Formats

| API Style | Headers |
|-----------|---------|
| **GitHub/Twitter** | `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset` |
| **Standard** | `ratelimit-limit`, `ratelimit-remaining`, `ratelimit-reset` |
| **IETF Draft** | `ratelimit-policy` |
| **HTTP** | `retry-after` (for 429/503 responses) |

### Examples

#### Monitor API Rate Limits

```typescript
async function checkRateLimit(client: Client) {
  const response = await client.get('/api/data');
  const rateLimit = parseRateLimitInfo(response.headers, response.status);

  if (rateLimit.limited) {
    console.warn('⚠️  Rate limit exceeded!');
    if (rateLimit.retryAfter) {
      console.warn(`   Retry after ${rateLimit.retryAfter} seconds`);
    }
    if (rateLimit.reset) {
      console.warn(`   Resets at ${rateLimit.reset.toLocaleString()}`);
    }
  } else if (rateLimit.remaining !== undefined) {
    console.log(`✓ ${rateLimit.remaining}/${rateLimit.limit} requests remaining`);

    if (rateLimit.remaining < 100) {
      console.warn(`⚠️  Running low on requests!`);
    }

    if (rateLimit.reset) {
      const minutesUntilReset = Math.ceil(
        (rateLimit.reset.getTime() - Date.now()) / 60000
      );
      console.log(`   Resets in ${minutesUntilReset} minutes`);
    }
  }

  return rateLimit;
}

const client = createClient({ baseUrl: 'https://api.github.com' });
await checkRateLimit(client);
```

#### Smart Rate Limit Handling

```typescript
async function smartFetch(client: Client, endpoint: string): Promise<any> {
  const response = await client.get(endpoint);
  const rateLimit = parseRateLimitInfo(response.headers, response.status);

  // Check if we're close to limit
  if (rateLimit.remaining !== undefined && rateLimit.limit !== undefined) {
    const usagePercent = (1 - rateLimit.remaining / rateLimit.limit) * 100;

    if (usagePercent > 90) {
      console.warn(`⚠️  Rate limit ${usagePercent.toFixed(1)}% used`);

      if (rateLimit.reset) {
        const waitMs = rateLimit.reset.getTime() - Date.now();
        if (waitMs > 0 && waitMs < 60000) {
          console.log(`   Waiting ${Math.ceil(waitMs / 1000)}s for reset...`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      }
    }
  }

  // Handle rate limit error
  if (rateLimit.limited) {
    const waitTime = rateLimit.retryAfter || 60;
    console.warn(`Rate limited! Waiting ${waitTime}s...`);
    await new Promise(resolve => setTimeout(resolve, waitTime * 1000));

    // Retry
    return smartFetch(client, endpoint);
  }

  return response.json();
}

const client = createClient({ baseUrl: 'https://api.example.com' });
const data = await smartFetch(client, '/api/data');
```

#### Rate Limit Dashboard

```typescript
class RateLimitMonitor {
  private limits = new Map<string, any>();

  async track(endpoint: string, response: Response) {
    const rateLimit = parseRateLimitInfo(response.headers, response.status);

    this.limits.set(endpoint, {
      ...rateLimit,
      timestamp: new Date()
    });

    return rateLimit;
  }

  getDashboard() {
    console.log('\n=== Rate Limit Dashboard ===\n');

    for (const [endpoint, limit] of this.limits.entries()) {
      console.log(`Endpoint: ${endpoint}`);

      if (limit.limit) {
        const used = limit.limit - (limit.remaining || 0);
        const percent = (used / limit.limit * 100).toFixed(1);
        console.log(`  Usage: ${used}/${limit.limit} (${percent}%)`);
      }

      if (limit.remaining !== undefined) {
        console.log(`  Remaining: ${limit.remaining}`);
      }

      if (limit.reset) {
        const minutesUntil = Math.ceil(
          (limit.reset.getTime() - Date.now()) / 60000
        );
        console.log(`  Resets in: ${minutesUntil} minutes`);
      }

      if (limit.limited) {
        console.log(`  Status: ⚠️  LIMITED`);
      } else {
        console.log(`  Status: ✓ OK`);
      }

      console.log();
    }
  }
}

// Usage
const monitor = new RateLimitMonitor();
const client = createClient({ baseUrl: 'https://api.github.com' });

const response = await client.get('/users/octocat');
await monitor.track('/users/:id', response);

monitor.getDashboard();
```

#### Auto-throttling Client

```typescript
class ThrottledClient {
  private client: Client;
  private rateLimitInfo?: RateLimitInfo;

  constructor(baseUrl: string) {
    this.client = createClient({ baseUrl });
  }

  async get(path: string) {
    // Check if we need to wait
    if (this.rateLimitInfo?.limited && this.rateLimitInfo.retryAfter) {
      console.log(`Waiting ${this.rateLimitInfo.retryAfter}s due to rate limit...`);
      await new Promise(resolve =>
        setTimeout(resolve, this.rateLimitInfo!.retryAfter! * 1000)
      );
    }

    // Make request
    const response = await this.client.get(path);

    // Update rate limit info
    this.rateLimitInfo = parseRateLimitInfo(response.headers, response.status);

    // Log status
    if (this.rateLimitInfo.remaining !== undefined) {
      console.log(`Requests remaining: ${this.rateLimitInfo.remaining}`);
    }

    return response;
  }
}

// Usage
const client = new ThrottledClient('https://api.github.com');

for (let i = 0; i < 100; i++) {
  const response = await client.get(`/repos/microsoft/vscode/commits?page=${i}`);
  const data = await response.json();
  console.log(`Page ${i}: ${data.length} commits`);
}
```

## Compression Information

Extract compression details from response headers.

### parseCompressionInfo()

Detects compression encoding and calculates compression ratios.

```typescript
import { parseCompressionInfo } from 'recker';

const compressionInfo = parseCompressionInfo(response.headers);

console.log(compressionInfo);
// {
//   encoding: 'br',              // Brotli compression
//   originalSize: 524288,        // 512 KB uncompressed
//   compressedSize: 65536,       // 64 KB compressed
//   ratio: 8.0                   // 8x compression ratio
// }
```

### Supported Encodings

- `gzip` - GZIP compression
- `br` - Brotli compression
- `deflate` - DEFLATE compression
- `compress` - UNIX compress
- `identity` - No compression

### Examples

#### Monitor Compression Effectiveness

```typescript
async function analyzeCompression(url: string) {
  const response = await fetch(url);
  const compression = parseCompressionInfo(response.headers);

  console.log('\nCompression Analysis:');
  console.log(`  Encoding: ${compression.encoding || 'none'}`);

  if (compression.compressedSize) {
    console.log(`  Compressed Size: ${(compression.compressedSize / 1024).toFixed(2)} KB`);
  }

  if (compression.originalSize) {
    console.log(`  Original Size: ${(compression.originalSize / 1024).toFixed(2)} KB`);
  }

  if (compression.ratio) {
    const savings = ((1 - 1 / compression.ratio) * 100).toFixed(1);
    console.log(`  Compression Ratio: ${compression.ratio.toFixed(2)}x`);
    console.log(`  Bandwidth Saved: ${savings}%`);
  }

  return compression;
}

await analyzeCompression('https://example.com/large-file.js');
```

#### Compare Compression Methods

```typescript
async function compareCompression(url: string) {
  const encodings = ['gzip', 'br', 'deflate', 'identity'];
  const results = [];

  for (const encoding of encodings) {
    const response = await fetch(url, {
      headers: {
        'Accept-Encoding': encoding === 'identity' ? '' : encoding
      }
    });

    const compression = parseCompressionInfo(response.headers);
    results.push({
      encoding: encoding,
      actual: compression.encoding,
      size: compression.compressedSize || 0,
      ratio: compression.ratio || 1
    });
  }

  console.log('\nCompression Comparison:');
  results.forEach(r => {
    console.log(`  ${r.encoding}: ${(r.size / 1024).toFixed(2)} KB (${r.ratio.toFixed(2)}x)`);
  });

  return results;
}

await compareCompression('https://example.com/app.js');
```

## Content Security Policy (CSP)

Parse and analyze Content Security Policy headers.

### parseCSPInfo()

Extracts CSP directives and policies.

```typescript
import { parseCSPInfo } from 'recker';

const cspInfo = parseCSPInfo(response.headers);

console.log(cspInfo);
// {
//   policy: "default-src 'self'; script-src 'self' cdn.example.com",
//   directives: {
//     'default-src': ["'self'"],
//     'script-src': ["'self'", 'cdn.example.com']
//   },
//   reportOnly: false
// }
```

### Common CSP Directives

| Directive | Purpose |
|-----------|---------|
| `default-src` | Fallback for other directives |
| `script-src` | Valid sources for JavaScript |
| `style-src` | Valid sources for stylesheets |
| `img-src` | Valid sources for images |
| `connect-src` | Valid targets for fetch, WebSocket |
| `font-src` | Valid sources for fonts |
| `frame-src` | Valid sources for frames |
| `media-src` | Valid sources for audio/video |
| `object-src` | Valid sources for plugins |
| `report-uri` | Where to send CSP violation reports |

### Examples

#### Check Script Sources

```typescript
async function checkScriptSources(url: string) {
  const response = await fetch(url);
  const csp = parseCSPInfo(response.headers);

  if (csp.directives['script-src']) {
    console.log('Allowed script sources:');
    csp.directives['script-src'].forEach(source => {
      console.log(`  - ${source}`);
    });

    // Check if inline scripts are allowed
    const allowsInline = csp.directives['script-src'].includes("'unsafe-inline'");
    console.log(`\nInline scripts: ${allowsInline ? '✓ Allowed' : '✗ Blocked'}`);

    // Check if eval is allowed
    const allowsEval = csp.directives['script-src'].includes("'unsafe-eval'");
    console.log(`Eval: ${allowsEval ? '✓ Allowed' : '✗ Blocked'}`);
  } else {
    console.log('No CSP script-src directive found');
  }

  return csp;
}

await checkScriptSources('https://example.com');
```

#### Validate CSP Configuration

```typescript
async function validateCSP(url: string) {
  const response = await fetch(url);
  const csp = parseCSPInfo(response.headers);

  const issues = [];

  // Check for report-only mode
  if (csp.reportOnly) {
    issues.push('⚠️  CSP is in report-only mode (not enforced)');
  }

  // Check for unsafe directives
  for (const [directive, values] of Object.entries(csp.directives)) {
    if (values.includes("'unsafe-inline'")) {
      issues.push(`⚠️  ${directive} allows unsafe-inline`);
    }
    if (values.includes("'unsafe-eval'")) {
      issues.push(`⚠️  ${directive} allows unsafe-eval`);
    }
  }

  // Check for wildcard sources
  for (const [directive, values] of Object.entries(csp.directives)) {
    if (values.includes('*')) {
      issues.push(`⚠️  ${directive} uses wildcard (*) - too permissive`);
    }
  }

  console.log('\nCSP Validation:');
  if (issues.length === 0) {
    console.log('✓ No issues found');
  } else {
    issues.forEach(issue => console.log(issue));
  }

  return { csp, issues };
}

await validateCSP('https://example.com');
```

## Content-Type Parsing

Parse Content-Type headers to extract media type, charset, and parameters.

### parseContentType()

Extracts detailed information from Content-Type header.

```typescript
import { parseContentType } from 'recker';

const contentType = parseContentType(response.headers);

console.log(contentType);
// {
//   mediaType: 'application/json',
//   charset: 'utf-8',
//   type: 'application',
//   subtype: 'json'
// }
```

### Examples

#### Detect Response Format

```typescript
async function detectFormat(url: string) {
  const response = await fetch(url);
  const contentType = parseContentType(response.headers);

  console.log(`Media Type: ${contentType.mediaType}`);
  console.log(`Type: ${contentType.type}`);
  console.log(`Subtype: ${contentType.subtype}`);

  if (contentType.charset) {
    console.log(`Charset: ${contentType.charset}`);
  }

  // Handle based on type
  switch (contentType.type) {
    case 'application':
      if (contentType.subtype === 'json') {
        return response.json();
      } else if (contentType.subtype === 'xml') {
        return response.text();
      }
      break;

    case 'text':
      return response.text();

    case 'image':
      return response.blob();

    default:
      return response.arrayBuffer();
  }
}

const data = await detectFormat('https://api.example.com/data');
```

#### Validate Charset

```typescript
async function validateCharset(url: string) {
  const response = await fetch(url);
  const contentType = parseContentType(response.headers);

  console.log('\nCharset Validation:');

  if (!contentType.charset) {
    console.log('⚠️  No charset specified');
    console.log('   Recommendation: Add charset=utf-8');
  } else if (contentType.charset.toLowerCase() !== 'utf-8') {
    console.log(`⚠️  Using ${contentType.charset} (not UTF-8)`);
    console.log('   Recommendation: Use UTF-8 for better compatibility');
  } else {
    console.log(`✓ Using UTF-8`);
  }

  return contentType;
}

await validateCharset('https://example.com/api/data');
```

## Accept Headers Parsing

Parse Accept-* headers to understand client capabilities.

### parseAcceptInfo()

Extracts accepted media types, encodings, and languages with quality values.

```typescript
import { parseAcceptInfo } from 'recker';

const acceptInfo = parseAcceptInfo(response.headers);

console.log(acceptInfo);
// {
//   types: [
//     { mediaType: 'application/json', q: 1.0, type: 'application', subtype: 'json' },
//     { mediaType: 'text/html', q: 0.9, type: 'text', subtype: 'html' }
//   ],
//   encodings: [
//     { encoding: 'br', q: 1.0 },
//     { encoding: 'gzip', q: 0.8 }
//   ],
//   languages: [
//     { language: 'en-US', q: 1.0 },
//     { language: 'en', q: 0.9 }
//   ]
// }
```

### Examples

#### Content Negotiation

```typescript
async function negotiateContent(request: Request) {
  const accept = parseAcceptInfo(request.headers);

  // Find best matching media type
  const preferredType = accept.types[0]; // Already sorted by quality

  console.log(`Client prefers: ${preferredType.mediaType} (q=${preferredType.q})`);

  // Choose response format
  if (preferredType.mediaType === 'application/json') {
    return Response.json(data);
  } else if (preferredType.type === 'text') {
    return new Response(formatAsText(data), {
      headers: { 'Content-Type': 'text/plain' }
    });
  } else {
    // Default to JSON
    return Response.json(data);
  }
}
```

#### Select Best Encoding

```typescript
function selectEncoding(accept: AcceptInfo): string {
  // Supported encodings (in priority order)
  const supported = ['br', 'gzip', 'deflate'];

  // Find best match based on client preferences
  for (const { encoding, q } of accept.encodings) {
    if (q > 0 && supported.includes(encoding)) {
      return encoding;
    }
  }

  return 'identity'; // No compression
}

const accept = parseAcceptInfo(request.headers);
const encoding = selectEncoding(accept);
console.log(`Using encoding: ${encoding}`);
```

#### Language Selection

```typescript
function selectLanguage(accept: AcceptInfo, available: string[]): string {
  for (const { language, q } of accept.languages) {
    if (q > 0) {
      // Check exact match
      if (available.includes(language)) {
        return language;
      }

      // Check language family (e.g., 'en-US' -> 'en')
      const family = language.split('-')[0];
      const match = available.find(lang => lang.startsWith(family));
      if (match) {
        return match;
      }
    }
  }

  // Return default
  return available[0] || 'en';
}

const accept = parseAcceptInfo(request.headers);
const availableLanguages = ['en', 'es', 'fr', 'de'];
const selectedLanguage = selectLanguage(accept, availableLanguages);

console.log(`Selected language: ${selectedLanguage}`);
```

## Parse All Headers

Use `parseHeaders()` to extract all information at once.

### parseHeaders()

```typescript
import { parseHeaders } from 'recker';

const client = createClient({ baseUrl: 'https://api.example.com' });
const response = await client.get('/data');

const info = parseHeaders(response.headers, response.status);

console.log('Full Header Analysis:');
console.log('  Cache:', info.cache);
console.log('  Cloud:', info.cloud);
console.log('  Rate Limit:', info.rateLimit);
console.log('  Compression:', info.compression);
console.log('  CSP:', info.csp);
console.log('  Content-Type:', info.contentType);
console.log('  Accept:', info.accept);
```

### Complete Request Analysis

```typescript
async function analyzeRequest(url: string) {
  const client = createClient({});
  const start = Date.now();
  const response = await client.get(url);
  const duration = Date.now() - start;

  const info = parseHeaders(response.headers, response.status);

  console.log('\n=== Request Analysis ===');
  console.log(`\nURL: ${url}`);
  console.log(`Status: ${response.status}`);
  console.log(`Duration: ${duration}ms`);

  console.log('\n--- Cache ---');
  console.log(`  Provider: ${info.cache.provider || 'unknown'}`);
  console.log(`  Status: ${info.cache.status || 'N/A'}`);
  console.log(`  Hit: ${info.cache.hit ? '✓' : '✗'}`);
  if (info.cache.age) {
    console.log(`  Age: ${info.cache.age}s`);
  }
  if (info.cache.maxAge) {
    console.log(`  Max Age: ${info.cache.maxAge}s`);
  }

  console.log('\n--- Cloud Provider ---');
  console.log(`  Provider: ${info.cloud.provider || 'unknown'}`);
  if (info.cloud.region) {
    console.log(`  Region: ${info.cloud.region}`);
  }
  if (info.cloud.ray) {
    console.log(`  Cloudflare Ray: ${info.cloud.ray}`);
  }
  if (info.cloud.requestId) {
    console.log(`  Request ID: ${info.cloud.requestId}`);
  }
  if (info.cloud.server) {
    console.log(`  Server: ${info.cloud.server}`);
  }

  console.log('\n--- Rate Limit ---');
  console.log(`  Limited: ${info.rateLimit.limited ? '⚠️  YES' : '✓ No'}`);
  if (info.rateLimit.limit) {
    console.log(`  Limit: ${info.rateLimit.limit}`);
  }
  if (info.rateLimit.remaining !== undefined) {
    console.log(`  Remaining: ${info.rateLimit.remaining}`);
  }
  if (info.rateLimit.reset) {
    console.log(`  Resets: ${info.rateLimit.reset.toLocaleString()}`);
  }
  if (info.rateLimit.retryAfter) {
    console.log(`  Retry After: ${info.rateLimit.retryAfter}s`);
  }

  console.log('\n--- Compression ---');
  console.log(`  Encoding: ${info.compression.encoding || 'none'}`);
  if (info.compression.ratio) {
    console.log(`  Ratio: ${info.compression.ratio.toFixed(2)}x`);
  }
  if (info.compression.compressedSize) {
    console.log(`  Size: ${(info.compression.compressedSize / 1024).toFixed(2)} KB`);
  }

  console.log('\n--- Content Security Policy ---');
  if (info.csp.policy) {
    console.log(`  Present: ✓ Yes`);
    console.log(`  Report Only: ${info.csp.reportOnly ? 'Yes' : 'No'}`);
    console.log(`  Directives: ${Object.keys(info.csp.directives).length}`);
  } else {
    console.log(`  Present: ✗ No CSP header`);
  }

  console.log('\n--- Content Type ---');
  if (info.contentType.mediaType) {
    console.log(`  Media Type: ${info.contentType.mediaType}`);
    console.log(`  Charset: ${info.contentType.charset || 'not specified'}`);
  }

  console.log('\n--- Accept Info ---');
  if (info.accept.types.length > 0) {
    console.log(`  Preferred Type: ${info.accept.types[0].mediaType}`);
  }
  if (info.accept.encodings.length > 0) {
    console.log(`  Preferred Encoding: ${info.accept.encodings[0].encoding}`);
  }
  if (info.accept.languages.length > 0) {
    console.log(`  Preferred Language: ${info.accept.languages[0].language}`);
  }

  return info;
}

await analyzeRequest('https://api.github.com/users/octocat');
```

### Batch Analysis

```typescript
async function analyzeBatch(urls: string[]) {
  const results = [];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      const info = parseHeaders(response.headers, response.status);

      results.push({
        url,
        status: response.status,
        cache: info.cache,
        cloud: info.cloud,
        rateLimit: info.rateLimit
      });
    } catch (error) {
      console.error(`Failed to analyze ${url}`);
    }
  }

  // Aggregate statistics
  const stats = {
    total: results.length,
    cacheHits: results.filter(r => r.cache.hit).length,
    providers: new Set(results.map(r => r.cloud.provider).filter(Boolean)),
    limited: results.filter(r => r.rateLimit.limited).length
  };

  console.log('\n=== Batch Analysis ===');
  console.log(`Total Requests: ${stats.total}`);
  console.log(`Cache Hits: ${stats.cacheHits} (${(stats.cacheHits/stats.total*100).toFixed(1)}%)`);
  console.log(`Providers: ${Array.from(stats.providers).join(', ')}`);
  console.log(`Rate Limited: ${stats.limited}`);

  return results;
}

const urls = [
  'https://api.github.com/users/octocat',
  'https://api.github.com/repos/microsoft/vscode',
  'https://api.github.com/repos/nodejs/node'
];

await analyzeBatch(urls);
```

## TypeScript Types

### CacheInfo

```typescript
interface CacheInfo {
  hit: boolean;
  status?: 'HIT' | 'MISS' | 'EXPIRED' | 'STALE' | 'BYPASS' | 'REVALIDATED';
  age?: number;       // Cache age in seconds
  maxAge?: number;    // Max age from Cache-Control
  provider?: 'cloudflare' | 'fastly' | 'akamai' | 'cloudfront' | 'nginx' | 'varnish' | 'unknown';
}
```

### CloudInfo

```typescript
interface CloudInfo {
  provider?: 'cloudflare' | 'aws' | 'gcp' | 'azure' | 'fastly' | 'akamai' | 'vercel' | 'netlify' | 'unknown';
  region?: string;
  server?: string;
  ray?: string;           // Cloudflare Ray ID
  requestId?: string;     // Provider request ID
}
```

### RateLimitInfo

```typescript
interface RateLimitInfo {
  limited: boolean;
  limit?: number;         // Total limit
  remaining?: number;     // Requests remaining
  reset?: Date;           // When limit resets
  retryAfter?: number;    // Seconds to wait before retry
  policy?: string;        // Rate limit policy
}
```

### CompressionInfo

```typescript
interface CompressionInfo {
  encoding?: 'gzip' | 'br' | 'deflate' | 'compress' | 'identity' | string;
  originalSize?: number;
  compressedSize?: number;
  ratio?: number;      // Compression ratio (originalSize / compressedSize)
}
```

### CSPInfo

```typescript
interface CSPInfo {
  policy?: string;                          // Full CSP policy string
  directives: Record<string, string[]>;     // Parsed directives
  reportOnly: boolean;                      // Is CSP in report-only mode?
}
```

### ContentTypeInfo

```typescript
interface ContentTypeInfo {
  mediaType?: string;    // Full media type (e.g., 'application/json')
  charset?: string;      // Charset parameter
  boundary?: string;     // Boundary parameter (multipart)
  type?: string;         // Type part (e.g., 'application')
  subtype?: string;      // Subtype part (e.g., 'json')
}
```

### AcceptInfo

```typescript
interface AcceptInfo {
  types: Array<{
    mediaType: string;
    q: number;           // Quality value (0-1)
    type?: string;
    subtype?: string;
  }>;
  encodings: Array<{
    encoding: string;
    q: number;
  }>;
  languages: Array<{
    language: string;
    q: number;
  }>;
}
```

### HeaderInfo

```typescript
interface HeaderInfo {
  cache: CacheInfo;
  cloud: CloudInfo;
  rateLimit: RateLimitInfo;
  compression: CompressionInfo;
  csp: CSPInfo;
  contentType: ContentTypeInfo;
  accept: AcceptInfo;
}
```

## Best Practices

### 1. Cache Monitoring

```typescript
// Always check cache status for CDN-served content
const response = await client.get('/static/large-file.js');
const cache = parseCacheInfo(response.headers);

if (!cache.hit && cache.provider) {
  console.warn(`Cache miss on ${cache.provider} - origin hit`);
}
```

### 2. Rate Limit Prevention

```typescript
// Check remaining requests before batch operations
const response = await client.get('/api/test');
const rateLimit = parseRateLimitInfo(response.headers, response.status);

if (rateLimit.remaining !== undefined && rateLimit.remaining < 100) {
  console.warn('Low on API requests, consider waiting');
  if (rateLimit.reset) {
    const waitMs = rateLimit.reset.getTime() - Date.now();
    console.log(`Wait ${Math.ceil(waitMs / 60000)} minutes`);
  }
}
```

### 3. Provider-Specific Handling

```typescript
// Handle provider-specific features
const cloud = parseCloudInfo(response.headers);

switch (cloud.provider) {
  case 'cloudflare':
    // Use ray ID for debugging
    console.log(`Debug with ray ID: ${cloud.ray}`);
    break;

  case 'aws':
    // Use request ID for AWS support
    console.log(`AWS Request ID: ${cloud.requestId}`);
    break;

  case 'vercel':
    // Vercel-specific handling
    console.log(`Vercel deployment: ${cloud.requestId}`);
    break;
}
```

### 4. Logging & Debugging

```typescript
// Include parsed headers in logs
const response = await client.get('/api/data');
const info = parseHeaders(response.headers, response.status);

logger.info('API request completed', {
  url: '/api/data',
  status: response.status,
  cache: info.cache.hit ? 'HIT' : 'MISS',
  provider: info.cloud.provider,
  rateLimit: {
    remaining: info.rateLimit.remaining,
    limit: info.rateLimit.limit
  }
});
```

## API Reference

### Functions

```typescript
// Parse all headers at once
function parseHeaders(headers: Headers, status: number): HeaderInfo;

// Parse cache information
function parseCacheInfo(headers: Headers): CacheInfo;

// Parse cloud provider information
function parseCloudInfo(headers: Headers): CloudInfo;

// Parse rate limit information
function parseRateLimitInfo(headers: Headers, status: number): RateLimitInfo;

// Parse compression information
function parseCompressionInfo(headers: Headers): CompressionInfo;

// Parse Content Security Policy
function parseCSPInfo(headers: Headers): CSPInfo;

// Parse Content-Type header
function parseContentType(headers: Headers): ContentTypeInfo;

// Parse Accept-* headers
function parseAcceptInfo(headers: Headers): AcceptInfo;
```

## See Also

- [Observability](observability.md) - Metrics and monitoring
- [Client Configuration](client-config.md) - Client setup
- [Error Handling](error-handling.md) - Error handling strategies
- [Batch Requests](batch-requests.md) - Managing rate limits in batch operations

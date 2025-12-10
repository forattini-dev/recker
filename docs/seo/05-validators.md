# SEO Validators

Recker includes specialized validators for key SEO files: `robots.txt`, `sitemap.xml`, and `llms.txt`.

## robots.txt

### Parsing

```typescript
import { parseRobotsTxt } from 'recker/seo';

const content = `
User-agent: *
Allow: /
Disallow: /private/

User-agent: Googlebot
Crawl-delay: 1

Sitemap: https://example.com/sitemap.xml
`;

const result = parseRobotsTxt(content);

console.log(result.userAgentBlocks);  // User-agent rules
console.log(result.sitemaps);          // ['https://example.com/sitemap.xml']
console.log(result.blocksAllRobots);   // false
console.log(result.blocksImportantPaths); // false
```

### Validation

```typescript
import { validateRobotsTxt } from 'recker/seo';

const validation = validateRobotsTxt(content, 'https://example.com');

if (!validation.valid) {
  for (const issue of validation.issues) {
    console.log(`[${issue.type}] ${issue.message}`);
    if (issue.recommendation) {
      console.log(`  → ${issue.recommendation}`);
    }
  }
}
```

### Checking Path Access

```typescript
import { parseRobotsTxt, isPathAllowed } from 'recker/seo';

const parsed = parseRobotsTxt(content);

// Check if a path is allowed for a specific user-agent
console.log(isPathAllowed(parsed, '/blog', 'Googlebot'));     // true
console.log(isPathAllowed(parsed, '/private/data', '*'));     // false
console.log(isPathAllowed(parsed, '/api', 'GPTBot'));         // true (default)
```

### Fetching and Validating

```typescript
import { fetchAndValidateRobotsTxt } from 'recker/seo';

const result = await fetchAndValidateRobotsTxt('https://example.com');

if (result.exists) {
  console.log(`robots.txt found (HTTP ${result.status})`);
  console.log(`Valid: ${result.valid}`);
  console.log(`Issues: ${result.issues.length}`);
  console.log(`Sitemaps: ${result.parseResult.sitemaps.join(', ')}`);
} else {
  console.log('robots.txt not found - consider creating one');
}
```

### Validation Issues

| Code | Type | Description |
|------|------|-------------|
| `PARSE_ERROR` | error | Syntax error in robots.txt |
| `BLOCKS_ALL_ROBOTS` | error | `Disallow: /` for all robots |
| `EXCESSIVE_CRAWL_DELAY` | error | Crawl-delay > 30 seconds |
| `NO_SITEMAP` | warning | No Sitemap directive |
| `BLOCKS_RESOURCES` | warning | Blocking CSS/JS/images |
| `FILE_TOO_LARGE` | warning | File > 500KB |
| `NO_USER_AGENT` | warning | No User-agent directive |
| `SITEMAP_CROSS_DOMAIN` | warning | Sitemap on different domain |

## sitemap.xml

### Parsing

```typescript
import { parseSitemap } from 'recker/seo';

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2024-01-15</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://example.com/about</loc>
    <lastmod>2024-01-10</lastmod>
    <priority>0.8</priority>
  </url>
</urlset>`;

const result = parseSitemap(xml);

console.log(result.type);      // 'urlset' or 'sitemapindex'
console.log(result.urls);      // Array of URLs with metadata
console.log(result.urlCount);  // 2
console.log(result.valid);     // true
```

### Sitemap Index

```typescript
const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://example.com/sitemap-posts.xml</loc>
    <lastmod>2024-01-15</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://example.com/sitemap-pages.xml</loc>
  </sitemap>
</sitemapindex>`;

const result = parseSitemap(indexXml);
console.log(result.type);      // 'sitemapindex'
console.log(result.sitemaps);  // Array of child sitemap URLs
```

### Validation

```typescript
import { validateSitemap } from 'recker/seo';

const validation = validateSitemap(xml, 'https://example.com');

if (!validation.valid) {
  for (const issue of validation.issues) {
    console.log(`[${issue.type}] ${issue.message}`);
    if (issue.url) {
      console.log(`  URL: ${issue.url}`);
    }
  }
}
```

### Discovering Sitemaps

```typescript
import { discoverSitemaps } from 'recker/seo';

// Discover from common locations and robots.txt
const sitemaps = await discoverSitemaps('https://example.com', robotsTxtContent);

console.log('Found sitemaps:', sitemaps);
// [
//   'https://example.com/sitemap.xml',
//   'https://example.com/sitemap_index.xml',
//   'https://example.com/post-sitemap.xml'
// ]
```

### Fetching and Validating

```typescript
import { fetchAndValidateSitemap } from 'recker/seo';

const result = await fetchAndValidateSitemap('https://example.com/sitemap.xml');

if (result.exists) {
  console.log(`Found ${result.parseResult.urlCount} URLs`);
  console.log(`Type: ${result.parseResult.type}`);
  console.log(`Valid: ${result.valid}`);
} else {
  console.log('Sitemap not found');
}
```

### Validation Issues

| Code | Type | Description |
|------|------|-------------|
| `PARSE_ERROR` | error | XML parsing error |
| `TOO_MANY_URLS` | error | > 50,000 URLs in single sitemap |
| `FILE_TOO_LARGE` | error | File > 50MB |
| `EMPTY_SITEMAP` | warning | No URLs in sitemap |
| `EMPTY_INDEX` | warning | No sitemaps in index |
| `DUPLICATE_URLS` | warning | Duplicate URL entries |
| `CROSS_DOMAIN_URL` | warning | URL from different domain |
| `OLD_LASTMOD` | info | Many URLs with old dates |
| `NO_LASTMOD` | info | No lastmod dates provided |
| `UNIFORM_PRIORITY` | info | All URLs have same priority |

### URL Structure

```typescript
interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;

  // Extensions
  images?: Array<{
    loc: string;
    caption?: string;
    title?: string;
  }>;

  alternates?: Array<{
    hreflang: string;
    href: string;
  }>;
}
```

## llms.txt

### Parsing

```typescript
import { parseLlmsTxt } from 'recker/seo';

const content = `# My Site

> A comprehensive resource for web developers

## Documentation
- [Getting Started](/docs/start): Quick start guide
- [API Reference](/docs/api): Complete API docs

## Resources
- [Blog](/blog)
- [GitHub](https://github.com/org/repo)
`;

const result = parseLlmsTxt(content);

console.log(result.siteName);        // 'My Site'
console.log(result.siteDescription); // 'A comprehensive resource...'
console.log(result.sections);        // Array of sections
console.log(result.links);           // All extracted links
console.log(result.hasFullVersion);  // false (no llms-full.txt reference)
```

### Validation

```typescript
import { validateLlmsTxt } from 'recker/seo';

const validation = validateLlmsTxt(content, 'https://example.com');

for (const issue of validation.issues) {
  console.log(`[${issue.type}] ${issue.code}: ${issue.message}`);
}
```

### Fetching and Validating

```typescript
import { fetchAndValidateLlmsTxt } from 'recker/seo';

const result = await fetchAndValidateLlmsTxt('https://example.com');

if (result.exists) {
  console.log(`Site: ${result.parseResult.siteName}`);
  console.log(`Description: ${result.parseResult.siteDescription}`);
  console.log(`Sections: ${result.parseResult.sections.length}`);
  console.log(`Links: ${result.parseResult.links.length}`);

  if (result.fullVersionExists) {
    console.log('llms-full.txt is also available');
  }
} else {
  console.log('No llms.txt found - consider creating one for AI discoverability');
}
```

### Generating Template

```typescript
import { generateLlmsTxtTemplate } from 'recker/seo';

const template = generateLlmsTxtTemplate({
  siteName: 'Recker Documentation',
  siteDescription: 'A comprehensive Network SDK for Node.js with HTTP, DNS, and AI support',
  sections: [
    {
      title: 'Getting Started',
      links: [
        { text: 'Installation', url: '/docs/install', description: 'How to install Recker' },
        { text: 'Quick Start', url: '/docs/quickstart', description: '5-minute tutorial' },
      ]
    },
    {
      title: 'Features',
      links: [
        { text: 'HTTP Client', url: '/docs/http' },
        { text: 'SEO Analysis', url: '/docs/seo' },
        { text: 'AI Providers', url: '/docs/ai' },
      ]
    }
  ]
});

// Save to file
await fs.writeFile('public/llms.txt', template);
```

### Validation Issues

| Code | Type | Description |
|------|------|-------------|
| `PARSE_ERROR` | error | Missing required elements |
| `INVALID_URL` | error | Invalid link URL |
| `FILE_TOO_LARGE` | warning | File > 100KB |
| `RELATIVE_URL` | warning | Non-absolute URL |
| `SHORT_DESCRIPTION` | info | Description < 50 chars |
| `LONG_DESCRIPTION` | info | Description > 500 chars |
| `NO_SECTIONS` | info | No ## sections found |
| `CONSIDER_FULL_VERSION` | info | Large file without llms-full.txt |
| `DUPLICATE_LINK` | info | Same URL appears multiple times |

## CLI Usage

```bash
# Validate robots.txt
rek seo https://example.com/robots.txt

# Validate sitemap
rek seo https://example.com/sitemap.xml

# Validate llms.txt
rek seo https://example.com/llms.txt

# Full site analysis (includes all validators)
rek seo https://example.com
```

## Custom Fetcher

All fetch functions accept a custom fetcher for testing or special requirements:

```typescript
import { fetchAndValidateRobotsTxt } from 'recker/seo';

// Custom fetcher with authentication
const customFetcher = async (url: string) => {
  const response = await fetch(url, {
    headers: { 'Authorization': 'Bearer token' }
  });
  return {
    status: response.status,
    text: await response.text()
  };
};

const result = await fetchAndValidateRobotsTxt('https://example.com', customFetcher);
```

## Next Steps

- **[Categories](06-categories.md)** - All 22 rule categories explained
- **[CI/CD](07-cicd.md)** - Automate validation in pipelines
- **[AI Search](04-ai-search.md)** - Optimize for AI crawlers

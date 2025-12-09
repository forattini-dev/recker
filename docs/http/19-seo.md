# SEO Analyzer

Comprehensive SEO analysis for web pages using a rules-based engine with **250+ checks across 21 categories**.

## Features

- **250+ SEO Rules** - The most comprehensive SEO checker available
- **21 Categories** - Meta, Content, Links, Images, Technical, Security, Performance, Mobile, Accessibility, Schema, Structural, i18n, PWA, Social, E-commerce, Local SEO, Core Web Vitals, Readability, Crawlability, Internal Linking, Best Practices
- **Site-Wide Analysis** - SEO Spider crawls entire sites detecting duplicates and orphan pages
- **Request Timing** - Full timing waterfall (DNS, TCP, TLS, TTFB, Download)
- **Detailed Evidence** - Each issue includes found value, expected value, impact, and code examples
- **Score & Grade** - Weighted SEO score (0-100) and letter grade (A-F)
- **CLI & Shell** - Analyze pages directly from terminal
- **JSON Output** - Machine-readable output for CI/CD pipelines
- **Customizable** - Enable/disable rules, filter by category, adjust thresholds

## Quick Start

### Programmatic Usage

```typescript
import { analyzeSeo } from 'recker/seo';

const html = await fetch('https://example.com').then(r => r.text());
const report = await analyzeSeo(html, { baseUrl: 'https://example.com' });

console.log(`Score: ${report.score}/100 (${report.grade})`);

// Show issues
for (const check of report.checks.filter(c => c.status !== 'pass')) {
  console.log(`[${check.status}] ${check.name}: ${check.message}`);
  if (check.recommendation) {
    console.log(`  → ${check.recommendation}`);
  }
}
```

### CLI Usage

```bash
# Basic analysis
rek seo https://example.com

# JSON output for CI/CD
rek seo https://example.com --format json

# Verbose output with all checks
rek seo https://example.com -v

# Save to file
rek seo https://example.com --format json -o report.json
```

### Interactive Shell

```bash
# Start shell
rek shell

# Run SEO analysis
seo https://example.com

# JSON output
seo https://example.com --format json
```

## Output Format

### Terminal Output (Default)

```
╭──────────────────────────────────────────────────────────────╮
│                      SEO Analysis                            │
│  https://example.com                                         │
├──────────────────────────────────────────────────────────────┤
│  Score: 85/100  Grade: B                                     │
│  Checks: 180 pass │ 15 warn │ 3 fail │ 12 info              │
├──────────────────────────────────────────────────────────────┤
│  Timing: DNS 12ms → TCP 8ms → TLS 25ms → TTFB 85ms → Total 175ms
├──────────────────────────────────────────────────────────────┤
│  OpenGraph:                                                  │
│    Title: Example Site - Your Tagline                        │
│    Image: https://example.com/og-image.jpg                   │
├──────────────────────────────────────────────────────────────┤
│  ✗ Title Tag                                                 │
│    Missing title tag                                         │
│    → Add a unique, descriptive title tag between 50-60 chars │
│                                                              │
│  ⚠ Meta Description                                          │
│    Description too short (45 chars, min: 50)                 │
│    → Expand to 120-155 characters                            │
╰──────────────────────────────────────────────────────────────╯
```

### JSON Output

```json
{
  "url": "https://example.com",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "score": 85,
  "grade": "B",
  "timing": {
    "dns": 12,
    "tcp": 8,
    "tls": 25,
    "ttfb": 85,
    "download": 45,
    "total": 175
  },
  "openGraph": {
    "title": "Example Site - Your Tagline",
    "description": "A great description",
    "image": "https://example.com/og-image.jpg",
    "url": "https://example.com"
  },
  "checks": [
    {
      "name": "Title Tag",
      "status": "fail",
      "message": "Missing title tag",
      "recommendation": "Add a unique, descriptive title tag between 50-60 characters",
      "evidence": {
        "expected": "<title>Your Page Title - Brand Name</title>",
        "found": "No <title> tag found in <head>",
        "impact": "Search engines cannot display your page title in results",
        "example": "<head>\n  <title>Product Name - Buy Online | Store</title>\n</head>"
      }
    }
  ]
}
```

## Rule Categories (21)

### 1. Meta Tags (`meta`)
Title, description, keywords, author, robots directives.

### 2. Content (`content`)
H1, headings hierarchy, word count, paragraph structure, lists.

### 3. Links (`links`)
Anchor text quality, noopener/noreferrer, broken links, sponsored/ugc.

### 4. Images (`images`)
Alt text, dimensions, lazy loading, modern formats, async decoding.

### 5. Technical (`technical`)
Canonical, charset, viewport, lang, favicon, URL structure.

### 6. Security (`security`)
HTTPS, CSP, HSTS, X-Frame-Options, mixed content, COOP/COEP/CORP.

### 7. Performance (`performance`)
Render-blocking resources, preconnect, dns-prefetch, preload, async/defer.

### 8. Mobile (`mobile`)
Viewport configuration, touch targets, responsive images.

### 9. Accessibility (`accessibility`)
ARIA attributes, button labels, form labels, heading order, skip links.

### 10. Schema/Structured Data (`schema`)
JSON-LD presence and validity, breadcrumbs, rich snippets.

### 11. Structural (`structural`)
Semantic HTML elements: header, main, nav, footer, article, section.

### 12. i18n - Internationalization (`i18n`)
Hreflang tags, language codes, x-default, Content-Language header.

### 13. PWA - Progressive Web App (`pwa`)
Web manifest, theme color, apple-touch-icon, maskable icons, service worker.

### 14. Social Media (`social`)
OpenGraph completeness, Twitter Card optimization, image dimensions.

### 15. E-commerce (`ecommerce`)
Product schema, price, availability, reviews, offers structured data.

### 16. Local SEO (`local`)
LocalBusiness schema, NAP consistency, opening hours, geo coordinates.

### 17. Core Web Vitals (`cwv`)
LCP hints, CLS prevention, FID optimization suggestions.

### 18. Readability (`readability`)
Flesch reading ease, sentence length, paragraph complexity.

### 19. Crawlability (`crawl`)
Robots.txt, sitemap.xml, crawl budget optimization, pagination.

### 20. Internal Linking (`internal-linking`)
Link ratio, anchor diversity, orphan pages, click depth, contextual links.

### 21. Best Practices (`best-practices`)
DOCTYPE, charset position, HTTP status codes, crawlable links.

## Site-Wide Analysis with SEO Spider

Crawl entire websites and detect site-wide SEO issues:

```typescript
import { SeoSpider, seoSpider } from 'recker/seo';

// Quick function
const result = await seoSpider('https://example.com', {
  seo: true,           // Enable SEO analysis per page
  maxPages: 50,        // Limit pages to crawl
  maxDepth: 4,         // Maximum link depth
  concurrency: 5,      // Parallel requests
  output: 'report.json' // Save to file
});

console.log(`Crawled ${result.summary.totalPages} pages`);
console.log(`Average Score: ${result.summary.avgScore}`);
console.log(`Duplicate Titles: ${result.summary.duplicateTitles}`);
console.log(`Orphan Pages: ${result.summary.orphanPages}`);

// Site-wide issues
for (const issue of result.siteWideIssues) {
  console.log(`[${issue.severity}] ${issue.type}: ${issue.message}`);
  console.log(`  Affected: ${issue.affectedUrls.length} pages`);
}
```

### Site-Wide Issues Detected

| Issue Type | Description |
|------------|-------------|
| `duplicate-title` | Multiple pages share the same title |
| `duplicate-description` | Multiple pages share the same meta description |
| `duplicate-h1` | Multiple pages share the same H1 heading |
| `orphan-page` | Pages with no internal links pointing to them |
| `missing-canonical` | Pages without canonical URL declaration |

### Interactive Shell

```bash
# Crawl with SEO analysis
spider https://example.com seo=true depth=3 limit=20

# Output
✔ Crawl complete (12.5s)
  Pages: 20
  Errors: 2
  Avg Score: 78/100

Site-Wide Issues:
  ✗ 3 pages share duplicate title "Welcome"
  ⚠ 2 orphan pages detected
```

## Request Timing Metrics

The SEO analyzer captures detailed timing metrics from each request:

```
Timing: DNS 12ms → TCP 8ms → TLS 25ms → TTFB 85ms → Download 45ms → Total 175ms
```

| Metric | Description |
|--------|-------------|
| **DNS** | DNS lookup time |
| **TCP** | TCP connection establishment |
| **TLS** | TLS/SSL handshake time |
| **TTFB** | Time to First Byte (server response time) |
| **Download** | Content download time |
| **Total** | Total request duration |

These metrics help identify performance bottlenecks:
- High DNS → Consider DNS prefetch
- High TLS → Check certificate chain
- High TTFB → Server-side optimization needed
- High Download → Compress content, reduce page size

## API Reference

### `analyzeSeo(html, options)`

Analyze HTML for SEO issues.

```typescript
import { analyzeSeo } from 'recker/seo';

const report = await analyzeSeo(html, {
  baseUrl: 'https://example.com',  // Required for link analysis
  responseHeaders: headers,         // Optional: HTTP response headers
  rules: {
    categories: ['meta', 'content', 'security'], // Only run specific categories
    disabled: ['title-no-caps'],     // Disable specific rules
  }
});
```

### `SeoSpider` Class

For site-wide analysis:

```typescript
import { SeoSpider } from 'recker/seo';

const spider = new SeoSpider({
  seo: true,
  maxPages: 100,
  maxDepth: 4,
  concurrency: 5,
  delay: 100,
  output: 'seo-report.json',
  onSeoAnalysis: (result) => {
    console.log(`Analyzed ${result.url}: ${result.seoReport?.score}/100`);
  }
});

const result = await spider.crawl('https://example.com');
```

### `createRulesEngine(options)`

Create a custom rules engine:

```typescript
import { createRulesEngine, ALL_SEO_RULES } from 'recker/seo';

const engine = createRulesEngine({
  categories: ['meta', 'security', 'performance'],
  excludeCategories: ['pwa'],
  excludeRules: ['og-image-url-quality'],
  minSeverity: 'warning'  // Only 'warning' and 'error' rules
});

// Get enabled rules
const rules = engine.getRules();
console.log(`${rules.length} rules enabled`);

// Get categories
const categories = engine.getCategories();
```

### Report Structure

```typescript
interface SeoReport {
  url: string;
  timestamp: Date;
  score: number;           // 0-100
  grade: string;           // A, B, C, D, F

  // Request timing
  timing?: {
    dns?: number;
    tcp?: number;
    tls?: number;
    ttfb?: number;
    download?: number;
    total?: number;
  };

  // Social meta
  openGraph?: {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    type?: string;
  };
  twitterCard?: {
    card?: string;
    title?: string;
    description?: string;
    image?: string;
  };

  // Checks
  checks: SeoCheckResult[];

  // Detailed analysis
  title?: { text: string; length: number };
  metaDescription?: { text: string; length: number };
  headings: HeadingAnalysis;
  content: ContentMetrics;
  links: LinkAnalysis;
  images: ImageAnalysis;
  social: SocialMetaAnalysis;
  technical: TechnicalSeo;
  jsonLd: { count: number; types: string[] };
}
```

## Configuration

### Thresholds

```typescript
import { SEO_THRESHOLDS } from 'recker/seo';

console.log(SEO_THRESHOLDS.title);
// { min: 30, ideal: { min: 50, max: 60 }, max: 70 }

console.log(SEO_THRESHOLDS.metaDescription);
// { min: 50, ideal: { min: 120, max: 155 }, max: 160 }
```

### Scoring Weights

Categories have different weights in the final score:

```typescript
import { SCORING_WEIGHTS } from 'recker/seo';

// Category importance multipliers
// performance: 1.4 (most important)
// title: 1.5
// technical: 1.3
// meta: 1.3
// content: 1.2
// mobile: 1.2
// headings: 1.2
// links: 1.1
// security: 0.9
// accessibility: 0.8
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: SEO Check
on: [push, pull_request]

jobs:
  seo:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm build

      - name: Run SEO Analysis
        run: |
          npx rek seo https://staging.example.com --format json > seo-report.json
          SCORE=$(jq '.score' seo-report.json)
          echo "SEO Score: $SCORE"
          if [ "$SCORE" -lt 70 ]; then
            echo "::error::SEO score too low: $SCORE (minimum: 70)"
            jq '.checks[] | select(.status == "fail")' seo-report.json
            exit 1
          fi

      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: seo-report
          path: seo-report.json
```

### Site-Wide CI Check

```yaml
- name: Run Site-Wide SEO Audit
  run: |
    npx rek shell <<EOF
    spider https://staging.example.com seo=true depth=2 limit=30
    EOF
```

## Best Practices

### 1. Run Before Deploy

```bash
rek seo https://staging.example.com --format json > report.json

if [ $(jq '.score' report.json) -lt 80 ]; then
  echo "SEO score below threshold"
  exit 1
fi
```

### 2. Track Score Over Time

```typescript
import { analyzeSeo } from 'recker/seo';

async function auditSite(urls: string[]) {
  const results = await Promise.all(
    urls.map(async (url) => {
      const html = await fetch(url).then(r => r.text());
      const report = await analyzeSeo(html, { baseUrl: url });
      return {
        url,
        score: report.score,
        grade: report.grade,
        timing: report.timing,
        issues: report.checks.filter(c => c.status === 'fail').length,
        warnings: report.checks.filter(c => c.status === 'warn').length,
      };
    })
  );
  return results;
}
```

### 3. Focus on Critical Issues First

```typescript
const report = await analyzeSeo(html);

// Priority: errors → warnings → info
const critical = report.checks.filter(c => c.status === 'fail');
const warnings = report.checks.filter(c => c.status === 'warn');

console.log(`Critical: ${critical.length}, Warnings: ${warnings.length}`);

for (const issue of critical) {
  console.log(`[CRITICAL] ${issue.name}: ${issue.message}`);
  if (issue.evidence?.example) {
    console.log(`  Fix: ${issue.evidence.example}`);
  }
}
```

### 4. Filter by Category

```typescript
const report = await analyzeSeo(html, {
  rules: {
    categories: ['security', 'performance']  // Only security and performance
  }
});
```

## Next Steps

- **[Web Scraping](14-scraping.md)** - Extract data from pages
- **[Concurrency](08-concurrency.md)** - Batch SEO analysis
- **[CLI Overview](../cli/01-overview.md)** - CLI commands

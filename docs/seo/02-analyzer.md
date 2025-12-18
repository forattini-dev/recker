# SEO Analyzer

The core SEO analyzer evaluates web pages against **400+ rules** across **19 categories**, providing detailed reports with scores, grades, and actionable recommendations.

## Basic Usage

```typescript
import { analyzeSeo } from 'recker/seo';

const html = await fetch('https://example.com').then(r => r.text());
const report = await analyzeSeo(html, { baseUrl: 'https://example.com' });

console.log(`Score: ${report.score}/100 (${report.grade})`);
console.log(`Passed: ${report.summary.passed}/${report.summary.totalChecks}`);
```

## Options

```typescript
interface SeoAnalyzerOptions {
  /** Base URL for resolving relative links */
  baseUrl?: string;

  /** Include content metrics analysis */
  analyzeContent?: boolean;

  /** Check for broken links (slower) */
  checkBrokenLinks?: boolean;

  /** HTTP response headers for security checks */
  responseHeaders?: Record<string, string | string[]>;

  /** Rules engine configuration */
  rules?: {
    /** Filter by categories */
    categories?: string[];
    /** Filter by severity */
    severity?: ('error' | 'warning' | 'info')[];
    /** Disable specific rules by ID */
    disabled?: string[];
  };
}
```

### Filter by Categories

```typescript
// Only check meta and content rules
const report = await analyzeSeo(html, {
  baseUrl: 'https://example.com',
  rules: {
    categories: ['meta', 'content', 'links']
  }
});
```

### Filter by Severity

```typescript
// Only show errors and warnings (skip info)
const report = await analyzeSeo(html, {
  baseUrl: 'https://example.com',
  rules: {
    severity: ['error', 'warning']
  }
});
```

### Include Response Headers

Pass HTTP headers to enable security header checks:

```typescript
import { createClient } from 'recker';

const client = createClient();
const response = await client.get('https://example.com');
const html = await response.text();

// Extract headers for security analysis
const headers: Record<string, string> = {};
response.headers.forEach((value, key) => {
  headers[key] = value;
});

const report = await analyzeSeo(html, {
  baseUrl: 'https://example.com',
  responseHeaders: headers
});
```

## Report Structure

```typescript
interface SeoReport {
  url: string;
  timestamp: Date;
  grade: string;        // A, B, C, D, or F
  score: number;        // 0-100

  // High-level summary
  summary: {
    totalChecks: number;
    passed: number;
    warnings: number;
    errors: number;
    infos: number;
    passRate: number;   // 0-100%

    issuesByCategory: Record<string, {
      passed: number;
      warnings: number;
      errors: number;
    }>;

    topIssues: Array<{
      name: string;
      message: string;
      category: string;
      severity: 'error' | 'warning';
    }>;

    quickWins: string[];

    vitals: {
      htmlSize?: number;
      domElements?: number;
      wordCount: number;
      readingTime: number;
      imageCount: number;
      linkCount: number;
    };

    completeness: {
      meta: number;
      social: number;
      technical: number;
      content: number;
      images: number;
      links: number;
    };
  };

  // Individual check results
  checks: SeoCheckResult[];

  // Extracted metadata
  title?: { text: string; length: number };
  metaDescription?: { text: string; length: number };
  openGraph?: OpenGraphData;
  twitterCard?: TwitterCardData;
  structuredData: {
    count: number;
    types: string[];
    items: Record<string, unknown>[];
  };

  // Detailed analysis
  headings: HeadingAnalysis;
  content: ContentMetrics;
  links: LinkAnalysis;
  images: ImageAnalysis;
  social: SocialMetaAnalysis;
  technical: TechnicalSeo;
}
```

## Check Results

Each check returns:

```typescript
interface SeoCheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail' | 'info';
  message: string;
  value?: string | number;
  recommendation?: string;
  evidence?: {
    found?: string | number | string[];
    expected?: string | number | string[];
    location?: string;
    issue?: string;
    impact?: string;
    example?: string;
    learnMore?: string;
  };
}
```

### Example Output

```typescript
{
  name: 'Title Length',
  status: 'warn',
  message: 'Title is too long (75 characters)',
  value: 75,
  recommendation: 'Keep title between 50-60 characters',
  evidence: {
    found: 75,
    expected: '50-60 characters',
    impact: 'May be truncated in search results'
  }
}
```

## Working with Results

### Filter by Status

```typescript
const errors = report.checks.filter(c => c.status === 'fail');
const warnings = report.checks.filter(c => c.status === 'warn');
const passed = report.checks.filter(c => c.status === 'pass');

console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);
console.log(`Passed: ${passed.length}`);
```

### Group by Category

```typescript
// Issues by category is already in summary
for (const [category, counts] of Object.entries(report.summary.issuesByCategory)) {
  console.log(`${category}: ${counts.errors} errors, ${counts.warnings} warnings`);
}
```

### Get Quick Wins

```typescript
console.log('Quick wins to improve your score:');
for (const win of report.summary.quickWins) {
  console.log(`  - ${win}`);
}
```

## Class-Based API

For more control, use the `SeoAnalyzer` class directly:

```typescript
import { SeoAnalyzer } from 'recker/seo';

// Create from HTML
const analyzer = await SeoAnalyzer.fromHtml(html, { baseUrl: 'https://example.com' });

// Run analysis
const report = analyzer.analyze();

// Get available rules
const rules = analyzer.getRules();
console.log(`Total rules: ${rules.length}`);

// Get rules by category
const metaRules = analyzer.getRulesByCategory('meta');

// Get all categories
const categories = analyzer.getCategories();
console.log('Categories:', categories);
```

## Scoring

The score is calculated based on check results:

| Status | Points |
|--------|--------|
| `pass` | 100 |
| `warn` | 50 |
| `fail` | 0 |
| `info` | N/A (not counted) |

**Formula:** `score = sum(points) / count(non-info checks)`

### Grades

| Score | Grade |
|-------|-------|
| 90-100 | A |
| 80-89 | B |
| 70-79 | C |
| 60-69 | D |
| 0-59 | F |

## Timing Information

When fetching HTML with timing, you can include timing metrics:

```typescript
import { analyzeSeo, SeoTiming } from 'recker/seo';

// Add timing to report (if available from your HTTP client)
const timing: SeoTiming = {
  ttfb: 150,      // Time to first byte (ms)
  total: 450,     // Total request duration (ms)
  dns: 20,        // DNS lookup (ms)
  tcp: 30,        // TCP connection (ms)
  tls: 50,        // TLS handshake (ms)
  download: 200   // Content download (ms)
};

// Timing is added to the report
report.timing = timing;
```

## Next Steps

- **[Spider](03-spider.md)** - Crawl entire sites with SEO analysis
- **[AI Search](04-ai-search.md)** - Optimize for AI search engines
- **[Validators](05-validators.md)** - Validate robots.txt, sitemap.xml, llms.txt
- **[Categories](06-categories.md)** - All 22 rule categories explained

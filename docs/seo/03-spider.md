# SEO Spider

The SEO Spider crawls entire websites with rich reporting capabilities. **Even without SEO analysis enabled**, the spider provides comprehensive site structure data. With `seo: true`, reports become even richer with per-page SEO scores and site-wide issue detection.

## Rich Reports by Default

The spider's base report is already comprehensive:

```typescript
import { spider } from 'recker/scrape';

// Base spider (no SEO analysis)
const result = await spider('https://example.com', {
  maxPages: 50,
  depth: 3
});

// Rich base report includes:
console.log(`Pages: ${result.pages.length}`);
console.log(`Duration: ${result.duration}ms`);
console.log(`Errors: ${result.errors.length}`);

// Per-page data
for (const page of result.pages) {
  console.log(`${page.status} ${page.url}`);
  console.log(`  Title: ${page.title}`);
  console.log(`  Depth: ${page.depth}`);
  console.log(`  Links: ${page.links.length}`);
  console.log(`  Duration: ${page.duration}ms`);
}

// Sitemap analysis (automatic)
console.log(`Orphan URLs: ${result.sitemap.orphanUrls.length}`);
console.log(`Missing from sitemap: ${result.sitemap.missingFromSitemap.length}`);

// Robots.txt analysis (automatic)
console.log(`Blocked paths: ${result.robots.blockedPaths.length}`);
```

### Base Report Structure

```typescript
interface SpiderResult {
  startUrl: string;
  pages: SpiderPageResult[];
  visited: Set<string>;
  duration: number;
  errors: Array<{ url: string; error: string }>;

  // Always included (even without seo: true)
  sitemap: SitemapAnalysis;
  robots: RobotsAnalysis;
}

interface SpiderPageResult {
  url: string;
  status: number;
  title: string;
  depth: number;
  links: ExtractedLink[];
  duration: number;
  error?: string;
}

interface SitemapAnalysis {
  found: boolean;
  url?: string;
  urlCount: number;
  orphanUrls: string[];           // URLs in sitemap but not found
  missingFromSitemap: string[];   // Crawled URLs not in sitemap
  blockedBySitemapRobots: string[];
}

interface RobotsAnalysis {
  found: boolean;
  url?: string;
  sitemapUrls: string[];
  blockedPaths: string[];
  allowedPaths: string[];
  crawlDelay?: number;
}
```

## Even Richer with SEO Analysis

Enable `seo: true` to unlock per-page SEO reports and site-wide issue detection:

```typescript
import { seoSpider } from 'recker/seo';

const result = await seoSpider('https://example.com', {
  seo: true,  // Enable SEO analysis
  maxPages: 50,
  depth: 3
});

// Everything from base report PLUS:

// Per-page SEO scores (400+ checks each!)
for (const page of result.pages) {
  console.log(`${page.url}`);
  console.log(`  SEO Score: ${page.seoReport?.score}/100`);
  console.log(`  Grade: ${page.seoReport?.grade}`);
  console.log(`  Errors: ${page.seoReport?.summary.errors}`);
  console.log(`  Warnings: ${page.seoReport?.summary.warnings}`);
}

// Site-wide issue detection
for (const issue of result.siteWideIssues) {
  console.log(`${issue.type}: ${issue.message}`);
  console.log(`  Affected: ${issue.affectedUrls.length} pages`);
}

// Aggregate statistics
console.log(`Average Score: ${result.summary.avgScore}`);
console.log(`Duplicate Titles: ${result.summary.duplicateTitles}`);
console.log(`Duplicate Descriptions: ${result.summary.duplicateDescriptions}`);
console.log(`Orphan Pages: ${result.summary.orphanPages}`);
```

### SEO Report Structure

```typescript
interface SeoSpiderResult extends SpiderResult {
  /** Pages now include full SEO reports */
  pages: SeoPageResult[];

  /** Site-wide SEO issues (duplicates, orphans, etc.) */
  siteWideIssues: SiteWideIssue[];

  /** Aggregate statistics */
  summary: {
    totalPages: number;
    pagesWithErrors: number;
    pagesWithWarnings: number;
    avgScore: number;
    duplicateTitles: number;
    duplicateDescriptions: number;
    duplicateH1s: number;
    orphanPages: number;
  };
}

interface SeoPageResult extends SpiderPageResult {
  /** Full SEO report with 400+ checks */
  seoReport?: SeoReport;
}

interface SeoReport {
  score: number;        // 0-100
  grade: string;        // A, B, C, D, F
  summary: {
    totalChecks: number;
    passed: number;
    warnings: number;
    errors: number;
    passRate: number;
    topIssues: Issue[];
    quickWins: Issue[];
  };
  checks: Check[];      // All 400+ checks with results
  categories: { [category: string]: CategoryResult };
}
```

## Report Comparison

| Feature | Base Spider | SEO Spider |
|---------|-------------|------------|
| Page status codes | ✅ | ✅ |
| Page titles | ✅ | ✅ |
| Internal/external links | ✅ | ✅ |
| Crawl depth tracking | ✅ | ✅ |
| Request timing | ✅ | ✅ |
| Sitemap analysis | ✅ | ✅ |
| Robots.txt analysis | ✅ | ✅ |
| Per-page SEO score | ❌ | ✅ |
| 400+ SEO checks per page | ❌ | ✅ |
| Duplicate title detection | ❌ | ✅ |
| Duplicate description detection | ❌ | ✅ |
| Duplicate H1 detection | ❌ | ✅ |
| Orphan page detection | ❌ | ✅ |
| Aggregate statistics | ❌ | ✅ |

## Quick Start

```typescript
import { seoSpider } from 'recker/seo';

const result = await seoSpider('https://example.com', {
  seo: true,
  maxPages: 50,
  depth: 3
});

console.log(`Crawled ${result.summary.totalPages} pages`);
console.log(`Average SEO Score: ${result.summary.avgScore}`);
console.log(`Duplicate Titles: ${result.summary.duplicateTitles}`);
```

## Options

```typescript
interface SeoSpiderOptions {
  // SEO Options
  /** Enable SEO analysis for each page (default: false) */
  seo?: boolean;

  /** Output file path for JSON report */
  output?: string;

  /** Callback for each page's SEO analysis */
  onSeoAnalysis?: (result: SeoPageResult) => void;

  /** Focus on specific rule categories */
  focusCategories?: string[];

  /** Focus mode name */
  focusMode?: 'all' | 'links' | 'duplicates' | 'security' | 'ai' | 'resources';

  // Spider Options (inherited)
  /** Maximum pages to crawl */
  maxPages?: number;

  /** Maximum depth from start URL */
  depth?: number;

  /** Request timeout in ms */
  timeout?: number;

  /** Custom user agent */
  userAgent?: string;

  /** Respect robots.txt */
  respectRobotsTxt?: boolean;

  /** Delay between requests (ms) */
  delay?: number;

  /** Concurrent requests */
  concurrency?: number;
}
```

## Class-Based Usage

```typescript
import { SeoSpider } from 'recker/seo';

const spider = new SeoSpider({
  seo: true,
  maxPages: 100,
  depth: 5,
  concurrency: 3,
  delay: 100,
  onSeoAnalysis: (page) => {
    console.log(`Analyzed: ${page.url} - Score: ${page.seoReport?.score}`);
  }
});

const result = await spider.crawl('https://example.com');

// Stop crawling early
spider.abort();

// Check if still running
if (spider.isRunning()) {
  console.log('Crawling in progress...');
}
```

## Site-Wide Issues

The spider detects these site-wide problems:

### Duplicate Titles
```typescript
{
  type: 'duplicate-title',
  severity: 'error',
  message: '3 pages share the same title',
  affectedUrls: [
    'https://example.com/page1',
    'https://example.com/page2',
    'https://example.com/page3'
  ],
  value: 'Welcome to Example'
}
```

### Duplicate Descriptions
```typescript
{
  type: 'duplicate-description',
  severity: 'warning',
  message: '2 pages share the same meta description',
  affectedUrls: ['...'],
  value: 'Example description text...'
}
```

### Duplicate H1 Headings
```typescript
{
  type: 'duplicate-h1',
  severity: 'warning',
  message: '4 pages share the same H1 heading',
  affectedUrls: ['...'],
  value: 'Welcome'
}
```

### Orphan Pages
Pages with no internal links pointing to them:

```typescript
{
  type: 'orphan-page',
  severity: 'warning',
  message: '5 page(s) have no internal links pointing to them',
  affectedUrls: [
    'https://example.com/hidden-page',
    'https://example.com/old-page'
  ]
}
```

## Focus Modes

Optimize crawling for specific use cases:

### Links Only
```typescript
const result = await seoSpider(url, {
  seo: true,
  focusMode: 'links',
  focusCategories: ['links', 'internal-linking']
});
```

### Security Focus
```typescript
const result = await seoSpider(url, {
  seo: true,
  focusMode: 'security',
  focusCategories: ['security']
});
```

### AI Search Focus
```typescript
const result = await seoSpider(url, {
  seo: true,
  focusMode: 'ai',
  focusCategories: ['ai-search']
});
```

### Find Duplicates
```typescript
const result = await seoSpider(url, {
  seo: true,
  focusMode: 'duplicates',
  focusCategories: ['meta', 'content']
});

// Check for duplicates
for (const issue of result.siteWideIssues) {
  if (issue.type.startsWith('duplicate-')) {
    console.log(`${issue.message}: "${issue.value}"`);
    console.log(`  Affected: ${issue.affectedUrls.join(', ')}`);
  }
}
```

## Saving Reports

### JSON Report
```typescript
const result = await seoSpider(url, {
  seo: true,
  output: './seo-report.json'
});
// Report automatically saved to file
```

### Custom Processing
```typescript
const result = await seoSpider(url, { seo: true });

// Custom report format
const report = {
  crawledAt: new Date().toISOString(),
  summary: result.summary,
  issues: result.siteWideIssues,
  pages: result.pages.map(p => ({
    url: p.url,
    score: p.seoReport?.score,
    grade: p.seoReport?.grade,
    errors: p.seoReport?.summary.errors,
    warnings: p.seoReport?.summary.warnings
  }))
};

await fs.writeFile('custom-report.json', JSON.stringify(report, null, 2));
```

## CLI Usage

```bash
# Basic spider (rich base report)
rek spider https://example.com

# With SEO analysis (even richer)
rek spider https://example.com seo=true

# With depth and limit
rek spider https://example.com seo=true depth=3 maxPages=50

# Focus on specific checks
rek spider https://example.com seo=true --focus ai

# Save to file
rek spider https://example.com seo=true -o report.json

# JSON output
rek spider https://example.com seo=true --format json
```

## Progress Tracking

```typescript
const spider = new SeoSpider({
  seo: true,
  maxPages: 100,
  onSeoAnalysis: (page) => {
    const emoji = page.seoReport?.grade === 'A' ? '✅' :
                  page.seoReport?.grade === 'F' ? '❌' : '⚠️';
    console.log(`${emoji} ${page.url} - ${page.seoReport?.grade} (${page.seoReport?.score})`);
  }
});

console.log('Starting crawl...');
const result = await spider.crawl('https://example.com');
console.log('Done!');
```

## Best Practices

1. **Start Small** - Test with `maxPages: 10` first
2. **Be Respectful** - Use `delay: 100` or higher to avoid overloading servers
3. **Limit Depth** - `depth: 3-5` is usually sufficient
4. **Focus When Possible** - Use `focusCategories` to reduce analysis time
5. **Monitor Progress** - Use `onSeoAnalysis` callback for real-time feedback
6. **Use Base Spider First** - Start without `seo: true` to map site structure quickly

## When to Use Each Mode

| Scenario | Recommended Mode |
|----------|------------------|
| Quick site structure check | Base spider (`spider()`) |
| Find broken links | Base spider |
| Sitemap validation | Base spider |
| Full SEO audit | SEO spider (`seo: true`) |
| Duplicate content detection | SEO spider |
| CI/CD quality gates | SEO spider with thresholds |

## Next Steps

- **[AI Search](04-ai-search.md)** - Optimize for AI search engines
- **[Validators](05-validators.md)** - Validate robots.txt, sitemap.xml, llms.txt
- **[CI/CD](07-cicd.md)** - Integrate into your build pipeline

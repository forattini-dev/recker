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
interface SeoSpiderOptions extends SpiderOptions {
  // SEO Options
  /** Enable SEO analysis for each page (default: false) */
  seo?: boolean;

  /** Output file path for JSON report */
  output?: string;

  /** Callback for each page's SEO analysis (includes full SEO report + timings) */
  onSeoAnalysis?: (result: SeoPageResult) => void;

  /** Callback when a page is blocked (includes SEO report if analysis was possible) */
  onBlocked?: (result: SeoPageResult) => void | Promise<void>;

  /** Callback when a fetch fails (includes page result with timings) */
  onError?: (result: SeoPageResult) => void | Promise<void>;

  /** Focus on specific rule categories (empty array = all categories) */
  focusCategories?: string[];

  /** Focus mode name for display purposes */
  focusMode?: 'all' | 'links' | 'duplicates' | 'security' | 'ai' | 'resources';

  // Spider Options (inherited from SpiderOptions)
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

  /**
   * Allowed domains list with wildcard support.
   * When set, only URLs matching these domains are crawled (overrides sameDomain).
   * Examples: ['example.com', '*.example.com', 'blog.other.com']
   * See Spider docs for full details.
   */
  allowedDomains?: string[];

  /**
   * Crawl strategy: 'bfs' (breadth-first, default) or 'dfs' (depth-first).
   * BFS explores level-by-level; DFS follows links deeply before backtracking.
   */
  strategy?: 'bfs' | 'dfs';

  /**
   * Automatically adjust crawl delay based on server response times.
   * Pass `true` for defaults, or an object with targetMs, minDelay, maxDelay.
   * See Spider docs for full details.
   */
  autoThrottle?: boolean | { targetMs?: number; minDelay?: number; maxDelay?: number };

  /**
   * Deduplicate pages with identical content via MD5 hash (default: false).
   * Useful for sites that serve the same content under different URLs.
   */
  deduplicateContent?: boolean;

  /**
   * Proactive per-domain rate limit applied before each request.
   * Example: { maxPerSecond: 2 }
   * See Spider docs for full details.
   */
  domainRateLimit?: { maxPerSecond?: number };

  /**
   * Resume a previously interrupted crawl without clearing queue/storage (default: false).
   * Requires a persistent crawlQueue/crawlStorage adapter (e.g., SQLite).
   * See Spider docs for full details.
   */
  resume?: boolean;

  // Hooks (inherited from SpiderOptions)
  /** Callback for each page crawled (success, blocked, or error) */
  onPage?: (event: SpiderPageEvent) => void | Promise<void>;

  /** Callback before a retry attempt */
  onRetry?: (info: {
    url: string;
    attempt: number;
    maxAttempts: number;
    reason?: string;
    delay: number;
    transport: SpiderTransport;
    previousStatus: number;
  }) => void | Promise<void>;

  /** Callback when a redirect is followed */
  onRedirect?: (info: {
    from: string;
    to: string;
    status: number;
  }) => void | Promise<void>;

  /** Callback for progress updates */
  onProgress?: (progress: SpiderProgress) => void;
}

interface SpiderPageEvent {
  /** Full page result with timings, security, metrics, links */
  result: SpiderPageResult;
  /** Raw HTML string (undefined when fetch failed or non-HTML content) */
  html?: string;
  /**
   * Lazy HTML parser — only parses on first call, caches the result.
   * Returns a ScrapeDocument with .selectFirst(), .links(), .meta(), .text(), .openGraph(), etc.
   * Undefined when no HTML is available.
   */
  document?: () => Promise<ScrapeDocument>;
}
```

## Hooks and Callbacks

SeoSpider provides several hooks for real-time monitoring and custom processing during crawls. Some are SeoSpider-specific, others are inherited from the base Spider.

### `onSeoAnalysis` (SeoSpider-specific)

Fires after SEO analysis completes for each page. This is the primary hook for tracking SEO scores in real time:

```typescript
const spider = new SeoSpider({
  seo: true,
  maxPages: 50,
  onSeoAnalysis: (page) => {
    console.log(`${page.url}: score ${page.seoReport?.score}, grade ${page.seoReport?.grade}`);
  },
});
```

### `onPage` (inherited from Spider)

Fires for every page crawled (success, blocked, or error). SeoSpider wraps the Spider's `onPage` internally to run SEO analysis, then forwards the event to your callback. The event includes a lazy `document` parser:

```typescript
const spider = new SeoSpider({
  seo: true,
  maxPages: 50,
  onPage: async ({ result, html, document }) => {
    console.log(`Crawled: ${result.url} (${result.status})`);
    if (document) {
      const doc = await document();
      console.log(`  H1: ${doc.selectFirst('h1')?.text()}`);
    }
  },
});
```

### `onBlocked` (SeoSpider override)

Fires when bot protection or a WAF blocks a request. In SeoSpider, the result is a `SeoPageResult` (which may include a partial SEO report if analysis was possible):

```typescript
const spider = new SeoSpider({
  seo: true,
  onBlocked: (result) => {
    console.warn(`Blocked: ${result.url} (status ${result.status})`);
  },
});
```

### `onError` (SeoSpider override)

Fires when a fetch fails with an error. Like `onBlocked`, the result is a `SeoPageResult`:

```typescript
const spider = new SeoSpider({
  seo: true,
  onError: (result) => {
    console.error(`Error: ${result.url} — ${result.error}`);
  },
});
```

### `onRetry` (inherited from Spider)

Fires before each retry attempt, useful for logging retry behavior:

```typescript
const spider = new SeoSpider({
  seo: true,
  maxRetryAttempts: 5,
  onRetry: (info) => {
    console.log(`Retry ${info.attempt}/${info.maxAttempts}: ${info.url} (${info.reason})`);
  },
});
```

### `onRedirect` (inherited from Spider)

Fires when an HTTP redirect is followed:

```typescript
const spider = new SeoSpider({
  seo: true,
  onRedirect: ({ from, to, status }) => {
    console.log(`${status} redirect: ${from} -> ${to}`);
  },
});
```

### Combined Example

Use multiple hooks together for comprehensive monitoring:

```typescript
const seoSpider = new SeoSpider({
  seo: true,
  maxPages: 50,

  // SEO analysis callback (SeoSpider-specific)
  onSeoAnalysis: (page) => {
    console.log(`${page.url}: score ${page.seoReport?.score}`);
  },

  // Page callback with lazy document parser (inherited from Spider)
  onPage: async ({ result, html, document }) => {
    console.log(`Crawled: ${result.url} (${result.status})`);
    if (document) {
      const doc = await document();
      console.log(`  H1: ${doc.selectFirst('h1')?.text()}`);
    }
  },

  // Blocked callback with full page result
  onBlocked: (result) => {
    console.warn(`Blocked: ${result.url} (${result.status})`);
  },

  // Error callback
  onError: (result) => {
    console.error(`Error: ${result.url} — ${result.error}`);
  },

  // Retry and redirect hooks (inherited from Spider)
  onRetry: (info) => {
    console.log(`Retry ${info.attempt}/${info.maxAttempts}: ${info.url}`);
  },
  onRedirect: ({ from, to, status }) => {
    console.log(`${status} ${from} -> ${to}`);
  },
});

const result = await seoSpider.crawl('https://example.com');
```

## SERP Campaign Mode (Post-Crawl Search Checks)

When `--serp` is enabled on `rek seo spider`, the crawler also runs a lightweight keyword campaign using keywords extracted from each page's SEO report.

Use cases:
- Verify whether top keywords are still showing for their own pages
- Compare brand/company competitive landscape in `topOrganicCompetitors`
- Validate if changes in title/heading/content are reflected in SERP

### SERP seed strategy (automatic)

When `--serp` is enabled, seed selection now has three explicit stages:

- **Short-tail seed**:
  - Uses up to `--serp-top-keywords` (default 5) unique top terms per crawled page
  - Comes from SEO `topKeywords` extracted per page
  - Prioritizes signal quality (frequency + position in the page)
  - Short-tail candidates are unique across all pages after token-normalized dedupe (so permuted duplicates are merged), and per-page caps are applied before global merge.
- **Long-tail seed**:
  - Generates multiword phrases from title, meta description, heading hierarchy + content sections, link anchors/URLs, and URL path
  - Adds schema-backed candidates (FAQ, HowTo, Product, BreadcrumbList)
  - Adds heading-path composition (parent/child heading merges and heading-body blends)
  - Filters weak connector-heavy variants (phrases that are only prepositions/conjunctions)
  - Collapses permutations (`conta aberta` == `aberta conta`) so they do not consume query budget
  - Keeps only phrases with **2 to 4 words**
  - Expands coverage for intent terms like `"como abrir conta"` and `"melhor conta digital para empresa"`
  - Combines top anchor tokens with nearby modifier terms to create natural variations
- **Deduplication and ranking**:
  - Short and long-tail candidates are deduped across pages with permutation-insensitive normalization (`conta aberta` == `aberta conta`)
  - Long-tail variants are capped to 2–4 words, de-noised by connector filtering, and scored by contextual relevance
  - Final `ordered` list is globally sorted by word count ASC (1-word → 2-word → 3-word → 4-word), weight DESC within each group, then capped by `--serp-query-limit`

Execution order is explicit and stable: `seedPlan.ordered` always goes from shortest keywords to longest — 1-word terms first (by weight), then 2-word, then 3-word, then 4-word. `seedPlan.short` and `seedPlan.longTail` expose each layer individually.

This makes SERP checks much more representative: short-intent tokens first, then intent-rich long-tail discovery.

### Keyword engine (no LLM): concrete execution plan

This is the current production keyword engine used by SERP mode. It is deterministic and tuned for production safety:

#### 1) Structure-first extraction

1. Parse page into sections using DOM hierarchy:
   - Heading stack (`h1`→`h2`→`h3`…)
   - Paragraph/list/table/figure containers
   - Link anchors and URLs
   - JSON-LD structured data
2. Build a page content signal set by source:
   - `title`, `description`, URL path
   - `heading path` context around each section
   - section text + anchors/nearby words

#### 2) Candidate families

Generate candidates in parallel, then merge:

- **Short-tail family**
  - Top single words from `report.keywords.topKeywords`
  - Optional lexical normalization + minimum-frequency floor
- **Long-tail family** (2–4 words)
  - Anchor-window phrases around high-value tokens
  - Heading-path compositions (parent/child headings + body blends)
  - Schema-backed phrases (`FAQ`, `HowTo`, `Product`, `BreadcrumbList`)
  - Link-anchor-anchored expansion

#### 3) Short-tail budget

When building seeds for a SERP run, the `topKeywordsLimit` cap (which reserves query budget for long-tail) is **only applied when long-tail generation is also active**. When extracting short-tail-only seeds (e.g., to build the `short` layer), the full `topKeywordsPerPage` budget is used unchanged. This prevents the cap from accidentally limiting the short-tail layer when no long-tail is being generated.

#### 4) Ranking formula

For each candidate keyword `k`, compute:

`score(k) = (base * 0.45) + (structure * 0.22) + (context * 0.18) + (schema * 0.10) + (diversity * 0.05) - penalty`

- `base` = frequency/weight from source (or YAKE-like local score)
- `structure` = heading/source boost
  - `title`/`og:title`/`h1`: 1.3
  - `h2`/`h3`: 1.1
  - section/body: 0.8
- `context` = proximity + window quality
  - words that appear near main anchors
  - reduced if high connector ratio
- `schema` = JSON-LD evidence boost
  - FAQ/HowTo/Product/BreadcrumbList questions and attributes
- `diversity` = anti-redundancy component by topic bucket
- `penalty` = boilerplate/template suppression
  - repeated DOM paths across pages
  - very high link-density containers
  - duplicate permutation signatures (`aberta conta` vs `conta aberta`)

#### 5) Dedup + budget policy

1. Normalize candidate for permutation-insensitive signature (sorted tokens).
2. Keep highest score per signature.
3. Merge short-tail and long-tail into one list, then **sort globally by word count ASC, weight DESC**:
   - 1-word seeds (short-tail) first, ranked by weight
   - 2-word seeds next, ranked by weight
   - 3-word seeds, ranked by weight
   - 4-word seeds last, ranked by weight
4. Apply `queryLimit` after sort.

Suggested budget split (safe default):

- `shortTailBudget = min(ceil(queryLimit * 0.45), totalShortCandidates)`
- `longTailBudget = queryLimit - shortTailBudget`

If short candidates are scarce, carry the balance to long-tail automatically.

#### 6) Output contract for each SERP run

- `seedPlan.short`: final short-tail list (deduped, ordered)
- `seedPlan.longTail`: final long-tail list (deduped, ordered)
- `seedPlan.ordered`: final query order (`short` first + `longTail`)
- `pageComparison`: per-source-page visibility metrics (`searched`, `found`, `Ap.%`, `Avg pos`, `Top3`, `Top10`)

#### 7) Regression checks (automatable)

- **Word-count ordering guarantee**: `ordered` is globally non-decreasing by word count — `ordered[i].wordCount >= ordered[i-1].wordCount` for every position.
- **Short-first guarantee**: first `plan.short.length` entries in `ordered` have exactly 1 token.
- **Long-tail span guarantee**: long-tail entries are only 2–4 words.
- **Permutation dedupe guarantee**: no repeated signatures among long-tail candidates.
- **Stability guarantee**: same input + same options => same ordered plan.
- **Source coverage guarantee**: at least one seed for pages that contain JSON-LD and headings (when present).
- **Campaign coverage guarantee**: seeds without source content from anchors/sections are not preferred over section/context-aware seeds when both are valid.

```bash
# Use more seeds to expand phrase coverage
rek seo spider example.com \
  --seo \
  --serp \
  --serp-top-keywords 14 \
  --serp-query-limit 18 \
  --serp-results-per-query 10 \
  --output long-tail-serp.json
```

`--serp-top-keywords` now defaults to **5**. For baseline comparability, keep the query pool tight:

```bash
rek seo spider example.com \
  --seo \
  --serp \
  --serp-top-keywords 5 \
  --serp-query-limit 8 \
  --serp-results-per-query 8 \
  --serp-transport curl
```

### CLI Workflow

```bash
# Run SEO + SERP on default settings
rek seo spider example.com --seo --serp -o report-with-serp.json

# Use explicit campaign bounds
rek seo spider example.com \
  --seo \
  --serp \
  --serp-top-keywords 12 \
  --serp-query-limit 20 \
  --serp-results-per-query 20 \
  --jsonl -o serp-crawl.jsonl
```

### Regional and Transport Controls

```bash
# Crawl and run SERP for BR + Portuguese interface
rek seo spider example.com \
  --seo \
  --serp \
  --serp-country br \
  --serp-gl br \
  --serp-hl pt-BR \
  --output serp-br.json

# Use cURL transport + custom timeout on protected domains
rek seo spider example.com \
  --seo \
  --serp \
  --serp-transport curl \
  --serp-timeout 25000 \
  --output serp-curl.json
```

### Anti-Block Crawler Controls (rek spider / rek seo spider)

Use these options when you see 403/429/challenge responses, or when crawling sensitive sites:

```bash
# Force impersonated curl for protected domains
rek spider example.com --transport curl --prefer-curl-first

# Auto mode with stronger anti-block retry/backoff
rek seo spider example.com \
  --seo \
  --transport auto \
  --prefer-curl-first true \
  --timeout 12000 \
  --delay 180 \
  --max-retry-attempts 5 \
  --base-retry-delay-ms 800 \
  --max-retry-delay-ms 14000 \
  --retry-backoff-multiplier 2 \
  --retry-jitter-ms 250 \
  --max-domain-block-strikes 2 \
  --rotate-user-agent true \
  --randomize-headers true
```

### Advanced SERP Query Controls

```bash
# Filter by country/language and result type
rek seo spider example.com \
  --seo \
  --serp \
  --serp-cr countryBR \
  --serp-lr lang_pt \
  --serp-tbm news \
  --serp-tbs qdr:d \
  --serp-safe strict

# Use Google advanced as_* modifiers
rek seo spider example.com \
  --seo \
  --serp \
  --serp-as-oq "guia rápido" \
  --serp-as-epq "guia de implantação" \
  --serp-as-eq "gratis desconto" \
  --serp-as-filetype pdf \
  --serp-as-sitesearch example.com \
  --serp-extra "safe=active,nfpr=1"
```

### SERP Output Shape (CLI JSON)

The `--serp` flow adds a `serp` block to summary output.

```json
{
    "serp": {
      "seedPlan": {
        "short": ["maquininha", "conta", "pagamento", "negócio", "soluções"],
        "longTail": [
          "criar conta empresa",
          "como vender maquininha",
          "maquininha de cartão negócio"
        ],
        "ordered": [
          "maquininha", "conta", "pagamento", "negócio", "soluções",
          "criar conta empresa", "como vender maquininha",
          "maquininha de cartão negócio"
        ]
      },
      "summary": {
        "queriesRequested": 20,
        "queriesExecuted": 20,
        "queriesFound": 8,
        "avgTopPosition": 9,
        "top3Count": 2,
        "top10Count": 5,
        "topOrganicCompetitors": [
        {
          "domain": "concorrente.com",
          "matchedKeywords": 10,
          "totalOutperformedQueries": 4,
          "organicQueries": 20,
          "avgOutperformedGap": 2.0
        }
      ],
      "topPaidCompetitors": [
        {
          "domain": "anuncio.com",
          "matchedKeywords": 3,
          "totalOutperformedQueries": 1,
          "paidQueries": 5,
          "avgOutperformedGap": 3.5
        }
      ],
      "competitorCoverage": {
        "organicUniqueDomains": 4,
        "paidUniqueDomains": 1
      }
    },
    "campaign": {
      "active": true,
      "confidence": "medium",
      "evidence": [
        "tutorial aparece orgânico em posição #2"
      ]
    },
    "results": [
      {
        "keyword": "termo principal",
        "found": true,
        "position": 2,
        "targetUrl": "https://example.com/pagina",
        "searchUrl": "https://www.google.com/search?q=termo+principal"
      }
    ],
    "pageComparison": [
      {
        "pageUrl": "https://example.com/blog/post-1",
        "tracked": 20,
        "found": 8,
        "appearanceRate": "40.0%",
        "avgPosition": "6.2",
        "top3": 3,
        "top10": 6
      }
    ]
  }
}
```

`seedPlan` documents how query selection happened (`short`, `longTail`, `ordered`) and drives execution order when filling `results`.

- `short` — 1-word seeds only, ranked by weight DESC.
- `longTail` — 2–4 word phrases, filtered for connectors, deduplicated, sorted by word count ASC then weight DESC.
- `ordered` — full merged list, globally sorted by word count ASC (1 → 2 → 3 → 4 words), weight DESC within each group. This is the sequence fed to the SERP engine.

`results` keeps rows in the same sequence as `ordered`.
`Top Keywords` in standard `rek seo` output remains short-term frequency signals; use `--serp` to view long-tail `seedPlan.longTail` candidates and campaign execution.

`pageComparison` shows average visibility by source page (`appearanceRate`, `avgPosition`, `top3`, `top10`), helping you find underperforming page templates quickly.

`topOrganicCompetitors` and `topPaidCompetitors` show where competitors beat you:

- `matchedKeywords`: how many query words they share with your campaign
- `totalOutperformedQueries`: number of queries where the competitor outranks your domain
- `organicQueries` / `paidQueries`: where wins happened
- `avgOutperformedGap`: average position gap when outranking

When `--jsonl` is used, SERP is emitted as an extra record:

```jsonl
{"type":"serp","summary":{...},"campaign":{...},"results":[...],"pageComparison":[...]}
```

When no keywords are found in crawl pages, the `serp` block is omitted and the tool will log a warning in CLI output.

### Campaign Intelligence from `serp.pageComparison`

Esse bloco já entrega o que você pediu para análise de campanha:

- **Aparição média** por template (`appearanceRate`)  
- **Posição média** (`avgPosition`) onde a página aparece  
- **Top3 / Top10** de aparição nos termos testados  

Exemplo:

```json
{
  "pageComparison": [
    {
      "pageUrl": "https://example.com/blog/post-1",
      "tracked": 20,
      "found": 8,
      "appearanceRate": "40.0%",
      "avgPosition": "6.2",
      "top3": 3,
      "top10": 6
    }
  ]
}
```

### Principais concorrentes e páginas vencedoras

`topOrganicCompetitors` também já traz onde seu domínio perde:

- `totalOutperformedQueries` indica em quantas queries o concorrente vence você.
- `avgOutperformedGap` é o gap médio de posição nesse confronto.
- `organicQueries` / `paidQueries` ajudam a separar ameaça orgânica x mídia paga.

```bash
rek seo spider example.com \
  --seo \
  --serp \
  --serp-top-keywords 10 \
  --serp-query-limit 20 \
  --serp-results-per-query 10
```

Use isso para:

1. Ordenar `topOrganicCompetitors` por `totalOutperformedQueries` para priorizar ameaça principal.
2. Validar se as querys da concorrência estão com intenção próxima da sua página-alvo.
3. Ajustar o conteúdo da(s) sua(s) páginas com menor `appearanceRate`.

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

### Advanced Spider Features

SeoSpider inherits all Spider capabilities, including domain control, crawl strategy, auto-throttle, content deduplication, and resumable crawls. See the [Spider documentation](../scraping/05-spider.md) for full details on each feature.

```typescript
import { SeoSpider } from 'recker/seo';

const seoSpider = new SeoSpider({
  seo: true,
  maxPages: 200,
  allowedDomains: ['*.example.com'],
  autoThrottle: true,
  deduplicateContent: true,
  strategy: 'bfs',
  onSeoAnalysis: (page) => {
    console.log(`${page.url}: ${page.seoReport?.score}/100`);
  },
});

const result = await seoSpider.crawl('https://example.com');
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

## Data Extraction with SEO

Combine SEO analysis with data extraction to get both SEO scores and custom data:

```bash
# Extract headings while analyzing SEO
rek spider example.com --seo --extract "h1,h2,h3"

# Product catalog with SEO audit
rek spider shop.example.com \
  --seo \
  --extract ".product-title,.price" \
  --include "^/products/" \
  --json -o catalog-audit.json
```

```typescript
const spider = new SeoSpider({
  seo: true,
  maxPages: 100,
  extract: ['h1', '.price', 'a:href'],
  include: [/\/products\//]
});

const result = await spider.crawl('https://shop.example.com');

// Each page now has both SEO scores AND extracted data
for (const page of result.pages) {
  console.log(`${page.url}`);
  console.log(`  SEO: ${page.seoReport?.grade} (${page.seoReport?.score})`);
  console.log(`  H1: ${page.extracted?.h1?.[0]}`);
  console.log(`  Prices: ${page.extracted?.price?.length || 0}`);
}
```

## JSONL Streaming for Large SEO Crawls

For large sites, use JSONL streaming to avoid memory issues and get real-time progress:

```bash
# Stream SEO crawl to JSONL file
rek spider example.com --seo --jsonl -o seo-crawl.jsonl

# With extraction
rek spider example.com --seo --extract "h1" --jsonl -o audit.jsonl

# Process in real-time with jq
rek spider example.com --seo -L | jq 'select(.seoScore < 50)'
```

### JSONL Record Format with SEO

```jsonl
{"type":"start","url":"https://example.com","config":{"seo":true,...}}
{"type":"page","url":"https://example.com/","status":200,"depth":0,"title":"..."}
{"type":"page-full","url":"...","seoScore":85,"seoGrade":"B","seoErrors":3,"seoWarnings":12,"extracted":{...}}
{"type":"complete","url":"...","seo":{"avgScore":78,"duplicateTitles":2,"orphanPages":5,...}}
```

The `complete` record includes site-wide SEO analysis:
- `avgScore` - Average SEO score across all pages
- `duplicateTitles` - Pages sharing the same title
- `duplicateDescriptions` - Pages sharing meta descriptions
- `duplicateH1s` - Pages sharing H1 headings
- `orphanPages` - Pages with no internal links
- `siteWideIssues` - Array of site-wide problems

### Processing Large SEO Crawls

```bash
# Find pages with low SEO scores
cat seo-crawl.jsonl | jq -r 'select(.type=="page-full" and .seoScore < 60) | .url'

# Get duplicate titles
cat seo-crawl.jsonl | jq 'select(.type=="complete") | .seo.duplicateTitles'

# Extract pages with SEO errors
cat seo-crawl.jsonl | jq 'select(.seoErrors > 0) | {url, errors: .seoErrors}'
```

## CLI Usage

```bash
# Basic spider (rich base report)
rek spider example.com

# With SEO analysis (even richer)
rek spider example.com --seo

# With depth and limit
rek spider example.com --seo -d 3 -l 50

# Focus on specific checks
rek spider example.com --seo -f ai

# Save to file
rek spider example.com --seo -o report.json

# Stream as JSONL (for large sites)
rek spider example.com --seo --jsonl -o seo-crawl.jsonl

# Combine SEO with extraction
rek spider example.com --seo --extract "h1,.price" -o audit.json

# Focus modes
rek spider example.com --seo -f links      # Link analysis
rek spider example.com --seo -f duplicates # Find duplicate content
rek spider example.com --seo -f security   # Security issues
rek spider example.com --seo -f ai         # AI-search readiness
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
5. **Monitor Progress** - Use `onSeoAnalysis` for real-time SEO scores, `onBlocked`/`onError` for failures, and `onRetry`/`onRedirect` for network-level visibility
6. **Use Base Spider First** - Start without `seo: true` to map site structure quickly
7. **Use JSONL for Large Sites** - For 100+ pages, use `--jsonl` to stream results
8. **Combine with Extraction** - Get custom data alongside SEO scores

## When to Use Each Mode

| Scenario | Recommended Mode |
|----------|------------------|
| Quick site structure check | Base spider (`spider()`) |
| Find broken links | Base spider |
| Sitemap validation | Base spider |
| Full SEO audit | SEO spider (`--seo`) |
| Duplicate content detection | SEO spider + focus duplicates |
| CI/CD quality gates | SEO spider with thresholds |
| Large sites (500+ pages) | SEO spider + JSONL (`--jsonl`) |
| Product catalog audit | SEO spider + extraction (`--extract`) |
| Content inventory | Spider + extraction |

## Next Steps

- **[AI Search](04-ai-search.md)** - Optimize for AI search engines
- **[Validators](05-validators.md)** - Validate robots.txt, sitemap.xml, llms.txt
- **[CI/CD](07-cicd.md)** - Integrate into your build pipeline

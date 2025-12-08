# SEO Analyzer

Comprehensive SEO analysis for web pages using a rules-based engine with 70+ checks across 13 categories.

## Features

- **70+ SEO Rules** - Comprehensive checks across all important SEO aspects
- **13 Categories** - Meta, Content, Links, Images, Technical, Security, Performance, Mobile, Accessibility, Schema, Structural, OpenGraph, Twitter
- **Detailed Evidence** - Each issue includes found value, expected value, impact, and code examples
- **Score & Grade** - Overall SEO score (0-100) and letter grade (A-F)
- **CLI & Shell** - Analyze pages directly from terminal
- **JSON Output** - Machine-readable output for CI/CD pipelines
- **Customizable** - Enable/disable rules, adjust thresholds

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
│  Checks: 47 pass │ 8 warn │ 2 fail │ 5 info                 │
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

## Rule Categories

### Meta Tags
| Rule | Severity | Description |
|------|----------|-------------|
| `title-exists` | error | Page must have a title tag |
| `title-length` | warning | Title should be 50-60 characters |
| `title-no-caps` | warning | Title should not be ALL CAPS |
| `meta-description-exists` | error | Page must have a meta description |
| `meta-description-length` | warning | Description should be 120-155 characters |

### OpenGraph (Social)
| Rule | Severity | Description |
|------|----------|-------------|
| `og-title-exists` | error | og:title must be defined |
| `og-description-exists` | error | og:description must be defined |
| `og-image-exists` | error | og:image must be defined |
| `og-image-https` | error | og:image URL must use HTTPS |
| `og-url-exists` | warning | og:url should be defined |
| `og-type-exists` | warning | og:type should be defined |
| `og-meta-complete` | warning | All 5 required OG tags for Meta/Facebook |

### Twitter Card
| Rule | Severity | Description |
|------|----------|-------------|
| `twitter-card-exists` | warning | twitter:card should be defined |
| `twitter-title-length` | warning | twitter:title should be 55-70 characters |
| `twitter-description-length` | warning | twitter:description max 200 characters |

### Content
| Rule | Severity | Description |
|------|----------|-------------|
| `h1-exists` | error | Page must have exactly one H1 |
| `h1-length` | warning | H1 should be 20-70 characters |
| `heading-hierarchy` | warning | Headings should not skip levels |
| `word-count` | warning | Content should have adequate word count |
| `paragraph-length` | info | Paragraphs should be readable length |

### Links
| Rule | Severity | Description |
|------|----------|-------------|
| `links-text` | warning | Links should have descriptive text |
| `links-generic-text` | warning | Avoid "click here", "read more" |
| `external-links-noopener` | warning | External links need rel="noopener" |
| `external-links-noreferrer` | info | External links should have rel="noreferrer" |

### Images
| Rule | Severity | Description |
|------|----------|-------------|
| `images-alt` | warning | Images should have alt text |
| `images-alt-length` | warning | Alt text should be descriptive (10-125 chars) |
| `images-dimensions` | warning | Images should have width/height to prevent CLS |
| `images-lazy-loading` | info | Below-fold images should use lazy loading |
| `images-modern-formats` | info | Consider using WebP/AVIF formats |

### Technical
| Rule | Severity | Description |
|------|----------|-------------|
| `canonical-exists` | warning | Page should have a canonical URL |
| `lang-exists` | warning | HTML should have lang attribute |
| `charset-exists` | warning | Page should declare UTF-8 charset |
| `robots-noindex` | warning | Check if page is set to noindex |
| `favicon-exists` | warning | Page should have a favicon |
| `url-lowercase` | warning | URLs should be lowercase |
| `url-clean` | warning | URLs should not contain special characters |

### Security
| Rule | Severity | Description |
|------|----------|-------------|
| `https` | error | Page must use HTTPS |
| `mixed-content` | error | No HTTP resources on HTTPS pages |

### Performance
| Rule | Severity | Description |
|------|----------|-------------|
| `render-blocking` | warning | Minimize render-blocking resources |
| `preconnect` | info | Use preconnect for critical third-party origins |
| `dns-prefetch` | info | Use dns-prefetch for external domains |
| `preload` | info | Preload critical resources |

### Mobile
| Rule | Severity | Description |
|------|----------|-------------|
| `viewport-exists` | error | Page must have viewport meta tag |
| `viewport-width` | warning | Viewport should include width=device-width |
| `touch-targets` | info | Touch targets should be at least 48x48px |

### Accessibility
| Rule | Severity | Description |
|------|----------|-------------|
| `buttons-aria` | warning | Buttons should have accessible names |
| `inputs-labels` | warning | Form inputs should have labels |
| `iframes-title` | warning | Iframes should have titles |
| `tables-caption` | info | Data tables should have captions |

### Schema (Structured Data)
| Rule | Severity | Description |
|------|----------|-------------|
| `jsonld-exists` | info | Page should have JSON-LD structured data |
| `jsonld-valid` | warning | JSON-LD should be valid |
| `breadcrumbs-schema` | info | Breadcrumbs should use BreadcrumbList schema |

### Structural
| Rule | Severity | Description |
|------|----------|-------------|
| `has-header` | info | Page should have `<header>` element |
| `has-main` | warning | Page should have `<main>` element |
| `has-nav` | info | Page should have `<nav>` element |
| `has-footer` | info | Page should have `<footer>` element |

## API Reference

### `analyzeSeo(html, options)`

Analyze HTML for SEO issues.

```typescript
import { analyzeSeo } from 'recker/seo';

const report = await analyzeSeo(html, {
  baseUrl: 'https://example.com',  // Required for link analysis
  responseHeaders: headers,         // Optional: HTTP response headers
  rules: {
    categories: ['meta', 'content'], // Only run specific categories
    disabled: ['title-no-caps'],     // Disable specific rules
  }
});
```

### `SeoAnalyzer` Class

For more control, use the class directly:

```typescript
import { SeoAnalyzer } from 'recker/seo';

const analyzer = await SeoAnalyzer.fromHtml(html, options);

// Get available categories
const categories = analyzer.getCategories();
// ['title', 'meta', 'og', 'twitter', 'content', 'headings', 'links', ...]

// Get rules by category
const metaRules = analyzer.getRulesByCategory('meta');

// Run analysis
const report = analyzer.analyze();
```

### Report Structure

```typescript
interface SeoReport {
  url: string;
  timestamp: Date;
  score: number;           // 0-100
  grade: string;           // A, B, C, D, F
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

interface SeoCheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail' | 'info';
  message: string;
  value?: any;
  recommendation?: string;
  evidence?: RuleEvidence;
}

interface RuleEvidence {
  found?: string;      // What was found in the HTML
  expected?: string;   // What should be there
  example?: string;    // Code example to fix the issue
  impact?: string;     // SEO impact of the issue
  learnMore?: string;  // Link to documentation
}
```

## Configuration

### Thresholds

Default thresholds can be customized:

```typescript
import { SEO_THRESHOLDS } from 'recker/seo';

// View current thresholds
console.log(SEO_THRESHOLDS.title);
// { min: 30, ideal: { min: 50, max: 60 }, max: 70 }

console.log(SEO_THRESHOLDS.metaDescription);
// { min: 50, ideal: { min: 120, max: 155 }, max: 160 }
```

### Custom Rules Engine

```typescript
import { createRulesEngine } from 'recker/seo';

const engine = createRulesEngine({
  categories: ['meta', 'og', 'twitter'],  // Only these categories
  disabled: ['og-image-url-quality'],      // Disable specific rules
});

// Get enabled rules
const rules = engine.getRules();
```

## Integration with Scraping

The SEO analyzer integrates seamlessly with Recker's scraping capabilities:

```typescript
import { createClient } from 'recker';
import { analyzeSeo } from 'recker/seo';

const client = createClient({
  headers: {
    'User-Agent': 'SEO-Bot/1.0'
  }
});

// Fetch and analyze
const response = await client.get('https://example.com');
const html = await response.text();
const headers = Object.fromEntries(response.headers.entries());

const report = await analyzeSeo(html, {
  baseUrl: 'https://example.com',
  responseHeaders: headers,
});
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
          if [ "$SCORE" -lt 70 ]; then
            echo "SEO score too low: $SCORE"
            exit 1
          fi

      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: seo-report
          path: seo-report.json
```

## Best Practices

### 1. Run Before Deploy

```bash
# In your CI pipeline
rek seo https://staging.example.com --format json > report.json

# Check minimum score
if [ $(jq '.score' report.json) -lt 80 ]; then
  echo "SEO score below threshold"
  exit 1
fi
```

### 2. Track Score Over Time

```typescript
import { analyzeSeo } from 'recker/seo';

async function trackSeo(urls: string[]) {
  const results = await Promise.all(
    urls.map(async (url) => {
      const html = await fetch(url).then(r => r.text());
      const report = await analyzeSeo(html, { baseUrl: url });
      return {
        url,
        score: report.score,
        grade: report.grade,
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

// Priority order: errors → warnings → info
const criticalIssues = report.checks.filter(c => c.status === 'fail');
const warnings = report.checks.filter(c => c.status === 'warn');

console.log(`Critical issues: ${criticalIssues.length}`);
console.log(`Warnings: ${warnings.length}`);

// Fix critical issues first
for (const issue of criticalIssues) {
  console.log(`[CRITICAL] ${issue.name}: ${issue.message}`);
  if (issue.evidence?.example) {
    console.log(`  Fix: ${issue.evidence.example}`);
  }
}
```

## Next Steps

- **[Web Scraping](14-scraping.md)** - Extract data from pages
- **[Concurrency](08-concurrency.md)** - Batch SEO analysis
- **[CLI Overview](../cli/01-overview.md)** - CLI commands

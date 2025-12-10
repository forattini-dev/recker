# SEO Analysis

Comprehensive SEO analysis toolkit with **250+ checks across 22 categories**, site-wide crawling, and AI-first optimization.

## Features

- **250+ SEO Rules** - The most comprehensive SEO checker available
- **22 Categories** - From basic meta tags to AI search optimization
- **Site-Wide Analysis** - Spider crawls entire sites detecting duplicates and orphan pages
- **AI-First SEO** - llms.txt support, GPTBot/Anthropic detection, question headings
- **Request Timing** - Full timing waterfall (DNS, TCP, TLS, TTFB, Download)
- **Detailed Evidence** - Each issue includes found value, expected value, impact, and code examples
- **Score & Grade** - Weighted SEO score (0-100) and letter grade (A-F)
- **CLI & Shell** - Analyze pages directly from terminal
- **JSON Output** - Machine-readable output for CI/CD pipelines
- **Validators** - robots.txt, sitemap.xml, llms.txt parsing and validation

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

# Focus modes
rek seo https://example.com --focus ai        # AI optimization only
rek seo https://example.com --focus security  # Security headers only
rek seo https://example.com --focus links     # Link analysis only
```

### Interactive Shell

```bash
# Start shell
rek shell

# Run SEO analysis
seo https://example.com

# JSON output
seo https://example.com --format json

# Spider with SEO
spider https://example.com seo=true depth=3
```

## Rule Categories (22)

| Category | Description |
|----------|-------------|
| `meta` | Title, description, keywords, author, robots |
| `content` | H1, headings hierarchy, word count, structure |
| `links` | Anchor text, noopener/noreferrer, broken links |
| `images` | Alt text, dimensions, lazy loading, formats |
| `technical` | Canonical, charset, viewport, lang, favicon |
| `security` | HTTPS, CSP, HSTS, X-Frame-Options, COOP/COEP |
| `performance` | Preconnect, dns-prefetch, preload, async/defer |
| `mobile` | Viewport, touch targets, responsive images |
| `accessibility` | ARIA, button labels, heading order, skip links |
| `schema` | JSON-LD, breadcrumbs, rich snippets |
| `structural` | Semantic HTML: header, main, nav, footer |
| `i18n` | Hreflang, language codes, x-default |
| `pwa` | Web manifest, theme color, service worker |
| `social` | OpenGraph, Twitter Card, image dimensions |
| `ecommerce` | Product schema, price, availability, reviews |
| `local` | LocalBusiness schema, NAP, opening hours |
| `cwv` | LCP, CLS, FID optimization hints |
| `readability` | Flesch score, sentence length, complexity |
| `crawl` | Robots.txt, sitemap, crawl budget |
| `internal-linking` | Link ratio, anchor diversity, orphan pages |
| `best-practices` | DOCTYPE, charset position, HTTP status |
| **`ai-search`** | llms.txt, GPTBot, question headings, semantic HTML |

## Documentation

- **[Analyzer](02-analyzer.md)** - Core analyzer API and options
- **[Spider](03-spider.md)** - Site-wide crawling with SEO analysis
- **[AI Search](04-ai-search.md)** - AI-first SEO optimization and llms.txt
- **[Validators](05-validators.md)** - robots.txt, sitemap.xml, llms.txt
- **[Rule Categories](06-categories.md)** - All 22 categories in detail
- **[CI/CD Integration](07-cicd.md)** - GitHub Actions, thresholds, automation

# SEO Rule Categories

Recker's SEO analyzer includes **400+ rules** organized into **19 categories**. Each category focuses on a specific aspect of SEO optimization.

## Category Overview

| # | Category | Rules | Description |
|---|----------|-------|-------------|
| 1 | `meta` | 15+ | Title, description, keywords, robots |
| 2 | `content` | 20+ | Word count, headings, structure |
| 3 | `links` | 15+ | Anchor text, noopener, broken links |
| 4 | `images` | 12+ | Alt text, dimensions, lazy loading |
| 5 | `technical` | 18+ | Canonical, charset, viewport, lang |
| 6 | `security` | 15+ | HTTPS, CSP, HSTS, X-Frame-Options |
| 7 | `performance` | 12+ | Preconnect, preload, async/defer |
| 8 | `mobile` | 8+ | Viewport, touch targets, responsive |
| 9 | `accessibility` | 15+ | ARIA, labels, heading order |
| 10 | `schema` | 12+ | JSON-LD, breadcrumbs, rich snippets |
| 11 | `structural` | 8+ | Semantic HTML: header, main, nav |
| 12 | `i18n` | 10+ | Hreflang, language codes, x-default |
| 13 | `pwa` | 6+ | Manifest, theme color, service worker |
| 14 | `social` | 12+ | OpenGraph, Twitter Card |
| 15 | `ecommerce` | 10+ | Product schema, price, availability |
| 16 | `local` | 8+ | LocalBusiness, NAP, hours |
| 17 | `cwv` | 10+ | LCP, CLS, FID optimization hints |
| 18 | `readability` | 6+ | Flesch score, sentence length |
| 19 | `crawl` | 8+ | Robots.txt, sitemap, crawl budget |
| 20 | `internal-linking` | 8+ | Link ratio, anchor diversity |
| 21 | `best-practices` | 10+ | DOCTYPE, charset position |
| 22 | `ai-search` | 15+ | llms.txt, GPTBot, question headings |

## Meta (`meta`)

Controls how search engines display your page in results.

| Rule | Severity | Description |
|------|----------|-------------|
| `title-exists` | error | Page must have a title |
| `title-length` | warning | Title should be 50-60 chars |
| `title-unique` | warning | Each page needs unique title |
| `meta-description-exists` | warning | Add meta description |
| `meta-description-length` | warning | Description 150-160 chars |
| `meta-keywords` | info | Keywords tag (low value) |
| `meta-robots` | info | Check robots meta directives |
| `meta-author` | info | Author meta tag |

```typescript
// Focus on meta only
const report = await analyzeSeo(html, {
  rules: { categories: ['meta'] }
});
```

## Content (`content`)

Analyzes the quality and structure of page content.

| Rule | Severity | Description |
|------|----------|-------------|
| `h1-exists` | error | Page must have H1 |
| `h1-count` | warning | Only one H1 per page |
| `h1-length` | warning | H1 length 20-70 chars |
| `heading-hierarchy` | warning | No skipped heading levels |
| `word-count-minimum` | warning | Minimum 300 words |
| `paragraph-length` | info | Optimal paragraph length |
| `content-formatting` | info | Use lists, bold, emphasis |
| `keyword-density` | info | Avoid keyword stuffing |

## Links (`links`)

Ensures links are properly configured for SEO and security.

| Rule | Severity | Description |
|------|----------|-------------|
| `links-have-text` | error | All links need anchor text |
| `noopener-noreferrer` | warning | External links security |
| `generic-anchor-text` | warning | Avoid "click here", "read more" |
| `internal-links-exist` | warning | Page should have internal links |
| `external-links-exist` | info | External links show authority |
| `sponsored-rel` | info | Mark sponsored links |
| `ugc-rel` | info | Mark user-generated links |

## Images (`images`)

Optimizes images for SEO and performance.

| Rule | Severity | Description |
|------|----------|-------------|
| `images-have-alt` | error | All images need alt text |
| `alt-not-empty` | warning | Alt shouldn't be empty string |
| `alt-length` | warning | Alt text 10-125 chars |
| `images-have-dimensions` | warning | Set width/height for CLS |
| `lazy-loading` | info | Use loading="lazy" |
| `modern-formats` | info | Use WebP/AVIF |
| `async-decoding` | info | Use decoding="async" |
| `descriptive-filenames` | info | Use descriptive image names |

## Technical (`technical`)

Core technical SEO requirements.

| Rule | Severity | Description |
|------|----------|-------------|
| `canonical-exists` | warning | Add canonical URL |
| `canonical-valid` | warning | Canonical must be valid URL |
| `charset-exists` | warning | Define character encoding |
| `charset-position` | info | Charset in first 1024 bytes |
| `viewport-exists` | warning | Mobile viewport required |
| `lang-attribute` | warning | HTML lang attribute |
| `favicon-exists` | info | Add favicon |
| `doctype-html5` | info | Use HTML5 doctype |

## Security (`security`)

HTTP security headers and HTTPS configuration.

| Rule | Severity | Description |
|------|----------|-------------|
| `https` | error | Site must use HTTPS |
| `mixed-content` | error | No HTTP resources on HTTPS |
| `hsts` | warning | Strict-Transport-Security |
| `csp` | warning | Content-Security-Policy |
| `x-frame-options` | warning | Prevent clickjacking |
| `x-content-type-options` | info | nosniff header |
| `referrer-policy` | info | Control referrer |
| `permissions-policy` | info | Feature policy |

## Performance (`performance`)

Resource loading optimization hints.

| Rule | Severity | Description |
|------|----------|-------------|
| `preconnect-hints` | info | Preconnect to origins |
| `dns-prefetch` | info | DNS prefetch hints |
| `preload-critical` | info | Preload critical resources |
| `async-defer-scripts` | warning | Non-blocking scripts |
| `render-blocking` | warning | Minimize render-blocking |
| `inline-css-limit` | info | Limit inline CSS |
| `inline-js-limit` | info | Limit inline JavaScript |

## Mobile (`mobile`)

Mobile-friendliness checks.

| Rule | Severity | Description |
|------|----------|-------------|
| `viewport-meta` | error | Proper viewport meta |
| `viewport-width` | warning | width=device-width |
| `touch-targets` | info | Adequate tap target size |
| `font-size-legible` | info | Readable font sizes |
| `horizontal-scroll` | warning | No horizontal scrolling |

## Accessibility (`accessibility`)

Basic accessibility checks relevant to SEO.

| Rule | Severity | Description |
|------|----------|-------------|
| `buttons-have-labels` | warning | Buttons need text/aria-label |
| `links-have-labels` | warning | Icon links need aria-label |
| `inputs-have-labels` | warning | Form inputs need labels |
| `iframes-have-title` | warning | Iframes need title |
| `skip-link` | info | Skip to main content |
| `focus-visible` | info | Visible focus indicators |

## Schema (`schema`)

Structured data validation.

| Rule | Severity | Description |
|------|----------|-------------|
| `json-ld-exists` | info | Has structured data |
| `json-ld-valid` | warning | Valid JSON-LD syntax |
| `schema-type` | info | Has Schema.org @type |
| `breadcrumb-schema` | info | BreadcrumbList schema |
| `article-schema` | info | Article/BlogPosting schema |
| `organization-schema` | info | Organization schema |

## Structural (`structural`)

Semantic HTML5 structure.

| Rule | Severity | Description |
|------|----------|-------------|
| `has-main` | warning | Use main element |
| `has-header` | info | Use header element |
| `has-footer` | info | Use footer element |
| `has-nav` | info | Use nav element |
| `has-article` | info | Use article for content |
| `semantic-ratio` | info | Semantic HTML percentage |

## I18n (`i18n`)

Internationalization and localization.

| Rule | Severity | Description |
|------|----------|-------------|
| `hreflang-exists` | info | Declare language versions |
| `hreflang-valid` | warning | Valid language codes |
| `hreflang-x-default` | info | Include x-default |
| `hreflang-self-reference` | warning | Self-referencing hreflang |
| `og-locale` | info | OpenGraph locale |

## PWA (`pwa`)

Progressive Web App requirements.

| Rule | Severity | Description |
|------|----------|-------------|
| `manifest-exists` | info | Web app manifest |
| `theme-color` | info | Theme color meta |
| `apple-touch-icon` | info | iOS icon |
| `service-worker` | info | Service worker reference |

## Social (`social`)

Social media sharing optimization.

| Rule | Severity | Description |
|------|----------|-------------|
| `og-title` | warning | OpenGraph title |
| `og-description` | warning | OpenGraph description |
| `og-image` | warning | OpenGraph image |
| `og-url` | info | OpenGraph canonical URL |
| `og-type` | info | OpenGraph type |
| `twitter-card` | warning | Twitter Card type |
| `twitter-title` | info | Twitter title |
| `twitter-image` | info | Twitter image |

## E-commerce (`ecommerce`)

Product and e-commerce schema.

| Rule | Severity | Description |
|------|----------|-------------|
| `product-schema` | info | Product structured data |
| `product-price` | warning | Price in schema |
| `product-availability` | info | Stock availability |
| `product-reviews` | info | Review/rating schema |
| `offer-schema` | info | Offer details |

## Local (`local`)

Local business optimization.

| Rule | Severity | Description |
|------|----------|-------------|
| `local-business-schema` | info | LocalBusiness schema |
| `address-schema` | warning | Address in schema |
| `phone-schema` | info | Phone number |
| `opening-hours` | info | Business hours |
| `geo-coordinates` | info | Location coordinates |

## Core Web Vitals (`cwv`)

Performance hints for Core Web Vitals.

| Rule | Severity | Description |
|------|----------|-------------|
| `lcp-hints` | info | LCP optimization hints |
| `cls-prevention` | warning | Prevent layout shifts |
| `fid-optimization` | info | Interaction optimization |
| `lazy-lcp` | warning | Don't lazy-load LCP |
| `priority-hints` | info | fetchpriority usage |

## Readability (`readability`)

Content readability analysis.

| Rule | Severity | Description |
|------|----------|-------------|
| `flesch-reading-ease` | info | Readability score |
| `sentence-length` | info | Average sentence length |
| `paragraph-length` | info | Paragraph word count |
| `complex-words` | info | Simple language usage |

## Crawl (`crawl`)

Crawler access and indexing.

| Rule | Severity | Description |
|------|----------|-------------|
| `robots-txt-exists` | warning | robots.txt present |
| `robots-not-blocking` | error | Not blocking crawlers |
| `sitemap-reference` | info | Sitemap in robots.txt |
| `crawl-depth` | info | Page crawl depth |

## Internal Linking (`internal-linking`)

Internal link structure analysis.

| Rule | Severity | Description |
|------|----------|-------------|
| `internal-link-count` | warning | Sufficient internal links |
| `orphan-page` | warning | Not an orphan page |
| `anchor-diversity` | info | Varied anchor text |
| `deep-links` | info | Links to deep pages |

## Best Practices (`best-practices`)

General SEO best practices.

| Rule | Severity | Description |
|------|----------|-------------|
| `doctype` | warning | Valid DOCTYPE |
| `url-structure` | info | Clean URL structure |
| `url-length` | info | Reasonable URL length |
| `lowercase-urls` | info | Lowercase URLs preferred |
| `trailing-slash` | info | Consistent trailing slashes |

## AI Search (`ai-search`)

AI and LLM optimization.

| Rule | Severity | Description |
|------|----------|-------------|
| `llms-txt-exists` | info | llms.txt file present |
| `llms-txt-structure` | info | Valid llms.txt format |
| `gptbot-access` | info | GPTBot crawler access |
| `anthropic-access` | info | Claude crawler access |
| `question-headings` | info | Question-based headings |
| `content-depth` | info | Comprehensive content |
| `semantic-html-ratio` | info | Semantic HTML usage |
| `structured-data-ai` | info | AI-helpful schema types |

## Using Categories

### Filter by Single Category

```typescript
const report = await analyzeSeo(html, {
  rules: { categories: ['meta'] }
});
```

### Filter by Multiple Categories

```typescript
const report = await analyzeSeo(html, {
  rules: { categories: ['meta', 'content', 'links', 'images'] }
});
```

### Get Available Categories

```typescript
const analyzer = await SeoAnalyzer.fromHtml(html);
const categories = analyzer.getCategories();
console.log(categories);
// ['meta', 'content', 'links', 'images', ...]
```

### Get Rules by Category

```typescript
const analyzer = await SeoAnalyzer.fromHtml(html);
const metaRules = analyzer.getRulesByCategory('meta');
console.log(`Meta category has ${metaRules.length} rules`);
```

## Next Steps

- **[CI/CD](07-cicd.md)** - Automate SEO checks in pipelines
- **[Analyzer](02-analyzer.md)** - Core analyzer API
- **[AI Search](04-ai-search.md)** - AI optimization details

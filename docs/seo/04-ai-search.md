# AI Search Optimization

Recker includes comprehensive support for optimizing content for AI-powered search engines like ChatGPT, Perplexity, Claude, and Google's AI Overviews.

## llms.txt Standard

The [llms.txt](https://llmstxt.org/) specification provides a standardized way to help AI systems understand your website.

### Parsing llms.txt

```typescript
import { parseLlmsTxt, validateLlmsTxt, fetchAndValidateLlmsTxt } from 'recker/seo';

// Parse existing content
const content = `# My Site
> A comprehensive guide to web development

## Docs
- [Getting Started](/docs/start): Begin your journey
- [API Reference](/docs/api): Full API documentation

## About
- [About Us](/about): Learn about our team
`;

const parsed = parseLlmsTxt(content);
console.log(parsed.siteName);       // "My Site"
console.log(parsed.siteDescription); // "A comprehensive guide..."
console.log(parsed.sections);        // [{title: "Docs", ...}, ...]
console.log(parsed.links);           // All extracted links
```

### Validating llms.txt

```typescript
const validation = validateLlmsTxt(content, 'https://example.com');

if (!validation.valid) {
  for (const issue of validation.issues) {
    console.log(`[${issue.type}] ${issue.message}`);
    if (issue.recommendation) {
      console.log(`  → ${issue.recommendation}`);
    }
  }
}
```

### Fetching from URL

```typescript
const result = await fetchAndValidateLlmsTxt('https://example.com');

if (result.exists) {
  console.log('llms.txt found!');
  console.log(`Site: ${result.parseResult.siteName}`);
  console.log(`Links: ${result.parseResult.links.length}`);

  if (result.fullVersionExists) {
    console.log('llms-full.txt also available');
  }
} else {
  console.log('No llms.txt found');
}
```

### Generating llms.txt

```typescript
import { generateLlmsTxtTemplate } from 'recker/seo';

const template = generateLlmsTxtTemplate({
  siteName: 'My Documentation',
  siteDescription: 'Comprehensive guides and API references for developers',
  sections: [
    {
      title: 'Documentation',
      links: [
        { text: 'Getting Started', url: '/docs/quickstart', description: 'Begin here' },
        { text: 'API Reference', url: '/docs/api', description: 'Full API docs' },
      ]
    },
    {
      title: 'Resources',
      links: [
        { text: 'Examples', url: '/examples' },
        { text: 'GitHub', url: 'https://github.com/org/repo' },
      ]
    }
  ]
});

console.log(template);
// # My Documentation
//
// > Comprehensive guides and API references for developers
//
// ## Documentation
//
// - [Getting Started](/docs/quickstart): Begin here
// - [API Reference](/docs/api): Full API docs
//
// ## Resources
//
// - [Examples](/examples)
// - [GitHub](https://github.com/org/repo)
```

## AI Search Rules

The analyzer includes 15+ rules specific to AI search optimization:

| Rule | Description |
|------|-------------|
| `ai-llms-txt-exists` | Check if llms.txt file exists |
| `ai-llms-txt-structure` | Validate llms.txt structure |
| `ai-content-structure` | Check heading hierarchy for AI comprehension |
| `ai-question-headings` | Detect question-based headings (What, How, Why) |
| `ai-structured-data` | Verify AI-helpful Schema.org types |
| `ai-faq-schema` | Check for FAQ/HowTo/QA schema |
| `ai-content-depth` | Ensure sufficient content depth (300+ words) |
| `ai-content-freshness` | Check for freshness signals (dates) |
| `ai-robots-gpt-bot` | Check if GPTBot is allowed/blocked |
| `ai-robots-anthropic` | Check if Anthropic crawler is allowed/blocked |
| `ai-content-last-modified` | Check content age |
| `ai-page-too-long` | Warn if page is too long for AI processing |
| `semantic-html-ratio` | Check semantic HTML element usage |

## Focus Mode: AI

Run only AI-related checks:

```typescript
import { analyzeSeo } from 'recker/seo';

const report = await analyzeSeo(html, {
  baseUrl: 'https://example.com',
  rules: {
    categories: ['ai-search']
  }
});

// Or via CLI
// rek seo https://example.com --focus ai
```

## AI Crawler Detection

Check how your site treats AI crawlers in robots.txt:

```typescript
import { parseRobotsTxt, isPathAllowed } from 'recker/seo';

const robotsTxt = await fetch('https://example.com/robots.txt').then(r => r.text());
const parsed = parseRobotsTxt(robotsTxt);

// Check specific AI crawlers
const crawlers = ['GPTBot', 'anthropic-ai', 'ClaudeBot', 'Google-Extended'];

for (const crawler of crawlers) {
  const allowed = isPathAllowed(parsed, '/', crawler);
  console.log(`${crawler}: ${allowed ? '✅ Allowed' : '❌ Blocked'}`);
}
```

## Best Practices for AI Search

### 1. Create llms.txt

Place at `https://yoursite.com/llms.txt`:

```markdown
# Your Site Name

> A brief description of what your site offers (50-200 characters)

## Documentation
- [Quick Start](/docs/quickstart): Get up and running in 5 minutes
- [API Reference](/docs/api): Complete API documentation

## About
- [About Us](/about): Our mission and team
- [Contact](/contact): Get in touch
```

### 2. Use Question-Based Headings

```html
<h2>What is SEO?</h2>
<p>SEO stands for Search Engine Optimization...</p>

<h2>How do I improve my SEO score?</h2>
<p>To improve your SEO score, follow these steps...</p>

<h2>Why is mobile optimization important?</h2>
<p>Mobile optimization is crucial because...</p>
```

### 3. Add FAQ Schema

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "What is SEO?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "SEO stands for Search Engine Optimization..."
    }
  }]
}
</script>
```

### 4. Use Semantic HTML

```html
<article>
  <header>
    <h1>Main Title</h1>
    <time datetime="2024-01-15">January 15, 2024</time>
  </header>

  <main>
    <section>
      <h2>Introduction</h2>
      <p>...</p>
    </section>

    <section>
      <h2>Details</h2>
      <p>...</p>
    </section>
  </main>

  <footer>
    <p>Written by Author Name</p>
  </footer>
</article>
```

### 5. Control AI Crawler Access

In `robots.txt`:

```
# Allow all AI crawlers (default)
User-agent: *
Allow: /

# Or block specific AI crawlers
User-agent: GPTBot
Disallow: /private/

User-agent: anthropic-ai
Disallow: /private/

# Block all AI crawlers from specific content
User-agent: GPTBot
User-agent: anthropic-ai
User-agent: Google-Extended
Disallow: /copyrighted-content/
```

## Checking AI Readiness

```typescript
import { analyzeSeo } from 'recker/seo';

const report = await analyzeSeo(html, {
  baseUrl: 'https://example.com',
  rules: { categories: ['ai-search'] }
});

// Get AI-specific results
const aiChecks = report.checks;
const passed = aiChecks.filter(c => c.status === 'pass').length;
const total = aiChecks.length;

console.log(`AI Readiness: ${passed}/${total} checks passed`);

// Key metrics for AI
console.log(`Word Count: ${report.content.wordCount}`);
console.log(`Question Headings: ${report.content.hasQuestionHeadings ? 'Yes' : 'No'}`);
console.log(`Structured Data: ${report.structuredData.types.join(', ') || 'None'}`);
```

## CLI Usage

```bash
# Full AI analysis
rek seo https://example.com --focus ai

# Check llms.txt
rek seo https://example.com/llms.txt

# Spider with AI focus
rek spider https://example.com seo=true --focus ai
```

## Next Steps

- **[Validators](05-validators.md)** - Full validation for robots.txt, sitemap.xml, llms.txt
- **[Categories](06-categories.md)** - All 22 rule categories explained
- **[CI/CD](07-cicd.md)** - Automate AI readiness checks

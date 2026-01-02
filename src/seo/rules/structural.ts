import { SeoRule, createResult } from './types.js';
import { SEO_THRESHOLDS } from './thresholds.js';

export const structuralRules: SeoRule[] = [
  {
    id: 'h1-exists',
    name: 'H1 Exists',
    category: 'headings',
    severity: 'error',
    description: 'Page must have exactly one H1 heading',
    check: (ctx) => {
      if (ctx.h1Count === undefined) {
        return createResult(
          { id: 'h1-exists', name: 'H1 Tag', category: 'headings', severity: 'error' },
          'info',
          'Unable to check H1 (data unavailable)',
          { recommendation: 'Ensure HTML content is properly parsed' }
        );
      }
      if (ctx.h1Count === 0) {
        return createResult(
          { id: 'h1-exists', name: 'H1 Tag', category: 'headings', severity: 'error' },
          'fail',
          'Missing H1 heading',
          {
            recommendation: 'Add a single H1 heading. It should be the main headline and include your primary keyword.',
            evidence: {
              found: 'No H1 tags detected on the page',
              expected: 'Exactly one <h1> tag',
              impact: 'The H1 tag is the most important heading for SEO. It tells search engines and users what the main topic of the page is. Pages without an H1 have poor semantic structure and may rank lower.',
              example: '<h1>Your Main Page Title Here</h1>'
            }
          }
        );
      }
      if (ctx.h1Count > 1) {
        return createResult(
          { id: 'h1-exists', name: 'H1 Tag', category: 'headings', severity: 'error' },
          'warn',
          `Multiple H1 tags (${ctx.h1Count} found)`,
          {
            value: ctx.h1Count,
            recommendation: 'Use only one H1 per page to clearly signal the main topic.',
            evidence: {
              found: `${ctx.h1Count} H1 tags on the page`,
              expected: 'Exactly one <h1> tag',
              impact: 'Multiple H1 tags dilute the main topic signal and confuse search engines about which heading is the primary page title. This can hurt topical relevance and rankings.',
              example: '<h1>Main Title</h1>\n<!-- Use H2 for subtopics instead -->\n<h2>Subtopic One</h2>\n<h2>Subtopic Two</h2>'
            }
          }
        );
      }
      return createResult(
        { id: 'h1-exists', name: 'H1 Tag', category: 'headings', severity: 'error' },
        'pass',
        'Single H1 tag present'
      );
    },
  },
  {
    id: 'h1-length',
    name: 'H1 Length',
    category: 'headings',
    severity: 'warning',
    description: 'H1 should be 20-70 characters',
    check: (ctx) => {
      if (!ctx.h1Text) {
        return createResult(
          { id: 'h1-length', name: 'H1 Length', category: 'headings', severity: 'warning' },
          'info',
          'No H1 text to analyze',
          { recommendation: 'First add an H1 heading to the page' }
        );
      }
      const len = ctx.h1Length ?? ctx.h1Text.length;
      const { minLength, maxLength } = SEO_THRESHOLDS.headings.h1;

      if (len < minLength) {
        return createResult(
          { id: 'h1-length', name: 'H1 Length', category: 'headings', severity: 'warning' },
          'warn',
          `H1 too short (${len} chars, min: ${minLength})`,
          {
            value: len,
            recommendation: `Expand H1 to at least ${minLength} characters`,
            evidence: {
              found: `H1 with ${len} characters: "${ctx.h1Text}"`,
              expected: `${minLength}-${maxLength} characters`,
              impact: 'Very short H1 tags may not provide enough context for search engines and users to understand the page topic. Descriptive H1s improve relevance signals and click-through rates.',
              example: '<h1>Complete Guide to SEO Best Practices</h1>'
            }
          }
        );
      }
      if (len > maxLength) {
        return createResult(
          { id: 'h1-length', name: 'H1 Length', category: 'headings', severity: 'warning' },
          'warn',
          `H1 too long (${len} chars, max: ${maxLength})`,
          {
            value: len,
            recommendation: `Shorten H1 to under ${maxLength} characters`,
            evidence: {
              found: `H1 with ${len} characters: "${ctx.h1Text}"`,
              expected: `${minLength}-${maxLength} characters`,
              impact: 'Overly long H1 tags can be truncated in search results and may appear unfocused. Concise H1s are more scannable and effective for both users and search engines.',
              example: '<h1>SEO Guide: On-Page Optimization Tips</h1>'
            }
          }
        );
      }
      return createResult(
        { id: 'h1-length', name: 'H1 Length', category: 'headings', severity: 'warning' },
        'pass',
        `H1 length OK (${len} chars)`,
        { value: len }
      );
    },
  },
  {
    id: 'heading-hierarchy',
    name: 'Heading Hierarchy',
    category: 'headings',
    severity: 'warning',
    description: 'Headings should follow sequential order (H1 → H2 → H3)',
    check: (ctx) => {
      if (ctx.headingHierarchyValid === undefined) {
        return createResult(
          { id: 'heading-hierarchy', name: 'Heading Hierarchy', category: 'headings', severity: 'warning' },
          'info',
          'Unable to check heading hierarchy (data unavailable)',
          { recommendation: 'Ensure heading analysis completed' }
        );
      }
      if (!ctx.headingHierarchyValid) {
        const skipped = ctx.headingSkippedLevels?.join(', ') || 'unknown';
        return createResult(
          { id: 'heading-hierarchy', name: 'Heading Hierarchy', category: 'headings', severity: 'warning' },
          'warn',
          `Heading levels are skipped (${skipped})`,
          {
            recommendation: 'Use sequential heading levels (H1 → H2 → H3)',
            evidence: {
              found: `Skipped heading levels: ${skipped}`,
              expected: 'Sequential heading structure (H1 → H2 → H3 → H4, etc.)',
              impact: 'Skipping heading levels disrupts the document outline and can confuse screen readers and search engine crawlers trying to understand content hierarchy. This weakens accessibility and semantic structure.',
              example: '<h1>Main Title</h1>\n<h2>Section Title</h2>\n<h3>Subsection Title</h3>\n<!-- Do NOT skip from H1 to H3 -->'
            }
          }
        );
      }
      return createResult(
        { id: 'heading-hierarchy', name: 'Heading Hierarchy', category: 'headings', severity: 'warning' },
        'pass',
        'Heading structure is correct'
      );
    },
  },
  {
    id: 'h2-count',
    name: 'H2 Count',
    category: 'headings',
    severity: 'info',
    description: 'Page should have 2-8 H2 headings for good structure',
    check: (ctx) => {
      if (ctx.h2Count === undefined) {
        return createResult(
          { id: 'h2-count', name: 'H2 Count', category: 'headings', severity: 'info' },
          'info',
          'Unable to check H2 count (data unavailable)',
          { recommendation: 'Ensure heading analysis completed' }
        );
      }
      const { min, max } = SEO_THRESHOLDS.headings.h2;

      if (ctx.h2Count < min) {
        return createResult(
          { id: 'h2-count', name: 'H2 Count', category: 'headings', severity: 'info' },
          'info',
          `Few H2 headings (${ctx.h2Count})`,
          {
            value: ctx.h2Count,
            recommendation: `Consider adding more H2 headings for better structure (${min}-${max} ideal)`,
            evidence: {
              found: `${ctx.h2Count} H2 headings`,
              expected: `${min}-${max} H2 headings for optimal content structure`,
              impact: 'Few H2 headings may indicate lack of content structure. Well-organized content with clear sections improves readability and helps search engines understand topic coverage.',
              example: '<h2>Introduction</h2>\n<p>...</p>\n<h2>Main Topic</h2>\n<p>...</p>\n<h2>Conclusion</h2>'
            }
          }
        );
      }
      if (ctx.h2Count > max) {
        return createResult(
          { id: 'h2-count', name: 'H2 Count', category: 'headings', severity: 'info' },
          'info',
          `Many H2 headings (${ctx.h2Count})`,
          {
            value: ctx.h2Count,
            recommendation: 'Consider consolidating sections or using H3 for subsections',
            evidence: {
              found: `${ctx.h2Count} H2 headings`,
              expected: `${min}-${max} H2 headings for optimal structure`,
              impact: 'Too many H2 headings can fragment content and make it harder for users and search engines to identify the main topics. Consider grouping related sections.',
              example: '<h2>Main Section</h2>\n<h3>Subsection A</h3>\n<h3>Subsection B</h3>'
            }
          }
        );
      }
      return createResult(
        { id: 'h2-count', name: 'H2 Count', category: 'headings', severity: 'info' },
        'pass',
        `Good H2 count (${ctx.h2Count})`,
        { value: ctx.h2Count }
      );
    },
  },
  {
    id: 'html5-header-exists',
    name: 'HTML5 Header',
    category: 'technical',
    severity: 'info',
    description: 'Page should use a <header> element',
    check: (ctx) => {
      if (!ctx.hasHeader) {
        return createResult(
          { id: 'html5-header-exists', name: 'HTML5 Header', category: 'technical', severity: 'info' },
          'info',
          'Missing <header> element',
          {
            recommendation: 'Use <header> for site-wide or page-specific introductory content',
            evidence: {
              found: 'No <header> element detected',
              expected: '<header> element wrapping logo, navigation, and intro content',
              impact: 'The <header> element provides semantic meaning to screen readers and search engines. It clearly identifies the introductory content area, improving accessibility and document structure.',
              example: '<header>\n  <nav>...</nav>\n  <h1>Site Title</h1>\n</header>'
            }
          }
        );
      }
      return createResult(
        { id: 'html5-header-exists', name: 'HTML5 Header', category: 'technical', severity: 'info' },
        'pass',
        'HTML5 <header> element present'
      );
    },
  },
  {
    id: 'html5-nav-exists',
    name: 'HTML5 Navigation',
    category: 'technical',
    severity: 'info',
    description: 'Page should use a <nav> element for navigation links',
    check: (ctx) => {
      if (!ctx.hasNav) {
        return createResult(
          { id: 'html5-nav-exists', name: 'HTML5 Navigation', category: 'technical', severity: 'info' },
          'info',
          'Missing <nav> element',
          {
            recommendation: 'Use <nav> to define a block of navigation links',
            evidence: {
              found: 'No <nav> element detected',
              expected: '<nav> element wrapping main navigation links',
              impact: 'The <nav> element helps screen readers identify navigation sections and allows users to skip directly to content. It also helps search engines understand site structure.',
              example: '<nav aria-label="Main navigation">\n  <ul>\n    <li><a href="/">Home</a></li>\n    <li><a href="/about">About</a></li>\n  </ul>\n</nav>'
            }
          }
        );
      }
      return createResult(
        { id: 'html5-nav-exists', name: 'HTML5 Navigation', category: 'technical', severity: 'info' },
        'pass',
        'HTML5 <nav> element present'
      );
    },
  },
  {
    id: 'html5-main-exists',
    name: 'HTML5 Main Content',
    category: 'technical',
    severity: 'info',
    description: 'Page should use a <main> element for the dominant content',
    check: (ctx) => {
      if (!ctx.hasMain) {
        return createResult(
          { id: 'html5-main-exists', name: 'HTML5 Main Content', category: 'technical', severity: 'info' },
          'info',
          'Missing <main> element',
          {
            recommendation: 'Use <main> to enclose the dominant content of the <body>',
            evidence: {
              found: 'No <main> element detected',
              expected: 'Single <main> element containing the primary page content',
              impact: 'The <main> element is crucial for accessibility. Screen readers use it to skip directly to content. There should be only one visible <main> per page.',
              example: '<main>\n  <h1>Page Title</h1>\n  <article>...</article>\n</main>'
            }
          }
        );
      }
      return createResult(
        { id: 'html5-main-exists', name: 'HTML5 Main Content', category: 'technical', severity: 'info' },
        'pass',
        'HTML5 <main> element present'
      );
    },
  },
  {
    id: 'html5-article-exists',
    name: 'HTML5 Article',
    category: 'technical',
    severity: 'info',
    description: 'Consider using <article> for independent, self-contained content',
    check: (ctx) => {
      if (!ctx.hasArticle && ctx.wordCount && ctx.wordCount > 500) { // Suggest if long content
        return createResult(
          { id: 'html5-article-exists', name: 'HTML5 Article', category: 'technical', severity: 'info' },
          'info',
          'Missing <article> element for substantial content',
          {
            recommendation: 'Consider using <article> for blog posts, news articles, etc.',
            evidence: {
              found: `${ctx.wordCount} words of content without <article> wrapper`,
              expected: '<article> element for self-contained, distributable content',
              impact: 'The <article> element indicates content that could stand alone (like a blog post or product). It helps search engines identify the main content and can improve rich snippet eligibility.',
              example: '<article>\n  <h2>Article Title</h2>\n  <time datetime="2024-01-15">January 15, 2024</time>\n  <p>Article content...</p>\n</article>'
            }
          }
        );
      }
      return createResult(
        { id: 'html5-article-exists', name: 'HTML5 Article', category: 'technical', severity: 'info' },
        'pass',
        'HTML5 <article> element present or not required'
      );
    },
  },
  {
    id: 'html5-section-exists',
    name: 'HTML5 Section',
    category: 'technical',
    severity: 'info',
    description: 'Consider using <section> for thematic grouping of content',
    check: (ctx) => {
      if (!ctx.hasSection && (ctx.h2Count && ctx.h2Count > 1)) { // Suggest if multiple H2s exist
        return createResult(
          { id: 'html5-section-exists', name: 'HTML5 Section', category: 'technical', severity: 'info' },
          'info',
          'Missing <section> element for content grouping',
          {
            recommendation: 'Consider using <section> to group related content, usually with a heading',
            evidence: {
              found: `${ctx.h2Count} H2 headings without <section> wrappers`,
              expected: '<section> elements to group thematically related content',
              impact: 'Using <section> elements creates a clear document outline and helps assistive technologies understand content organization. Each section should typically have a heading.',
              example: '<section>\n  <h2>Features</h2>\n  <p>Feature description...</p>\n</section>\n<section>\n  <h2>Pricing</h2>\n  <p>Pricing info...</p>\n</section>'
            }
          }
        );
      }
      return createResult(
        { id: 'html5-section-exists', name: 'HTML5 Section', category: 'technical', severity: 'info' },
        'pass',
        'HTML5 <section> element present or not required'
      );
    },
  },
  {
    id: 'html5-footer-exists',
    name: 'HTML5 Footer',
    category: 'technical',
    severity: 'info',
    description: 'Page should use a <footer> element',
    check: (ctx) => {
      if (!ctx.hasFooter) {
        return createResult(
          { id: 'html5-footer-exists', name: 'HTML5 Footer', category: 'technical', severity: 'info' },
          'info',
          'Missing <footer> element',
          {
            recommendation: 'Use <footer> for site-wide or page-specific footer content',
            evidence: {
              found: 'No <footer> element detected',
              expected: '<footer> element containing copyright, links, and contact info',
              impact: 'The <footer> element provides semantic meaning for the closing content area. It helps screen readers identify footer regions and is commonly used for legal links, contact info, and copyright.',
              example: '<footer>\n  <p>&copy; 2024 Company Name</p>\n  <nav>\n    <a href="/privacy">Privacy</a>\n    <a href="/terms">Terms</a>\n  </nav>\n</footer>'
            }
          }
        );
      }
      return createResult(
        { id: 'html5-footer-exists', name: 'HTML5 Footer', category: 'technical', severity: 'info' },
        'pass',
        'HTML5 <footer> element present'
      );
    },
  },
  {
    id: 'keywords-in-h1',
    name: 'Keywords in H1',
    category: 'headings',
    severity: 'warning',
    description: 'H1 should contain main keywords',
    check: (ctx) => {
      if (ctx.keywordsInH1 === false && ctx.topKeywords && ctx.topKeywords.length > 0) {
        return createResult(
          { id: 'keywords-in-h1', name: 'Keywords in H1', category: 'headings', severity: 'warning' },
          'warn',
          'H1 does not appear to contain top keywords',
          {
            recommendation: 'Ensure your H1 tag includes your main target keyword naturally.',
            evidence: {
              found: `H1: "${ctx.h1Text}"`,
              expected: `Should contain one of: ${ctx.topKeywords.join(', ')}`,
              impact: 'Keywords in H1 confirm relevance to the user and search engines. The H1 should naturally include your primary target keyword to reinforce the page topic and improve rankings for that term.',
              example: `<h1>Complete Guide to ${ctx.topKeywords?.[0] || 'Your Primary Keyword'}</h1>`
            }
          }
        );
      }
      return createResult(
        { id: 'keywords-in-h1', name: 'Keywords in H1', category: 'headings', severity: 'warning' },
        'pass',
        'Keywords present in H1'
      );
    },
  },
];

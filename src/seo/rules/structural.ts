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
          { recommendation: 'Add a single H1 heading. It should be the main headline and include your primary keyword.' }
        );
      }
      if (ctx.h1Count > 1) {
        return createResult(
          { id: 'h1-exists', name: 'H1 Tag', category: 'headings', severity: 'error' },
          'warn',
          `Multiple H1 tags (${ctx.h1Count} found)`,
          { value: ctx.h1Count, recommendation: 'Use only one H1 per page to clearly signal the main topic.' }
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
          { value: len, recommendation: `Expand H1 to at least ${minLength} characters` }
        );
      }
      if (len > maxLength) {
        return createResult(
          { id: 'h1-length', name: 'H1 Length', category: 'headings', severity: 'warning' },
          'warn',
          `H1 too long (${len} chars, max: ${maxLength})`,
          { value: len, recommendation: `Shorten H1 to under ${maxLength} characters` }
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
          { recommendation: 'Use sequential heading levels (H1 → H2 → H3)' }
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
          { value: ctx.h2Count, recommendation: `Consider adding more H2 headings for better structure (${min}-${max} ideal)` }
        );
      }
      if (ctx.h2Count > max) {
        return createResult(
          { id: 'h2-count', name: 'H2 Count', category: 'headings', severity: 'info' },
          'info',
          `Many H2 headings (${ctx.h2Count})`,
          { value: ctx.h2Count, recommendation: 'Consider consolidating sections' }
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
          { recommendation: 'Use <header> for site-wide or page-specific introductory content' }
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
          { recommendation: 'Use <nav> to define a block of navigation links' }
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
          { recommendation: 'Use <main> to enclose the dominant content of the <body>' }
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
          { recommendation: 'Consider using <article> for blog posts, news articles, etc.' }
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
          { recommendation: 'Consider using <section> to group related content, usually with a heading' }
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
          { recommendation: 'Use <footer> for site-wide or page-specific footer content' }
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
              impact: 'Keywords in H1 confirm relevance to the user and search engines.'
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

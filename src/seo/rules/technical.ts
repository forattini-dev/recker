import { SeoRule, createResult } from './types.js';
import { SEO_THRESHOLDS } from './thresholds.js';

export const technicalRules: SeoRule[] = [
  {
    id: 'canonical-exists',
    name: 'Canonical URL',
    category: 'technical',
    severity: 'warning',
    description: 'Page should have a canonical URL',
    check: (ctx) => {
      if (!ctx.hasCanonical) {
        return createResult(
          { id: 'canonical-exists', name: 'Canonical URL', category: 'technical', severity: 'warning' },
          'warn',
          'No canonical URL defined',
          { recommendation: 'Add <link rel="canonical" href="..."> to prevent duplicate content' }
        );
      }
      return createResult(
        { id: 'canonical-exists', name: 'Canonical URL', category: 'technical', severity: 'warning' },
        'pass',
        'Canonical URL is defined',
        { value: ctx.canonicalUrl }
      );
    },
  },
  {
    id: 'lang-exists',
    name: 'Language',
    category: 'technical',
    severity: 'warning',
    description: 'HTML should have lang attribute',
    check: (ctx) => {
      if (!ctx.hasLang) {
        return createResult(
          { id: 'lang-exists', name: 'Language', category: 'technical', severity: 'warning' },
          'warn',
          'Missing lang attribute on <html>',
          { recommendation: 'Add lang attribute: <html lang="en">' }
        );
      }
      return createResult(
        { id: 'lang-exists', name: 'Language', category: 'technical', severity: 'warning' },
        'pass',
        `Language attribute set (${ctx.langValue})`
      );
    },
  },
  {
    id: 'charset-exists',
    name: 'Charset',
    category: 'technical',
    severity: 'warning',
    description: 'Page should declare character encoding',
    check: (ctx) => {
      if (!ctx.hasCharset) {
        return createResult(
          { id: 'charset-exists', name: 'Charset', category: 'technical', severity: 'warning' },
          'warn',
          'Missing charset declaration',
          { recommendation: 'Add <meta charset="UTF-8"> in <head>' }
        );
      }
      if (ctx.charset && ctx.charset.toLowerCase() !== 'utf-8') {
        return createResult(
          { id: 'charset-exists', name: 'Charset', category: 'technical', severity: 'warning' },
          'warn',
          `Non-UTF-8 charset: ${ctx.charset}`,
          { recommendation: 'Use UTF-8 charset for best compatibility' }
        );
      }
      return createResult(
        { id: 'charset-exists', name: 'Charset', category: 'technical', severity: 'warning' },
        'pass',
        'UTF-8 charset declared'
      );
    },
  },
  {
    id: 'robots-noindex',
    name: 'Robots Noindex',
    category: 'technical',
    severity: 'warning',
    description: 'Check if page is set to noindex',
    check: (ctx) => {
      if (!ctx.metaRobots || ctx.metaRobots.length === 0) return null;
      
      if (ctx.metaRobots.includes('noindex')) {
        return createResult(
          { id: 'robots-noindex', name: 'Robots', category: 'technical', severity: 'warning' },
          'warn',
          'Page is set to noindex',
          { value: ctx.metaRobots.join(', '), recommendation: 'Remove noindex if you want the page to be indexed' }
        );
      }
      return createResult(
        { id: 'robots-noindex', name: 'Robots', category: 'technical', severity: 'info' },
        'info',
        `Robots meta: ${ctx.metaRobots.join(', ')}`
      );
    },
  },
  {
    id: 'favicon-exists',
    name: 'Favicon',
    category: 'technical',
    severity: 'warning',
    description: 'Page should have a favicon defined',
    check: (ctx) => {
      if (!ctx.hasFavicon) {
        return createResult(
          { id: 'favicon-exists', name: 'Favicon', category: 'technical', severity: 'warning' },
          'warn',
          'No favicon defined',
          { recommendation: 'Add <link rel="icon" href="/favicon.ico"> for browser tab icon' }
        );
      }
      return createResult(
        { id: 'favicon-exists', name: 'Favicon', category: 'technical', severity: 'warning' },
        'pass',
        'Favicon is defined',
        { value: ctx.faviconUrl }
      );
    },
  },
  // URL Rules
  {
    id: 'url-lowercase',
    name: 'URL Lowercase',
    category: 'technical',
    severity: 'warning',
    description: 'URLs should be lowercase for consistency',
    check: (ctx) => {
      if (ctx.urlHasUppercase) {
        return createResult(
          { id: 'url-lowercase', name: 'URL Lowercase', category: 'technical', severity: 'warning' },
          'warn',
          'URL contains uppercase characters',
          { recommendation: 'Use lowercase URLs for better SEO consistency' }
        );
      }
      return null;
    },
  },
  {
    id: 'url-clean',
    name: 'URL Clean',
    category: 'technical',
    severity: 'warning',
    description: 'URLs should not contain special characters or accents',
    check: (ctx) => {
      if (ctx.urlHasAccents || ctx.urlHasSpecialChars) {
        const issues = [];
        if (ctx.urlHasAccents) issues.push('accents');
        if (ctx.urlHasSpecialChars) issues.push('special characters');
        return createResult(
          { id: 'url-clean', name: 'URL Clean', category: 'technical', severity: 'warning' },
          'warn',
          `URL contains ${issues.join(' and ')}`,
          { recommendation: 'Use clean URLs without accents or special characters' }
        );
      }
      return null;
    },
  },
  {
    id: 'url-no-params',
    name: 'URL Parameters',
    category: 'technical',
    severity: 'warning',
    description: 'URLs should not contain query parameters',
    check: (ctx) => {
      if (!ctx.url) return null;
      try {
        const urlObj = new URL(ctx.url);
        if (urlObj.search && urlObj.search.length > 1) {
          return createResult(
            { id: 'url-no-params', name: 'URL Parameters', category: 'technical', severity: 'warning' },
            'warn',
            'URL contains query parameters',
            { value: urlObj.search, recommendation: 'Use clean URLs (rewritten paths) without query parameters' }
          );
        }
      } catch {
        // invalid url
      }
      return null;
    },
  },
  {
    id: 'technical-meta-robots-directives',
    name: 'Meta Robots Directives',
    category: 'technical',
    severity: 'warning',
    description: 'Check for restrictive meta robots directives like noindex, nofollow, noarchive etc.',
    check: (ctx) => {
      if (!ctx.metaRobots || ctx.metaRobots.length === 0) return null;

      const restrictiveDirectives = ['noindex', 'nofollow', 'noarchive', 'nosnippet', 'noimageindex'];
      const foundRestrictive = ctx.metaRobots.filter(directive => restrictiveDirectives.includes(directive));

      if (foundRestrictive.length > 0) {
        return createResult(
          { id: 'technical-meta-robots-directives', name: 'Meta Robots Directives', category: 'technical', severity: 'warning' },
          'warn',
          `Restrictive meta robots directives found: ${foundRestrictive.join(', ')}`,
          { recommendation: 'Ensure these directives are intentional to prevent unintended blocking of indexing or crawling.' }
        );
      }
      return null;
    },
  },
  {
    id: 'technical-x-robots-tag',
    name: 'X-Robots-Tag Header',
    category: 'technical',
    severity: 'info',
    description: 'X-Robots-Tag header can be used to control indexing, especially for non-HTML content.',
    check: (ctx) => {
      if (!ctx.responseHeaders) return null;
      const xRobotsTag = ctx.responseHeaders['x-robots-tag'] || ctx.responseHeaders['X-Robots-Tag'];
      if (xRobotsTag) {
        return createResult(
          { id: 'technical-x-robots-tag', name: 'X-Robots-Tag Header', category: 'technical', severity: 'info' },
          'info',
          `X-Robots-Tag header found: ${xRobotsTag}`,
          { recommendation: 'Ensure X-Robots-Tag directives (e.g., noindex) are intentional.' }
        );
      }
      return null;
    },
  },
  {
    id: 'technical-trust-signals',
    name: 'Trust Signals (Links)',
    category: 'technical',
    severity: 'info',
    description: 'Presence of links to "About", "Contact", "Privacy Policy", "Terms of Service" pages builds trust.',
    check: (ctx) => {
      const missingSignals = [];
      if (!ctx.hasAboutPageLink) missingSignals.push('About Page');
      if (!ctx.hasContactPageLink) missingSignals.push('Contact Page');
      if (!ctx.hasPrivacyPolicyLink) missingSignals.push('Privacy Policy');
      if (!ctx.hasTermsOfServiceLink) missingSignals.push('Terms of Service');

      if (missingSignals.length > 0) {
        return createResult(
          { id: 'technical-trust-signals', name: 'Trust Signals (Links)', category: 'technical', severity: 'info' },
          'info',
          `Missing links to key trust pages: ${missingSignals.join(', ')}`,
          { recommendation: 'Add clear links to "About Us", "Contact", "Privacy Policy", and "Terms of Service" pages to build user and search engine trust.' }
        );
      }
      return null;
    },
  },
  {
    id: 'technical-text-html-ratio',
    name: 'Text/HTML Ratio',
    category: 'technical',
    severity: 'info',
    description: 'A higher text to HTML ratio indicates more content relative to code, which is good for SEO.',
    check: (ctx) => {
      if (ctx.textHtmlRatio === undefined) return null;

      const threshold = 15; // Target at least 15% text content
      if (ctx.textHtmlRatio < threshold) {
        return createResult(
          { id: 'technical-text-html-ratio', name: 'Text/HTML Ratio', category: 'technical', severity: 'info' },
          'warn',
          `Low Text/HTML ratio: ${ctx.textHtmlRatio.toFixed(2)}% (target > ${threshold}%)`,
          { recommendation: 'Increase text content relative to HTML code. Reduce unnecessary markup, or add more textual content.' }
        );
      }
      return null;
    },
  },
  {
    id: 'technical-robots-txt-hint',
    name: 'Robots.txt Hint',
    category: 'technical',
    severity: 'info',
    description: 'Ensure a robots.txt file exists at the root of the domain to guide crawlers.',
    check: (ctx) => {
      // This rule is a hint as robots.txt existence cannot be checked from single HTML analysis.
      // It assumes external check or user awareness.
      // Could be integrated with network requests later if analyzer has that capability.
      return createResult(
        { id: 'technical-robots-txt-hint', name: 'Robots.txt Hint', category: 'technical', severity: 'info' },
        'info',
        'Robots.txt existence cannot be verified from HTML alone.',
        { recommendation: 'Ensure a valid `robots.txt` file is present at your domain root (e.g., `https://example.com/robots.txt`) to guide search engine crawlers and define your sitemap location.' }
      );
    },
  },

  // ==========================================================================
  // Too Many URL Parameters
  // ==========================================================================
  {
    id: 'url-many-parameters',
    name: 'Too Many URL Parameters',
    category: 'technical',
    severity: 'warning',
    description: 'URLs should not have more than 3 query parameters',
    check: (ctx) => {
      if (!ctx.url) return null;

      try {
        const url = new URL(ctx.url);
        const paramCount = Array.from(url.searchParams.keys()).length;

        if (paramCount > 3) {
          return createResult(
            { id: 'url-many-parameters', name: 'Too Many URL Parameters', category: 'technical', severity: 'warning' },
            'warn',
            `URL has ${paramCount} query parameters`,
            {
              value: paramCount,
              recommendation: 'Reduce URL parameters to 3 or fewer for better crawlability',
              evidence: {
                found: url.search,
                expected: '3 or fewer parameters',
                impact: 'Multiple parameters make URLs less enticing and may cause indexing issues'
              }
            }
          );
        }
      } catch {
        // Invalid URL
      }

      return null;
    },
  },

  // ==========================================================================
  // Deprecated Plugins (Flash, Java, Silverlight)
  // ==========================================================================
  {
    id: 'deprecated-plugins',
    name: 'Deprecated Plugins',
    category: 'technical',
    severity: 'error',
    description: 'Pages should not use Flash, Java Applets, or Silverlight',
    check: (ctx) => {
      if (ctx.hasDeprecatedPlugins === undefined) return null;

      if (ctx.hasDeprecatedPlugins) {
        return createResult(
          { id: 'deprecated-plugins', name: 'Deprecated Plugins', category: 'technical', severity: 'error' },
          'fail',
          'Page uses deprecated plugins (Flash, Java, or Silverlight)',
          {
            recommendation: 'Convert plugin content to HTML5',
            evidence: {
              found: ctx.deprecatedPluginTypes?.join(', ') || 'Flash/Java/Silverlight detected',
              expected: 'No deprecated plugins',
              impact: 'These plugins do not work on mobile devices and cannot be crawled properly',
              learnMore: 'https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing'
            }
          }
        );
      }

      return null;
    },
  },

  // ==========================================================================
  // Frame Tags
  // ==========================================================================
  {
    id: 'frame-tags',
    name: 'Frame Tags',
    category: 'technical',
    severity: 'error',
    description: 'Pages should not use <frame> or <frameset> tags',
    check: (ctx) => {
      if (ctx.hasFrameTags === undefined) return null;

      if (ctx.hasFrameTags) {
        return createResult(
          { id: 'frame-tags', name: 'Frame Tags', category: 'technical', severity: 'error' },
          'fail',
          'Page uses <frame> or <frameset> tags',
          {
            recommendation: 'Remove frame tags and restructure using modern HTML',
            evidence: {
              found: '<frame> or <frameset> tags detected',
              expected: 'No frame tags',
              impact: 'Search engines have difficulty indexing content within frames, affecting rankings'
            }
          }
        );
      }

      return null;
    },
  },
];

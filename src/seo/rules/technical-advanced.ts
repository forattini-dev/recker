/**
 * Advanced Technical SEO Rules
 * Issues from Semrush/Screaming Frog that weren't covered before
 */

import { SeoRule, RuleContext, createResult } from './types.js';

export const technicalAdvancedRules: SeoRule[] = [
  // ==========================================================================
  // Meta Refresh
  // ==========================================================================
  {
    id: 'meta-refresh-redirect',
    name: 'Meta Refresh Redirect',
    category: 'technical',
    severity: 'warning',
    description: 'Pages should not use meta refresh redirects',
    check: (ctx) => {
      if (!ctx.metaRefresh) {
        return createResult(
          { id: 'meta-refresh-redirect', name: 'Meta Refresh Redirect', category: 'technical', severity: 'warning' },
          'info',
          'Not applicable (no meta refresh detected)',
          { recommendation: 'This rule checks for meta refresh redirects which can impact SEO' }
        );
      }

      const { delay, url } = ctx.metaRefresh;

      if (url) {
        // Redirect to another URL
        return createResult(
          { id: 'meta-refresh-redirect', name: 'Meta Refresh Redirect', category: 'technical', severity: 'warning' },
          delay === 0 ? 'warn' : 'fail',
          `Page uses meta refresh redirect (${delay}s delay)`,
          {
            value: delay,
            recommendation: 'Use HTTP 301/302 redirects instead of meta refresh for SEO',
            evidence: {
              found: `<meta http-equiv="refresh" content="${delay};url=${url}">`,
              expected: 'HTTP 301/302 redirect',
              impact: delay > 0
                ? 'Meta refresh with delay confuses users and search engines'
                : 'Meta refresh redirects are not as SEO-friendly as HTTP redirects',
              learnMore: 'https://developers.google.com/search/docs/crawling-indexing/http-network-errors#meta-refresh'
            }
          }
        );
      } else if (delay > 0) {
        // Auto-refresh same page
        return createResult(
          { id: 'meta-refresh-redirect', name: 'Meta Refresh Redirect', category: 'technical', severity: 'warning' },
          'warn',
          `Page auto-refreshes every ${delay} seconds`,
          {
            value: delay,
            recommendation: 'Avoid auto-refresh; let users control when to refresh content',
            evidence: {
              found: `<meta http-equiv="refresh" content="${delay}">`,
              expected: 'No auto-refresh',
              impact: 'Auto-refresh can be disorienting and wastes bandwidth'
            }
          }
        );
      }

      return createResult(
        { id: 'meta-refresh-redirect', name: 'Meta Refresh Redirect', category: 'technical', severity: 'warning' },
        'info',
        'Not applicable (no meta refresh detected)',
        { recommendation: 'This rule checks for meta refresh redirects which can impact SEO' }
      );
    },
  },

  // ==========================================================================
  // Page Size
  // ==========================================================================
  {
    id: 'html-page-size',
    name: 'HTML Page Size',
    category: 'performance',
    severity: 'warning',
    description: 'HTML page should not exceed reasonable size limits',
    check: (ctx) => {
      if (ctx.htmlSize === undefined) {
        return createResult(
          { id: 'html-page-size', name: 'HTML Page Size', category: 'performance', severity: 'warning' },
          'info',
          'Not applicable (HTML size data unavailable)',
          { recommendation: 'This rule checks if HTML size is within recommended limits for optimal performance' }
        );
      }

      const sizeKb = ctx.htmlSize / 1024;
      const sizeMb = sizeKb / 1024;

      // Critical: >2MB
      if (sizeMb > 2) {
        return createResult(
          { id: 'html-page-size', name: 'HTML Page Size', category: 'performance', severity: 'warning' },
          'fail',
          `HTML size ${sizeMb.toFixed(2)}MB exceeds 2MB limit`,
          {
            value: ctx.htmlSize,
            recommendation: 'Reduce HTML size by removing inline scripts/styles and optimizing content',
            evidence: {
              found: `${sizeMb.toFixed(2)}MB`,
              expected: '<2MB',
              impact: 'Very large HTML files slow down crawling and may not be fully indexed'
            }
          }
        );
      }

      // Warning: >500KB
      if (sizeKb > 500) {
        return createResult(
          { id: 'html-page-size', name: 'HTML Page Size', category: 'performance', severity: 'warning' },
          'warn',
          `HTML size ${sizeKb.toFixed(0)}KB is large`,
          {
            value: ctx.htmlSize,
            recommendation: 'Consider reducing HTML size for faster page loads',
            evidence: {
              found: `${sizeKb.toFixed(0)}KB`,
              expected: '<500KB',
              impact: 'Large HTML files increase time to first meaningful paint'
            }
          }
        );
      }

      return createResult(
        { id: 'html-page-size', name: 'HTML Page Size', category: 'performance', severity: 'warning' },
        'pass',
        `HTML size ${sizeKb.toFixed(0)}KB is acceptable`
      );
    },
  },

  // ==========================================================================
  // Total Page Size
  // ==========================================================================
  {
    id: 'total-page-size',
    name: 'Total Page Size',
    category: 'performance',
    severity: 'warning',
    description: 'Total page weight should be optimized for performance',
    check: (ctx) => {
      if (ctx.totalPageSize === undefined) {
        return createResult(
          { id: 'total-page-size', name: 'Total Page Size', category: 'performance', severity: 'warning' },
          'info',
          'Not applicable (total page size data unavailable)',
          { recommendation: 'This rule checks total page weight including all resources for optimal load time' }
        );
      }

      const sizeMb = ctx.totalPageSize / (1024 * 1024);

      // Critical: >5MB
      if (sizeMb > 5) {
        return createResult(
          { id: 'total-page-size', name: 'Total Page Size', category: 'performance', severity: 'warning' },
          'fail',
          `Total page size ${sizeMb.toFixed(2)}MB exceeds 5MB`,
          {
            value: ctx.totalPageSize,
            recommendation: 'Optimize images, defer scripts, and reduce overall page weight',
            evidence: {
              found: `${sizeMb.toFixed(2)}MB`,
              expected: '<5MB',
              impact: 'Very large pages significantly impact mobile users and Core Web Vitals'
            }
          }
        );
      }

      // Warning: >3MB
      if (sizeMb > 3) {
        return createResult(
          { id: 'total-page-size', name: 'Total Page Size', category: 'performance', severity: 'warning' },
          'warn',
          `Total page size ${sizeMb.toFixed(2)}MB is large`,
          {
            value: ctx.totalPageSize,
            recommendation: 'Consider optimizing resources to improve load times',
            evidence: {
              found: `${sizeMb.toFixed(2)}MB`,
              expected: '<3MB',
              impact: 'Large pages increase bounce rate, especially on mobile'
            }
          }
        );
      }

      return createResult(
        { id: 'total-page-size', name: 'Total Page Size', category: 'performance', severity: 'warning' },
        'pass',
        `Total page size ${sizeMb.toFixed(2)}MB is acceptable`
      );
    },
  },

  // ==========================================================================
  // Response Time
  // ==========================================================================
  {
    id: 'server-response-time',
    name: 'Server Response Time',
    category: 'performance',
    severity: 'warning',
    description: 'Server should respond within acceptable time limits',
    check: (ctx) => {
      const ttfb = ctx.timings?.ttfb;
      if (ttfb === undefined) {
        return createResult(
          { id: 'server-response-time', name: 'Server Response Time', category: 'performance', severity: 'warning' },
          'info',
          'Not applicable (TTFB timing data unavailable)',
          { recommendation: 'This rule checks server response time (TTFB) for performance optimization' }
        );
      }

      // Critical: >5s
      if (ttfb > 5000) {
        return createResult(
          { id: 'server-response-time', name: 'Server Response Time', category: 'performance', severity: 'warning' },
          'fail',
          `TTFB ${(ttfb / 1000).toFixed(2)}s exceeds 5s`,
          {
            value: ttfb,
            recommendation: 'Investigate server performance, caching, and database queries',
            evidence: {
              found: `${(ttfb / 1000).toFixed(2)}s`,
              expected: '<5s',
              impact: 'Very slow server response leads to timeout errors and poor UX'
            }
          }
        );
      }

      // Warning: >2s
      if (ttfb > 2000) {
        return createResult(
          { id: 'server-response-time', name: 'Server Response Time', category: 'performance', severity: 'warning' },
          'warn',
          `TTFB ${(ttfb / 1000).toFixed(2)}s is slow`,
          {
            value: ttfb,
            recommendation: 'Optimize server response time for better Core Web Vitals',
            evidence: {
              found: `${(ttfb / 1000).toFixed(2)}s`,
              expected: '<2s (ideally <600ms)',
              impact: 'Slow server response negatively affects LCP and user experience'
            }
          }
        );
      }

      return createResult(
        { id: 'server-response-time', name: 'Server Response Time', category: 'performance', severity: 'warning' },
        'pass',
        `TTFB ${ttfb}ms is good`
      );
    },
  },

  // ==========================================================================
  // URL Validation
  // ==========================================================================
  {
    id: 'url-length',
    name: 'URL Length',
    category: 'technical',
    severity: 'warning',
    description: 'URLs should not be excessively long',
    check: (ctx) => {
      if (!ctx.url) {
        return createResult(
          { id: 'url-length', name: 'URL Length', category: 'technical', severity: 'warning' },
          'info',
          'Not applicable (URL data unavailable)',
          { recommendation: 'This rule checks URL length to ensure it is within recommended limits' }
        );
      }

      const length = ctx.url.length;

      // Critical: >2000 characters (browser limit)
      if (length > 2000) {
        return createResult(
          { id: 'url-length', name: 'URL Length', category: 'technical', severity: 'warning' },
          'fail',
          `URL length ${length} chars exceeds browser limits`,
          {
            value: length,
            recommendation: 'Shorten URL to under 2000 characters',
            evidence: {
              found: `${length} characters`,
              expected: '<2000 characters',
              impact: 'URLs over 2000 characters may be truncated or rejected by browsers'
            }
          }
        );
      }

      // Warning: >200 characters (SEO best practice)
      if (length > 200) {
        return createResult(
          { id: 'url-length', name: 'URL Length', category: 'technical', severity: 'warning' },
          'warn',
          `URL length ${length} chars is long`,
          {
            value: length,
            recommendation: 'Consider using shorter, cleaner URLs for SEO',
            evidence: {
              found: `${length} characters`,
              expected: '<200 characters for best SEO',
              impact: 'Long URLs are harder to share and may be truncated in SERPs'
            }
          }
        );
      }

      return createResult(
        { id: 'url-length', name: 'URL Length', category: 'technical', severity: 'warning' },
        'pass',
        `URL length ${length} chars is acceptable`
      );
    },
  },

  {
    id: 'url-special-chars',
    name: 'URL Special Characters',
    category: 'technical',
    severity: 'warning',
    description: 'URLs should not contain problematic special characters',
    check: (ctx) => {
      if (!ctx.url) {
        return createResult(
          { id: 'url-special-chars', name: 'URL Special Characters', category: 'technical', severity: 'warning' },
          'info',
          'Not applicable (URL data unavailable)',
          { recommendation: 'This rule checks for problematic special characters in URLs' }
        );
      }

      try {
        const urlObj = new URL(ctx.url);
        const path = urlObj.pathname + urlObj.search;

        const issues: string[] = [];

        // Check for uppercase (best practice)
        if (/[A-Z]/.test(path)) {
          issues.push('uppercase letters');
        }

        // Check for spaces (encoded or not)
        if (path.includes(' ') || path.includes('%20')) {
          issues.push('spaces');
        }

        // Check for underscores (hyphens preferred)
        if (path.includes('_')) {
          issues.push('underscores (use hyphens)');
        }

        // Check for multiple consecutive slashes
        if (/\/\//.test(path)) {
          issues.push('double slashes');
        }

        // Check for accented characters
        if (/[àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/i.test(decodeURIComponent(path))) {
          issues.push('accented characters');
        }

        if (issues.length > 0) {
          return createResult(
            { id: 'url-special-chars', name: 'URL Special Characters', category: 'technical', severity: 'warning' },
            'warn',
            `URL contains: ${issues.join(', ')}`,
            {
              recommendation: 'Use lowercase letters, hyphens, and avoid special characters',
              evidence: {
                found: issues,
                expected: 'Lowercase letters, numbers, hyphens only',
                impact: 'Non-standard URL characters can cause crawling and indexing issues'
              }
            }
          );
        }

        return createResult(
          { id: 'url-special-chars', name: 'URL Special Characters', category: 'technical', severity: 'warning' },
          'pass',
          'URL uses clean, SEO-friendly characters'
        );
      } catch {
        return createResult(
          { id: 'url-special-chars', name: 'URL Special Characters', category: 'technical', severity: 'warning' },
          'fail',
          'Invalid URL syntax',
          {
            recommendation: 'Fix URL syntax',
            evidence: {
              found: ctx.url,
              expected: 'Valid URL',
              impact: 'Invalid URLs cannot be crawled or indexed'
            }
          }
        );
      }
    },
  },

  // ==========================================================================
  // Password Security on HTTP
  // ==========================================================================
  {
    id: 'password-on-http',
    name: 'Password Fields on HTTP',
    category: 'security',
    severity: 'error',
    description: 'Pages with password fields must use HTTPS',
    check: (ctx) => {
      if (!ctx.hasPasswordField || ctx.isHttps === undefined) {
        return createResult(
          { id: 'password-on-http', name: 'Password Fields on HTTP', category: 'security', severity: 'error' },
          'info',
          'Not applicable (no password fields detected)',
          { recommendation: 'This rule ensures password fields are served over HTTPS for security' }
        );
      }

      if (ctx.hasPasswordField && !ctx.isHttps) {
        return createResult(
          { id: 'password-on-http', name: 'Password Fields on HTTP', category: 'security', severity: 'error' },
          'fail',
          'Password field detected on non-HTTPS page',
          {
            recommendation: 'Serve login/registration pages over HTTPS only',
            evidence: {
              found: '<input type="password"> on HTTP',
              expected: 'HTTPS for all pages with password fields',
              impact: 'User credentials can be intercepted in transit',
              learnMore: 'https://web.dev/is-on-https/'
            }
          }
        );
      }

      return createResult(
        { id: 'password-on-http', name: 'Password Fields on HTTP', category: 'security', severity: 'error' },
        'pass',
        'Password field properly served over HTTPS'
      );
    },
  },

  // ==========================================================================
  // Forms on HTTP
  // ==========================================================================
  {
    id: 'forms-on-http',
    name: 'Forms on HTTP',
    category: 'security',
    severity: 'warning',
    description: 'Forms should submit data over HTTPS',
    check: (ctx) => {
      if (ctx.formsOnHttp === undefined) {
        return createResult(
          { id: 'forms-on-http', name: 'Forms on HTTP', category: 'security', severity: 'warning' },
          'info',
          'Not applicable (form data unavailable)',
          { recommendation: 'This rule checks if forms submit data over secure HTTPS connections' }
        );
      }

      if (ctx.formsOnHttp > 0) {
        return createResult(
          { id: 'forms-on-http', name: 'Forms on HTTP', category: 'security', severity: 'warning' },
          'warn',
          `${ctx.formsOnHttp} form(s) submit to HTTP URLs`,
          {
            value: ctx.formsOnHttp,
            recommendation: 'Update form actions to use HTTPS URLs',
            evidence: {
              found: ctx.formsOnHttp,
              expected: 0,
              impact: 'Form data submitted over HTTP can be intercepted'
            }
          }
        );
      }

      return createResult(
        { id: 'forms-on-http', name: 'Forms on HTTP', category: 'security', severity: 'warning' },
        'pass',
        'All forms submit over HTTPS or no forms detected'
      );
    },
  },
];

// ==========================================================================
// Extended Context for Advanced Rules
// ==========================================================================

declare module './types.js' {
  interface RuleContext {
    // Meta refresh tag info
    metaRefresh?: {
      delay: number;
      url?: string;
    };
  }
}

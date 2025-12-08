/**
 * SEO Best Practices Rules
 * Lighthouse-aligned general best practices checks
 */

import { SeoRule, createResult } from './types.js';

export const bestPracticesRules: SeoRule[] = [
  // ==========================================================================
  // General
  // ==========================================================================
  {
    id: 'bp-deprecated-apis',
    name: 'Deprecated APIs',
    category: 'technical',
    severity: 'warning',
    description: 'Page should not use deprecated APIs',
    check: (ctx) => {
      if (ctx.deprecatedApisCount === undefined) return null;
      const count = ctx.deprecatedApisCount;
      if (count > 0) {
        return createResult(
          { id: 'bp-deprecated-apis', name: 'Deprecated APIs', category: 'technical', severity: 'warning' },
          'warn',
          `${count} deprecated API(s) detected`,
          {
            value: count,
            recommendation: 'Update code to use modern APIs instead of deprecated ones',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Deprecated APIs may be removed in future browser versions',
              learnMore: 'https://web.dev/deprecations/',
            },
          }
        );
      }
      return createResult(
        { id: 'bp-deprecated-apis', name: 'Deprecated APIs', category: 'technical', severity: 'warning' },
        'pass',
        'No deprecated APIs used'
      );
    },
  },
  {
    id: 'bp-third-party-cookies',
    name: 'Third-Party Cookies',
    category: 'security',
    severity: 'warning',
    description: 'Page should minimize third-party cookies',
    check: (ctx) => {
      if (ctx.thirdPartyCookiesCount === undefined) return null;
      const count = ctx.thirdPartyCookiesCount;
      if (count > 50) {
        return createResult(
          { id: 'bp-third-party-cookies', name: 'Third-Party Cookies', category: 'security', severity: 'warning' },
          'warn',
          `${count} third-party cookies found`,
          {
            value: count,
            recommendation: 'Third-party cookies are being phased out. Migrate to privacy-preserving alternatives',
            evidence: {
              found: count,
              expected: 'Minimal third-party cookies',
              impact: 'Privacy concerns and future browser restrictions',
              learnMore: 'https://web.dev/samesite-cookies-explained/',
            },
          }
        );
      }
      if (count > 0) {
        return createResult(
          { id: 'bp-third-party-cookies', name: 'Third-Party Cookies', category: 'security', severity: 'warning' },
          'info',
          `${count} third-party cookie(s) found`,
          { value: count }
        );
      }
      return createResult(
        { id: 'bp-third-party-cookies', name: 'Third-Party Cookies', category: 'security', severity: 'warning' },
        'pass',
        'No third-party cookies detected'
      );
    },
  },
  {
    id: 'bp-console-errors',
    name: 'Console Errors',
    category: 'technical',
    severity: 'warning',
    description: 'No browser errors should be logged to the console',
    check: (ctx) => {
      if (ctx.consoleErrorsCount === undefined) return null;
      const count = ctx.consoleErrorsCount;
      if (count > 0) {
        return createResult(
          { id: 'bp-console-errors', name: 'Console Errors', category: 'technical', severity: 'warning' },
          'warn',
          `${count} browser error(s) logged to console`,
          {
            value: count,
            recommendation: 'Fix JavaScript errors to ensure proper functionality',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Console errors may indicate broken functionality',
            },
          }
        );
      }
      return createResult(
        { id: 'bp-console-errors', name: 'Console Errors', category: 'technical', severity: 'warning' },
        'pass',
        'No browser errors logged to console'
      );
    },
  },
  {
    id: 'bp-source-maps',
    name: 'Source Maps',
    category: 'technical',
    severity: 'info',
    description: 'Page should have valid source maps for debugging',
    check: (ctx) => {
      if (ctx.hasSourceMaps === undefined) return null;
      if (ctx.invalidSourceMaps && ctx.invalidSourceMaps > 0) {
        return createResult(
          { id: 'bp-source-maps', name: 'Source Maps', category: 'technical', severity: 'info' },
          'info',
          `${ctx.invalidSourceMaps} invalid source map(s) found`,
          {
            value: ctx.invalidSourceMaps,
            recommendation: 'Ensure source maps are valid and accessible',
            evidence: {
              found: ctx.invalidSourceMaps,
              expected: 0,
              impact: 'Invalid source maps make debugging more difficult',
            },
          }
        );
      }
      return createResult(
        { id: 'bp-source-maps', name: 'Source Maps', category: 'technical', severity: 'info' },
        'pass',
        'Source maps are valid'
      );
    },
  },
  {
    id: 'bp-js-libraries',
    name: 'JavaScript Libraries',
    category: 'technical',
    severity: 'info',
    description: 'Detected JavaScript libraries and frameworks',
    check: (ctx) => {
      if (ctx.detectedJsLibraries === undefined || ctx.detectedJsLibraries.length === 0) return null;
      const libs = ctx.detectedJsLibraries;
      return createResult(
        { id: 'bp-js-libraries', name: 'JavaScript Libraries', category: 'technical', severity: 'info' },
        'info',
        `Detected: ${libs.join(', ')}`,
        {
          evidence: {
            found: libs,
            impact: 'Ensure libraries are up-to-date and necessary',
          },
        }
      );
    },
  },
  {
    id: 'bp-vulnerable-libraries',
    name: 'Vulnerable Libraries',
    category: 'security',
    severity: 'error',
    description: 'Page should not include JavaScript libraries with known vulnerabilities',
    check: (ctx) => {
      if (ctx.vulnerableLibrariesCount === undefined) return null;
      const count = ctx.vulnerableLibrariesCount;
      if (count > 0) {
        return createResult(
          { id: 'bp-vulnerable-libraries', name: 'Vulnerable Libraries', category: 'security', severity: 'error' },
          'fail',
          `${count} JavaScript library(ies) with known vulnerabilities`,
          {
            value: count,
            recommendation: 'Update or replace libraries with known security vulnerabilities',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Security vulnerabilities can be exploited by attackers',
              learnMore: 'https://snyk.io/vuln/',
            },
          }
        );
      }
      return createResult(
        { id: 'bp-vulnerable-libraries', name: 'Vulnerable Libraries', category: 'security', severity: 'error' },
        'pass',
        'No vulnerable JavaScript libraries detected'
      );
    },
  },

  // ==========================================================================
  // Document
  // ==========================================================================
  {
    id: 'bp-doctype',
    name: 'HTML Doctype',
    category: 'technical',
    severity: 'error',
    description: 'Page must have the HTML doctype',
    check: (ctx) => {
      if (ctx.hasDoctype === undefined) return null;
      if (!ctx.hasDoctype) {
        return createResult(
          { id: 'bp-doctype', name: 'HTML Doctype', category: 'technical', severity: 'error' },
          'fail',
          'Page is missing HTML doctype',
          {
            recommendation: 'Add <!DOCTYPE html> at the start of the document',
            evidence: {
              expected: '<!DOCTYPE html>',
              impact: 'Missing doctype triggers quirks mode in browsers',
              learnMore: 'https://developer.mozilla.org/en-US/docs/Glossary/Doctype',
            },
          }
        );
      }
      return createResult(
        { id: 'bp-doctype', name: 'HTML Doctype', category: 'technical', severity: 'error' },
        'pass',
        'Page has HTML doctype'
      );
    },
  },
  {
    id: 'bp-charset',
    name: 'Character Encoding',
    category: 'technical',
    severity: 'error',
    description: 'Page should properly define charset',
    check: (ctx) => {
      if (ctx.hasCharset === undefined) return null;
      if (!ctx.hasCharset) {
        return createResult(
          { id: 'bp-charset', name: 'Character Encoding', category: 'technical', severity: 'error' },
          'fail',
          'Page is missing character encoding declaration',
          {
            recommendation: 'Add <meta charset="UTF-8"> in the <head>',
            evidence: {
              expected: '<meta charset="UTF-8">',
              impact: 'Characters may render incorrectly without charset declaration',
            },
          }
        );
      }
      if (ctx.charset && ctx.charset.toLowerCase() !== 'utf-8') {
        return createResult(
          { id: 'bp-charset', name: 'Character Encoding', category: 'technical', severity: 'error' },
          'warn',
          `Non-UTF-8 charset: ${ctx.charset}`,
          {
            value: ctx.charset,
            recommendation: 'Use UTF-8 encoding for maximum compatibility',
            evidence: {
              found: ctx.charset,
              expected: 'UTF-8',
            },
          }
        );
      }
      return createResult(
        { id: 'bp-charset', name: 'Character Encoding', category: 'technical', severity: 'error' },
        'pass',
        `Charset: ${ctx.charset || 'UTF-8'}`
      );
    },
  },

  // ==========================================================================
  // Permissions
  // ==========================================================================
  {
    id: 'bp-geolocation-on-load',
    name: 'Geolocation Permission',
    category: 'technical',
    severity: 'warning',
    description: 'Page should not request geolocation permission on page load',
    check: (ctx) => {
      if (ctx.requestsGeolocationOnLoad === undefined) return null;
      if (ctx.requestsGeolocationOnLoad) {
        return createResult(
          { id: 'bp-geolocation-on-load', name: 'Geolocation Permission', category: 'technical', severity: 'warning' },
          'warn',
          'Page requests geolocation permission on load',
          {
            recommendation: 'Request geolocation only after user interaction',
            evidence: {
              found: 'Geolocation requested on page load',
              expected: 'Request only on user interaction',
              impact: 'Users may deny permission or distrust the site',
              learnMore: 'https://web.dev/geolocation-on-start/',
            },
          }
        );
      }
      return createResult(
        { id: 'bp-geolocation-on-load', name: 'Geolocation Permission', category: 'technical', severity: 'warning' },
        'pass',
        'No geolocation request on page load'
      );
    },
  },
  {
    id: 'bp-notification-on-load',
    name: 'Notification Permission',
    category: 'technical',
    severity: 'warning',
    description: 'Page should not request notification permission on page load',
    check: (ctx) => {
      if (ctx.requestsNotificationOnLoad === undefined) return null;
      if (ctx.requestsNotificationOnLoad) {
        return createResult(
          { id: 'bp-notification-on-load', name: 'Notification Permission', category: 'technical', severity: 'warning' },
          'warn',
          'Page requests notification permission on load',
          {
            recommendation: 'Request notification permission only after user interaction',
            evidence: {
              found: 'Notification permission requested on page load',
              expected: 'Request only on user interaction',
              impact: 'Users may deny permission or leave the site',
              learnMore: 'https://web.dev/notification-on-start/',
            },
          }
        );
      }
      return createResult(
        { id: 'bp-notification-on-load', name: 'Notification Permission', category: 'technical', severity: 'warning' },
        'pass',
        'No notification request on page load'
      );
    },
  },

  // ==========================================================================
  // Images
  // ==========================================================================
  {
    id: 'bp-image-aspect-ratio',
    name: 'Image Aspect Ratio',
    category: 'images',
    severity: 'info',
    description: 'Images should display with correct aspect ratio',
    check: (ctx) => {
      if (ctx.imagesWithIncorrectAspectRatio === undefined) return null;
      const count = ctx.imagesWithIncorrectAspectRatio;
      if (count > 0) {
        return createResult(
          { id: 'bp-image-aspect-ratio', name: 'Image Aspect Ratio', category: 'images', severity: 'info' },
          'info',
          `${count} image(s) displayed with incorrect aspect ratio`,
          {
            value: count,
            recommendation: 'Set width and height attributes matching actual image dimensions',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Distorted images affect visual quality and user experience',
            },
          }
        );
      }
      return createResult(
        { id: 'bp-image-aspect-ratio', name: 'Image Aspect Ratio', category: 'images', severity: 'info' },
        'pass',
        'All images display with correct aspect ratios'
      );
    },
  },
  {
    id: 'bp-image-resolution',
    name: 'Image Resolution',
    category: 'images',
    severity: 'info',
    description: 'Images should be served at appropriate resolution',
    check: (ctx) => {
      if (ctx.imagesWithLowResolution === undefined) return null;
      const count = ctx.imagesWithLowResolution;
      if (count > 0) {
        return createResult(
          { id: 'bp-image-resolution', name: 'Image Resolution', category: 'images', severity: 'info' },
          'info',
          `${count} image(s) may appear blurry on high-density displays`,
          {
            value: count,
            recommendation: 'Provide 2x or srcset images for high-density displays',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Low resolution images appear blurry on modern displays',
            },
          }
        );
      }
      return createResult(
        { id: 'bp-image-resolution', name: 'Image Resolution', category: 'images', severity: 'info' },
        'pass',
        'Images are served at appropriate resolution'
      );
    },
  },

  // ==========================================================================
  // HTTP Status
  // ==========================================================================
  {
    id: 'bp-http-status',
    name: 'HTTP Status Code',
    category: 'technical',
    severity: 'error',
    description: 'Page should have successful HTTP status code',
    check: (ctx) => {
      if (ctx.httpStatusCode === undefined) return null;
      const status = ctx.httpStatusCode;
      if (status >= 400) {
        return createResult(
          { id: 'bp-http-status', name: 'HTTP Status Code', category: 'technical', severity: 'error' },
          'fail',
          `HTTP ${status} error response`,
          {
            value: status,
            recommendation: 'Fix server configuration to return successful status codes',
            evidence: {
              found: status,
              expected: '200-299',
              impact: 'Error pages will not be indexed by search engines',
            },
          }
        );
      }
      if (status >= 300) {
        return createResult(
          { id: 'bp-http-status', name: 'HTTP Status Code', category: 'technical', severity: 'error' },
          'info',
          `HTTP ${status} redirect response`,
          {
            value: status,
            recommendation: 'Redirects add latency; consider updating links to final URLs',
          }
        );
      }
      return createResult(
        { id: 'bp-http-status', name: 'HTTP Status Code', category: 'technical', severity: 'error' },
        'pass',
        `HTTP ${status} OK`
      );
    },
  },

  // ==========================================================================
  // SEO Crawling and Indexing
  // ==========================================================================
  {
    id: 'bp-indexable',
    name: 'Page Indexable',
    category: 'technical',
    severity: 'error',
    description: 'Page should not be blocked from indexing',
    check: (ctx) => {
      if (ctx.metaRobots === undefined) return null;
      const robots = Array.isArray(ctx.metaRobots) ? ctx.metaRobots : [ctx.metaRobots];
      const blocked = robots.some(r =>
        r.toLowerCase().includes('noindex') || r.toLowerCase().includes('none')
      );
      if (blocked) {
        return createResult(
          { id: 'bp-indexable', name: 'Page Indexable', category: 'technical', severity: 'error' },
          'fail',
          'Page is blocked from indexing',
          {
            recommendation: 'Remove noindex directive if this page should be searchable',
            evidence: {
              found: robots.join(', '),
              expected: 'No noindex directive',
              impact: 'Page will not appear in search results',
            },
          }
        );
      }
      return createResult(
        { id: 'bp-indexable', name: 'Page Indexable', category: 'technical', severity: 'error' },
        'pass',
        'Page is indexable'
      );
    },
  },
  {
    id: 'bp-links-crawlable',
    name: 'Crawlable Links',
    category: 'links',
    severity: 'warning',
    description: 'Links should be crawlable by search engines',
    check: (ctx) => {
      if (ctx.uncrawlableLinksCount === undefined) return null;
      const count = ctx.uncrawlableLinksCount;
      if (count > 0) {
        return createResult(
          { id: 'bp-links-crawlable', name: 'Crawlable Links', category: 'links', severity: 'warning' },
          'warn',
          `${count} link(s) are not crawlable`,
          {
            value: count,
            recommendation: 'Use <a href> tags instead of JavaScript navigation for important links',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Search engines cannot discover linked content',
              learnMore: 'https://developers.google.com/search/docs/crawling-indexing/links-crawlable',
            },
          }
        );
      }
      return createResult(
        { id: 'bp-links-crawlable', name: 'Crawlable Links', category: 'links', severity: 'warning' },
        'pass',
        'All links are crawlable'
      );
    },
  },
  {
    id: 'bp-robots-txt',
    name: 'Valid robots.txt',
    category: 'technical',
    severity: 'info',
    description: 'robots.txt should be valid and accessible',
    check: (ctx) => {
      if (ctx.robotsTxtValid === undefined) return null;
      if (!ctx.robotsTxtValid) {
        return createResult(
          { id: 'bp-robots-txt', name: 'Valid robots.txt', category: 'technical', severity: 'info' },
          'warn',
          'robots.txt is invalid or inaccessible',
          {
            recommendation: 'Ensure robots.txt is valid and returns 200 status',
            evidence: {
              found: ctx.robotsTxtError || 'Invalid',
              expected: 'Valid robots.txt',
              impact: 'Invalid robots.txt may cause crawling issues',
              learnMore: 'https://developers.google.com/search/docs/crawling-indexing/robots/intro',
            },
          }
        );
      }
      return createResult(
        { id: 'bp-robots-txt', name: 'Valid robots.txt', category: 'technical', severity: 'info' },
        'pass',
        'robots.txt is valid'
      );
    },
  },
  {
    id: 'bp-structured-data',
    name: 'Structured Data',
    category: 'structured-data',
    severity: 'info',
    description: 'Page should have valid structured data',
    check: (ctx) => {
      if (ctx.structuredDataErrors === undefined) return null;
      const errors = ctx.structuredDataErrors;
      if (errors > 0) {
        return createResult(
          { id: 'bp-structured-data', name: 'Structured Data', category: 'structured-data', severity: 'info' },
          'warn',
          `${errors} structured data error(s) found`,
          {
            value: errors,
            recommendation: 'Validate structured data using Google Rich Results Test',
            evidence: {
              found: errors,
              expected: 0,
              impact: 'Invalid structured data may not generate rich results',
              learnMore: 'https://search.google.com/test/rich-results',
            },
          }
        );
      }
      if (ctx.jsonLdCount && ctx.jsonLdCount > 0) {
        return createResult(
          { id: 'bp-structured-data', name: 'Structured Data', category: 'structured-data', severity: 'info' },
          'pass',
          `${ctx.jsonLdCount} structured data block(s) found`
        );
      }
      return createResult(
        { id: 'bp-structured-data', name: 'Structured Data', category: 'structured-data', severity: 'info' },
        'info',
        'No structured data found',
        {
          recommendation: 'Add schema.org structured data for rich search results',
        }
      );
    },
  },
];

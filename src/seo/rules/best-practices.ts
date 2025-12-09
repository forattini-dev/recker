/**
 * SEO Best Practices Rules
 * Lighthouse-aligned general best practices checks
 *
 * All rules in this file work with HTTP response + HTML parsing.
 * No browser/JS execution required.
 */

import { SeoRule, createResult } from './types.js';

export const bestPracticesRules: SeoRule[] = [
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

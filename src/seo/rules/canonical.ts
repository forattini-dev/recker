/**
 * Canonical URL Rules
 * Issues related to canonical tags and URL canonicalization
 */

import { SeoRule, RuleContext, createResult } from './types.js';

export const canonicalRules: SeoRule[] = [
  // ==========================================================================
  // Missing Canonical
  // ==========================================================================
  {
    id: 'canonical-present',
    name: 'Canonical Tag Present',
    category: 'canonicalization',
    severity: 'warning',
    description: 'Pages should have a canonical URL defined',
    check: (ctx) => {
      if (ctx.hasCanonical === undefined) {
        return createResult(
          { id: 'canonical-present', name: 'Canonical Tag Present', category: 'canonicalization', severity: 'warning' },
          'info',
          'Not applicable (canonical data unavailable)',
          { recommendation: 'This rule checks if a canonical URL is defined to avoid duplicate content issues' }
        );
      }

      if (!ctx.hasCanonical) {
        return createResult(
          { id: 'canonical-present', name: 'Canonical Tag Present', category: 'canonicalization', severity: 'warning' },
          'warn',
          'Page is missing canonical tag',
          {
            recommendation: 'Add <link rel="canonical" href="..."> to specify the preferred URL',
            evidence: {
              expected: '<link rel="canonical" href="https://example.com/page">',
              impact: 'Without canonical, search engines may index duplicate versions'
            }
          }
        );
      }

      return createResult(
        { id: 'canonical-present', name: 'Canonical Tag Present', category: 'canonicalization', severity: 'warning' },
        'pass',
        'Canonical tag is present'
      );
    },
  },

  // ==========================================================================
  // Multiple Canonical Tags
  // ==========================================================================
  {
    id: 'canonical-multiple',
    name: 'Multiple Canonical Tags',
    category: 'canonicalization',
    severity: 'error',
    description: 'Page should have only one canonical tag',
    check: (ctx) => {
      if (ctx.canonicalCount === undefined) {
        return createResult(
          { id: 'canonical-multiple', name: 'Multiple Canonical Tags', category: 'canonicalization', severity: 'error' },
          'info',
          'Not applicable (canonical count data unavailable)',
          { recommendation: 'This rule ensures only one canonical tag exists per page' }
        );
      }

      if (ctx.canonicalCount > 1) {
        return createResult(
          { id: 'canonical-multiple', name: 'Multiple Canonical Tags', category: 'canonicalization', severity: 'error' },
          'fail',
          `Page has ${ctx.canonicalCount} canonical tags`,
          {
            value: ctx.canonicalCount,
            recommendation: 'Remove duplicate canonical tags; keep only one',
            evidence: {
              found: ctx.canonicalUrls || [],
              expected: 'Single canonical tag',
              impact: 'Multiple canonicals confuse search engines about preferred URL'
            }
          }
        );
      }

      return createResult(
        { id: 'canonical-multiple', name: 'Multiple Canonical Tags', category: 'canonicalization', severity: 'error' },
        'pass',
        'Single canonical tag found'
      );
    },
  },

  // ==========================================================================
  // Canonical Self-Reference
  // ==========================================================================
  {
    id: 'canonical-self-referencing',
    name: 'Canonical Self-Reference',
    category: 'canonicalization',
    severity: 'info',
    description: 'Canonical should typically point to the current page URL',
    check: (ctx) => {
      if (!ctx.canonicalUrl || !ctx.url) {
        return createResult(
          { id: 'canonical-self-referencing', name: 'Canonical Self-Reference', category: 'canonicalization', severity: 'info' },
          'info',
          'Not applicable (canonical or URL data unavailable)',
          { recommendation: 'This rule checks if canonical URL points to the current page' }
        );
      }

      const isSelfReferencing = normalizeUrl(ctx.canonicalUrl) === normalizeUrl(ctx.url);

      if (!isSelfReferencing) {
        return createResult(
          { id: 'canonical-self-referencing', name: 'Canonical Self-Reference', category: 'canonicalization', severity: 'info' },
          'info',
          'Canonical points to different URL',
          {
            recommendation: 'Verify this is intentional canonicalization',
            evidence: {
              found: ctx.canonicalUrl,
              expected: ctx.url,
              impact: 'This page signals to search engines that another URL is preferred'
            }
          }
        );
      }

      return createResult(
        { id: 'canonical-self-referencing', name: 'Canonical Self-Reference', category: 'canonicalization', severity: 'info' },
        'pass',
        'Canonical is self-referencing'
      );
    },
  },

  // ==========================================================================
  // Broken Canonical
  // ==========================================================================
  {
    id: 'canonical-broken',
    name: 'Broken Canonical URL',
    category: 'canonicalization',
    severity: 'error',
    description: 'Canonical URL should be accessible (not 404)',
    check: (ctx) => {
      if (ctx.canonicalStatus === undefined) {
        return createResult(
          { id: 'canonical-broken', name: 'Broken Canonical URL', category: 'canonicalization', severity: 'error' },
          'info',
          'Not applicable (canonical status data unavailable)',
          { recommendation: 'This rule validates that canonical URL is accessible and returns 200 OK' }
        );
      }

      if (ctx.canonicalStatus === 404) {
        return createResult(
          { id: 'canonical-broken', name: 'Broken Canonical URL', category: 'canonicalization', severity: 'error' },
          'fail',
          'Canonical URL returns 404',
          {
            value: ctx.canonicalUrl,
            recommendation: 'Fix canonical to point to an existing, accessible page',
            evidence: {
              found: `${ctx.canonicalUrl} → 404`,
              expected: '200 OK',
              impact: 'Broken canonical prevents proper indexing'
            }
          }
        );
      }

      if (ctx.canonicalStatus >= 400) {
        return createResult(
          { id: 'canonical-broken', name: 'Broken Canonical URL', category: 'canonicalization', severity: 'error' },
          'fail',
          `Canonical URL returns error (${ctx.canonicalStatus})`,
          {
            value: ctx.canonicalUrl,
            recommendation: 'Fix canonical to point to an accessible page',
            evidence: {
              found: `${ctx.canonicalUrl} → ${ctx.canonicalStatus}`,
              expected: '200 OK',
              impact: 'Canonical errors prevent proper indexing'
            }
          }
        );
      }

      // Canonical redirects to different URL
      if (ctx.canonicalStatus >= 300 && ctx.canonicalFinalUrl) {
        return createResult(
          { id: 'canonical-broken', name: 'Broken Canonical URL', category: 'canonicalization', severity: 'error' },
          'warn',
          'Canonical URL redirects',
          {
            value: ctx.canonicalUrl,
            recommendation: 'Update canonical to final destination URL',
            evidence: {
              found: `${ctx.canonicalUrl} → ${ctx.canonicalFinalUrl}`,
              expected: 'Direct URL without redirect',
              impact: 'Canonical redirects waste crawl budget'
            }
          }
        );
      }

      return createResult(
        { id: 'canonical-broken', name: 'Broken Canonical URL', category: 'canonicalization', severity: 'error' },
        'pass',
        'Canonical URL is accessible'
      );
    },
  },

  // ==========================================================================
  // Canonical Protocol
  // ==========================================================================
  {
    id: 'canonical-protocol',
    name: 'Canonical Protocol',
    category: 'canonicalization',
    severity: 'warning',
    description: 'Canonical should use HTTPS protocol',
    check: (ctx) => {
      if (!ctx.canonicalUrl) {
        return createResult(
          { id: 'canonical-protocol', name: 'Canonical Protocol', category: 'canonicalization', severity: 'warning' },
          'info',
          'Not applicable (no canonical URL detected)',
          { recommendation: 'This rule ensures canonical URLs use HTTPS protocol for security' }
        );
      }

      if (ctx.canonicalUrl.startsWith('http://')) {
        return createResult(
          { id: 'canonical-protocol', name: 'Canonical Protocol', category: 'canonicalization', severity: 'warning' },
          'warn',
          'Canonical uses HTTP instead of HTTPS',
          {
            value: ctx.canonicalUrl,
            recommendation: 'Update canonical to use HTTPS',
            evidence: {
              found: ctx.canonicalUrl,
              expected: ctx.canonicalUrl.replace('http://', 'https://'),
              impact: 'HTTP canonicals may cause indexing preference issues'
            }
          }
        );
      }

      return createResult(
        { id: 'canonical-protocol', name: 'Canonical Protocol', category: 'canonicalization', severity: 'warning' },
        'pass',
        'Canonical uses HTTPS'
      );
    },
  },

  // ==========================================================================
  // Canonical Relative URL
  // ==========================================================================
  {
    id: 'canonical-absolute',
    name: 'Canonical Absolute URL',
    category: 'canonicalization',
    severity: 'warning',
    description: 'Canonical URL should be absolute, not relative',
    check: (ctx) => {
      if (!ctx.canonicalUrl) {
        return createResult(
          { id: 'canonical-absolute', name: 'Canonical Absolute URL', category: 'canonicalization', severity: 'warning' },
          'info',
          'Not applicable (no canonical URL detected)',
          { recommendation: 'This rule checks that canonical URLs are absolute, not relative' }
        );
      }

      const isRelative = !ctx.canonicalUrl.startsWith('http://') &&
                         !ctx.canonicalUrl.startsWith('https://') &&
                         !ctx.canonicalUrl.startsWith('//');

      if (isRelative) {
        return createResult(
          { id: 'canonical-absolute', name: 'Canonical Absolute URL', category: 'canonicalization', severity: 'warning' },
          'warn',
          'Canonical URL is relative',
          {
            value: ctx.canonicalUrl,
            recommendation: 'Use absolute URL including protocol and domain',
            evidence: {
              found: ctx.canonicalUrl,
              expected: 'https://example.com/page',
              impact: 'Relative canonicals may be misinterpreted by crawlers'
            }
          }
        );
      }

      return createResult(
        { id: 'canonical-absolute', name: 'Canonical Absolute URL', category: 'canonicalization', severity: 'warning' },
        'pass',
        'Canonical URL is absolute'
      );
    },
  },

  // ==========================================================================
  // Canonical Chain (canonical pointing to another canonical)
  // ==========================================================================
  {
    id: 'canonical-chain',
    name: 'Canonical Chain',
    category: 'canonicalization',
    severity: 'warning',
    description: 'Canonical should not create chains',
    check: (ctx) => {
      if (ctx.canonicalChainLength === undefined) {
        return createResult(
          { id: 'canonical-chain', name: 'Canonical Chain', category: 'canonicalization', severity: 'warning' },
          'info',
          'Not applicable (canonical chain data unavailable)',
          { recommendation: 'This rule detects canonical chains where one canonical points to another' }
        );
      }

      if (ctx.canonicalChainLength > 1) {
        return createResult(
          { id: 'canonical-chain', name: 'Canonical Chain', category: 'canonicalization', severity: 'warning' },
          'warn',
          `Canonical chain detected (${ctx.canonicalChainLength} hops)`,
          {
            value: ctx.canonicalChainLength,
            recommendation: 'Update canonical to point directly to final canonical URL',
            evidence: {
              found: ctx.canonicalChain || [],
              expected: 'Direct canonical to final URL',
              impact: 'Canonical chains may cause consolidation issues'
            }
          }
        );
      }

      return createResult(
        { id: 'canonical-chain', name: 'Canonical Chain', category: 'canonicalization', severity: 'warning' },
        'pass',
        'No canonical chain detected'
      );
    },
  },

  // ==========================================================================
  // Canonical with Query Parameters
  // ==========================================================================
  {
    id: 'canonical-parameters',
    name: 'Canonical Query Parameters',
    category: 'canonicalization',
    severity: 'info',
    description: 'Canonical URLs with query parameters should be intentional',
    check: (ctx) => {
      if (!ctx.canonicalUrl) {
        return createResult(
          { id: 'canonical-parameters', name: 'Canonical Query Parameters', category: 'canonicalization', severity: 'info' },
          'info',
          'Not applicable (no canonical URL detected)',
          { recommendation: 'This rule checks for query parameters in canonical URLs' }
        );
      }

      try {
        const url = new URL(ctx.canonicalUrl);
        if (url.search && url.search.length > 1) {
          return createResult(
            { id: 'canonical-parameters', name: 'Canonical Query Parameters', category: 'canonicalization', severity: 'info' },
            'info',
            'Canonical contains query parameters',
            {
              value: ctx.canonicalUrl,
              recommendation: 'Verify query parameters in canonical are intentional',
              evidence: {
                found: url.search,
                impact: 'Query parameters in canonicals may indicate tracking or filtering'
              }
            }
          );
        }
      } catch {
        // Invalid URL handled elsewhere
      }

      return createResult(
        { id: 'canonical-parameters', name: 'Canonical Query Parameters', category: 'canonicalization', severity: 'info' },
        'pass',
        'Canonical URL has no query parameters'
      );
    },
  },

  // ==========================================================================
  // Noindex with Canonical (conflicting signals)
  // ==========================================================================
  {
    id: 'canonical-noindex-conflict',
    name: 'Canonical + Noindex Conflict',
    category: 'canonicalization',
    severity: 'warning',
    description: 'Pages with noindex should not have canonical to indexed page',
    check: (ctx) => {
      if (!ctx.hasCanonical || ctx.metaRobots === undefined) {
        return createResult(
          { id: 'canonical-noindex-conflict', name: 'Canonical + Noindex Conflict', category: 'canonicalization', severity: 'warning' },
          'info',
          'Not applicable (canonical or robots meta tag data unavailable)',
          { recommendation: 'This rule detects conflicting noindex and canonical directives' }
        );
      }

      const robots = Array.isArray(ctx.metaRobots) ? ctx.metaRobots : [ctx.metaRobots];
      const hasNoindex = robots.some(r => r.toLowerCase().includes('noindex'));

      if (hasNoindex && ctx.canonicalUrl) {
        const isSelfReferencing = ctx.url && normalizeUrl(ctx.canonicalUrl) === normalizeUrl(ctx.url);

        if (isSelfReferencing) {
          return createResult(
            { id: 'canonical-noindex-conflict', name: 'Canonical + Noindex Conflict', category: 'canonicalization', severity: 'warning' },
            'warn',
            'Page has both noindex and self-referencing canonical',
            {
              recommendation: 'Remove canonical or noindex - conflicting signals',
              evidence: {
                found: `noindex + canonical to self (${ctx.canonicalUrl})`,
                impact: 'Google ignores noindex if page has canonical to itself'
              }
            }
          );
        }
      }

      return createResult(
        { id: 'canonical-noindex-conflict', name: 'Canonical + Noindex Conflict', category: 'canonicalization', severity: 'warning' },
        'pass',
        'No conflicting noindex and canonical directives'
      );
    },
  },
];

// ==========================================================================
// Helper Functions
// ==========================================================================

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Remove trailing slash, lowercase
    return `${u.protocol}//${u.hostname}${u.pathname.replace(/\/$/, '')}${u.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

// ==========================================================================
// Extended Context for Canonical Rules
// ==========================================================================

declare module './types.js' {
  interface RuleContext {
    // Multiple canonicals
    canonicalCount?: number;
    canonicalUrls?: string[];

    // Canonical validation
    canonicalStatus?: number;
    canonicalFinalUrl?: string;

    // Canonical chains
    canonicalChainLength?: number;
    canonicalChain?: string[];
  }
}

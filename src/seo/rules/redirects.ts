/**
 * Redirect and URL Resolution Rules
 * Issues related to redirects, chains, loops, and URL canonicalization
 */

import { SeoRule, RuleContext, createResult } from './types.js';

export const redirectRules: SeoRule[] = [
  // ==========================================================================
  // Redirect Chains
  // ==========================================================================
  {
    id: 'redirect-chain-length',
    name: 'Redirect Chain Length',
    category: 'technical',
    severity: 'warning',
    description: 'Redirect chains should not exceed 3 hops',
    check: (ctx) => {
      if (ctx.redirectChain === undefined) {
        return createResult(
          { id: 'redirect-chain-length', name: 'Redirect Chain Length', category: 'technical', severity: 'warning' },
          'info',
          'Unable to check redirect chain (data unavailable)',
          { recommendation: 'Ensure redirect analysis completed' }
        );
      }

      const chainLength = ctx.redirectChain.length;

      if (chainLength === 0) {
        return createResult(
          { id: 'redirect-chain-length', name: 'Redirect Chain Length', category: 'technical', severity: 'warning' },
          'pass',
          'No redirects detected'
        );
      }

      // Critical: >5 hops (potential loop or excessive chain)
      if (chainLength > 5) {
        return createResult(
          { id: 'redirect-chain-length', name: 'Redirect Chain Length', category: 'technical', severity: 'warning' },
          'fail',
          `Redirect chain has ${chainLength} hops (excessive)`,
          {
            value: chainLength,
            recommendation: 'Consolidate redirects to point directly to final URL',
            evidence: {
              found: ctx.redirectChain.map(r => `${r.status} ${r.from} → ${r.to}`),
              expected: 'Direct link to final destination',
              impact: 'Long redirect chains waste crawl budget and increase latency'
            }
          }
        );
      }

      // Warning: >3 hops
      if (chainLength > 3) {
        return createResult(
          { id: 'redirect-chain-length', name: 'Redirect Chain Length', category: 'technical', severity: 'warning' },
          'warn',
          `Redirect chain has ${chainLength} hops`,
          {
            value: chainLength,
            recommendation: 'Reduce redirect chain by updating original links',
            evidence: {
              found: ctx.redirectChain.map(r => `${r.status} ${r.from} → ${r.to}`),
              expected: 'Maximum 3 redirects',
              impact: 'Excessive redirects slow page load and lose link equity'
            }
          }
        );
      }

      // Info: 1-3 hops (acceptable but note it)
      return createResult(
        { id: 'redirect-chain-length', name: 'Redirect Chain Length', category: 'technical', severity: 'warning' },
        'info',
        `Page reached after ${chainLength} redirect(s)`,
        {
          value: chainLength,
          evidence: {
            found: ctx.redirectChain.map(r => `${r.status} ${r.from} → ${r.to}`)
          }
        }
      );
    },
  },

  // ==========================================================================
  // Redirect Loop Detection
  // ==========================================================================
  {
    id: 'redirect-loop',
    name: 'Redirect Loop',
    category: 'technical',
    severity: 'error',
    description: 'Pages should not create redirect loops',
    check: (ctx) => {
      if (!ctx.redirectChain || ctx.redirectChain.length === 0) {
        return createResult(
          { id: 'redirect-loop', name: 'Redirect Loop', category: 'technical', severity: 'error' },
          'pass',
          'No redirect chain to check for loops'
        );
      }

      // Check for loops by looking for repeated URLs
      const urls = ctx.redirectChain.map(r => r.from);
      urls.push(ctx.redirectChain[ctx.redirectChain.length - 1].to);

      const seen = new Set<string>();
      let loopUrl: string | undefined;

      for (const url of urls) {
        const normalized = normalizeUrl(url);
        if (seen.has(normalized)) {
          loopUrl = url;
          break;
        }
        seen.add(normalized);
      }

      if (loopUrl) {
        return createResult(
          { id: 'redirect-loop', name: 'Redirect Loop', category: 'technical', severity: 'error' },
          'fail',
          'Redirect loop detected',
          {
            recommendation: 'Fix server configuration to break the redirect loop',
            evidence: {
              found: ctx.redirectChain.map(r => `${r.status} ${r.from} → ${r.to}`),
              issue: `Loop at: ${loopUrl}`,
              impact: 'Redirect loops prevent page from being crawled and indexed'
            }
          }
        );
      }

      return createResult(
        { id: 'redirect-loop', name: 'Redirect Loop', category: 'technical', severity: 'error' },
        'pass',
        'No redirect loop detected'
      );
    },
  },

  // ==========================================================================
  // Temporary vs Permanent Redirects
  // ==========================================================================
  {
    id: 'redirect-type',
    name: 'Redirect Type',
    category: 'technical',
    severity: 'info',
    description: 'Permanent content moves should use 301 redirects',
    check: (ctx) => {
      if (!ctx.redirectChain || ctx.redirectChain.length === 0) {
        return createResult(
          { id: 'redirect-type', name: 'Redirect Type', category: 'technical', severity: 'info' },
          'info',
          'No redirects to analyze',
          { recommendation: 'Page loaded without redirects' }
        );
      }

      const temporary = ctx.redirectChain.filter(r => r.status === 302 || r.status === 307);
      const permanent = ctx.redirectChain.filter(r => r.status === 301 || r.status === 308);

      if (temporary.length > 0 && permanent.length === 0) {
        return createResult(
          { id: 'redirect-type', name: 'Redirect Type', category: 'technical', severity: 'info' },
          'warn',
          `Using temporary redirect (${temporary[0].status})`,
          {
            recommendation: 'Use 301 redirect for permanent URL changes to pass link equity',
            evidence: {
              found: `${temporary[0].status} ${temporary[0].from} → ${temporary[0].to}`,
              expected: '301 for permanent moves, 302 only for temporary changes',
              impact: 'Temporary redirects may not pass full link equity'
            }
          }
        );
      }

      if (permanent.length > 0) {
        return createResult(
          { id: 'redirect-type', name: 'Redirect Type', category: 'technical', severity: 'info' },
          'pass',
          'Using permanent redirect (301)'
        );
      }

      return createResult(
        { id: 'redirect-type', name: 'Redirect Type', category: 'technical', severity: 'info' },
        'info',
        'Unknown redirect type',
        { recommendation: 'Check redirect status codes' }
      );
    },
  },

  // ==========================================================================
  // WWW vs Non-WWW
  // ==========================================================================
  {
    id: 'www-consistency',
    name: 'WWW vs Non-WWW',
    category: 'canonicalization',
    severity: 'warning',
    description: 'Site should redirect consistently to either WWW or non-WWW version',
    check: (ctx) => {
      if (ctx.wwwConsistency === undefined) {
        return createResult(
          { id: 'www-consistency', name: 'WWW vs Non-WWW', category: 'canonicalization', severity: 'warning' },
          'info',
          'Unable to check WWW consistency (data unavailable)',
          { recommendation: 'Ensure WWW/non-WWW analysis completed' }
        );
      }

      const { canonicalHasWww, urlHasWww, redirectsToCanonical } = ctx.wwwConsistency;

      if (canonicalHasWww !== urlHasWww && !redirectsToCanonical) {
        return createResult(
          { id: 'www-consistency', name: 'WWW vs Non-WWW', category: 'canonicalization', severity: 'warning' },
          'warn',
          'WWW/non-WWW version accessible without redirect',
          {
            recommendation: 'Set up 301 redirect from non-canonical version to canonical',
            evidence: {
              found: urlHasWww ? 'www version' : 'non-www version',
              expected: `Redirect to ${canonicalHasWww ? 'www' : 'non-www'} version`,
              impact: 'Duplicate content issues when both versions are accessible'
            }
          }
        );
      }

      return createResult(
        { id: 'www-consistency', name: 'WWW vs Non-WWW', category: 'canonicalization', severity: 'warning' },
        'pass',
        'WWW handling is consistent'
      );
    },
  },

  // ==========================================================================
  // HTTP to HTTPS Redirect
  // ==========================================================================
  {
    id: 'http-to-https-redirect',
    name: 'HTTP to HTTPS Redirect',
    category: 'security',
    severity: 'warning',
    description: 'HTTP version should redirect to HTTPS',
    check: (ctx) => {
      if (ctx.httpRedirectsToHttps === undefined) {
        return createResult(
          { id: 'http-to-https-redirect', name: 'HTTP to HTTPS Redirect', category: 'security', severity: 'warning' },
          'info',
          'Unable to check HTTP to HTTPS redirect (data unavailable)',
          { recommendation: 'Ensure HTTPS redirect analysis completed' }
        );
      }

      if (!ctx.httpRedirectsToHttps) {
        return createResult(
          { id: 'http-to-https-redirect', name: 'HTTP to HTTPS Redirect', category: 'security', severity: 'warning' },
          'warn',
          'HTTP version does not redirect to HTTPS',
          {
            recommendation: 'Configure server to redirect HTTP traffic to HTTPS',
            evidence: {
              found: 'HTTP accessible without redirect',
              expected: '301 redirect from HTTP to HTTPS',
              impact: 'Users may access insecure version; duplicate content issues',
              learnMore: 'https://web.dev/why-https-matters/'
            }
          }
        );
      }

      return createResult(
        { id: 'http-to-https-redirect', name: 'HTTP to HTTPS Redirect', category: 'security', severity: 'warning' },
        'pass',
        'HTTP properly redirects to HTTPS'
      );
    },
  },

  // ==========================================================================
  // Cross-Domain Redirects
  // ==========================================================================
  {
    id: 'cross-domain-redirect',
    name: 'Cross-Domain Redirect',
    category: 'technical',
    severity: 'info',
    description: 'Detects redirects to different domains',
    check: (ctx) => {
      if (!ctx.redirectChain || ctx.redirectChain.length === 0) {
        return createResult(
          { id: 'cross-domain-redirect', name: 'Cross-Domain Redirect', category: 'technical', severity: 'info' },
          'info',
          'No redirect chain to check',
          { recommendation: 'Page loaded without redirects' }
        );
      }

      const crossDomainRedirects = ctx.redirectChain.filter(r => {
        try {
          const fromHost = new URL(r.from).hostname;
          const toHost = new URL(r.to).hostname;
          return fromHost !== toHost;
        } catch {
          return false;
        }
      });

      if (crossDomainRedirects.length > 0) {
        return createResult(
          { id: 'cross-domain-redirect', name: 'Cross-Domain Redirect', category: 'technical', severity: 'info' },
          'info',
          `${crossDomainRedirects.length} cross-domain redirect(s) detected`,
          {
            value: crossDomainRedirects.length,
            evidence: {
              found: crossDomainRedirects.map(r => `${r.from} → ${r.to}`),
              impact: 'Cross-domain redirects may indicate site migration or tracking'
            }
          }
        );
      }

      return createResult(
        { id: 'cross-domain-redirect', name: 'Cross-Domain Redirect', category: 'technical', severity: 'info' },
        'pass',
        'No cross-domain redirects'
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
    // Normalize: lowercase, remove trailing slash, remove default port
    return `${u.protocol}//${u.hostname}${u.pathname.replace(/\/$/, '')}${u.search}`;
  } catch {
    return url.toLowerCase();
  }
}

// ==========================================================================
// Extended Context for Redirect Rules
// ==========================================================================

declare module './types.js' {
  interface RuleContext {
    // Redirect chain info
    redirectChain?: Array<{
      status: number;
      from: string;
      to: string;
    }>;

    // WWW consistency
    wwwConsistency?: {
      canonicalHasWww: boolean;
      urlHasWww: boolean;
      redirectsToCanonical: boolean;
    };
  }
}

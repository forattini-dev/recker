/**
 * SEO Crawl & Indexing Rules
 * Rules for sitemap, robots, canonical, and crawl optimization
 */

import { SeoRule, createResult } from './types.js';

export const crawlRules: SeoRule[] = [
  // ==========================================================================
  // Sitemap Rules
  // ==========================================================================
  {
    id: 'crawl-sitemap-reference',
    name: 'Sitemap Reference',
    category: 'technical',
    severity: 'info',
    description: 'Page should reference sitemap location',
    check: (ctx) => {
      // Check for sitemap link in HTML
      if (ctx.hasSitemapLink) {
        return createResult(
          { id: 'crawl-sitemap-reference', name: 'Sitemap Reference', category: 'technical', severity: 'info' },
          'pass',
          `Sitemap link found: ${ctx.sitemapUrl || 'referenced'}`
        );
      }

      // Check robots.txt header hint
      if (ctx.robotsHasSitemap) {
        return createResult(
          { id: 'crawl-sitemap-reference', name: 'Sitemap Reference', category: 'technical', severity: 'info' },
          'pass',
          'Sitemap referenced in robots.txt'
        );
      }

      return createResult(
        { id: 'crawl-sitemap-reference', name: 'Sitemap Reference', category: 'technical', severity: 'info' },
        'info',
        'No sitemap reference found',
        {
          recommendation: 'Add sitemap reference in robots.txt or HTML',
          evidence: {
            expected: 'Sitemap: https://example.com/sitemap.xml in robots.txt',
            example: '<link rel="sitemap" type="application/xml" href="/sitemap.xml">',
            impact: 'Helps search engines discover all pages',
            learnMore: 'https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview',
          },
        }
      );
    },
  },

  // ==========================================================================
  // Robots Meta Rules
  // ==========================================================================
  {
    id: 'crawl-robots-noindex',
    name: 'Robots Noindex',
    category: 'technical',
    severity: 'error',
    description: 'Check if page is blocked from indexing',
    check: (ctx) => {
      if (!ctx.metaRobots) return null;

      const hasNoindex = ctx.metaRobots.some(r =>
        r.toLowerCase().includes('noindex')
      );

      if (hasNoindex) {
        return createResult(
          { id: 'crawl-robots-noindex', name: 'Robots Noindex', category: 'technical', severity: 'error' },
          'fail',
          'Page is set to noindex',
          {
            evidence: {
              found: ctx.metaRobots.join(', '),
              issue: 'This page will NOT appear in search results',
              impact: 'Remove noindex if this page should be indexed',
            },
          }
        );
      }

      return null; // Don't report if no noindex
    },
  },
  {
    id: 'crawl-robots-nofollow',
    name: 'Robots Nofollow',
    category: 'technical',
    severity: 'warning',
    description: 'Check if page links are blocked from following',
    check: (ctx) => {
      if (!ctx.metaRobots) return null;

      const hasNofollow = ctx.metaRobots.some(r =>
        r.toLowerCase().includes('nofollow')
      );

      if (hasNofollow) {
        return createResult(
          { id: 'crawl-robots-nofollow', name: 'Robots Nofollow', category: 'technical', severity: 'warning' },
          'warn',
          'Page has nofollow directive',
          {
            evidence: {
              found: ctx.metaRobots.join(', '),
              issue: 'Links on this page will not pass PageRank',
              impact: 'Internal pages should usually not have nofollow',
            },
          }
        );
      }

      return null;
    },
  },
  {
    id: 'crawl-robots-combined',
    name: 'Robots Directives',
    category: 'technical',
    severity: 'info',
    description: 'Review all robots meta directives',
    check: (ctx) => {
      if (!ctx.metaRobots || ctx.metaRobots.length === 0) {
        return createResult(
          { id: 'crawl-robots-combined', name: 'Robots Directives', category: 'technical', severity: 'info' },
          'info',
          'No robots meta tag (defaults to index, follow)',
          {
            recommendation: 'Explicitly set robots directives if needed',
            evidence: {
              expected: '<meta name="robots" content="index, follow">',
              impact: 'Default behavior allows full indexing and following',
            },
          }
        );
      }

      // Check for conflicting directives
      const directives = ctx.metaRobots.join(', ').toLowerCase();
      const hasIndex = directives.includes('index') && !directives.includes('noindex');
      const hasNoindex = directives.includes('noindex');

      if (hasIndex && hasNoindex) {
        return createResult(
          { id: 'crawl-robots-combined', name: 'Robots Directives', category: 'technical', severity: 'info' },
          'warn',
          'Conflicting robots directives detected',
          {
            evidence: {
              found: ctx.metaRobots.join(', '),
              issue: 'Both index and noindex specified',
            },
          }
        );
      }

      return createResult(
        { id: 'crawl-robots-combined', name: 'Robots Directives', category: 'technical', severity: 'info' },
        'pass',
        `Robots: ${ctx.metaRobots.join(', ')}`
      );
    },
  },
  {
    id: 'crawl-x-robots-tag',
    name: 'X-Robots-Tag Header',
    category: 'technical',
    severity: 'warning',
    description: 'Check X-Robots-Tag HTTP header for indexing directives',
    check: (ctx) => {
      if (!ctx.responseHeaders) return null;

      const xRobotsTag = ctx.responseHeaders['x-robots-tag'] ||
                         ctx.responseHeaders['X-Robots-Tag'];

      if (!xRobotsTag) return null;

      const tagValue = Array.isArray(xRobotsTag) ? xRobotsTag.join(', ') : xRobotsTag;

      if (tagValue.toLowerCase().includes('noindex')) {
        return createResult(
          { id: 'crawl-x-robots-tag', name: 'X-Robots-Tag Header', category: 'technical', severity: 'warning' },
          'fail',
          'X-Robots-Tag contains noindex',
          {
            evidence: {
              found: tagValue,
              issue: 'HTTP header is blocking indexing',
              impact: 'Page will not appear in search results',
            },
          }
        );
      }

      return createResult(
        { id: 'crawl-x-robots-tag', name: 'X-Robots-Tag Header', category: 'technical', severity: 'warning' },
        'info',
        `X-Robots-Tag: ${tagValue}`
      );
    },
  },

  // ==========================================================================
  // Canonical Rules
  // ==========================================================================
  {
    id: 'crawl-canonical-present',
    name: 'Canonical URL',
    category: 'technical',
    severity: 'warning',
    description: 'Pages should have a canonical URL to prevent duplicate content',
    check: (ctx) => {
      if (!ctx.hasCanonical) {
        return createResult(
          { id: 'crawl-canonical-present', name: 'Canonical URL', category: 'technical', severity: 'warning' },
          'warn',
          'Missing canonical URL',
          {
            recommendation: 'Add a canonical link to prevent duplicate content issues',
            evidence: {
              expected: '<link rel="canonical" href="https://example.com/page">',
              impact: 'Without canonical, search engines may index multiple versions',
              learnMore: 'https://developers.google.com/search/docs/crawling-indexing/canonicalization',
            },
          }
        );
      }

      return createResult(
        { id: 'crawl-canonical-present', name: 'Canonical URL', category: 'technical', severity: 'warning' },
        'pass',
        `Canonical: ${ctx.canonicalUrl}`
      );
    },
  },
  {
    id: 'crawl-canonical-self',
    name: 'Canonical Self-Reference',
    category: 'technical',
    severity: 'info',
    description: 'Canonical should point to the current page or explicit alternate',
    check: (ctx) => {
      if (!ctx.hasCanonical || !ctx.canonicalUrl || !ctx.url) return null;

      // Normalize URLs for comparison
      const normalizeUrl = (url: string) => {
        try {
          const u = new URL(url);
          // Remove trailing slash, lowercase, remove default ports
          let normalized = u.origin + u.pathname.replace(/\/$/, '');
          return normalized.toLowerCase();
        } catch {
          return url.toLowerCase().replace(/\/$/, '');
        }
      };

      const currentNorm = normalizeUrl(ctx.url);
      const canonicalNorm = normalizeUrl(ctx.canonicalUrl);

      if (currentNorm !== canonicalNorm) {
        return createResult(
          { id: 'crawl-canonical-self', name: 'Canonical Self-Reference', category: 'technical', severity: 'info' },
          'info',
          'Canonical points to different URL',
          {
            evidence: {
              found: [`Current: ${ctx.url}`, `Canonical: ${ctx.canonicalUrl}`],
              issue: 'This page canonicalizes to a different URL',
              impact: 'Ensure this is intentional (e.g., www vs non-www consolidation)',
            },
          }
        );
      }

      return null; // Self-referencing canonical is expected
    },
  },
  {
    id: 'crawl-canonical-absolute',
    name: 'Canonical Absolute URL',
    category: 'technical',
    severity: 'warning',
    description: 'Canonical URL should be absolute, not relative',
    check: (ctx) => {
      if (!ctx.canonicalUrl) return null;

      const isAbsolute = ctx.canonicalUrl.startsWith('http://') ||
                         ctx.canonicalUrl.startsWith('https://');

      if (!isAbsolute) {
        return createResult(
          { id: 'crawl-canonical-absolute', name: 'Canonical Absolute URL', category: 'technical', severity: 'warning' },
          'warn',
          'Canonical URL is relative',
          {
            evidence: {
              found: ctx.canonicalUrl,
              expected: 'Absolute URL starting with https://',
              impact: 'Relative canonicals may be misinterpreted',
            },
          }
        );
      }

      return null;
    },
  },
  {
    id: 'crawl-canonical-https',
    name: 'Canonical HTTPS',
    category: 'technical',
    severity: 'warning',
    description: 'Canonical URL should use HTTPS',
    check: (ctx) => {
      if (!ctx.canonicalUrl) return null;

      if (ctx.canonicalUrl.startsWith('http://')) {
        return createResult(
          { id: 'crawl-canonical-https', name: 'Canonical HTTPS', category: 'technical', severity: 'warning' },
          'warn',
          'Canonical URL uses HTTP instead of HTTPS',
          {
            evidence: {
              found: ctx.canonicalUrl,
              expected: 'HTTPS canonical URL',
              impact: 'Google prefers HTTPS URLs for ranking',
            },
          }
        );
      }

      return null;
    },
  },

  // ==========================================================================
  // URL Indexing Rules
  // ==========================================================================
  {
    id: 'crawl-url-parameters',
    name: 'URL Parameters',
    category: 'technical',
    severity: 'info',
    description: 'URLs with tracking parameters should have proper canonical',
    check: (ctx) => {
      if (!ctx.url) return null;

      try {
        const url = new URL(ctx.url);
        const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid', 'ref'];

        const hasTracking = trackingParams.some(p => url.searchParams.has(p));

        if (hasTracking && !ctx.hasCanonical) {
          return createResult(
            { id: 'crawl-url-parameters', name: 'URL Parameters', category: 'technical', severity: 'info' },
            'warn',
            'URL has tracking parameters but no canonical',
            {
              recommendation: 'Add canonical pointing to clean URL without parameters',
              evidence: {
                found: url.search,
                expected: 'Canonical to base URL without tracking params',
                impact: 'Tracking parameters can cause duplicate content',
              },
            }
          );
        }
      } catch {
        // Invalid URL, skip
      }

      return null;
    },
  },
  {
    id: 'crawl-pagination-rel',
    name: 'Pagination Links',
    category: 'technical',
    severity: 'info',
    description: 'Paginated content should use proper rel attributes',
    check: (ctx) => {
      if (!ctx.isPaginatedPage) return null;

      const hasPrevNext = ctx.hasRelPrev || ctx.hasRelNext;

      if (!hasPrevNext) {
        return createResult(
          { id: 'crawl-pagination-rel', name: 'Pagination Links', category: 'technical', severity: 'info' },
          'info',
          'Paginated page missing rel="prev/next" (deprecated but still useful)',
          {
            recommendation: 'Consider using rel="prev" and rel="next" for pagination',
            evidence: {
              example: '<link rel="prev" href="/page/1">\n<link rel="next" href="/page/3">',
              impact: 'Helps search engines understand pagination structure',
              learnMore: 'https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading',
            },
          }
        );
      }

      return createResult(
        { id: 'crawl-pagination-rel', name: 'Pagination Links', category: 'technical', severity: 'info' },
        'pass',
        'Pagination links present'
      );
    },
  },
  {
    id: 'crawl-noarchive',
    name: 'Cache Directives',
    category: 'technical',
    severity: 'info',
    description: 'Check for noarchive and nocache directives',
    check: (ctx) => {
      if (!ctx.metaRobots) return null;

      const directives = ctx.metaRobots.join(', ').toLowerCase();

      const hasNoarchive = directives.includes('noarchive');
      const hasNocache = directives.includes('nocache');
      const hasNosnippet = directives.includes('nosnippet');

      const restrictions: string[] = [];
      if (hasNoarchive) restrictions.push('noarchive (no cached version)');
      if (hasNocache) restrictions.push('nocache (no cache)');
      if (hasNosnippet) restrictions.push('nosnippet (no search snippet)');

      if (restrictions.length > 0) {
        return createResult(
          { id: 'crawl-noarchive', name: 'Cache Directives', category: 'technical', severity: 'info' },
          'info',
          `Search restrictions: ${restrictions.join(', ')}`,
          {
            evidence: {
              found: restrictions,
              impact: 'These directives limit how search engines display your page',
            },
          }
        );
      }

      return null;
    },
  },

  // ==========================================================================
  // robots.txt Exists
  // ==========================================================================
  {
    id: 'robots-txt-exists',
    name: 'robots.txt Exists',
    category: 'crawlability',
    severity: 'info',
    description: 'Website should have a robots.txt file',
    check: (ctx) => {
      if (ctx.robotsTxtExists === undefined) return null;

      if (!ctx.robotsTxtExists) {
        return createResult(
          { id: 'robots-txt-exists', name: 'robots.txt Exists', category: 'crawlability', severity: 'info' },
          'info',
          'No robots.txt file found',
          {
            recommendation: 'Create a robots.txt file to control search engine crawling',
            evidence: {
              expected: '/robots.txt',
              impact: 'Without robots.txt, search engines will crawl everything by default',
              learnMore: 'https://developers.google.com/search/docs/crawling-indexing/robots/intro'
            }
          }
        );
      }

      return createResult(
        { id: 'robots-txt-exists', name: 'robots.txt Exists', category: 'crawlability', severity: 'info' },
        'pass',
        'robots.txt file exists'
      );
    },
  },

  // ==========================================================================
  // Sitemap in robots.txt
  // ==========================================================================
  {
    id: 'sitemap-in-robots',
    name: 'Sitemap Reference in robots.txt',
    category: 'crawlability',
    severity: 'warning',
    description: 'robots.txt should reference sitemap.xml location',
    check: (ctx) => {
      if (ctx.robotsTxtHasSitemap === undefined) return null;

      if (!ctx.robotsTxtHasSitemap) {
        return createResult(
          { id: 'sitemap-in-robots', name: 'Sitemap Reference in robots.txt', category: 'crawlability', severity: 'warning' },
          'warn',
          'robots.txt does not reference sitemap.xml',
          {
            recommendation: 'Add sitemap location to robots.txt',
            evidence: {
              expected: 'Sitemap: https://example.com/sitemap.xml',
              impact: 'Search engines may not discover your sitemap automatically',
              learnMore: 'https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap'
            }
          }
        );
      }

      return createResult(
        { id: 'sitemap-in-robots', name: 'Sitemap Reference in robots.txt', category: 'crawlability', severity: 'warning' },
        'pass',
        'Sitemap is referenced in robots.txt'
      );
    },
  },

  // ==========================================================================
  // Blocked Resources in robots.txt
  // ==========================================================================
  {
    id: 'blocked-resources',
    name: 'Blocked Resources',
    category: 'crawlability',
    severity: 'warning',
    description: 'CSS/JS resources should not be blocked by robots.txt',
    check: (ctx) => {
      if (ctx.blockedResources === undefined) return null;

      if (ctx.blockedResources > 0) {
        return createResult(
          { id: 'blocked-resources', name: 'Blocked Resources', category: 'crawlability', severity: 'warning' },
          'warn',
          `${ctx.blockedResources} resources blocked by robots.txt`,
          {
            value: ctx.blockedResources,
            recommendation: 'Update robots.txt to allow crawling of CSS and JS files',
            evidence: {
              found: `${ctx.blockedResources} blocked resources`,
              expected: 'CSS, JS, and image files should be crawlable',
              impact: 'Blocked resources prevent proper page rendering and indexing',
              learnMore: 'https://developers.google.com/search/docs/crawling-indexing/robots/intro'
            }
          }
        );
      }

      return null;
    },
  },

  // ==========================================================================
  // X-Robots-Tag Blocking
  // ==========================================================================
  {
    id: 'x-robots-tag-noindex',
    name: 'X-Robots-Tag Noindex',
    category: 'crawlability',
    severity: 'warning',
    description: 'X-Robots-Tag should not block important pages',
    check: (ctx) => {
      if (!ctx.xRobotsTag) return null;

      const tag = ctx.xRobotsTag.toLowerCase();
      if (tag.includes('noindex')) {
        return createResult(
          { id: 'x-robots-tag-noindex', name: 'X-Robots-Tag Noindex', category: 'crawlability', severity: 'warning' },
          'warn',
          'Page blocked by X-Robots-Tag: noindex',
          {
            value: ctx.xRobotsTag,
            recommendation: 'Verify this page should not be indexed; remove X-Robots-Tag if unintentional',
            evidence: {
              found: `X-Robots-Tag: ${ctx.xRobotsTag}`,
              impact: 'This page will not appear in search results'
            }
          }
        );
      }

      return null;
    },
  },

  // ==========================================================================
  // Blocked External Resources
  // ==========================================================================
  {
    id: 'blocked-external-resources',
    name: 'Blocked External Resources',
    category: 'crawlability',
    severity: 'info',
    description: 'External resources blocked by robots.txt may affect rendering',
    check: (ctx) => {
      if (ctx.blockedExternalResources === undefined) return null;

      if (ctx.blockedExternalResources > 0) {
        return createResult(
          { id: 'blocked-external-resources', name: 'Blocked External Resources', category: 'crawlability', severity: 'info' },
          'info',
          `${ctx.blockedExternalResources} external resources blocked by robots.txt`,
          {
            value: ctx.blockedExternalResources,
            recommendation: 'Verify blocked resources are not critical for page rendering',
            evidence: {
              found: `${ctx.blockedExternalResources} blocked external resources`,
              impact: 'If critical resources are blocked, search engines may not render pages correctly'
            }
          }
        );
      }

      return null;
    },
  },
];

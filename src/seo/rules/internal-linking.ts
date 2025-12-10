/**
 * SEO Internal Linking Rules
 * Rules for internal link analysis, link equity distribution, and site architecture
 */

import { SeoRule, createResult } from './types.js';

export const internalLinkingRules: SeoRule[] = [
  {
    id: 'linking-internal-count',
    name: 'Internal Link Count',
    category: 'links',
    severity: 'warning',
    description: 'Pages should have a healthy number of internal links',
    check: (ctx) => {
      if (ctx.internalLinks === undefined) return null;

      const count = ctx.internalLinks;

      if (count === 0) {
        return createResult(
          { id: 'linking-internal-count', name: 'Internal Link Count', category: 'links', severity: 'warning' },
          'warn',
          'No internal links found',
          {
            recommendation: 'Add internal links to improve navigation and crawlability',
            evidence: {
              found: 0,
              expected: 'At least 3-5 internal links per page',
              impact: 'Pages without internal links are harder to discover and may not pass link equity',
            },
          }
        );
      }

      if (count < 3) {
        return createResult(
          { id: 'linking-internal-count', name: 'Internal Link Count', category: 'links', severity: 'warning' },
          'info',
          `Only ${count} internal link(s)`,
          {
            recommendation: 'Consider adding more internal links',
            evidence: {
              found: count,
              expected: 'At least 3-5 internal links',
            },
          }
        );
      }

      return createResult(
        { id: 'linking-internal-count', name: 'Internal Link Count', category: 'links', severity: 'warning' },
        'pass',
        `${count} internal links`
      );
    },
  },
  {
    id: 'linking-internal-ratio',
    name: 'Internal/External Link Ratio',
    category: 'links',
    severity: 'info',
    description: 'Pages should have more internal than external links',
    check: (ctx) => {
      if (ctx.internalLinks === undefined || ctx.externalLinks === undefined) return null;
      if (ctx.totalLinks === undefined || ctx.totalLinks === 0) return null;

      const internal = ctx.internalLinks;
      const external = ctx.externalLinks;
      const ratio = internal / (external || 1);

      if (external > internal && external > 5) {
        return createResult(
          { id: 'linking-internal-ratio', name: 'Internal/External Link Ratio', category: 'links', severity: 'info' },
          'info',
          `More external (${external}) than internal (${internal}) links`,
          {
            recommendation: 'Consider adding more internal links for better link equity',
            evidence: {
              found: `${internal} internal, ${external} external`,
              expected: 'Internal links should exceed external links',
              impact: 'External links pass PageRank to other sites',
            },
          }
        );
      }

      return createResult(
        { id: 'linking-internal-ratio', name: 'Internal/External Link Ratio', category: 'links', severity: 'info' },
        'pass',
        `Ratio: ${ratio.toFixed(1)}:1 (internal:external)`
      );
    },
  },
  {
    id: 'linking-anchor-diversity',
    name: 'Anchor Text Diversity',
    category: 'links',
    severity: 'info',
    description: 'Internal links should use diverse, descriptive anchor text',
    check: (ctx) => {
      if (!ctx.allLinks || ctx.allLinks.length === 0) return null;

      const internalLinks = ctx.allLinks.filter(l => l.type === 'internal');
      if (internalLinks.length < 3) return null;

      // Count anchor text occurrences
      const anchorCounts: Record<string, number> = {};
      for (const link of internalLinks) {
        const anchor = (link.text || '').toLowerCase().trim();
        if (anchor && anchor.length > 2) {
          anchorCounts[anchor] = (anchorCounts[anchor] || 0) + 1;
        }
      }

      // Find overused anchors (same anchor used 3+ times)
      const overused = Object.entries(anchorCounts)
        .filter(([_, count]) => count >= 3)
        .map(([anchor, count]) => `"${anchor}" (${count}x)`);

      if (overused.length > 0) {
        return createResult(
          { id: 'linking-anchor-diversity', name: 'Anchor Text Diversity', category: 'links', severity: 'info' },
          'info',
          `Some anchor texts overused`,
          {
            recommendation: 'Vary anchor text for better SEO signal distribution',
            evidence: {
              found: overused.slice(0, 3),
              impact: 'Repetitive anchors may look spammy to search engines',
            },
          }
        );
      }

      return createResult(
        { id: 'linking-anchor-diversity', name: 'Anchor Text Diversity', category: 'links', severity: 'info' },
        'pass',
        'Good anchor text diversity'
      );
    },
  },
  {
    id: 'linking-deep-links',
    name: 'Deep Linking',
    category: 'links',
    severity: 'info',
    description: 'Pages should link to deep content, not just homepage',
    check: (ctx) => {
      if (!ctx.allLinks || ctx.allLinks.length === 0) return null;

      const internalLinks = ctx.allLinks.filter(l => l.type === 'internal');
      if (internalLinks.length === 0) return null;

      // Count links to root vs deep pages
      let rootLinks = 0;
      let deepLinks = 0;

      for (const link of internalLinks) {
        try {
          const url = new URL(link.href, ctx.url);
          if (url.pathname === '/' || url.pathname === '') {
            rootLinks++;
          } else {
            deepLinks++;
          }
        } catch {
          continue;
        }
      }

      const deepRatio = deepLinks / internalLinks.length;

      if (rootLinks > deepLinks && internalLinks.length > 5) {
        return createResult(
          { id: 'linking-deep-links', name: 'Deep Linking', category: 'links', severity: 'info' },
          'info',
          `Most internal links go to homepage`,
          {
            recommendation: 'Add more links to inner pages',
            evidence: {
              found: `${rootLinks} homepage links, ${deepLinks} deep links`,
              expected: 'More deep links than homepage links',
              impact: 'Deep linking improves crawlability of inner pages',
            },
          }
        );
      }

      return createResult(
        { id: 'linking-deep-links', name: 'Deep Linking', category: 'links', severity: 'info' },
        'pass',
        `${Math.round(deepRatio * 100)}% deep links`
      );
    },
  },
  {
    id: 'linking-nav-links',
    name: 'Navigation Links',
    category: 'links',
    severity: 'info',
    description: 'Check for proper navigation link structure',
    check: (ctx) => {
      if (!ctx.hasNav) return null;
      if (ctx.navLinkCount === undefined) return null;

      if (ctx.navLinkCount === 0) {
        return createResult(
          { id: 'linking-nav-links', name: 'Navigation Links', category: 'links', severity: 'info' },
          'warn',
          'Navigation element has no links',
          {
            recommendation: 'Add links to navigation for user experience and SEO',
            evidence: {
              found: '<nav> element with no links',
              expected: 'Navigation should contain meaningful links',
            },
          }
        );
      }

      if (ctx.navLinkCount > 20) {
        return createResult(
          { id: 'linking-nav-links', name: 'Navigation Links', category: 'links', severity: 'info' },
          'info',
          `Navigation has ${ctx.navLinkCount} links (high)`,
          {
            recommendation: 'Consider simplifying navigation',
            evidence: {
              found: ctx.navLinkCount,
              expected: 'Under 20 links for optimal UX',
              impact: 'Too many nav links may dilute link equity',
            },
          }
        );
      }

      return createResult(
        { id: 'linking-nav-links', name: 'Navigation Links', category: 'links', severity: 'info' },
        'pass',
        `${ctx.navLinkCount} navigation links`
      );
    },
  },
  {
    id: 'linking-footer-links',
    name: 'Footer Links',
    category: 'links',
    severity: 'info',
    description: 'Footer should contain important site-wide links',
    check: (ctx) => {
      if (!ctx.hasFooter) return null;
      if (ctx.footerLinkCount === undefined) return null;

      if (ctx.footerLinkCount === 0) {
        return createResult(
          { id: 'linking-footer-links', name: 'Footer Links', category: 'links', severity: 'info' },
          'info',
          'Footer has no links',
          {
            recommendation: 'Add important links to footer',
            evidence: {
              expected: 'Links to privacy policy, terms, contact, sitemap',
            },
          }
        );
      }

      if (ctx.footerLinkCount > 50) {
        return createResult(
          { id: 'linking-footer-links', name: 'Footer Links', category: 'links', severity: 'info' },
          'info',
          `Footer has ${ctx.footerLinkCount} links (excessive)`,
          {
            recommendation: 'Reduce footer links to essential pages',
            evidence: {
              found: ctx.footerLinkCount,
              impact: 'Excessive footer links may be seen as link spam',
            },
          }
        );
      }

      return createResult(
        { id: 'linking-footer-links', name: 'Footer Links', category: 'links', severity: 'info' },
        'pass',
        `${ctx.footerLinkCount} footer links`
      );
    },
  },
  {
    id: 'linking-contextual',
    name: 'Contextual Links',
    category: 'links',
    severity: 'info',
    description: 'Check for in-content contextual links',
    check: (ctx) => {
      if (ctx.contextualLinkCount === undefined) return null;
      if (!ctx.wordCount || ctx.wordCount < 300) return null;

      const count = ctx.contextualLinkCount;

      if (count === 0) {
        return createResult(
          { id: 'linking-contextual', name: 'Contextual Links', category: 'links', severity: 'info' },
          'info',
          'No contextual links in content',
          {
            recommendation: 'Add links within body content to related pages',
            evidence: {
              expected: 'At least 2-3 contextual links per 500 words',
              impact: 'Contextual links pass more link equity than navigation links',
            },
          }
        );
      }

      const linksPerWords = (count / ctx.wordCount) * 500;

      if (linksPerWords < 1 && ctx.wordCount > 500) {
        return createResult(
          { id: 'linking-contextual', name: 'Contextual Links', category: 'links', severity: 'info' },
          'info',
          `Only ${count} contextual link(s) in ${ctx.wordCount} words`,
          {
            recommendation: 'Add more in-content links',
            evidence: {
              found: `${linksPerWords.toFixed(1)} links per 500 words`,
              expected: '2-3 links per 500 words',
            },
          }
        );
      }

      return createResult(
        { id: 'linking-contextual', name: 'Contextual Links', category: 'links', severity: 'info' },
        'pass',
        `${count} contextual links`
      );
    },
  },
  {
    id: 'linking-orphan-page',
    name: 'Orphan Page Detection',
    category: 'links',
    severity: 'warning',
    description: 'Pages should be linked from other pages on the site',
    check: (ctx) => {
      // This rule checks if the page appears to be an orphan
      // based on whether it receives internal links
      if (ctx.incomingInternalLinks === undefined) return null;

      if (ctx.incomingInternalLinks === 0) {
        return createResult(
          { id: 'linking-orphan-page', name: 'Orphan Page Detection', category: 'links', severity: 'warning' },
          'warn',
          'Page may be an orphan (no incoming internal links)',
          {
            recommendation: 'Link to this page from other pages on your site',
            evidence: {
              found: '0 incoming internal links detected',
              impact: 'Orphan pages are harder for search engines to discover',
              learnMore: 'https://ahrefs.com/blog/orphan-pages/',
            },
          }
        );
      }

      return createResult(
        { id: 'linking-orphan-page', name: 'Orphan Page Detection', category: 'links', severity: 'warning' },
        'pass',
        `${ctx.incomingInternalLinks} incoming internal link(s)`
      );
    },
  },
  {
    id: 'linking-self-referencing',
    name: 'Self-Referencing Links',
    category: 'links',
    severity: 'info',
    description: 'Avoid excessive self-referencing links',
    check: (ctx) => {
      if (ctx.selfReferencingLinks === undefined) return null;

      if (ctx.selfReferencingLinks > 3) {
        return createResult(
          { id: 'linking-self-referencing', name: 'Self-Referencing Links', category: 'links', severity: 'info' },
          'info',
          `${ctx.selfReferencingLinks} self-referencing links`,
          {
            recommendation: 'Reduce links that point to the current page',
            evidence: {
              found: ctx.selfReferencingLinks,
              expected: '0-1 self-referencing links (e.g., canonical only)',
              impact: 'Self-links waste crawl budget and confuse users',
            },
          }
        );
      }

      return null; // Don't report if acceptable
    },
  },
  {
    id: 'linking-broken-internal',
    name: 'Broken Internal Links',
    category: 'links',
    severity: 'error',
    description: 'Internal links should not be broken',
    check: (ctx) => {
      if (ctx.brokenInternalLinks === undefined) return null;

      if (ctx.brokenInternalLinks.length > 0) {
        return createResult(
          { id: 'linking-broken-internal', name: 'Broken Internal Links', category: 'links', severity: 'error' },
          'fail',
          `${ctx.brokenInternalLinks.length} broken internal link(s)`,
          {
            recommendation: 'Fix or remove broken internal links',
            evidence: {
              found: ctx.brokenInternalLinks.slice(0, 5),
              expected: '0 broken links',
              impact: 'Broken links waste crawl budget and harm user experience',
            },
          }
        );
      }

      return createResult(
        { id: 'linking-broken-internal', name: 'Broken Internal Links', category: 'links', severity: 'error' },
        'pass',
        'No broken internal links'
      );
    },
  },
  {
    id: 'linking-redirect-chains',
    name: 'Redirect Chains',
    category: 'links',
    severity: 'warning',
    description: 'Internal links should not go through redirect chains',
    check: (ctx) => {
      if (ctx.redirectChainLinks === undefined) return null;

      if (ctx.redirectChainLinks.length > 0) {
        return createResult(
          { id: 'linking-redirect-chains', name: 'Redirect Chains', category: 'links', severity: 'warning' },
          'warn',
          `${ctx.redirectChainLinks.length} link(s) go through redirects`,
          {
            recommendation: 'Update links to point to final destination URLs',
            evidence: {
              found: ctx.redirectChainLinks.slice(0, 5).map(r => `${r.from} → ${r.to} (${r.hops} hops)`),
              expected: '0 redirect chain links',
              impact: 'Redirect chains slow down crawling and lose link equity',
            },
          }
        );
      }

      return createResult(
        { id: 'linking-redirect-chains', name: 'Redirect Chains', category: 'links', severity: 'warning' },
        'pass',
        'No redirect chain links'
      );
    },
  },
  {
    id: 'linking-nofollow-internal',
    name: 'Nofollow Internal Links',
    category: 'links',
    severity: 'warning',
    description: 'Internal links should not use nofollow',
    check: (ctx) => {
      if (!ctx.allLinks) return null;

      const nofollowInternal = ctx.allLinks.filter(
        l => l.type === 'internal' && l.rel?.includes('nofollow')
      );

      if (nofollowInternal.length > 0) {
        return createResult(
          { id: 'linking-nofollow-internal', name: 'Nofollow Internal Links', category: 'links', severity: 'warning' },
          'warn',
          `${nofollowInternal.length} internal link(s) have nofollow`,
          {
            recommendation: 'Remove nofollow from internal links',
            evidence: {
              found: nofollowInternal.slice(0, 3).map(l => l.href),
              impact: 'Nofollow on internal links wastes PageRank',
              learnMore: 'https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links',
            },
          }
        );
      }

      return createResult(
        { id: 'linking-nofollow-internal', name: 'Nofollow Internal Links', category: 'links', severity: 'warning' },
        'pass',
        'No nofollow on internal links'
      );
    },
  },
  {
    id: 'linking-click-depth',
    name: 'Click Depth',
    category: 'links',
    severity: 'info',
    description: 'Important pages should be reachable in few clicks',
    check: (ctx) => {
      if (ctx.pageClickDepth === undefined) return null;

      const depth = ctx.pageClickDepth;

      if (depth > 4) {
        return createResult(
          { id: 'linking-click-depth', name: 'Click Depth', category: 'links', severity: 'info' },
          'warn',
          `Page is ${depth} clicks from homepage`,
          {
            recommendation: 'Improve site architecture for better accessibility',
            evidence: {
              found: `${depth} clicks deep`,
              expected: 'Under 4 clicks from homepage',
              impact: 'Deep pages receive less crawl priority and link equity',
            },
          }
        );
      }

      if (depth > 3) {
        return createResult(
          { id: 'linking-click-depth', name: 'Click Depth', category: 'links', severity: 'info' },
          'info',
          `Page is ${depth} clicks from homepage`,
          {
            recommendation: 'Consider adding shortcuts to this page',
          }
        );
      }

      return createResult(
        { id: 'linking-click-depth', name: 'Click Depth', category: 'links', severity: 'info' },
        'pass',
        `${depth} click(s) from homepage`
      );
    },
  },
];

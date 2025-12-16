import { SeoRule, createResult } from './types.js';
import { SEO_THRESHOLDS } from './thresholds.js';

// ============================================================================
// Generic Anchor Text Detection (Multilingual)
// ============================================================================

const GENERIC_ANCHOR_TEXTS = new Set([
  // English
  'click here', 'click', 'here', 'read more', 'learn more', 'more', 'link',
  'this', 'go', 'continue', 'next', 'previous', 'back', 'see more',
  'find out more', 'discover more', 'view more', 'show more', 'details',
  // Portuguese
  'clique aqui', 'clique', 'aqui', 'saiba mais', 'leia mais', 'veja mais',
  'mais', 'confira', 'ver mais', 'continuar', 'próximo', 'anterior', 'voltar',
  // Spanish
  'haga clic aquí', 'clic aquí', 'aquí', 'leer más', 'ver más', 'más',
  'saber más', 'descubrir más', 'continuar',
  // French
  'cliquez ici', 'ici', 'en savoir plus', 'lire la suite', 'voir plus',
  'plus', 'continuer', 'suivant', 'précédent',
  // German
  'hier klicken', 'hier', 'mehr erfahren', 'weiterlesen', 'mehr',
  'weiter', 'zurück',
  // Italian
  'clicca qui', 'qui', 'scopri di più', 'leggi di più', 'continua',
]);

function isGenericAnchorText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (normalized.length === 0) return true;
  if (normalized.length < 3) return true;
  if (GENERIC_ANCHOR_TEXTS.has(normalized)) return true;
  // Check for purely numeric or symbol-only text
  if (/^[\d\s\-_.,!?#@%&*()[\]{}|\\/<>:;"'`~+=]+$/.test(normalized)) return true;
  // Check for single word generic
  if (['link', 'url', 'page', 'site', 'website', 'info'].includes(normalized)) return true;
  return false;
}

// ============================================================================
// Link Rules
// ============================================================================

export const linkRules: SeoRule[] = [
  {
    id: 'links-descriptive-text',
    name: 'Link Text',
    category: 'links',
    severity: 'warning',
    description: 'Links should have descriptive anchor text',
    check: (ctx) => {
      if (ctx.totalLinks === undefined || ctx.totalLinks === 0) {
        return createResult(
          { id: 'links-descriptive-text', name: 'Link Text', category: 'links', severity: 'warning' },
          'info',
          'Not applicable (no links detected on page)',
          { recommendation: 'This rule checks for descriptive anchor text on all links when links are present' }
        );
      }
      const withoutText = ctx.problematicLinks?.withoutText ?? [];

      if (withoutText.length > 0) {
        const examples = withoutText.slice(0, 3).map((l) => l.href).join(', ');
        return createResult(
          { id: 'links-descriptive-text', name: 'Link Text', category: 'links', severity: 'warning' },
          'warn',
          `${withoutText.length} link(s) without descriptive text`,
          {
            value: withoutText.length,
            recommendation: 'Add descriptive anchor text to all links for better accessibility and SEO',
            evidence: {
              found: withoutText.map((l) => l.href),
              example: '<a href="/page">Learn more about our services</a>',
              impact: 'Screen readers cannot describe the link destination to users',
            },
          }
        );
      }
      return createResult(
        { id: 'links-descriptive-text', name: 'Link Text', category: 'links', severity: 'warning' },
        'pass',
        'All links have descriptive text'
      );
    },
  },
  {
    id: 'links-generic-text',
    name: 'Generic Link Text',
    category: 'links',
    severity: 'warning',
    description: 'Avoid generic link text like "click here" or "read more"',
    check: (ctx) => {
      const genericLinks = ctx.problematicLinks?.genericText ?? [];
      if (genericLinks.length > 0) {
        return createResult(
          { id: 'links-generic-text', name: 'Generic Link Text', category: 'links', severity: 'warning' },
          'warn',
          `${genericLinks.length} link(s) with generic text`,
          {
            value: genericLinks.length,
            recommendation: 'Replace generic anchor text with descriptive text that explains where the link goes',
            evidence: {
              found: genericLinks.map((l) => `"${l.text}" → ${l.href}`),
              issue: 'Generic text like "click here", "read more", "here" provides no context',
              example: 'Instead of <a href="/docs">Click here</a>, use <a href="/docs">View documentation</a>',
            },
          }
        );
      }
      return createResult(
        { id: 'links-generic-text', name: 'Generic Link Text', category: 'links', severity: 'warning' },
        'pass',
        'All links have descriptive anchor text'
      );
    },
  },
  {
    id: 'links-internal-count',
    name: 'Internal Links',
    category: 'links',
    severity: 'info',
    description: 'Page should have at least 3 internal links',
    check: (ctx) => {
      if (ctx.internalLinks === undefined) {
        return createResult(
          { id: 'links-internal-count', name: 'Internal Links', category: 'links', severity: 'info' },
          'info',
          'Not applicable (internal links data unavailable)',
          { recommendation: 'This rule checks for internal linking structure when link data is available' }
        );
      }
      const min = SEO_THRESHOLDS.links.minInternal;

      if (ctx.internalLinks < min) {
        return createResult(
          { id: 'links-internal-count', name: 'Internal Links', category: 'links', severity: 'info' },
          'info',
          `Few internal links (${ctx.internalLinks})`,
          { value: ctx.internalLinks, recommendation: `Add at least ${min} internal links for better navigation` }
        );
      }
      return createResult(
        { id: 'links-internal-count', name: 'Internal Links', category: 'links', severity: 'info' },
        'pass',
        `Good internal linking (${ctx.internalLinks} links)`,
        { value: ctx.internalLinks }
      );
    },
  },
  {
    id: 'links-external-count',
    name: 'External Links',
    category: 'links',
    severity: 'info',
    description: 'Page should not have too many external links',
    check: (ctx) => {
      if (ctx.externalLinks === undefined) {
        return createResult(
          { id: 'links-external-count', name: 'External Links', category: 'links', severity: 'info' },
          'info',
          'Not applicable (external links data unavailable)',
          { recommendation: 'This rule checks external link count when link data is available' }
        );
      }
      const max = SEO_THRESHOLDS.links.maxExternal;

      if (ctx.externalLinks > max) {
        return createResult(
          { id: 'links-external-count', name: 'External Links', category: 'links', severity: 'info' },
          'warn',
          `Too many external links (${ctx.externalLinks})`,
          { value: ctx.externalLinks, recommendation: `Reduce external links to under ${max}` }
        );
      }
      return createResult(
        { id: 'links-external-count', name: 'External Links', category: 'links', severity: 'info' },
        'pass',
        `External links count is acceptable (${ctx.externalLinks} links)`,
        { value: ctx.externalLinks }
      );
    },
  },
  // Extended Link Security
  {
    id: 'links-external-noopener',
    name: 'External Links Noopener',
    category: 'security',
    severity: 'warning',
    description: 'External links with target="_blank" should have rel="noopener"',
    check: (ctx) => {
      const missingNoopener = ctx.problematicLinks?.missingNoopener ?? [];
      if (missingNoopener.length > 0) {
        return createResult(
          { id: 'links-external-noopener', name: 'External Links Noopener', category: 'security', severity: 'warning' },
          'warn',
          `${missingNoopener.length} external link(s) missing rel="noopener"`,
          {
            value: missingNoopener.length,
            recommendation: 'Add rel="noopener" to all external links with target="_blank"',
            evidence: {
              found: missingNoopener.map((l) => l.href),
              issue: 'Links with target="_blank" without rel="noopener" allow the new page to access window.opener',
              impact: 'Security vulnerability: the linked page can redirect your page or access sensitive data',
              example: '<a href="https://external.com" target="_blank" rel="noopener noreferrer">External Site</a>',
            },
          }
        );
      }
      return createResult(
        { id: 'links-external-noopener', name: 'External Links Noopener', category: 'security', severity: 'warning' },
        'pass',
        'All external links with target="_blank" have proper security attributes'
      );
    },
  },
  {
    id: 'links-external-noreferrer',
    name: 'External Links Noreferrer',
    category: 'security',
    severity: 'info',
    description: 'External links may benefit from rel="noreferrer" for privacy',
    check: (ctx) => {
      const missingNoreferrer = ctx.problematicLinks?.missingNoreferrer ?? [];
      if (missingNoreferrer.length > 3) {
        return createResult(
          { id: 'links-external-noreferrer', name: 'External Links Noreferrer', category: 'security', severity: 'info' },
          'info',
          `${missingNoreferrer.length} external link(s) without rel="noreferrer"`,
          {
            value: missingNoreferrer.length,
            recommendation: 'Consider adding rel="noreferrer" to prevent referrer leakage to external sites',
            evidence: {
              found: missingNoreferrer.slice(0, 5).map((l) => l.href),
              issue: 'External sites can see your page URL in their analytics via the Referer header',
              example: '<a href="https://external.com" target="_blank" rel="noopener noreferrer">External</a>',
            },
          }
        );
      }
      return createResult(
        { id: 'links-external-noreferrer', name: 'External Links Noreferrer', category: 'security', severity: 'info' },
        'pass',
        'External links have appropriate privacy attributes'
      );
    },
  },
  {
    id: 'links-sponsored-ugc-directives',
    name: 'Sponsored/UGC Links',
    category: 'links',
    severity: 'info',
    description: 'Rel attributes `sponsored` and `ugc` should be used for paid or user-generated content links.',
    check: (ctx) => {
      if (!ctx.totalLinks) {
        return createResult(
          { id: 'links-sponsored-ugc-directives', name: 'Sponsored/UGC Links', category: 'links', severity: 'info' },
          'info',
          'Not applicable (no links detected on page)',
          { recommendation: 'This rule checks for proper rel="sponsored" and rel="ugc" attributes when links are present' }
        );
      }

      let messages = [];
      if (ctx.sponsoredLinks && ctx.sponsoredLinks > 0) {
        messages.push(`${ctx.sponsoredLinks} link(s) with rel="sponsored".`);
      }
      if (ctx.ugcLinks && ctx.ugcLinks > 0) {
        messages.push(`${ctx.ugcLinks} link(s) with rel="ugc".`);
      }

      if (messages.length > 0) {
        return createResult(
          { id: 'links-sponsored-ugc-directives', name: 'Sponsored/UGC Links', category: 'links', severity: 'info' },
          'info',
          messages.join(' '),
          { recommendation: 'Ensure rel="sponsored" is used for paid links and rel="ugc" for user-generated content.' }
        );
      }
      return createResult(
        { id: 'links-sponsored-ugc-directives', name: 'Sponsored/UGC Links', category: 'links', severity: 'info' },
        'pass',
        'No sponsored or UGC links detected'
      );
    },
  },

  // ==========================================================================
  // Extended Link Rules (Semrush-style)
  // ==========================================================================
  {
    id: 'links-anchor-text-non-descriptive',
    name: 'Non-Descriptive Anchor Text',
    category: 'links',
    severity: 'warning',
    description: 'Anchor text should describe the link destination',
    check: (ctx) => {
      if (!ctx.allLinks || ctx.allLinks.length === 0) {
        return createResult(
          { id: 'links-anchor-text-non-descriptive', name: 'Non-Descriptive Anchor Text', category: 'links', severity: 'warning' },
          'info',
          'Not applicable (no links data available)',
          { recommendation: 'This rule checks for descriptive anchor text on all links when link data is available' }
        );
      }

      const nonDescriptive = ctx.allLinks.filter(
        (link) => link.text && isGenericAnchorText(link.text)
      );

      if (nonDescriptive.length > 0) {
        return createResult(
          { id: 'links-anchor-text-non-descriptive', name: 'Non-Descriptive Anchor Text', category: 'links', severity: 'warning' },
          'warn',
          `${nonDescriptive.length} link(s) with non-descriptive anchor text`,
          {
            value: nonDescriptive.length,
            recommendation: 'Replace generic text with descriptive anchors',
            evidence: {
              found: nonDescriptive.slice(0, 5).map((l) => `"${l.text}" → ${l.href}`),
              issue: 'Generic anchor text like "click here" provides no context',
              example: 'Instead of <a href="/pricing">Click here</a>, use <a href="/pricing">View our pricing plans</a>',
            },
          }
        );
      }
      return createResult(
        { id: 'links-anchor-text-non-descriptive', name: 'Non-Descriptive Anchor Text', category: 'links', severity: 'warning' },
        'pass',
        'All links have descriptive anchor text'
      );
    },
  },
  {
    id: 'links-self-referencing',
    name: 'Self-Referencing Links',
    category: 'links',
    severity: 'info',
    description: 'Pages should not link to themselves excessively',
    check: (ctx) => {
      if (!ctx.selfReferencingLinks) {
        return createResult(
          { id: 'links-self-referencing', name: 'Self-Referencing Links', category: 'links', severity: 'info' },
          'info',
          'Not applicable (self-referencing links data unavailable)',
          { recommendation: 'This rule checks for excessive self-referencing links when link data is available' }
        );
      }

      if (ctx.selfReferencingLinks > 3) {
        return createResult(
          { id: 'links-self-referencing', name: 'Self-Referencing Links', category: 'links', severity: 'info' },
          'info',
          `${ctx.selfReferencingLinks} self-referencing link(s)`,
          {
            value: ctx.selfReferencingLinks,
            recommendation: 'Remove unnecessary self-referencing links',
            evidence: {
              impact: 'Self-links can confuse users and dilute link equity',
            },
          }
        );
      }
      return createResult(
        { id: 'links-self-referencing', name: 'Self-Referencing Links', category: 'links', severity: 'info' },
        'pass',
        `Self-referencing links are acceptable (${ctx.selfReferencingLinks} found)`,
        { value: ctx.selfReferencingLinks }
      );
    },
  },
  {
    id: 'links-broken-internal',
    name: 'Broken Internal Links',
    category: 'links',
    severity: 'error',
    description: 'Internal links should not return 4xx errors',
    check: (ctx) => {
      if (!ctx.brokenInternalLinks || ctx.brokenInternalLinks.length === 0) {
        return createResult(
          { id: 'links-broken-internal', name: 'Broken Internal Links', category: 'links', severity: 'error' },
          'pass',
          'No broken internal links detected'
        );
      }

      return createResult(
        { id: 'links-broken-internal', name: 'Broken Internal Links', category: 'links', severity: 'error' },
        'fail',
        `${ctx.brokenInternalLinks.length} broken internal link(s)`,
        {
          value: ctx.brokenInternalLinks.length,
          recommendation: 'Fix or remove broken internal links',
          evidence: {
            found: ctx.brokenInternalLinks.slice(0, 10),
            impact: 'Broken links harm user experience and waste crawl budget',
          },
        }
      );
    },
  },
  {
    id: 'links-broken-external',
    name: 'Broken External Links',
    category: 'links',
    severity: 'warning',
    description: 'External links should not return 4xx errors',
    check: (ctx) => {
      if (!ctx.brokenExternalLinks || ctx.brokenExternalLinks.length === 0) {
        return createResult(
          { id: 'links-broken-external', name: 'Broken External Links', category: 'links', severity: 'warning' },
          'pass',
          'No broken external links detected'
        );
      }

      return createResult(
        { id: 'links-broken-external', name: 'Broken External Links', category: 'links', severity: 'warning' },
        'warn',
        `${ctx.brokenExternalLinks.length} broken external link(s)`,
        {
          value: ctx.brokenExternalLinks.length,
          recommendation: 'Update or remove broken external links',
          evidence: {
            found: ctx.brokenExternalLinks.slice(0, 10),
            impact: 'Broken external links reduce trust and user experience',
          },
        }
      );
    },
  },
  {
    id: 'links-redirect-chains',
    name: 'Redirect Chain Links',
    category: 'links',
    severity: 'warning',
    description: 'Internal links should not point to redirect chains',
    check: (ctx) => {
      if (!ctx.redirectChainLinks || ctx.redirectChainLinks.length === 0) {
        return createResult(
          { id: 'links-redirect-chains', name: 'Redirect Chain Links', category: 'links', severity: 'warning' },
          'pass',
          'No redirect chain links detected'
        );
      }

      return createResult(
        { id: 'links-redirect-chains', name: 'Redirect Chain Links', category: 'links', severity: 'warning' },
        'warn',
        `${ctx.redirectChainLinks.length} link(s) with redirect chains`,
        {
          value: ctx.redirectChainLinks.length,
          recommendation: 'Update links to point directly to final destination',
          evidence: {
            found: ctx.redirectChainLinks.slice(0, 5).map((l: { from: string; to: string; hops: number }) =>
              `${l.from} → ${l.to} (${l.hops} hops)`
            ),
            impact: 'Redirect chains slow page load and waste crawl budget',
          },
        }
      );
    },
  },
  {
    id: 'links-few-internal',
    name: 'Pages with Few Internal Links',
    category: 'links',
    severity: 'warning',
    description: 'Pages should have at least 3 internal links',
    check: (ctx) => {
      if (ctx.internalLinks === undefined) {
        return createResult(
          { id: 'links-few-internal', name: 'Pages with Few Internal Links', category: 'links', severity: 'warning' },
          'info',
          'Not applicable (internal links data unavailable)',
          { recommendation: 'This rule checks for sufficient internal linking when link data is available' }
        );
      }

      if (ctx.internalLinks < 3) {
        return createResult(
          { id: 'links-few-internal', name: 'Pages with Few Internal Links', category: 'links', severity: 'warning' },
          'warn',
          `Only ${ctx.internalLinks} internal link(s)`,
          {
            value: ctx.internalLinks,
            recommendation: 'Add more internal links to improve site navigation',
            evidence: {
              found: ctx.internalLinks,
              expected: '3 or more internal links',
              impact: 'Few internal links isolate pages and hurt discoverability',
            },
          }
        );
      }
      return createResult(
        { id: 'links-few-internal', name: 'Pages with Few Internal Links', category: 'links', severity: 'warning' },
        'pass',
        `Good internal linking (${ctx.internalLinks} internal links)`,
        { value: ctx.internalLinks }
      );
    },
  },
  {
    id: 'links-orphan-page',
    name: 'Orphan Page Detection',
    category: 'links',
    severity: 'warning',
    description: 'Pages should have incoming internal links',
    check: (ctx) => {
      if (ctx.incomingInternalLinks === undefined) {
        return createResult(
          { id: 'links-orphan-page', name: 'Orphan Page Detection', category: 'links', severity: 'warning' },
          'info',
          'Not applicable (incoming links data unavailable)',
          { recommendation: 'This rule checks for orphan pages when incoming link data is available' }
        );
      }
      if (ctx.isStartPage) {
        return createResult(
          { id: 'links-orphan-page', name: 'Orphan Page Detection', category: 'links', severity: 'warning' },
          'info',
          'Not applicable (start page does not require incoming links)',
          { recommendation: 'This rule checks non-homepage pages for incoming internal links' }
        );
      }

      if (ctx.incomingInternalLinks === 0) {
        return createResult(
          { id: 'links-orphan-page', name: 'Orphan Page Detection', category: 'links', severity: 'warning' },
          'warn',
          'Page has no incoming internal links (orphan)',
          {
            value: 0,
            recommendation: 'Add internal links pointing to this page',
            evidence: {
              impact: 'Orphan pages are hard to discover and may not be indexed',
            },
          }
        );
      }
      return createResult(
        { id: 'links-orphan-page', name: 'Orphan Page Detection', category: 'links', severity: 'warning' },
        'pass',
        `Page has incoming internal links (${ctx.incomingInternalLinks} links)`,
        { value: ctx.incomingInternalLinks }
      );
    },
  },
  {
    id: 'links-click-depth',
    name: 'Page Click Depth',
    category: 'links',
    severity: 'warning',
    description: 'Important pages should be within 3 clicks from homepage',
    check: (ctx) => {
      if (ctx.clickDepth === undefined) {
        return createResult(
          { id: 'links-click-depth', name: 'Page Click Depth', category: 'links', severity: 'warning' },
          'info',
          'Not applicable (click depth data unavailable)',
          { recommendation: 'This rule checks page depth from homepage when crawl data is available' }
        );
      }

      if (ctx.clickDepth > 3) {
        return createResult(
          { id: 'links-click-depth', name: 'Page Click Depth', category: 'links', severity: 'warning' },
          'warn',
          `Page is ${ctx.clickDepth} clicks from homepage`,
          {
            value: ctx.clickDepth,
            recommendation: 'Improve site structure to keep pages within 3 clicks',
            evidence: {
              found: `${ctx.clickDepth} clicks`,
              expected: '3 clicks or less',
              impact: 'Deep pages are harder to discover and get less link equity',
            },
          }
        );
      }

      return createResult(
        { id: 'links-click-depth', name: 'Page Click Depth', category: 'links', severity: 'warning' },
        'pass',
        `Page is ${ctx.clickDepth} click(s) from homepage`,
        { value: ctx.clickDepth }
      );
    },
  },
  {
    id: 'links-external-ratio',
    name: 'External to Internal Link Ratio',
    category: 'links',
    severity: 'info',
    description: 'Pages should have more internal than external links',
    check: (ctx) => {
      if (ctx.internalLinks === undefined || ctx.externalLinks === undefined) {
        return createResult(
          { id: 'links-external-ratio', name: 'External to Internal Link Ratio', category: 'links', severity: 'info' },
          'info',
          'Not applicable (link ratio data unavailable)',
          { recommendation: 'This rule checks external to internal link ratio when link data is available' }
        );
      }
      if (ctx.totalLinks === undefined || ctx.totalLinks === 0) {
        return createResult(
          { id: 'links-external-ratio', name: 'External to Internal Link Ratio', category: 'links', severity: 'info' },
          'info',
          'Not applicable (no links detected on page)',
          { recommendation: 'This rule checks external to internal link ratio when links are present' }
        );
      }

      const externalRatio = (ctx.externalLinks / ctx.totalLinks) * 100;

      if (externalRatio > 70) {
        return createResult(
          { id: 'links-external-ratio', name: 'External to Internal Link Ratio', category: 'links', severity: 'info' },
          'info',
          `High external link ratio (${Math.round(externalRatio)}%)`,
          {
            value: Math.round(externalRatio),
            recommendation: 'Add more internal links to balance link distribution',
            evidence: {
              found: `${ctx.externalLinks} external / ${ctx.internalLinks} internal`,
              expected: 'More internal than external links',
              impact: 'High external ratio may leak PageRank',
            },
          }
        );
      }
      return createResult(
        { id: 'links-external-ratio', name: 'External to Internal Link Ratio', category: 'links', severity: 'info' },
        'pass',
        `Good link distribution (${Math.round(externalRatio)}% external)`,
        { value: Math.round(externalRatio) }
      );
    },
  },
  {
    id: 'links-nofollow-internal',
    name: 'Internal Nofollow Links',
    category: 'links',
    severity: 'info',
    description: 'Internal links with nofollow prevent PageRank flow',
    check: (ctx) => {
      if (!ctx.nofollowInternalLinks || ctx.nofollowInternalLinks === 0) {
        return createResult(
          { id: 'links-nofollow-internal', name: 'Internal Nofollow Links', category: 'links', severity: 'info' },
          'pass',
          'No internal nofollow links detected'
        );
      }

      return createResult(
        { id: 'links-nofollow-internal', name: 'Internal Nofollow Links', category: 'links', severity: 'info' },
        'info',
        `${ctx.nofollowInternalLinks} internal link(s) with nofollow`,
        {
          value: ctx.nofollowInternalLinks,
          recommendation: 'Remove nofollow from internal links unless intentional',
          evidence: {
            impact: 'Nofollow internal links waste PageRank',
          },
        }
      );
    },
  },

  // ==========================================================================
  // Excessive Links on Page
  // ==========================================================================
  {
    id: 'excessive-links',
    name: 'Excessive Links on Page',
    category: 'links',
    severity: 'warning',
    description: 'Pages should not have more than 3,000 links',
    check: (ctx) => {
      if (ctx.totalLinks === undefined) {
        return createResult(
          { id: 'excessive-links', name: 'Excessive Links on Page', category: 'links', severity: 'warning' },
          'info',
          'Not applicable (total links data unavailable)',
          { recommendation: 'This rule checks for excessive links (>3,000) when link data is available' }
        );
      }

      if (ctx.totalLinks > 3000) {
        return createResult(
          { id: 'excessive-links', name: 'Excessive Links on Page', category: 'links', severity: 'warning' },
          'fail',
          `Page has ${ctx.totalLinks} links (exceeds 3,000 limit)`,
          {
            value: ctx.totalLinks,
            recommendation: 'Reduce the number of links to improve crawlability and page quality',
            evidence: {
              found: ctx.totalLinks,
              expected: '<3,000 links',
              impact: 'Search engines may consider pages with too many links as low-quality or spammy'
            }
          }
        );
      }

      if (ctx.totalLinks > 1000) {
        return createResult(
          { id: 'excessive-links', name: 'Excessive Links on Page', category: 'links', severity: 'warning' },
          'warn',
          `Page has ${ctx.totalLinks} links (consider reducing)`,
          {
            value: ctx.totalLinks,
            recommendation: 'Review and remove unnecessary links',
            evidence: {
              found: ctx.totalLinks,
              expected: '<1,000 links recommended',
              impact: 'Many links dilute page authority and can slow page load'
            }
          }
        );
      }

      return createResult(
        { id: 'excessive-links', name: 'Excessive Links on Page', category: 'links', severity: 'warning' },
        'pass',
        `Links count is acceptable (${ctx.totalLinks} links)`,
        { value: ctx.totalLinks }
      );
    },
  },

  // ==========================================================================
  // Links to Resources (images, PDFs linked with <a>)
  // ==========================================================================
  {
    id: 'links-to-resources',
    name: 'Links to Resources',
    category: 'links',
    severity: 'info',
    description: 'Links should point to pages, not raw resources like images',
    check: (ctx) => {
      if (ctx.linksToResources === undefined) {
        return createResult(
          { id: 'links-to-resources', name: 'Links to Resources', category: 'links', severity: 'info' },
          'info',
          'Not applicable (resource links data unavailable)',
          { recommendation: 'This rule checks for links pointing to raw resources (images, PDFs) when link data is available' }
        );
      }

      if (ctx.linksToResources > 0) {
        return createResult(
          { id: 'links-to-resources', name: 'Links to Resources', category: 'links', severity: 'info' },
          'info',
          `${ctx.linksToResources} links point directly to resources (images, PDFs)`,
          {
            value: ctx.linksToResources,
            recommendation: 'Use appropriate tags (<img>, <embed>) instead of <a> for resources',
            evidence: {
              found: ctx.resourceLinkUrls?.slice(0, 5) || [],
              impact: 'Links to raw resources may confuse crawlers about site architecture'
            }
          }
        );
      }

      return createResult(
        { id: 'links-to-resources', name: 'Links to Resources', category: 'links', severity: 'info' },
        'pass',
        'No direct links to raw resources detected'
      );
    },
  },

  // ==========================================================================
  // 403 Forbidden External Links
  // ==========================================================================
  {
    id: 'links-403-forbidden',
    name: '403 Forbidden Links',
    category: 'links',
    severity: 'warning',
    description: 'External links should not return 403 Forbidden',
    check: (ctx) => {
      if (ctx.forbidden403Links === undefined) {
        return createResult(
          { id: 'links-403-forbidden', name: '403 Forbidden Links', category: 'links', severity: 'warning' },
          'info',
          'Not applicable (forbidden links data unavailable)',
          { recommendation: 'This rule checks for external links returning 403 Forbidden when link validation data is available' }
        );
      }

      if (ctx.forbidden403Links > 0) {
        return createResult(
          { id: 'links-403-forbidden', name: '403 Forbidden Links', category: 'links', severity: 'warning' },
          'warn',
          `${ctx.forbidden403Links} external links return 403 Forbidden`,
          {
            value: ctx.forbidden403Links,
            recommendation: 'Replace or remove links that return 403 errors',
            evidence: {
              found: ctx.forbidden403LinkUrls?.slice(0, 5) || [],
              impact: 'Forbidden links negatively affect user experience'
            }
          }
        );
      }

      return createResult(
        { id: 'links-403-forbidden', name: '403 Forbidden Links', category: 'links', severity: 'warning' },
        'pass',
        'No forbidden (403) links detected'
      );
    },
  },
];

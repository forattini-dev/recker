import { SeoRule, createResult } from './types.js';
import { SEO_THRESHOLDS } from './thresholds.js';

export const linkRules: SeoRule[] = [
  {
    id: 'links-descriptive-text',
    name: 'Link Text',
    category: 'links',
    severity: 'warning',
    description: 'Links should have descriptive anchor text',
    check: (ctx) => {
      if (ctx.totalLinks === undefined || ctx.totalLinks === 0) return null;
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
      return null;
    },
  },
  {
    id: 'links-internal-count',
    name: 'Internal Links',
    category: 'links',
    severity: 'info',
    description: 'Page should have at least 3 internal links',
    check: (ctx) => {
      if (ctx.internalLinks === undefined) return null;
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
      if (ctx.externalLinks === undefined) return null;
      const max = SEO_THRESHOLDS.links.maxExternal;

      if (ctx.externalLinks > max) {
        return createResult(
          { id: 'links-external-count', name: 'External Links', category: 'links', severity: 'info' },
          'warn',
          `Too many external links (${ctx.externalLinks})`,
          { value: ctx.externalLinks, recommendation: `Reduce external links to under ${max}` }
        );
      }
      return null;
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
      return null;
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
      return null;
    },
  },
  {
    id: 'links-sponsored-ugc-directives',
    name: 'Sponsored/UGC Links',
    category: 'links',
    severity: 'info',
    description: 'Rel attributes `sponsored` and `ugc` should be used for paid or user-generated content links.',
    check: (ctx) => {
      if (!ctx.totalLinks) return null;

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
      return null;
    },
  },
];

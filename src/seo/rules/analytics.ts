/**
 * Analytics & Conversion Rules
 *
 * Rules for detecting analytics tools, conversion elements, and tracking setup.
 * Based on web analytics best practices and the importance of measuring user behavior.
 */

import { SeoRule, createResult } from './types.js';

export const analyticsRules: SeoRule[] = [
  // ==========================================================================
  // Analytics Detection
  // ==========================================================================
  {
    id: 'analytics-installed',
    name: 'Analytics Installed',
    category: 'technical',
    severity: 'warning',
    description: 'Page should have analytics tracking installed',
    check: (ctx) => {
      if (ctx.analyticsDetected === undefined) {
        return createResult(
          { id: 'analytics-installed', name: 'Analytics Installed', category: 'technical', severity: 'warning' },
          'info',
          'Not applicable (analytics detection data unavailable)',
          { recommendation: 'This rule checks for analytics tracking to measure user behavior' }
        );
      }

      if (!ctx.analyticsDetected || ctx.analyticsProviders?.length === 0) {
        return createResult(
          { id: 'analytics-installed', name: 'Analytics Installed', category: 'technical', severity: 'warning' },
          'warn',
          'No analytics tracking detected',
          {
            recommendation: 'Install analytics to understand user behavior and optimize conversions.',
            evidence: {
              found: 'No analytics scripts detected',
              expected: 'Google Analytics, GTM, or other analytics provider',
              impact: 'Without analytics, you cannot measure traffic sources, user behavior, conversion rates, or content performance. The average conversion rate is only 2.35% - optimization requires data.',
              example: '<!-- Google Analytics 4 -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"></script>',
              learnMore: 'https://marketingplatform.google.com/about/analytics/',
            },
          }
        );
      }

      return createResult(
        { id: 'analytics-installed', name: 'Analytics Installed', category: 'technical', severity: 'warning' },
        'pass',
        `Analytics detected: ${ctx.analyticsProviders?.join(', ')}`,
        { value: ctx.analyticsProviders?.join(', ') }
      );
    },
  },
  {
    id: 'google-analytics-4',
    name: 'Google Analytics 4',
    category: 'technical',
    severity: 'info',
    description: 'Check for modern GA4 vs deprecated Universal Analytics',
    check: (ctx) => {
      if (!ctx.analyticsProviders || ctx.analyticsProviders.length === 0) {
        return createResult(
          { id: 'google-analytics-4', name: 'Google Analytics 4', category: 'technical', severity: 'info' },
          'info',
          'Not applicable (no analytics providers detected)',
          { recommendation: 'This rule checks for modern Google Analytics 4 implementation' }
        );
      }

      const hasUA = ctx.analyticsProviders.some(p => p === 'Universal Analytics (UA)');
      const hasGA4 = ctx.analyticsProviders.some(p => p === 'Google Analytics 4 (GA4)');

      if (hasUA && !hasGA4) {
        return createResult(
          { id: 'google-analytics-4', name: 'Google Analytics 4', category: 'technical', severity: 'info' },
          'warn',
          'Using deprecated Universal Analytics (UA) without GA4',
          {
            recommendation: 'Migrate to Google Analytics 4 - Universal Analytics stopped processing data July 2023.',
            evidence: {
              found: 'Universal Analytics (analytics.js or ga.js)',
              expected: 'Google Analytics 4 (gtag.js with G-XXXXXX)',
              impact: 'Universal Analytics is deprecated and no longer collects data. GA4 offers better cross-platform tracking, machine learning insights, and privacy-focused measurement.',
              example: '<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"></script>',
              learnMore: 'https://support.google.com/analytics/answer/11583528',
            },
          }
        );
      }

      if (hasGA4) {
        return createResult(
          { id: 'google-analytics-4', name: 'Google Analytics 4', category: 'technical', severity: 'info' },
          'pass',
          'Using modern Google Analytics 4'
        );
      }

      return createResult(
        { id: 'google-analytics-4', name: 'Google Analytics 4', category: 'technical', severity: 'info' },
        'pass',
        'Using other analytics provider (not Google Analytics)'
      );
    },
  },
  {
    id: 'google-tag-manager',
    name: 'Google Tag Manager',
    category: 'technical',
    severity: 'info',
    description: 'Google Tag Manager enables flexible tag management without code changes',
    check: (ctx) => {
      if (!ctx.analyticsProviders) {
        return createResult(
          { id: 'google-tag-manager', name: 'Google Tag Manager', category: 'technical', severity: 'info' },
          'info',
          'Not applicable (analytics provider data unavailable)',
          { recommendation: 'This rule checks for Google Tag Manager for easier tag management' }
        );
      }

      const hasGTM = ctx.analyticsProviders.some(p => p === 'Google Tag Manager');

      if (hasGTM) {
        return createResult(
          { id: 'google-tag-manager', name: 'Google Tag Manager', category: 'technical', severity: 'info' },
          'pass',
          'Google Tag Manager detected',
          {
            evidence: {
              found: 'GTM container script',
              impact: 'GTM allows marketing teams to manage tags without developer intervention, improving agility.',
            },
          }
        );
      }

      // Only suggest GTM if they have analytics but no GTM
      if (ctx.analyticsDetected && ctx.analyticsProviders.length > 0) {
        return createResult(
          { id: 'google-tag-manager', name: 'Google Tag Manager', category: 'technical', severity: 'info' },
          'info',
          'Consider using Google Tag Manager for easier tag management',
          {
            recommendation: 'GTM centralizes all tracking scripts and enables non-developers to manage tags.',
            evidence: {
              found: `Direct analytics scripts: ${ctx.analyticsProviders.join(', ')}`,
              expected: 'Google Tag Manager container managing all tags',
              impact: 'GTM provides version control, preview mode, and easy updates without code changes. Best practice for sites with multiple tracking tools.',
              learnMore: 'https://tagmanager.google.com/',
            },
          }
        );
      }

      return createResult(
        { id: 'google-tag-manager', name: 'Google Tag Manager', category: 'technical', severity: 'info' },
        'pass',
        'No analytics detected or GTM not needed'
      );
    },
  },
  {
    id: 'multiple-analytics-warning',
    name: 'Multiple Analytics Scripts',
    category: 'performance',
    severity: 'warning',
    description: 'Too many analytics scripts can impact page performance',
    check: (ctx) => {
      if (!ctx.analyticsProviders || ctx.analyticsProviders.length < 4) {
        return createResult(
          { id: 'multiple-analytics-warning', name: 'Multiple Analytics Scripts', category: 'performance', severity: 'warning' },
          'info',
          'Not applicable (acceptable number of analytics scripts)',
          { recommendation: 'This rule warns when too many analytics scripts impact performance' }
        );
      }

      return createResult(
        { id: 'multiple-analytics-warning', name: 'Multiple Analytics Scripts', category: 'performance', severity: 'warning' },
        'warn',
        `${ctx.analyticsProviders.length} analytics scripts detected`,
        {
          value: ctx.analyticsProviders.length,
          recommendation: 'Consolidate analytics tools to reduce page load impact.',
          evidence: {
            found: ctx.analyticsProviders.join(', '),
            expected: '1-3 analytics tools',
            impact: 'Each analytics script adds HTTP requests, JavaScript execution time, and can slow page rendering. Too many tools can impact Core Web Vitals and user experience.',
            learnMore: 'https://web.dev/articles/optimize-third-party-javascript',
          },
        }
      );
    },
  },
  {
    id: 'heatmap-tool',
    name: 'Heatmap/Session Recording',
    category: 'technical',
    severity: 'info',
    description: 'Heatmap tools like Hotjar help visualize user behavior',
    check: (ctx) => {
      if (!ctx.analyticsProviders) {
        return createResult(
          { id: 'heatmap-tool', name: 'Heatmap Tool', category: 'technical', severity: 'info' },
          'info',
          'Not applicable (analytics provider data unavailable)',
          { recommendation: 'This rule checks for heatmap and session recording tools' }
        );
      }

      const heatmapTools = ['Hotjar', 'Microsoft Clarity', 'FullStory', 'Lucky Orange', 'Crazy Egg'];
      const foundHeatmap = ctx.analyticsProviders.filter(p => heatmapTools.includes(p));

      if (foundHeatmap.length > 0) {
        return createResult(
          { id: 'heatmap-tool', name: 'Heatmap Tool', category: 'technical', severity: 'info' },
          'pass',
          `Heatmap/session recording detected: ${foundHeatmap.join(', ')}`,
          {
            evidence: {
              found: foundHeatmap.join(', '),
              impact: 'Heatmaps and session recordings help identify UX issues, understand user journeys, and optimize conversion paths.',
            },
          }
        );
      }

      return createResult(
        { id: 'heatmap-tool', name: 'Heatmap Tool', category: 'technical', severity: 'info' },
        'pass',
        'No heatmap tool detected (optional)'
      );
    },
  },

  // ==========================================================================
  // Conversion Elements
  // ==========================================================================
  {
    id: 'cta-presence',
    name: 'Call-to-Action Elements',
    category: 'content',
    severity: 'info',
    description: 'Page should have clear call-to-action elements',
    check: (ctx) => {
      if (ctx.ctaButtonsCount === undefined) {
        return createResult(
          { id: 'cta-presence', name: 'Call-to-Action Elements', category: 'content', severity: 'info' },
          'info',
          'Not applicable (CTA button data unavailable)',
          { recommendation: 'This rule checks for clear call-to-action elements to guide conversions' }
        );
      }

      if (ctx.ctaButtonsCount === 0) {
        return createResult(
          { id: 'cta-presence', name: 'Call-to-Action Elements', category: 'content', severity: 'info' },
          'info',
          'No clear call-to-action buttons detected',
          {
            recommendation: 'Add clear CTAs to guide users toward conversion.',
            evidence: {
              found: 'No buttons with action-oriented text',
              expected: 'Buttons like "Get Started", "Sign Up", "Buy Now", "Contact Us"',
              impact: 'Clear CTAs guide users through the conversion funnel. Pages without obvious next steps lose potential conversions.',
              example: '<button class="cta">Get Started Free</button>\n<a href="/signup" class="btn-primary">Start Your Trial</a>',
            },
          }
        );
      }

      return createResult(
        { id: 'cta-presence', name: 'Call-to-Action Elements', category: 'content', severity: 'info' },
        'pass',
        `${ctx.ctaButtonsCount} call-to-action element(s) found`,
        { value: ctx.ctaButtonsCount }
      );
    },
  },
  {
    id: 'form-presence',
    name: 'Form Elements',
    category: 'content',
    severity: 'info',
    description: 'Detect forms for lead generation or conversion',
    check: (ctx) => {
      if (ctx.formCount === undefined) {
        return createResult(
          { id: 'form-presence', name: 'Form Elements', category: 'content', severity: 'info' },
          'info',
          'Not applicable (form count data unavailable)',
          { recommendation: 'This rule checks for forms for lead generation and conversions' }
        );
      }

      if (ctx.formCount > 0) {
        return createResult(
          { id: 'form-presence', name: 'Form Elements', category: 'content', severity: 'info' },
          'pass',
          `${ctx.formCount} form(s) detected for lead capture/conversion`,
          {
            value: ctx.formCount,
            evidence: {
              found: `${ctx.formCount} form elements`,
              impact: 'Forms are essential for lead generation, contact, and conversions.',
            },
          }
        );
      }

      return createResult(
        { id: 'form-presence', name: 'Form Elements', category: 'content', severity: 'info' },
        'pass',
        'No forms detected (may not be needed for this page type)'
      );
    },
  },
  {
    id: 'contact-methods',
    name: 'Contact Methods',
    category: 'content',
    severity: 'info',
    description: 'Page should provide contact methods for user trust',
    check: (ctx) => {
      const methods: string[] = [];

      if (ctx.emailsFound && ctx.emailsFound.length > 0) methods.push('email');
      if (ctx.hasPhoneOnPage) methods.push('phone');
      if (ctx.hasWhatsAppLink) methods.push('WhatsApp');

      if (methods.length === 0 && ctx.hasContactPageLink) {
        return createResult(
          { id: 'contact-methods', name: 'Contact Methods', category: 'content', severity: 'info' },
          'pass',
          'Contact page link found',
          { evidence: { found: 'Link to contact page' } }
        );
      }

      if (methods.length > 0) {
        return createResult(
          { id: 'contact-methods', name: 'Contact Methods', category: 'content', severity: 'info' },
          'pass',
          `Contact methods found: ${methods.join(', ')}`,
          { value: methods.join(', ') }
        );
      }

      return createResult(
        { id: 'contact-methods', name: 'Contact Methods', category: 'content', severity: 'info' },
        'pass',
        'No direct contact methods detected (may not be needed)'
      );
    },
  },

  // ==========================================================================
  // RSS/Atom Feeds
  // ==========================================================================
  {
    id: 'rss-feed-present',
    name: 'RSS Feed',
    category: 'technical',
    severity: 'info',
    description: 'RSS feeds help users and search engines discover new content',
    check: (ctx) => {
      if (ctx.hasRssFeed === undefined) {
        return createResult(
          { id: 'rss-feed-present', name: 'RSS Feed', category: 'technical', severity: 'info' },
          'info',
          'Not applicable (RSS feed data unavailable)',
          { recommendation: 'This rule checks for RSS feeds for content distribution' }
        );
      }

      if (ctx.hasRssFeed) {
        return createResult(
          { id: 'rss-feed-present', name: 'RSS Feed', category: 'technical', severity: 'info' },
          'pass',
          'RSS feed detected',
          {
            value: ctx.rssFeedUrl,
            evidence: {
              found: ctx.rssFeedUrl || 'RSS link tag present',
              impact: 'RSS feeds notify search engines and feed readers when content is updated, improving content discovery.',
            },
          }
        );
      }

      return createResult(
        { id: 'rss-feed-present', name: 'RSS Feed', category: 'technical', severity: 'info' },
        'info',
        'No RSS feed detected',
        {
          recommendation: 'Add an RSS feed for blogs or news sites to improve content distribution.',
          evidence: {
            expected: '<link rel="alternate" type="application/rss+xml" href="/feed.xml">',
            impact: 'RSS feeds help users subscribe to content and notify search engines of updates. Particularly important for blogs and news sites.',
            learnMore: 'https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap#rss-atom',
          },
        }
      );
    },
  },
  {
    id: 'atom-feed-present',
    name: 'Atom Feed',
    category: 'technical',
    severity: 'info',
    description: 'Atom feeds are an alternative to RSS for content syndication',
    check: (ctx) => {
      if (ctx.hasAtomFeed === undefined) {
        return createResult(
          { id: 'atom-feed-present', name: 'Atom Feed', category: 'technical', severity: 'info' },
          'info',
          'Not applicable (Atom feed data unavailable)',
          { recommendation: 'This rule checks for Atom feeds as alternative to RSS' }
        );
      }

      if (ctx.hasAtomFeed) {
        return createResult(
          { id: 'atom-feed-present', name: 'Atom Feed', category: 'technical', severity: 'info' },
          'pass',
          'Atom feed detected',
          {
            value: ctx.atomFeedUrl,
            evidence: {
              found: ctx.atomFeedUrl || 'Atom link tag present',
            },
          }
        );
      }

      return createResult(
        { id: 'atom-feed-present', name: 'Atom Feed', category: 'technical', severity: 'info' },
        'pass',
        'No Atom feed detected (RSS is more common)'
      );
    },
  },

  // ==========================================================================
  // Conflict Detection
  // ==========================================================================
  {
    id: 'noindex-canonical-conflict',
    name: 'Noindex + Canonical Conflict',
    category: 'technical',
    severity: 'error',
    description: 'Having both noindex and canonical sends conflicting signals',
    check: (ctx) => {
      if (!ctx.metaRobots || !ctx.hasCanonical) {
        return createResult(
          { id: 'noindex-canonical-conflict', name: 'Noindex + Canonical Conflict', category: 'technical', severity: 'error' },
          'info',
          'Not applicable (robots meta tag or canonical data unavailable)',
          { recommendation: 'This rule detects conflicting noindex and canonical directives' }
        );
      }

      const hasNoindex = ctx.metaRobots.includes('noindex');

      if (hasNoindex && ctx.hasCanonical) {
        return createResult(
          { id: 'noindex-canonical-conflict', name: 'Noindex + Canonical Conflict', category: 'technical', severity: 'error' },
          'fail',
          'Page has both noindex and canonical - conflicting signals',
          {
            recommendation: 'Remove either noindex or canonical. They serve opposite purposes.',
            evidence: {
              found: `noindex meta tag + canonical: ${ctx.canonicalUrl}`,
              expected: 'Either noindex (to block indexing) OR canonical (to consolidate indexing)',
              impact: 'noindex tells search engines not to index this page, while canonical tells them to consolidate signals to a URL. Google may ignore the canonical if noindex is present, wasting crawl budget.',
              issue: 'Conflicting indexing directives',
              learnMore: 'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls',
            },
          }
        );
      }

      return createResult(
        { id: 'noindex-canonical-conflict', name: 'Noindex + Canonical Conflict', category: 'technical', severity: 'error' },
        'pass',
        'No conflicting noindex and canonical directives'
      );
    },
  },
  {
    id: 'noindex-sitemap-hint',
    name: 'Noindex Pages in Sitemap',
    category: 'crawlability',
    severity: 'warning',
    description: 'Pages with noindex should not be in sitemap',
    check: (ctx) => {
      if (!ctx.metaRobots) {
        return createResult(
          { id: 'noindex-sitemap-hint', name: 'Noindex in Sitemap', category: 'crawlability', severity: 'warning' },
          'info',
          'Not applicable (robots meta tag data unavailable)',
          { recommendation: 'This rule checks if noindex pages are incorrectly included in sitemap' }
        );
      }

      const hasNoindex = ctx.metaRobots.includes('noindex');

      // This is a hint - actual sitemap check happens at spider level
      if (hasNoindex && ctx.pageInSitemap) {
        return createResult(
          { id: 'noindex-sitemap-hint', name: 'Noindex in Sitemap', category: 'crawlability', severity: 'warning' },
          'warn',
          'Page has noindex but appears to be in sitemap',
          {
            recommendation: 'Remove noindex pages from sitemap to avoid wasting crawl budget.',
            evidence: {
              found: 'noindex directive on page that may be in sitemap',
              expected: 'Only indexable pages in sitemap',
              impact: 'Including noindex pages in sitemap wastes crawl budget and sends conflicting signals to search engines.',
              learnMore: 'https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap#best-practices',
            },
          }
        );
      }

      return createResult(
        { id: 'noindex-sitemap-hint', name: 'Noindex in Sitemap', category: 'crawlability', severity: 'warning' },
        'pass',
        'Page is indexable or not in sitemap'
      );
    },
  },
];

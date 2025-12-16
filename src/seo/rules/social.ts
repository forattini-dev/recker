/**
 * SEO Social Media Rules
 * Enhanced rules for social sharing, Open Graph, Twitter Cards, and social signals
 */

import { SeoRule, createResult } from './types.js';

export const socialRules: SeoRule[] = [
  // ==========================================================================
  // Open Graph Enhanced
  // ==========================================================================
  {
    id: 'social-og-image-size',
    name: 'OG Image Size',
    category: 'og',
    severity: 'warning',
    description: 'Open Graph images should meet minimum size requirements',
    check: (ctx) => {
      if (!ctx.ogImage) {
        return createResult(
          { id: 'social-og-image-size', name: 'OG Image Size', category: 'og', severity: 'warning' },
          'info',
          'Not applicable (no og:image)',
          { recommendation: 'This rule checks og:image dimensions when present' }
        );
      }
      if (!ctx.ogImageDimensions) {
        return createResult(
          { id: 'social-og-image-size', name: 'OG Image Size', category: 'og', severity: 'warning' },
          'info',
          'Not applicable (og:image dimensions not available)',
          { recommendation: 'This rule checks if og:image meets minimum size requirements' }
        );
      }

      const { width, height } = ctx.ogImageDimensions;
      const minWidth = 1200;
      const minHeight = 630;

      if (width < minWidth || height < minHeight) {
        return createResult(
          { id: 'social-og-image-size', name: 'OG Image Size', category: 'og', severity: 'warning' },
          'warn',
          `OG image too small: ${width}x${height}`,
          {
            recommendation: 'Use larger images for better social sharing',
            evidence: {
              found: `${width}x${height}px`,
              expected: `Minimum ${minWidth}x${minHeight}px`,
              impact: 'Small images may appear cropped or blurry on social platforms',
              learnMore: 'https://developers.facebook.com/docs/sharing/best-practices/',
            },
          }
        );
      }

      return createResult(
        { id: 'social-og-image-size', name: 'OG Image Size', category: 'og', severity: 'warning' },
        'pass',
        `OG image: ${width}x${height}px`
      );
    },
  },
  {
    id: 'social-og-image-aspect-ratio',
    name: 'OG Image Aspect Ratio',
    category: 'og',
    severity: 'info',
    description: 'Open Graph images should use optimal aspect ratio',
    check: (ctx) => {
      if (!ctx.ogImageDimensions) {
        return createResult(
          { id: 'social-og-image-aspect-ratio', name: 'OG Image Aspect Ratio', category: 'og', severity: 'info' },
          'info',
          'Not applicable (og:image dimensions not available)',
          { recommendation: 'This rule checks og:image aspect ratio when dimensions are available' }
        );
      }

      const { width, height } = ctx.ogImageDimensions;
      const ratio = width / height;
      const optimalRatio = 1.91; // 1.91:1 is optimal for Facebook/LinkedIn
      const tolerance = 0.1;

      if (Math.abs(ratio - optimalRatio) > tolerance) {
        return createResult(
          { id: 'social-og-image-aspect-ratio', name: 'OG Image Aspect Ratio', category: 'og', severity: 'info' },
          'info',
          `OG image ratio: ${ratio.toFixed(2)}:1`,
          {
            recommendation: 'Use 1.91:1 aspect ratio for optimal display',
            evidence: {
              found: `${ratio.toFixed(2)}:1`,
              expected: '1.91:1 (e.g., 1200x628)',
              impact: 'Non-optimal ratios may be cropped on social platforms',
            },
          }
        );
      }

      return createResult(
        { id: 'social-og-image-aspect-ratio', name: 'OG Image Aspect Ratio', category: 'og', severity: 'info' },
        'pass',
        'OG image has optimal aspect ratio'
      );
    },
  },
  {
    id: 'social-og-locale',
    name: 'OG Locale',
    category: 'og',
    severity: 'info',
    description: 'Open Graph should specify content locale',
    check: (ctx) => {
      if (ctx.ogLocale === undefined) {
        return createResult(
          { id: 'social-og-locale', name: 'OG Locale', category: 'og', severity: 'info' },
          'info',
          'Not applicable (og:locale property not checked)',
          { recommendation: 'This rule checks og:locale when locale data is available' }
        );
      }

      if (!ctx.ogLocale) {
        return createResult(
          { id: 'social-og-locale', name: 'OG Locale', category: 'og', severity: 'info' },
          'info',
          'Missing og:locale',
          {
            recommendation: 'Add og:locale for international content',
            evidence: {
              expected: '<meta property="og:locale" content="en_US">',
              impact: 'Helps Facebook display content to correct language audience',
            },
          }
        );
      }

      return createResult(
        { id: 'social-og-locale', name: 'OG Locale', category: 'og', severity: 'info' },
        'pass',
        `Locale: ${ctx.ogLocale}`
      );
    },
  },
  {
    id: 'social-og-locale-alternate',
    name: 'OG Locale Alternates',
    category: 'og',
    severity: 'info',
    description: 'Multi-language sites should specify alternate locales',
    check: (ctx) => {
      if (!ctx.ogLocale) {
        return createResult(
          { id: 'social-og-locale-alternate', name: 'OG Locale Alternates', category: 'og', severity: 'info' },
          'info',
          'Not applicable (no og:locale)',
          { recommendation: 'This rule checks for alternate locales when og:locale is present' }
        );
      }
      if (!ctx.hreflangTags || ctx.hreflangTags.length <= 1) {
        return createResult(
          { id: 'social-og-locale-alternate', name: 'OG Locale Alternates', category: 'og', severity: 'info' },
          'info',
          'Not applicable (single language site)',
          { recommendation: 'This rule checks for og:locale:alternate on multi-language sites' }
        );
      }
      if (ctx.ogLocaleAlternate === undefined) {
        return createResult(
          { id: 'social-og-locale-alternate', name: 'OG Locale Alternates', category: 'og', severity: 'info' },
          'info',
          'Not applicable (og:locale:alternate property not checked)',
          { recommendation: 'This rule checks og:locale:alternate when data is available' }
        );
      }

      if (!ctx.ogLocaleAlternate || ctx.ogLocaleAlternate.length === 0) {
        return createResult(
          { id: 'social-og-locale-alternate', name: 'OG Locale Alternates', category: 'og', severity: 'info' },
          'info',
          'Missing og:locale:alternate for multi-language site',
          {
            recommendation: 'Add og:locale:alternate for other language versions',
            evidence: {
              found: `${ctx.hreflangTags.length} languages but no og:locale:alternate`,
              expected: '<meta property="og:locale:alternate" content="es_ES">',
              impact: 'Helps Facebook understand available language versions',
            },
          }
        );
      }

      return createResult(
        { id: 'social-og-locale-alternate', name: 'OG Locale Alternates', category: 'og', severity: 'info' },
        'pass',
        `${ctx.ogLocaleAlternate.length} alternate locale(s)`
      );
    },
  },
  {
    id: 'social-og-article-tags',
    name: 'OG Article Tags',
    category: 'og',
    severity: 'info',
    description: 'Article pages should include article-specific Open Graph tags',
    check: (ctx) => {
      if (ctx.ogType !== 'article') {
        return createResult(
          { id: 'social-og-article-tags', name: 'OG Article Tags', category: 'og', severity: 'info' },
          'info',
          'Not applicable (page is not an article)',
          { recommendation: 'This rule checks article-specific Open Graph tags for article pages' }
        );
      }
      if (ctx.ogArticleTags === undefined) {
        return createResult(
          { id: 'social-og-article-tags', name: 'OG Article Tags', category: 'og', severity: 'info' },
          'info',
          'Not applicable (article tags property not checked)',
          { recommendation: 'This rule checks article-specific Open Graph tags when data is available' }
        );
      }

      const missing: string[] = [];
      if (!ctx.ogArticlePublishedTime) missing.push('article:published_time');
      if (!ctx.ogArticleAuthor) missing.push('article:author');

      if (missing.length > 0) {
        return createResult(
          { id: 'social-og-article-tags', name: 'OG Article Tags', category: 'og', severity: 'info' },
          'info',
          `Missing article OG tags: ${missing.join(', ')}`,
          {
            recommendation: 'Add article-specific Open Graph tags',
            evidence: {
              found: missing,
              expected: ['article:published_time', 'article:author', 'article:section', 'article:tag'],
              impact: 'Rich article metadata improves social sharing appearance',
            },
          }
        );
      }

      return createResult(
        { id: 'social-og-article-tags', name: 'OG Article Tags', category: 'og', severity: 'info' },
        'pass',
        'Article OG tags present'
      );
    },
  },

  // ==========================================================================
  // Twitter Cards Enhanced
  // ==========================================================================
  {
    id: 'social-twitter-large-image',
    name: 'Twitter Large Image',
    category: 'twitter',
    severity: 'info',
    description: 'Consider using summary_large_image for better visibility',
    check: (ctx) => {
      if (!ctx.twitterCard) {
        return createResult(
          { id: 'social-twitter-large-image', name: 'Twitter Large Image', category: 'twitter', severity: 'info' },
          'info',
          'Not applicable (no twitter:card)',
          { recommendation: 'This rule checks Twitter card type when present' }
        );
      }

      if (ctx.twitterCard === 'summary') {
        return createResult(
          { id: 'social-twitter-large-image', name: 'Twitter Large Image', category: 'twitter', severity: 'info' },
          'info',
          'Using summary card (small image)',
          {
            recommendation: 'Consider summary_large_image for more visual impact',
            evidence: {
              found: 'summary',
              expected: 'summary_large_image for content-rich pages',
              impact: 'Large images get 2x more engagement on Twitter',
            },
          }
        );
      }

      return createResult(
        { id: 'social-twitter-large-image', name: 'Twitter Large Image', category: 'twitter', severity: 'info' },
        'pass',
        `Twitter card: ${ctx.twitterCard}`
      );
    },
  },
  {
    id: 'social-twitter-creator',
    name: 'Twitter Creator',
    category: 'twitter',
    severity: 'info',
    description: 'Article pages should include twitter:creator for attribution',
    check: (ctx) => {
      if (!ctx.twitterCard) {
        return createResult(
          { id: 'social-twitter-creator', name: 'Twitter Creator', category: 'twitter', severity: 'info' },
          'info',
          'Not applicable (no twitter:card)',
          { recommendation: 'This rule checks twitter:creator when Twitter Card is present' }
        );
      }
      if (ctx.ogType !== 'article') {
        return createResult(
          { id: 'social-twitter-creator', name: 'Twitter Creator', category: 'twitter', severity: 'info' },
          'info',
          'Not applicable (page is not an article)',
          { recommendation: 'This rule checks twitter:creator for article pages' }
        );
      }
      if (ctx.twitterCreator === undefined) {
        return createResult(
          { id: 'social-twitter-creator', name: 'Twitter Creator', category: 'twitter', severity: 'info' },
          'info',
          'Not applicable (twitter:creator property not checked)',
          { recommendation: 'This rule checks twitter:creator when data is available' }
        );
      }

      if (!ctx.twitterCreator) {
        return createResult(
          { id: 'social-twitter-creator', name: 'Twitter Creator', category: 'twitter', severity: 'info' },
          'info',
          'Missing twitter:creator on article',
          {
            recommendation: 'Add twitter:creator for author attribution',
            evidence: {
              expected: '<meta name="twitter:creator" content="@username">',
              impact: 'Attributes content to author and enables analytics',
            },
          }
        );
      }

      return createResult(
        { id: 'social-twitter-creator', name: 'Twitter Creator', category: 'twitter', severity: 'info' },
        'pass',
        `Creator: ${ctx.twitterCreator}`
      );
    },
  },
  {
    id: 'social-twitter-image-alt',
    name: 'Twitter Image Alt',
    category: 'twitter',
    severity: 'info',
    description: 'Twitter images should have alt text for accessibility',
    check: (ctx) => {
      if (!ctx.twitterImage) {
        return createResult(
          { id: 'social-twitter-image-alt', name: 'Twitter Image Alt', category: 'twitter', severity: 'info' },
          'info',
          'Not applicable (no twitter:image)',
          { recommendation: 'This rule checks twitter:image:alt when Twitter image is present' }
        );
      }
      if (ctx.twitterImageAlt === undefined) {
        return createResult(
          { id: 'social-twitter-image-alt', name: 'Twitter Image Alt', category: 'twitter', severity: 'info' },
          'info',
          'Not applicable (twitter:image:alt property not checked)',
          { recommendation: 'This rule checks twitter:image:alt when data is available' }
        );
      }

      if (!ctx.twitterImageAlt) {
        return createResult(
          { id: 'social-twitter-image-alt', name: 'Twitter Image Alt', category: 'twitter', severity: 'info' },
          'info',
          'Missing twitter:image:alt',
          {
            recommendation: 'Add alt text for Twitter card image',
            evidence: {
              expected: '<meta name="twitter:image:alt" content="Description of image">',
              impact: 'Improves accessibility for screen reader users',
            },
          }
        );
      }

      return createResult(
        { id: 'social-twitter-image-alt', name: 'Twitter Image Alt', category: 'twitter', severity: 'info' },
        'pass',
        'Twitter image has alt text'
      );
    },
  },

  // ==========================================================================
  // LinkedIn / Professional Networks
  // ==========================================================================
  {
    id: 'social-linkedin-author',
    name: 'LinkedIn Author',
    category: 'og',
    severity: 'info',
    description: 'Professional content should include author information',
    check: (ctx) => {
      if (ctx.ogType !== 'article') {
        return createResult(
          { id: 'social-linkedin-author', name: 'LinkedIn Author', category: 'og', severity: 'info' },
          'info',
          'Not applicable (page is not an article)',
          { recommendation: 'This rule checks author information for article pages' }
        );
      }
      if (ctx.linkedinAuthor === undefined && ctx.ogArticleAuthor === undefined) {
        return createResult(
          { id: 'social-linkedin-author', name: 'LinkedIn Author', category: 'og', severity: 'info' },
          'info',
          'Not applicable (author properties not checked)',
          { recommendation: 'This rule checks author information when data is available' }
        );
      }

      if (!ctx.linkedinAuthor && !ctx.ogArticleAuthor) {
        return createResult(
          { id: 'social-linkedin-author', name: 'LinkedIn Author', category: 'og', severity: 'info' },
          'info',
          'No author specified for LinkedIn',
          {
            recommendation: 'Add author for professional network sharing',
            evidence: {
              expected: '<meta property="article:author" content="https://linkedin.com/in/author">',
              impact: 'LinkedIn uses author info for professional attribution',
            },
          }
        );
      }

      return createResult(
        { id: 'social-linkedin-author', name: 'LinkedIn Author', category: 'og', severity: 'info' },
        'pass',
        'Author information present'
      );
    },
  },

  // ==========================================================================
  // Pinterest
  // ==========================================================================
  {
    id: 'social-pinterest-rich-pins',
    name: 'Pinterest Rich Pins',
    category: 'og',
    severity: 'info',
    description: 'E-commerce and recipe sites should support Pinterest Rich Pins',
    check: (ctx) => {
      // Only check for product pages or recipe pages
      if (!ctx.isProductPage && ctx.ogType !== 'recipe') {
        return createResult(
          { id: 'social-pinterest-rich-pins', name: 'Pinterest Rich Pins', category: 'og', severity: 'info' },
          'info',
          'Not applicable (page is not a product or recipe)',
          { recommendation: 'This rule checks Pinterest Rich Pin support for e-commerce and recipe sites' }
        );
      }
      if (ctx.pinterestRichPinSupport === undefined) {
        return createResult(
          { id: 'social-pinterest-rich-pins', name: 'Pinterest Rich Pins', category: 'og', severity: 'info' },
          'info',
          'Not applicable (Pinterest Rich Pin support not checked)',
          { recommendation: 'This rule checks for structured data when data is available' }
        );
      }

      if (!ctx.pinterestRichPinSupport) {
        return createResult(
          { id: 'social-pinterest-rich-pins', name: 'Pinterest Rich Pins', category: 'og', severity: 'info' },
          'info',
          'No Pinterest Rich Pin support detected',
          {
            recommendation: 'Add structured data for Pinterest Rich Pins',
            evidence: {
              expected: 'Product or Recipe schema.org markup',
              impact: 'Rich Pins show real-time pricing and availability',
              learnMore: 'https://developers.pinterest.com/docs/rich-pins/overview/',
            },
          }
        );
      }

      return createResult(
        { id: 'social-pinterest-rich-pins', name: 'Pinterest Rich Pins', category: 'og', severity: 'info' },
        'pass',
        'Pinterest Rich Pins supported'
      );
    },
  },
  {
    id: 'social-pinterest-nopin',
    name: 'Pinterest Nopin',
    category: 'og',
    severity: 'info',
    description: 'Check for intentional Pinterest blocking',
    check: (ctx) => {
      if (ctx.hasPinterestNopin === undefined) {
        return createResult(
          { id: 'social-pinterest-nopin', name: 'Pinterest Nopin', category: 'og', severity: 'info' },
          'info',
          'Not applicable (Pinterest nopin property not checked)',
          { recommendation: 'This rule checks for Pinterest blocking when data is available' }
        );
      }

      if (ctx.hasPinterestNopin) {
        return createResult(
          { id: 'social-pinterest-nopin', name: 'Pinterest Nopin', category: 'og', severity: 'info' },
          'info',
          'Pinterest pinning is disabled',
          {
            evidence: {
              found: 'data-pin-nopin or <meta name="pinterest" content="nopin">',
              impact: 'Images cannot be pinned to Pinterest',
            },
          }
        );
      }

      return createResult(
        { id: 'social-pinterest-nopin', name: 'Pinterest Nopin', category: 'og', severity: 'info' },
        'info',
        'Not applicable (Pinterest pinning is allowed)',
        { recommendation: 'This rule checks for intentional Pinterest blocking' }
      );
    },
  },

  // ==========================================================================
  // General Social
  // ==========================================================================
  {
    id: 'social-share-completeness',
    name: 'Social Share Completeness',
    category: 'og',
    severity: 'warning',
    description: 'Pages should have complete social sharing metadata',
    check: (ctx) => {
      const hasOg = ctx.ogTitle && ctx.ogDescription && ctx.ogImage;
      const hasTwitter = ctx.twitterCard && (ctx.twitterTitle || ctx.ogTitle);

      if (!hasOg && !hasTwitter) {
        return createResult(
          { id: 'social-share-completeness', name: 'Social Share Completeness', category: 'og', severity: 'warning' },
          'warn',
          'Missing social sharing metadata',
          {
            recommendation: 'Add Open Graph and Twitter Card tags',
            evidence: {
              expected: ['og:title', 'og:description', 'og:image', 'twitter:card'],
              impact: 'Without metadata, social platforms use generic previews',
            },
          }
        );
      }

      if (hasOg && !hasTwitter) {
        return createResult(
          { id: 'social-share-completeness', name: 'Social Share Completeness', category: 'og', severity: 'warning' },
          'info',
          'Has Open Graph but missing Twitter Card',
          {
            recommendation: 'Add twitter:card for better Twitter previews',
          }
        );
      }

      return createResult(
        { id: 'social-share-completeness', name: 'Social Share Completeness', category: 'og', severity: 'warning' },
        'pass',
        'Complete social metadata'
      );
    },
  },
  {
    id: 'social-og-title-length',
    name: 'OG Title Length',
    category: 'og',
    severity: 'info',
    description: 'Open Graph titles should be optimized for social platforms',
    check: (ctx) => {
      if (!ctx.ogTitle) {
        return createResult(
          { id: 'social-og-title-length', name: 'OG Title Length', category: 'og', severity: 'info' },
          'info',
          'Not applicable (no og:title)',
          { recommendation: 'This rule checks og:title length for social platforms when present' }
        );
      }

      const length = ctx.ogTitle.length;
      const maxLength = 60; // Optimal for most platforms

      if (length > maxLength) {
        return createResult(
          { id: 'social-og-title-length', name: 'OG Title Length', category: 'og', severity: 'info' },
          'info',
          `OG title too long: ${length} chars`,
          {
            recommendation: 'Shorten og:title for better display',
            evidence: {
              found: length,
              expected: `Under ${maxLength} characters`,
              impact: 'Long titles may be truncated on social platforms',
            },
          }
        );
      }

      return createResult(
        { id: 'social-og-title-length', name: 'OG Title Length', category: 'og', severity: 'info' },
        'pass',
        `OG title: ${length} chars`
      );
    },
  },
  {
    id: 'social-og-description-length',
    name: 'OG Description Length',
    category: 'og',
    severity: 'info',
    description: 'Open Graph descriptions should be optimized for social platforms',
    check: (ctx) => {
      if (!ctx.ogDescription) {
        return createResult(
          { id: 'social-og-description-length', name: 'OG Description Length', category: 'og', severity: 'info' },
          'info',
          'Not applicable (no og:description)',
          { recommendation: 'This rule checks og:description length for social platforms when present' }
        );
      }

      const length = ctx.ogDescription.length;
      const minLength = 55;
      const maxLength = 200;

      if (length < minLength) {
        return createResult(
          { id: 'social-og-description-length', name: 'OG Description Length', category: 'og', severity: 'info' },
          'info',
          `OG description too short: ${length} chars`,
          {
            recommendation: 'Expand og:description for better context',
            evidence: {
              found: length,
              expected: `${minLength}-${maxLength} characters`,
            },
          }
        );
      }

      if (length > maxLength) {
        return createResult(
          { id: 'social-og-description-length', name: 'OG Description Length', category: 'og', severity: 'info' },
          'info',
          `OG description long: ${length} chars`,
          {
            evidence: {
              found: length,
              expected: `${minLength}-${maxLength} characters (may be truncated)`,
            },
          }
        );
      }

      return createResult(
        { id: 'social-og-description-length', name: 'OG Description Length', category: 'og', severity: 'info' },
        'pass',
        `OG description: ${length} chars`
      );
    },
  },
  {
    id: 'social-fb-app-id',
    name: 'Facebook App ID',
    category: 'og',
    severity: 'info',
    description: 'Facebook App ID enables Insights and domain verification',
    check: (ctx) => {
      if (ctx.fbAppId === undefined) {
        return createResult(
          { id: 'social-fb-app-id', name: 'Facebook App ID', category: 'og', severity: 'info' },
          'info',
          'Not applicable (Facebook App ID property not checked)',
          { recommendation: 'This rule checks for fb:app_id when data is available' }
        );
      }

      if (!ctx.fbAppId) {
        return createResult(
          { id: 'social-fb-app-id', name: 'Facebook App ID', category: 'og', severity: 'info' },
          'info',
          'No Facebook App ID',
          {
            recommendation: 'Add fb:app_id for Facebook Insights',
            evidence: {
              expected: '<meta property="fb:app_id" content="your-app-id">',
              impact: 'Enables Facebook Insights and domain verification',
            },
          }
        );
      }

      return createResult(
        { id: 'social-fb-app-id', name: 'Facebook App ID', category: 'og', severity: 'info' },
        'pass',
        'Facebook App ID present'
      );
    },
  },
  {
    id: 'social-links-presence',
    name: 'Social Media Links',
    category: 'og',
    severity: 'info',
    description: 'Site should link to social media profiles',
    check: (ctx) => {
      if (ctx.socialLinksFound && ctx.socialLinksFound.length > 0) {
        return createResult(
          { id: 'social-links-presence', name: 'Social Media Links', category: 'og', severity: 'info' },
          'pass',
          `Found ${ctx.socialLinksFound.length} social media profile link(s)`,
          { value: ctx.socialLinksFound.length, evidence: { found: ctx.socialLinksFound.slice(0, 5) } }
        );
      }
      return createResult(
        { id: 'social-links-presence', name: 'Social Media Links', category: 'og', severity: 'info' },
        'info',
        'No social media profile links found',
        { recommendation: 'Link to your Facebook, Twitter, Instagram, etc. profiles to build trust.' }
      );
    },
  },

  // ==========================================================================
  // Social Links Enhanced (Accessibility, Security, Placement)
  // ==========================================================================
  {
    id: 'social-links-accessibility',
    name: 'Social Links Accessibility',
    category: 'accessibility',
    severity: 'warning',
    description: 'Social media links should have accessible labels for screen readers',
    check: (ctx) => {
      if (!ctx.totalSocialLinks || ctx.totalSocialLinks === 0) {
        return createResult(
          { id: 'social-links-accessibility', name: 'Social Links Accessibility', category: 'accessibility', severity: 'warning' },
          'info',
          'Not applicable (no social links found)',
          { recommendation: 'This rule checks accessibility of social media links when present' }
        );
      }
      if (ctx.socialLinksWithoutAccessibility === undefined) {
        return createResult(
          { id: 'social-links-accessibility', name: 'Social Links Accessibility', category: 'accessibility', severity: 'warning' },
          'info',
          'Not applicable (social link accessibility not checked)',
          { recommendation: 'This rule checks for accessible labels on social links when data is available' }
        );
      }

      if (ctx.socialLinksWithoutAccessibility > 0) {
        const inaccessibleLinks = ctx.socialLinkDetails
          ?.filter(l => !l.hasAccessibility)
          .map(l => l.platform)
          .slice(0, 5);

        return createResult(
          { id: 'social-links-accessibility', name: 'Social Links Accessibility', category: 'accessibility', severity: 'warning' },
          'warn',
          `${ctx.socialLinksWithoutAccessibility} social link(s) missing accessible labels`,
          {
            recommendation: 'Add aria-label, title, or visible text to social media links',
            evidence: {
              found: ctx.socialLinksWithoutAccessibility,
              expected: 'All social links should have accessible labels',
              impact: 'Screen reader users cannot identify the purpose of icon-only social links',
              example: '<a href="https://twitter.com/..." aria-label="Follow us on Twitter">',
              issue: inaccessibleLinks?.length ? `Inaccessible: ${inaccessibleLinks.join(', ')}` : undefined,
            },
          }
        );
      }

      return createResult(
        { id: 'social-links-accessibility', name: 'Social Links Accessibility', category: 'accessibility', severity: 'warning' },
        'pass',
        'All social links have accessible labels'
      );
    },
  },
  {
    id: 'social-links-security',
    name: 'Social Links Security',
    category: 'security',
    severity: 'warning',
    description: 'External social links should use rel="noopener" to prevent security vulnerabilities',
    check: (ctx) => {
      if (!ctx.totalSocialLinks || ctx.totalSocialLinks === 0) {
        return createResult(
          { id: 'social-links-security', name: 'Social Links Security', category: 'security', severity: 'warning' },
          'info',
          'Not applicable (no social links found)',
          { recommendation: 'This rule checks security attributes of social media links when present' }
        );
      }
      if (ctx.socialLinksWithoutNoopener === undefined) {
        return createResult(
          { id: 'social-links-security', name: 'Social Links Security', category: 'security', severity: 'warning' },
          'info',
          'Not applicable (social link security not checked)',
          { recommendation: 'This rule checks for rel="noopener" on social links when data is available' }
        );
      }

      // Only check links that open in new tab
      const linksWithNewTab = ctx.socialLinkDetails?.filter(l => l.hasNewTab) || [];
      if (linksWithNewTab.length === 0) {
        return createResult(
          { id: 'social-links-security', name: 'Social Links Security', category: 'security', severity: 'warning' },
          'info',
          'Not applicable (no social links with target="_blank")',
          { recommendation: 'This rule checks security for social links that open in new tabs' }
        );
      }

      const insecureLinks = linksWithNewTab.filter(l => !l.hasNoopener);

      if (insecureLinks.length > 0) {
        return createResult(
          { id: 'social-links-security', name: 'Social Links Security', category: 'security', severity: 'warning' },
          'warn',
          `${insecureLinks.length} social link(s) with target="_blank" missing rel="noopener"`,
          {
            recommendation: 'Add rel="noopener noreferrer" to external links with target="_blank"',
            evidence: {
              found: insecureLinks.length,
              expected: 'All target="_blank" links should have rel="noopener"',
              impact: 'Without noopener, the opened page can access window.opener and potentially redirect your page (tabnabbing attack)',
              example: '<a href="https://twitter.com/..." target="_blank" rel="noopener noreferrer">',
              issue: insecureLinks.slice(0, 3).map(l => l.platform).join(', '),
            },
          }
        );
      }

      return createResult(
        { id: 'social-links-security', name: 'Social Links Security', category: 'security', severity: 'warning' },
        'pass',
        'All social links opening in new tabs have proper security attributes'
      );
    },
  },
  {
    id: 'social-links-new-tab',
    name: 'Social Links New Tab',
    category: 'og',
    severity: 'info',
    description: 'Social media links should open in a new tab to keep users on your site',
    check: (ctx) => {
      if (!ctx.totalSocialLinks || ctx.totalSocialLinks === 0) {
        return createResult(
          { id: 'social-links-new-tab', name: 'Social Links New Tab', category: 'og', severity: 'info' },
          'info',
          'Not applicable (no social links found)',
          { recommendation: 'This rule checks if social links open in new tabs when present' }
        );
      }
      if (ctx.socialLinksWithoutNewTab === undefined) {
        return createResult(
          { id: 'social-links-new-tab', name: 'Social Links New Tab', category: 'og', severity: 'info' },
          'info',
          'Not applicable (social link new tab property not checked)',
          { recommendation: 'This rule checks target="_blank" on social links when data is available' }
        );
      }

      if (ctx.socialLinksWithoutNewTab > 0) {
        const linksWithoutNewTab = ctx.socialLinkDetails
          ?.filter(l => !l.hasNewTab)
          .map(l => l.platform)
          .slice(0, 5);

        return createResult(
          { id: 'social-links-new-tab', name: 'Social Links New Tab', category: 'og', severity: 'info' },
          'info',
          `${ctx.socialLinksWithoutNewTab} social link(s) don't open in new tab`,
          {
            recommendation: 'Consider using target="_blank" for social links to keep users on your site',
            evidence: {
              found: ctx.socialLinksWithoutNewTab,
              expected: 'Social links typically open in new tabs',
              impact: 'Users leaving your site may not return; opening in new tab preserves their session',
              example: '<a href="https://twitter.com/..." target="_blank" rel="noopener noreferrer">',
              issue: linksWithoutNewTab?.length ? `Without new tab: ${linksWithoutNewTab.join(', ')}` : undefined,
            },
          }
        );
      }

      return createResult(
        { id: 'social-links-new-tab', name: 'Social Links New Tab', category: 'og', severity: 'info' },
        'pass',
        'All social links open in new tabs'
      );
    },
  },
  {
    id: 'social-links-placement',
    name: 'Social Links Placement',
    category: 'og',
    severity: 'info',
    description: 'Social links should be placed in header or footer for easy discovery',
    check: (ctx) => {
      if (!ctx.totalSocialLinks || ctx.totalSocialLinks === 0) {
        return createResult(
          { id: 'social-links-placement', name: 'Social Links Placement', category: 'og', severity: 'info' },
          'info',
          'Not applicable (no social links found)',
          { recommendation: 'This rule checks social link placement when present' }
        );
      }
      if (ctx.socialLinksInHeader === undefined && ctx.socialLinksInFooter === undefined) {
        return createResult(
          { id: 'social-links-placement', name: 'Social Links Placement', category: 'og', severity: 'info' },
          'info',
          'Not applicable (social link placement not checked)',
          { recommendation: 'This rule checks social link placement when data is available' }
        );
      }

      const inHeaderOrFooter = (ctx.socialLinksInHeader || 0) + (ctx.socialLinksInFooter || 0);

      if (inHeaderOrFooter === 0) {
        return createResult(
          { id: 'social-links-placement', name: 'Social Links Placement', category: 'og', severity: 'info' },
          'info',
          'Social links not found in header or footer',
          {
            recommendation: 'Place social media links in header or footer for consistent visibility',
            evidence: {
              found: 'Social links only in body content',
              expected: 'Social links in header and/or footer',
              impact: 'Users expect to find social links in standard locations; hidden links reduce engagement',
            },
          }
        );
      }

      const locations: string[] = [];
      if (ctx.socialLinksInHeader && ctx.socialLinksInHeader > 0) locations.push(`header (${ctx.socialLinksInHeader})`);
      if (ctx.socialLinksInFooter && ctx.socialLinksInFooter > 0) locations.push(`footer (${ctx.socialLinksInFooter})`);

      return createResult(
        { id: 'social-links-placement', name: 'Social Links Placement', category: 'og', severity: 'info' },
        'pass',
        `Social links found in ${locations.join(' and ')}`
      );
    },
  },
  {
    id: 'social-links-diversity',
    name: 'Social Platform Diversity',
    category: 'og',
    severity: 'info',
    description: 'Consider linking to multiple social platforms for broader reach',
    check: (ctx) => {
      if (!ctx.platformsFound || ctx.platformsFound.length === 0) {
        return createResult(
          { id: 'social-links-diversity', name: 'Social Platform Diversity', category: 'og', severity: 'info' },
          'info',
          'Not applicable (no social platforms found)',
          { recommendation: 'This rule checks social platform diversity when social links are present' }
        );
      }

      const majorPlatforms = ['facebook', 'twitter', 'instagram', 'linkedin', 'youtube'];
      const foundMajor = ctx.platformsFound.filter(p => majorPlatforms.includes(p));

      if (ctx.platformsFound.length === 1) {
        return createResult(
          { id: 'social-links-diversity', name: 'Social Platform Diversity', category: 'og', severity: 'info' },
          'info',
          `Only 1 social platform linked: ${ctx.platformsFound[0]}`,
          {
            recommendation: 'Consider linking to additional relevant social platforms',
            evidence: {
              found: ctx.platformsFound,
              expected: 'Multiple social platforms for broader audience reach',
              impact: 'Different audiences prefer different platforms; diversification increases reach',
            },
          }
        );
      }

      if (foundMajor.length >= 2) {
        return createResult(
          { id: 'social-links-diversity', name: 'Social Platform Diversity', category: 'og', severity: 'info' },
          'pass',
          `Found ${ctx.platformsFound.length} social platform(s): ${ctx.platformsFound.slice(0, 5).join(', ')}`,
          { evidence: { found: ctx.platformsFound } }
        );
      }

      return createResult(
        { id: 'social-links-diversity', name: 'Social Platform Diversity', category: 'og', severity: 'info' },
        'info',
        `${ctx.platformsFound.length} social platform(s) linked`,
        {
          evidence: { found: ctx.platformsFound },
          recommendation: 'Consider adding major platforms like Facebook, Twitter/X, LinkedIn, or Instagram',
        }
      );
    },
  },
  {
    id: 'social-profile-consistency',
    name: 'Social Profile Consistency',
    category: 'og',
    severity: 'info',
    description: 'Social meta tags should be consistent with actual social profile links',
    check: (ctx) => {
      // Check if Twitter site meta matches actual Twitter link
      if (!ctx.twitterSite && !ctx.platformsFound?.includes('twitter')) {
        return createResult(
          { id: 'social-profile-consistency', name: 'Social Profile Consistency', category: 'og', severity: 'info' },
          'info',
          'Not applicable (no Twitter meta or links)',
          { recommendation: 'This rule checks consistency between social meta tags and profile links' }
        );
      }

      const hasTwitterMeta = !!ctx.twitterSite;
      const hasTwitterLink = ctx.platformsFound?.includes('twitter');

      if (hasTwitterMeta && !hasTwitterLink) {
        return createResult(
          { id: 'social-profile-consistency', name: 'Social Profile Consistency', category: 'og', severity: 'info' },
          'info',
          'twitter:site is set but no Twitter profile link found',
          {
            recommendation: 'Add a link to your Twitter profile for consistency',
            evidence: {
              found: `twitter:site: ${ctx.twitterSite}`,
              expected: 'Matching Twitter profile link on page',
              impact: 'Users may want to follow your Twitter account directly from your site',
            },
          }
        );
      }

      if (!hasTwitterMeta && hasTwitterLink) {
        return createResult(
          { id: 'social-profile-consistency', name: 'Social Profile Consistency', category: 'og', severity: 'info' },
          'info',
          'Twitter profile linked but twitter:site meta tag is missing',
          {
            recommendation: 'Add twitter:site meta tag for proper Twitter Card attribution',
            evidence: {
              expected: '<meta name="twitter:site" content="@yourusername">',
              impact: 'Twitter Cards will not show your @username when shared',
            },
          }
        );
      }

      return createResult(
        { id: 'social-profile-consistency', name: 'Social Profile Consistency', category: 'og', severity: 'info' },
        'pass',
        'Social meta tags are consistent with profile links'
      );
    },
  },
];

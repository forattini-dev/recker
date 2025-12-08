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
      if (!ctx.ogImage) return null;
      if (!ctx.ogImageDimensions) return null;

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
      if (!ctx.ogImageDimensions) return null;

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
      if (ctx.ogLocale === undefined) return null;

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
      if (!ctx.ogLocale) return null;
      if (!ctx.hreflangTags || ctx.hreflangTags.length <= 1) return null;
      if (ctx.ogLocaleAlternate === undefined) return null;

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
      if (ctx.ogType !== 'article') return null;
      if (ctx.ogArticleTags === undefined) return null;

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
      if (!ctx.twitterCard) return null;

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
      if (!ctx.twitterCard) return null;
      if (ctx.ogType !== 'article') return null;
      if (ctx.twitterCreator === undefined) return null;

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
      if (!ctx.twitterImage) return null;
      if (ctx.twitterImageAlt === undefined) return null;

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
      if (ctx.ogType !== 'article') return null;
      if (ctx.linkedinAuthor === undefined && ctx.ogArticleAuthor === undefined) return null;

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
      if (!ctx.isProductPage && ctx.ogType !== 'recipe') return null;
      if (ctx.pinterestRichPinSupport === undefined) return null;

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
      if (ctx.hasPinterestNopin === undefined) return null;

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

      return null; // Don't report if nopin is not set
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
      if (!ctx.ogTitle) return null;

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
      if (!ctx.ogDescription) return null;

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
      if (ctx.fbAppId === undefined) return null;

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
];

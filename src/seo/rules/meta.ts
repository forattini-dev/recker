import { SeoRule, createResult } from './types.js';
import { SEO_THRESHOLDS } from './thresholds.js';

export const metaRules: SeoRule[] = [
  // Title Rules
  {
    id: 'title-exists',
    name: 'Title Tag Exists',
    category: 'title',
    severity: 'error',
    description: 'Page must have a title tag',
    check: (ctx) => {
      if (!ctx.title) {
        return createResult(
          { id: 'title-exists', name: 'Title Tag', category: 'title', severity: 'error' },
          'fail',
          'Missing title tag',
          {
            recommendation: 'Add a unique, descriptive title tag between 50-60 characters',
            evidence: {
              expected: '<title>Your Page Title - Brand Name</title>',
              found: 'No <title> tag found in <head>',
              impact: 'Search engines cannot display your page title in results, reducing click-through rate',
              example: '<head>\n  <title>Product Name - Buy Online | YourStore</title>\n</head>',
            },
          }
        );
      }
      return null;
    },
  },
  {
    id: 'title-length',
    name: 'Title Length',
    category: 'title',
    severity: 'warning',
    description: 'Title should be between 50-60 characters',
    check: (ctx) => {
      if (!ctx.title) return null;
      const len = ctx.titleLength ?? ctx.title.length;
      const { min, ideal, max } = SEO_THRESHOLDS.title;

      if (len < min) {
        return createResult(
          { id: 'title-length', name: 'Title Length', category: 'title', severity: 'warning' },
          'warn',
          `Title too short (${len} chars, min: ${min})`,
          { value: len, recommendation: `Expand title to ${ideal.min}-${ideal.max} characters` }
        );
      }
      if (len > max) {
        return createResult(
          { id: 'title-length', name: 'Title Length', category: 'title', severity: 'warning' },
          'warn',
          `Title too long (${len} chars, will be truncated after ~60)`,
          { value: len, recommendation: `Shorten title to under ${ideal.max} characters` }
        );
      }
      if (len >= ideal.min && len <= ideal.max) {
        return createResult(
          { id: 'title-length', name: 'Title Length', category: 'title', severity: 'warning' },
          'pass',
          `Title length ideal (${len} chars)`,
          { value: len }
        );
      }
      return createResult(
        { id: 'title-length', name: 'Title Length', category: 'title', severity: 'warning' },
        'pass',
        `Title length OK (${len} chars)`,
        { value: len }
      );
    },
  },
  {
    id: 'title-no-caps',
    name: 'Title Case',
    category: 'title',
    severity: 'warning',
    description: 'Title should not be ALL CAPS',
    check: (ctx) => {
      if (!ctx.title) return null;
      const words = ctx.title.split(/\s+/).filter((w) => w.length > 3);
      const allCapsWords = words.filter((w) => w === w.toUpperCase() && /[A-Z]/.test(w));

      if (allCapsWords.length > words.length / 2) {
        return createResult(
          { id: 'title-no-caps', name: 'Title Case', category: 'title', severity: 'warning' },
          'warn',
          'Title appears to be ALL CAPS',
          { recommendation: 'Use title case or sentence case for better readability' }
        );
      }
      return null;
    },
  },
  {
    id: 'title-h1-different',
    name: 'Title vs H1',
    category: 'title',
    severity: 'warning',
    description: 'Title and H1 should be similar but not identical',
    check: (ctx) => {
      if (!ctx.title || !ctx.h1Text) return null;
      const titleNorm = ctx.title.toLowerCase().trim();
      const h1Norm = ctx.h1Text.toLowerCase().trim();

      if (titleNorm === h1Norm) {
        return createResult(
          { id: 'title-h1-different', name: 'Title vs H1', category: 'title', severity: 'warning' },
          'warn',
          'Title and H1 are identical',
          { recommendation: 'Consider making H1 slightly different from title for variety' }
        );
      }
      return null;
    },
  },

  // Meta Description Rules
  {
    id: 'meta-description-exists',
    name: 'Meta Description Exists',
    category: 'meta',
    severity: 'error',
    description: 'Page must have a meta description',
    check: (ctx) => {
      if (!ctx.metaDescription) {
        return createResult(
          { id: 'meta-description-exists', name: 'Meta Description', category: 'meta', severity: 'error' },
          'fail',
          'Missing meta description',
          {
            recommendation: 'Add a compelling meta description (120-155 characters) that summarizes the page content',
            evidence: {
              expected: '<meta name="description" content="Your page description here...">',
              found: 'No meta description tag found',
              impact: 'Search engines may generate their own snippet, which may not be optimal for click-through rate',
              example: '<meta name="description" content="Shop the best deals on electronics. Free shipping on orders over $50. 30-day returns.">',
            },
          }
        );
      }
      return null;
    },
  },
  {
    id: 'meta-description-length',
    name: 'Meta Description Length',
    category: 'meta',
    severity: 'warning',
    description: 'Meta description should be 120-155 characters',
    check: (ctx) => {
      if (!ctx.metaDescription) return null;
      const len = ctx.metaDescriptionLength ?? ctx.metaDescription.length;
      const { min, ideal, max } = SEO_THRESHOLDS.metaDescription;

      if (len < min) {
        return createResult(
          { id: 'meta-description-length', name: 'Meta Description Length', category: 'meta', severity: 'warning' },
          'warn',
          `Description too short (${len} chars, min: ${min})`,
          { value: len, recommendation: `Expand to ${ideal.min}-${ideal.max} characters` }
        );
      }
      if (len > max) {
        return createResult(
          { id: 'meta-description-length', name: 'Meta Description Length', category: 'meta', severity: 'warning' },
          'warn',
          `Description may be truncated (${len} chars, max: ${max})`,
          { value: len, recommendation: `Shorten to under ${max} characters` }
        );
      }
      if (len >= ideal.min && len <= ideal.max) {
        return createResult(
          { id: 'meta-description-length', name: 'Meta Description Length', category: 'meta', severity: 'warning' },
          'pass',
          `Description length ideal (${len} chars)`,
          { value: len }
        );
      }
      return createResult(
        { id: 'meta-description-length', name: 'Meta Description Length', category: 'meta', severity: 'warning' },
        'pass',
        `Description length OK (${len} chars)`,
        { value: len }
      );
    },
  },
  {
    id: 'meta-description-unique',
    name: 'Description Quality',
    category: 'meta',
    severity: 'info',
    description: 'Meta description should be unique and compelling',
    check: (ctx) => {
      if (!ctx.metaDescription) return null;
      const desc = ctx.metaDescription.toLowerCase();

      // Check for common placeholder patterns
      const placeholders = ['lorem ipsum', 'description here', 'todo', 'placeholder', 'change this'];
      for (const placeholder of placeholders) {
        if (desc.includes(placeholder)) {
          return createResult(
            { id: 'meta-description-unique', name: 'Description Quality', category: 'meta', severity: 'info' },
            'warn',
            'Meta description appears to be a placeholder',
            { recommendation: 'Replace with a unique, compelling description for better CTR' }
          );
        }
      }
      return null;
    },
  },

  // OpenGraph Rules
  {
    id: 'og-title-exists',
    name: 'OG Title Exists',
    category: 'og',
    severity: 'error',
    description: 'og:title must be defined (do not rely on <title>)',
    check: (ctx) => {
      if (!ctx.ogTitle) {
        return createResult(
          { id: 'og-title-exists', name: 'OG Title', category: 'og', severity: 'error' },
          'fail',
          'Missing og:title',
          {
            recommendation: 'Add og:title meta tag for better social sharing on Facebook, LinkedIn, etc.',
            evidence: {
              expected: '<meta property="og:title" content="Your Page Title">',
              found: 'No og:title meta tag found',
              impact: 'Social platforms may use <title> or auto-generate a title, which may not be optimal',
              example: '<meta property="og:title" content="Amazing Product - 50% Off Today Only!">',
            },
          }
        );
      }
      return null;
    },
  },
  {
    id: 'og-title-length',
    name: 'OG Title Length',
    category: 'og',
    severity: 'warning',
    description: 'og:title should be 60-70 characters (max 90)',
    check: (ctx) => {
      if (!ctx.ogTitle) return null;
      const len = ctx.ogTitle.length;
      const { ideal, max } = SEO_THRESHOLDS.og.title;

      if (len > max) {
        return createResult(
          { id: 'og-title-length', name: 'OG Title Length', category: 'og', severity: 'warning' },
          'warn',
          `og:title too long (${len} chars, truncates at ~${max})`,
          { value: len, recommendation: `Shorten to ${ideal.max} characters` }
        );
      }
      if (len >= ideal.min && len <= ideal.max) {
        return createResult(
          { id: 'og-title-length', name: 'OG Title Length', category: 'og', severity: 'warning' },
          'pass',
          `og:title length ideal (${len} chars)`,
          { value: len }
        );
      }
      return createResult(
        { id: 'og-title-length', name: 'OG Title Length', category: 'og', severity: 'warning' },
        'pass',
        `og:title length OK (${len} chars)`,
        { value: len }
      );
    },
  },
  {
    id: 'og-title-no-emoji',
    name: 'OG Title No Emoji',
    category: 'og',
    severity: 'warning',
    description: 'og:title should not contain emojis (some networks remove them)',
    check: (ctx) => {
      if (!ctx.ogTitle) return null;
      // eslint-disable-next-line no-control-regex
      const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
      if (emojiRegex.test(ctx.ogTitle)) {
        return createResult(
          { id: 'og-title-no-emoji', name: 'OG Title Emoji', category: 'og', severity: 'warning' },
          'warn',
          'og:title contains emojis (some networks remove them)',
          { recommendation: 'Remove emojis from og:title for consistent display' }
        );
      }
      return null;
    },
  },
  {
    id: 'og-description-exists',
    name: 'OG Description Exists',
    category: 'og',
    severity: 'error',
    description: 'og:description must be defined',
    check: (ctx) => {
      if (!ctx.ogDescription) {
        return createResult(
          { id: 'og-description-exists', name: 'OG Description', category: 'og', severity: 'error' },
          'fail',
          'Missing og:description',
          {
            recommendation: 'Add og:description for compelling social media previews',
            evidence: {
              expected: '<meta property="og:description" content="Your description here...">',
              found: 'No og:description meta tag found',
              impact: 'Social shares may have no description or use auto-generated text',
              example: '<meta property="og:description" content="Discover our latest collection. Shop now and get free shipping on orders over $50.">',
            },
          }
        );
      }
      return null;
    },
  },
  {
    id: 'og-description-length',
    name: 'OG Description Length',
    category: 'og',
    severity: 'warning',
    description: 'og:description should be 110-155 characters (max 200)',
    check: (ctx) => {
      if (!ctx.ogDescription) return null;
      const len = ctx.ogDescription.length;
      const { ideal, max } = SEO_THRESHOLDS.og.description;

      if (len > max) {
        return createResult(
          { id: 'og-description-length', name: 'OG Description Length', category: 'og', severity: 'warning' },
          'warn',
          `og:description too long (${len} chars, truncates at ~${max})`,
          { value: len, recommendation: `Shorten to ${ideal.max} characters` }
        );
      }
      if (len >= ideal.min && len <= ideal.max) {
        return createResult(
          { id: 'og-description-length', name: 'OG Description Length', category: 'og', severity: 'warning' },
          'pass',
          `og:description length ideal (${len} chars)`,
          { value: len }
        );
      }
      return createResult(
        { id: 'og-description-length', name: 'OG Description Length', category: 'og', severity: 'warning' },
        'pass',
        `og:description length OK (${len} chars)`,
        { value: len }
      );
    },
  },
  {
    id: 'og-image-exists',
    name: 'OG Image Exists',
    category: 'og',
    severity: 'error',
    description: 'og:image must be defined and publicly accessible',
    check: (ctx) => {
      if (!ctx.ogImage) {
        return createResult(
          { id: 'og-image-exists', name: 'OG Image', category: 'og', severity: 'error' },
          'fail',
          'Missing og:image',
          {
            recommendation: 'Add og:image with a publicly accessible image (1200×630px recommended)',
            evidence: {
              expected: '<meta property="og:image" content="https://yoursite.com/image.jpg">',
              found: 'No og:image meta tag found',
              impact: 'Social shares will have no image preview, significantly reducing engagement',
              example: '<meta property="og:image" content="https://yoursite.com/og-image.jpg">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">',
              learnMore: 'https://developers.facebook.com/docs/sharing/webmasters/images/',
            },
          }
        );
      }
      return null;
    },
  },
  {
    id: 'og-image-https',
    name: 'OG Image HTTPS',
    category: 'og',
    severity: 'error',
    description: 'og:image URL must use HTTPS',
    check: (ctx) => {
      if (!ctx.ogImage) return null;
      if (ctx.ogImage.startsWith('http://')) {
        return createResult(
          { id: 'og-image-https', name: 'OG Image HTTPS', category: 'og', severity: 'error' },
          'fail',
          'og:image uses HTTP instead of HTTPS',
          { value: ctx.ogImage, recommendation: 'Always use HTTPS for og:image URLs' }
        );
      }
      return createResult(
        { id: 'og-image-https', name: 'OG Image HTTPS', category: 'og', severity: 'error' },
        'pass',
        'og:image uses HTTPS'
      );
    },
  },
  {
    id: 'og-url-exists',
    name: 'OG URL Exists',
    category: 'og',
    severity: 'warning',
    description: 'og:url should be defined (canonical URL for sharing)',
    check: (ctx) => {
      if (!ctx.ogUrl) {
        return createResult(
          { id: 'og-url-exists', name: 'OG URL', category: 'og', severity: 'warning' },
          'warn',
          'Missing og:url',
          { recommendation: 'Add og:url with the canonical URL of the page' }
        );
      }
      return createResult(
        { id: 'og-url-exists', name: 'OG URL', category: 'og', severity: 'warning' },
        'pass',
        'og:url is defined',
        { value: ctx.ogUrl }
      );
    },
  },
  {
    id: 'og-type-exists',
    name: 'OG Type Exists',
    category: 'og',
    severity: 'warning',
    description: 'og:type should be defined (website, article, etc.)',
    check: (ctx) => {
      if (!ctx.ogType) {
        return createResult(
          { id: 'og-type-exists', name: 'OG Type', category: 'og', severity: 'warning' },
          'warn',
          'Missing og:type',
          { recommendation: 'Add og:type (website, article, product, etc.)' }
        );
      }
      return createResult(
        { id: 'og-type-exists', name: 'OG Type', category: 'og', severity: 'warning' },
        'pass',
        `og:type is defined (${ctx.ogType})`
      );
    },
  },
  {
    id: 'og-image-url-length',
    name: 'OG Image URL Length',
    category: 'og',
    severity: 'warning',
    description: 'og:image URL should be under 2000 characters',
    check: (ctx) => {
      if (!ctx.ogImage) return null;
      const maxLen = SEO_THRESHOLDS.og.meta.maxUrlLength;
      if (ctx.ogImage.length > maxLen) {
        return createResult(
          { id: 'og-image-url-length', name: 'OG Image URL Length', category: 'og', severity: 'warning' },
          'warn',
          `og:image URL too long (${ctx.ogImage.length} chars, max: ${maxLen})`,
          { value: ctx.ogImage.length, recommendation: 'Shorten the image URL path' }
        );
      }
      return null;
    },
  },
  {
    id: 'og-image-url-quality',
    name: 'OG Image URL Quality',
    category: 'og',
    severity: 'warning',
    description: 'og:image URL should not have expiring tokens or excessive query params',
    check: (ctx) => {
      if (!ctx.ogImage) return null;
      try {
        const url = new URL(ctx.ogImage);
        const params = url.searchParams;
        const expiringParams = ['expires', 'exp', 'token', 'sig', 'signature', 'auth'];
        const hasExpiring = expiringParams.some((p) => params.has(p));
        if (hasExpiring) {
          return createResult(
            { id: 'og-image-url-quality', name: 'OG Image URL Quality', category: 'og', severity: 'warning' },
            'warn',
            'og:image URL may have expiring tokens (Meta caches images)',
            { recommendation: 'Use permanent URLs without expiration tokens for og:image' }
          );
        }
        if (Array.from(params.keys()).length > 5) {
          return createResult(
            { id: 'og-image-url-quality', name: 'OG Image URL Quality', category: 'og', severity: 'warning' },
            'info',
            'og:image URL has many query parameters',
            { recommendation: 'Simplify og:image URL for better caching' }
          );
        }
      } catch {
        // Invalid URL
      }
      return null;
    },
  },
  {
    id: 'og-description-emojis',
    name: 'OG Description Emojis',
    category: 'og',
    severity: 'info',
    description: 'og:description should not have excessive emojis',
    check: (ctx) => {
      if (!ctx.ogDescription) return null;
      const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu;
      const emojis = ctx.ogDescription.match(emojiRegex) || [];
      const maxEmojis = SEO_THRESHOLDS.og.meta.maxDescriptionEmojis;
      if (emojis.length > maxEmojis) {
        return createResult(
          { id: 'og-description-emojis', name: 'OG Description Emojis', category: 'og', severity: 'info' },
          'info',
          `og:description has ${emojis.length} emojis (recommended max: ${maxEmojis})`,
          { value: emojis.length, recommendation: 'Reduce emojis in og:description for better compatibility' }
        );
      }
      return null;
    },
  },
  {
    id: 'og-title-caps',
    name: 'OG Title Caps',
    category: 'og',
    severity: 'warning',
    description: 'og:title should not be mostly uppercase (Meta may flag as low quality)',
    check: (ctx) => {
      if (!ctx.ogTitle) return null;
      const letters = ctx.ogTitle.replace(/[^a-zA-Z]/g, '');
      if (letters.length < 5) return null; 
      const uppercase = letters.replace(/[^A-Z]/g, '').length;
      const percentage = Math.round((uppercase / letters.length) * 100);
      const maxCaps = SEO_THRESHOLDS.og.meta.maxCapsPercentage;
      if (percentage > maxCaps) {
        return createResult(
          { id: 'og-title-caps', name: 'OG Title Caps', category: 'og', severity: 'warning' },
          'warn',
          `og:title has ${percentage}% uppercase (Meta may flag as low quality)`,
          { value: percentage, recommendation: 'Use normal capitalization in og:title' }
        );
      }
      return null;
    },
  },
  {
    id: 'og-meta-complete',
    name: 'Meta Complete',
    category: 'og',
    severity: 'warning',
    description: 'All required OG tags for Meta/Facebook/Instagram must be present',
    check: (ctx) => {
      const required = {
        'og:title': ctx.ogTitle,
        'og:description': ctx.ogDescription,
        'og:image': ctx.ogImage,
        'og:url': ctx.ogUrl,
        'og:type': ctx.ogType,
      };
      const missing = Object.entries(required)
        .filter(([, value]) => !value)
        .map(([key]) => key);

      if (missing.length > 0) {
        return createResult(
          { id: 'og-meta-complete', name: 'Meta Complete', category: 'og', severity: 'warning' },
          'warn',
          `Missing required Meta tags: ${missing.join(', ')}`,
          { recommendation: 'Meta (Facebook/Instagram) requires all 5 OG tags for proper previews' }
        );
      }
      return createResult(
        { id: 'og-meta-complete', name: 'Meta Complete', category: 'og', severity: 'warning' },
        'pass',
        'All required Meta OG tags present'
      );
    },
  },
  {
    id: 'og-fallback-meta-title',
    name: 'Fallback Meta Title',
    category: 'og',
    severity: 'info',
    description: 'Having <meta name="title"> helps fallback on Reddit, Teams, Telegram',
    check: (ctx) => {
      if (ctx.ogTitle && !ctx.title) {
        return createResult(
          { id: 'og-fallback-meta-title', name: 'Fallback Meta Title', category: 'og', severity: 'info' },
          'info',
          'No <title> tag found (og:title exists)',
          { recommendation: 'Add <title> tag as fallback for universal compatibility' }
        );
      }
      return null;
    },
  },
  {
    id: 'og-image-redirects',
    name: 'OG Image Redirects',
    category: 'og',
    severity: 'warning',
    description: 'og:image should not have redirect chains (Meta blocks >2 redirects)',
    check: (ctx) => {
      if (!ctx.ogImage) return null;
      try {
        const url = new URL(ctx.ogImage);
        const redirectPatterns = ['redirect', 'proxy', 'forward', 'goto', 'redir', 'bounce'];
        const hasRedirectPattern = redirectPatterns.some(
          (p) => url.pathname.toLowerCase().includes(p) || url.hostname.toLowerCase().includes(p)
        );
        if (hasRedirectPattern) {
          return createResult(
            { id: 'og-image-redirects', name: 'OG Image Redirects', category: 'og', severity: 'warning' },
            'warn',
            'og:image URL may contain redirects (Meta blocks >2 redirect chains)',
            { recommendation: 'Use direct, permanent image URLs for og:image' }
          );
        }
      } catch {
        // Invalid URL
      }
      return null;
    },
  },
  {
    id: 'og-image-public',
    name: 'OG Image Public',
    category: 'og',
    severity: 'warning',
    description: 'og:image must be publicly accessible (no auth, no private URLs)',
    check: (ctx) => {
      if (!ctx.ogImage) return null;
      try {
        const url = new URL(ctx.ogImage);
        if (url.username || url.password) {
          return createResult(
            { id: 'og-image-public', name: 'OG Image Public', category: 'og', severity: 'warning' },
            'fail',
            'og:image URL contains credentials (will fail on social platforms)',
            { recommendation: 'Use publicly accessible URLs without authentication' }
          );
        }
        const hostname = url.hostname.toLowerCase();
        const privatePatterns = ['localhost', '127.0.0.1', '192.168.', '10.', '172.16.', '172.17.', '172.18.', '172.19.'];
        if (privatePatterns.some((p) => hostname.startsWith(p) || hostname === p.slice(0, -1))) {
          return createResult(
            { id: 'og-image-public', name: 'OG Image Public', category: 'og', severity: 'warning' },
            'fail',
            'og:image URL points to localhost/private IP (not accessible)',
            { recommendation: 'Use publicly accessible URLs for og:image' }
          );
        }
      } catch {
        // Invalid URL
      }
      return null;
    },
  },

  // Twitter Card Rules
  {
    id: 'twitter-card-exists',
    name: 'Twitter Card Exists',
    category: 'twitter',
    severity: 'warning',
    description: 'twitter:card should be defined (summary or summary_large_image)',
    check: (ctx) => {
      if (!ctx.twitterCard) {
        return createResult(
          { id: 'twitter-card-exists', name: 'Twitter Card', category: 'twitter', severity: 'warning' },
          'warn',
          'Missing twitter:card',
          { recommendation: 'Add twitter:card (summary or summary_large_image)' }
        );
      }
      const validCards = ['summary', 'summary_large_image', 'player', 'app'];
      if (!validCards.includes(ctx.twitterCard)) {
        return createResult(
          { id: 'twitter-card-exists', name: 'Twitter Card', category: 'twitter', severity: 'warning' },
          'warn',
          `Invalid twitter:card value: ${ctx.twitterCard}`,
          { recommendation: 'Use summary or summary_large_image' }
        );
      }
      return createResult(
        { id: 'twitter-card-exists', name: 'Twitter Card', category: 'twitter', severity: 'warning' },
        'pass',
        `twitter:card is defined (${ctx.twitterCard})`
      );
    },
  },
  {
    id: 'twitter-title-length',
    name: 'Twitter Title Length',
    category: 'twitter',
    severity: 'warning',
    description: 'twitter:title should be 55-70 characters',
    check: (ctx) => {
      const title = ctx.twitterTitle || ctx.ogTitle;
      if (!title) return null;
      const len = title.length;
      const { ideal, max } = SEO_THRESHOLDS.twitter.title;

      if (len > max) {
        return createResult(
          { id: 'twitter-title-length', name: 'Twitter Title Length', category: 'twitter', severity: 'warning' },
          'warn',
          `twitter:title too long (${len} chars, max: ${max})`,
          { value: len, recommendation: `Shorten to ${ideal.max} characters` }
        );
      }
      return null;
    },
  },
  {
    id: 'twitter-description-length',
    name: 'Twitter Description Length',
    category: 'twitter',
    severity: 'warning',
    description: 'twitter:description should be 125-200 characters',
    check: (ctx) => {
      const description = ctx.twitterDescription || ctx.ogDescription;
      if (!description) return null;
      const len = description.length;
      const { max } = SEO_THRESHOLDS.twitter.description;

      if (len > max) {
        return createResult(
          { id: 'twitter-description-length', name: 'Twitter Description Length', category: 'twitter', severity: 'warning' },
          'warn',
          `twitter:description too long (${len} chars, max: ${max})`,
          { value: len, recommendation: `Shorten to ${max} characters` }
        );
      }
      return null;
    },
  },

  // ==========================================================================
  // Title Too Short
  // ==========================================================================
  {
    id: 'title-too-short',
    name: 'Title Too Short',
    category: 'title',
    severity: 'warning',
    description: 'Title should have at least 10 characters for SEO value',
    check: (ctx) => {
      if (!ctx.title) return null;
      const len = ctx.titleLength ?? ctx.title.length;

      if (len <= 10) {
        return createResult(
          { id: 'title-too-short', name: 'Title Too Short', category: 'title', severity: 'warning' },
          'warn',
          `Title is very short (${len} chars)`,
          {
            value: len,
            recommendation: 'Add more descriptive text to your title (50-60 chars ideal)',
            evidence: {
              found: `${len} characters`,
              expected: 'At least 10 characters, ideally 50-60',
              impact: 'Short titles do not provide enough information about the page and limit keyword potential'
            }
          }
        );
      }

      return null;
    },
  },
];

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
      return createResult(
        { id: 'title-exists', name: 'Title Tag Exists', category: 'title', severity: 'error' },
        'info',
        'Not applicable (page has title tag)',
        { recommendation: 'This rule checks for the presence of a title tag' }
      );
    },
  },
  {
    id: 'title-length',
    name: 'Title Length',
    category: 'title',
    severity: 'warning',
    description: 'Title should be between 50-60 characters',
    check: (ctx) => {
      if (!ctx.title) {
        return createResult(
          { id: 'title-length', name: 'Title Length', category: 'title', severity: 'warning' },
          'info',
          'Not applicable (no title tag)',
          { recommendation: 'This rule checks title length when a title tag is present' }
        );
      }
      const len = ctx.titleLength ?? ctx.title.length;
      const { min, ideal, max } = SEO_THRESHOLDS.title;

      if (len < min) {
        return createResult(
          { id: 'title-length', name: 'Title Length', category: 'title', severity: 'warning' },
          'warn',
          `Title too short (${len} chars, min: ${min})`,
          { 
            value: len, 
            recommendation: `Expand title to ${ideal.min}-${ideal.max} characters. Ensure it includes target keywords and encourages clicks.`,
            evidence: {
              found: `${len} characters`,
              expected: `${ideal.min}-${ideal.max} characters`,
              impact: 'Short titles limit keyword potential and may be replaced by Google.'
            }
          }
        );
      }
      if (len > max) {
        return createResult(
          { id: 'title-length', name: 'Title Length', category: 'title', severity: 'warning' },
          'warn',
          `Title too long (${len} chars, will be truncated after ~60)`,
          { 
            value: len, 
            recommendation: `Shorten title to under ${ideal.max} characters to ensure visibility in SERPs.`,
            evidence: {
              found: `${len} characters`,
              expected: `< ${max} characters`,
              impact: 'Truncated titles may lose click-through rate if key information is hidden.'
            }
          }
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
      if (!ctx.title) {
        return createResult(
          { id: 'title-no-caps', name: 'Title Case', category: 'title', severity: 'warning' },
          'info',
          'Not applicable (no title tag)',
          { recommendation: 'This rule checks title capitalization when a title tag is present' }
        );
      }
      const words = ctx.title.split(/\s+/).filter((w) => w.length > 3);
      const allCapsWords = words.filter((w) => w === w.toUpperCase() && /[A-Z]/.test(w));

      if (allCapsWords.length > words.length / 2) {
        return createResult(
          { id: 'title-no-caps', name: 'Title Case', category: 'title', severity: 'warning' },
          'warn',
          'Title appears to be ALL CAPS',
          {
            recommendation: 'Use title case or sentence case for better readability and click-through rate.',
            evidence: {
              found: ctx.title,
              expected: 'Normal capitalization (Title Case or Sentence case)',
              impact: 'ALL CAPS titles look spammy and may be ignored by users. Google may also rewrite them.',
              example: 'Instead of "BUY SHOES ONLINE NOW", use "Buy Shoes Online - Free Shipping"'
            }
          }
        );
      }
      return createResult(
        { id: 'title-no-caps', name: 'Title Case', category: 'title', severity: 'warning' },
        'info',
        'Not applicable (title uses proper capitalization)',
        { recommendation: 'This rule checks for excessive ALL CAPS usage in title' }
      );
    },
  },
  {
    id: 'title-h1-different',
    name: 'Title vs H1',
    category: 'title',
    severity: 'warning',
    description: 'Title and H1 should be similar but not identical',
    check: (ctx) => {
      if (!ctx.title || !ctx.h1Text) {
        return createResult(
          { id: 'title-h1-different', name: 'Title vs H1', category: 'title', severity: 'warning' },
          'info',
          'Not applicable (missing title or H1)',
          { recommendation: 'This rule compares title and H1 when both are present' }
        );
      }
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
      return createResult(
        { id: 'title-h1-different', name: 'Title vs H1', category: 'title', severity: 'warning' },
        'info',
        'Not applicable (title and H1 are different)',
        { recommendation: 'This rule checks if title and H1 are identical' }
      );
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
      return createResult(
        { id: 'meta-description-exists', name: 'Meta Description Exists', category: 'meta', severity: 'error' },
        'info',
        'Not applicable (page has meta description)',
        { recommendation: 'This rule checks for the presence of a meta description' }
      );
    },
  },
  {
    id: 'meta-description-length',
    name: 'Meta Description Length',
    category: 'meta',
    severity: 'warning',
    description: 'Meta description should be 120-155 characters',
    check: (ctx) => {
      if (!ctx.metaDescription) {
        return createResult(
          { id: 'meta-description-length', name: 'Meta Description Length', category: 'meta', severity: 'warning' },
          'info',
          'Not applicable (no meta description)',
          { recommendation: 'This rule checks meta description length when present' }
        );
      }
      const len = ctx.metaDescriptionLength ?? ctx.metaDescription.length;
      const { min, ideal, max } = SEO_THRESHOLDS.metaDescription;

      if (len < min) {
        return createResult(
          { id: 'meta-description-length', name: 'Meta Description Length', category: 'meta', severity: 'warning' },
          'warn',
          `Description too short (${len} chars, min: ${min})`,
          { 
            value: len, 
            recommendation: `Expand to ${ideal.min}-${ideal.max} characters. Summarize content and include keywords naturally.`,
            evidence: {
              found: `${len} characters`,
              expected: `${ideal.min}-${ideal.max} characters`,
              impact: 'Short descriptions may be ignored by search engines in favor of auto-generated snippets.'
            }
          }
        );
      }
      if (len > max) {
        return createResult(
          { id: 'meta-description-length', name: 'Meta Description Length', category: 'meta', severity: 'warning' },
          'warn',
          `Description may be truncated (${len} chars, max: ${max})`,
          { 
            value: len, 
            recommendation: `Shorten to under ${max} characters. Ensure the most important info is at the start.`,
            evidence: {
              found: `${len} characters`,
              expected: `< ${max} characters`,
              impact: 'Truncated descriptions look unprofessional and may lower CTR.'
            }
          }
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
      if (!ctx.metaDescription) {
        return createResult(
          { id: 'meta-description-unique', name: 'Description Quality', category: 'meta', severity: 'info' },
          'info',
          'Not applicable (no meta description)',
          { recommendation: 'This rule checks meta description quality when present' }
        );
      }
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
      return createResult(
        { id: 'meta-description-unique', name: 'Description Quality', category: 'meta', severity: 'info' },
        'info',
        'Not applicable (description has good quality)',
        { recommendation: 'This rule checks for placeholder patterns in meta description' }
      );
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
      return createResult(
        { id: 'og-title-exists', name: 'OG Title Exists', category: 'og', severity: 'error' },
        'info',
        'Not applicable (page has og:title)',
        { recommendation: 'This rule checks for the presence of og:title meta tag' }
      );
    },
  },
  {
    id: 'og-title-length',
    name: 'OG Title Length',
    category: 'og',
    severity: 'warning',
    description: 'og:title should be 60-70 characters (max 90)',
    check: (ctx) => {
      if (!ctx.ogTitle) {
        return createResult(
          { id: 'og-title-length', name: 'OG Title Length', category: 'og', severity: 'warning' },
          'info',
          'Not applicable (no og:title)',
          { recommendation: 'This rule checks og:title length when present' }
        );
      }
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
      if (!ctx.ogTitle) {
        return createResult(
          { id: 'og-title-no-emoji', name: 'OG Title No Emoji', category: 'og', severity: 'warning' },
          'info',
          'Not applicable (no og:title)',
          { recommendation: 'This rule checks for emojis in og:title when present' }
        );
      }
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
      return createResult(
        { id: 'og-title-no-emoji', name: 'OG Title No Emoji', category: 'og', severity: 'warning' },
        'info',
        'Not applicable (og:title has no emojis)',
        { recommendation: 'This rule checks for emoji characters in og:title' }
      );
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
      return createResult(
        { id: 'og-description-exists', name: 'OG Description Exists', category: 'og', severity: 'error' },
        'info',
        'Not applicable (page has og:description)',
        { recommendation: 'This rule checks for the presence of og:description meta tag' }
      );
    },
  },
  {
    id: 'og-description-length',
    name: 'OG Description Length',
    category: 'og',
    severity: 'warning',
    description: 'og:description should be 110-155 characters (max 200)',
    check: (ctx) => {
      if (!ctx.ogDescription) {
        return createResult(
          { id: 'og-description-length', name: 'OG Description Length', category: 'og', severity: 'warning' },
          'info',
          'Not applicable (no og:description)',
          { recommendation: 'This rule checks og:description length when present' }
        );
      }
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
      return createResult(
        { id: 'og-image-exists', name: 'OG Image Exists', category: 'og', severity: 'error' },
        'info',
        'Not applicable (page has og:image)',
        { recommendation: 'This rule checks for the presence of og:image meta tag' }
      );
    },
  },
  {
    id: 'og-image-https',
    name: 'OG Image HTTPS',
    category: 'og',
    severity: 'error',
    description: 'og:image URL must use HTTPS',
    check: (ctx) => {
      if (!ctx.ogImage) {
        return createResult(
          { id: 'og-image-https', name: 'OG Image HTTPS', category: 'og', severity: 'error' },
          'info',
          'Not applicable (no og:image)',
          { recommendation: 'This rule checks og:image URL protocol when present' }
        );
      }
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
      if (!ctx.ogImage) {
        return createResult(
          { id: 'og-image-url-length', name: 'OG Image URL Length', category: 'og', severity: 'warning' },
          'info',
          'Not applicable (no og:image)',
          { recommendation: 'This rule checks og:image URL length when present' }
        );
      }
      const maxLen = SEO_THRESHOLDS.og.meta.maxUrlLength;
      if (ctx.ogImage.length > maxLen) {
        return createResult(
          { id: 'og-image-url-length', name: 'OG Image URL Length', category: 'og', severity: 'warning' },
          'warn',
          `og:image URL too long (${ctx.ogImage.length} chars, max: ${maxLen})`,
          { value: ctx.ogImage.length, recommendation: 'Shorten the image URL path' }
        );
      }
      return createResult(
        { id: 'og-image-url-length', name: 'OG Image URL Length', category: 'og', severity: 'warning' },
        'info',
        'Not applicable (og:image URL length is acceptable)',
        { recommendation: 'This rule checks if og:image URL exceeds length limits' }
      );
    },
  },
  {
    id: 'og-image-url-quality',
    name: 'OG Image URL Quality',
    category: 'og',
    severity: 'warning',
    description: 'og:image URL should not have expiring tokens or excessive query params',
    check: (ctx) => {
      if (!ctx.ogImage) {
        return createResult(
          { id: 'og-image-url-quality', name: 'OG Image URL Quality', category: 'og', severity: 'warning' },
          'info',
          'Not applicable (no og:image)',
          { recommendation: 'This rule checks og:image URL for expiring tokens when present' }
        );
      }
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
      return createResult(
        { id: 'og-image-url-quality', name: 'OG Image URL Quality', category: 'og', severity: 'warning' },
        'info',
        'Not applicable (og:image URL has good quality)',
        { recommendation: 'This rule checks for expiring tokens and excessive query parameters' }
      );
    },
  },
  {
    id: 'og-description-emojis',
    name: 'OG Description Emojis',
    category: 'og',
    severity: 'info',
    description: 'og:description should not have excessive emojis',
    check: (ctx) => {
      if (!ctx.ogDescription) {
        return createResult(
          { id: 'og-description-emojis', name: 'OG Description Emojis', category: 'og', severity: 'info' },
          'info',
          'Not applicable (no og:description)',
          { recommendation: 'This rule checks emoji usage in og:description when present' }
        );
      }
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
      return createResult(
        { id: 'og-description-emojis', name: 'OG Description Emojis', category: 'og', severity: 'info' },
        'info',
        'Not applicable (og:description has acceptable emoji count)',
        { recommendation: 'This rule checks for excessive emoji usage in og:description' }
      );
    },
  },
  {
    id: 'og-title-caps',
    name: 'OG Title Caps',
    category: 'og',
    severity: 'warning',
    description: 'og:title should not be mostly uppercase (Meta may flag as low quality)',
    check: (ctx) => {
      if (!ctx.ogTitle) {
        return createResult(
          { id: 'og-title-caps', name: 'OG Title Caps', category: 'og', severity: 'warning' },
          'info',
          'Not applicable (no og:title)',
          { recommendation: 'This rule checks capitalization in og:title when present' }
        );
      }
      const letters = ctx.ogTitle.replace(/[^a-zA-Z]/g, '');
      if (letters.length < 5) {
        return createResult(
          { id: 'og-title-caps', name: 'OG Title Caps', category: 'og', severity: 'warning' },
          'info',
          'Not applicable (og:title has too few letters to evaluate)',
          { recommendation: 'This rule checks for excessive uppercase in og:title' }
        );
      } 
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
      return createResult(
        { id: 'og-title-caps', name: 'OG Title Caps', category: 'og', severity: 'warning' },
        'info',
        'Not applicable (og:title uses proper capitalization)',
        { recommendation: 'This rule checks for excessive uppercase in og:title' }
      );
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
      return createResult(
        { id: 'og-fallback-meta-title', name: 'Fallback Meta Title', category: 'og', severity: 'info' },
        'info',
        'Not applicable (page has title tag or no og:title)',
        { recommendation: 'This rule checks for title tag when og:title exists' }
      );
    },
  },
  {
    id: 'og-image-redirects',
    name: 'OG Image Redirects',
    category: 'og',
    severity: 'warning',
    description: 'og:image should not have redirect chains (Meta blocks >2 redirects)',
    check: (ctx) => {
      if (!ctx.ogImage) {
        return createResult(
          { id: 'og-image-redirects', name: 'OG Image Redirects', category: 'og', severity: 'warning' },
          'info',
          'Not applicable (no og:image)',
          { recommendation: 'This rule checks og:image URL for redirect patterns when present' }
        );
      }
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
      return createResult(
        { id: 'og-image-redirects', name: 'OG Image Redirects', category: 'og', severity: 'warning' },
        'info',
        'Not applicable (og:image URL has no redirect patterns)',
        { recommendation: 'This rule checks for redirect patterns in og:image URL' }
      );
    },
  },
  {
    id: 'og-image-public',
    name: 'OG Image Public',
    category: 'og',
    severity: 'warning',
    description: 'og:image must be publicly accessible (no auth, no private URLs)',
    check: (ctx) => {
      if (!ctx.ogImage) {
        return createResult(
          { id: 'og-image-public', name: 'OG Image Public', category: 'og', severity: 'warning' },
          'info',
          'Not applicable (no og:image)',
          { recommendation: 'This rule checks og:image URL accessibility when present' }
        );
      }
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
      return createResult(
        { id: 'og-image-public', name: 'OG Image Public', category: 'og', severity: 'warning' },
        'info',
        'Not applicable (og:image URL is publicly accessible)',
        { recommendation: 'This rule checks for authentication or private IPs in og:image URL' }
      );
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
      if (!title) {
        return createResult(
          { id: 'twitter-title-length', name: 'Twitter Title Length', category: 'twitter', severity: 'warning' },
          'info',
          'Not applicable (no twitter:title or og:title)',
          { recommendation: 'This rule checks Twitter title length when present' }
        );
      }
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
      return createResult(
        { id: 'twitter-title-length', name: 'Twitter Title Length', category: 'twitter', severity: 'warning' },
        'info',
        'Not applicable (Twitter title length is acceptable)',
        { recommendation: 'This rule checks if Twitter title exceeds length limits' }
      );
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
      if (!description) {
        return createResult(
          { id: 'twitter-description-length', name: 'Twitter Description Length', category: 'twitter', severity: 'warning' },
          'info',
          'Not applicable (no twitter:description or og:description)',
          { recommendation: 'This rule checks Twitter description length when present' }
        );
      }
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
      return createResult(
        { id: 'twitter-description-length', name: 'Twitter Description Length', category: 'twitter', severity: 'warning' },
        'info',
        'Not applicable (Twitter description length is acceptable)',
        { recommendation: 'This rule checks if Twitter description exceeds length limits' }
      );
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
      if (!ctx.title) {
        return createResult(
          { id: 'title-too-short', name: 'Title Too Short', category: 'title', severity: 'warning' },
          'info',
          'Not applicable (no title tag)',
          { recommendation: 'This rule checks if title is too short when present' }
        );
      }
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

      return createResult(
        { id: 'title-too-short', name: 'Title Too Short', category: 'title', severity: 'warning' },
        'info',
        'Not applicable (title has sufficient length)',
        { recommendation: 'This rule checks if title is shorter than 10 characters' }
      );
    },
  },
  {
    id: 'keywords-in-title',
    name: 'Keywords in Title',
    category: 'title',
    severity: 'warning',
    description: 'Title should contain main keywords found in content',
    check: (ctx) => {
      if (ctx.keywordsInTitle === false && ctx.topKeywords && ctx.topKeywords.length > 0) {
        return createResult(
          { id: 'keywords-in-title', name: 'Keywords in Title', category: 'title', severity: 'warning' },
          'warn',
          'Title does not appear to contain top keywords',
          {
            recommendation: 'Include your main target keywords in the page title.',
            evidence: {
              found: `Title: "${ctx.title}"`,
              expected: `Should contain one of: ${ctx.topKeywords.join(', ')}`,
              impact: 'Keywords in title are a strong ranking signal.'
            }
          }
        );
      }
      return createResult(
        { id: 'keywords-in-title', name: 'Keywords in Title', category: 'title', severity: 'warning' },
        'info',
        'Not applicable (title contains keywords or no keyword data)',
        { recommendation: 'This rule checks if title contains main keywords from content' }
      );
    },
  },
  {
    id: 'keywords-in-description',
    name: 'Keywords in Description',
    category: 'meta',
    severity: 'info',
    description: 'Meta description should contain main keywords',
    check: (ctx) => {
      if (ctx.keywordsInDescription === false && ctx.topKeywords && ctx.topKeywords.length > 0) {
        return createResult(
          { id: 'keywords-in-description', name: 'Keywords in Description', category: 'meta', severity: 'info' },
          'info',
          'Meta description does not appear to contain top keywords',
          {
            recommendation: 'Include main keywords in the description to embolden them in search results.',
            evidence: {
              found: 'Description does not match top keywords',
              expected: `Should contain one of: ${ctx.topKeywords.join(', ')}`,
              impact: 'Keywords in description are bolded in SERPs, improving CTR.'
            }
          }
        );
      }
      return createResult(
        { id: 'keywords-in-description', name: 'Keywords in Description', category: 'meta', severity: 'info' },
        'info',
        'Not applicable (description contains keywords or no keyword data)',
        { recommendation: 'This rule checks if meta description contains main keywords' }
      );
    },
  },
];

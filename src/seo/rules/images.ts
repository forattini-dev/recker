import { SeoRule, createResult } from './types.js';
import { SEO_THRESHOLDS } from './thresholds.js';
import type { SeoStatus } from '../types.js';

export const imageRules: SeoRule[] = [
  {
    id: 'images-alt-text',
    name: 'Image Alt Text',
    category: 'images',
    severity: 'error',
    description: 'All images must have alt text',
    check: (ctx) => {
      if (ctx.totalImages === undefined || ctx.totalImages === 0) {
        return createResult(
          { id: 'images-alt-text', name: 'Image Alt Text', category: 'images', severity: 'error' },
          'info',
          'Not applicable (no images detected)',
          { recommendation: 'This rule ensures all images have descriptive alt text for accessibility and SEO' }
        );
      }
      const withoutAlt = ctx.imagesWithoutAlt ?? 0;

      if (withoutAlt > 0) {
        const percentage = Math.round((withoutAlt / ctx.totalImages) * 100);
        const severity = withoutAlt > ctx.totalImages / 2 ? 'fail' : 'warn';
        return createResult(
          { id: 'images-alt-text', name: 'Image Alt Text', category: 'images', severity: 'error' },
          severity as SeoStatus,
          `${withoutAlt} of ${ctx.totalImages} images missing alt text (${percentage}%)`,
          {
            value: withoutAlt,
            recommendation: 'Add descriptive alt text to all images. Describe what the image shows and its relevance to the content.',
            evidence: {
              found: `${withoutAlt} images without alt attribute`,
              expected: 'All images should have meaningful alt text',
              impact: 'Missing alt text hurts accessibility (screen readers) and prevents images from appearing in Google Image Search. Alt text is also used as anchor text when images are linked.',
              example: '<img src="product.jpg" alt="Red leather wallet with zipper closure - front view">',
              learnMore: 'https://developers.google.com/search/docs/appearance/google-images#use-descriptive-alt-text'
            }
          }
        );
      }
      return createResult(
        { id: 'images-alt-text', name: 'Image Alt Text', category: 'images', severity: 'error' },
        'pass',
        'All images have alt text'
      );
    },
  },
  {
    id: 'images-dimensions',
    name: 'Image Dimensions',
    category: 'images',
    severity: 'warning',
    description: 'Images should have width and height attributes to prevent CLS',
    check: (ctx) => {
      if (ctx.totalImages === undefined || ctx.totalImages === 0) {
        return createResult(
          { id: 'images-dimensions', name: 'Image Dimensions', category: 'images', severity: 'warning' },
          'info',
          'Not applicable (no images detected)',
          { recommendation: 'This rule checks that images have width and height attributes to prevent layout shifts' }
        );
      }
      const missing = ctx.imagesMissingDimensions ?? 0;

      if (missing > 0) {
        const percentage = Math.round((missing / ctx.totalImages) * 100);
        return createResult(
          { id: 'images-dimensions', name: 'Image Dimensions', category: 'images', severity: 'warning' },
          'warn',
          `${missing} of ${ctx.totalImages} images missing width/height (${percentage}%)`,
          {
            value: missing,
            recommendation: 'Add explicit width and height attributes to all images to reserve space and prevent layout shifts.',
            evidence: {
              found: `${missing} images without dimensions`,
              expected: 'All images should have width and height attributes',
              impact: 'Images without dimensions cause Cumulative Layout Shift (CLS), which negatively affects Core Web Vitals and user experience.',
              example: '<img src="photo.jpg" width="800" height="600" alt="Description">',
              learnMore: 'https://web.dev/optimize-cls/#images-without-dimensions'
            }
          }
        );
      }
      return createResult(
        { id: 'images-dimensions', name: 'Image Dimensions', category: 'images', severity: 'warning' },
        'pass',
        'All images have dimensions defined'
      );
    },
  },
  {
    id: 'images-lazy-loading',
    name: 'Lazy Loading',
    category: 'images',
    severity: 'info',
    description: 'Below-the-fold images should use lazy loading',
    check: (ctx) => {
      if (ctx.totalImages === undefined || ctx.totalImages <= 3) {
        return createResult(
          { id: 'images-lazy-loading', name: 'Lazy Loading', category: 'images', severity: 'info' },
          'info',
          'Not applicable (too few images to require lazy loading)',
          { recommendation: 'This rule checks for lazy loading on pages with multiple images' }
        );
      }
      const lazy = ctx.imagesWithLazyLoad ?? 0;

      if (lazy === 0) {
        return createResult(
          { id: 'images-lazy-loading', name: 'Lazy Loading', category: 'images', severity: 'info' },
          'info',
          'No images use lazy loading',
          {
            recommendation: 'Add loading="lazy" to below-the-fold images to defer loading until they are near the viewport.',
            evidence: {
              found: 'No images with loading="lazy"',
              expected: 'Below-the-fold images should use lazy loading',
              impact: 'Lazy loading reduces initial page load time, saves bandwidth, and improves Core Web Vitals (LCP).',
              example: '<img src="photo.jpg" loading="lazy" alt="Description">',
              learnMore: 'https://web.dev/browser-level-image-lazy-loading/'
            }
          }
        );
      }
      return createResult(
        { id: 'images-lazy-loading', name: 'Lazy Loading', category: 'images', severity: 'info' },
        'pass',
        `${lazy} images use lazy loading`
      );
    },
  },
  {
    id: 'images-format-modern',
    name: 'Modern Image Formats',
    category: 'images',
    severity: 'info',
    description: 'Images should use modern formats like WebP or AVIF',
    check: (ctx) => {
      if (ctx.totalImages === undefined || ctx.totalImages === 0) {
        return createResult(
          { id: 'images-format-modern', name: 'Modern Image Formats', category: 'images', severity: 'info' },
          'info',
          'Not applicable (no images detected)',
          { recommendation: 'This rule checks for modern image formats like WebP and AVIF for better performance' }
        );
      }
      const modern = ctx.imagesUsingModernFormats ?? 0;
      
      // If we have images but none are modern formats
      if (ctx.totalImages > 0 && modern === 0) {
        return createResult(
          { id: 'images-format-modern', name: 'Modern Image Formats', category: 'images', severity: 'info' },
          'info',
          'No images using modern formats (WebP/AVIF)',
          {
            value: modern,
            recommendation: 'Convert images to WebP or AVIF format for 25-50% smaller file sizes with same quality.',
            evidence: {
              found: 'Only traditional formats (JPEG, PNG, GIF)',
              expected: 'At least some images in WebP or AVIF format',
              impact: 'Modern formats significantly reduce page weight and improve load times. WebP has 94% browser support.',
              example: '<picture>\n  <source srcset="image.avif" type="image/avif">\n  <source srcset="image.webp" type="image/webp">\n  <img src="image.jpg" alt="Description">\n</picture>',
              learnMore: 'https://web.dev/uses-webp-images/'
            }
          }
        );
      }
      return createResult(
        { id: 'images-format-modern', name: 'Modern Image Formats', category: 'images', severity: 'info' },
        'pass',
        `${modern} images using modern formats`,
        { value: modern }
      );
    },
  },
  {
    id: 'images-empty-alt',
    name: 'Empty Alt Text',
    category: 'images',
    severity: 'info',
    description: 'Images with empty alt="" are treated as decorative',
    check: (ctx) => {
      const emptyAlt = ctx.imagesWithEmptyAlt ?? 0;
      if (emptyAlt > 0) {
        return createResult(
          { id: 'images-empty-alt', name: 'Empty Alt Text', category: 'images', severity: 'info' },
          'info',
          `${emptyAlt} image(s) with empty alt="" (decorative)`,
          { value: emptyAlt, recommendation: 'Ensure these images are truly decorative' }
        );
      }
      return createResult(
        { id: 'images-empty-alt', name: 'Empty Alt Text', category: 'images', severity: 'info' },
        'pass',
        'No images with empty alt attributes'
      );
    },
  },
  {
    id: 'images-alt-length',
    name: 'Alt Text Length',
    category: 'images',
    severity: 'warning',
    description: 'Alt text should be descriptive (ideal 80-120, max 150 chars)',
    check: (ctx) => {
      if (!ctx.altTextLengths || ctx.altTextLengths.length === 0) {
        return createResult(
          { id: 'images-alt-length', name: 'Alt Text Length', category: 'images', severity: 'warning' },
          'info',
          'Not applicable (no alt text data available)',
          { recommendation: 'This rule checks alt text length to ensure descriptions are meaningful' }
        );
      }

      const { minLength, idealLength, maxLength } = SEO_THRESHOLDS.images.alt;
      let shortAlts = 0;
      let longAlts = 0;
      let nonIdealAlts = 0;

      ctx.altTextLengths.forEach(len => {
        if (len < minLength) shortAlts++;
        else if (len > maxLength) longAlts++;
        else if (len < idealLength.min || len > idealLength.max) nonIdealAlts++;
      });

      if (shortAlts > 0) {
        return createResult(
          { id: 'images-alt-length', name: 'Alt Text Length', category: 'images', severity: 'warning' },
          'warn',
          `${shortAlts} alt text(s) are too short (min: ${minLength} chars)`,
          { value: shortAlts, recommendation: `Make alt texts more descriptive, at least ${minLength} characters.` }
        );
      }
      if (longAlts > 0) {
        return createResult(
          { id: 'images-alt-length', name: 'Alt Text Length', category: 'images', severity: 'warning' },
          'warn',
          `${longAlts} alt text(s) are too long (max: ${maxLength} chars)`,
          { value: longAlts, recommendation: `Shorten alt texts to be concise, under ${maxLength} characters.` }
        );
      }
      if (nonIdealAlts > 0) {
        return createResult(
          { id: 'images-alt-length', name: 'Alt Text Length', category: 'images', severity: 'info' },
          'info',
          `${nonIdealAlts} alt text(s) are not in the ideal length range (${idealLength.min}-${idealLength.max} chars)`,
          { value: nonIdealAlts, recommendation: `Aim for alt texts between ${idealLength.min} and ${idealLength.max} characters for best results.` }
        );
      }
      return createResult(
        { id: 'images-alt-length', name: 'Alt Text Length', category: 'images', severity: 'warning' },
        'pass',
        'All alt text lengths are within ideal range'
      );
    },
  },
  {
    id: 'images-clean-filenames',
    name: 'Image Filenames',
    category: 'images',
    severity: 'info',
    description: 'Image filenames should be descriptive and use keywords, not generic names.',
    check: (ctx) => {
      if (!ctx.imageFilenames || ctx.imageFilenames.length === 0) {
        return createResult(
          { id: 'images-clean-filenames', name: 'Image Filenames', category: 'images', severity: 'info' },
          'info',
          'Not applicable (no image filename data available)',
          { recommendation: 'This rule checks for descriptive image filenames with keywords' }
        );
      }

      const genericFilenames = ctx.imageFilenames.filter(name =>
        /^(img|image|photo|pic)\d*\.(jpg|jpeg|png|webp|avif|gif)$/i.test(name) ||
        /^screenshot_\d*\.(jpg|jpeg|png)$/i.test(name) ||
        /^untitled-\d*\.(jpg|jpeg|png)$/i.test(name)
      );

      if (genericFilenames.length > 0) {
        return createResult(
          { id: 'images-clean-filenames', name: 'Image Filenames', category: 'images', severity: 'warning' },
          'warn',
          `${genericFilenames.length} image(s) have generic filenames`,
          {
            value: genericFilenames.length,
            recommendation: 'Rename image files to be descriptive and include relevant keywords.',
            evidence: {
              found: genericFilenames.slice(0, 5),
              expected: 'Descriptive filenames with keywords (e.g., red-leather-wallet-front.jpg)',
              impact: 'Image filenames are used by search engines to understand image content and can appear in Google Image Search.',
              example: 'Instead of "IMG_1234.jpg", use "blue-running-shoes-nike-air.jpg"',
              learnMore: 'https://developers.google.com/search/docs/appearance/google-images#descriptive-titles-captions-filenames'
            }
          }
        );
      }
      return createResult(
        { id: 'images-clean-filenames', name: 'Image Filenames', category: 'images', severity: 'info' },
        'pass',
        'All image filenames are descriptive'
      );
    },
  },
  {
    id: 'images-decoding-async',
    name: 'Image Decoding Async',
    category: 'images',
    severity: 'info',
    description: 'Use decoding="async" for non-critical images to improve rendering performance.',
    check: (ctx) => {
      if (ctx.totalImages === undefined || ctx.totalImages === 0) {
        return createResult(
          { id: 'images-decoding-async', name: 'Image Decoding Async', category: 'images', severity: 'info' },
          'info',
          'Not applicable (no images detected)',
          { recommendation: 'This rule checks for async decoding on images for better rendering performance' }
        );
      }
      if (ctx.imagesWithAsyncDecoding === undefined) {
        return createResult(
          { id: 'images-decoding-async', name: 'Image Decoding Async', category: 'images', severity: 'info' },
          'info',
          'Not applicable (async decoding data unavailable)',
          { recommendation: 'This rule checks for async decoding on images for better rendering performance' }
        );
      }

      const nonAsync = ctx.totalImages - ctx.imagesWithAsyncDecoding;
      if (nonAsync > 0 && ctx.totalImages > 3) { // Suggest if there are many images and not all are async
        return createResult(
          { id: 'images-decoding-async', name: 'Image Decoding Async', category: 'images', severity: 'info' },
          'info',
          `${nonAsync} image(s) do not use decoding="async"`,
          { value: nonAsync, recommendation: 'Consider adding decoding="async" to non-critical images for performance benefits.' }
        );
      }
      return createResult(
        { id: 'images-decoding-async', name: 'Image Decoding Async', category: 'images', severity: 'info' },
        'pass',
        'All images use async decoding or too few images to require it'
      );
    },
  },

  // ==========================================================================
  // Broken External Images
  // ==========================================================================
  {
    id: 'broken-external-images',
    name: 'Broken External Images',
    category: 'images',
    severity: 'warning',
    description: 'External images should be accessible',
    check: (ctx) => {
      if (ctx.brokenExternalImages === undefined) {
        return createResult(
          { id: 'broken-external-images', name: 'Broken External Images', category: 'images', severity: 'warning' },
          'info',
          'Not applicable (broken external images data unavailable)',
          { recommendation: 'This rule checks for broken external image references' }
        );
      }

      if (ctx.brokenExternalImages > 0) {
        return createResult(
          { id: 'broken-external-images', name: 'Broken External Images', category: 'images', severity: 'warning' },
          'warn',
          `${ctx.brokenExternalImages} broken external images`,
          {
            value: ctx.brokenExternalImages,
            recommendation: 'Fix or remove broken external image references',
            evidence: {
              found: ctx.brokenExternalImageUrls?.slice(0, 5) || [],
              expected: 'All images should load successfully',
              impact: 'Broken images negatively affect user experience and may signal poor maintenance'
            }
          }
        );
      }

      return createResult(
        { id: 'broken-external-images', name: 'Broken External Images', category: 'images', severity: 'warning' },
        'pass',
        'No broken external images detected'
      );
    },
  },
];

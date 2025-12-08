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
      if (ctx.totalImages === undefined || ctx.totalImages === 0) return null;
      const withoutAlt = ctx.imagesWithoutAlt ?? 0;

      if (withoutAlt > 0) {
        const percentage = Math.round((withoutAlt / ctx.totalImages) * 100);
        const severity = withoutAlt > ctx.totalImages / 2 ? 'fail' : 'warn';
        return createResult(
          { id: 'images-alt-text', name: 'Image Alt Text', category: 'images', severity: 'error' },
          severity as SeoStatus,
          `${withoutAlt} of ${ctx.totalImages} images missing alt text (${percentage}%)`,
          { value: withoutAlt, recommendation: 'Add descriptive alt text to all images' }
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
      if (ctx.totalImages === undefined || ctx.totalImages === 0) return null;
      const missing = ctx.imagesMissingDimensions ?? 0;

      if (missing > 0) {
        return createResult(
          { id: 'images-dimensions', name: 'Image Dimensions', category: 'images', severity: 'warning' },
          'warn',
          `${missing} images missing width/height attributes`,
          { value: missing, recommendation: 'Add width and height to prevent layout shifts (CLS)' }
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
      if (ctx.totalImages === undefined || ctx.totalImages <= 3) return null;
      const lazy = ctx.imagesWithLazyLoad ?? 0;

      if (lazy === 0) {
        return createResult(
          { id: 'images-lazy-loading', name: 'Lazy Loading', category: 'images', severity: 'info' },
          'info',
          'No images use lazy loading',
          { recommendation: 'Add loading="lazy" to below-the-fold images' }
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
      if (ctx.totalImages === undefined || ctx.totalImages === 0) return null;
      const modern = ctx.imagesUsingModernFormats ?? 0;
      
      // If we have images but none are modern formats
      if (ctx.totalImages > 0 && modern === 0) {
         return createResult(
          { id: 'images-format-modern', name: 'Modern Image Formats', category: 'images', severity: 'info' },
          'info',
          'No images using modern formats (WebP/AVIF)',
          { value: modern, recommendation: 'Serve images in WebP or AVIF format for better compression' }
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
      return null;
    },
  },
  {
    id: 'images-alt-length',
    name: 'Alt Text Length',
    category: 'images',
    severity: 'warning',
    description: 'Alt text should be descriptive (min 10, max 125 chars)',
    check: (ctx) => {
      if (!ctx.altTextLengths || ctx.altTextLengths.length === 0) return null;

      const { minLength, maxLength } = SEO_THRESHOLDS.images.alt;
      let shortAlts = 0;
      let longAlts = 0;

      ctx.altTextLengths.forEach(len => {
        if (len < minLength) shortAlts++;
        if (len > maxLength) longAlts++;
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
      return null;
    },
  },
  {
    id: 'images-alt-length',
    name: 'Alt Text Length',
    category: 'images',
    severity: 'warning',
    description: 'Alt text should be descriptive (ideal 80-120, max 150 chars)',
    check: (ctx) => {
      if (!ctx.altTextLengths || ctx.altTextLengths.length === 0) return null;

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
      return null;
    },
  },
  {
    id: 'images-clean-filenames',
    name: 'Image Filenames',
    category: 'images',
    severity: 'info',
    description: 'Image filenames should be descriptive and use keywords, not generic names.',
    check: (ctx) => {
      if (!ctx.imageFilenames || ctx.imageFilenames.length === 0) return null;

      const genericFilenames = ctx.imageFilenames.filter(name =>
        /^(img|image|photo|pic)\d*\.(jpg|jpeg|png|webp|avif|gif)$/i.test(name) ||
        /^screenshot_\d*\.(jpg|jpeg|png)$/i.test(name) ||
        /^untitled-\d*\.(jpg|jpeg|png)$/i.test(name)
      );

      if (genericFilenames.length > 0) {
        return createResult(
          { id: 'images-clean-filenames', name: 'Image Filenames', category: 'images', severity: 'warning' },
          'warn',
          `${genericFilenames.length} image(s) have generic filenames (e.g., IMG_1234.jpg)`,
          { value: genericFilenames.length, recommendation: 'Rename image files to be descriptive and include keywords (e.g., open-graph-example.jpg).' }
        );
      }
      return null;
    },
  },
  {
    id: 'images-decoding-async',
    name: 'Image Decoding Async',
    category: 'images',
    severity: 'info',
    description: 'Use decoding="async" for non-critical images to improve rendering performance.',
    check: (ctx) => {
      if (ctx.totalImages === undefined || ctx.totalImages === 0) return null;
      if (ctx.imagesWithAsyncDecoding === undefined) return null;

      const nonAsync = ctx.totalImages - ctx.imagesWithAsyncDecoding;
      if (nonAsync > 0 && ctx.totalImages > 3) { // Suggest if there are many images and not all are async
        return createResult(
          { id: 'images-decoding-async', name: 'Image Decoding Async', category: 'images', severity: 'info' },
          'info',
          `${nonAsync} image(s) do not use decoding="async"`,
          { value: nonAsync, recommendation: 'Consider adding decoding="async" to non-critical images for performance benefits.' }
        );
      }
      return null;
    },
  },
];

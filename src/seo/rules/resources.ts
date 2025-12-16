/**
 * Resource Optimization Rules
 *
 * Rules for checking resource loading, file sizes, and optimization.
 * Based on Semrush Site Audit resource checks.
 */

import { SeoRule, createResult } from './types.js';

export const resourceRules: SeoRule[] = [
  // ==========================================================================
  // JavaScript
  // ==========================================================================
  {
    id: 'resources-js-files-count',
    name: 'JavaScript File Count',
    category: 'resources',
    severity: 'warning',
    description: 'Too many JavaScript files increase HTTP requests and slow page load',
    check: (ctx) => {
      if (ctx.jsFilesCount === undefined) {
        return createResult(
          { id: 'resources-js-files-count', name: 'JavaScript File Count', category: 'resources', severity: 'warning' },
          'info',
          'Not applicable (JavaScript file count unavailable)',
          { recommendation: 'This rule checks JavaScript file count when resource information is available' }
        );
      }

      const max = 15;
      if (ctx.jsFilesCount > max) {
        return createResult(
          { id: 'resources-js-files-count', name: 'JavaScript File Count', category: 'resources', severity: 'warning' },
          'warn',
          `Too many JS files (${ctx.jsFilesCount})`,
          {
            value: ctx.jsFilesCount,
            recommendation: `Bundle JavaScript files to reduce HTTP requests (max ${max})`,
            evidence: {
              found: ctx.jsFilesCount,
              expected: `${max} or fewer`,
              impact: 'Each HTTP request adds latency and slows page load',
            },
          }
        );
      }
      return createResult(
        { id: 'resources-js-files-count', name: 'JavaScript File Count', category: 'resources', severity: 'warning' },
        'info',
        'Not applicable (JavaScript file count is within limits or unavailable)',
        { recommendation: 'This rule checks JavaScript file count when resource information is available' }
      );
    },
  },
  {
    id: 'resources-js-total-size',
    name: 'JavaScript Total Size',
    category: 'resources',
    severity: 'warning',
    description: 'Large JavaScript bundles slow page load and increase bandwidth',
    check: (ctx) => {
      if (ctx.jsTotalSize === undefined) {
        return createResult(
          { id: 'resources-js-total-size', name: 'JavaScript Total Size', category: 'resources', severity: 'warning' },
          'info',
          'Not applicable (JavaScript size information unavailable)',
          { recommendation: 'This rule checks JavaScript total size when resource size information is available' }
        );
      }

      const maxKB = 500;
      const sizeKB = Math.round(ctx.jsTotalSize / 1024);

      if (sizeKB > maxKB) {
        return createResult(
          { id: 'resources-js-total-size', name: 'JavaScript Total Size', category: 'resources', severity: 'warning' },
          'warn',
          `Large JS bundle (${sizeKB}KB)`,
          {
            value: sizeKB,
            recommendation: `Reduce JavaScript size to under ${maxKB}KB`,
            evidence: {
              found: `${sizeKB}KB`,
              expected: `${maxKB}KB or less`,
              impact: 'Large JS bundles delay page interactivity',
            },
          }
        );
      }
      return createResult(
        { id: 'resources-js-total-size', name: 'JavaScript Total Size', category: 'resources', severity: 'warning' },
        'info',
        'Not applicable (JavaScript size is within limits)',
        { recommendation: 'This rule checks for large JavaScript bundles that slow page load' }
      );
    },
  },
  {
    id: 'resources-js-render-blocking',
    name: 'Render-Blocking JavaScript',
    category: 'resources',
    severity: 'warning',
    description: 'Render-blocking JS in <head> delays page rendering',
    check: (ctx) => {
      if (ctx.renderBlockingJs === undefined) {
        return createResult(
          { id: 'resources-js-render-blocking', name: 'Render-Blocking JavaScript', category: 'resources', severity: 'warning' },
          'info',
          'Not applicable (render-blocking JavaScript information unavailable)',
          { recommendation: 'This rule checks for render-blocking JavaScript when resource information is available' }
        );
      }

      if (ctx.renderBlockingJs > 0) {
        return createResult(
          { id: 'resources-js-render-blocking', name: 'Render-Blocking JavaScript', category: 'resources', severity: 'warning' },
          'warn',
          `${ctx.renderBlockingJs} render-blocking JS file(s)`,
          {
            value: ctx.renderBlockingJs,
            recommendation: 'Add async or defer attribute to non-critical scripts',
            evidence: {
              found: `${ctx.renderBlockingJs} scripts without async/defer`,
              expected: 'All scripts with async, defer, or in body',
              example: '<script src="app.js" defer></script>',
            },
          }
        );
      }

      return createResult(
        { id: 'resources-js-render-blocking', name: 'Render-Blocking JavaScript', category: 'resources', severity: 'warning' },
        'pass',
        'No render-blocking JavaScript'
      );
    },
  },

  // ==========================================================================
  // CSS
  // ==========================================================================
  {
    id: 'resources-css-files-count',
    name: 'CSS File Count',
    category: 'resources',
    severity: 'warning',
    description: 'Too many CSS files increase HTTP requests',
    check: (ctx) => {
      if (ctx.cssFilesCount === undefined) {
        return createResult(
          { id: 'resources-css-files-count', name: 'CSS File Count', category: 'resources', severity: 'warning' },
          'info',
          'Not applicable (CSS file count unavailable)',
          { recommendation: 'This rule checks CSS file count when resource information is available' }
        );
      }

      const max = 10;
      if (ctx.cssFilesCount > max) {
        return createResult(
          { id: 'resources-css-files-count', name: 'CSS File Count', category: 'resources', severity: 'warning' },
          'warn',
          `Too many CSS files (${ctx.cssFilesCount})`,
          {
            value: ctx.cssFilesCount,
            recommendation: `Bundle CSS files to reduce HTTP requests (max ${max})`,
            evidence: {
              found: ctx.cssFilesCount,
              expected: `${max} or fewer`,
            },
          }
        );
      }
      return createResult(
        { id: 'resources-css-files-count', name: 'CSS File Count', category: 'resources', severity: 'warning' },
        'info',
        'Not applicable (CSS file count is within limits or unavailable)',
        { recommendation: 'This rule checks CSS file count when resource information is available' }
      );
    },
  },
  {
    id: 'resources-css-total-size',
    name: 'CSS Total Size',
    category: 'resources',
    severity: 'warning',
    description: 'Large CSS files delay page rendering',
    check: (ctx) => {
      if (ctx.cssTotalSize === undefined) {
        return createResult(
          { id: 'resources-css-total-size', name: 'CSS Total Size', category: 'resources', severity: 'warning' },
          'info',
          'Not applicable (CSS size information unavailable)',
          { recommendation: 'This rule checks CSS total size when resource size information is available' }
        );
      }

      const maxKB = 200;
      const sizeKB = Math.round(ctx.cssTotalSize / 1024);

      if (sizeKB > maxKB) {
        return createResult(
          { id: 'resources-css-total-size', name: 'CSS Total Size', category: 'resources', severity: 'warning' },
          'warn',
          `Large CSS bundle (${sizeKB}KB)`,
          {
            value: sizeKB,
            recommendation: `Reduce CSS size to under ${maxKB}KB`,
            evidence: {
              found: `${sizeKB}KB`,
              expected: `${maxKB}KB or less`,
              impact: 'Large CSS delays first contentful paint',
            },
          }
        );
      }
      return createResult(
        { id: 'resources-css-total-size', name: 'CSS Total Size', category: 'resources', severity: 'warning' },
        'info',
        'Not applicable (CSS size is within limits)',
        { recommendation: 'This rule checks for large CSS files that delay page rendering' }
      );
    },
  },
  {
    id: 'resources-css-render-blocking',
    name: 'Render-Blocking CSS',
    category: 'resources',
    severity: 'info',
    description: 'Critical CSS should be inlined, non-critical deferred',
    check: (ctx) => {
      if (ctx.cssFilesCount === undefined) {
        return createResult(
          { id: 'resources-css-render-blocking', name: 'Render-Blocking CSS', category: 'resources', severity: 'info' },
          'info',
          'Not applicable (CSS file information unavailable)',
          { recommendation: 'This rule checks for render-blocking CSS when resource information is available' }
        );
      }

      // All CSS in <link> is render-blocking by default
      // This is normal, but we can suggest optimization
      if (ctx.cssFilesCount > 3 && !ctx.hasCriticalCss) {
        return createResult(
          { id: 'resources-css-render-blocking', name: 'Render-Blocking CSS', category: 'resources', severity: 'info' },
          'info',
          `${ctx.cssFilesCount} CSS files blocking render`,
          {
            value: ctx.cssFilesCount,
            recommendation: 'Consider inlining critical CSS and lazy-loading the rest',
            evidence: {
              impact: 'CSS blocks rendering until fully loaded',
              example: '<link rel="preload" href="style.css" as="style" onload="this.rel=\'stylesheet\'">',
            },
          }
        );
      }
      return createResult(
        { id: 'resources-css-render-blocking', name: 'Render-Blocking CSS', category: 'resources', severity: 'info' },
        'info',
        'Not applicable (CSS file count is low or critical CSS is present)',
        { recommendation: 'This rule checks for render-blocking CSS that delays page rendering' }
      );
    },
  },

  // ==========================================================================
  // Images
  // ==========================================================================
  {
    id: 'resources-image-size-large',
    name: 'Large Image Files',
    category: 'resources',
    severity: 'warning',
    description: 'Images over 200KB should be optimized',
    check: (ctx) => {
      if (!ctx.largeImages || ctx.largeImages.length === 0) {
        return createResult(
          { id: 'resources-image-size-large', name: 'Large Image Files', category: 'resources', severity: 'warning' },
          'info',
          'Not applicable (no large images detected or image data unavailable)',
          { recommendation: 'This rule checks for images over 200KB when image information is available' }
        );
      }

      const maxKB = 200;
      const largeCount = ctx.largeImages.length;

      return createResult(
        { id: 'resources-image-size-large', name: 'Large Image Files', category: 'resources', severity: 'warning' },
        'warn',
        `${largeCount} image(s) over ${maxKB}KB`,
        {
          value: largeCount,
          recommendation: 'Compress images or use modern formats (WebP, AVIF)',
          evidence: {
            found: ctx.largeImages.slice(0, 5),
            impact: 'Large images significantly slow page load',
          },
        }
      );
    },
  },
  {
    id: 'resources-image-format',
    name: 'Modern Image Formats',
    category: 'resources',
    severity: 'info',
    description: 'Use WebP or AVIF for better compression',
    check: (ctx) => {
      if (ctx.imagesTotal === undefined || ctx.imagesTotal === 0) {
        return createResult(
          { id: 'resources-image-format', name: 'Modern Image Formats', category: 'resources', severity: 'info' },
          'info',
          'Not applicable (no images present or image data unavailable)',
          { recommendation: 'This rule checks image format usage when images are present on the page' }
        );
      }
      if (ctx.modernFormatImages === undefined) {
        return createResult(
          { id: 'resources-image-format', name: 'Modern Image Formats', category: 'resources', severity: 'info' },
          'info',
          'Not applicable (modern format image data unavailable)',
          { recommendation: 'This rule checks for modern image formats when image format information is available' }
        );
      }

      const modernPercent = (ctx.modernFormatImages / ctx.imagesTotal) * 100;

      if (modernPercent < 50) {
        return createResult(
          { id: 'resources-image-format', name: 'Modern Image Formats', category: 'resources', severity: 'info' },
          'info',
          `Only ${Math.round(modernPercent)}% of images use modern formats`,
          {
            value: ctx.modernFormatImages,
            recommendation: 'Convert images to WebP or AVIF for 25-50% smaller files',
            evidence: {
              found: `${ctx.modernFormatImages}/${ctx.imagesTotal} modern format images`,
              expected: 'WebP or AVIF for all images',
              impact: 'Modern formats reduce image size by 25-50%',
            },
          }
        );
      }

      return createResult(
        { id: 'resources-image-format', name: 'Modern Image Formats', category: 'resources', severity: 'info' },
        'pass',
        `${Math.round(modernPercent)}% of images use modern formats`
      );
    },
  },
  {
    id: 'resources-image-dimensions',
    name: 'Image Dimensions',
    category: 'resources',
    severity: 'warning',
    description: 'Images should have width and height attributes',
    check: (ctx) => {
      if (ctx.imagesMissingDimensions === undefined) {
        return createResult(
          { id: 'resources-image-dimensions', name: 'Image Dimensions', category: 'resources', severity: 'warning' },
          'info',
          'Not applicable (image dimension information unavailable)',
          { recommendation: 'This rule checks for image dimensions when image information is available' }
        );
      }

      if (ctx.imagesMissingDimensions > 0) {
        return createResult(
          { id: 'resources-image-dimensions', name: 'Image Dimensions', category: 'resources', severity: 'warning' },
          'warn',
          `${ctx.imagesMissingDimensions} image(s) missing width/height`,
          {
            value: ctx.imagesMissingDimensions,
            recommendation: 'Add width and height attributes to prevent layout shift',
            evidence: {
              impact: 'Missing dimensions cause Cumulative Layout Shift (CLS)',
              example: '<img src="photo.jpg" width="800" height="600" alt="Photo">',
            },
          }
        );
      }

      return createResult(
        { id: 'resources-image-dimensions', name: 'Image Dimensions', category: 'resources', severity: 'warning' },
        'pass',
        'All images have width/height attributes'
      );
    },
  },

  // ==========================================================================
  // Fonts
  // ==========================================================================
  {
    id: 'resources-font-files',
    name: 'Web Font Files',
    category: 'resources',
    severity: 'info',
    description: 'Too many font files can slow page load',
    check: (ctx) => {
      if (ctx.fontFilesCount === undefined) {
        return createResult(
          { id: 'resources-font-files', name: 'Web Font Files', category: 'resources', severity: 'info' },
          'info',
          'Not applicable (font file information unavailable)',
          { recommendation: 'This rule checks font file count when font information is available' }
        );
      }

      const max = 4;
      if (ctx.fontFilesCount > max) {
        return createResult(
          { id: 'resources-font-files', name: 'Web Font Files', category: 'resources', severity: 'info' },
          'info',
          `${ctx.fontFilesCount} font files loaded`,
          {
            value: ctx.fontFilesCount,
            recommendation: `Limit to ${max} font files or use variable fonts`,
            evidence: {
              found: ctx.fontFilesCount,
              expected: `${max} or fewer`,
              impact: 'Each font file adds to page weight and load time',
            },
          }
        );
      }
      return createResult(
        { id: 'resources-font-files', name: 'Web Font Files', category: 'resources', severity: 'info' },
        'info',
        'Not applicable (font file count is within limits)',
        { recommendation: 'This rule checks for excessive font files that slow page load' }
      );
    },
  },
  {
    id: 'resources-font-display',
    name: 'Font Display Strategy',
    category: 'resources',
    severity: 'info',
    description: 'Use font-display: swap to prevent invisible text during load',
    check: (ctx) => {
      if (ctx.hasFontDisplaySwap === undefined) {
        return createResult(
          { id: 'resources-font-display', name: 'Font Display Strategy', category: 'resources', severity: 'info' },
          'info',
          'Not applicable (font display strategy information unavailable)',
          { recommendation: 'This rule checks font display strategy when font information is available' }
        );
      }

      if (!ctx.hasFontDisplaySwap && ctx.fontFilesCount && ctx.fontFilesCount > 0) {
        return createResult(
          { id: 'resources-font-display', name: 'Font Display Strategy', category: 'resources', severity: 'info' },
          'info',
          'font-display: swap not detected',
          {
            recommendation: 'Add font-display: swap to @font-face rules',
            evidence: {
              expected: '@font-face { font-display: swap; }',
              impact: 'Without swap, text may be invisible during font load (FOIT)',
            },
          }
        );
      }
      return createResult(
        { id: 'resources-font-display', name: 'Font Display Strategy', category: 'resources', severity: 'info' },
        'info',
        'Not applicable (no fonts loaded or font-display is configured)',
        { recommendation: 'This rule checks for font-display strategy when fonts are loaded' }
      );
    },
  },

  // ==========================================================================
  // Total Resources
  // ==========================================================================
  {
    id: 'resources-total-requests',
    name: 'Total HTTP Requests',
    category: 'resources',
    severity: 'warning',
    description: 'Too many HTTP requests slow page load',
    check: (ctx) => {
      if (ctx.totalRequests === undefined) {
        return createResult(
          { id: 'resources-total-requests', name: 'Total HTTP Requests', category: 'resources', severity: 'warning' },
          'info',
          'Not applicable (total request count unavailable)',
          { recommendation: 'This rule checks total HTTP requests when request information is available' }
        );
      }

      const max = 50;
      if (ctx.totalRequests > max) {
        return createResult(
          { id: 'resources-total-requests', name: 'Total HTTP Requests', category: 'resources', severity: 'warning' },
          'warn',
          `Too many HTTP requests (${ctx.totalRequests})`,
          {
            value: ctx.totalRequests,
            recommendation: `Reduce to under ${max} requests by bundling and optimizing`,
            evidence: {
              found: ctx.totalRequests,
              expected: `${max} or fewer`,
              impact: 'Each HTTP request adds latency',
            },
          }
        );
      }

      return createResult(
        { id: 'resources-total-requests', name: 'Total HTTP Requests', category: 'resources', severity: 'warning' },
        'pass',
        `Good HTTP request count (${ctx.totalRequests})`
      );
    },
  },
  {
    id: 'resources-total-size',
    name: 'Total Page Size',
    category: 'resources',
    severity: 'warning',
    description: 'Total page weight affects load time',
    check: (ctx) => {
      if (ctx.totalPageSize === undefined) {
        return createResult(
          { id: 'resources-total-size', name: 'Total Page Size', category: 'resources', severity: 'warning' },
          'info',
          'Not applicable (total page size information unavailable)',
          { recommendation: 'This rule checks total page size when page weight information is available' }
        );
      }

      const maxMB = 3;
      const sizeMB = ctx.totalPageSize / (1024 * 1024);

      if (sizeMB > maxMB) {
        return createResult(
          { id: 'resources-total-size', name: 'Total Page Size', category: 'resources', severity: 'warning' },
          'warn',
          `Large page size (${sizeMB.toFixed(1)}MB)`,
          {
            value: Math.round(ctx.totalPageSize / 1024),
            recommendation: `Reduce total page size to under ${maxMB}MB`,
            evidence: {
              found: `${sizeMB.toFixed(1)}MB`,
              expected: `${maxMB}MB or less`,
              impact: 'Large pages are slow on mobile and low-bandwidth connections',
            },
          }
        );
      }

      return createResult(
        { id: 'resources-total-size', name: 'Total Page Size', category: 'resources', severity: 'warning' },
        'pass',
        `Good page size (${sizeMB.toFixed(1)}MB)`
      );
    },
  },

  // ==========================================================================
  // Compression
  // ==========================================================================
  {
    id: 'resources-compression',
    name: 'Resource Compression',
    category: 'resources',
    severity: 'warning',
    description: 'Text resources should be compressed with gzip or brotli',
    check: (ctx) => {
      if (ctx.uncompressedResources === undefined) {
        return createResult(
          { id: 'resources-compression', name: 'Resource Compression', category: 'resources', severity: 'warning' },
          'info',
          'Not applicable (resource compression information unavailable)',
          { recommendation: 'This rule checks resource compression when resource information is available' }
        );
      }

      if (ctx.uncompressedResources > 0) {
        return createResult(
          { id: 'resources-compression', name: 'Resource Compression', category: 'resources', severity: 'warning' },
          'warn',
          `${ctx.uncompressedResources} uncompressed resource(s)`,
          {
            value: ctx.uncompressedResources,
            recommendation: 'Enable gzip or Brotli compression on your server',
            evidence: {
              impact: 'Compression typically reduces file size by 60-80%',
            },
          }
        );
      }

      return createResult(
        { id: 'resources-compression', name: 'Resource Compression', category: 'resources', severity: 'warning' },
        'pass',
        'All text resources are compressed'
      );
    },
  },

  // ==========================================================================
  // Caching
  // ==========================================================================
  {
    id: 'resources-caching',
    name: 'Browser Caching',
    category: 'resources',
    severity: 'info',
    description: 'Static resources should have long cache lifetimes',
    check: (ctx) => {
      if (ctx.resourcesWithoutCaching === undefined) {
        return createResult(
          { id: 'resources-caching', name: 'Browser Caching', category: 'resources', severity: 'info' },
          'info',
          'Not applicable (caching information unavailable)',
          { recommendation: 'This rule checks browser caching when resource caching information is available' }
        );
      }

      if (ctx.resourcesWithoutCaching > 0) {
        return createResult(
          { id: 'resources-caching', name: 'Browser Caching', category: 'resources', severity: 'info' },
          'info',
          `${ctx.resourcesWithoutCaching} resource(s) without proper caching`,
          {
            value: ctx.resourcesWithoutCaching,
            recommendation: 'Set Cache-Control headers for static resources',
            evidence: {
              expected: 'Cache-Control: max-age=31536000 for static assets',
              impact: 'Proper caching improves repeat visit performance',
            },
          }
        );
      }

      return createResult(
        { id: 'resources-caching', name: 'Browser Caching', category: 'resources', severity: 'info' },
        'pass',
        'Static resources have proper caching'
      );
    },
  },

  // ==========================================================================
  // Broken External Resources (JS/CSS)
  // ==========================================================================
  {
    id: 'broken-external-resources',
    name: 'Broken External Resources',
    category: 'resources',
    severity: 'warning',
    description: 'External JS/CSS files should be accessible',
    check: (ctx) => {
      if (ctx.brokenExternalResources === undefined) {
        return createResult(
          { id: 'broken-external-resources', name: 'Broken External Resources', category: 'resources', severity: 'warning' },
          'info',
          'Not applicable (external resource status information unavailable)',
          { recommendation: 'This rule checks for broken external resources when resource information is available' }
        );
      }

      if (ctx.brokenExternalResources > 0) {
        return createResult(
          { id: 'broken-external-resources', name: 'Broken External Resources', category: 'resources', severity: 'warning' },
          'warn',
          `${ctx.brokenExternalResources} broken external JS/CSS files`,
          {
            value: ctx.brokenExternalResources,
            recommendation: 'Fix or remove references to broken external resources',
            evidence: {
              found: ctx.brokenExternalResourceUrls?.slice(0, 5) || [],
              impact: 'Broken resources may cause rendering issues and affect user experience'
            }
          }
        );
      }

      return createResult(
        { id: 'broken-external-resources', name: 'Broken External Resources', category: 'resources', severity: 'warning' },
        'info',
        'Not applicable (no broken external resources detected)',
        { recommendation: 'This rule checks for broken external JS/CSS files' }
      );
    },
  },
];

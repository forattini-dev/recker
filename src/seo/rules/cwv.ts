/**
 * SEO Core Web Vitals Rules
 * Deep analysis of LCP, CLS, and FID/INP indicators from HTML
 */

import { SeoRule, createResult } from './types.js';

export const cwvRules: SeoRule[] = [
  // ==========================================================================
  // LCP (Largest Contentful Paint) Rules
  // ==========================================================================
  {
    id: 'cwv-lcp-hero-image',
    name: 'LCP Hero Image',
    category: 'performance',
    severity: 'warning',
    description: 'Hero images should be optimized for fast LCP',
    check: (ctx) => {
      if (!ctx.lcpCandidate) return null;

      const issues: string[] = [];

      // Check if LCP candidate is lazy loaded (bad!)
      if (ctx.lcpCandidate.loading === 'lazy') {
        issues.push('LCP image has loading="lazy" (should be eager or omitted)');
      }

      // Check for fetchpriority
      if (!ctx.lcpCandidate.fetchpriority) {
        issues.push('Missing fetchpriority="high" on LCP image');
      }

      // Check for preload
      if (!ctx.hasLcpPreload) {
        issues.push('LCP image not preloaded');
      }

      if (issues.length > 0) {
        return createResult(
          { id: 'cwv-lcp-hero-image', name: 'LCP Hero Image', category: 'performance', severity: 'warning' },
          'warn',
          `LCP optimization issues: ${issues.length} found`,
          {
            recommendation: 'Optimize LCP image loading',
            evidence: {
              found: issues,
              expected: 'LCP image with fetchpriority="high", no lazy loading, and preload link',
              example: `<link rel="preload" as="image" href="hero.webp" fetchpriority="high">
<img src="hero.webp" fetchpriority="high" alt="Hero">`,
              impact: 'LCP is a Core Web Vital - aim for < 2.5s',
              learnMore: 'https://web.dev/lcp/',
            },
          }
        );
      }

      return createResult(
        { id: 'cwv-lcp-hero-image', name: 'LCP Hero Image', category: 'performance', severity: 'warning' },
        'pass',
        'LCP image appears optimized'
      );
    },
  },
  {
    id: 'cwv-lcp-text-visible',
    name: 'LCP Text Visibility',
    category: 'performance',
    severity: 'warning',
    description: 'Text LCP elements should render immediately without font blocking',
    check: (ctx) => {
      if (!ctx.webFonts || ctx.webFonts.length === 0) return null;

      const blockingFonts = ctx.webFonts.filter(f => !f.hasSwap && !f.hasOptional);

      if (blockingFonts.length > 0) {
        return createResult(
          { id: 'cwv-lcp-text-visible', name: 'LCP Text Visibility', category: 'performance', severity: 'warning' },
          'warn',
          `${blockingFonts.length} web font(s) may block text rendering`,
          {
            recommendation: 'Use font-display: swap or optional for web fonts',
            evidence: {
              found: blockingFonts.map(f => f.family).filter(Boolean).slice(0, 3) as string[],
              expected: 'font-display: swap or font-display: optional',
              example: '@font-face { font-display: swap; }',
              impact: 'Blocking fonts delay LCP for text elements',
              learnMore: 'https://web.dev/font-display/',
            },
          }
        );
      }

      return createResult(
        { id: 'cwv-lcp-text-visible', name: 'LCP Text Visibility', category: 'performance', severity: 'warning' },
        'pass',
        'Web fonts use non-blocking display'
      );
    },
  },
  {
    id: 'cwv-render-blocking-css',
    name: 'Render-Blocking CSS',
    category: 'performance',
    severity: 'warning',
    description: 'Minimize render-blocking CSS for faster LCP',
    check: (ctx) => {
      if (ctx.renderBlockingStylesheets === undefined) return null;

      if (ctx.renderBlockingStylesheets > 3) {
        return createResult(
          { id: 'cwv-render-blocking-css', name: 'Render-Blocking CSS', category: 'performance', severity: 'warning' },
          'warn',
          `${ctx.renderBlockingStylesheets} render-blocking stylesheets`,
          {
            recommendation: 'Reduce render-blocking CSS or use critical CSS inline',
            evidence: {
              found: ctx.renderBlockingStylesheets,
              expected: '1-3 stylesheets or inline critical CSS',
              example: '<style>/* critical CSS */</style>\n<link rel="stylesheet" href="main.css" media="print" onload="this.media=\'all\'">',
              impact: 'Each blocking stylesheet delays first paint',
            },
          }
        );
      }

      return createResult(
        { id: 'cwv-render-blocking-css', name: 'Render-Blocking CSS', category: 'performance', severity: 'warning' },
        'pass',
        `${ctx.renderBlockingStylesheets} render-blocking stylesheet(s)`
      );
    },
  },
  {
    id: 'cwv-render-blocking-js',
    name: 'Render-Blocking JavaScript',
    category: 'performance',
    severity: 'warning',
    description: 'Scripts in head should use async or defer',
    check: (ctx) => {
      if (ctx.renderBlockingScripts === undefined) return null;

      if (ctx.renderBlockingScripts > 0) {
        return createResult(
          { id: 'cwv-render-blocking-js', name: 'Render-Blocking JavaScript', category: 'performance', severity: 'warning' },
          'warn',
          `${ctx.renderBlockingScripts} render-blocking script(s) in <head>`,
          {
            recommendation: 'Add async or defer to scripts, or move to end of body',
            evidence: {
              found: ctx.renderBlockingScripts,
              expected: 'Scripts with async, defer, or type="module"',
              example: '<script src="app.js" defer></script>',
              impact: 'Blocking scripts delay HTML parsing and LCP',
            },
          }
        );
      }

      return createResult(
        { id: 'cwv-render-blocking-js', name: 'Render-Blocking JavaScript', category: 'performance', severity: 'warning' },
        'pass',
        'No render-blocking scripts in head'
      );
    },
  },

  // ==========================================================================
  // CLS (Cumulative Layout Shift) Rules
  // ==========================================================================
  {
    id: 'cwv-cls-image-dimensions',
    name: 'Image Dimensions',
    category: 'performance',
    severity: 'warning',
    description: 'Images should have explicit width and height to prevent layout shift',
    check: (ctx) => {
      if (ctx.imagesMissingDimensions === undefined) return null;

      if (ctx.imagesMissingDimensions > 0) {
        const total = ctx.totalImages || 0;
        const percent = total > 0 ? Math.round((ctx.imagesMissingDimensions / total) * 100) : 0;

        return createResult(
          { id: 'cwv-cls-image-dimensions', name: 'Image Dimensions', category: 'performance', severity: 'warning' },
          'warn',
          `${ctx.imagesMissingDimensions} image(s) missing width/height (${percent}%)`,
          {
            recommendation: 'Add explicit width and height attributes to all images',
            evidence: {
              found: `${ctx.imagesMissingDimensions} of ${total} images`,
              expected: 'width and height on all <img> elements',
              example: '<img src="photo.jpg" width="800" height="600" alt="...">',
              impact: 'Missing dimensions cause layout shift when images load',
              learnMore: 'https://web.dev/cls/',
            },
          }
        );
      }

      return createResult(
        { id: 'cwv-cls-image-dimensions', name: 'Image Dimensions', category: 'performance', severity: 'warning' },
        'pass',
        'All images have dimensions'
      );
    },
  },
  {
    id: 'cwv-cls-aspect-ratio',
    name: 'Aspect Ratio CSS',
    category: 'performance',
    severity: 'info',
    description: 'Use CSS aspect-ratio for responsive media containers',
    check: (ctx) => {
      if (!ctx.hasAspectRatioCss && ctx.hasResponsiveImages) {
        return createResult(
          { id: 'cwv-cls-aspect-ratio', name: 'Aspect Ratio CSS', category: 'performance', severity: 'info' },
          'info',
          'Consider using CSS aspect-ratio for media containers',
          {
            recommendation: 'Use aspect-ratio CSS property for responsive containers',
            evidence: {
              example: '.video-container { aspect-ratio: 16 / 9; }',
              impact: 'Reserves space before media loads, preventing CLS',
              learnMore: 'https://web.dev/aspect-ratio/',
            },
          }
        );
      }

      return null;
    },
  },
  {
    id: 'cwv-cls-dynamic-content',
    name: 'Dynamic Content Space',
    category: 'performance',
    severity: 'info',
    description: 'Reserve space for dynamically injected content',
    check: (ctx) => {
      const potentialShifts: string[] = [];

      if (ctx.hasAdsWithoutReservedSpace) {
        potentialShifts.push('Ads without reserved space');
      }
      if (ctx.hasBannersWithoutMinHeight) {
        potentialShifts.push('Banners/alerts without min-height');
      }
      if (ctx.hasInfiniteScroll) {
        potentialShifts.push('Infinite scroll may cause shifts');
      }

      if (potentialShifts.length > 0) {
        return createResult(
          { id: 'cwv-cls-dynamic-content', name: 'Dynamic Content Space', category: 'performance', severity: 'info' },
          'info',
          'Potential layout shift sources detected',
          {
            recommendation: 'Reserve space for dynamic content with min-height or skeleton loaders',
            evidence: {
              found: potentialShifts,
              example: '.ad-slot { min-height: 250px; }',
              impact: 'Dynamic content is a major source of CLS',
            },
          }
        );
      }

      return null;
    },
  },
  {
    id: 'cwv-cls-font-fallback',
    name: 'Font Fallback Metrics',
    category: 'performance',
    severity: 'info',
    description: 'Web fonts should have size-matched fallbacks',
    check: (ctx) => {
      if (!ctx.webFonts || ctx.webFonts.length === 0) return null;

      // Check for size-adjust or ascent-override
      const fontsWithoutMetrics = ctx.webFonts.filter(f =>
        !f.hasSizeAdjust && !f.hasAscentOverride
      );

      if (fontsWithoutMetrics.length > 0 && ctx.webFonts.length > 0) {
        return createResult(
          { id: 'cwv-cls-font-fallback', name: 'Font Fallback Metrics', category: 'performance', severity: 'info' },
          'info',
          'Web fonts may cause layout shift during swap',
          {
            recommendation: 'Use size-adjust or metric overrides for fallback fonts',
            evidence: {
              example: `@font-face {
  font-family: 'Custom Font';
  src: url('custom.woff2') format('woff2');
  font-display: swap;
  size-adjust: 92%;  /* Match fallback metrics */
}`,
              impact: 'Font swapping can cause visible layout shift',
              learnMore: 'https://web.dev/css-size-adjust/',
            },
          }
        );
      }

      return null;
    },
  },

  // ==========================================================================
  // INP/FID (Interaction to Next Paint / First Input Delay) Rules
  // ==========================================================================
  {
    id: 'cwv-inp-main-thread',
    name: 'Main Thread Blocking',
    category: 'performance',
    severity: 'warning',
    description: 'Large inline scripts can block the main thread',
    check: (ctx) => {
      if (ctx.largeInlineScripts === undefined) return null;

      if (ctx.largeInlineScripts > 0) {
        return createResult(
          { id: 'cwv-inp-main-thread', name: 'Main Thread Blocking', category: 'performance', severity: 'warning' },
          'warn',
          `${ctx.largeInlineScripts} large inline script(s) may block main thread`,
          {
            recommendation: 'Move large scripts to external files with defer',
            evidence: {
              found: `${ctx.largeInlineScripts} inline scripts > 10KB`,
              expected: 'Small inline scripts only for critical initialization',
              impact: 'Large scripts block main thread and delay interactions',
              learnMore: 'https://web.dev/optimize-inp/',
            },
          }
        );
      }

      return null;
    },
  },
  {
    id: 'cwv-inp-event-handlers',
    name: 'Inline Event Handlers',
    category: 'performance',
    severity: 'info',
    description: 'Avoid inline event handlers for better performance',
    check: (ctx) => {
      if (ctx.inlineEventHandlers === undefined) return null;

      if (ctx.inlineEventHandlers > 10) {
        return createResult(
          { id: 'cwv-inp-event-handlers', name: 'Inline Event Handlers', category: 'performance', severity: 'info' },
          'info',
          `${ctx.inlineEventHandlers} inline event handlers found`,
          {
            recommendation: 'Use event delegation instead of inline handlers',
            evidence: {
              found: ctx.inlineEventHandlers,
              expected: 'Minimal inline handlers, prefer addEventListener',
              example: 'document.addEventListener("click", handleClick)',
              impact: 'Many inline handlers increase parsing time',
            },
          }
        );
      }

      return null;
    },
  },
  {
    id: 'cwv-inp-heavy-animations',
    name: 'Heavy Animations',
    category: 'performance',
    severity: 'info',
    description: 'Animations should use transform/opacity for best performance',
    check: (ctx) => {
      if (!ctx.hasHeavyAnimations) return null;

      return createResult(
        { id: 'cwv-inp-heavy-animations', name: 'Heavy Animations', category: 'performance', severity: 'info' },
        'info',
        'Potentially expensive animations detected',
        {
          recommendation: 'Use transform and opacity for animations, avoid layout properties',
          evidence: {
            issue: 'Animating width, height, top, left triggers layout',
            expected: 'Animate transform: translate(), scale(), rotate() and opacity',
            learnMore: 'https://web.dev/animations-guide/',
          },
        }
      );
    },
  },

  // ==========================================================================
  // General Performance Rules
  // ==========================================================================
  {
    id: 'cwv-resource-hints',
    name: 'Resource Hints',
    category: 'performance',
    severity: 'info',
    description: 'Use resource hints to speed up critical resources',
    check: (ctx) => {
      const hints: string[] = [];

      if (!ctx.hasPreconnect && ctx.externalOrigins && ctx.externalOrigins > 2) {
        hints.push('preconnect for critical third-party origins');
      }
      if (!ctx.hasDnsPrefetch && ctx.externalOrigins && ctx.externalOrigins > 3) {
        hints.push('dns-prefetch for secondary origins');
      }
      if (!ctx.hasPreload && ctx.hasCriticalResources) {
        hints.push('preload for critical CSS/fonts/images');
      }

      if (hints.length > 0) {
        return createResult(
          { id: 'cwv-resource-hints', name: 'Resource Hints', category: 'performance', severity: 'info' },
          'info',
          `Consider adding: ${hints.join(', ')}`,
          {
            recommendation: 'Add resource hints in <head> for faster loading',
            evidence: {
              expected: hints,
              example: `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="dns-prefetch" href="https://analytics.example.com">
<link rel="preload" as="font" href="/fonts/main.woff2" crossorigin>`,
              learnMore: 'https://web.dev/preconnect-and-dns-prefetch/',
            },
          }
        );
      }

      return createResult(
        { id: 'cwv-resource-hints', name: 'Resource Hints', category: 'performance', severity: 'info' },
        'pass',
        'Resource hints configured'
      );
    },
  },
  {
    id: 'cwv-critical-css',
    name: 'Critical CSS',
    category: 'performance',
    severity: 'info',
    description: 'Inline critical CSS for above-the-fold content',
    check: (ctx) => {
      if (ctx.hasInlineCriticalCss) {
        return createResult(
          { id: 'cwv-critical-css', name: 'Critical CSS', category: 'performance', severity: 'info' },
          'pass',
          'Inline critical CSS detected'
        );
      }

      if (ctx.renderBlockingStylesheets && ctx.renderBlockingStylesheets > 0) {
        return createResult(
          { id: 'cwv-critical-css', name: 'Critical CSS', category: 'performance', severity: 'info' },
          'info',
          'Consider inlining critical CSS',
          {
            recommendation: 'Inline critical CSS in <head> and defer non-critical styles',
            evidence: {
              example: `<style>
  /* Critical above-the-fold styles */
  body { margin: 0; font-family: system-ui; }
</style>
<link rel="stylesheet" href="main.css" media="print" onload="this.media='all'">`,
              impact: 'Critical CSS eliminates render-blocking stylesheets',
              learnMore: 'https://web.dev/extract-critical-css/',
            },
          }
        );
      }

      return null;
    },
  },
];

import { SeoRule, createResult } from './types.js';
import { SEO_THRESHOLDS } from './thresholds.js';

export const performanceRules: SeoRule[] = [
  {
    id: 'perf-preconnect',
    name: 'Preconnect Hints',
    category: 'performance',
    severity: 'info',
    description: 'Use preconnect for important third-party origins',
    check: (ctx) => {
      if (!ctx.hasPreconnect && ctx.externalLinks && ctx.externalLinks > 5) {
        return createResult(
          { id: 'perf-preconnect', name: 'Preconnect Hints', category: 'performance', severity: 'info' },
          'info',
          'No preconnect hints found',
          { recommendation: 'Add <link rel="preconnect" href="..."> for important third-party domains' }
        );
      }
      if (ctx.preconnectCount && ctx.preconnectCount > 0) {
        return createResult(
          { id: 'perf-preconnect', name: 'Preconnect Hints', category: 'performance', severity: 'info' },
          'pass',
          `${ctx.preconnectCount} preconnect hint(s) found`,
          { value: ctx.preconnectCount }
        );
      }
      return null;
    },
  },
  {
    id: 'perf-dns-prefetch',
    name: 'DNS Prefetch',
    category: 'performance',
    severity: 'info',
    description: 'Use dns-prefetch for external domains',
    check: (ctx) => {
      if (ctx.dnsPrefetchCount && ctx.dnsPrefetchCount > 0) {
        return createResult(
          { id: 'perf-dns-prefetch', name: 'DNS Prefetch', category: 'performance', severity: 'info' },
          'pass',
          `${ctx.dnsPrefetchCount} dns-prefetch hint(s) found`,
          { value: ctx.dnsPrefetchCount }
        );
      }
      return null;
    },
  },
  {
    id: 'perf-preload',
    name: 'Preload Hints',
    category: 'performance',
    severity: 'info',
    description: 'Use preload for critical resources',
    check: (ctx) => {
      if (ctx.preloadCount && ctx.preloadCount > 0) {
        return createResult(
          { id: 'perf-preload', name: 'Preload Hints', category: 'performance', severity: 'info' },
          'pass',
          `${ctx.preloadCount} preload hint(s) found`,
          { value: ctx.preloadCount }
        );
      }
      return null;
    },
  },
  {
    id: 'perf-render-blocking',
    name: 'Render Blocking',
    category: 'performance',
    severity: 'warning',
    description: 'Minimize render-blocking resources',
    check: (ctx) => {
      const blocking = ctx.renderBlockingResources ?? 0;
      if (blocking > 5) {
        return createResult(
          { id: 'perf-render-blocking', name: 'Render Blocking', category: 'performance', severity: 'warning' },
          'warn',
          `${blocking} render-blocking resources in <head>`,
          { value: blocking, recommendation: 'Use async/defer for scripts, preload for critical CSS' }
        );
      }
      if (blocking > 0) {
        return createResult(
          { id: 'perf-render-blocking', name: 'Render Blocking', category: 'performance', severity: 'warning' },
          'info',
          `${blocking} render-blocking resource(s) in <head>`,
          { value: blocking }
        );
      }
      return null;
    },
  },
  {
    id: 'perf-inline-styles',
    name: 'Inline Styles',
    category: 'performance',
    severity: 'info',
    description: 'Excessive inline styles can increase page size',
    check: (ctx) => {
      const inline = ctx.inlineStylesCount ?? 0;
      if (inline > 10) {
        return createResult(
          { id: 'perf-inline-styles', name: 'Inline Styles', category: 'performance', severity: 'info' },
          'info',
          `${inline} inline style blocks found`,
          { value: inline, recommendation: 'Consider consolidating inline styles into external CSS' }
        );
      }
      return null;
    },
  },

  // Core Web Vitals Hints
  {
    id: 'cwv-lcp-lazy',
    name: 'LCP Image Lazy',
    category: 'performance',
    severity: 'warning',
    description: 'Above-the-fold images should not use lazy loading',
    check: (ctx) => {
      if (ctx.lcpHints?.hasLazyLcp) {
        return createResult(
          { id: 'cwv-lcp-lazy', name: 'LCP Image Lazy', category: 'performance', severity: 'warning' },
          'warn',
          'First large image uses lazy loading (may hurt LCP)',
          { recommendation: 'Remove loading="lazy" from above-the-fold images' }
        );
      }
      return null;
    },
  },
  {
    id: 'cwv-lcp-priority',
    name: 'LCP Priority Hints',
    category: 'performance',
    severity: 'info',
    description: 'Use fetchpriority="high" for LCP images',
    check: (ctx) => {
      if (ctx.lcpHints?.hasLargeImages && !ctx.lcpHints?.hasPriorityHints) {
        return createResult(
          { id: 'cwv-lcp-priority', name: 'LCP Priority Hints', category: 'performance', severity: 'info' },
          'info',
          'No fetchpriority="high" found on large images',
          { recommendation: 'Add fetchpriority="high" to LCP candidate images' }
        );
      }
      return null;
    },
  },
  {
    id: 'cwv-cls-images',
    name: 'CLS Image Dimensions',
    category: 'performance',
    severity: 'warning',
    description: 'Images without dimensions cause layout shifts',
    check: (ctx) => {
      const missing = ctx.clsHints?.imagesWithoutDimensions ?? ctx.imagesMissingDimensions ?? 0;
      if (missing > 0) {
        return createResult(
          { id: 'cwv-cls-images', name: 'CLS Image Dimensions', category: 'performance', severity: 'warning' },
          'warn',
          `${missing} image(s) without width/height (causes CLS)`,
          { value: missing, recommendation: 'Add width and height attributes to all images' }
        );
      }
      return null;
    },
  },

  // Timing Rules
  {
    id: 'timing-ttfb',
    name: 'Time to First Byte',
    category: 'performance',
    severity: 'error',
    description: 'TTFB should be under 600ms (ideally under 200ms)',
    check: (ctx) => {
      const ttfb = ctx.timings?.ttfb;
      if (ttfb === undefined) return null;

      const { good, needsImprovement, poor } = SEO_THRESHOLDS.timing.ttfb;

      if (ttfb <= good) {
        return createResult(
          { id: 'timing-ttfb', name: 'TTFB', category: 'performance', severity: 'error' },
          'pass',
          `Excellent TTFB (${ttfb}ms)`,
          { value: ttfb }
        );
      }
      if (ttfb <= needsImprovement) {
        return createResult(
          { id: 'timing-ttfb', name: 'TTFB', category: 'performance', severity: 'error' },
          'info',
          `TTFB needs improvement (${ttfb}ms)`,
          { value: ttfb, recommendation: `Optimize server response time to under ${good}ms` }
        );
      }
      if (ttfb <= poor) {
        return createResult(
          { id: 'timing-ttfb', name: 'TTFB', category: 'performance', severity: 'error' },
          'warn',
          `Slow TTFB (${ttfb}ms)`,
          { value: ttfb, recommendation: 'Optimize server, use CDN, enable caching' }
        );
      }
      return createResult(
        { id: 'timing-ttfb', name: 'TTFB', category: 'performance', severity: 'error' },
        'fail',
        `Very slow TTFB (${ttfb}ms)`,
        { value: ttfb, recommendation: 'Critical: Server is too slow. Check server, database, and network' }
      );
    },
  },
  {
    id: 'timing-total',
    name: 'Total Load Time',
    category: 'performance',
    severity: 'warning',
    description: 'Total page load should be under 2.5s',
    check: (ctx) => {
      const total = ctx.timings?.total;
      if (total === undefined) return null;

      const { good, needsImprovement, poor } = SEO_THRESHOLDS.timing.total;

      if (total <= good) {
        return createResult(
          { id: 'timing-total', name: 'Load Time', category: 'performance', severity: 'warning' },
          'pass',
          `Fast page load (${total}ms)`,
          { value: total }
        );
      }
      if (total <= needsImprovement) {
        return createResult(
          { id: 'timing-total', name: 'Load Time', category: 'performance', severity: 'warning' },
          'info',
          `Page load time acceptable (${total}ms)`,
          { value: total, recommendation: `Aim for under ${good}ms for better user experience` }
        );
      }
      if (total <= poor) {
        return createResult(
          { id: 'timing-total', name: 'Load Time', category: 'performance', severity: 'warning' },
          'warn',
          `Slow page load (${total}ms)`,
          { value: total, recommendation: 'Optimize assets, enable compression, use CDN' }
        );
      }
      return createResult(
        { id: 'timing-total', name: 'Load Time', category: 'performance', severity: 'warning' },
        'fail',
        `Very slow page load (${total}ms)`,
        { value: total, recommendation: 'Critical performance issue. Full optimization needed.' }
      );
    },
  },
  {
    id: 'timing-dns',
    name: 'DNS Lookup',
    category: 'performance',
    severity: 'info',
    description: 'DNS lookup should be under 50ms',
    check: (ctx) => {
      const dns = ctx.timings?.dnsLookup;
      if (dns === undefined) return null;

      const { good, poor } = SEO_THRESHOLDS.timing.dnsLookup;

      if (dns <= good) {
        return createResult(
          { id: 'timing-dns', name: 'DNS Lookup', category: 'performance', severity: 'info' },
          'pass',
          `Fast DNS lookup (${dns}ms)`,
          { value: dns }
        );
      }
      if (dns <= poor) {
        return createResult(
          { id: 'timing-dns', name: 'DNS Lookup', category: 'performance', severity: 'info' },
          'info',
          `DNS lookup could be faster (${dns}ms)`,
          { value: dns, recommendation: 'Consider using faster DNS provider or dns-prefetch' }
        );
      }
      return createResult(
        { id: 'timing-dns', name: 'DNS Lookup', category: 'performance', severity: 'info' },
        'warn',
        `Slow DNS lookup (${dns}ms)`,
        { value: dns, recommendation: 'DNS is slow. Consider Cloudflare, Google DNS, or dns-prefetch' }
      );
    },
  },
  {
    id: 'timing-tls',
    name: 'TLS Handshake',
    category: 'performance',
    severity: 'info',
    description: 'TLS handshake should be under 100ms',
    check: (ctx) => {
      const tls = ctx.timings?.tlsHandshake;
      if (tls === undefined) return null;

      const { good, poor } = SEO_THRESHOLDS.timing.tlsHandshake;

      if (tls <= good) {
        return createResult(
          { id: 'timing-tls', name: 'TLS Handshake', category: 'performance', severity: 'info' },
          'pass',
          `Fast TLS handshake (${tls}ms)`,
          { value: tls }
        );
      }
      if (tls <= poor) {
        return createResult(
          { id: 'timing-tls', name: 'TLS Handshake', category: 'performance', severity: 'info' },
          'info',
          `TLS handshake could be faster (${tls}ms)`,
          { value: tls, recommendation: 'Consider TLS 1.3, HTTP/2, or preconnect hints' }
        );
      }
      return createResult(
        { id: 'timing-tls', name: 'TLS Handshake', category: 'performance', severity: 'info' },
        'warn',
        `Slow TLS handshake (${tls}ms)`,
        { value: tls, recommendation: 'TLS is slow. Check server configuration and certificate chain' }
      );
    },
  },

  // Response Size
  {
    id: 'response-html-size',
    name: 'HTML Size',
    category: 'performance',
    severity: 'warning',
    description: 'HTML should be under 500KB (ideally under 100KB)',
    check: (ctx) => {
      const size = ctx.htmlSize;
      if (size === undefined) return null;

      const { good, warning, poor } = SEO_THRESHOLDS.responseSize.html;
      const sizeKb = Math.round(size / 1024);

      if (size <= good) {
        return createResult(
          { id: 'response-html-size', name: 'HTML Size', category: 'performance', severity: 'warning' },
          'pass',
          `HTML size is good (${sizeKb}KB)`,
          { value: sizeKb }
        );
      }
      if (size <= warning) {
        return createResult(
          { id: 'response-html-size', name: 'HTML Size', category: 'performance', severity: 'warning' },
          'info',
          `HTML size is acceptable (${sizeKb}KB)`,
          { value: sizeKb, recommendation: 'Consider reducing HTML size for faster parsing' }
        );
      }
      if (size <= poor) {
        return createResult(
          { id: 'response-html-size', name: 'HTML Size', category: 'performance', severity: 'warning' },
          'warn',
          `HTML is large (${sizeKb}KB)`,
          { value: sizeKb, recommendation: 'Reduce HTML size. Check for inline data, remove unused code' }
        );
      }
      return createResult(
        { id: 'response-html-size', name: 'HTML Size', category: 'performance', severity: 'warning' },
        'fail',
        `HTML is very large (${sizeKb}KB)`,
        { value: sizeKb, recommendation: 'Critical: HTML too large. Use pagination, lazy loading, or split content' }
      );
    },
  },
  {
    id: 'response-compression',
    name: 'Compression',
    category: 'performance',
    severity: 'warning',
    description: 'Response should be compressed (gzip/brotli)',
    check: (ctx) => {
      if (ctx.htmlSize === undefined) return null;

      // If not compressed and HTML is larger than 1KB
      if (ctx.isCompressed === false && ctx.htmlSize > 1024) {
        return createResult(
          { id: 'response-compression', name: 'Compression', category: 'performance', severity: 'warning' },
          'warn',
          'Response is not compressed',
          { recommendation: 'Enable gzip or brotli compression on server' }
        );
      }
      if (ctx.isCompressed === true) {
        const ratio = ctx.compressedSize && ctx.htmlSize ? Math.round((ctx.compressedSize / ctx.htmlSize) * 100) : undefined;
        return createResult(
          { id: 'response-compression', name: 'Compression', category: 'performance', severity: 'warning' },
          'pass',
          ratio ? `Response compressed (${ratio}% of original)` : 'Response is compressed'
        );
      }
      return null;
    },
  },
];

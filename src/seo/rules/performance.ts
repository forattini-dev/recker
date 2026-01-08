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
          {
            recommendation: 'Add <link rel="preconnect" href="..."> for important third-party domains',
            evidence: {
              found: 'No <link rel="preconnect"> tags detected',
              expected: 'Preconnect hints for critical third-party origins',
              impact: 'Preconnect establishes early connections (DNS, TCP, TLS) to third-party domains, reducing latency for fonts, CDN assets, and APIs by 100-500ms.',
              example: '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://cdn.example.com" crossorigin>'
            }
          }
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
      return createResult(
        { id: 'perf-preconnect', name: 'Preconnect Hints', category: 'performance', severity: 'info' },
        'info',
        'Not applicable (no external links or preconnect data unavailable)',
        { recommendation: 'This rule checks for preconnect hints when external resources are detected' }
      );
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
      // Check if external resources exist but no dns-prefetch
      if (ctx.externalLinks && ctx.externalLinks > 3) {
        return createResult(
          { id: 'perf-dns-prefetch', name: 'DNS Prefetch', category: 'performance', severity: 'info' },
          'info',
          'No dns-prefetch hints (external resources detected)',
          {
            recommendation: 'Add <link rel="dns-prefetch" href="..."> for external domains',
            evidence: {
              found: 'No dns-prefetch tags detected',
              expected: 'dns-prefetch hints for external domains',
              impact: 'DNS prefetch resolves domain names ahead of time, saving 20-120ms per external origin on first request.',
              example: '<link rel="dns-prefetch" href="//fonts.googleapis.com">\n<link rel="dns-prefetch" href="//cdn.example.com">'
            }
          }
        );
      }
      return createResult(
        { id: 'perf-dns-prefetch', name: 'DNS Prefetch', category: 'performance', severity: 'info' },
        'pass',
        'No dns-prefetch hints (not required if no external resources)'
      );
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
      return createResult(
        { id: 'perf-preload', name: 'Preload Hints', category: 'performance', severity: 'info' },
        'info',
        'No preload hints found',
        {
          recommendation: 'Add preload hints for critical resources like fonts, hero images, or critical CSS',
          evidence: {
            found: 'No <link rel="preload"> tags detected',
            expected: 'Preload hints for resources needed immediately on page load',
            impact: 'Preload tells the browser to fetch critical resources early, improving LCP by 100-300ms for above-the-fold content.',
            example: '<link rel="preload" as="font" href="/fonts/main.woff2" type="font/woff2" crossorigin>\n<link rel="preload" as="image" href="/images/hero.webp">'
          }
        }
      );
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
          {
            value: blocking,
            recommendation: 'Use async/defer for scripts, preload for critical CSS',
            evidence: {
              found: `${blocking} render-blocking resources`,
              expected: '≤ 5 render-blocking resources',
              impact: 'Render-blocking resources delay First Contentful Paint (FCP) and Largest Contentful Paint (LCP)',
              example: '<script src="app.js" defer></script> or <link rel="preload" as="style" href="critical.css">',
              learnMore: 'https://web.dev/render-blocking-resources/'
            }
          }
        );
      }
      if (blocking > 0) {
        return createResult(
          { id: 'perf-render-blocking', name: 'Render Blocking', category: 'performance', severity: 'warning' },
          'info',
          `${blocking} render-blocking resource(s) in <head>`,
          {
            value: blocking,
            recommendation: 'Consider using async/defer for non-critical scripts',
            evidence: {
              found: `${blocking} render-blocking resources`,
              expected: 'Minimize render-blocking resources for faster FCP',
              impact: 'Render-blocking resources pause HTML parsing until loaded. Consider deferring non-critical resources.',
              example: '<script src="analytics.js" defer></script>\n<link rel="preload" as="style" href="critical.css" onload="this.rel=\'stylesheet\'">'
            }
          }
        );
      }
      return createResult(
        { id: 'perf-render-blocking', name: 'Render Blocking', category: 'performance', severity: 'warning' },
        'pass',
        'No render-blocking resources detected in <head>'
      );
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
          {
            value: inline,
            recommendation: 'Consider consolidating inline styles into external CSS',
            evidence: {
              found: `${inline} inline style blocks`,
              expected: '< 10 inline style blocks',
              impact: 'Excessive inline styles increase HTML size and prevent browser caching of CSS. They also make maintenance harder.',
              example: '<!-- Instead of multiple <style> blocks, consolidate into: -->\n<link rel="stylesheet" href="styles.css">'
            }
          }
        );
      }
      return createResult(
        { id: 'perf-inline-styles', name: 'Inline Styles', category: 'performance', severity: 'info' },
        'pass',
        `Inline styles count is acceptable (${inline} blocks)`
      );
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
          {
            recommendation: 'Remove loading="lazy" from above-the-fold images',
            evidence: {
              found: 'Above-the-fold image with loading="lazy"',
              expected: 'LCP images should not use lazy loading',
              impact: 'Lazy loading delays the Largest Contentful Paint (LCP), hurting Core Web Vitals',
              example: '<img src="hero.jpg" alt="Hero"> <!-- Remove loading="lazy" from hero images -->',
              learnMore: 'https://web.dev/lcp-lazy-loading/'
            }
          }
        );
      }
      return createResult(
        { id: 'cwv-lcp-lazy', name: 'LCP Image Lazy', category: 'performance', severity: 'warning' },
        'pass',
        'No lazy loading detected on LCP images'
      );
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
          {
            recommendation: 'Add fetchpriority="high" to LCP candidate images',
            evidence: {
              found: 'Large images without fetchpriority attribute',
              expected: 'LCP candidate images should have fetchpriority="high"',
              impact: 'fetchpriority="high" tells the browser to prioritize downloading the LCP image, improving LCP by 50-200ms.',
              example: '<img src="hero.jpg" alt="Hero" fetchpriority="high" width="1200" height="600">',
              learnMore: 'https://web.dev/priority-hints/'
            }
          }
        );
      }
      return createResult(
        { id: 'cwv-lcp-priority', name: 'LCP Priority Hints', category: 'performance', severity: 'info' },
        'pass',
        'LCP images have proper priority hints or no large images detected'
      );
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
          {
            value: missing,
            recommendation: 'Add width and height attributes to all images',
            evidence: {
              found: `${missing} images without dimensions`,
              expected: 'All images should have width and height attributes',
              impact: 'Images without dimensions cause layout shifts (CLS) when they load, hurting Core Web Vitals',
              example: '<img src="photo.jpg" alt="Photo" width="800" height="600">',
              learnMore: 'https://web.dev/optimize-cls/'
            }
          }
        );
      }
      return createResult(
        { id: 'cwv-cls-images', name: 'CLS Image Dimensions', category: 'performance', severity: 'warning' },
        'pass',
        'All images have proper dimensions'
      );
    },
  },

  // Timing Rules (4-level stratification: excellent → good → acceptable → poor)
  {
    id: 'timing-ttfb',
    name: 'Time to First Byte',
    category: 'performance',
    severity: 'error',
    description: 'TTFB should be under 200ms (excellent), 500ms (good), 800ms (acceptable)',
    check: (ctx) => {
      const ttfb = ctx.timings?.ttfb;
      if (ttfb === undefined) {
        return createResult(
          { id: 'timing-ttfb', name: 'TTFB', category: 'performance', severity: 'error' },
          'info',
          'Not applicable (TTFB timing data unavailable)',
          { recommendation: 'This rule checks Time to First Byte when timing data is available' }
        );
      }

      const { excellent, good, acceptable } = SEO_THRESHOLDS.timing.ttfb;
      const ttfbMs = Math.round(ttfb);

      // Excellent: < 200ms
      if (ttfb <= excellent) {
        return createResult(
          { id: 'timing-ttfb', name: 'TTFB', category: 'performance', severity: 'error' },
          'pass',
          `Excellent TTFB (${ttfbMs}ms)`,
          {
            value: ttfbMs,
            evidence: {
              found: `${ttfbMs}ms`,
              rating: 'Excellent',
              impact: 'Server response is very fast. Great user experience.'
            }
          }
        );
      }

      // Good: 200-500ms
      if (ttfb <= good) {
        return createResult(
          { id: 'timing-ttfb', name: 'TTFB', category: 'performance', severity: 'error' },
          'pass',
          `Good TTFB (${ttfbMs}ms)`,
          {
            value: ttfbMs,
            evidence: {
              found: `${ttfbMs}ms`,
              rating: 'Good',
              target: `< ${excellent}ms for excellent`,
              impact: 'Server response is acceptable. Consider CDN or caching for further improvement.'
            }
          }
        );
      }

      // Acceptable: 500-800ms
      if (ttfb <= acceptable) {
        return createResult(
          { id: 'timing-ttfb', name: 'TTFB', category: 'performance', severity: 'error' },
          'warn',
          `Acceptable TTFB (${ttfbMs}ms) - needs improvement`,
          {
            value: ttfbMs,
            recommendation: 'Optimize server response: enable caching, use CDN, optimize database queries',
            evidence: {
              found: `${ttfbMs}ms`,
              rating: 'Acceptable',
              target: `< ${good}ms for good, < ${excellent}ms for excellent`,
              impact: 'TTFB affects all subsequent resource loading. Users on slow networks will notice delay.',
              optimization: [
                'Enable server-side caching (Redis, Memcached)',
                'Use a CDN (Cloudflare, Fastly, CloudFront)',
                'Optimize database queries and indexes',
                'Consider edge computing for dynamic content'
              ],
              learnMore: 'https://web.dev/ttfb/'
            }
          }
        );
      }

      // Poor: > 800ms
      return createResult(
        { id: 'timing-ttfb', name: 'TTFB', category: 'performance', severity: 'error' },
        'fail',
        `Slow TTFB (${ttfbMs}ms) - critical issue`,
        {
          value: ttfbMs,
          recommendation: 'Critical: Server response is too slow. Immediate optimization required.',
          evidence: {
            found: `${ttfbMs}ms`,
            rating: 'Poor',
            target: `< ${acceptable}ms for acceptable, < ${excellent}ms for excellent`,
            impact: 'Critical server performance issue. High bounce rate expected.',
            optimization: [
              'Check server CPU/memory usage',
              'Optimize slow database queries',
              'Enable response compression (gzip/brotli)',
              'Use CDN with edge caching',
              'Consider upgrading server resources'
            ],
            learnMore: 'https://web.dev/ttfb/'
          }
        }
      );
    },
  },
  {
    id: 'timing-total',
    name: 'Total Load Time',
    category: 'performance',
    severity: 'warning',
    description: 'Total page load should be under 1s (excellent), 2.5s (good), 4s (acceptable)',
    check: (ctx) => {
      const total = ctx.timings?.total;
      if (total === undefined) {
        return createResult(
          { id: 'timing-total', name: 'Load Time', category: 'performance', severity: 'warning' },
          'info',
          'Not applicable (total load time data unavailable)',
          { recommendation: 'This rule checks total page load time when timing data is available' }
        );
      }

      const { excellent, good, acceptable } = SEO_THRESHOLDS.timing.total;
      const totalMs = Math.round(total);
      const totalSec = (total / 1000).toFixed(1);

      // Excellent: < 1s
      if (total <= excellent) {
        return createResult(
          { id: 'timing-total', name: 'Load Time', category: 'performance', severity: 'warning' },
          'pass',
          `Excellent load time (${totalSec}s)`,
          {
            value: totalMs,
            evidence: {
              found: `${totalMs}ms (${totalSec}s)`,
              rating: 'Excellent',
              impact: 'Page loads very fast. Excellent user experience.'
            }
          }
        );
      }

      // Good: 1-2.5s
      if (total <= good) {
        return createResult(
          { id: 'timing-total', name: 'Load Time', category: 'performance', severity: 'warning' },
          'pass',
          `Good load time (${totalSec}s)`,
          {
            value: totalMs,
            evidence: {
              found: `${totalMs}ms (${totalSec}s)`,
              rating: 'Good',
              target: `< ${excellent / 1000}s for excellent`,
              impact: 'Load time is acceptable for most users.'
            }
          }
        );
      }

      // Acceptable: 2.5-4s
      if (total <= acceptable) {
        return createResult(
          { id: 'timing-total', name: 'Load Time', category: 'performance', severity: 'warning' },
          'warn',
          `Acceptable load time (${totalSec}s) - needs improvement`,
          {
            value: totalMs,
            recommendation: 'Optimize page load: compress assets, lazy load images, use CDN',
            evidence: {
              found: `${totalMs}ms (${totalSec}s)`,
              rating: 'Acceptable',
              target: `< ${good / 1000}s for good, < ${excellent / 1000}s for excellent`,
              impact: 'Slow loads increase bounce rate, especially on mobile.',
              optimization: [
                'Enable gzip/brotli compression',
                'Lazy load below-the-fold images',
                'Use a CDN for static assets',
                'Minify and bundle JS/CSS'
              ],
              learnMore: 'https://web.dev/performance-scoring/'
            }
          }
        );
      }

      // Poor: > 4s
      return createResult(
        { id: 'timing-total', name: 'Load Time', category: 'performance', severity: 'warning' },
        'fail',
        `Slow page load (${totalSec}s) - critical issue`,
        {
          value: totalMs,
          recommendation: 'Critical: Page is too slow. Full performance audit required.',
          evidence: {
            found: `${totalMs}ms (${totalSec}s)`,
            rating: 'Poor',
            target: `< ${acceptable / 1000}s for acceptable`,
            impact: 'Very slow load times severely hurt SEO rankings and cause high bounce rates.',
            optimization: [
              'Run Lighthouse audit for detailed recommendations',
              'Reduce JavaScript bundle size',
              'Optimize server response time (TTFB)',
              'Use image CDN with auto-optimization',
              'Implement code splitting and lazy loading'
            ],
            learnMore: 'https://web.dev/performance-scoring/'
          }
        }
      );
    },
  },
  {
    id: 'timing-dns',
    name: 'DNS Lookup',
    category: 'performance',
    severity: 'info',
    description: 'DNS lookup should be under 20ms (excellent), 50ms (good), 100ms (acceptable)',
    check: (ctx) => {
      const dns = ctx.timings?.dns;
      if (dns === undefined) {
        return createResult(
          { id: 'timing-dns', name: 'DNS Lookup', category: 'performance', severity: 'info' },
          'info',
          'Not applicable (DNS lookup timing data unavailable)',
          { recommendation: 'This rule checks DNS lookup time when timing data is available' }
        );
      }

      const { excellent, good, acceptable } = SEO_THRESHOLDS.timing.dns;
      const dnsMs = Math.round(dns);

      // Excellent: < 20ms
      if (dns <= excellent) {
        return createResult(
          { id: 'timing-dns', name: 'DNS Lookup', category: 'performance', severity: 'info' },
          'pass',
          `Excellent DNS lookup (${dnsMs}ms)`,
          {
            value: dnsMs,
            evidence: {
              found: `${dnsMs}ms`,
              rating: 'Excellent',
              impact: 'DNS resolution is very fast. Great connection establishment.'
            }
          }
        );
      }

      // Good: 20-50ms
      if (dns <= good) {
        return createResult(
          { id: 'timing-dns', name: 'DNS Lookup', category: 'performance', severity: 'info' },
          'pass',
          `Good DNS lookup (${dnsMs}ms)`,
          {
            value: dnsMs,
            evidence: {
              found: `${dnsMs}ms`,
              rating: 'Good',
              target: `< ${excellent}ms for excellent`,
              impact: 'DNS resolution is acceptable.'
            }
          }
        );
      }

      // Acceptable: 50-100ms
      if (dns <= acceptable) {
        return createResult(
          { id: 'timing-dns', name: 'DNS Lookup', category: 'performance', severity: 'info' },
          'info',
          `Acceptable DNS lookup (${dnsMs}ms) - could be faster`,
          {
            value: dnsMs,
            recommendation: 'Consider using faster DNS provider or dns-prefetch hints',
            evidence: {
              found: `${dnsMs}ms`,
              rating: 'Acceptable',
              target: `< ${good}ms for good, < ${excellent}ms for excellent`,
              impact: 'DNS lookup is the first step in connection. Slower DNS adds latency to every request.',
              optimization: [
                'Use dns-prefetch for external domains',
                'Consider faster DNS providers (Cloudflare 1.1.1.1, Google 8.8.8.8)',
                'Enable DNS caching at edge/CDN'
              ],
              example: '<link rel="dns-prefetch" href="//api.example.com">'
            }
          }
        );
      }

      // Poor: > 100ms
      return createResult(
        { id: 'timing-dns', name: 'DNS Lookup', category: 'performance', severity: 'info' },
        'warn',
        `Slow DNS lookup (${dnsMs}ms) - needs optimization`,
        {
          value: dnsMs,
          recommendation: 'DNS is slow. Use faster DNS provider and dns-prefetch hints.',
          evidence: {
            found: `${dnsMs}ms`,
            rating: 'Poor',
            target: `< ${acceptable}ms for acceptable`,
            impact: 'Slow DNS resolution delays all page resources. Major impact on perceived loading speed.',
            optimization: [
              'Switch to faster DNS provider (Cloudflare, Google DNS)',
              'Add dns-prefetch for critical domains',
              'Check DNS server configuration',
              'Consider using CDN with global PoP'
            ],
            example: '<link rel="dns-prefetch" href="//fonts.googleapis.com">',
            learnMore: 'https://web.dev/dns-prefetch/'
          }
        }
      );
    },
  },
  {
    id: 'timing-tls',
    name: 'TLS Handshake',
    category: 'performance',
    severity: 'info',
    description: 'TLS handshake should be under 100ms (excellent), 200ms (good), 300ms (acceptable)',
    check: (ctx) => {
      const tls = ctx.timings?.tls;
      if (tls === undefined) {
        return createResult(
          { id: 'timing-tls', name: 'TLS Handshake', category: 'performance', severity: 'info' },
          'info',
          'Not applicable (TLS handshake timing data unavailable)',
          { recommendation: 'This rule checks TLS handshake time when timing data is available' }
        );
      }

      const { excellent, good, acceptable } = SEO_THRESHOLDS.timing.tls;
      const tlsMs = Math.round(tls);

      // Excellent: < 100ms
      if (tls <= excellent) {
        return createResult(
          { id: 'timing-tls', name: 'TLS Handshake', category: 'performance', severity: 'info' },
          'pass',
          `Excellent TLS handshake (${tlsMs}ms)`,
          {
            value: tlsMs,
            evidence: {
              found: `${tlsMs}ms`,
              rating: 'Excellent',
              impact: 'TLS handshake is very fast. Secure connection established quickly.'
            }
          }
        );
      }

      // Good: 100-200ms
      if (tls <= good) {
        return createResult(
          { id: 'timing-tls', name: 'TLS Handshake', category: 'performance', severity: 'info' },
          'pass',
          `Good TLS handshake (${tlsMs}ms)`,
          {
            value: tlsMs,
            evidence: {
              found: `${tlsMs}ms`,
              rating: 'Good',
              target: `< ${excellent}ms for excellent`,
              impact: 'TLS handshake is acceptable. Consider TLS 1.3 for further improvement.'
            }
          }
        );
      }

      // Acceptable: 200-300ms
      if (tls <= acceptable) {
        return createResult(
          { id: 'timing-tls', name: 'TLS Handshake', category: 'performance', severity: 'info' },
          'info',
          `Acceptable TLS handshake (${tlsMs}ms) - could be faster`,
          {
            value: tlsMs,
            recommendation: 'Consider TLS 1.3, preconnect hints, or shorter certificate chain',
            evidence: {
              found: `${tlsMs}ms`,
              rating: 'Acceptable',
              target: `< ${good}ms for good, < ${excellent}ms for excellent`,
              impact: 'TLS handshake adds latency to every new HTTPS connection.',
              optimization: [
                'Enable TLS 1.3 (reduces roundtrips)',
                'Use preconnect for critical domains',
                'Optimize certificate chain length',
                'Enable OCSP stapling'
              ],
              example: '<link rel="preconnect" href="https://api.example.com">'
            }
          }
        );
      }

      // Poor: > 300ms
      return createResult(
        { id: 'timing-tls', name: 'TLS Handshake', category: 'performance', severity: 'info' },
        'warn',
        `Slow TLS handshake (${tlsMs}ms) - needs optimization`,
        {
          value: tlsMs,
          recommendation: 'TLS is slow. Check server TLS configuration and certificate chain.',
          evidence: {
            found: `${tlsMs}ms`,
            rating: 'Poor',
            target: `< ${acceptable}ms for acceptable`,
            impact: 'Slow TLS delays secure connection, especially impactful on mobile networks.',
            optimization: [
              'Enable TLS 1.3 on server',
              'Reduce certificate chain length',
              'Enable OCSP stapling',
              'Use HTTP/2 or HTTP/3',
              'Add preconnect hints for external domains'
            ],
            learnMore: 'https://web.dev/uses-http2/'
          }
        }
      );
    },
  },
  {
    id: 'timing-tcp',
    name: 'TCP Connection',
    category: 'performance',
    severity: 'info',
    description: 'TCP connection should be under 50ms (excellent), 100ms (good), 200ms (acceptable)',
    check: (ctx) => {
      const tcp = ctx.timings?.tcp;
      if (tcp === undefined) {
        return createResult(
          { id: 'timing-tcp', name: 'TCP Connection', category: 'performance', severity: 'info' },
          'info',
          'Not applicable (TCP connection timing data unavailable)',
          { recommendation: 'This rule checks TCP connection time when timing data is available' }
        );
      }

      const { excellent, good, acceptable } = SEO_THRESHOLDS.timing.tcp;
      const tcpMs = Math.round(tcp);

      // Excellent: < 50ms
      if (tcp <= excellent) {
        return createResult(
          { id: 'timing-tcp', name: 'TCP Connection', category: 'performance', severity: 'info' },
          'pass',
          `Excellent TCP connection (${tcpMs}ms)`,
          {
            value: tcpMs,
            evidence: {
              found: `${tcpMs}ms`,
              rating: 'Excellent',
              impact: 'TCP connection established very quickly. Low network latency.'
            }
          }
        );
      }

      // Good: 50-100ms
      if (tcp <= good) {
        return createResult(
          { id: 'timing-tcp', name: 'TCP Connection', category: 'performance', severity: 'info' },
          'pass',
          `Good TCP connection (${tcpMs}ms)`,
          {
            value: tcpMs,
            evidence: {
              found: `${tcpMs}ms`,
              rating: 'Good',
              target: `< ${excellent}ms for excellent`,
              impact: 'TCP connection is acceptable. Server proximity is good.'
            }
          }
        );
      }

      // Acceptable: 100-200ms
      if (tcp <= acceptable) {
        return createResult(
          { id: 'timing-tcp', name: 'TCP Connection', category: 'performance', severity: 'info' },
          'info',
          `Acceptable TCP connection (${tcpMs}ms) - could be faster`,
          {
            value: tcpMs,
            recommendation: 'Consider using CDN or server closer to users',
            evidence: {
              found: `${tcpMs}ms`,
              rating: 'Acceptable',
              target: `< ${good}ms for good, < ${excellent}ms for excellent`,
              impact: 'TCP connection time reflects network latency between user and server.',
              optimization: [
                'Use a CDN with global edge locations',
                'Use preconnect for critical domains',
                'Enable HTTP/2 for connection multiplexing',
                'Consider regional server deployments'
              ],
              example: '<link rel="preconnect" href="https://cdn.example.com">'
            }
          }
        );
      }

      // Poor: > 200ms
      return createResult(
        { id: 'timing-tcp', name: 'TCP Connection', category: 'performance', severity: 'info' },
        'warn',
        `Slow TCP connection (${tcpMs}ms) - high latency`,
        {
          value: tcpMs,
          recommendation: 'High network latency. Use CDN with edge locations closer to users.',
          evidence: {
            found: `${tcpMs}ms`,
            rating: 'Poor',
            target: `< ${acceptable}ms for acceptable`,
            impact: 'High TCP connection time indicates significant network latency. Major impact on user experience.',
            optimization: [
              'Deploy CDN with edge locations (Cloudflare, Fastly, CloudFront)',
              'Add preconnect hints for critical domains',
              'Consider multi-region server deployment',
              'Enable HTTP/2 or HTTP/3 for better connection reuse'
            ],
            learnMore: 'https://web.dev/reduce-network-payloads/'
          }
        }
      );
    },
  },
  {
    id: 'timing-download',
    name: 'Download Time',
    category: 'performance',
    severity: 'warning',
    description: 'Download time should be optimized based on page size',
    check: (ctx) => {
      const download = ctx.timings?.download;
      const htmlSize = ctx.htmlSize;

      if (download === undefined) {
        return createResult(
          { id: 'timing-download', name: 'Download Time', category: 'performance', severity: 'warning' },
          'info',
          'Not applicable (download timing data unavailable)',
          { recommendation: 'This rule checks download time when timing data is available' }
        );
      }

      const downloadMs = Math.round(download);
      const sizeKb = htmlSize ? Math.round(htmlSize / 1024) : 0;
      const { htmlSmall, htmlMedium, htmlLarge } = SEO_THRESHOLDS.timing.download;

      // Determine thresholds based on page size
      let thresholds: { excellent: number; good: number; acceptable: number };
      let sizeCategory: string;

      if (!htmlSize || htmlSize <= htmlSmall.sizeKb * 1024) {
        thresholds = htmlSmall;
        sizeCategory = `small (< ${htmlSmall.sizeKb}KB)`;
      } else if (htmlSize <= htmlMedium.sizeKb * 1024) {
        thresholds = htmlMedium;
        sizeCategory = `medium (${htmlSmall.sizeKb}-${htmlMedium.sizeKb}KB)`;
      } else {
        thresholds = htmlLarge;
        sizeCategory = `large (> ${htmlMedium.sizeKb}KB)`;
      }

      // Excellent
      if (download <= thresholds.excellent) {
        return createResult(
          { id: 'timing-download', name: 'Download Time', category: 'performance', severity: 'warning' },
          'pass',
          `Excellent download time (${downloadMs}ms for ${sizeKb}KB)`,
          {
            value: downloadMs,
            evidence: {
              found: `${downloadMs}ms`,
              size: `${sizeKb}KB (${sizeCategory})`,
              rating: 'Excellent',
              impact: 'Page content downloads very quickly.'
            }
          }
        );
      }

      // Good
      if (download <= thresholds.good) {
        return createResult(
          { id: 'timing-download', name: 'Download Time', category: 'performance', severity: 'warning' },
          'pass',
          `Good download time (${downloadMs}ms for ${sizeKb}KB)`,
          {
            value: downloadMs,
            evidence: {
              found: `${downloadMs}ms`,
              size: `${sizeKb}KB (${sizeCategory})`,
              rating: 'Good',
              target: `< ${thresholds.excellent}ms for excellent`,
              impact: 'Download time is acceptable for page size.'
            }
          }
        );
      }

      // Acceptable
      if (download <= thresholds.acceptable) {
        return createResult(
          { id: 'timing-download', name: 'Download Time', category: 'performance', severity: 'warning' },
          'warn',
          `Acceptable download time (${downloadMs}ms for ${sizeKb}KB) - could be faster`,
          {
            value: downloadMs,
            recommendation: 'Consider enabling compression or reducing page size',
            evidence: {
              found: `${downloadMs}ms`,
              size: `${sizeKb}KB (${sizeCategory})`,
              rating: 'Acceptable',
              target: `< ${thresholds.good}ms for good`,
              impact: 'Download time is slow for this page size. May affect user experience on slower connections.',
              optimization: [
                'Enable gzip/brotli compression',
                'Remove unnecessary HTML/inline styles',
                'Reduce page size by lazy loading content',
                'Use CDN for faster delivery'
              ]
            }
          }
        );
      }

      // Poor
      return createResult(
        { id: 'timing-download', name: 'Download Time', category: 'performance', severity: 'warning' },
        'fail',
        `Slow download time (${downloadMs}ms for ${sizeKb}KB) - needs optimization`,
        {
          value: downloadMs,
          recommendation: 'Download is too slow. Check compression, server bandwidth, and page size.',
          evidence: {
            found: `${downloadMs}ms`,
            size: `${sizeKb}KB (${sizeCategory})`,
            rating: 'Poor',
            target: `< ${thresholds.acceptable}ms for acceptable`,
            impact: 'Very slow download time. Users will experience noticeable delays.',
            optimization: [
              'Enable server compression (gzip/brotli)',
              'Reduce HTML size (remove inline data, comments)',
              'Use CDN with edge caching',
              'Check server bandwidth capacity',
              'Consider pagination for large content'
            ]
          }
        }
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
      if (size === undefined) {
        return createResult(
          { id: 'response-html-size', name: 'HTML Size', category: 'performance', severity: 'warning' },
          'info',
          'Not applicable (HTML size data unavailable)',
          { recommendation: 'This rule checks HTML size when response size data is available' }
        );
      }

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
          {
            value: sizeKb,
            recommendation: 'Consider reducing HTML size for faster parsing',
            evidence: {
              found: `${sizeKb}KB HTML`,
              expected: `≤ ${Math.round(good / 1024)}KB for optimal performance`,
              impact: 'Smaller HTML downloads faster and parses quicker, improving time to interactive.',
              learnMore: 'https://web.dev/dom-size/'
            }
          }
        );
      }
      if (size <= poor) {
        return createResult(
          { id: 'response-html-size', name: 'HTML Size', category: 'performance', severity: 'warning' },
          'warn',
          `HTML is large (${sizeKb}KB)`,
          {
            value: sizeKb,
            recommendation: 'Reduce HTML size. Check for inline data, remove unused code',
            evidence: {
              found: `${sizeKb}KB HTML`,
              expected: `≤ ${Math.round(warning / 1024)}KB (ideally ≤ ${Math.round(good / 1024)}KB)`,
              impact: 'Large HTML increases parsing time and delays time to interactive',
              learnMore: 'https://web.dev/dom-size/'
            }
          }
        );
      }
      return createResult(
        { id: 'response-html-size', name: 'HTML Size', category: 'performance', severity: 'warning' },
        'fail',
        `HTML is very large (${sizeKb}KB)`,
        {
          value: sizeKb,
          recommendation: 'Critical: HTML too large. Use pagination, lazy loading, or split content',
          evidence: {
            found: `${sizeKb}KB HTML`,
            expected: `≤ ${Math.round(poor / 1024)}KB (ideally ≤ ${Math.round(good / 1024)}KB)`,
            impact: 'Very large HTML severely impacts page parsing performance and user experience',
            learnMore: 'https://web.dev/dom-size/'
          }
        }
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
      if (ctx.htmlSize === undefined) {
        return createResult(
          { id: 'response-compression', name: 'Compression', category: 'performance', severity: 'warning' },
          'info',
          'Not applicable (HTML size data unavailable)',
          { recommendation: 'This rule checks for response compression when response data is available' }
        );
      }

      // If not compressed and HTML is larger than 1KB
      if (ctx.isCompressed === false && ctx.htmlSize > 1024) {
        return createResult(
          { id: 'response-compression', name: 'Compression', category: 'performance', severity: 'warning' },
          'warn',
          'Response is not compressed',
          {
            recommendation: 'Enable gzip or brotli compression on server',
            evidence: {
              found: 'No compression (Content-Encoding header missing)',
              expected: 'Content-Encoding: gzip or Content-Encoding: br',
              impact: 'Uncompressed responses are 60-80% larger, wasting bandwidth and slowing downloads',
              example: '# Apache\nAddOutputFilterByType DEFLATE text/html text/css application/javascript\n\n# Nginx\ngzip on;\ngzip_types text/html text/css application/javascript;',
              learnMore: 'https://web.dev/uses-text-compression/'
            }
          }
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
      return createResult(
        { id: 'response-compression', name: 'Compression', category: 'performance', severity: 'warning' },
        'info',
        'Not applicable (small response or compression status unknown)'
      );
    },
  },

  // ==========================================================================
  // Browser Caching for Resources
  // ==========================================================================
  {
    id: 'browser-caching',
    name: 'Browser Caching',
    category: 'performance',
    severity: 'warning',
    description: 'Static resources should have browser caching enabled',
    check: (ctx) => {
      if (ctx.resourcesWithoutCaching === undefined) {
        return createResult(
          { id: 'browser-caching', name: 'Browser Caching', category: 'performance', severity: 'warning' },
          'info',
          'Not applicable (resource caching data unavailable)',
          { recommendation: 'This rule checks for browser caching headers on static resources when resource data is available' }
        );
      }

      if (ctx.resourcesWithoutCaching > 0) {
        return createResult(
          { id: 'browser-caching', name: 'Browser Caching', category: 'performance', severity: 'warning' },
          'warn',
          `${ctx.resourcesWithoutCaching} resources without cache headers`,
          {
            value: ctx.resourcesWithoutCaching,
            recommendation: 'Enable browser caching with Cache-Control or Expires headers',
            evidence: {
              found: `${ctx.resourcesWithoutCaching} uncached resources`,
              expected: 'All static resources should have cache headers',
              impact: 'Without caching, browsers download resources repeatedly, increasing load time',
              learnMore: 'https://web.dev/uses-long-cache-ttl/'
            }
          }
        );
      }

      return createResult(
        { id: 'browser-caching', name: 'Browser Caching', category: 'performance', severity: 'warning' },
        'pass',
        'Resources have proper cache headers'
      );
    },
  },

  // ==========================================================================
  // JS Total Size (Mobile First)
  // ==========================================================================
  {
    id: 'js-total-size',
    name: 'JS Total Size',
    category: 'performance',
    severity: 'warning',
    description: 'Total JavaScript size should be minimized for mobile performance (Ideal < 150KB)',
    check: (ctx) => {
      const jsSize = ctx.jsTotalSize;
      
      if (jsSize === undefined || jsSize === 0) {
          // Fallback: If we have file count but no size, warn if count is high
          if (ctx.jsFilesCount && ctx.jsFilesCount > 20) {
               return createResult(
                  { id: 'js-total-size', name: 'JS Total Size', category: 'performance', severity: 'info' },
                  'info',
                  `Checking ${ctx.jsFilesCount} JS files (size unknown)`,
                  { recommendation: 'Enable deep analysis to measure transfer size. Aim for < 150KB total JS (gzip) for mobile.' }
               );
          }
          return createResult(
            { id: 'js-total-size', name: 'JS Total Size', category: 'performance', severity: 'info' },
            'info',
            'Not applicable (JS size data unavailable)',
            { recommendation: 'This rule checks total JavaScript size when resource size data is available' }
          );
      }

      const sizeKb = jsSize / 1024;

      if (sizeKb > 500) {
        return createResult(
          { id: 'js-total-size', name: 'JS Total Size', category: 'performance', severity: 'error' },
          'fail',
          `Critical: JS size ${sizeKb.toFixed(0)}KB exceeds 500KB limit`,
          {
            value: sizeKb,
            recommendation: 'Reduce JS bundle size immediately. 500KB+ significantly hurts INP and LCP on mobile.',
            evidence: {
              found: `${sizeKb.toFixed(0)}KB`,
              expected: '< 150KB (Ideal), < 300KB (Max)',
              impact: 'High JS execution time blocks the main thread, causing poor responsiveness.'
            }
          }
        );
      }

      if (sizeKb > 300) {
        return createResult(
          { id: 'js-total-size', name: 'JS Total Size', category: 'performance', severity: 'warning' },
          'warn',
          `Risk: JS size ${sizeKb.toFixed(0)}KB (> 300KB)`,
          {
            value: sizeKb,
            recommendation: 'Optimize JS bundles. Code split routes and defer non-critical scripts.',
            evidence: {
              found: `${sizeKb.toFixed(0)}KB`,
              expected: '< 300KB',
              impact: 'Mobile devices struggle with parsing/executing large JS bundles.'
            }
          }
        );
      }

      return createResult(
        { id: 'js-total-size', name: 'JS Total Size', category: 'performance', severity: 'info' },
        'pass',
        `Excellent: JS size ${sizeKb.toFixed(0)}KB (< 300KB)`,
        { value: sizeKb }
      );
    },
  },

  // ==========================================================================
  // Too Many JS/CSS Files
  // ==========================================================================
  {
    id: 'excessive-js-css-files',
    name: 'Excessive JS/CSS Files',
    category: 'performance',
    severity: 'warning',
    description: 'Pages should not load more than 100 JS/CSS files',
    check: (ctx) => {
      const jsCount = ctx.jsFilesCount || 0;
      const cssCount = ctx.cssFilesCount || 0;
      const totalFiles = jsCount + cssCount;

      if (totalFiles === 0) {
        return createResult(
          { id: 'excessive-js-css-files', name: 'Excessive JS/CSS Files', category: 'performance', severity: 'warning' },
          'info',
          'Not applicable (no JS/CSS files detected or file count data unavailable)',
          { recommendation: 'This rule checks for excessive JS/CSS file count when resource data is available' }
        );
      }

      if (totalFiles > 100) {
        return createResult(
          { id: 'excessive-js-css-files', name: 'Excessive JS/CSS Files', category: 'performance', severity: 'warning' },
          'fail',
          `Page loads ${totalFiles} JS/CSS files (exceeds 100)`,
          {
            value: totalFiles,
            recommendation: 'Combine files or use bundling to reduce HTTP requests',
            evidence: {
              found: `${totalFiles} files (JS: ${jsCount}, CSS: ${cssCount})`,
              expected: '<100 files',
              impact: 'Each file requires a separate HTTP request, increasing page load time'
            }
          }
        );
      }

      if (totalFiles > 50) {
        return createResult(
          { id: 'excessive-js-css-files', name: 'Excessive JS/CSS Files', category: 'performance', severity: 'warning' },
          'warn',
          `Page loads ${totalFiles} JS/CSS files`,
          {
            value: totalFiles,
            recommendation: 'Consider bundling resources to reduce requests',
            evidence: {
              found: `${totalFiles} files`,
              expected: '<50 files recommended',
              impact: 'Many files increase connection overhead'
            }
          }
        );
      }

      return createResult(
        { id: 'excessive-js-css-files', name: 'Excessive JS/CSS Files', category: 'performance', severity: 'warning' },
        'pass',
        `JS/CSS file count is acceptable (${totalFiles} files)`,
        { value: totalFiles }
      );
    },
  },

  // ==========================================================================
  // Unminified Resources
  // ==========================================================================
  {
    id: 'unminified-resources',
    name: 'Unminified Resources',
    category: 'performance',
    severity: 'warning',
    description: 'JS and CSS files should be minified',
    check: (ctx) => {
      if (ctx.unminifiedResources === undefined) {
        return createResult(
          { id: 'unminified-resources', name: 'Unminified Resources', category: 'performance', severity: 'warning' },
          'info',
          'Not applicable (minification data unavailable)',
          { recommendation: 'This rule checks for unminified JS/CSS files when resource analysis data is available' }
        );
      }

      if (ctx.unminifiedResources > 0) {
        return createResult(
          { id: 'unminified-resources', name: 'Unminified Resources', category: 'performance', severity: 'warning' },
          'warn',
          `${ctx.unminifiedResources} unminified JS/CSS files detected`,
          {
            value: ctx.unminifiedResources,
            recommendation: 'Minify JavaScript and CSS files to reduce file size',
            evidence: {
              found: `${ctx.unminifiedResources} unminified files`,
              expected: 'All JS/CSS files should be minified',
              impact: 'Minification reduces file size by removing whitespace and comments',
              learnMore: 'https://web.dev/minify-css/'
            }
          }
        );
      }

      return createResult(
        { id: 'unminified-resources', name: 'Unminified Resources', category: 'performance', severity: 'warning' },
        'pass',
        'All resources are minified'
      );
    },
  },

  // ==========================================================================
  // Total Page Weight (Google Benchmark: < 500KB)
  // ==========================================================================
  {
    id: 'page-weight',
    name: 'Total Page Weight',
    category: 'performance',
    severity: 'warning',
    description: 'Total page size should be under 500KB for optimal performance (Google benchmark)',
    check: (ctx) => {
      const totalSize = ctx.totalPageSize;
      if (totalSize === undefined) {
        return createResult(
          { id: 'page-weight', name: 'Total Page Weight', category: 'performance', severity: 'warning' },
          'info',
          'Not applicable (total page size data unavailable)',
          { recommendation: 'This rule checks total page weight when resource size data is available' }
        );
      }

      const sizeKb = Math.round(totalSize / 1024);
      const sizeMb = (totalSize / (1024 * 1024)).toFixed(2);

      // Google benchmark: < 500KB
      if (totalSize <= 500 * 1024) {
        return createResult(
          { id: 'page-weight', name: 'Total Page Weight', category: 'performance', severity: 'warning' },
          'pass',
          `Page weight is excellent (${sizeKb}KB)`,
          { value: sizeKb }
        );
      }

      // Warning: 500KB - 1MB
      if (totalSize <= 1024 * 1024) {
        return createResult(
          { id: 'page-weight', name: 'Total Page Weight', category: 'performance', severity: 'warning' },
          'warn',
          `Page weight exceeds Google benchmark (${sizeKb}KB)`,
          {
            value: sizeKb,
            recommendation: 'Reduce page size to under 500KB for faster loading',
            evidence: {
              found: `${sizeKb}KB`,
              expected: '< 500KB (Google benchmark)',
              impact: 'Larger pages take longer to download, especially on mobile networks',
              learnMore: 'https://web.dev/total-byte-weight/'
            }
          }
        );
      }

      // Error: > 1MB
      if (totalSize <= 2 * 1024 * 1024) {
        return createResult(
          { id: 'page-weight', name: 'Total Page Weight', category: 'performance', severity: 'warning' },
          'fail',
          `Page weight is heavy (${sizeMb}MB)`,
          {
            value: sizeKb,
            recommendation: 'Critical: Page is too heavy. Compress images, remove unused code',
            evidence: {
              found: `${sizeMb}MB`,
              expected: '< 500KB',
              impact: 'Heavy pages cause slow loading and high data costs for users'
            }
          }
        );
      }

      // Critical: > 2MB
      return createResult(
        { id: 'page-weight', name: 'Total Page Weight', category: 'performance', severity: 'warning' },
        'fail',
        `Page weight is critical (${sizeMb}MB)`,
        {
          value: sizeKb,
          recommendation: 'Urgent: Drastically reduce page weight. Consider lazy loading, pagination, or removing heavy assets',
          evidence: {
            found: `${sizeMb}MB`,
            expected: '< 500KB',
            impact: 'Severely impacts mobile users and SEO rankings'
          }
        }
      );
    },
  },

  // ==========================================================================
  // Total Request Count (Google Benchmark: < 50 requests)
  // ==========================================================================
  {
    id: 'request-count',
    name: 'Total HTTP Requests',
    category: 'performance',
    severity: 'warning',
    description: 'Total requests should be under 50 for optimal performance (Google benchmark)',
    check: (ctx) => {
      const totalRequests = ctx.totalRequests;
      if (totalRequests === undefined) {
        return createResult(
          { id: 'request-count', name: 'Total HTTP Requests', category: 'performance', severity: 'warning' },
          'info',
          'Not applicable (total requests data unavailable)',
          { recommendation: 'This rule checks total HTTP request count when resource data is available' }
        );
      }

      // Google benchmark: < 50 requests
      if (totalRequests <= 50) {
        return createResult(
          { id: 'request-count', name: 'Total HTTP Requests', category: 'performance', severity: 'warning' },
          'pass',
          `Request count is good (${totalRequests} requests)`,
          { value: totalRequests }
        );
      }

      // Warning: 50-100 requests
      if (totalRequests <= 100) {
        return createResult(
          { id: 'request-count', name: 'Total HTTP Requests', category: 'performance', severity: 'warning' },
          'warn',
          `Request count exceeds Google benchmark (${totalRequests} requests)`,
          {
            value: totalRequests,
            recommendation: 'Reduce requests by bundling assets, using CSS sprites, or lazy loading',
            evidence: {
              found: `${totalRequests} requests`,
              expected: '< 50 requests (Google benchmark)',
              impact: 'Each HTTP request adds latency, especially on mobile networks'
            }
          }
        );
      }

      // Error: > 100 requests
      return createResult(
        { id: 'request-count', name: 'Total HTTP Requests', category: 'performance', severity: 'warning' },
        'fail',
        `Too many HTTP requests (${totalRequests} requests)`,
        {
          value: totalRequests,
          recommendation: 'Critical: Reduce requests significantly. Bundle JS/CSS, use image sprites, implement lazy loading',
          evidence: {
            found: `${totalRequests} requests`,
            expected: '< 50 requests',
            impact: 'Excessive requests severely impact page load time'
          }
        }
      );
    },
  },

  // ==========================================================================
  // Font Optimization
  // ==========================================================================
  {
    id: 'font-files-count',
    name: 'Font Files Count',
    category: 'performance',
    severity: 'info',
    description: 'Limit custom font files to reduce page weight (fonts avg ~123KB)',
    check: (ctx) => {
      const fontCount = ctx.fontFilesCount;
      if (fontCount === undefined) {
        return createResult(
          { id: 'font-files-count', name: 'Font Files Count', category: 'performance', severity: 'info' },
          'info',
          'Not applicable (font file count data unavailable)',
          { recommendation: 'This rule checks for excessive custom font files when resource data is available' }
        );
      }

      // No fonts - fine
      if (fontCount === 0) {
        return createResult(
          { id: 'font-files-count', name: 'Font Files Count', category: 'performance', severity: 'info' },
          'pass',
          'No custom fonts detected (using system fonts)'
        );
      }

      // 1-3 fonts - acceptable
      if (fontCount <= 3) {
        return createResult(
          { id: 'font-files-count', name: 'Font Files Count', category: 'performance', severity: 'info' },
          'pass',
          `Font files count is acceptable (${fontCount} fonts)`,
          { value: fontCount }
        );
      }

      // 4-6 fonts - warning
      if (fontCount <= 6) {
        return createResult(
          { id: 'font-files-count', name: 'Font Files Count', category: 'performance', severity: 'info' },
          'info',
          `Multiple font files detected (${fontCount} fonts)`,
          {
            value: fontCount,
            recommendation: 'Consider reducing font variants or using system fonts',
            evidence: {
              found: `${fontCount} font files`,
              expected: '1-3 font files',
              impact: 'Custom fonts add ~40-100KB each to page weight'
            }
          }
        );
      }

      // > 6 fonts - too many
      return createResult(
        { id: 'font-files-count', name: 'Font Files Count', category: 'performance', severity: 'info' },
        'warn',
        `Too many font files (${fontCount} fonts)`,
        {
          value: fontCount,
          recommendation: 'Reduce font files. Use variable fonts or limit to essential weights/styles',
          evidence: {
            found: `${fontCount} font files`,
            expected: '< 4 font files',
            impact: 'Excessive fonts significantly increase page weight and FOIT/FOUT issues'
          }
        }
      );
    },
  },
  {
    id: 'font-display-swap',
    name: 'Font Display Swap',
    category: 'performance',
    severity: 'warning',
    description: 'Custom fonts should use font-display: swap to prevent invisible text',
    check: (ctx) => {
      // Only check if we have fonts
      if (!ctx.fontFilesCount || ctx.fontFilesCount === 0) {
        return createResult(
          { id: 'font-display-swap', name: 'Font Display Swap', category: 'performance', severity: 'warning' },
          'info',
          'Not applicable (no custom fonts detected)',
          { recommendation: 'This rule checks for font-display: swap when custom fonts are present' }
        );
      }
      if (ctx.hasFontDisplaySwap === undefined) {
        return createResult(
          { id: 'font-display-swap', name: 'Font Display Swap', category: 'performance', severity: 'warning' },
          'info',
          'Not applicable (font display swap data unavailable)',
          { recommendation: 'This rule checks for font-display: swap in @font-face declarations' }
        );
      }

      if (!ctx.hasFontDisplaySwap) {
        return createResult(
          { id: 'font-display-swap', name: 'Font Display Swap', category: 'performance', severity: 'warning' },
          'warn',
          'Custom fonts may block text rendering',
          {
            recommendation: 'Add font-display: swap to @font-face declarations',
            evidence: {
              found: 'Custom fonts without font-display: swap',
              expected: '@font-face { font-display: swap; }',
              impact: 'Without font-display, text may be invisible until fonts load (FOIT), hurting perceived performance',
              example: '@font-face {\n  font-family: "Open Sans";\n  src: url("/fonts/OpenSans.woff2");\n  font-display: swap; /* Add this */\n}',
              learnMore: 'https://web.dev/font-display/'
            }
          }
        );
      }

      return createResult(
        { id: 'font-display-swap', name: 'Font Display Swap', category: 'performance', severity: 'warning' },
        'pass',
        'Font display swap is enabled'
      );
    },
  },

  // ==========================================================================
  // Third-Party Resources
  // ==========================================================================
  {
    id: 'external-origins-count',
    name: 'External Origins',
    category: 'performance',
    severity: 'info',
    description: 'Limit external origins to reduce DNS lookups and connection overhead',
    check: (ctx) => {
      const externalOrigins = ctx.externalOrigins;
      if (externalOrigins === undefined) {
        return createResult(
          { id: 'external-origins-count', name: 'External Origins', category: 'performance', severity: 'info' },
          'info',
          'Not applicable (external origins data unavailable)',
          { recommendation: 'This rule checks for excessive external origins when resource data is available' }
        );
      }

      // 0-5 external origins - good
      if (externalOrigins <= 5) {
        return createResult(
          { id: 'external-origins-count', name: 'External Origins', category: 'performance', severity: 'info' },
          'pass',
          `External origins count is good (${externalOrigins} origins)`,
          { value: externalOrigins }
        );
      }

      // 6-10 origins - acceptable
      if (externalOrigins <= 10) {
        return createResult(
          { id: 'external-origins-count', name: 'External Origins', category: 'performance', severity: 'info' },
          'info',
          `Multiple external origins (${externalOrigins} origins)`,
          {
            value: externalOrigins,
            recommendation: 'Use preconnect hints for critical external domains',
            evidence: {
              found: `${externalOrigins} external origins`,
              expected: '< 6 external origins',
              impact: 'Each origin requires DNS lookup and connection setup'
            }
          }
        );
      }

      // > 10 origins - too many
      return createResult(
        { id: 'external-origins-count', name: 'External Origins', category: 'performance', severity: 'info' },
        'warn',
        `Too many external origins (${externalOrigins} origins)`,
        {
          value: externalOrigins,
          recommendation: 'Reduce third-party dependencies or consolidate to fewer providers',
          evidence: {
            found: `${externalOrigins} external origins`,
            expected: '< 10 external origins',
            impact: 'Excessive external origins increase DNS lookups and connection overhead significantly'
          }
        }
      );
    },
  },

  // ==========================================================================
  // Iframe Performance Impact (Ads, Widgets, Embeds)
  // ==========================================================================
  {
    id: 'iframe-count',
    name: 'Iframe Count',
    category: 'performance',
    severity: 'info',
    description: 'Excessive iframes (ads, widgets, embeds) impact page performance',
    check: (ctx) => {
      const iframeCount = ctx.iframeCount;
      if (iframeCount === undefined || iframeCount === 0) {
        return createResult(
          { id: 'iframe-count', name: 'Iframe Count', category: 'performance', severity: 'info' },
          'pass',
          'No iframes detected'
        );
      }

      // 1-3 iframes - acceptable
      if (iframeCount <= 3) {
        return createResult(
          { id: 'iframe-count', name: 'Iframe Count', category: 'performance', severity: 'info' },
          'pass',
          `Iframe count is acceptable (${iframeCount} iframes)`,
          { value: iframeCount }
        );
      }

      // 4-6 iframes - warning
      if (iframeCount <= 6) {
        return createResult(
          { id: 'iframe-count', name: 'Iframe Count', category: 'performance', severity: 'info' },
          'info',
          `Multiple iframes detected (${iframeCount} iframes)`,
          {
            value: iframeCount,
            recommendation: 'Consider lazy loading iframes or reducing embedded content',
            evidence: {
              found: `${iframeCount} iframes`,
              expected: '< 4 iframes',
              impact: 'Each iframe loads a separate document, increasing page weight and requests'
            }
          }
        );
      }

      // > 6 iframes - too many (likely ad-heavy)
      return createResult(
        { id: 'iframe-count', name: 'Iframe Count', category: 'performance', severity: 'info' },
        'warn',
        `Too many iframes (${iframeCount} iframes)`,
        {
          value: iframeCount,
          recommendation: 'Reduce iframes. Consider removing non-essential ads or widgets',
          evidence: {
            found: `${iframeCount} iframes`,
            expected: '< 4 iframes',
            impact: 'Excessive iframes (often ads) significantly slow down page load'
          }
        }
      );
    },
  },

  // ==========================================================================
  // Large Base64 Inline Images
  // ==========================================================================
  {
    id: 'large-base64-images',
    name: 'Large Inline Images',
    category: 'performance',
    severity: 'warning',
    description: 'Large base64 inline images bloat HTML and cannot be cached separately',
    check: (ctx) => {
      const largeBase64 = ctx.largeBase64ImagesCount;
      if (largeBase64 === undefined || largeBase64 === 0) {
        return createResult(
          { id: 'large-base64-images', name: 'Large Inline Images', category: 'performance', severity: 'warning' },
          'pass',
          'No large base64 inline images detected'
        );
      }

      return createResult(
        { id: 'large-base64-images', name: 'Large Inline Images', category: 'performance', severity: 'warning' },
        'warn',
        `${largeBase64} large base64 image(s) found (> 5KB each)`,
        {
          value: largeBase64,
          recommendation: 'Use external image files instead of large base64 strings',
          evidence: {
            found: `${largeBase64} large inline images`,
            expected: 'Base64 images should be < 2KB (icons only)',
            impact: 'Large base64 images increase HTML size and cannot be cached separately'
          }
        }
      );
    },
  },
];

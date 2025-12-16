import { SeoRule, createResult } from './types.js';
import { SEO_THRESHOLDS } from './thresholds.js';

export const technicalRules: SeoRule[] = [
  {
    id: 'canonical-exists',
    name: 'Canonical URL',
    category: 'technical',
    severity: 'warning',
    description: 'Page should have a canonical URL',
    check: (ctx) => {
      if (!ctx.hasCanonical) {
        return createResult(
          { id: 'canonical-exists', name: 'Canonical URL', category: 'technical', severity: 'warning' },
          'warn',
          'No canonical URL defined',
          {
            recommendation: 'Add a canonical URL to indicate the preferred version of this page.',
            evidence: {
              found: 'No <link rel="canonical"> tag',
              expected: 'A canonical URL pointing to the preferred version',
              impact: 'Without canonical, search engines may split ranking signals across duplicate URLs (www vs non-www, HTTP vs HTTPS, with/without trailing slash).',
              example: '<link rel="canonical" href="https://example.com/page/">',
              learnMore: 'https://developers.google.com/search/docs/crawling-indexing/canonicalization'
            }
          }
        );
      }
      return createResult(
        { id: 'canonical-exists', name: 'Canonical URL', category: 'technical', severity: 'warning' },
        'pass',
        'Canonical URL is defined',
        { value: ctx.canonicalUrl }
      );
    },
  },
  {
    id: 'lang-exists',
    name: 'Language',
    category: 'technical',
    severity: 'warning',
    description: 'HTML should have lang attribute',
    check: (ctx) => {
      if (!ctx.hasLang) {
        return createResult(
          { id: 'lang-exists', name: 'Language', category: 'technical', severity: 'warning' },
          'warn',
          'Missing lang attribute on <html>',
          {
            recommendation: 'Declare the page language for better accessibility and SEO.',
            evidence: {
              found: '<html> tag without lang attribute',
              expected: '<html lang="en"> (or appropriate language code)',
              impact: 'The lang attribute helps screen readers pronounce content correctly and helps search engines serve the right audience. It\'s required for WCAG accessibility compliance.',
              example: '<html lang="en">\n<html lang="pt-BR">\n<html lang="es">',
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/lang'
            }
          }
        );
      }
      return createResult(
        { id: 'lang-exists', name: 'Language', category: 'technical', severity: 'warning' },
        'pass',
        `Language attribute set (${ctx.langValue})`
      );
    },
  },
  {
    id: 'charset-exists',
    name: 'Charset',
    category: 'technical',
    severity: 'warning',
    description: 'Page should declare character encoding',
    check: (ctx) => {
      if (!ctx.hasCharset) {
        return createResult(
          { id: 'charset-exists', name: 'Charset', category: 'technical', severity: 'warning' },
          'warn',
          'Missing charset declaration',
          {
            recommendation: 'Declare character encoding to ensure proper text rendering.',
            evidence: {
              found: 'No charset meta tag',
              expected: '<meta charset="UTF-8"> as the first element in <head>',
              impact: 'Without charset declaration, browsers may guess incorrectly, causing garbled text (mojibake). UTF-8 supports all languages and special characters.',
              example: '<head>\n  <meta charset="UTF-8">\n  <!-- other tags -->\n</head>',
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta#charset'
            }
          }
        );
      }
      if (ctx.charset && ctx.charset.toLowerCase() !== 'utf-8') {
        return createResult(
          { id: 'charset-exists', name: 'Charset', category: 'technical', severity: 'warning' },
          'warn',
          `Non-UTF-8 charset: ${ctx.charset}`,
          {
            recommendation: 'Switch to UTF-8 encoding for universal compatibility.',
            evidence: {
              found: `charset="${ctx.charset}"`,
              expected: 'charset="UTF-8"',
              impact: 'UTF-8 is the standard encoding that supports all languages. Legacy encodings like ISO-8859-1 or Windows-1252 cannot display all characters.',
              learnMore: 'https://www.w3.org/International/questions/qa-choosing-encodings'
            }
          }
        );
      }
      return createResult(
        { id: 'charset-exists', name: 'Charset', category: 'technical', severity: 'warning' },
        'pass',
        'UTF-8 charset declared'
      );
    },
  },
  {
    id: 'robots-noindex',
    name: 'Robots Noindex',
    category: 'technical',
    severity: 'warning',
    description: 'Check if page is set to noindex',
    check: (ctx) => {
      if (!ctx.metaRobots || ctx.metaRobots.length === 0) {
        return createResult(
          { id: 'robots-noindex', name: 'Robots', category: 'technical', severity: 'warning' },
          'info',
          'Not applicable (no robots meta tag)',
          { recommendation: 'This rule checks for noindex directive in robots meta tag' }
        );
      }

      if (ctx.metaRobots.includes('noindex')) {
        return createResult(
          { id: 'robots-noindex', name: 'Robots', category: 'technical', severity: 'warning' },
          'warn',
          'Page is set to noindex',
          {
            value: ctx.metaRobots.join(', '),
            recommendation: 'Verify that noindex is intentional. This page will NOT appear in search results.',
            evidence: {
              found: `<meta name="robots" content="${ctx.metaRobots.join(', ')}">`,
              expected: 'No noindex directive (for pages you want indexed)',
              impact: 'The noindex directive completely prevents this page from appearing in Google, Bing, and other search engines. This is useful for thank-you pages or admin areas, but harmful if applied accidentally.',
              example: 'To allow indexing: <meta name="robots" content="index, follow">',
              learnMore: 'https://developers.google.com/search/docs/crawling-indexing/block-indexing'
            }
          }
        );
      }
      return createResult(
        { id: 'robots-noindex', name: 'Robots', category: 'technical', severity: 'info' },
        'info',
        `Robots meta: ${ctx.metaRobots.join(', ')}`
      );
    },
  },
  {
    id: 'favicon-exists',
    name: 'Favicon',
    category: 'technical',
    severity: 'warning',
    description: 'Page should have a favicon defined',
    check: (ctx) => {
      if (!ctx.hasFavicon) {
        return createResult(
          { id: 'favicon-exists', name: 'Favicon', category: 'technical', severity: 'warning' },
          'warn',
          'No favicon defined',
          {
            recommendation: 'Add a favicon to improve brand recognition and user experience.',
            evidence: {
              found: 'No favicon link tag',
              expected: '<link rel="icon"> pointing to your favicon',
              impact: 'Favicons appear in browser tabs, bookmarks, history, and search results. Missing favicons look unprofessional and generate 404 errors in server logs.',
              example: '<link rel="icon" href="/favicon.ico" sizes="32x32">\n<link rel="icon" href="/icon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
              learnMore: 'https://web.dev/articles/add-manifest#icons'
            }
          }
        );
      }
      return createResult(
        { id: 'favicon-exists', name: 'Favicon', category: 'technical', severity: 'warning' },
        'pass',
        'Favicon is defined',
        { value: ctx.faviconUrl }
      );
    },
  },
  // URL Rules
  {
    id: 'url-lowercase',
    name: 'URL Lowercase',
    category: 'technical',
    severity: 'warning',
    description: 'URLs should be lowercase for consistency',
    check: (ctx) => {
      if (ctx.urlHasUppercase) {
        return createResult(
          { id: 'url-lowercase', name: 'URL Lowercase', category: 'technical', severity: 'warning' },
          'warn',
          'URL contains uppercase characters',
          {
            recommendation: 'Convert URL to lowercase for consistency and to avoid duplicate content.',
            evidence: {
              found: ctx.url,
              expected: 'All lowercase URL path',
              impact: 'URLs are case-sensitive on most servers. /Page and /page are different URLs, which can split ranking signals and cause duplicate content issues.',
              example: 'Instead of /About-Us, use /about-us',
              learnMore: 'https://developers.google.com/search/docs/crawling-indexing/url-structure'
            }
          }
        );
      }
      return createResult(
        { id: 'url-lowercase', name: 'URL Lowercase', category: 'technical', severity: 'warning' },
        'info',
        'Not applicable (URL is properly lowercase)',
        { recommendation: 'This rule ensures URLs use lowercase to avoid duplicate content issues' }
      );
    },
  },
  {
    id: 'url-clean',
    name: 'URL Clean',
    category: 'technical',
    severity: 'warning',
    description: 'URLs should not contain special characters or accents',
    check: (ctx) => {
      if (ctx.urlHasAccents || ctx.urlHasSpecialChars) {
        const issues = [];
        if (ctx.urlHasAccents) issues.push('accents');
        if (ctx.urlHasSpecialChars) issues.push('special characters');
        return createResult(
          { id: 'url-clean', name: 'URL Clean', category: 'technical', severity: 'warning' },
          'warn',
          `URL contains ${issues.join(' and ')}`,
          {
            recommendation: 'Use clean, ASCII-only URLs for maximum compatibility.',
            evidence: {
              found: ctx.url,
              expected: 'URL with only letters, numbers, and hyphens',
              impact: 'Accented characters and special characters get percent-encoded (%C3%A9 instead of é), making URLs ugly and hard to share. Some systems may not handle them correctly.',
              example: 'Instead of /café-menü, use /cafe-menu',
              learnMore: 'https://developers.google.com/search/docs/crawling-indexing/url-structure'
            }
          }
        );
      }
      return createResult(
        { id: 'url-clean', name: 'URL Clean', category: 'technical', severity: 'warning' },
        'info',
        'Not applicable (URL is clean)',
        { recommendation: 'This rule checks for accents and special characters in URLs' }
      );
    },
  },
  {
    id: 'url-no-params',
    name: 'URL Parameters',
    category: 'technical',
    severity: 'warning',
    description: 'URLs should not contain query parameters',
    check: (ctx) => {
      if (!ctx.url) {
        return createResult(
          { id: 'url-no-params', name: 'URL Parameters', category: 'technical', severity: 'warning' },
          'info',
          'Not applicable (URL data unavailable)',
          { recommendation: 'This rule checks for query parameters that can cause duplicate content' }
        );
      }
      try {
        const urlObj = new URL(ctx.url);
        if (urlObj.search && urlObj.search.length > 1) {
          return createResult(
            { id: 'url-no-params', name: 'URL Parameters', category: 'technical', severity: 'warning' },
            'warn',
            'URL contains query parameters',
            {
              value: urlObj.search,
              recommendation: 'Consider using clean, path-based URLs instead of query parameters.',
              evidence: {
                found: urlObj.search,
                expected: 'Clean URL without query strings',
                impact: 'Query parameters make URLs harder to read and share. Google recommends using simple, descriptive URLs. Parameters can also cause crawl budget waste if they create many URL variations.',
                example: 'Instead of /products?category=shoes&color=red\nUse /products/shoes/red',
                learnMore: 'https://developers.google.com/search/docs/crawling-indexing/url-structure#use-simple-urls'
              }
            }
          );
        }
      } catch {
        // invalid url
      }
      return createResult(
        { id: 'url-no-params', name: 'URL Parameters', category: 'technical', severity: 'warning' },
        'info',
        'Not applicable (no query parameters)',
        { recommendation: 'Clean URLs without parameters are preferred for SEO' }
      );
    },
  },
  {
    id: 'technical-meta-robots-directives',
    name: 'Meta Robots Directives',
    category: 'technical',
    severity: 'warning',
    description: 'Check for restrictive meta robots directives like noindex, nofollow, noarchive etc.',
    check: (ctx) => {
      if (!ctx.metaRobots || ctx.metaRobots.length === 0) {
        return createResult(
          { id: 'technical-meta-robots-directives', name: 'Meta Robots Directives', category: 'technical', severity: 'warning' },
          'info',
          'Not applicable (no robots meta tag)',
          { recommendation: 'This rule checks for restrictive robots directives' }
        );
      }

      const restrictiveDirectives = ['noindex', 'nofollow', 'noarchive', 'nosnippet', 'noimageindex'];
      const foundRestrictive = ctx.metaRobots.filter(directive => restrictiveDirectives.includes(directive));

      if (foundRestrictive.length > 0) {
        return createResult(
          { id: 'technical-meta-robots-directives', name: 'Meta Robots Directives', category: 'technical', severity: 'warning' },
          'warn',
          `Restrictive meta robots directives found: ${foundRestrictive.join(', ')}`,
          {
            recommendation: 'Verify these restrictive directives are intentional.',
            evidence: {
              found: foundRestrictive.join(', '),
              expected: 'index, follow (for pages you want in search results)',
              impact: 'noindex: page won\'t appear in search. nofollow: links won\'t pass PageRank. noarchive: no cached version. nosnippet: no description in results. noimageindex: images not indexed.',
              example: 'To allow everything: <meta name="robots" content="index, follow, archive, snippet">',
              learnMore: 'https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag'
            }
          }
        );
      }
      return createResult(
        { id: 'technical-meta-robots-directives', name: 'Meta Robots Directives', category: 'technical', severity: 'warning' },
        'info',
        'Not applicable (no restrictive directives found)',
        { recommendation: 'Meta robots directives allow full indexing' }
      );
    },
  },
  {
    id: 'technical-x-robots-tag',
    name: 'X-Robots-Tag Header',
    category: 'technical',
    severity: 'info',
    description: 'X-Robots-Tag header can be used to control indexing, especially for non-HTML content.',
    check: (ctx) => {
      if (!ctx.responseHeaders) {
        return createResult(
          { id: 'technical-x-robots-tag', name: 'X-Robots-Tag Header', category: 'technical', severity: 'info' },
          'info',
          'Not applicable (response headers unavailable)',
          { recommendation: 'This rule checks for X-Robots-Tag HTTP header' }
        );
      }
      const xRobotsTag = ctx.responseHeaders['x-robots-tag'] || ctx.responseHeaders['X-Robots-Tag'];
      if (xRobotsTag) {
        return createResult(
          { id: 'technical-x-robots-tag', name: 'X-Robots-Tag Header', category: 'technical', severity: 'info' },
          'info',
          `X-Robots-Tag header found: ${xRobotsTag}`,
          {
            recommendation: 'Verify this server-level robots directive is intentional.',
            evidence: {
              found: `X-Robots-Tag: ${xRobotsTag}`,
              impact: 'X-Robots-Tag HTTP header works like meta robots but at server level. It\'s commonly used for non-HTML files (PDFs, images) but can also override meta tags for HTML pages.',
              learnMore: 'https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag#xrobotstag'
            }
          }
        );
      }
      return createResult(
        { id: 'technical-x-robots-tag', name: 'X-Robots-Tag Header', category: 'technical', severity: 'info' },
        'info',
        'Not applicable (no X-Robots-Tag header)',
        { recommendation: 'X-Robots-Tag header is not present' }
      );
    },
  },
  {
    id: 'technical-trust-signals',
    name: 'Trust Signals (Links)',
    category: 'technical',
    severity: 'info',
    description: 'Presence of links to "About", "Contact", "Privacy Policy", "Terms of Service" pages builds trust.',
    check: (ctx) => {
      const missingSignals = [];
      if (!ctx.hasAboutPageLink) missingSignals.push('About Page');
      if (!ctx.hasContactPageLink) missingSignals.push('Contact Page');
      if (!ctx.hasPrivacyPolicyLink) missingSignals.push('Privacy Policy');
      if (!ctx.hasTermsOfServiceLink) missingSignals.push('Terms of Service');

      if (missingSignals.length > 0) {
        return createResult(
          { id: 'technical-trust-signals', name: 'Trust Signals (Links)', category: 'technical', severity: 'info' },
          'info',
          `Missing links to key trust pages: ${missingSignals.join(', ')}`,
          {
            recommendation: 'Add links to trust-building pages to improve E-E-A-T signals.',
            evidence: {
              found: `Missing: ${missingSignals.join(', ')}`,
              expected: 'Links to About, Contact, Privacy Policy, and Terms of Service',
              impact: 'Google\'s E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) guidelines favor sites that clearly identify who they are. These pages are essential for YMYL (Your Money Your Life) sites.',
              example: '<footer>\n  <a href="/about">About Us</a>\n  <a href="/contact">Contact</a>\n  <a href="/privacy">Privacy Policy</a>\n  <a href="/terms">Terms of Service</a>\n</footer>',
              learnMore: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content'
            }
          }
        );
      }
      return createResult(
        { id: 'technical-trust-signals', name: 'Trust Signals (Links)', category: 'technical', severity: 'info' },
        'info',
        'Not applicable (all trust signals present)',
        { recommendation: 'All key trust pages are linked' }
      );
    },
  },
  {
    id: 'technical-text-html-ratio',
    name: 'Text/HTML Ratio',
    category: 'technical',
    severity: 'info',
    description: 'A higher text to HTML ratio indicates more content relative to code, which is good for SEO.',
    check: (ctx) => {
      if (ctx.textHtmlRatio === undefined) {
        return createResult(
          { id: 'technical-text-html-ratio', name: 'Text/HTML Ratio', category: 'technical', severity: 'info' },
          'info',
          'Not applicable (text/HTML ratio data unavailable)',
          { recommendation: 'This rule checks the ratio of visible text to HTML code' }
        );
      }

      const threshold = 15; // Target at least 15% text content
      if (ctx.textHtmlRatio < threshold) {
        return createResult(
          { id: 'technical-text-html-ratio', name: 'Text/HTML Ratio', category: 'technical', severity: 'info' },
          'warn',
          `Low Text/HTML ratio: ${ctx.textHtmlRatio.toFixed(2)}% (target > ${threshold}%)`,
          {
            recommendation: 'Increase visible text content relative to HTML code.',
            evidence: {
              found: `${ctx.textHtmlRatio.toFixed(2)}% text content`,
              expected: `At least ${threshold}% text content`,
              impact: 'Pages with low text-to-HTML ratio may appear thin or low-quality to search engines. This can indicate excessive scripts, inline CSS, or insufficient content.',
              learnMore: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content#content-and-quality'
            }
          }
        );
      }
      return createResult(
        { id: 'technical-text-html-ratio', name: 'Text/HTML Ratio', category: 'technical', severity: 'info' },
        'info',
        'Not applicable (text/HTML ratio is good)',
        { recommendation: `Text/HTML ratio is ${ctx.textHtmlRatio.toFixed(2)}%, which is healthy` }
      );
    },
  },
  {
    id: 'technical-robots-txt-hint',
    name: 'Robots.txt Hint',
    category: 'technical',
    severity: 'info',
    description: 'Ensure a robots.txt file exists at the root of the domain to guide crawlers.',
    check: (ctx) => {
      // This rule is a hint as robots.txt existence cannot be checked from single HTML analysis.
      // It assumes external check or user awareness.
      // Could be integrated with network requests later if analyzer has that capability.
      return createResult(
        { id: 'technical-robots-txt-hint', name: 'Robots.txt Hint', category: 'technical', severity: 'info' },
        'info',
        'Robots.txt existence cannot be verified from HTML alone.',
        {
          recommendation: 'Ensure you have a valid robots.txt file at your domain root.',
          evidence: {
            expected: 'A robots.txt file at /robots.txt',
            impact: 'robots.txt tells search engines which pages to crawl. It should also point to your sitemap.xml for efficient discovery of all pages.',
            example: '# Example robots.txt\nUser-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /private/\n\nSitemap: https://example.com/sitemap.xml',
            learnMore: 'https://developers.google.com/search/docs/crawling-indexing/robots/create-robots-txt'
          }
        }
      );
    },
  },

  // ==========================================================================
  // Too Many URL Parameters
  // ==========================================================================
  {
    id: 'url-many-parameters',
    name: 'Too Many URL Parameters',
    category: 'technical',
    severity: 'warning',
    description: 'URLs should not have more than 3 query parameters',
    check: (ctx) => {
      if (!ctx.url) {
        return createResult(
          { id: 'url-many-parameters', name: 'Too Many URL Parameters', category: 'technical', severity: 'warning' },
          'info',
          'Not applicable (URL data unavailable)',
          { recommendation: 'This rule checks for excessive URL parameters' }
        );
      }

      try {
        const url = new URL(ctx.url);
        const paramCount = Array.from(url.searchParams.keys()).length;

        if (paramCount > 3) {
          return createResult(
            { id: 'url-many-parameters', name: 'Too Many URL Parameters', category: 'technical', severity: 'warning' },
            'warn',
            `URL has ${paramCount} query parameters`,
            {
              value: paramCount,
              recommendation: 'Reduce URL parameters to 3 or fewer for better crawlability',
              evidence: {
                found: url.search,
                expected: '3 or fewer parameters',
                impact: 'Multiple parameters make URLs less enticing to click and may cause indexing issues. Search engines may treat parameter variations as duplicate content, wasting crawl budget.',
                learnMore: 'https://developers.google.com/search/docs/crawling-indexing/url-structure#use-simple-urls'
              }
            }
          );
        }
      } catch {
        // Invalid URL
      }

      return createResult(
        { id: 'url-many-parameters', name: 'Too Many URL Parameters', category: 'technical', severity: 'warning' },
        'info',
        'Not applicable (3 or fewer URL parameters)',
        { recommendation: 'URL parameters are within acceptable limits' }
      );
    },
  },

  // ==========================================================================
  // Deprecated Plugins (Flash, Java, Silverlight)
  // ==========================================================================
  {
    id: 'deprecated-plugins',
    name: 'Deprecated Plugins',
    category: 'technical',
    severity: 'error',
    description: 'Pages should not use Flash, Java Applets, or Silverlight',
    check: (ctx) => {
      if (ctx.hasDeprecatedPlugins === undefined) {
        return createResult(
          { id: 'deprecated-plugins', name: 'Deprecated Plugins', category: 'technical', severity: 'error' },
          'info',
          'Not applicable (deprecated plugins data unavailable)',
          { recommendation: 'This rule checks for Flash, Java, and Silverlight usage' }
        );
      }

      if (ctx.hasDeprecatedPlugins) {
        return createResult(
          { id: 'deprecated-plugins', name: 'Deprecated Plugins', category: 'technical', severity: 'error' },
          'fail',
          'Page uses deprecated plugins (Flash, Java, or Silverlight)',
          {
            recommendation: 'Convert plugin content to HTML5',
            evidence: {
              found: ctx.deprecatedPluginTypes?.join(', ') || 'Flash/Java/Silverlight detected',
              expected: 'No deprecated plugins',
              impact: 'These plugins do not work on mobile devices and cannot be crawled properly',
              learnMore: 'https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing'
            }
          }
        );
      }

      return createResult(
        { id: 'deprecated-plugins', name: 'Deprecated Plugins', category: 'technical', severity: 'error' },
        'info',
        'Not applicable (no deprecated plugins detected)',
        { recommendation: 'No Flash, Java, or Silverlight plugins found' }
      );
    },
  },

  // ==========================================================================
  // Frame Tags
  // ==========================================================================
  {
    id: 'frame-tags',
    name: 'Frame Tags',
    category: 'technical',
    severity: 'error',
    description: 'Pages should not use <frame> or <frameset> tags',
    check: (ctx) => {
      if (ctx.hasFrameTags === undefined) {
        return createResult(
          { id: 'frame-tags', name: 'Frame Tags', category: 'technical', severity: 'error' },
          'info',
          'Not applicable (frame tags data unavailable)',
          { recommendation: 'This rule checks for obsolete <frame> and <frameset> tags' }
        );
      }

      if (ctx.hasFrameTags) {
        return createResult(
          { id: 'frame-tags', name: 'Frame Tags', category: 'technical', severity: 'error' },
          'fail',
          'Page uses <frame> or <frameset> tags',
          {
            recommendation: 'Remove frame tags and restructure using modern HTML',
            evidence: {
              found: '<frame> or <frameset> tags detected',
              expected: 'No frame tags',
              impact: 'Frames are obsolete HTML. Search engines have difficulty indexing content within frames. Mobile devices don\'t support them well. Use modern CSS layouts instead.',
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/frame'
            }
          }
        );
      }

      return createResult(
        { id: 'frame-tags', name: 'Frame Tags', category: 'technical', severity: 'error' },
        'info',
        'Not applicable (no frame tags detected)',
        { recommendation: 'No obsolete frame tags found' }
      );
    },
  },
  {
    id: 'avoid-iframes',
    name: 'Avoid iFrames',
    category: 'technical',
    severity: 'info',
    description: 'iFrames can cause SEO and usability issues.',
    check: (ctx) => {
      if (ctx.iframeCount && ctx.iframeCount > 0) {
        return createResult(
          { id: 'avoid-iframes', name: 'iFrames Usage', category: 'technical', severity: 'info' },
          'info',
          `${ctx.iframeCount} iFrame(s) detected`,
          {
            value: ctx.iframeCount,
            recommendation: 'Avoid iFrames for main content. They can be hard to index and navigate.',
            evidence: {
              found: `${ctx.iframeCount} iframes`,
              expected: 'Minimal iframe usage, only for embeds (videos, maps)',
              impact: 'Content inside iframes is treated as separate pages and may not contribute to the parent page\'s SEO. Iframes can also slow page load and cause layout shifts.',
              example: 'Acceptable: <iframe src="https://www.youtube.com/embed/..." loading="lazy">\nAvoid: Main content inside iframes',
              learnMore: 'https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing#iframes'
            }
          }
        );
            }

            return createResult(
        { id: 'avoid-iframes', name: 'Avoid iFrames', category: 'technical', severity: 'info' },
        'info',
        'Not applicable (no iframes detected)',
        { recommendation: 'No iframes found on this page' }
      );
          },
        },
        {
          id: 'deprecated-html-tags',
          name: 'Deprecated HTML Tags',
          category: 'technical',
          severity: 'warning',
          description: 'Avoid deprecated HTML tags like <center>, <font>, <marquee>',
          check: (ctx) => {
            if (ctx.deprecatedTagsCount && ctx.deprecatedTagsCount > 0) {
              return createResult(
                { id: 'deprecated-html-tags', name: 'Deprecated HTML Tags', category: 'technical', severity: 'warning' },
                'warn',
                `${ctx.deprecatedTagsCount} deprecated HTML tags found`,
                {
                  value: ctx.deprecatedTagsCount,
                  recommendation: 'Replace deprecated tags (center, font, marquee, etc.) with CSS.',
                  evidence: {
                    found: ctx.deprecatedTagsFound?.join(', '),
                    expected: 'Modern HTML5 elements with CSS styling',
                    impact: 'Deprecated tags like <center>, <font>, and <marquee> are obsolete. They indicate outdated code that may not render correctly in all browsers.',
                    example: 'Instead of <center>text</center>, use <div style="text-align: center">text</div>\nInstead of <font color="red">, use <span style="color: red">',
                    learnMore: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element#obsolete_and_deprecated_elements'
                  }
                }
              );
            }
            return createResult(
        { id: 'deprecated-html-tags', name: 'Deprecated HTML Tags', category: 'technical', severity: 'warning' },
        'info',
        'Not applicable (no deprecated tags detected)',
        { recommendation: 'No obsolete HTML tags found' }
      );
          },
        },
        {
          id: 'apple-touch-icon',
          name: 'Apple Touch Icon',
          category: 'technical',
          severity: 'info',
          description: 'Add an apple-touch-icon for iOS devices',
          check: (ctx) => {
            if (ctx.hasAppleTouchIcon === false) {
              return createResult(
                { id: 'apple-touch-icon', name: 'Apple Touch Icon', category: 'technical', severity: 'info' },
                'info',
                'Missing apple-touch-icon',
                {
                  recommendation: 'Add an Apple Touch Icon for iOS devices.',
                  evidence: {
                    found: 'No apple-touch-icon link tag',
                    expected: '<link rel="apple-touch-icon"> pointing to a 180x180 PNG',
                    impact: 'Apple Touch Icons appear when users add your site to their iOS home screen. Without one, iOS will use a screenshot of your page, which often looks poor.',
                    example: '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
                    learnMore: 'https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html'
                  }
                }
              );
            }
            return createResult(
              { id: 'apple-touch-icon', name: 'Apple Touch Icon', category: 'technical', severity: 'info' },
              'pass',
              'Apple Touch Icon present'
            );
          },
        },
      ];

/**
 * Humans.txt rules - for checking human-readable site information
 * Note: These rules are informational and checked at spider/site level
 */
export const humansTxtRules: SeoRule[] = [
  {
    id: 'humans-txt-hint',
    name: 'Humans.txt',
    category: 'technical',
    severity: 'info',
    description: 'humans.txt provides information about the team behind the website',
    check: (_ctx) => {
      // This is a hint - actual validation happens at spider level
      return createResult(
        { id: 'humans-txt-hint', name: 'Humans.txt', category: 'technical', severity: 'info' },
        'info',
        'humans.txt should exist at /humans.txt',
        {
          recommendation: 'Create a humans.txt file to credit your team and provide contact information.',
          evidence: {
            expected: 'A humans.txt file at /humans.txt',
            impact: 'humans.txt is a standard way to credit the people behind a website. It helps with transparency, trust, and can improve E-E-A-T signals for search engines.',
            example: `/* TEAM */
Creator: John Doe
Contact: john@example.com
Twitter: @johndoe

/* SITE */
Last update: 2025/01/15
Language: English
Standards: HTML5, CSS3
Components: React, Node.js`,
            learnMore: 'https://humanstxt.org/'
          }
        }
      );
    },
  },
];

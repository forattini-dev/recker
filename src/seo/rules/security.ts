/**
 * SEO Security Rules
 * Comprehensive security header and trust/safety checks
 */

import { SeoRule, createResult } from './types.js';

export const securityRules: SeoRule[] = [
  // ==========================================================================
  // HTTPS
  // ==========================================================================
  {
    id: 'https-required',
    name: 'HTTPS',
    category: 'security',
    severity: 'error',
    description: 'Page must be served over HTTPS',
    check: (ctx) => {
      if (ctx.isHttps === false) {
        return createResult(
          { id: 'https-required', name: 'HTTPS', category: 'security', severity: 'error' },
          'fail',
          'Page is not served over HTTPS',
          {
            recommendation: 'Enable HTTPS for all pages',
            evidence: {
              found: 'HTTP',
              expected: 'HTTPS',
              impact: 'Browsers show "Not Secure" warning, affects SEO ranking',
              learnMore: 'https://web.dev/why-https-matters/',
            },
          }
        );
      }
      if (ctx.isHttps === true) {
        return createResult(
          { id: 'https-required', name: 'HTTPS', category: 'security', severity: 'error' },
          'pass',
          'Page is served over HTTPS'
        );
      }
      return createResult(
        { id: 'https-required', name: 'HTTPS', category: 'security', severity: 'error' },
        'info',
        'Not applicable (HTTPS status unavailable)',
        { recommendation: 'This rule checks if the page is served over HTTPS when protocol information is available' }
      );
    },
  },
  {
    id: 'mixed-content',
    name: 'Mixed Content',
    category: 'security',
    severity: 'error',
    description: 'HTTPS pages should not load HTTP resources',
    check: (ctx) => {
      if (ctx.hasMixedContent) {
        return createResult(
          { id: 'mixed-content', name: 'Mixed Content', category: 'security', severity: 'error' },
          'fail',
          'Page has mixed content (HTTP resources on HTTPS page)',
          {
            recommendation: 'Update all resources to use HTTPS',
            evidence: {
              found: 'Mixed content detected',
              expected: 'All resources over HTTPS',
              impact: 'Browsers may block HTTP resources, breaking functionality',
              learnMore: 'https://web.dev/what-is-mixed-content/',
            },
          }
        );
      }
      return createResult(
        { id: 'mixed-content', name: 'Mixed Content', category: 'security', severity: 'error' },
        'info',
        'Not applicable (no mixed content detected or HTTPS not used)',
        { recommendation: 'This rule checks for HTTP resources on HTTPS pages when mixed content is detected' }
      );
    },
  },
  {
    id: 'http-redirect',
    name: 'HTTP to HTTPS Redirect',
    category: 'security',
    severity: 'warning',
    description: 'HTTP traffic should redirect to HTTPS',
    check: (ctx) => {
      if (ctx.httpRedirectsToHttps === undefined) {
        return createResult(
          { id: 'http-redirect', name: 'HTTP to HTTPS Redirect', category: 'security', severity: 'warning' },
          'info',
          'Not applicable (HTTP redirect status unavailable)',
          { recommendation: 'This rule checks if HTTP traffic redirects to HTTPS when redirect information is available' }
        );
      }
      if (!ctx.httpRedirectsToHttps) {
        return createResult(
          { id: 'http-redirect', name: 'HTTP to HTTPS Redirect', category: 'security', severity: 'warning' },
          'warn',
          'HTTP does not redirect to HTTPS',
          {
            recommendation: 'Configure server to redirect all HTTP traffic to HTTPS',
            evidence: {
              expected: '301/302 redirect from HTTP to HTTPS',
              impact: 'Users accessing via HTTP may stay on insecure connection',
              learnMore: 'https://web.dev/redirect-http-to-https/',
            },
          }
        );
      }
      return createResult(
        { id: 'http-redirect', name: 'HTTP to HTTPS Redirect', category: 'security', severity: 'warning' },
        'pass',
        'HTTP redirects to HTTPS'
      );
    },
  },
  {
    id: 'internal-links-https',
    name: 'Internal Links Use HTTPS',
    category: 'security',
    severity: 'warning',
    description: 'Internal links should use HTTPS to avoid mixed content and redirect chains',
    check: (ctx) => {
      if (ctx.internalHttpLinks === undefined) {
        return createResult(
          { id: 'internal-links-https', name: 'Internal Links Use HTTPS', category: 'security', severity: 'warning' },
          'info',
          'Not applicable (internal link data unavailable)',
          { recommendation: 'This rule checks internal links for HTTPS usage when link analysis is available' }
        );
      }

      if (ctx.internalHttpLinks > 0) {
        const examples = ctx.internalHttpLinkUrls?.slice(0, 3) || [];
        return createResult(
          { id: 'internal-links-https', name: 'Internal Links Use HTTPS', category: 'security', severity: 'warning' },
          'warn',
          `${ctx.internalHttpLinks} internal link(s) use HTTP instead of HTTPS`,
          {
            value: ctx.internalHttpLinks,
            recommendation: 'Update all internal links to use HTTPS URLs',
            evidence: {
              found: `${ctx.internalHttpLinks} HTTP internal links${examples.length > 0 ? `: ${examples.join(', ')}` : ''}`,
              expected: 'All internal links should use HTTPS',
              impact: 'HTTP links cause unnecessary redirects, slow page loads, and may trigger mixed content warnings. Search engines prefer sites with consistent HTTPS usage.',
              learnMore: 'https://web.dev/why-https-matters/',
            },
          }
        );
      }

      return createResult(
        { id: 'internal-links-https', name: 'Internal Links Use HTTPS', category: 'security', severity: 'warning' },
        'pass',
        'All internal links use HTTPS'
      );
    },
  },

  // ==========================================================================
  // Content Security Policy
  // ==========================================================================
  {
    id: 'security-csp-exists',
    name: 'Content Security Policy (CSP)',
    category: 'security',
    severity: 'warning',
    description: 'Content Security Policy header should be present to mitigate XSS attacks.',
    check: (ctx) => {
      if (!ctx.responseHeaders) {
        return createResult(
          { id: 'security-csp-exists', name: 'Content Security Policy', category: 'security', severity: 'warning' },
          'info',
          'Not applicable (response headers unavailable)',
          { recommendation: 'This rule checks for CSP headers when HTTP response headers are available' }
        );
      }
      const cspHeader = ctx.responseHeaders['content-security-policy'] || ctx.responseHeaders['Content-Security-Policy'];
      if (!cspHeader) {
        return createResult(
          { id: 'security-csp-exists', name: 'Content Security Policy', category: 'security', severity: 'warning' },
          'warn',
          'Content-Security-Policy header is missing',
          {
            recommendation: 'Implement a strong Content-Security-Policy to prevent XSS attacks',
            evidence: {
              expected: 'Content-Security-Policy header',
              impact: 'Page is vulnerable to XSS and data injection attacks',
              learnMore: 'https://web.dev/csp/',
            },
          }
        );
      }
      return createResult(
        { id: 'security-csp-exists', name: 'Content Security Policy', category: 'security', severity: 'warning' },
        'pass',
        'Content-Security-Policy header is present',
      );
    },
  },
  {
    id: 'security-csp-xss-effective',
    name: 'CSP XSS Effectiveness',
    category: 'security',
    severity: 'warning',
    description: 'CSP should be effective against XSS attacks',
    check: (ctx) => {
      if (!ctx.responseHeaders) {
        return createResult(
          { id: 'security-csp-xss-effective', name: 'CSP XSS Effectiveness', category: 'security', severity: 'warning' },
          'info',
          'Not applicable (response headers unavailable)',
          { recommendation: 'This rule checks CSP effectiveness when HTTP response headers are available' }
        );
      }
      const cspHeader = ctx.responseHeaders['content-security-policy'] || ctx.responseHeaders['Content-Security-Policy'];
      if (!cspHeader) {
        return createResult(
          { id: 'security-csp-xss-effective', name: 'CSP XSS Effectiveness', category: 'security', severity: 'warning' },
          'info',
          'Not applicable (CSP header not present)',
          { recommendation: 'This rule checks CSP effectiveness when a Content-Security-Policy header exists' }
        );
      }

      const csp = String(cspHeader).toLowerCase();
      const weaknesses: string[] = [];

      // Check for unsafe-inline
      if (csp.includes("'unsafe-inline'") && !csp.includes("'strict-dynamic'") && !csp.includes("'nonce-")) {
        weaknesses.push("unsafe-inline without nonce/strict-dynamic");
      }

      // Check for unsafe-eval
      if (csp.includes("'unsafe-eval'")) {
        weaknesses.push("unsafe-eval allows code execution");
      }

      // Check for data: URIs in script-src
      if (csp.includes('data:') && (csp.includes('script-src') || !csp.includes('default-src'))) {
        weaknesses.push("data: URIs can be exploited for XSS");
      }

      // Check for wildcard in script-src
      if (csp.match(/script-src[^;]*\*/)) {
        weaknesses.push("Wildcard in script-src");
      }

      if (weaknesses.length > 0) {
        return createResult(
          { id: 'security-csp-xss-effective', name: 'CSP XSS Effectiveness', category: 'security', severity: 'warning' },
          'warn',
          `CSP may not be effective against XSS: ${weaknesses.join(', ')}`,
          {
            recommendation: 'Use nonce-based CSP or strict-dynamic for better XSS protection',
            evidence: {
              found: weaknesses,
              expected: 'No unsafe-inline, unsafe-eval, or wildcards',
              impact: 'Attackers may be able to execute malicious scripts',
              learnMore: 'https://web.dev/strict-csp/',
            },
          }
        );
      }

      return createResult(
        { id: 'security-csp-xss-effective', name: 'CSP XSS Effectiveness', category: 'security', severity: 'warning' },
        'pass',
        'CSP appears effective against XSS attacks'
      );
    },
  },
  {
    id: 'security-csp-directives',
    name: 'CSP Required Directives',
    category: 'security',
    severity: 'error',
    description: 'CSP should have script-src and object-src directives to prevent unsafe script execution',
    check: (ctx) => {
      if (!ctx.responseHeaders) {
        return createResult(
          { id: 'security-csp-directives', name: 'CSP Required Directives', category: 'security', severity: 'error' },
          'info',
          'Not applicable (response headers unavailable)',
          { recommendation: 'This rule checks CSP directives when HTTP response headers are available' }
        );
      }
      const cspHeader = ctx.responseHeaders['content-security-policy'] || ctx.responseHeaders['Content-Security-Policy'];
      if (!cspHeader) {
        return createResult(
          { id: 'security-csp-directives', name: 'CSP Required Directives', category: 'security', severity: 'error' },
          'info',
          'Not applicable (CSP header not present)',
          { recommendation: 'This rule checks CSP directives when a Content-Security-Policy header exists' }
        );
      }

      const csp = String(cspHeader).toLowerCase();
      const missingDirectives: { directive: string; severity: string; impact: string }[] = [];

      // Check for script-src (High severity)
      if (!csp.includes('script-src') && !csp.includes('default-src')) {
        missingDirectives.push({
          directive: 'script-src',
          severity: 'High',
          impact: 'Allows execution of unsafe scripts from any source',
        });
      }

      // Check for object-src (High severity)
      if (!csp.includes('object-src') && !csp.includes('default-src')) {
        missingDirectives.push({
          directive: 'object-src',
          severity: 'High',
          impact: 'Allows injection of plugins that execute unsafe scripts',
        });
      }

      // Check for base-uri (Medium severity)
      if (!csp.includes('base-uri')) {
        missingDirectives.push({
          directive: 'base-uri',
          severity: 'Medium',
          impact: 'Allows attackers to change the base URL for relative links',
        });
      }

      if (missingDirectives.length > 0) {
        const highSeverity = missingDirectives.filter((d) => d.severity === 'High');
        if (highSeverity.length > 0) {
          return createResult(
            { id: 'security-csp-directives', name: 'CSP Required Directives', category: 'security', severity: 'error' },
            'fail',
            `Missing critical CSP directives: ${highSeverity.map((d) => d.directive).join(', ')}`,
            {
              recommendation: "Add script-src and object-src directives. Consider setting object-src to 'none' if plugins are not needed.",
              evidence: {
                found: missingDirectives.map((d) => `${d.directive} (${d.severity}): ${d.impact}`),
                expected: "script-src 'self'; object-src 'none'; base-uri 'self'",
                impact: 'Page is vulnerable to script injection attacks',
                learnMore: 'https://web.dev/csp/',
              },
            }
          );
        }
        return createResult(
          { id: 'security-csp-directives', name: 'CSP Required Directives', category: 'security', severity: 'error' },
          'warn',
          `Missing recommended CSP directives: ${missingDirectives.map((d) => d.directive).join(', ')}`,
          {
            recommendation: 'Add base-uri directive to prevent base tag hijacking',
            evidence: {
              found: missingDirectives.map((d) => `${d.directive}: ${d.impact}`),
              expected: "base-uri 'self'",
            },
          }
        );
      }

      return createResult(
        { id: 'security-csp-directives', name: 'CSP Required Directives', category: 'security', severity: 'error' },
        'pass',
        'CSP has required script-src and object-src directives'
      );
    },
  },

  // ==========================================================================
  // HSTS
  // ==========================================================================
  {
    id: 'security-hsts-exists',
    name: 'Strict-Transport-Security (HSTS)',
    category: 'security',
    severity: 'warning',
    description: 'HSTS header forces secure connections and improves SEO indirectly.',
    check: (ctx) => {
      if (!ctx.responseHeaders) {
        return createResult(
          { id: 'security-hsts-exists', name: 'HSTS Header', category: 'security', severity: 'warning' },
          'info',
          'Not applicable (response headers unavailable)',
          { recommendation: 'This rule checks for HSTS headers when HTTP response headers are available' }
        );
      }
      const hstsHeader = ctx.responseHeaders['strict-transport-security'] || ctx.responseHeaders['Strict-Transport-Security'];
      if (!hstsHeader) {
        return createResult(
          { id: 'security-hsts-exists', name: 'HSTS Header', category: 'security', severity: 'warning' },
          'warn',
          'Strict-Transport-Security header is missing',
          {
            recommendation: 'Implement HSTS to force secure connections',
            evidence: {
              expected: 'Strict-Transport-Security header',
              impact: 'Users may connect over insecure HTTP on first visit',
              learnMore: 'https://web.dev/security-headers/#hsts',
            },
          }
        );
      }
      return createResult(
        { id: 'security-hsts-exists', name: 'HSTS Header', category: 'security', severity: 'warning' },
        'pass',
        `Strict-Transport-Security header is present: ${hstsHeader}`,
      );
    },
  },
  {
    id: 'security-hsts-strong',
    name: 'Strong HSTS Policy',
    category: 'security',
    severity: 'info',
    description: 'HSTS should have a strong policy with long max-age and includeSubDomains',
    check: (ctx) => {
      if (!ctx.responseHeaders) {
        return createResult(
          { id: 'security-hsts-strong', name: 'Strong HSTS Policy', category: 'security', severity: 'info' },
          'info',
          'Not applicable (response headers unavailable)',
          { recommendation: 'This rule checks HSTS policy strength when HTTP response headers are available' }
        );
      }
      const hstsHeader = ctx.responseHeaders['strict-transport-security'] || ctx.responseHeaders['Strict-Transport-Security'];
      if (!hstsHeader) {
        return createResult(
          { id: 'security-hsts-strong', name: 'Strong HSTS Policy', category: 'security', severity: 'info' },
          'info',
          'Not applicable (HSTS header not present)',
          { recommendation: 'This rule checks HSTS policy strength when a Strict-Transport-Security header exists' }
        );
      }

      const hsts = String(hstsHeader).toLowerCase();
      const weaknesses: string[] = [];

      // Check max-age
      const maxAgeMatch = hsts.match(/max-age\s*=\s*(\d+)/);
      const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
      const oneYear = 31536000;
      if (maxAge < oneYear) {
        weaknesses.push(`max-age is ${maxAge}s (recommended: ${oneYear}s / 1 year)`);
      }

      // Check includeSubDomains
      if (!hsts.includes('includesubdomains')) {
        weaknesses.push('Missing includeSubDomains');
      }

      // Check preload
      if (!hsts.includes('preload')) {
        weaknesses.push('Missing preload (optional but recommended)');
      }

      if (weaknesses.length > 0) {
        return createResult(
          { id: 'security-hsts-strong', name: 'Strong HSTS Policy', category: 'security', severity: 'info' },
          'info',
          `HSTS policy could be stronger: ${weaknesses.join('; ')}`,
          {
            recommendation: 'Use max-age=31536000; includeSubDomains; preload',
            evidence: {
              found: hstsHeader,
              expected: 'max-age=31536000; includeSubDomains; preload',
              learnMore: 'https://hstspreload.org/',
            },
          }
        );
      }

      return createResult(
        { id: 'security-hsts-strong', name: 'Strong HSTS Policy', category: 'security', severity: 'info' },
        'pass',
        'Strong HSTS policy with long max-age and includeSubDomains'
      );
    },
  },

  // ==========================================================================
  // Cross-Origin Isolation
  // ==========================================================================
  {
    id: 'security-coop',
    name: 'Cross-Origin-Opener-Policy (COOP)',
    category: 'security',
    severity: 'info',
    description: 'COOP ensures proper origin isolation for security',
    check: (ctx) => {
      if (!ctx.responseHeaders) {
        return createResult(
          { id: 'security-coop', name: 'Cross-Origin-Opener-Policy', category: 'security', severity: 'info' },
          'info',
          'Not applicable (response headers unavailable)',
          { recommendation: 'This rule checks for COOP headers when HTTP response headers are available' }
        );
      }
      const coopHeader = ctx.responseHeaders['cross-origin-opener-policy'] || ctx.responseHeaders['Cross-Origin-Opener-Policy'];
      if (!coopHeader) {
        return createResult(
          { id: 'security-coop', name: 'Cross-Origin-Opener-Policy', category: 'security', severity: 'info' },
          'info',
          'Cross-Origin-Opener-Policy header is missing',
          {
            recommendation: 'Add COOP header to isolate your origin from attackers',
            evidence: {
              expected: 'Cross-Origin-Opener-Policy: same-origin',
              impact: 'Lack of origin isolation may enable cross-origin attacks',
              learnMore: 'https://web.dev/coop-coep/',
            },
          }
        );
      }

      const coop = String(coopHeader).toLowerCase();
      if (coop === 'same-origin') {
        return createResult(
          { id: 'security-coop', name: 'Cross-Origin-Opener-Policy', category: 'security', severity: 'info' },
          'pass',
          'COOP: same-origin (full isolation)'
        );
      }
      if (coop === 'same-origin-allow-popups') {
        return createResult(
          { id: 'security-coop', name: 'Cross-Origin-Opener-Policy', category: 'security', severity: 'info' },
          'pass',
          'COOP: same-origin-allow-popups'
        );
      }

      const coopValue = Array.isArray(coopHeader) ? coopHeader.join(', ') : String(coopHeader);
      return createResult(
        { id: 'security-coop', name: 'Cross-Origin-Opener-Policy', category: 'security', severity: 'info' },
        'info',
        `COOP: ${coopValue}`,
        { value: coopValue }
      );
    },
  },
  {
    id: 'security-coep',
    name: 'Cross-Origin-Embedder-Policy (COEP)',
    category: 'security',
    severity: 'info',
    description: 'COEP prevents loading cross-origin resources without explicit permission',
    check: (ctx) => {
      if (!ctx.responseHeaders) {
        return createResult(
          { id: 'security-coep', name: 'Cross-Origin-Embedder-Policy', category: 'security', severity: 'info' },
          'info',
          'Not applicable (response headers unavailable)',
          { recommendation: 'This rule checks for COEP headers when HTTP response headers are available' }
        );
      }
      const coepHeader = ctx.responseHeaders['cross-origin-embedder-policy'] || ctx.responseHeaders['Cross-Origin-Embedder-Policy'];
      if (!coepHeader) {
        return createResult(
          { id: 'security-coep', name: 'Cross-Origin-Embedder-Policy', category: 'security', severity: 'info' },
          'info',
          'Cross-Origin-Embedder-Policy header is missing',
          {
            recommendation: 'Add COEP header for cross-origin isolation',
            evidence: {
              expected: 'Cross-Origin-Embedder-Policy: require-corp',
              impact: 'Required for SharedArrayBuffer and high-resolution timers',
              learnMore: 'https://web.dev/coop-coep/',
            },
          }
        );
      }
      return createResult(
        { id: 'security-coep', name: 'Cross-Origin-Embedder-Policy', category: 'security', severity: 'info' },
        'pass',
        `COEP: ${coepHeader}`
      );
    },
  },

  // ==========================================================================
  // Trusted Types
  // ==========================================================================
  {
    id: 'security-trusted-types',
    name: 'Trusted Types',
    category: 'security',
    severity: 'info',
    description: 'Trusted Types help prevent DOM-based XSS attacks',
    check: (ctx) => {
      if (!ctx.responseHeaders) {
        return createResult(
          { id: 'security-trusted-types', name: 'Trusted Types', category: 'security', severity: 'info' },
          'info',
          'Not applicable (response headers unavailable)',
          { recommendation: 'This rule checks for Trusted Types in CSP when HTTP response headers are available' }
        );
      }
      const cspHeader = ctx.responseHeaders['content-security-policy'] || ctx.responseHeaders['Content-Security-Policy'];
      if (!cspHeader) {
        return createResult(
          { id: 'security-trusted-types', name: 'Trusted Types', category: 'security', severity: 'info' },
          'info',
          'Not applicable (CSP header not present)',
          { recommendation: 'This rule checks for Trusted Types when a Content-Security-Policy header exists' }
        );
      }

      const csp = String(cspHeader).toLowerCase();
      if (csp.includes('require-trusted-types-for')) {
        return createResult(
          { id: 'security-trusted-types', name: 'Trusted Types', category: 'security', severity: 'info' },
          'pass',
          'Trusted Types policy enabled via CSP'
        );
      }

      return createResult(
        { id: 'security-trusted-types', name: 'Trusted Types', category: 'security', severity: 'info' },
        'info',
        'Trusted Types not enabled',
        {
          recommendation: 'Add require-trusted-types-for to CSP for DOM XSS protection',
          evidence: {
            expected: "Content-Security-Policy: require-trusted-types-for 'script'",
            impact: 'DOM manipulation may be vulnerable to XSS attacks',
            learnMore: 'https://web.dev/trusted-types/',
          },
        }
      );
    },
  },

  // ==========================================================================
  // Clickjacking Protection
  // ==========================================================================
  {
    id: 'security-xfo-exists',
    name: 'X-Frame-Options',
    category: 'security',
    severity: 'warning',
    description: 'X-Frame-Options header should be present to prevent clickjacking.',
    check: (ctx) => {
      if (!ctx.responseHeaders) {
        return createResult(
          { id: 'security-xfo-exists', name: 'X-Frame-Options', category: 'security', severity: 'warning' },
          'info',
          'Not applicable (response headers unavailable)',
          { recommendation: 'This rule checks for X-Frame-Options headers when HTTP response headers are available' }
        );
      }
      const xfoHeader = ctx.responseHeaders['x-frame-options'] || ctx.responseHeaders['X-Frame-Options'];
      if (!xfoHeader) {
        return createResult(
          { id: 'security-xfo-exists', name: 'X-Frame-Options', category: 'security', severity: 'warning' },
          'warn',
          'X-Frame-Options header is missing',
          {
            recommendation: 'Implement X-Frame-Options to prevent clickjacking attacks',
            evidence: {
              expected: 'X-Frame-Options: DENY or SAMEORIGIN',
              impact: 'Page can be embedded in malicious iframes for clickjacking',
              learnMore: 'https://web.dev/security-headers/#xfo',
            },
          }
        );
      }
      return createResult(
        { id: 'security-xfo-exists', name: 'X-Frame-Options', category: 'security', severity: 'warning' },
        'pass',
        `X-Frame-Options header is present: ${xfoHeader}`,
      );
    },
  },
  {
    id: 'security-frame-ancestors',
    name: 'CSP frame-ancestors',
    category: 'security',
    severity: 'info',
    description: 'CSP frame-ancestors is the modern replacement for X-Frame-Options',
    check: (ctx) => {
      if (!ctx.responseHeaders) {
        return createResult(
          { id: 'security-frame-ancestors', name: 'CSP frame-ancestors', category: 'security', severity: 'info' },
          'info',
          'Not applicable (response headers unavailable)',
          { recommendation: 'This rule checks for CSP frame-ancestors when HTTP response headers are available' }
        );
      }
      const cspHeader = ctx.responseHeaders['content-security-policy'] || ctx.responseHeaders['Content-Security-Policy'];
      const xfoHeader = ctx.responseHeaders['x-frame-options'] || ctx.responseHeaders['X-Frame-Options'];

      if (!cspHeader && !xfoHeader) {
        return createResult(
          { id: 'security-frame-ancestors', name: 'CSP frame-ancestors', category: 'security', severity: 'info' },
          'info',
          'Not applicable (neither CSP nor X-Frame-Options present)',
          { recommendation: 'This rule checks CSP frame-ancestors when clickjacking protection headers are present' }
        );
      }

      if (cspHeader && String(cspHeader).toLowerCase().includes('frame-ancestors')) {
        return createResult(
          { id: 'security-frame-ancestors', name: 'CSP frame-ancestors', category: 'security', severity: 'info' },
          'pass',
          'CSP frame-ancestors directive present (modern clickjacking protection)'
        );
      }

      if (xfoHeader && !cspHeader) {
        return createResult(
          { id: 'security-frame-ancestors', name: 'CSP frame-ancestors', category: 'security', severity: 'info' },
          'info',
          'Using X-Frame-Options; consider migrating to CSP frame-ancestors',
          {
            recommendation: 'Use CSP frame-ancestors for better control over framing',
            evidence: {
              found: `X-Frame-Options: ${xfoHeader}`,
              expected: "Content-Security-Policy: frame-ancestors 'self'",
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors',
            },
          }
        );
      }

      return createResult(
        { id: 'security-frame-ancestors', name: 'CSP frame-ancestors', category: 'security', severity: 'info' },
        'info',
        'Not applicable (clickjacking protection configured without frame-ancestors)',
        { recommendation: 'This rule checks modern frame-ancestors directive in CSP for enhanced clickjacking protection' }
      );
    },
  },

  // ==========================================================================
  // Other Security Headers
  // ==========================================================================
  {
    id: 'security-cors-config',
    name: 'CORS Configuration',
    category: 'security',
    severity: 'warning',
    description: 'Review Access-Control-Allow-Origin header for proper CORS configuration.',
    check: (ctx) => {
      if (!ctx.responseHeaders) {
        return createResult(
          { id: 'security-cors-config', name: 'CORS Configuration', category: 'security', severity: 'warning' },
          'info',
          'Not applicable (response headers unavailable)',
          { recommendation: 'This rule checks CORS configuration when HTTP response headers are available' }
        );
      }
      const acaoHeader = ctx.responseHeaders['access-control-allow-origin'] || ctx.responseHeaders['Access-Control-Allow-Origin'];
      if (acaoHeader === '*') {
        return createResult(
          { id: 'security-cors-config', name: 'CORS Configuration', category: 'security', severity: 'warning' },
          'warn',
          'Access-Control-Allow-Origin is set to "*"',
          {
            recommendation: 'Avoid wildcard (*) in Access-Control-Allow-Origin for sensitive content',
            evidence: {
              found: '*',
              expected: 'Specific origins only',
              impact: 'Any website can make requests to your API',
            },
          }
        );
      }
      if (!acaoHeader) {
        return createResult(
          { id: 'security-cors-config', name: 'CORS Configuration', category: 'security', severity: 'warning' },
          'info',
          'Access-Control-Allow-Origin header is missing',
          { recommendation: 'Configure CORS if resources are consumed cross-origin' }
        );
      }
      return createResult(
        { id: 'security-cors-config', name: 'CORS Configuration', category: 'security', severity: 'warning' },
        'pass',
        `Access-Control-Allow-Origin: ${acaoHeader}`,
      );
    },
  },
  {
    id: 'security-xcto-exists',
    name: 'X-Content-Type-Options',
    category: 'security',
    severity: 'warning',
    description: 'X-Content-Type-Options header prevents MIME sniffing attacks.',
    check: (ctx) => {
      if (!ctx.responseHeaders) {
        return createResult(
          { id: 'security-xcto-exists', name: 'X-Content-Type-Options', category: 'security', severity: 'warning' },
          'info',
          'Not applicable (response headers unavailable)',
          { recommendation: 'This rule checks for X-Content-Type-Options headers when HTTP response headers are available' }
        );
      }
      const xctoHeader = ctx.responseHeaders['x-content-type-options'] || ctx.responseHeaders['X-Content-Type-Options'];
      if (!xctoHeader) {
        return createResult(
          { id: 'security-xcto-exists', name: 'X-Content-Type-Options', category: 'security', severity: 'warning' },
          'warn',
          'X-Content-Type-Options header is missing',
          {
            recommendation: 'Implement X-Content-Type-Options: nosniff',
            evidence: {
              expected: 'X-Content-Type-Options: nosniff',
              impact: 'Browser may interpret files incorrectly, leading to security issues',
            },
          }
        );
      }
      return createResult(
        { id: 'security-xcto-exists', name: 'X-Content-Type-Options', category: 'security', severity: 'warning' },
        'pass',
        `X-Content-Type-Options: ${xctoHeader}`,
      );
    },
  },
  {
    id: 'security-rp-exists',
    name: 'Referrer-Policy',
    category: 'security',
    severity: 'info',
    description: 'Referrer-Policy controls how much referrer information is sent with requests.',
    check: (ctx) => {
      if (!ctx.responseHeaders) {
        return createResult(
          { id: 'security-rp-exists', name: 'Referrer-Policy', category: 'security', severity: 'info' },
          'info',
          'Not applicable (response headers unavailable)',
          { recommendation: 'This rule checks for Referrer-Policy headers when HTTP response headers are available' }
        );
      }
      const rpHeader = ctx.responseHeaders['referrer-policy'] || ctx.responseHeaders['Referrer-Policy'];
      if (!rpHeader) {
        return createResult(
          { id: 'security-rp-exists', name: 'Referrer-Policy', category: 'security', severity: 'info' },
          'info',
          'Referrer-Policy header is missing',
          {
            recommendation: 'Implement Referrer-Policy for privacy (e.g., strict-origin-when-cross-origin)',
            evidence: {
              expected: 'Referrer-Policy: strict-origin-when-cross-origin',
              impact: 'Full URLs may leak in referrer headers',
            },
          }
        );
      }
      return createResult(
        { id: 'security-rp-exists', name: 'Referrer-Policy', category: 'security', severity: 'info' },
        'pass',
        `Referrer-Policy: ${rpHeader}`,
      );
    },
  },
  {
    id: 'security-pp-exists',
    name: 'Permissions-Policy',
    category: 'security',
    severity: 'info',
    description: 'Permissions-Policy controls browser features available to the page.',
    check: (ctx) => {
      if (!ctx.responseHeaders) {
        return createResult(
          { id: 'security-pp-exists', name: 'Permissions-Policy', category: 'security', severity: 'info' },
          'info',
          'Not applicable (response headers unavailable)',
          { recommendation: 'This rule checks for Permissions-Policy headers when HTTP response headers are available' }
        );
      }
      const ppHeader = ctx.responseHeaders['permissions-policy'] || ctx.responseHeaders['Permissions-Policy'];
      if (!ppHeader) {
        return createResult(
          { id: 'security-pp-exists', name: 'Permissions-Policy', category: 'security', severity: 'info' },
          'info',
          'Permissions-Policy header is missing',
          {
            recommendation: 'Disable unused browser features (e.g., camera=(), microphone=())',
            evidence: {
              expected: 'Permissions-Policy header',
              impact: 'Third-party code may access browser features unnecessarily',
            },
          }
        );
      }
      return createResult(
        { id: 'security-pp-exists', name: 'Permissions-Policy', category: 'security', severity: 'info' },
        'pass',
        'Permissions-Policy header is present',
      );
    },
  },
  {
    id: 'security-xxss',
    name: 'X-XSS-Protection',
    category: 'security',
    severity: 'info',
    description: 'X-XSS-Protection is deprecated but may still provide protection in older browsers',
    check: (ctx) => {
      if (!ctx.responseHeaders) {
        return createResult(
          { id: 'security-xxss', name: 'X-XSS-Protection', category: 'security', severity: 'info' },
          'info',
          'Not applicable (response headers unavailable)',
          { recommendation: 'This rule checks for deprecated X-XSS-Protection headers when HTTP response headers are available' }
        );
      }
      const xxssHeader = ctx.responseHeaders['x-xss-protection'] || ctx.responseHeaders['X-XSS-Protection'];
      if (xxssHeader && String(xxssHeader).includes('1')) {
        return createResult(
          { id: 'security-xxss', name: 'X-XSS-Protection', category: 'security', severity: 'info' },
          'info',
          'X-XSS-Protection is enabled but deprecated',
          {
            recommendation: 'Use Content-Security-Policy instead; X-XSS-Protection can be disabled',
            evidence: {
              found: xxssHeader,
              expected: 'CSP for XSS protection',
              impact: 'X-XSS-Protection can introduce vulnerabilities in some cases',
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-XSS-Protection',
            },
          }
        );
      }
      return createResult(
        { id: 'security-xxss', name: 'X-XSS-Protection', category: 'security', severity: 'info' },
        'info',
        'Not applicable (X-XSS-Protection not present or disabled)',
        { recommendation: 'This rule checks for deprecated X-XSS-Protection headers when present' }
      );
    },
  },

  // ==========================================================================
  // Cross-Origin Resource Policy
  // ==========================================================================
  {
    id: 'security-corp',
    name: 'Cross-Origin-Resource-Policy (CORP)',
    category: 'security',
    severity: 'info',
    description: 'CORP restricts which origins can load your resources',
    check: (ctx) => {
      if (!ctx.responseHeaders) {
        return createResult(
          { id: 'security-corp', name: 'Cross-Origin-Resource-Policy', category: 'security', severity: 'info' },
          'info',
          'Not applicable (response headers unavailable)',
          { recommendation: 'This rule checks for CORP headers when HTTP response headers are available' }
        );
      }
      const corpHeader = ctx.responseHeaders['cross-origin-resource-policy'] || ctx.responseHeaders['Cross-Origin-Resource-Policy'];
      if (!corpHeader) {
        return createResult(
          { id: 'security-corp', name: 'Cross-Origin-Resource-Policy', category: 'security', severity: 'info' },
          'info',
          'Cross-Origin-Resource-Policy header is missing',
          {
            recommendation: 'Consider adding CORP to control resource loading',
            evidence: {
              expected: 'Cross-Origin-Resource-Policy: same-origin or same-site',
              impact: 'Resources may be loaded by any origin',
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Resource-Policy',
            },
          }
        );
      }
      return createResult(
        { id: 'security-corp', name: 'Cross-Origin-Resource-Policy', category: 'security', severity: 'info' },
        'pass',
        `CORP: ${corpHeader}`
      );
    },
  },

  // ==========================================================================
  // SSL/TLS Certificate Checks (Semrush-style)
  // ==========================================================================
  {
    id: 'security-ssl-valid',
    name: 'SSL Certificate Valid',
    category: 'security',
    severity: 'error',
    description: 'SSL certificate must be valid and not expired',
    check: (ctx) => {
      if (ctx.sslCertificate === undefined) {
        return createResult(
          { id: 'security-ssl-valid', name: 'SSL Certificate Valid', category: 'security', severity: 'error' },
          'info',
          'Not applicable (SSL certificate information unavailable)',
          { recommendation: 'This rule checks SSL certificate validity when certificate information is available' }
        );
      }

      if (!ctx.sslCertificate.valid) {
        return createResult(
          { id: 'security-ssl-valid', name: 'SSL Certificate Valid', category: 'security', severity: 'error' },
          'fail',
          'SSL certificate is invalid',
          {
            recommendation: 'Renew or replace the SSL certificate immediately',
            evidence: {
              found: ctx.sslCertificate.error || 'Invalid certificate',
              impact: 'Browsers will show security warnings, users may not trust the site',
            },
          }
        );
      }

      return createResult(
        { id: 'security-ssl-valid', name: 'SSL Certificate Valid', category: 'security', severity: 'error' },
        'pass',
        'SSL certificate is valid'
      );
    },
  },
  {
    id: 'security-ssl-expiry',
    name: 'SSL Certificate Expiry',
    category: 'security',
    severity: 'warning',
    description: 'SSL certificate should not expire within 30 days',
    check: (ctx) => {
      if (!ctx.sslCertificate?.expiryDate) {
        return createResult(
          { id: 'security-ssl-expiry', name: 'SSL Certificate Expiry', category: 'security', severity: 'warning' },
          'info',
          'Not applicable (SSL certificate expiry date unavailable)',
          { recommendation: 'This rule checks SSL certificate expiration when certificate expiry information is available' }
        );
      }

      const expiryDate = new Date(ctx.sslCertificate.expiryDate);
      const now = new Date();
      const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry < 0) {
        return createResult(
          { id: 'security-ssl-expiry', name: 'SSL Certificate Expiry', category: 'security', severity: 'warning' },
          'fail',
          'SSL certificate has expired',
          {
            recommendation: 'Renew the SSL certificate immediately',
            evidence: {
              found: `Expired ${Math.abs(daysUntilExpiry)} days ago`,
              impact: 'Site is showing security warnings to all visitors',
            },
          }
        );
      }

      if (daysUntilExpiry < 7) {
        return createResult(
          { id: 'security-ssl-expiry', name: 'SSL Certificate Expiry', category: 'security', severity: 'warning' },
          'fail',
          `SSL certificate expires in ${daysUntilExpiry} days`,
          {
            recommendation: 'Renew the SSL certificate urgently',
            evidence: {
              found: `Expires: ${expiryDate.toISOString().split('T')[0]}`,
              impact: 'Certificate will expire very soon',
            },
          }
        );
      }

      if (daysUntilExpiry < 30) {
        return createResult(
          { id: 'security-ssl-expiry', name: 'SSL Certificate Expiry', category: 'security', severity: 'warning' },
          'warn',
          `SSL certificate expires in ${daysUntilExpiry} days`,
          {
            recommendation: 'Plan to renew the SSL certificate soon',
            evidence: {
              found: `Expires: ${expiryDate.toISOString().split('T')[0]}`,
            },
          }
        );
      }

      return createResult(
        { id: 'security-ssl-expiry', name: 'SSL Certificate Expiry', category: 'security', severity: 'warning' },
        'pass',
        `SSL certificate valid for ${daysUntilExpiry} days`
      );
    },
  },
  {
    id: 'security-ssl-name-match',
    name: 'SSL Certificate Name Match',
    category: 'security',
    severity: 'error',
    description: 'SSL certificate CN/SAN must match the domain',
    check: (ctx) => {
      if (ctx.sslCertificate?.nameMismatch === undefined) {
        return createResult(
          { id: 'security-ssl-name-match', name: 'SSL Certificate Name Match', category: 'security', severity: 'error' },
          'info',
          'Not applicable (SSL certificate name match information unavailable)',
          { recommendation: 'This rule checks SSL certificate name matching when certificate domain information is available' }
        );
      }

      if (ctx.sslCertificate.nameMismatch) {
        return createResult(
          { id: 'security-ssl-name-match', name: 'SSL Certificate Name Match', category: 'security', severity: 'error' },
          'fail',
          'SSL certificate name mismatch',
          {
            recommendation: 'Get a certificate that matches your domain name',
            evidence: {
              found: ctx.sslCertificate.commonName || 'Unknown',
              expected: ctx.sslCertificate.expectedDomain || 'Domain name',
              impact: 'Browsers will show certificate warning',
            },
          }
        );
      }

      return createResult(
        { id: 'security-ssl-name-match', name: 'SSL Certificate Name Match', category: 'security', severity: 'error' },
        'pass',
        'SSL certificate matches domain'
      );
    },
  },
  {
    id: 'security-tls-version',
    name: 'TLS Version',
    category: 'security',
    severity: 'error',
    description: 'Server should use TLS 1.2 or higher',
    check: (ctx) => {
      if (!ctx.tlsVersion) {
        return createResult(
          { id: 'security-tls-version', name: 'TLS Version', category: 'security', severity: 'error' },
          'info',
          'Not applicable (TLS version information unavailable)',
          { recommendation: 'This rule checks TLS version when TLS connection information is available' }
        );
      }

      const version = ctx.tlsVersion;
      const insecureVersions = ['SSLv2', 'SSLv3', 'TLSv1', 'TLSv1.0', 'TLSv1.1'];

      if (insecureVersions.includes(version)) {
        return createResult(
          { id: 'security-tls-version', name: 'TLS Version', category: 'security', severity: 'error' },
          'fail',
          `Insecure TLS version: ${version}`,
          {
            recommendation: 'Upgrade to TLS 1.2 or TLS 1.3',
            evidence: {
              found: version,
              expected: 'TLSv1.2 or TLSv1.3',
              impact: 'Old TLS versions have known vulnerabilities',
            },
          }
        );
      }

      return createResult(
        { id: 'security-tls-version', name: 'TLS Version', category: 'security', severity: 'error' },
        'pass',
        `Using ${version}`
      );
    },
  },
  {
    id: 'security-ssl-issuer',
    name: 'SSL Certificate Issuer',
    category: 'security',
    severity: 'info',
    description: 'SSL certificate should be from a trusted CA',
    check: (ctx) => {
      if (!ctx.sslCertificate?.issuer) {
        return createResult(
          { id: 'security-ssl-issuer', name: 'SSL Certificate Issuer', category: 'security', severity: 'info' },
          'info',
          'Not applicable (SSL certificate issuer information unavailable)',
          { recommendation: 'This rule checks SSL certificate issuer when certificate issuer information is available' }
        );
      }

      const issuer = ctx.sslCertificate.issuer;
      const selfSigned = issuer.toLowerCase().includes('self-signed') ||
                         ctx.sslCertificate.selfSigned === true;

      if (selfSigned) {
        return createResult(
          { id: 'security-ssl-issuer', name: 'SSL Certificate Issuer', category: 'security', severity: 'info' },
          'warn',
          'Self-signed SSL certificate detected',
          {
            recommendation: 'Use a certificate from a trusted Certificate Authority',
            evidence: {
              found: issuer,
              impact: 'Self-signed certificates show warnings in browsers',
            },
          }
        );
      }

      return createResult(
        { id: 'security-ssl-issuer', name: 'SSL Certificate Issuer', category: 'security', severity: 'info' },
        'pass',
        `Certificate issued by: ${issuer}`
      );
    },
  },

  // ==========================================================================
  // Form Security
  // ==========================================================================
  {
    id: 'security-password-on-http',
    name: 'Password Fields on HTTP',
    category: 'security',
    severity: 'error',
    description: 'Password fields must only appear on HTTPS pages',
    check: (ctx) => {
      if (ctx.hasPasswordField === undefined) {
        return createResult(
          { id: 'security-password-on-http', name: 'Password Fields on HTTP', category: 'security', severity: 'error' },
          'info',
          'Not applicable (password field information unavailable)',
          { recommendation: 'This rule checks for password fields on insecure pages when password field data is available' }
        );
      }

      if (ctx.hasPasswordField && ctx.isHttps === false) {
        return createResult(
          { id: 'security-password-on-http', name: 'Password Fields on HTTP', category: 'security', severity: 'error' },
          'fail',
          'Password field on insecure HTTP page',
          {
            recommendation: 'Enable HTTPS for all pages with password fields',
            evidence: {
              impact: 'Passwords sent over HTTP can be intercepted',
            },
          }
        );
      }

      if (ctx.hasPasswordField && ctx.isHttps === true) {
        return createResult(
          { id: 'security-password-on-http', name: 'Password Fields on HTTP', category: 'security', severity: 'error' },
          'pass',
          'Password fields are on HTTPS'
        );
      }

      return createResult(
        { id: 'security-password-on-http', name: 'Password Fields on HTTP', category: 'security', severity: 'error' },
        'info',
        'Not applicable (no password fields detected)',
        { recommendation: 'This rule checks if password fields are only used on HTTPS pages when password fields are present' }
      );
    },
  },
  {
    id: 'security-forms-on-http',
    name: 'Forms on HTTP',
    category: 'security',
    severity: 'warning',
    description: 'Forms should only submit to HTTPS endpoints',
    check: (ctx) => {
      if (ctx.formsOnHttp === undefined) {
        return createResult(
          { id: 'security-forms-on-http', name: 'Forms on HTTP', category: 'security', severity: 'warning' },
          'info',
          'Not applicable (form submission data unavailable)',
          { recommendation: 'This rule checks if forms submit to HTTPS endpoints when form data is available' }
        );
      }

      if (ctx.formsOnHttp > 0) {
        return createResult(
          { id: 'security-forms-on-http', name: 'Forms on HTTP', category: 'security', severity: 'warning' },
          'warn',
          `${ctx.formsOnHttp} form(s) submit to HTTP`,
          {
            value: ctx.formsOnHttp,
            recommendation: 'Update form actions to use HTTPS',
            evidence: {
              impact: 'Form data sent over HTTP can be intercepted',
            },
          }
        );
      }

      return createResult(
        { id: 'security-forms-on-http', name: 'Forms on HTTP', category: 'security', severity: 'warning' },
        'pass',
        'All forms submit to HTTPS'
      );
    },
  },

  // ==========================================================================
  // Server Information Disclosure
  // ==========================================================================
  {
    id: 'security-server-disclosure',
    name: 'Server Version Disclosure',
    category: 'security',
    severity: 'info',
    description: 'Server header should not reveal detailed version information',
    check: (ctx) => {
      if (!ctx.responseHeaders) {
        return createResult(
          { id: 'security-server-disclosure', name: 'Server Version Disclosure', category: 'security', severity: 'info' },
          'info',
          'Not applicable (response headers unavailable)',
          { recommendation: 'This rule checks for server version disclosure when HTTP response headers are available' }
        );
      }

      const serverHeader = ctx.responseHeaders['server'] || ctx.responseHeaders['Server'];
      if (!serverHeader) {
        return createResult(
          { id: 'security-server-disclosure', name: 'Server Version Disclosure', category: 'security', severity: 'info' },
          'info',
          'Not applicable (Server header not present)',
          { recommendation: 'This rule checks for server version disclosure when Server header is present' }
        );
      }

      const server = String(serverHeader);
      // Check for version numbers
      if (/\d+\.\d+/.test(server)) {
        return createResult(
          { id: 'security-server-disclosure', name: 'Server Version Disclosure', category: 'security', severity: 'info' },
          'info',
          `Server header reveals version: ${server}`,
          {
            recommendation: 'Configure server to hide version information',
            evidence: {
              found: server,
              impact: 'Attackers can target known vulnerabilities',
            },
          }
        );
      }

      return createResult(
        { id: 'security-server-disclosure', name: 'Server Version Disclosure', category: 'security', severity: 'info' },
        'info',
        'Not applicable (Server header not present or does not disclose version)',
        { recommendation: 'This rule checks if the Server header reveals version information' }
      );
    },
  },
  {
    id: 'security-x-powered-by',
    name: 'X-Powered-By Header',
    category: 'security',
    severity: 'info',
    description: 'X-Powered-By header reveals technology stack',
    check: (ctx) => {
      if (!ctx.responseHeaders) {
        return createResult(
          { id: 'security-x-powered-by', name: 'X-Powered-By Header', category: 'security', severity: 'info' },
          'info',
          'Not applicable (response headers unavailable)',
          { recommendation: 'This rule checks for X-Powered-By header disclosure when HTTP response headers are available' }
        );
      }

      const xPoweredBy = ctx.responseHeaders['x-powered-by'] || ctx.responseHeaders['X-Powered-By'];
      if (xPoweredBy) {
        return createResult(
          { id: 'security-x-powered-by', name: 'X-Powered-By Header', category: 'security', severity: 'info' },
          'info',
          `X-Powered-By header present: ${xPoweredBy}`,
          {
            recommendation: 'Remove X-Powered-By header to reduce attack surface',
            evidence: {
              found: String(xPoweredBy),
              impact: 'Reveals technology stack to potential attackers',
            },
          }
        );
      }

      return createResult(
        { id: 'security-x-powered-by', name: 'X-Powered-By Header', category: 'security', severity: 'info' },
        'info',
        'Not applicable (X-Powered-By header not present)',
        { recommendation: 'This rule checks for X-Powered-By header disclosure when the header is present' }
      );
    },
  },

  // ==========================================================================
  // SNI Support
  // ==========================================================================
  {
    id: 'ssl-sni-support',
    name: 'SNI Support',
    category: 'security',
    severity: 'info',
    description: 'Server should support Server Name Indication (SNI)',
    check: (ctx) => {
      if (ctx.sniSupported === undefined) {
        return createResult(
          { id: 'ssl-sni-support', name: 'SNI Support', category: 'security', severity: 'info' },
          'info',
          'Not applicable (SNI support information unavailable)',
          { recommendation: 'This rule checks for SNI support when SNI information is available' }
        );
      }

      if (!ctx.sniSupported) {
        return createResult(
          { id: 'ssl-sni-support', name: 'SNI Support', category: 'security', severity: 'info' },
          'info',
          'Server may not support SNI',
          {
            recommendation: 'Ensure web server supports SNI for proper HTTPS functionality',
            evidence: {
              impact: 'Some older browsers may have issues with SSL certificates without SNI support'
            }
          }
        );
      }

      return createResult(
        { id: 'ssl-sni-support', name: 'SNI Support', category: 'security', severity: 'info' },
        'info',
        'Not applicable (SNI is supported)',
        { recommendation: 'This rule checks for SNI support issues when SNI is not supported' }
      );
    },
  },

  // ==========================================================================
  // HTTP URLs in Sitemap
  // ==========================================================================
  {
    id: 'sitemap-https-urls',
    name: 'HTTPS URLs in Sitemap',
    category: 'security',
    severity: 'warning',
    description: 'Sitemap should only contain HTTPS URLs',
    check: (ctx) => {
      if (ctx.sitemapHttpUrls === undefined) {
        return createResult(
          { id: 'sitemap-https-urls', name: 'HTTPS URLs in Sitemap', category: 'security', severity: 'warning' },
          'info',
          'Not applicable (sitemap URL data unavailable)',
          { recommendation: 'This rule checks sitemap URLs for HTTPS usage when sitemap data is available' }
        );
      }

      if (ctx.sitemapHttpUrls > 0) {
        return createResult(
          { id: 'sitemap-https-urls', name: 'HTTPS URLs in Sitemap', category: 'security', severity: 'warning' },
          'warn',
          `Sitemap contains ${ctx.sitemapHttpUrls} HTTP URLs`,
          {
            value: ctx.sitemapHttpUrls,
            recommendation: 'Replace all HTTP URLs in sitemap.xml with HTTPS versions',
            evidence: {
              found: `${ctx.sitemapHttpUrls} HTTP URLs`,
              expected: 'All URLs should use HTTPS',
              impact: 'HTTP URLs in sitemap can cause mixed content issues and indexing confusion'
            }
          }
        );
      }

      return createResult(
        { id: 'sitemap-https-urls', name: 'HTTPS URLs in Sitemap', category: 'security', severity: 'warning' },
        'pass',
        'All sitemap URLs use HTTPS'
      );
    },
  },

  // ==========================================================================
  // HSTS Header
  // ==========================================================================
  {
    id: 'security-hsts',
    name: 'HSTS Header',
    category: 'security',
    severity: 'info',
    description: 'HTTPS sites should implement HSTS for security',
    check: (ctx) => {
      if (!ctx.isHttps) {
        return createResult(
          { id: 'security-hsts', name: 'HSTS Header', category: 'security', severity: 'info' },
          'info',
          'Not applicable (page is not served over HTTPS)',
          { recommendation: 'This rule checks HSTS implementation on HTTPS sites only' }
        );
      }
      if (ctx.hasHsts === undefined) {
        return createResult(
          { id: 'security-hsts', name: 'HSTS Header', category: 'security', severity: 'info' },
          'info',
          'Not applicable (HSTS status unavailable)',
          { recommendation: 'This rule checks for HSTS headers when HSTS information is available' }
        );
      }

      if (!ctx.hasHsts) {
        return createResult(
          { id: 'security-hsts', name: 'HSTS Header', category: 'security', severity: 'info' },
          'info',
          'Missing Strict-Transport-Security header',
          {
            recommendation: 'Implement HSTS to enforce HTTPS connections',
            evidence: {
              expected: 'Strict-Transport-Security: max-age=31536000; includeSubDomains',
              impact: 'Without HSTS, browsers may still attempt insecure HTTP connections',
              learnMore: 'https://web.dev/strict-transport-security/'
            }
          }
        );
      }

      return createResult(
        { id: 'security-hsts', name: 'HSTS Header', category: 'security', severity: 'info' },
        'pass',
        'HSTS header is present'
      );
    },
  },
];

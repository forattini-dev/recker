import { SeoRule, createResult } from './types.js';

export const securityRules: SeoRule[] = [
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
          { recommendation: 'Enable HTTPS for all pages' }
        );
      }
      if (ctx.isHttps === true) {
        return createResult(
          { id: 'https-required', name: 'HTTPS', category: 'security', severity: 'error' },
          'pass',
          'Page is served over HTTPS'
        );
      }
      return null;
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
          { recommendation: 'Update all resources to use HTTPS' }
        );
      }
      return null;
    },
  },
  {
    id: 'security-csp-exists',
    name: 'Content Security Policy (CSP)',
    category: 'security',
    severity: 'warning',
    description: 'Content Security Policy header should be present to mitigate XSS attacks.',
    check: (ctx) => {
      if (!ctx.responseHeaders) return null;
      const cspHeader = ctx.responseHeaders['content-security-policy'] || ctx.responseHeaders['Content-Security-Policy'];
      if (!cspHeader) {
        return createResult(
          { id: 'security-csp-exists', name: 'Content Security Policy', category: 'security', severity: 'warning' },
          'warn',
          'Content-Security-Policy header is missing',
          { recommendation: 'Implement a strong Content-Security-Policy to prevent XSS attacks.' }
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
    id: 'security-xfo-exists',
    name: 'X-Frame-Options',
    category: 'security',
    severity: 'warning',
    description: 'X-Frame-Options header should be present to prevent clickjacking.',
    check: (ctx) => {
      if (!ctx.responseHeaders) return null;
      const xfoHeader = ctx.responseHeaders['x-frame-options'] || ctx.responseHeaders['X-Frame-Options'];
      if (!xfoHeader) {
        return createResult(
          { id: 'security-xfo-exists', name: 'X-Frame-Options', category: 'security', severity: 'warning' },
          'warn',
          'X-Frame-Options header is missing',
          { recommendation: 'Implement X-Frame-Options to prevent clickjacking attacks.' }
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
    id: 'security-cors-config',
    name: 'CORS Configuration',
    category: 'security',
    severity: 'warning',
    description: 'Review Access-Control-Allow-Origin header for proper CORS configuration.',
    check: (ctx) => {
      if (!ctx.responseHeaders) return null;
      const acaoHeader = ctx.responseHeaders['access-control-allow-origin'] || ctx.responseHeaders['Access-Control-Allow-Origin'];
      if (acaoHeader === '*') {
        return createResult(
          { id: 'security-cors-config', name: 'CORS Configuration', category: 'security', severity: 'warning' },
          'warn',
          'Access-Control-Allow-Origin is set to "*"',
          { recommendation: 'Avoid wildcard (*) in Access-Control-Allow-Origin for sensitive content. Specify allowed origins.' }
        );
      }
      if (!acaoHeader) {
        return createResult(
          { id: 'security-cors-config', name: 'CORS Configuration', category: 'security', severity: 'warning' },
          'info', // This is still 'info' because missing is not always a problem.
          'Access-Control-Allow-Origin header is missing',
          { recommendation: 'Consider explicit CORS configuration if resources are consumed cross-origin.' }
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
    id: 'security-hsts-exists',
    name: 'Strict-Transport-Security (HSTS)',
    category: 'security',
    severity: 'warning',
    description: 'HSTS header forces secure connections and improves SEO indirectly.',
    check: (ctx) => {
      if (!ctx.responseHeaders) return null;
      const hstsHeader = ctx.responseHeaders['strict-transport-security'] || ctx.responseHeaders['Strict-Transport-Security'];
      if (!hstsHeader) {
        return createResult(
          { id: 'security-hsts-exists', name: 'HSTS Header', category: 'security', severity: 'warning' },
          'warn',
          'Strict-Transport-Security header is missing',
          { recommendation: 'Implement HSTS to force secure connections and benefit SEO.' }
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
    id: 'security-xcto-exists',
    name: 'X-Content-Type-Options',
    category: 'security',
    severity: 'warning',
    description: 'X-Content-Type-Options header prevents MIME sniffing attacks.',
    check: (ctx) => {
      if (!ctx.responseHeaders) return null;
      const xctoHeader = ctx.responseHeaders['x-content-type-options'] || ctx.responseHeaders['X-Content-Type-Options'];
      if (!xctoHeader) {
        return createResult(
          { id: 'security-xcto-exists', name: 'X-Content-Type-Options', category: 'security', severity: 'warning' },
          'warn',
          'X-Content-Type-Options header is missing',
          { recommendation: 'Implement X-Content-Type-Options: nosniff to prevent MIME sniffing.' }
        );
      }
      return createResult(
        { id: 'security-xcto-exists', name: 'X-Content-Type-Options', category: 'security', severity: 'warning' },
        'pass',
        `X-Content-Type-Options header is present: ${xctoHeader}`,
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
      if (!ctx.responseHeaders) return null;
      const rpHeader = ctx.responseHeaders['referrer-policy'] || ctx.responseHeaders['Referrer-Policy'];
      if (!rpHeader) {
        return createResult(
          { id: 'security-rp-exists', name: 'Referrer-Policy', category: 'security', severity: 'info' },
          'info',
          'Referrer-Policy header is missing',
          { recommendation: 'Consider implementing a Referrer-Policy for better privacy and control (e.g., strict-origin-when-cross-origin).' }
        );
      }
      return createResult(
        { id: 'security-rp-exists', name: 'Referrer-Policy', category: 'security', severity: 'info' },
        'pass',
        `Referrer-Policy header is present: ${rpHeader}`,
      );
    },
  },
  {
    id: 'security-pp-exists',
    name: 'Permissions-Policy',
    category: 'security',
    severity: 'info',
    description: 'Permissions-Policy controls browser features available to the page and iframes.',
    check: (ctx) => {
      if (!ctx.responseHeaders) return null;
      const ppHeader = ctx.responseHeaders['permissions-policy'] || ctx.responseHeaders['Permissions-Policy'];
      if (!ppHeader) {
        return createResult(
          { id: 'security-pp-exists', name: 'Permissions-Policy', category: 'security', severity: 'info' },
          'info',
          'Permissions-Policy header is missing',
          { recommendation: 'Consider implementing a Permissions-Policy to disable unused browser features and enhance security (e.g., camera=(), microphone=()).' }
        );
      }
      return createResult(
        { id: 'security-pp-exists', name: 'Permissions-Policy', category: 'security', severity: 'info' },
        'pass',
        `Permissions-Policy header is present: ${ppHeader}`,
      );
    },
  },
];

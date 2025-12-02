// Security Headers Analyzer - Comprehensive security assessment
// Based on OWASP Security Headers, Mozilla Observatory, and modern browser security features

export interface SecurityHeaderResult {
  header: string;
  value?: string;
  status: 'pass' | 'warn' | 'fail';
  score: number; // Negative penalty or positive bonus
  message: string;
  recommendation?: string;
}

export interface CSPDirective {
  name: string;
  values: string[];
  issues: string[];
  severity: 'safe' | 'warn' | 'dangerous';
}

export interface CSPAnalysis {
  raw: string;
  directives: CSPDirective[];
  issues: string[];
  score: number; // 0-100
  hasUnsafeInline: boolean;
  hasUnsafeEval: boolean;
  hasWildcard: boolean;
  missingDirectives: string[];
}

export interface SecurityReport {
  grade: string; // A+, A, B, C, D, F
  score: number; // 0-100
  details: SecurityHeaderResult[];
  csp?: CSPAnalysis;
  summary: {
    passed: number;
    warnings: number;
    failed: number;
  };
}

// CSP Directives Reference
const CSP_FETCH_DIRECTIVES = [
  'default-src', 'script-src', 'style-src', 'img-src', 'font-src',
  'connect-src', 'media-src', 'object-src', 'frame-src', 'child-src',
  'worker-src', 'manifest-src', 'prefetch-src'
] as const;

const CSP_DOCUMENT_DIRECTIVES = [
  'base-uri', 'sandbox', 'form-action', 'frame-ancestors',
  'navigate-to'
] as const;

const CSP_REPORTING_DIRECTIVES = [
  'report-uri', 'report-to'
] as const;

const CSP_SPECIAL_DIRECTIVES = [
  'upgrade-insecure-requests', 'block-all-mixed-content',
  'require-trusted-types-for', 'trusted-types'
] as const;

// Dangerous CSP values that weaken security
const DANGEROUS_CSP_VALUES = {
  "'unsafe-inline'": 'Allows inline scripts/styles. Use nonces or hashes instead.',
  "'unsafe-eval'": 'Allows eval() and similar. Major XSS risk.',
  "'unsafe-hashes'": 'Allows specific inline event handlers. Prefer nonces.',
  '*': 'Wildcard allows loading from any source.',
  'data:': 'Data URIs can be used for XSS attacks.',
  'blob:': 'Blob URLs can bypass CSP in some cases.',
  'http:': 'Allows insecure HTTP sources. Use HTTPS only.',
} as const;

// Safe CSP values
const SAFE_CSP_VALUES = new Set([
  "'self'", "'none'", "'strict-dynamic'", "'report-sample'",
  'https:', "'wasm-unsafe-eval'"
]);

/**
 * Parse and analyze Content-Security-Policy header
 */
export function analyzeCSP(cspValue: string): CSPAnalysis {
  const directives: CSPDirective[] = [];
  const issues: string[] = [];
  let score = 100;

  let hasUnsafeInline = false;
  let hasUnsafeEval = false;
  let hasWildcard = false;

  // Parse directives
  const parts = cspValue.split(';').map(p => p.trim()).filter(Boolean);
  const directiveNames = new Set<string>();

  for (const part of parts) {
    const [name, ...values] = part.split(/\s+/);
    const directiveName = name.toLowerCase();
    directiveNames.add(directiveName);

    const directive: CSPDirective = {
      name: directiveName,
      values,
      issues: [],
      severity: 'safe'
    };

    // Check each value for dangerous patterns
    for (const val of values) {
      const lowerVal = val.toLowerCase();

      if (lowerVal === "'unsafe-inline'") {
        hasUnsafeInline = true;
        directive.issues.push(DANGEROUS_CSP_VALUES["'unsafe-inline'"]);
        directive.severity = 'dangerous';
      } else if (lowerVal === "'unsafe-eval'") {
        hasUnsafeEval = true;
        directive.issues.push(DANGEROUS_CSP_VALUES["'unsafe-eval'"]);
        directive.severity = 'dangerous';
      } else if (val === '*') {
        hasWildcard = true;
        directive.issues.push(DANGEROUS_CSP_VALUES['*']);
        directive.severity = 'dangerous';
      } else if (lowerVal === 'data:' && ['script-src', 'default-src'].includes(directiveName)) {
        directive.issues.push(DANGEROUS_CSP_VALUES['data:']);
        directive.severity = 'warn';
      } else if (lowerVal === 'http:') {
        directive.issues.push(DANGEROUS_CSP_VALUES['http:']);
        directive.severity = 'warn';
      } else if (val.startsWith('*.') || val.includes('*')) {
        directive.issues.push(`Wildcard domain "${val}" is overly permissive.`);
        directive.severity = directive.severity === 'dangerous' ? 'dangerous' : 'warn';
      }
    }

    directives.push(directive);
  }

  // Check for missing important directives
  const missingDirectives: string[] = [];

  if (!directiveNames.has('default-src')) {
    missingDirectives.push('default-src');
    issues.push('Missing default-src directive. Fallback behavior is unpredictable.');
    score -= 10;
  }

  if (!directiveNames.has('object-src') && !directiveNames.has('default-src')) {
    missingDirectives.push('object-src');
    issues.push("Missing object-src. Consider adding object-src 'none' to block plugins.");
    score -= 5;
  }

  if (!directiveNames.has('base-uri')) {
    missingDirectives.push('base-uri');
    issues.push("Missing base-uri. Consider adding base-uri 'self' to prevent base tag injection.");
    score -= 5;
  }

  if (!directiveNames.has('form-action')) {
    missingDirectives.push('form-action');
    issues.push('Missing form-action. Form submissions can be hijacked.');
    score -= 5;
  }

  if (!directiveNames.has('frame-ancestors')) {
    missingDirectives.push('frame-ancestors');
    issues.push('Missing frame-ancestors. Use this instead of X-Frame-Options for modern browsers.');
    score -= 5;
  }

  // Apply penalties for dangerous values
  if (hasUnsafeInline) {
    issues.push("'unsafe-inline' allows inline scripts. Major XSS vulnerability.");
    score -= 20;
  }

  if (hasUnsafeEval) {
    issues.push("'unsafe-eval' allows eval(). Dangerous for code injection.");
    score -= 20;
  }

  if (hasWildcard) {
    issues.push('Wildcard (*) source allows loading from any origin.');
    score -= 15;
  }

  return {
    raw: cspValue,
    directives,
    issues,
    score: Math.max(0, score),
    hasUnsafeInline,
    hasUnsafeEval,
    hasWildcard,
    missingDirectives
  };
}

/**
 * Generate a recommended CSP based on common patterns
 */
export function generateRecommendedCSP(options: {
  strictMode?: boolean;
  allowInlineStyles?: boolean;
  trustedDomains?: string[];
} = {}): string {
  const { strictMode = true, allowInlineStyles = false, trustedDomains = [] } = options;

  const directives: string[] = [];

  // Default restrictive policy
  directives.push("default-src 'self'");

  // Script policy
  if (strictMode) {
    directives.push("script-src 'self' 'strict-dynamic'");
  } else {
    directives.push("script-src 'self'" + (trustedDomains.length ? ' ' + trustedDomains.join(' ') : ''));
  }

  // Style policy
  if (allowInlineStyles) {
    directives.push("style-src 'self' 'unsafe-inline'");
  } else {
    directives.push("style-src 'self'");
  }

  // Other restrictive defaults
  directives.push("img-src 'self' data: https:");
  directives.push("font-src 'self'");
  directives.push("connect-src 'self'" + (trustedDomains.length ? ' ' + trustedDomains.join(' ') : ''));
  directives.push("object-src 'none'");
  directives.push("base-uri 'self'");
  directives.push("form-action 'self'");
  directives.push("frame-ancestors 'none'");
  directives.push('upgrade-insecure-requests');

  return directives.join('; ');
}

// Header checks with detailed analysis
const HEADERS_CHECKS: Array<{
  header: string;
  weight: number;
  category: 'transport' | 'content' | 'isolation' | 'info-leak' | 'framing';
  check: (value?: string) => { status: 'pass' | 'warn' | 'fail'; message: string; recommendation?: string };
}> = [
  // Transport Security
  {
    header: 'strict-transport-security',
    weight: 25,
    category: 'transport',
    check: (val) => {
      if (!val) {
        return {
          status: 'fail',
          message: 'HSTS not enabled. Vulnerable to SSL stripping attacks.',
          recommendation: 'Add: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload'
        };
      }

      const maxAge = parseInt(val.match(/max-age=(\d+)/i)?.[1] || '0');
      const hasSubDomains = val.toLowerCase().includes('includesubdomains');
      const hasPreload = val.toLowerCase().includes('preload');

      if (maxAge < 86400) {
        return {
          status: 'fail',
          message: `HSTS max-age too short (${maxAge}s). Minimum 1 day recommended.`,
          recommendation: 'Set max-age to at least 31536000 (1 year)'
        };
      }

      if (maxAge < 15552000) { // 6 months
        return {
          status: 'warn',
          message: `HSTS max-age is ${Math.floor(maxAge / 86400)} days. 6+ months recommended.`,
          recommendation: 'Increase max-age to 31536000 (1 year) for better security'
        };
      }

      if (!hasSubDomains) {
        return {
          status: 'warn',
          message: 'HSTS does not include subdomains.',
          recommendation: 'Add includeSubDomains to protect all subdomains'
        };
      }

      if (hasPreload) {
        return { status: 'pass', message: 'HSTS enabled with preload. Excellent!' };
      }

      return { status: 'pass', message: 'HSTS enabled with good configuration.' };
    }
  },

  // Content Security
  {
    header: 'content-security-policy',
    weight: 25,
    category: 'content',
    check: (val) => {
      if (!val) {
        return {
          status: 'fail',
          message: 'CSP is missing. Site is vulnerable to XSS attacks.',
          recommendation: "Add a CSP. Start with: Content-Security-Policy: default-src 'self'"
        };
      }

      const analysis = analyzeCSP(val);

      if (analysis.hasUnsafeEval && analysis.hasUnsafeInline) {
        return {
          status: 'fail',
          message: 'CSP has both unsafe-inline and unsafe-eval. Provides minimal protection.',
          recommendation: 'Remove unsafe directives. Use nonces or hashes for inline scripts.'
        };
      }

      if (analysis.hasWildcard) {
        return {
          status: 'warn',
          message: 'CSP contains wildcard (*). Too permissive.',
          recommendation: 'Replace wildcards with specific trusted domains.'
        };
      }

      if (analysis.hasUnsafeInline) {
        return {
          status: 'warn',
          message: "CSP has 'unsafe-inline'. Consider using nonces or hashes.",
          recommendation: "Use 'strict-dynamic' with nonces for script-src."
        };
      }

      if (analysis.hasUnsafeEval) {
        return {
          status: 'warn',
          message: "CSP has 'unsafe-eval'. Allows eval() which is dangerous.",
          recommendation: 'Remove unsafe-eval. Refactor code to avoid eval().'
        };
      }

      if (analysis.missingDirectives.length > 2) {
        return {
          status: 'warn',
          message: `CSP missing important directives: ${analysis.missingDirectives.join(', ')}`,
          recommendation: `Add: ${analysis.missingDirectives.map(d => `${d} 'self'`).join('; ')}`
        };
      }

      return { status: 'pass', message: 'CSP is well configured.' };
    }
  },

  // Framing Protection
  {
    header: 'x-frame-options',
    weight: 10,
    category: 'framing',
    check: (val) => {
      if (!val) {
        return {
          status: 'warn',
          message: 'Missing X-Frame-Options. Use CSP frame-ancestors instead.',
          recommendation: 'Add X-Frame-Options: DENY or use CSP frame-ancestors'
        };
      }

      const upper = val.toUpperCase();
      if (upper === 'DENY') {
        return { status: 'pass', message: 'Clickjacking protection: DENY (strictest).' };
      }
      if (upper === 'SAMEORIGIN') {
        return { status: 'pass', message: 'Clickjacking protection: SAMEORIGIN.' };
      }
      if (upper.startsWith('ALLOW-FROM')) {
        return {
          status: 'warn',
          message: 'ALLOW-FROM is deprecated and not supported in modern browsers.',
          recommendation: 'Use CSP frame-ancestors instead of ALLOW-FROM'
        };
      }

      return { status: 'warn', message: `Unknown X-Frame-Options value: ${val}` };
    }
  },

  // MIME Type Sniffing
  {
    header: 'x-content-type-options',
    weight: 10,
    category: 'content',
    check: (val) => {
      if (!val) {
        return {
          status: 'fail',
          message: 'Missing X-Content-Type-Options. MIME sniffing attacks possible.',
          recommendation: 'Add: X-Content-Type-Options: nosniff'
        };
      }
      if (val.toLowerCase() === 'nosniff') {
        return { status: 'pass', message: 'MIME sniffing disabled.' };
      }
      return {
        status: 'fail',
        message: `Invalid value "${val}". Must be "nosniff".`,
        recommendation: 'Set value to exactly: nosniff'
      };
    }
  },

  // Referrer Policy
  {
    header: 'referrer-policy',
    weight: 10,
    category: 'content',
    check: (val) => {
      if (!val) {
        return {
          status: 'warn',
          message: 'Missing Referrer-Policy. URL may leak to third parties.',
          recommendation: 'Add: Referrer-Policy: strict-origin-when-cross-origin'
        };
      }

      const policies = val.toLowerCase().split(',').map(p => p.trim());
      const safePolicies = ['no-referrer', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin'];
      const unsafePolicies = ['unsafe-url', 'no-referrer-when-downgrade'];

      for (const policy of policies) {
        if (unsafePolicies.includes(policy)) {
          return {
            status: 'warn',
            message: `"${policy}" may leak referrer to third parties.`,
            recommendation: 'Use strict-origin-when-cross-origin for balanced privacy'
          };
        }
      }

      if (policies.some(p => safePolicies.includes(p))) {
        return { status: 'pass', message: 'Referrer leakage properly restricted.' };
      }

      return { status: 'warn', message: `Unknown policy: ${val}` };
    }
  },

  // Permissions Policy (formerly Feature-Policy)
  {
    header: 'permissions-policy',
    weight: 10,
    category: 'content',
    check: (val) => {
      if (!val) {
        return {
          status: 'warn',
          message: 'Missing Permissions-Policy. Browser features unrestricted.',
          recommendation: 'Add: Permissions-Policy: geolocation=(), camera=(), microphone=()'
        };
      }

      // Check for permissive values
      if (val.includes('*')) {
        return {
          status: 'warn',
          message: 'Permissions-Policy allows all origins for some features.',
          recommendation: 'Restrict features to self or specific origins'
        };
      }

      // Count restricted features
      const features = val.split(',').length;
      if (features >= 5) {
        return { status: 'pass', message: `Permissions-Policy restricts ${features} features.` };
      }

      return { status: 'pass', message: 'Permissions-Policy enabled.' };
    }
  },

  // Cross-Origin-Opener-Policy (COOP)
  {
    header: 'cross-origin-opener-policy',
    weight: 8,
    category: 'isolation',
    check: (val) => {
      if (!val) {
        return {
          status: 'warn',
          message: 'Missing COOP. Site may be vulnerable to cross-origin attacks.',
          recommendation: 'Add: Cross-Origin-Opener-Policy: same-origin'
        };
      }

      const lower = val.toLowerCase();
      if (lower === 'same-origin') {
        return { status: 'pass', message: 'COOP: same-origin. Strong isolation enabled.' };
      }
      if (lower === 'same-origin-allow-popups') {
        return { status: 'pass', message: 'COOP allows popups but maintains isolation.' };
      }
      if (lower === 'unsafe-none') {
        return {
          status: 'warn',
          message: 'COOP is unsafe-none. No isolation.',
          recommendation: 'Use same-origin for better security'
        };
      }

      return { status: 'warn', message: `Unknown COOP value: ${val}` };
    }
  },

  // Cross-Origin-Embedder-Policy (COEP)
  {
    header: 'cross-origin-embedder-policy',
    weight: 8,
    category: 'isolation',
    check: (val) => {
      if (!val) {
        return {
          status: 'warn',
          message: 'Missing COEP. Required for SharedArrayBuffer and high-resolution timers.',
          recommendation: 'Add: Cross-Origin-Embedder-Policy: require-corp'
        };
      }

      const lower = val.toLowerCase();
      if (lower === 'require-corp') {
        return { status: 'pass', message: 'COEP: require-corp. Cross-origin isolation enabled.' };
      }
      if (lower === 'credentialless') {
        return { status: 'pass', message: 'COEP: credentialless. Good isolation with flexibility.' };
      }
      if (lower === 'unsafe-none') {
        return {
          status: 'warn',
          message: 'COEP is unsafe-none. No cross-origin isolation.',
          recommendation: 'Use require-corp or credentialless'
        };
      }

      return { status: 'warn', message: `Unknown COEP value: ${val}` };
    }
  },

  // Cross-Origin-Resource-Policy (CORP)
  {
    header: 'cross-origin-resource-policy',
    weight: 5,
    category: 'isolation',
    check: (val) => {
      if (!val) {
        return {
          status: 'warn',
          message: 'Missing CORP. Resources can be embedded by any site.',
          recommendation: 'Add: Cross-Origin-Resource-Policy: same-origin'
        };
      }

      const lower = val.toLowerCase();
      if (lower === 'same-origin') {
        return { status: 'pass', message: 'CORP: same-origin. Strictest embedding restriction.' };
      }
      if (lower === 'same-site') {
        return { status: 'pass', message: 'CORP: same-site. Allows same-site embedding.' };
      }
      if (lower === 'cross-origin') {
        return {
          status: 'warn',
          message: 'CORP allows cross-origin embedding.',
          recommendation: 'Use same-origin or same-site for sensitive resources'
        };
      }

      return { status: 'warn', message: `Unknown CORP value: ${val}` };
    }
  },

  // X-XSS-Protection (Legacy)
  {
    header: 'x-xss-protection',
    weight: 0,
    category: 'content',
    check: (val) => {
      // This header is deprecated, modern browsers ignore it
      if (!val) {
        return { status: 'pass', message: 'X-XSS-Protection not set (deprecated header).' };
      }

      if (val === '0') {
        return { status: 'pass', message: 'XSS filter disabled (recommended for CSP sites).' };
      }

      if (val.includes('1') && val.includes('mode=block')) {
        return {
          status: 'warn',
          message: 'X-XSS-Protection is deprecated. Use CSP instead.',
          recommendation: 'Remove this header and rely on CSP'
        };
      }

      return {
        status: 'warn',
        message: 'X-XSS-Protection is deprecated.',
        recommendation: 'Remove this header. Use Content-Security-Policy instead.'
      };
    }
  },

  // Information Leakage - Server
  {
    header: 'server',
    weight: 2,
    category: 'info-leak',
    check: (val) => {
      if (!val) {
        return { status: 'pass', message: 'Server header hidden.' };
      }

      // Check for version numbers
      if (/\d+\.\d+/.test(val)) {
        return {
          status: 'warn',
          message: `Server header exposes version: "${val}"`,
          recommendation: 'Remove version numbers from Server header'
        };
      }

      return {
        status: 'warn',
        message: `Server header reveals: "${val}"`,
        recommendation: 'Consider hiding or minimizing Server header'
      };
    }
  },

  // Information Leakage - X-Powered-By
  {
    header: 'x-powered-by',
    weight: 5,
    category: 'info-leak',
    check: (val) => {
      if (!val) {
        return { status: 'pass', message: 'Technology stack hidden.' };
      }

      return {
        status: 'fail',
        message: `X-Powered-By exposes: "${val}"`,
        recommendation: 'Remove X-Powered-By header (e.g., app.disable("x-powered-by") in Express)'
      };
    }
  },

  // X-DNS-Prefetch-Control
  {
    header: 'x-dns-prefetch-control',
    weight: 2,
    category: 'content',
    check: (val) => {
      if (!val) {
        return { status: 'pass', message: 'DNS prefetch uses browser default.' };
      }

      if (val.toLowerCase() === 'off') {
        return { status: 'pass', message: 'DNS prefetching disabled for privacy.' };
      }
      if (val.toLowerCase() === 'on') {
        return {
          status: 'warn',
          message: 'DNS prefetching enabled. May leak browsing intent.',
          recommendation: 'Set to "off" for privacy-sensitive sites'
        };
      }

      return { status: 'warn', message: `Unknown value: ${val}` };
    }
  },

  // Cache-Control for sensitive pages
  {
    header: 'cache-control',
    weight: 5,
    category: 'content',
    check: (val) => {
      if (!val) {
        return {
          status: 'warn',
          message: 'No Cache-Control header. Browser may cache sensitive content.',
          recommendation: 'Add: Cache-Control: no-store for sensitive pages'
        };
      }

      const lower = val.toLowerCase();
      if (lower.includes('no-store')) {
        return { status: 'pass', message: 'Cache-Control prevents caching of sensitive data.' };
      }
      if (lower.includes('private')) {
        return { status: 'pass', message: 'Cache-Control set to private.' };
      }
      if (lower.includes('public') && !lower.includes('no-cache')) {
        return {
          status: 'warn',
          message: 'Public caching enabled. May expose sensitive data.',
          recommendation: 'Use no-store for sensitive content'
        };
      }

      return { status: 'pass', message: 'Cache-Control configured.' };
    }
  }
];

/**
 * Comprehensive security headers analysis
 */
export function analyzeSecurityHeaders(headers: Headers): SecurityReport {
  let totalScore = 100;
  let penalty = 0;
  const details: SecurityHeaderResult[] = [];
  let passed = 0;
  let warnings = 0;
  let failed = 0;

  let cspAnalysis: CSPAnalysis | undefined;

  for (const check of HEADERS_CHECKS) {
    const value = headers.get(check.header);
    const result = check.check(value || undefined);

    // Track CSP analysis for detailed report
    if (check.header === 'content-security-policy' && value) {
      cspAnalysis = analyzeCSP(value);
    }

    // Calculate penalty
    let itemPenalty = 0;
    if (result.status === 'fail') {
      itemPenalty = check.weight;
      failed++;
    } else if (result.status === 'warn') {
      itemPenalty = Math.ceil(check.weight / 2);
      warnings++;
    } else {
      passed++;
    }

    penalty += itemPenalty;

    details.push({
      header: check.header,
      value: value || undefined,
      status: result.status,
      score: -itemPenalty,
      message: result.message,
      recommendation: result.recommendation
    });
  }

  // Calculate final score
  const finalScore = Math.max(0, totalScore - penalty);

  // Assign Grade
  let grade = 'F';
  if (finalScore >= 95) grade = 'A+';
  else if (finalScore >= 90) grade = 'A';
  else if (finalScore >= 80) grade = 'B';
  else if (finalScore >= 70) grade = 'C';
  else if (finalScore >= 60) grade = 'D';

  return {
    grade,
    score: finalScore,
    details,
    csp: cspAnalysis,
    summary: { passed, warnings, failed }
  };
}

/**
 * Quick security check - returns only critical issues
 */
export function quickSecurityCheck(headers: Headers): {
  secure: boolean;
  criticalIssues: string[];
} {
  const criticalIssues: string[] = [];

  // Check HTTPS enforcement
  if (!headers.get('strict-transport-security')) {
    criticalIssues.push('No HSTS - vulnerable to SSL stripping');
  }

  // Check XSS protection
  const csp = headers.get('content-security-policy');
  if (!csp) {
    criticalIssues.push('No CSP - vulnerable to XSS');
  } else if (csp.includes("'unsafe-inline'") && csp.includes("'unsafe-eval'")) {
    criticalIssues.push('CSP too permissive (unsafe-inline + unsafe-eval)');
  }

  // Check clickjacking
  const xfo = headers.get('x-frame-options');
  const frameAncestors = csp?.includes('frame-ancestors');
  if (!xfo && !frameAncestors) {
    criticalIssues.push('No clickjacking protection');
  }

  // Check MIME sniffing
  if (!headers.get('x-content-type-options')) {
    criticalIssues.push('MIME sniffing not disabled');
  }

  return {
    secure: criticalIssues.length === 0,
    criticalIssues
  };
}

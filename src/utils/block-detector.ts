/**
 * Block Detector
 *
 * Detects when a website is blocking requests due to bot detection,
 * WAF rules, or TLS fingerprint mismatches.
 */

export interface BlockDetectionResult {
  /** Whether the response appears to be blocked */
  blocked: boolean;
  /** Reason for the block */
  reason?: 'status' | 'cloudflare' | 'akamai' | 'datadome' | 'captcha' | 'waf' | 'rate-limit';
  /** Confidence score from 0 to 1 */
  confidence: number;
  /** Human-readable description */
  description?: string;
}

/**
 * Status codes that typically indicate blocking
 */
const BLOCK_STATUS_CODES = new Set([
  403, // Forbidden
  406, // Not Acceptable (WAF)
  429, // Too Many Requests
  503, // Service Unavailable (often used for challenges)
]);

/**
 * Headers that indicate Cloudflare protection
 */
const CLOUDFLARE_HEADERS = ['cf-ray', 'cf-cache-status', 'cf-mitigated'];

/**
 * Headers that indicate Akamai protection
 */
const AKAMAI_HEADERS = ['x-akamai-transformed', 'akamai-grn', 'x-akamai-request-id'];

/**
 * Headers that indicate DataDome protection
 */
const DATADOME_HEADERS = ['x-datadome', 'x-dd-b', 'x-dd-type'];

/**
 * Body patterns that indicate various types of blocking
 */
const BLOCK_PATTERNS: Array<{
  pattern: RegExp;
  reason: BlockDetectionResult['reason'];
  confidence: number;
  description: string;
}> = [
  // Cloudflare
  {
    pattern: /checking your browser|just a moment|enable javascript and cookies|cloudflare ray id/i,
    reason: 'cloudflare',
    confidence: 0.95,
    description: 'Cloudflare browser verification challenge',
  },
  {
    pattern: /attention required|cloudflare|cf-browser-verification/i,
    reason: 'cloudflare',
    confidence: 0.85,
    description: 'Cloudflare protection page',
  },

  // Akamai
  {
    pattern: /access denied|reference #[\da-f]+|akamai/i,
    reason: 'akamai',
    confidence: 0.9,
    description: 'Akamai Bot Manager block',
  },

  // DataDome
  {
    pattern: /datadome|geo\.captcha-delivery\.com/i,
    reason: 'datadome',
    confidence: 0.95,
    description: 'DataDome bot detection',
  },

  // Generic CAPTCHA
  {
    pattern: /captcha|recaptcha|hcaptcha|funcaptcha|arkose/i,
    reason: 'captcha',
    confidence: 0.9,
    description: 'CAPTCHA challenge required',
  },

  // Rate limiting
  {
    pattern: /rate limit|too many requests|slow down|try again later/i,
    reason: 'rate-limit',
    confidence: 0.85,
    description: 'Rate limiting detected',
  },

  // Generic WAF
  {
    pattern: /blocked|forbidden|security check|bot detected|suspicious activity/i,
    reason: 'waf',
    confidence: 0.7,
    description: 'Generic WAF/security block',
  },

  // PerimeterX
  {
    pattern: /perimeterx|px-captcha|human verification/i,
    reason: 'waf',
    confidence: 0.9,
    description: 'PerimeterX bot detection',
  },

  // Imperva/Incapsula
  {
    pattern: /incapsula|imperva|_incap_ses|visid_incap/i,
    reason: 'waf',
    confidence: 0.9,
    description: 'Imperva/Incapsula protection',
  },
];

/**
 * Response-like object for detection
 */
interface ResponseLike {
  status: number;
  headers: {
    get(name: string): string | null;
    has?(name: string): boolean;
  };
}

/**
 * Detect if a response indicates the request was blocked
 *
 * @param response - Response object with status and headers
 * @param body - Optional response body text for deeper analysis
 * @returns Detection result with blocked status, reason, and confidence
 *
 * @example
 * ```typescript
 * const response = await fetch('https://example.com');
 * const body = await response.text();
 * const result = detectBlock(response, body);
 *
 * if (result.blocked && result.confidence > 0.7) {
 *   console.log(`Blocked by ${result.reason}: ${result.description}`);
 * }
 * ```
 */
export function detectBlock(response: ResponseLike, body?: string): BlockDetectionResult {
  const results: BlockDetectionResult[] = [];

  // Check status code
  if (BLOCK_STATUS_CODES.has(response.status)) {
    results.push({
      blocked: true,
      reason: response.status === 429 ? 'rate-limit' : 'status',
      confidence: response.status === 403 ? 0.6 : 0.7, // 403 can be legitimate
      description: `HTTP ${response.status} status code`,
    });
  }

  // Check Cloudflare headers
  const hasCloudflare = CLOUDFLARE_HEADERS.some(h => response.headers.get(h) !== null);
  if (hasCloudflare && (response.status === 403 || response.status === 503)) {
    results.push({
      blocked: true,
      reason: 'cloudflare',
      confidence: 0.85,
      description: 'Cloudflare headers with block status',
    });
  }

  // Check Akamai headers
  const hasAkamai = AKAMAI_HEADERS.some(h => response.headers.get(h) !== null);
  if (hasAkamai && response.status === 403) {
    results.push({
      blocked: true,
      reason: 'akamai',
      confidence: 0.85,
      description: 'Akamai headers with 403 status',
    });
  }

  // Check DataDome headers
  const hasDataDome = DATADOME_HEADERS.some(h => response.headers.get(h) !== null);
  if (hasDataDome) {
    results.push({
      blocked: true,
      reason: 'datadome',
      confidence: 0.9,
      description: 'DataDome headers detected',
    });
  }

  // Check body patterns
  if (body) {
    // Skip if body is too large (likely real content)
    const checkBody = body.length < 100_000 ? body : body.slice(0, 100_000);

    for (const { pattern, reason, confidence, description } of BLOCK_PATTERNS) {
      if (pattern.test(checkBody)) {
        results.push({
          blocked: true,
          reason,
          confidence,
          description,
        });
      }
    }

    // Check for suspiciously small HTML with redirect
    if (
      body.length < 5000 &&
      response.status === 200 &&
      (/<meta\s+http-equiv=["']refresh/i.test(body) ||
        /window\.location|document\.location/i.test(body))
    ) {
      results.push({
        blocked: true,
        reason: 'waf',
        confidence: 0.65,
        description: 'Suspicious redirect page',
      });
    }
  }

  // No blocking detected
  if (results.length === 0) {
    return {
      blocked: false,
      confidence: 0,
    };
  }

  // Return the result with highest confidence
  results.sort((a, b) => b.confidence - a.confidence);
  return results[0];
}

/**
 * Check if a domain is known to use aggressive bot protection
 * (Can be used to preemptively use curl-impersonate)
 */
export function isProtectedDomain(hostname: string): boolean {
  const protectedPatterns = [
    /cloudflare/i,
    /\.gov$/i,
    /\.mil$/i,
    /linkedin\.com$/i,
    /twitter\.com$/i,
    /x\.com$/i,
    /instagram\.com$/i,
    /facebook\.com$/i,
    /amazon\./i,
    /google\./i,
    /microsoft\.com$/i,
    /apple\.com$/i,
    /netflix\.com$/i,
    /spotify\.com$/i,
  ];

  return protectedPatterns.some(p => p.test(hostname));
}

/**
 * Detect if response is a Cloudflare challenge page
 * More specific than general detectBlock for CF-specific handling
 */
export function isCloudflareChallenge(response: ResponseLike, body?: string): boolean {
  // Must have cf-ray header
  const cfRay = response.headers.get('cf-ray');
  if (!cfRay) return false;

  // Check status
  if (response.status !== 403 && response.status !== 503) return false;

  // Check body for challenge markers
  if (body) {
    return /checking your browser|just a moment|cf-browser-verification/i.test(body);
  }

  return false;
}

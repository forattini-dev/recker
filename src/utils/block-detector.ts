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

export interface CaptchaDetectionResult {
  /** Whether the response appears to be a CAPTCHA challenge */
  detected: boolean;
  /** Confidence score from 0 to 1 */
  confidence: number;
  /** Provider or family hint */
  provider?:
    | 'recaptcha'
    | 'hcaptcha'
    | 'turnstile'
    | 'funcaptcha'
    | 'datadome'
    | 'cloudflare'
    | 'generic';
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

const CAPTCHA_HEADERS = [
  'x-captcha',
  'x-captcha-result',
  'x-captcha-badge',
  'x-recaptcha',
  'x-hcaptcha',
  'x-cloudflare-challenge',
  'x-cf-challenge',
  'cf-challenge',
  'x-cf-chl-bypass',
  'cf-chl-bypass',
  'x-akamai-challenge',
  'akamai-challenge',
  'x-arkose',
  'x-arkoseapi-session-id',
  'x-detect-captcha',
  'x-perimeterx-request-id',
  'x-px-request-id',
  'x-px-config',
  'x-sucuri-id',
  'x-vercel-protection-id',
  'x-recaptcha-token',
  'x-turnstile',
  'x-hcaptcha-response',
  'x-px-action',
  'cf-chl-bot-score',
  'x-datadome-request-id',
  'x-cf-bot-score',
  'cf-bot-score',
  'x-akamai-bms-correlation-id',
  'x-akamai-edgescape',
  'x-akamai-request-id',
  'x-akamai-rid',
  'x-turnstile-score',
];

const CAPTCHA_REDIRECT_HINTS = [
  /httpservice\/retry\/enablejs/i,
  /\/cdn-cgi\/(?:challenge|challenge-platform|images|ray)\//i,
  /turnstile\/(?:v0|v3)\//i,
  /g-recaptcha|recaptcha\/api2/i,
  /hcaptcha\.com\/(?:1\/|verify)/i,
  /funcaptcha\.com|arkoselabs\.com|perimeterx\.com/i,
  /challenge[-_]platform/i,
  /cloudflare[-/]?(?:challenge|bot)|access denied|blocked/i,
  /challenge\.js|\bjschl_vc\b|\bjschl_answer\b/i,
];

const CAPTCHA_COOKIE_PATTERNS: Array<{
  pattern: RegExp;
  provider: CaptchaDetectionResult['provider'];
  confidence: number;
  description: string;
}> = [
  {
    pattern: /__cf_bm|cf_clearance/i,
    provider: 'cloudflare',
    confidence: 0.7,
    description: 'Cloudflare anti-bot cookie detected',
  },
  {
    pattern: /datadome/i,
    provider: 'datadome',
    confidence: 0.9,
    description: 'DataDome cookie detected',
  },
  {
    pattern: /_dd_s|_dd_nuid|dd_session|ak_bmsc|visid_incap|incap_ses_/i,
    provider: 'generic',
    confidence: 0.68,
    description: 'CAPTCHA/anti-bot anti-bot cookie detected',
  },
  {
    pattern: /cf_chl_|cf_clearance|cf_chl2/i,
    provider: 'cloudflare',
    confidence: 0.82,
    description: 'Cloudflare challenge cookie marker detected',
  },
];

const CAPTCHA_HEADER_PATTERNS: Array<{
  pattern: RegExp;
  provider: CaptchaDetectionResult['provider'];
  confidence: number;
  description: string;
  header: string;
}> = [
  {
    pattern: /cloudflare/i,
    provider: 'cloudflare',
    confidence: 0.45,
    description: 'Cloudflare server signature detected',
    header: 'server',
  },
  {
    pattern: /akamai/i,
    provider: 'generic',
    confidence: 0.38,
    description: 'Akamai server signature detected',
    header: 'server',
  },
  {
    pattern: /datadome/i,
    provider: 'datadome',
    confidence: 0.42,
    description: 'DataDome transport header signature detected',
    header: 'x-datadome',
  },
  {
    pattern: /perimeterx|px/i,
    provider: 'funcaptcha',
    confidence: 0.4,
    description: 'PerimeterX-like header signature detected',
    header: 'x-px-id',
  },
];

const CAPTCHA_FORM_PATTERNS: Array<{
  pattern: RegExp;
  provider: CaptchaDetectionResult['provider'];
  confidence: number;
  description: string;
}> = [
  {
    pattern: /<input[^>]+name=["']g-recaptcha-response["'][^>]*>/i,
    provider: 'recaptcha',
    confidence: 0.95,
    description: 'reCAPTCHA response field found',
  },
  {
    pattern: /<div[^>]+class=["'][^"']*g-recaptcha[^"']*["'][^>]*data-sitekey/i,
    provider: 'recaptcha',
    confidence: 0.85,
    description: 'reCAPTCHA widget marker found',
  },
  {
    pattern: /<input[^>]+name=["']hcaptcha-response["'][^>]*>/i,
    provider: 'hcaptcha',
    confidence: 0.95,
    description: 'hCaptcha response field found',
  },
  {
    pattern: /<div[^>]+class=["'][^"']*h-captcha[^"']*["'][^>]*data-sitekey/i,
    provider: 'hcaptcha',
    confidence: 0.85,
    description: 'hCaptcha widget marker found',
  },
  {
    pattern: /<input[^>]+name=["']cf-turnstile-response["'][^>]*>/i,
    provider: 'turnstile',
    confidence: 0.95,
    description: 'Cloudflare Turnstile response field found',
  },
  {
    pattern: /<input[^>]+name=["']turnstile_response["'][^>]*>/i,
    provider: 'turnstile',
    confidence: 0.88,
    description: 'Turnstile response field found',
  },
  {
    pattern: /data-.*captcha|name=["'][^"']*captcha[^"']*["'][^>]*>/i,
    provider: 'generic',
    confidence: 0.6,
    description: 'Generic captcha-related form field detected',
  },
  {
    pattern: /data-sitekey|data-site-key/i,
    provider: 'generic',
    confidence: 0.62,
    description: 'Captcha sitekey attribute detected',
  },
  {
    pattern: /id=["'][^"']*(?:cf-turnstile|hcaptcha|recaptcha|g-recaptcha|turnstile-response|cf-bm|cf_clearance)[^"']*["'][^>]*>/i,
    provider: 'generic',
    confidence: 0.7,
    description: 'Challenge-related DOM id detected',
  },
  {
    pattern: /aria-label=["'][^"']*(?:I am not a robot|human verification|verify you are human|bot protection|captcha)[^"']*["']/i,
    provider: 'generic',
    confidence: 0.55,
    description: 'Accessible challenge label detected',
  },
];

const CAPTCHA_SCRIPT_PATTERNS: Array<{
  pattern: RegExp;
  provider: CaptchaDetectionResult['provider'];
  confidence: number;
  description: string;
}> = [
  {
    pattern: /<script[^>]*src=["'][^"']*(?:gstatic\.com\/recaptcha|google\.com\/recaptcha|recaptcha\/api\.js)/i,
    provider: 'recaptcha',
    confidence: 0.95,
    description: 'reCAPTCHA script bundle detected',
  },
  {
    pattern: /grecaptcha\.render|grecaptcha\.execute|___grecaptcha_cfg|g-recaptcha|g-recaptcha-response/i,
    provider: 'recaptcha',
    confidence: 0.85,
    description: 'reCAPTCHA runtime marker detected',
  },
  {
    pattern: /<script[^>]*src=["'][^"']*hcaptcha\.com\/1\/api\.js/i,
    provider: 'hcaptcha',
    confidence: 0.95,
    description: 'hCaptcha script bundle detected',
  },
  {
    pattern: /hcaptcha\.render|h-captcha|hcaptcha-response/i,
    provider: 'hcaptcha',
    confidence: 0.8,
    description: 'hCaptcha runtime marker detected',
  },
  {
    pattern: /<script[^>]*src=["'][^"']*(?:challenges\.arkoselabs\.com|arkoselabs\.com\/\w+|funcaptcha\.com)/i,
    provider: 'funcaptcha',
    confidence: 0.9,
    description: 'FunCaptcha / Arkose script bundle detected',
  },
  {
    pattern: /arkose|funcaptcha|px-captcha|perimeterx|px\._init/i,
    provider: 'funcaptcha',
    confidence: 0.78,
    description: 'Anti-bot challenge script marker detected',
  },
  {
    pattern: /<script[^>]*src=["'][^"']*challenges\.cloudflare\.com\/turnstile/i,
    provider: 'turnstile',
    confidence: 0.95,
    description: 'Cloudflare Turnstile script bundle detected',
  },
  {
    pattern: /turnstile\.render|cf-turnstile-response|cf-turnstile/i,
    provider: 'turnstile',
    confidence: 0.8,
    description: 'Turnstile challenge marker detected',
  },
  {
    pattern: /__cf_chl_|cf_chl_2|cf_chl_prog|checking your browser/i,
    provider: 'cloudflare',
    confidence: 0.84,
    description: 'Cloudflare challenge JS marker detected',
  },
  {
    pattern: /challenges\.cloudflare\.com\/cdn-cgi\/challenge-platform\/|__cf_chl|chals\.cloudflare/i,
    provider: 'cloudflare',
    confidence: 0.9,
    description: 'Cloudflare challenge script bundle marker detected',
  },
  {
    pattern: /grecaptcha\.enterprise|recaptcha\/enterprise\.js|reCAPTCHA.*enterprise/i,
    provider: 'recaptcha',
    confidence: 0.88,
    description: 'reCAPTCHA Enterprise marker detected',
  },
  {
    pattern: /<script[^>]*src=["'][^"']*hcaptcha\.com\/[\w.-]+\/api\.js["'][^>]*>/i,
    provider: 'hcaptcha',
    confidence: 0.66,
    description: 'hCaptcha script bundle detected',
  },
  {
    pattern: /<script[^>]*src=["'][^"']*challenges\.perimeterx\.[^"']*["'][^>]*>/i,
    provider: 'funcaptcha',
    confidence: 0.72,
    description: 'PerimeterX challenge script detected',
  },
  {
    pattern: /<script[^>]*src=["'][^"']*recaptcha\/api\.js(\?.*)?/i,
    provider: 'recaptcha',
    confidence: 0.88,
    description: 'reCAPTCHA API entrypoint script detected',
  },
  {
    pattern: /<script[^>]*src=["'][^"']*hcaptcha\.com\/[\w\-.]+\/api\.js[\w\-.]*(\?.*)?/i,
    provider: 'hcaptcha',
    confidence: 0.85,
    description: 'hCaptcha API script detected',
  },
  {
    pattern: /<script[^>]*src=["'][^"']*challenges\.cloudflare\.com\/cdn-cgi\/challenge-platform[\w\-/%.?=&]*["'][^>]*>/i,
    provider: 'cloudflare',
    confidence: 0.9,
    description: 'Cloudflare challenge platform script bundle detected',
  },
];

const CAPTCHA_PATTERNS: Array<{ pattern: RegExp; provider: CaptchaDetectionResult['provider']; confidence: number; description: string }> = [
  {
    pattern: /httpservice\/retry\/enablejs/i,
    provider: 'generic',
    confidence: 0.86,
    description: 'Google JS challenge retry endpoint detected',
  },
  {
    pattern: /recaptcha|g-recaptcha|google\.com\/recaptcha/i,
    provider: 'recaptcha',
    confidence: 0.95,
    description: 'reCAPTCHA challenge detected',
  },
  {
    pattern: /hcaptcha|h-captcha/i,
    provider: 'hcaptcha',
    confidence: 0.9,
    description: 'hCaptcha challenge detected',
  },
  {
    pattern: /turnstile|cf-turnstile/i,
    provider: 'turnstile',
    confidence: 0.92,
    description: 'Cloudflare Turnstile challenge detected',
  },
  {
    pattern: /funcaptcha|arkose|arkoselabs|perimeterx|px-captcha|bot-management|human-verification/i,
    provider: 'funcaptcha',
    confidence: 0.9,
    description: 'Bot-management CAPTCHA challenge detected',
  },
  {
    pattern: /captcha|bot.*verification|human.*verification|verify you are human/i,
    provider: 'generic',
    confidence: 0.75,
    description: 'Generic CAPTCHA challenge detected',
  },
];

const CAPTCHA_DOM_MARKERS: Array<{
  pattern: RegExp;
  provider: CaptchaDetectionResult['provider'];
  confidence: number;
  description: string;
}> = [
  {
    pattern: /<title>[^<]*(just a moment|attention required|human verification|verify you are human|security check)[^<]*<\/title>/i,
    provider: 'cloudflare',
    confidence: 0.9,
    description: 'Challenge-like page title detected',
  },
  {
    pattern: /<body[^>]*class=["'][^"']*\b(cf-browser-verification|cf-stage|cf-im-under-attack|cf-nojs|cf-turnstile|hcaptcha|g-recaptcha|recaptcha)[^"']*\b[^"']*["'][^>]*>/i,
    provider: 'cloudflare',
    confidence: 0.7,
    description: 'Challenge-like body class/markup detected',
  },
  {
    pattern: /<iframe[^>]+src=["'][^"']*captcha|<iframe[^>]+src=["'][^"']*turnstile|window\.__cf_chl_|_cf_chl_|cf_chl_/i,
    provider: 'cloudflare',
    confidence: 0.75,
    description: 'Cloudflare challenge DOM marker detected',
  },
  {
    pattern: /id=["'][^"']*(captcha|challenge|hcaptcha|recaptcha|turnstile)[^"']*["'][^>]*>/i,
    provider: 'generic',
    confidence: 0.65,
    description: 'Generic challenge element id detected',
  },
  {
    pattern: /data-challenge|data-sitekey|aria-label=["'][^"']*(captcha|challenge|verify|human|bot)[^"']*["']/i,
    provider: 'generic',
    confidence: 0.6,
    description: 'Generic challenge markup attribute detected',
  },
];

const CAPTCHA_NOSCRIPT_PATTERNS: Array<{
  pattern: RegExp;
  provider: CaptchaDetectionResult['provider'];
  confidence: number;
  description: string;
}> = [
  {
    pattern: /<noscript>[\s\S]*?data-sitekey[\s\S]*?<\/noscript>/i,
    provider: 'recaptcha',
    confidence: 0.78,
    description: 'reCAPTCHA noscript fallback marker detected',
  },
  {
    pattern: /<noscript>[\s\S]*?turnstile[\s\S]*?<\/noscript>/i,
    provider: 'turnstile',
    confidence: 0.76,
    description: 'Turnstile noscript fallback marker detected',
  },
  {
    pattern: /<noscript>[\s\S]*?recaptcha[\s\S]*?<\/noscript>/i,
    provider: 'recaptcha',
    confidence: 0.7,
    description: 'reCAPTCHA noscript fallback marker detected',
  },
  {
    pattern: /httpservice\/retry\/enablejs/i,
    provider: 'generic',
    confidence: 0.7,
    description: 'Google JS challenge retry marker detected',
  },
];

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
    pattern: /access denied|reference #[\da-f]+/i,
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
    pattern: /captcha|recaptcha|hcaptcha|funcaptcha|arkose|human verification|please verify you.re human/i,
    reason: 'captcha',
    confidence: 0.9,
    description: 'CAPTCHA challenge required',
  },
  {
    pattern: /httpservice\/retry\/enablejs|enable javascript and cookies/i,
    reason: 'captcha',
    confidence: 0.92,
    description: 'Google browser challenge endpoint detected',
  },

  // Rate limiting
  {
    pattern: /too many requests|slow down|try again later|rate\s+limits?|rate\s+limited|rate\s+limiting/i,
    reason: 'rate-limit',
    confidence: 0.8,
    description: 'Rate limiting detected',
  },

  // Generic WAF
  {
    pattern: /(?:your request has been )?(?:blocked|denied|forbidden)|suspicious activity|security check required/i,
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
    // Some environments expose all-set-cookie as array, keep optional support for it.
    getAll?(name: string): string[] | undefined;
  };
}

type CaptchaMatch = {
  provider: CaptchaDetectionResult['provider'];
  confidence: number;
  description?: string;
};

function addMatch(matches: CaptchaMatch[], provider: CaptchaMatch['provider'], confidence: number, description: string): void {
  matches.push({
    provider,
    confidence,
    description,
  });
}

function scoreByProvider(matches: CaptchaMatch[]): CaptchaMatch {
  const providerScores = new Map<Exclude<CaptchaDetectionResult['provider'], undefined>, { score: number; descriptions: string[] }>();

  for (const match of matches) {
    if (!match.provider) continue;

    const current = providerScores.get(match.provider) ?? { score: 0, descriptions: [] };
    const addition = match.confidence * (1 - current.score);
    const updatedScore = current.score + addition;
    providerScores.set(match.provider, {
      score: Math.min(0.99, updatedScore),
      descriptions: [...current.descriptions, match.description ?? ''],
    });
  }

  const best = Array.from(providerScores.entries()).sort((a, b) => b[1].score - a[1].score)[0];
  if (!best) {
    return {
      provider: undefined,
      confidence: 0,
      description: undefined,
    };
  }

  return {
    provider: best[0],
    confidence: Math.round(best[1].score * 100) / 100,
    description: best[1].descriptions.slice(-3).join(' | '),
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
  const server = response.headers.get('server') || '';
  const location = response.headers.get('location');

  if (location && CAPTCHA_REDIRECT_HINTS.some((pattern) => pattern.test(location))) {
    results.push({
      blocked: true,
      reason: 'waf',
      confidence: 0.9,
      description: `Redirect to challenge endpoint (${location})`,
    });
  }

  if (location && response.status >= 300 && response.status < 400) {
    results.push({
      blocked: true,
      reason: 'waf',
      confidence: 0.35,
      description: 'HTTP redirect is often used for challenge interstitials',
    });
  }

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
  const hasCloudflare = CLOUDFLARE_HEADERS.some(h => response.headers.get(h) !== null)
    || /cloudflare/i.test(server);
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

  // Early exit for clean 200 responses with no suspicious headers and no body.
  // If status is 200, no block signals matched, no redirect, and no body to scan
  // — skip all expensive body regex scanning. This is the common case when
  // detectBlock is called for a quick header-only check.
  if (
    response.status === 200 &&
    results.length === 0 &&
    !location &&
    !body
  ) {
    return { blocked: false, confidence: 0 };
  }

  // Check body patterns
  if (body) {
    const isLongBody = body.length > 100_000;
    const checkBody = isLongBody ? body.slice(0, 30_000) : body;
    const challengeHint = /just a moment|attention required|access denied|checking your browser|security check|human verification|suspicious activity|captcha|recaptcha|hcaptcha|turnstile|datadome|cloudflare/i.test(checkBody.slice(0, 8000));

    for (const { pattern, reason, confidence, description } of BLOCK_PATTERNS) {
      if (isLongBody && response.status === 200 && confidence < 0.85 && !challengeHint) {
        continue;
      }

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

    if (CAPTCHA_REDIRECT_HINTS.some((pattern) => pattern.test(location ?? '')) && response.status === 200) {
      results.push({
        blocked: true,
        reason: 'captcha',
        confidence: 0.85,
        description: 'Challenge URL pattern detected in redirect location',
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
 * Detect if the response is a CAPTCHA challenge.
 */
export function detectCaptcha(response: ResponseLike, body?: string): CaptchaDetectionResult {
  const matches: CaptchaMatch[] = [];
  const location = response.headers.get('location');
  const server = response.headers.get('server') || '';

  for (const { header, pattern, provider, confidence, description } of CAPTCHA_HEADER_PATTERNS) {
    const value = response.headers.get(header);
    if (typeof value === 'string' && pattern.test(value)) {
      addMatch(matches, provider, confidence, `${description} (${header})`);
    }
  }

  const hasCaptchaHeader = CAPTCHA_HEADERS.some((header) => {
    const value = response.headers.get(header);
    const hasValue = typeof value === 'string' && value.length > 0;
    if (hasValue) {
      addMatch(matches, 'generic', 0.95, `CAPTCHA-related response header detected: ${header}`);
    }
    return hasValue;
  });

  // Cloudflare-specific quick checks
  if (response.status === 403 || response.status === 503) {
    const cfRay = response.headers.get('cf-ray');
    const cfRequestId = response.headers.get('cf-request-id');
    if (cfRay || cfRequestId) {
      addMatch(matches, 'cloudflare', 0.7, 'Cloudflare challenge headers detected');
    }
  }

  // Early exit: no header signals, clean status, and no body to scan.
  // When no CAPTCHA headers, no header pattern matches, a clean 2xx status,
  // no redirect, and no body provided — skip expensive body regex scanning.
  if (
    matches.length === 0 &&
    response.status >= 200 && response.status < 300 &&
    !location &&
    !body
  ) {
    return { detected: false, confidence: 0 };
  }

  if (body) {
    const checkBody = body.length < 120_000 ? body : body.slice(0, 120_000);
    const isTinyBody = checkBody.length > 0 && checkBody.length < 12000;
    const hasHtmlTags = /<html|<head|<body|<script|<meta/i.test(checkBody);
    const challengeTitleOrText = /just a moment|attention required|human verification|verify you are human|security check/i.test(checkBody);

    if (isTinyBody && challengeTitleOrText && hasHtmlTags) {
      addMatch(matches, 'generic', 0.6, 'Tiny HTML response with challenge-like text');
    }

    const setCookieHeader = response.headers.get('set-cookie') || '';
    const setCookieHeaders = response.headers.getAll?.('set-cookie') ?? [];
    const combinedCookieHeader = [setCookieHeader, ...setCookieHeaders].filter(Boolean).join('\n');

    for (const { pattern, provider, confidence, description } of CAPTCHA_COOKIE_PATTERNS) {
      if (pattern.test(combinedCookieHeader)) {
        addMatch(matches, provider, confidence, description);
      }
    }

    for (const { pattern, provider, confidence, description } of CAPTCHA_SCRIPT_PATTERNS) {
      if (pattern.test(checkBody)) {
        addMatch(matches, provider, confidence, description);
      }
    }

    for (const { pattern, provider, confidence, description } of CAPTCHA_FORM_PATTERNS) {
      if (pattern.test(checkBody)) {
        addMatch(matches, provider, confidence, description);
      }
    }

    for (const { pattern, provider, confidence, description } of CAPTCHA_DOM_MARKERS) {
      if (pattern.test(checkBody)) {
        addMatch(matches, provider, confidence, description);
      }
    }

    for (const { pattern, provider, confidence, description } of CAPTCHA_NOSCRIPT_PATTERNS) {
      if (pattern.test(checkBody)) {
        addMatch(matches, provider, confidence, description);
      }
    }

    if (response.status === 403 || response.status === 503) {
      addMatch(matches, 'generic', 0.35, 'Bot protection status with captcha-like response body');
    }

    if (location && CAPTCHA_REDIRECT_HINTS.some((pattern) => pattern.test(location))) {
      addMatch(matches, 'generic', 0.72, `Challenge redirect target detected (${location})`);
    }

    if (hasCaptchaHeader && response.status >= 300 && response.status < 500) {
      addMatch(matches, 'cloudflare', 0.68, 'Challenge-related headers with status response');
    }

    if (/cloudflare/i.test(server)) {
      addMatch(matches, 'cloudflare', 0.45, 'Cloudflare server signature detected');
    }

    if (
      response.status >= 300 &&
      response.status < 400 &&
      /refresh|challenge|verify|captcha|javascript challenge|cloudflare|bot/i.test((location || ''))
    ) {
      addMatch(matches, 'generic', 0.67, 'Redirect location indicates bot challenge flow');
    }

    if (/<script[^>]*src=["'][^"']*(?:challenges\.cloudflare\.com|recaptcha\/api\.js|hcaptcha\.com\/1\/api\.js|challenges\.perimeterx\.)[^"']*["'][^>]*>/i.test(checkBody.slice(0, 120_000))) {
      addMatch(matches, 'cloudflare', 0.6, 'Known challenge script reference found in HTML');
    }

    if (
      (response.status >= 500 && response.status < 600) &&
      /cloudflare|challenge|verification|blocked|security/i.test(checkBody.slice(0, 3000))
    ) {
      addMatch(matches, 'generic', 0.2, 'Server challenge-like text on error response');
    }

    for (const { pattern, provider, confidence, description } of CAPTCHA_PATTERNS) {
      if (pattern.test(checkBody)) {
        addMatch(matches, provider, confidence, description);
      }
    }
  }

  const result = scoreByProvider(matches);
  if (result.confidence >= 0.5 || hasCaptchaHeader) {
    return {
      detected: true,
      confidence: result.confidence,
      provider: result.provider,
      description: result.description,
    };
  }

  return {
    detected: false,
    confidence: 0,
  };
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

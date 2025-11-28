/**
 * Header parsing utilities
 * Extracts useful information from response headers
 */

export interface CacheInfo {
  hit: boolean;
  status?: 'HIT' | 'MISS' | 'EXPIRED' | 'STALE' | 'BYPASS' | 'REVALIDATED';
  age?: number; // Cache age in seconds
  maxAge?: number; // Max age in seconds
  provider?: 'cloudflare' | 'fastly' | 'akamai' | 'cloudfront' | 'nginx' | 'varnish' | 'unknown';
}

export interface PlatformInfo {
  /** Detected provider name (e.g., 'cloudflare', 'aws-cloudfront', 'nginx') */
  provider?: string;

  /** Provider category */
  category?: 'cdn' | 'cloud' | 'hosting' | 'server' | 'proxy' | 'security' | 'framework' | 'unknown';

  /** Edge location, datacenter, or region */
  region?: string;

  /** Server software detected from headers */
  server?: string;

  /** Provider-specific metadata */
  metadata?: {
    /** Cloudflare Ray ID */
    ray?: string;

    /** Request/trace ID (AWS, GCP, Azure, etc) */
    requestId?: string;

    /** Point of presence */
    pop?: string;

    /** Cache ID (Akamai, etc) */
    cacheId?: string;

    /** Trace ID */
    traceId?: string;

    /** Allow any additional provider-specific fields */
    [key: string]: string | number | boolean | undefined;
  };
}

export interface RateLimitInfo {
  limited: boolean;
  limit?: number; // Total limit
  remaining?: number; // Requests remaining
  reset?: Date; // When limit resets
  retryAfter?: number; // Seconds to wait before retry
  policy?: string; // Rate limit policy (if provided)
}

/**
 * Parse cache-related headers
 */
export function parseCacheInfo(headers: Headers): CacheInfo {
  const info: CacheInfo = { hit: false };

  // Cloudflare cache status
  const cfCacheStatus = headers.get('cf-cache-status');
  if (cfCacheStatus) {
    info.provider = 'cloudflare';
    info.status = cfCacheStatus.toUpperCase() as CacheInfo['status'];
    info.hit = cfCacheStatus.toUpperCase() === 'HIT';
  }

  // Generic X-Cache header (Fastly, Varnish, etc.)
  const xCache = headers.get('x-cache');
  if (xCache) {
    const upper = xCache.toUpperCase();
    info.hit = upper.includes('HIT');
    if (upper.includes('FASTLY')) info.provider = 'fastly';
    else if (upper.includes('VARNISH')) info.provider = 'varnish';
    
    if (upper.includes('HIT')) info.status = 'HIT';
    else if (upper.includes('MISS')) info.status = 'MISS';
    else if (upper.includes('EXPIRED')) info.status = 'EXPIRED';
    else if (upper.includes('STALE')) info.status = 'STALE';
  }

  // Akamai cache
  const akamaiCache = headers.get('x-akamai-cache-status');
  if (akamaiCache) {
    info.provider = 'akamai';
    info.hit = akamaiCache.toUpperCase().includes('HIT');
  }

  // CloudFront cache
  const cloudFrontCache = headers.get('x-cache');
  const cloudFrontId = headers.get('x-amz-cf-id');
  if (cloudFrontId) {
    info.provider = 'cloudfront';
  }

  // Parse Cache-Control for max-age
  const cacheControl = headers.get('cache-control');
  if (cacheControl) {
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
    if (maxAgeMatch) {
      info.maxAge = parseInt(maxAgeMatch[1], 10);
    }
  }

  // Parse Age header
  const age = headers.get('age');
  if (age) {
    info.age = parseInt(age, 10);
  }

  return info;
}

/**
 * Platform detection patterns
 * Extensible list of known providers and their detection logic
 */

interface DetectorExtract {
  region?: string;
  server?: string;
  metadata?: Record<string, any>;
}

const PLATFORM_DETECTORS = [
  // CDNs
  {
    name: 'cloudflare',
    category: 'cdn' as const,
    headers: ['cf-ray', 'cf-cache-status'],
    detect: (headers: Headers) => headers.get('cf-ray') !== null,
    extract: (headers: Headers): DetectorExtract => {
      const ray = headers.get('cf-ray');
      const metadata: Record<string, any> = {};
      if (ray) {
        metadata.ray = ray;
        const parts = ray.split('-');
        if (parts.length > 1) {
          return { region: parts[1], metadata };
        }
      }
      return { metadata };
    }
  },
  {
    name: 'fastly',
    category: 'cdn' as const,
    headers: ['fastly-debug-digest', 'x-served-by'],
    detect: (headers: Headers) => {
      const servedBy = headers.get('x-served-by');
      return servedBy?.includes('cache-') || headers.get('fastly-debug-digest') !== null;
    },
    extract: (headers: Headers): DetectorExtract => ({
      server: headers.get('x-served-by') || undefined,
      metadata: {
        digest: headers.get('fastly-debug-digest')
      }
    })
  },
  {
    name: 'akamai',
    category: 'cdn' as const,
    headers: ['x-akamai-request-id', 'x-akamai-cache-status'],
    detect: (headers: Headers) => headers.get('x-akamai-request-id') !== null,
    extract: (headers: Headers): DetectorExtract => ({
      metadata: {
        requestId: headers.get('x-akamai-request-id'),
        cacheId: headers.get('x-akamai-cache-status')
      }
    })
  },

  // Cloud Providers
  {
    name: 'aws-cloudfront',
    category: 'cloud' as const,
    headers: ['x-amz-cf-id', 'x-amz-cf-pop'],
    detect: (headers: Headers) => headers.get('x-amz-cf-id') !== null,
    extract: (headers: Headers): DetectorExtract => ({
      region: headers.get('x-amz-cf-pop') || undefined,
      metadata: {
        requestId: headers.get('x-amz-cf-id'),
        pop: headers.get('x-amz-cf-pop')
      }
    })
  },
  {
    name: 'gcp',
    category: 'cloud' as const,
    headers: ['x-cloud-trace-context', 'x-goog-request-id'],
    detect: (headers: Headers) => headers.get('x-cloud-trace-context') !== null || headers.get('x-goog-request-id') !== null,
    extract: (headers: Headers): DetectorExtract => {
      const trace = headers.get('x-cloud-trace-context');
      return {
        metadata: {
          traceId: trace ? trace.split('/')[0] : undefined,
          requestId: headers.get('x-goog-request-id')
        }
      };
    }
  },
  {
    name: 'azure',
    category: 'cloud' as const,
    headers: ['x-ms-request-id', 'x-azure-ref'],
    detect: (headers: Headers) => headers.get('x-ms-request-id') !== null,
    extract: (headers: Headers): DetectorExtract => ({
      metadata: {
        requestId: headers.get('x-ms-request-id'),
        ref: headers.get('x-azure-ref')
      }
    })
  },
  {
    name: 'oracle-cloud',
    category: 'cloud' as const,
    headers: ['x-oracle-dms-rid', 'x-oracle-dms-ecid'],
    detect: (headers: Headers) => headers.get('x-oracle-dms-rid') !== null,
    extract: (headers: Headers): DetectorExtract => ({
      metadata: {
        requestId: headers.get('x-oracle-dms-rid'),
        ecid: headers.get('x-oracle-dms-ecid')
      }
    })
  },
  {
    name: 'alibaba-cloud',
    category: 'cloud' as const,
    headers: ['ali-swift-global-savetime', 'eagleeye-traceid'],
    detect: (headers: Headers) => headers.get('eagleeye-traceid') !== null,
    extract: (headers: Headers): DetectorExtract => ({
      metadata: {
        traceId: headers.get('eagleeye-traceid')
      }
    })
  },

  // Hosting Platforms
  {
    name: 'vercel',
    category: 'hosting' as const,
    headers: ['x-vercel-id', 'x-vercel-cache'],
    detect: (headers: Headers) => headers.get('x-vercel-id') !== null,
    extract: (headers: Headers): DetectorExtract => ({
      metadata: {
        requestId: headers.get('x-vercel-id'),
        cache: headers.get('x-vercel-cache')
      }
    })
  },
  {
    name: 'netlify',
    category: 'hosting' as const,
    headers: ['x-nf-request-id', 'x-nf-trace-id'],
    detect: (headers: Headers) => headers.get('x-nf-request-id') !== null,
    extract: (headers: Headers): DetectorExtract => ({
      metadata: {
        requestId: headers.get('x-nf-request-id'),
        traceId: headers.get('x-nf-trace-id')
      }
    })
  },
  {
    name: 'render',
    category: 'hosting' as const,
    headers: ['x-render-origin-server'],
    detect: (headers: Headers) => headers.get('x-render-origin-server') !== null,
    extract: (headers: Headers): DetectorExtract => ({
      metadata: {
        origin: headers.get('x-render-origin-server')
      }
    })
  },

  // Security & WAFs
  {
    name: 'datadome',
    category: 'security' as const,
    headers: ['x-datadome', 'x-datadome-cid'],
    detect: (headers: Headers) => headers.get('x-datadome') !== null || headers.get('x-datadome-cid') !== null,
    extract: (headers: Headers): DetectorExtract => ({
      metadata: { cid: headers.get('x-datadome-cid') }
    })
  },
  {
    name: 'incapsula',
    category: 'security' as const,
    headers: ['x-iinfo', 'x-cdn'],
    detect: (headers: Headers) => headers.get('x-iinfo') !== null || (headers.get('x-cdn') || '').includes('Incapsula'),
    extract: (headers: Headers): DetectorExtract => ({
      metadata: { iinfo: headers.get('x-iinfo') }
    })
  },
  {
    name: 'imperva',
    category: 'security' as const,
    headers: ['x-imperva-uuid'],
    detect: (headers: Headers) => headers.get('x-imperva-uuid') !== null,
    extract: (headers: Headers): DetectorExtract => ({
      metadata: { uuid: headers.get('x-imperva-uuid') }
    })
  },
  {
    name: 'aws-waf',
    category: 'security' as const,
    headers: ['x-amzn-waf-action'], // Often stripped, but sometimes present
    detect: (headers: Headers) => headers.get('server') === 'awselb/2.0', // Heuristic
    extract: (headers: Headers): DetectorExtract => ({})
  },

  // Load Balancers & Servers
  {
    name: 'envoy',
    category: 'proxy' as const,
    headers: ['x-envoy-upstream-service-time'],
    detect: (headers: Headers) => headers.get('x-envoy-upstream-service-time') !== null || headers.get('server') === 'envoy',
    extract: (headers: Headers): DetectorExtract => ({})
  },
  {
    name: 'traefik',
    category: 'proxy' as const,
    headers: [],
    detect: (headers: Headers) => (headers.get('server') || '').toLowerCase().includes('traefik'),
    extract: (headers: Headers): DetectorExtract => ({})
  },
  {
    name: 'caddy',
    category: 'server' as const,
    headers: [],
    detect: (headers: Headers) => (headers.get('server') || '').toLowerCase().includes('caddy'),
    extract: (headers: Headers): DetectorExtract => ({})
  },
  {
    name: 'haproxy',
    category: 'proxy' as const,
    headers: [],
    detect: (headers: Headers) => (headers.get('server') || '').toLowerCase().includes('haproxy'),
    extract: (headers: Headers): DetectorExtract => ({})
  },
  {
    name: 'iis',
    category: 'server' as const,
    headers: ['x-powered-by'],
    detect: (headers: Headers) => (headers.get('server') || '').toLowerCase().includes('iis'),
    extract: (headers: Headers): DetectorExtract => ({})
  },
  {
    name: 'kestrel',
    category: 'server' as const,
    headers: [],
    detect: (headers: Headers) => (headers.get('server') || '').toLowerCase().includes('kestrel'),
    extract: (headers: Headers): DetectorExtract => ({})
  },

  // Frameworks
  {
    name: 'express',
    category: 'framework' as const,
    headers: ['x-powered-by'],
    detect: (headers: Headers) => (headers.get('x-powered-by') || '').toLowerCase().includes('express'),
    extract: (headers: Headers): DetectorExtract => ({})
  },
  {
    name: 'rails',
    category: 'framework' as const,
    headers: ['x-runtime', 'x-request-id'],
    detect: (headers: Headers) => headers.get('x-runtime') !== null && !(headers.get('x-powered-by') || '').includes('Express'),
    extract: (headers: Headers): DetectorExtract => ({
      metadata: { runtime: headers.get('x-runtime') }
    })
  },
  {
    name: 'django',
    category: 'framework' as const,
    headers: [],
    detect: (headers: Headers) => (headers.get('server') || '').toLowerCase().includes('wsgi'),
    extract: (headers: Headers): DetectorExtract => ({})
  },
  {
    name: 'aspnet',
    category: 'framework' as const,
    headers: ['x-aspnet-version', 'x-powered-by'],
    detect: (headers: Headers) => headers.get('x-aspnet-version') !== null || (headers.get('x-powered-by') || '').includes('ASP.NET'),
    extract: (headers: Headers): DetectorExtract => ({
      metadata: { version: headers.get('x-aspnet-version') }
    })
  },
  {
    name: 'php',
    category: 'framework' as const,
    headers: ['x-powered-by'],
    detect: (headers: Headers) => (headers.get('x-powered-by') || '').toLowerCase().includes('php'),
    extract: (headers: Headers): DetectorExtract => ({
      metadata: { version: headers.get('x-powered-by') }
    })
  }
];

/**
 * Detect platform/provider from response headers
 */
export function parsePlatformInfo(headers: Headers): PlatformInfo {
  const info: PlatformInfo = {
    metadata: {}
  };

  // Try specific detectors first
  for (const detector of PLATFORM_DETECTORS) {
    if (detector.detect(headers)) {
      info.provider = detector.name;
      info.category = detector.category;

      // Extract provider-specific data
      const extracted = detector.extract(headers);
      if (extracted.region) info.region = extracted.region;
      if (extracted.server) info.server = extracted.server;
      if (extracted.metadata) {
        Object.assign(info.metadata!, extracted.metadata);
      }

      break;
    }
  }

  // Fallback: detect from Server header
  if (!info.provider) {
    const server = headers.get('server');
    if (server) {
      info.server = server;
      const serverLower = server.toLowerCase();

      // Try to identify provider from server header
      if (serverLower.includes('cloudflare')) {
        info.provider = 'cloudflare';
        info.category = 'cdn';
      } else if (serverLower.includes('cloudfront')) {
        info.provider = 'aws-cloudfront';
        info.category = 'cloud';
      } else if (serverLower.includes('fastly')) {
        info.provider = 'fastly';
        info.category = 'cdn';
      } else if (serverLower.includes('akamai')) {
        info.provider = 'akamai';
        info.category = 'cdn';
      } else if (serverLower.includes('nginx')) {
        info.provider = 'nginx';
        info.category = 'server';
      } else if (serverLower.includes('apache')) {
        info.provider = 'apache';
        info.category = 'server';
      } else if (serverLower.includes('varnish')) {
        info.provider = 'varnish';
        info.category = 'proxy';
      } else {
        info.provider = 'unknown';
        info.category = 'unknown';
      }
    }
  }

  // Additional fallback: Via header
  if (!info.provider) {
    const via = headers.get('via');
    if (via) {
      const viaLower = via.toLowerCase();
      if (viaLower.includes('cloudflare')) {
        info.provider = 'cloudflare';
        info.category = 'cdn';
      } else if (viaLower.includes('akamai')) {
        info.provider = 'akamai';
        info.category = 'cdn';
      } else if (viaLower.includes('varnish')) {
        info.provider = 'varnish';
        info.category = 'proxy';
      } else if (viaLower.includes('squid')) {
        info.provider = 'squid';
        info.category = 'proxy';
      }
    }
  }

  // Clean up empty metadata
  if (Object.keys(info.metadata || {}).length === 0) {
    delete info.metadata;
  }

  return info;
}

/**
 * Parse rate limit headers
 */
export function parseRateLimitInfo(headers: Headers, status: number): RateLimitInfo {
  const info: RateLimitInfo = { limited: status === 429 };

  // Standard rate limit headers (GitHub, Twitter style)
  const limit = headers.get('x-ratelimit-limit') || headers.get('ratelimit-limit');
  const remaining = headers.get('x-ratelimit-remaining') || headers.get('ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset') || headers.get('ratelimit-reset');
  
  if (limit) info.limit = parseInt(limit, 10);
  if (remaining) info.remaining = parseInt(remaining, 10);
  if (reset) {
    const resetValue = parseInt(reset, 10);
    // Could be Unix timestamp or seconds from now
    if (resetValue > 1000000000) {
      info.reset = new Date(resetValue * 1000);
    } else {
      info.reset = new Date(Date.now() + resetValue * 1000);
    }
  }

  // Retry-After header (for 429 or 503)
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    // Can be seconds or HTTP date
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      info.retryAfter = seconds;
    } else {
      // Try parsing as date
      const retryDate = new Date(retryAfter);
      if (!isNaN(retryDate.getTime())) {
        info.retryAfter = Math.ceil((retryDate.getTime() - Date.now()) / 1000);
      }
    }
  }

  // RateLimit-Policy header (IETF draft standard)
  const policy = headers.get('ratelimit-policy');
  if (policy) {
    info.policy = policy;
  }

  // Check if we're being rate limited based on remaining
  if (info.remaining !== undefined && info.remaining === 0) {
    info.limited = true;
  }

  return info;
}

/**
 * Compression information
 */
export interface CompressionInfo {
  encoding?: 'gzip' | 'br' | 'deflate' | 'compress' | 'identity' | string;
  originalSize?: number;
  compressedSize?: number;
  ratio?: number;
}

/**
 * Parse compression headers
 */
export function parseCompressionInfo(headers: Headers): CompressionInfo {
  const info: CompressionInfo = {};

  // Content encoding
  const encoding = headers.get('content-encoding');
  if (encoding) {
    info.encoding = encoding.toLowerCase();
  }

  // Original size (some CDNs provide this)
  const xOriginalSize = headers.get('x-original-size') || headers.get('x-uncompressed-size');
  if (xOriginalSize) {
    info.originalSize = parseInt(xOriginalSize, 10);
  }

  // Compressed size
  const contentLength = headers.get('content-length');
  if (contentLength) {
    info.compressedSize = parseInt(contentLength, 10);
  }

  // Calculate compression ratio if both sizes available
  if (info.originalSize && info.compressedSize) {
    info.ratio = info.originalSize / info.compressedSize;
  }

  return info;
}

/**
 * Content Security Policy information
 */
export interface CSPInfo {
  policy?: string;
  directives: Record<string, string[]>;
  reportOnly: boolean;
}

/**
 * Parse CSP headers
 */
export function parseCSPInfo(headers: Headers): CSPInfo {
  const info: CSPInfo = {
    directives: {},
    reportOnly: false
  };

  // Check for CSP header (enforcing)
  let cspHeader = headers.get('content-security-policy');
  if (!cspHeader) {
    // Check for report-only version
    cspHeader = headers.get('content-security-policy-report-only');
    if (cspHeader) {
      info.reportOnly = true;
    }
  }

  if (cspHeader) {
    info.policy = cspHeader;

    // Parse directives
    const directives = cspHeader.split(';').map(d => d.trim()).filter(Boolean);

    for (const directive of directives) {
      const [name, ...values] = directive.split(/\s+/);
      if (name) {
        info.directives[name] = values;
      }
    }
  }

  return info;
}

/**
 * Content type information
 */
export interface ContentTypeInfo {
  mediaType?: string;
  charset?: string;
  boundary?: string;
  type?: string;
  subtype?: string;
}

/**
 * Parse Content-Type header
 */
export function parseContentType(headers: Headers): ContentTypeInfo {
  const info: ContentTypeInfo = {};

  const contentType = headers.get('content-type');
  if (!contentType) return info;

  // Split by semicolon to get media type and parameters
  const parts = contentType.split(';').map(p => p.trim());

  if (parts[0]) {
    info.mediaType = parts[0];

    // Parse type/subtype
    const [type, subtype] = parts[0].split('/');
    if (type) info.type = type;
    if (subtype) info.subtype = subtype;
  }

  // Parse parameters
  for (let i = 1; i < parts.length; i++) {
    const param = parts[i];
    const [key, value] = param.split('=').map(s => s.trim());

    if (key === 'charset' && value) {
      info.charset = value.replace(/['"]/g, '');
    } else if (key === 'boundary' && value) {
      info.boundary = value.replace(/['"]/g, '');
    }
  }

  return info;
}

/**
 * Accept headers information
 */
export interface AcceptInfo {
  types: Array<{
    mediaType: string;
    q: number;
    type?: string;
    subtype?: string;
  }>;
  encodings: Array<{
    encoding: string;
    q: number;
  }>;
  languages: Array<{
    language: string;
    q: number;
  }>;
}

/**
 * Parse Accept-* headers
 */
export function parseAcceptInfo(headers: Headers): AcceptInfo {
  const info: AcceptInfo = {
    types: [],
    encodings: [],
    languages: []
  };

  // Parse Accept header
  const accept = headers.get('accept');
  if (accept) {
    const types = accept.split(',').map(t => t.trim());

    for (const typeStr of types) {
      const [mediaType, ...params] = typeStr.split(';').map(s => s.trim());
      let q = 1.0;

      // Extract q parameter
      for (const param of params) {
        if (param.startsWith('q=')) {
          q = parseFloat(param.substring(2)) || 1.0;
        }
      }

      const [type, subtype] = mediaType.split('/');

      info.types.push({
        mediaType,
        q,
        type: type || undefined,
        subtype: subtype || undefined
      });
    }

    // Sort by quality value (descending)
    info.types.sort((a, b) => b.q - a.q);
  }

  // Parse Accept-Encoding header
  const acceptEncoding = headers.get('accept-encoding');
  if (acceptEncoding) {
    const encodings = acceptEncoding.split(',').map(e => e.trim());

    for (const encodingStr of encodings) {
      const [encoding, ...params] = encodingStr.split(';').map(s => s.trim());
      let q = 1.0;

      for (const param of params) {
        if (param.startsWith('q=')) {
          q = parseFloat(param.substring(2)) || 1.0;
        }
      }

      info.encodings.push({ encoding, q });
    }

    info.encodings.sort((a, b) => b.q - a.q);
  }

  // Parse Accept-Language header
  const acceptLanguage = headers.get('accept-language');
  if (acceptLanguage) {
    const languages = acceptLanguage.split(',').map(l => l.trim());

    for (const languageStr of languages) {
      const [language, ...params] = languageStr.split(';').map(s => s.trim());
      let q = 1.0;

      for (const param of params) {
        if (param.startsWith('q=')) {
          q = parseFloat(param.substring(2)) || 1.0;
        }
      }

      info.languages.push({ language, q });
    }

    info.languages.sort((a, b) => b.q - a.q);
  }

  return info;
}

export interface AuthInfo {
  methods: string[]; // Basic, Bearer, Digest, Negotiate
  realm?: string;
  error?: string;
  errorDescription?: string;
}

export function parseAuthInfo(headers: Headers): AuthInfo {
  const info: AuthInfo = { methods: [] };
  const wwwAuth = headers.get('www-authenticate');
  
  if (wwwAuth) {
    if (wwwAuth.toLowerCase().includes('basic')) info.methods.push('Basic');
    if (wwwAuth.toLowerCase().includes('bearer')) info.methods.push('Bearer');
    if (wwwAuth.toLowerCase().includes('digest')) info.methods.push('Digest');
    if (wwwAuth.toLowerCase().includes('negotiate')) info.methods.push('Negotiate');
    if (wwwAuth.toLowerCase().includes('aws4-hmac-sha256')) info.methods.push('AWS4');

    const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
    if (realmMatch) info.realm = realmMatch[1];
    
    const errorMatch = wwwAuth.match(/error="([^"]+)"/);
    if (errorMatch) info.error = errorMatch[1];

    const descMatch = wwwAuth.match(/error_description="([^"]+)"/);
    if (descMatch) info.errorDescription = descMatch[1];
  }

  // Check custom auth error headers
  const xAuthError = headers.get('x-auth-error') || headers.get('x-authentication-error');
  if (xAuthError) {
      if (!info.error) info.error = xAuthError;
  }

  return info;
}

export interface ClockSkewInfo {
  serverTime?: Date;
  skewMs?: number; // Difference (Server - Client)
}

export function parseClockSkew(headers: Headers): ClockSkewInfo {
  const dateHeader = headers.get('date');
  if (!dateHeader) return {};

  const serverTime = new Date(dateHeader);
  if (isNaN(serverTime.getTime())) return {};

  // Calculate skew (Server - Local)
  // Positive means server is ahead (in future)
  const skewMs = serverTime.getTime() - Date.now();

  return { serverTime, skewMs };
}

/**
 * Convenience function to parse all header info at once
 */
export interface HeaderInfo {
  cache: CacheInfo;
  platform: PlatformInfo;
  rateLimit: RateLimitInfo;
  compression: CompressionInfo;
  csp: CSPInfo;
  contentType: ContentTypeInfo;
  accept: AcceptInfo;
  auth: AuthInfo;
  clockSkew: ClockSkewInfo;
}

export function parseHeaders(headers: Headers, status: number): HeaderInfo {
  return {
    cache: parseCacheInfo(headers),
    platform: parsePlatformInfo(headers),
    rateLimit: parseRateLimitInfo(headers, status),
    compression: parseCompressionInfo(headers),
    csp: parseCSPInfo(headers),
    contentType: parseContentType(headers),
    accept: parseAcceptInfo(headers),
    auth: parseAuthInfo(headers),
    clockSkew: parseClockSkew(headers)
  };
}

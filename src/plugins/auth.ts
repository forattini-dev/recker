/**
 * Authentication Plugins
 * Provides various authentication mechanisms as middleware
 */

import { Middleware, Plugin, ReckerRequest } from '../types/index.js';
import { createHash, randomBytes } from 'node:crypto';

// ============================================================================
// Basic Authentication
// ============================================================================

export interface BasicAuthOptions {
  username: string;
  password: string;
}

/**
 * Basic Authentication Middleware
 * Adds Authorization header with Base64 encoded credentials
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   baseUrl: 'https://api.example.com',
 * });
 * client.use(basicAuth({ username: 'user', password: 'pass' }));
 * ```
 */
export function basicAuth(options: BasicAuthOptions): Middleware {
  const credentials = Buffer.from(`${options.username}:${options.password}`).toString('base64');
  const authHeader = `Basic ${credentials}`;

  return async (req, next) => {
    const newReq = req.withHeader('Authorization', authHeader);
    return next(newReq);
  };
}

/**
 * Basic Authentication Plugin
 */
export function basicAuthPlugin(options: BasicAuthOptions): Plugin {
  return (client) => {
    client.use(basicAuth(options));
  };
}

// ============================================================================
// Bearer Token Authentication
// ============================================================================

export interface BearerAuthOptions {
  /**
   * Bearer token (static or dynamic)
   */
  token: string | (() => string | Promise<string>);

  /**
   * Token type (default: 'Bearer')
   */
  type?: string;

  /**
   * Header name (default: 'Authorization')
   */
  headerName?: string;
}

/**
 * Bearer Token Authentication Middleware
 * Supports both static tokens and dynamic token providers
 *
 * @example
 * ```typescript
 * // Static token
 * client.use(bearerAuth({ token: 'my-api-key' }));
 *
 * // Dynamic token (refreshed on each request)
 * client.use(bearerAuth({
 *   token: async () => await getAccessToken()
 * }));
 * ```
 */
export function bearerAuth(options: BearerAuthOptions): Middleware {
  const type = options.type ?? 'Bearer';
  const headerName = options.headerName ?? 'Authorization';

  return async (req, next) => {
    const token = typeof options.token === 'function'
      ? await options.token()
      : options.token;

    const authHeader = `${type} ${token}`;
    const newReq = req.withHeader(headerName, authHeader);
    return next(newReq);
  };
}

/**
 * Bearer Token Authentication Plugin
 */
export function bearerAuthPlugin(options: BearerAuthOptions): Plugin {
  return (client) => {
    client.use(bearerAuth(options));
  };
}

// ============================================================================
// API Key Authentication
// ============================================================================

export interface ApiKeyAuthOptions {
  /**
   * API key value
   */
  key: string | (() => string | Promise<string>);

  /**
   * Where to send the key: 'header' or 'query'
   * @default 'header'
   */
  in?: 'header' | 'query';

  /**
   * Name of the header or query parameter
   * @default 'X-API-Key'
   */
  name?: string;
}

/**
 * API Key Authentication Middleware
 * Sends API key in header or query parameter
 *
 * @example
 * ```typescript
 * // In header (default)
 * client.use(apiKeyAuth({ key: 'my-api-key' }));
 *
 * // In query parameter
 * client.use(apiKeyAuth({
 *   key: 'my-api-key',
 *   in: 'query',
 *   name: 'api_key'
 * }));
 * ```
 */
export function apiKeyAuth(options: ApiKeyAuthOptions): Middleware {
  const location = options.in ?? 'header';
  const name = options.name ?? 'X-API-Key';

  return async (req, next) => {
    const key = typeof options.key === 'function'
      ? await options.key()
      : options.key;

    if (location === 'header') {
      const newReq = req.withHeader(name, key);
      return next(newReq);
    } else {
      // Append to query string
      const url = new URL(req.url);
      url.searchParams.set(name, key);

      // Create new request with updated URL
      const newReq = {
        ...req,
        url: url.toString(),
      } as ReckerRequest;

      return next(newReq);
    }
  };
}

/**
 * API Key Authentication Plugin
 */
export function apiKeyAuthPlugin(options: ApiKeyAuthOptions): Plugin {
  return (client) => {
    client.use(apiKeyAuth(options));
  };
}

// ============================================================================
// Digest Authentication (RFC 7616)
// ============================================================================

export interface DigestAuthOptions {
  username: string;
  password: string;
  /**
   * Whether to preemptively send digest auth
   * @default false (wait for 401 challenge)
   */
  preemptive?: boolean;
}

interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
  stale?: boolean;
}

/**
 * Parse WWW-Authenticate header for Digest challenge
 */
function parseDigestChallenge(header: string): DigestChallenge | null {
  if (!header.toLowerCase().startsWith('digest ')) {
    return null;
  }

  const params: Record<string, string> = {};
  const regex = /(\w+)=(?:"([^"]+)"|([^\s,]+))/g;
  let match;

  while ((match = regex.exec(header)) !== null) {
    params[match[1].toLowerCase()] = match[2] || match[3];
  }

  if (!params.realm || !params.nonce) {
    return null;
  }

  return {
    realm: params.realm,
    nonce: params.nonce,
    qop: params.qop,
    opaque: params.opaque,
    algorithm: params.algorithm,
    stale: params.stale === 'true',
  };
}

/**
 * Compute MD5 hash (used in Digest auth)
 */
function md5(str: string): string {
  return createHash('md5').update(str).digest('hex');
}

/**
 * Compute SHA-256 hash (for SHA-256 algorithm)
 */
function sha256(str: string): string {
  return createHash('sha256').update(str).digest('hex');
}

/**
 * Generate Digest Authorization header
 */
function generateDigestHeader(
  method: string,
  uri: string,
  username: string,
  password: string,
  challenge: DigestChallenge,
  nc: number
): string {
  const algorithm = challenge.algorithm?.toUpperCase() || 'MD5';
  const hashFn = algorithm.includes('SHA-256') ? sha256 : md5;

  // Generate cnonce for qop
  const cnonce = randomBytes(8).toString('hex');
  const ncStr = nc.toString(16).padStart(8, '0');

  // Compute HA1
  let ha1 = hashFn(`${username}:${challenge.realm}:${password}`);

  // For MD5-sess or SHA-256-sess, hash again with nonce and cnonce
  if (algorithm.endsWith('-SESS')) {
    ha1 = hashFn(`${ha1}:${challenge.nonce}:${cnonce}`);
  }

  // Compute HA2
  const ha2 = hashFn(`${method}:${uri}`);

  // Compute response
  let response: string;
  if (challenge.qop) {
    response = hashFn(`${ha1}:${challenge.nonce}:${ncStr}:${cnonce}:${challenge.qop}:${ha2}`);
  } else {
    response = hashFn(`${ha1}:${challenge.nonce}:${ha2}`);
  }

  // Build Authorization header
  const parts = [
    `username="${username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];

  if (challenge.qop) {
    parts.push(`qop=${challenge.qop.split(',')[0].trim()}`);
    parts.push(`nc=${ncStr}`);
    parts.push(`cnonce="${cnonce}"`);
  }

  if (challenge.opaque) {
    parts.push(`opaque="${challenge.opaque}"`);
  }

  if (algorithm !== 'MD5') {
    parts.push(`algorithm=${algorithm}`);
  }

  return `Digest ${parts.join(', ')}`;
}

/**
 * Digest Authentication Middleware
 * Handles WWW-Authenticate challenges and computes Digest auth headers
 *
 * @example
 * ```typescript
 * client.use(digestAuth({
 *   username: 'user',
 *   password: 'pass'
 * }));
 * ```
 */
export function digestAuth(options: DigestAuthOptions): Middleware {
  let nc = 0; // Nonce counter
  let lastChallenge: DigestChallenge | null = null;

  return async (req, next) => {
    // If we have a cached challenge and preemptive is enabled, use it
    if (lastChallenge && options.preemptive) {
      nc++;
      const uri = new URL(req.url).pathname + new URL(req.url).search;
      const authHeader = generateDigestHeader(
        req.method,
        uri,
        options.username,
        options.password,
        lastChallenge,
        nc
      );
      const newReq = req.withHeader('Authorization', authHeader);
      return next(newReq);
    }

    // Make initial request
    const response = await next(req);

    // Check for 401 with Digest challenge
    if (response.status === 401) {
      const wwwAuth = response.headers.get('WWW-Authenticate');
      if (wwwAuth) {
        const challenge = parseDigestChallenge(wwwAuth);
        if (challenge) {
          lastChallenge = challenge;
          nc++;

          // Generate and send authenticated request
          const uri = new URL(req.url).pathname + new URL(req.url).search;
          const authHeader = generateDigestHeader(
            req.method,
            uri,
            options.username,
            options.password,
            challenge,
            nc
          );

          const newReq = req.withHeader('Authorization', authHeader);
          return next(newReq);
        }
      }
    }

    return response;
  };
}

/**
 * Digest Authentication Plugin
 */
export function digestAuthPlugin(options: DigestAuthOptions): Plugin {
  return (client) => {
    client.use(digestAuth(options));
  };
}

// ============================================================================
// OAuth2 Authentication
// ============================================================================

export interface OAuth2Options {
  /**
   * OAuth2 access token or token provider function
   */
  accessToken: string | (() => string | Promise<string>);

  /**
   * Token type (default: 'Bearer')
   */
  tokenType?: string;

  /**
   * Optional refresh token handler
   * Called when a 401 is received to attempt token refresh
   */
  onTokenExpired?: () => Promise<string>;
}

/**
 * OAuth2 Authentication Middleware
 * Supports token refresh on 401 responses
 *
 * @example
 * ```typescript
 * client.use(oauth2({
 *   accessToken: () => tokenStore.getAccessToken(),
 *   onTokenExpired: async () => {
 *     await tokenStore.refresh();
 *     return tokenStore.getAccessToken();
 *   }
 * }));
 * ```
 */
export function oauth2(options: OAuth2Options): Middleware {
  const tokenType = options.tokenType ?? 'Bearer';

  return async (req, next) => {
    // Get current token
    const token = typeof options.accessToken === 'function'
      ? await options.accessToken()
      : options.accessToken;

    // Add Authorization header
    const authReq = req.withHeader('Authorization', `${tokenType} ${token}`);
    const response = await next(authReq);

    // Handle token expiration
    if (response.status === 401 && options.onTokenExpired) {
      try {
        const newToken = await options.onTokenExpired();
        const retryReq = req.withHeader('Authorization', `${tokenType} ${newToken}`);
        return next(retryReq);
      } catch {
        // Token refresh failed, return original 401 response
        return response;
      }
    }

    return response;
  };
}

/**
 * OAuth2 Authentication Plugin
 */
export function oauth2Plugin(options: OAuth2Options): Plugin {
  return (client) => {
    client.use(oauth2(options));
  };
}

// ============================================================================
// AWS Signature V4 Authentication
// ============================================================================

export interface AWSSignatureV4Options {
  /**
   * AWS Access Key ID
   */
  accessKeyId: string;

  /**
   * AWS Secret Access Key
   */
  secretAccessKey: string;

  /**
   * AWS Region (e.g., 'us-east-1')
   */
  region: string;

  /**
   * AWS Service name (e.g., 's3', 'execute-api')
   */
  service: string;

  /**
   * Session token for temporary credentials (optional)
   */
  sessionToken?: string;
}

/**
 * AWS Signature V4 Authentication Middleware
 * Signs requests using AWS Signature Version 4
 *
 * @example
 * ```typescript
 * client.use(awsSignatureV4({
 *   accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
 *   secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
 *   region: 'us-east-1',
 *   service: 'execute-api'
 * }));
 * ```
 */
export function awsSignatureV4(options: AWSSignatureV4Options): Middleware {
  return async (req, next) => {
    const url = new URL(req.url);
    const host = url.host;
    const pathname = url.pathname;
    const queryString = url.search.slice(1);

    // Generate timestamp
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    // Create canonical request
    const method = req.method;
    const canonicalUri = pathname || '/';
    const canonicalQueryString = queryString
      .split('&')
      .filter(Boolean)
      .sort()
      .join('&');

    // Get request body for signing
    let payload = '';
    if (req.body) {
      if (typeof req.body === 'string') {
        payload = req.body;
      } else if (req.body instanceof ArrayBuffer) {
        payload = Buffer.from(req.body).toString();
      }
    }
    const payloadHash = sha256(payload);

    // Build signed headers
    const headers: Record<string, string> = {
      host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
    };

    if (options.sessionToken) {
      headers['x-amz-security-token'] = options.sessionToken;
    }

    // Copy existing headers
    req.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map(key => `${key}:${headers[key].trim()}\n`)
      .join('');

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    // Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${options.region}/${options.service}/aws4_request`;
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      sha256(canonicalRequest),
    ].join('\n');

    // Calculate signature
    const getSignatureKey = (key: string, dateStamp: string, regionName: string, serviceName: string) => {
      const kDate = createHash('sha256').update(`AWS4${key}`).update(dateStamp).digest();
      const kRegion = createHash('sha256').update(kDate).update(regionName).digest();
      const kService = createHash('sha256').update(kRegion).update(serviceName).digest();
      const kSigning = createHash('sha256').update(kService).update('aws4_request').digest();
      return kSigning;
    };

    const signingKey = getSignatureKey(
      options.secretAccessKey,
      dateStamp,
      options.region,
      options.service
    );

    const signature = createHash('sha256')
      .update(signingKey)
      .update(stringToSign)
      .digest('hex');

    // Build Authorization header
    const authorizationHeader = `${algorithm} Credential=${options.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    // Create new request with AWS headers
    let newReq = req.withHeader('Authorization', authorizationHeader);
    newReq = newReq.withHeader('x-amz-date', amzDate);
    newReq = newReq.withHeader('x-amz-content-sha256', payloadHash);

    if (options.sessionToken) {
      newReq = newReq.withHeader('x-amz-security-token', options.sessionToken);
    }

    return next(newReq);
  };
}

/**
 * AWS Signature V4 Authentication Plugin
 */
export function awsSignatureV4Plugin(options: AWSSignatureV4Options): Plugin {
  return (client) => {
    client.use(awsSignatureV4(options));
  };
}

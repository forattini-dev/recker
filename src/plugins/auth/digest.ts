/**
 * Digest Authentication
 * RFC 7616 - HTTP Digest Access Authentication
 */

import { Middleware, Plugin } from '../../types/index.js';
import { createHash, randomBytes } from 'node:crypto';

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

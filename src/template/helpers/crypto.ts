/**
 * Crypto Helpers
 *
 * Helpers for cryptographic operations in templates.
 * Includes encoding, hashing, HMAC, and JWT generation.
 */

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { TemplateHelper, HelperContext } from '../types.js';

// ============================================================================
// Encoding Helpers
// ============================================================================

/**
 * {{base64 value}}
 *
 * Encodes value to base64.
 */
export const base64Helper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  const str = String(value ?? '');
  return Buffer.from(str).toString('base64');
};

/**
 * {{base64decode value}}
 *
 * Decodes base64 to string.
 */
export const base64decodeHelper: TemplateHelper = function(
  this: HelperContext,
  value: string
): string {
  return Buffer.from(value, 'base64').toString('utf-8');
};

/**
 * {{base64url value}}
 *
 * Encodes value to URL-safe base64.
 */
export const base64urlHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  const str = String(value ?? '');
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

/**
 * {{hex value}}
 *
 * Encodes value to hexadecimal.
 */
export const hexHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  const str = String(value ?? '');
  return Buffer.from(str).toString('hex');
};

/**
 * {{hexdecode value}}
 *
 * Decodes hexadecimal to string.
 */
export const hexdecodeHelper: TemplateHelper = function(
  this: HelperContext,
  value: string
): string {
  return Buffer.from(value, 'hex').toString('utf-8');
};

// ============================================================================
// Hashing Helpers
// ============================================================================

/**
 * {{hash "algorithm" value}}
 *
 * Hashes value with specified algorithm (md5, sha1, sha256, sha512, etc.)
 */
export const hashHelper: TemplateHelper = function(
  this: HelperContext,
  algorithm: string,
  value: unknown
): string {
  const str = String(value ?? '');
  return createHash(algorithm).update(str).digest('hex');
};

/**
 * {{md5 value}}
 *
 * MD5 hash (shortcut for {{hash "md5" value}}).
 */
export const md5Helper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  const str = String(value ?? '');
  return createHash('md5').update(str).digest('hex');
};

/**
 * {{sha1 value}}
 *
 * SHA-1 hash.
 */
export const sha1Helper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  const str = String(value ?? '');
  return createHash('sha1').update(str).digest('hex');
};

/**
 * {{sha256 value}}
 *
 * SHA-256 hash.
 */
export const sha256Helper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  const str = String(value ?? '');
  return createHash('sha256').update(str).digest('hex');
};

/**
 * {{sha512 value}}
 *
 * SHA-512 hash.
 */
export const sha512Helper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  const str = String(value ?? '');
  return createHash('sha512').update(str).digest('hex');
};

// ============================================================================
// HMAC Helpers
// ============================================================================

/**
 * {{hmac "algorithm" secret value}}
 *
 * HMAC with specified algorithm.
 */
export const hmacHelper: TemplateHelper = function(
  this: HelperContext,
  algorithm: string,
  secret: string,
  value: unknown
): string {
  const str = String(value ?? '');
  return createHmac(algorithm, secret).update(str).digest('hex');
};

/**
 * {{hmacSha256 secret value}}
 *
 * HMAC-SHA256 (common for API signatures).
 */
export const hmacSha256Helper: TemplateHelper = function(
  this: HelperContext,
  secret: string,
  value: unknown
): string {
  const str = String(value ?? '');
  return createHmac('sha256', secret).update(str).digest('hex');
};

/**
 * {{hmacSha256Base64 secret value}}
 *
 * HMAC-SHA256 with base64 output.
 */
export const hmacSha256Base64Helper: TemplateHelper = function(
  this: HelperContext,
  secret: string,
  value: unknown
): string {
  const str = String(value ?? '');
  return createHmac('sha256', secret).update(str).digest('base64');
};

// ============================================================================
// JWT Helpers
// ============================================================================

/**
 * {{jwt payload secret}} or {{jwt payload secret algorithm}}
 *
 * Generates a JWT token.
 * Default algorithm: HS256
 */
export const jwtHelper: TemplateHelper = function(
  this: HelperContext,
  payload: unknown,
  secret: string,
  algorithm: string = 'HS256'
): string {
  const header = {
    alg: algorithm,
    typ: 'JWT',
  };

  const encodedHeader = Buffer.from(JSON.stringify(header))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const payloadObj = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const encodedPayload = Buffer.from(JSON.stringify(payloadObj))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  let signature: string;
  switch (algorithm) {
    case 'HS256':
      signature = createHmac('sha256', secret)
        .update(signatureInput)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      break;
    case 'HS384':
      signature = createHmac('sha384', secret)
        .update(signatureInput)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      break;
    case 'HS512':
      signature = createHmac('sha512', secret)
        .update(signatureInput)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      break;
    default:
      throw new Error(`Unsupported JWT algorithm: ${algorithm}`);
  }

  return `${signatureInput}.${signature}`;
};

/**
 * {{jwtDecode token}}
 *
 * Decodes a JWT token (without verification).
 */
export const jwtDecodeHelper: TemplateHelper = function(
  this: HelperContext,
  token: string
): { header: unknown; payload: unknown } {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const decodeBase64Url = (str: string): string => {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    return Buffer.from(padded, 'base64').toString('utf-8');
  };

  return {
    header: JSON.parse(decodeBase64Url(parts[0])),
    payload: JSON.parse(decodeBase64Url(parts[1])),
  };
};

// ============================================================================
// Random Helpers
// ============================================================================

/**
 * {{uuid}}
 *
 * Generates a UUID v4.
 */
export const uuidHelper: TemplateHelper = function(
  this: HelperContext
): string {
  return randomUUID();
};

/**
 * {{randomBytes count}} or {{randomBytes count "hex"}}
 *
 * Generates random bytes.
 */
export const randomBytesHelper: TemplateHelper = function(
  this: HelperContext,
  count: number = 16,
  encoding: BufferEncoding = 'hex'
): string {
  return randomBytes(count).toString(encoding);
};

/**
 * {{randomInt min max}}
 *
 * Generates random integer between min and max (inclusive).
 */
export const randomIntHelper: TemplateHelper = function(
  this: HelperContext,
  min: number = 0,
  max: number = 100
): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * {{randomString length}} or {{randomString length "alphanumeric"}}
 *
 * Generates random string.
 * Charsets: alphanumeric, alpha, numeric, hex
 */
export const randomStringHelper: TemplateHelper = function(
  this: HelperContext,
  length: number = 16,
  charset: string = 'alphanumeric'
): string {
  const charsets: Record<string, string> = {
    alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    numeric: '0123456789',
    hex: '0123456789abcdef',
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  };

  const chars = charsets[charset] ?? charset;
  const bytes = randomBytes(length);
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }

  return result;
};

/**
 * {{randomChoice "a" "b" "c"}}
 *
 * Picks a random value from the arguments.
 */
export const randomChoiceHelper: TemplateHelper = function(
  this: HelperContext,
  ...args: unknown[]
): unknown {
  // Filter out options object
  const choices = args.filter(a => typeof a !== 'object' || !('fn' in (a as object)));
  if (choices.length === 0) return undefined;
  return choices[Math.floor(Math.random() * choices.length)];
};

// ============================================================================
// Export all crypto helpers
// ============================================================================

export const cryptoHelpers: Record<string, TemplateHelper> = {
  // Encoding
  base64: base64Helper,
  base64decode: base64decodeHelper,
  base64url: base64urlHelper,
  hex: hexHelper,
  hexdecode: hexdecodeHelper,

  // Hashing
  hash: hashHelper,
  md5: md5Helper,
  sha1: sha1Helper,
  sha256: sha256Helper,
  sha512: sha512Helper,

  // HMAC
  hmac: hmacHelper,
  hmacSha256: hmacSha256Helper,
  hmacSha256Base64: hmacSha256Base64Helper,

  // JWT
  jwt: jwtHelper,
  jwtDecode: jwtDecodeHelper,

  // Random
  uuid: uuidHelper,
  randomBytes: randomBytesHelper,
  randomInt: randomIntHelper,
  randomString: randomStringHelper,
  randomChoice: randomChoiceHelper,
};

/**
 * Browser Crypto Utilities
 *
 * Provides crypto operations using the Web Crypto API (SubtleCrypto).
 * This is the browser-compatible replacement for Node.js crypto module.
 *
 * All operations are async because SubtleCrypto is promise-based.
 */

export type HashAlgorithm = 'SHA-256' | 'SHA-384' | 'SHA-512' | 'SHA-1';
export type HmacAlgorithm = 'SHA-256' | 'SHA-384' | 'SHA-512' | 'SHA-1';

/**
 * Browser-compatible crypto utilities using SubtleCrypto
 */
export class BrowserCrypto {
  private encoder = new TextEncoder();

  /**
   * Compute hash of a string
   *
   * @param algorithm - Hash algorithm (SHA-256, SHA-384, SHA-512, SHA-1)
   * @param data - String to hash
   * @returns Hex-encoded hash
   *
   * @example
   * ```typescript
   * const crypto = new BrowserCrypto();
   * const hash = await crypto.hash('SHA-256', 'hello world');
   * // Returns: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
   * ```
   */
  async hash(algorithm: HashAlgorithm, data: string): Promise<string> {
    const dataBuffer = this.encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest(algorithm, dataBuffer);
    return this.bufferToHex(hashBuffer);
  }

  /**
   * Compute hash of binary data
   *
   * @param algorithm - Hash algorithm
   * @param data - Binary data to hash
   * @returns Hex-encoded hash
   */
  async hashBuffer(
    algorithm: HashAlgorithm,
    data: ArrayBuffer | Uint8Array
  ): Promise<string> {
    const buffer =
      data instanceof Uint8Array ? (data.buffer as ArrayBuffer) : data;
    const hashBuffer = await crypto.subtle.digest(algorithm, buffer);
    return this.bufferToHex(hashBuffer);
  }

  /**
   * Compute HMAC signature
   *
   * @param algorithm - HMAC algorithm (SHA-256, SHA-384, SHA-512, SHA-1)
   * @param key - Secret key
   * @param data - Data to sign
   * @returns Hex-encoded HMAC signature
   *
   * @example
   * ```typescript
   * const crypto = new BrowserCrypto();
   * const signature = await crypto.hmac('SHA-256', 'secret-key', 'message');
   * ```
   */
  async hmac(
    algorithm: HmacAlgorithm,
    key: string,
    data: string
  ): Promise<string> {
    const keyData = this.encoder.encode(key);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: algorithm },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      this.encoder.encode(data)
    );
    return this.bufferToHex(signature);
  }

  /**
   * Compute HMAC with binary key
   *
   * @param algorithm - HMAC algorithm
   * @param key - Secret key as binary
   * @param data - Data to sign
   * @returns HMAC signature as ArrayBuffer
   */
  async hmacBuffer(
    algorithm: HmacAlgorithm,
    key: ArrayBuffer | Uint8Array,
    data: string | ArrayBuffer | Uint8Array
  ): Promise<ArrayBuffer> {
    const keyBuffer =
      key instanceof Uint8Array ? (key.buffer as ArrayBuffer) : key;
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'HMAC', hash: algorithm },
      false,
      ['sign']
    );
    let dataBuffer: ArrayBuffer;
    if (typeof data === 'string') {
      dataBuffer = this.encoder.encode(data).buffer as ArrayBuffer;
    } else if (data instanceof Uint8Array) {
      dataBuffer = data.buffer as ArrayBuffer;
    } else {
      dataBuffer = data;
    }
    return crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
  }

  /**
   * Generate a random UUID
   *
   * @returns Random UUID v4
   *
   * @example
   * ```typescript
   * const crypto = new BrowserCrypto();
   * const id = crypto.randomUUID();
   * // Returns: '550e8400-e29b-41d4-a716-446655440000'
   * ```
   */
  randomUUID(): string {
    return crypto.randomUUID();
  }

  /**
   * Generate random bytes
   *
   * @param length - Number of bytes to generate
   * @returns Random bytes as Uint8Array
   */
  randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  /**
   * Generate random bytes as hex string
   *
   * @param length - Number of bytes to generate
   * @returns Random bytes as hex string
   */
  randomHex(length: number): string {
    return this.bufferToHex(this.randomBytes(length));
  }

  /**
   * Convert ArrayBuffer to hex string
   */
  bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Convert hex string to Uint8Array
   */
  hexToBuffer(hex: string): Uint8Array {
    const matches = hex.match(/.{1,2}/g) || [];
    return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
  }

  /**
   * Base64 encode a string (supports UTF-8)
   */
  base64Encode(data: string): string {
    // Handle UTF-8 by encoding to bytes first
    const bytes = this.encoder.encode(data);
    const binString = Array.from(bytes, (byte) =>
      String.fromCodePoint(byte)
    ).join('');
    return btoa(binString);
  }

  /**
   * Base64 decode a string (supports UTF-8)
   */
  base64Decode(data: string): string {
    const binString = atob(data);
    const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0)!);
    return new TextDecoder().decode(bytes);
  }

  /**
   * URL-safe Base64 encode (supports UTF-8)
   */
  base64UrlEncode(data: string): string {
    return this.base64Encode(data)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * URL-safe Base64 decode (supports UTF-8)
   */
  base64UrlDecode(data: string): string {
    const padded = data + '='.repeat((4 - (data.length % 4)) % 4);
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    return this.base64Decode(base64);
  }
}

/**
 * Singleton instance for convenience
 */
export const browserCrypto = new BrowserCrypto();

/**
 * Shorthand functions for common operations
 */
export const sha256 = (data: string) => browserCrypto.hash('SHA-256', data);
export const sha1 = (data: string) => browserCrypto.hash('SHA-1', data);
export const hmacSha256 = (key: string, data: string) =>
  browserCrypto.hmac('SHA-256', key, data);
export const randomUUID = () => browserCrypto.randomUUID();
export const randomBytes = (length: number) => browserCrypto.randomBytes(length);

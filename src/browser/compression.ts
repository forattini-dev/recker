/**
 * Request Body Compression Plugin - Browser Version
 *
 * Uses the native CompressionStream API available in modern browsers.
 * Supports gzip and deflate (brotli is NOT available for compression in browsers).
 *
 * Browser support:
 * - Chrome 80+
 * - Firefox 113+
 * - Safari 16.4+
 * - Edge 80+
 */

import { Middleware } from '../types/index.js';
import { UnsupportedError } from '../core/errors.js';

export type BrowserCompressionAlgorithm = 'gzip' | 'deflate';

export interface BrowserCompressionOptions {
  /**
   * Compression algorithm
   * Note: 'br' (brotli) is NOT supported in browsers for compression
   * @default 'gzip'
   */
  algorithm?: BrowserCompressionAlgorithm;

  /**
   * Minimum body size to compress (bytes)
   * @default 1024
   */
  threshold?: number;

  /**
   * Force compression even if result is larger
   * @default false
   */
  force?: boolean;

  /**
   * HTTP methods to compress
   * @default ['POST', 'PUT', 'PATCH']
   */
  methods?: string[];
}

/**
 * Check if CompressionStream API is available
 */
export function isCompressionSupported(): boolean {
  return typeof globalThis.CompressionStream !== 'undefined';
}

/**
 * Check if content type is compressible
 */
function isCompressible(contentType: string | null): boolean {
  if (!contentType) return true;

  const compressibleTypes = [
    'text/',
    'application/json',
    'application/xml',
    'application/javascript',
    'application/x-www-form-urlencoded',
  ];

  return compressibleTypes.some((type) => contentType.includes(type));
}

/**
 * Get body size in bytes
 */
function getBodySize(body: unknown): number {
  if (!body) return 0;

  if (typeof body === 'string') {
    return new TextEncoder().encode(body).length;
  }

  if (body instanceof ArrayBuffer) {
    return body.byteLength;
  }

  if (body instanceof Uint8Array) {
    return body.length;
  }

  if (body instanceof Blob) {
    return body.size;
  }

  if (typeof body === 'object') {
    try {
      return new TextEncoder().encode(JSON.stringify(body)).length;
    } catch {
      return 0;
    }
  }

  return 0;
}

/**
 * Convert body to Uint8Array for compression
 */
function toUint8Array(body: unknown): Uint8Array | null {
  if (!body) return null;

  if (body instanceof Uint8Array) {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body);
  }

  if (typeof body === 'string') {
    return new TextEncoder().encode(body);
  }

  if (typeof body === 'object') {
    try {
      return new TextEncoder().encode(JSON.stringify(body));
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Compress data using native CompressionStream API
 */
async function compress(
  data: Uint8Array,
  algorithm: BrowserCompressionAlgorithm
): Promise<Uint8Array> {
  if (!isCompressionSupported()) {
    throw new UnsupportedError(
      'CompressionStream API is not available in this browser',
      { feature: 'CompressionStream' }
    );
  }

  const stream = new CompressionStream(algorithm);
  const writer = stream.writable.getWriter();

  // Write data and close - ensure we have a proper ArrayBuffer (not SharedArrayBuffer)
  const buffer = new Uint8Array(data).buffer as ArrayBuffer;
  writer.write(new Uint8Array(buffer));
  writer.close();

  // Read compressed chunks
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Concatenate chunks into single Uint8Array
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Decompress data using native DecompressionStream API
 */
export async function decompress(
  data: Uint8Array,
  algorithm: BrowserCompressionAlgorithm
): Promise<Uint8Array> {
  if (typeof globalThis.DecompressionStream === 'undefined') {
    throw new UnsupportedError(
      'DecompressionStream API is not available in this browser',
      { feature: 'DecompressionStream' }
    );
  }

  const stream = new DecompressionStream(algorithm);
  const writer = stream.writable.getWriter();

  // Ensure we have a proper ArrayBuffer (not SharedArrayBuffer)
  const buffer = new Uint8Array(data).buffer as ArrayBuffer;
  writer.write(new Uint8Array(buffer));
  writer.close();

  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Request Body Compression Middleware - Browser Version
 *
 * Automatically compresses request bodies using the native CompressionStream API.
 * Only supports gzip and deflate (brotli is not available for compression in browsers).
 *
 * @example
 * ```typescript
 * import { createClient } from 'recker/browser';
 * import { compression } from 'recker/browser';
 *
 * const client = createClient({
 *   baseUrl: 'https://api.example.com'
 * });
 *
 * client.use(compression());
 *
 * // Large payloads are automatically compressed
 * await client.post('/logs', {
 *   entries: Array(1000).fill({ level: 'info', message: 'log entry' })
 * });
 * ```
 */
export function compression(
  options: BrowserCompressionOptions = {}
): Middleware {
  const {
    algorithm = 'gzip',
    threshold = 1024,
    force = false,
    methods = ['POST', 'PUT', 'PATCH'],
  } = options;

  // Validate algorithm at middleware creation time
  if (algorithm !== 'gzip' && algorithm !== 'deflate') {
    throw new UnsupportedError(
      `Browser compression only supports 'gzip' and 'deflate'. '${algorithm}' is not available.`,
      { feature: algorithm }
    );
  }

  return async (req, next) => {
    // Check if we should compress this request
    const shouldCompress = methods.includes(req.method);

    if (!shouldCompress || !req.body) {
      return next(req);
    }

    // Check if CompressionStream is available
    if (!isCompressionSupported()) {
      // Silently fall back to uncompressed if API not available
      return next(req);
    }

    // Check if already compressed
    if (req.headers.has('Content-Encoding')) {
      return next(req);
    }

    // Check content type
    const contentType = req.headers.get('Content-Type');
    if (!isCompressible(contentType)) {
      return next(req);
    }

    // Check body size
    const bodySize = getBodySize(req.body);
    if (!force && bodySize < threshold) {
      return next(req);
    }

    // Convert body to Uint8Array
    const data = toUint8Array(req.body);
    if (!data) {
      return next(req);
    }

    try {
      // Compress the body
      const compressed = await compress(data, algorithm);

      // Only use compressed if it's actually smaller
      if (!force && compressed.length >= data.length) {
        return next(req);
      }

      // Update request with compressed body and headers
      const newHeaders = new Headers(req.headers);
      newHeaders.set('Content-Encoding', algorithm);
      newHeaders.set('Content-Length', compressed.length.toString());

      const compressedReq = {
        ...req,
        body: compressed as unknown as BodyInit,
        headers: newHeaders,
      };

      return next(compressedReq);
    } catch {
      // If compression fails, send uncompressed silently
      return next(req);
    }
  };
}

/**
 * Helper to create compression middleware from client options
 */
export function createCompressionMiddleware(
  config: boolean | BrowserCompressionOptions
): Middleware | null {
  if (!config) {
    return null;
  }

  if (config === true) {
    return compression();
  }

  return compression(config);
}

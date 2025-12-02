/**
 * Request Body Compression Plugin
 * Automatically compresses request bodies using gzip, deflate, or brotli
 */

import { gzip, deflate, brotliCompress } from 'node:zlib';
import { promisify } from 'node:util';
import { Middleware, CompressionOptions } from '../types/index.js';
import { UnsupportedError } from '../core/errors.js';

const gzipAsync = promisify(gzip);
const deflateAsync = promisify(deflate);
const brotliAsync = promisify(brotliCompress);

export type CompressionAlgorithm = 'gzip' | 'deflate' | 'br';

/**
 * Check if content type is compressible
 */
function isCompressible(contentType: string | null): boolean {
  if (!contentType) return true; // Assume compressible if no content-type

  const compressibleTypes = [
    'text/',
    'application/json',
    'application/xml',
    'application/javascript',
    'application/x-www-form-urlencoded'
  ];

  return compressibleTypes.some(type => contentType.includes(type));
}

/**
 * Get body size in bytes
 */
function getBodySize(body: any): number {
  if (!body) return 0;

  if (typeof body === 'string') {
    return Buffer.byteLength(body, 'utf8');
  }

  if (body instanceof Buffer) {
    return body.length;
  }

  if (body instanceof ArrayBuffer) {
    return body.byteLength;
  }

  if (body instanceof Blob) {
    return body.size;
  }

  // For objects, estimate by stringifying
  if (typeof body === 'object') {
    try {
      return Buffer.byteLength(JSON.stringify(body), 'utf8');
    } catch {
      return 0;
    }
  }

  return 0;
}

/**
 * Convert body to Buffer for compression
 */
function toBuffer(body: any): Buffer | null {
  if (!body) return null;

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (typeof body === 'string') {
    return Buffer.from(body, 'utf8');
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }

  if (typeof body === 'object') {
    try {
      return Buffer.from(JSON.stringify(body), 'utf8');
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Compress data using specified algorithm
 */
async function compress(data: Buffer, algorithm: CompressionAlgorithm): Promise<Buffer> {
  switch (algorithm) {
    case 'gzip':
      return await gzipAsync(data);
    case 'deflate':
      return await deflateAsync(data);
    case 'br':
      return await brotliAsync(data);
    default:
      throw new UnsupportedError(
        `Unsupported compression algorithm: ${algorithm}`,
        {
          feature: algorithm,
        }
      );
    }
}

/**
 * Request Body Compression Middleware
 *
 * Automatically compresses request bodies to reduce bandwidth usage.
 * Particularly useful for:
 * - Large JSON payloads
 * - Log/analytics data
 * - Bulk operations
 * - APIs that support Content-Encoding
 *
 * @example
 * ```typescript
 * // Basic usage with defaults
 * const client = createClient({
 *   baseUrl: 'https://api.example.com'
 * });
 * client.use(compression());
 *
 * // Custom options
 * client.use(compression({
 *   algorithm: 'br', // Use brotli
 *   threshold: 5120, // Compress if > 5KB
 *   methods: ['POST', 'PUT'] // Only these methods
 * }));
 *
 * // Send large data - automatically compressed
 * await client.post('/logs', {
 *   entries: Array(1000).fill({ level: 'info', message: 'log entry' })
 * });
 * ```
 */
export function compression(options: CompressionOptions = {}): Middleware {
  const {
    algorithm = 'gzip',
    threshold = 1024,
    force = false,
    methods = ['POST', 'PUT', 'PATCH']
  } = options;

  return async (req, next) => {
    // Check if we should compress this request
    const shouldCompress = methods.includes(req.method);

    if (!shouldCompress || !req.body) {
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

    // Convert body to buffer
    const buffer = toBuffer(req.body);
    if (!buffer) {
      return next(req);
    }

    try {
      // Compress the body
      const compressed = await compress(buffer, algorithm);

      // Only use compressed if it's actually smaller
      if (!force && compressed.length >= buffer.length) {
        return next(req);
      }

      // Update request with compressed body and headers
      const newHeaders = new Headers(req.headers);
      newHeaders.set('Content-Encoding', algorithm);
      newHeaders.set('Content-Length', compressed.length.toString());

      // Create new request object with compressed body and updated headers
      // Buffer is a Uint8Array which is a valid BodyInit
      const compressedReq = {
        ...req,
        body: compressed as unknown as BodyInit,
        headers: newHeaders
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
  config: boolean | CompressionOptions
): Middleware | null {
  if (!config) {
    return null;
  }

  if (config === true) {
    return compression(); // Use defaults
  }

  return compression(config);
}

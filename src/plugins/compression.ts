/**
 * Request Body Compression Plugin
 * Automatically compresses request bodies using gzip, deflate, or brotli
 */

import { Middleware, CompressionOptions } from '../types/index.js';
import { UnsupportedError } from '../core/errors.js';
 
const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const BufferCtor = (globalThis as any).Buffer as { from: (data: any, encoding?: string) => Uint8Array } | undefined;

function isNodeRuntime(): boolean {
  return typeof globalThis !== 'undefined' && Boolean((globalThis as any).process?.versions?.node);
}

let nodeCompressorsPromise:
  | Promise<{
      gzip: (input: Uint8Array) => Promise<Uint8Array>;
      deflate: (input: Uint8Array) => Promise<Uint8Array>;
      brotli: (input: Uint8Array) => Promise<Uint8Array>;
    }>
  | null = null;

async function loadNodeCompressors() {
  if (!nodeCompressorsPromise) {
    nodeCompressorsPromise = (async () => {
      const zlibModuleName = 'node:zlib';
      const utilModuleName = 'node:util';
      const zlibModule = await import(zlibModuleName);
      const utilModule = await import(utilModuleName);
      const gzipAsync = utilModule.promisify(zlibModule.gzip);
      const deflateAsync = utilModule.promisify(zlibModule.deflate);
      const brotliAsync = utilModule.promisify(zlibModule.brotliCompress);

      return {
        gzip: async (input: Uint8Array) => gzipAsync(BufferCtor ? BufferCtor.from(input as any) : input) as unknown as Uint8Array,
        deflate: async (input: Uint8Array) => deflateAsync(BufferCtor ? BufferCtor.from(input as any) : input) as unknown as Uint8Array,
        brotli: async (input: Uint8Array) => brotliAsync(BufferCtor ? BufferCtor.from(input as any) : input) as unknown as Uint8Array
      };
    })();
  }

  return nodeCompressorsPromise;
}

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
    if (textEncoder) return textEncoder.encode(body).length;
    if (BufferCtor) return BufferCtor.from(body, 'utf8').length;
    return body.length;
  }

  if (body instanceof ArrayBuffer) {
    return body.byteLength;
  }

  if (ArrayBuffer.isView(body)) {
    return body.byteLength;
  }

  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return body.size;
  }

  if (typeof body === 'object') {
    try {
      const json = JSON.stringify(body);
      if (textEncoder) return textEncoder.encode(json).length;
      if (BufferCtor) return BufferCtor.from(json, 'utf8').length;
      return json.length;
    } catch {
      return 0;
    }
  }

  return 0;
}

/**
 * Convert body to bytes for compression
 */
function toBytes(body: any): Uint8Array | null {
  if (!body) return null;

  if (typeof body === 'string') {
    if (textEncoder) return textEncoder.encode(body);
    if (BufferCtor) return BufferCtor.from(body, 'utf8');
    return null;
  }

  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    const encoded = body.toString();
    if (textEncoder) return textEncoder.encode(encoded);
    if (BufferCtor) return BufferCtor.from(encoded, 'utf8');
    return null;
  }

  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body);
  }

  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }

  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    // Blob requires async access; skip to avoid blocking.
    return null;
  }

  if (typeof body === 'object') {
    try {
      const json = JSON.stringify(body);
      if (textEncoder) return textEncoder.encode(json);
      if (BufferCtor) return BufferCtor.from(json, 'utf8');
      return null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Compress data using specified algorithm
 */
async function compress(data: Uint8Array, algorithm: CompressionAlgorithm): Promise<Uint8Array> {
  // For Node.js, prefer native zlib (especially for brotli which CompressionStream doesn't support)
  if (isNodeRuntime()) {
    const compressors = await loadNodeCompressors();
    switch (algorithm) {
      case 'gzip':
        return compressors.gzip(data);
      case 'deflate':
        return compressors.deflate(data);
      case 'br':
        return compressors.brotli(data);
      default:
        break;
    }
  }

  // Browser environment: use CompressionStream (gzip/deflate only)
  if (typeof CompressionStream !== 'undefined') {
    if (algorithm === 'br') {
      throw new UnsupportedError(
        'Brotli compression is not available in browser environments.',
        { feature: algorithm }
      );
    }

    const stream = new CompressionStream(algorithm);
    const writer = stream.writable.getWriter();
    const payload = data.buffer instanceof ArrayBuffer ? data : new Uint8Array(data);
    await writer.write(payload as unknown as BufferSource);
    await writer.close();
    const buffer = await new Response(stream.readable).arrayBuffer();
    return new Uint8Array(buffer);
  }

  throw new UnsupportedError(
    `Unsupported compression algorithm: ${algorithm}`,
    {
      feature: algorithm,
    }
  );
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

    // Convert body to bytes
    const bytes = toBytes(req.body);
    if (!bytes) {
      return next(req);
    }

    try {
      // Compress the body
      const compressed = await compress(bytes, algorithm);

      // Only use compressed if it's actually smaller
      if (!force && compressed.length >= bytes.length) {
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

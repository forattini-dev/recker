import { CacheStorage, CacheStrategy, Middleware, Plugin, ReckerRequest, ReckerResponse, CacheEntry } from '../types/index.js';
import { HttpResponse } from '../core/response.js';
import { HttpRequest } from '../core/request.js';
import { MemoryStorage } from '../cache/memory-storage.js';
import { createHash } from 'node:crypto';

export interface CacheOptions {
  storage?: CacheStorage;
  strategy?: CacheStrategy;
  ttl?: number; // Time to live in milliseconds (fallback when no Cache-Control)
  methods?: string[]; // Methods to cache (default: GET)
  keyGenerator?: (req: ReckerRequest) => string;

  /**
   * RFC 7234 options for 'rfc-compliant' and 'revalidate' strategies
   */

  /**
   * Respect Cache-Control: no-store and no-cache directives
   * @default true
   */
  respectCacheControl?: boolean;

  /**
   * Include Vary header in cache key generation
   * @default true
   */
  respectVary?: boolean;

  /**
   * Maximum stale time in milliseconds to serve stale content
   * Used when stale-while-revalidate or stale-if-error is present
   * @default 0 (no stale serving)
   */
  maxStale?: number;

  /**
   * Force revalidation on every request (like Cache-Control: no-cache)
   * Useful for debugging or strict freshness requirements
   * @default false
   */
  forceRevalidate?: boolean;
}

/**
 * Request Cache-Control directives (RFC-7234)
 */
interface RequestCacheControl {
  maxAge?: number;        // max-age: won't accept cached response older than this
  minFresh?: number;      // min-fresh: wants response fresh for at least this long
  maxStale?: number;      // max-stale: willing to accept stale response (optionally with max staleness)
  onlyIfCached?: boolean; // only-if-cached: only wants cached content, no network
  noCache?: boolean;      // no-cache: force revalidation
  noStore?: boolean;      // no-store: don't cache
}

/**
 * Parse request Cache-Control header (RFC-7234 Section 5.2)
 */
function parseRequestCacheControl(header: string | null): RequestCacheControl {
  if (!header) return {};

  const result: RequestCacheControl = {};
  const directives = header.toLowerCase().split(',').map(d => d.trim());

  for (const directive of directives) {
    if (directive.startsWith('max-age=')) {
      result.maxAge = parseInt(directive.slice(8), 10);
    } else if (directive.startsWith('min-fresh=')) {
      result.minFresh = parseInt(directive.slice(10), 10);
    } else if (directive.startsWith('max-stale')) {
      // max-stale can have optional value: max-stale=60 or just max-stale (infinite)
      const equals = directive.indexOf('=');
      if (equals !== -1) {
        result.maxStale = parseInt(directive.slice(equals + 1), 10);
      } else {
        result.maxStale = Infinity; // Accept any staleness
      }
    } else if (directive === 'only-if-cached') {
      result.onlyIfCached = true;
    } else if (directive === 'no-cache') {
      result.noCache = true;
    } else if (directive === 'no-store') {
      result.noStore = true;
    }
  }

  return result;
}

/**
 * Parse Cache-Control header into structured directives (for response headers)
 */
function parseCacheControl(header: string | null): Partial<CacheEntry> {
  if (!header) return {};

  const result: Partial<CacheEntry> = {};
  const directives = header.toLowerCase().split(',').map(d => d.trim());

  for (const directive of directives) {
    if (directive.startsWith('max-age=')) {
      result.maxAge = parseInt(directive.slice(8), 10);
    } else if (directive.startsWith('s-maxage=')) {
      result.sMaxAge = parseInt(directive.slice(9), 10);
    } else if (directive.startsWith('stale-while-revalidate=')) {
      result.staleWhileRevalidate = parseInt(directive.slice(23), 10);
    } else if (directive.startsWith('stale-if-error=')) {
      result.staleIfError = parseInt(directive.slice(15), 10);
    } else if (directive === 'no-cache') {
      result.noCache = true;
    } else if (directive === 'no-store') {
      result.noStore = true;
    } else if (directive === 'must-revalidate') {
      result.mustRevalidate = true;
    } else if (directive === 'private') {
      result.isPrivate = true;
    } else if (directive === 'public') {
      result.isPublic = true;
    }
  }

  return result;
}

/**
 * Check if cached entry is fresh based on TTL and Cache-Control
 * Follows RFC-7234 precedence: s-maxage > max-age > Expires > heuristic
 */
function isFresh(entry: CacheEntry, now: number): boolean {
  const age = (now - entry.timestamp) / 1000; // in seconds

  // s-maxage takes precedence for shared caches
  if (entry.sMaxAge !== undefined) {
    return age < entry.sMaxAge;
  }

  // Then max-age
  if (entry.maxAge !== undefined) {
    return age < entry.maxAge;
  }

  // RFC-7234: Use Expires header if present (legacy HTTP/1.0)
  if (entry.expires !== undefined) {
    return now < entry.expires;
  }

  // RFC-7234 Section 4.2.2: Heuristic freshness calculation
  // If no explicit freshness lifetime, use 10% of the time since Last-Modified
  if (entry.lastModified) {
    const lastModifiedTime = new Date(entry.lastModified).getTime();
    if (!isNaN(lastModifiedTime)) {
      // Get Date header from cached response, or use timestamp as fallback
      const dateTime = entry.headers['date']
        ? new Date(entry.headers['date']).getTime()
        : entry.timestamp;

      if (!isNaN(dateTime) && dateTime > lastModifiedTime) {
        // Heuristic: 10% of the time between Date and Last-Modified
        const timeSinceModified = (dateTime - lastModifiedTime) / 1000; // in seconds
        const heuristicFreshness = timeSinceModified * 0.1;
        return age < heuristicFreshness;
      }
    }
  }

  // No freshness information at all - assume stale for safety
  return false;
}

/**
 * Check if cached entry satisfies request Cache-Control directives (RFC-7234 Section 5.2)
 * Returns { allowed: boolean, reason?: string }
 */
function satisfiesRequestDirectives(
  entry: CacheEntry,
  now: number,
  reqDirectives: RequestCacheControl
): { allowed: boolean; reason?: string } {
  const age = (now - entry.timestamp) / 1000; // in seconds
  const responseMaxAge = entry.sMaxAge ?? entry.maxAge ?? Infinity;
  const currentFreshness = responseMaxAge - age; // How much freshness remains (can be negative if stale)
  const fresh = isFresh(entry, now);

  // RFC-7234: max-age - client won't accept response older than this age
  if (reqDirectives.maxAge !== undefined && age > reqDirectives.maxAge) {
    return { allowed: false, reason: 'exceeds-request-max-age' };
  }

  // RFC-7234: min-fresh - client wants response to still be fresh for at least this long
  // Only check if the response is currently fresh (for stale responses, currentFreshness is negative)
  if (reqDirectives.minFresh !== undefined) {
    if (!fresh || currentFreshness < reqDirectives.minFresh) {
      return { allowed: false, reason: 'insufficient-freshness' };
    }
  }

  // RFC-7234: only-if-cached overrides freshness requirements
  // If only-if-cached is set, accept stale content without requiring max-stale
  if (reqDirectives.onlyIfCached) {
    return { allowed: true };
  }

  // RFC-7234: max-stale - client willing to accept stale response
  // If response is stale and no max-stale was provided, reject it
  if (!fresh && reqDirectives.maxStale === undefined) {
    return { allowed: false, reason: 'stale-not-acceptable' };
  }

  // If stale with max-stale, check staleness doesn't exceed the limit
  if (!fresh && reqDirectives.maxStale !== undefined) {
    const staleness = age - responseMaxAge;
    if (reqDirectives.maxStale !== Infinity && staleness > reqDirectives.maxStale) {
      return { allowed: false, reason: 'exceeds-max-stale' };
    }
  }

  return { allowed: true };
}

/**
 * Check if entry can be served stale during revalidation
 */
function canServeStale(entry: CacheEntry, now: number): boolean {
  if (!entry.staleWhileRevalidate) return false;

  const age = (now - entry.timestamp) / 1000;
  const maxAge = entry.sMaxAge ?? entry.maxAge ?? 0;
  const staleTime = age - maxAge;

  return staleTime < entry.staleWhileRevalidate;
}

/**
 * Create a request with conditional headers for revalidation
 * Also disables throwHttpErrors since 304 is a valid response
 */
function createConditionalRequest(req: ReckerRequest, entry: CacheEntry): ReckerRequest {
  // Clone headers and add conditional headers
  const conditionalHeaders = new Headers(req.headers);

  if (entry.etag) {
    conditionalHeaders.set('If-None-Match', entry.etag);
  }

  if (entry.lastModified) {
    conditionalHeaders.set('If-Modified-Since', entry.lastModified);
  }

  // Create new request with throwHttpErrors=false to allow 304 responses
  return new HttpRequest(req.url, {
    method: req.method,
    headers: conditionalHeaders,
    body: req.body,
    signal: req.signal,
    throwHttpErrors: false, // Allow 304 to pass through
    timeout: req.timeout,
    onUploadProgress: req.onUploadProgress,
    onDownloadProgress: req.onDownloadProgress,
    maxResponseSize: req.maxResponseSize
  });
}

/**
 * Store a cache entry with proper Vary header handling
 * If entry has Vary, stores at both base key (for vary discovery) and vary-adjusted key (for actual content)
 */
async function storeCacheEntry(
  storage: CacheStorage,
  baseKey: string,
  req: ReckerRequest,
  entry: CacheEntry,
  ttl: number,
  keyGenerator: (req: ReckerRequest, varyHeaders?: string) => string
): Promise<void> {
  if (entry.vary) {
    // Store full entry at vary-adjusted key
    const varyKey = keyGenerator(req, entry.vary);
    await storage.set(varyKey, entry, ttl);

    // Also store a minimal entry at base key for vary discovery
    // This allows future requests to find the vary header
    const varyMarker: CacheEntry = {
      ...entry,
      body: '', // Don't duplicate body
    };
    await storage.set(baseKey, varyMarker, ttl);
  } else {
    // No vary, just store at base key
    await storage.set(baseKey, entry, ttl);
  }
}

/**
 * Create cache entry from response
 */
async function createCacheEntry(response: ReckerResponse, body: string, now: number): Promise<CacheEntry> {
  const headers: Record<string, string> = {};
  response.headers.forEach((v, k) => { headers[k] = v; });

  const cacheControl = parseCacheControl(response.headers.get('Cache-Control'));

  // Parse Expires header (RFC 7234 legacy support)
  let expires: number | undefined;
  const expiresHeader = response.headers.get('Expires');
  if (expiresHeader) {
    const expiresDate = new Date(expiresHeader);
    if (!isNaN(expiresDate.getTime())) {
      expires = expiresDate.getTime();
    }
  }

  return {
    status: response.status,
    statusText: response.statusText,
    headers,
    body,
    timestamp: now,
    etag: response.headers.get('ETag') || undefined,
    lastModified: response.headers.get('Last-Modified') || undefined,
    vary: response.headers.get('Vary') || undefined,
    expires,
    ...cacheControl
  };
}

/**
 * Create a ReckerResponse from cached entry
 */
function createCachedResponse(entry: CacheEntry, cacheStatus: 'hit' | 'stale' | 'revalidated' | 'stale-error'): ReckerResponse {
  const headers = new Headers(entry.headers);
  headers.set('X-Cache', cacheStatus);
  headers.set('X-Cache-Age', String(Math.floor((Date.now() - entry.timestamp) / 1000)));

  if (cacheStatus === 'stale' || cacheStatus === 'stale-error') {
    const warningCode = cacheStatus === 'stale' ? 110 : 111;
    const warningText = cacheStatus === 'stale' ? 'Response is Stale' : 'Revalidation Failed';
    const existingWarning = headers.get('Warning');
    if (existingWarning) {
        headers.set('Warning', `${existingWarning}, ${warningCode} - "${warningText}"`);
    } else {
        headers.set('Warning', `${warningCode} - "${warningText}"`);
    }
  }

  // Explicitly create Response with status/headers
  const response = new Response(entry.body, {
    status: entry.status,
    statusText: entry.statusText,
    headers
  });

  const httpResponse = new HttpResponse(response);
  return httpResponse;
}

export function cache(options: CacheOptions = {}): Plugin {
  const storage = options.storage || new MemoryStorage();
  const strategy = options.strategy || 'cache-first';
  const ttl = options.ttl || 60 * 1000; // 1 minute default
  const methods = options.methods || ['GET'];
  const respectCacheControl = options.respectCacheControl !== false;
  const forceRevalidate = options.forceRevalidate === true;

  const generateKey = options.keyGenerator || ((req: ReckerRequest, varyHeaders?: string) => {
    let key = `${req.method}:${req.url}`;

    // Add body hash for non-GET methods to allow semantic caching (critical for AI/LLM prompts)
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      try {
        const bodyStr = typeof req.body === 'string'
          ? req.body
          : (req.body instanceof Buffer ? req.body.toString() : JSON.stringify(req.body));

        if (bodyStr) {
          const hash = createHash('sha256').update(bodyStr).digest('hex').substring(0, 16);
          key += `:${hash}`;
        }
      } catch {
        // If body serialization fails (e.g. circular structure or Stream), skip hash
        // This means un-hashable bodies won't be distinguished, which is safer than crashing
      }
    }

    // RFC-7234: Include Vary headers in cache key
    if (varyHeaders && options.respectVary !== false) {
      const varyHeaderNames = varyHeaders.split(',').map(h => h.trim().toLowerCase());
      const varyParts: string[] = [];

      for (const headerName of varyHeaderNames) {
        // Vary: * means response varies on everything, should not be cached
        if (headerName === '*') {
          return `${key}:vary-*:${Date.now()}`; // Unique key to prevent caching
        }

        const headerValue = req.headers.get(headerName);
        if (headerValue) {
          varyParts.push(`${headerName}=${headerValue}`);
        }
      }

      if (varyParts.length > 0) {
        key += `:vary:${varyParts.join('|')}`;
      }
    }

    return key;
  });

  const cacheMiddleware: Middleware = async (req, next) => {
    // Cache Invalidation (Cache Busting) for unsafe methods
    // Includes WebDAV write methods and explicit PURGE
    const unsafeMethods = [
        'POST', 'PUT', 'PATCH', 'DELETE', 
        'PROPPATCH', 'MKCOL', 'COPY', 'MOVE', 'LOCK', 'UNLOCK', 
        'LINK', 'UNLINK', 'PURGE'
    ];

    if (unsafeMethods.includes(req.method)) {
      const response = await next(req);
      // PURGE typically invalidates regardless of upstream success, but strictly speaking we only know it worked if 2xx.
      // For local cache consistency, if we sent a mutation, we should assume the data is stale/changed.
      if (response.ok) {
        // Invalidate matching GET/HEAD entries
        await storage.delete(`GET:${req.url}`);
        await storage.delete(`HEAD:${req.url}`);
        
        // For MOVE/COPY, we ideally invalidate destination too, but we don't parse Destination header here easily.
      }
      return response;
    }

    // Only cache specified methods (default: GET)
    if (!methods.includes(req.method)) {
      return next(req);
    }

    // Parse request Cache-Control directives (RFC-7234 Section 5.2)
    const reqCacheControl = respectCacheControl
      ? parseRequestCacheControl(req.headers.get('Cache-Control'))
      : {};

    // Skip caching if request has Cache-Control: no-store
    if (respectCacheControl && reqCacheControl.noStore) {
      return next(req);
    }

    // RFC-7234: Pragma: no-cache is deprecated but equivalent to Cache-Control: no-cache
    if (respectCacheControl) {
      const reqPragma = req.headers.get('Pragma');
      if (reqPragma?.includes('no-cache')) {
        // Bypass cache entirely for Pragma: no-cache
        return next(req);
      }
    }

    // Generate base cache key (without Vary)
    const baseKey = generateKey(req);
    let key = baseKey;
    const now = Date.now();

    // Try to get a base entry to check for Vary header
    let cachedEntry: CacheEntry | undefined | null;
    if (options.respectVary !== false) {
      const baseEntry = await storage.get(baseKey);

      // If entry has Vary header, regenerate key with varying headers
      if (baseEntry?.vary) {
        key = generateKey(req, baseEntry.vary);
        // Fetch from the vary-adjusted key (don't use baseEntry as it might be a marker)
        cachedEntry = await storage.get(key);
      } else if (baseEntry?.body) {
        // Base entry without vary, or with body - use it
        cachedEntry = baseEntry;
      } else {
        // No entry or empty marker
        cachedEntry = undefined;
      }
    } else {
      cachedEntry = await storage.get(key);
    }

    // RFC-7234: Handle only-if-cached directive
    if (reqCacheControl.onlyIfCached) {
      if (!cachedEntry) {
        // No cached entry and only-if-cached requested
        // Return 504 Gateway Timeout per RFC-7234 Section 5.2.1.7
        const response = new Response(null, {
          status: 504,
          statusText: 'Gateway Timeout'
        });
        return new HttpResponse(response);
      }
      // Have cached entry, check if it satisfies request directives
      const satisfaction = satisfiesRequestDirectives(cachedEntry, now, reqCacheControl);
      if (!satisfaction.allowed) {
        // Cached entry doesn't satisfy directives
        const response = new Response(null, {
          status: 504,
          statusText: 'Gateway Timeout'
        });
        return new HttpResponse(response);
      }
      // Return cached entry regardless of freshness (only-if-cached overrides freshness)
      return createCachedResponse(cachedEntry, isFresh(cachedEntry, now) ? 'hit' : 'stale');
    }

    // Check if cached entry satisfies request directives
    // Only check for network-first when client actually sends directives
    // cache-first and stale-while-revalidate ignore freshness by design
    const hasRequestDirectives = Object.keys(reqCacheControl).length > 0;
    if (cachedEntry && respectCacheControl && hasRequestDirectives && strategy === 'network-first') {
      const satisfaction = satisfiesRequestDirectives(cachedEntry, now, reqCacheControl);
      if (!satisfaction.allowed) {
        // Entry doesn't satisfy request directives, treat as cache miss
        cachedEntry = undefined;
      }
    }

    // network-only strategy: never use cache
    if (strategy === 'network-only') {
      const response = await next(req);
      // Still store for potential future use if switching strategies
      if (response.ok && respectCacheControl) {
        const cacheControl = parseCacheControl(response.headers.get('Cache-Control'));
        if (!cacheControl.noStore) {
          const clonedResponse = response.raw.clone();
          const body = await clonedResponse.text();
          const entry = await createCacheEntry(response, body, now);
          const entryTtl = (entry.sMaxAge ?? entry.maxAge ?? ttl / 1000) * 1000;
          // Use storeCacheEntry helper
          await storeCacheEntry(storage, baseKey, req, entry, entryTtl, generateKey);
        }
      }
      return response;
    }

    // cachedEntry is already fetched above with Vary-adjusted key if needed

    // ==== RFC-COMPLIANT STRATEGY ====
    if (strategy === 'rfc-compliant' || strategy === 'revalidate') {
      if (cachedEntry) {
        const fresh = isFresh(cachedEntry, now);
        const satisfaction = satisfiesRequestDirectives(cachedEntry, now, reqCacheControl);

        // Check if we can/should revalidate
        const hasValidators = cachedEntry.etag || cachedEntry.lastModified;

        if (!satisfaction.allowed && !hasValidators) {
          // If cached entry doesn't satisfy request directives AND has no validators,
          // treat as a cache miss and proceed to network.
          cachedEntry = undefined;
        } else if (fresh && !forceRevalidate && !cachedEntry.noCache && !reqCacheControl.noCache) {
          // If fresh, allowed by client directives, and no revalidation forced, return cached.
          return createCachedResponse(cachedEntry, 'hit');
        } else if (!fresh && reqCacheControl.maxStale !== undefined && !forceRevalidate && !reqCacheControl.noCache) {
          // RFC-7234: If client explicitly allows stale (max-stale), serve without revalidation
          return createCachedResponse(cachedEntry, 'stale');
        }
        // If stale but has validators, proceed to revalidation below.
        // If not fresh, or revalidation forced, or client requests no-cache, proceed to revalidation below.
      }

      // If no cachedEntry (or not satisfied), or if revalidation is required
      if (cachedEntry) {
        // Need to revalidate - use conditional request
        const conditionalReq = createConditionalRequest(req, cachedEntry);

        try {
          const response = await next(conditionalReq);

          // 304 Not Modified - refresh the cache entry's timestamp
          if (response.status === 304) {
            const updatedEntry: CacheEntry = {
              ...cachedEntry,
              timestamp: now,
              // Update validators if new ones provided
              etag: response.headers.get('ETag') || cachedEntry.etag,
              lastModified: response.headers.get('Last-Modified') || cachedEntry.lastModified,
            };

            const freshnessTtl = (updatedEntry.sMaxAge ?? updatedEntry.maxAge ?? ttl / 1000) * 1000;
            const storageTtl = Math.max(freshnessTtl, ttl);
            await storage.set(key, updatedEntry, storageTtl);

            // Directly return the cached response, preventing it from going to httpErrorMiddleware
            return createCachedResponse(updatedEntry, 'revalidated');
          }

          // New response - cache it
          if (response.ok) {
            const cacheControl = parseCacheControl(response.headers.get('Cache-Control'));
            if (!cacheControl.noStore) {
              const clonedResponse = response.raw.clone();
              const body = await clonedResponse.text();
              const entry = await createCacheEntry(response, body, now);
              const freshnessTtl = (entry.sMaxAge ?? entry.maxAge ?? ttl / 1000) * 1000;
              // Ensure we store it long enough to allow revalidation of stale entries
              // Use the greater of freshness TTL or default/configured TTL
              const storageTtl = Math.max(freshnessTtl, ttl);
              // Use storeCacheEntry helper
              await storeCacheEntry(storage, baseKey, req, entry, storageTtl, generateKey);
            }
          }

          return response;

        } catch (error) {
          // Network error - serve stale if allowed
          if (cachedEntry.staleIfError && canServeStale(cachedEntry, now)) {
            return createCachedResponse(cachedEntry, 'stale-error');
          }
          throw error;
        }
      }

      // No cache entry - fetch and cache
      const response = await next(req);

      if (response.ok) {
        const cacheControl = parseCacheControl(response.headers.get('Cache-Control'));
        if (!cacheControl.noStore) {
          const clonedResponse = response.raw.clone();
          const body = await clonedResponse.text();
          const entry = await createCacheEntry(response, body, now);
          const freshnessTtl = (entry.sMaxAge ?? entry.maxAge ?? ttl / 1000) * 1000;
          const storageTtl = Math.max(freshnessTtl, ttl);
          // Use storeCacheEntry helper
          await storeCacheEntry(storage, baseKey, req, entry, storageTtl, generateKey);
        }
      }

      return response;
    }

    // ==== CACHE-FIRST STRATEGY ====
    if (strategy === 'cache-first') {
      if (cachedEntry) {
        return createCachedResponse(cachedEntry, 'hit');
      }

      const response = await next(req);

      if (response.ok) {
        const clonedResponse = response.raw.clone();
        const body = await clonedResponse.text();
        const entry = await createCacheEntry(response, body, now);
        // Use storeCacheEntry helper
        await storeCacheEntry(storage, baseKey, req, entry, ttl, generateKey);
      }

      return response;
    }

    // ==== STALE-WHILE-REVALIDATE STRATEGY ====
    if (strategy === 'stale-while-revalidate') {
      if (cachedEntry) {
        // Return cached immediately
        const cachedResponse = createCachedResponse(cachedEntry, 'stale');

        // Background revalidation (fire and forget)
        (async () => {
          try {
            const conditionalReq = createConditionalRequest(req, cachedEntry);
            const freshResponse = await next(conditionalReq);

            if (freshResponse.status === 304) {
              // Just refresh timestamp
              const updatedEntry: CacheEntry = {
                ...cachedEntry,
                timestamp: Date.now()
              };
              // Use original TTL for simplicity, or could recalculate if headers changed
              await storage.set(key, updatedEntry, ttl);
            } else if (freshResponse.ok) {
              const clonedResponse = freshResponse.raw.clone();
              const body = await clonedResponse.text();
              const entry = await createCacheEntry(freshResponse, body, Date.now());
              
              const freshnessTtl = (entry.sMaxAge ?? entry.maxAge ?? ttl / 1000) * 1000;
              const storageTtl = Math.max(freshnessTtl, ttl);
              
              // Use storeCacheEntry helper
              await storeCacheEntry(storage, baseKey, req, entry, storageTtl, generateKey);
            }
          } catch {
            // Background revalidation failed silently, keep using stale
          }
        })();

        return cachedResponse;
      }

      // No cached entry, must fetch
      const response = await next(req);

      if (response.ok) {
        const clonedResponse = response.raw.clone();
        const body = await clonedResponse.text();
        const entry = await createCacheEntry(response, body, now);
        // Use storeCacheEntry helper
        await storeCacheEntry(storage, baseKey, req, entry, ttl, generateKey);
      }

      return response;
    }

    // ==== NETWORK-FIRST STRATEGY ====
    if (strategy === 'network-first') {
      try {
        const response = await next(req);

        if (response.ok) {
          const clonedResponse = response.raw.clone();
          const body = await clonedResponse.text();
          const entry = await createCacheEntry(response, body, now);
          
          const freshnessTtl = (entry.sMaxAge ?? entry.maxAge ?? ttl / 1000) * 1000;
          const storageTtl = Math.max(freshnessTtl, ttl);
          
          // Use storeCacheEntry helper
          await storeCacheEntry(storage, baseKey, req, entry, storageTtl, generateKey);
        }

        return response;
      } catch (error) {
        // Network failed, try cache
        if (cachedEntry) {
          return createCachedResponse(cachedEntry, 'stale-error');
        }
        throw error;
      }
    }

    // Fallback: network only
    return next(req);
  };

  return (client) => {
    client.use(cacheMiddleware);
  };
}

// Re-export helper for external use
export { parseCacheControl };

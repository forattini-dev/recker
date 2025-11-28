import { CacheStorage, CacheStrategy, Middleware, Plugin, ReckerRequest, ReckerResponse } from '../types/index.js';
import { HttpResponse } from '../core/response.js';
import { MemoryStorage } from '../cache/memory-storage.js';

export interface CacheOptions {
  storage?: CacheStorage;
  strategy?: CacheStrategy;
  ttl?: number; // Time to live in milliseconds
  methods?: string[]; // Methods to cache (default: GET)
  keyGenerator?: (req: ReckerRequest) => string;
}

export function cache(options: CacheOptions = {}): Plugin {
  const storage = options.storage || new MemoryStorage();
  const strategy = options.strategy || 'cache-first';
  const ttl = options.ttl || 60 * 1000; // 1 minute default
  const methods = options.methods || ['GET'];
  
  const generateKey = options.keyGenerator || ((req: ReckerRequest) => {
    return `${req.method}:${req.url}`;
  });

  const cacheMiddleware: Middleware = async (req, next) => {
    if (!methods.includes(req.method)) {
      return next(req);
    }

    const key = generateKey(req);

    if (strategy === 'network-only') {
        return next(req);
    }

    // Try to get from cache
    const cachedEntry = await storage.get(key);

    if (cachedEntry) {
      if (strategy === 'cache-first' || strategy === 'stale-while-revalidate') {
        // Return cached response
        const cachedResponse = new Response(cachedEntry.body, {
          status: cachedEntry.status,
          statusText: cachedEntry.statusText,
          headers: cachedEntry.headers,
        });
        
        const reckerResponse = new HttpResponse(cachedResponse);
        
        // If stale-while-revalidate, trigger network update in background
        if (strategy === 'stale-while-revalidate') {
           // Fire and forget
           (async () => {
             try {
               const freshResponse = await next(req);
               if (freshResponse.ok) {
                 const text = await freshResponse.text();
                 const headers: Record<string, string> = {};
                 freshResponse.headers.forEach((v, k) => headers[k] = v);
                 
                 await storage.set(key, {
                   status: freshResponse.status,
                   statusText: freshResponse.statusText,
                   headers: headers,
                   body: text,
                   timestamp: Date.now(),
                 }, ttl);
               }
             } catch (err) {
               // Background update failed, silent ignore
               console.error('Background cache revalidation failed', err);
             }
           })();
        }

        // Add a header to indicate cache hit
        // Note: Headers in standard Response are read-only if we don't reconstruct properly, 
        // but we created a new Response so we might be able to append if we cloned headers.
        // For now, just return.
        return reckerResponse;
      }
    }

    // Cache miss or network-first
    const response = await next(req);

    if (response.ok) {
      // We need to clone the response because consuming the body (text()) locks/uses the stream.
      // Standard fetch response.clone() exists.
      const clonedResponse = response.raw.clone();
      const text = await clonedResponse.text();
      
      const headers: Record<string, string> = {};
      response.headers.forEach((v, k) => headers[k] = v);

      await storage.set(key, {
        status: response.status,
        statusText: response.statusText,
        headers: headers,
        body: text,
        timestamp: Date.now(),
      }, ttl);
    }

    return response;
  };

  return (client) => {
    client.use(cacheMiddleware);
  };
}

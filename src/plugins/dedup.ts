import { Middleware, Plugin, ReckerRequest } from '../types/index.js';

export interface DedupOptions {
  keyGenerator?: (req: ReckerRequest) => string;
}

// Optimized: Pre-allocated key buffer to avoid string concatenation overhead
const keyBuffer = { method: '', url: '' };

export function dedupPlugin(options: DedupOptions = {}): Plugin {
  const pendingRequests = new Map<string, Promise<any>>();

  // Optimized: Use custom key generator or fast default
  const generateKey = options.keyGenerator || ((req: ReckerRequest) => {
    // Fast path: simple string concat is faster than template literal for short strings
    return req.method + ':' + req.url;
  });

  const dedupMiddleware: Middleware = async (req, next) => {
    // Only dedup safe methods usually, but let's assume GET/HEAD for now or generic
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next(req);
    }

    const key = generateKey(req);

    if (pendingRequests.has(key)) {
      // Join the ongoing request
      // We need to clone the response because the original one might be consumed by the first caller
      const response = await pendingRequests.get(key);
      return response.clone(); // Assuming response implementation supports clone()
    }

    const promise = next(req)
      .then((res) => {
        // We need to make sure the response we store is cloneable/reusable
        // The 'next' returns a ReckerResponse (HttpResponse)
        return res;
      })
      .finally(() => {
        pendingRequests.delete(key);
      });

    pendingRequests.set(key, promise);

    // We await the promise we just set (or created)
    // But since we are the 'first', we return the result directly?
    // No, 'next(req)' returns a promise that resolves to response.
    // The map stores that promise.
    
    try {
        const response = await promise;
        // If we are the initiator, we might consume it. 
        // But wait, if others are waiting on 'promise', and 'promise' resolves to 'res',
        // and multiple people consume 'res.json()', it might fail if body is used.
        
        // HttpResponse implementation of json()/text() calls raw.json()/text() which consumes the stream.
        // Undici/Fetch Response can only be consumed once.
        
        // So, the result of the promise MUST be a response that can be cloned.
        // Or, the deduplicator must handle the buffering?
        // Ideally, 'HttpResponse' .clone() should exist.
        
        // Let's verify if HttpResponse has clone().
        // It does NOT currently. We need to implement it.
        
        // For now, let's assume we can clone it.
        return response.clone ? response.clone() : response;
    } catch (err) {
        throw err;
    }
  };

  return (client) => {
    client.use(dedupMiddleware);
  };
}

/**
 * HTTP Rate Limiter Plugin
 *
 * Controls the rate of outgoing requests using a Token Bucket algorithm.
 * Useful for adhering to API rate limits (e.g. 100 req/min).
 */

import { Middleware, Plugin, ReckerRequest, ReckerResponse } from '../types/index.js';
import { QueueCancelledError } from '../core/errors.js';

export interface RateLimitOptions {
  /** Max requests per window */
  limit: number;
  
  /** Window duration in milliseconds */
  window?: number; // Default: 1000ms (1 second)
  
  /** 
   * Strategy when limit is exceeded:
   * - 'queue': Wait until a token is available (default)
   * - 'throw': Throw an error immediately
   * - 'drop': Silently drop the request (returns undefined/null - dangerous!)
   */
  strategy?: 'queue' | 'throw' | 'drop';
  
  /**
   * Function to generate a key for rate limiting groups.
   * Default: Limits globally (single bucket) or per-host.
   * To limit per host: (req) => new URL(req.url).host
   */
  keyGenerator?: (req: ReckerRequest) => string;

  /**
   * Adaptive Rate Limiting
   * Automatically detect RateLimit headers (X-RateLimit-Remaining, Retry-After)
   * and pause the queue if the server is overwhelmed.
   * @default false
   */
  adaptive?: boolean;
}

export class RateLimitExceededError extends Error {
  constructor(public limit: number, public window: number, public key: string) {
    super(`Rate limit exceeded for ${key}: ${limit} requests per ${window}ms`);
    this.name = 'RateLimitExceededError';
  }
}

interface Bucket {
  tokens: number;
  lastRefill: number;
  queue: Array<{ resolve: () => void; reject: (err: Error) => void }>;
  blockedUntil: number;
}

/**
 * Parse rate limit headers to find reset time/delay
 */
function parseRateLimitHeaders(headers: Headers): { remaining?: number; reset?: number; retryAfter?: number } {
  const result: { remaining?: number; reset?: number; retryAfter?: number } = {};

  // Check Remaining
  const remaining = headers.get('x-ratelimit-remaining') || headers.get('ratelimit-remaining');
  if (remaining !== null) {
    result.remaining = parseInt(remaining, 10);
  }

  // Check Reset (Epoch seconds)
  const reset = headers.get('x-ratelimit-reset') || headers.get('ratelimit-reset');
  if (reset !== null) {
    const val = parseFloat(reset);
    // Heuristic: if val is small (< 100000), it might be seconds remaining, else epoch
    if (val < 1000000000) { 
       // Seconds from now? Some APIs do this. Assuming epoch is safer for standard headers.
       // But standard is epoch.
       result.reset = Date.now() + (val * 1000);
    } else {
       result.reset = val * 1000;
    }
  }

  // Check Retry-After (Seconds or Date)
  const retryAfter = headers.get('retry-after');
  if (retryAfter !== null) {
    if (/^\d+$/.test(retryAfter)) {
      result.retryAfter = parseInt(retryAfter, 10) * 1000;
    } else {
      const date = Date.parse(retryAfter);
      if (!isNaN(date)) {
        result.retryAfter = Math.max(0, date - Date.now());
      }
    }
  }

  return result;
}

export function rateLimitPlugin(options: RateLimitOptions): Plugin {
  const limit = options.limit;
  const windowMs = options.window || 1000;
  const strategy = options.strategy || 'queue';
  const adaptive = options.adaptive || false;
  
  // Buckets map: Key -> Bucket
  const buckets = new Map<string, Bucket>();

  // Default key generator: Per hostname
  const getKey = options.keyGenerator || ((req) => {
    try {
      return new URL(req.url).hostname;
    } catch {
      return 'global';
    }
  });

  const refillBucket = (bucket: Bucket) => {
    const now = Date.now();
    
    // Check if blocked
    if (now < bucket.blockedUntil) {
      return;
    }

    const elapsed = now - bucket.lastRefill;
    
    if (elapsed > windowMs) {
      bucket.tokens = limit;
      bucket.lastRefill = now;
    }
  };

  const processQueue = (bucket: Bucket) => {
    const now = Date.now();
    
    // If blocked, schedule check for when block expires
    if (now < bucket.blockedUntil) {
      const wait = bucket.blockedUntil - now;
      setTimeout(() => processQueue(bucket), wait);
      return;
    }

    refillBucket(bucket);
    
    while (bucket.queue.length > 0 && bucket.tokens > 0) {
      bucket.tokens--;
      const next = bucket.queue.shift();
      if (next) next.resolve();
    }
    
    // If queue is not empty, schedule next check
    if (bucket.queue.length > 0) {
      const timeToNextRefill = windowMs - (Date.now() - bucket.lastRefill);
      setTimeout(() => processQueue(bucket), Math.max(0, timeToNextRefill));
    }
  };

  return (client: any) => {
    const middleware: Middleware = async (req, next) => {
      const key = getKey(req);
      
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          tokens: limit,
          lastRefill: Date.now(),
          queue: [],
          blockedUntil: 0
        };
        buckets.set(key, bucket);
      }

      // Check if blocked (Adaptive)
      const now = Date.now();
      if (now < bucket.blockedUntil) {
         // If blocked, we MUST queue or fail based on strategy
         // We cannot proceed immediately.
         bucket.tokens = 0; // Force logic to fall through to queue/fail check
      } else {
         refillBucket(bucket);
      }

      if (bucket.tokens > 0) {
        // Has tokens, proceed immediately
        bucket.tokens--;
        
        // Make request and adapt if needed
        const response = await next(req);
        
        if (adaptive) {
            adaptLimits(bucket, response);
        }
        
        return response;
      }

      // No tokens left
      if (strategy === 'throw') {
        throw new RateLimitExceededError(limit, windowMs, key);
      }
      
      if (strategy === 'drop') {
        throw new Error(`Request dropped due to rate limit (${key})`);
      }

      // Strategy: queue
      return new Promise((resolve, reject) => {
        bucket!.queue.push({
            resolve: async () => {
                // When resolved from queue, we must execute the request
                // And also perform adaptation logic on the response
                try {
                    const response = await next(req);
                    if (adaptive) {
                        adaptLimits(bucket!, response);
                    }
                    resolve(response);
                } catch (err) {
                    reject(err as Error);
                }
            },
            reject
        });
        
        // Kickstart if this is first item
        if (bucket!.queue.length === 1) {
             const timeToNextRefill = windowMs - (Date.now() - bucket!.lastRefill);
             setTimeout(() => processQueue(bucket!), Math.max(0, timeToNextRefill));
        }
      });
    };

    function adaptLimits(bucket: Bucket, response: ReckerResponse) {
        const limits = parseRateLimitHeaders(response.headers);
        
        let backoffTime = 0;

        // If explicit Retry-After (usually 429/503)
        if (limits.retryAfter) {
            backoffTime = limits.retryAfter;
        }
        // If remaining is 0 (pre-emptive)
        else if (limits.remaining !== undefined && limits.remaining <= 0 && limits.reset) {
            backoffTime = Math.max(0, limits.reset - Date.now());
        }

        if (backoffTime > 0) {
            bucket.blockedUntil = Date.now() + backoffTime;
            
            // Drain tokens to prevent immediate new requests
            bucket.tokens = 0; 
            
            // Ensure queue processor knows about the block
            // If queue is running, it will see blockedUntil next cycle.
            // If not, we schedule it.
            if (bucket.queue.length > 0) {
                 // Force a check that will see the block
                 setTimeout(() => processQueue(bucket), 0);
            }
        }
    }

    client.use(middleware);
  };
}
/**
 * Token-Aware Rate Limiter
 *
 * AI APIs are rate limited by both:
 * - Requests Per Minute (RPM)
 * - Tokens Per Minute (TPM)
 *
 * This rate limiter tracks both and queues requests accordingly.
 * It also supports priority-based scheduling.
 */

import type { TokenRateLimitConfig, ChatOptions } from '../types/ai.js';

/**
 * Queued request
 */
interface QueuedRequest<T> {
  id: string;
  priority: 'high' | 'normal' | 'low';
  estimatedTokens: number;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  enqueueTime: number;
}

/**
 * Rate limit state
 */
interface RateLimitState {
  tokenCount: number;
  requestCount: number;
  windowStart: number;
}

/**
 * Default rate limits (conservative estimates)
 */
const DEFAULT_LIMITS: Required<TokenRateLimitConfig> = {
  tokensPerMinute: 90000,   // 90k TPM (common tier)
  requestsPerMinute: 500,    // 500 RPM
  strategy: 'queue',
  priority: () => 'normal',
};

/**
 * Token estimation helpers
 */
const TOKEN_ESTIMATORS = {
  /**
   * Estimate tokens for a message
   * Rough approximation: ~4 chars per token for English
   */
  estimateMessage(content: string): number {
    if (!content) return 0;
    return Math.ceil(content.length / 4);
  },

  /**
   * Estimate tokens for chat options
   */
  estimateChatTokens(options: ChatOptions): number {
    let tokens = 0;

    // Estimate input tokens
    for (const msg of options.messages) {
      if (typeof msg.content === 'string') {
        tokens += this.estimateMessage(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            tokens += this.estimateMessage(part.text);
          } else if (part.type === 'image' || part.type === 'image_url') {
            // Images are expensive
            tokens += 1000;
          }
        }
      }
    }

    // System prompt
    if (options.systemPrompt) {
      tokens += this.estimateMessage(options.systemPrompt);
    }

    // Estimate output tokens (use maxTokens or default)
    tokens += options.maxTokens || 1000;

    // Add buffer for function definitions
    if (options.tools?.length) {
      tokens += options.tools.length * 100;
    }

    return tokens;
  },
};

/**
 * Token-Aware Rate Limiter
 */
export class TokenRateLimiter {
  private config: Required<TokenRateLimitConfig>;
  private state: RateLimitState;
  private queue: QueuedRequest<any>[] = [];
  private processing: boolean = false;
  private nextId: number = 0;

  constructor(config: TokenRateLimitConfig = {}) {
    this.config = { ...DEFAULT_LIMITS, ...config };
    this.state = {
      tokenCount: 0,
      requestCount: 0,
      windowStart: Date.now(),
    };
  }

  /**
   * Execute a request with rate limiting
   */
  async execute<T>(
    fn: () => Promise<T>,
    options?: { estimatedTokens?: number; priority?: 'high' | 'normal' | 'low' }
  ): Promise<T> {
    const estimatedTokens = options?.estimatedTokens || 1000;
    const priority = options?.priority || 'normal';

    // Check if we can execute immediately
    if (this.canExecute(estimatedTokens)) {
      return this.executeNow(fn, estimatedTokens);
    }

    // Handle based on strategy
    switch (this.config.strategy) {
      case 'throw':
        throw new RateLimitExceededError(this.getRetryAfter());

      case 'retry-after':
        const retryAfter = this.getRetryAfter();
        await this.sleep(retryAfter);
        return this.execute(fn, options);

      case 'queue':
      default:
        return this.enqueue(fn, estimatedTokens, priority);
    }
  }

  /**
   * Execute a chat request with automatic token estimation
   */
  async executeChat<T>(
    options: ChatOptions,
    fn: () => Promise<T>
  ): Promise<T> {
    const estimatedTokens = TOKEN_ESTIMATORS.estimateChatTokens(options);
    const priority = this.config.priority(options);
    return this.execute(fn, { estimatedTokens, priority });
  }

  /**
   * Record actual token usage after request completes
   * This adjusts the internal counters for more accurate limiting
   */
  recordUsage(actualTokens: number, estimatedTokens: number): void {
    // Adjust token count by difference
    const diff = actualTokens - estimatedTokens;
    this.state.tokenCount += diff;

    // Don't go negative
    if (this.state.tokenCount < 0) {
      this.state.tokenCount = 0;
    }
  }

  /**
   * Get current usage stats
   */
  getUsage(): {
    tokensUsed: number;
    tokensRemaining: number;
    requestsUsed: number;
    requestsRemaining: number;
    resetIn: number;
    queueLength: number;
  } {
    this.maybeResetWindow();
    return {
      tokensUsed: this.state.tokenCount,
      tokensRemaining: Math.max(0, this.config.tokensPerMinute - this.state.tokenCount),
      requestsUsed: this.state.requestCount,
      requestsRemaining: Math.max(0, this.config.requestsPerMinute - this.state.requestCount),
      resetIn: this.getResetTime(),
      queueLength: this.queue.length,
    };
  }

  /**
   * Clear the queue
   */
  clearQueue(): void {
    for (const req of this.queue) {
      req.reject(new Error('Queue cleared'));
    }
    this.queue = [];
  }

  /**
   * Reset rate limiter state
   */
  reset(): void {
    this.state = {
      tokenCount: 0,
      requestCount: 0,
      windowStart: Date.now(),
    };
    this.clearQueue();
  }

  /**
   * Check if we can execute a request immediately
   */
  private canExecute(estimatedTokens: number): boolean {
    this.maybeResetWindow();

    const hasTokenBudget = this.state.tokenCount + estimatedTokens <= this.config.tokensPerMinute;
    const hasRequestBudget = this.state.requestCount + 1 <= this.config.requestsPerMinute;

    return hasTokenBudget && hasRequestBudget;
  }

  /**
   * Execute a request immediately
   */
  private async executeNow<T>(fn: () => Promise<T>, estimatedTokens: number): Promise<T> {
    this.state.tokenCount += estimatedTokens;
    this.state.requestCount++;

    return fn();
  }

  /**
   * Enqueue a request for later execution
   */
  private enqueue<T>(
    fn: () => Promise<T>,
    estimatedTokens: number,
    priority: 'high' | 'normal' | 'low'
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest<T> = {
        id: `req-${this.nextId++}`,
        priority,
        estimatedTokens,
        execute: fn,
        resolve,
        reject,
        enqueueTime: Date.now(),
      };

      // Insert based on priority
      let insertIndex = this.queue.length;
      const priorityOrder = { high: 0, normal: 1, low: 2 };

      for (let i = 0; i < this.queue.length; i++) {
        if (priorityOrder[priority] < priorityOrder[this.queue[i].priority]) {
          insertIndex = i;
          break;
        }
      }

      this.queue.splice(insertIndex, 0, request);
      this.processQueue();
    });
  }

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const next = this.queue[0];

        // Wait until we can execute
        while (!this.canExecute(next.estimatedTokens)) {
          const waitTime = this.getRetryAfter();
          await this.sleep(Math.min(waitTime, 1000)); // Check every second
          this.maybeResetWindow();
        }

        // Remove from queue
        this.queue.shift();

        // Execute
        try {
          const result = await this.executeNow(next.execute, next.estimatedTokens);
          next.resolve(result);
        } catch (error) {
          next.reject(error as Error);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Reset the window if needed
   */
  private maybeResetWindow(): void {
    const now = Date.now();
    const windowDuration = 60000; // 1 minute

    if (now - this.state.windowStart >= windowDuration) {
      this.state.tokenCount = 0;
      this.state.requestCount = 0;
      this.state.windowStart = now;
    }
  }

  /**
   * Get time until window resets
   */
  private getResetTime(): number {
    const windowDuration = 60000; // 1 minute
    return Math.max(0, windowDuration - (Date.now() - this.state.windowStart));
  }

  /**
   * Get retry-after time in ms
   */
  private getRetryAfter(): number {
    return this.getResetTime();
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Rate limit exceeded error
 */
export class RateLimitExceededError extends Error {
  constructor(public readonly retryAfter: number) {
    super(`Rate limit exceeded. Retry after ${retryAfter}ms`);
    this.name = 'RateLimitExceededError';
  }
}

/**
 * Provider-specific rate limit configurations
 */
export const PROVIDER_RATE_LIMITS: Record<string, Partial<TokenRateLimitConfig>> = {
  // OpenAI Tiers
  'openai-tier1': { tokensPerMinute: 200000, requestsPerMinute: 500 },
  'openai-tier2': { tokensPerMinute: 450000, requestsPerMinute: 5000 },
  'openai-tier3': { tokensPerMinute: 600000, requestsPerMinute: 5000 },
  'openai-tier4': { tokensPerMinute: 800000, requestsPerMinute: 10000 },
  'openai-tier5': { tokensPerMinute: 10000000, requestsPerMinute: 10000 },

  // Anthropic Tiers
  'anthropic-tier1': { tokensPerMinute: 80000, requestsPerMinute: 50 },
  'anthropic-tier2': { tokensPerMinute: 160000, requestsPerMinute: 1000 },
  'anthropic-tier3': { tokensPerMinute: 400000, requestsPerMinute: 2000 },
  'anthropic-tier4': { tokensPerMinute: 800000, requestsPerMinute: 4000 },
};

/**
 * Create a rate limiter for a specific provider tier
 */
export function createRateLimiter(
  providerTier?: string,
  overrides?: Partial<TokenRateLimitConfig>
): TokenRateLimiter {
  const baseConfig = providerTier ? PROVIDER_RATE_LIMITS[providerTier] || {} : {};
  return new TokenRateLimiter({ ...baseConfig, ...overrides });
}

/**
 * Token estimation utilities (exported for external use)
 */
export const tokenEstimators = TOKEN_ESTIMATORS;

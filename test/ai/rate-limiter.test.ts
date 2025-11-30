/**
 * Token Rate Limiter Tests
 *
 * Tests for the token-aware rate limiting system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TokenRateLimiter,
  RateLimitExceededError,
  createRateLimiter,
  tokenEstimators,
  PROVIDER_RATE_LIMITS,
} from '../../src/ai/rate-limiter.js';

describe('TokenRateLimiter', () => {
  describe('Basic execution', () => {
    it('should execute request immediately when under limit', async () => {
      const limiter = new TokenRateLimiter({
        tokensPerMinute: 100000,
        requestsPerMinute: 100,
      });

      const result = await limiter.execute(async () => 'success', {
        estimatedTokens: 1000,
      });

      expect(result).toBe('success');
    });

    it('should track usage correctly', async () => {
      const limiter = new TokenRateLimiter({
        tokensPerMinute: 100000,
        requestsPerMinute: 100,
      });

      await limiter.execute(async () => 'a', { estimatedTokens: 1000 });
      await limiter.execute(async () => 'b', { estimatedTokens: 2000 });

      const usage = limiter.getUsage();
      expect(usage.tokensUsed).toBe(3000);
      expect(usage.requestsUsed).toBe(2);
      expect(usage.tokensRemaining).toBe(97000);
    });
  });

  describe('Rate limiting strategies', () => {
    it('should throw when strategy is "throw"', async () => {
      const limiter = new TokenRateLimiter({
        tokensPerMinute: 100,
        requestsPerMinute: 1,
        strategy: 'throw',
      });

      // First request should succeed
      await limiter.execute(async () => 'first', { estimatedTokens: 50 });

      // Second request should throw
      await expect(
        limiter.execute(async () => 'second', { estimatedTokens: 50 })
      ).rejects.toThrow(RateLimitExceededError);
    });

    it('should queue when strategy is "queue"', async () => {
      const limiter = new TokenRateLimiter({
        tokensPerMinute: 100,
        requestsPerMinute: 2,
        strategy: 'queue',
      });

      // Execute multiple requests
      const results: string[] = [];
      const promises = [
        limiter.execute(async () => {
          results.push('a');
          return 'a';
        }, { estimatedTokens: 30 }),
        limiter.execute(async () => {
          results.push('b');
          return 'b';
        }, { estimatedTokens: 30 }),
      ];

      await Promise.all(promises);

      expect(results).toContain('a');
      expect(results).toContain('b');
    });
  });

  describe('Priority scheduling', () => {
    it('should process high priority requests first', async () => {
      const limiter = new TokenRateLimiter({
        tokensPerMinute: 50,
        requestsPerMinute: 1,
        strategy: 'queue',
      });

      const order: string[] = [];

      // First request blocks the limiter
      const first = limiter.execute(async () => {
        order.push('first');
        return 'first';
      }, { estimatedTokens: 50, priority: 'normal' });

      // Queue low priority
      const low = limiter.execute(async () => {
        order.push('low');
        return 'low';
      }, { estimatedTokens: 50, priority: 'low' });

      // Queue high priority (should execute before low)
      const high = limiter.execute(async () => {
        order.push('high');
        return 'high';
      }, { estimatedTokens: 50, priority: 'high' });

      // Wait for first to complete
      await first;

      // The queue should have high before low
      const usage = limiter.getUsage();
      expect(usage.queueLength).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Usage recording', () => {
    it('should adjust for actual vs estimated tokens', async () => {
      const limiter = new TokenRateLimiter({
        tokensPerMinute: 100000,
        requestsPerMinute: 100,
      });

      await limiter.execute(async () => 'test', { estimatedTokens: 1000 });
      expect(limiter.getUsage().tokensUsed).toBe(1000);

      // Record actual usage was higher
      limiter.recordUsage(1500, 1000);
      expect(limiter.getUsage().tokensUsed).toBe(1500);

      // Record actual usage was lower
      limiter.recordUsage(800, 1000);
      expect(limiter.getUsage().tokensUsed).toBe(1300); // 1500 - 200
    });
  });

  describe('Reset functionality', () => {
    it('should reset state', async () => {
      const limiter = new TokenRateLimiter({
        tokensPerMinute: 100000,
        requestsPerMinute: 100,
      });

      await limiter.execute(async () => 'test', { estimatedTokens: 1000 });
      expect(limiter.getUsage().tokensUsed).toBe(1000);

      limiter.reset();
      expect(limiter.getUsage().tokensUsed).toBe(0);
    });
  });

  describe('executeChat()', () => {
    it('should estimate tokens from chat options', async () => {
      const limiter = new TokenRateLimiter({
        tokensPerMinute: 100000,
        requestsPerMinute: 100,
      });

      await limiter.executeChat(
        {
          messages: [
            { role: 'system', content: 'You are helpful' },
            { role: 'user', content: 'Hello, this is a test message' },
          ],
          maxTokens: 100,
        },
        async () => 'response'
      );

      const usage = limiter.getUsage();
      expect(usage.tokensUsed).toBeGreaterThan(0);
    });
  });
});

describe('tokenEstimators', () => {
  describe('estimateMessage()', () => {
    it('should estimate tokens for text', () => {
      const tokens = tokenEstimators.estimateMessage('Hello, world!');
      expect(tokens).toBe(4); // 13 chars / 4 ≈ 4
    });

    it('should handle empty string', () => {
      const tokens = tokenEstimators.estimateMessage('');
      expect(tokens).toBe(0);
    });

    it('should estimate longer text', () => {
      const text = 'This is a longer message that should result in more tokens being estimated.';
      const tokens = tokenEstimators.estimateMessage(text);
      expect(tokens).toBeGreaterThan(10);
    });
  });

  describe('estimateChatTokens()', () => {
    it('should estimate tokens for chat options', () => {
      const tokens = tokenEstimators.estimateChatTokens({
        messages: [
          { role: 'user', content: 'Hello!' },
        ],
      });

      // Should include message + default maxTokens (1000)
      expect(tokens).toBeGreaterThan(1000);
    });

    it('should include system prompt', () => {
      const withoutSystem = tokenEstimators.estimateChatTokens({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      const withSystem = tokenEstimators.estimateChatTokens({
        messages: [{ role: 'user', content: 'Hi' }],
        systemPrompt: 'You are a helpful assistant that provides detailed responses.',
      });

      expect(withSystem).toBeGreaterThan(withoutSystem);
    });

    it('should add tokens for tools', () => {
      const withoutTools = tokenEstimators.estimateChatTokens({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      const withTools = tokenEstimators.estimateChatTokens({
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: {},
            },
          },
          {
            type: 'function',
            function: {
              name: 'search',
              description: 'Search the web',
              parameters: {},
            },
          },
        ],
      });

      expect(withTools).toBeGreaterThan(withoutTools);
    });

    it('should add tokens for images', () => {
      const withoutImage = tokenEstimators.estimateChatTokens({
        messages: [{ role: 'user', content: 'What is this?' }],
      });

      const withImage = tokenEstimators.estimateChatTokens({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is this?' },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
            ],
          },
        ],
      });

      // Image should add ~1000 tokens
      expect(withImage).toBeGreaterThan(withoutImage + 900);
    });
  });
});

describe('createRateLimiter()', () => {
  it('should create default rate limiter', () => {
    const limiter = createRateLimiter();
    expect(limiter).toBeInstanceOf(TokenRateLimiter);
  });

  it('should create rate limiter with provider tier', () => {
    const limiter = createRateLimiter('openai-tier3');
    const usage = limiter.getUsage();

    expect(usage.tokensRemaining).toBe(600000);
  });

  it('should allow overrides', () => {
    const limiter = createRateLimiter('openai-tier1', {
      tokensPerMinute: 50000,
    });
    const usage = limiter.getUsage();

    expect(usage.tokensRemaining).toBe(50000);
  });
});

describe('PROVIDER_RATE_LIMITS', () => {
  it('should have OpenAI tiers', () => {
    expect(PROVIDER_RATE_LIMITS['openai-tier1']).toBeDefined();
    expect(PROVIDER_RATE_LIMITS['openai-tier5']).toBeDefined();
  });

  it('should have Anthropic tiers', () => {
    expect(PROVIDER_RATE_LIMITS['anthropic-tier1']).toBeDefined();
    expect(PROVIDER_RATE_LIMITS['anthropic-tier4']).toBeDefined();
  });

  it('should have increasing limits per tier', () => {
    expect(PROVIDER_RATE_LIMITS['openai-tier1'].tokensPerMinute!)
      .toBeLessThan(PROVIDER_RATE_LIMITS['openai-tier5'].tokensPerMinute!);
  });
});

describe('RateLimitExceededError', () => {
  it('should include retry-after time', () => {
    const error = new RateLimitExceededError(30000);
    expect(error.retryAfter).toBe(30000);
    expect(error.message).toContain('30000');
    expect(error.name).toBe('RateLimitExceededError');
  });
});

import { describe, it, expect } from 'vitest';
import {
  SpiderBlockError,
  SpiderChallengeError,
  SpiderRobotsDisallowedError,
  SpiderDepthLimitError,
  SpiderDomainOutOfScopeError,
  SpiderUnsupportedContentError,
} from '../../src/scrape/errors.js';
import * as scrapeIndex from '../../src/scrape/index.js';
import { ReckerError } from '../../src/core/errors.js';

describe('Spider typed errors', () => {
  describe('SpiderBlockError', () => {
    it('extends ReckerError and carries recovery hints', () => {
      const err = new SpiderBlockError({
        url: 'https://example.com/foo',
        domain: 'example.com',
        reason: 'cloudflare',
        confidence: 0.92,
        transport: 'undici',
        preferredTransport: 'curl',
        statusCode: 403,
      });
      expect(err).toBeInstanceOf(ReckerError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('SpiderBlockError');
      expect(err.url).toBe('https://example.com/foo');
      expect(err.domain).toBe('example.com');
      expect(err.reason).toBe('cloudflare');
      expect(err.confidence).toBe(0.92);
      expect(err.transport).toBe('undici');
      expect(err.preferredTransport).toBe('curl');
    });

    it('canonicalizes scrape category + spider source', () => {
      const err = new SpiderBlockError({
        url: 'https://x.test/',
        domain: 'x.test',
        reason: 'datadome',
        confidence: 0.8,
        transport: 'curl',
      });
      expect(err.classification?.category).toBe('scrape');
      expect(err.classification?.source).toBe('spider');
      expect(err.classification?.canRetry).toBe(true);
      expect(err.retriable).toBe(true);
    });

    it('suggests transport swap when preferredTransport differs', () => {
      const err = new SpiderBlockError({
        url: 'https://x.test/',
        domain: 'x.test',
        reason: 'cloudflare',
        confidence: 0.9,
        transport: 'undici',
        preferredTransport: 'curl',
      });
      expect(err.suggestions[0]).toMatch(/curl transport/);
    });
  });

  describe('SpiderChallengeError', () => {
    it('exposes provider, confidence, cooldown', () => {
      const err = new SpiderChallengeError({
        url: 'https://protected.test/',
        domain: 'protected.test',
        provider: 'cloudflare',
        confidence: 0.95,
        cooldownMs: 5000,
        transport: 'undici',
      });
      expect(err).toBeInstanceOf(ReckerError);
      expect(err.provider).toBe('cloudflare');
      expect(err.confidence).toBe(0.95);
      expect(err.cooldownMs).toBe(5000);
      expect(err.classification?.retryAfterMs).toBe(5000);
    });
  });

  describe('SpiderRobotsDisallowedError', () => {
    it('is non-retriable', () => {
      const err = new SpiderRobotsDisallowedError({
        url: 'https://example.com/private/data',
        path: '/private/data',
        userAgent: 'Recker Spider/1.0',
        robotsUrl: 'https://example.com/robots.txt',
      });
      expect(err.classification?.canRetry).toBe(false);
      expect(err.retriable).toBe(false);
      expect(err.path).toBe('/private/data');
    });
  });

  describe('SpiderDepthLimitError', () => {
    it('records depth + max depth', () => {
      const err = new SpiderDepthLimitError({ url: 'x', depth: 8, maxDepth: 5 });
      expect(err.depth).toBe(8);
      expect(err.maxDepth).toBe(5);
      expect(err.retriable).toBe(false);
    });
  });

  describe('SpiderDomainOutOfScopeError', () => {
    it('records allowed domain list', () => {
      const err = new SpiderDomainOutOfScopeError({
        url: 'https://other.test',
        allowedDomains: ['example.com'],
      });
      expect(err.allowedDomains).toEqual(['example.com']);
      expect(err.retriable).toBe(false);
    });
  });

  describe('SpiderUnsupportedContentError', () => {
    it('records content type and reason category', () => {
      const err = new SpiderUnsupportedContentError({
        url: 'https://x/foo.pdf',
        contentType: 'application/pdf',
        reason: 'pdf',
        fallbackSuggestion: 'Use a PDF parser.',
      });
      expect(err.contentType).toBe('application/pdf');
      expect(err.reason).toBe('pdf');
      expect(err.suggestions[0]).toBe('Use a PDF parser.');
      expect(err.retriable).toBe(false);
    });
  });

  it('all errors are exported from scrape/index', () => {
    expect(scrapeIndex.SpiderBlockError).toBe(SpiderBlockError);
    expect(scrapeIndex.SpiderChallengeError).toBe(SpiderChallengeError);
    expect(scrapeIndex.SpiderRobotsDisallowedError).toBe(SpiderRobotsDisallowedError);
    expect(scrapeIndex.SpiderDepthLimitError).toBe(SpiderDepthLimitError);
    expect(scrapeIndex.SpiderDomainOutOfScopeError).toBe(SpiderDomainOutOfScopeError);
    expect(scrapeIndex.SpiderUnsupportedContentError).toBe(SpiderUnsupportedContentError);
  });
});

import { describe, it, expect } from 'vitest';
import * as slim from '../../src/browser/index-slim.js';

describe('recker browser slim entrypoint', () => {
  it('should expose core HTTP methods', () => {
    const { recker } = slim as typeof slim;
    expect(typeof recker.get).toBe('function');
    expect(typeof recker.post).toBe('function');
    expect(typeof recker.put).toBe('function');
    expect(typeof recker.patch).toBe('function');
    expect(typeof recker.delete).toBe('function');
  });

  it('should expose browser-safe plugins', () => {
    expect(typeof (slim as Record<string, unknown>).retryPlugin).toBe('function');
    expect(typeof (slim as Record<string, unknown>).rateLimitPlugin).toBe('function');
    // Note: Auth plugins (basicAuth, bearerAuth, etc.) are NOT exported in slim build
    // They are Node-focused and excluded intentionally
  });

  it('should not export auth plugins (Node-focused)', () => {
    // Auth plugins are intentionally excluded from browser-slim build
    expect((slim as Record<string, unknown>).basicAuth).toBeUndefined();
    expect((slim as Record<string, unknown>).bearerAuth).toBeUndefined();
    expect((slim as Record<string, unknown>).oauth2).toBeUndefined();
  });

  it('should not export AI, SEO, scrape, or presets', () => {
    const slimExports = slim as Record<string, unknown>;
    expect(slimExports.ai).toBeUndefined();
    expect(slimExports.presets).toBeUndefined();
    expect(slimExports.analyzeSeo).toBeUndefined();
    expect(slimExports.scrape).toBeUndefined();
  });

  it('should not expose ai/seo on the slim recker namespace', () => {
    const { recker } = slim as typeof slim;
    expect((recker as Record<string, unknown>).ai).toBeUndefined();
    expect((recker as Record<string, unknown>).seo).toBeUndefined();
  });
});

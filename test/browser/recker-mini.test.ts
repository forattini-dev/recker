import { describe, it, expect } from 'vitest';
import * as mini from '../../src/browser/index-mini.js';

describe('recker browser mini entrypoint', () => {
  it('should expose core HTTP methods', () => {
    const { recker } = mini as typeof mini;
    expect(typeof recker.get).toBe('function');
    expect(typeof recker.post).toBe('function');
    expect(typeof recker.put).toBe('function');
    expect(typeof recker.patch).toBe('function');
    expect(typeof recker.delete).toBe('function');
  });

  it('should expose browser-safe plugins', () => {
    expect(typeof (mini as Record<string, unknown>).retryPlugin).toBe('function');
    expect(typeof (mini as Record<string, unknown>).rateLimitPlugin).toBe('function');
    // Note: Auth plugins (basicAuth, bearerAuth, etc.) are NOT exported in mini build
    // They are Node-focused and excluded intentionally
  });

  it('should not export auth plugins (Node-focused)', () => {
    // Auth plugins are intentionally excluded from browser-mini build
    expect((mini as Record<string, unknown>).basicAuth).toBeUndefined();
    expect((mini as Record<string, unknown>).bearerAuth).toBeUndefined();
    expect((mini as Record<string, unknown>).oauth2).toBeUndefined();
  });

  it('should not export AI, SEO, scrape, or presets', () => {
    const miniExports = mini as Record<string, unknown>;
    expect(miniExports.ai).toBeUndefined();
    expect(miniExports.presets).toBeUndefined();
    expect(miniExports.analyzeSeo).toBeUndefined();
    expect(miniExports.scrape).toBeUndefined();
  });

  it('should not expose ai/seo on the mini recker namespace', () => {
    const { recker } = mini as typeof mini;
    expect((recker as Record<string, unknown>).ai).toBeUndefined();
    expect((recker as Record<string, unknown>).seo).toBeUndefined();
  });
});

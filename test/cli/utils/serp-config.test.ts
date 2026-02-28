import { describe, expect, it } from 'vitest';

import { parseSpiderSerpConfig } from '../../../src/cli/utils/serp-config.js';

describe('serp config parser', () => {
  it('defaults topKeywordsLimit to 5 for spider and seo flows', () => {
    const parsed = parseSpiderSerpConfig({
      serp: true,
    });

    expect(parsed.enabled).toBe(true);
    expect(parsed.topKeywordsLimit).toBe(5);
    expect(parsed.queriesLimit).toBe(10);
    expect(parsed.resultsPerQuery).toBe(10);
    expect(parsed.searchConcurrency).toBe(1);
    expect(parsed.searchDelayMs).toBe(1200);
    expect(parsed.searchDelayJitterMs).toBe(450);
    expect(parsed.searchCaptchaCooldownMs).toBe(2400);
    expect(parsed.searchMaxConsecutiveBlocks).toBe(3);
    expect(parsed.searchRetryCount).toBe(1);
    expect(parsed.searchRetryDelayMs).toBe(1200);
  });

  it('accepts seo command camelCase option aliases', () => {
    const parsed = parseSpiderSerpConfig({
      serp: true,
      serpTopKeywords: 0,
      serpQueryLimit: '7',
      serpResultsPerQuery: '9',
      serpTransport: 'curl',
      serpDelayMs: 200,
      serpDelayJitterMs: 100,
      serpCaptchaCooldownMs: 800,
      serpMaxConsecutiveBlocks: 2,
      serpRetryCount: 2,
      serpRetryDelayMs: 500,
    });

    expect(parsed.enabled).toBe(true);
    expect(parsed.topKeywordsLimit).toBe(5);
    expect(parsed.queriesLimit).toBe(7);
    expect(parsed.resultsPerQuery).toBe(9);
    expect(parsed.searchOptions.transport).toBe('curl');
    expect(parsed.searchDelayMs).toBe(200);
    expect(parsed.searchDelayJitterMs).toBe(100);
    expect(parsed.searchCaptchaCooldownMs).toBe(800);
    expect(parsed.searchMaxConsecutiveBlocks).toBe(2);
    expect(parsed.searchRetryCount).toBe(2);
    expect(parsed.searchRetryDelayMs).toBe(500);
  });

  it('defaults human profile to chrome', () => {
    const parsed = parseSpiderSerpConfig({
      serp: true,
    });

    expect(parsed.searchOptions.humanProfile).toBe('chrome');
  });

  it('resolves disabled human profile from cli option', () => {
    const parsed = parseSpiderSerpConfig({
      serp: true,
      'serp-human-profile': 'off',
    });

    expect(parsed.searchOptions.humanProfile).toBe('off');
  });
});

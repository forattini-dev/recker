import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCrawlStorage } from '../../src/scrape/crawl-storage.js';
import type { SpiderPageResult } from '../../src/scrape/spider.js';

function mockResult(url: string, status = 200): SpiderPageResult {
  return {
    url,
    status,
    title: `Page: ${url}`,
    depth: 0,
    links: [],
    duration: 100,
  } as SpiderPageResult;
}

describe('CrawlStorageAdapter', () => {
  let storage: InMemoryCrawlStorage;

  beforeEach(() => {
    storage = new InMemoryCrawlStorage();
  });

  it('should save and retrieve results', async () => {
    await storage.saveResult(mockResult('https://a.com'));
    await storage.saveResult(mockResult('https://b.com'));

    expect(await storage.getResultCount()).toBe(2);

    const results = await storage.getResults();
    expect(results).toHaveLength(2);
    expect(results[0].url).toBe('https://a.com');
    expect(results[1].url).toBe('https://b.com');
  });

  it('should save and retrieve errors', async () => {
    await storage.saveError({ url: 'https://fail.com', error: 'timeout' });
    await storage.saveError({ url: 'https://gone.com', error: '404' });

    const errors = await storage.getErrors();
    expect(errors).toHaveLength(2);
    expect(errors[0].url).toBe('https://fail.com');
    expect(errors[1].error).toBe('404');
  });

  it('should clear all data', async () => {
    await storage.saveResult(mockResult('https://a.com'));
    await storage.saveError({ url: 'https://b.com', error: 'err' });

    await storage.clear();

    expect(await storage.getResultCount()).toBe(0);
    expect(await storage.getResults()).toHaveLength(0);
    expect(await storage.getErrors()).toHaveLength(0);
  });

  it('should track result count correctly', async () => {
    expect(await storage.getResultCount()).toBe(0);

    await storage.saveResult(mockResult('https://a.com'));
    expect(await storage.getResultCount()).toBe(1);

    await storage.saveResult(mockResult('https://b.com'));
    expect(await storage.getResultCount()).toBe(2);
  });

  it('should close and clear', async () => {
    await storage.saveResult(mockResult('https://a.com'));
    await storage.close();

    expect(await storage.getResultCount()).toBe(0);
  });
});

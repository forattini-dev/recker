import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCrawlQueue, type CrawlQueueAdapter, type CrawlQueueItem } from '../../src/scrape/crawl-queue.js';

describe('CrawlQueueAdapter', () => {
  let queue: InMemoryCrawlQueue;

  beforeEach(() => {
    queue = new InMemoryCrawlQueue();
  });

  describe('InMemoryCrawlQueue', () => {
    it('should push and pop items in FIFO order', async () => {
      await queue.push({ url: 'https://a.com', depth: 0 });
      await queue.push({ url: 'https://b.com', depth: 1 });
      await queue.push({ url: 'https://c.com', depth: 2 });

      expect(await queue.size()).toBe(3);

      const first = await queue.pop();
      expect(first?.url).toBe('https://a.com');
      expect(first?.depth).toBe(0);

      const second = await queue.pop();
      expect(second?.url).toBe('https://b.com');

      expect(await queue.size()).toBe(1);
    });

    it('should return null when empty', async () => {
      expect(await queue.pop()).toBeNull();
    });

    it('should track visited URLs', async () => {
      expect(await queue.hasVisited('https://example.com')).toBe(false);

      await queue.markVisited('https://example.com');
      expect(await queue.hasVisited('https://example.com')).toBe(true);

      // Different URL
      expect(await queue.hasVisited('https://other.com')).toBe(false);
    });

    it('should clear queue and visited set', async () => {
      await queue.push({ url: 'https://a.com', depth: 0 });
      await queue.push({ url: 'https://b.com', depth: 1 });
      await queue.markVisited('https://a.com');
      await queue.markVisited('https://b.com');

      await queue.clear();

      expect(await queue.size()).toBe(0);
      expect(await queue.pop()).toBeNull();
      expect(await queue.hasVisited('https://a.com')).toBe(false);
      expect(await queue.hasVisited('https://b.com')).toBe(false);
    });

    it('should report correct size', async () => {
      expect(await queue.size()).toBe(0);

      await queue.push({ url: 'https://a.com', depth: 0 });
      expect(await queue.size()).toBe(1);

      await queue.push({ url: 'https://b.com', depth: 0 });
      expect(await queue.size()).toBe(2);

      await queue.pop();
      expect(await queue.size()).toBe(1);
    });

    it('should preserve optional fields', async () => {
      await queue.push({
        url: 'https://example.com/page',
        depth: 2,
        priority: 1,
        discoveredFrom: 'https://example.com',
      });

      const item = await queue.pop();
      expect(item?.priority).toBe(1);
      expect(item?.discoveredFrom).toBe('https://example.com');
    });

    it('should expose visited set via getVisited', async () => {
      await queue.markVisited('https://a.com');
      await queue.markVisited('https://b.com');

      const visited = queue.getVisited();
      expect(visited.size).toBe(2);
      expect(visited.has('https://a.com')).toBe(true);
      expect(visited.has('https://b.com')).toBe(true);
    });

    it('should close and clear', async () => {
      await queue.push({ url: 'https://a.com', depth: 0 });
      await queue.markVisited('https://a.com');

      await queue.close();

      expect(await queue.size()).toBe(0);
      expect(await queue.hasVisited('https://a.com')).toBe(false);
    });

    it('should pushBatch multiple items at once', async () => {
      await queue.pushBatch([
        { url: 'https://a.com', depth: 0 },
        { url: 'https://b.com', depth: 1 },
        { url: 'https://c.com', depth: 2 },
      ]);

      expect(await queue.size()).toBe(3);
      expect((await queue.pop())?.url).toBe('https://a.com');
      expect((await queue.pop())?.url).toBe('https://b.com');
      expect((await queue.pop())?.url).toBe('https://c.com');
    });

    it('should hasVisitedBatch check multiple URLs', async () => {
      await queue.markVisited('https://a.com');
      await queue.markVisited('https://c.com');

      const visited = await queue.hasVisitedBatch([
        'https://a.com',
        'https://b.com',
        'https://c.com',
        'https://d.com',
      ]);

      expect(visited.size).toBe(2);
      expect(visited.has('https://a.com')).toBe(true);
      expect(visited.has('https://c.com')).toBe(true);
      expect(visited.has('https://b.com')).toBe(false);
    });
  });

  describe('CrawlQueueAdapter interface', () => {
    it('should accept any implementation', async () => {
      // Custom adapter that reverses order (LIFO instead of FIFO)
      const lifoQueue: CrawlQueueAdapter = {
        _items: [] as CrawlQueueItem[],
        _visited: new Set<string>(),

        async push(item: CrawlQueueItem) {
          (this as any)._items.push(item);
        },
        async pop() {
          return (this as any)._items.pop() ?? null;
        },
        async hasVisited(url: string) {
          return (this as any)._visited.has(url);
        },
        async markVisited(url: string) {
          (this as any)._visited.add(url);
        },
        async size() {
          return (this as any)._items.length;
        },
        async clear() {
          (this as any)._items = [];
          (this as any)._visited.clear();
        },
      };

      await lifoQueue.push({ url: 'https://first.com', depth: 0 });
      await lifoQueue.push({ url: 'https://second.com', depth: 1 });

      // LIFO: second comes out first
      const item = await lifoQueue.pop();
      expect(item?.url).toBe('https://second.com');
    });
  });
});

/**
 * CrawlQueueAdapter - Pluggable URL frontier for the Spider.
 *
 * Users implement this interface with their own backend (Redis, SQLite, SQS, etc.)
 * to enable persistent, distributed, or priority-based crawling.
 */

export interface CrawlQueueItem {
  url: string;
  depth: number;
  /** Lower = higher priority (optional, for priority queues) */
  priority?: number;
  /** URL that discovered this link (optional, for graph analysis) */
  discoveredFrom?: string;
}

export interface CrawlQueueAdapter {
  /** Add a URL to the queue */
  push(item: CrawlQueueItem): Promise<void>;
  /** Add multiple URLs at once (reduces round-trips for remote backends) */
  pushBatch?(items: CrawlQueueItem[]): Promise<void>;
  /** Remove and return the next item from the queue (FIFO or by priority) */
  pop(): Promise<CrawlQueueItem | null>;
  /** Check if a URL has been visited */
  hasVisited(url: string): Promise<boolean>;
  /** Check multiple URLs at once — returns the Set of visited ones */
  hasVisitedBatch?(urls: string[]): Promise<Set<string>>;
  /** Mark a URL as visited */
  markVisited(url: string): Promise<void>;
  /** Number of pending items in the queue */
  size(): Promise<number>;
  /** Clear the queue and visited set */
  clear(): Promise<void>;
  /** Graceful shutdown (close connections, flush buffers) */
  close?(): Promise<void>;
}

/**
 * Default in-memory implementation.
 * Same behavior as the Spider's original array + Set, but behind the adapter interface.
 */
export class InMemoryCrawlQueue implements CrawlQueueAdapter {
  private queue: CrawlQueueItem[] = [];
  private visited = new Set<string>();

  async push(item: CrawlQueueItem): Promise<void> {
    this.queue.push(item);
  }

  async pushBatch(items: CrawlQueueItem[]): Promise<void> {
    this.queue.push(...items);
  }

  async pop(): Promise<CrawlQueueItem | null> {
    return this.queue.shift() ?? null;
  }

  async hasVisited(url: string): Promise<boolean> {
    return this.visited.has(url);
  }

  async hasVisitedBatch(urls: string[]): Promise<Set<string>> {
    const result = new Set<string>();
    for (const url of urls) {
      if (this.visited.has(url)) result.add(url);
    }
    return result;
  }

  async markVisited(url: string): Promise<void> {
    this.visited.add(url);
  }

  async size(): Promise<number> {
    return this.queue.length;
  }

  async clear(): Promise<void> {
    this.queue = [];
    this.visited.clear();
  }

  async close(): Promise<void> {
    await this.clear();
  }

  /** Get the visited set (for SpiderResult compatibility) */
  getVisited(): Set<string> {
    return this.visited;
  }
}

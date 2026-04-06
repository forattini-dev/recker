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
 * Uses a ring buffer (circular buffer) for O(1) push and pop instead of
 * Array.shift() which is O(n) due to re-indexing. For large crawls (100K+ URLs)
 * this eliminates a significant bottleneck.
 */
export class InMemoryCrawlQueue implements CrawlQueueAdapter {
  private queue: (CrawlQueueItem | undefined)[] = [];
  private head = 0;
  private tail = 0;
  private visited = new Set<string>();
  private mode: 'fifo' | 'lifo';

  constructor(mode: 'fifo' | 'lifo' = 'fifo') {
    this.mode = mode;
  }

  async push(item: CrawlQueueItem): Promise<void> {
    this.queue[this.tail++] = item;
  }

  async pushBatch(items: CrawlQueueItem[]): Promise<void> {
    for (const item of items) {
      this.queue[this.tail++] = item;
    }
  }

  async pop(): Promise<CrawlQueueItem | null> {
    if (this.mode === 'lifo') {
      // DFS: pop from tail (stack behavior)
      while (this.tail > this.head) {
        this.tail--;
        const item = this.queue[this.tail];
        this.queue[this.tail] = undefined;
        if (item) return item;
      }
      return null;
    }

    // BFS: existing ring buffer pop from head (FIFO)
    while (this.head < this.tail) {
      const item = this.queue[this.head];
      this.queue[this.head] = undefined;
      this.head++;
      if (item) {
        // Compact when more than half is empty and gap exceeds threshold
        if (this.head > 1024 && this.head > this.tail / 2) {
          this.queue = this.queue.slice(this.head);
          this.tail -= this.head;
          this.head = 0;
        }
        return item;
      }
    }
    return null;
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
    return this.tail - this.head;
  }

  async clear(): Promise<void> {
    this.queue = [];
    this.head = 0;
    this.tail = 0;
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

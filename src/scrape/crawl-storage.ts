/**
 * CrawlStorageAdapter - Pluggable result storage for the Spider.
 *
 * Users implement this interface with their own backend (Redis, SQLite, S3, etc.)
 * to enable persistent results, crash recovery, and memory-efficient large crawls.
 */

import type { SpiderPageResult } from './spider.js';

export interface CrawlStorageAdapter {
  /** Save a crawled page result */
  saveResult(result: SpiderPageResult): Promise<void>;
  /** Save a crawl error */
  saveError(error: { url: string; error: string }): Promise<void>;
  /** Number of results saved */
  getResultCount(): Promise<number>;
  /** Get all results (for final SpiderResult assembly) */
  getResults(): Promise<SpiderPageResult[]>;
  /** Get all errors */
  getErrors(): Promise<Array<{ url: string; error: string }>>;
  /** Clear all data */
  clear(): Promise<void>;
  /** Graceful shutdown */
  close?(): Promise<void>;
}

/**
 * Default in-memory implementation.
 * Same behavior as the Spider's original arrays, but behind the adapter interface.
 */
export class InMemoryCrawlStorage implements CrawlStorageAdapter {
  private results: SpiderPageResult[] = [];
  private errors: Array<{ url: string; error: string }> = [];

  async saveResult(result: SpiderPageResult): Promise<void> {
    this.results.push(result);
  }

  async saveError(error: { url: string; error: string }): Promise<void> {
    this.errors.push(error);
  }

  async getResultCount(): Promise<number> {
    return this.results.length;
  }

  async getResults(): Promise<SpiderPageResult[]> {
    return this.results;
  }

  async getErrors(): Promise<Array<{ url: string; error: string }>> {
    return this.errors;
  }

  async clear(): Promise<void> {
    this.results = [];
    this.errors = [];
  }

  async close(): Promise<void> {
    await this.clear();
  }
}

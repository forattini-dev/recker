import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import type { CrawlQueueAdapter, CrawlQueueItem } from './crawl-queue.js';

export class SqliteCrawlQueue implements CrawlQueueAdapter {
  private db: any;
  private stmts!: {
    push: any;
    pop: any;
    deletePop: any;
    hasVisited: any;
    markVisited: any;
    size: any;
    clearQueue: any;
    clearVisited: any;
    clearMetadata: any;
    allVisited: any;
    saveMeta: any;
    getMeta: any;
    allMeta: any;
  };

  private constructor() {}

  static async create(opts?: { dbPath?: string }): Promise<SqliteCrawlQueue> {
    const instance = new SqliteCrawlQueue();
    const dbPath = opts?.dbPath ?? path.join(os.tmpdir(), `recker-crawl-${crypto.randomUUID().slice(0, 8)}.db`);
    await instance.ensureDb(dbPath);
    return instance;
  }

  private async ensureDb(dbPath: string): Promise<void> {
    const BetterSqlite3 = (await import('better-sqlite3')).default as new (...args: any[]) => any;
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        depth INTEGER NOT NULL,
        priority INTEGER,
        discovered_from TEXT
      );
      CREATE TABLE IF NOT EXISTS visited (url TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS crawl_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_queue_priority ON queue(priority ASC, id ASC);
    `);

    this.stmts = {
      push: this.db.prepare('INSERT INTO queue (url, depth, priority, discovered_from) VALUES (?, ?, ?, ?)'),
      pop: this.db.prepare('SELECT id, url, depth, priority, discovered_from FROM queue ORDER BY priority ASC NULLS LAST, id ASC LIMIT 1'),
      deletePop: this.db.prepare('DELETE FROM queue WHERE id = ?'),
      hasVisited: this.db.prepare('SELECT 1 FROM visited WHERE url = ?'),
      markVisited: this.db.prepare('INSERT OR IGNORE INTO visited (url) VALUES (?)'),
      size: this.db.prepare('SELECT COUNT(*) AS cnt FROM queue'),
      clearQueue: this.db.prepare('DELETE FROM queue'),
      clearVisited: this.db.prepare('DELETE FROM visited'),
      clearMetadata: this.db.prepare('DELETE FROM crawl_metadata'),
      allVisited: this.db.prepare('SELECT url FROM visited'),
      saveMeta: this.db.prepare('INSERT OR REPLACE INTO crawl_metadata (key, value) VALUES (?, ?)'),
      getMeta: this.db.prepare('SELECT value FROM crawl_metadata WHERE key = ?'),
      allMeta: this.db.prepare('SELECT key, value FROM crawl_metadata'),
    };
  }

  getDb(): any {
    return this.db;
  }

  async push(item: CrawlQueueItem): Promise<void> {
    this.stmts.push.run(item.url, item.depth, item.priority ?? null, item.discoveredFrom ?? null);
  }

  async pushBatch(items: CrawlQueueItem[]): Promise<void> {
    const insert = this.db.transaction((rows: CrawlQueueItem[]) => {
      for (const item of rows) {
        this.stmts.push.run(item.url, item.depth, item.priority ?? null, item.discoveredFrom ?? null);
      }
    });
    insert(items);
  }

  async pop(): Promise<CrawlQueueItem | null> {
    const row = this.stmts.pop.get() as any;
    if (!row) return null;
    this.stmts.deletePop.run(row.id);
    return {
      url: row.url,
      depth: row.depth,
      priority: row.priority ?? undefined,
      discoveredFrom: row.discovered_from ?? undefined,
    };
  }

  async hasVisited(url: string): Promise<boolean> {
    return this.stmts.hasVisited.get(url) !== undefined;
  }

  async hasVisitedBatch(urls: string[]): Promise<Set<string>> {
    const result = new Set<string>();
    for (const url of urls) {
      if (this.stmts.hasVisited.get(url) !== undefined) {
        result.add(url);
      }
    }
    return result;
  }

  async markVisited(url: string): Promise<void> {
    this.stmts.markVisited.run(url);
  }

  async size(): Promise<number> {
    const row = this.stmts.size.get() as any;
    return row.cnt;
  }

  async clear(): Promise<void> {
    this.stmts.clearQueue.run();
    this.stmts.clearVisited.run();
    this.stmts.clearMetadata.run();
  }

  async close(): Promise<void> {
    this.db.close();
  }

  getVisitedSet(): Set<string> {
    const rows = this.stmts.allVisited.all() as Array<{ url: string }>;
    return new Set(rows.map((r) => r.url));
  }

  saveMetadata(key: string, value: string): void {
    this.stmts.saveMeta.run(key, value);
  }

  getMetadata(key: string): string | undefined {
    const row = this.stmts.getMeta.get(key) as { value: string } | undefined;
    return row?.value;
  }

  getAllMetadata(): Record<string, string> {
    const rows = this.stmts.allMeta.all() as Array<{ key: string; value: string }>;
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }
}

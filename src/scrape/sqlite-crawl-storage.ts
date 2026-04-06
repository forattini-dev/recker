import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import type { CrawlStorageAdapter } from './crawl-storage.js';
import type { SpiderPageResult } from './spider.js';

export class SqliteCrawlStorage implements CrawlStorageAdapter {
  private db: any;
  private ownsDb: boolean;
  private stmts!: {
    saveResult: any;
    saveError: any;
    resultCount: any;
    allResults: any;
    allErrors: any;
    clearResults: any;
    clearErrors: any;
  };

  private constructor(db: any, ownsDb: boolean) {
    this.db = db;
    this.ownsDb = ownsDb;
  }

  static async create(opts?: { dbPath?: string; db?: any }): Promise<SqliteCrawlStorage> {
    let db = opts?.db;
    let ownsDb = false;

    if (!db) {
      const dbPath = opts?.dbPath ?? path.join(os.tmpdir(), `recker-storage-${crypto.randomUUID().slice(0, 8)}.db`);
      const BetterSqlite3 = (await import('better-sqlite3')).default as new (...args: any[]) => any;
      db = new BetterSqlite3(dbPath);
      db.pragma('journal_mode = WAL');
      ownsDb = true;
    }

    const instance = new SqliteCrawlStorage(db, ownsDb);
    instance.init();
    return instance;
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        status INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        error TEXT NOT NULL
      );
    `);

    this.stmts = {
      saveResult: this.db.prepare('INSERT INTO results (url, status, data) VALUES (?, ?, ?)'),
      saveError: this.db.prepare('INSERT INTO errors (url, error) VALUES (?, ?)'),
      resultCount: this.db.prepare('SELECT COUNT(*) AS cnt FROM results'),
      allResults: this.db.prepare('SELECT data FROM results'),
      allErrors: this.db.prepare('SELECT url, error FROM errors'),
      clearResults: this.db.prepare('DELETE FROM results'),
      clearErrors: this.db.prepare('DELETE FROM errors'),
    };
  }

  async saveResult(result: SpiderPageResult): Promise<void> {
    this.stmts.saveResult.run(result.url, result.status, JSON.stringify(result));
  }

  async saveError(error: { url: string; error: string }): Promise<void> {
    this.stmts.saveError.run(error.url, error.error);
  }

  async getResultCount(): Promise<number> {
    const row = this.stmts.resultCount.get() as any;
    return row.cnt;
  }

  async getResults(): Promise<SpiderPageResult[]> {
    const rows = this.stmts.allResults.all() as Array<{ data: string }>;
    return rows.map((r) => JSON.parse(r.data) as SpiderPageResult);
  }

  async getErrors(): Promise<Array<{ url: string; error: string }>> {
    return this.stmts.allErrors.all() as Array<{ url: string; error: string }>;
  }

  async clear(): Promise<void> {
    this.stmts.clearResults.run();
    this.stmts.clearErrors.run();
  }

  async close(): Promise<void> {
    if (this.ownsDb) {
      this.db.close();
    }
  }
}

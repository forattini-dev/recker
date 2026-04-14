import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { InMemoryDomainStats } from '../../src/scrape/domain-stats.js';
import type { DomainStatsAdapter, DomainTransportStats } from '../../src/scrape/domain-stats.js';

/**
 * Test-only adapter implementation: persists stats as a JSON file.
 * Lives in the test file (not exported from src) — its only purpose is to
 * prove the DomainStatsAdapter contract works for real persistent backends
 * without forcing sqlite/redis dependencies on the production code.
 */
class JsonFileDomainStats implements DomainStatsAdapter {
  private map: Map<string, DomainTransportStats> = new Map();
  constructor(private readonly filePath: string) {
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as DomainTransportStats[];
      for (const s of raw) this.map.set(s.hostname, s);
    }
  }

  private flush(): void {
    fs.writeFileSync(this.filePath, JSON.stringify([...this.map.values()]));
  }

  async load(hostname: string): Promise<DomainTransportStats | null> {
    const s = this.map.get(hostname);
    return s ? { ...s } : null;
  }

  async loadAll(): Promise<Map<string, DomainTransportStats>> {
    const copy = new Map<string, DomainTransportStats>();
    for (const [k, v] of this.map) copy.set(k, { ...v });
    return copy;
  }

  async record(hostname: string, transport: 'curl' | 'undici', success: boolean): Promise<void> {
    let stats = this.map.get(hostname);
    if (!stats) {
      stats = {
        hostname,
        curlSuccess: 0,
        curlFail: 0,
        undiciSuccess: 0,
        undiciFail: 0,
        lastSeenTs: 0,
      };
      this.map.set(hostname, stats);
    }
    if (success) {
      if (transport === 'curl') stats.curlSuccess += 1;
      else stats.undiciSuccess += 1;
      stats.lastSuccessTransport = transport;
    } else {
      if (transport === 'curl') stats.curlFail += 1;
      else stats.undiciFail += 1;
    }
    stats.lastSeenTs = Date.now();
    this.flush();
  }

  async clear(): Promise<void> {
    this.map.clear();
    this.flush();
  }
}

describe('DomainStatsAdapter', () => {
  describe('InMemoryDomainStats', () => {
    let stats: InMemoryDomainStats;

    beforeEach(() => {
      stats = new InMemoryDomainStats();
    });

    it('returns null for unknown hosts', async () => {
      const s = await stats.load('unknown.test');
      expect(s).toBeNull();
    });

    it('records success and increments per-transport counter', async () => {
      await stats.record('example.com', 'curl', true);
      await stats.record('example.com', 'curl', true);
      const s = await stats.load('example.com');
      expect(s).not.toBeNull();
      expect(s!.curlSuccess).toBe(2);
      expect(s!.curlFail).toBe(0);
      expect(s!.undiciSuccess).toBe(0);
      expect(s!.lastSuccessTransport).toBe('curl');
      expect(s!.lastSeenTs).toBeGreaterThan(0);
    });

    it('tracks successes and failures per transport independently', async () => {
      await stats.record('mixed.test', 'curl', true);
      await stats.record('mixed.test', 'curl', false);
      await stats.record('mixed.test', 'undici', true);
      await stats.record('mixed.test', 'undici', true);
      await stats.record('mixed.test', 'undici', false);

      const s = await stats.load('mixed.test');
      expect(s!.curlSuccess).toBe(1);
      expect(s!.curlFail).toBe(1);
      expect(s!.undiciSuccess).toBe(2);
      expect(s!.undiciFail).toBe(1);
      expect(s!.lastSuccessTransport).toBe('undici');
    });

    it('loadAll returns a map of all known hosts', async () => {
      await stats.record('a.test', 'curl', true);
      await stats.record('b.test', 'undici', true);
      await stats.record('c.test', 'curl', false);

      const all = await stats.loadAll();
      expect(all.size).toBe(3);
      expect(all.get('a.test')?.curlSuccess).toBe(1);
      expect(all.get('b.test')?.undiciSuccess).toBe(1);
      expect(all.get('c.test')?.curlFail).toBe(1);
    });

    it('clear() wipes all stats', async () => {
      await stats.record('learn.test', 'curl', true);
      await stats.clear();
      const s = await stats.load('learn.test');
      expect(s).toBeNull();
    });

    it('returns deep copies (mutating result does not corrupt store)', async () => {
      await stats.record('x.test', 'curl', true);
      const a = await stats.load('x.test');
      a!.curlSuccess = 999;
      const b = await stats.load('x.test');
      expect(b!.curlSuccess).toBe(1);
    });
  });

  describe('JsonFileDomainStats (test-only persistent adapter)', () => {
    let filePath: string;
    let stats: JsonFileDomainStats;

    beforeEach(() => {
      filePath = path.join(os.tmpdir(), `recker-stats-${crypto.randomUUID().slice(0, 8)}.json`);
      stats = new JsonFileDomainStats(filePath);
    });

    afterEach(() => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });

    it('records and loads stats per host', async () => {
      await stats.record('example.com', 'curl', true);
      await stats.record('example.com', 'curl', false);
      const s = await stats.load('example.com');
      expect(s).not.toBeNull();
      expect(s!.curlSuccess).toBe(1);
      expect(s!.curlFail).toBe(1);
    });

    it('persists across reopens of the same file', async () => {
      await stats.record('persistent.test', 'curl', true);
      await stats.record('persistent.test', 'curl', true);
      await stats.record('persistent.test', 'undici', false);

      // Simulate process restart: re-instantiate from the same file
      const reopened = new JsonFileDomainStats(filePath);
      const s = await reopened.load('persistent.test');
      expect(s).not.toBeNull();
      expect(s!.curlSuccess).toBe(2);
      expect(s!.undiciFail).toBe(1);
      expect(s!.lastSuccessTransport).toBe('curl');
    });

    it('loadAll returns all known hosts after a reopen', async () => {
      await stats.record('a.test', 'curl', true);
      await stats.record('b.test', 'undici', true);
      const reopened = new JsonFileDomainStats(filePath);
      const all = await reopened.loadAll();
      expect(all.size).toBe(2);
      expect(all.get('a.test')?.curlSuccess).toBe(1);
      expect(all.get('b.test')?.undiciSuccess).toBe(1);
    });

    it('clear() wipes the file too', async () => {
      await stats.record('learn.test', 'curl', true);
      await stats.clear!();
      const reopened = new JsonFileDomainStats(filePath);
      expect(await reopened.load('learn.test')).toBeNull();
    });
  });
});

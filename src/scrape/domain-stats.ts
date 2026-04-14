/**
 * DomainStatsAdapter — pluggable persistent transport-learning store.
 *
 * Tracks per-host success/failure counts for each transport (curl-impersonate,
 * undici) so the Spider can pick the better-scoring transport based on
 * historical evidence rather than per-session heuristics alone.
 *
 * This is intentionally separate from CrawlStorageAdapter: storage holds
 * crawl results/errors, stats hold transport learning. Decoupling them
 * lets each evolve independently and lets a user mix-and-match backends
 * (e.g. in-memory storage + sqlite stats, or vice versa).
 */

export interface DomainTransportStats {
  hostname: string;
  curlSuccess: number;
  curlFail: number;
  undiciSuccess: number;
  undiciFail: number;
  lastSuccessTransport?: 'curl' | 'undici';
  preferredTransport?: 'curl' | 'undici';
  lastSeenTs: number;
}

export interface DomainStatsAdapter {
  /** Load stats for a single hostname. Returns null when unknown. */
  load(hostname: string): Promise<DomainTransportStats | null>;
  /** Load all known hostnames as a Map (called once at crawl start). */
  loadAll(): Promise<Map<string, DomainTransportStats>>;
  /** Record one transport attempt. Called fire-and-forget by the Spider. */
  record(hostname: string, transport: 'curl' | 'undici', success: boolean): Promise<void>;
  /** OPTIONAL: wipe all stats (e.g. for testing). */
  clear?(): Promise<void>;
  /** OPTIONAL: graceful shutdown (close db connection, flush buffers). */
  close?(): Promise<void>;
}

/**
 * Simple in-memory implementation.
 * Stats live for the lifetime of the adapter instance — useful for tests,
 * single-session crawls, or wrapping a remote backend with a write-through cache.
 */
export class InMemoryDomainStats implements DomainStatsAdapter {
  private map: Map<string, DomainTransportStats> = new Map();

  async load(hostname: string): Promise<DomainTransportStats | null> {
    const s = this.map.get(hostname);
    return s ? { ...s } : null;
  }

  async loadAll(): Promise<Map<string, DomainTransportStats>> {
    const copy = new Map<string, DomainTransportStats>();
    for (const [k, v] of this.map) {
      copy.set(k, { ...v });
    }
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
  }

  async clear(): Promise<void> {
    this.map.clear();
  }

  async close(): Promise<void> {
    // Nothing to release for in-memory
  }
}

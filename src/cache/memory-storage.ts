/**
 * Advanced Memory Cache Storage for Recker
 *
 * A high-performance, memory-aware cache implementation with:
 * - LRU (Least Recently Used) and FIFO eviction policies
 * - Memory limits (bytes, percentage, or auto-calculated)
 * - Container-aware (cgroup detection for Docker/K8s)
 * - V8 heap pressure monitoring
 * - Optional gzip compression
 * - Comprehensive statistics
 *
 * @example Basic usage
 * ```typescript
 * const cache = new MemoryStorage();
 * await cache.set('key', entry, 60000); // 1 minute TTL
 * const entry = await cache.get('key');
 * ```
 *
 * @example Advanced configuration
 * ```typescript
 * const cache = new MemoryStorage({
 *   maxSize: 5000,
 *   maxMemoryPercent: 0.1,      // 10% of system RAM
 *   evictionPolicy: 'lru',
 *   compression: { enabled: true, threshold: 512 },
 *   enableStats: true,
 *   monitorInterval: 30000
 * });
 *
 * // Check stats
 * console.log(cache.getStats());
 * console.log(cache.getMemoryStats());
 * ```
 *
 * @example Memory-limited configuration
 * ```typescript
 * const cache = new MemoryStorage({
 *   maxMemoryBytes: 100 * 1024 * 1024, // 100MB hard limit
 *   evictionPolicy: 'lru',
 *   compression: { enabled: true }
 * });
 * ```
 */

import zlib from 'node:zlib';
import os from 'node:os';
import { CacheEntry, CacheStorage } from '../types/index.js';
import {
  getEffectiveTotalMemoryBytes,
  resolveCacheMemoryLimit,
  formatBytes,
  getHeapStats,
} from './memory-limits.js';

/**
 * Compression configuration
 */
export interface CompressionConfig {
  /** Enable compression (default: false) */
  enabled: boolean;
  /** Minimum size in bytes to trigger compression (default: 1024) */
  threshold?: number;
}

/**
 * Memory storage configuration options
 */
export interface MemoryStorageOptions {
  /**
   * Maximum number of items to store
   * @default 1000
   */
  maxSize?: number;

  /**
   * Maximum memory usage in bytes (0 = use auto-calculated limit)
   * Cannot be used together with maxMemoryPercent
   */
  maxMemoryBytes?: number;

  /**
   * Maximum memory as fraction of system memory (0-1)
   * Example: 0.1 = 10% of system RAM
   * Cannot be used together with maxMemoryBytes
   */
  maxMemoryPercent?: number;

  /**
   * Default TTL in milliseconds (used if not specified in set())
   * @default 300000 (5 minutes)
   */
  ttl?: number;

  /**
   * Eviction policy when cache is full
   * - 'lru': Least Recently Used (default)
   * - 'fifo': First In First Out
   * @default 'lru'
   */
  evictionPolicy?: 'lru' | 'fifo';

  /**
   * Compression configuration
   * - false/undefined: No compression
   * - true: Enable with defaults (threshold: 1024)
   * - object: Custom configuration
   */
  compression?: boolean | CompressionConfig;

  /**
   * Enable statistics tracking (hits, misses, etc.)
   * @default false
   */
  enableStats?: boolean;

  /**
   * Interval in ms for memory health checks
   * Set to 0 to disable periodic checks
   * @default 15000 (15 seconds)
   */
  monitorInterval?: number;

  /**
   * Evict cache when V8 heap usage exceeds this threshold (0-1)
   * @default 0.6 (60%)
   */
  heapUsageThreshold?: number;

  /**
   * Interval in ms to clean up expired items
   * Set to 0 to disable (only lazy expiration on get)
   * @default 60000 (1 minute)
   */
  cleanupInterval?: number;

  /**
   * Callback when items are evicted due to memory pressure
   */
  onEvict?: (info: EvictionInfo) => void;

  /**
   * Callback when memory pressure is detected
   */
  onPressure?: (info: PressureInfo) => void;
}

/**
 * Information about an eviction event
 */
export interface EvictionInfo {
  reason: 'size' | 'memory' | 'heap' | 'expired';
  key?: string;
  freedBytes: number;
  currentBytes: number;
  maxMemoryBytes: number;
}

/**
 * Information about memory pressure
 */
export interface PressureInfo {
  reason: 'limit' | 'heap';
  heapLimit: number;
  heapUsed: number;
  heapRatio?: number;
  currentBytes: number;
  maxMemoryBytes: number;
  freedBytes: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  enabled: boolean;
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  hitRate: number;
  totalItems: number;
  memoryUsageBytes: number;
  maxMemoryBytes: number;
  evictedDueToMemory: number;
}

/**
 * Memory usage statistics
 */
export interface MemoryStats {
  currentMemoryBytes: number;
  maxMemoryBytes: number;
  maxMemoryPercent: number;
  memoryUsagePercent: number;
  cachePercentOfSystemMemory: number;
  totalItems: number;
  maxSize: number;
  evictedDueToMemory: number;
  memoryPressureEvents: number;
  averageItemSize: number;
  memoryUsage: {
    current: string;
    max: string;
    available: string;
  };
  systemMemory: {
    total: string;
    free: string;
    used: string;
    cachePercent: string;
  };
}

/**
 * Compression statistics
 */
export interface CompressionStats {
  enabled: boolean;
  totalItems: number;
  compressedItems: number;
  compressionThreshold: number;
  totalOriginalSize: number;
  totalCompressedSize: number;
  averageCompressionRatio: string;
  spaceSavingsPercent: string;
  memoryUsage: {
    uncompressed: string;
    compressed: string;
    saved: string;
  };
}

/**
 * Internal metadata for cached items
 */
interface CacheMetadata {
  createdAt: number;
  expiresAt: number;
  lastAccess: number;
  insertOrder: number;
  accessOrder: number;
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
}

/**
 * Compressed data wrapper
 */
interface CompressedData {
  __compressed: true;
  __data: string;
  __originalSize: number;
}

/**
 * Advanced Memory Storage implementation
 */
export class MemoryStorage implements CacheStorage {
  // Storage
  private storage = new Map<string, string | CompressedData>();
  private meta = new Map<string, CacheMetadata>();

  // Configuration
  private readonly maxSize: number;
  private readonly maxMemoryBytes: number;
  private readonly maxMemoryPercent: number;
  private readonly defaultTtl: number;
  private readonly evictionPolicy: 'lru' | 'fifo';
  private readonly compressionEnabled: boolean;
  private readonly compressionThreshold: number;
  private readonly enableStats: boolean;
  private readonly heapUsageThreshold: number;

  // Callbacks
  private readonly onEvict?: (info: EvictionInfo) => void;
  private readonly onPressure?: (info: PressureInfo) => void;

  // Tracking
  private currentMemoryBytes = 0;
  private evictedDueToMemory = 0;
  private memoryPressureEvents = 0;
  private accessCounter = 0;

  // Timers
  private monitorHandle: ReturnType<typeof setInterval> | null = null;
  private cleanupHandle: ReturnType<typeof setInterval> | null = null;

  // Stats
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
  };

  // Compression stats
  private compressionStats = {
    totalCompressed: 0,
    totalOriginalSize: 0,
    totalCompressedSize: 0,
  };

  constructor(options: MemoryStorageOptions = {}) {
    // Validate mutually exclusive options
    if (
      options.maxMemoryBytes &&
      options.maxMemoryBytes > 0 &&
      options.maxMemoryPercent &&
      options.maxMemoryPercent > 0
    ) {
      throw new Error(
        '[MemoryStorage] Cannot use both maxMemoryBytes and maxMemoryPercent'
      );
    }

    // Validate maxMemoryPercent range
    if (
      options.maxMemoryPercent !== undefined &&
      (options.maxMemoryPercent < 0 || options.maxMemoryPercent > 1)
    ) {
      throw new Error(
        '[MemoryStorage] maxMemoryPercent must be between 0 and 1'
      );
    }

    // Basic config
    this.maxSize = options.maxSize ?? 1000;
    this.defaultTtl = options.ttl ?? 300000; // 5 minutes
    this.evictionPolicy = options.evictionPolicy ?? 'lru';
    this.enableStats = options.enableStats ?? false;
    this.heapUsageThreshold = options.heapUsageThreshold ?? 0.6;

    // Memory limits
    if (options.maxMemoryBytes && options.maxMemoryBytes > 0) {
      this.maxMemoryBytes = options.maxMemoryBytes;
      this.maxMemoryPercent = 0;
    } else if (options.maxMemoryPercent && options.maxMemoryPercent > 0) {
      const effectiveTotal = getEffectiveTotalMemoryBytes();
      this.maxMemoryBytes = Math.floor(
        effectiveTotal * options.maxMemoryPercent
      );
      this.maxMemoryPercent = options.maxMemoryPercent;
    } else {
      // Auto-calculate safe limit
      const resolved = resolveCacheMemoryLimit({});
      this.maxMemoryBytes = resolved.maxMemoryBytes;
      this.maxMemoryPercent = resolved.inferredPercent ?? 0;
    }

    // Compression
    if (options.compression === true) {
      this.compressionEnabled = true;
      this.compressionThreshold = 1024;
    } else if (
      typeof options.compression === 'object' &&
      options.compression.enabled
    ) {
      this.compressionEnabled = true;
      this.compressionThreshold = options.compression.threshold ?? 1024;
    } else {
      this.compressionEnabled = false;
      this.compressionThreshold = 1024;
    }

    // Callbacks
    this.onEvict = options.onEvict;
    this.onPressure = options.onPressure;

    // Start monitor interval
    const monitorInterval = options.monitorInterval ?? 15000;
    if (monitorInterval > 0) {
      this.monitorHandle = setInterval(
        () => this.memoryHealthCheck(),
        monitorInterval
      );
      this.monitorHandle.unref();
    }

    // Start cleanup interval
    const cleanupInterval = options.cleanupInterval ?? 60000;
    if (cleanupInterval > 0) {
      this.cleanupHandle = setInterval(
        () => this.cleanupExpired(),
        cleanupInterval
      );
      this.cleanupHandle.unref();
    }
  }

  /**
   * Get a cached entry
   */
  async get(key: string): Promise<CacheEntry | undefined> {
    const data = this.storage.get(key);
    const metadata = this.meta.get(key);

    if (!data || !metadata) {
      this.recordStat('misses');
      return undefined;
    }

    // Check expiration
    const now = Date.now();
    if (now > metadata.expiresAt) {
      // Expired - remove and return undefined
      this.deleteInternal(key);
      this.recordStat('misses');
      return undefined;
    }

    // Update LRU access order
    if (this.evictionPolicy === 'lru') {
      metadata.lastAccess = now;
      metadata.accessOrder = ++this.accessCounter;
    }

    this.recordStat('hits');

    // Decompress if needed
    if (this.isCompressed(data)) {
      try {
        const decompressed = this.decompress(data);
        return JSON.parse(decompressed) as CacheEntry;
      } catch {
        // Corrupted entry - remove it
        this.deleteInternal(key);
        return undefined;
      }
    }

    return JSON.parse(data) as CacheEntry;
  }

  /**
   * Set a cached entry
   */
  async set(key: string, entry: CacheEntry, ttl?: number): Promise<void> {
    const effectiveTtl = ttl ?? this.defaultTtl;
    const now = Date.now();

    // Serialize
    const serialized = JSON.stringify(entry);
    const originalSize = Buffer.byteLength(serialized, 'utf8');

    // Prepare data (potentially compressed)
    let finalData: string | CompressedData = serialized;
    let compressedSize = originalSize;
    let compressed = false;

    if (this.compressionEnabled && originalSize >= this.compressionThreshold) {
      try {
        const result = this.compress(serialized);
        finalData = result;
        compressedSize = Buffer.byteLength(result.__data, 'utf8');
        compressed = true;

        this.compressionStats.totalCompressed++;
        this.compressionStats.totalOriginalSize += originalSize;
        this.compressionStats.totalCompressedSize += compressedSize;
      } catch {
        // Compression failed - store uncompressed
      }
    }

    // If updating existing key, subtract old size
    const existingMeta = this.meta.get(key);
    if (existingMeta) {
      this.currentMemoryBytes -= existingMeta.compressedSize;
    }

    // Check if new item fits
    if (!this.enforceMemoryLimit(compressedSize)) {
      // Item too large or can't make room
      this.evictedDueToMemory++;
      return;
    }

    // Enforce max size (item count)
    if (!existingMeta && this.storage.size >= this.maxSize) {
      this.evictOne('size');
    }

    // Store
    this.storage.set(key, finalData);
    this.meta.set(key, {
      createdAt: now,
      expiresAt: now + effectiveTtl,
      lastAccess: now,
      insertOrder: ++this.accessCounter,
      accessOrder: this.accessCounter,
      compressed,
      originalSize,
      compressedSize,
    });

    this.currentMemoryBytes += compressedSize;
    this.recordStat('sets');
  }

  /**
   * Delete a cached entry
   */
  async delete(key: string): Promise<void> {
    this.deleteInternal(key);
    this.recordStat('deletes');
  }

  /**
   * Clear all cached entries, or those matching a prefix
   */
  clear(prefix?: string): void {
    if (!prefix) {
      this.storage.clear();
      this.meta.clear();
      this.currentMemoryBytes = 0;
      this.evictedDueToMemory = 0;
      if (this.enableStats) {
        this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0 };
      }
      return;
    }

    // Clear by prefix
    for (const key of this.storage.keys()) {
      if (key.startsWith(prefix)) {
        this.deleteInternal(key);
      }
    }
  }

  /**
   * Get number of cached items
   */
  size(): number {
    return this.storage.size;
  }

  /**
   * Get all cache keys
   */
  keys(): string[] {
    return Array.from(this.storage.keys());
  }

  /**
   * Check if a key exists (without updating LRU)
   */
  has(key: string): boolean {
    const meta = this.meta.get(key);
    if (!meta) return false;
    if (Date.now() > meta.expiresAt) {
      this.deleteInternal(key);
      return false;
    }
    return true;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      enabled: this.enableStats,
      ...this.stats,
      hitRate,
      totalItems: this.storage.size,
      memoryUsageBytes: this.currentMemoryBytes,
      maxMemoryBytes: this.maxMemoryBytes,
      evictedDueToMemory: this.evictedDueToMemory,
    };
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): MemoryStats {
    const totalItems = this.storage.size;
    const memoryUsagePercent =
      this.maxMemoryBytes > 0
        ? (this.currentMemoryBytes / this.maxMemoryBytes) * 100
        : 0;

    const systemTotal = os.totalmem();
    const systemFree = os.freemem();
    const systemUsed = systemTotal - systemFree;
    const cachePercentOfSystem =
      systemTotal > 0 ? (this.currentMemoryBytes / systemTotal) * 100 : 0;

    return {
      currentMemoryBytes: this.currentMemoryBytes,
      maxMemoryBytes: this.maxMemoryBytes,
      maxMemoryPercent: this.maxMemoryPercent,
      memoryUsagePercent: parseFloat(memoryUsagePercent.toFixed(2)),
      cachePercentOfSystemMemory: parseFloat(cachePercentOfSystem.toFixed(2)),
      totalItems,
      maxSize: this.maxSize,
      evictedDueToMemory: this.evictedDueToMemory,
      memoryPressureEvents: this.memoryPressureEvents,
      averageItemSize:
        totalItems > 0 ? Math.round(this.currentMemoryBytes / totalItems) : 0,
      memoryUsage: {
        current: formatBytes(this.currentMemoryBytes),
        max: formatBytes(this.maxMemoryBytes),
        available: formatBytes(
          Math.max(0, this.maxMemoryBytes - this.currentMemoryBytes)
        ),
      },
      systemMemory: {
        total: formatBytes(systemTotal),
        free: formatBytes(systemFree),
        used: formatBytes(systemUsed),
        cachePercent: `${cachePercentOfSystem.toFixed(2)}%`,
      },
    };
  }

  /**
   * Get compression statistics
   */
  getCompressionStats(): CompressionStats {
    if (!this.compressionEnabled) {
      return {
        enabled: false,
        totalItems: this.storage.size,
        compressedItems: 0,
        compressionThreshold: this.compressionThreshold,
        totalOriginalSize: 0,
        totalCompressedSize: 0,
        averageCompressionRatio: '0',
        spaceSavingsPercent: '0',
        memoryUsage: {
          uncompressed: '0 B',
          compressed: '0 B',
          saved: '0 B',
        },
      };
    }

    const ratio =
      this.compressionStats.totalOriginalSize > 0
        ? (
            this.compressionStats.totalCompressedSize /
            this.compressionStats.totalOriginalSize
          ).toFixed(2)
        : '0';

    const savings =
      this.compressionStats.totalOriginalSize > 0
        ? (
            ((this.compressionStats.totalOriginalSize -
              this.compressionStats.totalCompressedSize) /
              this.compressionStats.totalOriginalSize) *
            100
          ).toFixed(2)
        : '0';

    const saved =
      this.compressionStats.totalOriginalSize -
      this.compressionStats.totalCompressedSize;

    return {
      enabled: true,
      totalItems: this.storage.size,
      compressedItems: this.compressionStats.totalCompressed,
      compressionThreshold: this.compressionThreshold,
      totalOriginalSize: this.compressionStats.totalOriginalSize,
      totalCompressedSize: this.compressionStats.totalCompressedSize,
      averageCompressionRatio: ratio,
      spaceSavingsPercent: savings,
      memoryUsage: {
        uncompressed: formatBytes(this.compressionStats.totalOriginalSize),
        compressed: formatBytes(this.compressionStats.totalCompressedSize),
        saved: formatBytes(saved),
      },
    };
  }

  /**
   * Shutdown the cache, cleaning up timers
   */
  shutdown(): void {
    if (this.monitorHandle) {
      clearInterval(this.monitorHandle);
      this.monitorHandle = null;
    }
    if (this.cleanupHandle) {
      clearInterval(this.cleanupHandle);
      this.cleanupHandle = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Private methods
  // ─────────────────────────────────────────────────────────────────

  private deleteInternal(key: string): void {
    const meta = this.meta.get(key);
    if (meta) {
      this.currentMemoryBytes -= meta.compressedSize;
    }
    this.storage.delete(key);
    this.meta.delete(key);
  }

  private recordStat(type: keyof typeof this.stats): void {
    if (this.enableStats) {
      this.stats[type]++;
    }
  }

  private isCompressed(data: string | CompressedData): data is CompressedData {
    return (
      typeof data === 'object' && data !== null && '__compressed' in data
    );
  }

  private compress(data: string): CompressedData {
    const buffer = Buffer.from(data, 'utf8');
    const compressed = zlib.gzipSync(buffer);
    return {
      __compressed: true,
      __data: compressed.toString('base64'),
      __originalSize: buffer.length,
    };
  }

  private decompress(data: CompressedData): string {
    const buffer = Buffer.from(data.__data, 'base64');
    const decompressed = zlib.gunzipSync(buffer);
    return decompressed.toString('utf8');
  }

  /**
   * Select the best candidate for eviction based on policy
   */
  private selectEvictionCandidate(): string | null {
    if (this.meta.size === 0) return null;

    let candidate: string | null = null;
    let candidateValue =
      this.evictionPolicy === 'lru' ? Infinity : Infinity;

    for (const [key, meta] of this.meta) {
      const value =
        this.evictionPolicy === 'lru' ? meta.accessOrder : meta.insertOrder;
      if (value < candidateValue) {
        candidateValue = value;
        candidate = key;
      }
    }

    return candidate;
  }

  /**
   * Evict one item based on policy
   */
  private evictOne(
    reason: 'size' | 'memory' | 'heap'
  ): { key: string; freedBytes: number } | null {
    const candidate = this.selectEvictionCandidate();
    if (!candidate) return null;

    const meta = this.meta.get(candidate);
    const freedBytes = meta?.compressedSize ?? 0;

    this.deleteInternal(candidate);
    this.stats.evictions++;

    if (reason === 'memory' || reason === 'heap') {
      this.evictedDueToMemory++;
    }

    this.onEvict?.({
      reason,
      key: candidate,
      freedBytes,
      currentBytes: this.currentMemoryBytes,
      maxMemoryBytes: this.maxMemoryBytes,
    });

    return { key: candidate, freedBytes };
  }

  /**
   * Enforce memory limit, evicting items until space is available
   */
  private enforceMemoryLimit(incomingSize: number): boolean {
    // If the single item exceeds the limit, reject it
    if (incomingSize > this.maxMemoryBytes) {
      return false;
    }

    // Evict until we have room
    while (
      this.currentMemoryBytes + incomingSize > this.maxMemoryBytes &&
      this.storage.size > 0
    ) {
      const result = this.evictOne('memory');
      if (!result) break;
    }

    return this.currentMemoryBytes + incomingSize <= this.maxMemoryBytes;
  }

  /**
   * Reduce memory to target bytes
   */
  private reduceMemoryTo(targetBytes: number): number {
    targetBytes = Math.max(0, targetBytes);
    let freedBytes = 0;

    while (this.currentMemoryBytes > targetBytes && this.storage.size > 0) {
      const result = this.evictOne('memory');
      if (!result) break;
      freedBytes += result.freedBytes;
    }

    return freedBytes;
  }

  /**
   * Periodic memory health check
   */
  private memoryHealthCheck(): number {
    let totalFreed = 0;

    // Check memory limit
    if (this.currentMemoryBytes > this.maxMemoryBytes) {
      const before = this.currentMemoryBytes;
      this.enforceMemoryLimit(0);
      const freed = before - this.currentMemoryBytes;
      if (freed > 0) {
        totalFreed += freed;
        this.memoryPressureEvents++;
        this.onPressure?.({
          reason: 'limit',
          heapLimit: getHeapStats().heapLimit,
          heapUsed: getHeapStats().heapUsed,
          currentBytes: this.currentMemoryBytes,
          maxMemoryBytes: this.maxMemoryBytes,
          freedBytes: freed,
        });
      }
    }

    // Check V8 heap pressure
    const { heapUsed, heapLimit, heapRatio } = getHeapStats();
    if (heapLimit > 0 && heapRatio >= this.heapUsageThreshold) {
      const before = this.currentMemoryBytes;
      const target = Math.floor(this.currentMemoryBytes * 0.5);
      this.reduceMemoryTo(target);
      const freed = before - this.currentMemoryBytes;
      if (freed > 0) {
        totalFreed += freed;
        this.memoryPressureEvents++;
        this.onPressure?.({
          reason: 'heap',
          heapLimit,
          heapUsed,
          heapRatio,
          currentBytes: this.currentMemoryBytes,
          maxMemoryBytes: this.maxMemoryBytes,
          freedBytes: freed,
        });
      }
    }

    return totalFreed;
  }

  /**
   * Clean up expired items
   */
  private cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, meta] of this.meta) {
      if (now > meta.expiresAt) {
        this.deleteInternal(key);
        cleaned++;
        this.onEvict?.({
          reason: 'expired',
          key,
          freedBytes: meta.compressedSize,
          currentBytes: this.currentMemoryBytes,
          maxMemoryBytes: this.maxMemoryBytes,
        });
      }
    }

    return cleaned;
  }
}

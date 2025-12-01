/**
 * Memory limit utilities for MemoryStorage
 *
 * Provides container-aware memory detection and safe limit calculation.
 * Supports cgroup v1 and v2 for Docker/Kubernetes environments.
 */

import fs from 'node:fs';
import os from 'node:os';
import v8 from 'node:v8';

/** Default: Use up to 50% of effective memory */
const DEFAULT_TOTAL_PERCENT = 0.5;

/** Default: Cap at 60% of V8 heap limit */
const DEFAULT_HEAP_PERCENT = 0.6;

/**
 * Read cgroup memory limit (v2 first, fallback to v1)
 * Used to detect container memory limits in Docker/Kubernetes
 */
function readCgroupLimit(): number | null {
  const candidates = [
    '/sys/fs/cgroup/memory.max', // cgroup v2
    '/sys/fs/cgroup/memory/memory.limit_in_bytes', // cgroup v1
  ];

  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8').trim();
        if (!raw || raw === 'max') continue;
        const value = Number.parseInt(raw, 10);
        if (Number.isFinite(value) && value > 0) {
          return value;
        }
      }
    } catch {
      // Ignore and continue to next candidate
    }
  }

  return null;
}

/**
 * Get effective memory limit that takes container cgroups into account.
 * Falls back to os.totalmem() when no container limit is imposed.
 *
 * @returns Effective total memory in bytes
 *
 * @example
 * ```typescript
 * const totalMem = getEffectiveTotalMemoryBytes();
 * // In a 512MB container: 536870912
 * // On bare metal 16GB: 17179869184
 * ```
 */
export function getEffectiveTotalMemoryBytes(): number {
  const cgroupLimit = readCgroupLimit();
  if (cgroupLimit && Number.isFinite(cgroupLimit) && cgroupLimit > 0) {
    return cgroupLimit;
  }
  return os.totalmem();
}

/**
 * Result of resolving cache memory limits
 */
export interface ResolvedMemoryLimit {
  /** Final calculated memory limit in bytes */
  maxMemoryBytes: number;
  /** Whether the limit was derived from a percentage */
  derivedFromPercent: boolean;
  /** Effective total memory (container or system) */
  effectiveTotal: number;
  /** V8 heap limit */
  heapLimit: number;
  /** Inferred percentage of total memory (for monitoring) */
  inferredPercent: number | null;
}

/**
 * Options for resolving cache memory limits
 */
export interface MemoryLimitOptions {
  /** Explicit memory limit in bytes */
  maxMemoryBytes?: number;
  /** Memory limit as fraction of system memory (0-1) */
  maxMemoryPercent?: number;
  /** Safety percentage of effective memory (default: 0.5 = 50%) */
  safetyPercent?: number;
}

/**
 * Compute safe cache memory boundaries based on environment.
 *
 * Takes into account:
 * - Explicit maxMemoryBytes limit
 * - maxMemoryPercent of system/container memory
 * - V8 heap limit (prevents Node.js OOM)
 * - Container cgroup limits
 *
 * @param options - Memory limit configuration
 * @returns Resolved memory limits with metadata
 *
 * @example
 * ```typescript
 * // Explicit limit
 * const limits = resolveCacheMemoryLimit({ maxMemoryBytes: 100 * 1024 * 1024 });
 *
 * // Percentage of system memory
 * const limits = resolveCacheMemoryLimit({ maxMemoryPercent: 0.1 }); // 10%
 *
 * // Let the system decide (safe defaults)
 * const limits = resolveCacheMemoryLimit({});
 * ```
 */
export function resolveCacheMemoryLimit(
  options: MemoryLimitOptions = {}
): ResolvedMemoryLimit {
  const { maxMemoryBytes, maxMemoryPercent, safetyPercent } = options;

  const heapStats = v8.getHeapStatistics();
  const heapLimit = heapStats?.heap_size_limit ?? 0;
  const effectiveTotal = getEffectiveTotalMemoryBytes();

  let resolvedBytes = 0;
  let derivedFromPercent = false;

  // Priority 1: Explicit bytes limit
  if (typeof maxMemoryBytes === 'number' && maxMemoryBytes > 0) {
    resolvedBytes = maxMemoryBytes;
  }
  // Priority 2: Percentage of system memory
  else if (typeof maxMemoryPercent === 'number' && maxMemoryPercent > 0) {
    const percent = Math.max(0, Math.min(maxMemoryPercent, 1));
    resolvedBytes = Math.floor(effectiveTotal * percent);
    derivedFromPercent = true;
  }

  // Apply safety cap based on total memory
  const safeTotalPercent =
    typeof safetyPercent === 'number' && safetyPercent > 0 && safetyPercent <= 1
      ? safetyPercent
      : DEFAULT_TOTAL_PERCENT;
  const totalCap = Math.floor(effectiveTotal * safeTotalPercent);

  if (resolvedBytes === 0 || totalCap < resolvedBytes) {
    resolvedBytes = totalCap;
    derivedFromPercent = derivedFromPercent || (maxMemoryPercent ?? 0) > 0;
  }

  // Apply V8 heap cap (prevent Node.js OOM)
  if (heapLimit > 0) {
    const heapCap = Math.floor(heapLimit * DEFAULT_HEAP_PERCENT);
    if (resolvedBytes === 0 || heapCap < resolvedBytes) {
      resolvedBytes = heapCap;
      derivedFromPercent = derivedFromPercent || (maxMemoryPercent ?? 0) > 0;
    }
  }

  // Guard against zero/negative values
  if (!Number.isFinite(resolvedBytes) || resolvedBytes <= 0) {
    resolvedBytes = Math.floor(effectiveTotal * DEFAULT_TOTAL_PERCENT);
    derivedFromPercent = true;
  }

  const inferredPercent =
    effectiveTotal > 0 ? resolvedBytes / effectiveTotal : null;

  return {
    maxMemoryBytes: resolvedBytes,
    derivedFromPercent,
    effectiveTotal,
    heapLimit,
    inferredPercent,
  };
}

/**
 * Format bytes to human-readable string
 *
 * @param bytes - Number of bytes
 * @returns Formatted string like "1.5 GB"
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Get current V8 heap statistics
 *
 * @returns Object with heap usage info
 */
export function getHeapStats(): {
  heapUsed: number;
  heapLimit: number;
  heapRatio: number;
} {
  const heapStats = v8.getHeapStatistics();
  const { heapUsed } = process.memoryUsage();
  const heapLimit = heapStats?.heap_size_limit ?? 0;
  const heapRatio = heapLimit > 0 ? heapUsed / heapLimit : 0;

  return {
    heapUsed,
    heapLimit,
    heapRatio,
  };
}

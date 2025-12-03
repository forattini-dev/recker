/**
 * System Metrics - CPU and Memory usage collection
 * Uses Node.js built-in os module for cross-platform compatibility
 */

import os from 'node:os';

export interface SystemSnapshot {
  /** CPU usage percentage (0-100) */
  cpu: number;
  /** Memory usage percentage (0-100) */
  memory: number;
  /** Memory used in bytes */
  memoryUsed: number;
  /** Total memory in bytes */
  memoryTotal: number;
  /** Timestamp of the snapshot */
  timestamp: number;
}

/**
 * System Metrics Collector
 * Collects CPU and memory usage at regular intervals
 */
export class SystemMetrics {
  private previousCpuTimes: { idle: number; total: number } | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<(snapshot: SystemSnapshot) => void> = new Set();

  /**
   * Get current memory usage
   */
  getMemory(): { used: number; total: number; percent: number } {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const percent = (used / total) * 100;

    return { used, total, percent };
  }

  /**
   * Get current CPU times (for delta calculation)
   */
  private getCpuTimes(): { idle: number; total: number } {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;

    for (const cpu of cpus) {
      idle += cpu.times.idle;
      total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
    }

    return { idle, total };
  }

  /**
   * Calculate CPU usage percentage between two snapshots
   */
  getCpuUsage(): number {
    const current = this.getCpuTimes();

    if (!this.previousCpuTimes) {
      this.previousCpuTimes = current;
      return 0;
    }

    const idleDelta = current.idle - this.previousCpuTimes.idle;
    const totalDelta = current.total - this.previousCpuTimes.total;

    this.previousCpuTimes = current;

    if (totalDelta === 0) return 0;

    const usage = 100 - (idleDelta / totalDelta) * 100;
    return Math.max(0, Math.min(100, usage));
  }

  /**
   * Get a complete system snapshot
   */
  getSnapshot(): SystemSnapshot {
    const memory = this.getMemory();
    const cpu = this.getCpuUsage();

    return {
      cpu,
      memory: memory.percent,
      memoryUsed: memory.used,
      memoryTotal: memory.total,
      timestamp: Date.now()
    };
  }

  /**
   * Start collecting metrics at regular intervals
   */
  startPolling(intervalMs: number = 1000): void {
    if (this.intervalId) return;

    // Initialize CPU baseline
    this.previousCpuTimes = this.getCpuTimes();

    this.intervalId = setInterval(() => {
      const snapshot = this.getSnapshot();
      for (const listener of this.listeners) {
        listener(snapshot);
      }
    }, intervalMs);
  }

  /**
   * Stop collecting metrics
   */
  stopPolling(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Subscribe to metric updates
   */
  onSnapshot(callback: (snapshot: SystemSnapshot) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Format bytes to human-readable string
   */
  static formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}M`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`;
  }

  /**
   * Format memory as "used/total" string
   */
  static formatMemory(used: number, total: number): string {
    return `${this.formatBytes(used)}/${this.formatBytes(total)}`;
  }
}

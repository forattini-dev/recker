/**
 * useSystemMetrics - Hook for monitoring CPU and RAM usage
 *
 * Provides reactive signals for system metrics with sparkline history.
 */

import { createSignal } from 'tuiuiu.js';
import * as os from 'node:os';

// =============================================================================
// Types
// =============================================================================

export interface SystemMetrics {
  /** CPU usage percentage (0-100) */
  cpu: number;
  /** RAM usage percentage (0-100) */
  ram: number;
  /** CPU history for sparkline (last 20 values) */
  cpuHistory: number[];
  /** RAM history for sparkline (last 20 values) */
  ramHistory: number[];
}

// =============================================================================
// State
// =============================================================================

const HISTORY_SIZE = 20;
const UPDATE_INTERVAL = 1000; // 1 second

// Signals
const [cpu, setCpu] = createSignal(0);
const [ram, setRam] = createSignal(0);
const [cpuHistory, setCpuHistory] = createSignal<number[]>([]);
const [ramHistory, setRamHistory] = createSignal<number[]>([]);

// Previous CPU times for delta calculation
let prevCpuTimes: { idle: number; total: number } | null = null;
let updateInterval: ReturnType<typeof setInterval> | null = null;

// =============================================================================
// CPU Calculation
// =============================================================================

function getCpuTimes(): { idle: number; total: number } {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }

  return { idle, total };
}

function calculateCpuUsage(): number {
  const current = getCpuTimes();

  if (!prevCpuTimes) {
    prevCpuTimes = current;
    return 0;
  }

  const idleDelta = current.idle - prevCpuTimes.idle;
  const totalDelta = current.total - prevCpuTimes.total;

  prevCpuTimes = current;

  if (totalDelta === 0) return 0;

  const usage = 100 - (idleDelta / totalDelta) * 100;
  return Math.max(0, Math.min(100, Math.round(usage)));
}

// =============================================================================
// RAM Calculation
// =============================================================================

function calculateRamUsage(): number {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  return Math.round((usedMem / totalMem) * 100);
}

// =============================================================================
// Update Loop
// =============================================================================

function updateMetrics(): void {
  const newCpu = calculateCpuUsage();
  const newRam = calculateRamUsage();

  setCpu(newCpu);
  setRam(newRam);

  // Update history
  setCpuHistory(prev => {
    const updated = [...prev, newCpu];
    return updated.slice(-HISTORY_SIZE);
  });

  setRamHistory(prev => {
    const updated = [...prev, newRam];
    return updated.slice(-HISTORY_SIZE);
  });
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Start monitoring system metrics
 */
export function startMetricsMonitoring(): void {
  if (updateInterval) return;

  // Initial update
  updateMetrics();

  // Start interval
  updateInterval = setInterval(updateMetrics, UPDATE_INTERVAL);
}

/**
 * Stop monitoring system metrics
 */
export function stopMetricsMonitoring(): void {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

/**
 * Get current system metrics
 */
export function useSystemMetrics(): SystemMetrics {
  return {
    cpu: cpu(),
    ram: ram(),
    cpuHistory: cpuHistory(),
    ramHistory: ramHistory(),
  };
}

/**
 * Get color based on usage level
 */
export function getUsageColor(usage: number): string {
  if (usage < 50) return '#00FF00'; // Green
  if (usage < 75) return '#FFFF00'; // Yellow
  return '#FF0000'; // Red
}

// Export signals for direct access
export { cpu, ram, cpuHistory, ramHistory };

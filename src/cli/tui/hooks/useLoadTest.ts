/**
 * Load Test State Management
 *
 * Reactive signals for the load testing dashboard.
 * Following tuiuiu pattern: signals defined at module level for sharing across components.
 */

import { createSignal, createMemo, batch } from 'tuiuiu.js';
import { LoadGenerator, LoadConfig } from '../../../bench/generator.js';
import { LoadStats, ErrorEntry } from '../../../bench/stats.js';
import { SystemMetrics } from '../../../utils/system-metrics.js';

// =============================================================================
// Types
// =============================================================================

export interface MemoryInfo {
  percent: number;
  used: number;
  total: number;
}

export interface LoadTestState {
  // Accessors (call as functions to get value)
  isRunning: () => boolean;
  elapsed: () => number;
  remaining: () => number;
  progress: () => number;

  // Metrics
  rps: () => number;
  latencyP50: () => number;
  latencyP95: () => number;
  latencyP99: () => number;
  activeUsers: () => number;
  totalRequests: () => number;
  successfulRequests: () => number;
  failedRequests: () => number;
  bytesTransferred: () => number;

  // History for charts
  rpsHistory: () => number[];
  latencyHistory: () => number[];
  usersHistory: () => number[];
  cpuHistory: () => number[];
  memoryHistory: () => number[];

  // Status codes and errors
  statusCodes: () => Record<number, number>;
  recentErrors: () => ErrorEntry[];

  // System metrics
  cpu: () => number;
  memory: () => MemoryInfo;

  // Config
  config: LoadConfig;

  // Actions
  start: () => Promise<void>;
  stop: () => void;
  getStats: () => LoadStats;

  // Callback for UI updates (set by dashboard)
  onUpdate: (callback: () => void) => void;
}

// =============================================================================
// Constants
// =============================================================================

const HISTORY_SIZE = 60; // 60 seconds of history

// =============================================================================
// State Factory
// =============================================================================

/**
 * Create a new load test state instance.
 * Each dashboard gets its own isolated state.
 */
export function createLoadTestState(config: LoadConfig): LoadTestState {
  // ---------------------------------------------------------------------------
  // Core State Signals
  // ---------------------------------------------------------------------------

  const [isRunning, setIsRunning] = createSignal(false);
  const [elapsed, setElapsed] = createSignal(0);

  // Metrics
  const [rps, setRps] = createSignal(0);
  const [latencyP50, setLatencyP50] = createSignal(0);
  const [latencyP95, setLatencyP95] = createSignal(0);
  const [latencyP99, setLatencyP99] = createSignal(0);
  const [activeUsers, setActiveUsers] = createSignal(0);
  const [totalRequests, setTotalRequests] = createSignal(0);
  const [successfulRequests, setSuccessfulRequests] = createSignal(0);
  const [failedRequests, setFailedRequests] = createSignal(0);
  const [bytesTransferred, setBytesTransferred] = createSignal(0);

  // History arrays
  const [rpsHistory, setRpsHistory] = createSignal<number[]>(new Array(HISTORY_SIZE).fill(0));
  const [latencyHistory, setLatencyHistory] = createSignal<number[]>(new Array(HISTORY_SIZE).fill(0));
  const [usersHistory, setUsersHistory] = createSignal<number[]>(new Array(HISTORY_SIZE).fill(0));
  const [cpuHistory, setCpuHistory] = createSignal<number[]>(new Array(HISTORY_SIZE).fill(0));
  const [memoryHistory, setMemoryHistory] = createSignal<number[]>(new Array(HISTORY_SIZE).fill(0));

  // Status codes and errors
  const [statusCodes, setStatusCodes] = createSignal<Record<number, number>>({});
  const [recentErrors, setRecentErrors] = createSignal<ErrorEntry[]>([]);

  // System metrics
  const [cpu, setCpu] = createSignal(0);
  const [memory, setMemory] = createSignal<MemoryInfo>({ percent: 0, used: 0, total: 0 });

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------

  const remaining = createMemo(() => Math.max(0, config.duration - elapsed()));
  const progress = createMemo(() => (elapsed() / config.duration) * 100);

  // ---------------------------------------------------------------------------
  // Internal State
  // ---------------------------------------------------------------------------

  let generator: LoadGenerator | null = null;
  let sysMetrics: SystemMetrics | null = null;
  let startTime = 0;
  let updateCallback: (() => void) | null = null;

  // ---------------------------------------------------------------------------
  // Update Function
  // ---------------------------------------------------------------------------

  function updateStats() {
    if (!generator) return;

    const now = Date.now();
    const elapsedSec = Math.floor((now - startTime) / 1000);
    const snapshot = generator.stats.getSnapshot();
    const summary = generator.stats.getSummary();

    batch(() => {
      // Update elapsed time
      setElapsed(elapsedSec);

      // Update real-time metrics
      setRps(snapshot.rps);
      setLatencyP95(snapshot.p95);
      setActiveUsers(snapshot.activeUsers);
      setTotalRequests(generator!.stats.totalRequests);
      setSuccessfulRequests(generator!.stats.successful);
      setFailedRequests(generator!.stats.failed);
      setBytesTransferred(generator!.stats.bytesTransferred);

      // Update latency percentiles from summary
      setLatencyP50(summary.latency.p50);
      setLatencyP99(summary.latency.p99);

      // Update status codes
      setStatusCodes({ ...generator!.stats.statusCodes });

      // Update errors
      setRecentErrors(generator!.stats.getRecentErrors());

      // Update history arrays (shift left, push new value)
      setRpsHistory(prev => {
        const next = [...prev];
        next.shift();
        next.push(snapshot.rps);
        return next;
      });

      setLatencyHistory(prev => {
        const next = [...prev];
        next.shift();
        next.push(snapshot.p95);
        return next;
      });

      setUsersHistory(prev => {
        const next = [...prev];
        next.shift();
        next.push(snapshot.activeUsers);
        return next;
      });
    });

    // Notify UI to re-render
    if (updateCallback) {
      updateCallback();
    }

    // Check if test is complete
    if (elapsedSec >= config.duration) {
      stop();
    }
  }

  // ---------------------------------------------------------------------------
  // System Metrics Handler
  // ---------------------------------------------------------------------------

  function onSystemMetrics(snap: { cpu: number; memory: number; memoryUsed: number; memoryTotal: number }) {
    batch(() => {
      setCpu(snap.cpu);
      setMemory({
        percent: snap.memory,
        used: snap.memoryUsed,
        total: snap.memoryTotal
      });

      setCpuHistory(prev => {
        const next = [...prev];
        next.shift();
        next.push(snap.cpu);
        return next;
      });

      setMemoryHistory(prev => {
        const next = [...prev];
        next.shift();
        next.push(snap.memory);
        return next;
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function start(): Promise<void> {
    if (isRunning()) return;

    // Initialize generator and metrics
    generator = new LoadGenerator(config);
    sysMetrics = new SystemMetrics();
    startTime = Date.now();

    // Start system metrics polling
    sysMetrics.onSnapshot(onSystemMetrics);
    sysMetrics.startPolling(1000);

    // Set running FIRST so the update loop knows it should run
    setIsRunning(true);

    // Use recursive setImmediate for higher priority in event loop
    // (setInterval gets blocked by tuiuiu's render loop)
    let lastUpdate = Date.now();
    const scheduleUpdate = () => {
      if (!isRunning()) return;

      const now = Date.now();
      if (now - lastUpdate >= 1000) {
        updateStats();
        lastUpdate = now;
      }

      // Schedule next check with setImmediate (higher priority than timers)
      setImmediate(scheduleUpdate);
    };

    // Start the update loop
    setImmediate(scheduleUpdate);

    // Start load generation (runs in background)
    try {
      await generator.start();
    } catch {
      // Test completed or was stopped
    } finally {
      stop();
    }
  }

  function stop(): void {
    if (!isRunning()) return;

    // Set running to false first to stop the update loop
    setIsRunning(false);

    // Stop generator
    if (generator) {
      generator.stop();
    }

    // Stop system metrics
    if (sysMetrics) {
      sysMetrics.stopPolling();
    }
  }

  function getStats(): LoadStats {
    return generator?.stats ?? new LoadStats();
  }

  // ---------------------------------------------------------------------------
  // Return State Object
  // ---------------------------------------------------------------------------

  return {
    // Accessors
    isRunning,
    elapsed,
    remaining,
    progress,

    // Metrics
    rps,
    latencyP50,
    latencyP95,
    latencyP99,
    activeUsers,
    totalRequests,
    successfulRequests,
    failedRequests,
    bytesTransferred,

    // History
    rpsHistory,
    latencyHistory,
    usersHistory,
    cpuHistory,
    memoryHistory,

    // Status and errors
    statusCodes,
    recentErrors,

    // System
    cpu,
    memory,

    // Config
    config,

    // Actions
    start,
    stop,
    getStats,

    // Callback registration
    onUpdate: (callback: () => void) => {
      updateCallback = callback;
    },
  };
}

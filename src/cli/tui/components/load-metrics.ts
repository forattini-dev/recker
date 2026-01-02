/**
 * Load Dashboard Visual Components
 *
 * Modular tuiuiu components for the load testing dashboard.
 */

import {
  Box,
  Text,
  Sparkline,
  BarChart,
  ProgressBar,
  Badge,
  Divider,
  MetricDisplay,
} from 'tuiuiu.js';
import type { LoadTestState, MemoryInfo } from '../hooks/useLoadTest.js';
import type { ErrorEntry } from '../../../bench/stats.js';
import type { LoadConfig } from '../../../bench/generator.js';
import { SystemMetrics } from '../../../utils/system-metrics.js';
import type { VNode } from 'tuiuiu.js';

// =============================================================================
// Header Component
// =============================================================================

interface LoadHeaderProps {
  config: LoadConfig;
  elapsed: () => number;
  remaining: () => number;
  isRunning: () => boolean;
}

export function LoadHeader({ config, elapsed, remaining, isRunning }: LoadHeaderProps): VNode {
  const status = isRunning() ? 'RUNNING' : 'STOPPED';
  const badgeColor = isRunning() ? 'green' : 'red';

  return Box(
    {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingX: 1,
      paddingY: 0,
      borderStyle: 'single',
      borderColor: 'cyan',
    },
    // Left: Title
    Box({ flexDirection: 'row', gap: 2 },
      Text({ color: 'cyan', bold: true }, 'Rek Load Tester'),
      Badge({ label: status, color: badgeColor, variant: 'default' })
    ),
    // Center: URL
    Text({ color: 'white', dim: true }, config.url),
    // Right: Time + Controls
    Box({ flexDirection: 'row', gap: 2 },
      Text({ color: 'yellow' }, `${elapsed()}s / ${config.duration}s`),
      Text({ color: 'gray', dim: true }, '[ESC] stop')
    )
  );
}

// =============================================================================
// Stats Panel (Left Column)
// =============================================================================

interface StatsPanelProps {
  activeUsers: () => number;
  rps: () => number;
  latencyP95: () => number;
  totalRequests: () => number;
  failedRequests: () => number;
  bytesTransferred: () => number;
}

export function StatsPanel(props: StatsPanelProps): VNode {
  const { activeUsers, rps, latencyP95, totalRequests, failedRequests, bytesTransferred } = props;

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  return Box(
    {
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: 'blue',
      padding: 1,
    },
    Text({ color: 'blue', bold: true }, ' Stats '),
    Divider({}),
    MetricDisplay({
      label: 'Users',
      value: activeUsers,
      size: 'compact',
      showTrend: false,
      showDelta: false,
      thresholds: { success: [0, Infinity] },  // Always cyan-ish
    }),
    MetricDisplay({
      label: 'RPS',
      value: rps,
      size: 'compact',
      showTrend: false,
      showDelta: false,
      thresholds: { success: [0, Infinity] },  // Always green
    }),
    MetricDisplay({
      label: 'P95',
      value: () => latencyP95(),
      unit: 'ms',
      size: 'compact',
      showTrend: false,
      showDelta: false,
      thresholds: {
        success: [0, 200],
        warning: [200, 500],
        error: [500, Infinity],
      },
    }),
    MetricDisplay({
      label: 'Total',
      value: totalRequests,
      size: 'compact',
      showTrend: false,
      showDelta: false,
    }),
    MetricDisplay({
      label: 'Errors',
      value: failedRequests,
      size: 'compact',
      showTrend: false,
      showDelta: false,
      thresholds: {
        success: [0, 1],      // 0 errors = green
        error: [1, Infinity], // Any errors = red
      },
    }),
    StatRow('Data', formatBytes(bytesTransferred()), 'gray')
  );
}

function StatRow(label: string, value: string, color: string): VNode {
  return Box(
    { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
    Text({ color: 'gray' }, `${label}:`),
    Text({ color: color as any, bold: true }, value)
  );
}

// =============================================================================
// Progress Panel
// =============================================================================

interface ProgressPanelProps {
  progress: () => number;
  elapsed: () => number;
  duration: number;
}

export function ProgressPanel({ progress, elapsed, duration }: ProgressPanelProps): VNode {
  const remaining = duration - elapsed();

  return Box(
    {
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: 'yellow',
      padding: 1,
    },
    Text({ color: 'yellow', bold: true }, ' Progress '),
    Divider({}),
    ProgressBar({
      value: Math.min(100, progress()),
      width: 18,
      showPercentage: true,
      color: 'cyan',
      style: 'block'
    }),
    Text({ color: 'gray', dim: true }, `${remaining}s remaining`)
  );
}

// =============================================================================
// System Panel (CPU & Memory)
// =============================================================================

interface SystemPanelProps {
  cpu: () => number;
  memory: () => MemoryInfo;
  cpuHistory: () => number[];
  memoryHistory: () => number[];
}

export function SystemPanel({ cpu, memory, cpuHistory, memoryHistory }: SystemPanelProps): VNode {
  const memInfo = memory();
  const memUsed = SystemMetrics.formatBytes(memInfo.used);
  const memTotal = SystemMetrics.formatBytes(memInfo.total);

  // Threshold config for resource usage (reusable)
  const resourceThresholds = {
    success: [0, 50] as [number, number],
    warning: [50, 80] as [number, number],
    error: [80, 100] as [number, number],
  };

  return Box(
    {
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: 'yellow',
      padding: 1,
    },
    Text({ color: 'yellow', bold: true }, ' System '),
    Divider({}),
    // CPU with MetricDisplay - sparkline + threshold coloring
    MetricDisplay({
      label: 'CPU',
      value: cpu,
      unit: '%',
      trend: () => cpuHistory().slice(-20),
      trendWidth: 10,
      size: 'compact',
      showDelta: false,
      thresholds: resourceThresholds,
    }),
    // Memory with MetricDisplay
    MetricDisplay({
      label: 'RAM',
      value: () => memInfo.percent,
      unit: '%',
      trend: () => memoryHistory().slice(-20),
      trendWidth: 10,
      size: 'compact',
      showDelta: false,
      thresholds: resourceThresholds,
    }),
    Text({ color: 'gray', dim: true }, `${memUsed}/${memTotal}`)
  );
}

// =============================================================================
// RPS Chart
// =============================================================================

interface RpsChartProps {
  rpsHistory: () => number[];
  currentRps: () => number;
}

export function RpsChart({ rpsHistory, currentRps }: RpsChartProps): VNode {
  const history = rpsHistory();
  const max = Math.max(...history, 1);
  const avg = history.reduce((a, b) => a + b, 0) / history.length;

  return Box(
    {
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: 'green',
      padding: 1,
      flexGrow: 1,
    },
    Box({ flexDirection: 'row', justifyContent: 'space-between' },
      Text({ color: 'green', bold: true }, ' RPS History '),
      Text({ color: 'gray', dim: true }, `Max: ${max.toFixed(0)}  Avg: ${avg.toFixed(0)}`)
    ),
    Sparkline({
      data: history,
      width: 50,
      color: 'green'
    }),
    Box({ flexDirection: 'row', justifyContent: 'flex-end' },
      Text({ color: 'green', bold: true }, `Current: ${currentRps().toFixed(0)} req/s`)
    )
  );
}

// =============================================================================
// Latency Chart
// =============================================================================

interface LatencyChartProps {
  latencyHistory: () => number[];
  p50: () => number;
  p95: () => number;
  p99: () => number;
}

export function LatencyChart({ latencyHistory, p50, p95, p99 }: LatencyChartProps): VNode {
  const history = latencyHistory();

  return Box(
    {
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: 'magenta',
      padding: 1,
      flexGrow: 1,
    },
    Box({ flexDirection: 'row', justifyContent: 'space-between' },
      Text({ color: 'magenta', bold: true }, ' Latency P95 '),
      Text({ color: 'gray', dim: true }, `P50: ${p50().toFixed(0)}ms  P99: ${p99().toFixed(0)}ms`)
    ),
    Sparkline({
      data: history,
      width: 50,
      color: 'magenta'
    }),
    Box({ flexDirection: 'row', justifyContent: 'flex-end' },
      Text({ color: 'magenta', bold: true }, `Current: ${p95().toFixed(0)}ms`)
    )
  );
}

// =============================================================================
// Status Codes Chart
// =============================================================================

interface StatusCodesChartProps {
  statusCodes: () => Record<number, number>;
  totalRequests: () => number;
}

export function StatusCodesChart({ statusCodes, totalRequests }: StatusCodesChartProps): VNode {
  const codes = statusCodes();
  const total = totalRequests() || 1;

  // Convert to bar chart data
  const data = Object.entries(codes)
    .sort(([a], [b]) => Number(a) - Number(b))
    .slice(0, 6) // Max 6 bars
    .map(([code, count]) => {
      const c = Number(code);
      const color = c >= 500 ? 'red' : c >= 400 ? 'yellow' : 'green';
      const percent = ((count / total) * 100).toFixed(0);
      return {
        label: `${code} (${percent}%)`,
        value: count,
        color
      };
    });

  if (data.length === 0) {
    return Box(
      {
        flexDirection: 'column',
        borderStyle: 'round',
        borderColor: 'gray',
        padding: 1,
      },
      Text({ color: 'gray', bold: true }, ' Status Codes '),
      Text({ color: 'gray', dim: true }, 'No responses yet...')
    );
  }

  return Box(
    {
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: 'cyan',
      padding: 1,
    },
    Text({ color: 'cyan', bold: true }, ' Status Codes '),
    Divider({}),
    BarChart({
      data: data as any,
      orientation: 'horizontal',
      showValues: true,
    })
  );
}

// =============================================================================
// Errors Panel
// =============================================================================

interface ErrorsPanelProps {
  recentErrors: () => ErrorEntry[];
}

export function ErrorsPanel({ recentErrors }: ErrorsPanelProps): VNode {
  const errors = recentErrors();

  if (errors.length === 0) {
    return Box(
      {
        flexDirection: 'column',
        borderStyle: 'round',
        borderColor: 'gray',
        padding: 1,
      },
      Text({ color: 'gray', bold: true }, ' Errors '),
      Text({ color: 'green', dim: true }, 'No errors!')
    );
  }

  return Box(
    {
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: 'red',
      padding: 1,
    },
    Text({ color: 'red', bold: true }, ' Recent Errors '),
    Divider({}),
    ...errors.slice(-5).map(err => {
      const statusColor = err.status >= 500 ? 'red' : err.status >= 400 ? 'yellow' : 'red';
      const statusText = err.status > 0 ? String(err.status) : 'ERR';

      return Box({ flexDirection: 'row', gap: 1 },
        Text({ color: 'white' }, `${err.count}x`),
        Text({ color: statusColor as any, bold: true }, statusText),
        Text({ color: 'gray', dim: true }, err.message)
      );
    })
  );
}

// =============================================================================
// Main Dashboard Layout
// =============================================================================

export function LoadDashboardLayout(state: LoadTestState): VNode {
  return Box(
    {
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      padding: 0,
    },
    // Header
    LoadHeader({
      config: state.config,
      elapsed: state.elapsed,
      remaining: state.remaining,
      isRunning: state.isRunning,
    }),

    // Main content
    Box(
      {
        flexDirection: 'row',
        flexGrow: 1,
        gap: 1,
        padding: 1,
      },

      // Left column: Stats + Progress + System
      Box(
        {
          flexDirection: 'column',
          width: 24,
          gap: 1,
        },
        StatsPanel({
          activeUsers: state.activeUsers,
          rps: state.rps,
          latencyP95: state.latencyP95,
          totalRequests: state.totalRequests,
          failedRequests: state.failedRequests,
          bytesTransferred: state.bytesTransferred,
        }),
        ProgressPanel({
          progress: state.progress,
          elapsed: state.elapsed,
          duration: state.config.duration,
        }),
        SystemPanel({
          cpu: state.cpu,
          memory: state.memory,
          cpuHistory: state.cpuHistory,
          memoryHistory: state.memoryHistory,
        })
      ),

      // Right column: Charts + Errors
      Box(
        {
          flexDirection: 'column',
          flexGrow: 1,
          gap: 1,
        },
        RpsChart({
          rpsHistory: state.rpsHistory,
          currentRps: state.rps,
        }),
        LatencyChart({
          latencyHistory: state.latencyHistory,
          p50: state.latencyP50,
          p95: state.latencyP95,
          p99: state.latencyP99,
        }),
        Box(
          { flexDirection: 'row', gap: 1 },
          Box({ flexGrow: 1 },
            StatusCodesChart({
              statusCodes: state.statusCodes,
              totalRequests: state.totalRequests,
            })
          ),
          Box({ width: 35 },
            ErrorsPanel({
              recentErrors: state.recentErrors,
            })
          )
        )
      )
    )
  );
}

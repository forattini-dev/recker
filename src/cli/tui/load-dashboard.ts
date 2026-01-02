/**
 * Load Dashboard - Real-time load testing visualization
 *
 * Tuiuiu-based dashboard for monitoring load tests with reactive signals.
 */

import {
  render,
  useApp,
  useHotkeys,
  useState,
  setTheme,
  createTheme,
  darkTheme,
} from 'tuiuiu.js';
import type { VNode } from 'tuiuiu.js';
import colors from '../../utils/colors.js';
import { LoadConfig } from '../../bench/generator.js';
import { createLoadTestState, LoadTestState } from './hooks/useLoadTest.js';
import { LoadDashboardLayout } from './components/load-metrics.js';

// =============================================================================
// Theme
// =============================================================================

const loadTheme = createTheme(darkTheme, {
  name: 'load-test',
  palette: {
    ...darkTheme.palette,
    primary: {
      ...darkTheme.palette.primary,
      500: '#00FF00', // Green for RPS
      400: '#22FF22',
      600: '#00DD00',
    },
  },
  background: {
    ...darkTheme.background,
    base: '#000000',
  },
  accents: {
    ...darkTheme.accents,
    highlight: '#FF9900', // Orange
    positive: '#00FF00', // Green
    critical: '#FF0000', // Red
  },
});

// =============================================================================
// Dashboard App
// =============================================================================

interface LoadDashboardAppProps {
  state: LoadTestState;
}

function LoadDashboardApp({ state, onMount }: LoadDashboardAppProps & { onMount: () => void }): VNode {
  const { exit } = useApp();

  // Tick counter to force re-renders when state updates
  const [tick, setTick] = useState(0);
  const [initialized, setInitialized] = useState(false);

  // Initialize on first render - register callback and start test
  if (!initialized()) {
    setInitialized(true);

    // Register callback to trigger re-renders
    state.onUpdate(() => {
      setTick(t => t + 1);
    });

    // Defer start to next event loop iteration (after render initializes)
    setImmediate(() => {
      onMount();
    });
  }

  // Handle ESC to stop and exit
  useHotkeys('escape', () => {
    state.stop();
    exit();
  });

  // Handle Ctrl+C to stop and exit
  useHotkeys('ctrl+c', () => {
    state.stop();
    exit();
  });

  return LoadDashboardLayout(state);
}

// =============================================================================
// Final Report (after dashboard closes)
// =============================================================================

function renderFinalReport(state: LoadTestState, config: LoadConfig) {
  const stats = state.getStats();
  const summary = stats.getSummary();

  console.log(colors.bold(colors.green('\n✅ Load Test Complete')));

  console.log(colors.bold('Configuration:'));
  console.log(`  URL:      ${config.url}`);
  console.log(`  Mode:     ${config.mode}`);
  console.log(`  Users:    ${config.users}`);
  console.log(`  Duration: ${config.duration}s`);

  console.log('\n' + colors.bold('Traffic:'));
  console.log(`  Total Requests:  ${summary.total}`);
  console.log(`  Successful:      ${colors.green(String(summary.success))}`);
  console.log(`  Failed:          ${summary.failed > 0 ? colors.red(String(summary.failed)) : colors.gray('0')}`);
  console.log(`  Total Bytes:     ${(summary.bytes / 1024 / 1024).toFixed(2)} MB`);

  console.log('\n' + colors.bold('Latency (ms):'));
  console.log(`  Avg: ${summary.latency.avg.toFixed(2)}`);
  console.log(`  P50: ${summary.latency.p50.toFixed(0)}`);
  console.log(`  P95: ${summary.latency.p95.toFixed(0)}`);
  console.log(`  P99: ${summary.latency.p99.toFixed(0)}`);
  console.log(`  Max: ${summary.latency.max.toFixed(0)}`);

  if (Object.keys(summary.codes).length > 0) {
    console.log('\n' + colors.bold('Status Codes:'));
    const codeEntries = Object.entries(summary.codes)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([code, count]) => {
        const c = Number(code);
        const color = c >= 500 ? colors.red : c >= 400 ? colors.yellow : colors.green;
        return `${color(code)}: ${count}`;
      });
    console.log(`  ${codeEntries.join('  ')}`);
  }

  // Show errors compactly
  const allErrors = stats.getErrors();
  if (allErrors.length > 0) {
    console.log('\n' + colors.bold(colors.red('Errors:')));

    const httpErrors = allErrors.filter(e => e.status > 0);
    const netErrors = allErrors.filter(e => e.status === 0);

    if (httpErrors.length > 0) {
      const httpLine = httpErrors
        .slice(0, 5)
        .map(e => {
          const color = e.status >= 500 ? colors.red : colors.yellow;
          return `${e.count}x ${color(String(e.status))} ${colors.gray(e.message)}`;
        })
        .join(colors.gray(', '));
      console.log(`  ${httpLine}`);
      if (httpErrors.length > 5) {
        console.log(colors.gray(`  ... +${httpErrors.length - 5} more HTTP errors`));
      }
    }

    if (netErrors.length > 0) {
      const netLine = netErrors
        .slice(0, 5)
        .map(e => `${e.count}x ${colors.red('ERR')} ${colors.gray(e.message)}`)
        .join(colors.gray(', '));
      console.log(`  ${netLine}`);
      if (netErrors.length > 5) {
        console.log(colors.gray(`  ... +${netErrors.length - 5} more network errors`));
      }
    }
  }

  console.log('');
}

// =============================================================================
// Entry Point
// =============================================================================

export async function startLoadDashboard(config: LoadConfig): Promise<void> {
  // Set theme
  setTheme(loadTheme);

  // Create state
  const state = createLoadTestState(config);

  // Test promise will be set when onMount is called
  let testPromise: Promise<void> | null = null;

  // Render the dashboard - test starts after render initializes
  const { waitUntilExit } = render(
    () => LoadDashboardApp({
      state,
      onMount: () => {
        // Start test after render is ready
        testPromise = state.start();
      }
    })
  );

  // Wait for dashboard to close (ESC pressed)
  await waitUntilExit();

  // Ensure test is stopped
  state.stop();

  // Wait for any remaining test cleanup
  if (testPromise) {
    try {
      await testPromise;
    } catch {
      // Test was stopped, ignore
    }
  }

  // Show final report
  renderFinalReport(state, config);
}

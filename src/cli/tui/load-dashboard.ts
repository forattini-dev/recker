import colors from '../../utils/colors.js';
import { plot } from '../../utils/chart.js';
import readline from 'node:readline';
import { LoadGenerator, LoadConfig } from '../../bench/generator.js';
import { LoadStats, ErrorEntry } from '../../bench/stats.js';
import { sparkline, SparklineBuffer } from '../../utils/sparkline.js';
import { SystemMetrics } from '../../utils/system-metrics.js';

const ALTERNATE_SCREEN_ENTER = '\x1b[?1049h';
const ALTERNATE_SCREEN_EXIT = '\x1b[?1049l';
const SPARKLINE_WIDTH = 40;

export async function startLoadDashboard(config: LoadConfig) {
  // Enter Alternate Screen Buffer (saves current shell state)
  process.stdout.write(ALTERNATE_SCREEN_ENTER);
  
  // Setup Keypress for ESC/Ctrl+C
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume(); // Ensure stdin is flowing
  }

  const generator = new LoadGenerator(config);

  // System metrics collector
  const sysMetrics = new SystemMetrics();
  const cpuBuffer = new SparklineBuffer(SPARKLINE_WIDTH);
  const memBuffer = new SparklineBuffer(SPARKLINE_WIDTH);
  let currentCpu = 0;
  let currentMem = { percent: 0, used: 0, total: 0 };

  // Start collecting system metrics
  sysMetrics.onSnapshot((snap) => {
    cpuBuffer.push(snap.cpu);
    memBuffer.push(snap.memory);
    currentCpu = snap.cpu;
    currentMem = {
      percent: snap.memory,
      used: snap.memoryUsed,
      total: snap.memoryTotal
    };
  });
  sysMetrics.startPolling(1000);

  let abortReject: (reason?: any) => void;
  const abortPromise = new Promise((_, reject) => {
      abortReject = reject;
  });

  const onKeypress = (_str: string, key: { name: string, ctrl: boolean }) => {
      if (key && (key.name === 'escape' || (key.ctrl && key.name === 'c'))) {
          generator.stop();
          sysMetrics.stopPolling();
          if (abortReject) abortReject(new Error('User aborted'));
      }
  };
  process.stdin.on('keypress', onKeypress);

  // Data history for charts (keep last 60 seconds or so)
  const rpsHistory: number[] = new Array(60).fill(0);
  const latencyHistory: number[] = new Array(60).fill(0);
  const usersHistory: number[] = new Array(60).fill(0);

  // Start generation in background
  const runPromise = generator.start();
  const startTime = Date.now();

  // Update Loop
  const interval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = Math.max(0, config.duration - elapsed);

    if (remaining <= 0) {
        clearInterval(interval);
        return;
    }

    const snapshot = generator.stats.getSnapshot();

    // Update history
    rpsHistory.shift();
    rpsHistory.push(snapshot.rps);

    latencyHistory.shift();
    latencyHistory.push(snapshot.p95);

    usersHistory.shift();
    usersHistory.push(snapshot.activeUsers);

    render(
      config, elapsed, remaining, snapshot,
      rpsHistory, latencyHistory, usersHistory,
      generator.stats,
      cpuBuffer, memBuffer, currentCpu, currentMem
    );

  }, 1000);

  try {
      await Promise.race([runPromise, abortPromise]);
  } catch (e: any) {
      if (e.message !== 'User aborted') throw e;
  } finally {
      clearInterval(interval);
      sysMetrics.stopPolling();
      process.stdin.off('keypress', onKeypress);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);

      // Exit Alternate Screen Buffer (restores shell state)
      process.stdout.write(ALTERNATE_SCREEN_EXIT);
  }

  // Render final report on the main screen (shell history)
  renderFinalReport(generator.stats, config);
}

function render(
    config: LoadConfig,
    elapsed: number,
    remaining: number,
    snapshot: { rps: number, p95: number, activeUsers: number },
    rpsHistory: number[],
    latencyHistory: number[],
    usersHistory: number[],
    stats: LoadStats,
    cpuBuffer: SparklineBuffer,
    memBuffer: SparklineBuffer,
    currentCpu: number,
    currentMem: { percent: number, used: number, total: number }
) {
    // Clear screen (in alternate buffer, 0,0 is top left)
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);

    console.log(colors.bold(colors.cyan('🔥 Rek Load Generator')));
    console.log(colors.gray(`Target: ${config.url}`));
    console.log(colors.gray(`Mode: ${config.mode.toUpperCase()} ${config.http2 ? '(HTTP/2)' : ''}`));
    console.log(colors.gray('Press ESC to stop'));
    console.log('');

    // Status Bar
    console.log(
        `${colors.white('Time:')} ${colors.green(elapsed + 's')} ` +
        `${colors.gray('/')} ${config.duration}s ` +
        `${colors.gray('(')}${colors.yellow(remaining + 's left')}${colors.gray(')')}   ` +
        `${colors.white('Reqs:')} ${colors.bold(String(stats.totalRequests))}`
    );

    // Metrics Row
    console.log(
        `${colors.blue('Users:')} ${colors.bold(String(snapshot.activeUsers))}   ` +
        `${colors.green('RPS:')} ${colors.bold(snapshot.rps.toFixed(0))}   ` +
        `${colors.magenta('Latency (P95):')} ${colors.bold(snapshot.p95.toFixed(0) + 'ms')}   ` +
        `${colors.white('Errors:')} ${stats.failed > 0 ? colors.red(String(stats.failed)) : colors.green('0')}`
    );

    console.log(colors.gray('──────────────────────────────────────────────────'));

    // 1. Active Users Chart
    console.log(colors.bold(colors.blue('👥 Active Users')));
    console.log(colors.blue(plot(usersHistory, { height: 4 })));
    console.log('');

    // 2. RPS Chart
    console.log(colors.bold(colors.green('⚡ Requests per Second')));
    console.log(colors.green(plot(rpsHistory, { height: 6 })));
    console.log('');

    // 3. Latency Chart
    console.log(colors.bold(colors.magenta('⏱️  Latency P95 (ms)')));
    console.log(colors.magenta(plot(latencyHistory, { height: 4 })));
    console.log('');

    // 4. System Resources (CPU & Memory sparklines)
    console.log(colors.bold(colors.yellow('💻 System Resources')));
    const cpuSparkline = cpuBuffer.render({ min: 0, max: 100 });
    const memSparkline = memBuffer.render({ min: 0, max: 100 });
    const memUsed = SystemMetrics.formatBytes(currentMem.used);
    const memTotal = SystemMetrics.formatBytes(currentMem.total);
    console.log(
        `  ${colors.yellow('CPU')} ${colors.gray(cpuSparkline)} ${colors.bold(currentCpu.toFixed(0) + '%')}`
    );
    console.log(
        `  ${colors.yellow('RAM')} ${colors.gray(memSparkline)} ${colors.bold(currentMem.percent.toFixed(0) + '%')} ${colors.gray(`(${memUsed}/${memTotal})`)}`
    );

    // 5. Real-time Error List (if any errors)
    const recentErrors = stats.getRecentErrors();
    if (recentErrors.length > 0) {
        console.log('');
        console.log(colors.bold(colors.red('⚠️  Recent Errors')));
        renderErrorList(recentErrors, 5);
    }
}

/**
 * Format error entry compactly: "123x 429 TooManyRequests"
 */
function formatErrorEntry(entry: ErrorEntry): string {
    const count = colors.white(`${entry.count}x`);

    if (entry.status === 0) {
        // Network error (no status code) - show as red tag
        return `  ${count} ${colors.red('ERR')} ${colors.gray(entry.message)}`;
    }

    // HTTP error: "123x 429 TooManyRequests"
    const statusColor = entry.status >= 500 ? colors.red : colors.yellow;
    return `  ${count} ${statusColor(String(entry.status))} ${colors.gray(entry.message)}`;
}

/**
 * Format status code as colored badge
 */
function formatStatusBadge(status: number): string {
    const code = String(status);
    if (status >= 500) return colors.bgRed(colors.white(` ${code} `));
    if (status >= 400) return colors.bgYellow(colors.black(` ${code} `));
    if (status >= 300) return colors.bgCyan(colors.black(` ${code} `));
    return colors.bgGreen(colors.black(` ${code} `));
}

/**
 * Render a list of errors
 */
function renderErrorList(errors: ErrorEntry[], maxItems: number = 10) {
    const toShow = errors.slice(-maxItems);
    for (const entry of toShow) {
        console.log(formatErrorEntry(entry));
    }
    if (errors.length > maxItems) {
        console.log(colors.gray(`  ... and ${errors.length - maxItems} more`));
    }
}

function renderFinalReport(stats: LoadStats, config: LoadConfig) {
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
        // Compact format: "200: 1234  404: 56  500: 12"
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

        // Group by type for cleaner output
        const httpErrors = allErrors.filter(e => e.status > 0);
        const netErrors = allErrors.filter(e => e.status === 0);

        // Show HTTP errors inline: "123x 429 TooManyRequests, 45x 503 ServiceUnavailable"
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

        // Show network errors
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

    console.log(''); // Final newline
}

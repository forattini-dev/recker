import pc from '../../utils/colors.js';
import { plot } from '../../utils/chart.js';
import readline from 'node:readline';
import { LoadGenerator, LoadConfig } from '../../bench/generator.js';
import { LoadStats, ErrorEntry } from '../../bench/stats.js';

const ALTERNATE_SCREEN_ENTER = '\x1b[?1049h';
const ALTERNATE_SCREEN_EXIT = '\x1b[?1049l';

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
  
  let abortReject: (reason?: any) => void;
  const abortPromise = new Promise((_, reject) => {
      abortReject = reject;
  });

  const onKeypress = (_str: string, key: { name: string, ctrl: boolean }) => {
      if (key && (key.name === 'escape' || (key.ctrl && key.name === 'c'))) {
          generator.stop();
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

    render(config, elapsed, remaining, snapshot, rpsHistory, latencyHistory, usersHistory, generator.stats);

  }, 1000);

  try {
      await Promise.race([runPromise, abortPromise]);
  } catch (e: any) {
      if (e.message !== 'User aborted') throw e;
  } finally {
      clearInterval(interval);
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
    stats: LoadStats
) {
    // Clear screen (in alternate buffer, 0,0 is top left)
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);

    console.log(pc.bold(pc.cyan('🔥 Rek Load Generator')));
    console.log(pc.gray(`Target: ${config.url}`));
    console.log(pc.gray(`Mode: ${config.mode.toUpperCase()} ${config.http2 ? '(HTTP/2)' : ''}`));
    console.log(pc.gray('Press ESC to stop'));
    console.log('');

    // Status Bar
    console.log(
        `${pc.white('Time:')} ${pc.green(elapsed + 's')} ` +
        `${pc.gray('/')} ${config.duration}s ` +
        `${pc.gray('(')}${pc.yellow(remaining + 's left')}${pc.gray(')')}   ` +
        `${pc.white('Reqs:')} ${pc.bold(String(stats.totalRequests))}`
    );

    // Metrics Row
    console.log(
        `${pc.blue('Users:')} ${pc.bold(String(snapshot.activeUsers))}   ` +
        `${pc.green('RPS:')} ${pc.bold(snapshot.rps.toFixed(0))}   ` +
        `${pc.magenta('Latency (P95):')} ${pc.bold(snapshot.p95.toFixed(0) + 'ms')}   ` +
        `${pc.white('Errors:')} ${stats.failed > 0 ? pc.red(String(stats.failed)) : pc.green('0')}`
    );

    console.log(pc.gray('──────────────────────────────────────────────────'));

    // 1. Active Users Chart
    console.log(pc.bold(pc.blue('👥 Active Users')));
    console.log(pc.blue(plot(usersHistory, { height: 4 })));
    console.log('');

    // 2. RPS Chart
    console.log(pc.bold(pc.green('⚡ Requests per Second')));
    console.log(pc.green(plot(rpsHistory, { height: 6 })));
    console.log('');

    // 3. Latency Chart
    console.log(pc.bold(pc.magenta('⏱️  Latency P95 (ms)')));
    console.log(pc.magenta(plot(latencyHistory, { height: 4 })));

    // 4. Real-time Error List (if any errors)
    const recentErrors = stats.getRecentErrors();
    if (recentErrors.length > 0) {
        console.log('');
        console.log(pc.bold(pc.red('⚠️  Recent Errors')));
        renderErrorList(recentErrors, 5);
    }
}

/**
 * Format error entry with status code badge
 */
function formatErrorEntry(entry: ErrorEntry): string {
    const count = pc.gray(`${entry.count}x`);

    if (entry.status === 0) {
        // Network error (no status code)
        return `  ${count} ${pc.red('NET')} ${entry.message}`;
    }

    // HTTP error with status code
    const statusBadge = formatStatusBadge(entry.status);
    return `  ${count} ${statusBadge} ${entry.message}`;
}

/**
 * Format status code as colored badge
 */
function formatStatusBadge(status: number): string {
    const code = String(status);
    if (status >= 500) return pc.bgRed(pc.white(` ${code} `));
    if (status >= 400) return pc.bgYellow(pc.black(` ${code} `));
    if (status >= 300) return pc.bgCyan(pc.black(` ${code} `));
    return pc.bgGreen(pc.black(` ${code} `));
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
        console.log(pc.gray(`  ... and ${errors.length - maxItems} more`));
    }
}

function renderFinalReport(stats: LoadStats, config: LoadConfig) {
    const summary = stats.getSummary();

    console.log(pc.bold(pc.green('\n✅ Load Test Complete')));

    console.log(pc.bold('Configuration:'));
    console.log(`  URL:      ${config.url}`);
    console.log(`  Mode:     ${config.mode}`);
    console.log(`  Users:    ${config.users}`);
    console.log(`  Duration: ${config.duration}s`);

    console.log('\n' + pc.bold('Traffic:'));
    console.log(`  Total Requests:  ${summary.total}`);
    console.log(`  Successful:      ${pc.green(String(summary.success))}`);
    console.log(`  Failed:          ${summary.failed > 0 ? pc.red(String(summary.failed)) : pc.gray('0')}`);
    console.log(`  Total Bytes:     ${(summary.bytes / 1024 / 1024).toFixed(2)} MB`);

    console.log('\n' + pc.bold('Latency (ms):'));
    console.log(`  Avg: ${summary.latency.avg.toFixed(2)}`);
    console.log(`  P50: ${summary.latency.p50.toFixed(0)}`);
    console.log(`  P95: ${summary.latency.p95.toFixed(0)}`);
    console.log(`  P99: ${summary.latency.p99.toFixed(0)}`);
    console.log(`  Max: ${summary.latency.max.toFixed(0)}`);

    if (Object.keys(summary.codes).length > 0) {
        console.log('\n' + pc.bold('Status Codes:'));
        Object.entries(summary.codes)
            .sort(([a], [b]) => Number(a) - Number(b))
            .forEach(([code, count]) => {
                const badge = formatStatusBadge(Number(code));
                console.log(`  ${badge} ${count}`);
            });
    }

    // Show errors with status codes
    const allErrors = stats.getErrors();
    if (allErrors.length > 0) {
        console.log('\n' + pc.bold(pc.red('Errors:')));
        renderErrorList(allErrors, 15);

        // Summary of error types
        const networkErrors = allErrors.filter(e => e.status === 0);
        const httpErrors = allErrors.filter(e => e.status > 0);

        if (networkErrors.length > 0 || httpErrors.length > 0) {
            console.log('');
            console.log(pc.gray('  Summary:'));
            if (networkErrors.length > 0) {
                const total = networkErrors.reduce((sum, e) => sum + e.count, 0);
                console.log(pc.gray(`    Network errors: ${total} (${networkErrors.length} types)`));
            }
            if (httpErrors.length > 0) {
                const total = httpErrors.reduce((sum, e) => sum + e.count, 0);
                console.log(pc.gray(`    HTTP errors: ${total} (${httpErrors.length} types)`));
            }
        }
    }

    console.log(''); // Final newline
}

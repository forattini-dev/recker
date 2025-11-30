import pc from 'picocolors';
import asciichart from 'asciichart';
import readline from 'node:readline';
import { LoadGenerator, LoadConfig } from '../../bench/generator.js';

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
    stats: any
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
        `${pc.white('Reqs:')} ${pc.bold(stats.totalRequests)}`
    );
    
    // Metrics Row
    console.log(
        `${pc.blue('Users:')} ${pc.bold(snapshot.activeUsers)}   ` + 
        `${pc.green('RPS:')} ${pc.bold(snapshot.rps.toFixed(0))}   ` + 
        `${pc.magenta('Latency (P95):')} ${pc.bold(snapshot.p95.toFixed(0) + 'ms')}   ` + 
        `${pc.white('Errors:')} ${stats.failed > 0 ? pc.red(stats.failed) : pc.green('0')}`
    );

    console.log(pc.gray('──────────────────────────────────────────────────'));

    // 1. Active Users Chart
    console.log(pc.bold(pc.blue('👥 Active Users')));
    console.log(pc.blue(asciichart.plot(usersHistory, { height: 4 })));
    console.log('');

    // 2. RPS Chart
    console.log(pc.bold(pc.green('⚡ Requests per Second')));
    console.log(pc.green(asciichart.plot(rpsHistory, { height: 6 })));
    console.log('');

    // 3. Latency Chart
    console.log(pc.bold(pc.magenta('⏱️  Latency P95 (ms)')));
    console.log(pc.magenta(asciichart.plot(latencyHistory, { height: 4 })));
}

function renderFinalReport(stats: any, config: LoadConfig) {
    const summary = stats.getSummary();
    
    console.log(pc.bold(pc.green('\n✅ Load Test Complete')));
    
    console.log(pc.bold('Configuration:'));
    console.log(`  URL:      ${config.url}`);
    console.log(`  Mode:     ${config.mode}`);
    console.log(`  Users:    ${config.users}`);
    console.log(`  Duration: ${config.duration}s`);

    console.log('\n' + pc.bold('Traffic:'));
    console.log(`  Total Requests:  ${summary.total}`);
    console.log(`  Successful:      ${pc.green(summary.success)}`);
    console.log(`  Failed:          ${summary.failed > 0 ? pc.red(summary.failed) : pc.gray(0)}`);
    console.log(`  Total Bytes:     ${(summary.bytes / 1024 / 1024).toFixed(2)} MB`);
    
    console.log('\n' + pc.bold('Latency (ms):'));
    console.log(`  Avg: ${summary.latency.avg.toFixed(2)}`);
    console.log(`  P50: ${summary.latency.p50.toFixed(0)}`);
    console.log(`  P95: ${summary.latency.p95.toFixed(0)}`);
    console.log(`  P99: ${summary.latency.p99.toFixed(0)}`);
    console.log(`  Max: ${summary.latency.max.toFixed(0)}`);

    if (Object.keys(summary.codes).length > 0) {
        console.log('\n' + pc.bold('Status Codes:'));
        Object.entries(summary.codes).forEach(([code, count]) => {
            const color = code.startsWith('2') ? pc.green : code.startsWith('5') ? pc.red : pc.yellow;
            console.log(`  ${color(code)}: ${count}`);
        });
    }
    console.log(''); // Final newline
}

/**
 * Testing Commands
 *
 * Commands for load testing and traffic recording:
 * - load: Load/stress testing
 * - har: HAR recording and playback
 */

import type { CommandContext, CommandResult } from './types.js';

// =============================================================================
// Load Command
// =============================================================================

export async function cmdLoad(ctx: CommandContext, args: string[]): Promise<CommandResult> {
  let url = args[0];

  // Use base URL if not provided
  if (!url) {
    const base = ctx.baseUrl();
    if (base) {
      url = base;
    }
  }

  if (!url) {
    ctx.addHistoryItem({
      type: 'info',
      content: `Load Testing (Stress Test)

Usage: load <url> [options]

Options:
  -u, --users <n>     Concurrent users (default: 50)
  -d, --duration <s>  Test duration in seconds (default: 60)
  -r, --ramp <s>      Ramp-up time in seconds (default: 5)
  -m, --mode <type>   Test mode: throughput, stress, realistic
  -k, --insecure      Allow self-signed SSL certificates

Examples:
  load httpbin.org/get
  load api.example.com -u 100 -d 120
  load api.example.com --mode stress
  load api.example.com -k             (allow self-signed certs)

Note: Press ESC to stop the test.`,
    });
    return { success: true };
  }

  if (!url.startsWith('http')) {
    url = `https://${url}`;
  }

  // Parse options from args
  const options = {
    users: 50,
    duration: 60,
    mode: 'throughput' as 'throughput' | 'stress' | 'realistic',
    http2: false,
    insecure: false,
    rampUp: 5,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '-u' || arg === '--users') && args[i + 1]) {
      options.users = parseInt(args[++i], 10);
    } else if ((arg === '-d' || arg === '--duration') && args[i + 1]) {
      options.duration = parseInt(args[++i], 10);
    } else if ((arg === '-r' || arg === '--ramp') && args[i + 1]) {
      options.rampUp = parseInt(args[++i], 10);
    } else if ((arg === '-m' || arg === '--mode') && args[i + 1]) {
      options.mode = args[++i] as any;
    } else if (arg === '--http2') {
      options.http2 = true;
    } else if (arg === '-k' || arg === '--insecure') {
      options.insecure = true;
    }
  }

  ctx.addHistoryItem({ type: 'info', content: `Starting load test: ${options.users} users, ${options.duration}s, mode: ${options.mode}` });

  try {
    const { startLoadDashboard } = await import('../load-dashboard.js');

    await startLoadDashboard({
      url,
      users: options.users,
      duration: options.duration,
      mode: options.mode,
      http2: options.http2,
      insecure: options.insecure,
      rampUp: options.rampUp,
    });

    ctx.addHistoryItem({ type: 'info', content: 'Load test completed. Check the report above.' });
    return { success: true };
  } catch (err: any) {
    if (err.message !== 'User aborted') {
      ctx.addHistoryItem({ type: 'error', content: `Load test failed: ${err.message}` });
    }
    return { success: false, error: err.message };
  }
}

// =============================================================================
// HAR Command
// =============================================================================

export async function cmdHar(ctx: CommandContext, args: string[]): Promise<CommandResult> {
  ctx.addHistoryItem({
    type: 'info',
    content: `HAR (HTTP Archive) Recording

Commands:
  har record <file>   Start recording to HAR file
  har play <file>     Replay requests from HAR file
  har info <file>     Show HAR file info

Note: Full HAR recording available in 'rek shell:legacy'`,
  });
  return { success: true };
}

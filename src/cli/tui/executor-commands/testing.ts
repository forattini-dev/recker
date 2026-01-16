/**
 * Testing Commands
 *
 * Commands for load testing (runs as background job in TUI).
 * NOTE: HAR command has been migrated to the unified CLI system.
 */

import type { CommandContext, CommandResult } from './types.js';
import { parseArgValueFlag } from './parser.js';
import {
  addHistoryItem,
  setPendingTabSwitch,
} from '../hooks/useShellState.js';
import {
  registerLoadTest,
  startJob,
  failJob,
  updateJobStatus,
  getJobManager,
} from '../hooks/useJobs.js';

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

Note: View progress in Jobs tab (F2). Stop with job stop <id>.`,
    });
    return { success: true };
  }

  if (!url.startsWith('http')) {
    url = `https://${url}`;
  }

  // Parse options
  const users = Number(parseArgValueFlag(args, ['-u', '--users'], 50)) || 50;
  const duration = Number(parseArgValueFlag(args, ['-d', '--duration'], 60)) || 60;
  const mode = parseArgValueFlag(args, ['-m', '--mode'], 'throughput');
  const http2 = args.includes('--http2');
  const rampUp = Number(parseArgValueFlag(args, ['-r', '--ramp', '--ramp-up'], 5)) || 5;
  const insecure = args.includes('-k') || args.includes('--insecure');

  // Register as background job
  const controller = new AbortController();
  const job = registerLoadTest(url, () => controller.abort());

  const manager = getJobManager();
  const fullCommand = `load ${args.join(' ')}`;
  manager.setCommand(job.id, fullCommand);
  manager.setMetadata(job.id, { users, duration, mode });

  startJob(job.id);
  manager.addLog(job.id, {
    timestamp: Date.now(),
    level: 'info',
    message: `Starting load test: ${url} (${users} users, ${duration}s, ${mode})`,
  });

  // Run async
  runLoadTestAsync(job.id, url, { users, duration, mode, http2, rampUp, insecure }, controller.signal);

  addHistoryItem({
    type: 'info',
    content: `[job:${job.id}] Load test started: ${url} (${users} users, ${duration}s)`,
  });

  // Auto-switch to Jobs tab
  setPendingTabSwitch('jobs');

  return { success: true, output: { jobId: job.id } };
}

async function runLoadTestAsync(
  jobId: number,
  url: string,
  options: {
    users: number;
    duration: number;
    mode: string;
    http2: boolean;
    rampUp: number;
    insecure: boolean;
  },
  signal: AbortSignal
): Promise<void> {
  const manager = getJobManager();

  try {
    const { LoadTestRunner } = await import('../../commands/loadtest-runner.js');
    const { attachTUIHandler } = await import('../../events/handlers/tui.js');

    const runner = new LoadTestRunner();
    attachTUIHandler(runner, { jobId, signal });

    await runner.run({
      url,
      signal,
      users: options.users,
      duration: options.duration,
      mode: options.mode as 'throughput' | 'stress' | 'realistic',
      http2: options.http2,
      rampUp: options.rampUp,
      insecure: options.insecure,
    });

    manager.addLog(jobId, {
      timestamp: Date.now(),
      level: 'info',
      message: 'Load test completed',
    });
    updateJobStatus(jobId, 'completed');
  } catch (err: any) {
    if (signal.aborted || err.message === 'Aborted') {
      manager.addLog(jobId, {
        timestamp: Date.now(),
        level: 'info',
        message: 'Load test stopped by user',
      });
      updateJobStatus(jobId, 'stopped');
    } else {
      failJob(jobId, err instanceof Error ? err : new Error(err.message));
    }
  }
}


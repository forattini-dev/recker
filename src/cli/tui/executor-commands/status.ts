/**
 * Status and Jobs Commands
 *
 * Commands for viewing shell status and managing background jobs.
 */

import type { CommandResult } from './types.js';
import type { Job } from '../job-manager.js';
import {
  addHistoryItem,
  baseUrl,
  variables,
  history,
} from '../hooks/useShellState.js';
import {
  jobs,
  stopJob,
  stopAllJobs,
  pruneJobs,
  getJobLogs,
} from '../hooks/useJobs.js';

// =============================================================================
// Status Command
// =============================================================================

export function cmdStatus(): CommandResult {
  const base = baseUrl();
  const vars = variables();

  addHistoryItem({
    type: 'response',
    content: {
      baseUrl: base || '(not set)',
      variables: Object.keys(vars).length,
      historyItems: history().length,
    },
  });

  return { success: true };
}

// =============================================================================
// Jobs Command
// =============================================================================

export function cmdJobs(args: string[]): CommandResult {
  const subCmd = args[0]?.toLowerCase();

  // Help
  if (!subCmd || subCmd === 'help') {
    addHistoryItem({
      type: 'info',
      content: `Background Jobs Management

Commands:
  jobs              - List all jobs
  jobs stop <id>    - Stop a job by ID
  jobs stop all     - Stop all running jobs
  jobs logs <id>    - Show logs for a job
  jobs prune        - Remove completed/failed jobs

Background Execution:
  Add '&' to run commands in background:
  spider example.com &
  live download @twitch/user &
  serve http &
  load example.com -u 100 &

Supported Commands:
  spider, crawl, seo, live, hls, load, bench, serve`,
    });
    return { success: true };
  }

  // List jobs
  if (subCmd === 'list' || !['stop', 'logs', 'prune', 'kill'].includes(subCmd)) {
    const allJobs = jobs();

    if (allJobs.length === 0) {
      addHistoryItem({
        type: 'info',
        content: 'No jobs running. Use "command &" to run in background.',
      });
      return { success: true };
    }

    const statusEmoji: Record<string, string> = {
      running: '▶️',
      watching: '👁',
      crawling: '🕷',
      serving: '🌐',
      loading: '⚡',
      analyzing: '🔍',
      completed: '✅',
      failed: '❌',
      stopped: '⏹',
      pending: '⏳',
    };

    const jobLines = allJobs.map((j) => {
      const emoji = statusEmoji[j.status] || '❓';
      const duration = Math.round((Date.now() - j.startedAt.getTime()) / 1000);
      const progress = formatJobProgress(j);
      return `#${j.id} ${emoji} ${j.status.padEnd(10)} ${j.target.slice(0, 20).padEnd(20)} ${progress} (${duration}s)`;
    });

    addHistoryItem({
      type: 'response',
      content: {
        jobs: allJobs.map((j) => ({
          id: j.id,
          type: j.type,
          status: j.status,
          target: j.target,
          progress: j.progress,
        })),
        formatted: jobLines.join('\n'),
      },
    });

    return { success: true };
  }

  // Stop job
  if (subCmd === 'stop' || subCmd === 'kill') {
    const target = args[1]?.toLowerCase();

    if (target === 'all') {
      const stopped = stopAllJobs();
      addHistoryItem({
        type: 'info',
        content: stopped > 0 ? `Stopped ${stopped} job(s)` : 'No jobs to stop',
      });
      return { success: true };
    }

    const jobId = parseInt(args[1], 10);
    if (isNaN(jobId)) {
      addHistoryItem({
        type: 'error',
        content: 'Usage: jobs stop <id> | jobs stop all',
      });
      return { success: false };
    }

    if (stopJob(jobId)) {
      addHistoryItem({ type: 'info', content: `Job #${jobId} stopped` });
      return { success: true };
    } else {
      addHistoryItem({
        type: 'error',
        content: `Job #${jobId} not found or already stopped`,
      });
      return { success: false };
    }
  }

  // Show logs
  if (subCmd === 'logs') {
    const jobId = parseInt(args[1], 10);
    if (isNaN(jobId)) {
      addHistoryItem({ type: 'error', content: 'Usage: jobs logs <id>' });
      return { success: false };
    }

    const limit = parseInt(args[2], 10) || 20;
    const logs = getJobLogs(jobId, limit);

    if (logs.length === 0) {
      addHistoryItem({ type: 'info', content: `No logs for job #${jobId}` });
      return { success: true };
    }

    const logLines = logs.map((log) => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const levelIcon =
        log.level === 'error' ? '❌' : log.level === 'warn' ? '⚠️' : 'ℹ️';
      return `[${time}] ${levelIcon} ${log.message}`;
    });

    addHistoryItem({
      type: 'response',
      content: { jobId, logs: logLines.join('\n') },
    });

    return { success: true };
  }

  // Prune completed jobs
  if (subCmd === 'prune') {
    const pruned = pruneJobs();
    addHistoryItem({
      type: 'info',
      content:
        pruned > 0 ? `Removed ${pruned} completed/failed job(s)` : 'No jobs to prune',
    });
    return { success: true };
  }

  addHistoryItem({ type: 'error', content: `Unknown jobs command: ${subCmd}` });
  return { success: false };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format job progress for display
 */
export function formatJobProgress(job: Job): string {
  const p = job.progress;
  switch (job.type) {
    case 'download':
    case 'hls':
    case 'video':
      return p.bytes > 0
        ? `${Math.round(p.bytes / 1024 / 1024)}MB`
        : `${p.segments} seg`;
    case 'spider':
      return p.pages ? `${p.pages} pages` : '0 pages';
    case 'seo':
      return p.score ? `Score: ${p.score}` : 'analyzing...';
    case 'loadtest':
      return p.requests ? `${p.requests} req` : '0 req';
    case 'server':
      return p.connections ? `${p.connections} conn` : 'listening';
    case 'watch':
      return 'monitoring';
    default:
      return '';
  }
}

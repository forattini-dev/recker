/**
 * LoadTest Runner - Event-Driven Load Testing
 *
 * Wraps the LoadGenerator and emits events for CLI/TUI handlers.
 * This separates the load testing logic from output presentation.
 *
 * @example
 * ```typescript
 * const runner = new LoadTestRunner();
 *
 * // CLI mode
 * attachCLIHandler(runner, { verbose: true });
 *
 * // TUI mode (background job)
 * attachTUIHandler(runner, { jobId: 123 });
 *
 * await runner.run('https://example.com', { users: 50, duration: 60 });
 * ```
 */

import { CommandEmitter } from '../events/emitter.js';
import { LoadGenerator, LoadConfig, LoadMode } from '../../bench/generator.js';
import { LoadStats, ErrorEntry } from '../../bench/stats.js';
import { AbortError } from '../../core/errors.js';

// =============================================================================
// Types
// =============================================================================

export interface LoadTestRunnerOptions {
  /** Target URL */
  url: string;
  /** Number of concurrent virtual users */
  users?: number;
  /** Test duration in seconds */
  duration?: number;
  /** Load mode: throughput, stress, or realistic */
  mode?: LoadMode;
  /** Enable HTTP/2 */
  http2?: boolean;
  /** Ramp-up time in seconds */
  rampUp?: number;
  /** Allow self-signed certificates */
  insecure?: boolean;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export interface LoadTestRunnerResult {
  url: string;
  duration: number;
  users: number;
  mode: LoadMode;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  bytesTransferred: number;
  rps: number;
  latency: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
  };
  statusCodes: Record<number, number>;
  errors: ErrorEntry[];
}

export interface LoadTestSnapshot {
  elapsed: number;
  remaining: number;
  progress: number;
  rps: number;
  p95: number;
  activeUsers: number;
  totalRequests: number;
  successful: number;
  failed: number;
  bytesTransferred: number;
}

// =============================================================================
// LoadTest Runner
// =============================================================================

export class LoadTestRunner extends CommandEmitter {
  private generator: LoadGenerator | null = null;
  private updateInterval: NodeJS.Timeout | null = null;
  private aborted: boolean = false;

  constructor() {
    super('loadtest');
  }

  /**
   * Run load test with event emission
   */
  async run(options: LoadTestRunnerOptions): Promise<LoadTestRunnerResult> {
    const {
      url,
      users = 10,
      duration = 30,
      mode = 'throughput',
      http2 = false,
      rampUp = 0,
      insecure = false,
      signal,
    } = options;

    // Normalize URL
    let targetUrl = url;
    if (!targetUrl.startsWith('http')) {
      targetUrl = `https://${targetUrl}`;
    }

    // Build config
    const config: LoadConfig = {
      url: targetUrl,
      users,
      duration,
      mode,
      http2,
      rampUp,
      insecure,
    };

    // Emit start event
    this.emitStart(targetUrl, {
      action: 'loadtest',
      users,
      duration,
      mode,
      http2,
      rampUp,
    });

    this.startTime = Date.now();
    this.aborted = false;

    try {
      // Check for abort
      if (signal?.aborted) {
        throw new AbortError('Load test aborted');
      }

      // Set up abort handler
      const abortHandler = () => {
        this.aborted = true;
        this.stop();
      };
      signal?.addEventListener('abort', abortHandler);

      // Emit progress: initializing
      this.emitProgress({
        current: 0,
        total: duration,
        currentItem: `Initializing load test: ${users} users, ${mode} mode`,
        percent: 0,
      });

      // Create generator
      this.generator = new LoadGenerator(config);

      // Start periodic stats updates
      this.startStatsPolling(config);

      // Run load test (this returns when complete or stopped)
      await this.generator.start();

      // Clean up abort handler
      signal?.removeEventListener('abort', abortHandler);

      // Stop stats polling
      this.stopStatsPolling();

      // Get final stats
      const summary = this.generator.stats.getSummary();
      const actualDuration = Math.round((Date.now() - this.startTime) / 1000);

      const result: LoadTestRunnerResult = {
        url: targetUrl,
        duration: actualDuration,
        users,
        mode,
        totalRequests: summary.total,
        successfulRequests: summary.success,
        failedRequests: summary.failed,
        bytesTransferred: summary.bytes,
        rps: Math.round(summary.total / actualDuration),
        latency: {
          avg: Math.round(summary.latency.avg),
          p50: Math.round(summary.latency.p50),
          p95: Math.round(summary.latency.p95),
          p99: Math.round(summary.latency.p99),
          max: Math.round(summary.latency.max),
        },
        statusCodes: summary.codes,
        errors: this.generator.stats.getErrors(),
      };

      // Emit completion
      this.emitComplete({
        url: targetUrl,
        duration: actualDuration,
        totalRequests: result.totalRequests,
        rps: result.rps,
        p95: result.latency.p95,
        successRate: result.totalRequests > 0
          ? Math.round((result.successfulRequests / result.totalRequests) * 100)
          : 0,
      });

      return result;

    } catch (err: any) {
      this.stopStatsPolling();

      if (signal?.aborted || this.aborted || err instanceof AbortError) {
        this.emitError('Load test stopped by user', { code: 'ABORT' });

        // Return partial result on abort
        const stats = this.generator?.stats;
        const actualDuration = Math.round((Date.now() - this.startTime) / 1000);

        return {
          url: targetUrl,
          duration: actualDuration,
          users,
          mode,
          totalRequests: stats?.totalRequests ?? 0,
          successfulRequests: stats?.successful ?? 0,
          failedRequests: stats?.failed ?? 0,
          bytesTransferred: stats?.bytesTransferred ?? 0,
          rps: actualDuration > 0 ? Math.round((stats?.totalRequests ?? 0) / actualDuration) : 0,
          latency: { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 },
          statusCodes: stats?.statusCodes ?? {},
          errors: stats?.getErrors() ?? [],
        };
      }

      this.emitError(err.message || 'Load test failed', {
        stack: err.stack,
        context: targetUrl,
      });
      throw err;
    }
  }

  /**
   * Stop the load test
   */
  stop(): void {
    if (this.generator) {
      this.generator.stop();
    }
    this.stopStatsPolling();
  }

  /**
   * Get current stats snapshot
   */
  getSnapshot(): LoadTestSnapshot | null {
    if (!this.generator || !this.startTime) return null;

    const stats = this.generator.stats;
    const snapshot = stats.getSnapshot();
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const remaining = Math.max(0, (this.generator as any).config?.duration - elapsed) || 0;

    return {
      elapsed,
      remaining,
      progress: remaining > 0 ? Math.round((elapsed / (elapsed + remaining)) * 100) : 100,
      rps: snapshot.rps,
      p95: snapshot.p95,
      activeUsers: snapshot.activeUsers,
      totalRequests: stats.totalRequests,
      successful: stats.successful,
      failed: stats.failed,
      bytesTransferred: stats.bytesTransferred,
    };
  }

  /**
   * Start periodic stats polling and event emission
   */
  private startStatsPolling(config: LoadConfig): void {
    this.updateInterval = setInterval(() => {
      const snapshot = this.getSnapshot();
      if (!snapshot) return;

      // Emit data event with current stats
      this.emit('data', {
        type: 'data',
        category: 'loadtest:stats',
        timestamp: Date.now(),
        command: 'loadtest',
        level: 'info',
        payload: snapshot,
      });

      // Emit progress event
      this.emitProgress({
        current: snapshot.elapsed,
        total: config.duration,
        currentItem: `${snapshot.rps.toFixed(0)} req/s │ P95: ${snapshot.p95.toFixed(0)}ms │ ${snapshot.activeUsers} users`,
        percent: snapshot.progress,
        metrics: {
          rps: snapshot.rps,
          p95: snapshot.p95,
          activeUsers: snapshot.activeUsers,
          totalRequests: snapshot.totalRequests,
          successful: snapshot.successful,
          failed: snapshot.failed,
        },
      });

      // Emit error events for recent errors
      const stats = this.generator?.stats;
      if (stats) {
        const recentErrors = stats.getRecentErrors();
        for (const error of recentErrors) {
          this.emit('data', {
            type: 'data',
            category: 'loadtest:error',
            timestamp: error.lastSeen,
            command: 'loadtest',
            level: 'warn',
            payload: {
              status: error.status,
              message: error.message,
              count: error.count,
            },
          });
        }
      }
    }, 1000);
  }

  /**
   * Stop stats polling
   */
  private stopStatsPolling(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
}

/**
 * Convenience function to run load test with CLI output
 */
export async function runLoadTestWithEvents(
  url: string,
  options: Omit<LoadTestRunnerOptions, 'url'> & { verbose?: boolean; json?: boolean } = {}
): Promise<LoadTestRunnerResult> {
  const { verbose = false, json = false, ...loadOptions } = options;

  const runner = new LoadTestRunner();

  if (!json) {
    const { attachCLIHandler } = await import('../events/handlers/cli.js');
    attachCLIHandler(runner, { verbose });
  }

  return runner.run({ url, ...loadOptions });
}

/**
 * Watch Job - Monitor stream and auto-record when live
 *
 * Polls a stream URL periodically and starts a DownloadJob when live.
 *
 * @example
 * ```typescript
 * const job = new WatchJob(manager, '@twitch/shroud', {
 *   pollInterval: [30, 60], // 30-60 seconds
 *   outputDir: '~/streams',
 *   quality: 'highest'
 * });
 *
 * // Start watching in background
 * job.start();
 *
 * // Later: stop watching
 * job.abort();
 * ```
 */

import type { JobManager, Job, WatchJobOptions } from '../job-manager.js';
import { DownloadJob } from './download-job.js';

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get random delay between min and max seconds
 */
function getRandomDelay(minSec: number, maxSec: number): number {
  return (minSec + Math.random() * (maxSec - minSec)) * 1000;
}

export class WatchJob {
  private abortController: AbortController;
  private job: Job;
  private started: boolean = false;
  private promise: Promise<void> | null = null;
  private downloadJob: DownloadJob | null = null;

  constructor(
    private manager: JobManager,
    private url: string,
    private options: WatchJobOptions
  ) {
    this.abortController = new AbortController();
    this.job = manager.registerWatch(url, () => this.abort());
  }

  /**
   * Get the job ID
   */
  get id(): number {
    return this.job.id;
  }

  /**
   * Get the job object
   */
  getJob(): Job {
    return this.job;
  }

  /**
   * Get the spawned download job (if any)
   */
  getDownloadJob(): DownloadJob | null {
    return this.downloadJob;
  }

  /**
   * Start watching in background
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    // Run watch loop in background (don't await)
    this.promise = this.run().catch((err) => {
      // Error already handled in run()
    });
  }

  /**
   * Abort watching
   */
  abort(): void {
    this.abortController.abort();
    if (this.downloadJob) {
      this.downloadJob.abort();
    }
  }

  /**
   * Wait for watch to complete (when stream goes live or aborted)
   */
  async wait(): Promise<void> {
    if (this.promise) {
      await this.promise;
    }
  }

  /**
   * Check if stream is live
   */
  private async checkLive(): Promise<boolean> {
    try {
      const { expandShortcut } = await import('../../utils/shortcut-expander.js');
      const { Client } = await import('../../../core/client.js');
      const { extract } = await import('../../../extractors/index.js');

      const fullUrl = expandShortcut(this.url);
      const client = new Client();

      const info = await extract(fullUrl, client);
      return info.isLive === true;
    } catch (err: any) {
      // Stream offline or extraction failed
      // Common errors: 404, offline message, etc.
      return false;
    }
  }

  /**
   * Called when stream goes live
   */
  private async onLive(): Promise<void> {
    // Emit live event
    this.manager.emitLive(this.job.id);

    // Create download job
    this.downloadJob = new DownloadJob(this.manager, this.url, {
      outputDir: this.options.outputDir,
      quality: this.options.quality,
      duration: this.options.duration,
    });

    // Start download
    this.downloadJob.start();

    // Mark watch job as completed
    this.manager.updateStatus(this.job.id, 'completed');
  }

  /**
   * Run the watch loop
   */
  private async run(): Promise<void> {
    try {
      this.manager.start(this.job.id);

      const [minSec, maxSec] = this.options.pollInterval;

      // Poll loop
      while (!this.abortController.signal.aborted) {
        // Check if stream is live
        const isLive = await this.checkLive();

        if (isLive) {
          await this.onLive();
          return;
        }

        // Sleep for random interval
        const delay = getRandomDelay(minSec, maxSec);

        // Use AbortSignal-aware sleep
        await this.sleepWithAbort(delay);
      }

      // Aborted
      this.manager.updateStatus(this.job.id, 'stopped');
    } catch (err: any) {
      // Check if aborted
      if (err.name === 'AbortError' || this.abortController.signal.aborted) {
        this.manager.updateStatus(this.job.id, 'stopped');
        return;
      }

      // Mark as failed
      this.manager.fail(this.job.id, err);
    }
  }

  /**
   * Sleep that can be aborted
   */
  private sleepWithAbort(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);

      const onAbort = () => {
        clearTimeout(timeout);
        reject(new DOMException('Aborted', 'AbortError'));
      };

      this.abortController.signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}

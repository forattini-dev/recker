/**
 * Download Job - Background live stream download
 *
 * Wraps VideoBuilder for non-blocking execution in the shell.
 *
 * @example
 * ```typescript
 * const job = new DownloadJob(manager, '@chaturbate/room', {
 *   outputDir: '~/streams',
 *   quality: 'highest'
 * });
 *
 * // Start download in background
 * job.start();
 *
 * // Later: abort if needed
 * job.abort();
 * ```
 */

import { join } from 'node:path';
import type { JobManager, Job, DownloadJobOptions } from '../job-manager.js';

/**
 * Generate a unique filename for live stream recording
 * Format: {provider}--{username}--{YYYY-MM-DD-HH-mm-ss}.ts
 */
function generateLiveFilename(url: string, extractorName: string | null, uploader: string | null): string {
  // Get provider name
  let provider = extractorName || 'live';

  // Try to extract username from URL if uploader not available
  let username = uploader;
  if (!username) {
    try {
      // Handle shortcuts
      if (url.startsWith('@') || !url.includes('://')) {
        const clean = url.replace(/^@/, '');
        const parts = clean.split('/');
        username = parts[parts.length - 1] || parts[0];
      } else {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        const skipSegments = ['u', 'channel', 'c', 'user', 'live', 'video', 'watch', 'embed'];
        username = pathParts.find((p) => !skipSegments.includes(p.toLowerCase())) || pathParts[0];
      }
    } catch {
      username = 'unknown';
    }
  }

  // Sanitize username for filesystem
  username = (username || 'unknown').replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').slice(0, 50);

  // Generate timestamp: YYYY-MM-DD-HH-mm-ss
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('-');

  return `${provider}--${username}--${timestamp}.ts`;
}

export class DownloadJob {
  private abortController: AbortController;
  private job: Job;
  private started: boolean = false;
  private promise: Promise<void> | null = null;

  constructor(
    private manager: JobManager,
    private url: string,
    private options: DownloadJobOptions = {}
  ) {
    this.abortController = new AbortController();
    this.job = manager.registerDownload(url, () => this.abort());
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
   * Start the download in background
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    // Run download in background (don't await)
    this.promise = this.run().catch((err) => {
      // Error already handled in run()
    });
  }

  /**
   * Abort the download
   */
  abort(): void {
    this.abortController.abort();
  }

  /**
   * Wait for download to complete
   */
  async wait(): Promise<void> {
    if (this.promise) {
      await this.promise;
    }
  }

  /**
   * Run the download
   */
  private async run(): Promise<void> {
    try {
      // Dynamically import dependencies
      const { expandShortcut } = await import('../../utils/shortcut-expander.js');
      const { Client } = await import('../../../core/client.js');
      const { createVideoBuilder } = await import('../../../video/builder.js');
      const { getExtractorName } = await import('../../../extractors/index.js');

      // Expand shortcut to full URL
      const fullUrl = expandShortcut(this.url);

      // Create client
      const client = new Client();

      // Create video builder
      const videoBuilder = createVideoBuilder(fullUrl, client);

      // Set quality
      if (this.options.quality) {
        if (
          this.options.quality === 'highest' ||
          this.options.quality === 'lowest' ||
          this.options.quality === 'best' ||
          this.options.quality === 'worst'
        ) {
          videoBuilder.quality(this.options.quality);
        } else if (this.options.quality.endsWith('p')) {
          videoBuilder.quality(this.options.quality as `${number}p`);
        }
      }

      // Enable live mode
      videoBuilder.live({
        duration: this.options.duration ? this.options.duration * 1000 : undefined,
      });

      // Set concurrency
      if (this.options.concurrency) {
        videoBuilder.options({ concurrency: this.options.concurrency });
      }

      // Get info
      const info = await videoBuilder.info();

      // Determine output path
      let output: string;
      if (this.options.output) {
        output = this.options.output;
      } else {
        const extractorName = await getExtractorName(fullUrl);
        const generatedFilename = generateLiveFilename(fullUrl, extractorName, info.uploader || null);

        if (this.options.outputDir) {
          output = join(this.options.outputDir, generatedFilename);
        } else {
          output = generatedFilename;
        }
      }

      // Update job with output path
      this.manager.setOutput(this.job.id, output);

      // Mark as started
      this.manager.start(this.job.id);

      // Track start time
      const startTime = Date.now();

      // Set up progress tracking
      videoBuilder.onProgress((progress) => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        this.manager.updateProgress(this.job.id, {
          segments: progress.downloadedSegments,
          bytes: progress.downloadedBytes,
          duration: elapsed,
        });
      });

      // Download
      await videoBuilder.download(output);

      // Mark as completed
      this.manager.updateStatus(this.job.id, 'completed');
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
}

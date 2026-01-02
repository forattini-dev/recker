/**
 * Spider Job - Background web crawling
 *
 * Wraps Spider for non-blocking execution in the shell.
 *
 * @example
 * ```typescript
 * const job = new SpiderJob(manager, 'https://example.com', {
 *   maxDepth: 3,
 *   maxPages: 100
 * });
 *
 * // Start crawling in background
 * job.start();
 *
 * // Later: abort if needed
 * job.abort();
 * ```
 */

import type { JobManager, Job, SpiderJobOptions } from '../job-manager.js';
import type { SpiderResult } from '../../../scrape/spider.js';

export class SpiderJob {
  private abortController: AbortController;
  private job: Job;
  private started: boolean = false;
  private promise: Promise<SpiderResult | void> | null = null;
  private result: SpiderResult | null = null;

  constructor(
    private manager: JobManager,
    private url: string,
    private options: SpiderJobOptions = {}
  ) {
    this.abortController = new AbortController();
    this.job = manager.registerSpider(url, () => this.abort());
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
   * Get the crawl result (available after completion)
   */
  getResult(): SpiderResult | null {
    return this.result;
  }

  /**
   * Start crawling in background
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    // Run crawl in background (don't await)
    this.promise = this.run().catch((err) => {
      // Error already handled in run()
    });
  }

  /**
   * Abort the crawl
   */
  abort(): void {
    this.abortController.abort();
  }

  /**
   * Wait for crawl to complete
   */
  async wait(): Promise<SpiderResult | void> {
    if (this.promise) {
      return await this.promise;
    }
  }

  /**
   * Run the crawl
   */
  private async run(): Promise<SpiderResult> {
    try {
      // Dynamically import Spider
      const { Spider } = await import('../../../scrape/spider.js');

      // Create spider with options
      const spider = new Spider({
        maxDepth: this.options.maxDepth ?? 5,
        maxPages: this.options.maxPages ?? 100,
        concurrency: this.options.concurrency ?? 5,
        delay: this.options.delay ?? 100,
        sameDomain: this.options.sameDomain ?? true,
        useSitemap: this.options.useSitemap ?? false,

        // Progress callback - update job progress
        onProgress: (progress) => {
          this.manager.updateProgress(this.job.id, {
            segments: 0,
            bytes: 0,
            pages: progress.crawled,
            queued: progress.queued,
            errors: 0, // Errors tracked separately in result
          });
        },

        // Page callback - could be extended for per-page events
        onPage: (result) => {
          if (result.error) {
            // Track errors in progress
            const currentProgress = this.job.progress;
            this.manager.updateProgress(this.job.id, {
              ...currentProgress,
              errors: (currentProgress.errors || 0) + 1,
            });
          }
        },
      });

      // Set output file if provided
      if (this.options.outputFile) {
        this.manager.setOutput(this.job.id, this.options.outputFile);
      }

      // Mark as started (status already 'crawling' from registerSpider)
      this.manager.start(this.job.id);

      // Handle abort signal
      this.abortController.signal.addEventListener('abort', () => {
        spider.abort();
      });

      // Start crawling
      const result = await spider.crawl(this.url);
      this.result = result;

      // Update final progress
      this.manager.updateProgress(this.job.id, {
        segments: 0,
        bytes: 0,
        pages: result.pages.length,
        queued: 0,
        errors: result.errors.length,
      });

      // Save results to file if outputFile specified
      if (this.options.outputFile) {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(
          this.options.outputFile,
          JSON.stringify(result, (_key, value) => {
            // Convert Set to Array for JSON serialization
            if (value instanceof Set) {
              return Array.from(value);
            }
            return value;
          }, 2)
        );
      }

      // Mark as completed
      this.manager.updateStatus(this.job.id, 'completed');

      return result;
    } catch (err: any) {
      // Check if aborted
      if (err.name === 'AbortError' || this.abortController.signal.aborted) {
        this.manager.updateStatus(this.job.id, 'stopped');
        return this.result!;
      }

      // Mark as failed
      this.manager.fail(this.job.id, err);
      throw err;
    }
  }
}

/**
 * HLS Runner - Event-Driven HLS Download Command
 *
 * Wraps the HLS plugin and emits events for CLI/TUI handlers.
 * This separates the download logic from output presentation.
 *
 * @example
 * ```typescript
 * const runner = new HLSRunner();
 *
 * // CLI mode
 * attachCLIHandler(runner, { verbose: true });
 *
 * // TUI mode (background job)
 * attachTUIHandler(runner, { jobId: 123 });
 *
 * await runner.download('https://example.com/stream.m3u8', { output: 'video.ts' });
 * ```
 */

import { createClient, type Client } from '../../core/client.js';
import { CommandEmitter } from '../events/emitter.js';

// =============================================================================
// Types
// =============================================================================

export interface HLSRunnerOptions {
  /** HTTP client to use (optional, creates one if not provided) */
  client?: Client;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Output file path */
  output?: string;
  /** Quality preference */
  quality?: 'highest' | 'lowest';
  /** Enable live stream mode */
  live?: boolean;
  /** Duration for live recording (seconds) */
  duration?: number;
}

export interface HLSInfoResult {
  url: string;
  variants: Array<{
    bandwidth: number;
    resolution?: string;
    codecs?: string;
    url: string;
  }>;
  segments?: number;
  duration?: number;
  isLive: boolean;
}

export interface HLSDownloadResult {
  url: string;
  output: string;
  duration: number;
  segments: number;
  bytes: number;
  quality?: string;
}

// =============================================================================
// HLS Runner
// =============================================================================

export class HLSRunner extends CommandEmitter {
  private client: Client;

  constructor(client?: Client) {
    super('hls');
    this.client = client ?? createClient({
      timeout: 30000,
      checkHooks: false,
    } as any);
  }

  /**
   * Get HLS stream info
   */
  async info(url: string, options: Pick<HLSRunnerOptions, 'signal' | 'client'> = {}): Promise<HLSInfoResult> {
    const { signal } = options;

    // Emit start event
    this.emitStart(url, { action: 'info' });

    try {
      if (signal?.aborted) {
        throw new Error('Aborted');
      }

      const { hls } = await import('../../plugins/hls.js');
      const hlsClient = hls(options.client ?? this.client, url, {});

      const info = await hlsClient.info();

      // Extract variants from master playlist
      const variants = info.master?.variants || [];

      // Extract segments from media playlist
      const segments = info.playlist?.segments || [];

      const result: HLSInfoResult = {
        url,
        variants: variants.map((v: any) => ({
          bandwidth: v.bandwidth,
          resolution: v.resolution,
          codecs: v.codecs,
          url: v.url,
        })),
        segments: segments.length,
        duration: info.totalDuration,
        isLive: info.isLive ?? false,
      };

      this.emitComplete({
        url,
        variants: result.variants.length,
        isLive: result.isLive,
        duration: result.duration,
      });

      return result;

    } catch (err: any) {
      if (signal?.aborted || err.message === 'Aborted') {
        this.emitError('HLS info stopped by user', { code: 'ABORT' });
      } else {
        this.emitError(err.message || 'Failed to get HLS info', {
          stack: err.stack,
          context: url,
        });
      }
      throw err;
    }
  }

  /**
   * Download HLS stream with event emission
   */
  async download(url: string, options: HLSRunnerOptions = {}): Promise<HLSDownloadResult> {
    const {
      signal,
      output = 'stream.ts',
      quality = 'highest',
      live = false,
      duration,
    } = options;

    // Emit start event
    this.emitStart(url, { action: 'download', quality, live, duration });

    const startTime = performance.now();
    let totalSegments = 0;
    let totalBytes = 0;

    try {
      if (signal?.aborted) {
        throw new Error('Aborted');
      }

      // Emit progress: connecting
      this.emitProgress({
        current: 0,
        total: 0,
        currentItem: `Fetching HLS playlist: ${url}`,
        percent: 0,
      });

      const { hls } = await import('../../plugins/hls.js');
      const hlsClient = hls(options.client ?? this.client, url, {
        quality,
        // Live can be boolean or { duration: ms }
        live: live ? (duration ? { duration: duration * 1000 } : true) : undefined,
        onProgress: (progress: any) => {
          totalSegments = progress.downloadedSegments || 0;
          totalBytes = progress.downloadedBytes || 0;

          // Emit download segment event
          this.emit('data', {
            type: 'data',
            category: 'download:segment',
            timestamp: Date.now(),
            command: 'hls',
            level: 'debug',
            payload: {
              segments: totalSegments,
              totalSegments: progress.totalSegments,
              bytes: totalBytes,
            },
          });

          // Emit progress
          this.emitProgress({
            current: totalSegments,
            total: progress.totalSegments,
            currentItem: `${totalSegments}/${progress.totalSegments || '?'} segments, ${(totalBytes / 1024 / 1024).toFixed(2)} MB`,
            percent: progress.totalSegments
              ? Math.round((totalSegments / progress.totalSegments) * 100)
              : undefined,
            metrics: {
              segments: totalSegments,
              bytes: totalBytes,
            },
          });
        },
      });

      // Get info first
      const info = await hlsClient.info();

      // Emit data event with stream info
      this.emit('data', {
        type: 'data',
        category: 'hls:info',
        timestamp: Date.now(),
        command: 'hls',
        level: 'info',
        payload: {
          variants: info.master?.variants?.length || 0,
          segments: info.playlist?.segments?.length || 0,
          duration: info.totalDuration,
          isLive: info.isLive,
        },
      });

      // Start download
      await hlsClient.download(output);

      // Calculate duration
      const downloadDuration = Math.round(performance.now() - startTime);

      const result: HLSDownloadResult = {
        url,
        output,
        duration: downloadDuration,
        segments: totalSegments,
        bytes: totalBytes,
        quality,
      };

      // Emit completion
      this.emitComplete({
        url,
        output,
        duration: downloadDuration,
        segments: totalSegments,
        bytes: totalBytes,
        filename: output,
      });

      return result;

    } catch (err: any) {
      if (signal?.aborted || err.message === 'Aborted') {
        this.emitError('HLS download stopped by user', { code: 'ABORT' });
        // Return partial result on abort
        return {
          url,
          output,
          duration: Math.round(performance.now() - startTime),
          segments: totalSegments,
          bytes: totalBytes,
          quality,
        };
      }
      this.emitError(err.message || 'HLS download failed', {
        stack: err.stack,
        context: url,
      });
      throw err;
    }
  }
}

/**
 * Convenience function to run HLS download with CLI output
 */
export async function runHLSWithEvents(
  url: string,
  options: HLSRunnerOptions & { verbose?: boolean; json?: boolean } = {}
): Promise<HLSDownloadResult> {
  const { verbose = false, json = false, ...hlsOptions } = options;

  const runner = new HLSRunner(options.client);

  if (!json) {
    const { attachCLIHandler } = await import('../events/handlers/cli.js');
    attachCLIHandler(runner, { verbose });
  }

  return runner.download(url, hlsOptions);
}

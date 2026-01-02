/**
 * Live Runner - Event-Driven Live Stream Recording
 *
 * Wraps the video builder for live stream recording and emits events
 * for CLI/TUI handlers. This separates the recording logic from output.
 *
 * @example
 * ```typescript
 * const runner = new LiveRunner();
 *
 * // CLI mode
 * attachCLIHandler(runner, { verbose: true });
 *
 * // TUI mode (background job)
 * attachTUIHandler(runner, { jobId: 123 });
 *
 * await runner.download('https://twitch.tv/shroud', { output: 'stream.ts' });
 * ```
 */

import { createClient, type Client } from '../../core/client.js';
import { CommandEmitter } from '../events/emitter.js';

// =============================================================================
// Types
// =============================================================================

export interface LiveRunnerOptions {
  /** HTTP client to use (optional, creates one if not provided) */
  client?: Client;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Output file path */
  output?: string;
  /** Output directory (auto-generates filename) */
  outputDir?: string;
  /** Quality preset */
  quality?: 'highest' | 'lowest' | 'best' | 'worst' | `${number}p`;
  /** Recording duration in seconds (undefined = until stopped) */
  duration?: number;
  /** Concurrent segment downloads */
  concurrency?: number;
}

export interface LiveRunnerResult {
  url: string;
  output: string;
  duration: number;
  segments: number;
  bytes: number;
  title?: string;
  uploader?: string;
}

export interface LiveInfoResult {
  url: string;
  title?: string;
  uploader?: string;
  isLive: boolean;
  thumbnail?: string;
  viewCount?: number;
  duration?: number;
}

// =============================================================================
// Live Runner
// =============================================================================

export class LiveRunner extends CommandEmitter {
  private client: Client;

  constructor(client?: Client) {
    super('live');
    this.client = client ?? createClient({
      timeout: 30000,
      checkHooks: false,
    } as any);
  }

  /**
   * Get info about a live stream
   */
  async info(url: string, options: Pick<LiveRunnerOptions, 'signal' | 'client'> = {}): Promise<LiveInfoResult> {
    const { signal } = options;

    // Emit start event
    this.emitStart(url, { action: 'info' });

    try {
      // Check for abort
      if (signal?.aborted) {
        throw new Error('Aborted');
      }

      const { createVideoBuilder } = await import('../../video/builder.js');
      const videoBuilder = createVideoBuilder(url, options.client ?? this.client);

      const info = await videoBuilder.info();

      const result: LiveInfoResult = {
        url,
        title: info.title,
        uploader: info.uploader,
        isLive: info.isLive ?? false,
        thumbnail: info.thumbnail,
        viewCount: info.viewCount,
        duration: info.duration,
      };

      // Emit completion
      this.emitComplete({
        url,
        isLive: result.isLive,
        uploader: result.uploader,
        title: result.title,
      });

      return result;

    } catch (err: any) {
      if (signal?.aborted || err.message === 'Aborted') {
        this.emitError('Live info stopped by user', { code: 'ABORT' });
      } else {
        this.emitError(err.message || 'Failed to get live info', {
          stack: err.stack,
          context: url,
        });
      }
      throw err;
    }
  }

  /**
   * Download/record a live stream with event emission
   */
  async download(url: string, options: LiveRunnerOptions = {}): Promise<LiveRunnerResult> {
    const {
      signal,
      output,
      outputDir,
      quality,
      duration,
      concurrency = 4,
    } = options;

    // Emit start event
    this.emitStart(url, { action: 'download', quality, duration });

    const startTime = performance.now();
    let totalSegments = 0;
    let totalBytes = 0;
    let finalOutput = output || 'live-recording.ts';
    let streamInfo: { title?: string; uploader?: string } = {};

    try {
      // Check for abort
      if (signal?.aborted) {
        throw new Error('Aborted');
      }

      // Emit progress: connecting
      this.emitProgress({
        current: 0,
        total: 0,
        currentItem: `Connecting to ${url}...`,
        percent: 0,
      });

      const { createVideoBuilder } = await import('../../video/builder.js');
      const { getExtractorName } = await import('../../extractors/index.js');
      const { join } = await import('node:path');

      const videoBuilder = createVideoBuilder(url, options.client ?? this.client);

      // Set quality
      if (quality) {
        videoBuilder.quality(quality);
      }

      // Enable live mode
      videoBuilder.live({
        duration: duration ? duration * 1000 : undefined,
      });

      // Set concurrency
      videoBuilder.options({ concurrency });

      // Get info first
      const info = await videoBuilder.info();
      streamInfo = {
        title: info.title,
        uploader: info.uploader,
      };

      // Emit data event with stream info
      this.emit('data', {
        type: 'data',
        category: 'live:info',
        timestamp: Date.now(),
        command: 'live',
        level: 'info',
        payload: {
          title: info.title,
          uploader: info.uploader,
          isLive: info.isLive,
        },
      });

      // Determine output path
      if (output) {
        finalOutput = output;
      } else {
        const extractorName = await getExtractorName(url);
        finalOutput = this.generateFilename(url, extractorName, info.uploader || null);
        if (outputDir) {
          finalOutput = join(outputDir, finalOutput);
        }
      }

      // Set up progress callback
      videoBuilder.onProgress((progress) => {
        totalSegments = progress.downloadedSegments;
        totalBytes = progress.downloadedBytes;

        // Emit download segment event
        this.emit('data', {
          type: 'data',
          category: 'download:segment',
          timestamp: Date.now(),
          command: 'live',
          level: 'debug',
          payload: {
            segments: progress.downloadedSegments,
            totalSegments: progress.totalSegments,
            bytes: progress.downloadedBytes,
          },
        });

        // Emit progress
        this.emitProgress({
          current: progress.downloadedSegments,
          total: progress.totalSegments,
          currentItem: `${progress.downloadedSegments} segments, ${(progress.downloadedBytes / 1024 / 1024).toFixed(2)} MB`,
          metrics: {
            segments: progress.downloadedSegments,
            bytes: progress.downloadedBytes,
          },
        });
      });

      // Start recording
      // Note: VideoBuilder doesn't have a direct abort method,
      // but the underlying HLS client respects AbortSignal
      await videoBuilder.download(finalOutput);

      // Calculate duration
      const recordingDuration = Math.round(performance.now() - startTime);

      const result: LiveRunnerResult = {
        url,
        output: finalOutput,
        duration: recordingDuration,
        segments: totalSegments,
        bytes: totalBytes,
        title: streamInfo.title,
        uploader: streamInfo.uploader,
      };

      // Emit completion
      this.emitComplete({
        url,
        output: finalOutput,
        duration: recordingDuration,
        segments: totalSegments,
        bytes: totalBytes,
        filename: finalOutput,
      });

      return result;

    } catch (err: any) {
      if (signal?.aborted || err.message === 'Aborted') {
        this.emitError('Live recording stopped by user', { code: 'ABORT' });
        // Return partial result on abort
        return {
          url,
          output: finalOutput,
          duration: Math.round(performance.now() - startTime),
          segments: totalSegments,
          bytes: totalBytes,
          title: streamInfo.title,
          uploader: streamInfo.uploader,
        };
      }
      this.emitError(err.message || 'Live recording failed', {
        stack: err.stack,
        context: url,
      });
      throw err;
    }
  }

  /**
   * Generate a unique filename for live stream recording
   */
  private generateFilename(url: string, extractorName: string | null, uploader: string | null): string {
    let provider = extractorName || 'live';
    let username = uploader;

    if (!username) {
      try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        const skipSegments = ['u', 'channel', 'c', 'user', 'live', 'video', 'watch', 'embed'];
        username = pathParts.find(p => !skipSegments.includes(p.toLowerCase())) || pathParts[0];
      } catch {
        username = 'unknown';
      }
    }

    // Sanitize for filesystem
    username = (username || 'unknown')
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 50);

    // Generate timestamp
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
}

/**
 * Convenience function to run live download with CLI output
 */
export async function runLiveWithEvents(
  url: string,
  options: LiveRunnerOptions & { verbose?: boolean; json?: boolean } = {}
): Promise<LiveRunnerResult> {
  const { verbose = false, json = false, ...liveOptions } = options;

  const runner = new LiveRunner(options.client);

  if (!json) {
    const { attachCLIHandler } = await import('../events/handlers/cli.js');
    attachCLIHandler(runner, { verbose });
  }

  return runner.download(url, liveOptions);
}

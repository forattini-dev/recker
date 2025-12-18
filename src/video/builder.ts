/**
 * Video Builder - Fluent API for video extraction and download
 *
 * @example
 * ```typescript
 * import { recker } from 'recker';
 *
 * // Simple download
 * await recker.video('https://chaturbate.com/username/').download('./video.ts');
 *
 * // With options
 * await recker.video('https://pornhub.com/view_video.php?viewkey=xxx')
 *   .quality('highest')
 *   .onProgress(console.log)
 *   .download('./video.mp4');
 *
 * // Get info only
 * const info = await recker.video('https://xvideos.com/video123/title').info();
 * console.log(info.title, info.formats);
 *
 * // Live recording
 * await recker.video('https://chaturbate.com/username/')
 *   .live({ duration: 60000 })
 *   .download('./live.ts');
 * ```
 */

import type { Client } from '../core/client.js';
import { extract } from '../extractors/index.js';
import type { ExtractorResult, Format } from '../extractors/index.js';
import type { HlsProgress } from '../plugins/hls.js';
import type { HlsPromise } from '../plugins/hls.js';

/**
 * Quality selection options
 */
export type QualityOption =
  | 'highest'
  | 'lowest'
  | 'best'
  | 'worst'
  | `${number}p`
  | { bandwidth?: number; height?: number; width?: number };

/**
 * Live stream options
 */
export interface LiveOptions {
  /** Duration in milliseconds */
  duration?: number;
  /** Stop when stream ends */
  untilEnd?: boolean;
}

/**
 * Download options
 */
export interface DownloadOptions {
  /** Overwrite existing file */
  overwrite?: boolean;
  /** Concurrent segment downloads */
  concurrency?: number;
}

/**
 * Progress callback
 */
export type ProgressCallback = (progress: VideoProgress) => void;

/**
 * Video download progress
 */
export interface VideoProgress {
  /** Number of downloaded segments */
  downloadedSegments: number;
  /** Total number of segments (undefined for live) */
  totalSegments?: number;
  /** Total bytes downloaded */
  downloadedBytes: number;
  /** Current segment number */
  currentSegment?: number;
  /** Is live stream */
  isLive?: boolean;
  /** Elapsed time in ms */
  elapsedMs: number;
  /** Download speed in bytes/s */
  speed?: number;
  /** Estimated time remaining in seconds */
  eta?: number;
  /** Download percentage */
  percent?: number;
  /** Video title */
  title?: string;
  /** Selected format */
  format?: Format;
}

/**
 * Video Builder - Fluent API for video operations
 */
export class VideoBuilder {
  private url: string;
  private client: Client;
  private qualityOption: QualityOption = 'highest';
  private liveOptions?: LiveOptions;
  private progressCallback?: ProgressCallback;
  private downloadOptions: DownloadOptions = {};
  private preferExtractor?: string;
  private cachedInfo?: ExtractorResult;

  constructor(url: string, client: Client) {
    this.url = url;
    this.client = client;
  }

  /**
   * Set quality preference
   */
  quality(option: QualityOption): this {
    this.qualityOption = option;
    return this;
  }

  /**
   * Set live stream options
   */
  live(options: LiveOptions = {}): this {
    this.liveOptions = options;
    return this;
  }

  /**
   * Set progress callback
   */
  onProgress(callback: ProgressCallback): this {
    this.progressCallback = callback;
    return this;
  }

  /**
   * Set download options
   */
  options(opts: DownloadOptions): this {
    this.downloadOptions = { ...this.downloadOptions, ...opts };
    return this;
  }

  /**
   * Prefer a specific extractor
   */
  extractor(name: string): this {
    this.preferExtractor = name;
    return this;
  }

  /**
   * Get video information without downloading
   */
  async info(): Promise<ExtractorResult> {
    if (this.cachedInfo) {
      return this.cachedInfo;
    }

    this.cachedInfo = await extract(this.url, this.client, {
      preferExtractor: this.preferExtractor,
    });

    return this.cachedInfo;
  }

  /**
   * Get available formats
   */
  async formats(): Promise<Format[]> {
    const info = await this.info();
    return info.formats || [];
  }

  /**
   * Select best format based on quality option
   */
  async selectFormat(): Promise<Format> {
    const formats = await this.formats();

    if (formats.length === 0) {
      throw new Error('No formats available');
    }

    return this.selectBestFormat(formats);
  }

  /**
   * Download video to file
   */
  async download(outputPath: string): Promise<void> {
    const info = await this.info();
    const format = await this.selectFormat();

    // Determine if it's HLS or direct download
    if (format.protocol === 'm3u8' || format.ext === 'm3u8' || format.url.includes('.m3u8')) {
      await this.downloadHls(format, outputPath, info);
    } else {
      await this.downloadDirect(format, outputPath, info);
    }
  }

  /**
   * Stream video data
   */
  async *stream(): AsyncGenerator<{ data: Uint8Array; sequence: number; format: Format }> {
    const format = await this.selectFormat();

    if (format.protocol === 'm3u8' || format.ext === 'm3u8' || format.url.includes('.m3u8')) {
      const hlsOptions: Parameters<Client['hls']>[1] = {
        concurrency: this.downloadOptions.concurrency,
        useCurl: format.useCurl,
      };

      if (this.liveOptions) {
        if (this.liveOptions.duration) {
          hlsOptions.live = { duration: this.liveOptions.duration };
        } else {
          hlsOptions.live = true; // Infinite until stream ends
        }
      }

      const hls = this.client.hls(format.url, hlsOptions);

      for await (const segment of hls.stream()) {
        yield {
          data: segment.data,
          sequence: segment.sequence,
          format,
        };
      }
    } else {
      // Direct download as single chunk
      const response = await this.client.get(format.url);
      const blob = await response.blob();
      const buffer = await blob.arrayBuffer();

      yield {
        data: new Uint8Array(buffer),
        sequence: 0,
        format,
      };
    }
  }

  /**
   * Select best format based on quality option
   */
  private selectBestFormat(formats: Format[]): Format {
    if (formats.length === 1) {
      return formats[0];
    }

    // Sort formats by quality (height or bandwidth)
    const sorted = [...formats].sort((a, b) => {
      const aQuality = a.height || a.bandwidth || 0;
      const bQuality = b.height || b.bandwidth || 0;
      return bQuality - aQuality;
    });

    switch (this.qualityOption) {
      case 'highest':
      case 'best':
        return sorted[0];

      case 'lowest':
      case 'worst':
        return sorted[sorted.length - 1];

      default:
        // Parse specific quality (e.g., '720p')
        if (typeof this.qualityOption === 'string' && this.qualityOption.endsWith('p')) {
          const targetHeight = parseInt(this.qualityOption.slice(0, -1), 10);
          const match = sorted.find((f) => f.height === targetHeight);
          if (match) return match;

          // Find closest
          const closest = sorted.reduce((prev, curr) => {
            const prevDiff = Math.abs((prev.height || 0) - targetHeight);
            const currDiff = Math.abs((curr.height || 0) - targetHeight);
            return currDiff < prevDiff ? curr : prev;
          });
          return closest;
        }

        // Object-based selection
        if (typeof this.qualityOption === 'object') {
          const { bandwidth, height, width } = this.qualityOption;

          if (height) {
            const match = sorted.find((f) => f.height === height);
            if (match) return match;
          }

          if (width) {
            const match = sorted.find((f) => f.width === width);
            if (match) return match;
          }

          if (bandwidth) {
            const match = sorted.find((f) => f.bandwidth === bandwidth);
            if (match) return match;
          }
        }

        // Default to highest
        return sorted[0];
    }
  }

  /**
   * Download HLS stream
   */
  private async downloadHls(
    format: Format,
    outputPath: string,
    info: ExtractorResult
  ): Promise<void> {
    const hlsOptions: Parameters<Client['hls']>[1] = {
      concurrency: this.downloadOptions.concurrency,
      useCurl: format.useCurl,
    };

    if (this.liveOptions) {
      if (this.liveOptions.duration) {
        hlsOptions.live = { duration: this.liveOptions.duration };
      } else {
        hlsOptions.live = true; // Infinite until stream ends
      }
    }

    // Set up progress callback as option
    if (this.progressCallback) {
      hlsOptions.onProgress = (hlsProgress) => {
        this.progressCallback!({
          downloadedSegments: hlsProgress.downloadedSegments,
          totalSegments: hlsProgress.totalSegments,
          downloadedBytes: hlsProgress.downloadedBytes,
          currentSegment: hlsProgress.currentSegment,
          isLive: hlsProgress.isLive,
          elapsedMs: hlsProgress.elapsed,
          title: info.title,
          format,
        });
      };
    }

    const hls = this.client.hls(format.url, hlsOptions);
    await hls.download(outputPath);
  }

  /**
   * Download direct video file
   */
  private async downloadDirect(
    format: Format,
    outputPath: string,
    info: ExtractorResult
  ): Promise<void> {
    const response = await this.client.get(format.url);

    // Get content length for progress
    const contentLength = parseInt(
      response.headers.get('content-length') || '0',
      10
    );

    // Create write stream
    const { createWriteStream } = await import('node:fs');
    const { mkdir } = await import('node:fs/promises');
    const { dirname } = await import('node:path');

    // Ensure directory exists
    await mkdir(dirname(outputPath), { recursive: true });

    const writeStream = createWriteStream(outputPath);

    let downloadedBytes = 0;
    const startTime = Date.now();

    // Stream response using async iterator
    for await (const chunk of response) {
      writeStream.write(chunk);
      downloadedBytes += chunk.byteLength;

      if (this.progressCallback) {
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? downloadedBytes / elapsed : 0;

        this.progressCallback({
          downloadedSegments: 1,
          totalSegments: 1,
          downloadedBytes,
          elapsedMs: Date.now() - startTime,
          speed,
          eta: contentLength > 0 && speed > 0 ? (contentLength - downloadedBytes) / speed : undefined,
          percent: contentLength > 0 ? (downloadedBytes / contentLength) * 100 : undefined,
          title: info.title,
          format,
        });
      }
    }

    writeStream.end();
  }
}

/**
 * Create a video builder for the given URL
 */
export function createVideoBuilder(url: string, client: Client): VideoBuilder {
  return new VideoBuilder(url, client);
}

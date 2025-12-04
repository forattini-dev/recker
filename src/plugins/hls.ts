/**
 * HLS Plugin for Recker
 *
 * Provides HLS (HTTP Live Streaming) download capabilities with fluent API.
 * Supports both VOD and live streams with automatic segment tracking.
 *
 * @example
 * ```typescript
 * import { Client } from 'recker';
 *
 * const client = new Client();
 *
 * // Simple download (VOD)
 * await client.hls('https://example.com/stream.m3u8').download('./video.ts');
 *
 * // Live stream for 2 minutes
 * await client.hls('https://example.com/live.m3u8', { live: { duration: 120_000 } })
 *   .download('./live.ts');
 *
 * // Chunks mode
 * await client.hls(url, { mode: 'chunks' })
 *   .download((seg) => `./out/part-${seg.sequence}.ts`);
 *
 * // Stream segments for custom processing
 * for await (const segment of client.hls(url).stream()) {
 *   console.log(`Segment ${segment.sequence}: ${segment.data.byteLength} bytes`);
 * }
 * ```
 */

import type { Client } from '../core/client.js';
import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Writable } from 'node:stream';

// ============================================
// Types
// ============================================

export interface HlsVariant {
  url: string;
  bandwidth?: number;
  resolution?: string;
  codecs?: string;
  name?: string;
}

export interface HlsSegment {
  url: string;
  duration: number;
  sequence: number;
  key?: HlsKeyInfo;
  discontinuity?: boolean;
  programDateTime?: Date;
}

export interface HlsKeyInfo {
  method: 'NONE' | 'AES-128' | 'SAMPLE-AES';
  uri?: string;
  iv?: string;
}

export interface HlsPlaylist {
  segments: HlsSegment[];
  targetDuration: number;
  mediaSequence: number;
  endList: boolean;
  playlistType?: 'VOD' | 'EVENT';
  discontinuitySequence: number;
}

export interface HlsMasterPlaylist {
  variants: HlsVariant[];
  isMaster: true;
}

export interface SegmentData {
  sequence: number;
  duration: number;
  data: Uint8Array;
  url: string;
  downloadedAt: Date;
}

export interface HlsProgress {
  downloadedSegments: number;
  totalSegments?: number; // undefined for live
  downloadedBytes: number;
  currentSegment: number;
  isLive: boolean;
  elapsed: number;
}

export interface HlsOptions {
  /** Output mode: 'merge' concatenates all segments, 'chunks' saves separately */
  mode?: 'merge' | 'chunks';

  /** Output format. Only 'ts' supported without ffmpeg */
  format?: 'ts' | 'mp4' | 'mkv';

  /** Live stream options. true for infinite, or { duration: ms } for timed recording */
  live?: boolean | { duration: number };

  /** Quality selection for master playlists */
  quality?: 'highest' | 'lowest' | { bandwidth?: number; resolution?: string };

  /** Concurrent segment downloads */
  concurrency?: number;

  /** Callback for each downloaded segment */
  onSegment?: (segment: SegmentData) => void | Promise<void>;

  /** Progress callback */
  onProgress?: (progress: HlsProgress) => void;

  /** Error callback for non-fatal errors (e.g., temporary network issues in live mode) */
  onError?: (error: Error) => void;

  /** Custom headers for segment requests */
  headers?: Record<string, string>;
}

type DownloadDest = string | ((segment: HlsSegment) => string);

// ============================================
// Parser
// ============================================

function parseAttributes(line: string, prefix: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const content = line.substring(prefix.length);

  // Parse KEY=VALUE pairs, handling quoted values
  const regex = /([A-Z0-9-]+)=(?:"([^"]*)"|([^,]*))/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    attrs[match[1]] = match[2] ?? match[3];
  }

  return attrs;
}

function resolveUrl(url: string, baseUrl: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  try {
    const base = new URL(baseUrl);
    // Get directory path from base URL
    const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);
    return new URL(url, base.origin + basePath).toString();
  } catch {
    return url;
  }
}

function parseMasterPlaylist(content: string, baseUrl: string): HlsMasterPlaylist {
  const lines = content.split('\n');
  const variants: HlsVariant[] = [];
  let pendingVariant: Partial<HlsVariant> = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const attrs = parseAttributes(line, '#EXT-X-STREAM-INF:');
      pendingVariant = {
        bandwidth: attrs.BANDWIDTH ? parseInt(attrs.BANDWIDTH, 10) : undefined,
        resolution: attrs.RESOLUTION,
        codecs: attrs.CODECS,
        name: attrs.NAME,
      };
    } else if (!line.startsWith('#') && pendingVariant.bandwidth !== undefined) {
      variants.push({
        ...pendingVariant,
        url: resolveUrl(line, baseUrl),
      } as HlsVariant);
      pendingVariant = {};
    }
  }

  return { variants, isMaster: true };
}

function parseMediaPlaylist(content: string, baseUrl: string): HlsPlaylist {
  const lines = content.split('\n');
  const segments: HlsSegment[] = [];

  let targetDuration = 5;
  let mediaSequence = 0;
  let discontinuitySequence = 0;
  let endList = false;
  let playlistType: 'VOD' | 'EVENT' | undefined;

  let currentDuration = 0;
  let currentKey: HlsKeyInfo | undefined;
  let currentDiscontinuity = false;
  let currentProgramDateTime: Date | undefined;
  let segmentIndex = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      targetDuration = parseInt(line.split(':')[1], 10);
    } else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      mediaSequence = parseInt(line.split(':')[1], 10);
    } else if (line.startsWith('#EXT-X-DISCONTINUITY-SEQUENCE:')) {
      discontinuitySequence = parseInt(line.split(':')[1], 10);
    } else if (line.startsWith('#EXT-X-PLAYLIST-TYPE:')) {
      playlistType = line.split(':')[1] as 'VOD' | 'EVENT';
    } else if (line === '#EXT-X-ENDLIST') {
      endList = true;
    } else if (line === '#EXT-X-DISCONTINUITY') {
      currentDiscontinuity = true;
    } else if (line.startsWith('#EXT-X-PROGRAM-DATE-TIME:')) {
      currentProgramDateTime = new Date(line.split(':').slice(1).join(':'));
    } else if (line.startsWith('#EXT-X-KEY:')) {
      const attrs = parseAttributes(line, '#EXT-X-KEY:');
      if (attrs.METHOD === 'NONE') {
        currentKey = undefined;
      } else {
        currentKey = {
          method: attrs.METHOD as HlsKeyInfo['method'],
          uri: attrs.URI ? resolveUrl(attrs.URI, baseUrl) : undefined,
          iv: attrs.IV,
        };
      }
    } else if (line.startsWith('#EXTINF:')) {
      const durationStr = line.substring(8).split(',')[0];
      currentDuration = parseFloat(durationStr);
    } else if (!line.startsWith('#')) {
      segments.push({
        url: resolveUrl(line, baseUrl),
        duration: currentDuration,
        sequence: mediaSequence + segmentIndex,
        key: currentKey,
        discontinuity: currentDiscontinuity,
        programDateTime: currentProgramDateTime,
      });

      segmentIndex++;
      currentDiscontinuity = false;
      currentProgramDateTime = undefined;
    }
  }

  return {
    segments,
    targetDuration,
    mediaSequence,
    endList,
    playlistType,
    discontinuitySequence,
  };
}

function isMasterPlaylist(content: string): boolean {
  return content.includes('#EXT-X-STREAM-INF');
}

function selectVariant(
  variants: HlsVariant[],
  quality: HlsOptions['quality']
): HlsVariant {
  if (!variants.length) {
    throw new Error('No variants found in master playlist');
  }

  // Sort by bandwidth (ascending)
  const sorted = [...variants].sort((a, b) => (a.bandwidth ?? 0) - (b.bandwidth ?? 0));

  if (quality === 'lowest') {
    return sorted[0];
  }

  if (quality === 'highest' || quality === undefined) {
    return sorted[sorted.length - 1];
  }

  // Custom selection
  if (quality.resolution) {
    const match = variants.find((v) => v.resolution === quality.resolution);
    if (match) return match;
  }

  if (quality.bandwidth) {
    // Find closest bandwidth
    const target = quality.bandwidth;
    return sorted.reduce((prev, curr) => {
      const prevDiff = Math.abs((prev.bandwidth ?? 0) - target);
      const currDiff = Math.abs((curr.bandwidth ?? 0) - target);
      return currDiff < prevDiff ? curr : prev;
    });
  }

  // Fallback to highest
  return sorted[sorted.length - 1];
}

// ============================================
// HlsPromise - Fluent API
// ============================================

export class HlsPromise implements Promise<void> {
  private client: Client;
  private manifestUrl: string;
  private options: HlsOptions;

  // Tracking state for live streams
  private seenSequences = new Set<number>();
  private downloadedBytes = 0;
  private downloadedSegments = 0;
  private startTime = 0;
  private aborted = false;
  private abortController = new AbortController();

  constructor(client: Client, manifestUrl: string, options: HlsOptions = {}) {
    this.client = client;
    this.manifestUrl = manifestUrl;
    this.options = {
      mode: 'merge',
      format: 'ts',
      concurrency: 5,
      ...options,
    };

    // Validate format
    if (this.options.format !== 'ts') {
      throw new Error(
        `Format '${this.options.format}' requires ffmpeg. Use format: 'ts' or install ffmpeg.`
      );
    }
  }

  // ============================================
  // Promise interface
  // ============================================

  get [Symbol.toStringTag]() {
    return 'HlsPromise';
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    // Default behavior: throw error saying user needs to call .download() or .stream()
    return Promise.reject(
      new Error('HlsPromise requires .download(), .stream(), or .pipe() to execute')
    ).then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<void | TResult> {
    return this.then(null, onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<void> {
    return this.then(
      () => {
        onfinally?.();
      },
      () => {
        onfinally?.();
      }
    );
  }

  // ============================================
  // Control methods
  // ============================================

  /**
   * Cancel the HLS download
   */
  cancel(): void {
    this.aborted = true;
    this.abortController.abort();
  }

  // ============================================
  // Terminal methods
  // ============================================

  /**
   * Download HLS stream to file(s)
   *
   * @param dest - File path for merge mode, or function returning path for chunks mode
   *
   * @example
   * ```typescript
   * // Merge mode (default)
   * await client.hls(url).download('./video.ts');
   *
   * // Chunks mode with custom naming
   * await client.hls(url, { mode: 'chunks' })
   *   .download((seg) => `./segments/part-${seg.sequence.toString().padStart(5, '0')}.ts`);
   * ```
   */
  async download(dest: DownloadDest): Promise<void> {
    this.startTime = Date.now();

    // Resolve manifest (handle master playlist)
    const mediaPlaylistUrl = await this.resolveMediaPlaylist();

    if (this.options.mode === 'chunks') {
      await this.downloadChunks(mediaPlaylistUrl, dest);
    } else {
      if (typeof dest !== 'string') {
        throw new Error('Merge mode requires a string path, not a function');
      }
      await this.downloadMerged(mediaPlaylistUrl, dest);
    }
  }

  /**
   * Stream segments as AsyncIterator
   *
   * @example
   * ```typescript
   * for await (const segment of client.hls(url).stream()) {
   *   console.log(`Segment ${segment.sequence}: ${segment.data.byteLength} bytes`);
   *   await uploadToS3(segment.data);
   * }
   * ```
   */
  async *stream(): AsyncGenerator<SegmentData> {
    this.startTime = Date.now();
    const mediaPlaylistUrl = await this.resolveMediaPlaylist();
    const isLive = this.isLiveMode();
    const maxDuration = this.getMaxDuration();

    while (!this.aborted) {
      const playlist = await this.fetchMediaPlaylist(mediaPlaylistUrl);
      const newSegments = playlist.segments.filter(
        (s) => !this.seenSequences.has(s.sequence)
      );

      for (const segment of newSegments) {
        if (this.aborted) break;
        if (maxDuration && Date.now() - this.startTime > maxDuration) {
          return;
        }

        this.seenSequences.add(segment.sequence);

        const data = await this.downloadSegment(segment);
        const segmentData: SegmentData = {
          sequence: segment.sequence,
          duration: segment.duration,
          data,
          url: segment.url,
          downloadedAt: new Date(),
        };

        this.downloadedSegments++;
        this.downloadedBytes += data.byteLength;

        this.emitProgress(playlist, isLive);

        if (this.options.onSegment) {
          await this.options.onSegment(segmentData);
        }

        yield segmentData;
      }

      // Check stop conditions
      if (!isLive || playlist.endList) {
        break;
      }

      if (maxDuration && Date.now() - this.startTime > maxDuration) {
        break;
      }

      // Poll interval for live streams
      const pollInterval = Math.max(1000, (playlist.targetDuration * 1000) / 2);
      await this.sleep(pollInterval);
    }
  }

  /**
   * Pipe segments to a Writable stream
   *
   * @example
   * ```typescript
   * const output = fs.createWriteStream('./video.ts');
   * await client.hls(url).pipe(output);
   *
   * // Or to any writable (e.g., upload stream)
   * await client.hls(url).pipe(uploadStream);
   * ```
   */
  async pipe(writable: Writable | WriteStream): Promise<void> {
    try {
      for await (const segment of this.stream()) {
        const canContinue = writable.write(segment.data);
        if (!canContinue) {
          await new Promise<void>((resolve) => writable.once('drain', resolve));
        }
      }
    } finally {
      if ('end' in writable && typeof writable.end === 'function') {
        writable.end();
      }
    }
  }

  /**
   * Get playlist info without downloading
   *
   * @example
   * ```typescript
   * const info = await client.hls(url).info();
   * console.log(`Variants: ${info.variants?.length}`);
   * console.log(`Is live: ${!info.playlist?.endList}`);
   * ```
   */
  async info(): Promise<{
    master?: HlsMasterPlaylist;
    playlist?: HlsPlaylist;
    selectedVariant?: HlsVariant;
    isLive: boolean;
    totalDuration?: number;
  }> {
    const content = await this.client.get(this.manifestUrl).text();

    if (isMasterPlaylist(content)) {
      const master = parseMasterPlaylist(content, this.manifestUrl);
      const selectedVariant = selectVariant(master.variants, this.options.quality);
      const playlistContent = await this.client.get(selectedVariant.url).text();
      const playlist = parseMediaPlaylist(playlistContent, selectedVariant.url);

      const totalDuration = playlist.endList
        ? playlist.segments.reduce((sum, s) => sum + s.duration, 0)
        : undefined;

      return {
        master,
        playlist,
        selectedVariant,
        isLive: !playlist.endList,
        totalDuration,
      };
    }

    const playlist = parseMediaPlaylist(content, this.manifestUrl);
    const totalDuration = playlist.endList
      ? playlist.segments.reduce((sum, s) => sum + s.duration, 0)
      : undefined;

    return {
      playlist,
      isLive: !playlist.endList,
      totalDuration,
    };
  }

  // ============================================
  // Private helpers
  // ============================================

  private async resolveMediaPlaylist(): Promise<string> {
    const content = await this.client.get(this.manifestUrl).text();

    if (!isMasterPlaylist(content)) {
      return this.manifestUrl;
    }

    const master = parseMasterPlaylist(content, this.manifestUrl);
    const variant = selectVariant(master.variants, this.options.quality);

    return variant.url;
  }

  private async fetchMediaPlaylist(url: string): Promise<HlsPlaylist> {
    const content = await this.client.get(url).text();
    return parseMediaPlaylist(content, url);
  }

  private async downloadSegment(segment: HlsSegment): Promise<Uint8Array> {
    if (segment.key && segment.key.method !== 'NONE') {
      throw new Error(
        `Encrypted HLS (${segment.key.method}) requires ffmpeg. Use unencrypted streams or install ffmpeg.`
      );
    }

    const response = await this.client.get(segment.url, {
      headers: this.options.headers,
      signal: this.abortController.signal,
    });

    const blob = await response.blob();
    return new Uint8Array(await blob.arrayBuffer());
  }

  private async downloadMerged(playlistUrl: string, outputPath: string): Promise<void> {
    // Ensure output directory exists
    await mkdir(dirname(outputPath), { recursive: true });

    const output = createWriteStream(outputPath);

    try {
      await this.pipe(output);
    } catch (error) {
      output.destroy();
      throw error;
    }
  }

  private async downloadChunks(
    playlistUrl: string,
    dest: DownloadDest
  ): Promise<void> {
    const getPath =
      typeof dest === 'string'
        ? (seg: HlsSegment) => join(dest, `segment-${seg.sequence}.ts`)
        : dest;

    // Ensure base directory exists
    const baseDir = typeof dest === 'string' ? dest : dirname(getPath({ sequence: 0, duration: 0, url: '' }));
    await mkdir(baseDir, { recursive: true });

    for await (const segment of this.stream()) {
      const filePath = getPath({
        sequence: segment.sequence,
        duration: segment.duration,
        url: segment.url,
      });

      await mkdir(dirname(filePath), { recursive: true });
      const output = createWriteStream(filePath);

      await new Promise<void>((resolve, reject) => {
        output.write(segment.data, (err) => {
          if (err) reject(err);
          else {
            output.end();
            resolve();
          }
        });
      });
    }
  }

  private isLiveMode(): boolean {
    return this.options.live === true || typeof this.options.live === 'object';
  }

  private getMaxDuration(): number | undefined {
    if (typeof this.options.live === 'object' && this.options.live.duration) {
      return this.options.live.duration;
    }
    return undefined;
  }

  private emitProgress(playlist: HlsPlaylist, isLive: boolean): void {
    if (!this.options.onProgress) return;

    this.options.onProgress({
      downloadedSegments: this.downloadedSegments,
      totalSegments: isLive ? undefined : playlist.segments.length,
      downloadedBytes: this.downloadedBytes,
      currentSegment: Math.max(...this.seenSequences),
      isLive,
      elapsed: Date.now() - this.startTime,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, ms);
      // Allow abort to interrupt sleep
      this.abortController.signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
    });
  }
}

// ============================================
// Factory function (for standalone use)
// ============================================

/**
 * Create an HLS downloader
 *
 * @example
 * ```typescript
 * import { hls } from 'recker/plugins/hls';
 *
 * const downloader = hls(client, 'https://example.com/stream.m3u8');
 * await downloader.download('./video.ts');
 * ```
 */
export function hls(
  client: Client,
  manifestUrl: string,
  options: HlsOptions = {}
): HlsPromise {
  return new HlsPromise(client, manifestUrl, options);
}

// ============================================
// Re-exports
// ============================================

export type {
  HlsVariant as Variant,
  HlsSegment as Segment,
  HlsKeyInfo as KeyInfo,
};

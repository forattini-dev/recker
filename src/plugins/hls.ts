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
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Writable } from 'node:stream';
import { createDecipheriv } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

/**
 * Helper to fetch text content and auto-decompress gzip if needed
 * (Some CDNs ignore Accept-Encoding: identity)
 */
async function fetchText(
  client: Client,
  url: string,
  options: { signal?: AbortSignal; headers?: Record<string, string>; useCurl?: boolean }
): Promise<string> {
  const response = await client.get(url, {
    signal: options.signal,
    headers: options.headers,
    useCurl: options.useCurl,
  });

  // Get raw bytes
  const blob = await response.blob();
  const buffer = Buffer.from(await blob.arrayBuffer());

  // Check if content is gzip compressed
  // Gzip magic bytes: 0x1f 0x8b
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    try {
      const decompressed = gunzipSync(buffer);
      return decompressed.toString('utf-8');
    } catch {
      // Not actually gzip, return as-is
    }
  }

  return buffer.toString('utf-8');
}

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

export interface HlsByteRange {
  length: number;
  offset: number;
}

export interface HlsInitSegment {
  url: string;
  byteRange?: HlsByteRange;
}

export interface HlsSegment {
  url: string;
  duration: number;
  sequence: number;
  key?: HlsKeyInfo;
  discontinuity?: boolean;
  programDateTime?: Date;
  byteRange?: HlsByteRange;
  initSegment?: HlsInitSegment;
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

export interface HlsRetryOptions {
  /** Maximum retry attempts per segment/playlist fetch (default: 5 for live, 3 for VOD) */
  maxAttempts?: number;

  /** Initial delay in ms before first retry (default: 1000) */
  delay?: number;

  /** Maximum delay in ms (default: 30000) */
  maxDelay?: number;

  /** Backoff multiplier (default: 2) */
  backoff?: number;

  /** Add random jitter to prevent thundering herd (default: true) */
  jitter?: boolean;

  /** HTTP status codes to retry (default: [408, 429, 500, 502, 503, 504]) */
  statusCodes?: number[];
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

  /** Use curl transport to bypass TLS fingerprinting */
  useCurl?: boolean;

  /** Retry configuration for transient errors (critical for live streams) */
  retry?: HlsRetryOptions;

  /**
   * Maximum consecutive errors before giving up (default: 10 for live, 3 for VOD)
   * For live streams, individual segment failures are tolerated up to this limit
   */
  maxConsecutiveErrors?: number;
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

function parseByteRange(value: string, lastEnd = 0): HlsByteRange {
  const parts = value.split('@');
  const length = parseInt(parts[0], 10);
  const offset = parts[1] ? parseInt(parts[1], 10) : lastEnd;
  return { length, offset };
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
  let currentByteRange: HlsByteRange | undefined;
  let currentInitSegment: HlsInitSegment | undefined;
  let lastByteEnd = 0;
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
    } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
      // #EXT-X-BYTERANGE:length[@offset]
      const value = line.substring(17);
      currentByteRange = parseByteRange(value, lastByteEnd);
      lastByteEnd = currentByteRange.offset + currentByteRange.length;
    } else if (line.startsWith('#EXT-X-MAP:')) {
      // #EXT-X-MAP:URI="init.mp4"[,BYTERANGE="length@offset"]
      const attrs = parseAttributes(line, '#EXT-X-MAP:');
      currentInitSegment = {
        url: resolveUrl(attrs.URI, baseUrl),
        byteRange: attrs.BYTERANGE ? parseByteRange(attrs.BYTERANGE) : undefined,
      };
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
        byteRange: currentByteRange,
        initSegment: currentInitSegment,
      });

      // Update lastByteEnd for next segment if using byte ranges
      if (currentByteRange) {
        lastByteEnd = currentByteRange.offset + currentByteRange.length;
      }

      segmentIndex++;
      currentDiscontinuity = false;
      currentProgramDateTime = undefined;
      currentByteRange = undefined;
      // Note: initSegment persists until changed or discontinuity
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

  // AES-128 key cache (avoid re-fetching)
  private keyCache = new Map<string, Buffer>();

  // Init segment cache (fMP4 initialization data)
  private initSegmentCache = new Map<string, Buffer>();
  private initSegmentPrepended = new Set<string>();

  // Retry defaults based on mode
  private readonly defaultRetryStatusCodes = [403, 404, 408, 429, 500, 502, 503, 504];

  // Consecutive errors tracking
  private consecutiveErrors = 0;

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
    const concurrency = this.options.concurrency ?? 5;

    // Default poll interval (will be updated from playlist)
    let pollInterval = 2000;

    while (!this.aborted) {
      // Check consecutive errors limit before fetching
      if (this.consecutiveErrors >= this.getMaxConsecutiveErrors()) {
        throw new Error(
          `Too many consecutive errors (${this.consecutiveErrors}). ` +
          `Limit: ${this.getMaxConsecutiveErrors()}. Stopping download.`
        );
      }

      let playlist: HlsPlaylist;
      try {
        playlist = await this.fetchMediaPlaylist(mediaPlaylistUrl);
      } catch (err: any) {
        // For live streams, we can tolerate temporary playlist fetch failures
        if (isLive && this.consecutiveErrors < this.getMaxConsecutiveErrors()) {
          if (this.options.onError) {
            this.options.onError(new Error(`Playlist fetch failed: ${err.message}. Retrying...`));
          }
          await this.sleep(pollInterval);
          continue;
        }
        throw err;
      }

      // Update poll interval from playlist
      pollInterval = Math.max(1000, (playlist.targetDuration * 1000) / 2);

      const newSegments = playlist.segments.filter(
        (s) => !this.seenSequences.has(s.sequence)
      );

      // Mark all as seen immediately to avoid re-downloading on next poll
      for (const segment of newSegments) {
        this.seenSequences.add(segment.sequence);
      }

      // Download segments with concurrency, yielding in order
      if (newSegments.length > 0) {
        yield* this.downloadSegmentsConcurrent(newSegments, concurrency, playlist, isLive, maxDuration);
      }

      // Check stop conditions
      if (!isLive || playlist.endList) {
        break;
      }

      if (maxDuration && Date.now() - this.startTime > maxDuration) {
        break;
      }

      await this.sleep(pollInterval);
    }
  }

  /**
   * Download segments concurrently while maintaining order
   */
  private async *downloadSegmentsConcurrent(
    segments: HlsSegment[],
    concurrency: number,
    playlist: HlsPlaylist,
    isLive: boolean,
    maxDuration?: number
  ): AsyncGenerator<SegmentData> {
    // Results buffer: index -> data (filled out of order, yielded in order)
    // null means segment was skipped (failed after retries)
    const results = new Map<number, SegmentData | null>();
    const pending = new Map<number, Promise<{ index: number; data: SegmentData | null }>>();
    let nextToYield = 0;
    let nextToStart = 0;

    // Helper to start a download
    const startDownload = (index: number) => {
      const segment = segments[index];
      const promise = this.downloadSegment(segment).then((data) => ({
        index,
        data: data ? {
          sequence: segment.sequence,
          duration: segment.duration,
          data,
          url: segment.url,
          downloadedAt: new Date(),
        } as SegmentData : null,
      }));
      pending.set(index, promise);
    };

    // Fill initial pool
    while (nextToStart < segments.length && pending.size < concurrency) {
      startDownload(nextToStart++);
    }

    // Process until all segments are yielded
    while (nextToYield < segments.length) {
      if (this.aborted) break;
      if (maxDuration && Date.now() - this.startTime > maxDuration) {
        break;
      }

      // Check consecutive errors limit
      if (this.consecutiveErrors >= this.getMaxConsecutiveErrors()) {
        throw new Error(
          `Too many consecutive errors (${this.consecutiveErrors}). ` +
          `Limit: ${this.getMaxConsecutiveErrors()}. Stopping download.`
        );
      }

      // Wait for any download to complete
      if (pending.size > 0) {
        const completed = await Promise.race(pending.values());
        pending.delete(completed.index);
        results.set(completed.index, completed.data);

        // Start next download if available
        if (nextToStart < segments.length && pending.size < concurrency) {
          startDownload(nextToStart++);
        }
      }

      // Yield results in order (skip null/failed segments)
      while (results.has(nextToYield)) {
        const segmentData = results.get(nextToYield);
        results.delete(nextToYield);
        nextToYield++;

        // Skip null/undefined segments (failed downloads in live mode)
        if (!segmentData) {
          continue;
        }

        this.downloadedSegments++;
        this.downloadedBytes += segmentData.data.byteLength;

        this.emitProgress(playlist, isLive);

        if (this.options.onSegment) {
          await this.options.onSegment(segmentData);
        }

        yield segmentData;
      }
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
    // Use fetchText helper which auto-decompresses gzip
    const content = await fetchText(this.client, this.manifestUrl, {
      signal: this.abortController.signal,
      headers: this.options.headers,
      useCurl: this.options.useCurl,
    });

    if (isMasterPlaylist(content)) {
      const master = parseMasterPlaylist(content, this.manifestUrl);
      const selectedVariant = selectVariant(master.variants, this.options.quality);
      const playlistContent = await fetchText(this.client, selectedVariant.url, {
        signal: this.abortController.signal,
        headers: this.options.headers,
        useCurl: this.options.useCurl,
      });
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
    const headers = {
      ...this.options.headers,
    };

    // Use fetchText helper which auto-decompresses gzip
    const content = await fetchText(this.client, this.manifestUrl, {
      signal: this.abortController.signal,
      headers,
      useCurl: this.options.useCurl,
    });

    if (!isMasterPlaylist(content)) {
      return this.manifestUrl;
    }

    const master = parseMasterPlaylist(content, this.manifestUrl);
    const variant = selectVariant(master.variants, this.options.quality);

    return variant.url;
  }

  private async fetchMediaPlaylist(url: string): Promise<HlsPlaylist> {
    // Use retry logic for playlist fetches (critical for live streams)
    const content = await this.withRetry(
      async () => {
        return fetchText(this.client, url, {
          signal: this.abortController.signal,
          headers: this.options.headers,
          useCurl: this.options.useCurl,
        });
      },
      'Fetch playlist',
      false // Playlist fetch is critical, don't skip
    );

    if (!content) {
      throw new Error('Failed to fetch media playlist');
    }

    return parseMediaPlaylist(content, url);
  }

  // ============================================
  // AES-128 Decryption
  // ============================================

  /**
   * Fetch and cache encryption key
   */
  private async getKey(uri: string): Promise<Buffer> {
    if (this.keyCache.has(uri)) {
      return this.keyCache.get(uri)!;
    }

    const response = await this.client.get(uri, {
      headers: this.options.headers,
      signal: this.abortController.signal,
      useCurl: this.options.useCurl,
    });

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const key = Buffer.from(arrayBuffer);

    if (key.length !== 16) {
      throw new Error(`Invalid AES-128 key length: ${key.length} bytes (expected 16)`);
    }

    this.keyCache.set(uri, key);
    return key;
  }

  /**
   * Generate IV from media sequence number (HLS default)
   * IV = 8 bytes zeros + 8 bytes sequence number (big-endian)
   */
  private generateIV(mediaSequence: number): Buffer {
    const iv = Buffer.alloc(16);
    iv.writeBigUInt64BE(BigInt(mediaSequence), 8);
    return iv;
  }

  /**
   * Parse IV from hex string (0x prefix optional)
   */
  private parseIV(ivString: string): Buffer {
    const hex = ivString.startsWith('0x') || ivString.startsWith('0X')
      ? ivString.slice(2)
      : ivString;
    return Buffer.from(hex.padStart(32, '0'), 'hex');
  }

  /**
   * Decrypt segment data using AES-128-CBC
   */
  private decryptSegment(data: Buffer, key: Buffer, iv: Buffer): Buffer {
    const decipher = createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(true); // PKCS#7 padding
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  // ============================================
  // Segment Download
  // ============================================

  /**
   * Fetch init segment (fMP4 initialization)
   */
  private async getInitSegment(init: HlsInitSegment): Promise<Buffer> {
    const cacheKey = `${init.url}:${init.byteRange?.offset ?? 0}:${init.byteRange?.length ?? 0}`;

    if (this.initSegmentCache.has(cacheKey)) {
      return this.initSegmentCache.get(cacheKey)!;
    }

    const headers: Record<string, string> = { ...this.options.headers };

    // Add Range header if byte range specified
    if (init.byteRange) {
      const { offset, length } = init.byteRange;
      headers['Range'] = `bytes=${offset}-${offset + length - 1}`;
    }

    const response = await this.client.get(init.url, {
      headers,
      signal: this.abortController.signal,
      useCurl: this.options.useCurl,
    });

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const data = Buffer.from(arrayBuffer);

    this.initSegmentCache.set(cacheKey, data);
    return data;
  }

  private async downloadSegment(segment: HlsSegment): Promise<Uint8Array | null> {
    // Use retry logic for segment downloads - skipOnFail=true for live streams
    const result = await this.withRetry(
      async () => {
        const headers: Record<string, string> = { ...this.options.headers };

        // Add Range header if byte range specified
        if (segment.byteRange) {
          const { offset, length } = segment.byteRange;
          headers['Range'] = `bytes=${offset}-${offset + length - 1}`;
        }

        const response = await this.client.get(segment.url, {
          headers,
          signal: this.abortController.signal,
          useCurl: this.options.useCurl,
        });

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        let data: Buffer = Buffer.from(arrayBuffer);

        // Handle AES-128 decryption
        if (segment.key && segment.key.method === 'AES-128') {
          if (!segment.key.uri) {
            throw new Error('AES-128 encryption specified but no key URI provided');
          }

          const key = await this.getKey(segment.key.uri);
          const iv = segment.key.iv
            ? this.parseIV(segment.key.iv)
            : this.generateIV(segment.sequence);

          data = this.decryptSegment(data, key, iv);
        } else if (segment.key && segment.key.method === 'SAMPLE-AES') {
          throw new Error(
            'SAMPLE-AES encryption is not supported. This typically requires DRM handling.'
          );
        }

        // Prepend init segment for fMP4 (only once per init segment)
        if (segment.initSegment) {
          const initKey = `${segment.initSegment.url}:${segment.initSegment.byteRange?.offset ?? 0}`;

          if (!this.initSegmentPrepended.has(initKey)) {
            const initData = await this.getInitSegment(segment.initSegment);
            data = Buffer.concat([initData, data]);
            this.initSegmentPrepended.add(initKey);
          }
        }

        return new Uint8Array(data);
      },
      `Segment ${segment.sequence}`,
      true // Skip failed segments for live streams
    );

    return result;
  }

  private async downloadMerged(playlistUrl: string, outputPath: string): Promise<void> {
    // Ensure output directory exists
    await mkdir(dirname(outputPath), { recursive: true });

    // Use append mode ('a') to concatenate if file exists
    // This allows resuming/continuing recordings to the same file
    const output = createWriteStream(outputPath, { flags: 'a' });

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

  /**
   * Get retry configuration with sensible defaults
   */
  private getRetryConfig(): Required<HlsRetryOptions> {
    const isLive = this.isLiveMode();
    const userConfig = this.options.retry || {};

    return {
      maxAttempts: userConfig.maxAttempts ?? (isLive ? 5 : 3),
      delay: userConfig.delay ?? 1000,
      maxDelay: userConfig.maxDelay ?? 30000,
      backoff: userConfig.backoff ?? 2,
      jitter: userConfig.jitter ?? true,
      statusCodes: userConfig.statusCodes ?? this.defaultRetryStatusCodes,
    };
  }

  /**
   * Get maximum consecutive errors allowed
   */
  private getMaxConsecutiveErrors(): number {
    const isLive = this.isLiveMode();
    return this.options.maxConsecutiveErrors ?? (isLive ? 10 : 3);
  }

  /**
   * Calculate delay with exponential backoff and optional jitter
   */
  private calculateRetryDelay(attempt: number, config: Required<HlsRetryOptions>): number {
    // Exponential backoff: delay * backoff^attempt
    let delay = config.delay * Math.pow(config.backoff, attempt);

    // Cap at max delay
    delay = Math.min(delay, config.maxDelay);

    // Add jitter (±25%) to prevent thundering herd
    if (config.jitter) {
      const jitterRange = delay * 0.25;
      delay = delay - jitterRange + (Math.random() * jitterRange * 2);
    }

    return Math.round(delay);
  }

  /**
   * Check if an error is retryable based on status code
   */
  private isRetryableError(error: any, config: Required<HlsRetryOptions>): boolean {
    // Network errors are always retryable
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return true;
    }

    // Check HTTP status code
    const status = error.status || error.statusCode || (error.response?.status);
    if (status && config.statusCodes.includes(status)) {
      return true;
    }

    return false;
  }

  /**
   * Execute an async function with retry logic
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    context: string,
    skipOnFail = false
  ): Promise<T | null> {
    const config = this.getRetryConfig();
    const isLive = this.isLiveMode();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= config.maxAttempts; attempt++) {
      if (this.aborted) {
        throw new Error('Aborted');
      }

      try {
        const result = await fn();

        // Success - reset consecutive error counter
        this.consecutiveErrors = 0;

        return result;
      } catch (error: any) {
        lastError = error;

        // Check if this error is retryable
        if (!this.isRetryableError(error, config)) {
          // Not retryable - emit error and throw/skip
          if (this.options.onError) {
            this.options.onError(error);
          }

          if (skipOnFail && isLive) {
            // For live streams, we can skip failed segments
            this.consecutiveErrors++;
            return null;
          }

          throw error;
        }

        // Retryable error
        if (attempt < config.maxAttempts) {
          const delay = this.calculateRetryDelay(attempt, config);

          // Emit non-fatal error notification
          if (this.options.onError) {
            const retryError = new Error(
              `${context}: ${error.message}. Retrying in ${delay}ms (attempt ${attempt + 1}/${config.maxAttempts})`
            );
            (retryError as any).cause = error;
            (retryError as any).isRetry = true;
            this.options.onError(retryError);
          }

          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    this.consecutiveErrors++;

    if (this.options.onError && lastError) {
      this.options.onError(lastError);
    }

    // For live streams, allow skipping if configured
    if (skipOnFail && isLive) {
      return null;
    }

    throw lastError || new Error(`${context}: All retry attempts failed`);
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

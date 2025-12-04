/**
 * Mock HLS Server
 *
 * Simulates an HLS streaming server for testing VOD and Live streams.
 * Provides realistic playlist generation with sliding window, segment timing, and more.
 *
 * @example
 * ```typescript
 * import { MockHlsServer } from 'recker/testing';
 *
 * // VOD mode
 * const vod = await MockHlsServer.create({
 *   mode: 'vod',
 *   segmentCount: 10,
 *   segmentDuration: 6
 * });
 *
 * // Live mode with sliding window
 * const live = await MockHlsServer.create({
 *   mode: 'live',
 *   windowSize: 3,
 *   segmentDuration: 2,
 *   realtime: true  // Add segments in real-time
 * });
 *
 * // Use with Recker client
 * const client = createClient({ transport: live.transport });
 * await client.hls(live.manifestUrl).download('./output.ts');
 *
 * // End the live stream
 * live.endStream();
 * ```
 */

import { EventEmitter } from 'node:events';
import type { Transport } from '../types/index.js';

// ============================================
// Types
// ============================================

export interface MockHlsServerOptions {
  /**
   * Server mode
   * - 'vod': Pre-recorded content with all segments available
   * - 'live': Streaming content with sliding window
   * - 'event': Live with no sliding window (segments accumulate)
   * @default 'vod'
   */
  mode?: 'vod' | 'live' | 'event';

  /**
   * Duration of each segment in seconds
   * @default 6
   */
  segmentDuration?: number;

  /**
   * Number of segments (VOD mode)
   * @default 10
   */
  segmentCount?: number;

  /**
   * Number of segments in sliding window (live mode)
   * @default 3
   */
  windowSize?: number;

  /**
   * Starting media sequence number
   * @default 0
   */
  startSequence?: number;

  /**
   * Add segments in real-time (live mode)
   * If false, new segments appear on each playlist fetch
   * @default false
   */
  realtime?: boolean;

  /**
   * Interval to add new segments in realtime mode (ms)
   * @default segmentDuration * 1000
   */
  segmentInterval?: number;

  /**
   * Enable master playlist with multiple qualities
   * @default false
   */
  multiQuality?: boolean;

  /**
   * Quality variants for master playlist
   */
  variants?: MockHlsVariant[];

  /**
   * Simulate encryption
   * @default false
   */
  encrypted?: boolean;

  /**
   * Base URL for manifest and segments
   * @default 'http://mock-hls-server'
   */
  baseUrl?: string;

  /**
   * Response delay in ms (simulate network latency)
   * @default 0
   */
  delay?: number;

  /**
   * Segment data generator
   * @default generates random bytes
   */
  segmentDataGenerator?: (sequence: number, variant?: string) => Uint8Array;
}

export interface MockHlsVariant {
  name: string;
  bandwidth: number;
  resolution?: string;
  codecs?: string;
}

export interface MockHlsSegment {
  sequence: number;
  duration: number;
  data: Uint8Array;
  addedAt: number;
  programDateTime?: Date;
  discontinuity?: boolean;
}

export interface MockHlsStats {
  playlistRequests: number;
  segmentRequests: number;
  segmentsServed: number;
  bytesServed: number;
  requestLog: Array<{ url: string; timestamp: number }>;
}

// ============================================
// Default variants
// ============================================

const DEFAULT_VARIANTS: MockHlsVariant[] = [
  { name: '360p', bandwidth: 800_000, resolution: '640x360', codecs: 'avc1.4d401e,mp4a.40.2' },
  { name: '480p', bandwidth: 1_400_000, resolution: '854x480', codecs: 'avc1.4d401e,mp4a.40.2' },
  { name: '720p', bandwidth: 2_800_000, resolution: '1280x720', codecs: 'avc1.4d401f,mp4a.40.2' },
  { name: '1080p', bandwidth: 5_000_000, resolution: '1920x1080', codecs: 'avc1.640028,mp4a.40.2' },
];

// ============================================
// MockHlsServer
// ============================================

export class MockHlsServer extends EventEmitter {
  private options: Required<MockHlsServerOptions>;
  private segments: Map<string, MockHlsSegment[]> = new Map();
  private currentSequence: number;
  private ended = false;
  private started = false;
  private realtimeInterval: NodeJS.Timeout | null = null;
  private startTime = 0;
  private stats: MockHlsStats = {
    playlistRequests: 0,
    segmentRequests: 0,
    segmentsServed: 0,
    bytesServed: 0,
    requestLog: [],
  };

  constructor(options: MockHlsServerOptions = {}) {
    super();

    const segmentDuration = options.segmentDuration ?? 6;

    this.options = {
      mode: 'vod',
      segmentDuration,
      segmentCount: 10,
      windowSize: 3,
      startSequence: 0,
      realtime: false,
      segmentInterval: segmentDuration * 1000,
      multiQuality: false,
      variants: options.variants ?? DEFAULT_VARIANTS,
      encrypted: false,
      baseUrl: 'http://mock-hls-server',
      delay: 0,
      segmentDataGenerator: options.segmentDataGenerator ?? this.defaultSegmentGenerator.bind(this),
      ...options,
    };

    this.currentSequence = this.options.startSequence;
  }

  // ============================================
  // Properties
  // ============================================

  get isRunning(): boolean {
    return this.started && !this.ended;
  }

  get isEnded(): boolean {
    return this.ended;
  }

  get manifestUrl(): string {
    return this.options.multiQuality
      ? `${this.options.baseUrl}/master.m3u8`
      : `${this.options.baseUrl}/playlist.m3u8`;
  }

  get segmentCount(): number {
    const variantKey = this.options.multiQuality ? this.options.variants[0].name : 'default';
    return this.segments.get(variantKey)?.length ?? 0;
  }

  get statistics(): MockHlsStats {
    return { ...this.stats };
  }

  /**
   * Transport for use with Recker client
   */
  get transport(): Transport {
    return {
      dispatch: async (req) => this.handleRequest(req),
    };
  }

  // ============================================
  // Lifecycle
  // ============================================

  /**
   * Start the mock server
   */
  async start(): Promise<void> {
    if (this.started) {
      throw new Error('Server already started');
    }

    this.started = true;
    this.startTime = Date.now();

    // Initialize segments
    if (this.options.mode === 'vod') {
      this.initializeVodSegments();
    } else {
      this.initializeLiveSegments();

      if (this.options.realtime) {
        this.startRealtimeSegmentGeneration();
      }
    }

    this.emit('start');
  }

  /**
   * Stop the mock server
   */
  async stop(): Promise<void> {
    if (!this.started) return;

    if (this.realtimeInterval) {
      clearInterval(this.realtimeInterval);
      this.realtimeInterval = null;
    }

    this.started = false;
    this.emit('stop');
  }

  /**
   * End the live stream (adds #EXT-X-ENDLIST)
   */
  endStream(): void {
    if (this.options.mode === 'vod') return;

    this.ended = true;

    if (this.realtimeInterval) {
      clearInterval(this.realtimeInterval);
      this.realtimeInterval = null;
    }

    this.emit('ended');
  }

  /**
   * Reset the server state
   */
  reset(): void {
    this.segments.clear();
    this.currentSequence = this.options.startSequence;
    this.ended = false;
    this.stats = {
      playlistRequests: 0,
      segmentRequests: 0,
      segmentsServed: 0,
      bytesServed: 0,
      requestLog: [],
    };

    if (this.started) {
      if (this.options.mode === 'vod') {
        this.initializeVodSegments();
      } else {
        this.initializeLiveSegments();
      }
    }

    this.emit('reset');
  }

  // ============================================
  // Segment Management
  // ============================================

  /**
   * Manually add a segment
   */
  addSegment(variant: string = 'default', options: Partial<MockHlsSegment> = {}): MockHlsSegment {
    const variantSegments = this.segments.get(variant) ?? [];

    const segment: MockHlsSegment = {
      sequence: this.currentSequence,
      duration: this.options.segmentDuration,
      data: options.data ?? this.options.segmentDataGenerator(this.currentSequence, variant),
      addedAt: Date.now(),
      programDateTime: options.programDateTime,
      discontinuity: options.discontinuity,
      ...options,
    };

    variantSegments.push(segment);
    this.segments.set(variant, variantSegments);
    this.currentSequence++;

    // Apply sliding window in live mode
    if (this.options.mode === 'live' && variantSegments.length > this.options.windowSize) {
      variantSegments.shift();
    }

    this.emit('segment', segment, variant);
    return segment;
  }

  /**
   * Add a discontinuity marker
   */
  addDiscontinuity(variant: string = 'default'): void {
    this.addSegment(variant, { discontinuity: true });
  }

  /**
   * Get all segments for a variant
   */
  getSegments(variant: string = 'default'): MockHlsSegment[] {
    return [...(this.segments.get(variant) ?? [])];
  }

  // ============================================
  // Request Handling
  // ============================================

  private async handleRequest(req: any): Promise<any> {
    const url = req.url;

    // Log request
    this.stats.requestLog.push({ url, timestamp: Date.now() });

    // Apply delay
    if (this.options.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delay));
    }

    // Route request
    if (url.includes('master.m3u8')) {
      return this.handleMasterPlaylist();
    }

    if (url.includes('.m3u8')) {
      return this.handleMediaPlaylist(url);
    }

    if (url.includes('.ts')) {
      return this.handleSegment(url);
    }

    if (url.includes('.key')) {
      return this.handleKey();
    }

    throw new Error(`Unknown request: ${url}`);
  }

  private handleMasterPlaylist(): any {
    this.stats.playlistRequests++;

    const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];

    for (const variant of this.options.variants) {
      const attrs = [
        `BANDWIDTH=${variant.bandwidth}`,
        variant.resolution ? `RESOLUTION=${variant.resolution}` : null,
        variant.codecs ? `CODECS="${variant.codecs}"` : null,
        `NAME="${variant.name}"`,
      ]
        .filter(Boolean)
        .join(',');

      lines.push(`#EXT-X-STREAM-INF:${attrs}`);
      lines.push(`${variant.name}/playlist.m3u8`);
    }

    const body = lines.join('\n');

    return this.createResponse(body, 'application/vnd.apple.mpegurl');
  }

  private handleMediaPlaylist(url: string): any {
    this.stats.playlistRequests++;

    // Determine variant
    let variant = 'default';
    if (this.options.multiQuality) {
      const match = url.match(/\/(\w+)\/playlist\.m3u8/);
      variant = match?.[1] ?? this.options.variants[0].name;
    }

    // In non-realtime live mode, add segment on each fetch
    if (this.options.mode === 'live' && !this.options.realtime && !this.ended) {
      this.addSegmentToAllVariants();
    }

    const segments = this.segments.get(variant) ?? [];
    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      `#EXT-X-TARGETDURATION:${Math.ceil(this.options.segmentDuration)}`,
    ];

    if (this.options.mode !== 'vod') {
      const mediaSequence = segments.length > 0 ? segments[0].sequence : 0;
      lines.push(`#EXT-X-MEDIA-SEQUENCE:${mediaSequence}`);
    }

    if (this.options.mode === 'event') {
      lines.push('#EXT-X-PLAYLIST-TYPE:EVENT');
    } else if (this.options.mode === 'vod') {
      lines.push('#EXT-X-PLAYLIST-TYPE:VOD');
    }

    // Add encryption key if enabled
    if (this.options.encrypted) {
      lines.push(`#EXT-X-KEY:METHOD=AES-128,URI="${this.options.baseUrl}/key.key",IV=0x00000000000000000000000000000001`);
    }

    // Add segments
    for (const segment of segments) {
      if (segment.discontinuity) {
        lines.push('#EXT-X-DISCONTINUITY');
      }

      if (segment.programDateTime) {
        lines.push(`#EXT-X-PROGRAM-DATE-TIME:${segment.programDateTime.toISOString()}`);
      }

      lines.push(`#EXTINF:${segment.duration.toFixed(3)},`);

      const segmentPath = this.options.multiQuality
        ? `${variant}/segment${segment.sequence}.ts`
        : `segment${segment.sequence}.ts`;
      lines.push(segmentPath);
    }

    // Add ENDLIST for VOD or ended live
    if (this.options.mode === 'vod' || this.ended) {
      lines.push('#EXT-X-ENDLIST');
    }

    const body = lines.join('\n');

    return this.createResponse(body, 'application/vnd.apple.mpegurl');
  }

  private handleSegment(url: string): any {
    this.stats.segmentRequests++;

    // Extract path from URL
    const urlPath = url.replace(/^https?:\/\/[^/]+/, '');

    // Parse segment info from path (e.g., /segment0.ts or /720p/segment0.ts)
    const match = urlPath.match(/(?:\/(\w+))?\/segment(\d+)\.ts/);
    if (!match) {
      return this.createResponse('Not Found', 'text/plain', 404);
    }

    const variant = match[1] ?? 'default';
    const sequence = parseInt(match[2], 10);

    const segments = this.segments.get(variant) ?? [];
    const segment = segments.find((s) => s.sequence === sequence);

    if (!segment) {
      return this.createResponse('Not Found', 'text/plain', 404);
    }

    this.stats.segmentsServed++;
    this.stats.bytesServed += segment.data.byteLength;

    this.emit('segmentServed', segment, variant);

    return this.createResponse(segment.data, 'video/mp2t');
  }

  private handleKey(): any {
    // Return a dummy AES key (16 bytes)
    const key = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      key[i] = i;
    }
    return this.createResponse(key, 'application/octet-stream');
  }

  private createResponse(body: string | Uint8Array, contentType: string, status = 200): any {
    const isText = typeof body === 'string';
    const blobData = isText ? body : new Uint8Array(body);

    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (isText ? body : new TextDecoder().decode(body as Uint8Array)),
      blob: async () => new Blob([blobData]),
      arrayBuffer: async () => (isText ? new TextEncoder().encode(body).buffer : (body as Uint8Array).buffer),
      headers: new Headers({
        'content-type': contentType,
        'content-length': String(isText ? body.length : (body as Uint8Array).byteLength),
      }),
    };
  }

  // ============================================
  // Private helpers
  // ============================================

  private initializeVodSegments(): void {
    const variants = this.options.multiQuality
      ? this.options.variants.map((v) => v.name)
      : ['default'];

    for (const variant of variants) {
      this.segments.set(variant, []);
      for (let i = 0; i < this.options.segmentCount; i++) {
        const segment: MockHlsSegment = {
          sequence: this.currentSequence,
          duration: this.options.segmentDuration,
          data: this.options.segmentDataGenerator(this.currentSequence, variant),
          addedAt: Date.now(),
        };
        this.segments.get(variant)!.push(segment);
        this.currentSequence++;
      }
      // Reset sequence for next variant in VOD
      if (this.options.multiQuality) {
        this.currentSequence = this.options.startSequence;
      }
    }

    // Set final sequence for consistency
    this.currentSequence = this.options.startSequence + this.options.segmentCount;
  }

  private initializeLiveSegments(): void {
    const variants = this.options.multiQuality
      ? this.options.variants.map((v) => v.name)
      : ['default'];

    for (const variant of variants) {
      this.segments.set(variant, []);
      // Start with windowSize segments
      for (let i = 0; i < this.options.windowSize; i++) {
        const segment: MockHlsSegment = {
          sequence: this.currentSequence + i,
          duration: this.options.segmentDuration,
          data: this.options.segmentDataGenerator(this.currentSequence + i, variant),
          addedAt: Date.now(),
        };
        this.segments.get(variant)!.push(segment);
      }
    }

    this.currentSequence += this.options.windowSize;
  }

  private addSegmentToAllVariants(): void {
    const variants = this.options.multiQuality
      ? this.options.variants.map((v) => v.name)
      : ['default'];

    for (const variant of variants) {
      const variantSegments = this.segments.get(variant) ?? [];

      const segment: MockHlsSegment = {
        sequence: this.currentSequence,
        duration: this.options.segmentDuration,
        data: this.options.segmentDataGenerator(this.currentSequence, variant),
        addedAt: Date.now(),
      };

      variantSegments.push(segment);

      // Apply sliding window in live mode
      if (this.options.mode === 'live' && variantSegments.length > this.options.windowSize) {
        variantSegments.shift();
      }

      this.segments.set(variant, variantSegments);
      this.emit('segment', segment, variant);
    }

    this.currentSequence++;
  }

  private startRealtimeSegmentGeneration(): void {
    this.realtimeInterval = setInterval(() => {
      if (this.ended) return;
      this.addSegmentToAllVariants();
    }, this.options.segmentInterval);
  }

  private defaultSegmentGenerator(sequence: number, _variant?: string): Uint8Array {
    // Generate pseudo-random but deterministic data based on sequence
    const size = 1024 + (sequence % 512); // Variable size 1-1.5KB
    const data = new Uint8Array(size);

    for (let i = 0; i < size; i++) {
      data[i] = (sequence * 17 + i * 13) % 256;
    }

    return data;
  }

  // ============================================
  // Static factory
  // ============================================

  /**
   * Create and start a mock HLS server
   */
  static async create(options: MockHlsServerOptions = {}): Promise<MockHlsServer> {
    const server = new MockHlsServer(options);
    await server.start();
    return server;
  }
}

// ============================================
// Helper functions
// ============================================

/**
 * Create a simple VOD mock server
 */
export async function createMockHlsVod(
  segmentCount = 10,
  options: Omit<MockHlsServerOptions, 'mode' | 'segmentCount'> = {}
): Promise<MockHlsServer> {
  return MockHlsServer.create({
    mode: 'vod',
    segmentCount,
    ...options,
  });
}

/**
 * Create a live stream mock server
 */
export async function createMockHlsLive(
  options: Omit<MockHlsServerOptions, 'mode'> = {}
): Promise<MockHlsServer> {
  return MockHlsServer.create({
    mode: 'live',
    realtime: true,
    segmentDuration: 2,
    windowSize: 3,
    ...options,
  });
}

/**
 * Create a multi-quality mock server
 */
export async function createMockHlsMultiQuality(
  options: Omit<MockHlsServerOptions, 'multiQuality'> = {}
): Promise<MockHlsServer> {
  return MockHlsServer.create({
    multiQuality: true,
    ...options,
  });
}

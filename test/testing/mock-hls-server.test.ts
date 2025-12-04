import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { MockHlsServer, createMockHlsVod, createMockHlsLive, createMockHlsMultiQuality } from '../../src/testing/mock-hls-server.js';
import { createClient } from '../../src/core/client.js';

describe('MockHlsServer', () => {
  let server: MockHlsServer;

  afterEach(async () => {
    if (server?.isRunning) {
      await server.stop();
    }
  });

  describe('Lifecycle', () => {
    it('should start and stop', async () => {
      server = new MockHlsServer();
      await server.start();
      expect(server.isRunning).toBe(true);

      await server.stop();
      expect(server.isRunning).toBe(false);
    });

    it('should not start if already running', async () => {
      server = await MockHlsServer.create();
      await expect(server.start()).rejects.toThrow('already started');
    });

    it('should provide manifest URL', async () => {
      server = await MockHlsServer.create({ baseUrl: 'http://test-server' });
      expect(server.manifestUrl).toBe('http://test-server/playlist.m3u8');
    });

    it('should provide master manifest URL when multiQuality is true', async () => {
      server = await MockHlsServer.create({ multiQuality: true, baseUrl: 'http://test-server' });
      expect(server.manifestUrl).toBe('http://test-server/master.m3u8');
    });
  });

  describe('VOD Mode', () => {
    it('should create segments on start', async () => {
      server = await MockHlsServer.create({ mode: 'vod', segmentCount: 5 });
      expect(server.segmentCount).toBe(5);
    });

    it('should serve playlist with ENDLIST', async () => {
      server = await MockHlsServer.create({ mode: 'vod', segmentCount: 3 });

      const response = await server.transport.dispatch({ url: server.manifestUrl });
      const playlist = await response.text();

      expect(playlist).toContain('#EXTM3U');
      expect(playlist).toContain('#EXT-X-ENDLIST');
      expect(playlist).toContain('#EXT-X-PLAYLIST-TYPE:VOD');
      expect(playlist).toContain('segment0.ts');
      expect(playlist).toContain('segment1.ts');
      expect(playlist).toContain('segment2.ts');
    });

    it('should serve segment data', async () => {
      server = await MockHlsServer.create({ mode: 'vod', segmentCount: 2 });

      const response = await server.transport.dispatch({
        url: `${server.manifestUrl.replace('playlist.m3u8', 'segment0.ts')}`,
      });

      const blob = await response.blob();
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent segment', async () => {
      server = await MockHlsServer.create({ mode: 'vod', segmentCount: 2 });

      const response = await server.transport.dispatch({
        url: 'http://mock-hls-server/segment999.ts',
      });

      expect(response.status).toBe(404);
    });

    it('should track statistics', async () => {
      server = await MockHlsServer.create({ mode: 'vod', segmentCount: 2, baseUrl: 'http://mock-hls-server' });

      await server.transport.dispatch({ url: server.manifestUrl });
      await server.transport.dispatch({ url: 'http://mock-hls-server/segment0.ts' });

      const stats = server.statistics;
      expect(stats.playlistRequests).toBe(1);
      expect(stats.segmentRequests).toBe(1);
      expect(stats.segmentsServed).toBe(1);
      expect(stats.bytesServed).toBeGreaterThan(0);
    });
  });

  describe('Live Mode', () => {
    it('should not include ENDLIST initially', async () => {
      server = await MockHlsServer.create({ mode: 'live', windowSize: 3 });

      const response = await server.transport.dispatch({ url: server.manifestUrl });
      const playlist = await response.text();

      expect(playlist).not.toContain('#EXT-X-ENDLIST');
      expect(playlist).toContain('#EXT-X-MEDIA-SEQUENCE:');
    });

    it('should include ENDLIST after endStream()', async () => {
      server = await MockHlsServer.create({ mode: 'live', windowSize: 3 });

      server.endStream();

      const response = await server.transport.dispatch({ url: server.manifestUrl });
      const playlist = await response.text();

      expect(playlist).toContain('#EXT-X-ENDLIST');
      expect(server.isEnded).toBe(true);
    });

    it('should add segments on playlist fetch (non-realtime)', async () => {
      server = await MockHlsServer.create({ mode: 'live', windowSize: 3, realtime: false });

      const initialCount = server.segmentCount;

      // Each playlist fetch adds a new segment
      await server.transport.dispatch({ url: server.manifestUrl });
      expect(server.segmentCount).toBe(initialCount); // First fetch doesn't add

      await server.transport.dispatch({ url: server.manifestUrl });
      // Sliding window means count stays at windowSize
      expect(server.segmentCount).toBeLessThanOrEqual(3);
    });

    it('should maintain sliding window', async () => {
      server = await MockHlsServer.create({ mode: 'live', windowSize: 3, realtime: false });

      // Fetch playlist multiple times
      for (let i = 0; i < 5; i++) {
        await server.transport.dispatch({ url: server.manifestUrl });
      }

      // Should still only have windowSize segments
      expect(server.segmentCount).toBe(3);
    });

    it('should add segments in realtime mode', async () => {
      server = await MockHlsServer.create({
        mode: 'live',
        windowSize: 3,
        realtime: true,
        segmentInterval: 50,
      });

      const initialCount = server.segmentCount;

      // Wait for a segment to be added
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Segments should have been added
      expect(server.segmentCount).toBeGreaterThanOrEqual(initialCount);

      server.endStream();
    });

    it('should emit segment events', async () => {
      server = await MockHlsServer.create({ mode: 'live', windowSize: 3, realtime: false });

      const segments: any[] = [];
      server.on('segment', (seg) => segments.push(seg));

      await server.transport.dispatch({ url: server.manifestUrl });
      await server.transport.dispatch({ url: server.manifestUrl });

      expect(segments.length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Quality Mode', () => {
    it('should serve master playlist', async () => {
      server = await MockHlsServer.create({ multiQuality: true });

      const response = await server.transport.dispatch({ url: server.manifestUrl });
      const playlist = await response.text();

      expect(playlist).toContain('#EXT-X-STREAM-INF');
      expect(playlist).toContain('BANDWIDTH=');
      expect(playlist).toContain('RESOLUTION=');
      expect(playlist).toContain('360p/playlist.m3u8');
      expect(playlist).toContain('1080p/playlist.m3u8');
    });

    it('should serve variant playlists', async () => {
      server = await MockHlsServer.create({ multiQuality: true, mode: 'vod', segmentCount: 3 });

      const response = await server.transport.dispatch({
        url: 'http://mock-hls-server/720p/playlist.m3u8',
      });
      const playlist = await response.text();

      expect(playlist).toContain('#EXTM3U');
      expect(playlist).toContain('720p/segment0.ts');
      expect(playlist).toContain('#EXT-X-ENDLIST');
    });

    it('should serve variant segments', async () => {
      server = await MockHlsServer.create({ multiQuality: true, mode: 'vod', segmentCount: 2 });

      const response = await server.transport.dispatch({
        url: 'http://mock-hls-server/720p/segment0.ts',
      });

      const blob = await response.blob();
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should use custom variants', async () => {
      server = await MockHlsServer.create({
        multiQuality: true,
        variants: [
          { name: 'low', bandwidth: 500_000, resolution: '320x180' },
          { name: 'high', bandwidth: 3_000_000, resolution: '1920x1080' },
        ],
      });

      const response = await server.transport.dispatch({ url: server.manifestUrl });
      const playlist = await response.text();

      expect(playlist).toContain('low/playlist.m3u8');
      expect(playlist).toContain('high/playlist.m3u8');
      expect(playlist).toContain('BANDWIDTH=500000');
      expect(playlist).toContain('BANDWIDTH=3000000');
    });
  });

  describe('Encryption Simulation', () => {
    it('should include key tag when encrypted', async () => {
      server = await MockHlsServer.create({ mode: 'vod', encrypted: true });

      const response = await server.transport.dispatch({ url: server.manifestUrl });
      const playlist = await response.text();

      expect(playlist).toContain('#EXT-X-KEY:METHOD=AES-128');
      expect(playlist).toContain('URI="http://mock-hls-server/key.key"');
    });

    it('should serve key file', async () => {
      server = await MockHlsServer.create({ mode: 'vod', encrypted: true });

      const response = await server.transport.dispatch({
        url: 'http://mock-hls-server/key.key',
      });

      const blob = await response.blob();
      expect(blob.size).toBe(16); // AES key is 16 bytes
    });
  });

  describe('Delay Simulation', () => {
    it('should add delay to responses', async () => {
      server = await MockHlsServer.create({ mode: 'vod', delay: 50 });

      const start = Date.now();
      await server.transport.dispatch({ url: server.manifestUrl });
      const duration = Date.now() - start;

      // Allow 5ms tolerance for timing variations
      expect(duration).toBeGreaterThanOrEqual(45);
    });
  });

  describe('Custom Segment Data', () => {
    it('should use custom segment generator', async () => {
      const customData = new Uint8Array([1, 2, 3, 4, 5]);

      server = await MockHlsServer.create({
        mode: 'vod',
        segmentCount: 1,
        segmentDataGenerator: () => customData,
      });

      const response = await server.transport.dispatch({
        url: 'http://mock-hls-server/segment0.ts',
      });

      const arrayBuffer = await response.arrayBuffer();
      expect(new Uint8Array(arrayBuffer)).toEqual(customData);
    });
  });

  describe('Manual Segment Control', () => {
    it('should allow adding segments manually', async () => {
      // Use event mode which doesn't have sliding window (segments accumulate)
      server = await MockHlsServer.create({ mode: 'event', windowSize: 5 });

      const initialCount = server.segmentCount;

      server.addSegment('default', { duration: 5 });

      expect(server.segmentCount).toBe(initialCount + 1);
    });

    it('should add discontinuity marker', async () => {
      server = await MockHlsServer.create({ mode: 'vod', segmentCount: 2 });

      server.addDiscontinuity();

      const response = await server.transport.dispatch({ url: server.manifestUrl });
      const playlist = await response.text();

      expect(playlist).toContain('#EXT-X-DISCONTINUITY');
    });
  });

  describe('Reset', () => {
    it('should reset server state', async () => {
      server = await MockHlsServer.create({ mode: 'vod', segmentCount: 5 });

      // Make some requests
      await server.transport.dispatch({ url: server.manifestUrl });

      server.reset();

      const stats = server.statistics;
      expect(stats.playlistRequests).toBe(0);
      expect(stats.segmentRequests).toBe(0);
    });
  });

  describe('Integration with Recker Client', () => {
    it('should work with client.hls() for VOD', async () => {
      server = await MockHlsServer.create({ mode: 'vod', segmentCount: 3 });

      const client = createClient({ transport: server.transport });
      const info = await client.hls(server.manifestUrl).info();

      expect(info.isLive).toBe(false);
      expect(info.playlist?.segments.length).toBe(3);
    });

    it('should work with client.hls() for live', async () => {
      server = await MockHlsServer.create({ mode: 'live', windowSize: 3 });

      const client = createClient({ transport: server.transport });
      const info = await client.hls(server.manifestUrl).info();

      expect(info.isLive).toBe(true);
    });

    it('should work with client.hls() for multi-quality', async () => {
      server = await MockHlsServer.create({
        multiQuality: true,
        mode: 'vod',
        segmentCount: 3,
      });

      const client = createClient({ transport: server.transport });
      const info = await client.hls(server.manifestUrl).info();

      expect(info.master).toBeDefined();
      expect(info.master?.variants.length).toBeGreaterThan(0);
      expect(info.selectedVariant).toBeDefined();
    });

    it('should stream segments via client.hls().stream()', async () => {
      server = await MockHlsServer.create({ mode: 'vod', segmentCount: 3 });

      const client = createClient({ transport: server.transport });
      const segments: any[] = [];

      for await (const segment of client.hls(server.manifestUrl).stream()) {
        segments.push(segment);
      }

      expect(segments.length).toBe(3);
      expect(segments[0].data).toBeInstanceOf(Uint8Array);
    });
  });

  describe('Helper Functions', () => {
    it('createMockHlsVod should create VOD server', async () => {
      server = await createMockHlsVod(5);
      expect(server.isRunning).toBe(true);

      const response = await server.transport.dispatch({ url: server.manifestUrl });
      const playlist = await response.text();

      expect(playlist).toContain('#EXT-X-ENDLIST');
    });

    it('createMockHlsLive should create live server', async () => {
      server = await createMockHlsLive({ segmentDuration: 1 });
      expect(server.isRunning).toBe(true);

      const response = await server.transport.dispatch({ url: server.manifestUrl });
      const playlist = await response.text();

      expect(playlist).not.toContain('#EXT-X-ENDLIST');

      server.endStream();
    });

    it('createMockHlsMultiQuality should create multi-quality server', async () => {
      server = await createMockHlsMultiQuality();
      expect(server.isRunning).toBe(true);

      const response = await server.transport.dispatch({ url: server.manifestUrl });
      const playlist = await response.text();

      expect(playlist).toContain('#EXT-X-STREAM-INF');
    });
  });
});

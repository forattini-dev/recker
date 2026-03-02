import { describe, it, expect, afterEach } from 'vitest';
import { MockHlsServer, createMockHlsServer, createMockHlsVod, createMockHlsLive } from 'raffel/testing';

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
      expect(server.port).toBeGreaterThan(0);

      await server.stop();
      expect(server.isRunning).toBe(false);
    });

    it('should provide master URL', async () => {
      server = await createMockHlsServer();
      expect(server.masterUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/master\.m3u8$/);
    });
  });

  describe('VOD Mode', () => {
    it('should serve master playlist', async () => {
      server = await createMockHlsServer({ mode: 'vod', segmentCount: 3 });

      const response = await fetch(server.masterUrl);
      const playlist = await response.text();

      expect(response.ok).toBe(true);
      expect(playlist).toContain('#EXTM3U');
    });

    it('should serve variant playlist with ENDLIST', async () => {
      server = await createMockHlsServer({ mode: 'vod', segmentCount: 3 });

      // Single variant → /v0.m3u8
      const response = await fetch(`${server.url}/v0.m3u8`);
      const playlist = await response.text();

      expect(response.ok).toBe(true);
      expect(playlist).toContain('#EXT-X-ENDLIST');
    });

    it('should serve segment data', async () => {
      server = await createMockHlsServer({ mode: 'vod', segmentCount: 3 });

      // Single variant segments are /v0_0.ts, /v0_1.ts etc.
      const response = await fetch(`${server.url}/v0_0.ts`);

      expect(response.ok).toBe(true);
      const data = await response.arrayBuffer();
      expect(data.byteLength).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent variant', async () => {
      server = await createMockHlsServer({ mode: 'vod', segmentCount: 2 });

      const response = await fetch(`${server.url}/v99.m3u8`);

      expect(response.status).toBe(404);
    });

    it('should track statistics', async () => {
      server = await createMockHlsServer({ mode: 'vod', segmentCount: 2 });

      await fetch(server.masterUrl);
      await fetch(`${server.url}/v0.m3u8`);
      await fetch(`${server.url}/v0_0.ts`);

      const stats = server.statistics;
      expect(stats.playlistFetches).toBeGreaterThanOrEqual(1);
      expect(stats.segmentFetches).toBe(1);
      expect(stats.totalBytesServed).toBeGreaterThan(0);
    });
  });

  describe('Live Mode', () => {
    it('should not include ENDLIST initially', async () => {
      server = await createMockHlsServer({ mode: 'live', segmentCount: 3 });

      const response = await fetch(`${server.url}/v0.m3u8`);
      const playlist = await response.text();

      expect(playlist).not.toContain('#EXT-X-ENDLIST');
      expect(playlist).toContain('#EXT-X-MEDIA-SEQUENCE:');
    });

    it('should advance sequence', async () => {
      server = await createMockHlsServer({ mode: 'live', segmentCount: 3 });

      const before = await fetch(`${server.url}/v0.m3u8`).then(r => r.text());
      server.advance();
      const after = await fetch(`${server.url}/v0.m3u8`).then(r => r.text());

      // Media sequence should have advanced
      expect(before).not.toBe(after);
    });
  });

  describe('Multi-Variant Mode', () => {
    it('should serve master playlist with multiple variants', async () => {
      server = await createMockHlsServer({
        variants: [
          { bandwidth: 500_000, resolution: '320x180' },
          { bandwidth: 1_500_000, resolution: '1280x720' },
        ],
      });

      const response = await fetch(server.masterUrl);
      const playlist = await response.text();

      expect(playlist).toContain('#EXT-X-STREAM-INF');
      expect(playlist).toContain('BANDWIDTH=500000');
      expect(playlist).toContain('BANDWIDTH=1500000');
    });
  });

  describe('Helper Functions', () => {
    it('createMockHlsVod should create VOD server', async () => {
      server = await createMockHlsVod();
      expect(server.isRunning).toBe(true);

      const response = await fetch(`${server.url}/v0.m3u8`);
      const playlist = await response.text();

      expect(playlist).toContain('#EXT-X-ENDLIST');
    });

    it('createMockHlsLive should create live server', async () => {
      server = await createMockHlsLive();
      expect(server.isRunning).toBe(true);

      const response = await fetch(`${server.url}/v0.m3u8`);
      const playlist = await response.text();

      expect(playlist).not.toContain('#EXT-X-ENDLIST');
    });
  });
});

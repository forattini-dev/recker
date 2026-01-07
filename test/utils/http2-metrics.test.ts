import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  Http2MetricsCollector,
  getGlobalHttp2Metrics,
  resetGlobalHttp2Metrics,
  createHttp2MetricsHooks,
} from '../../src/utils/http2-metrics.js';
import type { Http2SessionInfo, Http2StreamInfo, Http2FlowControlInfo } from '../../src/types/index.js';

describe('HTTP/2 Metrics', () => {
  let collector: Http2MetricsCollector;

  beforeEach(() => {
    collector = new Http2MetricsCollector();
  });

  describe('Http2MetricsCollector', () => {
    describe('Session metrics', () => {
      it('should track session connect events', () => {
        const info: Http2SessionInfo = {
          origin: 'https://example.com',
          event: 'connect',
          maxConcurrentStreams: 100,
          activeStreams: 0,
        };

        collector.recordSession(info);

        const metrics = collector.getOriginMetrics('https://example.com');
        expect(metrics).toBeDefined();
        expect(metrics!.sessions.total).toBe(1);
        expect(metrics!.sessions.active).toBe(1);
      });

      it('should track session close events', () => {
        collector.recordSession({
          origin: 'https://example.com',
          event: 'connect',
        });

        collector.recordSession({
          origin: 'https://example.com',
          event: 'close',
          duration: 5000,
        });

        const metrics = collector.getOriginMetrics('https://example.com');
        expect(metrics!.sessions.active).toBe(0);
        expect(metrics!.sessions.avgDuration).toBe(5000);
      });

      it('should track session errors', () => {
        collector.recordSession({
          origin: 'https://example.com',
          event: 'connect',
        });

        collector.recordSession({
          origin: 'https://example.com',
          event: 'error',
          error: 'Connection reset',
        });

        const metrics = collector.getOriginMetrics('https://example.com');
        expect(metrics!.sessions.failed).toBe(1);
        expect(metrics!.sessions.active).toBe(0);
      });

      it('should track GOAWAY events', () => {
        collector.recordSession({
          origin: 'https://example.com',
          event: 'connect',
        });

        collector.recordSession({
          origin: 'https://example.com',
          event: 'goaway',
          goawayCode: 0,
          lastStreamId: 5,
        });

        const metrics = collector.getOriginMetrics('https://example.com');
        expect(metrics!.sessions.failed).toBe(1);
      });

      it('should store settings from session events', () => {
        collector.recordSession({
          origin: 'https://example.com',
          event: 'settings',
          localSettings: { maxConcurrentStreams: 100, initialWindowSize: 65535 },
          remoteSettings: { maxConcurrentStreams: 200, initialWindowSize: 131072 },
        });

        const metrics = collector.getOriginMetrics('https://example.com');
        expect(metrics!.settings?.local?.maxConcurrentStreams).toBe(100);
        expect(metrics!.settings?.remote?.maxConcurrentStreams).toBe(200);
      });
    });

    describe('Stream metrics', () => {
      it('should track stream open events', () => {
        const info: Http2StreamInfo = {
          streamId: 1,
          origin: 'https://example.com',
          event: 'open',
          state: 'open',
        };

        collector.recordStream(info);

        const metrics = collector.getOriginMetrics('https://example.com');
        expect(metrics!.streams.total).toBe(1);
        expect(metrics!.streams.active).toBe(1);
      });

      it('should track stream close events', () => {
        collector.recordStream({
          streamId: 1,
          origin: 'https://example.com',
          event: 'open',
          state: 'open',
        });

        collector.recordStream({
          streamId: 1,
          origin: 'https://example.com',
          event: 'close',
          state: 'closed',
          duration: 100,
        });

        const metrics = collector.getOriginMetrics('https://example.com');
        expect(metrics!.streams.active).toBe(0);
        expect(metrics!.streams.avgDuration).toBe(100);
      });

      it('should track stream errors', () => {
        collector.recordStream({
          streamId: 1,
          origin: 'https://example.com',
          event: 'open',
        });

        collector.recordStream({
          streamId: 1,
          origin: 'https://example.com',
          event: 'error',
          errorCode: 'REFUSED_STREAM',
        });

        const metrics = collector.getOriginMetrics('https://example.com');
        expect(metrics!.streams.failed).toBe(1);
        expect(metrics!.streams.active).toBe(0);
      });

      it('should track data transfer on streams', () => {
        collector.recordStream({
          streamId: 1,
          origin: 'https://example.com',
          event: 'open',
        });

        collector.recordStream({
          streamId: 1,
          origin: 'https://example.com',
          event: 'data',
          bytesSent: 1000,
          bytesReceived: 5000,
        });

        // Data events update internal state but metrics show stream counts
        const metrics = collector.getOriginMetrics('https://example.com');
        expect(metrics!.streams.active).toBe(1);
      });

      it('should track pushed streams', () => {
        collector.recordStream({
          streamId: 2, // Even ID = server push
          origin: 'https://example.com',
          event: 'open',
          pushed: true,
        });

        const metrics = collector.getOriginMetrics('https://example.com');
        expect(metrics!.streams.total).toBe(1);
      });
    });

    describe('Flow control metrics', () => {
      it('should track window update events', () => {
        const info: Http2FlowControlInfo = {
          streamId: 0,
          origin: 'https://example.com',
          event: 'window-update',
          windowSize: 65535,
          delta: 16384,
        };

        collector.recordFlowControl(info);

        const metrics = collector.getOriginMetrics('https://example.com');
        expect(metrics!.flowControl.windowUpdates).toBe(1);
      });

      it('should track blocked events', () => {
        collector.recordFlowControl({
          streamId: 1,
          origin: 'https://example.com',
          event: 'blocked',
          windowSize: 0,
        });

        const metrics = collector.getOriginMetrics('https://example.com');
        expect(metrics!.flowControl.blockedCount).toBe(1);
      });

      it('should track unblocked events with duration', () => {
        collector.recordFlowControl({
          streamId: 1,
          origin: 'https://example.com',
          event: 'blocked',
          windowSize: 0,
        });

        collector.recordFlowControl({
          streamId: 1,
          origin: 'https://example.com',
          event: 'unblocked',
          windowSize: 16384,
          blockedDuration: 50,
        });

        const metrics = collector.getOriginMetrics('https://example.com');
        expect(metrics!.flowControl.totalBlockedTime).toBe(50);
      });
    });

    describe('Summary and aggregation', () => {
      it('should provide global summary', () => {
        collector.recordSession({ origin: 'https://a.com', event: 'connect' });
        collector.recordSession({ origin: 'https://b.com', event: 'connect' });
        collector.recordStream({ streamId: 1, origin: 'https://a.com', event: 'open' });
        collector.recordStream({ streamId: 1, origin: 'https://b.com', event: 'open' });
        collector.recordStream({ streamId: 3, origin: 'https://a.com', event: 'open' });

        const summary = collector.getSummary();
        expect(summary.totals.sessions).toBe(2);
        expect(summary.totals.activeSessions).toBe(2);
        expect(summary.totals.streams).toBe(3);
        expect(summary.totals.activeStreams).toBe(3);
        expect(summary.origins.size).toBe(2);
      });

      it('should count errors in summary', () => {
        collector.recordSession({ origin: 'https://a.com', event: 'connect' });
        collector.recordSession({ origin: 'https://a.com', event: 'error' });
        collector.recordStream({ streamId: 1, origin: 'https://a.com', event: 'open' });
        collector.recordStream({ streamId: 1, origin: 'https://a.com', event: 'error' });

        const summary = collector.getSummary();
        expect(summary.totals.errors).toBe(2);
      });

      it('should get top origins by activity', () => {
        collector.recordStream({ streamId: 1, origin: 'https://a.com', event: 'open' });
        collector.recordStream({ streamId: 1, origin: 'https://b.com', event: 'open' });
        collector.recordStream({ streamId: 3, origin: 'https://b.com', event: 'open' });
        collector.recordStream({ streamId: 5, origin: 'https://b.com', event: 'open' });

        const top = collector.getTopOrigins(2);
        expect(top[0].origin).toBe('https://b.com');
        expect(top[0].streams.total).toBe(3);
      });
    });

    describe('Cleanup', () => {
      it('should reset all metrics', () => {
        collector.recordSession({ origin: 'https://a.com', event: 'connect' });
        collector.recordStream({ streamId: 1, origin: 'https://a.com', event: 'open' });

        collector.reset();

        const summary = collector.getSummary();
        expect(summary.origins.size).toBe(0);
        expect(summary.totals.sessions).toBe(0);
      });

      it('should prune stale origins', () => {
        collector.recordSession({ origin: 'https://old.com', event: 'connect' });
        collector.recordSession({ origin: 'https://old.com', event: 'close' });

        // Force lastActivity to be old
        const metrics = collector.getOriginMetrics('https://old.com');
        if (metrics) {
          (metrics as any).lastActivity = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
        }

        const pruned = collector.pruneStale(60 * 60 * 1000); // 1 hour max age
        expect(pruned).toBe(1);
        expect(collector.getOriginMetrics('https://old.com')).toBeUndefined();
      });

      it('should not prune origins with active sessions', () => {
        collector.recordSession({ origin: 'https://active.com', event: 'connect' });

        // Force lastActivity to be old
        const metrics = collector.getOriginMetrics('https://active.com');
        if (metrics) {
          (metrics as any).lastActivity = Date.now() - 2 * 60 * 60 * 1000;
        }

        const pruned = collector.pruneStale(60 * 60 * 1000);
        expect(pruned).toBe(0); // Should not prune because session is active
      });
    });
  });

  describe('Global metrics', () => {
    afterEach(() => {
      resetGlobalHttp2Metrics();
    });

    it('should provide global singleton', () => {
      const global1 = getGlobalHttp2Metrics();
      const global2 = getGlobalHttp2Metrics();
      expect(global1).toBe(global2);
    });

    it('should reset global metrics', () => {
      const global1 = getGlobalHttp2Metrics();
      global1.recordSession({ origin: 'https://test.com', event: 'connect' });

      resetGlobalHttp2Metrics();

      const global2 = getGlobalHttp2Metrics();
      expect(global2).not.toBe(global1);
      expect(global2.getSummary().origins.size).toBe(0);
    });
  });

  describe('createHttp2MetricsHooks', () => {
    it('should create hooks that record to collector', () => {
      const hooks = createHttp2MetricsHooks(collector);

      hooks.onHttp2Session[0]({ origin: 'https://test.com', event: 'connect' });
      hooks.onHttp2Stream[0]({ streamId: 1, origin: 'https://test.com', event: 'open' });
      hooks.onHttp2FlowControl[0]({ streamId: 0, origin: 'https://test.com', event: 'window-update', windowSize: 65535 });

      const metrics = collector.getOriginMetrics('https://test.com');
      expect(metrics!.sessions.total).toBe(1);
      expect(metrics!.streams.total).toBe(1);
      expect(metrics!.flowControl.windowUpdates).toBe(1);
    });

    it('should use global collector by default', () => {
      const hooks = createHttp2MetricsHooks();
      hooks.onHttp2Session[0]({ origin: 'https://global.com', event: 'connect' });

      const globalMetrics = getGlobalHttp2Metrics().getOriginMetrics('https://global.com');
      expect(globalMetrics!.sessions.total).toBe(1);

      resetGlobalHttp2Metrics();
    });
  });

  describe('Exports', () => {
    it('should be importable from main entry', async () => {
      const {
        Http2MetricsCollector: ImportedCollector,
        getGlobalHttp2Metrics: importedGet,
        createHttp2MetricsHooks: importedCreate,
      } = await import('../../src/index.js');

      expect(ImportedCollector).toBeDefined();
      expect(typeof importedGet).toBe('function');
      expect(typeof importedCreate).toBe('function');
    }, 30000);
  });
});

/**
 * HTTP/2 Metrics Collector
 *
 * Aggregates session and stream-level metrics for HTTP/2 connections.
 * Useful for monitoring connection health, detecting issues, and optimizing performance.
 */

import type { Http2SessionInfo, Http2StreamInfo, Http2FlowControlInfo, HTTP2Settings } from '../types/index.js';

/**
 * Per-origin HTTP/2 metrics
 */
export interface Http2OriginMetrics {
  origin: string;
  sessions: {
    total: number;
    active: number;
    failed: number;
    avgDuration: number;
  };
  streams: {
    total: number;
    active: number;
    failed: number;
    avgDuration: number;
  };
  flowControl: {
    windowUpdates: number;
    blockedCount: number;
    totalBlockedTime: number;
  };
  settings?: {
    local?: HTTP2Settings;
    remote?: HTTP2Settings;
  };
  lastActivity: number;
}

/**
 * Global HTTP/2 metrics summary
 */
export interface Http2MetricsSummary {
  origins: Map<string, Http2OriginMetrics>;
  totals: {
    sessions: number;
    activeSessions: number;
    streams: number;
    activeStreams: number;
    errors: number;
  };
  uptime: number;
}

interface SessionState {
  origin: string;
  startTime: number;
  streamCount: number;
  activeStreams: number;
  maxConcurrentStreams?: number;
}

interface StreamState {
  origin: string;
  startTime: number;
  bytesSent: number;
  bytesReceived: number;
}

/**
 * HTTP/2 Metrics Collector
 *
 * Tracks session and stream metrics across origins.
 * Thread-safe and designed for low overhead.
 */
export class Http2MetricsCollector {
  private origins = new Map<string, Http2OriginMetrics>();
  private sessions = new Map<string, SessionState>(); // sessionKey -> state
  private streams = new Map<string, StreamState>(); // streamKey -> state
  private startTime = Date.now();
  private maxOrigins: number;

  constructor(options: { maxOrigins?: number } = {}) {
    this.maxOrigins = options.maxOrigins ?? 1000;
  }

  /**
   * Record an HTTP/2 session event
   */
  recordSession(info: Http2SessionInfo): void {
    const metrics = this.getOrCreateOrigin(info.origin);
    const sessionKey = `${info.origin}:${Date.now()}`;

    switch (info.event) {
      case 'connect':
        metrics.sessions.total++;
        metrics.sessions.active++;
        this.sessions.set(sessionKey, {
          origin: info.origin,
          startTime: Date.now(),
          streamCount: 0,
          activeStreams: 0,
          maxConcurrentStreams: info.maxConcurrentStreams,
        });
        if (info.localSettings) metrics.settings = { ...metrics.settings, local: info.localSettings };
        if (info.remoteSettings) metrics.settings = { ...metrics.settings, remote: info.remoteSettings };
        break;

      case 'settings':
        if (info.localSettings) metrics.settings = { ...metrics.settings, local: info.localSettings };
        if (info.remoteSettings) metrics.settings = { ...metrics.settings, remote: info.remoteSettings };
        break;

      case 'close':
        metrics.sessions.active = Math.max(0, metrics.sessions.active - 1);
        if (info.duration) {
          // Update rolling average
          const n = metrics.sessions.total;
          metrics.sessions.avgDuration =
            (metrics.sessions.avgDuration * (n - 1) + info.duration) / n;
        }
        break;

      case 'goaway':
      case 'error':
        metrics.sessions.failed++;
        metrics.sessions.active = Math.max(0, metrics.sessions.active - 1);
        break;
    }

    metrics.lastActivity = Date.now();
  }

  /**
   * Record an HTTP/2 stream event
   */
  recordStream(info: Http2StreamInfo): void {
    const metrics = this.getOrCreateOrigin(info.origin);
    const streamKey = `${info.origin}:${info.streamId}`;

    switch (info.event) {
      case 'open':
        metrics.streams.total++;
        metrics.streams.active++;
        this.streams.set(streamKey, {
          origin: info.origin,
          startTime: Date.now(),
          bytesSent: 0,
          bytesReceived: 0,
        });
        break;

      case 'data':
        const dataState = this.streams.get(streamKey);
        if (dataState) {
          if (info.bytesSent) dataState.bytesSent += info.bytesSent;
          if (info.bytesReceived) dataState.bytesReceived += info.bytesReceived;
        }
        break;

      case 'close':
        metrics.streams.active = Math.max(0, metrics.streams.active - 1);
        if (info.duration) {
          const n = metrics.streams.total;
          metrics.streams.avgDuration =
            (metrics.streams.avgDuration * (n - 1) + info.duration) / n;
        }
        this.streams.delete(streamKey);
        break;

      case 'error':
        metrics.streams.failed++;
        metrics.streams.active = Math.max(0, metrics.streams.active - 1);
        this.streams.delete(streamKey);
        break;
    }

    metrics.lastActivity = Date.now();
  }

  /**
   * Record an HTTP/2 flow control event
   */
  recordFlowControl(info: Http2FlowControlInfo): void {
    const metrics = this.getOrCreateOrigin(info.origin);

    switch (info.event) {
      case 'window-update':
        metrics.flowControl.windowUpdates++;
        break;

      case 'blocked':
        metrics.flowControl.blockedCount++;
        break;

      case 'unblocked':
        if (info.blockedDuration) {
          metrics.flowControl.totalBlockedTime += info.blockedDuration;
        }
        break;
    }

    metrics.lastActivity = Date.now();
  }

  /**
   * Get metrics for a specific origin
   */
  getOriginMetrics(origin: string): Http2OriginMetrics | undefined {
    return this.origins.get(origin);
  }

  /**
   * Get global metrics summary
   */
  getSummary(): Http2MetricsSummary {
    let totalSessions = 0;
    let activeSessions = 0;
    let totalStreams = 0;
    let activeStreams = 0;
    let errors = 0;

    for (const metrics of this.origins.values()) {
      totalSessions += metrics.sessions.total;
      activeSessions += metrics.sessions.active;
      totalStreams += metrics.streams.total;
      activeStreams += metrics.streams.active;
      errors += metrics.sessions.failed + metrics.streams.failed;
    }

    return {
      origins: new Map(this.origins),
      totals: {
        sessions: totalSessions,
        activeSessions,
        streams: totalStreams,
        activeStreams,
        errors,
      },
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Get top origins by activity
   */
  getTopOrigins(n: number = 10): Http2OriginMetrics[] {
    return Array.from(this.origins.values())
      .sort((a, b) => b.streams.total - a.streams.total)
      .slice(0, n);
  }

  /**
   * Clear all metrics
   */
  reset(): void {
    this.origins.clear();
    this.sessions.clear();
    this.streams.clear();
    this.startTime = Date.now();
  }

  /**
   * Remove stale origins (no activity for specified duration)
   */
  pruneStale(maxAge: number = 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAge;
    let pruned = 0;

    for (const [origin, metrics] of this.origins) {
      if (metrics.sessions.active === 0 &&
          metrics.streams.active === 0 &&
          metrics.lastActivity < cutoff) {
        this.origins.delete(origin);
        pruned++;
      }
    }

    return pruned;
  }

  private getOrCreateOrigin(origin: string): Http2OriginMetrics {
    let metrics = this.origins.get(origin);
    if (!metrics) {
      // Prune if at capacity
      if (this.origins.size >= this.maxOrigins) {
        this.pruneStale();
        // If still at capacity, remove oldest inactive
        if (this.origins.size >= this.maxOrigins) {
          const oldest = Array.from(this.origins.entries())
            .filter(([, m]) => m.sessions.active === 0 && m.streams.active === 0)
            .sort((a, b) => a[1].lastActivity - b[1].lastActivity)[0];
          if (oldest) this.origins.delete(oldest[0]);
        }
      }

      metrics = {
        origin,
        sessions: { total: 0, active: 0, failed: 0, avgDuration: 0 },
        streams: { total: 0, active: 0, failed: 0, avgDuration: 0 },
        flowControl: { windowUpdates: 0, blockedCount: 0, totalBlockedTime: 0 },
        lastActivity: Date.now(),
      };
      this.origins.set(origin, metrics);
    }
    return metrics;
  }
}

// Global singleton instance
let globalCollector: Http2MetricsCollector | null = null;

/**
 * Get the global HTTP/2 metrics collector
 */
export function getGlobalHttp2Metrics(): Http2MetricsCollector {
  if (!globalCollector) {
    globalCollector = new Http2MetricsCollector();
  }
  return globalCollector;
}

/**
 * Reset the global HTTP/2 metrics collector
 */
export function resetGlobalHttp2Metrics(): void {
  if (globalCollector) {
    globalCollector.reset();
  }
  globalCollector = null;
}

/**
 * Create hooks that feed into the metrics collector
 */
export function createHttp2MetricsHooks(collector?: Http2MetricsCollector) {
  const c = collector ?? getGlobalHttp2Metrics();

  return {
    onHttp2Session: [(info: Http2SessionInfo) => c.recordSession(info)],
    onHttp2Stream: [(info: Http2StreamInfo) => c.recordStream(info)],
    onHttp2FlowControl: [(info: Http2FlowControlInfo) => c.recordFlowControl(info)],
  };
}

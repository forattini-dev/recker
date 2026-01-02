/**
 * useProxy - Proxy Server State Management
 *
 * Tracks proxy requests, responses, stats, and provides filtering/navigation.
 * Integrates with ProxyPanel for real-time monitoring.
 */

import { createSignal } from 'tuiuiu.js';

// =============================================================================
// Types
// =============================================================================

export interface ProxyRequestEntry {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  targetHost: string;
  targetPort: number;
  isHttps: boolean;
  clientIp: string;
  headers: Record<string, string>;
  body?: Buffer;

  // Response data (filled when response arrives)
  statusCode?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: Buffer;
  latency?: number;
  size?: number;

  // Error info
  error?: {
    type: string;
    message: string;
  };
}

export interface ProxyStats {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  bytesIn: number;
  bytesOut: number;
  avgLatency: number;
  requestsPerSecond: number;
  activeConnections: number;
  byStatusCode: Record<number, number>;
  byMethod: Record<string, number>;
  topHosts: Array<{ host: string; count: number }>;
}

export interface ProxyFilters {
  search: string;
  statusFilter: 'all' | '2xx' | '3xx' | '4xx' | '5xx' | 'errors';
  methodFilter: 'all' | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'CONNECT' | 'PATCH';
}

export interface ProxyServerState {
  isRunning: boolean;
  url: string;
  mode: 'forward' | 'intercept';
  port: number;
}

// =============================================================================
// State (Signals)
// =============================================================================

// Proxy requests list
const [proxyRequests, setProxyRequests] = createSignal<ProxyRequestEntry[]>([]);

// Proxy server state
const [proxyServer, setProxyServer] = createSignal<ProxyServerState | null>(null);

// Proxy stats
const [proxyStats, setProxyStats] = createSignal<ProxyStats>({
  totalRequests: 0,
  successCount: 0,
  errorCount: 0,
  bytesIn: 0,
  bytesOut: 0,
  avgLatency: 0,
  requestsPerSecond: 0,
  activeConnections: 0,
  byStatusCode: {},
  byMethod: {},
  topHosts: [],
});

// Filters
const [proxyFilters, setProxyFilters] = createSignal<ProxyFilters>({
  search: '',
  statusFilter: 'all',
  methodFilter: 'all',
});

// Selected request for detail view
const [selectedRequestId, setSelectedRequestId] = createSignal<string | null>(null);

// View mode
const [proxyViewMode, setProxyViewMode] = createSignal<'list' | 'detail'>('list');

// Max requests to keep in memory
const MAX_REQUESTS = 1000;

// =============================================================================
// Server State Functions
// =============================================================================

/**
 * Set proxy server running state
 */
function setProxyRunning(state: ProxyServerState): void {
  setProxyServer(state);
}

/**
 * Clear proxy server state
 */
function setProxyStopped(): void {
  setProxyServer(null);
}

/**
 * Check if proxy is running
 */
function isProxyRunning(): boolean {
  return proxyServer() !== null;
}

/**
 * Get proxy server info
 */
function getProxyServerInfo(): ProxyServerState | null {
  return proxyServer();
}

// =============================================================================
// Request Tracking Functions
// =============================================================================

/**
 * Add a new proxy request
 */
function addProxyRequest(request: Omit<ProxyRequestEntry, 'statusCode' | 'latency' | 'size'>): void {
  const current = proxyRequests();

  // Prepend new request
  const updated = [request as ProxyRequestEntry, ...current];

  // Prune old requests if over limit
  if (updated.length > MAX_REQUESTS) {
    updated.pop();
  }

  setProxyRequests(updated);
}

/**
 * Update a proxy request with response data
 */
function updateProxyRequest(id: string, update: Partial<ProxyRequestEntry>): void {
  const current = proxyRequests();
  const idx = current.findIndex(r => r.id === id);

  if (idx >= 0) {
    const updated = [...current];
    updated[idx] = { ...updated[idx], ...update };
    setProxyRequests(updated);
  }
}

/**
 * Add error to a request
 */
function addProxyError(id: string, error: { type: string; message: string }): void {
  updateProxyRequest(id, { error });
}

/**
 * Clear all proxy requests
 */
function clearProxyRequests(): void {
  setProxyRequests([]);
  setSelectedRequestId(null);
  setProxyViewMode('list');

  // Reset stats
  setProxyStats({
    totalRequests: 0,
    successCount: 0,
    errorCount: 0,
    bytesIn: 0,
    bytesOut: 0,
    avgLatency: 0,
    requestsPerSecond: 0,
    activeConnections: 0,
    byStatusCode: {},
    byMethod: {},
    topHosts: [],
  });
}

// =============================================================================
// Stats Functions
// =============================================================================

/**
 * Update proxy stats
 */
function updateProxyStats(stats: ProxyStats): void {
  setProxyStats(stats);
}

/**
 * Get current proxy stats
 */
function getProxyStats(): ProxyStats {
  return proxyStats();
}

// =============================================================================
// Filter Functions
// =============================================================================

/**
 * Set search filter
 */
function setProxySearch(search: string): void {
  const current = proxyFilters();
  setProxyFilters({ ...current, search });
}

/**
 * Set status filter
 */
function setProxyStatusFilter(filter: ProxyFilters['statusFilter']): void {
  const current = proxyFilters();
  setProxyFilters({ ...current, statusFilter: filter });
}

/**
 * Set method filter
 */
function setProxyMethodFilter(filter: ProxyFilters['methodFilter']): void {
  const current = proxyFilters();
  setProxyFilters({ ...current, methodFilter: filter });
}

/**
 * Reset all filters
 */
function resetProxyFilters(): void {
  setProxyFilters({
    search: '',
    statusFilter: 'all',
    methodFilter: 'all',
  });
}

/**
 * Get filtered requests
 */
function getFilteredRequests(): ProxyRequestEntry[] {
  const requests = proxyRequests();
  const filters = proxyFilters();

  return requests.filter(req => {
    // Search filter
    if (filters.search) {
      const search = filters.search.toLowerCase();
      const searchable = `${req.method} ${req.url} ${req.targetHost} ${req.statusCode || ''}`.toLowerCase();
      if (!searchable.includes(search)) {
        return false;
      }
    }

    // Status filter
    if (filters.statusFilter !== 'all') {
      const status = req.statusCode;
      if (filters.statusFilter === 'errors') {
        if (!req.error && status !== undefined && status < 400) {
          return false;
        }
      } else if (filters.statusFilter === '2xx') {
        if (!status || status < 200 || status >= 300) {
          return false;
        }
      } else if (filters.statusFilter === '3xx') {
        if (!status || status < 300 || status >= 400) {
          return false;
        }
      } else if (filters.statusFilter === '4xx') {
        if (!status || status < 400 || status >= 500) {
          return false;
        }
      } else if (filters.statusFilter === '5xx') {
        if (!status || status < 500) {
          return false;
        }
      }
    }

    // Method filter
    if (filters.methodFilter !== 'all') {
      if (req.method !== filters.methodFilter) {
        return false;
      }
    }

    return true;
  });
}

// =============================================================================
// Navigation Functions
// =============================================================================

/**
 * Select next request
 */
function selectNextRequest(): void {
  const filtered = getFilteredRequests();
  if (filtered.length === 0) return;

  const current = selectedRequestId();
  if (current === null) {
    setSelectedRequestId(filtered[0].id);
    return;
  }

  const idx = filtered.findIndex(r => r.id === current);
  const nextIdx = (idx + 1) % filtered.length;
  setSelectedRequestId(filtered[nextIdx].id);
}

/**
 * Select previous request
 */
function selectPrevRequest(): void {
  const filtered = getFilteredRequests();
  if (filtered.length === 0) return;

  const current = selectedRequestId();
  if (current === null) {
    setSelectedRequestId(filtered[filtered.length - 1].id);
    return;
  }

  const idx = filtered.findIndex(r => r.id === current);
  const prevIdx = idx === 0 ? filtered.length - 1 : idx - 1;
  setSelectedRequestId(filtered[prevIdx].id);
}

/**
 * Toggle detail view
 */
function toggleProxyDetail(): void {
  if (proxyViewMode() === 'list') {
    const filtered = getFilteredRequests();
    if (!selectedRequestId() && filtered.length > 0) {
      setSelectedRequestId(filtered[0].id);
    }
    setProxyViewMode('detail');
  } else {
    setProxyViewMode('list');
  }
}

/**
 * Get selected request
 */
function getSelectedRequest(): ProxyRequestEntry | undefined {
  const id = selectedRequestId();
  if (!id) return undefined;
  return proxyRequests().find(r => r.id === id);
}

// =============================================================================
// Export Helper
// =============================================================================

/**
 * Export requests to JSON
 */
function exportProxyRequests(): string {
  const requests = proxyRequests();
  const stats = proxyStats();
  const server = proxyServer();

  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    server: server ? {
      url: server.url,
      mode: server.mode,
      port: server.port,
    } : null,
    stats: {
      totalRequests: stats.totalRequests,
      successCount: stats.successCount,
      errorCount: stats.errorCount,
      bytesIn: stats.bytesIn,
      bytesOut: stats.bytesOut,
      avgLatency: stats.avgLatency,
    },
    requests: requests.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      method: r.method,
      url: r.url,
      targetHost: r.targetHost,
      targetPort: r.targetPort,
      isHttps: r.isHttps,
      statusCode: r.statusCode,
      latency: r.latency,
      size: r.size,
      error: r.error,
    })),
  }, null, 2);
}

/**
 * Generate cURL command for a request
 */
function requestToCurl(request: ProxyRequestEntry): string {
  const parts = ['curl'];

  // Method
  if (request.method !== 'GET') {
    parts.push(`-X ${request.method}`);
  }

  // Headers
  for (const [key, value] of Object.entries(request.headers)) {
    if (!['host', 'content-length'].includes(key.toLowerCase())) {
      parts.push(`-H '${key}: ${value}'`);
    }
  }

  // URL
  parts.push(`'${request.url}'`);

  return parts.join(' \\\n  ');
}

// =============================================================================
// Summary Stats
// =============================================================================

/**
 * Get summary for header display
 */
function getProxySummary(): {
  total: number;
  success: number;
  errors: number;
  bytesIn: string;
  bytesOut: string;
  avgLatency: string;
} {
  const stats = proxyStats();

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return {
    total: stats.totalRequests,
    success: stats.successCount,
    errors: stats.errorCount,
    bytesIn: formatBytes(stats.bytesIn),
    bytesOut: formatBytes(stats.bytesOut),
    avgLatency: `${stats.avgLatency}ms`,
  };
}

// =============================================================================
// Exports
// =============================================================================

export {
  // Signals (reactive state)
  proxyRequests,
  proxyServer,
  proxyStats,
  proxyFilters,
  selectedRequestId,
  setSelectedRequestId,
  proxyViewMode,
  setProxyViewMode,

  // Server state
  setProxyRunning,
  setProxyStopped,
  isProxyRunning,
  getProxyServerInfo,

  // Request tracking
  addProxyRequest,
  updateProxyRequest,
  addProxyError,
  clearProxyRequests,

  // Stats
  updateProxyStats,
  getProxyStats,

  // Filters
  setProxySearch,
  setProxyStatusFilter,
  setProxyMethodFilter,
  resetProxyFilters,
  getFilteredRequests,

  // Navigation
  selectNextRequest,
  selectPrevRequest,
  toggleProxyDetail,
  getSelectedRequest,

  // Export
  exportProxyRequests,
  requestToCurl,

  // Summary
  getProxySummary,
};

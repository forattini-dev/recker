/**
 * ProxyPanel - Real-time proxy request monitoring
 *
 * Uses tuiuiu.js native components:
 * - Table for request headers display
 * - ScrollList for scrollable request list
 * - KeyValueTable for detail view
 */

import { Box, Text, ScrollList, Table, KeyValueTable, Badge, StatusIndicator } from 'tuiuiu.js';
import { themeColor } from '../shared/theme-helper.js';
import type { VNode } from 'tuiuiu.js';
import {
  proxyServer,
  proxyFilters,
  proxyViewMode,
  selectedRequestId,
  setSelectedRequestId,
  getFilteredRequests,
  getSelectedRequest,
  getProxySummary,
} from '../hooks/useProxy.js';
import type { ProxyRequestEntry } from '../hooks/useProxy.js';

// =============================================================================
// Status Colors
// =============================================================================

function getStatusColor(statusCode?: number, hasError?: boolean): string {
  if (hasError || !statusCode) return themeColor('error');
  if (statusCode >= 500) return themeColor('error');
  if (statusCode >= 400) return themeColor('warning');
  if (statusCode >= 300) return themeColor('accent');
  if (statusCode >= 200) return themeColor('success');
  return themeColor('mutedForeground');
}

function getMethodColor(method: string): string {
  switch (method) {
    case 'GET': return themeColor('success');
    case 'POST': return themeColor('primary');
    case 'PUT': return themeColor('warning');
    case 'DELETE': return themeColor('error');
    case 'CONNECT': return themeColor('accent');
    default: return themeColor('mutedForeground');
  }
}

// =============================================================================
// Format Helpers
// =============================================================================

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatLatency(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

function extractPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search ? u.search : '');
  } catch {
    return url;
  }
}

// =============================================================================
// Header Component
// =============================================================================

function ProxyPanelHeader({ width }: { width: number }): VNode {
  const server = proxyServer();
  const summary = getProxySummary();

  if (!server) {
    return Box(
      { flexDirection: 'row', paddingX: 1, justifyContent: 'space-between', width },
      Box(
        { flexDirection: 'row', gap: 1 },
        StatusIndicator({ status: 'stopped', label: 'Proxy: Not running', size: 'sm' }),
      ),
      Text({ color: themeColor('mutedForeground'), dim: true }, 'serve proxy to start'),
    );
  }

  const mode = server.mode === 'intercept' ? 'MITM' : 'Tunnel';

  return Box(
    { flexDirection: 'row', paddingX: 1, justifyContent: 'space-between', width },
    Box(
      { flexDirection: 'row', gap: 1 },
      StatusIndicator({ status: 'running', label: `Proxy :${server.port}`, pulse: true, size: 'sm' }),
      Badge({
        label: mode,
        color: server.mode === 'intercept' ? 'warning' : 'success',
        variant: 'default',
      }),
    ),
    Box(
      { flexDirection: 'row', gap: 1 },
      Text({ color: themeColor('foreground') }, `${summary.total}`),
      Text({ color: themeColor('mutedForeground'), dim: true }, 'req'),
      Text({ color: themeColor('success') }, `${summary.success}✓`),
      summary.errors > 0 ? Text({ color: themeColor('error') }, `${summary.errors}✗`) : null,
      Text({ color: themeColor('mutedForeground'), dim: true }, `${summary.bytesIn}↓`),
      Text({ color: themeColor('mutedForeground'), dim: true }, `${summary.bytesOut}↑`),
      Text({ color: themeColor('mutedForeground'), dim: true }, summary.avgLatency),
    ),
  );
}

// =============================================================================
// Request Row Component (for ScrollList)
// =============================================================================

function RequestRow(request: ProxyRequestEntry, index: number): VNode {
  const statusColor = getStatusColor(request.statusCode, !!request.error);
  const methodColor = getMethodColor(request.method);
  const isSelected = selectedRequestId() === request.id;
  const hasError = !!request.error;

  // Format display values
  const status = request.statusCode
    ? String(request.statusCode)
    : (request.error ? 'ERR' : '...');
  const path = `${request.targetHost}${extractPath(request.url)}`;

  return Box(
    {
      flexDirection: 'row',
      paddingX: 1,
      backgroundColor: isSelected ? themeColor('muted') : undefined,
      gap: 1,
    },
    // Status code with color
    Text({ color: statusColor, bold: hasError }, status.padEnd(4)),
    // Method with color
    Text({ color: methodColor, bold: true }, request.method.padEnd(7)),
    // Domain + Path
    Text({ color: themeColor('foreground') }, truncate(path, 40).padEnd(40)),
    // Size
    Text({ color: themeColor('mutedForeground'), dim: true }, formatBytes(request.size).padStart(7)),
    // Latency
    Text({ color: themeColor('mutedForeground'), dim: true }, formatLatency(request.latency).padStart(6)),
    // Error indicator
    hasError ? Text({ color: themeColor('error'), bold: true }, '!') : null,
  );
}

// =============================================================================
// Request List Component
// =============================================================================

function RequestListView({ width, height }: { width: number; height: number }): VNode {
  const requests = getFilteredRequests;
  const server = proxyServer();
  const filters = proxyFilters();

  // Check if we have requests
  const currentRequests = requests();
  if (currentRequests.length === 0) {
    const message = server
      ? 'Waiting for requests...'
      : 'No proxy running. Use "serve proxy" to start.';

    return Box(
      { paddingX: 2, paddingY: 2 },
      Text({ color: themeColor('mutedForeground'), dim: true }, message),
    );
  }

  // Header row
  const headerRow = Box(
    { flexDirection: 'row', paddingX: 1, backgroundColor: themeColor('muted'), gap: 1 },
    Text({ color: themeColor('mutedForeground'), dim: true, bold: true }, 'Stat'.padEnd(4)),
    Text({ color: themeColor('mutedForeground'), dim: true, bold: true }, 'Method '.padEnd(7)),
    Text({ color: themeColor('mutedForeground'), dim: true, bold: true }, 'Domain + Path'.padEnd(40)),
    Text({ color: themeColor('mutedForeground'), dim: true, bold: true }, '   Size'),
    Text({ color: themeColor('mutedForeground'), dim: true, bold: true }, '  Time'),
  );

  // Filter indicator
  const hasFilters = filters.search || filters.statusFilter !== 'all' || filters.methodFilter !== 'all';

  // Footer with shortcuts
  const footer = Box(
    { flexDirection: 'row', paddingX: 1, paddingTop: 1, justifyContent: 'space-between' },
    Text(
      { color: themeColor('mutedForeground'), dim: true },
      hasFilters
        ? `${currentRequests.length} filtered`
        : `${currentRequests.length} requests`
    ),
    Text(
      { color: themeColor('mutedForeground'), dim: true },
      '↑↓:nav Enter:detail /:search C:clear E:export Y:curl'
    ),
  );

  return Box(
    { flexDirection: 'column', height },
    headerRow,
    ScrollList({
      items: requests,
      children: RequestRow,
      height: Math.max(1, height - 4),
      width: width - 2,
      autoScroll: true,
      autoScrollThreshold: 3,
      showScrollbar: true,
      itemHeight: 1,
    }),
    footer,
  );
}

// =============================================================================
// Detail View Component
// =============================================================================

function RequestDetailView({ width, height }: { width: number; height: number }): VNode {
  const request = getSelectedRequest();

  if (!request) {
    return Box(
      { paddingX: 2, paddingY: 1 },
      Text({ color: themeColor('mutedForeground') }, 'No request selected'),
    );
  }

  const statusColor = getStatusColor(request.statusCode, !!request.error);
  const timestamp = new Date(request.timestamp).toLocaleTimeString();

  // Build summary info
  const summaryData: Record<string, string> = {
    'URL': truncate(request.url, width - 20),
    'Host': `${request.targetHost}:${request.targetPort}`,
    'Client': request.clientIp,
    'Time': timestamp,
  };

  if (request.latency) {
    summaryData['Latency'] = `${request.latency}ms`;
  }
  if (request.size) {
    summaryData['Size'] = formatBytes(request.size);
  }

  // Header with status
  const header = Box(
    { flexDirection: 'row', paddingX: 1, paddingY: 1, gap: 1 },
    Badge({
      label: request.statusCode ? String(request.statusCode) : 'PENDING',
      color: request.error ? 'red' : (request.statusCode && request.statusCode < 400 ? 'green' : 'yellow'),
    }),
    Text({ color: getMethodColor(request.method), bold: true }, request.method),
    Text({ color: themeColor('foreground') }, truncate(request.url, width - 20)),
  );

  // Error section
  const errorSection = request.error ? Box(
    { paddingX: 1, paddingY: 1, backgroundColor: themeColor('error') + '20' },
    Text({ color: themeColor('error'), bold: true }, `Error: ${request.error.type}`),
    Text({ color: themeColor('error') }, request.error.message),
  ) : null;

  // Summary using KeyValueTable
  const summarySection = Box(
    { paddingX: 1, paddingY: 1 },
    Text({ color: themeColor('primary'), bold: true }, '▸ Request Info'),
    KeyValueTable({
      entries: summaryData,
      keyWidth: 10,
      keyColor: themeColor('mutedForeground'),
    }),
  );

  // Request headers section
  const requestHeadersData: Record<string, string> = {};
  Object.entries(request.headers).slice(0, 8).forEach(([key, value]) => {
    requestHeadersData[key] = truncate(value, width - 20);
  });

  const requestHeadersSection = Box(
    { paddingX: 1, paddingY: 1 },
    Text({ color: themeColor('primary'), bold: true }, '▸ Request Headers'),
    KeyValueTable({
      entries: requestHeadersData,
      keyWidth: 18,
      keyColor: themeColor('mutedForeground'),
    }),
    Object.keys(request.headers).length > 8
      ? Text({ color: themeColor('mutedForeground'), dim: true }, `  ... and ${Object.keys(request.headers).length - 8} more`)
      : null,
  );

  // Response headers section (if available)
  const responseHeadersSection = request.responseHeaders ? Box(
    { paddingX: 1, paddingY: 1 },
    Text({ color: themeColor('success'), bold: true }, '▸ Response Headers'),
    KeyValueTable({
      entries: Object.fromEntries(
        Object.entries(request.responseHeaders).slice(0, 8).map(([k, v]) => [k, truncate(v, width - 20)])
      ),
      keyWidth: 18,
      keyColor: themeColor('mutedForeground'),
    }),
  ) : null;

  // Footer
  const footer = Box(
    { paddingX: 1, paddingTop: 1 },
    Text({ color: themeColor('mutedForeground'), dim: true }, 'Esc:back Y:copy-curl'),
  );

  return Box(
    { flexDirection: 'column' },
    header,
    errorSection,
    summarySection,
    requestHeadersSection,
    responseHeadersSection,
    footer,
  );
}

// =============================================================================
// Main Panel Component
// =============================================================================

export interface ProxyPanelProps {
  width: number;
  height: number;
}

export function ProxyPanel({ width, height }: ProxyPanelProps): VNode {
  const viewMode = proxyViewMode();

  return Box(
    {
      flexDirection: 'column',
      width,
      height,
    },
    ProxyPanelHeader({ width }),
    viewMode === 'list'
      ? RequestListView({ width, height: height - 2 })
      : RequestDetailView({ width, height: height - 2 }),
  );
}

// =============================================================================
// Exports
// =============================================================================

export {
  ProxyPanelHeader,
  RequestListView,
  RequestRow,
  RequestDetailView,
};

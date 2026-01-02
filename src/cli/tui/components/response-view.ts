/**
 * ResponseView - Display HTTP responses with formatting
 *
 * Renders JSON responses with syntax highlighting (via cardinal),
 * headers, status codes, and timing information.
 */

import {
  Box,
  Text,
  Divider,
  CodeBlock,
} from 'tuiuiu.js';
import { themeColor } from '../shared/theme-helper.js';
import type { VNode } from 'tuiuiu.js';

// =============================================================================
// Types
// =============================================================================

export interface ResponseData {
  status?: number;
  statusText?: string;
  time?: number;
  headers?: Record<string, string>;
  body?: unknown;
  error?: string;
}

export interface ResponseViewProps {
  response: ResponseData;
  showHeaders?: boolean;
  maxBodyLines?: number;
  width?: number;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get status color based on HTTP status code
 */
function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return themeColor('success');
  if (status >= 300 && status < 400) return themeColor('accent');
  if (status >= 400 && status < 500) return themeColor('warning');
  if (status >= 500) return themeColor('error');
  return themeColor('mutedForeground');
}

/**
 * Format JSON for display
 */
function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Truncate text to max lines
 */
function truncateLines(text: string, maxLines: number): { text: string; truncated: boolean } {
  const lines = text.split('\n');
  if (lines.length <= maxLines) {
    return { text, truncated: false };
  }
  return {
    text: lines.slice(0, maxLines).join('\n'),
    truncated: true,
  };
}

// =============================================================================
// Component
// =============================================================================

/**
 * ResponseView - Display a single response
 */
export function ResponseView(props: ResponseViewProps): VNode {
  const {
    response,
    showHeaders = false,
    maxBodyLines = 50,
    width,
  } = props;

  const children: VNode[] = [];

  // Error display
  if (response.error) {
    return Box(
      { flexDirection: 'column', width },
      Text({ color: themeColor('error'), bold: true }, '✗ Error'),
      Text({ color: themeColor('error') }, `  ${response.error}`),
    );
  }

  // Status line
  if (response.status !== undefined) {
    const statusColor = getStatusColor(response.status);
    const statusLine = [
      response.status.toString(),
      response.statusText || '',
      response.time !== undefined ? `(${response.time}ms)` : '',
    ].filter(Boolean).join(' ');

    children.push(
      Box(
        { flexDirection: 'row' },
        Text({ color: statusColor, bold: true }, `${response.status >= 400 ? '✗' : '✓'} `),
        Text({ color: statusColor }, statusLine),
      )
    );
  }

  // Headers (optional)
  if (showHeaders && response.headers) {
    children.push(
      Box({ marginTop: 1 }),
      Text({ color: themeColor('mutedForeground'), dim: true }, '─ Headers ─'),
    );

    for (const [key, value] of Object.entries(response.headers)) {
      children.push(
        Box(
          { flexDirection: 'row' },
          Text({ color: themeColor('accent') }, `  ${key}: `),
          Text({ color: themeColor('foreground') }, value),
        )
      );
    }
  }

  // Body
  if (response.body !== undefined && response.body !== null) {
    let bodyText: string;
    let isJson = false;

    if (typeof response.body === 'string') {
      bodyText = response.body;
      // Try to detect if it's JSON
      try {
        JSON.parse(response.body);
        isJson = true;
      } catch {
        isJson = false;
      }
    } else {
      bodyText = formatJson(response.body);
      isJson = true;
    }

    const { text: truncatedBody, truncated } = truncateLines(bodyText, maxBodyLines);

    children.push(Box({ marginTop: 1 }));

    // Use CodeBlock for syntax highlighting when possible
    if (isJson) {
      children.push(
        CodeBlock({
          code: truncatedBody,
          language: 'json',
          lineNumbers: false,
        })
      );
    } else {
      // Plain text - render line by line
      truncatedBody.split('\n').forEach(line => {
        children.push(Text({ color: themeColor('foreground') }, line));
      });
    }

    if (truncated) {
      children.push(
        Box({ marginTop: 1 }),
        Text({ color: themeColor('mutedForeground'), dim: true },
          `  ... (truncated, ${maxBodyLines}+ lines)`),
      );
    }
  }

  return Box(
    { flexDirection: 'column', width },
    ...children,
  );
}

// =============================================================================
// Compact Response (for history view)
// =============================================================================

export interface CompactResponseProps {
  response: ResponseData;
  maxPreviewLength?: number;
}

/**
 * CompactResponse - Single-line response summary for history
 */
export function CompactResponse(props: CompactResponseProps): VNode {
  const { response, maxPreviewLength = 100 } = props;

  if (response.error) {
    return Text({ color: themeColor('error') }, `✗ Error: ${response.error}`);
  }

  const parts: string[] = [];

  if (response.status !== undefined) {
    parts.push(`${response.status}`);
  }

  if (response.time !== undefined) {
    parts.push(`${response.time}ms`);
  }

  // Body preview
  let preview = '';
  if (response.body !== undefined) {
    if (typeof response.body === 'string') {
      preview = response.body.slice(0, maxPreviewLength);
    } else {
      preview = JSON.stringify(response.body).slice(0, maxPreviewLength);
    }
    if (preview.length === maxPreviewLength) {
      preview += '...';
    }
  }

  const statusColor = response.status ? getStatusColor(response.status) : themeColor('foreground');

  return Box(
    { flexDirection: 'column' },
    Box(
      { flexDirection: 'row' },
      Text({ color: statusColor, bold: true }, parts.join(' | ')),
    ),
    preview ? Text({ color: themeColor('success') }, preview) : null,
  );
}

/**
 * HTTP Commands
 *
 * Commands for HTTP requests with base URL resolution.
 * NOTE: GraphQL and SSE have been migrated to the unified CLI system.
 */

import type { CommandContext, CommandResult } from './types.js';

// =============================================================================
// HTTP Command
// =============================================================================

export async function cmdHttp(
  ctx: CommandContext,
  method: string,
  args: string[]
): Promise<CommandResult> {
  let url = args[0];
  if (!url) {
    ctx.addHistoryItem({ type: 'error', content: `Usage: ${method} <url>` });
    return { success: false };
  }

  // Resolve URL with base
  const base = ctx.baseUrl();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (base) {
      url = base.replace(/\/$/, '') + (url.startsWith('/') ? '' : '/') + url;
    } else {
      url = `https://${url}`;
    }
  }

  // Parse headers and data from remaining args
  const headers: Record<string, string> = {};
  const data: Record<string, any> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    // Header: Key:Value
    if (arg.includes(':') && !arg.includes('=')) {
      const [key, ...rest] = arg.split(':');
      headers[key.trim()] = rest.join(':').trim();
      continue;
    }

    // Data: key=value or key:=jsonValue
    if (arg.includes('=')) {
      const isTyped = arg.includes(':=');
      const separator = isTyped ? ':=' : '=';
      const [key, ...rest] = arg.split(separator);
      const value = rest.join(separator);

      if (isTyped) {
        try {
          data[key] = JSON.parse(value);
        } catch {
          data[key] = value;
        }
      } else {
        data[key] = value;
      }
    }
  }

  ctx.setIsLoading(true);
  const startTime = Date.now();

  try {
    const requestOptions: any = { method };

    if (Object.keys(headers).length > 0) {
      requestOptions.headers = headers;
    }

    if (Object.keys(data).length > 0 && method !== 'GET' && method !== 'HEAD') {
      requestOptions.body = JSON.stringify(data);
      requestOptions.headers = {
        ...requestOptions.headers,
        'Content-Type': 'application/json',
      };
    }

    const response = await ctx.client.request(url, requestOptions);
    const elapsed = Date.now() - startTime;

    // Parse response body
    let body: any;
    const contentType = response.headers.get?.('content-type') || '';
    if (contentType.includes('json')) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    // Store last response
    ctx.setLastResponse(body);

    // Extract headers for rich display
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach?.((value: string, key: string) => {
      responseHeaders[key] = value;
    });

    // Track in Domain Intelligence
    try {
      const urlObj = new URL(url);
      ctx.trackRequest(urlObj.hostname, {
        method,
        path: urlObj.pathname,
        status: response.status,
        time: elapsed,
      });
    } catch {
      // Ignore invalid URLs
    }

    ctx.addHistoryItem({
      type: 'response',
      content: body,
      meta: {
        responseType: 'http',
        status: response.status,
        statusText: response.statusText,
        time: elapsed,
        headers: responseHeaders,
        size: typeof body === 'string' ? body.length : JSON.stringify(body).length,
      },
    });

    return { success: true, data: body };

  } catch (err: any) {
    const errorMsg = err.message || String(err);
    ctx.addHistoryItem({ type: 'error', content: errorMsg });
    return { success: false, error: errorMsg };

  } finally {
    ctx.setIsLoading(false);
  }
}

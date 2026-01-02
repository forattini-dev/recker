/**
 * HTTP Commands
 *
 * Commands for HTTP requests and API protocols:
 * - http: Generic HTTP requests (GET, POST, PUT, DELETE, etc.)
 * - graphql: GraphQL queries
 * - sse: Server-Sent Events client
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

// =============================================================================
// GraphQL Command
// =============================================================================

export async function cmdGraphql(ctx: CommandContext, args: string[]): Promise<CommandResult> {
  if (args.length === 0) {
    ctx.addHistoryItem({
      type: 'info',
      content: `GraphQL Client

Usage: graphql <url> <query> [variables]

Examples:
  graphql https://api.github.com/graphql "{ viewer { login } }"
  graphql https://api.example.com/graphql "query($id: ID!) { user(id: $id) { name } }" id=123

Note: Set Authorization header with 'set auth Bearer <token>' first.`,
    });
    return { success: true };
  }

  let url = args[0];
  const query = args[1];

  if (!query) {
    ctx.addHistoryItem({ type: 'error', content: 'Usage: graphql <url> <query>' });
    return { success: false };
  }

  if (!url.startsWith('http')) {
    url = `https://${url}`;
  }

  // Parse variables from remaining args
  const variables: Record<string, any> = {};
  for (const arg of args.slice(2)) {
    if (arg.includes('=')) {
      const [key, val] = arg.split('=');
      try {
        variables[key] = JSON.parse(val);
      } catch {
        variables[key] = val;
      }
    }
  }

  ctx.setIsLoading(true);

  try {
    const response = await ctx.client.post(url, {
      body: JSON.stringify({ query, variables: Object.keys(variables).length ? variables : undefined }),
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await response.json() as any;

    if (result.errors) {
      ctx.addHistoryItem({ type: 'error', content: `GraphQL errors:\n${result.errors.map((e: any) => e.message).join('\n')}` });
    }

    if (result.data) {
      ctx.addHistoryItem({ type: 'response', content: result.data });
    }

    ctx.setLastResponse(result);
    return { success: true, data: result };

  } catch (err: any) {
    ctx.addHistoryItem({ type: 'error', content: `GraphQL error: ${err.message}` });
    return { success: false, error: err.message };
  } finally {
    ctx.setIsLoading(false);
  }
}

// =============================================================================
// SSE Command
// =============================================================================

export async function cmdSse(ctx: CommandContext, args: string[]): Promise<CommandResult> {
  if (args.length === 0) {
    ctx.addHistoryItem({
      type: 'info',
      content: `SSE (Server-Sent Events) Client

Usage: sse <url> [duration=<seconds>]

Examples:
  sse https://api.example.com/events
  sse https://api.example.com/stream duration=30

Press Ctrl+C to stop listening.`,
    });
    return { success: true };
  }

  let url = args[0];
  if (!url.startsWith('http')) {
    url = `https://${url}`;
  }

  const durationMatch = args.find(a => a.startsWith('duration='));
  const duration = durationMatch ? parseInt(durationMatch.split('=')[1], 10) * 1000 : 30000;

  ctx.setIsLoading(true);
  ctx.addHistoryItem({ type: 'info', content: `Connecting to SSE: ${url} (${duration / 1000}s timeout)` });

  try {
    // SSE requires streaming - use native fetch for this
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), duration);

    const response = await fetch(url, {
      headers: { 'Accept': 'text/event-stream' },
      signal: controller.signal,
    });

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body - SSE requires streaming support');
    }

    const decoder = new TextDecoder();
    const events: any[] = [];
    const startTime = Date.now();

    try {
      while (Date.now() - startTime < duration) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            try {
              events.push(JSON.parse(data));
            } catch {
              events.push(data);
            }
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
      reader.cancel();
    }

    ctx.addHistoryItem({
      type: 'response',
      content: { eventsReceived: events.length, events: events.slice(-10) },
    });

    ctx.setLastResponse({ events });
    return { success: true, data: { events } };

  } catch (err: any) {
    if (err.name === 'AbortError') {
      ctx.addHistoryItem({ type: 'info', content: 'SSE connection closed (timeout)' });
      return { success: true };
    }
    ctx.addHistoryItem({ type: 'error', content: `SSE error: ${err.message}` });
    return { success: false, error: err.message };
  } finally {
    ctx.setIsLoading(false);
  }
}

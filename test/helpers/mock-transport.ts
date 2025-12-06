import { HttpResponse } from '../../src/core/response.js'; // Import real HttpResponse
import type { ReckerRequest, ReckerResponse, Transport } from '../../../src/types/index.js';

interface MockResponse {
  status: number;
  body: any;
  headers?: Record<string, string>;
  times?: number; // How many times this response can be used
  delay?: number; // Delay in ms before responding
  error?: Error; // If set, throw this error instead of returning a response
}

export class MockTransport implements Transport {
  private mockResponses: Map<string, MockResponse[]> = new Map();
  private callCounts: Map<string, number> = new Map();

  setMockResponse(method: string, path: string, status: number, body: any, headers?: Record<string, string>, options?: { times?: number; delay?: number }) {
    const key = `${method}:${path}`;
    const existing = this.mockResponses.get(key) || [];
    existing.push({
      status,
      body,
      headers,
      times: options?.times,
      delay: options?.delay
    });
    this.mockResponses.set(key, existing);
  }

  getCallCount(method: string, path: string): number {
    const key = `${method}:${path}`;
    return this.callCounts.get(key) || 0;
  }

  setMockError(method: string, path: string, error: Error, options?: { times?: number }) {
    const key = `${method}:${path}`;
    const existing = this.mockResponses.get(key) || [];
    existing.push({
      status: 0,
      body: null,
      error,
      times: options?.times
    });
    this.mockResponses.set(key, existing);
  }

  reset() {
    this.mockResponses.clear();
    this.callCounts.clear();
  }

  async dispatch(req: ReckerRequest): Promise<ReckerResponse> {
    // Try exact match first (e.g. "GET:https://example.com/foo" or "GET:/foo")
    let key = `${req.method}:${req.url}`;
    let responses = this.mockResponses.get(key);

    // If not found, try matching by pathname if it's a full URL
    if (!responses) {
      try {
        const url = new URL(req.url);
        const pathKey = `${req.method}:${url.pathname}${url.search}`;
        responses = this.mockResponses.get(pathKey);
        if (responses) key = pathKey; // Found by path
      } catch {
        // Invalid URL (relative path), already tried exact match
      }
    }

    // Track call count
    const count = (this.callCounts.get(key) || 0) + 1;
    this.callCounts.set(key, count);

    if (!responses || responses.length === 0) {
      throw new Error(`No mock response configured for ${key}. Request URL: ${req.url}`);
    }

    // Find the right response based on call count and times
    let mockResponse: MockResponse | undefined;
    let cumulativeTimes = 0;

    for (const [, response] of responses.entries()) {
      if (response.times === undefined) {
        mockResponse = response;
        break;
      }

      cumulativeTimes += response.times;
      if (count <= cumulativeTimes) {
        mockResponse = response;
        break;
      }
    }

    if (!mockResponse) {
      throw new Error(`No more mock responses available for ${key} (called ${count} times)`);
    }

    // Check if this mock should throw an error
    if (mockResponse.error) {
      throw mockResponse.error;
    }

    // Add delay if specified (supports abort signal via AbortSignal.timeout style)
    if (mockResponse.delay) {
      // Check if already aborted before starting delay
      if (req.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      // Simple delay with abort check - avoids promise rejection handling issues
      const aborted = await new Promise<boolean>(resolve => {
        let done = false;

        const timer = setTimeout(() => {
          if (!done) {
            done = true;
            req.signal?.removeEventListener('abort', onAbort);
            resolve(false); // Not aborted
          }
        }, mockResponse.delay);

        const onAbort = () => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve(true); // Aborted
          }
        };

        req.signal?.addEventListener('abort', onAbort, { once: true });
      });

      if (aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
    }

    const headers = new Headers(mockResponse.headers || { 'content-type': 'application/json' });
    const bodyString = typeof mockResponse.body === 'string' ? mockResponse.body : JSON.stringify(mockResponse.body);

    // Status 204 No Content and 304 Not Modified cannot have a body
    const responseBody = (mockResponse.status === 204 || mockResponse.status === 304) ? null : bodyString;

    const statusTexts: Record<number, string> = {
      200: 'OK',
      201: 'Created',
      204: 'No Content',
      207: 'Multi-Status',
      304: 'Not Modified',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      500: 'Internal Server Error'
    };

    const webResponse = new Response(responseBody, {
      status: mockResponse.status,
      statusText: statusTexts[mockResponse.status] || 'Unknown',
      headers
    });

    // Return a real HttpResponse instance
    return new HttpResponse(webResponse);
  }
}

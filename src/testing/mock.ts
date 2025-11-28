/**
 * Recker Testing Utilities
 * Provides mocking capabilities for HTTP requests in tests
 */

import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, Dispatcher } from 'undici';
import type { ReckerRequest, ReckerResponse, Transport } from '../types/index.js';

export interface MockResponseOptions {
  /** HTTP status code */
  status?: number;
  /** Response body (will be JSON stringified if object) */
  body?: any;
  /** Response headers */
  headers?: Record<string, string>;
  /** Number of times this response can be used (default: unlimited) */
  times?: number;
  /** Delay in ms before responding */
  delay?: number;
}

export interface MockInterceptOptions {
  /** URL path to match (can include query string) */
  path: string | RegExp;
  /** HTTP method to match */
  method?: string;
  /** Request headers to match */
  headers?: Record<string, string>;
  /** Request body to match */
  body?: string | RegExp;
}

/**
 * MockClient - A fluent API for mocking HTTP requests in tests
 *
 * @example Basic usage
 * ```typescript
 * import { createMockClient } from 'recker/testing';
 *
 * const { client, mock } = createMockClient('https://api.example.com');
 *
 * mock.get('/users').reply(200, [{ id: 1, name: 'John' }]);
 * mock.post('/users').reply(201, { id: 2 });
 *
 * const users = await client.get('/users').json();
 * expect(users).toHaveLength(1);
 * ```
 *
 * @example With matching
 * ```typescript
 * mock.get('/users/:id').reply(200, { id: 1 });
 * mock.post('/users', { body: /name.*John/ }).reply(201);
 * ```
 *
 * @example Sequential responses
 * ```typescript
 * mock.get('/data')
 *   .replyOnce(500, { error: 'Server Error' })
 *   .replyOnce(200, { data: 'success' });
 *
 * // First call returns 500, second returns 200
 * ```
 */
export class MockClient {
  private responses: Map<string, MockResponseOptions[]> = new Map();
  private callHistory: Array<{ method: string; url: string; body?: any; headers: Headers }> = [];
  private pendingIntercept?: MockInterceptOptions;

  /**
   * Intercept GET requests
   */
  get(path: string | RegExp, options?: Omit<MockInterceptOptions, 'path' | 'method'>) {
    this.pendingIntercept = { ...options, path, method: 'GET' };
    return this;
  }

  /**
   * Intercept POST requests
   */
  post(path: string | RegExp, options?: Omit<MockInterceptOptions, 'path' | 'method'>) {
    this.pendingIntercept = { ...options, path, method: 'POST' };
    return this;
  }

  /**
   * Intercept PUT requests
   */
  put(path: string | RegExp, options?: Omit<MockInterceptOptions, 'path' | 'method'>) {
    this.pendingIntercept = { ...options, path, method: 'PUT' };
    return this;
  }

  /**
   * Intercept PATCH requests
   */
  patch(path: string | RegExp, options?: Omit<MockInterceptOptions, 'path' | 'method'>) {
    this.pendingIntercept = { ...options, path, method: 'PATCH' };
    return this;
  }

  /**
   * Intercept DELETE requests
   */
  delete(path: string | RegExp, options?: Omit<MockInterceptOptions, 'path' | 'method'>) {
    this.pendingIntercept = { ...options, path, method: 'DELETE' };
    return this;
  }

  /**
   * Intercept any HTTP method
   */
  intercept(options: MockInterceptOptions) {
    this.pendingIntercept = options;
    return this;
  }

  /**
   * Set the response for the intercepted request (unlimited uses)
   */
  reply(status: number, body?: any, headers?: Record<string, string>) {
    if (!this.pendingIntercept) {
      throw new Error('No intercept defined. Call get(), post(), etc. first.');
    }
    const key = this.makeKey(this.pendingIntercept);
    const responses = this.responses.get(key) || [];
    responses.push({ status, body, headers });
    this.responses.set(key, responses);
    this.pendingIntercept = undefined;
    return this;
  }

  /**
   * Set the response for the intercepted request (single use)
   */
  replyOnce(status: number, body?: any, headers?: Record<string, string>) {
    if (!this.pendingIntercept) {
      throw new Error('No intercept defined. Call get(), post(), etc. first.');
    }
    const key = this.makeKey(this.pendingIntercept);
    const responses = this.responses.get(key) || [];
    responses.push({ status, body, headers, times: 1 });
    this.responses.set(key, responses);
    // Don't clear pendingIntercept to allow chaining replyOnce calls
    return this;
  }

  /**
   * Set response with delay
   */
  replyWithDelay(delay: number, status: number, body?: any, headers?: Record<string, string>) {
    if (!this.pendingIntercept) {
      throw new Error('No intercept defined. Call get(), post(), etc. first.');
    }
    const key = this.makeKey(this.pendingIntercept);
    const responses = this.responses.get(key) || [];
    responses.push({ status, body, headers, delay });
    this.responses.set(key, responses);
    this.pendingIntercept = undefined;
    return this;
  }

  /**
   * Reply with network error
   */
  replyWithError(error: Error | string) {
    if (!this.pendingIntercept) {
      throw new Error('No intercept defined. Call get(), post(), etc. first.');
    }
    const key = this.makeKey(this.pendingIntercept);
    const responses = this.responses.get(key) || [];
    responses.push({
      status: -1, // Special marker for error
      body: error instanceof Error ? error : new Error(error)
    });
    this.responses.set(key, responses);
    this.pendingIntercept = undefined;
    return this;
  }

  /**
   * Get all recorded requests
   */
  history() {
    return [...this.callHistory];
  }

  /**
   * Check if a specific request was made
   */
  called(method: string, pathPattern?: string | RegExp) {
    return this.callHistory.some(call => {
      if (call.method !== method) return false;
      if (!pathPattern) return true;
      if (typeof pathPattern === 'string') {
        return call.url.includes(pathPattern);
      }
      return pathPattern.test(call.url);
    });
  }

  /**
   * Get call count for a specific endpoint
   */
  callCount(method?: string, pathPattern?: string | RegExp) {
    return this.callHistory.filter(call => {
      if (method && call.method !== method) return false;
      if (!pathPattern) return true;
      if (typeof pathPattern === 'string') {
        return call.url.includes(pathPattern);
      }
      return pathPattern.test(call.url);
    }).length;
  }

  /**
   * Reset all mocks and history
   */
  reset() {
    this.responses.clear();
    this.callHistory = [];
    this.pendingIntercept = undefined;
  }

  /**
   * Reset only call history (keep mocks)
   */
  resetHistory() {
    this.callHistory = [];
  }

  private makeKey(intercept: MockInterceptOptions): string {
    const method = intercept.method || 'GET';
    const path = intercept.path instanceof RegExp ? intercept.path.source : intercept.path;
    return `${method}:${path}`;
  }

  /**
   * Internal: Find matching response for a request
   */
  _findResponse(method: string, url: string, body?: any, headers?: Headers): MockResponseOptions | undefined {
    // Record the call with body and headers
    this.callHistory.push({ method, url, body, headers: headers || new Headers() });

    // Try exact match first
    const urlObj = new URL(url);
    const path = urlObj.pathname + urlObj.search;
    const exactKey = `${method}:${path}`;

    let responses = this.responses.get(exactKey);
    if (!responses || responses.length === 0) {
      // Try pathname only
      const pathOnlyKey = `${method}:${urlObj.pathname}`;
      responses = this.responses.get(pathOnlyKey);
    }

    if (!responses || responses.length === 0) {
      // Try regex matching
      for (const [key, resps] of this.responses.entries()) {
        const [m, pattern] = key.split(':');
        if (m !== method) continue;

        try {
          const regex = new RegExp(pattern);
          if (regex.test(path) || regex.test(urlObj.pathname)) {
            responses = resps;
            break;
          }
        } catch {
          // Not a valid regex, skip
        }
      }
    }

    if (!responses || responses.length === 0) {
      return undefined;
    }

    // Find available response (respecting times limit)
    const callCount = this.callHistory.filter(c => c.method === method && c.url === url).length;
    let cumulativeTimes = 0;

    for (const response of responses) {
      if (response.times === undefined) {
        return response;
      }
      cumulativeTimes += response.times;
      if (callCount <= cumulativeTimes) {
        return response;
      }
    }

    // Return last response if all timed responses are exhausted
    const lastResponse = responses[responses.length - 1];
    if (lastResponse.times === undefined) {
      return lastResponse;
    }

    return undefined;
  }
}

/**
 * MockTransport - Transport implementation for testing
 * Can be used with createClient({ transport: mockTransport })
 */
export class MockTransport implements Transport {
  private mock: MockClient;

  constructor(mock?: MockClient) {
    this.mock = mock || new MockClient();
  }

  /**
   * Get the mock client for setting up expectations
   */
  getMock(): MockClient {
    return this.mock;
  }

  async dispatch(req: ReckerRequest): Promise<ReckerResponse> {
    // Convert body to string for history (if it's not already)
    let bodyString: string | undefined;
    if (req.body) {
      if (typeof req.body === 'string') {
        bodyString = req.body;
      } else if (req.body instanceof Blob) {
        bodyString = await req.body.text();
      } else if (req.body instanceof ArrayBuffer) {
        bodyString = new TextDecoder().decode(req.body);
      } else if (req.body instanceof FormData) {
        bodyString = '[FormData]';
      } else if (req.body instanceof URLSearchParams) {
        bodyString = req.body.toString();
      }
    }

    const response = this.mock._findResponse(req.method, req.url, bodyString, req.headers);

    if (!response) {
      throw new Error(`No mock response for ${req.method} ${req.url}`);
    }

    // Handle error responses
    if (response.status === -1) {
      throw response.body;
    }

    // Handle delay
    if (response.delay) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, response.delay);
        req.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    }

    const status = response.status ?? 200;
    const respHeaders = new Headers(response.headers || { 'content-type': 'application/json' });
    const respBodyString = typeof response.body === 'string'
      ? response.body
      : JSON.stringify(response.body ?? {});

    const rawResponse = new Response(
      status === 204 || status === 304 ? null : respBodyString,
      { status, headers: respHeaders }
    );

    return {
      status,
      statusText: rawResponse.statusText,
      headers: respHeaders,
      ok: status >= 200 && status < 300,
      url: req.url,
      raw: rawResponse,
      json: async () => response.body,
      text: async () => respBodyString,
      cleanText: async () => respBodyString,
      blob: async () => new Blob([respBodyString]),
      read: () => rawResponse.body,
      clone: function() { return this; },
      sse: async function* () {},
      download: async function* () {},
      [Symbol.asyncIterator]: async function* () {}
    } as ReckerResponse;
  }
}

/**
 * Create a mock client with pre-configured transport
 *
 * @example
 * ```typescript
 * import { createMockClient } from 'recker/testing';
 * import { createClient } from 'recker';
 *
 * const { mock, transport } = createMockClient();
 *
 * mock.get('/users').reply(200, [{ id: 1 }]);
 *
 * const client = createClient({
 *   baseUrl: 'https://api.example.com',
 *   transport
 * });
 *
 * const users = await client.get('/users').json();
 * ```
 */
export function createMockClient(): { mock: MockClient; transport: MockTransport } {
  const mock = new MockClient();
  const transport = new MockTransport(mock);
  return { mock, transport };
}

/**
 * Install mock globally using undici's MockAgent
 * Useful for intercepting all HTTP requests in tests
 *
 * @example
 * ```typescript
 * import { installGlobalMock, uninstallGlobalMock } from 'recker/testing';
 *
 * beforeEach(() => {
 *   const mock = installGlobalMock();
 *   mock.intercept({ origin: 'https://api.example.com' })
 *     .get('/users')
 *     .reply(200, []);
 * });
 *
 * afterEach(() => {
 *   uninstallGlobalMock();
 * });
 * ```
 */
let originalDispatcher: Dispatcher | undefined;

export function installGlobalMock(options?: { throwOnUnmocked?: boolean }): MockAgent {
  originalDispatcher = getGlobalDispatcher();

  const mockAgent = new MockAgent();

  if (options?.throwOnUnmocked !== false) {
    mockAgent.disableNetConnect();
  }

  setGlobalDispatcher(mockAgent);
  return mockAgent;
}

export function uninstallGlobalMock(): void {
  if (originalDispatcher) {
    setGlobalDispatcher(originalDispatcher);
    originalDispatcher = undefined;
  }
}

// Re-export MockAgent for advanced use cases
export { MockAgent } from 'undici';

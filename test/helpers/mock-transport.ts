import type { ReckerRequest, ReckerResponse, Transport } from '../../src/types/index.js';

interface MockResponse {
  status: number;
  body: any;
  headers?: Record<string, string>;
  times?: number; // How many times this response can be used
  delay?: number; // Delay in ms before responding
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

  reset() {
    this.mockResponses.clear();
    this.callCounts.clear();
  }

  async dispatch(req: ReckerRequest): Promise<ReckerResponse> {
    const url = new URL(req.url);
    const key = `${req.method}:${url.pathname}${url.search}`;

    // Track call count
    const count = (this.callCounts.get(key) || 0) + 1;
    this.callCounts.set(key, count);

    const responses = this.mockResponses.get(key);

    if (!responses || responses.length === 0) {
      throw new Error(`No mock response for ${key}`);
    }

    // Find the right response based on call count and times
    let mockResponse: MockResponse | undefined;
    let cumulativeTimes = 0;

    for (const response of responses) {
      if (response.times === undefined) {
        // Unlimited uses
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

    // Add delay if specified
    if (mockResponse.delay) {
      await new Promise(resolve => setTimeout(resolve, mockResponse.delay));
    }

    const headers = new Headers(mockResponse.headers || { 'content-type': 'application/json' });
    const bodyString = typeof mockResponse.body === 'string' ? mockResponse.body : JSON.stringify(mockResponse.body);

    // Status 204 No Content cannot have a body
    const responseBody = mockResponse.status === 204 ? null : bodyString;

    const response = new Response(responseBody, {
      status: mockResponse.status,
      statusText: mockResponse.status === 200 ? 'OK' : mockResponse.status === 201 ? 'Created' : mockResponse.status === 204 ? 'No Content' : mockResponse.status === 207 ? 'Multi-Status' : 'Error',
      headers
    });

    return {
      status: mockResponse.status,
      statusText: response.statusText,
      headers,
      ok: mockResponse.status >= 200 && mockResponse.status < 300,
      url: req.url,
      raw: response,
      json: async () => mockResponse.body,
      text: async () => bodyString,
      cleanText: async () => bodyString,
      blob: async () => new Blob([bodyString]),
      read: () => response.body,
      clone: () => {
        // Return a cloned response with the same data
        return {
          status: mockResponse.status,
          statusText: response.statusText,
          headers: response.headers,
          ok: mockResponse.status >= 200 && mockResponse.status < 300,
          url: req.url,
          raw: response,
          json: async () => mockResponse.body,
          text: async () => bodyString,
          cleanText: async () => bodyString,
          blob: async () => new Blob([bodyString]),
          read: () => response.body,
          clone: () => {
            throw new Error('Cannot clone a cloned response');
          },
          sse: async function* () {
            // Mock SSE - just return empty stream for now
            return;
          },
          download: async function* () {
            throw new Error('Not implemented in mock');
          },
          [Symbol.asyncIterator]: async function* () {
            throw new Error('Not implemented in mock');
          }
        } as any;
      },
      sse: async function* () {
        // Mock SSE - just return empty stream for now
        // Tests can override this if needed
        return;
      },
      download: async function* () {
        throw new Error('Not implemented in mock');
      },
      [Symbol.asyncIterator]: async function* () {
        throw new Error('Not implemented in mock');
      }
    };
  }
}

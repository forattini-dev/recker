import { ReckerRequest, ReckerResponse, Transport, Timings, ProgressEvent } from '../types/index.js';

export interface FetchTransportOptions {
  /** Default credentials mode for all requests */
  credentials?: RequestCredentials;
  /** Default cache mode for all requests */
  cache?: RequestCache;
  /** Keep connections alive for reuse */
  keepalive?: boolean;
}

export class FetchTransport implements Transport {
  private options: FetchTransportOptions;

  constructor(options: FetchTransportOptions = {}) {
    this.options = options;
  }

  async dispatch(req: ReckerRequest): Promise<ReckerResponse> {
    const start = performance.now();

    // Create AbortController for timeout if needed
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let abortController: AbortController | undefined;

    // Extract timeout value (handle both number and TimeoutOptions)
    const timeoutMs = typeof req.timeout === 'number'
      ? req.timeout
      : req.timeout?.request;

    // Use provided signal or create one for timeout
    let signal = req.signal;
    if (timeoutMs && !signal) {
      abortController = new AbortController();
      signal = abortController.signal;
      timeoutId = setTimeout(() => abortController!.abort(), timeoutMs);
    }

    const requestInit: RequestInit = {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal,
      credentials: this.options.credentials,
      cache: this.options.cache,
      keepalive: this.options.keepalive ?? true,
      // duplex: 'half' is required for streaming bodies in some fetch implementations (like Node/Chrome)
      // @ts-ignore - Types might not be up to date for 'duplex'
      duplex: req.body ? 'half' : undefined
    };

    try {
      const response = await globalThis.fetch(req.url, requestInit);

      // Approximate timings since Fetch API doesn't give low-level timings
      const totalTime = performance.now() - start;
      const timings: Timings = {
        total: totalTime,
        firstByte: totalTime, // Rough approximation
      };

      return new FetchResponseWrapper(response, timings);

    } catch (error: any) {
      // Handle timeout abort
      if (error.name === 'AbortError' && abortController) {
        const timeoutError = new Error(`Request timeout after ${timeoutMs}ms`);
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}


class FetchResponseWrapper implements ReckerResponse {
    constructor(public raw: Response, public timings: Timings) {}

    get status() { return this.raw.status; }
    get statusText() { return this.raw.statusText; }
    get headers() { return this.raw.headers; }
    get ok() { return this.raw.ok; }
    get url() { return this.raw.url; }
    get connection() { return {}; } // Fetch doesn't expose this

    json<T>() { return this.raw.json() as Promise<T>; }
    text() { return this.raw.text(); }
    blob() { return this.raw.blob(); }
    async cleanText() { return (await this.text()).replace(/<[^>]*>?/gm, ''); }
    
    read() { return this.raw.body; }
    
    clone() { return new FetchResponseWrapper(this.raw.clone(), this.timings); }
    
    async *sse() {
        if (!this.raw.body) return;
        // @ts-ignore - TextDecoderStream is standard in modern environments
        const stream = this.raw.body.pipeThrough(new TextDecoderStream());
        const reader = stream.getReader();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += value;
            const events = buffer.split('\n\n');
            buffer = events.pop() || ''; // Keep incomplete event in buffer

            for (const event of events) {
                if (!event.trim()) continue;

                let data = '';
                let eventType: string | undefined;
                let id: string | undefined;
                let retry: number | undefined;
                const lines = event.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        data = data ? data + '\n' + line.slice(6) : line.slice(6);
                    } else if (line.startsWith('event: ')) {
                        eventType = line.slice(7);
                    } else if (line.startsWith('id: ')) {
                        id = line.slice(4);
                    } else if (line.startsWith('retry: ')) {
                        retry = parseInt(line.slice(7), 10);
                    }
                }

                // Only yield if we have data (required by SSEEvent)
                if (data) {
                    yield { data, event: eventType, id, retry };
                }
            }
        }
    }
    
    async *download(): AsyncGenerator<ProgressEvent> {
        if (!this.raw.body) return;
        const reader = this.raw.body.getReader();
        let loaded = 0;
        const total = Number(this.raw.headers.get('content-length')) || undefined;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            loaded += value.length;
            yield {
                loaded,
                transferred: loaded,
                total,
                percent: total ? (loaded / total) * 100 : undefined,
                direction: 'download'
            };
        }
    }

    async *[Symbol.asyncIterator]() {
        if (!this.raw.body) return;
        const reader = this.raw.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            yield value;
        }
    }
}

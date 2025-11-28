import { ReckerRequest, ReckerResponse, Transport, Timings } from '../types/index.js';

export class FetchTransport implements Transport {
  constructor() {}

  async dispatch(req: ReckerRequest): Promise<ReckerResponse> {
    const start = performance.now();
    
    const requestInit: RequestInit = {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal: req.signal,
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

      // Wrap native Response
      // We need to implement ReckerResponse interface
      
      const reckerResponse: ReckerResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        ok: response.ok,
        url: response.url,
        timings,
        raw: response,
        
        json: () => response.json(),
        text: () => response.text(),
        blob: () => response.blob(),
        cleanText: async () => {
            const text = await response.text();
            return text.replace(/<[^>]*>?/gm, ''); // Basic cleaner
        },
        
        read: () => response.body, // Returns ReadableStream<Uint8Array>
        
        clone: () => {
           // Native clone
           const cloned = response.clone();
           // We need to re-wrap it, which is tricky without recursive logic or a helper class.
           // For now, we might fail to fully clone the *ReckerResponse* wrapper methods easily 
           // without a dedicated class.
           // But ReckerResponse is an interface. Let's return a new object.
           return createReckerResponseWrapper(cloned, timings);
        },

        async *sse() {
           if (!response.body) return;
           const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
           while (true) {
               const { done, value } = await reader.read();
               if (done) break;
               // Basic SSE parsing (naive)
               const lines = value.split('\n');
               for (const line of lines) {
                   if (line.startsWith('data: ')) {
                       yield { data: line.slice(6) };
                   }
               }
           }
        },

        async *download() {
            // Not fully implemented in fetch without Content-Length knowledge upfront and manual stream reading
            if (!response.body) return;
            const reader = response.body.getReader();
            let loaded = 0;
            const total = Number(response.headers.get('content-length')) || 0;
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                loaded += value.length;
                yield {
                    loaded,
                    total,
                    percent: total ? (loaded / total) * 100 : undefined
                };
            }
        },

        async *[Symbol.asyncIterator]() {
             if (!response.body) return;
             // ReadableStream iterator support is recent, so we use getReader
             const reader = response.body.getReader();
             while (true) {
                 const { done, value } = await reader.read();
                 if (done) break;
                 yield value;
             }
        }
      };

      return reckerResponse;

    } catch (error: any) {
        // Map common fetch errors if needed
        throw error;
    }
  }
}

// Helper to create the wrapper (avoid code duplication in clone)
function createReckerResponseWrapper(response: Response, timings: Timings): ReckerResponse {
    // This effectively replicates the object literal above. 
    // In a real refactor, we should probably have a class `FetchResponse implements ReckerResponse`.
    // For brevity, I'm duplicating the logic structure slightly or I'd copy-paste the above.
    // Let's keep it inline for now or move to a class if it gets complex.
    // Actually, using a class is cleaner.
    return new FetchResponseWrapper(response, timings);
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
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value.startsWith('data: ')) {
                yield { data: value.slice(6) };
            }
        }
    }
    
    async *download() {
         if (!this.raw.body) return;
            const reader = this.raw.body.getReader();
            let loaded = 0;
            const total = Number(this.raw.headers.get('content-length')) || 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                loaded += value.length;
                yield { loaded, total, percent: total ? (loaded / total) * 100 : 0 };
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

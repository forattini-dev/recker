import { ReckerRequest, ReckerResponse, Transport, Timings, ProgressEvent, RedirectInfo, ProgressCallback } from '../types/index.js';
import { createProgressStream } from '../utils/progress.js';
import { TimeoutError } from '../core/errors.js';

export interface FetchTransportOptions {
  /** Default credentials mode for all requests */
  credentials?: RequestCredentials;
  /** Default cache mode for all requests */
  cache?: RequestCache;
  /** Keep connections alive for reuse */
  keepalive?: boolean;
}

function parseContentLength(headers: Headers): number | undefined {
  const raw = headers.get('content-length');
  if (!raw) return undefined;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getAbortReason(error: unknown): unknown {
  return (error as any)?.cause ?? (error as any)?.reason;
}

function isTimeoutReason(reason: unknown): reason is TimeoutError {
  if (reason instanceof TimeoutError) {
    return true;
  }

  if (!reason || typeof reason !== 'object') {
    return false;
  }

  const timeoutReason = reason as { name?: unknown };
  return timeoutReason.name === 'TimeoutError';
}

function wrapDownloadResponse(response: Response, onProgress?: ProgressCallback): Response {
  if (!onProgress || !response.body) return response;
  const total = parseContentLength(response.headers);
  const body = createProgressStream(response.body, onProgress, {
    total,
    direction: 'download'
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

function bufferToStream(buffer: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(buffer);
      controller.close();
    }
  });
}

function wrapUploadBody(body: BodyInit | null, onProgress?: ProgressCallback, total?: number): BodyInit | null {
  if (!onProgress || !body) return body;

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return body;
  }

  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    return createProgressStream(body, onProgress, { total, direction: 'upload' });
  }

  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return createProgressStream(body.stream(), onProgress, { total: body.size, direction: 'upload' });
  }

  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    const view = body instanceof ArrayBuffer
      ? new Uint8Array(body)
      : new Uint8Array((body as ArrayBufferView).buffer, (body as ArrayBufferView).byteOffset, (body as ArrayBufferView).byteLength);
    return createProgressStream(bufferToStream(view), onProgress, { total: view.byteLength, direction: 'upload' });
  }

  if (typeof body === 'string') {
    const encoder = new TextEncoder();
    const view = encoder.encode(body);
    return createProgressStream(bufferToStream(view), onProgress, { total: view.byteLength, direction: 'upload' });
  }

  return body;
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
    const requestTimeoutError = timeoutMs ? new TimeoutError(req, {
      phase: 'request',
      timeout: timeoutMs
    }) : undefined;

    if (timeoutMs && !signal) {
      abortController = new AbortController();
      signal = abortController.signal;
      timeoutId = setTimeout(() => {
        timeoutControllerAbort(abortController!, requestTimeoutError);
      }, timeoutMs);
    }

    const followRedirects = req.followRedirects !== false;
    const maxRedirects = req.maxRedirects ?? 20;
    const handleRedirectsManually = Boolean(req.beforeRedirect) || req.followRedirects === false || req.maxRedirects !== undefined;

    let currentUrl = req.url;
    let currentMethod = req.method;
    let currentBody = req.body;
    let currentHeaders = new Headers(req.headers);
    const uploadTotal = parseContentLength(currentHeaders);
    let redirectCount = 0;

    try {
      while (true) {
        const bodyWithProgress = redirectCount === 0
          ? wrapUploadBody(currentBody, req.onUploadProgress, uploadTotal)
          : currentBody;

        const requestInit: RequestInit = {
          method: currentMethod,
          headers: currentHeaders,
          body: bodyWithProgress,
          signal,
          credentials: this.options.credentials,
          cache: this.options.cache,
          keepalive: this.options.keepalive ?? true,
          redirect: handleRedirectsManually ? 'manual' : 'follow',
          // duplex: 'half' is required for streaming bodies in some fetch implementations (like Node/Chrome)
          // @ts-ignore - Types might not be up to date for 'duplex'
          duplex: bodyWithProgress ? 'half' : undefined
        };

        const response = await globalThis.fetch(currentUrl, requestInit);

        if (handleRedirectsManually) {
          const status = response.status;
          const isRedirect = status >= 300 && status < 400;

          if (isRedirect && followRedirects && redirectCount < maxRedirects) {
            const location = response.headers.get('location');
            if (!location || response.type === 'opaqueredirect') {
              const finalResponse = wrapDownloadResponse(response, req.onDownloadProgress);
              const totalTime = performance.now() - start;
              return new FetchResponseWrapper(finalResponse, { total: totalTime, firstByte: totalTime });
            }

            const nextUrl = new URL(location, currentUrl).toString();
            let resolvedUrl = nextUrl;

            if (req.beforeRedirect) {
              const redirectInfo: RedirectInfo = {
                from: currentUrl,
                to: nextUrl,
                status,
                headers: response.headers
              };
              const hookResult = await req.beforeRedirect(redirectInfo);
              if (hookResult === false) {
                const finalResponse = wrapDownloadResponse(response, req.onDownloadProgress);
                const totalTime = performance.now() - start;
                return new FetchResponseWrapper(finalResponse, { total: totalTime, firstByte: totalTime });
              }
              if (typeof hookResult === 'string') {
                resolvedUrl = hookResult;
              }
            }

            if (status === 303 || ((status === 301 || status === 302) && currentMethod !== 'GET' && currentMethod !== 'HEAD')) {
              currentMethod = 'GET';
              currentBody = null;
              currentHeaders.delete('content-type');
              currentHeaders.delete('content-length');
            }

            await response.body?.cancel();
            currentUrl = resolvedUrl;
            redirectCount++;
            continue;
          }
        }

        const finalResponse = wrapDownloadResponse(response, req.onDownloadProgress);

        // Approximate timings since Fetch API doesn't give low-level timings
        const totalTime = performance.now() - start;
        const timings: Timings = {
          total: totalTime,
          firstByte: totalTime, // Rough approximation
        };

        return new FetchResponseWrapper(finalResponse, timings);
      }
    } catch (error: any) {
      // Handle timeout abort
      if (timeoutMs && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        const timeoutReason = getAbortReason(error);
        if (
          isTimeoutReason(timeoutReason) ||
          isTimeoutReason(getAbortReason(signal)) ||
          (abortController && isTimeoutReason(requestTimeoutError))
        ) {
          throw timeoutReason instanceof TimeoutError ? timeoutReason : requestTimeoutError ?? error;
        }
      }
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}

function timeoutControllerAbort(controller: AbortController, reason?: TimeoutError) {
  if (!controller.signal.aborted) {
    if (reason) {
      controller.abort(reason);
    } else {
      controller.abort();
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

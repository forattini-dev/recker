import { Method, ReckerRequest, RequestOptions, ProgressCallback, TimeoutOptions, RedirectInfo } from '../types/index.js';

/**
 * Normalize timeout option to TimeoutOptions object
 */
function normalizeTimeout(timeout?: number | TimeoutOptions): TimeoutOptions | undefined {
  if (timeout === undefined) return undefined;
  if (typeof timeout === 'number') {
    return { request: timeout };
  }
  return timeout;
}

export class HttpRequest implements ReckerRequest {
  public readonly url: string;
  public readonly method: Method;
  public readonly headers: Headers;
  public readonly body: BodyInit | null;
  public readonly signal?: AbortSignal;
  public readonly throwHttpErrors?: boolean;
  public readonly timeout?: TimeoutOptions;
  public readonly onUploadProgress?: ProgressCallback;
  public readonly onDownloadProgress?: ProgressCallback;
  public readonly maxResponseSize?: number;
  public readonly beforeRedirect?: (info: RedirectInfo) => void | false | string | Promise<void | false | string>;
  public readonly maxRedirects?: number;
  public readonly followRedirects?: boolean;
  public readonly http2?: boolean;

  constructor(url: string, options: RequestOptions = {}) {
    this.url = url;
    this.method = options.method || 'GET';
    this.headers = new Headers(options.headers);
    this.body = options.body || null;
    this.signal = options.signal;
    this.throwHttpErrors = options.throwHttpErrors !== undefined ? options.throwHttpErrors : true;
    this.timeout = normalizeTimeout(options.timeout);
    this.onUploadProgress = options.onUploadProgress;
    this.onDownloadProgress = options.onDownloadProgress;
    this.maxResponseSize = options.maxResponseSize;
    this.beforeRedirect = options.beforeRedirect;
    this.maxRedirects = options.maxRedirects;
    this.followRedirects = options.followRedirects;
    this.http2 = options.http2;
  }

  withHeader(name: string, value: string): ReckerRequest {
    const newHeaders = new Headers(this.headers);
    newHeaders.set(name, value);
    return new HttpRequest(this.url, {
      method: this.method,
      headers: newHeaders,
      body: this.body,
      signal: this.signal,
      throwHttpErrors: this.throwHttpErrors,
      timeout: this.timeout,
      onUploadProgress: this.onUploadProgress,
      onDownloadProgress: this.onDownloadProgress,
      maxResponseSize: this.maxResponseSize,
      beforeRedirect: this.beforeRedirect,
      maxRedirects: this.maxRedirects,
      followRedirects: this.followRedirects,
      http2: this.http2,
    });
  }

  withBody(body: BodyInit): ReckerRequest {
    return new HttpRequest(this.url, {
      method: this.method,
      headers: this.headers,
      body: body,
      signal: this.signal,
      throwHttpErrors: this.throwHttpErrors,
      timeout: this.timeout,
      onUploadProgress: this.onUploadProgress,
      onDownloadProgress: this.onDownloadProgress,
      maxResponseSize: this.maxResponseSize,
      beforeRedirect: this.beforeRedirect,
      maxRedirects: this.maxRedirects,
      followRedirects: this.followRedirects,
      http2: this.http2,
    });
  }
}

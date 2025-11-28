import { Method, ReckerRequest, RequestOptions, ProgressCallback } from '../types/index.js';

export class HttpRequest implements ReckerRequest {
  public readonly url: string;
  public readonly method: Method;
  public readonly headers: Headers;
  public readonly body: BodyInit | null;
  public readonly signal?: AbortSignal;
  public readonly throwHttpErrors?: boolean;
  public readonly onUploadProgress?: ProgressCallback;
  public readonly onDownloadProgress?: ProgressCallback;

  constructor(url: string, options: RequestOptions = {}) {
    this.url = url;
    this.method = options.method || 'GET';
    this.headers = new Headers(options.headers);
    this.body = options.body || null;
    this.signal = options.signal;
    this.throwHttpErrors = options.throwHttpErrors !== undefined ? options.throwHttpErrors : true;
    this.onUploadProgress = options.onUploadProgress;
    this.onDownloadProgress = options.onDownloadProgress;
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
      onUploadProgress: this.onUploadProgress,
      onDownloadProgress: this.onDownloadProgress,
    });
  }

  withBody(body: BodyInit): ReckerRequest {
    return new HttpRequest(this.url, {
      method: this.method,
      headers: this.headers,
      body: body,
      signal: this.signal,
      throwHttpErrors: this.throwHttpErrors,
      onUploadProgress: this.onUploadProgress,
      onDownloadProgress: this.onDownloadProgress,
    });
  }
}

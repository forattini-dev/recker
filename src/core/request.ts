import { Method, ReckerRequest, RequestOptions, ProgressCallback, TimeoutOptions, RedirectInfo } from '../types/index.js';
import { attachRequestContext, getRequestContext } from '../core-runtime/request-context.js';

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
  public readonly useCurl?: boolean;
  public readonly correlationId?: string;
  public readonly tenant?: string;
  public readonly policyTags: string[];
  public readonly policySource?: string;
  public readonly traceId?: string;

  constructor(url: string, options: RequestOptions = {}) {
    this.url = url;
    this.method = options.method || 'GET';
    // Optimization: Reuse Headers object if already provided, avoid unnecessary new Headers()
    this.headers = options.headers instanceof Headers
      ? options.headers
      : new Headers(options.headers);
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
    this.useCurl = options.useCurl;
    this.correlationId = options.correlationId;
    this.tenant = options.tenant;
    this.policyTags = options.policyTags ?? [];
    this.policySource = options.policySource;
    this.traceId = options.traceId;
  }

  withHeader(name: string, value: string): ReckerRequest {
    const context = getRequestContext(this);
    const newHeaders = new Headers(this.headers);
    newHeaders.set(name, value);
    const request = new HttpRequest(this.url, {
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
      useCurl: this.useCurl,
      correlationId: this.correlationId,
      tenant: this.tenant,
      policyTags: this.policyTags,
      policySource: this.policySource,
      traceId: this.traceId
    });

    if (context) {
      return attachRequestContext(request, context);
    }

    return request;
  }

  withBody(body: BodyInit): ReckerRequest {
    const context = getRequestContext(this);
    const request = new HttpRequest(this.url, {
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
      useCurl: this.useCurl,
      correlationId: this.correlationId,
      tenant: this.tenant,
      policyTags: this.policyTags,
      policySource: this.policySource,
      traceId: this.traceId
    });

    if (context) {
      return attachRequestContext(request, context);
    }

    return request;
  }
}

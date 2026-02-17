import { ReckerRequest, ReckerResponse } from '../types/index.js';

export type CanonicalErrorCategory =
  | 'http'
  | 'network'
  | 'timeout'
  | 'protocol'
  | 'validation'
  | 'state'
  | 'filesystem'
  | 'resource'
  | 'policy'
  | 'queue'
  | 'unknown';

export type ErrorSource = 'client' | 'transport' | 'server' | 'upstream';

export type CanonicalErrorSeverity = 'low' | 'medium' | 'high';

export interface CanonicalErrorMetadata {
  category: CanonicalErrorCategory;
  source: ErrorSource;
  severity: CanonicalErrorSeverity;
  canRetry: boolean;
  reason: string;
  statusCode?: number;
  retryAfterMs?: number;
}

export class ReckerError extends Error {
  request?: ReckerRequest;
  response?: ReckerResponse;
  suggestions: string[];
  retriable: boolean;
  classification?: CanonicalErrorMetadata;

  constructor(
    message: string,
    request?: ReckerRequest,
    response?: ReckerResponse,
    suggestions: string[] = [],
    retriable = false,
    classification?: CanonicalErrorMetadata
  ) {
    super(message);
    this.name = 'ReckerError';
    this.request = request;
    this.response = response;
    this.suggestions = suggestions;
    this.retriable = retriable;
    this.classification = classification;
  }
}

export class HttpError extends ReckerError {
  status: number;
  statusText: string;

  constructor(response: ReckerResponse, request?: ReckerRequest) {
    const retriable = isRetryableStatus(response.status);
    super(
      `Request failed with status code ${response.status} ${response.statusText}`,
      request,
      response,
      ['Check the upstream service response body for error details.', 'Inspect request headers/body to ensure they match the API contract.', 'Retry if this is a transient 5xx/429 error.'],
      retriable,
      {
        category: 'http',
        source: 'server',
        severity: response.status >= 500 ? 'high' : 'medium',
        canRetry: retriable,
        reason: `HTTP ${response.status}`,
        statusCode: response.status
      }
    );
    this.name = 'HttpError';
    this.status = response.status;
    this.statusText = response.statusText;
  }
}

/**
 * Timeout phases for granular error reporting
 */
export type TimeoutPhase =
  | 'lookup'        // DNS resolution
  | 'connect'       // TCP connection
  | 'secureConnect' // TLS handshake
  | 'socket'        // Socket assignment from pool
  | 'send'          // Request body upload
  | 'response'      // First byte (TTFB)
  | 'request'       // Total request time
  | 'webrtc-connect'; // WebRTC peer connection

/**
 * Rich timeout error with phase information
 * Helps debug exactly where the request stalled
 */
export class TimeoutError extends ReckerError {
  /**
   * Which phase of the request timed out
   */
  phase: TimeoutPhase;

  /**
   * The configured timeout for this phase (ms)
   */
  timeout: number;

  /**
   * Actual elapsed time when timeout occurred (ms)
   */
  elapsed?: number;

  /**
   * Event name for diagnostics/logging
   */
  event: string;

  constructor(
    request?: ReckerRequest,
    options?: {
      phase?: TimeoutPhase;
      timeout?: number;
      elapsed?: number;
    }
  ) {
    const phase = options?.phase || 'request';
    const timeout = options?.timeout;
    const elapsed = options?.elapsed;

    const phaseMessages: Record<TimeoutPhase, string> = {
      lookup: 'DNS lookup timed out',
      connect: 'TCP connection timed out',
      secureConnect: 'TLS handshake timed out',
      socket: 'Socket assignment timed out (connection pool exhausted)',
      send: 'Request body upload timed out',
      response: 'Waiting for response timed out (TTFB)',
      request: 'Request timed out (total time exceeded)',
      'webrtc-connect': 'WebRTC peer connection timed out'
    };

    let message = phaseMessages[phase];
    if (timeout !== undefined) {
      message += ` after ${timeout}ms`;
    }
    if (elapsed !== undefined && elapsed !== timeout) {
      message += ` (elapsed: ${Math.round(elapsed)}ms)`;
    }

    const suggestions: string[] = [
      'Verify network connectivity and DNS resolution for the target host.',
      'Increase the specific timeout phase or optimize the upstream response time.',
      'Reduce concurrent requests if the connection pool is exhausted.'
    ];

    super(message, request, undefined, suggestions, true, {
      category: 'timeout',
      source: 'transport',
      severity: 'medium',
      canRetry: true,
      reason: `Timeout while ${phase}`
    });
    this.name = 'TimeoutError';
    this.phase = phase;
    this.timeout = timeout ?? 0;
    this.elapsed = elapsed;
    this.event = `timeout:${phase}`;
  }
}

export class NetworkError extends ReckerError {
  code?: string;

  constructor(message: string, code?: string, request?: ReckerRequest) {
    const suggestions = [
      'Confirm the host and port are reachable from this environment.',
      'Check proxy/VPN/firewall settings that might block the request.',
      'Retry the request or switch transport if this is transient.'
    ];
    super(message, request, undefined, suggestions, true, {
      category: 'network',
      source: 'transport',
      severity: code ? 'medium' : 'low',
      canRetry: true,
      reason: code ? `Network error (${code})` : message
    });
    this.name = 'NetworkError';
    this.code = code;
  }
}

/**
 * HTTP/2 error codes (RFC 7540 Section 7)
 */
export type Http2ErrorCode =
  | 'NO_ERROR'           // Graceful shutdown
  | 'PROTOCOL_ERROR'     // Protocol error detected
  | 'INTERNAL_ERROR'     // Implementation fault
  | 'FLOW_CONTROL_ERROR' // Flow-control limits exceeded
  | 'SETTINGS_TIMEOUT'   // Settings not acknowledged
  | 'STREAM_CLOSED'      // Frame received for closed stream
  | 'FRAME_SIZE_ERROR'   // Frame size incorrect
  | 'REFUSED_STREAM'     // Stream not processed
  | 'CANCEL'             // Stream cancelled
  | 'COMPRESSION_ERROR'  // Compression state not updated
  | 'CONNECT_ERROR'      // TCP connection error for CONNECT
  | 'ENHANCE_YOUR_CALM'  // Processing capacity exceeded (rate limit)
  | 'INADEQUATE_SECURITY'// Negotiated TLS parameters not acceptable
  | 'HTTP_1_1_REQUIRED'; // Use HTTP/1.1 for the request

/**
 * HTTP/2 specific error with protocol-level details
 */
export class Http2Error extends ReckerError {
  /** HTTP/2 error code */
  errorCode: Http2ErrorCode | string;

  /** Whether this is a session-level or stream-level error */
  level: 'session' | 'stream';

  /** Stream ID if stream-level error */
  streamId?: number;

  /** Whether fallback to HTTP/1.1 is recommended */
  suggestFallback: boolean;

  constructor(
    message: string,
    errorCode: Http2ErrorCode | string,
    options: {
      level?: 'session' | 'stream';
      streamId?: number;
      request?: ReckerRequest;
    } = {}
  ) {
    // Determine if retriable based on error code
    const retriable = isRetriableHttp2Error(errorCode);
    const suggestFallback = shouldFallbackToHttp1(errorCode);

    const suggestions = getHttp2ErrorSuggestions(errorCode, suggestFallback);

    super(message, options.request, undefined, suggestions, retriable, {
      category: 'protocol',
      source: 'transport',
      severity: retriable ? 'medium' : 'high',
      canRetry: retriable,
      reason: `HTTP/2 ${errorCode}`,
      statusCode: errorCode ? Number.parseInt(String(errorCode), 10) || undefined : undefined
    });
    this.name = 'Http2Error';
    this.errorCode = errorCode;
    this.level = options.level ?? 'stream';
    this.streamId = options.streamId;
    this.suggestFallback = suggestFallback;
  }
}

/**
 * Check if an HTTP/2 error is retriable
 */
function isRetriableHttp2Error(errorCode: string): boolean {
  const retriableCodes = [
    'NO_ERROR',           // Graceful shutdown, retry is safe
    'INTERNAL_ERROR',     // Server-side issue, might recover
    'REFUSED_STREAM',     // Server busy, retry with backoff
    'ENHANCE_YOUR_CALM',  // Rate limited, retry with backoff
    'CANCEL',             // Cancelled, might succeed on retry
  ];
  return retriableCodes.includes(errorCode);
}

/**
 * Check if we should suggest fallback to HTTP/1.1
 */
function shouldFallbackToHttp1(errorCode: string): boolean {
  const fallbackCodes = [
    'HTTP_1_1_REQUIRED',      // Explicit: server wants HTTP/1.1
    'INADEQUATE_SECURITY',    // TLS issues, might work with HTTP/1.1
    'PROTOCOL_ERROR',         // Protocol issues, fallback might help
    'COMPRESSION_ERROR',      // HPACK issues
  ];
  return fallbackCodes.includes(errorCode);
}

/**
 * Get suggestions for HTTP/2 errors
 */
function getHttp2ErrorSuggestions(errorCode: string, suggestFallback: boolean): string[] {
  const suggestions: string[] = [];

  switch (errorCode) {
    case 'ENHANCE_YOUR_CALM':
      suggestions.push('Server is rate limiting. Implement exponential backoff.');
      suggestions.push('Reduce concurrent requests to this origin.');
      break;
    case 'REFUSED_STREAM':
      suggestions.push('Server is overloaded. Retry with backoff.');
      suggestions.push('Consider reducing max concurrent streams.');
      break;
    case 'FLOW_CONTROL_ERROR':
      suggestions.push('Reduce initial window size in HTTP/2 settings.');
      suggestions.push('Server may not handle large uploads well over HTTP/2.');
      break;
    case 'HTTP_1_1_REQUIRED':
      suggestions.push('Server requires HTTP/1.1 for this request.');
      suggestions.push('Disable HTTP/2 for this origin.');
      break;
    case 'INADEQUATE_SECURITY':
      suggestions.push('Upgrade TLS configuration or use HTTP/1.1.');
      break;
    case 'GOAWAY':
      suggestions.push('Server is shutting down connection. Retry is safe.');
      break;
    default:
      suggestions.push('Check server logs for details.');
  }

  if (suggestFallback) {
    suggestions.push('Consider disabling HTTP/2 for this origin with { http2: false }.');
  }

  return suggestions;
}

/**
 * Parse HTTP/2 error from undici/Node.js error
 */
export function parseHttp2Error(error: Error): Http2Error | null {
  const message = error.message || '';
  const code = (error as any).code || '';

  // Check for GOAWAY frame
  if (message.includes('GOAWAY') || code.includes('GOAWAY')) {
    return new Http2Error(
      'Server sent GOAWAY frame, closing connection',
      'NO_ERROR',
      { level: 'session' }
    );
  }

  // Check for RST_STREAM
  if (message.includes('RST_STREAM') || code.includes('RST_STREAM')) {
    // Try to extract error code from message
    const match = message.match(/RST_STREAM.*code[:\s]+(\w+)/i);
    const errorCode = match?.[1] || 'CANCEL';
    return new Http2Error(
      `Stream was reset: ${errorCode}`,
      errorCode,
      { level: 'stream' }
    );
  }

  // Check for specific HTTP/2 error codes
  const h2ErrorCodes: Http2ErrorCode[] = [
    'PROTOCOL_ERROR', 'INTERNAL_ERROR', 'FLOW_CONTROL_ERROR',
    'SETTINGS_TIMEOUT', 'STREAM_CLOSED', 'FRAME_SIZE_ERROR',
    'REFUSED_STREAM', 'CANCEL', 'COMPRESSION_ERROR', 'CONNECT_ERROR',
    'ENHANCE_YOUR_CALM', 'INADEQUATE_SECURITY', 'HTTP_1_1_REQUIRED'
  ];

  for (const errorCode of h2ErrorCodes) {
    if (message.includes(errorCode) || code.includes(errorCode)) {
      return new Http2Error(
        `HTTP/2 error: ${errorCode}`,
        errorCode,
        { level: message.includes('session') ? 'session' : 'stream' }
      );
    }
  }

  // Check for NGHTTP2 errors (Node.js http2 module)
  if (code.startsWith('ERR_HTTP2_')) {
    const errorCode = code.replace('ERR_HTTP2_', '');
    return new Http2Error(
      message || `HTTP/2 error: ${errorCode}`,
      errorCode,
      { level: 'session' }
    );
  }

  return null;
}

/**
 * Derive retry policy and standardized category for transport/runtime errors.
 * Returns classification metadata when an error shape is recognized.
 */
export function classifyTransportError(error: unknown): CanonicalErrorMetadata | undefined {
  if (error instanceof ReckerError && error.classification) {
    return error.classification;
  }

  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const anyError = error as {
    name?: string;
    message?: string;
    code?: string;
  };

  const name = anyError.name || '';
  const message = anyError.message || '';
  const code = (anyError.code as string | undefined)?.toUpperCase();

  if (name === 'AbortError' || code === 'ABORT_ERR' || code === 'UND_ERR_ABORTED' || message.includes('aborted') || message.includes('AbortError')) {
    return {
      category: 'queue',
      source: 'client',
      severity: 'low',
      canRetry: true,
      reason: 'Request was aborted'
    };
  }

  if (name === 'TimeoutError' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_HEADERS_TIMEOUT' || code === 'UND_ERR_BODY_TIMEOUT' || message.includes('timeout')) {
    return {
      category: 'timeout',
      source: 'transport',
      severity: 'medium',
      canRetry: true,
      reason: message || 'Request timed out'
    };
  }

  const networkCodes = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'ENOTFOUND',
    'EPIPE',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ENETDOWN',
    'EAI_AGAIN'
  ]);
  if (code && networkCodes.has(code)) {
    return {
      category: 'network',
      source: 'transport',
      severity: 'medium',
      canRetry: true,
      reason: message || `Network error (${code})`
    };
  }

  if (name === 'Http2Error' || message.includes('HTTP/2') || message.includes('RST_STREAM') || message.includes('GOAWAY')) {
    return {
      category: 'protocol',
      source: 'transport',
      severity: 'medium',
      canRetry: true,
      reason: message || 'HTTP/2 protocol error'
    };
  }

  if (name === 'MaxSizeExceededError' || name === 'ParseError') {
    return {
      category: 'resource',
      source: 'server',
      severity: 'low',
      canRetry: false,
      reason: message || 'Resource limitation'
    };
  }

  if (name === 'ConfigurationError' || name === 'ValidationError' || name === 'StateError') {
    return {
      category: 'state',
      source: 'client',
      severity: 'high',
      canRetry: false,
      reason: message || 'Request cannot be retried'
    };
  }

  return undefined;
}

export class MaxSizeExceededError extends ReckerError {
  maxSize: number;
  actualSize?: number;

  constructor(maxSize: number, actualSize?: number, request?: ReckerRequest) {
    const sizeInfo = actualSize
      ? `${actualSize} bytes (max: ${maxSize} bytes)`
      : `${maxSize} bytes`;
    super(
      `Response size exceeded maximum allowed: ${sizeInfo}`,
      request,
      undefined,
      [
        'Increase maxResponseSize if the larger payload is expected.',
        'Add pagination/streaming to reduce payload size.',
        'Ensure the upstream is not returning unexpected large responses.'
      ],
      false,
      {
        category: 'resource',
        source: 'server',
        severity: 'medium',
        canRetry: false,
        reason: 'Response size exceeded configured max'
      }
    );
    this.name = 'MaxSizeExceededError';
    this.maxSize = maxSize;
    this.actualSize = actualSize;
  }
}

function isRetryableStatus(status: number): boolean {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

/**
 * Error thrown when a request is aborted (via AbortController or timeout)
 */
export class AbortError extends ReckerError {
  reason?: string;

  constructor(reason?: string, request?: ReckerRequest) {
    super(
      reason || 'Request was aborted',
      request,
      undefined,
      [
        'Check if the abort was intentional (user-triggered or timeout).',
        'Increase timeout if the request needs more time to complete.',
        'Ensure AbortController is not being triggered prematurely.'
      ],
      true,
      {
        category: 'timeout',
        source: 'client',
        severity: 'low',
        canRetry: true,
        reason: reason ? `Request was aborted: ${reason}` : 'Request was aborted'
      }
    );
    this.name = 'AbortError';
    this.reason = reason;
  }
}

/**
 * Error thrown when connection to a service fails
 */
export class ConnectionError extends ReckerError {
  host?: string;
  port?: number;
  code?: string;

  constructor(
    message: string,
    options?: {
      host?: string;
      port?: number;
      code?: string;
      retriable?: boolean;
      request?: ReckerRequest;
    }
  ) {
    super(
      message,
      options?.request,
      undefined,
      [
        'Verify the host and port are correct and the service is running.',
        'Check network connectivity and firewall rules.',
        'Ensure the service is accepting connections on the specified port.'
      ],
      options?.retriable ?? true,
      {
        category: 'network',
        source: 'transport',
        severity: options?.retriable === false ? 'high' : 'medium',
        canRetry: options?.retriable ?? true,
        reason: options?.code ? `Connection error (${options.code})` : 'Connection error'
      }
    );
    this.name = 'ConnectionError';
    this.host = options?.host;
    this.port = options?.port;
    this.code = options?.code;
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthenticationError extends ReckerError {
  authType?: string;

  constructor(
    message: string,
    options?: {
      authType?: string;
      request?: ReckerRequest;
    }
  ) {
    super(
      message,
      options?.request,
      undefined,
      [
        'Verify credentials (username/password, API key, or certificate).',
        'Check if the account is active and has proper permissions.',
        'Ensure the authentication method matches what the server expects.'
      ],
      false
    );
    this.name = 'AuthenticationError';
    this.authType = options?.authType;
  }
}

/**
 * Error thrown when a protocol-specific operation fails
 */
export class ProtocolError extends ReckerError {
  protocol: string;
  code?: string | number;
  phase?: string;

  constructor(
    message: string,
    options: {
      protocol: string;
      code?: string | number;
      phase?: string;
      retriable?: boolean;
      request?: ReckerRequest;
    }
  ) {
    const protocolSuggestions: Record<string, string[]> = {
      ftp: [
        'Ensure the FTP server is running and accessible.',
        'Check file/directory permissions on the server.',
        'Verify the path exists and is correct.'
      ],
      sftp: [
        'Verify SSH credentials and key permissions.',
        'Check that the SFTP subsystem is enabled on the server.',
        'Ensure the target path exists and is accessible.'
      ],
      telnet: [
        'Verify the Telnet service is running on the target host.',
        'Check login credentials and terminal settings.',
        'Ensure the expected prompts match the server output.'
      ],
      udp: [
        'UDP is connectionless - verify the target is listening.',
        'Check firewall rules for UDP traffic.',
        'Ensure the message format matches what the server expects.'
      ],
      webrtc: [
        'Verify the signaling server is reachable.',
        'Check ICE server configuration (STUN/TURN).',
        'Ensure both peers have compatible codecs and capabilities.'
      ],
      dns: [
        'Verify the DNS server is reachable.',
        'Check if the domain exists and has the requested record type.',
        'Try an alternative DNS resolver.'
      ],
      tls: [
        'Verify the certificate is valid and not expired.',
        'Check that the hostname matches the certificate.',
        'Ensure TLS version and cipher suites are compatible.'
      ]
    };

    const suggestions = protocolSuggestions[options.protocol.toLowerCase()] || [
      'Check the protocol-specific documentation.',
      'Verify the server supports the requested operation.',
      'Review the error code for specific guidance.'
    ];

    super(message, options.request, undefined, suggestions, options.retriable ?? false);
    this.name = 'ProtocolError';
    this.protocol = options.protocol;
    this.code = options.code;
    this.phase = options.phase;
  }
}

/**
 * Error thrown when a resource is not found
 */
export class NotFoundError extends ReckerError {
  resource?: string;

  constructor(
    message: string,
    options?: {
      resource?: string;
      request?: ReckerRequest;
    }
  ) {
    super(
      message,
      options?.request,
      undefined,
      [
        'Verify the resource path or identifier is correct.',
        'Check if the resource was deleted or moved.',
        'Ensure you have permission to access this resource.'
      ],
      false
    );
    this.name = 'NotFoundError';
    this.resource = options?.resource;
  }
}

/**
 * Error thrown when a state precondition is not met
 */
export class StateError extends ReckerError {
  expectedState?: string;
  actualState?: string;

  constructor(
    message: string,
    options?: {
      expectedState?: string;
      actualState?: string;
      request?: ReckerRequest;
    }
  ) {
    super(
      message,
      options?.request,
      undefined,
      [
        'Ensure the required setup/initialization step was performed.',
        'Check that operations are called in the correct order.',
        'Verify the connection or resource is still valid.'
      ],
      false
    );
    this.name = 'StateError';
    this.expectedState = options?.expectedState;
    this.actualState = options?.actualState;
  }
}

/**
 * Error thrown when input validation fails
 */
export class ValidationError extends ReckerError {
  field?: string;
  value?: unknown;

  constructor(
    message: string,
    options?: {
      field?: string;
      value?: unknown;
      request?: ReckerRequest;
    }
  ) {
    super(
      message,
      options?.request,
      undefined,
      [
        'Check the input format and constraints.',
        'Refer to the API documentation for valid values.',
        'Ensure required fields are provided.'
      ],
      false
    );
    this.name = 'ValidationError';
    this.field = options?.field;
    this.value = options?.value;
  }
}

/**
 * Error thrown when configuration is invalid or missing
 */
export class ConfigurationError extends ReckerError {
  configKey?: string;

  constructor(
    message: string,
    options?: {
      configKey?: string;
      request?: ReckerRequest;
    }
  ) {
    super(
      message,
      options?.request,
      undefined,
      [
        'Check the configuration file or environment variables.',
        'Ensure all required configuration keys are set.',
        'Verify the configuration values are in the correct format.'
      ],
      false
    );
    this.name = 'ConfigurationError';
    this.configKey = options?.configKey;
  }
}

/**
 * Error thrown when an unsupported operation is attempted
 */
export class UnsupportedError extends ReckerError {
  feature?: string;

  constructor(
    message: string,
    options?: {
      feature?: string;
      request?: ReckerRequest;
    }
  ) {
    super(
      message,
      options?.request,
      undefined,
      [
        'Check if this feature is supported in the current context.',
        'Refer to the documentation for supported operations.',
        'Consider using an alternative approach.'
      ],
      false
    );
    this.name = 'UnsupportedError';
    this.feature = options?.feature;
  }
}

/**
 * Error thrown when a parse operation fails
 */
export class ParseError extends ReckerError {
  format?: string;
  position?: number;

  constructor(
    message: string,
    options?: {
      format?: string;
      position?: number;
      request?: ReckerRequest;
    }
  ) {
    super(
      message,
      options?.request,
      undefined,
      [
        'Verify the input is in the expected format.',
        'Check for malformed or corrupted data.',
        'Ensure the encoding is correct (UTF-8, etc.).'
      ],
      false
    );
    this.name = 'ParseError';
    this.format = options?.format;
    this.position = options?.position;
  }
}

/**
 * Error thrown when a queue operation is cancelled
 */
export class QueueCancelledError extends ReckerError {
  queueName?: string;

  constructor(
    message?: string,
    options?: {
      queueName?: string;
      request?: ReckerRequest;
    }
  ) {
    super(
      message || 'Queue operation was cancelled',
      options?.request,
      undefined,
      [
        'This is typically expected during shutdown.',
        'Check if the queue was manually cleared.',
        'Retry the operation if the queue is still active.'
      ],
      true,
      {
        category: 'queue',
        source: 'client',
        severity: 'low',
        canRetry: true,
        reason: message || 'Queue was cancelled'
      }
    );
    this.name = 'QueueCancelledError';
    this.queueName = options?.queueName;
  }
}

/**
 * Error thrown when a stream operation fails
 */
export class StreamError extends ReckerError {
  streamType?: string;

  constructor(
    message: string,
    options?: {
      streamType?: string;
      retriable?: boolean;
      request?: ReckerRequest;
    }
  ) {
    super(
      message,
      options?.request,
      undefined,
      [
        'Check if the stream was prematurely closed.',
        'Verify the data source is still available.',
        'Ensure proper error handling for stream events.'
      ],
      options?.retriable ?? false
    );
    this.name = 'StreamError';
    this.streamType = options?.streamType;
  }
}

/**
 * Error thrown when a download operation fails
 */
export class DownloadError extends ReckerError {
  url?: string;
  statusCode?: number;

  constructor(
    message: string,
    options?: {
      url?: string;
      statusCode?: number;
      retriable?: boolean;
      request?: ReckerRequest;
    }
  ) {
    super(
      message,
      options?.request,
      undefined,
      [
        'Verify the URL is correct and accessible.',
        'Check network connectivity.',
        options?.statusCode
          ? `HTTP ${options.statusCode} - check server response.`
          : 'Retry the download if the error is transient.'
      ],
      options?.retriable ?? true
    );
    this.name = 'DownloadError';
    this.url = options?.url;
    this.statusCode = options?.statusCode;
  }
}

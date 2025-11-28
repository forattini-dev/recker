import { ReckerRequest, ReckerResponse } from '../types/index.js';

export class ReckerError extends Error {
  request?: ReckerRequest;
  response?: ReckerResponse;
  suggestions: string[];
  retriable: boolean;

  constructor(
    message: string,
    request?: ReckerRequest,
    response?: ReckerResponse,
    suggestions: string[] = [],
    retriable = false
  ) {
    super(message);
    this.name = 'ReckerError';
    this.request = request;
    this.response = response;
    this.suggestions = suggestions;
    this.retriable = retriable;
  }
}

export class HttpError extends ReckerError {
  status: number;
  statusText: string;

  constructor(response: ReckerResponse, request?: ReckerRequest) {
    super(
      `Request failed with status code ${response.status} ${response.statusText}`,
      request,
      response,
      ['Check the upstream service response body for error details.', 'Inspect request headers/body to ensure they match the API contract.', 'Retry if this is a transient 5xx/429 error.'],
      isRetryableStatus(response.status)
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
  | 'request';      // Total request time

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
      request: 'Request timed out (total time exceeded)'
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

    super(message, request, undefined, suggestions, true);
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
    super(message, request, undefined, suggestions, true);
    this.name = 'NetworkError';
    this.code = code;
  }
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
      false
    );
    this.name = 'MaxSizeExceededError';
    this.maxSize = maxSize;
    this.actualSize = actualSize;
  }
}

function isRetryableStatus(status: number): boolean {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

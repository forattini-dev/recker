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
      true
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
      options?.retriable ?? true
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
      true
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

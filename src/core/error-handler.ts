/**
 * Centralized Error Handler for Recker
 *
 * This module provides:
 * 1. Error categorization and classification
 * 2. User-friendly error messages
 * 3. Actionable fix suggestions
 * 4. Retry guidance for retriable errors
 *
 * Used across the lib, CLI, and shell for consistent error handling.
 */

export type ErrorSeverity = 'error' | 'warning' | 'info';

export interface ErrorCategory {
  /** Short identifier for the error type */
  type: string;
  /** Human-readable label */
  label: string;
  /** Color function name for terminal output */
  color: 'red' | 'yellow' | 'cyan' | 'gray' | 'magenta';
  /** Whether this error type is generally retriable */
  retriable: boolean;
  /** Default retry delay in ms (if retriable) */
  retryDelay?: number;
}

export interface ClassifiedError {
  /** Original error */
  original: Error | string;
  /** Error category */
  category: ErrorCategory;
  /** User-friendly message */
  message: string;
  /** Detailed explanation */
  explanation: string;
  /** Suggested fix or action */
  suggestion: string;
  /** Whether to retry and after how long */
  retry: {
    should: boolean;
    afterMs?: number;
    reason?: string;
  };
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Error categories with their properties
 */
export const ERROR_CATEGORIES: Record<string, ErrorCategory> = {
  // HTTP Status Errors
  HTTP_400: {
    type: 'HTTP_400',
    label: 'Bad Request',
    color: 'yellow',
    retriable: false,
  },
  HTTP_401: {
    type: 'HTTP_401',
    label: 'Unauthorized',
    color: 'yellow',
    retriable: false,
  },
  HTTP_403: {
    type: 'HTTP_403',
    label: 'Forbidden',
    color: 'yellow',
    retriable: false,
  },
  HTTP_404: {
    type: 'HTTP_404',
    label: 'Not Found',
    color: 'yellow',
    retriable: false,
  },
  HTTP_405: {
    type: 'HTTP_405',
    label: 'Method Not Allowed',
    color: 'yellow',
    retriable: false,
  },
  HTTP_408: {
    type: 'HTTP_408',
    label: 'Request Timeout',
    color: 'yellow',
    retriable: true,
    retryDelay: 1000,
  },
  HTTP_429: {
    type: 'HTTP_429',
    label: 'Rate Limited',
    color: 'magenta',
    retriable: true,
    retryDelay: 60000, // 1 minute default
  },
  HTTP_5XX: {
    type: 'HTTP_5XX',
    label: 'Server Error',
    color: 'red',
    retriable: true,
    retryDelay: 5000,
  },

  // Network Errors
  TIMEOUT: {
    type: 'TIMEOUT',
    label: 'Timeout',
    color: 'yellow',
    retriable: true,
    retryDelay: 2000,
  },
  DNS: {
    type: 'DNS',
    label: 'DNS Error',
    color: 'red',
    retriable: true,
    retryDelay: 5000,
  },
  CONNECTION_REFUSED: {
    type: 'CONN_REFUSED',
    label: 'Connection Refused',
    color: 'red',
    retriable: true,
    retryDelay: 5000,
  },
  CONNECTION_RESET: {
    type: 'CONN_RESET',
    label: 'Connection Reset',
    color: 'red',
    retriable: true,
    retryDelay: 2000,
  },
  CONNECTION_CLOSED: {
    type: 'CONN_CLOSED',
    label: 'Connection Closed',
    color: 'red',
    retriable: true,
    retryDelay: 1000,
  },
  NETWORK_UNREACHABLE: {
    type: 'NET_UNREACHABLE',
    label: 'Network Unreachable',
    color: 'red',
    retriable: true,
    retryDelay: 10000,
  },

  // TLS/SSL Errors
  TLS_CERT_EXPIRED: {
    type: 'TLS_EXPIRED',
    label: 'Certificate Expired',
    color: 'red',
    retriable: false,
  },
  TLS_CERT_INVALID: {
    type: 'TLS_INVALID',
    label: 'Invalid Certificate',
    color: 'red',
    retriable: false,
  },
  TLS_HANDSHAKE: {
    type: 'TLS_HANDSHAKE',
    label: 'TLS Handshake Failed',
    color: 'red',
    retriable: true,
    retryDelay: 2000,
  },
  TLS_PROTOCOL: {
    type: 'TLS_PROTOCOL',
    label: 'TLS Protocol Error',
    color: 'red',
    retriable: false,
  },

  // Auth Errors
  AUTH_MISSING: {
    type: 'AUTH_MISSING',
    label: 'Missing Credentials',
    color: 'yellow',
    retriable: false,
  },
  AUTH_INVALID: {
    type: 'AUTH_INVALID',
    label: 'Invalid Credentials',
    color: 'yellow',
    retriable: false,
  },
  AUTH_EXPIRED: {
    type: 'AUTH_EXPIRED',
    label: 'Token Expired',
    color: 'yellow',
    retriable: true,
    retryDelay: 0, // Retry immediately after refresh
  },

  // Parse Errors
  PARSE_JSON: {
    type: 'PARSE_JSON',
    label: 'Invalid JSON',
    color: 'yellow',
    retriable: false,
  },
  PARSE_XML: {
    type: 'PARSE_XML',
    label: 'Invalid XML',
    color: 'yellow',
    retriable: false,
  },
  PARSE_HTML: {
    type: 'PARSE_HTML',
    label: 'Invalid HTML',
    color: 'yellow',
    retriable: false,
  },

  // Protocol Errors
  PROTOCOL_FTP: {
    type: 'FTP_ERROR',
    label: 'FTP Error',
    color: 'red',
    retriable: true,
    retryDelay: 2000,
  },
  PROTOCOL_WEBSOCKET: {
    type: 'WS_ERROR',
    label: 'WebSocket Error',
    color: 'red',
    retriable: true,
    retryDelay: 1000,
  },
  PROTOCOL_GRAPHQL: {
    type: 'GRAPHQL_ERROR',
    label: 'GraphQL Error',
    color: 'yellow',
    retriable: false,
  },

  // Generic
  UNKNOWN: {
    type: 'UNKNOWN',
    label: 'Unknown Error',
    color: 'red',
    retriable: false,
  },
};

/**
 * Error suggestions database
 */
const ERROR_SUGGESTIONS: Record<string, { explanation: string; suggestion: string }> = {
  // HTTP Status
  HTTP_400: {
    explanation: 'The server could not understand the request due to invalid syntax.',
    suggestion: 'Check the request body, headers, and URL parameters. Ensure JSON is valid if sending JSON data.',
  },
  HTTP_401: {
    explanation: 'Authentication is required but was not provided or is invalid.',
    suggestion: 'Check your API key, token, or credentials. Ensure the Authorization header is correct.',
  },
  HTTP_403: {
    explanation: 'You do not have permission to access this resource.',
    suggestion: 'Verify you have the correct permissions. Check API scopes or contact the API administrator.',
  },
  HTTP_404: {
    explanation: 'The requested resource was not found on the server.',
    suggestion: 'Check the URL path for typos. The resource may have been moved or deleted.',
  },
  HTTP_405: {
    explanation: 'The HTTP method is not allowed for this endpoint.',
    suggestion: 'Check the API documentation for allowed methods (GET, POST, PUT, DELETE, etc.).',
  },
  HTTP_408: {
    explanation: 'The server timed out waiting for the request.',
    suggestion: 'Retry the request. If it persists, check your network connection or try later.',
  },
  HTTP_429: {
    explanation: 'You have sent too many requests in a given time period (rate limited).',
    suggestion: 'Wait before retrying. Check the Retry-After header for the wait time. Consider reducing request frequency.',
  },
  HTTP_5XX: {
    explanation: 'The server encountered an internal error.',
    suggestion: 'This is a server-side issue. Wait and retry. If persistent, contact the API provider.',
  },

  // Network
  TIMEOUT: {
    explanation: 'The request took too long and was aborted.',
    suggestion: 'Increase the timeout setting, reduce payload size, or check if the server is responding slowly.',
  },
  DNS: {
    explanation: 'The domain name could not be resolved to an IP address.',
    suggestion: 'Check the domain spelling. Verify DNS configuration. Try a different DNS server (8.8.8.8).',
  },
  CONN_REFUSED: {
    explanation: 'The server actively refused the connection.',
    suggestion: 'Verify the server is running and the port is correct. Check firewall rules.',
  },
  CONN_RESET: {
    explanation: 'The connection was forcibly closed by the server.',
    suggestion: 'The server may be overloaded. Retry after a brief delay. Check for rate limiting.',
  },
  CONN_CLOSED: {
    explanation: 'The connection was closed unexpectedly.',
    suggestion: 'The server may have closed idle connections. Retry the request.',
  },
  NET_UNREACHABLE: {
    explanation: 'The network is unreachable.',
    suggestion: 'Check your internet connection. Verify VPN or proxy settings.',
  },

  // TLS/SSL
  TLS_EXPIRED: {
    explanation: 'The server\'s SSL certificate has expired.',
    suggestion: 'Contact the server administrator to renew the certificate. Do NOT bypass SSL verification in production.',
  },
  TLS_INVALID: {
    explanation: 'The server\'s SSL certificate is invalid or self-signed.',
    suggestion: 'Verify you\'re connecting to the correct server. For testing, you can use rejectUnauthorized: false.',
  },
  TLS_HANDSHAKE: {
    explanation: 'The TLS handshake failed.',
    suggestion: 'The server may have TLS configuration issues. Try again or check supported TLS versions.',
  },
  TLS_PROTOCOL: {
    explanation: 'TLS protocol error occurred.',
    suggestion: 'The server may not support your TLS version. Try specifying a different TLS version.',
  },

  // Auth
  AUTH_MISSING: {
    explanation: 'No authentication credentials were provided.',
    suggestion: 'Set the required environment variable (e.g., OPENAI_API_KEY) or pass credentials in the request.',
  },
  AUTH_INVALID: {
    explanation: 'The provided credentials are invalid.',
    suggestion: 'Regenerate your API key or token. Ensure you\'re using the correct credentials.',
  },
  AUTH_EXPIRED: {
    explanation: 'The authentication token has expired.',
    suggestion: 'Refresh your token and retry. Enable automatic token refresh if available.',
  },

  // Parse
  PARSE_JSON: {
    explanation: 'The response is not valid JSON.',
    suggestion: 'The server may have returned HTML error page or plain text. Check the raw response.',
  },
  PARSE_XML: {
    explanation: 'The response is not valid XML.',
    suggestion: 'Verify the endpoint returns XML. Check for encoding issues.',
  },
  PARSE_HTML: {
    explanation: 'Failed to parse HTML content.',
    suggestion: 'The HTML may be malformed. Try a more lenient parser or check the source.',
  },

  // Protocols
  FTP_ERROR: {
    explanation: 'An FTP operation failed.',
    suggestion: 'Check credentials, path permissions, and server status. Ensure passive mode if behind NAT.',
  },
  WS_ERROR: {
    explanation: 'WebSocket connection or operation failed.',
    suggestion: 'Check the WebSocket URL (ws:// or wss://). Verify the server supports WebSocket.',
  },
  GRAPHQL_ERROR: {
    explanation: 'The GraphQL query returned errors.',
    suggestion: 'Check the query syntax and field names. Verify required variables are provided.',
  },

  // Generic
  UNKNOWN: {
    explanation: 'An unexpected error occurred.',
    suggestion: 'Check the error details. If the issue persists, report it with the full error message.',
  },
};

/**
 * Classify an error and provide actionable information
 */
export function classifyError(
  error: Error | string | unknown,
  context?: Record<string, unknown>
): ClassifiedError {
  const errorStr = error instanceof Error ? error.message : String(error);
  const errorLower = errorStr.toLowerCase();

  // Detect HTTP status codes
  const httpStatusMatch = errorStr.match(/(?:status|code)[:\s]*(\d{3})/i) ||
                          errorStr.match(/HTTP[\/\s]*\d*\.?\d*[:\s]*(\d{3})/i) ||
                          errorStr.match(/^(\d{3})\s/);

  if (httpStatusMatch) {
    const status = parseInt(httpStatusMatch[1]);
    return classifyHttpError(status, error, context);
  }

  // Network errors
  if (errorLower.includes('timeout') || errorLower.includes('etimedout') || errorLower.includes('timed out')) {
    return buildClassifiedError('TIMEOUT', error, context);
  }

  if (errorLower.includes('enotfound') || errorLower.includes('getaddrinfo') ||
      errorLower.includes('dns') && errorLower.includes('fail')) {
    return buildClassifiedError('DNS', error, context);
  }

  if (errorLower.includes('econnrefused') || errorLower.includes('connection refused')) {
    return buildClassifiedError('CONNECTION_REFUSED', error, context);
  }

  if (errorLower.includes('econnreset') || errorLower.includes('connection reset')) {
    return buildClassifiedError('CONNECTION_RESET', error, context);
  }

  if (errorLower.includes('socket hang up') || errorLower.includes('epipe') ||
      errorLower.includes('closed')) {
    return buildClassifiedError('CONNECTION_CLOSED', error, context);
  }

  if (errorLower.includes('enetunreach') || errorLower.includes('network unreachable') ||
      errorLower.includes('ehostunreach')) {
    return buildClassifiedError('NETWORK_UNREACHABLE', error, context);
  }

  // TLS/SSL errors
  if (errorLower.includes('certificate') && errorLower.includes('expired')) {
    return buildClassifiedError('TLS_CERT_EXPIRED', error, context);
  }

  if (errorLower.includes('self signed') || errorLower.includes('unable to verify') ||
      (errorLower.includes('certificate') && errorLower.includes('invalid'))) {
    return buildClassifiedError('TLS_CERT_INVALID', error, context);
  }

  if (errorLower.includes('handshake') || errorLower.includes('ssl_error_handshake')) {
    return buildClassifiedError('TLS_HANDSHAKE', error, context);
  }

  if (errorLower.includes('ssl') || errorLower.includes('tls')) {
    return buildClassifiedError('TLS_PROTOCOL', error, context);
  }

  // Auth errors
  if (errorLower.includes('api key') || errorLower.includes('apikey') ||
      (errorLower.includes('missing') && errorLower.includes('credential'))) {
    return buildClassifiedError('AUTH_MISSING', error, context);
  }

  if (errorLower.includes('invalid') && (errorLower.includes('key') || errorLower.includes('token'))) {
    return buildClassifiedError('AUTH_INVALID', error, context);
  }

  if (errorLower.includes('expired') && (errorLower.includes('token') || errorLower.includes('auth'))) {
    return buildClassifiedError('AUTH_EXPIRED', error, context);
  }

  // Parse errors
  if (errorLower.includes('json') && (errorLower.includes('parse') || errorLower.includes('unexpected'))) {
    return buildClassifiedError('PARSE_JSON', error, context);
  }

  if (errorLower.includes('xml') && (errorLower.includes('parse') || errorLower.includes('invalid'))) {
    return buildClassifiedError('PARSE_XML', error, context);
  }

  // Protocol errors
  if (errorLower.includes('ftp')) {
    return buildClassifiedError('PROTOCOL_FTP', error, context);
  }

  if (errorLower.includes('websocket') || errorLower.includes('ws://')) {
    return buildClassifiedError('PROTOCOL_WEBSOCKET', error, context);
  }

  if (errorLower.includes('graphql')) {
    return buildClassifiedError('PROTOCOL_GRAPHQL', error, context);
  }

  // Unknown error
  return buildClassifiedError('UNKNOWN', error, context);
}

/**
 * Classify HTTP status code errors
 */
function classifyHttpError(
  status: number,
  error: Error | string | unknown,
  context?: Record<string, unknown>
): ClassifiedError {
  // Specific status codes
  if (status === 400) return buildClassifiedError('HTTP_400', error, context, { status });
  if (status === 401) return buildClassifiedError('HTTP_401', error, context, { status });
  if (status === 403) return buildClassifiedError('HTTP_403', error, context, { status });
  if (status === 404) return buildClassifiedError('HTTP_404', error, context, { status });
  if (status === 405) return buildClassifiedError('HTTP_405', error, context, { status });
  if (status === 408) return buildClassifiedError('HTTP_408', error, context, { status });
  if (status === 429) return buildClassifiedError('HTTP_429', error, context, { status });

  // 5xx errors
  if (status >= 500 && status < 600) {
    return buildClassifiedError('HTTP_5XX', error, context, { status });
  }

  // Other 4xx
  if (status >= 400 && status < 500) {
    const category: ErrorCategory = {
      type: `HTTP_${status}`,
      label: `HTTP ${status}`,
      color: 'yellow',
      retriable: false,
    };
    return {
      original: error instanceof Error ? error : new Error(String(error)),
      category,
      message: `HTTP ${status} error`,
      explanation: `The server returned status code ${status}.`,
      suggestion: 'Check the API documentation for this status code.',
      retry: { should: false },
      context,
    };
  }

  return buildClassifiedError('UNKNOWN', error, context);
}

/**
 * Build a classified error from a category key
 */
function buildClassifiedError(
  categoryKey: string,
  error: Error | string | unknown,
  context?: Record<string, unknown>,
  extra?: Record<string, unknown>
): ClassifiedError {
  const category = ERROR_CATEGORIES[categoryKey] || ERROR_CATEGORIES.UNKNOWN;
  const suggestions = ERROR_SUGGESTIONS[category.type] || ERROR_SUGGESTIONS.UNKNOWN;

  // Parse Retry-After header if present in context
  let retryAfterMs = category.retryDelay;
  if (context?.retryAfter) {
    const retryAfter = context.retryAfter;
    if (typeof retryAfter === 'number') {
      retryAfterMs = retryAfter * 1000; // seconds to ms
    } else if (typeof retryAfter === 'string') {
      // Could be a date or seconds
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        retryAfterMs = seconds * 1000;
      } else {
        const date = new Date(retryAfter);
        if (!isNaN(date.getTime())) {
          retryAfterMs = Math.max(0, date.getTime() - Date.now());
        }
      }
    }
  }

  return {
    original: error instanceof Error ? error : new Error(String(error)),
    category,
    message: `${category.label}`,
    explanation: suggestions.explanation,
    suggestion: suggestions.suggestion,
    retry: {
      should: category.retriable,
      afterMs: category.retriable ? retryAfterMs : undefined,
      reason: category.retriable
        ? `This error is usually temporary. Retry after ${formatRetryDelay(retryAfterMs)}.`
        : 'This error requires fixing the request or configuration.',
    },
    context: { ...context, ...extra },
  };
}

/**
 * Format retry delay for display
 */
function formatRetryDelay(ms?: number): string {
  if (!ms) return 'a moment';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.ceil(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.ceil(ms / 60000)} minute${ms >= 120000 ? 's' : ''}`;
  return `${Math.ceil(ms / 3600000)} hour${ms >= 7200000 ? 's' : ''}`;
}

/**
 * Format a classified error for terminal output
 */
export function formatErrorForTerminal(
  classified: ClassifiedError,
  options: {
    verbose?: boolean;
    colors?: {
      red: (s: string) => string;
      yellow: (s: string) => string;
      cyan: (s: string) => string;
      gray: (s: string) => string;
      magenta: (s: string) => string;
      bold: (s: string) => string;
      green: (s: string) => string;
    };
  } = {}
): string {
  const colors = options.colors || {
    red: (s: string) => s,
    yellow: (s: string) => s,
    cyan: (s: string) => s,
    gray: (s: string) => s,
    magenta: (s: string) => s,
    bold: (s: string) => s,
    green: (s: string) => s,
  };

  const colorFn = colors[classified.category.color] || colors.red;
  const lines: string[] = [];

  // Error header
  lines.push(`${colorFn('Error:')} ${classified.message}`);

  // Explanation
  lines.push(`${colors.gray(classified.explanation)}`);

  // Suggestion
  lines.push('');
  lines.push(`${colors.cyan('Fix:')} ${classified.suggestion}`);

  // Retry info
  if (classified.retry.should) {
    const retryMsg = classified.retry.afterMs
      ? `Retry after ${formatRetryDelay(classified.retry.afterMs)}`
      : 'Safe to retry immediately';
    lines.push(`${colors.green('Retry:')} ${retryMsg}`);
  }

  // Verbose mode: show original error
  if (options.verbose && classified.original instanceof Error) {
    lines.push('');
    lines.push(colors.gray('Original error:'));
    lines.push(colors.gray(`  ${classified.original.message}`));
    if (classified.original.stack) {
      const stackLines = classified.original.stack.split('\n').slice(1, 4);
      stackLines.forEach((line) => lines.push(colors.gray(`  ${line.trim()}`)));
    }
  }

  return lines.join('\n');
}

/**
 * Format error for JSON output
 */
export function formatErrorForJson(classified: ClassifiedError): Record<string, unknown> {
  return {
    error: {
      type: classified.category.type,
      label: classified.category.label,
      message: classified.message,
      explanation: classified.explanation,
      suggestion: classified.suggestion,
      retriable: classified.retry.should,
      retryAfterMs: classified.retry.afterMs,
      context: classified.context,
    },
  };
}

/**
 * Quick check if an error is retriable
 */
export function isRetriable(error: Error | string | unknown): boolean {
  return classifyError(error).retry.should;
}

/**
 * Get suggested retry delay for an error
 */
export function getRetryDelay(error: Error | string | unknown, context?: Record<string, unknown>): number {
  const classified = classifyError(error, context);
  return classified.retry.afterMs || 1000;
}

/**
 * Create a user-friendly error message
 */
export function getUserFriendlyMessage(error: Error | string | unknown): string {
  const classified = classifyError(error);
  return `${classified.message}: ${classified.explanation}`;
}

/**
 * Create a complete error report
 */
export function createErrorReport(
  error: Error | string | unknown,
  context?: Record<string, unknown>
): {
  summary: string;
  details: ClassifiedError;
  formatted: string;
} {
  const classified = classifyError(error, context);
  return {
    summary: getUserFriendlyMessage(error),
    details: classified,
    formatted: formatErrorForTerminal(classified, { verbose: true }),
  };
}

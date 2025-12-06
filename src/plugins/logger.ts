import { Plugin, ReckerRequest, ReckerResponse } from '../types/index.js';
import { Logger, consoleLogger } from '../types/logger.js';

export interface LoggerPluginOptions {
  /**
   * Logger instance (Pino, Winston, console, or custom)
   * @default console
   *
   * @example Pino
   * ```typescript
   * import pino from 'pino';
   * client.use(logger({ logger: pino() }));
   * ```
   *
   * @example Winston
   * ```typescript
   * import winston from 'winston';
   * client.use(logger({ logger: winston.createLogger() }));
   * ```
   */
  logger?: Logger;

  /**
   * Log level for requests/responses
   * @default 'info'
   */
  level?: 'debug' | 'info';

  /**
   * Show request/response headers
   * @default false
   */
  showHeaders?: boolean;

  /**
   * Show request body
   * @default false
   */
  showBody?: boolean;

  /**
   * Include timing information
   * @default true
   */
  showTimings?: boolean;
}

/**
 * Logger plugin - logs HTTP requests and responses
 *
 * @example Basic usage with console
 * ```typescript
 * const client = createClient({ baseUrl: 'https://api.example.com' });
 * client.use(logger());
 * ```
 *
 * @example With Pino
 * ```typescript
 * import pino from 'pino';
 *
 * const log = pino({ level: 'debug' });
 * const client = createClient({ baseUrl: 'https://api.example.com' });
 * client.use(logger({ logger: log }));
 * ```
 *
 * @example With Winston
 * ```typescript
 * import winston from 'winston';
 *
 * const log = winston.createLogger({
 *   level: 'debug',
 *   transports: [new winston.transports.Console()]
 * });
 * const client = createClient({ baseUrl: 'https://api.example.com' });
 * client.use(logger({ logger: log }));
 * ```
 *
 * @example Show headers and body
 * ```typescript
 * client.use(logger({
 *   logger: pino(),
 *   showHeaders: true,
 *   showBody: true
 * }));
 * ```
 */
export function loggerPlugin(options: LoggerPluginOptions = {}): Plugin {
  const log = options.logger || consoleLogger;
  const level = options.level || 'info';
  const showHeaders = options.showHeaders || false;
  const showBody = options.showBody || false;
  const showTimings = options.showTimings !== false;

  const timers = new WeakMap<ReckerRequest, number>();

  const logFn = level === 'debug' ? log.debug.bind(log) : log.info.bind(log);

  return (client: any) => {
    client.beforeRequest((req: ReckerRequest) => {
      timers.set(req, performance.now());

      // Build request log object (Pino-style structured logging)
      const logData: Record<string, unknown> = {
        type: 'request',
        method: req.method,
        url: req.url,
      };

      if (showHeaders) {
        const headers: Record<string, string> = {};
        req.headers.forEach((v, k) => {
          // Mask sensitive headers
          if (k.toLowerCase() === 'authorization') {
            headers[k] = '[REDACTED]';
          } else {
            headers[k] = v;
          }
        });
        logData.headers = headers;
      }

      if (showBody && req.body) {
        if (typeof req.body === 'string') {
          try {
            logData.body = JSON.parse(req.body);
          } catch {
            logData.body = req.body;
          }
        } else {
          logData.body = '[Stream/Binary]';
        }
      }

      logFn(logData, `→ ${req.method} ${req.url}`);
    });

    client.afterResponse((req: ReckerRequest, res: ReckerResponse) => {
      const start = timers.get(req);
      const duration = start ? Math.round(performance.now() - start) : 0;

      // Build response log object
      const logData: Record<string, unknown> = {
        type: 'response',
        method: req.method,
        url: req.url,
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
        duration,
      };

      if (showHeaders) {
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => (headers[k] = v));
        logData.headers = headers;
      }

      if (showTimings && res.timings) {
        logData.timings = res.timings;
      }

      const contentLength = res.headers.get('content-length');
      if (contentLength) {
        logData.size = parseInt(contentLength, 10);
      }

      logFn(logData, `← ${res.status} ${req.method} ${req.url} (${duration}ms)`);
    });

    client.onError((err: Error, req: ReckerRequest) => {
      const start = timers.get(req);
      const duration = start ? Math.round(performance.now() - start) : 0;

      log.error(
        {
          type: 'error',
          method: req.method,
          url: req.url,
          error: err.message,
          errorName: err.name,
          duration,
        },
        `✖ ${req.method} ${req.url} - ${err.message}`
      );
    });
  };
}

/**
 * Convert a request to a cURL command string
 * Useful for debugging and reproducing requests
 *
 * @example
 * ```typescript
 * client.beforeRequest((req) => {
 *   console.log(toCurl(req));
 * });
 * ```
 */
export function toCurl(req: ReckerRequest): string {
  const parts = ['curl'];

  // Method
  if (req.method !== 'GET') {
    parts.push(`-X ${req.method}`);
  }

  // URL
  parts.push(`'${req.url}'`);

  // Headers
  req.headers.forEach((value, key) => {
    // Mask authorization header in output
    const displayValue = key.toLowerCase() === 'authorization' ? '[REDACTED]' : value;
    parts.push(`-H '${key}: ${displayValue}'`);
  });

  // Body
  if (req.body) {
    if (typeof req.body === 'string') {
      parts.push(`-d '${req.body}'`);
    } else if (req.body instanceof URLSearchParams) {
      parts.push(`-d '${req.body.toString()}'`);
    } else {
      parts.push(`-d '[Body]'`);
    }
  }

  return parts.join(' \\\n  ');
}

// Re-export Logger type for convenience
export type { Logger } from '../types/logger.js';
export { consoleLogger, silentLogger, createLevelLogger } from '../types/logger.js';

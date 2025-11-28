/**
 * Universal Logger Interface
 * Compatible with Pino, Winston, console, and custom loggers
 */

/**
 * Logger interface that works with popular logging libraries
 *
 * @example Pino
 * ```typescript
 * import pino from 'pino';
 * const logger = pino({ level: 'debug' });
 * const client = createClient({ logger });
 * ```
 *
 * @example Winston
 * ```typescript
 * import winston from 'winston';
 * const logger = winston.createLogger({ level: 'debug' });
 * const client = createClient({ logger });
 * ```
 *
 * @example Console (default)
 * ```typescript
 * const client = createClient({ logger: console });
 * ```
 *
 * @example Custom logger
 * ```typescript
 * const logger = {
 *   debug: (msg) => myCustomLog('DEBUG', msg),
 *   info: (msg) => myCustomLog('INFO', msg),
 *   warn: (msg) => myCustomLog('WARN', msg),
 *   error: (msg) => myCustomLog('ERROR', msg),
 * };
 * const client = createClient({ logger });
 * ```
 */
export interface Logger {
  /**
   * Debug level logging
   * Called for detailed diagnostic information
   */
  debug(message: string, ...args: unknown[]): void;
  debug(obj: object, message?: string, ...args: unknown[]): void;

  /**
   * Info level logging
   * Called for general informational messages
   */
  info(message: string, ...args: unknown[]): void;
  info(obj: object, message?: string, ...args: unknown[]): void;

  /**
   * Warn level logging
   * Called for warning conditions
   */
  warn(message: string, ...args: unknown[]): void;
  warn(obj: object, message?: string, ...args: unknown[]): void;

  /**
   * Error level logging
   * Called for error conditions
   */
  error(message: string, ...args: unknown[]): void;
  error(obj: object, message?: string, ...args: unknown[]): void;
}

/**
 * Minimal logger interface for simple use cases
 * Only requires the methods you actually use
 */
export type MinimalLogger = Partial<Logger> & {
  info: Logger['info'];
};

/**
 * Console adapter - wraps console to match Logger interface
 * Used as default when no logger is provided
 */
export const consoleLogger: Logger = {
  debug: (msgOrObj: string | object, ...args: unknown[]) => {
    if (typeof msgOrObj === 'object') {
      console.debug(msgOrObj, ...args);
    } else {
      console.debug(msgOrObj, ...args);
    }
  },
  info: (msgOrObj: string | object, ...args: unknown[]) => {
    if (typeof msgOrObj === 'object') {
      console.info(msgOrObj, ...args);
    } else {
      console.info(msgOrObj, ...args);
    }
  },
  warn: (msgOrObj: string | object, ...args: unknown[]) => {
    if (typeof msgOrObj === 'object') {
      console.warn(msgOrObj, ...args);
    } else {
      console.warn(msgOrObj, ...args);
    }
  },
  error: (msgOrObj: string | object, ...args: unknown[]) => {
    if (typeof msgOrObj === 'object') {
      console.error(msgOrObj, ...args);
    } else {
      console.error(msgOrObj, ...args);
    }
  },
};

/**
 * Silent logger - no output
 * Useful for testing or when you want to completely disable logging
 */
export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Create a logger that only logs at or above the specified level
 */
export function createLevelLogger(
  baseLogger: Logger,
  minLevel: 'debug' | 'info' | 'warn' | 'error'
): Logger {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const minLevelNum = levels[minLevel];

  return {
    debug: (...args: unknown[]) => {
      if (levels.debug >= minLevelNum) {
        (baseLogger.debug as Function)(...args);
      }
    },
    info: (...args: unknown[]) => {
      if (levels.info >= minLevelNum) {
        (baseLogger.info as Function)(...args);
      }
    },
    warn: (...args: unknown[]) => {
      if (levels.warn >= minLevelNum) {
        (baseLogger.warn as Function)(...args);
      }
    },
    error: (...args: unknown[]) => {
      if (levels.error >= minLevelNum) {
        (baseLogger.error as Function)(...args);
      }
    },
  };
}

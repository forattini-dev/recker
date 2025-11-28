import { ReckerRequest, ReckerResponse, Timings } from '../types/index.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  timestamp?: boolean;
  colors?: boolean;
}

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 999,
};

export class Logger {
  private level: LogLevel;
  private prefix: string;
  private useTimestamp: boolean;
  private useColors: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level || this.detectLogLevel();
    this.prefix = options.prefix || 'recker';
    this.useTimestamp = options.timestamp !== false;
    this.useColors = options.colors !== false && this.supportsColors();
  }

  private detectLogLevel(): LogLevel {
    const env = process.env.DEBUG || '';
    if (env === '*' || env.includes('recker') || env.includes('*')) {
      return 'debug';
    }
    return 'none';
  }

  private supportsColors(): boolean {
    // Check if terminal supports colors
    return (
      process.stdout.isTTY &&
      !process.env.NO_COLOR &&
      process.env.TERM !== 'dumb'
    );
  }

  private colorize(text: string, color: keyof typeof colors): string {
    if (!this.useColors) return text;
    return `${colors[color]}${text}${colors.reset}`;
  }

  private formatTimestamp(): string {
    if (!this.useTimestamp) return '';
    const now = new Date();
    const time = now.toTimeString().split(' ')[0];
    return this.colorize(`[${time}]`, 'gray') + ' ';
  }

  private shouldLog(level: LogLevel): boolean {
    return levels[level] >= levels[this.level];
  }

  private log(level: LogLevel, message: string) {
    if (!this.shouldLog(level)) return;

    const timestamp = this.formatTimestamp();
    const prefix = this.colorize(`[${this.prefix}]`, 'cyan');
    console.log(`${timestamp}${prefix} ${message}`);
  }

  debug(message: string) {
    this.log('debug', message);
  }

  info(message: string) {
    this.log('info', message);
  }

  warn(message: string) {
    this.log('warn', this.colorize(message, 'yellow'));
  }

  error(message: string) {
    this.log('error', this.colorize(message, 'red'));
  }

  /**
   * Log HTTP request
   */
  logRequest(req: ReckerRequest) {
    if (!this.shouldLog('debug')) return;

    const method = this.colorize(req.method, 'blue');
    const url = this.colorize(req.url, 'bright');
    this.debug(`${this.colorize('→', 'green')} ${method} ${url}`);

    // Log headers if present
    if (req.headers && Array.from(req.headers.keys()).length > 0) {
      const headerStr = Array.from(req.headers.entries())
        .map(([k, v]) => `  ${this.colorize(k, 'gray')}: ${v}`)
        .join('\n');
      console.log(headerStr);
    }
  }

  /**
   * Log HTTP response with timings
   */
  logResponse(req: ReckerRequest, res: ReckerResponse, startTime: number) {
    if (!this.shouldLog('debug')) return;

    const duration = Date.now() - startTime;
    const statusColor = res.ok ? 'green' : 'red';
    const status = this.colorize(String(res.status), statusColor);
    const method = this.colorize(req.method, 'gray');

    this.debug(
      `${this.colorize('←', 'green')} ${status} ${method} ${req.url} ${this.colorize(`(${duration}ms)`, 'gray')}`
    );

    // Log timings if available
    if (res.timings) {
      this.logTimings(res.timings);
    }

    // Log response size if available
    const contentLength = res.headers.get('content-length');
    if (contentLength) {
      const size = this.formatBytes(parseInt(contentLength, 10));
      console.log(`  ${this.colorize('Size:', 'gray')} ${size}`);
    }
  }

  /**
   * Log detailed timings
   */
  logTimings(timings: Timings) {
    if (!this.shouldLog('debug')) return;

    const parts: string[] = [];

    if (timings.dns) parts.push(`DNS: ${timings.dns.toFixed(0)}ms`);
    if (timings.tcp) parts.push(`TCP: ${timings.tcp.toFixed(0)}ms`);
    if (timings.tls) parts.push(`TLS: ${timings.tls.toFixed(0)}ms`);
    if (timings.firstByte) parts.push(`TTFB: ${timings.firstByte.toFixed(0)}ms`);
    if (timings.total) parts.push(`Total: ${timings.total.toFixed(0)}ms`);

    if (parts.length > 0) {
      const timelinesStr = parts.join(', ');
      console.log(`  ${this.colorize('├─', 'gray')} ${timelinesStr}`);
    }
  }

  /**
   * Log error
   */
  logError(req: ReckerRequest, error: Error) {
    if (!this.shouldLog('error')) return;

    const method = this.colorize(req.method, 'gray');
    this.error(`${this.colorize('✖', 'red')} ${method} ${req.url}`);
    console.log(`  ${this.colorize('Error:', 'red')} ${error.message}`);

    if (error.stack && this.shouldLog('debug')) {
      const stack = error.stack
        .split('\n')
        .slice(1, 4)
        .map((line) => `  ${this.colorize('│', 'gray')} ${line.trim()}`)
        .join('\n');
      console.log(stack);
    }
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }
}

// Global logger instance
let globalLogger: Logger | null = null;

export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}

export function setLogger(logger: Logger) {
  globalLogger = logger;
}

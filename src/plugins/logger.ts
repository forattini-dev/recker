import { Plugin, ReckerRequest, ReckerResponse } from '../types/index.js';

export interface LoggerOptions {
  log?: (message: string) => void;
  logError?: (message: string, error: any) => void;
  showHeaders?: boolean;
  showBody?: boolean;
  colors?: boolean;
}

const ANSI = {
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  DIM: "\x1b[2m",
  RED: "\x1b[31m",
  GREEN: "\x1b[32m",
  YELLOW: "\x1b[33m",
  BLUE: "\x1b[34m",
  MAGENTA: "\x1b[35m",
  CYAN: "\x1b[36m",
};

export function logger(options: LoggerOptions = {}): Plugin {
  const log = options.log || console.log;
  const logError = options.logError || console.error;
  const showHeaders = options.showHeaders || false;
  const showBody = options.showBody || false;
  const useColors = options.colors !== false; // Default true

  const c = (color: keyof typeof ANSI, text: string) => 
    useColors ? `${ANSI[color]}${text}${ANSI.RESET}` : text;

  const timers = new WeakMap<ReckerRequest, number>();

  return (client: any) => {
    client.beforeRequest((req: ReckerRequest) => {
      timers.set(req, performance.now());
      const method = c('BLUE', req.method.padEnd(7));
      const url = c('CYAN', req.url);
      log(`${c('BOLD', '-->')} ${method} ${url}`);
      
      if (showHeaders) {
        req.headers.forEach((v, k) => log(`    ${c('DIM', k)}: ${v}`));
      }

      if (showBody && req.body) {
          // Simplistic body logging for now
          log(`    ${c('DIM', 'Body')}: ${typeof req.body === 'string' ? req.body : '[Object/Stream]'}`);
      }
    });

    client.afterResponse((req: ReckerRequest, res: ReckerResponse) => {
      const start = timers.get(req);
      const duration = start ? (performance.now() - start).toFixed(0) + 'ms' : '?';
      
      const statusColor = res.ok ? 'GREEN' : 'RED';
      const status = c(statusColor, String(res.status));
      const statusText = c(statusColor, res.statusText);
      
      log(`${c('BOLD', '<--')} ${c('BLUE', req.method.padEnd(7))} ${c('CYAN', req.url)} ${status} ${statusText} ${c('YELLOW', duration)}`);
      
      if (showHeaders) {
          res.headers.forEach((v, k) => log(`    ${c('DIM', k)}: ${v}`));
      }
    });

    client.onError((err: Error, req: ReckerRequest) => {
        const start = timers.get(req);
        const duration = start ? (performance.now() - start).toFixed(0) + 'ms' : '?';
        logError(`${c('RED', '!!!')} ${c('BLUE', req.method)} ${c('CYAN', req.url)} ${c('RED', err.message)} ${c('YELLOW', duration)}`, err);
    });
  };
}

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
        parts.push(`-H '${key}: ${value}'`);
    });
    
    // Body
    if (req.body) {
        if (typeof req.body === 'string') {
             parts.push(`-d '${req.body}'`);
        } else if (req.body instanceof URLSearchParams) {
             parts.push(`-d '${req.body.toString()}'`);
        } else {
            parts.push(`-d '[Body]'`); // Placeholder for streams/blobs
        }
    }
    
    return parts.join(' ');
}

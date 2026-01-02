/**
 * CLI Event Handler
 *
 * Handles command events for CLI output.
 * Formats events as console output with colors and spinners.
 */

import type {
  CommandEvent,
  StartEvent,
  ProgressEvent,
  CompleteEvent,
  ErrorEvent,
  SpiderPageEvent,
  SpiderQueueEvent,
  DownloadSegmentEvent,
  SEOScoreEvent,
  ServerRequestEvent,
  HandlerContext,
} from '../types.js';
import { CommandEmitter } from '../emitter.js';

// =============================================================================
// ANSI Colors (inline to avoid dependencies)
// =============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const c = {
  error: (s: string) => `${colors.red}${s}${colors.reset}`,
  success: (s: string) => `${colors.green}${s}${colors.reset}`,
  warn: (s: string) => `${colors.yellow}${s}${colors.reset}`,
  info: (s: string) => `${colors.cyan}${s}${colors.reset}`,
  dim: (s: string) => `${colors.dim}${s}${colors.reset}`,
  bold: (s: string) => `${colors.bold}${s}${colors.reset}`,
};

// =============================================================================
// CLI Handler
// =============================================================================

export class CLIHandler {
  private context: HandlerContext;
  private progressLine: string = '';
  private lastProgressTime: number = 0;

  constructor(context: Partial<HandlerContext> = {}) {
    this.context = {
      mode: 'cli',
      verbose: false,
      ...context,
    };
  }

  /**
   * Attach handler to a command emitter
   */
  attach(emitter: CommandEmitter): void {
    emitter.onEvent((event) => this.handle(event));
  }

  /**
   * Handle an event
   */
  handle(event: CommandEvent): void {
    switch (event.type) {
      case 'start':
        this.handleStart(event);
        break;
      case 'progress':
        this.handleProgress(event);
        break;
      case 'complete':
        this.handleComplete(event);
        break;
      case 'error':
        this.handleError(event);
        break;
      case 'spider:page':
        this.handleSpiderPage(event);
        break;
      case 'spider:queue':
        this.handleSpiderQueue(event);
        break;
      case 'download:segment':
        this.handleDownloadSegment(event);
        break;
      case 'seo:score':
        this.handleSEOScore(event);
        break;
      case 'server:request':
        this.handleServerRequest(event);
        break;
      default:
        if (this.context.verbose) {
          console.log(c.dim(`[${event.command}] ${event.type}`));
        }
    }
  }

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  private handleStart(event: StartEvent): void {
    console.log(`\n${c.info('▶')} ${c.bold(event.command)} ${c.dim(event.target)}`);
    if (this.context.verbose && event.options) {
      console.log(c.dim(`  Options: ${JSON.stringify(event.options)}`));
    }
  }

  private handleProgress(event: ProgressEvent): void {
    // Throttle progress updates to avoid flickering
    const now = Date.now();
    if (now - this.lastProgressTime < 100) return;
    this.lastProgressTime = now;

    let line = '  ';

    if (event.percent !== undefined) {
      const bar = this.progressBar(event.percent);
      line += `${bar} ${event.percent.toFixed(0)}%`;
    }

    if (event.current !== undefined) {
      line += ` ${event.current}`;
      if (event.total !== undefined) {
        line += `/${event.total}`;
      }
    }

    if (event.currentItem) {
      line += ` ${c.dim(event.currentItem)}`;
    }

    if (event.metrics) {
      const metricsStr = Object.entries(event.metrics)
        .map(([k, v]) => `${k}:${v}`)
        .join(' ');
      line += ` ${c.dim(metricsStr)}`;
    }

    this.writeProgress(line);
  }

  private handleComplete(event: CompleteEvent): void {
    this.clearProgress();
    const duration = this.formatDuration(event.duration);
    console.log(`${c.success('✓')} Completed in ${c.bold(duration)}`);

    if (this.context.verbose && Object.keys(event.summary).length > 0) {
      console.log(c.dim(`  Summary: ${JSON.stringify(event.summary)}`));
    }
  }

  private handleError(event: ErrorEvent): void {
    this.clearProgress();
    console.error(`${c.error('✗')} ${event.message}`);
    if (event.context) {
      console.error(c.dim(`  Context: ${event.context}`));
    }
    if (this.context.verbose && event.stack) {
      console.error(c.dim(event.stack));
    }
  }

  private handleSpiderPage(event: SpiderPageEvent): void {
    if (this.context.verbose) {
      const status = event.status < 400 ? c.success(String(event.status)) : c.error(String(event.status));
      console.log(`  ${status} ${c.dim(`[${event.depth}]`)} ${event.url}`);
    }
  }

  private handleSpiderQueue(event: SpiderQueueEvent): void {
    const line = `  ${c.info('🕷')} Crawled: ${event.crawled} | Queued: ${event.queued} | Depth: ${event.depth}`;
    this.writeProgress(line);
  }

  private handleDownloadSegment(event: DownloadSegmentEvent): void {
    const mb = (event.totalBytes / 1024 / 1024).toFixed(1);
    let line = `  ${c.info('⬇')} Segment ${event.segmentNumber}`;
    if (event.totalSegments) {
      line += `/${event.totalSegments}`;
    }
    line += ` | ${mb} MB`;
    if (event.duration) {
      line += ` | ${this.formatDuration(event.duration * 1000)}`;
    }
    this.writeProgress(line);
  }

  private handleSEOScore(event: SEOScoreEvent): void {
    const score = event.overall;
    const color = score >= 80 ? c.success : score >= 50 ? c.warn : c.error;
    console.log(`\n  SEO Score: ${color(String(score) + '/100')}`);
    console.log(c.dim(`  Technical: ${event.categories.technical} | Content: ${event.categories.content}`));
    console.log(c.dim(`  Performance: ${event.categories.performance} | Mobile: ${event.categories.mobile}`));
  }

  private handleServerRequest(event: ServerRequestEvent): void {
    const status = event.status < 400 ? c.success(String(event.status)) : c.error(String(event.status));
    const duration = `${event.duration}ms`;
    console.log(`  ${status} ${event.method} ${event.path} ${c.dim(duration)}`);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private progressBar(percent: number, width: number = 20): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return `[${c.success('█'.repeat(filled))}${c.dim('░'.repeat(empty))}]`;
  }

  private writeProgress(line: string): void {
    // Clear previous progress line and write new one
    process.stdout.write(`\r\x1b[K${line}`);
    this.progressLine = line;
  }

  private clearProgress(): void {
    if (this.progressLine) {
      process.stdout.write('\r\x1b[K');
      this.progressLine = '';
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m${secs}s`;
  }
}

/**
 * Create a CLI handler and attach to emitter
 */
export function attachCLIHandler(emitter: CommandEmitter, options?: Partial<HandlerContext>): CLIHandler {
  const handler = new CLIHandler(options);
  handler.attach(emitter);
  return handler;
}

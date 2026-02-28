/**
 * TUI Event Handler
 *
 * Handles command events for Terminal UI (tuiuiu shell).
 * Updates reactive hooks: useJobs, useDomains.
 */

import type {
  CommandEvent,
  ProgressEvent,
  CompleteEvent,
  ErrorEvent,
  SpiderPageEvent,
  SpiderQueueEvent,
  DownloadSegmentEvent,
  ServerRequestEvent,
  DNSRecordEvent,
  HandlerContext,
} from '../types.js';
import { CommandEmitter } from '../emitter.js';

// Import hooks (lazy loaded to avoid circular deps)
let useJobsModule: typeof import('../../tui/hooks/useJobs.js') | null = null;
let useDomainsModule: typeof import('../../tui/hooks/useDomains.js') | null = null;

async function getUseJobs() {
  if (!useJobsModule) {
    useJobsModule = await import('../../tui/hooks/useJobs.js');
  }
  return useJobsModule;
}

async function getUseDomains() {
  if (!useDomainsModule) {
    useDomainsModule = await import('../../tui/hooks/useDomains.js');
  }
  return useDomainsModule;
}

// =============================================================================
// TUI Handler
// =============================================================================

export class TUIHandler {
  private context: HandlerContext;

  constructor(context: Partial<HandlerContext> = {}) {
    this.context = {
      mode: 'tui',
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
  async handle(event: CommandEvent): Promise<void> {
    // Update job if we have a jobId
    if (this.context.jobId !== undefined) {
      await this.updateJob(event);
    }

    // Handle domain-related events
    await this.handleDomainEvent(event);
  }

  // ---------------------------------------------------------------------------
  // Job Updates
  // ---------------------------------------------------------------------------

  private async updateJob(event: CommandEvent): Promise<void> {
    const jobId = this.context.jobId!;
    const jobs = await getUseJobs();
    const manager = jobs.getJobManager();

    switch (event.type) {
      case 'progress':
        this.handleJobProgress(manager, jobId, event);
        break;

      case 'complete':
        manager.updateStatus(jobId, 'completed');
        manager.addLog(jobId, {
          timestamp: event.timestamp,
          level: 'info',
          message: `Completed in ${this.formatDuration((event as CompleteEvent).duration)}`,
        });
        break;

      case 'error':
        const errorEvent = event as ErrorEvent;
        manager.addLog(jobId, {
          timestamp: event.timestamp,
          level: 'error',
          message: errorEvent.message,
        });
        if (errorEvent.code === 'ABORT') {
          manager.updateStatus(jobId, 'stopped');
        } else {
          manager.updateStatus(jobId, 'failed');
        }
        break;

      case 'spider:page':
        const pageEvent = event as SpiderPageEvent;
        manager.addLog(jobId, {
          timestamp: event.timestamp,
          level: pageEvent.status < 400 ? 'info' : 'warn',
          message: `[${pageEvent.status}] ${pageEvent.url}`,
        });
        break;

      case 'spider:queue':
        const queueEvent = event as SpiderQueueEvent;
        manager.updateProgress(jobId, {
          pages: queueEvent.crawled,
          queued: queueEvent.queued,
        });
        break;

      case 'download:segment':
        const segmentEvent = event as DownloadSegmentEvent;
        manager.updateProgress(jobId, {
          segments: segmentEvent.segmentNumber,
          bytes: segmentEvent.totalBytes,
        });
        break;

      case 'server:request':
        const reqEvent = event as ServerRequestEvent;
        manager.addLog(jobId, {
          timestamp: event.timestamp,
          level: 'info',
          message: `${reqEvent.method} ${reqEvent.path} → ${reqEvent.status}`,
        });
        break;

      case 'data':
        // Handle data events with specific categories
        const dataEvent = event as import('../types.js').DataEvent;
        if (dataEvent.category === 'seo:fetch') {
          const payload = dataEvent.payload as { url: string; status: number; size: number };
          manager.addLog(jobId, {
            timestamp: event.timestamp,
            level: 'info',
            message: `Fetched ${Math.round(payload.size / 1024)}KB (${payload.status})`,
          });
        } else if (dataEvent.category === 'seo:check') {
          const payload = dataEvent.payload as { name: string; category: string; status: string; message: string };
          if (payload.status === 'error' || payload.status === 'warning') {
            manager.addLog(jobId, {
              timestamp: event.timestamp,
              level: payload.status === 'error' ? 'error' : 'warn',
              message: `[${payload.category}] ${payload.message}`,
            });
          }
        }
        break;
    }
  }

  private handleJobProgress(manager: any, jobId: number, event: ProgressEvent): void {
    const progress: Record<string, number> = {};

    if (event.current !== undefined) {
      progress.current = event.current;
    }
    if (event.total !== undefined) {
      progress.total = event.total;
    }
    if (event.percent !== undefined) {
      progress.percent = event.percent;
    }
    if (event.metrics) {
      Object.entries(event.metrics).forEach(([k, v]) => {
        if (typeof v === 'number') {
          progress[k] = v;
        }
      });
    }

    if (Object.keys(progress).length > 0) {
      manager.updateProgress(jobId, progress);
    }

    if (event.currentItem) {
      manager.addLog(jobId, {
        timestamp: event.timestamp,
        level: 'debug',
        message: event.currentItem,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Domain Intelligence Updates
  // ---------------------------------------------------------------------------

  private async handleDomainEvent(event: CommandEvent): Promise<void> {
    const domains = await getUseDomains();

    switch (event.type) {
      case 'spider:page': {
        const pageEvent = event as SpiderPageEvent;
        const domain = this.extractDomain(pageEvent.url);
        if (domain) {
          // Track as a request
          domains.trackRequest(domain, {
            method: 'GET',
            path: new URL(pageEvent.url).pathname,
            status: pageEvent.status,
            time: pageEvent.duration,
          });
        }
        break;
      }

      case 'spider:queue': {
        // Get target from context if available
        const queueEvent = event as SpiderQueueEvent;
        // Spider summary will be tracked on complete
        break;
      }

      case 'dns:record': {
        const dnsEvent = event as DNSRecordEvent;
        // DNS records are tracked by the dns command itself
        // This is for when other commands discover DNS info
        break;
      }

      case 'seo:score': {
        // SEO scores are tracked by the seo command itself
        // This enables automatic domain intelligence from SEO scans
        break;
      }

      case 'download:segment': {
        // Downloads are tracked when the job completes
        break;
      }

      case 'complete': {
        const completeEvent = event as CompleteEvent;
        const summary = completeEvent.summary;
        const securitySummary = summary.security as Record<string, unknown> | undefined;

        // Track spider completion as domain intelligence
        if (event.command === 'spider' && summary.url) {
          const domain = this.extractDomain(summary.url as string);
          if (domain) {
            domains.trackSpider(domain, {
              pagesFound: (summary.pagesVisited as number) || 0,
              externalLinks: (summary.externalLinks as number) || 0,
              internalLinks: (summary.internalLinks as number) || 0,
              images: (summary.images as number) || 0,
              scripts: (summary.scripts as number) || 0,
              stylesheets: (summary.stylesheets as number) || 0,
              errors: (summary.errors as number) || 0,
                security: securitySummary
                ? {
                    pages: Number(securitySummary.pages ?? 0),
                    blockedPages: Number(securitySummary.blockedPages ?? 0),
                    captchaPages: Number(securitySummary.captchaPages ?? 0),
                    captchaProviders: typeof securitySummary.captchaProviders === 'object'
                      ? securitySummary.captchaProviders as Record<string, number>
                      : undefined,
                    attempts: Number(securitySummary.attempts ?? 0),
                    retries: Number(securitySummary.retries ?? 0),
                    transportUsage: securitySummary.transportUsage as Record<string, number> | undefined,
                    avgAttempts: typeof securitySummary.avgAttempts === 'number'
                      ? securitySummary.avgAttempts
                      : undefined,
                    avgTtfbMs: typeof securitySummary.avgTtfbMs === 'number'
                      ? securitySummary.avgTtfbMs
                      : undefined,
                    avgTotalMs: typeof securitySummary.avgTotalMs === 'number'
                      ? securitySummary.avgTotalMs
                      : undefined,
                    avgDownloadMs: typeof securitySummary.avgDownloadMs === 'number'
                      ? securitySummary.avgDownloadMs
                      : undefined,
                  }
                : undefined,
            });
          }
        }

        // Track download completion
        if (['live', 'hls', 'video'].includes(event.command) && summary.url) {
          const domain = this.extractDomain(summary.url as string);
          if (domain) {
            domains.trackDownload(domain, {
              type: event.command as 'live' | 'video' | 'hls' | 'file',
              filename: (summary.filename as string) || 'unknown',
              size: (summary.bytes as number) || 0,
              duration: (summary.duration as number) || 0,
              url: summary.url as string,
            });
          }
        }

        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return null;
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
 * Create a TUI handler and attach to emitter
 */
export function attachTUIHandler(
  emitter: CommandEmitter,
  options?: Partial<HandlerContext>
): TUIHandler {
  const handler = new TUIHandler(options);
  handler.attach(emitter);
  return handler;
}

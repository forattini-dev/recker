/**
 * SEO Runner - Event-Driven SEO Analysis Command
 *
 * Wraps the core SEO analyzer and emits events for CLI/TUI handlers.
 * This separates the analysis logic from the output presentation.
 *
 * @example
 * ```typescript
 * const runner = new SEORunner();
 *
 * // CLI mode
 * attachCLIHandler(runner, { verbose: true });
 *
 * // TUI mode (background job)
 * attachTUIHandler(runner, { jobId: 123 });
 *
 * await runner.run('https://example.com');
 * ```
 */

import { createClient, type Client } from '../../core/client.js';
import { CommandEmitter } from '../events/emitter.js';
import type { SeoReport, SeoCheckResult, SeoStatus } from '../../seo/types.js';

// =============================================================================
// Types
// =============================================================================

export interface SEORunnerOptions {
  /** HTTP client to use (optional, creates one if not provided) */
  client?: Client;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Filter checks by category */
  category?: string;
  /** Show all checks including passed ones */
  showAll?: boolean;
}

export interface SEORunnerResult {
  url: string;
  score: number;
  grade: string;
  title?: string;
  metaDescription?: string;
  duration: number;
  timing?: {
    ttfb?: number;
    total?: number;
    dns?: number;
    tcp?: number;
    tls?: number;
    download?: number;
  };
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    passed: number;
    totalChecks: number;
  };
  categories: Record<string, {
    score: number;
    errors: number;
    warnings: number;
    passed: number;
  }>;
  checks: Array<{
    name: string;
    category: string;
    status: SeoStatus;
    message: string;
    recommendation?: string;
  }>;
  openGraph?: Record<string, string>;
  keywords?: string[];
}

// =============================================================================
// SEO Runner
// =============================================================================

export class SEORunner extends CommandEmitter {
  private client: Client;

  constructor(client?: Client) {
    super('seo');
    this.client = client ?? createClient({
      timeout: 30000,
      checkHooks: false,
    } as any);
  }

  /**
   * Run SEO analysis with event emission
   */
  async run(url: string, options: SEORunnerOptions = {}): Promise<SEORunnerResult> {
    const { signal, category, showAll = false } = options;

    // Normalize URL
    let targetUrl = url;
    if (!targetUrl.startsWith('http')) {
      targetUrl = `https://${targetUrl}`;
    }

    // Emit start event
    this.emitStart(targetUrl, { category, showAll });

    const startTime = performance.now();

    try {
      // Check for abort
      if (signal?.aborted) {
        throw new Error('Aborted');
      }

      // Emit progress: fetching
      this.emitProgress({
        current: 1,
        total: 3,
        currentItem: `Fetching ${targetUrl}...`,
        percent: 10,
      });

      // Fetch the page
      const response = await this.client.get(targetUrl, { signal } as any);
      const html = await response.text();

      // Emit data event for fetch info
      this.emit('data', {
        type: 'data',
        category: 'seo:fetch',
        timestamp: Date.now(),
        command: 'seo',
        level: 'info',
        payload: {
          url: targetUrl,
          status: response.status,
          size: html.length,
          ttfb: response.timings?.firstByte,
        },
      });

      // Check for abort
      if (signal?.aborted) {
        throw new Error('Aborted');
      }

      // Emit progress: analyzing
      this.emitProgress({
        current: 2,
        total: 3,
        currentItem: `Analyzing ${Math.round(html.length / 1024)}KB of HTML...`,
        percent: 40,
      });

      // Import and run SEO analyzer
      const { analyzeSeo } = await import('../../seo/index.js');
      const report = await analyzeSeo(html, { baseUrl: targetUrl });

      // Build result
      const duration = Math.round(performance.now() - startTime);
      const t = response.timings;

      const result: SEORunnerResult = {
        url: targetUrl,
        score: report.score,
        grade: report.grade,
        title: report.title?.text,
        metaDescription: report.metaDescription?.text,
        duration,
        timing: {
          ttfb: t?.firstByte ? Math.round(t.firstByte) : undefined,
          total: t?.total ? Math.round(t.total) : duration,
          dns: t?.dns ? Math.round(t.dns) : undefined,
          tcp: t?.tcp ? Math.round(t.tcp) : undefined,
          tls: t?.tls ? Math.round(t.tls) : undefined,
          download: t?.content ? Math.round(t.content) : undefined,
        },
        summary: {
          errors: report.summary.errors,
          warnings: report.summary.warnings,
          infos: report.summary.infos,
          passed: report.summary.passed,
          totalChecks: report.summary.totalChecks,
        },
        categories: {},
        checks: [],
        openGraph: report.openGraph,
        keywords: report.keywords?.topKeywords?.map(k => k.word),
      };

      // Process checks by category
      for (const check of report.checks) {
        // Filter by category if specified
        if (category && check.category !== category) continue;

        // Filter passed checks unless showAll
        if (!showAll && check.status === 'pass') continue;

        // Emit data event for check
        this.emit('data', {
          type: 'data',
          category: 'seo:check',
          timestamp: Date.now(),
          command: 'seo',
          level: this.statusToLevel(check.status),
          payload: {
            name: check.name,
            category: check.category,
            status: check.status,
            message: check.message,
            recommendation: check.recommendation,
          },
        });

        result.checks.push({
          name: check.name,
          category: check.category,
          status: check.status,
          message: check.message,
          recommendation: check.recommendation,
        });

        // Track category stats
        if (!result.categories[check.category]) {
          result.categories[check.category] = {
            score: 0,
            errors: 0,
            warnings: 0,
            passed: 0,
          };
        }
        const cat = result.categories[check.category];
        if (check.status === 'fail') cat.errors++;
        else if (check.status === 'warn') cat.warnings++;
        else if (check.status === 'pass') cat.passed++;
      }

      // Calculate category scores
      for (const catName of Object.keys(result.categories)) {
        const cat = result.categories[catName];
        const total = cat.errors + cat.warnings + cat.passed;
        if (total > 0) {
          cat.score = Math.round((cat.passed / total) * 100);
        }
      }

      // Emit progress: complete
      this.emitProgress({
        current: 3,
        total: 3,
        currentItem: `Analysis complete: ${report.grade} (${report.score}/100)`,
        percent: 100,
      });

      // Emit completion
      this.emitComplete({
        url: targetUrl,
        score: report.score,
        grade: report.grade,
        duration,
        errors: report.summary.errors,
        warnings: report.summary.warnings,
        passed: report.summary.passed,
      });

      return result;

    } catch (err: any) {
      if (signal?.aborted || err.message === 'Aborted') {
        this.emitError('SEO analysis stopped by user', { code: 'ABORT' });
      } else {
        this.emitError(err.message || 'SEO analysis failed', {
          stack: err.stack,
          context: targetUrl,
        });
      }
      throw err;
    }
  }

  private statusToLevel(status: SeoStatus): 'info' | 'warn' | 'error' | 'debug' {
    switch (status) {
      case 'fail': return 'error';
      case 'warn': return 'warn';
      case 'pass': return 'debug';
      default: return 'info';
    }
  }
}

/**
 * Convenience function to run SEO analysis with CLI output
 */
export async function runSEOWithEvents(
  url: string,
  options: SEORunnerOptions & { verbose?: boolean; json?: boolean } = {}
): Promise<SEORunnerResult> {
  const { verbose = false, json = false, ...seoOptions } = options;

  const runner = new SEORunner(options.client);

  if (!json) {
    // Attach CLI handler for console output
    const { attachCLIHandler } = await import('../events/handlers/cli.js');
    attachCLIHandler(runner, { verbose });
  }

  return runner.run(url, seoOptions);
}

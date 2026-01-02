/**
 * Crawl Commands
 *
 * Commands for web crawling and SEO analysis:
 * - seo: SEO analysis
 * - spider: Web crawling
 * - robots: robots.txt parsing
 * - sitemap: sitemap.xml parsing
 */

import { runSpiderWithEvents } from '../../commands/spider-runner.js';
import { hasFlag, parseArgValueFlag, isHelpArg } from './parser.js';
import type { CommandContext, CommandResult } from './types.js';

// =============================================================================
// SEO Command
// =============================================================================

export async function cmdSeo(ctx: CommandContext, args: string[]): Promise<CommandResult> {
  let url = args[0];

  // Show help if explicit help flag
  if (isHelpArg(url)) {
    ctx.addHistoryItem({
      type: 'info',
      content: `SEO Analysis - Analyze page SEO

Usage: seo <url> [options]

Options:
  --all, -a        Show all checks (including passed)
  --json           Output raw JSON
  -o, --output     Save report to file
  -O, --outputDir  Save to directory (auto-generates filename)
  category=<name>  Filter by category

Categories:
  performance, security, content, links, images,
  meta, technical, accessibility, og, twitter, i18n

Examples:
  seo google.com
  seo example.com --all
  seo example.com -o report.json
  seo example.com -O ~/reports/
  seo example.com category=performance`,
    });
    return { success: true };
  }

  if (!url) {
    const base = ctx.baseUrl();
    if (base) {
      url = base;
    } else {
      ctx.addHistoryItem({
        type: 'info',
        content: `SEO Analysis - Analyze page SEO

Usage: seo <url> [options]

Options:
  --all, -a        Show all checks (including passed)
  --json           Output raw JSON
  -o, --output     Save report to file
  -O, --outputDir  Save to directory (auto-generates filename)
  category=<name>  Filter by category

Categories:
  performance, security, content, links, images,
  meta, technical, accessibility, og, twitter, i18n

Examples:
  seo google.com
  seo example.com --all
  seo example.com -o report.json
  seo example.com -O ~/reports/
  seo example.com category=performance`,
      });
      return { success: true };
    }
  }

  if (!url.startsWith('http')) {
    url = `https://${url}`;
  }

  // Parse output flags
  const jsonOutput = hasFlag(args, ['--json']);
  const outputPath = parseArgValueFlag(args, ['-o', '--output'], undefined) as string | undefined;
  const outputDir = parseArgValueFlag(args, ['-O', '--outputDir'], undefined) as string | undefined;

  // Extract domain for auto-filename
  let domain: string;
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = url.replace(/^https?:\/\//, '').split('/')[0];
  }

  ctx.setIsLoading(true);
  ctx.addHistoryItem({ type: 'info', content: `Analyzing SEO for ${url}...` });

  // Allow TUI to render loading state before blocking operation
  await new Promise(resolve => setTimeout(resolve, 50));

  try {
    const { analyzeSeo, resolveOutputPath, writeReport, formatSeoReportJson } = await import('../../../seo/index.js');
    const { formatReportForJson } = await import('../../../seo/output.js');

    // Resolve output path if needed
    const finalOutputPath = resolveOutputPath({
      output: outputPath,
      outputDir,
      type: 'seo',
      domain,
    });
    const startTime = performance.now();

    ctx.addHistoryItem({ type: 'info', content: `Fetching page...` });
    await new Promise(resolve => setTimeout(resolve, 10));

    const res = await ctx.client.get(url);
    const html = await res.text();

    ctx.addHistoryItem({ type: 'info', content: `Analyzing ${Math.round(html.length / 1024)}KB of HTML...` });
    await new Promise(resolve => setTimeout(resolve, 10));
    const duration = Math.round(performance.now() - startTime);

    const report = await analyzeSeo(html, { baseUrl: url });

    // Add timing
    const t = res.timings;
    report.timing = {
      ttfb: t?.firstByte ? Math.round(t.firstByte) : undefined,
      total: t?.total ? Math.round(t.total) : duration,
      dns: t?.dns ? Math.round(t.dns) : undefined,
      tcp: t?.tcp ? Math.round(t.tcp) : undefined,
      tls: t?.tls ? Math.round(t.tls) : undefined,
      download: t?.content ? Math.round(t.content) : undefined,
    };

    // Track domain SEO data
    try {
      const hostname = new URL(url).hostname;
      ctx.trackSeo(hostname, {
        score: report.score,
        issues: report.summary.errors + report.summary.warnings,
        categories: {
          technical: 0,
          content: 0,
          meta: 0,
        },
      });
    } catch { /* ignore tracking errors */ }

    // Handle file output
    if (jsonOutput || finalOutputPath) {
      const jsonResult = formatReportForJson(
        formatSeoReportJson(report, url),
        url,
        'seo'
      );

      if (finalOutputPath) {
        // Save to file
        const savedPath = await writeReport(finalOutputPath, jsonResult);
        ctx.addHistoryItem({
          type: 'info',
          content: `✔ Report saved to: ${savedPath}`,
        });
      }

      if (jsonOutput) {
        // Show JSON in history
        ctx.addHistoryItem({
          type: 'response',
          content: jsonResult,
          meta: { responseType: 'json', time: duration },
        });
      }
    }

    // Pass full report data for rich rendering (unless --json only)
    // Include ALL data so RichResponse can display categorized checks like CLI
    if (!jsonOutput) {
      ctx.addHistoryItem({
        type: 'response',
        content: {
          url,
          score: report.score,
          grade: report.grade,
          title: report.title,
          metaDescription: report.metaDescription,
          timing: report.timing,
          openGraph: report.openGraph,
          twitterCard: report.twitterCard,
          keywords: report.keywords,
          summary: {
            passed: report.summary.passed,
            warnings: report.summary.warnings,
            errors: report.summary.errors,
            infos: report.summary.infos,
            vitals: report.summary.vitals,
            topIssues: report.summary.topIssues,
            quickWins: report.summary.quickWins,
            completeness: report.summary.completeness,
          },
          // Technical, content, and structural data
          technical: report.technical,
          content: report.content,
          headings: report.headings,
          links: report.links,
          structuredData: report.structuredData,
          // Full checks array for categorized display
          checks: report.checks,
        },
        meta: { responseType: 'seo', time: duration },
      });
    }

    ctx.setLastResponse(report);
    return { success: true, data: report, output: finalOutputPath };

  } catch (err: any) {
    ctx.addHistoryItem({ type: 'error', content: `SEO analysis failed: ${err.message}` });
    return { success: false, error: err.message };

  } finally {
    ctx.setIsLoading(false);
  }
}

// =============================================================================
// Spider Command
// =============================================================================

interface SpiderOptions {
  url: string;
  depth?: number;
  limit?: number;
  concurrency?: number;
  robots?: boolean;
  json?: boolean;
  seo?: boolean;
  output?: string;
  focus?: string;
}

export async function cmdSpider(ctx: CommandContext, args: string[]): Promise<CommandResult> {
  let url = args[0];

  // Show help if no args, help flag, or explicitly requested
  if (!url || isHelpArg(url)) {
    ctx.addHistoryItem({
      type: 'info',
      content: `Spider - Crawl a website

Usage: spider <url> [options]

Options:
  depth=<n>        Max link depth (default: 5)
  limit=<n>        Max pages to crawl (default: 100)
  concurrency=<n>  Parallel requests (default: 5)
  --seo            Enable SEO analysis per page
  --robots         Respect robots.txt
  -o, --output     Save JSON report to file
  -O, --outputDir  Save to directory (auto-generates filename)
  -L, --jsonl      Stream output as JSONL (one JSON per line)
  -E, --extract    CSS selectors to extract (can be repeated)
  --include        URL pattern to include (regex)
  --exclude        URL pattern to exclude (regex)

Extraction syntax:
  -E h1            Extract text from h1 tags
  -E "a:href"      Extract href attribute from links
  -E ".price:text" Extract text from .price elements

Focus modes (with --seo):
  focus=links      Link analysis
  focus=duplicates Duplicate content
  focus=security   Security issues
  focus=ai         AI-search readiness

Examples:
  spider example.com
  spider example.com depth=3 limit=50
  spider example.com -o crawl.json
  spider example.com -E h1 -E h2 --json
  spider example.com -E "a:href" -o links.json
  spider example.com --include "^/blog/"
  spider example.com --seo -o full-report.json
  spider example.com --jsonl -o crawl.jsonl`,
    });
    return { success: true };
  }

  if (!url.startsWith('http')) {
    url = `https://${url}`;
  }

  // Parse output flags using parser utilities
  const outputPath = parseArgValueFlag(args, ['-o', '--output'], undefined) as string | undefined;
  const outputDir = parseArgValueFlag(args, ['-O', '--outputDir'], undefined) as string | undefined;

  // Extract domain for auto-filename
  let domain: string;
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = url.replace(/^https?:\/\//, '').split('/')[0];
  }

  // Parse options from args
  const opts: SpiderOptions = { url };
  let seoEnabled = false;
  let jsonlEnabled = false;
  const extractSelectors: string[] = [];
  const includePatterns: string[] = [];
  const excludePatterns: string[] = [];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--seo' || arg === '-S') {
      seoEnabled = true;
    } else if (arg === '--robots' || arg === '-r') {
      opts.robots = true;
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--jsonl' || arg === '-L') {
      jsonlEnabled = true;
    } else if (arg.startsWith('depth=')) {
      opts.depth = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('limit=')) {
      opts.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('concurrency=')) {
      opts.concurrency = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('output=')) {
      // Legacy syntax support
      opts.output = arg.split('=')[1];
    } else if (arg.startsWith('focus=')) {
      opts.focus = arg.split('=')[1];
    } else if (arg === '-E' || arg === '--extract') {
      // Next arg is the selector
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        extractSelectors.push(args[++i]);
      }
    } else if (arg.startsWith('--extract=')) {
      extractSelectors.push(arg.split('=')[1]);
    } else if (arg === '--include') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        includePatterns.push(args[++i]);
      }
    } else if (arg.startsWith('--include=')) {
      includePatterns.push(arg.split('=')[1]);
    } else if (arg === '--exclude') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        excludePatterns.push(args[++i]);
      }
    } else if (arg.startsWith('--exclude=')) {
      excludePatterns.push(arg.split('=')[1]);
    }
  }

  opts.seo = seoEnabled;

  // Combine output options (new flags take precedence over legacy)
  const finalOutputPath = outputPath || opts.output || (outputDir ? undefined : undefined);

  ctx.setIsLoading(true);
  ctx.addHistoryItem({
    type: 'info',
    content: `Starting spider on ${url}... (depth=${opts.depth || 5}, limit=${opts.limit || 100})`,
  });

  // Allow TUI to render before blocking operation
  await new Promise(resolve => setTimeout(resolve, 50));

  try {
    // Use runSpiderWithEvents with json: true to capture output instead of printing
    const result = await runSpiderWithEvents(url, {
      depth: opts.depth,
      limit: opts.limit,
      concurrency: opts.concurrency,
      seo: opts.seo,
      focus: opts.focus as any,
      json: true, // Don't print to console, we'll show in TUI
      extract: extractSelectors.length > 0 ? extractSelectors : undefined,
      include: includePatterns.length > 0 ? includePatterns : undefined,
      exclude: excludePatterns.length > 0 ? excludePatterns : undefined,
    });

    // Track domain intelligence
    try {
      const hostname = new URL(url).hostname;
      ctx.trackSpider(hostname, {
        pagesFound: result.pagesVisited,
        internalLinks: result.internalLinks,
        externalLinks: result.externalLinks,
        images: result.images,
        scripts: result.scripts,
        stylesheets: result.stylesheets,
        errors: result.errors,
      });
    } catch { /* ignore tracking errors */ }

    // Handle file output
    const { resolveOutputPath, writeReport, formatReportForJson } = await import('../../../seo/output.js');

    // Resolve output path if auto-generated filename needed
    const resolvedOutputPath = resolveOutputPath({
      output: finalOutputPath,
      outputDir,
      type: seoEnabled ? 'seo-spider' : 'spider',
      domain,
      ext: jsonlEnabled ? 'json' : 'json', // Keep .json for now, could use .jsonl
    });

    if (resolvedOutputPath) {
      let savedPath: string;

      if (jsonlEnabled) {
        // JSONL format: one JSON per line
        const { JsonlWriter } = await import('../../commands/spider-runner.js');
        const writer = new JsonlWriter({ output: resolvedOutputPath });
        await writer.init();

        // Write start record
        writer.write({
          type: 'start',
          url,
          startedAt: new Date().toISOString(),
          config: {
            depth: opts.depth ?? 5,
            limit: opts.limit ?? 100,
            seo: seoEnabled,
          },
        });

        // Write each page with full data
        for (const page of result.pages) {
          writer.write({
            type: 'page',
            url: page.url,
            status: page.status,
            title: page.title,
            depth: page.depth,
            links: page.links,
            duration: page.duration,
            seoScore: page.seoScore,
            seoGrade: page.seoGrade,
            seoErrors: page.seoErrors,
            seoWarnings: page.seoWarnings,
            extracted: page.extracted,
          });
        }

        // Write complete record with SEO summary
        writer.write({
          type: 'complete',
          url: result.url,
          completedAt: new Date().toISOString(),
          pagesVisited: result.pagesVisited,
          duration: result.duration,
          errors: result.errors,
          internalLinks: result.internalLinks,
          externalLinks: result.externalLinks,
          seo: result.seo,
          extraction: result.extraction,
        });

        await writer.close();
        savedPath = writer.getPath() || resolvedOutputPath;
      } else {
        // Standard JSON format
        const jsonResult = formatReportForJson(result, url, seoEnabled ? 'seo-spider' : 'spider');
        savedPath = await writeReport(resolvedOutputPath, jsonResult);
      }

      ctx.addHistoryItem({
        type: 'info',
        content: `✔ Report saved to: ${savedPath}`,
      });
    }

    // Format result for display
    const summary: any = {
      url: result.url,
      pages: result.pagesVisited,
      duration: `${(result.duration / 1000).toFixed(1)}s`,
      errors: result.errors,
      links: {
        internal: result.internalLinks,
        external: result.externalLinks,
      },
      assets: {
        images: result.images,
        scripts: result.scripts,
        stylesheets: result.stylesheets,
      },
      topPages: result.pages.slice(0, 10).map(p => ({
        url: p.url.replace(url, ''),
        status: p.status,
        title: p.title?.slice(0, 40),
        // Include SEO data per page when available
        seoScore: p.seoScore,
        seoGrade: p.seoGrade,
        seoErrors: p.seoErrors,
        seoWarnings: p.seoWarnings,
      })),
    };

    // Include SEO summary when seo mode is enabled
    if (result.seo) {
      summary.seo = {
        avgScore: result.seo.avgScore,
        pagesWithErrors: result.seo.pagesWithErrors,
        pagesWithWarnings: result.seo.pagesWithWarnings,
        duplicateTitles: result.seo.duplicateTitles,
        duplicateDescriptions: result.seo.duplicateDescriptions,
        duplicateH1s: result.seo.duplicateH1s,
        orphanPages: result.seo.orphanPages,
        siteWideIssues: result.seo.siteWideIssues?.slice(0, 10), // Top 10 issues
        discovery: result.seo.discovery,
      };
    }

    // Include extraction summary when extract mode is enabled
    if (result.extraction) {
      summary.extraction = {
        schema: result.extraction.schema,
        totalItems: result.extraction.totalItems,
        pagesWithData: Object.keys(result.extraction.byPage).length,
      };

      // Add per-page extracted data to topPages
      summary.topPages = summary.topPages.map((p: any) => {
        const fullUrl = p.url.startsWith('/') ? url + p.url : p.url;
        const extracted = result.extraction?.byPage[fullUrl];
        return { ...p, extracted };
      });
    }

    ctx.addHistoryItem({
      type: 'response',
      content: summary,
      meta: {
        responseType: seoEnabled ? 'seo-spider' : 'spider',
        time: result.duration,
      },
    });

    return { success: true, data: result, output: resolvedOutputPath };

  } catch (err: any) {
    ctx.addHistoryItem({ type: 'error', content: `Spider failed: ${err.message}` });
    return { success: false, error: err.message };

  } finally {
    ctx.setIsLoading(false);
  }
}

// =============================================================================
// Robots Command
// =============================================================================

export async function cmdRobots(ctx: CommandContext, args: string[]): Promise<CommandResult> {
  let url = args[0];

  if (!url) {
    const base = ctx.baseUrl();
    if (base) {
      url = base;
    } else {
      ctx.addHistoryItem({ type: 'error', content: 'Usage: robots <url> or set base URL first' });
      return { success: false };
    }
  }

  if (!url.startsWith('http')) {
    url = `https://${url}`;
  }

  ctx.setIsLoading(true);

  try {
    const robotsUrl = new URL('/robots.txt', url).toString();
    const response = await ctx.client.get(robotsUrl);
    const text = await response.text();

    if (response.status === 404) {
      ctx.addHistoryItem({ type: 'info', content: `No robots.txt found at ${robotsUrl}` });
      return { success: true };
    }

    // Parse basic directives
    const lines = text.split('\n');
    const directives: any[] = [];
    let currentAgent = '*';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().startsWith('user-agent:')) {
        currentAgent = trimmed.slice(11).trim();
      } else if (trimmed.toLowerCase().startsWith('disallow:')) {
        directives.push({ agent: currentAgent, type: 'disallow', path: trimmed.slice(9).trim() });
      } else if (trimmed.toLowerCase().startsWith('allow:')) {
        directives.push({ agent: currentAgent, type: 'allow', path: trimmed.slice(6).trim() });
      } else if (trimmed.toLowerCase().startsWith('sitemap:')) {
        directives.push({ type: 'sitemap', url: trimmed.slice(8).trim() });
      }
    }

    ctx.addHistoryItem({
      type: 'response',
      content: {
        url: robotsUrl,
        rules: directives.length,
        sitemaps: directives.filter(d => d.type === 'sitemap').map(d => d.url),
        disallowed: directives.filter(d => d.type === 'disallow').slice(0, 10).map(d => d.path),
      },
    });

    ctx.setLastResponse({ url: robotsUrl, text, directives });
    return { success: true, data: { url: robotsUrl, directives } };

  } catch (err: any) {
    ctx.addHistoryItem({ type: 'error', content: `robots.txt fetch failed: ${err.message}` });
    return { success: false, error: err.message };
  } finally {
    ctx.setIsLoading(false);
  }
}

// =============================================================================
// Sitemap Command
// =============================================================================

export async function cmdSitemap(ctx: CommandContext, args: string[]): Promise<CommandResult> {
  let url = args[0];

  if (!url) {
    const base = ctx.baseUrl();
    if (base) {
      url = base;
    } else {
      ctx.addHistoryItem({ type: 'error', content: 'Usage: sitemap <url> or set base URL first' });
      return { success: false };
    }
  }

  if (!url.startsWith('http')) {
    url = `https://${url}`;
  }

  ctx.setIsLoading(true);

  try {
    const sitemapUrl = url.endsWith('.xml') ? url : new URL('/sitemap.xml', url).toString();
    const response = await ctx.client.get(sitemapUrl);
    const text = await response.text();

    if (response.status === 404) {
      ctx.addHistoryItem({ type: 'info', content: `No sitemap found at ${sitemapUrl}` });
      return { success: true };
    }

    // Basic XML parsing for URLs
    const urlMatches = text.match(/<loc>([^<]+)<\/loc>/g) || [];
    const urls = urlMatches.map(m => m.replace(/<\/?loc>/g, ''));

    ctx.addHistoryItem({
      type: 'response',
      content: {
        url: sitemapUrl,
        totalUrls: urls.length,
        sample: urls.slice(0, 10),
      },
    });

    ctx.setLastResponse({ url: sitemapUrl, urls });
    return { success: true, data: { url: sitemapUrl, urls } };

  } catch (err: any) {
    ctx.addHistoryItem({ type: 'error', content: `Sitemap fetch failed: ${err.message}` });
    return { success: false, error: err.message };
  } finally {
    ctx.setIsLoading(false);
  }
}

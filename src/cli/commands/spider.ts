import { RekCommand as Command } from '../router.js';
import { promises as fs } from 'node:fs';
import colors from '../../utils/colors.js';
import { summarizeErrors, formatErrorSummary } from '../helpers.js';
import { parseSpiderSerpConfig } from '../utils/serp-config.js';
import { runSpiderKeywordCampaign, toSerpPayload } from '../utils/serp-campaign.js';
import {
  getOptionValue,
  toBoolean,
  toNonNegativeInt,
  toOptionString,
  toSpiderTransport,
  type SpiderTransport,
} from '../utils/option-helpers.js';
import { getScoreColor } from '../utils/score-color.js';

type SpiderFocusMode = 'all' | 'links' | 'duplicates' | 'security' | 'ai' | 'resources';
const FOCUS_MODES: SpiderFocusMode[] = ['all', 'links', 'duplicates', 'security', 'ai', 'resources'];

function normalizeSpiderFocus(value: unknown): SpiderFocusMode {
  const raw = toOptionString(value)?.toLowerCase() as SpiderFocusMode | undefined;
  return raw && FOCUS_MODES.includes(raw) ? raw : 'all';
}

function toStringOrStringArray(value: unknown): string | string[] | undefined {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  return toOptionString(value);
}

export interface SpiderOptions {
  url: string;
  depth?: number;
  limit?: number;
  concurrency?: number;
  output?: string;
  focus?: SpiderFocusMode;
  seo?: boolean;
  robots?: boolean;
  json?: boolean;
  /** Stream output as JSONL (one JSON per line) */
  jsonl?: boolean;
  /** CSS selectors to extract (comma-separated string or array) */
  extract?: string | string[];
  /** URL patterns to include (comma-separated string or array) */
  include?: string | string[];
  /** URL patterns to exclude (comma-separated string or array) */
  exclude?: string | string[];
  /** Disable sitemap.xml crawling (sitemap is enabled by default in SEO mode) */
  noSitemap?: boolean;
  /** Disable rich TUI (when running inside shell context) */
  disableTui?: boolean;
  /** Transport mode (auto | undici | curl) */
  transport?: SpiderTransport;
  /** Prefer curl-impersonate first for auto transport */
  preferCurlFirst?: boolean;
  /** Request timeout in ms */
  timeout?: number;
  /** Delay between requests in ms */
  delay?: number;
  /** Max retry attempts */
  maxRetryAttempts?: number;
  /** Base retry delay in ms */
  baseRetryDelayMs?: number;
  /** Max retry delay in ms */
  maxRetryDelayMs?: number;
  /** Retry backoff multiplier */
  retryBackoffMultiplier?: number;
  /** Retry jitter in ms */
  retryJitterMs?: number;
  /** Domain strike threshold before forcing curl */
  maxDomainBlockStrikes?: number;
  /** Rotate user-agent for each request */
  rotateUserAgent?: boolean;
  /** Randomize common request headers */
  randomizeHeaders?: boolean;
  /** Parsed SERP campaign config */
  serpConfig?: ReturnType<typeof parseSpiderSerpConfig>;
}

type SpiderSecurityTransport = 'auto' | 'undici' | 'curl';

type SpiderSecuritySummaryInput = {
  security?: {
    blocked?: boolean;
    captchaDetected?: boolean;
    captchaProvider?: string;
    attempts?: number;
    retryCount?: number;
    transport?: SpiderSecurityTransport;
  };
  timings?: {
    ttfb?: number;
    total?: number;
    download?: number;
  };
};

type SpiderSecuritySummary = {
  pages: number;
  blockedPages: number;
  captchaPages: number;
  captchaProviders: Record<string, number>;
  attempts: number;
  retries: number;
  transportUsage: {
    undici: number;
    curl: number;
  };
  avgAttempts: number;
  avgTtfbMs?: number;
  avgTotalMs?: number;
  avgDownloadMs?: number;
};

function printSerpCampaignSummary(
  run: Exclude<Awaited<ReturnType<typeof runSpiderKeywordCampaign>>, undefined>,
  color: typeof colors,
): void {
  const campaign = run.campaign;
  const summary = campaign.summary;
  const foundRate = summary.queriesRequested > 0
    ? Math.round((summary.queriesFound / summary.queriesRequested) * 100)
    : 0;

  console.log(color.bold('\n  SERP campaign:'));
  console.log(`  ${color.green('Queries')}: ${summary.queriesExecuted}/${summary.queriesRequested} searched | ${color.green(String(summary.queriesFound))} found (${foundRate}%)`);
  console.log(`  ${color.blue('Top3')}: ${summary.top3Count} | ${color.blue('Top10')}: ${summary.top10Count}`);
  console.log(`  ${color.yellow('Avg position')}: ${summary.avgTopPosition !== null ? String(Math.round(summary.avgTopPosition)) : 'n/a'}`);

  if (campaign.results.length > 0) {
    console.log(`  ${color.blue('Keywords')}:`);
    for (const result of campaign.results.slice(0, 15)) {
      const icon = result.found ? color.green('✔') : color.red('✗');
      const pos = result.bestPosition !== null ? color.gray(` #${result.bestPosition}`) : color.gray('  -');
      const url = result.matchedUrl ? color.gray(` ${result.matchedUrl.replace(/^https?:\/\/[^/]+/, '').slice(0, 40)}`) : '';
      console.log(`    ${icon} ${result.keyword.padEnd(28)}${pos}${url}`);
    }
    if (campaign.results.length > 15) {
      console.log(color.gray(`    ... and ${campaign.results.length - 15} more keywords`));
    }
  }

  if (summary.topOrganicCompetitors.length > 0) {
    console.log(`  ${color.blue('Top competitors')}:`);
    for (const competitor of summary.topOrganicCompetitors.slice(0, 3)) {
      const wins = competitor.totalOutperformedQueries ?? 0;
      console.log(`    ${color.gray(`${competitor.domain}`)} (${wins} wins / ${competitor.matchedKeywords} matched)`);
    }
  }

  if (campaign.pageComparison.length > 0) {
    console.log(`  ${color.blue('Best pages')}:`);
    for (const page of campaign.pageComparison
      .sort((a: { found: number; tracked: number }, b: { found: number; tracked: number }) => b.found - a.found || b.tracked - a.tracked)
      .slice(0, 3)) {
      console.log(`    ${color.gray(`${page.pageUrl}`)} ${page.found}/${page.tracked} (${page.appearanceRate.toFixed(1)}%)`);
    }
  }
}

function summarizePageSecurity(pages: SpiderSecuritySummaryInput[]): SpiderSecuritySummary {
  let blockedPages = 0;
  let captchaPages = 0;
  const captchaProviders: Record<string, number> = {};
  let attempts = 0;
  let retries = 0;
  let undici = 0;
  let curl = 0;
  let ttfbSum = 0;
  let totalSum = 0;
  let downloadSum = 0;
  let ttfbCount = 0;
  let totalCount = 0;
  let downloadCount = 0;
  const totalPages = pages.length;

  for (const page of pages) {
    const security = page.security;
    attempts += Number.isFinite(security?.attempts ?? NaN) ? (security?.attempts || 0) : 1;
    retries += security?.retryCount ?? 0;

    if (security?.blocked) blockedPages += 1;
    if (security?.captchaDetected) captchaPages += 1;
    if (security?.captchaDetected) {
      const provider = (security.captchaProvider || '').trim().toLowerCase();
      const key = provider.length > 0 ? provider : 'unknown';
      captchaProviders[key] = (captchaProviders[key] || 0) + 1;
    }

    if (security?.transport === 'undici') {
      undici += 1;
    } else if (security?.transport === 'curl') {
      curl += 1;
    }

    const ttfb = page.timings?.ttfb;
    const total = page.timings?.total;
    const download = page.timings?.download;

    if (typeof ttfb === 'number' && Number.isFinite(ttfb)) {
      ttfbSum += ttfb;
      ttfbCount += 1;
    }

    if (typeof total === 'number' && Number.isFinite(total)) {
      totalSum += total;
      totalCount += 1;
    }

    if (typeof download === 'number' && Number.isFinite(download)) {
      downloadSum += download;
      downloadCount += 1;
    }
  }

  return {
    pages: totalPages,
    blockedPages,
    captchaPages,
    captchaProviders,
    attempts: attempts || totalPages || 1,
    retries,
    transportUsage: {
      undici,
      curl,
    },
    avgAttempts: totalPages > 0 ? Number((attempts / totalPages).toFixed(2)) : 0,
    avgTtfbMs: ttfbCount > 0 ? Math.round(ttfbSum / ttfbCount) : undefined,
    avgTotalMs: totalCount > 0 ? Math.round(totalSum / totalCount) : undefined,
    avgDownloadMs: downloadCount > 0 ? Math.round(downloadSum / downloadCount) : undefined,
  };
}

function toNumber(value: string): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function printSecuritySummary(summary: SpiderSecuritySummary, securityPages: number, colors: typeof import('../../utils/colors.js').default): void {
  const blockedRate = securityPages > 0 ? Math.round((summary.blockedPages / securityPages) * 100) : 0;
  const captchaRate = securityPages > 0 ? Math.round((summary.captchaPages / securityPages) * 100) : 0;
  const transportTotal = summary.transportUsage.undici + summary.transportUsage.curl;

  const transportLine = transportTotal > 0
    ? `curl ${summary.transportUsage.curl} (${Math.round((summary.transportUsage.curl / transportTotal) * 100)}%) / undici ${summary.transportUsage.undici} (${Math.round((summary.transportUsage.undici / transportTotal) * 100)}%)`
    : 'transport usage n/a';

  console.log(colors.bold('\n  Anti-bot signal:'));
  console.log(`  ${colors.red('Blocked')}: ${summary.blockedPages}/${securityPages} (${blockedRate}%)`);
  console.log(`  ${colors.yellow('Captcha')}: ${summary.captchaPages}/${securityPages} (${captchaRate}%)`);
  console.log(`  ${colors.blue('Attempts')}: avg ${summary.avgAttempts}, retries ${summary.retries}`);
  console.log(`  ${colors.cyan('Timings')}: ttfb ${summary.avgTtfbMs ?? 'n/a'}ms · total ${summary.avgTotalMs ?? 'n/a'}ms · download ${summary.avgDownloadMs ?? 'n/a'}ms`);
  console.log(`  ${colors.magenta('Transport')}: ${transportLine}`);
  if (Object.keys(summary.captchaProviders).length > 0) {
    const providers = Object.entries(summary.captchaProviders)
      .sort((a, b) => b[1] - a[1])
      .map(([provider, count]) => `${provider}: ${count}`)
      .join(', ');
    console.log(`  ${colors.gray('Captcha providers')}: ${providers}`);
  }
}

export async function runSpider(opts: SpiderOptions) {
  const url = opts.url;
  const formatJson = !!opts.json;
  const formatJsonl = !!opts.jsonl;
  const outputFile = opts.output;
  const seoEnabled = !!opts.seo;
  const focusMode = opts.focus || 'all';
  const respectRobotsTxt = !!opts.robots;
  // In SEO mode, sitemap crawling is enabled by default unless --no-sitemap is passed
  const useSitemap = seoEnabled && !opts.noSitemap;
  const serpConfig = opts.serpConfig || parseSpiderSerpConfig(opts as unknown as Record<string, unknown>);
  const shouldRunSerp = seoEnabled && serpConfig.enabled;

  let startUrl = url;
  if (!startUrl.startsWith('http')) startUrl = `https://${startUrl}`;

  if (serpConfig.enabled && !seoEnabled) {
    console.log(colors.yellow('\nSERP campaign requires --seo. Skipping SERP checks.'));
  }

  // Apply defaults
  const depth = toNonNegativeInt(opts.depth, 10);
  const limit = toNonNegativeInt(opts.limit, 1000);
  const concurrency = toNonNegativeInt(opts.concurrency, 5);
  const transport = toSpiderTransport(opts.transport) ?? 'auto';
  const preferCurlFirst = toBoolean(opts.preferCurlFirst, true);
  const timeout = toNonNegativeInt(opts.timeout, 10_000);
  const delay = toNonNegativeInt(opts.delay, 100);
  const maxRetryAttempts = toNonNegativeInt(opts.maxRetryAttempts, 3);
  const baseRetryDelayMs = toNonNegativeInt(opts.baseRetryDelayMs, 1_000);
  const maxRetryDelayMs = toNonNegativeInt(opts.maxRetryDelayMs, 12_000);
  const retryBackoffMultiplier = toNonNegativeInt(opts.retryBackoffMultiplier, 2);
  const retryJitterMs = toNonNegativeInt(opts.retryJitterMs, 250);
  const maxDomainBlockStrikes = toNonNegativeInt(opts.maxDomainBlockStrikes, 2);
  const rotateUserAgent = toBoolean(opts.rotateUserAgent, true);
  const randomizeHeaders = toBoolean(opts.randomizeHeaders, true);

  // Parse comma-separated options into arrays
  const parseList = (val: string | string[] | undefined): string[] | undefined => {
    if (!val) return undefined;
    if (Array.isArray(val)) return val;
    return val.split(',').map(s => s.trim()).filter(Boolean);
  };
  const extractSelectors = parseList(opts.extract);
  const includePatterns = parseList(opts.include);
  const excludePatterns = parseList(opts.exclude);

  // JSONL streaming mode - uses event-based runner for real-time output
  if (formatJsonl) {
    const { runSpiderWithEvents } = await import('./spider-runner.js');
    try {
      const crawlResult = await runSpiderWithEvents(url, {
        depth,
        limit,
        concurrency,
        robots: respectRobotsTxt,
        seo: seoEnabled,
        useSitemap,
        focus: focusMode,
        transport,
        preferCurlFirst,
        timeout,
        delay,
        maxRetryAttempts,
        baseRetryDelayMs,
        maxRetryDelayMs,
        retryBackoffMultiplier,
        retryJitterMs,
        maxDomainBlockStrikes,
        rotateUserAgent,
        randomizeHeaders,
        extract: extractSelectors,
        include: includePatterns,
        exclude: excludePatterns,
        jsonl: true,
        jsonlOutput: outputFile, // If -o is specified, write to file
      });
      if (shouldRunSerp && crawlResult.pages?.length > 0) {
        const serpCampaign = await runSpiderKeywordCampaign(startUrl, crawlResult.pages, serpConfig);
        if (serpCampaign) {
          const outputRecord = {
            type: 'serp',
            ...(toSerpPayload(serpCampaign)),
          };
          // Keep JSONL stream focused: emit campaign row for downstream ingestion
          if (!outputFile) {
            console.log(JSON.stringify(outputRecord));
            return;
          }
          await fs.appendFile(outputFile, `${JSON.stringify(outputRecord)}\n`);
        } else if (!outputFile) {
          console.log(colors.yellow('SERP enabled but no valid keyword seeds were found in crawl pages.'));
        }
        return;
      }
      return;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(colors.red(`\nSpider failed: ${message}`));
      process.exit(1);
    }
  }

  // Focus mode categories
  const focusCategories: Record<string, string[]> = {
    links: ['links'],
    duplicates: ['title', 'meta', 'content'],
    security: ['security'],
    ai: ['ai-search'],
    resources: ['resources', 'performance'],
    all: [],
  };

  // Don't print visual output in JSON mode
  if (!formatJson) {
    const modeLabel = seoEnabled ? colors.magenta(' + SEO') : '';
    const focusLabel = focusMode !== 'all' ? colors.cyan(` [focus: ${focusMode}]`) : '';
    console.log(colors.cyan(`
Spider starting: ${startUrl}`));
    console.log(colors.gray(`  Depth: ${depth} | Limit: ${limit} | Concurrency: ${concurrency}${modeLabel}${focusLabel}`));
    if (outputFile) {
      console.log(colors.gray(`  Output: ${outputFile}`));
    }
    console.log('');
  }

  try {
    // SEO Spider mode
    if (seoEnabled) {
      const { SeoSpider } = await import('../../seo/index.js');

      // Use TUI for interactive mode, simple progress for non-interactive
      // disableTui is used when running inside shell context (shell has its own interface)
      let tui: Awaited<ReturnType<typeof import('../tui/spider-tui.js').createSpiderTui>> | null = null;

      if (!formatJson && !opts.disableTui && process.stdout.isTTY) {
        const { createSpiderTui } = await import('../tui/spider-tui.js');
        tui = createSpiderTui(startUrl, limit, concurrency);
      }

      // Fallback simple progress for non-TTY
      let analyzedCount = 0;
      let totalScore = 0;
      let currentCrawled = 0;

      const seoSpider = new SeoSpider({
        maxDepth: depth,
        maxPages: limit,
        concurrency: concurrency,
        sameDomain: true,
        delay,
        timeout,
        transport,
        preferCurlFirst,
        maxRetryAttempts,
        baseRetryDelayMs,
        maxRetryDelayMs,
        retryBackoffMultiplier,
        retryJitterMs,
        maxDomainBlockStrikes,
        rotateUserAgent,
        randomizeHeaders,
        seo: true,
        respectRobotsTxt,
        useSitemap,
        output: outputFile || undefined,
        focusCategories: focusCategories[focusMode],
        focusMode,
        onProgress: (progress) => {
          currentCrawled = progress.crawled;
          if (tui) {
            tui.updateProgress(progress.crawled, progress.queued, progress.pending, progress.depth);
            tui.updateUrl(progress.currentUrl);
          } else if (!formatJson) {
            // Simple fallback for non-TTY
            const percent = Math.min(100, Math.round((progress.crawled / limit) * 100));
            const avgScore = analyzedCount > 0 ? Math.round(totalScore / analyzedCount) : 0;
            process.stdout.write(`\r  [${percent}%] ${progress.crawled}/${limit} pages | Score: ${avgScore}   `);
          }
        },
        onSeoAnalysis: (seoPage) => {
          if (seoPage.seoReport) {
            analyzedCount++;
            totalScore += seoPage.seoReport.score;
            if (tui) {
              // Pass url, score, bytes, and timings to TUI
              // Use timings from spider page result (network-level data)
              const bytes = seoPage.metrics?.htmlSize;
              const timings = seoPage.timings || { total: seoPage.duration };
              const securityTransport = seoPage.security?.transport === 'curl' || seoPage.security?.transport === 'undici'
                ? seoPage.security.transport
                : undefined;
              tui.updateSeo(seoPage.url, seoPage.seoReport.score, bytes, timings);
              tui.updateSecurity({
                blocked: seoPage.security?.blocked,
                captchaDetected: seoPage.security?.captchaDetected,
                captchaProvider: seoPage.security?.captchaProvider,
                attempts: seoPage.security?.attempts,
                retryCount: seoPage.security?.retryCount,
                transport: securityTransport,
                ttfb: timings.ttfb,
                total: timings.total,
                download: timings.download,
              });
            }
          }
        },
      });

      const result = await seoSpider.crawl(startUrl);
      const serpCampaign = shouldRunSerp ? await runSpiderKeywordCampaign(startUrl, result.pages, serpConfig) : undefined;
      const serpPayload = serpCampaign ? toSerpPayload(serpCampaign) : undefined;

      // Update TUI with final results and cleanup
      if (tui) {
        const securitySummary = summarizePageSecurity(result.pages);
        tui.setComplete({
          security: securitySummary,
          duplicateTitles: result.summary.duplicateTitles,
          duplicateDescriptions: result.summary.duplicateDescriptions,
          orphanPages: result.summary.orphanPages,
          pagesWithErrors: result.summary.pagesWithErrors,
        });
        tui.setSecuritySummary(securitySummary);
        if (serpPayload) {
          tui.setSerpSummary({
            queriesRequested: serpPayload.summary.queriesRequested,
            queriesFound: serpPayload.summary.queriesFound,
            avgTopPosition: serpPayload.summary.avgTopPosition,
            top3Count: serpPayload.summary.top3Count,
            top10Count: serpPayload.summary.top10Count,
            topOrganicCompetitors: (serpPayload.summary.topOrganicCompetitors || [])
              .slice(0, 4)
              .map((item) => ({
                domain: item.domain,
                matchedKeywords: item.matchedKeywords,
                totalOutperformedQueries: item.totalOutperformedQueries || 0,
              })),
            topPages: serpPayload.pageComparison.slice(0, 5).map((item) => ({
              pageUrl: item.pageUrl,
              found: item.found,
              tracked: item.tracked,
              appearanceRate: toNumber(item.appearanceRate),
            })),
          });
        }
        // Give TUI a moment to show final state, then cleanup
        await new Promise(resolve => setTimeout(resolve, 500));
        tui.stop();
        await tui.waitUntilExit();
      }

      // JSON output mode - print structured data and exit
      if (formatJson) {
        const securitySummary = summarizePageSecurity(result.pages);

        // Calculate metrics for JSON output
        const responseTimes = result.pages.filter(p => p.duration > 0).map(p => p.duration);
        const avgResponseTime = responseTimes.length > 0
          ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
          : 0;

        // Calculate status distribution
        const statusCounts: Record<string, number> = {};
        for (const page of result.pages) {
          const key = page.status?.toString() || 'error';
          statusCounts[key] = (statusCounts[key] || 0) + 1;
        }

        // Calculate content stats
        let totalInternalLinks = 0;
        let totalExternalLinks = 0;
        let totalImages = 0;
        let imagesWithoutAlt = 0;

        for (const page of result.pages) {
          if (page.seoReport) {
            totalInternalLinks += page.seoReport.links?.internal || 0;
            totalExternalLinks += page.seoReport.links?.external || 0;
            totalImages += page.seoReport.images?.total || 0;
            imagesWithoutAlt += page.seoReport.images?.withoutAlt || 0;
          }
        }

        const jsonOutput = {
          startUrl: startUrl,
          startTime: result.startTime,
          endTime: result.endTime,
          duration: result.duration,
          config: {
            maxDepth: depth,
            maxPages: limit,
            concurrency: concurrency,
            focusMode,
          },
          summary: {
            totalPages: result.pages.length,
            uniqueUrls: result.visited.size,
            avgSeoScore: result.summary.avgScore,
            avgResponseTime,
            pagesWithErrors: result.summary.pagesWithErrors,
            pagesWithWarnings: result.summary.pagesWithWarnings,
            duplicateTitles: result.summary.duplicateTitles,
            duplicateDescriptions: result.summary.duplicateDescriptions,
            duplicateH1s: result.summary.duplicateH1s,
            orphanPages: result.summary.orphanPages,
            security: securitySummary,
          },
          ...(serpPayload ? { serp: serpPayload } : {}),
          discovery: result.discovery ? {
            humans: result.discovery.humans.found,
            llms: result.discovery.llms.found,
            sitemap: result.discovery.sitemap.found,
            manifest: result.discovery.manifest.found ? {
              valid: result.discovery.manifest.valid,
              issues: result.discovery.manifest.issues,
            } : undefined,
          } : undefined,
          rssFeeds: result.rssFeeds,
          content: {
            totalInternalLinks,
            totalExternalLinks,
            totalImages,
            imagesWithoutAlt,
          },
          httpStatus: statusCounts,
          siteWideIssues: result.siteWideIssues.map(issue => ({
            type: issue.type,
            severity: issue.severity,
            message: issue.message,
            value: issue.value,
            affectedUrls: issue.affectedUrls,
          })),
              pages: result.pages.map(page => ({
                url: page.url,
                status: page.status,
                depth: page.depth,
                duration: page.duration,
                fetchedAt: page.fetchedAt,
                timings: page.timings,
                title: page.title,
                error: page.error,
                seo: page.seoReport ? {
                  score: page.seoReport.score,
                  grade: page.seoReport.grade,
                  title: page.seoReport.title,
                  metaDescription: page.seoReport.metaDescription,
                  headings: page.seoReport.headings,
                  links: page.seoReport.links,
                  images: page.seoReport.images,
                  checks: page.seoReport.checks,
                } : null,
              })),
              errors: result.pages.filter(p => p.error).map(p => ({
                url: p.url,
                status: p.status,
                error: p.error
              })),
            };

        console.log(JSON.stringify(jsonOutput, null, 2));
        return;
      }

      // Clear progress line
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      const securitySummary = summarizePageSecurity(result.pages);

      // Print SEO Spider results (visual mode)
      console.log(colors.green(`\n✔ SEO Spider complete`) + colors.gray(` (${(result.duration / 1000).toFixed(1)}s)`));
      console.log(`  ${colors.cyan('Pages crawled')}: ${result.pages.length}`);
      console.log(`  ${colors.cyan('Unique URLs')}: ${result.visited.size}`);
      console.log(`  ${colors.cyan('Avg SEO Score')}: ${result.summary.avgScore}/100`);
      printSecuritySummary(securitySummary, securitySummary.pages, colors);

      // Calculate performance metrics
      const responseTimes = result.pages.filter(p => p.duration > 0).map(p => p.duration);
      const avgResponseTime = responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : 0;
      const minResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
      const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
      const reqPerSec = result.duration > 0 ? (result.pages.length / (result.duration / 1000)).toFixed(1) : '0';

      // Calculate HTTP status distribution
      const statusCounts = new Map<string, number>();
      for (const page of result.pages) {
        const key = page.status ? page.status.toString() : 'error';
        statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
      }

      // Calculate link and image totals from SEO reports
      let totalInternalLinks = 0;
      let totalExternalLinks = 0;
      let totalImages = 0;
      let imagesWithoutAlt = 0;
      let pagesWithoutTitle = 0;
      let pagesWithoutDescription = 0;

      for (const page of result.pages) {
        if (page.seoReport) {
          totalInternalLinks += page.seoReport.links?.internal || 0;
          totalExternalLinks += page.seoReport.links?.external || 0;
          totalImages += page.seoReport.images?.total || 0;
          imagesWithoutAlt += page.seoReport.images?.withoutAlt || 0;
          if (!page.seoReport.title?.text) pagesWithoutTitle++;
          if (!page.seoReport.metaDescription?.text) pagesWithoutDescription++;
        }
      }

      // Show Performance section
      console.log(colors.bold('\n  Performance:'));
      console.log(`    ${colors.gray('Avg Response:')}  ${avgResponseTime}ms`);
      console.log(`    ${colors.gray('Min/Max:')}       ${minResponseTime}ms / ${maxResponseTime}ms`);
      console.log(`    ${colors.gray('Throughput:')}    ${reqPerSec} req/s`);

      // Show HTTP Status Distribution
      console.log(colors.bold('\n  HTTP Status:'));
      const sortedStatuses = Array.from(statusCounts.entries()).sort((a, b) => b[1] - a[1]);
      for (const [statusKey, count] of sortedStatuses.slice(0, 5)) {
        const statusNum = parseInt(statusKey);
        const statusColor = statusNum >= 400 ? colors.red :
                            statusNum >= 300 ? colors.yellow :
                            statusKey === 'error' ? colors.red : colors.green;
        const pct = ((count / result.pages.length) * 100).toFixed(0);
        console.log(`    ${statusColor(statusKey.padEnd(5))} ${count.toString().padStart(3)} (${pct}%)`);
      }

      // Show Content Stats
      console.log(colors.bold('\n  Content:'));
      console.log(`    ${colors.gray('Internal links:')} ${totalInternalLinks.toLocaleString()}`);
      console.log(`    ${colors.gray('External links:')} ${totalExternalLinks.toLocaleString()}`);
      console.log(`    ${colors.gray('Images:')}         ${totalImages.toLocaleString()} (${imagesWithoutAlt} missing alt)`);
      console.log(`    ${colors.gray('Missing title:')}  ${pagesWithoutTitle}`);
      console.log(`    ${colors.gray('Missing desc:')}   ${pagesWithoutDescription}`);

      // Show SEO summary
      console.log(colors.bold('\n  SEO Summary:'));
      const { summary } = result;
      console.log(`    ${colors.red('✗')} Pages with errors:     ${summary.pagesWithErrors}`);
      console.log(`    ${colors.yellow('⚠')} Pages with warnings:   ${summary.pagesWithWarnings}`);
      console.log(`    ${colors.magenta('⚐')} Duplicate titles:      ${summary.duplicateTitles}`);
      console.log(`    ${colors.magenta('⚐')} Duplicate descriptions:${summary.duplicateDescriptions}`);
      console.log(`    ${colors.magenta('⚐')} Duplicate H1s:         ${summary.duplicateH1s}`);
      console.log(`    ${colors.gray('○')} Orphan pages:          ${summary.orphanPages}`);

      // Show discovered site files
      if (result.discovery) {
        console.log(colors.bold('\n  Discovery:'));
        const { humans, llms, sitemap, manifest } = result.discovery;
        if (humans.found) console.log(`    ${colors.green('✔')} humans.txt found`);
        if (llms.found) console.log(`    ${colors.green('✔')} llms.txt found`);
        if (sitemap.found) {
          const urlCount = sitemap.urlCount ? ` (${sitemap.urlCount} URLs)` : '';
          console.log(`    ${colors.green('✔')} sitemap.xml found${urlCount}`);
        }
        if (manifest.found) {
          const status = manifest.valid ? colors.green('valid') : colors.yellow('invalid');
          console.log(`    ${colors.green('✔')} manifest.json found (${status})`);
          if (manifest.issues && manifest.issues.length > 0) {
            manifest.issues.slice(0, 3).forEach(issue => {
              console.log(`      ${colors.yellow('⚠')} ${issue}`);
            });
            if (manifest.issues.length > 3) {
              console.log(`      ${colors.gray(`...and ${manifest.issues.length - 3} more issues`)}`);
            }
          }
        }
        if (!humans.found && !llms.found && !sitemap.found && !manifest.found) {
          console.log(`    ${colors.gray('○')} No discovery files found`);
        }
      }

      // Show RSS feeds
      if (result.rssFeeds && result.rssFeeds.length > 0) {
        console.log(colors.bold('\n  RSS/Atom Feeds:'));
        result.rssFeeds.forEach(feed => {
          const typeLabel = feed.type === 'rss' ? 'RSS' : 'Atom';
          const title = feed.title ? `"${feed.title}"` : 'Untitled';
          const count = feed.itemCount > 0 ? `(${feed.itemCount} items)` : '';
          console.log(`    ${colors.green('✔')} ${colors.cyan(typeLabel)} ${title} ${colors.gray(count)}`);
          console.log(`      ${colors.gray(feed.url)}`);
        });
      }

      // Show site-wide issues (sorted by severity)
      if (result.siteWideIssues.length > 0) {
        console.log(colors.bold('\n  Site-Wide Issues:'));
        
        // Sort: Error > Warning > Info
        const sortedIssues = [...result.siteWideIssues].sort((a, b) => {
          const priority = { error: 0, warning: 1, info: 2 };
          return priority[a.severity] - priority[b.severity];
        });

        for (const issue of sortedIssues.slice(0, 10)) {
          const icon = issue.severity === 'error' ? colors.red('✗') :
                       issue.severity === 'warning' ? colors.yellow('⚠') : colors.gray('○');
          const colorFn = issue.severity === 'error' ? colors.red :
                          issue.severity === 'warning' ? colors.yellow : colors.gray;

          console.log(`    ${icon} ${colorFn(issue.message)}`);
          if (issue.value) {
            const truncatedValue = issue.value.length > 50 ? issue.value.slice(0, 47) + '...' : issue.value;
            console.log(`      ${colors.gray(`"${truncatedValue}"`)}`);
          }
          // Deduplicate affected URLs by pathname
          const uniquePaths = [...new Set(issue.affectedUrls.map(u => {
             try { return new URL(u).pathname; } catch { return u; }
          }))];
          
          if (uniquePaths.length <= 3) {
            for (const path of uniquePaths) {
              console.log(`      ${colors.gray('→')} ${path}`);
            }
          } else {
            console.log(`      ${colors.gray(`→ ${uniquePaths.length} pages affected`)}`);
          }
        }
        if (result.siteWideIssues.length > 10) {
          console.log(colors.gray(`    ... and ${result.siteWideIssues.length - 10} more issues`));
        }
      }

      // Show pages by SEO score (deduplicated by pathname)
      const pagesWithScores = result.pages
        .filter(p => p.seoReport)
        .sort((a, b) => (a.seoReport?.score || 0) - (b.seoReport?.score || 0));

      // Deduplicate by pathname, keeping lowest score per path
      const seenPaths = new Set<string>();
      const uniquePages = pagesWithScores.filter(page => {
        const path = new URL(page.url).pathname;
        if (seenPaths.has(path)) return false;
        seenPaths.add(path);
        return true;
      });

      if (uniquePages.length > 0) {
        console.log(colors.bold('\n  Pages by SEO Score:'));
        const worstPages = uniquePages.slice(0, 5);
        for (const page of worstPages) {
          const score = page.seoReport?.score || 0;
          const grade = page.seoReport?.grade || '?';
          const path = new URL(page.url).pathname;
          const scoreColor = getScoreColor(score, colors);
          console.log(`    ${scoreColor(`${score.toString().padStart(3)}`)} ${colors.gray(`[${grade}]`)} ${path.slice(0, 50)}`);
        }
        if (uniquePages.length > 5) {
          console.log(colors.gray(`    ... and ${uniquePages.length - 5} more pages`));
        }
      }

      if (serpPayload && serpCampaign) {
        printSerpCampaignSummary(serpCampaign, colors);
      }

      // Show output file location
      if (outputFile) {
        console.log(colors.green(`\n  Report saved to: ${outputFile}`));
      }

    } else {
      // Regular spider (non-SEO mode)
      const { Spider } = await import('../../scrape/spider.js');

      const spider = new Spider({
        maxDepth: depth,
        maxPages: limit,
        concurrency: concurrency,
        sameDomain: true,
        timeout,
        delay,
        transport,
        preferCurlFirst,
        maxRetryAttempts,
        baseRetryDelayMs,
        maxRetryDelayMs,
        retryBackoffMultiplier,
        retryJitterMs,
        maxDomainBlockStrikes,
        rotateUserAgent,
        randomizeHeaders,
        respectRobotsTxt,
        extract: extractSelectors,
        include: includePatterns?.map(p => new RegExp(p)),
        exclude: excludePatterns?.map(p => new RegExp(p)),
        onProgress: formatJson ? undefined : (progress) => {
          process.stdout.write(`\r${colors.gray('  Crawling:')} ${colors.cyan(progress.crawled.toString())} pages | ${colors.gray('Queue:')} ${progress.queued} | ${colors.gray('Depth:')} ${progress.depth}   `);
        },
      });

      const result = await spider.crawl(startUrl);

      // JSON output mode
      if (formatJson) {
        const securitySummary = summarizePageSecurity(result.pages);

        const jsonOutput = {
          startUrl: result.startUrl,
          startTime: result.startTime,
          endTime: result.endTime,
          duration: result.duration,
          config: {
            maxDepth: depth,
            maxPages: limit,
            concurrency: concurrency,
          },
          summary: {
            totalPages: result.pages.length,
            successCount: result.pages.filter(p => !p.error).length,
            errorCount: result.errors.length,
            uniqueUrls: result.visited.size,
            security: securitySummary,
          },
          pages: result.pages.map(p => ({
            url: p.url,
            status: p.status,
            title: p.title,
            depth: p.depth,
            linksCount: p.links.length,
            duration: p.duration,
            fetchedAt: p.fetchedAt,
            timings: p.timings,
            error: p.error,
            meta: p.meta,
            metrics: p.metrics,
            social: p.social,
            extracted: p.extracted,
          })),
          errors: result.pages.filter(p => p.error).map(p => ({
            url: p.url,
            status: p.status,
            error: p.error
          })),
          extraction: extractSelectors ? {
            schema: Object.fromEntries(extractSelectors.map(s => {
              const [sel, attr] = s.split(':');
              return [sel, attr || 'text'];
            })),
            totalItems: result.pages.reduce((acc: number, p) => {
              if (!p.extracted) return acc;
              return acc + Object.values(p.extracted).reduce((sum: number, val) => {
                return sum + (Array.isArray(val) ? val.length : val ? 1 : 0);
              }, 0);
            }, 0),
          } : undefined,
        };
        console.log(JSON.stringify(jsonOutput, null, 2));
        return;
      }

      // Clear progress line
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      const securitySummary = summarizePageSecurity(result.pages);

      // Print results (visual mode)
      console.log(colors.green(`\n✔ Spider complete`) + colors.gray(` (${(result.duration / 1000).toFixed(1)}s)`));
      console.log(`  ${colors.cyan('Pages crawled')}: ${result.pages.length}`);
      console.log(`  ${colors.cyan('Unique URLs')}: ${result.visited.size}`);
      console.log(`  ${colors.cyan('Errors')}: ${result.errors.length}`);
      printSecuritySummary(securitySummary, securitySummary.pages, colors);

      // Show pages by depth
      const byDepth = new Map<number, number>();
      for (const page of result.pages) {
        byDepth.set(page.depth, (byDepth.get(page.depth) || 0) + 1);
      }
      console.log(colors.bold('\n  Pages by depth:'));
      for (const [depth, count] of Array.from(byDepth.entries()).sort((a, b) => a[0] - b[0])) {
        const bar = '█'.repeat(Math.min(count, 40));
        console.log(`    ${colors.gray(`d${depth}:`)} ${bar} ${count}`);
      }

      // Show top pages by links
      const topPages = [...result.pages]
        .filter(p => !p.error)
        .sort((a, b) => b.links.length - a.links.length)
        .slice(0, 10);

      if (topPages.length > 0) {
        console.log(colors.bold('\n  Top pages by outgoing links:'));
        for (const page of topPages) {
          const title = page.title.slice(0, 40) || new URL(page.url).pathname;
          console.log(`    ${colors.cyan(page.links.length.toString().padStart(3))} ${title}`);
        }
      }

      // Show errors using centralized error handler
      if (result.errors.length > 0) {
        const errorSummary = summarizeErrors(result.errors);
        console.log(formatErrorSummary(errorSummary));
      }

      // Show extraction results if --extract was used
      if (extractSelectors && extractSelectors.length > 0) {
        const pagesWithData = result.pages.filter(p => p.extracted && Object.keys(p.extracted).length > 0);
        if (pagesWithData.length > 0) {
          console.log(colors.bold('\n  Extraction Results:'));
          console.log(`    ${colors.gray('Selectors:')} ${extractSelectors.join(', ')}`);
          console.log(`    ${colors.gray('Pages with data:')} ${pagesWithData.length}/${result.pages.length}`);

          // Count total items extracted
          let totalItems = 0;
          for (const page of pagesWithData) {
            for (const values of Object.values(page.extracted!)) {
              if (Array.isArray(values)) {
                totalItems += values.length;
              } else if (values !== undefined) {
                totalItems++;
              }
            }
          }
          console.log(`    ${colors.gray('Total items:')} ${totalItems}`);

          // Show sample from first few pages
          console.log(colors.gray('\n    Sample:'));
          for (const page of pagesWithData.slice(0, 3)) {
            const path = new URL(page.url).pathname;
            console.log(`      ${colors.cyan(path)}`);
            for (const [key, values] of Object.entries(page.extracted!)) {
              if (Array.isArray(values) && values.length > 0) {
                const sample = values.slice(0, 2).map(v => String(v).slice(0, 40));
                const more = values.length > 2 ? ` (+${values.length - 2} more)` : '';
                console.log(`        ${colors.gray(key + ':')} ${sample.join(', ')}${more}`);
              } else if (values) {
                console.log(`        ${colors.gray(key + ':')} ${String(values).slice(0, 50)}`);
              }
            }
          }
          if (pagesWithData.length > 3) {
            console.log(colors.gray(`      ... and ${pagesWithData.length - 3} more pages`));
          }
        } else {
          console.log(colors.yellow('\n  No data extracted (selectors found no matches)'));
        }
      }

      // Save to file if requested
      if (outputFile) {
        const jsonOutput = {
          startUrl: result.startUrl,
          startTime: result.startTime,
          endTime: result.endTime,
          duration: result.duration,
          summary: {
            totalPages: result.pages.length,
            successCount: result.pages.filter(p => !p.error).length,
            errorCount: result.errors.length,
            uniqueUrls: result.visited.size,
            security: securitySummary,
          },
          pages: result.pages.map(p => ({
            url: p.url,
            status: p.status,
            title: p.title,
            depth: p.depth,
            linksCount: p.links.length,
            duration: p.duration,
            fetchedAt: p.fetchedAt,
            timings: p.timings,
            error: p.error,
            meta: p.meta,
            metrics: p.metrics,
            social: p.social,
            extracted: p.extracted,
          })),
          errors: result.pages.filter(p => p.error).map(p => ({
            url: p.url,
            status: p.status,
            error: p.error
          })),
          extraction: extractSelectors ? {
            schema: Object.fromEntries(extractSelectors.map(s => {
              const [sel, attr] = s.split(':');
              return [sel, attr || 'text'];
            })),
            totalItems: result.pages.reduce((acc: number, p) => {
              if (!p.extracted) return acc;
              return acc + Object.values(p.extracted).reduce((sum: number, val) => {
                return sum + (Array.isArray(val) ? val.length : val ? 1 : 0);
              }, 0);
            }, 0),
          } : undefined,
        };
        await fs.writeFile(outputFile, JSON.stringify(jsonOutput, null, 2));
        console.log(colors.green(`\n  Report saved to: ${outputFile}`));
      }
    }

    console.log('');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(colors.red(`\nSpider failed: ${message}`));
    process.exit(1);
  }
}

export function registerSpiderCommand(program: Command) {
  program
    .command('spider')
    .alias('crawl')
    .description('Crawl a website and analyze all pages with optional SEO analysis')
    .argument('<url>', {
      type: 'url',
      description: 'Starting URL to crawl',
      example: 'example.com',
    })
    .option('depth', {
      type: 'number',
      short: 'd',
      default: 10,
      description: 'Max link depth to follow',
      example: '3',
    })
    .option('limit', {
      type: 'number',
      short: 'l',
      default: 1000,
      description: 'Max pages to crawl',
      example: '500',
    })
    .option('concurrency', {
      type: 'number',
      short: 'c',
      default: 5,
      description: 'Number of parallel requests',
      example: '10',
    })
    .option('output', {
      type: 'string',
      short: 'o',
      description: 'Save JSON report to file',
      example: 'report.json',
    })
    .option('focus', {
      type: 'string',
      short: 'f',
      default: 'all',
      enum: ['all', 'links', 'duplicates', 'security', 'ai', 'resources'],
      description: 'Focus SEO analysis on specific area',
    })
    .option('seo', {
      short: 'S',
      description: 'Enable SEO analysis mode',
    })
    .option('robots', {
      short: 'r',
      description: 'Respect robots.txt rules',
    })
    .option('extract', {
      type: 'string',
      short: 'E',
      description: 'CSS selectors to extract (comma-separated)',
      example: '--extract "h1,a:href,.price"',
    })
    .option('include', {
      type: 'string',
      short: 'i',
      description: 'URL patterns to include (comma-separated regex)',
      example: '--include "^/blog/,^/docs/"',
    })
    .option('exclude', {
      type: 'string',
      short: 'x',
      description: 'URL patterns to exclude (comma-separated regex)',
      example: '--exclude "/admin/,/private/"',
    })
    .option('jsonl', {
      short: 'L',
      description: 'Stream output as JSONL (one JSON object per line)',
    })
    .option('no-sitemap', {
      short: 'N',
      description: 'Disable sitemap.xml crawling (sitemap is used by default in SEO mode)',
    })
    .option('transport', {
      type: 'string',
      default: 'auto',
      description: 'HTTP transport for crawler (auto | undici | curl)',
    })
    .option('prefer-curl-first', {
      type: 'boolean',
      default: true,
      description: 'Prefer curl-impersonate before undici in auto mode',
    })
    .option('timeout', {
      type: 'number',
      default: 10000,
      description: 'Request timeout in ms',
    })
    .option('delay', {
      type: 'number',
      default: 100,
      description: 'Request delay in ms',
    })
    .option('max-retry-attempts', {
      type: 'number',
      default: 3,
      description: 'Max retries for failed or blocked requests',
    })
    .option('base-retry-delay-ms', {
      type: 'number',
      default: 1000,
      description: 'Base retry delay in ms',
    })
    .option('max-retry-delay-ms', {
      type: 'number',
      default: 12000,
      description: 'Maximum retry delay in ms',
    })
    .option('retry-backoff-multiplier', {
      type: 'number',
      default: 2,
      description: 'Retry backoff multiplier',
    })
    .option('retry-jitter-ms', {
      type: 'number',
      default: 250,
      description: 'Random retry jitter in ms',
    })
    .option('max-domain-block-strikes', {
      type: 'number',
      default: 2,
      description: 'Number of strikes before forcing curl in auto mode',
    })
    .option('rotate-user-agent', {
      type: 'boolean',
      default: true,
      description: 'Rotate user-agent per request',
    })
    .option('randomize-headers', {
      type: 'boolean',
      default: true,
      description: 'Randomize request headers',
    })
    .option('serp', {
      type: 'boolean',
      description: 'Enable SERP campaign for top extracted keywords',
    })
    .option('serp-top-keywords', {
      type: 'number',
      description: 'Top keywords per page to use as campaign seeds',
      example: '20',
    })
    .option('serp-query-limit', {
      type: 'number',
      description: 'Number of SERP queries to execute',
      example: '10',
    })
    .option('serp-results-per-query', {
      type: 'number',
      description: 'Results fetched per SERP query',
      example: '10',
    })
    .option('serp-concurrency', {
      type: 'number',
      description: 'Number of parallel SERP queries',
      example: '4',
    })
    .option('serp-delay-ms', {
      type: 'number',
      description: 'Base delay in ms between SERP queries',
      example: '450',
    })
    .option('serp-delay-jitter-ms', {
      type: 'number',
      description: 'Random delay jitter in ms between SERP queries',
      example: '250',
    })
    .option('serp-captcha-cooldown-ms', {
      type: 'number',
      description: 'Cooldown in ms after captcha before continuing SERP queries',
      example: '1200',
    })
    .option('serp-retry-count', {
      type: 'number',
      description: 'Retry count per SERP query',
      example: '1',
    })
    .option('serp-retry-delay-ms', {
      type: 'number',
      description: 'Base delay in ms for SERP query retries',
      example: '900',
    })
    .option('serp-transport', {
      type: 'string',
      default: 'curl',
      description: 'Search transport (auto | undici | curl)',
      example: 'curl',
    })
    .option('serp-source', {
      type: 'string',
      default: 'google',
      description: 'Search source/provider. Current options: google',
      example: 'google',
    })
    .option('serp-timeout', {
      type: 'number',
      description: 'Search timeout in ms',
      example: '15000',
    })
    .option('serp-country', {
      type: 'string',
      description: 'Search country/region',
      example: 'br',
    })
    .option('serp-gl', {
      type: 'string',
      description: 'Google GL parameter',
    })
    .option('serp-hl', {
      type: 'string',
      description: 'Google HL parameter',
    })
    .option('serp-human-profile', {
      type: 'string',
      default: 'chrome',
      description: 'Human-like SERP query profile: chrome or off',
    })
    .example('rek spider example.com', 'Basic crawl')
    .example('rek spider example.com -d 3 -l 50', 'Depth 3, max 50 pages')
    .example('rek spider example.com --seo', 'Enable SEO analysis')
    .example('rek spider example.com --seo -f security', 'Focus on security issues')
    .example('rek spider example.com --seo -o report.json', 'Save SEO report')
    .example('rek spider example.com -E h1 -E h2', 'Extract all h1 and h2 tags')
    .example('rek spider example.com -E "a:href" --json', 'Extract all links as JSON')
      .example('rek spider example.com --include "^/blog/"', 'Only crawl /blog/ paths')
      .example('rek spider example.com --exclude "/admin/"', 'Skip /admin/ paths')
      .example('rek spider example.com --seo --serp', 'Run SEO + SERP campaign')
      .example('rek spider example.com --seo --serp --serp-top-keywords 12 --serp-query-limit 10 --serp-results-per-query 10', 'Tuned SERP campaign')
      .example('rek spider example.com --jsonl -o crawl.jsonl', 'Stream to JSONL file')
      .example('rek spider example.com -L | jq -c', 'Stream and process with jq')
      .action(async (url: string, _args: string[], cmdObj: Command) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const optionBag = options as Record<string, unknown>;
      await runSpider({
        url,
        depth: toNonNegativeInt(getOptionValue(optionBag, 'depth'), 10),
        limit: toNonNegativeInt(getOptionValue(optionBag, 'limit'), 1000),
        concurrency: toNonNegativeInt(getOptionValue(optionBag, 'concurrency'), 5),
        output: toOptionString(getOptionValue(optionBag, 'output')),
        focus: normalizeSpiderFocus(getOptionValue(optionBag, 'focus')),
        seo: toBoolean(getOptionValue(optionBag, 'seo')),
        robots: toBoolean(getOptionValue(optionBag, 'robots')),
        json: toBoolean(getOptionValue(optionBag, 'json')),
        jsonl: toBoolean(getOptionValue(optionBag, 'jsonl')),
        extract: toStringOrStringArray(getOptionValue(optionBag, 'extract')),
        include: toStringOrStringArray(getOptionValue(optionBag, 'include')),
        exclude: toStringOrStringArray(getOptionValue(optionBag, 'exclude')),
        noSitemap: toBoolean(getOptionValue(optionBag, 'noSitemap'), false) || toBoolean(getOptionValue(optionBag, 'no-sitemap'), false),
        transport: toSpiderTransport(getOptionValue(optionBag, 'transport')) || 'auto',
        preferCurlFirst: toBoolean(getOptionValue(optionBag, 'preferCurlFirst', 'prefer-curl-first'), true),
        timeout: toNonNegativeInt(getOptionValue(optionBag, 'timeout'), 10_000),
        delay: toNonNegativeInt(getOptionValue(optionBag, 'delay'), 100),
        maxRetryAttempts: toNonNegativeInt(getOptionValue(optionBag, 'maxRetryAttempts', 'max-retry-attempts'), 3),
        baseRetryDelayMs: toNonNegativeInt(getOptionValue(optionBag, 'baseRetryDelayMs', 'base-retry-delay-ms'), 1_000),
        maxRetryDelayMs: toNonNegativeInt(getOptionValue(optionBag, 'maxRetryDelayMs', 'max-retry-delay-ms'), 12_000),
        retryBackoffMultiplier: toNonNegativeInt(getOptionValue(optionBag, 'retryBackoffMultiplier', 'retry-backoff-multiplier'), 2),
        retryJitterMs: toNonNegativeInt(getOptionValue(optionBag, 'retryJitterMs', 'retry-jitter-ms'), 250),
        maxDomainBlockStrikes: toNonNegativeInt(getOptionValue(optionBag, 'maxDomainBlockStrikes', 'max-domain-block-strikes'), 2),
        rotateUserAgent: toBoolean(getOptionValue(optionBag, 'rotateUserAgent', 'rotate-user-agent'), true),
        randomizeHeaders: toBoolean(getOptionValue(optionBag, 'randomizeHeaders', 'randomize-headers'), true),
        serpConfig: parseSpiderSerpConfig(options),
      });
    });
}

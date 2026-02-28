/**
 * Spider TUI - Rich terminal interface for SEO Spider
 * Uses Tuiuiu.js for reactive terminal UI
 */

import {
  render,
  Box,
  Text,
  ProgressBar,
  Sparkline,
  Badge,
  Divider,
  StatusIndicator,
  Table,
  createSignal,
  useApp,
} from 'tuiuiu.js';

export interface SpiderTimings {
  dns?: number;
  tcp?: number;
  tls?: number;
  ttfb?: number;
  download?: number;
  total?: number;
}

export interface SpiderTransportUsage {
  undici: number;
  curl: number;
}

export interface SpiderSecuritySnapshot {
  pages: number;
  blockedPages: number;
  captchaPages: number;
  captchaProviders?: Record<string, number>;
  attempts: number;
  retries: number;
  transportUsage: SpiderTransportUsage;
  avgAttempts: number;
  avgTtfbMs?: number;
  avgTotalMs?: number;
  avgDownloadMs?: number;
}

export interface SpiderSerpSummary {
  queriesRequested: number;
  queriesFound: number;
  avgTopPosition?: number | null;
  top3Count: number;
  top10Count: number;
  topOrganicCompetitors?: Array<{
    domain: string;
    matchedKeywords: number;
    totalOutperformedQueries: number;
  }>;
  topPages?: Array<{
    pageUrl: string;
    found: number;
    tracked: number;
    appearanceRate: number;
  }>;
}

export interface PageInfo {
  url: string;
  score: number;
  size: number;
  timing: number;
}

export interface SpiderTuiState {
  // Progress
  crawled: number;
  queued: number;
  pending: number;
  depth: number;

  // SEO
  analyzed: number;
  avgScore: number;
  scores: number[];

  // Traffic
  totalBytes: number;
  pageSizes: number[];  // For sparkline

  // Timings (arrays for sparklines)
  dnsTimings: number[];
  tcpTimings: number[];
  tlsTimings: number[];
  ttfbTimings: number[];
  downloadTimings: number[];
  totalTimings: number[];

  // Recent pages (for table display)
  recentPages: PageInfo[];

  // Status
  status: 'crawling' | 'analyzing' | 'complete' | 'error';
  currentUrl: string;
  startTime: number;

  // Results summary
  duplicateTitles: number;
  duplicateDescriptions: number;
  orphanPages: number;
  pagesWithErrors: number;

  security: SpiderSecuritySnapshot;
  serpSummary?: SpiderSerpSummary;

  // Anti-bot running counters
  antiBotPages: number;
  antiBotBlockedPages: number;
  antiBotCaptchaPages: number;
  antiBotCaptchaProviders: Record<string, number>;
  antiBotAttempts: number;
  antiBotRetries: number;
  antiBotTransport: SpiderTransportUsage;
  antiBotTtfbSamples: number;
  antiBotTotalSamples: number;
  antiBotDownloadSamples: number;
  antiBotTtfbSum: number;
  antiBotTotalSum: number;
  antiBotDownloadSum: number;
}

const initialState: SpiderTuiState = {
  crawled: 0,
  queued: 0,
  pending: 0,
  depth: 0,
  analyzed: 0,
  avgScore: 0,
  scores: [],
  totalBytes: 0,
  pageSizes: [],
  dnsTimings: [],
  tcpTimings: [],
  tlsTimings: [],
  ttfbTimings: [],
  downloadTimings: [],
  totalTimings: [],
  recentPages: [],
  status: 'crawling',
  currentUrl: '',
  startTime: Date.now(),
  duplicateTitles: 0,
  duplicateDescriptions: 0,
  orphanPages: 0,
  pagesWithErrors: 0,
  security: {
    pages: 0,
    blockedPages: 0,
    captchaPages: 0,
    attempts: 0,
    retries: 0,
    transportUsage: {
      undici: 0,
      curl: 0,
    },
    avgAttempts: 0,
  },
  antiBotPages: 0,
  antiBotBlockedPages: 0,
  antiBotCaptchaPages: 0,
  antiBotCaptchaProviders: {},
  antiBotAttempts: 0,
  antiBotRetries: 0,
  antiBotTransport: {
    undici: 0,
    curl: 0,
  },
  antiBotTtfbSamples: 0,
  antiBotTotalSamples: 0,
  antiBotDownloadSamples: 0,
  antiBotTtfbSum: 0,
  antiBotTotalSum: 0,
  antiBotDownloadSum: 0,
};

// Keep last N values for sparklines
const SPARKLINE_SIZE = 30;
const RECENT_PAGES_SIZE = 15;

function pushToArray<T>(arr: T[], value: T, maxSize: number = SPARKLINE_SIZE): T[] {
  return [...arr.slice(-(maxSize - 1)), value];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function last(arr: number[]): number | undefined {
  return arr.length > 0 ? arr[arr.length - 1] : undefined;
}

function truncateUrl(url: string, maxLen: number = 50): string {
  if (url.length <= maxLen) return url;
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    if (path.length > maxLen - 3) {
      return '...' + path.slice(-(maxLen - 3));
    }
    return path;
  } catch {
    return '...' + url.slice(-(maxLen - 3));
  }
}

// Render timings as separate VNodes to avoid null children issues
function renderTimings(s: SpiderTuiState) {
  const timingRows: ReturnType<typeof Box>[] = [];

  // Build list of timing entries
  const entries: Array<{ label: string; data: number[]; isTotal?: boolean }> = [];

  if (s.dnsTimings.length > 0) entries.push({ label: 'DNS', data: s.dnsTimings });
  if (s.tcpTimings.length > 0) entries.push({ label: 'TCP', data: s.tcpTimings });
  if (s.tlsTimings.length > 0) entries.push({ label: 'TLS', data: s.tlsTimings });
  if (s.ttfbTimings.length > 0) entries.push({ label: 'TTFB', data: s.ttfbTimings });
  if (s.downloadTimings.length > 0) entries.push({ label: 'Download', data: s.downloadTimings });
  if (s.totalTimings.length > 0) entries.push({ label: 'Total', data: s.totalTimings, isTotal: true });

  if (entries.length === 0) return [];

  // Header with margin top for spacing from Sizes
  timingRows.push(
    Box(
      { height: 1, marginTop: 1 },
      Text({ dim: true, bold: true }, 'Timings'),
    )
  );

  // Each timing row - explicit height:1 prevents overlap
  for (const entry of entries) {
    const color = entry.isTotal ? 'cyan' : 'gray';
    const lastVal = last(entry.data) ?? 0;
    timingRows.push(
      Box(
        { flexDirection: 'row', height: 1 },
        Box({ width: 10 }, Text({ color: entry.isTotal ? 'cyan' : undefined, dim: !entry.isTotal }, entry.label)),
        Sparkline({ data: entry.data, width: 20, color }),
        Box({ width: 8, marginLeft: 1 }, Text({ color: entry.isTotal ? 'cyan' : undefined, dim: !entry.isTotal }, `${lastVal}ms`)),
      )
    );
  }

  return timingRows;
}

function formatSecurityRate(value: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function safeNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined;
}

function normalizeAttemptCount(value?: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }
  return 1;
}

function hasTimingSample(value?: number): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

// Render recent pages as a table (no title, with row numbers)
function renderRecentPages(pages: PageInfo[], isComplete: boolean, totalAnalyzed: number) {
  if (pages.length === 0 || isComplete) return [];

  // Show last 15 pages in reverse order (most recent first)
  const recentPages = pages.slice(-RECENT_PAGES_SIZE).reverse();

  // Transform data for table with row number
  const tableData = recentPages.map((p, idx) => ({
    num: String(totalAnalyzed - idx),
    url: truncateUrl(p.url, 42),
    score: p.score > 0 ? String(p.score) : '--',
    size: formatBytes(p.size),
    timing: p.timing > 0 ? `${p.timing}ms` : '--',
  }));

  return [
    Box(
      { marginTop: 1 },
      Table({
        columns: [
          { key: 'num', header: '#', width: 4, align: 'right' as const },
          { key: 'url', header: 'URL', width: 44 },
          { key: 'score', header: 'Score', width: 6, align: 'right' as const },
          { key: 'size', header: 'Size', width: 8, align: 'right' as const },
          { key: 'timing', header: 'Time', width: 8, align: 'right' as const },
        ],
        data: tableData,
        borderStyle: 'none',
        compact: true,
      })
    )
  ];
}

export function createSpiderTui(startUrl: string, limit: number, concurrency: number) {
  const [state, setState] = createSignal<SpiderTuiState>({
    ...initialState,
    startTime: Date.now(),
  });

  // Update functions
  const updateProgress = (crawled: number, queued: number, pending: number, depth: number) => {
    setState((s) => ({ ...s, crawled, queued, pending, depth }));
  };

  const updateSeo = (url: string, score: number, bytes?: number, timings?: SpiderTimings) => {
    setState((s) => {
      const scores = pushToArray(s.scores, score);
      const analyzed = s.analyzed + 1;
      const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

      // Update bytes and page sizes sparkline
      const pageSize = bytes || 0;
      const totalBytes = s.totalBytes + pageSize;
      const pageSizes = pushToArray(s.pageSizes, Math.round(pageSize / 1024)); // KB for sparkline

      // Update timings sparklines - always add all timing values
      const dnsTimings = pushToArray(s.dnsTimings, Math.round(timings?.dns || 0));
      const tcpTimings = pushToArray(s.tcpTimings, Math.round(timings?.tcp || 0));
      const tlsTimings = pushToArray(s.tlsTimings, Math.round(timings?.tls || 0));
      const ttfbTimings = pushToArray(s.ttfbTimings, Math.round(timings?.ttfb || 0));
      const downloadTimings = pushToArray(s.downloadTimings, Math.round(timings?.download || 0));
      const totalTimings = pushToArray(s.totalTimings, Math.round(timings?.total || 0));

      // Add page info to recent pages table
      const pageInfo: PageInfo = {
        url,
        score,
        size: pageSize,
        timing: Math.round(timings?.total || 0),
      };
      const recentPages = pushToArray(s.recentPages, pageInfo, RECENT_PAGES_SIZE);

      return {
        ...s,
        analyzed,
        scores,
        avgScore,
        totalBytes,
        pageSizes,
        dnsTimings,
        tcpTimings,
        tlsTimings,
        ttfbTimings,
        downloadTimings,
        totalTimings,
        recentPages,
      };
    });
  };

  const updateUrl = (url: string) => {
    setState((s) => ({
      ...s,
      currentUrl: url,
    }));
  };

  const setComplete = (summary: Partial<SpiderTuiState>) => {
    setState((s) => ({ ...s, ...summary, status: 'complete' }));
  };

  const setError = (error: string) => {
    setState((s) => ({ ...s, status: 'error', currentUrl: error }));
  };

  // Manual exit control - unmount cleans up TUI, exitPromise signals completion
  let resolveExit: (() => void) | null = null;
  const exitPromise = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });

  // Render the TUI
  function SpiderApp() {
    useApp(); // Keep for potential future use

    const s = state();
    const elapsed = Math.round((Date.now() - s.startTime) / 1000);
    const isComplete = s.status === 'complete';

    // Analysis progress: analyzed / (analyzed + queued + pending)
    const totalToAnalyze = s.analyzed + s.queued + s.pending;
  const analysisPercent = totalToAnalyze > 0 ? Math.min(100, Math.round((s.analyzed / totalToAnalyze) * 100)) : 0;
  const antiBotTotal = s.antiBotPages || s.analyzed || 1;
  const blockedRate = formatSecurityRate(s.antiBotBlockedPages, antiBotTotal);
  const captchaRate = formatSecurityRate(s.antiBotCaptchaPages, antiBotTotal);
  const transportTotal = s.antiBotTransport.undici + s.antiBotTransport.curl;
  const avgAttempts = antiBotTotal > 0 ? (s.antiBotAttempts / antiBotTotal).toFixed(2) : '0.00';
  const avgTtfb = s.antiBotTtfbSamples > 0 ? Math.round(s.antiBotTtfbSum / s.antiBotTtfbSamples) : 'n/a';
  const avgTotal = s.antiBotTotalSamples > 0 ? Math.round(s.antiBotTotalSum / s.antiBotTotalSamples) : 'n/a';
  const avgDownload = s.antiBotDownloadSamples > 0 ? Math.round(s.antiBotDownloadSum / s.antiBotDownloadSamples) : 'n/a';
  const formatTiming = (value: number | 'n/a') => value === 'n/a' ? 'n/a' : `${value}ms`;
  const curlUsage = transportTotal > 0 ? Math.round((s.antiBotTransport.curl / transportTotal) * 100) : 0;
  const transportLine = transportTotal > 0
    ? `curl ${curlUsage}% / undici ${100 - curlUsage}%`
    : 'n/a';
  const captchaProviderSummary = Object.entries(s.antiBotCaptchaProviders)
    .map(([provider, count]) => `${provider}: ${count}`)
    .join(' | ');

  // Score color
  const scoreColor =
    s.avgScore >= 80 ? 'success' : s.avgScore >= 60 ? 'warning' : 'destructive';

    return Box(
      { flexDirection: 'column', padding: 1 },

      // Header
      Box(
        { flexDirection: 'row', marginBottom: 1, height: 1 },
        Box(
          { width: 2 },
          StatusIndicator({ status: isComplete ? 'success' : 'info' }),
        ),
        Text({ bold: true }, `SEO Spider: ${startUrl}`),
      ),
      Box(
        { flexDirection: 'row', gap: 1, marginBottom: 1 },
        Text({ dim: true }, 'Transport:'),
        Text({ color: 'magenta', bold: true }, transportLine),
      ),

      // 1. Big numbers row: Avg Score, To Crawl, Depth, Time, Traffic
      Box(
        { flexDirection: 'row', gap: 3, marginBottom: 1 },
        Box(
          { flexDirection: 'column' },
          Text({ dim: true }, 'Avg Score'),
          Text({ color: scoreColor, bold: true }, s.avgScore > 0 ? String(s.avgScore) : '--'),
        ),
        Box(
          { flexDirection: 'column' },
          Text({ dim: true }, 'To Crawl'),
          Text({ color: (s.queued + s.pending) > 0 ? 'yellow' : 'gray', bold: true }, String(s.queued + s.pending)),
        ),
        Box(
          { flexDirection: 'column' },
          Text({ dim: true }, 'Parallel'),
          Text({ color: 'magenta', bold: true }, String(concurrency)),
        ),
        Box(
          { flexDirection: 'column' },
          Text({ dim: true }, 'Depth'),
          Text({ bold: true }, String(s.depth)),
        ),
        Box(
          { flexDirection: 'column' },
          Text({ dim: true }, 'Time'),
          Text({ bold: true }, `${elapsed}s`),
        ),
        Box(
          { flexDirection: 'column' },
          Text({ dim: true }, 'Traffic'),
          Text({ color: 'cyan', bold: true }, formatBytes(s.totalBytes)),
        ),
      ),

      // 1b. Anti-bot status row
      Box(
        { flexDirection: 'row', gap: 3, marginBottom: 1 },
        Box(
          { flexDirection: 'column' },
          Text({ dim: true }, 'Anti-bot'),
          Text({ color: s.antiBotBlockedPages > 0 ? 'warning' : 'success', bold: true }, `${s.antiBotBlockedPages}/${antiBotTotal} blocked (${blockedRate})`),
        ),
        Box(
          { flexDirection: 'column' },
          Text({ dim: true }, 'Captcha'),
          Text({ color: s.antiBotCaptchaPages > 0 ? 'warning' : 'success', bold: true }, `${s.antiBotCaptchaPages} (${captchaRate})`),
        ),
        Box(
          { flexDirection: 'column' },
          Text({ dim: true }, 'Captcha Providers'),
          Text({ color: 'blue', bold: true }, captchaProviderSummary || 'n/a'),
        ),
        Box(
          { flexDirection: 'column' },
          Text({ dim: true }, 'Attempts'),
          Text({ color: 'blue', bold: true }, `avg ${avgAttempts}`),
        ),
      ),
      Box(
        { flexDirection: 'row', gap: 3, marginBottom: 1 },
        Box(
          { flexDirection: 'column' },
          Text({ dim: true }, 'Avg timing'),
          Text({ color: 'cyan', bold: true }, `ttfb ${formatTiming(avgTtfb)} · total ${formatTiming(avgTotal)}`),
          Text({ color: 'cyan', bold: true }, `download ${formatTiming(avgDownload)}`),
        ),
      ),

      // 2. Progress section: Analysis, Scores, Page Sizes (no gaps between them)
      Box(
        { flexDirection: 'row' },
        Box({ width: 8 }, Text({ dim: true }, 'Progress')),
        ProgressBar({
          value: analysisPercent,
          width: 25,
          showPercentage: true,
          color: isComplete ? 'success' : 'primary',
          borderStyle: 'none',
        }),
        Box({ marginLeft: 1 },
          Text({ dim: true }, `${s.analyzed}/${totalToAnalyze}`),
        ),
      ),
      ...(s.scores.length > 0 ? [
        Box(
          { flexDirection: 'row' },
          Box({ width: 10 }, Text({ dim: true }, 'Scores')),
          Sparkline({
            data: s.scores,
            width: 25,
            color: scoreColor,
            min: 0,
            max: 100,
          }),
          Box({ marginLeft: 1 },
            Text({ color: scoreColor }, `${last(s.scores) ?? ''}`),
          ),
        ),
      ] : []),
      ...(s.pageSizes.length > 0 ? [
        Box(
          { flexDirection: 'row' },
          Box({ width: 10 }, Text({ dim: true }, 'Sizes')),
          Sparkline({
            data: s.pageSizes,
            width: 25,
            color: 'cyan',
          }),
          Box({ marginLeft: 1 },
            Text({ color: 'cyan' }, `${last(s.pageSizes) ?? 0}KB`),
          ),
        ),
      ] : []),

      // 3. Timings sparklines (all gray except Total which is cyan)
      ...renderTimings(s),

      // 4. Recent pages table
      ...renderRecentPages(s.recentPages, isComplete, s.analyzed),

      // Summary when complete - build badges array to avoid null children
      // SERP summary (if available)
      ...(s.serpSummary ? [
        Box(
          { flexDirection: 'column', marginTop: 1 },
          Divider({}),
          Box(
            { flexDirection: 'row', marginTop: 1, height: 1 },
            Text({ bold: true }, 'SERP campaign'),
            Box({ width: 2 }, Text({}, '')),
            Text({ color: 'green' }, `queries ${s.serpSummary.queriesFound}/${s.serpSummary.queriesRequested}`),
            Box({ width: 2 }, Text({}, '')),
            Text({ color: 'blue' }, `top3 ${s.serpSummary.top3Count}`),
            Box({ width: 2 }, Text({}, '')),
            Text({ color: 'cyan' }, `top10 ${s.serpSummary.top10Count}`),
            s.serpSummary.avgTopPosition !== undefined && s.serpSummary.avgTopPosition !== null
                ? Box(
                  { width: 2 },
                  Text({ color: 'yellow' }, `avg pos ${Math.round(s.serpSummary.avgTopPosition)}`)
                )
              : null,
          ),
          s.serpSummary.topOrganicCompetitors && s.serpSummary.topOrganicCompetitors.length > 0
            ? Box(
                { marginTop: 1 },
                Text({ dim: true }, 'Top competitors'),
              )
            : null,
          ...(s.serpSummary.topOrganicCompetitors || []).slice(0, 3).map((item) => Box(
            { flexDirection: 'row' },
            Text({ dim: true }, `${item.domain}`),
            Text({ dim: true }, ` wins ${item.totalOutperformedQueries}`),
            Text({ dim: true }, ` matched ${item.matchedKeywords}`),
          )),
          s.serpSummary.topPages && s.serpSummary.topPages.length > 0
            ? Box(
                { marginTop: 1 },
                Text({ dim: true }, 'Pages outranking baseline'),
              )
            : null,
          ...(s.serpSummary.topPages || []).slice(0, 3).map((item) => Box(
            { flexDirection: 'row' },
            Text({ dim: true }, `${item.pageUrl}`),
            Text({ dim: true }, `${item.found}/${item.tracked}`),
            Text({ dim: true }, `${Math.round(item.appearanceRate)}%`),
          )),
        ),
      ] : []),

      ...(isComplete ? [
        Box(
          { flexDirection: 'column', marginTop: 1 },
          Divider({}),
          Box(
            { flexDirection: 'row', gap: 2, marginTop: 1, height: 1 },
            ...[
              s.duplicateTitles > 0 ? Badge({ label: `${s.duplicateTitles} dup titles`, color: 'destructive' }) : null,
              s.duplicateDescriptions > 0 ? Badge({ label: `${s.duplicateDescriptions} dup desc`, color: 'warning' }) : null,
              s.orphanPages > 0 ? Badge({ label: `${s.orphanPages} orphans`, color: 'secondary' }) : null,
              s.pagesWithErrors > 0 ? Badge({ label: `${s.pagesWithErrors} errors`, color: 'destructive' }) : null,
            ].filter(Boolean),
          ),
        ),
      ] : []),
    );
  }

  // Start rendering
  const app = render(SpiderApp);

  return {
    updateProgress,
    updateSeo,
    updateUrl,
    updateSecurity: (security?: {
      blocked?: boolean;
      captchaDetected?: boolean;
      captchaProvider?: string;
      attempts?: number;
      retryCount?: number;
      transport?: 'undici' | 'curl';
      ttfb?: number;
      total?: number;
      download?: number;
    }) => {
      setState((s) => ({
        ...s,
        antiBotPages: s.antiBotPages + 1,
        antiBotBlockedPages: s.antiBotBlockedPages + (security?.blocked ? 1 : 0),
        antiBotCaptchaPages: s.antiBotCaptchaPages + (security?.captchaDetected ? 1 : 0),
        antiBotCaptchaProviders: security?.captchaDetected ? {
          ...s.antiBotCaptchaProviders,
          [(security.captchaProvider || 'unknown').trim().toLowerCase()]: (s.antiBotCaptchaProviders[(security.captchaProvider || 'unknown').trim().toLowerCase()] || 0) + 1,
        } : s.antiBotCaptchaProviders,
        antiBotAttempts: s.antiBotAttempts + normalizeAttemptCount(security?.attempts),
        antiBotRetries: s.antiBotRetries + (security?.retryCount ?? 0),
        antiBotTransport: {
          undici: s.antiBotTransport.undici + (security?.transport === 'undici' ? 1 : 0),
          curl: s.antiBotTransport.curl + (security?.transport === 'curl' ? 1 : 0),
        },
        antiBotTtfbSamples: s.antiBotTtfbSamples + (hasTimingSample(security?.ttfb) ? 1 : 0),
        antiBotTotalSamples: s.antiBotTotalSamples + (hasTimingSample(security?.total) ? 1 : 0),
        antiBotDownloadSamples: s.antiBotDownloadSamples + (hasTimingSample(security?.download) ? 1 : 0),
        antiBotTtfbSum: s.antiBotTtfbSum + (safeNumber(security?.ttfb) ?? 0),
        antiBotTotalSum: s.antiBotTotalSum + (safeNumber(security?.total) ?? 0),
        antiBotDownloadSum: s.antiBotDownloadSum + (safeNumber(security?.download) ?? 0),
      }));
    },
    setSecuritySummary: (summary: SpiderSecuritySnapshot) => {
      setState((s) => ({
        ...s,
        security: summary,
        antiBotPages: summary.pages,
        antiBotBlockedPages: summary.blockedPages,
        antiBotCaptchaPages: summary.captchaPages,
        antiBotAttempts: summary.attempts,
        antiBotRetries: summary.retries,
        antiBotTransport: {
          undici: summary.transportUsage.undici,
          curl: summary.transportUsage.curl,
        },
        antiBotCaptchaProviders: summary.captchaProviders || {},
        antiBotTtfbSamples: summary.avgTtfbMs === undefined ? 0 : summary.pages,
        antiBotTtfbSum: summary.avgTtfbMs === undefined ? 0 : Math.round(summary.avgTtfbMs * summary.pages),
        antiBotTotalSamples: summary.avgTotalMs === undefined ? 0 : summary.pages,
        antiBotTotalSum: summary.avgTotalMs === undefined ? 0 : Math.round(summary.avgTotalMs * summary.pages),
        antiBotDownloadSamples: summary.avgDownloadMs === undefined ? 0 : summary.pages,
        antiBotDownloadSum: summary.avgDownloadMs === undefined ? 0 : Math.round(summary.avgDownloadMs * summary.pages),
      }));
    },
    setSerpSummary: (serpSummary: SpiderSerpSummary) => {
      setState((s) => ({ ...s, serpSummary }));
    },
    setComplete,
    setError,
    stop: () => {
      app.unmount();
      // Small delay to let terminal cleanup complete before resolving
      setTimeout(() => {
        if (resolveExit) resolveExit();
      }, 50);
    },
    waitUntilExit: () => exitPromise,
  };
}

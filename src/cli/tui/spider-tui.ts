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
} from 'tuiuiu.js';

export interface SpiderTimings {
  dns?: number;
  tcp?: number;
  tls?: number;
  ttfb?: number;
  download?: number;
  total?: number;
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

export function createSpiderTui(startUrl: string, limit: number) {
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

  // Render the TUI
  function SpiderApp() {
    const s = state();
    const elapsed = Math.round((Date.now() - s.startTime) / 1000);
    const isComplete = s.status === 'complete';

    // Analysis progress: analyzed / (analyzed + queued + pending)
    const totalToAnalyze = s.analyzed + s.queued + s.pending;
    const analysisPercent = totalToAnalyze > 0 ? Math.min(100, Math.round((s.analyzed / totalToAnalyze) * 100)) : 0;

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
    setComplete,
    setError,
    stop: () => app.unmount(),
    waitUntilExit: () => app.waitUntilExit(),
  };
}

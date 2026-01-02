/**
 * ShellApp - Root component for rek shell TUI
 *
 * This is the main entry point for the tuiuiu-based shell interface.
 * Uses AppShell for structured layout with header, content, and footer.
 */

import {
  render,
  Box,
  Text,
  TextInput,
  Spinner,
  StatusBar,
  ScrollList,
  createScrollList,
  useHotkeys,
  useApp,
  useEffect,
  useState,
  setTheme,
  createTheme,
  darkTheme,
  createTextInput,
  renderTextInput,
  useTerminalSize,
  Markdown,
  Tabs,
  createTabs,
  SplitPanel,
  Sparkline,
  Table,
} from 'tuiuiu.js';
import type { TabsState } from 'tuiuiu.js';
import { themeColor } from './shared/theme-helper.js';
import type { VNode } from 'tuiuiu.js';

import { RekHeader } from './shared/rek-header.js';
// JobsPanel removed - now using dedicated Jobs tab
import {
  ShellCommandPalette,
  createShellCommands,
  resetPaletteState,
  type ShellCommand,
} from './components/command-palette.js';
import {
  RichResponse,
  detectResponseType,
} from './components/rich-response.js';
import { getQuickHelp, getHelpMarkdown } from './components/help-view.js';
import {
  getSuggestions,
  type Suggestion,
} from './components/smart-input.js';
import {
  baseUrl,
  history,
  isLoading,
  setPromptValue,
  searchOpen,
  setSearchOpen,
  paletteOpen,
  setPaletteOpen,
  addHistoryItem,
  clearHistory,
  recordCommand,
  outputDir,
  recentUrls,
  lastResponse,
  latencyHistory,
  getAverageLatency,
  recordLatency,
  lastDnsResult,
  lastDnsDomain,
  pendingTabSwitch,
  setPendingTabSwitch,
  type HistoryItem,
} from './hooks/useShellState.js';
import {
  jobs,
  getJobManager,
  selectNextJob,
  selectPrevJob,
  toggleDetailMode,
  jobDetailMode,
  selectedJobId,
  stopJob,
  pruneJobs,
  nextJobsPage,
  prevJobsPage,
  getTotalPages,
} from './hooks/useJobs.js';
import {
  hasOverlay,
  handleOverlayEscape,
} from './hooks/useOverlays.js';
import {
  listDomains,
  getDomainStats,
  getDomainCount,
  selectedDomain,
  setSelectedDomain,
  domainViewMode,
  toggleDomainDetail,
  getSelectedDomainIntel,
  selectNextDomain,
  selectPrevDomain,
  type DomainEntry,
} from './hooks/useDomains.js';
import {
  selectNextHelpResult,
  selectPrevHelpResult,
  clearHelpSearch,
  helpResults,
  toggleHelpDetail,
} from './hooks/useHelp.js';
import {
  proxyServer,
  proxyViewMode,
  selectedRequestId,
  getFilteredRequests,
  selectNextRequest,
  selectPrevRequest,
  toggleProxyDetail,
  clearProxyRequests,
  exportProxyRequests,
  getSelectedRequest,
  requestToCurl,
} from './hooks/useProxy.js';
import { ProxyPanel } from './components/proxy-panel.js';
import { HelpPanel } from './components/help-panel.js';

// =============================================================================
// Theme (defined once at module level, not per-render)
// =============================================================================

const reckerTheme = createTheme(darkTheme, {
  name: 'recker',
  palette: {
    ...darkTheme.palette,
    primary: {
      ...darkTheme.palette.primary,
      500: '#FF9900', // Orange
      400: '#FFAA22',
      600: '#DD8800',
    },
  },
  background: {
    ...darkTheme.background,
    base: '#000000', // Black
    subtle: '#444444',
  },
  foreground: {
    ...darkTheme.foreground,
    muted: '#CCCCCC', // Light gray for readability
  },
  accents: {
    ...darkTheme.accents,
    highlight: '#FFFF00', // Yellow accent
    positive: '#00FF00', // Green success
    critical: '#FF0000', // Red error
  },
});

// Set theme immediately on module load
setTheme(reckerTheme);

// =============================================================================
// Persistent ScrollList State
// =============================================================================

// Create a persistent scroll state that survives re-renders
// This ensures autoScroll tracking works correctly
const historyScrollState = createScrollList({
  inverted: false,
  initialHeight: 20,
});

// =============================================================================
// Job Event Handlers for Toasts
// =============================================================================

// Job event toasts disabled - causing visual pollution
// TODO: Fix tuiuiu Toast component rendering issues before re-enabling
function initJobEventToasts(): void {
  // Disabled for now - toasts accumulate and break the UI
}

// =============================================================================
// Components
// =============================================================================

/**
 * ShellStatusBar - Bottom bar with hotkeys and status info
 */
function ShellStatusBar(): VNode {
  const base = baseUrl();
  const loading = isLoading();

  // Build status parts
  const parts: string[] = [];
  if (base) parts.push(`Base: ${base}`);
  if (loading) parts.push('Loading...');

  const statusText = parts.length > 0 ? parts.join(' │ ') : 'Ready';

  return StatusBar({
    left: Text({ color: themeColor('mutedForeground') }, statusText),
    right: Text({ color: themeColor('mutedForeground'), dim: true }, 'Ctrl+C Exit │ Alt+P Cmds │ Tab Cycle │ F1-F5 Tabs │ F6 Preview'),
    color: themeColor('muted'), // Background color (renamed from backgroundColor in 1.0.39)
  });
}

/**
 * Format content as lines for safe rendering
 * Handles objects, arrays, and multiline strings
 */
function formatContentLines(content: any, maxLines: number = 30, maxWidth: number = 80): string[] {
  let text: string;

  if (typeof content === 'string') {
    text = content;
  } else if (content && typeof content === 'object') {
    // Format object nicely
    text = JSON.stringify(content, null, 2);
  } else {
    text = String(content);
  }

  // Split into lines and limit
  const lines = text.split('\n');
  const limitedLines = lines.slice(0, maxLines);

  // Truncate long lines
  const truncatedLines = limitedLines.map(line => {
    if (line.length > maxWidth) {
      return line.slice(0, maxWidth - 3) + '...';
    }
    return line;
  });

  // Add truncation indicator if needed
  if (lines.length > maxLines) {
    truncatedLines.push(`... (${lines.length - maxLines} more lines)`);
  }

  return truncatedLines;
}

/**
 * HistoryItemView - Renders a single history item
 * Uses RichResponse for visual rendering of responses
 *
 * IMPORTANT: Following tuiuiu ScrollList height estimation rules:
 * - NO marginBottom (causes height underestimation)
 * - Use marginTop on the NEXT item instead
 * - Keep structure flat
 */
function HistoryItemView({ item, width }: { item: HistoryItem; width: number }): VNode {
  const contentWidth = Math.max(40, width - 4);

  switch (item.type) {
    case 'request':
    case 'command':
      // Commands get marginTop for spacing from previous item
      return Box(
        { marginTop: 1 },
        Text({ color: themeColor('primary'), bold: true }, `❯ ${item.content}`),
      );

    case 'response': {
      // Use RichResponse for visual rendering
      const responseData = item.content;
      const forceJson = item.meta?.forceJson === true;

      // Detect response type from data shape or use meta hint
      const responseType = item.meta?.responseType || detectResponseType(responseData);

      // Merge content with meta for richer display
      const enrichedData = {
        ...responseData,
        status: item.meta?.status,
        statusText: item.meta?.statusText,
        time: item.meta?.time,
        headers: item.meta?.headers,
      };

      // No marginBottom! RichResponse handles its own internal spacing
      return Box(
        { flexDirection: 'column', paddingLeft: 2 },
        RichResponse({
          type: responseType,
          data: enrichedData,
          width: contentWidth,
          forceJson,
        }),
      );
    }

    case 'info': {
      // Check if this is a help item with Markdown content
      if (item.meta?.isHelp) {
        return Box(
          { flexDirection: 'column', paddingLeft: 2 },
          Markdown({
            content: String(item.content),
          }),
        );
      }

      const infoLines = String(item.content).split('\n');
      return Box(
        { flexDirection: 'column' },
        ...infoLines.map(line => Text({ color: themeColor('accent') }, `  ℹ ${line}`)),
      );
    }

    case 'error':
      return Box(
        { flexDirection: 'column', marginTop: 1 },
        Text({ color: themeColor('error'), bold: true }, `  ✗ Error`),
        Text({ color: themeColor('error') }, `    ${item.content}`),
      );

    default:
      return Text({}, String(item.content));
  }
}

/**
 * HistoryView - Displays command/response history using ScrollList
 */
function HistoryView({ height, width }: { height: number; width: number }): VNode {
  // Get current history items (calling signal triggers reactivity)
  const historyItems = history();

  // Check if empty - show welcome message with overflow hidden to prevent bleeding
  if (historyItems.length === 0) {
    return Box(
      { flexDirection: 'column', height, overflow: 'hidden' },
      Text({ color: themeColor('mutedForeground'), dim: true },
        '  Welcome to rek shell! Type a URL to make a request.'
      ),
      Text({ color: themeColor('mutedForeground'), dim: true },
        '  Type "help" for available commands.'
      ),
    );
  }

  // Get last 100 items for display
  const displayItems = historyItems.slice(-100);

  return ScrollList({
    items: displayItems, // Pass computed array directly
    children: (item) => HistoryItemView({ item, width }),
    height,
    width,
    showScrollbar: true,
    inverted: false,
    keysEnabled: true, // Enable native keyboard scroll (PageUp/Down, arrows, vim keys)
    isActive: true,
    autoScroll: true, // Auto-scroll to bottom when new items appear
    autoScrollThreshold: 0, // Always auto-scroll (0 = always, regardless of scroll position)
    hotkeyScope: 'global', // Use global scope (scroll works alongside input)
    state: historyScrollState, // Use persistent state to track item count changes
  });
}

// TextInputState from createTextInput (using actual return type)
type TextInputStateInternal = ReturnType<typeof createTextInput>;

/**
 * SuggestionsPanel - Displays autocomplete suggestions above input
 * NOTE: No marginBottom to avoid height estimation issues in parent layout
 */
function SuggestionsPanel(props: { suggestions: Suggestion[]; selectedIndex: number; width: number }): VNode {
  const { suggestions, selectedIndex, width } = props;

  // Return null-equivalent when no suggestions (prevents empty box rendering)
  if (suggestions.length === 0) return Text({}, '');

  const getCategoryColor = (category: Suggestion['category']): string => {
    switch (category) {
      case 'command': return themeColor('primary');
      case 'preset': return themeColor('accent');
      case 'url': return themeColor('success');
      case 'variable': return themeColor('warning');
      default: return themeColor('foreground');
    }
  };

  return Box(
    {
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: themeColor('muted'),
      marginLeft: 1,
      // NO marginBottom - use marginTop on next component instead
      width: Math.min(60, width - 4),
    },
    ...suggestions.map((s, i) => {
      const isSelected = i === selectedIndex;
      const bgColor = isSelected ? themeColor('primary') : undefined;
      const fgColor = isSelected ? '#000000' : getCategoryColor(s.category);

      return Box(
        {
          flexDirection: 'row',
          backgroundColor: bgColor,
          paddingX: 1,
        },
        Text({ color: fgColor }, `${s.icon || '•'} `),
        Text({ color: fgColor, bold: isSelected }, s.label),
      );
    }),
    Box(
      { paddingX: 1 },
      Text({ color: themeColor('mutedForeground'), dim: true }, 'Tab/Shift+Tab cycle │ Enter apply │ Esc dismiss'),
    ),
  );
}

/**
 * PromptInput - Single-line command input with autocomplete suggestions
 */
function PromptInput(props: {
  width: number;
  textInputState: TextInputStateInternal;
  suggestions: Suggestion[];
  selectedSuggestionIndex: number;
  isActive: boolean;
}): VNode {
  const { width, textInputState, suggestions, selectedSuggestionIndex, isActive } = props;
  const loading = isLoading();

  if (loading) {
    return Box(
      { flexDirection: 'row', marginTop: 1, paddingX: 1 },
      Spinner({ style: 'dots', color: themeColor('primary'), text: 'Loading...' }),
    );
  }

  return Box(
    { flexDirection: 'column', width },
    // Suggestions appear above the input
    SuggestionsPanel({ suggestions, selectedIndex: selectedSuggestionIndex, width }),
    // Input with native theme-aware styling
    renderTextInput(textInputState, {
      placeholder: 'Enter URL or command...',
      width: width - 4, // Account for border padding
      fullWidth: true,
      borderStyle: 'round',
      focusedBorderColor: themeColor('primary'),
      unfocusedBorderColor: themeColor('muted'),
      prompt: '❯',
      foreground: themeColor('primary'),
      isActive,
    }),
  );
}

/**
 * DnsPanel - Quick DNS lookup interface with results table
 */
function DnsPanel({ width }: { width: number }): VNode {
  const dnsRecords = lastDnsResult();
  const domain = lastDnsDomain();

  return Box(
    { flexDirection: 'column', paddingX: 1 },
    Text({ color: themeColor('primary'), bold: true }, '🌐 DNS Lookup'),
    Text({ color: themeColor('muted') }, '─'.repeat(Math.min(40, width - 4))),
    Box({ height: 1 }),

    // Show results table if we have DNS records
    dnsRecords.length > 0
      ? Box(
          { flexDirection: 'column' },
          Text({ color: themeColor('accent'), bold: true }, `Results for: ${domain}`),
          Box({ height: 1 }),
          Table({
            columns: [
              { key: 'type', header: 'Type', width: 8, headerColor: themeColor('primary') },
              { key: 'value', header: 'Value', width: Math.min(50, width - 30), headerColor: themeColor('primary') },
              { key: 'ttl', header: 'TTL', width: 8, align: 'right' as const, headerColor: themeColor('primary') },
            ],
            data: dnsRecords.map(r => ({
              type: r.type,
              value: r.value.length > 45 ? r.value.slice(0, 42) + '...' : r.value,
              ttl: r.ttl ? `${r.ttl}s` : '-',
            })),
            borderStyle: 'round',
            borderColor: themeColor('muted'),
            striped: true,
            padding: 1,
          }),
        )
      : Box(
          { flexDirection: 'column' },
          Text({ color: themeColor('foreground') }, 'Quick commands:'),
          Text({ color: themeColor('mutedForeground') }, '  dns <domain>     A, AAAA, MX, TXT records'),
          Text({ color: themeColor('mutedForeground') }, '  whois <domain>   WHOIS registration info'),
          Text({ color: themeColor('mutedForeground') }, '  rdap <domain>    Modern WHOIS (RDAP)'),
          Text({ color: themeColor('mutedForeground') }, '  ip <address>     GeoIP lookup'),
        ),
    Box({ height: 1 }),
    Text({ color: themeColor('accent'), dim: true }, 'Type a DNS command in the input below...'),
  );
}

/**
 * ToolsPanel - Network tools interface
 */
function ToolsPanel({ width }: { width: number }): VNode {
  return Box(
    { flexDirection: 'column', paddingX: 1 },
    Text({ color: themeColor('primary'), bold: true }, '🛠️ Network Tools'),
    Text({ color: themeColor('muted') }, '─'.repeat(Math.min(40, width - 4))),
    Box({ height: 1 }),
    Text({ color: themeColor('foreground') }, 'Available tools:'),
    Text({ color: themeColor('mutedForeground') }, '  ping <host:port>  TCP connectivity test'),
    Text({ color: themeColor('mutedForeground') }, '  tls <host>        TLS certificate info'),
    Text({ color: themeColor('mutedForeground') }, '  spider <url>      Crawl website links'),
    Text({ color: themeColor('mutedForeground') }, '  seo <url>         SEO analysis'),
    Box({ height: 1 }),
    Text({ color: themeColor('foreground') }, 'Live streaming:'),
    Text({ color: themeColor('mutedForeground') }, '  live download <m3u8>  Download HLS stream'),
    Text({ color: themeColor('mutedForeground') }, '  live watch <m3u8>     Monitor stream'),
    Box({ height: 1 }),
    Text({ color: themeColor('accent'), dim: true }, 'Type a command in the input below...'),
  );
}

/**
 * LatencyStats - Sparkline visualization of request latencies
 */
function LatencyStats({ width }: { width: number }): VNode | null {
  const latencies = latencyHistory();

  if (latencies.length === 0) {
    return null;
  }

  const avgLatency = getAverageLatency();
  const lastLatency = latencies[latencies.length - 1];
  const maxLatency = Math.max(...latencies);
  const minLatency = Math.min(...latencies);

  return Box(
    { flexDirection: 'row', gap: 2, paddingX: 1 },
    // Sparkline chart
    Box(
      { flexDirection: 'row', gap: 1 },
      Text({ color: themeColor('mutedForeground'), dim: true }, '⚡'),
      Sparkline({
        data: latencies,
        width: Math.min(20, Math.floor(width / 4)),
        color: themeColor('accent'),
      }),
    ),
    // Stats
    Text(
      { color: themeColor('mutedForeground'), dim: true },
      `avg: ${avgLatency}ms │ last: ${lastLatency}ms │ range: ${minLatency}-${maxLatency}ms`
    ),
  );
}

/**
 * ResponsePreview - Detailed view of the last response
 */
function ResponsePreview({ height, width }: { height: number; width: number }): VNode {
  const response = lastResponse();

  if (!response) {
    return Box(
      { flexDirection: 'column', paddingX: 1 },
      Text({ color: themeColor('mutedForeground'), dim: true }, 'No response yet'),
      Text({ color: themeColor('mutedForeground'), dim: true }, 'Make a request to see preview'),
    );
  }

  // Format response for preview
  const formatResponse = () => {
    if (typeof response === 'string') {
      return response;
    }
    try {
      return JSON.stringify(response, null, 2);
    } catch {
      return String(response);
    }
  };

  const formatted = formatResponse();
  const lines = formatted.split('\n').slice(0, Math.max(5, height - 4));

  return Box(
    { flexDirection: 'column', paddingX: 1 },
    Text({ color: themeColor('primary'), bold: true }, '📋 Response Preview'),
    Text({ color: themeColor('muted') }, '─'.repeat(Math.min(30, width - 4))),
    Box({ height: 1 }),
    ...lines.map((line, i) =>
      Text(
        { color: themeColor('foreground') },
        line.length > width - 4 ? line.slice(0, width - 7) + '...' : line
      )
    ),
    lines.length < formatted.split('\n').length
      ? Text({ color: themeColor('mutedForeground'), dim: true }, `... (${formatted.split('\n').length - lines.length} more lines)`)
      : null,
  );
}

/**
 * SearchOverlay - Ctrl+F search modal
 */
function SearchOverlay({ onClose }: { onClose: () => void }): VNode {
  return Box(
    { flexDirection: 'column', padding: 2 },
    Box(
      { borderStyle: 'round', borderColor: themeColor('primary'), padding: 1 },
      Text({ color: themeColor('primary'), bold: true }, ' 🔍 Search History '),
      Box({ height: 1 }),
      TextInput({
        initialValue: '',
        onChange: () => { },
        placeholder: 'Search...',
        isActive: true,
      }),
      Box({ height: 1 }),
      Text({ color: themeColor('mutedForeground'), dim: true }, '  ESC to close'),
    ),
  );
}

// =============================================================================
// Tab Content Rendering
// =============================================================================

interface TabContentProps {
  width: number;
  height: number;
  previewOpen: boolean;
}

/**
 * Render content for the active tab
 */
function renderTabContent(activeTab: string, props: TabContentProps): VNode {
  const { width, height, previewOpen } = props;

  switch (activeTab) {
    case 'sandbox':
      // Sandbox tab: Command history with optional preview panel
      return previewOpen
        ? SplitPanel({
            direction: 'horizontal',
            width,
            height: height - 1,
            ratio: 0.6,
            left: HistoryView({ height: height - 1, width: Math.floor(width * 0.6) - 1 }),
            right: ResponsePreview({ height: height - 1, width: Math.floor(width * 0.4) - 1 }),
            divider: true,
            dividerStyle: 'line',
            dividerColor: themeColor('muted'),
            leftTitle: 'History',
            rightTitle: 'Preview',
            leftTitleColor: themeColor('primary'),
            rightTitleColor: themeColor('accent'),
          })
        : HistoryView({ height, width });

    case 'jobs':
      // Jobs tab: Background job management (placeholder for now, will be JobsTab)
      return JobsTabContent({ width, height });

    case 'domains':
      // Domains tab: Domain intelligence aggregator (placeholder)
      return DomainsTabContent({ width, height });

    case 'proxy':
      // Proxy tab: Real-time proxy monitoring
      return ProxyPanel({ width, height });

    case 'help':
      // Help tab: Documentation search with tuiuiu components
      return HelpPanel({ width, height });

    default:
      return HistoryView({ height, width });
  }
}

/**
 * Jobs Tab Content - Shows all background jobs with management
 */
function JobsTabContent({ width, height }: { width: number; height: number }): VNode {
  const allJobs = jobs();
  const primaryColor = themeColor('primary');
  const mutedFg = themeColor('mutedForeground');
  const successColor = themeColor('success');
  const warningColor = themeColor('warning');
  const errorColor = themeColor('error');
  const selected = selectedJobId();

  if (allJobs.length === 0) {
    return Box(
      { flexDirection: 'column', paddingX: 2, paddingY: 1 },
      Text({ color: primaryColor, bold: true }, '📋 Background Jobs'),
      Text({ color: mutedFg }, '─'.repeat(Math.min(40, width - 4))),
      Box({ height: 1 }),
      Text({ color: mutedFg, dim: true }, 'No jobs running.'),
      Box({ height: 1 }),
      Text({ color: mutedFg }, 'Start a background job with:'),
      Text({ color: mutedFg, dim: true }, '  spider example.com &'),
      Text({ color: mutedFg, dim: true }, '  live download @twitch/user &'),
      Text({ color: mutedFg, dim: true }, '  seo example.com &'),
    );
  }

  // Format job rows
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': case 'crawling': case 'watching': case 'loading': case 'analyzing': case 'serving': case 'proxying':
        return successColor;
      case 'completed':
        return primaryColor;
      case 'failed':
        return errorColor;
      case 'stopped':
        return warningColor;
      default:
        return mutedFg;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'download': return '⬇';
      case 'watch': return '👁';
      case 'spider': return '🕷';
      case 'server': return '🖥';
      case 'loadtest': return '⚡';
      case 'seo': return '📊';
      case 'video': return '🎬';
      case 'hls': return '📺';
      case 'proxy': return '🔀';
      default: return '•';
    }
  };

  const formatProgress = (job: typeof allJobs[0]) => {
    if (job.type === 'spider') {
      return `${job.progress.pages || 0} pgs`;
    }
    if (job.type === 'proxy') {
      const reqs = job.progress.proxyRequests || 0;
      return `${reqs} req`;
    }
    if (job.progress.bytes > 0) {
      const mb = (job.progress.bytes / 1024 / 1024).toFixed(1);
      return `${mb} MB`;
    }
    if (job.progress.segments > 0) {
      return `${job.progress.segments} seg`;
    }
    return '...';
  };

  // Get active vs inactive job counts
  const activeCount = allJobs.filter(j =>
    ['running', 'watching', 'crawling', 'serving', 'loading', 'analyzing', 'proxying'].includes(j.status)
  ).length;

  return Box(
    { flexDirection: 'column', paddingX: 1 },
    Text({ color: primaryColor, bold: true }, `📋 Background Jobs (${activeCount} active / ${allJobs.length} total)`),
    Text({ color: mutedFg }, '─'.repeat(Math.min(60, width - 4))),
    Box({ height: 1 }),
    // Table header
    Box(
      { flexDirection: 'row', gap: 1 },
      Text({ color: mutedFg, dim: true, bold: true }, '   ID'),
      Text({ color: mutedFg, dim: true, bold: true }, '  Type'),
      Text({ color: mutedFg, dim: true, bold: true }, '  Status   '),
      Text({ color: mutedFg, dim: true, bold: true }, '  Target        '),
      Text({ color: mutedFg, dim: true, bold: true }, '  Progress'),
    ),
    // Job rows with selection indicator
    ...allJobs.slice(0, height - 7).map(job => {
      const isSelected = job.id === selected;
      const marker = isSelected ? '►' : ' ';

      return Box(
        { flexDirection: 'row', gap: 1, backgroundColor: isSelected ? themeColor('muted') : undefined },
        Text({ color: isSelected ? primaryColor : mutedFg }, ` ${marker} ${job.id.toString().padStart(2)}`),
        Text({ color: primaryColor }, `  ${getTypeIcon(job.type)} `),
        Text({ color: getStatusColor(job.status) }, `  ${job.status.padEnd(10)}`),
        Text({ color: isSelected ? primaryColor : mutedFg }, `  ${job.target.slice(0, 14).padEnd(14)}`),
        Text({ color: isSelected ? primaryColor : mutedFg }, `  ${formatProgress(job)}`),
      );
    }),
    Box({ height: 1 }),
    Text({ color: mutedFg, dim: true }, '  Ctrl+↑↓: Select │ Alt+S: Stop │ Alt+X: Prune completed'),
  );
}

/**
 * Domains Tab Content - Domain intelligence aggregator
 */
function DomainsTabContent({ width, height }: { width: number; height: number }): VNode {
  const primaryColor = themeColor('primary');
  const mutedFg = themeColor('mutedForeground');
  const successColor = themeColor('success');
  const accentColor = themeColor('accent');

  const allDomains = listDomains();
  const stats = getDomainStats();
  const viewMode = domainViewMode();
  const selected = selectedDomain();

  // Empty state
  if (allDomains.length === 0) {
    return Box(
      { flexDirection: 'column', paddingX: 2, paddingY: 1 },
      Text({ color: primaryColor, bold: true }, '🌐 Domain Intelligence'),
      Text({ color: mutedFg }, '─'.repeat(Math.min(40, width - 4))),
      Box({ height: 1 }),
      Text({ color: mutedFg, dim: true }, 'No domains tracked yet.'),
      Box({ height: 1 }),
      Text({ color: mutedFg }, 'Domains are automatically tracked when you:'),
      Text({ color: mutedFg, dim: true }, '  • Run DNS lookups: dns example.com'),
      Text({ color: mutedFg, dim: true }, '  • Analyze SEO: seo example.com'),
      Text({ color: mutedFg, dim: true }, '  • Spider websites: spider example.com'),
      Text({ color: mutedFg, dim: true }, '  • Download streams: live download @site/user'),
    );
  }

  // Detail view for selected domain
  if (viewMode === 'detail' && selected) {
    const intel = getSelectedDomainIntel();
    if (!intel) {
      return Box(
        { flexDirection: 'column', paddingX: 2 },
        Text({ color: mutedFg }, 'Domain not found. Press Esc to go back.'),
      );
    }

    return Box(
      { flexDirection: 'column', paddingX: 1 },
      // Header
      Text({ color: primaryColor, bold: true }, `🌐 ${intel.domain}`),
      Text({ color: mutedFg }, '─'.repeat(Math.min(60, width - 4))),
      Text({ color: mutedFg, dim: true }, `First seen: ${intel.firstSeen.toLocaleString()} │ Last: ${intel.lastAccessed.toLocaleString()}`),
      Box({ height: 1 }),

      // DNS Section
      intel.dns ? Box(
        { flexDirection: 'column' },
        Text({ color: accentColor, bold: true }, '📡 DNS Records'),
        ...intel.dns.records.slice(0, 5).map(r =>
          Text({ color: mutedFg }, `  ${r.type.padEnd(6)} ${r.value}`)
        ),
        intel.dns.records.length > 5
          ? Text({ color: mutedFg, dim: true }, `  ... and ${intel.dns.records.length - 5} more`)
          : null,
        Box({ height: 1 }),
      ) : null,

      // SEO Section
      intel.seo ? Box(
        { flexDirection: 'column' },
        Text({ color: accentColor, bold: true }, `📊 SEO Score: ${intel.seo.score}/100`),
        Text({ color: mutedFg }, `  Issues: ${intel.seo.issues} │ Technical: ${intel.seo.categories.technical} │ Content: ${intel.seo.categories.content}`),
        Box({ height: 1 }),
      ) : null,

      // Spider Section
      intel.spider ? Box(
        { flexDirection: 'column' },
        Text({ color: accentColor, bold: true }, `🕷 Spider Results`),
        Text({ color: mutedFg }, `  Pages: ${intel.spider.pagesFound} │ Links: ${intel.spider.internalLinks + intel.spider.externalLinks} │ Images: ${intel.spider.images}`),
        Box({ height: 1 }),
      ) : null,

      // Downloads Section
      intel.downloads.length > 0 ? Box(
        { flexDirection: 'column' },
        Text({ color: accentColor, bold: true }, `📥 Downloads (${intel.downloads.length})`),
        ...intel.downloads.slice(-3).map(d =>
          Text({ color: mutedFg }, `  ${d.type.padEnd(5)} ${d.filename.slice(0, 30)} (${(d.size / 1024 / 1024).toFixed(1)} MB)`)
        ),
        Box({ height: 1 }),
      ) : null,

      // Footer
      Text({ color: mutedFg, dim: true }, 'Esc: Back to list │ Ctrl+D: DNS │ Ctrl+S: SEO │ Ctrl+R: Crawl'),
    );
  }

  // List view
  return Box(
    { flexDirection: 'column', paddingX: 1 },
    Text({ color: primaryColor, bold: true }, `🌐 Domain Intelligence (${stats.total})`),
    Text({ color: mutedFg }, '─'.repeat(Math.min(60, width - 4))),
    Box({ height: 1 }),

    // Stats summary
    Box(
      { flexDirection: 'row', gap: 2 },
      Text({ color: mutedFg, dim: true }, `DNS: ${stats.withDns}`),
      Text({ color: mutedFg, dim: true }, `SEO: ${stats.withSeo}`),
      Text({ color: mutedFg, dim: true }, `Spider: ${stats.withSpider}`),
      Text({ color: mutedFg, dim: true }, `Downloads: ${stats.totalDownloads}`),
    ),
    Box({ height: 1 }),

    // Table header
    Box(
      { flexDirection: 'row', gap: 1 },
      Text({ color: mutedFg, dim: true, bold: true }, '   Domain'.padEnd(25)),
      Text({ color: mutedFg, dim: true, bold: true }, 'DNS'),
      Text({ color: mutedFg, dim: true, bold: true }, ' SEO'),
      Text({ color: mutedFg, dim: true, bold: true }, ' Spider'),
      Text({ color: mutedFg, dim: true, bold: true }, ' DL'),
    ),

    // Domain rows
    ...allDomains.slice(0, height - 10).map((entry, idx) => {
      const isSelected = entry.domain === selected;
      const d = entry.intel;
      const marker = isSelected ? '►' : ' ';

      return Box(
        { flexDirection: 'row', gap: 1, backgroundColor: isSelected ? themeColor('muted') : undefined },
        Text({ color: isSelected ? primaryColor : mutedFg }, ` ${marker} ${entry.domain.slice(0, 22).padEnd(22)}`),
        Text({ color: d.dns ? successColor : mutedFg, dim: !d.dns }, d.dns ? ` ✓${d.dns.records.length.toString().padStart(2)}` : '  - '),
        Text({ color: d.seo ? successColor : mutedFg, dim: !d.seo }, d.seo ? ` ${d.seo.score.toString().padStart(3)}` : '   -'),
        Text({ color: d.spider ? successColor : mutedFg, dim: !d.spider }, d.spider ? ` ${d.spider.pagesFound.toString().padStart(5)}` : '     -'),
        Text({ color: d.downloads.length > 0 ? successColor : mutedFg, dim: d.downloads.length === 0 }, d.downloads.length > 0 ? ` ${d.downloads.length.toString().padStart(2)}` : '  -'),
      );
    }),

    Box({ height: 1 }),
    Text({ color: mutedFg, dim: true }, '  Ctrl+↑↓: Select │ Ctrl+Enter: Details │ Ctrl+D: DNS │ Ctrl+S: SEO │ Ctrl+R: Crawl'),
  );
}

// =============================================================================
// Main App
// =============================================================================

export interface ShellAppProps {
  onCommand?: (command: string) => Promise<void>;
}

/**
 * ShellApp - Main shell application using AppShell layout
 */
export function ShellApp(props: ShellAppProps = {}): VNode {
  const { onCommand } = props;
  const { exit } = useApp();

  // Terminal dimensions (reactive)
  const { columns: width, rows: height } = useTerminalSize();

  // Command history for navigation (like bash history)
  const [commandHistoryList, setCommandHistoryList] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1); // -1 = new command, 0+ = index in history
  const [savedInput, setSavedInput] = useState(''); // Save current input when navigating up

  // Handle command submission
  const handleSubmit = async (command: string) => {
    if (!command.trim()) return;

    recordCommand(command);
    addHistoryItem({ type: 'request', content: command });

    // Add to local history for TextInput navigation
    setCommandHistoryList(prev => [...prev, command]);

    // Reset history navigation state
    setHistoryIndex(-1);
    setSavedInput('');

    if (onCommand) {
      try {
        await onCommand(command);
      } catch (err: any) {
        addHistoryItem({ type: 'error', content: err.message || String(err) });
      }
    }
  };

  // Suggestion state for autocomplete
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

  // Preview panel state (toggle with F4)
  const [previewOpen, setPreviewOpen] = useState(false);

  // Tab navigation state - using createTabs with proper state management
  const [getTabsState] = useState<TabsState<string>>(createTabs<string>({
    tabs: [
      { key: 'sandbox', label: '⚡ Sandbox', content: Box({}) },
      { key: 'jobs', label: '📋 Jobs', content: Box({}) },
      { key: 'domains', label: '🌐 Domains', content: Box({}) },
      { key: 'proxy', label: '🔀 Proxy', content: Box({}) },
      { key: 'help', label: '❓ Help', content: Box({}) },
    ],
    initialTab: 'sandbox',
  }));
  const tabs = getTabsState();

  // Helper to clear suggestions
  const clearSuggestionsState = () => {
    setSuggestions([]);
    setSelectedSuggestionIndex(0);
  };

  // Create persistent TextInput state
  const [textInputState] = useState(createTextInput({
    onChange: (value) => {
      setPromptValue(value);
      // Compute suggestions based on input
      const newSuggestions = getSuggestions(value, recentUrls());
      setSuggestions(newSuggestions);
      setSelectedSuggestionIndex(0);
    },
    onSubmit: (value) => {
      if (!value.trim()) return;
      clearSuggestionsState();
      // Clear input FIRST so user sees it's being processed
      textInputState().clear();
      // Handle submit async - properly awaits the command execution
      handleSubmit(value).catch((err) => {
        addHistoryItem({ type: 'error', content: `Unhandled error: ${err.message || String(err)}` });
      });
    },
  }));

  // Calculate content height (total - header - statusbar - tabs - input - suggestions)
  const headerHeight = width >= 60 ? 5 : 1;
  const tabsHeight = 1; // Tabs bar
  const statusBarHeight = 1;
  const suggestionsHeight = suggestions().length > 0 ? suggestions().length + 3 : 0;
  const inputHeight = 3 + suggestionsHeight; // Input + border + suggestions
  const activeJobsCount = jobs().filter(j => ['running', 'watching', 'crawling', 'analyzing', 'serving', 'loading'].includes(j.status)).length;
  // The -3 accounts for borders/spacing between components
  const contentHeight = Math.max(5, height - headerHeight - statusBarHeight - tabsHeight - inputHeight - 3);

  // Note: Auto-scroll is now handled natively by ScrollList with autoScroll prop

  // Global keyboard shortcuts
  useHotkeys('ctrl+c', () => exit());
  useHotkeys('alt+l', () => {
    clearHistory();
  });
  useHotkeys('alt+f', () => setSearchOpen(true));
  useHotkeys('alt+p', () => setPaletteOpen(true));
  // Note: Scroll is handled natively by ScrollList (keysEnabled: true)
  // Supports: PageUp/Down, arrows, Home/End, vim keys (j/k), mouse wheel
  // Function key hotkeys (don't conflict with text input)
  useHotkeys('f1', () => tabs.setActiveTab('sandbox'));
  useHotkeys('f2', () => tabs.setActiveTab('jobs'));
  useHotkeys('f3', () => tabs.setActiveTab('domains'));
  useHotkeys('f4', () => tabs.setActiveTab('proxy'));
  useHotkeys('f5', () => tabs.setActiveTab('help'));
  useHotkeys('f6', () => setPreviewOpen(prev => !prev));

  // Handle pending tab switch requests (from executor, e.g., help queries)
  // Note: tuiuiu's useEffect runs on every render, signals auto-track dependencies
  useEffect(() => {
    const pending = pendingTabSwitch();
    if (pending) {
      tabs.setActiveTab(pending);
      setPendingTabSwitch(null); // Consume the request
    }
  });

  // Tab key: cycle suggestions if any, otherwise cycle tabs
  const tabKeys = ['sandbox', 'jobs', 'domains', 'proxy', 'help'];
  useHotkeys('tab', () => {
    const currentSuggestions = suggestions();
    if (currentSuggestions.length > 0) {
      // Cycle through suggestions
      const currentIdx = selectedSuggestionIndex();
      const newIdx = (currentIdx + 1) % currentSuggestions.length;
      setSelectedSuggestionIndex(newIdx);
      const selected = currentSuggestions[newIdx];
      if (selected) {
        textInputState().setValue(selected.value);
      }
    } else {
      // Cycle to next tab
      const currentTab = tabs.activeTab();
      const currentIdx = tabKeys.indexOf(currentTab);
      const nextIdx = (currentIdx + 1) % tabKeys.length;
      tabs.setActiveTab(tabKeys[nextIdx]);
    }
  });
  useHotkeys('shift+tab', () => {
    const currentSuggestions = suggestions();
    if (currentSuggestions.length > 0) {
      // Cycle through suggestions backwards
      const currentIdx = selectedSuggestionIndex();
      const newIdx = currentIdx <= 0 ? currentSuggestions.length - 1 : currentIdx - 1;
      setSelectedSuggestionIndex(newIdx);
      const selected = currentSuggestions[newIdx];
      if (selected) {
        textInputState().setValue(selected.value);
      }
    } else {
      // Cycle to previous tab
      const currentTab = tabs.activeTab();
      const currentIdx = tabKeys.indexOf(currentTab);
      const prevIdx = currentIdx <= 0 ? tabKeys.length - 1 : currentIdx - 1;
      tabs.setActiveTab(tabKeys[prevIdx]);
    }
  });

  // Command history navigation (up/down arrows) - works in Sandbox tab
  useHotkeys('up', () => {
    // Only for command history in sandbox
    const history = commandHistoryList();
    if (history.length === 0) return;

    const currentIndex = historyIndex();

    // If at new command (-1), save current input first
    if (currentIndex === -1) {
      setSavedInput(textInputState().value());
    }

    // Navigate backwards in history (towards older commands)
    const newIndex = currentIndex === -1
      ? history.length - 1
      : Math.max(0, currentIndex - 1);

    setHistoryIndex(newIndex);
    textInputState().setValue(history[newIndex]);
  });

  useHotkeys('down', () => {
    // Only for command history in sandbox
    const history = commandHistoryList();
    const currentIndex = historyIndex();

    if (currentIndex === -1) return;

    if (currentIndex >= history.length - 1) {
      setHistoryIndex(-1);
      textInputState().setValue(savedInput());
    } else {
      const newIndex = currentIndex + 1;
      setHistoryIndex(newIndex);
      textInputState().setValue(history[newIndex]);
    }
  });

  // Tab list navigation with Alt+Up/Down
  // - In Jobs tab: navigate jobs list
  // - In Domains tab: navigate domains list
  // - In Proxy tab: navigate proxy requests
  // - In Help tab: navigate help results
  useHotkeys('alt+up', () => {
    const activeTab = tabs.activeTab();
    switch (activeTab) {
      case 'jobs':
        selectPrevJob();
        break;
      case 'domains':
        selectPrevDomain();
        break;
      case 'proxy':
        selectPrevRequest();
        break;
      case 'help':
        selectPrevHelpResult();
        break;
    }
  });

  useHotkeys('alt+down', () => {
    const activeTab = tabs.activeTab();
    switch (activeTab) {
      case 'jobs':
        selectNextJob();
        break;
      case 'domains':
        selectNextDomain();
        break;
      case 'proxy':
        selectNextRequest();
        break;
      case 'help':
        selectNextHelpResult();
        break;
    }
  });

  // Enter key - toggle detail view in Jobs/Domains/Proxy tabs (Alt+Enter to avoid conflict)
  useHotkeys('alt+enter', () => {
    const activeTab = tabs.activeTab();
    switch (activeTab) {
      case 'jobs':
        if (jobs().length > 0) {
          toggleDetailMode();
        }
        break;
      case 'domains':
        if (listDomains().length > 0) {
          toggleDomainDetail();
        }
        break;
      case 'proxy':
        if (getFilteredRequests().length > 0) {
          toggleProxyDetail();
        }
        break;
      case 'help':
        if (helpResults().length > 0) {
          toggleHelpDetail();
        }
        break;
    }
  });

  // Job action hotkeys (must use modifiers to avoid input conflict)
  // Alt+S: Stop selected job
  useHotkeys('alt+s', () => {
    const activeTab = tabs.activeTab();
    if (activeTab === 'jobs') {
      const selectedId = selectedJobId();
      if (selectedId !== null) {
        stopJob(selectedId);
        addHistoryItem({ type: 'info', content: `Job #${selectedId} stopped` });
      }
    }
  });

  // Alt+X: Prune completed/stopped/failed jobs
  useHotkeys('alt+x', () => {
    const activeTab = tabs.activeTab();
    if (activeTab === 'jobs') {
      const pruned = pruneJobs();
      if (pruned > 0) {
        addHistoryItem({ type: 'info', content: `Pruned ${pruned} completed job(s)` });
      } else {
        addHistoryItem({ type: 'info', content: 'No completed/stopped/failed jobs to prune' });
      }
    }
  });

  // Alt+Left/Right: Paginate jobs list (in Jobs tab)
  useHotkeys('alt+left', () => {
    if (tabs.activeTab() === 'jobs' && getTotalPages() > 1) {
      prevJobsPage();
    }
  });

  useHotkeys('alt+right', () => {
    if (tabs.activeTab() === 'jobs' && getTotalPages() > 1) {
      nextJobsPage();
    }
  });

  // Domain action hotkeys (Alt+D, Alt+E, Alt+R)
  // Sets the command in input for the selected domain
  useHotkeys('alt+d', () => {
    const activeTab = tabs.activeTab();
    if (activeTab === 'domains') {
      const domain = selectedDomain();
      if (domain) {
        textInputState().setValue(`dns ${domain}`);
      }
    }
  });

  useHotkeys('alt+e', () => {
    const activeTab = tabs.activeTab();
    if (activeTab === 'domains') {
      const domain = selectedDomain();
      if (domain) {
        textInputState().setValue(`seo ${domain}`);
      }
    }
  });

  useHotkeys('alt+r', () => {
    const activeTab = tabs.activeTab();
    if (activeTab === 'domains') {
      const domain = selectedDomain();
      if (domain) {
        textInputState().setValue(`spider ${domain} &`);
      }
    }
  });

  // Proxy action hotkeys
  // Alt+C: Clear proxy requests
  useHotkeys('alt+c', () => {
    const activeTab = tabs.activeTab();
    if (activeTab === 'proxy') {
      clearProxyRequests();
      addHistoryItem({ type: 'info', content: 'Proxy requests cleared' });
    }
  });

  // Alt+Y: Copy selected request as cURL
  useHotkeys('alt+y', () => {
    const activeTab = tabs.activeTab();
    if (activeTab === 'proxy') {
      const req = getSelectedRequest();
      if (req) {
        const curl = requestToCurl(req);
        // Note: In a terminal, we can't copy to clipboard directly
        // Instead, show the curl command in history
        addHistoryItem({ type: 'info', content: `cURL command:\n${curl}` });
      } else {
        addHistoryItem({ type: 'info', content: 'No request selected. Use Ctrl+↑↓ to navigate.' });
      }
    }
  });

  // Alt+E: Export proxy requests
  useHotkeys('alt+e', () => {
    const activeTab = tabs.activeTab();
    if (activeTab === 'proxy') {
      const data = exportProxyRequests();
      addHistoryItem({ type: 'info', content: `Exported ${getFilteredRequests().length} requests to JSON` });
      // Add JSON to history for viewing
      addHistoryItem({ type: 'response', content: JSON.parse(data), meta: { forceJson: true } });
    }
  });

  useHotkeys('escape', () => {
    // First check if we're in history navigation mode
    if (historyIndex() !== -1) {
      // Exit history navigation, restore saved input
      setHistoryIndex(-1);
      textInputState().setValue(savedInput());
      return;
    }
    // Then clear suggestions if any
    if (suggestions().length > 0) {
      clearSuggestionsState();
      return;
    }
    // Check if there's an overlay to close
    if (hasOverlay()) {
      handleOverlayEscape();
      return;
    }
    if (paletteOpen()) {
      setPaletteOpen(false);
      resetPaletteState();
    } else if (searchOpen()) {
      setSearchOpen(false);
    }
  });

  // Render search overlay if open
  if (searchOpen()) {
    return SearchOverlay({ onClose: () => setSearchOpen(false) });
  }

  // Create commands for palette
  const shellCommands = createShellCommands({
    onExit: exit,
    onClear: () => {
      clearHistory();
    },
    onSearch: () => setSearchOpen(true),
    onHelp: () => {
      // Add quick help to history as a special formatted item
      addHistoryItem({
        type: 'info',
        content: getHelpMarkdown(),
        meta: { isHelp: true },
      });
    },
    onToggleJobs: () => tabs.setActiveTab('jobs'), // Navigate to Jobs tab instead
  });

  // Handle command selection from palette
  const handleCommandSelect = (cmd: ShellCommand) => {
    setPaletteOpen(false);
    resetPaletteState();
    cmd.action();
  };

  // Render command palette if open
  if (paletteOpen()) {
    return ShellCommandPalette({
      visible: true,
      onClose: () => {
        setPaletteOpen(false);
        resetPaletteState();
      },
      onSelect: handleCommandSelect,
      commands: shellCommands,
      width,
    });
  }

  // Build simple vertical layout (more reliable than AppShell for this use case)
  return Box(
    { flexDirection: 'column', height, overflow: 'hidden' },
    // Header (no top spacer needed - tuiuiu handles terminal positioning)
    RekHeader({
      mode: 'shell',
      subtitle: baseUrl() || undefined,
      status: isLoading() ? 'loading...' : undefined,
      activeJobs: activeJobsCount,
      outputDir: outputDir() || undefined,
      width,
    }),
    // Status bar (right below header for visibility)
    ShellStatusBar(),
    // Tab header bar - using createTabs state for external control
    Box(
      { paddingX: 1, overflow: 'hidden', height: tabsHeight },
      Tabs({
        tabs: [
          { key: 'sandbox', label: '⚡ Sandbox', content: Box({}) },
          { key: 'jobs', label: '📋 Jobs', content: Box({}) },
          { key: 'domains', label: '🌐 Domains', content: Box({}) },
          { key: 'proxy', label: '🔀 Proxy', content: Box({}) },
          { key: 'help', label: '❓ Help', content: Box({}) },
        ],
        state: tabs,
        isActive: false, // We handle keyboard ourselves via F1-F5
      }),
    ),
    // Latency sparkline (only in Sandbox tab when there's data)
    tabs.activeTab() === 'sandbox' ? LatencyStats({ width }) : null,
    // Tab content area - render based on active tab
    // NOTE: No flexGrow - we set explicit height to prevent overflow
    Box(
      { flexDirection: 'column', overflow: 'hidden', height: latencyHistory().length > 0 && tabs.activeTab() === 'sandbox' ? contentHeight - 1 : contentHeight },
      renderTabContent(tabs.activeTab(), {
        width,
        height: contentHeight,
        previewOpen: previewOpen(),
      }),
    ),
    // Input area with suggestions above
    Box(
      { flexDirection: 'column' },
      PromptInput({
        width,
        textInputState: textInputState(),
        suggestions: suggestions(),
        selectedSuggestionIndex: selectedSuggestionIndex(),
        isActive: !searchOpen() && !paletteOpen(),
      }),
    ),
  );
}

// =============================================================================
// Entry Point
// =============================================================================

/**
 * Start the shell UI
 */
export async function startShellUI(options: ShellAppProps = {}): Promise<void> {
  const { waitUntilExit } = render(() => ShellApp(options), { autoTabNavigation: false });
  await waitUntilExit();
}

/**
 * Export render function for custom usage
 */
export { render };

/**
 * Re-export state management for external use
 */
export {
  addHistoryItem,
  clearHistory,
  setBaseUrl,
  setIsLoading,
  setPromptValue,
  baseUrl,
  history,
  isLoading,
  recordLatency,
  latencyHistory,
  setLastDnsResult,
  setLastDnsDomain,
  type DnsRecord,
} from './hooks/useShellState.js';

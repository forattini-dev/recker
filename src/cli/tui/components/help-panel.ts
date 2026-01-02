/**
 * HelpPanel - Semantic documentation search with tuiuiu.js components
 *
 * Uses:
 * - SearchInput for search field
 * - SplitPanel for list/preview layout
 * - ScrollList for results navigation
 * - Markdown for doc preview
 */

import {
  Box,
  Text,
  Spinner,
  ScrollList,
  SplitPanel,
  Markdown,
  SearchInput,
  Scroll,
} from 'tuiuiu.js';
import type { VNode } from 'tuiuiu.js';
import { themeColor } from '../shared/theme-helper.js';
import {
  helpQuery,
  helpResults,
  helpLoading,
  helpError,
  helpSelectedIndex,
  setHelpSelectedIndex,
  helpPreviewContent,
  helpDetailMode,
  searchHelp,
  formatScoreStars,
  getHelpExamples,
  clearHelpSearch,
  loadResultPreview,
  getSelectedHelpResult,
  type HelpResult,
} from '../hooks/useHelp.js';

// =============================================================================
// Types
// =============================================================================

export interface HelpPanelProps {
  width: number;
  height: number;
}

// =============================================================================
// Result Item Component
// =============================================================================

interface HelpResultItemProps {
  result: HelpResult;
  isSelected: boolean;
  width: number;
}

function HelpResultItem({ result, isSelected, width }: HelpResultItemProps): VNode {
  const primaryColor = themeColor('primary');
  const accentColor = themeColor('accent');
  const mutedFg = themeColor('mutedForeground');
  const successColor = themeColor('success');
  const bgColor = isSelected ? themeColor('muted') : undefined;

  const marker = isSelected ? '►' : ' ';
  const titleMaxLen = Math.max(10, width - 4);
  const title = result.title.length > titleMaxLen
    ? result.title.slice(0, titleMaxLen - 1) + '…'
    : result.title;

  return Box(
    {
      flexDirection: 'column',
      backgroundColor: bgColor,
      paddingX: 1,
    },
    // Title row
    Box(
      { flexDirection: 'row' },
      Text({ color: isSelected ? primaryColor : mutedFg }, `${marker} `),
      Text({ color: isSelected ? primaryColor : accentColor, bold: isSelected }, title),
    ),
    // Score and source row
    Box(
      { flexDirection: 'row', paddingLeft: 2 },
      Text({ color: successColor, dim: true }, formatScoreStars(result.score)),
      Text({ color: mutedFg, dim: true }, ` (${result.source})`),
    ),
  );
}

// =============================================================================
// Empty State Component
// =============================================================================

function HelpEmptyState({ width }: { width: number }): VNode {
  const primaryColor = themeColor('primary');
  const accentColor = themeColor('accent');
  const mutedFg = themeColor('mutedForeground');
  const examples = getHelpExamples();

  return Box(
    { flexDirection: 'column', paddingX: 2, paddingY: 1 },
    Text({ color: primaryColor, bold: true }, '❓ Documentation Search'),
    Text({ color: mutedFg }, '─'.repeat(Math.min(40, width - 4))),
    Box({ height: 1 }),
    Text({ color: accentColor }, 'Type a question ending with "?" for semantic search'),
    Box({ height: 1 }),
    Text({ color: mutedFg }, 'Examples:'),
    ...examples.map(ex =>
      Text({ color: mutedFg, dim: true }, `  ${ex}`)
    ),
    Box({ height: 1 }),
    Text({ color: mutedFg }, 'Quick help:'),
    Text({ color: mutedFg, dim: true }, '  help              Show all commands'),
    Text({ color: mutedFg, dim: true }, '  help <command>    Show command help'),
    Box({ height: 1 }),
    Text({ color: accentColor, dim: true }, 'Semantic search uses embeddings to find relevant docs'),
  );
}

// =============================================================================
// Loading State Component
// =============================================================================

function HelpLoadingState({ width }: { width: number }): VNode {
  const primaryColor = themeColor('primary');
  const mutedFg = themeColor('mutedForeground');

  return Box(
    { flexDirection: 'column', paddingX: 2, paddingY: 1 },
    Text({ color: primaryColor, bold: true }, '❓ Documentation Search'),
    Text({ color: mutedFg }, '─'.repeat(Math.min(40, width - 4))),
    Box({ height: 1 }),
    Spinner({ style: 'dots', color: primaryColor, text: 'Searching documentation...' }),
  );
}

// =============================================================================
// Error State Component
// =============================================================================

function HelpErrorState({ width, error }: { width: number; error: string }): VNode {
  const primaryColor = themeColor('primary');
  const errorColor = themeColor('error');
  const mutedFg = themeColor('mutedForeground');

  return Box(
    { flexDirection: 'column', paddingX: 2, paddingY: 1 },
    Text({ color: primaryColor, bold: true }, '❓ Documentation Search'),
    Text({ color: mutedFg }, '─'.repeat(Math.min(40, width - 4))),
    Box({ height: 1 }),
    Text({ color: errorColor }, `Error: ${error}`),
    Box({ height: 1 }),
    Text({ color: mutedFg, dim: true }, 'Try again with a different query'),
  );
}

// =============================================================================
// Preview Panel Component
// =============================================================================

function PreviewPanel({ width, height }: { width: number; height: number }): VNode {
  const preview = helpPreviewContent();
  const accentColor = themeColor('accent');
  const mutedFg = themeColor('mutedForeground');
  const primaryColor = themeColor('primary');

  if (!preview) {
    return Box(
      { flexDirection: 'column', paddingX: 1 },
      Text({ color: accentColor, bold: true }, 'Preview'),
      Text({ color: mutedFg }, '─'.repeat(Math.min(30, width - 2))),
      Text({ color: mutedFg, dim: true }, 'Select a result to see preview'),
    );
  }

  // Header + scrollable markdown content
  const headerHeight = 2;
  const scrollHeight = Math.max(3, height - headerHeight);

  return Box(
    { flexDirection: 'column', paddingX: 1 },
    // Header
    Text({ color: accentColor, bold: true }, 'Preview'),
    Text({ color: mutedFg }, '─'.repeat(Math.min(30, width - 2))),
    // Scrollable markdown - Markdown auto-fills width
    Scroll(
      {
        height: scrollHeight,
        width: width - 4,
        showScrollbar: true,
        scrollbarColor: primaryColor,
        keysEnabled: false,
      },
      Markdown({ content: preview }),
    ),
  );
}

// =============================================================================
// Full Document View Component (when Ctrl+Enter is pressed)
// =============================================================================

function FullDocView({ width, height }: { width: number; height: number }): VNode {
  const preview = helpPreviewContent();
  const selected = getSelectedHelpResult();
  const primaryColor = themeColor('primary');
  const mutedFg = themeColor('mutedForeground');
  const accentColor = themeColor('accent');

  const headerHeight = 3;
  const footerHeight = 2;
  const scrollHeight = Math.max(5, height - headerHeight - footerHeight);

  const title = selected?.title || 'Document';

  return Box(
    { flexDirection: 'column', height },
    // Header
    Box(
      { flexDirection: 'column', paddingX: 1 },
      Text({ color: primaryColor, bold: true }, `📄 ${title}`),
      Text({ color: mutedFg }, '─'.repeat(Math.min(60, width - 4))),
      selected?.path
        ? Text({ color: accentColor, dim: true }, `Path: ${selected.path}`)
        : null,
    ),
    // Full document with scroll - Markdown auto-fills width
    Box(
      { paddingX: 1, height: scrollHeight },
      Scroll(
        {
          height: scrollHeight,
          width: width - 4,
          showScrollbar: true,
          scrollbarColor: primaryColor,
          keysEnabled: true,
          isActive: true,
        },
        Markdown({ content: preview || 'No content available' }),
      ),
    ),
    // Footer
    Box(
      { paddingX: 1 },
      Text({ color: mutedFg, dim: true }, '  Ctrl+Enter: Back to list │ ↑↓: Scroll'),
    ),
  );
}

// =============================================================================
// Results View Component
// =============================================================================

function HelpResultsView({ width, height }: { width: number; height: number }): VNode {
  const results = helpResults();
  const query = helpQuery();
  const selectedIdx = helpSelectedIndex();
  const primaryColor = themeColor('primary');
  const mutedFg = themeColor('mutedForeground');
  const isDetailMode = helpDetailMode();

  // Show full document view when detail mode is active
  if (isDetailMode) {
    return FullDocView({ width, height });
  }

  // Calculate dimensions
  const headerHeight = 3; // Title + divider + count
  const footerHeight = 2; // Shortcuts + spacing
  const contentHeight = Math.max(5, height - headerHeight - footerHeight);
  const leftPaneWidth = Math.floor(width * 0.4);
  const rightPaneWidth = width - leftPaneWidth - 3; // 3 for divider

  // Handle result selection
  const handleResultSelect = (index: number) => {
    setHelpSelectedIndex(index);
    const result = results[index];
    if (result) {
      loadResultPreview(result);
    }
  };

  return Box(
    { flexDirection: 'column', height },
    // Header
    Box(
      { flexDirection: 'column', paddingX: 1 },
      Text({ color: primaryColor, bold: true }, `❓ Search: "${query}"`),
      Text({ color: mutedFg }, '─'.repeat(Math.min(60, width - 4))),
      Text({ color: mutedFg, dim: true }, `Found ${results.length} results`),
    ),
    // Split view: Results | Preview
    SplitPanel({
      direction: 'horizontal',
      width,
      height: contentHeight,
      ratio: 0.4,
      divider: true,
      dividerStyle: 'line',
      dividerColor: themeColor('muted'),
      left: Box(
        { flexDirection: 'column', width: leftPaneWidth },
        ScrollList({
          items: results,
          children: (result: HelpResult, index: number) =>
            HelpResultItem({
              result,
              isSelected: index === selectedIdx,
              width: leftPaneWidth - 2,
            }),
          height: contentHeight - 1,
          width: leftPaneWidth,
          itemHeight: 2, // Each item is 2 lines
          keysEnabled: true,
          isActive: true,
        }),
      ),
      right: PreviewPanel({
        width: rightPaneWidth,
        height: contentHeight - 1,
      }),
    }),
    // Footer
    Box(
      { paddingX: 1 },
      Text({ color: mutedFg, dim: true }, '  Alt+↑↓: Navigate │ Alt+Enter: Full doc │ Esc: Clear'),
    ),
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function HelpPanel({ width, height }: HelpPanelProps): VNode {
  const loading = helpLoading();
  const error = helpError();
  const results = helpResults();
  const query = helpQuery();

  // Loading state
  if (loading) {
    return HelpLoadingState({ width });
  }

  // Error state
  if (error) {
    return HelpErrorState({ width, error });
  }

  // Results view (when we have results)
  if (results.length > 0) {
    return HelpResultsView({ width, height });
  }

  // Empty state (no query or no results)
  if (!query) {
    return Box(
      { flexDirection: 'column', height },
      // Search input at top
      Box(
        { paddingX: 1, paddingY: 1 },
        SearchInput({
          placeholder: 'Search docs... (end with ? for semantic search)',
          width: Math.min(60, width - 4),
          borderStyle: 'round',
          showSearchIcon: true,
          showClearButton: true,
          isActive: true,
          onSubmit: (value) => {
            if (value.trim()) {
              searchHelp(value);
            }
          },
          onClear: () => {
            clearHelpSearch();
          },
        }),
      ),
      // Empty state content
      HelpEmptyState({ width }),
    );
  }

  // No results found
  return Box(
    { flexDirection: 'column', height },
    Box(
      { paddingX: 1, paddingY: 1 },
      SearchInput({
        placeholder: 'Search docs... (end with ? for semantic search)',
        width: Math.min(60, width - 4),
        borderStyle: 'round',
        showSearchIcon: true,
        showClearButton: true,
        isActive: true,
        onSubmit: (value) => {
          if (value.trim()) {
            searchHelp(value);
          }
        },
        onClear: () => {
          clearHelpSearch();
        },
      }),
    ),
    Box(
      { flexDirection: 'column', paddingX: 2 },
      Text({ color: themeColor('primary'), bold: true }, `❓ Search: "${query}"`),
      Text({ color: themeColor('mutedForeground') }, '─'.repeat(Math.min(40, width - 4))),
      Box({ height: 1 }),
      Text({ color: themeColor('mutedForeground'), dim: true }, 'No results found.'),
      Text({ color: themeColor('mutedForeground'), dim: true }, 'Try a different query or check spelling.'),
    ),
  );
}

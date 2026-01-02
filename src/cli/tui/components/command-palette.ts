/**
 * ShellCommandPalette - Command palette for rek shell
 *
 * Uses tuiuiu's built-in createCommandPalette for fuzzy search,
 * keyboard navigation, and state management.
 */

import {
  Box,
  Text,
  CommandPalette,
  createCommandPalette,
  useInput,
  type CommandItem,
} from 'tuiuiu.js';
import { themeColor } from '../shared/theme-helper.js';
import type { VNode } from 'tuiuiu.js';

// Type for the palette state returned by createCommandPalette
type PaletteState = ReturnType<typeof createCommandPalette>;

// =============================================================================
// Types
// =============================================================================

export interface ShellCommand {
  id: string;
  label: string;
  shortcut?: string;
  category?: string;
  description?: string;
  icon?: string;
  action: () => void;
}

// =============================================================================
// Command Registry
// =============================================================================

/**
 * Create shell commands with actions
 */
export function createShellCommands(handlers: {
  onExit: () => void;
  onClear: () => void;
  onSearch: () => void;
  onHelp: () => void;
  onToggleJobs?: () => void;
  onSetBase?: () => void;
  onDns?: () => void;
  onWhois?: () => void;
}): ShellCommand[] {
  return [
    // Navigation
    {
      id: 'exit',
      label: 'Exit Shell',
      shortcut: 'Ctrl+C',
      category: 'Navigation',
      icon: '🚪',
      description: 'Exit the shell and return to terminal',
      action: handlers.onExit,
    },

    // UI Actions
    {
      id: 'clear',
      label: 'Clear History',
      shortcut: 'Ctrl+L',
      category: 'UI',
      icon: '🧹',
      description: 'Clear command and response history',
      action: handlers.onClear,
    },
    {
      id: 'search',
      label: 'Search History',
      shortcut: 'Ctrl+F',
      category: 'UI',
      icon: '🔍',
      description: 'Search through command history',
      action: handlers.onSearch,
    },
    {
      id: 'jobs',
      label: 'Toggle Jobs Panel',
      shortcut: 'F5',
      category: 'UI',
      icon: '⚡',
      description: 'Show or hide the background jobs panel',
      action: handlers.onToggleJobs ?? (() => {}),
    },

    // Help
    {
      id: 'help',
      label: 'Show Help',
      shortcut: 'F1',
      category: 'Help',
      icon: '📚',
      description: 'Display available commands and shortcuts',
      action: handlers.onHelp,
    },
    {
      id: 'help-commands',
      label: 'List All Commands',
      category: 'Help',
      icon: '📋',
      description: 'Show complete list of available commands',
      action: handlers.onHelp,
    },

    // HTTP Commands
    {
      id: 'http-get',
      label: 'GET Request',
      category: 'HTTP',
      icon: '↓',
      description: 'Make an HTTP GET request',
      action: () => {},
    },
    {
      id: 'http-post',
      label: 'POST Request',
      category: 'HTTP',
      icon: '↑',
      description: 'Make an HTTP POST request with body',
      action: () => {},
    },
    {
      id: 'http-headers',
      label: 'Custom Headers',
      category: 'HTTP',
      icon: '📝',
      description: 'Add custom headers to request',
      action: () => {},
    },

    // Network Tools
    {
      id: 'dns',
      label: 'DNS Lookup',
      category: 'Network',
      icon: '🌐',
      description: 'Resolve DNS records for a domain',
      action: handlers.onDns ?? (() => {}),
    },
    {
      id: 'whois',
      label: 'WHOIS Lookup',
      category: 'Network',
      icon: '🔎',
      description: 'Get WHOIS information for a domain',
      action: handlers.onWhois ?? (() => {}),
    },
    {
      id: 'ping',
      label: 'TCP Ping',
      category: 'Network',
      icon: '📡',
      description: 'Check connectivity to a host:port',
      action: () => {},
    },

    // Jobs
    {
      id: 'watch-start',
      label: 'Start Watch Job',
      category: 'Jobs',
      icon: '👁',
      description: 'Start polling a URL at intervals',
      action: () => {},
    },
    {
      id: 'live-start',
      label: 'Start Live Recording',
      category: 'Jobs',
      icon: '⬇',
      description: 'Record live responses to file',
      action: () => {},
    },
    {
      id: 'crawl-start',
      label: 'Start Crawl Job',
      category: 'Jobs',
      icon: '🕷',
      description: 'Crawl a website for links',
      action: () => {},
    },
  ];
}

// =============================================================================
// Palette State (module-level for persistence across renders)
// =============================================================================

let paletteState: PaletteState | null = null;

/**
 * Get or create palette state
 */
export function getPaletteState(
  commands: ShellCommand[],
  onSelect: (cmd: ShellCommand) => void,
  onClose: () => void
): PaletteState {
  // Convert ShellCommand to CommandItem
  const items: CommandItem[] = commands.map(cmd => ({
    id: cmd.id,
    label: cmd.label,
    description: cmd.description,
    category: cmd.category,
    shortcut: cmd.shortcut,
    icon: cmd.icon,
    action: cmd.action,
  }));

  // Create new state if needed (or if commands changed)
  if (!paletteState) {
    paletteState = createCommandPalette({
      items,
      onSelect: (item) => {
        const cmd = commands.find(c => c.id === item.id);
        if (cmd) {
          onSelect(cmd);
        }
      },
      onClose,
      props: {
        placeholder: 'Type to search commands...',
        showCategories: true,
        showShortcuts: true,
      },
    });
  }

  return paletteState;
}

/**
 * Reset palette state (call when closing)
 */
export function resetPaletteState(): void {
  if (paletteState) {
    paletteState.clear();
  }
}

// =============================================================================
// Component
// =============================================================================

export interface ShellCommandPaletteProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (command: ShellCommand) => void;
  commands: ShellCommand[];
  width?: number;
}

/**
 * ShellCommandPalette - Renders the command palette using built-in CommandPalette
 *
 * Note: This component should only be rendered when visible=true.
 * The parent component should handle the conditional rendering.
 */
export function ShellCommandPalette(props: ShellCommandPaletteProps): VNode {
  const { visible, onClose, onSelect, commands, width } = props;

  // Get or create palette state
  const palette = getPaletteState(commands, onSelect, onClose);

  // Handle keyboard input - only process when visible
  useInput((input, key) => {
    if (!visible) return; // Guard: ignore input when not visible

    if (key.upArrow) {
      palette.selectPrev();
    } else if (key.downArrow) {
      palette.selectNext();
    } else if (key.return) {
      palette.confirm();
    } else if (key.escape) {
      palette.close();
    } else if (key.backspace) {
      palette.backspace();
    } else if (input && !key.ctrl && !key.meta) {
      palette.type(input);
    }
  });

  // Don't render if not visible
  if (!visible) return Box({});

  const termWidth = width ?? process.stdout.columns ?? 80;
  const paletteWidth = Math.min(60, termWidth - 4);

  // Render using built-in CommandPalette component
  return Box(
    { flexDirection: 'column' },
    CommandPalette({
      ...palette.props,
      query: palette.query(),
      filteredItems: palette.filteredItems(),
      selectedIndex: palette.selectedIndex(),
      width: paletteWidth,
      borderStyle: 'round',
      borderColor: themeColor('primary'),
      highlightColor: themeColor('accent'),
      selectedBg: themeColor('primary'),
      title: '⌘ Command Palette',
      showCategories: true,
      showShortcuts: true,
    }),
  );
}

// =============================================================================
// Quick Action Bar (compact alternative for status bar)
// =============================================================================

export interface QuickAction {
  key: string;
  label: string;
  action: () => void;
}

export interface QuickActionBarProps {
  actions: QuickAction[];
  width?: number;
}

/**
 * QuickActionBar - Horizontal bar showing available quick actions
 */
export function QuickActionBar(props: QuickActionBarProps): VNode {
  const { actions, width } = props;

  const actionTexts = actions.map((action, i) => [
    Text({ color: themeColor('accent'), bold: true }, action.key),
    Text({ color: themeColor('mutedForeground') }, ` ${action.label}`),
    i < actions.length - 1 ? Text({ color: themeColor('muted') }, ' │ ') : null,
  ]).flat().filter(Boolean) as VNode[];

  return Box(
    {
      flexDirection: 'row',
      width,
      backgroundColor: themeColor('muted'),
      paddingX: 1,
    },
    ...actionTexts,
  );
}

// =============================================================================
// Legacy exports for compatibility
// =============================================================================

/**
 * Navigate palette selection (legacy - use palette.selectNext/Prev instead)
 */
export function navigatePalette(direction: 'up' | 'down', _maxItems: number): void {
  if (!paletteState) return;
  if (direction === 'up') {
    paletteState.selectPrev();
  } else {
    paletteState.selectNext();
  }
}

/**
 * Get current selection index (legacy)
 */
export function getPaletteSelection(): number {
  return paletteState?.selectedIndex() ?? 0;
}

/**
 * Get current palette query (legacy)
 */
export function getPaletteQuery(): string {
  return paletteState?.query() ?? '';
}

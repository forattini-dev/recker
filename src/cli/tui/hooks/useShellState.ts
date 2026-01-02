/**
 * Shell State Management
 *
 * Global signals for the rek shell state.
 * Following tuiuiu pattern: signals defined at module level for sharing across components.
 */

import { createSignal, batch } from 'tuiuiu.js';
import type { ScrapeDocument } from '../../../scrape/document.js';

// =============================================================================
// Types
// =============================================================================

export interface HistoryItem {
  type: 'request' | 'response' | 'info' | 'error' | 'command' | 'help-query';
  content: any;
  meta?: any;
  timestamp: number;
}

export interface ShellConfig {
  baseUrl: string;
  outputDir: string;
  verbose: boolean;
}

// =============================================================================
// Connection State
// =============================================================================

/** Current base URL for requests */
export const [baseUrl, setBaseUrl] = createSignal('');

/** Output directory for downloads */
export const [outputDir, setOutputDir] = createSignal('');

/** User-defined variables */
export const [variables, setVariables] = createSignal<Record<string, any>>({});

/** Environment variables loaded from .env */
export const [envVars, setEnvVars] = createSignal<Record<string, string>>({});

// =============================================================================
// History State
// =============================================================================

/** Command/response history */
export const [history, setHistory] = createSignal<HistoryItem[]>([]);

/** Last response for $last reference */
export const [lastResponse, setLastResponse] = createSignal<any>(null);

/** Command history for up/down navigation */
export const [commandHistory, setCommandHistory] = createSignal<string[]>([]);

/** Current command history index (-1 = current input) */
export const [historyIndex, setHistoryIndex] = createSignal(-1);

/** Recent URLs for autocomplete suggestions */
export const [recentUrls, setRecentUrls] = createSignal<string[]>([]);

/** Request latency history for sparkline (last 20 requests, in ms) */
export const [latencyHistory, setLatencyHistory] = createSignal<number[]>([]);

/** Last DNS result for table display */
export interface DnsRecord {
  type: string;
  value: string;
  ttl?: number;
  priority?: number;
}
export const [lastDnsResult, setLastDnsResult] = createSignal<DnsRecord[]>([]);
export const [lastDnsDomain, setLastDnsDomain] = createSignal('');

// =============================================================================
// Document State (for scraping)
// =============================================================================

/** Currently loaded document */
export const [currentDoc, setCurrentDoc] = createSignal<ScrapeDocument | null>(null);

/** URL of the current document */
export const [currentDocUrl, setCurrentDocUrl] = createSignal('');

// =============================================================================
// UI State
// =============================================================================

/** Current scroll position in history */
export const [scrollPosition, setScrollPosition] = createSignal(0);

/** Whether search overlay is open */
export const [searchOpen, setSearchOpen] = createSignal(false);

/** Whether command palette is open */
export const [paletteOpen, setPaletteOpen] = createSignal(false);

/** Whether a request is in progress */
export const [isLoading, setIsLoading] = createSignal(false);

/** Current prompt input value */
export const [promptValue, setPromptValue] = createSignal('');

/** Error message to display */
export const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

/** Pending tab switch request (set by executor, consumed by app) */
export const [pendingTabSwitch, setPendingTabSwitch] = createSignal<string | null>(null);

/**
 * Request a tab switch from anywhere in the app.
 * The ShellApp will consume this on next render and switch tabs.
 */
export function requestTabSwitch(tabKey: string): void {
  setPendingTabSwitch(tabKey);
}

// =============================================================================
// Helper Functions
// =============================================================================

// Track last added item to prevent exact duplicates within 100ms
let lastAddedItem: { content: string; timestamp: number } | null = null;

/**
 * Add an item to history
 * Includes deduplication to prevent identical items added in rapid succession
 */
export function addHistoryItem(item: Omit<HistoryItem, 'timestamp'>): void {
  const now = Date.now();
  const contentStr = typeof item.content === 'string'
    ? item.content
    : JSON.stringify(item.content);

  // Prevent duplicate additions within 100ms (same content)
  if (lastAddedItem &&
      lastAddedItem.content === contentStr &&
      now - lastAddedItem.timestamp < 100) {
    return; // Skip duplicate
  }

  lastAddedItem = { content: contentStr, timestamp: now };
  setHistory(prev => [...prev, { ...item, timestamp: now }]);
}

/**
 * Clear all history
 */
export function clearHistory(): void {
  setHistory([]);
  setScrollPosition(0);
}

/**
 * Set a variable
 */
export function setVariable(name: string, value: any): void {
  setVariables(prev => ({ ...prev, [name]: value }));
}

/**
 * Get a variable
 */
export function getVariable(name: string): any {
  return variables()[name];
}

/**
 * Add command to history and save for navigation
 */
export function recordCommand(command: string): void {
  if (command.trim()) {
    setCommandHistory(prev => {
      // Avoid duplicates at the end
      if (prev[prev.length - 1] === command) return prev;
      return [...prev, command];
    });
    setHistoryIndex(-1);

    // Track URLs for autocomplete
    const trimmed = command.trim();
    if (isUrl(trimmed)) {
      addRecentUrl(trimmed);
    }
  }
}

/**
 * Check if a string looks like a URL
 */
function isUrl(str: string): boolean {
  // Starts with http/https or looks like a domain
  if (str.startsWith('http://') || str.startsWith('https://')) return true;
  // Looks like domain.tld/path
  if (/^[a-zA-Z0-9][\w.-]*\.[a-zA-Z]{2,}/.test(str)) return true;
  return false;
}

/**
 * Add a URL to recent URLs list
 */
export function addRecentUrl(url: string): void {
  setRecentUrls(prev => {
    // Remove if already exists (to move to front)
    const filtered = prev.filter(u => u !== url);
    // Add to front, keep max 50
    return [url, ...filtered].slice(0, 50);
  });
}

/**
 * Record a request latency for sparkline visualization
 */
export function recordLatency(ms: number): void {
  setLatencyHistory(prev => {
    // Keep last 20 latencies
    const updated = [...prev, ms];
    return updated.slice(-20);
  });
}

/**
 * Get average latency from history
 */
export function getAverageLatency(): number {
  const history = latencyHistory();
  if (history.length === 0) return 0;
  return Math.round(history.reduce((a, b) => a + b, 0) / history.length);
}

/**
 * Navigate command history (up/down arrows)
 */
export function navigateHistory(direction: 'up' | 'down'): string | null {
  const history = commandHistory();
  const currentIndex = historyIndex();

  if (direction === 'up') {
    const newIndex = currentIndex === -1 ? history.length - 1 : Math.max(0, currentIndex - 1);
    if (history[newIndex]) {
      setHistoryIndex(newIndex);
      return history[newIndex];
    }
  } else {
    const newIndex = currentIndex + 1;
    if (newIndex >= history.length) {
      setHistoryIndex(-1);
      return '';
    }
    setHistoryIndex(newIndex);
    return history[newIndex] || '';
  }
  return null;
}

/**
 * Reset shell state
 */
export function resetShellState(): void {
  batch(() => {
    setBaseUrl('');
    setOutputDir('');
    setVariables({});
    setHistory([]);
    setLastResponse(null);
    setCurrentDoc(null);
    setCurrentDocUrl('');
    setScrollPosition(0);
    setSearchOpen(false);
    setPaletteOpen(false);
    setIsLoading(false);
    setPromptValue('');
    setErrorMessage(null);
  });
}

/**
 * Initialize shell with config
 */
export function initShellState(config: Partial<ShellConfig>): void {
  batch(() => {
    if (config.baseUrl) setBaseUrl(config.baseUrl);
    if (config.outputDir) setOutputDir(config.outputDir);
  });
}

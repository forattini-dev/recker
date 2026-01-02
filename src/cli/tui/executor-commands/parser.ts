/**
 * Parser Utilities for Shell Commands
 *
 * Parsing and detection utilities used by the executor.
 */

import type { CommandResult } from './types.js';
import { addHistoryItem } from '../hooks/useShellState.js';

// =============================================================================
// Help Detection
// =============================================================================

/**
 * Check if argument is a help flag
 */
export function isHelpArg(arg: string | undefined): boolean {
  if (!arg) return false;
  return ['help', '--help', '-h', '-?'].includes(arg.toLowerCase());
}

// =============================================================================
// Line Parsing
// =============================================================================

/**
 * Parse a command line into parts, respecting quotes
 */
export function parseLine(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (!inQuote && (char === '"' || char === "'")) {
      inQuote = true;
      quoteChar = char;
      continue;
    }

    if (inQuote && char === quoteChar) {
      inQuote = false;
      quoteChar = '';
      continue;
    }

    if (!inQuote && char === ' ') {
      if (current) {
        parts.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

// =============================================================================
// URL/Domain Detection
// =============================================================================

/**
 * Check if string looks like a domain name
 */
export function looksLikeDomain(str: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}(\/.*)?$/.test(str);
}

/**
 * Check if string looks like a URL
 */
export function looksLikeUrl(str: string): boolean {
  return (
    str.startsWith('http://') ||
    str.startsWith('https://') ||
    str.startsWith('/') ||
    looksLikeDomain(str)
  );
}

// =============================================================================
// Help Query Detection
// =============================================================================

/**
 * Check if input is a help query (ends with ?)
 * Excludes single-word commands that happen to end with ?
 */
export function isHelpQuery(input: string): boolean {
  if (!input.endsWith('?')) return false;
  const words = input.split(/\s+/);
  return words.length >= 2;
}

/**
 * Execute a help query - search docs and switch to Help tab
 */
export async function executeHelpQuery(input: string): Promise<CommandResult> {
  try {
    // Lazy import to avoid circular dependencies
    const { searchHelp } = await import('../hooks/useHelp.js');
    const { requestTabSwitch } = await import('../hooks/useShellState.js');

    // Clean the query (remove trailing ?)
    const query = input.replace(/\?+$/, '').trim();

    // Add to history
    addHistoryItem({
      type: 'help-query',
      content: input,
    });

    // Perform search
    await searchHelp(query);

    // Request tab switch to Help tab
    requestTabSwitch('help');

    return { success: true };
  } catch (err: any) {
    addHistoryItem({
      type: 'error',
      content: `Help search failed: ${err.message}`,
    });
    return { success: false, error: err.message };
  }
}

// =============================================================================
// Background Command Parsing
// =============================================================================

/**
 * Parse background execution suffix (&)
 */
export function parseBackgroundCommand(input: string): {
  command: string;
  background: boolean;
} {
  const trimmed = input.trim();
  if (trimmed.endsWith('&')) {
    return {
      command: trimmed.slice(0, -1).trim(),
      background: true,
    };
  }
  return { command: trimmed, background: false };
}

// =============================================================================
// Argument Parsing
// =============================================================================

/**
 * Parse numeric argument value from args array
 */
export function parseArgValue(
  args: string[],
  key: string,
  defaultValue: number
): number {
  const idx = args.indexOf(key);
  if (idx >= 0 && args[idx + 1]) {
    const val = parseInt(args[idx + 1], 10);
    return isNaN(val) ? defaultValue : val;
  }
  return defaultValue;
}

/**
 * Parse argument value with multiple possible flags
 */
export function parseArgValueFlag(
  args: string[],
  flags: string[],
  defaultValue: any
): any {
  for (const flag of flags) {
    const idx = args.indexOf(flag);
    if (idx >= 0 && args[idx + 1]) {
      return args[idx + 1];
    }
  }
  return defaultValue;
}

/**
 * Check if any of the flags is present in args
 */
export function hasFlag(args: string[], flags: string[]): boolean {
  return flags.some((flag) => args.includes(flag));
}

/**
 * Get default port for server type
 */
export function getDefaultPort(serverType: string): number {
  switch (serverType) {
    case 'http':
      return 3000;
    case 'ws':
    case 'websocket':
      return 8080;
    case 'sse':
      return 8083;
    case 'hls':
      return 8082;
    case 'dns':
      return 5353;
    case 'whois':
      return 4343;
    case 'ftp':
      return 2121;
    case 'telnet':
      return 2323;
    case 'proxy':
      return 8888;
    default:
      return 3000;
  }
}

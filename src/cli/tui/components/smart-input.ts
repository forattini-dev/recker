/**
 * SmartInput - Enhanced input with inline suggestions
 *
 * Combines TextInput with contextual autocomplete suggestions.
 * Shows suggestions for:
 * - Recent URLs from history
 * - Shell commands (dns, whois, ping, etc.)
 * - Presets (@openai, @github, etc.)
 */

import {
  Box,
  Text,
  Spinner,
  createTextInput,
  renderTextInput,
  createSignal,
  useInput,
} from 'tuiuiu.js';
import { themeColor } from '../shared/theme-helper.js';
import type { VNode } from 'tuiuiu.js';

// =============================================================================
// Types
// =============================================================================

export interface Suggestion {
  value: string;
  label: string;
  category: 'url' | 'command' | 'preset' | 'variable';
  icon?: string;
}

export interface SmartInputProps {
  width: number;
  placeholder?: string;
  isLoading?: boolean;
  recentUrls?: string[];
  onSubmit: (value: string) => void;
  onChange?: (value: string) => void;
}

// =============================================================================
// Built-in Commands and Presets
// =============================================================================

export const SHELL_COMMANDS: Suggestion[] = [
  { value: 'dns ', label: 'dns <domain>', category: 'command', icon: '🌐' },
  { value: 'whois ', label: 'whois <domain>', category: 'command', icon: '🔍' },
  { value: 'rdap ', label: 'rdap <domain>', category: 'command', icon: '📋' },
  { value: 'ping ', label: 'ping <host:port>', category: 'command', icon: '📡' },
  { value: 'tls ', label: 'tls <host>', category: 'command', icon: '🔒' },
  { value: 'ip ', label: 'ip <address>', category: 'command', icon: '🌍' },
  { value: 'seo ', label: 'seo <url>', category: 'command', icon: '📊' },
  { value: 'spider ', label: 'spider <url>', category: 'command', icon: '🕷️' },
  { value: 'live download ', label: 'live download <m3u8>', category: 'command', icon: '⬇️' },
  { value: 'live watch ', label: 'live watch <m3u8>', category: 'command', icon: '👁️' },
  { value: 'base ', label: 'base <url>', category: 'command', icon: '🏠' },
  { value: 'output ', label: 'output <dir>', category: 'command', icon: '📁' },
  { value: 'help', label: 'help - show documentation', category: 'command', icon: '📚' },
  { value: 'clear', label: 'clear - clear history', category: 'command', icon: '🧹' },
  { value: 'jobs', label: 'jobs - list background jobs', category: 'command', icon: '⚡' },
  { value: 'GET ', label: 'GET <url>', category: 'command', icon: '↓' },
  { value: 'POST ', label: 'POST <url> [body]', category: 'command', icon: '↑' },
  { value: 'PUT ', label: 'PUT <url> [body]', category: 'command', icon: '↑' },
  { value: 'DELETE ', label: 'DELETE <url>', category: 'command', icon: '✗' },
  { value: 'HEAD ', label: 'HEAD <url>', category: 'command', icon: '◉' },
];

export const PRESETS: Suggestion[] = [
  { value: '@openai/', label: '@openai - OpenAI API', category: 'preset', icon: '🤖' },
  { value: '@anthropic/', label: '@anthropic - Anthropic API', category: 'preset', icon: '🧠' },
  { value: '@github/', label: '@github - GitHub API', category: 'preset', icon: '🐙' },
  { value: '@gitlab/', label: '@gitlab - GitLab API', category: 'preset', icon: '🦊' },
  { value: '@stripe/', label: '@stripe - Stripe API', category: 'preset', icon: '💳' },
  { value: '@slack/', label: '@slack - Slack API', category: 'preset', icon: '💬' },
  { value: '@discord/', label: '@discord - Discord API', category: 'preset', icon: '🎮' },
  { value: '@cloudflare/', label: '@cloudflare - CF API', category: 'preset', icon: '☁️' },
];

export const VARIABLES: Suggestion[] = [
  { value: '$last', label: '$last - last response body', category: 'variable', icon: '📦' },
  { value: '$headers', label: '$headers - last response headers', category: 'variable', icon: '📋' },
  { value: '$status', label: '$status - last response status', category: 'variable', icon: '🔢' },
];

// =============================================================================
// Suggestion Logic
// =============================================================================

function getSuggestions(input: string, recentUrls: string[] = []): Suggestion[] {
  if (!input || input.length < 1) return [];

  const query = input.toLowerCase().trim();
  const suggestions: Suggestion[] = [];
  const MAX_SUGGESTIONS = 5;

  // Check for variable completion
  if (query.startsWith('$')) {
    const matches = VARIABLES.filter(v =>
      v.value.toLowerCase().startsWith(query)
    );
    suggestions.push(...matches);
  }

  // Check for preset completion
  if (query.startsWith('@')) {
    const matches = PRESETS.filter(p =>
      p.value.toLowerCase().startsWith(query)
    );
    suggestions.push(...matches);
  }

  // Check for command completion
  if (!query.startsWith('http') && !query.startsWith('@') && !query.startsWith('$')) {
    const matches = SHELL_COMMANDS.filter(c =>
      c.value.toLowerCase().startsWith(query) ||
      c.label.toLowerCase().includes(query)
    );
    suggestions.push(...matches.slice(0, 3));
  }

  // Check for URL completion from history
  if (query.length >= 2) {
    const urlMatches = recentUrls
      .filter(url => url.toLowerCase().includes(query))
      .slice(0, 3)
      .map(url => ({
        value: url,
        label: truncateUrl(url, 50),
        category: 'url' as const,
        icon: '🔗',
      }));
    suggestions.push(...urlMatches);
  }

  return suggestions.slice(0, MAX_SUGGESTIONS);
}

function truncateUrl(url: string, maxLen: number): string {
  if (url.length <= maxLen) return url;
  // Keep protocol and domain, truncate path
  try {
    const parsed = new URL(url);
    const base = `${parsed.protocol}//${parsed.host}`;
    if (base.length >= maxLen - 3) {
      return base.slice(0, maxLen - 3) + '...';
    }
    const remaining = maxLen - base.length - 3;
    return base + parsed.pathname.slice(0, remaining) + '...';
  } catch {
    return url.slice(0, maxLen - 3) + '...';
  }
}

function getCategoryColor(category: Suggestion['category']): string {
  switch (category) {
    case 'command': return themeColor('primary');
    case 'preset': return themeColor('accent');
    case 'url': return themeColor('success');
    case 'variable': return themeColor('warning');
    default: return themeColor('foreground');
  }
}

// =============================================================================
// State
// =============================================================================

// Global state for suggestions (allows access from outside component)
const [currentSuggestions, setCurrentSuggestions] = createSignal<Suggestion[]>([]);
const [selectedIndex, setSelectedIndex] = createSignal(0);
const [inputValue, setInputValue] = createSignal('');

export function getInputSuggestions(): Suggestion[] {
  return currentSuggestions();
}

export function getSelectedSuggestion(): Suggestion | null {
  const suggestions = currentSuggestions();
  const idx = selectedIndex();
  return suggestions[idx] ?? null;
}

export function selectNextSuggestion(): void {
  const max = currentSuggestions().length;
  if (max === 0) return;
  setSelectedIndex((selectedIndex() + 1) % max);
}

export function selectPrevSuggestion(): void {
  const max = currentSuggestions().length;
  if (max === 0) return;
  setSelectedIndex((selectedIndex() - 1 + max) % max);
}

export function clearSuggestions(): void {
  setCurrentSuggestions([]);
  setSelectedIndex(0);
}

// =============================================================================
// Components
// =============================================================================

/**
 * SuggestionsPanel - Displays autocomplete suggestions
 */
function SuggestionsPanel(props: { suggestions: Suggestion[]; selectedIndex: number; width: number }): VNode | null {
  const { suggestions, selectedIndex, width } = props;

  if (suggestions.length === 0) return null;

  return Box(
    {
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: themeColor('muted'),
      marginTop: 0,
      marginLeft: 2,
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
      Text({ color: themeColor('mutedForeground'), dim: true }, '↑↓ navigate │ Tab complete │ Esc dismiss'),
    ),
  );
}

/**
 * SmartInput - Input with inline suggestions
 */
export function SmartInput(props: SmartInputProps): VNode {
  const {
    width,
    placeholder = 'Enter URL or command...',
    isLoading = false,
    recentUrls = [],
    onSubmit,
    onChange,
  } = props;

  if (isLoading) {
    return Box(
      { flexDirection: 'row', marginTop: 1, paddingX: 1 },
      Spinner({ style: 'dots', color: themeColor('primary'), text: 'Loading...' }),
    );
  }

  // Create text input state
  const textInputState = createTextInput({
    placeholder,
    multiline: true,
    onChange: (value) => {
      setInputValue(value);
      const suggestions = getSuggestions(value, recentUrls);
      setCurrentSuggestions(suggestions);
      setSelectedIndex(0);
      onChange?.(value);
    },
    onSubmit: (value) => {
      clearSuggestions();
      onSubmit(value);
    },
    onCancel: () => {
      if (currentSuggestions().length > 0) {
        clearSuggestions();
      }
    },
    isActive: true,
  });

  const suggestions = currentSuggestions();
  const selIdx = selectedIndex();

  return Box(
    { flexDirection: 'column', marginTop: 1 },
    renderTextInput(textInputState, {
      placeholder,
      width: width - 2,
    }),
    SuggestionsPanel({ suggestions, selectedIndex: selIdx, width }),
  );
}

/**
 * Create a controlled smart input with external state management
 */
export function createSmartInput(options: {
  recentUrls?: string[];
  onSubmit: (value: string) => void;
  onChange?: (value: string) => void;
}) {
  const textInputState = createTextInput({
    placeholder: 'Enter URL or command...',
    multiline: true,
    onChange: (value) => {
      setInputValue(value);
      const suggestions = getSuggestions(value, options.recentUrls || []);
      setCurrentSuggestions(suggestions);
      setSelectedIndex(0);
      options.onChange?.(value);
    },
    onSubmit: (value) => {
      clearSuggestions();
      options.onSubmit(value);
    },
    onCancel: () => {
      if (currentSuggestions().length > 0) {
        clearSuggestions();
      }
    },
    isActive: true,
  });

  return {
    textInputState,
    getSuggestions: () => currentSuggestions(),
    getSelectedIndex: () => selectedIndex(),
    selectNext: selectNextSuggestion,
    selectPrev: selectPrevSuggestion,
    clear: () => {
      textInputState.clear();
      clearSuggestions();
    },
    applySuggestion: () => {
      const suggestion = getSelectedSuggestion();
      if (suggestion) {
        textInputState.setValue(suggestion.value);
        clearSuggestions();
      }
    },
    hasSuggestions: () => currentSuggestions().length > 0,
  };
}

// =============================================================================
// Exports
// =============================================================================

export {
  getSuggestions,
};

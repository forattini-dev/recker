/**
 * useHelp - Semantic Documentation Search Hook
 *
 * Provides reactive state for searching documentation using the ShellSearch
 * hybrid search engine (fuzzy + semantic via embeddings).
 */

import { createSignal } from 'tuiuiu.js';
import type { SearchResult } from '../../../mcp/search/types.js';

// =============================================================================
// Types
// =============================================================================

export interface HelpResult {
  id: string;
  title: string;
  path: string;
  snippet: string;
  score: number;
  source: 'fuzzy' | 'semantic' | 'hybrid';
}

export interface HelpState {
  query: string;
  results: HelpResult[];
  isLoading: boolean;
  error: string | null;
  selectedIndex: number;
}

// =============================================================================
// State (Signals)
// =============================================================================

// Search query
const [helpQuery, setHelpQuery] = createSignal('');

// Search results
const [helpResults, setHelpResults] = createSignal<HelpResult[]>([]);

// Loading state
const [helpLoading, setHelpLoading] = createSignal(false);

// Error state
const [helpError, setHelpError] = createSignal<string | null>(null);

// Selected result index
const [helpSelectedIndex, setHelpSelectedIndex] = createSignal(0);

// Preview content (for selected result)
const [helpPreviewContent, setHelpPreviewContent] = createSignal<string | null>(null);

// Detail mode (full document view)
const [helpDetailMode, setHelpDetailMode] = createSignal(false);

// Toggle detail mode
function toggleHelpDetail(): void {
  setHelpDetailMode(!helpDetailMode());
}

// Last search timestamp (for debouncing)
let lastSearchTime = 0;

// ShellSearch instance (lazy loaded)
let shellSearch: any = null;

// =============================================================================
// Search Function
// =============================================================================

/**
 * Lazy load ShellSearch to avoid startup cost
 */
async function getShellSearch(): Promise<any> {
  if (shellSearch) {
    return shellSearch;
  }

  try {
    // Dynamic import to avoid loading at startup
    const { ShellSearch } = await import('../shell-search.js');
    shellSearch = new ShellSearch();
    return shellSearch;
  } catch (error) {
    throw new Error(`Failed to load search: ${error}`);
  }
}

/**
 * Perform semantic search on documentation
 */
async function searchHelp(query: string): Promise<void> {
  // Skip empty queries
  if (!query.trim()) {
    setHelpResults([]);
    setHelpQuery('');
    return;
  }

  // Remove trailing ? if present (it's the trigger, not part of the query)
  const cleanQuery = query.replace(/\?+$/, '').trim();

  if (!cleanQuery) {
    setHelpResults([]);
    return;
  }

  // Debounce rapid searches
  const now = Date.now();
  if (now - lastSearchTime < 200) {
    return;
  }
  lastSearchTime = now;

  setHelpQuery(cleanQuery);
  setHelpLoading(true);
  setHelpError(null);
  setHelpSelectedIndex(0);

  try {
    const search = await getShellSearch();

    // Use the search method if available
    if (typeof search.search === 'function') {
      const results = await search.search(cleanQuery, { limit: 10 });

      const mappedResults: HelpResult[] = results.map((r: SearchResult) => ({
        id: r.id,
        title: r.title,
        path: r.path,
        snippet: r.snippet || r.content?.slice(0, 150) || '',
        score: r.score,
        source: r.source || 'hybrid',
      }));

      setHelpResults(mappedResults);

      // Load preview for first result
      if (mappedResults.length > 0) {
        loadResultPreview(mappedResults[0]);
      } else {
        setHelpPreviewContent(null);
      }
    } else {
      // Fallback if search method not available
      setHelpError('Search not available');
      setHelpResults([]);
    }
  } catch (error: any) {
    setHelpError(error.message || 'Search failed');
    setHelpResults([]);
  } finally {
    setHelpLoading(false);
  }
}

/**
 * Find the most relevant section of content based on search query.
 * Reorders content to put the matching section first.
 */
function findRelevantSection(content: string, query: string): string {
  if (!query || !content) return content;

  // Extract search terms (ignore common words)
  const stopWords = new Set(['how', 'to', 'what', 'is', 'the', 'a', 'an', 'do', 'i', 'can', 'como', 'que', 'o', 'eu']);
  const terms = query.toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 2 && !stopWords.has(t));

  if (terms.length === 0) return content;

  // Split content into paragraphs/sections (by double newline or headers)
  const sections = content.split(/\n(?=##?\s)|(\n\n+)/g).filter(s => s && s.trim());

  // Find the section with the best match
  let bestSection = -1;
  let bestScore = 0;

  for (let i = 0; i < sections.length; i++) {
    const sectionLower = sections[i].toLowerCase();
    let score = 0;

    for (const term of terms) {
      if (sectionLower.includes(term)) {
        score += 1;
        // Bonus for term appearing in heading
        if (sections[i].match(/^##?\s/)) {
          score += 0.5;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestSection = i;
    }
  }

  // If we found a matching section and it's not already first, reorder
  if (bestSection > 0 && bestScore > 0) {
    const matchedSection = sections[bestSection];
    const beforeSections = sections.slice(0, bestSection);
    const afterSections = sections.slice(bestSection + 1);

    // Put matched section first, then rest of content
    return [
      matchedSection,
      '',
      '---',
      '',
      ...beforeSections,
      ...afterSections,
    ].join('\n');
  }

  return content;
}

/**
 * Load preview content for a result
 */
async function loadResultPreview(result: HelpResult): Promise<void> {
  try {
    const search = await getShellSearch();
    const query = helpQuery();

    if (typeof search.getDocContent === 'function') {
      const content = await search.getDocContent(result.path);
      if (content) {
        // Reorder content to show relevant section first
        const reordered = findRelevantSection(content, query);
        setHelpPreviewContent(reordered);
      } else {
        setHelpPreviewContent(result.snippet);
      }
    } else {
      // Fallback to snippet
      setHelpPreviewContent(result.snippet);
    }
  } catch {
    setHelpPreviewContent(result.snippet);
  }
}

// =============================================================================
// Navigation Functions
// =============================================================================

/**
 * Select next result
 */
function selectNextHelpResult(): void {
  const results = helpResults();
  if (results.length === 0) return;

  const current = helpSelectedIndex();
  const next = (current + 1) % results.length;
  setHelpSelectedIndex(next);

  // Load preview for new selection
  loadResultPreview(results[next]);
}

/**
 * Select previous result
 */
function selectPrevHelpResult(): void {
  const results = helpResults();
  if (results.length === 0) return;

  const current = helpSelectedIndex();
  const prev = current === 0 ? results.length - 1 : current - 1;
  setHelpSelectedIndex(prev);

  // Load preview for new selection
  loadResultPreview(results[prev]);
}

/**
 * Get the currently selected result
 */
function getSelectedHelpResult(): HelpResult | undefined {
  const results = helpResults();
  const idx = helpSelectedIndex();
  return results[idx];
}

/**
 * Clear search state
 */
function clearHelpSearch(): void {
  setHelpQuery('');
  setHelpResults([]);
  setHelpSelectedIndex(0);
  setHelpPreviewContent(null);
  setHelpError(null);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format score as star rating
 */
function formatScoreStars(score: number): string {
  const stars = Math.round(score * 5);
  return '★'.repeat(stars) + '☆'.repeat(5 - stars);
}

/**
 * Check if query is a help query (ends with ?)
 */
function isHelpQuery(input: string): boolean {
  return input.trim().endsWith('?');
}

/**
 * Get example queries for display
 */
function getHelpExamples(): string[] {
  return [
    'how to configure retry?',
    'what is rate limiting?',
    'how to make authenticated requests?',
    'como usar o spider?',
    'what plugins are available?',
    'how to handle errors?',
  ];
}

// =============================================================================
// Exports
// =============================================================================

export {
  // Signals (reactive state)
  helpQuery,
  setHelpQuery,
  helpResults,
  helpLoading,
  helpError,
  helpSelectedIndex,
  setHelpSelectedIndex,
  helpPreviewContent,
  helpDetailMode,
  toggleHelpDetail,

  // Search function
  searchHelp,

  // Navigation
  selectNextHelpResult,
  selectPrevHelpResult,
  getSelectedHelpResult,
  clearHelpSearch,

  // Helpers
  formatScoreStars,
  isHelpQuery,
  getHelpExamples,
  loadResultPreview,
};

/**
 * Hybrid Search System
 *
 * Provides combined fuzzy and semantic search for MCP documentation.
 *
 * @example
 * ```ts
 * import { HybridSearch, createHybridSearch } from './search';
 *
 * const search = createHybridSearch({ debug: true });
 * await search.initialize(docs);
 *
 * const results = await search.search('retry with exponential backoff', {
 *   limit: 5,
 *   mode: 'hybrid'
 * });
 * ```
 */

export { HybridSearch, createHybridSearch } from './hybrid-search.js';
export {
  cosineSimilarity,
  levenshtein,
  stringSimilarity,
  reciprocalRankFusion,
  combineScores,
} from './math.js';
export type {
  IndexedDoc,
  SearchResult,
  SearchOptions,
  HybridSearchConfig,
  EmbeddingsData,
  EmbeddingEntry,
} from './types.js';

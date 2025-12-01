/**
 * Types for the hybrid search system.
 */

/**
 * A document indexed for search.
 */
export interface IndexedDoc {
  /** Unique identifier */
  id: string;
  /** Relative path to the document */
  path: string;
  /** Document title (extracted from H1 or filename) */
  title: string;
  /** Full document content */
  content: string;
  /** Category (usually first directory in path) */
  category: string;
  /** Extracted keywords for boosted matching */
  keywords: string[];
}

/**
 * A search result with relevance scoring.
 */
export interface SearchResult {
  /** Document identifier */
  id: string;
  /** Relative path */
  path: string;
  /** Document title */
  title: string;
  /** Full content (for get_doc) */
  content: string;
  /** Relevant snippet with query terms highlighted */
  snippet: string;
  /** Relevance score (0-1, higher is better) */
  score: number;
  /** Which search method found this result */
  source: 'fuzzy' | 'semantic' | 'hybrid';
}

/**
 * Pre-computed embeddings data structure.
 * Generated at build time, loaded at runtime.
 */
export interface EmbeddingsData {
  /** Schema version for compatibility checking */
  version: string;
  /** Model used to generate embeddings */
  model: string;
  /** Vector dimensions (e.g., 384 for BGE-small) */
  dimensions: number;
  /** Generated timestamp */
  generatedAt: string;
  /** Document embeddings */
  documents: EmbeddingEntry[];
}

/**
 * A single document's embedding entry.
 */
export interface EmbeddingEntry {
  /** Document identifier (matches IndexedDoc.id) */
  id: string;
  /** Relative path */
  path: string;
  /** Document title */
  title: string;
  /** Category */
  category: string;
  /** Keywords */
  keywords: string[];
  /** The embedding vector */
  vector: number[];
}

/**
 * Search options for the hybrid search.
 */
export interface SearchOptions {
  /** Maximum results to return (default: 10) */
  limit?: number;
  /** Filter by category */
  category?: string;
  /** Search mode (default: 'hybrid') */
  mode?: 'hybrid' | 'fuzzy' | 'semantic';
  /** Minimum score threshold (0-1, default: 0) */
  minScore?: number;
}

/**
 * Configuration for the HybridSearch class.
 */
export interface HybridSearchConfig {
  /** Fuse.js search threshold (0-1, lower = stricter, default: 0.4) */
  fuzzyThreshold?: number;
  /** Weight for fuzzy results in hybrid mode (default: 0.5) */
  fuzzyWeight?: number;
  /** Weight for semantic results in hybrid mode (default: 0.5) */
  semanticWeight?: number;
  /** Enable debug logging */
  debug?: boolean;
}

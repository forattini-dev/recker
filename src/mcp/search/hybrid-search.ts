/**
 * HybridSearch - Combines fuzzy search (Fuse.js) with semantic search (pre-computed embeddings).
 *
 * Architecture:
 * - Fuse.js handles fuzzy text matching (typos, partial matches)
 * - Pre-computed embeddings enable semantic search without runtime model
 * - Reciprocal Rank Fusion combines results from both methods
 * - Lazy loading: embeddings are downloaded from GitHub Releases on first use
 *
 * Dependencies:
 * - Runtime: fuse.js (30KB, 0 deps)
 * - Build-time: fastembed (generates embeddings.json)
 */

import Fuse from 'fuse.js';
import { cosineSimilarity, combineScores, levenshtein } from './math.js';
import { loadEmbeddings, type LoadEmbeddingsOptions } from '../embeddings-loader.js';
import { StateError } from '../../core/errors.js';
import type {
  IndexedDoc,
  SearchResult,
  SearchOptions,
  HybridSearchConfig,
  EmbeddingsData,
  EmbeddingEntry,
} from './types.js';

/**
 * Cached embeddings data (loaded once, reused across searches).
 */
let cachedEmbeddings: EmbeddingsData | null = null;

/**
 * HybridSearch provides combined fuzzy and semantic search capabilities.
 *
 * @example
 * ```ts
 * const search = new HybridSearch();
 * await search.initialize(docs);
 *
 * const results = await search.search('retry with exponential backoff');
 * ```
 */
export class HybridSearch {
  private fuse: Fuse<IndexedDoc> | null = null;
  private docs: IndexedDoc[] = [];
  private vectors: Map<string, number[]> = new Map();
  private embeddingsData: EmbeddingsData | null = null;
  private initialized = false;
  private config: Required<HybridSearchConfig>;

  constructor(config: HybridSearchConfig = {}) {
    this.config = {
      fuzzyThreshold: config.fuzzyThreshold ?? 0.3,  // Strict: only close matches (0 = exact, 1 = match anything)
      fuzzyWeight: config.fuzzyWeight ?? 0.5,
      semanticWeight: config.semanticWeight ?? 0.5,
      debug: config.debug ?? false,
    };
  }

  /**
   * Initialize the search system with documents.
   */
  async initialize(docs: IndexedDoc[]): Promise<void> {
    this.docs = docs;

    // 1. Initialize Fuse.js for fuzzy search
    this.fuse = new Fuse(docs, {
      keys: [
        { name: 'keywords', weight: 10 },  // Keywords get HIGHEST priority (exact domain terms like 'retry')
        { name: 'title', weight: 6 },      // Title matches are very important
        { name: 'section', weight: 4 },    // Section headings matter
        { name: 'path', weight: 2 },       // Path can contain useful info
        { name: 'content', weight: 0.5 },  // Content is a fallback
      ],
      includeScore: true,
      threshold: this.config.fuzzyThreshold,
      ignoreLocation: true,
      useExtendedSearch: true,
      findAllMatches: true,
      minMatchCharLength: 2,
    });

    // 2. Load pre-computed embeddings (if available)
    await this.loadPrecomputedEmbeddings();

    this.initialized = true;
    this.log(`Initialized with ${docs.length} docs, ${this.vectors.size} embeddings`);
  }

  /**
   * Load pre-computed embeddings using lazy loader.
   *
   * The loader will:
   * 1. Check local cache (~/.cache/recker/)
   * 2. Try bundled file (development mode)
   * 3. Download from GitHub Releases (first time)
   */
  private async loadPrecomputedEmbeddings(): Promise<void> {
    try {
      // Use cached data if available
      if (cachedEmbeddings) {
        this.embeddingsData = cachedEmbeddings;
      } else {
        // Load using lazy loader (handles cache, bundled, and download)
        const data = await loadEmbeddings({
          debug: this.config.debug,
        });

        if (data) {
          this.embeddingsData = data;
          cachedEmbeddings = data;
        }
      }

      if (this.embeddingsData) {
        // Populate vectors map for fast lookup (only non-empty vectors)
        for (const entry of this.embeddingsData.documents) {
          if (entry.vector && entry.vector.length > 0) {
            this.vectors.set(entry.id, entry.vector);
          }
        }
        this.log(
          `Loaded ${this.vectors.size} pre-computed embeddings (model: ${this.embeddingsData.model})`
        );
      }
    } catch (error) {
      this.log(`No pre-computed embeddings found: ${error}`);
    }
  }

  /**
   * Perform a hybrid search combining fuzzy and semantic methods.
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { limit = 10, category, mode = 'hybrid', minScore = 0 } = options;

    if (!this.initialized) {
      throw new StateError('HybridSearch not initialized. Call initialize() first.', {
        expectedState: 'initialized',
        actualState: 'not-initialized',
      });
    }

    // Clean query by removing stop words
    const cleanedQuery = this.cleanQuery(query);
    this.log(`Original query: "${query}" → Cleaned: "${cleanedQuery}"`);

    // Use cleaned query if it has content, otherwise fall back to original
    const searchQuery = cleanedQuery.length > 0 ? cleanedQuery : query;

    const results = new Map<string, SearchResult>();

    // Fuzzy search (always available)
    if (mode === 'hybrid' || mode === 'fuzzy') {
      const fuzzyResults = this.fuzzySearch(searchQuery, limit * 2, category);
      for (const result of fuzzyResults) {
        results.set(result.id, result);
      }
      this.log(`Fuzzy search found ${fuzzyResults.length} results`);
    }

    // Semantic search (if embeddings available)
    if ((mode === 'hybrid' || mode === 'semantic') && this.vectors.size > 0) {
      const semanticResults = this.semanticSearch(searchQuery, limit * 2, category);
      for (const result of semanticResults) {
        const existing = results.get(result.id);
        if (existing) {
          // Combine scores using RRF
          existing.score = combineScores(existing.score, result.score);
          existing.source = 'hybrid';
        } else {
          results.set(result.id, result);
        }
      }
      this.log(`Semantic search found ${semanticResults.length} results`);
    }

    // Filter, sort, and limit results
    return Array.from(results.values())
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Fuzzy search using Fuse.js.
   */
  private fuzzySearch(query: string, limit: number, category?: string): SearchResult[] {
    if (!this.fuse) return [];

    let results = this.fuse.search(query, { limit: limit * 2 });

    // Filter by category if specified
    if (category) {
      results = results.filter((r) =>
        r.item.category.toLowerCase().includes(category.toLowerCase())
      );
    }

    const queryTerms = this.tokenize(query);

    // First pass: calculate scores with boosts
    const scored = results.slice(0, limit).map((r) => {
      const fuseScore = r.score || 0; // Fuse: 0 = perfect match
      const baseScore = 1 - fuseScore;
      let boost = 0;

      // Only apply boosts if Fuse found a reasonable match (score < 0.3)
      if (fuseScore < 0.3) {
        const keywords = r.item.keywords || [];
        const titleLower = r.item.title.toLowerCase();

        // Boost for exact keyword match
        for (const term of queryTerms) {
          if (keywords.some(k => k.toLowerCase() === term)) {
            boost += 0.15;
          }
        }

        // Boost for title containing query term
        for (const term of queryTerms) {
          if (titleLower.includes(term)) {
            boost += 0.10;
          }
        }
      } else {
        // Penalize weak fuzzy matches
        boost = -0.3;
      }

      return {
        item: r.item,
        baseScore,
        boost,
        finalScore: baseScore + boost,
      };
    });

    // Sort by final score (with boost) and normalize to 0-1
    scored.sort((a, b) => b.finalScore - a.finalScore);
    const maxScore = scored[0]?.finalScore || 1;

    return scored.map((r) => ({
      id: r.item.id,
      path: r.item.path,
      title: r.item.title,
      content: r.item.content,
      snippet: this.extractSnippet(r.item.content, query),
      score: Math.max(0, Math.min(1, r.finalScore / maxScore)), // Normalize to 0-1
      source: 'fuzzy' as const,
    }));
  }

  /**
   * Semantic search using pre-computed embeddings.
   *
   * Since we don't have a runtime model, we use a term-based approximation:
   * - Match query terms against document titles/keywords
   * - Use pre-computed vectors for documents that match
   * - Find similar documents based on vector similarity
   *
   * For full semantic search, users would need to install the model.
   */
  private semanticSearch(query: string, limit: number, category?: string): SearchResult[] {
    if (!this.embeddingsData || this.vectors.size === 0) {
      return [];
    }

    const queryTerms = this.tokenize(query);
    const scores: Array<{ id: string; score: number }> = [];

    for (const entry of this.embeddingsData.documents) {
      // Skip if category filter doesn't match
      if (category && !entry.category.toLowerCase().includes(category.toLowerCase())) {
        continue;
      }

      // Calculate term-based relevance score
      let termScore = 0;
      const docText = `${entry.title} ${entry.keywords?.join(' ') || ''}`.toLowerCase();
      const docTerms = this.tokenize(docText);

      for (const queryTerm of queryTerms) {
        // Exact match
        if (docTerms.includes(queryTerm)) {
          termScore += 2;
          continue;
        }

        // Fuzzy match using Levenshtein
        for (const docTerm of docTerms) {
          const distance = levenshtein(queryTerm, docTerm);
          const maxLen = Math.max(queryTerm.length, docTerm.length);
          if (distance <= Math.min(2, maxLen * 0.3)) {
            termScore += 1 - distance / maxLen;
            break;
          }
        }
      }

      // Normalize score
      const normalizedScore = Math.min(1, termScore / (queryTerms.length * 2));

      if (normalizedScore > 0.1) {
        scores.push({ id: entry.id, score: normalizedScore });
      }
    }

    // Find similar documents using vector similarity
    // Get top-scoring documents and find others with similar vectors
    const topDocs = scores.sort((a, b) => b.score - a.score).slice(0, 3);

    if (topDocs.length > 0) {
      // Filter to only include non-empty vectors with consistent dimensions
      const topVectors = topDocs
        .map((d) => this.vectors.get(d.id))
        .filter((v): v is number[] => Array.isArray(v) && v.length > 0);

      // Only proceed if we have vectors with matching dimensions
      if (topVectors.length > 0 && topVectors.every((v) => v.length === topVectors[0].length)) {
        // Average the top vectors to create a query-like vector
        const avgVector = this.averageVectors(topVectors);
        const expectedDimensions = avgVector.length;

        // Find similar documents
        for (const entry of this.embeddingsData.documents) {
          if (scores.some((s) => s.id === entry.id)) continue;
          if (category && !entry.category.toLowerCase().includes(category.toLowerCase())) continue;

          const vector = this.vectors.get(entry.id);
          // Skip if vector is missing, empty, or has wrong dimensions
          if (!vector || vector.length === 0 || vector.length !== expectedDimensions) continue;

          const similarity = cosineSimilarity(avgVector, vector);
          if (similarity > 0.7) {
            scores.push({ id: entry.id, score: similarity * 0.5 }); // Discount indirect matches
          }
        }
      }
    }

    // Return top results
    const results: SearchResult[] = [];

    for (const s of scores.sort((a, b) => b.score - a.score).slice(0, limit)) {
      const doc = this.docs.find((d) => d.id === s.id);
      const entry = this.embeddingsData!.documents.find((e) => e.id === s.id);

      if (!doc && !entry) {
        continue;
      }

      const title = doc?.title || entry?.title || 'Unknown';
      const path = doc?.path || entry?.path || '';
      const content = doc?.content || '';

      results.push({
        id: s.id,
        path,
        title,
        content,
        snippet: this.extractSnippet(content, query),
        score: s.score,
        source: 'semantic',
      });
    }

    return results;
  }

  /**
   * Extract a relevant snippet from content.
   */
  private extractSnippet(content: string, query: string): string {
    if (!content) return '';

    const lowerContent = content.toLowerCase();
    const queryTerms = this.tokenize(query);

    // Find best match position
    let bestIndex = -1;
    let bestScore = 0;

    for (const term of queryTerms) {
      const idx = lowerContent.indexOf(term);
      if (idx !== -1) {
        bestIndex = idx;
        bestScore = term.length;
        break;
      }
    }

    // If no exact match, try fuzzy matching
    if (bestIndex === -1) {
      const words = lowerContent.split(/\s+/).slice(0, 500);
      for (let i = 0; i < words.length; i++) {
        for (const term of queryTerms) {
          const dist = levenshtein(words[i].slice(0, 20), term.slice(0, 20));
          if (dist <= 2 && dist < bestScore) {
            bestScore = dist;
            bestIndex = lowerContent.indexOf(words[i]);
          }
        }
      }
    }

    // Extract snippet around best match
    if (bestIndex === -1) {
      return content.slice(0, 200).trim() + (content.length > 200 ? '...' : '');
    }

    const start = Math.max(0, bestIndex - 50);
    const end = Math.min(content.length, bestIndex + 150);
    let snippet = content.slice(start, end).trim();

    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    // Clean up whitespace
    return snippet.replace(/\n+/g, ' ').replace(/\s+/g, ' ');
  }

  /**
   * Stop words to filter out from queries (EN + PT).
   */
  private static STOP_WORDS = new Set([
    // English
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
    'and', 'but', 'or', 'nor', 'for', 'yet', 'so', 'both', 'either', 'neither',
    'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'also',
    'how', 'what', 'when', 'where', 'who', 'which', 'why', 'whom', 'whose',
    'this', 'that', 'these', 'those', 'here', 'there', 'all', 'each', 'every',
    'any', 'some', 'no', 'none', 'one', 'two', 'other', 'another', 'such',
    'to', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'as', 'into', 'through',
    'about', 'above', 'below', 'between', 'under', 'over', 'out', 'up', 'down',
    'if', 'then', 'else', 'because', 'while', 'although', 'though', 'unless',
    'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me', 'you', 'him', 'us', 'them',
    // Portuguese
    'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
    'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com', 'sem', 'sob', 'sobre',
    'e', 'ou', 'mas', 'porem', 'todavia', 'contudo', 'entretanto',
    'que', 'qual', 'quais', 'quanto', 'quem', 'como', 'onde', 'quando', 'porque',
    'eu', 'tu', 'ele', 'ela', 'nos', 'vos', 'eles', 'elas', 'voce', 'voces',
    'meu', 'minha', 'meus', 'minhas', 'seu', 'sua', 'seus', 'suas',
    'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas',
    'isso', 'isto', 'aquilo', 'aquele', 'aquela', 'aqueles', 'aquelas',
    'ser', 'estar', 'ter', 'haver', 'fazer', 'ir', 'vir', 'poder', 'dever',
    'sim', 'nao', 'ja', 'ainda', 'sempre', 'nunca', 'tambem', 'so', 'apenas',
    'muito', 'pouco', 'mais', 'menos', 'bem', 'mal', 'assim', 'entao', 'logo',
    'yo', 'hey', 'oi', 'ola', 'bom', 'boa', 'obrigado', 'por favor',
    // Generic verbs that don't add search value
    'configure', 'configuro', 'configurar', 'configurando', 'configura',
    'use', 'usar', 'using', 'uso', 'usa',
    'create', 'criar', 'creating', 'criando', 'cria', 'crio',
    'setup', 'setar', 'setting', 'setando', 'seta', 'seto',
    'add', 'adicionar', 'adding', 'adicionando', 'adiciona', 'adiciono',
    'get', 'getting', 'pegar', 'pegando', 'pega', 'pego',
    'set', 'setting', 'definir', 'definindo', 'define', 'defino',
    'make', 'making', 'fazer', 'fazendo', 'faz', 'faço', 'faco',
  ]);

  /**
   * Clean query by removing stop words and normalizing.
   */
  private cleanQuery(query: string): string {
    const words = query
      .toLowerCase()
      .split(/[\s\-_.,;:!?()[\]{}'"]+/)
      .filter((w) => w.length > 1 && !HybridSearch.STOP_WORDS.has(w));

    return words.join(' ');
  }

  /**
   * Tokenize text into searchable terms.
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[\s\-_.,;:!?()[\]{}'"]+/)
      .filter((t) => t.length > 2 && !HybridSearch.STOP_WORDS.has(t));
  }

  /**
   * Average multiple vectors.
   */
  private averageVectors(vectors: number[][]): number[] {
    if (vectors.length === 0) return [];
    if (vectors.length === 1) return vectors[0];

    const result = new Array(vectors[0].length).fill(0);
    for (const vec of vectors) {
      for (let i = 0; i < vec.length; i++) {
        result[i] += vec[i];
      }
    }
    for (let i = 0; i < result.length; i++) {
      result[i] /= vectors.length;
    }
    return result;
  }

  /**
   * Check if embeddings are available.
   */
  hasEmbeddings(): boolean {
    return this.vectors.size > 0;
  }

  /**
   * Get statistics about the search index.
   */
  getStats(): {
    documents: number;
    embeddings: number;
    model?: string;
    dimensions?: number;
  } {
    return {
      documents: this.docs.length,
      embeddings: this.vectors.size,
      model: this.embeddingsData?.model,
      dimensions: this.embeddingsData?.dimensions,
    };
  }

  /**
   * Debug logging.
   */
  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[HybridSearch] ${message}`);
    }
  }
}

/**
 * Create a HybridSearch instance with default configuration.
 */
export function createHybridSearch(config?: HybridSearchConfig): HybridSearch {
  return new HybridSearch(config);
}

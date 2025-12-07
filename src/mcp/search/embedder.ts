/**
 * Local Embedder - Generates query embeddings using fastembed
 *
 * Uses the same BGE Small EN v1.5 model that was used to generate
 * the pre-computed document embeddings, ensuring compatibility.
 *
 * Features:
 * - Lazy loading: Model is only loaded on first use
 * - Caching: Model stays in memory for fast subsequent queries
 * - Auto-cleanup: Model is unloaded after idle timeout
 */

// Model configuration - must match the model used for document embeddings
const MODEL_NAME = 'BGESmallENV15';
const MODEL_DIMENSIONS = 384;

// Lazy-loaded embedder instance
let embedderInstance: any = null;
let embedderPromise: Promise<any> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Reset idle timer - called after each embedding operation
 */
function resetIdleTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(() => {
    unloadEmbedder();
  }, IDLE_TIMEOUT_MS);
}

/**
 * Unload the embedder to free memory
 */
export function unloadEmbedder(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  embedderInstance = null;
  embedderPromise = null;
}

/**
 * Get or create the embedder instance (lazy loading)
 */
async function getEmbedder(): Promise<any> {
  // Return existing instance if available
  if (embedderInstance) {
    resetIdleTimer();
    return embedderInstance;
  }

  // Wait for existing initialization if in progress
  if (embedderPromise) {
    return embedderPromise;
  }

  // Initialize new embedder
  embedderPromise = (async () => {
    try {
      // Dynamic import to avoid loading fastembed if not needed
      const { EmbeddingModel, FlagEmbedding } = await import('fastembed');

      // Use BGE Small EN v1.5 to match pre-computed embeddings
      embedderInstance = await FlagEmbedding.init({
        model: EmbeddingModel[MODEL_NAME],
      });

      resetIdleTimer();
      return embedderInstance;
    } catch (error) {
      embedderPromise = null;
      throw new Error(`Failed to initialize embedder: ${error}`);
    }
  })();

  return embedderPromise;
}

/**
 * Generate embedding vector for a text query.
 *
 * @param text - The text to embed
 * @returns Promise<number[]> - The embedding vector (384 dimensions)
 *
 * @example
 * ```ts
 * const vector = await embed('how to configure retry?');
 * console.log(vector.length); // 384
 * ```
 */
export async function embed(text: string): Promise<number[]> {
  const embedder = await getEmbedder();
  const embeddings = await embedder.embed([text]);

  // fastembed returns an async iterable, get the first (and only) result
  for await (const embedding of embeddings) {
    // embedding can be Float32Array directly or wrapped in an array
    const vec = Array.isArray(embedding) ? embedding[0] : embedding;
    // Convert Float32Array to number[]
    return Array.from(vec as Float32Array);
  }

  throw new Error('No embedding generated');
}

/**
 * Generate embedding vectors for multiple texts (batch mode).
 *
 * @param texts - Array of texts to embed
 * @returns Promise<number[][]> - Array of embedding vectors
 *
 * @example
 * ```ts
 * const vectors = await embedBatch(['query 1', 'query 2']);
 * ```
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const embedder = await getEmbedder();
  const embeddings = await embedder.embed(texts);

  const results: number[][] = [];
  for await (const embedding of embeddings) {
    // embedding can be Float32Array directly or wrapped in an array
    const vec = Array.isArray(embedding) ? embedding[0] : embedding;
    results.push(Array.from(vec as Float32Array));
  }

  return results;
}

/**
 * Create an embedder function compatible with HybridSearch.
 *
 * This function signature matches what HybridSearch.setEmbedder() expects.
 * The model parameter is accepted but ignored - we always use BGE Small EN v1.5
 * to ensure compatibility with pre-computed embeddings.
 *
 * @example
 * ```ts
 * import { createEmbedder } from './embedder';
 * import { HybridSearch } from './hybrid-search';
 *
 * const search = new HybridSearch();
 * search.setEmbedder(createEmbedder());
 * ```
 */
export function createEmbedder(): (text: string, model?: string) => Promise<number[]> {
  // Return a wrapper that ignores the model param (we always use BGE Small EN v1.5)
  return (text: string, _model?: string) => embed(text);
}

/**
 * Check if fastembed is available.
 *
 * @returns Promise<boolean> - True if fastembed can be loaded
 */
export async function isFastembedAvailable(): Promise<boolean> {
  try {
    await import('fastembed');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get information about the embedder model.
 */
export function getModelInfo(): { name: string; dimensions: number } {
  return {
    name: MODEL_NAME,
    dimensions: MODEL_DIMENSIONS,
  };
}

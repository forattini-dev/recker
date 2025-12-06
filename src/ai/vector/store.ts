/**
 * Simple In-Memory Vector Store
 *
 * Useful for RAG (Retrieval-Augmented Generation) on small datasets
 * without needing a full database.
 */

import { cosineSimilarity } from './similarity.js';
import type { AIClient } from '../../types/ai.js';

export interface VectorDocument {
  id: string;
  content: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

export interface SearchResult extends VectorDocument {
  score: number; // Similarity score (0-1)
}

export interface VectorStoreOptions {
  /**
   * AI Client instance to use for embedding generation.
   * If provided, you can add() text directly.
   * If not provided, you must provide embeddings manually.
   */
  client?: AIClient;
  
  /**
   * Embedding model to use when generating embeddings.
   */
  model?: string;
}

/**
 * In-Memory Vector Store
 *
 * @example
 * ```typescript
 * const store = new MemoryVectorStore({ client: recker.ai });
 * 
 * // Add documents (embeddings generated automatically)
 * await store.add([
 *   { content: 'Recker is a network SDK', metadata: { type: 'info' } },
 *   { content: 'The sky is blue', metadata: { type: 'fact' } }
 * ]);
 * 
 * // Search
 * const results = await store.search('What is Recker?');
 * console.log(results[0].content);
 * ```
 */
export class MemoryVectorStore {
  private documents: Map<string, VectorDocument> = new Map();
  private client?: AIClient;
  private model?: string;

  constructor(options: VectorStoreOptions = {}) {
    this.client = options.client;
    this.model = options.model;
  }

  /**
   * Add documents to the store.
   * If embeddings are missing and a client is configured, they will be generated.
   */
  async add(docs: Array<Partial<VectorDocument> & { content: string }>): Promise<void> {
    const docsToEmbed: typeof docs = [];
    const readyDocs: VectorDocument[] = [];

    // Separate docs needing embedding
    for (const doc of docs) {
      const id = doc.id || Math.random().toString(36).substring(7);
      const fullDoc: VectorDocument = {
        id,
        content: doc.content,
        metadata: doc.metadata || {},
        embedding: doc.embedding,
      };

      if (!fullDoc.embedding) {
        docsToEmbed.push(fullDoc);
      } else {
        readyDocs.push(fullDoc);
      }
    }

    // Batch embed if needed
    if (docsToEmbed.length > 0) {
      if (!this.client) {
        throw new Error('AI Client required to generate embeddings. Pass "client" to constructor or provide "embedding" in document.');
      }

      // Extract contents
      const contents = docsToEmbed.map(d => d.content);
      const response = await this.client.embed({
        model: this.model,
        input: contents,
      });

      // Assign embeddings
      docsToEmbed.forEach((doc, i) => {
        // @ts-ignore - we know we are filling the missing embedding
        doc.embedding = response.embeddings[i];
        readyDocs.push(doc as VectorDocument);
      });
    }

    // Save to memory
    for (const doc of readyDocs) {
      this.documents.set(doc.id, doc);
    }
  }

  /**
   * Search for similar documents.
   */
  async search(query: string, limit: number = 3, threshold: number = 0.0): Promise<SearchResult[]> {
    if (this.documents.size === 0) return [];

    // Generate query embedding
    if (!this.client) {
       throw new Error('AI Client required to search by text query.');
    }

    const response = await this.client.embed({
      model: this.model,
      input: query,
    });
    const queryEmbedding = response.embeddings[0];

    // Calculate similarities
    const results: SearchResult[] = [];

    for (const doc of this.documents.values()) {
      if (!doc.embedding) continue; // Should not happen if add() works correctly

      const score = cosineSimilarity(queryEmbedding, doc.embedding);
      
      if (score >= threshold) {
        results.push({
          ...doc,
          score,
        });
      }
    }

    // Sort by score descending and take top K
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Delete a document by ID.
   */
  delete(id: string): boolean {
    return this.documents.delete(id);
  }

  /**
   * Clear all documents.
   */
  clear(): void {
    this.documents.clear();
  }

  /**
   * Get count of documents.
   */
  get count(): number {
    return this.documents.size;
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryVectorStore } from '../../../src/ai/vector/store.js';
import { cosineSimilarity } from '../../../src/ai/vector/similarity.js';
import type { AIClient } from '../../../src/types/ai.js';

describe('MemoryVectorStore', () => {
  let store: MemoryVectorStore;
  let mockClient: AIClient;

  beforeEach(() => {
    // Mock AI Client that returns embeddings based on simple logic
    // e.g. 'A' -> [1, 0], 'B' -> [0, 1] for easy orthogonality testing
    mockClient = {
      embed: vi.fn().mockImplementation(async ({ input }) => {
        const inputs = Array.isArray(input) ? input : [input];
        const embeddings = inputs.map((text: string) => {
          if (text.includes('A')) return [1, 0, 0];
          if (text.includes('B')) return [0, 1, 0];
          if (text.includes('C')) return [0, 0, 1];
          return [0.5, 0.5, 0];
        });
        return { embeddings, usage: { totalTokens: 0 } };
      })
    } as any;

    store = new MemoryVectorStore({ client: mockClient });
  });

  it('should add documents and generate embeddings', async () => {
    await store.add([
      { content: 'Document A' },
      { content: 'Document B' }
    ]);

    expect(mockClient.embed).toHaveBeenCalledTimes(1);
    expect(store.count).toBe(2);
  });

  it('should search and return sorted results', async () => {
    await store.add([
      { id: '1', content: 'Document A' }, // [1, 0, 0]
      { id: '2', content: 'Document B' }, // [0, 1, 0]
      { id: '3', content: 'Document C' }  // [0, 0, 1]
    ]);

    // Search for 'A' -> should match Doc A perfectly
    const results = await store.search('Query A');

    expect(results).toHaveLength(3);
    expect(results[0].id).toBe('1');
    expect(results[0].score).toBeCloseTo(1);
    expect(results[1].score).toBeCloseTo(0);
  });

  it('should support manually provided embeddings', async () => {
    const manualStore = new MemoryVectorStore(); // No client needed
    
    await manualStore.add([
      { content: 'Manual 1', embedding: [1, 0] },
      { content: 'Manual 2', embedding: [0, 1] }
    ]);

    // Mock client just for search query generation
    manualStore['client'] = {
        embed: vi.fn().mockResolvedValue({
            embeddings: [[1, 0]], // 2D query vector
            usage: { totalTokens: 0 }
        })
    } as any;

    const results = await manualStore.search('A');
    expect(results[0].content).toBe('Manual 1');
  });

  it('should delete documents', async () => {
    await store.add([{ id: 'del', content: 'To delete' }]);
    expect(store.count).toBe(1);
    
    const deleted = store.delete('del');
    expect(deleted).toBe(true);
    expect(store.count).toBe(0);
  });
});

describe('Cosine Similarity', () => {
  it('should calculate correctly', () => {
    const vecA = [1, 0, 0];
    const vecB = [1, 0, 0];
    const vecC = [0, 1, 0];
    const vecD = [-1, 0, 0];

    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1);
    expect(cosineSimilarity(vecA, vecC)).toBeCloseTo(0);
    expect(cosineSimilarity(vecA, vecD)).toBeCloseTo(-1);
  });

  it('should throw on dimension mismatch', () => {
    expect(() => cosineSimilarity([1], [1, 2])).toThrow();
  });
});

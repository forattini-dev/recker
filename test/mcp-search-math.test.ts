import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  levenshtein,
  stringSimilarity,
  reciprocalRankFusion,
  combineScores,
} from '../src/mcp/search/math.js';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 5);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1, 5);
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 5);
  });

  it('handles scaled vectors correctly', () => {
    // Cosine similarity should be the same regardless of magnitude
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([1, 0], [100, 0])).toBeCloseTo(1, 5);
  });

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('throws on mismatched vector lengths', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow('Vector length mismatch');
  });

  it('handles negative values', () => {
    const a = [1, -1, 0];
    const b = [1, 1, 0];
    // dot = 1*1 + (-1)*1 + 0*0 = 0
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('handles real embedding-like vectors', () => {
    // Simulate 384-dim vectors (BGE-small size)
    const vec1 = Array.from({ length: 384 }, (_, i) => Math.sin(i * 0.1));
    const vec2 = Array.from({ length: 384 }, (_, i) => Math.sin(i * 0.1 + 0.1));
    const vec3 = Array.from({ length: 384 }, (_, i) => Math.cos(i * 0.1));

    // Similar vectors should have high similarity
    expect(cosineSimilarity(vec1, vec2)).toBeGreaterThan(0.9);
    // Different vectors should have lower similarity
    expect(cosineSimilarity(vec1, vec3)).toBeLessThan(0.5);
  });
});

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('a', 'a')).toBe(0);
  });

  it('returns length for empty string comparisons', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('', 'hello')).toBe(5);
  });

  it('handles single character substitution', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
    expect(levenshtein('hello', 'hallo')).toBe(1);
  });

  it('handles single character insertion', () => {
    expect(levenshtein('cat', 'cats')).toBe(1);
    expect(levenshtein('hello', 'helloo')).toBe(1);
  });

  it('handles single character deletion', () => {
    expect(levenshtein('cats', 'cat')).toBe(1);
    expect(levenshtein('hello', 'hell')).toBe(1);
  });

  it('handles classic examples', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('saturday', 'sunday')).toBe(3);
    expect(levenshtein('flaw', 'lawn')).toBe(2);
  });

  it('handles completely different strings', () => {
    expect(levenshtein('abc', 'xyz')).toBe(3);
    expect(levenshtein('aa', 'bb')).toBe(2);
  });

  it('is symmetric', () => {
    expect(levenshtein('abc', 'ab')).toBe(levenshtein('ab', 'abc'));
    expect(levenshtein('kitten', 'sitting')).toBe(levenshtein('sitting', 'kitten'));
  });

  it('handles case sensitivity', () => {
    expect(levenshtein('Hello', 'hello')).toBe(1);
    expect(levenshtein('HELLO', 'hello')).toBe(5);
  });

  it('handles special characters', () => {
    expect(levenshtein('hello!', 'hello?')).toBe(1);
    expect(levenshtein('café', 'cafe')).toBe(1);
  });

  it('handles long strings efficiently', () => {
    const a = 'a'.repeat(100);
    const b = 'b'.repeat(100);
    const start = Date.now();
    const result = levenshtein(a, b);
    const duration = Date.now() - start;

    expect(result).toBe(100);
    expect(duration).toBeLessThan(100); // Should be fast
  });
});

describe('stringSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(stringSimilarity('hello', 'hello')).toBe(1);
    expect(stringSimilarity('', '')).toBe(1);
  });

  it('returns 0 for completely different strings of same length', () => {
    expect(stringSimilarity('abc', 'xyz')).toBe(0);
  });

  it('returns values between 0 and 1', () => {
    const sim = stringSimilarity('hello', 'hallo');
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
    expect(sim).toBeCloseTo(0.8, 2); // 1 edit / 5 chars = 0.2 distance, 0.8 similarity
  });

  it('handles typos gracefully', () => {
    expect(stringSimilarity('retry', 'retyr')).toBeGreaterThan(0.5);
    expect(stringSimilarity('cache', 'cashe')).toBeGreaterThan(0.5);
    expect(stringSimilarity('middleware', 'midleware')).toBeGreaterThan(0.7);
  });
});

describe('reciprocalRankFusion', () => {
  it('gives higher score to better rankings', () => {
    const score1 = reciprocalRankFusion([1]); // Rank 1
    const score2 = reciprocalRankFusion([10]); // Rank 10

    expect(score1).toBeGreaterThan(score2);
  });

  it('combines multiple rankings', () => {
    const singleRank = reciprocalRankFusion([1]);
    const doubleRank = reciprocalRankFusion([1, 1]);

    // Two rank-1 appearances should score higher than one
    expect(doubleRank).toBeGreaterThan(singleRank);
  });

  it('uses k parameter for smoothing', () => {
    const defaultK = reciprocalRankFusion([1]);
    const lowK = reciprocalRankFusion([1], 10);
    const highK = reciprocalRankFusion([1], 100);

    // Lower k gives higher scores
    expect(lowK).toBeGreaterThan(defaultK);
    expect(defaultK).toBeGreaterThan(highK);
  });

  it('handles array of ranks', () => {
    const score = reciprocalRankFusion([1, 5, 10]);
    expect(score).toBeGreaterThan(0);
  });
});

describe('combineScores', () => {
  it('gives higher combined score for higher inputs', () => {
    const highBoth = combineScores(0.9, 0.9);
    const lowBoth = combineScores(0.1, 0.1);
    const mixed = combineScores(0.9, 0.1);

    expect(highBoth).toBeGreaterThan(mixed);
    expect(mixed).toBeGreaterThan(lowBoth);
  });

  it('is symmetric', () => {
    expect(combineScores(0.8, 0.3)).toBeCloseTo(combineScores(0.3, 0.8), 5);
  });

  it('handles edge cases', () => {
    expect(combineScores(0, 0)).toBeGreaterThan(0);
    expect(combineScores(1, 1)).toBeGreaterThan(combineScores(0.5, 0.5));
  });
});

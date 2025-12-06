import { describe, it, expect } from 'vitest';
import { cosineSimilarity, euclideanDistance } from '../../../src/ai/vector/similarity.js';

describe('Vector Similarity', () => {
  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const a = [1, 2, 3];
      const b = [1, 2, 3];
      expect(cosineSimilarity(a, b)).toBeCloseTo(1);
    });

    it('should return -1 for opposite vectors', () => {
      const a = [1, 2, 3];
      const b = [-1, -2, -3];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0];
      const b = [0, 1];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0);
    });

    it('should handle normalized vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0);
    });

    it('should handle scaled vectors', () => {
      const a = [1, 2, 3];
      const b = [2, 4, 6]; // same direction, scaled
      expect(cosineSimilarity(a, b)).toBeCloseTo(1);
    });

    it('should return 0 for zero vectors', () => {
      const a = [0, 0, 0];
      const b = [1, 2, 3];
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('should return 0 when both vectors are zero', () => {
      const a = [0, 0, 0];
      const b = [0, 0, 0];
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('should throw for dimension mismatch', () => {
      const a = [1, 2, 3];
      const b = [1, 2];
      expect(() => cosineSimilarity(a, b)).toThrow('Vector dimension mismatch: 3 vs 2');
    });

    it('should handle negative values', () => {
      const a = [-1, -2, -3];
      const b = [-1, -2, -3];
      expect(cosineSimilarity(a, b)).toBeCloseTo(1);
    });

    it('should handle float values', () => {
      const a = [0.5, 0.5, 0.5];
      const b = [0.5, 0.5, 0.5];
      expect(cosineSimilarity(a, b)).toBeCloseTo(1);
    });

    it('should handle high dimensional vectors', () => {
      const a = new Array(100).fill(1);
      const b = new Array(100).fill(1);
      expect(cosineSimilarity(a, b)).toBeCloseTo(1);
    });
  });

  describe('euclideanDistance', () => {
    it('should return 0 for identical vectors', () => {
      const a = [1, 2, 3];
      const b = [1, 2, 3];
      expect(euclideanDistance(a, b)).toBe(0);
    });

    it('should calculate distance correctly in 1D', () => {
      const a = [0];
      const b = [5];
      expect(euclideanDistance(a, b)).toBe(5);
    });

    it('should calculate distance correctly in 2D', () => {
      const a = [0, 0];
      const b = [3, 4];
      expect(euclideanDistance(a, b)).toBe(5); // 3-4-5 triangle
    });

    it('should calculate distance correctly in 3D', () => {
      const a = [0, 0, 0];
      const b = [1, 2, 2];
      expect(euclideanDistance(a, b)).toBe(3);
    });

    it('should handle negative coordinates', () => {
      const a = [-1, -1];
      const b = [1, 1];
      expect(euclideanDistance(a, b)).toBeCloseTo(2 * Math.sqrt(2));
    });

    it('should be symmetric', () => {
      const a = [1, 2, 3];
      const b = [4, 5, 6];
      expect(euclideanDistance(a, b)).toBe(euclideanDistance(b, a));
    });

    it('should throw for dimension mismatch', () => {
      const a = [1, 2, 3];
      const b = [1, 2];
      expect(() => euclideanDistance(a, b)).toThrow('Vector dimension mismatch: 3 vs 2');
    });

    it('should handle float values', () => {
      const a = [0.5, 0.5];
      const b = [1.5, 1.5];
      expect(euclideanDistance(a, b)).toBeCloseTo(Math.sqrt(2));
    });

    it('should handle high dimensional vectors', () => {
      const a = new Array(100).fill(0);
      const b = new Array(100).fill(1);
      expect(euclideanDistance(a, b)).toBe(10); // sqrt(100)
    });
  });
});

import { describe, it, expect } from 'vitest';
import { sparkline, SparklineBuffer } from '../../src/utils/sparkline.js';

describe('sparkline', () => {
  describe('sparkline()', () => {
    it('returns empty chars for empty data', () => {
      const result = sparkline([], { width: 10 });
      expect(result).toBe('··········');
      expect(result.length).toBe(10);
    });

    it('returns empty string for zero width', () => {
      const result = sparkline([1, 2, 3], { width: 0 });
      expect(result).toBe('');
    });

    it('renders basic sparkline with values', () => {
      const result = sparkline([0, 25, 50, 75, 100], { width: 5 });
      // Should have 5 chars, increasing pattern
      expect(result.length).toBe(5);
      // First char should be lowest, last should be highest
      expect(result[0]).toBe('▁');
      expect(result[4]).toBe('█');
    });

    it('pads with empty chars when data is shorter than width', () => {
      const result = sparkline([50, 100], { width: 5 });
      expect(result.length).toBe(5);
      // First 3 should be padding, last should be max
      expect(result.substring(0, 3)).toBe('···');
      expect(result[4]).toBe('█');
    });

    it('uses last N values when data exceeds width', () => {
      const result = sparkline([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], { width: 5 });
      expect(result.length).toBe(5);
      // Should use last 5 values: 60, 70, 80, 90, 100
    });

    it('uses fixed min/max for scaling', () => {
      const result = sparkline([50], { width: 1, min: 0, max: 100 });
      // 50% should be middle-ish char (▄ or ▅)
      expect(['▄', '▅'].includes(result)).toBe(true);
    });

    it('handles all same values', () => {
      const result = sparkline([50, 50, 50, 50, 50], { width: 5 });
      expect(result.length).toBe(5);
      // All values same, should normalize to max
      expect(result).toBe('█████');
    });

    it('handles negative values', () => {
      const result = sparkline([-50, 0, 50], { width: 3 });
      expect(result.length).toBe(3);
      // -50 = min, 50 = max, 0 = middle-ish
      expect(result[0]).toBe('▁');
      expect(result[2]).toBe('█');
    });

    it('defaults to width of 30', () => {
      const result = sparkline([1, 2, 3]);
      expect(result.length).toBe(30);
    });

    it('handles zero values', () => {
      const result = sparkline([0, 0, 0], { width: 3 });
      expect(result.length).toBe(3);
    });

    it('handles single value', () => {
      const result = sparkline([100], { width: 1 });
      expect(result).toBe('█');
    });

    it('handles large numbers', () => {
      // Need to set min explicitly since default min is 0
      const result = sparkline([1000000, 2000000, 3000000], { width: 3, min: 1000000, max: 3000000 });
      expect(result.length).toBe(3);
      // First should be lowest, last should be highest
      expect(result[0]).toBe('▁');
      expect(result[2]).toBe('█');
    });

    it('handles decimal values', () => {
      const result = sparkline([0.1, 0.5, 0.9], { width: 3 });
      expect(result.length).toBe(3);
    });
  });

  describe('SparklineBuffer', () => {
    it('creates buffer with default capacity', () => {
      const buffer = new SparklineBuffer();
      expect(buffer.getData()).toEqual([]);
    });

    it('creates buffer with custom capacity', () => {
      const buffer = new SparklineBuffer(10);
      expect(buffer.getData()).toEqual([]);
    });

    it('pushes values to buffer', () => {
      const buffer = new SparklineBuffer(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      expect(buffer.getData()).toEqual([1, 2, 3]);
    });

    it('maintains capacity by dropping oldest values', () => {
      const buffer = new SparklineBuffer(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);
      expect(buffer.getData()).toEqual([2, 3, 4]);
    });

    it('renders sparkline from buffer data', () => {
      const buffer = new SparklineBuffer(5);
      buffer.push(0);
      buffer.push(50);
      buffer.push(100);
      const result = buffer.render({ min: 0, max: 100 });
      expect(result.length).toBe(5);
      // Should have padding, then min, then middle-ish, then max
      expect(result.substring(0, 2)).toBe('··');
      expect(result[2]).toBe('▁');
      expect(result[4]).toBe('█');
    });

    it('clears all data', () => {
      const buffer = new SparklineBuffer(5);
      buffer.push(1);
      buffer.push(2);
      buffer.clear();
      expect(buffer.getData()).toEqual([]);
    });

    it('returns latest value', () => {
      const buffer = new SparklineBuffer(5);
      buffer.push(10);
      buffer.push(20);
      buffer.push(30);
      expect(buffer.latest()).toBe(30);
    });

    it('returns undefined for empty buffer', () => {
      const buffer = new SparklineBuffer(5);
      expect(buffer.latest()).toBeUndefined();
    });

    it('calculates average of values', () => {
      const buffer = new SparklineBuffer(5);
      buffer.push(10);
      buffer.push(20);
      buffer.push(30);
      expect(buffer.average()).toBe(20);
    });

    it('returns 0 average for empty buffer', () => {
      const buffer = new SparklineBuffer(5);
      expect(buffer.average()).toBe(0);
    });

    it('passes options to render', () => {
      const buffer = new SparklineBuffer(3);
      buffer.push(50);
      const result = buffer.render({ min: 0, max: 100 });
      // With fixed min/max, 50 should be middle-ish (▄ or ▅)
      expect(result.includes('▄') || result.includes('▅')).toBe(true);
    });
  });
});

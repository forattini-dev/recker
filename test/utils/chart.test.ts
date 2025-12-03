import { describe, it, expect } from 'vitest';
import { plot, plotMultiple } from '../../src/utils/chart.js';

describe('ASCII Chart', () => {
  describe('plot', () => {
    it('should create a simple line chart', () => {
      const data = [1, 2, 3, 4, 5];
      const result = plot(data, { height: 4 });

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.split('\n').length).toBe(5); // height + 1 rows
    });

    it('should handle empty data', () => {
      const result = plot([], { height: 4 });
      expect(result).toBe('');
    });

    it('should handle single value', () => {
      const data = [5];
      const result = plot(data, { height: 4 });

      expect(result).toBeTruthy();
      expect(result.split('\n').length).toBe(5);
    });

    it('should handle flat line (all same values)', () => {
      const data = [3, 3, 3, 3, 3];
      const result = plot(data, { height: 4 });

      expect(result).toBeTruthy();
      expect(result.split('\n').length).toBe(5);
    });

    it('should handle negative values', () => {
      const data = [-5, -3, -1, 0, 2, 4];
      const result = plot(data, { height: 5 });

      expect(result).toBeTruthy();
      expect(result.split('\n').length).toBe(6);
    });

    it('should handle decimal values', () => {
      const data = [1.5, 2.7, 3.2, 2.1, 4.8];
      const result = plot(data, { height: 4 });

      expect(result).toBeTruthy();
    });

    it('should use default height when not specified', () => {
      const data = [1, 2, 3, 4, 5];
      const result = plot(data);

      expect(result).toBeTruthy();
      expect(result.split('\n').length).toBe(11); // default height 10 + 1
    });

    it('should include axis labels', () => {
      const data = [0, 10, 20, 30, 40, 50];
      const result = plot(data, { height: 5 });

      // Should contain axis character
      expect(result).toContain('┤');
    });

    it('should handle NaN values gracefully', () => {
      const data = [1, NaN, 3, 4, 5];
      const result = plot(data, { height: 4 });

      expect(result).toBeTruthy();
    });

    it('should handle Infinity values gracefully', () => {
      const data = [1, Infinity, 3, 4, 5];
      const result = plot(data, { height: 4 });

      expect(result).toBeTruthy();
    });

    it('should return empty string when all values are invalid', () => {
      const data = [NaN, NaN, Infinity, -Infinity];
      const result = plot(data, { height: 4 });

      expect(result).toBe('');
    });

    it('should respect custom min/max options', () => {
      const data = [5, 6, 7, 8, 9];
      const result = plot(data, { height: 4, min: 0, max: 10 });

      expect(result).toBeTruthy();
      expect(result.split('\n').length).toBe(5);
    });

    it('should use custom format function', () => {
      const data = [100, 200, 300];
      const result = plot(data, {
        height: 4,
        format: (v) => `$${v.toFixed(0)}`.padStart(8),
      });

      expect(result).toContain('$');
    });

    it('should handle large datasets', () => {
      const data = Array.from({ length: 100 }, (_, i) => Math.sin(i / 10) * 50 + 50);
      const result = plot(data, { height: 10 });

      expect(result).toBeTruthy();
      expect(result.split('\n').length).toBe(11);
    });

    it('should handle zeros array', () => {
      const data = [0, 0, 0, 0, 0];
      const result = plot(data, { height: 4 });

      expect(result).toBeTruthy();
    });
  });

  describe('plotMultiple', () => {
    it('should plot multiple series', () => {
      const series1 = [1, 2, 3, 4, 5];
      const series2 = [5, 4, 3, 2, 1];
      const result = plotMultiple([series1, series2], { height: 4 });

      expect(result).toBeTruthy();
    });

    it('should handle empty series list', () => {
      const result = plotMultiple([], { height: 4 });
      expect(result).toBe('');
    });

    it('should return empty string when all values in all series are invalid', () => {
      const series1 = [NaN, NaN];
      const series2 = [Infinity, -Infinity];
      const result = plotMultiple([series1, series2], { height: 4 });
      expect(result).toBe('');
    });
  });

  describe('chart visual elements', () => {
    it('should draw connecting lines between points', () => {
      const data = [0, 10, 0, 10, 0]; // zigzag pattern
      const result = plot(data, { height: 5 });

      // Should contain vertical line characters for connections
      expect(result).toMatch(/[│╮╯╭╰]/);
    });

    it('should draw horizontal lines for same values', () => {
      const data = [5, 5, 5, 5, 5];
      const result = plot(data, { height: 4 });

      // Should contain horizontal line characters
      expect(result).toContain('─');
    });
  });
});

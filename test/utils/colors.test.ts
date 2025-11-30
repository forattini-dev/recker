import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import colors, {
  reset,
  bold,
  black,
  red,
  green,
  yellow,
  blue,
  magenta,
  cyan,
  white,
  gray,
} from '../../src/utils/colors.js';

describe('Colors Utility', () => {
  const originalEnv = process.env;
  const originalStdout = process.stdout.isTTY;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Color Functions', () => {
    it('should export all color functions', () => {
      expect(typeof reset).toBe('function');
      expect(typeof bold).toBe('function');
      expect(typeof black).toBe('function');
      expect(typeof red).toBe('function');
      expect(typeof green).toBe('function');
      expect(typeof yellow).toBe('function');
      expect(typeof blue).toBe('function');
      expect(typeof magenta).toBe('function');
      expect(typeof cyan).toBe('function');
      expect(typeof white).toBe('function');
      expect(typeof gray).toBe('function');
    });

    it('should have default export with all colors', () => {
      expect(colors).toBeDefined();
      expect(colors.reset).toBe(reset);
      expect(colors.bold).toBe(bold);
      expect(colors.black).toBe(black);
      expect(colors.red).toBe(red);
      expect(colors.green).toBe(green);
      expect(colors.yellow).toBe(yellow);
      expect(colors.blue).toBe(blue);
      expect(colors.magenta).toBe(magenta);
      expect(colors.cyan).toBe(cyan);
      expect(colors.white).toBe(white);
      expect(colors.gray).toBe(gray);
      expect(colors.grey).toBe(gray); // alias
    });

    it('should return strings from color functions', () => {
      expect(typeof red('test')).toBe('string');
      expect(typeof green('test')).toBe('string');
      expect(typeof bold('test')).toBe('string');
      expect(typeof reset('test')).toBe('string');
    });

    it('should handle numbers', () => {
      expect(typeof red(123)).toBe('string');
      expect(red(123)).toContain('123');
    });

    it('should handle empty strings', () => {
      expect(typeof red('')).toBe('string');
    });

    it('should be nestable', () => {
      const nested = bold(red('nested'));
      expect(typeof nested).toBe('string');
      expect(nested).toContain('nested');
    });
  });

  describe('Color Detection', () => {
    // Note: These tests are informational since color detection
    // happens at module load time and can't be easily re-tested
    it('should return string output regardless of color support', () => {
      const result = red('test');
      expect(typeof result).toBe('string');
      // Either contains ANSI codes or just the text
      expect(result).toContain('test');
    });
  });
});

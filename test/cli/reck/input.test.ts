/**
 * Tests for Reck Input Handling
 *
 * Tests keyboard input parsing and event handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseKeypress, type Key } from '../../../src/cli/reck/hooks.js';

describe('Input Handling', () => {
  describe('parseKeypress', () => {
    describe('Regular characters', () => {
      it('should parse lowercase letters', () => {
        const { input, key } = parseKeypress('a');
        expect(input).toBe('a');
        expect(key.ctrl).toBe(false);
        expect(key.shift).toBe(false);
        expect(key.meta).toBe(false);
      });

      it('should parse uppercase letters', () => {
        const { input, key } = parseKeypress('A');
        // Uppercase letters are normalized to lowercase with shift=true
        expect(input).toBe('a');
        expect(key.shift).toBe(true);
      });

      it('should parse numbers', () => {
        const { input } = parseKeypress('5');
        expect(input).toBe('5');
      });

      it('should parse special characters', () => {
        expect(parseKeypress('!').input).toBe('!');
        expect(parseKeypress('@').input).toBe('@');
        expect(parseKeypress('#').input).toBe('#');
        expect(parseKeypress('$').input).toBe('$');
      });

      it('should parse space', () => {
        const { input, key } = parseKeypress(' ');
        expect(input).toBe(' ');
        expect(key.meta).toBe(false);
      });
    });

    describe('Control keys', () => {
      it('should parse Enter/Return', () => {
        const cr = parseKeypress('\r');
        const nl = parseKeypress('\n');

        expect(cr.key.return).toBe(true);
        expect(nl.key.return).toBe(true);
        expect(cr.input).toBe('');
        expect(nl.input).toBe('');
      });

      it('should parse Tab', () => {
        const { input, key } = parseKeypress('\t');
        expect(key.tab).toBe(true);
        expect(input).toBe('');
      });

      it('should parse Escape', () => {
        const { key } = parseKeypress('\x1b');
        expect(key.escape).toBe(true);
      });

      it('should parse Backspace (\\x7f)', () => {
        const { key } = parseKeypress('\x7f');
        expect(key.backspace).toBe(true);
      });

      it('should parse Backspace (\\b)', () => {
        const { key } = parseKeypress('\b');
        expect(key.backspace).toBe(true);
      });
    });

    describe('Arrow keys', () => {
      it('should parse Up Arrow', () => {
        const { key } = parseKeypress('\x1b[A');
        expect(key.upArrow).toBe(true);
      });

      it('should parse Down Arrow', () => {
        const { key } = parseKeypress('\x1b[B');
        expect(key.downArrow).toBe(true);
      });

      it('should parse Right Arrow', () => {
        const { key } = parseKeypress('\x1b[C');
        expect(key.rightArrow).toBe(true);
      });

      it('should parse Left Arrow', () => {
        const { key } = parseKeypress('\x1b[D');
        expect(key.leftArrow).toBe(true);
      });

      it('should parse Up Arrow (alternative format)', () => {
        const { key } = parseKeypress('\x1bOA');
        expect(key.upArrow).toBe(true);
      });
    });

    describe('Navigation keys', () => {
      it('should parse Home', () => {
        const { key } = parseKeypress('\x1b[H');
        expect(key.home).toBe(true);
      });

      it('should parse Home (alternative)', () => {
        const { key } = parseKeypress('\x1b[1~');
        expect(key.home).toBe(true);
      });

      it('should parse End', () => {
        const { key } = parseKeypress('\x1b[F');
        expect(key.end).toBe(true);
      });

      it('should parse End (alternative)', () => {
        const { key } = parseKeypress('\x1b[4~');
        expect(key.end).toBe(true);
      });

      it('should parse Page Up', () => {
        const { key } = parseKeypress('\x1b[5~');
        expect(key.pageUp).toBe(true);
      });

      it('should parse Page Down', () => {
        const { key } = parseKeypress('\x1b[6~');
        expect(key.pageDown).toBe(true);
      });

      it('should parse Insert', () => {
        const { key } = parseKeypress('\x1b[2~');
        expect(key.insert).toBe(true);
      });

      it('should parse Delete', () => {
        const { key } = parseKeypress('\x1b[3~');
        expect(key.delete).toBe(true);
      });
    });

    describe('Function keys', () => {
      it('should parse F1', () => {
        const { key } = parseKeypress('\x1bOP');
        expect(key.f1).toBe(true);
      });

      it('should parse F1 (alternative)', () => {
        const { key } = parseKeypress('\x1b[11~');
        expect(key.f1).toBe(true);
      });

      it('should parse F2', () => {
        const { key } = parseKeypress('\x1bOQ');
        expect(key.f2).toBe(true);
      });

      it('should parse F3', () => {
        const { key } = parseKeypress('\x1bOR');
        expect(key.f3).toBe(true);
      });

      it('should parse F4', () => {
        const { key } = parseKeypress('\x1bOS');
        expect(key.f4).toBe(true);
      });

      it('should parse F5', () => {
        const { key } = parseKeypress('\x1b[15~');
        expect(key.f5).toBe(true);
      });

      it('should parse F6', () => {
        const { key } = parseKeypress('\x1b[17~');
        expect(key.f6).toBe(true);
      });

      it('should parse F7', () => {
        const { key } = parseKeypress('\x1b[18~');
        expect(key.f7).toBe(true);
      });

      it('should parse F8', () => {
        const { key } = parseKeypress('\x1b[19~');
        expect(key.f8).toBe(true);
      });

      it('should parse F9', () => {
        const { key } = parseKeypress('\x1b[20~');
        expect(key.f9).toBe(true);
      });

      it('should parse F10', () => {
        const { key } = parseKeypress('\x1b[21~');
        expect(key.f10).toBe(true);
      });

      it('should parse F11', () => {
        const { key } = parseKeypress('\x1b[23~');
        expect(key.f11).toBe(true);
      });

      it('should parse F12', () => {
        const { key } = parseKeypress('\x1b[24~');
        expect(key.f12).toBe(true);
      });
    });

    describe('Modifier combinations', () => {
      it('should parse Ctrl+C', () => {
        const { input, key } = parseKeypress('\x03');
        expect(key.ctrl).toBe(true);
        expect(input).toBe('c');
      });

      it('should parse Ctrl+A', () => {
        const { input, key } = parseKeypress('\x01');
        expect(key.ctrl).toBe(true);
        expect(input).toBe('a');
      });

      it('should parse Ctrl+Z', () => {
        const { input, key } = parseKeypress('\x1a');
        expect(key.ctrl).toBe(true);
        expect(input).toBe('z');
      });

      it('should parse Ctrl+L', () => {
        const { input, key } = parseKeypress('\x0c');
        expect(key.ctrl).toBe(true);
        expect(input).toBe('l');
      });

      it('should parse Meta+letter', () => {
        const { input, key } = parseKeypress('\x1ba');
        expect(key.meta).toBe(true);
        expect(input).toBe('a');
      });

      it('should parse Shift+Tab', () => {
        const { key } = parseKeypress('\x1b[Z');
        expect(key.tab).toBe(true);
        expect(key.shift).toBe(true);
      });

      it('should parse Meta+Backspace', () => {
        const { key } = parseKeypress('\x1b\x7f');
        expect(key.backspace).toBe(true);
        expect(key.meta).toBe(true);
      });

      it('should parse Meta+Space', () => {
        const { input, key } = parseKeypress('\x1b ');
        expect(key.meta).toBe(true);
        expect(input).toBe(' ');
      });
    });

    describe('Multi-character input (paste)', () => {
      it('should handle pasted text', () => {
        const { input } = parseKeypress('hello world');
        expect(input).toBe('hello world');
      });

      it('should not treat multi-char as escape sequence', () => {
        const { input, key } = parseKeypress('abc');
        expect(input).toBe('abc');
        expect(key.escape).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('should handle empty input', () => {
        const { input, key } = parseKeypress('');
        expect(input).toBe('');
      });

      it('should handle Buffer input', () => {
        const { input } = parseKeypress(Buffer.from('test'));
        expect(input).toBe('test');
      });

      it('should handle high-bit meta prefix', () => {
        // Character with code > 127 and single byte
        const buf = Buffer.from([0x80 + 'a'.charCodeAt(0)]);
        const result = parseKeypress(buf);
        // Should be interpreted as meta + character
        expect(result.key.meta).toBe(true);
      });

      it('should handle unknown escape sequences gracefully', () => {
        const { input, key } = parseKeypress('\x1b[99~');
        // Should not throw and should return something
        expect(key).toBeDefined();
      });
    });
  });

  describe('Key object properties', () => {
    it('should have all expected properties', () => {
      const { key } = parseKeypress('a');

      // Verify all properties exist
      expect(typeof key.upArrow).toBe('boolean');
      expect(typeof key.downArrow).toBe('boolean');
      expect(typeof key.leftArrow).toBe('boolean');
      expect(typeof key.rightArrow).toBe('boolean');
      expect(typeof key.pageUp).toBe('boolean');
      expect(typeof key.pageDown).toBe('boolean');
      expect(typeof key.home).toBe('boolean');
      expect(typeof key.end).toBe('boolean');
      expect(typeof key.insert).toBe('boolean');
      expect(typeof key.return).toBe('boolean');
      expect(typeof key.escape).toBe('boolean');
      expect(typeof key.tab).toBe('boolean');
      expect(typeof key.backspace).toBe('boolean');
      expect(typeof key.delete).toBe('boolean');
      expect(typeof key.clear).toBe('boolean');
      expect(typeof key.ctrl).toBe('boolean');
      expect(typeof key.shift).toBe('boolean');
      expect(typeof key.meta).toBe('boolean');
      expect(typeof key.option).toBe('boolean');
      expect(typeof key.f1).toBe('boolean');
      expect(typeof key.f12).toBe('boolean');
    });

    it('should default all special keys to false for regular input', () => {
      const { key } = parseKeypress('x');

      expect(key.upArrow).toBe(false);
      expect(key.downArrow).toBe(false);
      expect(key.leftArrow).toBe(false);
      expect(key.rightArrow).toBe(false);
      expect(key.return).toBe(false);
      expect(key.escape).toBe(false);
      expect(key.tab).toBe(false);
      expect(key.backspace).toBe(false);
      expect(key.ctrl).toBe(false);
      expect(key.shift).toBe(false);
      expect(key.meta).toBe(false);
    });
  });
});

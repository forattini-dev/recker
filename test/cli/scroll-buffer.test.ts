/**
 * Tests for the scroll buffer component.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ScrollBuffer,
  parseScrollKey,
  parseMouseScroll,
} from '../../src/cli/tui/scroll-buffer.js';

describe('ScrollBuffer', () => {
  let buffer: ScrollBuffer;

  beforeEach(() => {
    buffer = new ScrollBuffer({ maxLines: 100, viewportHeight: 10 });
  });

  describe('write', () => {
    it('should add lines to the buffer', () => {
      buffer.write('line 1\n');
      buffer.write('line 2\n');

      expect(buffer.lineCount).toBe(2);
    });

    it('should handle multiple lines in single write', () => {
      buffer.write('line 1\nline 2\nline 3\n');

      expect(buffer.lineCount).toBe(3);
    });

    it('should handle partial lines', () => {
      buffer.write('partial');
      buffer.write(' line\n');
      buffer.flush();

      expect(buffer.lineCount).toBe(1);
      expect(buffer.getVisibleLines()).toContain('partial line');
    });

    it('should trim buffer when exceeding maxLines', () => {
      for (let i = 0; i < 150; i++) {
        buffer.write(`line ${i}\n`);
      }

      expect(buffer.lineCount).toBe(100);
    });
  });

  describe('scrolling', () => {
    beforeEach(() => {
      // Add 50 lines
      for (let i = 0; i < 50; i++) {
        buffer.write(`line ${i}\n`);
      }
    });

    it('should scroll up', () => {
      expect(buffer.position).toBe(0);

      buffer.scrollUp(5);
      expect(buffer.position).toBe(5);
      expect(buffer.isScrolledUp).toBe(true);
    });

    it('should scroll down', () => {
      buffer.scrollUp(10);
      expect(buffer.position).toBe(10);

      buffer.scrollDown(5);
      expect(buffer.position).toBe(5);
    });

    it('should not scroll past top', () => {
      const maxScroll = 50 - 10; // 50 lines - 10 viewport = 40 max
      buffer.scrollUp(100);

      expect(buffer.position).toBe(maxScroll);
    });

    it('should not scroll past bottom', () => {
      buffer.scrollUp(10);
      buffer.scrollDown(100);

      expect(buffer.position).toBe(0);
      expect(buffer.isScrolledUp).toBe(false);
    });

    it('should page up', () => {
      buffer.pageUp();

      // Page up scrolls viewport - 1 lines
      expect(buffer.position).toBe(9);
    });

    it('should page down', () => {
      buffer.scrollUp(20);
      buffer.pageDown();

      expect(buffer.position).toBe(11);
    });

    it('should scroll to top', () => {
      buffer.scrollToTop();

      expect(buffer.position).toBe(40); // 50 - 10 = 40
    });

    it('should scroll to bottom', () => {
      buffer.scrollToTop();
      buffer.scrollToBottom();

      expect(buffer.position).toBe(0);
      expect(buffer.isScrolledUp).toBe(false);
    });
  });

  describe('getVisibleLines', () => {
    beforeEach(() => {
      for (let i = 0; i < 30; i++) {
        buffer.write(`line ${i}\n`);
      }
    });

    it('should return viewport lines from bottom', () => {
      const lines = buffer.getVisibleLines();

      expect(lines.length).toBe(10);
      expect(lines[0]).toBe('line 20');
      expect(lines[9]).toBe('line 29');
    });

    it('should return scrolled viewport lines', () => {
      buffer.scrollUp(10);
      const lines = buffer.getVisibleLines();

      expect(lines.length).toBe(10);
      expect(lines[0]).toBe('line 10');
      expect(lines[9]).toBe('line 19');
    });
  });

  describe('getScrollInfo', () => {
    it('should return correct scroll info', () => {
      for (let i = 0; i < 100; i++) {
        buffer.write(`line ${i}\n`);
      }

      buffer.scrollUp(50);
      const info = buffer.getScrollInfo();

      expect(info.total).toBe(100);
      expect(info.current).toBe(50);
      expect(info.percent).toBe(50);
    });
  });

  describe('scroll mode', () => {
    it('should track scroll mode state', () => {
      expect(buffer.inScrollMode).toBe(false);

      buffer.enterScrollMode();
      expect(buffer.inScrollMode).toBe(true);

      buffer.exitScrollMode();
      expect(buffer.inScrollMode).toBe(false);
    });

    it('should reset scroll position on exit', () => {
      for (let i = 0; i < 30; i++) {
        buffer.write(`line ${i}\n`);
      }

      buffer.enterScrollMode();
      buffer.scrollUp(10);
      expect(buffer.position).toBe(10);

      buffer.exitScrollMode();
      expect(buffer.position).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear the buffer', () => {
      buffer.write('line 1\nline 2\n');
      expect(buffer.lineCount).toBe(2);

      buffer.clear();
      expect(buffer.lineCount).toBe(0);
      expect(buffer.position).toBe(0);
    });
  });

  describe('updateViewport', () => {
    it('should update viewport height', () => {
      buffer.updateViewport(20);

      // Add enough lines to test new viewport
      for (let i = 0; i < 30; i++) {
        buffer.write(`line ${i}\n`);
      }

      const lines = buffer.getVisibleLines();
      expect(lines.length).toBe(20);
    });
  });
});

describe('parseScrollKey', () => {
  it('should detect Page Up', () => {
    expect(parseScrollKey(Buffer.from('\x1b[5~'))).toBe('pageUp');
    expect(parseScrollKey(Buffer.from('\x1bOy'))).toBe('pageUp');
  });

  it('should detect Page Down', () => {
    expect(parseScrollKey(Buffer.from('\x1b[6~'))).toBe('pageDown');
    expect(parseScrollKey(Buffer.from('\x1bOs'))).toBe('pageDown');
  });

  it('should detect Shift+Up', () => {
    expect(parseScrollKey(Buffer.from('\x1b[1;2A'))).toBe('scrollUp');
  });

  it('should detect Shift+Down', () => {
    expect(parseScrollKey(Buffer.from('\x1b[1;2B'))).toBe('scrollDown');
  });

  it('should detect Home', () => {
    expect(parseScrollKey(Buffer.from('\x1b[1~'))).toBe('home');
    expect(parseScrollKey(Buffer.from('\x1bOH'))).toBe('home');
  });

  it('should detect End', () => {
    expect(parseScrollKey(Buffer.from('\x1b[4~'))).toBe('end');
    expect(parseScrollKey(Buffer.from('\x1bOF'))).toBe('end');
  });

  it('should detect Escape', () => {
    expect(parseScrollKey(Buffer.from('\x1b'))).toBe('escape');
    expect(parseScrollKey(Buffer.from('\x1b\x1b'))).toBe('escape');
  });

  it('should return null for unknown keys', () => {
    expect(parseScrollKey(Buffer.from('a'))).toBeNull();
    expect(parseScrollKey(Buffer.from('\x1b[A'))).toBeNull(); // Regular up arrow
  });
});

describe('parseMouseScroll', () => {
  it('should detect SGR wheel up', () => {
    // SGR extended mode: \x1b[<64;10;20M
    expect(parseMouseScroll(Buffer.from('\x1b[<64;10;20M'))).toBe('scrollUp');
  });

  it('should detect SGR wheel down', () => {
    // SGR extended mode: \x1b[<65;10;20M
    expect(parseMouseScroll(Buffer.from('\x1b[<65;10;20M'))).toBe('scrollDown');
  });

  it('should detect normal mode wheel up', () => {
    // Normal mode: \x1b[M followed by button (96=0x60), x, y
    const buf = Buffer.from([0x1b, 0x5b, 0x4d, 0x60, 0x21, 0x21]);
    expect(parseMouseScroll(buf)).toBe('scrollUp');
  });

  it('should detect normal mode wheel down', () => {
    // Normal mode: \x1b[M followed by button (97=0x61), x, y
    const buf = Buffer.from([0x1b, 0x5b, 0x4d, 0x61, 0x21, 0x21]);
    expect(parseMouseScroll(buf)).toBe('scrollDown');
  });

  it('should return null for non-scroll mouse events', () => {
    expect(parseMouseScroll(Buffer.from('\x1b[<0;10;20M'))).toBeNull();
    expect(parseMouseScroll(Buffer.from('hello'))).toBeNull();
  });
});

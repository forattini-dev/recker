/**
 * Tests for Reck Renderer
 *
 * Tests the rendering engine that converts VNodes to terminal output
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString, OutputBuffer } from '../../../src/cli/reck/renderer.js';
import { Box, Text, Spacer, When, Each, Newline } from '../../../src/cli/reck/components.js';

describe('Renderer', () => {
  describe('renderToString', () => {
    it('should render plain text', () => {
      const node = Text({}, 'hello world');
      const output = renderToString(node, 80);
      expect(output).toBe('hello world');
    });

    it('should render empty text', () => {
      const node = Text({}, '');
      const output = renderToString(node, 80);
      expect(output).toBe('');
    });

    it('should render text with ANSI styles', () => {
      const node = Text({ color: 'red', bold: true }, 'error');
      const output = renderToString(node, 80);
      expect(output).toContain('error');
      expect(output).toContain('\x1b['); // Has ANSI codes
      expect(output).toContain('\x1b[0m'); // Has reset
    });

    it('should render box with content', () => {
      const node = Box(
        { flexDirection: 'column' },
        Text({}, 'line 1'),
        Text({}, 'line 2')
      );
      const output = renderToString(node, 80);
      expect(output).toContain('line 1');
      expect(output).toContain('line 2');
    });

    it('should render horizontal layout', () => {
      const node = Box(
        { flexDirection: 'row' },
        Text({}, 'A'),
        Text({}, 'B'),
        Text({}, 'C')
      );
      const output = renderToString(node, 80);
      expect(output).toBe('ABC');
    });

    it('should render with padding', () => {
      const node = Box(
        { padding: 1, width: 10 },
        Text({}, 'hi')
      );
      const output = renderToString(node, 80);
      const lines = output.split('\n');
      // Should have empty line at top due to padding
      expect(lines[0].trim()).toBe('');
      expect(lines[1]).toContain('hi');
    });

    it('should render border correctly', () => {
      const node = Box(
        { borderStyle: 'single', width: 6, height: 3 },
        Text({}, 'AB')
      );
      const output = renderToString(node, 80);
      const lines = output.split('\n');

      // Top border
      expect(lines[0]).toContain('┌');
      expect(lines[0]).toContain('┐');
      // Content with side borders
      expect(lines[1]).toContain('│');
      // Bottom border
      expect(lines[2]).toContain('└');
      expect(lines[2]).toContain('┘');
    });

    it('should render nested boxes', () => {
      const node = Box(
        { flexDirection: 'column' },
        Box(
          { flexDirection: 'row' },
          Text({}, 'A'),
          Text({}, 'B')
        ),
        Box(
          { flexDirection: 'row' },
          Text({}, 'C'),
          Text({}, 'D')
        )
      );
      const output = renderToString(node, 80);
      expect(output).toContain('AB');
      expect(output).toContain('CD');
    });

    it('should handle width constraint', () => {
      const node = Box(
        { width: 5 },
        Text({}, 'hello world')
      );
      const output = renderToString(node, 80);
      // Text should be within width constraint
      const lines = output.split('\n');
      lines.forEach(line => {
        // Account for ANSI codes when checking width
        const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
        expect(stripped.length).toBeLessThanOrEqual(5);
      });
    });

    it('should respect terminal width', () => {
      const node = Text({}, 'A'.repeat(100));
      const output = renderToString(node, 50);
      const lines = output.split('\n');
      lines.forEach(line => {
        const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
        expect(stripped.length).toBeLessThanOrEqual(50);
      });
    });

    it('should render conditional content (When)', () => {
      const trueCase = Box({}, When(true, Text({}, 'visible')));
      const falseCase = Box({}, When(false, Text({}, 'hidden')));

      expect(renderToString(trueCase, 80)).toContain('visible');
      expect(renderToString(falseCase, 80)).not.toContain('hidden');
    });

    it('should render list content (Each)', () => {
      const items = ['one', 'two', 'three'];
      const node = Box(
        { flexDirection: 'column' },
        Each(items, item => Text({}, item))
      );
      const output = renderToString(node, 80);
      expect(output).toContain('one');
      expect(output).toContain('two');
      expect(output).toContain('three');
    });

    it('should handle flexGrow distribution', () => {
      const node = Box(
        { flexDirection: 'row', width: 20 },
        Text({}, 'A'),
        Box({ flexGrow: 1 }),
        Text({}, 'B')
      );
      const output = renderToString(node, 80);
      // Both A and B should be present in output
      expect(output).toContain('A');
      expect(output).toContain('B');
      // A should be before B
      expect(output.indexOf('A')).toBeLessThan(output.indexOf('B'));
    });

    it('should render Spacer correctly', () => {
      const node = Box(
        { flexDirection: 'row', width: 10 },
        Text({}, 'L'),
        Spacer(),
        Text({}, 'R')
      );
      const output = renderToString(node, 80);
      expect(output).toBe('L        R');
    });

    it('should handle multiple newlines', () => {
      const node = Box(
        { flexDirection: 'column' },
        Text({}, 'A'),
        Newline({ count: 2 }),
        Text({}, 'B')
      );
      const output = renderToString(node, 80);
      const lines = output.split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('OutputBuffer', () => {
    let buffer: OutputBuffer;

    beforeEach(() => {
      buffer = new OutputBuffer(40, 10);
    });

    it('should create buffer with dimensions', () => {
      expect(buffer).toBeDefined();
    });

    it('should write text at position', () => {
      buffer.write(0, 0, 'hello');
      const output = buffer.toString();
      expect(output).toContain('hello');
    });

    it('should write at specific coordinates', () => {
      buffer.write(5, 2, 'test');
      const output = buffer.toString();
      const lines = output.split('\n');
      expect(lines[2].indexOf('test')).toBe(5);
    });

    it('should handle ANSI codes in output', () => {
      buffer.write(0, 0, '\x1b[31mred\x1b[0m');
      const output = buffer.toString();
      expect(output).toContain('\x1b[31m');
      expect(output).toContain('red');
    });

    it('should write text at position near edge', () => {
      buffer.write(35, 0, 'test');
      const output = buffer.toString();
      const lines = output.split('\n');
      // Text should be written near the edge
      expect(lines[0]).toContain('test');
    });

    it('should ignore writes outside bounds', () => {
      // Should not throw
      expect(() => buffer.write(-1, 0, 'test')).not.toThrow();
      expect(() => buffer.write(0, -1, 'test')).not.toThrow();
      expect(() => buffer.write(100, 0, 'test')).not.toThrow();
      expect(() => buffer.write(0, 100, 'test')).not.toThrow();
    });

    it('should handle multi-line writes', () => {
      buffer.write(0, 0, 'line1\nline2\nline3');
      const output = buffer.toString();
      expect(output).toContain('line1');
      expect(output).toContain('line2');
      expect(output).toContain('line3');
    });
  });

  describe('Complex Rendering Scenarios', () => {
    it('should render a header-content-footer layout', () => {
      const node = Box(
        { flexDirection: 'column', height: 10, width: 40 },
        Text({ color: 'cyan' }, '=== Header ==='),
        Box({ flexGrow: 1 }, Text({}, 'Content')),
        Text({ color: 'gray' }, '=== Footer ===')
      );
      const output = renderToString(node, 80);
      expect(output).toContain('Header');
      expect(output).toContain('Content');
      expect(output).toContain('Footer');
    });

    it('should render a sidebar layout', () => {
      const node = Box(
        { flexDirection: 'row', width: 40 },
        Box(
          { width: 10, borderStyle: 'single' },
          Text({}, 'Sidebar')
        ),
        Box(
          { flexGrow: 1 },
          Text({}, 'Main content')
        )
      );
      const output = renderToString(node, 80);
      expect(output).toContain('Sidebar');
      expect(output).toContain('Main content');
    });

    it('should render status line with multiple sections', () => {
      const node = Box(
        { flexDirection: 'row', width: 40 },
        Text({ color: 'green' }, '[OK]'),
        Spacer(),
        Text({}, 'Status: Running'),
        Spacer(),
        Text({ color: 'blue' }, '12:34')
      );
      const output = renderToString(node, 80);
      expect(output).toContain('[OK]');
      expect(output).toContain('Status: Running');
      expect(output).toContain('12:34');
    });

    it('should render a form-like layout', () => {
      const node = Box(
        { flexDirection: 'column', padding: 1, borderStyle: 'round' },
        Box(
          { flexDirection: 'row' },
          Text({ bold: true }, 'Name:  '),
          Text({}, 'John Doe')
        ),
        Box(
          { flexDirection: 'row' },
          Text({ bold: true }, 'Email: '),
          Text({}, 'john@example.com')
        )
      );
      const output = renderToString(node, 80);
      expect(output).toContain('Name:');
      expect(output).toContain('John Doe');
      expect(output).toContain('Email:');
      expect(output).toContain('john@example.com');
    });

    it('should handle deeply nested structures', () => {
      const node = Box(
        { flexDirection: 'column' },
        Box(
          { flexDirection: 'row' },
          Box(
            { flexDirection: 'column' },
            Box(
              { flexDirection: 'row' },
              Text({}, 'Deep')
            )
          )
        )
      );
      const output = renderToString(node, 80);
      expect(output).toContain('Deep');
    });

    it('should preserve output stability across re-renders', () => {
      const node = Box(
        { flexDirection: 'column', width: 20 },
        Text({}, 'line 1'),
        Text({}, 'line 2')
      );

      const output1 = renderToString(node, 80);
      const output2 = renderToString(node, 80);

      expect(output1).toBe(output2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty box', () => {
      const node = Box({});
      const output = renderToString(node, 80);
      expect(output).toBe('');
    });

    it('should handle box with only whitespace', () => {
      const node = Box({}, Text({}, '   '));
      const output = renderToString(node, 80);
      // Whitespace-only text may be trimmed or preserved depending on implementation
      expect(output.length).toBeLessThanOrEqual(3);
    });

    it('should handle special characters', () => {
      const node = Text({}, '→ ← ↑ ↓ • ★ ✓ ✗');
      const output = renderToString(node, 80);
      expect(output).toContain('→');
      expect(output).toContain('★');
    });

    it('should handle emoji', () => {
      const node = Text({}, '🚀 🎉 ✨');
      const output = renderToString(node, 80);
      expect(output).toContain('🚀');
    });

    it('should handle very long single line', () => {
      const longText = 'A'.repeat(200);
      const node = Text({}, longText);
      const output = renderToString(node, 50);
      // Should wrap or truncate
      expect(output.length).toBeLessThan(longText.length + 50); // Allow for newlines
    });

    it('should handle null-ish children', () => {
      const node = Box(
        {},
        Text({}, 'before'),
        null as any,
        undefined as any,
        Text({}, 'after')
      );
      // Should not throw
      expect(() => renderToString(node, 80)).not.toThrow();
    });
  });
});

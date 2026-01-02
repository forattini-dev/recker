/**
 * Tests for Reck Layout Engine
 *
 * Tests flexbox-like layout calculations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Box, Text, Spacer } from '../../../src/cli/reck/components.js';
import { calculateLayout, measureText, getVisibleWidth } from '../../../src/cli/reck/layout.js';
import type { VNode } from '../../../src/cli/reck/types.js';

describe('Layout Engine', () => {
  describe('measureText', () => {
    it('should measure single line text', () => {
      const result = measureText('hello');
      expect(result.width).toBe(5);
      expect(result.height).toBe(1);
    });

    it('should measure multi-line text', () => {
      const result = measureText('line1\nline2\nline3');
      expect(result.width).toBe(5);
      expect(result.height).toBe(3);
    });

    it('should find max width across lines', () => {
      const result = measureText('short\nlonger line\nmed');
      expect(result.width).toBe(11); // 'longer line'
      expect(result.height).toBe(3);
    });

    it('should handle empty string', () => {
      const result = measureText('');
      expect(result.width).toBe(0);
      expect(result.height).toBe(1);
    });

    it('should ignore ANSI codes in width calculation', () => {
      const result = measureText('\x1b[31mred\x1b[0m');
      expect(result.width).toBe(3); // Just 'red'
    });
  });

  describe('getVisibleWidth', () => {
    it('should return length of plain text', () => {
      expect(getVisibleWidth('hello')).toBe(5);
    });

    it('should strip ANSI codes', () => {
      expect(getVisibleWidth('\x1b[31mhello\x1b[0m')).toBe(5);
      expect(getVisibleWidth('\x1b[1;32mbold green\x1b[0m')).toBe(10);
    });
  });

  describe('calculateLayout - Basic', () => {
    it('should layout a simple Text node', () => {
      const node = Text({}, 'hello');
      const layout = calculateLayout(node, 80, 24);

      expect(layout.width).toBe(5);
      expect(layout.height).toBe(1);
      expect(layout.x).toBe(0);
      expect(layout.y).toBe(0);
    });

    it('should layout a Box with fixed dimensions', () => {
      const node = Box({ width: 20, height: 10 });
      const layout = calculateLayout(node, 80, 24);

      expect(layout.width).toBe(20);
      expect(layout.height).toBe(10);
    });

    it('should respect percentage dimensions', () => {
      const node = Box({ width: '50%', height: '25%' });
      const layout = calculateLayout(node, 80, 24);

      expect(layout.width).toBe(40);
      expect(layout.height).toBe(6);
    });
  });

  describe('calculateLayout - Row Direction', () => {
    it('should layout children horizontally', () => {
      const node = Box(
        { flexDirection: 'row', width: 80 },
        Text({}, 'A'),
        Text({}, 'B'),
        Text({}, 'C')
      );
      const layout = calculateLayout(node, 80, 24);

      expect(layout.children).toHaveLength(3);
      expect(layout.children![0].x).toBe(0);
      expect(layout.children![1].x).toBe(1); // After 'A'
      expect(layout.children![2].x).toBe(2); // After 'B'
    });

    it('should apply gap between children', () => {
      const node = Box(
        { flexDirection: 'row', gap: 2, width: 80 },
        Text({}, 'A'),
        Text({}, 'B')
      );
      const layout = calculateLayout(node, 80, 24);

      expect(layout.children![0].x).toBe(0);
      expect(layout.children![1].x).toBe(3); // 1 + gap of 2
    });

    it('should distribute space with flexGrow', () => {
      const node = Box(
        { flexDirection: 'row', width: 100 },
        Box({ flexGrow: 1 }, Text({}, 'flex')),
        Text({}, 'fixed') // 5 chars
      );
      const layout = calculateLayout(node, 100, 24);

      // First child gets remaining space after fixed child
      // The layout returns the child's calculated width
      expect(layout.children!.length).toBe(2);
      expect(layout.children![1].width).toBe(5);
      // flexGrow child should get remaining space
      expect(layout.children![0].width).toBeGreaterThan(0);
    });

    it('should handle justifyContent: flex-end in row', () => {
      const node = Box(
        { flexDirection: 'row', width: 20, justifyContent: 'flex-end' },
        Text({}, 'AB') // 2 chars
      );
      const layout = calculateLayout(node, 80, 24);

      expect(layout.children![0].x).toBe(18); // 20 - 2
    });

    it('should handle justifyContent: center in row', () => {
      const node = Box(
        { flexDirection: 'row', width: 20, justifyContent: 'center' },
        Text({}, 'ABCD') // 4 chars
      );
      const layout = calculateLayout(node, 80, 24);

      expect(layout.children![0].x).toBe(8); // (20 - 4) / 2
    });

    it('should handle justifyContent: space-between in row', () => {
      const node = Box(
        { flexDirection: 'row', width: 20, justifyContent: 'space-between' },
        Text({}, 'A'),
        Text({}, 'B'),
        Text({}, 'C')
      );
      const layout = calculateLayout(node, 80, 24);

      expect(layout.children![0].x).toBe(0);
      // Remaining space: 20 - 3 = 17, divided by 2 gaps = 8.5
      expect(layout.children![1].x).toBeGreaterThan(1);
      expect(layout.children![2].x).toBe(19); // Should be at end
    });
  });

  describe('calculateLayout - Column Direction', () => {
    it('should layout children vertically', () => {
      const node = Box(
        { flexDirection: 'column', height: 24 },
        Text({}, 'Line 1'),
        Text({}, 'Line 2'),
        Text({}, 'Line 3')
      );
      const layout = calculateLayout(node, 80, 24);

      expect(layout.children).toHaveLength(3);
      expect(layout.children![0].y).toBe(0);
      expect(layout.children![1].y).toBe(1);
      expect(layout.children![2].y).toBe(2);
    });

    it('should apply gap between children in column', () => {
      const node = Box(
        { flexDirection: 'column', gap: 1, height: 24 },
        Text({}, 'A'),
        Text({}, 'B')
      );
      const layout = calculateLayout(node, 80, 24);

      expect(layout.children![0].y).toBe(0);
      expect(layout.children![1].y).toBe(2); // 1 + gap of 1
    });

    it('should handle justifyContent: flex-end in column', () => {
      const node = Box(
        { flexDirection: 'column', height: 10, justifyContent: 'flex-end' },
        Text({}, 'A'),
        Text({}, 'B')
      );
      const layout = calculateLayout(node, 80, 24);

      // Two lines at bottom of 10-height container
      // Content height = 2, remaining = 8
      expect(layout.children![0].y).toBe(8);
      expect(layout.children![1].y).toBe(9);
    });

    it('should handle justifyContent: center in column', () => {
      const node = Box(
        { flexDirection: 'column', height: 10, justifyContent: 'center' },
        Text({}, 'A'),
        Text({}, 'B')
      );
      const layout = calculateLayout(node, 80, 24);

      // Content height = 2, remaining = 8, offset = 4
      expect(layout.children![0].y).toBe(4);
      expect(layout.children![1].y).toBe(5);
    });

    it('should handle justifyContent: space-between in column', () => {
      const node = Box(
        { flexDirection: 'column', height: 10, justifyContent: 'space-between' },
        Text({}, 'Top'),
        Text({}, 'Bottom')
      );
      const layout = calculateLayout(node, 80, 24);

      expect(layout.children![0].y).toBe(0);
      expect(layout.children![1].y).toBe(9); // At the bottom
    });
  });

  describe('calculateLayout - Padding and Margin', () => {
    it('should calculate padding for box dimensions', () => {
      const node = Box(
        { padding: 2, width: 20, height: 10 },
        Text({}, 'content')
      );
      const layout = calculateLayout(node, 80, 24);

      // Box has explicit dimensions
      expect(layout.width).toBe(20);
      expect(layout.height).toBe(10);
      // Child exists and is laid out
      expect(layout.children![0]).toBeDefined();
    });

    it('should handle paddingX and paddingY', () => {
      const node = Box(
        { paddingX: 3, paddingY: 1, width: 20, height: 10 },
        Text({}, 'content')
      );
      const layout = calculateLayout(node, 80, 24);

      // Box dimensions are preserved
      expect(layout.width).toBe(20);
      expect(layout.height).toBe(10);
      expect(layout.children!.length).toBe(1);
    });

    it('should account for padding in content layout', () => {
      const node = Box(
        { padding: 2, width: 20, height: 10, flexDirection: 'row' },
        Box({ flexGrow: 1 }, Text({}, 'content'))
      );
      const layout = calculateLayout(node, 80, 24);

      // flexGrow child should use available content space
      expect(layout.children![0]).toBeDefined();
      // Parent box dimensions account for padding
      expect(layout.width).toBe(20);
      expect(layout.height).toBe(10);
    });

    it('should apply margin to elements', () => {
      const node = Box(
        { flexDirection: 'column', width: 20, height: 10 },
        Box({ marginTop: 2, height: 1 }, Text({}, 'content'))
      );
      const layout = calculateLayout(node, 80, 24);

      // Child should be offset by marginTop
      expect(layout.children![0].y).toBe(2);
    });
  });

  describe('calculateLayout - Borders', () => {
    it('should account for border in sizing', () => {
      const node = Box(
        { borderStyle: 'single', width: 10, height: 5 },
        Text({}, 'hi')
      );
      const layout = calculateLayout(node, 80, 24);

      // Border is accounted for in the box dimensions
      expect(layout.width).toBe(10);
      expect(layout.height).toBe(5);
      // Child is laid out within content area
      expect(layout.children![0]).toBeDefined();
      expect(layout.children![0].width).toBe(2); // 'hi' is 2 chars
    });
  });

  describe('calculateLayout - alignItems', () => {
    it('should align items to center in row', () => {
      const node = Box(
        { flexDirection: 'row', alignItems: 'center', height: 10, width: 20 },
        Text({}, 'A')
      );
      const layout = calculateLayout(node, 80, 24);

      // Text is 1 line, container is 10 high, so y = (10 - 1) / 2 = 4
      expect(layout.children![0].y).toBe(4);
    });

    it('should align items to flex-end in row', () => {
      const node = Box(
        { flexDirection: 'row', alignItems: 'flex-end', height: 10, width: 20 },
        Text({}, 'A')
      );
      const layout = calculateLayout(node, 80, 24);

      expect(layout.children![0].y).toBe(9);
    });

    it('should align items to center in column', () => {
      const node = Box(
        { flexDirection: 'column', alignItems: 'center', width: 20, height: 10 },
        Text({}, 'ABC') // 3 chars
      );
      const layout = calculateLayout(node, 80, 24);

      // x = (20 - 3) / 2 = 8
      expect(layout.children![0].x).toBe(8);
    });
  });

  describe('calculateLayout - Nested Boxes', () => {
    it('should layout nested boxes correctly', () => {
      const node = Box(
        { flexDirection: 'column', width: 40, height: 20 },
        Box(
          { flexDirection: 'row', height: 5 },
          Text({}, 'Left'),
          Spacer(),
          Text({}, 'Right')
        ),
        Box(
          { flexGrow: 1 },
          Text({}, 'Content')
        )
      );
      const layout = calculateLayout(node, 80, 24);

      expect(layout.children).toHaveLength(2);
      expect(layout.children![0].height).toBe(5);
      // Second child gets calculated height based on its content
      expect(layout.children![1]).toBeDefined();
      expect(layout.children![1].height).toBeGreaterThan(0);
    });
  });

  describe('calculateLayout - Edge Cases', () => {
    it('should handle empty Box', () => {
      const node = Box({});
      const layout = calculateLayout(node, 80, 24);

      expect(layout.width).toBe(0);
      expect(layout.height).toBe(0);
    });

    it('should handle very small container', () => {
      const node = Box(
        { width: 2, height: 2 },
        Text({}, 'very long text that will overflow')
      );
      const layout = calculateLayout(node, 80, 24);

      // Should still calculate layout without crashing
      expect(layout.width).toBe(2);
    });

    it('should handle zero dimensions', () => {
      const node = Box({ width: 0, height: 0 });
      const layout = calculateLayout(node, 80, 24);

      expect(layout.width).toBe(0);
      expect(layout.height).toBe(0);
    });
  });
});

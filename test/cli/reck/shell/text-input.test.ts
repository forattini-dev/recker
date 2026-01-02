/**
 * Tests for TextInput Component
 *
 * Tests the text input state management and rendering
 * Note: Input handling is tested via the hooks tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createTextInput,
  renderTextInput,
} from '../../../../src/cli/reck/components/text-input.js';
import { renderToString } from '../../../../src/cli/reck/renderer.js';

describe('TextInput', () => {
  describe('createTextInput', () => {
    it('should create with default empty value', () => {
      const input = createTextInput();
      expect(input.value()).toBe('');
      expect(input.cursorPosition()).toBe(0);
    });

    it('should create with initial value', () => {
      const input = createTextInput({ initialValue: 'hello' });
      expect(input.value()).toBe('hello');
      expect(input.cursorPosition()).toBe(5);
    });

    it('should set value', () => {
      const input = createTextInput();
      input.setValue('new value');
      expect(input.value()).toBe('new value');
      expect(input.cursorPosition()).toBe(9);
    });

    it('should clear value', () => {
      const input = createTextInput({ initialValue: 'test' });
      input.clear();
      expect(input.value()).toBe('');
      expect(input.cursorPosition()).toBe(0);
    });

    it('should call onChange when setting value', () => {
      const onChange = vi.fn();
      const input = createTextInput({ onChange });

      input.setValue('changed');
      expect(onChange).toHaveBeenCalledWith('changed');
    });

    it('should call onChange when clearing', () => {
      const onChange = vi.fn();
      const input = createTextInput({ initialValue: 'test', onChange });

      input.clear();
      expect(onChange).toHaveBeenCalledWith('');
    });

    it('should have isMultiline method', () => {
      const input = createTextInput();
      expect(input.isMultiline()).toBe(false);
    });

    it('should have focus method', () => {
      const input = createTextInput();
      expect(() => input.focus()).not.toThrow();
    });
  });

  describe('renderTextInput', () => {
    it('should render empty input with placeholder', () => {
      const input = createTextInput({ placeholder: 'Type here...' });
      const node = renderTextInput(input, { placeholder: 'Type here...' });
      const output = renderToString(node, 80);

      expect(output).toContain('Type here...');
    });

    it('should render input with value', () => {
      const input = createTextInput({ initialValue: 'hello' });
      const node = renderTextInput(input);
      const output = renderToString(node, 80);

      expect(output).toContain('hello');
    });

    it('should render password mask', () => {
      const input = createTextInput({ initialValue: 'secret' });
      const node = renderTextInput(input, { password: true });
      const output = renderToString(node, 80);

      expect(output).not.toContain('secret');
      expect(output).toContain('*');
    });

    it('should render custom password mask', () => {
      const input = createTextInput({ initialValue: 'test' });
      const node = renderTextInput(input, { password: true, maskChar: '•' });
      const output = renderToString(node, 80);

      expect(output).toContain('•');
    });

    it('should render with prompt', () => {
      const input = createTextInput();
      const node = renderTextInput(input, { prompt: '>' });
      const output = renderToString(node, 80);

      expect(output).toContain('>');
    });

    it('should render cursor when active', () => {
      const input = createTextInput({ initialValue: 'test' });
      const node = renderTextInput(input, { isActive: true });
      const output = renderToString(node, 80);

      // Should have some visual cursor indicator
      expect(output.length).toBeGreaterThan(0);
    });

    it('should render without border when specified', () => {
      const input = createTextInput();
      const node = renderTextInput(input, { borderStyle: 'none' });
      const output = renderToString(node, 80);

      expect(output).not.toContain('─');
      expect(output).not.toContain('│');
    });

    it('should render with round border', () => {
      const input = createTextInput();
      const node = renderTextInput(input, { borderStyle: 'round' });
      const output = renderToString(node, 80);

      // Round border uses ╭ ╯ characters
      // We just check it renders without error
      expect(output.length).toBeGreaterThan(0);
    });

    it('should render with default prompt', () => {
      const input = createTextInput();
      const node = renderTextInput(input);
      const output = renderToString(node, 80);

      expect(output).toContain('❯');
    });

    it('should render with custom prompt color', () => {
      const input = createTextInput();
      const node = renderTextInput(input, { promptColor: 'green' });
      const output = renderToString(node, 80);

      expect(output).toContain('❯');
    });

    it('should render full width when specified', () => {
      const input = createTextInput();
      const node = renderTextInput(input, { fullWidth: true });
      const output = renderToString(node, 80);

      expect(output.length).toBeGreaterThan(0);
    });

    it('should render with single border style', () => {
      const input = createTextInput({ initialValue: 'test' });
      const node = renderTextInput(input, { borderStyle: 'single' });
      const output = renderToString(node, 80);

      expect(output).toContain('test');
    });

    it('should render unfocused state', () => {
      const input = createTextInput({ initialValue: 'test' });
      const node = renderTextInput(input, { isActive: false });
      const output = renderToString(node, 80);

      expect(output).toContain('test');
    });
  });

  describe('Value State', () => {
    it('should track cursor position separately from value', () => {
      const input = createTextInput({ initialValue: 'hello' });

      expect(input.value()).toBe('hello');
      expect(input.cursorPosition()).toBe(5);

      input.setValue('hi');
      expect(input.value()).toBe('hi');
      expect(input.cursorPosition()).toBe(2);
    });

    it('should handle empty value correctly', () => {
      const input = createTextInput();

      expect(input.value()).toBe('');
      expect(input.cursorPosition()).toBe(0);

      input.setValue('');
      expect(input.value()).toBe('');
      expect(input.cursorPosition()).toBe(0);
    });

    it('should handle long value', () => {
      const longText = 'x'.repeat(1000);
      const input = createTextInput({ initialValue: longText });

      expect(input.value()).toBe(longText);
      expect(input.cursorPosition()).toBe(1000);
    });

    it('should handle value with newlines', () => {
      const multiline = 'line1\nline2\nline3';
      const input = createTextInput({ initialValue: multiline });

      expect(input.value()).toBe(multiline);
      expect(input.cursorPosition()).toBe(multiline.length);
    });

    it('should handle special characters', () => {
      const special = '→←↑↓•★✓✗🚀';
      const input = createTextInput({ initialValue: special });

      expect(input.value()).toBe(special);
    });
  });

  describe('Options', () => {
    it('should accept all options without error', () => {
      expect(() =>
        createTextInput({
          initialValue: 'test',
          placeholder: 'placeholder',
          password: true,
          maskChar: '•',
          multiline: true,
          maxLength: 100,
          history: ['cmd1', 'cmd2'],
          onChange: () => {},
          onSubmit: () => {},
          onCancel: () => {},
          isActive: true,
        })
      ).not.toThrow();
    });

    it('should work with empty history', () => {
      const input = createTextInput({ history: [] });
      expect(input.value()).toBe('');
    });

    it('should work with history', () => {
      const input = createTextInput({
        history: ['first', 'second', 'third'],
      });
      expect(input.value()).toBe('');
    });
  });

  describe('Multiline Rendering', () => {
    it('should render multiline value', () => {
      const input = createTextInput({ initialValue: 'line1\nline2' });
      const node = renderTextInput(input);
      const output = renderToString(node, 80);

      expect(output).toContain('line1');
      expect(output).toContain('line2');
    });

    it('should render three lines', () => {
      const input = createTextInput({ initialValue: 'a\nb\nc' });
      const node = renderTextInput(input);
      const output = renderToString(node, 80);

      expect(output).toContain('a');
      expect(output).toContain('b');
      expect(output).toContain('c');
    });
  });
});

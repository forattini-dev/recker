/**
 * Shell Integration Tests
 *
 * Tests the complete shell workflow including:
 * - Full command execution flow
 * - State transitions
 * - Panel interactions
 * - Keyboard shortcuts
 * - Message history management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createShellState,
  type ShellState,
} from '../../../../src/cli/reck/shell/state.js';
import { executeCommand } from '../../../../src/cli/reck/shell/executor.js';
import {
  ShellHeader,
  ShellMessages,
  ShellHelp,
  JobsPanel,
  ProcessingIndicator,
} from '../../../../src/cli/reck/shell/ui.js';
import { renderToString } from '../../../../src/cli/reck/renderer.js';
import { Box } from '../../../../src/cli/reck/components.js';

describe('Shell Integration', () => {
  let state: ShellState;

  beforeEach(() => {
    state = createShellState();
  });

  describe('Command Execution Flow', () => {
    it('should show error for unknown command', async () => {
      await executeCommand('nonexistent', state);

      const messages = state.messages();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('error');
    });

    it('should handle multiple commands sequentially', async () => {
      await executeCommand('help', state);
      expect(state.panels().help).toBe(true);

      state.closeAllPanels();
      expect(state.panels().help).toBe(false);

      await executeCommand('url https://api.test.com', state);
      expect(state.config().baseUrl).toBe('https://api.test.com');

      const messages = state.messages();
      expect(messages).toHaveLength(1);
    });

    it('should maintain message history', async () => {
      await executeCommand('set var1 value1', state);
      await executeCommand('set var2 value2', state);
      await executeCommand('vars', state);

      expect(state.messages()).toHaveLength(3);
      expect(state.getVariable('var1')).toBe('value1');
      expect(state.getVariable('var2')).toBe('value2');
    });
  });

  describe('Panel State Management', () => {
    it('should toggle help panel', async () => {
      expect(state.panels().help).toBe(false);

      await executeCommand('help', state);
      expect(state.panels().help).toBe(true);

      await executeCommand('help', state);
      expect(state.panels().help).toBe(false);
    });

    it('should switch between panels', () => {
      state.togglePanel('help');
      expect(state.panels().help).toBe(true);
      expect(state.panels().jobs).toBe(false);

      state.togglePanel('jobs');
      expect(state.panels().help).toBe(false);
      expect(state.panels().jobs).toBe(true);
    });

    it('should close all panels', () => {
      state.togglePanel('help');
      state.togglePanel('jobs');
      state.closeAllPanels();

      expect(state.panels().help).toBe(false);
      expect(state.panels().jobs).toBe(false);
      expect(state.panels().search).toBe(false);
    });
  });

  describe('Processing State', () => {
    it('should track processing state', () => {
      expect(state.isProcessing()).toBe(false);

      state.setProcessing(true);
      state.setCurrentCommand('GET https://api.example.com');
      state.setCommandStartTime(new Date());

      expect(state.isProcessing()).toBe(true);
      expect(state.currentCommand()).toBe('GET https://api.example.com');
      expect(state.commandStartTime()).not.toBe(null);

      state.setProcessing(false);
      state.setCurrentCommand('');
      state.setCommandStartTime(null);

      expect(state.isProcessing()).toBe(false);
    });

    it('should render processing indicator', () => {
      const node = ProcessingIndicator({
        isActive: true,
        command: 'GET /api/users',
      });

      const output = renderToString(node, 80);
      expect(output).toContain('GET /api/users');
    });
  });

  describe('Message History and Scrolling', () => {
    it('should handle scroll offset', () => {
      // Add many messages
      for (let i = 0; i < 50; i++) {
        state.addMessage('info', `Message ${i + 1}`);
      }

      expect(state.messages()).toHaveLength(50);
      expect(state.scrollOffset()).toBe(0);

      // Scroll up
      state.setScrollOffset(10);
      expect(state.scrollOffset()).toBe(10);

      // Scroll down
      state.setScrollOffset((prev) => Math.max(0, prev - 5));
      expect(state.scrollOffset()).toBe(5);
    });

    it('should limit message history to max size', () => {
      state.updateConfig({ maxHistorySize: 10 });

      for (let i = 0; i < 20; i++) {
        state.addMessage('info', `Message ${i + 1}`);
      }

      expect(state.messages()).toHaveLength(10);
      expect(state.messages()[0].content).toBe('Message 11');
    });

    it('should render message list with scroll indicators', () => {
      for (let i = 0; i < 30; i++) {
        state.addMessage('info', `Message ${i + 1}`);
      }

      const node = ShellMessages({
        messages: state.messages(),
        scrollOffset: 5,
        maxVisible: 10,
      });

      const output = renderToString(node, 80);
      expect(output).toContain('more messages');
    });
  });

  describe('Input History', () => {
    it('should track command history', () => {
      state.addToHistory('get https://api.com/users');
      state.addToHistory('dns google.com');
      state.addToHistory('whois github.com');

      const history = state.inputHistory();
      expect(history).toHaveLength(3);
      expect(history[0]).toBe('get https://api.com/users');
      expect(history[2]).toBe('whois github.com');
    });

    it('should not add duplicates consecutively', () => {
      state.addToHistory('help');
      state.addToHistory('help');
      state.addToHistory('help');

      expect(state.inputHistory()).toHaveLength(1);
    });

    it('should allow same command after different one', () => {
      state.addToHistory('help');
      state.addToHistory('clear');
      state.addToHistory('help');

      expect(state.inputHistory()).toHaveLength(3);
    });
  });

  describe('Config Management', () => {
    it('should update config through commands', async () => {
      await executeCommand('url https://api.test.com', state);
      expect(state.config().baseUrl).toBe('https://api.test.com');
    });

    it('should persist config changes', () => {
      state.updateConfig({
        baseUrl: 'https://test.com',
        theme: 'light',
        showStatusBar: false,
      });

      const config = state.config();
      expect(config.baseUrl).toBe('https://test.com');
      expect(config.theme).toBe('light');
      expect(config.showStatusBar).toBe(false);
    });
  });

  describe('Variable Management', () => {
    it('should set and get variables through commands', async () => {
      await executeCommand('set mytoken abc123', state);
      expect(state.getVariable('mytoken')).toBe('abc123');

      await executeCommand('vars', state);
      const lastMessage = state.messages()[state.messages().length - 1];
      expect(lastMessage.content).toContain('mytoken');
    });

    it('should handle variable with spaces in value', async () => {
      await executeCommand('set greeting hello world', state);
      expect(state.getVariable('greeting')).toBe('hello world');
    });
  });

  describe('Full UI Render', () => {
    it('should render complete shell layout', () => {
      state.addMessage('info', 'Welcome!');
      state.addMessage('user', '❯ get https://api.com');
      state.addMessage('assistant', '{"status": "ok"}');

      // Render header
      const header = ShellHeader({
        version: '1.0.0',
        baseUrl: state.config().baseUrl,
        activeJobs: 0,
      });

      // Render messages
      const messages = ShellMessages({
        messages: state.messages(),
        scrollOffset: 0,
      });

      // Combine into layout
      const layout = Box(
        { flexDirection: 'column' },
        header,
        messages
      );

      const output = renderToString(layout, 80);

      expect(output).toContain('rek');
      expect(output).toContain('Welcome');
      expect(output).toContain('status');
    });

    it('should render with help panel', () => {
      state.togglePanel('help');

      const layout = Box(
        { flexDirection: 'column' },
        state.panels().help ? ShellHelp() : Box({})
      );

      const output = renderToString(layout, 120);
      expect(output).toContain('Commands');
      expect(output).toContain('Shortcuts');
    });

    it('should render with jobs panel', () => {
      state.togglePanel('jobs');

      const layout = Box(
        { flexDirection: 'column' },
        state.panels().jobs ? JobsPanel({ jobs: state.jobs() }) : Box({})
      );

      const output = renderToString(layout, 80);
      expect(output).toContain('Jobs Panel');
    });
  });

  describe('Error Handling', () => {
    it('should handle command execution errors gracefully', async () => {
      // Unknown command
      await executeCommand('totally_invalid_command_xyz', state);

      const messages = state.messages();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('error');
      expect(messages[0].content).toContain('Unknown command');
    });

    it('should handle missing arguments', async () => {
      await executeCommand('dns', state);
      expect(state.messages()[0].role).toBe('error');
      expect(state.messages()[0].content).toContain('Usage');
    });

    it('should recover from errors', async () => {
      await executeCommand('invalid', state);
      expect(state.messages()).toHaveLength(1);

      await executeCommand('clear', state);
      expect(state.messages()).toHaveLength(0);

      await executeCommand('help', state);
      expect(state.panels().help).toBe(true);
    });
  });

  describe('Message Roles', () => {
    it('should support all message types', () => {
      state.addMessage('user', 'User input');
      state.addMessage('assistant', 'Response');
      state.addMessage('system', 'System message');
      state.addMessage('error', 'Error message');
      state.addMessage('info', 'Info message');
      state.addMessage('success', 'Success message');

      const messages = state.messages();
      expect(messages).toHaveLength(6);
      expect(messages.map((m) => m.role)).toEqual([
        'user',
        'assistant',
        'system',
        'error',
        'info',
        'success',
      ]);
    });

    it('should render different message types with different styles', () => {
      state.addMessage('error', 'Something went wrong');
      state.addMessage('success', 'Operation completed');

      const node = ShellMessages({
        messages: state.messages(),
        scrollOffset: 0,
      });

      const output = renderToString(node, 80);
      expect(output).toContain('wrong');
      expect(output).toContain('completed');
    });
  });

  describe('State Reactivity', () => {
    it('should update UI when state changes', () => {
      // Initial state
      expect(state.messages()).toHaveLength(0);

      // Add message
      state.addMessage('info', 'Test message');
      expect(state.messages()).toHaveLength(1);

      // Render should reflect change
      const node = ShellMessages({
        messages: state.messages(),
        scrollOffset: 0,
      });

      const output = renderToString(node, 80);
      expect(output).toContain('Test message');
    });

    it('should handle rapid state updates', () => {
      for (let i = 0; i < 100; i++) {
        state.addMessage('info', `Rapid message ${i}`);
      }

      expect(state.messages()).toHaveLength(100);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty state render', () => {
      const node = ShellMessages({
        messages: [],
        scrollOffset: 0,
      });

      const output = renderToString(node, 80);
      expect(output).toContain('Type a command');
    });

    it('should handle very long messages', () => {
      const longMessage = 'x'.repeat(500);
      state.addMessage('info', longMessage);

      expect(state.messages()[0].content.length).toBe(500);
    });

    it('should handle special characters in messages', () => {
      state.addMessage('info', 'Special: → ← ↑ ↓ • ★ ✓ ✗ 🚀');

      const node = ShellMessages({
        messages: state.messages(),
        scrollOffset: 0,
      });

      const output = renderToString(node, 80);
      expect(output).toContain('→');
      expect(output).toContain('🚀');
    });

    it('should handle markdown-like content', () => {
      state.addMessage('assistant', '```json\n{"key": "value"}\n```');

      expect(state.messages()[0].content).toContain('```');
    });

    it('should handle multiline messages', () => {
      state.addMessage('info', 'Line 1\nLine 2\nLine 3');

      expect(state.messages()[0].content).toContain('\n');
    });
  });

  describe('Keyboard Shortcut Simulation', () => {
    it('should toggle help with F1', () => {
      expect(state.panels().help).toBe(false);
      state.togglePanel('help');
      expect(state.panels().help).toBe(true);
    });

    it('should toggle jobs with F2', () => {
      expect(state.panels().jobs).toBe(false);
      state.togglePanel('jobs');
      expect(state.panels().jobs).toBe(true);
    });

    it('should clear messages with Ctrl+L', () => {
      state.addMessage('info', 'Test');
      expect(state.messages()).toHaveLength(1);

      state.clearMessages();
      expect(state.messages()).toHaveLength(0);
    });

    it('should close all panels with Escape', () => {
      state.togglePanel('help');
      expect(state.panels().help).toBe(true);

      state.closeAllPanels();
      expect(state.panels().help).toBe(false);
    });

    it('should handle PageUp/PageDown for scrolling', () => {
      for (let i = 0; i < 50; i++) {
        state.addMessage('info', `Message ${i}`);
      }

      // PageUp
      state.setScrollOffset((prev) => Math.min(prev + 5, state.messages().length - 10));
      expect(state.scrollOffset()).toBe(5);

      // PageDown
      state.setScrollOffset((prev) => Math.max(0, prev - 5));
      expect(state.scrollOffset()).toBe(0);
    });
  });
});

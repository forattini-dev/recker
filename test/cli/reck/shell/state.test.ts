/**
 * Tests for Shell State Management
 *
 * Tests the reactive state system that powers the shell
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createShellState,
  formatBytes,
  formatDuration,
  type ShellState,
  type MessageRole,
} from '../../../../src/cli/reck/shell/state.js';

describe('Shell State', () => {
  let state: ShellState;

  beforeEach(() => {
    state = createShellState();
  });

  describe('createShellState', () => {
    it('should create state with default values', () => {
      expect(state).toBeDefined();
      expect(state.messages()).toEqual([]);
      expect(state.inputHistory()).toEqual([]);
      expect(state.isProcessing()).toBe(false);
      expect(state.scrollOffset()).toBe(0);
      expect(state.currentCommand()).toBe('');
      expect(state.commandStartTime()).toBe(null);
    });

    it('should have default config', () => {
      const config = state.config();
      expect(config.baseUrl).toBe('');
      expect(config.theme).toBe('dark');
      expect(config.showStatusBar).toBe(true);
      expect(config.showTimestamps).toBe(true);
      expect(config.maxHistorySize).toBe(1000);
      expect(config.spinnerStyle).toBe('dots');
    });

    it('should have default panel state', () => {
      const panels = state.panels();
      expect(panels.jobs).toBe(false);
      expect(panels.help).toBe(false);
      expect(panels.search).toBe(false);
    });
  });

  describe('Messages', () => {
    it('should add a message', () => {
      state.addMessage('info', 'Hello world');

      const messages = state.messages();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Hello world');
      expect(messages[0].role).toBe('info');
    });

    it('should add message with meta', () => {
      state.addMessage('assistant', 'Response', {
        command: 'GET /api',
        duration: 150,
        status: 200,
        contentType: 'application/json',
      });

      const msg = state.messages()[0];
      expect(msg.meta?.command).toBe('GET /api');
      expect(msg.meta?.duration).toBe(150);
      expect(msg.meta?.status).toBe(200);
    });

    it('should assign unique IDs to messages', () => {
      state.addMessage('info', 'First');
      state.addMessage('info', 'Second');
      state.addMessage('info', 'Third');

      const messages = state.messages();
      const ids = messages.map(m => m.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('should add timestamp to messages', () => {
      const before = new Date();
      state.addMessage('info', 'Test');
      const after = new Date();

      const msg = state.messages()[0];
      expect(msg.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(msg.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should support all message roles', () => {
      const roles: MessageRole[] = ['user', 'assistant', 'system', 'error', 'info', 'success'];

      roles.forEach(role => {
        state.addMessage(role, `Message with role ${role}`);
      });

      expect(state.messages()).toHaveLength(6);
      roles.forEach((role, i) => {
        expect(state.messages()[i].role).toBe(role);
      });
    });

    it('should enforce max history size', () => {
      // Set a small max size for testing
      state.updateConfig({ maxHistorySize: 5 });

      for (let i = 0; i < 10; i++) {
        state.addMessage('info', `Message ${i}`);
      }

      const messages = state.messages();
      expect(messages).toHaveLength(5);
      expect(messages[0].content).toBe('Message 5');
      expect(messages[4].content).toBe('Message 9');
    });

    it('should clear all messages', () => {
      state.addMessage('info', 'One');
      state.addMessage('info', 'Two');
      expect(state.messages()).toHaveLength(2);

      state.clearMessages();
      expect(state.messages()).toHaveLength(0);
    });
  });

  describe('Input History', () => {
    it('should add command to history', () => {
      state.addToHistory('get https://api.example.com');

      expect(state.inputHistory()).toHaveLength(1);
      expect(state.inputHistory()[0]).toBe('get https://api.example.com');
    });

    it('should not add duplicate consecutive commands', () => {
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

    it('should enforce max history size (500)', () => {
      for (let i = 0; i < 600; i++) {
        state.addToHistory(`command-${i}`);
      }

      expect(state.inputHistory()).toHaveLength(500);
      expect(state.inputHistory()[0]).toBe('command-100');
    });
  });

  describe('Config', () => {
    it('should update config partially', () => {
      state.updateConfig({ baseUrl: 'https://api.example.com' });

      const config = state.config();
      expect(config.baseUrl).toBe('https://api.example.com');
      expect(config.theme).toBe('dark'); // unchanged
    });

    it('should update multiple config values', () => {
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

  describe('UI State', () => {
    it('should toggle processing state', () => {
      expect(state.isProcessing()).toBe(false);

      state.setProcessing(true);
      expect(state.isProcessing()).toBe(true);

      state.setProcessing(false);
      expect(state.isProcessing()).toBe(false);
    });

    it('should set scroll offset', () => {
      state.setScrollOffset(10);
      expect(state.scrollOffset()).toBe(10);
    });

    it('should update scroll offset with function', () => {
      state.setScrollOffset(5);
      state.setScrollOffset(prev => prev + 3);
      expect(state.scrollOffset()).toBe(8);
    });

    it('should set current command', () => {
      state.setCurrentCommand('GET https://api.example.com');
      expect(state.currentCommand()).toBe('GET https://api.example.com');
    });

    it('should set command start time', () => {
      const now = new Date();
      state.setCommandStartTime(now);
      expect(state.commandStartTime()).toBe(now);
    });

    it('should clear command start time', () => {
      state.setCommandStartTime(new Date());
      state.setCommandStartTime(null);
      expect(state.commandStartTime()).toBe(null);
    });
  });

  describe('Panels', () => {
    it('should toggle help panel', () => {
      expect(state.panels().help).toBe(false);

      state.togglePanel('help');
      expect(state.panels().help).toBe(true);

      state.togglePanel('help');
      expect(state.panels().help).toBe(false);
    });

    it('should toggle jobs panel', () => {
      state.togglePanel('jobs');
      expect(state.panels().jobs).toBe(true);
    });

    it('should close other panels when opening one', () => {
      state.togglePanel('help');
      expect(state.panels().help).toBe(true);
      expect(state.panels().jobs).toBe(false);

      state.togglePanel('jobs');
      expect(state.panels().help).toBe(false);
      expect(state.panels().jobs).toBe(true);
    });

    it('should close all panels', () => {
      state.togglePanel('help');
      state.closeAllPanels();

      const panels = state.panels();
      expect(panels.help).toBe(false);
      expect(panels.jobs).toBe(false);
      expect(panels.search).toBe(false);
    });
  });

  describe('Variables', () => {
    it('should start with empty variables', () => {
      expect(state.variables()).toEqual({});
    });

    it('should set a variable', () => {
      state.setVariable('token', 'abc123');
      expect(state.getVariable('token')).toBe('abc123');
    });

    it('should get variable', () => {
      state.setVariable('count', 42);
      expect(state.getVariable('count')).toBe(42);
    });

    it('should return undefined for missing variable', () => {
      expect(state.getVariable('nonexistent')).toBeUndefined();
    });

    it('should overwrite existing variable', () => {
      state.setVariable('key', 'old');
      state.setVariable('key', 'new');
      expect(state.getVariable('key')).toBe('new');
    });

    it('should store complex values', () => {
      const obj = { name: 'test', values: [1, 2, 3] };
      state.setVariable('data', obj);
      expect(state.getVariable('data')).toEqual(obj);
    });
  });

  describe('Jobs Integration', () => {
    it('should have job manager', () => {
      expect(state.jobManager).toBeDefined();
    });

    it('should start with empty jobs', () => {
      expect(state.jobs()).toEqual([]);
    });

    it('should filter active jobs', () => {
      expect(state.getActiveJobs()).toEqual([]);
    });
  });
});

describe('Utility Functions', () => {
  describe('formatBytes', () => {
    it('should format 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('should format bytes', () => {
      expect(formatBytes(500)).toBe('500.0 B');
    });

    it('should format kilobytes', () => {
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format megabytes', () => {
      expect(formatBytes(1048576)).toBe('1.0 MB');
      expect(formatBytes(2621440)).toBe('2.5 MB');
    });

    it('should format gigabytes', () => {
      expect(formatBytes(1073741824)).toBe('1.0 GB');
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(50)).toBe('50ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format seconds', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(5500)).toBe('5.5s');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(125000)).toBe('2m 5s');
    });
  });
});

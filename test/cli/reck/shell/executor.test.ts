/**
 * Tests for Shell Command Executor
 *
 * Tests command parsing, routing, and execution
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeCommand } from '../../../../src/cli/reck/shell/executor.js';
import { createShellState, type ShellState } from '../../../../src/cli/reck/shell/state.js';

describe('Command Executor', () => {
  let state: ShellState;

  beforeEach(() => {
    state = createShellState();
  });

  describe('Command Parsing', () => {
    it('should handle empty input', async () => {
      await executeCommand('', state);
      expect(state.messages()).toHaveLength(0);
    });

    it('should handle whitespace-only input', async () => {
      await executeCommand('   ', state);
      expect(state.messages()).toHaveLength(0);
    });

    it('should handle unknown command', async () => {
      await executeCommand('unknowncommand', state);

      const messages = state.messages();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('error');
      expect(messages[0].content).toContain('Unknown command');
    });
  });

  describe('Shell Commands', () => {
    it('should handle help command', async () => {
      await executeCommand('help', state);
      expect(state.panels().help).toBe(true);
    });

    it('should handle clear command', async () => {
      state.addMessage('info', 'Test message');
      expect(state.messages()).toHaveLength(1);

      await executeCommand('clear', state);
      expect(state.messages()).toHaveLength(0);
    });

    it('should handle exit command', async () => {
      await executeCommand('exit', state);

      const messages = state.messages();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toContain('Ctrl+C');
    });

    it('should handle quit command', async () => {
      await executeCommand('quit', state);

      expect(state.messages()).toHaveLength(1);
      expect(state.messages()[0].content).toContain('Ctrl+C');
    });
  });

  describe('URL Command', () => {
    it('should set base URL', async () => {
      await executeCommand('url https://api.example.com', state);

      expect(state.config().baseUrl).toBe('https://api.example.com');
      expect(state.messages()[0].role).toBe('info');
      expect(state.messages()[0].content).toContain('Base URL set');
    });

    it('should show current URL when no argument', async () => {
      state.updateConfig({ baseUrl: 'https://test.com' });
      await executeCommand('url', state);

      expect(state.messages()[0].content).toContain('https://test.com');
    });

    it('should show "no base URL" when not set', async () => {
      await executeCommand('url', state);
      expect(state.messages()[0].content).toContain('No base URL');
    });

    it('should normalize URL (add https)', async () => {
      await executeCommand('url api.example.com', state);
      expect(state.config().baseUrl).toBe('https://api.example.com');
    });
  });

  describe('Variables Commands', () => {
    it('should show empty variables', async () => {
      await executeCommand('vars', state);
      expect(state.messages()[0].content).toContain('No variables');
    });

    it('should show variables as JSON', async () => {
      state.setVariable('token', 'abc123');
      state.setVariable('count', '42');

      await executeCommand('vars', state);

      const content = state.messages()[0].content;
      expect(content).toContain('token');
      expect(content).toContain('abc123');
    });

    it('should set variable', async () => {
      await executeCommand('set myvar hello world', state);

      expect(state.getVariable('myvar')).toBe('hello world');
      expect(state.messages()[0].content).toContain('Set myvar');
    });

    it('should show error for set without arguments', async () => {
      await executeCommand('set', state);
      expect(state.messages()[0].role).toBe('error');
      expect(state.messages()[0].content).toContain('Usage');
    });

    it('should show error for set with only key', async () => {
      await executeCommand('set onlykey', state);
      expect(state.messages()[0].role).toBe('error');
    });
  });

  describe('Jobs Commands', () => {
    it('should show no jobs message', async () => {
      await executeCommand('jobs', state);
      expect(state.messages()[0].content).toContain('No background jobs');
    });

    it('should show error for job:stop without ID', async () => {
      await executeCommand('job:stop', state);
      expect(state.messages()[0].role).toBe('error');
      expect(state.messages()[0].content).toContain('Usage');
    });

    it('should show error for job:stop with invalid ID', async () => {
      await executeCommand('job:stop abc', state);
      expect(state.messages()[0].role).toBe('error');
      expect(state.messages()[0].content).toContain('Invalid job ID');
    });

    it('should show error for job:stop with non-existent ID', async () => {
      await executeCommand('job:stop 999', state);
      expect(state.messages()[0].role).toBe('error');
      expect(state.messages()[0].content).toContain('Job not found');
    });
  });

  describe('DNS Commands', () => {
    it('should show error for dns without domain', async () => {
      await executeCommand('dns', state);
      expect(state.messages()[0].role).toBe('error');
      expect(state.messages()[0].content).toContain('Usage');
    });

    it('should show error for dns:all without domain', async () => {
      await executeCommand('dns:all', state);
      expect(state.messages()[0].role).toBe('error');
    });
  });

  describe('Network Commands', () => {
    it('should show error for whois without domain', async () => {
      await executeCommand('whois', state);
      expect(state.messages()[0].role).toBe('error');
      expect(state.messages()[0].content).toContain('Usage');
    });

    it('should show error for rdap without domain', async () => {
      await executeCommand('rdap', state);
      expect(state.messages()[0].role).toBe('error');
    });

    it('should show error for tls without host', async () => {
      await executeCommand('tls', state);
      expect(state.messages()[0].role).toBe('error');
    });

    it('should show error for ssl without host', async () => {
      await executeCommand('ssl', state);
      expect(state.messages()[0].role).toBe('error');
    });

    it('should show error for ping without host', async () => {
      await executeCommand('ping', state);
      expect(state.messages()[0].role).toBe('error');
    });
  });

  describe('HTTP Commands', () => {
    it('should show error for GET without URL', async () => {
      await executeCommand('get', state);
      expect(state.messages()[0].role).toBe('error');
      expect(state.messages()[0].content).toContain('Usage');
    });

    it('should show error for POST without URL', async () => {
      await executeCommand('post', state);
      expect(state.messages()[0].role).toBe('error');
    });

    it('should show error for PUT without URL', async () => {
      await executeCommand('put', state);
      expect(state.messages()[0].role).toBe('error');
    });

    it('should show error for PATCH without URL', async () => {
      await executeCommand('patch', state);
      expect(state.messages()[0].role).toBe('error');
    });

    it('should show error for DELETE without URL', async () => {
      await executeCommand('delete', state);
      expect(state.messages()[0].role).toBe('error');
    });

    it('should show error for HEAD without URL', async () => {
      await executeCommand('head', state);
      expect(state.messages()[0].role).toBe('error');
    });

    it('should show error for OPTIONS without URL', async () => {
      await executeCommand('options', state);
      expect(state.messages()[0].role).toBe('error');
    });
  });

  describe('AI Chat Commands', () => {
    it('should show error for AI chat without message', async () => {
      await executeCommand('@openai', state);
      expect(state.messages()[0].role).toBe('error');
      expect(state.messages()[0].content).toContain('Usage');
    });

    it('should handle AI chat (placeholder)', async () => {
      await executeCommand('@openai Hello, how are you?', state);

      const messages = state.messages();
      expect(messages.some(m => m.content.includes('not yet implemented'))).toBe(true);
    });
  });

  describe('Search Commands', () => {
    it('should handle natural language search (placeholder)', async () => {
      await executeCommand('how to make coffee?', state);

      const messages = state.messages();
      expect(messages.some(m => m.content.includes('Searching'))).toBe(true);
    });

    it('should not treat regular question mark as search', async () => {
      await executeCommand('?', state);
      expect(state.messages()[0].role).toBe('error');
    });
  });

  describe('URL Detection', () => {
    it('should auto-detect HTTPS URL and make GET request', async () => {
      // This will fail because we're not mocking the network
      // but it should be recognized as a URL
      await executeCommand('https://example.com', state);

      // Should have attempted a request (will likely error)
      expect(state.messages().length).toBeGreaterThan(0);
    });

    it('should auto-detect HTTP URL', async () => {
      await executeCommand('http://localhost:3000', state);
      expect(state.messages().length).toBeGreaterThan(0);
    });

    it('should auto-detect domain-like URL', async () => {
      await executeCommand('example.com', state);
      expect(state.messages().length).toBeGreaterThan(0);
    });
  });

  describe('Command Case Insensitivity', () => {
    it('should handle uppercase commands', async () => {
      await executeCommand('HELP', state);
      expect(state.panels().help).toBe(true);
    });

    it('should handle mixed case commands', async () => {
      await executeCommand('Help', state);
      expect(state.panels().help).toBe(true);
    });

    it('should handle CLEAR in uppercase', async () => {
      state.addMessage('info', 'test');
      await executeCommand('CLEAR', state);
      expect(state.messages()).toHaveLength(0);
    });
  });

  describe('Quoted Arguments', () => {
    it('should parse double-quoted arguments', async () => {
      await executeCommand('set key "value with spaces"', state);
      expect(state.getVariable('key')).toBe('value with spaces');
    });

    it('should parse single-quoted arguments', async () => {
      await executeCommand("set key 'another value'", state);
      expect(state.getVariable('key')).toBe('another value');
    });
  });
});

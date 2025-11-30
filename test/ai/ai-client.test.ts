/**
 * AI Client Tests
 *
 * Tests for the unified AI client interface
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAIClient,
  ai,
  AIClientImpl,
  OpenAIProvider,
  AnthropicProvider,
  AIError,
} from '../../src/ai/index.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AI Client', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Set API keys for testing
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe('createAIClient', () => {
    it('should create a default AI client', () => {
      const client = createAIClient();
      expect(client).toBeInstanceOf(AIClientImpl);
    });

    it('should create client with custom config', () => {
      const client = createAIClient({
        defaultProvider: 'anthropic',
        debug: true,
      });
      expect(client).toBeInstanceOf(AIClientImpl);
    });
  });

  describe('Default ai instance', () => {
    it('should export a default ai instance', () => {
      expect(ai).toBeDefined();
      expect(typeof ai.chat).toBe('function');
      expect(typeof ai.stream).toBe('function');
      expect(typeof ai.embed).toBe('function');
      expect(typeof ai.extend).toBe('function');
    });
  });

  describe('chat()', () => {
    it('should send chat completion request to OpenAI', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-5.1',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello!' },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        }),
      });

      const client = createAIClient();
      const response = await client.chat({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(response.content).toBe('Hello!');
      expect(response.provider).toBe('openai');
      expect(response.model).toBe('gpt-5.1');
      expect(response.usage.totalTokens).toBe(15);
    });

    it('should accept string prompt shorthand', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          model: 'gpt-5.1',
          choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        }),
      });

      const client = createAIClient();
      const response = await client.chat('Hello');

      expect(response.content).toBe('Hello!');
    });

    it('should send chat to Anthropic when specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'msg-123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello from Claude!' }],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      const client = createAIClient();
      const response = await client.chat({
        provider: 'anthropic',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(response.content).toBe('Hello from Claude!');
      expect(response.provider).toBe('anthropic');
    });
  });

  describe('extend()', () => {
    it('should create specialized client with defaults', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          model: 'gpt-5.1',
          choices: [{ message: { content: 'Code here' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
        }),
      });

      const client = createAIClient();
      const codeClient = client.extend({
        model: 'gpt-5.1',
        systemPrompt: 'You are a coding assistant',
        temperature: 0,
      });

      const response = await codeClient.chat({
        messages: [{ role: 'user', content: 'Write code' }],
      });

      expect(response.content).toBe('Code here');
    });
  });

  describe('metrics', () => {
    it('should track metrics', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          model: 'gpt-5.1',
          choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      const client = createAIClient({ observability: true });

      // Make a few requests
      await client.chat('Hi');
      await client.chat('Hello');
      await client.chat('Hey');

      expect(client.metrics.totalRequests).toBe(3);
      expect(client.metrics.totalTokens).toBe(45);
    });

    it('should provide metrics summary', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          model: 'gpt-5.1',
          choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      const client = createAIClient();
      await client.chat('Hi');

      const summary = client.metrics.summary();
      expect(summary.totalRequests).toBe(1);
      expect(summary.byModel).toHaveProperty('gpt-5.1');
    });

    it('should reset metrics', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          model: 'gpt-5.1',
          choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      const client = createAIClient();
      await client.chat('Hi');
      expect(client.metrics.totalRequests).toBe(1);

      client.metrics.reset();
      expect(client.metrics.totalRequests).toBe(0);
    });
  });

  describe('Error handling', () => {
    it('should handle rate limit errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'retry-after': '60' }),
        json: () => Promise.resolve({
          error: { message: 'Rate limit exceeded', type: 'rate_limit_exceeded' },
        }),
      });

      const client = createAIClient({ retry: undefined });

      await expect(client.chat('Hi')).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle authentication errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({
          error: { message: 'Invalid API key' },
        }),
      });

      const client = createAIClient();

      await expect(client.chat('Hi')).rejects.toThrow('Authentication failed');
    });
  });
});

describe('OpenAI Provider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it('should use env API key', () => {
    const provider = new OpenAIProvider();
    expect(provider.name).toBe('openai');
  });

  it('should use custom API key', () => {
    const provider = new OpenAIProvider({ apiKey: 'custom-key' });
    expect(provider.name).toBe('openai');
  });

  it('should transform messages correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'chatcmpl-123',
        model: 'gpt-5.1',
        choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });

    const provider = new OpenAIProvider();
    await provider.chat({
      messages: [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hi' },
      ],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
  });

  it('should handle multi-modal content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'chatcmpl-123',
        model: 'gpt-5.1',
        choices: [{ message: { content: 'I see an image' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
      }),
    });

    const provider = new OpenAIProvider();
    await provider.chat({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
          ],
        },
      ],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toHaveLength(2);
    expect(body.messages[0].content[0].type).toBe('text');
    expect(body.messages[0].content[1].type).toBe('image_url');
  });
});

describe('Anthropic Provider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('should use correct API format', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello!' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    });

    const provider = new AnthropicProvider();
    await provider.chat({
      messages: [{ role: 'user', content: 'Hi' }],
    });

    const request = mockFetch.mock.calls[0];
    expect(request[0]).toContain('api.anthropic.com');
    expect(request[1].headers['x-api-key']).toBe('test-key');
    expect(request[1].headers['anthropic-version']).toBe('2025-01-01');
  });

  it('should handle system prompt separately', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello!' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    });

    const provider = new AnthropicProvider();
    await provider.chat({
      systemPrompt: 'You are helpful',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.system).toBe('You are helpful');
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe('user');
  });

  it('should throw on embed (not supported)', async () => {
    const provider = new AnthropicProvider();
    await expect(provider.embed({ input: 'test' })).rejects.toThrow('does not support embeddings');
  });
});

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

describe('AI Error Classes', () => {
  it('should create AIError with correct properties', () => {
    const error = new AIError('Test error', 'openai', 'error_code', 500);
    expect(error.message).toBe('Test error');
    expect(error.provider).toBe('openai');
    expect(error.code).toBe('error_code');
    expect(error.status).toBe(500);
    expect(error.name).toBe('AIError');
  });

  it('should handle AIError without status code', () => {
    const error = new AIError('Test error', 'anthropic');
    expect(error.message).toBe('Test error');
    expect(error.provider).toBe('anthropic');
    expect(error.status).toBeUndefined();
  });
});

describe('OpenAI Provider Extended Tests', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('should handle streaming response', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":" World"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: stream,
    });

    const provider = new OpenAIProvider();
    const result = await provider.stream({
      messages: [{ role: 'user', content: 'Hi' }],
    });

    const events: any[] = [];
    for await (const event of result) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
  });

  it('should handle tools/functions', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'chatcmpl-123',
        model: 'gpt-5.1',
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call_1',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"location":"NYC"}' }
            }]
          },
          finish_reason: 'tool_calls',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    });

    const provider = new OpenAIProvider();
    const response = await provider.chat({
      messages: [{ role: 'user', content: 'What is the weather in NYC?' }],
      tools: [{
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather for a location',
          parameters: { type: 'object', properties: { location: { type: 'string' } } }
        }
      }],
    });

    expect(response.toolCalls).toBeDefined();
    expect(response.toolCalls?.length).toBe(1);
    expect(response.toolCalls?.[0].function.name).toBe('get_weather');
  });

  it('should handle multimodal content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'chatcmpl-123',
        model: 'gpt-4o',
        choices: [{ message: { content: 'I see an image' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
      }),
    });

    const provider = new OpenAIProvider();
    const response = await provider.chat({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'What is in this image?' },
          { type: 'image', data: 'base64data', mediaType: 'image/png' }
        ]
      }],
    });

    expect(response.content).toBe('I see an image');
  });
});

describe('Anthropic Provider Extended Tests', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('should handle streaming response', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg-1","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022","usage":{"input_tokens":10}}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: stream,
    });

    const provider = new AnthropicProvider();
    const result = await provider.stream({
      messages: [{ role: 'user', content: 'Hi' }],
    });

    const events: any[] = [];
    for await (const event of result) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
  });

  it('should handle tools', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'tool_use',
          id: 'tool_1',
          name: 'get_weather',
          input: { location: 'NYC' }
        }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'tool_use',
        usage: { input_tokens: 50, output_tokens: 30 },
      }),
    });

    const provider = new AnthropicProvider();
    const response = await provider.chat({
      messages: [{ role: 'user', content: 'What is the weather?' }],
      tools: [{
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather',
          parameters: { type: 'object', properties: { location: { type: 'string' } } }
        }
      }],
    });

    expect(response.toolCalls).toBeDefined();
    expect(response.toolCalls?.length).toBe(1);
  });

  it('should handle multimodal content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'I see a cat' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 200, output_tokens: 10 },
      }),
    });

    const provider = new AnthropicProvider();
    const response = await provider.chat({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          { type: 'image', data: 'base64data', mediaType: 'image/jpeg' }
        ]
      }],
    });

    expect(response.content).toBe('I see a cat');
  });
});

describe('AIClientImpl', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('should create client with default config', () => {
    const client = createAIClient();
    expect(client).toBeDefined();
    expect(client.metrics).toBeDefined();
  });

  it('should support string prompt shorthand', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'chatcmpl-123',
        model: 'gpt-5.1',
        choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      }),
    });

    const client = createAIClient();
    const response = await client.chat('Hello');

    expect(response.content).toBe('Hello!');
  });

  it('should track metrics when observability is enabled', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'chatcmpl-123',
        model: 'gpt-5.1',
        choices: [{ message: { content: 'Test response' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });

    const client = createAIClient({ observability: true });
    await client.chat('Test');

    expect(client.metrics.totalRequests).toBe(1);
    expect(client.metrics.totalTokens).toBe(15);
  });

  it('should extend client with default options', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'chatcmpl-123',
        model: 'gpt-5.1',
        choices: [{ message: { content: 'With system prompt' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 15, completion_tokens: 5, total_tokens: 20 },
      }),
    });

    const client = createAIClient();
    const extended = client.extend({ systemPrompt: 'You are helpful' });
    const response = await extended.chat({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(response.content).toBe('With system prompt');
  });

  it('should throw error for unknown provider', async () => {
    const client = createAIClient();
    await expect(client.chat({
      messages: [{ role: 'user', content: 'Hi' }],
      provider: 'unknown' as any,
    })).rejects.toThrow('Provider not found');
  });

  it('should record errors in metrics', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: 'Unauthorized' } }),
    });

    const client = createAIClient({ observability: true });

    try {
      await client.chat('Test');
    } catch (e) {
      // Expected error
    }

    expect(client.metrics.errorRate).toBeGreaterThan(0);
  });

  it('should stream chat completions', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: stream,
    });

    const client = createAIClient();
    const result = await client.stream({
      messages: [{ role: 'user', content: 'Hi' }],
    });

    const events: any[] = [];
    for await (const event of result) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
  });

  it('should call embed on provider', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        object: 'list',
        data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2, 0.3] }],
        model: 'text-embedding-3-large',
        usage: { prompt_tokens: 5, total_tokens: 5 },
      }),
    });

    const client = createAIClient();
    const response = await client.embed({ input: 'Hello' });

    expect(response.embeddings).toHaveLength(1);
    expect(response.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
  });

  it('should use anthropic provider when specified', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'From Anthropic' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    });

    const client = createAIClient();
    const response = await client.chat({
      messages: [{ role: 'user', content: 'Hi' }],
      provider: 'anthropic',
    });

    expect(response.provider).toBe('anthropic');
  });

  it('should handle debug logging', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'chatcmpl-123',
        model: 'gpt-5.1',
        choices: [{ message: { content: 'Debug test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      }),
    });

    const client = createAIClient({ debug: true });
    await client.chat('Test');

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('AIMetrics', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('should calculate average latency', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'chatcmpl-123',
        model: 'gpt-5.1',
        choices: [{ message: { content: 'Test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      }),
    });

    const client = createAIClient({ observability: true });
    await client.chat('Test 1');
    await client.chat('Test 2');

    expect(client.metrics.avgLatency.ttft).toBeGreaterThan(0);
    expect(client.metrics.avgLatency.total).toBeGreaterThan(0);
  });

  it('should track cache hits', async () => {
    // Mock a cached response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'chatcmpl-123',
        model: 'gpt-5.1',
        choices: [{ message: { content: 'Cached' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      }),
    });

    const client = createAIClient({ observability: true });
    // First call
    await client.chat('Test');

    // Metrics start at 0 cache hits
    expect(client.metrics.cacheHitRate).toBe(0);
  });

  it('should provide metrics summary', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'chatcmpl-123',
        model: 'gpt-5.1',
        choices: [{ message: { content: 'Test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    });

    const client = createAIClient({ observability: true });
    await client.chat('Test');

    const summary = client.metrics.summary();

    expect(summary.totalRequests).toBe(1);
    expect(summary.totalTokens).toBe(30);
    expect(summary.byModel).toBeDefined();
    expect(summary.byProvider).toBeDefined();
  });

  it('should reset metrics', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'chatcmpl-123',
        model: 'gpt-5.1',
        choices: [{ message: { content: 'Test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      }),
    });

    const client = createAIClient({ observability: true });
    await client.chat('Test');
    expect(client.metrics.totalRequests).toBe(1);

    client.metrics.reset();
    expect(client.metrics.totalRequests).toBe(0);
  });

  it('should track cost when available', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'chatcmpl-123',
        model: 'gpt-5.1',
        choices: [{ message: { content: 'Test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      }),
    });

    const client = createAIClient({ observability: true });
    await client.chat('Test');

    // Cost tracking depends on provider implementation
    expect(client.metrics.totalCost).toBeGreaterThanOrEqual(0);
  });
});

describe('AI Client Extended Features', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('should extend client and then extend again', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'chatcmpl-123',
        model: 'gpt-5.1',
        choices: [{ message: { content: 'Nested extend' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });

    const client = createAIClient();
    const level1 = client.extend({ systemPrompt: 'Level 1' });
    const level2 = level1.extend({ temperature: 0.5 });

    const response = await level2.chat({ messages: [{ role: 'user', content: 'Hi' }] });
    expect(response.content).toBe('Nested extend');
  });

  it('should use extended stream method', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"id":"1","choices":[{"delta":{"content":"Hi"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce({ ok: true, body: stream });

    const client = createAIClient();
    const extended = client.extend({ temperature: 0.7 });
    const result = await extended.stream({ messages: [{ role: 'user', content: 'Hi' }] });

    const events: any[] = [];
    for await (const event of result) {
      events.push(event);
    }
    expect(events.length).toBeGreaterThan(0);
  });

  it('should use extended embed method', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        object: 'list',
        data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2] }],
        model: 'text-embedding-3-large',
        usage: { prompt_tokens: 5, total_tokens: 5 },
      }),
    });

    const client = createAIClient();
    const extended = client.extend({ provider: 'openai' });
    const result = await extended.embed({ input: 'test' });

    expect(result.embeddings).toHaveLength(1);
  });
});

describe('AI Client Retry Logic', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('should retry on rate limit error', async () => {
    let attempts = 0;
    mockFetch.mockImplementation(() => {
      attempts++;
      if (attempts === 1) {
        return Promise.resolve({
          ok: false,
          status: 429,
          headers: new Map([['retry-after', '1']]),
          json: () => Promise.resolve({ error: { message: 'Rate limited' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          model: 'gpt-5.1',
          choices: [{ message: { content: 'Success' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        }),
      });
    });

    const client = createAIClient({
      retry: { maxAttempts: 3, on: ['rate_limit'] }
    });
    const response = await client.chat('Test');

    expect(response.content).toBe('Success');
    expect(attempts).toBe(2);
  });

  it('should call onRetry callback', async () => {
    let attempts = 0;
    let retryCallbackCalled = false;

    mockFetch.mockImplementation(() => {
      attempts++;
      if (attempts === 1) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ error: { message: 'Overloaded' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          model: 'gpt-5.1',
          choices: [{ message: { content: 'Success' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        }),
      });
    });

    const client = createAIClient({
      retry: {
        maxAttempts: 3,
        on: ['overloaded'],
        onRetry: () => { retryCallbackCalled = true; }
      }
    });
    await client.chat('Test');

    expect(retryCallbackCalled).toBe(true);
  });

  it('should use linear backoff strategy', async () => {
    let attempts = 0;
    mockFetch.mockImplementation(() => {
      attempts++;
      if (attempts <= 2) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ error: { message: 'Overloaded' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          model: 'gpt-5.1',
          choices: [{ message: { content: 'Success' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        }),
      });
    });

    const client = createAIClient({
      retry: { maxAttempts: 3, on: ['overloaded'], backoff: 'linear' }
    });
    const response = await client.chat('Test');

    expect(response.content).toBe('Success');
    expect(attempts).toBe(3);
  });

  it('should use decorrelated backoff strategy', async () => {
    let attempts = 0;
    mockFetch.mockImplementation(() => {
      attempts++;
      if (attempts === 1) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ error: { message: 'Overloaded' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          model: 'gpt-5.1',
          choices: [{ message: { content: 'Success' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        }),
      });
    });

    const client = createAIClient({
      retry: { maxAttempts: 3, on: ['overloaded'], backoff: 'decorrelated' }
    });
    const response = await client.chat('Test');

    expect(response.content).toBe('Success');
  });

  it('should throw after max retries exhausted', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ error: { message: 'Overloaded' } }),
    });

    const client = createAIClient({
      retry: { maxAttempts: 2, on: ['overloaded'] }
    });

    await expect(client.chat('Test')).rejects.toThrow();
  });

  it('should not retry on non-retryable errors', async () => {
    let attempts = 0;
    mockFetch.mockImplementation(() => {
      attempts++;
      return Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: { message: 'Bad request' } }),
      });
    });

    const client = createAIClient({
      retry: { maxAttempts: 3, on: ['rate_limit'] }
    });

    try {
      await client.chat('Test');
    } catch (e) {
      // Expected
    }

    expect(attempts).toBe(1); // Should not retry on 400
  });

  it('should log retry attempts when debug enabled', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    let attempts = 0;

    mockFetch.mockImplementation(() => {
      attempts++;
      if (attempts === 1) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ error: { message: 'Overloaded' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          model: 'gpt-5.1',
          choices: [{ message: { content: 'Success' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        }),
      });
    });

    const client = createAIClient({
      debug: true,
      retry: { maxAttempts: 3, on: ['overloaded'] }
    });
    await client.chat('Test');

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('OpenAI Provider Error Handling', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('should handle context length exceeded error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({
        error: { code: 'context_length_exceeded', message: 'Context too long' }
      }),
    });

    const provider = new OpenAIProvider();
    await expect(provider.chat({
      messages: [{ role: 'user', content: 'Very long message...' }]
    })).rejects.toThrow('Context length exceeded');
  });

  it('should throw authentication error on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: 'Invalid API key' } }),
    });

    const provider = new OpenAIProvider();
    await expect(provider.chat({
      messages: [{ role: 'user', content: 'Test' }]
    })).rejects.toThrow('Authentication failed');
  });

  it('should handle overloaded error on 529', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 529,
      json: () => Promise.resolve({ error: { message: 'Overloaded' } }),
    });

    const provider = new OpenAIProvider();
    await expect(provider.chat({
      messages: [{ role: 'user', content: 'Test' }]
    })).rejects.toThrow('overloaded');
  });

  it('should handle generic server error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { message: 'Internal error' } }),
    });

    const provider = new OpenAIProvider();
    await expect(provider.chat({
      messages: [{ role: 'user', content: 'Test' }]
    })).rejects.toThrow('Internal error');
  });

  it('should handle JSON parse error gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('Invalid JSON')),
    });

    const provider = new OpenAIProvider();
    await expect(provider.chat({
      messages: [{ role: 'user', content: 'Test' }]
    })).rejects.toThrow();
  });

  it('should handle response format options', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'chatcmpl-123',
        model: 'gpt-5.1',
        choices: [{ message: { content: '{"key": "value"}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      }),
    });

    const provider = new OpenAIProvider();
    const response = await provider.chat({
      messages: [{ role: 'user', content: 'Return JSON' }],
      responseFormat: { type: 'json_object' }
    });

    expect(response.content).toBe('{"key": "value"}');
  });

  it('should include organization header when configured', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'chatcmpl-123',
        model: 'gpt-5.1',
        choices: [{ message: { content: 'Test' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      }),
    });

    const provider = new OpenAIProvider({ organization: 'org-123' });
    await provider.chat({ messages: [{ role: 'user', content: 'Test' }] });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'OpenAI-Organization': 'org-123'
        })
      })
    );
  });
});

describe('Anthropic Provider Error Handling', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('should handle rate limit with retry-after', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Map([['retry-after', '5']]),
      json: () => Promise.resolve({ error: { message: 'Rate limited' } }),
    });

    const provider = new AnthropicProvider();
    await expect(provider.chat({
      messages: [{ role: 'user', content: 'Test' }]
    })).rejects.toThrow('Rate limit exceeded');
  });

  it('should handle overloaded error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 529,
      json: () => Promise.resolve({ error: { message: 'Overloaded' } }),
    });

    const provider = new AnthropicProvider();
    await expect(provider.chat({
      messages: [{ role: 'user', content: 'Test' }]
    })).rejects.toThrow('overloaded');
  });

  it('should throw on embed attempt', async () => {
    const provider = new AnthropicProvider();
    await expect(provider.embed({ input: 'test' }))
      .rejects.toThrow('does not support embeddings');
  });

  it('should include anthropic-version header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Test' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    });

    const provider = new AnthropicProvider();
    await provider.chat({ messages: [{ role: 'user', content: 'Test' }] });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'anthropic-version': expect.any(String)
        })
      })
    );
  });
});

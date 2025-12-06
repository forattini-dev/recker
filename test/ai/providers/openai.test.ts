import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from '../../../src/ai/providers/openai.js';
import { AIError, AuthenticationError, RateLimitError, ContextLengthError, OverloadedError } from '../../../src/ai/providers/base.js';

describe('OpenAIProvider', () => {
  const apiKey = 'test-api-key';
  let provider: OpenAIProvider;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = apiKey;
    provider = new OpenAIProvider();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it('should use correct base URL and headers', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
    })));

    await provider.chat({
      messages: [{ role: 'user', content: 'Hi' }]
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.openai.com/v1/chat/completions'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        })
      })
    );
  });

  it('should use organization header when provided', async () => {
    const orgProvider = new OpenAIProvider({ organization: 'org-xxx' });
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }]
    })));

    await orgProvider.chat({
      messages: [{ role: 'user', content: 'Hi' }]
    });

    const callHeaders = mockFetch.mock.calls[0][1]!.headers as Record<string, string>;
    expect(callHeaders['OpenAI-Organization']).toBe('org-xxx');
  });

  it('should transform messages correctly', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }]
    })));

    await provider.chat({
      messages: [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' }
      ]
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(body.messages).toHaveLength(3);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[2].role).toBe('assistant');
  });

  it('should prepend system prompt when provided via option', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }]
    })));

    await provider.chat({
      messages: [{ role: 'user', content: 'Hello' }],
      systemPrompt: 'You are a helpful assistant'
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe('You are a helpful assistant');
  });

  it('should parse response correctly', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      id: 'chatcmpl-123',
      model: 'gpt-5.1',
      choices: [{
        message: { content: 'Response text', role: 'assistant' },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15
      }
    })));

    const response = await provider.chat({
      messages: [{ role: 'user', content: 'Hi' }]
    });

    expect(response.content).toBe('Response text');
    expect(response.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15
    });
    expect(response.model).toBe('gpt-5.1');
    expect(response.finishReason).toBe('stop');
  });

  it('should handle tool calls in response', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {
          content: null,
          role: 'assistant',
          tool_calls: [{
            id: 'call_123',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location":"London"}'
            }
          }]
        },
        finish_reason: 'tool_calls'
      }]
    })));

    const response = await provider.chat({
      messages: [{ role: 'user', content: 'Weather?' }],
      tools: [{
        type: 'function',
        function: { name: 'get_weather', description: 'Get weather' }
      }]
    });

    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0].function.name).toBe('get_weather');
    expect(JSON.parse(response.toolCalls![0].function.arguments)).toEqual({ location: 'London' });
  });

  describe('generation config', () => {
    it('should pass temperature and maxTokens', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }]
      })));

      await provider.chat({
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: 0.5,
        maxTokens: 100
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.temperature).toBe(0.5);
      expect(body.max_tokens).toBe(100);
    });

    it('should pass topP and stop sequences', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }]
      })));

      await provider.chat({
        messages: [{ role: 'user', content: 'Hi' }],
        topP: 0.9,
        stop: ['END', 'STOP']
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.top_p).toBe(0.9);
      expect(body.stop).toEqual(['END', 'STOP']);
    });

    it('should handle JSON response format', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: '{"result": "ok"}' }, finish_reason: 'stop' }]
      })));

      await provider.chat({
        messages: [{ role: 'user', content: 'Give me JSON' }],
        responseFormat: { type: 'json_object' }
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('should handle JSON schema response format', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: '{"name": "John", "age": 30}' }, finish_reason: 'stop' }]
      })));

      await provider.chat({
        messages: [{ role: 'user', content: 'Generate a user' }],
        responseFormat: {
          type: 'json_schema',
          schema: {
            name: 'user',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: 'number' }
              }
            }
          }
        }
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.response_format.type).toBe('json_schema');
      expect(body.response_format.json_schema).toBeDefined();
    });
  });

  describe('embeddings', () => {
    it('should embed single text', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
        model: 'text-embedding-3-large',
        usage: { prompt_tokens: 5, total_tokens: 5 }
      })));

      const result = await provider.embed({
        input: 'Hello world'
      });

      expect(result.embeddings).toHaveLength(1);
      expect(result.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
      expect(result.model).toBe('text-embedding-3-large');
    });

    it('should pass dimensions option', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        data: [{ embedding: [0.1, 0.2], index: 0 }],
        model: 'text-embedding-3-large',
        usage: { prompt_tokens: 5, total_tokens: 5 }
      })));

      await provider.embed({
        input: 'Hello',
        dimensions: 256
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.dimensions).toBe(256);
    });
  });

  describe('error handling', () => {
    it('should handle 401 authentication error', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        error: { message: 'Invalid API key' }
      }), { status: 401 }));

      await expect(provider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      })).rejects.toThrow(AuthenticationError);
    });

    it('should handle 429 rate limit error', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        error: { message: 'Rate limit exceeded' }
      }), {
        status: 429,
        headers: { 'retry-after': '30' }
      }));

      await expect(provider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      })).rejects.toThrow(RateLimitError);
    });

    it('should handle context length exceeded error', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        error: {
          code: 'context_length_exceeded',
          message: 'This model maximum context length is 8192 tokens'
        }
      }), { status: 400 }));

      await expect(provider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      })).rejects.toThrow(ContextLengthError);
    });

    it('should handle 503 overloaded error', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        error: { message: 'Server overloaded' }
      }), { status: 503 }));

      await expect(provider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      })).rejects.toThrow(OverloadedError);
    });

    it('should handle 529 overloaded error', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        error: { message: 'Server overloaded' }
      }), { status: 529 }));

      await expect(provider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      })).rejects.toThrow(OverloadedError);
    });

    it('should handle generic 500 error', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        error: { message: 'Internal error' }
      }), { status: 500 }));

      await expect(provider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      })).rejects.toThrow(AIError);
    });

    it('should handle error without JSON body', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response('Internal Server Error', {
        status: 500,
        statusText: 'Internal Server Error'
      }));

      await expect(provider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      })).rejects.toThrow(AIError);
    });
  });

  describe('streaming', () => {
    it('should call stream endpoint with stream options', async () => {
      const mockFetch = vi.mocked(fetch);

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      });

      mockFetch.mockResolvedValue(new Response(stream));

      const result = await provider.stream({
        messages: [{ role: 'user', content: 'Hi' }]
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.stream).toBe(true);
      expect(body.stream_options).toEqual({ include_usage: true });
      expect(result).toBeDefined();
    });

    it('should parse text stream events', async () => {
      const mockFetch = vi.mocked(fetch);

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n'));
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" World"},"finish_reason":null}]}\n\n'));
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      });

      mockFetch.mockResolvedValue(new Response(stream));

      const result = await provider.stream({
        messages: [{ role: 'user', content: 'Hi' }]
      });

      const events = [];
      for await (const event of result) {
        events.push(event);
      }

      expect(events.some(e => e.type === 'text' && e.content === 'Hello')).toBe(true);
      expect(events.some(e => e.type === 'text' && e.content === ' World')).toBe(true);
      expect(events.some(e => e.type === 'done')).toBe(true);
    });

    it('should parse usage events in stream', async () => {
      const mockFetch = vi.mocked(fetch);

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'));
          controller.enqueue(encoder.encode('data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":1,"total_tokens":11}}\n\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      });

      mockFetch.mockResolvedValue(new Response(stream));

      const result = await provider.stream({
        messages: [{ role: 'user', content: 'Hi' }]
      });

      const events = [];
      for await (const event of result) {
        events.push(event);
      }

      const usageEvent = events.find(e => e.type === 'usage');
      expect(usageEvent).toBeDefined();
      expect(usageEvent?.usage).toEqual({
        inputTokens: 10,
        outputTokens: 1,
        totalTokens: 11
      });
    });

    it('should parse tool call stream events', async () => {
      const mockFetch = vi.mocked(fetch);

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"get_weather","arguments":""}}]}}]}\n\n'));
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"location\\""}}]}}]}\n\n'));
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"London\\"}"}}]}}]}\n\n'));
          controller.enqueue(encoder.encode('data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      });

      mockFetch.mockResolvedValue(new Response(stream));

      const result = await provider.stream({
        messages: [{ role: 'user', content: 'Weather?' }],
        tools: [{
          type: 'function',
          function: { name: 'get_weather', description: 'Get weather' }
        }]
      });

      const events = [];
      for await (const event of result) {
        events.push(event);
      }

      const toolCallEvent = events.find(e => e.type === 'tool_call');
      expect(toolCallEvent).toBeDefined();
      expect(toolCallEvent?.toolCall?.function.name).toBe('get_weather');

      const toolCallDeltas = events.filter(e => e.type === 'tool_call_delta');
      expect(toolCallDeltas.length).toBeGreaterThan(0);
    });
  });

  describe('multipart content', () => {
    it('should handle text content parts', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }]
      })));

      await provider.chat({
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'What is this?' }
          ]
        }]
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.messages[0].content[0]).toEqual({ type: 'text', text: 'What is this?' });
    });

    it('should handle image_url content', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: 'I see a cat' }, finish_reason: 'stop' }]
      })));

      await provider.chat({
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            { type: 'image_url', image_url: { url: 'https://example.com/cat.jpg', detail: 'high' } }
          ]
        }]
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.messages[0].content[1]).toEqual({
        type: 'image_url',
        image_url: { url: 'https://example.com/cat.jpg', detail: 'high' }
      });
    });

    it('should handle binary image content', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: 'I see pixels' }, finish_reason: 'stop' }]
      })));

      const imageBuffer = Buffer.from('fake-image-data');
      await provider.chat({
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this' },
            { type: 'image', data: imageBuffer, mediaType: 'image/png' }
          ]
        }]
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.messages[0].content[1].type).toBe('image_url');
      expect(body.messages[0].content[1].image_url.url).toContain('data:image/png;base64,');
    });
  });

  describe('tool messages', () => {
    it('should handle tool role messages', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: 'Weather is nice' }, finish_reason: 'stop' }]
      })));

      await provider.chat({
        messages: [
          { role: 'user', content: 'What is the weather?' },
          {
            role: 'assistant',
            content: '',
            tool_calls: [{
              id: 'call_123',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"location":"London"}' }
            }]
          },
          {
            role: 'tool',
            content: '{"temp": "15C"}',
            tool_call_id: 'call_123'
          }
        ]
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.messages[2].role).toBe('tool');
      expect(body.messages[2].tool_call_id).toBe('call_123');
    });
  });

  describe('custom configuration', () => {
    it('should use custom base URL', async () => {
      const customProvider = new OpenAIProvider({ baseUrl: 'https://custom.api.com/v1' });
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }]
      })));

      await customProvider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      });

      expect(mockFetch.mock.calls[0][0]).toContain('custom.api.com');
    });

    it('should use custom default model', async () => {
      const customProvider = new OpenAIProvider({ defaultModel: 'gpt-5-turbo' });
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }]
      })));

      await customProvider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.model).toBe('gpt-5-turbo');
    });

    it('should override default model with request model', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }]
      })));

      await provider.chat({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'gpt-5.1-thinking'
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.model).toBe('gpt-5.1-thinking');
    });
  });

  describe('response edge cases', () => {
    it('should handle empty content', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: null }, finish_reason: 'stop' }]
      })));

      const response = await provider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      });

      expect(response.content).toBe('');
    });

    it('should handle missing usage', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }]
      })));

      const response = await provider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      });

      expect(response.usage.totalTokens).toBe(0);
    });

    it('should handle empty choices', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        choices: []
      })));

      const response = await provider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      });

      expect(response.content).toBe('');
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicProvider } from '../../../src/ai/providers/anthropic.js';
import { AIError, AuthenticationError, RateLimitError, ContextLengthError, OverloadedError } from '../../../src/ai/providers/base.js';

describe('AnthropicProvider', () => {
  let originalEnv: string | undefined;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalEnv = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    if (originalEnv) {
      process.env.ANTHROPIC_API_KEY = originalEnv;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with default config', () => {
      const provider = new AnthropicProvider();
      expect(provider).toBeDefined();
    });

    it('should create provider with custom config', () => {
      const provider = new AnthropicProvider({
        apiKey: 'custom-key',
        baseUrl: 'https://custom.anthropic.com/v1',
        version: '2024-01-01',
      });
      expect(provider).toBeDefined();
    });
  });

  describe('chat', () => {
    it('should make successful chat request', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello!' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new AnthropicProvider();
      const response = await provider.chat({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(response.content).toBe('Hello!');
      expect(response.usage.inputTokens).toBe(10);
      expect(response.usage.outputTokens).toBe(5);
      expect(response.finishReason).toBe('stop');
    });

    it('should include system prompt', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new AnthropicProvider();
      await provider.chat({
        model: 'claude-sonnet-4-20250514',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hi' },
        ],
      });

      const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(calledBody.system).toBe('You are helpful.');
    });

    it('should use systemPrompt option over system message', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new AnthropicProvider();
      await provider.chat({
        model: 'claude-sonnet-4-20250514',
        messages: [
          { role: 'system', content: 'Ignored' },
          { role: 'user', content: 'Hi' },
        ],
        systemPrompt: 'Use this instead',
      });

      const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(calledBody.system).toBe('Use this instead');
    });

    it('should handle tool results', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Done' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new AnthropicProvider();
      await provider.chat({
        model: 'claude-sonnet-4-20250514',
        messages: [
          { role: 'user', content: 'Use the tool' },
          { role: 'tool', content: 'Tool result', tool_call_id: 'tc_123' },
        ],
      });

      const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(calledBody.messages).toHaveLength(2);
      expect(calledBody.messages[1].content[0].type).toBe('tool_result');
    });

    it('should handle tool calls in response', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me check' },
          { type: 'tool_use', id: 'tc_123', name: 'get_weather', input: { city: 'NYC' } },
        ],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 15 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new AnthropicProvider();
      const response = await provider.chat({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'What is the weather?' }],
        tools: [{
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get weather',
            parameters: { type: 'object', properties: { city: { type: 'string' } } },
          },
        }],
      });

      expect(response.content).toBe('Let me check');
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].function.name).toBe('get_weather');
      expect(response.finishReason).toBe('tool_calls');
    });

    it('should handle multimodal content with data URL', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'I see an image' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 5 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new AnthropicProvider();
      await provider.chat({
        model: 'claude-sonnet-4-20250514',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
          ],
        }],
      });

      const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(calledBody.messages[0].content[1].type).toBe('image');
    });

    it('should handle multimodal content with regular URL', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new AnthropicProvider();
      await provider.chat({
        model: 'claude-sonnet-4-20250514',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
          ],
        }],
      });

      const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      // Non-data URLs are converted to text placeholder
      expect(calledBody.messages[0].content[0].type).toBe('text');
    });

    it('should handle raw image content', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new AnthropicProvider();
      await provider.chat({
        model: 'claude-sonnet-4-20250514',
        messages: [{
          role: 'user',
          content: [
            { type: 'image', data: new Uint8Array([1, 2, 3]), mediaType: 'image/png' },
          ],
        }],
      });

      const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(calledBody.messages[0].content[0].type).toBe('image');
    });

    it('should handle tool choice options', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new AnthropicProvider();

      // Test 'auto'
      await provider.chat({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [{ type: 'function', function: { name: 'test', description: 'test' } }],
        toolChoice: 'auto',
      });
      let calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(calledBody.tool_choice).toEqual({ type: 'auto' });

      // Test 'required'
      await provider.chat({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [{ type: 'function', function: { name: 'test', description: 'test' } }],
        toolChoice: 'required',
      });
      calledBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(calledBody.tool_choice).toEqual({ type: 'any' });

      // Test specific tool
      await provider.chat({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [{ type: 'function', function: { name: 'specific_tool', description: 'test' } }],
        toolChoice: { type: 'function', function: { name: 'specific_tool' } },
      });
      calledBody = JSON.parse(mockFetch.mock.calls[2][1].body);
      expect(calledBody.tool_choice).toEqual({ type: 'tool', name: 'specific_tool' });
    });

    it('should handle tool_calls in assistant message', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Done' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new AnthropicProvider();
      await provider.chat({
        model: 'claude-sonnet-4-20250514',
        messages: [{
          role: 'assistant',
          content: 'Let me help',
          tool_calls: [{
            id: 'tc_123',
            type: 'function',
            function: { name: 'search', arguments: '{"query":"test"}' },
          }],
        }],
      });

      const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(calledBody.messages[0].content).toHaveLength(2);
      expect(calledBody.messages[0].content[1].type).toBe('tool_use');
    });
  });

  describe('error handling', () => {
    it('should throw AuthenticationError for 401', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Map(),
        json: () => Promise.resolve({ error: { message: 'Invalid API key' } }),
      });

      const provider = new AnthropicProvider();
      await expect(
        provider.chat({
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow(AuthenticationError);
    });

    it('should throw RateLimitError for 429', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Map([['retry-after', '30']]),
        json: () => Promise.resolve({ error: { message: 'Rate limited' } }),
      });

      const provider = new AnthropicProvider();
      await expect(
        provider.chat({
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow(RateLimitError);
    });

    it('should throw ContextLengthError for context overflow', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Map(),
        json: () => Promise.resolve({
          error: {
            type: 'invalid_request_error',
            message: 'context length exceeded',
          },
        }),
      });

      const provider = new AnthropicProvider();
      await expect(
        provider.chat({
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow(ContextLengthError);
    });

    it('should throw OverloadedError for 503', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Map(),
        json: () => Promise.resolve({ error: { message: 'Overloaded' } }),
      });

      const provider = new AnthropicProvider();
      await expect(
        provider.chat({
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow(OverloadedError);
    });

    it('should throw OverloadedError for 529', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 529,
        statusText: 'Overloaded',
        headers: new Map(),
        json: () => Promise.resolve({ error: { message: 'Overloaded' } }),
      });

      const provider = new AnthropicProvider();
      await expect(
        provider.chat({
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow(OverloadedError);
    });

    it('should handle JSON parse error in error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map(),
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      const provider = new AnthropicProvider();
      await expect(
        provider.chat({
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow(AIError);
    });
  });

  describe('embed', () => {
    it('should throw not supported error', async () => {
      const provider = new AnthropicProvider();
      await expect(
        provider.embed({ input: 'test' })
      ).rejects.toThrow('Anthropic does not support embeddings');
    });
  });

  describe('stream', () => {
    it('should stream text responses', async () => {
      const events = [
        'data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-20250514","stop_reason":null,"usage":{"input_tokens":10,"output_tokens":0}}}',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}',
        'data: {"type":"content_block_stop","index":0}',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}',
        'data: {"type":"message_stop"}',
      ].join('\n');

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(events));
          controller.close();
        },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        body: stream,
      });

      const provider = new AnthropicProvider();
      const aiStream = await provider.stream({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      const chunks: any[] = [];
      for await (const chunk of aiStream) {
        chunks.push(chunk);
      }

      const textChunks = chunks.filter(c => c.type === 'text');
      expect(textChunks.length).toBeGreaterThan(0);
      expect(textChunks.map(c => c.content).join('')).toBe('Hello world');
    });

    it('should stream tool calls', async () => {
      const events = [
        'data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-20250514","stop_reason":null,"usage":{"input_tokens":10,"output_tokens":0}}}',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tc_123","name":"get_weather","input":{}}}',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\""}}',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":":\\"NYC\\"}"}}',
        'data: {"type":"content_block_stop","index":0}',
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":15}}',
      ].join('\n');

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(events));
          controller.close();
        },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        body: stream,
      });

      const provider = new AnthropicProvider();
      const aiStream = await provider.stream({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'What is the weather?' }],
      });

      const chunks: any[] = [];
      for await (const chunk of aiStream) {
        chunks.push(chunk);
      }

      const toolCallChunk = chunks.find(c => c.type === 'tool_call');
      expect(toolCallChunk).toBeDefined();
      expect(toolCallChunk.toolCall.function.name).toBe('get_weather');
    });

    it('should handle stream errors', async () => {
      const events = [
        'data: {"type":"error","error":{"type":"server_error","message":"Internal error"}}',
        '', // Need newline between events
      ].join('\n');

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(events));
          controller.close();
        },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        body: stream,
      });

      const provider = new AnthropicProvider();
      const aiStream = await provider.stream({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      const chunks: any[] = [];
      for await (const chunk of aiStream) {
        chunks.push(chunk);
      }

      const errorChunk = chunks.find(c => c.type === 'error');
      expect(errorChunk).toBeDefined();
      expect(errorChunk.error.message).toBe('Internal error');
    });
  });

  describe('configuration', () => {
    it('should use custom base URL', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new AnthropicProvider({
        baseUrl: 'https://custom-anthropic.example.com/v1',
      });

      await provider.chat({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(mockFetch.mock.calls[0][0]).toBe('https://custom-anthropic.example.com/v1/messages');
    });

    it('should use custom headers', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new AnthropicProvider({
        headers: { 'X-Custom-Header': 'custom-value' },
      });

      await provider.chat({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(mockFetch.mock.calls[0][1].headers['X-Custom-Header']).toBe('custom-value');
    });

    it('should use custom version', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new AnthropicProvider({
        version: '2024-06-01',
      });

      await provider.chat({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(mockFetch.mock.calls[0][1].headers['anthropic-version']).toBe('2024-06-01');
    });

    it('should pass optional parameters', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new AnthropicProvider();
      await provider.chat({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 1000,
        stop: ['END'],
      });

      const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(calledBody.temperature).toBe(0.7);
      expect(calledBody.top_p).toBe(0.9);
      expect(calledBody.max_tokens).toBe(1000);
      expect(calledBody.stop_sequences).toEqual(['END']);
    });
  });
});

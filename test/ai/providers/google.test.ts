import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleProvider } from '../../../src/ai/providers/google.js';
import { AIError } from '../../../src/ai/providers/base.js';

describe('GoogleProvider', () => {
  const apiKey = 'test-api-key';
  let provider: GoogleProvider;

  beforeEach(() => {
    process.env.GOOGLE_API_KEY = apiKey;
    provider = new GoogleProvider();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_API_KEY;
  });

  it('should use correct base URL and API key', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Hello' }] } }]
    })));

    await provider.chat({
      messages: [{ role: 'user', content: 'Hi' }]
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json'
        })
      })
    );
    expect(mockFetch.mock.calls[0][0]).toContain(`key=${apiKey}`);
  });

  it('should transform messages correctly', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({})));

    await provider.chat({
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' }
      ]
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(body.contents).toHaveLength(2);
    expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'Hello' }] });
    expect(body.contents[1]).toEqual({ role: 'model', parts: [{ text: 'Hi there' }] });
  });

  it('should parse response correctly', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ text: 'Response text' }] },
        finishReason: 'STOP'
      }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15
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
    expect(response.finishReason).toBe('stop');
  });

  it('should handle tool calls', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            functionCall: {
              name: 'get_weather',
              args: { location: 'London' }
            }
          }]
        }
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

  it('should handle errors', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: 400,
        message: 'Invalid argument'
      }
    }), { status: 400, statusText: 'Bad Request' }));

    await expect(provider.chat({
      messages: [{ role: 'user', content: 'Hi' }]
    })).rejects.toThrow(AIError);
  });

  describe('message transformation edge cases', () => {
    it('should handle system messages', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Response' }] } }]
      })));

      await provider.chat({
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello' }
        ]
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.systemInstruction).toBeDefined();
      expect(body.systemInstruction.parts[0].text).toBe('You are a helpful assistant');
    });

    it('should handle systemPrompt option', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Response' }] } }]
      })));

      await provider.chat({
        messages: [{ role: 'user', content: 'Hello' }],
        systemPrompt: 'You are a coding assistant'
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.systemInstruction).toBeDefined();
      expect(body.systemInstruction.parts[0].text).toBe('You are a coding assistant');
    });

    it('should handle tool role messages', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Response' }] } }]
      })));

      await provider.chat({
        messages: [
          { role: 'user', content: 'What is the weather?' },
          { role: 'assistant', content: '', tool_calls: [{
            id: 'call_123',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"location":"London"}' }
          }]},
          { role: 'tool', content: '{"temp": "15C"}', name: 'get_weather', tool_call_id: 'call_123' }
        ]
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.contents.length).toBeGreaterThan(0);
    });

    it('should handle multipart content', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Response' }] } }]
      })));

      await provider.chat({
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            { type: 'image', data: Buffer.from('fake-image'), mediaType: 'image/png' }
          ]
        }]
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.contents[0].parts).toHaveLength(2);
      expect(body.contents[0].parts[1].inlineData).toBeDefined();
    });

    it('should handle image_url content type', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Response' }] } }]
      })));

      await provider.chat({
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'What is this?' },
            { type: 'image_url', image_url: { url: 'https://example.com/image.png' } }
          ]
        }]
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.contents[0].parts[1].text).toContain('not supported');
    });

    it('should handle empty content', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Response' }] } }]
      })));

      await provider.chat({
        messages: [{ role: 'user', content: '' }]
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.contents[0].parts[0].text).toBe('');
    });

    it('should handle null content', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Response' }] } }]
      })));

      await provider.chat({
        messages: [{ role: 'user', content: null as any }]
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.contents[0].parts).toBeDefined();
    });
  });

  describe('generation config', () => {
    it('should pass temperature and maxTokens', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Response' }] } }]
      })));

      await provider.chat({
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: 0.5,
        maxTokens: 100
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.generationConfig.temperature).toBe(0.5);
      expect(body.generationConfig.maxOutputTokens).toBe(100);
    });

    it('should pass topP and stop sequences', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Response' }] } }]
      })));

      await provider.chat({
        messages: [{ role: 'user', content: 'Hi' }],
        topP: 0.9,
        stop: ['END', 'STOP']
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.generationConfig.topP).toBe(0.9);
      expect(body.generationConfig.stopSequences).toEqual(['END', 'STOP']);
    });

    it('should handle JSON response format', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"result": "ok"}' }] } }]
      })));

      await provider.chat({
        messages: [{ role: 'user', content: 'Give me JSON' }],
        responseFormat: { type: 'json_object' }
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
      expect(body.generationConfig.responseMimeType).toBe('application/json');
    });
  });

  describe('embeddings', () => {
    it('should embed single text', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        embedding: { values: [0.1, 0.2, 0.3] }
      })));

      const result = await provider.embed({
        input: 'Hello world'
      });

      expect(result.embeddings).toHaveLength(1);
      expect(result.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
      expect(result.model).toBe('text-embedding-004');
    });

    it('should embed batch of texts', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        embeddings: [
          { values: [0.1, 0.2, 0.3] },
          { values: [0.4, 0.5, 0.6] }
        ]
      })));

      const result = await provider.embed({
        input: ['Hello', 'World']
      });

      expect(result.embeddings).toHaveLength(2);
      expect(mockFetch.mock.calls[0][0]).toContain('batchEmbedContents');
    });
  });

  describe('error handling', () => {
    it('should handle 429 rate limit error', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response('{}', { status: 429 }));

      await expect(provider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      })).rejects.toThrow();
    });

    it('should handle 503 overloaded error', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response('{}', { status: 503 }));

      await expect(provider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      })).rejects.toThrow();
    });

    it('should handle 500 server error', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response('{}', { status: 500 }));

      await expect(provider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      })).rejects.toThrow();
    });

    it('should handle error response without JSON', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response('Invalid JSON', { status: 500 }));

      await expect(provider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      })).rejects.toThrow();
    });
  });

  describe('streaming', () => {
    it('should call stream endpoint', async () => {
      const mockFetch = vi.mocked(fetch);

      // Create a mock ReadableStream
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      });

      mockFetch.mockResolvedValue(new Response(stream));

      const result = await provider.stream({
        messages: [{ role: 'user', content: 'Hi' }]
      });

      expect(mockFetch.mock.calls[0][0]).toContain('streamGenerateContent');
      expect(mockFetch.mock.calls[0][0]).toContain('alt=sse');
      expect(result).toBeDefined();
    });
  });

  describe('response parsing edge cases', () => {
    it('should handle empty candidates', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        candidates: []
      })));

      const response = await provider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      });

      expect(response.content).toBe('');
    });

    it('should handle missing usageMetadata', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Response' }] } }]
      })));

      const response = await provider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      });

      expect(response.usage.totalTokens).toBe(0);
    });

    it('should handle multiple text parts', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [
              { text: 'Part 1' },
              { text: ' Part 2' }
            ]
          }
        }]
      })));

      const response = await provider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      });

      expect(response.content).toBe('Part 1 Part 2');
    });

    it('should handle non-STOP finish reason', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        candidates: [{
          content: { parts: [{ text: 'Response' }] },
          finishReason: 'MAX_TOKENS'
        }]
      })));

      const response = await provider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      });

      expect(response.finishReason).toBe('length');
    });
  });

  describe('config options', () => {
    it('should use custom apiVersion', async () => {
      const customProvider = new GoogleProvider({ apiVersion: 'v1' });
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Response' }] } }]
      })));

      await customProvider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      });

      expect(mockFetch.mock.calls[0][0]).toContain('v1/models');
    });

    it('should use custom baseUrl', async () => {
      const customProvider = new GoogleProvider({ baseUrl: 'https://custom.api.com' });
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Response' }] } }]
      })));

      await customProvider.chat({
        messages: [{ role: 'user', content: 'Hi' }]
      });

      expect(mockFetch.mock.calls[0][0]).toContain('custom.api.com');
    });

    it('should use custom model', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Response' }] } }]
      })));

      await provider.chat({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'gemini-1.5-pro'
      });

      expect(mockFetch.mock.calls[0][0]).toContain('gemini-1.5-pro');
    });
  });
});

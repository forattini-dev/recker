import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider } from '../../../src/ai/providers/ollama.js';
import { AIError } from '../../../src/ai/providers/base.js';

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    provider = new OllamaProvider({ baseUrl: 'http://localhost:11434/api' });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should use correct endpoints', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      model: 'llama3',
      message: { role: 'assistant', content: 'Hello' },
      done: true
    })));

    await provider.chat({
      messages: [{ role: 'user', content: 'Hi' }]
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"stream":false')
      })
    );
  });

  it('should parse chat response correctly', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      model: 'llama3',
      created_at: '2023-01-01T00:00:00Z',
      message: { role: 'assistant', content: 'Response content' },
      done: true,
      prompt_eval_count: 10,
      eval_count: 20
    })));

    const response = await provider.chat({
      messages: [{ role: 'user', content: 'Hi' }]
    });

    expect(response.content).toBe('Response content');
    expect(response.usage).toEqual({
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30
    });
  });

  it('should generate embeddings', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      embedding: [0.1, 0.2, 0.3], // Old API format, or verify logic for new API
      embeddings: [[0.1, 0.2, 0.3]], // New API format
      prompt_eval_count: 5
    })));

    const response = await provider.embed({
      input: 'text'
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/embed',
      expect.anything()
    );
    expect(response.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
    expect(response.usage.inputTokens).toBe(5);
  });

  it('should handle streaming (NDJSON)', async () => {
    const streamData = [
      JSON.stringify({ model: 'llama3', message: { content: 'Hello' }, done: false }),
      JSON.stringify({ model: 'llama3', message: { content: ' World' }, done: false }),
      JSON.stringify({ model: 'llama3', message: { content: '' }, done: true, eval_count: 5 })
    ].join('\n');

    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(new Response(streamData));

    const stream = await provider.stream({
      messages: [{ role: 'user', content: 'Hi' }]
    });

    const events = [];
    for await (const event of stream) {
      events.push(event);
    }

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: 'text', content: 'Hello' });
    expect(events[1]).toEqual({ type: 'text', content: ' World' });
    expect(events[2].type).toBe('done');
    // @ts-ignore
    expect(events[2].usage.outputTokens).toBe(5);
  });
});

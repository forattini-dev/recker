/**
 * ClientAI Implementation Tests
 *
 * Tests for the ClientAI class integrated into HTTP Client
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ClientAIImpl, AIConfigurationError } from '../../src/ai/client-ai.js';
import type { PresetAIConfig } from '../../src/types/ai-client.js';
import type { Client } from '../../src/core/client.js';

// Mock client for testing
function createMockClient(postResponse: unknown = {}) {
  return {
    post: vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue(postResponse),
      raw: {
        body: {
          getReader: vi.fn().mockReturnValue({
            read: vi.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'),
              })
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":" world"}}]}\n\n'),
              })
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"finish_reason":"stop"}]}\n\n'),
              })
              .mockResolvedValueOnce({ done: true }),
            releaseLock: vi.fn(),
          }),
        },
      },
    }),
  } as unknown as Client;
}

// Sample OpenAI response
const sampleOpenAIResponse = {
  choices: [
    {
      message: { content: 'Hello! How can I help you?' },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 8,
    total_tokens: 18,
  },
  model: 'gpt-4o',
};

// Sample Anthropic response
const sampleAnthropicResponse = {
  content: [{ type: 'text', text: 'Hello from Claude!' }],
  usage: { input_tokens: 12, output_tokens: 6 },
  model: 'claude-sonnet-4-20250514',
  stop_reason: 'end_turn',
};

// Sample Google response
const sampleGoogleResponse = {
  candidates: [
    {
      content: { parts: [{ text: 'Hello from Gemini!' }] },
      finishReason: 'STOP',
    },
  ],
  usageMetadata: {
    promptTokenCount: 15,
    candidatesTokenCount: 5,
    totalTokenCount: 20,
  },
};

// Sample Cohere response
const sampleCohereResponse = {
  text: 'Hello from Cohere!',
  meta: { tokens: { input_tokens: 8, output_tokens: 4 } },
  finish_reason: 'COMPLETE',
};

describe('ClientAIImpl', () => {
  let ai: ClientAIImpl;
  let mockClient: Client;
  let config: PresetAIConfig;

  beforeEach(() => {
    config = {
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'test-key',
    };
    mockClient = createMockClient(sampleOpenAIResponse);
    ai = new ClientAIImpl(mockClient, config);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create with config', () => {
      expect(ai.provider).toBe('openai');
      expect(ai.model).toBe('gpt-4o');
    });

    it('should initialize memory', () => {
      expect(ai.getMemory()).toHaveLength(0);
    });

    it('should use memory config from preset', () => {
      const configWithMemory: PresetAIConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        memory: { maxPairs: 5, systemPrompt: 'You are helpful' },
      };
      ai = new ClientAIImpl(mockClient, configWithMemory);
      const memConfig = ai.getMemoryConfig();
      expect(memConfig.maxPairs).toBe(5);
      expect(memConfig.systemPrompt).toBe('You are helpful');
    });
  });

  describe('provider property', () => {
    it('should return the provider from config', () => {
      expect(ai.provider).toBe('openai');
    });
  });

  describe('model property', () => {
    it('should return the model from config', () => {
      expect(ai.model).toBe('gpt-4o');
    });
  });

  describe('chat()', () => {
    it('should send request and return response', async () => {
      const response = await ai.chat('Hello!');
      expect(response.content).toBe('Hello! How can I help you?');
      expect(response.provider).toBe('openai');
    });

    it('should include token usage', async () => {
      const response = await ai.chat('Hello!');
      expect(response.usage.inputTokens).toBe(10);
      expect(response.usage.outputTokens).toBe(8);
      expect(response.usage.totalTokens).toBe(18);
    });

    it('should record message in memory', async () => {
      await ai.chat('Hello!');
      const memory = ai.getMemory();
      expect(memory).toHaveLength(2);
      expect(memory[0].role).toBe('user');
      expect(memory[0].content).toBe('Hello!');
      expect(memory[1].role).toBe('assistant');
      expect(memory[1].content).toBe('Hello! How can I help you?');
    });

    it('should include conversation history in subsequent calls', async () => {
      await ai.chat('Hello!');
      await ai.chat('How are you?');

      const postCalls = (mockClient.post as ReturnType<typeof vi.fn>).mock.calls;
      const secondCallBody = postCalls[1][1].json;

      // Should have 3 messages: previous user + assistant + new user
      expect(secondCallBody.messages).toHaveLength(3);
    });

    it('should calculate latency', async () => {
      const response = await ai.chat('Hello!');
      expect(response.latency).toBeDefined();
      expect(response.latency.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('prompt()', () => {
    it('should send request without memory', async () => {
      await ai.chat('First message'); // Add to memory
      await ai.prompt('Standalone query');

      const postCalls = (mockClient.post as ReturnType<typeof vi.fn>).mock.calls;
      const promptCallBody = postCalls[1][1].json;

      // prompt() should only have 1 message (no history)
      expect(promptCallBody.messages).toHaveLength(1);
      expect(promptCallBody.messages[0].content).toBe('Standalone query');
    });

    it('should not affect memory', async () => {
      await ai.chat('Chat message');
      await ai.prompt('Prompt message');

      const memory = ai.getMemory();
      // Only chat message pair should be in memory
      expect(memory).toHaveLength(2);
      expect(memory[0].content).toBe('Chat message');
    });

    it('should return response', async () => {
      const response = await ai.prompt('Hello!');
      expect(response.content).toBe('Hello! How can I help you?');
    });
  });

  describe('clearMemory()', () => {
    it('should clear conversation history', async () => {
      await ai.chat('Hello!');
      expect(ai.getMemory()).toHaveLength(2);

      ai.clearMemory();
      expect(ai.getMemory()).toHaveLength(0);
    });
  });

  describe('getMemory()', () => {
    it('should return readonly array', async () => {
      await ai.chat('Hello!');
      const memory = ai.getMemory();
      expect(Array.isArray(memory)).toBe(true);
    });
  });

  describe('setMemoryConfig()', () => {
    it('should update memory config', () => {
      ai.setMemoryConfig({ maxPairs: 5 });
      expect(ai.getMemoryConfig().maxPairs).toBe(5);
    });
  });

  describe('getMemoryConfig()', () => {
    it('should return memory config', () => {
      const config = ai.getMemoryConfig();
      expect(config.maxPairs).toBe(12); // default
    });
  });

  describe('OpenAI provider', () => {
    it('should build correct request body', async () => {
      await ai.chat('Hello!');

      const postCall = (mockClient.post as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(postCall[0]).toBe('/chat/completions');
      expect(postCall[1].json.model).toBe('gpt-4o');
      expect(postCall[1].json.messages).toBeDefined();
    });

    it('should parse response correctly', async () => {
      const response = await ai.chat('Hello!');
      expect(response.content).toBe('Hello! How can I help you?');
      expect(response.model).toBe('gpt-4o');
      expect(response.finishReason).toBe('stop');
    });
  });

  describe('Anthropic provider', () => {
    beforeEach(() => {
      config = {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        apiKey: 'test-key',
      };
      mockClient = createMockClient(sampleAnthropicResponse);
      ai = new ClientAIImpl(mockClient, config);
    });

    it('should build correct request body', async () => {
      await ai.chat('Hello!');

      const postCall = (mockClient.post as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(postCall[0]).toBe('/messages');
      expect(postCall[1].json.model).toBe('claude-sonnet-4-20250514');
      expect(postCall[1].json.max_tokens).toBe(4096);
    });

    it('should handle system prompt separately', async () => {
      ai.setMemoryConfig({ systemPrompt: 'You are helpful' });
      await ai.chat('Hello!');

      const postCall = (mockClient.post as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(postCall[1].json.system).toBe('You are helpful');
    });

    it('should parse response correctly', async () => {
      const response = await ai.chat('Hello!');
      expect(response.content).toBe('Hello from Claude!');
      expect(response.provider).toBe('anthropic');
      expect(response.finishReason).toBe('stop');
    });
  });

  describe('Google provider', () => {
    beforeEach(() => {
      config = {
        provider: 'google',
        model: 'gemini-2.5-flash',
        apiKey: 'test-key',
      };
      mockClient = createMockClient(sampleGoogleResponse);
      ai = new ClientAIImpl(mockClient, config);
    });

    it('should build correct request body', async () => {
      await ai.chat('Hello!');

      const postCall = (mockClient.post as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(postCall[0]).toBe('/models/gemini-2.5-flash:generateContent');
      expect(postCall[1].json.contents).toBeDefined();
      expect(postCall[1].json.generationConfig).toBeDefined();
    });

    it('should transform message format to Google style', async () => {
      await ai.chat('Hello!');

      const postCall = (mockClient.post as ReturnType<typeof vi.fn>).mock.calls[0];
      const contents = postCall[1].json.contents;
      expect(contents[0].role).toBe('user');
      expect(contents[0].parts[0].text).toBe('Hello!');
    });

    it('should parse response correctly', async () => {
      const response = await ai.chat('Hello!');
      expect(response.content).toBe('Hello from Gemini!');
      expect(response.provider).toBe('google');
      expect(response.finishReason).toBe('stop');
    });
  });

  describe('Cohere provider', () => {
    beforeEach(() => {
      config = {
        provider: 'cohere',
        model: 'command-r-plus',
        apiKey: 'test-key',
      };
      mockClient = createMockClient(sampleCohereResponse);
      ai = new ClientAIImpl(mockClient, config);
    });

    it('should build correct request body', async () => {
      await ai.chat('Hello!');

      const postCall = (mockClient.post as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(postCall[0]).toBe('/chat');
      expect(postCall[1].json.model).toBe('command-r-plus');
      expect(postCall[1].json.message).toBe('Hello!');
    });

    it('should include chat_history for follow-up messages', async () => {
      await ai.chat('Hello!');
      await ai.chat('Follow up');

      const postCall = (mockClient.post as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(postCall[1].json.chat_history).toBeDefined();
      expect(postCall[1].json.chat_history).toHaveLength(2);
    });

    it('should parse response correctly', async () => {
      const response = await ai.chat('Hello!');
      expect(response.content).toBe('Hello from Cohere!');
      expect(response.provider).toBe('cohere');
      expect(response.finishReason).toBe('stop');
    });
  });

  describe('OpenAI-compatible providers', () => {
    const compatibleProviders = [
      'groq',
      'mistral',
      'together',
      'perplexity',
      'deepseek',
      'fireworks',
      'xai',
    ] as const;

    for (const provider of compatibleProviders) {
      it(`should use OpenAI format for ${provider}`, async () => {
        config = {
          provider,
          model: 'test-model',
          apiKey: 'test-key',
        };
        mockClient = createMockClient(sampleOpenAIResponse);
        ai = new ClientAIImpl(mockClient, config);

        await ai.chat('Hello!');

        const postCall = (mockClient.post as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(postCall[0]).toBe('/chat/completions');
        expect(postCall[1].json.messages).toBeDefined();
      });
    }
  });

  describe('streaming', () => {
    it('should return async iterator for chatStream', async () => {
      const stream = await ai.chatStream('Hello!');
      expect(stream[Symbol.asyncIterator]).toBeDefined();
    });

    it('should return async iterator for promptStream', async () => {
      const stream = await ai.promptStream('Hello!');
      expect(stream[Symbol.asyncIterator]).toBeDefined();
    });

    it('should yield text events from chatStream', async () => {
      const stream = await ai.chatStream('Hello!');
      const events = [];

      for await (const event of stream) {
        events.push(event);
      }

      const textEvents = events.filter(e => e.type === 'text');
      expect(textEvents).toHaveLength(2);
      expect(textEvents[0].content).toBe('Hello');
      expect(textEvents[1].content).toBe(' world');
    });

    it('should record streamed response in memory for chatStream', async () => {
      const stream = await ai.chatStream('Hello!');

      // Consume the stream
      for await (const _ of stream) {
        // Consume
      }

      const memory = ai.getMemory();
      expect(memory).toHaveLength(2);
      expect(memory[1].content).toBe('Hello world');
    });

    it('should NOT record streamed response in memory for promptStream', async () => {
      await ai.chat('Setup'); // Add something to memory first

      const stream = await ai.promptStream('Standalone');
      for await (const _ of stream) {
        // Consume
      }

      const memory = ai.getMemory();
      // Should only have the chat pair, not the prompt
      expect(memory).toHaveLength(2);
    });
  });

  describe('extra headers', () => {
    it('should include headers from config', async () => {
      config = {
        provider: 'openai',
        model: 'gpt-4o',
        headers: { 'X-Custom': 'value' },
      };
      mockClient = createMockClient(sampleOpenAIResponse);
      ai = new ClientAIImpl(mockClient, config);

      await ai.chat('Hello!');

      const postCall = (mockClient.post as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(postCall[1].headers['X-Custom']).toBe('value');
    });
  });

  describe('endpoint resolution', () => {
    it('should use correct endpoint for each provider', async () => {
      const providers: Array<{ provider: PresetAIConfig['provider']; endpoint: string }> = [
        { provider: 'openai', endpoint: '/chat/completions' },
        { provider: 'anthropic', endpoint: '/messages' },
        { provider: 'groq', endpoint: '/chat/completions' },
        { provider: 'mistral', endpoint: '/chat/completions' },
        { provider: 'cohere', endpoint: '/chat' },
        { provider: 'ollama', endpoint: '/api/chat' },
      ];

      for (const { provider, endpoint } of providers) {
        const testConfig: PresetAIConfig = {
          provider,
          model: 'test-model',
        };
        const testClient = createMockClient(sampleOpenAIResponse);
        const testAi = new ClientAIImpl(testClient, testConfig);

        await testAi.chat('Hello!');

        const postCall = (testClient.post as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(postCall[0]).toBe(endpoint);
      }
    });

    it('should replace model placeholder in Google endpoint', async () => {
      config = {
        provider: 'google',
        model: 'gemini-2.5-pro',
      };
      mockClient = createMockClient(sampleGoogleResponse);
      ai = new ClientAIImpl(mockClient, config);

      await ai.chat('Hello!');

      const postCall = (mockClient.post as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(postCall[0]).toBe('/models/gemini-2.5-pro:generateContent');
    });
  });
});

describe('AIConfigurationError', () => {
  it('should have correct name', () => {
    const error = new AIConfigurationError('Test error');
    expect(error.name).toBe('AIConfigurationError');
  });

  it('should have message', () => {
    const error = new AIConfigurationError('Test error');
    expect(error.message).toBe('Test error');
  });

  it('should be instanceof Error', () => {
    const error = new AIConfigurationError('Test error');
    expect(error instanceof Error).toBe(true);
  });
});

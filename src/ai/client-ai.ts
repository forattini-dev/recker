/**
 * Client AI Implementation
 *
 * AI features integrated into the HTTP Client.
 * Provides chat() with memory and prompt() without memory.
 */

import type {
  AIProvider,
  AIResponse,
  AIStream,
  ChatMessage,
  ChatOptions,
  StreamEvent,
  TokenUsage,
  AILatency,
} from '../types/ai.js';
import type { ClientAI, PresetAIConfig, AIMemoryConfig } from '../types/ai-client.js';
import { ConversationMemory } from './memory.js';
import type { Client } from '../core/client.js';

/**
 * Configuration Error for AI features
 */
export class AIConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIConfigurationError';
  }
}

/**
 * Endpoint configurations per provider
 */
const PROVIDER_ENDPOINTS: Record<AIProvider, string> = {
  openai: '/chat/completions',
  anthropic: '/messages',
  google: '/models/{model}:generateContent',
  groq: '/chat/completions',
  mistral: '/chat/completions',
  cohere: '/chat',
  together: '/chat/completions',
  perplexity: '/chat/completions',
  deepseek: '/chat/completions',
  fireworks: '/chat/completions',
  xai: '/chat/completions',
  replicate: '/predictions',
  huggingface: '/models/{model}/v1/chat/completions',
  ollama: '/api/chat',
  'azure-openai': '/chat/completions',
  'cloudflare-workers-ai': '/ai/run/@cf/meta/llama-2-7b-chat-int8',
  custom: '/chat/completions',
};

/**
 * ClientAI Implementation
 *
 * Integrates AI capabilities into the HTTP Client.
 */
export class ClientAIImpl implements ClientAI {
  private readonly client: Client;
  private readonly config: PresetAIConfig;
  private readonly memory: ConversationMemory;

  constructor(client: Client, config: PresetAIConfig) {
    this.client = client;
    this.config = config;
    this.memory = new ConversationMemory(config.memory);
  }

  /**
   * Get the AI provider name
   */
  get provider(): AIProvider {
    return this.config.provider;
  }

  /**
   * Get the current model
   */
  get model(): string {
    return this.config.model;
  }

  /**
   * Chat with memory
   */
  async chat(prompt: string): Promise<AIResponse> {
    // Build messages with memory context
    const messages = this.memory.buildMessages(prompt);

    // Make the request
    const response = await this.makeRequest(messages, false);

    // Record the response in memory
    this.memory.recordResponse(response.content);

    return response;
  }

  /**
   * Stream chat with memory
   */
  async chatStream(prompt: string): Promise<AIStream> {
    const messages = this.memory.buildMessages(prompt);
    const stream = await this.makeStreamRequest(messages);

    // Wrap to record response after streaming completes
    return this.wrapStreamWithMemory(stream);
  }

  /**
   * Prompt without memory (single-shot)
   */
  async prompt(prompt: string): Promise<AIResponse> {
    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
    return this.makeRequest(messages, false);
  }

  /**
   * Stream prompt without memory
   */
  async promptStream(prompt: string): Promise<AIStream> {
    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
    return this.makeStreamRequest(messages);
  }

  /**
   * Clear conversation memory
   */
  clearMemory(): void {
    this.memory.clear();
  }

  /**
   * Get current conversation history
   */
  getMemory(): readonly ChatMessage[] {
    return this.memory.getConversation();
  }

  /**
   * Update memory configuration
   */
  setMemoryConfig(config: Partial<AIMemoryConfig>): void {
    this.memory.setConfig(config);
  }

  /**
   * Get current memory configuration
   */
  getMemoryConfig(): AIMemoryConfig {
    return this.memory.getConfig();
  }

  /**
   * Make a non-streaming request
   */
  private async makeRequest(messages: ChatMessage[], stream: false): Promise<AIResponse> {
    const startTime = performance.now();
    const body = this.buildRequestBody(messages, stream);
    const endpoint = this.getEndpoint();

    const response = await this.client.post(endpoint, {
      json: body,
      headers: this.getExtraHeaders(),
    });

    const data = await response.json();
    return this.parseResponse(data, startTime);
  }

  /**
   * Make a streaming request
   */
  private async makeStreamRequest(messages: ChatMessage[]): Promise<AIStream> {
    const body = this.buildRequestBody(messages, true);
    const endpoint = this.getEndpoint();

    const response = await this.client.post(endpoint, {
      json: body,
      headers: this.getExtraHeaders(),
    });

    return this.parseSSEStream(response.raw);
  }

  /**
   * Build request body based on provider
   */
  private buildRequestBody(messages: ChatMessage[], stream: boolean): Record<string, unknown> {
    const provider = this.config.provider;

    // Anthropic has different format
    if (provider === 'anthropic') {
      return this.buildAnthropicBody(messages, stream);
    }

    // Google Gemini has different format
    if (provider === 'google') {
      return this.buildGoogleBody(messages, stream);
    }

    // Cohere has different format
    if (provider === 'cohere') {
      return this.buildCohereBody(messages, stream);
    }

    // OpenAI-compatible format (most providers)
    return {
      model: this.config.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream,
      ...(stream && { stream_options: { include_usage: true } }),
    };
  }

  /**
   * Build Anthropic request body
   */
  private buildAnthropicBody(messages: ChatMessage[], stream: boolean): Record<string, unknown> {
    // Separate system message
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    return {
      model: this.config.model,
      max_tokens: 4096,
      system: systemMessages.map(m => m.content).join('\n') || undefined,
      messages: otherMessages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      stream,
    };
  }

  /**
   * Build Google Gemini request body
   */
  private buildGoogleBody(messages: ChatMessage[], stream: boolean): Record<string, unknown> {
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages
      .filter(m => m.role === 'system')
      .map(m => m.content)
      .join('\n');

    return {
      contents,
      ...(systemInstruction && {
        systemInstruction: { parts: [{ text: systemInstruction }] },
      }),
      generationConfig: {
        maxOutputTokens: 4096,
      },
    };
  }

  /**
   * Build Cohere request body
   */
  private buildCohereBody(messages: ChatMessage[], stream: boolean): Record<string, unknown> {
    // Cohere uses chat_history and message format
    const chatHistory = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'CHATBOT' : 'USER',
      message: m.content,
    }));

    const lastMessage = messages[messages.length - 1];

    return {
      model: this.config.model,
      message: typeof lastMessage.content === 'string' ? lastMessage.content : '',
      chat_history: chatHistory.length > 0 ? chatHistory : undefined,
      stream,
    };
  }

  /**
   * Get endpoint for the provider
   */
  private getEndpoint(): string {
    let endpoint = PROVIDER_ENDPOINTS[this.config.provider] || '/chat/completions';

    // Replace placeholders
    endpoint = endpoint.replace('{model}', this.config.model);

    return endpoint;
  }

  /**
   * Get extra headers for specific providers
   */
  private getExtraHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    // Add config headers
    if (this.config.headers) {
      Object.assign(headers, this.config.headers);
    }

    return headers;
  }

  /**
   * Parse response based on provider
   */
  private parseResponse(data: unknown, startTime: number): AIResponse {
    const provider = this.config.provider;
    const endTime = performance.now();

    if (provider === 'anthropic') {
      return this.parseAnthropicResponse(data, startTime, endTime);
    }

    if (provider === 'google') {
      return this.parseGoogleResponse(data, startTime, endTime);
    }

    if (provider === 'cohere') {
      return this.parseCohereResponse(data, startTime, endTime);
    }

    // OpenAI-compatible
    return this.parseOpenAIResponse(data, startTime, endTime);
  }

  /**
   * Parse OpenAI-compatible response
   */
  private parseOpenAIResponse(data: unknown, startTime: number, endTime: number): AIResponse {
    const d = data as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      model?: string;
    };

    const content = d.choices?.[0]?.message?.content || '';
    const usage: TokenUsage = {
      inputTokens: d.usage?.prompt_tokens || 0,
      outputTokens: d.usage?.completion_tokens || 0,
      totalTokens: d.usage?.total_tokens || 0,
    };

    return {
      content,
      usage,
      latency: this.buildLatency(startTime, endTime, usage.outputTokens),
      model: d.model || this.config.model,
      provider: this.config.provider,
      cached: false,
      finishReason: d.choices?.[0]?.finish_reason as AIResponse['finishReason'],
      raw: data,
    };
  }

  /**
   * Parse Anthropic response
   */
  private parseAnthropicResponse(data: unknown, startTime: number, endTime: number): AIResponse {
    const d = data as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
      stop_reason?: string;
    };

    const textContent = d.content?.find(c => c.type === 'text');
    const content = textContent?.text || '';
    const usage: TokenUsage = {
      inputTokens: d.usage?.input_tokens || 0,
      outputTokens: d.usage?.output_tokens || 0,
      totalTokens: (d.usage?.input_tokens || 0) + (d.usage?.output_tokens || 0),
    };

    return {
      content,
      usage,
      latency: this.buildLatency(startTime, endTime, usage.outputTokens),
      model: d.model || this.config.model,
      provider: 'anthropic',
      cached: false,
      finishReason: d.stop_reason === 'end_turn' ? 'stop' : undefined,
      raw: data,
    };
  }

  /**
   * Parse Google Gemini response
   */
  private parseGoogleResponse(data: unknown, startTime: number, endTime: number): AIResponse {
    const d = data as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    };

    const content = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usage: TokenUsage = {
      inputTokens: d.usageMetadata?.promptTokenCount || 0,
      outputTokens: d.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: d.usageMetadata?.totalTokenCount || 0,
    };

    return {
      content,
      usage,
      latency: this.buildLatency(startTime, endTime, usage.outputTokens),
      model: this.config.model,
      provider: 'google',
      cached: false,
      finishReason: d.candidates?.[0]?.finishReason === 'STOP' ? 'stop' : undefined,
      raw: data,
    };
  }

  /**
   * Parse Cohere response
   */
  private parseCohereResponse(data: unknown, startTime: number, endTime: number): AIResponse {
    const d = data as {
      text?: string;
      meta?: { tokens?: { input_tokens?: number; output_tokens?: number } };
      finish_reason?: string;
    };

    const content = d.text || '';
    const usage: TokenUsage = {
      inputTokens: d.meta?.tokens?.input_tokens || 0,
      outputTokens: d.meta?.tokens?.output_tokens || 0,
      totalTokens: (d.meta?.tokens?.input_tokens || 0) + (d.meta?.tokens?.output_tokens || 0),
    };

    return {
      content,
      usage,
      latency: this.buildLatency(startTime, endTime, usage.outputTokens),
      model: this.config.model,
      provider: 'cohere',
      cached: false,
      finishReason: d.finish_reason === 'COMPLETE' ? 'stop' : undefined,
      raw: data,
    };
  }

  /**
   * Build latency object
   */
  private buildLatency(startTime: number, endTime: number, outputTokens: number): AILatency {
    const total = endTime - startTime;
    return {
      ttft: total, // For non-streaming, TTFT is the full time
      tps: outputTokens > 0 ? (outputTokens / (total / 1000)) : 0,
      total,
    };
  }

  /**
   * Parse SSE stream from response
   */
  private async *parseSSEStream(response: Response): AIStream {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let firstChunkTime: number | undefined;
    const startTime = performance.now();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();

          if (!trimmed || trimmed === 'data: [DONE]') {
            continue;
          }

          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            try {
              const event = this.parseStreamChunk(jsonStr);
              if (event) {
                if (!firstChunkTime && event.type === 'text') {
                  firstChunkTime = performance.now();
                }
                yield event;
              }
            } catch {
              // Skip invalid JSON chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Parse a single stream chunk based on provider
   */
  private parseStreamChunk(jsonStr: string): StreamEvent | null {
    const data = JSON.parse(jsonStr);
    const provider = this.config.provider;

    if (provider === 'anthropic') {
      return this.parseAnthropicStreamChunk(data);
    }

    // OpenAI-compatible
    return this.parseOpenAIStreamChunk(data);
  }

  /**
   * Parse OpenAI stream chunk
   */
  private parseOpenAIStreamChunk(data: {
    choices?: Array<{
      delta?: { content?: string };
      finish_reason?: string | null;
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  }): StreamEvent | null {
    const choice = data.choices?.[0];

    if (!choice) {
      if (data.usage) {
        return {
          type: 'usage',
          usage: {
            inputTokens: data.usage.prompt_tokens || 0,
            outputTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0,
          },
        };
      }
      return null;
    }

    if (choice.delta?.content) {
      return {
        type: 'text',
        content: choice.delta.content,
      };
    }

    if (choice.finish_reason) {
      return {
        type: 'done',
        finishReason: choice.finish_reason as 'stop' | 'length',
      };
    }

    return null;
  }

  /**
   * Parse Anthropic stream chunk
   */
  private parseAnthropicStreamChunk(data: {
    type?: string;
    delta?: { type?: string; text?: string };
    message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  }): StreamEvent | null {
    if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
      return {
        type: 'text',
        content: data.delta.text || '',
      };
    }

    if (data.type === 'message_stop') {
      return {
        type: 'done',
        finishReason: 'stop',
      };
    }

    if (data.type === 'message_delta' && data.message?.usage) {
      return {
        type: 'usage',
        usage: {
          inputTokens: data.message.usage.input_tokens || 0,
          outputTokens: data.message.usage.output_tokens || 0,
          totalTokens: (data.message.usage.input_tokens || 0) + (data.message.usage.output_tokens || 0),
        },
      };
    }

    return null;
  }

  /**
   * Wrap stream to record response in memory after completion
   */
  private async *wrapStreamWithMemory(stream: AIStream): AIStream {
    let fullContent = '';

    for await (const event of stream) {
      if (event.type === 'text') {
        fullContent += event.content;
      }
      yield event;
    }

    // Record the full response in memory
    if (fullContent) {
      this.memory.recordResponse(fullContent);
    }
  }
}

/**
 * Base AI Provider
 *
 * Abstract base class for AI providers.
 * Handles common functionality like request transformation,
 * error handling, and streaming.
 */

import type {
  AIProvider,
  ChatOptions,
  ChatMessage,
  AIResponse,
  AIStream,
  StreamEvent,
  EmbedOptions,
  EmbedResponse,
  ProviderConfig,
  TokenUsage,
  AILatency,
  ToolCall,
} from '../../types/ai.js';
import { ConfigurationError, StreamError } from '../../core/errors.js';

/**
 * Provider request context
 */
export interface ProviderRequestContext {
  startTime: number;
  firstTokenTime?: number;
  tokenCount: number;
}

/**
 * Base provider configuration
 */
export interface BaseProviderConfig extends ProviderConfig {
  /** Provider name */
  name: AIProvider;
}

/**
 * Abstract base class for AI providers
 */
export abstract class BaseAIProvider {
  protected config: BaseProviderConfig;

  constructor(config: BaseProviderConfig) {
    this.config = config;
  }

  /**
   * Get provider name
   */
  get name(): AIProvider {
    return this.config.name;
  }

  /**
   * Send a chat completion request
   */
  abstract chat(options: ChatOptions): Promise<AIResponse>;

  /**
   * Stream a chat completion
   */
  abstract stream(options: ChatOptions): Promise<AIStream>;

  /**
   * Generate embeddings
   */
  abstract embed(options: EmbedOptions): Promise<EmbedResponse>;

  /**
   * Get the API key
   */
  protected getApiKey(): string {
    const key = this.config.apiKey || this.getEnvApiKey();
    if (!key) {
      throw new ConfigurationError(`API key not configured for provider: ${this.config.name}`, {
        configKey: `${this.config.name}.apiKey`,
      });
    }
    return key;
  }

  /**
   * Get API key from environment (provider-specific)
   */
  protected abstract getEnvApiKey(): string | undefined;

  /**
   * Get the base URL for API requests
   */
  protected abstract getBaseUrl(): string;

  /**
   * Build request headers
   */
  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };
  }

  /**
   * Convert messages to provider format
   */
  protected abstract transformMessages(messages: ChatMessage[]): unknown[];

  /**
   * Parse provider response to unified format
   */
  protected abstract parseResponse(response: unknown, context: ProviderRequestContext): AIResponse;

  /**
   * Parse streaming response
   */
  protected abstract parseStreamEvent(chunk: string, context: ProviderRequestContext): StreamEvent | null;

  /**
   * Calculate latency metrics
   */
  protected calculateLatency(context: ProviderRequestContext): AILatency {
    const now = performance.now();
    const total = now - context.startTime;
    const ttft = context.firstTokenTime
      ? context.firstTokenTime - context.startTime
      : total;
    const tps = context.tokenCount > 0 && total > 0
      ? (context.tokenCount / total) * 1000
      : 0;

    return { ttft, tps, total };
  }

  /**
   * Create empty token usage
   */
  protected emptyUsage(): TokenUsage {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
  }

  /**
   * Parse SSE stream
   */
  protected async *parseSSEStream(
    response: Response,
    context: ProviderRequestContext
  ): AIStream {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new StreamError('Response body is not readable', {
        streamType: 'sse',
      });
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            try {
              const event = this.parseStreamEvent(data, context);
              if (event) {
                // Track first token time
                if (event.type === 'text' && !context.firstTokenTime) {
                  context.firstTokenTime = performance.now();
                }
                yield event;
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
          const data = trimmed.slice(6);
          try {
            const event = this.parseStreamEvent(data, context);
            if (event) yield event;
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Handle tool calls from response
   */
  protected parseToolCalls(rawToolCalls: unknown[]): ToolCall[] {
    if (!Array.isArray(rawToolCalls)) return [];

    return rawToolCalls.map((tc: any) => ({
      id: tc.id || '',
      type: 'function' as const,
      function: {
        name: tc.function?.name || '',
        arguments: tc.function?.arguments || '{}',
      },
    }));
  }
}

/**
 * AI Error types
 */
export class AIError extends Error {
  constructor(
    message: string,
    public readonly provider: AIProvider,
    public readonly code?: string,
    public readonly status?: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'AIError';
  }
}

export class RateLimitError extends AIError {
  constructor(
    provider: AIProvider,
    public readonly retryAfter?: number
  ) {
    super('Rate limit exceeded', provider, 'rate_limit', 429, true);
    this.name = 'RateLimitError';
  }
}

export class ContextLengthError extends AIError {
  constructor(provider: AIProvider) {
    super('Context length exceeded', provider, 'context_length_exceeded', 400, true);
    this.name = 'ContextLengthError';
  }
}

export class OverloadedError extends AIError {
  constructor(provider: AIProvider) {
    super('Provider is overloaded', provider, 'overloaded', 503, true);
    this.name = 'OverloadedError';
  }
}

export class AuthenticationError extends AIError {
  constructor(provider: AIProvider) {
    super('Authentication failed', provider, 'authentication_error', 401, false);
    this.name = 'AuthenticationError';
  }
}

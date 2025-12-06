/**
 * Ollama Provider
 *
 * Implementation for Ollama (Local LLMs).
 * API: https://github.com/ollama/ollama/blob/main/docs/api.md
 */

import type {
  ChatOptions,
  ChatMessage,
  AIResponse,
  AIStream,
  StreamEvent,
  EmbedOptions,
  EmbedResponse,
  ProviderConfig,
  TokenUsage,
  ContentPart,
} from '../../types/ai.js';
import {
  BaseAIProvider,
  ProviderRequestContext,
  AIError,
  RateLimitError,
  OverloadedError,
} from './base.js';
import { StreamError } from '../../core/errors.js';

/**
 * Ollama-specific configuration
 */
export interface OllamaConfig extends ProviderConfig {
  /** Keep-alive duration (default: 5m) */
  keepAlive?: string;
}

/**
 * Ollama API types
 */
interface OllamaRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  format?: 'json';
  options?: Record<string, unknown>;
  keep_alive?: string;
}

interface OllamaMessage {
  role: string;
  content: string;
  images?: string[];
}

interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
    images?: string[] | null;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaEmbedRequest {
  model: string;
  input: string | string[];
  keep_alive?: string;
  options?: Record<string, unknown>;
}

interface OllamaEmbedResponse {
  model: string;
  embeddings: number[][];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
}

/**
 * Ollama Provider implementation
 */
export class OllamaProvider extends BaseAIProvider {
  private ollamaConfig: OllamaConfig;

  constructor(config: OllamaConfig = {}) {
    super({ ...config, name: 'ollama' });
    this.ollamaConfig = config;
  }

  protected getEnvApiKey(): string | undefined {
    return undefined; // No API key needed for local Ollama
  }

  protected getBaseUrl(): string {
    return this.config.baseUrl || 'http://127.0.0.1:11434/api';
  }

  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };
  }

  protected transformMessages(messages: ChatMessage[]): OllamaMessage[] {
    return messages.map((msg) => {
      const { content, images } = this.extractContentAndImages(msg.content);
      return {
        role: msg.role,
        content,
        images: images.length > 0 ? images : undefined,
      };
    });
  }

  private extractContentAndImages(content: string | ContentPart[]): { content: string; images: string[] } {
    if (typeof content === 'string') {
      return { content, images: [] };
    }

    let text = '';
    const images: string[] = [];

    for (const part of content) {
      if (part.type === 'text') {
        text += part.text;
      } else if (part.type === 'image') {
        images.push(Buffer.from(part.data).toString('base64'));
      } else if (part.type === 'image_url') {
        // Ollama expects base64 in 'images' array, not URLs.
        // Best effort: if it's data URI, extract base64.
        if (part.image_url.url.startsWith('data:')) {
          const base64 = part.image_url.url.split(',')[1];
          if (base64) images.push(base64);
        }
      }
    }

    return { content: text, images };
  }

  async chat(options: ChatOptions): Promise<AIResponse> {
    const context: ProviderRequestContext = {
      startTime: performance.now(),
      tokenCount: 0,
    };

    const body = this.buildChatBody(options, false);
    const response = await this.makeRequest('/chat', body, options.signal);
    const data = await response.json() as OllamaResponse;

    return this.parseResponse(data, context);
  }

  async stream(options: ChatOptions): Promise<AIStream> {
    const context: ProviderRequestContext = {
      startTime: performance.now(),
      tokenCount: 0,
    };

    const body = this.buildChatBody(options, true);
    const response = await this.makeRequest('/chat', body, options.signal);

    return this.parseNDJSONStream(response, context);
  }

  async embed(options: EmbedOptions): Promise<EmbedResponse> {
    const startTime = performance.now();

    const body: OllamaEmbedRequest = {
      model: options.model || this.config.defaultModel || 'nomic-embed-text',
      input: options.input,
    };

    if (this.ollamaConfig.keepAlive) {
      body.keep_alive = this.ollamaConfig.keepAlive;
    }

    // Note: Ollama /api/embed endpoint is newer (v0.1.33+)
    // Falling back to /api/embeddings if user is on old version might be needed,
    // but let's assume modern Ollama.
    const response = await this.makeRequest('/embed', body, options.signal);
    const data = await response.json() as OllamaEmbedResponse;

    const latency = {
      ttft: performance.now() - startTime,
      tps: 0,
      total: performance.now() - startTime,
    };

    const usage: TokenUsage = {
      inputTokens: data.prompt_eval_count || 0,
      outputTokens: 0,
      totalTokens: data.prompt_eval_count || 0,
    };

    return {
      embeddings: data.embeddings,
      usage,
      model: data.model,
      provider: 'ollama',
      latency,
    };
  }

  private buildChatBody(options: ChatOptions, stream: boolean): OllamaRequest {
    const body: OllamaRequest = {
      model: options.model || this.config.defaultModel || 'llama3',
      messages: this.transformMessages(options.messages),
      stream,
      options: {},
    };

    if (options.responseFormat?.type === 'json_object') {
      body.format = 'json';
    }

    if (this.ollamaConfig.keepAlive) {
      body.keep_alive = this.ollamaConfig.keepAlive;
    }

    if (options.temperature !== undefined) body.options!.temperature = options.temperature;
    if (options.topP !== undefined) body.options!.top_p = options.topP;
    if (options.maxTokens !== undefined) body.options!.num_predict = options.maxTokens;
    if (options.stop) body.options!.stop = options.stop;

    return body;
  }

  private async makeRequest(
    endpoint: string,
    body: unknown,
    signal?: AbortSignal
  ): Promise<Response> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const headers = this.buildHeaders();

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
        // Try to read error body
        let errorMsg = response.statusText;
        try {
            const err = await response.json();
            if (err.error) errorMsg = err.error;
        } catch {}

        if (response.status === 429) throw new RateLimitError('ollama');
        if (response.status === 503) throw new OverloadedError('ollama');
        
        throw new AIError(errorMsg, 'ollama', String(response.status), response.status);
    }

    return response;
  }

  protected parseResponse(data: OllamaResponse, context: ProviderRequestContext): AIResponse {
    const usage: TokenUsage = {
      inputTokens: data.prompt_eval_count || 0,
      outputTokens: data.eval_count || 0,
      totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
    };

    context.tokenCount = usage.outputTokens;

    return {
      content: data.message.content,
      usage,
      latency: this.calculateLatency(context),
      model: data.model,
      provider: 'ollama',
      cached: false,
      finishReason: data.done ? 'stop' : undefined,
      raw: data,
    };
  }

  protected parseStreamEvent(_chunk: string, _context: ProviderRequestContext): StreamEvent | null {
    // Not used for NDJSON
    return null;
  }

  /**
   * Custom stream parser for NDJSON (Newline Delimited JSON)
   */
  protected async *parseNDJSONStream(
    response: Response,
    context: ProviderRequestContext
  ): AIStream {
    const reader = response.body?.getReader();
    if (!reader) throw new StreamError('Response body is not readable', { streamType: 'ndjson' });

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
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line) as OllamaResponse;
            
            if (data.message?.content) {
               if (!context.firstTokenTime) context.firstTokenTime = performance.now();
               context.tokenCount++;
               yield { type: 'text', content: data.message.content };
            }

            if (data.done) {
              const usage: TokenUsage = {
                inputTokens: data.prompt_eval_count || 0,
                outputTokens: data.eval_count || 0,
                totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
              };
              yield { type: 'done', finishReason: 'stop', usage };
            }
          } catch (e) {
             // Ignore invalid JSON lines
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        const lines = buffer.split('\n');
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const data = JSON.parse(line) as OllamaResponse;
                if (data.message?.content) {
                    if (!context.firstTokenTime) context.firstTokenTime = performance.now();
                    context.tokenCount++;
                    yield { type: 'text', content: data.message.content };
                }
                if (data.done) {
                    const usage: TokenUsage = {
                        inputTokens: data.prompt_eval_count || 0,
                        outputTokens: data.eval_count || 0,
                        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
                    };
                    yield { type: 'done', finishReason: 'stop', usage };
                }
            } catch (e) {
                // Ignore
            }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

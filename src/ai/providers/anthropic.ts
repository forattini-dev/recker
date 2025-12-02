/**
 * Anthropic Provider
 *
 * Implementation for Anthropic API (Claude models)
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
  ToolDefinition,
  ContentPart,
} from '../../types/ai.js';
import {
  BaseAIProvider,
  ProviderRequestContext,
  AIError,
  RateLimitError,
  ContextLengthError,
  OverloadedError,
  AuthenticationError,
} from './base.js';
import { StreamError } from '../../core/errors.js';

/**
 * Anthropic-specific configuration
 */
export interface AnthropicConfig extends ProviderConfig {
  /** Anthropic version header */
  version?: string;
}

/**
 * Anthropic message format
 */
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentPart[];
}

type AnthropicContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string };

/**
 * Anthropic tool format
 */
interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Anthropic completion response
 */
interface AnthropicCompletion {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentPart[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Anthropic stream event types
 */
type AnthropicStreamEvent =
  | { type: 'message_start'; message: AnthropicCompletion }
  | { type: 'content_block_start'; index: number; content_block: AnthropicContentPart }
  | { type: 'content_block_delta'; index: number; delta: { type: string; text?: string; partial_json?: string } }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: string }; usage: { output_tokens: number } }
  | { type: 'message_stop' }
  | { type: 'ping' }
  | { type: 'error'; error: { type: string; message: string } };

/**
 * Anthropic Provider implementation
 */
export class AnthropicProvider extends BaseAIProvider {
  private anthropicConfig: AnthropicConfig;

  constructor(config: AnthropicConfig = {}) {
    super({ ...config, name: 'anthropic' });
    this.anthropicConfig = config;
  }

  protected getEnvApiKey(): string | undefined {
    return process.env.ANTHROPIC_API_KEY;
  }

  protected getBaseUrl(): string {
    return this.config.baseUrl || 'https://api.anthropic.com/v1';
  }

  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.getApiKey(),
      'anthropic-version': this.anthropicConfig.version || '2025-01-01',
      ...this.config.headers,
    };
  }

  protected transformMessages(messages: ChatMessage[]): AnthropicMessage[] {
    // Anthropic doesn't have a system role in messages, it's separate
    const filtered = messages.filter((m) => m.role !== 'system');

    return filtered.map((msg): AnthropicMessage => {
      if (msg.role === 'tool') {
        // Convert tool results to Anthropic format
        return {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.tool_call_id || '',
              content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
            },
          ],
        };
      }

      return {
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: this.transformContent(msg),
      };
    });
  }

  private transformContent(msg: ChatMessage): string | AnthropicContentPart[] {
    if (typeof msg.content === 'string') {
      // If there are tool calls, include them
      if (msg.tool_calls?.length) {
        const parts: AnthropicContentPart[] = [{ type: 'text', text: msg.content }];
        for (const tc of msg.tool_calls) {
          parts.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments || '{}'),
          });
        }
        return parts;
      }
      return msg.content;
    }

    if (!msg.content) return '';

    return msg.content.map((part): AnthropicContentPart => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text };
      }
      if (part.type === 'image_url') {
        // Anthropic requires base64, so we need to handle URLs differently
        // For now, assume it's a data URL
        const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          return {
            type: 'image',
            source: {
              type: 'base64',
              media_type: match[1],
              data: match[2],
            },
          };
        }
        // TODO: Fetch and convert URL to base64
        return { type: 'text', text: `[Image: ${part.image_url.url}]` };
      }
      if (part.type === 'image') {
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: part.mediaType,
            data: Buffer.from(part.data).toString('base64'),
          },
        };
      }
      return { type: 'text', text: '' };
    });
  }

  private transformTools(tools?: ToolDefinition[]): AnthropicTool[] | undefined {
    if (!tools) return undefined;
    return tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters || { type: 'object', properties: {} },
    }));
  }

  private getSystemPrompt(options: ChatOptions): string | undefined {
    // Get system from messages or options
    const systemMessage = options.messages.find((m) => m.role === 'system');
    if (options.systemPrompt) return options.systemPrompt;
    if (systemMessage) {
      return typeof systemMessage.content === 'string'
        ? systemMessage.content
        : systemMessage.content?.map((p) => (p.type === 'text' ? p.text : '')).join('');
    }
    return undefined;
  }

  async chat(options: ChatOptions): Promise<AIResponse> {
    const context: ProviderRequestContext = {
      startTime: performance.now(),
      tokenCount: 0,
    };

    const body = this.buildChatBody(options, false);
    const response = await this.makeRequest('/messages', body, options.signal);
    const data = await response.json() as AnthropicCompletion;

    return this.parseResponse(data, context);
  }

  async stream(options: ChatOptions): Promise<AIStream> {
    const context: ProviderRequestContext = {
      startTime: performance.now(),
      tokenCount: 0,
    };

    const body = this.buildChatBody(options, true);
    const response = await this.makeRequest('/messages', body, options.signal);

    return this.parseAnthropicStream(response, context);
  }

  async embed(_options: EmbedOptions): Promise<EmbedResponse> {
    // Anthropic doesn't have embeddings API
    throw new AIError(
      'Anthropic does not support embeddings. Use a different provider.',
      'anthropic',
      'not_supported',
      400,
      false
    );
  }

  private buildChatBody(options: ChatOptions, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: options.model || this.config.defaultModel || 'claude-sonnet-4-20250514',
      messages: this.transformMessages(options.messages),
      max_tokens: options.maxTokens || 4096,
    };

    const systemPrompt = this.getSystemPrompt(options);
    if (systemPrompt) body.system = systemPrompt;

    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.topP !== undefined) body.top_p = options.topP;
    if (options.stop) body.stop_sequences = options.stop;
    if (options.tools) body.tools = this.transformTools(options.tools);

    if (options.toolChoice) {
      if (options.toolChoice === 'auto') {
        body.tool_choice = { type: 'auto' };
      } else if (options.toolChoice === 'none') {
        // Anthropic doesn't have 'none', just don't pass tools
      } else if (options.toolChoice === 'required') {
        body.tool_choice = { type: 'any' };
      } else if (typeof options.toolChoice === 'object') {
        body.tool_choice = {
          type: 'tool',
          name: options.toolChoice.function.name,
        };
      }
    }

    if (stream) body.stream = true;

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
      await this.handleError(response);
    }

    return response;
  }

  private async handleError(response: Response): Promise<never> {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // Ignore JSON parse errors
    }

    const message = errorData.error?.message || response.statusText;
    const errorType = errorData.error?.type;

    switch (response.status) {
      case 401:
        throw new AuthenticationError('anthropic');
      case 429:
        const retryAfter = parseInt(response.headers.get('retry-after') || '0', 10);
        throw new RateLimitError('anthropic', retryAfter || undefined);
      case 400:
        if (errorType === 'invalid_request_error' && message.includes('context')) {
          throw new ContextLengthError('anthropic');
        }
        break;
      case 503:
      case 529:
        throw new OverloadedError('anthropic');
    }

    throw new AIError(message, 'anthropic', errorType, response.status, response.status >= 500);
  }

  protected parseResponse(data: AnthropicCompletion, context: ProviderRequestContext): AIResponse {
    // Extract text content
    let content = '';
    const toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = [];

    for (const block of data.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    const usage: TokenUsage = {
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
      totalTokens: data.usage.input_tokens + data.usage.output_tokens,
    };

    context.tokenCount = usage.outputTokens;

    // Map stop_reason to finish_reason
    const finishReasonMap: Record<string, 'stop' | 'length' | 'tool_calls'> = {
      end_turn: 'stop',
      max_tokens: 'length',
      stop_sequence: 'stop',
      tool_use: 'tool_calls',
    };

    return {
      content,
      usage,
      latency: this.calculateLatency(context),
      model: data.model,
      provider: 'anthropic',
      cached: false,
      finishReason: finishReasonMap[data.stop_reason] || 'stop',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      raw: data,
    };
  }

  protected parseStreamEvent(_chunk: string, _context: ProviderRequestContext): StreamEvent | null {
    // Anthropic uses a different SSE format, handled in parseAnthropicStream
    return null;
  }

  private async *parseAnthropicStream(
    response: Response,
    context: ProviderRequestContext
  ): AIStream {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new StreamError('Response body is not readable', {
        streamType: 'anthropic-sse',
      });
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let currentToolCallId = '';
    let currentToolCallName = '';
    let currentToolCallArgs = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6);
          if (jsonStr === '[DONE]') continue;

          try {
            const event = JSON.parse(jsonStr) as AnthropicStreamEvent;

            switch (event.type) {
              case 'content_block_start':
                if (event.content_block.type === 'tool_use') {
                  currentToolCallId = event.content_block.id;
                  currentToolCallName = event.content_block.name;
                  currentToolCallArgs = '';
                }
                break;

              case 'content_block_delta':
                if (event.delta.type === 'text_delta' && event.delta.text) {
                  if (!context.firstTokenTime) {
                    context.firstTokenTime = performance.now();
                  }
                  context.tokenCount++;
                  yield { type: 'text', content: event.delta.text };
                } else if (event.delta.type === 'input_json_delta' && event.delta.partial_json) {
                  currentToolCallArgs += event.delta.partial_json;
                  yield {
                    type: 'tool_call_delta',
                    index: event.index,
                    delta: { arguments: event.delta.partial_json },
                  };
                }
                break;

              case 'content_block_stop':
                if (currentToolCallId) {
                  yield {
                    type: 'tool_call',
                    toolCall: {
                      id: currentToolCallId,
                      type: 'function',
                      function: {
                        name: currentToolCallName,
                        arguments: currentToolCallArgs,
                      },
                    },
                  };
                  currentToolCallId = '';
                  currentToolCallName = '';
                  currentToolCallArgs = '';
                }
                break;

              case 'message_delta':
                if (event.usage) {
                  yield {
                    type: 'usage',
                    usage: {
                      inputTokens: 0, // Not provided in delta
                      outputTokens: event.usage.output_tokens,
                      totalTokens: event.usage.output_tokens,
                    },
                  };
                }

                if (event.delta.stop_reason) {
                  const finishReasonMap: Record<string, 'stop' | 'length' | 'tool_calls'> = {
                    end_turn: 'stop',
                    max_tokens: 'length',
                    stop_sequence: 'stop',
                    tool_use: 'tool_calls',
                  };
                  yield {
                    type: 'done',
                    finishReason: finishReasonMap[event.delta.stop_reason] || 'stop',
                  };
                }
                break;

              case 'error':
                yield {
                  type: 'error',
                  error: new AIError(event.error.message, 'anthropic', event.error.type),
                };
                break;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

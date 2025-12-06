/**
 * OpenAI Provider
 *
 * Implementation for OpenAI API (GPT-5.1, GPT-5, O3, embeddings, etc.)
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

/**
 * OpenAI-specific configuration
 */
export interface OpenAIConfig extends ProviderConfig {
  /** Organization ID */
  organization?: string;
}

/**
 * OpenAI message format
 */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | OpenAIContentPart[] | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
}

interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: string };
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * OpenAI completion response
 */
interface OpenAICompletion {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: OpenAIMessage;
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI stream chunk
 */
interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI embedding response
 */
interface OpenAIEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI Provider implementation
 */
export class OpenAIProvider extends BaseAIProvider {
  private openaiConfig: OpenAIConfig;

  constructor(config: OpenAIConfig = {}) {
    super({ ...config, name: 'openai' });
    this.openaiConfig = config;
  }

  protected getEnvApiKey(): string | undefined {
    return process.env.OPENAI_API_KEY;
  }

  protected getBaseUrl(): string {
    return this.config.baseUrl || 'https://api.openai.com/v1';
  }

  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.getApiKey()}`,
      ...this.config.headers,
    };

    if (this.openaiConfig.organization) {
      headers['OpenAI-Organization'] = this.openaiConfig.organization;
    }

    return headers;
  }

  protected transformMessages(messages: ChatMessage[]): OpenAIMessage[] {
    return messages.map((msg) => {
      const openaiMsg: OpenAIMessage = {
        role: msg.role,
        content: this.transformContent(msg.content),
      };

      if (msg.name) openaiMsg.name = msg.name;
      if (msg.tool_call_id) openaiMsg.tool_call_id = msg.tool_call_id;
      if (msg.tool_calls) openaiMsg.tool_calls = msg.tool_calls as OpenAIToolCall[];

      return openaiMsg;
    });
  }

  private transformContent(content: string | ContentPart[]): string | OpenAIContentPart[] | null {
    if (typeof content === 'string') return content;
    if (!content) return null;

    return content.map((part): OpenAIContentPart => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text };
      }
      if (part.type === 'image_url') {
        return {
          type: 'image_url',
          image_url: {
            url: part.image_url.url,
            detail: part.image_url.detail,
          },
        };
      }
      if (part.type === 'image') {
        // Convert buffer to data URL
        const base64 = Buffer.from(part.data).toString('base64');
        return {
          type: 'image_url',
          image_url: {
            url: `data:${part.mediaType};base64,${base64}`,
          },
        };
      }
      return { type: 'text', text: '' };
    });
  }

  private transformTools(tools?: ToolDefinition[]): unknown[] | undefined {
    if (!tools) return undefined;
    return tools.map((tool) => ({
      type: tool.type,
      function: tool.function,
    }));
  }

  async chat(options: ChatOptions): Promise<AIResponse> {
    const context: ProviderRequestContext = {
      startTime: performance.now(),
      tokenCount: 0,
    };

    const messages = this.prepareMessages(options);
    const body = this.buildChatBody(options, messages, false);

    const response = await this.makeRequest('/chat/completions', body, options.signal);
    const data = await response.json() as OpenAICompletion;

    return this.parseResponse(data, context);
  }

  async stream(options: ChatOptions): Promise<AIStream> {
    const context: ProviderRequestContext = {
      startTime: performance.now(),
      tokenCount: 0,
    };

    const messages = this.prepareMessages(options);
    const body = this.buildChatBody(options, messages, true);

    const response = await this.makeRequest('/chat/completions', body, options.signal);

    return this.parseSSEStream(response, context);
  }

  async embed(options: EmbedOptions): Promise<EmbedResponse> {
    const startTime = performance.now();

    const body = {
      model: options.model || this.config.defaultModel || 'text-embedding-3-large',
      input: options.input,
      ...(options.dimensions && { dimensions: options.dimensions }),
    };

    const response = await this.makeRequest('/embeddings', body, options.signal);
    const data = await response.json() as OpenAIEmbeddingResponse;

    const latency = {
      ttft: performance.now() - startTime,
      tps: 0,
      total: performance.now() - startTime,
    };

    return {
      embeddings: data.data.map((d) => d.embedding),
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: 0,
        totalTokens: data.usage.total_tokens,
      },
      model: data.model,
      provider: 'openai',
      latency,
    };
  }

  private prepareMessages(options: ChatOptions): ChatMessage[] {
    const messages = [...options.messages];

    // Prepend system prompt if provided
    if (options.systemPrompt) {
      messages.unshift({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    return messages;
  }

  private buildChatBody(
    options: ChatOptions,
    messages: ChatMessage[],
    stream: boolean
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: options.model || this.config.defaultModel || 'gpt-5.1',
      messages: this.transformMessages(messages),
      stream,
    };

    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.topP !== undefined) body.top_p = options.topP;
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options.stop) body.stop = options.stop;
    if (options.tools) body.tools = this.transformTools(options.tools);
    if (options.toolChoice) body.tool_choice = options.toolChoice;

    if (options.responseFormat) {
      if (options.responseFormat.type === 'json_object') {
        body.response_format = { type: 'json_object' };
      } else if (options.responseFormat.type === 'json_schema') {
        body.response_format = {
          type: 'json_schema',
          json_schema: options.responseFormat.schema,
        };
      }
    }

    // Include usage in streaming for token counting
    if (stream) {
      body.stream_options = { include_usage: true };
    }

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
    const code = errorData.error?.code || errorData.error?.type;

    switch (response.status) {
      case 401:
        throw new AuthenticationError('openai');
      case 429:
        const retryAfter = parseInt(response.headers.get('retry-after') || '0', 10);
        throw new RateLimitError('openai', retryAfter || undefined);
      case 400:
        if (code === 'context_length_exceeded' || message.includes('maximum context length')) {
          throw new ContextLengthError('openai');
        }
        break;
      case 503:
      case 529:
        throw new OverloadedError('openai');
    }

    throw new AIError(message, 'openai', code, response.status, response.status >= 500);
  }

  protected parseResponse(data: OpenAICompletion, context: ProviderRequestContext): AIResponse {
    const choice = data.choices[0];
    const message = choice?.message;

    const content = typeof message?.content === 'string' ? message.content : '';
    const toolCalls = message?.tool_calls ? this.parseToolCalls(message.tool_calls) : undefined;

    const usage: TokenUsage = data.usage
      ? {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : this.emptyUsage();

    context.tokenCount = usage.outputTokens;

    return {
      content,
      usage,
      latency: this.calculateLatency(context),
      model: data.model,
      provider: 'openai',
      cached: false,
      finishReason: choice?.finish_reason,
      toolCalls,
      raw: data,
    };
  }

  protected parseStreamEvent(chunk: string, context: ProviderRequestContext): StreamEvent | null {
    const data = JSON.parse(chunk) as OpenAIStreamChunk;
    const choice = data.choices?.[0];

    if (!choice) {
      // Check for usage in final chunk
      if (data.usage) {
        return {
          type: 'usage',
          usage: {
            inputTokens: data.usage.prompt_tokens,
            outputTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          },
        };
      }
      return null;
    }

    const delta = choice.delta;

    // Text content
    if (delta.content) {
      context.tokenCount++;
      return {
        type: 'text',
        content: delta.content,
      };
    }

    // Tool calls
    if (delta.tool_calls?.length) {
      const tc = delta.tool_calls[0];
      if (tc.id) {
        // New tool call
        return {
          type: 'tool_call',
          toolCall: {
            id: tc.id,
            type: 'function',
            function: {
              name: tc.function?.name || '',
              arguments: tc.function?.arguments || '',
            },
          },
        };
      } else if (tc.function?.arguments) {
        // Tool call delta (streaming arguments)
        return {
          type: 'tool_call_delta',
          index: tc.index,
          delta: {
            arguments: tc.function.arguments,
          },
        };
      }
    }

    // Finish reason
    if (choice.finish_reason) {
      return {
        type: 'done',
        finishReason: choice.finish_reason,
        usage: data.usage
          ? {
              inputTokens: data.usage.prompt_tokens,
              outputTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      };
    }

    return null;
  }
}

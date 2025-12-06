/**
 * Google Gemini Provider
 *
 * Implementation for Google's Gemini API (Vertex AI / AI Studio).
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
  OverloadedError,
  AuthenticationError,
} from './base.js';

/**
 * Google-specific configuration
 */
export interface GoogleConfig extends ProviderConfig {
  /** API Version (default: v1beta) */
  apiVersion?: string;
}

/**
 * Google Gemini message format
 */
interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}

interface GeminiSafetySetting {
  category: string;
  threshold: string;
}

interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  candidateCount?: number;
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
}

interface GeminiTool {
  functionDeclarations?: Array<{
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  }>;
}

/**
 * Google API Response
 */
interface GeminiResponse {
  candidates?: Array<{
    content: GeminiContent;
    finishReason?: string;
    citationMetadata?: unknown;
    tokenCount?: number;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

/**
 * Google Provider implementation
 */
export class GoogleProvider extends BaseAIProvider {
  private googleConfig: GoogleConfig;

  constructor(config: GoogleConfig = {}) {
    super({ ...config, name: 'google' });
    this.googleConfig = config;
  }

  protected getEnvApiKey(): string | undefined {
    return process.env.GOOGLE_API_KEY;
  }

  protected getBaseUrl(): string {
    const version = this.googleConfig.apiVersion || 'v1beta';
    // Note: API Key is passed as query param, not in base URL for Google AI Studio
    return this.config.baseUrl || `https://generativelanguage.googleapis.com/${version}`;
  }

  /**
   * Google AI Studio uses API key in query param usually,
   * but we'll stick to the standard buildHeaders if they support header auth
   * or append it to the URL in makeRequest.
   * Google AI Studio actually prefers `x-goog-api-key` header or query param `key`.
   */
  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      // 'x-goog-api-key': this.getApiKey(), // We'll use query param for broader compatibility
      ...this.config.headers,
    };
  }

  protected transformMessages(messages: ChatMessage[]): GeminiContent[] {
    // Google requires alternating user/model roles.
    // System prompts are handled separately in valid Gemini 1.5 requests (systemInstruction),
    // or merged into the first user message for older models.
    // For this implementation, we'll handle system prompts in buildChatBody.

    return messages
      .filter((m) => m.role !== 'system')
      .map((msg): GeminiContent => {
        return {
          role: msg.role === 'user' ? 'user' : 'model',
          parts: this.transformContent(msg),
        };
      });
  }

  private transformContent(msg: ChatMessage): GeminiPart[] {
    // Handle Function/Tool responses (role: tool in OpenAI, functionResponse in Gemini)
    if (msg.role === 'tool') {
      return [{
        functionResponse: {
          name: msg.name || 'unknown_tool',
          response: typeof msg.content === 'string' ? { content: msg.content } : { content: msg.content },
        },
      }];
    }

    // Handle Assistant tool calls (stored in content in our unified type?)
    // Actually unified type has tool_calls separately.
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const parts: GeminiPart[] = [];
      if (msg.content && typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      }

      msg.tool_calls.forEach((tc) => {
        parts.push({
          functionCall: {
            name: tc.function.name,
            args: JSON.parse(tc.function.arguments || '{}'),
          },
        });
      });
      return parts;
    }

    const content = msg.content;
    if (typeof content === 'string') {
      return [{ text: content }];
    }

    if (!content) return [{ text: '' }];

    return content.map((part): GeminiPart => {
      if (part.type === 'text') {
        return { text: part.text };
      }
      if (part.type === 'image_url') {
        // Google expects base64 data, not URL usually (unless using Cloud Storage URI)
        // For now, we assume the user might provide base64 in the URL string data:image/...
        // If it's a real http URL, this might fail without downloading it first.
        // Recker's philosophy: "Zero config". We should probably try to handle it,
        // but for now let's assume the unified type might carry base64 in image_url for simple cases
        // or we just warn.
        // NOTE: Gemini 1.5 Pro supports image URLs if they are Google Cloud Storage URIs.
        return { text: '[Image URL not supported directly in Gemini provider yet without base64]' };
      }
      if (part.type === 'image') {
        const base64 = Buffer.from(part.data).toString('base64');
        return {
          inlineData: {
            mimeType: part.mediaType,
            data: base64,
          },
        };
      }
      return { text: '' };
    });
  }

  private transformTools(tools?: ToolDefinition[]): GeminiTool[] | undefined {
    if (!tools || tools.length === 0) return undefined;

    return [{
      functionDeclarations: tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    }];
  }

  async chat(options: ChatOptions): Promise<AIResponse> {
    const context: ProviderRequestContext = {
      startTime: performance.now(),
      tokenCount: 0,
    };

    const model = options.model || this.config.defaultModel || 'gemini-2.5-flash';
    const body = this.buildChatBody(options);

    const response = await this.makeRequest(
      `/models/${model}:generateContent`,
      body,
      options.signal
    );

    const data = await response.json() as GeminiResponse;
    return this.parseResponse(data, context);
  }

  async stream(options: ChatOptions): Promise<AIStream> {
    const context: ProviderRequestContext = {
      startTime: performance.now(),
      tokenCount: 0,
    };

    const model = options.model || this.config.defaultModel || 'gemini-2.5-flash';
    const body = this.buildChatBody(options);

    // Google uses a slightly different stream endpoint
    const response = await this.makeRequest(
      `/models/${model}:streamGenerateContent?alt=sse`, // alt=sse enables SSE format
      body,
      options.signal
    );

    return this.parseSSEStream(response, context);
  }

  async embed(options: EmbedOptions): Promise<EmbedResponse> {
    const startTime = performance.now();
    const model = options.model || 'text-embedding-004';
    
    // Google supports batch embedding
    const isBatch = Array.isArray(options.input);
    const method = isBatch ? 'batchEmbedContents' : 'embedContent';
    const inputs = isBatch ? options.input : [options.input];
    
    const requests = (inputs as string[]).map(text => ({
      model: `models/${model}`,
      content: { parts: [{ text }] }
    }));

    const body = isBatch ? { requests } : { ...requests[0] };
    
    const response = await this.makeRequest(
        `/models/${model}:${method}`,
        body,
        options.signal
    );
    
    const data = await response.json() as any;
    
    // Normalize response
    let embeddings: number[][] = [];
    if (isBatch) {
        embeddings = data.embeddings.map((e: any) => e.values);
    } else {
        embeddings = [data.embedding.values];
    }

    // Google doesn't always return token usage for embeddings
    const totalTokens = 0; 

    const latency = {
      ttft: performance.now() - startTime,
      tps: 0,
      total: performance.now() - startTime,
    };

    return {
      embeddings,
      usage: {
        inputTokens: totalTokens,
        outputTokens: 0,
        totalTokens,
      },
      model,
      provider: 'google',
      latency,
    };
  }

  private buildChatBody(options: ChatOptions): Record<string, unknown> {
    const messages = this.transformMessages(options.messages);
    
    // Extract system prompt
    const systemMessage = options.messages.find(m => m.role === 'system');
    let systemInstruction;
    if (systemMessage) {
       systemInstruction = {
         parts: [{ text: typeof systemMessage.content === 'string' ? systemMessage.content : '' }]
       };
    } else if (options.systemPrompt) {
       systemInstruction = {
         parts: [{ text: options.systemPrompt }]
       };
    }

    const generationConfig: GeminiGenerationConfig = {};
    if (options.temperature !== undefined) generationConfig.temperature = options.temperature;
    if (options.topP !== undefined) generationConfig.topP = options.topP;
    if (options.maxTokens !== undefined) generationConfig.maxOutputTokens = options.maxTokens;
    if (options.stop) generationConfig.stopSequences = options.stop;
    if (options.responseFormat?.type === 'json_object') {
        generationConfig.responseMimeType = 'application/json';
    }

    const body: Record<string, unknown> = {
      contents: messages,
      generationConfig,
      tools: this.transformTools(options.tools),
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    return body;
  }

  private async makeRequest(
    endpoint: string,
    body: unknown,
    signal?: AbortSignal
  ): Promise<Response> {
    const key = this.getApiKey();
    // Ensure query params exist or start
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${this.getBaseUrl()}${endpoint}${separator}key=${key}`;
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
    const status = errorData.error?.code || response.status;

    switch (response.status) {
      case 400:
      case 401:
        throw new AuthenticationError('google');
      case 429:
        throw new RateLimitError('google');
      case 503:
        throw new OverloadedError('google');
    }

    throw new AIError(message, 'google', String(status), response.status, response.status >= 500);
  }

  protected parseResponse(data: GeminiResponse, context: ProviderRequestContext): AIResponse {
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    
    // Combine text parts
    const content = parts
      .filter(p => p.text)
      .map(p => p.text)
      .join('');
      
    // Extract function calls
    const toolCalls = parts
      .filter(p => p.functionCall)
      .map(p => ({
        id: 'call_' + Math.random().toString(36).slice(2), // Google doesn't provide ID, generate one
        type: 'function' as const,
        function: {
          name: p.functionCall!.name,
          arguments: JSON.stringify(p.functionCall!.args),
        }
      }));

    const usage: TokenUsage = data.usageMetadata
      ? {
          inputTokens: data.usageMetadata.promptTokenCount,
          outputTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens: data.usageMetadata.totalTokenCount,
        }
      : this.emptyUsage();

    context.tokenCount = usage.outputTokens;

    return {
      content,
      usage,
      latency: this.calculateLatency(context),
      model: 'gemini', // Response doesn't always contain model name
      provider: 'google',
      cached: false,
      finishReason: candidate?.finishReason === 'STOP' ? 'stop' : 'length', // Map reason
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      raw: data,
    };
  }

  protected parseStreamEvent(chunk: string, context: ProviderRequestContext): StreamEvent | null {
    // SSE format: data: {...}
    // The base class parseSSEStream handles the splitting.
    // We just need to parse the JSON payload of 'data'.
    
    const data = JSON.parse(chunk) as GeminiResponse;
    const candidate = data.candidates?.[0];
    
    if (!candidate) return null;

    // Usage update
    if (data.usageMetadata) {
        return {
            type: 'usage',
            usage: {
                inputTokens: data.usageMetadata.promptTokenCount,
                outputTokens: data.usageMetadata.candidatesTokenCount,
                totalTokens: data.usageMetadata.totalTokenCount,
            }
        };
    }

    const parts = candidate.content?.parts || [];
    
    // Text delta
    const textPart = parts.find(p => p.text);
    if (textPart?.text) {
        context.tokenCount++;
        return {
            type: 'text',
            content: textPart.text,
        };
    }

    // Tool call delta (Google usually sends full tool call in one go, not delta, but we can treat as delta or full)
    const toolPart = parts.find(p => p.functionCall);
    if (toolPart?.functionCall) {
        return {
            type: 'tool_call',
            toolCall: {
                id: 'call_' + Math.random().toString(36).slice(2),
                type: 'function',
                function: {
                    name: toolPart.functionCall.name,
                    arguments: JSON.stringify(toolPart.functionCall.args),
                }
            }
        };
    }
    
    // Finish reason
    if (candidate.finishReason && candidate.finishReason !== 'STOP') { // STOP is normal end
         return {
             type: 'done',
             finishReason: 'stop', // simplified
         };
    }

    return null;
  }
}

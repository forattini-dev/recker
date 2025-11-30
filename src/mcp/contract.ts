/**
 * MCP Contract - Type-safe, schema-validated MCP tool contracts with streaming support
 *
 * Similar to HTTP contracts but for MCP tools, with optional streaming responses.
 * Supports both regular tool calls and real-time SSE streaming.
 *
 * @example
 * ```typescript
 * const tools = createMCPContract(mcp, {
 *   searchDocs: {
 *     inputSchema: z.object({ query: z.string() }),
 *     outputSchema: z.object({ results: z.array(z.string()) })
 *   },
 *   generateText: {
 *     inputSchema: z.object({ prompt: z.string() }),
 *     stream: true
 *   }
 * });
 *
 * // Type-safe call
 * const docs = await tools.searchDocs({ query: 'auth' });
 *
 * // Streaming call
 * for await (const chunk of tools.generateText({ prompt: 'Hello' })) {
 *   process.stdout.write(chunk);
 * }
 *
 * // Real-time SSE streaming
 * const sse = createMCPSSEStream(client, '/mcp/stream');
 * for await (const chunk of sse('Tell me a story')) {
 *   process.stdout.write(chunk);
 * }
 * ```
 */

import type { z, ZodSchema } from 'zod';
import type { MCPClient } from './client.js';
import type { MCPToolResult } from './types.js';
import type { Client } from '../core/client.js';
import type { SSEEvent } from '../utils/sse.js';

// Tool definition with optional streaming
export interface MCPToolContract {
  /** Input schema for the tool */
  inputSchema?: ZodSchema;
  /** Output schema for validation (ignored if stream: true) */
  outputSchema?: ZodSchema;
  /** Enable streaming response */
  stream?: boolean;
  /** Tool description (for documentation) */
  description?: string;
}

export type MCPContractDefinition = Record<string, MCPToolContract>;

// Helper to infer Zod type or unknown
type InferZod<T> = T extends ZodSchema ? z.infer<T> : unknown;

// Function type for non-streaming tools
type ToolFunction<T extends MCPToolContract> = (
  args: T['inputSchema'] extends ZodSchema ? z.infer<T['inputSchema']> : Record<string, unknown>
) => Promise<T['outputSchema'] extends ZodSchema ? z.infer<T['outputSchema']> : MCPToolResult>;

// Function type for streaming tools
type StreamingToolFunction<T extends MCPToolContract> = (
  args: T['inputSchema'] extends ZodSchema ? z.infer<T['inputSchema']> : Record<string, unknown>
) => AsyncGenerator<string, void, unknown>;

// Conditional function type based on stream flag
type MCPToolFunction<T extends MCPToolContract> = T['stream'] extends true
  ? StreamingToolFunction<T>
  : ToolFunction<T>;

// The resulting contract client type
export type MCPContractClient<T extends MCPContractDefinition> = {
  [K in keyof T]: MCPToolFunction<T[K]>;
} & {
  /** Get raw tool result without schema validation */
  raw: <K extends keyof T>(
    name: K,
    args: T[K]['inputSchema'] extends ZodSchema ? z.infer<T[K]['inputSchema']> : Record<string, unknown>
  ) => Promise<MCPToolResult>;
  /** List all contract tools */
  list: () => Array<{ name: string; description?: string; inputSchema?: ZodSchema }>;
  /** Check if a tool exists in the contract */
  has: (name: string) => boolean;
};

/**
 * Error thrown when MCP tool validation fails
 */
export class MCPContractError extends Error {
  constructor(
    public toolName: string,
    public validationType: 'input' | 'output',
    public originalError: Error
  ) {
    super(`MCP Contract Error [${toolName}] ${validationType} validation failed: ${originalError.message}`);
    this.name = 'MCPContractError';
  }
}

/**
 * Create a type-safe MCP contract client
 *
 * @example
 * ```typescript
 * const mcp = createMCPClient({ endpoint: 'http://localhost:3000/mcp' });
 * await mcp.connect();
 *
 * const tools = createMCPContract(mcp, {
 *   getWeather: {
 *     inputSchema: z.object({ location: z.string() }),
 *     outputSchema: z.object({ temp: z.number(), conditions: z.string() })
 *   },
 *   chat: {
 *     inputSchema: z.object({ message: z.string() }),
 *     stream: true
 *   }
 * });
 *
 * // Validated, type-safe call
 * const weather = await tools.getWeather({ location: 'NYC' });
 * console.log(weather.temp); // typed as number
 *
 * // Streaming response
 * for await (const token of tools.chat({ message: 'Hello!' })) {
 *   process.stdout.write(token);
 * }
 * ```
 */
export function createMCPContract<T extends MCPContractDefinition>(
  mcp: MCPClient,
  contract: T
): MCPContractClient<T> {
  const proxy = {} as any;

  for (const [toolName, toolDef] of Object.entries(contract)) {
    if (toolDef.stream) {
      // Streaming tool - returns AsyncGenerator
      proxy[toolName] = async function* (args: any = {}) {
        // Validate input
        let validatedArgs = args;
        if (toolDef.inputSchema) {
          try {
            validatedArgs = toolDef.inputSchema.parse(args);
          } catch (err) {
            throw new MCPContractError(toolName, 'input', err as Error);
          }
        }

        // Call tool and stream response
        const result = await mcp.tools.call(toolName, validatedArgs);

        // Yield text content as stream chunks
        for (const content of result.content) {
          if (content.type === 'text' && content.text) {
            yield content.text;
          }
        }
      };
    } else {
      // Non-streaming tool - returns Promise
      proxy[toolName] = async (args: any = {}) => {
        // Validate input
        let validatedArgs = args;
        if (toolDef.inputSchema) {
          try {
            validatedArgs = toolDef.inputSchema.parse(args);
          } catch (err) {
            throw new MCPContractError(toolName, 'input', err as Error);
          }
        }

        // Call tool
        const result = await mcp.tools.call(toolName, validatedArgs);

        // Extract text content
        const textContent = result.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map((c) => c.text)
          .join('');

        // Try to parse as JSON if outputSchema exists
        if (toolDef.outputSchema) {
          try {
            const parsed = JSON.parse(textContent);
            return toolDef.outputSchema.parse(parsed);
          } catch (err) {
            // If JSON parse fails, try parsing raw text
            try {
              return toolDef.outputSchema.parse(textContent);
            } catch (validationErr) {
              throw new MCPContractError(toolName, 'output', validationErr as Error);
            }
          }
        }

        // Return raw result if no output schema
        return result;
      };
    }
  }

  // Add utility methods
  proxy.raw = async (name: string, args: any = {}) => {
    const toolDef = contract[name];

    // Validate input if schema exists
    let validatedArgs = args;
    if (toolDef?.inputSchema) {
      try {
        validatedArgs = toolDef.inputSchema.parse(args);
      } catch (err) {
        throw new MCPContractError(name, 'input', err as Error);
      }
    }

    return mcp.tools.call(name, validatedArgs);
  };

  proxy.list = () => {
    return Object.entries(contract).map(([name, def]) => ({
      name,
      description: def.description,
      inputSchema: def.inputSchema,
    }));
  };

  proxy.has = (name: string) => {
    return name in contract;
  };

  return proxy;
}

/**
 * Create a simple string-in, stream-out interface for MCP tools
 *
 * Perfect for chat/completion interfaces where you just send text and get text back.
 *
 * @example
 * ```typescript
 * const chat = createMCPStream(mcp, 'chat_completion');
 *
 * // Simple streaming call
 * for await (const chunk of chat('Tell me a joke')) {
 *   process.stdout.write(chunk);
 * }
 *
 * // Or collect all at once
 * const response = await chat.text('What is 2+2?');
 * ```
 */
export function createMCPStream(
  mcp: MCPClient,
  toolName: string,
  options: {
    /** The parameter name for the input string (default: 'prompt') */
    inputParam?: string;
    /** Additional fixed parameters to include */
    extraParams?: Record<string, unknown>;
  } = {}
): MCPStreamFunction {
  const { inputParam = 'prompt', extraParams = {} } = options;

  const streamFn = async function* (input: string): AsyncGenerator<string> {
    const args = { [inputParam]: input, ...extraParams };
    const result = await mcp.tools.call(toolName, args);

    for (const content of result.content) {
      if (content.type === 'text' && content.text) {
        yield content.text;
      }
    }
  };

  // Add text() helper to collect all chunks
  (streamFn as MCPStreamFunction).text = async (input: string): Promise<string> => {
    const chunks: string[] = [];
    for await (const chunk of streamFn(input)) {
      chunks.push(chunk);
    }
    return chunks.join('');
  };

  // Add json() helper to parse response as JSON
  (streamFn as MCPStreamFunction).json = async <T = unknown>(input: string): Promise<T> => {
    const text = await (streamFn as MCPStreamFunction).text(input);
    return JSON.parse(text);
  };

  return streamFn as MCPStreamFunction;
}

export interface MCPStreamFunction {
  (input: string): AsyncGenerator<string>;
  /** Collect all chunks and return as string */
  text(input: string): Promise<string>;
  /** Collect all chunks and parse as JSON */
  json<T = unknown>(input: string): Promise<T>;
}

/**
 * Create a batch contract caller for multiple tools
 *
 * @example
 * ```typescript
 * const batch = createMCPBatch(mcp, contract);
 *
 * const results = await batch([
 *   { tool: 'getUser', args: { id: '123' } },
 *   { tool: 'getUser', args: { id: '456' } },
 *   { tool: 'getSettings' }
 * ]);
 * ```
 */
export function createMCPBatch<T extends MCPContractDefinition>(
  mcp: MCPClient,
  contract: T
) {
  return async <K extends keyof T>(
    calls: Array<{
      tool: K;
      args?: T[K]['inputSchema'] extends ZodSchema ? z.infer<T[K]['inputSchema']> : Record<string, unknown>;
    }>
  ): Promise<Array<{ success: boolean; result?: any; error?: Error }>> => {
    const results = await Promise.allSettled(
      calls.map(async ({ tool, args }) => {
        const toolDef = contract[tool as string];

        // Validate input
        let validatedArgs: Record<string, unknown> = (args || {}) as Record<string, unknown>;
        if (toolDef?.inputSchema) {
          validatedArgs = toolDef.inputSchema.parse(args) as Record<string, unknown>;
        }

        const result = await mcp.tools.call(tool as string, validatedArgs);

        // Parse output if schema exists
        if (toolDef?.outputSchema) {
          const textContent = result.content
            .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
            .map((c) => c.text)
            .join('');

          try {
            const parsed = JSON.parse(textContent);
            return toolDef.outputSchema.parse(parsed);
          } catch {
            return toolDef.outputSchema.parse(textContent);
          }
        }

        return result;
      })
    );

    return results.map((r) => {
      if (r.status === 'fulfilled') {
        return { success: true, result: r.value };
      } else {
        return { success: false, error: r.reason };
      }
    });
  };
}

// ============================================================================
// SSE Streaming Support
// ============================================================================

export interface SSEStreamOptions {
  /** The parameter name for the input string (default: 'prompt') */
  inputParam?: string;
  /** Additional fixed parameters to include in the request body */
  extraParams?: Record<string, unknown>;
  /** SSE event type to listen for (default: 'message', also accepts 'delta', 'chunk', etc.) */
  eventType?: string | string[];
  /** Custom data extractor from SSE event (default: returns event.data) */
  extractData?: (event: SSEEvent) => string | null;
  /** Signal to abort the stream */
  signal?: AbortSignal;
  /** Timeout in milliseconds */
  timeout?: number;
}

export interface SSEStreamFunction {
  (input: string, options?: Pick<SSEStreamOptions, 'signal' | 'timeout'>): AsyncGenerator<string>;
  /** Collect all chunks and return as string */
  text(input: string, options?: Pick<SSEStreamOptions, 'signal' | 'timeout'>): Promise<string>;
  /** Collect all chunks and parse as JSON */
  json<T = unknown>(input: string, options?: Pick<SSEStreamOptions, 'signal' | 'timeout'>): Promise<T>;
  /** Get raw SSE events */
  events(input: string, options?: Pick<SSEStreamOptions, 'signal' | 'timeout'>): AsyncGenerator<SSEEvent>;
}

/**
 * Create a real-time SSE streaming interface
 *
 * This connects to an SSE endpoint and yields chunks as they arrive in real-time.
 * Perfect for LLM completions, live updates, and any server-sent event stream.
 *
 * @example
 * ```typescript
 * const client = createClient({ baseUrl: 'https://api.example.com' });
 *
 * // Simple usage - streams text chunks
 * const chat = createMCPSSEStream(client, '/v1/chat/stream');
 * for await (const chunk of chat('Tell me a joke')) {
 *   process.stdout.write(chunk);
 * }
 *
 * // Collect all at once
 * const response = await chat.text('What is 2+2?');
 *
 * // Parse final result as JSON
 * const data = await chat.json<{ answer: number }>('Calculate 2+2');
 *
 * // Access raw SSE events
 * for await (const event of chat.events('Hello')) {
 *   console.log(event.event, event.data);
 * }
 *
 * // With custom event type (e.g., OpenAI uses 'delta')
 * const openai = createMCPSSEStream(client, '/v1/completions', {
 *   inputParam: 'prompt',
 *   eventType: ['delta', 'message'],
    *   extraParams: { model: 'gpt-5.1', stream: true } * });
 * ```
 */
export function createMCPSSEStream(
  client: Client,
  endpoint: string,
  options: SSEStreamOptions = {}
): SSEStreamFunction {
  const {
    inputParam = 'prompt',
    extraParams = {},
    eventType = 'message',
    extractData = (event: SSEEvent) => event.data,
  } = options;

  const eventTypes = Array.isArray(eventType) ? eventType : [eventType];

  // Raw SSE events generator
  async function* streamEvents(
    input: string,
    callOptions?: Pick<SSEStreamOptions, 'signal' | 'timeout'>
  ): AsyncGenerator<SSEEvent> {
    const body = { [inputParam]: input, ...extraParams };

    const response = await client.post(endpoint, {
      json: body,
      signal: callOptions?.signal,
      timeout: callOptions?.timeout,
      headers: {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });

    for await (const event of response.sse()) {
      yield event;
    }
  }

  // Text chunks generator (filters by event type)
  async function* streamText(
    input: string,
    callOptions?: Pick<SSEStreamOptions, 'signal' | 'timeout'>
  ): AsyncGenerator<string> {
    for await (const event of streamEvents(input, callOptions)) {
      // Skip events that don't match our type filter
      // 'message' is the default event type when no event: field is present
      const eventName = event.event || 'message';
      if (!eventTypes.includes(eventName)) continue;

      // Skip [DONE] markers (common in OpenAI streams)
      if (event.data === '[DONE]') continue;

      // Extract data using custom extractor or default
      const data = extractData(event);
      if (data !== null && data !== undefined && data !== '') {
        yield data;
      }
    }
  }

  // Create the main function
  const fn = streamText as SSEStreamFunction;

  // Add text() helper
  fn.text = async (
    input: string,
    callOptions?: Pick<SSEStreamOptions, 'signal' | 'timeout'>
  ): Promise<string> => {
    const chunks: string[] = [];
    for await (const chunk of streamText(input, callOptions)) {
      chunks.push(chunk);
    }
    return chunks.join('');
  };

  // Add json() helper
  fn.json = async <T = unknown>(
    input: string,
    callOptions?: Pick<SSEStreamOptions, 'signal' | 'timeout'>
  ): Promise<T> => {
    const text = await fn.text(input, callOptions);
    return JSON.parse(text);
  };

  // Add events() helper for raw access
  fn.events = streamEvents;

  return fn;
}

/**
 * Create an SSE stream with schema validation
 *
 * Similar to createMCPSSEStream but with Zod schema validation for input.
 *
 * @example
 * ```typescript
 * const chat = createValidatedSSEStream(client, '/chat', {
 *   inputSchema: z.object({
 *     prompt: z.string().min(1),
 *     temperature: z.number().min(0).max(2).optional()
 *   })
 * });
 *
 * // Type-safe and validated
 * for await (const chunk of chat({ prompt: 'Hello', temperature: 0.7 })) {
 *   process.stdout.write(chunk);
 * }
 * ```
 */
export function createValidatedSSEStream<T extends ZodSchema>(
  client: Client,
  endpoint: string,
  options: SSEStreamOptions & {
    inputSchema: T;
  }
): {
  (args: z.infer<T>, callOptions?: Pick<SSEStreamOptions, 'signal' | 'timeout'>): AsyncGenerator<string>;
  text(args: z.infer<T>, callOptions?: Pick<SSEStreamOptions, 'signal' | 'timeout'>): Promise<string>;
  json<R = unknown>(args: z.infer<T>, callOptions?: Pick<SSEStreamOptions, 'signal' | 'timeout'>): Promise<R>;
  events(args: z.infer<T>, callOptions?: Pick<SSEStreamOptions, 'signal' | 'timeout'>): AsyncGenerator<SSEEvent>;
} {
  const {
    inputSchema,
    extraParams = {},
    eventType = 'message',
    extractData = (event: SSEEvent) => event.data,
  } = options;

  const eventTypes = Array.isArray(eventType) ? eventType : [eventType];

  // Raw SSE events generator with validation
  async function* streamEvents(
    args: z.infer<T>,
    callOptions?: Pick<SSEStreamOptions, 'signal' | 'timeout'>
  ): AsyncGenerator<SSEEvent> {
    // Validate input
    const validatedArgs = inputSchema.parse(args) as Record<string, unknown>;
    const body = { ...validatedArgs, ...extraParams };

    const response = await client.post(endpoint, {
      json: body,
      signal: callOptions?.signal,
      timeout: callOptions?.timeout,
      headers: {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });

    for await (const event of response.sse()) {
      yield event;
    }
  }

  // Text chunks generator
  async function* streamText(
    args: z.infer<T>,
    callOptions?: Pick<SSEStreamOptions, 'signal' | 'timeout'>
  ): AsyncGenerator<string> {
    for await (const event of streamEvents(args, callOptions)) {
      const eventName = event.event || 'message';
      if (!eventTypes.includes(eventName)) continue;
      if (event.data === '[DONE]') continue;

      const data = extractData(event);
      if (data !== null && data !== undefined && data !== '') {
        yield data;
      }
    }
  }

  const fn = streamText as any;

  fn.text = async (
    args: z.infer<T>,
    callOptions?: Pick<SSEStreamOptions, 'signal' | 'timeout'>
  ): Promise<string> => {
    const chunks: string[] = [];
    for await (const chunk of streamText(args, callOptions)) {
      chunks.push(chunk);
    }
    return chunks.join('');
  };

  fn.json = async <R = unknown>(
    args: z.infer<T>,
    callOptions?: Pick<SSEStreamOptions, 'signal' | 'timeout'>
  ): Promise<R> => {
    const text = await fn.text(args, callOptions);
    return JSON.parse(text);
  };

  fn.events = streamEvents;

  return fn;
}

/**
 * Parse OpenAI-style SSE stream data
 *
 * OpenAI sends JSON in the data field with choices[0].delta.content
 * This extractor handles that format automatically.
 *
 * @example
 * ```typescript
 * const openai = createMCPSSEStream(client, '/v1/chat/completions', {
    *   extractData: openAIExtractor,
    *   extraParams: { model: 'gpt-5.1', stream: true } * });
 * ```
 */
export function openAIExtractor(event: SSEEvent): string | null {
  if (!event.data || event.data === '[DONE]') return null;

  try {
    const json = JSON.parse(event.data);

    // Handle chat completions format
    if (json.choices?.[0]?.delta?.content) {
      return json.choices[0].delta.content;
    }

    // Handle legacy completions format
    if (json.choices?.[0]?.text) {
      return json.choices[0].text;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Parse Anthropic-style SSE stream data
 *
 * Anthropic sends content_block_delta events with delta.text
 *
 * @example
 * ```typescript
 * const claude = createMCPSSEStream(client, '/v1/messages', {
 *   extractData: anthropicExtractor,
 *   eventType: ['content_block_delta', 'message_delta'],
 *   extraParams: { model: 'claude-opus-4-5', stream: true }
 * });
 * ```
 */
export function anthropicExtractor(event: SSEEvent): string | null {
  if (!event.data || event.data === '[DONE]') return null;

  try {
    const json = JSON.parse(event.data);

    // Handle content_block_delta
    if (json.delta?.text) {
      return json.delta.text;
    }

    // Handle message_delta (for stop_reason, etc.)
    if (json.type === 'message_delta') {
      return null; // Skip non-content events
    }

    return null;
  } catch {
    return null;
  }
}

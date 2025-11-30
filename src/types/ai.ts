/**
 * AI Types and Interfaces
 *
 * Unified type definitions for AI communication layer.
 * Supports multiple providers (OpenAI, Anthropic, Google, Replicate, etc.)
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Supported AI providers
 */
export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'replicate'
  | 'huggingface'
  | 'ollama'
  | 'custom';

/**
 * Message role in conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Chat message
 */
export interface ChatMessage {
  role: MessageRole;
  content: string | ContentPart[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

/**
 * Content part for multi-modal messages
 */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }
  | { type: 'image'; data: Buffer | Uint8Array; mediaType: string };

/**
 * Tool/function definition
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  };
}

/**
 * Tool call from assistant
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// ============================================================================
// Token Usage
// ============================================================================

/**
 * Token usage information
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens?: number;
}

/**
 * Cost information
 */
export interface CostInfo {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
}

// ============================================================================
// Latency
// ============================================================================

/**
 * AI-specific latency metrics
 */
export interface AILatency {
  /** Time to first token (ms) */
  ttft: number;
  /** Tokens per second */
  tps: number;
  /** Total response time (ms) */
  total: number;
  /** Time spent queued (ms) */
  queued?: number;
}

// ============================================================================
// Request Options
// ============================================================================

/**
 * Timeout options for AI requests
 */
export interface AITimeoutOptions {
  /** Time to wait for first token (ms) */
  firstToken?: number;
  /** Max time between tokens (ms) - detect stalls */
  betweenTokens?: number;
  /** Total request timeout (ms) */
  total?: number;
  /** Enable adaptive timeouts based on model/history */
  adaptive?: boolean;
}

/**
 * Retry options for AI requests
 */
export interface AIRetryOptions {
  /** Error types to retry on */
  on?: Array<'rate_limit' | 'overloaded' | 'timeout' | 'context_length_exceeded' | 'server_error'>;
  /** Backoff strategy */
  backoff?: 'linear' | 'exponential' | 'decorrelated';
  /** Max retry attempts */
  maxAttempts?: number;
  /** Model fallbacks */
  fallback?: Record<string, string>;
  /** Reduce context on retry (for context_length_exceeded) */
  reduceContext?: boolean;
  /** Callback on retry */
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Response format options
 */
export type ResponseFormat =
  | { type: 'text' }
  | { type: 'json_object' }
  | { type: 'json_schema'; schema: Record<string, unknown> };

/**
 * Chat completion request options
 */
export interface ChatOptions {
  /** AI provider to use */
  provider?: AIProvider;
  /** Model identifier */
  model?: string;
  /** Conversation messages */
  messages: ChatMessage[];
  /** System prompt (convenience, prepended to messages) */
  systemPrompt?: string;
  /** Temperature (0-2) */
  temperature?: number;
  /** Top P sampling */
  topP?: number;
  /** Max tokens to generate */
  maxTokens?: number;
  /** Stop sequences */
  stop?: string[];
  /** Tools/functions available */
  tools?: ToolDefinition[];
  /** Tool choice strategy */
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  /** Response format */
  responseFormat?: ResponseFormat;
  /** Timeout options */
  timeout?: AITimeoutOptions;
  /** Retry options */
  retry?: AIRetryOptions;
  /** Request metadata */
  metadata?: Record<string, unknown>;
  /** Abort signal */
  signal?: AbortSignal;
  /** Stream response */
  stream?: boolean;
}

/**
 * Embedding request options
 */
export interface EmbedOptions {
  /** AI provider */
  provider?: AIProvider;
  /** Embedding model */
  model?: string;
  /** Text(s) to embed */
  input: string | string[];
  /** Output dimensions (if model supports) */
  dimensions?: number;
  /** Timeout */
  timeout?: number;
  /** Abort signal */
  signal?: AbortSignal;
}

// ============================================================================
// Responses
// ============================================================================

/**
 * Base AI response interface
 */
export interface AIResponse<T = string> {
  /** Response content */
  content: T;
  /** Token usage */
  usage: TokenUsage;
  /** Latency metrics */
  latency: AILatency;
  /** Model used */
  model: string;
  /** Provider used */
  provider: AIProvider;
  /** Whether response was cached */
  cached: boolean;
  /** Finish reason */
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  /** Tool calls (if any) */
  toolCalls?: ToolCall[];
  /** Cost info (if available) */
  cost?: CostInfo;
  /** Raw response from provider */
  raw?: unknown;
}

/**
 * Embedding response
 */
export interface EmbedResponse {
  /** Embedding vectors */
  embeddings: number[][];
  /** Token usage */
  usage: TokenUsage;
  /** Model used */
  model: string;
  /** Provider used */
  provider: AIProvider;
  /** Latency */
  latency: AILatency;
}

// ============================================================================
// Streaming
// ============================================================================

/**
 * Stream event types
 */
export type StreamEventType =
  | 'text'
  | 'tool_call'
  | 'tool_call_delta'
  | 'usage'
  | 'done'
  | 'error';

/**
 * Base stream event
 */
export interface BaseStreamEvent {
  type: StreamEventType;
}

/**
 * Text chunk event
 */
export interface TextStreamEvent extends BaseStreamEvent {
  type: 'text';
  content: string;
}

/**
 * Tool call event
 */
export interface ToolCallStreamEvent extends BaseStreamEvent {
  type: 'tool_call';
  toolCall: ToolCall;
}

/**
 * Tool call delta event (partial arguments)
 */
export interface ToolCallDeltaStreamEvent extends BaseStreamEvent {
  type: 'tool_call_delta';
  index: number;
  delta: {
    arguments?: string;
  };
}

/**
 * Usage event
 */
export interface UsageStreamEvent extends BaseStreamEvent {
  type: 'usage';
  usage: TokenUsage;
}

/**
 * Done event
 */
export interface DoneStreamEvent extends BaseStreamEvent {
  type: 'done';
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  usage?: TokenUsage;
}

/**
 * Error event
 */
export interface ErrorStreamEvent extends BaseStreamEvent {
  type: 'error';
  error: Error;
}

/**
 * Union of all stream events
 */
export type StreamEvent =
  | TextStreamEvent
  | ToolCallStreamEvent
  | ToolCallDeltaStreamEvent
  | UsageStreamEvent
  | DoneStreamEvent
  | ErrorStreamEvent;

/**
 * Async iterable stream of events
 */
export type AIStream = AsyncIterable<StreamEvent>;

// ============================================================================
// Provider Configuration
// ============================================================================

/**
 * Provider-specific configuration
 */
export interface ProviderConfig {
  /** API key */
  apiKey?: string;
  /** Base URL override */
  baseUrl?: string;
  /** Default model */
  defaultModel?: string;
  /** Organization ID (OpenAI) */
  organization?: string;
  /** Project ID */
  projectId?: string;
  /** Custom headers */
  headers?: Record<string, string>;
}

/**
 * AI client configuration
 */
export interface AIClientConfig {
  /** Default provider */
  defaultProvider?: AIProvider;
  /** Default model */
  defaultModel?: string;
  /** Provider configurations */
  providers?: Partial<Record<AIProvider, ProviderConfig>>;
  /** Default timeout options */
  timeout?: AITimeoutOptions;
  /** Default retry options */
  retry?: AIRetryOptions;
  /** Enable observability */
  observability?: boolean;
  /** Debug mode */
  debug?: boolean;
}

// ============================================================================
// Rate Limiting
// ============================================================================

/**
 * Token-aware rate limit configuration
 */
export interface TokenRateLimitConfig {
  /** Tokens per minute limit */
  tokensPerMinute?: number;
  /** Requests per minute limit */
  requestsPerMinute?: number;
  /** Strategy when limit hit */
  strategy?: 'queue' | 'throw' | 'retry-after';
  /** Priority function */
  priority?: (req: ChatOptions) => 'high' | 'normal' | 'low';
}

// ============================================================================
// Caching
// ============================================================================

/**
 * Semantic cache configuration
 */
export interface SemanticCacheConfig {
  /** Enable semantic caching */
  enabled?: boolean;
  /** Embedding model for similarity */
  embedder?: string;
  /** Similarity threshold (0-1) */
  similarity?: number;
  /** Cache TTL */
  ttl?: number | string;
  /** Cache storage */
  storage?: CacheStorage;
}

/**
 * Cache storage interface
 */
export interface CacheStorage {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

// ============================================================================
// AI Client Interface
// ============================================================================

/**
 * Main AI client interface
 */
export interface AIClient {
  /**
   * Send a chat completion request
   */
  chat(options: ChatOptions): Promise<AIResponse>;
  chat(prompt: string): Promise<AIResponse>;

  /**
   * Stream a chat completion
   */
  stream(options: ChatOptions): Promise<AIStream>;

  /**
   * Generate embeddings
   */
  embed(options: EmbedOptions): Promise<EmbedResponse>;

  /**
   * Create a specialized client with preset options
   */
  extend(defaults: Partial<ChatOptions>): AIClient;

  /**
   * Get metrics/stats
   */
  readonly metrics: AIMetrics;
}

/**
 * AI metrics interface
 */
export interface AIMetrics {
  /** Total requests made */
  totalRequests: number;
  /** Total tokens used */
  totalTokens: number;
  /** Total cost */
  totalCost: number;
  /** Average latency */
  avgLatency: { ttft: number; total: number };
  /** Error rate */
  errorRate: number;
  /** Cache hit rate */
  cacheHitRate: number;
  /** Get summary */
  summary(): AIMetricsSummary;
  /** Reset metrics */
  reset(): void;
}

/**
 * AI metrics summary
 */
export interface AIMetricsSummary {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  avgLatency: { ttft: number; total: number };
  errorRate: number;
  cacheHitRate: number;
  byModel: Record<string, { requests: number; tokens: number; cost: number }>;
  byProvider: Record<string, { requests: number; tokens: number; cost: number }>;
}

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Agent tool handler
 */
export interface AgentTool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** AI provider */
  provider?: AIProvider;
  /** Model to use */
  model?: string;
  /** System prompt */
  systemPrompt?: string;
  /** Available tools */
  tools?: AgentTool[];
  /** Max iterations */
  maxIterations?: number;
  /** Timeout per iteration */
  iterationTimeout?: number;
}

/**
 * Agent event types
 */
export type AgentEventType =
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'text'
  | 'done'
  | 'error';

/**
 * Agent stream event
 */
export interface AgentStreamEvent {
  type: AgentEventType;
  content?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: Error;
}

/**
 * Agent interface
 */
export interface Agent {
  /**
   * Run the agent with a prompt
   */
  run(prompt: string): Promise<AIResponse>;

  /**
   * Stream agent execution
   */
  stream(prompt: string): AsyncIterable<AgentStreamEvent>;
}

/**
 * Recker AI Layer
 *
 * Unified AI communication across multiple providers.
 * Supports streaming, adaptive timeouts, token-aware rate limiting,
 * and automatic retries with fallbacks.
 *
 * @example
 * ```typescript
 * import { ai, createAIClient } from 'recker/ai';
 *
 * // Simple usage with default client
 * const response = await ai.chat('Hello, how are you?');
 * console.log(response.content);
 *
 * // With options
 * const response = await ai.chat({
 *   provider: 'anthropic',
 *   model: 'claude-sonnet-4-20250514',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   temperature: 0.7,
 * });
 *
 * // Streaming
 * const stream = await ai.stream({
 *   model: 'gpt-5.1',
 *   messages: [{ role: 'user', content: 'Write a poem' }],
 * });
 *
 * for await (const event of stream) {
 *   if (event.type === 'text') {
 *     process.stdout.write(event.content);
 *   }
 * }
 *
 * // Embeddings
 * const embedding = await ai.embed({
 *   input: 'Hello world',
 *   model: 'text-embedding-3-large',
 * });
 *
 * // Create specialized client
 * const codeClient = ai.extend({
 *   model: 'gpt-5.1',
 *   systemPrompt: 'You are a coding assistant.',
 *   temperature: 0,
 * });
 *
 * // Custom client with config
 * const myClient = createAIClient({
 *   defaultProvider: 'anthropic',
 *   timeout: { firstToken: 30000, total: 120000 },
 *   retry: { maxAttempts: 3, fallback: { 'claude-opus-4': 'claude-sonnet-4' } },
 *   debug: true,
 * });
 * ```
 */

// Main client
export { AIClientImpl, createAIClient, ai } from './client.js';

// Providers
export { BaseAIProvider, AIError, RateLimitError, ContextLengthError, OverloadedError, AuthenticationError } from './providers/base.js';
export { OpenAIProvider } from './providers/openai.js';
export { AnthropicProvider } from './providers/anthropic.js';

// Adaptive timeouts
export { AdaptiveTimeoutManager, StreamTimeoutController, adaptiveTimeouts } from './adaptive-timeout.js';

// Rate limiting
export {
  TokenRateLimiter,
  RateLimitExceededError,
  createRateLimiter,
  tokenEstimators,
  PROVIDER_RATE_LIMITS,
} from './rate-limiter.js';

// Types
export type {
  // Core types
  AIProvider,
  MessageRole,
  ChatMessage,
  ContentPart,
  ToolDefinition,
  ToolCall,

  // Token usage
  TokenUsage,
  CostInfo,
  AILatency,

  // Options
  AITimeoutOptions,
  AIRetryOptions,
  ResponseFormat,
  ChatOptions,
  EmbedOptions,

  // Responses
  AIResponse,
  EmbedResponse,

  // Streaming
  StreamEventType,
  StreamEvent,
  TextStreamEvent,
  ToolCallStreamEvent,
  ToolCallDeltaStreamEvent,
  UsageStreamEvent,
  DoneStreamEvent,
  ErrorStreamEvent,
  AIStream,

  // Configuration
  ProviderConfig,
  AIClientConfig,
  TokenRateLimitConfig,
  SemanticCacheConfig,
  CacheStorage,

  // Client interface
  AIClient,
  AIMetrics,
  AIMetricsSummary,

  // Agent types
  AgentTool,
  AgentConfig,
  AgentEventType,
  AgentStreamEvent,
  Agent,
} from '../types/ai.js';

// Provider config types
export type { OpenAIConfig } from './providers/openai.js';
export type { AnthropicConfig } from './providers/anthropic.js';

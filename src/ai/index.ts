/**
 * Recker AI Layer
 *
 * Unified AI communication across multiple providers.
 * Supports streaming, adaptive timeouts, token-aware rate limiting,
 * and automatic retries with fallbacks.
 *
 * @example
 * ```typescript
 * import { createAI } from 'recker/ai';
 *
 * // Create AI client
 * const ai = createAI({
 *   defaultProvider: 'openai',
 *   providers: {
 *     openai: { apiKey: process.env.OPENAI_API_KEY }
 *   }
 * });
 *
 * // Simple chat
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
 *   model: 'gpt-4o',
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
 *   model: 'gpt-4o',
 *   systemPrompt: 'You are a coding assistant.',
 *   temperature: 0,
 * });
 * ```
 */

// Main client
export { UnifiedAIClient, createAI } from './client.js';

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

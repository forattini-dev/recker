/**
 * AI Client Integration Types
 *
 * Types for integrating AI capabilities directly into the HTTP Client.
 * Provides chat() with memory and prompt() without memory.
 */

import type { AIResponse, AIStream, ChatMessage, AIProvider } from './ai.js';

// ============================================================================
// Memory Configuration
// ============================================================================

/**
 * Configuration for conversation memory
 */
export interface AIMemoryConfig {
  /**
   * Maximum number of message pairs to keep (user + assistant = 1 pair)
   * @default 12
   */
  maxPairs?: number;

  /**
   * System prompt to always include at the beginning
   */
  systemPrompt?: string;
}

// ============================================================================
// AI Config from Presets
// ============================================================================

/**
 * AI configuration returned by presets (internal)
 * Used to detect AI-enabled presets and configure the ClientAI
 */
export interface PresetAIConfig {
  /** AI provider type */
  provider: AIProvider;
  /** API key for the provider */
  apiKey?: string;
  /** Default model to use */
  model: string;
  /** Base URL for API requests */
  baseUrl?: string;
  /** Memory configuration */
  memory?: AIMemoryConfig;
  /** Organization ID (OpenAI) */
  organization?: string;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Azure resource name */
  resourceName?: string;
  /** Azure deployment name */
  deploymentName?: string;
  /** Azure API version */
  apiVersion?: string;
}

// ============================================================================
// Client AI Interface
// ============================================================================

/**
 * AI interface exposed on Client via client.ai
 *
 * @example
 * ```typescript
 * import { createClient } from 'recker';
 * import { openai } from 'recker/presets';
 *
 * const client = createClient(openai({ apiKey: 'sk-...' }));
 *
 * // Chat with memory (maintains conversation history)
 * await client.ai.chat('Hello!');
 * await client.ai.chat('What did I just say?'); // Remembers context
 *
 * // Single prompt without memory
 * await client.ai.prompt('List 10 CPU models from 2025');
 *
 * // Streaming
 * for await (const event of await client.ai.chatStream('Tell me a story')) {
 *   if (event.type === 'text') process.stdout.write(event.content);
 * }
 * ```
 */
export interface ClientAI {
  /**
   * Send a chat message WITH memory
   * Maintains conversation history (sliding window of 12 pairs by default)
   *
   * @param prompt - User message
   * @returns AI response
   */
  chat(prompt: string): Promise<AIResponse>;

  /**
   * Stream a chat response WITH memory
   *
   * @param prompt - User message
   * @returns Async iterable of stream events
   */
  chatStream(prompt: string): Promise<AIStream>;

  /**
   * Send a single prompt WITHOUT memory
   * Stateless, no conversation history maintained
   *
   * @param prompt - User message
   * @returns AI response
   */
  prompt(prompt: string): Promise<AIResponse>;

  /**
   * Stream a single prompt WITHOUT memory
   *
   * @param prompt - User message
   * @returns Async iterable of stream events
   */
  promptStream(prompt: string): Promise<AIStream>;

  /**
   * Clear conversation memory
   * Resets the chat history but keeps system prompt
   */
  clearMemory(): void;

  /**
   * Get current conversation history
   * Returns readonly array of messages
   */
  getMemory(): readonly ChatMessage[];

  /**
   * Update memory configuration
   *
   * @param config - New memory configuration (partial)
   */
  setMemoryConfig(config: Partial<AIMemoryConfig>): void;

  /**
   * Get current memory configuration
   */
  getMemoryConfig(): AIMemoryConfig;

  /**
   * Get the AI provider name
   */
  readonly provider: AIProvider;

  /**
   * Get the current model
   */
  readonly model: string;
}

// ============================================================================
// Extended Client Options
// ============================================================================

/**
 * Extended client options with AI config (internal)
 */
export interface ClientOptionsWithAI {
  /**
   * AI configuration from preset (internal, set by AI presets)
   * @internal
   */
  _aiConfig?: PresetAIConfig;
}

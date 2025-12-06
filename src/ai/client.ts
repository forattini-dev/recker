/**
 * Unified AI Client
 *
 * Single interface for all AI providers.
 * Handles provider routing, fallbacks, and observability.
 */

import type {
  AIProvider,
  AIClient,
  AIClientConfig,
  ChatOptions,
  AIResponse,
  AIStream,
  EmbedOptions,
  EmbedResponse,
  AIMetrics,
  AIMetricsSummary,
  ChatMessage,
} from '../types/ai.js';
import { BaseAIProvider, AIError, RateLimitError, ContextLengthError, OverloadedError } from './providers/base.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GoogleProvider } from './providers/google.js';
import { OllamaProvider } from './providers/ollama.js';

/**
 * Internal metrics storage
 */
interface MetricsData {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  totalLatencyTtft: number;
  totalLatencyTotal: number;
  errorCount: number;
  cacheHits: number;
  byModel: Map<string, { requests: number; tokens: number; cost: number }>;
  byProvider: Map<string, { requests: number; tokens: number; cost: number }>;
}

/**
 * AI Metrics tracker
 */
class AIMetricsTracker implements AIMetrics {
  private data: MetricsData = {
    totalRequests: 0,
    totalTokens: 0,
    totalCost: 0,
    totalLatencyTtft: 0,
    totalLatencyTotal: 0,
    errorCount: 0,
    cacheHits: 0,
    byModel: new Map(),
    byProvider: new Map(),
  };

  get totalRequests(): number {
    return this.data.totalRequests;
  }

  get totalTokens(): number {
    return this.data.totalTokens;
  }

  get totalCost(): number {
    return this.data.totalCost;
  }

  get avgLatency(): { ttft: number; total: number } {
    const count = this.data.totalRequests || 1;
    return {
      ttft: this.data.totalLatencyTtft / count,
      total: this.data.totalLatencyTotal / count,
    };
  }

  get errorRate(): number {
    const total = this.data.totalRequests + this.data.errorCount;
    return total > 0 ? this.data.errorCount / total : 0;
  }

  get cacheHitRate(): number {
    return this.data.totalRequests > 0
      ? this.data.cacheHits / this.data.totalRequests
      : 0;
  }

  record(response: AIResponse): void {
    this.data.totalRequests++;
    this.data.totalTokens += response.usage.totalTokens;
    this.data.totalCost += response.cost?.totalCost || 0;
    this.data.totalLatencyTtft += response.latency.ttft;
    this.data.totalLatencyTotal += response.latency.total;

    if (response.cached) {
      this.data.cacheHits++;
    }

    // Update by model
    const modelStats = this.data.byModel.get(response.model) || { requests: 0, tokens: 0, cost: 0 };
    modelStats.requests++;
    modelStats.tokens += response.usage.totalTokens;
    modelStats.cost += response.cost?.totalCost || 0;
    this.data.byModel.set(response.model, modelStats);

    // Update by provider
    const providerStats = this.data.byProvider.get(response.provider) || { requests: 0, tokens: 0, cost: 0 };
    providerStats.requests++;
    providerStats.tokens += response.usage.totalTokens;
    providerStats.cost += response.cost?.totalCost || 0;
    this.data.byProvider.set(response.provider, providerStats);
  }

  recordError(): void {
    this.data.errorCount++;
  }

  summary(): AIMetricsSummary {
    return {
      totalRequests: this.totalRequests,
      totalTokens: this.totalTokens,
      totalCost: this.totalCost,
      avgLatency: this.avgLatency,
      errorRate: this.errorRate,
      cacheHitRate: this.cacheHitRate,
      byModel: Object.fromEntries(this.data.byModel),
      byProvider: Object.fromEntries(this.data.byProvider),
    };
  }

  reset(): void {
    this.data = {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      totalLatencyTtft: 0,
      totalLatencyTotal: 0,
      errorCount: 0,
      cacheHits: 0,
      byModel: new Map(),
      byProvider: new Map(),
    };
  }
}

/**
 * Unified AI Client
 *
 * @example
 * ```typescript
 * import { createAI } from 'recker/ai';
 *
 * const ai = createAI({
 *   defaultProvider: 'openai',
 *   providers: {
 *     openai: { apiKey: process.env.OPENAI_API_KEY }
 *   }
 * });
 *
 * const response = await ai.chat('Hello!');
 * console.log(response.content);
 * ```
 */
export class UnifiedAIClient implements AIClient {
  private config: AIClientConfig;
  private providers: Map<AIProvider, BaseAIProvider> = new Map();
  private _metrics: AIMetricsTracker = new AIMetricsTracker();

  constructor(config: AIClientConfig = {}) {
    this.config = {
      defaultProvider: 'openai',
      observability: true,
      debug: false,
      ...config,
    };

    // Initialize configured providers
    this.initializeProviders();
  }

  /**
   * Get metrics
   */
  get metrics(): AIMetrics {
    return this._metrics;
  }

  /**
   * Send a chat completion request
   */
  async chat(optionsOrPrompt: ChatOptions | string): Promise<AIResponse> {
    const options = this.normalizeOptions(optionsOrPrompt);
    const provider = this.getProvider(options.provider);

    try {
      const response = await this.executeWithRetry(
        () => provider.chat(options),
        options
      );

      if (this.config.observability) {
        this._metrics.record(response);
      }

      if (this.config.debug) {
        this.logResponse(response);
      }

      return response;
    } catch (error) {
      if (this.config.observability) {
        this._metrics.recordError();
      }
      throw error;
    }
  }

  /**
   * Stream a chat completion
   */
  async stream(options: ChatOptions): Promise<AIStream> {
    const provider = this.getProvider(options.provider);
    return provider.stream(options);
  }

  /**
   * Generate embeddings
   */
  async embed(options: EmbedOptions): Promise<EmbedResponse> {
    const provider = this.getProvider(options.provider);
    return provider.embed(options);
  }

  /**
   * Create a specialized client with preset options
   */
  extend(defaults: Partial<ChatOptions>): AIClient {
    const parent = this;

    return {
      chat: async (optionsOrPrompt: ChatOptions | string) => {
        const options = parent.normalizeOptions(optionsOrPrompt);
        return parent.chat({ ...defaults, ...options, messages: [...(defaults.messages || []), ...options.messages] });
      },
      stream: async (options: ChatOptions) => {
        return parent.stream({ ...defaults, ...options, messages: [...(defaults.messages || []), ...options.messages] });
      },
      embed: async (options: EmbedOptions) => {
        return parent.embed({ provider: defaults.provider, ...options });
      },
      extend: (moreDefaults: Partial<ChatOptions>) => {
        return parent.extend({ ...defaults, ...moreDefaults });
      },
      metrics: parent.metrics,
    };
  }

  /**
   * Initialize providers based on config
   */
  private initializeProviders(): void {
    // OpenAI
    const openaiConfig = this.config.providers?.openai || {};
    this.providers.set('openai', new OpenAIProvider(openaiConfig));

    // Anthropic
    const anthropicConfig = this.config.providers?.anthropic || {};
    this.providers.set('anthropic', new AnthropicProvider(anthropicConfig));

    // Google
    const googleConfig = this.config.providers?.google || {};
    this.providers.set('google', new GoogleProvider(googleConfig));

    // Ollama
    const ollamaConfig = this.config.providers?.ollama || {};
    this.providers.set('ollama', new OllamaProvider(ollamaConfig));

    // TODO: Add more providers (Replicate, etc.)
  }

  /**
   * Get provider by name
   */
  private getProvider(name?: AIProvider): BaseAIProvider {
    const providerName = name || this.config.defaultProvider || 'openai';
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new AIError(
        `Provider not found: ${providerName}`,
        providerName,
        'provider_not_found'
      );
    }

    return provider;
  }

  /**
   * Normalize options (handle string prompt shorthand)
   */
  private normalizeOptions(optionsOrPrompt: ChatOptions | string): ChatOptions {
    if (typeof optionsOrPrompt === 'string') {
      return {
        messages: [{ role: 'user', content: optionsOrPrompt }],
      };
    }
    return optionsOrPrompt;
  }

  /**
   * Execute with retry logic
   */
  private async executeWithRetry(
    fn: () => Promise<AIResponse>,
    options: ChatOptions
  ): Promise<AIResponse> {
    const retryConfig = options.retry || this.config.retry;
    if (!retryConfig) {
      return fn();
    }

    const maxAttempts = retryConfig.maxAttempts || 3;
    const retryOn = retryConfig.on || ['rate_limit', 'overloaded', 'timeout'];
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (!this.shouldRetry(error as Error, retryOn, attempt, maxAttempts)) {
          throw error;
        }

        // Calculate backoff delay
        const delay = this.calculateBackoff(attempt, retryConfig.backoff);

        // Notify retry callback
        if (retryConfig.onRetry) {
          retryConfig.onRetry(attempt, error as Error);
        }

        if (this.config.debug) {
          console.log(`[recker/ai] Retry ${attempt}/${maxAttempts} after ${delay}ms`);
        }

        // Wait and retry
        await this.sleep(delay);

        // Try fallback model if available
        if (retryConfig.fallback && options.model) {
          const fallbackModel = retryConfig.fallback[options.model];
          if (fallbackModel) {
            options = { ...options, model: fallbackModel };
            if (this.config.debug) {
              console.log(`[recker/ai] Falling back to model: ${fallbackModel}`);
            }
          }
        }

        // Reduce context if needed
        if (
          retryConfig.reduceContext &&
          error instanceof ContextLengthError &&
          options.messages.length > 2
        ) {
          options = {
            ...options,
            messages: this.reduceContext(options.messages),
          };
          if (this.config.debug) {
            console.log(`[recker/ai] Reduced context to ${options.messages.length} messages`);
          }
        }
      }
    }

    throw lastError || new Error('Retry exhausted');
  }

  /**
   * Check if error should trigger retry
   */
  private shouldRetry(
    error: Error,
    retryOn: string[],
    attempt: number,
    maxAttempts: number
  ): boolean {
    if (attempt >= maxAttempts) return false;

    if (error instanceof RateLimitError && retryOn.includes('rate_limit')) return true;
    if (error instanceof OverloadedError && retryOn.includes('overloaded')) return true;
    if (error instanceof ContextLengthError && retryOn.includes('context_length_exceeded')) return true;
    if (error.name === 'TimeoutError' && retryOn.includes('timeout')) return true;
    if (error instanceof AIError && error.retryable && retryOn.includes('server_error')) return true;

    return false;
  }

  /**
   * Calculate backoff delay
   */
  private calculateBackoff(
    attempt: number,
    strategy: 'linear' | 'exponential' | 'decorrelated' = 'exponential'
  ): number {
    const baseDelay = 1000;
    const maxDelay = 30000;

    let delay: number;

    switch (strategy) {
      case 'linear':
        delay = baseDelay * attempt;
        break;
      case 'exponential':
        delay = baseDelay * Math.pow(2, attempt - 1);
        break;
      case 'decorrelated':
        // AWS decorrelated jitter
        delay = Math.random() * Math.min(maxDelay, baseDelay * Math.pow(3, attempt - 1));
        break;
      default:
        delay = baseDelay * attempt;
    }

    // Add jitter (±25%)
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.min(maxDelay, delay + jitter);
  }

  /**
   * Reduce context by removing middle messages
   */
  private reduceContext(messages: ChatMessage[]): ChatMessage[] {
    if (messages.length <= 2) return messages;

    // Keep system message (if any), first user message, and last few messages
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    if (nonSystemMessages.length <= 4) {
      return messages;
    }

    // Keep first and last 2 non-system messages
    const reduced = [
      ...systemMessages,
      nonSystemMessages[0],
      ...nonSystemMessages.slice(-2),
    ];

    return reduced;
  }

  /**
   * Log response for debugging
   */
  private logResponse(response: AIResponse): void {
    console.log(`[recker/ai] ${response.provider}/${response.model}`);
    console.log(`  Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);
    console.log(`  Latency: TTFT=${response.latency.ttft.toFixed(0)}ms, Total=${response.latency.total.toFixed(0)}ms`);
    if (response.cost) {
      console.log(`  Cost: $${response.cost.totalCost.toFixed(6)}`);
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create an AI client
 *
 * @example
 * ```typescript
 * import { createAI } from 'recker/ai';
 *
 * const ai = createAI({
 *   defaultProvider: 'openai',
 *   debug: true
 * });
 *
 * const response = await ai.chat('Hello!');
 * ```
 */
export function createAI(config?: AIClientConfig): AIClient {
  return new UnifiedAIClient(config);
}

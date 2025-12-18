/**
 * MCP AI Tools
 *
 * Tools for interacting with AI providers through the unified AI client.
 *
 * Supported providers:
 * - OpenAI (GPT-4, GPT-4o, o1, etc.)
 * - Anthropic (Claude 3.5, Claude 3, etc.)
 * - Google (Gemini 1.5, Gemini 2.0)
 * - Ollama (local models)
 * - Groq, Together, Replicate, HuggingFace, etc.
 */

import { createAI, type AIClient } from '../../ai/index.js';
import type { MCPTool, MCPToolResult } from '../types.js';
import type { MCPToolHandler } from './registry.js';

// Lazy-loaded AI client
let aiClient: AIClient | null = null;

/**
 * Get or create AI client
 */
function getAIClient(): AIClient {
  if (!aiClient) {
    aiClient = createAI({
      debug: false,
    });
  }
  return aiClient;
}

/**
 * Check which providers are available
 */
function getAvailableProviders(): string[] {
  const providers: string[] = [];

  if (process.env.OPENAI_API_KEY) providers.push('openai');
  if (process.env.ANTHROPIC_API_KEY) providers.push('anthropic');
  if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) providers.push('google');
  if (process.env.GROQ_API_KEY) providers.push('groq');
  if (process.env.TOGETHER_API_KEY) providers.push('together');
  if (process.env.MISTRAL_API_KEY) providers.push('mistral');
  if (process.env.COHERE_API_KEY) providers.push('cohere');
  if (process.env.PERPLEXITY_API_KEY) providers.push('perplexity');
  if (process.env.DEEPSEEK_API_KEY) providers.push('deepseek');
  if (process.env.XAI_API_KEY) providers.push('xai');
  if (process.env.FIREWORKS_API_KEY) providers.push('fireworks');
  if (process.env.REPLICATE_API_TOKEN) providers.push('replicate');
  if (process.env.HUGGINGFACE_API_KEY) providers.push('huggingface');

  // Ollama is local, always potentially available
  if (process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL) {
    providers.push('ollama');
  }

  return providers;
}

/**
 * Default models per provider
 */
const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-1.5-flash',
  groq: 'llama-3.1-70b-versatile',
  together: 'meta-llama/Llama-3-70b-chat-hf',
  mistral: 'mistral-large-latest',
  cohere: 'command-r-plus',
  perplexity: 'llama-3.1-sonar-large-128k-online',
  deepseek: 'deepseek-chat',
  xai: 'grok-beta',
  fireworks: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
  ollama: 'llama3.1',
};

/**
 * Tool handlers
 */
export const aiToolHandlers: Record<string, MCPToolHandler> = {
  /**
   * Chat with AI provider
   */
  rek_ai_chat: async (args): Promise<MCPToolResult> => {
    const prompt = args.prompt as string;
    const provider = args.provider as string | undefined;
    const model = args.model as string | undefined;
    const systemPrompt = args.system as string | undefined;
    const temperature = args.temperature as number | undefined;

    if (!prompt) {
      return {
        content: [{ type: 'text', text: 'Error: prompt is required' }],
        isError: true,
      };
    }

    const availableProviders = getAvailableProviders();
    if (availableProviders.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'Error: No AI provider configured. Set one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, or OLLAMA_HOST',
        }],
        isError: true,
      };
    }

    const selectedProvider = provider || availableProviders[0];
    if (provider && !availableProviders.includes(provider)) {
      return {
        content: [{
          type: 'text',
          text: `Error: Provider "${provider}" not configured. Available: ${availableProviders.join(', ')}`,
        }],
        isError: true,
      };
    }

    try {
      const ai = getAIClient();
      const selectedModel = model || DEFAULT_MODELS[selectedProvider] || 'gpt-4o';

      const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      const response = await ai.chat({
        provider: selectedProvider as any,
        model: selectedModel,
        messages,
        temperature: temperature ?? 0.7,
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            content: response.content,
            provider: selectedProvider,
            model: selectedModel,
            usage: response.usage,
            latency: response.latency,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error calling AI: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },

  /**
   * Generate embeddings
   */
  rek_ai_embed: async (args): Promise<MCPToolResult> => {
    const input = args.input as string;
    const model = args.model as string | undefined;
    const provider = args.provider as string | undefined;

    if (!input) {
      return {
        content: [{ type: 'text', text: 'Error: input text is required' }],
        isError: true,
      };
    }

    const availableProviders = getAvailableProviders();
    if (availableProviders.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'Error: No AI provider configured for embeddings',
        }],
        isError: true,
      };
    }

    // Prefer OpenAI for embeddings, then Cohere, then Google
    const embeddingProviders = ['openai', 'cohere', 'google'];
    const selectedProvider = provider ||
      embeddingProviders.find(p => availableProviders.includes(p)) ||
      availableProviders[0];

    try {
      const ai = getAIClient();

      const embeddingModels: Record<string, string> = {
        openai: 'text-embedding-3-small',
        cohere: 'embed-english-v3.0',
        google: 'text-embedding-004',
      };

      const response = await ai.embed({
        input,
        model: model || embeddingModels[selectedProvider] || 'text-embedding-3-small',
        provider: selectedProvider as any,
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            dimensions: response.embeddings[0].length,
            model: response.model,
            provider: selectedProvider,
            usage: response.usage,
            // Return first 10 values as preview
            preview: response.embeddings[0].slice(0, 10),
            note: `Full embedding has ${response.embeddings[0].length} dimensions`,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error generating embedding: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  },

  /**
   * List available AI providers
   */
  rek_ai_providers: async (): Promise<MCPToolResult> => {
    const available = getAvailableProviders();

    const allProviders = [
      { name: 'openai', env: 'OPENAI_API_KEY', models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini'] },
      { name: 'anthropic', env: 'ANTHROPIC_API_KEY', models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet', 'claude-3-opus', 'claude-3-haiku'] },
      { name: 'google', env: 'GOOGLE_API_KEY', models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'] },
      { name: 'groq', env: 'GROQ_API_KEY', models: ['llama-3.1-70b-versatile', 'mixtral-8x7b-32768'] },
      { name: 'together', env: 'TOGETHER_API_KEY', models: ['meta-llama/Llama-3-70b-chat-hf'] },
      { name: 'mistral', env: 'MISTRAL_API_KEY', models: ['mistral-large-latest', 'mistral-medium'] },
      { name: 'cohere', env: 'COHERE_API_KEY', models: ['command-r-plus', 'command-r'] },
      { name: 'perplexity', env: 'PERPLEXITY_API_KEY', models: ['llama-3.1-sonar-large-128k-online'] },
      { name: 'deepseek', env: 'DEEPSEEK_API_KEY', models: ['deepseek-chat', 'deepseek-coder'] },
      { name: 'xai', env: 'XAI_API_KEY', models: ['grok-beta'] },
      { name: 'fireworks', env: 'FIREWORKS_API_KEY', models: ['llama-v3p1-70b-instruct'] },
      { name: 'replicate', env: 'REPLICATE_API_TOKEN', models: ['meta/llama-2-70b-chat'] },
      { name: 'huggingface', env: 'HUGGINGFACE_API_KEY', models: ['various'] },
      { name: 'ollama', env: 'OLLAMA_HOST', models: ['llama3.1', 'codellama', 'mistral'] },
    ];

    const result = {
      configured: available,
      configuredCount: available.length,
      allProviders: allProviders.map(p => ({
        ...p,
        configured: available.includes(p.name),
      })),
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  },

  /**
   * Estimate tokens for text
   */
  rek_ai_tokens: async (args): Promise<MCPToolResult> => {
    const text = args.text as string;

    if (!text) {
      return {
        content: [{ type: 'text', text: 'Error: text is required' }],
        isError: true,
      };
    }

    // Simple estimation: ~4 chars per token for English
    // More accurate estimation would use tiktoken
    const charCount = text.length;
    const wordCount = text.split(/\s+/).length;
    const estimatedTokens = Math.ceil(charCount / 4);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          characters: charCount,
          words: wordCount,
          estimatedTokens,
          note: 'Rough estimate. Actual count varies by model tokenizer.',
          costEstimates: {
            'gpt-4o': {
              input: `$${(estimatedTokens * 0.0025 / 1000).toFixed(6)}`,
              output: `$${(estimatedTokens * 0.01 / 1000).toFixed(6)}`,
            },
            'claude-3-5-sonnet': {
              input: `$${(estimatedTokens * 0.003 / 1000).toFixed(6)}`,
              output: `$${(estimatedTokens * 0.015 / 1000).toFixed(6)}`,
            },
          },
        }, null, 2),
      }],
    };
  },
};

/**
 * AI tool definitions
 */
export const aiTools: MCPTool[] = [
  {
    name: 'rek_ai_chat',
    description: 'Chat with an AI model. Supports multiple providers: OpenAI, Anthropic, Google, Groq, Ollama, and more. Returns response with usage stats.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The prompt/message to send to the AI',
        },
        provider: {
          type: 'string',
          description: 'AI provider to use (openai, anthropic, google, groq, ollama, etc.)',
        },
        model: {
          type: 'string',
          description: 'Specific model to use (e.g., gpt-4o, claude-sonnet-4-20250514, gemini-1.5-flash)',
        },
        system: {
          type: 'string',
          description: 'System prompt to set context/behavior',
        },
        temperature: {
          type: 'number',
          description: 'Temperature for response randomness (0-2, default: 0.7)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'rek_ai_embed',
    description: 'Generate embeddings for text. Useful for semantic search, similarity comparison, and vector storage. Returns embedding dimensions and preview.',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Text to generate embeddings for',
        },
        model: {
          type: 'string',
          description: 'Embedding model (e.g., text-embedding-3-small)',
        },
        provider: {
          type: 'string',
          description: 'Provider for embeddings (openai, cohere, google)',
        },
      },
      required: ['input'],
    },
  },
  {
    name: 'rek_ai_providers',
    description: 'List all available AI providers and their configuration status. Shows which providers are configured via environment variables.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'rek_ai_tokens',
    description: 'Estimate token count for text. Provides rough token count and cost estimates for common models.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to estimate tokens for',
        },
      },
      required: ['text'],
    },
  },
];

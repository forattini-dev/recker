/**
 * AI Chat Commands
 *
 * Commands for interacting with AI providers (OpenAI, Anthropic, Groq, etc.)
 */

import type { CommandResult } from './types.js';
import type { Client } from '../../../core/client.js';
import { createClient } from '../../../core/client.js';
import { resolvePreset } from '../../presets.js';
import {
  addHistoryItem,
  setIsLoading,
  setLastResponse,
} from '../hooks/useShellState.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * AI presets that support chat
 */
export const AI_PRESETS = [
  'openai',
  'anthropic',
  'groq',
  'google',
  'gemini',
  'xai',
  'mistral',
  'cohere',
  'deepseek',
  'fireworks',
  'together',
  'perplexity',
];

/**
 * Environment variable mapping for AI presets
 */
const ENV_VAR_MAP: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  gemini: 'GOOGLE_API_KEY',
  groq: 'GROQ_API_KEY',
  xai: 'XAI_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  cohere: 'COHERE_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  together: 'TOGETHER_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY',
};

// =============================================================================
// AI Client Cache
// =============================================================================

/**
 * Cached AI clients per provider (preserves memory between calls)
 */
const aiClients: Map<string, Client> = new Map();

/**
 * Get or create AI client for a preset
 */
export async function getAiClient(preset: string): Promise<Client | null> {
  let client = aiClients.get(preset);

  if (!client) {
    const presetConfig = await resolvePreset(preset, { throwOnError: true });

    if (!presetConfig) {
      return null;
    }

    if (!(presetConfig as any)._aiConfig) {
      return null;
    }

    client = createClient(presetConfig as any);
    aiClients.set(preset, client);
  }

  return client;
}

/**
 * Clear all cached AI clients
 */
export function clearAiClients(): void {
  aiClients.clear();
}

// =============================================================================
// AI Chat Command
// =============================================================================

/**
 * AI Chat command: @preset message
 *
 * Supports all AI presets: openai, anthropic, groq, etc.
 * Maintains conversation memory per provider.
 */
export async function cmdAi(preset: string, message: string): Promise<CommandResult> {
  // Validate preset
  if (!AI_PRESETS.includes(preset)) {
    addHistoryItem({
      type: 'error',
      content: `Unknown AI preset: @${preset}\n\nAvailable presets: ${AI_PRESETS.map((p) => '@' + p).join(', ')}`,
    });
    return { success: false, error: `Unknown AI preset: ${preset}` };
  }

  // Check for message
  if (!message.trim()) {
    addHistoryItem({
      type: 'info',
      content: `AI Chat: @${preset}\n\nUsage: @${preset} <your message>\nExample: @${preset} What is the meaning of life?\n\nThe conversation memory is preserved between calls.`,
    });
    return { success: true };
  }

  setIsLoading(true);

  try {
    const client = await getAiClient(preset);

    if (!client) {
      addHistoryItem({
        type: 'error',
        content: `Preset @${preset} not found or does not support AI chat`,
      });
      return { success: false, error: 'Preset not found' };
    }

    if (!client.hasAI) {
      addHistoryItem({
        type: 'error',
        content: `AI not available for @${preset}`,
      });
      return { success: false, error: 'AI not available' };
    }

    // Add user message to history
    addHistoryItem({
      type: 'command',
      content: `@${preset} ${message}`,
    });

    // Stream the response
    const stream = await client.ai.chatStream(message);
    let fullResponse = '';
    const model = (client as any)._aiConfig?.model || preset;

    // Collect streamed content
    for await (const event of stream) {
      if (event.type === 'text') {
        fullResponse += event.content;
      } else if (event.type === 'error') {
        addHistoryItem({ type: 'error', content: `AI Error: ${event.error}` });
        return { success: false, error: String(event.error) };
      }
    }

    // Add AI response to history
    const memory = client.ai.getMemory();
    const memoryPairs = Math.floor(memory.length / 2);

    addHistoryItem({
      type: 'response',
      content: fullResponse,
      meta: {
        model,
        provider: preset,
        memory: `${memoryPairs}/12 pairs`,
      },
    });

    setLastResponse(fullResponse);
    return { success: true, output: fullResponse };
  } catch (err: any) {
    const errorMsg = formatAiError(err, preset);
    addHistoryItem({ type: 'error', content: errorMsg });
    return { success: false, error: errorMsg };
  } finally {
    setIsLoading(false);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format AI-specific errors with helpful messages
 */
export function formatAiError(error: any, preset: string): string {
  const msg = error.message || String(error);
  const envVar = ENV_VAR_MAP[preset] || `${preset.toUpperCase()}_API_KEY`;

  if (
    msg.includes('API key') ||
    msg.includes('401') ||
    msg.includes('Unauthorized') ||
    msg.includes('apiKey')
  ) {
    return `Authentication error for @${preset}\n\nMake sure ${envVar} is set in your environment.`;
  }

  if (msg.includes('429') || msg.includes('rate limit')) {
    return `Rate limited by ${preset}. Wait a moment and try again.`;
  }

  return `AI Error: ${msg}`;
}

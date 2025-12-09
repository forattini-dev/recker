import { ClientOptions } from '../types/index.js';
import type { ClientOptionsWithAI, PresetAIConfig } from '../types/ai-client.js';

export interface HuggingFacePresetOptions {
  apiKey: string;
  /** Default model for chat completions @default 'meta-llama/Meta-Llama-3-70B-Instruct' */
  model?: string;
}

/**
 * Hugging Face Inference API preset
 * @see https://huggingface.co/docs/api-inference
 */
export function huggingface(options: HuggingFacePresetOptions): ClientOptions & ClientOptionsWithAI {
  const _aiConfig: PresetAIConfig = {
    provider: 'huggingface',
    apiKey: options.apiKey,
    model: options.model ?? 'meta-llama/Meta-Llama-3-70B-Instruct',
    memory: { maxPairs: 12 },
  };

  return {
    baseUrl: 'https://api-inference.huggingface.co',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    // HF models can have cold starts
    timeout: 10 * 60 * 1000,
    retry: {
      maxAttempts: 5,
      backoff: 'exponential',
      delay: 1000,
      // HF returns 503 for model loading
      statusCodes: [408, 429, 500, 502, 503, 504]
    },
    _aiConfig,
  };
}

import { ClientOptions } from '../types/index.js';

export interface OpenAIPresetOptions {
  apiKey: string;
  organization?: string;
  project?: string;
}

export function openai(options: OpenAIPresetOptions): ClientOptions {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${options.apiKey}`,
    'Content-Type': 'application/json'
  };

  if (options.organization) {
    headers['OpenAI-Organization'] = options.organization;
  }

  if (options.project) {
    headers['OpenAI-Project'] = options.project;
  }

  return {
    baseUrl: 'https://api.openai.com/v1',
    headers,
    // OpenAI requires long timeouts and robust retries
    timeout: 10 * 60 * 1000, // 10 minutes (600_000ms)
    retry: {
      maxAttempts: 5,
      backoff: 'exponential',
      delay: 1000,
      statusCodes: [408, 409, 429, 500, 502, 503, 504]
    }
  };
}

import { ClientOptions } from '../types/index.js';
import type { ClientOptionsWithAI, PresetAIConfig } from '../types/ai-client.js';

export interface AzureOpenAIPresetOptions {
  /**
   * Azure OpenAI resource name (not the full URL)
   * Example: 'my-resource' for 'my-resource.openai.azure.com'
   */
  resourceName: string;
  /**
   * Azure API Key
   */
  apiKey: string;
  /**
   * API version (default: '2024-02-15-preview')
   */
  apiVersion?: string;
  /**
   * Deployment name (optional, can be specified per-request)
   */
  deploymentName?: string;
  /**
   * Default model for chat completions
   * Note: Azure uses deployment names, but this helps identify the model type
   */
  model?: string;
}

/**
 * Azure OpenAI preset
 * @see https://learn.microsoft.com/en-us/azure/ai-services/openai/
 */
export function azureOpenai(options: AzureOpenAIPresetOptions): ClientOptions & ClientOptionsWithAI {
  const apiVersion = options.apiVersion || '2024-02-15-preview';
  const baseUrl = options.deploymentName
    ? `https://${options.resourceName}.openai.azure.com/openai/deployments/${options.deploymentName}`
    : `https://${options.resourceName}.openai.azure.com/openai`;

  const _aiConfig: PresetAIConfig = {
    provider: 'azure-openai',
    apiKey: options.apiKey,
    model: options.model ?? options.deploymentName ?? 'gpt-4o',
    resourceName: options.resourceName,
    deploymentName: options.deploymentName,
    apiVersion,
    memory: { maxPairs: 12 },
  };

  return {
    baseUrl,
    headers: {
      'api-key': options.apiKey,
      'Content-Type': 'application/json',
    },
    defaults: {
      params: {
        'api-version': apiVersion,
      }
    },
    timeout: 10 * 60 * 1000,
    retry: {
      maxAttempts: 5,
      backoff: 'exponential',
      delay: 1000,
      statusCodes: [408, 429, 500, 502, 503, 504]
    },
    _aiConfig,
  };
}

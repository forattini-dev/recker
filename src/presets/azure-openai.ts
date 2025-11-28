import { ClientOptions } from '../types/index.js';

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
}

/**
 * Azure OpenAI preset
 * @see https://learn.microsoft.com/en-us/azure/ai-services/openai/
 */
export function azureOpenai(options: AzureOpenAIPresetOptions): ClientOptions {
  const apiVersion = options.apiVersion || '2024-02-15-preview';
  const baseUrl = options.deploymentName
    ? `https://${options.resourceName}.openai.azure.com/openai/deployments/${options.deploymentName}`
    : `https://${options.resourceName}.openai.azure.com/openai`;

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
    }
  };
}

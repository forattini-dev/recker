import { ClientOptions } from '../types/index.js';

export interface PineconePresetOptions {
  /**
   * Pinecone API key
   */
  apiKey: string;
  /**
   * Environment (e.g., 'us-east-1-aws', 'eu-west1-gcp')
   * @deprecated Use host instead for serverless indexes
   */
  environment?: string;
  /**
   * Index host URL (for serverless indexes)
   * e.g., 'my-index-abc123.svc.us-east-1-aws.pinecone.io'
   */
  host?: string;
}

/**
 * Pinecone Vector Database preset
 *
 * Particularities:
 * - Long timeouts needed for large upserts/queries
 * - Different endpoints for control plane vs data plane
 * - Serverless indexes use direct host URLs
 * - Pod-based indexes use environment-based URLs
 *
 * @see https://docs.pinecone.io/reference/api/introduction
 *
 * @example Serverless Index
 * ```typescript
 * const client = createClient(pinecone({
 *   apiKey: 'xxx',
 *   host: 'my-index-abc123.svc.us-east-1-aws.pinecone.io'
 * }));
 *
 * // Query vectors
 * await client.post('/query', {
 *   json: {
 *     vector: [0.1, 0.2, 0.3, ...],
 *     topK: 10,
 *     includeMetadata: true
 *   }
 * }).json();
 *
 * // Upsert vectors
 * await client.post('/vectors/upsert', {
 *   json: {
 *     vectors: [{ id: 'vec1', values: [0.1, 0.2, ...], metadata: { text: 'hello' } }]
 *   }
 * }).json();
 * ```
 *
 * @example Control Plane (manage indexes)
 * ```typescript
 * const client = createClient(pineconeControl({ apiKey: 'xxx' }));
 *
 * // List indexes
 * await client.get('/indexes').json();
 * ```
 */
export function pinecone(options: PineconePresetOptions): ClientOptions {
  // Determine base URL
  let baseUrl: string;
  if (options.host) {
    // Serverless index - use direct host
    baseUrl = `https://${options.host}`;
  } else if (options.environment) {
    // Legacy pod-based - requires index name in path
    baseUrl = `https://controller.${options.environment}.pinecone.io`;
  } else {
    // Default to control plane
    baseUrl = 'https://api.pinecone.io';
  }

  return {
    baseUrl,
    headers: {
      'Api-Key': options.apiKey,
      'Content-Type': 'application/json',
    },
    // Vector operations can be slow for large batches
    timeout: 5 * 60 * 1000, // 5 minutes
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 1000,
      statusCodes: [408, 429, 500, 502, 503, 504],
    }
  };
}

/**
 * Pinecone Control Plane preset (for managing indexes)
 */
export function pineconeControl(options: Omit<PineconePresetOptions, 'host' | 'environment'>): ClientOptions {
  return {
    baseUrl: 'https://api.pinecone.io',
    headers: {
      'Api-Key': options.apiKey,
      'Content-Type': 'application/json',
    },
    timeout: 60 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 1000,
      statusCodes: [408, 429, 500, 502, 503, 504],
    }
  };
}

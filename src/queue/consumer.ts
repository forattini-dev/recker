import type { QueueJob, ReckerResponse } from '../types/index.js';

export interface ExecuteQueuedRequestOptions {
  /** Pre-configured client to use. If not provided, a new one is created. */
  client?: { request(url: string, options?: any): Promise<ReckerResponse> };
  /** Options for creating a new client (ignored if `client` is provided) */
  clientOptions?: Record<string, unknown>;
  /** Timeout override (ms) */
  timeout?: number;
}

export interface QueueExecutionResult {
  jobId: string;
  success: boolean;
  response?: ReckerResponse;
  error?: Error;
  duration: number;
}

/**
 * Deserialize a QueueJob and execute it as a real HTTP request.
 * Intended for use on the consumer/worker side.
 *
 * @example
 * ```typescript
 * import { executeQueuedRequest, createClient } from 'recker';
 *
 * const workerClient = createClient({ retry: { maxAttempts: 3 } });
 *
 * // In your queue consumer:
 * const job = JSON.parse(sqsMessage.Body);
 * const result = await executeQueuedRequest(job, { client: workerClient });
 * if (result.success) {
 *   console.log(`Job ${result.jobId} completed: ${result.response.status}`);
 * }
 * ```
 */
export async function executeQueuedRequest(
  job: QueueJob,
  options: ExecuteQueuedRequestOptions = {},
): Promise<QueueExecutionResult> {
  const startTime = Date.now();

  // Lazy import to avoid circular dependency
  const resolvedClient =
    options.client ??
    (await import('../core/client.js').then((m) => m.createClient(options.clientOptions || {})));
  const client = resolvedClient!;

  try {
    const requestOptions: Record<string, unknown> = {
      method: job.method,
      headers: { ...job.headers },
      body: job.body,
      correlationId: job.correlationId,
      traceId: job.traceId,
      tenant: job.tenant,
      policyTags: job.policyTags,
      throwHttpErrors: false,
      queue: false, // Prevent re-queuing on the worker side
    };

    if (options.timeout) {
      requestOptions.timeout = options.timeout;
    }

    const response = await client.request(job.url, requestOptions);

    return {
      jobId: job.jobId,
      success: response.ok,
      response,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      jobId: job.jobId,
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Validate that a plain object is a valid QueueJob.
 * Useful for queue consumers to validate deserialized messages.
 */
export function isValidQueueJob(value: unknown): value is QueueJob {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.jobId === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.method === 'string' &&
    typeof obj.headers === 'object' &&
    obj.headers !== null &&
    typeof obj.createdAt === 'number'
  );
}

import {
  Middleware,
  Plugin,
  ReckerRequest,
  ReckerResponse,
  QueueAdapter,
  QueueJob,
  QueueOptions,
  QueueFilter,
  QueueFilterConfig,
  Method,
} from '../types/index.js';

// Job ID generator
let jobSeq = 0;
function generateJobId(): string {
  jobSeq += 1;
  return `qj-${Date.now().toString(36)}-${jobSeq.toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

function serializeRequest(
  req: ReckerRequest,
  jobId: string,
  metadata?: Record<string, unknown>,
): QueueJob {
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let body: string | null = null;
  const bodyContentType = headers['content-type'];

  if (req.body !== null && req.body !== undefined) {
    if (typeof req.body === 'string') {
      body = req.body;
    } else if (typeof req.body === 'object') {
      try {
        body = JSON.stringify(req.body);
      } catch {
        body = String(req.body);
      }
    } else {
      body = String(req.body);
    }
  }

  return {
    jobId,
    url: req.url,
    method: req.method,
    headers,
    body,
    bodyContentType: bodyContentType || undefined,
    correlationId: req.correlationId,
    traceId: req.traceId,
    tenant: req.tenant,
    policyTags: req.policyTags?.length ? req.policyTags : undefined,
    createdAt: Date.now(),
    metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

function compileFilter(config: QueueFilterConfig): QueueFilter {
  return (req: ReckerRequest): boolean => {
    if (config.methods && !config.methods.includes(req.method as Method)) {
      return false;
    }
    if (config.urlPatterns) {
      const matched = config.urlPatterns.some((pattern) => {
        if (typeof pattern === 'string') return req.url.includes(pattern);
        return pattern.test(req.url);
      });
      if (!matched) return false;
    }
    if (config.headerPresent && !req.headers.has(config.headerPresent)) {
      return false;
    }
    return true;
  };
}

/**
 * Lightweight response for queued requests.
 * Self-contained — no heavy util imports.
 */
class QueuedResponse<T = unknown> implements ReckerResponse<T> {
  public readonly raw: Response;
  public readonly timings = undefined;
  public readonly connection = undefined;

  constructor(public readonly jobId: string) {
    const responseBody = JSON.stringify({
      queued: true,
      jobId,
      status: 'queued',
    });

    this.raw = new Response(responseBody, {
      status: 202,
      statusText: 'Accepted',
      headers: {
        'Content-Type': 'application/json',
        'X-Queue-Job-Id': jobId,
        'X-Queue-Status': 'queued',
      },
    });
  }

  get status() { return 202; }
  get statusText() { return 'Accepted'; }
  get headers() { return this.raw.headers; }
  get ok() { return true; }
  get url() { return ''; }

  json<R = T>() { return this.raw.json() as Promise<R>; }
  text() { return this.raw.text(); }
  async cleanText() { return this.raw.text(); }
  blob() { return this.raw.blob(); }
  read() { return this.raw.body; }

  clone(): ReckerResponse<T> {
    return new QueuedResponse(this.jobId);
  }

  async *sse() { /* no-op */ }
  async *download() { /* no-op */ }

  async *[Symbol.asyncIterator]() {
    if (!this.raw.body) return;
    const reader = this.raw.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  }
}

export function queuePlugin(options: QueueOptions): Plugin {
  const adapter = options.adapter;
  const filter: QueueFilter =
    typeof options.filter === 'function'
      ? options.filter
      : options.filter
        ? compileFilter(options.filter)
        : () => true;

  const generateId = options.jobIdGenerator || generateJobId;

  const queueMiddleware: Middleware = async (req, next) => {
    const perReq = req.queue;
    if (perReq === false) {
      return next(req);
    }

    const shouldQueue = perReq === true || typeof perReq === 'object' || filter(req);
    if (!shouldQueue) {
      return next(req);
    }

    const metadata = {
      ...options.defaultMetadata,
      ...(typeof perReq === 'object' && perReq !== null && 'metadata' in perReq
        ? perReq.metadata
        : undefined),
    };

    const jobId = generateId(req);
    const job = serializeRequest(req, jobId, metadata);
    const assignedId = await adapter.enqueue(job);

    return new QueuedResponse(assignedId || jobId);
  };

  return (client) => {
    client.use(queueMiddleware);
  };
}

/**
 * In-memory queue adapter for testing and development.
 */
export class InMemoryQueueAdapter implements QueueAdapter {
  private jobs = new Map<string, QueueJob & { status: string }>();

  async enqueue(job: QueueJob): Promise<string> {
    this.jobs.set(job.jobId, { ...job, status: 'pending' });
    return job.jobId;
  }

  async getStatus(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) return { jobId, status: 'unknown' as const };
    return { jobId, status: job.status as 'pending' | 'processing' | 'completed' | 'failed' };
  }

  getPendingJobs(): QueueJob[] {
    return Array.from(this.jobs.values())
      .filter((j) => j.status === 'pending')
      .map(({ status, ...job }) => job);
  }

  setJobStatus(jobId: string, status: string): void {
    const job = this.jobs.get(jobId);
    if (job) job.status = status;
  }

  getJob(jobId: string): QueueJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    const { status, ...rest } = job;
    return rest;
  }

  clear(): void {
    this.jobs.clear();
  }

  get size(): number {
    return this.jobs.size;
  }

  async close(): Promise<void> {
    this.jobs.clear();
  }
}

export { QueuedResponse };

import { describe, it, expect, beforeEach } from 'vitest';
import { queuePlugin, InMemoryQueueAdapter, QueuedResponse } from '../../src/plugins/queue.js';
import { executeQueuedRequest, isValidQueueJob } from '../../src/queue/consumer.js';
import { HttpRequest } from '../../src/core/request.js';
import type { QueueJob, ReckerRequest, ReckerResponse, QueueAdapter } from '../../src/types/index.js';

// Helper to run middleware chain
async function runMiddleware(
  plugin: ReturnType<typeof queuePlugin>,
  req: ReckerRequest,
  transportResponse?: ReckerResponse,
) {
  let middleware: any;
  const fakeClient = {
    use(mw: any) {
      middleware = mw;
    },
    beforeRequest() {},
    afterResponse() {},
    onError() {},
  };

  (plugin as any)(fakeClient);

  const next = async () =>
    transportResponse ||
    ({
      status: 200,
      ok: true,
      headers: new Headers(),
      json: async () => ({}),
      text: async () => '',
    } as any as ReckerResponse);

  return middleware(req, next);
}

describe('Queue Plugin', () => {
  let adapter: InMemoryQueueAdapter;

  beforeEach(() => {
    adapter = new InMemoryQueueAdapter();
  });

  describe('queuePlugin', () => {
    it('should queue matching requests and return 202', async () => {
      const plugin = queuePlugin({ adapter });
      const req = new HttpRequest('https://api.example.com/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'user.created' }),
      });

      const res = await runMiddleware(plugin, req);

      expect(res.status).toBe(202);
      expect(res.ok).toBe(true);
      expect(res.headers.get('X-Queue-Status')).toBe('queued');
      expect(res.headers.get('X-Queue-Job-Id')).toBeTruthy();
      expect(adapter.size).toBe(1);
    });

    it('should serialize request correctly into QueueJob', async () => {
      const plugin = queuePlugin({ adapter });
      const req = new HttpRequest('https://api.example.com/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer token123' },
        body: JSON.stringify({ name: 'John' }),
        correlationId: 'corr-123',
        traceId: 'trace-456',
        tenant: 'acme',
      });

      await runMiddleware(plugin, req);

      const jobs = adapter.getPendingJobs();
      expect(jobs).toHaveLength(1);

      const job = jobs[0];
      expect(job.url).toBe('https://api.example.com/users');
      expect(job.method).toBe('POST');
      expect(job.headers['content-type']).toBe('application/json');
      expect(job.headers['authorization']).toBe('Bearer token123');
      expect(job.body).toBe(JSON.stringify({ name: 'John' }));
      expect(job.correlationId).toBe('corr-123');
      expect(job.traceId).toBe('trace-456');
      expect(job.tenant).toBe('acme');
      expect(job.createdAt).toBeGreaterThan(0);
    });

    it('should return QueuedResponse with json() support', async () => {
      const plugin = queuePlugin({ adapter });
      const req = new HttpRequest('https://api.example.com/test', { method: 'POST' });

      const res = await runMiddleware(plugin, req);
      const body = await res.json();

      expect(body).toEqual({
        queued: true,
        jobId: expect.any(String),
        status: 'queued',
      });
    });
  });

  describe('filter: declarative', () => {
    it('should only queue matching methods', async () => {
      const plugin = queuePlugin({
        adapter,
        filter: { methods: ['POST', 'PUT'] },
      });

      const getReq = new HttpRequest('https://api.example.com/users', { method: 'GET' });
      const postReq = new HttpRequest('https://api.example.com/users', { method: 'POST' });

      const getRes = await runMiddleware(plugin, getReq);
      const postRes = await runMiddleware(plugin, postReq);

      expect(getRes.status).toBe(200); // Passed through
      expect(postRes.status).toBe(202); // Queued
      expect(adapter.size).toBe(1);
    });

    it('should only queue matching URL patterns (string)', async () => {
      const plugin = queuePlugin({
        adapter,
        filter: { urlPatterns: ['/webhooks'] },
      });

      const webhookReq = new HttpRequest('https://api.example.com/webhooks', { method: 'POST' });
      const otherReq = new HttpRequest('https://api.example.com/users', { method: 'POST' });

      const webhookRes = await runMiddleware(plugin, webhookReq);
      const otherRes = await runMiddleware(plugin, otherReq);

      expect(webhookRes.status).toBe(202);
      expect(otherRes.status).toBe(200);
    });

    it('should only queue matching URL patterns (RegExp)', async () => {
      const plugin = queuePlugin({
        adapter,
        filter: { urlPatterns: [/\/api\/v\d+\/events/] },
      });

      const matchReq = new HttpRequest('https://api.example.com/api/v2/events', { method: 'POST' });
      const noMatchReq = new HttpRequest('https://api.example.com/api/users', { method: 'POST' });

      expect((await runMiddleware(plugin, matchReq)).status).toBe(202);
      expect((await runMiddleware(plugin, noMatchReq)).status).toBe(200);
    });

    it('should only queue when header is present', async () => {
      const plugin = queuePlugin({
        adapter,
        filter: { headerPresent: 'X-Queue' },
      });

      const withHeader = new HttpRequest('https://api.example.com/test', {
        method: 'POST',
        headers: { 'X-Queue': 'true' },
      });
      const withoutHeader = new HttpRequest('https://api.example.com/test', {
        method: 'POST',
      });

      expect((await runMiddleware(plugin, withHeader)).status).toBe(202);
      expect((await runMiddleware(plugin, withoutHeader)).status).toBe(200);
    });
  });

  describe('filter: function', () => {
    it('should use custom filter function', async () => {
      const plugin = queuePlugin({
        adapter,
        filter: (req) => req.url.includes('/async'),
      });

      const asyncReq = new HttpRequest('https://api.example.com/async/job', { method: 'POST' });
      const syncReq = new HttpRequest('https://api.example.com/sync/job', { method: 'POST' });

      expect((await runMiddleware(plugin, asyncReq)).status).toBe(202);
      expect((await runMiddleware(plugin, syncReq)).status).toBe(200);
    });
  });

  describe('per-request override', () => {
    it('should bypass queue when queue: false', async () => {
      const plugin = queuePlugin({ adapter });
      const req = new HttpRequest('https://api.example.com/test', {
        method: 'POST',
        queue: false,
      });

      const res = await runMiddleware(plugin, req);
      expect(res.status).toBe(200);
      expect(adapter.size).toBe(0);
    });

    it('should force queue when queue: true even if filter excludes', async () => {
      const plugin = queuePlugin({
        adapter,
        filter: { methods: ['DELETE'] }, // Only DELETE
      });
      const req = new HttpRequest('https://api.example.com/test', {
        method: 'GET',
        queue: true,
      });

      const res = await runMiddleware(plugin, req);
      expect(res.status).toBe(202);
      expect(adapter.size).toBe(1);
    });

    it('should include per-request metadata', async () => {
      const plugin = queuePlugin({ adapter });
      const req = new HttpRequest('https://api.example.com/test', {
        method: 'POST',
        queue: { metadata: { priority: 'high', source: 'webhook' } },
      });

      await runMiddleware(plugin, req);

      const jobs = adapter.getPendingJobs();
      expect(jobs[0].metadata).toEqual({ priority: 'high', source: 'webhook' });
    });
  });

  describe('metadata', () => {
    it('should merge default and per-request metadata', async () => {
      const plugin = queuePlugin({
        adapter,
        defaultMetadata: { env: 'production', app: 'tetis' },
      });
      const req = new HttpRequest('https://api.example.com/test', {
        method: 'POST',
        queue: { metadata: { priority: 'high' } },
      });

      await runMiddleware(plugin, req);

      const jobs = adapter.getPendingJobs();
      expect(jobs[0].metadata).toEqual({
        env: 'production',
        app: 'tetis',
        priority: 'high',
      });
    });
  });

  describe('custom jobIdGenerator', () => {
    it('should use custom ID generator', async () => {
      let counter = 0;
      const plugin = queuePlugin({
        adapter,
        jobIdGenerator: () => `custom-${++counter}`,
      });

      const req = new HttpRequest('https://api.example.com/test', { method: 'POST' });
      const res = await runMiddleware(plugin, req);

      expect(res.headers.get('X-Queue-Job-Id')).toBe('custom-1');
      expect(adapter.getPendingJobs()[0].jobId).toBe('custom-1');
    });
  });

  describe('InMemoryQueueAdapter', () => {
    it('should enqueue and retrieve jobs', async () => {
      const job: QueueJob = {
        jobId: 'test-1',
        url: 'https://api.example.com/test',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"test":true}',
        createdAt: Date.now(),
      };

      const id = await adapter.enqueue(job);
      expect(id).toBe('test-1');
      expect(adapter.size).toBe(1);

      const retrieved = adapter.getJob('test-1');
      expect(retrieved).toEqual(job);
    });

    it('should track job status', async () => {
      const job: QueueJob = {
        jobId: 'test-2',
        url: 'https://api.example.com/test',
        method: 'POST',
        headers: {},
        body: null,
        createdAt: Date.now(),
      };

      await adapter.enqueue(job);
      expect((await adapter.getStatus('test-2')).status).toBe('pending');

      adapter.setJobStatus('test-2', 'processing');
      expect((await adapter.getStatus('test-2')).status).toBe('processing');

      adapter.setJobStatus('test-2', 'completed');
      expect((await adapter.getStatus('test-2')).status).toBe('completed');
    });

    it('should return unknown for non-existent jobs', async () => {
      const status = await adapter.getStatus('nope');
      expect(status.status).toBe('unknown');
    });

    it('should filter pending jobs', async () => {
      await adapter.enqueue({
        jobId: 'a',
        url: 'https://example.com',
        method: 'GET',
        headers: {},
        body: null,
        createdAt: Date.now(),
      });
      await adapter.enqueue({
        jobId: 'b',
        url: 'https://example.com',
        method: 'GET',
        headers: {},
        body: null,
        createdAt: Date.now(),
      });
      adapter.setJobStatus('a', 'completed');

      const pending = adapter.getPendingJobs();
      expect(pending).toHaveLength(1);
      expect(pending[0].jobId).toBe('b');
    });

    it('should clear all jobs', async () => {
      await adapter.enqueue({
        jobId: 'x',
        url: 'https://example.com',
        method: 'GET',
        headers: {},
        body: null,
        createdAt: Date.now(),
      });
      adapter.clear();
      expect(adapter.size).toBe(0);
    });
  });

  describe('isValidQueueJob', () => {
    it('should validate a well-formed job', () => {
      expect(
        isValidQueueJob({
          jobId: 'test',
          url: 'https://example.com',
          method: 'GET',
          headers: {},
          body: null,
          createdAt: Date.now(),
        }),
      ).toBe(true);
    });

    it('should reject invalid values', () => {
      expect(isValidQueueJob(null)).toBe(false);
      expect(isValidQueueJob(undefined)).toBe(false);
      expect(isValidQueueJob(42)).toBe(false);
      expect(isValidQueueJob('string')).toBe(false);
      expect(isValidQueueJob({})).toBe(false);
      expect(isValidQueueJob({ jobId: 'x' })).toBe(false);
      expect(
        isValidQueueJob({
          jobId: 'x',
          url: 'https://example.com',
          method: 'GET',
          headers: null,
          createdAt: Date.now(),
        }),
      ).toBe(false);
    });
  });

  describe('executeQueuedRequest', () => {
    it('should execute a queued job and return result', async () => {
      const mockResponse = {
        status: 200,
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
        text: async () => '{"success":true}',
      } as any as ReckerResponse;

      const mockClient = {
        request: async (_url: string, _opts?: any) => mockResponse,
      };

      const job: QueueJob = {
        jobId: 'exec-1',
        url: 'https://api.example.com/users',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"name":"John"}',
        correlationId: 'corr-1',
        createdAt: Date.now(),
      };

      const result = await executeQueuedRequest(job, { client: mockClient });

      expect(result.jobId).toBe('exec-1');
      expect(result.success).toBe(true);
      expect(result.response?.status).toBe(200);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should return error result on failure', async () => {
      const mockClient = {
        request: async () => {
          throw new Error('Connection refused');
        },
      };

      const job: QueueJob = {
        jobId: 'exec-2',
        url: 'https://api.example.com/fail',
        method: 'POST',
        headers: {},
        body: null,
        createdAt: Date.now(),
      };

      const result = await executeQueuedRequest(job, { client: mockClient });

      expect(result.jobId).toBe('exec-2');
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Connection refused');
      expect(result.response).toBeUndefined();
    });

    it('should set queue: false to prevent re-queuing', async () => {
      let capturedOptions: any;
      const mockClient = {
        request: async (_url: string, opts?: any) => {
          capturedOptions = opts;
          return { status: 200, ok: true } as any;
        },
      };

      const job: QueueJob = {
        jobId: 'exec-3',
        url: 'https://api.example.com/test',
        method: 'GET',
        headers: {},
        body: null,
        createdAt: Date.now(),
      };

      await executeQueuedRequest(job, { client: mockClient });

      expect(capturedOptions.queue).toBe(false);
      expect(capturedOptions.throwHttpErrors).toBe(false);
    });

    it('should propagate correlationId and traceId', async () => {
      let capturedOptions: any;
      const mockClient = {
        request: async (_url: string, opts?: any) => {
          capturedOptions = opts;
          return { status: 200, ok: true } as any;
        },
      };

      const job: QueueJob = {
        jobId: 'exec-4',
        url: 'https://api.example.com/test',
        method: 'POST',
        headers: {},
        body: null,
        correlationId: 'corr-abc',
        traceId: 'trace-xyz',
        tenant: 'acme',
        createdAt: Date.now(),
      };

      await executeQueuedRequest(job, { client: mockClient });

      expect(capturedOptions.correlationId).toBe('corr-abc');
      expect(capturedOptions.traceId).toBe('trace-xyz');
      expect(capturedOptions.tenant).toBe('acme');
    });
  });

  describe('QueuedResponse', () => {
    it('should implement ReckerResponse interface', () => {
      const res = new QueuedResponse('test-job-id');

      expect(res.status).toBe(202);
      expect(res.statusText).toBe('Accepted');
      expect(res.ok).toBe(true);
      expect(res.jobId).toBe('test-job-id');
      expect(res.headers.get('X-Queue-Job-Id')).toBe('test-job-id');
    });

    it('should be cloneable', () => {
      const res = new QueuedResponse('clone-test');
      const cloned = res.clone();

      expect(cloned.status).toBe(202);
      expect(cloned.headers.get('X-Queue-Job-Id')).toBe('clone-test');
    });
  });
});

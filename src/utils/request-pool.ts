import type { Middleware, ReckerRequest, ReckerResponse, NextFunction } from '../types/index.js';
import { ReckerError } from '../core/errors.js';

export interface RequestPoolOptions {
  /**
   * Max concurrent requests allowed to execute at once.
   * @default Infinity (no concurrency cap)
   */
  concurrency?: number;
  /**
   * Requests allowed per interval window.
   * When provided with `interval`, starts will be spaced to respect the cap.
   */
  requestsPerInterval?: number;
  /**
   * Interval window length in milliseconds.
   */
  interval?: number;
}

interface QueuedRequest<T> {
  fn: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  signal?: AbortSignal;
  abortCleanup?: () => void;
}

/**
 * Lightweight RequestPool for rate limiting and concurrency control.
 *
 * - Limits concurrent executions.
 * - Enforces a max start rate (`requestsPerInterval` / `interval`) via a sliding window.
 * - Respects AbortSignal both while queued and while running.
 */
export class RequestPool {
  private readonly concurrency: number;
  private readonly requestsPerInterval?: number;
  private readonly interval?: number;
  private queue: Array<QueuedRequest<any>> = [];
  private active = 0;
  private windowStart = 0;
  private startedInWindow = 0;
  private waitingTimer?: NodeJS.Timeout;

  constructor(options: RequestPoolOptions = {}) {
    this.concurrency = options.concurrency ?? Number.POSITIVE_INFINITY;
    this.requestsPerInterval = options.requestsPerInterval;
    this.interval = options.interval;
  }

  run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) {
      return Promise.reject(signal.reason ?? new ReckerError(
        'Request aborted before enqueue',
        undefined,
        undefined,
        ['Ensure the AbortSignal is not already aborted when calling the request.', 'Remove or reset the signal before enqueueing.']
      ));
    }

    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest<T> = { fn, resolve, reject, signal };

      if (signal) {
        const onAbort = () => {
          this._removeFromQueue(request);
          reject(signal.reason ?? new ReckerError(
            'Request aborted while queued',
            undefined,
            undefined,
            ['Avoid aborting immediately after queuing.', 'Increase timeouts or adjust rate limits if cancellations are unintended.']
          ));
          this._schedule();
        };
        signal.addEventListener('abort', onAbort, { once: true });
        request.abortCleanup = () => signal.removeEventListener('abort', onAbort);
      }

      this.queue.push(request);
      this._schedule();
    });
  }

  private _removeFromQueue<T>(request: QueuedRequest<T>) {
    const index = this.queue.indexOf(request as QueuedRequest<unknown>);
    if (index >= 0) {
      this.queue.splice(index, 1);
    }
  }

  private _canStart(now: number): boolean {
    if (this.active >= this.concurrency) {
      return false;
    }

    if (this.requestsPerInterval == null || this.interval == null) {
      return true;
    }

    if (now - this.windowStart >= this.interval) {
      this.windowStart = now;
      this.startedInWindow = 0;
    }

    if (this.startedInWindow < this.requestsPerInterval) {
      return true;
    }

    return false;
  }

  private _schedule() {
    if (this.waitingTimer) {
      // There's already a timer waiting for the next window; let it fire.
      return;
    }

    const now = Date.now();

    while (this.queue.length > 0 && this._canStart(Date.now())) {
      const request = this.queue.shift()!;

      if (request.signal?.aborted) {
        request.abortCleanup?.();
        request.reject(request.signal.reason ?? new ReckerError(
          'Request aborted while queued',
          undefined,
          undefined,
          ['Avoid aborting immediately after queuing.', 'Increase timeouts or adjust rate limits if cancellations are unintended.']
        ));
        continue;
      }

      this.active++;
      this.startedInWindow++;

      const clearAbort = request.abortCleanup;
      if (clearAbort) {
        clearAbort();
        request.abortCleanup = undefined;
      }

      Promise.resolve()
        .then(() => request.fn())
        .then((result) => request.resolve(result))
        .catch((error) => request.reject(error))
        .finally(() => {
          this.active--;
          this._schedule();
        });
    }

    // If rate limit prevents starting now, schedule when the window resets
    if (
      this.queue.length > 0 &&
      this.requestsPerInterval != null &&
      this.interval != null &&
      !this._canStart(Date.now())
    ) {
      const wait = Math.max(0, this.windowStart + this.interval - Date.now());
      this.waitingTimer = setTimeout(() => {
        this.waitingTimer = undefined;
        this._schedule();
      }, wait);
    }
  }

  /**
   * Convert RequestPool to a middleware for use in Client
   *
   * Usage:
   * ```typescript
   * const pool = new RequestPool({ concurrency: 10 });
   * client.use(pool.asMiddleware());
   * ```
   */
  asMiddleware(): Middleware {
    return async (req: ReckerRequest, next: NextFunction): Promise<ReckerResponse> => {
      // Enqueue the request execution through the pool
      return this.run(() => next(req), req.signal);
    };
  }
}

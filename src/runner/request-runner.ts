import { QueueCancelledError } from '../core/errors.js';

export interface RunnerOptions {
  concurrency?: number;
  retries?: number;
  retryDelay?: number;
}

export interface RunnerRunOptions {
  priority?: number;
  retries?: number;
  signal?: AbortSignal;
  deadlineMs?: number;
}

export interface RequestTask<T = any> {
  id: string;
  fn: () => Promise<T>;
  priority: number;
  retries?: number;
  resolve?: (value: T | Error) => void;
}

export interface RunnerResult<T = any> {
  results: (T | Error)[];
  stats: {
    total: number;
    successful: number;
    failed: number;
    duration: number;
  };
}

type Listener = (...args: any[]) => void;

class SimpleEmitter {
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener) {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return this;
  }

  once(event: string, listener: Listener) {
    const wrapped: Listener = (...args) => {
      this.off(event, wrapped);
      listener(...args);
    };
    return this.on(event, wrapped);
  }

  off(event: string, listener: Listener) {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
    return this;
  }

  removeListener(event: string, listener: Listener) {
    return this.off(event, listener);
  }

  emit(event: string, ...args: any[]) {
    const set = this.listeners.get(event);
    if (!set) return false;
    for (const listener of [...set]) {
      listener(...args);
    }
    return true;
  }
}

export class RequestRunner extends SimpleEmitter {
  private concurrency: number;
  private retries: number;
  private retryDelay: number;
  private queue: RequestTask[] = [];
  private activeCount: number = 0;
  private paused: boolean = false;
  private stats = { total: 0, successful: 0, failed: 0 };
  private startTime: number = 0;
  private pendingRetries: number = 0;
  private isCancelled: boolean = false;
  private cancelReason: QueueCancelledError | Error = new QueueCancelledError('Request runner cancelled');
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private timeoutId?: ReturnType<typeof setTimeout>;
  private abortUnsubscribe?: () => void;

  constructor(options: RunnerOptions = {}) {
    super();
    this.concurrency = options.concurrency || 5;
    this.retries = options.retries ?? 0;
    this.retryDelay = options.retryDelay ?? 0;
  }

  public add<T>(
    fn: () => Promise<T>,
    options: { priority?: number; id?: string; retries?: number; trackTotal?: boolean; resolve?: (value: T | Error) => void } = {}
  ): void {
    this.queueTask({
      id: options.id || Math.random().toString(36).slice(2),
      fn,
      priority: options.priority || 0,
      retries: options.retries ?? this.retries,
      resolve: options.resolve,
    });
    if (options.trackTotal !== false) {
      this.stats.total++;
    }
    this.processNext();
  }

  public async run<T>(
    items: any[], 
    processor: (item: any, index: number) => Promise<T>,
    options: RunnerRunOptions = {}
  ): Promise<RunnerResult<T>> {
    this.queue = [];
    this.activeCount = 0;
    this.pendingRetries = 0;
    this.stats = { total: 0, successful: 0, failed: 0 };
    this.isCancelled = false;

    if (this.retryTimers.size > 0) {
      for (const [, timer] of this.retryTimers) {
        clearTimeout(timer);
      }
      this.retryTimers.clear();
    }

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }

    if (this.abortUnsubscribe) {
      this.abortUnsubscribe();
      this.abortUnsubscribe = undefined;
    }

    this.startTime = Date.now();
    this.stats = { total: items.length, successful: 0, failed: 0 };

    this.isCancelled = false;
    this.cancelReason = new QueueCancelledError('Request runner cancelled', {
      queueName: 'request-runner',
      request: undefined
    });

    if (options.signal) {
      const signal = options.signal;
      if (signal.aborted) {
        const reason = signal.reason instanceof Error
          ? signal.reason
          : new QueueCancelledError('Request runner signal was aborted', {
              queueName: 'request-runner',
              request: undefined
            });
        this.cancelAll(reason);
      } else {
        const handleAbort = () => {
          const reason = signal.reason instanceof Error
            ? signal.reason
            : new QueueCancelledError('Request runner signal was aborted', {
                queueName: 'request-runner',
                request: undefined
              });
          this.cancelAll(reason);
        };
        signal.addEventListener('abort', handleAbort, { once: true });
        this.abortUnsubscribe = () => signal.removeEventListener('abort', handleAbort);
      }
    }

    if (options.deadlineMs !== undefined) {
      const deadline = options.deadlineMs;
      if (deadline <= 0) {
        this.cancelAll(new QueueCancelledError('Request runner deadline elapsed', {
          queueName: 'request-runner',
          request: undefined
        }));
      } else {
        this.timeoutId = setTimeout(() => {
          this.cancelAll(new QueueCancelledError('Request runner deadline exceeded', {
            queueName: 'request-runner',
            request: undefined
          }));
        }, deadline);
      }
    }

    try {
      const promises = items.map((item, index) => {
        return new Promise<T | Error>((resolve) => {
          this.add(
            () => processor(item, index),
            {
              priority: options.priority,
              id: String(index),
              retries: options.retries,
              resolve,
              trackTotal: false
            }
          );
        });
      });

      const results = await Promise.all(promises);

      return {
          results,
          stats: {
              ...this.stats,
              duration: Date.now() - this.startTime
          }
      };
    } finally {
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
        this.timeoutId = undefined;
      }

      if (this.abortUnsubscribe) {
        this.abortUnsubscribe();
        this.abortUnsubscribe = undefined;
      }
    }
  }

  private queueTask(task: RequestTask) {
    this.queue.push(task);
    this.queue.sort((a, b) => b.priority - a.priority); // Higher priority first
  }

  private scheduleRetry(task: RequestTask, delay: number) {
    if (this.isCancelled) {
      this.resolveTask(task, this.cancelReason);
      return;
    }

    if (delay <= 0) {
      this.queueTask(task);
      this.processNext();
      return;
    }

    const timerKey = `${task.id}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const enqueueTask = () => {
      this.retryTimers.delete(timerKey);
      this.pendingRetries--;

      if (this.isCancelled) {
        return;
      }

      this.queueTask(task);
      this.processNext();
    };

    this.retryTimers.set(timerKey, setTimeout(() => {
      if (this.isCancelled) {
        this.pendingRetries--;
        this.retryTimers.delete(timerKey);
        this.resolveTask(task, this.cancelReason);
        return;
      }

      enqueueTask();
    }, delay));

    this.pendingRetries++;
  }

  private async processNext() {
    if (this.isCancelled) {
      this.resolveQueue();
      return;
    }

    if (this.paused || this.activeCount >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.activeCount++;
    this.emit('taskStart', task);

    try {
      const result = await task.fn();
      this.stats.successful++;
      task.resolve?.(result);
      this.emit('taskComplete', { task, result });
    } catch (error) {
      if (this.isCancelled) {
        this.resolveTask(task, this.cancelReason);
        return;
      }

      const remaining = task.retries ?? 0;
      if (remaining > 0) {
        task.retries = remaining - 1;
        this.emit('taskRetry', { task, error, remaining: task.retries, delay: this.retryDelay });
        this.scheduleRetry(task, this.retryDelay);
      } else {
        this.resolveTask(task, error as Error);
        this.emit('taskError', { task, error });
      }
    } finally {
      this.activeCount--;
      this.emit('progress', this.getProgress());
      
    if (this.activeCount === 0 && this.queue.length === 0 && this.pendingRetries === 0) {
      this.emit('drained');
    }
      
      this.processNext();
    }
  }

  private cancelAll(reason: Error) {
    if (this.isCancelled) {
      return;
    }

    this.isCancelled = true;
    this.cancelReason = reason;

    for (const [, timer] of this.retryTimers) {
      clearTimeout(timer);
    }

    this.retryTimers.clear();
    this.pendingRetries = 0;
    this.resolveQueue();
  }

  private resolveQueue() {
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        this.resolveTask(task, this.cancelReason);
      }
    }
  }

  private resolveTask(task: RequestTask, error: Error) {
    if (!task.resolve) {
      return;
    }

    this.stats.failed++;
    task.resolve?.(error);
  }

  public getProgress() {
    const completed = this.stats.successful + this.stats.failed;
    return {
      total: this.stats.total,
      completed,
      pending: this.queue.length,
      active: this.activeCount,
      percent: this.stats.total > 0 ? (completed / this.stats.total) * 100 : 0
    };
  }
}

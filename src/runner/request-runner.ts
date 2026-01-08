import { Client } from '../core/client.js';
import { ReckerResponse } from '../types/index.js';

export interface RunnerOptions {
  concurrency?: number;
  retries?: number;
  retryDelay?: number;
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
  private results: Map<string, any> = new Map();
  private stats = { total: 0, successful: 0, failed: 0 };
  private startTime: number = 0;
  private pendingRetries: number = 0;

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
    options: { priority?: number; retries?: number } = {}
  ): Promise<RunnerResult<T>> {
    this.startTime = Date.now();
    this.stats = { total: items.length, successful: 0, failed: 0 };
    this.results.clear();

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
  }

  private queueTask(task: RequestTask) {
    this.queue.push(task);
    this.queue.sort((a, b) => b.priority - a.priority); // Higher priority first
  }

  private scheduleRetry(task: RequestTask, delay: number) {
    this.pendingRetries++;
    if (delay > 0) {
      setTimeout(() => {
        this.pendingRetries--;
        this.queueTask(task);
        this.processNext();
      }, delay);
      return;
    }

    this.pendingRetries--;
    this.queueTask(task);
    this.processNext();
  }

  private async processNext() {
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
      const remaining = task.retries ?? 0;
      if (remaining > 0) {
        task.retries = remaining - 1;
        this.emit('taskRetry', { task, error, remaining: task.retries, delay: this.retryDelay });
        this.scheduleRetry(task, this.retryDelay);
      } else {
        this.stats.failed++;
        task.resolve?.(error as Error);
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

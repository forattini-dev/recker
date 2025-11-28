import { EventEmitter } from 'events';
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

export class RequestRunner extends EventEmitter {
  private concurrency: number;
  private queue: RequestTask[] = [];
  private activeCount: number = 0;
  private paused: boolean = false;
  private results: Map<string, any> = new Map();
  private stats = { total: 0, successful: 0, failed: 0 };
  private startTime: number = 0;

  constructor(options: RunnerOptions = {}) {
    super();
    this.concurrency = options.concurrency || 5;
  }

  public add<T>(
    fn: () => Promise<T>,
    options: { priority?: number; id?: string } = {}
  ): void {
    this.queue.push({
      id: options.id || Math.random().toString(36).slice(2),
      fn,
      priority: options.priority || 0,
    });
    this.queue.sort((a, b) => b.priority - a.priority); // Higher priority first
    this.stats.total++;
    this.processNext();
  }

  public async run<T>(
    items: any[], 
    processor: (item: any, index: number) => Promise<T>,
    options: { priority?: number } = {}
  ): Promise<RunnerResult<T>> {
    this.startTime = Date.now();
    this.stats = { total: items.length, successful: 0, failed: 0 };
    this.results.clear();

    const promises = items.map((item, index) => {
        return new Promise<T | Error>((resolve) => {
            this.add(async () => {
                try {
                    const res = await processor(item, index);
                    resolve(res);
                    return res;
                } catch (err: any) {
                    resolve(err);
                    throw err;
                }
            }, { priority: options.priority, id: String(index) });
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
      this.emit('taskComplete', { task, result });
    } catch (error) {
      console.error('[RequestRunner Debug]', error);
      this.stats.failed++;
      this.emit('taskError', { task, error });
    } finally {
      this.activeCount--;
      this.emit('progress', this.getProgress());
      
      if (this.activeCount === 0 && this.queue.length === 0) {
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

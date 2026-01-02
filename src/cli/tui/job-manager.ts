/**
 * Job Manager for Shell Background Jobs
 *
 * Manages concurrent background operations like live stream downloads,
 * stream watchers, spiders, mock servers, load tests, and SEO analysis.
 *
 * @example
 * ```typescript
 * const manager = new JobManager();
 *
 * // Create a download job
 * const job = manager.registerDownload('@chaturbate/room', () => controller.abort());
 *
 * // Add a log entry
 * manager.addLog(job.id, { timestamp: Date.now(), level: 'info', message: 'Started' });
 *
 * // List all jobs
 * manager.list();
 *
 * // Stop a job
 * manager.stop(job.id);
 * ```
 */

import { EventEmitter } from 'node:events';

// ============================================
// Types
// ============================================

export type JobStatus =
  | 'pending'
  | 'running'
  | 'watching'
  | 'crawling'
  | 'serving'    // mock servers
  | 'loading'    // load tests
  | 'analyzing'  // SEO analysis
  | 'proxying'   // proxy server
  | 'stopped'
  | 'completed'
  | 'failed';

export type JobType =
  | 'download'
  | 'watch'
  | 'spider'
  | 'server'     // mock servers
  | 'loadtest'   // load/bench tests
  | 'seo'        // SEO analysis
  | 'video'      // video download
  | 'hls'        // HLS download
  | 'proxy';     // proxy server

export interface JobLogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

export interface JobProgress {
  // Download/HLS
  segments: number;
  bytes: number;
  duration?: number; // elapsed seconds

  // Spider
  pages?: number;
  queued?: number;
  errors?: number;

  // Load test
  requests?: number;
  rps?: number;
  latencyP50?: number;
  latencyP99?: number;

  // Server
  connections?: number;

  // SEO
  score?: number;
  issues?: number;

  // Proxy
  proxyRequests?: number;
  proxySuccess?: number;
  proxyErrors?: number;
  proxyBytesIn?: number;
  proxyBytesOut?: number;
}

export interface Job {
  id: number;
  type: JobType;
  status: JobStatus;
  url: string;
  target: string; // username/channel extracted from URL
  output?: string; // output file path
  startedAt: Date;
  progress: JobProgress;
  error?: Error;
  abort: () => void; // AbortController.abort()

  // Extended fields
  command?: string;           // Original command that spawned this job
  logs: JobLogEntry[];        // Log buffer (max 1000 entries)
  port?: number;              // For server jobs
  metadata?: Record<string, any>; // Type-specific metadata
}

// ============================================
// Job Options Interfaces
// ============================================

export interface DownloadJobOptions {
  outputDir?: string;
  output?: string;
  quality?: string;
  duration?: number;
  concurrency?: number;
}

export interface WatchJobOptions {
  pollInterval: [number, number]; // [min, max] seconds
  outputDir?: string;
  quality?: string;
  duration?: number;
  stealth?: boolean;
}

export interface SpiderJobOptions {
  maxDepth?: number;
  maxPages?: number;
  concurrency?: number;
  delay?: number;
  sameDomain?: boolean;
  useSitemap?: boolean;
  outputFile?: string;
}

export interface ServerJobOptions {
  type: 'http' | 'ws' | 'dns' | 'hls' | 'sse' | 'ftp' | 'telnet' | 'whois' | 'udp';
  port: number;
  host?: string;
  options?: Record<string, any>;
}

export interface LoadTestJobOptions {
  url: string;
  users: number;
  duration: number;
  mode: 'throughput' | 'stress' | 'realistic';
  rampUp?: number;
  http2?: boolean;
  insecure?: boolean;
}

export interface SEOJobOptions {
  url: string;
  depth?: number;
  categories?: string[];
  outputFile?: string;
}

export interface VideoJobOptions {
  outputDir?: string;
  output?: string;
  quality?: string;
  format?: string;
}

export interface HLSJobOptions {
  output?: string;
  quality?: 'highest' | 'lowest' | string;
  duration?: number;
  live?: boolean;
  concurrency?: number;
}

export interface ProxyJobOptions {
  port: number;
  host?: string;
  mode: 'forward' | 'intercept';
  mtls?: boolean;
  caCert?: string;
  caKey?: string;
  clientCert?: string;
  clientKey?: string;
}

// ============================================
// Job Manager Events
// ============================================

export interface JobManagerEvents {
  'job:start': (job: Job) => void;
  'job:progress': (job: Job) => void;
  'job:complete': (job: Job) => void;
  'job:error': (job: Job, error: Error) => void;
  'job:stopped': (job: Job) => void;
  'job:live': (job: Job) => void; // Watch job detected stream is live
  'job:log': (job: Job, entry: JobLogEntry) => void; // New log entry added
}

// ============================================
// Job Manager
// ============================================

const MAX_LOGS_PER_JOB = 1000;

export class JobManager extends EventEmitter {
  private jobs: Map<number, Job> = new Map();
  private nextId: number = 1;
  private maxJobs: number = 10;

  constructor(options?: { maxJobs?: number }) {
    super();
    if (options?.maxJobs) {
      this.maxJobs = options.maxJobs;
    }
  }

  /**
   * Extract target (username/channel) from URL
   */
  private extractTarget(url: string): string {
    try {
      // Handle shortcuts like @chaturbate/room or chaturbate/room
      if (url.startsWith('@') || !url.includes('://')) {
        const clean = url.replace(/^@/, '');
        const parts = clean.split('/');
        // Return last meaningful part as target
        return parts[parts.length - 1] || parts[0] || 'unknown';
      }

      // Handle full URLs
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const skipSegments = ['u', 'channel', 'c', 'user', 'live', 'video', 'watch', 'embed'];
      const target = pathParts.find((p) => !skipSegments.includes(p.toLowerCase()));
      return target || pathParts[0] || urlObj.hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Count active jobs (not completed/stopped/failed)
   */
  private getActiveJobCount(): number {
    const inactiveStatuses: JobStatus[] = ['completed', 'stopped', 'failed'];
    let count = 0;
    for (const job of this.jobs.values()) {
      if (!inactiveStatuses.includes(job.status)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Create a new job entry (internal)
   */
  private createJob(type: JobType, url: string, abortFn: () => void): Job {
    const activeCount = this.getActiveJobCount();
    if (activeCount >= this.maxJobs) {
      throw new Error(`Maximum concurrent active jobs (${this.maxJobs}) reached`);
    }

    const job: Job = {
      id: this.nextId++,
      type,
      status: 'pending',
      url,
      target: this.extractTarget(url),
      startedAt: new Date(),
      progress: { segments: 0, bytes: 0 },
      abort: abortFn,
      logs: [],
    };

    this.jobs.set(job.id, job);
    return job;
  }

  // ============================================
  // Registration Methods
  // ============================================

  /**
   * Register a download job
   */
  registerDownload(url: string, abortFn: () => void): Job {
    return this.createJob('download', url, abortFn);
  }

  /**
   * Register a watch job
   */
  registerWatch(url: string, abortFn: () => void): Job {
    const job = this.createJob('watch', url, abortFn);
    job.status = 'watching';
    return job;
  }

  /**
   * Register a spider job
   */
  registerSpider(url: string, abortFn: () => void): Job {
    const job = this.createJob('spider', url, abortFn);
    job.status = 'crawling';
    return job;
  }

  /**
   * Register a server job
   */
  registerServer(url: string, abortFn: () => void): Job {
    const job = this.createJob('server', url, abortFn);
    job.status = 'serving';
    return job;
  }

  /**
   * Register a load test job
   */
  registerLoadTest(url: string, abortFn: () => void): Job {
    const job = this.createJob('loadtest', url, abortFn);
    job.status = 'loading';
    return job;
  }

  /**
   * Register a SEO analysis job
   */
  registerSEO(url: string, abortFn: () => void): Job {
    const job = this.createJob('seo', url, abortFn);
    job.status = 'analyzing';
    return job;
  }

  /**
   * Register a video download job
   */
  registerVideo(url: string, abortFn: () => void): Job {
    return this.createJob('video', url, abortFn);
  }

  /**
   * Register an HLS download job
   */
  registerHLS(url: string, abortFn: () => void): Job {
    return this.createJob('hls', url, abortFn);
  }

  /**
   * Register a proxy server job
   */
  registerProxy(url: string, abortFn: () => void): Job {
    const job = this.createJob('proxy', url, abortFn);
    job.status = 'proxying';
    return job;
  }

  // ============================================
  // Log Management
  // ============================================

  /**
   * Add a log entry to a job
   */
  addLog(id: number, entry: JobLogEntry): void {
    const job = this.jobs.get(id);
    if (job) {
      job.logs.push(entry);
      // Keep max entries
      if (job.logs.length > MAX_LOGS_PER_JOB) {
        job.logs = job.logs.slice(-MAX_LOGS_PER_JOB);
      }
      this.emit('job:log', job, entry);
    }
  }

  /**
   * Get logs for a job
   */
  getLogs(id: number, limit?: number): JobLogEntry[] {
    const job = this.jobs.get(id);
    if (!job?.logs) return [];
    return limit ? job.logs.slice(-limit) : job.logs;
  }

  /**
   * Clear logs for a job
   */
  clearLogs(id: number): void {
    const job = this.jobs.get(id);
    if (job) {
      job.logs = [];
    }
  }

  // ============================================
  // Job Accessors
  // ============================================

  /**
   * Get a job by ID
   */
  get(id: number): Job | undefined {
    return this.jobs.get(id);
  }

  /**
   * List all jobs
   */
  list(): Job[] {
    return Array.from(this.jobs.values());
  }

  /**
   * List active jobs (running, watching, crawling, serving, loading, analyzing, proxying)
   */
  listActive(): Job[] {
    const activeStatuses: JobStatus[] = ['running', 'watching', 'crawling', 'serving', 'loading', 'analyzing', 'proxying'];
    return this.list().filter((j) => activeStatuses.includes(j.status));
  }

  // ============================================
  // Job Updates
  // ============================================

  /**
   * Update job status
   */
  updateStatus(id: number, status: JobStatus): void {
    const job = this.jobs.get(id);
    if (job) {
      job.status = status;

      if (status === 'completed') {
        this.emit('job:complete', job);
      } else if (status === 'stopped') {
        this.emit('job:stopped', job);
      }
    }
  }

  /**
   * Update job progress
   */
  updateProgress(id: number, progress: Partial<JobProgress>): void {
    const job = this.jobs.get(id);
    if (job) {
      job.progress = { ...job.progress, ...progress };
      this.emit('job:progress', job);
    }
  }

  /**
   * Set job output file
   */
  setOutput(id: number, output: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.output = output;
    }
  }

  /**
   * Set job command (original command string)
   */
  setCommand(id: number, command: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.command = command;
    }
  }

  /**
   * Set job port (for server jobs)
   */
  setPort(id: number, port: number): void {
    const job = this.jobs.get(id);
    if (job) {
      job.port = port;
    }
  }

  /**
   * Set job metadata
   */
  setMetadata(id: number, metadata: Record<string, any>): void {
    const job = this.jobs.get(id);
    if (job) {
      job.metadata = { ...job.metadata, ...metadata };
    }
  }

  /**
   * Mark job as started
   */
  start(id: number): void {
    const job = this.jobs.get(id);
    if (job) {
      // Set appropriate status based on job type
      const statusMap: Record<JobType, JobStatus> = {
        download: 'running',
        watch: 'watching',
        spider: 'crawling',
        server: 'serving',
        loadtest: 'loading',
        seo: 'analyzing',
        video: 'running',
        hls: 'running',
        proxy: 'proxying',
      };
      job.status = statusMap[job.type] || 'running';
      this.emit('job:start', job);
    }
  }

  /**
   * Mark job as failed with error
   */
  fail(id: number, error: Error): void {
    const job = this.jobs.get(id);
    if (job) {
      job.status = 'failed';
      job.error = error;
      this.addLog(id, {
        timestamp: Date.now(),
        level: 'error',
        message: error.message,
      });
      this.emit('job:error', job, error);
    }
  }

  /**
   * Emit live event for watch job
   */
  emitLive(id: number): void {
    const job = this.jobs.get(id);
    if (job) {
      this.emit('job:live', job);
    }
  }

  // ============================================
  // Job Control
  // ============================================

  /**
   * Stop a job by ID
   */
  stop(id: number): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    const stoppableStatuses: JobStatus[] = ['running', 'watching', 'crawling', 'serving', 'loading', 'analyzing', 'proxying', 'pending'];
    if (stoppableStatuses.includes(job.status)) {
      job.abort();
      job.status = 'stopped';
      this.addLog(id, {
        timestamp: Date.now(),
        level: 'info',
        message: 'Job stopped by user',
      });
      this.emit('job:stopped', job);
      return true;
    }

    return false;
  }

  /**
   * Stop all running jobs
   */
  stopAll(): number {
    let stopped = 0;
    for (const job of this.jobs.values()) {
      if (this.stop(job.id)) {
        stopped++;
      }
    }
    return stopped;
  }

  /**
   * Remove completed/failed/stopped jobs from list
   */
  prune(): number {
    let pruned = 0;
    for (const [id, job] of this.jobs.entries()) {
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'stopped') {
        this.jobs.delete(id);
        pruned++;
      }
    }
    return pruned;
  }

  /**
   * Check if any jobs are active
   */
  hasActiveJobs(): boolean {
    return this.listActive().length > 0;
  }

  /**
   * Get job count
   */
  get count(): number {
    return this.jobs.size;
  }

  /**
   * Get active job count
   */
  get activeCount(): number {
    return this.listActive().length;
  }
}

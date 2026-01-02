/**
 * useJobs - Reactive wrapper for JobManager
 *
 * Provides signal-based access to background jobs for tuiuiu components.
 */

import { createSignal } from 'tuiuiu.js';
import {
  JobManager,
  type Job,
  type JobStatus,
  type JobLogEntry,
} from '../job-manager.js';

// =============================================================================
// Singleton JobManager instance
// =============================================================================

let jobManagerInstance: JobManager | null = null;

function getJobManager(): JobManager {
  if (!jobManagerInstance) {
    jobManagerInstance = new JobManager({ maxJobs: 100 });
    setupEventBindings(jobManagerInstance);
  }
  return jobManagerInstance;
}

// =============================================================================
// Reactive State (Signals)
// =============================================================================

// Jobs list signal
const [jobs, setJobs] = createSignal<Job[]>([]);

// Panel expanded state
const [jobsPanelExpanded, setJobsPanelExpanded] = createSignal(false);

// Selected job for navigation
const [selectedJobId, setSelectedJobId] = createSignal<number | null>(null);

// Detail view mode (shows logs when true)
const [jobDetailMode, setJobDetailMode] = createSignal(false);

// Pagination
const JOBS_PER_PAGE = 10;
const [jobsPage, setJobsPage] = createSignal(0);

// =============================================================================
// Event Bindings
// =============================================================================

function setupEventBindings(manager: JobManager): void {
  const updateJobs = () => {
    setJobs([...manager.list()]);
  };

  manager.on('job:start', updateJobs);
  manager.on('job:progress', updateJobs);
  manager.on('job:complete', updateJobs);
  manager.on('job:error', updateJobs);
  manager.on('job:stopped', updateJobs);
  manager.on('job:live', updateJobs);
}

// =============================================================================
// Computed Values
// =============================================================================

const ACTIVE_STATUSES: JobStatus[] = [
  'running', 'watching', 'crawling', 'serving', 'loading', 'analyzing', 'proxying',
];

function getActiveJobs(): Job[] {
  return jobs().filter(j => ACTIVE_STATUSES.includes(j.status));
}

function getJobCounts(): {
  running: number;
  watching: number;
  crawling: number;
  serving: number;
  loading: number;
  analyzing: number;
  proxying: number;
  total: number;
  active: number;
} {
  const all = jobs();
  return {
    running: all.filter(j => j.status === 'running').length,
    watching: all.filter(j => j.status === 'watching').length,
    crawling: all.filter(j => j.status === 'crawling').length,
    serving: all.filter(j => j.status === 'serving').length,
    loading: all.filter(j => j.status === 'loading').length,
    analyzing: all.filter(j => j.status === 'analyzing').length,
    proxying: all.filter(j => j.status === 'proxying').length,
    total: all.length,
    active: getActiveJobs().length,
  };
}

function hasActiveJobs(): boolean {
  return getActiveJobs().length > 0;
}

/**
 * Get jobs sorted by status (active first, then completed/stopped/failed)
 * and paginated
 */
function getSortedJobs(): Job[] {
  const all = jobs();

  // Sort: active jobs first (by start time desc), then inactive (by start time desc)
  return [...all].sort((a, b) => {
    const aActive = ACTIVE_STATUSES.includes(a.status);
    const bActive = ACTIVE_STATUSES.includes(b.status);

    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;

    // Within same category, sort by start time (newest first)
    return b.startedAt.getTime() - a.startedAt.getTime();
  });
}

/**
 * Get paginated jobs (sorted)
 */
function getPaginatedJobs(): Job[] {
  const sorted = getSortedJobs();
  const page = jobsPage();
  const start = page * JOBS_PER_PAGE;
  return sorted.slice(start, start + JOBS_PER_PAGE);
}

/**
 * Get total number of pages
 */
function getTotalPages(): number {
  return Math.ceil(jobs().length / JOBS_PER_PAGE);
}

/**
 * Navigate to next page
 */
function nextJobsPage(): void {
  const total = getTotalPages();
  if (jobsPage() < total - 1) {
    setJobsPage(jobsPage() + 1);
  }
}

/**
 * Navigate to previous page
 */
function prevJobsPage(): void {
  if (jobsPage() > 0) {
    setJobsPage(jobsPage() - 1);
  }
}

// =============================================================================
// Actions
// =============================================================================

function toggleJobsPanel(): void {
  setJobsPanelExpanded(!jobsPanelExpanded());
}

function stopJob(id: number): boolean {
  return getJobManager().stop(id);
}

function stopAllJobs(): number {
  return getJobManager().stopAll();
}

function pruneJobs(): number {
  const pruned = getJobManager().prune();
  setJobs([...getJobManager().list()]);
  return pruned;
}

// =============================================================================
// Job Selection & Navigation
// =============================================================================

function selectNextJob(): void {
  const all = jobs();
  if (all.length === 0) return;

  const currentId = selectedJobId();
  if (currentId === null) {
    setSelectedJobId(all[0].id);
    return;
  }

  const currentIndex = all.findIndex(j => j.id === currentId);
  const nextIndex = (currentIndex + 1) % all.length;
  setSelectedJobId(all[nextIndex].id);
}

function selectPrevJob(): void {
  const all = jobs();
  if (all.length === 0) return;

  const currentId = selectedJobId();
  if (currentId === null) {
    setSelectedJobId(all[all.length - 1].id);
    return;
  }

  const currentIndex = all.findIndex(j => j.id === currentId);
  const prevIndex = currentIndex === 0 ? all.length - 1 : currentIndex - 1;
  setSelectedJobId(all[prevIndex].id);
}

function toggleDetailMode(): void {
  if (!selectedJobId()) {
    // Auto-select first job if none selected
    const all = jobs();
    if (all.length > 0) {
      setSelectedJobId(all[0].id);
    }
  }
  setJobDetailMode(!jobDetailMode());
}

function getSelectedJob(): Job | undefined {
  const id = selectedJobId();
  if (id === null) return undefined;
  return jobs().find(j => j.id === id);
}

function getJobLogs(id: number, limit?: number): JobLogEntry[] {
  return getJobManager().getLogs(id, limit);
}

// =============================================================================
// Job Registration (for commands to use)
// =============================================================================

function registerDownload(url: string, abortFn: () => void): Job {
  const job = getJobManager().registerDownload(url, abortFn);
  setJobs([...getJobManager().list()]);
  return job;
}

function registerWatch(url: string, abortFn: () => void): Job {
  const job = getJobManager().registerWatch(url, abortFn);
  setJobs([...getJobManager().list()]);
  return job;
}

function registerSpider(url: string, abortFn: () => void): Job {
  const job = getJobManager().registerSpider(url, abortFn);
  setJobs([...getJobManager().list()]);
  return job;
}

function registerServer(url: string, abortFn: () => void): Job {
  const job = getJobManager().registerServer(url, abortFn);
  setJobs([...getJobManager().list()]);
  return job;
}

function registerLoadTest(url: string, abortFn: () => void): Job {
  const job = getJobManager().registerLoadTest(url, abortFn);
  setJobs([...getJobManager().list()]);
  return job;
}

function registerSEO(url: string, abortFn: () => void): Job {
  const job = getJobManager().registerSEO(url, abortFn);
  setJobs([...getJobManager().list()]);
  return job;
}

function registerVideo(url: string, abortFn: () => void): Job {
  const job = getJobManager().registerVideo(url, abortFn);
  setJobs([...getJobManager().list()]);
  return job;
}

function registerHLS(url: string, abortFn: () => void): Job {
  const job = getJobManager().registerHLS(url, abortFn);
  setJobs([...getJobManager().list()]);
  return job;
}

function registerProxy(url: string, abortFn: () => void): Job {
  const job = getJobManager().registerProxy(url, abortFn);
  setJobs([...getJobManager().list()]);
  return job;
}

function updateJobStatus(id: number, status: JobStatus): void {
  getJobManager().updateStatus(id, status);
  setJobs([...getJobManager().list()]);
}

function updateJobProgress(id: number, progress: Partial<Job['progress']>): void {
  getJobManager().updateProgress(id, progress);
  // Progress updates happen frequently, the event binding handles this
}

function startJob(id: number): void {
  getJobManager().start(id);
  setJobs([...getJobManager().list()]);
}

function failJob(id: number, error: Error): void {
  getJobManager().fail(id, error);
  setJobs([...getJobManager().list()]);
}

// =============================================================================
// Exports
// =============================================================================

export {
  // Signals (reactive state)
  jobs,
  jobsPanelExpanded,
  setJobsPanelExpanded,
  selectedJobId,
  setSelectedJobId,
  jobDetailMode,
  setJobDetailMode,

  // Computed
  getActiveJobs,
  getJobCounts,
  hasActiveJobs,
  getSelectedJob,
  getJobLogs,
  getSortedJobs,
  getPaginatedJobs,
  getTotalPages,

  // Pagination
  jobsPage,
  setJobsPage,
  nextJobsPage,
  prevJobsPage,
  JOBS_PER_PAGE,

  // Actions
  toggleJobsPanel,
  stopJob,
  stopAllJobs,
  pruneJobs,

  // Job Navigation
  selectNextJob,
  selectPrevJob,
  toggleDetailMode,

  // Registration (all job types)
  registerDownload,
  registerWatch,
  registerSpider,
  registerServer,
  registerLoadTest,
  registerSEO,
  registerVideo,
  registerHLS,
  registerProxy,

  // Job updates
  updateJobStatus,
  updateJobProgress,
  startJob,
  failJob,

  // Manager access (for advanced use)
  getJobManager,
};

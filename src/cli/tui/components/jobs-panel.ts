/**
 * JobsPanel - Accordion panel showing background jobs
 *
 * When collapsed: Shows job count in a compact header
 * When expanded: Shows table with job details
 *
 * Toggle with 'J' key
 */

import { Box, Text, ProgressBar, StatusIndicator } from 'tuiuiu.js';
import { themeColor } from '../shared/theme-helper.js';
import type { VNode } from 'tuiuiu.js';
import {
  jobs,
  jobsPanelExpanded,
  getJobCounts,
  hasActiveJobs,
  getPaginatedJobs,
  getTotalPages,
  jobsPage,
  nextJobsPage,
  prevJobsPage,
} from '../hooks/useJobs.js';
import type { Job, JobStatus } from '../job-manager.js';

// =============================================================================
// Status Mapping for StatusIndicator
// =============================================================================

type StatusIndicatorStatus = 'success' | 'warning' | 'error' | 'info' | 'pending' | 'running' | 'stopped';

function mapJobStatusToIndicator(status: JobStatus): { status: StatusIndicatorStatus | { color: string; icon: string }; pulse?: boolean } {
  switch (status) {
    case 'running':
      return { status: { color: 'green', icon: '⬇' }, pulse: true };
    case 'watching':
      return { status: { color: 'blue', icon: '👁' }, pulse: true };
    case 'crawling':
      return { status: { color: 'cyan', icon: '🕷' }, pulse: true };
    case 'completed':
      return { status: 'success' };
    case 'stopped':
      return { status: 'stopped' };
    case 'failed':
      return { status: 'error' };
    case 'pending':
      return { status: 'pending' };
    default:
      return { status: 'info' };
  }
}

// =============================================================================
// Format Helpers
// =============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m${secs}s` : `${secs}s`;
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

// =============================================================================
// Header Component (always visible)
// =============================================================================

function JobsPanelHeader({ width }: { width: number }): VNode {
  const expanded = jobsPanelExpanded();
  const counts = getJobCounts();
  const hasJobs = hasActiveJobs();

  // Build status summary
  const parts: string[] = [];
  if (counts.running > 0) parts.push(`⬇ ${counts.running}`);
  if (counts.watching > 0) parts.push(`👁 ${counts.watching}`);
  if (counts.crawling > 0) parts.push(`🕷 ${counts.crawling}`);

  const summary = parts.length > 0 ? parts.join(' | ') : 'No active jobs';
  const expandIcon = expanded ? '▼' : '▶';
  const hint = hasJobs ? ' [J to toggle]' : '';

  const bgColor = hasJobs ? themeColor('muted') : undefined;
  const fgColor = hasJobs ? themeColor('primary') : themeColor('mutedForeground');

  return Box(
    {
      flexDirection: 'row',
      backgroundColor: bgColor,
      paddingX: 1,
    },
    Text({ color: fgColor, bold: hasJobs }, `${expandIcon} Jobs: ${summary}`),
    Text({ color: themeColor('mutedForeground'), dim: true }, hint),
  );
}

// =============================================================================
// Job Row Component
// =============================================================================

function JobRow({ job, width }: { job: Job; width: number }): VNode {
  const statusConfig = mapJobStatusToIndicator(job.status);

  // Calculate column widths
  const idWidth = 4;
  const statusWidth = 12;
  const targetWidth = 20;
  const progressWidth = 20;
  const remainingWidth = Math.max(10, width - idWidth - statusWidth - targetWidth - progressWidth - 10);

  // Render progress based on job type
  const renderProgress = (): VNode => {
    if (job.status === 'running') {
      // HLS download - show animated progress with segment count and bytes
      const segmentProgress = job.progress.segments || 0;
      const bytes = job.progress.bytes || 0;

      return Box(
        { flexDirection: 'column' },
        ProgressBar({
          indeterminate: true,
          width: progressWidth - 2,
          style: 'smooth',
          color: themeColor('success'),
        }),
        Text(
          { color: themeColor('mutedForeground'), dim: true },
          `${segmentProgress} seg | ${formatBytes(bytes)}`
        ),
      );
    } else if (job.status === 'crawling') {
      return Box(
        { flexDirection: 'column' },
        ProgressBar({
          indeterminate: true,
          width: progressWidth - 2,
          style: 'dots',
          color: themeColor('accent'),
          label: `${job.progress.pages || 0} pages`,
        }),
      );
    } else if (job.status === 'watching') {
      return ProgressBar({
        indeterminate: true,
        width: progressWidth - 2,
        style: 'braille',
        color: themeColor('primary'),
        label: 'monitoring',
      });
    } else if (job.status === 'completed') {
      return ProgressBar({
        value: 100,
        max: 100,
        width: progressWidth - 2,
        style: 'block',
        color: themeColor('success'),
        showPercentage: true,
      });
    }
    return Text({ color: themeColor('mutedForeground') }, '-');
  };

  return Box(
    { flexDirection: 'row', paddingX: 1 },
    // ID
    Text({ color: themeColor('mutedForeground'), dim: true }, `#${job.id}`.padEnd(idWidth)),
    // Status - using StatusIndicator
    Box(
      { width: statusWidth },
      StatusIndicator({
        status: statusConfig.status,
        label: job.status,
        pulse: statusConfig.pulse,
        size: 'sm',
      }),
    ),
    // Target
    Text({ color: themeColor('foreground') }, truncate(job.target, targetWidth).padEnd(targetWidth)),
    // Progress with ProgressBar
    Box({ width: progressWidth }, renderProgress()),
    // Output file (if any)
    job.output
      ? Text({ color: themeColor('mutedForeground'), dim: true }, `→ ${truncate(job.output, remainingWidth)}`)
      : Text({}, ''),
  );
}

// =============================================================================
// Jobs Table Component
// =============================================================================

function JobsTable({ width }: { width: number }): VNode {
  const allJobs = jobs();

  if (allJobs.length === 0) {
    return Box(
      { paddingX: 2, paddingY: 1 },
      Text(
        { color: themeColor('mutedForeground'), dim: true },
        'No jobs. Run commands with & to start background jobs.'
      ),
    );
  }

  // Get paginated and sorted jobs
  const displayJobs = getPaginatedJobs();
  const totalPages = getTotalPages();
  const currentPage = jobsPage();

  // Header row
  const headerRow = Box(
    { flexDirection: 'row', paddingX: 1, backgroundColor: themeColor('muted') },
    Text({ color: themeColor('mutedForeground'), dim: true }, 'ID  '),
    Text({ color: themeColor('mutedForeground'), dim: true }, 'Status    '),
    Text({ color: themeColor('mutedForeground'), dim: true }, 'Target              '),
    Text({ color: themeColor('mutedForeground'), dim: true }, 'Progress       '),
    Text({ color: themeColor('mutedForeground'), dim: true }, 'Output'),
  );

  // Job rows
  const rows = displayJobs.map((job) => JobRow({ job, width }));

  // Pagination footer
  const paginationRow = totalPages > 1 ? Box(
    { flexDirection: 'row', paddingX: 1, paddingY: 1, justifyContent: 'space-between' },
    Text(
      { color: themeColor('mutedForeground'), dim: true },
      `Page ${currentPage + 1}/${totalPages} (${allJobs.length} jobs)`
    ),
    Text(
      { color: themeColor('mutedForeground'), dim: true },
      'Alt+← prev | Alt+→ next'
    ),
  ) : null;

  return Box(
    { flexDirection: 'column' },
    headerRow,
    ...rows,
    paginationRow,
  );
}

// =============================================================================
// Main Panel Component
// =============================================================================

export interface JobsPanelProps {
  width: number;
}

export function JobsPanel({ width }: JobsPanelProps): VNode {
  const expanded = jobsPanelExpanded();
  const hasJobs = hasActiveJobs();

  // Don't render anything if no jobs and not expanded
  if (!hasJobs && !expanded) {
    return Box({});
  }

  // Border style when expanded
  const borderStyle = expanded ? 'single' : undefined;
  const borderColor = expanded ? themeColor('muted') : undefined;

  return Box(
    {
      flexDirection: 'column',
      width,
      borderStyle,
      borderColor,
      marginTop: expanded ? 1 : 0,
    },
    JobsPanelHeader({ width: width - 2 }),
    expanded ? JobsTable({ width: width - 2 }) : Box({}),
  );
}

// =============================================================================
// Exports
// =============================================================================

export { JobsPanelHeader, JobsTable, JobRow };

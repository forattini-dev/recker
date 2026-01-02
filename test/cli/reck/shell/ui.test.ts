/**
 * Tests for Shell UI Components
 *
 * Tests ShellHeader, ShellMessages, JobsPanel, ShellHelp, etc.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ShellHeader,
  ShellMessages,
  MessageBubble,
  JobCard,
  JobsPanel,
  ShellStatusBar,
  ShellHelp,
  ProcessingIndicator,
} from '../../../../src/cli/reck/shell/ui.js';
import { renderToString } from '../../../../src/cli/reck/renderer.js';
import type { ShellMessage, Job } from '../../../../src/cli/reck/shell/state.js';

describe('Shell UI Components', () => {
  describe('ShellHeader', () => {
    it('should render version', () => {
      const node = ShellHeader({
        version: '1.0.0',
        baseUrl: '',
        activeJobs: 0,
      });

      const output = renderToString(node, 80);
      expect(output).toContain('1.0.0');
      expect(output).toContain('rek');
    });

    it('should render base URL when set', () => {
      const node = ShellHeader({
        version: '1.0.0',
        baseUrl: 'https://api.example.com',
        activeJobs: 0,
      });

      const output = renderToString(node, 120);
      expect(output).toContain('api.example.com');
    });

    it('should render "no base url" when not set', () => {
      const node = ShellHeader({
        version: '1.0.0',
        baseUrl: '',
        activeJobs: 0,
      });

      const output = renderToString(node, 80);
      expect(output).toContain('no base url');
    });

    it('should show active jobs count', () => {
      const node = ShellHeader({
        version: '1.0.0',
        baseUrl: '',
        activeJobs: 3,
      });

      const output = renderToString(node, 80);
      expect(output).toContain('3 active');
    });

    it('should not show jobs when count is 0', () => {
      const node = ShellHeader({
        version: '1.0.0',
        baseUrl: '',
        activeJobs: 0,
      });

      const output = renderToString(node, 80);
      expect(output).not.toContain('active');
    });

    it('should render hotkey hints', () => {
      const node = ShellHeader({
        version: '1.0.0',
        baseUrl: '',
        activeJobs: 0,
      });

      const output = renderToString(node, 80);
      expect(output).toContain('F1');
      expect(output).toContain('F2');
      expect(output).toContain('ctrl+l');
      expect(output).toContain('ctrl+c');
    });

    it('should render separator line', () => {
      const node = ShellHeader({
        version: '1.0.0',
        baseUrl: '',
        activeJobs: 0,
      });

      const output = renderToString(node, 80);
      expect(output).toContain('─');
    });
  });

  describe('MessageBubble', () => {
    const createMessage = (
      role: ShellMessage['role'],
      content: string,
      meta?: ShellMessage['meta']
    ): ShellMessage => ({
      id: 1,
      role,
      content,
      timestamp: new Date(),
      meta,
    });

    it('should render user message', () => {
      const node = MessageBubble({
        message: createMessage('user', '❯ get https://api.example.com'),
      });

      const output = renderToString(node, 80);
      expect(output).toContain('get https://api.example.com');
    });

    it('should render assistant message', () => {
      const node = MessageBubble({
        message: createMessage('assistant', '{"status": "ok"}'),
      });

      const output = renderToString(node, 80);
      expect(output).toContain('status');
    });

    it('should render error message', () => {
      const node = MessageBubble({
        message: createMessage('error', 'Connection refused'),
      });

      const output = renderToString(node, 80);
      expect(output).toContain('Connection refused');
    });

    it('should render info message', () => {
      const node = MessageBubble({
        message: createMessage('info', 'Welcome to Reck Shell!'),
      });

      const output = renderToString(node, 80);
      expect(output).toContain('Welcome');
    });

    it('should render success message', () => {
      const node = MessageBubble({
        message: createMessage('success', 'Request completed'),
      });

      const output = renderToString(node, 80);
      expect(output).toContain('Request completed');
    });

    it('should render system message with label', () => {
      const node = MessageBubble({
        message: createMessage('system', 'System initialized'),
      });

      const output = renderToString(node, 80);
      expect(output).toContain('system');
    });

    it('should render meta info - duration', () => {
      const node = MessageBubble({
        message: createMessage('assistant', 'Response', { duration: 150 }),
      });

      const output = renderToString(node, 80);
      expect(output).toContain('150ms');
    });

    it('should render meta info - status', () => {
      const node = MessageBubble({
        message: createMessage('assistant', 'Response', { status: 200 }),
      });

      const output = renderToString(node, 80);
      expect(output).toContain('200');
    });

    it('should render meta info - command', () => {
      const node = MessageBubble({
        message: createMessage('assistant', 'Response', { command: 'GET /api' }),
      });

      const output = renderToString(node, 80);
      expect(output).toContain('GET /api');
    });
  });

  describe('ShellMessages', () => {
    const createMessages = (count: number): ShellMessage[] =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        role: 'info' as const,
        content: `Message ${i + 1}`,
        timestamp: new Date(),
      }));

    it('should render placeholder when no messages', () => {
      const node = ShellMessages({
        messages: [],
        scrollOffset: 0,
      });

      const output = renderToString(node, 80);
      expect(output).toContain('Type a command');
    });

    it('should render messages', () => {
      const node = ShellMessages({
        messages: createMessages(3),
        scrollOffset: 0,
      });

      const output = renderToString(node, 80);
      expect(output).toContain('Message 1');
      expect(output).toContain('Message 2');
      expect(output).toContain('Message 3');
    });

    it('should limit visible messages to maxVisible', () => {
      const node = ShellMessages({
        messages: createMessages(10),
        scrollOffset: 0,
        maxVisible: 5,
      });

      const output = renderToString(node, 80);
      // Should show last 5 messages
      expect(output).toContain('Message 6');
      expect(output).toContain('Message 10');
    });

    it('should show scroll indicator when messages are above', () => {
      const node = ShellMessages({
        messages: createMessages(10),
        scrollOffset: 0,
        maxVisible: 5,
      });

      const output = renderToString(node, 80);
      expect(output).toContain('more messages above');
    });

    it('should show scroll indicator when scrolled down', () => {
      const node = ShellMessages({
        messages: createMessages(10),
        scrollOffset: 2,
        maxVisible: 5,
      });

      const output = renderToString(node, 80);
      expect(output).toContain('more messages below');
    });

    it('should handle scrollOffset correctly', () => {
      const node = ShellMessages({
        messages: createMessages(10),
        scrollOffset: 3,
        maxVisible: 5,
      });

      const output = renderToString(node, 80);
      // With scrollOffset 3, we see messages ending at index 7 (10 - 3)
      expect(output).toContain('Message 7');
    });
  });

  describe('JobCard', () => {
    const createJob = (
      id: number,
      type: Job['type'],
      status: Job['status'],
      target: string
    ): Job => ({
      id,
      type,
      status,
      target,
      startTime: new Date(),
      progress: {
        bytes: 1024000,
        segments: 10,
      },
    });

    it('should render download job', () => {
      const node = JobCard({
        job: createJob(1, 'download', 'running', 'https://example.com/file.mp4'),
      });

      const output = renderToString(node, 80);
      expect(output).toContain('[1]');
      expect(output).toContain('file.mp4');
    });

    it('should render watch job', () => {
      const node = JobCard({
        job: createJob(2, 'watch', 'watching', 'https://stream.example.com'),
      });

      const output = renderToString(node, 80);
      expect(output).toContain('[2]');
    });

    it('should render spider job with page count', () => {
      const job: Job = {
        id: 3,
        type: 'spider',
        status: 'crawling',
        target: 'https://example.com',
        startTime: new Date(),
        progress: {
          bytes: 0,
          segments: 0,
          pages: 25,
          queued: 10,
        },
      };

      const node = JobCard({ job });
      const output = renderToString(node, 80);
      expect(output).toContain('25 pages');
      expect(output).toContain('10 queued');
    });

    it('should render completed job', () => {
      const node = JobCard({
        job: createJob(4, 'download', 'completed', 'file.zip'),
      });

      const output = renderToString(node, 80);
      expect(output).toContain('[4]');
    });

    it('should render failed job', () => {
      const node = JobCard({
        job: createJob(5, 'download', 'failed', 'broken.file'),
      });

      const output = renderToString(node, 80);
      expect(output).toContain('[5]');
    });

    it('should render stopped job', () => {
      const node = JobCard({
        job: createJob(6, 'download', 'stopped', 'cancelled.file'),
      });

      const output = renderToString(node, 80);
      expect(output).toContain('[6]');
    });

    it('should show progress in bytes/MB', () => {
      const node = JobCard({
        job: createJob(7, 'download', 'running', 'large.file'),
      });

      const output = renderToString(node, 80);
      // 1024000 bytes ≈ 1000 KB ≈ 0.98 MB
      expect(output.toLowerCase()).toMatch(/\d+.*b|\d+.*kb|\d+.*mb/i);
    });
  });

  describe('JobsPanel', () => {
    it('should render empty panel', () => {
      const node = JobsPanel({ jobs: [] });
      const output = renderToString(node, 80);

      expect(output).toContain('Jobs Panel');
      expect(output).toContain('No active jobs');
    });

    it('should show active jobs section', () => {
      const jobs: Job[] = [
        {
          id: 1,
          type: 'download',
          status: 'running',
          target: 'file.zip',
          startTime: new Date(),
          progress: { bytes: 0, segments: 0 },
        },
      ];

      const node = JobsPanel({ jobs });
      const output = renderToString(node, 80);
      expect(output).toContain('Active (1)');
    });

    it('should show completed jobs section', () => {
      const jobs: Job[] = [
        {
          id: 1,
          type: 'download',
          status: 'completed',
          target: 'done.zip',
          startTime: new Date(),
          progress: { bytes: 1000, segments: 1 },
        },
      ];

      const node = JobsPanel({ jobs });
      const output = renderToString(node, 80);
      expect(output).toContain('Recent (1)');
    });

    it('should show help text', () => {
      const node = JobsPanel({ jobs: [] });
      const output = renderToString(node, 80);
      expect(output).toContain('job');
    });
  });

  describe('ShellStatusBar', () => {
    it('should not render when no active jobs', () => {
      const node = ShellStatusBar({ jobs: [] });
      const output = renderToString(node, 80);
      expect(output).toBe('');
    });

    it('should show active job count', () => {
      const jobs: Job[] = [
        {
          id: 1,
          type: 'download',
          status: 'running',
          target: 'file1.zip',
          startTime: new Date(),
          progress: { bytes: 1000, segments: 1 },
        },
        {
          id: 2,
          type: 'download',
          status: 'running',
          target: 'file2.zip',
          startTime: new Date(),
          progress: { bytes: 2000, segments: 2 },
        },
      ];

      const node = ShellStatusBar({ jobs });
      const output = renderToString(node, 80);
      expect(output).toContain('2 active');
    });

    it('should show total bytes', () => {
      const jobs: Job[] = [
        {
          id: 1,
          type: 'download',
          status: 'running',
          target: 'file.zip',
          startTime: new Date(),
          progress: { bytes: 1048576, segments: 1 }, // 1 MB
        },
      ];

      const node = ShellStatusBar({ jobs });
      const output = renderToString(node, 80);
      expect(output).toMatch(/1.*mb/i);
    });

    it('should ignore completed jobs', () => {
      const jobs: Job[] = [
        {
          id: 1,
          type: 'download',
          status: 'completed',
          target: 'done.zip',
          startTime: new Date(),
          progress: { bytes: 1000, segments: 1 },
        },
      ];

      const node = ShellStatusBar({ jobs });
      const output = renderToString(node, 80);
      expect(output).toBe('');
    });
  });

  describe('ShellHelp', () => {
    it('should render help panel title', () => {
      const node = ShellHelp();
      const output = renderToString(node, 120);
      expect(output).toContain('Quick Reference');
    });

    it('should show commands section', () => {
      const node = ShellHelp();
      const output = renderToString(node, 120);
      expect(output).toContain('Commands');
    });

    it('should show shortcuts section', () => {
      const node = ShellHelp();
      const output = renderToString(node, 120);
      expect(output).toContain('Shortcuts');
    });

    it('should list HTTP methods', () => {
      const node = ShellHelp();
      const output = renderToString(node, 120);
      expect(output).toContain('GET');
      expect(output).toContain('POST');
    });

    it('should list network commands', () => {
      const node = ShellHelp();
      const output = renderToString(node, 120);
      expect(output).toContain('dns');
      expect(output).toContain('whois');
      expect(output).toContain('tls');
    });

    it('should list keyboard shortcuts', () => {
      const node = ShellHelp();
      const output = renderToString(node, 120);
      expect(output).toContain('F1');
      expect(output).toContain('F2');
      expect(output).toContain('Ctrl+L');
      expect(output).toContain('Ctrl+C');
    });
  });

  describe('ProcessingIndicator', () => {
    it('should not render when inactive', () => {
      const node = ProcessingIndicator({ isActive: false });
      const output = renderToString(node, 80);
      expect(output).toBe('');
    });

    it('should render when active', () => {
      const node = ProcessingIndicator({ isActive: true });
      const output = renderToString(node, 80);
      expect(output.length).toBeGreaterThan(0);
    });

    it('should show command when provided', () => {
      const node = ProcessingIndicator({
        isActive: true,
        command: 'GET https://api.example.com',
      });

      const output = renderToString(node, 80);
      expect(output).toContain('GET https://api.example.com');
    });

    it('should show default text when no command', () => {
      const node = ProcessingIndicator({ isActive: true });
      const output = renderToString(node, 80);
      expect(output).toContain('Processing');
    });
  });
});

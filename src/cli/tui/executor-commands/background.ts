/**
 * Background Job Execution
 *
 * Handles execution of commands as background jobs:
 * spider, seo, live, hls, load, serve, proxy
 */

import type { CommandResult } from './types.js';
import type { Client } from '../../../core/client.js';
import { parseArgValue, parseArgValueFlag, getDefaultPort } from './parser.js';
import {
  addHistoryItem,
  baseUrl,
  setPendingTabSwitch,
} from '../hooks/useShellState.js';
import {
  registerSpider,
  registerServer,
  registerLoadTest,
  registerSEO,
  registerVideo,
  registerHLS,
  registerDownload,
  registerWatch,
  registerProxy,
  startJob,
  failJob,
  getJobManager,
} from '../hooks/useJobs.js';
import { trackSeo, trackDownload } from '../hooks/useDomains.js';

// =============================================================================
// Types
// =============================================================================

export interface BackgroundContext {
  client: Client;
}

// =============================================================================
// Main Background Executor
// =============================================================================

/**
 * Execute a command as a background job
 */
export async function executeBackground(
  ctx: BackgroundContext,
  cmd: string,
  args: string[],
  fullCommand: string
): Promise<CommandResult> {
  switch (cmd) {
    case 'spider':
    case 'crawl':
      return startSpiderJob(ctx, args, fullCommand);

    case 'seo':
      return startSEOJob(ctx, args, fullCommand);

    case 'live':
      return startLiveJob(ctx, args, fullCommand);

    case 'hls':
      return startHLSJob(ctx, args, fullCommand);

    case 'load':
    case 'bench':
      return startLoadTestJob(ctx, args, fullCommand);

    case 'serve':
      return startServerJob(ctx, args, fullCommand);

    default:
      addHistoryItem({
        type: 'error',
        content: `Command '${cmd}' does not support background execution`,
      });
      return { success: false, error: 'Command does not support background' };
  }
}

// =============================================================================
// Spider Job
// =============================================================================

function startSpiderJob(
  ctx: BackgroundContext,
  args: string[],
  fullCommand: string
): CommandResult {
  let url = args[0];
  if (!url) {
    const base = baseUrl();
    if (base) {
      url = base;
    } else {
      addHistoryItem({ type: 'error', content: 'Usage: spider <url> &' });
      return { success: false };
    }
  }

  if (!url.startsWith('http')) {
    url = `https://${url}`;
  }

  const depth = parseArgValue(args, 'depth', 5);
  const limit = parseArgValue(args, 'limit', 100);
  const concurrency = parseArgValue(args, 'concurrency', 5);
  const seoEnabled = args.includes('--seo') || args.includes('-S');

  const controller = new AbortController();
  const job = registerSpider(url, () => controller.abort());

  const manager = getJobManager();
  manager.setCommand(job.id, fullCommand);
  manager.setMetadata(job.id, { depth, limit, concurrency, seo: seoEnabled });

  startJob(job.id);
  manager.addLog(job.id, {
    timestamp: Date.now(),
    level: 'info',
    message: `Starting spider: ${url}`,
  });

  runSpiderAsync(job.id, url, { depth, limit, concurrency, seo: seoEnabled }, controller.signal);

  addHistoryItem({
    type: 'info',
    content: `[job:${job.id}] Spider started in background: ${url} (depth=${depth}, limit=${limit})`,
  });

  return { success: true, output: { jobId: job.id } };
}

async function runSpiderAsync(
  jobId: number,
  url: string,
  options: { depth: number; limit: number; concurrency: number; seo: boolean },
  signal: AbortSignal
): Promise<void> {
  try {
    const { SpiderRunner } = await import('../../commands/spider-runner.js');
    const { attachTUIHandler } = await import('../../events/handlers/tui.js');

    const runner = new SpiderRunner();
    attachTUIHandler(runner, { jobId, signal });

    await runner.run(url, {
      depth: options.depth,
      limit: options.limit,
      concurrency: options.concurrency,
      seo: options.seo,
      robots: true,
      signal,
    });
  } catch (err: any) {
    if (!signal.aborted) {
      failJob(jobId, err);
    }
  }
}

// =============================================================================
// SEO Job
// =============================================================================

function startSEOJob(
  ctx: BackgroundContext,
  args: string[],
  fullCommand: string
): CommandResult {
  let url = args[0];
  if (!url) {
    const base = baseUrl();
    if (base) {
      url = base;
    } else {
      addHistoryItem({ type: 'error', content: 'Usage: seo <url> &' });
      return { success: false };
    }
  }

  if (!url.startsWith('http')) {
    url = `https://${url}`;
  }

  const controller = new AbortController();
  const job = registerSEO(url, () => controller.abort());

  const manager = getJobManager();
  manager.setCommand(job.id, fullCommand);

  startJob(job.id);
  manager.addLog(job.id, {
    timestamp: Date.now(),
    level: 'info',
    message: `Starting SEO analysis: ${url}`,
  });

  runSEOAsync(ctx.client, job.id, url, controller.signal);

  addHistoryItem({
    type: 'info',
    content: `[job:${job.id}] SEO analysis started in background: ${url}`,
  });

  return { success: true, output: { jobId: job.id } };
}

async function runSEOAsync(
  client: Client,
  jobId: number,
  url: string,
  signal: AbortSignal
): Promise<void> {
  try {
    const { SEORunner } = await import('../../commands/seo-runner.js');
    const { attachTUIHandler } = await import('../../events/handlers/tui.js');

    const runner = new SEORunner(client);
    attachTUIHandler(runner, { jobId, signal });

    const result = await runner.run(url, { signal, client });

    const hostname = new URL(url).hostname;
    trackSeo(hostname, {
      score: result.score,
      issues: result.summary.errors + result.summary.warnings,
      categories: {
        technical: result.categories['technical']?.score ?? 0,
        content: result.categories['content']?.score ?? 0,
        performance: result.categories['performance']?.score ?? 0,
      },
    });
  } catch (err: any) {
    if (!signal.aborted) {
      failJob(jobId, err);
    }
  }
}

// =============================================================================
// Live Streaming Job
// =============================================================================

function startLiveJob(
  ctx: BackgroundContext,
  args: string[],
  fullCommand: string
): CommandResult {
  const subCmd = args[0]?.toLowerCase();
  const url = args[1];

  if (!url) {
    addHistoryItem({
      type: 'error',
      content: 'Usage: live download <url> & | live watch <url> &',
    });
    return { success: false };
  }

  if (subCmd === 'download') {
    return startLiveDownloadJob(ctx, url, args.slice(2), fullCommand);
  } else if (subCmd === 'watch') {
    return startLiveWatchJob(url, args.slice(2), fullCommand);
  }

  addHistoryItem({
    type: 'error',
    content: 'Usage: live download <url> & | live watch <url> &',
  });
  return { success: false };
}

function startLiveDownloadJob(
  ctx: BackgroundContext,
  url: string,
  args: string[],
  fullCommand: string
): CommandResult {
  const controller = new AbortController();
  const job = registerDownload(url, () => controller.abort());

  const manager = getJobManager();
  manager.setCommand(job.id, fullCommand);

  const quality = parseArgValueFlag(args, ['-q', '--quality'], 'highest') as string;
  const duration = parseArgValueFlag(args, ['-d', '--duration'], undefined) as
    | number
    | undefined;
  const output = parseArgValueFlag(args, ['-o', '--output'], undefined) as
    | string
    | undefined;

  startJob(job.id);
  manager.addLog(job.id, {
    timestamp: Date.now(),
    level: 'info',
    message: `Starting live download: ${url}`,
  });

  runLiveAsync(ctx.client, job.id, url, { quality, duration, output }, controller.signal);

  addHistoryItem({
    type: 'info',
    content: `[job:${job.id}] Live download started in background: ${url}`,
  });

  return { success: true, output: { jobId: job.id } };
}

async function runLiveAsync(
  client: Client,
  jobId: number,
  url: string,
  options: { quality?: string; duration?: number; output?: string },
  signal: AbortSignal
): Promise<void> {
  try {
    const { LiveRunner } = await import('../../commands/live-runner.js');
    const { attachTUIHandler } = await import('../../events/handlers/tui.js');

    const runner = new LiveRunner(client);
    attachTUIHandler(runner, { jobId, signal });

    const result = await runner.download(url, {
      signal,
      quality: options.quality as any,
      duration: options.duration,
      output: options.output,
      client,
    });

    const hostname = new URL(url).hostname;
    trackDownload(hostname, {
      type: 'live',
      filename: result.output,
      size: result.bytes,
      duration: result.duration,
      url,
    });
  } catch (err: any) {
    if (!signal.aborted) {
      failJob(jobId, err);
    }
  }
}

function startLiveWatchJob(
  url: string,
  args: string[],
  fullCommand: string
): CommandResult {
  const controller = new AbortController();
  const job = registerWatch(url, () => controller.abort());

  const manager = getJobManager();
  manager.setCommand(job.id, fullCommand);

  startJob(job.id);
  manager.addLog(job.id, {
    timestamp: Date.now(),
    level: 'info',
    message: `Started watching: ${url}`,
  });

  addHistoryItem({
    type: 'info',
    content: `[job:${job.id}] Watch started in background: ${url}`,
  });

  return { success: true, output: { jobId: job.id } };
}

// =============================================================================
// HLS Job
// =============================================================================

function startHLSJob(
  ctx: BackgroundContext,
  args: string[],
  fullCommand: string
): CommandResult {
  let url = args[0];
  if (!url) {
    addHistoryItem({ type: 'error', content: 'Usage: hls <url> &' });
    return { success: false };
  }

  if (!url.startsWith('http')) {
    const base = baseUrl();
    url = base ? `${base}${url.startsWith('/') ? '' : '/'}${url}` : `https://${url}`;
  }

  const quality = parseArgValueFlag(args, ['-q', '--quality'], 'highest') as string;
  const output = parseArgValueFlag(args, ['-o', '--output'], undefined) as
    | string
    | undefined;
  const live = args.includes('--live') || args.includes('-l');
  const duration = parseArgValueFlag(args, ['-d', '--duration'], undefined) as
    | number
    | undefined;

  const controller = new AbortController();
  const job = registerHLS(url, () => controller.abort());

  const manager = getJobManager();
  manager.setCommand(job.id, fullCommand);

  startJob(job.id);
  manager.addLog(job.id, {
    timestamp: Date.now(),
    level: 'info',
    message: `Starting HLS download: ${url}`,
  });

  runHLSAsync(ctx.client, job.id, url, { quality, output, live, duration }, controller.signal);

  addHistoryItem({
    type: 'info',
    content: `[job:${job.id}] HLS download started in background: ${url}`,
  });

  return { success: true, output: { jobId: job.id } };
}

async function runHLSAsync(
  client: Client,
  jobId: number,
  url: string,
  options: { quality?: string; output?: string; live?: boolean; duration?: number },
  signal: AbortSignal
): Promise<void> {
  try {
    const { HLSRunner } = await import('../../commands/hls-runner.js');
    const { attachTUIHandler } = await import('../../events/handlers/tui.js');

    const runner = new HLSRunner(client);
    attachTUIHandler(runner, { jobId, signal });

    const result = await runner.download(url, {
      signal,
      quality: options.quality as any,
      output: options.output,
      live: options.live,
      duration: options.duration,
      client,
    });

    const hostname = new URL(url).hostname;
    trackDownload(hostname, {
      type: 'hls',
      filename: result.output,
      size: result.bytes,
      duration: result.duration,
      url,
    });
  } catch (err: any) {
    if (!signal.aborted) {
      failJob(jobId, err);
    }
  }
}

// =============================================================================
// Load Test Job
// =============================================================================

function startLoadTestJob(
  ctx: BackgroundContext,
  args: string[],
  fullCommand: string
): CommandResult {
  let url = args[0];
  if (!url) {
    const base = baseUrl();
    if (base) {
      url = base;
    } else {
      addHistoryItem({ type: 'error', content: 'Usage: load <url> &' });
      return { success: false };
    }
  }

  if (!url.startsWith('http')) {
    url = `https://${url}`;
  }

  const users = parseArgValueFlag(args, ['-u', '--users'], 50);
  const duration = parseArgValueFlag(args, ['-d', '--duration'], 60);
  const mode = parseArgValueFlag(args, ['-m', '--mode'], 'throughput');
  const http2 = args.includes('--http2');
  const rampUp = parseArgValueFlag(args, ['-r', '--ramp-up'], 0);
  const insecure = args.includes('-k') || args.includes('--insecure');

  const controller = new AbortController();
  const job = registerLoadTest(url, () => controller.abort());

  const manager = getJobManager();
  manager.setCommand(job.id, fullCommand);
  manager.setMetadata(job.id, { users, duration, mode });

  startJob(job.id);
  manager.addLog(job.id, {
    timestamp: Date.now(),
    level: 'info',
    message: `Starting load test: ${url} (${users} users, ${duration}s, ${mode})`,
  });

  runLoadTestAsync(
    job.id,
    url,
    { users, duration, mode, http2, rampUp, insecure },
    controller.signal
  );

  addHistoryItem({
    type: 'info',
    content: `[job:${job.id}] Load test started in background: ${url} (${users} users, ${duration}s)`,
  });

  return { success: true, output: { jobId: job.id } };
}

async function runLoadTestAsync(
  jobId: number,
  url: string,
  options: {
    users: number;
    duration: number;
    mode: string;
    http2: boolean;
    rampUp: number;
    insecure: boolean;
  },
  signal: AbortSignal
): Promise<void> {
  try {
    const { LoadTestRunner } = await import('../../commands/loadtest-runner.js');
    const { attachTUIHandler } = await import('../../events/handlers/tui.js');

    const runner = new LoadTestRunner();
    attachTUIHandler(runner, { jobId, signal });

    await runner.run({
      url,
      signal,
      users: options.users,
      duration: options.duration,
      mode: options.mode as any,
      http2: options.http2,
      rampUp: options.rampUp,
      insecure: options.insecure,
    });
  } catch (err: any) {
    if (!signal.aborted) {
      failJob(jobId, err);
    }
  }
}

// =============================================================================
// Server Job
// =============================================================================

function startServerJob(
  ctx: BackgroundContext,
  args: string[],
  fullCommand: string
): CommandResult {
  const serverType = args[0]?.toLowerCase() || 'http';
  const validTypes = [
    'http',
    'webhook',
    'ws',
    'websocket',
    'dns',
    'hls',
    'sse',
    'ftp',
    'telnet',
    'whois',
    'udp',
    'proxy',
  ];

  const normalizedType = serverType === 'ws' ? 'websocket' : serverType;

  if (!validTypes.includes(serverType)) {
    addHistoryItem({
      type: 'error',
      content: `Invalid server type: ${serverType}. Valid types: ${validTypes.join(', ')}`,
    });
    return { success: false };
  }

  if (normalizedType === 'proxy') {
    return startProxyJob(args.slice(1), fullCommand);
  }

  const port = parseArgValueFlag(args, ['-p', '--port'], getDefaultPort(normalizedType));
  const delay = parseArgValueFlag(args, ['-d', '--delay'], 0);
  const echo = !args.includes('--no-echo');

  const controller = new AbortController();
  const job = registerServer(`${normalizedType}://localhost:${port}`, () =>
    controller.abort()
  );

  const manager = getJobManager();
  manager.setCommand(job.id, fullCommand);
  manager.setPort(job.id, port);
  manager.setMetadata(job.id, { serverType: normalizedType });

  startJob(job.id);
  manager.addLog(job.id, {
    timestamp: Date.now(),
    level: 'info',
    message: `Starting ${normalizedType.toUpperCase()} server on port ${port}`,
  });

  runServerAsync(job.id, normalizedType, { port, delay, echo }, controller.signal);

  addHistoryItem({
    type: 'info',
    content: `[job:${job.id}] ${normalizedType.toUpperCase()} server started on port ${port}`,
  });

  return { success: true, output: { jobId: job.id } };
}

async function runServerAsync(
  jobId: number,
  serverType: string,
  options: { port: number; delay?: number; echo?: boolean },
  signal: AbortSignal
): Promise<void> {
  try {
    const { ServerRunner } = await import('../../commands/server-runner.js');
    const { attachTUIHandler } = await import('../../events/handlers/tui.js');

    const runner = new ServerRunner();
    attachTUIHandler(runner, { jobId, signal });

    await runner.start(serverType as any, {
      port: options.port,
      delay: options.delay,
      echo: options.echo,
      signal,
    });
  } catch (err: any) {
    if (!signal.aborted) {
      failJob(jobId, err);
    }
  }
}

// =============================================================================
// Proxy Job
// =============================================================================

function startProxyJob(args: string[], fullCommand: string): CommandResult {
  const port = parseArgValueFlag(args, ['-p', '--port'], 8888);
  const host = parseArgValueFlag(args, ['-h', '--host'], '0.0.0.0') as string;
  const intercept = args.includes('-i') || args.includes('--intercept');
  const logPayloads = args.includes('--log-payloads');
  const verbose = args.includes('-v') || args.includes('--verbose');

  const mode = intercept ? 'intercept' : 'forward';
  const url = `proxy://${host}:${port}`;

  const controller = new AbortController();
  const job = registerProxy(url, () => controller.abort());

  const manager = getJobManager();
  manager.setCommand(job.id, fullCommand);
  manager.setPort(job.id, port);
  manager.setMetadata(job.id, { mode, host, intercept, logPayloads, verbose });

  startJob(job.id);
  manager.addLog(job.id, {
    timestamp: Date.now(),
    level: 'info',
    message: `Starting ${mode.toUpperCase()} proxy on ${host}:${port}`,
  });

  runProxyAsync(
    job.id,
    { port, host, mode, intercept, logPayloads, verbose },
    controller.signal
  );

  addHistoryItem({
    type: 'info',
    content: `[job:${job.id}] Proxy server started on ${host}:${port} (mode: ${mode})`,
  });

  setPendingTabSwitch('proxy');

  return { success: true, output: { jobId: job.id } };
}

async function runProxyAsync(
  jobId: number,
  options: {
    port: number;
    host: string;
    mode: string;
    intercept: boolean;
    logPayloads: boolean;
    verbose: boolean;
  },
  signal: AbortSignal
): Promise<void> {
  try {
    const { MockProxyServer } = await import('../../../testing/mock-proxy-server.js');
    const {
      setProxyRunning,
      setProxyStopped,
      addProxyRequest,
      updateProxyStats,
    } = await import('../hooks/useProxy.js');

    const manager = getJobManager();

    const proxy = await MockProxyServer.create({
      port: options.port,
      host: options.host,
      mode: options.intercept ? 'intercept' : 'forward',
    });

    setProxyRunning({
      isRunning: true,
      url: proxy.url,
      mode: options.intercept ? 'intercept' : 'forward',
      port: options.port,
    });

    let requestCount = 0;
    let successCount = 0;
    let errorCount = 0;
    let bytesIn = 0;
    let bytesOut = 0;
    let totalLatency = 0;

    proxy.on('request', (req) => {
      requestCount++;
      const requestId = `${Date.now()}-${requestCount}`;

      addProxyRequest({
        id: requestId,
        timestamp: Date.now(),
        method: req.method,
        url: req.url,
        targetHost: req.targetHost,
        targetPort: req.targetPort,
        isHttps: req.isHttps,
        clientIp: req.clientIp,
        headers: req.headers,
      });

      if (options.verbose) {
        manager.addLog(jobId, {
          timestamp: Date.now(),
          level: 'info',
          message: `${req.method} ${req.url}`,
        });
      }

      manager.updateProgress(jobId, {
        proxyRequests: requestCount,
        proxySuccess: successCount,
        proxyErrors: errorCount,
      });
    });

    proxy.on('response', (res) => {
      successCount++;
      if (res.size) bytesIn += res.size;

      updateProxyStats({
        totalRequests: requestCount,
        successCount,
        errorCount,
        bytesIn,
        bytesOut,
        avgLatency: successCount > 0 ? Math.round(totalLatency / successCount) : 0,
        requestsPerSecond: 0,
        activeConnections: proxy.stats.activeConnections,
        byStatusCode: {},
        byMethod: {},
        topHosts: [],
      });

      manager.updateProgress(jobId, {
        proxyRequests: requestCount,
        proxySuccess: successCount,
        proxyErrors: errorCount,
        proxyBytesIn: bytesIn,
      });
    });

    proxy.on('error', (err) => {
      errorCount++;
      manager.addLog(jobId, {
        timestamp: Date.now(),
        level: 'error',
        message: err.message,
      });

      manager.updateProgress(jobId, {
        proxyErrors: errorCount,
      });
    });

    signal.addEventListener('abort', async () => {
      await proxy.stop();
      setProxyStopped();
      manager.updateStatus(jobId, 'stopped');
    });

    await new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      signal.addEventListener('abort', () => resolve());
    });
  } catch (err: any) {
    if (!signal.aborted) {
      failJob(jobId, err);
      const { setProxyStopped } = await import('../hooks/useProxy.js');
      setProxyStopped();
    }
  }
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Commands that can be run in background with '&' suffix
 */
export const BACKGROUNDABLE_COMMANDS = new Set([
  'spider',
  'crawl',
  'seo',
  'live',
  'hls',
  'load',
  'bench',
  'serve',
]);

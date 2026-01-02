/**
 * Event-Driven Command Runners
 *
 * These runners wrap core functionality and emit events for CLI/TUI handlers.
 * This architecture separates command logic from presentation.
 */

// Spider
export { SpiderRunner, runSpiderWithEvents } from './spider-runner.js';
export type { SpiderRunnerOptions, SpiderRunnerResult } from './spider-runner.js';

// SEO Analysis
export { SEORunner, runSEOWithEvents } from './seo-runner.js';
export type { SEORunnerOptions, SEORunnerResult } from './seo-runner.js';

// Live Streaming
export { LiveRunner, runLiveWithEvents } from './live-runner.js';
export type { LiveRunnerOptions, LiveRunnerResult, LiveInfoResult } from './live-runner.js';

// HLS Download
export { HLSRunner, runHLSWithEvents } from './hls-runner.js';
export type { HLSRunnerOptions, HLSDownloadResult, HLSInfoResult } from './hls-runner.js';

// Load Testing
export { LoadTestRunner, runLoadTestWithEvents } from './loadtest-runner.js';
export type { LoadTestRunnerOptions, LoadTestRunnerResult, LoadTestSnapshot } from './loadtest-runner.js';

// Mock Servers
export { ServerRunner, runServerWithEvents } from './server-runner.js';
export type { ServerType, ServerRunnerOptions, ServerRunnerResult, ServerStats } from './server-runner.js';

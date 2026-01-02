/**
 * Command Events System
 *
 * Unified event architecture for CLI commands.
 * Commands emit events, handlers decide what to do with them.
 *
 * @example
 * ```typescript
 * import { CommandEmitter, attachCLIHandler, attachTUIHandler } from './events';
 *
 * class MyCommand extends CommandEmitter {
 *   async run(url: string) {
 *     this.emitStart(url);
 *     // ... do work ...
 *     this.emitProgress({ current: 5, total: 10 });
 *     // ... finish ...
 *     this.emitComplete({ itemsProcessed: 10 });
 *   }
 * }
 *
 * const cmd = new MyCommand('mycommand');
 *
 * // CLI mode: outputs to console
 * attachCLIHandler(cmd, { verbose: true });
 *
 * // TUI mode: updates hooks (useJobs, useDomains)
 * attachTUIHandler(cmd, { jobId: 123 });
 *
 * await cmd.run('https://example.com');
 * ```
 */

// Types
export type {
  // Base types
  EventLevel,
  BaseEvent,
  HandlerContext,
  EventHandler,
  EventSubscription,

  // Lifecycle events
  StartEvent,
  ProgressEvent,
  CompleteEvent,
  ErrorEvent,
  DataEvent,

  // Command-specific events
  SpiderPageEvent,
  SpiderQueueEvent,
  DownloadSegmentEvent,
  DownloadStatusEvent,
  SEOIssueEvent,
  SEOScoreEvent,
  ServerRequestEvent,
  ServerConnectionEvent,
  DNSRecordEvent,

  // Union types
  LifecycleEvent,
  SpiderEvent,
  DownloadEvent,
  SEOEvent,
  ServerEvent,
  CommandEvent,
} from './types.js';

// Emitter
export { CommandEmitter, globalEventBus } from './emitter.js';

// Handlers
export { CLIHandler, attachCLIHandler } from './handlers/cli.js';
export { TUIHandler, attachTUIHandler } from './handlers/tui.js';

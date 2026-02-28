/**
 * Command Event Types
 *
 * Standardized event shapes for all CLI commands.
 * Commands emit these events, handlers decide what to do with them.
 */

// =============================================================================
// Base Event Types
// =============================================================================

export type EventLevel = 'debug' | 'info' | 'warn' | 'error';

export interface BaseEvent {
  /** Event timestamp */
  timestamp: number;
  /** Command that emitted this event */
  command: string;
  /** Event level for filtering */
  level: EventLevel;
}

// =============================================================================
// Lifecycle Events
// =============================================================================

export interface StartEvent extends BaseEvent {
  type: 'start';
  /** Target URL or identifier */
  target: string;
  /** Command options/config */
  options?: Record<string, unknown>;
}

export interface ProgressEvent extends BaseEvent {
  type: 'progress';
  /** Current progress (0-100) */
  percent?: number;
  /** Items processed */
  current?: number;
  /** Total items (if known) */
  total?: number;
  /** Current item being processed */
  currentItem?: string;
  /** Additional metrics */
  metrics?: Record<string, number | string>;
}

export interface CompleteEvent extends BaseEvent {
  type: 'complete';
  /** Duration in ms */
  duration: number;
  /** Summary data */
  summary: Record<string, unknown>;
}

export interface ErrorEvent extends BaseEvent {
  type: 'error';
  /** Error message */
  message: string;
  /** Error code if available */
  code?: string;
  /** Stack trace */
  stack?: string;
  /** Related URL or item */
  context?: string;
}

// =============================================================================
// Data Events (command-specific payloads)
// =============================================================================

export interface DataEvent<T = unknown> extends BaseEvent {
  type: 'data';
  /** Data category */
  category: string;
  /** Payload */
  payload: T;
}

// =============================================================================
// Spider-Specific Events
// =============================================================================

export interface SpiderPageEvent extends BaseEvent {
  type: 'spider:page';
  url: string;
  status: number;
  depth: number;
  title?: string;
  links: number;
  duration: number;
  security?: {
    blocked?: boolean;
    reason?: string;
    confidence?: number;
    captchaDetected?: boolean;
    captchaProvider?: string;
    attempts?: number;
    retryCount?: number;
    retryAfterMs?: number;
    transport?: 'auto' | 'undici' | 'curl';
    blockedByCaptcha?: boolean;
    lastStatus?: number;
    lastTransport?: 'auto' | 'undici' | 'curl';
  };
  timings?: {
    dns?: number;
    tcp?: number;
    tls?: number;
    ttfb?: number;
    download?: number;
    total?: number;
  };
  resources?: {
    images: number;
    scripts: number;
    stylesheets: number;
  };
}

export interface SpiderQueueEvent extends BaseEvent {
  type: 'spider:queue';
  crawled: number;
  queued: number;
  depth: number;
}

// =============================================================================
// Live/HLS Download Events
// =============================================================================

export interface DownloadSegmentEvent extends BaseEvent {
  type: 'download:segment';
  segmentNumber: number;
  totalSegments?: number;
  bytes: number;
  totalBytes: number;
  duration?: number;
}

export interface DownloadStatusEvent extends BaseEvent {
  type: 'download:status';
  status: 'waiting' | 'downloading' | 'paused' | 'complete';
  message?: string;
}

// =============================================================================
// SEO Events
// =============================================================================

export interface SEOFetchEvent extends BaseEvent {
  type: 'seo:fetch';
  url: string;
  status: number;
  size: number;
  ttfb?: number;
}

export interface SEOCheckEvent extends BaseEvent {
  type: 'seo:check';
  category: string;
  id: string;
  message: string;
  details?: string;
}

export interface SEOIssueEvent extends BaseEvent {
  type: 'seo:issue';
  category: 'technical' | 'content' | 'performance' | 'mobile';
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  element?: string;
}

export interface SEOScoreEvent extends BaseEvent {
  type: 'seo:score';
  overall: number;
  categories: {
    technical: number;
    content: number;
    performance: number;
    mobile: number;
  };
}

// =============================================================================
// Server Events
// =============================================================================

export interface ServerRequestEvent extends BaseEvent {
  type: 'server:request';
  method: string;
  path: string;
  status: number;
  duration: number;
  clientIp?: string;
}

export interface ServerConnectionEvent extends BaseEvent {
  type: 'server:connection';
  action: 'connect' | 'disconnect';
  clientId: string;
  protocol: string;
}

// =============================================================================
// DNS Events
// =============================================================================

export interface DNSRecordEvent extends BaseEvent {
  type: 'dns:record';
  recordType: string;
  value: string;
  ttl?: number;
  server?: string;
}

// =============================================================================
// Union Types
// =============================================================================

export type LifecycleEvent = StartEvent | ProgressEvent | CompleteEvent | ErrorEvent;

export type SpiderEvent = SpiderPageEvent | SpiderQueueEvent;

export type DownloadEvent = DownloadSegmentEvent | DownloadStatusEvent;

export type SEOEvent = SEOFetchEvent | SEOCheckEvent | SEOIssueEvent | SEOScoreEvent;

export type ServerEvent = ServerRequestEvent | ServerConnectionEvent;

export type CommandEvent =
  | LifecycleEvent
  | DataEvent
  | SpiderEvent
  | DownloadEvent
  | SEOEvent
  | ServerEvent
  | DNSRecordEvent;

// =============================================================================
// Event Handler Types
// =============================================================================

export type EventHandler<T extends CommandEvent = CommandEvent> = (event: T) => void;

export interface EventSubscription {
  unsubscribe: () => void;
}

// =============================================================================
// Handler Context
// =============================================================================

export interface HandlerContext {
  /** Output mode */
  mode: 'cli' | 'tui' | 'json' | 'silent';
  /** Verbosity level */
  verbose: boolean;
  /** Job ID if running as background job */
  jobId?: number;
  /** Signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Concurrency Configuration Utilities
 *
 * Normalizes and auto-configures concurrency settings across
 * RequestPool, AgentManager, and HTTP/2 for optimal performance.
 */

import type {
  ConcurrencyConfig,
  AgentOptions,
  HTTP2Options,
  ClientOptions
} from '../types/index.js';

/**
 * Normalized concurrency configuration with all defaults applied
 */
export interface NormalizedConcurrencyConfig {
  max: number;
  requestsPerInterval: number;
  interval: number;
  runner: {
    concurrency: number;
    retries?: number;
    retryDelay?: number;
  };
  agent: AgentOptions & { connections: number }; // 'auto' resolved to number
  http2: {
    maxConcurrentStreams: number; // 'auto' resolved to number
  };
}

const DEFAULT_INTERVAL = 1000;

/**
 * Normalize concurrency configuration from various input formats
 *
 * **Important: Global vs Local Concurrency**
 * - If `max` is NOT specified or is Infinity → No global limit (RequestPool not created)
 * - If `max` is specified → Global limit active (RequestPool middleware)
 * - `runner.concurrency` always controls batch-local concurrency
 *
 * This allows running multiple batches in parallel without global bottleneck:
 * ```typescript
 * // No global limit, only batch-local
 * concurrency: {
 *   runner: { concurrency: 10 }  // Each batch limited to 10
 * }
 *
 * // With global limit
 * concurrency: {
 *   max: 30,                     // Total 30 across all operations
 *   runner: { concurrency: 10 }  // Each batch also limited to 10
 * }
 * ```
 *
 * Supports:
 * - Simple number: `concurrency: 20` (sets max + runner)
 * - Object config: `concurrency: { max: 20, ... }`
 * - Batch-only: `concurrency: { runner: { concurrency: 10 } }` (no global limit)
 */
export function normalizeConcurrency(
  options: Pick<ClientOptions, 'concurrency' | 'http2'>
): NormalizedConcurrencyConfig {
  // 1. Extract base concurrency config
  let config: ConcurrencyConfig;

  if (typeof options.concurrency === 'number') {
    // Simple number format: concurrency: 20
    // This sets BOTH global max AND runner concurrency
    config = { max: options.concurrency };
  } else if (options.concurrency && typeof options.concurrency === 'object') {
    // Object format: concurrency: { max: 20, ... }
    config = options.concurrency;
  } else {
    // No config provided, use empty defaults
    config = {};
  }

  // 2. Apply defaults
  // IMPORTANT: max defaults to Infinity (no global limit) unless explicitly set
  const max = config.max ?? Infinity;
  const requestsPerInterval = config.requestsPerInterval ?? Infinity;
  const interval = config.interval ?? DEFAULT_INTERVAL;

  // 3. Parse HTTP/2 options (needed for agent auto-config)
  const http2Options = parseHTTP2Options(options.http2);
  const http2Enabled = http2Options.enabled ?? false;

  // 4. Auto-configure agent
  const agentConfig = normalizeAgentConfig(
    config.agent,
    max,
    http2Enabled,
    http2Options.maxConcurrentStreams
  );

  // 5. Auto-configure HTTP/2 streams
  const http2Streams = normalizeHTTP2Streams(
    config.http2?.maxConcurrentStreams,
    max,
    http2Enabled
  );

  // 6. Configure runner
  // If max is Infinity but runner.concurrency is set, use that
  // If max is finite, use it as default for runner
  // Otherwise default to Infinity (unlimited)
  let runnerConcurrency: number;
  if (config.runner?.concurrency !== undefined) {
    runnerConcurrency = config.runner.concurrency;
  } else if (max !== Infinity) {
    runnerConcurrency = max;
  } else {
    runnerConcurrency = Infinity;
  }

  return {
    max,
    requestsPerInterval,
    interval,
    runner: {
      concurrency: runnerConcurrency,
      retries: config.runner?.retries,
      retryDelay: config.runner?.retryDelay,
    },
    agent: {
      ...agentConfig,
      connections: agentConfig.connections as number, // Resolved from 'auto'
    },
    http2: {
      maxConcurrentStreams: http2Streams,
    },
  };
}

/**
 * Parse HTTP/2 options from boolean or object format
 */
function parseHTTP2Options(http2?: boolean | HTTP2Options): Partial<HTTP2Options> {
  if (!http2) return {};
  if (typeof http2 === 'boolean') {
    return { enabled: http2 };
  }
  return http2;
}

/**
 * Auto-configure agent connections based on concurrency and HTTP version
 *
 * Strategy:
 * - HTTP/2: Few connections, many streams per connection
 *   connections = ceil(max / maxStreams)
 *
 * - HTTP/1.1: More connections, ~2 requests per connection (keep-alive + pipelining)
 *   connections = ceil(max / 2)
 */
function normalizeAgentConfig(
  agentConfig: ConcurrencyConfig['agent'] | undefined,
  maxConcurrent: number,
  http2Enabled: boolean,
  http2MaxStreams?: number
): AgentOptions & { connections: number } {
  // Default agent config
  const defaults: AgentOptions = {
    pipelining: 1,
    keepAlive: true,
    keepAliveTimeout: 4000,
    keepAliveMaxTimeout: 600000,
    connectTimeout: 10000,
    perDomainPooling: true,
  };

  // Merge user config with defaults
  const merged = { ...defaults, ...agentConfig };

  // Resolve 'auto' connections
  let connections: number;

  if (agentConfig?.connections === 'auto' || agentConfig?.connections === undefined) {
    connections = calculateOptimalConnections(
      maxConcurrent,
      http2Enabled,
      http2MaxStreams,
      merged.pipelining ?? 1
    );
  } else {
    connections = agentConfig.connections as number;
  }

  return {
    ...merged,
    connections,
  };
}

/**
 * Calculate optimal number of TCP connections
 */
export function calculateOptimalConnections(
  maxConcurrent: number,
  http2Enabled: boolean,
  http2MaxStreams?: number,
  pipelining: number = 1
): number {
  if (http2Enabled) {
    // HTTP/2: Multiple streams per connection
    const streams = http2MaxStreams ?? 100;
    return Math.max(1, Math.ceil(maxConcurrent / streams));
  } else {
    // HTTP/1.1: Keep-alive + optional pipelining
    const requestsPerConnection = pipelining > 1 ? pipelining : 2; // ~2 with keep-alive
    return Math.max(1, Math.min(
      Math.ceil(maxConcurrent / requestsPerConnection),
      50 // Cap at 50 to avoid excessive connections
    ));
  }
}

/**
 * Auto-configure HTTP/2 max concurrent streams
 */
function normalizeHTTP2Streams(
  configuredStreams: number | 'auto' | undefined,
  maxConcurrent: number,
  http2Enabled: boolean
): number {
  if (!http2Enabled) {
    return 100; // Default even if not used
  }

  if (configuredStreams === 'auto' || configuredStreams === undefined) {
    // Auto: Use max concurrent as a reasonable default
    // Most servers support 100-200 streams
    return Math.min(Math.max(maxConcurrent, 100), 200);
  }

  return configuredStreams;
}

/**
 * Create optimal batch configuration
 *
 * Used when batch() is called with specific concurrency that differs from global
 */
export function createBatchConfig(
  baseConcurrency: NormalizedConcurrencyConfig,
  batchConcurrency: number,
  requestCount: number
): NormalizedConcurrencyConfig {
  // Recalculate agent connections for this specific batch
  const http2Enabled = baseConcurrency.http2.maxConcurrentStreams > 0;
  const connections = calculateOptimalConnections(
    batchConcurrency,
    http2Enabled,
    baseConcurrency.http2.maxConcurrentStreams,
    baseConcurrency.agent.pipelining
  );

  // Smart pipelining for large batches
  const smartPipelining =
    requestCount > 20 && batchConcurrency > 5
      ? 2
      : baseConcurrency.agent.pipelining ?? 1;

  return {
    ...baseConcurrency,
    max: batchConcurrency,
    runner: {
      ...baseConcurrency.runner,
      concurrency: batchConcurrency,
    },
    agent: {
      ...baseConcurrency.agent,
      connections,
      pipelining: smartPipelining,
    },
  };
}

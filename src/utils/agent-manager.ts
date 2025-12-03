/**
 * Agent Manager - Smart connection pooling with per-domain agents
 *
 * Manages undici Agent instances for optimal connection reuse and pooling.
 * Supports:
 * - Global shared agent for same-domain requests
 * - Per-domain agents for multi-domain batches
 * - Auto-configuration based on concurrency hints
 * - Connection pool lifecycle management
 */

import { Agent } from 'undici';
import type { AgentOptions } from '../types/index.js';

export interface AgentStats {
  /** Number of active agents */
  agentCount: number;

  /** Domains being managed */
  domains: string[];

  /** Total connections across all agents (estimate) */
  totalConnections: number;
}

/**
 * Smart Agent Manager
 *
 * Creates and manages undici Agent instances with intelligent pooling strategies.
 */
export class AgentManager {
  private globalAgent?: Agent;
  private domainAgents: Map<string, Agent>;
  private options: Required<Omit<AgentOptions, 'localAddress' | 'clientTtl' | 'maxHeaderSize'>> & Pick<AgentOptions, 'localAddress' | 'clientTtl' | 'maxHeaderSize'>;

  constructor(options: AgentOptions = {}) {
    this.domainAgents = new Map();
    this.options = {
      connections: options.connections ?? 10,
      pipelining: options.pipelining ?? 1,
      keepAlive: options.keepAlive ?? true,
      keepAliveTimeout: options.keepAliveTimeout ?? 4 * 1000,
      keepAliveMaxTimeout: options.keepAliveMaxTimeout ?? 10 * 60 * 1000, // 10 minutes
      keepAliveTimeoutThreshold: options.keepAliveTimeoutThreshold ?? 1 * 1000, // 1 second
      connectTimeout: options.connectTimeout ?? 10 * 1000,
      perDomainPooling: options.perDomainPooling ?? true,
      localAddress: options.localAddress,
      maxRequestsPerClient: options.maxRequestsPerClient ?? 0,
      maxCachedSessions: options.maxCachedSessions ?? 100,
      maxHeaderSize: options.maxHeaderSize,
      clientTtl: options.clientTtl ?? null,
    };
  }

  /**
   * Get or create the global shared agent
   */
  getGlobalAgent(): Agent {
    if (!this.globalAgent) {
      this.globalAgent = this.createAgent(this.options);
    }
    return this.globalAgent;
  }

  /**
   * Get or create an agent for a specific domain
   *
   * @param domain - Domain name (e.g., 'api.example.com')
   * @param options - Optional domain-specific agent options
   */
  getAgentForDomain(domain: string, options?: Partial<AgentOptions>): Agent {
    if (!this.options.perDomainPooling) {
      return this.getGlobalAgent();
    }

    let agent = this.domainAgents.get(domain);
    if (!agent) {
      const agentOptions = { ...this.options, ...options };
      agent = this.createAgent(agentOptions);
      this.domainAgents.set(domain, agent);
    }
    return agent;
  }

  /**
   * Get agent for a URL
   * Extracts domain and returns appropriate agent
   */
  getAgentForUrl(url: string): Agent {
    try {
      const parsedUrl = new URL(url);
      return this.getAgentForDomain(parsedUrl.hostname);
    } catch {
      // Fallback to global agent if URL parsing fails
      return this.getGlobalAgent();
    }
  }

  /**
   * Create an optimized agent for batch operations
   *
   * Auto-configures connection pool size based on concurrency and request count
   *
   * @param concurrency - Number of concurrent requests
   * @param requestCount - Total number of requests in batch
   * @param options - Optional agent configuration overrides
   */
  createBatchAgent(
    concurrency: number,
    requestCount: number,
    options?: Partial<AgentOptions>
  ): Agent {
    // Smart connection pool sizing
    // Strategy: connections = min(concurrency / 2, 50)
    // Rationale:
    // - 2 requests per connection on average (with pipelining)
    // - Cap at 50 to avoid excessive connections
    // - Minimum 1 connection
    const smartConnections = Math.max(
      1,
      Math.min(
        Math.ceil(concurrency / 2),
        50,
        requestCount  // Don't exceed request count
      )
    );

    // Smart pipelining
    // If batch is large and concurrency is high, enable pipelining
    const smartPipelining = requestCount > 20 && concurrency > 5
      ? 2  // Allow 2 pipelined requests
      : 1; // Safe default: 1 request per connection

    const batchOptions: AgentOptions = {
      ...this.options,
      connections: options?.connections ?? smartConnections,
      pipelining: options?.pipelining ?? smartPipelining,
      ...options,
    };

    return this.createAgent(batchOptions);
  }

  /**
   * Create an optimized agent for stress/load testing
   *
   * Configures undici to handle extreme concurrency without pool exhaustion.
   * Key optimizations:
   * - High pipelining (10) to multiplex requests per connection
   * - Capped connections (100) to avoid socket exhaustion
   * - Longer keep-alive (30s) for sustained load
   * - Shorter connect timeout (5s) to fail fast
   *
   * @param concurrency - Target number of concurrent users
   */
  createStressTestAgent(concurrency: number): Agent {
    // Formula: connections = ceil(concurrency / pipelining)
    // With pipelining=10, 300 users need 30 connections
    // Cap at 100 to avoid socket exhaustion
    const pipelining = 10;
    const connections = Math.min(Math.ceil(concurrency / pipelining), 100);

    return this.createAgent({
      connections,
      pipelining,
      keepAliveTimeout: 30000,      // 30s keep-alive for sustained load
      keepAliveMaxTimeout: 120000,  // 2 min max (shorter than default)
      connectTimeout: 5000,         // 5s connect timeout (fail fast)
    });
  }

  /**
   * Create a new Agent instance with given options
   */
  private createAgent(options: Partial<AgentOptions>): Agent {
    return new Agent({
      connections: options.connections,
      pipelining: options.pipelining,
      maxHeaderSize: options.maxHeaderSize,
      maxRequestsPerClient: options.maxRequestsPerClient,
      maxCachedSessions: options.maxCachedSessions,
      clientTtl: options.clientTtl ?? null,
      keepAliveTimeout: options.keepAliveTimeout,
      keepAliveMaxTimeout: options.keepAliveMaxTimeout,
      keepAliveTimeoutThreshold: options.keepAliveTimeoutThreshold,
      connectTimeout: options.connectTimeout,
      socketPath: undefined,
      connect: {
        timeout: options.connectTimeout,
        keepAlive: options.keepAlive,
        keepAliveInitialDelay: options.keepAliveTimeout,
        localAddress: options.localAddress,
      },
    });
  }

  /**
   * Get statistics about managed agents
   */
  getStats(): AgentStats {
    return {
      agentCount: 1 + this.domainAgents.size, // global + per-domain
      domains: Array.from(this.domainAgents.keys()),
      totalConnections: (1 + this.domainAgents.size) * this.options.connections,
    };
  }

  /**
   * Close an agent for a specific domain
   */
  async closeDomainAgent(domain: string): Promise<void> {
    const agent = this.domainAgents.get(domain);
    if (agent) {
      await agent.close();
      this.domainAgents.delete(domain);
    }
  }

  /**
   * Close all managed agents
   */
  async closeAll(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    if (this.globalAgent) {
      closePromises.push(this.globalAgent.close());
      this.globalAgent = undefined;
    }

    for (const agent of this.domainAgents.values()) {
      closePromises.push(agent.close());
    }

    this.domainAgents.clear();

    await Promise.all(closePromises);
  }

  /**
   * Destroy all agents immediately (non-graceful)
   */
  async destroy(): Promise<void> {
    const destroyPromises: Promise<void>[] = [];

    if (this.globalAgent) {
      destroyPromises.push(this.globalAgent.destroy());
      this.globalAgent = undefined;
    }

    for (const agent of this.domainAgents.values()) {
      destroyPromises.push(agent.destroy());
    }

    this.domainAgents.clear();

    await Promise.all(destroyPromises);
  }
}

/**
 * Create a standalone agent with smart defaults
 *
 * @param options - Agent configuration
 */
export function createAgent(options: AgentOptions = {}): Agent {
  const manager = new AgentManager(options);
  return manager.getGlobalAgent();
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}

/**
 * Analyze batch requests and determine optimal agent strategy
 *
 * Returns either:
 * - Single global agent (if all same domain)
 * - Map of per-domain agents (if multi-domain)
 */
export function analyzeBatchDomains(
  urls: string[]
): { strategy: 'single' | 'multi'; domains: Set<string> } {
  const domains = new Set<string>();

  for (const url of urls) {
    const domain = extractDomain(url);
    if (domain) {
      domains.add(domain);
    }
  }

  return {
    strategy: domains.size <= 1 ? 'single' : 'multi',
    domains,
  };
}

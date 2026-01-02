/**
 * Command Types and Context
 *
 * Shared types for shell commands extracted from executor.
 */

import type { Client } from '../../../core/client.js';

// =============================================================================
// Command Result
// =============================================================================

export interface CommandResult {
  success: boolean;
  error?: string;
  data?: any;
  output?: any;
}

// =============================================================================
// Command Context
// =============================================================================

/**
 * Context passed to all command handlers.
 * Contains dependencies needed for command execution.
 */
export interface CommandContext {
  /** HTTP client for requests */
  client: Client;

  /** Add item to shell history */
  addHistoryItem: (item: {
    type: 'request' | 'response' | 'info' | 'error' | 'command';
    content: any;
    meta?: Record<string, any>;
  }) => void;

  /** Set loading state */
  setIsLoading: (loading: boolean) => void;

  /** Get current base URL */
  baseUrl: () => string | null;

  /** Set last response for preview */
  setLastResponse: (response: any) => void;

  /** Track domain DNS data */
  trackDns: (domain: string, records: any[], meta?: any) => void;

  /** Track domain SEO data */
  trackSeo: (domain: string, data: any) => void;

  /** Track domain spider data */
  trackSpider: (domain: string, data: any) => void;

  /** Track domain request */
  trackRequest: (domain: string, data: any) => void;

  /** Track domain download */
  trackDownload: (domain: string, data: any) => void;
}

// =============================================================================
// Command Handler Type
// =============================================================================

/**
 * Type for command handler functions
 */
export type CommandHandler = (
  ctx: CommandContext,
  args: string[]
) => Promise<CommandResult>;

/**
 * Command Executor for tuiuiu shell
 *
 * Handles command parsing and execution, updating shell state via signals.
 * Commands are organized in executor-commands/ for better maintainability.
 */

import { createClient } from '../../core/client.js';
import { resolvePreset } from '../presets.js';
import type { Client } from '../../core/client.js';

// Extracted command modules
import {
  // Shell commands
  cmdHelp,
  cmdClear,
  cmdSetBase,
  cmdSetVariable,
  cmdGetVariable,
  cmdListVariables,
  // Status commands
  cmdStatus,
  cmdJobs,
  // AI commands
  cmdAi,
  // Background execution
  executeBackground,
  BACKGROUNDABLE_COMMANDS,
  // Parser utilities
  parseLine,
  looksLikeDomain,
  looksLikeUrl,
  isHelpQuery,
  executeHelpQuery,
  parseBackgroundCommand,
  // Types
  type CommandContext,
  type CommandResult,
} from './executor-commands/index.js';

import {
  addHistoryItem,
  setIsLoading,
  setBaseUrl,
  baseUrl,
  setLastResponse,
  setVariable,
  getVariable,
  variables,
  history,
  clearHistory,
} from './hooks/useShellState.js';
import {
  trackDns,
  trackSeo,
  trackSpider,
  trackRequest,
  trackDownload,
} from './hooks/useDomains.js';

// Unified CLI integration (for migrated commands)
import {
  isUnifiedCommand,
  executeUnifiedCommand,
} from '../handlers.js';

// =============================================================================
// Types
// =============================================================================

export interface ExecutorOptions {
  client?: Client;
}

export { CommandResult };

// =============================================================================
// Executor Class
// =============================================================================

/**
 * Shell command executor
 *
 * Routes commands to appropriate handlers and manages state.
 */
export class ShellExecutor {
  private client: Client;

  constructor(options: ExecutorOptions = {}) {
    this.client = options.client || createClient({});
  }

  /**
   * Get command context for handlers
   */
  private getContext(): CommandContext {
    return {
      client: this.client,
      addHistoryItem,
      setIsLoading,
      baseUrl,
      setLastResponse,
      trackDns,
      trackSeo,
      trackSpider,
      trackRequest,
      trackDownload,
    };
  }

  /**
   * Execute a command
   */
  async execute(input: string): Promise<CommandResult> {
    const trimmed = input.trim();
    if (!trimmed) return { success: true };

    // Check for help query (ends with ?)
    if (isHelpQuery(trimmed)) {
      return await executeHelpQuery(trimmed);
    }

    // Check for background execution
    const { command: cleanCommand, background } = parseBackgroundCommand(trimmed);

    // Parse command
    const parts = parseLine(cleanCommand);
    const cmd = parts[0].toLowerCase();

    // If background requested and command supports it
    if (background && BACKGROUNDABLE_COMMANDS.has(cmd)) {
      return await executeBackground(
        { client: this.client },
        cmd,
        parts.slice(1),
        cleanCommand
      );
    }

    try {
      // Route command to appropriate handler
      return await this.routeCommand(cmd, parts.slice(1), cleanCommand);
    } catch (err: any) {
      addHistoryItem({ type: 'error', content: err.message || String(err) });
      return { success: false, error: err.message };
    }
  }

  /**
   * Route command to appropriate handler
   */
  private async routeCommand(
    cmd: string,
    args: string[],
    fullCommand: string
  ): Promise<CommandResult> {
    const ctx = this.getContext();

    // Special case: "get" without URL-like arg is variable lookup, not HTTP GET
    if (cmd === 'get' && (!args[0] || !looksLikeUrl(args[0]))) {
      return cmdGetVariable(args[0]);
    }

    // Check if command has been migrated to unified CLI
    // Enable commands by adding them to UNIFIED_COMMANDS in shell-integration.ts
    if (isUnifiedCommand(cmd)) {
      return await executeUnifiedCommand(ctx, cmd, args);
    }

    // AI chat (@preset message)
    if (cmd.startsWith('@')) {
      const preset = cmd.slice(1).toLowerCase();
      const message = args.join(' ');
      return await cmdAi(preset, message);
    }

    // Command routing
    switch (cmd) {
      // Shell commands
      case 'help':
      case '?':
        return cmdHelp(args);

      case 'clear':
      case 'cls':
        clearHistory();
        return cmdClear();

      case 'exit':
      case 'quit':
      case 'q':
        process.exit(0);

      // Base URL
      case 'url':
      case 'base':
      case 'baseurl':
        return cmdSetBase(args[0]);

      // Variables
      case 'set':
        return cmdSetVariable(args[0], args.slice(1).join(' '));

      // Note: 'get' for variables is handled at the top of routeCommand()
      // 'get' with URL-like args is routed through unified CLI as HTTP GET

      case 'vars':
      case 'variables':
        return cmdListVariables();

      // Status
      case 'status':
        return cmdStatus();

      case 'jobs':
        return cmdJobs(args);

      // Note: load/bench now handled by unified CLI (isUnifiedCommand check above)

      // Mock servers
      case 'serve':
      case 'server':
        return await executeBackground(
          { client: this.client },
          'serve',
          args,
          fullCommand
        );

      // URL-like input (make GET request via unified CLI)
      default:
        if (looksLikeUrl(cmd) || looksLikeDomain(cmd)) {
          return await executeUnifiedCommand(ctx, 'get', [cmd, ...args]);
        }

        addHistoryItem({
          type: 'error',
          content: `Unknown command: ${cmd}. Type 'help' for available commands.`,
        });
        return { success: false, error: `Unknown command: ${cmd}` };
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let executorInstance: ShellExecutor | null = null;

export function getExecutor(): ShellExecutor {
  if (!executorInstance) {
    executorInstance = new ShellExecutor();
  }
  return executorInstance;
}

export function resetExecutor(): void {
  executorInstance = null;
}

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
  // Protocol commands
  cmdSeo,
  cmdSpider,
  cmdRobots,
  cmdSitemap,
  cmdDns,
  cmdWhois,
  cmdRdap,
  cmdPing,
  cmdTls,
  cmdIp,
  cmdWs,
  cmdHttp,
  cmdGraphql,
  cmdSse,
  cmdHls,
  cmdLive,
  cmdLoad,
  cmdHar,
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
  AI_PRESETS,
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

    // HTTP methods
    const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
    if (httpMethods.includes(cmd)) {
      if (cmd === 'get' && (!args[0] || !looksLikeUrl(args[0]))) {
        // Fall through to variable get
      } else {
        return await cmdHttp(ctx, cmd.toUpperCase(), args);
      }
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

      case 'get':
        return cmdGetVariable(args[0]);

      case 'vars':
      case 'variables':
        return cmdListVariables();

      // Status
      case 'status':
        return cmdStatus();

      case 'jobs':
        return cmdJobs(args);

      // Network commands
      case 'dns':
        return await cmdDns(ctx, args);

      case 'whois':
        return await cmdWhois(ctx, args);

      case 'rdap':
        return await cmdRdap(ctx, args);

      case 'ping':
        return await cmdPing(ctx, args);

      case 'tls':
      case 'ssl':
      case 'cert':
        return await cmdTls(ctx, args);

      case 'ip':
      case 'geoip':
        return await cmdIp(ctx, args);

      // WebSocket
      case 'ws':
      case 'websocket':
        return await cmdWs(ctx, args);

      // Analysis commands
      case 'seo':
        return await cmdSeo(ctx, args);

      case 'spider':
      case 'crawl':
        return await cmdSpider(ctx, args);

      case 'robots':
        return await cmdRobots(ctx, args);

      case 'sitemap':
        return await cmdSitemap(ctx, args);

      // Streaming commands
      case 'hls':
        return await cmdHls(ctx, args);

      case 'live':
        return await cmdLive(ctx, args);

      case 'sse':
        return await cmdSse(ctx, args);

      // API protocols
      case 'graphql':
      case 'gql':
        return await cmdGraphql(ctx, args);

      // Testing commands
      case 'load':
      case 'bench':
        return await cmdLoad(ctx, args);

      case 'har':
        return await cmdHar(ctx, args);

      // Mock servers
      case 'serve':
      case 'server':
        return await executeBackground(
          { client: this.client },
          'serve',
          args,
          fullCommand
        );

      // URL-like input (make GET request)
      default:
        if (looksLikeUrl(cmd) || looksLikeDomain(cmd)) {
          return await cmdHttp(ctx, 'GET', [cmd, ...args]);
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

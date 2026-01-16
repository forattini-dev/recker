/**
 * Shell Commands
 *
 * Extracted command handlers from executor.ts for better organization.
 * Each module groups related commands.
 *
 * NOTE: Most commands have been migrated to the unified CLI system
 * (see src/cli/handlers/). This module now only contains:
 * - Shell utility commands (help, clear, variables)
 * - Status/jobs commands
 * - AI chat (for @preset syntax - unified ai command also exists)
 * - Background execution (serve, long-running tasks)
 * - Parser utilities
 *
 * Migrated to unified: dns, seo, network, protocols, video, scrape,
 * security, api, streaming, utils, ai, bench
 */

// Types
export type { CommandContext, CommandResult, CommandHandler } from './types.js';

// HTTP commands (handles base URL resolution for shell context)
export { cmdHttp } from './http.js';

// Testing commands - now migrated to unified CLI (src/cli/handlers/bench.ts)
// Kept for backwards compatibility but should use unified system
export { cmdLoad } from './testing.js';

// Shell utility commands (help, clear, variables)
export {
  cmdHelp,
  cmdClear,
  cmdSetBase,
  cmdSetVariable,
  cmdGetVariable,
  cmdListVariables,
} from './shell.js';

// Status and jobs commands
export { cmdStatus, cmdJobs, formatJobProgress } from './status.js';

// AI chat commands
export { cmdAi, AI_PRESETS, formatAiError, getAiClient, clearAiClients } from './ai.js';

// Background job execution
export {
  executeBackground,
  BACKGROUNDABLE_COMMANDS,
  type BackgroundContext,
} from './background.js';

// Parser utilities
export {
  parseLine,
  looksLikeDomain,
  looksLikeUrl,
  isHelpArg,
  isHelpQuery,
  executeHelpQuery,
  parseBackgroundCommand,
  parseArgValue,
  parseArgValueFlag,
  hasFlag,
  getDefaultPort,
} from './parser.js';

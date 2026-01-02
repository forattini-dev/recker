/**
 * Shell Commands
 *
 * Extracted command handlers from executor.ts for better organization.
 * Each module groups related commands.
 */

// Types
export type { CommandContext, CommandResult, CommandHandler } from './types.js';

// Crawl commands (spider, seo, robots, sitemap)
export { cmdSeo, cmdSpider, cmdRobots, cmdSitemap } from './crawl.js';

// DNS commands (dns, whois, rdap)
export { cmdDns, cmdWhois, cmdRdap } from './dns.js';

// Network commands (ping, tls, ip, ws)
export { cmdPing, cmdTls, cmdIp, cmdWs } from './network.js';

// HTTP commands (http, graphql, sse)
export { cmdHttp, cmdGraphql, cmdSse } from './http.js';

// Streaming commands (hls, live)
export { cmdHls, cmdLive } from './streaming.js';

// Testing commands (load, har)
export { cmdLoad, cmdHar } from './testing.js';

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

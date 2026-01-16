/**
 * Shell Integration
 *
 * Integrates the unified CLI with ShellExecutor.
 * This module creates a unified CLI instance that can be used by the shell
 * while allowing gradual migration of commands.
 *
 * Migration Strategy:
 * 1. New commands → Add directly to unified CLI
 * 2. Existing commands → Migrate one by one from executor-commands/
 * 3. When all migrated → Remove ShellExecutor.routeCommand switch statement
 */

import { createRekCLI, type RekCLI } from './handler-registry.js'
import { createExtendedTuiContext } from './tui-adapter.js'
import { dnsCommands } from './handlers/dns.js'
import { seoCommands, spider, robots, sitemap } from './handlers/seo.js'
import { networkCommands, ping, tls, ip, ws, whois, rdap } from './handlers/network.js'
import { streamingCommands, hlsInfoHandler, sseHandler } from './handlers/streaming.js'
import {
  apiCommands,
  graphql,
  http,
  getHandler,
  postHandler,
  putHandler,
  deleteHandler,
  patchHandler,
  headHandler,
  optionsHandler,
} from './handlers/api.js'
import {
  videoCommands,
  videoInfoHandler,
  videoDownloadHandler,
  videoSitesHandler,
  videoCheckHandler,
  videoShortcutsHandler,
} from './handlers/video.js'
import { scrapeCommands, scrapeHandler } from './handlers/scrape.js'
import { securityCommands, securityHeadersHandler } from './handlers/security.js'
import { protocolCommands, ftpLsHandler, ftpGetHandler, ftpPutHandler, telnetHandler, jsonrpcHandler, soapHandler, odataHandler } from './handlers/protocols.js'
import { utilsCommands, uploadHandler, downloadHandler, proxyHandler, setupHandler } from './handlers/utils.js'
import { aiCommands, aiChatHandler } from './handlers/ai.js'
import { benchCommands, loadTestHandler } from './handlers/bench.js'
import type { CommandContext, CommandResult } from './tui/executor-commands/types.js'

/**
 * Commands that have been migrated to the unified system.
 * ShellExecutor will route these through the unified CLI.
 */
export const UNIFIED_COMMANDS = new Set([
  // DNS & Domain
  'dns',       // ✅ Migrated - uses unified handlers
  'whois',     // ✅ Migrated - WHOIS lookup
  'rdap',      // ✅ Migrated - RDAP lookup
  // SEO & Crawling
  'seo',       // ✅ Migrated - SEO analysis (seo analyze, seo spider, etc.)
  'spider',    // ✅ Migrated - alias for seo spider (backward compatibility)
  'crawl',     // ✅ Migrated - alias for seo spider (backward compatibility)
  'robots',    // ✅ Migrated - alias for seo robots (backward compatibility)
  'sitemap',   // ✅ Migrated - alias for seo sitemap (backward compatibility)
  // Network
  'ping',      // ✅ Migrated - TCP connectivity test
  'tls',       // ✅ Migrated - TLS certificate inspection
  'ssl',       // ✅ Migrated - alias for tls
  'cert',      // ✅ Migrated - alias for tls
  'ip',        // ✅ Migrated - IP geolocation
  'geoip',     // ✅ Migrated - alias for ip
  'ws',        // ✅ Migrated - WebSocket client
  'websocket', // ✅ Migrated - alias for ws
  // Streaming
  'hls',       // ✅ Migrated - HLS streaming
  'sse',       // ✅ Migrated - Server-Sent Events
  'live',      // ✅ Migrated - Live stream recording
  // API
  'graphql',   // ✅ Migrated - GraphQL client
  'gql',       // ✅ Migrated - alias for graphql
  'har',       // ✅ Migrated - HAR recording (stub)
  // HTTP Methods
  'get',       // ✅ Migrated - HTTP GET request
  'post',      // ✅ Migrated - HTTP POST request
  'put',       // ✅ Migrated - HTTP PUT request
  'delete',    // ✅ Migrated - HTTP DELETE request
  'patch',     // ✅ Migrated - HTTP PATCH request
  'head',      // ✅ Migrated - HTTP HEAD request
  'options',   // ✅ Migrated - HTTP OPTIONS request
  // Video
  'video',     // ✅ Migrated - Video extraction and download
  'vid',       // ✅ Migrated - alias for video
  // Web Scraping
  'scrape',    // ✅ Migrated - Web scraping tools
  'extract',   // ✅ Migrated - alias for scrape
  // Security
  'security',  // ✅ Migrated - Security headers analysis
  'headers',   // ✅ Migrated - alias for security (grade headers)
  'grade',     // ✅ Migrated - alias for security (grade headers)
  // Protocols
  'ftp',       // ✅ Migrated - FTP client (ls, get, put)
  'telnet',    // ✅ Migrated - Telnet client
  'jsonrpc',   // ✅ Migrated - JSON-RPC 2.0 client
  'soap',      // ✅ Migrated - SOAP/XML web service client
  'odata',     // ✅ Migrated - OData query client
  // Utils
  'upload',    // ✅ Migrated - File upload
  'download',  // ✅ Migrated - File download
  'proxy',     // ✅ Migrated - Proxy requests
  'setup',     // ✅ Migrated - Install dependencies
  // AI
  'ai',        // ✅ Migrated - AI chat
  'chat',      // ✅ Migrated - alias for ai
  'ask',       // ✅ Migrated - alias for ai
  // Bench (note: tuiEnabled=false for dashboard)
  'load',      // ✅ Migrated - Load testing
  'bench',     // ✅ Migrated - Benchmark tools
])

/**
 * Unified CLI instance for shell use.
 * Contains all migrated commands.
 */
let shellCliInstance: RekCLI | null = null

/**
 * Get or create the unified CLI for shell use.
 */
export function getShellCli(): RekCLI {
  if (!shellCliInstance) {
    shellCliInstance = createRekCLI({
      name: 'rek-shell',
      description: 'Recker Shell Commands',
      commands: {
        dns: dnsCommands,
        seo: seoCommands,
        // Top-level SEO aliases for backward compatibility
        spider: {
          description: 'Crawl a website (alias for seo spider)',
          aliases: ['crawl'],
          positional: [
            { name: 'url', required: true, description: 'Starting URL to crawl' }
          ],
          options: seoCommands.commands?.spider?.options,
          handler: spider
        },
        robots: {
          description: 'Parse and analyze robots.txt',
          positional: [
            { name: 'url', required: false, description: 'URL or domain to check' }
          ],
          handler: robots
        },
        sitemap: {
          description: 'Parse and analyze sitemap.xml',
          positional: [
            { name: 'url', required: false, description: 'URL or sitemap URL to check' }
          ],
          handler: sitemap
        },
        // Top-level network commands
        ping: {
          description: 'TCP connectivity test',
          positional: [
            { name: 'host', required: false, description: 'Host to ping' },
            { name: 'port', required: false, type: 'number', default: 80, description: 'Port to connect to' }
          ],
          handler: ping
        },
        tls: {
          description: 'TLS/SSL certificate inspection',
          aliases: ['ssl', 'cert'],
          positional: [
            { name: 'host', required: false, description: 'Hostname to inspect' }
          ],
          handler: tls
        },
        ip: {
          description: 'IP geolocation lookup',
          aliases: ['geoip'],
          positional: [
            { name: 'ip', required: true, description: 'IP address to lookup' }
          ],
          handler: ip
        },
        ws: {
          description: 'WebSocket client',
          aliases: ['websocket'],
          positional: [
            { name: 'url', required: true, description: 'WebSocket URL' }
          ],
          options: networkCommands.commands?.ws?.options,
          handler: ws
        },
        whois: {
          description: 'WHOIS domain lookup',
          positional: [
            { name: 'domain', required: false, description: 'Domain to lookup' }
          ],
          handler: whois
        },
        rdap: {
          description: 'RDAP lookup (modern WHOIS)',
          positional: [
            { name: 'domain', required: false, description: 'Domain to lookup' }
          ],
          handler: rdap
        },
        // Streaming commands
        hls: streamingCommands.commands!.hls,
        sse: {
          description: 'Server-Sent Events client',
          positional: [
            { name: 'url', required: true, description: 'SSE endpoint URL' }
          ],
          options: {
            duration: {
              short: 'd',
              type: 'number',
              default: 30,
              description: 'Listen duration in seconds'
            }
          },
          handler: sseHandler
        },
        live: streamingCommands.commands!.live,
        // API commands
        graphql: {
          description: 'GraphQL client',
          aliases: ['gql'],
          positional: [
            { name: 'url', required: true, description: 'GraphQL endpoint URL' },
            { name: 'query', required: true, description: 'GraphQL query' }
          ],
          handler: graphql
        },
        har: apiCommands.commands!.har,
        // HTTP method commands
        get: {
          description: 'HTTP GET request',
          positional: [
            { name: 'url', required: true, description: 'URL to request' }
          ],
          handler: getHandler
        },
        post: {
          description: 'HTTP POST request',
          positional: [
            { name: 'url', required: true, description: 'URL to request' }
          ],
          handler: postHandler
        },
        put: {
          description: 'HTTP PUT request',
          positional: [
            { name: 'url', required: true, description: 'URL to request' }
          ],
          handler: putHandler
        },
        delete: {
          description: 'HTTP DELETE request',
          positional: [
            { name: 'url', required: true, description: 'URL to request' }
          ],
          handler: deleteHandler
        },
        patch: {
          description: 'HTTP PATCH request',
          positional: [
            { name: 'url', required: true, description: 'URL to request' }
          ],
          handler: patchHandler
        },
        head: {
          description: 'HTTP HEAD request',
          positional: [
            { name: 'url', required: true, description: 'URL to request' }
          ],
          handler: headHandler
        },
        options: {
          description: 'HTTP OPTIONS request',
          positional: [
            { name: 'url', required: true, description: 'URL to request' }
          ],
          handler: optionsHandler
        },
        // Video commands
        video: videoCommands,
        // Scrape commands
        scrape: scrapeCommands,
        // Security commands
        security: securityCommands,
        // Protocol commands
        ftp: {
          description: 'FTP client commands',
          commands: {
            ls: protocolCommands.commands!['ftp ls'],
            get: protocolCommands.commands!['ftp get'],
            put: protocolCommands.commands!['ftp put'],
          }
        },
        telnet: protocolCommands.commands!['telnet'],
        jsonrpc: protocolCommands.commands!['jsonrpc'],
        soap: protocolCommands.commands!['soap'],
        odata: protocolCommands.commands!['odata'],
        // Utils commands
        upload: utilsCommands.commands!['upload'],
        download: utilsCommands.commands!['download'],
        proxy: utilsCommands.commands!['proxy'],
        setup: utilsCommands.commands!['setup'],
        // AI commands
        ai: aiCommands,
        // Bench commands (note: tuiEnabled=false means TUI dashboard won't work)
        load: benchCommands.commands!['load'],
        bench: benchCommands,
      }
    })
  }
  return shellCliInstance
}

/**
 * Execute a command through the unified CLI.
 *
 * @example
 * ```typescript
 * // In ShellExecutor.routeCommand:
 * if (UNIFIED_COMMANDS.has(cmd)) {
 *   return await executeUnifiedCommand(ctx, cmd, args)
 * }
 * ```
 */
export async function executeUnifiedCommand(
  ctx: CommandContext,
  cmd: string,
  args: string[]
): Promise<CommandResult> {
  const cli = getShellCli()
  const tuiCtx = createExtendedTuiContext(ctx)

  // Build full args array with command
  const fullArgs = [cmd, ...args]

  const result = await cli.runTui(fullArgs, tuiCtx)

  return {
    success: result.success,
    error: result.error,
    data: result.parsed
  }
}

/**
 * Check if a command should use the unified CLI.
 */
export function isUnifiedCommand(cmd: string): boolean {
  return UNIFIED_COMMANDS.has(cmd.toLowerCase())
}

/**
 * Reset the CLI instance (for testing).
 */
export function resetShellCli(): void {
  shellCliInstance = null
}

// =============================================================================
// Integration Guide
// =============================================================================

/**
 * How to migrate a command to the unified system:
 *
 * 1. Create handler in src/cli/unified/commands/<category>.ts:
 *
 *    ```typescript
 *    const myHandler: RekHandler = async (ctx) => {
 *      const out = createOutput(ctx)
 *      const extCtx = isExtendedContext(ctx.tui) ? ctx.tui : null
 *
 *      extCtx?.setLoading(true)
 *      try {
 *        // Your logic here
 *        if (extCtx) {
 *          extCtx.addResponse(data, { responseType: 'mytype' })
 *        } else {
 *          out.json(data)
 *        }
 *      } finally {
 *        extCtx?.setLoading(false)
 *      }
 *    }
 *    ```
 *
 * 2. Add command definition with handler:
 *
 *    ```typescript
 *    export const myCommands: RekCommandDefinition = {
 *      description: 'My command',
 *      positional: [{ name: 'target', required: true }],
 *      handler: myHandler
 *    }
 *    ```
 *
 * 3. Register in shell-integration.ts:
 *
 *    ```typescript
 *    commands: {
 *      dns: dnsCommands,
 *      my: myCommands,  // Add here
 *    }
 *    ```
 *
 * 4. Enable unified routing in UNIFIED_COMMANDS:
 *
 *    ```typescript
 *    export const UNIFIED_COMMANDS = new Set([
 *      'dns',
 *      'my',  // Add here
 *    ])
 *    ```
 *
 * 5. Remove old handler from executor-commands/<category>.ts
 *
 * 6. Run tests to verify behavior is preserved
 */

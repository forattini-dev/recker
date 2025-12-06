#!/usr/bin/env node
/**
 * Recker MCP Server CLI
 *
 * Start the MCP server with various transport modes and tool filtering options.
 *
 * @example
 * ```bash
 * # Start with stdio (for Claude Code)
 * recker-mcp
 *
 * # Start with HTTP transport
 * recker-mcp --transport http --port 3100
 *
 * # Disable HTTP request tools
 * recker-mcp --no-http
 *
 * # Disable documentation tools
 * recker-mcp --no-docs
 *
 * # Disable all network tools
 * recker-mcp --no-network
 *
 * # Only enable specific tools
 * recker-mcp --only rek_search_docs,rek_get_doc
 * ```
 */

import { Command } from 'commander';
import { MCPServer, type MCPTransportMode } from './server.js';

const program = new Command();

/**
 * Tool categories and their corresponding patterns
 */
const TOOL_CATEGORIES = {
  docs: [
    'rek_search_docs',
    'rek_get_doc',
    'rek_code_examples',
    'rek_api_schema',
    'rek_suggest',
  ],
  http: ['rek_http_request'],
  dns: ['rek_dns_lookup'],
  whois: ['rek_whois_lookup'],
  ping: ['rek_network_ping'],
  ip: ['rek_ip_lookup'],
  network: [
    'rek_http_request',
    'rek_dns_lookup',
    'rek_whois_lookup',
    'rek_network_ping',
  ],
} as const;

program
  .name('recker-mcp')
  .description('Start the Recker MCP server for AI agent integration')
  .version('1.0.0')
  .option('-t, --transport <mode>', 'Transport mode: stdio, http, sse', 'stdio')
  .option('-p, --port <number>', 'HTTP/SSE server port', '3100')
  .option('-d, --debug', 'Enable debug logging', false)
  .option('--docs-path <path>', 'Path to documentation directory')
  .option('--examples-path <path>', 'Path to examples directory')
  .option('--src-path <path>', 'Path to source directory')
  // Tool filtering flags
  .option('--no-docs', 'Disable documentation tools (search, get, examples, schema, suggest)')
  .option('--no-http', 'Disable HTTP request tool')
  .option('--no-dns', 'Disable DNS lookup tool')
  .option('--no-whois', 'Disable WHOIS lookup tool')
  .option('--no-ping', 'Disable network ping tool')
  .option('--no-ip', 'Disable IP lookup tool')
  .option('--no-network', 'Disable all network tools (http, dns, whois, ping)')
  .option('--only <tools>', 'Only enable specified tools (comma-separated)')
  .option('--filter <patterns>', 'Custom tool filter patterns (comma-separated, prefix with ! to exclude)')
  .action(async (opts) => {
    const toolsFilter: string[] = [];

    // Handle --only flag (exclusive mode)
    if (opts.only) {
      const onlyTools = opts.only.split(',').map((t: string) => t.trim());
      toolsFilter.push(...onlyTools);
    }

    // Handle --filter flag (custom patterns)
    if (opts.filter) {
      const patterns = opts.filter.split(',').map((p: string) => p.trim());
      toolsFilter.push(...patterns);
    }

    // Handle category disable flags
    if (!opts.only && !opts.filter) {
      // Only apply disable flags if not using --only or --filter

      if (opts.docs === false) {
        TOOL_CATEGORIES.docs.forEach(tool => toolsFilter.push(`!${tool}`));
      }

      if (opts.network === false) {
        TOOL_CATEGORIES.network.forEach(tool => toolsFilter.push(`!${tool}`));
      } else {
        // Individual network tool flags (only if --no-network not set)
        if (opts.http === false) {
          toolsFilter.push('!rek_http_request');
        }
        if (opts.dns === false) {
          toolsFilter.push('!rek_dns_lookup');
        }
        if (opts.whois === false) {
          toolsFilter.push('!rek_whois_lookup');
        }
        if (opts.ping === false) {
          toolsFilter.push('!rek_network_ping');
        }
      }

      if (opts.ip === false) {
        toolsFilter.push('!rek_ip_lookup');
      }
    }

    const transport = opts.transport as MCPTransportMode;
    const port = parseInt(opts.port, 10);

    // Validate transport
    if (!['stdio', 'http', 'sse'].includes(transport)) {
      console.error(`Invalid transport mode: ${transport}. Use: stdio, http, or sse`);
      process.exit(1);
    }

    // Create server
    const server = new MCPServer({
      transport,
      port,
      debug: opts.debug,
      docsPath: opts.docsPath,
      examplesPath: opts.examplesPath,
      srcPath: opts.srcPath,
      toolsFilter: toolsFilter.length > 0 ? toolsFilter : undefined,
    });

    // Log startup info (not in stdio mode to avoid polluting the protocol)
    if (transport !== 'stdio') {
      console.log('╔═══════════════════════════════════════════════════════════════════╗');
      console.log('║                    Recker MCP Server                              ║');
      console.log('╚═══════════════════════════════════════════════════════════════════╝');
      console.log('');
      console.log(`  Transport: ${transport}`);
      console.log(`  Port:      ${port}`);
      console.log(`  Debug:     ${opts.debug ? 'enabled' : 'disabled'}`);
      if (toolsFilter.length > 0) {
        console.log(`  Filters:   ${toolsFilter.join(', ')}`);
      }
      console.log('');
      console.log('  Available tools:');

      // List which tools are enabled
      const allTools = [
        ...TOOL_CATEGORIES.docs,
        ...TOOL_CATEGORIES.network,
        'rek_ip_lookup',
      ];

      const enabledTools = allTools.filter(tool => {
        if (toolsFilter.length === 0) return true;
        const positive = toolsFilter.filter(p => !p.startsWith('!'));
        const negative = toolsFilter.filter(p => p.startsWith('!')).map(p => p.slice(1));

        if (negative.includes(tool)) return false;
        if (positive.length === 0) return true;
        return positive.includes(tool);
      });

      enabledTools.forEach(tool => {
        console.log(`    ✓ ${tool}`);
      });

      const disabledTools = allTools.filter(t => !enabledTools.includes(t));
      if (disabledTools.length > 0) {
        disabledTools.forEach(tool => {
          console.log(`    ✗ ${tool} (disabled)`);
        });
      }

      console.log('');
    }

    // Start server
    await server.start();
  });

// Parse arguments and run
program.parse();

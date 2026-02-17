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
 * # Start with minimal category (recommended)
 * recker-mcp --category=minimal
 *
 * # Combine categories
 * recker-mcp --category=minimal,seo,security
 *
 * # List available categories
 * recker-mcp --list-categories
 *
 * # Start with HTTP transport
 * recker-mcp --transport http --port 3100
 *
 * # Only enable specific tools (legacy)
 * recker-mcp --only rek_search_docs,rek_get_doc
 * ```
 */

import { RekCommand as Command } from '../cli/router.js';
import { MCPServer, type MCPTransportMode } from './server.js';
import {
  listCategories,
  DEFAULT_CATEGORY,
  validateCategories,
  estimateCategoryTokens,
  type CategoryName,
} from './profiles.js';
import { LEGACY_TOOL_GROUPS } from './legacy-tool-groups.js';

const program = new Command('recker-mcp');

program
  .description('Start the Recker MCP server for AI agent integration')
  .version('1.0.0')
  .option('-t, --transport <mode>', 'Transport mode: stdio, http, sse', 'stdio')
  .option('-p, --port <number>', 'HTTP/SSE server port', '3100')
  .option('-d, --debug', 'Enable debug logging', false)
  .option('--docs-path <path>', 'Path to documentation directory')
  .option('--examples-path <path>', 'Path to examples directory')
  .option('--src-path <path>', 'Path to source directory')
  // Category-based filtering (recommended)
  .option(
    '-c, --category <categories>',
    'Tool categories to enable (comma-separated): minimal, docs, network, dns, seo, security, scrape, video, ai, protocols, parsing, streaming, template, full'
  )
  .option('--list-categories', 'List available categories and exit')
  // Legacy tool filtering flags
  .option('--no-docs', 'Disable documentation tools (search, get, examples, schema, suggest)')
  .option('--no-http', 'Disable HTTP request tool')
  .option('--no-dns', 'Disable DNS lookup tool')
  .option('--no-whois', 'Disable WHOIS lookup tool')
  .option('--no-ping', 'Disable network ping tool')
  .option('--no-ip', 'Disable IP lookup tool')
  .option('--no-network', 'Disable all network tools (http, dns, whois, ping)')
  .option('--only <tools>', 'Only enable specified tools (comma-separated)')
  .option('--filter <patterns>', 'Custom tool filter patterns (comma-separated, prefix with ! to exclude)')
  .action(async (_args: string[], cmd: Command) => {
    // Get parsed options from command
    const opts = cmd.opts();

    // Apply defaults for options that might not be parsed correctly
    opts.transport = opts.transport || 'stdio';
    opts.port = opts.port || '3100';

    // Handle --list-categories
    if (opts.listCategories) {
      console.log('╔═══════════════════════════════════════════════════════════════════╗');
      console.log('║                    Recker MCP Categories                          ║');
      console.log('╚═══════════════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('Available categories:');
      console.log('');

      for (const category of listCategories()) {
        const toolCount = category.toolCount === -1 ? 'all' : category.toolCount;
        const icon = category.icon || '📦';
        console.log(`  ${icon} ${category.name.padEnd(12)} ${category.description}`);
        console.log(`               Tools: ${toolCount}, ~${category.estimatedTokens} tokens`);
        console.log('');
      }

      console.log('Usage examples:');
      console.log('  recker-mcp                                # Default: minimal category');
      console.log('  recker-mcp --category=minimal,seo         # Combine categories');
      console.log('  recker-mcp -c seo,security                # Short form');
      console.log('  recker-mcp --category=full                # All tools (high context)');
      console.log('');
      process.exit(0);
    }

    const useExplicitCategory = Boolean(opts.category);

    // Validate category names if provided
    if (opts.category) {
      const categoryNames = opts.category.split(',').map((p: string) => p.trim());
      const validation = validateCategories(categoryNames);
      if (!validation.valid) {
        console.error(`Invalid category(s): ${validation.invalid.join(', ')}`);
        console.error('Use --list-categories to see available categories');
        process.exit(1);
      }
    }
    const toolsFilter: string[] = [];

    // Handle --only flag (exclusive mode)
    if (opts.only) {
      const onlyTools = opts.only.split(',').map((t: string) => t.trim());
      toolsFilter.push(...onlyTools);
    }

    // Handle --filter flag (custom patterns)
    if (opts.filter && typeof opts.filter === 'string') {
      const patterns = opts.filter.split(',').map((p: string) => p.trim());
      toolsFilter.push(...patterns);
    }

    // Handle category disable flags
    if (!opts.only && !opts.filter) {
      // Only apply disable flags if not using --only or --filter

      if (opts.docs === false) {
        LEGACY_TOOL_GROUPS.docs.forEach(tool => toolsFilter.push(`!${tool}`));
      }

      if (opts.network === false) {
        LEGACY_TOOL_GROUPS.network.forEach(tool => toolsFilter.push(`!${tool}`));
      } else {
        // Individual network tool flags (only if --no-network not set)
        if (opts.http === false) {
          toolsFilter.push('!rek_http_request');
        }
        if (opts.dns === false) {
          toolsFilter.push('!rek_dns');
        }
        if (opts.whois === false) {
          toolsFilter.push('!rek_whois');
        }
        if (opts.ping === false) {
          toolsFilter.push('!rek_ping');
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

    const effectiveCategory = useExplicitCategory ? opts.category : (!opts.only && !opts.filter ? DEFAULT_CATEGORY : undefined);

    // Create server with category or legacy toolsFilter
    const server = new MCPServer({
      transport,
      port,
      debug: opts.debug,
      docsPath: opts.docsPath,
      examplesPath: opts.examplesPath,
      srcPath: opts.srcPath,
      category: effectiveCategory,
      toolsFilter: !effectiveCategory && toolsFilter.length > 0 ? toolsFilter : undefined,
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

      if (effectiveCategory) {
        const tokens = estimateCategoryTokens(effectiveCategory);
        console.log(`  Category:  ${effectiveCategory} (~${tokens} tokens)`);
      } else if (toolsFilter.length > 0) {
        console.log(`  Filters:   ${toolsFilter.join(', ')}`);
      } else {
        console.log(`  Category:  minimal (default)`);
      }
      console.log('');
      console.log('  Available tools:');

      // List which tools are enabled
      const allTools = [
        ...LEGACY_TOOL_GROUPS.docs,
        ...LEGACY_TOOL_GROUPS.network,
        ...LEGACY_TOOL_GROUPS.ip,
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

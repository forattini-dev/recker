import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';

export function registerMcpCommand(program: Command) {
  const mcpCmd = program
    .command('mcp')
    .description('Start the Recker MCP server for AI agent integration (Claude Code, etc)')
    .option('transport', {
      type: 'string',
      short: 't',
      default: 'stdio',
      enum: ['stdio', 'http', 'sse'],
      description: 'Transport mode',
    })
    .option('port', {
      type: 'number',
      short: 'p',
      default: 3100,
      description: 'HTTP/SSE server port',
    })
    .option('debug', {
      type: 'boolean',
      short: 'd',
      description: 'Enable debug logging',
    })
    .option('offline', {
      type: 'boolean',
      short: 'O',
      description: 'Offline mode - skip network downloads, use only cached/bundled data',
    })
    .option('category', {
      type: 'string',
      short: 'c',
      description: 'Tool categories to enable (comma-separated): minimal, docs, network, dns, seo, security, scrape, full',
    })
    .option('list-categories', {
      type: 'boolean',
      description: 'List available categories and exit',
    })
    .option('docs-path', {
      type: 'string',
      description: 'Path to documentation directory',
    })
    .option('examples-path', {
      type: 'string',
      description: 'Path to examples directory',
    })
    .option('src-path', {
      type: 'string',
      description: 'Path to source directory',
    })
    .option('only', {
      type: 'string',
      description: 'Only enable specified tools (comma-separated)',
    })
    .option('filter', {
      type: 'string',
      description: 'Custom tool filter patterns (comma-separated, prefix with ! to exclude)',
    })
    .option('no-docs', {
      type: 'boolean',
      description: 'Disable documentation tools',
    })
    .option('no-http', {
      type: 'boolean',
      description: 'Disable HTTP request tool',
    })
    .option('no-dns', {
      type: 'boolean',
      description: 'Disable DNS lookup tool',
    })
    .option('no-whois', {
      type: 'boolean',
      description: 'Disable WHOIS lookup tool',
    })
    .option('no-ping', {
      type: 'boolean',
      description: 'Disable network ping tool',
    })
    .option('no-ip', {
      type: 'boolean',
      description: 'Disable IP lookup tool',
    })
    .option('no-network', {
      type: 'boolean',
      description: 'Disable all network tools (http, dns, whois, ping)',
    })
    .example('rek mcp', 'Start MCP server in stdio mode (for Claude Code)')
    .example('rek mcp --offline', 'Start in offline mode (no downloads)')
    .example('rek mcp --category=minimal', 'Start with minimal category')
    .example('rek mcp -c seo,security', 'Combine categories')
    .example('rek mcp --transport=http --port=3100', 'Start HTTP server')
    .example('rek mcp --list-categories', 'List available categories')
    .action(async (args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};

      // Import MCP server components
      const { MCPServer } = await import('../../mcp/server.js');
      const { listCategories, validateCategories, estimateCategoryTokens } = await import('../../mcp/profiles.js');

      // Handle --list-categories
      if (options.listCategories) {
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
        console.log('  rek mcp                                # Default: minimal category');
        console.log('  rek mcp --category=minimal,seo         # Combine categories');
        console.log('  rek mcp -c seo,security                # Short form');
        console.log('  rek mcp --category=full                # All tools (high context)');
        console.log('');
        return;
      }

      // Validate category names if provided
      if (options.category) {
        const categoryNames = options.category.split(',').map((p: string) => p.trim());
        const validation = validateCategories(categoryNames);
        if (!validation.valid) {
          console.error(colors.red(`Invalid category(s): ${validation.invalid.join(', ')}`));
          console.error('Use --list-categories to see available categories');
          process.exit(1);
        }
      }

      const toolsFilter: string[] = [];

      // Handle --only flag (exclusive mode)
      if (options.only) {
        const onlyTools = options.only.split(',').map((t: string) => t.trim());
        toolsFilter.push(...onlyTools);
      }

      // Handle --filter flag (custom patterns)
      if (options.filter && typeof options.filter === 'string') {
        const patterns = options.filter.split(',').map((p: string) => p.trim());
        toolsFilter.push(...patterns);
      }

      // Tool categories for legacy disable flags
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
      };

      // Handle category disable flags
      if (!options.only && !options.filter) {
        if (options.noDocs) {
          TOOL_CATEGORIES.docs.forEach(tool => toolsFilter.push(`!${tool}`));
        }

        if (options.noNetwork) {
          TOOL_CATEGORIES.network.forEach(tool => toolsFilter.push(`!${tool}`));
        } else {
          if (options.noHttp) {
            toolsFilter.push('!rek_http_request');
          }
          if (options.noDns) {
            toolsFilter.push('!rek_dns_lookup');
          }
          if (options.noWhois) {
            toolsFilter.push('!rek_whois_lookup');
          }
          if (options.noPing) {
            toolsFilter.push('!rek_network_ping');
          }
        }

        if (options.noIp) {
          toolsFilter.push('!rek_ip_lookup');
        }
      }

      const transport = options.transport || 'stdio';
      const port = options.port || 3100;

      // Validate transport
      if (!['stdio', 'http', 'sse'].includes(transport)) {
        console.error(colors.red(`Invalid transport mode: ${transport}. Use: stdio, http, or sse`));
        process.exit(1);
      }

      // Create server with category or legacy toolsFilter
      const server = new MCPServer({
        transport,
        port,
        debug: options.debug,
        offline: options.offline,
        docsPath: options.docsPath,
        examplesPath: options.examplesPath,
        srcPath: options.srcPath,
        category: options.category, // Category takes precedence
        toolsFilter: !options.category && toolsFilter.length > 0 ? toolsFilter : undefined,
      });

      // Log startup info (not in stdio mode to avoid polluting the protocol)
      if (transport !== 'stdio') {
        console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker MCP Server')}                         │
├─────────────────────────────────────────────┤
│  Transport: ${colors.cyan(transport.padEnd(30))}│
│  Port:      ${colors.cyan(String(port).padEnd(30))}│
│  Debug:     ${colors.yellow((options.debug ? 'enabled' : 'disabled').padEnd(30))}│`));

        if (options.category) {
          const tokens = estimateCategoryTokens(options.category);
          console.log(`│  Category:  ${colors.cyan((options.category + ' (~' + tokens + ' tokens)').padEnd(30))}│`);
        } else if (toolsFilter.length > 0) {
          console.log(`│  Filters:   ${colors.gray((toolsFilter.slice(0, 3).join(', ') + (toolsFilter.length > 3 ? '...' : '')).padEnd(30))}│`);
        } else {
          console.log(`│  Category:  ${colors.cyan('minimal (default)'.padEnd(30))}│`);
        }

        console.log(`├─────────────────────────────────────────────┤
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘`);
      }

      // Start server
      await server.start();
    });
}

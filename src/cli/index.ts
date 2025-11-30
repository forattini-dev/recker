#!/usr/bin/env node
import { program } from 'commander';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import pc from '../utils/colors.js';

/**
 * Read data from stdin if piped
 * Example: cat body.json | rek post api.com/users
 */
async function readStdin(): Promise<string | null> {
  // Check if stdin is a TTY (interactive terminal)
  // If it's NOT a TTY, data is being piped
  if (process.stdin.isTTY) {
    return null;
  }

  return new Promise((resolve) => {
    let data = '';

    // Set a timeout to avoid hanging if no data
    const timeout = setTimeout(() => {
      resolve(null);
    }, 100);

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk) => {
      clearTimeout(timeout);
      data += chunk;
    });

    process.stdin.on('end', () => {
      clearTimeout(timeout);
      resolve(data.trim() || null);
    });

    process.stdin.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });

    // Resume stdin in case it was paused
    process.stdin.resume();
  });
}

/**
 * Load environment variables from a .env file
 * @param filePath Path to .env file (default: ./.env)
 */
async function loadEnvFile(filePath?: string | boolean): Promise<Record<string, string>> {
  const envPath = typeof filePath === 'string' ? filePath : join(process.cwd(), '.env');
  const envVars: Record<string, string> = {};

  try {
    const content = await fs.readFile(envPath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Parse KEY=value format
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        const cleanKey = key.trim();
        // Remove surrounding quotes from value
        let cleanValue = value.trim();
        if ((cleanValue.startsWith('"') && cleanValue.endsWith('"')) ||
            (cleanValue.startsWith("'") && cleanValue.endsWith("'"))) {
          cleanValue = cleanValue.slice(1, -1);
        }

        envVars[cleanKey] = cleanValue;
        // Also set in process.env
        process.env[cleanKey] = cleanValue;
      }
    }

    console.log(pc.gray(`Loaded ${Object.keys(envVars).length} variables from ${envPath}`));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log(pc.yellow(`Warning: No .env file found at ${envPath}`));
    } else {
      console.log(pc.red(`Error loading .env: ${error.message}`));
    }
  }

  return envVars;
}

/**
 * CLI Entry Point
 */
async function main() {

  // Dynamic imports for internal modules
  const { handleRequest } = await import('./handler.js');
  const { resolvePreset } = await import('./presets.js');
  const presets = await import('../presets/index.js');

  // Read version from package.json
  let version = '0.0.0';
  try {
    const pkg = await import('../../package.json', { with: { type: 'json' } }) as { default: { version: string } };
    version = pkg.default?.version || '0.0.0';
  } catch {
    // Fallback if JSON import fails
  }

  // Helper to parse headers (Key:Value) and data (key=value)
  function parseMixedArgs(args: string[], hasPreset = false) {
    const headers: Record<string, string> = {};
    const data: Record<string, any> = {};
    let method = 'GET';
    let url = '';

    // Methods list
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

    for (const arg of args) {
      // Check for method
      if (methods.includes(arg.toUpperCase())) {
        method = arg.toUpperCase();
        continue;
      }

      // Check for Header (Key:Value)
      if (arg.includes(':') && !arg.includes('://') && !arg.includes('=')) {
        const [key, value] = arg.split(':');
        headers[key.trim()] = value.trim();
        continue;
      }

      // Check for Data (key=value or key:=value)
      if (arg.includes('=')) {
        // Implicit POST if data is provided and method wasn't set explicitly (or was GET)
        if (method === 'GET') method = 'POST';

        const isTyped = arg.includes(':=');
        const separator = isTyped ? ':=' : '=';
        const [key, value] = arg.split(separator);

        if (isTyped) {
          // Try to parse number or boolean
          if (value === 'true') data[key] = true;
          else if (value === 'false') data[key] = false;
          else if (!isNaN(Number(value))) data[key] = Number(value);
          else data[key] = value; // Fallback
        } else {
          data[key] = value;
        }
        continue;
      }

      // Assume URL/Path if nothing else matches
      if (!url) {
        url = arg;
        // Only enforce https:// prefix if NO preset is used
        if (!hasPreset && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('ws://') && !url.startsWith('wss://') && !url.startsWith('udp://')) {
          url = `https://${url}`;
        }
      }
    }

    return { method, url, headers, data };
  }

  // Filter out internal exports and 'registry'
  const PRESET_NAMES = Object.keys(presets).filter(k => k !== 'registry' && !k.startsWith('_'));

  program
    .name('rek')
    .description('The HTTP Client for Humans (and Robots)')
    .version(version)
    .argument('[args...]', 'URL, Method, Headers (Key:Value), Data (key=value)')
    .option('-v, --verbose', 'Show full request/response details')
    .option('-j, --json', 'Force JSON content-type')
    .option('-e, --env [path]', 'Load .env file from current directory or specified path')
    .addHelpText('after', `
${pc.bold(pc.yellow('Examples:'))}
  ${pc.green('$ rek httpbin.org/json')}
  ${pc.green('$ rek post api.com/users name="Cyber" role="Admin"')}
  ${pc.green('$ rek @github/user')}
  ${pc.green('$ rek @openai/v1/chat/completions model="gpt-5.1"')}

${pc.bold(pc.yellow('Available Presets:'))}
  ${pc.cyan(PRESET_NAMES.map(p => '@' + p).join(', '))}
`)
    .action(async (args: string[], options: { verbose?: boolean; json?: boolean; env?: string | boolean }) => {
      if (args.length === 0) {
        program.help();
        return;
      }

      // Load .env file if requested
      if (options.env !== undefined) {
        await loadEnvFile(options.env);
      }

      // Read stdin data if piped
      const stdinData = await readStdin();

      let argsToParse = args;
      let presetConfig: any = undefined;

      // Check for preset (@preset)
      if (args[0].startsWith('@')) {
        let presetName = args[0].slice(1); // remove @
        let pathFromPreset = '';

        if (presetName.includes('/')) {
          const parts = presetName.split('/');
          presetName = parts[0];
          pathFromPreset = '/' + parts.slice(1).join('/');
        }

        presetConfig = resolvePreset(presetName);
        argsToParse = args.slice(1);

        if (pathFromPreset) {
          // Inject the extracted path as the first argument for the parser to pick up
          argsToParse.unshift(pathFromPreset);
        }
      }

      const { method, url, headers, data } = parseMixedArgs(argsToParse, !!presetConfig);

      if (!url) {
        console.error(pc.red('Error: URL/Path is required'));
        process.exit(1);
      }

      if (options.json) {
        headers['Content-Type'] = 'application/json';
        headers['Accept'] = 'application/json';
      }

      // Protocol Switcher for WebSocket
      if (url.startsWith('ws://') || url.startsWith('wss://')) {
        const { startInteractiveWebSocket } = await import('./tui/websocket.js');
        await startInteractiveWebSocket(url, headers);
        return;
      }

      // Protocol Switcher for UDP
      if (url.startsWith('udp://')) {
        console.log(pc.yellow('UDP mode coming soon...'));
        return;
      }

      // Default HTTP Handler
      try {
        // Determine request body: stdin data takes precedence, then CLI data args
        let body: any = undefined;
        if (stdinData) {
          // Try to parse stdin as JSON, fallback to raw string
          try {
            body = JSON.parse(stdinData);
          } catch {
            body = stdinData;
          }
        } else if (Object.keys(data).length > 0) {
          body = data;
        }

        await handleRequest({
          method,
          url,
          headers,
          body,
          verbose: options.verbose,
          presetConfig
        });
      } catch (error: any) {
        console.error(pc.red(`
Error: ${error.message}`));
        if (options.verbose && error.cause) {
          console.error(error.cause);
        }
        process.exit(1);
      }
    });

  // Completion command
  program
    .command('completion')
    .description('Generate shell completion script')
    .action(() => {
      const script = `
###-begin-rek-completion-###
#
# rek command completion script
#
# Installation: rek completion >> ~/.bashrc  (or ~/.zshrc)
# Or, maybe: source <(rek completion)
#

_rek_completions()
{
  local cur prev words cword
  _init_completion -n : || return

  local presets="${PRESET_NAMES.map(p => '@' + p).join(' ')}"
  local methods="GET POST PUT DELETE PATCH HEAD OPTIONS"
  local opts="-v --verbose -j --json -h --help -V --version"

  if [[ \\$cur == -* ]] ; then
    COMPREPLY=( $(compgen -W "\\$opts" -- \\$cur) )
    return 0
  fi

  if [[ \\$cur == @* ]] ; then
    COMPREPLY=( $(compgen -W "\\$presets" -- \\$cur) )
    return 0
  fi

  # If prev is a method, we likely want a URL next
  # If prev is a preset, we might want a path (handled by generic completion)

  # Suggest methods if it's the first argument (and not a preset/option)
  if [[ \\$cword -eq 1 && ! \\$cur == -* && ! \\$cur == @* ]]; then
     COMPREPLY=( $(compgen -W "\\$methods" -- \\$cur) )
  fi

  return 0
}
complete -F _rek_completions rek
###-end-rek-completion-###
`;
      console.log(script);
    });

  // Interactive Shell command
  program
    .command('shell')
    .alias('interactive')
    .alias('repl')
    .description('Start the interactive Rek Shell')
    .action(async () => {
      const { RekShell } = await import('./tui/shell.js');
      const shell = new RekShell();
      shell.start();
    });

  // Benchmark command
  const bench = program.command('bench').description('Performance benchmarking tools');

  bench
    .command('load')
    .description('Run a load test with real-time dashboard')
    .argument('[args...]', 'URL and options (users=10 duration=10s mode=throughput http2)')
    .addHelpText('after', `
${pc.bold(pc.yellow('Options (key=value):'))}
  ${pc.green('users')}     Number of concurrent users    ${pc.gray('(default: 50)')}
  ${pc.green('duration')}  Test duration in seconds      ${pc.gray('(default: 300)')}
  ${pc.green('ramp')}      Ramp-up time in seconds       ${pc.gray('(default: 5)')}
  ${pc.green('mode')}      Test mode                     ${pc.gray('(default: throughput)')}
               ${pc.gray('Values: throughput, stress, realistic')}
  ${pc.green('http2')}     Force HTTP/2                  ${pc.gray('(default: false)')}

${pc.bold(pc.yellow('Examples:'))}
  ${pc.green('$ rek bench load httpbin.org/get users=100 duration=60 ramp=10')}
  ${pc.green('$ rek bench load https://api.com/heavy mode=stress http2=true')}
`)
    .action(async (args: string[]) => {
        let url = '';
        let users = 50;
        let duration = 300;
        let mode: any = 'throughput';
        let http2 = false;
        let rampUp = 5;

        for (const arg of args) {
            if (arg.includes('=')) {
                const [key, val] = arg.split('=');
                const k = key.toLowerCase();
                
                if (k === 'users' || k === 'u') users = parseInt(val);
                else if (k === 'duration' || k === 'd' || k === 'time') duration = parseInt(val);
                else if (k === 'mode' || k === 'm') mode = val;
                else if (k === 'http2') http2 = val === 'true';
                else if (k === 'ramp' || k === 'rampup') rampUp = parseInt(val);
                
            } else if (arg.toLowerCase() === 'http2') {
                http2 = true;
            } else if (!url) {
                url = arg;
                if (!url.startsWith('http')) url = `https://${url}`;
            }
        }

        if (!url) {
            console.error(pc.red('Error: URL is required. Example: rek bench load httpbin.org users=50'));
            process.exit(1);
        }

        const { startLoadDashboard } = await import('./tui/load-dashboard.js');
        await startLoadDashboard({ url, users, duration, mode, http2, rampUp });
    });

  // MCP Server command
  program
    .command('mcp')
    .description('Start MCP server for AI agents to access Recker documentation')
    .option('-p, --port <number>', 'Server port', '3100')
    .option('-d, --docs <path>', 'Path to documentation folder')
    .option('--debug', 'Enable debug logging')
    .addHelpText('after', `
${pc.bold(pc.yellow('Usage:'))}
  ${pc.green('$ rek mcp')}                    ${pc.gray('Start server on port 3100')}
  ${pc.green('$ rek mcp -p 8080')}            ${pc.gray('Start on custom port')}
  ${pc.green('$ rek mcp --debug')}            ${pc.gray('Enable debug logging')}

${pc.bold(pc.yellow('Tools provided:'))}
  ${pc.cyan('search_docs')}  Search documentation by keyword
  ${pc.cyan('get_doc')}      Get full content of a doc file

${pc.bold(pc.yellow('Claude Code config (~/.claude.json):'))}
  ${pc.gray(`{
    "mcpServers": {
      "recker-docs": {
        "command": "npx",
        "args": ["recker", "mcp"]
      }
    }
  }`)}
`)
    .action(async (options: { port: string; docs?: string; debug?: boolean }) => {
      const { MCPServer } = await import('../mcp/server.js');

      const server = new MCPServer({
        port: parseInt(options.port),
        docsPath: options.docs,
        debug: options.debug,
      });

      await server.start();

      console.log(pc.green(`
┌─────────────────────────────────────────────┐
│  ${pc.bold('Recker MCP Server')}                         │
├─────────────────────────────────────────────┤
│  Endpoint: ${pc.cyan(`http://localhost:${options.port}`)}         │
│  Docs indexed: ${pc.yellow(String(server.getDocsCount()).padEnd(28))}│
│                                             │
│  Tools:                                     │
│    • ${pc.cyan('search_docs')} - Search documentation     │
│    • ${pc.cyan('get_doc')}     - Get full doc content     │
│                                             │
│  Press ${pc.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘
`));

      // Keep alive
      process.on('SIGINT', async () => {
        console.log(pc.yellow('\nShutting down MCP server...'));
        await server.stop();
        process.exit(0);
      });
    });

  program.parse();
}

// Run the CLI
main().catch((error) => {
  console.error('CLI Error:', error.message);
  process.exit(1);
});

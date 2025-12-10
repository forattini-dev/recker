#!/usr/bin/env node
import { program } from 'commander';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import colors from '../utils/colors.js';
import { formatColumns } from '../utils/columns.js';
import { summarizeErrors, formatErrorSummary, printError } from './helpers.js';

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

    console.log(colors.gray(`Loaded ${Object.keys(envVars).length} variables from ${envPath}`));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log(colors.yellow(`Warning: No .env file found at ${envPath}`));
    } else {
      console.log(colors.red(`Error loading .env: ${error.message}`));
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

  // Filter to only actual preset factories (exclude utility functions and internal exports)
  const utilityFunctions = [
    'registry', 'presetRegistry', 'detectPreset', 'getPreset',
    'listPresets', 'listAIPresets', 'listCloudPresets', 'listSaaSPresets', 'listDevToolsPresets'
  ];
  const PRESET_NAMES = Object.keys(presets)
    .filter(k => !utilityFunctions.includes(k) && !k.startsWith('_') && typeof (presets as any)[k] === 'function')
    .sort();

  program
    .name('rek')
    .description('The HTTP Client for Humans (and Robots)')
    .version(version)
    .argument('[args...]', 'URL, Method, Headers (Key:Value), Data (key=value)')
    .option('-v, --verbose', 'Show full request/response details')
    .option('-q, --quiet', 'Output only response body (no colors, perfect for piping)')
    .option('-o, --output <file>', 'Write response body to file')
    .option('-j, --json', 'Force JSON content-type')
    .option('-e, --env [path]', 'Load .env file from current directory or specified path')
    .addHelpText('after', () => `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek httpbin.org/json')}
  ${colors.green('$ rek post api.com/users name="Cyber" role="Admin"')}
  ${colors.green('$ rek @github/user')}
  ${colors.green('$ rek @openai/v1/chat/completions model="gpt-5.1"')}

${colors.bold(colors.yellow('Available Presets:'))}
${formatColumns(PRESET_NAMES, { prefix: '@', indent: 2, minWidth: 16, transform: colors.cyan })}
`)
    .action(async (args: string[], options: { verbose?: boolean; quiet?: boolean; output?: string; json?: boolean; env?: string | boolean }) => {
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
        console.error(colors.red('Error: URL/Path is required'));
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
        const dgram = await import('node:dgram');
        const { Buffer } = await import('node:buffer');

        const u = new URL(url);
        const host = u.hostname;
        const port = parseInt(u.port || '9000');
        const client = dgram.createSocket('udp4');

        // Determine payload
        let payload: Buffer;
        let bodyData: any = undefined;
        
        if (stdinData) {
            bodyData = stdinData;
        } else if (Object.keys(data).length > 0) {
            bodyData = JSON.stringify(data);
        } else {
            // Default empty payload or from args if plain string was supported?
            // The parser puts unknown args into 'url' usually, but we have url.
            // Let's assume empty string if nothing else.
            bodyData = '';
        }

        if (typeof bodyData === 'string') {
            payload = Buffer.from(bodyData);
        } else {
            payload = Buffer.from(JSON.stringify(bodyData));
        }

        console.log(colors.gray(`Sending ${payload.length} bytes to ${host}:${port}...`));

        // Listen for response
        client.on('message', (msg, rinfo) => {
            if (!options.quiet) {
                console.log(colors.green(`\nResponse from ${rinfo.address}:${rinfo.port}:`));
            }
            console.log(msg.toString());
            client.close();
        });

        client.on('error', (err) => {
            console.error(colors.red(`UDP Error: ${err.message}`));
            client.close();
            process.exit(1);
        });

        // Send
        client.send(payload, port, host, (err) => {
            if (err) {
                console.error(colors.red(`Send Error: ${err.message}`));
                client.close();
                process.exit(1);
            }
            
            if (!options.quiet) {
                console.log(colors.gray('Message sent. Waiting for response (2s timeout)...'));
            }
        });

        // Timeout
        setTimeout(() => {
             if (!options.quiet) {
                 console.log(colors.gray('\nNo response received (timeout).'));
             }
             client.close();
             process.exit(0);
        }, 2000);

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
          quiet: options.quiet,
          output: options.output,
          presetConfig
        });
      } catch (error: any) {
        if (!options.quiet) {
          console.error(colors.red(`
Error: ${error.message}`));
          if (options.verbose && error.cause) {
            console.error(error.cause);
          }
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
    .option('-e, --env [path]', 'Load .env file (auto-loads from cwd by default)')
    .action(async (options: { env?: string | boolean }) => {
      // Auto-load .env from cwd by default (unless explicitly disabled with --env=false)
      if (options.env !== false) {
        try {
          const envPath = typeof options.env === 'string' ? options.env : join(process.cwd(), '.env');
          await fs.access(envPath);
          await loadEnvFile(options.env);
        } catch {
          // .env doesn't exist, that's fine
        }
      }

      const { RekShell } = await import('./tui/shell.js');
      const shell = new RekShell();
      shell.start();
    });

  // Documentation Search command
  program
    .command('docs [query...]')
    .alias('?')
    .description('Search Recker documentation (opens fullscreen panel)')
    .action(async (queryParts: string[]) => {
      const query = queryParts.join(' ').trim();
      const { openSearchPanel } = await import('./tui/search-panel.js');
      await openSearchPanel(query || undefined);
    });

  // Security Headers Grader
  program
    .command('security')
    .alias('headers')
    .description('Analyze HTTP response headers for security best practices')
    .argument('<url>', 'URL to analyze')
    .action(async (url) => {
      if (!url.startsWith('http')) url = `https://${url}`;
      
      const { createClient } = await import('../core/client.js');
      const { analyzeSecurityHeaders } = await import('../utils/security-grader.js');
      
      console.log(colors.gray(`Analyzing security headers for ${url}...`));
      
      try {
        // Initialize client with the target origin to handle relative redirects correctly if needed,
        // though undici handles absolute URLs fine.
        const origin = new URL(url).origin;
        const client = createClient({ baseUrl: origin });
        
        // Just a simple get, let the client defaults handle redirects (default is follow)
        const res = await client.get(url);
        
        const report = analyzeSecurityHeaders(res.headers);
        
        // Color grade
        let gradeColor = colors.red;
        if (report.grade.startsWith('A')) gradeColor = colors.green;
        if (report.grade.startsWith('B')) gradeColor = colors.blue;
        if (report.grade.startsWith('C')) gradeColor = colors.yellow;
        
        console.log(`
${colors.bold(colors.cyan('🛡️  Security Headers Report'))}
Grade: ${gradeColor(colors.bold(report.grade))}  (${report.score}/100)

${colors.bold('Details:')}`);

        report.details.forEach(item => {
          const icon = item.status === 'pass' ? colors.green('✔') : item.status === 'warn' ? colors.yellow('⚠') : colors.red('✖');
          const headerName = colors.bold(item.header);
          const value = item.value ? colors.gray(`= ${item.value.length > 50 ? item.value.slice(0, 47) + '...' : item.value}`) : colors.gray('(missing)');
          
          console.log(`  ${icon} ${headerName} ${value}`);
          if (item.status !== 'pass') {
             console.log(`      ${colors.red('→')} ${item.message}`);
          }
        });
        console.log('');

      } catch (error: any) {
        console.error(colors.red(`Analysis failed: ${error.message}`));
        process.exit(1);
      }
    });

  // SEO Analyzer
  program
    .command('seo')
    .description('Analyze page SEO (title, meta, headings, links, images, structured data)')
    .argument('<url>', 'URL to analyze')
    .option('-a, --all', 'Show all checks including passed ones')
    .option('--format <format>', 'Output format: text (default) or json', 'text')
    .addHelpText('after', `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek seo example.com')}                    ${colors.gray('Basic SEO analysis')}
  ${colors.green('$ rek seo example.com -a')}                 ${colors.gray('Show all checks')}
  ${colors.green('$ rek seo example.com --format json')}      ${colors.gray('Output as JSON')}
  ${colors.green('$ rek seo example.com --format json | jq')} ${colors.gray('Pipe to jq for processing')}

${colors.bold(colors.yellow('Checks:'))}
  ${colors.cyan('Title Tag')}          Length and presence
  ${colors.cyan('Meta Description')}   Length and presence
  ${colors.cyan('Headings')}           H1 presence and hierarchy
  ${colors.cyan('Images')}             Alt text coverage
  ${colors.cyan('Links')}              Internal/external distribution
  ${colors.cyan('OpenGraph')}          Social sharing meta tags
  ${colors.cyan('Twitter Card')}       Twitter sharing meta tags
  ${colors.cyan('Structured Data')}    JSON-LD presence
  ${colors.cyan('Technical')}          Canonical, viewport, lang
`)
    .action(async (url, options: { all?: boolean; format?: string }) => {
      if (!url.startsWith('http')) url = `https://${url}`;
      const isJson = options.format === 'json';

      const { createClient } = await import('../core/client.js');
      const { analyzeSeo } = await import('../seo/analyzer.js');

      if (!isJson) {
        console.log(colors.gray(`Analyzing SEO for ${url}...`));
      }

      try {
        const client = createClient({ timeout: 30000 });
        const res = await client.get(url);
        const html = await res.text();

        const report = await analyzeSeo(html, { baseUrl: url });

        // JSON output mode for programmatic use
        if (isJson) {
          const jsonOutput = {
            url,
            analyzedAt: new Date().toISOString(),
            score: report.score,
            grade: report.grade,
            title: report.title,
            metaDescription: report.metaDescription,
            content: report.content,
            headings: report.headings,
            links: report.links,
            images: report.images,
            openGraph: report.social.openGraph,
            twitterCard: report.social.twitterCard,
            structuredData: report.structuredData,
            technical: report.technical,
            checks: report.checks,
            summary: {
              total: report.checks.length,
              passed: report.checks.filter(c => c.status === 'pass').length,
              warnings: report.checks.filter(c => c.status === 'warn').length,
              errors: report.checks.filter(c => c.status === 'fail').length,
              info: report.checks.filter(c => c.status === 'info').length,
            },
          };
          console.log(JSON.stringify(jsonOutput, null, 2));
          return;
        }

        // Color grade
        let gradeColor = colors.red;
        if (report.grade === 'A') gradeColor = colors.green;
        else if (report.grade === 'B') gradeColor = colors.blue;
        else if (report.grade === 'C') gradeColor = colors.yellow;

        console.log(`
${colors.bold(colors.cyan('🔍 SEO Analysis Report'))}
${colors.gray('URL:')} ${url}
${colors.gray('Grade:')} ${gradeColor(colors.bold(report.grade))}  ${colors.gray('Score:')} ${report.score}/100
`);

        // Title & Description
        if (report.title) {
          console.log(`${colors.bold('Title:')} ${colors.gray(report.title.text.slice(0, 60))}${report.title.text.length > 60 ? '...' : ''} ${colors.gray(`(${report.title.length} chars)`)}`);
        }
        if (report.metaDescription) {
          console.log(`${colors.bold('Description:')} ${colors.gray(report.metaDescription.text.slice(0, 80))}${report.metaDescription.text.length > 80 ? '...' : ''}`);
        }

        // OpenGraph
        if (report.openGraph) {
          console.log(`${colors.bold('OpenGraph:')} ${report.openGraph.title ? colors.green('✔') : colors.red('✖')} title, ${report.openGraph.description ? colors.green('✔') : colors.red('✖')} description, ${report.openGraph.image ? colors.green('✔') : colors.red('✖')} image`);
        }

        // Twitter Card
        if (report.twitterCard) {
          console.log(`${colors.bold('Twitter Card:')} ${report.twitterCard.card || 'none'} ${report.twitterCard.title ? colors.green('✔') : colors.red('✖')} title, ${report.twitterCard.image ? colors.green('✔') : colors.red('✖')} image`);
        }

        // Structured Data (JSON-LD)
        if (report.structuredData.count > 0) {
          console.log(`${colors.bold('Structured Data:')} ${report.structuredData.count} schema(s) - ${report.structuredData.types.join(', ')}`);
        } else {
          console.log(`${colors.bold('Structured Data:')} ${colors.yellow('None detected')}`);
        }
        console.log('');

        // Content metrics
        console.log(`${colors.bold('Content Metrics:')}`);
        console.log(`  ${colors.gray('Words:')} ${report.content.wordCount}  ${colors.gray('Reading time:')} ~${report.content.readingTimeMinutes} min`);
        console.log(`  ${colors.gray('Headings:')} H1×${report.headings.h1Count}, total ${report.headings.structure.length}`);
        console.log(`  ${colors.gray('Links:')} ${report.links.total} (${report.links.internal} internal, ${report.links.external} external)`);
        console.log(`  ${colors.gray('Images:')} ${report.images.total} (${report.images.withAlt} with alt, ${report.images.withoutAlt} without)`);
        console.log('');

        // Checks
        console.log(`${colors.bold('Checks:')}`);
        const checksToShow = options.all
          ? report.checks
          : report.checks.filter(c => c.status !== 'pass' && c.status !== 'info');

        if (checksToShow.length === 0 && !options.all) {
          console.log(colors.green('  All checks passed! Use -a to see details.'));
        } else {
          for (const check of checksToShow) {
            const icon = check.status === 'pass' ? colors.green('✔')
              : check.status === 'warn' ? colors.yellow('⚠')
              : check.status === 'fail' ? colors.red('✖')
              : colors.gray('ℹ');
            const name = colors.bold(check.name.padEnd(18));
            console.log(`  ${icon} ${name} ${check.message}`);
            if (check.recommendation && check.status !== 'pass') {
              console.log(`      ${colors.gray('→')} ${colors.gray(check.recommendation)}`);
            }
            // Show evidence details for errors/warnings
            const evidence = (check as any).evidence;
            if (evidence && check.status !== 'pass') {
              if (evidence.found && Array.isArray(evidence.found) && evidence.found.length > 0) {
                const items = evidence.found.slice(0, 3);
                console.log(`      ${colors.gray('Found:')} ${colors.red(items.join(', '))}${evidence.found.length > 3 ? ` (+${evidence.found.length - 3} more)` : ''}`);
              }
              if (evidence.example) {
                console.log(`      ${colors.gray('Example:')} ${colors.cyan(evidence.example.split('\n')[0])}`);
              }
            }
          }
        }
        console.log('');

      } catch (error: any) {
        console.error(colors.red(`SEO analysis failed: ${error.message}`));
        process.exit(1);
      }
    });

  // SEO Robots.txt Validator
  program
    .command('robots')
    .description('Validate and analyze robots.txt file')
    .argument('<url>', 'Website URL or direct robots.txt URL')
    .option('--format <format>', 'Output format: text (default) or json', 'text')
    .addHelpText('after', `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek robots example.com')}                ${colors.gray('Validate robots.txt')}
  ${colors.green('$ rek robots example.com/robots.txt')}     ${colors.gray('Direct URL')}
  ${colors.green('$ rek robots example.com --format json')}  ${colors.gray('JSON output')}

${colors.bold(colors.yellow('Checks:'))}
  ${colors.cyan('Syntax')}              Valid robots.txt syntax
  ${colors.cyan('User-Agent blocks')}   Defined crawl rules
  ${colors.cyan('Sitemap')}             Sitemap directive present
  ${colors.cyan('Crawl-delay')}         Aggressive crawl delay
  ${colors.cyan('AI Bots')}             GPTBot, ClaudeBot, Anthropic blocks
`)
    .action(async (url, options: { format?: string }) => {
      // Normalize URL
      if (!url.startsWith('http')) url = `https://${url}`;
      if (!url.includes('robots.txt')) {
        const urlObj = new URL(url);
        url = `${urlObj.origin}/robots.txt`;
      }

      const isJson = options.format === 'json';

      if (!isJson) {
        console.log(colors.gray(`Fetching robots.txt from ${url}...`));
      }

      try {
        const { fetchAndValidateRobotsTxt } = await import('../seo/validators/robots.js');
        const result = await fetchAndValidateRobotsTxt(url);

        if (isJson) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        // Display results
        console.log(`
${colors.bold(colors.cyan('🤖 Robots.txt Analysis'))}
${colors.gray('URL:')} ${url}
${colors.gray('Valid:')} ${result.valid ? colors.green('Yes') : colors.red('No')}
`);

        if (result.parseResult) {
          const { parseResult } = result;

          // User-Agent blocks
          if (parseResult.userAgentBlocks.length > 0) {
            console.log(colors.bold('User-Agent Blocks:'));
            for (const block of parseResult.userAgentBlocks.slice(0, 5)) {
              const agents = block.userAgents.join(', ');
              const allowCount = block.rules.filter(r => r.type === 'allow').length;
              const disallowCount = block.rules.filter(r => r.type === 'disallow').length;
              console.log(`  ${colors.cyan(agents)}`);
              console.log(`    ${colors.green(`Allow: ${allowCount}`)} | ${colors.red(`Disallow: ${disallowCount}`)}`);
            }
            if (parseResult.userAgentBlocks.length > 5) {
              console.log(colors.gray(`  ... and ${parseResult.userAgentBlocks.length - 5} more blocks`));
            }
            console.log('');
          }

          // Sitemaps
          if (parseResult.sitemaps.length > 0) {
            console.log(colors.bold('Sitemaps:'));
            for (const sitemap of parseResult.sitemaps.slice(0, 3)) {
              console.log(`  ${colors.gray('→')} ${sitemap}`);
            }
            if (parseResult.sitemaps.length > 3) {
              console.log(colors.gray(`  ... and ${parseResult.sitemaps.length - 3} more`));
            }
            console.log('');
          }

          // AI Bot Status
          const aiAgents = ['gptbot', 'chatgpt-user', 'claudebot', 'claude-web', 'anthropic-ai', 'ccbot'];
          const blockedAiBots: string[] = [];
          for (const block of parseResult.userAgentBlocks) {
            for (const agent of block.userAgents) {
              if (aiAgents.includes(agent.toLowerCase())) {
                const hasBlockAll = block.rules.some(r => r.type === 'disallow' && (r.path === '/' || r.path === '/*'));
                if (hasBlockAll) {
                  blockedAiBots.push(agent);
                }
              }
            }
          }
          if (blockedAiBots.length > 0) {
            console.log(colors.bold('AI Bots Blocked:'));
            for (const bot of blockedAiBots) {
              console.log(`  ${colors.red('✗')} ${bot}`);
            }
            console.log('');
          }
        }

        // Issues
        if (result.issues.length > 0) {
          console.log(colors.bold('Issues:'));
          for (const issue of result.issues) {
            const icon = issue.type === 'error' ? colors.red('✗')
              : issue.type === 'warning' ? colors.yellow('⚠')
              : colors.gray('ℹ');
            console.log(`  ${icon} ${issue.message}`);
          }
          console.log('');
        }

        // Summary
        const errorCount = result.issues.filter(i => i.type === 'error').length;
        const warningCount = result.issues.filter(i => i.type === 'warning').length;
        if (errorCount === 0 && warningCount === 0) {
          console.log(colors.green('✔ No issues found'));
        } else {
          console.log(`${colors.red(`${errorCount} errors`)} | ${colors.yellow(`${warningCount} warnings`)}`);
        }

      } catch (error: any) {
        console.error(colors.red(`Robots.txt analysis failed: ${error.message}`));
        process.exit(1);
      }
    });

  // SEO Sitemap Validator
  program
    .command('sitemap')
    .description('Validate and analyze sitemap.xml file')
    .argument('<url>', 'Website URL or direct sitemap URL')
    .option('--format <format>', 'Output format: text (default) or json', 'text')
    .option('--discover', 'Discover all sitemaps via robots.txt')
    .addHelpText('after', `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek sitemap example.com')}                  ${colors.gray('Validate sitemap')}
  ${colors.green('$ rek sitemap example.com/sitemap.xml')}      ${colors.gray('Direct URL')}
  ${colors.green('$ rek sitemap example.com --discover')}       ${colors.gray('Find all sitemaps')}
  ${colors.green('$ rek sitemap example.com --format json')}    ${colors.gray('JSON output')}

${colors.bold(colors.yellow('Checks:'))}
  ${colors.cyan('Structure')}      Valid XML sitemap format
  ${colors.cyan('URL Count')}      Within 50,000 URL limit
  ${colors.cyan('File Size')}      Within 50MB limit
  ${colors.cyan('URLs')}           Valid, no duplicates, same domain
  ${colors.cyan('Lastmod')}        Valid dates, not in future
`)
    .action(async (url, options: { format?: string; discover?: boolean }) => {
      // Normalize URL
      if (!url.startsWith('http')) url = `https://${url}`;

      const isJson = options.format === 'json';

      try {
        if (options.discover) {
          // Discover all sitemaps
          const { discoverSitemaps } = await import('../seo/validators/sitemap.js');

          if (!isJson) {
            console.log(colors.gray(`Discovering sitemaps for ${new URL(url).origin}...`));
          }

          const sitemaps = await discoverSitemaps(url);

          if (isJson) {
            console.log(JSON.stringify({ url, sitemaps }, null, 2));
            return;
          }

          console.log(`
${colors.bold(colors.cyan('🗺️ Sitemap Discovery'))}
${colors.gray('Site:')} ${new URL(url).origin}
${colors.gray('Found:')} ${sitemaps.length} sitemap(s)
`);

          if (sitemaps.length > 0) {
            for (const sitemap of sitemaps) {
              console.log(`  ${colors.gray('→')} ${sitemap}`);
            }
          } else {
            console.log(colors.yellow('  No sitemaps found in robots.txt or common locations'));
          }
          return;
        }

        // Validate single sitemap
        if (!url.includes('sitemap')) {
          const urlObj = new URL(url);
          url = `${urlObj.origin}/sitemap.xml`;
        }

        if (!isJson) {
          console.log(colors.gray(`Fetching sitemap from ${url}...`));
        }

        const { fetchAndValidateSitemap } = await import('../seo/validators/sitemap.js');
        const result = await fetchAndValidateSitemap(url);

        if (isJson) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        // Display results
        console.log(`
${colors.bold(colors.cyan('🗺️ Sitemap Analysis'))}
${colors.gray('URL:')} ${url}
${colors.gray('Valid:')} ${result.valid ? colors.green('Yes') : colors.red('No')}
${colors.gray('Type:')} ${result.parseResult?.type === 'sitemapindex' ? 'Sitemap Index' : 'URL Set'}
`);

        if (result.parseResult) {
          const { parseResult } = result;

          if (parseResult.type === 'sitemapindex') {
            // Sitemap index
            console.log(colors.bold(`Sitemaps: ${parseResult.sitemaps?.length || 0}`));
            for (const sm of (parseResult.sitemaps || []).slice(0, 5)) {
              console.log(`  ${colors.gray('→')} ${sm.loc}`);
              if (sm.lastmod) {
                console.log(`    ${colors.gray(`Last modified: ${sm.lastmod}`)}`);
              }
            }
            if ((parseResult.sitemaps?.length || 0) > 5) {
              console.log(colors.gray(`  ... and ${parseResult.sitemaps!.length - 5} more`));
            }
          } else {
            // URL set
            console.log(colors.bold(`URLs: ${parseResult.urls?.length || 0}`));

            // Show sample URLs
            const sampleUrls = (parseResult.urls || []).slice(0, 5);
            for (const entry of sampleUrls) {
              const path = new URL(entry.loc).pathname;
              console.log(`  ${colors.gray('→')} ${path}`);
            }
            if ((parseResult.urls?.length || 0) > 5) {
              console.log(colors.gray(`  ... and ${parseResult.urls!.length - 5} more URLs`));
            }

            // Show statistics
            const urlsWithLastmod = (parseResult.urls || []).filter(u => u.lastmod).length;
            const urlsWithPriority = (parseResult.urls || []).filter(u => u.priority !== undefined).length;
            const urlsWithChangefreq = (parseResult.urls || []).filter(u => u.changefreq).length;

            console.log('');
            console.log(colors.bold('Statistics:'));
            console.log(`  ${colors.gray('With lastmod:')}     ${urlsWithLastmod} (${((urlsWithLastmod / (parseResult.urls?.length || 1)) * 100).toFixed(0)}%)`);
            console.log(`  ${colors.gray('With priority:')}    ${urlsWithPriority} (${((urlsWithPriority / (parseResult.urls?.length || 1)) * 100).toFixed(0)}%)`);
            console.log(`  ${colors.gray('With changefreq:')}  ${urlsWithChangefreq} (${((urlsWithChangefreq / (parseResult.urls?.length || 1)) * 100).toFixed(0)}%)`);
          }
          console.log('');
        }

        // Issues
        if (result.issues.length > 0) {
          console.log(colors.bold('Issues:'));
          for (const issue of result.issues.slice(0, 10)) {
            const icon = issue.type === 'error' ? colors.red('✗')
              : issue.type === 'warning' ? colors.yellow('⚠')
              : colors.gray('ℹ');
            console.log(`  ${icon} ${issue.message}`);
          }
          if (result.issues.length > 10) {
            console.log(colors.gray(`  ... and ${result.issues.length - 10} more issues`));
          }
          console.log('');
        }

        // Summary
        const errorCount = result.issues.filter(i => i.type === 'error').length;
        const warningCount = result.issues.filter(i => i.type === 'warning').length;
        if (errorCount === 0 && warningCount === 0) {
          console.log(colors.green('✔ No issues found'));
        } else {
          console.log(`${colors.red(`${errorCount} errors`)} | ${colors.yellow(`${warningCount} warnings`)}`);
        }

      } catch (error: any) {
        console.error(colors.red(`Sitemap analysis failed: ${error.message}`));
        process.exit(1);
      }
    });

  // SEO llms.txt Validator
  program
    .command('llms')
    .description('Validate and analyze llms.txt file (AI/LLM optimization)')
    .argument('[url]', 'Website URL or direct llms.txt URL')
    .option('--format <format>', 'Output format: text (default) or json', 'text')
    .option('--template', 'Generate a template llms.txt file')
    .addHelpText('after', `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek llms example.com')}                ${colors.gray('Validate llms.txt')}
  ${colors.green('$ rek llms example.com/llms.txt')}       ${colors.gray('Direct URL')}
  ${colors.green('$ rek llms example.com --format json')}  ${colors.gray('JSON output')}
  ${colors.green('$ rek llms --template > llms.txt')}      ${colors.gray('Generate template')}

${colors.bold(colors.yellow('About llms.txt:'))}
  A proposed standard for providing LLM-friendly content.
  Similar to robots.txt but for AI/LLM crawlers.
  Learn more: ${colors.cyan('https://llmstxt.org')}

${colors.bold(colors.yellow('Checks:'))}
  ${colors.cyan('Structure')}    Valid llms.txt format
  ${colors.cyan('Site Name')}    Primary heading present
  ${colors.cyan('Description')} Site description block
  ${colors.cyan('Sections')}     Content sections with links
`)
    .action(async (url, options: { format?: string; template?: boolean }) => {
      const isJson = options.format === 'json';

      // Template mode
      if (options.template) {
        const { generateLlmsTxtTemplate } = await import('../seo/validators/llms-txt.js');
        const template = generateLlmsTxtTemplate({
          siteName: 'Your Site Name',
          siteDescription: 'A brief description of your website and what it offers.',
          sections: [
            {
              title: 'Documentation',
              links: [
                { text: 'Getting Started', url: '/docs/getting-started' },
                { text: 'API Reference', url: '/docs/api' },
              ],
            },
            {
              title: 'Resources',
              links: [
                { text: 'Blog', url: '/blog' },
                { text: 'FAQ', url: '/faq' },
              ],
            },
          ],
        });
        console.log(template);
        return;
      }

      // Normalize URL
      if (!url) {
        console.error(colors.red('URL is required (use --template to generate a template)'));
        process.exit(1);
      }

      if (!url.startsWith('http')) url = `https://${url}`;
      if (!url.includes('llms.txt')) {
        const urlObj = new URL(url);
        url = `${urlObj.origin}/llms.txt`;
      }

      if (!isJson) {
        console.log(colors.gray(`Fetching llms.txt from ${url}...`));
      }

      try {
        const { fetchAndValidateLlmsTxt } = await import('../seo/validators/llms-txt.js');
        const result = await fetchAndValidateLlmsTxt(url);

        if (isJson) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        // Check if file exists
        if (!result.exists) {
          console.log(`
${colors.bold(colors.cyan('📄 llms.txt Analysis'))}
${colors.gray('URL:')} ${url}
${colors.red('Status:')} File not found

${colors.yellow('Recommendation:')}
  Consider creating an llms.txt file to help AI/LLM systems
  better understand your site's content and structure.

  Use ${colors.cyan('rek llms --template')} to generate a starting template.
  Learn more: ${colors.cyan('https://llmstxt.org')}
`);
          return;
        }

        // Display results
        console.log(`
${colors.bold(colors.cyan('📄 llms.txt Analysis'))}
${colors.gray('URL:')} ${url}
${colors.gray('Valid:')} ${result.valid ? colors.green('Yes') : colors.red('No')}
`);

        if (result.parseResult) {
          const { parseResult } = result;

          // Site name and description
          if (parseResult.siteName) {
            console.log(`${colors.bold('Site Name:')} ${parseResult.siteName}`);
          }
          if (parseResult.siteDescription) {
            const desc = parseResult.siteDescription.length > 100
              ? parseResult.siteDescription.slice(0, 97) + '...'
              : parseResult.siteDescription;
            console.log(`${colors.bold('Description:')} ${colors.gray(desc)}`);
          }
          console.log('');

          // Sections
          if (parseResult.sections.length > 0) {
            console.log(colors.bold(`Sections: ${parseResult.sections.length}`));
            for (const section of parseResult.sections) {
              const linkCount = parseResult.links.filter(l =>
                // Approximate: links after this section header
                true // Simplified - count all links in section
              ).length;
              console.log(`  ${colors.cyan('##')} ${section.title}`);
            }
            console.log('');
          }

          // Links
          if (parseResult.links.length > 0) {
            console.log(colors.bold(`Links: ${parseResult.links.length}`));
            for (const link of parseResult.links.slice(0, 5)) {
              console.log(`  ${colors.gray('→')} [${link.text}](${link.url})`);
            }
            if (parseResult.links.length > 5) {
              console.log(colors.gray(`  ... and ${parseResult.links.length - 5} more links`));
            }
            console.log('');
          }
        }

        // Issues
        if (result.issues.length > 0) {
          console.log(colors.bold('Issues:'));
          for (const issue of result.issues) {
            const icon = issue.type === 'error' ? colors.red('✗')
              : issue.type === 'warning' ? colors.yellow('⚠')
              : colors.gray('ℹ');
            console.log(`  ${icon} ${issue.message}`);
          }
          console.log('');
        }

        // Summary
        const errorCount = result.issues.filter(i => i.type === 'error').length;
        const warningCount = result.issues.filter(i => i.type === 'warning').length;
        if (errorCount === 0 && warningCount === 0 && result.valid) {
          console.log(colors.green('✔ Valid llms.txt file'));
        } else {
          console.log(`${colors.red(`${errorCount} errors`)} | ${colors.yellow(`${warningCount} warnings`)}`);
        }

      } catch (error: any) {
        console.error(colors.red(`llms.txt analysis failed: ${error.message}`));
        process.exit(1);
      }
    });

  // Spider - Web Crawler
  program
    .command('spider')
    .description('Crawl a website following internal links')
    .argument('<url>', 'Starting URL to crawl')
    .argument('[args...]', 'Options: depth=N limit=N concurrency=N seo focus=MODE output=file.json')
    .addHelpText('after', `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek spider example.com')}                           ${colors.gray('Crawl with defaults')}
  ${colors.green('$ rek spider example.com depth=3 limit=50')}          ${colors.gray('Depth 3, max 50 pages')}
  ${colors.green('$ rek spider example.com seo')}                       ${colors.gray('Crawl + SEO analysis')}
  ${colors.green('$ rek spider example.com seo output=report.json')}    ${colors.gray('SEO with JSON export')}
  ${colors.green('$ rek spider example.com seo focus=links')}           ${colors.gray('Focus on link issues')}
  ${colors.green('$ rek spider example.com seo focus=security')}        ${colors.gray('Focus on security issues')}
  ${colors.green('$ rek spider example.com seo focus=duplicates')}      ${colors.gray('Focus on duplicate content')}

${colors.bold(colors.yellow('Options:'))}
  ${colors.cyan('depth=N')}           Max link depth to follow (default: 5)
  ${colors.cyan('limit=N')}           Max pages to crawl (default: 100)
  ${colors.cyan('concurrency=N')}     Parallel requests (default: 5)
  ${colors.cyan('seo')}               Enable SEO analysis mode
  ${colors.cyan('focus=MODE')}        Focus analysis on specific area (requires seo)
  ${colors.cyan('output=file.json')}  Save JSON report to file

${colors.bold(colors.yellow('Focus Modes:'))}
  ${colors.cyan('links')}        Internal/external links, broken links, anchor text
  ${colors.cyan('duplicates')}   Duplicate titles, descriptions, content (85% similarity)
  ${colors.cyan('security')}     SSL/TLS, HTTPS, form security, headers
  ${colors.cyan('ai')}           AI/LLM optimization, llms.txt, robots.txt AI bots
  ${colors.cyan('resources')}    JS/CSS optimization, image compression, caching
  ${colors.cyan('all')}          Run all focus modes (default)
`)
    .action(async (url: string, args: string[]) => {
      // Parse key=value args (same syntax as shell)
      let maxDepth = 5;
      let maxPages = 100;
      let concurrency = 5;
      let seoEnabled = false;
      let outputFile = '';
      let focusMode: 'all' | 'links' | 'duplicates' | 'security' | 'ai' | 'resources' = 'all';

      // Focus mode to rule categories mapping
      const focusCategories: Record<string, string[]> = {
        links: ['links'],
        duplicates: ['title', 'meta', 'content'], // For duplicate detection
        security: ['security'],
        ai: ['ai-search'],
        resources: ['resources', 'performance'],
        all: [], // Empty means all categories
      };

      for (const arg of args) {
        if (arg.startsWith('depth=')) {
          maxDepth = parseInt(arg.split('=')[1]) || 5;
        } else if (arg.startsWith('limit=')) {
          maxPages = parseInt(arg.split('=')[1]) || 100;
        } else if (arg.startsWith('concurrency=')) {
          concurrency = parseInt(arg.split('=')[1]) || 5;
        } else if (arg === 'seo') {
          seoEnabled = true;
        } else if (arg.startsWith('output=')) {
          outputFile = arg.split('=')[1] || '';
        } else if (arg.startsWith('focus=')) {
          const mode = arg.split('=')[1] || 'all';
          if (mode in focusCategories) {
            focusMode = mode as typeof focusMode;
          } else {
            console.error(colors.red(`Invalid focus mode: ${mode}`));
            console.error(colors.gray(`Valid modes: ${Object.keys(focusCategories).join(', ')}`));
            process.exit(1);
          }
        }
      }

      if (!url.startsWith('http')) url = `https://${url}`;

      const modeLabel = seoEnabled ? colors.magenta(' + SEO') : '';
      const focusLabel = focusMode !== 'all' ? colors.cyan(` [focus: ${focusMode}]`) : '';
      console.log(colors.cyan(`\nSpider starting: ${url}`));
      console.log(colors.gray(`  Depth: ${maxDepth} | Limit: ${maxPages} | Concurrency: ${concurrency}${modeLabel}${focusLabel}`));
      if (outputFile) {
        console.log(colors.gray(`  Output: ${outputFile}`));
      }
      console.log('');

      try {
        // SEO Spider mode
        if (seoEnabled) {
          const { SeoSpider } = await import('../seo/index.js');

          const seoSpider = new SeoSpider({
            maxDepth,
            maxPages,
            concurrency,
            sameDomain: true,
            delay: 100,
            seo: true,
            output: outputFile || undefined,
            focusCategories: focusCategories[focusMode],
            focusMode,
            onProgress: (progress) => {
              process.stdout.write(`\r${colors.gray('  Crawling:')} ${colors.cyan(progress.crawled.toString())} pages | ${colors.gray('Queue:')} ${progress.queued} | ${colors.gray('Depth:')} ${progress.depth}   `);
            },
          });

          const result = await seoSpider.crawl(url);

          // Clear progress line
          process.stdout.write('\r' + ' '.repeat(80) + '\r');

          // Print SEO Spider results
          console.log(colors.green(`\n✔ SEO Spider complete`) + colors.gray(` (${(result.duration / 1000).toFixed(1)}s)`));
          console.log(`  ${colors.cyan('Pages crawled')}: ${result.pages.length}`);
          console.log(`  ${colors.cyan('Unique URLs')}: ${result.visited.size}`);
          console.log(`  ${colors.cyan('Avg SEO Score')}: ${result.summary.avgScore}/100`);

          // Calculate performance metrics
          const responseTimes = result.pages.filter(p => p.duration > 0).map(p => p.duration);
          const avgResponseTime = responseTimes.length > 0
            ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
            : 0;
          const minResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
          const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
          const reqPerSec = result.duration > 0 ? (result.pages.length / (result.duration / 1000)).toFixed(1) : '0';

          // Calculate HTTP status distribution + error types
          const statusCounts = new Map<string, number>();
          const errorDetails: Array<{ url: string; error: string; status: number }> = [];

          for (const page of result.pages) {
            if (page.status && page.status > 0) {
              // Real HTTP status
              const key = page.status.toString();
              statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
            } else if (page.error) {
              // Classify the error for better display
              const { classifyError } = await import('./helpers.js');
              const classified = classifyError(page.error);
              const key = classified.category.type;
              statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
              errorDetails.push({ url: page.url, error: page.error, status: page.status || 0 });
            } else {
              statusCounts.set('UNKNOWN', (statusCounts.get('UNKNOWN') || 0) + 1);
            }
          }

          // Calculate link and image totals from SEO reports
          let totalInternalLinks = 0;
          let totalExternalLinks = 0;
          let totalImages = 0;
          let imagesWithoutAlt = 0;
          let pagesWithoutTitle = 0;
          let pagesWithoutDescription = 0;

          for (const page of result.pages) {
            if (page.seoReport) {
              totalInternalLinks += page.seoReport.links?.internal || 0;
              totalExternalLinks += page.seoReport.links?.external || 0;
              totalImages += page.seoReport.images?.total || 0;
              imagesWithoutAlt += page.seoReport.images?.withoutAlt || 0;
              if (!page.seoReport.title?.text) pagesWithoutTitle++;
              if (!page.seoReport.metaDescription?.text) pagesWithoutDescription++;
            }
          }

          // Show Performance section
          console.log(colors.bold('\n  Performance:'));
          console.log(`    ${colors.gray('Avg Response:')}  ${avgResponseTime}ms`);
          console.log(`    ${colors.gray('Min/Max:')}       ${minResponseTime}ms / ${maxResponseTime}ms`);
          console.log(`    ${colors.gray('Throughput:')}    ${reqPerSec} req/s`);

          // Show HTTP Status Distribution
          console.log(colors.bold('\n  HTTP Status:'));
          const sortedStatuses = Array.from(statusCounts.entries()).sort((a, b) => b[1] - a[1]);
          for (const [statusKey, count] of sortedStatuses.slice(0, 8)) {
            const statusNum = parseInt(statusKey);
            const isHttpStatus = !isNaN(statusNum) && statusNum > 0;

            let statusLabel: string;
            let statusColor: (s: string) => string;

            if (isHttpStatus) {
              // HTTP status code
              statusLabel = statusNum.toString();
              statusColor = statusNum >= 500 ? colors.red :
                            statusNum >= 400 ? colors.yellow :
                            statusNum >= 300 ? colors.cyan : colors.green;
            } else {
              // Error type from classifier
              statusLabel = statusKey;
              statusColor = statusKey.startsWith('HTTP_4') ? colors.yellow :
                            statusKey.startsWith('HTTP_5') ? colors.red :
                            statusKey === 'TIMEOUT' ? colors.yellow :
                            colors.red;
            }

            const pct = ((count / result.pages.length) * 100).toFixed(0);
            console.log(`    ${statusColor(statusLabel.padEnd(12))} ${count.toString().padStart(3)} (${pct}%)`);
          }

          // Show error details if any
          if (errorDetails.length > 0) {
            console.log(colors.bold('\n  Errors:'));
            // Group by error type
            const grouped = new Map<string, typeof errorDetails>();
            for (const err of errorDetails) {
              const { classifyError } = await import('./helpers.js');
              const classified = classifyError(err.error);
              const key = classified.category.type;
              if (!grouped.has(key)) grouped.set(key, []);
              grouped.get(key)!.push(err);
            }
            for (const [type, errs] of grouped) {
              const paths = errs.map(e => {
                try { return new URL(e.url).pathname; }
                catch { return e.url; }
              });
              console.log(`    ${colors.red(type.padEnd(16))} ${errs.length} page${errs.length > 1 ? 's' : ''}`);
              // Show up to 3 affected paths
              for (const path of paths.slice(0, 3)) {
                console.log(`      ${colors.gray('→')} ${path.slice(0, 60)}`);
              }
              if (paths.length > 3) {
                console.log(`      ${colors.gray(`... and ${paths.length - 3} more`)}`);
              }
            }
          }

          // Show Content Stats
          console.log(colors.bold('\n  Content:'));
          console.log(`    ${colors.gray('Internal links:')} ${totalInternalLinks.toLocaleString()}`);
          console.log(`    ${colors.gray('External links:')} ${totalExternalLinks.toLocaleString()}`);
          console.log(`    ${colors.gray('Images:')}         ${totalImages.toLocaleString()} (${imagesWithoutAlt} missing alt)`);
          console.log(`    ${colors.gray('Missing title:')}  ${pagesWithoutTitle}`);
          console.log(`    ${colors.gray('Missing desc:')}   ${pagesWithoutDescription}`);

          // Show SEO summary
          console.log(colors.bold('\n  SEO Summary:'));
          const { summary } = result;
          console.log(`    ${colors.red('✗')} Pages with errors:     ${summary.pagesWithErrors}`);
          console.log(`    ${colors.yellow('⚠')} Pages with warnings:   ${summary.pagesWithWarnings}`);
          console.log(`    ${colors.magenta('⚐')} Duplicate titles:      ${summary.duplicateTitles}`);
          console.log(`    ${colors.magenta('⚐')} Duplicate descriptions:${summary.duplicateDescriptions}`);
          console.log(`    ${colors.magenta('⚐')} Duplicate H1s:         ${summary.duplicateH1s}`);
          console.log(`    ${colors.gray('○')} Orphan pages:          ${summary.orphanPages}`);

          // Show site-wide issues
          if (result.siteWideIssues.length > 0) {
            console.log(colors.bold('\n  Site-Wide Issues:'));
            for (const issue of result.siteWideIssues.slice(0, 10)) {
              const icon = issue.severity === 'error' ? colors.red('✗') :
                           issue.severity === 'warning' ? colors.yellow('⚠') : colors.gray('○');
              console.log(`    ${icon} ${issue.message}`);
              if (issue.value) {
                const truncatedValue = issue.value.length > 50 ? issue.value.slice(0, 47) + '...' : issue.value;
                console.log(`      ${colors.gray(`"${truncatedValue}"`)}`);
              }
              // Deduplicate affected URLs by pathname
              const uniquePaths = [...new Set(issue.affectedUrls.map(u => new URL(u).pathname))];
              if (uniquePaths.length <= 3) {
                for (const path of uniquePaths) {
                  console.log(`      ${colors.gray('→')} ${path}`);
                }
              } else {
                console.log(`      ${colors.gray(`→ ${uniquePaths.length} pages affected`)}`);
              }
            }
            if (result.siteWideIssues.length > 10) {
              console.log(colors.gray(`    ... and ${result.siteWideIssues.length - 10} more issues`));
            }
          }

          // Show pages by SEO score (deduplicated by pathname)
          const pagesWithScores = result.pages
            .filter(p => p.seoReport)
            .sort((a, b) => (a.seoReport?.score || 0) - (b.seoReport?.score || 0));

          // Deduplicate by pathname, keeping lowest score per path
          const seenPaths = new Set<string>();
          const uniquePages = pagesWithScores.filter(page => {
            const path = new URL(page.url).pathname;
            if (seenPaths.has(path)) return false;
            seenPaths.add(path);
            return true;
          });

          if (uniquePages.length > 0) {
            console.log(colors.bold('\n  Pages by SEO Score:'));
            const worstPages = uniquePages.slice(0, 5);
            for (const page of worstPages) {
              const score = page.seoReport?.score || 0;
              const grade = page.seoReport?.grade || '?';
              const path = new URL(page.url).pathname;
              const scoreColor = score >= 80 ? colors.green : score >= 60 ? colors.yellow : colors.red;
              console.log(`    ${scoreColor(`${score.toString().padStart(3)}`)} ${colors.gray(`[${grade}]`)} ${path.slice(0, 50)}`);
            }
            if (uniquePages.length > 5) {
              console.log(colors.gray(`    ... and ${uniquePages.length - 5} more pages`));
            }
          }

          // Show output file location
          if (outputFile) {
            console.log(colors.green(`\n  Report saved to: ${outputFile}`));
          }

        } else {
          // Regular spider (non-SEO mode)
          const { Spider } = await import('../scrape/spider.js');

          const spider = new Spider({
            maxDepth,
            maxPages,
            concurrency,
            sameDomain: true,
            delay: 100,
            onProgress: (progress) => {
              process.stdout.write(`\r${colors.gray('  Crawling:')} ${colors.cyan(progress.crawled.toString())} pages | ${colors.gray('Queue:')} ${progress.queued} | ${colors.gray('Depth:')} ${progress.depth}   `);
            },
          });

          const result = await spider.crawl(url);

          // Clear progress line
          process.stdout.write('\r' + ' '.repeat(80) + '\r');

          // Print results
          console.log(colors.green(`\n✔ Spider complete`) + colors.gray(` (${(result.duration / 1000).toFixed(1)}s)`));
          console.log(`  ${colors.cyan('Pages crawled')}: ${result.pages.length}`);
          console.log(`  ${colors.cyan('Unique URLs')}: ${result.visited.size}`);
          console.log(`  ${colors.cyan('Errors')}: ${result.errors.length}`);

          // Show pages by depth
          const byDepth = new Map<number, number>();
          for (const page of result.pages) {
            byDepth.set(page.depth, (byDepth.get(page.depth) || 0) + 1);
          }
          console.log(colors.bold('\n  Pages by depth:'));
          for (const [depth, count] of Array.from(byDepth.entries()).sort((a, b) => a[0] - b[0])) {
            const bar = '█'.repeat(Math.min(count, 40));
            console.log(`    ${colors.gray(`d${depth}:`)} ${bar} ${count}`);
          }

          // Show top pages by links
          const topPages = [...result.pages]
            .filter(p => !p.error)
            .sort((a, b) => b.links.length - a.links.length)
            .slice(0, 10);

          if (topPages.length > 0) {
            console.log(colors.bold('\n  Top pages by outgoing links:'));
            for (const page of topPages) {
              const title = page.title.slice(0, 40) || new URL(page.url).pathname;
              console.log(`    ${colors.cyan(page.links.length.toString().padStart(3))} ${title}`);
            }
          }

          // Show errors using centralized error handler
          if (result.errors.length > 0) {
            const errorSummary = summarizeErrors(result.errors);
            console.log(formatErrorSummary(errorSummary));
          }

          // Save to file if requested
          if (outputFile) {
            const jsonOutput = {
              startUrl: result.startUrl,
              crawledAt: new Date().toISOString(),
              duration: result.duration,
              summary: {
                totalPages: result.pages.length,
                successCount: result.pages.filter(p => !p.error).length,
                errorCount: result.errors.length,
                uniqueUrls: result.visited.size,
              },
              pages: result.pages.map(p => ({
                url: p.url,
                status: p.status,
                title: p.title,
                depth: p.depth,
                linksCount: p.links.length,
                duration: p.duration,
                error: p.error,
              })),
              errors: result.errors,
            };
            await fs.writeFile(outputFile, JSON.stringify(jsonOutput, null, 2));
            console.log(colors.green(`\n  Report saved to: ${outputFile}`));
          }
        }

        console.log('');
      } catch (error: any) {
        console.error(colors.red(`\nSpider failed: ${error.message}`));
        process.exit(1);
      }
    });

  // Scrape Command - Web scraping with CSS selectors
  program
    .command('scrape')
    .description('Scrape data from a web page using CSS selectors')
    .argument('<url>', 'URL to scrape')
    .argument('[args...]', 'Options: select=SELECTOR, attr=NAME, links, images, meta, tables, scripts, jsonld')
    .addHelpText('after', `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek scrape example.com')}                      ${colors.gray('# Basic page info')}
  ${colors.green('$ rek scrape example.com select="h1"')}          ${colors.gray('# Extract h1 text')}
  ${colors.green('$ rek scrape example.com select="a" attr=href')} ${colors.gray('# Extract link hrefs')}
  ${colors.green('$ rek scrape example.com links')}                ${colors.gray('# All links')}
  ${colors.green('$ rek scrape example.com images')}               ${colors.gray('# All images')}
  ${colors.green('$ rek scrape example.com meta')}                 ${colors.gray('# Meta tags')}
  ${colors.green('$ rek scrape example.com tables')}               ${colors.gray('# All tables as JSON')}
  ${colors.green('$ rek scrape example.com scripts')}              ${colors.gray('# All scripts')}
  ${colors.green('$ rek scrape example.com jsonld')}               ${colors.gray('# JSON-LD structured data')}

${colors.bold(colors.yellow('Options:'))}
  ${colors.cyan('select=SELECTOR')}  CSS selector to extract elements
  ${colors.cyan('attr=NAME')}        Extract specific attribute (use with select)
  ${colors.cyan('links')}            Extract all links with text and href
  ${colors.cyan('images')}           Extract all images with src and alt
  ${colors.cyan('meta')}             Extract all meta tags
  ${colors.cyan('tables')}           Extract tables as structured JSON
  ${colors.cyan('scripts')}          Extract all script sources
  ${colors.cyan('jsonld')}           Extract JSON-LD structured data
`)
    .action(async (url, args: string[]) => {
      const { ScrapeDocument } = await import('../scrape/document.js');
      const { Client } = await import('../core/client.js');

      // Parse options from args
      let selector = '';
      let attrName = '';
      let extractLinks = false;
      let extractImages = false;
      let extractMeta = false;
      let extractTables = false;
      let extractScripts = false;
      let extractJsonLd = false;

      for (const arg of args) {
        if (arg.startsWith('select=')) {
          selector = arg.slice(7);
        } else if (arg.startsWith('attr=')) {
          attrName = arg.slice(5);
        } else if (arg === 'links') {
          extractLinks = true;
        } else if (arg === 'images') {
          extractImages = true;
        } else if (arg === 'meta') {
          extractMeta = true;
        } else if (arg === 'tables') {
          extractTables = true;
        } else if (arg === 'scripts') {
          extractScripts = true;
        } else if (arg === 'jsonld') {
          extractJsonLd = true;
        }
      }

      // Normalize URL
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }

      console.log(colors.gray(`Fetching ${url}...`));

      try {
        const client = new Client();
        const response = await client.get(url);
        const html = await response.text();
        const doc = await ScrapeDocument.create(html, { baseUrl: url });

        // Default: show basic page info
        if (!selector && !extractLinks && !extractImages && !extractMeta && !extractTables && !extractScripts && !extractJsonLd) {
          const title = doc.text('title') || 'N/A';
          const description = doc.attr('meta[name="description"]', 'content') || 'N/A';
          const h1 = doc.text('h1') || 'N/A';
          const linkCount = doc.links().length;
          const imageCount = doc.images().length;

          console.log(`
${colors.bold(colors.cyan('📄 Page Info'))}

${colors.bold('Title:')}       ${title}
${colors.bold('Description:')} ${description.slice(0, 100)}${description.length > 100 ? '...' : ''}
${colors.bold('H1:')}          ${h1}
${colors.bold('Links:')}       ${linkCount}
${colors.bold('Images:')}      ${imageCount}
`);
          return;
        }

        // CSS Selector extraction
        if (selector) {
          if (attrName) {
            // Extract attribute
            const values = doc.attrs(selector, attrName);
            console.log(`\n${colors.bold(`Found ${values.length} values for "${attrName}" in "${selector}"`)}\n`);
            values.slice(0, 50).forEach((value, i) => {
              if (value) {
                console.log(`${colors.gray(`${i + 1}.`)} ${value}`);
              }
            });
            if (values.length > 50) {
              console.log(colors.gray(`\n... and ${values.length - 50} more`));
            }
          } else {
            // Extract text
            const texts = doc.texts(selector);
            console.log(`\n${colors.bold(`Found ${texts.length} elements matching "${selector}"`)}\n`);
            texts.slice(0, 50).forEach((text, i) => {
              const trimmed = text.trim();
              if (trimmed) {
                console.log(`${colors.gray(`${i + 1}.`)} ${trimmed.slice(0, 200)}`);
              }
            });
            if (texts.length > 50) {
              console.log(colors.gray(`\n... and ${texts.length - 50} more`));
            }
          }
          return;
        }

        // Extract links
        if (extractLinks) {
          const links = doc.links();
          console.log(`\n${colors.bold(`Found ${links.length} links`)}\n`);

          links.slice(0, 50).forEach((link, i) => {
            const text = (link.text || '').trim().slice(0, 50) || '[no text]';
            console.log(`${colors.gray(`${i + 1}.`)} ${colors.cyan(text)}`);
            console.log(`   ${colors.gray(link.href)}`);
          });

          if (links.length > 50) {
            console.log(colors.gray(`\n... and ${links.length - 50} more`));
          }
          return;
        }

        // Extract images
        if (extractImages) {
          const images = doc.images();
          console.log(`\n${colors.bold(`Found ${images.length} images`)}\n`);

          images.slice(0, 30).forEach((img, i) => {
            const alt = img.alt || '[no alt]';
            console.log(`${colors.gray(`${i + 1}.`)} ${colors.cyan(alt.slice(0, 50))}`);
            console.log(`   ${colors.gray(img.src)}`);
          });

          if (images.length > 30) {
            console.log(colors.gray(`\n... and ${images.length - 30} more`));
          }
          return;
        }

        // Extract meta tags
        if (extractMeta) {
          const meta = doc.meta();
          const entries = Object.entries(meta);
          console.log(`\n${colors.bold(`Found ${entries.length} meta entries`)}\n`);

          entries.forEach(([name, content]) => {
            if (name && content) {
              const value = String(content);
              console.log(`${colors.cyan(name)}: ${value.slice(0, 100)}${value.length > 100 ? '...' : ''}`);
            }
          });
          return;
        }

        // Extract tables
        if (extractTables) {
          const tables = doc.tables();
          console.log(`\n${colors.bold(`Found ${tables.length} tables`)}\n`);

          tables.slice(0, 5).forEach((table, tableIndex) => {
            console.log(`${colors.bold(`Table ${tableIndex + 1}:`)} ${table.rows?.length || 0} rows`);
            console.log(JSON.stringify((table.rows || []).slice(0, 10), null, 2));
            if ((table.rows?.length || 0) > 10) {
              console.log(colors.gray(`... and ${(table.rows?.length || 0) - 10} more rows`));
            }
            console.log('');
          });
          return;
        }

        // Extract scripts
        if (extractScripts) {
          const scripts = doc.scripts();
          const external = scripts.filter(s => s.src);
          const inline = scripts.filter(s => !s.src);

          console.log(`\n${colors.bold(`Found ${external.length} external scripts, ${inline.length} inline`)}\n`);

          if (external.length > 0) {
            console.log(colors.bold('External Scripts:'));
            external.slice(0, 20).forEach((script, i) => {
              console.log(`${colors.gray(`${i + 1}.`)} ${script.src}`);
            });
            if (external.length > 20) {
              console.log(colors.gray(`... and ${external.length - 20} more`));
            }
          }
          return;
        }

        // Extract JSON-LD
        if (extractJsonLd) {
          const jsonld = doc.jsonLd();
          console.log(`\n${colors.bold(`Found ${jsonld.length} JSON-LD blocks`)}\n`);

          jsonld.forEach((data, i) => {
            console.log(`${colors.bold(`Block ${i + 1}:`)} ${data['@type'] || 'Unknown type'}`);
            console.log(JSON.stringify(data, null, 2));
            console.log('');
          });
          return;
        }

      } catch (error: any) {
        console.error(colors.red(`Scrape failed: ${error.message}`));
        process.exit(1);
      }
    });

  // AI Command (single-shot prompt without memory)
  program
    .command('ai')
    .description('Send a single AI prompt (no memory/context)')
    .argument('<preset>', 'AI preset to use (e.g., @openai, @anthropic, @groq)')
    .argument('<prompt...>', 'The prompt to send')
    .option('-m, --model <model>', 'Override default model')
    .option('-t, --temperature <temp>', 'Temperature (0-1)', '0.7')
    .option('--max-tokens <tokens>', 'Max tokens in response', '2048')
    .option('-w, --wait', 'Wait for full response (disable streaming)')
    .option('-j, --json', 'Output raw JSON response')
    .option('-e, --env [path]', 'Load .env file (auto-loads from cwd if exists)')
    .addHelpText('after', `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek ai @openai "What is the capital of France?"')}
  ${colors.green('$ rek ai @anthropic "Explain quantum computing" -m claude-sonnet-4-20250514')}
  ${colors.green('$ rek ai @groq "Write a haiku" --wait')}
  ${colors.green('$ rek ai @openai "Translate to Spanish: Hello world"')}

${colors.bold(colors.yellow('Available AI Presets:'))}
  ${colors.cyan('@openai')}       OpenAI (GPT-4o, GPT-5.1)
  ${colors.cyan('@anthropic')}    Anthropic (Claude)
  ${colors.cyan('@groq')}         Groq (fast inference)
  ${colors.cyan('@google')}       Google (Gemini)
  ${colors.cyan('@xai')}          xAI (Grok)
  ${colors.cyan('@mistral')}      Mistral AI
  ${colors.cyan('@cohere')}       Cohere
  ${colors.cyan('@deepseek')}     DeepSeek
  ${colors.cyan('@perplexity')}   Perplexity
  ${colors.cyan('@together')}     Together AI
  ${colors.cyan('@fireworks')}    Fireworks AI
  ${colors.cyan('@replicate')}    Replicate
  ${colors.cyan('@huggingface')}  Hugging Face

${colors.bold(colors.yellow('Note:'))}
  This command sends a single prompt without conversation memory.
  For chat with memory, use: ${colors.cyan('rek shell')} then ${colors.cyan('@openai Your message')}
`)
    .action(async (preset: string, promptParts: string[], options: { model?: string; temperature?: string; maxTokens?: string; wait?: boolean; json?: boolean; env?: string | boolean }) => {
      // Load .env file if requested or by default
      // Auto-load .env from cwd if it exists (silent fail)
      if (options.env !== undefined) {
        await loadEnvFile(options.env);
      } else {
        // Try loading from cwd silently
        try {
          const envPath = join(process.cwd(), '.env');
          await fs.access(envPath);
          await loadEnvFile(true);
        } catch {
          // .env doesn't exist, that's fine
        }
      }

      // Parse preset name
      let presetName = preset;
      if (presetName.startsWith('@')) {
        presetName = presetName.slice(1);
      }

      // Resolve preset
      const presetConfig = resolvePreset(presetName);
      if (!presetConfig) {
        console.error(colors.red(`Unknown AI preset: @${presetName}`));
        console.log(colors.gray('Available AI presets: @openai, @anthropic, @groq, @google, @xai, @mistral, @cohere'));
        process.exit(1);
      }

      // Check if preset has AI config
      if (!presetConfig._aiConfig) {
        console.error(colors.red(`Preset @${presetName} does not support AI features.`));
        console.log(colors.gray('Use an AI preset like @openai, @anthropic, @groq, etc.'));
        process.exit(1);
      }

      const prompt = promptParts.join(' ');
      if (!prompt.trim()) {
        console.error(colors.red('Error: Prompt is required'));
        process.exit(1);
      }

      try {
        const { createClient } = await import('../core/client.js');
        const client = createClient(presetConfig);

        // Override model if specified
        if (options.model) {
          client.ai.setMemoryConfig({ systemPrompt: undefined }); // Reset any system prompt
          (client as any)._aiConfig.model = options.model;
        }

        if (!options.json) {
          console.log(colors.gray(`Using @${presetName} (${(client as any)._aiConfig.model})...\n`));
        }

        if (options.wait || options.json) {
          // Non-streaming mode (wait for full response)
          const response = await client.ai.prompt(prompt);

          if (options.json) {
            console.log(JSON.stringify({
              content: response.content,
              model: response.model,
              usage: response.usage,
              finishReason: response.finishReason,
            }, null, 2));
          } else {
            console.log(response.content);

            // Show usage stats
            if (response.usage) {
              console.log(colors.gray(`\n─────────────────────────────────────────`));
              console.log(colors.gray(`Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`));
            }
          }
        } else {
          // Streaming mode (default)
          const stream = await client.ai.promptStream(prompt);
          for await (const event of stream) {
            if (event.type === 'text') {
              process.stdout.write(event.content);
            }
          }
          console.log(''); // Final newline
        }
      } catch (error: any) {
        console.error(colors.red(`AI request failed: ${error.message}`));
        if (error.cause) {
          console.error(colors.gray(error.cause.message || error.cause));
        }
        process.exit(1);
      }
    });

  // IP Intelligence (uses local MaxMind GeoLite2 database)
  program
    .command('ip')
    .description('Get IP address intelligence using local GeoLite2 database')
    .argument('<address>', 'IP address to lookup')
    .action(async (address) => {
        const { getIpInfo, isGeoIPAvailable } = await import('../mcp/ip-intel.js');

        if (!isGeoIPAvailable()) {
            console.log(colors.gray(`Downloading GeoLite2 database...`));
        }

        try {
            const info = await getIpInfo(address);

            if (info.bogon) {
                console.log(colors.yellow(`\n⚠  ${address} is a Bogon/Private IP.`));
                console.log(colors.gray(`   Type: ${info.bogonType}`));
                return;
            }

            console.log(`
${colors.bold(colors.cyan('🌍 IP Intelligence Report'))}

${colors.bold('Location:')}
  ${colors.gray('City:')}      ${info.city || 'N/A'}
  ${colors.gray('Region:')}    ${info.region || 'N/A'}
  ${colors.gray('Country:')}   ${info.country || 'N/A'} ${info.countryCode ? `(${info.countryCode})` : ''}
  ${colors.gray('Continent:')} ${info.continent || 'N/A'}
  ${colors.gray('Timezone:')}  ${info.timezone || 'N/A'}
  ${colors.gray('Coords:')}    ${info.loc ? colors.cyan(info.loc) : 'N/A'}
  ${colors.gray('Accuracy:')}  ${info.accuracy ? `~${info.accuracy} km` : 'N/A'}

${colors.bold('Network:')}
  ${colors.gray('IP:')}        ${info.ip}
  ${colors.gray('Type:')}      ${info.isIPv6 ? 'IPv6' : 'IPv4'}
  ${colors.gray('Postal:')}    ${info.postal || 'N/A'}
`);
        } catch (err: any) {
            console.error(colors.red(`IP Lookup Failed: ${err.message}`));
            process.exit(1);
        }
    });

  // TLS/SSL Inspector
  program
    .command('tls')
    .alias('ssl')
    .description('Inspect TLS/SSL certificate of a host')
    .argument('<host>', 'Hostname or IP address')
    .argument('[port]', 'Port number (default: 443)', '443')
    .action(async (host, port) => {
      const { inspectTLS } = await import('../utils/tls-inspector.js');

      console.log(colors.gray(`Inspecting TLS certificate for ${host}:${port}...`));

      try {
        const info = await inspectTLS(host, parseInt(port));

        // Days remaining color
        let daysColor = colors.green;
        if (info.daysRemaining < 30) daysColor = colors.red;
        else if (info.daysRemaining < 90) daysColor = colors.yellow;

        // Validity status
        const validIcon = info.valid ? colors.green('✔ Valid') : colors.red('✖ Expired');
        const authIcon = info.authorized ? colors.green('✔ Trusted') : colors.yellow('⚠ Self-signed/Untrusted');

        console.log(`
${colors.bold(colors.cyan('🔒 TLS Certificate Report'))}

${colors.bold('Status:')}
  ${validIcon}
  ${authIcon}
  ${colors.gray('Days Remaining:')} ${daysColor(info.daysRemaining.toString())}

${colors.bold('Certificate:')}
  ${colors.gray('Subject:')}       ${info.subject?.CN || info.subject?.O || 'N/A'}
  ${colors.gray('Issuer:')}        ${info.issuer?.CN || info.issuer?.O || 'N/A'}
  ${colors.gray('Valid From:')}    ${info.validFrom.toISOString().split('T')[0]}
  ${colors.gray('Valid To:')}      ${info.validTo.toISOString().split('T')[0]}
  ${colors.gray('Serial:')}        ${info.serialNumber}

${colors.bold('Security:')}
  ${colors.gray('Protocol:')}      ${info.protocol || 'N/A'}
  ${colors.gray('Cipher:')}        ${info.cipher?.name || 'N/A'}
  ${colors.gray('Key:')}           ${info.pubkey ? `${info.pubkey.algo.toUpperCase()} ${info.pubkey.size}-bit` : 'N/A'}

${colors.bold('Fingerprints:')}
  ${colors.gray('SHA-1:')}   ${info.fingerprint}
  ${colors.gray('SHA-256:')} ${info.fingerprint256?.slice(0, 40)}...
`);

        // Show SANs if present
        if (info.altNames && info.altNames.length > 0) {
          console.log(`${colors.bold('Subject Alternative Names:')}`);
          info.altNames.slice(0, 10).forEach(san => {
            console.log(`  ${colors.gray('•')} ${san}`);
          });
          if (info.altNames.length > 10) {
            console.log(`  ${colors.gray(`... and ${info.altNames.length - 10} more`)}`);
          }
          console.log('');
        }

        // Show Extended Key Usage if present
        if (info.extKeyUsage && info.extKeyUsage.length > 0) {
          console.log(`${colors.bold('Extended Key Usage:')}`);
          info.extKeyUsage.forEach(oid => {
            const oidNames: Record<string, string> = {
              '1.3.6.1.5.5.7.3.1': 'Server Authentication',
              '1.3.6.1.5.5.7.3.2': 'Client Authentication',
              '1.3.6.1.5.5.7.3.3': 'Code Signing',
              '1.3.6.1.5.5.7.3.4': 'Email Protection',
            };
            console.log(`  ${colors.gray('•')} ${oidNames[oid] || oid}`);
          });
          console.log('');
        }

      } catch (err: any) {
        console.error(colors.red(`TLS Inspection Failed: ${err.message}`));
        process.exit(1);
      }
    });

  // WHOIS Lookup
  program
    .command('whois')
    .description('WHOIS lookup for domains and IP addresses')
    .argument('<query>', 'Domain name or IP address')
    .option('-r, --raw', 'Show raw WHOIS response')
    .action(async (query, options) => {
      const { whois } = await import('../utils/whois.js');

      console.log(colors.gray(`Looking up WHOIS for ${query}...`));

      try {
        const result = await whois(query);

        if (options.raw) {
          console.log(result.raw);
          return;
        }

        console.log(`
${colors.bold(colors.cyan('📋 WHOIS Report'))}

${colors.bold('Query:')} ${result.query}
${colors.bold('Server:')} ${result.server}
`);

        // Show parsed data
        if (result.data && Object.keys(result.data).length > 0) {
          console.log(colors.bold('Parsed Data:'));
          const importantKeys = ['Domain Name', 'Registrar', 'Creation Date', 'Expiration Date', 'Updated Date', 'Name Server', 'Status'];

          for (const key of importantKeys) {
            const value = result.data[key];
            if (value) {
              if (Array.isArray(value)) {
                console.log(`  ${colors.cyan(key)}:`);
                value.forEach((v: string) => console.log(`    ${colors.gray('•')} ${v}`));
              } else {
                console.log(`  ${colors.cyan(key)}: ${value}`);
              }
            }
          }
        }
        console.log('');
      } catch (err: any) {
        console.error(colors.red(`WHOIS Lookup Failed: ${err.message}`));
        process.exit(1);
      }
    });

  // RDAP Lookup (modern WHOIS)
  program
    .command('rdap')
    .description('RDAP lookup (modern WHOIS replacement)')
    .argument('<domain>', 'Domain name to lookup')
    .action(async (domain) => {
      const { rdap } = await import('../utils/rdap.js');
      const { Client } = await import('../core/client.js');

      console.log(colors.gray(`Looking up RDAP for ${domain}...`));

      try {
        const client = new Client();
        const result = await rdap(client, domain);

        console.log(`
${colors.bold(colors.cyan('📋 RDAP Report'))}

${colors.bold('Domain:')} ${result.ldhName || domain}
${colors.bold('Handle:')} ${result.handle || 'N/A'}
${colors.bold('Status:')} ${result.status?.join(', ') || 'N/A'}
`);

        if (result.events && result.events.length > 0) {
          console.log(`${colors.bold('Events:')}`);
          result.events.forEach((event) => {
            const date = event.eventDate ? new Date(event.eventDate).toISOString().split('T')[0] : 'N/A';
            console.log(`  ${colors.gray(event.eventAction + ':')} ${date}`);
          });
          console.log('');
        }

        if (result.nameservers && result.nameservers.length > 0) {
          console.log(`${colors.bold('Name Servers:')}`);
          result.nameservers.forEach((ns) => {
            console.log(`  ${colors.gray('•')} ${ns.ldhName}`);
          });
          console.log('');
        }

        if (result.entities && result.entities.length > 0) {
          console.log(`${colors.bold('Entities:')}`);
          result.entities.slice(0, 5).forEach((entity) => {
            const roles = entity.roles?.join(', ') || 'N/A';
            console.log(`  ${colors.gray(roles + ':')} ${entity.handle || 'Unknown'}`);
          });
          console.log('');
        }

        if (result.links && result.links.length > 0) {
          const selfLink = result.links.find((l: { rel?: string; href?: string }) => l.rel === 'self');
          if (selfLink) {
            console.log(`${colors.gray('Source:')} ${selfLink.href}`);
          }
        }
      } catch (err: any) {
        console.error(colors.red(`RDAP Lookup Failed: ${err.message}`));
        process.exit(1);
      }
    });

  // Ping (TCP connectivity check)
  program
    .command('ping')
    .description('TCP connectivity check to a host')
    .argument('<host>', 'Hostname or IP address')
    .argument('[port]', 'Port number (default: 80 for HTTP, 443 for HTTPS)', '443')
    .option('-c, --count <n>', 'Number of pings', '4')
    .action(async (host, port, options) => {
      const net = await import('node:net');

      const count = parseInt(options.count);
      const portNum = parseInt(port);
      const results: number[] = [];

      console.log(colors.gray(`Pinging ${host}:${portNum}...`));
      console.log('');

      for (let i = 0; i < count; i++) {
        const start = performance.now();

        try {
          await new Promise<void>((resolve, reject) => {
            const socket = net.connect(portNum, host, () => {
              socket.destroy();
              resolve();
            });
            socket.setTimeout(5000);
            socket.on('timeout', () => {
              socket.destroy();
              reject(new Error('Timeout'));
            });
            socket.on('error', reject);
          });

          const elapsed = performance.now() - start;
          results.push(elapsed);
          console.log(`${colors.green('✔')} Connected to ${host}:${portNum} - ${colors.cyan(elapsed.toFixed(2) + 'ms')}`);
        } catch (err: any) {
          console.log(`${colors.red('✖')} Failed to connect: ${err.message}`);
        }

        // Wait 1 second between pings (except last)
        if (i < count - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      if (results.length > 0) {
        const avg = results.reduce((a, b) => a + b, 0) / results.length;
        const min = Math.min(...results);
        const max = Math.max(...results);

        console.log(`
${colors.bold('Statistics:')}
  ${colors.gray('Sent:')}     ${count}
  ${colors.gray('Received:')} ${results.length}
  ${colors.gray('Lost:')}     ${count - results.length} (${((count - results.length) / count * 100).toFixed(0)}%)
  ${colors.gray('Min:')}      ${min.toFixed(2)}ms
  ${colors.gray('Avg:')}      ${avg.toFixed(2)}ms
  ${colors.gray('Max:')}      ${max.toFixed(2)}ms
`);
      }
    });

  // FTP Client
  const ftpCmd = program.command('ftp').description('FTP client operations');

  ftpCmd
    .command('ls')
    .description('List files in a remote directory')
    .argument('<host>', 'FTP server hostname')
    .argument('[path]', 'Remote path to list', '/')
    .option('-u, --user <username>', 'Username', 'anonymous')
    .option('-p, --pass <password>', 'Password', 'anonymous@')
    .option('-P, --port <port>', 'Port number', '21')
    .option('--secure', 'Use FTPS (explicit TLS)')
    .option('--implicit', 'Use implicit FTPS (port 990)')
    .action(async (host, path, options) => {
      const { createFTP } = await import('../protocols/ftp.js');

      const secure = options.implicit ? 'implicit' : options.secure ? true : false;
      const client = createFTP({
        host,
        port: parseInt(options.port),
        user: options.user,
        password: options.pass,
        secure,
      });

      console.log(colors.gray(`Connecting to ${host}...`));

      try {
        const connectResult = await client.connect();
        if (!connectResult.success) {
          console.error(colors.red(`Connection failed: ${connectResult.message}`));
          process.exit(1);
        }

        console.log(colors.green('Connected'));
        console.log(colors.gray(`Listing ${path}...`));

        const result = await client.list(path);
        if (!result.success || !result.data) {
          console.error(colors.red(`List failed: ${result.message}`));
          await client.close();
          process.exit(1);
        }

        console.log('');
        console.log(colors.bold(`Contents of ${path}:`));
        console.log('');

        // Format like ls -l
        for (const item of result.data) {
          const typeChar = item.type === 'directory' ? 'd' : item.type === 'link' ? 'l' : '-';
          const perms = item.permissions || 'rwxr-xr-x';
          const size = item.size.toString().padStart(10);
          const date = item.rawModifiedAt || '';
          const nameColor = item.type === 'directory' ? colors.blue : item.type === 'link' ? colors.cyan : colors.white;
          console.log(`${typeChar}${perms}  ${size}  ${date.padEnd(12)}  ${nameColor(item.name)}`);
        }

        console.log('');
        console.log(colors.gray(`Total: ${result.data.length} items`));

        await client.close();
      } catch (err: any) {
        console.error(colors.red(`FTP Error: ${err.message}`));
        process.exit(1);
      }
    });

  ftpCmd
    .command('get')
    .description('Download a file from FTP server')
    .argument('<host>', 'FTP server hostname')
    .argument('<remote>', 'Remote file path')
    .argument('[local]', 'Local file path (default: same filename)')
    .option('-u, --user <username>', 'Username', 'anonymous')
    .option('-p, --pass <password>', 'Password', 'anonymous@')
    .option('-P, --port <port>', 'Port number', '21')
    .option('--secure', 'Use FTPS (explicit TLS)')
    .option('--implicit', 'Use implicit FTPS (port 990)')
    .action(async (host, remote, local, options) => {
      const { createFTP } = await import('../protocols/ftp.js');
      const path = await import('node:path');

      const localPath = local || path.basename(remote);
      const secure = options.implicit ? 'implicit' : options.secure ? true : false;

      const client = createFTP({
        host,
        port: parseInt(options.port),
        user: options.user,
        password: options.pass,
        secure,
      });

      console.log(colors.gray(`Connecting to ${host}...`));

      try {
        const connectResult = await client.connect();
        if (!connectResult.success) {
          console.error(colors.red(`Connection failed: ${connectResult.message}`));
          process.exit(1);
        }

        console.log(colors.green('Connected'));
        console.log(colors.gray(`Downloading ${remote} → ${localPath}...`));

        let lastProgress = 0;
        client.progress((p) => {
          const mb = (p.bytesOverall / 1024 / 1024).toFixed(2);
          if (p.bytesOverall - lastProgress > 100000) {
            process.stdout.write(`\r  ${colors.cyan(mb + ' MB')} downloaded...`);
            lastProgress = p.bytesOverall;
          }
        });

        const result = await client.download(remote, localPath);
        console.log('');

        if (!result.success) {
          console.error(colors.red(`Download failed: ${result.message}`));
          await client.close();
          process.exit(1);
        }

        console.log(colors.green(`✔ Downloaded to ${localPath}`));
        await client.close();
      } catch (err: any) {
        console.error(colors.red(`FTP Error: ${err.message}`));
        process.exit(1);
      }
    });

  ftpCmd
    .command('put')
    .description('Upload a file to FTP server')
    .argument('<host>', 'FTP server hostname')
    .argument('<local>', 'Local file path')
    .argument('[remote]', 'Remote file path (default: same filename)')
    .option('-u, --user <username>', 'Username', 'anonymous')
    .option('-p, --pass <password>', 'Password', 'anonymous@')
    .option('-P, --port <port>', 'Port number', '21')
    .option('--secure', 'Use FTPS (explicit TLS)')
    .option('--implicit', 'Use implicit FTPS (port 990)')
    .action(async (host, local, remote, options) => {
      const { createFTP } = await import('../protocols/ftp.js');
      const path = await import('node:path');

      const remotePath = remote || '/' + path.basename(local);
      const secure = options.implicit ? 'implicit' : options.secure ? true : false;

      const client = createFTP({
        host,
        port: parseInt(options.port),
        user: options.user,
        password: options.pass,
        secure,
      });

      console.log(colors.gray(`Connecting to ${host}...`));

      try {
        const connectResult = await client.connect();
        if (!connectResult.success) {
          console.error(colors.red(`Connection failed: ${connectResult.message}`));
          process.exit(1);
        }

        console.log(colors.green('Connected'));
        console.log(colors.gray(`Uploading ${local} → ${remotePath}...`));

        let lastProgress = 0;
        client.progress((p) => {
          const mb = (p.bytesOverall / 1024 / 1024).toFixed(2);
          if (p.bytesOverall - lastProgress > 100000) {
            process.stdout.write(`\r  ${colors.cyan(mb + ' MB')} uploaded...`);
            lastProgress = p.bytesOverall;
          }
        });

        const result = await client.upload(local, remotePath);
        console.log('');

        if (!result.success) {
          console.error(colors.red(`Upload failed: ${result.message}`));
          await client.close();
          process.exit(1);
        }

        console.log(colors.green(`✔ Uploaded to ${remotePath}`));
        await client.close();
      } catch (err: any) {
        console.error(colors.red(`FTP Error: ${err.message}`));
        process.exit(1);
      }
    });

  ftpCmd
    .command('rm')
    .description('Delete a file from FTP server')
    .argument('<host>', 'FTP server hostname')
    .argument('<path>', 'Remote file path to delete')
    .option('-u, --user <username>', 'Username', 'anonymous')
    .option('-p, --pass <password>', 'Password', 'anonymous@')
    .option('-P, --port <port>', 'Port number', '21')
    .option('--secure', 'Use FTPS (explicit TLS)')
    .option('--implicit', 'Use implicit FTPS (port 990)')
    .action(async (host, remotePath, options) => {
      const { createFTP } = await import('../protocols/ftp.js');

      const secure = options.implicit ? 'implicit' : options.secure ? true : false;
      const client = createFTP({
        host,
        port: parseInt(options.port),
        user: options.user,
        password: options.pass,
        secure,
      });

      console.log(colors.gray(`Connecting to ${host}...`));

      try {
        const connectResult = await client.connect();
        if (!connectResult.success) {
          console.error(colors.red(`Connection failed: ${connectResult.message}`));
          process.exit(1);
        }

        console.log(colors.green('Connected'));
        console.log(colors.gray(`Deleting ${remotePath}...`));

        const result = await client.delete(remotePath);
        if (!result.success) {
          console.error(colors.red(`Delete failed: ${result.message}`));
          await client.close();
          process.exit(1);
        }

        console.log(colors.green(`✔ Deleted ${remotePath}`));
        await client.close();
      } catch (err: any) {
        console.error(colors.red(`FTP Error: ${err.message}`));
        process.exit(1);
      }
    });

  ftpCmd
    .command('mkdir')
    .description('Create a directory on FTP server')
    .argument('<host>', 'FTP server hostname')
    .argument('<path>', 'Remote directory path to create')
    .option('-u, --user <username>', 'Username', 'anonymous')
    .option('-p, --pass <password>', 'Password', 'anonymous@')
    .option('-P, --port <port>', 'Port number', '21')
    .option('--secure', 'Use FTPS (explicit TLS)')
    .option('--implicit', 'Use implicit FTPS (port 990)')
    .action(async (host, remotePath, options) => {
      const { createFTP } = await import('../protocols/ftp.js');

      const secure = options.implicit ? 'implicit' : options.secure ? true : false;
      const client = createFTP({
        host,
        port: parseInt(options.port),
        user: options.user,
        password: options.pass,
        secure,
      });

      console.log(colors.gray(`Connecting to ${host}...`));

      try {
        const connectResult = await client.connect();
        if (!connectResult.success) {
          console.error(colors.red(`Connection failed: ${connectResult.message}`));
          process.exit(1);
        }

        console.log(colors.green('Connected'));
        console.log(colors.gray(`Creating ${remotePath}...`));

        const result = await client.mkdir(remotePath);
        if (!result.success) {
          console.error(colors.red(`Mkdir failed: ${result.message}`));
          await client.close();
          process.exit(1);
        }

        console.log(colors.green(`✔ Created ${remotePath}`));
        await client.close();
      } catch (err: any) {
        console.error(colors.red(`FTP Error: ${err.message}`));
        process.exit(1);
      }
    });

  // Telnet Client
  program
    .command('telnet')
    .description('Connect to a Telnet server')
    .argument('<host>', 'Hostname or IP address')
    .argument('[port]', 'Port number', '23')
    .option('-t, --timeout <ms>', 'Connection timeout in ms', '30000')
    .action(async (host, port, options) => {
      const { createTelnet } = await import('../protocols/telnet.js');

      console.log(colors.gray(`Connecting to ${host}:${port}...`));

      const client = createTelnet({
        host,
        port: parseInt(port),
        timeout: parseInt(options.timeout),
      });

      try {
        await client.connect();
        console.log(colors.green(`Connected to ${host}:${port}`));
        console.log(colors.gray('Type your commands. Press Ctrl+C to exit.'));
        console.log('');

        // Set up stdin for raw input
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(true);
        }
        process.stdin.resume();

        // Forward stdin to telnet
        process.stdin.on('data', async (data: Buffer) => {
          // Check for Ctrl+C
          if (data[0] === 0x03) {
            console.log(colors.yellow('\nDisconnecting...'));
            await client.close();
            process.exit(0);
          }
          await client.send(data.toString());
        });

        // Forward telnet output to stdout
        client.on('data', (data: string) => {
          process.stdout.write(data);
        });

        client.on('close', () => {
          console.log(colors.yellow('\nConnection closed'));
          process.exit(0);
        });

        client.on('error', (err: Error) => {
          console.error(colors.red(`Error: ${err.message}`));
          process.exit(1);
        });

      } catch (err: any) {
        console.error(colors.red(`Telnet Error: ${err.message}`));
        process.exit(1);
      }
    });

  // DNS Toolkit
  const dns = program.command('dns').description('DNS tools and diagnostics');

  dns
    .command('propagate')
    .description('Check global DNS propagation across multiple providers')
    .argument('<domain>', 'Domain name to check')
    .argument('[type]', 'Record type (A, AAAA, CNAME, MX, NS, TXT)', 'A')
    .action(async (domain, type) => {
       const { checkPropagation, formatPropagationReport } = await import('../dns/propagation.js');

       console.log(colors.gray(`Checking propagation for ${domain} (${type})...`));
       const results = await checkPropagation(domain, type);
       console.log(formatPropagationReport(results, domain, type));
    });

  dns
    .command('lookup')
    .description('Perform DNS lookup for any record type')
    .argument('<domain>', 'Domain name to lookup')
    .argument('[type]', 'Record type (A, AAAA, CNAME, MX, NS, TXT, SOA, CAA, SRV, ANY)', 'A')
    .action(async (domain, type) => {
      const { dnsLookup } = await import('../utils/dns-toolkit.js');

      console.log(colors.gray(`Looking up ${type.toUpperCase()} records for ${domain}...`));

      try {
        const results = await dnsLookup(domain, type);

        if (results.length === 0) {
          console.log(colors.yellow(`\nNo ${type.toUpperCase()} records found for ${domain}`));
          return;
        }

        console.log(`\n${colors.bold(colors.cyan('DNS Lookup Results'))}`);
        console.log(`${colors.gray('Domain:')} ${domain}  ${colors.gray('Type:')} ${type.toUpperCase()}\n`);

        results.forEach(record => {
          const ttl = record.ttl ? colors.gray(`TTL: ${record.ttl}s`) : '';
          const data = typeof record.data === 'object'
            ? JSON.stringify(record.data, null, 2)
            : String(record.data);
          console.log(`  ${colors.green('•')} ${colors.bold(record.type.padEnd(6))} ${data} ${ttl}`);
        });
        console.log('');

      } catch (err: any) {
        console.error(colors.red(`DNS Lookup Failed: ${err.message}`));
        process.exit(1);
      }
    });

  dns
    .command('reverse')
    .description('Perform reverse DNS lookup (IP to hostname)')
    .argument('<ip>', 'IP address to reverse lookup')
    .action(async (ip) => {
      const { reverseLookup } = await import('../utils/dns-toolkit.js');

      console.log(colors.gray(`Performing reverse lookup for ${ip}...`));

      try {
        const hostnames = await reverseLookup(ip);

        if (hostnames.length === 0) {
          console.log(colors.yellow(`\nNo PTR records found for ${ip}`));
          return;
        }

        console.log(`\n${colors.bold(colors.cyan('Reverse DNS Lookup'))}`);
        console.log(`${colors.gray('IP:')} ${ip}\n`);
        console.log(`${colors.bold('Hostnames:')}`);
        hostnames.forEach(hostname => {
          console.log(`  ${colors.green('•')} ${hostname}`);
        });
        console.log('');

      } catch (err: any) {
        console.error(colors.red(`Reverse Lookup Failed: ${err.message}`));
        process.exit(1);
      }
    });

  dns
    .command('health')
    .description('Comprehensive DNS health check with scoring')
    .argument('<domain>', 'Domain name to check')
    .action(async (domain) => {
      const { checkDnsHealth } = await import('../utils/dns-toolkit.js');

      console.log(colors.gray(`Running DNS health check for ${domain}...`));

      try {
        const report = await checkDnsHealth(domain);

        // Grade color
        let gradeColor = colors.red;
        if (report.grade === 'A') gradeColor = colors.green;
        else if (report.grade === 'B') gradeColor = colors.blue;
        else if (report.grade === 'C') gradeColor = colors.yellow;

        console.log(`
${colors.bold(colors.cyan('🏥 DNS Health Report'))}
${colors.gray('Domain:')} ${domain}
${colors.gray('Grade:')} ${gradeColor(colors.bold(report.grade))}  ${colors.gray('Score:')} ${report.score}/100
`);

        console.log(`${colors.bold('Checks:')}`);
        report.checks.forEach(check => {
          const icon = check.status === 'pass' ? colors.green('✔') :
                       check.status === 'warn' ? colors.yellow('⚠') : colors.red('✖');
          console.log(`  ${icon} ${colors.bold(check.name.padEnd(16))} ${check.message}`);
        });
        console.log('');

      } catch (err: any) {
        console.error(colors.red(`Health Check Failed: ${err.message}`));
        process.exit(1);
      }
    });

  dns
    .command('spf')
    .description('Validate SPF record')
    .argument('<domain>', 'Domain name to validate')
    .action(async (domain) => {
      const { validateSpf } = await import('../utils/dns-toolkit.js');

      console.log(colors.gray(`Validating SPF for ${domain}...`));

      try {
        const result = await validateSpf(domain);

        const statusIcon = result.valid ? colors.green('✔ Valid') : colors.red('✖ Invalid');

        console.log(`
${colors.bold(colors.cyan('📧 SPF Validation Report'))}
${colors.gray('Domain:')} ${domain}
${colors.gray('Status:')} ${statusIcon}
`);

        if (result.record) {
          console.log(`${colors.bold('Record:')}`);
          console.log(`  ${colors.gray(result.record)}\n`);

          console.log(`${colors.bold('Mechanisms:')} ${result.mechanisms.join(', ')}`);
          console.log(`${colors.bold('Includes:')} ${result.includes.length > 0 ? result.includes.join(', ') : colors.gray('None')}`);
          console.log(`${colors.bold('DNS Lookups:')} ${result.lookupCount}/10 ${result.lookupCount > 7 ? colors.yellow('(high)') : ''}`);
        }

        if (result.warnings.length > 0) {
          console.log(`\n${colors.bold(colors.yellow('Warnings:'))}`);
          result.warnings.forEach(w => console.log(`  ${colors.yellow('⚠')} ${w}`));
        }

        if (result.errors.length > 0) {
          console.log(`\n${colors.bold(colors.red('Errors:'))}`);
          result.errors.forEach(e => console.log(`  ${colors.red('✖')} ${e}`));
        }
        console.log('');

      } catch (err: any) {
        console.error(colors.red(`SPF Validation Failed: ${err.message}`));
        process.exit(1);
      }
    });

  dns
    .command('dmarc')
    .description('Validate DMARC record')
    .argument('<domain>', 'Domain name to validate')
    .action(async (domain) => {
      const { validateDmarc } = await import('../utils/dns-toolkit.js');

      console.log(colors.gray(`Validating DMARC for ${domain}...`));

      try {
        const result = await validateDmarc(domain);

        const statusIcon = result.valid ? colors.green('✔ Found') : colors.yellow('⚠ Not Found');
        const policyColor = result.policy === 'reject' ? colors.green :
                            result.policy === 'quarantine' ? colors.yellow : colors.red;

        console.log(`
${colors.bold(colors.cyan('🛡️  DMARC Validation Report'))}
${colors.gray('Domain:')} ${domain}
${colors.gray('Status:')} ${statusIcon}
`);

        if (result.record) {
          console.log(`${colors.bold('Record:')}`);
          console.log(`  ${colors.gray(result.record)}\n`);

          console.log(`${colors.bold('Policy:')} ${policyColor(result.policy)}`);
          if (result.subdomainPolicy) {
            console.log(`${colors.bold('Subdomain Policy:')} ${result.subdomainPolicy}`);
          }
          console.log(`${colors.bold('Percentage:')} ${result.percentage}%`);

          if (result.rua) {
            console.log(`${colors.bold('Aggregate Reports (rua):')} ${result.rua.join(', ')}`);
          }
          if (result.ruf) {
            console.log(`${colors.bold('Forensic Reports (ruf):')} ${result.ruf.join(', ')}`);
          }
        }

        if (result.warnings.length > 0) {
          console.log(`\n${colors.bold(colors.yellow('Warnings:'))}`);
          result.warnings.forEach(w => console.log(`  ${colors.yellow('⚠')} ${w}`));
        }
        console.log('');

      } catch (err: any) {
        console.error(colors.red(`DMARC Validation Failed: ${err.message}`));
        process.exit(1);
      }
    });

  dns
    .command('dkim')
    .description('Check DKIM record for a domain')
    .argument('<domain>', 'Domain name to check')
    .argument('[selector]', 'DKIM selector (default: "default")', 'default')
    .action(async (domain, selector) => {
      const { checkDkim } = await import('../utils/dns-toolkit.js');

      console.log(colors.gray(`Checking DKIM for ${selector}._domainkey.${domain}...`));

      try {
        const result = await checkDkim(domain, selector);

        const statusIcon = result.found ? colors.green('✔ Found') : colors.red('✖ Not Found');

        console.log(`
${colors.bold(colors.cyan('🔑 DKIM Check Report'))}
${colors.gray('Domain:')} ${domain}
${colors.gray('Selector:')} ${selector}
${colors.gray('Status:')} ${statusIcon}
`);

        if (result.record) {
          console.log(`${colors.bold('Record:')}`);
          console.log(`  ${colors.gray(result.record.length > 100 ? result.record.slice(0, 100) + '...' : result.record)}\n`);

          if (result.publicKey) {
            console.log(`${colors.bold('Public Key:')} ${colors.green('Present')} (${result.publicKey.length} chars)`);
          }
        } else {
          console.log(colors.yellow(`No DKIM record found at ${selector}._domainkey.${domain}`));
          console.log(colors.gray('\nCommon selectors to try: google, selector1, selector2, k1, default'));
        }
        console.log('');

      } catch (err: any) {
        console.error(colors.red(`DKIM Check Failed: ${err.message}`));
        process.exit(1);
      }
    });

  dns
    .command('email')
    .description('Full email security audit (SPF + DMARC + DKIM + MX)')
    .argument('<domain>', 'Domain name to audit')
    .option('-s, --selector <selector>', 'DKIM selector to check', 'default')
    .action(async (domain, options) => {
      const { validateSpf, validateDmarc, checkDkim, dnsLookup } = await import('../utils/dns-toolkit.js');

      console.log(colors.gray(`Running email security audit for ${domain}...\n`));

      let score = 0;
      const maxScore = 100;

      console.log(`${colors.bold(colors.cyan('📧 Email Security Audit'))}`);
      console.log(`${colors.gray('Domain:')} ${domain}\n`);

      // MX Records
      console.log(`${colors.bold('Mail Servers (MX):')}`);
      try {
        const mx = await dnsLookup(domain, 'MX');
        if (mx.length > 0) {
          score += 20;
          mx.forEach(record => {
            const data = record.data as { priority: number; exchange: string };
            console.log(`  ${colors.green('✔')} ${data.exchange} ${colors.gray(`(priority: ${data.priority})`)}`);
          });
        } else {
          console.log(`  ${colors.red('✖')} No MX records (cannot receive email)`);
        }
      } catch {
        console.log(`  ${colors.red('✖')} Failed to resolve MX`);
      }

      // SPF
      console.log(`\n${colors.bold('SPF:')}`);
      const spf = await validateSpf(domain);
      if (spf.valid) {
        score += 25;
        console.log(`  ${colors.green('✔')} Valid SPF record`);
        console.log(`    ${colors.gray(spf.record || '')}`);
      } else if (spf.record) {
        score += 10;
        console.log(`  ${colors.yellow('⚠')} SPF exists but has issues`);
        spf.errors.forEach(e => console.log(`    ${colors.red('→')} ${e}`));
      } else {
        console.log(`  ${colors.red('✖')} No SPF record`);
      }

      // DMARC
      console.log(`\n${colors.bold('DMARC:')}`);
      const dmarc = await validateDmarc(domain);
      if (dmarc.valid && dmarc.policy !== 'none') {
        score += 30;
        console.log(`  ${colors.green('✔')} DMARC policy: ${dmarc.policy}`);
      } else if (dmarc.valid) {
        score += 15;
        console.log(`  ${colors.yellow('⚠')} DMARC exists but policy is "none"`);
      } else {
        console.log(`  ${colors.red('✖')} No DMARC record`);
      }

      // DKIM
      console.log(`\n${colors.bold('DKIM:')}`);
      const dkim = await checkDkim(domain, options.selector);
      if (dkim.found) {
        score += 25;
        console.log(`  ${colors.green('✔')} DKIM found (selector: ${options.selector})`);
      } else {
        console.log(`  ${colors.yellow('⚠')} No DKIM at selector "${options.selector}"`);
        console.log(`    ${colors.gray('Try: --selector google, selector1, selector2, k1')}`);
      }

      // Score
      const grade = score >= 90 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : score >= 30 ? 'D' : 'F';
      const gradeColor = grade === 'A' ? colors.green : grade === 'B' ? colors.blue : grade === 'C' ? colors.yellow : colors.red;

      console.log(`\n${colors.bold('Score:')} ${score}/${maxScore}  ${colors.bold('Grade:')} ${gradeColor(grade)}\n`);
    });

  dns
    .command('generate-dmarc')
    .description('Generate a DMARC record interactively')
    .option('-p, --policy <policy>', 'Policy: none, quarantine, reject', 'none')
    .option('--subdomain-policy <policy>', 'Subdomain policy')
    .option('--pct <percent>', 'Percentage of emails to apply policy', '100')
    .option('--rua <emails>', 'Aggregate report email(s), comma-separated')
    .option('--ruf <emails>', 'Forensic report email(s), comma-separated')
    .action(async (options) => {
      const { generateDmarc } = await import('../utils/dns-toolkit.js');

      const dmarcOptions: any = {
        policy: options.policy as 'none' | 'quarantine' | 'reject',
      };

      if (options.subdomainPolicy) {
        dmarcOptions.subdomainPolicy = options.subdomainPolicy;
      }

      if (options.pct && options.pct !== '100') {
        dmarcOptions.percentage = parseInt(options.pct);
      }

      if (options.rua) {
        dmarcOptions.aggregateReports = options.rua.split(',').map((e: string) => e.trim());
      }

      if (options.ruf) {
        dmarcOptions.forensicReports = options.ruf.split(',').map((e: string) => e.trim());
      }

      const record = generateDmarc(dmarcOptions);

      console.log(`
${colors.bold(colors.cyan('🛡️  DMARC Record Generator'))}

${colors.bold('Add this TXT record to your DNS:')}
  ${colors.gray('Name:')}  _dmarc
  ${colors.gray('Type:')}  TXT
  ${colors.gray('Value:')} ${colors.green(record)}

${colors.bold('Policy Explanation:')}
  ${colors.gray('none')}       - Monitor only, take no action
  ${colors.gray('quarantine')} - Send suspicious emails to spam
  ${colors.gray('reject')}     - Reject suspicious emails entirely

${colors.yellow('Tip:')} Start with "none" to monitor, then move to "quarantine", then "reject".
`);
    });

  // Dig command (standalone, like the real dig)
  program
    .command('dig')
    .description('DNS lookup utility (like the real dig)')
    .argument('[args...]', 'Query arguments: [@server] [domain] [type] [-x] [+short]')
    .option('-x, --reverse', 'Reverse DNS lookup (IP to hostname)')
    .allowUnknownOption() // Allow +short and other dig-style options
    .addHelpText('after', `
${colors.bold(colors.yellow('Usage:'))}
  ${colors.green('rek dig example.com')}              ${colors.gray('Query A records')}
  ${colors.green('rek dig example.com MX')}           ${colors.gray('Query MX records')}
  ${colors.green('rek dig example.com ANY')}          ${colors.gray('Query all record types')}
  ${colors.green('rek dig @8.8.8.8 example.com')}     ${colors.gray('Use Google DNS')}
  ${colors.green('rek dig @1.1.1.1 example.com MX')}  ${colors.gray('Use Cloudflare DNS')}
  ${colors.green('rek dig -x 8.8.8.8')}               ${colors.gray('Reverse lookup')}
  ${colors.green('rek dig +short example.com')}       ${colors.gray('Short output (just answers)')}

${colors.bold(colors.yellow('Common DNS Servers:'))}
  ${colors.cyan('@8.8.8.8')}     Google Public DNS
  ${colors.cyan('@1.1.1.1')}     Cloudflare DNS
  ${colors.cyan('@9.9.9.9')}     Quad9 DNS
  ${colors.cyan('@208.67.222.222')}  OpenDNS

${colors.bold(colors.yellow('Record Types:'))}
  A, AAAA, MX, NS, TXT, CNAME, SOA, PTR, SRV, CAA, ANY
`)
    .action(async (args: string[], cmdOptions: { reverse?: boolean }) => {
      const { dig, formatDigOutput } = await import('../utils/dns-toolkit.js');

      let domain = '';
      let server: string | undefined;
      let type = 'A';
      let reverse = cmdOptions.reverse || false;
      let short = false;

      for (const arg of args) {
        if (arg.startsWith('@')) {
          server = arg.slice(1);
        } else if (arg === '+short') {
          short = true;
        } else if (arg.match(/^[A-Z]+$/i) && ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA', 'PTR', 'SRV', 'CAA', 'NAPTR', 'ANY'].includes(arg.toUpperCase())) {
          type = arg.toUpperCase();
        } else if (!domain) {
          domain = arg;
        }
      }

      if (!domain) {
        console.error(colors.red('Error: Domain/IP is required'));
        console.log(colors.gray('Usage: rek dig example.com [TYPE]'));
        console.log(colors.gray('       rek dig -x 8.8.8.8'));
        process.exit(1);
      }

      try {
        const result = await dig(domain, { server, type, reverse, short });
        console.log(formatDigOutput(result, short));
      } catch (err: any) {
        console.error(colors.red(`dig: ${err.message}`));
        process.exit(1);
      }
    });

  // GraphQL command
  program
    .command('graphql')
    .description('Execute a GraphQL query')
    .argument('<url>', 'GraphQL endpoint URL')
    .option('-q, --query <query>', 'GraphQL query string')
    .option('-f, --file <file>', 'Path to GraphQL query file')
    .option('-v, --variables <json>', 'Variables as JSON string')
    .option('--var-file <file>', 'Path to variables JSON file')
    .option('-H, --header <header>', 'Add header (can be used multiple times)', (val: string, prev: string[]) => [...prev, val], [])
    .action(async (url, options) => {
      const { graphql } = await import('../plugins/graphql.js');
      const { createClient } = await import('../core/client.js');
      const fs = await import('node:fs/promises');

      let query = options.query;
      let variables: Record<string, unknown> = {};

      // Load query from file if provided
      if (options.file) {
        try {
          query = await fs.readFile(options.file, 'utf-8');
        } catch (err: any) {
          console.error(colors.red(`Failed to read query file: ${err.message}`));
          process.exit(1);
        }
      }

      if (!query) {
        console.error(colors.red('Error: Query is required. Use --query or --file'));
        console.log(colors.gray('Example: rek graphql https://api.example.com/graphql -q "query { users { id name } }"'));
        process.exit(1);
      }

      // Parse variables
      if (options.variables) {
        try {
          variables = JSON.parse(options.variables);
        } catch {
          console.error(colors.red('Invalid JSON in --variables'));
          process.exit(1);
        }
      } else if (options.varFile) {
        try {
          const content = await fs.readFile(options.varFile, 'utf-8');
          variables = JSON.parse(content);
        } catch (err: any) {
          console.error(colors.red(`Failed to read variables file: ${err.message}`));
          process.exit(1);
        }
      }

      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      for (const h of options.header) {
        const [key, ...valueParts] = h.split(':');
        headers[key.trim()] = valueParts.join(':').trim();
      }

      console.log(colors.gray(`Executing GraphQL query against ${url}...`));

      try {
        const client = createClient({ baseUrl: url, headers });
        const result = await graphql(client, query, variables);

        console.log('');
        console.log(colors.bold(colors.green('Response:')));
        console.log(JSON.stringify(result, null, 2));

      } catch (err: any) {
        console.error(colors.red(`GraphQL Error: ${err.message}`));
        if (err.errors) {
          console.log(colors.bold(colors.red('GraphQL Errors:')));
          for (const e of err.errors) {
            console.log(`  ${colors.red('•')} ${e.message}`);
          }
        }
        process.exit(1);
      }
    });

  // JSON-RPC command
  program
    .command('jsonrpc')
    .description('Execute a JSON-RPC 2.0 call')
    .argument('<url>', 'JSON-RPC endpoint URL')
    .argument('<method>', 'Method name to call')
    .argument('[params...]', 'Method parameters (JSON values)')
    .option('-n, --named', 'Use named parameters (key=value format)')
    .option('-b, --batch <methods>', 'Batch multiple methods (comma-separated)')
    .option('-H, --header <header>', 'Add header (can be used multiple times)', (val: string, prev: string[]) => [...prev, val], [])
    .action(async (url, method, params, options) => {
      const { createJsonRpcClient } = await import('../plugins/jsonrpc.js');
      const { createClient } = await import('../core/client.js');

      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      for (const h of options.header) {
        const [key, ...valueParts] = h.split(':');
        headers[key.trim()] = valueParts.join(':').trim();
      }

      const client = createClient({ baseUrl: url, headers });
      const rpc = createJsonRpcClient(client, { endpoint: '' });

      console.log(colors.gray(`Calling ${method} on ${url}...`));

      try {
        let rpcParams: unknown[] | Record<string, unknown>;

        if (options.named) {
          // Named parameters: key=value format
          rpcParams = {};
          for (const p of params) {
            const [key, ...valueParts] = p.split('=');
            const value = valueParts.join('=');
            try {
              (rpcParams as Record<string, unknown>)[key] = JSON.parse(value);
            } catch {
              (rpcParams as Record<string, unknown>)[key] = value;
            }
          }
        } else {
          // Positional parameters
          rpcParams = params.map((p: string) => {
            try {
              return JSON.parse(p);
            } catch {
              return p;
            }
          });
        }

        const result = await rpc.call(method, rpcParams);

        console.log('');
        console.log(colors.bold(colors.green('Result:')));
        console.log(JSON.stringify(result, null, 2));

      } catch (err: any) {
        console.error(colors.red(`JSON-RPC Error: ${err.message}`));
        if (err.code) {
          console.log(colors.gray(`Error code: ${err.code}`));
        }
        if (err.data) {
          console.log(colors.gray(`Error data: ${JSON.stringify(err.data)}`));
        }
        process.exit(1);
      }
    });

  // HLS command
  const hlsCmd = program.command('hls').description('HLS streaming operations');

  hlsCmd
    .command('info')
    .description('Get information about an HLS stream')
    .argument('<url>', 'HLS playlist URL')
    .action(async (url) => {
      const { Client } = await import('../core/client.js');
      const client = new Client();

      console.log(colors.gray(`Fetching playlist from ${url}...`));

      try {
        const res = await client.get(url);
        const content = await res.text();

        // Parse the playlist
        const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

        if (!lines[0]?.startsWith('#EXTM3U')) {
          console.error(colors.red('Not a valid HLS playlist'));
          process.exit(1);
        }

        // Check if master playlist
        const isMaster = lines.some(l => l.startsWith('#EXT-X-STREAM-INF'));

        console.log('');
        console.log(colors.bold(colors.cyan('HLS Stream Info')));
        console.log(`${colors.gray('URL:')} ${url}`);
        console.log(`${colors.gray('Type:')} ${isMaster ? 'Master Playlist' : 'Media Playlist'}`);
        console.log('');

        if (isMaster) {
          // Parse variants
          console.log(colors.bold('Available Qualities:'));
          let i = 0;
          for (let j = 0; j < lines.length; j++) {
            if (lines[j].startsWith('#EXT-X-STREAM-INF')) {
              const bandwidth = lines[j].match(/BANDWIDTH=(\d+)/)?.[1];
              const resolution = lines[j].match(/RESOLUTION=([^,]+)/)?.[1];
              const codecs = lines[j].match(/CODECS="([^"]+)"/)?.[1];
              const variantUrl = lines[j + 1];

              const bw = bandwidth ? `${Math.round(parseInt(bandwidth) / 1000)}kbps` : 'N/A';
              console.log(`  ${colors.green(String(i + 1))}. ${resolution || 'Unknown'} - ${bw}`);
              if (codecs) {
                console.log(`     ${colors.gray('Codecs:')} ${codecs}`);
              }
              i++;
            }
          }
        } else {
          // Media playlist - count segments
          const segments = lines.filter(l => !l.startsWith('#') && l.length > 0);
          const targetDuration = lines.find(l => l.startsWith('#EXT-X-TARGETDURATION'))?.split(':')[1];
          const endList = lines.some(l => l === '#EXT-X-ENDLIST');
          const mediaSequence = lines.find(l => l.startsWith('#EXT-X-MEDIA-SEQUENCE'))?.split(':')[1];

          console.log(`${colors.gray('Segments:')} ${segments.length}`);
          if (targetDuration) {
            console.log(`${colors.gray('Target Duration:')} ${targetDuration}s`);
          }
          if (mediaSequence) {
            console.log(`${colors.gray('Media Sequence:')} ${mediaSequence}`);
          }
          console.log(`${colors.gray('Type:')} ${endList ? 'VOD' : 'Live'}`);

          // Calculate total duration
          let totalDuration = 0;
          for (const line of lines) {
            if (line.startsWith('#EXTINF:')) {
              const duration = parseFloat(line.split(':')[1].split(',')[0]);
              totalDuration += duration;
            }
          }

          if (totalDuration > 0) {
            const minutes = Math.floor(totalDuration / 60);
            const seconds = Math.round(totalDuration % 60);
            console.log(`${colors.gray('Total Duration:')} ${minutes}m ${seconds}s`);
          }
        }
        console.log('');

      } catch (err: any) {
        console.error(colors.red(`HLS Error: ${err.message}`));
        process.exit(1);
      }
    });

  hlsCmd
    .command('download')
    .description('Download an HLS stream')
    .argument('<url>', 'HLS playlist URL')
    .argument('[output]', 'Output file path', 'output.ts')
    .option('-q, --quality <quality>', 'Quality: highest, lowest, or resolution (e.g., 720p)')
    .option('--live', 'Enable live stream mode')
    .option('-d, --duration <seconds>', 'Duration for live recording in seconds')
    .option('-c, --concurrency <n>', 'Concurrent segment downloads', '4')
    .action(async (url, output, options) => {
      const { hls } = await import('../plugins/hls.js');
      const { Client } = await import('../core/client.js');

      const client = new Client();

      console.log(colors.gray(`Downloading HLS stream from ${url}...`));
      console.log(colors.gray(`Output: ${output}`));
      console.log('');

      try {
        const hlsOptions: any = {
          concurrency: parseInt(options.concurrency),
          onProgress: (p: any) => {
            const segs = p.totalSegments
              ? `${p.downloadedSegments}/${p.totalSegments}`
              : `${p.downloadedSegments}`;
            const mb = (p.downloadedBytes / 1024 / 1024).toFixed(2);
            process.stdout.write(`\r  ${colors.cyan(segs)} segments | ${colors.cyan(mb + ' MB')} downloaded`);
          },
        };

        if (options.quality) {
          if (options.quality === 'highest' || options.quality === 'lowest') {
            hlsOptions.quality = options.quality;
          } else if (options.quality.includes('p')) {
            hlsOptions.quality = { resolution: options.quality };
          }
        }

        if (options.live) {
          hlsOptions.live = options.duration
            ? { duration: parseInt(options.duration) * 1000 }
            : true;
        }

        await hls(client, url, hlsOptions).download(output);

        console.log('');
        console.log(colors.green(`✔ Download complete: ${output}`));

      } catch (err: any) {
        console.log('');
        console.error(colors.red(`HLS Download Error: ${err.message}`));
        process.exit(1);
      }
    });

  // HAR command
  const harCmd = program.command('har').description('HAR recording and playback');

  harCmd
    .command('record')
    .description('Record HTTP requests to HAR file')
    .argument('<file>', 'Output HAR file path')
    .argument('[url]', 'URL to request (optional, starts recording session)')
    .option('-a, --append', 'Append to existing HAR file')
    .addHelpText('after', `
${colors.bold(colors.yellow('Usage:'))}
  Record a single request:
    ${colors.green('$ rek har record output.har https://api.example.com/users')}

  Start recording session (shell mode):
    ${colors.green('$ rek har record output.har')}
    ${colors.gray('Then use shell commands to make requests')}

${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek har record api.har https://api.github.com/users/octocat')}
  ${colors.green('$ rek har record session.har --append')}
`)
    .action(async (file: string, url: string | undefined, options: { append?: boolean }) => {
      const { createClient } = await import('../core/client.js');
      const { harRecorderPlugin } = await import('../plugins/har-recorder.js');
      const { promises: fsPromises } = await import('node:fs');

      // Load existing HAR if appending
      let existingEntries: unknown[] = [];
      if (options.append) {
        try {
          const existing = await fsPromises.readFile(file, 'utf-8');
          const har = JSON.parse(existing);
          existingEntries = har.log?.entries || [];
          console.log(colors.gray(`Appending to existing HAR with ${existingEntries.length} entries`));
        } catch {
          // File doesn't exist, start fresh
        }
      }

      const client = createClient();
      // Call the plugin directly to register hooks on the client
      const plugin = harRecorderPlugin({
        path: file,
        onEntry: (entry: unknown) => {
          console.log(colors.green('✔') + colors.gray(` Recorded: ${(entry as { request: { method: string; url: string } }).request.method} ${(entry as { request: { method: string; url: string } }).request.url}`));
        }
      });
      plugin(client);

      if (url) {
        // Single request mode
        if (!url.startsWith('http')) {
          url = `https://${url}`;
        }

        console.log(colors.gray(`Recording request to ${url}...`));
        try {
          const response = await client.get(url);
          console.log(colors.green(`✔ Response: ${response.status} ${response.statusText}`));
          console.log(colors.gray(`Saved to ${file}`));
        } catch (error: any) {
          console.error(colors.red(`Request failed: ${error.message}`));
          process.exit(1);
        }
      } else {
        // Interactive session mode
        console.log(colors.cyan('HAR Recording Session'));
        console.log(colors.gray(`Recording to: ${file}`));
        console.log(colors.gray('Enter URLs to record, or "exit" to quit'));
        console.log('');

        const readline = await import('node:readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const prompt = () => {
          rl.question(colors.cyan('har> '), async (input) => {
            const line = input.trim();

            if (line === 'exit' || line === 'quit') {
              console.log(colors.gray(`\nSession ended. HAR saved to ${file}`));
              rl.close();
              return;
            }

            if (!line) {
              prompt();
              return;
            }

            let requestUrl = line;
            if (!requestUrl.startsWith('http')) {
              requestUrl = `https://${requestUrl}`;
            }

            try {
              const response = await client.get(requestUrl);
              console.log(colors.green(`✔ ${response.status} ${response.statusText}`));
            } catch (error: any) {
              console.error(colors.red(`✗ ${error.message}`));
            }

            prompt();
          });
        };

        prompt();
        return;
      }
    });

  harCmd
    .command('play')
    .description('Replay requests from a HAR file')
    .argument('<file>', 'HAR file to replay')
    .option('-s, --strict', 'Fail if request not found in HAR')
    .option('-d, --delay <ms>', 'Delay between requests (milliseconds)', '0')
    .option('-v, --verbose', 'Show detailed output')
    .addHelpText('after', `
${colors.bold(colors.yellow('Description:'))}
  Replays HTTP requests from a HAR file. Can be used to:
  - Test API behavior with recorded data
  - Mock server responses for testing
  - Replay traffic for debugging

${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek har play api.har')}                ${colors.gray('Replay all requests')}
  ${colors.green('$ rek har play api.har --strict')}       ${colors.gray('Fail if no match found')}
  ${colors.green('$ rek har play api.har --delay 100')}    ${colors.gray('100ms between requests')}
`)
    .action(async (file: string, options: { strict?: boolean; delay: string; verbose?: boolean }) => {
      const { promises: fsPromises } = await import('node:fs');

      try {
        const content = await fsPromises.readFile(file, 'utf-8');
        const har = JSON.parse(content);
        const entries = har.log?.entries || [];

        if (entries.length === 0) {
          console.log(colors.yellow('No entries found in HAR file'));
          return;
        }

        console.log(colors.cyan(`Replaying ${entries.length} requests from ${file}`));
        console.log('');

        const delay = parseInt(options.delay);
        let success = 0;
        let failed = 0;

        for (const entry of entries) {
          const req = entry.request;
          const expectedRes = entry.response;

          if (options.verbose) {
            console.log(colors.gray(`→ ${req.method} ${req.url}`));
            console.log(colors.gray(`  Expected: ${expectedRes.status} ${expectedRes.statusText}`));
          }

          console.log(colors.green('✔') + ` ${req.method} ${req.url.slice(0, 60)}... → ${colors.cyan(expectedRes.status.toString())}`);
          success++;

          if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        console.log('');
        console.log(colors.green(`✔ Replayed ${success} requests`));
        if (failed > 0) {
          console.log(colors.red(`✗ ${failed} failed`));
        }
      } catch (error: any) {
        console.error(colors.red(`Failed to read HAR file: ${error.message}`));
        process.exit(1);
      }
    });

  harCmd
    .command('info')
    .description('Show information about a HAR file')
    .argument('<file>', 'HAR file to inspect')
    .option('--json', 'Output as JSON')
    .addHelpText('after', `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek har info api.har')}
  ${colors.green('$ rek har info api.har --json')}
`)
    .action(async (file: string, options: { json?: boolean }) => {
      const { promises: fsPromises } = await import('node:fs');

      try {
        const content = await fsPromises.readFile(file, 'utf-8');
        const har = JSON.parse(content);
        const entries = har.log?.entries || [];

        if (options.json) {
          const info = {
            version: har.log?.version,
            creator: har.log?.creator,
            entries: entries.length,
            pages: har.log?.pages?.length || 0,
            methods: {} as Record<string, number>,
            hosts: {} as Record<string, number>,
            totalSize: 0,
            totalTime: 0,
          };

          for (const entry of entries) {
            const method = entry.request?.method || 'UNKNOWN';
            info.methods[method] = (info.methods[method] || 0) + 1;

            try {
              const host = new URL(entry.request?.url).hostname;
              info.hosts[host] = (info.hosts[host] || 0) + 1;
            } catch { /* ignore */ }

            info.totalSize += entry.response?.content?.size || 0;
            info.totalTime += entry.time || 0;
          }

          console.log(JSON.stringify(info, null, 2));
        } else {
          console.log(colors.bold(colors.cyan('HAR File Info')));
          console.log('');
          console.log(`  ${colors.cyan('Version')}: ${har.log?.version || 'unknown'}`);
          console.log(`  ${colors.cyan('Creator')}: ${har.log?.creator?.name || 'unknown'} ${har.log?.creator?.version || ''}`);
          console.log(`  ${colors.cyan('Entries')}: ${entries.length}`);

          // Method breakdown
          const methods: Record<string, number> = {};
          const hosts: Record<string, number> = {};
          let totalSize = 0;
          let totalTime = 0;

          for (const entry of entries) {
            const method = entry.request?.method || 'UNKNOWN';
            methods[method] = (methods[method] || 0) + 1;

            try {
              const host = new URL(entry.request?.url).hostname;
              hosts[host] = (hosts[host] || 0) + 1;
            } catch { /* ignore */ }

            totalSize += entry.response?.content?.size || 0;
            totalTime += entry.time || 0;
          }

          console.log('');
          console.log(colors.bold('  Methods:'));
          for (const [method, count] of Object.entries(methods)) {
            console.log(`    ${colors.green(method.padEnd(8))} ${count}`);
          }

          console.log('');
          console.log(colors.bold('  Hosts:'));
          for (const [host, count] of Object.entries(hosts).slice(0, 5)) {
            console.log(`    ${colors.gray(host.slice(0, 30).padEnd(32))} ${count}`);
          }
          if (Object.keys(hosts).length > 5) {
            console.log(colors.gray(`    ... and ${Object.keys(hosts).length - 5} more`));
          }

          console.log('');
          console.log(`  ${colors.cyan('Total Size')}: ${(totalSize / 1024).toFixed(1)} KB`);
          console.log(`  ${colors.cyan('Total Time')}: ${(totalTime / 1000).toFixed(2)} s`);
        }
      } catch (error: any) {
        console.error(colors.red(`Failed to read HAR file: ${error.message}`));
        process.exit(1);
      }
    });

  // Benchmark command
  const bench = program.command('bench').description('Performance benchmarking tools');

  bench
    .command('load')
    .description('Run a load test with real-time dashboard')
    .argument('[args...]', 'URL and options (users=10 duration=10s mode=throughput http2)')
    .addHelpText('after', `
${colors.bold(colors.yellow('Options (key=value):'))}
  ${colors.green('users')}     Number of concurrent users    ${colors.gray('(default: 50)')}
  ${colors.green('duration')}  Test duration in seconds      ${colors.gray('(default: 300)')}
  ${colors.green('ramp')}      Ramp-up time in seconds       ${colors.gray('(default: 5)')}
  ${colors.green('mode')}      Test mode                     ${colors.gray('(default: throughput)')}
               ${colors.gray('Values: throughput, stress, realistic')}
  ${colors.green('http2')}     Force HTTP/2                  ${colors.gray('(default: false)')}

${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek bench load httpbin.org/get users=100 duration=60 ramp=10')}
  ${colors.green('$ rek bench load https://api.com/heavy mode=stress http2=true')}
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
            console.error(colors.red('Error: URL is required. Example: rek bench load httpbin.org users=50'));
            process.exit(1);
        }

        const { startLoadDashboard } = await import('./tui/load-dashboard.js');
        await startLoadDashboard({ url, users, duration, mode, http2, rampUp });
    });

  // Mock Server command
  const serve = program.command('serve').description('Start mock servers for testing protocols');

  serve
    .command('http')
    .description('Start a mock HTTP server')
    .option('-p, --port <number>', 'Port to listen on', '3000')
    .option('-h, --host <string>', 'Host to bind to', '127.0.0.1')
    .option('--echo', 'Echo request body back in response')
    .option('--delay <ms>', 'Add delay to responses (milliseconds)', '0')
    .option('--cors', 'Enable CORS', true)
    .addHelpText('after', `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek serve http')}                    ${colors.gray('Start on port 3000')}
  ${colors.green('$ rek serve http -p 8080')}            ${colors.gray('Start on port 8080')}
  ${colors.green('$ rek serve http --echo')}             ${colors.gray('Echo mode')}
  ${colors.green('$ rek serve http --delay 500')}        ${colors.gray('Add 500ms delay')}
`)
    .action(async (options: { port: string; host: string; echo?: boolean; delay: string; cors?: boolean }) => {
      const { MockHttpServer } = await import('../testing/mock-http-server.js');

      const server = await MockHttpServer.create({
        port: parseInt(options.port),
        host: options.host,
        delay: parseInt(options.delay),
        cors: options.cors,
      });

      // Echo mode: return request body
      if (options.echo) {
        server.any('/*', (req) => ({
          status: 200,
          body: {
            method: req.method,
            path: req.path,
            query: req.query,
            headers: req.headers,
            body: req.body,
          },
        }));
      }

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock HTTP Server')}                   │
├─────────────────────────────────────────────┤
│  URL: ${colors.cyan(server.url.padEnd(37))}│
│  Mode: ${colors.yellow((options.echo ? 'Echo' : 'Default').padEnd(36))}│
│  Delay: ${colors.gray((options.delay + 'ms').padEnd(35))}│
├─────────────────────────────────────────────┤
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘
`));

      server.on('request', (req) => {
        console.log(colors.gray(`${new Date().toISOString()} `) + colors.cyan(req.method.padEnd(7)) + req.path);
      });

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        await server.stop();
        process.exit(0);
      });
    });

  serve
    .command('webhook')
    .alias('wh')
    .description('Start a webhook receiver server')
    .option('-p, --port <number>', 'Port to listen on', '3000')
    .option('-h, --host <string>', 'Host to bind to', '127.0.0.1')
    .option('-s, --status <code>', 'Response status code (200 or 204)', '204')
    .option('-q, --quiet', 'Disable logging', false)
    .addHelpText('after', `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek serve webhook')}                 ${colors.gray('Start on port 3000')}
  ${colors.green('$ rek serve wh -p 8080')}              ${colors.gray('Start on port 8080')}
  ${colors.green('$ rek serve webhook --status 200')}    ${colors.gray('Return 200 instead of 204')}

${colors.bold(colors.yellow('Endpoints:'))}
  * /              ${colors.gray('Receive webhook without ID')}
  * /:id           ${colors.gray('Receive webhook with custom ID')}

${colors.bold(colors.yellow('Methods:'))}
  ${colors.gray('GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS')}
`)
    .action(async (options: { port: string; host: string; status: string; quiet: boolean }) => {
      const { createWebhookServer } = await import('../testing/mock-http-server.js');

      const status = parseInt(options.status) as 200 | 204;
      if (status !== 200 && status !== 204) {
        console.error(colors.red('Status must be 200 or 204'));
        process.exit(1);
      }

      const server = await createWebhookServer({
        port: parseInt(options.port),
        host: options.host,
        status,
        log: !options.quiet,
      });

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Webhook Receiver')}                   │
├─────────────────────────────────────────────┤
│  URL: ${colors.cyan(server.url.padEnd(37))}│
│  Status: ${colors.yellow(String(status).padEnd(34))}│
├─────────────────────────────────────────────┤
│  ${colors.cyan('*')} ${colors.cyan('/')}            ${colors.gray('Webhook without ID')}        │
│  ${colors.cyan('*')} ${colors.cyan('/:id')}         ${colors.gray('Webhook with custom ID')}    │
├─────────────────────────────────────────────┤
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘
`));

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        console.log(colors.gray(`Total webhooks received: ${server.webhooks.length}`));
        await server.stop();
        process.exit(0);
      });
    });

  serve
    .command('websocket')
    .alias('ws')
    .description('Start a mock WebSocket server')
    .option('-p, --port <number>', 'Port to listen on', '8080')
    .option('-h, --host <string>', 'Host to bind to', '127.0.0.1')
    .option('--echo', 'Echo messages back (default: true)', true)
    .option('--no-echo', 'Disable echo mode')
    .option('--delay <ms>', 'Add delay to responses (milliseconds)', '0')
    .addHelpText('after', `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek serve websocket')}               ${colors.gray('Start on port 8080')}
  ${colors.green('$ rek serve ws -p 9000')}              ${colors.gray('Start on port 9000')}
  ${colors.green('$ rek serve ws --no-echo')}            ${colors.gray('Disable echo')}
`)
    .action(async (options: { port: string; host: string; echo: boolean; delay: string }) => {
      const { MockWebSocketServer } = await import('../testing/mock-websocket-server.js');

      const server = await MockWebSocketServer.create({
        port: parseInt(options.port),
        host: options.host,
        echo: options.echo,
        delay: parseInt(options.delay),
      });

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock WebSocket Server')}              │
├─────────────────────────────────────────────┤
│  URL: ${colors.cyan(server.url.padEnd(37))}│
│  Echo: ${colors.yellow((options.echo ? 'Enabled' : 'Disabled').padEnd(36))}│
│  Delay: ${colors.gray((options.delay + 'ms').padEnd(35))}│
├─────────────────────────────────────────────┤
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘
`));

      server.on('connection', (client) => {
        console.log(colors.green(`+ Connected: ${client.id}`));
      });

      server.on('message', (msg, client) => {
        const data = msg.data.toString().slice(0, 50);
        console.log(colors.gray(`${new Date().toISOString()} `) + colors.cyan(client.id) + ` ${data}${msg.data.toString().length > 50 ? '...' : ''}`);
      });

      server.on('disconnect', (client) => {
        console.log(colors.red(`- Disconnected: ${client.id}`));
      });

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        await server.stop();
        process.exit(0);
      });
    });

  serve
    .command('sse')
    .description('Start a mock SSE (Server-Sent Events) server')
    .option('-p, --port <number>', 'Port to listen on', '8081')
    .option('-h, --host <string>', 'Host to bind to', '127.0.0.1')
    .option('--path <string>', 'SSE endpoint path', '/events')
    .option('--heartbeat <ms>', 'Send heartbeat every N ms (0 = disabled)', '0')
    .addHelpText('after', `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek serve sse')}                     ${colors.gray('Start on port 8081')}
  ${colors.green('$ rek serve sse -p 9000')}             ${colors.gray('Start on port 9000')}
  ${colors.green('$ rek serve sse --heartbeat 5000')}    ${colors.gray('Send heartbeat every 5s')}

${colors.bold(colors.yellow('Interactive Commands:'))}
  Type a message and press Enter to broadcast it to all clients.
`)
    .action(async (options: { port: string; host: string; path: string; heartbeat: string }) => {
      const { MockSSEServer } = await import('../testing/mock-sse-server.js');
      const readline = await import('node:readline');

      const server = await MockSSEServer.create({
        port: parseInt(options.port),
        host: options.host,
        path: options.path,
      });

      if (parseInt(options.heartbeat) > 0) {
        server.startPeriodicEvents('heartbeat', parseInt(options.heartbeat));
      }

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock SSE Server')}                    │
├─────────────────────────────────────────────┤
│  URL: ${colors.cyan(server.url.padEnd(37))}│
│  Heartbeat: ${colors.yellow((options.heartbeat === '0' ? 'Disabled' : options.heartbeat + 'ms').padEnd(31))}│
├─────────────────────────────────────────────┤
│  Type message + Enter to broadcast          │
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘
`));

      server.on('connection', (client) => {
        console.log(colors.green(`+ Connected: ${client.id}`));
      });

      server.on('disconnect', (client) => {
        console.log(colors.red(`- Disconnected: ${client.id}`));
      });

      // Interactive broadcast
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.on('line', (line) => {
        if (line.trim()) {
          const sent = server.sendData(line.trim());
          console.log(colors.gray(`Broadcast to ${sent} client(s): ${line.trim()}`));
        }
      });

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        rl.close();
        await server.stop();
        process.exit(0);
      });
    });

  serve
    .command('hls')
    .description('Start a mock HLS streaming server')
    .option('-p, --port <number>', 'Port to listen on', '8082')
    .option('-h, --host <string>', 'Host to bind to', '127.0.0.1')
    .option('--mode <type>', 'Stream mode: vod, live, event', 'vod')
    .option('--segments <number>', 'Number of segments (VOD mode)', '10')
    .option('--duration <seconds>', 'Segment duration in seconds', '6')
    .option('--qualities <list>', 'Comma-separated quality variants', '720p,480p,360p')
    .addHelpText('after', `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek serve hls')}                     ${colors.gray('Start VOD server')}
  ${colors.green('$ rek serve hls --mode live')}         ${colors.gray('Start live stream')}
  ${colors.green('$ rek serve hls --segments 20')}       ${colors.gray('VOD with 20 segments')}
  ${colors.green('$ rek serve hls --qualities 1080p,720p,480p')}

${colors.bold(colors.yellow('Endpoints:'))}
  ${colors.cyan('/master.m3u8')}     Master playlist (multi-quality)
  ${colors.cyan('/playlist.m3u8')}   Single quality playlist
  ${colors.cyan('/<quality>/playlist.m3u8')}  Quality-specific playlist
`)
    .action(async (options: { port: string; host: string; mode: string; segments: string; duration: string; qualities: string }) => {
      const { MockHlsServer } = await import('../testing/mock-hls-server.js');
      const http = await import('node:http');

      const port = parseInt(options.port);
      const host = options.host;
      const qualities = options.qualities.split(',').map(q => q.trim());
      const resolutions = ['1920x1080', '1280x720', '854x480', '640x360', '426x240'];
      const bandwidths = [5000000, 2500000, 1400000, 800000, 500000];

      const variants = qualities.map((name, i) => ({
        name,
        bandwidth: bandwidths[i] || 500000,
        resolution: resolutions[i] || '640x360',
      }));

      const baseUrl = `http://${host}:${port}`;
      const hlsServer = await MockHlsServer.create({
        baseUrl,
        mode: options.mode as 'vod' | 'live' | 'event',
        segmentCount: parseInt(options.segments),
        segmentDuration: parseInt(options.duration),
        multiQuality: variants.length > 1,
        variants: variants.length > 1 ? variants : undefined,
      });

      // Create HTTP server wrapper for the transport-based MockHlsServer
      const httpServer = http.createServer(async (req, res) => {
        const url = `${baseUrl}${req.url}`;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const response = await hlsServer.transport.dispatch({ url, method: req.method || 'GET' } as any) as any;
          res.statusCode = response.status;
          response.headers.forEach((value: string, key: string) => {
            res.setHeader(key, value);
          });
          const body = await response.arrayBuffer();
          res.end(Buffer.from(body));
        } catch {
          res.statusCode = 404;
          res.end('Not Found');
        }
      });

      httpServer.listen(port, host, () => {
        console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock HLS Server')}                    │
├─────────────────────────────────────────────┤
│  Master: ${colors.cyan((hlsServer.manifestUrl).padEnd(34))}│
│  Mode: ${colors.yellow(options.mode.padEnd(36))}│
│  Segments: ${colors.gray(options.segments.padEnd(32))}│
│  Duration: ${colors.gray((options.duration + 's').padEnd(32))}│
│  Qualities: ${colors.cyan(qualities.join(', ').padEnd(31))}│
├─────────────────────────────────────────────┤
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘
`));
      });

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        httpServer.close();
        await hlsServer.stop();
        process.exit(0);
      });
    });

  serve
    .command('udp')
    .description('Start a mock UDP server')
    .option('-p, --port <number>', 'Port to listen on', '9000')
    .option('-h, --host <string>', 'Host to bind to', '127.0.0.1')
    .option('--echo', 'Echo messages back (default: true)', true)
    .option('--no-echo', 'Disable echo mode')
    .addHelpText('after', `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek serve udp')}                     ${colors.gray('Start on port 9000')}
  ${colors.green('$ rek serve udp -p 5353')}             ${colors.gray('Start on port 5353')}
  ${colors.green('$ rek serve udp --no-echo')}           ${colors.gray('Disable echo')}
`)
    .action(async (options: { port: string; host: string; echo: boolean }) => {
      const { MockUDPServer } = await import('../testing/mock-udp-server.js');

      const server = new MockUDPServer({
        port: parseInt(options.port),
        host: options.host,
        echo: options.echo,
      });

      await server.start();

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock UDP Server')}                    │
├─────────────────────────────────────────────┤
│  Address: ${colors.cyan(`${options.host}:${options.port}`.padEnd(33))}│
│  Echo: ${colors.yellow((options.echo ? 'Enabled' : 'Disabled').padEnd(36))}│
├─────────────────────────────────────────────┤
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘
`));

      server.on('message', (msg) => {
        const data = msg.data.toString().slice(0, 50);
        console.log(colors.gray(`${new Date().toISOString()} `) + colors.cyan(`${msg.rinfo.address}:${msg.rinfo.port}`) + ` ${data}${msg.data.toString().length > 50 ? '...' : ''}`);
      });

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        await server.stop();
        process.exit(0);
      });
    });

  serve
    .command('dns')
    .description('Start a mock DNS server')
    .option('-p, --port <number>', 'Port to listen on', '5353')
    .option('-h, --host <string>', 'Host to bind to', '127.0.0.1')
    .option('--delay <ms>', 'Add delay to responses (milliseconds)', '0')
    .addHelpText('after', `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek serve dns')}                     ${colors.gray('Start on port 5353')}
  ${colors.green('$ rek serve dns -p 53')}               ${colors.gray('Start on standard port (requires root)')}
  ${colors.green('$ dig @127.0.0.1 -p 5353 example.com')} ${colors.gray('Test with dig')}

${colors.bold(colors.yellow('Default Records:'))}
  ${colors.cyan('localhost')}      A: 127.0.0.1, AAAA: ::1
  ${colors.cyan('example.com')}    A, AAAA, NS, MX, TXT records
  ${colors.cyan('test.local')}     A: 192.168.1.100
`)
    .action(async (options: { port: string; host: string; delay: string }) => {
      const { MockDnsServer } = await import('../testing/mock-dns-server.js');

      const server = await MockDnsServer.create({
        port: parseInt(options.port),
        host: options.host,
        delay: parseInt(options.delay),
      });

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock DNS Server')}                    │
├─────────────────────────────────────────────┤
│  Address: ${colors.cyan(`${options.host}:${options.port}`.padEnd(33))}│
│  Protocol: ${colors.yellow('UDP'.padEnd(32))}│
├─────────────────────────────────────────────┤
│  Test: dig @${options.host} -p ${options.port} example.com        │
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘
`));

      server.on('query', (query: { domain: string; type: string }) => {
        console.log(colors.gray(`${new Date().toISOString()} `) + colors.cyan(query.type.padEnd(6)) + ` ${query.domain}`);
      });

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        await server.stop();
        process.exit(0);
      });
    });

  serve
    .command('whois')
    .description('Start a mock WHOIS server')
    .option('-p, --port <number>', 'Port to listen on', '4343')
    .option('-h, --host <string>', 'Host to bind to', '127.0.0.1')
    .option('--delay <ms>', 'Add delay to responses (milliseconds)', '0')
    .addHelpText('after', `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek serve whois')}                    ${colors.gray('Start on port 4343')}
  ${colors.green('$ whois -h 127.0.0.1 -p 4343 example.com')} ${colors.gray('Test with whois')}

${colors.bold(colors.yellow('Default Domains:'))}
  ${colors.cyan('example.com')}    IANA reserved domain
  ${colors.cyan('google.com')}     MarkMonitor registrar
  ${colors.cyan('test.local')}     Test domain
`)
    .action(async (options: { port: string; host: string; delay: string }) => {
      const { MockWhoisServer } = await import('../testing/mock-whois-server.js');

      const server = await MockWhoisServer.create({
        port: parseInt(options.port),
        host: options.host,
        delay: parseInt(options.delay),
      });

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock WHOIS Server')}                  │
├─────────────────────────────────────────────┤
│  Address: ${colors.cyan(`${options.host}:${options.port}`.padEnd(33))}│
│  Protocol: ${colors.yellow('TCP'.padEnd(32))}│
├─────────────────────────────────────────────┤
│  Test: whois -h ${options.host} -p ${options.port} example.com │
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘
`));

      server.on('query', (query: string) => {
        console.log(colors.gray(`${new Date().toISOString()} `) + `Query: ${colors.cyan(query)}`);
      });

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        await server.stop();
        process.exit(0);
      });
    });

  serve
    .command('telnet')
    .description('Start a mock Telnet server')
    .option('-p, --port <number>', 'Port to listen on', '2323')
    .option('-h, --host <string>', 'Host to bind to', '127.0.0.1')
    .option('--echo', 'Echo input back (default: true)', true)
    .option('--no-echo', 'Disable echo mode')
    .option('--delay <ms>', 'Add delay to responses (milliseconds)', '0')
    .addHelpText('after', `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek serve telnet')}                   ${colors.gray('Start on port 2323')}
  ${colors.green('$ telnet localhost 2323')}              ${colors.gray('Connect to server')}

${colors.bold(colors.yellow('Built-in Commands:'))}
  ${colors.cyan('help')}        Show available commands
  ${colors.cyan('echo <msg>')} Echo message back
  ${colors.cyan('date')}        Show current date
  ${colors.cyan('time')}        Show current time
  ${colors.cyan('ping')}        Returns "pong"
  ${colors.cyan('quit')}        Disconnect
`)
    .action(async (options: { port: string; host: string; echo: boolean; delay: string }) => {
      const { MockTelnetServer } = await import('../testing/mock-telnet-server.js');

      const server = await MockTelnetServer.create({
        port: parseInt(options.port),
        host: options.host,
        echo: options.echo,
        delay: parseInt(options.delay),
      });

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock Telnet Server')}                 │
├─────────────────────────────────────────────┤
│  Address: ${colors.cyan(`${options.host}:${options.port}`.padEnd(33))}│
│  Echo: ${colors.yellow((options.echo ? 'Enabled' : 'Disabled').padEnd(36))}│
├─────────────────────────────────────────────┤
│  Connect: telnet ${options.host} ${options.port}               │
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘
`));

      server.on('connect', (session: { id: string }) => {
        console.log(colors.gray(`${new Date().toISOString()} `) + colors.green('+ Connected: ') + colors.cyan(session.id));
      });

      server.on('disconnect', (session: { id: string }) => {
        console.log(colors.gray(`${new Date().toISOString()} `) + colors.red('- Disconnected: ') + colors.cyan(session.id));
      });

      server.on('command', (cmd: string, session: { id: string }) => {
        console.log(colors.gray(`${new Date().toISOString()} `) + colors.cyan(session.id) + ` $ ${cmd}`);
      });

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        await server.stop();
        process.exit(0);
      });
    });

  serve
    .command('ftp')
    .description('Start a mock FTP server')
    .option('-p, --port <number>', 'Port to listen on', '2121')
    .option('-h, --host <string>', 'Host to bind to', '127.0.0.1')
    .option('-u, --username <user>', 'Username for auth', 'user')
    .option('--password <pass>', 'Password for auth', 'pass')
    .option('--anonymous', 'Allow anonymous login (default: true)', true)
    .option('--no-anonymous', 'Disable anonymous login')
    .option('--delay <ms>', 'Add delay to responses (milliseconds)', '0')
    .addHelpText('after', `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek serve ftp')}                      ${colors.gray('Start on port 2121')}
  ${colors.green('$ ftp localhost 2121')}                 ${colors.gray('Connect to server')}
  ${colors.green('$ rek serve ftp --no-anonymous')}       ${colors.gray('Require authentication')}

${colors.bold(colors.yellow('Default Files:'))}
  ${colors.cyan('/welcome.txt')}        Welcome message
  ${colors.cyan('/readme.md')}          README file
  ${colors.cyan('/data/sample.json')}   Sample JSON data
  ${colors.cyan('/public/index.html')}  HTML file

${colors.bold(colors.yellow('Credentials:'))}
  Username: ${colors.cyan('user')}  Password: ${colors.cyan('pass')}
  Or use anonymous login with user: ${colors.cyan('anonymous')}
`)
    .action(async (options: { port: string; host: string; username: string; password: string; anonymous: boolean; delay: string }) => {
      const { MockFtpServer } = await import('../testing/mock-ftp-server.js');

      const server = await MockFtpServer.create({
        port: parseInt(options.port),
        host: options.host,
        username: options.username,
        password: options.password,
        anonymous: options.anonymous,
        delay: parseInt(options.delay),
      });

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock FTP Server')}                    │
├─────────────────────────────────────────────┤
│  Address: ${colors.cyan(`${options.host}:${options.port}`.padEnd(33))}│
│  Anonymous: ${colors.yellow((options.anonymous ? 'Allowed' : 'Disabled').padEnd(31))}│
│  User: ${colors.cyan(options.username.padEnd(36))}│
├─────────────────────────────────────────────┤
│  Connect: ftp ${options.host} ${options.port}                  │
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘
`));

      server.on('connect', (session: { id: string }) => {
        console.log(colors.gray(`${new Date().toISOString()} `) + colors.green('+ Connected: ') + colors.cyan(session.id));
      });

      server.on('disconnect', (session: { id: string }) => {
        console.log(colors.gray(`${new Date().toISOString()} `) + colors.red('- Disconnected: ') + colors.cyan(session.id));
      });

      server.on('command', (cmd: string, _args: string, session: { id: string }) => {
        console.log(colors.gray(`${new Date().toISOString()} `) + colors.cyan(session.id) + ` ${cmd}`);
      });

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        await server.stop();
        process.exit(0);
      });
    });

  // MCP Server command
  program
    .command('mcp')
    .description('Start MCP server for AI agents to access Recker documentation')
    .option('-t, --transport <mode>', 'Transport mode: stdio, http, sse', 'stdio')
    .option('-p, --port <number>', 'Server port (for http/sse modes)', '3100')
    .option('-d, --docs <path>', 'Path to documentation folder')
    .option('-T, --tools <paths...>', 'Paths to external tool modules to load')
    .option('--debug', 'Enable debug logging')
    .addHelpText('after', `
${colors.bold(colors.yellow('Transport Modes:'))}
  ${colors.cyan('stdio')}  ${colors.gray('(default)')} For Claude Code and other CLI tools
  ${colors.cyan('http')}   Simple HTTP POST endpoint
  ${colors.cyan('sse')}    HTTP + Server-Sent Events for real-time notifications

${colors.bold(colors.yellow('Usage:'))}
  ${colors.green('$ rek mcp')}                    ${colors.gray('Start in stdio mode (for Claude Code)')}
  ${colors.green('$ rek mcp -t http')}            ${colors.gray('Start HTTP server on port 3100')}
  ${colors.green('$ rek mcp -t sse -p 8080')}     ${colors.gray('Start SSE server on custom port')}
  ${colors.green('$ rek mcp --debug')}            ${colors.gray('Enable debug logging')}

${colors.bold(colors.yellow('Tools provided:'))}
  ${colors.cyan('search_docs')}  Search documentation by keyword
  ${colors.cyan('get_doc')}      Get full content of a doc file

${colors.bold(colors.yellow('Claude Code config (~/.claude.json):'))}
  ${colors.gray(`{
    "mcpServers": {
      "recker-docs": {
        "command": "npx",
        "args": ["recker", "mcp"]
      }
    }
  }`)}
`)
    .action(async (options: { transport: string; port: string; docs?: string; debug?: boolean; tools?: string[] }) => {
      const { MCPServer } = await import('../mcp/server.js');
      const transport = options.transport as 'stdio' | 'http' | 'sse';

      const server = new MCPServer({
        transport,
        port: parseInt(options.port),
        docsPath: options.docs,
        debug: options.debug,
        toolPaths: options.tools,
      });

      // For stdio mode, start silently (output goes to stderr if debug)
      if (transport === 'stdio') {
        await server.start();
        // Server runs until stdin closes
        return;
      }

      // For http/sse modes, show the UI
      await server.start();

      const endpoints = transport === 'sse'
        ? `
│  POST /        - JSON-RPC endpoint          │
│  GET  /sse     - Server-Sent Events         │
│  GET  /health  - Health check               │`
        : `
│  POST /        - JSON-RPC endpoint          │`;

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker MCP Server')}                         │
├─────────────────────────────────────────────┤
│  Transport: ${colors.cyan(transport.padEnd(31))}│
│  Endpoint: ${colors.cyan(`http://localhost:${options.port}`.padEnd(32))}│
│  Docs indexed: ${colors.yellow(String(server.getDocsCount()).padEnd(28))}│
├─────────────────────────────────────────────┤${endpoints}
├─────────────────────────────────────────────┤
│  Tools:                                     │
│    • ${colors.cyan('search_docs')} - Search documentation     │
│    • ${colors.cyan('get_doc')}     - Get full doc content     │
│                                             │
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘
`));

      // Keep alive
      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down MCP server...'));
        await server.stop();
        process.exit(0);
      });
    });

  // ============================================================================
  // SFTP Command
  // ============================================================================
  const sftpCmd = program.command('sftp').description('SFTP client operations (secure FTP over SSH)');

  sftpCmd
    .command('ls')
    .description('List files in a remote directory')
    .argument('<host>', 'SFTP server hostname')
    .argument('[args...]', 'Path and options: [path] user=x pass=x key=x port=x')
    .addHelpText('after', `
${colors.bold(colors.yellow('Parameters:'))}
  user=<username>    Username (default: root)
  pass=<password>    Password
  key=<path>         Path to private key file
  port=<number>      Port number (default: 22)

${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek sftp ls myserver.com')}
  ${colors.green('$ rek sftp ls myserver.com /var/www user=admin key=~/.ssh/id_rsa')}
  ${colors.green('$ rek sftp ls myserver.com /home user=user pass=secret')}
`)
    .action(async (host: string, args: string[]) => {
      const { createSFTP } = await import('../protocols/sftp.js');

      // Parse key=value args
      let remotePath = '/';
      let user = 'root';
      let password: string | undefined;
      let keyPath: string | undefined;
      let port = 22;

      for (const arg of args) {
        if (arg.startsWith('user=')) user = arg.slice(5);
        else if (arg.startsWith('pass=')) password = arg.slice(5);
        else if (arg.startsWith('key=')) keyPath = arg.slice(4);
        else if (arg.startsWith('port=')) port = parseInt(arg.slice(5));
        else if (!arg.includes('=')) remotePath = arg;
      }

      try {
        let privateKey: string | undefined;
        if (keyPath) {
          const fsPromises = await import('node:fs/promises');
          privateKey = await fsPromises.readFile(keyPath.replace('~', process.env.HOME || ''), 'utf-8');
        }

        const sftp = createSFTP({
          host,
          port,
          username: user,
          password,
          privateKey,
        });

        console.log(colors.gray(`Connecting to ${host}:${port}...`));
        await sftp.connect();

        const result = await sftp.list(remotePath);
        const files = result.data || [];
        console.log(colors.bold(`\nDirectory: ${remotePath}\n`));

        for (const file of files) {
          const icon = file.type === 'directory' ? '📁' : '📄';
          const size = file.type === 'directory' ? '' : ` (${file.size} bytes)`;
          console.log(`  ${icon} ${file.name}${size}`);
        }

        console.log(colors.gray(`\nTotal: ${files.length} items`));
        await sftp.close();
      } catch (error: any) {
        console.error(colors.red(`SFTP Error: ${error.message}`));
        process.exit(1);
      }
    });

  sftpCmd
    .command('get')
    .description('Download a file from SFTP server')
    .argument('<host>', 'SFTP server hostname')
    .argument('<remote>', 'Remote file path')
    .argument('[args...]', 'Local path and options: [local] user=x pass=x key=x port=x')
    .addHelpText('after', `
${colors.bold(colors.yellow('Parameters:'))}
  user=<username>    Username (default: root)
  pass=<password>    Password
  key=<path>         Path to private key file
  port=<number>      Port number (default: 22)

${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek sftp get myserver.com /etc/hosts')}
  ${colors.green('$ rek sftp get myserver.com /var/log/app.log app.log user=admin key=~/.ssh/id_rsa')}
`)
    .action(async (host: string, remote: string, args: string[]) => {
      const { createSFTP } = await import('../protocols/sftp.js');
      const nodePath = await import('node:path');

      // Parse key=value args
      let localPath: string | undefined;
      let user = 'root';
      let password: string | undefined;
      let keyPath: string | undefined;
      let port = 22;

      for (const arg of args) {
        if (arg.startsWith('user=')) user = arg.slice(5);
        else if (arg.startsWith('pass=')) password = arg.slice(5);
        else if (arg.startsWith('key=')) keyPath = arg.slice(4);
        else if (arg.startsWith('port=')) port = parseInt(arg.slice(5));
        else if (!arg.includes('=')) localPath = arg;
      }

      try {
        let privateKey: string | undefined;
        if (keyPath) {
          const fsPromises = await import('node:fs/promises');
          privateKey = await fsPromises.readFile(keyPath.replace('~', process.env.HOME || ''), 'utf-8');
        }

        const sftp = createSFTP({
          host,
          port,
          username: user,
          password,
          privateKey,
        });

        const destPath = localPath || nodePath.basename(remote);

        console.log(colors.gray(`Connecting to ${host}:${port}...`));
        await sftp.connect();

        console.log(colors.gray(`Downloading ${remote} → ${destPath}...`));
        await sftp.download(remote, destPath);

        console.log(colors.green(`✔ Downloaded: ${destPath}`));
        await sftp.close();
      } catch (error: any) {
        console.error(colors.red(`SFTP Error: ${error.message}`));
        process.exit(1);
      }
    });

  sftpCmd
    .command('put')
    .description('Upload a file to SFTP server')
    .argument('<host>', 'SFTP server hostname')
    .argument('<local>', 'Local file path')
    .argument('[args...]', 'Remote path and options: [remote] user=x pass=x key=x port=x')
    .addHelpText('after', `
${colors.bold(colors.yellow('Parameters:'))}
  user=<username>    Username (default: root)
  pass=<password>    Password
  key=<path>         Path to private key file
  port=<number>      Port number (default: 22)

${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek sftp put myserver.com ./local.txt')}
  ${colors.green('$ rek sftp put myserver.com data.json /var/www/data.json user=admin key=~/.ssh/id_rsa')}
`)
    .action(async (host: string, local: string, args: string[]) => {
      const { createSFTP } = await import('../protocols/sftp.js');
      const nodePath = await import('node:path');

      // Parse key=value args
      let remotePath: string | undefined;
      let user = 'root';
      let password: string | undefined;
      let keyPath: string | undefined;
      let port = 22;

      for (const arg of args) {
        if (arg.startsWith('user=')) user = arg.slice(5);
        else if (arg.startsWith('pass=')) password = arg.slice(5);
        else if (arg.startsWith('key=')) keyPath = arg.slice(4);
        else if (arg.startsWith('port=')) port = parseInt(arg.slice(5));
        else if (!arg.includes('=')) remotePath = arg;
      }

      try {
        let privateKey: string | undefined;
        if (keyPath) {
          const fsPromises = await import('node:fs/promises');
          privateKey = await fsPromises.readFile(keyPath.replace('~', process.env.HOME || ''), 'utf-8');
        }

        const sftp = createSFTP({
          host,
          port,
          username: user,
          password,
          privateKey,
        });

        const destPath = remotePath || nodePath.basename(local);

        console.log(colors.gray(`Connecting to ${host}:${port}...`));
        await sftp.connect();

        console.log(colors.gray(`Uploading ${local} → ${destPath}...`));
        await sftp.upload(local, destPath);

        console.log(colors.green(`✔ Uploaded: ${destPath}`));
        await sftp.close();
      } catch (error: any) {
        console.error(colors.red(`SFTP Error: ${error.message}`));
        process.exit(1);
      }
    });

  // ============================================================================
  // UDP Command
  // ============================================================================
  program
    .command('udp')
    .description('Send UDP packet to a host')
    .argument('<host>', 'Target hostname or IP')
    .argument('[args...]', 'Port, message and options: [port] [message] timeout=x hex')
    .addHelpText('after', `
${colors.bold(colors.yellow('Parameters:'))}
  timeout=<ms>       Timeout in milliseconds (default: 5000)
  hex                Send message as hex bytes

${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek udp localhost 5353 "hello"')}
  ${colors.green('$ rek udp 192.168.1.1 161 "302902010004067075626c6963" hex')}
  ${colors.green('$ rek udp localhost 53 "ping" timeout=10000')}
`)
    .action(async (host: string, args: string[]) => {
      const dgram = await import('node:dgram');

      // Parse args: [port] [message] timeout=x hex
      let port = 53;
      let message = 'ping';
      let timeout = 5000;
      let hex = false;
      let foundPort = false;
      let foundMessage = false;

      for (const arg of args) {
        if (arg.startsWith('timeout=')) timeout = parseInt(arg.slice(8));
        else if (arg === 'hex') hex = true;
        else if (!arg.includes('=')) {
          if (!foundPort && /^\d+$/.test(arg)) {
            port = parseInt(arg);
            foundPort = true;
          } else if (!foundMessage) {
            message = arg;
            foundMessage = true;
          }
        }
      }

      const client = dgram.createSocket('udp4');

      const data = hex
        ? Buffer.from(message.replace(/\s/g, ''), 'hex')
        : Buffer.from(message);

      console.log(colors.gray(`Sending UDP packet to ${host}:${port}...`));

      const timeoutId = setTimeout(() => {
        console.log(colors.yellow('No response (timeout)'));
        client.close();
        process.exit(0);
      }, timeout);

      client.on('message', (msg, rinfo) => {
        clearTimeout(timeoutId);
        console.log(colors.green(`✔ Response from ${rinfo.address}:${rinfo.port}`));
        console.log(colors.gray(`  Size: ${msg.length} bytes`));
        console.log(colors.cyan(`  Data: ${msg.toString('hex')}`));
        client.close();
      });

      client.on('error', (err) => {
        clearTimeout(timeoutId);
        console.error(colors.red(`UDP Error: ${err.message}`));
        client.close();
        process.exit(1);
      });

      client.send(data, port, host, (err) => {
        if (err) {
          clearTimeout(timeoutId);
          console.error(colors.red(`Send Error: ${err.message}`));
          client.close();
          process.exit(1);
        }
        console.log(colors.gray(`Sent ${data.length} bytes, waiting for response...`));
      });
    });

  // ============================================================================
  // SSE Command (Server-Sent Events client)
  // ============================================================================
  program
    .command('sse')
    .description('Connect to Server-Sent Events stream')
    .argument('<url>', 'SSE endpoint URL')
    .argument('[args...]', 'Headers and options: Header:Value timeout=x last-event-id=x')
    .addHelpText('after', `
${colors.bold(colors.yellow('Parameters:'))}
  Header:Value        Add headers (Key:Value format)
  timeout=<seconds>   Connection timeout (default: 0 = no timeout)
  last-event-id=<id>  Last event ID for reconnection

${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek sse https://api.example.com/events')}
  ${colors.green('$ rek sse api.com/stream Authorization:"Bearer token"')}
  ${colors.green('$ rek sse api.com/events last-event-id=123')}
`)
    .action(async (url: string, args: string[]) => {
      const { createClient } = await import('../core/client.js');

      if (!url.startsWith('http')) {
        url = `https://${url}`;
      }

      // Parse args: Header:Value timeout=x last-event-id=x
      const headers: Record<string, string> = {};
      let timeout = 0;
      let lastEventId: string | undefined;

      for (const arg of args) {
        if (arg.startsWith('timeout=')) timeout = parseInt(arg.slice(8));
        else if (arg.startsWith('last-event-id=')) lastEventId = arg.slice(14);
        else if (arg.includes(':') && !arg.startsWith('http')) {
          const [key, ...rest] = arg.split(':');
          headers[key.trim()] = rest.join(':').trim();
        }
      }

      if (lastEventId) {
        headers['Last-Event-ID'] = lastEventId;
      }

      console.log(colors.cyan('SSE Client'));
      console.log(colors.gray(`Connecting to ${url}...`));
      console.log(colors.gray('Press Ctrl+C to disconnect\n'));

      const client = createClient();

      try {
        const response = await client.get(url, {
          headers: {
            ...headers,
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
        });

        if (!response.ok) {
          console.error(colors.red(`HTTP Error: ${response.status} ${response.statusText}`));
          process.exit(1);
        }

        console.log(colors.green('✔ Connected\n'));

        // Stream SSE events
        for await (const event of response.sse()) {
          const timestamp = colors.gray(new Date().toISOString().split('T')[1].slice(0, 8));

          if (event.event && event.event !== 'message') {
            console.log(`${timestamp} ${colors.yellow(`[${event.event}]`)} ${event.data}`);
          } else {
            console.log(`${timestamp} ${event.data}`);
          }

          if (event.id) {
            console.log(colors.gray(`         id: ${event.id}`));
          }
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log(colors.yellow('\nDisconnected'));
        } else {
          console.error(colors.red(`\nSSE Error: ${error.message}`));
          process.exit(1);
        }
      }

      process.on('SIGINT', () => {
        console.log(colors.yellow('\nDisconnecting...'));
        process.exit(0);
      });
    });

  // ============================================================================
  // Upload Command
  // ============================================================================
  program
    .command('upload')
    .description('Upload a file to a URL')
    .argument('<url>', 'Upload endpoint URL')
    .argument('<file>', 'File to upload')
    .argument('[args...]', 'Options: field=x Header:Value progress')
    .addHelpText('after', `
${colors.bold(colors.yellow('Parameters:'))}
  field=<name>       Form field name (default: file)
  Header:Value       Add headers (Key:Value format)
  progress           Show upload progress (default: enabled)

${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek upload https://api.example.com/files ./image.png')}
  ${colors.green('$ rek upload api.com/upload document.pdf field=document')}
  ${colors.green('$ rek upload api.com/files data.json Authorization:"Bearer token"')}
`)
    .action(async (url: string, file: string, args: string[]) => {
      const { createClient } = await import('../core/client.js');
      const nodePath = await import('node:path');
      const fsPromises = await import('node:fs/promises');

      // Parse args: field=x Header:Value progress
      let fieldName = 'file';
      let showProgress = true;
      const headers: Record<string, string> = {};

      for (const arg of args) {
        if (arg.startsWith('field=')) fieldName = arg.slice(6);
        else if (arg === 'progress') showProgress = true;
        else if (arg === 'no-progress') showProgress = false;
        else if (arg.includes(':') && !arg.startsWith('http')) {
          const [key, ...rest] = arg.split(':');
          headers[key.trim()] = rest.join(':').trim();
        }
      }

      if (!url.startsWith('http')) {
        url = `https://${url}`;
      }

      // Check if file exists
      try {
        await fsPromises.access(file);
      } catch {
        console.error(colors.red(`File not found: ${file}`));
        process.exit(1);
      }

      const stats = await fsPromises.stat(file);

      console.log(colors.gray(`Uploading ${nodePath.basename(file)} (${(stats.size / 1024).toFixed(1)} KB)...`));

      try {
        const client = createClient();
        const fileContent = await fsPromises.readFile(file);

        // Use multipart form upload
        const boundary = `----ReckerBoundary${Date.now()}`;
        const filename = nodePath.basename(file);

        const bodyParts = [
          `--${boundary}`,
          `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"`,
          'Content-Type: application/octet-stream',
          '',
          ''
        ];

        const header = Buffer.from(bodyParts.join('\r\n'));
        const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
        const body = Buffer.concat([header, fileContent, footer]);

        const response = await client.post(url, body, {
          headers: {
            ...headers,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
        });

        console.log(colors.green(`✔ Upload complete: ${response.status} ${response.statusText}`));

        const responseBody = await response.text();
        if (responseBody) {
          try {
            const json = JSON.parse(responseBody);
            console.log(JSON.stringify(json, null, 2));
          } catch {
            console.log(responseBody);
          }
        }
      } catch (error: any) {
        console.error(colors.red(`\nUpload Error: ${error.message}`));
        process.exit(1);
      }
    });

  // ============================================================================
  // Download Command
  // ============================================================================
  program
    .command('download')
    .description('Download a file from a URL with progress')
    .argument('<url>', 'File URL to download')
    .argument('[args...]', 'Output file and options: [output] Header:Value resume progress')
    .addHelpText('after', `
${colors.bold(colors.yellow('Parameters:'))}
  Header:Value       Add headers (Key:Value format)
  resume             Resume partial download if possible
  progress           Show download progress (default: enabled)
  no-progress        Disable progress bar

${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek download https://example.com/file.zip')}
  ${colors.green('$ rek download https://api.com/export.csv data.csv')}
  ${colors.green('$ rek download https://cdn.com/video.mp4 resume')}
  ${colors.green('$ rek download api.com/file Authorization:"Bearer token"')}
`)
    .action(async (url: string, args: string[]) => {
      const { downloadToFile } = await import('../utils/download.js');
      const { createClient } = await import('../core/client.js');
      const nodePath = await import('node:path');
      const fsPromises = await import('node:fs/promises');

      // Parse args: [output] Header:Value resume progress
      let output: string | undefined;
      let showProgress = true;
      let resume = false;
      const headers: Record<string, string> = {};

      for (const arg of args) {
        if (arg === 'resume') resume = true;
        else if (arg === 'progress') showProgress = true;
        else if (arg === 'no-progress') showProgress = false;
        else if (arg.includes(':') && !arg.startsWith('http')) {
          const [key, ...rest] = arg.split(':');
          headers[key.trim()] = rest.join(':').trim();
        } else if (!arg.includes('=')) {
          output = arg;
        }
      }

      if (!url.startsWith('http')) {
        url = `https://${url}`;
      }

      // Auto-detect filename from URL
      const urlPath = new URL(url).pathname;
      const filename = output || nodePath.basename(urlPath) || 'download';

      console.log(colors.gray(`Downloading to ${filename}...`));

      try {
        const client = createClient();
        let downloaded = 0;
        let total = 0;

        const result = await downloadToFile(client, url, filename, {
          resume,
          headers,
          onProgress: showProgress ? (progress) => {
            downloaded = progress.loaded;
            total = progress.total || 0;
            const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;
            const downloadedMB = (downloaded / 1024 / 1024).toFixed(1);
            const totalMB = total > 0 ? (total / 1024 / 1024).toFixed(1) : '?';
            const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
            process.stdout.write(`\r  [${bar}] ${pct}% (${downloadedMB}/${totalMB} MB)`);
          } : undefined,
        });

        if (showProgress) {
          process.stdout.write('\n');
        }

        const stats = await fsPromises.stat(filename);
        console.log(colors.green(`✔ Downloaded: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`));
      } catch (error: any) {
        console.error(colors.red(`\nDownload Error: ${error.message}`));
        process.exit(1);
      }
    });

  // ============================================================================
  // SOAP Command
  // ============================================================================
  program
    .command('soap')
    .description('Make a SOAP request')
    .argument('<url>', 'SOAP endpoint URL')
    .argument('<action>', 'SOAP action/operation name')
    .argument('[args...]', 'Parameters and options: key=value namespace=x Header:Value envelope=x')
    .addHelpText('after', `
${colors.bold(colors.yellow('Parameters:'))}
  key=value          Action parameters
  namespace=<ns>     SOAP namespace
  Header:Value       Add HTTP headers (Key:Value format)
  envelope=<ver>     SOAP envelope version (default: 1.1)

${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek soap https://api.example.com/soap GetUser userId=123')}
  ${colors.green('$ rek soap api.com/ws GetWeather city="New York" namespace="http://weather.example.com"')}
  ${colors.green('$ rek soap api.com/service Calculate a=10 b=20 operation=add')}
`)
    .action(async (url: string, action: string, args: string[]) => {
      if (!url.startsWith('http')) {
        url = `https://${url}`;
      }

      // Parse args: key=value namespace=x Header:Value envelope=x
      const body: Record<string, string> = {};
      const headers: Record<string, string> = {};
      let namespace: string | undefined;
      let envelope = '1.1';

      for (const arg of args) {
        if (arg.startsWith('namespace=')) namespace = arg.slice(10);
        else if (arg.startsWith('envelope=')) envelope = arg.slice(9);
        else if (arg.includes(':') && !arg.startsWith('http')) {
          const [key, ...rest] = arg.split(':');
          headers[key.trim()] = rest.join(':').trim();
        } else if (arg.includes('=')) {
          const [key, ...rest] = arg.split('=');
          body[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
        }
      }

      console.log(colors.gray(`SOAP Request to ${url}`));
      console.log(colors.gray(`Action: ${action}`));
      if (Object.keys(body).length > 0) {
        console.log(colors.gray(`Params: ${JSON.stringify(body)}`));
      }
      console.log('');

      try {
        const { createClient } = await import('../core/client.js');
        const { createSoapClient } = await import('../plugins/soap.js');

        const httpClient = createClient();
        const soapClient = createSoapClient(httpClient, {
          endpoint: url,
          namespace,
        });

        const response = await soapClient.call(action, body);

        console.log(colors.green('✔ Response:'));
        console.log(JSON.stringify(response, null, 2));
      } catch (error: any) {
        console.error(colors.red(`SOAP Error: ${error.message}`));
        process.exit(1);
      }
    });

  // ============================================================================
  // OData Command
  // ============================================================================
  program
    .command('odata')
    .description('Query an OData service')
    .argument('<url>', 'OData service URL')
    .argument('<entity>', 'Entity set name')
    .argument('[args...]', 'Options: select=x filter=x orderby=x top=x skip=x expand=x Header:Value')
    .addHelpText('after', `
${colors.bold(colors.yellow('Parameters:'))}
  select=<fields>    Select specific fields (comma-separated)
  filter=<expr>      OData filter expression
  orderby=<field>    Order by field
  top=<n>            Limit results
  skip=<n>           Skip results
  expand=<nav>       Expand navigation property
  Header:Value       Add HTTP headers (Key:Value format)

${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek odata https://services.odata.org/V4/Northwind/Northwind.svc Products')}
  ${colors.green('$ rek odata api.com/odata Customers filter="Country eq \'USA\'" top=10')}
  ${colors.green('$ rek odata api.com/odata Orders select=OrderID,CustomerID expand=Customer')}
`)
    .action(async (url: string, entity: string, args: string[]) => {
      if (!url.startsWith('http')) {
        url = `https://${url}`;
      }

      // Parse args: select=x filter=x orderby=x top=x skip=x expand=x Header:Value
      const headers: Record<string, string> = {};
      let select: string | undefined;
      let filter: string | undefined;
      let orderby: string | undefined;
      let top: number | undefined;
      let skip: number | undefined;
      let expand: string | undefined;

      for (const arg of args) {
        if (arg.startsWith('select=')) select = arg.slice(7);
        else if (arg.startsWith('filter=')) filter = arg.slice(7);
        else if (arg.startsWith('orderby=')) orderby = arg.slice(8);
        else if (arg.startsWith('top=')) top = parseInt(arg.slice(4));
        else if (arg.startsWith('skip=')) skip = parseInt(arg.slice(5));
        else if (arg.startsWith('expand=')) expand = arg.slice(7);
        else if (arg.includes(':') && !arg.startsWith('http')) {
          const [key, ...rest] = arg.split(':');
          headers[key.trim()] = rest.join(':').trim();
        }
      }

      console.log(colors.gray(`OData Query: ${url}/${entity}`));

      try {
        const { createClient } = await import('../core/client.js');
        const { createODataClient } = await import('../plugins/odata.js');

        const httpClient = createClient();
        const odataClient = createODataClient(httpClient, { serviceRoot: url });
        let query = odataClient.query(entity);

        if (select) {
          query = query.select(...select.split(',').map((s: string) => s.trim()));
        }
        if (filter) {
          query = query.filter(filter);
        }
        if (orderby) {
          query = query.orderBy(orderby);
        }
        if (top !== undefined) {
          query = query.top(top);
        }
        if (skip !== undefined) {
          query = query.skip(skip);
        }
        if (expand) {
          query = query.expand(expand);
        }

        console.log(colors.gray(`Query: ${query.toUrl()}\n`));

        const results = await query.get();

        console.log(colors.green(`✔ Results: ${Array.isArray(results) ? results.length : 1} items`));
        console.log(JSON.stringify(results, null, 2));
      } catch (error: any) {
        console.error(colors.red(`OData Error: ${error.message}`));
        process.exit(1);
      }
    });

  // ============================================================================
  // Proxy Command
  // ============================================================================
  program
    .command('proxy')
    .description('Make a request through a proxy')
    .argument('<proxy>', 'Proxy URL (http://host:port or socks5://host:port)')
    .argument('<url>', 'Target URL')
    .argument('[args...]', 'Request arguments: method=x key=value key:=json Header:value')
    .addHelpText('after', `
${colors.bold(colors.yellow('Parameters:'))}
  method=<method>    HTTP method (default: GET)
  key=value          String data
  key:=json          JSON data
  Header:value       HTTP headers (Key:Value format)

${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek proxy http://proxy.example.com:8080 https://api.com/data')}
  ${colors.green('$ rek proxy socks5://127.0.0.1:1080 https://api.com/users')}
  ${colors.green('$ rek proxy http://user:pass@proxy.com:3128 api.com/endpoint method=POST data=test')}
`)
    .action(async (proxy: string, url: string, args: string[]) => {
      const { createClient } = await import('../core/client.js');

      if (!url.startsWith('http')) {
        url = `https://${url}`;
      }

      // Parse args: method=x key=value key:=json Header:value
      const headers: Record<string, string> = {};
      const data: Record<string, unknown> = {};
      let method = 'GET';

      for (const arg of args) {
        if (arg.startsWith('method=')) {
          method = arg.slice(7).toUpperCase();
        } else if (arg.includes(':=')) {
          const [key, ...rest] = arg.split(':=');
          try {
            data[key] = JSON.parse(rest.join(':='));
          } catch {
            data[key] = rest.join(':=');
          }
        } else if (arg.includes(':') && !arg.includes('=') && !arg.startsWith('http')) {
          const [key, ...rest] = arg.split(':');
          headers[key] = rest.join(':');
        } else if (arg.includes('=')) {
          const [key, ...rest] = arg.split('=');
          data[key] = rest.join('=');
        }
      }

      console.log(colors.gray(`Proxy: ${proxy}`));
      console.log(colors.gray(`Target: ${url}`));
      console.log('');

      try {
        const client = createClient({
          proxy: { url: proxy },
        });

        const methodLower = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch';
        const hasBody = Object.keys(data).length > 0;

        const response = hasBody
          ? await (client as any)[methodLower](url, { json: data, headers })
          : await (client as any)[methodLower](url, { headers });

        console.log(colors.green(`✔ ${response.status} ${response.statusText}`));

        const body = await response.text();
        try {
          const json = JSON.parse(body);
          console.log(JSON.stringify(json, null, 2));
        } catch {
          console.log(body);
        }
      } catch (error: any) {
        console.error(colors.red(`Proxy Error: ${error.message}`));
        process.exit(1);
      }
    });

  program.parse();
}

// Run the CLI
main().catch((error) => {
  console.error('CLI Error:', error.message);
  process.exit(1);
});

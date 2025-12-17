#!/usr/bin/env node
import { RekCommand } from './router.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import colors from '../utils/colors.js';
import { formatColumns } from '../utils/columns.js';
import { summarizeErrors, formatErrorSummary, printError } from './helpers.js';
import { getVersion, formatVersionInfo } from '../version.js';
import { registerHlsCommand } from './commands/hls.js';
import { registerDnsCommands } from './commands/dns.js';
import { registerAiCommand } from './commands/ai.js';
import { registerSpiderCommand } from './commands/spider.js';
import { registerScrapeCommand } from './commands/scrape.js';
import { registerBenchCommand } from './commands/bench.js';
import { registerSecurityCommand } from './commands/security.js';
import { registerServeCommand } from './commands/serve.js';
import { registerNetworkCommands } from './commands/network.js';
import { registerProtocolCommands } from './commands/protocols.js';
import { registerUtilsCommands } from './commands/utils.js';
import { registerHarCommand } from './commands/har.js';
import { registerVectorCommand } from './commands/vector.js';
import { registerSeoCommand } from './commands/seo.js';
import { registerVideoCommand } from './commands/video.js';
import { registerLiveCommand } from './commands/live.js';
import { parseEnhancerPresets, loadEnvFile, levenshtein } from './helpers.js';

async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY) {
    return null;
  }

  return new Promise((resolve) => {
    let data = '';
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
    process.stdin.resume();
  });
}

async function main() {
  const { handleRequest } = await import('./handler.js');
  const { resolvePreset } = await import('./presets.js');
  const presets = await import('../presets/index.js');

  const version = await getVersion();

  function parseMixedArgs(args: string[], initialClientOptions: any = {}) {
    const headers: Record<string, string> = { ...initialClientOptions.headers };
    const data: Record<string, any> = {};
    let method = 'GET';
    let url = '';
    let clientOptions: any = { ...initialClientOptions };

    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

    for (const arg of args) {
      if (arg === '--') continue;

      if (methods.includes(arg.toUpperCase())) {
        method = arg.toUpperCase();
        continue;
      }

      if (arg.includes(':') && !arg.includes('://') && !arg.includes('=')) {
        const [key, value] = arg.split(':');
        headers[key.trim()] = value.trim();
        continue;
      }

      if (arg.includes('=')) {
        if (method === 'GET') method = 'POST';
        const isTyped = arg.includes(':=');
        const separator = isTyped ? ':=' : '=';
        const [key, value] = arg.split(separator);

        if (isTyped) {
          if (value === 'true') data[key] = true;
          else if (value === 'false') data[key] = false;
          else if (!isNaN(Number(value))) data[key] = Number(value);
          else data[key] = value;
        } else {
          data[key] = value;
        }
        continue;
      }

      if (!url) {
        url = arg;
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('ws://') && !url.startsWith('wss://') && !url.startsWith('udp://')) {
          if (clientOptions.baseUrl) {
            url = `${clientOptions.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
          } else {
            url = `https://${url}`;
          }
        }
      }
    }

    clientOptions.headers = { ...clientOptions.headers, ...headers };
    return { method, url, data, clientOptions };
  }

  const utilityFunctions = [
    'registry', 'presetRegistry', 'detectPreset', 'getPreset',
    'listPresets', 'listAIPresets', 'listCloudPresets', 'listSaaSPresets', 'listDevToolsPresets'
  ];
  const PRESET_NAMES = Object.keys(presets)
    .filter(k => !utilityFunctions.includes(k) && !k.startsWith('_') && typeof (presets as any)[k] === 'function')
    .sort();

  const program = new RekCommand('rek');

  program
    .description('The HTTP Client for Humans (and Robots)')
    .version(version)
    .argument('[args...]', 'URL, Method, Headers (Key:Value), Data (key=value)')
    .option('-v, --verbose', 'Show full request/response details')
    .option('-q, --quiet', 'Output only response body')
    .option('-o, --output <file>', 'Write response body to file')
    .option('-j, --json', 'Force JSON content-type')
    .option('-e, --env [path]', 'Load .env file')
    .addHelpText('after', () => `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek httpbin.org/json')}
  ${colors.green('$ rek post api.com/users name="Cyber"')}
  ${colors.green('$ rek @github/user')}

${colors.bold(colors.yellow('Available Presets:'))}
${formatColumns(PRESET_NAMES, { prefix: '@', indent: 2, minWidth: 16, transform: colors.cyan })}
`)
    .action(async (args: string[], options: any) => {
      if (args.length === 0) {
        program.showHelp();
        return;
      }

      if (options.env !== undefined) {
        await loadEnvFile(options.env);
      }

      const stdinData = await readStdin();

      const { clientOptions: enhancerOptions, remainingArgs } = await parseEnhancerPresets(args);
      let argsToParse = remainingArgs;
      let finalClientOptions: any = enhancerOptions;

      if (argsToParse.length > 0 && argsToParse[0].startsWith('@')) {
        let presetArg = argsToParse[0];
        let presetName = presetArg.slice(1);
        let pathFromPreset = '';

        if (presetName.includes('/')) {
          const parts = presetName.split('/');
          presetName = parts[0];
          pathFromPreset = '/' + parts.slice(1).join('/');
        }

        const mainPresetOptions = await resolvePreset(presetName);

        if (mainPresetOptions) {
          finalClientOptions = { ...finalClientOptions, ...mainPresetOptions, headers: { ...finalClientOptions.headers, ...mainPresetOptions.headers } };

          if (pathFromPreset) {
             if (finalClientOptions.baseUrl) {
                finalClientOptions.baseUrl = (finalClientOptions.baseUrl || '').replace(/\/$/, '') + pathFromPreset;
             } else {
                argsToParse = [pathFromPreset, ...argsToParse.slice(1)];
             }
          } else {
             argsToParse = argsToParse.slice(1);
          }
        } else {
          console.error(colors.red(`Error: Preset '@${presetName}' not found.`));
          process.exit(1);
        }
      }

      const { method, url, data, clientOptions: parsedArgsClientOptions } = parseMixedArgs(argsToParse, finalClientOptions);
      finalClientOptions = parsedArgsClientOptions;

      if (!url) {
        program.showHelp();
        return;
      }
      
      if (options.json) {
        finalClientOptions.headers = finalClientOptions.headers || {};
        finalClientOptions.headers['Content-Type'] = 'application/json';
        finalClientOptions.headers['Accept'] = 'application/json';
      }

      if (url.startsWith('ws://') || url.startsWith('wss://')) {
        const { startInteractiveWebSocket } = await import('./tui/websocket.js');
        await startInteractiveWebSocket(url, finalClientOptions.headers);
        return;
      }

      if (url.startsWith('udp://')) {
        const dgram = await import('node:dgram');
        const { Buffer } = await import('node:buffer');

        const u = new URL(url);
        const host = u.hostname;
        const port = parseInt(u.port || '9000');
        const client = dgram.createSocket('udp4');

        let payload: Buffer;
        let bodyData: any = undefined;
        
        if (stdinData) {
            bodyData = stdinData;
        } else if (Object.keys(data).length > 0) {
            bodyData = JSON.stringify(data);
        } else {
            bodyData = '';
        }

        if (typeof bodyData === 'string') {
            payload = Buffer.from(bodyData);
        } else {
            payload = Buffer.from(JSON.stringify(bodyData));
        }

        console.log(colors.gray(`Sending ${payload.length} bytes to ${host}:${port}...`));

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

        setTimeout(() => {
             if (!options.quiet) {
                 console.log(colors.gray('\nNo response received (timeout).'));
             }
             client.close();
             process.exit(0);
        }, 2000);

        return;
      }

      try {
        let body: any = undefined;
        if (stdinData) {
          try { body = JSON.parse(stdinData); } catch { body = stdinData; }
        } else if (Object.keys(data).length > 0) {
          body = data;
        }

        await handleRequest({
          method,
          url,
          body,
          verbose: options.verbose,
          quiet: options.quiet,
          output: options.output,
          clientOptions: finalClientOptions,
        });
      } catch (error: any) {
        if (!options.quiet) {
          console.error(colors.red(`\nError: ${error.message}`));
          if (options.verbose && error.cause) {
            console.error(error.cause);
          }
        }
        process.exit(1);
      }
    });

  program.command('completion').description('Generate shell completion').action(() => {
      console.log('# Completion not fully supported in RekCommand yet');
  });

  program.command('version').alias('info').action(async () => {
      const versionInfo = await formatVersionInfo(true);
      console.log(colors.bold(colors.cyan('recker')) + ' ' + colors.green(version));
      console.log(colors.gray(versionInfo));
  });

  program.command('shell').alias('repl').action(async (args, opts) => {
      const { RekShell } = await import('./tui/shell.js');
      const shell = new RekShell();
      shell.start();
  });

  program.command('docs').alias('?').action(async (query, opts) => {
      const q = Array.isArray(query) ? query.join(' ') : query;
      const { openSearchPanel } = await import('./tui/search-panel.js');
      await openSearchPanel(q || undefined);
  });

  registerSecurityCommand(program as any);
  registerSpiderCommand(program as any);
  registerScrapeCommand(program as any);
  registerSeoCommand(program as any);
  registerNetworkCommands(program as any);
  registerDnsCommands(program as any);
  registerProtocolCommands(program as any);
  registerHarCommand(program as any);
  registerVectorCommand(program as any);
  registerHlsCommand(program as any);
  registerVideoCommand(program as any);
  registerLiveCommand(program as any);
  registerAiCommand(program as any);
  registerBenchCommand(program as any);
  registerServeCommand(program as any);
  registerUtilsCommands(program as any);

  const sftpCmd = program.command('sftp').description('SFTP client operations');
  sftpCmd.command('ls').argument('<host>').action(async (host, args) => {
      console.log('SFTP ls', host);
  });

  await program.parse();
}

main().catch((error) => {
  console.error('CLI Error:', error.message);
  process.exit(1);
});

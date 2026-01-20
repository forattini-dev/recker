import { Client } from '../../../core/client.js';
import colors from '../../../utils/colors.js';
import { ShellContext } from '../context.js';
import readline from 'node:readline'; // For Telnet
import { promises as fs } from 'node:fs'; // For GraphQL/JSON-RPC file reading
import { join, basename } from 'node:path'; // For FTP local file paths
import { URL } from 'node:url'; // For GraphQL/JSON-RPC parsing

// --- FTP ---
export async function runFtp(ctx: ShellContext, args: string[]) {
  // Parse: ftp <host> [command] [args...]
  // Commands: ls [path], get <remote> [local], put <local> [remote], rm <path>, mkdir <path>

  if (args.length === 0 || args[0] === 'help') {
    console.log(colors.bold('FTP Client'));
    console.log('');
    console.log(colors.yellow('Usage: ftp <host> [command] [args...]'));
    console.log('');
    console.log(colors.gray('Commands:'));
    console.log('  ftp <host> ls [path]           - List directory');
    console.log('  ftp <host> get <remote>        - Download file');
    console.log('  ftp <host> put <local> [remote]- Upload file');
    console.log('  ftp <host> rm <path>           - Delete file');
    console.log('  ftp <host> mkdir <path>        - Create directory');
    console.log('');
    console.log(colors.gray('Options (add after host):'));
    console.log('  user=<username>  - FTP username (default: anonymous)');
    console.log('  pass=<password>  - FTP password (default: anonymous@)');
    console.log('  port=<number>    - Port number (default: 21)');
    console.log('  secure           - Use FTPS (explicit TLS)');
    console.log('');
    console.log(colors.gray('Examples:'));
    console.log('  ftp ftp.example.com ls');
    console.log('  ftp ftp.example.com ls /pub');
    console.log('  ftp ftp.example.com get /pub/file.txt');
    console.log('  ftp ftp.example.com user=admin pass=secret ls');
    return;
  }

  const host = args[0];
  let command = 'ls';
  let commandArgs: string[] = [];
  const options: Record<string, string> = {};

  // Parse remaining args
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.includes('=')) {
      const [key, value] = arg.split('=');
      options[key] = value;
    } else if (['ls', 'get', 'put', 'rm', 'mkdir'].includes(arg)) {
      command = arg;
      commandArgs = args.slice(i + 1).filter(a => !a.includes('='));
      break;
    } else {
      // Assume it's a command arg if not an option
      command = arg;
      commandArgs = args.slice(i + 1).filter(a => !a.includes('='));
      break;
    }
  }

  const { createFTP } = await import('../../../protocols/ftp.js');

  const client = createFTP({
    host,
    port: parseInt(options.port || '21'),
    user: options.user || 'anonymous',
    password: options.pass || 'anonymous@',
    secure: args.includes('secure'),
  });

  console.log(colors.gray(`Connecting to ${host}...`));

  try {
    const connectResult = await client.connect();
    if (!connectResult.success) {
      console.error(colors.red(`Connection failed: ${connectResult.message}`));
      return;
    }
    console.log(colors.green('Connected'));

    switch (command) {
      case 'ls': {
        const path = commandArgs[0] || '/';
        console.log(colors.gray(`Listing ${path}...`));
        const result = await client.list(path);
        if (!result.success || !result.data) {
          console.error(colors.red(`List failed: ${result.message}`));
          break;
        }
        console.log('');
        for (const item of result.data) {
          const typeChar = item.type === 'directory' ? 'd' : item.type === 'link' ? 'l' : '-';
          const perms = item.permissions || 'rwxr-xr-x';
          const size = item.size.toString().padStart(10);
          const date = item.rawModifiedAt || '';
          const nameColor = item.type === 'directory' ? colors.blue : item.type === 'link' ? colors.cyan : (t: string) => t;
          console.log(`${typeChar}${perms}  ${size}  ${date.padEnd(12)}  ${nameColor(item.name)}`);
        }
        console.log('');
        console.log(colors.gray(`Total: ${result.data.length} items`));
        ctx.lastResponse = result.data;
        break;
      }
      case 'get': {
        const remote = commandArgs[0];
        if (!remote) {
          console.log(colors.yellow('Usage: ftp <host> get <remote-path>'));
          break;
        }
        const local = commandArgs[1] || basename(remote);
        console.log(colors.gray(`Downloading ${remote} → ${local}...`));
        const result = await client.download(remote, local);
        if (!result.success) {
          console.error(colors.red(`Download failed: ${result.message}`));
        } else {
          console.log(colors.green(`✔ Downloaded to ${local}`));
        }
        break;
      }
      case 'put': {
        const local = commandArgs[0];
        if (!local) {
          console.log(colors.yellow('Usage: ftp <host> put <local-path> [remote-path]'));
          break;
        }
        const remote = commandArgs[1] || '/' + basename(local);
        console.log(colors.gray(`Uploading ${local} → ${remote}...`));
        const result = await client.upload(local, remote);
        if (!result.success) {
          console.error(colors.red(`Upload failed: ${result.message}`));
        } else {
          console.log(colors.green(`✔ Uploaded to ${remote}`));
        }
        break;
      }
      case 'rm': {
        const remotePath = commandArgs[0];
        if (!remotePath) {
          console.log(colors.yellow('Usage: ftp <host> rm <remote-path>'));
          break;
        }
        console.log(colors.gray(`Deleting ${remotePath}...`));
        const result = await client.delete(remotePath);
        if (!result.success) {
          console.error(colors.red(`Delete failed: ${result.message}`));
        } else {
          console.log(colors.green(`✔ Deleted ${remotePath}`));
        }
        break;
      }
      case 'mkdir': {
        const remotePath = commandArgs[0];
        if (!remotePath) {
          console.log(colors.yellow('Usage: ftp <host> mkdir <remote-path>'));
          break;
        }
        console.log(colors.gray(`Creating ${remotePath}...`));
        const result = await client.mkdir(remotePath);
        if (!result.success) {
          console.error(colors.red(`Mkdir failed: ${result.message}`));
        } else {
          console.log(colors.green(`✔ Created ${remotePath}`));
        }
        break;
      }
      default:
        console.log(colors.yellow(`Unknown FTP command: ${command}`));
        console.log(colors.gray('Valid commands: ls, get, put, rm, mkdir'));
    }

    await client.close();
  } catch (error: any) {
    console.error(colors.red(`FTP Error: ${error.message}`));
  }
  console.log('');
}

// --- Telnet ---
export async function runTelnet(ctx: ShellContext, host?: string, portStr?: string) {
  if (!host) {
    console.log(colors.bold('Telnet Client'));
    console.log('');
    console.log(colors.yellow('Usage: telnet <host> [port]'));
    console.log('');
    console.log(colors.gray('Examples:'));
    console.log('  telnet towel.blinkenlights.nl');
    console.log('  telnet localhost 8023');
    console.log('  telnet mail.example.com 25');
    console.log('');
    console.log(colors.gray('Note: Type "exit" or Ctrl+C to disconnect'));
    return;
  }

  const port = parseInt(portStr || '23');
  console.log(colors.gray(`Connecting to ${host}:${port}...`));

  try {
    const { createTelnet } = await import('../../../protocols/telnet.js');

    const client = createTelnet({
      host,
      port,
      timeout: 30000,
    });

    await client.connect();
    console.log(colors.green(`Connected to ${host}:${port}`));
    console.log(colors.gray('Interactive mode. Type "exit" to disconnect.'));
    console.log('');

    // Store the original readline interface
    const originalPrompt = (ctx as any).rl.getPrompt();

    // Set up data handler
    client.on('data', (data: string) => {
      process.stdout.write(data);
    });

    client.on('close', () => {
      console.log(colors.yellow('\nConnection closed'));
      (ctx as any).rl.setPrompt(originalPrompt);
      (ctx as any).prompt();
    });

    // Enter telnet mode - handle input differently
    const telnetPrompt = () => {
      (ctx as any).rl.question('', async (input: string) => {
        if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
          console.log(colors.yellow('Disconnecting...'));
          await client.close();
          (ctx as any).rl.setPrompt(originalPrompt);
          (ctx as any).prompt();
          return;
        }

        await client.send(input + '\r\n');
        telnetPrompt();
      });
    };

    telnetPrompt();

  } catch (error: any) {
    console.error(colors.red(`Telnet Error: ${error.message}`));
    console.log('');
  }
}

// --- GraphQL ---
export async function runGraphQL(ctx: ShellContext, args: string[]) {
  // Parse args for URL, query, variables, headers
  // graphql <url> query=".." variables="..." Header:Value
  if (args.length === 0 || args[0] === 'help') {
    console.log(colors.bold('GraphQL Client'));
    console.log('');
    console.log(colors.yellow('Usage: graphql <url> [options...]'));
    console.log('');
    console.log(colors.gray('Options:'));
    console.log('  query="..."            - Inline GraphQL query');
    console.log('  file=./query.graphql   - Path to GraphQL query file');
    console.log('  variables="..."        - JSON string of variables');
    console.log('  var-file=./vars.json   - Path to JSON variables file');
    console.log('  Header:Value           - Custom HTTP header');
    console.log('');
    console.log(colors.gray('Examples:'));
    console.log('  graphql https://api.github.com/graphql query="{ viewer { login } }"');
    console.log('  graphql https://api.spacex.land/graphql file=./rockets.graphql Authorization:"Bearer TOKEN"');
    return;
  }

  let url = args[0];
  let query: string | undefined;
  let variables: Record<string, any> = {};
  const headers: Record<string, string> = {};

  // Build full URL if needed
  if (!url.startsWith('http')) {
    if (ctx.baseUrl) {
      url = `${ctx.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    } else {
      console.error(colors.red('Error: URL is required and no base URL is set.'));
      return;
    }
  }

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('query=')) {
      query = arg.substring('query='.length);
    } else if (arg.startsWith('file=')) {
      const filePath = arg.substring('file='.length);
      try {
        query = await fs.readFile(filePath, 'utf8');
      } catch (e: any) {
        console.error(colors.red(`Error reading query file: ${e.message}`));
        return;
      }
    } else if (arg.startsWith('variables=')) {
      try {
        variables = JSON.parse(arg.substring('variables='.length));
      } catch (e: any) {
        console.error(colors.red(`Error parsing variables JSON: ${e.message}`));
        return;
      }
    } else if (arg.startsWith('var-file=')) {
      const filePath = arg.substring('var-file='.length);
      try {
        variables = JSON.parse(await fs.readFile(filePath, 'utf8'));
      } catch (e: any) {
        console.error(colors.red(`Error reading variables file: ${e.message}`));
        return;
      }
    } else if (arg.includes(':')) {
      const [key, ...valueParts] = arg.split(':');
      headers[key.trim()] = valueParts.join(':').trim();
    }
  }

  if (!query) {
    console.error(colors.red('Error: GraphQL query is required. Use query="..." or file=...'));
    return;
  }

  console.log(colors.gray(`Executing GraphQL query against ${url}...`));

  try {
    const { graphql } = await import('../../../plugins/graphql.js');
    
    const result = await graphql(ctx.client, url, {
      query,
      variables,
      headers,
    });

    console.log('');
    console.log(colors.bold(colors.green('Response:')));
    console.log(JSON.stringify(result, null, 2));
    ctx.lastResponse = result;

  } catch (error: any) {
    console.error(colors.red(`GraphQL Error: ${error.message}`));
    if (error.errors) {
      console.log(colors.bold(colors.red('GraphQL Errors:')));
      for (const e of error.errors) {
        console.log(`  ${colors.red('•')} ${e.message}`);
      }
    }
  }
  console.log('');
}

// --- JSON-RPC ---
export async function runJsonRpc(ctx: ShellContext, args: string[]) {
  // jsonrpc <url> <method> [params...] [--named]
  if (args.length === 0 || args[0] === 'help') {
    console.log(colors.bold('JSON-RPC Client'));
    console.log('');
    console.log(colors.yellow('Usage: jsonrpc <url> <method> [options...]'));
    console.log('');
    console.log(colors.gray('Options:'));
    console.log('  param=value        - Positional or named parameter (depends on --named)');
    console.log('  param:=value       - Typed parameter (number, boolean)');
    console.log('  --named            - Use named parameters (key=value, default positional)');
    console.log('  Header:Value       - Custom HTTP header');
    console.log('');
    console.log(colors.gray('Examples:'));
    console.log('  jsonrpc https://api.example.com/rpc "sum" 10 20');
    console.log('  jsonrpc https://api.example.com/rpc "subtract" --named a=5 b:=3');
    console.log('  jsonrpc https://api.example.com/rpc "getVersion" Authorization:"Bearer TOKEN"');
    return;
  }

  let url = args[0];
  let method = '';
  let params: string[] = [];
  let useNamedParams = false;
  const headers: Record<string, string> = {};

  // Build full URL if needed
  if (!url.startsWith('http')) {
    if (ctx.baseUrl) {
      url = `${ctx.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    } else {
      console.error(colors.red('Error: URL is required and no base URL is set.'));
      return;
    }
  }

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--named') {
      useNamedParams = true;
    } else if (arg.includes(':')) {
      const [key, ...valueParts] = arg.split(':');
      headers[key.trim()] = valueParts.join(':').trim();
    } else if (!method) {
      method = arg;
    } else {
      params.push(arg);
    }
  }

  if (!method) {
    console.error(colors.red('Error: Method name is required.'));
    return;
  }

  console.log(colors.gray(`Calling ${method} on ${url}...`));

  try {
    const { createJsonRpcClient } = await import('../../../plugins/jsonrpc.js');
    const rpc = createJsonRpcClient(ctx.client, { 
      endpoint: url, 
      requestOptions: { headers } 
    });

    let rpcParams: unknown[] | Record<string, unknown>;

    if (useNamedParams) {
      rpcParams = {};
      for (const p of params) {
        const isTyped = p.includes(':=');
        const separator = isTyped ? ':=' : '=';
        const [key, valueStr] = p.split(separator);
        if (isTyped) {
          try {
            (rpcParams as Record<string, unknown>)[key] = JSON.parse(valueStr);
          } catch {
            (rpcParams as Record<string, unknown>)[key] = valueStr;
          }
        } else {
          (rpcParams as Record<string, unknown>)[key] = valueStr;
        }
      }
    } else {
      rpcParams = params.map((p: string) => {
        const isTyped = p.includes(':=');
        const separator = isTyped ? ':=' : '=';
        const valueStr = p.split(separator)[1] || p; // Handle cases where it's not key:=value

        if (isTyped) {
          try {
            return JSON.parse(valueStr);
          } catch {
            return valueStr;
          }
        } else {
          return p;
        }
      });
    }

    const result = await rpc.call(method, rpcParams);

    console.log('');
    console.log(colors.bold(colors.green('Response:')));
    console.log(JSON.stringify(result, null, 2));
    ctx.lastResponse = result;

  } catch (error: any) {
    console.error(colors.red(`JSON-RPC Error: ${error.message}`));
    if (error.code) {
      console.log(colors.gray(`Error code: ${error.code}`));
    }
    if (error.data) {
      console.log(colors.gray(`Error data: ${JSON.stringify(error.data)}`));
    }
  }
  console.log('');
}

// --- HAR ---
export async function runHar(ctx: ShellContext, args: string[]) {
  // har <command> [args...]
  // commands: record <file>, play <file>, info <file>
  if (args.length === 0 || args[0] === 'help') {
    console.log(colors.bold('HAR Client'));
    console.log('');
    console.log(colors.yellow('Usage: har <command> [options...]'));
    console.log('');
    console.log(colors.gray('Commands:'));
    console.log('  record <file>        - Start recording HTTP requests to HAR file');
    console.log('  play <file>          - Replay requests from HAR file');
    console.log('  info <file>          - Show HAR file information');
    console.log('');
    console.log(colors.gray('Options (for play command):'));
    console.log('  count=<n>            - Number of replay iterations (default: 1)');
    console.log('  delay=<ms>           - Delay between requests in ms (default: 0)');
    console.log('  Header:Value         - Add/override headers for replayed requests');
    console.log('');
    console.log(colors.gray('Examples:'));
    console.log('  har record session.har');
    console.log('  har play session.har count=5');
    console.log('  har info session.har');
    return;
  }

  const command = args[0];
  const file = args[1];

  if (!file) {
    console.error(colors.red(`Error: HAR file path is required for '${command}' command.`));
    return;
  }

  switch (command) {
    case 'record': {
      console.log(colors.red('HAR recording is not yet supported in interactive shell. Use `rek har record` in CLI.'));
      break;
    }
    case 'play': {
      let count = 1;
      let delay = 0;
      const headers: Record<string, string> = {};

      for (let i = 2; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('count=')) {
          count = parseInt(arg.substring('count='.length), 10);
        } else if (arg.startsWith('delay=')) {
          delay = parseInt(arg.substring('delay='.length), 10);
        } else if (arg.includes(':')) {
          const [key, ...valueParts] = arg.split(':');
          headers[key.trim()] = valueParts.join(':').trim();
        }
      }

      console.log(colors.gray(`Replaying HAR file '${file}' (${count} times, delay ${delay}ms)...`));
      const { harPlayer } = await import('../../../plugins/har-player.js');

      try {
        const results = await harPlayer(ctx.client, file, {
          count,
          delay,
          overrideHeaders: headers,
          onProgress: (progress) => {
            process.stdout.write(`\r  ${colors.cyan(String(progress.completed))}/${progress.total} requests completed`);
          },
        });
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        console.log(colors.green(`✔ HAR playback complete. Total requests: ${results.length}`));
        ctx.lastResponse = results;
      } catch (e: any) {
        console.error(colors.red(`HAR playback failed: ${e.message}`));
      }
      break;
    }
    case 'info': {
      console.log(colors.gray(`Showing info for HAR file '${file}'...`));
      const { harInfo } = await import('../../../plugins/har-player.js');
      try {
        const info = await harInfo(file);
        console.log('');
        console.log(colors.bold(colors.cyan('HAR File Info')));
        console.log(`${colors.gray('File:')} ${file}`);
        console.log(`${colors.gray('Entries:')} ${info.entryCount}`);
        console.log(`${colors.gray('Start Time:')} ${new Date(info.startedDateTime).toLocaleString()}`);
        console.log('');
        if (info.topHosts.length > 0) {
          console.log(colors.bold('Top Hosts:'));
          info.topHosts.forEach(h => console.log(`  ${h}`));
        }
        ctx.lastResponse = info;
      } catch (e: any) {
        console.error(colors.red(`Failed to read HAR info: ${e.message}`));
      }
      break;
    }
    default:
      console.error(colors.red(`Error: Unknown HAR command '${command}'.`));
  }
  console.log('');
}
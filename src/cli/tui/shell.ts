import readline from 'node:readline';
import { requireOptional } from '../../utils/optional-require.js';
import { createClient } from '../../core/client.js';
import { startInteractiveWebSocket } from './websocket.js';
import pc from '../../utils/colors.js';

// Lazy-loaded optional dependency
let highlight: (code: string, opts?: any) => string;

async function initDependencies() {
  if (!highlight) {
    const cardinal = await requireOptional<{ highlight: typeof highlight }>('cardinal', 'recker/cli');
    highlight = cardinal.highlight;
  }
}

interface HistoryItem {
  type: 'request' | 'response' | 'info' | 'error';
  content: any;
  meta?: any;
}

export class RekShell {
  private rl!: readline.Interface;
  private client: any;
  private history: HistoryItem[] = [];
  private baseUrl: string = '';
  private lastResponse: any = null;
  private variables: Record<string, any> = {};
  private initialized = false;

  constructor() {
    // We initialize with a placeholder base URL because the Client enforces it.
    // In the shell, we might change targets dynamically, so we override it per request.
    this.client = createClient({
      baseUrl: 'http://localhost', 
      checkHooks: false 
    } as any);
  }

  private async ensureInitialized() {
    if (this.initialized) return;

    await initDependencies();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: this.completer.bind(this),
      prompt: '' // Dynamic prompt handled manually
    });

    this.initialized = true;
  }

  private getPrompt() {
    const base = this.baseUrl ? pc.cyan(new URL(this.baseUrl).hostname) : pc.gray('rek');
    return `${base} ${pc.magenta('›')} `;
  }

  private completer(line: string) {
    const commands = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'ws', 'udp', 'load', 'chat', 'ai', 'help', 'clear', 'exit', 'set', 'url'];
    const hits = commands.filter((c) => c.startsWith(line));
    return [hits.length ? hits : commands, line];
  }

  public async start() {
    await this.ensureInitialized();

    console.clear();
    console.log(pc.bold(pc.cyan('Rek Console')));
    console.log(pc.gray('Chat with your APIs. Type "help" for magic.'));
    console.log(pc.gray('--------------------------------------------\n'));

    this.prompt();

    this.rl.on('line', async (line) => {
      const input = line.trim();
      if (input) {
        await this.handleCommand(input);
      }
      this.prompt();
    });

    // Prevent Ctrl+C from closing the shell
    this.rl.on('SIGINT', () => {
      readline.clearLine(process.stdout, 0);
      this.prompt();
    });

    this.rl.on('close', () => {
      console.log(pc.gray('\nSee ya.'));
      process.exit(0);
    });
  }

  private prompt() {
    this.rl.setPrompt(this.getPrompt());
    this.rl.prompt();
  }

  private async handleCommand(input: string) {
    // 1. Variable assignment: var = value
    if (input.includes('=') && !input.includes(' ') && !input.startsWith('http')) {
      // Allow simple variable setting context? Maybe later.
      // For now, let's focus on commands.
    }

    // 2. Magic Parsing
    const parts = this.parseLine(input);
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
      case 'help':
        this.printHelp();
        return;
      case 'clear':
        console.clear();
        return;
      case 'exit':
      case 'quit':
        this.rl.close();
        return;
      case 'url': // Set Base URL
        this.setBaseUrl(parts[1]);
        return;
      case 'set': // Set variable
        this.setVariable(parts.slice(1));
        return;
      case 'vars':
        console.log(this.variables);
        return;
      case 'load':
        await this.runLoadTest(parts.slice(1));
        return;
      case 'ai':
      case 'chat':
        await this.runAIChat(parts.slice(1));
        return;
    }

    // 3. Request Handling
    // Heuristic: Is it a Method? Or a URL?
    const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
    let method = 'GET';
    let url = '';
    let bodyParts: string[] = [];
    let headers: Record<string, string> = {};

    if (methods.includes(cmd)) {
      method = cmd.toUpperCase();
      url = parts[1];
      bodyParts = parts.slice(2);
    } else if (cmd.startsWith('http') || cmd.startsWith('/') || cmd.includes('.')) {
      // Implicit GET or continued session
      method = 'GET';
      url = cmd;
      bodyParts = parts.slice(1);
    } else {
      console.log(pc.red(`Unknown command: ${cmd}`));
      return;
    }

    // Resolve URL
    url = this.resolveUrl(url);
    if (!url) {
      console.log(pc.yellow('No URL provided and no Base URL set. Use "url <url>" or provide full URL.'));
      return;
    }

    // Parse Body/Headers from remaining parts
    const body: Record<string, any> = {};
    for (const part of bodyParts) {
      if (part.includes(':')) {
        const [k, v] = part.split(':');
        headers[k] = this.resolveVariables(v);
      } else if (part.includes('=')) {
        const isTyped = part.includes(':=');
        const sep = isTyped ? ':=' : '=';
        const [k, v] = part.split(sep);
        let val: any = this.resolveVariables(v);

        if (isTyped) {
          if (val === 'true') val = true;
          else if (val === 'false') val = false;
          else if (!isNaN(Number(val))) val = Number(val);
        }

        // Implicit POST if body exists
        if (method === 'GET') method = 'POST';
        body[k] = val;
      }
    }

    await this.executeRequest(method, url, headers, body);
  }

  private async runInteractiveMode(runner: (rl: readline.Interface) => Promise<void>) {
    // 1. Remove Shell Listeners to avoid interference
    const shellListeners = this.rl.listeners('line');
    this.rl.removeAllListeners('line');
    
    try {
      // 2. Run the interactive module
      await runner(this.rl);
    } finally {
      // 3. Restore Shell Listeners
      this.rl.removeAllListeners('line'); // Clear module listeners if any left
      shellListeners.forEach(listener => this.rl.on('line', listener as any));
      
      // 4. Reset Prompt
      this.prompt();
    }
  }

  private async runAIChat(args: string[]) {
    // Usage: chat [provider] [model]
    // e.g. chat openai gpt-5.1
    
    const provider = args[0] || 'openai';
    const model = args[1];
    
    // Try to find API Key in variables or env
    const envKeyName = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
    const apiKey = this.variables[envKeyName] || process.env[envKeyName];

    const { startAIChat } = await import('./ai-chat.js');
    
    await this.runInteractiveMode(async (rl) => {
        await startAIChat(rl, provider, apiKey, model);
    });
  }

  private async runLoadTest(args: string[]) {
    // Recker Style arg parsing: load <url> users=10 duration=5s mode=realistic http2=true ramp=10
    let targetUrl = '';
    let users = 50;
    let duration = 300;
    let mode: any = 'throughput';
    let http2 = false;
    let rampUp = 5; // Default to 5 seconds for rampUp

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
      } else if (!targetUrl) {
        targetUrl = arg;
      }
    }

    targetUrl = this.resolveUrl(targetUrl);
    if (!targetUrl) {
        console.log(pc.yellow('Target URL required. usage: load <url> users=10 duration=10s ramp=5'));
        return;
    }

    const { startLoadDashboard } = await import('./load-dashboard.js');
    
    this.rl.pause();
    // Hide cursor for dashboard
    process.stdout.write('\x1B[?25l');
    
    try {
        await startLoadDashboard({
            url: targetUrl,
            users,
            duration,
            mode,
            http2,
            rampUp
        });
    } catch (e: any) {
        console.error(pc.red('Load Test Failed: ' + e.message));
    } finally {
        // Restore cursor
        process.stdout.write('\x1B[?25h');
        this.rl.resume();
        this.prompt();
    }
  }

  private parseLine(input: string): string[] {
    // Basic space splitter, but respects quotes would be better
    // For simplified MVP, simple split
    return input.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(s => s.replace(/"/g, '')) || [];
  }

  private setBaseUrl(url: string) {
    if (!url.startsWith('http')) url = `https://${url}`;
    this.baseUrl = url;
    console.log(pc.gray(`Base URL set to: ${pc.cyan(this.baseUrl)}`));
  }

  private setVariable(args: string[]) {
    // set token=123
    const [expr] = args;
    if (!expr || !expr.includes('=')) return;
    const [key, val] = expr.split('=');
    this.variables[key] = val;
    console.log(pc.gray(`Variable $${key} set.`));
  }

  private resolveVariables(value: string): string {
    if (value.startsWith('$')) {
      const key = value.slice(1); // remove $

      // Check special variable response
      if (key.startsWith('response.') || key.startsWith('res.')) {
        const path = key.split('.').slice(1);
        let current = this.lastResponse;
        for (const p of path) {
          if (current && typeof current === 'object') current = current[p];
          else return '';
        }
        return String(current);
      }

      return this.variables[key] || value;
    }
    return value;
  }

  private resolveUrl(inputUrl: string): string {
    if (!inputUrl) return this.baseUrl; // Maybe user typed 'get' expecting home?

    if (inputUrl.startsWith('http') || inputUrl.startsWith('ws') || inputUrl.startsWith('udp')) return inputUrl;

    if (this.baseUrl) {
      const cleanBase = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
      const cleanPath = inputUrl.startsWith('/') ? inputUrl : `/${inputUrl}`;
      return `${cleanBase}${cleanPath}`;
    }

    // Assume HTTPS if no scheme
    return `https://${inputUrl}`;
  }

  private async executeRequest(method: string, url: string, headers: any, body: any) {
    const startTime = performance.now();

    // Protocol Check
    if (url.startsWith('ws')) {
      this.rl.pause();
      try {
        await startInteractiveWebSocket(url, headers);
      } finally {
        this.rl.resume();
        this.prompt();
      }
      return;
    }

    if (url.startsWith('udp')) {
      // Dynamically import UDP transport
      const { UDPTransport } = await import('../../transport/udp.js');
      const transport = new UDPTransport(url);
      const msg = Object.keys(body).length ? JSON.stringify(body) : 'ping';
      console.log(pc.gray(`UDP packet -> ${url}`));
      const res = await transport.dispatch({
        url, method: 'GET', headers: new Headers(),
        body: msg, withHeader: () => ({} as any), withBody: () => ({} as any)
      });
      const text = await res.text();
      console.log(pc.green('✔ Sent/Received'));
      if (text) console.log(text);
      return;
    }

    // HTTP Request
    console.log(pc.gray(`${method} ${url}...`));

    try {
      const hasBody = Object.keys(body).length > 0;
      const res = await this.client.request(url, {
        method: method as any,
        headers,
        json: hasBody ? body : undefined
      });

      const duration = Math.round(performance.now() - startTime);
      const statusColor = res.ok ? pc.green : pc.red;

      console.log(
        `${statusColor(pc.bold(res.status))} ${statusColor(res.statusText)} ` +
        `${pc.gray(`(${duration}ms)`)}`
      );

      const text = await res.text();
      const isJson = res.headers.get('content-type')?.includes('json');

      if (isJson) {
        try {
          const data = JSON.parse(text);
          console.log(highlight(JSON.stringify(data, null, 2)));
          this.lastResponse = data;
        } catch {
          console.log(text);
          this.lastResponse = text;
        }
      } else {
        console.log(text.slice(0, 500) + (text.length > 500 ? '...' : ''));
        this.lastResponse = text;
      }

    } catch (error: any) {
      console.error(pc.red(`Error: ${error.message}`));
    }
    console.log(''); // Spacer
  }

  private printHelp() {
    console.log(`
  ${pc.bold(pc.cyan('Rek Console Help'))}

  ${pc.bold('Core Commands:')}
    ${pc.green('url <url>')}           Set persistent Base URL.
    ${pc.green('set <key>=<val>')}     Set a session variable.
    ${pc.green('vars')}                List all session variables.
    ${pc.green('clear')}               Clear the screen.
    ${pc.green('exit')}                Exit the console.

  ${pc.bold('HTTP Requests:')}
    ${pc.green('<method> <path>')}     Execute HTTP request (GET, POST, PUT, DELETE, etc).
                             ${pc.gray('Params:')} ${pc.white('key=value')} (string) or ${pc.white('key:=value')} (typed).
                             ${pc.gray('Headers:')} ${pc.white('Key:Value')}

  ${pc.bold('Advanced Tools:')}
    ${pc.green('load <url>')}          Run Load Test.
                             ${pc.gray('Options:')}
                             ${pc.white('users=50')}      ${pc.gray('Concurrent users')}
                             ${pc.white('duration=300')}  ${pc.gray('Duration in seconds')}
                             ${pc.white('ramp=5')}        ${pc.gray('Ramp-up time in seconds')}
                             ${pc.white('mode=throughput')}${pc.gray('throughput | stress | realistic')}
                             ${pc.white('http2=false')}   ${pc.gray('Force HTTP/2')}

    ${pc.green('chat <provider>')}     Start AI Chat.
                             ${pc.gray('Providers:')} ${pc.white('openai')}, ${pc.white('anthropic')}
                             ${pc.gray('Arg:')} ${pc.white('model=...')} (optional)

    ${pc.green('ws <url>')}            Start interactive WebSocket session.
    ${pc.green('udp <url>')}           Send UDP packet.

  ${pc.bold('Examples:')}
    › url httpbin.org
    › get /json
    › post /post name="Neo" active:=true role:Admin
    › load /heavy-endpoint users=100 mode=stress
    › chat openai gpt-5.1
    `);
  }
}

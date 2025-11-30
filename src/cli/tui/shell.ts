import readline from 'node:readline';
import { promises as dns } from 'node:dns';
import { requireOptional } from '../../utils/optional-require.js';
import { createClient } from '../../core/client.js';
import { startInteractiveWebSocket } from './websocket.js';
import { whois, isDomainAvailable } from '../../utils/whois.js';
import { inspectTLS } from '../../utils/tls-inspector.js';
import { getSecurityRecords } from '../../utils/dns-toolkit.js';
import { rdap } from '../../utils/rdap.js';
import { ScrapeDocument } from '../../scrape/document.js';
import pc from '../../utils/colors.js';

// Lazy-loaded optional dependency
let highlight: (code: string, opts?: any) => string;

async function initDependencies() {
  if (!highlight) {
    try {
      const cardinal = await requireOptional<{ highlight: typeof highlight }>('cardinal', 'recker/cli');
      highlight = cardinal.highlight;
    } catch {
      // Fallback: no syntax highlighting if cardinal not installed
      highlight = (code: string) => code;
    }
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
  private currentDoc: ScrapeDocument | null = null;
  private currentDocUrl: string = '';

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
    const commands = [
      'get', 'post', 'put', 'delete', 'patch', 'head', 'options',
      'ws', 'udp', 'load', 'chat', 'ai',
      'whois', 'tls', 'ssl', 'dns', 'rdap', 'ping',
      'scrap', '$', '$text', '$attr', '$html', '$links', '$images', '$table',
      'help', 'clear', 'exit', 'set', 'url', 'vars'
    ];
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
      case 'whois':
        await this.runWhois(parts[1]);
        return;
      case 'tls':
      case 'ssl':
        await this.runTLS(parts[1], parts[2] ? parseInt(parts[2]) : 443);
        return;
      case 'dns':
        await this.runDNS(parts[1]);
        return;
      case 'rdap':
        await this.runRDAP(parts[1]);
        return;
      case 'ping':
        await this.runPing(parts[1]);
        return;
      case 'scrap':
        await this.runScrap(parts[1]);
        return;
      case '$':
        await this.runSelect(parts.slice(1).join(' '));
        return;
      case '$text':
        await this.runSelectText(parts.slice(1).join(' '));
        return;
      case '$attr':
        await this.runSelectAttr(parts[1], parts.slice(2).join(' '));
        return;
      case '$html':
        await this.runSelectHtml(parts.slice(1).join(' '));
        return;
      case '$links':
        await this.runSelectLinks(parts[1]);
        return;
      case '$images':
        await this.runSelectImages(parts[1]);
        return;
      case '$table':
        await this.runSelectTable(parts.slice(1).join(' '));
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

  private async runWhois(domain: string) {
    if (!domain) {
      console.log(pc.yellow('Usage: whois <domain>'));
      console.log(pc.gray('  Examples: whois google.com | whois 8.8.8.8'));
      return;
    }

    console.log(pc.gray(`Looking up ${domain}...`));
    const startTime = performance.now();

    try {
      const result = await whois(domain);
      const duration = Math.round(performance.now() - startTime);

      console.log(pc.green(`✔ WHOIS lookup completed`) + pc.gray(` (${duration}ms)`));
      console.log(pc.gray(`Server: ${result.server}\n`));

      // Display parsed fields
      const importantFields = [
        'domain name', 'registrar', 'registrar url',
        'creation date', 'registry expiry date', 'updated date',
        'domain status', 'name server', 'dnssec',
        'organization', 'orgname', 'cidr', 'netname', 'country'
      ];

      for (const field of importantFields) {
        const value = result.data[field];
        if (value) {
          const displayValue = Array.isArray(value) ? value.join(', ') : value;
          console.log(`  ${pc.cyan(field)}: ${displayValue}`);
        }
      }

      // Check availability hint
      const available = await isDomainAvailable(domain);
      if (available) {
        console.log(pc.green(`\n✓ Domain appears to be available`));
      }

      this.lastResponse = result.data;
    } catch (error: any) {
      console.error(pc.red(`WHOIS failed: ${error.message}`));
    }
    console.log('');
  }

  private async runTLS(host: string, port: number = 443) {
    if (!host) {
      console.log(pc.yellow('Usage: tls <host> [port]'));
      console.log(pc.gray('  Examples: tls google.com | tls api.stripe.com 443'));
      return;
    }

    // Strip protocol if present
    host = host.replace(/^https?:\/\//, '').split('/')[0];

    console.log(pc.gray(`Inspecting TLS for ${host}:${port}...`));
    const startTime = performance.now();

    try {
      const info = await inspectTLS(host, port);
      const duration = Math.round(performance.now() - startTime);

      const statusIcon = info.valid ? pc.green('✔') : pc.red('✖');
      const statusText = info.valid ? pc.green('Valid') : pc.red('Invalid/Expired');

      console.log(`${statusIcon} Certificate ${statusText}` + pc.gray(` (${duration}ms)\n`));

      // Certificate info
      console.log(pc.bold('  Certificate:'));
      console.log(`    ${pc.cyan('Subject')}: ${info.subject?.CN || info.subject?.O || 'N/A'}`);
      console.log(`    ${pc.cyan('Issuer')}: ${info.issuer?.CN || info.issuer?.O || 'N/A'}`);
      console.log(`    ${pc.cyan('Valid From')}: ${info.validFrom.toISOString()}`);
      console.log(`    ${pc.cyan('Valid To')}: ${info.validTo.toISOString()}`);

      // Days remaining with color coding
      const daysColor = info.daysRemaining < 30 ? pc.red : info.daysRemaining < 90 ? pc.yellow : pc.green;
      console.log(`    ${pc.cyan('Days Remaining')}: ${daysColor(String(info.daysRemaining))}`);

      // Connection info
      console.log(pc.bold('\n  Connection:'));
      console.log(`    ${pc.cyan('Protocol')}: ${info.protocol || 'N/A'}`);
      console.log(`    ${pc.cyan('Cipher')}: ${info.cipher?.name || 'N/A'}`);
      console.log(`    ${pc.cyan('Authorized')}: ${info.authorized ? pc.green('Yes') : pc.red('No')}`);
      if (info.authorizationError) {
        console.log(`    ${pc.cyan('Auth Error')}: ${pc.red(String(info.authorizationError))}`);
      }

      // Fingerprints
      console.log(pc.bold('\n  Fingerprints:'));
      console.log(`    ${pc.cyan('SHA1')}: ${info.fingerprint}`);
      console.log(`    ${pc.cyan('SHA256')}: ${info.fingerprint256}`);
      console.log(`    ${pc.cyan('Serial')}: ${info.serialNumber}`);

      this.lastResponse = info;
    } catch (error: any) {
      console.error(pc.red(`TLS inspection failed: ${error.message}`));
    }
    console.log('');
  }

  private async runDNS(domain: string) {
    if (!domain) {
      console.log(pc.yellow('Usage: dns <domain>'));
      console.log(pc.gray('  Examples: dns google.com | dns github.com'));
      return;
    }

    console.log(pc.gray(`Resolving DNS for ${domain}...`));
    const startTime = performance.now();

    try {
      // Parallel DNS lookups
      const [a, aaaa, mx, ns, txt, security] = await Promise.all([
        dns.resolve4(domain).catch(() => []),
        dns.resolve6(domain).catch(() => []),
        dns.resolveMx(domain).catch(() => []),
        dns.resolveNs(domain).catch(() => []),
        dns.resolveTxt(domain).catch(() => []),
        getSecurityRecords(domain).catch(() => ({}))
      ]);

      const duration = Math.round(performance.now() - startTime);
      console.log(pc.green(`✔ DNS resolved`) + pc.gray(` (${duration}ms)\n`));

      // A Records
      if (a.length) {
        console.log(pc.bold('  A Records (IPv4):'));
        a.forEach(ip => console.log(`    ${pc.cyan('→')} ${ip}`));
      }

      // AAAA Records
      if (aaaa.length) {
        console.log(pc.bold('  AAAA Records (IPv6):'));
        aaaa.forEach(ip => console.log(`    ${pc.cyan('→')} ${ip}`));
      }

      // NS Records
      if (ns.length) {
        console.log(pc.bold('  NS Records:'));
        ns.forEach(n => console.log(`    ${pc.cyan('→')} ${n}`));
      }

      // MX Records
      if (mx.length) {
        console.log(pc.bold('  MX Records:'));
        mx.sort((a, b) => a.priority - b.priority)
          .forEach(m => console.log(`    ${pc.cyan(String(m.priority).padStart(3))} ${m.exchange}`));
      }

      // Security Records
      const sec = security as any;
      if (sec.spf?.length) {
        console.log(pc.bold('  SPF:'));
        console.log(`    ${pc.gray(sec.spf[0].slice(0, 80))}${sec.spf[0].length > 80 ? '...' : ''}`);
      }
      if (sec.dmarc) {
        console.log(pc.bold('  DMARC:'));
        console.log(`    ${pc.gray(sec.dmarc.slice(0, 80))}${sec.dmarc.length > 80 ? '...' : ''}`);
      }
      if (sec.caa?.issue?.length) {
        console.log(pc.bold('  CAA:'));
        sec.caa.issue.forEach((ca: string) => console.log(`    ${pc.cyan('issue')} ${ca}`));
      }

      this.lastResponse = { a, aaaa, mx, ns, txt, security };
    } catch (error: any) {
      console.error(pc.red(`DNS lookup failed: ${error.message}`));
    }
    console.log('');
  }

  private async runRDAP(domain: string) {
    if (!domain) {
      console.log(pc.yellow('Usage: rdap <domain>'));
      console.log(pc.gray('  Examples: rdap google.com | rdap 8.8.8.8'));
      return;
    }

    console.log(pc.gray(`RDAP lookup for ${domain}...`));
    const startTime = performance.now();

    try {
      const result = await rdap(this.client, domain);
      const duration = Math.round(performance.now() - startTime);

      console.log(pc.green(`✔ RDAP lookup completed`) + pc.gray(` (${duration}ms)\n`));

      // Status
      if (result.status?.length) {
        console.log(pc.bold('  Status:'));
        result.status.forEach((s: string) => console.log(`    ${pc.cyan('→')} ${s}`));
      }

      // Events (registration, expiration, etc.)
      if (result.events?.length) {
        console.log(pc.bold('  Events:'));
        result.events.forEach((e: any) => {
          const date = new Date(e.eventDate).toISOString().split('T')[0];
          console.log(`    ${pc.cyan(e.eventAction.padEnd(15))} ${date}`);
        });
      }

      // Entities
      if (result.entities?.length) {
        console.log(pc.bold('  Entities:'));
        result.entities.forEach((e: any) => {
          const roles = e.roles?.join(', ') || 'unknown';
          console.log(`    ${pc.cyan(roles.padEnd(15))} ${e.handle || 'N/A'}`);
        });
      }

      // Handle (for IP lookups)
      if (result.handle) {
        console.log(`  ${pc.cyan('Handle')}: ${result.handle}`);
      }
      if (result.name) {
        console.log(`  ${pc.cyan('Name')}: ${result.name}`);
      }
      if (result.startAddress && result.endAddress) {
        console.log(`  ${pc.cyan('Range')}: ${result.startAddress} - ${result.endAddress}`);
      }

      this.lastResponse = result;
    } catch (error: any) {
      console.error(pc.red(`RDAP lookup failed: ${error.message}`));
      console.log(pc.gray('  Tip: RDAP may not be available for all TLDs. Try "whois" instead.'));
    }
    console.log('');
  }

  private async runPing(host: string) {
    if (!host) {
      console.log(pc.yellow('Usage: ping <host>'));
      return;
    }

    // Strip protocol if present
    host = host.replace(/^https?:\/\//, '').split('/')[0];

    console.log(pc.gray(`Pinging ${host}...`));

    try {
      // Quick TCP connect test to port 443 or 80
      const { connect } = await import('node:net');
      const port = 443;
      const startTime = performance.now();

      await new Promise<void>((resolve, reject) => {
        const socket = connect(port, host, () => {
          const duration = Math.round(performance.now() - startTime);
          console.log(pc.green(`✔ ${host}:${port} is reachable`) + pc.gray(` (${duration}ms)`));
          socket.end();
          resolve();
        });
        socket.on('error', reject);
        socket.setTimeout(5000, () => {
          socket.destroy();
          reject(new Error('Connection timed out'));
        });
      });
    } catch (error: any) {
      console.error(pc.red(`✖ ${host} is unreachable: ${error.message}`));
    }
    console.log('');
  }

  // === Web Scraping Methods ===

  private async runScrap(url?: string) {
    // If no URL provided, use baseUrl
    if (!url) {
      if (!this.baseUrl) {
        console.log(pc.yellow('Usage: scrap <url>'));
        console.log(pc.gray('  Examples: scrap https://news.ycombinator.com'));
        console.log(pc.gray('  Or set a base URL first: url https://example.com'));
        return;
      }
      url = this.baseUrl;
    } else if (!url.startsWith('http')) {
      // Build full URL from relative path
      url = this.baseUrl ? `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}` : `https://${url}`;
    }

    console.log(pc.gray(`Fetching ${url}...`));
    const startTime = performance.now();

    try {
      const response = await this.client.get(url);
      const html = await response.text();
      const duration = Math.round(performance.now() - startTime);

      this.currentDoc = await ScrapeDocument.create(html);
      this.currentDocUrl = url;

      const elementCount = this.currentDoc.select('*').length;
      const title = this.currentDoc.selectFirst('title').text() || 'No title';

      console.log(pc.green(`✔ Loaded`) + pc.gray(` (${duration}ms)`));
      console.log(`  ${pc.cyan('Title')}: ${title}`);
      console.log(`  ${pc.cyan('Elements')}: ${elementCount}`);
      console.log(`  ${pc.cyan('Size')}: ${(html.length / 1024).toFixed(1)}kb`);
      console.log(pc.gray('\n  Use $ <selector> to query, $text, $attr, $links, $images, $table'));
    } catch (error: any) {
      console.error(pc.red(`Scrape failed: ${error.message}`));
    }
    console.log('');
  }

  private async runSelect(selector: string) {
    if (!this.currentDoc) {
      console.log(pc.yellow('No document loaded. Use "scrap <url>" first.'));
      return;
    }
    if (!selector) {
      console.log(pc.yellow('Usage: $ <selector>'));
      console.log(pc.gray('  Examples: $ h1 | $ .title | $ a[href*="article"]'));
      return;
    }

    try {
      const elements = this.currentDoc.select(selector);
      const count = elements.length;
      console.log(pc.cyan(`Found ${count} element(s)`));

      if (count > 0 && count <= 10) {
        elements.each((el, i) => {
          const text = el.text().slice(0, 80).replace(/\s+/g, ' ').trim();
          console.log(`  ${pc.gray(`${i + 1}.`)} ${text}${text.length >= 80 ? '...' : ''}`);
        });
      } else if (count > 10) {
        console.log(pc.gray('  (showing first 10)'));
        let shown = 0;
        elements.each((el, i) => {
          if (shown >= 10) return;
          const text = el.text().slice(0, 80).replace(/\s+/g, ' ').trim();
          console.log(`  ${pc.gray(`${i + 1}.`)} ${text}${text.length >= 80 ? '...' : ''}`);
          shown++;
        });
      }
      this.lastResponse = { count, selector };
    } catch (error: any) {
      console.error(pc.red(`Query failed: ${error.message}`));
    }
    console.log('');
  }

  private async runSelectText(selector: string) {
    if (!this.currentDoc) {
      console.log(pc.yellow('No document loaded. Use "scrap <url>" first.'));
      return;
    }
    if (!selector) {
      console.log(pc.yellow('Usage: $text <selector>'));
      return;
    }

    try {
      const elements = this.currentDoc.select(selector);
      const texts: string[] = [];

      elements.each((el, i) => {
        const text = el.text().trim();
        if (text) {
          texts.push(text);
          console.log(`${pc.gray(`${i + 1}.`)} ${text.slice(0, 200)}${text.length > 200 ? '...' : ''}`);
        }
      });

      this.lastResponse = texts;
      console.log(pc.gray(`\n  ${texts.length} text item(s) extracted`));
    } catch (error: any) {
      console.error(pc.red(`Query failed: ${error.message}`));
    }
    console.log('');
  }

  private async runSelectAttr(attrName: string, selector: string) {
    if (!this.currentDoc) {
      console.log(pc.yellow('No document loaded. Use "scrap <url>" first.'));
      return;
    }
    if (!attrName || !selector) {
      console.log(pc.yellow('Usage: $attr <attribute> <selector>'));
      console.log(pc.gray('  Examples: $attr href a | $attr src img'));
      return;
    }

    try {
      const elements = this.currentDoc.select(selector);
      const attrs: string[] = [];

      elements.each((el, i) => {
        const value = el.attr(attrName);
        if (value) {
          attrs.push(value);
          console.log(`${pc.gray(`${i + 1}.`)} ${value}`);
        }
      });

      this.lastResponse = attrs;
      console.log(pc.gray(`\n  ${attrs.length} attribute(s) extracted`));
    } catch (error: any) {
      console.error(pc.red(`Query failed: ${error.message}`));
    }
    console.log('');
  }

  private async runSelectHtml(selector: string) {
    if (!this.currentDoc) {
      console.log(pc.yellow('No document loaded. Use "scrap <url>" first.'));
      return;
    }
    if (!selector) {
      console.log(pc.yellow('Usage: $html <selector>'));
      return;
    }

    try {
      const element = this.currentDoc.selectFirst(selector);
      const html = element.html();

      if (html) {
        console.log(html.slice(0, 1000));
        if (html.length > 1000) {
          console.log(pc.gray(`\n  ... (${html.length} chars total)`));
        }
        this.lastResponse = html;
      } else {
        console.log(pc.gray('No element found'));
      }
    } catch (error: any) {
      console.error(pc.red(`Query failed: ${error.message}`));
    }
    console.log('');
  }

  private async runSelectLinks(selector?: string) {
    if (!this.currentDoc) {
      console.log(pc.yellow('No document loaded. Use "scrap <url>" first.'));
      return;
    }

    try {
      const linkSelector = selector || 'a[href]';
      const elements = this.currentDoc.select(linkSelector);
      const links: Array<{ text: string; href: string }> = [];

      elements.each((el, i) => {
        const href = el.attr('href');
        const text = el.text().trim().slice(0, 50);
        if (href) {
          links.push({ text, href });
          if (i < 20) {
            console.log(`${pc.gray(`${i + 1}.`)} ${pc.cyan(text || '(no text)')} ${pc.gray('→')} ${href}`);
          }
        }
      });

      if (links.length > 20) {
        console.log(pc.gray(`  ... and ${links.length - 20} more links`));
      }

      this.lastResponse = links;
      console.log(pc.gray(`\n  ${links.length} link(s) found`));
    } catch (error: any) {
      console.error(pc.red(`Query failed: ${error.message}`));
    }
    console.log('');
  }

  private async runSelectImages(selector?: string) {
    if (!this.currentDoc) {
      console.log(pc.yellow('No document loaded. Use "scrap <url>" first.'));
      return;
    }

    try {
      const imgSelector = selector || 'img[src]';
      const elements = this.currentDoc.select(imgSelector);
      const images: Array<{ alt: string; src: string }> = [];

      elements.each((el, i) => {
        const src = el.attr('src');
        const alt = el.attr('alt') || '';
        if (src) {
          images.push({ alt, src });
          if (i < 20) {
            console.log(`${pc.gray(`${i + 1}.`)} ${pc.cyan(alt.slice(0, 30) || '(no alt)')} ${pc.gray('→')} ${src.slice(0, 60)}`);
          }
        }
      });

      if (images.length > 20) {
        console.log(pc.gray(`  ... and ${images.length - 20} more images`));
      }

      this.lastResponse = images;
      console.log(pc.gray(`\n  ${images.length} image(s) found`));
    } catch (error: any) {
      console.error(pc.red(`Query failed: ${error.message}`));
    }
    console.log('');
  }

  private async runSelectTable(selector: string) {
    if (!this.currentDoc) {
      console.log(pc.yellow('No document loaded. Use "scrap <url>" first.'));
      return;
    }
    if (!selector) {
      console.log(pc.yellow('Usage: $table <selector>'));
      console.log(pc.gray('  Examples: $table table | $table .data-table'));
      return;
    }

    try {
      const tables = this.currentDoc.tables(selector);

      if (tables.length === 0) {
        console.log(pc.gray('No tables found'));
        return;
      }

      tables.forEach((table, tableIndex) => {
        console.log(pc.bold(`\nTable ${tableIndex + 1}:`));

        if (table.headers.length > 0) {
          console.log(pc.cyan('  Headers: ') + table.headers.join(' | '));
        }

        console.log(pc.cyan(`  Rows: `) + table.rows.length);

        // Show first 5 rows
        table.rows.slice(0, 5).forEach((row, i) => {
          const rowStr = row.map(cell => cell.slice(0, 20)).join(' | ');
          console.log(`  ${pc.gray(`${i + 1}.`)} ${rowStr}`);
        });

        if (table.rows.length > 5) {
          console.log(pc.gray(`  ... and ${table.rows.length - 5} more rows`));
        }
      });

      this.lastResponse = tables;
    } catch (error: any) {
      console.error(pc.red(`Query failed: ${error.message}`));
    }
    console.log('');
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

  ${pc.bold('Network Tools:')}
    ${pc.green('whois <domain>')}      WHOIS lookup (domain or IP).
    ${pc.green('tls <host> [port]')}   Inspect TLS/SSL certificate.
    ${pc.green('dns <domain>')}        Full DNS lookup (A, AAAA, MX, NS, SPF, DMARC).
    ${pc.green('rdap <domain>')}       RDAP lookup (modern WHOIS).
    ${pc.green('ping <host>')}         Quick TCP connectivity check.

  ${pc.bold('Web Scraping:')}
    ${pc.green('scrap <url>')}         Fetch and parse HTML document.
    ${pc.green('$ <selector>')}        Query elements (CSS selector).
    ${pc.green('$text <selector>')}    Extract text content.
    ${pc.green('$attr <name> <sel>')}  Extract attribute values.
    ${pc.green('$html <selector>')}    Get inner HTML.
    ${pc.green('$links [selector]')}   List all links.
    ${pc.green('$images [selector]')}  List all images.
    ${pc.green('$table <selector>')}   Extract table as data.

  ${pc.bold('Examples:')}
    › url httpbin.org
    › get /json
    › post /post name="Neo" active:=true role:Admin
    › load /heavy-endpoint users=100 mode=stress
    › chat openai gpt-5.1
    `);
  }
}

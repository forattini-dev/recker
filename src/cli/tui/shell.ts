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
import colors from '../../utils/colors.js';

// Lazy-loaded optional dependency (syntax highlighting only)
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
    const base = this.baseUrl ? colors.cyan(new URL(this.baseUrl).hostname) : colors.gray('rek');
    return `${base} ${colors.magenta('›')} `;
  }

  /** Extract domain/hostname from baseUrl */
  private getBaseDomain(): string | null {
    if (!this.baseUrl) return null;
    try {
      return new URL(this.baseUrl).hostname;
    } catch {
      return null;
    }
  }

  /** Extract root domain (e.g., tetis.io from www.tetis.io) for WHOIS/RDAP lookups */
  private getRootDomain(): string | null {
    const hostname = this.getBaseDomain();
    if (!hostname) return null;

    // Remove common subdomains for WHOIS/RDAP lookups
    const parts = hostname.split('.');
    if (parts.length <= 2) return hostname;

    // Handle common patterns: www.example.com, api.example.com, etc.
    // Keep last 2 parts for normal TLDs, or last 3 for co.uk, com.br, etc.
    const commonSLDs = ['co', 'com', 'net', 'org', 'gov', 'edu', 'ac'];
    if (parts.length >= 3 && commonSLDs.includes(parts[parts.length - 2])) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  }

  private completer(line: string) {
    const commands = [
      'get', 'post', 'put', 'delete', 'patch', 'head', 'options',
      'ws', 'udp', 'load', 'chat', 'ai',
      'whois', 'tls', 'ssl', 'dns', 'rdap', 'ping',
      'scrap', '$', '$text', '$attr', '$html', '$links', '$images', '$scripts', '$css', '$sourcemaps', '$unmap', '$unmap:view', '$unmap:save', '$beautify', '$beautify:save', '$table',
      'help', 'clear', 'exit', 'set', 'url', 'vars'
    ];

    const hits = commands.filter((c) => c.startsWith(line));
    return [hits.length ? hits : commands, line];
  }

  public async start() {
    await this.ensureInitialized();

    console.clear();
    console.log(colors.bold(colors.cyan('Rek Console')));
    console.log(colors.gray('Chat with your APIs. Type "help" for magic.'));
    console.log(colors.gray('--------------------------------------------\n'));

    this.prompt();

    this.rl.on('line', async (line) => {
      const input = line.trim();
      if (input) {
        await this.handleCommand(input);
      }
      this.prompt();
    });

    // Ctrl+C exits the shell
    this.rl.on('SIGINT', () => {
      console.log('');
      this.rl.close();
    });

    this.rl.on('close', () => {
      console.log(colors.gray('\nSee ya.'));
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
        await this.runSelectImages(parts.slice(1).join(' ') || undefined);
        return;
      case '$scripts':
        await this.runSelectScripts();
        return;
      case '$css':
        await this.runSelectCSS();
        return;
      case '$sourcemaps':
        await this.runSelectSourcemaps();
        return;
      case '$unmap':
        await this.runUnmap(parts.slice(1).join(' '));
        return;
      case '$unmap:view':
        await this.runUnmapView(parts[1] || '');
        return;
      case '$unmap:save':
        await this.runUnmapSave(parts[1] || '');
        return;
      case '$beautify':
        await this.runBeautify(parts.slice(1).join(' '));
        return;
      case '$beautify:save':
        await this.runBeautifySave(parts[1] || '');
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
      console.log(colors.red(`Unknown command: ${cmd}`));
      return;
    }

    // Resolve URL
    url = this.resolveUrl(url);
    if (!url) {
      console.log(colors.yellow('No URL provided and no Base URL set. Use "url <url>" or provide full URL.'));
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
    let mode: any = 'realistic';
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
        console.log(colors.yellow('Target URL required. usage: load <url> users=10 duration=10s ramp=5'));
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
        console.error(colors.red('Load Test Failed: ' + e.message));
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
    console.log(colors.gray(`Base URL set to: ${colors.cyan(this.baseUrl)}`));
  }

  private setVariable(args: string[]) {
    // set token=123
    const [expr] = args;
    if (!expr || !expr.includes('=')) return;
    const [key, val] = expr.split('=');
    this.variables[key] = val;
    console.log(colors.gray(`Variable $${key} set.`));
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
      console.log(colors.gray(`UDP packet -> ${url}`));
      const res = await transport.dispatch({
        url, method: 'GET', headers: new Headers(),
        body: msg, withHeader: () => ({} as any), withBody: () => ({} as any)
      });
      const text = await res.text();
      console.log(colors.green('✔ Sent/Received'));
      if (text) console.log(text);
      return;
    }

    // HTTP Request
    console.log(colors.gray(`${method} ${url}...`));

    try {
      const hasBody = Object.keys(body).length > 0;
      const res = await this.client.request(url, {
        method: method as any,
        headers,
        json: hasBody ? body : undefined
      });

      const duration = Math.round(performance.now() - startTime);
      const statusColor = res.ok ? colors.green : colors.red;

      console.log(
        `${statusColor(colors.bold(res.status))} ${statusColor(res.statusText)} ` +
        `${colors.gray(`(${duration}ms)`)}`
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
      console.error(colors.red(`Error: ${error.message}`));
    }
    console.log(''); // Spacer
  }

  private async runWhois(domain?: string) {
    if (!domain) {
      domain = this.getRootDomain() || '';
      if (!domain) {
        console.log(colors.yellow('Usage: whois <domain>'));
        console.log(colors.gray('  Examples: whois google.com | whois 8.8.8.8'));
        console.log(colors.gray('  Or set a base URL first: url https://example.com'));
        return;
      }
    }

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (attempt === 1) {
        console.log(colors.gray(`Looking up ${domain}...`));
      } else {
        console.log(colors.gray(`Retrying (${attempt}/${maxRetries})...`));
      }

      const startTime = performance.now();

      try {
        const result = await whois(domain);
        const duration = Math.round(performance.now() - startTime);

        console.log(colors.green(`✔ WHOIS lookup completed`) + colors.gray(` (${duration}ms)`));
        console.log(colors.gray(`Server: ${result.server}\n`));

        // Display parsed fields - prioritize important ones
        const importantFields = [
          'domain name', 'registrar', 'registrar url',
          'creation date', 'registry expiry date', 'updated date',
          'domain status', 'name server', 'dnssec',
          'organization', 'orgname', 'cidr', 'netname', 'country'
        ];

        let foundFields = 0;
        for (const field of importantFields) {
          const value = result.data[field];
          if (value) {
            const displayValue = Array.isArray(value) ? value.join(', ') : value;
            console.log(`  ${colors.cyan(field)}: ${displayValue}`);
            foundFields++;
          }
        }

        // If no important fields found, show all available fields
        if (foundFields === 0 && Object.keys(result.data).length > 0) {
          console.log(colors.gray('  (showing all available fields)\n'));
          for (const [key, value] of Object.entries(result.data)) {
            if (value) {
              const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
              console.log(`  ${colors.cyan(key)}: ${displayValue}`);
            }
          }
        }

        // If still nothing, show raw response
        if (Object.keys(result.data).length === 0 && result.raw) {
          console.log(colors.gray('  (raw response)\n'));
          console.log(colors.white(result.raw.slice(0, 2000)));
        }

        // Check availability hint
        const available = await isDomainAvailable(domain);
        if (available) {
          console.log(colors.green(`\n✓ Domain appears to be available`));
        }

        this.lastResponse = result.data;
        console.log('');
        return; // Success, exit the retry loop
      } catch (error: any) {
        lastError = error;

        // Check if error is retryable (connection issues, timeouts)
        const isRetryable = error.code === 'ECONNRESET' ||
          error.code === 'ECONNREFUSED' ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ENOTFOUND' ||
          error.message?.includes('timeout') ||
          error.message?.includes('WHOIS query failed');

        if (!isRetryable || attempt === maxRetries) {
          break; // Don't retry non-retryable errors or on last attempt
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      }
    }

    // All retries failed
    const errorMsg = lastError?.message || 'Unknown error';
    const errorCode = (lastError as any)?.code;
    console.error(colors.red(`WHOIS failed: ${errorMsg}`));
    if (errorCode) {
      console.error(colors.gray(`  Error code: ${errorCode}`));
    }
    if ((lastError as any)?.suggestions?.length) {
      console.log(colors.yellow('  Suggestions:'));
      for (const suggestion of (lastError as any).suggestions) {
        console.log(colors.gray(`    • ${suggestion}`));
      }
    }
    console.log('');
  }

  private async runTLS(host?: string, port: number = 443) {
    if (!host) {
      host = this.getBaseDomain() || '';
      if (!host) {
        console.log(colors.yellow('Usage: tls <host> [port]'));
        console.log(colors.gray('  Examples: tls google.com | tls api.stripe.com 443'));
        console.log(colors.gray('  Or set a base URL first: url https://example.com'));
        return;
      }
    } else {
      // Strip protocol if present
      host = host.replace(/^https?:\/\//, '').split('/')[0];
    }

    console.log(colors.gray(`Inspecting TLS for ${host}:${port}...`));
    const startTime = performance.now();

    try {
      const info = await inspectTLS(host, port);
      const duration = Math.round(performance.now() - startTime);

      const statusIcon = info.valid ? colors.green('✔') : colors.red('✖');
      const statusText = info.valid ? colors.green('Valid') : colors.red('Invalid/Expired');

      console.log(`${statusIcon} Certificate ${statusText}` + colors.gray(` (${duration}ms)\n`));

      // Certificate info
      console.log(colors.bold('  Certificate:'));
      console.log(`    ${colors.cyan('Subject')}: ${info.subject?.CN || info.subject?.O || 'N/A'}`);
      console.log(`    ${colors.cyan('Issuer')}: ${info.issuer?.CN || info.issuer?.O || 'N/A'}`);
      console.log(`    ${colors.cyan('Valid From')}: ${info.validFrom.toISOString()}`);
      console.log(`    ${colors.cyan('Valid To')}: ${info.validTo.toISOString()}`);

      // Days remaining with color coding
      const daysColor = info.daysRemaining < 30 ? colors.red : info.daysRemaining < 90 ? colors.yellow : colors.green;
      console.log(`    ${colors.cyan('Days Remaining')}: ${daysColor(String(info.daysRemaining))}`);

      // Connection info
      console.log(colors.bold('\n  Connection:'));
      console.log(`    ${colors.cyan('Protocol')}: ${info.protocol || 'N/A'}`);
      console.log(`    ${colors.cyan('Cipher')}: ${info.cipher?.name || 'N/A'}`);
      console.log(`    ${colors.cyan('Authorized')}: ${info.authorized ? colors.green('Yes') : colors.red('No')}`);
      if (info.authorizationError) {
        console.log(`    ${colors.cyan('Auth Error')}: ${colors.red(String(info.authorizationError))}`);
      }

      // Fingerprints
      console.log(colors.bold('\n  Fingerprints:'));
      console.log(`    ${colors.cyan('SHA1')}: ${info.fingerprint}`);
      console.log(`    ${colors.cyan('SHA256')}: ${info.fingerprint256}`);
      console.log(`    ${colors.cyan('Serial')}: ${info.serialNumber}`);

      this.lastResponse = info;
    } catch (error: any) {
      console.error(colors.red(`TLS inspection failed: ${error.message}`));
    }
    console.log('');
  }

  private async runDNS(domain?: string) {
    if (!domain) {
      domain = this.getBaseDomain() || '';
      if (!domain) {
        console.log(colors.yellow('Usage: dns <domain>'));
        console.log(colors.gray('  Examples: dns google.com | dns github.com'));
        console.log(colors.gray('  Or set a base URL first: url https://example.com'));
        return;
      }
    }

    console.log(colors.gray(`Resolving DNS for ${domain}...`));
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
      console.log(colors.green(`✔ DNS resolved`) + colors.gray(` (${duration}ms)\n`));

      // A Records
      if (a.length) {
        console.log(colors.bold('  A Records (IPv4):'));
        a.forEach(ip => console.log(`    ${colors.cyan('→')} ${ip}`));
      }

      // AAAA Records
      if (aaaa.length) {
        console.log(colors.bold('  AAAA Records (IPv6):'));
        aaaa.forEach(ip => console.log(`    ${colors.cyan('→')} ${ip}`));
      }

      // NS Records
      if (ns.length) {
        console.log(colors.bold('  NS Records:'));
        ns.forEach(n => console.log(`    ${colors.cyan('→')} ${n}`));
      }

      // MX Records
      if (mx.length) {
        console.log(colors.bold('  MX Records:'));
        mx.sort((a, b) => a.priority - b.priority)
          .forEach(m => console.log(`    ${colors.cyan(String(m.priority).padStart(3))} ${m.exchange}`));
      }

      // Security Records
      const sec = security as any;
      if (sec.spf?.length) {
        console.log(colors.bold('  SPF:'));
        console.log(`    ${colors.gray(sec.spf[0].slice(0, 80))}${sec.spf[0].length > 80 ? '...' : ''}`);
      }
      if (sec.dmarc) {
        console.log(colors.bold('  DMARC:'));
        console.log(`    ${colors.gray(sec.dmarc.slice(0, 80))}${sec.dmarc.length > 80 ? '...' : ''}`);
      }
      if (sec.caa?.issue?.length) {
        console.log(colors.bold('  CAA:'));
        sec.caa.issue.forEach((ca: string) => console.log(`    ${colors.cyan('issue')} ${ca}`));
      }

      this.lastResponse = { a, aaaa, mx, ns, txt, security };
    } catch (error: any) {
      console.error(colors.red(`DNS lookup failed: ${error.message}`));
    }
    console.log('');
  }

  private async runRDAP(domain?: string) {
    if (!domain) {
      domain = this.getRootDomain() || '';
      if (!domain) {
        console.log(colors.yellow('Usage: rdap <domain>'));
        console.log(colors.gray('  Examples: rdap google.com | rdap 8.8.8.8'));
        console.log(colors.gray('  Or set a base URL first: url https://example.com'));
        return;
      }
    }

    console.log(colors.gray(`RDAP lookup for ${domain}...`));
    const startTime = performance.now();

    try {
      const result = await rdap(this.client, domain);
      const duration = Math.round(performance.now() - startTime);

      console.log(colors.green(`✔ RDAP lookup completed`) + colors.gray(` (${duration}ms)\n`));

      // Status
      if (result.status?.length) {
        console.log(colors.bold('  Status:'));
        result.status.forEach((s: string) => console.log(`    ${colors.cyan('→')} ${s}`));
      }

      // Events (registration, expiration, etc.)
      if (result.events?.length) {
        console.log(colors.bold('  Events:'));
        result.events.forEach((e: any) => {
          const date = new Date(e.eventDate).toISOString().split('T')[0];
          console.log(`    ${colors.cyan(e.eventAction.padEnd(15))} ${date}`);
        });
      }

      // Entities
      if (result.entities?.length) {
        console.log(colors.bold('  Entities:'));
        result.entities.forEach((e: any) => {
          const roles = e.roles?.join(', ') || 'unknown';
          console.log(`    ${colors.cyan(roles.padEnd(15))} ${e.handle || 'N/A'}`);
        });
      }

      // Handle (for IP lookups)
      if (result.handle) {
        console.log(`  ${colors.cyan('Handle')}: ${result.handle}`);
      }
      if (result.name) {
        console.log(`  ${colors.cyan('Name')}: ${result.name}`);
      }
      if (result.startAddress && result.endAddress) {
        console.log(`  ${colors.cyan('Range')}: ${result.startAddress} - ${result.endAddress}`);
      }

      this.lastResponse = result;
    } catch (error: any) {
      console.error(colors.red(`RDAP lookup failed: ${error.message}`));
      console.log(colors.gray('  Tip: RDAP may not be available for all TLDs. Try "whois" instead.'));
    }
    console.log('');
  }

  private async runPing(host?: string) {
    if (!host) {
      host = this.getBaseDomain() || '';
      if (!host) {
        console.log(colors.yellow('Usage: ping <host>'));
        console.log(colors.gray('  Or set a base URL first: url https://example.com'));
        return;
      }
    } else {
      // Strip protocol if present
      host = host.replace(/^https?:\/\//, '').split('/')[0];
    }

    console.log(colors.gray(`Pinging ${host}...`));

    try {
      // Quick TCP connect test to port 443 or 80
      const { connect } = await import('node:net');
      const port = 443;
      const startTime = performance.now();

      await new Promise<void>((resolve, reject) => {
        const socket = connect(port, host, () => {
          const duration = Math.round(performance.now() - startTime);
          console.log(colors.green(`✔ ${host}:${port} is reachable`) + colors.gray(` (${duration}ms)`));
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
      console.error(colors.red(`✖ ${host} is unreachable: ${error.message}`));
    }
    console.log('');
  }

  // === Web Scraping Methods ===

  private async runScrap(url?: string) {
    // If no URL provided, use baseUrl
    if (!url) {
      if (!this.baseUrl) {
        console.log(colors.yellow('Usage: scrap <url>'));
        console.log(colors.gray('  Examples: scrap https://news.ycombinator.com'));
        console.log(colors.gray('  Or set a base URL first: url https://example.com'));
        return;
      }
      url = this.baseUrl;
    } else if (!url.startsWith('http')) {
      // Build full URL from relative path
      url = this.baseUrl ? `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}` : `https://${url}`;
    }

    console.log(colors.gray(`Fetching ${url}...`));
    const startTime = performance.now();

    try {
      const response = await this.client.get(url);
      const html = await response.text();
      const duration = Math.round(performance.now() - startTime);

      this.currentDoc = await ScrapeDocument.create(html, { baseUrl: url });
      this.currentDocUrl = url;

      const elementCount = this.currentDoc.select('*').length;
      const title = this.currentDoc.selectFirst('title').text() || 'No title';
      const meta = this.currentDoc.meta();
      const og = this.currentDoc.openGraph();

      console.log(colors.green(`✔ Loaded`) + colors.gray(` (${duration}ms)`));
      console.log(`  ${colors.cyan('Title')}: ${title}`);
      console.log(`  ${colors.cyan('Elements')}: ${elementCount}`);
      console.log(`  ${colors.cyan('Size')}: ${(html.length / 1024).toFixed(1)}kb`);

      // Show meta description if available
      if (meta.description) {
        const desc = meta.description.length > 100 ? meta.description.slice(0, 100) + '...' : meta.description;
        console.log(`  ${colors.cyan('Description')}: ${desc}`);
      }

      // Show OpenGraph data if available
      const hasOg = og.title || og.description || og.image || og.siteName;
      if (hasOg) {
        console.log(colors.bold('\n  OpenGraph:'));
        if (og.siteName) console.log(`    ${colors.magenta('Site')}: ${og.siteName}`);
        if (og.title && og.title !== title) console.log(`    ${colors.magenta('Title')}: ${og.title}`);
        if (og.type) console.log(`    ${colors.magenta('Type')}: ${og.type}`);
        if (og.description) {
          const ogDesc = og.description.length > 80 ? og.description.slice(0, 80) + '...' : og.description;
          console.log(`    ${colors.magenta('Description')}: ${ogDesc}`);
        }
        if (og.image) {
          const images = Array.isArray(og.image) ? og.image : [og.image];
          console.log(`    ${colors.magenta('Image')}: ${images[0]}`);
          if (images.length > 1) console.log(colors.gray(`      (+${images.length - 1} more)`));
        }
        if (og.url && og.url !== url) console.log(`    ${colors.magenta('URL')}: ${og.url}`);
      }

      console.log(colors.gray('\n  Use $ <selector> to query, $text, $attr, $links, $images, $scripts, $css, $sourcemaps, $table'));
    } catch (error: any) {
      console.error(colors.red(`Scrape failed: ${error.message}`));
    }
    console.log('');
  }

  private async runSelect(selector: string) {
    if (!this.currentDoc) {
      console.log(colors.yellow('No document loaded. Use "scrap <url>" first.'));
      return;
    }
    if (!selector) {
      console.log(colors.yellow('Usage: $ <selector>'));
      console.log(colors.gray('  Examples: $ h1 | $ .title | $ a[href*="article"]'));
      return;
    }

    try {
      const elements = this.currentDoc.select(selector);
      const count = elements.length;
      console.log(colors.cyan(`Found ${count} element(s)`));

      if (count > 0 && count <= 10) {
        elements.each((el, i) => {
          const text = el.text().slice(0, 80).replace(/\s+/g, ' ').trim();
          console.log(`  ${colors.gray(`${i + 1}.`)} ${text}${text.length >= 80 ? '...' : ''}`);
        });
      } else if (count > 10) {
        console.log(colors.gray('  (showing first 10)'));
        let shown = 0;
        elements.each((el, i) => {
          if (shown >= 10) return;
          const text = el.text().slice(0, 80).replace(/\s+/g, ' ').trim();
          console.log(`  ${colors.gray(`${i + 1}.`)} ${text}${text.length >= 80 ? '...' : ''}`);
          shown++;
        });
      }
      this.lastResponse = { count, selector };
    } catch (error: any) {
      console.error(colors.red(`Query failed: ${error.message}`));
    }
    console.log('');
  }

  private async runSelectText(selector: string) {
    if (!this.currentDoc) {
      console.log(colors.yellow('No document loaded. Use "scrap <url>" first.'));
      return;
    }
    if (!selector) {
      console.log(colors.yellow('Usage: $text <selector>'));
      return;
    }

    try {
      const elements = this.currentDoc.select(selector);
      const texts: string[] = [];

      elements.each((el, i) => {
        const text = el.text().trim();
        if (text) {
          texts.push(text);
          console.log(`${colors.gray(`${i + 1}.`)} ${text.slice(0, 200)}${text.length > 200 ? '...' : ''}`);
        }
      });

      this.lastResponse = texts;
      console.log(colors.gray(`\n  ${texts.length} text item(s) extracted`));
    } catch (error: any) {
      console.error(colors.red(`Query failed: ${error.message}`));
    }
    console.log('');
  }

  private async runSelectAttr(attrName: string, selector: string) {
    if (!this.currentDoc) {
      console.log(colors.yellow('No document loaded. Use "scrap <url>" first.'));
      return;
    }
    if (!attrName || !selector) {
      console.log(colors.yellow('Usage: $attr <attribute> <selector>'));
      console.log(colors.gray('  Examples: $attr href a | $attr src img'));
      return;
    }

    try {
      const elements = this.currentDoc.select(selector);
      const attrs: string[] = [];

      elements.each((el, i) => {
        const value = el.attr(attrName);
        if (value) {
          attrs.push(value);
          console.log(`${colors.gray(`${i + 1}.`)} ${value}`);
        }
      });

      this.lastResponse = attrs;
      console.log(colors.gray(`\n  ${attrs.length} attribute(s) extracted`));
    } catch (error: any) {
      console.error(colors.red(`Query failed: ${error.message}`));
    }
    console.log('');
  }

  private async runSelectHtml(selector: string) {
    if (!this.currentDoc) {
      console.log(colors.yellow('No document loaded. Use "scrap <url>" first.'));
      return;
    }
    if (!selector) {
      console.log(colors.yellow('Usage: $html <selector>'));
      return;
    }

    try {
      const element = this.currentDoc.selectFirst(selector);
      const html = element.html();

      if (html) {
        console.log(html.slice(0, 1000));
        if (html.length > 1000) {
          console.log(colors.gray(`\n  ... (${html.length} chars total)`));
        }
        this.lastResponse = html;
      } else {
        console.log(colors.gray('No element found'));
      }
    } catch (error: any) {
      console.error(colors.red(`Query failed: ${error.message}`));
    }
    console.log('');
  }

  private async runSelectLinks(selector?: string) {
    if (!this.currentDoc) {
      console.log(colors.yellow('No document loaded. Use "scrap <url>" first.'));
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
            console.log(`${colors.gray(`${i + 1}.`)} ${colors.cyan(text || '(no text)')} ${colors.gray('→')} ${href}`);
          }
        }
      });

      if (links.length > 20) {
        console.log(colors.gray(`  ... and ${links.length - 20} more links`));
      }

      this.lastResponse = links;
      console.log(colors.gray(`\n  ${links.length} link(s) found`));
    } catch (error: any) {
      console.error(colors.red(`Query failed: ${error.message}`));
    }
    console.log('');
  }

  private async runSelectImages(selector?: string) {
    if (!this.currentDoc) {
      console.log(colors.yellow('No document loaded. Use "scrap <url>" first.'));
      return;
    }

    try {
      const imageExtensions = /\.(png|jpg|jpeg|gif|webp|svg|ico|bmp|tiff|avif)(\?.*)?$/i;
      const images: Array<{ type: string; src: string; alt?: string }> = [];

      // If selector provided, scope searches to that element
      const scope = selector ? `${selector} ` : '';

      // 1. <img> tags
      this.currentDoc.select(`${scope}img[src]`).each((el) => {
        const src = el.attr('src');
        if (src) images.push({ type: 'img', src, alt: el.attr('alt') });
      });

      // 2. <source> tags (picture element)
      this.currentDoc.select(`${scope}source[srcset]`).each((el) => {
        const srcset = el.attr('srcset');
        if (srcset) {
          // Extract first URL from srcset
          const src = srcset.split(',')[0].trim().split(' ')[0];
          if (src) images.push({ type: 'source', src });
        }
      });

      // 3. CSS background-image in style attributes
      this.currentDoc.select(`${scope}[style*="background"]`).each((el) => {
        const style = el.attr('style') || '';
        const matches = style.match(/url\(['"]?([^'"()]+)['"]?\)/gi);
        if (matches) {
          matches.forEach(m => {
            const src = m.replace(/url\(['"]?|['"]?\)/gi, '');
            if (imageExtensions.test(src)) images.push({ type: 'bg', src });
          });
        }
      });

      // 4. <link> with image extensions (only when no selector - these are in <head>)
      if (!selector) {
        this.currentDoc.select('link[href]').each((el) => {
          const href = el.attr('href');
          if (href && imageExtensions.test(href)) {
            images.push({ type: 'link', src: href });
          }
        });

        // 5. meta og:image, twitter:image (only when no selector - these are in <head>)
        this.currentDoc.select('meta[property="og:image"], meta[name="twitter:image"]').each((el) => {
          const content = el.attr('content');
          if (content) images.push({ type: 'meta', src: content });
        });
      }

      // Deduplicate by src
      const uniqueImages = [...new Map(images.map(img => [img.src, img])).values()];

      // Display
      uniqueImages.slice(0, 25).forEach((img, i) => {
        const typeLabel = colors.gray(`[${img.type}]`);
        const altText = img.alt ? colors.cyan(img.alt.slice(0, 25)) : '';
        console.log(`${colors.gray(`${i + 1}.`)} ${typeLabel} ${altText} ${img.src.slice(0, 60)}`);
      });

      if (uniqueImages.length > 25) {
        console.log(colors.gray(`  ... and ${uniqueImages.length - 25} more images`));
      }

      this.lastResponse = uniqueImages;
      console.log(colors.gray(`\n  ${uniqueImages.length} image(s) found`));
    } catch (error: any) {
      console.error(colors.red(`Query failed: ${error.message}`));
    }
    console.log('');
  }

  private async runSelectScripts() {
    if (!this.currentDoc) {
      console.log(colors.yellow('No document loaded. Use "scrap <url>" first.'));
      return;
    }

    try {
      const scripts: Array<{ type: 'external' | 'inline'; src?: string; size?: number; async?: boolean; defer?: boolean }> = [];

      // External scripts
      this.currentDoc.select('script[src]').each((el) => {
        const src = el.attr('src');
        if (src) {
          scripts.push({
            type: 'external',
            src,
            async: el.attr('async') !== undefined,
            defer: el.attr('defer') !== undefined
          });
        }
      });

      // Inline scripts
      this.currentDoc.select('script:not([src])').each((el) => {
        const content = el.text();
        if (content.trim()) {
          scripts.push({
            type: 'inline',
            size: content.length
          });
        }
      });

      // Display
      let extCount = 0, inlineCount = 0, totalInlineSize = 0;

      scripts.forEach((script, i) => {
        if (script.type === 'external') {
          extCount++;
          const flags = [
            script.async ? colors.cyan('async') : '',
            script.defer ? colors.cyan('defer') : ''
          ].filter(Boolean).join(' ');
          if (i < 20) {
            console.log(`${colors.gray(`${i + 1}.`)} ${colors.green('[ext]')} ${script.src?.slice(0, 70)} ${flags}`);
          }
        } else {
          inlineCount++;
          totalInlineSize += script.size || 0;
          if (i < 20) {
            console.log(`${colors.gray(`${i + 1}.`)} ${colors.yellow('[inline]')} ${((script.size || 0) / 1024).toFixed(1)}kb`);
          }
        }
      });

      if (scripts.length > 20) {
        console.log(colors.gray(`  ... and ${scripts.length - 20} more scripts`));
      }

      this.lastResponse = scripts;
      console.log(colors.gray(`\n  ${extCount} external, ${inlineCount} inline (${(totalInlineSize / 1024).toFixed(1)}kb total)`));
    } catch (error: any) {
      console.error(colors.red(`Query failed: ${error.message}`));
    }
    console.log('');
  }

  private async runSelectCSS() {
    if (!this.currentDoc) {
      console.log(colors.yellow('No document loaded. Use "scrap <url>" first.'));
      return;
    }

    try {
      const styles: Array<{ type: 'external' | 'inline'; href?: string; size?: number; media?: string }> = [];

      // External stylesheets
      this.currentDoc.select('link[rel="stylesheet"]').each((el) => {
        const href = el.attr('href');
        if (href) {
          styles.push({
            type: 'external',
            href,
            media: el.attr('media')
          });
        }
      });

      // Inline styles
      this.currentDoc.select('style').each((el) => {
        const content = el.text();
        if (content.trim()) {
          styles.push({
            type: 'inline',
            size: content.length,
            media: el.attr('media')
          });
        }
      });

      // Display
      let extCount = 0, inlineCount = 0, totalInlineSize = 0;

      styles.forEach((style, i) => {
        if (style.type === 'external') {
          extCount++;
          const media = style.media ? colors.cyan(`[${style.media}]`) : '';
          if (i < 20) {
            console.log(`${colors.gray(`${i + 1}.`)} ${colors.green('[ext]')} ${style.href?.slice(0, 70)} ${media}`);
          }
        } else {
          inlineCount++;
          totalInlineSize += style.size || 0;
          const media = style.media ? colors.cyan(`[${style.media}]`) : '';
          if (i < 20) {
            console.log(`${colors.gray(`${i + 1}.`)} ${colors.yellow('[inline]')} ${((style.size || 0) / 1024).toFixed(1)}kb ${media}`);
          }
        }
      });

      if (styles.length > 20) {
        console.log(colors.gray(`  ... and ${styles.length - 20} more stylesheets`));
      }

      this.lastResponse = styles;
      console.log(colors.gray(`\n  ${extCount} external, ${inlineCount} inline (${(totalInlineSize / 1024).toFixed(1)}kb total)`));
    } catch (error: any) {
      console.error(colors.red(`Query failed: ${error.message}`));
    }
    console.log('');
  }

  private async runSelectSourcemaps() {
    if (!this.currentDoc) {
      console.log(colors.yellow('No document loaded. Use "scrap <url>" first.'));
      return;
    }

    try {
      const sourcemaps: Array<{ type: string; url: string; source?: string }> = [];
      const sourceMappingURLPattern = /\/[/*]#\s*sourceMappingURL=([^\s*]+)/gi;

      // 1. Inline <script> with sourceMappingURL comment
      this.currentDoc.select('script:not([src])').each((el) => {
        const content = el.text();
        const matches = content.matchAll(sourceMappingURLPattern);
        for (const match of matches) {
          sourcemaps.push({ type: 'inline-js', url: match[1] });
        }
      });

      // 2. Inline <style> with sourceMappingURL comment
      this.currentDoc.select('style').each((el) => {
        const content = el.text();
        const matches = content.matchAll(sourceMappingURLPattern);
        for (const match of matches) {
          sourcemaps.push({ type: 'inline-css', url: match[1] });
        }
      });

      // 3. External scripts - infer .map file existence
      this.currentDoc.select('script[src]').each((el) => {
        const src = el.attr('src');
        if (src && !src.endsWith('.map')) {
          // Common patterns: file.js -> file.js.map or file.min.js -> file.min.js.map
          sourcemaps.push({ type: 'js-inferred', url: `${src}.map`, source: src });
        }
      });

      // 4. External stylesheets - infer .map file existence
      this.currentDoc.select('link[rel="stylesheet"]').each((el) => {
        const href = el.attr('href');
        if (href && !href.endsWith('.map')) {
          sourcemaps.push({ type: 'css-inferred', url: `${href}.map`, source: href });
        }
      });

      // 5. Direct .map file references (rare but possible)
      this.currentDoc.select('script[src$=".map"], link[href$=".map"]').each((el) => {
        const url = el.attr('src') || el.attr('href');
        if (url) sourcemaps.push({ type: 'direct', url });
      });

      // Deduplicate by url
      const uniqueMaps = [...new Map(sourcemaps.map(m => [m.url, m])).values()];

      // Separate confirmed vs inferred
      const confirmed = uniqueMaps.filter(m => !m.type.includes('inferred'));
      const inferred = uniqueMaps.filter(m => m.type.includes('inferred'));

      // Display confirmed
      if (confirmed.length > 0) {
        console.log(colors.green('Confirmed sourcemaps:'));
        confirmed.forEach((m, i) => {
          console.log(`${colors.gray(`${i + 1}.`)} ${colors.cyan(`[${m.type}]`)} ${m.url}`);
        });
      }

      // Display inferred
      if (inferred.length > 0) {
        console.log(colors.yellow('\nPotential sourcemaps (inferred):'));
        inferred.slice(0, 15).forEach((m, i) => {
          console.log(`${colors.gray(`${i + 1}.`)} ${colors.gray(`[${m.type}]`)} ${m.url.slice(0, 70)}`);
        });
        if (inferred.length > 15) {
          console.log(colors.gray(`  ... and ${inferred.length - 15} more`));
        }
      }

      this.lastResponse = uniqueMaps;
      console.log(colors.gray(`\n  ${confirmed.length} confirmed, ${inferred.length} inferred sourcemap(s)`));
      console.log(colors.gray(`  Use $unmap <url> to extract original sources`));
    } catch (error: any) {
      console.error(colors.red(`Query failed: ${error.message}`));
    }
    console.log('');
  }

  private async runUnmap(urlArg: string) {
    let mapUrl = urlArg;

    // If no URL provided, try to use last sourcemap from $sourcemaps
    if (!mapUrl && Array.isArray(this.lastResponse)) {
      const maps = this.lastResponse as Array<{ type: string; url: string }>;
      const confirmed = maps.filter(m => !m.type.includes('inferred'));
      if (confirmed.length > 0) {
        mapUrl = confirmed[0].url;
        console.log(colors.gray(`Using: ${mapUrl}`));
      } else if (maps.length > 0) {
        mapUrl = maps[0].url;
        console.log(colors.gray(`Using (inferred): ${mapUrl}`));
      }
    }

    if (!mapUrl) {
      console.log(colors.yellow('Usage: $unmap <sourcemap-url>'));
      console.log(colors.gray('  Or run $sourcemaps first to find sourcemaps'));
      return;
    }

    // Resolve relative URL if we have a base
    if (!mapUrl.startsWith('http') && this.baseUrl) {
      const base = new URL(this.baseUrl);
      mapUrl = new URL(mapUrl, base).toString();
    }

    console.log(colors.cyan(`Fetching sourcemap: ${mapUrl}`));

    try {
      const response = await this.client.get(mapUrl);
      const mapData = await response.json() as {
        version?: number;
        sources?: string[];
        sourcesContent?: (string | null)[];
        names?: string[];
        mappings?: string;
        file?: string;
        sourceRoot?: string;
      };

      if (!mapData.sources || !Array.isArray(mapData.sources)) {
        console.log(colors.red('Invalid sourcemap: missing sources array'));
        return;
      }

      console.log(colors.green(`\nSourcemap v${mapData.version || '?'}`));
      if (mapData.file) console.log(colors.gray(`  File: ${mapData.file}`));
      if (mapData.sourceRoot) console.log(colors.gray(`  Root: ${mapData.sourceRoot}`));
      console.log(colors.gray(`  Sources: ${mapData.sources.length}`));
      if (mapData.names) console.log(colors.gray(`  Names: ${mapData.names.length}`));

      // List sources
      console.log(colors.bold('\nOriginal sources:'));
      mapData.sources.forEach((source, i) => {
        const hasContent = mapData.sourcesContent && mapData.sourcesContent[i];
        const sizeInfo = hasContent
          ? colors.green(`[${(mapData.sourcesContent![i]!.length / 1024).toFixed(1)}kb]`)
          : colors.yellow('[no content]');
        console.log(`${colors.gray(`${i + 1}.`)} ${sizeInfo} ${source}`);
      });

      // Store for later use
      this.lastResponse = {
        url: mapUrl,
        data: mapData,
        sources: mapData.sources.map((source, i) => ({
          path: source,
          content: mapData.sourcesContent?.[i] || null
        }))
      };

      const withContent = mapData.sourcesContent?.filter(c => c).length || 0;
      console.log(colors.gray(`\n  ${withContent}/${mapData.sources.length} sources have embedded content`));

      if (withContent > 0) {
        console.log(colors.gray(`  Use $unmap:view <index> to view source content`));
        console.log(colors.gray(`  Use $unmap:save <dir> to save all sources to disk`));
      }
    } catch (error: any) {
      if (error.status === 404) {
        console.log(colors.yellow(`Sourcemap not found (404): ${mapUrl}`));
      } else {
        console.error(colors.red(`Failed to fetch sourcemap: ${error.message}`));
      }
    }
    console.log('');
  }

  private async runUnmapView(indexStr: string) {
    if (!this.lastResponse || !this.lastResponse.sources) {
      console.log(colors.yellow('No sourcemap loaded. Use $unmap <url> first.'));
      return;
    }

    const index = parseInt(indexStr, 10) - 1;
    const sources = this.lastResponse.sources as Array<{ path: string; content: string | null }>;

    if (isNaN(index) || index < 0 || index >= sources.length) {
      console.log(colors.yellow(`Invalid index. Use 1-${sources.length}`));
      return;
    }

    const source = sources[index];
    if (!source.content) {
      console.log(colors.yellow(`No embedded content for: ${source.path}`));
      return;
    }

    console.log(colors.bold(`\n─── ${source.path} ───\n`));

    // Try to syntax highlight if it looks like JS/TS
    const ext = source.path.split('.').pop()?.toLowerCase();
    if (['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs'].includes(ext || '')) {
      try {
        console.log(highlight(source.content, { linenos: true }));
      } catch {
        console.log(source.content);
      }
    } else {
      console.log(source.content);
    }
    console.log(colors.bold(`\n─── end ───\n`));
  }

  private async runUnmapSave(dir: string) {
    if (!this.lastResponse || !this.lastResponse.sources) {
      console.log(colors.yellow('No sourcemap loaded. Use $unmap <url> first.'));
      return;
    }

    const outputDir = dir || './sourcemap-extracted';
    const sources = this.lastResponse.sources as Array<{ path: string; content: string | null }>;
    const { promises: fs } = await import('node:fs');
    const path = await import('node:path');

    let saved = 0, skipped = 0;

    for (const source of sources) {
      if (!source.content) {
        skipped++;
        continue;
      }

      // Clean up path (remove webpack:// etc)
      let cleanPath = source.path
        .replace(/^webpack:\/\/[^/]*\//, '')
        .replace(/^\.*\//, '')
        .replace(/^node_modules\//, 'node_modules/');

      const fullPath = path.join(outputDir, cleanPath);
      const dirname = path.dirname(fullPath);

      try {
        await fs.mkdir(dirname, { recursive: true });
        await fs.writeFile(fullPath, source.content, 'utf-8');
        saved++;
        console.log(colors.green(`  ✓ ${cleanPath}`));
      } catch (err: any) {
        console.log(colors.red(`  ✗ ${cleanPath}: ${err.message}`));
      }
    }

    console.log(colors.gray(`\n  Saved ${saved} files to ${outputDir}`));
    if (skipped > 0) {
      console.log(colors.yellow(`  Skipped ${skipped} sources without embedded content`));
    }
    console.log('');
  }

  private async runBeautify(urlArg: string) {
    if (!urlArg) {
      console.log(colors.yellow('Usage: $beautify <url-to-js-or-css>'));
      console.log(colors.gray('  Downloads and formats minified JS/CSS code'));
      return;
    }

    let url = urlArg;
    // Resolve relative URL if we have a base
    if (!url.startsWith('http') && this.baseUrl) {
      const base = new URL(this.baseUrl);
      url = new URL(url, base).toString();
    }

    console.log(colors.cyan(`Fetching: ${url}`));

    try {
      const response = await this.client.get(url);
      const code = await response.text();
      const isCSS = url.endsWith('.css') || response.headers.get('content-type')?.includes('css');

      console.log(colors.gray(`  Size: ${(code.length / 1024).toFixed(1)}kb`));

      const formatted = isCSS ? this.beautifyCSS(code) : this.beautifyJS(code);

      console.log(colors.bold(`\n─── Beautified ${isCSS ? 'CSS' : 'JS'} ───\n`));

      // Try to syntax highlight
      try {
        console.log(highlight(formatted, { linenos: true }));
      } catch {
        console.log(formatted);
      }

      console.log(colors.bold(`\n─── end ───`));

      // Store for potential save
      this.lastResponse = { url, original: code, formatted, type: isCSS ? 'css' : 'js' };
      console.log(colors.gray(`\n  Use $beautify:save <file> to save formatted code`));
    } catch (error: any) {
      console.error(colors.red(`Failed to fetch: ${error.message}`));
    }
    console.log('');
  }

  private beautifyJS(code: string): string {
    let result = '';
    let indent = 0;
    let inString: string | null = null;
    let inComment = false;
    let inLineComment = false;
    let i = 0;

    const addNewline = () => {
      result += '\n' + '  '.repeat(indent);
    };

    while (i < code.length) {
      const char = code[i];
      const next = code[i + 1];
      const prev = code[i - 1];

      // Handle strings
      if (!inComment && !inLineComment) {
        if ((char === '"' || char === "'" || char === '`') && prev !== '\\') {
          if (inString === char) {
            inString = null;
          } else if (!inString) {
            inString = char;
          }
        }
      }

      // Handle comments
      if (!inString && !inComment && !inLineComment) {
        if (char === '/' && next === '*') {
          inComment = true;
          result += char;
          i++;
          continue;
        }
        if (char === '/' && next === '/') {
          inLineComment = true;
          result += char;
          i++;
          continue;
        }
      }

      if (inComment && char === '*' && next === '/') {
        result += '*/';
        inComment = false;
        i += 2;
        continue;
      }

      if (inLineComment && char === '\n') {
        inLineComment = false;
      }

      // Skip if in string or comment
      if (inString || inComment || inLineComment) {
        result += char;
        i++;
        continue;
      }

      // Handle braces
      if (char === '{') {
        result += ' {';
        indent++;
        addNewline();
        i++;
        continue;
      }

      if (char === '}') {
        indent = Math.max(0, indent - 1);
        addNewline();
        result += '}';
        if (next && next !== ';' && next !== ',' && next !== ')' && next !== '\n') {
          addNewline();
        }
        i++;
        continue;
      }

      // Handle semicolons
      if (char === ';') {
        result += ';';
        if (next && next !== '}' && next !== '\n') {
          addNewline();
        }
        i++;
        continue;
      }

      // Remove excessive whitespace
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
        if (result.length > 0 && !/\s$/.test(result)) {
          result += ' ';
        }
        i++;
        continue;
      }

      result += char;
      i++;
    }

    return result.trim();
  }

  private beautifyCSS(code: string): string {
    let result = '';
    let indent = 0;
    let inString: string | null = null;
    let i = 0;

    const addNewline = () => {
      result += '\n' + '  '.repeat(indent);
    };

    while (i < code.length) {
      const char = code[i];
      const next = code[i + 1];
      const prev = code[i - 1];

      // Handle strings
      if ((char === '"' || char === "'") && prev !== '\\') {
        if (inString === char) {
          inString = null;
        } else if (!inString) {
          inString = char;
        }
      }

      if (inString) {
        result += char;
        i++;
        continue;
      }

      // Handle braces
      if (char === '{') {
        result += ' {';
        indent++;
        addNewline();
        i++;
        continue;
      }

      if (char === '}') {
        indent = Math.max(0, indent - 1);
        addNewline();
        result += '}';
        addNewline();
        i++;
        continue;
      }

      // Handle semicolons
      if (char === ';') {
        result += ';';
        addNewline();
        i++;
        continue;
      }

      // Handle commas in selectors
      if (char === ',' && indent === 0) {
        result += ',';
        addNewline();
        i++;
        continue;
      }

      // Remove excessive whitespace
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
        if (result.length > 0 && !/\s$/.test(result)) {
          result += ' ';
        }
        i++;
        continue;
      }

      result += char;
      i++;
    }

    return result.trim();
  }

  private async runBeautifySave(filename: string) {
    if (!this.lastResponse || !this.lastResponse.formatted) {
      console.log(colors.yellow('No beautified code. Use $beautify <url> first.'));
      return;
    }

    const outputFile = filename || `beautified.${this.lastResponse.type}`;
    const { promises: fs } = await import('node:fs');

    try {
      await fs.writeFile(outputFile, this.lastResponse.formatted, 'utf-8');
      console.log(colors.green(`  ✓ Saved to ${outputFile}`));
    } catch (err: any) {
      console.log(colors.red(`  ✗ Failed to save: ${err.message}`));
    }
    console.log('');
  }

  private async runSelectTable(selector: string) {
    if (!this.currentDoc) {
      console.log(colors.yellow('No document loaded. Use "scrap <url>" first.'));
      return;
    }
    if (!selector) {
      console.log(colors.yellow('Usage: $table <selector>'));
      console.log(colors.gray('  Examples: $table table | $table .data-table'));
      return;
    }

    try {
      const tables = this.currentDoc.tables(selector);

      if (tables.length === 0) {
        console.log(colors.gray('No tables found'));
        return;
      }

      tables.forEach((table, tableIndex) => {
        console.log(colors.bold(`\nTable ${tableIndex + 1}:`));

        if (table.headers.length > 0) {
          console.log(colors.cyan('  Headers: ') + table.headers.join(' | '));
        }

        console.log(colors.cyan(`  Rows: `) + table.rows.length);

        // Show first 5 rows
        table.rows.slice(0, 5).forEach((row, i) => {
          const rowStr = row.map(cell => cell.slice(0, 20)).join(' | ');
          console.log(`  ${colors.gray(`${i + 1}.`)} ${rowStr}`);
        });

        if (table.rows.length > 5) {
          console.log(colors.gray(`  ... and ${table.rows.length - 5} more rows`));
        }
      });

      this.lastResponse = tables;
    } catch (error: any) {
      console.error(colors.red(`Query failed: ${error.message}`));
    }
    console.log('');
  }

  private printHelp() {
    console.log(`
  ${colors.bold(colors.cyan('Rek Console Help'))}

  ${colors.bold('Core Commands:')}
    ${colors.green('url <url>')}           Set persistent Base URL.
    ${colors.green('set <key>=<val>')}     Set a session variable.
    ${colors.green('vars')}                List all session variables.
    ${colors.green('clear')}               Clear the screen.
    ${colors.green('exit')}                Exit the console.

  ${colors.bold('HTTP Requests:')}
    ${colors.green('<method> <path>')}     Execute HTTP request (GET, POST, PUT, DELETE, etc).
                             ${colors.gray('Params:')} ${colors.white('key=value')} (string) or ${colors.white('key:=value')} (typed).
                             ${colors.gray('Headers:')} ${colors.white('Key:Value')}

  ${colors.bold('Advanced Tools:')}
    ${colors.green('load <url>')}          Run Load Test.
                             ${colors.gray('Options:')}
                             ${colors.white('users=50')}      ${colors.gray('Concurrent users')}
                             ${colors.white('duration=300')}  ${colors.gray('Duration in seconds')}
                             ${colors.white('ramp=5')}        ${colors.gray('Ramp-up time in seconds')}
                             ${colors.white('mode=realistic')} ${colors.gray('realistic | throughput | stress')}
                             ${colors.white('http2=false')}   ${colors.gray('Force HTTP/2')}

    ${colors.green('chat <provider>')}     Start AI Chat.
                             ${colors.gray('Providers:')} ${colors.white('openai')}, ${colors.white('anthropic')}
                             ${colors.gray('Arg:')} ${colors.white('model=...')} (optional)

    ${colors.green('ws <url>')}            Start interactive WebSocket session.
    ${colors.green('udp <url>')}           Send UDP packet.

  ${colors.bold('Network Tools:')}
    ${colors.green('whois <domain>')}      WHOIS lookup (domain or IP).
    ${colors.green('tls <host> [port]')}   Inspect TLS/SSL certificate.
    ${colors.green('dns <domain>')}        Full DNS lookup (A, AAAA, MX, NS, SPF, DMARC).
    ${colors.green('rdap <domain>')}       RDAP lookup (modern WHOIS).
    ${colors.green('ping <host>')}         Quick TCP connectivity check.

  ${colors.bold('Web Scraping:')}
    ${colors.green('scrap <url>')}         Fetch and parse HTML document.
    ${colors.green('$ <selector>')}        Query elements (CSS selector).
    ${colors.green('$text <selector>')}    Extract text content.
    ${colors.green('$attr <name> <sel>')}  Extract attribute values.
    ${colors.green('$html <selector>')}    Get inner HTML.
    ${colors.green('$links [selector]')}   List all links.
    ${colors.green('$images [selector]')}  List all images (img, bg, og:image, favicon).
    ${colors.green('$scripts')}            List all scripts (external + inline).
    ${colors.green('$css')}                List all stylesheets (external + inline).
    ${colors.green('$sourcemaps')}         Find sourcemaps (confirmed + inferred).
    ${colors.green('$unmap <url>')}        Download and parse sourcemap.
    ${colors.green('$unmap:view <n>')}     View source file by index.
    ${colors.green('$unmap:save [dir]')}   Save all sources to disk.
    ${colors.green('$beautify <url>')}     Format minified JS/CSS code.
    ${colors.green('$beautify:save [f]')}  Save beautified code to file.
    ${colors.green('$table <selector>')}   Extract table as data.

  ${colors.bold('Examples:')}
    › url httpbin.org
    › get /json
    › post /post name="Neo" active:=true role:Admin
    › load /heavy-endpoint users=100 mode=stress
    › chat openai gpt-5.1
    `);
  }
}

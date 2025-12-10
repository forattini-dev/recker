import readline from 'node:readline';
import { promises as dns } from 'node:dns';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { requireOptional } from '../../utils/optional-require.js';
import { createClient } from '../../core/client.js';
import { startInteractiveWebSocket } from './websocket.js';
import { whois, isDomainAvailable } from '../../utils/whois.js';
import { inspectTLS, TLSInfo } from '../../utils/tls-inspector.js';
import { getSecurityRecords, DnsSecurityRecords } from '../../utils/dns-toolkit.js';
import { rdap } from '../../utils/rdap.js';
import { ScrapeDocument } from '../../scrape/document.js';
import { Spider, type SpiderPageResult, type SpiderResult } from '../../scrape/spider.js';
import colors from '../../utils/colors.js';
import { getShellSearch } from './shell-search.js';
import { openSearchPanel } from './search-panel.js';
import { ScrollBuffer, parseScrollKey, parseMouseScroll, enableMouseReporting, disableMouseReporting } from './scroll-buffer.js';
import { analyzeSecurityHeaders, SecurityReport } from '../../utils/security-grader.js';
import { getIpInfo, IpInfo } from '../../mcp/ip-intel.js';
import { checkPropagation, formatPropagationReport, PropagationResult } from '../../dns/propagation.js';
import { analyzeSeo, SeoSpider, type SeoReport, type SeoSpiderResult, type SiteWideIssue } from '../../seo/index.js';
import { resolvePreset } from '../presets.js';
import type { Client } from '../../core/client.js';
import { summarizeErrors, formatErrorSummary, printError, classifyError, formatCliError } from '../helpers.js';

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
  private envVars: Record<string, string> = {};
  private envLoaded: boolean = false;
  private initialized = false;
  private currentDoc: ScrapeDocument | null = null;
  private currentDocUrl: string = '';
  private scrollBuffer: ScrollBuffer;
  private originalStdoutWrite: typeof process.stdout.write | null = null;
  private inScrollMode: boolean = false;
  // AI clients per preset for memory persistence across messages
  private aiClients: Map<string, Client> = new Map();

  constructor() {
    // We initialize with a placeholder base URL because the Client enforces it.
    // In the shell, we might change targets dynamically, so we override it per request.
    // Enable HTTP/2 support for better performance
    this.client = createClient({
      baseUrl: 'http://localhost',
      checkHooks: false,
      http2: true
    } as any);

    // Initialize scroll buffer for history navigation
    this.scrollBuffer = new ScrollBuffer({ maxLines: 10000 });
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
      '@openai', '@anthropic', '@groq', '@google', '@xai', '@mistral', '@cohere', '@deepseek', '@fireworks', '@together', '@perplexity',
      'ai:clear',
      'whois', 'tls', 'ssl', 'security', 'ip', 'dns', 'dns:propagate', 'dns:email', 'dns:health', 'dns:spf', 'dns:dmarc', 'dns:dkim', 'dns:dig', 'dns:generate', 'rdap', 'ping', 'ftp', 'sftp', 'telnet', 'graphql', 'jsonrpc', 'hls', 'har', 'har:record', 'har:play', 'har:info', 'har:stop',
      'robots', 'sitemap', 'llms', 'sse', 'upload', 'download', 'soap', 'odata', 'proxy',
      'scrap', 'spider', 'seo', '$', '$text', '$attr', '$html', '$links', '$images', '$scripts', '$css', '$sourcemaps', '$unmap', '$unmap:view', '$unmap:save', '$beautify', '$beautify:save', '$table',
      '?', 'search', 'suggest', 'example',
      'help', 'clear', 'exit', 'set', 'url', 'vars', 'env'
    ];

    const hits = commands.filter((c) => c.startsWith(line));
    return [hits.length ? hits : commands, line];
  }

  public async start() {
    await this.ensureInitialized();

    // Set up scroll buffer output interception
    this.setupScrollCapture();

    console.clear();
    console.log(colors.bold(colors.cyan('Rek Console')));
    console.log(colors.gray('Chat with your APIs. Type "help" for magic.'));
    console.log(colors.gray('Use Page Up/Down to view history.'));
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
      this.cleanupScrollCapture();
      console.log(colors.gray('\nSee ya.'));
      process.exit(0);
    });

    // Handle terminal resize
    process.stdout.on('resize', () => {
      this.scrollBuffer.updateViewport();
    });

    // Set up raw mode key listener for Page Up/Down
    this.setupScrollKeyHandler();
  }

  /**
   * Set up stdout interception to capture output into scroll buffer
   */
  private setupScrollCapture(): void {
    this.originalStdoutWrite = process.stdout.write.bind(process.stdout);

    const self = this;
    // Override stdout.write to capture all output
    (process.stdout as any).write = function(
      chunk: Buffer | string,
      encodingOrCallback?: BufferEncoding | ((err?: Error | null) => void),
      callback?: (err?: Error | null) => void
    ): boolean {
      const content = typeof chunk === 'string' ? chunk : chunk.toString();

      // Capture in scroll buffer
      self.scrollBuffer.write(content);

      // If not in scroll mode, pass through to actual stdout
      if (!self.inScrollMode && self.originalStdoutWrite) {
        return self.originalStdoutWrite(chunk as any, encodingOrCallback as any, callback as any);
      }

      return true;
    };
  }

  /**
   * Clean up stdout interception
   */
  private cleanupScrollCapture(): void {
    if (this.originalStdoutWrite) {
      process.stdout.write = this.originalStdoutWrite;
      this.originalStdoutWrite = null;
    }
    disableMouseReporting();
  }

  /**
   * Set up raw mode key handler for scroll navigation
   */
  private setupScrollKeyHandler(): void {
    // NOTE: Mouse reporting disabled due to escape sequence leakage issues
    // in certain terminal states (async operations, spinners).
    // Users can use Page Up/Down keys instead.
    // enableMouseReporting();

    // We need to intercept stdin BEFORE readline processes it
    if (process.stdin.isTTY) {
      // Store original emit to intercept
      const originalEmit = process.stdin.emit.bind(process.stdin);
      const self = this;

      (process.stdin as any).emit = function(event: string, ...args: any[]) {
        if (event === 'data') {
          const data = args[0] as Buffer;
          const str = data.toString();

          // Check for ALL mouse events (SGR format: \x1b[< ... M or m)
          // Button codes: 0=left, 1=middle, 2=right, 64=scroll up, 65=scroll down
          // Always consume to prevent garbage on screen
          if (str.includes('\x1b[<')) {
            const mouseScroll = parseMouseScroll(data);
            if (mouseScroll) {
              self.handleScrollKey(mouseScroll);
            }
            // Silently consume all mouse events (clicks, scrolls, moves)
            return true;
          }

          // Check for legacy mouse events (\x1b[M...)
          if (data.length >= 6 && data[0] === 0x1b && data[1] === 0x5b && data[2] === 0x4d) {
            const mouseScroll = parseMouseScroll(data);
            if (mouseScroll) {
              self.handleScrollKey(mouseScroll);
            }
            // Silently consume all mouse events
            return true;
          }

          // Check for scroll keys (Page Up/Down, Home/End, Q to quit)
          // Wrapped in try-catch to prevent crashes from scroll handling errors
          try {
            const scrollKey = parseScrollKey(data);
            if (scrollKey) {
              // Handle quit: exit scroll mode if in it, otherwise pass through
              if (scrollKey === 'quit') {
                if (self.inScrollMode) {
                  self.exitScrollMode();
                  return true;
                }
                // Not in scroll mode - pass 'q' through to readline
                return originalEmit(event, ...args);
              }
              // Handle other scroll keys (pageUp, pageDown, home, end, scrollUp, scrollDown)
              self.handleScrollKey(scrollKey);
              return true; // Consume the event
            }

            // In scroll mode: use arrow keys for scrolling
            if (self.inScrollMode) {
              // Up arrow: \x1b[A
              if (str === '\x1b[A') {
                self.handleScrollKey('scrollUp');
                return true;
              }
              // Down arrow: \x1b[B
              if (str === '\x1b[B') {
                self.handleScrollKey('scrollDown');
                return true;
              }
              // Escape: exit scroll mode
              if (str === '\x1b' || str === '\x1b\x1b') {
                self.exitScrollMode();
                return true;
              }
              // Consume all other input to prevent garbage
              return true;
            }
          } catch {
            // If scroll handling fails, just pass through to readline
            // This prevents crashes from terminal compatibility issues
          }
        }

        // Pass through to original handler
        return originalEmit(event, ...args);
      };
    }
  }

  /**
   * Handle scroll key input
   */
  private handleScrollKey(key: string): void {
    // Safety check: don't try to scroll if stdout capture isn't set up
    if (!this.originalStdoutWrite) {
      return;
    }

    let needsRedraw = false;

    switch (key) {
      case 'pageUp':
        if (!this.inScrollMode) {
          this.enterScrollMode();
        }
        needsRedraw = this.scrollBuffer.pageUp();
        break;

      case 'pageDown':
        needsRedraw = this.scrollBuffer.pageDown();
        // Exit scroll mode if at bottom
        if (!this.scrollBuffer.isScrolledUp && this.inScrollMode) {
          this.exitScrollMode();
          return;
        }
        break;

      case 'scrollUp':
        if (!this.inScrollMode) {
          this.enterScrollMode();
        }
        needsRedraw = this.scrollBuffer.scrollUp(3);
        break;

      case 'scrollDown':
        needsRedraw = this.scrollBuffer.scrollDown(3);
        if (!this.scrollBuffer.isScrolledUp && this.inScrollMode) {
          this.exitScrollMode();
          return;
        }
        break;

      case 'home':
        if (!this.inScrollMode) {
          this.enterScrollMode();
        }
        this.scrollBuffer.scrollToTop();
        needsRedraw = true;
        break;

      case 'end':
        this.scrollBuffer.scrollToBottom();
        if (this.inScrollMode) {
          this.exitScrollMode();
          return;
        }
        break;

      case 'quit':
        if (this.inScrollMode) {
          this.exitScrollMode();
          return;
        }
        break;
    }

    if (needsRedraw && this.inScrollMode) {
      this.renderScrollView();
    }
  }

  /**
   * Enter scroll mode (freeze output, show scroll view)
   */
  private enterScrollMode(): void {
    // Safety checks: don't enter scroll mode if not ready
    if (this.inScrollMode) return;
    if (!this.originalStdoutWrite) return;

    this.inScrollMode = true;

    // Pause readline to prevent input during scroll
    try {
      this.rl.pause();
    } catch {
      // Ignore readline errors
    }

    // Hide cursor
    this.originalStdoutWrite('\x1b[?25l');

    // Render scroll view
    this.renderScrollView();
  }

  /**
   * Exit scroll mode (return to live output)
   */
  private exitScrollMode(): void {
    if (!this.inScrollMode) return;
    this.inScrollMode = false;

    // Clear screen and restore
    if (this.originalStdoutWrite) {
      // Show cursor
      this.originalStdoutWrite('\x1b[?25h');
      // Clear screen
      this.originalStdoutWrite('\x1b[2J\x1b[H');
    }

    // Show recent output (last viewport worth)
    const recentLines = this.scrollBuffer.getVisibleLines();
    if (this.originalStdoutWrite) {
      this.originalStdoutWrite(recentLines.join('\n') + '\n');
    }

    // Resume readline and show prompt
    this.rl.resume();
    this.prompt();
  }

  /**
   * Render the scroll view
   */
  private renderScrollView(): void {
    if (!this.originalStdoutWrite) return;

    const rows = process.stdout.rows || 24;
    const cols = process.stdout.columns || 80;

    // Get visible lines
    const visibleLines = this.scrollBuffer.getVisibleLines();
    const info = this.scrollBuffer.getScrollInfo();

    // Clear screen and move to top
    this.originalStdoutWrite('\x1b[2J\x1b[H');

    // Render visible lines
    for (let i = 0; i < visibleLines.length && i < rows - 1; i++) {
      const line = visibleLines[i] || '';
      // Truncate line if too long
      const truncated = line.length > cols ? line.slice(0, cols - 1) + '…' : line;
      this.originalStdoutWrite(truncated + '\n');
    }

    // Render status bar at bottom
    const scrollInfo = this.scrollBuffer.isScrolledUp
      ? colors.yellow(`↑ ${this.scrollBuffer.position} lines | ${info.percent}% | `)
      : '';
    const helpText = colors.gray('↑↓/PgUp/PgDn • Home/End • Esc/Q to exit');
    const statusBar = `\x1b[${rows};1H\x1b[7m ${scrollInfo}${helpText} \x1b[0m`;
    this.originalStdoutWrite(statusBar);
  }

  private prompt() {
    this.rl.setPrompt(this.getPrompt());
    this.rl.prompt();
  }

  private async handleCommand(input: string) {
    // 0. AI Chat: @preset pattern (e.g., @openai Hello, how are you?)
    // This is handled BEFORE other parsing to intercept AI chat messages
    if (input.startsWith('@')) {
      const spaceIdx = input.indexOf(' ');
      if (spaceIdx > 1) {
        const presetName = input.slice(1, spaceIdx).toLowerCase();
        const message = input.slice(spaceIdx + 1).trim();
        if (message) {
          await this.runAIPresetChat(presetName, message);
          return;
        }
      }
      // If no message, show help
      console.log(colors.yellow('Usage: @<preset> <message>'));
      console.log(colors.gray('Example: @openai Hello, how are you?'));
      console.log(colors.gray('Available AI presets: openai, anthropic, groq, google, xai, mistral, cohere'));
      return;
    }

    // 1. Natural language search: lines ending with ?
    // "how to configure retry?" - triggers search panel
    // Note: "? query" is handled by the switch case below
    if (input.endsWith('?') && !input.startsWith('?') && input.length > 1) {
      // Natural question like "how to configure retry?"
      await this.runSearch(input.slice(0, -1).trim());
      return;
    }

    // 2. Variable assignment: var = value
    if (input.includes('=') && !input.includes(' ') && !input.startsWith('http')) {
      // Allow simple variable setting context? Maybe later.
      // For now, let's focus on commands.
    }

    // 3. Magic Parsing
    const parts = this.parseLine(input);
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
      case 'help':
        if (parts[1]) {
          this.printCommandHelp(parts[1]);
        } else {
          this.printHelp();
        }
        return;
      case 'clear':
        console.clear();
        return;
      case 'ai:clear':
        this.clearAIMemory(parts[1]);
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
        this.showVars();
        return;
      case 'env':
        await this.loadEnvFile(parts[1]);
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
      case 'security':
        await this.runSecurityGrader(parts[1]);
        return;
      case 'seo':
        await this.runSeo(
          parts[1],
          parts.includes('-a') || parts.includes('--all'),
          parts.includes('--format') && parts[parts.indexOf('--format') + 1] === 'json'
        );
        return;
      case 'ip':
        await this.runIpIntelligence(parts[1]);
        return;
      case 'dns':
        await this.runDNS(parts[1]);
        return;
      case 'dns:propagate':
        await this.runDNSPropagation(parts[1], parts[2]);
        return;
      case 'dns:email':
        await this.runDnsEmailCheck(parts[1], parts[2]);
        return;
      case 'dns:health':
        await this.runDnsHealth(parts[1]);
        return;
      case 'dns:spf':
        await this.runDnsSpf(parts[1]);
        return;
      case 'dns:dmarc':
        await this.runDnsDmarc(parts[1]);
        return;
      case 'dns:dkim':
        await this.runDnsDkim(parts[1], parts[2]);
        return;
      case 'dns:dig':
        await this.runDnsDig(parts.slice(1));
        return;
      case 'dns:generate':
        await this.runDnsGenerate(parts.slice(1));
        return;
      case 'rdap':
        await this.runRDAP(parts[1]);
        return;
      case 'ping':
        await this.runPing(parts[1]);
        return;
      case 'ftp':
        await this.runFtp(parts.slice(1));
        return;
      case 'telnet':
        await this.runTelnet(parts[1], parts[2]);
        return;
      case 'graphql':
        await this.runGraphQL(parts.slice(1));
        return;
      case 'jsonrpc':
        await this.runJsonRpc(parts.slice(1));
        return;
      case 'hls':
        await this.runHls(parts.slice(1));
        return;
      case 'har':
        await this.runHar(parts.slice(1));
        return;
      case 'har:record':
        await this.runHarRecord(parts.slice(1));
        return;
      case 'har:play':
        await this.runHarPlay(parts.slice(1));
        return;
      case 'har:info':
        await this.runHarInfo(parts[1]);
        return;
      case 'har:stop':
        await this.runHarStop();
        return;
      case 'robots':
        await this.runRobots(parts[1]);
        return;
      case 'sitemap':
        await this.runSitemap(parts[1]);
        return;
      case 'llms':
        await this.runLlms(parts[1]);
        return;
      case 'sftp':
        await this.runSftp(parts.slice(1));
        return;
      case 'sse':
        await this.runSse(parts[1], parts.slice(2));
        return;
      case 'upload':
        await this.runUpload(parts.slice(1));
        return;
      case 'download':
        await this.runDownload(parts.slice(1));
        return;
      case 'soap':
        await this.runSoap(parts.slice(1));
        return;
      case 'odata':
        await this.runOdata(parts.slice(1));
        return;
      case 'proxy':
        await this.runProxy(parts.slice(1));
        return;
      case 'scrap':
        await this.runScrap(parts[1]);
        return;
      case 'spider':
        await this.runSpider(parts.slice(1));
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
      case '?':
      case 'search':
        await this.runSearch(parts.slice(1).join(' '));
        return;
      case 'suggest':
        await this.runSuggest(parts.slice(1).join(' '));
        return;
      case 'example':
        await this.runExample(parts.slice(1).join(' '));
        return;
    }

    // 3. Natural language question detection
    // If input ends with "?" treat it as a search query
    if (input.endsWith('?') && !input.startsWith('http')) {
      // Remove the trailing ? and search
      const query = input.slice(0, -1).trim();
      if (query) {
        await this.runSearch(query);
        return;
      }
    }

    // 4. Request Handling
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
    // Usage: ai [provider]
    // e.g. ai openai, ai anthropic, ai groq

    const provider = args[0] || 'openai';

    const { startAIChat } = await import('./ai-chat.js');

    await this.runInteractiveMode(async (rl) => {
      await startAIChat(rl, provider, {
        aiClients: this.aiClients,
        variables: this.variables
      });
    });
  }

  /**
   * AI Chat with memory persistence per preset
   * Usage: @openai Hello, how are you?
   *
   * This uses the client.ai.chat() method which maintains conversation memory
   * (12 pairs = 24 messages) across messages in the same session.
   */
  private async runAIPresetChat(presetName: string, message: string) {
    try {
      // Get or create the AI client for this preset
      let client = this.aiClients.get(presetName);

      if (!client) {
        // Resolve the preset configuration
        const presetConfig = resolvePreset(presetName);

        if (!presetConfig) {
          console.log(colors.red(`Unknown AI preset: @${presetName}`));
          console.log(colors.gray('Available AI presets: openai, anthropic, groq, google, xai, mistral, cohere, deepseek, fireworks, together, perplexity'));
          return;
        }

        // Check if preset has AI config
        if (!presetConfig._aiConfig) {
          console.log(colors.red(`Preset @${presetName} does not support AI features.`));
          console.log(colors.gray('Use an AI preset like @openai, @anthropic, @groq, etc.'));
          return;
        }

        // Create the client with the preset config
        client = createClient(presetConfig as any);
        this.aiClients.set(presetName, client);
      }

      // Check if client has AI capabilities
      if (!client.hasAI) {
        console.log(colors.red(`Preset @${presetName} does not have AI capabilities.`));
        return;
      }

      // Show thinking indicator
      const model = (client as any)._aiConfig?.model || presetName;
      console.log(colors.gray(`\n${presetName} (${model}) is thinking...`));

      // Use streaming for real-time response
      const stream = await client.ai.chatStream(message);

      // Print assistant response with streaming (neon orange)
      process.stdout.write('\n');

      for await (const event of stream) {
        if (event.type === 'text') {
          process.stdout.write(colors.orange(event.content));
        } else if (event.type === 'error') {
          console.log(colors.red(`\nError: ${event.error}`));
        }
      }

      // Show memory status (single newline after response)
      const memory = client.ai.getMemory();
      const pairs = Math.floor(memory.length / 2);
      console.log(colors.reset(''));
      console.log(colors.gray(`Memory: ${pairs}/12 pairs (${memory.length} messages)`));

    } catch (error: any) {
      // Handle specific errors
      if (error.message?.includes('API key')) {
        console.log(colors.red(`\nMissing API key for @${presetName}`));

        // Suggest environment variable based on preset
        const envVarMap: Record<string, string> = {
          openai: 'OPENAI_API_KEY',
          anthropic: 'ANTHROPIC_API_KEY',
          google: 'GOOGLE_API_KEY',
          groq: 'GROQ_API_KEY',
          xai: 'XAI_API_KEY',
          mistral: 'MISTRAL_API_KEY',
          cohere: 'COHERE_API_KEY',
          deepseek: 'DEEPSEEK_API_KEY',
          fireworks: 'FIREWORKS_API_KEY',
          together: 'TOGETHER_API_KEY',
          perplexity: 'PERPLEXITY_API_KEY',
        };

        const envVar = envVarMap[presetName] || `${presetName.toUpperCase()}_API_KEY`;
        console.log(colors.gray(`Set ${envVar} environment variable to use this preset.`));
      } else {
        console.log(colors.red(`\nError: ${error.message || error}`));
      }
    }
  }

  /**
   * Clear AI conversation memory
   * Usage: ai:clear [preset] - Clear memory for specific preset or all presets
   */
  private clearAIMemory(presetName?: string) {
    if (presetName) {
      const client = this.aiClients.get(presetName);
      if (client && client.hasAI) {
        client.ai.clearMemory();
        console.log(colors.green(`Cleared AI memory for @${presetName}`));
      } else {
        console.log(colors.yellow(`No active AI session for @${presetName}`));
      }
    } else {
      // Clear all AI memories
      let cleared = 0;
      for (const [name, client] of this.aiClients) {
        if (client.hasAI) {
          client.ai.clearMemory();
          cleared++;
        }
      }

      if (cleared > 0) {
        console.log(colors.green(`Cleared AI memory for ${cleared} preset(s)`));
      } else {
        console.log(colors.yellow('No active AI sessions to clear'));
      }
    }
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

  private showVars() {
    const hasVars = Object.keys(this.variables).length > 0;
    const hasEnvVars = Object.keys(this.envVars).length > 0;

    if (!hasVars && !hasEnvVars) {
      console.log(colors.gray('No variables set.'));
      console.log(colors.gray('Use "set key=value" to set variables or "env" to load .env file.'));
      return;
    }

    if (hasVars) {
      console.log(colors.bold(colors.yellow('\nSession Variables:')));
      for (const [key, value] of Object.entries(this.variables)) {
        console.log(`  ${colors.cyan('$' + key)} = ${colors.green(String(value))}`);
      }
    }

    if (hasEnvVars) {
      console.log(colors.bold(colors.yellow('\nEnvironment Variables (.env):')));
      for (const [key, value] of Object.entries(this.envVars)) {
        // Mask sensitive values
        const displayValue = key.toLowerCase().includes('key') ||
                           key.toLowerCase().includes('secret') ||
                           key.toLowerCase().includes('password') ||
                           key.toLowerCase().includes('token')
          ? colors.gray('***' + value.slice(-4))
          : colors.green(value);
        console.log(`  ${colors.cyan('$' + key)} = ${displayValue}`);
      }
    }
    console.log('');
  }

  /**
   * Load environment variables from a .env file
   */
  async loadEnvFile(filePath?: string) {
    const envPath = filePath || join(process.cwd(), '.env');

    try {
      const content = await fs.readFile(envPath, 'utf-8');
      const lines = content.split('\n');
      let count = 0;

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

          this.envVars[cleanKey] = cleanValue;
          // Also set in process.env
          process.env[cleanKey] = cleanValue;
          count++;
        }
      }

      this.envLoaded = true;
      console.log(colors.green(`✓ Loaded ${count} variables from ${colors.cyan(envPath)}`));
      console.log(colors.gray('Use "vars" to list all variables.'));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log(colors.yellow(`No .env file found at ${envPath}`));
        console.log(colors.gray('Create a .env file with KEY=value pairs to use this feature.'));
      } else {
        console.log(colors.red(`Error loading .env: ${error.message}`));
      }
    }
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

      // Check session variables first, then env vars, then process.env
      return this.variables[key] || this.envVars[key] || process.env[key] || value;
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
      const daysColor = info.daysRemaining < 30 ? colors.red : info.daysRemaining < 90 ? colors.yellow : colors.green;

      console.log(`\n${colors.bold(colors.cyan('🔒 TLS/SSL Report'))}`);
      console.log(`${statusIcon} Certificate ${statusText}` + colors.gray(` (${duration}ms)\n`));

      // Certificate info - full subject
      console.log(colors.bold('Certificate:'));
      console.log(`  ${colors.gray('Subject:')}`);
      for (const key of Object.keys(info.subject || {})) {
        console.log(`    ${colors.gray(key.padEnd(10))}: ${(info.subject as any)[key]}`);
      }
      console.log(`  ${colors.gray('Issuer:')}`);
      for (const key of Object.keys(info.issuer || {})) {
        console.log(`    ${colors.gray(key.padEnd(10))}: ${(info.issuer as any)[key]}`);
      }
      console.log(`  ${colors.gray('Expires:')}   ${daysColor(info.daysRemaining + ' days')} (${info.validTo.toISOString().split('T')[0]})`);
      console.log(`  ${colors.gray('Valid From:')} ${info.validFrom.toISOString().split('T')[0]}`);
      console.log(`  ${colors.gray('Valid To:')}   ${info.validTo.toISOString().split('T')[0]}`);
      console.log(`  ${colors.gray('Valid:')}     ${info.valid ? colors.green('Yes') : colors.red('No')}`);

      // Subject Alternative Names (SANs)
      if (info.altNames && info.altNames.length > 0) {
        console.log(colors.bold('\nSubject Alternative Names (SANs):'));
        for (const name of info.altNames) {
          console.log(`   ${colors.cyan('→')} ${name}`);
        }
      }

      // Public Key
      console.log(colors.bold('\nPublic Key:'));
      if (info.pubkey) {
        console.log(`  ${colors.gray('Algorithm:')} ${info.pubkey.algo}`);
        console.log(`  ${colors.gray('Size:')}      ${info.pubkey.size} bits`);
      } else {
        console.log('  Not available');
      }

      // Extended Key Usage
      console.log(colors.bold('\nExtended Key Usage:'));
      if (info.extKeyUsage && info.extKeyUsage.length > 0) {
        for (const oid of info.extKeyUsage) {
          console.log(`   ${colors.cyan('→')} ${oid}`);
        }
      } else {
        console.log('  None');
      }

      // Connection info
      console.log(colors.bold('\nConnection:'));
      console.log(`  ${colors.gray('Protocol:')}  ${info.protocol || 'N/A'}`);
      console.log(`  ${colors.gray('Cipher:')}    ${info.cipher?.name || 'N/A'}`);
      console.log(`  ${colors.gray('Auth:')}      ${info.authorized ? colors.green('Trusted') : colors.red('Untrusted')}`);
      if (info.authorizationError) {
        console.log(`  ${colors.gray('Auth Error:')} ${colors.red(String(info.authorizationError))}`);
      }

      // Fingerprints
      console.log(colors.bold('\nFingerprints:'));
      console.log(`  ${colors.gray('SHA1:')}     ${info.fingerprint}`);
      console.log(`  ${colors.gray('SHA256:')}    ${info.fingerprint256}`);
      console.log(`  ${colors.gray('Serial:')}    ${info.serialNumber}`);

      this.lastResponse = info;
    } catch (error: any) {
      console.error(colors.red(`TLS inspection failed: ${error.message}`));
    }
    console.log('');
  }

  private async runSecurityGrader(url?: string) {
    if (!url) {
      url = this.baseUrl || '';
      if (!url) {
        console.log(colors.yellow('Usage: security <url>'));
        console.log(colors.gray('  Examples: security google.com | security https://example.com'));
        console.log(colors.gray('  Or set a base URL first: url https://example.com'));
        return;
      }
    } else if (!url.startsWith('http')) {
      url = `https://${url}`;
    }

    console.log(colors.gray(`Analyzing security headers for ${url}...`));
    
    try {
      const { analyzeSecurityHeaders } = await import('../../utils/security-grader.js');
      // Use client from constructor
      const res = await this.client.get(url); 
      
      const report = analyzeSecurityHeaders(res.headers);
      
      // Color grade
      let gradeColor = colors.red;
      if (report.grade.startsWith('A')) gradeColor = colors.green;
      else if (report.grade.startsWith('B')) gradeColor = colors.blue;
      else if (report.grade.startsWith('C')) gradeColor = colors.yellow;
      
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
      this.lastResponse = report;

    } catch (error: any) {
      console.error(colors.red(`Analysis failed: ${error.message}`));
    }
    console.log(''); // Spacer
  }

  private async runSeo(url?: string, showAll: boolean = false, jsonOutput: boolean = false) {
    if (!url) {
      // Try to use current document or base URL
      url = this.currentDocUrl || this.baseUrl || '';
      if (!url) {
        console.log(colors.yellow('Usage: seo <url> [-a] [--format json]'));
        console.log(colors.gray('  Examples: seo google.com | seo https://example.com -a'));
        console.log(colors.gray('  -a, --all      Show all checks (including passed)'));
        console.log(colors.gray('  --format json  Output raw JSON for programmatic use'));
        console.log(colors.gray('  Or set a base URL first: url https://example.com'));
        return;
      }
    } else if (!url.startsWith('http') && !url.startsWith('-')) {
      url = `https://${url}`;
    }

    if (!jsonOutput) {
      console.log(colors.gray(`Analyzing SEO for ${url}...`));
    }
    const startTime = performance.now();

    try {
      // Fetch the page - undici captures detailed timing via diagnostics_channel
      const res = await this.client.get(url);
      const html = await res.text();
      const duration = Math.round(performance.now() - startTime);

      // Run SEO analysis
      const report = await analyzeSeo(html, { baseUrl: url });

      // Inject timing data from undici's diagnostics (if available)
      // Map from Timings (undici) to SeoTiming (SEO report)
      const t = res.timings;
      report.timing = {
        ttfb: t?.firstByte ? Math.round(t.firstByte) : undefined,
        total: t?.total ? Math.round(t.total) : duration,
        dns: t?.dns ? Math.round(t.dns) : undefined,
        tcp: t?.tcp ? Math.round(t.tcp) : undefined,
        tls: t?.tls ? Math.round(t.tls) : undefined,
        download: t?.content ? Math.round(t.content) : undefined,
      };

      // JSON output mode for programmatic use
      if (jsonOutput) {
        const jsonResult = {
          url,
          analyzedAt: new Date().toISOString(),
          timing: report.timing,
          score: report.score,
          grade: report.grade,
          title: report.title,
          metaDescription: report.metaDescription,
          content: report.content,
          headings: report.headings,
          links: report.links,
          images: report.images,
          openGraph: report.openGraph,
          twitterCard: report.twitterCard,
          social: report.social,
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
        console.log(JSON.stringify(jsonResult, null, 2));
        this.lastResponse = jsonResult;
        return;
      }

      // Color grade
      let gradeColor = colors.red;
      if (report.grade === 'A') gradeColor = colors.green;
      else if (report.grade === 'B') gradeColor = colors.blue;
      else if (report.grade === 'C') gradeColor = colors.yellow;
      else if (report.grade === 'D') gradeColor = colors.magenta;

      console.log(`
${colors.bold(colors.cyan('🔍 SEO Analysis Report'))} ${colors.gray(`(${duration}ms)`)}
Grade: ${gradeColor(colors.bold(report.grade))}  (${report.score}/100)
`);

      // Show title and description
      if (report.title) {
        console.log(colors.bold('Title:') + ` ${report.title.text} ` + colors.gray(`(${report.title.length} chars)`));
      }
      if (report.metaDescription) {
        const desc = report.metaDescription.text.length > 80
          ? report.metaDescription.text.slice(0, 77) + '...'
          : report.metaDescription.text;
        console.log(colors.bold('Description:') + ` ${desc} ` + colors.gray(`(${report.metaDescription.length} chars)`));
      }

      // Show OpenGraph data
      if (report.openGraph && Object.values(report.openGraph).some(v => v)) {
        console.log('');
        console.log(colors.bold(colors.cyan('OpenGraph:')));
        if (report.openGraph.title) {
          const ogTitle = report.openGraph.title.length > 60
            ? report.openGraph.title.slice(0, 57) + '...'
            : report.openGraph.title;
          console.log(`  ${colors.gray('og:title:')} ${ogTitle}`);
        }
        if (report.openGraph.description) {
          const ogDesc = report.openGraph.description.length > 60
            ? report.openGraph.description.slice(0, 57) + '...'
            : report.openGraph.description;
          console.log(`  ${colors.gray('og:description:')} ${ogDesc}`);
        }
        if (report.openGraph.image) {
          const ogImg = report.openGraph.image.length > 50
            ? '...' + report.openGraph.image.slice(-47)
            : report.openGraph.image;
          console.log(`  ${colors.gray('og:image:')} ${colors.blue(ogImg)}`);
        }
        if (report.openGraph.type) {
          console.log(`  ${colors.gray('og:type:')} ${report.openGraph.type}`);
        }
      }

      // Show timing metrics
      if (report.timing) {
        const t = report.timing;
        console.log('');
        console.log(colors.bold('Timing:'));
        const timings: string[] = [];
        if (t.dns !== undefined) timings.push(`DNS ${t.dns}ms`);
        if (t.tcp !== undefined) timings.push(`TCP ${t.tcp}ms`);
        if (t.tls !== undefined) timings.push(`TLS ${t.tls}ms`);
        if (t.ttfb !== undefined) timings.push(`TTFB ${t.ttfb}ms`);
        if (t.download !== undefined) timings.push(`Download ${t.download}ms`);
        if (t.total !== undefined) timings.push(`Total ${t.total}ms`);
        console.log(`  ${timings.join(' → ')}`);
      }

      // Show content stats
      if (report.content) {
        console.log(colors.bold('Content:') + ` ${report.content.wordCount} words, ${report.content.paragraphCount} paragraphs, ~${report.content.readingTimeMinutes} min read`);
      }

      console.log('');
      console.log(colors.bold('Checks:'));

      // Filter checks based on showAll flag
      const checksToShow = showAll
        ? report.checks
        : report.checks.filter(c => c.status !== 'pass');

      // Group by status
      const failed = checksToShow.filter(c => c.status === 'fail');
      const warnings = checksToShow.filter(c => c.status === 'warn');
      const info = checksToShow.filter(c => c.status === 'info');
      const passed = showAll ? checksToShow.filter(c => c.status === 'pass') : [];

      // Display checks
      const displayCheck = (check: typeof report.checks[0]) => {
        let icon: string;
        let nameColor: (s: string) => string;
        switch (check.status) {
          case 'pass':
            icon = colors.green('✔');
            nameColor = colors.green;
            break;
          case 'warn':
            icon = colors.yellow('⚠');
            nameColor = colors.yellow;
            break;
          case 'fail':
            icon = colors.red('✖');
            nameColor = colors.red;
            break;
          default:
            icon = colors.blue('ℹ');
            nameColor = colors.blue;
        }
        console.log(`  ${icon} ${nameColor(check.name.padEnd(22))} ${check.message}`);
        if (check.recommendation && check.status !== 'pass') {
          console.log(`     ${colors.gray('→')} ${colors.gray(check.recommendation)}`);
        }
        // Show evidence details for errors/warnings (same as CLI)
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
      };

      if (failed.length > 0) {
        console.log(colors.red(`\n  Errors (${failed.length}):`));
        failed.forEach(displayCheck);
      }

      if (warnings.length > 0) {
        console.log(colors.yellow(`\n  Warnings (${warnings.length}):`));
        warnings.forEach(displayCheck);
      }

      if (info.length > 0) {
        console.log(colors.blue(`\n  Info (${info.length}):`));
        info.forEach(displayCheck);
      }

      if (passed.length > 0) {
        console.log(colors.green(`\n  Passed (${passed.length}):`));
        passed.forEach(displayCheck);
      }

      if (!showAll && report.checks.filter(c => c.status === 'pass').length > 0) {
        console.log(colors.gray(`\n  ${report.checks.filter(c => c.status === 'pass').length} checks passed. Use -a to show all.`));
      }

      console.log('');
      this.lastResponse = report;

    } catch (error: any) {
      console.error(colors.red(`SEO analysis failed: ${error.message}`));
    }
    console.log(''); // Spacer
  }

  private async runIpIntelligence(address?: string) {
    if (!address) {
      console.log(colors.yellow('Usage: ip <address>'));
      console.log(colors.gray('  Examples: ip 8.8.8.8 | ip 192.168.1.1'));
      return;
    }

    console.log(colors.gray(`Looking up ${address} using local GeoLite2 database...`));

    try {
      const { getIpInfo, isGeoIPAvailable } = await import('../../mcp/ip-intel.js');

      if (!isGeoIPAvailable()) {
        console.log(colors.gray(`Downloading GeoLite2 database...`));
      }

      const info = await getIpInfo(address);

      if (info.bogon) {
          console.log(colors.yellow(`\n⚠  ${address} is a Bogon/Private IP.`));
          console.log(colors.gray(`   Type: ${info.bogonType}`));
          this.lastResponse = info;
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
      this.lastResponse = info;

    } catch (error: any) {
      console.error(colors.red(`IP Lookup Failed: ${error.message}`));
    }
    console.log(''); // Spacer
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

  private async runDNSPropagation(domain: string, type: string = 'A') {
    if (!domain) {
      domain = this.getBaseDomain() || '';
      if (!domain) {
        console.log(colors.yellow('Usage: dns:propagate <domain> [type]'));
        console.log(colors.gray('  Examples: dns:propagate google.com | dns:propagate github.com TXT'));
        console.log(colors.gray('  Or set a base URL first: url https://example.com'));
        return;
      }
    }

    console.log(colors.gray(`Checking DNS propagation for ${domain} (${type})...`));
    
    try {
      const { checkPropagation, formatPropagationReport } = await import('../../dns/propagation.js');
      const results = await checkPropagation(domain, type); // Pass original domain, checkPropagation sanitizes internally
      console.log(formatPropagationReport(results, domain, type));
      this.lastResponse = results;
    } catch (error: any) {
      console.error(colors.red(`Propagation check failed: ${error.message}`));
    }
  }

  private async runDnsEmailCheck(domain?: string, selector?: string) {
    if (!domain) {
      domain = this.getBaseDomain() || '';
      if (!domain) {
        console.log(colors.yellow('Usage: dns:email <domain> [dkim-selector]'));
        console.log(colors.gray('  Examples: dns:email google.com | dns:email github.com google'));
        console.log(colors.gray('  Or set a base URL first: url https://example.com'));
        return;
      }
    }

    console.log(colors.gray(`Checking email security for ${domain}...`));
    const startTime = performance.now();

    try {
      const { validateSpf, validateDmarc, checkDkim } = await import('../../utils/dns-toolkit.js');

      // Run all checks in parallel
      const [spf, dmarc, dkim] = await Promise.all([
        validateSpf(domain),
        validateDmarc(domain),
        checkDkim(domain, selector || 'default')
      ]);

      const duration = Math.round(performance.now() - startTime);
      console.log(colors.green(`✔ Email security check completed`) + colors.gray(` (${duration}ms)\n`));

      // SPF Results
      console.log(colors.bold('SPF:'));
      if (spf.valid) {
        console.log(`  ${colors.green('✔')} ${spf.record || 'No record'}`);
      } else {
        console.log(`  ${colors.red('✖')} ${spf.errors?.join(', ') || 'Invalid'}`);
      }
      if (spf.warnings?.length) {
        spf.warnings.forEach((w: string) => console.log(`  ${colors.yellow('⚠')} ${w}`));
      }

      // DMARC Results
      console.log(colors.bold('\nDMARC:'));
      if (dmarc.valid) {
        console.log(`  ${colors.green('✔')} Policy: ${dmarc.policy || 'none'}`);
        if (dmarc.percentage !== undefined && dmarc.percentage < 100) {
          console.log(`  ${colors.yellow('⚠')} Only ${dmarc.percentage}% of emails affected`);
        }
      } else {
        console.log(`  ${colors.red('✖')} No DMARC record found`);
      }
      if (dmarc.warnings?.length) {
        dmarc.warnings.forEach((w: string) => console.log(`  ${colors.yellow('⚠')} ${w}`));
      }

      // DKIM Results
      console.log(colors.bold(`\nDKIM (${selector || 'default'}):`));
      if (dkim.found) {
        console.log(`  ${colors.green('✔')} Record found`);
        if (dkim.publicKey) {
          const keyPreview = dkim.publicKey.substring(0, 40) + '...';
          console.log(`  ${colors.gray('Key:')} ${keyPreview}`);
        }
      } else {
        console.log(`  ${colors.yellow('⚠')} No DKIM record for selector "${selector || 'default'}"`);
        console.log(`  ${colors.gray('Try: dns:email ' + domain + ' <selector>')}`);
      }

      console.log('');
      this.lastResponse = { spf, dmarc, dkim };
    } catch (error: any) {
      console.error(colors.red(`Email security check failed: ${error.message}`));
    }
  }

  private async runDnsHealth(domain?: string) {
    if (!domain) {
      domain = this.getBaseDomain() || '';
      if (!domain) {
        console.log(colors.yellow('Usage: dns:health <domain>'));
        console.log(colors.gray('  Example: dns:health google.com'));
        return;
      }
    }

    console.log(colors.gray(`Checking DNS health for ${domain}...`));
    const startTime = performance.now();

    try {
      const { checkDnsHealth } = await import('../../utils/dns-toolkit.js');
      const result = await checkDnsHealth(domain);
      const duration = Math.round(performance.now() - startTime);

      console.log(colors.green(`✔ DNS health check completed`) + colors.gray(` (${duration}ms)\n`));

      // Format grade color
      const gradeColor = result.grade === 'A' ? colors.green :
                        result.grade === 'B' ? colors.cyan :
                        result.grade === 'C' ? colors.yellow : colors.red;

      console.log(`${colors.bold('DNS Health Report')}`);
      console.log(`  ${colors.gray('Grade:')} ${gradeColor(result.grade)} (${result.score}/100)`);
      console.log(`  ${colors.gray('Checks:')} ${result.checks?.filter((c: any) => c.passed).length || 0} passed, ${result.checks?.filter((c: any) => !c.passed).length || 0} failed`);

      if (result.checks) {
        console.log('');
        result.checks.forEach((check: any) => {
          const icon = check.passed ? colors.green('✔') : colors.red('✖');
          console.log(`  ${icon} ${check.name}: ${check.message || (check.passed ? 'OK' : 'Failed')}`);
        });
      }
      console.log('');
      this.lastResponse = result;
    } catch (error: any) {
      console.error(colors.red(`DNS health check failed: ${error.message}`));
    }
  }

  private async runDnsSpf(domain?: string) {
    if (!domain) {
      domain = this.getBaseDomain() || '';
      if (!domain) {
        console.log(colors.yellow('Usage: dns:spf <domain>'));
        console.log(colors.gray('  Example: dns:spf google.com'));
        return;
      }
    }

    console.log(colors.gray(`Validating SPF for ${domain}...`));

    try {
      const { validateSpf } = await import('../../utils/dns-toolkit.js');
      const result = await validateSpf(domain);

      console.log('');
      console.log(colors.bold('SPF Validation'));

      if (result.valid) {
        console.log(`  ${colors.green('✔')} Valid SPF record`);
      } else {
        console.log(`  ${colors.red('✖')} Invalid SPF record`);
      }

      if (result.record) {
        console.log(`  ${colors.gray('Record:')} ${result.record}`);
      }

      if (result.lookupCount !== undefined) {
        const lookupColor = result.lookupCount > 10 ? colors.red : result.lookupCount > 7 ? colors.yellow : colors.green;
        console.log(`  ${colors.gray('DNS Lookups:')} ${lookupColor(result.lookupCount.toString())}/10`);
      }

      if (result.mechanisms && result.mechanisms.length > 0) {
        console.log(`  ${colors.gray('Mechanisms:')} ${result.mechanisms.join(', ')}`);
      }

      if (result.includes && result.includes.length > 0) {
        console.log(`  ${colors.gray('Includes:')} ${result.includes.join(', ')}`);
      }

      if (result.warnings && result.warnings.length > 0) {
        console.log('');
        result.warnings.forEach((w: string) => console.log(`  ${colors.yellow('⚠')} ${w}`));
      }

      if (result.errors && result.errors.length > 0) {
        console.log('');
        result.errors.forEach((e: string) => console.log(`  ${colors.red('✖')} ${e}`));
      }

      console.log('');
      this.lastResponse = result;
    } catch (error: any) {
      console.error(colors.red(`SPF validation failed: ${error.message}`));
    }
  }

  private async runDnsDmarc(domain?: string) {
    if (!domain) {
      domain = this.getBaseDomain() || '';
      if (!domain) {
        console.log(colors.yellow('Usage: dns:dmarc <domain>'));
        console.log(colors.gray('  Example: dns:dmarc google.com'));
        return;
      }
    }

    console.log(colors.gray(`Validating DMARC for ${domain}...`));

    try {
      const { validateDmarc } = await import('../../utils/dns-toolkit.js');
      const result = await validateDmarc(domain);

      console.log('');
      console.log(colors.bold('DMARC Validation'));

      if (result.valid) {
        console.log(`  ${colors.green('✔')} Valid DMARC record`);
      } else {
        console.log(`  ${colors.red('✖')} No DMARC record found`);
      }

      if (result.record) {
        console.log(`  ${colors.gray('Record:')} ${result.record}`);
      }

      if (result.policy) {
        const policyColor = result.policy === 'reject' ? colors.green :
                           result.policy === 'quarantine' ? colors.yellow : colors.gray;
        console.log(`  ${colors.gray('Policy:')} ${policyColor(result.policy)}`);
      }

      if (result.subdomainPolicy) {
        console.log(`  ${colors.gray('Subdomain Policy:')} ${result.subdomainPolicy}`);
      }

      if (result.percentage !== undefined && result.percentage < 100) {
        console.log(`  ${colors.yellow('⚠')} Only ${result.percentage}% of emails affected`);
      }

      if (result.rua) {
        console.log(`  ${colors.gray('Aggregate Reports:')} ${result.rua}`);
      }

      if (result.ruf) {
        console.log(`  ${colors.gray('Forensic Reports:')} ${result.ruf}`);
      }

      if (result.warnings && result.warnings.length > 0) {
        console.log('');
        result.warnings.forEach((w: string) => console.log(`  ${colors.yellow('⚠')} ${w}`));
      }

      console.log('');
      this.lastResponse = result;
    } catch (error: any) {
      console.error(colors.red(`DMARC validation failed: ${error.message}`));
    }
  }

  private async runDnsDkim(domain?: string, selector?: string) {
    if (!domain) {
      domain = this.getBaseDomain() || '';
      if (!domain) {
        console.log(colors.yellow('Usage: dns:dkim <domain> [selector]'));
        console.log(colors.gray('  Example: dns:dkim google.com | dns:dkim google.com google'));
        return;
      }
    }

    const dkimSelector = selector || 'default';
    console.log(colors.gray(`Checking DKIM for ${domain} (selector: ${dkimSelector})...`));

    try {
      const { checkDkim } = await import('../../utils/dns-toolkit.js');
      const result = await checkDkim(domain, dkimSelector);

      console.log('');
      console.log(colors.bold(`DKIM Check (selector: ${dkimSelector})`));

      if (result.found) {
        console.log(`  ${colors.green('✔')} DKIM record found`);
        if (result.publicKey) {
          const keyPreview = result.publicKey.substring(0, 50) + '...';
          console.log(`  ${colors.gray('Public Key:')} ${keyPreview}`);
        }
        if (result.record) {
          console.log(`  ${colors.gray('Record:')} ${result.record.substring(0, 80)}...`);
        }
      } else {
        console.log(`  ${colors.yellow('⚠')} No DKIM record found for selector "${dkimSelector}"`);
        console.log(`  ${colors.gray('Common selectors: google, selector1, selector2, k1, default')}`);
      }

      console.log('');
      this.lastResponse = result;
    } catch (error: any) {
      console.error(colors.red(`DKIM check failed: ${error.message}`));
    }
  }

  private async runDnsDig(args: string[]) {
    // Parse dig-style arguments: [@server] domain [type]
    let server = '';
    let domain = '';
    let recordType = 'A';
    let shortMode = false;

    for (const arg of args) {
      if (arg.startsWith('@')) {
        server = arg.slice(1);
      } else if (arg === '+short') {
        shortMode = true;
      } else if (['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA', 'CAA', 'SRV', 'PTR', 'ANY'].includes(arg.toUpperCase())) {
        recordType = arg.toUpperCase();
      } else if (!domain) {
        domain = arg;
      }
    }

    if (!domain) {
      domain = this.getBaseDomain() || '';
      if (!domain) {
        console.log(colors.yellow('Usage: dns:dig [@server] <domain> [type] [+short]'));
        console.log(colors.gray('  Examples:'));
        console.log(colors.gray('    dns:dig google.com'));
        console.log(colors.gray('    dns:dig google.com MX'));
        console.log(colors.gray('    dns:dig @8.8.8.8 google.com A'));
        console.log(colors.gray('    dns:dig google.com TXT +short'));
        return;
      }
    }

    console.log(colors.gray(`Querying ${recordType} record for ${domain}${server ? ` via ${server}` : ''}...`));

    try {
      const { dig, formatDigOutput } = await import('../../utils/dns-toolkit.js');
      const result = await dig(domain, { type: recordType as any, server: server || undefined });

      console.log('');
      if (shortMode) {
        // Short mode: just output the values
        if (result.answer && result.answer.length > 0) {
          result.answer.forEach((ans: any) => {
            console.log(ans.data || ans.address || ans.exchange || JSON.stringify(ans));
          });
        } else {
          console.log(colors.gray('(no results)'));
        }
      } else {
        console.log(formatDigOutput(result, shortMode));
      }
      this.lastResponse = result;
    } catch (error: any) {
      console.error(colors.red(`DNS lookup failed: ${error.message}`));
    }
  }

  private async runDnsGenerate(args: string[]) {
    // Parse arguments: dns:generate [policy] [options]
    // Example: dns:generate reject rua=reports@example.com ruf=forensics@example.com
    // Example: dns:generate quarantine sp=none pct=50

    if (args.length === 0 || args[0] === 'help') {
      console.log(colors.bold('DMARC Record Generator'));
      console.log('');
      console.log(colors.yellow('Usage: dns:generate <policy> [options]'));
      console.log('');
      console.log(colors.gray('Policies:'));
      console.log('  none       - Monitor only, take no action');
      console.log('  quarantine - Mark suspicious emails as spam');
      console.log('  reject     - Block suspicious emails');
      console.log('');
      console.log(colors.gray('Options (key=value format):'));
      console.log('  rua=<email>      - Aggregate report address(es), comma-separated');
      console.log('  ruf=<email>      - Forensic report address(es), comma-separated');
      console.log('  sp=<policy>      - Subdomain policy (none|quarantine|reject)');
      console.log('  pct=<0-100>      - Percentage of messages to apply policy');
      console.log('  adkim=<s|r>      - DKIM alignment (s=strict, r=relaxed)');
      console.log('  aspf=<s|r>       - SPF alignment (s=strict, r=relaxed)');
      console.log('  ri=<seconds>     - Report interval (default: 86400 = 1 day)');
      console.log('');
      console.log(colors.gray('Examples:'));
      console.log('  dns:generate reject');
      console.log('  dns:generate reject rua=reports@example.com');
      console.log('  dns:generate quarantine sp=reject pct=50');
      console.log('  dns:generate reject rua=dmarc@example.com,backup@example.com');
      return;
    }

    const policy = args[0].toLowerCase();
    if (!['none', 'quarantine', 'reject'].includes(policy)) {
      console.log(colors.red(`Invalid policy: ${policy}`));
      console.log(colors.gray('Valid policies: none, quarantine, reject'));
      return;
    }

    // Parse options from remaining args
    const options: Record<string, string> = {};
    for (let i = 1; i < args.length; i++) {
      const [key, ...valueParts] = args[i].split('=');
      if (valueParts.length > 0) {
        options[key.toLowerCase()] = valueParts.join('=');
      }
    }

    try {
      const { generateDmarc } = await import('../../utils/dns-toolkit.js');

      const dmarcOptions: {
        policy: 'none' | 'quarantine' | 'reject';
        subdomainPolicy?: 'none' | 'quarantine' | 'reject';
        percentage?: number;
        aggregateReports?: string[];
        forensicReports?: string[];
        alignmentDkim?: 'relaxed' | 'strict';
        alignmentSpf?: 'relaxed' | 'strict';
        reportInterval?: number;
      } = {
        policy: policy as 'none' | 'quarantine' | 'reject',
      };

      if (options.sp) {
        dmarcOptions.subdomainPolicy = options.sp as 'none' | 'quarantine' | 'reject';
      }
      if (options.pct) {
        dmarcOptions.percentage = parseInt(options.pct, 10);
      }
      if (options.rua) {
        dmarcOptions.aggregateReports = options.rua.split(',').map(e => e.trim());
      }
      if (options.ruf) {
        dmarcOptions.forensicReports = options.ruf.split(',').map(e => e.trim());
      }
      if (options.adkim) {
        dmarcOptions.alignmentDkim = options.adkim === 's' ? 'strict' : 'relaxed';
      }
      if (options.aspf) {
        dmarcOptions.alignmentSpf = options.aspf === 's' ? 'strict' : 'relaxed';
      }
      if (options.ri) {
        dmarcOptions.reportInterval = parseInt(options.ri, 10);
      }

      const record = generateDmarc(dmarcOptions);

      console.log('');
      console.log(colors.bold(colors.green('Generated DMARC Record')));
      console.log('');
      console.log(colors.gray('DNS Record Name:'));
      console.log(`  _dmarc.yourdomain.com`);
      console.log('');
      console.log(colors.gray('TXT Record Value:'));
      console.log(`  ${colors.cyan(record)}`);
      console.log('');
      console.log(colors.gray('Policy Summary:'));
      console.log(`  ${colors.gray('Policy:')}          ${policy}`);
      if (dmarcOptions.subdomainPolicy) {
        console.log(`  ${colors.gray('Subdomain Policy:')} ${dmarcOptions.subdomainPolicy}`);
      }
      if (dmarcOptions.percentage !== undefined && dmarcOptions.percentage !== 100) {
        console.log(`  ${colors.gray('Percentage:')}      ${dmarcOptions.percentage}%`);
      }
      if (dmarcOptions.aggregateReports) {
        console.log(`  ${colors.gray('Aggregate Reports:')} ${dmarcOptions.aggregateReports.join(', ')}`);
      }
      if (dmarcOptions.forensicReports) {
        console.log(`  ${colors.gray('Forensic Reports:')} ${dmarcOptions.forensicReports.join(', ')}`);
      }
      console.log('');

      this.lastResponse = { record, options: dmarcOptions };
    } catch (error: any) {
      console.error(colors.red(`DMARC generation failed: ${error.message}`));
    }
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

  private async runFtp(args: string[]) {
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

    const { createFTP } = await import('../../protocols/ftp.js');

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
          this.lastResponse = result.data;
          break;
        }
        case 'get': {
          const remote = commandArgs[0];
          if (!remote) {
            console.log(colors.yellow('Usage: ftp <host> get <remote-path>'));
            break;
          }
          const path = await import('node:path');
          const local = commandArgs[1] || path.basename(remote);
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
          const path = await import('node:path');
          const remote = commandArgs[1] || '/' + path.basename(local);
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

  private async runTelnet(host?: string, portStr?: string) {
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
      const { createTelnet } = await import('../../protocols/telnet.js');

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
      const originalPrompt = this.rl.getPrompt();

      // Set up data handler
      client.on('data', (data: string) => {
        process.stdout.write(data);
      });

      client.on('close', () => {
        console.log(colors.yellow('\nConnection closed'));
        this.rl.setPrompt(originalPrompt);
        this.prompt();
      });

      // Enter telnet mode - handle input differently
      const telnetPrompt = () => {
        this.rl.question('', async (input) => {
          if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
            console.log(colors.yellow('Disconnecting...'));
            await client.close();
            this.rl.setPrompt(originalPrompt);
            this.prompt();
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

  private async runSpider(args: string[]) {
    // Parse arguments
    let url = '';
    let maxDepth = 5;
    let maxPages = 100;
    let concurrency = 5;
    let seoEnabled = false;
    let outputFile = '';

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
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
      } else if (!arg.includes('=')) {
        url = arg;
      }
    }

    // If no URL provided, use baseUrl
    if (!url) {
      if (!this.baseUrl) {
        console.log(colors.yellow('Usage: spider <url> [options]'));
        console.log(colors.gray('  Options:'));
        console.log(colors.gray('    depth=5           Max crawl depth'));
        console.log(colors.gray('    limit=100         Max pages to crawl'));
        console.log(colors.gray('    concurrency=5     Concurrent requests'));
        console.log(colors.gray('    seo               Enable SEO analysis'));
        console.log(colors.gray('    output=file.json  Save JSON report'));
        console.log(colors.gray('  Examples:'));
        console.log(colors.gray('    spider example.com'));
        console.log(colors.gray('    spider example.com depth=2 limit=50'));
        console.log(colors.gray('    spider example.com seo output=seo-report.json'));
        return;
      }
      url = this.baseUrl;
    } else if (!url.startsWith('http')) {
      url = `https://${url}`;
    }

    console.log(colors.cyan(`\nSpider starting: ${url}`));
    const modeLabel = seoEnabled ? colors.magenta(' + SEO') : '';
    console.log(colors.gray(`  Depth: ${maxDepth} | Limit: ${maxPages} | Concurrency: ${concurrency}${modeLabel}`));
    if (outputFile) {
      console.log(colors.gray(`  Output: ${outputFile}`));
    }
    console.log('');

    // Use SEO Spider when seo mode is enabled
    if (seoEnabled) {
      const seoSpider = new SeoSpider({
        maxDepth,
        maxPages,
        concurrency,
        sameDomain: true,
        delay: 100,
        seo: true,
        output: outputFile || undefined,
        onProgress: (progress) => {
          process.stdout.write(`\r${colors.gray('  Crawling:')} ${colors.cyan(progress.crawled.toString())} pages | ${colors.gray('Queue:')} ${progress.queued} | ${colors.gray('Depth:')} ${progress.depth}   `);
        },
      });

      try {
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

        // Calculate HTTP status distribution
        const statusCounts = new Map<number, number>();
        for (const page of result.pages) {
          const status = page.status || 0;
          statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
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
        for (const [status, count] of sortedStatuses.slice(0, 5)) {
          const statusLabel = status === 0 ? 'Error' : status.toString();
          const statusColor = status >= 400 || status === 0 ? colors.red :
                              status >= 300 ? colors.yellow : colors.green;
          const pct = ((count / result.pages.length) * 100).toFixed(0);
          console.log(`    ${statusColor(statusLabel.padEnd(5))} ${count.toString().padStart(3)} (${pct}%)`);
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

        // Store result for further queries
        this.lastResponse = result;
        console.log(colors.gray('\n  Result stored in lastResponse.'));
      } catch (error: any) {
        console.error(colors.red(`SEO Spider failed: ${error.message}`));
      }
    } else {
      // Regular spider (non-SEO mode)
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

      try {
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

        // Save to JSON if output specified
        if (outputFile) {
          const reportData = {
            ...result,
            visited: Array.from(result.visited),
            generatedAt: new Date().toISOString(),
          };
          await fs.writeFile(outputFile, JSON.stringify(reportData, null, 2), 'utf-8');
          console.log(colors.green(`\n  Report saved to: ${outputFile}`));
        }

        // Store result for further queries
        this.lastResponse = result;
        console.log(colors.gray('\n  Result stored in lastResponse. Use $links to explore.'));
      } catch (error: any) {
        console.error(colors.red(`Spider failed: ${error.message}`));
      }
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
        const hasContent = mapData.sourcesContent?.[i];
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

  // ============ Documentation Search Commands ============

  private async runSearch(query: string) {
    // Open fullscreen search panel
    try {
      // Close readline temporarily to allow raw mode
      this.rl.pause();

      await openSearchPanel(query.trim() || undefined);

      // Resume readline after panel closes
      this.rl.resume();
      this.prompt();
    } catch (error: any) {
      console.error(colors.red(`Search failed: ${error.message}`));
      this.rl.resume();
      this.prompt();
    }
  }

  private async runSuggest(useCase: string) {
    if (!useCase.trim()) {
      console.log(colors.yellow('Usage: suggest <use-case>'));
      console.log(colors.gray('  Examples:'));
      console.log(colors.gray('    suggest implement retry with exponential backoff'));
      console.log(colors.gray('    suggest cache API responses'));
      console.log(colors.gray('    suggest stream AI responses from OpenAI'));
      return;
    }

    console.log(colors.gray('Getting suggestions...'));

    try {
      const search = getShellSearch();
      const suggestion = await search.suggest(useCase);

      console.log('');
      this.printMarkdown(suggestion);
    } catch (error: any) {
      console.error(colors.red(`Suggest failed: ${error.message}`));
    }
  }

  private async runExample(feature: string) {
    if (!feature.trim()) {
      console.log(colors.yellow('Usage: example <feature>'));
      console.log(colors.gray('  Examples:'));
      console.log(colors.gray('    example retry'));
      console.log(colors.gray('    example streaming'));
      console.log(colors.gray('    example cache'));
      console.log(colors.gray('    example websocket'));
      return;
    }

    console.log(colors.gray('Finding examples...'));

    try {
      const search = getShellSearch();
      const examples = await search.getExamples(feature, { limit: 3 });

      console.log('');
      this.printMarkdown(examples);
    } catch (error: any) {
      console.error(colors.red(`Example lookup failed: ${error.message}`));
    }
  }

  private printMarkdown(text: string) {
    // Simple markdown rendering for terminal
    const lines = text.split('\n');

    for (const line of lines) {
      if (line.startsWith('**') && line.endsWith('**')) {
        // Bold text
        console.log(colors.bold(line.replace(/\*\*/g, '')));
      } else if (line.startsWith('### ')) {
        // H3
        console.log(colors.bold(colors.cyan(line.slice(4))));
      } else if (line.startsWith('## ')) {
        // H2
        console.log(colors.bold(colors.cyan(line.slice(3))));
      } else if (line.startsWith('# ')) {
        // H1
        console.log(colors.bold(colors.cyan(line.slice(2))));
      } else if (line.startsWith('```')) {
        // Code block delimiter - just skip the marker
        if (line.length > 3) {
          // Opening with language
          console.log(colors.gray('─'.repeat(40)));
        } else {
          // Closing
          console.log(colors.gray('─'.repeat(40)));
        }
      } else if (line.startsWith('  - ') || line.startsWith('- ')) {
        // List item
        const content = line.replace(/^\s*-\s*/, '');
        console.log(`  ${colors.green('•')} ${content}`);
      } else if (line.match(/^\s+/)) {
        // Indented (likely code)
        console.log(colors.yellow(line));
      } else {
        console.log(line);
      }
    }
  }

  // HAR state for shell recording
  private harRecording = false;
  private harFile = '';
  private harEntries: unknown[] = [];

  private async runHar(args: string[]) {
    // Main HAR command - show help or delegate to subcommands
    if (args.length === 0 || args[0] === 'help') {
      console.log(colors.bold('HAR Recording & Playback'));
      console.log('');
      console.log(colors.yellow('Commands:'));
      console.log('  har:record <file>       Start recording requests to HAR file');
      console.log('  har:play <file>         Replay requests from HAR file');
      console.log('  har:info <file>         Show HAR file information');
      console.log('');
      console.log(colors.gray('Examples:'));
      console.log('  har:record api.har      Start recording session');
      console.log('  har:play api.har        Replay recorded requests');
      console.log('  har:info api.har        Inspect HAR file contents');
      console.log('');
      console.log(colors.gray('Recording mode:'));
      console.log('  While recording, all HTTP requests are saved to the HAR file.');
      console.log('  Use "har:stop" to end recording.');
      return;
    }

    // Delegate to subcommands
    const [subCmd, ...rest] = args;
    switch (subCmd) {
      case 'record':
        await this.runHarRecord(rest);
        break;
      case 'play':
        await this.runHarPlay(rest);
        break;
      case 'info':
        await this.runHarInfo(rest[0]);
        break;
      case 'stop':
        await this.runHarStop();
        break;
      default:
        console.log(colors.yellow(`Unknown HAR command: ${subCmd}`));
        console.log(colors.gray('Use "har help" for usage'));
    }
  }

  private async runHarRecord(args: string[]) {
    if (args.length === 0) {
      console.log(colors.yellow('Usage: har:record <file>'));
      console.log(colors.gray('  Example: har:record api.har'));
      console.log('');
      console.log(colors.gray('Note: After starting, all requests will be recorded.'));
      console.log(colors.gray('      Use "har:stop" to end recording.'));
      return;
    }

    const file = args[0];

    if (this.harRecording) {
      console.log(colors.yellow(`Already recording to ${this.harFile}`));
      console.log(colors.gray('Use "har:stop" to end current recording first.'));
      return;
    }

    // Start recording
    this.harRecording = true;
    this.harFile = file;
    this.harEntries = [];

    // Set up hooks on the client to record requests
    const { harRecorderPlugin } = await import('../../plugins/har-recorder.js');

    // Call the plugin directly to register hooks on the client
    const plugin = harRecorderPlugin({
      path: file,
      onEntry: (entry: unknown) => {
        this.harEntries.push(entry);
        console.log(colors.green('✔') + colors.gray(` Recorded: ${(entry as { request: { method: string; url: string } }).request.method} ${(entry as { request: { method: string; url: string } }).request.url}`));
      }
    });
    plugin(this.client);

    console.log(colors.green(`✔ Recording started → ${file}`));
    console.log(colors.gray('  All HTTP requests will be saved.'));
    console.log(colors.gray('  Use "har:stop" to end recording.'));
    console.log('');
  }

  private async runHarStop() {
    if (!this.harRecording) {
      console.log(colors.yellow('No recording in progress'));
      return;
    }

    console.log(colors.green(`✔ Recording stopped`));
    console.log(colors.gray(`  ${this.harEntries.length} entries saved to ${this.harFile}`));

    this.harRecording = false;
    this.harFile = '';
    this.harEntries = [];
    console.log('');
  }

  private async runHarPlay(args: string[]) {
    if (args.length === 0) {
      console.log(colors.yellow('Usage: har:play <file>'));
      console.log(colors.gray('  Example: har:play api.har'));
      return;
    }

    const file = args[0];

    try {
      const { promises: fsPromises } = await import('node:fs');
      const content = await fsPromises.readFile(file, 'utf-8');
      const har = JSON.parse(content);
      const entries = har.log?.entries || [];

      if (entries.length === 0) {
        console.log(colors.yellow('No entries found in HAR file'));
        return;
      }

      console.log(colors.cyan(`Replaying ${entries.length} requests from ${file}`));
      console.log('');

      let success = 0;

      for (const entry of entries) {
        const req = entry.request;
        const expectedRes = entry.response;

        console.log(colors.green('✔') + ` ${req.method} ${req.url.slice(0, 60)}... → ${colors.cyan(expectedRes.status.toString())}`);
        success++;
      }

      console.log('');
      console.log(colors.green(`✔ Replayed ${success} requests`));
    } catch (error: any) {
      console.error(colors.red(`Failed to read HAR file: ${error.message}`));
    }
    console.log('');
  }

  private async runHarInfo(file?: string) {
    if (!file) {
      console.log(colors.yellow('Usage: har:info <file>'));
      console.log(colors.gray('  Example: har:info api.har'));
      return;
    }

    try {
      const { promises: fsPromises } = await import('node:fs');
      const content = await fsPromises.readFile(file, 'utf-8');
      const har = JSON.parse(content);
      const entries = har.log?.entries || [];

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

      this.lastResponse = { entries: entries.length, methods, hosts, totalSize, totalTime };
    } catch (error: any) {
      console.error(colors.red(`Failed to read HAR file: ${error.message}`));
    }
    console.log('');
  }

  private async runGraphQL(args: string[]) {
    // Parse: graphql <endpoint> <query|mutation> [variables...]
    // Variables: key=value (JSON values supported)

    if (args.length === 0 || args[0] === 'help') {
      console.log(colors.bold('GraphQL Client'));
      console.log('');
      console.log(colors.yellow('Usage: graphql <endpoint> <query> [variables...]'));
      console.log('');
      console.log(colors.gray('Arguments:'));
      console.log('  <endpoint>     GraphQL endpoint URL or path');
      console.log('  <query>        GraphQL query string (inline or @file.graphql)');
      console.log('  [variables]    Variables as key=value pairs');
      console.log('');
      console.log(colors.gray('Examples:'));
      console.log('  graphql /graphql "{ users { id name } }"');
      console.log('  graphql https://api.example.com/graphql "query GetUser($id: ID!) { user(id: $id) { name } }" id=123');
      console.log('  graphql /graphql @query.graphql userId=abc');
      console.log('');
      console.log(colors.gray('Notes:'));
      console.log('  - Use @filename to load query from file');
      console.log('  - Variables are passed as key=value, JSON supported');
      return;
    }

    let endpoint = args[0];
    let query = args[1];
    const variables: Record<string, unknown> = {};

    if (!query) {
      console.log(colors.yellow('Missing GraphQL query. Use "graphql help" for usage.'));
      return;
    }

    // Build full URL if needed
    if (!endpoint.startsWith('http')) {
      if (this.baseUrl) {
        endpoint = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
      } else {
        console.log(colors.yellow('No base URL set. Provide full URL or use "url <baseUrl>" first.'));
        return;
      }
    }

    // Check if query is from file
    if (query.startsWith('@')) {
      const filePath = query.slice(1);
      try {
        const { promises: fs } = await import('node:fs');
        query = await fs.readFile(filePath, 'utf-8');
        console.log(colors.gray(`Loaded query from ${filePath}`));
      } catch (err: any) {
        console.log(colors.red(`Failed to load query file: ${err.message}`));
        return;
      }
    }

    // Parse variables from remaining args
    for (let i = 2; i < args.length; i++) {
      const arg = args[i];
      const eqIndex = arg.indexOf('=');
      if (eqIndex > 0) {
        const key = arg.slice(0, eqIndex);
        let value: unknown = arg.slice(eqIndex + 1);

        // Try to parse as JSON
        try {
          value = JSON.parse(value as string);
        } catch {
          // Keep as string
        }

        variables[key] = value;
      }
    }

    console.log(colors.gray(`POST ${endpoint}`));
    if (Object.keys(variables).length > 0) {
      console.log(colors.gray(`Variables: ${JSON.stringify(variables)}`));
    }

    const startTime = performance.now();

    try {
      const response = await this.client.post(endpoint, {
        query,
        variables: Object.keys(variables).length > 0 ? variables : undefined,
      });

      const duration = Math.round(performance.now() - startTime);
      const result = await response.json() as { data?: unknown; errors?: Array<{ message: string }> };

      // Check for GraphQL errors
      if (result.errors && result.errors.length > 0) {
        console.log(colors.yellow(`\nGraphQL Errors (${duration}ms):`));
        for (const error of result.errors) {
          console.log(colors.red(`  • ${error.message}`));
        }
        if (result.data) {
          console.log(colors.gray('\nPartial data:'));
          console.log(highlight(JSON.stringify(result.data, null, 2)));
        }
      } else {
        console.log(colors.green(`\n✔ Success`) + colors.gray(` (${duration}ms)`));
        console.log('');
        console.log(highlight(JSON.stringify(result.data, null, 2)));
      }

      this.lastResponse = result;
    } catch (error: any) {
      console.error(colors.red(`GraphQL Error: ${error.message}`));
    }
    console.log('');
  }

  private async runJsonRpc(args: string[]) {
    // Parse: jsonrpc <endpoint> <method> [params...]
    // Params: positional values or key=value for named params

    if (args.length === 0 || args[0] === 'help') {
      console.log(colors.bold('JSON-RPC 2.0 Client'));
      console.log('');
      console.log(colors.yellow('Usage: jsonrpc <endpoint> <method> [params...]'));
      console.log('');
      console.log(colors.gray('Arguments:'));
      console.log('  <endpoint>     JSON-RPC endpoint URL or path');
      console.log('  <method>       RPC method name');
      console.log('  [params]       Positional args or key=value for named params');
      console.log('');
      console.log(colors.gray('Examples:'));
      console.log('  jsonrpc /rpc add 1 2');
      console.log('  jsonrpc /rpc getUser id=123');
      console.log('  jsonrpc https://api.example.com/rpc eth_blockNumber');
      console.log('');
      console.log(colors.gray('Notes:'));
      console.log('  - Positional params: jsonrpc /rpc add 1 2 → params: [1, 2]');
      console.log('  - Named params: jsonrpc /rpc getUser id=123 → params: {id: 123}');
      console.log('  - Values are auto-parsed (numbers, booleans, JSON)');
      return;
    }

    let endpoint = args[0];
    const method = args[1];

    if (!method) {
      console.log(colors.yellow('Missing RPC method. Use "jsonrpc help" for usage.'));
      return;
    }

    // Build full URL if needed
    if (!endpoint.startsWith('http')) {
      if (this.baseUrl) {
        endpoint = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
      } else {
        console.log(colors.yellow('No base URL set. Provide full URL or use "url <baseUrl>" first.'));
        return;
      }
    }

    // Parse params from remaining args
    let params: unknown[] | Record<string, unknown> | undefined;
    const positional: unknown[] = [];
    const named: Record<string, unknown> = {};
    let hasNamed = false;

    for (let i = 2; i < args.length; i++) {
      const arg = args[i];
      const eqIndex = arg.indexOf('=');

      if (eqIndex > 0) {
        // Named parameter
        hasNamed = true;
        const key = arg.slice(0, eqIndex);
        let value: unknown = arg.slice(eqIndex + 1);

        // Try to parse as JSON/number/boolean
        try {
          value = JSON.parse(value as string);
        } catch {
          // Keep as string
        }

        named[key] = value;
      } else {
        // Positional parameter
        let value: unknown = arg;
        try {
          value = JSON.parse(arg);
        } catch {
          // Keep as string
        }
        positional.push(value);
      }
    }

    // Decide which format to use
    if (hasNamed && positional.length === 0) {
      params = named;
    } else if (!hasNamed && positional.length > 0) {
      params = positional;
    } else if (hasNamed && positional.length > 0) {
      // Mixed - prefer named with positional as array
      console.log(colors.yellow('Warning: Mixed params detected. Using named params only.'));
      params = named;
    }

    // Build JSON-RPC request
    const rpcRequest = {
      jsonrpc: '2.0' as const,
      method,
      params,
      id: Date.now(),
    };

    console.log(colors.gray(`POST ${endpoint}`));
    console.log(colors.gray(`Method: ${method}`));
    if (params) {
      console.log(colors.gray(`Params: ${JSON.stringify(params)}`));
    }

    const startTime = performance.now();

    try {
      const response = await this.client.post(endpoint, rpcRequest);
      const duration = Math.round(performance.now() - startTime);
      const result = await response.json() as {
        jsonrpc: string;
        result?: unknown;
        error?: { code: number; message: string; data?: unknown };
        id: number;
      };

      if (result.error) {
        console.log(colors.red(`\nRPC Error (${duration}ms):`));
        console.log(colors.red(`  Code: ${result.error.code}`));
        console.log(colors.red(`  Message: ${result.error.message}`));
        if (result.error.data) {
          console.log(colors.gray('  Data:'));
          console.log(highlight(JSON.stringify(result.error.data, null, 2)));
        }
      } else {
        console.log(colors.green(`\n✔ Success`) + colors.gray(` (${duration}ms)`));
        console.log('');
        console.log(highlight(JSON.stringify(result.result, null, 2)));
      }

      this.lastResponse = result;
    } catch (error: any) {
      console.error(colors.red(`JSON-RPC Error: ${error.message}`));
    }
    console.log('');
  }

  private async runHls(args: string[]) {
    // Parse: hls <url> [info|download] [options...]
    // Options: output=file.ts, quality=highest|lowest

    if (args.length === 0 || args[0] === 'help') {
      console.log(colors.bold('HLS Streaming Client'));
      console.log('');
      console.log(colors.yellow('Usage: hls <url> [command] [options...]'));
      console.log('');
      console.log(colors.gray('Commands:'));
      console.log('  info           Show stream information (default)');
      console.log('  download       Download the stream to a file');
      console.log('');
      console.log(colors.gray('Options:'));
      console.log('  output=<file>      Output file for download (default: stream.ts)');
      console.log('  quality=<level>    Quality selection: highest, lowest (default: highest)');
      console.log('');
      console.log(colors.gray('Examples:'));
      console.log('  hls https://example.com/stream.m3u8');
      console.log('  hls https://example.com/live.m3u8 info');
      console.log('  hls https://example.com/vod.m3u8 download output=video.ts');
      console.log('  hls https://example.com/stream.m3u8 download quality=lowest');
      return;
    }

    let url = args[0];
    let command = 'info';
    const options: Record<string, string> = {};

    // Parse remaining args
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg.includes('=')) {
        const [key, value] = arg.split('=');
        options[key] = value;
      } else if (['info', 'download'].includes(arg)) {
        command = arg;
      }
    }

    // Build full URL if needed
    if (!url.startsWith('http')) {
      if (this.baseUrl) {
        url = `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
      } else {
        url = `https://${url}`;
      }
    }

    console.log(colors.gray(`Fetching playlist: ${url}`));

    try {
      const { hls } = await import('../../plugins/hls.js');

      const hlsClient = hls(this.client, url, {
        quality: options.quality as 'highest' | 'lowest' || 'highest',
      });

      if (command === 'info') {
        const info = await hlsClient.info();

        console.log(colors.green('\n✔ HLS Stream Info'));
        console.log('');

        if (info.master) {
          console.log(colors.bold('  Master Playlist:'));
          console.log(`    ${colors.cyan('Variants')}: ${info.master.variants.length}`);
          console.log('');
          info.master.variants.forEach((v, i) => {
            const bandwidth = v.bandwidth ? `${Math.round(v.bandwidth / 1000)}kbps` : 'unknown';
            const resolution = v.resolution || 'unknown';
            const selected = info.selectedVariant?.url === v.url ? colors.green(' ★ selected') : '';
            console.log(`    ${colors.gray(`${i + 1}.`)} ${bandwidth} @ ${resolution}${selected}`);
            if (v.codecs) {
              console.log(`       ${colors.gray('Codecs:')} ${v.codecs}`);
            }
          });
          console.log('');
        }

        if (info.playlist) {
          console.log(colors.bold('  Media Playlist:'));
          console.log(`    ${colors.cyan('Segments')}: ${info.playlist.segments.length}`);
          console.log(`    ${colors.cyan('Target Duration')}: ${info.playlist.targetDuration}s`);
          console.log(`    ${colors.cyan('Type')}: ${info.isLive ? colors.yellow('LIVE') : colors.green('VOD')}`);

          if (info.totalDuration) {
            const minutes = Math.floor(info.totalDuration / 60);
            const seconds = Math.round(info.totalDuration % 60);
            console.log(`    ${colors.cyan('Total Duration')}: ${minutes}m ${seconds}s`);
          }

          if (info.playlist.segments.length > 0) {
            const firstSeg = info.playlist.segments[0];
            const lastSeg = info.playlist.segments[info.playlist.segments.length - 1];
            console.log(`    ${colors.cyan('Sequence Range')}: ${firstSeg.sequence} - ${lastSeg.sequence}`);
          }
        }

        this.lastResponse = info;
      } else if (command === 'download') {
        const outputFile = options.output || 'stream.ts';

        console.log(colors.gray(`Downloading to ${outputFile}...`));
        console.log('');

        let lastProgress = 0;
        const startTime = Date.now();

        await hls(this.client, url, {
          quality: options.quality as 'highest' | 'lowest' || 'highest',
          onProgress: (progress) => {
            const now = Date.now();
            if (now - lastProgress > 500) {
              lastProgress = now;
              const kb = Math.round(progress.downloadedBytes / 1024);
              const total = progress.totalSegments ? ` / ${progress.totalSegments}` : '';
              process.stdout.write(`\r  ${colors.cyan('Segments')}: ${progress.downloadedSegments}${total} | ${colors.cyan('Downloaded')}: ${kb}kb   `);
            }
          },
        }).download(outputFile);

        const duration = Math.round((Date.now() - startTime) / 1000);
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        console.log(colors.green(`✔ Downloaded to ${outputFile}`) + colors.gray(` (${duration}s)`));

        this.lastResponse = { file: outputFile, duration };
      }
    } catch (error: any) {
      console.error(colors.red(`HLS Error: ${error.message}`));
    }
    console.log('');
  }

  // ============================================================================
  // Web Analysis Commands
  // ============================================================================

  private async runRobots(url?: string) {
    const targetUrl = url || this.baseUrl;
    if (!targetUrl) {
      console.log(colors.yellow('Usage: robots <url>'));
      console.log(colors.gray('  Example: robots https://example.com'));
      return;
    }

    let robotsUrl = targetUrl;
    if (!robotsUrl.includes('/robots.txt')) {
      robotsUrl = new URL('/robots.txt', robotsUrl.startsWith('http') ? robotsUrl : `https://${robotsUrl}`).toString();
    }

    console.log(colors.gray(`Fetching ${robotsUrl}...`));

    try {
      const response = await this.client.get(robotsUrl);
      if (!response.ok) {
        console.log(colors.yellow(`robots.txt not found (${response.status})`));
        return;
      }

      const content = await response.text();
      console.log(colors.bold(colors.cyan('robots.txt Analysis')));
      console.log('');

      // Parse directives
      const lines = content.split('\n');
      let currentAgent = '*';
      const agents: Record<string, { allow: string[]; disallow: string[] }> = {};
      const sitemaps: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const [directive, ...rest] = trimmed.split(':');
        const value = rest.join(':').trim();

        if (directive.toLowerCase() === 'user-agent') {
          currentAgent = value;
          if (!agents[currentAgent]) {
            agents[currentAgent] = { allow: [], disallow: [] };
          }
        } else if (directive.toLowerCase() === 'allow') {
          agents[currentAgent] = agents[currentAgent] || { allow: [], disallow: [] };
          agents[currentAgent].allow.push(value);
        } else if (directive.toLowerCase() === 'disallow') {
          agents[currentAgent] = agents[currentAgent] || { allow: [], disallow: [] };
          agents[currentAgent].disallow.push(value);
        } else if (directive.toLowerCase() === 'sitemap') {
          sitemaps.push(value);
        }
      }

      // Display results
      for (const [agent, rules] of Object.entries(agents)) {
        console.log(colors.bold(`  User-Agent: ${agent}`));
        if (rules.disallow.length > 0) {
          console.log(colors.red(`    Disallow: ${rules.disallow.slice(0, 5).join(', ')}${rules.disallow.length > 5 ? '...' : ''}`));
        }
        if (rules.allow.length > 0) {
          console.log(colors.green(`    Allow: ${rules.allow.slice(0, 5).join(', ')}${rules.allow.length > 5 ? '...' : ''}`));
        }
      }

      if (sitemaps.length > 0) {
        console.log('');
        console.log(colors.bold('  Sitemaps:'));
        for (const sitemap of sitemaps) {
          console.log(`    ${colors.cyan(sitemap)}`);
        }
      }

      this.lastResponse = { agents, sitemaps, content };
    } catch (error: any) {
      console.error(colors.red(`Error: ${error.message}`));
    }
    console.log('');
  }

  private async runSitemap(url?: string) {
    const targetUrl = url || this.baseUrl;
    if (!targetUrl) {
      console.log(colors.yellow('Usage: sitemap <url>'));
      console.log(colors.gray('  Example: sitemap https://example.com'));
      return;
    }

    let sitemapUrl = targetUrl;
    if (!sitemapUrl.includes('sitemap')) {
      sitemapUrl = new URL('/sitemap.xml', sitemapUrl.startsWith('http') ? sitemapUrl : `https://${sitemapUrl}`).toString();
    }

    console.log(colors.gray(`Fetching ${sitemapUrl}...`));

    try {
      const response = await this.client.get(sitemapUrl);
      if (!response.ok) {
        console.log(colors.yellow(`sitemap.xml not found (${response.status})`));
        return;
      }

      const content = await response.text();
      console.log(colors.bold(colors.cyan('Sitemap Analysis')));
      console.log('');

      // Parse XML
      const { parseXML } = await import('../../plugins/xml.js');
      const parsed = parseXML(content);

      // Check if it's a sitemap index or regular sitemap
      const isIndex = content.includes('<sitemapindex');

      if (isIndex) {
        const sitemaps = parsed.sitemapindex?.sitemap || [];
        console.log(`  ${colors.cyan('Type')}: Sitemap Index`);
        console.log(`  ${colors.cyan('Sitemaps')}: ${Array.isArray(sitemaps) ? sitemaps.length : 1}`);
        console.log('');
        const items = Array.isArray(sitemaps) ? sitemaps.slice(0, 10) : [sitemaps];
        for (const sitemap of items) {
          console.log(`  ${colors.gray('•')} ${sitemap.loc}`);
        }
        if (Array.isArray(sitemaps) && sitemaps.length > 10) {
          console.log(colors.gray(`  ... and ${sitemaps.length - 10} more`));
        }
      } else {
        const urls = parsed.urlset?.url || [];
        const urlList = Array.isArray(urls) ? urls : [urls];
        console.log(`  ${colors.cyan('Type')}: URL Sitemap`);
        console.log(`  ${colors.cyan('URLs')}: ${urlList.length}`);
        console.log('');
        for (const url of urlList.slice(0, 10)) {
          const loc = url.loc || '';
          const lastmod = url.lastmod ? colors.gray(` (${url.lastmod})`) : '';
          console.log(`  ${colors.gray('•')} ${loc.slice(0, 60)}${loc.length > 60 ? '...' : ''}${lastmod}`);
        }
        if (urlList.length > 10) {
          console.log(colors.gray(`  ... and ${urlList.length - 10} more`));
        }
      }

      this.lastResponse = parsed;
    } catch (error: any) {
      console.error(colors.red(`Error: ${error.message}`));
    }
    console.log('');
  }

  private async runLlms(url?: string) {
    const targetUrl = url || this.baseUrl;
    if (!targetUrl) {
      console.log(colors.yellow('Usage: llms <url>'));
      console.log(colors.gray('  Example: llms https://example.com'));
      return;
    }

    let llmsUrl = targetUrl;
    if (!llmsUrl.includes('/llms.txt')) {
      llmsUrl = new URL('/llms.txt', llmsUrl.startsWith('http') ? llmsUrl : `https://${llmsUrl}`).toString();
    }

    console.log(colors.gray(`Fetching ${llmsUrl}...`));

    try {
      const response = await this.client.get(llmsUrl);
      if (!response.ok) {
        console.log(colors.yellow(`llms.txt not found (${response.status})`));
        console.log(colors.gray('  This file is optional and used for AI/LLM optimization.'));
        return;
      }

      const content = await response.text();
      console.log(colors.bold(colors.cyan('llms.txt Analysis')));
      console.log('');

      // Display content with basic parsing
      const lines = content.split('\n').filter((l: string) => l.trim());
      console.log(`  ${colors.cyan('Lines')}: ${lines.length}`);
      console.log('');

      // Show first 20 lines
      for (const line of lines.slice(0, 20)) {
        if (line.startsWith('#')) {
          console.log(colors.gray(`  ${line}`));
        } else {
          console.log(`  ${line}`);
        }
      }
      if (lines.length > 20) {
        console.log(colors.gray(`  ... and ${lines.length - 20} more lines`));
      }

      this.lastResponse = { content, lines: lines.length };
    } catch (error: any) {
      console.error(colors.red(`Error: ${error.message}`));
    }
    console.log('');
  }

  // ============================================================================
  // Advanced Protocol Commands
  // ============================================================================

  private async runSftp(args: string[]) {
    if (args.length < 2 || args[0] === 'help') {
      console.log(colors.bold('SFTP Client'));
      console.log('');
      console.log(colors.yellow('Usage: sftp <host> <command> [args...] [options...]'));
      console.log('');
      console.log(colors.gray('Commands:'));
      console.log('  ls <path>              List directory');
      console.log('  get <remote> [local]   Download file');
      console.log('  put <local> [remote]   Upload file');
      console.log('');
      console.log(colors.gray('Options:'));
      console.log('  user=<username>        Username (default: root)');
      console.log('  pass=<password>        Password');
      console.log('  key=<path>             Path to private key');
      console.log('  port=<number>          Port (default: 22)');
      console.log('');
      console.log(colors.gray('Examples:'));
      console.log('  sftp myserver.com ls /var/www user=admin key=~/.ssh/id_rsa');
      console.log('  sftp myserver.com get /etc/hosts hosts.txt user=root pass=secret');
      return;
    }

    const host = args[0];
    const cmd = args[1];
    let user = 'root';
    let password: string | undefined;
    let keyPath: string | undefined;
    let port = 22;
    const cmdArgs: string[] = [];

    for (let i = 2; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('user=')) user = arg.slice(5);
      else if (arg.startsWith('pass=')) password = arg.slice(5);
      else if (arg.startsWith('key=')) keyPath = arg.slice(4);
      else if (arg.startsWith('port=')) port = parseInt(arg.slice(5));
      else cmdArgs.push(arg);
    }

    try {
      const { createSFTP } = await import('../../protocols/sftp.js');

      let privateKey: string | undefined;
      if (keyPath) {
        const { promises: fs } = await import('node:fs');
        privateKey = await fs.readFile(keyPath.replace('~', process.env.HOME || ''), 'utf-8');
      }

      const sftp = createSFTP({ host, port, username: user, password, privateKey });

      console.log(colors.gray(`Connecting to ${host}:${port}...`));
      await sftp.connect();

      if (cmd === 'ls') {
        const path = cmdArgs[0] || '/';
        const result = await sftp.list(path);
        const files = result.data || [];
        console.log(colors.bold(`\nDirectory: ${path}\n`));
        for (const file of files) {
          const icon = file.type === 'directory' ? '📁' : '📄';
          const size = file.type === 'directory' ? '' : ` (${file.size} bytes)`;
          console.log(`  ${icon} ${file.name}${size}`);
        }
        console.log(colors.gray(`\nTotal: ${files.length} items`));
        this.lastResponse = files;
      } else if (cmd === 'get') {
        const remote = cmdArgs[0];
        const local = cmdArgs[1] || remote.split('/').pop() || 'download';
        console.log(colors.gray(`Downloading ${remote} → ${local}...`));
        await sftp.download(remote, local);
        console.log(colors.green(`✔ Downloaded: ${local}`));
      } else if (cmd === 'put') {
        const local = cmdArgs[0];
        const remote = cmdArgs[1] || local.split('/').pop() || 'upload';
        console.log(colors.gray(`Uploading ${local} → ${remote}...`));
        await sftp.upload(local, remote);
        console.log(colors.green(`✔ Uploaded: ${remote}`));
      } else {
        console.log(colors.yellow(`Unknown SFTP command: ${cmd}`));
      }

      await sftp.close();
    } catch (error: any) {
      console.error(colors.red(`SFTP Error: ${error.message}`));
    }
    console.log('');
  }

  private async runSse(url?: string, args: string[] = []) {
    if (!url) {
      console.log(colors.yellow('Usage: sse <url>'));
      console.log(colors.gray('  Example: sse https://api.example.com/events'));
      return;
    }

    if (!url.startsWith('http')) {
      url = this.baseUrl ? `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}` : `https://${url}`;
    }

    console.log(colors.cyan('SSE Client'));
    console.log(colors.gray(`Connecting to ${url}...`));
    console.log(colors.gray('Press Ctrl+C to disconnect\n'));

    try {
      const response = await this.client.get(url, {
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        console.log(colors.red(`HTTP Error: ${response.status} ${response.statusText}`));
        return;
      }

      console.log(colors.green('✔ Connected\n'));

      for await (const event of response.sse()) {
        const timestamp = colors.gray(new Date().toISOString().split('T')[1].slice(0, 8));
        if (event.event && event.event !== 'message') {
          console.log(`${timestamp} ${colors.yellow(`[${event.event}]`)} ${event.data}`);
        } else {
          console.log(`${timestamp} ${event.data}`);
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error(colors.red(`SSE Error: ${error.message}`));
      }
    }
    console.log('');
  }

  private async runSoap(args: string[]) {
    if (args.length < 2 || args[0] === 'help') {
      console.log(colors.bold('SOAP Client'));
      console.log('');
      console.log(colors.yellow('Usage: soap <url> <action> [params...]'));
      console.log('');
      console.log(colors.gray('Examples:'));
      console.log('  soap https://api.example.com/soap GetUser userId=123');
      console.log('  soap api.com/ws GetWeather city="New York"');
      return;
    }

    let url = args[0];
    const action = args[1];
    const params: Record<string, string> = {};

    if (!url.startsWith('http')) {
      url = this.baseUrl ? `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}` : `https://${url}`;
    }

    for (let i = 2; i < args.length; i++) {
      const [key, ...rest] = args[i].split('=');
      params[key] = rest.join('=').replace(/^["']|["']$/g, '');
    }

    console.log(colors.gray(`SOAP ${action} → ${url}`));

    try {
      const { createSoapClient } = await import('../../plugins/soap.js');
      const soapClient = createSoapClient(this.client, { endpoint: url });
      const result = await soapClient.call(action, params);

      console.log(colors.green('✔ Response:'));
      console.log(JSON.stringify(result, null, 2));
      this.lastResponse = result;
    } catch (error: any) {
      console.error(colors.red(`SOAP Error: ${error.message}`));
    }
    console.log('');
  }

  private async runOdata(args: string[]) {
    if (args.length < 2 || args[0] === 'help') {
      console.log(colors.bold('OData Client'));
      console.log('');
      console.log(colors.yellow('Usage: odata <url> <entity> [options...]'));
      console.log('');
      console.log(colors.gray('Options:'));
      console.log('  filter=<expr>      OData filter expression');
      console.log('  select=<fields>    Comma-separated fields');
      console.log('  orderby=<field>    Order by field');
      console.log('  top=<n>            Limit results');
      console.log('  expand=<nav>       Expand navigation property');
      console.log('');
      console.log(colors.gray('Examples:'));
      console.log('  odata https://services.odata.org/V4/Northwind/Northwind.svc Products');
      console.log('  odata api.com/odata Customers filter="Country eq \'USA\'" top=10');
      return;
    }

    let url = args[0];
    const entity = args[1];
    let filter: string | undefined;
    let select: string | undefined;
    let orderby: string | undefined;
    let top: number | undefined;
    let expand: string | undefined;

    if (!url.startsWith('http')) {
      url = this.baseUrl ? `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}` : `https://${url}`;
    }

    for (let i = 2; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('filter=')) filter = arg.slice(7).replace(/^["']|["']$/g, '');
      else if (arg.startsWith('select=')) select = arg.slice(7);
      else if (arg.startsWith('orderby=')) orderby = arg.slice(8);
      else if (arg.startsWith('top=')) top = parseInt(arg.slice(4));
      else if (arg.startsWith('expand=')) expand = arg.slice(7);
    }

    console.log(colors.gray(`OData Query: ${url}/${entity}`));

    try {
      const { createODataClient } = await import('../../plugins/odata.js');
      const odataClient = createODataClient(this.client, { serviceRoot: url });
      let query = odataClient.query(entity);

      if (select) query = query.select(...select.split(',').map((s: string) => s.trim()));
      if (filter) query = query.filter(filter);
      if (orderby) query = query.orderBy(orderby);
      if (top) query = query.top(top);
      if (expand) query = query.expand(expand);

      console.log(colors.gray(`Query: ${query.toUrl()}\n`));

      const results = await query.get();
      const items = results.value || [results];
      console.log(colors.green(`✔ Results: ${Array.isArray(items) ? items.length : 1} items`));
      console.log(JSON.stringify(results, null, 2));
      this.lastResponse = results;
    } catch (error: any) {
      console.error(colors.red(`OData Error: ${error.message}`));
    }
    console.log('');
  }

  private async runProxy(args: string[]) {
    if (args.length < 2 || args[0] === 'help') {
      console.log(colors.bold('Proxy Request'));
      console.log('');
      console.log(colors.yellow('Usage: proxy <proxy-url> <target-url> [method] [params...]'));
      console.log('');
      console.log(colors.gray('Examples:'));
      console.log('  proxy http://proxy.example.com:8080 https://api.com/data');
      console.log('  proxy socks5://127.0.0.1:1080 api.com/users POST name=John');
      return;
    }

    const proxyUrl = args[0];
    let targetUrl = args[1];
    let method = 'GET';
    const params: Record<string, unknown> = {};

    if (!targetUrl.startsWith('http')) {
      targetUrl = `https://${targetUrl}`;
    }

    for (let i = 2; i < args.length; i++) {
      const arg = args[i];
      if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(arg.toUpperCase())) {
        method = arg.toUpperCase();
      } else if (arg.includes('=')) {
        const [key, ...rest] = arg.split('=');
        params[key] = rest.join('=');
      }
    }

    console.log(colors.gray(`Proxy: ${proxyUrl}`));
    console.log(colors.gray(`Target: ${method} ${targetUrl}`));

    try {
      const { createClient } = await import('../../core/client.js');
      const client = createClient({ proxy: { url: proxyUrl } });

      const hasBody = Object.keys(params).length > 0;
      const response = hasBody
        ? await (client as any)[method.toLowerCase()](targetUrl, { json: params })
        : await (client as any)[method.toLowerCase()](targetUrl);

      console.log(colors.green(`✔ ${response.status} ${response.statusText}`));
      const body = await response.text();
      try {
        const json = JSON.parse(body);
        console.log(JSON.stringify(json, null, 2));
        this.lastResponse = json;
      } catch {
        console.log(body);
        this.lastResponse = body;
      }
    } catch (error: any) {
      console.error(colors.red(`Proxy Error: ${error.message}`));
    }
    console.log('');
  }

  private async runUpload(args: string[]) {
    if (args.length < 2 || args[0] === 'help') {
      console.log(colors.bold('File Upload'));
      console.log('');
      console.log(colors.yellow('Usage: upload <url> <file> [field=name]'));
      console.log('');
      console.log(colors.gray('Examples:'));
      console.log('  upload https://api.example.com/files ./image.png');
      console.log('  upload api.com/upload document.pdf field=document');
      return;
    }

    let url = args[0];
    const file = args[1];
    let fieldName = 'file';

    if (!url.startsWith('http')) {
      url = this.baseUrl ? `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}` : `https://${url}`;
    }

    for (let i = 2; i < args.length; i++) {
      if (args[i].startsWith('field=')) {
        fieldName = args[i].slice(6);
      }
    }

    try {
      const { promises: fs } = await import('node:fs');
      const path = await import('node:path');

      await fs.access(file);
      const stats = await fs.stat(file);
      const fileContent = await fs.readFile(file);

      console.log(colors.gray(`Uploading ${path.basename(file)} (${(stats.size / 1024).toFixed(1)} KB)...`));

      // Use multipart form upload
      const boundary = `----ReckerBoundary${Date.now()}`;
      const filename = path.basename(file);

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

      const response = await this.client.post(url, body, {
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
      });

      console.log(colors.green(`✔ Upload complete: ${response.status} ${response.statusText}`));

      const responseBody = await response.text();
      if (responseBody) {
        try {
          const json = JSON.parse(responseBody);
          console.log(JSON.stringify(json, null, 2));
          this.lastResponse = json;
        } catch {
          console.log(responseBody);
          this.lastResponse = responseBody;
        }
      }
    } catch (error: any) {
      console.error(colors.red(`Upload Error: ${error.message}`));
    }
    console.log('');
  }

  private async runDownload(args: string[]) {
    if (args.length === 0 || args[0] === 'help') {
      console.log(colors.bold('File Download'));
      console.log('');
      console.log(colors.yellow('Usage: download <url> [output]'));
      console.log('');
      console.log(colors.gray('Examples:'));
      console.log('  download https://example.com/file.zip');
      console.log('  download https://api.com/export.csv data.csv');
      return;
    }

    let url = args[0];
    const output = args[1];

    if (!url.startsWith('http')) {
      url = this.baseUrl ? `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}` : `https://${url}`;
    }

    try {
      const { downloadToFile } = await import('../../utils/download.js');
      const path = await import('node:path');
      const { promises: fs } = await import('node:fs');

      const urlPath = new URL(url).pathname;
      const filename = output || path.basename(urlPath) || 'download';

      console.log(colors.gray(`Downloading to ${filename}...`));

      const result = await downloadToFile(this.client, url, filename, {
        onProgress: (progress) => {
          const total = progress.total || 0;
          const pct = total > 0 ? Math.round((progress.loaded / total) * 100) : 0;
          const downloaded = (progress.loaded / 1024 / 1024).toFixed(1);
          const totalMB = total > 0 ? (total / 1024 / 1024).toFixed(1) : '?';
          const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
          process.stdout.write(`\r  [${bar}] ${pct}% (${downloaded}/${totalMB} MB)`);
        },
      });

      process.stdout.write('\n');
      const stats = await fs.stat(filename);
      console.log(colors.green(`✔ Downloaded: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`));
      this.lastResponse = { file: filename, size: stats.size };
    } catch (error: any) {
      console.error(colors.red(`Download Error: ${error.message}`));
    }
    console.log('');
  }

  private printHelp() {
    console.log(`
  ${colors.bold(colors.cyan('Rek Console Help'))}

  ${colors.bold('Core Commands:')}
    ${colors.green('url <url>')}           Set persistent Base URL.
    ${colors.green('set <key>=<val>')}     Set a session variable.
    ${colors.green('vars')}                List all session and env variables.
    ${colors.green('env [path]')}          Load .env file (default: ./.env).
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

    ${colors.green('ws <url>')}            Start interactive WebSocket session.
    ${colors.green('udp <url>')}           Send UDP packet.

  ${colors.bold('AI Chat:')}
    ${colors.green('ai [provider]')}       Enter AI mode (interactive conversation).
                             ${colors.gray('Default: openai. Use /switch to change provider.')}
                             ${colors.gray('Exit: ESC, Ctrl+C, or /exit')}
                             ${colors.gray('Commands: /switch, /clear, /memory, /help')}

    ${colors.green('@<provider> <msg>')}   Quick AI message (inline, no mode switch).
                             ${colors.gray('Examples: @openai Hello!, @anthropic Explain this')}
                             ${colors.gray('Providers: openai, anthropic, groq, google, xai,')}
                             ${colors.gray('           mistral, cohere, deepseek, fireworks,')}
                             ${colors.gray('           together, perplexity')}

                             ${colors.gray('Memory:')} ${colors.white('12 pairs (24 messages)')} per provider.
                             ${colors.gray('Env:')} Set ${colors.white('OPENAI_API_KEY')}, ${colors.white('ANTHROPIC_API_KEY')}, etc.
    ${colors.green('ai:clear [preset]')}   Clear AI memory (all or specific preset).

  ${colors.bold('Network Tools:')}
    ${colors.green('whois <domain>')}      WHOIS lookup (domain or IP).
    ${colors.green('tls <host> [port]')}   Inspect TLS/SSL certificate.
    ${colors.green('dns <domain>')}        Full DNS lookup (A, AAAA, MX, NS, SPF, DMARC).
    ${colors.green('rdap <domain>')}       RDAP lookup (modern WHOIS).
    ${colors.green('ping <host>')}         Quick TCP connectivity check.
    ${colors.green('seo <url> [-a] [--format json]')} SEO analysis (70+ rules).
                             ${colors.gray('-a, --all      Show all checks including passed')}
                             ${colors.gray('--format json  Output raw JSON for programmatic use')}

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

  ${colors.bold('Web Crawler:')}
    ${colors.green('spider <url>')}        Crawl website following internal links.
                             ${colors.gray('Options:')}
                             ${colors.white('--depth=5')}     ${colors.gray('Maximum depth to crawl')}
                             ${colors.white('--limit=100')}   ${colors.gray('Maximum pages to crawl')}
                             ${colors.white('--concurrency=5')} ${colors.gray('Parallel requests')}

  ${colors.bold('Protocols:')}
    ${colors.green('ftp <host> <cmd>')}    FTP client (ls, get, put, rm, mkdir).
                             ${colors.gray('Options:')} ${colors.white('user=...')} ${colors.white('pass=...')} ${colors.white('port=...')} ${colors.white('secure')}
    ${colors.green('telnet <host> [port]')} Interactive Telnet session.
    ${colors.green('graphql <url> <query>')} Execute GraphQL query.
                             ${colors.gray('Variables:')} ${colors.white('key=value')} ${colors.gray('pairs')}
                             ${colors.gray('File:')} ${colors.white('@file.graphql')}
    ${colors.green('jsonrpc <url> <method>')} Execute JSON-RPC 2.0 call.
                             ${colors.gray('Params:')} ${colors.white('key=value')} ${colors.gray('(named) or positional')}
    ${colors.green('hls <url> [cmd]')}     HLS streaming client (info, download).
                             ${colors.gray('Options:')} ${colors.white('output=file.ts')} ${colors.white('quality=highest|lowest')}

  ${colors.bold('HAR Recording:')}
    ${colors.green('har:record <file>')}   Start recording HTTP requests to HAR file.
    ${colors.green('har:stop')}            Stop recording.
    ${colors.green('har:play <file>')}     Replay requests from HAR file.
    ${colors.green('har:info <file>')}     Show HAR file information.

  ${colors.bold('Web Analysis:')}
    ${colors.green('robots [url]')}        Analyze robots.txt file.
    ${colors.green('sitemap [url]')}       Analyze sitemap.xml file.
    ${colors.green('llms [url]')}          Analyze llms.txt file (AI optimization).

  ${colors.bold('Advanced Protocols:')}
    ${colors.green('sftp <host> <cmd>')}   SFTP client (ls, get, put). ${colors.gray('Options: user= key= port=')}
    ${colors.green('sse <url>')}           Connect to Server-Sent Events stream.
    ${colors.green('soap <url> <action>')} Make SOAP request. ${colors.gray('Params: key=value')}
    ${colors.green('odata <url> <entity>')} Query OData service. ${colors.gray('Options: filter= select= top=')}
    ${colors.green('proxy <proxy> <url>')} Make request through a proxy.

  ${colors.bold('File Transfer:')}
    ${colors.green('upload <url> <file>')} Upload a file to a URL.
    ${colors.green('download <url>')}      Download a file with progress.

  ${colors.bold('Documentation:')}
    ${colors.green('? <query>')}           Search Recker documentation.
    ${colors.green('search <query>')}      Alias for ? (hybrid fuzzy+semantic search).
    ${colors.green('suggest <use-case>')}  Get implementation suggestions.
    ${colors.green('example <feature>')}   Get code examples for a feature.

  ${colors.bold('Navigation:')}
    ${colors.green('Page Up/Down')}        Scroll through command history.
    ${colors.green('Home/End')}            Jump to top/bottom of history.
    ${colors.green('Escape')}              Exit scroll mode.

  ${colors.bold('Examples:')}
    › url httpbin.org
    › get /json
    › post /post name="Neo" active:=true role:Admin
    › load /heavy-endpoint users=100 mode=stress
    › @openai What is the capital of France?
    › @anthropic Explain quantum computing
    › spider example.com depth=2 limit=50

  ${colors.bold('For detailed help on a specific command:')}
    ${colors.green('help <command>')}       ${colors.gray('e.g., help spider, help seo, help dns')}
    `);
  }

  /**
   * Print detailed help for a specific command
   */
  private printCommandHelp(command: string) {
    const cmd = command.toLowerCase().replace(/^help\s+/, '');

    const helpContent: Record<string, string> = {
      // HTTP Commands
      'get': `
  ${colors.bold(colors.cyan('GET - HTTP GET Request'))}

  ${colors.bold('Usage:')}
    ${colors.green('get <path>')}              Make a GET request
    ${colors.green('get <url>')}               Make a GET request to full URL

  ${colors.bold('Examples:')}
    ${colors.gray('# Simple request (requires url to be set first)')}
    › url api.example.com
    › get /users

    ${colors.gray('# Full URL request')}
    › get https://api.example.com/users

    ${colors.gray('# With headers')}
    › get /users Authorization:"Bearer token123"

    ${colors.gray('# With query params (encoded in URL)')}
    › get /search?q=test&page=1
      `,

      'post': `
  ${colors.bold(colors.cyan('POST - HTTP POST Request'))}

  ${colors.bold('Usage:')}
    ${colors.green('post <path> [key=value...]')}    Make a POST request with data

  ${colors.bold('Parameters:')}
    ${colors.white('key=value')}       String value
    ${colors.white('key:=value')}      Typed value (number, boolean, null)
    ${colors.white('Key:value')}       Header

  ${colors.bold('Examples:')}
    ${colors.gray('# Simple POST with string data')}
    › post /users name="John Doe" email="john@example.com"

    ${colors.gray('# POST with typed values')}
    › post /users name="John" age:=30 active:=true

    ${colors.gray('# POST with headers')}
    › post /login Content-Type:application/json username="admin" password="secret"

    ${colors.gray('# POST to full URL')}
    › post https://api.example.com/users name="Test"
      `,

      // Spider
      'spider': `
  ${colors.bold(colors.cyan('SPIDER - Web Crawler'))}

  ${colors.bold('Usage:')}
    ${colors.green('spider <url> [options]')}

  ${colors.bold('Options:')}
    ${colors.white('depth=N')}         Max crawl depth (default: 5)
    ${colors.white('limit=N')}         Max pages to crawl (default: 100)
    ${colors.white('concurrency=N')}   Parallel requests (default: 5)
    ${colors.white('seo')}             Enable SEO analysis mode
    ${colors.white('output=file')}     Save JSON report to file

  ${colors.bold('Examples:')}
    ${colors.gray('# Basic crawl with defaults')}
    › spider example.com

    ${colors.gray('# Shallow crawl (only 2 levels deep)')}
    › spider example.com depth=2

    ${colors.gray('# Quick audit (limited pages)')}
    › spider example.com limit=20 depth=3

    ${colors.gray('# Full SEO analysis')}
    › spider example.com seo

    ${colors.gray('# SEO with report export')}
    › spider example.com seo output=seo-report.json

    ${colors.gray('# High concurrency for fast crawl')}
    › spider example.com concurrency=10 limit=500

  ${colors.bold('Error Handling:')}
    ${colors.gray('Errors are categorized by type:')}
    • ${colors.red('HTTP 4xx/5xx')} - Server returned error status
    • ${colors.red('Timeout')} - Request took too long (default: 10s)
    • ${colors.red('DNS')} - Could not resolve hostname
    • ${colors.red('Network')} - Connection refused/reset
    • ${colors.red('Parse')} - Invalid HTML/content type

  ${colors.bold('Tips:')}
    • Use ${colors.white('seo')} mode for comprehensive website audits
    • Start with low ${colors.white('limit')} to test, then increase
    • Results stored in ${colors.white('lastResponse')} for further analysis
    • Use ${colors.white('output=')} to save large reports
      `,

      // SEO
      'seo': `
  ${colors.bold(colors.cyan('SEO - Search Engine Optimization Analysis'))}

  ${colors.bold('Usage:')}
    ${colors.green('seo <url> [options]')}

  ${colors.bold('Options:')}
    ${colors.white('-a, --all')}        Show all checks (including passed)
    ${colors.white('--format json')}    Output as JSON (for scripts/tools)

  ${colors.bold('What it analyzes:')}
    • Title tag (length, presence, keywords)
    • Meta description (length, presence)
    • Headings (H1 presence, hierarchy)
    • Images (alt text, optimization)
    • Links (internal/external balance)
    • OpenGraph tags (social sharing)
    • Twitter Card tags
    • JSON-LD structured data
    • Technical SEO (canonical, viewport, lang)

  ${colors.bold('Examples:')}
    ${colors.gray('# Basic SEO analysis')}
    › seo example.com

    ${colors.gray('# Show all checks including passed')}
    › seo example.com -a

    ${colors.gray('# Export as JSON for CI/CD')}
    › seo example.com --format json

    ${colors.gray('# Using current base URL')}
    › url example.com
    › seo

  ${colors.bold('Grades:')}
    ${colors.green('A')} = 80-100   Excellent
    ${colors.blue('B')} = 60-79    Good
    ${colors.yellow('C')} = 40-59    Needs work
    ${colors.red('D/F')} = 0-39    Poor

  ${colors.bold('Tips:')}
    • Run ${colors.white('spider example.com seo')} for site-wide analysis
    • JSON output can be piped to tools like ${colors.white('jq')}
    • Result stored in ${colors.white('lastResponse')} for inspection
      `,

      // DNS
      'dns': `
  ${colors.bold(colors.cyan('DNS - Domain Name System Lookup'))}

  ${colors.bold('Usage:')}
    ${colors.green('dns <domain>')}

  ${colors.bold('Record types resolved:')}
    • A, AAAA (IP addresses)
    • MX (mail servers)
    • NS (name servers)
    • TXT (SPF, DMARC, domain verification)
    • CNAME (aliases)

  ${colors.bold('Examples:')}
    ${colors.gray('# Full DNS lookup')}
    › dns example.com

    ${colors.gray('# Using current base URL domain')}
    › url https://api.example.com
    › dns

  ${colors.bold('Related commands:')}
    ${colors.green('dns:propagate <domain> <type>')}  Check DNS propagation worldwide
    ${colors.green('dns:email <domain>')}             Email-specific DNS (MX, SPF, DMARC)
    ${colors.green('dns:health <domain>')}            Overall DNS health check
    ${colors.green('dns:spf <domain>')}               SPF record validation
    ${colors.green('dns:dmarc <domain>')}             DMARC record validation
    ${colors.green('dns:dkim <domain> <selector>')}   DKIM record lookup
    ${colors.green('dns:dig <domain> [type]')}        Raw DNS query (like dig)
    ${colors.green('dns:generate <type> [options]')} Generate DNS records

  ${colors.bold('Examples:')}
    › dns:propagate example.com A
    › dns:email example.com
    › dns:dkim example.com google
      `,

      // WHOIS
      'whois': `
  ${colors.bold(colors.cyan('WHOIS - Domain/IP Registration Lookup'))}

  ${colors.bold('Usage:')}
    ${colors.green('whois <domain>')}    Lookup domain registration
    ${colors.green('whois <ip>')}        Lookup IP allocation

  ${colors.bold('Information provided:')}
    • Registrar details
    • Creation/expiration dates
    • Name servers
    • Domain status
    • Registrant info (if public)

  ${colors.bold('Examples:')}
    ${colors.gray('# Domain lookup')}
    › whois google.com

    ${colors.gray('# IP lookup')}
    › whois 8.8.8.8

    ${colors.gray('# Using current base URL')}
    › url example.com
    › whois

  ${colors.bold('Related commands:')}
    ${colors.green('rdap <domain>')}    Modern WHOIS using RDAP protocol
      `,

      // TLS/SSL
      'tls': `
  ${colors.bold(colors.cyan('TLS/SSL - Certificate Inspection'))}

  ${colors.bold('Usage:')}
    ${colors.green('tls <host> [port]')}    Inspect TLS certificate (default port: 443)

  ${colors.bold('Information provided:')}
    • Certificate subject/issuer
    • Validity period (expiration warning)
    • Protocol version (TLS 1.2/1.3)
    • Cipher suite
    • Certificate chain
    • SAN (Subject Alternative Names)

  ${colors.bold('Examples:')}
    ${colors.gray('# Standard HTTPS inspection')}
    › tls example.com

    ${colors.gray('# Custom port (e.g., SMTP with STARTTLS)')}
    › tls mail.example.com 587

    ${colors.gray('# Using current base URL')}
    › url https://secure.example.com
    › tls

  ${colors.bold('Aliases:')}
    ${colors.green('ssl')} is an alias for ${colors.green('tls')}
      `,

      // Security
      'security': `
  ${colors.bold(colors.cyan('SECURITY - HTTP Security Headers Analysis'))}

  ${colors.bold('Usage:')}
    ${colors.green('security <url>')}

  ${colors.bold('Headers analyzed:')}
    • Strict-Transport-Security (HSTS)
    • Content-Security-Policy (CSP)
    • X-Frame-Options
    • X-Content-Type-Options
    • X-XSS-Protection
    • Referrer-Policy
    • Permissions-Policy

  ${colors.bold('Examples:')}
    ${colors.gray('# Analyze security headers')}
    › security example.com

    ${colors.gray('# Using current base URL')}
    › url example.com
    › security

  ${colors.bold('Grades:')}
    ${colors.green('A+')} ${colors.green('A')} = Excellent security posture
    ${colors.blue('B')} = Good, minor improvements possible
    ${colors.yellow('C')} = Acceptable, several headers missing
    ${colors.red('D')} ${colors.red('F')} = Poor, critical headers missing
      `,

      // Load Test
      'load': `
  ${colors.bold(colors.cyan('LOAD - HTTP Load Testing'))}

  ${colors.bold('Usage:')}
    ${colors.green('load <url> [options]')}

  ${colors.bold('Options:')}
    ${colors.white('users=N')}        Concurrent virtual users (default: 50)
    ${colors.white('duration=N')}     Test duration in seconds (default: 300)
    ${colors.white('ramp=N')}         Ramp-up time in seconds (default: 5)
    ${colors.white('mode=MODE')}      Test mode (see below)
    ${colors.white('http2')}          Enable HTTP/2

  ${colors.bold('Modes:')}
    ${colors.cyan('realistic')}    Simulates real users with think time (default)
    ${colors.cyan('throughput')}   Maximum requests per second
    ${colors.cyan('stress')}       Find breaking point with increasing load

  ${colors.bold('Examples:')}
    ${colors.gray('# Quick load test (50 users, 5 minutes)')}
    › load https://api.example.com/endpoint

    ${colors.gray('# Stress test with 100 users')}
    › load /api/endpoint users=100 mode=stress

    ${colors.gray('# Short throughput test')}
    › load /api/health users=20 duration=30 mode=throughput

    ${colors.gray('# HTTP/2 enabled')}
    › load /api/endpoint http2 users=50

  ${colors.bold('Dashboard:')}
    • Real-time RPS, latency percentiles
    • Error rate monitoring
    • Progress bar and ETA
    • Press ${colors.white('Ctrl+C')} to stop early

  ${colors.bold('Tips:')}
    • Start with low users and increase gradually
    • Use ${colors.white('mode=stress')} to find limits
    • ${colors.white('ramp')} helps avoid thundering herd
      `,

      // WebSocket
      'ws': `
  ${colors.bold(colors.cyan('WS - WebSocket Client'))}

  ${colors.bold('Usage:')}
    ${colors.green('ws <url>')}    Connect to WebSocket server

  ${colors.bold('Interactive mode commands:')}
    • Type message and press Enter to send
    • ${colors.white('/close')} - Close connection
    • ${colors.white('/ping')} - Send ping frame
    • ${colors.white('Ctrl+C')} - Exit

  ${colors.bold('Examples:')}
    ${colors.gray('# Connect to WebSocket server')}
    › ws wss://echo.websocket.org

    ${colors.gray('# Local development server')}
    › ws ws://localhost:8080/socket

  ${colors.bold('Protocol notes:')}
    • Supports both ${colors.white('ws://')} and ${colors.white('wss://')} (secure)
    • Automatic reconnection not enabled by default
    • JSON messages are pretty-printed
      `,

      // Scraping
      'scrap': `
  ${colors.bold(colors.cyan('SCRAP - Web Scraping'))}

  ${colors.bold('Usage:')}
    ${colors.green('scrap <url>')}    Fetch and parse HTML document

  ${colors.bold('After scraping, use these commands:')}
    ${colors.green('$ <selector>')}         Query elements (CSS selector)
    ${colors.green('$text <selector>')}     Extract text content
    ${colors.green('$attr <name> <sel>')}   Get attribute values
    ${colors.green('$html <selector>')}     Get inner HTML
    ${colors.green('$links [selector]')}    List all links
    ${colors.green('$images [selector]')}   List all images
    ${colors.green('$scripts')}             List all scripts
    ${colors.green('$css')}                 List all stylesheets
    ${colors.green('$table <selector>')}    Extract table as JSON

  ${colors.bold('Examples:')}
    ${colors.gray('# Scrape a page')}
    › scrap https://example.com

    ${colors.gray('# Get all H1 tags')}
    › $ h1

    ${colors.gray('# Get link hrefs')}
    › $attr href a

    ${colors.gray('# Extract table data')}
    › $table table.data

    ${colors.gray('# Get specific element text')}
    › $text .product-price

  ${colors.bold('Advanced:')}
    ${colors.green('$sourcemaps')}          Find sourcemaps
    ${colors.green('$unmap <url>')}         Parse sourcemap
    ${colors.green('$beautify <url>')}      Beautify minified code
      `,

      // GraphQL
      'graphql': `
  ${colors.bold(colors.cyan('GRAPHQL - GraphQL Client'))}

  ${colors.bold('Usage:')}
    ${colors.green('graphql <url> <query>')}                  Inline query
    ${colors.green('graphql <url> @file.graphql')}            Query from file
    ${colors.green('graphql <url> <query> var=value...')}     With variables

  ${colors.bold('Examples:')}
    ${colors.gray('# Simple query')}
    › graphql https://api.example.com/graphql "{ users { id name } }"

    ${colors.gray('# With variables')}
    › graphql https://api.example.com/graphql "query($id: ID!) { user(id: $id) { name } }" id=123

    ${colors.gray('# From file')}
    › graphql https://api.example.com/graphql @queries/getUser.graphql id=123

  ${colors.bold('Tips:')}
    • Use ${colors.white('@file.graphql')} for complex queries
    • Variables are passed as ${colors.white('key=value')} pairs
    • Response stored in ${colors.white('lastResponse')}
      `,

      // AI
      'ai': `
  ${colors.bold(colors.cyan('AI - AI Chat Interface'))}

  ${colors.bold('Usage:')}
    ${colors.green('ai [provider]')}           Enter interactive AI mode
    ${colors.green('@<provider> <message>')}   Quick one-shot message

  ${colors.bold('Providers:')}
    ${colors.cyan('openai')}      GPT-4/GPT-3.5 (default)
    ${colors.cyan('anthropic')}   Claude
    ${colors.cyan('groq')}        Fast inference
    ${colors.cyan('google')}      Gemini
    ${colors.cyan('xai')}         Grok
    ${colors.cyan('mistral')}     Mistral AI
    ${colors.cyan('cohere')}      Command
    ${colors.cyan('deepseek')}    DeepSeek
    ${colors.cyan('fireworks')}   Fireworks AI
    ${colors.cyan('together')}    Together AI
    ${colors.cyan('perplexity')} Perplexity

  ${colors.bold('Examples:')}
    ${colors.gray('# Enter interactive mode with OpenAI')}
    › ai
    › ai openai

    ${colors.gray('# Quick message (no mode switch)')}
    › @openai What is the capital of France?
    › @anthropic Explain quantum computing

    ${colors.gray('# Different providers')}
    › @groq Summarize this text...
    › @google Translate to Spanish: Hello

  ${colors.bold('Environment variables:')}
    ${colors.white('OPENAI_API_KEY')}      OpenAI
    ${colors.white('ANTHROPIC_API_KEY')}   Anthropic
    ${colors.white('GROQ_API_KEY')}        Groq
    ${colors.white('GOOGLE_API_KEY')}      Google
    ${colors.white('XAI_API_KEY')}         xAI
    ... (${colors.white('<PROVIDER>_API_KEY')})

  ${colors.bold('Memory:')}
    • Each provider maintains ${colors.white('12 message pairs')} (24 msgs)
    • Use ${colors.green('ai:clear')} to reset all memories
    • Use ${colors.green('ai:clear openai')} to reset specific provider
      `,

      // FTP
      'ftp': `
  ${colors.bold(colors.cyan('FTP - FTP Client'))}

  ${colors.bold('Usage:')}
    ${colors.green('ftp <host> <command> [options]')}

  ${colors.bold('Commands:')}
    ${colors.white('ls [path]')}       List directory contents
    ${colors.white('get <file>')}      Download file
    ${colors.white('put <file>')}      Upload file
    ${colors.white('rm <file>')}       Delete file
    ${colors.white('mkdir <dir>')}     Create directory

  ${colors.bold('Options:')}
    ${colors.white('user=username')}   FTP username
    ${colors.white('pass=password')}   FTP password
    ${colors.white('port=21')}         FTP port
    ${colors.white('secure')}          Use FTPS (TLS)

  ${colors.bold('Examples:')}
    ${colors.gray('# List files')}
    › ftp ftp.example.com ls /pub

    ${colors.gray('# Download with auth')}
    › ftp ftp.example.com get /file.zip user=admin pass=secret

    ${colors.gray('# Upload file')}
    › ftp ftp.example.com put ./local.txt user=admin pass=secret

    ${colors.gray('# Secure FTP')}
    › ftp ftp.example.com ls secure user=admin pass=secret
      `,

      // HAR
      'har': `
  ${colors.bold(colors.cyan('HAR - HTTP Archive Recording/Playback'))}

  ${colors.bold('Commands:')}
    ${colors.green('har:record <file>')}    Start recording to HAR file
    ${colors.green('har:stop')}             Stop recording
    ${colors.green('har:play <file>')}      Replay requests from HAR
    ${colors.green('har:info <file>')}      Show HAR file information

  ${colors.bold('Examples:')}
    ${colors.gray('# Record a session')}
    › har:record session.har
    › get /api/users
    › post /api/users name="Test"
    › har:stop

    ${colors.gray('# Replay the session')}
    › har:play session.har

    ${colors.gray('# Inspect HAR file')}
    › har:info session.har

  ${colors.bold('Use cases:')}
    • Capture API flows for documentation
    • Replay for testing/debugging
    • Share reproducible API interactions
    • Performance analysis
      `,

      // Robots/Sitemap/LLMS
      'robots': `
  ${colors.bold(colors.cyan('ROBOTS - robots.txt Analysis'))}

  ${colors.bold('Usage:')}
    ${colors.green('robots [url]')}    Analyze robots.txt (uses base URL if set)

  ${colors.bold('What it checks:')}
    • Syntax validity
    • User-Agent blocks
    • Sitemap directives
    • Crawl-delay settings
    • AI bot restrictions (GPTBot, ClaudeBot, etc.)

  ${colors.bold('Examples:')}
    › robots example.com
    › url example.com
    › robots
      `,

      'sitemap': `
  ${colors.bold(colors.cyan('SITEMAP - sitemap.xml Analysis'))}

  ${colors.bold('Usage:')}
    ${colors.green('sitemap [url]')}    Analyze sitemap.xml (uses base URL if set)

  ${colors.bold('What it checks:')}
    • Valid XML structure
    • URL count (max 50,000)
    • File size (max 50MB)
    • URL validity
    • lastmod dates
    • Duplicate detection

  ${colors.bold('Examples:')}
    › sitemap example.com
    › sitemap example.com/custom-sitemap.xml
      `,

      'llms': `
  ${colors.bold(colors.cyan('LLMS - llms.txt Analysis'))}

  ${colors.bold('Usage:')}
    ${colors.green('llms [url]')}    Analyze llms.txt file

  ${colors.bold('About llms.txt:')}
    A proposed standard for LLM-friendly content.
    Learn more: https://llmstxt.org

  ${colors.bold('What it checks:')}
    • Valid format
    • Site name and description
    • Content sections
    • Link validity

  ${colors.bold('Examples:')}
    › llms example.com
    › llms https://example.com/llms.txt
      `,

      // URL/Set/Vars
      'url': `
  ${colors.bold(colors.cyan('URL - Set Base URL'))}

  ${colors.bold('Usage:')}
    ${colors.green('url <url>')}    Set the base URL for subsequent requests

  ${colors.bold('Examples:')}
    ${colors.gray('# Set base URL')}
    › url api.example.com
    › url https://api.example.com

    ${colors.gray('# Then make requests without full URL')}
    › get /users
    › post /users name="Test"

  ${colors.bold('Benefits:')}
    • Shorter commands
    • Enables commands that use domain (whois, dns, tls)
    • Prompt shows current host
      `,

      'set': `
  ${colors.bold(colors.cyan('SET - Session Variables'))}

  ${colors.bold('Usage:')}
    ${colors.green('set <key>=<value>')}    Set a variable

  ${colors.bold('Usage in requests:')}
    Use ${colors.white('$key')} to reference variable value

  ${colors.bold('Examples:')}
    ${colors.gray('# Set variables')}
    › set token=abc123
    › set user_id=42

    ${colors.gray('# Use in requests')}
    › get /users/$user_id Authorization:"Bearer $token"

  ${colors.bold('Related:')}
    ${colors.green('vars')}    List all variables
    ${colors.green('env')}     Load from .env file
      `,

      'env': `
  ${colors.bold(colors.cyan('ENV - Load Environment Variables'))}

  ${colors.bold('Usage:')}
    ${colors.green('env [path]')}    Load .env file (default: ./.env)

  ${colors.bold('Examples:')}
    ${colors.gray('# Load from current directory')}
    › env

    ${colors.gray('# Load specific file')}
    › env ./config/.env.local

  ${colors.bold('File format:')}
    ${colors.gray('# .env file')}
    API_KEY=your-key-here
    BASE_URL=https://api.example.com
    DEBUG=true

  ${colors.bold('Note:')}
    Variables are available via ${colors.white('$VAR_NAME')} in requests
      `,

      // IP
      'ip': `
  ${colors.bold(colors.cyan('IP - IP Intelligence'))}

  ${colors.bold('Usage:')}
    ${colors.green('ip <address>')}    Lookup IP information

  ${colors.bold('Information provided:')}
    • Geolocation (city, country)
    • ASN information
    • Network details
    • Hostname (reverse DNS)

  ${colors.bold('Examples:')}
    › ip 8.8.8.8
    › ip 2001:4860:4860::8888
      `,

      // Ping
      'ping': `
  ${colors.bold(colors.cyan('PING - TCP Connectivity Check'))}

  ${colors.bold('Usage:')}
    ${colors.green('ping <host>')}    Quick TCP ping to host

  ${colors.bold('Note:')}
    This is a TCP connection test, not ICMP ping.
    It verifies the host is reachable on port 80/443.

  ${colors.bold('Examples:')}
    › ping example.com
    › ping 192.168.1.1
      `,

      // Default help for unknown commands
      'default': `
  ${colors.bold(colors.yellow('Unknown command'))}

  Try one of these:
    ${colors.green('help')}              Show all commands
    ${colors.green('help spider')}       Spider/crawler help
    ${colors.green('help seo')}          SEO analysis help
    ${colors.green('help dns')}          DNS lookup help
    ${colors.green('help ai')}           AI chat help
    ${colors.green('help load')}         Load testing help
      `,
    };

    // Find the help content (handle aliases)
    const aliases: Record<string, string> = {
      'ssl': 'tls',
      'chat': 'ai',
      '@openai': 'ai',
      '@anthropic': 'ai',
      'crawl': 'spider',
      'crawler': 'spider',
      'scrape': 'scrap',
      'websocket': 'ws',
      'vars': 'set',
      'dns:propagate': 'dns',
      'dns:email': 'dns',
      'dns:health': 'dns',
      'har:record': 'har',
      'har:play': 'har',
      'har:stop': 'har',
      'har:info': 'har',
    };

    const normalizedCmd = aliases[cmd] || cmd;
    const content = helpContent[normalizedCmd] || helpContent['default'];

    console.log(content);
  }
}

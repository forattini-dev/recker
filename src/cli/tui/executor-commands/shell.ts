/**
 * Shell Utility Commands
 *
 * Commands for shell management: help, clear, variables, etc.
 */

import type { CommandResult } from './types.js';
import {
  addHistoryItem,
  setBaseUrl,
  baseUrl,
  setVariable,
  getVariable,
  variables,
} from '../hooks/useShellState.js';

// =============================================================================
// Help Command
// =============================================================================

export function cmdHelp(args: string[]): CommandResult {
  const topic = args[0]?.toLowerCase();

  if (topic === 'http') {
    addHistoryItem({
      type: 'info',
      content: `HTTP Commands:
  GET <url>     - Make GET request
  POST <url>    - Make POST request
  PUT <url>     - Make PUT request
  DELETE <url>  - Make DELETE request
  PATCH <url>   - Make PATCH request
  HEAD <url>    - Make HEAD request
  OPTIONS <url> - Make OPTIONS request

Examples:
  get https://api.github.com/users/octocat
  post api.example.com/users name=John age:=30`,
    });
    return { success: true };
  }

  if (topic === 'network') {
    addHistoryItem({
      type: 'info',
      content: `Network Commands:
  dns <domain>        - DNS lookup (A records)
  dns <domain> <type> - DNS lookup (A, AAAA, MX, TXT, etc.)
  whois <domain>      - WHOIS lookup
  rdap <domain>       - RDAP lookup (modern WHOIS)
  ping <host> [port]  - TCP ping`,
    });
    return { success: true };
  }

  if (topic === 'ai') {
    addHistoryItem({
      type: 'info',
      content: `AI Chat Commands:
  @<provider> <message> - Chat with an AI provider

Available providers:
  @openai      - OpenAI (GPT-4o, GPT-5.1)
  @anthropic   - Anthropic (Claude)
  @groq        - Groq (fast inference)
  @gemini      - Google Gemini
  @mistral     - Mistral AI
  @cohere      - Cohere
  @deepseek    - DeepSeek
  @fireworks   - Fireworks AI
  @together    - Together AI
  @perplexity  - Perplexity AI
  @xai         - xAI (Grok)

Examples:
  @openai What is the capital of France?
  @anthropic Write a haiku about coding
  @groq Explain quantum computing simply

Features:
  - Conversation memory preserved per provider
  - Streaming responses
  - Automatic API key detection from environment

Required environment variables:
  OPENAI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY, etc.`,
    });
    return { success: true };
  }

  if (topic === 'spider' || topic === 'crawl') {
    addHistoryItem({
      type: 'info',
      content: `Spider - Crawl a website

Usage: spider <url> [options]

Options:
  depth=<n>        Max link depth (default: 5)
  limit=<n>        Max pages to crawl (default: 100)
  concurrency=<n>  Parallel requests (default: 5)
  --seo            Enable SEO analysis per page
  --robots         Respect robots.txt
  -o, --output     Save JSON report to file
  -O, --outputDir  Save to directory (auto-generates filename)
  -L, --jsonl      Stream output as JSONL (one JSON per line)
  -E, --extract    CSS selectors to extract (can be repeated)
  --include        URL pattern to include (regex)
  --exclude        URL pattern to exclude (regex)

Extraction syntax:
  -E h1            Extract text from h1 tags
  -E "a:href"      Extract href attribute from links
  -E ".price:text" Extract text from .price elements

Focus modes (with --seo):
  focus=links      Link analysis
  focus=duplicates Duplicate content
  focus=security   Security issues
  focus=ai         AI-search readiness

Examples:
  spider example.com
  spider example.com depth=3 limit=50
  spider example.com -o crawl.json
  spider example.com -E h1 -E h2 --json
  spider example.com -E "a:href" -o links.json
  spider example.com --include "^/blog/"
  spider example.com --seo -o full-report.json
  spider example.com --jsonl -o crawl.jsonl`,
    });
    return { success: true };
  }

  if (topic === 'seo') {
    addHistoryItem({
      type: 'info',
      content: `SEO Analysis - Analyze page SEO

Usage: seo <url> [options]

Options:
  --all, -a        Show all checks (including passed)
  --json           Output raw JSON
  -o, --output     Save report to file
  -O, --outputDir  Save to directory (auto-generates filename)
  category=<name>  Filter by category

Categories:
  performance, security, content, links, images,
  meta, technical, accessibility, og, twitter, i18n

Examples:
  seo google.com
  seo example.com --all
  seo example.com -o report.json
  seo example.com -O ~/reports/
  seo example.com category=performance`,
    });
    return { success: true };
  }

  if (topic === 'dns') {
    addHistoryItem({
      type: 'info',
      content: `DNS Lookup - Query DNS records

Usage: dns <domain> [type]

Record types:
  A        IPv4 address (default)
  AAAA     IPv6 address
  MX       Mail exchange
  TXT      Text records
  NS       Name servers
  CNAME    Canonical name
  SOA      Start of authority
  PTR      Pointer (reverse DNS)

Examples:
  dns google.com
  dns google.com MX
  dns example.com TXT
  dns 8.8.8.8 PTR`,
    });
    return { success: true };
  }

  if (topic === 'whois') {
    addHistoryItem({
      type: 'info',
      content: `WHOIS Lookup - Domain registration info

Usage: whois <domain>

Returns:
  - Registrar information
  - Registration dates
  - Expiration date
  - Name servers
  - Contact info (if public)

Examples:
  whois google.com
  whois example.org`,
    });
    return { success: true };
  }

  if (topic === 'ws' || topic === 'websocket') {
    addHistoryItem({
      type: 'info',
      content: `WebSocket Client - Connect to WebSocket servers

Usage: ws <url>

Once connected:
  - Type messages to send
  - Receive messages in real-time
  - Ctrl+C to disconnect

Examples:
  ws wss://echo.websocket.org
  ws wss://api.example.com/socket`,
    });
    return { success: true };
  }

  if (topic === 'hls') {
    addHistoryItem({
      type: 'info',
      content: `HLS Stream - Analyze and download HLS streams

Usage: hls <url> [options]

Options:
  -o, --output     Download to file
  --variant <n>    Select specific variant/quality
  --segments       Show segment list

Examples:
  hls https://example.com/stream.m3u8
  hls https://example.com/stream.m3u8 -o video.ts`,
    });
    return { success: true };
  }

  if (topic === 'live') {
    addHistoryItem({
      type: 'info',
      content: `Live Stream Recording - Record live streams

Usage: live <url> [options]

Options:
  -o, --output     Output file path (auto-generates if not set)
  -O, --outputDir  Output directory for recordings
  -d, --duration   Max duration in seconds
  --variant <n>    Select specific variant/quality

Examples:
  live https://example.com/live.m3u8
  live https://example.com/live.m3u8 -o recording.ts
  live https://example.com/live.m3u8 -d 3600`,
    });
    return { success: true };
  }

  if (topic === 'load' || topic === 'bench') {
    addHistoryItem({
      type: 'info',
      content: `Load Testing - HTTP load testing

Usage: load <url> [options]

Options:
  -n, --requests   Total requests (default: 100)
  -c, --concurrency  Concurrent connections (default: 10)
  -d, --duration   Test duration in seconds
  --method         HTTP method (default: GET)

Examples:
  load https://api.example.com/health
  load https://api.example.com -n 1000 -c 50
  load https://api.example.com -d 60`,
    });
    return { success: true };
  }

  if (topic === 'proxy') {
    addHistoryItem({
      type: 'info',
      content: `Proxy Server Commands:
  serve proxy              - Start forward proxy on port 8888
  serve proxy -p <port>    - Start on custom port
  serve proxy -i           - Start in intercept mode (HTTPS MITM)
  serve proxy --verbose    - Enable verbose logging

Modes:
  forward   - Standard HTTP proxy (default)
              Tunnels HTTPS via CONNECT, forwards HTTP requests
  intercept - TLS-terminating proxy (-i flag)
              Decrypts HTTPS for inspection (requires CA trust)

Options:
  -p, --port <n>    - Port to listen on (default: 8888)
  -h, --host <ip>   - Host to bind to (default: 0.0.0.0)
  -i, --intercept   - Enable intercept mode
  --log-payloads    - Log request/response bodies
  -v, --verbose     - Verbose output

Examples:
  serve proxy                     - Forward proxy on :8888
  serve proxy -p 3128             - Forward proxy on :3128
  serve proxy -i -p 8080          - Intercept proxy on :8080
  serve proxy --verbose           - Forward proxy with verbose logs

Using the proxy:
  curl -x http://localhost:8888 http://example.com
  export HTTP_PROXY=http://localhost:8888 && curl example.com

Proxy Tab (F4):
  - Real-time request/response monitoring
  - Filter by method, status, or search
  - Ctrl+↑↓ to navigate requests
  - Ctrl+Enter for request details
  - Alt+Y to copy as cURL
  - Alt+C to clear requests
  - Alt+E to export as JSON

mTLS Support (CLI only):
  rek serve proxy --mtls --ca-cert ca.pem --ca-key ca-key.pem`,
    });
    return { success: true };
  }

  // General help
  addHistoryItem({
    type: 'info',
    content: `rek shell - Network SDK for humans (and robots)

Help Topics:
  help http        HTTP request commands
  help network     Network tools (dns, whois, ping)
  help ai          AI chat providers
  help spider      Web crawler
  help seo         SEO analysis
  help dns         DNS lookup
  help whois       WHOIS lookup
  help ws          WebSocket client
  help hls         HLS streaming
  help live        Live stream recording
  help load        Load testing
  help proxy       Proxy server

Tip: Type '<command> help' or 'help <command>' for command help.

Commands:
  help [topic]     - Show help (see topics above)
  clear            - Clear history
  exit / quit      - Exit shell

HTTP:
  GET/POST/PUT/DELETE/PATCH <url>
  <url>            - Make GET request to URL

Network:
  dns <domain>     - DNS lookup
  whois <domain>   - WHOIS lookup
  rdap <domain>    - RDAP lookup
  ping <host>      - TCP ping
  ip <address>     - IP geolocation
  tls/ssl <host>   - TLS certificate inspection
  ws <url>         - WebSocket client

Analysis:
  seo <url>        - SEO analysis
  spider <url>     - Crawl website (--seo for SEO mode)
  robots <url>     - Check robots.txt
  sitemap <url>    - Parse sitemap.xml

Streaming:
  hls <url>        - HLS stream info/download
  live <url>       - Live stream recording
  sse <url>        - Server-sent events

API Protocols:
  graphql <url>    - GraphQL queries

Mock Servers:
  serve http       - Start HTTP server
  serve ws         - Start WebSocket server
  serve dns        - Start DNS server
  serve hls        - Start HLS server
  serve proxy      - Start proxy server (see: help proxy)
  (also: webhook, sse, ftp, telnet, whois, udp)

Background Jobs:
  jobs             - List/manage background jobs
  <command> &      - Run command in background
  Supported: spider, seo, live, hls, load, serve

AI Chat:
  @openai <msg>    - Chat with OpenAI (GPT)
  @anthropic <msg> - Chat with Anthropic (Claude)
  @groq <msg>      - Chat with Groq (fast LLMs)
  @gemini <msg>    - Chat with Google Gemini
  (also: mistral, cohere, deepseek, fireworks, together, perplexity, xai)

Variables:
  url <baseUrl>    - Set base URL
  set <name> <val> - Set variable
  get <name>       - Get variable (use for simple names like 'myvar')
  vars             - List variables

Note: 'get /path' or 'get domain.com' → HTTP GET request

Keyboard:
  Ctrl+C  - Exit
  Ctrl+L  - Clear
  Ctrl+F  - Search
  Tab     - Toggle theme
  ↑/↓     - History navigation`,
  });
  return { success: true };
}

// =============================================================================
// Clear Command
// =============================================================================

export function cmdClear(): CommandResult {
  return { success: true, output: '__CLEAR__' };
}

// =============================================================================
// Base URL Commands
// =============================================================================

export function cmdSetBase(url?: string): CommandResult {
  if (!url) {
    const current = baseUrl();
    addHistoryItem({
      type: 'info',
      content: current ? `Base URL: ${current}` : 'No base URL set',
    });
    return { success: true };
  }

  let finalUrl = url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    finalUrl = `https://${url}`;
  }

  setBaseUrl(finalUrl);
  addHistoryItem({
    type: 'info',
    content: `Base URL set to: ${finalUrl}`,
  });
  return { success: true };
}

// =============================================================================
// Variable Commands
// =============================================================================

export function cmdSetVariable(name?: string, value?: string): CommandResult {
  if (!name) {
    addHistoryItem({ type: 'error', content: 'Usage: set <name> <value>' });
    return { success: false };
  }

  let parsedValue: any = value;
  if (value) {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      // Keep as string
    }
  }

  setVariable(name, parsedValue);
  addHistoryItem({
    type: 'info',
    content: `Set ${name} = ${JSON.stringify(parsedValue)}`,
  });
  return { success: true };
}

export function cmdGetVariable(name?: string): CommandResult {
  if (!name) {
    addHistoryItem({ type: 'error', content: 'Usage: get <name>' });
    return { success: false };
  }

  const value = getVariable(name);
  if (value === undefined) {
    addHistoryItem({ type: 'info', content: `Variable '${name}' not set` });
  } else {
    addHistoryItem({
      type: 'response',
      content: value,
    });
  }
  return { success: true };
}

export function cmdListVariables(): CommandResult {
  const vars = variables();
  if (Object.keys(vars).length === 0) {
    addHistoryItem({ type: 'info', content: 'No variables set' });
  } else {
    addHistoryItem({
      type: 'response',
      content: vars,
    });
  }
  return { success: true };
}

<div align="center">

# ⚡ Recker

### Multi-Protocol SDK for the AI Era

Nine protocols unified: HTTP, WebSocket, DNS, WHOIS, RDAP, FTP, SFTP, Telnet, HLS.
<br>
AI-native: OpenAI, Anthropic, Google, Ollama + MCP server with 70 tools.
<br>
48 service presets built-in. Zero config.

**One SDK to connect your app to everything.**

[![npm version](https://img.shields.io/npm/v/recker.svg?style=flat-square&color=F5A623)](https://www.npmjs.com/package/recker)
[![npm downloads](https://img.shields.io/npm/dm/recker.svg?style=flat-square&color=34C759)](https://www.npmjs.com/package/recker)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/npm/l/recker.svg?style=flat-square&color=007AFF)](https://github.com/forattini-dev/recker/blob/main/LICENSE)

[📖 Documentation](https://forattini-dev.github.io/recker) · [🚀 Quick Start](#quick-start) · [🔧 CLI](#cli-rek)

</div>

---

## Quick Start

```bash
npm install recker
```

```typescript
import { get, post, whois, dns } from 'recker';

// HTTP - just works
const users = await get('https://api.example.com/users').json();
await post('https://api.example.com/users', { json: { name: 'John' } });

// DNS & WHOIS
const ips = await dns('google.com');
const info = await whois('github.com');
```

### Browser

Recker provides two browser builds: **Full** and **Mini**.

| Build | Size | Includes |
|:------|:-----|:---------|
| **Full** | ~1.1 MB | HTTP, WebSocket, SSE, AI, SEO, Scrape, portable plugins |
| **Mini** | ~480 KB | HTTP, WebSocket, SSE, core plugins only |

```typescript
// Full build - includes everything
import { recker, get, post } from 'recker/browser';

// Mini build - 57% smaller, no AI/SEO/scrape
// Presets and auth helpers are Node-only
import { recker, get, post } from 'recker/browser-mini';
```

#### CDN Usage

```html
<!-- Full build (UMD) -->
<script src="https://unpkg.com/recker/dist/browser/index.umd.min.js"></script>

<!-- Mini build (UMD) - recommended for most projects -->
<script src="https://unpkg.com/recker/dist/browser/index.mini.umd.min.js"></script>

<script>
  const { recker, get, post } = Recker;
  const data = await get('https://api.example.com/data').json();
</script>
```

```html
<!-- ES Module -->
<script type="module">
  // Full
  import { get } from 'https://unpkg.com/recker/dist/browser/index.min.js';
  // Mini
  import { get } from 'https://unpkg.com/recker/dist/browser/index.mini.min.js';
</script>
```

#### Which Build to Choose?

| Use Case | Recommended Build |
|:---------|:------------------|
| Simple HTTP requests | `recker/browser-mini` |
| Need AI streaming (OpenAI, etc.) | `recker/browser` |
| Need SEO analysis | `recker/browser` |
| Need web scraping | `recker/browser` |
| Need API presets (GitHub, Stripe) | Use Node build (`recker`) |
| Bundle size is critical | `recker/browser-mini` |

[→ Browser Documentation](https://forattini-dev.github.io/recker/#/browser/01-quickstart)

### Unified Namespace

```typescript
import { recker } from 'recker';

await recker.get('/users').json();     // HTTP
await recker.whois('github.com');      // WHOIS
await recker.dns('google.com');        // DNS
await recker.ai.chat('Hello!');        // AI
recker.ws('wss://example.com/socket'); // WebSocket
```

## What's Inside

| Category | Features |
|:---------|:---------|
| **Protocols** | HTTP/2, WebSocket, DNS, WHOIS, RDAP, FTP, SFTP, Telnet, HLS |
| **AI** | OpenAI, Anthropic, Google, Ollama, Groq, Mistral + streaming |
| **Resilience** | Retry, circuit breaker, rate limiting, request deduplication |
| **Auth** | Basic, Bearer, OAuth2, AWS SigV4, Digest, API Key + 15 providers |
| **SEO** | 400+ rules, 19 categories, site-wide spider crawler |
| **Testing** | 10 mock servers (HTTP, Proxy, WebSocket, DNS, FTP, HLS, SSE...) |
| **CLI** | `rek` - curl replacement with superpowers |
| **MCP** | 70 tools for AI assistants (Claude, Cursor, Windsurf) |

## Highlights

### AI Streaming

```typescript
for await (const chunk of recker.ai.stream({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
})) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

### Retry & Circuit Breaker

```typescript
import { createClient, circuitBreaker } from 'recker';

const api = createClient({
  baseUrl: 'https://api.example.com',
  retry: { maxAttempts: 3, backoff: 'exponential' },
  plugins: [circuitBreaker({ threshold: 5, resetTimeout: 30000 })]
});
```

### Request Timing

```typescript
const res = await get('https://api.example.com/data');
console.log(res.timings);
// { dns: 12, tcp: 8, tls: 45, firstByte: 23, total: 156 }
```

### SEO Analysis

```typescript
import { analyzeSeo } from 'recker/seo';

const report = await analyzeSeo(html, { baseUrl: 'https://example.com' });
console.log(`Score: ${report.score}/100 (Grade: ${report.grade})`);
// 400+ checks across 19 categories
```

### Web Scraping

```typescript
import { Spider } from 'recker/scrape';

// Simple scraping
const doc = await client.scrape('https://news.ycombinator.com');
const headlines = doc.selectAll('.titleline > a').map(el => el.text());

// Full site crawling
const spider = new Spider({ maxPages: 100 });
const results = await spider.crawl('https://example.com');
```

#### Scraping Protected Sites

Some sites use bot protection (Cloudflare, Akamai). Recker handles this automatically:

```bash
# One-time setup (downloads curl-impersonate)
npx recker setup
```

```typescript
const spider = new Spider({ maxPages: 50 });
await spider.crawl('https://protected-site.com');
// Automatically retries with curl-impersonate if blocked
```

[📖 Anti-blocking docs](https://forattini-dev.github.io/recker/#/scraping/06-anti-blocking)

### 48 API Presets

Pre-configured clients for popular services:

```typescript
import { presets } from 'recker';

const github = presets.github({ token: '...' });
const stripe = presets.stripe({ apiKey: '...' });
const openai = presets.openai({ apiKey: '...' });
```

<details>
<summary>All 48 presets</summary>

`anthropic` `aws` `azure` `azure-openai` `chaturbate` `cloudflare` `cohere` `deepseek` `digitalocean` `discord` `elevenlabs` `fireworks` `gcp` `gemini` `github` `gitlab` `groq` `hubspot` `huggingface` `linear` `mailgun` `meta` `mistral` `notion` `openai` `oracle` `perplexity` `pinecone` `pornhub` `replicate` `sendgrid` `sentry` `sinch` `slack` `square` `stripe` `supabase` `tiktok` `together` `twilio` `vercel` `vultr` `xai` `xvideos` `youtube` `android` `ios`

</details>

## CLI (`rek`)

A curl replacement with better DX:

```bash
# Install
npm install -g recker

# HTTP requests
rek httpbin.org/json
rek POST api.com/users name="John" age:=30

# Pipe to bash (like curl)
rek -q https://get.docker.com | bash

# SEO analysis
rek seo https://example.com

# DNS toolkit
rek dns google.com
rek dns propagate example.com
rek dns spf github.com

# Mock servers for testing
rek serve http     # HTTP on :3000
rek serve ws       # WebSocket on :8080
rek serve hls      # HLS streaming on :8082
rek serve dns      # DNS on :5353

# Interactive shell
rek shell
```

[→ CLI Documentation](https://forattini-dev.github.io/recker/#/cli/01-overview)

## MCP Server

70 tools for AI assistants like Claude Code, Cursor, and Windsurf:

```bash
# One-liner for Claude Code (uses minimal category by default)
claude mcp add recker npx recker@latest mcp

# Add more categories as needed
claude mcp add recker npx recker@latest mcp --category=minimal,video,seo

# Enable all 70 tools
claude mcp add recker npx recker@latest mcp --category=full
```

**Categories:** `minimal` (default) `docs` `network` `dns` `security` `seo` `scrape` `video` `ai` `protocols` `parsing` `streaming` `template` `full`

[→ MCP Documentation](https://forattini-dev.github.io/recker/#/getting-started/mcp)

## Documentation

| Topic | Link |
|:------|:-----|
| Quick Start | [→ Getting Started](https://forattini-dev.github.io/recker/#/http/01-quickstart) |
| HTTP Client | [→ HTTP Guide](https://forattini-dev.github.io/recker/#/http/02-fundamentals) |
| Plugins | [→ 30+ Plugins](https://forattini-dev.github.io/recker/#/http/10-plugins) |
| Authentication | [→ 15 Auth Methods](https://forattini-dev.github.io/recker/#/http/06-authentication) |
| AI Integration | [→ AI Providers](https://forattini-dev.github.io/recker/#/ai/01-overview) |
| CLI | [→ Terminal Client](https://forattini-dev.github.io/recker/#/cli/01-overview) |
| MCP Server | [→ AI Tools](https://forattini-dev.github.io/recker/#/getting-started/mcp) |
| SEO Analysis | [→ 400+ Rules](https://forattini-dev.github.io/recker/#/http/19-seo) |
| Mock Servers | [→ Testing](https://forattini-dev.github.io/recker/#/cli/08-mock-servers) |
| API Reference | [→ Full API](https://forattini-dev.github.io/recker/#/reference/01-api) |

## License

MIT © [Forattini](https://github.com/forattini-dev)

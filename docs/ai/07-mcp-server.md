# MCP Server

Recker includes a built-in MCP Server that exposes **65 tools** across 12 categories to AI agents like Claude Code, Cursor, and other AI-powered tools.

> **TL;DR**: Run `rek mcp` and add the configuration to your AI tool to get access to 65 powerful tools.

## Quick Start

### CLI Usage

```bash
# Start in stdio mode (for Claude Code, Cursor)
rek mcp

# With a specific category
rek mcp --category=minimal

# Combine categories
rek mcp --category=minimal,video,ai

# Start HTTP server
rek mcp --transport=http --port=3100

# Start with SSE support
rek mcp --transport=sse --port=3100

# Enable debug logging
rek mcp --debug
```

### Programmatic Usage

```typescript
import { MCPServer } from 'recker/mcp';

const server = new MCPServer({
  transport: 'http',
  port: 3100,
  category: 'full'
});

await server.start();
```

## Categories

Categories allow you to control which tools are exposed to AI agents.

**Default Category**: When no category is specified, `minimal` is used automatically (7 core tools, ~2500 tokens).

This is useful for:

- **Reducing context size**: AI models have limited context windows
- **Security**: Only expose necessary tools
- **Focus**: Limit tools to specific tasks

### Available Categories

| Category | Tools | Est. Tokens | Description |
|----------|-------|-------------|-------------|
| `minimal` | 7 | ~2500 | Core docs + basic network + site audit |
| `docs` | 6 | ~1800 | Documentation and migration tools |
| `network` | 11 | ~3500 | HTTP, DNS, TLS, WHOIS, ping, API tools |
| `dns` | 9 | ~3000 | All DNS tools |
| `security` | 6 | ~2200 | TLS inspection, security headers, GeoIP, domain audit |
| `seo` | 7 | ~2800 | SEO analysis, spider, quick wins, sitemap, schema |
| `scrape` | 2 | ~800 | Web scraping with CSS selectors |
| `video` | 5 | ~1500 | Video/audio extraction |
| `ai` | 5 | ~1500 | AI providers (chat, embed, tokens, compare) |
| `protocols` | 7 | ~2100 | FTP, SFTP, Telnet, WebSocket |
| `parsing` | 10 | ~3000 | GraphQL, JSON-RPC, CSV, YAML, XML |
| `streaming` | 3 | ~900 | HLS streaming |
| `full` | 65 | ~18000 | All tools |

### Category Tools

**minimal** (7 tools):
- `rek_search_docs`, `rek_get_doc`, `rek_http_request`, `rek_dns`, `rek_ping`, `rek_ip_lookup`, `rek_site_audit`

**docs** (6 tools):
- `rek_search_docs`, `rek_get_doc`, `rek_code_examples`, `rek_api_schema`, `rek_suggest`, `rek_curl_convert`

**network** (11 tools):
- `rek_http_request`, `rek_dns`, `rek_dns_dig`, `rek_tls`, `rek_whois`, `rek_rdap`, `rek_ping`, `rek_ip_lookup`, `rek_curl_convert`, `rek_api_compare`, `rek_load_test`

**dns** (9 tools):
- `rek_dns`, `rek_dns_propagate`, `rek_dns_health`, `rek_dns_spf`, `rek_dns_dmarc`, `rek_dns_dkim`, `rek_dns_dig`, `rek_dns_system`, `rek_dns_toolkit`

**security** (6 tools):
- `rek_tls_inspect`, `rek_rdap_lookup`, `rek_geoip_lookup`, `rek_security_headers`, `rek_dns_toolkit`, `rek_domain_audit`

**seo** (7 tools):
- `rek_site_audit`, `rek_seo_analyze`, `rek_seo_spider`, `rek_seo_quick_wins`, `rek_seo_sitemap`, `rek_seo_schema`, `rek_scrape`

**scrape** (2 tools):
- `rek_scrape`, `rek_http_request`

**video** (5 tools):
- `rek_video_info`, `rek_video_formats`, `rek_video_check`, `rek_video_extractors`, `rek_video_url`

**ai** (5 tools):
- `rek_ai_chat`, `rek_ai_embed`, `rek_ai_providers`, `rek_ai_tokens`, `rek_ai_compare`

**protocols** (7 tools):
- `rek_ftp_connect`, `rek_ftp_download`, `rek_sftp_connect`, `rek_sftp_download`, `rek_telnet_connect`, `rek_websocket_connect`, `rek_websocket_ping`

**parsing** (10 tools):
- `rek_graphql_query`, `rek_graphql_introspect`, `rek_jsonrpc_call`, `rek_jsonrpc_batch`, `rek_csv_parse`, `rek_csv_serialize`, `rek_yaml_parse`, `rek_yaml_serialize`, `rek_xml_parse`, `rek_xml_serialize`

**streaming** (3 tools):
- `rek_hls_info`, `rek_hls_variants`, `rek_hls_download`

### Using Categories

```bash
# CLI
rek mcp --category=minimal
rek mcp --category=minimal,video,ai
rek mcp --category=full

# Programmatic
const server = new MCPServer({ category: 'minimal,video' });
```

### Claude Code Configuration with Categories

```json
{
  "mcpServers": {
    "recker": {
      "command": "npx",
      "args": ["recker@latest", "mcp", "--category=minimal,video"]
    }
  }
}
```

## Transport Modes

| Mode | Use Case | Protocol |
|------|----------|----------|
| **stdio** | Claude Code, Cursor, CLI tools | stdin/stdout |
| **http** | Web integrations, APIs | POST / |
| **sse** | Real-time applications | POST /, GET /sse |

## AI Tools Integration

### Claude Code

**One-liner installation:**

```bash
claude mcp add recker npx recker@latest mcp
```

Or add manually to `~/.claude.json`:

```json
{
  "mcpServers": {
    "recker": {
      "command": "npx",
      "args": ["recker@latest", "mcp"]
    }
  }
}
```

With categories:

```json
{
  "mcpServers": {
    "recker": {
      "command": "npx",
      "args": ["recker@latest", "mcp", "--category=minimal,video,ai"]
    }
  }
}
```

### Cursor IDE

```json
{
  "mcpServers": {
    "recker": {
      "command": "npx",
      "args": ["recker@latest", "mcp"]
    }
  }
}
```

### Windsurf / Codeium

```json
{
  "mcpServers": {
    "recker": {
      "command": "npx",
      "args": ["recker@latest", "mcp"],
      "env": {}
    }
  }
}
```

### OpenAI / Google Gemini (HTTP)

```bash
rek mcp --transport=http --port=3100
```

```json
{
  "mcpServers": {
    "recker": {
      "transport": "http",
      "url": "http://localhost:3100"
    }
  }
}
```

### xAI Grok (SSE)

```bash
rek mcp --transport=sse --port=3100
```

```json
{
  "mcpServers": {
    "recker": {
      "transport": "sse",
      "url": "http://localhost:3100/sse",
      "postUrl": "http://localhost:3100"
    }
  }
}
```

## Available Tools (65)

### Documentation Tools (6)

#### rek_search_docs

Search documentation using hybrid search (fuzzy + semantic):

```json
{
  "name": "rek_search_docs",
  "arguments": {
    "query": "retry",
    "category": "http",
    "limit": 5,
    "mode": "hybrid"
  }
}
```

**Parameters:**
- `query` (required): Search keywords
- `category` (optional): Filter by category (http, cli, ai, protocols, reference, guides)
- `limit` (optional): Max results (default: 5, max: 10)
- `mode` (optional): Search mode - hybrid, fuzzy, or semantic (default: hybrid)

#### rek_get_doc

Get full content of a documentation file:

```json
{
  "name": "rek_get_doc",
  "arguments": {
    "path": "http/07-resilience.md"
  }
}
```

#### rek_code_examples

Get runnable code examples:

```json
{
  "name": "rek_code_examples",
  "arguments": {
    "feature": "retry",
    "complexity": "intermediate",
    "limit": 3
  }
}
```

#### rek_api_schema

Get TypeScript types and interfaces:

```json
{
  "name": "rek_api_schema",
  "arguments": {
    "type": "ClientOptions"
  }
}
```

#### rek_suggest

Get implementation suggestions:

```json
{
  "name": "rek_suggest",
  "arguments": {
    "useCase": "retry failed requests with exponential backoff"
  }
}
```

#### rek_curl_convert

Convert a curl command to Recker TypeScript code or CLI command:

```json
{
  "name": "rek_curl_convert",
  "arguments": {
    "curl": "curl -X POST https://api.example.com/users -H 'Content-Type: application/json' -d '{\"name\":\"John\"}'",
    "format": "typescript"
  }
}
```

**Parameters:**
- `curl` (required): The curl command to convert
- `format` (optional): Output format - `typescript`/`ts` or `cli`/`rek` (default: typescript)

### Network Tools (13)

> **HTTP/2 Support**: All HTTP requests automatically negotiate HTTP/2 when the server supports it. This provides multiplexing, header compression, and improved performance without any configuration. For advanced HTTP/2 tuning, see the [Performance documentation](/http/06-performance.md#http2-presets-recommended).

#### rek_http_request

Perform HTTP requests:

```json
{
  "name": "rek_http_request",
  "arguments": {
    "url": "https://api.example.com/users",
    "method": "GET",
    "headers": { "Authorization": "Bearer token" },
    "timeout": 10000
  }
}
```

**Parameters:**
- `url` (required): The URL to request
- `method` (optional): HTTP method (default: GET)
- `headers` (optional): Request headers object
- `body` (optional): Request body (for POST, PUT, PATCH)
- `timeout` (optional): Request timeout in ms (default: 10000)
- `headersOnly` (optional): Set to `true` to return only status and headers (uses HEAD method internally, no body parsing)

**Lightweight headers-only request:**

```json
{
  "name": "rek_http_request",
  "arguments": {
    "url": "https://example.com",
    "headersOnly": true
  }
}
```

This is useful for checking URL availability, getting content-type, or inspecting response headers without downloading the full response body.

#### rek_ip_lookup

Get public IP information:

```json
{
  "name": "rek_ip_lookup",
  "arguments": {}
}
```

#### rek_dns

Resolve DNS records:

```json
{
  "name": "rek_dns",
  "arguments": {
    "domain": "example.com",
    "type": "MX"
  }
}
```

#### rek_dns_propagate

Check DNS propagation globally:

```json
{
  "name": "rek_dns_propagate",
  "arguments": {
    "domain": "example.com",
    "type": "A"
  }
}
```

#### rek_dns_health

Comprehensive DNS health check:

```json
{
  "name": "rek_dns_health",
  "arguments": {
    "domain": "example.com"
  }
}
```

#### rek_dns_spf / rek_dns_dmarc / rek_dns_dkim

DNS security record validation:

```json
{
  "name": "rek_dns_spf",
  "arguments": { "domain": "github.com" }
}
```

#### rek_dns_dig

Advanced DNS lookup (like dig):

```json
{
  "name": "rek_dns_dig",
  "arguments": {
    "domain": "example.com",
    "type": "A",
    "server": "8.8.8.8"
  }
}
```

#### rek_dns_system

Get system DNS configuration:

```json
{
  "name": "rek_dns_system",
  "arguments": {}
}
```

#### rek_whois

WHOIS lookup:

```json
{
  "name": "rek_whois",
  "arguments": {
    "query": "github.com"
  }
}
```

#### rek_ping

TCP ping with latency:

```json
{
  "name": "rek_ping",
  "arguments": {
    "host": "google.com",
    "port": 443,
    "count": 5
  }
}
```

#### rek_api_compare

Compare responses from two API endpoints (useful for A/B testing, migrations):

```json
{
  "name": "rek_api_compare",
  "arguments": {
    "url_a": "https://api-v1.example.com/users",
    "url_b": "https://api-v2.example.com/users",
    "method": "GET",
    "ignore_fields": ["timestamp", "requestId"]
  }
}
```

#### rek_load_test

Simple load test for an API endpoint (max 100 requests):

```json
{
  "name": "rek_load_test",
  "arguments": {
    "url": "https://api.example.com/health",
    "requests": 50,
    "concurrency": 10
  }
}
```

**Returns:** Latency percentiles (p50, p95, p99), success rate, and error summary.

### Utility Tools (2)

#### rek_site_audit

**Quick website audit** - consolidated analysis in a single call:

```json
{
  "name": "rek_site_audit",
  "arguments": {
    "url": "https://example.com"
  }
}
```

**Returns:**
- **Connectivity**: TCP latency, HTTP status, TTFB
- **SEO**: title, description, h1, Open Graph tags, issues
- **Security**: HTTPS, security headers grade
- **TLS**: certificate validity, expiration, protocol
- **DNS**: A records, CDN/server detection
- **WHOIS/RDAP**: registrar, registration dates, expiration, nameservers, DNSSEC
- **Discovery**: robots.txt, sitemap.xml, llms.txt, humans.txt, manifest.json, security.txt
- **Overall**: Score (0-100) and Grade (A-F)

This tool is ideal for quick site health checks without crawling.

#### rek_domain_audit

Comprehensive domain audit (DNS, TLS, HTTP headers, WHOIS):

```json
{
  "name": "rek_domain_audit",
  "arguments": {
    "domain": "example.com",
    "checks": ["dns", "tls", "http", "whois"]
  }
}
```

**Returns:** Grade (A-F) and actionable findings across all checks.

### Security Tools (7)

#### rek_tls

Inspect SSL/TLS certificates:

```json
{
  "name": "rek_tls",
  "arguments": {
    "host": "github.com",
    "port": 443
  }
}
```

#### rek_tls_inspect

Detailed TLS connection analysis:

```json
{
  "name": "rek_tls_inspect",
  "arguments": {
    "host": "github.com"
  }
}
```

#### rek_rdap / rek_rdap_lookup

Modern WHOIS (RDAP):

```json
{
  "name": "rek_rdap",
  "arguments": {
    "query": "google.com"
  }
}
```

#### rek_geoip_lookup

IP geolocation with MaxMind:

```json
{
  "name": "rek_geoip_lookup",
  "arguments": {
    "ip": "8.8.8.8"
  }
}
```

#### rek_security_headers

Analyze HTTP security headers (grade A+ to F):

```json
{
  "name": "rek_security_headers",
  "arguments": {
    "url": "https://github.com"
  }
}
```

#### rek_dns_toolkit

Complete DNS security toolkit (SPF, DMARC, DKIM, CAA, MX):

```json
{
  "name": "rek_dns_toolkit",
  "arguments": {
    "domain": "example.com",
    "check": "all"
  }
}
```

**Parameters:**
- `domain` (required): Domain to analyze
- `check` (optional): Which check to run - `all`, `health`, `spf`, `dmarc`, `dkim`, `records` (default: all)

**Returns:** DNS health score, email authentication status, and actionable recommendations.

### Scraping Tools (1)

#### rek_scrape

Web scraping with CSS selectors:

```json
{
  "name": "rek_scrape",
  "arguments": {
    "url": "https://news.ycombinator.com",
    "selectors": {
      "title": "title",
      "headlines[]": ".titleline > a"
    },
    "extract": ["links", "meta"]
  }
}
```

### SEO Tools (5)

#### rek_seo_analyze

Analyze page SEO with 400+ rules:

```json
{
  "name": "rek_seo_analyze",
  "arguments": {
    "url": "https://example.com",
    "categories": ["meta", "content", "performance"]
  }
}
```

#### rek_seo_spider

Crawl entire website:

```json
{
  "name": "rek_seo_spider",
  "arguments": {
    "url": "https://example.com",
    "maxPages": 50,
    "maxDepth": 3
  }
}
```

#### rek_seo_quick_wins

Get prioritized SEO improvements:

```json
{
  "name": "rek_seo_quick_wins",
  "arguments": {
    "url": "https://example.com",
    "limit": 10
  }
}
```

#### rek_seo_sitemap

Analyze sitemap.xml for SEO issues:

```json
{
  "name": "rek_seo_sitemap",
  "arguments": {
    "url": "https://example.com"
  }
}
```

**Checks:** URL count, HTTPS usage, trailing slashes, lastmod dates, sitemap structure.

#### rek_seo_schema

Extract and validate JSON-LD structured data (Schema.org):

```json
{
  "name": "rek_seo_schema",
  "arguments": {
    "url": "https://example.com",
    "validate": true
  }
}
```

**Returns:** Found schema types with validation of required properties.

### Video Tools (5)

#### rek_video_info

Get video metadata from 1800+ sites:

```json
{
  "name": "rek_video_info",
  "arguments": {
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  }
}
```

**Returns:** title, duration, thumbnail, description, formats, uploader, view count, etc.

#### rek_video_formats

List all available formats/qualities:

```json
{
  "name": "rek_video_formats",
  "arguments": {
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  }
}
```

#### rek_video_check

Check if URL is supported:

```json
{
  "name": "rek_video_check",
  "arguments": {
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  }
}
```

#### rek_video_extractors

List all 1800+ supported sites:

```json
{
  "name": "rek_video_extractors",
  "arguments": {
    "search": "youtube"
  }
}
```

#### rek_video_url

Get direct download URL:

```json
{
  "name": "rek_video_url",
  "arguments": {
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "format": "best"
  }
}
```

### AI Tools (5)

#### rek_ai_chat

Chat with AI providers:

```json
{
  "name": "rek_ai_chat",
  "arguments": {
    "message": "Explain recursion",
    "provider": "openai",
    "model": "gpt-4o"
  }
}
```

**Supported providers:** openai, anthropic, google, groq, mistral, ollama

#### rek_ai_embed

Generate text embeddings:

```json
{
  "name": "rek_ai_embed",
  "arguments": {
    "text": "Hello world",
    "provider": "openai",
    "model": "text-embedding-3-small"
  }
}
```

#### rek_ai_providers

List available AI providers:

```json
{
  "name": "rek_ai_providers",
  "arguments": {}
}
```

#### rek_ai_tokens

Count tokens for text:

```json
{
  "name": "rek_ai_tokens",
  "arguments": {
    "text": "Hello world",
    "model": "gpt-4"
  }
}
```

#### rek_ai_compare

Compare responses from multiple AI providers for the same prompt:

```json
{
  "name": "rek_ai_compare",
  "arguments": {
    "prompt": "What is machine learning?",
    "providers": ["openai", "anthropic"],
    "max_tokens": 500
  }
}
```

**Returns:** Latency, token usage, and response quality comparison across providers. Requires API keys in environment.

### Protocol Tools (7)

#### rek_ftp_connect

Connect to FTP server and list files:

```json
{
  "name": "rek_ftp_connect",
  "arguments": {
    "host": "ftp.example.com",
    "username": "user",
    "password": "pass",
    "path": "/public"
  }
}
```

#### rek_ftp_download

Download file from FTP:

```json
{
  "name": "rek_ftp_download",
  "arguments": {
    "host": "ftp.example.com",
    "username": "user",
    "password": "pass",
    "remotePath": "/file.txt",
    "localPath": "./downloaded.txt"
  }
}
```

#### rek_sftp_connect

Connect to SFTP server:

```json
{
  "name": "rek_sftp_connect",
  "arguments": {
    "host": "sftp.example.com",
    "username": "user",
    "password": "pass",
    "path": "/home/user"
  }
}
```

#### rek_sftp_download

Download file from SFTP:

```json
{
  "name": "rek_sftp_download",
  "arguments": {
    "host": "sftp.example.com",
    "username": "user",
    "password": "pass",
    "remotePath": "/home/user/file.txt",
    "localPath": "./downloaded.txt"
  }
}
```

#### rek_telnet_connect

Connect to Telnet server:

```json
{
  "name": "rek_telnet_connect",
  "arguments": {
    "host": "telnet.example.com",
    "port": 23,
    "commands": ["help", "quit"]
  }
}
```

#### rek_websocket_connect

Connect to WebSocket:

```json
{
  "name": "rek_websocket_connect",
  "arguments": {
    "url": "wss://echo.websocket.org",
    "messages": ["Hello", "World"],
    "timeout": 5000
  }
}
```

#### rek_websocket_ping

Ping WebSocket server:

```json
{
  "name": "rek_websocket_ping",
  "arguments": {
    "url": "wss://echo.websocket.org"
  }
}
```

### Parsing Tools (10)

#### rek_graphql_query

Execute GraphQL query:

```json
{
  "name": "rek_graphql_query",
  "arguments": {
    "url": "https://api.example.com/graphql",
    "query": "{ users { id name } }",
    "variables": { "limit": 10 }
  }
}
```

#### rek_graphql_introspect

Introspect GraphQL schema:

```json
{
  "name": "rek_graphql_introspect",
  "arguments": {
    "url": "https://api.example.com/graphql"
  }
}
```

#### rek_jsonrpc_call

Call JSON-RPC method:

```json
{
  "name": "rek_jsonrpc_call",
  "arguments": {
    "url": "https://api.example.com/rpc",
    "method": "getUser",
    "params": { "id": 1 }
  }
}
```

#### rek_jsonrpc_batch

Batch JSON-RPC calls:

```json
{
  "name": "rek_jsonrpc_batch",
  "arguments": {
    "url": "https://api.example.com/rpc",
    "calls": [
      { "method": "getUser", "params": { "id": 1 } },
      { "method": "getUser", "params": { "id": 2 } }
    ]
  }
}
```

#### rek_csv_parse

Parse CSV to JSON:

```json
{
  "name": "rek_csv_parse",
  "arguments": {
    "content": "name,age\nJohn,30\nJane,25",
    "delimiter": ","
  }
}
```

#### rek_csv_serialize

Convert JSON to CSV:

```json
{
  "name": "rek_csv_serialize",
  "arguments": {
    "data": [{ "name": "John", "age": 30 }],
    "delimiter": ","
  }
}
```

#### rek_yaml_parse

Parse YAML to JSON:

```json
{
  "name": "rek_yaml_parse",
  "arguments": {
    "content": "name: John\nage: 30"
  }
}
```

#### rek_yaml_serialize

Convert JSON to YAML:

```json
{
  "name": "rek_yaml_serialize",
  "arguments": {
    "data": { "name": "John", "age": 30 }
  }
}
```

#### rek_xml_parse

Parse XML to JSON:

```json
{
  "name": "rek_xml_parse",
  "arguments": {
    "content": "<user><name>John</name><age>30</age></user>"
  }
}
```

#### rek_xml_serialize

Convert JSON to XML:

```json
{
  "name": "rek_xml_serialize",
  "arguments": {
    "data": { "user": { "name": "John", "age": 30 } },
    "rootName": "root"
  }
}
```

### Streaming Tools (3)

#### rek_hls_info

Get HLS stream information:

```json
{
  "name": "rek_hls_info",
  "arguments": {
    "url": "https://example.com/playlist.m3u8"
  }
}
```

**Returns:** Whether master/media playlist, variants, segment count, duration, live status.

#### rek_hls_variants

List HLS quality variants:

```json
{
  "name": "rek_hls_variants",
  "arguments": {
    "url": "https://example.com/master.m3u8"
  }
}
```

**Returns:** All variants sorted by bandwidth with resolution, codecs, frame rate.

#### rek_hls_download

Download HLS stream:

```json
{
  "name": "rek_hls_download",
  "arguments": {
    "url": "https://example.com/playlist.m3u8",
    "output": "./video.ts",
    "concurrency": 5
  }
}
```

## Example Conversations

### Quick Site Audit (NEW!)

```
User: Audit https://example.com

AI: [Uses rek_site_audit]

🔍 Site Audit: example.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Grade: B (78/100)

✅ Connectivity
  - Latency: 145ms
  - HTTP Status: 200 OK
  - TTFB: 89ms

✅ TLS Certificate
  - Valid: Yes
  - Expires: 89 days
  - Protocol: TLS 1.3

✅ DNS
  - Provider: Cloudflare
  - A Record: 104.21.x.x

⚠️ SEO Issues (2)
  - Missing meta description
  - H1 tag not found

⚠️ Security Headers
  - Grade: C
  - Missing: CSP, X-Frame-Options

📁 Discovery Files
  ✅ robots.txt
  ✅ sitemap.xml
  ❌ security.txt (recommended)
  ❌ llms.txt

Would you like me to dig deeper into any specific area?
```

### Documentation Search

```
User: How do I implement retry logic with recker?

AI: Let me search the documentation...
[Uses rek_search_docs with query "retry"]

I found relevant documentation. Let me read the full content...
[Uses rek_get_doc with path "http/07-resilience.md"]

Based on the documentation, here's how to implement retry logic:

const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    attempts: 3,
    backoff: 'exponential',
    delay: 1000
  }
});
```

### Video Extraction

```
User: Get info about this YouTube video: https://youtube.com/watch?v=...

AI: [Uses rek_video_info]

Video Information:
- Title: "Building REST APIs"
- Duration: 15:34
- Uploader: TechChannel
- Views: 125,000
- Available formats: 1080p, 720p, 480p, 360p, audio-only

Would you like me to get the direct download URL for a specific format?
```

### Security Analysis

```
User: Check the security of github.com

AI: [Uses rek_security_headers]
[Uses rek_tls]

Security Analysis:
- Security Headers Grade: A
- TLS Certificate: Valid, expires in 89 days
- Protocol: TLS 1.3, Cipher: AES-256-GCM

Headers Present:
✓ Strict-Transport-Security (HSTS)
✓ Content-Security-Policy
✓ X-Content-Type-Options
✓ X-Frame-Options

No critical issues found.
```

### Data Parsing

```
User: Parse this CSV and convert to YAML

AI: [Uses rek_csv_parse with the CSV content]

Parsed 3 rows with columns: name, age, city

[Uses rek_yaml_serialize]

Here's the YAML output:
- name: John
  age: 30
  city: NYC
- name: Jane
  age: 25
  city: LA
```

## Configuration Options

```typescript
interface MCPServerOptions {
  // Server identification
  name?: string;        // Default: 'recker'
  version?: string;     // Default: '1.0.0'

  // Transport
  transport?: 'stdio' | 'http' | 'sse';  // Default: 'stdio'
  port?: number;        // Default: 3100 (for http/sse)

  // Category (controls which tools are exposed)
  category?: string;    // Default: 'minimal'

  // Documentation paths
  docsPath?: string;
  examplesPath?: string;
  srcPath?: string;

  // Debugging
  debug?: boolean;      // Default: false
}
```

## Docker Deployment

```dockerfile
FROM node:20-alpine
RUN npm install -g recker
EXPOSE 3100
CMD ["rek", "mcp", "--transport=http", "--port=3100"]
```

```bash
docker build -t recker-mcp .
docker run -p 3100:3100 recker-mcp
```

## Health Check (SSE/HTTP Mode)

```bash
curl http://localhost:3100/health
```

```json
{
  "status": "ok",
  "name": "recker",
  "version": "1.0.0",
  "toolCount": 65,
  "category": "full"
}
```

## JSON-RPC Methods

| Method | Description |
|--------|-------------|
| `initialize` | Initialize connection |
| `ping` | Health check |
| `tools/list` | List available tools |
| `tools/call` | Execute a tool |
| `resources/list` | List resources |
| `prompts/list` | List prompts |

## Next Steps

- **[MCP Client](06-mcp-client.md)** - Connect to other MCP servers
- **[AI Patterns](04-patterns.md)** - Common AI integration patterns

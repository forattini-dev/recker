# MCP Server Overview

Recker includes a built-in MCP (Model Context Protocol) server that exposes **65 tools** across 12 categories to AI assistants like Claude Code, Cursor, and other AI-powered tools.

## What is MCP?

MCP is a standard protocol for connecting AI models to external tools and data sources. With Recker's MCP server, your AI assistant can:

- Search and read Recker documentation
- Make HTTP requests, DNS lookups, WHOIS queries
- Inspect TLS certificates and analyze security headers
- Perform GeoIP lookups and RDAP queries
- Scrape web pages with CSS selectors
- Analyze SEO with 400+ rules across 19 categories
- Extract video/audio info from 1800+ sites
- Query AI providers (OpenAI, Anthropic, etc.)
- Connect via FTP, SFTP, Telnet, WebSocket
- Parse GraphQL, JSON-RPC, CSV, YAML, XML
- Analyze HLS streams

## Quick Setup

### One-liner for Claude Code

```bash
claude mcp add recker npx recker@latest mcp
```

That's it! Claude Code now has access to the **minimal** category (7 core tools) by default.

To enable all 65 tools, use `--category=full`.

### Manual Configuration

Add to your AI tool's MCP configuration:

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

**Configuration locations:**
- Claude Code: `~/.claude.json`
- Cursor: MCP settings panel
- Windsurf/Codeium: MCP configuration

## Categories

Use categories to control which tools are available. This helps reduce context size and focus on specific tasks.

### Available Categories

| Category | Tools | Tokens | Description |
|----------|-------|--------|-------------|
| `minimal` | 7 | ~2500 | Core docs + basic network + site audit |
| `docs` | 6 | ~1800 | Documentation and migration tools |
| `network` | 11 | ~3500 | HTTP, DNS, TLS, WHOIS, ping, API tools |
| `dns` | 9 | ~3000 | All DNS tools (propagation, health, SPF, DMARC, DKIM) |
| `security` | 6 | ~2200 | TLS inspection, security headers, GeoIP, domain audit |
| `seo` | 7 | ~2800 | SEO analysis, spider, quick wins, sitemap, schema |
| `scrape` | 2 | ~800 | Web scraping with CSS selectors |
| `video` | 5 | ~1500 | Video/audio extraction (1800+ sites) |
| `ai` | 5 | ~1500 | AI providers (chat, embed, tokens, compare) |
| `protocols` | 7 | ~2100 | FTP, SFTP, Telnet, WebSocket |
| `parsing` | 10 | ~3000 | GraphQL, JSON-RPC, CSV, YAML, XML |
| `streaming` | 3 | ~900 | HLS streaming |
| `full` | 65 | ~18000 | All tools |

### Using Categories

```bash
# Use a single category
rek mcp --category=minimal

# Combine multiple categories
rek mcp --category=minimal,video,ai

# Full category (all 65 tools)
rek mcp --category=full
```

### Claude Code with Category

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

## Available Tools (65)

### Documentation (6 tools)

| Tool | Description |
|------|-------------|
| `rek_search_docs` | Search documentation by keyword (hybrid/fuzzy/semantic) |
| `rek_get_doc` | Get full content of a doc file |
| `rek_code_examples` | Get runnable code examples |
| `rek_api_schema` | Get TypeScript types and interfaces |
| `rek_suggest` | Get implementation suggestions |
| `rek_curl_convert` | Convert curl commands to Recker TypeScript/CLI |

### Network (13 tools)

| Tool | Description |
|------|-------------|
| `rek_http_request` | Make HTTP requests (supports `headersOnly` for lightweight HEAD requests) |
| `rek_ip_lookup` | Get public IP information |
| `rek_dns` | Resolve DNS records (A, AAAA, MX, TXT, NS, ALL) |
| `rek_dns_propagate` | Check DNS propagation globally |
| `rek_dns_health` | Comprehensive DNS health check |
| `rek_dns_spf` | Validate SPF record |
| `rek_dns_dmarc` | Validate DMARC record |
| `rek_dns_dkim` | Check DKIM record |
| `rek_dns_dig` | Advanced DNS lookup (like dig) |
| `rek_dns_system` | Get system DNS configuration |
| `rek_whois` | WHOIS domain/IP lookup |
| `rek_ping` | TCP ping with latency measurement |
| `rek_api_compare` | Compare responses from two API endpoints |

### Utility (3 tools)

| Tool | Description |
|------|-------------|
| `rek_site_audit` | **Quick website audit** - connectivity, SEO, security, TLS, DNS, WHOIS in one call |
| `rek_domain_audit` | Comprehensive domain audit (DNS, TLS, HTTP headers, WHOIS) |
| `rek_load_test` | Simple load test for an API endpoint (max 100 requests) |

### Security (7 tools)

| Tool | Description |
|------|-------------|
| `rek_tls` | Inspect SSL/TLS certificates |
| `rek_tls_inspect` | Detailed TLS connection analysis |
| `rek_rdap` | Modern WHOIS (RDAP) for domains and IPs |
| `rek_rdap_lookup` | RDAP lookup with detailed info |
| `rek_geoip_lookup` | IP geolocation with bogon detection (MaxMind) |
| `rek_security_headers` | Analyze HTTP security headers (grade A+ to F) |
| `rek_dns_toolkit` | Complete DNS security toolkit (SPF, DMARC, DKIM, CAA) |

### Scraping (1 tool)

| Tool | Description |
|------|-------------|
| `rek_scrape` | Web scraping with CSS selectors, tables, forms, JSON-LD |

### SEO (5 tools)

| Tool | Description |
|------|-------------|
| `rek_seo_analyze` | Analyze page SEO with 400+ rules (score 0-100, grade A-F) |
| `rek_seo_spider` | Crawl site and detect duplicates, orphan pages |
| `rek_seo_quick_wins` | Get prioritized SEO fixes (high/medium/low) |
| `rek_seo_sitemap` | Analyze sitemap.xml for SEO issues |
| `rek_seo_schema` | Extract and validate JSON-LD structured data |

### Video (5 tools)

| Tool | Description |
|------|-------------|
| `rek_video_info` | Get video metadata (title, duration, formats) |
| `rek_video_formats` | List all available formats/qualities |
| `rek_video_check` | Check if URL is supported |
| `rek_video_extractors` | List all 1800+ supported sites |
| `rek_video_url` | Get direct download URL |

### AI (5 tools)

| Tool | Description |
|------|-------------|
| `rek_ai_chat` | Chat with AI (OpenAI, Anthropic, etc.) |
| `rek_ai_embed` | Generate text embeddings |
| `rek_ai_providers` | List available AI providers |
| `rek_ai_tokens` | Count tokens for text |
| `rek_ai_compare` | Compare responses from multiple AI providers |

### Protocols (7 tools)

| Tool | Description |
|------|-------------|
| `rek_ftp_connect` | Connect to FTP server and list files |
| `rek_ftp_download` | Download file from FTP server |
| `rek_sftp_connect` | Connect to SFTP server and list files |
| `rek_sftp_download` | Download file from SFTP server |
| `rek_telnet_connect` | Connect to Telnet server |
| `rek_websocket_connect` | Connect to WebSocket and exchange messages |
| `rek_websocket_ping` | Ping WebSocket server |

### Parsing (10 tools)

| Tool | Description |
|------|-------------|
| `rek_graphql_query` | Execute GraphQL query |
| `rek_graphql_introspect` | Introspect GraphQL schema |
| `rek_jsonrpc_call` | Call JSON-RPC method |
| `rek_jsonrpc_batch` | Batch JSON-RPC calls |
| `rek_csv_parse` | Parse CSV to JSON |
| `rek_csv_serialize` | Convert JSON to CSV |
| `rek_yaml_parse` | Parse YAML to JSON |
| `rek_yaml_serialize` | Convert JSON to YAML |
| `rek_xml_parse` | Parse XML to JSON |
| `rek_xml_serialize` | Convert JSON to XML |

### Streaming (3 tools)

| Tool | Description |
|------|-------------|
| `rek_hls_info` | Get HLS stream information |
| `rek_hls_variants` | List HLS quality variants |
| `rek_hls_download` | Download HLS stream |

## Example Usage

Once configured, your AI assistant can help like this:

### Quick Site Audit

```
You: Audit my website https://example.com

AI: [Uses rek_site_audit]

🔍 Site Audit: example.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Grade: B (78/100)

✅ Connectivity: 145ms latency, HTTP 200
✅ TLS: Valid certificate (89 days remaining)
✅ DNS: Cloudflare (A: 104.21.x.x)

⚠️ SEO Issues:
  - Missing meta description
  - H1 tag missing

⚠️ Security:
  - Missing Content-Security-Policy header
  - Missing X-Frame-Options header

📁 Discovery:
  ✅ robots.txt
  ✅ sitemap.xml
  ❌ security.txt (recommended)
```

### Documentation Search

```
You: How do I implement retry logic with recker?

AI: [Uses rek_search_docs]

Based on the docs, here's how to implement retry:

const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    maxAttempts: 3,
    backoff: 'exponential',
    delay: 1000
  }
});
```

### Video Extraction

```
You: Get video info for this YouTube link

AI: [Uses rek_video_info]

Video: "How to Build APIs"
Duration: 12:34
Available formats: 1080p, 720p, 480p, 360p
```

### Compare AI Providers

```
You: Compare how OpenAI and Anthropic answer this question

AI: [Uses rek_ai_compare]

Prompt: "What is machine learning?"

OpenAI (gpt-4o):
  - Latency: 1.2s
  - Tokens: 156
  - Response: "Machine learning is a subset of AI..."

Anthropic (claude-sonnet-4-20250514):
  - Latency: 0.9s
  - Tokens: 142
  - Response: "Machine learning refers to..."
```

## Transport Modes

| Mode | Use Case | Command |
|------|----------|---------|
| stdio | Claude Code, Cursor | `rek mcp` |
| http | Web integrations | `rek mcp -t http -p 3100` |
| sse | Real-time apps | `rek mcp -t sse -p 3100` |

## AI Tools Support

| Tool | Transport | Config Location |
|------|-----------|-----------------|
| Claude Code | stdio | `~/.claude.json` |
| Cursor | stdio | MCP settings |
| Windsurf | stdio | MCP config |
| OpenAI Codex | http | API config |
| Google Gemini | http | MCP config |
| xAI Grok | sse | MCP config |

## Learn More

For complete documentation, see the AI section:

- [MCP Server (Full Docs)](/ai/07-mcp-server.md) - Complete server reference
- [MCP Client](/ai/06-mcp-client.md) - Connect to other MCP servers
- [AI Patterns](/ai/04-patterns.md) - Common AI integration patterns
- [AI Providers](/ai/03-providers.md) - OpenAI, Anthropic, etc.

## Next Steps

- [CLI Overview](/getting-started/cli.md) - Terminal workstation
- [HTTP Fundamentals](/http/02-fundamentals.md)

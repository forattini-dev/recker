# MCP Server

Recker includes a built-in MCP Server that exposes documentation, network, security, scraping, and SEO tools to AI agents like Claude Code, Cursor, and other AI-powered tools.

> **TL;DR**: Run `rek mcp` and add the configuration to your AI tool to get access to 18 powerful tools.

## Quick Start

### CLI Usage

```bash
# Start in stdio mode (for Claude Code, Cursor)
rek mcp

# Start HTTP server
rek mcp transport=http port=3100

# Start with SSE support
rek mcp transport=sse port=3100

# Enable debug logging
rek mcp debug
```

### Tool Filtering

Control which tools are available to AI agents using command-line options:

```bash
# Disable documentation tools (search, get, examples, schema, suggest)
rek mcp nodocs

# Disable HTTP request tool
rek mcp nohttp

# Disable all network tools (http, dns, whois, ping)
rek mcp nonetwork

# Disable security tools (tls, rdap, geoip, security headers, dns toolkit)
rek mcp nosecurity

# Disable SEO tools (analyze, spider, quick wins)
rek mcp noseo

# Disable scraping tool
rek mcp noscrape

# Disable specific tools
rek mcp nodns nowhois

# Only enable specific tools (exclusive mode)
rek mcp only=rek_search_docs,rek_get_doc,rek_seo_analyze

# Custom filter patterns (glob-style)
rek mcp filter="rek_*_docs,!rek_http_*"
```

**Available Options:**

| Option | Effect |
|--------|--------|
| `nodocs` | Disable `rek_search_docs`, `rek_get_doc`, `rek_code_examples`, `rek_api_schema`, `rek_suggest` |
| `nohttp` | Disable `rek_http_request` |
| `nodns` | Disable `rek_dns_lookup` |
| `nowhois` | Disable `rek_whois_lookup` |
| `noping` | Disable `rek_network_ping` |
| `nonetwork` | Disable all network tools (http, dns, whois, ping) |
| `nosecurity` | Disable all security tools (tls, rdap, geoip, security headers, dns toolkit) |
| `noseo` | Disable all SEO tools (analyze, spider, quick wins) |
| `noscrape` | Disable `rek_scrape` |
| `only=<tools>` | Only enable specified tools (comma-separated) |
| `filter=<patterns>` | Custom glob patterns (prefix with `!` to exclude) |

**Use Cases:**

```bash
# Documentation-only mode (no network operations)
rek mcp nonetwork nosecurity noseo noscrape

# Network tools only (no docs, for testing)
rek mcp nodocs nosecurity noseo noscrape

# SEO audit mode
rek mcp only=rek_seo_analyze,rek_seo_spider,rek_seo_quick_wins,rek_scrape

# Minimal mode for security-conscious environments
rek mcp only=rek_search_docs,rek_get_doc
```

### Programmatic Usage

```typescript
import { createMCPServer } from 'recker/mcp';

const server = createMCPServer({
  transport: 'http',
  port: 3100
});

await server.start();
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

Or with a local installation:

```json
{
  "mcpServers": {
    "recker": {
      "command": "rek",
      "args": ["mcp"]
    }
  }
}
```

### Cursor IDE

Add to your Cursor MCP settings:

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

### OpenAI Codex / ChatGPT

Start the HTTP server and configure:

```bash
rek mcp transport=http port=3100
```

```json
{
  "tools": [
    {
      "type": "mcp",
      "mcp": {
        "url": "http://localhost:3100",
        "transport": "http"
      }
    }
  ]
}
```

### Google Gemini

```bash
rek mcp transport=http port=3100
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

### xAI Grok

```bash
rek mcp transport=sse port=3100
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

### Generic HTTP Integration

For any AI tool that supports HTTP endpoints:

```bash
curl -X POST http://localhost:3100 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "search_docs",
      "arguments": { "query": "retry" }
    }
  }'
```

## Available Tools

The MCP Server provides **18 tools** organized in five categories. All tools use the `rek_` prefix for consistency.

| Tool | Category | Description |
|------|----------|-------------|
| `rek_search_docs` | Documentation | Search Recker docs by keyword (hybrid/fuzzy/semantic) |
| `rek_get_doc` | Documentation | Get full content of a doc file |
| `rek_code_examples` | Documentation | Get runnable code examples |
| `rek_api_schema` | Documentation | Get TypeScript types and interfaces |
| `rek_suggest` | Documentation | Get implementation suggestions |
| `rek_http_request` | Network | Perform HTTP requests (GET, POST, PUT, DELETE, etc.) |
| `rek_dns_lookup` | Network | Resolve DNS records (A, AAAA, MX, TXT, NS, ALL) |
| `rek_whois_lookup` | Network | WHOIS lookup for domains/IPs |
| `rek_network_ping` | Network | TCP ping with latency measurement |
| `rek_tls_inspect` | Security | Inspect SSL/TLS certificates and connections |
| `rek_rdap_lookup` | Security | Modern WHOIS (RDAP) for domains and IPs |
| `rek_geoip_lookup` | Security | IP geolocation with bogon detection (MaxMind) |
| `rek_security_headers` | Security | Analyze HTTP security headers (grade A+ to F) |
| `rek_dns_toolkit` | Security | DNS security analysis (SPF, DMARC, DKIM, CAA) |
| `rek_scrape` | Scraping | Web scraping with CSS selectors |
| `rek_seo_analyze` | SEO | Analyze page SEO with 250+ rules (21 categories) |
| `rek_seo_spider` | SEO | Crawl site and detect duplicates, orphan pages |
| `rek_seo_quick_wins` | SEO | Get prioritized SEO fixes (high/medium/low) |

### Documentation Tools

Tools for searching and reading Recker documentation.

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

**Parameters:**
- `path` (required): Documentation file path from search results

#### rek_code_examples

Get runnable code examples for Recker features:

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

**Parameters:**
- `feature` (required): Feature to get examples for
- `complexity` (optional): Complexity level - basic, intermediate, advanced
- `limit` (optional): Max examples to return

#### rek_api_schema

Get TypeScript types, interfaces, and API schemas:

```json
{
  "name": "rek_api_schema",
  "arguments": {
    "type": "ClientOptions",
    "include": "both"
  }
}
```

**Parameters:**
- `type` (required): Type/interface name to look up
- `include` (optional): What to include - definition, properties, or both

#### rek_suggest

Get implementation suggestions based on use case:

```json
{
  "name": "rek_suggest",
  "arguments": {
    "useCase": "I need to retry failed requests with exponential backoff",
    "constraints": ["must support custom retry conditions", "need rate limiting"]
  }
}
```

**Parameters:**
- `useCase` (required): Description of what you want to achieve
- `constraints` (optional): Array of constraints or requirements

### Network Tools

Tools for performing network operations directly from the AI agent.

#### rek_http_request

Perform an HTTP request to any URL:

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
- `url` (required): Target URL
- `method` (optional): HTTP method - GET, POST, PUT, DELETE, PATCH, HEAD (default: GET)
- `headers` (optional): Request headers object
- `body` (optional): JSON body for POST/PUT/PATCH
- `timeout` (optional): Timeout in milliseconds (default: 10000)
- `retries` (optional): Number of retries (default: 0)

#### rek_dns_lookup

Resolve DNS records for a domain:

```json
{
  "name": "rek_dns_lookup",
  "arguments": {
    "domain": "example.com",
    "type": "MX"
  }
}
```

**Parameters:**
- `domain` (required): Domain name to resolve
- `type` (optional): Record type - A, AAAA, MX, TXT, NS, CNAME, SOA, ALL (default: A)

#### rek_whois_lookup

Perform a WHOIS lookup for domain registration info:

```json
{
  "name": "rek_whois_lookup",
  "arguments": {
    "query": "github.com"
  }
}
```

**Parameters:**
- `query` (required): Domain name or IP address to lookup

#### rek_network_ping

Check TCP connectivity and measure latency:

```json
{
  "name": "rek_network_ping",
  "arguments": {
    "host": "google.com",
    "port": 443,
    "count": 5
  }
}
```

**Parameters:**
- `host` (required): Hostname or IP address
- `port` (optional): Target port (default: 80)
- `count` (optional): Number of pings (default: 3)
- `timeout` (optional): Timeout per ping in milliseconds (default: 5000)

**Response:**
```json
{
  "host": "google.com",
  "port": 443,
  "sent": 5,
  "received": 5,
  "loss": "0.0%",
  "avgLatency": "12.45ms",
  "details": [
    { "seq": 1, "time": 11 },
    { "seq": 2, "time": 13 },
    { "seq": 3, "time": 12 }
  ]
}
```

### Security Tools

Tools for security analysis and network intelligence.

#### rek_tls_inspect

Inspect SSL/TLS certificate and connection details:

```json
{
  "name": "rek_tls_inspect",
  "arguments": {
    "host": "github.com",
    "port": 443
  }
}
```

**Parameters:**
- `host` (required): Hostname to inspect
- `port` (optional): Port number (default: 443)

**Response includes:**
- Certificate validity and expiration (days remaining)
- Subject and issuer details
- Subject Alternative Names (SANs)
- TLS protocol version and cipher suite
- Public key algorithm and size
- Warnings for expiring certs, weak keys, or trust issues

#### rek_rdap_lookup

Perform RDAP lookup (modern WHOIS) for a domain or IP:

```json
{
  "name": "rek_rdap_lookup",
  "arguments": {
    "query": "google.com"
  }
}
```

**Parameters:**
- `query` (required): Domain name or IP address

**Note:** Some TLDs (.io, .ai, etc.) don't support RDAP yet - use `rek_whois_lookup` for those.

#### rek_geoip_lookup

Get geolocation data for an IP address using MaxMind GeoLite2:

```json
{
  "name": "rek_geoip_lookup",
  "arguments": {
    "ip": "8.8.8.8"
  }
}
```

**Parameters:**
- `ip` (required): IPv4 or IPv6 address

**Response includes:**
- City, region, country, continent
- Coordinates (latitude, longitude)
- Timezone and postal code
- Accuracy radius
- Bogon detection (identifies private/reserved IPs)

#### rek_security_headers

Analyze HTTP security headers for a URL:

```json
{
  "name": "rek_security_headers",
  "arguments": {
    "url": "https://github.com"
  }
}
```

**Parameters:**
- `url` (required): URL to analyze

**Grades (A+ to F) based on:**
- HSTS (Strict-Transport-Security)
- CSP (Content-Security-Policy) with detailed analysis
- X-Frame-Options / frame-ancestors
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy
- Cross-Origin policies (COOP, COEP, CORP)
- Information leakage (Server, X-Powered-By)

#### rek_dns_toolkit

Advanced DNS security analysis for email authentication:

```json
{
  "name": "rek_dns_toolkit",
  "arguments": {
    "domain": "github.com",
    "check": "all"
  }
}
```

**Parameters:**
- `domain` (required): Domain to analyze
- `check` (optional): Which check to run - all, health, spf, dmarc, dkim, records (default: all)
- `dkimSelector` (optional): Specific DKIM selector to check

**Checks include:**
- SPF validation (syntax, lookup count, mechanisms)
- DMARC validation (policy, reporting, alignment)
- DKIM discovery (tries common selectors)
- CAA records (certificate authority authorization)
- MX records
- Overall DNS health score

### Scraping Tools

Tools for web scraping and data extraction.

#### rek_scrape

Scrape a web page and extract data using CSS selectors:

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

**Parameters:**
- `url` (required): URL to scrape
- `selector` (optional): Single CSS selector to extract elements
- `selectors` (optional): Map of field names to CSS selectors (add `[]` suffix for multiple values)
- `extract` (optional): Built-in extractors to run: links, images, meta, og, twitter, jsonld, tables, forms, headings, all

**Examples:**
- Get all product titles: `selector: ".product-title"`
- Extract multiple fields: `selectors: {"title":"h1","price":".price"}`
- Full extraction: `extract: ["all"]`

### SEO Tools

Tools for SEO analysis and optimization.

#### rek_seo_analyze

Analyze a single web page for SEO issues using 250+ rules across 21 categories:

```json
{
  "name": "rek_seo_analyze",
  "arguments": {
    "url": "https://example.com",
    "categories": ["meta", "content", "performance"]
  }
}
```

**Parameters:**
- `url` (required): URL to analyze (works with localhost too)
- `categories` (optional): Filter by specific categories

**Categories:** meta, content, links, images, technical, security, performance, mobile, accessibility, schema, structural, i18n, PWA, social, e-commerce, local SEO, Core Web Vitals, readability, crawlability, internal linking, best practices

**Response includes:**
- SEO score (0-100) and grade (A-F)
- Critical issues and warnings with recommendations
- OpenGraph/social meta analysis
- Detailed analysis (title, description, headings, content, links, images, technical)

#### rek_seo_spider

Crawl an entire website and analyze SEO across all pages:

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

**Parameters:**
- `url` (required): Starting URL to crawl
- `maxPages` (optional): Maximum pages to crawl (default: 100)
- `maxDepth` (optional): Maximum link depth to follow (default: 5)
- `concurrency` (optional): Parallel requests (default: 3)

**Detects site-wide issues:**
- Duplicate titles, descriptions, and H1s
- Orphan pages (no internal links pointing to them)
- Pages with low SEO scores
- Crawl errors

#### rek_seo_quick_wins

Get prioritized, actionable SEO improvements for a page:

```json
{
  "name": "rek_seo_quick_wins",
  "arguments": {
    "url": "https://example.com",
    "limit": 10
  }
}
```

**Parameters:**
- `url` (required): URL to analyze
- `limit` (optional): Maximum number of quick wins to return (default: 10)

**Response includes issues sorted by priority (high/medium/low) with:**
- What to fix
- How to fix it
- Expected impact
- Category

## How It Works

Once configured, your AI assistant can use these tools autonomously.

### Documentation Example

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

### Network Tools Example

```
User: Check if api.github.com is reachable and get its DNS records

AI: Let me check the connectivity and DNS...
[Uses rek_network_ping with host "api.github.com", port 443]
[Uses rek_dns_lookup with domain "api.github.com", type "A"]

Results:
- TCP ping to api.github.com:443 - 5/5 successful, avg latency 15.2ms
- DNS A records: 140.82.121.6

The API is reachable with low latency.
```

```
User: Make a GET request to https://httpbin.org/json

AI: [Uses rek_http_request with url "https://httpbin.org/json"]

Response (200 OK):
{
  "slideshow": {
    "author": "Yours Truly",
    "title": "Sample Slideshow"
  }
}
```

### SEO Analysis Example

```
User: Analyze my site's SEO at https://mysite.com

AI: Let me run an SEO analysis...
[Uses rek_seo_analyze with url "https://mysite.com"]

SEO Analysis Results:
- Score: 72/100 (Grade: C)
- 3 critical issues found
- 8 warnings

Critical Issues:
1. Missing meta description - Add a unique description (150-160 chars)
2. Multiple H1 tags - Use only one H1 per page
3. Images missing alt text - Add descriptive alt attributes

Would you like me to get prioritized quick wins or crawl the entire site?

User: Yes, get the quick wins

AI: [Uses rek_seo_quick_wins with url "https://mysite.com"]

Top SEO Quick Wins (High Priority):
1. Add meta description → Improves CTR in search results
2. Fix H1 structure → Better semantic hierarchy
3. Add alt text to 5 images → Accessibility + image SEO
```

### Security Analysis Example

```
User: Check the security headers for github.com

AI: [Uses rek_security_headers with url "https://github.com"]
[Uses rek_tls_inspect with host "github.com"]

Security Analysis:
- Security Headers Grade: A
- TLS Certificate: Valid, expires in 89 days
- Protocol: TLS 1.3, Cipher: AES-256-GCM

Headers Present:
✓ Strict-Transport-Security (HSTS)
✓ Content-Security-Policy
✓ X-Content-Type-Options
✓ X-Frame-Options

No critical issues found. The site follows security best practices.
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

  // Documentation paths
  docsPath?: string;      // Default: auto-detected
  examplesPath?: string;  // Default: auto-detected
  srcPath?: string;       // Default: auto-detected

  // Tool filtering
  toolsFilter?: string[];  // Glob patterns for tool filtering
  toolPaths?: string[];    // External tool module paths

  // Debugging
  debug?: boolean;      // Default: false
}
```

**Tool Filtering Examples (Programmatic):**

```typescript
import { createMCPServer } from 'recker/mcp';

// Disable network tools
const server = createMCPServer({
  toolsFilter: ['!rek_http_request', '!rek_dns_lookup', '!rek_whois_lookup', '!rek_network_ping']
});

// Only enable documentation tools
const docsOnly = createMCPServer({
  toolsFilter: ['rek_search_docs', 'rek_get_doc', 'rek_code_examples']
});

// Exclude HTTP but keep DNS
const customServer = createMCPServer({
  toolsFilter: ['!rek_http_*']  // Glob pattern
});
```

## Custom Documentation

Serve your own project's documentation:

```bash
rek mcp docs=/path/to/your/docs
```

```typescript
const server = createMCPServer({
  docsPath: '/path/to/your/docs',
  name: 'my-project-docs'
});
```

## Docker Deployment

Run the MCP server in Docker for remote access:

```dockerfile
FROM node:20-alpine
RUN npm install -g recker
EXPOSE 3100
CMD ["rek", "mcp", "transport=http", "port=3100"]
```

```bash
docker build -t recker-mcp .
docker run -p 3100:3100 recker-mcp
```

Configure your AI tool to connect remotely:

```json
{
  "mcpServers": {
    "recker": {
      "transport": "http",
      "url": "http://your-server:3100"
    }
  }
}
```

## Health Check (SSE Mode)

```bash
curl http://localhost:3100/health
```

```json
{
  "status": "ok",
  "name": "recker",
  "version": "1.0.0",
  "docsCount": 58,
  "sseClients": 2
}
```

## JSON-RPC Methods

| Method | Description |
|--------|-------------|
| `initialize` | Initialize connection |
| `ping` | Health check |
| `tools/list` | List available tools |
| `tools/call` | Execute a tool |
| `resources/list` | List resources (empty) |
| `prompts/list` | List prompts (empty) |

## Next Steps

- **[MCP Client](05-mcp-client.md)** - Connect to other MCP servers
- **[AI Patterns](04-patterns.md)** - Common AI integration patterns

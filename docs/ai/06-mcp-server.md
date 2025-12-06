# MCP Server

Recker includes a built-in MCP Server that exposes documentation to AI agents like Claude Code, Cursor, and other AI-powered tools.

> **TL;DR**: Run `rek mcp` and add the configuration to your AI tool to get Recker documentation assistance.

## Quick Start

### CLI Usage

```bash
# Start in stdio mode (for Claude Code, Cursor)
rek mcp

# Start HTTP server
rek mcp -t http -p 3100

# Start with SSE support
rek mcp -t sse -p 3100

# Enable debug logging
rek mcp --debug
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
claude mcp add recker-docs npx recker@latest mcp
```

Or add manually to `~/.claude.json`:

```json
{
  "mcpServers": {
    "recker-docs": {
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
    "recker-docs": {
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
    "recker-docs": {
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
    "recker-docs": {
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
rek mcp -t http -p 3100
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
rek mcp -t http -p 3100
```

```json
{
  "mcpServers": {
    "recker-docs": {
      "transport": "http",
      "url": "http://localhost:3100"
    }
  }
}
```

### xAI Grok

```bash
rek mcp -t sse -p 3100
```

```json
{
  "mcpServers": {
    "recker-docs": {
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

The MCP Server provides **10 tools** organized in two categories. All tools use the `rek_` prefix for consistency.

| Tool | Category | Description |
|------|----------|-------------|
| `rek_search_docs` | Documentation | Search Recker docs by keyword |
| `rek_get_doc` | Documentation | Get full content of a doc file |
| `rek_code_examples` | Documentation | Get runnable code examples |
| `rek_api_schema` | Documentation | Get TypeScript types and interfaces |
| `rek_suggest` | Documentation | Get implementation suggestions |
| `rek_ip_lookup` | Network | IP geolocation lookup |
| `rek_http_request` | Network | Perform HTTP requests (GET, POST, etc.) |
| `rek_dns_lookup` | Network | Resolve DNS records (A, MX, TXT, etc.) |
| `rek_whois_lookup` | Network | WHOIS lookup for domains/IPs |
| `rek_network_ping` | Network | TCP ping with latency measurement |

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

#### rek_ip_lookup

Get geolocation and network information for an IP address:

```json
{
  "name": "rek_ip_lookup",
  "arguments": {
    "ip": "8.8.8.8"
  }
}
```

**Parameters:**
- `ip` (required): IPv4 or IPv6 address

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

## Configuration Options

```typescript
interface MCPServerOptions {
  // Server identification
  name?: string;        // Default: 'recker-docs'
  version?: string;     // Default: '1.0.0'

  // Transport
  transport?: 'stdio' | 'http' | 'sse';  // Default: 'stdio'
  port?: number;        // Default: 3100 (for http/sse)

  // Documentation
  docsPath?: string;    // Default: auto-detected

  // Debugging
  debug?: boolean;      // Default: false
}
```

## Custom Documentation

Serve your own project's documentation:

```bash
rek mcp -d /path/to/your/docs
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
CMD ["rek", "mcp", "-t", "http", "-p", "3100"]
```

```bash
docker build -t recker-mcp .
docker run -p 3100:3100 recker-mcp
```

Configure your AI tool to connect remotely:

```json
{
  "mcpServers": {
    "recker-docs": {
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
  "name": "recker-docs",
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

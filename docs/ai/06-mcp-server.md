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

The MCP Server provides 2 focused tools to minimize context usage:

### search_docs

Search documentation by keyword:

```json
{
  "name": "search_docs",
  "arguments": {
    "query": "retry",
    "category": "http",
    "limit": 5
  }
}
```

**Parameters:**
- `query` (required): Search keywords
- `category` (optional): Filter by category (http, cli, ai, protocols, reference, guides)
- `limit` (optional): Max results (default: 5, max: 10)

### get_doc

Get full content of a documentation file:

```json
{
  "name": "get_doc",
  "arguments": {
    "path": "http/07-resilience.md"
  }
}
```

**Parameters:**
- `path` (required): Documentation file path from search results

## How It Works

Once configured, your AI assistant can search and read Recker documentation:

```
User: How do I implement retry logic with recker?

AI: Let me search the documentation...
[Uses search_docs tool with query "retry"]

I found relevant documentation. Let me read the full content...
[Uses get_doc tool with path "http/07-resilience.md"]

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

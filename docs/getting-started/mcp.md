# MCP Server Overview

Recker includes a built-in MCP (Model Context Protocol) server that exposes documentation and network tools to AI assistants like Claude Code, Cursor, and other AI-powered tools.

## What is MCP?

MCP is a standard protocol for connecting AI models to external tools and data sources. With Recker's MCP server, your AI assistant can:

- Search and read Recker documentation
- Get code examples and API schemas
- Make HTTP requests, DNS lookups, WHOIS queries
- Ping servers and check connectivity

## Quick Setup

### One-liner for Claude Code

```bash
claude mcp add recker-docs npx recker@latest mcp
```

That's it! Claude Code now has access to Recker documentation and network tools.

### Manual Configuration

Add to your AI tool's MCP configuration:

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

**Configuration locations:**
- Claude Code: `~/.claude.json`
- Cursor: MCP settings panel
- Windsurf/Codeium: MCP configuration

## Available Tools

The MCP server provides 10 tools in two categories:

### Documentation Tools

| Tool | Description |
|------|-------------|
| `rek_search_docs` | Search documentation by keyword |
| `rek_get_doc` | Get full content of a doc file |
| `rek_code_examples` | Get runnable code examples |
| `rek_api_schema` | Get TypeScript types and interfaces |
| `rek_suggest` | Get implementation suggestions |

### Network Tools

| Tool | Description |
|------|-------------|
| `rek_http_request` | Make HTTP requests |
| `rek_dns_lookup` | Resolve DNS records |
| `rek_whois_lookup` | WHOIS domain lookup |
| `rek_network_ping` | TCP ping with latency |
| `rek_ip_lookup` | IP geolocation |

## Example Usage

Once configured, your AI assistant can help like this:

```
You: How do I implement retry logic with recker?

AI: Let me search the documentation...
[Uses rek_search_docs]

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

## Transport Modes

| Mode | Use Case | Command |
|------|----------|---------|
| stdio | Claude Code, Cursor | `rek mcp` |
| http | Web integrations | `rek mcp -t http -p 3100` |
| sse | Real-time apps | `rek mcp -t sse -p 3100` |

## Tool Filtering

Control which tools are available:

```bash
# Documentation only (no network operations)
rek mcp --no-network

# Network tools only
rek mcp --no-docs

# Specific tools only
rek mcp --only rek_search_docs,rek_get_doc
```

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

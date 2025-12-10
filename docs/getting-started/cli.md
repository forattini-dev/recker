# CLI Overview

The `rek` CLI is your complete API workstation in the terminal. It's designed to be more intuitive than cURL while offering powerful features like AI chat, load testing, and built-in mock servers.

## Quick Demo

```bash
# No install needed - try it now
npx recker@latest httpbin.org/json
```

## Why `rek` Over cURL?

| Task | cURL | rek |
|------|------|-----|
| Simple GET | `curl https://api.com/data` | `rek api.com/data` |
| POST JSON | `curl -X POST -H "Content-Type: application/json" -d '{"a":1}'` | `rek api.com a=1` |
| Headers | `-H "Auth: Bearer token"` | `Auth:"Bearer token"` |
| Native types | Manual escaping | `count:=42 active:=true` |
| Pipe output | `curl -s url \| bash` | `rek -q url \| bash` |

Plus features cURL doesn't have:
- JSON syntax highlighting
- Interactive shell (REPL)
- Built-in load testing
- AI chat integration
- WebSocket support
- Mock servers for testing

## Installation

```bash
# Global install (recommended for frequent use)
pnpm add -g recker

# Or use npx (always latest)
npx recker@latest
```

## Common Commands

### HTTP Requests

```bash
# GET request (https is automatic)
rek httpbin.org/json

# POST with JSON (inferred by =)
rek httpbin.org/post name="John" email="john@test.com"

# Native types with :=
rek api.com/users count:=10 active:=true

# Headers (inferred by :)
rek api.com Authorization:"Bearer token123"

# Save response to file
rek -o data.json api.com/export

# Verbose mode (see headers)
rek -v api.com/debug
```

### Interactive Shell

```bash
rek shell
```

Provides a REPL environment with history, tab completion, and persistent connections.

### Mock Servers

```bash
# HTTP mock server
rek serve http

# WebSocket mock server
rek serve ws

# HLS streaming mock
rek serve hls

# DNS mock server
rek serve dns
```

### AI Chat

```bash
# Chat with OpenAI/Anthropic
rek ai "Explain the retry pattern"
```

### Load Testing

```bash
# Benchmark an endpoint
rek bench load api.com/endpoint users=50 duration=30
```

## CLI Options

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Show full request/response details |
| `-q, --quiet` | Output only response body (for piping) |
| `-o, --output <file>` | Write response to file |
| `-j, --json` | Force JSON content-type |
| `-e, --env [path]` | Load .env file |

## Learn More

For complete documentation, see the CLI section:

- [Quick Start](/cli/02-quick-start.md) - Syntax details and examples
- [Interactive Shell](/cli/03-shell.md) - REPL environment
- [AI Chat](/cli/04-ai-chat.md) - LLM integration
- [Load Testing](/cli/05-load-testing.md) - Benchmarking APIs
- [Protocols](/cli/06-protocols.md) - WebSocket, UDP support
- [Presets](/cli/07-presets.md) - Quick access to popular APIs
- [Mock Servers](/cli/08-mock-servers.md) - Built-in test servers

## Next Steps

- [MCP Server](/getting-started/mcp.md) - Integrate with AI tools
- [HTTP Fundamentals](/http/02-fundamentals.md)

# The Recker CLI (`rek`)

The `rek` CLI is not just an alternative to cURL. It's a **complete API Workstation** living in your terminal. It's designed to be intuitive, visual, and powerful, supporting everything from simple HTTP calls to complex load tests with real-time dashboards.

## Why use `rek`?

| Feature | cURL | rek |
|---------|------|-----|
| Simple GET | `curl https://api.com/data` | `rek api.com/data` |
| POST JSON | `curl -X POST -H "Content-Type: application/json" -d '{"a":1}'` | `rek api.com a=1` |
| Headers | `-H "Auth: Bearer token"` | `Auth:"Bearer token"` |
| Native types | Manual escaping | `count:=42 active:=true` |
| Syntax highlighting | No | Yes (JSON, XML) |
| Interactive mode | No | Full REPL shell |
| Load testing | No | Built-in dashboard |
| AI Chat | No | OpenAI/Anthropic integration |
| WebSocket | Requires `wscat` | Native support |

## Installation

```bash
# npm
npm install -g recker

# pnpm
pnpm add -g recker

# yarn
yarn global add recker
```

After installation, the `rek` command will be available globally.

## Verifying Installation

```bash
rek --version
# Output: 1.0.5

rek --help
```

## Shell Completion

Enable tab completion for bash/zsh:

```bash
# Add to your shell config
rek completion >> ~/.bashrc  # or ~/.zshrc

# Or source directly
source <(rek completion)
```

After reloading your shell, you'll get completions for:
- HTTP methods (GET, POST, PUT, etc.)
- Presets (@github, @openai, etc.)
- Options (-v, --verbose, -j, --json)

## Quick Overview

```bash
# Simple GET (https is automatic)
rek httpbin.org/json

# POST with JSON body (inferred by '=')
rek httpbin.org/post name="Cyber" role="Admin"

# Native types with ':='
rek api.com/users count:=10 active:=true

# Headers (inferred by ':')
rek api.com/secure Authorization:"Bearer token123"

# WebSocket connection
rek wss://echo.websocket.org

# Interactive shell
rek shell

# Load testing
rek bench load api.com/endpoint users=50 duration=30
```

## CLI Options

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Show full request/response details including headers |
| `-j, --json` | Force Content-Type and Accept headers to application/json |
| `-h, --help` | Display help information |
| `-V, --version` | Display version number |

## Next Steps

- **[Quick Start](02-quick-start.md)** - Learn the syntax in detail
- **[Interactive Shell](03-shell.md)** - Master the REPL environment
- **[AI Chat](04-ai-chat.md)** - Chat with LLMs from terminal
- **[Load Testing](05-load-testing.md)** - Benchmark your APIs
- **[Protocols](06-protocols.md)** - WebSocket, UDP support
- **[Presets](07-presets.md)** - Quick access to popular APIs

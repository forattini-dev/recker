# Documentation Restructure Roadmap

> **Temporary file** - Reference for documentation restructure work.
> Delete after completion.

## Overview

Reorganize Recker documentation into three main verticals:
- **A) HTTP** - From zero to advanced
- **B) AI & LLM** - AI Layer, MCP, abstractions
- **C) Protocols** - All non-HTTP protocols

## New Structure

### A) HTTP Vertical (Progressive Complexity)

```
docs/http/
├── 01-quickstart.md        # 5min to first request
├── 02-fundamentals.md      # Methods, params, headers, errors
├── 03-responses.md         # Parsing, streaming, downloads, uploads
├── 04-validation.md        # Contracts, Zod, type-safety
├── 05-configuration.md     # Client config, hooks, interceptors
├── 06-performance.md       # Pooling, HTTP/2, compression, DNS
├── 07-resilience.md        # Retry, circuit breaker, rate limiting
├── 08-concurrency.md       # Batch, parallel, queue, priority
├── 09-cache.md             # Memory, file, Redis, RFC 7234, dedup
├── 10-plugins.md           # Architecture, built-in, custom
├── 11-specialties.md       # Scraping, GraphQL, SOAP, JSON-RPC
└── 12-observability.md     # Debug, timings, logging
```

### B) AI & LLM Vertical

```
docs/ai/
├── 01-overview.md          # Why AI-first, architecture
├── 02-ai-layer.md          # Chat, streaming, embeddings, tools
├── 03-providers.md         # OpenAI, Anthropic, future providers
├── 04-optimization.md      # Timeouts, rate limiting, fallbacks
├── 05-mcp.md               # What is MCP, creating servers, tools
└── 06-agents.md            # Future: agent framework
```

### C) Protocols Vertical

```
docs/protocols/
├── 01-overview.md          # Supported protocols, when to use
├── 02-udp.md               # UDP transport, broadcast, multicast
├── 03-dns.md               # DNS resolver, DoH, DoT
├── 04-websocket.md         # WS connection, messages, reconnect
├── 05-telnet.md            # Telnet client, automation
├── 06-ftp.md               # FTP/SFTP, uploads, downloads
├── 07-whois.md             # Domain/IP lookup, RDAP
├── 08-ping.md              # ICMP, latency, diagnostics
├── 09-grpc.md              # gRPC-Web, protobuf
├── 10-dtls.md              # Future: secure UDP
├── 11-webrtc.md            # Future: peer connections
└── 12-quic.md              # Future: HTTP/3
```

### D) Reference & Extras

```
docs/reference/
├── api.md                  # Full API reference
├── recipes.md              # Copy-paste examples
├── testing.md              # MockTransport, MockUDP, HAR
├── presets.md              # GitHub, Stripe, AWS presets
├── security.md             # TLS, proxies, SSRF
├── migration.md            # From axios, got, fetch
└── troubleshooting.md      # Common errors, FAQ
```

## New Sidebar Structure

```markdown
- **🚀 Getting Started**
  - [Installation](getting-started/installation.md)
  - [Quick Start](http/01-quickstart.md)
  - [Why Recker?](getting-started/why-recker.md)

- **📡 HTTP**
  - [Fundamentals](http/02-fundamentals.md)
  - [Responses & Data](http/03-responses.md)
  - [Validation & Contracts](http/04-validation.md)
  - [Configuration](http/05-configuration.md)
  - [Performance](http/06-performance.md)
  - [Resilience](http/07-resilience.md)
  - [Concurrency & Batch](http/08-concurrency.md)
  - [Caching](http/09-cache.md)
  - [Plugins](http/10-plugins.md)
  - [Specialties](http/11-specialties.md)
  - [Observability](http/12-observability.md)

- **🤖 AI & LLM**
  - [Overview](ai/01-overview.md)
  - [AI Layer](ai/02-ai-layer.md)
  - [Providers](ai/03-providers.md)
  - [Optimization](ai/04-optimization.md)
  - [MCP](ai/05-mcp.md)

- **🔌 Protocols**
  - [Overview](protocols/01-overview.md)
  - [UDP](protocols/02-udp.md)
  - [DNS](protocols/03-dns.md)
  - [WebSocket](protocols/04-websocket.md)
  - [Telnet](protocols/05-telnet.md)
  - [FTP/SFTP](protocols/06-ftp.md)
  - [WHOIS & RDAP](protocols/07-whois.md)
  - [Ping/ICMP](protocols/08-ping.md)
  - [gRPC-Web](protocols/09-grpc.md)

- **📚 Reference**
  - [API Reference](reference/api.md)
  - [Recipes & Examples](reference/recipes.md)
  - [Testing](reference/testing.md)
  - [Presets](reference/presets.md)
  - [Security](reference/security.md)
  - [Migration](reference/migration.md)
  - [Troubleshooting](reference/troubleshooting.md)

- **📖 Resources**
  - [Benchmarks](benchmarks.md)
  - [Changelog](changelog.md)
  - [Contributing](contributing.md)
```

## Implementation Order

### Phase 1: Structure Setup
- [x] Create roadmap file
- [ ] Create new directory structure
- [ ] Create new _sidebar.md

### Phase 2: HTTP Vertical (Priority)
- [ ] 01-quickstart.md (merge installation + quickstart)
- [ ] 02-fundamentals.md (methods, params, headers, basic errors)
- [ ] 03-responses.md (parsing, streaming, downloads)
- [ ] 04-validation.md (contracts, Zod)
- [ ] 05-configuration.md (client config, hooks)
- [ ] 06-performance.md (pooling, HTTP/2, compression)
- [ ] 07-resilience.md (retry, circuit breaker)
- [ ] 08-concurrency.md (batch, parallel)
- [ ] 09-cache.md (all caching strategies)
- [ ] 10-plugins.md (plugin architecture)
- [ ] 11-specialties.md (scraping, GraphQL, SOAP)
- [ ] 12-observability.md (debug, metrics)

### Phase 3: AI Vertical
- [ ] 01-overview.md (why AI-first)
- [ ] 02-ai-layer.md (move/improve existing ai.md)
- [ ] 03-providers.md (OpenAI, Anthropic details)
- [ ] 04-optimization.md (timeouts, rate limiting)
- [ ] 05-mcp.md (MCP explanation and usage)

### Phase 4: Protocols Vertical
- [ ] 01-overview.md (protocol comparison)
- [ ] 02-udp.md (UDP documentation)
- [ ] 03-dns.md (DNS features)
- [ ] 04-websocket.md (WebSocket guide)
- [ ] 05-telnet.md (Telnet client)
- [ ] 06-ftp.md (FTP/SFTP)
- [ ] 07-whois.md (WHOIS/RDAP)
- [ ] 08-ping.md (Ping/ICMP)
- [ ] 09-grpc.md (gRPC-Web)

### Phase 5: Reference
- [ ] api.md (comprehensive API reference)
- [ ] recipes.md (copy-paste examples)
- [ ] testing.md (testing guide)
- [ ] presets.md (API presets)
- [ ] security.md (security best practices)
- [ ] migration.md (from other libraries)
- [ ] troubleshooting.md (FAQ, common issues)

### Phase 6: Cleanup
- [ ] Remove old duplicate files
- [ ] Update cross-references
- [ ] Verify all links work
- [ ] Delete this roadmap file

## Content Guidelines

1. **Progressive complexity** - Start simple, add complexity gradually
2. **Code-first** - Every concept with working example
3. **Copy-paste ready** - Examples should work as-is
4. **Consistent format** - Same structure across all docs
5. **Cross-linking** - Reference related docs when relevant

## File Naming Convention

- Numbered prefix for ordering: `01-`, `02-`, etc.
- Lowercase with hyphens: `ai-layer.md`
- Descriptive names: `07-resilience.md` not `07-retry.md`

## Notes

- All documentation in English
- Use GitHub-flavored Markdown
- Docsify-compatible
- Include Mermaid diagrams where helpful
- Tables for comparisons
- Code blocks with TypeScript

# Feature Panorama

> A bird's-eye view of Recker's capabilities. Each feature gets a tweet-sized summary to help you discover what you need.

## 🚀 Core HTTP Features

**Basic Requests**
Make GET, POST, PUT, DELETE, PATCH requests with clean, chainable API. Zero boilerplate, maximum clarity.

**Type Safety**
Full TypeScript support with automatic type inference, response validation with Zod schemas, compile-time safety.

**Error Handling**
Structured errors with retry context, detailed metadata, smart defaults. Never lose track of what went wrong.

## ⚡ Performance & Resilience

**HTTP/2 & Connection Pooling**
Native HTTP/2 support with intelligent connection reuse. Reduces latency, handles backpressure efficiently.

**Smart Retries**
Exponential backoff, jitter, per-method defaults. Retries GET safely, skips POST unless you opt-in. No surprise duplicates.

**Circuit Breaker**
Auto-detects failing services, opens circuit after threshold, allows recovery. Prevents cascade failures in distributed systems.

**Concurrency Control**
Limit parallel requests, queue overflow, batch processing. Respect rate limits without manual throttling logic.

**Compression**
Automatic gzip/deflate/brotli for request/response bodies. Configurable thresholds, content-type filtering, transparent handling.

## 🔌 Integrations & Protocols

**MCP (Model Context Protocol)**
First-class support for Claude's MCP. Connect to tools, resources, prompts. SSE streaming, automatic reconnection.

**WebSocket**
Full-duplex communication with auto-reconnect, ping/pong, backpressure handling. Perfect for real-time apps.

**Server-Sent Events (SSE)**
Stream server events with automatic reconnection, event parsing, error recovery. Built for streaming AI responses.

**DNS & WHOIS**
Bulk DNS resolution with caching, WHOIS lookups, geo-location. Network utilities built-in.

## 🛠️ Developer Experience

**Hooks & Plugins**
Intercept requests/responses at multiple lifecycle points. Build auth, logging, metrics without touching core code.

**Playbooks**
Pre-configured workflows for common scenarios. Auth flows, pagination, polling. Copy-paste and customize.

**Observability**
Rich header parsing (CDN detection, rate limits, security headers). Debug mode with request/response logging.

**Caching**
HTTP-compliant caching with ETags, Cache-Control, stale-while-revalidate. Save bandwidth, reduce latency.

## 🎯 Advanced Features

**Header Parsing**
Extract CDN info, platform details, rate limit data, security headers. One-line access to complex header data.

**Rate Limit Detection**
Auto-detects rate limit headers across providers (GitHub, Twitter, Cloudflare). Warns before you hit limits.

**Batch Requests**
Send multiple requests efficiently with concurrency control, error isolation, progress tracking.

**Cookie Management**
Automatic cookie jar, domain/path matching, expiration handling. Works like browsers.

**User Agent Simulation**
Emulate real browsers, mobile devices, bots. Randomization, version targeting, custom strings.

## 📖 Where to Go Next

- **New to Recker?** → [Quick Start](/getting-started/quickstart.md)
- **Migrating?** → [Migration Guide](/migration.md)
- **Need configuration help?** → [Configuration Reference](/configuration/quick-reference.md)
- **Want to see code?** → [Examples](/examples/README.md)
- **Deep dive?** → [Guides](/guides/README.md)

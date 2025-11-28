# Recker at a Glance

> Quick comparison with other popular HTTP clients to help you understand what makes Recker different.

## Why Recker?

**The HTTP Client Built for AI Era** - Recker combines the performance of Undici with developer-friendly APIs and first-class AI integration support.

## Feature Comparison

| Feature | Recker | Axios | Got | Ky | Undici | node-fetch |
|---------|--------|-------|-----|-----|--------|------------|
| **HTTP/2 Support** | ✅ Native | ❌ No | ✅ Via http2-wrapper | ❌ No | ✅ Native | ❌ No |
| **TypeScript** | ✅ First-class | ⚠️ Types included | ✅ First-class | ✅ First-class | ✅ First-class | ⚠️ @types package |
| **Retry Logic** | ✅ Built-in + smart | ⚠️ Interceptors | ✅ Built-in | ✅ Built-in | ❌ No | ❌ No |
| **Circuit Breaker** | ✅ Built-in | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| **MCP Protocol** | ✅ First-class | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| **WebSocket** | ✅ Built-in | ❌ No | ❌ No | ❌ No | ⚠️ Via ws | ❌ No |
| **SSE Streaming** | ✅ Built-in | ❌ No | ⚠️ Manual | ⚠️ Manual | ⚠️ Manual | ❌ No |
| **Hooks System** | ✅ Multi-phase | ⚠️ Interceptors | ✅ Hooks | ✅ Hooks | ❌ No | ❌ No |
| **Compression** | ✅ Auto | ⚠️ Manual | ✅ Auto | ⚠️ Manual | ⚠️ Manual | ❌ No |
| **Caching** | ✅ Built-in | ❌ No | ✅ Built-in | ⚠️ Plugin | ❌ No | ❌ No |
| **Rate Limit Detection** | ✅ Auto | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| **DNS/WHOIS** | ✅ Built-in | ❌ No | ⚠️ Via dnsPromises | ❌ No | ❌ No | ❌ No |
| **Concurrency Control** | ✅ Built-in | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| **Bundle Size** | ~50KB | ~100KB | ~200KB | ~12KB | ~140KB | ~4KB |
| **Dependencies** | 2 (undici, zod) | ~15 | ~20 | 0 | 0 | 0 |
| **Browser Support** | ❌ Node only | ✅ Yes | ❌ Node only | ✅ Yes | ❌ Node only | ⚠️ Polyfill |
| **Actively Maintained** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ Minimal |

## Legend
- ✅ Supported natively
- ⚠️ Requires plugins, configuration, or workarounds
- ❌ Not available

## When to Choose Recker

### Choose Recker if you need:
- **AI Integration** - MCP, SSE streaming, structured error handling
- **Built-in Resilience** - Circuit breakers, smart retries, concurrency control
- **Performance** - HTTP/2, connection pooling, automatic compression
- **Developer Experience** - Type safety, rich observability, pre-built playbooks
- **Network Utilities** - DNS, WHOIS, header parsing built-in
- **WebSocket Support** - Without adding separate libraries

### Choose Axios if you need:
- Browser + Node.js compatibility
- Familiar API from years of ecosystem support
- Simple interceptors without advanced features

### Choose Got if you need:
- Extensive plugin ecosystem
- Advanced caching strategies
- Pure Node.js without browser concerns

### Choose Ky if you need:
- Minimal bundle size for browsers
- Simple, modern fetch-based API
- Zero dependencies

### Choose Undici if you need:
- Bare-metal HTTP performance
- Direct control over connections
- Minimal abstraction layer

## Migration Paths

Already using another client? We have migration guides:

- [From Axios](/migration.md#from-axios)
- [From Got](/migration.md#from-got)
- [From Ky](/migration.md#from-ky)
- [From node-fetch](/migration.md#from-node-fetch)

## Performance Benchmarks

See detailed benchmarks comparing Recker to other clients:

→ [Benchmarks](/benchmarks.md)

## Next Steps

- [Quick Start](/getting-started/quickstart.md) - Get up and running in 5 minutes
- [Feature Panorama](/overview/panorama.md) - Detailed feature overview
- [Core Concepts](/overview/concepts.md) - Understand Recker's architecture

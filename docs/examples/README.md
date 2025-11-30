# Recker Examples

Complete, runnable examples demonstrating all Recker features.

## 📚 Available Examples

### Basic Usage
**[basic-usage.ts](./basic-usage.ts)**
- Standard HTTP methods (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- Simple request/response handling
- JSON parsing and response handling

### Advanced HTTP Methods
**[http-methods-advanced.ts](./http-methods-advanced.ts)**
- **Diagnostic Methods**: TRACE, CONNECT
- **CDN/Cache Methods**: PURGE (Varnish, Fastly, Cloudflare)
- **WebDAV Methods**: PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK
- **Link Methods (RFC 2068)**: LINK, UNLINK

### Concurrency & Batch Requests
**[concurrency-batch.ts](./concurrency-batch.ts)**
- Simple global concurrency limits
- Rate limiting configuration
- Multi-domain batch requests
- Per-domain connection pooling
- Web scraping multiple sites in parallel

### Streaming & SSE
**[streaming-sse.ts](./streaming-sse.ts)**
- Server-Sent Events (SSE) for AI/LLM streaming
- Memory-efficient streaming downloads
- Progress tracking with ETA
- Upload/download progress callbacks

**[streaming-s3.ts](./streaming-s3.ts)**
- S3 integration with streaming uploads/downloads
- Large file handling
- AWS SDK integration patterns

### Caching & Retry
**[caching-retry.ts](./caching-retry.ts)**
- Simple cache-first strategy
- Stale-while-revalidate for optimal UX
- Smart retry with exponential backoff
- Request deduplication

### Pagination
**[pagination.ts](./pagination.ts)**
- Auto pagination with Link headers
- Manual page access
- Cursor-based pagination
- Custom pagination logic
- Iterate through all pages

### WHOIS Lookups
**[whois.ts](./whois.ts)**
- Basic WHOIS domain lookups
- Domain availability checking
- Parsed WHOIS data
- Custom WHOIS servers
- IP address lookups

### Authentication & Interceptors
**[auth-interceptors.ts](./auth-interceptors.ts)**
- Basic authentication headers
- Request interceptors (beforeRequest)
- Response interceptors (afterResponse)
- Error interceptors (onError)
- OAuth 2.0 flow implementation
- XSRF/CSRF protection

### User-Agent Simulation
**[user-agent-simulation.ts](./user-agent-simulation.ts)**
- Default Recker user-agent
- Simulate desktop browsers (Chrome, Firefox, Safari, Edge, Opera)
- Simulate mobile devices (iPhone, iPad, Android)
- Random user-agent per request
- Test responsive websites
- Bot simulation (Googlebot)
- User-agent rotation for web scraping

### WebSocket Client
**[websocket.ts](./websocket.ts)**
- Basic WebSocket connections
- Auto-reconnect with exponential backoff
- Heartbeat/keep-alive
- Custom protocols and headers
- Async iteration over messages
- Real-time chat example
- Live stock ticker
- Game state synchronization
- Binary data streaming
- Error handling and connection states

### MCP Integration (Model Context Protocol)
**[mcp-integration.ts](./mcp-integration.ts)**
- Connect to MCP servers over HTTP/SSE
- Call AI tools (functions)
- Read resources (data sources)
- Use prompt templates
- Real-time notifications via SSE
- Event-driven architecture
- Connection pooling
- AI assistant example
- Data pipeline example
- Content generation example

## 🚀 Running Examples

All examples can be run directly with TypeScript:

```bash
# Install dependencies
pnpm install

# Run any example
npx tsx docs/examples/basic-usage.ts
```

## 💡 Example Patterns

### Quick Start Pattern
```typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com'
});

const data = await client.get('/endpoint').json();
```

### Production Pattern
```typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: { maxAttempts: 3, backoff: 'exponential' },
  cache: { strategy: 'stale-while-revalidate', ttl: 60000 },
  concurrency: 20,
  debug: true
});
```

## 📖 Additional Resources

- [Full Documentation](https://recker.js.org)
- [API Reference](../reference/01-api.md)
- [HTTP Guide](../http/02-fundamentals.md)
- [Benchmarks](../benchmarks.md)

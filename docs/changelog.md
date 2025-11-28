# Changelog

All notable changes are tracked here.

## [Unreleased]

### ✨ Added

#### Complete HTTP Methods Support (19 methods)
- **Standard Methods**: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- **Diagnostic Methods**: TRACE, CONNECT
- **CDN/Cache Methods**: PURGE (Varnish, Fastly, Cloudflare)
- **WebDAV Methods**: PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK
- **Link Methods (RFC 2068)**: LINK, UNLINK
- All methods fully typed and tested with 100% pass rate

#### Unified Concurrency Architecture
- **Global Concurrency Limits**: `concurrency.max` for total concurrent requests
- **Batch-Specific Limits**: `runner.concurrency` for per-batch parallelism
- **Rate Limiting**: `requestsPerInterval` + `interval` for API rate limits
- **Per-Domain Connection Pooling**: Separate connection pools per domain
- **Batch-Only Mode**: Run multiple batches in parallel without global bottleneck

#### Batch Request Execution
- `client.batch(requests, options)`: Execute multiple requests in parallel
- `client.multi(requests, options)`: Alias for batch with automatic mapping
- Per-batch concurrency override
- Statistics tracking (total, successful, failed, duration)
- Automatic response mapping with `mapResponse` callback
- Error handling: failed requests return Error instances in results array

#### Multi-Domain Support
- Per-domain connection pooling with `agent.perDomainPooling`
- Prevents slow domains from blocking fast ones
- Efficient parallel execution across multiple APIs
- Tested with real public APIs: GitHub, NPM, HTTPBin, JSONPlaceholder, DummyJSON, Tetis.io

#### WHOIS Integration
- `client.whois('domain.com')`: Perform WHOIS lookups
- `client.isDomainAvailable('domain.com')`: Check domain availability
- Custom WHOIS server support
- IP address lookups
- Parsed output with key-value pairs

#### Enhanced Testing Infrastructure
- **MockTransport Helper**: Reliable, deterministic mocking for tests
- Supports `.times()` option to limit response usage
- Supports `.delay()` option for async testing
- Call counting with `getCallCount(method, path)`
- Response cloning for deduplication tests
- **100% Test Pass Rate**: 163/163 tests passing across 27 test files

#### Documentation & Examples
- **9 Complete Examples** in `docs/examples/`:
  - `basic-usage.ts` - Standard HTTP methods
  - `http-methods-advanced.ts` - WebDAV, CDN, diagnostic methods
  - `concurrency-batch.ts` - Concurrency and batch requests
  - `streaming-sse.ts` - Streaming and Server-Sent Events
  - `streaming-s3.ts` - S3 streaming integration
  - `caching-retry.ts` - Cache strategies and retry logic
  - `pagination.ts` - All pagination patterns
  - `whois.ts` - WHOIS lookups
  - `auth-interceptors.ts` - Authentication and request/response interceptors

### 🔧 Improved
- Retry plugin now supports exponential backoff with configurable jitter
- Better error messages for timeout and network failures
- Enhanced TypeScript types for all HTTP methods
- Improved debug mode with colored timeline visualization

### 📚 Documentation
- Updated CLAUDE.md with all new features
- Comprehensive concurrency guide in `docs/guides/performance/concurrency.md`
- API documentation for all HTTP methods
- Testing best practices with MockTransport examples

## [Initial Release]

### Added
- Core client with middleware/plugin architecture
- Resilience features: retry, cache, dedup, circuit breaker
- Observability: timings, HTTP/2/3 connection info, debug timeline
- Streaming/SSE support and pagination helpers
- Docsify documentation and benchmark suite

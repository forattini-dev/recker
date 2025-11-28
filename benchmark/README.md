# Recker Benchmarks

Performance benchmarks comparing Recker against other popular HTTP clients.

## Quick Start

```bash
# Run main benchmark
pnpm bench

# Run all benchmarks
pnpm bench:all
```

## Benchmark Files

| File | Description |
|------|-------------|
| `index.ts` | Main benchmark - GET JSON comparison |
| `simple-get.ts` | Detailed GET with JSON parsing |
| `post-json.ts` | POST with JSON body |
| `cache-dedup.ts` | Cache and deduplication performance |
| `retry-scenario.ts` | Retry with backoff |
| `streaming.ts` | Streaming and SSE |
| `real-world.ts` | Real-world scenarios with latency |

## Libraries Compared

- **undici** - Raw undici request (baseline)
- **fetch** - Native Node.js fetch
- **recker** - This library
- **axios** - Popular promise-based client
- **got** - Feature-rich HTTP client
- **ky** - Tiny HTTP client based on Fetch

## Hardware Requirements

For consistent results:
- Close other applications
- Use consistent hardware
- Run multiple times

## Adding Benchmarks

1. Create `benchmark/your-benchmark.ts`
2. Use mitata's `group()` and `bench()` APIs
3. Import from `../src/index.js`
4. Document results in `docs/benchmarks.md`

## Example

```typescript
import { run, bench, group } from 'mitata';
import { createClient } from '../src/index.js';

const client = createClient({ baseUrl: 'http://localhost:3000' });

group('My Benchmark', () => {
  bench('recker', async () => {
    await client.get('/').json();
  });
});

await run();
```

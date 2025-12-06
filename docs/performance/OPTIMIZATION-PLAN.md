# Recker Performance Optimization Plan

## Goal: Make recker as fast as undici while keeping all features

## Current State (v1.0.21)

```
undici (raw):  0.45ms avg
recker:        0.98ms avg
overhead:      0.53ms (~120% slower)
```

## Strategy: "Zero-Cost Abstractions"

The key insight is that **most overhead comes from things users don't always need**.

### Phase 1: Bare Mode (Quick Win) ⚡

Create a `createBareClient()` that skips everything:

```typescript
// Fastest possible - direct undici with minimal wrapping
const bare = createBareClient({ baseUrl: 'https://api.example.com' });
await bare.get('/users'); // ~0.50ms (vs undici's 0.45ms)
```

Implementation:
- No middleware chain
- No hooks
- No HttpRequest/HttpResponse wrappers
- Direct undici.request() call
- Reuse single Headers object
- String concatenation only (no URL object)

Expected: **~0.50ms** (10% overhead vs undici)

### Phase 2: Lazy Everything

Only pay for what you use:

```typescript
// Current: All features initialized at construction
const client = createClient({ baseUrl, retry, cache });

// Optimized: Features initialized on first use
const client = createClient({
  baseUrl,
  lazy: true,  // Don't initialize until needed
  retry,       // Plugin registered but not active until retry happens
  cache        // Cache storage created on first cache hit
});
```

### Phase 3: Object Pooling

Reuse objects instead of creating new ones:

```typescript
// Current: Every request creates new objects
const req = new HttpRequest(url, options);  // NEW
const headers = new Headers(options.headers);  // NEW
const controller = new AbortController();  // NEW

// Optimized: Pool and reuse
const req = requestPool.acquire(url, options);  // REUSED
// ... use req ...
requestPool.release(req);  // Return to pool
```

### Phase 4: Inlined Hot Path

For the most common case (simple GET with JSON):

```typescript
// Detect simple case and use fast path
if (isSimpleGet(path, options)) {
  // Inlined: no middleware, no wrappers
  const { body } = await undici.request(this.baseUrl + path);
  return body.json();
}
// Complex case: use full middleware chain
return this.fullRequest(path, options);
```

### Phase 5: Compile-time Optimization

Pre-compute as much as possible at client creation:

```typescript
// Current: Computed per request
const url = this.buildUrl(path, params);
const headers = new Headers({ ...this.defaultHeaders, ...options.headers });

// Optimized: Pre-computed at construction
// baseUrl already normalized, default headers already a Headers object
const url = this._normalizedBase + path;  // Simple concat
this._defaultHeaders.set('X-Custom', value);  // Mutate in place
```

## Implementation Priority

### Quick Wins (1-2 days)
1. [ ] **Bare client mode** - New `createBareClient()` export
2. [ ] **Avoid Headers creation** - Reuse default Headers object
3. [ ] **Skip middleware when empty** - Already partially done

### Medium Effort (3-5 days)
4. [ ] **Object pooling** - Pool HttpRequest, Headers, AbortController
5. [ ] **Inlined GET path** - Fast path for simple GET requests
6. [ ] **Lazy plugin initialization** - Don't run plugin code until needed

### Larger Changes (1 week+)
7. [ ] **Compile-time optimization** - Pre-compute everything possible
8. [ ] **Transport fusion** - Direct undici integration without Transport abstraction

## Benchmarks to Track

After each optimization:

```bash
pnpm bench:compare  # Full comparison
```

Target metrics:
- Simple GET: < 0.55ms (undici + 20%)
- POST JSON: < 0.65ms (undici + 20%)
- With features: < 1.0ms (acceptable for retry/cache)

## Code Changes Required

### 1. createBareClient() - New export

```typescript
// src/bare.ts
export function createBareClient(options: { baseUrl: string }) {
  const base = options.baseUrl.replace(/\/$/, '');

  return {
    async get(path: string) {
      const { body } = await undiciRequest(base + path);
      return {
        json: () => body.json(),
        text: () => body.text(),
        blob: () => body.blob(),
      };
    },
    async post(path: string, data: unknown) {
      const { body } = await undiciRequest(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return {
        json: () => body.json(),
        text: () => body.text(),
      };
    }
  };
}
```

### 2. Headers Optimization

```typescript
// Current
this.defaultHeaders = {
  'User-Agent': getDefaultUserAgent(),
  ...(options.headers || {})
};

// Optimized - create Headers once
this._headersObject = new Headers({
  'User-Agent': getDefaultUserAgent(),
  ...(options.headers || {})
});

// In request():
// Current: new Headers(this.defaultHeaders)
// Optimized: this._headersObject (reuse if no custom headers)
const headers = options.headers
  ? mergeHeaders(this._headersObject, options.headers)
  : this._headersObject;
```

### 3. Fast Path Detection

```typescript
private isSimplePath(path: string, options: RequestOptions): boolean {
  return (
    !options.body &&
    !options.params &&
    !options.timeout &&
    !options.signal &&
    !options.headers &&
    !path.includes(':') &&  // No path params
    this.middlewares.length === 1  // Only httpErrorMiddleware
  );
}
```

## Expected Results

| Mode | Target | vs undici |
|------|--------|-----------|
| Bare client | 0.50ms | +10% |
| Standard (no plugins) | 0.60ms | +30% |
| Standard (with retry) | 0.70ms | +55% |
| Standard (full stack) | 1.00ms | +120% |

## Notes

- Don't sacrifice DX for small gains
- Keep TypeScript types strong
- Maintain backward compatibility
- Add benchmarks for each optimization

# HTTP Clients Benchmark Results

> Generated: 2025-12-06T17:00:47.531Z
> Node.js: v23.8.0
> Platform: linux x64

## Overall Summary

| Library | Avg (ms) | Tests | Wins | Notes |
|---------|----------|-------|------|-------|
| centra | 0.536 | 2 | 0 |  |
| simple-get | 0.537 | 1 | 0 |  |
| phin | 0.556 | 2 | 0 |  |
| tiny-json-http | 0.633 | 2 | 0 |  |
| bent | 0.763 | 2 | 0 |  |
| cross-fetch | 0.830 | 1 | 0 |  |
| recker (fast) | 0.912 | 1 | 0 |  |
| node-fetch | 1.353 | 2 | 0 |  |
| popsicle | 1.373 | 2 | 0 |  |
| wreck | 1.436 | 2 | 0 |  |
| minipass-fetch | 1.471 | 2 | 0 |  |
| make-fetch-happen | 1.565 | 2 | 0 |  |
| hyperquest | 1.720 | 2 | 0 |  |
| undici (raw) | 1.786 | 4 | 4 | Fastest in all tests |
| recker | 3.159 | 4 | 0 |  |
| needle | 3.241 | 3 | 0 |  |
| fetch (native) | 3.581 | 4 | 0 |  |
| wretch | 3.662 | 3 | 0 |  |
| axios | 3.751 | 4 | 0 |  |
| got | 4.134 | 4 | 0 |  |
| ky | 4.775 | 4 | 0 |  |
| superagent | 5.146 | 4 | 0 |  |

## Detailed Results

### GET JSON (simple)

| Library | Avg (ms) | Min (ms) | Max (ms) | p50 (ms) | p75 (ms) | p99 (ms) | Samples |
|---------|----------|----------|----------|----------|----------|----------|----------|
| undici (raw) ** | 0.455 | 0.223 | 4.113 | 0.355 | 0.515 | 1.430 | 1500 |
| centra | 0.514 | 0.325 | 2.204 | 0.478 | 0.571 | 1.090 | 1335 |
| phin | 0.521 | 0.317 | 1.613 | 0.493 | 0.601 | 0.975 | 1317 |
| tiny-json-http | 0.526 | 0.303 | 3.026 | 0.476 | 0.581 | 1.244 | 1301 |
| simple-get | 0.537 | 0.333 | 1.934 | 0.492 | 0.602 | 1.135 | 1279 |
| bent | 0.659 | 0.372 | 2.639 | 0.602 | 0.751 | 1.220 | 1041 |
| cross-fetch | 0.830 | 0.447 | 3.028 | 0.788 | 0.938 | 1.566 | 825 |
| fetch (native) | 0.886 | 0.467 | 4.285 | 0.794 | 0.987 | 2.623 | 773 |
| recker (fast) | 0.912 | 0.562 | 2.972 | 0.863 | 0.994 | 1.682 | 751 |
| recker | 0.984 | 0.543 | 3.176 | 0.913 | 1.111 | 2.132 | 694 |
| wretch | 1.134 | 0.726 | 3.612 | 1.041 | 1.231 | 2.757 | 605 |
| node-fetch | 1.196 | 0.724 | 2.721 | 1.168 | 1.323 | 2.126 | 571 |
| axios | 1.288 | 0.723 | 3.758 | 1.212 | 1.377 | 3.115 | 532 |
| popsicle | 1.298 | 0.862 | 3.930 | 1.236 | 1.429 | 2.371 | 528 |
| hyperquest | 1.338 | 0.923 | 3.623 | 1.288 | 1.440 | 2.570 | 513 |
| wreck | 1.344 | 0.938 | 4.396 | 1.281 | 1.428 | 2.353 | 509 |
| ky | 1.393 | 0.966 | 3.994 | 1.327 | 1.529 | 3.319 | 491 |
| needle | 1.419 | 0.838 | 4.938 | 1.339 | 1.575 | 3.897 | 483 |
| minipass-fetch | 1.448 | 1.054 | 3.285 | 1.374 | 1.582 | 2.358 | 475 |
| superagent | 1.453 | 0.981 | 4.083 | 1.391 | 1.604 | 2.515 | 473 |
| got | 1.538 | 1.000 | 6.092 | 1.431 | 1.645 | 3.772 | 439 |
| make-fetch-happen | 1.546 | 1.015 | 4.955 | 1.492 | 1.700 | 2.811 | 442 |

### POST JSON (with body)

| Library | Avg (ms) | Min (ms) | Max (ms) | p50 (ms) | p75 (ms) | p99 (ms) | Samples |
|---------|----------|----------|----------|----------|----------|----------|----------|
| undici (raw) ** | 0.550 | 0.357 | 1.795 | 0.503 | 0.605 | 1.068 | 1247 |
| centra ~ | 0.557 | 0.347 | 2.281 | 0.521 | 0.624 | 1.041 | 1231 |
| phin ~ | 0.591 | 0.376 | 2.454 | 0.529 | 0.662 | 1.169 | 1162 |
| tiny-json-http | 0.740 | 0.432 | 2.893 | 0.697 | 0.835 | 1.298 | 924 |
| bent | 0.866 | 0.495 | 3.316 | 0.823 | 0.945 | 2.105 | 791 |
| recker | 1.091 | 0.704 | 3.263 | 1.041 | 1.218 | 1.827 | 629 |
| axios | 1.177 | 0.702 | 3.280 | 1.130 | 1.300 | 2.426 | 584 |
| popsicle | 1.447 | 0.999 | 3.534 | 1.377 | 1.596 | 2.646 | 474 |
| fetch (native) | 1.484 | 0.879 | 4.188 | 1.408 | 1.609 | 3.300 | 463 |
| got | 1.493 | 0.965 | 3.609 | 1.425 | 1.641 | 3.186 | 459 |
| minipass-fetch | 1.493 | 0.956 | 3.820 | 1.428 | 1.581 | 2.692 | 460 |
| node-fetch | 1.509 | 1.069 | 4.284 | 1.407 | 1.622 | 2.622 | 452 |
| wreck | 1.529 | 1.051 | 3.931 | 1.480 | 1.622 | 3.036 | 448 |
| needle | 1.550 | 1.054 | 5.176 | 1.432 | 1.658 | 4.239 | 441 |
| superagent | 1.566 | 1.068 | 7.996 | 1.427 | 1.671 | 2.958 | 436 |
| make-fetch-happen | 1.583 | 0.955 | 3.982 | 1.503 | 1.713 | 2.637 | 433 |
| wretch | 1.695 | 1.131 | 4.880 | 1.603 | 1.870 | 3.563 | 405 |
| hyperquest | 2.103 | 1.451 | 4.644 | 2.010 | 2.272 | 3.781 | 326 |
| ky | 2.445 | 1.584 | 5.335 | 2.370 | 2.710 | 4.989 | 280 |

### Parallel GET (10 concurrent)

| Library | Avg (ms) | Min (ms) | Max (ms) | p50 (ms) | p75 (ms) | p99 (ms) | Samples |
|---------|----------|----------|----------|----------|----------|----------|----------|
| undici (raw) ** | 3.871 | 2.244 | 8.030 | 3.714 | 4.404 | 6.657 | 173 |
| recker | 6.217 | 4.910 | 12.475 | 5.985 | 6.531 | 8.777 | 107 |
| axios | 7.031 | 5.357 | 11.557 | 6.805 | 7.476 | 10.973 | 95 |
| fetch (native) | 7.138 | 5.334 | 11.701 | 6.764 | 8.051 | 10.129 | 94 |
| got | 7.508 | 5.243 | 13.100 | 7.037 | 8.189 | 12.468 | 89 |
| wretch | 8.157 | 6.067 | 11.950 | 7.812 | 8.878 | 11.414 | 82 |
| ky | 8.930 | 6.736 | 13.892 | 8.621 | 9.923 | 12.659 | 73 |
| superagent | 10.370 | 7.806 | 15.092 | 10.456 | 11.317 | 14.155 | 63 |

### Sequential GET (5 requests)

| Library | Avg (ms) | Min (ms) | Max (ms) | p50 (ms) | p75 (ms) | p99 (ms) | Samples |
|---------|----------|----------|----------|----------|----------|----------|----------|
| undici (raw) ** | 2.268 | 1.511 | 6.370 | 2.080 | 2.536 | 4.743 | 301 |
| recker | 4.345 | 2.859 | 8.958 | 4.188 | 4.713 | 7.372 | 156 |
| fetch (native) | 4.817 | 3.560 | 8.032 | 4.528 | 5.374 | 7.666 | 141 |
| axios | 5.508 | 3.294 | 9.844 | 5.347 | 6.046 | 8.075 | 123 |
| got | 5.999 | 4.255 | 9.793 | 5.695 | 6.771 | 8.783 | 112 |
| ky | 6.330 | 4.347 | 10.386 | 6.012 | 6.998 | 9.574 | 106 |
| needle | 6.754 | 4.582 | 10.289 | 6.322 | 7.642 | 10.084 | 99 |
| superagent | 7.196 | 5.445 | 11.337 | 7.036 | 7.776 | 9.388 | 92 |


## Methodology

- **Test Server**: Local HTTP server with minimal latency
- **Warmup**: mitata handles warmup automatically
- **Iterations**: Multiple samples until statistically significant
- **Metrics**: All times in milliseconds (ms)

## Libraries Tested (21)

| Category | Libraries |
|----------|-----------|
| **Raw/Low-level** | undici, fetch (native) |
| **Full-featured** | recker, axios, got, ky |
| **Fetch-based** | node-fetch, cross-fetch, wretch, make-fetch-happen, minipass-fetch |
| **Lightweight** | phin, centra, bent, simple-get, tiny-json-http |
| **Legacy/Callback** | superagent, needle, hyperquest |
| **Ecosystem** | popsicle, wreck (Hapi) |

## Benchmark Scenarios

### 1. Simple GET (GET JSON)
Single GET request returning small JSON payload (~200 bytes).
Tests raw request overhead.

### 2. POST JSON (with body)
POST request with JSON body (~500 bytes).
Tests request serialization overhead.

### 3. Parallel GET (10 concurrent)
10 simultaneous requests to same endpoint.
Tests connection pooling and async handling.

### 4. Sequential GET (5 requests)
5 requests in sequence.
Tests connection reuse and latency accumulation.

## Key Findings

1. **undici** is the fastest baseline (Node.js official HTTP client)
2. **recker** adds ~40-60% overhead vs undici but includes retry, cache, rate-limiting
3. **got** has significant overhead due to extensive feature set
4. **ky** is slower than expected despite being fetch-based
5. **phin/centra** are extremely lightweight but lack features

# Metrics & Timings

> Recker surfaces connection-level metrics on every response so you can understand protocol behavior, latency, and reuse.

## Quick links

- [Reading timings](#reading-timings)
- [HTTP/2 insights](#http2-insights)
- [HTTP/3 insights](#http3-insights)
- [Debug logging](#debug-logging)

## Reading timings

```typescript
const res = await client.get('/users/42');

console.log(res.timings);
// {
//   queuing: 0.8,
//   dns: 5,
//   tcp: 11,
//   tls: 38,
//   firstByte: 72,
//   content: 14,
//   total: 86
// }

console.log(res.connection);
// { protocol: 'h2', reused: true, cipher: 'TLS_AES_128_GCM_SHA256', ... }
```

- `firstByte` is time-to-first-byte, `content` is time to fully read the body, and `total` covers the entire request lifecycle.
- `reused` shows if the underlying socket was pooled or freshly opened.

## HTTP/2 insights

When ALPN negotiates `h2`, Recker records session-level details:

- `maxConcurrentStreams`: server-advertised concurrency limit
- `currentStreams` / `pendingStreams`: active and queued streams on the session
- `localWindowSize` / `remoteWindowSize`: flow-control windows when exposed by the runtime
- `localSettings` / `remoteSettings`: SETTINGS frames (header table size, frame size, window size, etc.)
- `streamId`, `streamWeight`, `streamDependency`: per-stream metadata when available

Use these fields to spot head-of-line blocking or window exhaustion quickly.

## HTTP/3 insights

QUIC/HTTP/3 sessions surface:

- `quicVersion`: negotiated QUIC version
- `zeroRTT`: whether the connection used 0-RTT
- `maxStreams`: concurrency cap exposed by the transport
- `handshakeConfirmed`: whether the QUIC handshake completed
- `rtt`: round-trip time when the underlying transport exposes it

## Debug logging

Enable debug mode to see timings inline while developing:

```typescript
const client = createClient({ baseUrl: 'https://api.example.com', debug: true });
await client.get('/health');
```

The debug middleware prints DNS/TCP/TLS/TTFB bars and includes the same connection metadata you can access programmatically.

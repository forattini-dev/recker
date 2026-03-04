# Raffel Protocol

Type-safe RPC, channels, and events over multiple transports — powered by [Raffel](https://github.com/nicosolo/raffel).

Recker and Raffel are independent projects that complement each other perfectly: Raffel serves, Recker connects. The `RaffelClient` gives you a first-class client for any Raffel server with zero glue code.

## Quick Start

```typescript
import { createRaffelClient } from 'recker';

// WebSocket — full capabilities
const client = createRaffelClient('ws://localhost:3000');

// HTTP — stateless, call + notify + streaming
const client = createRaffelClient('http://localhost:3000');

// TCP — full capabilities, binary framing
const client = createRaffelClient('tcp://localhost:9000');

// UDP — lightweight, call + notify only
const client = createRaffelClient('udp://localhost:9000');

// JSON-RPC 2.0 — standard protocol, call + notify only
const client = createRaffelClient('http://localhost:3000/rpc');

await client.connect();

// RPC call (works on all transports)
const user = await client.call<User>('users.get', { id: 42 });

// Fire-and-forget (works on all transports)
client.notify('analytics.track', { event: 'page_view', url: '/' });

// Subscribe to a channel (WS and TCP only)
client.subscribe('notifications', (event, data) => {
  console.log(`${event}:`, data);
});

// Stream results (WS, HTTP via SSE, TCP)
for await (const item of client.callStream('logs.tail')) {
  console.log(item);
}

client.close();
```

## Transport Auto-Detection

The transport is auto-detected from the URL scheme:

| URL Scheme | Transport | Capabilities |
|:-----------|:----------|:-------------|
| `ws://` `wss://` | WebSocket | call, notify, subscribe, publish, cancel, stream |
| `http://` `https://` | HTTP | call, notify, stream (SSE) |
| `http://host/rpc` | JSON-RPC 2.0 | call, notify |
| `tcp://` | TCP | call, notify, subscribe, publish, cancel, stream |
| `udp://` | UDP | call, notify |

Override with the `transport` option:

```typescript
const client = createRaffelClient('http://localhost:3000', {
  transport: 'websocket', // Force WebSocket
});
```

## Connection Options

### Core Options

| Option | Type | Default | Description |
|:-------|:-----|:--------|:------------|
| `transport` | `'websocket' \| 'http' \| 'tcp' \| 'udp' \| 'jsonrpc'` | auto-detect | Transport type override |
| `defaultTimeout` | `number` | `30000` | Default timeout for `call()` in ms |
| `channels` | `string[]` | — | Channels to auto-subscribe on connect |
| `channelHandlers` | `Record<string, ChannelEventHandler>` | — | Per-channel event handlers |
| `onEvent` | `(procedure, payload) => void` | — | Catch-all handler for server events |

### Per-Transport Options

WebSocket, HTTP, TCP, UDP, and JSON-RPC each have their own option bag:

```typescript
const client = createRaffelClient('ws://game-server:9000', {
  // Core options
  defaultTimeout: 5000,
  channels: ['lobby', 'announcements'],
  channelHandlers: {
    lobby: (event, data) => console.log(`[lobby] ${event}:`, data),
  },
  onEvent: (procedure, payload) => {
    console.log(`Server event: ${procedure}`, payload);
  },

  // WebSocket-specific options
  ws: {
    reconnect: true,
    reconnectDelay: 2000,
    maxReconnectAttempts: 10,
    heartbeatInterval: 15000,
    headers: { 'Authorization': 'Bearer token' },
  },
});
```

#### `ws` — WebSocket Options

| Option | Type | Default | Description |
|:-------|:-----|:--------|:------------|
| `headers` | `Record<string, string>` | — | Handshake headers (e.g. auth tokens) |
| `reconnect` | `boolean` | `false` | Auto-reconnect on disconnect |
| `reconnectDelay` | `number` | `1000` | Base reconnect delay (ms) |
| `maxReconnectAttempts` | `number` | `5` | Max reconnect attempts (0 = infinite) |
| `heartbeatInterval` | `number` | `30000` | Ping interval (ms, 0 = disabled) |
| `heartbeatTimeout` | `number` | `10000` | Pong wait timeout (ms) |
| `protocols` | `string \| string[]` | — | WebSocket sub-protocols |

#### `http` — HTTP Options

| Option | Type | Default | Description |
|:-------|:-----|:--------|:------------|
| `headers` | `Record<string, string>` | — | Custom request headers |
| `timeout` | `number` | `30000` | HTTP request timeout (ms) |

#### `tcp` — TCP Options

| Option | Type | Default | Description |
|:-------|:-----|:--------|:------------|
| `keepAlive` | `boolean` | `true` | Enable TCP keep-alive |
| `keepAliveInterval` | `number` | `30000` | Keep-alive interval (ms) |
| `noDelay` | `boolean` | `true` | Disable Nagle's algorithm |
| `reconnect` | `boolean` | `true` | Auto-reconnect on disconnect |
| `reconnectDelay` | `number` | `1000` | Base reconnect delay (ms) |
| `maxReconnectAttempts` | `number` | `10` | Max reconnect attempts |

#### `udp` — UDP Options

| Option | Type | Default | Description |
|:-------|:-----|:--------|:------------|
| `socketType` | `'udp4' \| 'udp6'` | `'udp4'` | Socket type |
| `enableAck` | `boolean` | `false` | Enable acknowledgment mode |
| `ackTimeout` | `number` | `5000` | ACK timeout (ms) |

#### `jsonrpc` — JSON-RPC Options

| Option | Type | Default | Description |
|:-------|:-----|:--------|:------------|
| `path` | `string` | `'/rpc'` | RPC endpoint path |
| `headers` | `Record<string, string>` | — | Custom request headers |

## RPC Calls

### Basic Call

```typescript
const user = await client.call<User>('users.get', { id: 42 });
console.log(user.name);
```

### Custom Timeout

```typescript
const report = await client.call('reports.generate', { year: 2025 }, {
  timeout: 60000,  // 60s for slow operations
});
```

### With AbortSignal

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

try {
  const result = await client.call('search.query', { q: 'test' }, {
    signal: controller.signal,
  });
} catch (err) {
  console.log(err.message); // "Call to search.query was aborted"
}
```

### Cancel by ID

```typescript
// Each call gets an auto-incrementing ID: req-1, req-2, ...
// Cancel in-flight calls (WS and TCP only):
client.cancel('req-3');
```

## Streaming

Use `callStream()` for real-time data. Over HTTP it uses Server-Sent Events (SSE); over WS/TCP it uses the stream envelope protocol.

```typescript
// Stream logs in real-time
for await (const entry of client.callStream<LogEntry>('logs.tail')) {
  console.log(`[${entry.level}] ${entry.message}`);
}
```

> Streaming is supported over WebSocket, HTTP (SSE), and TCP. Not available over UDP or JSON-RPC.

## Fire-and-Forget

```typescript
client.notify('analytics.track', { event: 'click', target: 'buy-btn' });
client.notify('logs.write', { level: 'info', message: 'User logged in' });
```

## Channels

Channels are only available over WebSocket and TCP.

### Subscribe

```typescript
client.subscribe('chat', (event, data) => {
  console.log(`[chat] ${event}:`, data);
});

// Without handler — use the event emitter
client.subscribe('updates');
client.on('raffel:channel:event', (channel, event, data) => {
  if (channel === 'updates') console.log(`Update: ${event}`, data);
});
```

### Unsubscribe / Publish

```typescript
client.unsubscribe('chat');
client.publish('chat', 'message', { text: 'Hello everyone!' });
```

### Auto-Resubscribe on Reconnect

Channels passed in the `channels` option (or subscribed via `subscribe()`) are automatically re-subscribed after reconnection.

```typescript
const client = createRaffelClient('ws://localhost:3000', {
  channels: ['notifications', 'presence'],
  ws: { reconnect: true },
});
```

## Events

| Event | Args | Description |
|:------|:-----|:------------|
| `raffel:connected` | — | Transport connected |
| `raffel:disconnected` | — | Transport disconnected |
| `raffel:event` | `(procedure, payload)` | Server-sent event (fire-and-forget) |
| `raffel:channel:subscribed` | `(channel, members?)` | Server confirmed subscription |
| `raffel:channel:unsubscribed` | `(channel)` | Server confirmed unsubscription |
| `raffel:channel:event` | `(channel, event, data)` | Channel event received |
| `raffel:unknown` | `(parsed)` | Unrecognized message |
| `ws:reconnecting` | `(attempt, delay)` | Attempting reconnect |
| `ws:error` | `(error)` | Transport-level error |

## Properties

| Property | Type | Description |
|:---------|:-----|:------------|
| `isConnected` | `boolean` | Whether the transport is connected |
| `raw` | `RaffelTransport` | The underlying transport instance |
| `rawWs` | `ReckerWebSocket \| null` | The underlying WebSocket (null for non-WS transports) |

```typescript
if (client.isConnected) {
  await client.call('ping');
}

// Access underlying WebSocket (WS transport only)
client.rawWs?.on('message', (msg) => { /* raw WS messages */ });

// Access transport (any transport)
console.log(client.raw.capabilities); // bitmask of capabilities
```

## Error Handling

### RaffelError

When a `call()` receives an error from the server, it throws a `RaffelError`:

```typescript
import { RaffelError } from 'recker';

try {
  await client.call('users.get', { id: 999 });
} catch (err) {
  if (err instanceof RaffelError) {
    console.log(err.code);       // "NOT_FOUND"
    console.log(err.status);     // 404
    console.log(err.procedure);  // "users.get"
    console.log(err.details);    // { id: 999 }
  }
}
```

### UnsupportedError

Thrown when calling a method not supported by the current transport:

```typescript
const client = createRaffelClient('http://localhost:3000');
await client.connect();

client.subscribe('ch'); // throws UnsupportedError: subscribe() not supported over http
```

### Transport-Specific Error Mapping

| Transport | Error Source | RaffelError Mapping |
|:----------|:------------|:--------------------|
| WebSocket | `type: "error"` envelope | Direct from payload |
| HTTP | HTTP 4xx/5xx + `{ error: { code, message } }` | From error body |
| TCP | `type: "error"` envelope | Direct from payload |
| JSON-RPC | `{ error: { code: -32601 } }` | JSON-RPC code → Raffel code |

## Capability Matrix

| Method | WS | HTTP | TCP | UDP | JSON-RPC |
|:-------|:--:|:----:|:---:|:---:|:--------:|
| `call()` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `callStream()` | ✅ | ✅ (SSE) | ✅ | ❌ | ❌ |
| `notify()` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `subscribe()` | ✅ | ❌ | ✅ | ❌ | ❌ |
| `publish()` | ✅ | ❌ | ✅ | ❌ | ❌ |
| `cancel()` | ✅ | ❌ | ✅ | ❌ | ❌ |

<details>
<summary><strong>Wire Protocol Reference</strong></summary>

### WebSocket / TCP

JSON envelopes with two message shapes: RPC (has `procedure`) and Channel (has `channel`).

**TCP framing**: `[4-byte uint32 BE length][UTF-8 JSON]` (max 16MB).

```typescript
interface RaffelEnvelope {
  id: string;
  type: 'request' | 'response' | 'error' | 'event' | 'cancel' | 'stream:start' | 'stream:data' | 'stream:end';
  procedure?: string;
  payload?: unknown;
  metadata?: Record<string, unknown>;
}
```

### HTTP

| Operation | Method | Route | Body |
|:----------|:-------|:------|:-----|
| Call | `POST /{procedure}` | JSON payload | JSON result |
| Notify | `POST /events/{procedure}` | JSON payload | 202 |
| Stream | `GET /streams/{procedure}` | Query params | SSE |

SSE events: `event: data` (JSON), `event: end`, `event: error` (JSON).

### UDP

Raw JSON datagrams (no framing). Max 65,507 bytes.

### JSON-RPC 2.0

Standard `POST /rpc` with `{ jsonrpc: "2.0", method, params, id }`.

</details>

## Migration from v1 (WebSocket-only)

### Breaking Changes

**Options structure changed**: WebSocket options are now nested under `ws`:

```typescript
// Before (v1)
createRaffelClient('ws://api:3000', {
  reconnect: true,
  headers: { Authorization: 'Bearer token' },
});

// After (v2)
createRaffelClient('ws://api:3000', {
  ws: {
    reconnect: true,
    headers: { Authorization: 'Bearer token' },
  },
});
```

**`client.raw` type changed**: Returns `RaffelTransport` instead of `ReckerWebSocket`. Use `client.rawWs` for WebSocket access:

```typescript
// Before (v1)
client.raw.on('message', handler);

// After (v2)
client.rawWs?.on('message', handler);
```

## Patterns

### Microservice Gateway

```typescript
const gateway = createRaffelClient('ws://gateway:9000', {
  ws: {
    reconnect: true,
    maxReconnectAttempts: 0,
    headers: { 'Authorization': 'Bearer service-token' },
  },
});

await gateway.connect();
const user = await gateway.call('auth.verify', { token });
const orders = await gateway.call('orders.list', { userId: user.id });
```

### HTTP API Client

```typescript
const api = createRaffelClient('http://api:3000', {
  http: {
    headers: { 'Authorization': 'Bearer token' },
    timeout: 10000,
  },
});

await api.connect();
const users = await api.call('users.list', { page: 1 });
```

### TCP Microservice

```typescript
const svc = createRaffelClient('tcp://billing:9000', {
  tcp: {
    reconnect: true,
    reconnectDelay: 500,
  },
});

await svc.connect();
const invoice = await svc.call('billing.invoice', { orderId: '123' });
```

### Game Server

```typescript
const game = createRaffelClient('ws://game:9000', {
  defaultTimeout: 2000,
  channels: ['lobby'],
  channelHandlers: {
    lobby: (event, data) => {
      switch (event) {
        case 'player_joined': addPlayer(data); break;
        case 'player_left': removePlayer(data); break;
      }
    },
  },
  ws: {
    reconnect: true,
    heartbeatInterval: 5000,
  },
});

await game.connect();
const match = await game.call('matchmaking.join', { mode: 'ranked' });
```

## Next Steps

- **[WebSocket](01-websocket.md)** — Lower-level WebSocket client (used internally by WS transport)
- **[DNS](04-dns.md)** — DNS resolution utilities
- **[Raffel Documentation](https://github.com/nicosolo/raffel)** — Server-side framework

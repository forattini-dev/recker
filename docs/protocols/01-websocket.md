# WebSocket

Real-time bidirectional communication with automatic reconnection and heartbeat.

## Usage Styles

### 1. Direct Function (Zero Config)

```typescript
import { ws } from 'recker';
// or
import { recker } from 'recker';

// Quick connection
const socket = ws('wss://api.example.com/ws');
// or
const socket = recker.ws('wss://api.example.com/ws');

socket.on('message', (msg) => {
  console.log('Received:', msg.data);
});
```

### 2. Configured Client

```typescript
import { createWebSocket } from 'recker';

const socket = createWebSocket('wss://api.example.com/ws', {
  reconnect: true,
  reconnectInterval: 1000,
  maxReconnects: 5
});

socket.on('open', () => {
  socket.send('Hello!');
});

socket.on('close', (code, reason) => {
  console.log('Closed:', code, reason);
});
```

## Connection Options

### Basic Connection

```typescript
import { createWebSocket } from 'recker';

const ws = createWebSocket('wss://api.example.com/ws', {
  // Subprotocols
  protocols: ['graphql-ws', 'json'],

  // Custom headers for handshake
  headers: {
    'Authorization': 'Bearer token',
    'X-Custom-Header': 'value'
  }
});

// Already connected, but you can wait for open event
ws.on('open', () => {
  console.log('Ready!');
});
```

### Auto-Reconnect

```typescript
import { createWebSocket } from 'recker';

const ws = createWebSocket('wss://api.example.com/ws', {
  reconnect: true,
  reconnectDelay: 1000,      // Initial delay (ms)
  maxReconnectAttempts: 5    // 0 = infinite
});

// Reconnection events
ws.on('reconnecting', (attempt, delay) => {
  console.log(`Reconnecting attempt ${attempt} in ${delay}ms`);
});

ws.on('max-reconnect-attempts', () => {
  console.log('Max reconnection attempts reached');
});

ws.on('reconnect-error', (error) => {
  console.error('Reconnection failed:', error);
});
```

### Heartbeat

```typescript
import { createWebSocket } from 'recker';

const ws = createWebSocket('wss://api.example.com/ws', {
  heartbeatInterval: 30000,  // Send ping every 30s
  heartbeatTimeout: 10000    // Wait 10s for pong
});

ws.on('heartbeat-timeout', () => {
  console.log('Connection appears dead');
});
```

### With Proxy

```typescript
import { createWebSocket } from 'recker';

const ws = createWebSocket('wss://api.example.com/ws', {
  proxy: 'http://proxy.example.com:8080'
});

// Or with proxy auth
const ws = createWebSocket('wss://api.example.com/ws', {
  proxy: {
    url: 'http://proxy.example.com:8080',
    auth: 'user:password'
  }
});
```

### TLS Options

```typescript
import { createWebSocket } from 'recker';

const ws = createWebSocket('wss://api.example.com/ws', {
  tls: {
    rejectUnauthorized: false,  // Skip cert validation (dev only!)
    ca: customCA,
    cert: clientCert,
    key: clientKey
  }
});
```

## Sending Data

### Send Text

```typescript
await ws.send('Hello, World!');
```

### Send JSON

```typescript
ws.sendJSON({ type: 'subscribe', channel: 'updates' });
```

### Send Binary

```typescript
const buffer = Buffer.from([0x01, 0x02, 0x03]);
await ws.send(buffer);
```

### Send with Backpressure

```typescript
// Wait for socket buffer to drain
await ws.send(largeData, {
  awaitDrain: true,
  highWaterMark: 16 * 1024  // 16KB threshold
});
```

### Send Stream

```typescript
import { createReadStream } from 'fs';

const fileStream = createReadStream('./large-file.bin');
await ws.sendStream(fileStream, { awaitDrain: true });
```

## Receiving Data

### Event-Based

```typescript
ws.on('message', (msg) => {
  if (msg.isBinary) {
    console.log('Binary data:', msg.data);
  } else {
    console.log('Text:', msg.data);
  }
});
```

### Async Iterator

```typescript
for await (const msg of ws) {
  console.log('Message:', msg.data);

  if (msg.data === 'bye') {
    break;
  }
}
```

### Pipe to Stream

```typescript
import { createWriteStream } from 'fs';

const file = createWriteStream('./output.bin');
await ws.pipeTo(file);
```

## Connection State

### Check Status

```typescript
// Connection states
console.log('Ready state:', ws.readyState);
// 0 = CONNECTING
// 1 = OPEN
// 2 = CLOSING
// 3 = CLOSED

console.log('Is connected:', ws.isConnected);
```

### Ping/Pong

```typescript
// Manual ping (heartbeat does this automatically)
ws.ping();
```

## Closing Connection

### Graceful Close

```typescript
ws.close(1000, 'Normal closure');
```

### Close Codes

```typescript
// Normal closure
ws.close(1000, 'Done');

// Going away
ws.close(1001, 'Server shutting down');

// Protocol error
ws.close(1002, 'Protocol error');

// Custom application code
ws.close(4000, 'Custom reason');
```

## Events

### All Events

```typescript
const ws = new ReckerWebSocket('wss://api.example.com/ws', {
  reconnect: true
});

// Connection opened
ws.on('open', () => {
  console.log('Connected');
});

// Message received
ws.on('message', (msg) => {
  console.log('Data:', msg.data, 'Binary:', msg.isBinary);
});

// Connection closed
ws.on('close', (code, reason) => {
  console.log('Closed:', code, reason);
});

// Error occurred
ws.on('error', (error) => {
  console.error('Error:', error);
});

// Reconnection events
ws.on('reconnecting', (attempt, delay) => {
  console.log(`Reconnect attempt ${attempt} in ${delay}ms`);
});

ws.on('reconnect-error', (error) => {
  console.error('Reconnect failed:', error);
});

ws.on('max-reconnect-attempts', () => {
  console.log('Max attempts reached');
});

// Heartbeat timeout
ws.on('heartbeat-timeout', () => {
  console.log('No pong received');
});

await ws.connect();
```

## Patterns

### JSON Protocol

```typescript
interface Message {
  type: string;
  payload: any;
}

class JSONWebSocket {
  constructor(private ws: ReckerWebSocket) {
    ws.on('message', (msg) => {
      if (!msg.isBinary) {
        const data = JSON.parse(msg.data as string) as Message;
        this.handleMessage(data);
      }
    });
  }

  send(type: string, payload: any) {
    this.ws.sendJSON({ type, payload });
  }

  private handleMessage(msg: Message) {
    // Handle by type
  }
}
```

### Pub/Sub Pattern

```typescript
import { createWebSocket } from 'recker';

const ws = createWebSocket('wss://api.example.com/ws');

ws.on('open', () => {
  // Subscribe to channels
  ws.sendJSON({
    action: 'subscribe',
    channels: ['trades', 'orderbook']
  });
});

ws.on('message', (msg) => {
  const data = JSON.parse(msg.data as string);

  switch (data.channel) {
    case 'trades':
      handleTrade(data);
      break;
    case 'orderbook':
      handleOrderbook(data);
      break;
  }
});
```

### Request/Response Pattern

```typescript
class RPCWebSocket {
  private pending = new Map<number, { resolve: Function; reject: Function }>();
  private nextId = 0;

  constructor(private ws: ReckerWebSocket) {
    ws.on('message', (msg) => {
      const data = JSON.parse(msg.data as string);
      const pending = this.pending.get(data.id);

      if (pending) {
        if (data.error) {
          pending.reject(new Error(data.error));
        } else {
          pending.resolve(data.result);
        }
        this.pending.delete(data.id);
      }
    });
  }

  async call<T>(method: string, params: any): Promise<T> {
    const id = ++this.nextId;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.sendJSON({ id, method, params });

      // Timeout
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }
}

// Usage
const rpc = new RPCWebSocket(ws);
const result = await rpc.call('getUser', { id: 123 });
```

### GraphQL Subscriptions

```typescript
import { createWebSocket } from 'recker';

const ws = createWebSocket('wss://api.example.com/graphql', {
  protocols: ['graphql-ws']
});

ws.on('open', () => {
  // Initialize
  ws.sendJSON({ type: 'connection_init' });

  // Subscribe
  ws.sendJSON({
    id: '1',
    type: 'subscribe',
    payload: {
      query: `subscription { onMessage { id content } }`
    }
  });
});

ws.on('message', (msg) => {
  const data = JSON.parse(msg.data as string);

  if (data.type === 'next') {
    console.log('Subscription data:', data.payload.data);
  }
});
```

### Binary Streaming

```typescript
import { createReadStream, createWriteStream } from 'fs';
import { createWebSocket } from 'recker';

const ws = createWebSocket('wss://api.example.com/upload');

ws.on('open', async () => {
  // Send file as binary frames
  const file = createReadStream('./video.mp4');
  await ws.pipeFrom(file);
  ws.close();
});
```

## Error Handling

```typescript
import { createWebSocket } from 'recker';

const ws = createWebSocket('wss://api.example.com/ws', {
  reconnect: true,
  maxReconnectAttempts: 3
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
  if (code !== 1000) {
    console.error(`Abnormal close: ${code} - ${reason}`);
  }
});
```

## Best Practices

### 1. Always Handle Errors

```typescript
import { createWebSocket } from 'recker';

const ws = createWebSocket('wss://api.example.com/ws');

ws.on('error', (error) => {
  logger.error('WebSocket error', { error });
});

ws.on('close', (code, reason) => {
  if (code >= 4000) {
    logger.error('Application error', { code, reason });
  }
});
```

### 2. Use Heartbeat for Long-Lived Connections

```typescript
import { createWebSocket } from 'recker';

const ws = createWebSocket('wss://api.example.com/ws', {
  heartbeatInterval: 30000,
  heartbeatTimeout: 10000,
  reconnect: true
});
```

### 3. Clean Up on Process Exit

```typescript
process.on('SIGTERM', () => {
  ws.close(1001, 'Process terminating');
});
```

### 4. Exponential Backoff

```typescript
import { createWebSocket } from 'recker';

const ws = createWebSocket('wss://api.example.com/ws', {
  reconnect: true,
  reconnectDelay: 1000,      // Starts at 1s
  maxReconnectAttempts: 10   // Max ~30s delay with jitter
});

// Built-in exponential backoff with jitter
```

## Next Steps

- **[FTP & SFTP](02-ftp-sftp.md)** - File transfer protocols
- **[DNS](04-dns.md)** - DNS utilities

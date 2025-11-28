# WebSocket

> Real-time bidirectional communication with auto-reconnection and heartbeat

Recker provides a full-featured WebSocket client with automatic reconnection, heartbeat/ping support, and both event-based and async iterator APIs.

## Quick Start

```typescript
import { createClient } from 'recker';

const client = createClient({ baseUrl: 'https://api.example.com' });

// Create WebSocket connection
const ws = client.websocket('/chat');

// Listen for messages
ws.on('message', (msg) => {
  console.log('Received:', msg.data);
});

// Send messages
ws.send('Hello, server!');
```

## Creating Connections

### Using Client

```typescript
const client = createClient({ baseUrl: 'https://api.example.com' });

// Relative path (uses baseUrl)
const ws1 = client.websocket('/chat');

// Full URL
const ws2 = client.websocket('wss://chat.example.com/room/123');

// Shorthand alias
const ws3 = client.ws('/notifications');
```

### Direct Import

```typescript
import { ReckerWebSocket } from 'recker';

const ws = new ReckerWebSocket('wss://chat.example.com/room');
await ws.connect();
```

## Configuration Options

```typescript
interface WebSocketOptions {
  /** Protocols to use */
  protocols?: string | string[];

  /** Headers to send during handshake */
  headers?: Record<string, string>;

  /** Undici dispatcher/agent (ProxyAgent, AgentManager) */
  dispatcher?: Dispatcher;

  /** HTTP(S)/SOCKS proxy configuration */
  proxy?: ProxyOptions | string;

  /** TLS options for secure connections */
  tls?: TLSOptions;

  /** Enable permessage-deflate extension */
  perMessageDeflate?: boolean; // default: false

  /** Auto-reconnect on disconnect */
  reconnect?: boolean;  // default: false

  /** Reconnect delay in milliseconds */
  reconnectDelay?: number;  // default: 1000

  /** Max reconnection attempts (0 = infinite) */
  maxReconnectAttempts?: number;  // default: 5

  /** Heartbeat interval in milliseconds (0 = disabled) */
  heartbeatInterval?: number;  // default: 30000

  /** How long to wait for pong before closing/reconnecting */
  heartbeatTimeout?: number; // default: 10000

  /** Await bufferedAmount drain after send (backpressure) */
  awaitDrain?: boolean;
}
```

### Example with Options

```typescript
const ws = client.websocket('/chat', {
  protocols: ['chat-v2', 'chat-v1'],
  headers: {
    'Authorization': 'Bearer token123'
  },
  reconnect: true,
  reconnectDelay: 2000,
  maxReconnectAttempts: 10,
  heartbeatInterval: 30000  // Ping every 30 seconds
  heartbeatTimeout: 10000,
  perMessageDeflate: true,
  proxy: { url: 'http://proxy.internal:8080' }
});
```

## Event-Based API

### Available Events

```typescript
ws.on('open', () => {
  console.log('Connected!');
});

ws.on('message', (msg: WebSocketMessage) => {
  console.log('Data:', msg.data);
  console.log('Is binary:', msg.isBinary);
});

ws.on('close', (code: number, reason: string) => {
  console.log(`Closed: ${code} - ${reason}`);
});

ws.on('error', (error: Error) => {
  console.error('Error:', error);
});

// Reconnection events
ws.on('reconnecting', (attempt: number, delay: number) => {
  console.log(`Reconnecting (attempt ${attempt}) in ${delay}ms...`);
});

ws.on('reconnect-error', (error: Error) => {
  console.error('Reconnection failed:', error);
});

ws.on('max-reconnect-attempts', () => {
  console.log('Max reconnection attempts reached');
});

ws.on('heartbeat-timeout', () => {
  console.log('Heartbeat timed out, reconnecting...');
});
```

### Message Type

```typescript
interface WebSocketMessage {
  data: string | Buffer;
  isBinary: boolean;
}
```

## Async Iterator API

Stream messages using `for await`:

```typescript
const ws = client.websocket('/events');

// Automatically connects
for await (const message of ws) {
  console.log('Message:', message.data);

  if (message.data === 'STOP') {
    break;
  }
}

// Cleanup
ws.close();
```

### With Error Handling

```typescript
try {
  for await (const message of ws) {
    const data = JSON.parse(message.data.toString());
    await processData(data);
  }
} catch (error) {
  console.error('Stream error:', error);
} finally {
  ws.close();
}
```

## Streaming & Backpressure

- `await ws.send(data, { awaitDrain: true })` waits for `bufferedAmount` to fall below the highWaterMark.
- Pipe a stream into the socket:

```typescript
import { createReadStream, createWriteStream } from 'node:fs';

await ws.pipeFrom(createReadStream('./input.bin'), { awaitDrain: true });
await ws.pipeTo(createWriteStream('./output.bin'));
```

## Sending Messages

### Send String

```typescript
ws.send('Hello, server!');
```

### Send Buffer

```typescript
const buffer = Buffer.from('Binary data');
ws.send(buffer);
```

### Send JSON

```typescript
ws.sendJSON({ type: 'ping', timestamp: Date.now() });
```

### Send ArrayBuffer

```typescript
const arrayBuffer = new Uint8Array([1, 2, 3, 4]).buffer;
ws.send(arrayBuffer);
```

## Connection Management

### Connect

```typescript
const ws = new ReckerWebSocket('wss://chat.example.com');
await ws.connect();
```

### Close

```typescript
// Normal closure
ws.close();

// With code and reason
ws.close(1000, 'Client closing');
```

### Ping

Send a heartbeat ping:

```typescript
ws.ping();
```

Note: Heartbeat is automatically sent if `heartbeatInterval` is configured.

### Check Connection State

```typescript
// Get ready state
console.log(ws.readyState);
// WebSocket.CONNECTING = 0
// WebSocket.OPEN = 1
// WebSocket.CLOSING = 2
// WebSocket.CLOSED = 3

// Check if connected
if (ws.isConnected) {
  ws.send('Hello!');
}
```

## Auto-Reconnection

### Basic Reconnection

```typescript
const ws = client.websocket('/chat', {
  reconnect: true,
  reconnectDelay: 1000,
  maxReconnectAttempts: 5
});

ws.on('reconnecting', (attempt, delay) => {
  console.log(`Reconnect attempt ${attempt} in ${delay}ms`);
});

ws.on('open', () => {
  console.log('Connected!');
  // Reconnect counter resets on successful connection
});
```

### Exponential Backoff

Reconnection delay increases exponentially:

```typescript
// Delay formula: reconnectDelay * 2^(attempt - 1)
//
// reconnectDelay = 1000ms
// Attempt 1: 1000ms
// Attempt 2: 2000ms
// Attempt 3: 4000ms
// Attempt 4: 8000ms
// Attempt 5: 16000ms
```

### Infinite Reconnection

```typescript
const ws = client.websocket('/chat', {
  reconnect: true,
  maxReconnectAttempts: 0  // 0 = infinite retries
});
```

### Manual Reconnection Handling

```typescript
const ws = client.websocket('/chat', {
  reconnect: true,
  maxReconnectAttempts: 3
});

ws.on('max-reconnect-attempts', () => {
  console.log('Max retries reached. Trying manual reconnect in 60s...');

  setTimeout(async () => {
    await ws.connect();
  }, 60000);
});
```

## Heartbeat / Keep-Alive

The heartbeat mechanism sends periodic ping frames to keep the connection alive and detect dead connections.

```typescript
const ws = client.websocket('/chat', {
  heartbeatInterval: 30000  // Ping every 30 seconds
});

// Disable heartbeat
const ws2 = client.websocket('/chat', {
  heartbeatInterval: 0  // No automatic pings
});
```

### Manual Ping

```typescript
// Send ping manually
ws.ping();

// Set custom interval
setInterval(() => {
  if (ws.isConnected) {
    ws.ping();
  }
}, 15000);
```

## Complete Examples

### Chat Application

```typescript
import { createClient } from 'recker';

const client = createClient({ baseUrl: 'wss://chat.example.com' });

const chat = client.websocket('/room/general', {
  reconnect: true,
  heartbeatInterval: 30000
});

// Handle incoming messages
chat.on('message', (msg) => {
  const data = JSON.parse(msg.data.toString());

  if (data.type === 'message') {
    console.log(`${data.user}: ${data.text}`);
  } else if (data.type === 'system') {
    console.log(`[System] ${data.text}`);
  }
});

// Send message
function sendMessage(text: string) {
  chat.sendJSON({
    type: 'message',
    text,
    timestamp: Date.now()
  });
}

// Connection status
chat.on('open', () => console.log('✓ Connected to chat'));
chat.on('close', () => console.log('✗ Disconnected from chat'));
chat.on('reconnecting', (attempt) => {
  console.log(`↻ Reconnecting (attempt ${attempt})...`);
});

// Send messages
sendMessage('Hello, everyone!');
```

### Real-Time Dashboard

```typescript
const metrics = client.websocket('/metrics', {
  reconnect: true,
  maxReconnectAttempts: 0,  // Never give up
  heartbeatInterval: 10000
});

// Stream metrics
for await (const message of metrics) {
  const data = JSON.parse(message.data.toString());

  updateDashboard({
    cpu: data.cpu,
    memory: data.memory,
    requests: data.requests
  });
}
```

### Trading Feed with Binary Data

```typescript
const feed = client.websocket('/trading/btc-usd', {
  reconnect: true,
  heartbeatInterval: 5000
});

feed.on('message', (msg) => {
  if (msg.isBinary) {
    // Handle binary tick data
    const buffer = Buffer.from(msg.data);
    const price = buffer.readDoubleLE(0);
    const volume = buffer.readDoubleLE(8);

    console.log(`BTC-USD: $${price} (${volume} BTC)`);
  } else {
    // Handle JSON messages
    const data = JSON.parse(msg.data.toString());
    console.log('Control message:', data);
  }
});
```

### Notifications with Protocols

```typescript
const notifications = client.websocket('/notifications', {
  protocols: ['notifications-v2', 'notifications-v1'],
  reconnect: true,
  headers: {
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'MyApp/1.0'
  }
});

notifications.on('open', () => {
  // Subscribe to topics
  notifications.sendJSON({
    action: 'subscribe',
    topics: ['alerts', 'messages', 'updates']
  });
});

notifications.on('message', (msg) => {
  const notification = JSON.parse(msg.data.toString());
  showNotification(notification);
});
```

## Error Handling

### Connection Errors

```typescript
const ws = client.websocket('/chat');

ws.on('error', (error) => {
  if (error.message.includes('ECONNREFUSED')) {
    console.error('Server is down');
  } else if (error.message.includes('401')) {
    console.error('Authentication failed');
  } else {
    console.error('WebSocket error:', error);
  }
});
```

### Message Parsing Errors

```typescript
ws.on('message', (msg) => {
  try {
    const data = JSON.parse(msg.data.toString());
    handleMessage(data);
  } catch (error) {
    console.error('Failed to parse message:', msg.data);
  }
});
```

### Graceful Shutdown

```typescript
process.on('SIGINT', () => {
  console.log('Shutting down...');
  ws.close(1000, 'Client shutting down');
  process.exit(0);
});
```

## Best Practices

### 1. Always Handle Reconnection

```typescript
const ws = client.websocket('/api', {
  reconnect: true,
  maxReconnectAttempts: 10
});

ws.on('max-reconnect-attempts', () => {
  // Notify user
  alert('Lost connection to server. Please refresh the page.');
});
```

### 2. Use Heartbeat for Long-Lived Connections

```typescript
const ws = client.websocket('/live', {
  heartbeatInterval: 30000  // Prevents idle timeout
});
```

### 3. Parse Messages Safely

```typescript
ws.on('message', (msg) => {
  try {
    const data = JSON.parse(msg.data.toString());
    // Process data
  } catch (error) {
    console.warn('Invalid message format:', msg.data);
  }
});
```

### 4. Clean Up Resources

```typescript
// In React
useEffect(() => {
  const ws = client.websocket('/chat');

  ws.on('message', handleMessage);

  return () => {
    ws.close();  // Cleanup on unmount
  };
}, []);
```

### 5. Authentication

```typescript
const ws = client.websocket('/secure', {
  headers: {
    'Authorization': `Bearer ${getAuthToken()}`
  }
});

// Or send auth after connection
ws.on('open', () => {
  ws.sendJSON({
    action: 'authenticate',
    token: getAuthToken()
  });
});
```

## Troubleshooting

### Connection Fails Immediately

Check if the URL is correct and uses `ws://` or `wss://`:

```typescript
// ✗ Wrong
const ws = client.websocket('http://example.com/chat');

// ✓ Correct
const ws = client.websocket('wss://example.com/chat');
```

### Messages Not Received

Ensure you're listening for events before connection:

```typescript
// ✓ Correct order
const ws = client.websocket('/chat');
ws.on('message', handleMessage);  // Set up handler first

// ✗ Wrong - might miss early messages
const ws = client.websocket('/chat');
await ws.connect();
ws.on('message', handleMessage);  // Too late!
```

### Reconnection Not Working

Check if `reconnect` is enabled:

```typescript
const ws = client.websocket('/chat', {
  reconnect: true  // Must be true!
});
```

## API Reference

### Class: ReckerWebSocket

```typescript
class ReckerWebSocket extends EventEmitter {
  constructor(url: string, options?: WebSocketOptions);

  connect(): Promise<void>;
  send(data: string | Buffer | ArrayBuffer): void;
  sendJSON(data: any): void;
  close(code?: number, reason?: string): void;
  ping(): void;

  readonly readyState: number;
  readonly isConnected: boolean;

  [Symbol.asyncIterator](): AsyncGenerator<WebSocketMessage>;
}
```

### Events

- `open` - Connection established
- `message` - Message received
- `close` - Connection closed
- `error` - Error occurred
- `reconnecting` - Reconnection attempt starting
- `reconnect-error` - Reconnection failed
- `max-reconnect-attempts` - Max retries reached

## See Also

- [Streaming Guide](streaming.md) - Server-Sent Events and streaming responses
- [Client Configuration](client-config.md) - Client setup and configuration
- [Error Handling](error-handling.md) - Error handling strategies

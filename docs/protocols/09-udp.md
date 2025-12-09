# UDP SDK

Programmatic access to Recker's UDP capabilities.

## Overview

The `recker/udp` module provides a unified API for sending UDP datagrams, broadcasting, and service discovery. It includes both a high-level standalone API and a `UDPTransport` that integrates with the main Recker client.

## Quick Start

### Standalone API

The easiest way to send UDP packets.

```typescript
import { udp } from 'recker/udp';

// Send and wait for response
const response = await udp.send('192.168.1.100:5000', Buffer.from('PING'));
console.log(response.body); // Response buffer

// Broadcast
const devices = await udp.broadcast(5000, Buffer.from('DISCOVER'));
console.log(devices); // Array of responses with IP/Port
```

### Client Integration

Use `createUDP` for a persistent client instance.

```typescript
import { createUDP } from 'recker/udp';

const client = createUDP({
  timeout: 5000,
  broadcast: true
});

await client.send('192.168.1.50', 9000, Buffer.from('hello'));
await client.close();
```

## Features

- **Promises:** Async/await API for UDP (usually callback-based).
- **Discovery:** Built-in broadcast and multicast discovery helpers.
- **Retries:** Configurable retransmission logic.
- **Types:** Full TypeScript support.

## API Reference

### `udp` (Standalone)

| Method | Description |
|--------|-------------|
| `send(address, data, options)` | Send packet and wait for response. |
| `broadcast(port, data, options)` | Broadcast to `255.255.255.255`. |
| `discover(group, port, data)` | Multicast discovery. |

### `createUDP(options)`

Creates a `UDPClient` instance.

#### Options

```typescript
interface UDPTransportOptions {
  timeout?: number;          // Default: 5000ms
  retransmissions?: number;  // Default: 3
  broadcast?: boolean;       // Allow broadcast?
  multicastTTL?: number;     // Default: 1
  debug?: boolean;           // Log to console?
}
```

#### Methods

```typescript
class UDPClient {
  // Fire and forget
  send(host: string, port: number, data: Buffer): Promise<void>;

  // Request/Response (via dispatch)
  dispatch(req: ReckerRequest): Promise<ReckerResponse>;

  // Utilities
  broadcast(port: number, data: Buffer): Promise<void>;
  joinMulticast(group: string): void;
  leaveMulticast(group: string): void;
  close(): Promise<void>;
}
```

## Examples

### Service Discovery

Find all devices on the local network listening on port 3000.

```typescript
import { udp } from 'recker/udp';

console.log('Scanning for devices...');

const devices = await udp.broadcast(3000, Buffer.from('WHOIS'), {
  timeout: 2000 // Wait 2s for responses
});

devices.forEach(device => {
  console.log(`Found device at ${device.address}:${device.port}`);
});
```

### Multicast Logging

Send logs to a multicast group.

```typescript
import { createUDP } from 'recker/udp';

const logger = createUDP({
  multicastTTL: 2
});

const LOG_GROUP = '224.0.0.1';
const PORT = 5000;

await logger.send(LOG_GROUP, PORT, Buffer.from('System started'));
```

### DNS Query (Manual)

Construct a raw DNS packet and send it to 8.8.8.8.

```typescript
import { udp } from 'recker/udp';

// (Simplified DNS packet construction)
const dnsPacket = Buffer.from([
  0x00, 0x00, // ID
  0x01, 0x00, // Flags (Standard Query)
  // ... rest of DNS packet
]);

const response = await udp.send('8.8.8.8:53', dnsPacket);
console.log('Received DNS response:', response.data.length, 'bytes');
```

# Protocols

Recker supports multiple protocols beyond HTTP/HTTPS for comprehensive network operations.

## HTTP/3 (QUIC)

HTTP/3 uses QUIC as the transport layer instead of TCP+TLS, providing:
- Faster connection establishment (0-RTT)
- Better multiplexing (no head-of-line blocking)
- Connection migration (seamless network changes)
- Improved congestion control

### Setup

```typescript
import { createClient, Http3Manager, http3 } from 'recker';

const h3Manager = new Http3Manager({
  preferHttp3: true,
  fallback: true,
  enable0RTT: false, // Security tradeoff
  onHttp3: (url) => console.log(`Using HTTP/3 for ${url}`),
  onFallback: (url, reason) => console.log(`Fallback: ${reason}`)
});

const client = createClient({
  baseUrl: 'https://cloudflare.com',
  plugins: [http3({ manager: h3Manager })]
});
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Enable HTTP/3 support |
| `preferHttp3` | boolean | true | Prefer HTTP/3 when available |
| `fallback` | boolean | true | Fallback to HTTP/2 or HTTP/1.1 |
| `connectTimeout` | number | 5000 | QUIC connection timeout (ms) |
| `cacheAltSvc` | boolean | true | Cache Alt-Svc headers |
| `altSvcCacheTtl` | number | 86400000 | Alt-Svc cache TTL (24h) |
| `enable0RTT` | boolean | false | Enable 0-RTT early data |

### Detecting HTTP/3 Support

```typescript
import { detectHttp3Support } from 'recker';

const info = await detectHttp3Support(client, 'https://cloudflare.com');
console.log(info);
// {
//   supported: true,
//   protocols: ['h3', 'h3-29'],
//   endpoint: { host: 'cloudflare.com', port: 443 },
//   altSvcHeader: 'h3=":443"; ma=86400'
// }
```

### Checking Connection Info

```typescript
// After making requests, check HTTP/3 availability
const connectionInfo = h3Manager.getConnectionInfo('https://cloudflare.com');
console.log(connectionInfo);
// {
//   supportsHttp3: true,
//   endpoint: { host: 'cloudflare.com', port: 443, protocol: 'h3' },
//   nativeQuicAvailable: false
// }
```

### Requirements

- Node.js 23+ with `--experimental-quic` flag for native QUIC
- Works without native QUIC by monitoring Alt-Svc headers

---

## FTP

Full-featured FTP client with async/await interface.

### Basic Usage

```typescript
import { createFTP, ftp } from 'recker/protocols';

// Method 1: Manual connection management
const client = createFTP({
  host: 'ftp.example.com',
  user: 'username',
  password: 'password',
  secure: true // FTPS
});

await client.connect();
const files = await client.list('/pub');
await client.download('/pub/file.txt', './local-file.txt');
await client.close();

// Method 2: One-shot operation (auto-connect/disconnect)
const files = await ftp({ host: 'ftp.example.com' }, async (client) => {
  return await client.list('/pub');
});
```

### Configuration

```typescript
interface FTPConfig {
  host: string;
  port?: number;           // Default: 21
  user?: string;           // Default: 'anonymous'
  password?: string;       // Default: 'anonymous@'
  secure?: boolean | 'implicit';
  timeout?: number;        // Default: 30000
  verbose?: boolean;       // Debug logging
}
```

### Operations

```typescript
// List files
const result = await client.list('/path');
// Returns: { success: boolean, data: FTPListItem[] }

// Download
await client.download('/remote/file.txt', './local/file.txt');
await client.downloadToBuffer('/remote/file.txt'); // Returns Buffer
await client.downloadToStream('/remote/file.txt', writeStream);

// Upload
await client.upload('./local/file.txt', '/remote/file.txt');
await client.uploadFromBuffer(buffer, '/remote/file.txt');
await client.uploadFromStream(readStream, '/remote/file.txt');

// File operations
await client.delete('/path/file.txt');
await client.rename('/old/path.txt', '/new/path.txt');
await client.exists('/path/file.txt'); // Returns boolean

// Directory operations
await client.mkdir('/new/directory', true); // recursive
await client.rmdir('/directory');
await client.cd('/path');
await client.pwd(); // Returns current directory
await client.size('/path/file.txt'); // Returns file size
```

### Progress Tracking

```typescript
const client = createFTP({ host: 'ftp.example.com' });

client.progress((info) => {
  console.log(`${info.type}: ${info.bytes}/${info.bytesOverall} - ${info.name}`);
});

await client.connect();
await client.download('/large-file.zip', './file.zip');
```

---

## SFTP

SSH File Transfer Protocol with async/await interface.

```typescript
import { createSFTP, sftp } from 'recker/protocols';

const client = createSFTP({
  host: 'sftp.example.com',
  port: 22,
  username: 'user',
  password: 'pass',
  // Or use privateKey
  // privateKey: fs.readFileSync('/path/to/key')
});

await client.connect();
const files = await client.list('/home/user');
await client.download('/remote/file.txt', './local-file.txt');
await client.close();
```

### One-shot Operations

```typescript
const files = await sftp({ host: 'sftp.example.com' }, async (client) => {
  return await client.list('/home');
});
```

---

## Telnet

Basic Telnet client for legacy systems.

```typescript
import { createTelnet } from 'recker/protocols';

const client = createTelnet({
  host: 'telnet.example.com',
  port: 23,
  timeout: 10000
});

await client.connect();

// Send command and wait for response
const response = await client.exec('help');
console.log(response);

// Interactive session
client.on('data', (data) => console.log(data));
await client.send('command');

await client.close();
```

---

## Protocol Comparison

| Protocol | Port | Encryption | Use Case |
|----------|------|------------|----------|
| HTTP/3 | 443 | TLS 1.3 + QUIC | Modern web APIs |
| FTP | 21 | Optional (FTPS) | Legacy file transfers |
| SFTP | 22 | SSH | Secure file transfers |
| Telnet | 23 | None | Legacy systems, debugging |

## Best Practices

1. **Use SFTP over FTP** when possible for better security
2. **Enable HTTP/3 fallback** to gracefully handle unsupported servers
3. **Set appropriate timeouts** for each protocol
4. **Use one-shot operations** for simple tasks (auto-cleanup)
5. **Always close connections** when using manual connection management

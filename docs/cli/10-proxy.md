# Proxy Server (`rek serve proxy`)

Recker includes a built-in HTTP/HTTPS proxy server with two modes:

- **Forward Proxy** - Standard HTTP proxy that tunnels HTTPS via CONNECT
- **Intercept Proxy** - TLS-terminating proxy for HTTPS inspection (MITM)

## Quick Start

```bash
# Start forward proxy on default port 8888
rek serve proxy

# Start intercept proxy for HTTPS inspection
rek serve proxy --intercept

# Custom port
rek serve proxy --port 3128

# Verbose logging
rek serve proxy --verbose
```

## Sharing with Other Users

The proxy can be shared with other users on your network or the internet.

### Basic Setup

```bash
# Start proxy accessible from any IP
rek serve proxy --host 0.0.0.0 --port 8888

# Your proxy is now available at:
# http://YOUR_IP:8888
```

### Client Configuration

Other users can connect using any HTTP client:

```bash
# curl
curl -x http://YOUR_IP:8888 https://api.github.com/users

# wget
wget -e http_proxy=http://YOUR_IP:8888 http://example.com

# Environment variables (works with most tools)
export HTTP_PROXY=http://YOUR_IP:8888
export HTTPS_PROXY=http://YOUR_IP:8888
curl https://api.github.com/users
```

### Browser Configuration

Users can configure their browsers to use your proxy:

| Browser | Settings Location |
|---------|-------------------|
| Chrome | Settings → System → Proxy settings |
| Firefox | Settings → Network Settings → Manual proxy |
| Safari | System Preferences → Network → Proxies |

**Proxy settings:**
- HTTP Proxy: `YOUR_IP:8888`
- HTTPS Proxy: `YOUR_IP:8888`

### Firewall Configuration

Make sure port 8888 is open:

```bash
# Linux (ufw)
sudo ufw allow 8888/tcp

# Linux (iptables)
sudo iptables -A INPUT -p tcp --dport 8888 -j ACCEPT

# macOS
# Use System Preferences → Security → Firewall → Options
```

### Cloud/VPS Setup

For running on a VPS (DigitalOcean, AWS, Vultr, etc.):

```bash
# 1. SSH into your server
ssh user@your-server

# 2. Install Node.js 18+ and npm/pnpm

# 3. Run proxy in background
npx recker serve proxy --host 0.0.0.0 --port 8888 &

# Or with PM2 for production
pm2 start "npx recker serve proxy --host 0.0.0.0 --port 8888" --name proxy
```

## Forward Proxy Mode

The default mode acts as a standard HTTP proxy:

- HTTP requests are forwarded directly
- HTTPS requests use the CONNECT method for tunneling
- No certificate required - encrypted traffic passes through unchanged

```bash
# Start forward proxy
rek serve proxy

# Test with curl
curl -x http://localhost:8888 http://example.com
curl -x http://localhost:8888 https://example.com
```

### How HTTPS Tunneling Works

```
Client                    Proxy                    Target
  |                         |                         |
  |-- CONNECT host:443 ---->|                         |
  |<-- 200 Connection OK ---|                         |
  |                         |                         |
  |<======= TLS Tunnel (encrypted) =================>|
  |                         |                         |
```

The proxy creates a TCP tunnel - it cannot see HTTPS content in forward mode.

## Intercept Mode (MITM)

Intercept mode terminates TLS on the proxy, allowing inspection of HTTPS traffic:

```bash
# Start intercept proxy
rek serve proxy --intercept

# Or short form
rek serve proxy -i
```

> **Note:** Clients must trust the proxy's CA certificate to avoid TLS errors.

### How Intercept Works

```
Client                    Proxy                    Target
  |                         |                         |
  |-- CONNECT host:443 ---->|                         |
  |<-- 200 Connection OK ---|                         |
  |                         |                         |
  |<-- TLS (Proxy Cert) --->|<-- TLS (Real Cert) --->|
  |                         |                         |
  |    Proxy can read/modify traffic here            |
```

### Generated Certificates

In intercept mode, the proxy dynamically generates certificates for each host:

1. On first run, a CA certificate is created
2. For each HTTPS request, a certificate is generated on-the-fly
3. Certificates are cached in memory for performance

### Trusting the CA Certificate

For intercept mode to work without browser warnings, clients must trust the proxy's CA.

**Export the CA (programmatic):**
```typescript
import { getDefaultCA } from 'recker/testing';

const ca = getDefaultCA();
console.log(ca.cert); // PEM certificate to install
```

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --port <n>` | Port to listen on | 8888 |
| `-h, --host <ip>` | Host to bind to | 0.0.0.0 |
| `-i, --intercept` | Enable intercept mode | false |
| `--log-payloads` | Log request/response bodies | false |
| `-v, --verbose` | Verbose output | false |
| `--timeout <ms>` | Upstream connection timeout | 30000 |

## Shell Integration

In the rek shell, `serve proxy` runs as a background job:

```bash
# Start proxy as background job
serve proxy

# Start with options
serve proxy -p 3128 --verbose

# View active jobs
jobs

# Stop the proxy
jobs stop <id>
```

### Proxy Tab (F4)

When a proxy is running, the Proxy tab shows real-time traffic:

- Request/response list with method, URL, status, size, and latency
- Filter by method, status code, or search text
- Request detail view with headers and body

**Keyboard Shortcuts:**

| Key | Action |
|-----|--------|
| `F4` | Switch to Proxy tab |
| `Ctrl+↑/↓` | Navigate requests |
| `Ctrl+Enter` | View request details |
| `Alt+Y` | Copy as cURL |
| `Alt+C` | Clear requests |
| `Alt+E` | Export as JSON |

## Stats & Monitoring

The proxy tracks comprehensive statistics in real-time:

| Stat | Description |
|------|-------------|
| `totalRequests` | Total requests processed |
| `successCount` | Successful requests (2xx, 3xx) |
| `errorCount` | Failed requests |
| `bytesIn` | Total bytes received from clients |
| `bytesOut` | Total bytes sent to clients |
| `avgLatency` | Average request latency (ms) |
| `requestsPerSecond` | Current RPS (rolling) |
| `activeConnections` | Current open connections |
| `byStatusCode` | Request count by HTTP status |
| `byMethod` | Request count by HTTP method |
| `topHosts` | Top 10 requested hosts |

### Accessing Stats (Programmatic)

```typescript
const proxy = await MockProxyServer.create({ port: 8888 });

// Get current stats
console.log(proxy.stats);
// {
//   totalRequests: 1234,
//   successCount: 1200,
//   errorCount: 34,
//   bytesIn: 1048576,
//   bytesOut: 5242880,
//   avgLatency: 145,
//   requestsPerSecond: 25,
//   activeConnections: 12,
//   byStatusCode: { 200: 1000, 404: 150, 500: 50 },
//   byMethod: { GET: 900, POST: 300, CONNECT: 34 },
//   topHosts: [
//     { host: 'api.github.com', count: 500 },
//     { host: 'api.example.com', count: 300 },
//   ]
// }

// Reset stats
proxy.reset();
```

## mTLS Support

For mutual TLS authentication, provide CA and client certificates:

```bash
# CLI only (not available in shell)
rek serve proxy --mtls \
  --ca-cert ca.pem \
  --ca-key ca-key.pem \
  --client-cert client.pem \
  --client-key client-key.pem
```

### mTLS Options

| Option | Description |
|--------|-------------|
| `--mtls` | Enable mutual TLS |
| `--ca-cert <file>` | CA certificate file |
| `--ca-key <file>` | CA private key file |
| `--client-cert <file>` | Client certificate for upstream |
| `--client-key <file>` | Client private key for upstream |
| `--require-client-cert` | Require client certificate from connecting clients |

## Use Cases

### Debugging API Calls

Inspect all HTTP traffic from an application:

```bash
# Terminal 1: Start intercept proxy
rek serve proxy -i -p 8080

# Terminal 2: Run your app with proxy
HTTP_PROXY=http://localhost:8080 node my-app.js
```

### Testing Rate Limiting

Observe how your client handles rate-limited APIs:

```bash
# Start proxy with verbose logging
rek serve proxy --verbose

# Make requests through proxy
for i in {1..100}; do
  curl -x http://localhost:8888 https://api.example.com/endpoint
done
```

### Recording Traffic

Export captured requests for analysis or replay:

```bash
# In the shell
serve proxy
# Make requests...

# Export to JSON (Alt+E in Proxy tab)
```

### Network Debugging

Debug connectivity issues:

```bash
# Start with verbose to see all connections
rek serve proxy --verbose

# Watch for errors, timeouts, DNS issues
```

### Shared Team Proxy

Set up a proxy for your development team:

```bash
# On a shared server
rek serve proxy --host 0.0.0.0 --port 8888

# Team members configure their tools:
export HTTP_PROXY=http://dev-server:8888
export HTTPS_PROXY=http://dev-server:8888
```

## Programmatic Usage

### Basic Forward Proxy

```typescript
import { MockProxyServer } from 'recker/testing';

// Create forward proxy
const proxy = await MockProxyServer.create({
  port: 8888,
  mode: 'forward',
});

console.log(`Proxy running at ${proxy.url}`);

// Listen for requests
proxy.on('request', (req) => {
  console.log(`${req.method} ${req.url}`);
});

proxy.on('response', (res) => {
  console.log(`Response: ${res.statusCode} (${res.latency}ms)`);
});

// Stop when done
await proxy.stop();
```

### Intercept Mode with Custom CA

```typescript
import { MockProxyServer } from 'recker/testing';
import fs from 'fs';

const proxy = await MockProxyServer.create({
  port: 8080,
  mode: 'intercept',
  mtls: {
    caCert: fs.readFileSync('ca.pem', 'utf-8'),
    caKey: fs.readFileSync('ca-key.pem', 'utf-8'),
  },
});
```

### Request/Response Modification

```typescript
const proxy = await MockProxyServer.create({
  port: 8888,
  mode: 'intercept',
  intercept: {
    logPayloads: true,
    maxPayloadSize: 1024 * 1024, // 1MB

    // Modify requests before forwarding
    modifyRequest: (req) => {
      req.headers['X-Proxy'] = 'Recker';
      req.headers['X-Request-ID'] = crypto.randomUUID();
      return req;
    },

    // Modify responses before returning to client
    modifyResponse: (res) => {
      res.headers['X-Proxy-Latency'] = `${res.latency}ms`;
      return res;
    },
  },
});
```

### Helper Functions

```typescript
import { createForwardProxy, createInterceptProxy } from 'recker/testing';

// Quick forward proxy
const forward = await createForwardProxy(8888);

// Quick intercept proxy
const intercept = await createInterceptProxy(8080);
```

## Events

| Event | Description | Payload |
|-------|-------------|---------|
| `listening` | Server started | `port: number` |
| `request` | Request received | `ProxyRequest` |
| `response` | Response sent | `ProxyResponse` |
| `error` | Error occurred | `ProxyError` |
| `close` | Server stopped | - |
| `reset` | Stats reset | - |

### Event Payloads

**ProxyRequest:**
```typescript
interface ProxyRequest {
  id: string;           // Unique request ID
  timestamp: number;    // Unix timestamp
  method: string;       // HTTP method
  url: string;          // Full URL
  headers: Record<string, string>;
  body?: Buffer;        // If logPayloads enabled
  clientIp: string;     // Client IP address
  targetHost: string;   // Target hostname
  targetPort: number;   // Target port
  isHttps: boolean;     // Is HTTPS request
}
```

**ProxyResponse:**
```typescript
interface ProxyResponse {
  id: string;           // Matches request ID
  timestamp: number;    // Unix timestamp
  statusCode: number;   // HTTP status
  statusText: string;   // HTTP status text
  headers: Record<string, string>;
  body?: Buffer;        // If logPayloads enabled
  latency: number;      // Response time (ms)
  size: number;         // Response size (bytes)
}
```

**ProxyError:**
```typescript
interface ProxyError {
  requestId?: string;   // Request ID if available
  type: 'connection' | 'timeout' | 'tls' | 'upstream' | 'parse';
  message: string;
  error?: Error;        // Original error
  targetHost?: string;
  targetPort?: number;
}
```

## API Reference

### MockProxyServer

```typescript
class MockProxyServer extends EventEmitter {
  // Properties
  readonly port: number;
  readonly address: string;
  readonly url: string;
  readonly isRunning: boolean;
  readonly mode: 'forward' | 'intercept';
  readonly stats: ProxyStats;

  // Lifecycle
  constructor(options?: ProxyServerOptions);
  start(): Promise<void>;
  stop(): Promise<void>;
  reset(): void;

  // Static factory
  static create(options?: ProxyServerOptions): Promise<MockProxyServer>;
}
```

### ProxyServerOptions

```typescript
interface ProxyServerOptions {
  port?: number;              // Default: 0 (random)
  host?: string;              // Default: '127.0.0.1'
  mode?: 'forward' | 'intercept';  // Default: 'forward'
  timeout?: number;           // Default: 30000ms
  verbose?: boolean;          // Default: false

  mtls?: {
    enabled: boolean;
    caCert?: string;          // PEM string
    caKey?: string;           // PEM string
    clientCert?: string;      // For upstream mTLS
    clientKey?: string;
    requireClientCert?: boolean;
  };

  intercept?: {
    logPayloads?: boolean;    // Default: false
    maxPayloadSize?: number;  // Default: 1MB
    modifyRequest?: (req: ProxyRequest) => ProxyRequest | Promise<ProxyRequest>;
    modifyResponse?: (res: ProxyResponse) => ProxyResponse | Promise<ProxyResponse>;
  };
}
```

### ProxyStats

```typescript
interface ProxyStats {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  bytesIn: number;
  bytesOut: number;
  avgLatency: number;
  requestsPerSecond: number;
  activeConnections: number;
  byStatusCode: Record<number, number>;
  byMethod: Record<string, number>;
  topHosts: Array<{ host: string; count: number }>;
}
```

## Certificate Generation

Recker includes utilities for generating certificates:

```typescript
import { generateCA, generateCertificate, getDefaultCA } from 'recker/testing';

// Generate a new CA
const ca = generateCA();
console.log(ca.key);   // Private key PEM
console.log(ca.cert);  // Certificate PEM

// Generate certificate for a host
const cert = await generateCertificate('api.example.com', {
  caCert: ca.cert,
  caKey: ca.key,
  validityDays: 365,
});

// Get or create default CA (cached)
const defaultCA = getDefaultCA();
```

## Limitations

- Intercept mode requires clients to trust the proxy's CA
- WebSocket upgrade is supported in forward mode only
- HTTP/2 is downgraded to HTTP/1.1 in intercept mode
- No built-in authentication (open proxy)
- Single-threaded (Node.js limitation)

## Security Considerations

> ⚠️ **Warning:** Running an open proxy on the internet can be dangerous.

If exposing to the internet, consider:

1. **Firewall rules** - Restrict access to known IPs
2. **Rate limiting** - Use external tools like iptables or nginx
3. **Monitoring** - Watch for abuse via stats
4. **VPN** - Require VPN connection to access

For production use with authentication, consider pairing with nginx:

```nginx
# nginx.conf - Basic auth in front of proxy
server {
    listen 8888;

    auth_basic "Proxy Access";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://localhost:18888;  # Recker proxy
    }
}
```

## Troubleshooting

### Connection Refused

```bash
# Check if proxy is running
curl -x http://localhost:8888 http://example.com

# Check port is open
netstat -tlnp | grep 8888
ss -tlnp | grep 8888
```

### HTTPS Certificate Errors

In intercept mode, clients need to trust the CA:

```bash
# Export CA and install in browser/system
# Or use --insecure flag for testing
curl -x http://localhost:8888 --insecure https://example.com
```

### Timeout Errors

```bash
# Increase timeout
rek serve proxy --timeout 60000
```

### High Memory Usage

With many connections or `logPayloads` enabled:

```bash
# Disable payload logging
rek serve proxy  # Default: logPayloads=false

# Or reset stats periodically (programmatic)
setInterval(() => proxy.reset(), 60000);
```

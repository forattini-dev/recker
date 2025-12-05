# Mock Servers (`rek serve`)

Recker includes built-in mock servers for all supported protocols. These are perfect for:

- **Integration testing** - Test your client code against predictable servers
- **Development** - Work offline with realistic mock responses
- **Demos & tutorials** - Show protocol behavior without external dependencies
- **CI/CD pipelines** - Run tests without network access

## Quick Start

```bash
# Start an HTTP echo server
rek serve http

# Start a WebSocket server
rek serve ws

# Start an HLS streaming server
rek serve hls --mode live
```

## HTTP Server

The mock HTTP server can echo requests, add delays, and handle CORS.

```bash
# Basic server on port 3000
rek serve http

# Custom port and host
rek serve http -p 8080 -h 0.0.0.0

# Echo mode - returns request body in response
rek serve http --echo

# Add artificial latency (useful for testing timeouts)
rek serve http --delay 500

# Disable CORS
rek serve http --no-cors
```

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Returns JSON with request info |
| `POST /` | Returns request body (echo mode) or info |
| `ANY /delay/:ms` | Delays response by specified ms |
| `ANY /status/:code` | Returns specified status code |

### Example: Testing Timeout Handling

```bash
# Terminal 1: Start server with delay
rek serve http --delay 2000

# Terminal 2: Test timeout
rek localhost:3000 --timeout 1000
# Should timeout after 1 second
```

## WebSocket Server

A WebSocket server that echoes messages back by default.

```bash
# Basic WebSocket server on port 8080
rek serve websocket
# or
rek serve ws

# Custom port
rek serve ws -p 9000

# Disable echo (server won't respond to messages)
rek serve ws --no-echo

# Add delay to responses
rek serve ws --delay 100
```

### Example: Testing WebSocket Client

```bash
# Terminal 1: Start server
rek serve ws

# Terminal 2: Connect with rek
rek ws://localhost:8080

# In the WebSocket session:
> hello
< hello
```

## SSE Server (Server-Sent Events)

The SSE server supports automatic events and interactive broadcast mode.

```bash
# Basic SSE server on port 8081
rek serve sse

# Custom interval between events
rek serve sse --interval 2000

# Enable broadcast mode (type messages to broadcast)
rek serve sse --broadcast
```

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /events` | SSE event stream |
| `GET /` | Server info |

### Example: Testing SSE Client

```bash
# Terminal 1: Start server with broadcast
rek serve sse --broadcast

# Terminal 2: Connect as client
curl -N http://localhost:8081/events

# Terminal 1: Type messages to broadcast
> Hello subscribers!
# Client receives: data: Hello subscribers!
```

## HLS Streaming Server

A complete HLS server supporting VOD, live, and event modes.

```bash
# VOD server (pre-recorded content)
rek serve hls

# Live stream mode
rek serve hls --mode live

# Event mode (live without sliding window)
rek serve hls --mode event

# Custom segment configuration
rek serve hls --segments 20 --duration 4

# Multi-quality (adaptive bitrate)
rek serve hls --qualities 1080p,720p,480p,360p
```

### Stream Modes

| Mode | Description |
|------|-------------|
| `vod` | All segments available immediately (default) |
| `live` | Sliding window, new segments appear over time |
| `event` | Like live but segments accumulate (no removal) |

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `/master.m3u8` | Master playlist (multi-quality) |
| `/playlist.m3u8` | Media playlist (single quality) |
| `/<quality>/playlist.m3u8` | Quality-specific playlist |
| `/segment<n>.ts` | Media segments |

### Example: Testing HLS Player

```bash
# Terminal 1: Start live HLS server
rek serve hls --mode live --qualities 720p,480p

# Use with any HLS player (VLC, ffplay, etc.)
ffplay http://localhost:8082/master.m3u8

# Or test with recker's HLS client
node -e "
const { createClient } = require('recker');
const client = createClient();
client.hls('http://localhost:8082/master.m3u8')
  .on('segment', (s) => console.log('Segment:', s.sequence))
  .download('./output.ts');
"
```

## UDP Server

A UDP server for testing datagram protocols.

```bash
# Basic UDP server on port 9000
rek serve udp

# Custom port
rek serve udp -p 5353

# Disable echo
rek serve udp --no-echo
```

### Example: Testing UDP Client

```bash
# Terminal 1: Start server
rek serve udp -p 9000

# Terminal 2: Send UDP message
echo "hello" | nc -u localhost 9000
# Server echoes: hello
```

## DNS Server

A mock DNS server for testing DNS queries without hitting real nameservers.

```bash
# Basic DNS server on port 5353
rek serve dns

# Standard DNS port (requires root/sudo)
sudo rek serve dns -p 53

# Add delay for testing timeout handling
rek serve dns --delay 500
```

### Default Records

The server comes with pre-configured records for common domains:

| Domain | Records |
|--------|---------|
| `localhost` | A: 127.0.0.1, AAAA: ::1 |
| `example.com` | A, AAAA, NS, MX, TXT |
| `test.local` | A: 192.168.1.100 |

### Example: Testing DNS Resolution

```bash
# Terminal 1: Start DNS server
rek serve dns

# Terminal 2: Query with dig
dig @127.0.0.1 -p 5353 example.com A
dig @127.0.0.1 -p 5353 example.com MX
dig @127.0.0.1 -p 5353 localhost AAAA
```

## WHOIS Server

A mock WHOIS server returning realistic domain registration data.

```bash
# Basic WHOIS server on port 4343
rek serve whois

# Standard WHOIS port (requires root)
sudo rek serve whois -p 43

# Add delay
rek serve whois --delay 200
```

### Default Domains

| Domain | Registrar |
|--------|-----------|
| `example.com` | IANA Reserved |
| `google.com` | MarkMonitor Inc. |
| `test.local` | Mock Registrar |

### Example: Testing WHOIS Client

```bash
# Terminal 1: Start server
rek serve whois

# Terminal 2: Query domains
whois -h 127.0.0.1 -p 4343 example.com
whois -h 127.0.0.1 -p 4343 google.com
```

## Telnet Server

A mock Telnet server with built-in commands and echo mode.

```bash
# Basic Telnet server on port 2323
rek serve telnet

# Disable echo
rek serve telnet --no-echo

# Add delay to commands
rek serve telnet --delay 100
```

### Built-in Commands

| Command | Description |
|---------|-------------|
| `help` | Show available commands |
| `echo <msg>` | Echo message back |
| `date` | Show current date |
| `time` | Show current time |
| `ping` | Returns "pong" |
| `uptime` | Show server uptime |
| `quit` / `exit` | Disconnect |

### Example: Testing Telnet Client

```bash
# Terminal 1: Start server
rek serve telnet

# Terminal 2: Connect
telnet localhost 2323

# In telnet session:
> help
> ping
pong
> echo Hello World
Hello World
> quit
```

## FTP Server

A mock FTP server with virtual filesystem and authentication.

```bash
# Basic FTP server on port 2121
rek serve ftp

# Require authentication (no anonymous)
rek serve ftp --no-anonymous

# Custom credentials
rek serve ftp -u admin --password secret

# Add delay
rek serve ftp --delay 100
```

### Default Files

| Path | Description |
|------|-------------|
| `/welcome.txt` | Welcome message |
| `/readme.md` | README file |
| `/data/sample.json` | Sample JSON data |
| `/public/index.html` | HTML file |

### Authentication

- **Anonymous**: user `anonymous` or `ftp` (enabled by default)
- **Authenticated**: user `user`, password `pass`

### Example: Testing FTP Client

```bash
# Terminal 1: Start server
rek serve ftp

# Terminal 2: Connect with ftp
ftp localhost 2121

# In FTP session:
> user anonymous
> ls
> cd data
> get sample.json
> quit
```

## Use Cases

### CI/CD Testing

```yaml
# GitHub Actions example
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start mock server
        run: npx recker serve http &

      - name: Run tests
        run: npm test
```

### Development Workflow

```bash
# Start all mock servers in separate terminals
rek serve http -p 3000 &
rek serve ws -p 8080 &
rek serve hls --mode live &

# Now develop against local endpoints
```

### Protocol Integration Testing

```bash
# Test HLS with different qualities
rek serve hls --qualities 1080p,720p,480p,360p

# Test WebSocket reconnection
rek serve ws --delay 1000  # Slow responses

# Test HTTP retry behavior
rek serve http --delay 5000  # Very slow
```

## Programmatic Usage

All mock servers are also available as a library:

```typescript
import {
  MockHttpServer,
  MockWebSocketServer,
  MockSSEServer,
  MockHlsServer,
  MockUDPServer,
  MockDnsServer,
  MockWhoisServer,
  MockTelnetServer,
  MockFtpServer
} from 'recker/testing';

// Create and start servers
const http = await MockHttpServer.create({ port: 3000 });
const ws = await MockWebSocketServer.create({ port: 8080 });
const hls = await MockHlsServer.create({ mode: 'live' });
const dns = await MockDnsServer.create({ port: 5353 });
const ftp = await MockFtpServer.create({ port: 2121 });

// Add custom data
dns.addRecord('myapp.local', 'A', '192.168.1.50');
ftp.addFile('/custom.txt', 'Custom content');

// Use in tests
const response = await fetch('http://localhost:3000/test');
await ws.broadcast('Hello from test!');

// Clean up
await http.stop();
await ws.stop();
await hls.stop();
await dns.stop();
await ftp.stop();
```

See [Testing Reference](/reference/03-testing.md) for more details on programmatic usage.

## Command Reference

| Command | Description | Default Port |
|---------|-------------|--------------|
| `rek serve http` | HTTP mock server | 3000 |
| `rek serve ws` | WebSocket server | 8080 |
| `rek serve websocket` | WebSocket server (alias) | 8080 |
| `rek serve sse` | SSE server | 8081 |
| `rek serve hls` | HLS streaming | 8082 |
| `rek serve udp` | UDP server | 9000 |
| `rek serve dns` | DNS server | 5353 |
| `rek serve whois` | WHOIS server | 4343 |
| `rek serve telnet` | Telnet server | 2323 |
| `rek serve ftp` | FTP server | 2121 |

### Common Options

| Option | Description |
|--------|-------------|
| `-p, --port <n>` | Port to listen on |
| `-h, --host <addr>` | Host to bind to (default: 127.0.0.1) |
| `--echo` / `--no-echo` | Enable/disable echo mode |
| `--delay <ms>` | Add response delay |

## Next Steps

- **[Testing Reference](/reference/03-testing.md)** - Use mock servers in your tests
- **[Protocols](/cli/06-protocols.md)** - Learn about protocol support
- **[Load Testing](/cli/05-load-testing.md)** - Benchmark with mock servers

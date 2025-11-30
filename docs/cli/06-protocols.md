# Special Protocols

Beyond HTTP, Recker supports WebSocket and UDP protocols directly from the CLI.

## WebSocket

### Quick Start

Connect to any WebSocket server:

```bash
rek ws://echo.websocket.org
# or secure
rek wss://echo.websocket.org
```

### Interactive Mode

Once connected, you enter an interactive chat mode:

```
🔌 WebSocket Connected
Server: wss://echo.websocket.org
Type messages to send. Ctrl+C to exit.
──────────────────────────────────────

You › Hello, WebSocket!
Server › Hello, WebSocket!

You › {"action": "ping"}
Server › {"action": "ping"}
```

### Features

| Feature | Description |
|---------|-------------|
| Real-time messaging | Send and receive instantly |
| Color-coded output | Distinguish your messages from server responses |
| JSON support | Send JSON objects as strings |
| Binary support | Display binary frames info |

### Commands

| Input | Action |
|-------|--------|
| Any text | Send as message |
| `Ctrl+C` | Disconnect and exit |

### With Headers

Pass authentication headers:

```bash
rek wss://api.example.com/ws Authorization:"Bearer token123"
```

### Examples

#### Echo Server

```bash
rek wss://echo.websocket.org

You › Hello!
Server › Hello!

You › Testing 1 2 3
Server › Testing 1 2 3
```

#### Chat Application

```bash
rek wss://chat.example.com/room/general \
  Authorization:"Bearer user-token" \
  X-User-Id:"12345"

You › {"type": "join", "room": "general"}
Server › {"type": "system", "message": "User joined"}

You › {"type": "message", "text": "Hello everyone!"}
Server › {"type": "message", "from": "You", "text": "Hello everyone!"}
```

#### Real-time Data Feed

```bash
rek wss://stream.example.com/stocks

Server › {"symbol": "AAPL", "price": 178.25, "change": +1.2}
Server › {"symbol": "GOOGL", "price": 141.80, "change": -0.5}
Server › {"symbol": "MSFT", "price": 378.91, "change": +0.8}

You › {"subscribe": "TSLA"}
Server › {"subscribed": "TSLA"}
Server › {"symbol": "TSLA", "price": 251.30, "change": +2.1}
```

### From the Shell

```bash
› ws wss://echo.websocket.org
# Enters WebSocket mode

# When done, Ctrl+C returns to shell
›
```

## UDP

Send UDP datagrams for fire-and-forget messaging.

### Quick Start

```bash
rek udp://127.0.0.1:3000 hello="world"
```

### Syntax

```bash
rek udp://host:port [data...]
```

### Examples

#### Simple Message

```bash
rek udp://localhost:5000 message="ping"
```

#### JSON Payload

```bash
rek udp://192.168.1.100:8080 \
  action="notify" \
  level:=1 \
  timestamp:=1699999999
```

Sends:
```json
{"action":"notify","level":1,"timestamp":1699999999}
```

#### Monitoring/Logging

```bash
# Send log message to syslog-style server
rek udp://logserver.local:514 \
  priority:=134 \
  message="Application started"
```

### From the Shell

```bash
› udp://192.168.1.50:9000 status="heartbeat"
UDP packet -> udp://192.168.1.50:9000
✔ Sent/Received
```

### Notes

- UDP is connectionless and unreliable
- No guarantee of delivery
- No response expected (fire-and-forget)
- Useful for logging, metrics, notifications

## Protocol Detection

Recker automatically detects the protocol from the URL scheme:

| Scheme | Protocol | Mode |
|--------|----------|------|
| `http://`, `https://` | HTTP | Standard request |
| `ws://`, `wss://` | WebSocket | Interactive chat |
| `udp://` | UDP | Fire-and-forget |

### Examples

```bash
# HTTP (default)
rek api.example.com/users

# HTTPS (auto-upgraded)
rek example.com/secure

# WebSocket
rek ws://socket.example.com

# Secure WebSocket
rek wss://socket.example.com

# UDP
rek udp://metrics.example.com:9000
```

## Comparison with HTTP

| Feature | HTTP | WebSocket | UDP |
|---------|------|-----------|-----|
| Connection | Request/Response | Persistent | None |
| Direction | Client → Server | Bidirectional | Client → Server |
| Reliability | Guaranteed | Guaranteed | None |
| Use Case | APIs | Real-time | Logging/Metrics |
| Interactive | No | Yes | No |

## Tips

### WebSocket Debugging

Use WebSocket to test real-time features:

```bash
# Test your chat server
rek wss://localhost:3000/chat

# Monitor live updates
rek wss://api.example.com/live-updates
```

### UDP for Local Development

Test UDP endpoints locally:

```bash
# Terminal 1: Start a netcat listener
nc -u -l 5000

# Terminal 2: Send with rek
rek udp://localhost:5000 test="message"
```

### Secure Connections

Always use secure variants in production:
- `wss://` instead of `ws://`
- No secure variant for UDP (use VPN if needed)

## Next Steps

- **[Presets](07-presets.md)** - Quick access to popular APIs
- **[Quick Start](02-quick-start.md)** - Review HTTP syntax

# Special Protocols

Beyond HTTP, Recker supports WebSocket, UDP, WHOIS, DNS, and GeoIP protocols directly from the CLI.

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

## WHOIS

Query domain registration information.

### Domain Lookup

```bash
rek whois github.com
```

Output:
```
WHOIS Lookup: github.com
─────────────────────────────────────────
Registrar:           MarkMonitor Inc.
Created:             2007-10-09
Expires:             2024-10-09
Updated:             2023-09-07
Status:              clientDeleteProhibited
                     clientTransferProhibited
                     clientUpdateProhibited
Name Servers:        dns1.p08.nsone.net
                     dns2.p08.nsone.net
                     dns3.p08.nsone.net
                     dns4.p08.nsone.net
```

### IP Address Lookup

```bash
rek whois 8.8.8.8
```

Output:
```
WHOIS Lookup: 8.8.8.8
─────────────────────────────────────────
Network:             8.8.8.0/24
Organization:        Google LLC
Country:             US
```

### Domain Availability

```bash
rek whois my-new-startup.com --available
```

Output:
```
✓ my-new-startup.com is available for registration
```

## DNS

Perform DNS lookups with various record types.

### Quick Start

```bash
# A records (default)
rek dns google.com

# Specific record type
rek dns google.com --type MX
rek dns google.com --type TXT
rek dns google.com --type AAAA
```

### Record Types

| Type | Description |
|------|-------------|
| `A` | IPv4 address (default) |
| `AAAA` | IPv6 address |
| `MX` | Mail exchange |
| `TXT` | Text records |
| `NS` | Name servers |
| `CNAME` | Canonical name |
| `SOA` | Start of authority |
| `PTR` | Pointer (reverse DNS) |

### Examples

```bash
# Get all A records
rek dns api.github.com
# 140.82.112.5
# 140.82.112.6

# Get MX records
rek dns google.com --type MX
# 10 smtp.google.com
# 20 smtp2.google.com

# Get TXT records (SPF, DKIM, etc.)
rek dns github.com --type TXT
# "v=spf1 ip4:192.30.252.0/22 include:..."
```

### Custom DNS Server

```bash
# Use Cloudflare DNS
rek dns example.com --server 1.1.1.1

# Use Google DNS
rek dns example.com --server 8.8.8.8
```

## GeoIP

Get geographic and network information for IP addresses.

### Quick Start

```bash
rek geoip 8.8.8.8
```

Output:
```
GeoIP: 8.8.8.8
─────────────────────────────────────────
Country:             United States (US)
Region:              California
City:                Mountain View
Timezone:            America/Los_Angeles
Organization:        Google LLC
ASN:                 AS15169
Coordinates:         37.4056, -122.0775
```

### Features

- **Offline lookups** - Uses MaxMind GeoLite2 database
- **IPv4 and IPv6** - Full support for both protocols
- **Bogon detection** - Identifies private/reserved IPs

### Bogon Detection

Automatically detects non-routable IP addresses:

```bash
rek geoip 192.168.1.1
```

Output:
```
GeoIP: 192.168.1.1
─────────────────────────────────────────
⚠ Bogon IP (Private Network - RFC 1918)
This is a private IP address and has no public geolocation data.
```

Bogon types detected:
- Private networks (10.x, 172.16-31.x, 192.168.x)
- Loopback (127.x)
- Link-local (169.254.x, fe80::)
- Multicast (224.x - 239.x, ff00::)
- Documentation (192.0.2.x, 2001:db8::)
- Carrier-grade NAT (100.64-127.x)

## RDAP

Modern replacement for WHOIS with structured JSON output.

### Quick Start

```bash
rek rdap google.com
```

Output:
```json
{
  "handle": "2138514_DOMAIN_COM-VRSN",
  "ldhName": "google.com",
  "status": ["clientDeleteProhibited", "clientTransferProhibited"],
  "events": [
    { "eventAction": "registration", "eventDate": "1997-09-15T04:00:00Z" },
    { "eventAction": "expiration", "eventDate": "2028-09-14T04:00:00Z" }
  ]
}
```

### Unsupported TLDs

Some TLDs don't support RDAP. Use WHOIS instead:

```bash
# .io doesn't support RDAP
rek rdap example.io
# Error: RDAP is not available for .io domains. Use WHOIS instead: "rek whois example.io"

# Use WHOIS for unsupported TLDs
rek whois example.io
```

## Protocol Detection

Recker automatically detects the protocol from the URL scheme:

| Scheme | Protocol | Mode |
|--------|----------|------|
| `http://`, `https://` | HTTP | Standard request |
| `ws://`, `wss://` | WebSocket | Interactive chat |
| `udp://` | UDP | Fire-and-forget |

### Commands

| Command | Description |
|---------|-------------|
| `rek whois <domain>` | WHOIS lookup |
| `rek dns <domain>` | DNS lookup |
| `rek geoip <ip>` | GeoIP lookup |
| `rek rdap <domain>` | RDAP lookup |

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

# WHOIS
rek whois github.com

# DNS
rek dns google.com --type MX

# GeoIP
rek geoip 1.1.1.1
```

## Comparison with HTTP

| Feature | HTTP | WebSocket | UDP | WHOIS | DNS |
|---------|------|-----------|-----|-------|-----|
| Connection | Request/Response | Persistent | None | TCP 43 | UDP 53 |
| Direction | Client → Server | Bidirectional | Client → Server | Request/Response | Request/Response |
| Reliability | Guaranteed | Guaranteed | None | Guaranteed | Best-effort |
| Use Case | APIs | Real-time | Logging | Registration | Name resolution |
| Interactive | No | Yes | No | No | No |

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

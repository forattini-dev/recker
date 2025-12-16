# Protocols

Recker is a multi-protocol Swiss Army knife. Beyond standard HTTP, it supports a wide range of network protocols.

## File Transfer (FTP/SFTP)

### FTP
Standard File Transfer Protocol. Supports plain FTP, FTPS (explicit TLS), and implicit FTPS.

```bash
# List directory
rek ftp ls ftp.example.com /pub

# Download file with credentials
rek ftp get ftp.example.com /data.csv user=admin pass=secret

# Upload file using FTPS
rek ftp put ftp.example.com ./local.txt /remote.txt secure
```

### SFTP
Secure File Transfer Protocol over SSH.

```bash
# List files
rek sftp ls sftp.example.com

# Upload
rek sftp put sftp.example.com ./app.zip /var/www/app.zip user=root
```

## API Protocols

### GraphQL
Execute queries and mutations against GraphQL endpoints.

```bash
# Inline query
rek graphql https://api.github.com/graphql query="{ viewer { login } }" Authorization:"Bearer token"

# Query from file with variables
rek graphql api.com/graphql file=query.gql variables='{"id": 123}'
```

### JSON-RPC
Call methods on JSON-RPC 2.0 endpoints.

```bash
# Positional parameters
rek jsonrpc api.com/rpc sum 10 20

# Named parameters
rek jsonrpc api.com/rpc createUser --named name="John" age:=30
```

### SOAP
Make SOAP 1.1/1.2 requests with automatic envelope generation.

```bash
# Call action with parameters
rek soap https://api.example.com/soap GetWeather city="London" country="UK"
```

### OData
Query OData V4 services with fluent syntax.

```bash
# Filter and select
rek odata https://services.odata.org/V4/Northwind/Northwind.svc Products \
  filter="UnitPrice gt 20" \
  select="ProductName,UnitPrice" \
  top=5
```

## Real-Time & Streaming

### WebSocket
Interactive WebSocket client with auto-reconnect.

```bash
# Connect to server
rek ws://echo.websocket.org

# Send messages interactively or pipe them
echo "ping" | rek ws://echo.websocket.org
```

### Server-Sent Events (SSE)
Stream events from an SSE endpoint.

```bash
# Listen to events
rek sse https://api.example.com/events

# With headers
rek sse api.com/stream Authorization:"Bearer token"
```

## Low-Level Network

### Telnet
Connect to raw TCP services.

```bash
# Watch Star Wars
rek telnet towel.blinkenlights.nl

# Test SMTP
rek telnet smtp.gmail.com 587
```

### UDP
Send connectionless UDP datagrams.

```bash
# Send log message
rek udp://logs.internal:514 priority:=1 message="System started"
```

## Discovery & Info

### DNS
Advanced DNS lookup and diagnostics.

```bash
# Quick lookup
rek dns google.com

# Check global propagation
rek dns propagate google.com

# Health check
rek dns health google.com
```

### WHOIS / RDAP
Domain registration information.

```bash
# Legacy WHOIS
rek whois github.com

# Modern RDAP (JSON)
rek rdap google.com
```

### TLS
Inspect SSL/TLS certificates.

```bash
rek tls api.stripe.com
```

### GeoIP
Locate IP addresses.

```bash
rek ip 8.8.8.8
```
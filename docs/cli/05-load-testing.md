# Load Testing

Turn your terminal into a professional load testing tool. Recker includes a full benchmark engine with a real-time TUI (Text User Interface) dashboard.

## Quick Start

### From Command Line

```bash
rek bench load https://api.example.com/endpoint users=50 duration=30
```

### From the Shell

```bash
› url https://api.example.com
› load /endpoint users=50 duration=30
```

## Options

| Option | Alias | Default | Description |
|--------|-------|---------|-------------|
| `users` | `u` | 50 | Number of concurrent virtual users |
| `duration` | `d`, `time` | 300 | Test duration in seconds |
| `ramp` | `rampup` | 2 | Ramp-up time (seconds to reach full users) |
| `mode` | `m` | throughput | Test mode |
| `http2` | - | false | Force HTTP/2 protocol |

### Examples

```bash
# Basic test
rek bench load api.example.com users=100 duration=60

# With ramp-up
rek bench load api.example.com users=200 duration=120 ramp=30

# Stress test with HTTP/2
rek bench load api.example.com mode=stress http2=true users=500

# Realistic simulation
rek bench load api.example.com mode=realistic users=50 duration=300
```

## Test Modes

### Throughput Mode (Default)

Maximizes requests per second. All virtual users send requests as fast as possible.

```bash
rek bench load api.example.com mode=throughput users=100
```

**Use for:**
- Finding maximum server capacity
- Baseline performance metrics
- Quick stress tests

### Stress Mode

Gradually increases load beyond normal capacity to find breaking points.

```bash
rek bench load api.example.com mode=stress users=500 duration=300
```

**Use for:**
- Finding system limits
- Identifying failure points
- Capacity planning

### Realistic Mode

Simulates real-world usage patterns with think time between requests.

```bash
rek bench load api.example.com mode=realistic users=50 duration=600
```

**Use for:**
- Simulating production traffic
- Long-running stability tests
- User behavior simulation

## The Dashboard

When a load test starts, Recker enters an alternate screen mode with a real-time dashboard:

```
🔥 Rek Load Generator
Target: https://api.example.com/endpoint
Mode: THROUGHPUT
Press ESC to stop

Time: 45s / 300s (255s left)   Reqs: 1,523
Users: 50   RPS: 34   Latency (P95): 145ms   Errors: 0
──────────────────────────────────────────────────

👥 Active Users (Ramp-up)
      50.00 ┼─────────────────────────────────────────────
      40.00 ┤                  ╭───────────────────────────
      30.00 ┤             ╭─────╯
      20.00 ┤        ╭─────╯
      10.00 ┤   ╭─────╯
       0.00 ┼───╯

⚡ Requests per Second
      40.00 ┼                              ╭──────────────
      32.00 ┤                         ╭─────╯
      24.00 ┤                    ╭─────╯
      16.00 ┤               ╭─────╯
       8.00 ┤          ╭─────╯
       0.00 ┼──────────╯

⏱️  Latency P95 (ms)
     180.00 ┼──────────────────────────────────────────────
     144.00 ┤                              ╭──────────────
     108.00 ┤                         ╭─────╯
      72.00 ┤                    ╭─────╯
      36.00 ┤               ╭─────╯
       0.00 ┼───────────────╯
```

### Dashboard Metrics

| Metric | Description |
|--------|-------------|
| **Time** | Elapsed / Total (Remaining) |
| **Reqs** | Total requests completed |
| **Users** | Currently active virtual users |
| **RPS** | Current requests per second |
| **Latency (P95)** | 95th percentile response time |
| **Errors** | Failed request count |

### Charts

| Chart | Shows |
|-------|-------|
| **Active Users** | Ramp-up curve over time |
| **Requests per Second** | Throughput over time |
| **Latency P95** | Response time trends |

## Ramp-up

Ramp-up gradually increases the number of virtual users to avoid sudden spikes:

```bash
# Start with 0 users, reach 100 users over 30 seconds
rek bench load api.example.com users=100 ramp=30
```

The **Active Users** chart shows this progression:

```
      100.00 ┤                              ╭──────────────
       80.00 ┤                         ╭─────╯
       60.00 ┤                    ╭─────╯
       40.00 ┤               ╭─────╯
       20.00 ┤          ╭─────╯
        0.00 ┼──────────╯
             └─────────────────────────────────────────────
             0s                                       30s
```

## HTTP/2

Enable HTTP/2 for testing modern APIs:

```bash
rek bench load api.example.com http2=true users=100
# or
rek bench load api.example.com http2
```

HTTP/2 benefits:
- Multiplexed requests over single connection
- Header compression
- Better performance for multiple requests

## Interpreting Results

### Healthy Response

```
RPS: 500   Latency (P95): 45ms   Errors: 0
```
- High throughput
- Low, consistent latency
- No errors

### Warning Signs

```
RPS: 50   Latency (P95): 2500ms   Errors: 12
```
- Dropping throughput
- Rising latency
- Increasing errors

### Breaking Point

```
RPS: 5   Latency (P95): 15000ms   Errors: 847
```
- Very low throughput
- Extreme latency (timeouts)
- Many errors

## Best Practices

### 1. Warm Up First

Run a short test to warm up the server:

```bash
rek bench load api.example.com users=10 duration=30
```

### 2. Start Small

Begin with low user counts and increase:

```bash
# First run
rek bench load api.example.com users=10 duration=60

# If stable, increase
rek bench load api.example.com users=50 duration=60

# Continue increasing
rek bench load api.example.com users=100 duration=60
```

### 3. Use Realistic Ramp-up

Avoid sudden load spikes:

```bash
# Good: 60 second ramp-up for 200 users
rek bench load api.example.com users=200 ramp=60 duration=300
```

### 4. Test Different Endpoints

Don't just test one endpoint:

```bash
rek bench load api.example.com/users users=50 duration=60
rek bench load api.example.com/products users=50 duration=60
rek bench load api.example.com/orders users=50 duration=60
```

### 5. Monitor Server-Side

While running load tests, monitor:
- CPU usage
- Memory consumption
- Database connections
- Error logs

## Stopping Tests

Press `ESC` at any time to stop the test gracefully. The final statistics will be displayed.

## From Shell Context

When running from the shell, the base URL is used:

```bash
› url https://api.example.com
Base URL set to: https://api.example.com

› load /heavy-endpoint users=100 duration=60
# Tests: https://api.example.com/heavy-endpoint
```

## Examples

### API Endpoint Test

```bash
rek bench load https://api.myapp.com/v1/users \
  users=100 \
  duration=120 \
  ramp=20 \
  mode=throughput
```

### Stress Test

```bash
rek bench load https://api.myapp.com/v1/compute \
  users=500 \
  duration=300 \
  mode=stress \
  http2=true
```

### Long-Running Stability Test

```bash
rek bench load https://api.myapp.com/v1/health \
  users=25 \
  duration=3600 \
  mode=realistic \
  ramp=60
```

## Next Steps

- **[Protocols](06-protocols.md)** - WebSocket and UDP
- **[Presets](07-presets.md)** - Quick access to popular APIs

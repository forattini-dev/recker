# Telnet

Native Telnet protocol implementation with **zero external dependencies**.

Remote command execution over Telnet protocol using only Node.js built-in modules (`node:net`, `node:events`).

## Quick Start

```typescript
import { createTelnet, telnet } from 'recker/protocols';

// One-shot operation
const result = await telnet({
  host: 'router.local',
  username: 'admin',
  password: 'admin'
}, async (client) => {
  return await client.exec('show version');
});

console.log(result.data);

// Or manual connection
const client = createTelnet({
  host: 'switch.local',
  port: 23
});

await client.connect();
const output = await client.exec('show interfaces');
console.log(output.data);
await client.close();
```

## Configuration

### Basic Setup

```typescript
import { createTelnet } from 'recker/protocols';

const client = createTelnet({
  host: 'device.local',
  port: 23,                           // Default: 23
  timeout: 10000,                     // Connection timeout
  username: 'admin',
  password: 'secret'
});
```

### Full Options

```typescript
const client = createTelnet({
  host: 'device.local',
  port: 23,
  timeout: 10000,

  // Authentication
  username: 'admin',
  password: 'secret',

  // Prompts (regex or string)
  shellPrompt: /[$#>]\s*$/,           // Command prompt
  loginPrompt: /login[: ]*$/i,        // Login prompt
  passwordPrompt: /password[: ]*$/i,  // Password prompt

  // Execution options
  execTimeout: 5000,                  // Command timeout
  sendTimeout: 2000,                  // Send timeout
  maxBufferLength: 1024 * 1024,       // Max buffer (1MB)

  // Terminal options
  terminalType: 'xterm-256color',     // Terminal type for TTYPE
  windowSize: [80, 24],               // [width, height] for NAWS

  // Other options
  initialLFCR: true,                  // Send LF/CR at start
  pageSeparator: /--More--/,          // Paging prompt
  debug: false                        // Debug output
});
```

## Command Execution

### Basic Commands

```typescript
const result = await client.exec('show running-config');

if (result.success) {
  console.log(result.data);
} else {
  console.error('Command failed:', result.message);
}
```

### Multiple Commands

```typescript
await client.connect();

const version = await client.exec('show version');
const interfaces = await client.exec('show interfaces');
const config = await client.exec('show running-config');

console.log(version.data);
console.log(interfaces.data);
console.log(config.data);

await client.close();
```

### With Custom Options

```typescript
const result = await client.exec('show very-long-output', {
  shellPrompt: /MyDevice#/,          // Override prompt
  timeout: 30000,                    // Longer timeout
  sendTimeout: 5000
});
```

### Send Without Waiting

```typescript
// Send data without waiting for prompt
await client.send('some-data\r\n');

// Send and wait for specific pattern
const result = await client.send('show interfaces', {
  timeout: 5000,
  waitFor: /Interface\s+Status/
});
```

## Interactive Sessions

### Enable Mode

```typescript
await client.connect();

// Enter enable mode
await client.exec('enable');
await client.send(enablePassword, { waitFor: /#/ });

// Now execute privileged commands
const config = await client.exec('show running-config');

await client.close();
```

### Configuration Mode

```typescript
await client.connect();

// Enter config mode
await client.exec('configure terminal');

// Make changes
await client.exec('interface GigabitEthernet0/1');
await client.exec('description WAN Link');
await client.exec('no shutdown');
await client.exec('exit');

// Save config
await client.exec('write memory');

await client.close();
```

### Paged Output

```typescript
const client = createTelnet({
  host: 'switch.local',
  username: 'admin',
  password: 'admin',
  pageSeparator: /--More--|<--- More --->/ // Handle paging
});

await client.connect();

// Disable paging first
await client.exec('terminal length 0');

// Now get full output
const result = await client.exec('show running-config');

await client.close();
```

## Wait for Patterns

### Wait for Specific Output

```typescript
// Wait for pattern before continuing
await client.waitFor(/Ready/);

// With timeout
await client.waitFor(/System initialized/, 30000);
```

### Shell Command

```typescript
// Alias for exec
const result = await client.shell('ls -la');
```

## One-Shot Operations

```typescript
import { telnet } from 'recker/protocols';

// Single command
const output = await telnet({
  host: 'router.local',
  username: 'admin',
  password: 'admin'
}, async (client) => {
  return await client.exec('show version');
});

// Multiple commands
await telnet({
  host: 'switch.local',
  username: 'admin',
  password: 'admin'
}, async (client) => {
  await client.exec('configure terminal');
  await client.exec('hostname NewSwitch');
  await client.exec('exit');
  await client.exec('write memory');
});
```

## Network Device Patterns

### Cisco IOS

```typescript
const client = createTelnet({
  host: 'router.cisco.com',
  username: 'admin',
  password: 'password',
  shellPrompt: /Router[>#]/,
  loginPrompt: /Username:/i,
  passwordPrompt: /Password:/i
});

await client.connect();

// Enter privileged mode
await client.send('enable');
await client.send('enablePassword', { waitFor: /#/ });

// Get config
const config = await client.exec('show running-config');

await client.close();
```

### Juniper JunOS

```typescript
const client = createTelnet({
  host: 'router.juniper.com',
  username: 'admin',
  password: 'password',
  shellPrompt: />\s*$/,
  loginPrompt: /login:/i,
  passwordPrompt: /Password:/i
});

await client.connect();

const config = await client.exec('show configuration');

await client.close();
```

### Linux Server

```typescript
const client = createTelnet({
  host: 'server.local',
  username: 'root',
  password: 'password',
  shellPrompt: /[$#]\s*$/
});

await client.connect();

const uptime = await client.exec('uptime');
const disk = await client.exec('df -h');
const memory = await client.exec('free -m');

await client.close();
```

## Error Handling

```typescript
const client = createTelnet({
  host: 'device.local',
  timeout: 5000
});

const result = await client.connect();

if (!result.success) {
  console.error('Connection failed:', result.message);
  return;
}

const output = await client.exec('show version');

if (!output.success) {
  console.error('Command failed:', output.message);
}

await client.close();
```

### Timeout Handling

```typescript
const client = createTelnet({
  host: 'slow-device.local',
  timeout: 30000,          // Connection timeout
  execTimeout: 60000       // Command execution timeout
});
```

### Connection Cleanup

```typescript
const client = createTelnet({ host: 'device.local' });

try {
  await client.connect();
  // Operations...
} finally {
  await client.close();
}

// Or force disconnect
client.destroy();
```

## Advanced Usage

### Access Underlying Socket

```typescript
const socket = client.getSocket();

// Access raw Node.js socket for advanced operations
socket.on('data', (data) => {
  console.log('Raw data:', data.toString());
});

// The Telnet client also extends EventEmitter
client.on('data', (buffer) => {
  console.log('Processed data:', buffer.toString());
});

client.on('command', (cmd, option) => {
  console.log('IAC command:', cmd, 'option:', option);
});

client.on('close', () => {
  console.log('Connection closed');
});
```

### Custom Shell Prompts

```typescript
// Multiple possible prompts
const client = createTelnet({
  host: 'device.local',
  shellPrompt: /(Router[>#]|Switch[>#]|Device[>#])/
});

// Or change per-command
await client.exec('show version', {
  shellPrompt: /AdminRouter#/
});
```

## Best Practices

### 1. Prefer SSH Over Telnet

```typescript
// Telnet is unencrypted! Use for:
// - Legacy devices without SSH
// - Lab/isolated networks
// - Quick testing

// For production, use SSH (via SFTP client or ssh2)
```

### 2. Disable Paging

```typescript
await client.connect();

// Cisco
await client.exec('terminal length 0');

// Juniper
await client.exec('set cli screen-length 0');

// Then run commands
const config = await client.exec('show running-config');
```

### 3. Use Appropriate Timeouts

```typescript
const client = createTelnet({
  host: 'device.local',
  timeout: 10000,          // Connection: 10s
  execTimeout: 30000       // Commands: 30s (some take longer)
});
```

### 4. Handle Authentication Prompts

```typescript
const client = createTelnet({
  host: 'device.local',
  loginPrompt: /Username:|login:/i,
  passwordPrompt: /Password:/i,
  username: 'admin',
  password: 'secret'
});

// Connection handles auth automatically
await client.connect();
```

## Security Considerations

- Telnet transmits data in plaintext
- Credentials are visible on the network
- Use only in isolated/trusted networks
- Prefer SSH for production environments
- Consider VPN if Telnet is required

## Next Steps

- **[DNS](04-dns.md)** - DNS utilities
- **[WHOIS & RDAP](05-whois-rdap.md)** - Domain registration lookup

# FTP & SFTP

File transfer protocols for uploading and downloading files.

## FTP

### Quick Start

```typescript
import { createFTP, ftp } from 'recker/protocols';

// One-shot operation
await ftp({ host: 'ftp.example.com' }, async (client) => {
  await client.download('/pub/file.txt', './file.txt');
});

// Or manual connection
const client = createFTP({
  host: 'ftp.example.com',
  user: 'anonymous',
  password: 'anonymous@'
});

await client.connect();
const files = await client.list('/pub');
await client.close();
```

### Configuration

```typescript
import { createFTP } from 'recker/protocols';

const client = createFTP({
  host: 'ftp.example.com',
  port: 21,                    // Default: 21
  user: 'username',
  password: 'password',
  secure: true,                // Use FTPS
  timeout: 30000,              // Connection timeout
  verbose: true                // Debug output
});
```

### Secure FTP (FTPS)

```typescript
// Explicit FTPS (starts plain, upgrades to TLS)
const client = createFTP({
  host: 'ftp.example.com',
  secure: true
});

// Implicit FTPS (TLS from start, port 990)
const client = createFTP({
  host: 'ftp.example.com',
  port: 990,
  secure: 'implicit'
});
```

### List Files

```typescript
const result = await client.list('/pub');

if (result.success) {
  for (const item of result.data!) {
    console.log(`${item.type}: ${item.name} (${item.size} bytes)`);
    console.log(`  Modified: ${item.modifiedAt}`);
    console.log(`  Permissions: ${item.permissions}`);
  }
}

// File types: 'file' | 'directory' | 'link' | 'unknown'
```

### Download Files

```typescript
// To file
await client.download('/remote/file.txt', './local/file.txt');

// To stream
import { createWriteStream } from 'fs';
const stream = createWriteStream('./output.bin');
await client.downloadToStream('/remote/file.bin', stream);

// To buffer
const result = await client.downloadToBuffer('/remote/data.json');
if (result.success) {
  const json = JSON.parse(result.data!.toString());
}
```

### Upload Files

```typescript
// From file
await client.upload('./local/file.txt', '/remote/file.txt');

// From stream
import { createReadStream } from 'fs';
const stream = createReadStream('./large-file.bin');
await client.uploadFromStream(stream, '/remote/large-file.bin');

// From buffer/string
await client.uploadFromBuffer('Hello, World!', '/remote/hello.txt');
await client.uploadFromBuffer(Buffer.from([1, 2, 3]), '/remote/data.bin');
```

### Progress Tracking

```typescript
const client = createFTP({ host: 'ftp.example.com' });
await client.connect();

client.progress((info) => {
  console.log(`${info.type}: ${info.name}`);
  console.log(`  Bytes: ${info.bytes} / ${info.bytesOverall}`);
});

await client.download('/large-file.zip', './file.zip');
```

### Directory Operations

```typescript
// Get current directory
const pwd = await client.pwd();
console.log('Current dir:', pwd.data);

// Change directory
await client.cd('/pub');

// Create directory (recursive by default)
await client.mkdir('/new/nested/directory');

// Remove directory
await client.rmdir('/old-directory');
```

### File Operations

```typescript
// Check if exists
const exists = await client.exists('/some/file.txt');

// Get file size
const size = await client.size('/some/file.txt');
console.log('Size:', size.data, 'bytes');

// Rename/move file
await client.rename('/old-name.txt', '/new-name.txt');

// Delete file
await client.delete('/unwanted-file.txt');
```

### One-Shot Operations

```typescript
import { ftp } from 'recker/protocols';

// Connection auto-managed
const files = await ftp({
  host: 'ftp.example.com',
  user: 'user',
  password: 'pass'
}, async (client) => {
  return await client.list('/pub');
});

// Download
await ftp({ host: 'ftp.example.com' }, async (client) => {
  await client.download('/pub/readme.txt', './readme.txt');
});
```

## SFTP

### Quick Start

```typescript
import { createSFTP, sftp } from 'recker/protocols';

// One-shot operation
await sftp({
  host: 'sftp.example.com',
  username: 'user',
  privateKey: await fs.readFile('/path/to/key')
}, async (client) => {
  await client.download('/home/user/file.txt', './file.txt');
});

// Or manual connection
const client = createSFTP({
  host: 'sftp.example.com',
  username: 'user',
  password: 'password'
});

await client.connect();
const files = await client.list('/home/user');
await client.close();
```

### Configuration

```typescript
import { createSFTP } from 'recker/protocols';

const client = createSFTP({
  host: 'sftp.example.com',
  port: 22,                    // Default: 22
  username: 'user',
  password: 'password',
  readyTimeout: 20000,
  retries: 3,
  retry_factor: 2,
  retry_minTimeout: 2000
});
```

### SSH Key Authentication

```typescript
import { readFileSync } from 'fs';

// With private key file
const client = createSFTP({
  host: 'sftp.example.com',
  username: 'user',
  privateKey: readFileSync('/home/user/.ssh/id_rsa')
});

// With passphrase-protected key
const client = createSFTP({
  host: 'sftp.example.com',
  username: 'user',
  privateKey: readFileSync('/home/user/.ssh/id_rsa'),
  passphrase: 'key-passphrase'
});

// With key string
const client = createSFTP({
  host: 'sftp.example.com',
  username: 'user',
  privateKey: `-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----`
});
```

### List Files

```typescript
const result = await client.list('/home/user');

if (result.success) {
  for (const item of result.data!) {
    console.log(`${item.type}: ${item.name}`);
    console.log(`  Size: ${item.size} bytes`);
    console.log(`  Modified: ${new Date(item.modifyTime * 1000)}`);
    console.log(`  Permissions: user=${item.rights.user}, group=${item.rights.group}`);
    console.log(`  Owner: ${item.owner}, Group: ${item.group}`);
  }
}
```

### Check Path Existence

```typescript
const exists = await client.exists('/home/user/file.txt');

// Returns:
// false - doesn't exist
// 'd' - directory
// '-' - file
// 'l' - link

if (exists === '-') {
  console.log('Is a file');
} else if (exists === 'd') {
  console.log('Is a directory');
}
```

### File Stats

```typescript
const result = await client.stat('/home/user/file.txt');

if (result.success) {
  const stats = result.data!;
  console.log('Mode:', stats.mode);
  console.log('Size:', stats.size);
  console.log('Access time:', stats.atime);
  console.log('Modify time:', stats.mtime);
}
```

### Download Files

```typescript
// To file (fast parallel transfer)
await client.download('/remote/file.txt', './local/file.txt');

// To stream
import { createWriteStream } from 'fs';
const stream = createWriteStream('./output.bin');
await client.downloadToStream('/remote/file.bin', stream);

// To buffer
const result = await client.downloadToBuffer('/remote/data.json');
if (result.success) {
  const json = JSON.parse(result.data!.toString());
}
```

### Upload Files

```typescript
// From file (fast parallel transfer)
await client.upload('./local/file.txt', '/remote/file.txt');

// From stream
import { createReadStream } from 'fs';
const stream = createReadStream('./large-file.bin');
await client.uploadFromStream(stream, '/remote/large-file.bin');

// From buffer/string
await client.uploadFromBuffer('Hello, World!', '/remote/hello.txt');
```

### Directory Operations

```typescript
// Get current directory
const pwd = await client.pwd();
console.log('Current dir:', pwd.data);

// Create directory (recursive by default)
await client.mkdir('/new/nested/directory', true);

// Remove directory
await client.rmdir('/old-directory');

// Remove directory recursively
await client.rmdir('/directory-with-files', true);
```

### File Operations

```typescript
// Rename/move file
await client.rename('/old-path.txt', '/new-path.txt');

// Delete file
await client.delete('/unwanted-file.txt');

// Append to file
await client.append('Additional content', '/existing-file.txt');

// Change permissions
await client.chmod('/script.sh', '755');
await client.chmod('/file.txt', 0o644);
```

### One-Shot Operations

```typescript
import { sftp } from 'recker/protocols';

// Connection auto-managed
const files = await sftp({
  host: 'sftp.example.com',
  username: 'user',
  privateKey: privateKey
}, async (client) => {
  return await client.list('/home/user');
});

// Multiple operations
await sftp({
  host: 'sftp.example.com',
  username: 'user',
  password: 'pass'
}, async (client) => {
  await client.mkdir('/backups');
  await client.upload('./data.zip', '/backups/data.zip');
  await client.chmod('/backups/data.zip', '600');
});
```

## FTP vs SFTP Comparison

| Feature | FTP | SFTP |
|---------|-----|------|
| Port | 21 | 22 |
| Security | Optional (FTPS) | Always encrypted |
| Authentication | User/pass | User/pass or SSH key |
| Firewall | Complex (passive mode) | Single port |
| Protocol | FTP | SSH subsystem |

## Error Handling

```typescript
// All operations return { success, data?, message? }
const result = await client.download('/remote/file.txt', './local.txt');

if (!result.success) {
  console.error('Download failed:', result.message);
  // Handle error
}

// For one-shot operations
try {
  await ftp({ host: 'ftp.example.com' }, async (client) => {
    await client.download('/nonexistent.txt', './file.txt');
  });
} catch (error) {
  console.error('FTP operation failed:', error.message);
}
```

## Best Practices

### 1. Use One-Shot for Simple Operations

```typescript
// Clean and auto-manages connection
await ftp(config, async (client) => {
  await client.download('/file.txt', './file.txt');
});
```

### 2. Prefer SFTP Over FTP

```typescript
// SFTP is more secure and simpler
const client = createSFTP({
  host: 'server.example.com',
  username: 'user',
  privateKey: key
});
```

### 3. Use SSH Keys for SFTP

```typescript
// More secure than passwords
const client = createSFTP({
  host: 'sftp.example.com',
  username: 'deploy',
  privateKey: await fs.readFile('~/.ssh/deploy_key')
});
```

### 4. Always Close Connections

```typescript
const client = createFTP({ host: 'ftp.example.com' });

try {
  await client.connect();
  // Operations...
} finally {
  await client.close();
}
```

## Next Steps

- **[Telnet](03-telnet.md)** - Remote command execution
- **[DNS](04-dns.md)** - DNS utilities

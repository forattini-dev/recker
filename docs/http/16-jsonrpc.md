# JSON-RPC 2.0

Complete JSON-RPC 2.0 client with support for batch requests, notifications, and typed error handling.

## Quick Start

```typescript
import { createClient, jsonrpc } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

// Create JSON-RPC client
const rpc = client.jsonrpc('/rpc');

// Call method
const result = await rpc.call('add', [1, 2]);
console.log(result); // 3
```

## Configuration

```typescript
interface JsonRpcOptions {
  // Service endpoint
  endpoint?: string;

  // ID generator (default: auto-increment)
  idGenerator?: () => string | number;

  // Throw exception on JSON-RPC errors (default: true)
  throwOnError?: boolean;
}
```

## Basic Calls

### With Array Parameters

```typescript
// Positional parameters
const sum = await rpc.call('math.add', [1, 2, 3]);
console.log(sum); // 6

const result = await rpc.call('string.concat', ['Hello', ' ', 'World']);
console.log(result); // 'Hello World'
```

### With Object Parameters

```typescript
// Named parameters
const user = await rpc.call('user.create', {
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
});

const found = await rpc.call('user.find', {
  query: { active: true },
  limit: 10,
  offset: 0,
});
```

### Without Parameters

```typescript
const version = await rpc.call('system.version');
const methods = await rpc.call('system.listMethods');
```

## Notifications

Notifications don't wait for a response (fire-and-forget):

```typescript
// Send notification (returns no value)
await rpc.notify('log.event', {
  level: 'info',
  message: 'User logged in',
  timestamp: Date.now(),
});

// Multiple notifications
await rpc.notify('metrics.increment', { counter: 'page_views' });
await rpc.notify('metrics.increment', { counter: 'api_calls' });
```

## Batch Requests

Send multiple calls in a single HTTP request:

```typescript
// Batch of calls
const results = await rpc.batch([
  { method: 'user.get', params: { id: 1 } },
  { method: 'user.get', params: { id: 2 } },
  { method: 'user.get', params: { id: 3 } },
]);

console.log(results);
// [
//   { jsonrpc: '2.0', result: { id: 1, name: 'John' }, id: 1 },
//   { jsonrpc: '2.0', result: { id: 2, name: 'Jane' }, id: 2 },
//   { jsonrpc: '2.0', result: { id: 3, name: 'Bob' }, id: 3 },
// ]
```

### Batch with Notifications

```typescript
const results = await rpc.batch([
  { method: 'user.get', params: { id: 1 } },           // Request
  { method: 'log.event', params: { msg: 'test' }, notification: true }, // Notification
  { method: 'user.get', params: { id: 2 } },           // Request
]);

// Notifications don't return a response
console.log(results.length); // 2
```

### Check Errors in Batch

```typescript
const batch = await rpc.batch([
  { method: 'user.get', params: { id: 1 } },
  { method: 'user.get', params: { id: 999 } }, // Doesn't exist
  { method: 'user.get', params: { id: 2 } },
]);

if (batch.hasErrors) {
  console.log('Errors:', batch.errors);
}

// Process results individually
for (const response of batch.responses) {
  if (response.error) {
    console.log('Error:', response.error.message);
  } else {
    console.log('Result:', response.result);
  }
}
```

## Error Handling

### JsonRpcException

```typescript
import { JsonRpcException, JsonRpcErrorCodes } from 'recker';

try {
  const result = await rpc.call('method.that.fails');
} catch (error) {
  if (error instanceof JsonRpcException) {
    console.log('Code:', error.code);
    console.log('Message:', error.message);
    console.log('Data:', error.data);

    // Check error type
    if (JsonRpcException.isMethodNotFound(error)) {
      console.log('Method does not exist');
    }

    if (JsonRpcException.isInvalidParams(error)) {
      console.log('Invalid parameters');
    }

    if (JsonRpcException.isServerError(error)) {
      console.log('Server error');
    }
  }
}
```

### Standard Error Codes

| Code | Name | Description |
|------|------|-------------|
| -32700 | Parse error | Invalid JSON |
| -32600 | Invalid Request | Invalid request structure |
| -32601 | Method not found | Method does not exist |
| -32602 | Invalid params | Invalid parameters |
| -32603 | Internal error | Internal server error |
| -32000 to -32099 | Server error | Server-specific errors |

### Disable Throw

```typescript
const rpc = client.jsonrpc('/rpc', {
  throwOnError: false,
});

// Returns complete response instead of throwing exception
const response = await rpc.callRaw('method.that.fails');

if (response.error) {
  console.log('Error:', response.error);
} else {
  console.log('Result:', response.result);
}
```

## Typing

### Typed Result

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

// Type the result
const user = await rpc.call<User>('user.get', { id: 1 });
console.log(user.name); // TypeScript knows it's a string
```

### Typed Parameters

```typescript
interface CreateUserParams {
  name: string;
  email: string;
  role?: 'admin' | 'user';
}

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

const user = await rpc.call<User, CreateUserParams>('user.create', {
  name: 'John',
  email: 'john@example.com',
  role: 'admin',
});
```

## Examples

### Ethereum JSON-RPC

```typescript
const client = createClient({
  baseUrl: 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID',
});

const eth = client.jsonrpc('/');

// Get current block number
const blockNumber = await eth.call('eth_blockNumber');
console.log('Block:', parseInt(blockNumber, 16));

// Get balance
const balance = await eth.call('eth_getBalance', [
  '0x742d35Cc6634C0532925a3b844Bc9e7595f25aC7',
  'latest',
]);
console.log('Balance:', parseInt(balance, 16) / 1e18, 'ETH');

// Batch of calls
const results = await eth.batch([
  { method: 'eth_blockNumber', params: [] },
  { method: 'eth_gasPrice', params: [] },
  { method: 'eth_chainId', params: [] },
]);
```

### Bitcoin JSON-RPC

```typescript
const client = createClient({
  baseUrl: 'http://localhost:8332',
  headers: {
    'Authorization': 'Basic ' + Buffer.from('user:pass').toString('base64'),
  },
});

const btc = client.jsonrpc('/');

// Get blockchain info
const info = await btc.call('getblockchaininfo');
console.log('Blocks:', info.blocks);

// Get wallet balance
const balance = await btc.call('getbalance');
console.log('Balance:', balance, 'BTC');
```

### Language Server Protocol (LSP)

```typescript
const lsp = client.jsonrpc('/lsp');

// Initialize
const capabilities = await lsp.call('initialize', {
  processId: process.pid,
  capabilities: {},
  rootUri: 'file:///project',
});

// File open notification
await lsp.notify('textDocument/didOpen', {
  textDocument: {
    uri: 'file:///project/main.ts',
    languageId: 'typescript',
    version: 1,
    text: 'const x = 1;',
  },
});

// Request completions
const completions = await lsp.call('textDocument/completion', {
  textDocument: { uri: 'file:///project/main.ts' },
  position: { line: 0, character: 10 },
});
```

### MCP (Model Context Protocol)

```typescript
const mcp = client.jsonrpc('/mcp');

// List available tools
const tools = await mcp.call('tools/list');

// Call a tool
const result = await mcp.call('tools/call', {
  name: 'read_file',
  arguments: {
    path: '/path/to/file.txt',
  },
});
```

## Custom ID

```typescript
import { randomUUID } from 'node:crypto';

const rpc = client.jsonrpc('/rpc', {
  // Use UUID as ID
  idGenerator: () => randomUUID(),
});

// Or use timestamp
const rpc2 = client.jsonrpc('/rpc', {
  idGenerator: () => Date.now(),
});
```

## Combining with Plugins

### With Retry

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    maxAttempts: 3,
    statusCodes: [500, 502, 503],
  },
});

const rpc = client.jsonrpc('/rpc');

// Automatic retries on HTTP server errors
const result = await rpc.call('unstable.method');
```

### With Cache

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    strategy: 'cache-first',
    ttl: 60000,
    methods: ['POST'], // JSON-RPC uses POST
  },
});

const rpc = client.jsonrpc('/rpc');

// Cache results of idempotent calls
const result = await rpc.call('config.get', { key: 'version' });
```

## Tips

1. **Use batch** for multiple independent calls
2. **Notifications** are fire-and-forget - don't expect a response
3. **Type your results** for better DX
4. **Handle errors** specifically with `JsonRpcException`
5. **Combine with retry** for resilience

# Enterprise Protocols

SOAP, XML-RPC, JSON-RPC 2.0, gRPC-Web, and OData support for enterprise integrations.

## Protocol Overview

| Protocol | Format | Transport | Use Case |
|----------|--------|-----------|----------|
| **SOAP** | XML | HTTP | Legacy enterprise systems |
| **XML-RPC** | XML | HTTP | Simple RPC, WordPress APIs |
| **JSON-RPC** | JSON | HTTP | Modern RPC, Ethereum |
| **gRPC-Web** | Protobuf/JSON | HTTP/2 | High-performance microservices |
| **OData** | JSON | HTTP | RESTful data queries |

## SOAP

SOAP 1.1/1.2 client with automatic envelope handling.

### Basic Usage

```typescript
import { createClient, soap } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [soap()]
});

const soapClient = client.soap({
  endpoint: '/soap/service',
  namespace: 'http://example.com/service',
  version: '1.2' // or '1.1'
});

const result = await soapClient.call('GetUser', {
  userId: 123
});

console.log(result.result); // Parsed response
```

### With SOAP Headers

```typescript
const result = await soapClient.call('SecureMethod',
  { data: 'test' },
  {
    soapHeaders: {
      AuthToken: 'secret-token',
      SessionId: 'abc123'
    },
    soapAction: 'http://example.com/SecureMethod'
  }
);
```

### WSDL Support

```typescript
// Get WSDL for reference
const wsdl = await soapClient.getWsdl();
```

### Fault Handling

```typescript
const result = await soapClient.call('Method', params);

if (!result.success) {
  console.error('SOAP Fault:', result.fault);
  // { code: 'Server', string: 'Internal error', actor: '...', detail: '...' }
} else {
  console.log('Result:', result.result);
}
```

### Configuration

```typescript
interface SoapOptions {
  endpoint: string;
  version?: '1.1' | '1.2';        // Default: '1.2'
  namespace?: string;
  namespacePrefix?: string;        // Default: 'ns'
  wsdl?: string;
  soapHeaders?: Record<string, unknown>;
  requestOptions?: RequestOptions;
}
```

## XML-RPC

Simple remote procedure calls using XML.

### Basic Calls

```typescript
const xmlrpc = client.xmlrpc('/xmlrpc');

// Call method with positional params
const methods = await xmlrpc.call('system.listMethods');
const sum = await xmlrpc.call('math.add', [1, 2, 3]);
```

### Fault Handling

```typescript
const response = await xmlrpc.call('method', [params]);

if (!response.success) {
  console.error('Fault:', response.fault?.faultCode, response.fault?.faultString);
}
```

## JSON-RPC 2.0

Full JSON-RPC 2.0 specification support.

### Basic Calls

```typescript
import { createClient, jsonrpc } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [jsonrpc()]
});

const rpc = client.jsonrpc('/api/rpc');

// Positional parameters
const sum = await rpc.call<number>('add', [1, 2]);

// Named parameters
const user = await rpc.call<User>('getUser', { id: 123 });
```

### Notifications

Fire-and-forget calls with no response:

```typescript
await rpc.notify('log', ['User logged in']);
await rpc.notify('track', { event: 'pageview', page: '/home' });
```

### Batch Requests

Multiple calls in a single HTTP request:

```typescript
const batch = await rpc.batch([
  { method: 'getUser', params: { id: 1 } },
  { method: 'getUser', params: { id: 2 } },
  { method: 'getPosts', params: { userId: 1 } }
]);

if (batch.hasErrors) {
  console.error('Errors:', batch.errors);
}

// Get specific result by ID
const user1 = rpc.getFromBatch<User>(batch, 0);
const user2 = rpc.getFromBatch<User>(batch, 1);
```

### Typed Proxy

Create a type-safe API client:

```typescript
interface MathAPI {
  add(a: number, b: number): number;
  subtract(a: number, b: number): number;
  multiply(a: number, b: number): number;
}

const math = rpc.proxy<MathAPI>();

const result = await math.add(1, 2);     // Type-safe: returns Promise<number>
const diff = await math.subtract(10, 5);
```

### Error Handling

```typescript
import { JsonRpcException, JsonRpcErrorCodes } from 'recker';

try {
  await rpc.call('unknownMethod');
} catch (error) {
  if (error instanceof JsonRpcException) {
    console.log('Code:', error.code);
    console.log('Message:', error.message);
    console.log('Data:', error.data);

    if (JsonRpcException.isMethodNotFound(error)) {
      console.log('Method does not exist');
    }
  }
}
```

### Configuration

```typescript
const rpc = client.jsonrpc('/api/rpc', {
  autoId: true,                    // Auto-generate request IDs
  idGenerator: () => uuid(),       // Custom ID generator
  throwOnError: true               // Throw on RPC errors (default)
});
```

## gRPC-Web

gRPC over HTTP for browser and Node.js.

### Setup

```typescript
import { createClient, grpcWeb } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [grpcWeb()]
});

const grpc = client.grpcWeb();
```

### Unary Calls

```typescript
import { jsonCodec } from 'recker';

// Define message types
interface HelloRequest { name: string }
interface HelloReply { message: string }

// Create codec (use protobufjs in production)
const codec = jsonCodec<HelloRequest | HelloReply>();

// Make call
const response = await grpc.unary<HelloRequest, HelloReply>(
  'helloworld.Greeter',
  'SayHello',
  { name: 'World' },
  codec
);

console.log(response.message); // 'Hello, World!'
console.log(response.status);  // { code: 0, message: '' }
```

### Server Streaming

```typescript
for await (const reply of grpc.serverStream<HelloRequest, HelloReply>(
  'helloworld.Greeter',
  'SayHelloStream',
  { name: 'World' },
  codec
)) {
  console.log(reply.message);
}
```

### Error Handling

```typescript
import { GrpcError, GrpcStatusCode } from 'recker';

try {
  await grpc.unary('Service', 'Method', request, codec);
} catch (error) {
  if (error instanceof GrpcError) {
    console.log('Code:', error.code);
    console.log('Message:', error.message);

    if (error.code === GrpcStatusCode.UNAUTHENTICATED) {
      // Handle auth error
    }
  }
}
```

### gRPC Status Codes

| Code | Name | Description |
|------|------|-------------|
| 0 | OK | Success |
| 1 | CANCELLED | Operation cancelled |
| 2 | UNKNOWN | Unknown error |
| 3 | INVALID_ARGUMENT | Client error |
| 4 | DEADLINE_EXCEEDED | Timeout |
| 5 | NOT_FOUND | Resource not found |
| 7 | PERMISSION_DENIED | Forbidden |
| 14 | UNAVAILABLE | Service unavailable |
| 16 | UNAUTHENTICATED | Auth required |

## OData v4

Query builder for OData services.

### Basic Queries

```typescript
import { createClient, odata } from 'recker';

const client = createClient({
  baseUrl: 'https://services.odata.org/V4/Northwind/Northwind.svc',
  plugins: [odata()]
});

const od = client.odata();

// Query with filters
const customers = await od
  .from('Customers')
  .filter('Country eq \'Germany\'')
  .select('CustomerID', 'CompanyName', 'City')
  .orderBy('CompanyName')
  .top(10)
  .get();
```

### Expand Relations

```typescript
// Expand related entities
const orders = await od
  .from('Orders')
  .expand('Customer', 'Order_Details')
  .filter('OrderDate gt 2023-01-01')
  .get();
```

### CRUD Operations

```typescript
// Single entity by key
const customer = await od
  .from('Customers')
  .byKey('ALFKI')
  .get();

// Create
await od.from('Customers').post({
  CustomerID: 'NEWCO',
  CompanyName: 'New Company'
});

// Update
await od.from('Customers').byKey('NEWCO').patch({
  CompanyName: 'Updated Company'
});

// Delete
await od.from('Customers').byKey('NEWCO').delete();
```

## Best Practices

### 1. Choose the Right Protocol

```typescript
// New service → JSON-RPC (simple, modern)
const rpc = client.jsonrpc('/api/rpc');

// High throughput → gRPC-Web (efficient)
const grpc = client.grpcWeb();

// Legacy integration → SOAP (compatibility)
const soap = client.soap({ endpoint: '/ws', namespace: '...' });
```

### 2. Use Protobuf for Production gRPC

```typescript
// Development: JSON codec (readable)
const codec = jsonCodec<T>();

// Production: Protobuf codec (efficient)
import { load } from 'protobufjs';
const root = await load('service.proto');
const codec = protobufCodec<T>(root);
```

### 3. Handle Errors Explicitly

```typescript
// JSON-RPC
try {
  await rpc.call('method', params);
} catch (error) {
  if (error instanceof JsonRpcException) {
    // Handle RPC error
  }
}

// gRPC
try {
  await grpc.unary('Service', 'Method', request, codec);
} catch (error) {
  if (error instanceof GrpcError) {
    if (error.code === GrpcStatusCode.UNAVAILABLE) {
      // Retry logic
    }
  }
}
```

### 4. Set Appropriate Timeouts

```typescript
// Enterprise calls can be slow
const soapClient = client.soap({
  endpoint: '/soap',
  namespace: '...',
  requestOptions: {
    timeout: 60000 // 60s for SOAP
  }
});
```

### 5. Batch When Possible

```typescript
// JSON-RPC batch
const results = await rpc.batch([
  { method: 'getUser', params: { id: 1 } },
  { method: 'getUser', params: { id: 2 } },
  { method: 'getUser', params: { id: 3 } }
]);
// Single HTTP request, multiple results
```

## Next Steps

- **[WebSocket](01-websocket.md)** - Real-time communication
- **[SSE](06-sse.md)** - Server-Sent Events
- **[DNS](04-dns.md)** - DNS queries

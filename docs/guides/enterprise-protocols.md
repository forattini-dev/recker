# Enterprise Protocols

Recker supports enterprise integration protocols for legacy and complex systems.

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

### WSDL

```typescript
// Get WSDL for reference
const wsdl = await soapClient.getWsdl();
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

---

## XML-RPC

Simple remote procedure calls using XML.

```typescript
const xmlrpc = client.xmlrpc('/xmlrpc');

// Call method with positional params
const result = await xmlrpc.call('system.listMethods');
const sum = await xmlrpc.call('math.add', [1, 2, 3]);

// Fault handling
const response = await xmlrpc.call('method', [params]);
if (!response.success) {
  console.error('Fault:', response.fault?.faultCode, response.fault?.faultString);
}
```

---

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

---

## gRPC-Web

gRPC over HTTP for browser and Node.js.

### Setup

```typescript
import { createClient, grpcWeb, createGrpcWebClient } from 'recker';

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

---

## OData

Query builder for OData v4 services.

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

// Expand related entities
const orders = await od
  .from('Orders')
  .expand('Customer', 'Order_Details')
  .filter('OrderDate gt 2023-01-01')
  .get();

// Single entity
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

---

## Protocol Comparison

| Protocol | Format | Transport | Use Case |
|----------|--------|-----------|----------|
| SOAP | XML | HTTP | Enterprise integrations |
| XML-RPC | XML | HTTP | Simple RPC |
| JSON-RPC | JSON | HTTP | Modern RPC |
| gRPC-Web | Protobuf/JSON | HTTP/2 | High-performance services |
| OData | JSON | HTTP | RESTful queries |

## Best Practices

1. **Use JSON-RPC** for new services (simpler than SOAP)
2. **Use gRPC-Web** for high-throughput services
3. **Use Protobuf** in production gRPC (not JSON codec)
4. **Handle errors** explicitly for enterprise protocols
5. **Set appropriate timeouts** for long-running operations

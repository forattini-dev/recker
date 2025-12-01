# SOAP & XML-RPC

Complete support for SOAP 1.1/1.2 and XML-RPC, with automatic response parsing and fault handling.

## SOAP

### Quick Start

```typescript
import { createClient, soap } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

// Create SOAP client
const soapClient = client.soap({
  endpoint: '/soap',
  namespace: 'http://example.com/service',
  version: '1.2',
});

// Call method
const result = await soapClient.call('GetUser', { userId: 123 });

if (result.success) {
  console.log('User:', result.result);
} else {
  console.log('SOAP Fault:', result.fault);
}
```

### Configuration

```typescript
interface SoapOptions {
  // SOAP service endpoint
  endpoint: string;

  // Service XML namespace
  namespace: string;

  // SOAP version (default: '1.2')
  version?: '1.1' | '1.2';

  // WSDL URL (optional)
  wsdl?: string;

  // Default SOAP headers
  soapHeaders?: Record<string, string>;

  // Encoding (default: 'utf-8')
  encoding?: string;
}
```

### SOAP 1.1 vs 1.2

```typescript
// SOAP 1.1 (legacy systems)
const soap11 = client.soap({
  endpoint: '/soap',
  namespace: 'http://example.com/service',
  version: '1.1',
});
// Content-Type: text/xml; charset=utf-8

// SOAP 1.2 (recommended)
const soap12 = client.soap({
  endpoint: '/soap',
  namespace: 'http://example.com/service',
  version: '1.2',
});
// Content-Type: application/soap+xml; charset=utf-8
```

### Methods with Parameters

```typescript
// Simple parameters
const result = await soapClient.call('GetUser', {
  userId: 123,
});

// Complex parameters
const result = await soapClient.call('CreateUser', {
  user: {
    name: 'John Doe',
    email: 'john@example.com',
    address: {
      street: '123 Main St',
      city: 'New York',
      country: 'USA',
    },
  },
});

// Arrays
const result = await soapClient.call('GetUsers', {
  userIds: [1, 2, 3, 4, 5],
});
```

### SOAP Headers

```typescript
// Headers per call
const result = await soapClient.call(
  'SecureMethod',
  { data: 'sensitive' },
  {
    soapHeaders: {
      AuthToken: 'secret-token',
      Timestamp: new Date().toISOString(),
      TransactionId: 'tx-12345',
    },
    soapAction: 'http://example.com/SecureMethod',
  }
);
```

### Generated Envelope Example

```xml
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:ns="http://example.com/service">
  <soap:Header>
    <ns:AuthToken>secret-token</ns:AuthToken>
    <ns:Timestamp>2024-01-15T10:30:00Z</ns:Timestamp>
  </soap:Header>
  <soap:Body>
    <ns:GetUser>
      <ns:userId>123</ns:userId>
    </ns:GetUser>
  </soap:Body>
</soap:Envelope>
```

### Fault Handling

```typescript
const result = await soapClient.call('RiskyMethod', { data: 'test' });

if (!result.success) {
  const { fault } = result;

  console.log('Code:', fault.code);
  // 'soap:Server' or 'soap:Client'

  console.log('Message:', fault.string);
  // 'User not found'

  console.log('Detail:', fault.detail);
  // Additional server information
}
```

### WSDL

```typescript
// Configure with WSDL
const soapClient = client.soap({
  endpoint: '/soap',
  namespace: 'http://example.com/service',
  wsdl: '/soap?wsdl',
});

// Fetch and parse WSDL
const wsdl = await soapClient.getWsdl();
console.log(wsdl); // Raw WSDL XML

// List available operations
const operations = await soapClient.getOperations();
console.log(operations);
// ['GetUser', 'CreateUser', 'DeleteUser', ...]
```

---

## XML-RPC

### Quick Start

```typescript
import { createClient, xmlrpc } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

// Create XML-RPC client
const rpc = client.xmlrpc('/xmlrpc');

// Call method
const result = await rpc.call('system.listMethods');
console.log(result.result);
// ['add', 'subtract', 'multiply', ...]
```

### Calls with Parameters

```typescript
// Simple parameters
const sum = await rpc.call('math.add', [1, 2, 3]);
console.log(sum.result); // 6

// Multiple parameters
const result = await rpc.call('string.concat', ['Hello', ' ', 'World']);
console.log(result.result); // 'Hello World'

// Complex parameters
const result = await rpc.call('user.create', [{
  name: 'John',
  age: 30,
  tags: ['developer', 'admin'],
  metadata: {
    active: true,
    createdAt: new Date(),
  },
}]);
```

### Data Types

Automatic type conversion:

| JavaScript | XML-RPC | Example |
|------------|---------|---------|
| `number` (integer) | `<int>` | `42` |
| `number` (decimal) | `<double>` | `3.14` |
| `boolean` | `<boolean>` | `true` |
| `string` | `<string>` | `"hello"` |
| `Date` | `<dateTime.iso8601>` | `new Date()` |
| `Buffer` | `<base64>` | `Buffer.from('data')` |
| `Array` | `<array>` | `[1, 2, 3]` |
| `Object` | `<struct>` | `{ key: 'value' }` |
| `null` | `<nil/>` | `null` |

### Fault Handling

```typescript
const result = await rpc.call('method.that.fails');

if (!result.success) {
  console.log('Fault code:', result.fault.faultCode);
  // Numeric error code

  console.log('Fault string:', result.fault.faultString);
  // Error message
}
```

### XML-RPC Request Example

```xml
<?xml version="1.0"?>
<methodCall>
  <methodName>user.create</methodName>
  <params>
    <param>
      <value>
        <struct>
          <member>
            <name>name</name>
            <value><string>John</string></value>
          </member>
          <member>
            <name>age</name>
            <value><int>30</int></value>
          </member>
          <member>
            <name>active</name>
            <value><boolean>1</boolean></value>
          </member>
        </struct>
      </value>
    </param>
  </params>
</methodCall>
```

---

## Combining with Other Plugins

### With Retry

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    maxAttempts: 3,
    statusCodes: [500, 502, 503],
  },
});

const soapClient = client.soap({
  endpoint: '/soap',
  namespace: 'http://example.com/service',
});

// Automatic retries on server errors
const result = await soapClient.call('UnstableMethod', { data: 'test' });
```

### With Auth

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'Authorization': 'Basic ' + Buffer.from('user:pass').toString('base64'),
  },
});

const soapClient = client.soap({
  endpoint: '/soap',
  namespace: 'http://example.com/service',
});
```

### With Timeout

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  timeout: 30000, // 30 seconds
});

const soapClient = client.soap({
  endpoint: '/soap',
  namespace: 'http://example.com/service',
});
```

---

## Real-World Examples

### Brazilian Postal Service (Correios) ZIP Code Lookup

```typescript
const client = createClient({
  baseUrl: 'https://apps.correios.com.br',
});

const correios = client.soap({
  endpoint: '/SigepMasterJPA/AtendeClienteService/AtendeCliente',
  namespace: 'http://cliente.bean.master.sigep.bsb.correios.com.br/',
  version: '1.1',
});

const result = await correios.call('consultaCEP', {
  cep: '01310100',
});

if (result.success) {
  console.log(result.result);
  // { bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP', ... }
}
```

### WordPress XML-RPC

```typescript
const client = createClient({
  baseUrl: 'https://myblog.com',
});

const wp = client.xmlrpc('/xmlrpc.php');

// List available methods
const methods = await wp.call('system.listMethods');

// Get recent posts
const posts = await wp.call('wp.getPosts', [
  1,           // blog_id
  'username',  // username
  'password',  // password
  { number: 10 }, // filter
]);
```

### Invoice Service

```typescript
const client = createClient({
  baseUrl: 'https://nfe.fazenda.sp.gov.br',
});

const nfe = client.soap({
  endpoint: '/ws/nfeconsulta2.asmx',
  namespace: 'http://www.portalfiscal.inf.br/nfe/wsdl/NfeConsulta2',
  version: '1.2',
});

const result = await nfe.call('nfeConsultaNF2', {
  nfeDadosMsg: xmlDaConsulta,
});
```

---

## Debugging

### View Generated XML

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  debug: true, // Enable logging
});

const soapClient = client.soap({
  endpoint: '/soap',
  namespace: 'http://example.com/service',
});

// Logs will show sent and received XML
const result = await soapClient.call('GetUser', { userId: 123 });
```

### Custom Logging

```typescript
import { createClient, logger } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(logger({
  logBody: true, // Shows XML in log
}));
```

---

## Tips

1. **Use SOAP 1.2** when possible - it's more modern and has better support
2. **Handle faults** - SOAP returns HTTP 200 even on errors
3. **Validate WSDL** - use `getOperations()` to check available methods
4. **Combine with retry** - SOAP services are often unstable
5. **Appropriate timeout** - SOAP operations can be slow

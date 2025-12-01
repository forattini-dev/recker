# SOAP & XML-RPC

Suporte completo para SOAP 1.1/1.2 e XML-RPC, com parsing automático de respostas e tratamento de faults.

## SOAP

### Quick Start

```typescript
import { createClient, soap } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

// Criar cliente SOAP
const soapClient = client.soap({
  endpoint: '/soap',
  namespace: 'http://example.com/service',
  version: '1.2',
});

// Chamar método
const result = await soapClient.call('GetUser', { userId: 123 });

if (result.success) {
  console.log('User:', result.result);
} else {
  console.log('SOAP Fault:', result.fault);
}
```

### Configuração

```typescript
interface SoapOptions {
  // Endpoint do serviço SOAP
  endpoint: string;

  // Namespace XML do serviço
  namespace: string;

  // Versão SOAP (default: '1.2')
  version?: '1.1' | '1.2';

  // URL do WSDL (opcional)
  wsdl?: string;

  // Headers SOAP padrão
  soapHeaders?: Record<string, string>;

  // Encoding (default: 'utf-8')
  encoding?: string;
}
```

### SOAP 1.1 vs 1.2

```typescript
// SOAP 1.1 (sistemas legados)
const soap11 = client.soap({
  endpoint: '/soap',
  namespace: 'http://example.com/service',
  version: '1.1',
});
// Content-Type: text/xml; charset=utf-8

// SOAP 1.2 (recomendado)
const soap12 = client.soap({
  endpoint: '/soap',
  namespace: 'http://example.com/service',
  version: '1.2',
});
// Content-Type: application/soap+xml; charset=utf-8
```

### Métodos com Parâmetros

```typescript
// Parâmetros simples
const result = await soapClient.call('GetUser', {
  userId: 123,
});

// Parâmetros complexos
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

### Headers SOAP

```typescript
// Headers por chamada
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

### Exemplo de Envelope Gerado

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

### Tratamento de Faults

```typescript
const result = await soapClient.call('RiskyMethod', { data: 'test' });

if (!result.success) {
  const { fault } = result;

  console.log('Code:', fault.code);
  // 'soap:Server' ou 'soap:Client'

  console.log('Message:', fault.string);
  // 'User not found'

  console.log('Detail:', fault.detail);
  // Informações adicionais do servidor
}
```

### WSDL

```typescript
// Configurar com WSDL
const soapClient = client.soap({
  endpoint: '/soap',
  namespace: 'http://example.com/service',
  wsdl: '/soap?wsdl',
});

// Buscar e parsear WSDL
const wsdl = await soapClient.getWsdl();
console.log(wsdl); // XML raw do WSDL

// Listar operações disponíveis
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

// Criar cliente XML-RPC
const rpc = client.xmlrpc('/xmlrpc');

// Chamar método
const result = await rpc.call('system.listMethods');
console.log(result.result);
// ['add', 'subtract', 'multiply', ...]
```

### Chamadas com Parâmetros

```typescript
// Parâmetros simples
const sum = await rpc.call('math.add', [1, 2, 3]);
console.log(sum.result); // 6

// Múltiplos parâmetros
const result = await rpc.call('string.concat', ['Hello', ' ', 'World']);
console.log(result.result); // 'Hello World'

// Parâmetros complexos
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

### Tipos de Dados

Conversão automática de tipos:

| JavaScript | XML-RPC | Exemplo |
|------------|---------|---------|
| `number` (inteiro) | `<int>` | `42` |
| `number` (decimal) | `<double>` | `3.14` |
| `boolean` | `<boolean>` | `true` |
| `string` | `<string>` | `"hello"` |
| `Date` | `<dateTime.iso8601>` | `new Date()` |
| `Buffer` | `<base64>` | `Buffer.from('data')` |
| `Array` | `<array>` | `[1, 2, 3]` |
| `Object` | `<struct>` | `{ key: 'value' }` |
| `null` | `<nil/>` | `null` |

### Tratamento de Faults

```typescript
const result = await rpc.call('method.that.fails');

if (!result.success) {
  console.log('Fault code:', result.fault.faultCode);
  // Código numérico do erro

  console.log('Fault string:', result.fault.faultString);
  // Mensagem de erro
}
```

### Exemplo de Request XML-RPC

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

## Combinando com Outros Plugins

### Com Retry

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

// Retentativas automáticas em caso de erro de servidor
const result = await soapClient.call('UnstableMethod', { data: 'test' });
```

### Com Auth

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

### Com Timeout

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  timeout: 30000, // 30 segundos
});

const soapClient = client.soap({
  endpoint: '/soap',
  namespace: 'http://example.com/service',
});
```

---

## Exemplos Reais

### Consulta de CEP (Correios)

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

// Listar métodos disponíveis
const methods = await wp.call('system.listMethods');

// Buscar posts recentes
const posts = await wp.call('wp.getPosts', [
  1,           // blog_id
  'username',  // username
  'password',  // password
  { number: 10 }, // filter
]);
```

### Serviço de Nota Fiscal

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

### Ver XML Gerado

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  debug: true, // Ativa logging
});

const soapClient = client.soap({
  endpoint: '/soap',
  namespace: 'http://example.com/service',
});

// Logs mostrarão o XML enviado e recebido
const result = await soapClient.call('GetUser', { userId: 123 });
```

### Logging Customizado

```typescript
import { createClient, logger } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(logger({
  logBody: true, // Mostra XML no log
}));
```

---

## Dicas

1. **Use SOAP 1.2** quando possível - é mais moderno e tem melhor suporte
2. **Trate faults** - SOAP retorna HTTP 200 mesmo em erros
3. **Valide WSDL** - use `getOperations()` para verificar métodos disponíveis
4. **Combine com retry** - serviços SOAP são frequentemente instáveis
5. **Timeout adequado** - operações SOAP podem ser lentas

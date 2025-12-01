# JSON-RPC 2.0

Cliente JSON-RPC 2.0 completo com suporte a batch requests, notificações e tratamento de erros tipado.

## Quick Start

```typescript
import { createClient, jsonrpc } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

// Criar cliente JSON-RPC
const rpc = client.jsonrpc('/rpc');

// Chamar método
const result = await rpc.call('add', [1, 2]);
console.log(result); // 3
```

## Configuração

```typescript
interface JsonRpcOptions {
  // Endpoint do serviço
  endpoint?: string;

  // Gerador de IDs (default: auto-increment)
  idGenerator?: () => string | number;

  // Lançar exceção em erros JSON-RPC (default: true)
  throwOnError?: boolean;
}
```

## Chamadas Básicas

### Com Array de Parâmetros

```typescript
// Parâmetros posicionais
const sum = await rpc.call('math.add', [1, 2, 3]);
console.log(sum); // 6

const result = await rpc.call('string.concat', ['Hello', ' ', 'World']);
console.log(result); // 'Hello World'
```

### Com Objeto de Parâmetros

```typescript
// Parâmetros nomeados
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

### Sem Parâmetros

```typescript
const version = await rpc.call('system.version');
const methods = await rpc.call('system.listMethods');
```

## Notificações

Notificações não esperam resposta (fire-and-forget):

```typescript
// Enviar notificação (não retorna valor)
await rpc.notify('log.event', {
  level: 'info',
  message: 'User logged in',
  timestamp: Date.now(),
});

// Múltiplas notificações
await rpc.notify('metrics.increment', { counter: 'page_views' });
await rpc.notify('metrics.increment', { counter: 'api_calls' });
```

## Batch Requests

Envie múltiplas chamadas em uma única requisição HTTP:

```typescript
// Batch de chamadas
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

### Batch com Notificações

```typescript
const results = await rpc.batch([
  { method: 'user.get', params: { id: 1 } },           // Request
  { method: 'log.event', params: { msg: 'test' }, notification: true }, // Notification
  { method: 'user.get', params: { id: 2 } },           // Request
]);

// Notificações não retornam resposta
console.log(results.length); // 2
```

### Verificar Erros em Batch

```typescript
const batch = await rpc.batch([
  { method: 'user.get', params: { id: 1 } },
  { method: 'user.get', params: { id: 999 } }, // Não existe
  { method: 'user.get', params: { id: 2 } },
]);

if (batch.hasErrors) {
  console.log('Erros:', batch.errors);
}

// Processar resultados individualmente
for (const response of batch.responses) {
  if (response.error) {
    console.log('Erro:', response.error.message);
  } else {
    console.log('Resultado:', response.result);
  }
}
```

## Tratamento de Erros

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

    // Verificar tipo de erro
    if (JsonRpcException.isMethodNotFound(error)) {
      console.log('Método não existe');
    }

    if (JsonRpcException.isInvalidParams(error)) {
      console.log('Parâmetros inválidos');
    }

    if (JsonRpcException.isServerError(error)) {
      console.log('Erro no servidor');
    }
  }
}
```

### Códigos de Erro Padrão

| Código | Nome | Descrição |
|--------|------|-----------|
| -32700 | Parse error | JSON inválido |
| -32600 | Invalid Request | Estrutura de request inválida |
| -32601 | Method not found | Método não existe |
| -32602 | Invalid params | Parâmetros inválidos |
| -32603 | Internal error | Erro interno do servidor |
| -32000 a -32099 | Server error | Erros específicos do servidor |

### Desabilitar Throw

```typescript
const rpc = client.jsonrpc('/rpc', {
  throwOnError: false,
});

// Retorna response completa em vez de lançar exceção
const response = await rpc.callRaw('method.that.fails');

if (response.error) {
  console.log('Erro:', response.error);
} else {
  console.log('Resultado:', response.result);
}
```

## Tipagem

### Resultado Tipado

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

// Tipar o resultado
const user = await rpc.call<User>('user.get', { id: 1 });
console.log(user.name); // TypeScript sabe que é string
```

### Parâmetros Tipados

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

## Exemplos

### Ethereum JSON-RPC

```typescript
const client = createClient({
  baseUrl: 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID',
});

const eth = client.jsonrpc('/');

// Obter número do bloco atual
const blockNumber = await eth.call('eth_blockNumber');
console.log('Block:', parseInt(blockNumber, 16));

// Obter saldo
const balance = await eth.call('eth_getBalance', [
  '0x742d35Cc6634C0532925a3b844Bc9e7595f25aC7',
  'latest',
]);
console.log('Balance:', parseInt(balance, 16) / 1e18, 'ETH');

// Batch de chamadas
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

// Obter informações da blockchain
const info = await btc.call('getblockchaininfo');
console.log('Blocks:', info.blocks);

// Obter saldo da carteira
const balance = await btc.call('getbalance');
console.log('Balance:', balance, 'BTC');
```

### Language Server Protocol (LSP)

```typescript
const lsp = client.jsonrpc('/lsp');

// Inicializar
const capabilities = await lsp.call('initialize', {
  processId: process.pid,
  capabilities: {},
  rootUri: 'file:///project',
});

// Notificação de arquivo aberto
await lsp.notify('textDocument/didOpen', {
  textDocument: {
    uri: 'file:///project/main.ts',
    languageId: 'typescript',
    version: 1,
    text: 'const x = 1;',
  },
});

// Solicitar completions
const completions = await lsp.call('textDocument/completion', {
  textDocument: { uri: 'file:///project/main.ts' },
  position: { line: 0, character: 10 },
});
```

### MCP (Model Context Protocol)

```typescript
const mcp = client.jsonrpc('/mcp');

// Listar ferramentas disponíveis
const tools = await mcp.call('tools/list');

// Chamar uma ferramenta
const result = await mcp.call('tools/call', {
  name: 'read_file',
  arguments: {
    path: '/path/to/file.txt',
  },
});
```

## ID Customizado

```typescript
import { randomUUID } from 'node:crypto';

const rpc = client.jsonrpc('/rpc', {
  // Usar UUID como ID
  idGenerator: () => randomUUID(),
});

// Ou usar timestamp
const rpc2 = client.jsonrpc('/rpc', {
  idGenerator: () => Date.now(),
});
```

## Combinando com Plugins

### Com Retry

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    maxAttempts: 3,
    statusCodes: [500, 502, 503],
  },
});

const rpc = client.jsonrpc('/rpc');

// Retentativas automáticas em erros de servidor HTTP
const result = await rpc.call('unstable.method');
```

### Com Cache

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    strategy: 'cache-first',
    ttl: 60000,
    methods: ['POST'], // JSON-RPC usa POST
  },
});

const rpc = client.jsonrpc('/rpc');

// Cacheia resultados de chamadas idempotentes
const result = await rpc.call('config.get', { key: 'version' });
```

## Dicas

1. **Use batch** para múltiplas chamadas independentes
2. **Notificações** são fire-and-forget - não espere resposta
3. **Type seus resultados** para melhor DX
4. **Trate erros** específicos com `JsonRpcException`
5. **Combine com retry** para resiliência

# Model Context Protocol (MCP) Integration

Recker provides first-class support for the [Model Context Protocol (MCP)](https://modelcontextprotocol.io), allowing you to easily integrate with AI tools, resources, and prompts over HTTP/SSE.

## What is MCP?

MCP is Anthropic's open protocol that enables AI applications to connect with external tools, data sources, and prompt templates. It provides a standardized way for LLMs to:

- **Call Tools**: Execute functions (web search, API calls, data processing, etc.)
- **Read Resources**: Access data sources (files, databases, APIs)
- **Use Prompts**: Apply pre-built prompt templates
- **Receive Updates**: Get real-time notifications via Server-Sent Events (SSE)

## Quick Start

```typescript
import { createMCPClient } from 'recker';

// Create MCP client
const mcp = createMCPClient({
  endpoint: 'http://localhost:3000/mcp',
  clientName: 'my-app',
  clientVersion: '1.0.0'
});

// Connect
await mcp.connect();

// List available tools
const tools = await mcp.tools.list();

// Call a tool
const result = await mcp.tools.call('get_weather', {
  location: 'San Francisco'
});

// Disconnect
await mcp.disconnect();
```

## Features

### ✅ Complete MCP Support

- **JSON-RPC 2.0** protocol
- **HTTP/SSE transport** (not just stdio!)
- **Type-safe** TypeScript interfaces
- **Event-driven** architecture
- **Auto-reconnect** and retry logic
- **Progress tracking** via SSE
- **Resource subscriptions**

### 🎯 Intuitive API

Unlike raw MCP implementations, Recker provides clean, organized APIs:

```typescript
// Tools API
await mcp.tools.list()           // List all tools
await mcp.tools.get('name')      // Get specific tool
await mcp.tools.call('name', {}) // Call tool

// Resources API
await mcp.resources.list()       // List all resources
await mcp.resources.read('uri')  // Read resource
await mcp.resources.subscribe()  // Subscribe to updates

// Prompts API
await mcp.prompts.list()         // List all prompts
await mcp.prompts.get('name', {})// Get prompt with args
```

### 🔄 Real-time Updates

Automatic SSE connection for notifications:

```typescript
mcp.on('progress', (progress) => {
  console.log(`${progress.progress}/${progress.total}`);
});

mcp.on('resource:updated', (update) => {
  console.log('Resource changed:', update);
});

mcp.on('tools:changed', async () => {
  const tools = await mcp.tools.list();
  console.log('Tools updated:', tools);
});
```

## Configuration

```typescript
const mcp = createMCPClient({
  // Required
  endpoint: 'http://localhost:3000/mcp',

  // Optional
  clientName: 'my-app',        // Your app name
  clientVersion: '1.0.0',      // Your app version
  protocolVersion: '2024-11-05', // MCP protocol version
  headers: {                   // Custom headers
    'Authorization': 'Bearer token'
  },
  timeout: 30000,              // Request timeout (ms)
  retries: 3,                  // Auto-retry failed requests
  debug: true                  // Enable debug logging
});
```

## Use Cases

### 1. AI Assistant

```typescript
const mcp = createMCPClient({
  endpoint: 'http://localhost:3000/mcp'
});

await mcp.connect();

// Search for information
const search = await mcp.tools.call('web_search', {
  query: 'latest TypeScript features'
});

// Summarize results
const summary = await mcp.tools.call('summarize', {
  text: search.content[0].text,
  maxLength: 200
});

console.log(summary.content);
```

### 2. Data Pipeline

```typescript
// Subscribe to data stream
await mcp.resources.subscribe('db://users/stream');

// Process updates in real-time
mcp.on('resource:updated', async (update) => {
  // Transform data
  const transformed = await mcp.tools.call('transform_data', {
    data: update.content,
    schema: 'analytics'
  });

  // Store results
  await mcp.tools.call('store_results', transformed);
});
```

### 3. Content Generation

```typescript
// Get prompt template
const prompt = await mcp.prompts.get('blog_outline', {
  topic: 'TypeScript Best Practices',
  audience: 'developers'
});

// Generate content
const content = await mcp.tools.call('generate_content', {
  prompt: prompt[0].content,
  style: 'professional'
});
```

## Connection Pooling

For high-throughput applications:

```typescript
class MCPPool {
  private clients: MCPClient[] = [];

  async initialize(endpoint: string, size: number) {
    for (let i = 0; i < size; i++) {
      const client = createMCPClient({ endpoint });
      await client.connect();
      this.clients.push(client);
    }
  }

  getClient(): MCPClient {
    // Round-robin selection
    return this.clients[Math.floor(Math.random() * this.clients.length)];
  }
}

const pool = new MCPPool();
await pool.initialize('http://localhost:3000/mcp', 10);

// Parallel requests using different connections
await Promise.all([
  pool.getClient().tools.call('tool1', {}),
  pool.getClient().tools.call('tool2', {}),
  pool.getClient().tools.call('tool3', {}),
]);
```

## Error Handling

```typescript
try {
  const result = await mcp.tools.call('risky_tool', {});

  if (result.isError) {
    console.error('Tool error:', result.content);
    // Fallback strategy
  }
} catch (error) {
  // Network or protocol error
  console.error('Request failed:', error);
}
```

## Events

| Event | Description | Payload |
|-------|-------------|---------|
| `connected` | Connected to MCP server | `MCPServerInfo` |
| `disconnected` | Disconnected from server | - |
| `progress` | Tool execution progress | `MCPProgressNotification` |
| `resource:updated` | Resource changed | Resource update |
| `resources:changed` | Resources list changed | - |
| `tools:changed` | Tools list changed | - |
| `prompts:changed` | Prompts list changed | - |
| `error` | Error occurred | `Error` |

## Comparison: Recker vs Raw MCP

### Recker (Intuitive)

```typescript
const mcp = createMCPClient({ endpoint: 'http://localhost:3000/mcp' });
await mcp.connect();

const tools = await mcp.tools.list();
const result = await mcp.tools.call('weather', { city: 'SF' });
```

### Raw MCP (Complex)

```typescript
const response = await fetch('http://localhost:3000/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'weather', arguments: { city: 'SF' } }
  })
});

const json = await response.json();
if (json.error) throw new Error(json.error.message);
const result = json.result;
```

## Best Practices

1. **Always disconnect**: Call `disconnect()` when done
2. **Use connection pooling**: For high-throughput apps
3. **Handle errors**: Tools can return errors without throwing
4. **Subscribe smartly**: Only subscribe to resources you need
5. **Debug mode**: Enable during development

## Learn More

- [MCP Specification](https://modelcontextprotocol.io)
- [Full Examples](../examples/mcp-integration.ts)
- [Recker Documentation](../README.md)

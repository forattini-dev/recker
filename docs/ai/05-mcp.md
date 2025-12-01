# MCP (Model Context Protocol)

Recker provides both MCP Client and Server implementations.

- **MCP Client**: Connect to MCP servers to access tools, resources, and prompts
- **MCP Server**: Expose your documentation to AI agents like Claude Code

---

# MCP Client

Connect to MCP servers to access tools, resources, and prompts.

## What is MCP?

Model Context Protocol (MCP) is a standard for connecting AI models to external tools, data sources, and prompts. It uses JSON-RPC 2.0 over HTTP.

**Key Concepts:**
- **Tools**: Functions the AI can call (get weather, search database)
- **Resources**: Data the AI can read (files, databases, APIs)
- **Prompts**: Pre-built prompt templates with arguments

## Quick Start

```typescript
import { createMCPClient } from 'recker/mcp';

const mcp = createMCPClient({
  endpoint: 'http://localhost:3000/mcp'
});

// Connect to server
await mcp.connect();

// List available tools
const tools = await mcp.tools.list();

// Call a tool
const result = await mcp.tools.call('get_weather', {
  location: 'San Francisco'
});

console.log(result.content);
```

## Configuration

### Basic Setup

```typescript
const mcp = createMCPClient({
  endpoint: 'http://localhost:3000/mcp',
  clientName: 'my-app',
  clientVersion: '1.0.0'
});
```

### Full Options

```typescript
const mcp = createMCPClient({
  endpoint: 'http://localhost:3000/mcp',

  // Client identification
  clientName: 'my-app',
  clientVersion: '1.0.0',
  protocolVersion: '2024-11-05',

  // HTTP options
  headers: {
    'Authorization': 'Bearer token'
  },
  timeout: 30000,
  retries: 3,

  // Debugging
  debug: true
});
```

### Connection Lifecycle

```typescript
const mcp = createMCPClient({
  endpoint: 'http://localhost:3000/mcp'
});

// Connect (required before any operations)
const serverInfo = await mcp.connect();
console.log('Connected to:', serverInfo.name, serverInfo.version);

// Check connection
if (mcp.isConnected()) {
  // Use MCP...
}

// Disconnect when done
await mcp.disconnect();
```

## Tools

Tools are functions exposed by the MCP server.

### List Tools

```typescript
const tools = await mcp.tools.list();

for (const tool of tools) {
  console.log(`${tool.name}: ${tool.description}`);
  console.log('Schema:', tool.inputSchema);
}

// Example output:
// get_weather: Get weather for a location
// Schema: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] }
```

### Get Tool by Name

```typescript
const tool = await mcp.tools.get('get_weather');

if (tool) {
  console.log(tool.description);
  console.log(tool.inputSchema.properties);
}
```

### Call Tool

```typescript
const result = await mcp.tools.call('get_weather', {
  location: 'San Francisco',
  unit: 'celsius'
});

// Result contains content array
for (const content of result.content) {
  if (content.type === 'text') {
    console.log(content.text);
  }
}

// Check for errors
if (result.isError) {
  console.error('Tool execution failed');
}
```

### Tool Call with Complex Arguments

```typescript
const result = await mcp.tools.call('search_database', {
  query: 'SELECT * FROM users WHERE active = true',
  database: 'production',
  options: {
    limit: 100,
    offset: 0
  }
});
```

## Resources

Resources are data sources the AI can read.

### List Resources

```typescript
const resources = await mcp.resources.list();

for (const resource of resources) {
  console.log(`${resource.name}: ${resource.uri}`);
  console.log(`Type: ${resource.mimeType}`);
  console.log(`Description: ${resource.description}`);
}
```

### Read Resource

```typescript
const contents = await mcp.resources.read('file://data.json');

for (const content of contents) {
  if (content.text) {
    console.log('Text content:', content.text);
  }

  if (content.blob) {
    // Base64 encoded binary
    const buffer = Buffer.from(content.blob, 'base64');
    console.log('Binary size:', buffer.length);
  }
}
```

### Subscribe to Resource Updates

```typescript
// Subscribe to changes
await mcp.resources.subscribe('file://config.json');

// Listen for updates
mcp.on('resource:updated', (params) => {
  console.log('Resource updated:', params.uri);
});

// Unsubscribe when done
await mcp.resources.unsubscribe('file://config.json');
```

## Prompts

Prompts are pre-built templates with optional arguments.

### List Prompts

```typescript
const prompts = await mcp.prompts.list();

for (const prompt of prompts) {
  console.log(`${prompt.name}: ${prompt.description}`);

  if (prompt.arguments) {
    for (const arg of prompt.arguments) {
      console.log(`  - ${arg.name}: ${arg.description} ${arg.required ? '(required)' : ''}`);
    }
  }
}
```

### Get Prompt Messages

```typescript
const messages = await mcp.prompts.get('code_review', {
  language: 'typescript',
  style: 'thorough'
});

// Messages are ready to use with AI
for (const msg of messages) {
  console.log(`${msg.role}:`, msg.content);
}

// Use with AI client
const response = await ai.chat({
  model: 'gpt-5.1',
  messages: messages.map(m => ({
    role: m.role,
    content: m.content.type === 'text' ? m.content.text : ''
  }))
});
```

## Events

MCPClient extends EventEmitter for real-time notifications.

### Connection Events

```typescript
mcp.on('connected', (serverInfo) => {
  console.log('Connected to', serverInfo.name);
});

mcp.on('disconnected', () => {
  console.log('Disconnected from server');
});

mcp.on('error', (error) => {
  console.error('MCP error:', error);
});
```

### Progress Events

```typescript
mcp.on('progress', (notification) => {
  const percent = notification.total
    ? Math.round((notification.progress / notification.total) * 100)
    : notification.progress;

  console.log(`Progress: ${percent}%`);
});
```

### List Change Events

```typescript
// Tools list changed
mcp.on('tools:changed', async () => {
  const tools = await mcp.tools.list();
  console.log('Tools updated:', tools.length);
});

// Resources list changed
mcp.on('resources:changed', async () => {
  const resources = await mcp.resources.list();
  console.log('Resources updated:', resources.length);
});

// Prompts list changed
mcp.on('prompts:changed', async () => {
  const prompts = await mcp.prompts.list();
  console.log('Prompts updated:', prompts.length);
});
```

### Resource Update Events

```typescript
mcp.on('resource:updated', async (params) => {
  console.log('Resource updated:', params.uri);

  // Re-read the updated resource
  const contents = await mcp.resources.read(params.uri);
  console.log('New content:', contents);
});
```

### Debug Events

```typescript
// Enable debug mode
const mcp = createMCPClient({
  endpoint: 'http://localhost:3000/mcp',
  debug: true
});

// Or listen manually
mcp.on('request', (req) => {
  console.log('Sending:', req.method, req.params);
});

mcp.on('response', (res) => {
  console.log('Received:', res.result || res.error);
});

mcp.on('notification', (notif) => {
  console.log('Notification:', notif.method);
});
```

## Integration with AI

### Use MCP Tools with AI

```typescript
import { ai } from 'recker/ai';
import { createMCPClient } from 'recker/mcp';

const mcp = createMCPClient({ endpoint: 'http://localhost:3000/mcp' });
await mcp.connect();

// Get MCP tools
const mcpTools = await mcp.tools.list();

// Convert to AI tool format
const tools = mcpTools.map(tool => ({
  type: 'function' as const,
  function: {
    name: tool.name,
    description: tool.description || '',
    parameters: tool.inputSchema
  }
}));

// Use with AI
const response = await ai.chat({
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
  tools,
  toolChoice: 'auto'
});

// Execute tool calls
if (response.toolCalls) {
  for (const call of response.toolCalls) {
    const args = JSON.parse(call.function.arguments);
    const result = await mcp.tools.call(call.function.name, args);
    console.log('Tool result:', result.content);
  }
}
```

### Use MCP Prompts with AI

```typescript
const messages = await mcp.prompts.get('summarize', {
  length: 'short',
  style: 'bullet-points'
});

// Add user content
const fullMessages = [
  ...messages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content.type === 'text' ? m.content.text : ''
  })),
  { role: 'user' as const, content: 'Long document to summarize...' }
];

const response = await ai.chat({
  model: 'gpt-5.1',
  messages: fullMessages
});
```

### Use MCP Resources as Context

```typescript
// Read resource content
const contents = await mcp.resources.read('file://knowledge-base.md');
const context = contents.map(c => c.text).join('\n');

// Use as system context
const response = await ai.chat({
  model: 'gpt-5.1',
  systemPrompt: `Use this knowledge base:\n${context}`,
  messages: [{ role: 'user', content: 'Answer my question...' }]
});
```

## Error Handling

```typescript
import { ReckerError } from 'recker';

try {
  await mcp.tools.call('unknown_tool', {});
} catch (error) {
  if (error instanceof ReckerError) {
    console.error('MCP Error:', error.message);
    console.error('Code:', (error as any).code);
    console.error('Data:', (error as any).data);
  }
}
```

### Connection Errors

```typescript
try {
  await mcp.connect();
} catch (error) {
  console.error('Failed to connect:', error.message);
  // Retry or use fallback
}
```

### Not Initialized Error

```typescript
const mcp = createMCPClient({ endpoint: 'http://localhost:3000/mcp' });

// This will throw - must connect first
try {
  await mcp.tools.list();
} catch (error) {
  // "MCP client not initialized. Call connect() first."
}

// Correct usage
await mcp.connect();
await mcp.tools.list(); // Works
```

## Health Check

```typescript
// Ping the server
await mcp.ping();
console.log('Server is responsive');

// Get server info
const info = mcp.getServerInfo();
if (info) {
  console.log('Server:', info.name, info.version);
  console.log('Capabilities:', info.capabilities);
}
```

## Types

### MCPTool

```typescript
interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}
```

### MCPResource

```typescript
interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}
```

### MCPPrompt

```typescript
interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}
```

### MCPContent

```typescript
type MCPContent = MCPTextContent | MCPImageContent | MCPResourceContent;

interface MCPTextContent {
  type: 'text';
  text: string;
}

interface MCPImageContent {
  type: 'image';
  data: string;  // Base64
  mimeType: string;
}

interface MCPResourceContent {
  type: 'resource';
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;  // Base64
}
```

## Connection Pooling

For high-throughput applications:

```typescript
class MCPPool {
  private clients: MCPClient[] = [];
  private index = 0;

  async initialize(endpoint: string, size: number) {
    for (let i = 0; i < size; i++) {
      const client = createMCPClient({ endpoint });
      await client.connect();
      this.clients.push(client);
    }
  }

  getClient(): MCPClient {
    // Round-robin selection
    const client = this.clients[this.index];
    this.index = (this.index + 1) % this.clients.length;
    return client;
  }

  async shutdown() {
    await Promise.all(this.clients.map(c => c.disconnect()));
  }
}

// Usage
const pool = new MCPPool();
await pool.initialize('http://localhost:3000/mcp', 10);

// Parallel requests using different connections
const results = await Promise.all([
  pool.getClient().tools.call('tool1', {}),
  pool.getClient().tools.call('tool2', {}),
  pool.getClient().tools.call('tool3', {}),
]);

// Cleanup
await pool.shutdown();
```

## Best Practices

### 1. Always Connect Before Use

```typescript
const mcp = createMCPClient({ endpoint: '...' });

// Always connect first
await mcp.connect();

// Then use APIs
const tools = await mcp.tools.list();
```

### 2. Handle Disconnections

```typescript
mcp.on('disconnected', async () => {
  console.log('Lost connection, reconnecting...');
  await mcp.connect();
});
```

### 3. Cache Tool Definitions

```typescript
let cachedTools: MCPTool[] = [];

mcp.on('tools:changed', async () => {
  cachedTools = await mcp.tools.list();
});

// Initial load
await mcp.connect();
cachedTools = await mcp.tools.list();
```

### 4. Validate Tool Arguments

```typescript
const tool = await mcp.tools.get('my_tool');

if (tool) {
  // Use JSON Schema to validate before calling
  const isValid = validateAgainstSchema(args, tool.inputSchema);

  if (isValid) {
    await mcp.tools.call(tool.name, args);
  }
}
```

### 5. Clean Up on Exit

```typescript
process.on('SIGTERM', async () => {
  await mcp.disconnect();
  process.exit(0);
});
```

---

# MCP Server

Recker includes a built-in MCP Server that exposes documentation to AI agents like Claude Code.

## Quick Start

### CLI Usage

```bash
# Start in stdio mode (for Claude Code)
rek mcp

# Start HTTP server
rek mcp -t http

# Start with SSE support
rek mcp -t sse -p 8080

# Enable debug logging
rek mcp --debug
```

### Programmatic Usage

```typescript
import { createMCPServer } from 'recker/mcp';

// stdio mode (for CLI tools)
const server = createMCPServer({ transport: 'stdio' });
await server.start();

// HTTP mode
const server = createMCPServer({
  transport: 'http',
  port: 3100
});
await server.start();

// SSE mode (with real-time notifications)
const server = createMCPServer({
  transport: 'sse',
  port: 3100
});
await server.start();
```

## Transport Modes

| Mode | Use Case | Endpoints |
|------|----------|-----------|
| **stdio** | Claude Code, CLI tools | stdin/stdout |
| **http** | Simple integrations | POST / |
| **sse** | Real-time applications | POST /, GET /sse, GET /health |

### stdio (Default)

Best for Claude Code and other CLI-based AI tools:

```bash
rek mcp
```

Communication happens via stdin (requests) and stdout (responses). Debug logs go to stderr.

### HTTP

Simple HTTP POST endpoint for web integrations:

```bash
rek mcp -t http -p 3100
```

```bash
# Example request
curl -X POST http://localhost:3100 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### SSE (Server-Sent Events)

HTTP with real-time notifications:

```bash
rek mcp -t sse -p 3100
```

**Endpoints:**
- `POST /` - JSON-RPC requests
- `GET /sse` - Server-Sent Events stream
- `GET /health` - Health check

```typescript
// Connect to SSE for real-time updates
const events = new EventSource('http://localhost:3100/sse');

events.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Notification:', data);
};
```

## Available Tools

The MCP Server provides 2 focused tools:

### search_docs

Search documentation by keyword:

```json
{
  "name": "search_docs",
  "arguments": {
    "query": "retry",
    "category": "http",
    "limit": 5
  }
}
```

**Parameters:**
- `query` (required): Search keywords
- `category` (optional): Filter by category (http, cli, ai, protocols, reference, guides)
- `limit` (optional): Max results (default: 5, max: 10)

### get_doc

Get full content of a documentation file:

```json
{
  "name": "get_doc",
  "arguments": {
    "path": "http/07-resilience.md"
  }
}
```

**Parameters:**
- `path` (required): Documentation file path from search results

## Claude Code Integration

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "recker-docs": {
      "command": "npx",
      "args": ["recker", "mcp"]
    }
  }
}
```

Or with a local installation:

```json
{
  "mcpServers": {
    "recker-docs": {
      "command": "rek",
      "args": ["mcp"]
    }
  }
}
```

Now Claude Code can search and read Recker documentation:

```
User: How do I implement retry logic with recker?

Claude: Let me search the documentation...
[Uses search_docs tool with query "retry"]

I found relevant documentation. Let me read the full content...
[Uses get_doc tool with path "http/07-resilience.md"]

Based on the documentation, here's how to implement retry logic...
```

## Configuration Options

```typescript
interface MCPServerOptions {
  // Server identification
  name?: string;        // Default: 'recker-docs'
  version?: string;     // Default: '1.0.0'

  // Transport
  transport?: 'stdio' | 'http' | 'sse';  // Default: 'stdio'
  port?: number;        // Default: 3100 (for http/sse)

  // Documentation
  docsPath?: string;    // Default: auto-detected

  // Debugging
  debug?: boolean;      // Default: false
}
```

## Custom Documentation Path

Serve your own documentation:

```bash
rek mcp -d /path/to/your/docs
```

```typescript
const server = createMCPServer({
  docsPath: '/path/to/your/docs',
  name: 'my-project-docs'
});
```

## Health Check (SSE Mode)

```bash
curl http://localhost:3100/health
```

Response:

```json
{
  "status": "ok",
  "name": "recker-docs",
  "version": "1.0.0",
  "docsCount": 58,
  "sseClients": 2
}
```

## JSON-RPC Methods

The server implements standard MCP methods:

| Method | Description |
|--------|-------------|
| `initialize` | Initialize connection |
| `ping` | Health check |
| `tools/list` | List available tools |
| `tools/call` | Execute a tool |
| `resources/list` | List resources (empty) |
| `prompts/list` | List prompts (empty) |

## Example: Full Integration

```typescript
import { createMCPClient, createMCPServer } from 'recker/mcp';

// Start server
const server = createMCPServer({
  transport: 'http',
  port: 3100,
  debug: true
});
await server.start();

// Connect client
const client = createMCPClient({
  endpoint: 'http://localhost:3100'
});
await client.connect();

// Search documentation
const searchResult = await client.tools.call('search_docs', {
  query: 'streaming'
});
console.log(searchResult.content[0].text);

// Get full doc
const docResult = await client.tools.call('get_doc', {
  path: 'ai/02-streaming.md'
});
console.log(docResult.content[0].text);

// Cleanup
await client.disconnect();
await server.stop();
```

## Next Steps

- **[Overview](01-overview.md)** - Back to AI basics
- **[Patterns](04-patterns.md)** - Common AI patterns

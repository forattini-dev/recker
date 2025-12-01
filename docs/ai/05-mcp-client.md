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

### 4. Clean Up on Exit

```typescript
process.on('SIGTERM', async () => {
  await mcp.disconnect();
  process.exit(0);
});
```

## Next Steps

- **[MCP Server](06-mcp-server.md)** - Expose your docs to AI agents
- **[AI Patterns](04-patterns.md)** - Common AI integration patterns

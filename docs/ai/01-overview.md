# AI Layer Overview

Unified AI communication across OpenAI, Anthropic, and more.

## Features

- **Multi-Provider**: OpenAI, Anthropic, Google, Ollama support
- **Unified API**: Same interface for all providers
- **Streaming**: Token-by-token streaming with typed events
- **Tool Calling**: Function calling across providers
- **Metrics**: Token usage, cost tracking, latency
- **Retry Logic**: Smart retry with fallbacks
- **Type Safety**: Full TypeScript support

## Quick Start

### Installation

```typescript
import { ai, createAIClient } from 'recker/ai';
```

### Simple Chat

```typescript
// Simple prompt
const response = await ai.chat('Hello, how are you?');
console.log(response.content);

// With options
const response = await ai.chat({
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: 'Hello!' }],
  temperature: 0.7
});

console.log(response.content);
console.log(response.usage); // { inputTokens, outputTokens, totalTokens }
```

### Streaming

```typescript
const stream = await ai.stream({
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: 'Write a poem' }]
});

for await (const event of stream) {
  if (event.type === 'text') {
    process.stdout.write(event.content);
  }
}
```

### Use Different Provider

```typescript
// OpenAI (default)
await ai.chat({
  provider: 'openai',
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: 'Hello' }]
});

// Anthropic
await ai.chat({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  messages: [{ role: 'user', content: 'Hello' }]
});
```

## Configuration

### Environment Variables

```bash
# OpenAI
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Custom Client

```typescript
const myClient = createAIClient({
  defaultProvider: 'anthropic',
  providers: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      organization: 'org-xxx'
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY
    }
  },
  timeout: {
    firstToken: 30000,
    total: 120000
  },
  retry: {
    maxAttempts: 3,
    fallback: {
      'claude-opus-4': 'claude-sonnet-4'
    }
  },
  debug: true
});
```

## Response Object

```typescript
const response = await ai.chat('Hello');

console.log({
  // Content
  content: response.content,          // "Hello! How can I help?"

  // Usage
  usage: {
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    totalTokens: response.usage.totalTokens
  },

  // Latency
  latency: {
    ttft: response.latency.ttft,     // Time to first token (ms)
    tps: response.latency.tps,       // Tokens per second
    total: response.latency.total    // Total time (ms)
  },

  // Metadata
  model: response.model,              // "gpt-5.1"
  provider: response.provider,        // "openai"
  finishReason: response.finishReason, // "stop" | "length" | "tool_calls"

  // Cost (if available)
  cost: response.cost                 // { inputCost, outputCost, totalCost }
});
```

## Specialized Clients

Create pre-configured clients for specific use cases:

```typescript
// Code assistant
const codeClient = ai.extend({
  model: 'gpt-5.1',
  systemPrompt: 'You are a coding assistant. Respond with code only.',
  temperature: 0
});

const response = await codeClient.chat('Write a fibonacci function');

// Creative writing
const creativeClient = ai.extend({
  model: 'claude-sonnet-4-20250514',
  provider: 'anthropic',
  temperature: 1.0
});

// Multi-turn conversation
const chatClient = ai.extend({
  model: 'gpt-5.1',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' }
  ]
});
```

## Metrics

Track usage across all requests:

```typescript
const client = createAIClient();

// Make requests
await client.chat('Hello');
await client.chat('World');

// Get metrics
console.log(client.metrics.summary());
// {
//   totalRequests: 2,
//   totalTokens: 150,
//   totalCost: 0.003,
//   avgLatency: { ttft: 250, total: 500 },
//   errorRate: 0,
//   cacheHitRate: 0,
//   byModel: { 'gpt-5.1': { requests: 2, tokens: 150, cost: 0.003 } },
//   byProvider: { 'openai': { requests: 2, tokens: 150, cost: 0.003 } }
// }

// Reset metrics
client.metrics.reset();
```

## Error Handling

```typescript
import { AIError, RateLimitError, ContextLengthError, AuthenticationError } from 'recker/ai';

try {
  await ai.chat({ messages: [...], model: 'gpt-5.1' });
} catch (error) {
  if (error instanceof AuthenticationError) {
    // Invalid API key
    console.log('Check your API key');
  } else if (error instanceof RateLimitError) {
    // Rate limited
    console.log(`Retry after ${error.retryAfter}s`);
  } else if (error instanceof ContextLengthError) {
    // Input too long
    console.log('Reduce message length');
  } else if (error instanceof AIError) {
    // Other AI errors
    console.log(error.message, error.provider, error.code);
  }
}
```

## Supported Models

### OpenAI

| Model | Description |
|-------|-------------|
| `gpt-5.1` | GPT-5.1 (default, flagship) |
| `gpt-5.1-codex` | GPT-5.1 Codex (optimized for code) |
| `gpt-5.1-mini` | GPT-5.1 Mini (fast/cheap) |
| `o1-preview` | O1 Preview |
| `o1-mini` | O1 Mini |
| `text-embedding-3-large` | Embeddings |

### Anthropic

| Model | Description |
|-------|-------------|
| `claude-sonnet-4-5-20250514` | Claude Sonnet 4.5 (default) |
| `claude-opus-4-5-20250514` | Claude Opus 4.5 |
| `claude-haiku-4-5` | Claude Haiku 4.5 |

## Next Steps

- **[Streaming](02-streaming.md)** - Token streaming and events
- **[Providers](03-providers.md)** - Provider-specific features
- **[Patterns](04-patterns.md)** - Prompt handling and context
- **[MCP](05-mcp.md)** - Model Context Protocol
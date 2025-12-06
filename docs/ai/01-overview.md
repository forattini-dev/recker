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

## Usage Styles

### 1. Direct Functions (Zero Config)

```typescript
import { recker } from 'recker';

// Simple chat
const response = await recker.ai.chat('Hello, how are you?');
console.log(response);

// Streaming
for await (const event of recker.ai.stream({
  model: 'gpt-5',
  messages: [{ role: 'user', content: 'Write a poem' }]
})) {
  process.stdout.write(event.choices[0]?.delta?.content || '');
}

// Embeddings
const embeddings = await recker.ai.embed({
  input: 'Hello, world!'
});
```

### 2. Configured Client

```typescript
import { createAI } from 'recker/ai';
// or
const ai = recker.aiClient(options);

const ai = createAI({
  defaultProvider: 'openai',
  timeout: 30000
});

const response = await ai.chat('Hello!');
```

## Simple Chat

```typescript
import { recker } from 'recker';

// Simple prompt
const response = await recker.ai.chat('Hello, how are you?');
console.log(response);

// With options
const ai = recker.aiClient();
const response = await ai.chat({
  model: 'gpt-5',
  messages: [{ role: 'user', content: 'Hello!' }],
  temperature: 0.7
});

console.log(response.content);
console.log(response.usage); // { inputTokens, outputTokens, totalTokens }
```

## Streaming

```typescript
import { recker } from 'recker';

for await (const event of recker.ai.stream({
  model: 'gpt-5',
  messages: [{ role: 'user', content: 'Write a poem' }]
})) {
  if (event.type === 'text') {
    process.stdout.write(event.content);
  }
}
```

## Use Different Provider

```typescript
import { createAI } from 'recker/ai';

const ai = createAI();

// OpenAI (default)
await ai.chat({
  provider: 'openai',
  model: 'gpt-5',
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
import { createAI } from 'recker/ai';

const ai = createAI({
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
import { createAI } from 'recker/ai';

const ai = createAI();
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
import { createAI } from 'recker/ai';

const ai = createAI();

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
import { createAI } from 'recker/ai';

const ai = createAI();

// Make requests
await ai.chat('Hello');
await ai.chat('World');

// Get metrics
console.log(ai.metrics.summary());
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
ai.metrics.reset();
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
| `gpt-5.1` | GPT-5.1 Instant (flagship, adaptive reasoning) |
| `gpt-5.1-thinking` | GPT-5.1 Thinking (advanced reasoning) |
| `gpt-5` | GPT-5 (unified adaptive system) |
| `gpt-5-mini` | GPT-5 Mini (fast/cheap) |
| `gpt-5-nano` | GPT-5 Nano (smallest) |
| `o3` | O3 (reasoning) |
| `o3-mini` | O3 Mini (fast reasoning) |
| `text-embedding-3-large` | Embeddings (3072 dimensions) |
| `text-embedding-3-small` | Embeddings (1536 dimensions) |

### Anthropic

| Model | Description |
|-------|-------------|
| `claude-opus-4-5-20251124` | Claude Opus 4.5 (most capable) |
| `claude-sonnet-4-5-20250929` | Claude Sonnet 4.5 (best for agents/coding) |
| `claude-haiku-4-5` | Claude Haiku 4.5 (fastest, 1/3 cost) |
| `claude-opus-4-1-20250805` | Claude Opus 4.1 (agentic tasks) |
| `claude-sonnet-4-20250522` | Claude Sonnet 4 |
| `claude-opus-4-20250522` | Claude Opus 4 |

### Google (Vertex AI / AI Studio)

| Model | Description |
|-------|-------------|
| `gemini-3-pro` | Gemini 3.0 Pro (SOTA, beats GPT-5 Pro) |
| `gemini-3-deep-think` | Gemini 3.0 Deep Think (advanced reasoning) |
| `gemini-2.5-pro` | Gemini 2.5 Pro (thinking model) |
| `gemini-2.5-flash` | Gemini 2.5 Flash (fast, efficient) |
| `gemini-2.5-flash-lite` | Gemini 2.5 Flash-Lite (most cost-efficient) |
| `gemini-2.0-flash` | Gemini 2.0 Flash (1M context, tool use) |
| `text-embedding-005` | Embeddings |

### Other Providers

| Provider | Models |
|----------|--------|
| **Groq** | `llama-4-70b`, `llama-4-8b`, `mixtral-8x7b` |
| **Ollama** | Any local model (llama3, mistral, etc.) |
| **Together** | `llama-4-405b`, `mixtral-8x22b` |
| **Mistral** | `mistral-large`, `mistral-medium` |

## Next Steps

- **[Streaming](02-streaming.md)** - Token streaming and events
- **[Providers](03-providers.md)** - Provider-specific features
- **[Patterns](04-patterns.md)** - Prompt handling and context
- **[MCP](05-mcp.md)** - Model Context Protocol
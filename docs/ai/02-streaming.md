# Streaming

Token-by-token streaming for real-time AI responses.

## Basic Streaming

```typescript
const stream = await ai.stream({
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: 'Write a short story' }]
});

for await (const event of stream) {
  if (event.type === 'text') {
    process.stdout.write(event.content);
  }
}
```

## Stream Events

### Event Types

```typescript
type StreamEventType =
  | 'text'           // Text chunk
  | 'tool_call'      // Tool/function call
  | 'tool_call_delta' // Partial tool call
  | 'usage'          // Token usage
  | 'done'           // Stream complete
  | 'error';         // Error occurred
```

### Handle All Events

```typescript
for await (const event of stream) {
  switch (event.type) {
    case 'text':
      // Text content chunk
      process.stdout.write(event.content);
      break;

    case 'tool_call':
      // Complete tool call
      console.log('Tool:', event.toolCall.function.name);
      console.log('Args:', event.toolCall.function.arguments);
      break;

    case 'tool_call_delta':
      // Partial tool call (streaming arguments)
      console.log('Delta:', event.delta.arguments);
      break;

    case 'usage':
      // Token usage update
      console.log('Tokens:', event.usage.totalTokens);
      break;

    case 'done':
      // Stream complete
      console.log('Finished:', event.finishReason);
      break;

    case 'error':
      // Error occurred
      console.error('Error:', event.error.message);
      break;
  }
}
```

## Collect Stream Content

### Accumulate Text

```typescript
let fullContent = '';

for await (const event of stream) {
  if (event.type === 'text') {
    fullContent += event.content;
  }
}

console.log('Complete response:', fullContent);
```

### With Progress

```typescript
let tokenCount = 0;

for await (const event of stream) {
  if (event.type === 'text') {
    tokenCount++;
    process.stdout.write(event.content);
  }

  if (event.type === 'usage') {
    console.log(`\nTotal tokens: ${event.usage.totalTokens}`);
  }
}
```

## Streaming with Tools

### Tool Call Detection

```typescript
const stream = await ai.stream({
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
  tools: [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string' }
        }
      }
    }
  }]
});

const toolCalls: ToolCall[] = [];

for await (const event of stream) {
  if (event.type === 'text') {
    process.stdout.write(event.content);
  }

  if (event.type === 'tool_call') {
    toolCalls.push(event.toolCall);
  }
}

// Process tool calls after stream
for (const call of toolCalls) {
  const result = await executeToolCall(call);
  // Continue conversation with tool result
}
```

### Streaming Tool Arguments

For large tool arguments, handle deltas:

```typescript
const toolArguments: Map<number, string> = new Map();

for await (const event of stream) {
  if (event.type === 'tool_call_delta') {
    const current = toolArguments.get(event.index) || '';
    toolArguments.set(event.index, current + (event.delta.arguments || ''));
  }

  if (event.type === 'tool_call') {
    // Complete tool call available
    console.log('Tool ready:', event.toolCall);
  }
}
```

## Provider-Specific Streaming

### OpenAI

```typescript
const stream = await ai.stream({
  provider: 'openai',
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: 'Hello' }]
});

// OpenAI provides usage in final chunk
for await (const event of stream) {
  if (event.type === 'usage') {
    console.log('OpenAI usage:', event.usage);
  }
}
```

### Anthropic

```typescript
const stream = await ai.stream({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  messages: [{ role: 'user', content: 'Hello' }]
});

// Anthropic streaming events are normalized
for await (const event of stream) {
  if (event.type === 'text') {
    process.stdout.write(event.content);
  }
}
```

## Streaming Patterns

### CLI Output

```typescript
async function streamToConsole(stream: AIStream) {
  for await (const event of stream) {
    if (event.type === 'text') {
      process.stdout.write(event.content);
    }
  }
  process.stdout.write('\n');
}
```

### Web Response

```typescript
async function streamToResponse(stream: AIStream): Promise<ReadableStream> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        if (event.type === 'text') {
          controller.enqueue(encoder.encode(event.content));
        }
        if (event.type === 'done') {
          controller.close();
        }
      }
    }
  });
}
```

### Server-Sent Events

```typescript
import { Response } from 'express';

async function streamAsSSE(stream: AIStream, res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  for await (const event of stream) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
}
```

### React/Next.js

```typescript
'use client';

import { useState } from 'react';

export function AIChat() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(prompt: string) {
    setLoading(true);
    setContent('');

    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ prompt })
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      setContent(prev => prev + chunk);
    }

    setLoading(false);
  }

  return (
    <div>
      <pre>{content}</pre>
      {loading && <span>Generating...</span>}
    </div>
  );
}
```

## Cancellation

### Abort Stream

```typescript
const controller = new AbortController();

const stream = await ai.stream({
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: 'Write a very long story' }],
  signal: controller.signal
});

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  for await (const event of stream) {
    if (event.type === 'text') {
      process.stdout.write(event.content);
    }
  }
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('\nStream cancelled');
  }
}
```

### Timeout

```typescript
const stream = await ai.stream({
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: 'Hello' }],
  timeout: {
    firstToken: 10000,   // 10s to first token
    betweenTokens: 5000, // 5s between tokens
    total: 60000         // 60s total
  }
});
```

## Error Handling

```typescript
try {
  for await (const event of stream) {
    if (event.type === 'error') {
      // Error event in stream
      console.error('Stream error:', event.error);
      break;
    }
    // Handle other events
  }
} catch (error) {
  // Stream-level error
  if (error.name === 'AbortError') {
    console.log('Aborted');
  } else {
    console.error('Fatal error:', error);
  }
}
```

## Best Practices

### 1. Always Handle Done Event

```typescript
for await (const event of stream) {
  if (event.type === 'text') {
    process.stdout.write(event.content);
  }

  if (event.type === 'done') {
    // Cleanup, log final usage
    console.log('Finished:', event.finishReason);
  }
}
```

### 2. Track Token Usage

```typescript
let totalTokens = 0;

for await (const event of stream) {
  if (event.type === 'usage') {
    totalTokens = event.usage.totalTokens;
  }
}

console.log(`Used ${totalTokens} tokens`);
```

### 3. Set Reasonable Timeouts

```typescript
const stream = await ai.stream({
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: prompt }],
  timeout: {
    firstToken: 30000,   // Long prompts may take time
    betweenTokens: 5000, // Detect stalls
    total: 120000        // Overall limit
  }
});
```

### 4. Buffer for UI

```typescript
let buffer = '';
let lastUpdate = Date.now();

for await (const event of stream) {
  if (event.type === 'text') {
    buffer += event.content;

    // Throttle UI updates
    if (Date.now() - lastUpdate > 50) {
      updateUI(buffer);
      lastUpdate = Date.now();
    }
  }
}

// Final update
updateUI(buffer);
```

## Next Steps

- **[Providers](03-providers.md)** - Provider-specific features
- **[Patterns](04-patterns.md)** - Prompt handling and context
- **[MCP](05-mcp.md)** - Model Context Protocol

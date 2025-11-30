# Providers

OpenAI, Anthropic, and custom provider configuration.

## OpenAI

### Configuration

```typescript
const client = createAIClient({
  defaultProvider: 'openai',
  providers: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      organization: 'org-xxx',           // Optional
      baseUrl: 'https://api.openai.com/v1' // Default
    }
  }
});
```

### Environment Variables

```bash
export OPENAI_API_KEY="sk-..."
```

### Models

```typescript
// GPT-5.1 (default, flagship)
await ai.chat({
  provider: 'openai',
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: 'Hello' }]
});

// GPT-5.1 Codex (optimized for code)
await ai.chat({
  provider: 'openai',
  model: 'gpt-5.1-codex',
  messages: [{ role: 'user', content: 'Write a Python script...' }]
});

// O1 (reasoning models)
await ai.chat({
  provider: 'openai',
  model: 'o1-preview',
  messages: [{ role: 'user', content: 'Solve this math problem...' }]
});
```

### Embeddings

```typescript
const response = await ai.embed({
  provider: 'openai',
  model: 'text-embedding-3-large',
  input: 'Hello world',
  dimensions: 1024  // Optional: reduce dimensions
});

console.log(response.embeddings[0]); // [0.123, -0.456, ...]
```

### Vision

```typescript
await ai.chat({
  provider: 'openai',
  model: 'gpt-5.1',
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'What is in this image?' },
      { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } }
    ]
  }]
});

// With base64 image
await ai.chat({
  provider: 'openai',
  model: 'gpt-5.1',
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'Describe this:' },
      { type: 'image', data: imageBuffer, mediaType: 'image/png' }
    ]
  }]
});
```

### JSON Mode

```typescript
await ai.chat({
  provider: 'openai',
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: 'List 3 fruits as JSON' }],
  responseFormat: { type: 'json_object' }
});

// With schema
await ai.chat({
  provider: 'openai',
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: 'Generate a user' }],
  responseFormat: {
    type: 'json_schema',
    schema: {
      name: 'user',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' }
        },
        required: ['name', 'age']
      }
    }
  }
});
```

## Anthropic

### Configuration

```typescript
const client = createAIClient({
  defaultProvider: 'anthropic',
  providers: {
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      version: '2025-01-01',  // API version
      baseUrl: 'https://api.anthropic.com/v1' // Default
    }
  }
});
```

### Environment Variables

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Models

```typescript
// Claude Sonnet 4 (default, balanced)
await ai.chat({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  messages: [{ role: 'user', content: 'Hello' }]
});

// Claude Opus 4 (most capable)
await ai.chat({
  provider: 'anthropic',
  model: 'claude-opus-4-20250514',
  messages: [{ role: 'user', content: 'Hello' }]
});

// Claude Haiku (fastest)
await ai.chat({
  provider: 'anthropic',
  model: 'claude-haiku-4-5',
  messages: [{ role: 'user', content: 'Hello' }]
});
```

### System Prompt

Anthropic handles system prompts differently:

```typescript
// Via systemPrompt option (recommended)
await ai.chat({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: 'You are a helpful assistant.',
  messages: [{ role: 'user', content: 'Hello' }]
});

// Via messages array (automatically extracted)
await ai.chat({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello' }
  ]
});
```

### Vision

```typescript
await ai.chat({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'What is in this image?' },
      { type: 'image', data: imageBuffer, mediaType: 'image/jpeg' }
    ]
  }]
});
```

### Max Tokens

Anthropic requires `maxTokens`:

```typescript
await ai.chat({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  messages: [{ role: 'user', content: 'Hello' }],
  maxTokens: 4096  // Default: 4096
});
```

### Embeddings

Anthropic doesn't support embeddings. Use OpenAI or another provider:

```typescript
// This will throw
await ai.embed({
  provider: 'anthropic',
  input: 'Hello'
});
// Error: Anthropic does not support embeddings
```

## Tool Calling

Both providers support function/tool calling:

### Define Tools

```typescript
const tools: ToolDefinition[] = [{
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get weather for a location',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name' },
        unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
      },
      required: ['location']
    }
  }
}];
```

### OpenAI Tools

```typescript
const response = await ai.chat({
  provider: 'openai',
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: 'Weather in Tokyo?' }],
  tools,
  toolChoice: 'auto'
});

if (response.toolCalls) {
  for (const call of response.toolCalls) {
    const args = JSON.parse(call.function.arguments);
    const result = await getWeather(args.location);

    // Continue conversation with tool result
    const followUp = await ai.chat({
      provider: 'openai',
      model: 'gpt-5.1',
      messages: [
        ...originalMessages,
        { role: 'assistant', content: '', tool_calls: response.toolCalls },
        { role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) }
      ]
    });
  }
}
```

### Anthropic Tools

```typescript
const response = await ai.chat({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  messages: [{ role: 'user', content: 'Weather in Tokyo?' }],
  tools,
  toolChoice: 'auto'
});

// Same tool handling - unified interface
if (response.toolCalls) {
  // Process tool calls...
}
```

### Tool Choice

```typescript
// Let model decide
toolChoice: 'auto'

// Force tool use
toolChoice: 'required'

// No tools
toolChoice: 'none'

// Specific tool
toolChoice: { type: 'function', function: { name: 'get_weather' } }
```

## Provider Comparison

| Feature | OpenAI | Anthropic |
|---------|--------|-----------|
| Chat | Yes | Yes |
| Streaming | Yes | Yes |
| Vision | Yes | Yes |
| Tools | Yes | Yes |
| Embeddings | Yes | No |
| JSON Mode | Yes | No |
| System Prompt | In messages | Separate field |
| Max Tokens | Optional | Required |

## Custom Providers

### Azure OpenAI

```typescript
const client = createAIClient({
  providers: {
    openai: {
      baseUrl: 'https://your-resource.openai.azure.com/openai/deployments/your-deployment',
      apiKey: process.env.AZURE_OPENAI_KEY,
      headers: {
        'api-key': process.env.AZURE_OPENAI_KEY
      }
    }
  }
});
```

### Local Models (Ollama)

```typescript
const client = createAIClient({
  providers: {
    openai: {
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'ollama',  // Required but not used
      defaultModel: 'llama2'
    }
  }
});
```

### OpenRouter

```typescript
const client = createAIClient({
  providers: {
    openai: {
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_KEY,
      headers: {
        'HTTP-Referer': 'https://your-site.com'
      }
    }
  }
});

await ai.chat({
  provider: 'openai',
  model: 'anthropic/claude-opus-4-5',  // OpenRouter model ID
  messages: [{ role: 'user', content: 'Hello' }]
});
```

## Error Types

```typescript
import {
  AIError,
  RateLimitError,
  ContextLengthError,
  OverloadedError,
  AuthenticationError
} from 'recker/ai';

try {
  await ai.chat({ ... });
} catch (error) {
  if (error instanceof AuthenticationError) {
    // Invalid API key
    console.log(`Provider: ${error.provider}`);
  }

  if (error instanceof RateLimitError) {
    // Rate limited
    console.log(`Retry after: ${error.retryAfter}s`);
  }

  if (error instanceof ContextLengthError) {
    // Input too long
    console.log(`Provider: ${error.provider}`);
  }

  if (error instanceof OverloadedError) {
    // Server overloaded
    console.log(`Provider: ${error.provider}`);
  }

  if (error instanceof AIError) {
    // Generic AI error
    console.log(error.message);
    console.log(error.provider);
    console.log(error.code);
    console.log(error.status);
    console.log(error.retryable);
  }
}
```

## Next Steps

- **[Patterns](04-patterns.md)** - Prompt handling and context
- **[MCP](05-mcp.md)** - Model Context Protocol
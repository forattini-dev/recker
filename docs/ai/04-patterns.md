# Patterns

Prompt handling, context management, retry strategies, and common patterns.

## Conversation Management

### Multi-Turn Conversations

```typescript
const messages: ChatMessage[] = [
  { role: 'system', content: 'You are a helpful assistant.' }
];

async function chat(userMessage: string): Promise<string> {
  messages.push({ role: 'user', content: userMessage });

  const response = await ai.chat({
    model: 'gpt-5.1',
    messages
  });

  messages.push({ role: 'assistant', content: response.content });
  return response.content;
}

// Use
await chat('Hello');
await chat('What did I just say?');
await chat('Thanks!');
```

### Context Window Management

```typescript
const MAX_MESSAGES = 20;
const messages: ChatMessage[] = [];

function addMessage(message: ChatMessage) {
  messages.push(message);

  // Keep only recent messages + system prompt
  if (messages.length > MAX_MESSAGES) {
    const systemPrompt = messages.find(m => m.role === 'system');
    const recent = messages.slice(-MAX_MESSAGES);

    messages.length = 0;
    if (systemPrompt) messages.push(systemPrompt);
    messages.push(...recent.filter(m => m.role !== 'system'));
  }
}
```

### Summarize Old Context

```typescript
async function summarizeAndContinue(messages: ChatMessage[]): Promise<ChatMessage[]> {
  if (messages.length < 20) return messages;

  const systemPrompt = messages.find(m => m.role === 'system');
  const oldMessages = messages.slice(0, -10);
  const recentMessages = messages.slice(-10);

  // Summarize old messages
  const summary = await ai.chat({
    model: 'gpt-5.1-mini',
    messages: [
      { role: 'system', content: 'Summarize this conversation concisely.' },
      ...oldMessages
    ]
  });

  return [
    ...(systemPrompt ? [systemPrompt] : []),
    { role: 'system', content: `Previous conversation summary: ${summary.content}` },
    ...recentMessages
  ];
}
```

## Retry Strategies

### Basic Retry

```typescript
const response = await ai.chat({
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: 'Hello' }],
  retry: {
    maxAttempts: 3,
    backoff: 'exponential',
    on: ['rate_limit', 'overloaded', 'timeout']
  }
});
```

### Model Fallback

```typescript
const response = await ai.chat({
  model: 'claude-opus-4-20250514',
  messages: [{ role: 'user', content: 'Complex task...' }],
  retry: {
    maxAttempts: 3,
    fallback: {
      'claude-opus-4-20250514': 'claude-sonnet-4-20250514',
      'claude-sonnet-4-20250514': 'gpt-5.1'
    },
    onRetry: (attempt, error) => {
      console.log(`Retry ${attempt}: ${error.message}`);
    }
  }
});
```

### Context Reduction

```typescript
const response = await ai.chat({
  model: 'gpt-5.1',
  messages: longConversation,
  retry: {
    maxAttempts: 3,
    on: ['context_length_exceeded'],
    reduceContext: true  // Auto-reduce context on retry
  }
});
```

### Custom Retry Logic

```typescript
async function chatWithRetry(options: ChatOptions): Promise<AIResponse> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await ai.chat(options);
    } catch (error) {
      if (error instanceof RateLimitError && attempt < maxAttempts) {
        const delay = error.retryAfter || Math.pow(2, attempt) * 1000;
        await sleep(delay);
        continue;
      }

      if (error instanceof ContextLengthError && attempt < maxAttempts) {
        // Reduce messages
        options.messages = options.messages.slice(-Math.floor(options.messages.length / 2));
        continue;
      }

      throw error;
    }
  }

  throw new Error('Max retries exceeded');
}
```

## Prompt Templates

### Simple Templates

```typescript
function createPrompt(task: string, context: string): string {
  return `Task: ${task}

Context:
${context}

Please complete the task based on the context provided.`;
}

const response = await ai.chat({
  model: 'gpt-5.1',
  messages: [{
    role: 'user',
    content: createPrompt('Summarize', 'Long document text...')
  }]
});
```

### Structured Templates

```typescript
interface PromptTemplate {
  system: string;
  user: string;
  variables: Record<string, string>;
}

function renderTemplate(template: PromptTemplate): ChatMessage[] {
  const render = (text: string) =>
    Object.entries(template.variables).reduce(
      (t, [k, v]) => t.replace(new RegExp(`{{${k}}}`, 'g'), v),
      text
    );

  return [
    { role: 'system', content: render(template.system) },
    { role: 'user', content: render(template.user) }
  ];
}

const template: PromptTemplate = {
  system: 'You are a {{role}} expert.',
  user: 'Help me with: {{task}}',
  variables: {
    role: 'Python',
    task: 'Write a function to sort a list'
  }
};

const response = await ai.chat({
  model: 'gpt-5.1',
  messages: renderTemplate(template)
});
```

## Tool Patterns

### Tool Loop

```typescript
async function runWithTools(prompt: string, tools: AgentTool[]): Promise<string> {
  const toolDefs = tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }));

  const messages: ChatMessage[] = [
    { role: 'user', content: prompt }
  ];

  const maxIterations = 10;

  for (let i = 0; i < maxIterations; i++) {
    const response = await ai.chat({
      model: 'gpt-5.1',
      messages,
      tools: toolDefs,
      toolChoice: 'auto'
    });

    messages.push({
      role: 'assistant',
      content: response.content,
      tool_calls: response.toolCalls
    });

    if (!response.toolCalls) {
      return response.content;
    }

    // Execute tools
    for (const call of response.toolCalls) {
      const tool = tools.find(t => t.name === call.function.name);
      const args = JSON.parse(call.function.arguments);
      const result = await tool?.handler(args);

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result)
      });
    }
  }

  return messages[messages.length - 1].content as string;
}
```

### Parallel Tool Execution

```typescript
async function executeToolsParallel(
  toolCalls: ToolCall[],
  tools: Map<string, AgentTool>
): Promise<ChatMessage[]> {
  const results = await Promise.all(
    toolCalls.map(async (call) => {
      const tool = tools.get(call.function.name);
      const args = JSON.parse(call.function.arguments);

      try {
        const result = await tool?.handler(args);
        return {
          role: 'tool' as const,
          tool_call_id: call.id,
          content: JSON.stringify(result)
        };
      } catch (error) {
        return {
          role: 'tool' as const,
          tool_call_id: call.id,
          content: JSON.stringify({ error: error.message })
        };
      }
    })
  );

  return results;
}
```

## Structured Output

### JSON Parsing

```typescript
interface User {
  name: string;
  age: number;
  email: string;
}

async function generateUser(): Promise<User> {
  const response = await ai.chat({
    model: 'gpt-5.1',
    messages: [{ role: 'user', content: 'Generate a random user' }],
    responseFormat: { type: 'json_object' },
    systemPrompt: 'Respond with JSON: { name, age, email }'
  });

  return JSON.parse(response.content);
}
```

### With Zod Validation

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string(),
  age: z.number().int().positive(),
  email: z.string().email()
});

async function generateValidUser(): Promise<z.infer<typeof UserSchema>> {
  const response = await ai.chat({
    model: 'gpt-5.1',
    messages: [{ role: 'user', content: 'Generate a random user' }],
    responseFormat: { type: 'json_object' },
    systemPrompt: `Respond with JSON matching: ${JSON.stringify(UserSchema.shape)}`
  });

  const data = JSON.parse(response.content);
  return UserSchema.parse(data);
}
```

## Cost Management

### Track Costs

```typescript
const client = createAIClient({
  observability: true
});

// Make requests
await client.chat('Hello');
await client.chat('World');

// Check costs
const summary = client.metrics.summary();
console.log(`Total cost: $${summary.totalCost.toFixed(4)}`);
console.log(`By model:`, summary.byModel);
```

### Budget Limits

```typescript
class BudgetLimitedClient {
  private spent = 0;

  constructor(
    private client: AIClient,
    private budget: number
  ) {}

  async chat(options: ChatOptions): Promise<AIResponse> {
    if (this.spent >= this.budget) {
      throw new Error(`Budget exceeded: $${this.budget}`);
    }

    const response = await this.client.chat(options);

    if (response.cost) {
      this.spent += response.cost.totalCost;
    }

    return response;
  }

  getRemaining(): number {
    return this.budget - this.spent;
  }
}

const limited = new BudgetLimitedClient(ai, 10.00);
```

## Caching

### Simple Cache

```typescript
const cache = new Map<string, AIResponse>();

async function cachedChat(prompt: string): Promise<AIResponse> {
  const cacheKey = prompt;

  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey)!;
    return { ...cached, cached: true };
  }

  const response = await ai.chat({
    model: 'gpt-5.1',
    messages: [{ role: 'user', content: prompt }]
  });

  cache.set(cacheKey, response);
  return response;
}
```

### TTL Cache

```typescript
interface CacheEntry {
  response: AIResponse;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const TTL = 3600000; // 1 hour

async function cachedChat(prompt: string): Promise<AIResponse> {
  const cacheKey = prompt;
  const entry = cache.get(cacheKey);

  if (entry && Date.now() - entry.timestamp < TTL) {
    return { ...entry.response, cached: true };
  }

  const response = await ai.chat({
    model: 'gpt-5.1',
    messages: [{ role: 'user', content: prompt }]
  });

  cache.set(cacheKey, { response, timestamp: Date.now() });
  return response;
}
```

## Parallel Requests

### Batch Processing

```typescript
async function processMany(prompts: string[]): Promise<AIResponse[]> {
  const results = await Promise.all(
    prompts.map(prompt =>
      ai.chat({
        model: 'gpt-5.1',
        messages: [{ role: 'user', content: prompt }]
      })
    )
  );

  return results;
}
```

### Rate-Limited Batch

```typescript
async function processWithLimit(
  prompts: string[],
  concurrency: number = 5
): Promise<AIResponse[]> {
  const results: AIResponse[] = [];
  const queue = [...prompts];

  const workers = Array(concurrency).fill(null).map(async () => {
    while (queue.length > 0) {
      const prompt = queue.shift()!;
      const response = await ai.chat({
        model: 'gpt-5.1',
        messages: [{ role: 'user', content: prompt }]
      });
      results.push(response);
    }
  });

  await Promise.all(workers);
  return results;
}
```

## Next Steps

- **[MCP](05-mcp.md)** - Model Context Protocol
- **[Overview](01-overview.md)** - Back to AI basics

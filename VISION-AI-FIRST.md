# Recker: Universal AI Communication Layer

## Visão

Ser o **undici para comunicação AI** - uma camada unificada que abstrai a complexidade de protocolos enquanto oferece controle fino para aplicações de IA.

## Por que AI-First?

### O Problema
```
Desenvolvedores AI em 2025:
├── OpenAI SDK para GPT
├── Anthropic SDK para Claude
├── Google SDK para Gemini
├── Replicate SDK para modelos open-source
├── HuggingFace SDK para inference
├── WebSocket client para real-time
├── gRPC client para inference servers
├── WebRTC para voice/video AI
└── MQTT para edge AI

= 9+ SDKs, 9+ patterns, 9+ sets of bugs
```

### A Solução Recker
```
Recker AI Layer:
├── Uma API unificada
├── Todos os protocolos
├── Observabilidade built-in
├── Streaming-first
└── Type-safe
```

---

## Core Features AI-First

### 1. **Unified Streaming Interface**

```typescript
import { ai } from 'recker';

// Stream de qualquer provider/protocolo
const stream = await ai.stream({
  provider: 'openai',  // ou 'anthropic', 'replicate', 'custom'
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: 'Hello' }],
});

// Interface unificada
for await (const event of stream) {
  switch (event.type) {
    case 'text':
      process.stdout.write(event.content);
      break;
    case 'tool_call':
      await handleToolCall(event.tool);
      break;
    case 'usage':
      console.log(`Tokens: ${event.inputTokens} in, ${event.outputTokens} out`);
      break;
    case 'done':
      console.log('Complete!');
      break;
  }
}
```

### 2. **Adaptive Timeouts**

AI requests são diferentes - primeiro token pode demorar, mas depois flui rápido.

```typescript
const response = await ai.chat({
  model: 'claude-opus-4-5',
  messages,
  timeout: {
    // Tempo para primeira resposta (cold start, queue, etc)
    firstToken: 30000,
    // Tempo máximo entre tokens (detect stalls)
    betweenTokens: 5000,
    // Tempo total máximo
    total: 300000,
    // Adaptive: aprende com requests anteriores
    adaptive: true,
  }
});
```

### 3. **Semantic Caching**

Cache baseado em similaridade semântica, não apenas URL.

```typescript
const client = ai.createClient({
  cache: {
    type: 'semantic',
    // Embedding model para similaridade
    embedder: 'text-embedding-3-small',
    // Threshold de similaridade (0-1)
    similarity: 0.95,
    // TTL
    ttl: '1h',
    // Storage
    storage: new RedisCache(),
  }
});

// Request 1
await client.chat({ messages: [{ content: "What is the capital of France?" }] });

// Request 2 - HIT! (semanticamente similar)
await client.chat({ messages: [{ content: "What's France's capital city?" }] });
```

### 4. **Token-Aware Rate Limiting**

Rate limit por tokens, não apenas por requests.

```typescript
const client = ai.createClient({
  rateLimit: {
    // Tokens por minuto (TPM)
    tokensPerMinute: 100000,
    // Requests por minuto (RPM)
    requestsPerMinute: 500,
    // Estratégia quando limite atingido
    strategy: 'queue',  // ou 'throw', 'retry-after'
    // Prioridade de requests
    priority: (req) => req.metadata?.priority ?? 'normal',
  }
});

// Request de alta prioridade passa na frente
await client.chat({ messages, metadata: { priority: 'high' } });
```

### 5. **Smart Retry with Backpressure**

```typescript
const client = ai.createClient({
  retry: {
    // Retry em erros específicos de AI
    on: ['rate_limit', 'overloaded', 'timeout', 'context_length_exceeded'],
    // Backoff exponencial com jitter
    backoff: 'exponential',
    // Máximo de tentativas
    maxAttempts: 5,
    // Fallback para outro modelo
    fallback: {
      'gpt-5.1': 'gpt-5.1-mini',
      'claude-opus-4-5': 'claude-sonnet-4-5',
    },
    // Reduzir context em retry
    reduceContext: true,
  }
});
```

### 6. **Multi-Modal Unified**

```typescript
// Texto
const text = await ai.generate({
  input: 'Describe this image',
  images: [imageBuffer],
});

// Audio (transcrição ou TTS)
const audio = await ai.audio({
  input: 'Hello, how are you?',
  voice: 'alloy',
  format: 'mp3',
});

// Embedding
const embedding = await ai.embed({
  input: 'The quick brown fox',
  dimensions: 1536,
});

// Todos retornam interface consistente
interface AIResponse {
  content: string | Buffer;
  usage: TokenUsage;
  latency: Latency;
  model: string;
  cached: boolean;
}
```

### 7. **Protocol-Agnostic Real-Time**

```typescript
// Conecta ao melhor protocolo disponível
const realtime = await ai.realtime({
  // Tenta WebRTC > WebSocket > HTTP SSE > HTTP Polling
  protocols: ['webrtc', 'websocket', 'sse', 'polling'],

  // Voice conversation
  mode: 'voice',

  // Callbacks unificados
  onTranscript: (text) => console.log('User:', text),
  onResponse: (text) => console.log('AI:', text),
  onAudio: (chunk) => speaker.play(chunk),
});

// Envia audio
realtime.sendAudio(microphoneChunk);

// Ou texto
realtime.sendText('Hello!');
```

### 8. **Observability Built-In**

```typescript
const client = ai.createClient({
  observability: {
    // Métricas automáticas
    metrics: {
      latency: true,        // TTFT, TPS, total
      tokens: true,         // input, output, cached
      costs: true,          // $ por request
      errors: true,         // taxa de erro por modelo
    },

    // Tracing
    tracing: {
      enabled: true,
      exporter: new OTLPExporter(),
    },

    // Hooks para logging customizado
    onRequest: (req) => logger.info('AI Request', req),
    onResponse: (res) => logger.info('AI Response', res),
    onError: (err) => logger.error('AI Error', err),
  }
});

// Acessar métricas
console.log(client.metrics.summary());
// {
//   totalRequests: 1523,
//   totalTokens: 2_500_000,
//   totalCost: 45.23,
//   avgLatency: { ttft: 234, total: 1523 },
//   errorRate: 0.02,
//   cacheHitRate: 0.34,
// }
```

### 9. **Edge AI / Low Latency**

```typescript
// Para inference local ou edge
const edge = ai.createClient({
  // UDP para mínima latência
  transport: 'udp',

  // Ou gRPC para inference servers
  transport: 'grpc',

  // Configurações de baixa latência
  lowLatency: {
    // Pré-aquecer conexão
    warmup: true,
    // Manter conexão ativa
    keepAlive: true,
    // Prioridade de rede
    priority: 'realtime',
    // Timeout agressivo
    timeout: 100,
  }
});

// Inference < 10ms
const result = await edge.infer({
  model: 'whisper-small',
  input: audioChunk,
});
```

### 10. **Agent/Tool Support**

```typescript
const agent = ai.createAgent({
  model: 'claude-opus-4-5',
  tools: [
    {
      name: 'search',
      description: 'Search the web',
      handler: async (query) => {
        return await searchAPI.search(query);
      },
    },
    {
      name: 'calculate',
      description: 'Perform calculations',
      handler: (expression) => eval(expression),
    },
  ],
  // Max iterations
  maxIterations: 10,
  // Timeout por iteração
  iterationTimeout: 30000,
});

// Run agent
const result = await agent.run('What is 2+2 and what is the weather in Paris?');

// Streaming com tool calls
for await (const event of agent.stream('...')) {
  if (event.type === 'tool_call') {
    console.log(`Calling ${event.tool}...`);
  } else if (event.type === 'tool_result') {
    console.log(`Result: ${event.result}`);
  } else if (event.type === 'text') {
    process.stdout.write(event.content);
  }
}
```

---

## Protocol Mapping

| Feature | HTTP | WebSocket | gRPC | UDP | WebRTC |
|---------|------|-----------|------|-----|--------|
| Chat Completion | ✅ SSE | ✅ Native | ✅ Stream | ⚡ Low-lat | ❌ |
| Real-time Voice | ❌ | ✅ | ✅ | ⚡ | ✅ Best |
| Real-time Video | ❌ | ❌ | ❌ | ❌ | ✅ Best |
| Embeddings | ✅ | ❌ | ✅ | ⚡ Batch | ❌ |
| Image Gen | ✅ | ❌ | ✅ | ❌ | ❌ |
| Edge Inference | ⚡ | ⚡ | ✅ Best | ✅ Best | ❌ |
| IoT/Sensors | ❌ | ✅ | ❌ | ✅ Best | ❌ |

---

## API Design Principles

### 1. **Progressive Disclosure**

```typescript
// Simple (90% dos casos)
const response = await ai.chat('Hello!');

// Intermediate
const response = await ai.chat({
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: 'Hello!' }],
  temperature: 0.7,
});

// Advanced
const response = await ai.chat({
  provider: 'openai',
  model: 'gpt-5.1',
  messages,
  tools,
  toolChoice: 'auto',
  responseFormat: { type: 'json_schema', schema },
  timeout: { firstToken: 5000, total: 60000 },
  retry: { maxAttempts: 3, fallback: 'gpt-5.1-mini' },
  cache: { enabled: true, ttl: '1h' },
  metadata: { userId: '123', traceId: 'abc' },
});
```

### 2. **Type Safety**

```typescript
// Typed responses com Zod
const response = await ai.chat({
  messages,
  responseFormat: z.object({
    sentiment: z.enum(['positive', 'negative', 'neutral']),
    confidence: z.number().min(0).max(1),
    keywords: z.array(z.string()),
  }),
});

// response.content é tipado automaticamente
console.log(response.content.sentiment); // TypeScript sabe que é string
```

### 3. **Composition over Configuration**

```typescript
// Criar clients especializados
const chatClient = ai.chat.extend({
  model: 'gpt-5.1',
  temperature: 0.7,
});

const codeClient = ai.chat.extend({
  model: 'claude-opus-4-5',
  systemPrompt: 'You are a coding assistant...',
  temperature: 0,
});

const voiceClient = ai.voice.extend({
  model: 'whisper-1',
  language: 'en',
});

// Usar
await chatClient.send('Hello');
await codeClient.send('Write a function...');
await voiceClient.transcribe(audioBuffer);
```

---

## Implementation Roadmap

### Phase 1: Core AI Layer (Q1 2025)
- [ ] Unified AI interface (`ai.chat`, `ai.stream`, `ai.embed`)
- [ ] OpenAI, Anthropic, Google providers
- [ ] Adaptive timeouts
- [ ] Token-aware rate limiting
- [ ] Basic observability

### Phase 2: Real-Time (Q2 2025)
- [ ] WebSocket transport for AI
- [ ] Voice AI support (STT, TTS)
- [ ] Real-time streaming improvements
- [ ] Agent/Tool framework

### Phase 3: Low Latency (Q3 2025)
- [ ] gRPC transport for AI
- [ ] UDP transport for edge inference
- [ ] Connection pooling optimizations
- [ ] Semantic caching

### Phase 4: Multi-Modal (Q4 2025)
- [ ] WebRTC for voice/video AI
- [ ] Image/Video generation
- [ ] Multi-modal embeddings
- [ ] Edge deployment support

---

## Competitive Advantage

| Feature | OpenAI SDK | LangChain | Vercel AI | **Recker AI** |
|---------|------------|-----------|-----------|---------------|
| Multi-provider | ❌ | ✅ | ✅ | ✅ |
| Multi-protocol | ❌ | ❌ | ❌ | ✅ |
| Streaming-first | ⚡ | ⚡ | ✅ | ✅ |
| Type-safe | ✅ | ❌ | ✅ | ✅ |
| Observability | ❌ | ⚡ | ⚡ | ✅ Built-in |
| Low-latency | ❌ | ❌ | ❌ | ✅ UDP/gRPC |
| Voice AI | ❌ | ⚡ | ❌ | ✅ WebRTC |
| Edge AI | ❌ | ❌ | ⚡ | ✅ |
| Caching | ❌ | ⚡ | ❌ | ✅ Semantic |
| Cost tracking | ❌ | ⚡ | ❌ | ✅ Built-in |

---

## The Pitch

> **Recker AI: One SDK for all AI communication.**
>
> Stop juggling multiple SDKs. Stop writing boilerplate for streaming, retries, and rate limits.
>
> Recker AI gives you a unified, type-safe, observable interface to every AI provider and protocol.
>
> From HTTP to WebRTC. From OpenAI to edge inference. One API. Zero friction.

---

## Technical Decisions

### Why Not Just Wrap Existing SDKs?

1. **Performance**: Wrapping adds overhead. We implement protocols directly.
2. **Consistency**: Each SDK has different patterns. We unify.
3. **Control**: Can't optimize what you don't control.
4. **Features**: Cross-cutting concerns (caching, observability) need deep integration.

### Why TypeScript?

1. **Type Safety**: AI responses are structured. Types catch errors early.
2. **DX**: Autocomplete, documentation inline.
3. **Ecosystem**: Node.js is where AI backends live.
4. **Performance**: V8 is fast. undici proved it.

### Why Protocol Diversity?

1. **HTTP**: Universal, well-understood, good for most cases.
2. **WebSocket**: Real-time streaming, bidirectional.
3. **gRPC**: High-performance inference servers.
4. **UDP**: Ultra-low latency edge inference.
5. **WebRTC**: Voice/video AI applications.

Each protocol excels in different scenarios. AI applications need all of them.

---

## Summary

Recker AI será para comunicação AI o que o undici é para HTTP:
- **Performance**: Implementação direta dos protocolos
- **DX**: API unificada, type-safe, observable
- **Flexibility**: Do simple ao advanced
- **Future-proof**: Pronto para novos protocolos e providers

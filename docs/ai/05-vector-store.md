# Vector Store

Recker includes a lightweight, in-memory Vector Store for building simple RAG (Retrieval-Augmented Generation) applications without external databases.

## Overview

The `MemoryVectorStore` allows you to:
1.  **Store documents** with metadata
2.  **Generate embeddings** automatically using your AI client
3.  **Search** using cosine similarity
4.  **Manage context** for your AI agents

## Quick Start

```typescript
import { createAIClient } from 'recker/ai';
import { MemoryVectorStore } from 'recker/ai/vector';

// 1. Setup Client
const client = createAIClient({
  providers: {
    openai: { apiKey: process.env.OPENAI_API_KEY }
  }
});

// 2. Create Store
const store = new MemoryVectorStore({
  client,
  model: 'text-embedding-3-small'
});

// 3. Add Documents (Embeddings generated automatically)
await store.add([
  {
    content: 'Recker is a TypeScript network SDK.',
    metadata: { type: 'tech', version: '1.0' }
  },
  {
    content: 'The sky is blue because of Rayleigh scattering.',
    metadata: { type: 'science' }
  }
]);

// 4. Search
const results = await store.search('What is Recker?');

console.log(results[0].content);
// "Recker is a TypeScript network SDK."
console.log(results[0].score);
// 0.89...
```

## CLI Usage

You can manage a local vector store directly from the terminal. This is great for managing local knowledge bases for your agents.

### Add Documents

```bash
# Add a simple text (uses default vectors.json)
rek vector add content="The production database IP is 10.0.0.5"

# Add with metadata to specific file
rek vector add content="Deploy instructions" metadata:='{"env":"prod"}' file=docs.json
```

### Search

```bash
# Search for related content
rek vector search query="database ip" file=docs.json

# Limit results
rek vector search query="deploy" limit=1
```

### Manage

```bash
# Show store stats
rek vector info file=docs.json

# Clear store
rek vector clear file=docs.json
```

## Features

### Automatic Embeddings

If you provide an `AIClient` to the constructor, `add()` will automatically generate embeddings for any document missing them.

```typescript
// Automatic
await store.add([{ content: 'Hello' }]);

// Manual (if you have pre-computed embeddings)
await store.add([
  {
    content: 'Hello',
    embedding: [0.1, 0.2, 0.3, ...]
  }
]);
```

### Metadata Filtering

Currently, filtering is done manually on search results, but you can store any JSON-serializable data in `metadata`.

```typescript
const results = await store.search('technology');
const techDocs = results.filter(doc => doc.metadata.type === 'tech');
```

### Document Management

```typescript
// Check size
console.log(store.count);

// Delete specific document
store.delete('doc-123');

// Clear all
store.clear();
```

## RAG Example

Here is a complete example of a Retrieval-Augmented Generation pipeline:

```typescript
import { createAIClient } from 'recker/ai';
import { MemoryVectorStore } from 'recker/ai/vector';

const ai = createAIClient({ ... });
const store = new MemoryVectorStore({ client: ai });

// 1. Ingest Knowledge
const knowledge = [
  "Recker's retry default is 3 attempts.",
  "Recker supports HTTP, DNS, and WebSocket.",
  "Use 'mini' client for zero-overhead requests."
];

await store.add(knowledge.map(text => ({ content: text })))

// 2. Chat Function with Retrieval
async function ask(question: string) {
  // Retrieve relevant context
  const similar = await store.search(question, 2);
  const context = similar.map(d => d.content).join('\n');

  // Augment Prompt
  const response = await ai.chat({
    model: 'gpt-5.1',
    messages: [
      {
        role: 'system',
        content: `Answer based on this context:\n${context}`
      },
      { role: 'user', content: question }
    ]
  });

  return response.content;
}

// 3. Ask
console.log(await ask("How many retries does Recker do?"));
// "Recker defaults to 3 retry attempts."
```

## API Reference

### `MemoryVectorStore`

#### Constructor

```typescript
constructor(options: {
  client?: AIClient;  // For auto-embedding
  model?: string;     // Embedding model to use
})
```

#### Methods

| Method | Description |
|--------|-------------|
| `add(docs)` | Add documents. Generates embeddings if missing. |
| `search(query, limit?, threshold?)` | Search by text query. |
| `delete(id)` | Remove a document by ID. |
| `clear()` | Remove all documents. |
| `count` | Get number of documents. |

### `cosineSimilarity(a, b)`

Low-level utility to calculate similarity between two vectors.

```typescript
import { cosineSimilarity } from 'recker/ai/vector';

const score = cosineSimilarity(vecA, vecB);
```

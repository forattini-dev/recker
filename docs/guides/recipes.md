# Recker Recipes

Practical "How-To" guides for solving common problems with Recker.

## Table of Contents

*   [Advanced Retries](#advanced-retries)
*   [Progressive Downloads](#progressive-downloads)
*   [AI Agent with Context](#ai-agent-with-context)
*   [Scraping with Rotation](#scraping-with-rotation)
*   [Handling File Uploads](#handling-file-uploads)

---

## Advanced Retries

Handling flaky APIs or unstable networks requires more than just a simple retry count.

**Scenario:** You want to retry on specific error codes (like 503 or 429) but fail fast on 404. You also want exponential backoff with jitter to avoid thundering herds.

```typescript
import { createClient, retry } from 'recker';

const client = createClient({
  baseUrl: 'https://unstable-api.com',
  plugins: [
    retry({
      maxAttempts: 5,
      // Only retry these status codes
      statusCodes: [408, 429, 500, 502, 503, 504],
      // Don't retry specific error methods (like POSTs that aren't idempotent)
      methods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'],
      // Exponential backoff: 1s, 2s, 4s, 8s...
      backoff: 'exponential',
      // Add random jitter to prevent synchronized retries
      jitter: true,
      // Max delay cap (don't wait more than 10s)
      maxDelay: 10000
    })
  ]
});

await client.get('/data');
```

---

## Progressive Downloads

Downloading large files efficiently without consuming all memory.

**Scenario:** Download a 1GB video file, show a progress bar, and save it to disk efficiently.

```typescript
import { createClient } from 'recker';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const client = createClient();

const response = await client.get('https://example.com/big-video.mp4', {
  // Stream response instead of buffering
  stream: true
});

const total = Number(response.headers.get('content-length'));
let loaded = 0;

console.log(`Downloading ${total} bytes...`);

// Use the download() async iterator for easy progress tracking
for await (const progress of response.download()) {
  // Update UI
  process.stdout.write(`\rProgress: ${progress.percent.toFixed(1)}%`);
}

// Or save to file using Node streams
const fileStream = createWriteStream('video.mp4');
// Undici/Recker response body is web-standard ReadableStream
await pipeline(response.body, fileStream);

console.log('\nDownload complete!');
```

---

## AI Agent with Context

Building a stateful AI interaction using the MCP (Model Context Protocol) helper.

**Scenario:** Chat with an LLM (OpenAI/Anthropic) while maintaining a simple conversation history.

```typescript
import { createClient, createMCPSSEStream, openAIExtractor } from 'recker';

// Recker client acts as the transport layer
const client = createClient({
  baseUrl: 'https://api.openai.com/v1',
  headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
});

// Create a specialized stream for OpenAI
const chatStream = createMCPSSEStream(client, '/chat/completions', {
  extractData: openAIExtractor,
  extraParams: { 
    model: 'gpt-5.1',
    stream: true
  }
});

// Chat function wrapper
async function ask(prompt: string) {
  process.stdout.write('AI: ');
  
  // Consumes the SSE stream in real-time
  const fullResponse = await chatStream.text(prompt);
  
  process.stdout.write('\n');
  return fullResponse;
}

await ask('Explain quantum computing in one sentence.');
```

---

## Scraping with Rotation

Scraping data while avoiding blocks by rotating User-Agents.

**Scenario:** Extract product prices from an e-commerce site.

```typescript
import { createClient } from 'recker';
import { userAgentRotator } from 'recker/plugins/user-agent';

const client = createClient({
  baseUrl: 'https://shop.example.com',
  plugins: [
    // Rotate user agent on every request
    userAgentRotator({ strategy: 'random' })
  ]
});

// Scrape and extract using the jQuery-like API
const doc = await client.scrape('/products/laptops').scrape();

const products = doc.selectAll('.product-card').map(el => ({
  title: el.find('h2').text().trim(),
  price: parseFloat(el.find('.price').text().replace('$', '')),
  available: !el.hasClass('out-of-stock')
}));

console.table(products);
```

---

## Handling File Uploads

Uploading files using Multipart forms (the modern way).

**Scenario:** Upload a user avatar image along with some profile data.

```typescript
import { createClient } from 'recker';
import { openAsBlob } from 'node:fs'; // Node 18+

const client = createClient({ baseUrl: 'https://api.social.com' });

// Recker automatically handles Multipart boundaries if 'form' is used
await client.post('/profile/upload', {
  form: {
    username: 'cyber_dev',
    role: 'admin',
    // You can pass a Blob, File, or Buffer
    avatar: await openAsBlob('./avatar.png')
  }
});
```

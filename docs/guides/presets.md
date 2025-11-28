# Presets

Presets provide pre-configured client options for popular APIs. They include:
- Correct base URLs
- Required headers
- Appropriate timeouts
- Retry configurations

## AI Platforms

### OpenAI

```typescript
import { createClient, openai } from 'recker';

const client = createClient(openai({
  apiKey: process.env.OPENAI_API_KEY!,
  organization: 'org-xxx', // Optional
  project: 'proj-xxx'      // Optional
}));

// Chat completion
const response = await client.post('/chat/completions', {
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});

// Streaming
for await (const chunk of client.post('/chat/completions', {
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }],
  stream: true
}).sse()) {
  console.log(chunk.data);
}
```

### Anthropic (Claude)

```typescript
import { anthropic } from 'recker';

const client = createClient(anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
}));

const response = await client.post('/messages', {
  model: 'claude-3-opus-20240229',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

### Google Gemini

```typescript
import { gemini } from 'recker';

const client = createClient(gemini({
  apiKey: process.env.GEMINI_API_KEY!
}));

const response = await client.post('/models/gemini-pro:generateContent', {
  contents: [{ parts: [{ text: 'Hello!' }] }]
});
```

### Azure OpenAI

```typescript
import { azureOpenai } from 'recker';

const client = createClient(azureOpenai({
  apiKey: process.env.AZURE_OPENAI_KEY!,
  resourceName: 'my-resource',
  deploymentId: 'gpt-4',
  apiVersion: '2024-02-15-preview'
}));
```

### Other AI Providers

```typescript
import {
  cohere, mistral, groq, together,
  replicate, huggingface, perplexity,
  deepseek, fireworks, xai
} from 'recker';

// Cohere
const cohereClient = createClient(cohere({ apiKey: '...' }));

// Mistral
const mistralClient = createClient(mistral({ apiKey: '...' }));

// Groq (fast inference)
const groqClient = createClient(groq({ apiKey: '...' }));

// Together AI
const togetherClient = createClient(together({ apiKey: '...' }));

// Replicate
const replicateClient = createClient(replicate({ apiKey: '...' }));

// Hugging Face
const hfClient = createClient(huggingface({ apiKey: '...' }));

// Perplexity
const pplxClient = createClient(perplexity({ apiKey: '...' }));

// DeepSeek
const deepseekClient = createClient(deepseek({ apiKey: '...' }));

// Fireworks AI
const fireworksClient = createClient(fireworks({ apiKey: '...' }));

// xAI (Grok)
const xaiClient = createClient(xai({ apiKey: '...' }));
```

---

## Cloud Providers

### GitHub

```typescript
import { github } from 'recker';

const client = createClient(github({
  token: process.env.GITHUB_TOKEN!
}));

const repos = await client.get('/user/repos').json();
const issues = await client.get('/repos/owner/repo/issues').json();
```

### GitLab

```typescript
import { gitlab } from 'recker';

const client = createClient(gitlab({
  token: process.env.GITLAB_TOKEN!,
  baseUrl: 'https://gitlab.example.com' // Self-hosted (optional)
}));
```

### Cloudflare

```typescript
import { cloudflare } from 'recker';

const client = createClient(cloudflare({
  apiToken: process.env.CF_API_TOKEN!
  // or apiKey + email
}));
```

### Vercel

```typescript
import { vercel } from 'recker';

const client = createClient(vercel({
  token: process.env.VERCEL_TOKEN!
}));
```

### DigitalOcean

```typescript
import { digitalocean } from 'recker';

const client = createClient(digitalocean({
  token: process.env.DO_TOKEN!
}));
```

### Supabase

```typescript
import { supabase } from 'recker';

const client = createClient(supabase({
  url: process.env.SUPABASE_URL!,
  key: process.env.SUPABASE_KEY!
}));
```

---

## SaaS APIs

### Stripe

```typescript
import { stripe } from 'recker';

const client = createClient(stripe({
  apiKey: process.env.STRIPE_SECRET_KEY!
}));

// Create customer
const customer = await client.post('/customers', {
  email: 'customer@example.com'
}).json();
```

### Twilio

```typescript
import { twilio } from 'recker';

const client = createClient(twilio({
  accountSid: process.env.TWILIO_ACCOUNT_SID!,
  authToken: process.env.TWILIO_AUTH_TOKEN!
}));
```

### Slack

```typescript
import { slack } from 'recker';

const client = createClient(slack({
  token: process.env.SLACK_BOT_TOKEN!
}));

await client.post('/chat.postMessage', {
  channel: '#general',
  text: 'Hello from Recker!'
});
```

### Discord

```typescript
import { discord } from 'recker';

const client = createClient(discord({
  token: process.env.DISCORD_BOT_TOKEN!
}));
```

### Notion

```typescript
import { notion } from 'recker';

const client = createClient(notion({
  token: process.env.NOTION_TOKEN!
}));
```

### Linear

```typescript
import { linear } from 'recker';

const client = createClient(linear({
  apiKey: process.env.LINEAR_API_KEY!
}));
```

---

## Auto-detection (Registry)

Automatically detect and configure presets from URLs:

```typescript
import { createClient, detectPreset } from 'recker';

const preset = detectPreset('https://api.openai.com/v1/chat/completions');
// Returns 'openai'

// Auto-configure from URL
const client = createClient({
  ...getPresetConfig(preset, { apiKey: '...' }),
  baseUrl: 'https://api.openai.com/v1'
});
```

---

## Custom Presets

Create your own presets:

```typescript
import { ClientOptions } from 'recker';

export interface MyApiPresetOptions {
  apiKey: string;
  environment?: 'production' | 'sandbox';
}

export function myApi(options: MyApiPresetOptions): ClientOptions {
  const baseUrl = options.environment === 'sandbox'
    ? 'https://sandbox.myapi.com/v1'
    : 'https://api.myapi.com/v1';

  return {
    baseUrl,
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      statusCodes: [429, 500, 502, 503, 504]
    }
  };
}

// Usage
const client = createClient(myApi({
  apiKey: process.env.MY_API_KEY!,
  environment: 'sandbox'
}));
```

---

## Preset Configuration

All presets return `ClientOptions` which can be extended:

```typescript
const client = createClient({
  ...openai({ apiKey: '...' }),
  // Override or extend
  timeout: 120000,
  retry: {
    maxAttempts: 10
  },
  hooks: {
    beforeRequest: [(req) => {
      console.log('Request:', req.url);
      return req;
    }]
  }
});
```

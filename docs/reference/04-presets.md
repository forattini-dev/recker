# Presets

Pre-configured clients for popular APIs.

## Overview

Presets provide optimized client configurations for specific services, including correct base URLs, authentication headers, timeouts, and retry policies.

```typescript
import { createClient } from 'recker';
import { github } from 'recker/presets';

// Create GitHub-optimized client
const client = createClient(github({
  token: process.env.GITHUB_TOKEN
}));

// Ready to use
const repos = await client.get('/user/repos').json();
```

## AI Platforms

### OpenAI

```typescript
import { openai } from 'recker/presets';

const client = createClient(openai({
  apiKey: process.env.OPENAI_API_KEY,
  organization: 'org-xxx',  // Optional
  project: 'proj-xxx'       // Optional
}));

// Chat completion
const response = await client.post('/chat/completions', {
  json: {
    model: 'gpt-5.1',
    messages: [{ role: 'user', content: 'Hello!' }]
  }
}).json();
```

### Anthropic

```typescript
import { anthropic } from 'recker/presets';

const client = createClient(anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  version: '2024-01-01'  // Optional API version
}));

const response = await client.post('/messages', {
  json: {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Hello!' }]
  }
}).json();
```

### Google Gemini

```typescript
import { gemini } from 'recker/presets';

const client = createClient(gemini({
  apiKey: process.env.GEMINI_API_KEY
}));
```

### Cohere

```typescript
import { cohere } from 'recker/presets';

const client = createClient(cohere({
  apiKey: process.env.COHERE_API_KEY
}));
```

### Mistral

```typescript
import { mistral } from 'recker/presets';

const client = createClient(mistral({
  apiKey: process.env.MISTRAL_API_KEY
}));
```

### Groq

```typescript
import { groq } from 'recker/presets';

const client = createClient(groq({
  apiKey: process.env.GROQ_API_KEY
}));
```

### Together AI

```typescript
import { together } from 'recker/presets';

const client = createClient(together({
  apiKey: process.env.TOGETHER_API_KEY
}));
```

### Replicate

```typescript
import { replicate } from 'recker/presets';

const client = createClient(replicate({
  apiKey: process.env.REPLICATE_API_TOKEN
}));
```

### Hugging Face

```typescript
import { huggingface } from 'recker/presets';

const client = createClient(huggingface({
  apiKey: process.env.HF_TOKEN
}));
```

### Perplexity

```typescript
import { perplexity } from 'recker/presets';

const client = createClient(perplexity({
  apiKey: process.env.PERPLEXITY_API_KEY
}));
```

### DeepSeek

```typescript
import { deepseek } from 'recker/presets';

const client = createClient(deepseek({
  apiKey: process.env.DEEPSEEK_API_KEY
}));
```

### Fireworks AI

```typescript
import { fireworks } from 'recker/presets';

const client = createClient(fireworks({
  apiKey: process.env.FIREWORKS_API_KEY
}));
```

### xAI (Grok)

```typescript
import { xai } from 'recker/presets';

const client = createClient(xai({
  apiKey: process.env.XAI_API_KEY
}));
```

### Azure OpenAI

```typescript
import { azureOpenai } from 'recker/presets';

const client = createClient(azureOpenai({
  apiKey: process.env.AZURE_OPENAI_KEY,
  resourceName: 'my-resource',
  deploymentName: 'gpt-5-1',
  apiVersion: '2024-02-01'
}));
```

## Cloud Providers

### GitHub

```typescript
import { github } from 'recker/presets';

const client = createClient(github({
  token: process.env.GITHUB_TOKEN,
  apiVersion: '2022-11-28'  // Optional
}));

// List repos
const repos = await client.get('/user/repos').json();

// Create issue
await client.post('/repos/owner/repo/issues', {
  json: { title: 'Bug report', body: 'Description...' }
});
```

### GitLab

```typescript
import { gitlab } from 'recker/presets';

const client = createClient(gitlab({
  token: process.env.GITLAB_TOKEN,
  baseUrl: 'https://gitlab.example.com'  // Self-hosted
}));

const projects = await client.get('/projects').json();
```

### Cloudflare

```typescript
import { cloudflare } from 'recker/presets';

const client = createClient(cloudflare({
  apiToken: process.env.CF_API_TOKEN,
  // OR
  apiKey: process.env.CF_API_KEY,
  email: 'user@example.com'
}));

const zones = await client.get('/zones').json();
```

### Vercel

```typescript
import { vercel } from 'recker/presets';

const client = createClient(vercel({
  token: process.env.VERCEL_TOKEN,
  teamId: 'team_xxx'  // Optional
}));

const deployments = await client.get('/deployments').json();
```

### DigitalOcean

```typescript
import { digitalocean } from 'recker/presets';

const client = createClient(digitalocean({
  token: process.env.DO_TOKEN
}));

const droplets = await client.get('/droplets').json();
```

### Supabase

```typescript
import { supabase } from 'recker/presets';

const client = createClient(supabase({
  url: process.env.SUPABASE_URL,
  apiKey: process.env.SUPABASE_ANON_KEY
}));

const { data } = await client.get('/rest/v1/users').json();
```

## SaaS APIs

### Stripe

```typescript
import { stripe } from 'recker/presets';

const client = createClient(stripe({
  apiKey: process.env.STRIPE_SECRET_KEY,
  apiVersion: '2024-04-10'  // Optional
}));

const customers = await client.get('/v1/customers').json();

// Create charge
await client.post('/v1/charges', {
  form: {
    amount: '2000',
    currency: 'usd',
    source: 'tok_visa'
  }
});
```

### Twilio

```typescript
import { twilio } from 'recker/presets';

const client = createClient(twilio({
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN
}));

// Send SMS
await client.post('/2010-04-01/Accounts/{AccountSid}/Messages.json', {
  form: {
    To: '+1234567890',
    From: '+0987654321',
    Body: 'Hello from Recker!'
  }
});
```

### Mailgun

```typescript
import { mailgun } from 'recker/presets';

const client = createClient(mailgun({
  apiKey: process.env.MAILGUN_API_KEY,
  domain: 'mg.example.com',  // Your Mailgun domain
  region: 'us'               // 'us' (default) or 'eu'
}));

// Send email
await client.post('/messages', {
  form: {
    from: 'sender@example.com',
    to: 'recipient@example.com',
    subject: 'Hello from Recker!',
    text: 'This is the email body.'
  }
});

// List events
const events = await client.get('/events').json();
```

### Sinch

```typescript
import { sinch } from 'recker/presets';

const client = createClient(sinch({
  projectId: process.env.SINCH_PROJECT_ID,
  keyId: process.env.SINCH_KEY_ID,
  keySecret: process.env.SINCH_KEY_SECRET,
  product: 'sms',   // 'sms', 'voice', 'conversation', 'numbers', 'verification'
  region: 'us'      // 'us', 'eu', 'au', 'br', 'ca' (SMS only)
}));

// Send SMS
await client.post('/batches', {
  json: {
    from: '+1234567890',
    to: ['+0987654321'],
    body: 'Hello from Recker!'
  }
});

// Get delivery report
const report = await client.get('/batches/:batchId/delivery_report', {
  params: { batchId: 'batch-123' }
}).json();
```

### Linear

```typescript
import { linear } from 'recker/presets';

const client = createClient(linear({
  apiKey: process.env.LINEAR_API_KEY
}));

// GraphQL query
const response = await client.post('/', {
  json: {
    query: `{ issues { nodes { id title } } }`
  }
}).json();
```

### Notion

```typescript
import { notion } from 'recker/presets';

const client = createClient(notion({
  apiKey: process.env.NOTION_API_KEY,
  version: '2022-06-28'  // Optional
}));

const databases = await client.get('/databases').json();
```

### Slack

```typescript
import { slack } from 'recker/presets';

const client = createClient(slack({
  token: process.env.SLACK_BOT_TOKEN
}));

// Post message
await client.post('/chat.postMessage', {
  json: {
    channel: '#general',
    text: 'Hello from Recker!'
  }
});
```

### Discord

```typescript
import { discord } from 'recker/presets';

const client = createClient(discord({
  token: process.env.DISCORD_BOT_TOKEN
}));

// Send message
await client.post('/channels/{channel_id}/messages', {
  params: { channel_id: '123456789' },
  json: { content: 'Hello!' }
});
```

## Auto-Detection (Registry)

Automatically detect and configure presets from URLs:

```typescript
import { createClient, detectPreset, getPresetConfig } from 'recker';

// Detect preset from URL
const preset = detectPreset('https://api.openai.com/v1/chat/completions');
// Returns 'openai'

const preset2 = detectPreset('https://api.github.com/repos/owner/repo');
// Returns 'github'

// Auto-configure from URL
if (preset) {
  const client = createClient({
    ...getPresetConfig(preset, { apiKey: process.env.API_KEY }),
  });
}
```

### Supported Auto-Detection

| Domain Pattern | Preset |
|---------------|--------|
| `api.openai.com` | `openai` |
| `api.anthropic.com` | `anthropic` |
| `api.github.com` | `github` |
| `api.stripe.com` | `stripe` |
| `slack.com/api` | `slack` |
| `discord.com/api` | `discord` |
| `*.supabase.co` | `supabase` |
| `api.cloudflare.com` | `cloudflare` |
| `api.mailgun.net` | `mailgun` |
| `*.sms.api.sinch.com` | `sinch` |

## Combining Presets

### Add Custom Options

```typescript
const client = createClient({
  ...github({ token: process.env.GITHUB_TOKEN }),
  timeout: 60000,  // Override timeout
  debug: true      // Add debug
});
```

### Multiple Clients

```typescript
const githubClient = createClient(github({
  token: process.env.GITHUB_TOKEN
}));

const stripeClient = createClient(stripe({
  apiKey: process.env.STRIPE_SECRET_KEY
}));

// Use appropriate client for each service
const repos = await githubClient.get('/user/repos').json();
const customers = await stripeClient.get('/v1/customers').json();
```

## Preset Configuration

All presets include:

| Feature | Configuration |
|---------|---------------|
| Base URL | Service-specific API endpoint |
| Auth Headers | Token/API key authentication |
| Timeout | Appropriate for service |
| Retry | Exponential backoff with jitter |
| Error Codes | Service-specific retry codes |

### Common Retry Codes

```typescript
// Most presets retry on:
statusCodes: [408, 429, 500, 502, 503, 504]

// 408: Request Timeout
// 429: Rate Limited
// 500: Server Error
// 502: Bad Gateway
// 503: Service Unavailable
// 504: Gateway Timeout
```

## Creating Custom Presets

```typescript
import { ClientOptions } from 'recker';

interface MyApiOptions {
  apiKey: string;
  region?: string;
}

export function myApi(options: MyApiOptions): ClientOptions {
  const baseUrl = options.region
    ? `https://${options.region}.api.myservice.com`
    : 'https://api.myservice.com';

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
      delay: 1000,
      statusCodes: [429, 500, 502, 503, 504]
    }
  };
}

// Usage
const client = createClient(myApi({
  apiKey: 'xxx',
  region: 'eu'
}));
```

## Next Steps

- **[Troubleshooting](05-troubleshooting.md)** - Common issues
- **[API Reference](01-api.md)** - Full API docs

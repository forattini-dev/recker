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

### AWS (Amazon Web Services)

```typescript
import { aws, awsS3, awsDynamoDB, awsLambda, awsBedrock } from 'recker/presets';

// Generic AWS client (specify service)
const ec2 = createClient(aws({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: 'us-east-1',
  service: 'ec2',
  sessionToken: process.env.AWS_SESSION_TOKEN  // Optional (for temp credentials)
}));

// Convenience aliases for popular services
const s3 = createClient(awsS3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: 'us-east-1'
}));

const dynamodb = createClient(awsDynamoDB({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: 'us-east-1'
}));

const lambda = createClient(awsLambda({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: 'us-east-1'
}));

// AWS Bedrock (AI/ML)
const bedrock = createClient(awsBedrock({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: 'us-east-1'
}));

// Custom endpoint (LocalStack, MinIO, etc.)
const localS3 = createClient(aws({
  accessKeyId: 'test',
  secretAccessKey: 'test',
  region: 'us-east-1',
  service: 's3',
  endpoint: 'http://localhost:4566'
}));
```

**Supported Services:**
- `s3`, `dynamodb`, `lambda`, `sqs`, `sns`, `ses`
- `secretsmanager`, `ssm`, `sts`, `iam`, `kms`
- `ec2`, `ecs`, `eks`
- `cloudwatch`, `logs`, `events`
- `kinesis`, `firehose`
- `apigateway`, `execute-api`
- `cognito-idp`, `cognito-identity`
- `athena`, `glue`
- `stepfunctions`, `states`
- `bedrock`, `bedrock-runtime`

### Google Cloud Platform (GCP)

```typescript
import { gcp, gcpStorage, gcpBigQuery, gcpVertexAI } from 'recker/presets';

// With API Key (for public APIs like Translate, Vision)
const translate = createClient(gcp({
  projectId: 'my-project',
  auth: { type: 'api-key', apiKey: process.env.GCP_API_KEY },
  service: 'translate'
}));

// With OAuth access token
const compute = createClient(gcp({
  projectId: 'my-project',
  auth: { type: 'oauth', accessToken: process.env.GCP_ACCESS_TOKEN },
  service: 'compute'
}));

// Convenience aliases
const storage = createClient(gcpStorage({
  projectId: 'my-project',
  auth: { type: 'oauth', accessToken: process.env.GCP_ACCESS_TOKEN }
}));

const bigquery = createClient(gcpBigQuery({
  projectId: 'my-project',
  auth: { type: 'oauth', accessToken: process.env.GCP_ACCESS_TOKEN }
}));

// Vertex AI (regional)
const vertexai = createClient(gcpVertexAI({
  projectId: 'my-project',
  auth: { type: 'oauth', accessToken: process.env.GCP_ACCESS_TOKEN },
  region: 'us-central1'
}));
```

**Supported Services:**
- `compute`, `storage`, `bigquery`, `pubsub`, `firestore`
- `functions`, `run`, `cloudsql`, `kubernetes`
- `aiplatform`, `translate`, `vision`, `speech`, `language`
- `secretmanager`, `iam`, `logging`, `monitoring`

### Microsoft Azure

```typescript
import { azure, azureResourceManager, azureBlobStorage, microsoftGraph } from 'recker/presets';

// Azure Resource Manager
const arm = createClient(azureResourceManager({
  subscriptionId: process.env.AZURE_SUBSCRIPTION_ID,
  auth: { type: 'bearer', token: process.env.AZURE_TOKEN }
}));

// List resource groups
const groups = await arm.get('/subscriptions/:subscriptionId/resourcegroups', {
  params: {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID,
    'api-version': '2021-04-01'
  }
}).json();

// Azure Blob Storage with SAS token
const blob = createClient(azureBlobStorage({
  accountName: 'mystorageaccount',
  auth: { type: 'sas', sasToken: process.env.AZURE_SAS_TOKEN }
}));

// Microsoft Graph API
const graph = createClient(microsoftGraph({
  auth: { type: 'bearer', token: process.env.AZURE_TOKEN }
}));

// Get user profile
const me = await graph.get('/me').json();
```

**Supported Services:**
- `management` (Resource Manager), `storage-blob`, `storage-queue`, `storage-table`, `storage-file`
- `cosmos-db`, `keyvault`, `servicebus`, `eventhubs`
- `functions`, `cognitive`, `devops`, `graph`, `monitor`, `containerregistry`

### Oracle Cloud Infrastructure (OCI)

```typescript
import { oracle, ociCompute, ociObjectStorage, ociGenerativeAI } from 'recker/presets';

const compute = createClient(ociCompute({
  tenancyId: process.env.OCI_TENANCY_ID,
  userId: process.env.OCI_USER_ID,
  fingerprint: process.env.OCI_FINGERPRINT,
  privateKey: process.env.OCI_PRIVATE_KEY,
  region: 'us-ashburn-1'
}));

// List instances
const instances = await compute.get('/20160918/instances', {
  params: { compartmentId: 'ocid1.compartment...' }
}).json();

// Object Storage
const storage = createClient(ociObjectStorage({
  tenancyId: process.env.OCI_TENANCY_ID,
  userId: process.env.OCI_USER_ID,
  fingerprint: process.env.OCI_FINGERPRINT,
  privateKey: process.env.OCI_PRIVATE_KEY,
  region: 'us-ashburn-1'
}));

// OCI Generative AI
const genai = createClient(ociGenerativeAI({
  tenancyId: process.env.OCI_TENANCY_ID,
  userId: process.env.OCI_USER_ID,
  fingerprint: process.env.OCI_FINGERPRINT,
  privateKey: process.env.OCI_PRIVATE_KEY,
  region: 'us-chicago-1'
}));
```

**Supported Services:**
- `core` (Compute, VCN), `objectstorage`, `database`, `identity`
- `containerengine` (OKE), `functions`, `streaming`
- `logging`, `monitoring`, `vault`, `kms`, `nosql`
- `generativeai`, `aidocument`, `aivision`

### GitHub

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

### Vultr

```typescript
import { vultr } from 'recker/presets';

const client = createClient(vultr({
  apiKey: process.env.VULTR_API_KEY
}));

// List instances
const instances = await client.get('/instances').json();

// List regions
const regions = await client.get('/regions').json();

// Create instance
await client.post('/instances', {
  json: {
    region: 'ewr',
    plan: 'vc2-1c-1gb',
    os_id: 387
  }
});
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

## Media & Content

### YouTube

```typescript
import { youtube } from 'recker/presets';

const client = createClient(youtube({
  apiKey: process.env.YOUTUBE_API_KEY
}));

// Search videos
const results = await client.get('/search', {
  params: {
    part: 'snippet',
    q: 'nodejs tutorial',
    type: 'video',
    maxResults: 10
  }
}).json();

// Get video details
const video = await client.get('/videos', {
  params: {
    part: 'snippet,statistics',
    id: 'dQw4w9WgXcQ'
  }
}).json();

// Get channel info
const channel = await client.get('/channels', {
  params: {
    part: 'snippet,statistics',
    id: 'UC_x5XG1OV2P6uZZ5FSM9Ttw'
  }
}).json();

// Get playlist items
const playlist = await client.get('/playlistItems', {
  params: {
    part: 'snippet',
    playlistId: 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf',
    maxResults: 50
  }
}).json();

// Get comments
const comments = await client.get('/commentThreads', {
  params: {
    part: 'snippet',
    videoId: 'dQw4w9WgXcQ',
    maxResults: 100
  }
}).json();
```

### Meta (Facebook, Instagram, WhatsApp, Threads)

```typescript
import { meta, facebook, instagram, whatsapp, threads } from 'recker/presets';

// Main preset (recommended)
const client = createClient(meta({
  accessToken: process.env.META_ACCESS_TOKEN,
  version: 'v19.0'  // Optional, default: v19.0
}));

// Get user profile
const me = await client.get('/me', {
  params: { fields: 'id,name,email,picture' }
}).json();

// Get user's pages
const pages = await client.get('/me/accounts').json();

// Post to a page
await client.post('/:pageId/feed', {
  params: { pageId: '123456789' },
  form: {
    message: 'Hello from Recker!',
    access_token: pageAccessToken
  }
});

// Get page insights
const insights = await client.get('/:pageId/insights', {
  params: {
    pageId: '123456789',
    metric: 'page_impressions,page_engaged_users',
    period: 'day'
  }
}).json();

// Aliases for clarity (all use the same Meta Graph API)
const fb = createClient(facebook({ accessToken: '...' }));
const ig = createClient(instagram({ accessToken: '...' }));
const wa = createClient(whatsapp({ accessToken: '...' }));
const th = createClient(threads({ accessToken: '...' }));
```

### TikTok

```typescript
import { tiktok, tiktokBusiness } from 'recker/presets';

// TikTok API (for login kit, content posting)
const client = createClient(tiktok({
  accessToken: process.env.TIKTOK_ACCESS_TOKEN
}));

// Get user info
const user = await client.get('/user/info/', {
  params: { fields: 'open_id,union_id,avatar_url,display_name' }
}).json();

// Get user's videos
const videos = await client.post('/video/list/', {
  json: { max_count: 20 }
}).json();

// TikTok Business/Ads API
const business = createClient(tiktokBusiness({
  accessToken: process.env.TIKTOK_BUSINESS_TOKEN,
  advertiserId: process.env.TIKTOK_ADVERTISER_ID
}));

// Get advertiser info
const info = await business.get('/advertiser/info/', {
  params: { advertiser_ids: ['advertiser_id'] }
}).json();

// Get campaigns
const campaigns = await business.get('/campaign/get/').json();
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
| `*.amazonaws.com` | `aws` |
| `api.vultr.com` | `vultr` |
| `*.googleapis.com` | `gcp` |
| `*.azure.com` | `azure` |
| `*.oraclecloud.com` | `oracle` |
| `googleapis.com/youtube` | `youtube` |
| `graph.facebook.com` | `meta` |
| `open.tiktokapis.com` | `tiktok` |

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

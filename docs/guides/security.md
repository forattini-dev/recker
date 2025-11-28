# Advanced Security & DNS

Recker provides tools for enterprise-grade security requirements, including mutual TLS (mTLS), custom Certificates, and secure DNS (DoH).

## Certificate Toolkit

Easily configure mTLS or custom CAs without fighting with `https.Agent`.

```typescript
import { createClient, createCertAgent } from 'recker';

const agent = createCertAgent({
  // Automatically loads from file path OR PEM string
  cert: './client.crt',
  key: './client.key',
  ca: './ca.crt', // Trust internal CA
  rejectUnauthorized: true
});

const client = createClient({
  baseUrl: 'https://secure-api.internal',
  // Override transport agent
  transport: new UndiciTransport('https://secure-api.internal', { dispatcher: agent })
});
```

## DNS over HTTPS (DoH)

Bypass local DNS blocking, censorship, or logging by resolving domains via HTTPS (Cloudflare, Google).

```typescript
import { createClient, createDoHLookup } from 'recker';
import { Agent } from 'undici';

const client = createClient({
  transport: new UndiciTransport('https://api.example.com', {
    // Inject custom lookup
    agent: new Agent({
      connect: {
        lookup: createDoHLookup('cloudflare') // Uses 1.1.1.1
      }
    })
  })
});
```

## Server-Timing

Automatically parse performance metrics sent by the backend (W3C Server-Timing).

```typescript
import { serverTiming } from 'recker';

const client = createClient({
  plugins: [serverTiming()]
});

const res = await client.get('/dashboard');
console.log(res.serverTimings);
// [
//   { name: 'db', duration: 50, description: 'Postgres' },
//   { name: 'render', duration: 120 }
// ]
```

## HAR Recording

Record your API session for debugging in Chrome DevTools.

```typescript
import { harRecorder } from 'recker';

const client = createClient({
  plugins: [
    harRecorder({ path: './debug-session.har' })
  ]
});
```

# Advanced Networking

Recker provides enterprise-grade networking tools for complex infrastructure requirements, scraping, and security operations.

## Interface Rotation (IP Binding)

For servers with multiple network interfaces or IP addresses, Recker can automatically rotate the outgoing IP to avoid rate limits or IP bans.

```typescript
import { createClient, interfaceRotator } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [
    interfaceRotator({
      // Auto-discover IPs
      family: 'IPv4',
      excludeInternal: true,
      strategy: 'round-robin'
    })
  ]
});

// Each request uses a different local IP
await client.get('/data'); 
await client.get('/data'); 
```

### Manual IP List

You can also provide a specific list of IPs to use:

```typescript
interfaceRotator({
  ips: ['10.0.0.5', '10.0.0.6'],
  strategy: 'random'
})
```

## Proxy Rotation

Managing a pool of proxies for scraping is built-in. Recker handles the rotation automatically.

```typescript
import { createClient, proxyRotator } from 'recker';

const client = createClient({
  plugins: [
    proxyRotator({
      proxies: [
        'http://user:pass@proxy1.com:8080',
        'http://user:pass@proxy2.com:8080'
      ],
      strategy: 'round-robin',
      failover: true // Automatically skip failed proxies (coming soon)
    })
  ]
});
```

## DNS over HTTPS (DoH)

Bypass local DNS blocking or logging by resolving domains via encrypted HTTPS (e.g., Cloudflare or Google).

```typescript
import { createClient, createDoHLookup } from 'recker';
import { Agent } from 'undici';

const client = createClient({
  transport: {
    // Inject custom lookup into the agent
    agent: new Agent({
      connect: {
        lookup: createDoHLookup('cloudflare') // Uses 1.1.1.1
      }
    })
  }
});
```

## Certificate Toolkit (mTLS)

Easily configure mutual TLS (mTLS) or custom CAs without fighting with `https.Agent` complexity.

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
  transport: { agent }
});
```

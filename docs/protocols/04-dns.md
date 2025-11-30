# DNS Utilities

DNS lookup, DNS over HTTPS (DoH), and security record analysis.

## DNS Lookup

### Custom DNS Lookup

```typescript
import { customDNSLookup } from 'recker/utils/dns';

// Basic lookup
const result = await customDNSLookup('example.com');
console.log(result.address); // '93.184.216.34'
console.log(result.family);  // 4

// Prefer IPv4
const ipv4 = await customDNSLookup('example.com', {
  preferIPv4: true
});
```

### DNS Override

```typescript
import { createClient } from 'recker';

// Override specific hostnames
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    override: {
      'api.example.com': '10.0.0.1',
      'internal.example.com': '192.168.1.100'
    }
  }
});

// Requests to api.example.com will use 10.0.0.1
await client.get('/users');
```

### Prefer IPv4

```typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    preferIPv4: true  // Use IPv4 even on dual-stack
  }
});
```

## DNS over HTTPS (DoH)

### Quick Start

```typescript
import { createDoHLookup } from 'recker/utils/doh';
import { createClient } from 'recker';

// Use Cloudflare DoH
const dohLookup = createDoHLookup('cloudflare');

// Apply to HTTP client (via Agent customization)
const client = createClient({
  baseUrl: 'https://api.example.com',
  // DNS queries go through HTTPS
});
```

### DoH Providers

```typescript
import { createDoHLookup } from 'recker/utils/doh';

// Cloudflare (1.1.1.1)
const cloudflare = createDoHLookup('cloudflare');

// Google (8.8.8.8)
const google = createDoHLookup('google');

// Quad9 (9.9.9.9)
const quad9 = createDoHLookup('quad9');

// Custom provider
const custom = createDoHLookup('https://dns.example.com/dns-query');
```

### Why Use DoH?

- **Privacy**: DNS queries encrypted over HTTPS
- **Security**: Prevents DNS spoofing/hijacking
- **Bypass**: Works around DNS filtering
- **Consistency**: Same DNS results across networks

## DNS Security Records

### Get All Security Records

```typescript
import { getSecurityRecords } from 'recker/utils/dns-toolkit';

const records = await getSecurityRecords('example.com');

console.log('SPF:', records.spf);
console.log('DMARC:', records.dmarc);
console.log('CAA:', records.caa);
console.log('MX:', records.mx);
console.log('TXT:', records.txt);
```

### SPF Records

```typescript
const records = await getSecurityRecords('example.com');

// SPF defines allowed mail senders
if (records.spf && records.spf.length > 0) {
  console.log('SPF record:', records.spf[0]);
  // "v=spf1 include:_spf.google.com ~all"
}
```

### DMARC Records

```typescript
const records = await getSecurityRecords('example.com');

// DMARC defines email authentication policy
if (records.dmarc) {
  console.log('DMARC:', records.dmarc);
  // "v=DMARC1; p=reject; rua=mailto:dmarc@example.com"
}
```

### CAA Records

```typescript
const records = await getSecurityRecords('example.com');

// CAA defines allowed certificate authorities
if (records.caa) {
  console.log('Allowed CAs:', records.caa.issue);
  console.log('Wildcard CAs:', records.caa.issuewild);
  console.log('Report to:', records.caa.iodef);
}
```

### MX Records

```typescript
const records = await getSecurityRecords('example.com');

// MX records for mail routing
if (records.mx) {
  console.log('Mail servers:', records.mx);
  // ['mail1.example.com', 'mail2.example.com']
}
```

## Integration with HTTP Client

### Use DNS Override

```typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    // Local development - point to localhost
    override: {
      'api.example.com': '127.0.0.1'
    }
  }
});

// Requests go to localhost but with proper Host header
await client.get('/health');
```

### Testing with DNS Override

```typescript
import { createClient } from 'recker';

// Point production domain to staging server
const client = createClient({
  baseUrl: 'https://api.production.com',
  dns: {
    override: {
      'api.production.com': '10.0.1.50'  // Staging IP
    }
  }
});

// Test production URLs against staging
await client.get('/users');
```

### Service Discovery

```typescript
import { createClient } from 'recker';
import { promises as dns } from 'dns';

// Resolve service hostname
const addresses = await dns.resolve4('api.internal');

const client = createClient({
  baseUrl: 'https://api.internal',
  dns: {
    override: {
      'api.internal': addresses[0]
    }
  }
});
```

## Domain Verification

### Check Email Security

```typescript
import { getSecurityRecords } from 'recker/utils/dns-toolkit';

async function checkEmailSecurity(domain: string) {
  const records = await getSecurityRecords(domain);
  const issues = [];

  // Check SPF
  if (!records.spf || records.spf.length === 0) {
    issues.push('Missing SPF record');
  }

  // Check DMARC
  if (!records.dmarc) {
    issues.push('Missing DMARC record');
  } else if (!records.dmarc.includes('p=reject')) {
    issues.push('DMARC policy not set to reject');
  }

  // Check MX
  if (!records.mx || records.mx.length === 0) {
    issues.push('No MX records found');
  }

  return {
    secure: issues.length === 0,
    issues,
    records
  };
}

const result = await checkEmailSecurity('example.com');
console.log('Email security:', result.secure);
console.log('Issues:', result.issues);
```

### Check SSL Configuration

```typescript
import { getSecurityRecords } from 'recker/utils/dns-toolkit';

async function checkCAA(domain: string) {
  const records = await getSecurityRecords(domain);

  if (!records.caa || !records.caa.issue) {
    return {
      hasCAA: false,
      message: 'No CAA records - any CA can issue certificates'
    };
  }

  return {
    hasCAA: true,
    allowedCAs: records.caa.issue,
    wildcardCAs: records.caa.issuewild,
    reportEmail: records.caa.iodef
  };
}

const caaStatus = await checkCAA('example.com');
console.log('CAA configured:', caaStatus.hasCAA);
console.log('Allowed CAs:', caaStatus.allowedCAs);
```

## Patterns

### Health Check with DNS

```typescript
import { customDNSLookup } from 'recker/utils/dns';

async function checkDNSHealth(domain: string) {
  try {
    const start = Date.now();
    const result = await customDNSLookup(domain);
    const duration = Date.now() - start;

    return {
      healthy: true,
      ip: result.address,
      family: result.family === 4 ? 'IPv4' : 'IPv6',
      latencyMs: duration
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    };
  }
}
```

### Round-Robin DNS

```typescript
import { promises as dns } from 'dns';

async function getRandomIP(domain: string): Promise<string> {
  const addresses = await dns.resolve4(domain);
  const randomIndex = Math.floor(Math.random() * addresses.length);
  return addresses[randomIndex];
}

// Use random IP for load distribution
const ip = await getRandomIP('api.example.com');
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: { override: { 'api.example.com': ip } }
});
```

### DNS Caching

```typescript
const dnsCache = new Map<string, { ip: string; expires: number }>();
const TTL = 300000; // 5 minutes

async function cachedLookup(domain: string): Promise<string> {
  const cached = dnsCache.get(domain);

  if (cached && cached.expires > Date.now()) {
    return cached.ip;
  }

  const result = await customDNSLookup(domain);
  dnsCache.set(domain, {
    ip: result.address,
    expires: Date.now() + TTL
  });

  return result.address;
}
```

## Best Practices

### 1. Use DNS Override for Testing

```typescript
// Test against local mock server
const client = createClient({
  baseUrl: 'https://api.production.com',
  dns: {
    override: {
      'api.production.com': '127.0.0.1'
    }
  }
});
```

### 2. Prefer IPv4 for Compatibility

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: { preferIPv4: true }
});
```

### 3. Use DoH for Privacy

```typescript
// When DNS privacy matters (public networks, etc.)
const lookup = createDoHLookup('cloudflare');
```

### 4. Verify Email Security

```typescript
// Before trusting email from a domain
const security = await getSecurityRecords(domain);
const hasSPF = security.spf?.length > 0;
const hasDMARC = !!security.dmarc;
```

## Next Steps

- **[WHOIS & RDAP](05-whois-rdap.md)** - Domain registration lookup
- **[SSE](06-sse.md)** - Server-Sent Events

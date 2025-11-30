# WHOIS & RDAP

Domain and IP registration lookup utilities.

## WHOIS

### Quick Start

```typescript
import { whois, isDomainAvailable } from 'recker/utils/whois';

// Lookup domain info
const result = await whois('example.com');
console.log(result.raw);     // Full WHOIS text
console.log(result.data);    // Parsed key-value pairs

// Check availability
const available = await isDomainAvailable('my-new-domain.com');
console.log('Available:', available);
```

### Domain Lookup

```typescript
import { whois } from 'recker/utils/whois';

const result = await whois('github.com');

console.log('Query:', result.query);
console.log('Server:', result.server);

// Parsed data
console.log('Registrar:', result.data['registrar']);
console.log('Created:', result.data['creation date']);
console.log('Expires:', result.data['expiration date']);
console.log('Name servers:', result.data['name server']);
```

### IP Address Lookup

```typescript
import { whois } from 'recker/utils/whois';

// IPv4
const ipv4 = await whois('8.8.8.8');
console.log('Organization:', ipv4.data['organization']);
console.log('Network:', ipv4.data['cidr']);

// IPv6
const ipv6 = await whois('2001:4860:4860::8888');
console.log('Organization:', ipv6.data['organization']);
```

### Options

```typescript
import { whois } from 'recker/utils/whois';

const result = await whois('example.com', {
  // Custom WHOIS server
  server: 'whois.verisign-grs.com',

  // Port (default: 43)
  port: 43,

  // Timeout in milliseconds
  timeout: 10000,

  // Follow referrals (default: true)
  follow: true
});
```

### Domain Availability

```typescript
import { isDomainAvailable } from 'recker/utils/whois';

// Check if domain is available for registration
const available = await isDomainAvailable('my-startup.com');

if (available) {
  console.log('Domain is available!');
} else {
  console.log('Domain is taken');
}
```

### Parsed Data

```typescript
const result = await whois('google.com');

// Common fields (may vary by TLD)
const info = {
  registrar: result.data['registrar'],
  registrarUrl: result.data['registrar url'],
  creationDate: result.data['creation date'],
  expirationDate: result.data['registry expiry date'],
  updatedDate: result.data['updated date'],
  status: result.data['domain status'],
  nameServers: result.data['name server'],
  dnssec: result.data['dnssec']
};

console.log(info);
```

### Supported TLDs

Built-in WHOIS server mappings:

```typescript
// Common TLDs
'com', 'net', 'org', 'info', 'biz'

// Country codes
'us', 'uk', 'ca', 'de', 'fr', 'au', 'jp', 'cn', 'ru', 'br', 'eu'

// New gTLDs
'io', 'co', 'me', 'tv', 'cc', 'ws', 'app', 'dev', 'ai'

// Others
'mobi', 'asia', 'tel', 'pro', 'aero', 'cat', 'coop', 'jobs', 'museum', 'travel', 'xxx'

// Unknown TLDs use whois.iana.org
```

## RDAP

RDAP (Registration Data Access Protocol) is the modern replacement for WHOIS. It returns structured JSON data.

### Quick Start

```typescript
import { createClient } from 'recker';
import { rdap } from 'recker/utils/rdap';

const client = createClient();
const result = await rdap(client, 'example.com');

console.log('Status:', result.status);
console.log('Events:', result.events);
console.log('Entities:', result.entities);
```

### Domain Lookup

```typescript
import { createClient } from 'recker';
import { rdap } from 'recker/utils/rdap';

const client = createClient();
const result = await rdap(client, 'google.com');

// Status array
console.log('Status:', result.status);
// ['client delete prohibited', 'client transfer prohibited', ...]

// Events (creation, expiration, etc.)
for (const event of result.events || []) {
  console.log(`${event.eventAction}: ${event.eventDate}`);
}

// Entities (registrar, registrant, etc.)
for (const entity of result.entities || []) {
  console.log(`${entity.roles?.join(', ')}: ${entity.handle}`);
}
```

### IP Address Lookup

```typescript
import { createClient } from 'recker';
import { rdap } from 'recker/utils/rdap';

const client = createClient();
const result = await rdap(client, '8.8.8.8');

console.log('Handle:', result.handle);
console.log('Name:', result.name);
console.log('Type:', result.type);
console.log('Start address:', result.startAddress);
console.log('End address:', result.endAddress);
```

### RDAP Response Structure

```typescript
interface RDAPResult {
  // Unique identifier
  handle?: string;

  // Status array
  status?: string[];

  // Events (registration, expiration, etc.)
  events?: Array<{
    eventAction: string;
    eventDate: string;
  }>;

  // Related entities (registrar, contacts, etc.)
  entities?: Array<{
    handle?: string;
    roles?: string[];
    vcardArray?: any[];
  }>;

  // Additional fields vary by registry
  [key: string]: any;
}
```

## WHOIS vs RDAP Comparison

| Feature | WHOIS | RDAP |
|---------|-------|------|
| Format | Plain text | JSON |
| Parsing | Manual regex | Structured |
| Authentication | None | Optional |
| Rate limiting | Per-server | Standardized |
| Localization | Limited | Full i18n |
| HTTP | No (TCP 43) | Yes |

## Patterns

### Domain Expiration Check

```typescript
import { whois } from 'recker/utils/whois';

async function checkExpiration(domain: string) {
  const result = await whois(domain);

  const expiryField =
    result.data['registry expiry date'] ||
    result.data['expiration date'] ||
    result.data['paid-till'];

  if (expiryField) {
    const expiry = new Date(expiryField as string);
    const daysUntil = Math.floor((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    return {
      domain,
      expires: expiry,
      daysUntil,
      expiresSoon: daysUntil < 30
    };
  }

  return { domain, expires: null };
}

const status = await checkExpiration('example.com');
console.log(`${status.domain} expires in ${status.daysUntil} days`);
```

### Bulk Domain Check

```typescript
import { isDomainAvailable } from 'recker/utils/whois';

async function checkBulkAvailability(domains: string[]) {
  const results = await Promise.all(
    domains.map(async (domain) => ({
      domain,
      available: await isDomainAvailable(domain)
    }))
  );

  return results;
}

const domains = ['cool-startup.com', 'my-app.io', 'new-service.dev'];
const availability = await checkBulkAvailability(domains);

for (const { domain, available } of availability) {
  console.log(`${domain}: ${available ? 'Available' : 'Taken'}`);
}
```

### IP Ownership Lookup

```typescript
import { whois } from 'recker/utils/whois';

async function getIPOwner(ip: string) {
  const result = await whois(ip);

  return {
    ip,
    organization: result.data['organization'] || result.data['orgname'],
    network: result.data['cidr'] || result.data['inetnum'],
    country: result.data['country'],
    abuse: result.data['abuse-mailbox'] || result.data['orgabuseemail']
  };
}

const owner = await getIPOwner('8.8.8.8');
console.log('Organization:', owner.organization);
console.log('Network:', owner.network);
```

### Registrar Information

```typescript
import { whois } from 'recker/utils/whois';

async function getRegistrarInfo(domain: string) {
  const result = await whois(domain);

  return {
    domain,
    registrar: result.data['registrar'],
    registrarUrl: result.data['registrar url'],
    registrarPhone: result.data['registrar abuse contact phone'],
    registrarEmail: result.data['registrar abuse contact email']
  };
}

const info = await getRegistrarInfo('github.com');
console.log('Registrar:', info.registrar);
```

## Error Handling

### WHOIS Errors

```typescript
import { whois } from 'recker/utils/whois';

try {
  const result = await whois('example.com');
  console.log(result.data);
} catch (error) {
  if (error.message.includes('timed out')) {
    console.error('WHOIS server not responding');
  } else {
    console.error('WHOIS lookup failed:', error.message);
  }
}
```

### RDAP Errors

```typescript
import { createClient } from 'recker';
import { rdap } from 'recker/utils/rdap';

const client = createClient();

try {
  const result = await rdap(client, 'nonexistent-domain.invalid');
} catch (error) {
  if (error.message.includes('not found')) {
    console.log('Domain not registered or RDAP not available');
  } else {
    console.error('RDAP lookup failed:', error.message);
  }
}
```

## Best Practices

### 1. Use Timeouts

```typescript
const result = await whois('example.com', {
  timeout: 10000  // 10 seconds
});
```

### 2. Handle Rate Limits

```typescript
// WHOIS servers may rate limit
// Add delays between bulk lookups
for (const domain of domains) {
  await whois(domain);
  await sleep(1000);  // 1 second delay
}
```

### 3. Prefer RDAP When Available

```typescript
// RDAP provides structured data
// Use WHOIS as fallback
async function lookupDomain(domain: string) {
  try {
    return await rdap(client, domain);
  } catch {
    return await whois(domain);
  }
}
```

### 4. Cache Results

```typescript
const cache = new Map<string, { data: any; expires: number }>();
const TTL = 3600000; // 1 hour

async function cachedWhois(domain: string) {
  const cached = cache.get(domain);

  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const result = await whois(domain);
  cache.set(domain, { data: result, expires: Date.now() + TTL });

  return result;
}
```

## Next Steps

- **[SSE](06-sse.md)** - Server-Sent Events
- **[DNS](04-dns.md)** - DNS utilities

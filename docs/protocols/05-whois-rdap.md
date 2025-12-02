# WHOIS & RDAP

Domain and IP registration lookup utilities.

## Usage Styles

### 1. Direct Functions (Zero Config)

```typescript
import { whois, whoisAvailable } from 'recker';
// or
import { recker } from 'recker';

// Quick lookup
const result = await whois('github.com');
// or
const result = await recker.whois('github.com');
console.log(result.parsed);

// Check availability
const available = await whoisAvailable('my-new-domain.com');
// or
const available = await recker.whoisAvailable('my-new-domain.com');
```

### 2. Configured Client

```typescript
import { createWhois } from 'recker';
// or
const whoisClient = recker.whoisClient(options);

const whoisClient = createWhois({
  timeout: 15000,
  debug: true
});

// Lookup domain info
const result = await whoisClient.lookup('example.com');
console.log(result.raw);     // Full WHOIS text
console.log(result.parsed);  // Parsed key-value pairs

// Check availability
const available = await whoisClient.isAvailable('my-new-domain.com');

// Get specific info
const registrar = await whoisClient.getRegistrar('github.com');
const expiration = await whoisClient.getExpiration('github.com');
const nameServers = await whoisClient.getNameServers('github.com');
```

### Type Definitions

```typescript
interface WhoisClientOptions {
  /** Default WHOIS server to use */
  server?: string;

  /** Default port (default: 43) */
  port?: number;

  /** Default timeout in milliseconds (default: 10000) */
  timeout?: number;

  /** Follow referrals to other WHOIS servers (default: true) */
  follow?: boolean;

  /** Enable debug logging (default: false) */
  debug?: boolean;
}

interface WhoisResult {
  /** Raw WHOIS response text */
  raw: string;

  /** Query that was performed */
  query: string;

  /** Server that was queried */
  server: string;

  /**
   * Parsed key-value pairs from response
   * Keys are lowercase. Values can be string or string[] for multiple entries.
   */
  data: Record<string, string | string[]>;
}
```

### Domain Lookup

```typescript
import { createWhois } from 'recker';

const whois = createWhois();
const result = await whois.lookup('github.com');

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
import { createWhois } from 'recker';

const whois = createWhois();

// IPv4
const ipv4 = await whois.lookup('8.8.8.8');
console.log('Organization:', ipv4.data['organization']);
console.log('Network:', ipv4.data['cidr']);

// IPv6
const ipv6 = await whois.lookup('2001:4860:4860::8888');
console.log('Organization:', ipv6.data['organization']);
```

### Client Options

```typescript
import { createWhois } from 'recker';

const whois = createWhois({
  // Custom WHOIS server
  server: 'whois.verisign-grs.com',

  // Port (default: 43)
  port: 43,

  // Timeout in milliseconds
  timeout: 10000,

  // Follow referrals (default: true)
  follow: true,

  // Enable debug logging
  debug: true
});

// Override options per lookup
const result = await whois.lookup('example.com', {
  server: 'whois.nic.io',
  timeout: 5000
});
```

### Domain Availability

```typescript
import { createWhois } from 'recker';

const whois = createWhois();

// Check if domain is available for registration
const available = await whois.isAvailable('my-startup.com');

if (available) {
  console.log('Domain is available!');
} else {
  console.log('Domain is taken');
}
```

### Convenience Methods

```typescript
import { createWhois } from 'recker';

const whois = createWhois();

// Get registrar info directly
const registrar = await whois.getRegistrar('github.com');
console.log('Registrar:', registrar);

// Get expiration date as Date object
const expiry = await whois.getExpiration('github.com');
console.log('Expires:', expiry);

// Get name servers as array
const nameServers = await whois.getNameServers('github.com');
console.log('NS:', nameServers);
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
import { createWhois } from 'recker';

const whois = createWhois();

async function checkExpiration(domain: string) {
  const expiry = await whois.getExpiration(domain);

  if (expiry) {
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
import { createClient, createWhois } from 'recker';

const client = createClient();
const whois = createWhois();

const domains = ['cool-startup.com', 'my-app.io', 'new-service.dev'];

// Use batch for controlled concurrency and rate limiting
const { results, stats } = await client.batch(
  domains.map(domain => ({ domain })),
  {
    concurrency: 3,  // Respect WHOIS rate limits
    mapResponse: async (_, item) => ({
      domain: item.domain,
      available: await whois.isAvailable(item.domain)
    })
  }
);

console.log(`Checked ${stats.total} domains in ${stats.duration}ms`);

for (const { domain, available } of results) {
  console.log(`${domain}: ${available ? 'Available' : 'Taken'}`);
}
```

### IP Ownership Lookup

```typescript
import { createWhois } from 'recker';

const whois = createWhois();

async function getIPOwner(ip: string) {
  const result = await whois.lookup(ip);

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
import { createWhois } from 'recker';

const whois = createWhois();

async function getRegistrarInfo(domain: string) {
  const result = await whois.lookup(domain);

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
import { createWhois } from 'recker';

const whois = createWhois({ debug: true });

try {
  const result = await whois.lookup('example.com');
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
import { createWhois } from 'recker';

const whois = createWhois({
  timeout: 10000  // 10 seconds
});

const result = await whois.lookup('example.com');
```

### 2. Handle Rate Limits

```typescript
import { createWhois } from 'recker';

const whois = createWhois();

// WHOIS servers may rate limit
// Add delays between bulk lookups
for (const domain of domains) {
  await whois.lookup(domain);
  await sleep(1000);  // 1 second delay
}
```

### 3. Prefer RDAP When Available

```typescript
import { createClient, createWhois, rdap } from 'recker';

const client = createClient();
const whois = createWhois();

// RDAP provides structured data
// Use WHOIS as fallback
async function lookupDomain(domain: string) {
  try {
    return await rdap(client, domain);
  } catch {
    return await whois.lookup(domain);
  }
}
```

### 4. Cache Results

```typescript
import { createWhois } from 'recker';

const whois = createWhois();
const cache = new Map<string, { data: any; expires: number }>();
const TTL = 3600000; // 1 hour

async function cachedWhois(domain: string) {
  const cached = cache.get(domain);

  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const result = await whois.lookup(domain);
  cache.set(domain, { data: result, expires: Date.now() + TTL });

  return result;
}
```

## Next Steps

- **[SSE](06-sse.md)** - Server-Sent Events
- **[DNS](04-dns.md)** - DNS utilities

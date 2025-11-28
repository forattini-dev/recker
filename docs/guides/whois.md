# WHOIS

> Query domain and IP information using WHOIS protocol

Recker includes a built-in WHOIS client for querying domain registrations, IP allocations, and network information. It supports 30+ TLDs with automatic server selection and DNS server referrals.

## Quick Start

```typescript
import { createClient } from 'recker';

const client = createClient({ baseUrl: 'https://api.example.com' });

// Query domain information
const result = await client.whois('google.com');

console.log(result.server);  // 'whois.verisign-grs.com'
console.log(result.data);
// {
//   'domain name': 'GOOGLE.COM',
//   'registrar': 'MarkMonitor Inc.',
//   'creation date': '1997-09-15T04:00:00Z',
//   'registry expiry date': '2028-09-14T04:00:00Z',
//   'name server': [
//     'NS1.GOOGLE.COM',
//     'NS2.GOOGLE.COM',
//     'NS3.GOOGLE.COM',
//     'NS4.GOOGLE.COM'
//   ],
//   'dnssec': 'unsigned'
// }

// Check if domain is available
const available = await client.isDomainAvailable('my-startup.com');
if (available) {
  console.log('Domain is available for registration!');
}
```

## Direct Import

```typescript
import { whois, isDomainAvailable } from 'recker';

const result = await whois('github.com');
const available = await isDomainAvailable('example.com');
```

## Domain Queries

### Basic Query

```typescript
const result = await client.whois('example.com');

console.log('Domain:', result.query);
console.log('Server:', result.server);
console.log('Raw response:', result.raw);
console.log('Parsed data:', result.data);
```

### Common TLDs

Recker includes default WHOIS servers for 30+ common TLDs:

- **Generic**: .com, .net, .org, .info, .biz
- **Country**: .uk, .us, .ca, .de, .fr, .au, .jp, .cn, .ru, .br
- **New gTLDs**: .io, .co, .me, .tv, .cc, .ws, .ai
- **Special**: .aero, .asia, .cat, .coop, .jobs, .mobi, .museum, .pro, .tel, .travel, .xxx
- **Tech**: .app, .dev

```typescript
// Automatically uses appropriate WHOIS server
await client.whois('example.com');    // whois.verisign-grs.com
await client.whois('example.org');    // whois.pir.org
await client.whois('example.io');     // whois.nic.io
await client.whois('example.ai');     // whois.nic.ai
```

### Custom WHOIS Server

Override the automatic server selection:

```typescript
const result = await client.whois('example.com', {
  server: 'whois.verisign-grs.com'
});
```

## IP Address Queries

### IPv4

```typescript
const result = await client.whois('8.8.8.8');

console.log(result.data);
// {
//   'netname': 'GOOGLE',
//   'netrange': '8.8.8.0 - 8.8.8.255',
//   'organization': 'Google LLC',
//   'country': 'US'
// }
```

### IPv6

```typescript
const result = await client.whois('2001:4860:4860::8888');

console.log(result.data);
// IPv6 WHOIS information
```

## Configuration Options

```typescript
interface WhoisOptions {
  /** Custom WHOIS server to query */
  server?: string;

  /** Port to connect to (default: 43) */
  port?: number;

  /** Connection timeout in milliseconds (default: 5000) */
  timeout?: number;

  /** Follow referrals to other WHOIS servers (default: true) */
  follow?: boolean;
}
```

### Timeout

```typescript
// Short timeout for fast failure
const result = await client.whois('example.com', {
  timeout: 2000  // 2 seconds
});
```

### Disable Referrals

Some WHOIS servers redirect to other servers. Disable automatic following:

```typescript
const result = await client.whois('example.com', {
  follow: false  // Don't follow referrals
});
```

### Custom Port

```typescript
const result = await client.whois('example.com', {
  port: 4343  // Non-standard port
});
```

## Response Format

### WhoisResult

```typescript
interface WhoisResult {
  /** Raw WHOIS response text */
  raw: string;

  /** Query that was performed */
  query: string;

  /** Server that was queried */
  server: string;

  /** Parsed key-value pairs from response */
  data: Record<string, string | string[]>;
}
```

### Parsed Data

The `data` object contains key-value pairs extracted from the WHOIS response:

```typescript
const result = await client.whois('google.com');

console.log(result.data);
// {
//   'domain name': 'GOOGLE.COM',
//   'registrar': 'MarkMonitor Inc.',
//   'registrar whois server': 'whois.markmonitor.com',
//   'creation date': 'ISO-8601 date',
//   'registry expiry date': 'ISO-8601 date',
//   'name server': ['NS1.GOOGLE.COM', 'NS2.GOOGLE.COM', ...]
// }
```

### Multiple Values

Some fields can have multiple values:

```typescript
const result = await client.whois('google.com');

// Array of name servers
const nameServers = result.data['name server'];
if (Array.isArray(nameServers)) {
  nameServers.forEach(ns => console.log(ns));
}
```

## Domain Availability

Check if a domain is available for registration:

```typescript
const available = await client.isDomainAvailable('my-awesome-app.com');

if (available) {
  console.log('✓ Domain is available!');
  // Proceed with registration
} else {
  console.log('✗ Domain is already registered');
  // Try another name
}
```

### How It Works

The `isDomainAvailable()` function checks for common "not found" indicators in the WHOIS response:

- "no match"
- "not found"
- "no entries found"
- "no data found"
- "status: available"
- "status: free"

Note: This is a best-effort check. Some registrars use custom response formats.

### Batch Availability Check

```typescript
const domains = [
  'my-app.com',
  'my-app.net',
  'my-app.io',
  'my-app.ai'
];

const results = await Promise.all(
  domains.map(async domain => ({
    domain,
    available: await client.isDomainAvailable(domain)
  }))
);

results.forEach(({ domain, available }) => {
  console.log(`${domain}: ${available ? '✓ Available' : '✗ Taken'}`);
});
```

## Complete Examples

### Domain Registration Tool

```typescript
import { createClient } from 'recker';

const client = createClient({ baseUrl: 'https://api.example.com' });

async function checkDomain(domain: string) {
  console.log(`Checking ${domain}...`);

  try {
    const available = await client.isDomainAvailable(domain);

    if (available) {
      console.log(`✓ ${domain} is available!`);
      return { domain, available: true };
    } else {
      // Get registration info
      const result = await client.whois(domain);

      console.log(`✗ ${domain} is taken`);
      console.log(`Registrar: ${result.data['registrar']}`);
      console.log(`Created: ${result.data['creation date']}`);
      console.log(`Expires: ${result.data['registry expiry date']}`);

      return { domain, available: false, info: result.data };
    }
  } catch (error) {
    console.error(`Error checking ${domain}:`, error.message);
    return { domain, available: false, error: error.message };
  }
}

// Check multiple variations
const names = [
  'my-awesome-startup',
  'myawesomestartup',
  'awesome-startup',
  'my-startup'
];

const tlds = ['com', 'io', 'ai', 'dev'];

for (const name of names) {
  for (const tld of tlds) {
    await checkDomain(`${name}.${tld}`);
  }
}
```

### IP Allocation Tracker

```typescript
async function getIPInfo(ip: string) {
  const result = await client.whois(ip);

  return {
    ip,
    network: result.data['netrange'] || result.data['inetnum'],
    organization: result.data['organization'] || result.data['org-name'],
    country: result.data['country'],
    netname: result.data['netname'],
    raw: result.raw
  };
}

// Track IP ranges
const ips = [
  '8.8.8.8',        // Google
  '1.1.1.1',        // Cloudflare
  '208.67.222.222'  // OpenDNS
];

for (const ip of ips) {
  const info = await getIPInfo(ip);
  console.log(`${ip}: ${info.organization} (${info.country})`);
}
```

### Domain Monitoring

```typescript
async function monitorDomain(domain: string) {
  const result = await client.whois(domain);

  const expiryDate = result.data['registry expiry date'];
  if (expiryDate) {
    const expiry = new Date(expiryDate as string);
    const daysUntilExpiry = Math.floor(
      (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilExpiry < 30) {
      console.warn(`⚠️  ${domain} expires in ${daysUntilExpiry} days!`);
      // Send renewal reminder
      await sendRenewalReminder(domain, daysUntilExpiry);
    } else {
      console.log(`✓ ${domain} is good for ${daysUntilExpiry} days`);
    }
  }

  return result;
}

// Monitor portfolio
const portfolio = [
  'my-main-domain.com',
  'my-brand.io',
  'my-app.ai'
];

for (const domain of portfolio) {
  await monitorDomain(domain);
}
```

### Domain Research

```typescript
async function researchDomain(domain: string) {
  const result = await client.whois(domain);

  // Extract useful information
  const info = {
    domain: result.query,
    registrar: result.data['registrar'],
    createdDate: result.data['creation date'],
    expiryDate: result.data['registry expiry date'],
    updatedDate: result.data['updated date'],
    nameServers: result.data['name server'],
    status: result.data['domain status'],
    dnssec: result.data['dnssec']
  };

  console.log('Domain Information:');
  console.log(`  Domain: ${info.domain}`);
  console.log(`  Registrar: ${info.registrar}`);
  console.log(`  Created: ${info.createdDate}`);
  console.log(`  Expires: ${info.expiryDate}`);

  if (Array.isArray(info.nameServers)) {
    console.log('  Name Servers:');
    info.nameServers.forEach(ns => console.log(`    - ${ns}`));
  }

  return info;
}

await researchDomain('github.com');
```

## Error Handling

### Timeout Errors

```typescript
try {
  const result = await client.whois('example.com', {
    timeout: 1000  // Very short timeout
  });
} catch (error) {
  if (error.message.includes('timed out')) {
    console.error('WHOIS query timed out');
    // Retry with longer timeout
  }
}
```

### Connection Errors

```typescript
try {
  const result = await client.whois('example.com', {
    server: 'invalid-server.com'
  });
} catch (error) {
  if (error.message.includes('ENOTFOUND')) {
    console.error('WHOIS server not found');
  } else if (error.message.includes('ECONNREFUSED')) {
    console.error('Connection refused');
  }
}
```

### Invalid Domain

```typescript
try {
  await client.whois('not-a-real-domain.xyz123');
} catch (error) {
  console.error('Invalid domain or TLD');
}
```

## Rate Limiting

WHOIS servers have rate limits. Use delays between queries:

```typescript
async function queryWithDelay(domains: string[], delayMs: number = 1000) {
  const results = [];

  for (const domain of domains) {
    try {
      const result = await client.whois(domain);
      results.push(result);
    } catch (error) {
      console.error(`Failed to query ${domain}:`, error.message);
    }

    // Wait before next query
    if (domains.indexOf(domain) < domains.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

const domains = ['example1.com', 'example2.com', 'example3.com'];
const results = await queryWithDelay(domains, 2000);  // 2 second delay
```

## Best Practices

### 1. Handle Timeouts

```typescript
const result = await client.whois('example.com', {
  timeout: 10000  // 10 second timeout
});
```

### 2. Use Rate Limiting

Don't hammer WHOIS servers. Add delays between queries:

```typescript
await delay(1000);  // Wait 1 second between queries
```

### 3. Cache Results

WHOIS data doesn't change frequently. Cache results:

```typescript
const cache = new Map();

async function getCachedWhois(domain: string) {
  if (cache.has(domain)) {
    return cache.get(domain);
  }

  const result = await client.whois(domain);
  cache.set(domain, result);

  // Expire after 1 hour
  setTimeout(() => cache.delete(domain), 3600000);

  return result;
}
```

### 4. Parse Carefully

WHOIS formats vary by registrar. Check for field existence:

```typescript
const result = await client.whois('example.com');

const expiry = result.data['registry expiry date']
  || result.data['expiry date']
  || result.data['expiration date'];

if (expiry) {
  console.log('Expires:', expiry);
}
```

### 5. Handle Errors Gracefully

```typescript
async function safeWhois(domain: string) {
  try {
    return await client.whois(domain);
  } catch (error) {
    console.warn(`WHOIS failed for ${domain}:`, error.message);
    return null;
  }
}
```

## Troubleshooting

### Query Returns Empty Data

Some domains don't expose detailed WHOIS information due to privacy protection:

```typescript
const result = await client.whois('example.com');

if (Object.keys(result.data).length === 0) {
  console.log('Domain uses WHOIS privacy protection');
  console.log('Raw response:', result.raw);
}
```

### Wrong Server Selected

Manually specify the WHOIS server:

```typescript
const result = await client.whois('example.com', {
  server: 'whois.verisign-grs.com'  // Force specific server
});
```

### Timeout Issues

Increase the timeout for slow WHOIS servers:

```typescript
const result = await client.whois('example.com', {
  timeout: 30000  // 30 seconds
});
```

## API Reference

### Functions

```typescript
// Query WHOIS information
function whois(query: string, options?: WhoisOptions): Promise<WhoisResult>;

// Check domain availability
function isDomainAvailable(domain: string, options?: WhoisOptions): Promise<boolean>;
```

### Types

```typescript
interface WhoisOptions {
  server?: string;
  port?: number;
  timeout?: number;
  follow?: boolean;
}

interface WhoisResult {
  raw: string;
  query: string;
  server: string;
  data: Record<string, string | string[]>;
}
```

## Supported TLDs

Recker includes default WHOIS servers for these TLDs:

.com, .net, .org, .info, .biz, .us, .uk, .ca, .de, .fr, .au, .jp, .cn, .ru, .br, .eu, .io, .co, .me, .tv, .cc, .ws, .mobi, .asia, .tel, .pro, .aero, .cat, .coop, .jobs, .museum, .travel, .xxx, .app, .dev, .ai

For unlisted TLDs, Recker will use `whois.iana.org` which may redirect to the appropriate server.

## See Also

- [DNS Configuration](dns.md) - Custom DNS settings
- [Client Configuration](client-config.md) - Client setup
- [Error Handling](error-handling.md) - Error handling strategies

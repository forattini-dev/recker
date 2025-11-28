# Security & Reconnaissance Tools

Recker provides comprehensive tools for security analysis, network reconnaissance, and infrastructure auditing.

## TLS Inspector

Analyze TLS certificates and connection security without making HTTP requests.

### Basic Usage

```typescript
import { inspectTLS } from 'recker';

const info = await inspectTLS('example.com', 443);

console.log('Valid:', info.valid);
console.log('Expires:', info.validTo);
console.log('Days remaining:', info.daysRemaining);
console.log('Protocol:', info.protocol);      // TLSv1.3
console.log('Cipher:', info.cipher?.name);    // TLS_AES_256_GCM_SHA384
console.log('Issuer:', info.issuer.O);
console.log('Fingerprint:', info.fingerprint256);
```

### TLS Info Interface

```typescript
interface TLSInfo {
  valid: boolean;              // Certificate currently valid
  validFrom: Date;
  validTo: Date;
  daysRemaining: number;

  issuer: Record<string, string>;   // { O: 'Let\'s Encrypt', CN: '...' }
  subject: Record<string, string>;  // { CN: 'example.com' }

  fingerprint: string;         // SHA1 fingerprint
  fingerprint256: string;      // SHA256 fingerprint
  serialNumber: string;

  protocol: string | null;     // 'TLSv1.3', 'TLSv1.2'
  cipher: {
    name: string;              // 'TLS_AES_256_GCM_SHA384'
    version: string;
  } | null;

  authorized: boolean;         // Certificate chain valid
  authorizationError?: Error;  // Chain validation error
}
```

### Certificate Monitoring

```typescript
async function monitorCertificates(domains: string[]) {
  const results = await Promise.all(
    domains.map(async (domain) => {
      try {
        const info = await inspectTLS(domain);
        return {
          domain,
          valid: info.valid,
          daysRemaining: info.daysRemaining,
          issuer: info.issuer.O || info.issuer.CN,
          protocol: info.protocol
        };
      } catch (error) {
        return { domain, error: error.message };
      }
    })
  );

  // Alert on expiring certificates
  const expiring = results.filter(r => r.daysRemaining !== undefined && r.daysRemaining < 30);
  if (expiring.length > 0) {
    console.warn('Certificates expiring soon:', expiring);
  }

  return results;
}
```

---

## DNS Security Toolkit

Audit email security (SPF, DMARC) and CA authorization (CAA) records.

### Basic Usage

```typescript
import { getSecurityRecords } from 'recker';

const records = await getSecurityRecords('example.com');

console.log('SPF:', records.spf);
console.log('DMARC:', records.dmarc);
console.log('CAA:', records.caa);
console.log('MX:', records.mx);
console.log('TXT:', records.txt);
```

### Response Interface

```typescript
interface DnsSecurityRecords {
  spf?: string[];     // SPF records (v=spf1 ...)
  dmarc?: string;     // DMARC policy (v=DMARC1; ...)
  caa?: {
    issue?: string[];       // CAs allowed to issue certs
    issuewild?: string[];   // CAs for wildcard certs
    iodef?: string;         // Incident reporting URL
  };
  mx?: string[];      // Mail servers
  txt?: string[];     // All TXT records
}
```

### Security Audit Example

```typescript
async function auditEmailSecurity(domain: string) {
  const records = await getSecurityRecords(domain);
  const issues: string[] = [];

  // Check SPF
  if (!records.spf || records.spf.length === 0) {
    issues.push('No SPF record - email spoofing possible');
  } else if (!records.spf[0].includes('-all') && !records.spf[0].includes('~all')) {
    issues.push('SPF should end with -all or ~all');
  }

  // Check DMARC
  if (!records.dmarc) {
    issues.push('No DMARC record - email authentication not enforced');
  } else if (records.dmarc.includes('p=none')) {
    issues.push('DMARC policy is "none" - consider "quarantine" or "reject"');
  }

  // Check CAA
  if (!records.caa || !records.caa.issue) {
    issues.push('No CAA records - any CA can issue certificates');
  }

  return { domain, issues, records };
}
```

---

## RDAP (Modern WHOIS)

Structured domain/IP registration data using the RDAP protocol.

### Domain Lookup

```typescript
import { createClient, rdap } from 'recker';

const client = createClient();
const result = await rdap(client, 'example.com');

console.log('Handle:', result.handle);
console.log('Status:', result.status);
console.log('Events:', result.events);
```

### IP Address Lookup

```typescript
const ipInfo = await rdap(client, '8.8.8.8');
console.log('Network:', ipInfo);
```

### Expiration Monitoring

```typescript
async function checkDomainExpiration(domains: string[]) {
  const client = createClient();

  for (const domain of domains) {
    const result = await rdap(client, domain);
    const expiration = result.events?.find(e => e.eventAction === 'expiration');

    if (expiration) {
      const expiresAt = new Date(expiration.eventDate);
      const daysUntil = Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      if (daysUntil < 30) {
        console.warn(`${domain} expires in ${daysUntil} days!`);
      }
    }
  }
}
```

---

## WHOIS

Traditional WHOIS lookups for domains and IPs.

```typescript
const client = createClient();

// Domain lookup
const whoisData = await client.whois('example.com');
console.log(whoisData);

// Check domain availability
const available = await client.isDomainAvailable('newdomain.com');
console.log('Available:', available);

// IP lookup
const ipWhois = await client.whois('8.8.8.8');
```

---

## DNS over HTTPS (DoH)

Secure DNS resolution using HTTPS, bypassing local DNS.

```typescript
import { createClient, doh } from 'recker';

const client = createClient();

// Resolve using Cloudflare DoH
const records = await doh(client, 'example.com', 'A', {
  server: 'cloudflare' // or 'google', 'quad9'
});

console.log('A records:', records);
```

### Supported Record Types

- `A` - IPv4 addresses
- `AAAA` - IPv6 addresses
- `CNAME` - Canonical names
- `MX` - Mail servers
- `TXT` - Text records
- `NS` - Name servers

---

## User-Agent Rotation

Avoid bot detection with automatic UA rotation.

```typescript
import { createClient, userAgentRotator, browserHeaders } from 'recker';

const client = createClient({
  headers: browserHeaders('desktop'),
  plugins: [
    userAgentRotator({
      strategy: 'round-robin', // or 'random'
    })
  ]
});

// Each request has a different User-Agent
await client.get('/page1');
await client.get('/page2');
```

---

## Interface Rotator

Rotate network interfaces for distributed requests.

```typescript
import { createClient, interfaceRotator } from 'recker';

const client = createClient({
  plugins: [
    interfaceRotator({
      interfaces: ['192.168.1.10', '192.168.1.11', '192.168.1.12'],
      strategy: 'round-robin'
    })
  ]
});
```

---

## Proxy Rotation

Rotate through proxy servers.

```typescript
import { createClient, proxyRotator } from 'recker';

const client = createClient({
  plugins: [
    proxyRotator({
      proxies: [
        'http://proxy1.example.com:8080',
        'http://proxy2.example.com:8080',
        'socks5://proxy3.example.com:1080'
      ],
      strategy: 'round-robin',
      onProxyFailed: (proxy, error) => {
        console.log(`Proxy ${proxy} failed: ${error.message}`);
      }
    })
  ]
});
```

---

## Combined Security Audit

```typescript
async function fullSecurityAudit(domain: string) {
  const client = createClient();

  const [tls, dns, registration] = await Promise.all([
    inspectTLS(domain).catch(e => ({ error: e.message })),
    getSecurityRecords(domain).catch(e => ({ error: e.message })),
    rdap(client, domain).catch(e => ({ error: e.message }))
  ]);

  return {
    domain,
    tls: {
      valid: tls.valid,
      daysRemaining: tls.daysRemaining,
      protocol: tls.protocol
    },
    email: {
      spf: dns.spf?.[0] ? 'configured' : 'missing',
      dmarc: dns.dmarc ? 'configured' : 'missing'
    },
    registration: {
      status: registration.status,
      expiration: registration.events?.find(e => e.eventAction === 'expiration')
    }
  };
}
```

---

## Best Practices

1. **Cache security lookups** to avoid rate limits
2. **Handle timeouts** gracefully for TLS inspections
3. **Use RDAP over WHOIS** when possible (structured JSON)
4. **Monitor certificate expiration** proactively
5. **Rotate proxies/UAs** for scraping to avoid blocks
6. **Log security events** for audit trails

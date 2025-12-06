# Certificate Pinning Plugin

The **Certificate Pinning** plugin validates server certificates against known fingerprints to prevent man-in-the-middle (MITM) attacks. Essential for security-critical applications handling sensitive data.

## Why Certificate Pinning?

Standard TLS validation trusts any certificate signed by a trusted CA. Certificate pinning adds an extra layer by requiring the server's certificate to match known fingerprints.

```
Without Pinning (Vulnerable to MITM):
┌────────┐     ┌────────────┐     ┌────────────┐     ┌────────┐
│ Client │ ──► │  Attacker  │ ──► │   CA (any) │ ──► │ Server │
└────────┘     │ Valid Cert │     └────────────┘     └────────┘
               └────────────┘
                    ⚠️ Can intercept traffic with any valid cert

With Pinning (Protected):
┌────────┐     ┌────────────┐     ┌────────────┐
│ Client │ ──► │  Attacker  │ ─X─►│  BLOCKED   │
└────────┘     │ Wrong Pin  │     └────────────┘
               └────────────┘
                    ✓ Certificate fingerprint doesn't match
```

## Quick Start

```typescript
import { createClient, certificatePinningPlugin } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(certificatePinningPlugin({
  pins: {
    'api.example.com': {
      sha256: ['abc123def456...']  // Certificate fingerprint
    }
  }
}));
```

## Pinning Strategies

### SHA-256 Fingerprint (Recommended for Production)

Pin the exact certificate fingerprint. Most secure, but requires updating pins when certificates are renewed.

```typescript
client.use(certificatePinningPlugin({
  pins: {
    'api.example.com': {
      sha256: [
        '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'  // Backup
      ]
    }
  }
}));
```

### SPKI Pinning (Recommended for Resilience)

Pin the Subject Public Key Info. Survives certificate renewal if the key stays the same.

```typescript
client.use(certificatePinningPlugin({
  pins: {
    'api.example.com': {
      spki: ['BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=']
    }
  }
}));
```

### Issuer/CA Pinning (Broad Protection)

Pin the certificate authority. Less strict, but easier to manage.

```typescript
client.use(certificatePinningPlugin({
  pins: {
    'api.example.com': {
      issuer: 'DigiCert Inc'
    }
  }
}));
```

## Configuration

```typescript
interface CertificatePinningOptions {
  /**
   * Map of hostnames to their expected pins
   * Use '*' for wildcard matching or exact hostname
   */
  pins: Record<string, PinConfig>;

  /**
   * What to do when pin validation fails
   * - 'reject': Block the request (default)
   * - 'warn': Log warning but allow
   * - 'report': Send report to reportUri
   * @default 'reject'
   */
  onPinFailure?: 'reject' | 'warn' | 'report';

  /**
   * Report URL for pin failures
   */
  reportUri?: string;

  /**
   * Include subdomains in pinning
   * @default false
   */
  includeSubdomains?: boolean;

  /**
   * Cache validated certificates
   * @default true
   */
  cache?: boolean;

  /**
   * Cache TTL in milliseconds
   * @default 86400000 (24 hours)
   */
  cacheMaxAge?: number;

  /**
   * Custom error handler
   */
  onError?: (error: CertificatePinningError, request: ReckerRequest) => void;

  /**
   * Skip pinning for certain requests
   */
  skip?: (request: ReckerRequest) => boolean;
}
```

### Pin Configuration

```typescript
interface PinConfig {
  /**
   * SHA-256 fingerprints of the certificate
   * Multiple pins allow for rotation
   */
  sha256?: string[];

  /**
   * SHA-256 fingerprints of the Subject Public Key Info
   * More resilient to certificate renewal
   */
  spki?: string[];

  /**
   * Expected certificate issuer (CA name)
   */
  issuer?: string;

  /**
   * Expected certificate subject
   */
  subject?: string;

  /**
   * Minimum days until certificate expiration
   * Warns or fails if certificate expires soon
   */
  minValidDays?: number;

  /**
   * Allow expired certificates (DANGEROUS - testing only)
   * @default false
   */
  allowExpired?: boolean;

  /**
   * Backup pins for rotation
   */
  backup?: string[];
}
```

## Failure Strategies

### Reject (Default)

Block requests when pin validation fails:

```typescript
client.use(certificatePinningPlugin({
  pins: {
    'api.example.com': { sha256: ['...'] }
  },
  onPinFailure: 'reject'  // Default
}));

try {
  await client.get('/sensitive-data');
} catch (error) {
  if (error instanceof CertificatePinningError) {
    console.error('MITM attack detected!', error.hostname);
    console.error('Expected:', error.expectedPins);
    console.error('Received:', error.actualPin);
  }
}
```

### Warn

Log warnings but allow traffic (useful for gradual rollout):

```typescript
client.use(certificatePinningPlugin({
  pins: {
    'api.example.com': { sha256: ['...'] }
  },
  onPinFailure: 'warn'
}));
```

### Report

Send failure reports to a monitoring endpoint:

```typescript
client.use(certificatePinningPlugin({
  pins: {
    'api.example.com': { sha256: ['...'] }
  },
  onPinFailure: 'report',
  reportUri: 'https://security.example.com/pin-failure'
}));

// Report payload:
// {
//   timestamp: '2025-01-15T10:30:00Z',
//   hostname: 'api.example.com',
//   expectedPins: ['abc123...'],
//   actualPin: 'xyz789...',
//   certificate: { subject, issuer, validFrom, validTo }
// }
```

## Wildcard Matching

### Exact Domain

```typescript
pins: {
  'api.example.com': { sha256: ['...'] }
}
// Matches: api.example.com
// Does NOT match: www.api.example.com
```

### Wildcard Subdomain

```typescript
pins: {
  '*.example.com': { sha256: ['...'] }
}
// Matches: api.example.com, www.example.com
// Matches: example.com (base domain)
```

### Include Subdomains

```typescript
client.use(certificatePinningPlugin({
  pins: {
    'example.com': { sha256: ['...'] }
  },
  includeSubdomains: true
}));
// Matches: example.com, api.example.com, sub.api.example.com
```

### Global Wildcard

```typescript
pins: {
  '*': { issuer: 'DigiCert Inc' }  // All hosts must use DigiCert
}
```

## Certificate Rotation

Always include backup pins to handle certificate rotation:

```typescript
client.use(certificatePinningPlugin({
  pins: {
    'api.example.com': {
      sha256: [
        'current_cert_fingerprint',
        'next_cert_fingerprint'  // Deploy before rotation
      ],
      backup: [
        'emergency_backup_fingerprint'
      ]
    }
  }
}));
```

### Expiration Warning

Get early warning before certificates expire:

```typescript
client.use(certificatePinningPlugin({
  pins: {
    'api.example.com': {
      sha256: ['...'],
      minValidDays: 30  // Fail if < 30 days remaining
    }
  },
  onPinFailure: 'warn'  // Warn instead of blocking
}));
```

## Generating Pins

### From Live Host

Use the helper function to generate pins from a running server:

```typescript
import { generatePinsFromHost } from 'recker';

const pins = await generatePinsFromHost('api.example.com');
console.log(pins);
// { sha256: '9f86d08...', spki: 'BBBBB...' }
```

### From Certificate File

```bash
# SHA-256 fingerprint
openssl x509 -in cert.pem -noout -fingerprint -sha256

# SPKI fingerprint
openssl x509 -in cert.pem -pubkey -noout | \
  openssl pkey -pubin -outform der | \
  openssl dgst -sha256 -binary | \
  base64
```

### Preload Multiple Hosts

Warm up the cache at application startup:

```typescript
import { preloadPins } from 'recker';

const pins = await preloadPins([
  'api.example.com',
  'auth.example.com:443',
  'cdn.example.com'
]);

console.log(pins);
// Map {
//   'api.example.com' => { sha256: '...', spki: '...' },
//   'auth.example.com:443' => { sha256: '...', spki: '...' },
//   'cdn.example.com' => { sha256: '...', spki: '...' }
// }
```

## Skipping Certain Requests

```typescript
client.use(certificatePinningPlugin({
  pins: {
    '*.example.com': { sha256: ['...'] }
  },
  skip: (request) => {
    const url = new URL(request.url);
    // Skip localhost
    if (url.hostname === 'localhost') return true;
    // Skip development
    if (url.hostname.endsWith('.local')) return true;
    // Skip health checks
    if (url.pathname === '/health') return true;
    return false;
  }
}));
```

## Cache Management

### Clear Cache

```typescript
import { clearPinCache } from 'recker';

clearPinCache();
```

### Get Cache Stats

```typescript
import { getPinCacheStats } from 'recker';

const stats = getPinCacheStats();
console.log(stats);
// { size: 5, entries: ['api.example.com:443', ...] }
```

## Common Patterns

### Banking/Financial APIs

Maximum security with multiple validation layers:

```typescript
client.use(certificatePinningPlugin({
  pins: {
    'api.bank.com': {
      sha256: ['primary_fingerprint', 'backup_fingerprint'],
      spki: ['primary_spki'],  // Double validation
      issuer: 'DigiCert',      // Must be from DigiCert
      minValidDays: 60         // Warn 60 days before expiry
    }
  },
  onPinFailure: 'reject',
  includeSubdomains: true
}));
```

### Mobile App Backend

Report-and-reject for monitoring:

```typescript
client.use(certificatePinningPlugin({
  pins: {
    'api.myapp.com': { sha256: ['...'] }
  },
  onPinFailure: 'reject',
  reportUri: 'https://security.myapp.com/pin-violations',
  onError: (error, request) => {
    // Custom alerting
    alertSecurityTeam({
      type: 'PIN_FAILURE',
      hostname: error.hostname,
      userAgent: request.headers.get('User-Agent')
    });
  }
}));
```

### Gradual Rollout

Start with warnings before enforcing:

```typescript
// Phase 1: Monitor
client.use(certificatePinningPlugin({
  pins: { 'api.example.com': { sha256: ['...'] } },
  onPinFailure: 'report',
  reportUri: 'https://metrics.example.com/pins'
}));

// Phase 2: Enforce (after confirming no false positives)
client.use(certificatePinningPlugin({
  pins: { 'api.example.com': { sha256: ['...'] } },
  onPinFailure: 'reject'
}));
```

## Error Handling

```typescript
import {
  certificatePinningPlugin,
  CertificatePinningError
} from 'recker';

client.use(certificatePinningPlugin({
  pins: { 'api.example.com': { sha256: ['...'] } }
}));

try {
  await client.get('/api/data');
} catch (error) {
  if (error instanceof CertificatePinningError) {
    console.log('Pin validation failed');
    console.log('Hostname:', error.hostname);
    console.log('Expected pins:', error.expectedPins);
    console.log('Actual pin:', error.actualPin);
    console.log('Certificate:', error.certificate);

    // Certificate info includes:
    // - subject, issuer
    // - validFrom, validTo
    // - fingerprint, fingerprintSha256
    // - serialNumber
  }
}
```

## Security Best Practices

### DO

1. **Use multiple pins** - Always have backup pins for rotation
2. **Use SPKI pins** - More resilient to certificate renewal
3. **Monitor pin failures** - Use `reportUri` to catch issues
4. **Test in staging** - Validate pins before production
5. **Document rotation process** - Keep runbooks updated
6. **Set expiration warnings** - Use `minValidDays`

### DON'T

1. **Don't pin root CAs** - Pin leaf or intermediate certs
2. **Don't use `allowExpired`** - Only for testing
3. **Don't skip validation in production** - Keep `skip` minimal
4. **Don't ignore pin failures** - They may indicate attacks
5. **Don't hardcode single pins** - Always have backups

## API Reference

### `certificatePinningPlugin(options: CertificatePinningOptions): Plugin`

Creates a certificate pinning middleware.

### `generatePinsFromHost(hostname: string, port?: number): Promise<{ sha256: string; spki?: string }>`

Generate pin fingerprints from a live server.

### `preloadPins(hosts: string[]): Promise<Map<string, { sha256: string; spki?: string }>>`

Generate pins for multiple hosts in parallel.

### `clearPinCache(): void`

Clear the pin validation cache.

### `getPinCacheStats(): { size: number; entries: string[] }`

Get cache statistics.

### `CertificatePinningError`

Error thrown when pin validation fails.

```typescript
class CertificatePinningError extends Error {
  hostname: string;
  expectedPins: string[];
  actualPin?: string;
  certificate?: CertificateInfo;
}
```

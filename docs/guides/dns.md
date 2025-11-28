# Custom DNS

> Override DNS resolution and use custom DNS servers

Recker allows you to customize DNS resolution for your HTTP requests. This is useful for testing, development, bypassing DNS issues, or using specific DNS providers like Google DNS or Cloudflare DNS.

## Quick Start

```typescript
import { createClient } from 'recker';

// DNS Override - map hostnames to IPs
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    override: {
      'api.example.com': '1.2.3.4'
    }
  }
});

// Custom DNS Servers - use Google DNS and Cloudflare DNS
const client2 = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    servers: ['8.8.8.8', '1.1.1.1']
  }
});
```

## DNS Override

Map hostnames directly to IP addresses, bypassing DNS resolution entirely.

### Basic Override

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    override: {
      'api.example.com': '93.184.216.34'
    }
  }
});

// Requests to api.example.com will go to 93.184.216.34
const response = await client.get('/users');
```

### Multiple Hosts

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    override: {
      'api.example.com': '1.2.3.4',
      'cdn.example.com': '5.6.7.8',
      'assets.example.com': '9.10.11.12'
    }
  }
});
```

### IPv6 Addresses

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    override: {
      'api.example.com': '2001:db8::1'
    }
  }
});
```

## Custom DNS Servers

Use specific DNS servers for resolution instead of system DNS.

### Popular DNS Providers

```typescript
// Google DNS
const client1 = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    servers: ['8.8.8.8', '8.8.4.4']
  }
});

// Cloudflare DNS
const client2 = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    servers: ['1.1.1.1', '1.0.0.1']
  }
});

// OpenDNS
const client3 = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    servers: ['208.67.222.222', '208.67.220.220']
  }
});

// Quad9
const client4 = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    servers: ['9.9.9.9', '149.112.112.112']
  }
});
```

### Multiple Servers (Fallback)

Servers are tried in order. If one fails, the next is used:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    servers: [
      '8.8.8.8',      // Try Google DNS first
      '1.1.1.1',      // Then Cloudflare
      '208.67.222.222' // Then OpenDNS
    ]
  }
});
```

## Configuration Options

```typescript
interface DNSOptions {
  /** DNS hostname to IP override mapping */
  override?: Record<string, string>;

  /** Custom DNS servers to use for resolution */
  servers?: string[];

  /** DNS lookup timeout in milliseconds (default: 5000) */
  timeout?: number;

  /** Prefer IPv4 over IPv6 (default: true) */
  preferIPv4?: boolean;
}
```

### Complete Configuration

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    override: {
      'api.example.com': '1.2.3.4'
    },
    servers: ['8.8.8.8', '1.1.1.1'],
    timeout: 10000,      // 10 second timeout
    preferIPv4: true     // Prefer IPv4 addresses
  }
});
```

## Priority Order

When multiple DNS options are configured, they are applied in this order:

1. **DNS Override** - Direct hostname → IP mapping (highest priority)
2. **Custom DNS Servers** - Use specified DNS servers
3. **System DNS** - Fall back to system DNS (lowest priority)

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    // 1. Override takes priority
    override: {
      'api.example.com': '1.2.3.4'
    },
    // 2. Then custom servers (for other hosts)
    servers: ['8.8.8.8']
    // 3. System DNS used as fallback
  }
});

// api.example.com → 1.2.3.4 (override)
// cdn.example.com → resolved via 8.8.8.8 (custom server)
// other-domain.com → resolved via system DNS (fallback)
```

## Use Cases

### Testing Against Localhost

Redirect production API to local development server:

```typescript
const client = createClient({
  baseUrl: 'https://production-api.com',
  dns: {
    override: {
      'production-api.com': '127.0.0.1'
    }
  }
});

// Requests go to localhost instead of production
const response = await client.get('/api/test');
```

### Staging Environment

Test against staging servers without changing URLs:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    override: {
      'api.example.com': '10.0.0.50'  // Staging server IP
    }
  }
});
```

### Load Balancer Testing

Test specific backend servers behind a load balancer:

```typescript
// Test backend server 1
const client1 = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    override: { 'api.example.com': '10.0.0.10' }
  }
});

// Test backend server 2
const client2 = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    override: { 'api.example.com': '10.0.0.11' }
  }
});
```

### Bypass DNS Issues

Use reliable DNS servers when system DNS is unreliable:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    servers: ['8.8.8.8', '1.1.1.1'],  // Always use Google/Cloudflare
    timeout: 3000
  }
});
```

### Development with /etc/hosts Alternative

Instead of editing `/etc/hosts`, configure DNS per-client:

```typescript
// Development
const devClient = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    override: {
      'api.example.com': 'localhost',
      'cdn.example.com': 'localhost'
    }
  }
});

// Production
const prodClient = createClient({
  baseUrl: 'https://api.example.com'
  // Uses real DNS
});
```

### A/B Testing

Test different server configurations:

```typescript
async function testServer(ip: string, name: string) {
  const client = createClient({
    baseUrl: 'https://api.example.com',
    dns: {
      override: { 'api.example.com': ip }
    }
  });

  const start = Date.now();
  await client.get('/health');
  const duration = Date.now() - start;

  console.log(`${name} (${ip}): ${duration}ms`);
}

// Test different servers
await testServer('1.2.3.4', 'US East');
await testServer('5.6.7.8', 'EU West');
await testServer('9.10.11.12', 'Asia Pacific');
```

## Complete Examples

### Multi-Environment Configuration

```typescript
type Environment = 'local' | 'dev' | 'staging' | 'production';

function createAPIClient(env: Environment) {
  const config: { baseUrl: string; dns?: DNSOptions } = {
    baseUrl: 'https://api.example.com'
  };

  switch (env) {
    case 'local':
      config.dns = {
        override: { 'api.example.com': '127.0.0.1' }
      };
      break;

    case 'dev':
      config.dns = {
        override: { 'api.example.com': '10.0.0.50' }
      };
      break;

    case 'staging':
      config.dns = {
        override: { 'api.example.com': '10.0.0.100' }
      };
      break;

    case 'production':
      // Use real DNS with reliable servers
      config.dns = {
        servers: ['8.8.8.8', '1.1.1.1'],
        timeout: 5000
      };
      break;
  }

  return createClient(config);
}

// Use in different environments
const localAPI = createAPIClient('local');
const prodAPI = createAPIClient('production');
```

### DNS Benchmarking

```typescript
async function benchmarkDNS(domain: string) {
  const providers = [
    { name: 'System DNS', servers: undefined },
    { name: 'Google DNS', servers: ['8.8.8.8'] },
    { name: 'Cloudflare DNS', servers: ['1.1.1.1'] },
    { name: 'OpenDNS', servers: ['208.67.222.222'] },
    { name: 'Quad9', servers: ['9.9.9.9'] }
  ];

  for (const provider of providers) {
    const client = createClient({
      baseUrl: `https://${domain}`,
      dns: provider.servers ? { servers: provider.servers } : undefined
    });

    const start = Date.now();
    try {
      await client.get('/');
      const duration = Date.now() - start;
      console.log(`${provider.name}: ${duration}ms`);
    } catch (error) {
      console.log(`${provider.name}: Failed`);
    }
  }
}

await benchmarkDNS('example.com');
```

### Internal Network Resolution

```typescript
// Corporate network with internal DNS
const internalClient = createClient({
  baseUrl: 'https://internal-api.company.local',
  dns: {
    servers: ['10.0.0.1', '10.0.0.2'],  // Internal DNS servers
    timeout: 10000
  }
});

// Mix internal and external
const mixedClient = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    override: {
      'internal-service.local': '10.0.0.50'
    },
    servers: ['10.0.0.1'],  // Internal DNS for .local
    timeout: 5000
  }
});
```

### Canary Deployment Testing

```typescript
async function testCanary() {
  // Current version
  const stableClient = createClient({
    baseUrl: 'https://api.example.com'
    // Uses load balancer
  });

  // Canary version
  const canaryClient = createClient({
    baseUrl: 'https://api.example.com',
    dns: {
      override: {
        'api.example.com': '10.0.0.99'  // Canary server
      }
    }
  });

  // Compare responses
  const [stableRes, canaryRes] = await Promise.all([
    stableClient.get('/api/data').json(),
    canaryClient.get('/api/data').json()
  ]);

  console.log('Stable:', stableRes);
  console.log('Canary:', canaryRes);

  // Validate canary matches stable
  if (JSON.stringify(stableRes) === JSON.stringify(canaryRes)) {
    console.log('✓ Canary validation passed');
  } else {
    console.log('✗ Canary responses differ from stable');
  }
}
```

## IPv4 vs IPv6

Control IP version preference:

```typescript
// Prefer IPv4 (default)
const client1 = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    servers: ['8.8.8.8'],
    preferIPv4: true
  }
});

// Prefer IPv6
const client2 = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    servers: ['2001:4860:4860::8888'],  // Google IPv6 DNS
    preferIPv4: false
  }
});
```

## Timeout Handling

### Configure Timeout

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    servers: ['8.8.8.8'],
    timeout: 3000  // 3 second DNS timeout
  }
});
```

### System DNS Fallback

If custom DNS servers fail or timeout, Recker falls back to system DNS:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    servers: ['192.0.2.1'],  // Unreachable server
    timeout: 1000
  }
});

// After timeout, falls back to system DNS
const response = await client.get('/data');
```

## Combining with Proxy

DNS is resolved before proxy connection:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    override: { 'api.example.com': '1.2.3.4' }
  },
  proxy: {
    url: 'http://proxy.company.com:8080'
  }
});

// Flow:
// 1. Resolve api.example.com → 1.2.3.4 (DNS override)
// 2. Connect to proxy
// 3. Request 1.2.3.4 through proxy
```

## Error Handling

### DNS Lookup Failures

```typescript
try {
  const client = createClient({
    baseUrl: 'https://api.example.com',
    dns: {
      servers: ['192.0.2.1'],  // Invalid server
      timeout: 1000
    }
  });

  await client.get('/data');
} catch (error) {
  if (error.message.includes('DNS')) {
    console.error('DNS lookup failed');
    // Fall back to different configuration
  }
}
```

### Timeout Errors

DNS timeout errors are handled gracefully with system DNS fallback.

## Best Practices

### 1. Use Reliable DNS Servers

```typescript
const client = createClient({
  dns: {
    servers: [
      '8.8.8.8',    // Google primary
      '8.8.4.4',    // Google secondary
      '1.1.1.1'     // Cloudflare fallback
    ]
  }
});
```

### 2. Set Reasonable Timeouts

```typescript
const client = createClient({
  dns: {
    servers: ['8.8.8.8'],
    timeout: 5000  // 5 seconds is reasonable
  }
});
```

### 3. Use Override for Testing

```typescript
// Don't use in production
if (process.env.NODE_ENV !== 'production') {
  config.dns = {
    override: { 'api.example.com': 'localhost' }
  };
}
```

### 4. Document Custom DNS Usage

```typescript
/**
 * API client configured for internal network.
 * Uses company DNS servers (10.0.0.1, 10.0.0.2).
 */
const internalAPI = createClient({
  dns: {
    servers: ['10.0.0.1', '10.0.0.2']
  }
});
```

## Troubleshooting

### DNS Not Working

Check if your DNS configuration is correct:

```typescript
// Test DNS directly
import { customDNSLookup } from 'recker';

const result = await customDNSLookup('example.com', {
  servers: ['8.8.8.8']
});

console.log('Resolved to:', result.address);
```

### Slow DNS Resolution

Increase timeout or use different servers:

```typescript
const client = createClient({
  dns: {
    servers: ['1.1.1.1'],  // Try faster DNS
    timeout: 10000
  }
});
```

### IPv6 Issues

Force IPv4 if IPv6 is causing problems:

```typescript
const client = createClient({
  dns: {
    preferIPv4: true
  }
});
```

## API Reference

### DNSOptions

```typescript
interface DNSOptions {
  override?: Record<string, string>;
  servers?: string[];
  timeout?: number;
  preferIPv4?: boolean;
}
```

### DNS Lookup Function

```typescript
function customDNSLookup(
  hostname: string,
  options?: DNSOptions
): Promise<DNSResult>;

interface DNSResult {
  address: string;
  family: 4 | 6;
}
```

## See Also

- [Client Configuration](client-config.md) - Client setup
- [Proxy Configuration](client-config.md#proxy--tls) - Proxy settings
- [WHOIS](whois.md) - Domain information lookup

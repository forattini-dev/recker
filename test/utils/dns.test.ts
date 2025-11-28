import { describe, it, expect } from 'vitest';
import { customDNSLookup, createLookupFunction } from '../../src/utils/dns.js';
import { createClient } from '../../src/core/client.js';

describe('Custom DNS', () => {
  describe('DNS Override', () => {
    it('should override DNS resolution for specified hostnames', async () => {
      const result = await customDNSLookup('example.com', {
        override: {
          'example.com': '1.2.3.4'
        }
      });

      expect(result.address).toBe('1.2.3.4');
      expect(result.family).toBe(4);
    });

    it('should detect IPv6 addresses in override', async () => {
      const result = await customDNSLookup('example.com', {
        override: {
          'example.com': '2001:db8::1'
        }
      });

      expect(result.address).toBe('2001:db8::1');
      expect(result.family).toBe(6);
    });

    it('should fall back to system DNS if hostname not in override', async () => {
      const result = await customDNSLookup('google.com', {
        override: {
          'example.com': '1.2.3.4'
        }
      });

      // Should resolve google.com normally
      expect(result.address).toBeDefined();
      expect(result.address).not.toBe('1.2.3.4');
    }, 10000);
  });

  describe('Custom DNS Servers', () => {
    it('should use custom DNS servers for resolution', async () => {
      const result = await customDNSLookup('google.com', {
        servers: ['8.8.8.8', '1.1.1.1']
      });

      expect(result.address).toBeDefined();
      expect(typeof result.address).toBe('string');
      expect([4, 6]).toContain(result.family);
    }, 10000);

    it('should respect preferIPv4 option', async () => {
      const result = await customDNSLookup('google.com', {
        servers: ['8.8.8.8'],
        preferIPv4: true
      });

      expect(result.family).toBe(4);
    }, 10000);

    it('should fallback to system DNS if custom server is unreachable', async () => {
      // When custom DNS servers fail, it should fall back to system DNS
      const result = await customDNSLookup('google.com', {
        servers: ['192.0.2.1'], // TEST-NET-1, should be unreachable
        timeout: 1000
      });

      // Should resolve via system DNS fallback
      expect(result.address).toBeDefined();
      expect([4, 6]).toContain(result.family);
    }, 15000);
  });

  describe('Integration with Client', () => {
    it('should create client with DNS override', () => {
      const client = createClient({
        baseUrl: 'https://api.example.com',
        dns: {
          override: {
            'api.example.com': '1.2.3.4'
          }
        }
      });

      expect(client).toBeDefined();
    });

    it('should create client with custom DNS servers', () => {
      const client = createClient({
        baseUrl: 'https://api.example.com',
        dns: {
          servers: ['8.8.8.8', '1.1.1.1']
        }
      });

      expect(client).toBeDefined();
    });

    it('should create client with both override and custom servers', () => {
      const client = createClient({
        baseUrl: 'https://api.example.com',
        dns: {
          override: {
            'api.example.com': '1.2.3.4'
          },
          servers: ['8.8.8.8']
        }
      });

      expect(client).toBeDefined();
    });
  });

  describe('Lookup Function Creation', () => {
    it('should create a lookup function with DNS override', async () => {
      const lookupFn = createLookupFunction({
        override: {
          'example.com': '1.2.3.4'
        }
      });

      const result = await new Promise<{ err: Error | null, address: string, family: number }>((resolve) => {
        lookupFn('example.com', {}, (err, address, family) => {
          resolve({ err, address, family });
        });
      });

      expect(result.err).toBeNull();
      expect(result.address).toBe('1.2.3.4');
      expect(result.family).toBe(4);
    });

    it('should handle lookup errors gracefully', async () => {
      const lookupFn = createLookupFunction({
        servers: ['192.0.2.1'], // Unreachable
        timeout: 500
      });

      const result = await new Promise<{ err: Error | null }>((resolve) => {
        lookupFn('example.com', {}, (err, address, family) => {
          resolve({ err });
        });
      });

      // Should fallback to system DNS, so no error expected
      expect(result.err).toBeNull();
    }, 10000);
  });

  describe('System DNS fallback', () => {
    it('should fall back to system DNS when no options provided', async () => {
      const result = await customDNSLookup('google.com');

      expect(result.address).toBeDefined();
      expect([4, 6]).toContain(result.family);
    }, 10000);

    it('should fall back to system DNS when custom servers fail', async () => {
      const result = await customDNSLookup('google.com', {
        servers: ['192.0.2.1', '192.0.2.2'], // Both unreachable
        timeout: 500
      });

      // Should still resolve via system DNS fallback
      expect(result.address).toBeDefined();
    }, 15000);
  });
});

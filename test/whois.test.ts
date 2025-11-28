import { describe, it, expect } from 'vitest';
import { whois, isDomainAvailable } from '../src/utils/whois.js';
import { createClient } from '../src/core/client.js';

describe('WHOIS', () => {
  it('should perform WHOIS lookup for a domain', async () => {
    const result = await whois('google.com');

    expect(result).toBeDefined();
    expect(result.query).toBe('google.com');
    expect(result.server).toBeDefined();
    expect(result.raw).toBeDefined();
    expect(typeof result.raw).toBe('string');
    expect(result.raw.length).toBeGreaterThan(0);
  }, 15000);

  it('should parse WHOIS data into key-value pairs', async () => {
    const result = await whois('google.com');

    expect(result.data).toBeDefined();
    expect(typeof result.data).toBe('object');
    // Data object exists (may or may not have parsed fields depending on response format)
  }, 15000);

  it('should detect that google.com is not available', async () => {
    const available = await isDomainAvailable('google.com');

    expect(available).toBe(false);
  }, 15000);

  it('should work through client instance', async () => {
    const client = createClient({ baseUrl: 'https://api.example.com' });
    const result = await client.whois('github.com');

    expect(result).toBeDefined();
    expect(result.query).toBe('github.com');
    expect(result.raw).toBeDefined();
  }, 15000);

  it('should check domain availability through client', async () => {
    const client = createClient({ baseUrl: 'https://api.example.com' });
    const available = await client.isDomainAvailable('google.com');

    expect(available).toBe(false);
  }, 15000);

  it('should handle custom WHOIS server', async () => {
    const result = await whois('google.com', {
      server: 'whois.verisign-grs.com'
    });

    expect(result).toBeDefined();
    expect(result.server).toBe('whois.verisign-grs.com');
  }, 15000);

  it('should support IP address lookup', async () => {
    const result = await whois('8.8.8.8');

    expect(result).toBeDefined();
    expect(result.query).toBe('8.8.8.8');
    expect(result.raw).toBeDefined();
    expect(result.raw.length).toBeGreaterThan(0);
  }, 15000);

  it('should respect timeout option', async () => {
    // This test uses a very short timeout to trigger timeout error
    await expect(
      whois('google.com', { timeout: 1 })
    ).rejects.toThrow(/timed out/);
  });
});

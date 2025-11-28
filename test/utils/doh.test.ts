import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDoHLookup } from '../../src/utils/doh.js';

// Mock undici request
vi.mock('undici', () => ({
  request: vi.fn()
}));

import { request } from 'undici';

describe('DoH Utils', () => {
  const mockedRequest = vi.mocked(request);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createDoHLookup', () => {
    it('should create lookup function with cloudflare provider', () => {
      const lookup = createDoHLookup('cloudflare');
      expect(typeof lookup).toBe('function');
    });

    it('should create lookup function with google provider', () => {
      const lookup = createDoHLookup('google');
      expect(typeof lookup).toBe('function');
    });

    it('should create lookup function with quad9 provider', () => {
      const lookup = createDoHLookup('quad9');
      expect(typeof lookup).toBe('function');
    });

    it('should create lookup function with custom URL', () => {
      const lookup = createDoHLookup('https://custom-doh.example.com/dns-query');
      expect(typeof lookup).toBe('function');
    });

    it('should use cloudflare as default', () => {
      const lookup = createDoHLookup();
      expect(typeof lookup).toBe('function');
    });

    it('should resolve hostname to IP', async () => {
      mockedRequest.mockResolvedValueOnce({
        statusCode: 200,
        body: {
          json: async () => ({
            Status: 0,
            Answer: [
              { name: 'example.com', type: 1, TTL: 300, data: '93.184.216.34' }
            ]
          })
        }
      } as any);

      const lookup = createDoHLookup('cloudflare');

      await new Promise<void>((resolve, reject) => {
        lookup('example.com', {}, (err, address, family) => {
          try {
            expect(err).toBeNull();
            expect(address).toBe('93.184.216.34');
            expect(family).toBe(4);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    });

    it('should return error for non-200 status', async () => {
      mockedRequest.mockResolvedValueOnce({
        statusCode: 500,
        body: {
          json: async () => ({})
        }
      } as any);

      const lookup = createDoHLookup('cloudflare');

      await expect(new Promise((resolve, reject) => {
        lookup('example.com', {}, (err, address, family) => {
          if (err) reject(err);
          else resolve({ address, family });
        });
      })).rejects.toThrow('DoH request failed');
    });

    it('should return error for DNS lookup failure', async () => {
      mockedRequest.mockResolvedValueOnce({
        statusCode: 200,
        body: {
          json: async () => ({
            Status: 2, // SERVFAIL
            Answer: []
          })
        }
      } as any);

      const lookup = createDoHLookup('cloudflare');

      await new Promise<void>((resolve, reject) => {
        lookup('example.com', {}, (err, address, family) => {
          try {
            expect(err).not.toBeNull();
            expect(err?.message).toContain('DNS lookup failed');
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    });

    it('should return error for no A record', async () => {
      mockedRequest.mockResolvedValueOnce({
        statusCode: 200,
        body: {
          json: async () => ({
            Status: 0,
            Answer: [
              { name: 'example.com', type: 28, TTL: 300, data: '2001:db8::1' } // AAAA record
            ]
          })
        }
      } as any);

      const lookup = createDoHLookup('cloudflare');

      await new Promise<void>((resolve, reject) => {
        lookup('example.com', {}, (err, address, family) => {
          try {
            expect(err).not.toBeNull();
            expect(err?.message).toContain('No A record found');
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    });

    it('should return error for empty Answer array', async () => {
      mockedRequest.mockResolvedValueOnce({
        statusCode: 200,
        body: {
          json: async () => ({
            Status: 0,
            Answer: []
          })
        }
      } as any);

      const lookup = createDoHLookup('cloudflare');

      await new Promise<void>((resolve, reject) => {
        lookup('example.com', {}, (err, address, family) => {
          try {
            expect(err).not.toBeNull();
            expect(err?.message).toContain('DNS lookup failed');
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    });

    it('should return error for no Answer property', async () => {
      mockedRequest.mockResolvedValueOnce({
        statusCode: 200,
        body: {
          json: async () => ({
            Status: 0
            // No Answer property
          })
        }
      } as any);

      const lookup = createDoHLookup('cloudflare');

      await new Promise<void>((resolve, reject) => {
        lookup('example.com', {}, (err, address, family) => {
          try {
            expect(err).not.toBeNull();
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    });

    it('should handle network errors', async () => {
      mockedRequest.mockRejectedValueOnce(new Error('Network error'));

      const lookup = createDoHLookup('cloudflare');

      await new Promise<void>((resolve, reject) => {
        lookup('example.com', {}, (err, address, family) => {
          try {
            expect(err).not.toBeNull();
            expect(err?.message).toBe('Network error');
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    });

    it('should send correct headers', async () => {
      mockedRequest.mockResolvedValueOnce({
        statusCode: 200,
        body: {
          json: async () => ({
            Status: 0,
            Answer: [
              { name: 'example.com', type: 1, TTL: 300, data: '93.184.216.34' }
            ]
          })
        }
      } as any);

      const lookup = createDoHLookup('cloudflare');

      await new Promise<void>((resolve, reject) => {
        lookup('example.com', {}, (err, address, family) => {
          try {
            expect(mockedRequest).toHaveBeenCalledWith(
              expect.any(URL),
              expect.objectContaining({
                method: 'GET',
                headers: { 'Accept': 'application/dns-json' }
              })
            );
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    });

    it('should set correct query parameters', async () => {
      mockedRequest.mockResolvedValueOnce({
        statusCode: 200,
        body: {
          json: async () => ({
            Status: 0,
            Answer: [
              { name: 'test.example.com', type: 1, TTL: 300, data: '1.2.3.4' }
            ]
          })
        }
      } as any);

      const lookup = createDoHLookup('cloudflare');

      await new Promise<void>((resolve, reject) => {
        lookup('test.example.com', {}, (err, address, family) => {
          try {
            const call = mockedRequest.mock.calls[0];
            const url = call[0] as URL;
            expect(url.searchParams.get('name')).toBe('test.example.com');
            expect(url.searchParams.get('type')).toBe('A');
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    });
  });
});

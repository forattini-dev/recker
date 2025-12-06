import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rdap, supportsRDAP, getNoRDAPTLDs } from '../../src/utils/rdap.js';
import { createClient } from '../../src/core/client.js';
import { UnsupportedError } from '../../src/core/errors.js';
import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http';

describe('RDAP Utils', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    return new Promise<void>((resolve) => {
      server = createServer((req: IncomingMessage, res: ServerResponse) => {
        // Mock RDAP responses
        if (req.url?.includes('domain/example.com')) {
          res.writeHead(200, { 'Content-Type': 'application/rdap+json' });
          res.end(JSON.stringify({
            objectClassName: 'domain',
            handle: 'EXAMPLE-COM',
            ldhName: 'example.com',
            status: ['active'],
            events: [
              { eventAction: 'registration', eventDate: '1995-08-14T04:00:00Z' },
              { eventAction: 'last changed', eventDate: '2020-01-01T00:00:00Z' }
            ],
            entities: [
              {
                handle: 'REGISTRANT-1',
                roles: ['registrant'],
                vcardArray: ['vcard', []]
              }
            ]
          }));
        } else if (req.url?.includes('registry/ip/8.8.8.8')) {
          res.writeHead(200, { 'Content-Type': 'application/rdap+json' });
          res.end(JSON.stringify({
            objectClassName: 'ip network',
            handle: 'GOOGLE-IPV4-1',
            name: 'GOOGLE',
            status: ['active'],
            startAddress: '8.0.0.0',
            endAddress: '8.255.255.255'
          }));
        } else if (req.url?.includes('notfound')) {
          res.writeHead(404, { 'Content-Type': 'application/rdap+json' });
          res.end(JSON.stringify({
            errorCode: 404,
            title: 'Not Found',
            description: ['Resource not found']
          }));
        } else if (req.url?.includes('domain/test.io')) {
          res.writeHead(200, { 'Content-Type': 'application/rdap+json' });
          res.end(JSON.stringify({
            objectClassName: 'domain',
            handle: 'TEST-IO',
            ldhName: 'test.io',
            status: ['active']
          }));
        } else if (req.url?.includes('domain/test.org')) {
          res.writeHead(200, { 'Content-Type': 'application/rdap+json' });
          res.end(JSON.stringify({
            objectClassName: 'domain',
            handle: 'TEST-ORG',
            ldhName: 'test.org',
            status: ['active']
          }));
        } else if (req.url?.includes('domain/test.net')) {
          res.writeHead(200, { 'Content-Type': 'application/rdap+json' });
          res.end(JSON.stringify({
            objectClassName: 'domain',
            handle: 'TEST-NET',
            ldhName: 'test.net',
            status: ['active']
          }));
        } else if (req.url?.includes('domain/test.br')) {
          res.writeHead(200, { 'Content-Type': 'application/rdap+json' });
          res.end(JSON.stringify({
            objectClassName: 'domain',
            handle: 'TEST-BR',
            ldhName: 'test.br',
            status: ['active']
          }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });

      server.listen(0, () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(() => {
    server.close();
  });

  describe('rdap', () => {
    it('should query domain RDAP info', async () => {
      // Create a mock transport that forwards to our test server
      const client = createClient({
        transport: {
          dispatch: async (req) => {
            // Rewrite the URL to our test server
            const newUrl = req.url.replace(/https?:\/\/[^\/]+/, baseUrl);
            const response = await fetch(newUrl);
            return {
              ok: response.ok,
              status: response.status,
              statusText: response.statusText,
              headers: new Headers(response.headers),
              json: () => response.json(),
              text: () => response.text(),
              blob: () => response.blob(),
              read: () => null,
              timings: {},
              connection: {},
              url: newUrl
            } as any;
          }
        }
      });

      const result = await rdap(client, 'example.com');

      expect(result.handle).toBe('EXAMPLE-COM');
      expect(result.status).toContain('active');
      expect(result.events).toHaveLength(2);
      expect(result.entities).toHaveLength(1);
    });

    it('should query IP RDAP info', async () => {
      const client = createClient({
        transport: {
          dispatch: async (req) => {
            const newUrl = req.url.replace(/https?:\/\/[^\/]+/, baseUrl);
            const response = await fetch(newUrl);
            return {
              ok: response.ok,
              status: response.status,
              statusText: response.statusText,
              headers: new Headers(response.headers),
              json: () => response.json(),
              text: () => response.text(),
              blob: () => response.blob(),
              read: () => null,
              timings: {},
              connection: {},
              url: newUrl
            } as any;
          }
        }
      });

      const result = await rdap(client, '8.8.8.8');

      expect(result.handle).toBe('GOOGLE-IPV4-1');
      expect(result.name).toBe('GOOGLE');
    });

    it('should throw error for not found domain', async () => {
      const client = createClient({
        transport: {
          dispatch: async (req) => {
            const newUrl = req.url.replace(/https?:\/\/[^\/]+/, baseUrl);
            const url = new URL(newUrl);
            url.pathname = url.pathname.replace(/[^\/]+$/, 'notfound');
            const response = await fetch(url.toString());
            const error: any = new Error('Request failed');
            error.status = response.status;
            throw error;
          }
        }
      });

      await expect(rdap(client, 'notfound.com')).rejects.toThrow('RDAP entry not found');
    });

    it('should rethrow non-404 errors', async () => {
      const client = createClient({
        transport: {
          dispatch: async () => {
            const error: any = new Error('Server Error');
            error.status = 500;
            throw error;
          }
        }
      });

      await expect(rdap(client, 'example.com')).rejects.toThrow('Server Error');
    });

    it('should throw UnsupportedError for .io TLD', async () => {
      const client = createClient({
        transport: {
          dispatch: async () => {
            throw new Error('Should not reach transport');
          }
        }
      });

      await expect(rdap(client, 'test.io')).rejects.toThrow(UnsupportedError);
      await expect(rdap(client, 'test.io')).rejects.toThrow('RDAP is not available for .io domains');
    });

    it('should handle .dev TLD (Google registry)', async () => {
      const client = createClient({
        transport: {
          dispatch: async (req) => {
            // Verify URL format is correct
            expect(req.url).toContain('/domain/test.dev');
            expect(req.url).not.toContain('/domain/domain/');
            const newUrl = req.url.replace(/https?:\/\/[^\/]+/, baseUrl);
            const response = await fetch(newUrl);
            return {
              ok: response.ok,
              status: response.status,
              statusText: response.statusText,
              headers: new Headers(response.headers),
              json: () => response.json(),
              text: () => response.text(),
              blob: () => response.blob(),
              read: () => null,
              timings: {},
              connection: {},
              url: newUrl
            } as any;
          }
        }
      });

      // This will try to hit our mock server (404) but the URL format should be correct
      await expect(rdap(client, 'test.dev')).rejects.toThrow();
    });
  });

  describe('supportsRDAP', () => {
    it('should return false for .io', () => {
      expect(supportsRDAP('io')).toBe(false);
      expect(supportsRDAP('.io')).toBe(false);
    });

    it('should return true for .com', () => {
      expect(supportsRDAP('com')).toBe(true);
      expect(supportsRDAP('.com')).toBe(true);
    });

    it('should return true for TLDs not in the blocklist', () => {
      expect(supportsRDAP('xyz')).toBe(true);
      expect(supportsRDAP('dev')).toBe(true);
    });
  });

  describe('getNoRDAPTLDs', () => {
    it('should return list of unsupported TLDs', () => {
      const tlds = getNoRDAPTLDs();
      expect(tlds).toContain('io');
      expect(tlds).toContain('ai');
      expect(Array.isArray(tlds)).toBe(true);
    });
  });

  describe('IANA Bootstrap', () => {
    it('should handle IPv6 addresses', async () => {
      const client = createClient({
        transport: {
          dispatch: async (req) => {
            // IPv6 detection uses colon check
            expect(req.url).toContain('rdap.arin.net/registry/ip/');
            const newUrl = req.url.replace(/https?:\/\/[^\/]+/, baseUrl);
            const response = await fetch(newUrl);
            return {
              ok: response.ok,
              status: response.status,
              statusText: response.statusText,
              headers: new Headers(response.headers),
              json: () => response.json(),
              text: () => response.text(),
              blob: () => response.blob(),
              read: () => null,
              timings: {},
              connection: {},
              url: newUrl
            } as any;
          }
        }
      });

      // IPv6 lookup - will fail with 404 but tests the path
      await expect(rdap(client, '2001:4860:4860::8888')).rejects.toThrow();
    });

    it('should query known TLDs from hardcoded list', async () => {
      const client = createClient({
        transport: {
          dispatch: async (req) => {
            // Should use hardcoded server for .org
            expect(req.url).toContain('rdap.publicinterestregistry.net');
            const newUrl = req.url.replace(/https?:\/\/[^\/]+/, baseUrl);
            const response = await fetch(newUrl);
            return {
              ok: response.ok,
              status: response.status,
              statusText: response.statusText,
              headers: new Headers(response.headers),
              json: () => response.json(),
              text: () => response.text(),
              blob: () => response.blob(),
              read: () => null,
              timings: {},
              connection: {},
              url: newUrl
            } as any;
          }
        }
      });

      const result = await rdap(client, 'test.org');
      expect(result.handle).toBe('TEST-ORG');
    });

    it('should use IANA bootstrap for unknown TLDs', async () => {
      // Mock IANA bootstrap response
      let ianaRequested = false;
      const client = createClient({
        transport: {
          dispatch: async (req) => {
            if (req.url.includes('data.iana.org/rdap/dns.json')) {
              ianaRequested = true;
              return {
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: new Headers({ 'Content-Type': 'application/json' }),
                json: () => Promise.resolve({
                  version: '1.0',
                  services: [
                    [['unknowntld'], ['https://rdap.unknowntld.example/']]
                  ]
                }),
                text: () => Promise.resolve(''),
                blob: () => Promise.resolve(new Blob()),
                read: () => null,
                timings: {},
                connection: {},
                url: req.url
              } as any;
            }

            // For the actual RDAP query
            return {
              ok: true,
              status: 200,
              statusText: 'OK',
              headers: new Headers({ 'Content-Type': 'application/rdap+json' }),
              json: () => Promise.resolve({
                handle: 'TEST-UNKNOWN',
                status: ['active']
              }),
              text: () => Promise.resolve(''),
              blob: () => Promise.resolve(new Blob()),
              read: () => null,
              timings: {},
              connection: {},
              url: req.url
            } as any;
          }
        }
      });

      const result = await rdap(client, 'test.unknowntld');
      expect(result.handle).toBe('TEST-UNKNOWN');
    });

    it('should handle IANA bootstrap fetch failure', async () => {
      const client = createClient({
        transport: {
          dispatch: async (req) => {
            if (req.url.includes('data.iana.org/rdap/dns.json')) {
              throw new Error('Network error');
            }

            throw new Error('Should not reach RDAP query');
          }
        }
      });

      // Should throw UnsupportedError for unknown TLD when IANA fails
      await expect(rdap(client, 'test.reallyrandomtld123')).rejects.toThrow();
    });

    it('should handle servers with and without trailing slash', async () => {
      const client = createClient({
        transport: {
          dispatch: async (req) => {
            // Verify no double slash in URL
            expect(req.url).not.toContain('//domain/');
            const newUrl = req.url.replace(/https?:\/\/[^\/]+/, baseUrl);
            const response = await fetch(newUrl);
            return {
              ok: response.ok,
              status: response.status,
              statusText: response.statusText,
              headers: new Headers(response.headers),
              json: () => response.json(),
              text: () => response.text(),
              blob: () => response.blob(),
              read: () => null,
              timings: {},
              connection: {},
              url: newUrl
            } as any;
          }
        }
      });

      // .net server has trailing slash already
      const result = await rdap(client, 'test.net');
      expect(result.handle).toBe('TEST-NET');
    });

    it('should handle .br TLD', async () => {
      const client = createClient({
        transport: {
          dispatch: async (req) => {
            expect(req.url).toContain('rdap.registro.br');
            const newUrl = req.url.replace(/https?:\/\/[^\/]+/, baseUrl);
            const response = await fetch(newUrl);
            return {
              ok: response.ok,
              status: response.status,
              statusText: response.statusText,
              headers: new Headers(response.headers),
              json: () => response.json(),
              text: () => response.text(),
              blob: () => response.blob(),
              read: () => null,
              timings: {},
              connection: {},
              url: newUrl
            } as any;
          }
        }
      });

      const result = await rdap(client, 'test.br');
      expect(result.handle).toBe('TEST-BR');
    });
  });

  describe('supportsRDAP edge cases', () => {
    it('should return false for all known non-RDAP TLDs', () => {
      const nonRdapTlds = ['ai', 'gg', 'im', 'je', 'sh', 'ac', 'cx', 'gs', 'ms', 'nf', 'pn', 'tc', 'vg'];
      nonRdapTlds.forEach(tld => {
        expect(supportsRDAP(tld)).toBe(false);
      });
    });
  });
});

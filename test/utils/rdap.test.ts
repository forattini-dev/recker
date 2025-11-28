import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rdap } from '../../src/utils/rdap.js';
import { createClient } from '../../src/core/client.js';
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
  });
});

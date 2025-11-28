import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../src/index.js';
import { ReckerRequest } from '../src/types/index.js';

// Simple Mock Transport
class LocalMockTransport {
    async dispatch(req: ReckerRequest) {
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            url: req.url,
            json: async () => ({ success: true }),
            text: async () => '{"success":true}',
            raw: {} as any,
            clone: () => this as any
        } as any;
    }
}

describe('Client Hooks', () => {
  it('should execute beforeRequest hooks', async () => {
    const beforeHook = vi.fn();
    const client = createClient({
      baseUrl: 'http://test.com',
      transport: new LocalMockTransport(),
      hooks: {
        beforeRequest: [
            async (req) => {
                beforeHook();
                req.headers.set('X-Hook', 'true');
            }
        ]
      }
    });

    await client.get('/test');
    expect(beforeHook).toHaveBeenCalled();
  });

  it('should execute afterResponse hooks', async () => {
    const afterHook = vi.fn();
    const client = createClient({
      baseUrl: 'http://test.com',
      transport: new LocalMockTransport(),
      hooks: {
        afterResponse: [
            async (req, res) => {
                afterHook();
            }
        ]
      }
    });

    await client.get('/test');
    expect(afterHook).toHaveBeenCalled();
  });

  it('should modify request in beforeRequest hook', async () => {
    const client = createClient({
      baseUrl: 'http://test.com',
      transport: {
          dispatch: async (req) => {
              expect(req.headers.get('X-Custom')).toBe('Added');
              return { ok: true } as any;
          }
      },
      hooks: {
        beforeRequest: [
            (req) => {
                req.headers.set('X-Custom', 'Added');
            }
        ]
      }
    });

    await client.get('/test');
  });

  it('should not add overhead if hooks are empty', () => {
      const client = createClient({
          baseUrl: 'http://test.com',
          transport: new LocalMockTransport()
      });
      return expect(client.get('/test')).resolves.toBeTruthy();
  });
});
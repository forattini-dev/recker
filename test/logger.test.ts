import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../src/core/client.js';
import { logger, toCurl } from '../src/plugins/logger.js';
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

describe('Logger Plugin & Utilities', () => {
  it('should log requests and responses', async () => {
    const logFn = vi.fn();
    const client = createClient({
      baseUrl: 'http://test.com',
      transport: new LocalMockTransport(),
      plugins: [
          logger({ log: logFn, colors: false })
      ]
    });

    await client.get('/test');

    expect(logFn).toHaveBeenCalledTimes(2);
    expect(logFn).toHaveBeenNthCalledWith(1, expect.stringContaining('--> GET     http://test.com/test'));
    expect(logFn).toHaveBeenNthCalledWith(2, expect.stringContaining('<-- GET     http://test.com/test 200 OK'));
  });

  it('should generate correct curl commands', () => {
      const req = {
          method: 'POST',
          url: 'https://api.example.com/data',
          headers: new Headers({ 'Content-Type': 'application/json', 'Authorization': 'Bearer token' }),
          body: '{"foo":"bar"}'
      } as unknown as ReckerRequest;

      const curl = toCurl(req);
      expect(curl).toContain("curl");
      expect(curl).toContain("-X POST");
      expect(curl).toContain("'https://api.example.com/data'");
      expect(curl).toContain("-H 'content-type: application/json'");
      expect(curl).toContain("-d '{\"foo\":\"bar\"}'");
  });
});

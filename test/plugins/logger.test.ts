import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../../src/core/client.js';
import { logger, toCurl, Logger } from '../../src/plugins/logger.js';
import { ReckerRequest } from '../../src/types/index.js';

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
  it('should log requests and responses with custom logger', async () => {
    const infoFn = vi.fn();
    const debugFn = vi.fn();
    const warnFn = vi.fn();
    const errorFn = vi.fn();

    // Create a mock logger implementing the Logger interface
    const mockLogger: Logger = {
      debug: debugFn,
      info: infoFn,
      warn: warnFn,
      error: errorFn,
    };

    const client = createClient({
      baseUrl: 'http://test.com',
      transport: new LocalMockTransport(),
      plugins: [
        logger({ logger: mockLogger, level: 'info' })
      ]
    });

    await client.get('/test');

    // Info level logs request and response
    expect(infoFn).toHaveBeenCalledTimes(2);

    // First call: request
    expect(infoFn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: 'request', method: 'GET', url: 'http://test.com/test' }),
      expect.stringContaining('→ GET http://test.com/test')
    );

    // Second call: response
    expect(infoFn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ type: 'response', method: 'GET', status: 200 }),
      expect.stringContaining('← 200 GET http://test.com/test')
    );
  });

  it('should log at debug level when configured', async () => {
    const debugFn = vi.fn();
    const infoFn = vi.fn();

    const mockLogger: Logger = {
      debug: debugFn,
      info: infoFn,
      warn: vi.fn(),
      error: vi.fn(),
    };

    const client = createClient({
      baseUrl: 'http://test.com',
      transport: new LocalMockTransport(),
      plugins: [
        logger({ logger: mockLogger, level: 'debug' })
      ]
    });

    await client.get('/test');

    // Debug level should use debug method, not info
    expect(debugFn).toHaveBeenCalledTimes(2);
    expect(infoFn).not.toHaveBeenCalled();
  });

  it('should redact authorization headers', async () => {
    const infoFn = vi.fn();

    const mockLogger: Logger = {
      debug: vi.fn(),
      info: infoFn,
      warn: vi.fn(),
      error: vi.fn(),
    };

    const client = createClient({
      baseUrl: 'http://test.com',
      transport: new LocalMockTransport(),
      plugins: [
        logger({ logger: mockLogger, showHeaders: true })
      ]
    });

    await client.get('/test', {
      headers: { 'Authorization': 'Bearer secret-token' }
    });

    // Check that Authorization header was redacted
    const requestLog = infoFn.mock.calls[0][0];
    expect(requestLog.headers?.authorization || requestLog.headers?.Authorization).toBe('[REDACTED]');
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

  it('should redact authorization in curl output', () => {
    const req = {
      method: 'GET',
      url: 'https://api.example.com/data',
      headers: new Headers({ 'Authorization': 'Bearer secret-token' }),
      body: null
    } as unknown as ReckerRequest;

    const curl = toCurl(req);
    expect(curl).toContain("[REDACTED]");
    expect(curl).not.toContain("secret-token");
  });
});

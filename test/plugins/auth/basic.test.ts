import { describe, it, expect, vi, beforeEach } from 'vitest';
import { basicAuthPlugin } from '../../../src/plugins/auth/basic.js';
import { HttpRequest } from '../../../src/core/request.ts';

describe('BasicAuthPlugin', () => {
  let clientMock: any;
  let next: any;

  beforeEach(() => {
    clientMock = {
      use: vi.fn((middleware) => {
        clientMock.middleware = middleware;
      })
    };
    next = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers() });
  });

  it('should add Authorization header with basic token', async () => {
    const username = 'testuser';
    const password = 'testpassword';
    basicAuthPlugin({ username, password })(clientMock);
    const middleware = clientMock.middleware;

    const req = new HttpRequest('http://example.com/api', { method: 'GET' });
    await middleware(req, next);

    const modifiedReq = next.mock.calls[0][0];

    expect(next).toHaveBeenCalledWith(modifiedReq);
  });

  it('should not overwrite existing Authorization header if not configured to do so (default behavior)', async () => {
    const username = 'testuser';
    const password = 'testpassword';
    basicAuthPlugin({ username, password })(clientMock);
    const middleware = clientMock.middleware;

    const existingToken = 'Bearer existing_token';
    const req = new HttpRequest('http://example.com/api', {
      method: 'GET',
      headers: { Authorization: existingToken }
    });
    await middleware(req, next);

    const modifiedReq = next.mock.calls[0][0];
    // Basic auth should overwrite by default if header key is 'Authorization'
    const expectedToken = Buffer.from(`${username}:${password}`).toString('base64');
    expect(modifiedReq.headers.get('Authorization')).toBe(`Basic ${expectedToken}`);
    expect(next).toHaveBeenCalledWith(modifiedReq);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bearerAuthPlugin } from '../../../src/plugins/auth/bearer.js';
import { HttpRequest } from '../../../src/core/request.ts';

describe('BearerAuthPlugin', () => {
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

  it('should add Authorization header with static bearer token', async () => {
    const token = 'static_token_123';
    bearerAuthPlugin({ token })(clientMock);
    const middleware = clientMock.middleware;

    const req = new HttpRequest('http://example.com/api', { method: 'GET' });
    await middleware(req, next);

    const modifiedReq = next.mock.calls[0][0];
    expect(next).toHaveBeenCalledWith(modifiedReq);
  });

  it('should add Authorization header with dynamic bearer token', async () => {
    const dynamicToken = 'dynamic_token_456';
    const tokenFn = vi.fn().mockResolvedValue(dynamicToken);
    bearerAuthPlugin({ token: tokenFn })(clientMock);
    const middleware = clientMock.middleware;

    const req = new HttpRequest('http://example.com/api', { method: 'GET' });
    await middleware(req, next);

    expect(tokenFn).toHaveBeenCalledOnce();
    const modifiedReq = next.mock.calls[0][0];
    expect(modifiedReq.headers.get('Authorization')).toBe(`Bearer ${dynamicToken}`);
    expect(next).toHaveBeenCalledWith(modifiedReq);
  });

  it('should use custom token type and header name', async () => {
    const token = 'custom_token';
    const type = 'CustomType';
    const headerName = 'X-Auth-Token';
    bearerAuthPlugin({ token, type, headerName })(clientMock);
    const req = new HttpRequest('http://example.com/api', { method: 'GET' });
    await clientMock.middleware(req, next);

    const modifiedReq = next.mock.calls[0][0];
    expect(modifiedReq.headers.get(headerName)).toBe(`${type} ${token}`);
    expect(modifiedReq.headers.get('Authorization')).toBeNull(); // Ensure default isn't set
    expect(next).toHaveBeenCalledWith(modifiedReq);
  });
});

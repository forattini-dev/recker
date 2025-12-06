import { describe, it, expect, beforeEach } from 'vitest';
import { xsrfPlugin, createXSRFMiddleware } from '../../src/plugins/xsrf.js';
import { ReckerRequest } from '../../src/types/index.js';

// Mock request helper
function createMockRequest(headers: Record<string, string> = {}): ReckerRequest {
  const headersObj = new Headers(headers);
  return {
    url: 'https://api.example.com/test',
    method: 'GET',
    headers: headersObj,
    body: null,
    withHeader(name: string, value: string) {
      const newHeaders = new Headers(this.headers);
      newHeaders.set(name, value);
      return { ...this, headers: newHeaders };
    },
    withBody(body: any) {
      return { ...this, body };
    }
  } as ReckerRequest;
}

describe('XSRF Plugin', () => {
  describe('xsrf middleware', () => {
    it('should add XSRF token from manual option', async () => {
      const middleware = xsrfPlugin({ token: 'test-token-123' });
      const req = createMockRequest();

      let capturedReq: ReckerRequest | null = null;
      const next = async (r: ReckerRequest) => {
        capturedReq = r;
        return {} as any;
      };

      await middleware(req, next);

      expect(capturedReq?.headers.get('X-XSRF-TOKEN')).toBe('test-token-123');
    });

    it('should use custom header name', async () => {
      const middleware = xsrfPlugin({
        token: 'test-token',
        headerName: 'X-CSRF-TOKEN'
      });
      const req = createMockRequest();

      let capturedReq: ReckerRequest | null = null;
      const next = async (r: ReckerRequest) => {
        capturedReq = r;
        return {} as any;
      };

      await middleware(req, next);

      expect(capturedReq?.headers.get('X-CSRF-TOKEN')).toBe('test-token');
    });

    it('should read token from cookie string', async () => {
      const middleware = xsrfPlugin({
        cookies: 'XSRF-TOKEN=cookie-token-456; Path=/; Secure'
      });
      const req = createMockRequest();

      let capturedReq: ReckerRequest | null = null;
      const next = async (r: ReckerRequest) => {
        capturedReq = r;
        return {} as any;
      };

      await middleware(req, next);

      expect(capturedReq?.headers.get('X-XSRF-TOKEN')).toBe('cookie-token-456');
    });

    it('should use custom cookie name', async () => {
      const middleware = xsrfPlugin({
        cookieName: 'CSRF-TOKEN',
        cookies: 'CSRF-TOKEN=custom-token; Path=/'
      });
      const req = createMockRequest();

      let capturedReq: ReckerRequest | null = null;
      const next = async (r: ReckerRequest) => {
        capturedReq = r;
        return {} as any;
      };

      await middleware(req, next);

      expect(capturedReq?.headers.get('X-XSRF-TOKEN')).toBe('custom-token');
    });

    it('should not override existing header', async () => {
      const middleware = xsrfPlugin({ token: 'new-token' });
      const req = createMockRequest({ 'X-XSRF-TOKEN': 'existing-token' });

      let capturedReq: ReckerRequest | null = null;
      const next = async (r: ReckerRequest) => {
        capturedReq = r;
        return {} as any;
      };

      await middleware(req, next);

      expect(capturedReq?.headers.get('X-XSRF-TOKEN')).toBe('existing-token');
    });

    it('should handle missing token gracefully', async () => {
      const middleware = xsrfPlugin(); // No token provided
      const req = createMockRequest();

      let capturedReq: ReckerRequest | null = null;
      const next = async (r: ReckerRequest) => {
        capturedReq = r;
        return {} as any;
      };

      await middleware(req, next);

      expect(capturedReq?.headers.get('X-XSRF-TOKEN')).toBeNull();
    });

    it('should handle complex cookie strings', async () => {
      const middleware = xsrfPlugin({
        cookies: 'session=abc123; XSRF-TOKEN=my-token; user_id=456; Path=/; HttpOnly'
      });
      const req = createMockRequest();

      let capturedReq: ReckerRequest | null = null;
      const next = async (r: ReckerRequest) => {
        capturedReq = r;
        return {} as any;
      };

      await middleware(req, next);

      expect(capturedReq?.headers.get('X-XSRF-TOKEN')).toBe('my-token');
    });

    it('should decode URL-encoded cookie values', async () => {
      const middleware = xsrfPlugin({
        cookies: 'XSRF-TOKEN=hello%20world%21; Path=/'
      });
      const req = createMockRequest();

      let capturedReq: ReckerRequest | null = null;
      const next = async (r: ReckerRequest) => {
        capturedReq = r;
        return {} as any;
      };

      await middleware(req, next);

      expect(capturedReq?.headers.get('X-XSRF-TOKEN')).toBe('hello world!');
    });
  });

  describe('createXSRFMiddleware', () => {
    it('should return null for false', () => {
      expect(createXSRFMiddleware(false)).toBeNull();
    });

    it('should create middleware with defaults for true', () => {
      const middleware = createXSRFMiddleware(true);
      expect(middleware).toBeTypeOf('function');
    });

    it('should create middleware with options', () => {
      const middleware = createXSRFMiddleware({
        token: 'test',
        headerName: 'X-CUSTOM'
      });
      expect(middleware).toBeTypeOf('function');
    });
  });
});

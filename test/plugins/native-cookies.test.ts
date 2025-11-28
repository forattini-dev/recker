import { describe, it, expect, beforeEach } from 'vitest';
import { createClient, MemoryCookieJar } from '../../src/index.js';
import { MockTransport } from '../helpers/mock-transport.js';

describe('Native Cookie Jar Integration', () => {
  let mockTransport: MockTransport;

  beforeEach(() => {
    mockTransport = new MockTransport();
  });

  describe('cookies: true (built-in jar)', () => {
    it('should store and send cookies automatically', async () => {
      // First request sets cookies
      mockTransport.setMockResponse('POST', '/login', 200, { success: true }, {
        'Set-Cookie': 'session=abc123; Path=/; HttpOnly'
      }, { times: 1 });

      // Second request should include the cookie
      mockTransport.setMockResponse('GET', '/profile', 200, { user: 'admin' });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        cookies: true
      });

      // Login (sets cookie)
      await client.post('/login').json();

      // Profile (should send cookie)
      const response = await client.get('/profile').json();
      expect(response).toEqual({ user: 'admin' });

      // Verify cookie was sent (MockTransport tracked it)
      expect(mockTransport.getCallCount('GET', '/profile')).toBe(1);
    });

    it('should handle multiple Set-Cookie headers', async () => {
      mockTransport.setMockResponse('GET', '/set-cookies', 200, {}, {
        'Set-Cookie': 'a=1; Path=/, b=2; Path=/'
      });

      const jar = new MemoryCookieJar();

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport,
        cookies: { jar }
      });

      await client.get('/set-cookies');

      // Check jar has both cookies
      const cookies = jar.getAllCookies();
      expect(cookies.length).toBe(2);
      expect(cookies.map(c => c.name).sort()).toEqual(['a', 'b']);
    });
  });

  describe('cookies: { jar: customJar }', () => {
    it('should use custom cookie jar', async () => {
      const customJar = new MemoryCookieJar();

      // Pre-set a cookie
      customJar.setCookie('existing=cookie', 'https://api.example.com');

      mockTransport.setMockResponse('GET', '/test', 200, { ok: true });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        cookies: { jar: customJar }
      });

      await client.get('/test');

      // The existing cookie should have been sent
      expect(mockTransport.getCallCount('GET', '/test')).toBe(1);
    });

    it('should share cookies between requests', async () => {
      const jar = new MemoryCookieJar();

      mockTransport.setMockResponse('POST', '/auth', 200, {}, {
        'Set-Cookie': 'token=xyz789; Path=/'
      }, { times: 1 });

      mockTransport.setMockResponse('GET', '/api/data', 200, { data: 'secret' });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport,
        cookies: { jar }
      });

      // First request sets cookie
      await client.post('/auth');

      // Second request should have the cookie
      await client.get('/api/data');

      // Verify jar stored the cookie
      const cookieString = await jar.getCookieString('https://example.com/api');
      expect(cookieString).toContain('token=xyz789');
    });
  });

  describe('cookies: { ignoreInvalid: true }', () => {
    it('should ignore invalid cookies when ignoreInvalid is true', async () => {
      // Mock transport with malformed cookie
      mockTransport.setMockResponse('GET', '/bad-cookie', 200, {}, {
        'Set-Cookie': '=no-name-cookie'
      });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport,
        cookies: { jar: true, ignoreInvalid: true }
      });

      // Should not throw
      await expect(client.get('/bad-cookie')).resolves.toBeDefined();
    });
  });

  describe('domain and path matching', () => {
    it('should respect cookie domain scoping', async () => {
      const jar = new MemoryCookieJar();

      // Set cookie for example.com
      jar.setCookie('site=main', 'https://example.com');
      // Set cookie for api.example.com
      jar.setCookie('api=token', 'https://api.example.com');

      // Cookie from example.com should not be sent to api.example.com
      // But cookie from api.example.com should be sent
      const apiCookies = await jar.getCookieString('https://api.example.com/v1');
      expect(apiCookies).toContain('api=token');

      // Root domain should only get its own cookie
      const rootCookies = await jar.getCookieString('https://example.com/');
      expect(rootCookies).toContain('site=main');
      expect(rootCookies).not.toContain('api=token');
    });

    it('should respect cookie path scoping', async () => {
      const jar = new MemoryCookieJar();

      // Set cookie for /admin path
      jar.setCookie('admin=true; Path=/admin', 'https://example.com/admin/login');
      // Set cookie for root
      jar.setCookie('global=yes; Path=/', 'https://example.com/');

      // /admin should get both
      const adminCookies = await jar.getCookieString('https://example.com/admin/dashboard');
      expect(adminCookies).toContain('admin=true');
      expect(adminCookies).toContain('global=yes');

      // / should only get global
      const rootCookies = await jar.getCookieString('https://example.com/public');
      expect(rootCookies).not.toContain('admin=true');
      expect(rootCookies).toContain('global=yes');
    });

    it('should handle subdomain cookies', async () => {
      const jar = new MemoryCookieJar();

      // Set cookie with domain=example.com (should apply to subdomains)
      jar.setCookie('shared=yes; Domain=example.com', 'https://example.com');

      // Should be available on subdomain
      const subCookies = await jar.getCookieString('https://api.example.com/');
      expect(subCookies).toContain('shared=yes');
    });
  });

  describe('cookie expiration', () => {
    it('should not return expired cookies (Max-Age)', async () => {
      const jar = new MemoryCookieJar();

      // Set a cookie that expires immediately
      jar.setCookie('temp=val; Max-Age=0', 'https://example.com');

      // Should not be returned (expired)
      const cookies = await jar.getCookieString('https://example.com');
      expect(cookies).toBe('');
    });

    it('should return non-expired cookies', async () => {
      const jar = new MemoryCookieJar();

      // Set a cookie that expires in 1 hour
      jar.setCookie('valid=yes; Max-Age=3600', 'https://example.com');

      const cookies = await jar.getCookieString('https://example.com');
      expect(cookies).toContain('valid=yes');
    });
  });

  describe('secure flag', () => {
    it('should not send secure cookies over HTTP', async () => {
      const jar = new MemoryCookieJar();

      jar.setCookie('secure=token; Secure', 'https://example.com');
      jar.setCookie('normal=value', 'https://example.com');

      // HTTPS should get both
      const httpsCookies = await jar.getCookieString('https://example.com');
      expect(httpsCookies).toContain('secure=token');
      expect(httpsCookies).toContain('normal=value');

      // HTTP should only get non-secure
      const httpCookies = await jar.getCookieString('http://example.com');
      expect(httpCookies).not.toContain('secure=token');
      expect(httpCookies).toContain('normal=value');
    });
  });

  describe('MemoryCookieJar', () => {
    it('should clear all cookies', () => {
      const jar = new MemoryCookieJar();

      jar.setCookie('a=1', 'https://example.com');
      jar.setCookie('b=2', 'https://other.com');

      jar.clear();

      expect(jar.getAllCookies().length).toBe(0);
    });

    it('should clear cookies for specific domain', () => {
      const jar = new MemoryCookieJar();

      jar.setCookie('a=1', 'https://example.com');
      jar.setCookie('b=2', 'https://other.com');

      jar.clearDomain('example.com');

      const cookies = jar.getAllCookies();
      expect(cookies.length).toBe(1);
      expect(cookies[0].name).toBe('b');
    });

    it('should parse complex Set-Cookie headers', () => {
      const jar = new MemoryCookieJar();

      jar.setCookie(
        'complex=value; Expires=Thu, 01 Jan 2099 00:00:00 GMT; Path=/; Domain=example.com; Secure; HttpOnly; SameSite=Strict',
        'https://example.com'
      );

      const cookies = jar.getAllCookies();
      expect(cookies.length).toBe(1);
      expect(cookies[0].name).toBe('complex');
      expect(cookies[0].value).toBe('value');
      expect(cookies[0].secure).toBe(true);
      expect(cookies[0].httpOnly).toBe(true);
      expect(cookies[0].sameSite).toBe('Strict');
    });
  });

  describe('got-compatible API', () => {
    it('should support got-style cookieJar option', async () => {
      // This mirrors got's API:
      // got({ cookieJar: new CookieJar() })
      const jar = new MemoryCookieJar();

      mockTransport.setMockResponse('GET', '/test', 200, {}, {
        'Set-Cookie': 'got=compatible'
      });

      const client = createClient({
        baseUrl: 'https://example.com',
        transport: mockTransport,
        cookies: { jar }
      });

      await client.get('/test');

      const cookies = jar.getAllCookies();
      expect(cookies.find(c => c.name === 'got')?.value).toBe('compatible');
    });
  });

  describe('RFC 6265 compliance (jshttp/cookie features)', () => {
    it('should parse Partitioned attribute (CHIPS)', () => {
      const jar = new MemoryCookieJar();

      jar.setCookie('chip=value; Partitioned; Secure; SameSite=None', 'https://example.com');

      const cookies = jar.getAllCookies();
      expect(cookies[0].partitioned).toBe(true);
    });

    it('should parse Priority attribute (Chrome extension)', () => {
      const jar = new MemoryCookieJar();

      jar.setCookie('low=val; Priority=Low', 'https://example.com');
      jar.setCookie('med=val; Priority=Medium', 'https://example.com');
      jar.setCookie('high=val; Priority=High', 'https://example.com');

      const cookies = jar.getAllCookies();
      expect(cookies.find(c => c.name === 'low')?.priority).toBe('Low');
      expect(cookies.find(c => c.name === 'med')?.priority).toBe('Medium');
      expect(cookies.find(c => c.name === 'high')?.priority).toBe('High');
    });

    it('should URL-decode cookie values', () => {
      const jar = new MemoryCookieJar();

      // URL-encoded value: E=mc^2
      jar.setCookie('equation=E%3Dmc%5E2', 'https://example.com');

      const cookies = jar.getAllCookies();
      expect(cookies[0].value).toBe('E=mc^2');
    });

    it('should handle malformed URL-encoded values gracefully', () => {
      const jar = new MemoryCookieJar();

      // Invalid URL encoding - should return original value
      jar.setCookie('bad=%invalid%', 'https://example.com');

      const cookies = jar.getAllCookies();
      expect(cookies[0].value).toBe('%invalid%');
    });

    it('should validate domain format per RFC', () => {
      const jar = new MemoryCookieJar();

      // Valid domain
      jar.setCookie('valid=1; Domain=example.com', 'https://sub.example.com');

      // The cookie should be stored with the specified domain
      const cookies = jar.getAllCookies();
      expect(cookies[0].domain).toBe('example.com');
    });

    it('should ignore invalid max-age values', () => {
      const jar = new MemoryCookieJar();

      // Invalid max-age (float)
      jar.setCookie('noexp=val; Max-Age=1.5', 'https://example.com');

      const cookies = jar.getAllCookies();
      // Should not have maxAge set (ignored invalid value)
      expect(cookies[0].maxAge).toBeUndefined();
    });

    it('should handle negative max-age as expired', () => {
      const jar = new MemoryCookieJar();

      jar.setCookie('expired=val; Max-Age=-1', 'https://example.com');

      // Cookie should be immediately expired
      const cookieStr = jar.getCookieString('https://example.com');
      expect(cookieStr).toBe('');
    });

    it('should skip URL decoding when no % is present (optimization)', () => {
      const jar = new MemoryCookieJar();

      // Simple value without URL encoding
      jar.setCookie('simple=hello-world_123', 'https://example.com');

      const cookies = jar.getAllCookies();
      expect(cookies[0].value).toBe('hello-world_123');
    });
  });
});

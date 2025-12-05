import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../../src/core/client.js';
import { cookieJar } from '../../src/plugins/cookie-jar.js';
import { ReckerRequest } from '../../src/types/index.js';

// Simple Mock Transport that handles cookies
class CookieMockTransport {
    async dispatch(req: ReckerRequest) {
        const cookies = req.headers.get('cookie');
        const url = req.url;

        // Simulate login response setting a cookie
        if (url.endsWith('/login')) {
             const headers = new Headers();
             headers.append('set-cookie', 'session_id=12345; Path=/; HttpOnly');
             headers.append('set-cookie', 'user_pref=dark; Path=/');
             
             return {
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: headers,
                url: req.url,
                json: async () => ({ logged_in: true }),
                text: async () => '',
                raw: {} as any,
                clone: () => this as any
            } as any;
        }

        // Simulate authenticated endpoint
        if (url.endsWith('/profile')) {
            if (cookies?.includes('session_id=12345')) {
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers(),
                    json: async () => ({ user: 'admin' })
                } as any;
            }
            return {
                ok: false,
                status: 401,
                headers: new Headers(),
                json: async () => ({ error: 'Unauthorized' })
            } as any;
        }

        return { ok: true, status: 200, headers: new Headers() } as any;
    }
}

describe('Cookie Jar Plugin', () => {
  it('should store and send cookies', async () => {
    const client = createClient({
      baseUrl: 'http://test.com',
      transport: new CookieMockTransport(),
      plugins: [cookieJar()]
    });

    // 1. Login (Server sets cookies)
    await client.post('/login');

    // 2. Profile (Client should send cookies)
    const profile = await client.get('/profile').json<{user: string}>();
    expect(profile.user).toBe('admin');
  });

  it('should handle multiple cookies', async () => {
     const client = createClient({
      baseUrl: 'http://test.com',
      transport: new CookieMockTransport(),
      plugins: [cookieJar()]
    });

    await client.post('/login');
    
    // We can inspect the cookie jar if we pass the map externally
    const store = new Map<string, string>();
    const clientWithStore = createClient({
        baseUrl: 'http://test.com',
        transport: new CookieMockTransport(),
        plugins: [cookieJar({ store })]
    });

    await clientWithStore.post('/login');

    expect(store.get('session_id')).toBe('12345');
    expect(store.get('user_pref')).toBe('dark');
  });

  it('should handle Domain attribute in cookies', async () => {
    const transport = {
      async dispatch(req: ReckerRequest) {
        const url = req.url;
        if (url.endsWith('/set-domain-cookie')) {
          const headers = new Headers();
          headers.append('set-cookie', 'domain_cookie=value123; Domain=.example.com; Path=/');
          return {
            ok: true,
            status: 200,
            headers: headers,
            json: async () => ({})
          } as any;
        }
        if (url.endsWith('/check-cookie')) {
          const cookies = req.headers.get('cookie');
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({ hasCookie: cookies?.includes('domain_cookie') ?? false })
          } as any;
        }
        return { ok: true, status: 200, headers: new Headers() } as any;
      }
    };

    const client = createClient({
      baseUrl: 'http://sub.example.com',
      transport: transport,
      plugins: [cookieJar()]
    });

    // Set a domain cookie
    await client.get('/set-domain-cookie');

    // Check that cookie is sent to subdomain
    const result = await client.get('/check-cookie').json<{hasCookie: boolean}>();
    expect(result.hasCookie).toBe(true);
  });

  it('should match subdomain cookies from parent domain', async () => {
    // This test validates lines 53-55 - subdomain matching
    const transport = {
      callCount: 0,
      async dispatch(req: ReckerRequest) {
        this.callCount++;
        const url = req.url;
        if (url.endsWith('/set-parent-cookie')) {
          const headers = new Headers();
          // Set a cookie with Domain=.example.com (parent domain)
          headers.append('set-cookie', 'parent_session=abc123; Domain=.example.com; Path=/');
          return {
            ok: true,
            status: 200,
            headers: headers,
            json: async () => ({})
          } as any;
        }
        // Return the cookies received
        const cookies = req.headers.get('cookie') || '';
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ cookies })
        } as any;
      }
    };

    const client = createClient({
      baseUrl: 'http://www.example.com',
      transport: transport,
      plugins: [cookieJar()]
    });

    // First set a cookie on parent domain
    await client.get('/set-parent-cookie');

    // Now make a request to a subdomain path - should include the cookie
    const result = await client.get('/check').json<{cookies: string}>();
    expect(result.cookies).toContain('parent_session=abc123');
  });
});

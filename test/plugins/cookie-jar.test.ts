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
            if (cookies && cookies.includes('session_id=12345')) {
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
});

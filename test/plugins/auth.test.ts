import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient } from '../../src/index.js'; // Ensure correct import for createClient
import { HttpRequest } from '../../src/core/request.ts'; // Explicitly import HttpRequest
import {
  basicAuth,
  basicAuthPlugin,
  bearerAuth,
  bearerAuthPlugin,
  apiKeyAuth,
  apiKeyAuthPlugin,
  digestAuth,
  digestAuthPlugin,
  oauth2,
  oauth2Plugin,
  awsSignatureV4,
  awsSignatureV4Plugin
} from '../../src/plugins/auth/index.js'; // Use plugins from barrel file
import { MockTransport } from '../helpers/mock-transport.ts';

// Helper to wrap a plain request object with `withHeader` method for testing
const wrapRequestWithWithHeader = (req: any): HttpRequest => {
    if (req.withHeader) return req; // Already wrapped or is HttpRequest
    return {
        ...req,
        headers: req.headers || new Headers(),
        withHeader: vi.fn(function(this: HttpRequest, name: string, value: string) {
            const newHeaders = new Headers(this.headers);
            newHeaders.set(name, value);
            // Return a new mock request with updated headers
            return wrapRequestWithWithHeader({ ...this, headers: newHeaders });
        }) as any,
        url: req.url || 'http://mock.com/default' // Ensure URL exists
    } as HttpRequest;
};

// ============================================================================
// Basic Authentication Tests
// ============================================================================

// Helper to compute MD5 hash (for digest auth verification)
function md5(str: string): string {
  return createHash('md5').update(str).digest('hex');
}

// Helper to compute SHA-256 hash
function sha256(str: string): string {
  return createHash('sha256').update(str).digest('hex');
}

// ============================================================================
// Basic Authentication Tests
// ============================================================================

describe('Basic Authentication', () => {
  const baseUrl = 'https://api.example.com';

  it('should add Base64 encoded Authorization header', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/protected', 200, { success: true });

    let capturedHeaders: Headers | null = null;
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        basicAuthPlugin({ username: 'user', password: 'pass' }),
        (client) => {
          client.use(async (req, next) => {
            capturedHeaders = req.headers;
            return next(req);
          });
        }
      ]
    });

    await client.get('/protected').json();

    expect(capturedHeaders?.get('Authorization')).toBe(
      `Basic ${Buffer.from('user:pass').toString('base64')}`
    );
  });

  it('should encode special characters correctly', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/protected', 200, { success: true });

    let capturedAuth: string | null = null;
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        basicAuthPlugin({ username: 'user@domain.com', password: 'p@ss:word!' }),
        (client) => {
          client.use(async (req, next) => {
            capturedAuth = req.headers.get('Authorization');
            return next(req);
          });
        }
      ]
    });

    await client.get('/protected').json();

    const decoded = Buffer.from(capturedAuth!.replace('Basic ', ''), 'base64').toString();
    expect(decoded).toBe('user@domain.com:p@ss:word!');
  });

  it('should work with middleware function', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/test', 200, { ok: true });

    let hasAuthHeader = false;
    const client = createClient({
      baseUrl,
      transport: mockTransport
    });

    client.use(basicAuth({ username: 'admin', password: 'secret' }));
    client.use(async (req, next) => {
      hasAuthHeader = req.headers.has('Authorization');
      return next(req);
    });

    await client.get('/test').json();
    expect(hasAuthHeader).toBe(true);
  });
});

// ============================================================================
// Bearer Token Authentication Tests
// ============================================================================

describe('Bearer Token Authentication', () => {
  const baseUrl = 'https://api.example.com';

  it('should add static Bearer token', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/api', 200, { data: 'test' });

    let capturedAuth: string | null = null;
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        bearerAuthPlugin({ token: 'my-static-token' }),
        (client) => {
          client.use(async (req, next) => {
            capturedAuth = req.headers.get('Authorization');
            return next(req);
          });
        }
      ]
    });

    await client.get('/api').json();
    expect(capturedAuth).toBe('Bearer my-static-token');
  });

  it('should support dynamic token function', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/api', 200, { data: 'test' });

    let tokenCallCount = 0;
    const tokenProvider = vi.fn(async () => {
      tokenCallCount++;
      return `dynamic-token-${tokenCallCount}`;
    });

    let capturedAuth: string | null = null;
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        bearerAuthPlugin({ token: tokenProvider }),
        (client) => {
          client.use(async (req, next) => {
            capturedAuth = req.headers.get('Authorization');
            return next(req);
          });
        }
      ]
    });

    await client.get('/api').json();
    expect(capturedAuth).toBe('Bearer dynamic-token-1');
    expect(tokenProvider).toHaveBeenCalledTimes(1);

    // Make another request
    mockTransport.setMockResponse('GET', '/api2', 200, { data: 'test2' });
    await client.get('/api2').json();
    expect(tokenProvider).toHaveBeenCalledTimes(2);
  });

  it('should support custom token type', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/api', 200, {});

    let capturedAuth: string | null = null;
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        bearerAuthPlugin({ token: 'my-token', type: 'Token' }),
        (client) => {
          client.use(async (req, next) => {
            capturedAuth = req.headers.get('Authorization');
            return next(req);
          });
        }
      ]
    });

    await client.get('/api').json();
    expect(capturedAuth).toBe('Token my-token');
  });

  it('should support custom header name', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/api', 200, {});

    let capturedXAuth: string | null = null;
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        bearerAuthPlugin({ token: 'my-token', headerName: 'X-Auth-Token' }),
        (client) => {
          client.use(async (req, next) => {
            capturedXAuth = req.headers.get('X-Auth-Token');
            return next(req);
          });
        }
      ]
    });

    await client.get('/api').json();
    expect(capturedXAuth).toBe('Bearer my-token');
  });
});

// ============================================================================
// API Key Authentication Tests
// ============================================================================

describe('API Key Authentication', () => {
  const baseUrl = 'https://api.example.com';

  it('should add API key in header by default', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/data', 200, {});

    let capturedApiKey: string | null = null;
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        apiKeyAuthPlugin({ key: 'my-api-key-123' }),
        (client) => {
          client.use(async (req, next) => {
            capturedApiKey = req.headers.get('X-API-Key');
            return next(req);
          });
        }
      ]
    });

    await client.get('/data').json();
    expect(capturedApiKey).toBe('my-api-key-123');
  });

  it('should add API key in custom header', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/data', 200, {});

    let capturedKey: string | null = null;
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        apiKeyAuthPlugin({ key: 'secret-key', in: 'header', name: 'Api-Secret' }),
        (client) => {
          client.use(async (req, next) => {
            capturedKey = req.headers.get('Api-Secret');
            return next(req);
          });
        }
      ]
    });

    await client.get('/data').json();
    expect(capturedKey).toBe('secret-key');
  });

  it('should add API key as query parameter', async () => {
    const mockTransport = new MockTransport();
    // Register mock with query param since apiKeyAuth modifies the URL
    mockTransport.setMockResponse('GET', '/data?api_key=query-key-456', 200, {});

    let capturedUrl: string | null = null;
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        apiKeyAuthPlugin({ key: 'query-key-456', in: 'query', name: 'api_key' }),
        (client) => {
          client.use(async (req, next) => {
            capturedUrl = req.url;
            return next(req);
          });
        }
      ]
    });

    await client.get('/data').json();
    expect(capturedUrl).toContain('api_key=query-key-456');
  });

  it('should support dynamic key function', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/data', 200, {});

    const keyProvider = vi.fn(() => 'dynamic-key');

    let capturedKey: string | null = null;
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        apiKeyAuthPlugin({ key: keyProvider }),
        (client) => {
          client.use(async (req, next) => {
            capturedKey = req.headers.get('X-API-Key');
            return next(req);
          });
        }
      ]
    });

    await client.get('/data').json();
    expect(capturedKey).toBe('dynamic-key');
    expect(keyProvider).toHaveBeenCalled();
  });
});

// ============================================================================
// Digest Authentication Tests (RFC 7616)
// ============================================================================

describe('Digest Authentication (RFC 7616)', () => {
  const baseUrl = 'https://api.example.com';

  describe('Challenge-Response Flow', () => {
    it('should handle 401 challenge and retry with credentials', async () => {
      const mockTransport = new MockTransport();

      // First request returns 401 with WWW-Authenticate
      mockTransport.setMockResponse('GET', '/protected', 401,
        { error: 'Unauthorized' },
        {
          'WWW-Authenticate': 'Digest realm="api@example.com", nonce="abc123xyz", qop="auth"'
        },
        { times: 1 }
      );

      // Second request (with auth) returns 200
      mockTransport.setMockResponse('GET', '/protected', 200,
        { data: 'secret' }
      );

      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [
          digestAuthPlugin({ username: 'admin', password: 'secret123' })
        ]
      });

      const res = await client.get('/protected', { throwHttpErrors: false });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toEqual({ data: 'secret' });

      // Should have made 2 requests (401 + retry)
      expect(mockTransport.getCallCount('GET', '/protected')).toBe(2);
    });

    it('should include all required Digest parameters', async () => {
      const mockTransport = new MockTransport();

      mockTransport.setMockResponse('GET', '/resource', 401, {}, {
        'WWW-Authenticate': 'Digest realm="test-realm", nonce="testnonce123", qop="auth", opaque="opaque-value"'
      }, { times: 1 });

      mockTransport.setMockResponse('GET', '/resource', 200, { ok: true });

      let authHeader: string | null = null;
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [
          digestAuthPlugin({ username: 'user', password: 'pass' }),
          (client) => {
            client.use(async (req, next) => {
              if (req.headers.has('Authorization')) {
                authHeader = req.headers.get('Authorization');
              }
              return next(req);
            });
          }
        ]
      });

      await client.get('/resource', { throwHttpErrors: false });

      expect(authHeader).toBeTruthy();
      expect(authHeader).toMatch(/^Digest /);
      expect(authHeader).toContain('username="user"');
      expect(authHeader).toContain('realm="test-realm"');
      expect(authHeader).toContain('nonce="testnonce123"');
      expect(authHeader).toContain('uri="/resource"');
      expect(authHeader).toContain('response="');
      expect(authHeader).toContain('qop=auth');
      expect(authHeader).toContain('nc=00000001');
      expect(authHeader).toContain('cnonce="');
      expect(authHeader).toContain('opaque="opaque-value"');
    });

    it('should return 401 if no WWW-Authenticate header', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('GET', '/no-challenge', 401, { error: 'No challenge' });

      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [digestAuthPlugin({ username: 'user', password: 'pass' })]
      });

      const res = await client.get('/no-challenge', { throwHttpErrors: false });
      expect(res.status).toBe(401);
    });

    it('should return 401 if WWW-Authenticate is not Digest', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('GET', '/basic-auth', 401, {}, {
        'WWW-Authenticate': 'Basic realm="test"'
      });

      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [digestAuthPlugin({ username: 'user', password: 'pass' })]
      });

      const res = await client.get('/basic-auth', { throwHttpErrors: false });
      expect(res.status).toBe(401);
    });
  });

  describe('Algorithm Support', () => {
    it('should use MD5 by default', async () => {
      const mockTransport = new MockTransport();

      mockTransport.setMockResponse('GET', '/md5', 401, {}, {
        'WWW-Authenticate': 'Digest realm="md5-realm", nonce="nonce123"'
      }, { times: 1 });

      mockTransport.setMockResponse('GET', '/md5', 200, {});

      let authHeader: string | null = null;
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [
          digestAuthPlugin({ username: 'user', password: 'pass' }),
          (client) => {
            client.use(async (req, next) => {
              if (req.headers.has('Authorization')) {
                authHeader = req.headers.get('Authorization');
              }
              return next(req);
            });
          }
        ]
      });

      await client.get('/md5', { throwHttpErrors: false });

      // MD5 is default, so algorithm should NOT be present in header
      expect(authHeader).not.toContain('algorithm=');
    });

    it('should support SHA-256 algorithm', async () => {
      const mockTransport = new MockTransport();

      mockTransport.setMockResponse('GET', '/sha256', 401, {}, {
        'WWW-Authenticate': 'Digest realm="sha256-realm", nonce="sha256nonce", algorithm=SHA-256, qop="auth"'
      }, { times: 1 });

      mockTransport.setMockResponse('GET', '/sha256', 200, { ok: true });

      let authHeader: string | null = null;
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [
          digestAuthPlugin({ username: 'sha256user', password: 'sha256pass' }),
          (client) => {
            client.use(async (req, next) => {
              if (req.headers.has('Authorization')) {
                authHeader = req.headers.get('Authorization');
              }
              return next(req);
            });
          }
        ]
      });

      await client.get('/sha256', { throwHttpErrors: false });

      expect(authHeader).toContain('algorithm=SHA-256');
    });

    it('should support MD5-sess algorithm', async () => {
      const mockTransport = new MockTransport();

      mockTransport.setMockResponse('GET', '/md5sess', 401, {}, {
        'WWW-Authenticate': 'Digest realm="sess-realm", nonce="sessnonce", algorithm=MD5-sess, qop="auth"'
      }, { times: 1 });

      mockTransport.setMockResponse('GET', '/md5sess', 200, {});

      let authHeader: string | null = null;
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [
          digestAuthPlugin({ username: 'user', password: 'pass' }),
          (client) => {
            client.use(async (req, next) => {
              if (req.headers.has('Authorization')) {
                authHeader = req.headers.get('Authorization');
              }
              return next(req);
            });
          }
        ]
      });

      await client.get('/md5sess', { throwHttpErrors: false });

      expect(authHeader).toContain('algorithm=MD5-SESS');
    });
  });

  describe('Quality of Protection (QOP)', () => {
    it('should include nc and cnonce when qop is present', async () => {
      const mockTransport = new MockTransport();

      mockTransport.setMockResponse('GET', '/qop', 401, {}, {
        'WWW-Authenticate': 'Digest realm="qop-realm", nonce="qopnonce", qop="auth"'
      }, { times: 1 });

      mockTransport.setMockResponse('GET', '/qop', 200, {});

      let authHeader: string | null = null;
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [
          digestAuthPlugin({ username: 'user', password: 'pass' }),
          (client) => {
            client.use(async (req, next) => {
              if (req.headers.has('Authorization')) {
                authHeader = req.headers.get('Authorization');
              }
              return next(req);
            });
          }
        ]
      });

      await client.get('/qop', { throwHttpErrors: false });

      expect(authHeader).toContain('qop=auth');
      expect(authHeader).toContain('nc=00000001');
      expect(authHeader).toMatch(/cnonce="[a-f0-9]+"/);
    });

    it('should work without qop', async () => {
      const mockTransport = new MockTransport();

      mockTransport.setMockResponse('GET', '/no-qop', 401, {}, {
        'WWW-Authenticate': 'Digest realm="no-qop-realm", nonce="noqopnonce"'
      }, { times: 1 });

      mockTransport.setMockResponse('GET', '/no-qop', 200, {});

      let authHeader: string | null = null;
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [
          digestAuthPlugin({ username: 'user', password: 'pass' }),
          (client) => {
            client.use(async (req, next) => {
              if (req.headers.has('Authorization')) {
                authHeader = req.headers.get('Authorization');
              }
              return next(req);
            });
          }
        ]
      });

      await client.get('/no-qop', { throwHttpErrors: false });

      expect(authHeader).not.toContain('qop=');
      expect(authHeader).not.toContain('nc=');
      expect(authHeader).not.toContain('cnonce=');
    });

    it('should select first qop option when multiple provided', async () => {
      const mockTransport = new MockTransport();

      mockTransport.setMockResponse('GET', '/multi-qop', 401, {}, {
        'WWW-Authenticate': 'Digest realm="realm", nonce="nonce", qop="auth,auth-int"'
      }, { times: 1 });

      mockTransport.setMockResponse('GET', '/multi-qop', 200, {});

      let authHeader: string | null = null;
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [
          digestAuthPlugin({ username: 'user', password: 'pass' }),
          (client) => {
            client.use(async (req, next) => {
              if (req.headers.has('Authorization')) {
                authHeader = req.headers.get('Authorization');
              }
              return next(req);
            });
          }
        ]
      });

      await client.get('/multi-qop', { throwHttpErrors: false });

      expect(authHeader).toContain('qop=auth');
    });
  });

  describe('Preemptive Authentication', () => {
    it('should cache challenge and use preemptively on subsequent requests', async () => {
      const mockTransport = new MockTransport();

      // First request: 401 challenge
      mockTransport.setMockResponse('GET', '/first', 401, {}, {
        'WWW-Authenticate': 'Digest realm="preemptive-realm", nonce="preemptive-nonce", qop="auth"'
      }, { times: 1 });

      // First request retry: 200
      mockTransport.setMockResponse('GET', '/first', 200, { request: 1 });

      // Second request: 200 (preemptive auth should work)
      mockTransport.setMockResponse('GET', '/second', 200, { request: 2 });

      let secondRequestAuthHeader: string | null = null;
      let requestCount = 0;

      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [
          digestAuthPlugin({ username: 'user', password: 'pass', preemptive: true }),
          (client) => {
            client.use(async (req, next) => {
              requestCount++;
              if (req.url.includes('/second')) {
                secondRequestAuthHeader = req.headers.get('Authorization');
              }
              return next(req);
            });
          }
        ]
      });

      // First request will trigger challenge-response
      await client.get('/first', { throwHttpErrors: false });

      // Second request should include auth preemptively
      await client.get('/second', { throwHttpErrors: false });

      expect(secondRequestAuthHeader).toBeTruthy();
      expect(secondRequestAuthHeader).toContain('Digest');
      // nc should be incremented for the second request
      expect(secondRequestAuthHeader).toContain('nc=00000002');
    });

    it('should not use preemptive auth when disabled', async () => {
      const mockTransport = new MockTransport();

      mockTransport.setMockResponse('GET', '/first', 401, {}, {
        'WWW-Authenticate': 'Digest realm="realm", nonce="nonce"'
      }, { times: 1 });

      mockTransport.setMockResponse('GET', '/first', 200, {});

      // Without preemptive, second request should not have auth header initially
      mockTransport.setMockResponse('GET', '/second', 401, {}, {
        'WWW-Authenticate': 'Digest realm="realm", nonce="new-nonce"'
      }, { times: 1 });

      mockTransport.setMockResponse('GET', '/second', 200, {});

      let secondRequestInitialAuth: string | null = null;
      let isFirstSecondRequest = true;

      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [
          digestAuthPlugin({ username: 'user', password: 'pass', preemptive: false }),
          (client) => {
            client.use(async (req, next) => {
              if (req.url.includes('/second') && isFirstSecondRequest) {
                secondRequestInitialAuth = req.headers.get('Authorization');
                isFirstSecondRequest = false;
              }
              return next(req);
            });
          }
        ]
      });

      await client.get('/first', { throwHttpErrors: false });
      await client.get('/second', { throwHttpErrors: false });

      // Without preemptive, first attempt at /second should NOT have auth header
      expect(secondRequestInitialAuth).toBeNull();
    });
  });

  describe('Nonce Counter', () => {
    it('should increment nc for each request', async () => {
      const mockTransport = new MockTransport();

      // Initial challenge
      mockTransport.setMockResponse('GET', '/nc-test', 401, {}, {
        'WWW-Authenticate': 'Digest realm="realm", nonce="fixed-nonce", qop="auth"'
      }, { times: 1 });

      // All subsequent requests succeed
      for (let i = 0; i < 5; i++) {
        mockTransport.setMockResponse('GET', '/nc-test', 200, { request: i });
      }

      const ncValues: string[] = [];

      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [
          digestAuthPlugin({ username: 'user', password: 'pass', preemptive: true }),
          (client) => {
            client.use(async (req, next) => {
              const auth = req.headers.get('Authorization');
              if (auth) {
                const ncMatch = auth.match(/nc=([0-9a-f]+)/);
                if (ncMatch) {
                  ncValues.push(ncMatch[1]);
                }
              }
              return next(req);
            });
          }
        ]
      });

      // Make 4 requests
      await client.get('/nc-test', { throwHttpErrors: false }); // 401 + retry (nc=1)
      await client.get('/nc-test', { throwHttpErrors: false }); // preemptive (nc=2)
      await client.get('/nc-test', { throwHttpErrors: false }); // preemptive (nc=3)
      await client.get('/nc-test', { throwHttpErrors: false }); // preemptive (nc=4)

      expect(ncValues).toEqual(['00000001', '00000002', '00000003', '00000004']);
    });
  });

  describe('URI Handling', () => {
    it('should include query string in uri parameter', async () => {
      const mockTransport = new MockTransport();

      mockTransport.setMockResponse('GET', '/resource?foo=bar&baz=qux', 401, {}, {
        'WWW-Authenticate': 'Digest realm="realm", nonce="nonce"'
      }, { times: 1 });

      mockTransport.setMockResponse('GET', '/resource?foo=bar&baz=qux', 200, {});

      let authHeader: string | null = null;
      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [
          digestAuthPlugin({ username: 'user', password: 'pass' }),
          (client) => {
            client.use(async (req, next) => {
              if (req.headers.has('Authorization')) {
                authHeader = req.headers.get('Authorization');
              }
              return next(req);
            });
          }
        ]
      });

      await client.get('/resource?foo=bar&baz=qux', { throwHttpErrors: false });

      expect(authHeader).toContain('uri="/resource?foo=bar&baz=qux"');
    });
  });

  describe('Different HTTP Methods', () => {
    it('should work with POST requests', async () => {
      const mockTransport = new MockTransport();

      mockTransport.setMockResponse('POST', '/submit', 401, {}, {
        'WWW-Authenticate': 'Digest realm="realm", nonce="nonce"'
      }, { times: 1 });

      mockTransport.setMockResponse('POST', '/submit', 201, { created: true });

      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [digestAuthPlugin({ username: 'user', password: 'pass' })]
      });

      const res = await client.post('/submit', {
        body: JSON.stringify({ data: 'test' }),
        throwHttpErrors: false
      });
      expect(res.status).toBe(201);
    });

    it('should work with PUT requests', async () => {
      const mockTransport = new MockTransport();

      mockTransport.setMockResponse('PUT', '/update', 401, {}, {
        'WWW-Authenticate': 'Digest realm="realm", nonce="nonce"'
      }, { times: 1 });

      mockTransport.setMockResponse('PUT', '/update', 200, { updated: true });

      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [digestAuthPlugin({ username: 'user', password: 'pass' })]
      });

      const res = await client.put('/update', {
        body: JSON.stringify({ data: 'test' }),
        throwHttpErrors: false
      });
      expect(res.status).toBe(200);
    });

    it('should work with DELETE requests', async () => {
      const mockTransport = new MockTransport();

      mockTransport.setMockResponse('DELETE', '/remove', 401, {}, {
        'WWW-Authenticate': 'Digest realm="realm", nonce="nonce"'
      }, { times: 1 });

      mockTransport.setMockResponse('DELETE', '/remove', 204, '');

      const client = createClient({
        baseUrl,
        transport: mockTransport,
        plugins: [digestAuthPlugin({ username: 'user', password: 'pass' })]
      });

      const res = await client.delete('/remove', { throwHttpErrors: false });
      expect(res.status).toBe(204);
    });
  });
});

// ============================================================================
// OAuth2 Authentication Tests
// ============================================================================

describe('OAuth2 Authentication', () => {
  const baseUrl = 'https://api.example.com';

  it('should add Bearer token to requests', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/data', 200, { data: 'test' });

    let capturedAuth: string | null = null;
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        oauth2Plugin({ accessToken: 'my-access-token' }),
        (client) => {
          client.use(async (req, next) => {
            capturedAuth = req.headers.get('Authorization');
            return next(req);
          });
        }
      ]
    });

    await client.get('/data').json();
    expect(capturedAuth).toBe('Bearer my-access-token');
  });

  it('should support dynamic token provider', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/data', 200, {});

    const tokenProvider = vi.fn(async () => 'dynamic-access-token');

    let capturedAuth: string | null = null;
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        oauth2Plugin({ accessToken: tokenProvider }),
        (client) => {
          client.use(async (req, next) => {
            capturedAuth = req.headers.get('Authorization');
            return next(req);
          });
        }
      ]
    });

    await client.get('/data').json();
    expect(capturedAuth).toBe('Bearer dynamic-access-token');
    expect(tokenProvider).toHaveBeenCalled();
  });

  it('should support custom token type', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/data', 200, {});

    let capturedAuth: string | null = null;
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        oauth2Plugin({ accessToken: 'token', tokenType: 'MAC' }),
        (client) => {
          client.use(async (req, next) => {
            capturedAuth = req.headers.get('Authorization');
            return next(req);
          });
        }
      ]
    });

    await client.get('/data').json();
    expect(capturedAuth).toBe('MAC token');
  });

  it('should refresh token on 401 response', async () => {
    const mockTransport = new MockTransport();

    // First request returns 401
    mockTransport.setMockResponse('GET', '/protected', 401, { error: 'expired' }, {}, { times: 1 });

    // Retry with new token succeeds
    mockTransport.setMockResponse('GET', '/protected', 200, { data: 'success' });

    let currentToken = 'expired-token';
    const onTokenExpired = vi.fn(async () => {
      currentToken = 'refreshed-token';
      return currentToken;
    });

    const capturedTokens: string[] = [];
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        oauth2Plugin({
          accessToken: () => currentToken,
          onTokenExpired
        }),
        (client) => {
          client.use(async (req, next) => {
            const auth = req.headers.get('Authorization');
            if (auth) {
              capturedTokens.push(auth.replace('Bearer ', ''));
            }
            return next(req);
          });
        }
      ]
    });

    const res = await client.get('/protected', { throwHttpErrors: false });
    expect(res.status).toBe(200);
    expect(onTokenExpired).toHaveBeenCalledTimes(1);
    expect(capturedTokens).toContain('expired-token');
    expect(capturedTokens).toContain('refreshed-token');
  });

  it('should return 401 if token refresh fails', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/protected', 401, { error: 'unauthorized' });

    const onTokenExpired = vi.fn(async () => {
      throw new Error('Refresh failed');
    });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        oauth2Plugin({
          accessToken: 'token',
          onTokenExpired
        })
      ]
    });

    const res = await client.get('/protected', { throwHttpErrors: false });
    expect(res.status).toBe(401);
    expect(onTokenExpired).toHaveBeenCalled();
  });

  it('should not call onTokenExpired for non-401 responses', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/data', 403, { error: 'forbidden' });

    const onTokenExpired = vi.fn();

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        oauth2Plugin({
          accessToken: 'token',
          onTokenExpired
        })
      ]
    });

    const res = await client.get('/data', { throwHttpErrors: false });
    expect(res.status).toBe(403);
    expect(onTokenExpired).not.toHaveBeenCalled();
  });
});

// ============================================================================
// AWS Signature V4 Authentication Tests
// ============================================================================

describe('AWS Signature V4 Authentication', () => {
  const baseUrl = 'https://execute-api.us-east-1.amazonaws.com';

  it('should add AWS signature headers', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/prod/items', 200, { items: [] });

    const capturedHeaders: Record<string, string> = {};
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        awsSignatureV4Plugin({
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          region: 'us-east-1',
          service: 'execute-api'
        }),
        (client) => {
          client.use(async (req, next) => {
            req.headers.forEach((value, key) => {
              capturedHeaders[key.toLowerCase()] = value;
            });
            return next(req);
          });
        }
      ]
    });

    await client.get('/prod/items').json();

    expect(capturedHeaders['authorization']).toBeTruthy();
    expect(capturedHeaders['authorization']).toContain('AWS4-HMAC-SHA256');
    expect(capturedHeaders['authorization']).toContain('Credential=AKIAIOSFODNN7EXAMPLE');
    expect(capturedHeaders['authorization']).toContain('SignedHeaders=');
    expect(capturedHeaders['authorization']).toContain('Signature=');
    expect(capturedHeaders['x-amz-date']).toBeTruthy();
    expect(capturedHeaders['x-amz-content-sha256']).toBeTruthy();
  });

  it('should include session token when provided', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/items', 200, {});

    const capturedHeaders: Record<string, string> = {};
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        awsSignatureV4Plugin({
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          region: 'us-east-1',
          service: 'execute-api',
          sessionToken: 'FwoGZXIvYXdzE...'
        }),
        (client) => {
          client.use(async (req, next) => {
            req.headers.forEach((value, key) => {
              capturedHeaders[key.toLowerCase()] = value;
            });
            return next(req);
          });
        }
      ]
    });

    await client.get('/items').json();

    expect(capturedHeaders['x-amz-security-token']).toBe('FwoGZXIvYXdzE...');
  });

  it('should sign POST request with body', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('POST', '/items', 201, { id: '123' });

    let capturedAuth: string | null = null;
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        awsSignatureV4Plugin({
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          region: 'us-east-1',
          service: 'execute-api'
        }),
        (client) => {
          client.use(async (req, next) => {
            capturedAuth = req.headers.get('Authorization');
            return next(req);
          });
        }
      ]
    });

    await client.post('/items', {
      body: JSON.stringify({ name: 'Test Item' }),
      headers: { 'Content-Type': 'application/json' }
    }).json();

    expect(capturedAuth).toBeTruthy();
    expect(capturedAuth).toContain('AWS4-HMAC-SHA256');
  });

  it('should handle query parameters in URL', async () => {
    const mockTransport = new MockTransport();
    // Register the mock with query params included in path
    mockTransport.setMockResponse('GET', '/items?category=books&sort=price', 200, { items: [] });

    let capturedAuth: string | null = null;
    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        awsSignatureV4Plugin({
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          region: 'us-east-1',
          service: 'execute-api'
        }),
        (client) => {
          client.use(async (req, next) => {
            capturedAuth = req.headers.get('Authorization');
            return next(req);
          });
        }
      ]
    });

    await client.get('/items?category=books&sort=price').json();

    // Signature should be present (calculated with query params)
    expect(capturedAuth).toContain('Signature=');
  });

  it('should work with different AWS services', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('PUT', '/my-bucket/my-key', 200, '');

    let capturedAuth: string | null = null;
    const client = createClient({
      baseUrl: 'https://s3.us-west-2.amazonaws.com',
      transport: mockTransport,
      plugins: [
        awsSignatureV4Plugin({
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          region: 'us-west-2',
          service: 's3'
        }),
        (client) => {
          client.use(async (req, next) => {
            capturedAuth = req.headers.get('Authorization');
            return next(req);
          });
        }
      ]
    });

    await client.put('/my-bucket/my-key', { body: 'file content' });

    expect(capturedAuth).toContain('us-west-2');
    expect(capturedAuth).toContain('s3');
  });
});

// ============================================================================
// Plugin Composition Tests
// ============================================================================

describe('Auth Plugin Composition', () => {
  const baseUrl = 'https://api.example.com';

  it('should work with retry plugin', async () => {
    const mockTransport = new MockTransport();

    // First two attempts fail with 500
    mockTransport.setMockResponse('GET', '/flaky', 500, { error: 'Server Error' }, {}, { times: 2 });

    // Third attempt returns 401
    mockTransport.setMockResponse('GET', '/flaky', 401, {}, {
      'WWW-Authenticate': 'Digest realm="realm", nonce="nonce"'
    }, { times: 1 });

    // Fourth attempt (with auth) succeeds
    mockTransport.setMockResponse('GET', '/flaky', 200, { success: true });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      retry: {
        maxAttempts: 3,
        delay: 10,
        retryOn: [500]
      },
      plugins: [
        digestAuthPlugin({ username: 'user', password: 'pass' })
      ]
    });

    const res = await client.get('/flaky', { throwHttpErrors: false });
    // After retry exhausts (2 x 500), we get 401, then auth succeeds with 200
    expect(res.status).toBe(200);
  });

  it('should allow multiple auth methods on different endpoints', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/api/public', 200, { public: true });
    mockTransport.setMockResponse('GET', '/api/protected', 200, { protected: true });

    const capturedHeaders: Map<string, string | null> = new Map();

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        // Conditional auth middleware
        (client) => {
          client.use(async (req, next) => {
            if (req.url.includes('/protected')) {
              const authReq = req.withHeader('Authorization', 'Bearer secret-token');
              return next(authReq);
            }
            return next(req);
          });
        },
        (client) => {
          client.use(async (req, next) => {
            capturedHeaders.set(req.url, req.headers.get('Authorization'));
            return next(req);
          });
        }
      ]
    });

    await client.get('/api/public');
    await client.get('/api/protected');

    expect(capturedHeaders.get('https://api.example.com/api/public')).toBeNull();
    expect(capturedHeaders.get('https://api.example.com/api/protected')).toBe('Bearer secret-token');
  });
});

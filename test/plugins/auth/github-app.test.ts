import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { githubApp, createGitHubAppJWT, listGitHubAppInstallations, getGitHubAppInstallationForRepo, getGitHubAppInfo } from '../../../src/plugins/auth/github-app.js';
import { HttpRequest } from '../../../src/core/request.js';

// Mock Node.js crypto functions globally for tests that use them
vi.mock('node:crypto', async (importOriginal) => {
  const actualCrypto = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actualCrypto,
    createPrivateKey: vi.fn(() => ({
      // Mocked key object - minimal properties needed for sign.sign()
      export: () => 'mock-private-key'
    })),
    createSign: vi.fn(() => ({
      update: vi.fn(),
      sign: vi.fn().mockReturnValue('mock-jwt-signature')
    }))
  };
});

// Mock private key for testing
const mockPrivateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA2mKqH0dSvEjS3pO3vEgLvUcS7FJUDgwrqyDG3Fo6xQiNpJbE
Pl8pNlEfz2mwGqRPVFyqKqJKHQyVxLCRlvLmKg4u8M8t4vvRqJlAREW2EIbEj3Qn
5kGEqCcM6V/kCRQ5FVFDfnrBzYjuM3jTCpGQBKqPkLG1KfkSjdGQMzRdxqLHvxLK
WTKnHnN5c1XHQ5LXBK5BqG2xEVFDcJ9kLxYGvJFplJ7knGzjnJITHCmvBvLqIxjF
Ov5Kv0V5BqLKq5YKH7NiMXh5aFqClDqTXJc5PJxA5qJKQb0AE4sxJL5c5KPqUhRe
oYCZdqPK5FvL6qL6Rn8HxN6xc8aZYFkPEwIDAQABAoIBAC0Xq5F5rqJOjCQHKgBq
q9IhDPPnLfqZCN4hqQpO8FuFHQpLR7LNDW6dP8hLJp0qGzmU0kAb7M2sL0aKqPCn
yvSG3w3LlPgMiX8cqlqPUFqpPvXzB+qhOPStF6tN3p9pL+nqNX0VzT6JMj2zxLJL
P+d5LLQM8aKjP/tS5HUgGYBJJlxdqQmJDdqhzLGTdBLfPwf8h3q0tBrgFxf5LDQS
CyhvAHN8QLB5pK5w/i2vn7pAH5qM5Kz0gGzQ5lm4zMLB5M4k5gWKHGW5qJLb/sFR
zxEq9LTBN5j2QRXI5kVYHBQWF5qx2P5k6MzJV0RqMdLnHV5g7O0Z8qG5L7vZdF0k
i4ECgYEA8TqHnFqfPHgXjsZ3l9Z3kLYLJBuqVJFqDRhZlVpLCkVWVVB8RDGT9g7i
MLnSxLMTVlxMpPvlBhH5lFHxRgpnP7l5kPvnPLbCdVqE8ryUDsDChrNrd5Xpvlva
b0jEqPc5E/xVLd0BVJBPVLAJ1mV+LdwFHF5PnLqCPLJT3qT8alkCgYEA5q8LHBHV
kTfBsF0P8qC0qOg1FlFEglPU0kT0lT8j0KVrWFIBKPleNWPVIhGQqmblAk0VJAER
QS7BdxsXO8VjCPFED0qYvLg/LEb8MLGQ1JIx2bgN0Xpl9bp8j1DXPxvNTPF9T0b0
PLWCTpWl7jgKZHLkd0lPDp/f2b7J8RGQx9MCgYEAyvOcPJqRWpDjM1BrIZ5Fed5v
fmGB0hLPLBf0NnLzEN1b0FMXC0X7lX1VF7TqFDhr1bxp8qzjTNBUVlqiJDrAoWEF
WBxdSKDv3xH7PZCWHDKqfPFLxuzPWR6ShKrpFN1bQhLaG0MWGC12kPkPVvCJPDXF
M9QDbvMEeL0PoMQVwYkCgYBuPLGh2JMknqVRzB1T4QDK0qA3JQl7FLCgxQDz8mCH
JXC0h7gflFed8GXQP5pE0bCy0fF9QTBYU5L2kPzC5pV0JDdBHxjfHeCPRvF5N8lJ
+sN3JC0bcPM1UzXLFZezMJM7F0K7yfTP5VZ88wLFf5Xqr7n3imLbV0dE8AQFK6Fp
CQKBgQCj+4EGB5Nn3EiBLzmlkrLPfE5bnq0M0np/kL0EfNB8O1p+S6F0HCKqYzxE
0mMmFmdijPOFR5lB7hEx5xWK5jz5VY7iOiV7gPGvdnNo5dJhI5bjMWvLfyjhPvk8
i8SM2bH++cZdxl6fJ8qFCp0bsq+xK1M3F0zcDCqxXXdGKxhDIg==
-----END RSA PRIVATE KEY-----`;

describe('GitHub App Auth Plugin', () => {
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    next = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers()
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createGitHubAppJWT', () => {
    it('should create a valid JWT', () => {
      const jwt = createGitHubAppJWT('12345', mockPrivateKey);

      expect(jwt).toBeDefined();
      const parts = jwt.split('.');
      expect(parts).toHaveLength(3);

      // Decode header
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      expect(header.alg).toBe('RS256');
      expect(header.typ).toBe('JWT');

      // Decode payload
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      expect(payload.iss).toBe('12345');
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
      // JWT should expire in ~10 minutes
      expect(payload.exp - payload.iat).toBeLessThanOrEqual(660);
    });

    it('should accept numeric app ID', () => {
      const jwt = createGitHubAppJWT(12345, mockPrivateKey);
      const parts = jwt.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      expect(payload.iss).toBe('12345');
    });
  });

  describe('listGitHubAppInstallations', () => {
    it('should list app installations', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([
        {
          id: 123,
          account: { login: 'my-org', type: 'Organization' },
          repository_selection: 'all',
          permissions: { contents: 'write', pull_requests: 'write' },
        },
        {
          id: 456,
          account: { login: 'other-org', type: 'Organization' },
          repository_selection: 'selected',
          permissions: { contents: 'read' },
        },
      ])));

      const installations = await listGitHubAppInstallations('12345', mockPrivateKey);

      expect(installations).toHaveLength(2);
      expect(installations[0].id).toBe(123);
      expect(installations[0].account.login).toBe('my-org');
    });

    it('should use custom base URL for GitHub Enterprise', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([])));

      await listGitHubAppInstallations('12345', mockPrivateKey, 'https://github.mycompany.com/api/v3');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://github.mycompany.com/api/v3/app/installations',
        expect.any(Object)
      );
    });

    it('should throw error on failure', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        message: 'Bad credentials',
      }), { status: 401 }));

      await expect(listGitHubAppInstallations('12345', mockPrivateKey))
        .rejects.toThrow('Failed to list installations');
    });
  });

  describe('getGitHubAppInstallationForRepo', () => {
    it('should get installation ID for a repo', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        id: 789,
      })));

      const installationId = await getGitHubAppInstallationForRepo(
        '12345',
        mockPrivateKey,
        'owner',
        'repo'
      );

      expect(installationId).toBe(789);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/installation',
        expect.any(Object)
      );
    });

    it('should throw error if app not installed', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        message: 'Not Found',
      }), { status: 404 }));

      await expect(getGitHubAppInstallationForRepo('12345', mockPrivateKey, 'owner', 'repo'))
        .rejects.toThrow('Failed to get installation');
    });
  });

  describe('getGitHubAppInfo', () => {
    it('should get app metadata', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        id: 12345,
        slug: 'my-app',
        name: 'My App',
        owner: { login: 'my-org' },
        permissions: { contents: 'write' },
      })));

      const info = await getGitHubAppInfo('12345', mockPrivateKey);

      expect(info.id).toBe(12345);
      expect(info.slug).toBe('my-app');
    });
  });

  describe('githubApp middleware', () => {
    it('should add Bearer token from static installationToken', async () => {
      const middleware = githubApp({
        appId: '12345',
        privateKey: mockPrivateKey,
        installationToken: 'ghs_xxxxxxxxxxxx',
      });

      const req = new HttpRequest('https://api.github.com/repos/owner/repo', { method: 'GET' });
      await middleware(req, next);

      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer ghs_xxxxxxxxxxxx');
      expect(modifiedReq.headers.get('Accept')).toBe('application/vnd.github+json');
      expect(modifiedReq.headers.get('X-GitHub-Api-Version')).toBe('2022-11-28');
    });

    it('should support dynamic installationToken function', async () => {
      const tokenFn = vi.fn().mockResolvedValue('ghs_dynamic_token');

      const middleware = githubApp({
        appId: '12345',
        privateKey: mockPrivateKey,
        installationToken: tokenFn,
      });

      const req = new HttpRequest('https://api.github.com/repos/owner/repo', { method: 'GET' });
      await middleware(req, next);

      expect(tokenFn).toHaveBeenCalled();
      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer ghs_dynamic_token');
    });

    it('should exchange JWT for installation token', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        token: 'ghs_installation_token',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        permissions: { contents: 'write' },
        repository_selection: 'all',
      })));

      const middleware = githubApp({
        appId: '12345',
        privateKey: mockPrivateKey,
        installationId: '67890',
      });

      const req = new HttpRequest('https://api.github.com/repos/owner/repo', { method: 'GET' });
      await middleware(req, next);

      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer ghs_installation_token');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.github.com/app/installations/67890/access_tokens',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should cache installation token', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValue(new Response(JSON.stringify({
        token: 'ghs_cached_token',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        permissions: {},
        repository_selection: 'all',
      })));

      const middleware = githubApp({
        appId: '12345',
        privateKey: mockPrivateKey,
        installationId: '67890',
      });

      const req = new HttpRequest('https://api.github.com/repos/owner/repo', { method: 'GET' });

      // First request - should fetch token
      await middleware(req, next);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Second request - should use cached token
      await middleware(req, next);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should request limited permissions', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        token: 'ghs_limited_token',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        permissions: { contents: 'read' },
        repository_selection: 'all',
      })));

      const middleware = githubApp({
        appId: '12345',
        privateKey: mockPrivateKey,
        installationId: '67890',
        permissions: { contents: 'read' },
      });

      const req = new HttpRequest('https://api.github.com/repos/owner/repo', { method: 'GET' });
      await middleware(req, next);

      const body = fetchMock.mock.calls[0][1]?.body as string;
      expect(body).toContain('permissions');
    });

    it('should request specific repositories', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        token: 'ghs_repo_token',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        permissions: {},
        repository_selection: 'selected',
      })));

      const middleware = githubApp({
        appId: '12345',
        privateKey: mockPrivateKey,
        installationId: '67890',
        repositories: ['my-repo', 'other-repo'],
      });

      const req = new HttpRequest('https://api.github.com/repos/owner/repo', { method: 'GET' });
      await middleware(req, next);

      const body = fetchMock.mock.calls[0][1]?.body as string;
      expect(body).toContain('repositories');
    });

    it('should refresh token on 401', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock
        .mockResolvedValueOnce(new Response(JSON.stringify({
          token: 'ghs_first_token',
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          permissions: {},
          repository_selection: 'all',
        })))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          token: 'ghs_refreshed_token',
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          permissions: {},
          repository_selection: 'all',
        })));

      const next401 = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 401, headers: new Headers() })
        .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers() });

      const middleware = githubApp({
        appId: '12345',
        privateKey: mockPrivateKey,
        installationId: '67890',
      });

      const req = new HttpRequest('https://api.github.com/repos/owner/repo', { method: 'GET' });
      await middleware(req, next401);

      expect(next401).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should throw error without installation ID', async () => {
      const middleware = githubApp({
        appId: '12345',
        privateKey: mockPrivateKey,
        // No installationId or installationToken
      });

      const req = new HttpRequest('https://api.github.com/repos/owner/repo', { method: 'GET' });

      await expect(middleware(req, next)).rejects.toThrow('Installation ID is required');
    });

    it('should use custom base URL for GitHub Enterprise', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        token: 'ghs_enterprise_token',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        permissions: {},
        repository_selection: 'all',
      })));

      const middleware = githubApp({
        appId: '12345',
        privateKey: mockPrivateKey,
        installationId: '67890',
        baseUrl: 'https://github.mycompany.com/api/v3',
      });

      const req = new HttpRequest('https://github.mycompany.com/api/v3/repos/owner/repo', { method: 'GET' });
      await middleware(req, next);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://github.mycompany.com/api/v3/app/installations/67890/access_tokens',
        expect.any(Object)
      );
    });

    it('should use token storage for caching', async () => {
      const tokenStorage = {
        get: vi.fn().mockResolvedValue({
          token: 'ghs_stored_token',
          expiresAt: Date.now() + 3600000,
          permissions: {},
          repositorySelection: 'all',
        }),
        set: vi.fn(),
      };

      const middleware = githubApp({
        appId: '12345',
        privateKey: mockPrivateKey,
        installationId: '67890',
        tokenStorage,
      });

      const req = new HttpRequest('https://api.github.com/repos/owner/repo', { method: 'GET' });
      await middleware(req, next);

      expect(tokenStorage.get).toHaveBeenCalled();
      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer ghs_stored_token');
    });
  });
});

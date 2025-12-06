import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { firebase, createFirebaseCustomToken, verifyFirebaseIdToken } from '../../../src/plugins/auth/firebase.js';
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

// Mock service account credentials
const mockServiceAccount = {
  type: 'service_account' as const,
  project_id: 'test-project',
  private_key_id: 'key-id-123',
  private_key: `-----BEGIN RSA PRIVATE KEY-----
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
-----END RSA PRIVATE KEY-----`,
  client_email: 'test@test-project.iam.gserviceaccount.com',
  client_id: '123456789',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
};

describe('Firebase Auth Plugin', () => {
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

  describe('createFirebaseCustomToken', () => {
    it('should create a valid JWT custom token', () => {
      const token = createFirebaseCustomToken(mockServiceAccount, 'user-123');

      expect(token).toBeDefined();
      const parts = token.split('.');
      expect(parts).toHaveLength(3);

      // Decode header
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      expect(header.alg).toBe('RS256');
      expect(header.typ).toBe('JWT');

      // Decode payload
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      expect(payload.iss).toBe(mockServiceAccount.client_email);
      expect(payload.sub).toBe(mockServiceAccount.client_email);
      expect(payload.uid).toBe('user-123');
      expect(payload.aud).toContain('identitytoolkit.googleapis.com');
    });

    it('should include custom claims', () => {
      const customClaims = { role: 'admin', team: 'engineering' };
      const token = createFirebaseCustomToken(mockServiceAccount, 'user-123', customClaims);

      const parts = token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

      expect(payload.claims).toEqual(customClaims);
    });
  });

  describe('verifyFirebaseIdToken', () => {
    it('should verify valid token', async () => {
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: 'https://securetoken.google.com/test-project',
        aud: 'test-project',
        sub: 'user-123',
        iat: now - 60,
        exp: now + 3600,
        email: 'user@example.com',
      };

      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const mockToken = `${header}.${payloadB64}.signature`;

      const result = await verifyFirebaseIdToken('test-project', mockToken);

      expect(result.sub).toBe('user-123');
      expect(result.email).toBe('user@example.com');
    });

    it('should reject invalid issuer', async () => {
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: 'https://wrong-issuer.com/test-project',
        aud: 'test-project',
        exp: now + 3600,
      };

      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const mockToken = `${header}.${payloadB64}.signature`;

      await expect(verifyFirebaseIdToken('test-project', mockToken))
        .rejects.toThrow('Invalid token issuer');
    });

    it('should reject invalid audience', async () => {
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: 'https://securetoken.google.com/test-project',
        aud: 'wrong-project',
        exp: now + 3600,
      };

      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const mockToken = `${header}.${payloadB64}.signature`;

      await expect(verifyFirebaseIdToken('test-project', mockToken))
        .rejects.toThrow('Invalid token audience');
    });

    it('should reject expired token', async () => {
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: 'https://securetoken.google.com/test-project',
        aud: 'test-project',
        exp: now - 3600, // Expired
      };

      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const mockToken = `${header}.${payloadB64}.signature`;

      await expect(verifyFirebaseIdToken('test-project', mockToken))
        .rejects.toThrow('Token expired');
    });
  });

  describe('firebase middleware', () => {
    it('should add Bearer token from static idToken', async () => {
      const middleware = firebase({
        projectId: 'test-project',
        idToken: 'test-id-token',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer test-id-token');
    });

    it('should support dynamic idToken function', async () => {
      const tokenFn = vi.fn().mockResolvedValue('dynamic-firebase-token');

      const middleware = firebase({
        projectId: 'test-project',
        idToken: tokenFn,
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      expect(tokenFn).toHaveBeenCalled();
      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer dynamic-firebase-token');
    });

    it('should use service account for server-side auth', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'service-account-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })));

      const middleware = firebase({
        projectId: 'test-project',
        serviceAccount: mockServiceAccount,
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer service-account-token');
    });

    it('should throw error when no auth method available', async () => {
      const middleware = firebase({
        projectId: 'test-project',
        // No idToken, serviceAccount, or customToken
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });

      await expect(middleware(req, next)).rejects.toThrow('No valid authentication method');
    });

    it('should refresh token on 401', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      // Mock PROACTIVE refresh call (inside getToken) to SUCCEED (1st fetch call)
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        id_token: 'proactive-fresh-token',
        refresh_token: 'new-refresh-token', // It might return new refresh token
        expires_in: '3600',
      })));

      // Mock REACTIVE refresh call (after 401) to succeed (2nd fetch call)
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        id_token: 'reactive-fresh-token',
        refresh_token: 'new-refresh-token',
        expires_in: '3600',
      })));

      const next401 = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 401, headers: new Headers() }) // First request fails with 401
        .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers() }); // Second request (retry) succeeds

      const tokenStorage = {
        get: vi.fn().mockResolvedValue({
          idToken: 'old-token',
          refreshToken: 'old-refresh-token',
          expiresAt: Date.now() - 1000, // Expired
        }),
        set: vi.fn(),
      };

      const middleware = firebase({
        projectId: 'test-project',
        apiKey: 'api-key',
        tokenStorage,
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next401);

      expect(next401).toHaveBeenCalledTimes(2);
      expect(tokenStorage.set).toHaveBeenCalled();
    });

    it('should use token from storage if valid', async () => {
      const tokenStorage = {
        get: vi.fn().mockResolvedValue({
          idToken: 'stored-token',
          refreshToken: 'refresh-token',
          expiresAt: Date.now() + 3600000, // Valid for 1 hour
        }),
        set: vi.fn(),
      };

      const middleware = firebase({
        projectId: 'test-project',
        apiKey: 'api-key',
        tokenStorage,
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer stored-token');
    });

    it('should exchange custom token for ID token', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        idToken: 'exchanged-id-token',
        refreshToken: 'new-refresh-token',
        expiresIn: '3600',
      })));

      const middleware = firebase({
        projectId: 'test-project',
        apiKey: 'api-key',
        customToken: 'custom-token',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer exchanged-id-token');
    });
  });
});

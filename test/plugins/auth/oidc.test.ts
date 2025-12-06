import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  oidc,
  oidcPlugin,
  generatePKCE,
  generateAuthorizationUrl,
  fetchDiscoveryDocument,
  exchangeCode,
  refreshTokens,
  clientCredentialsFlow,
  type OIDCTokens,
} from '../../../src/plugins/auth/oidc.js';
import { HttpRequest } from '../../../src/core/request.js';

describe('OIDC Auth Plugin', () => {
  let next: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.spyOn>;

  const mockDiscoveryDoc = {
    issuer: 'https://auth.example.com',
    token_endpoint: 'https://auth.example.com/oauth/token',
    authorization_endpoint: 'https://auth.example.com/authorize',
    userinfo_endpoint: 'https://auth.example.com/userinfo',
    jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
  };

  beforeEach(() => {
    next = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers()
    });
    fetchMock = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generatePKCE', () => {
    it('should generate valid PKCE code verifier and challenge', () => {
      const pkce = generatePKCE();

      expect(pkce.codeVerifier).toBeDefined();
      expect(pkce.codeChallenge).toBeDefined();
      expect(pkce.codeVerifier.length).toBeGreaterThan(40);
      expect(pkce.codeChallenge.length).toBeGreaterThan(40);
      // Code challenge should be base64url encoded
      expect(pkce.codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should generate unique PKCE values each time', () => {
      const pkce1 = generatePKCE();
      const pkce2 = generatePKCE();

      expect(pkce1.codeVerifier).not.toBe(pkce2.codeVerifier);
      expect(pkce1.codeChallenge).not.toBe(pkce2.codeChallenge);
    });
  });

  describe('oidc middleware with accessToken', () => {
    it('should add Bearer token from static accessToken', async () => {
      const middleware = oidc({
        issuer: 'https://accounts.google.com',
        clientId: 'test-client-id',
        accessToken: 'test-access-token',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer test-access-token');
    });

    it('should support dynamic accessToken function', async () => {
      const tokenFn = vi.fn().mockResolvedValue('dynamic-token');

      const middleware = oidc({
        issuer: 'https://accounts.google.com',
        clientId: 'test-client-id',
        accessToken: tokenFn,
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      expect(tokenFn).toHaveBeenCalled();
      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer dynamic-token');
    });
  });

  describe('token refresh on 401', () => {
    it('should attempt refresh when 401 received with refreshToken', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');

      // Mock discovery document (1st fetch call)
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        issuer: 'https://auth.example.com',
        token_endpoint: 'https://auth.example.com/token',
        authorization_endpoint: 'https://auth.example.com/authorize',
        jwks_uri: 'https://auth.example.com/.well-known/jwks.json',
        response_types_supported: ['code'],
      })));

      // Mock PROACTIVE token refresh call to SUCCEED (2nd fetch call in getTokens)
      // This means the token received by the middleware is initially "fresh".
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'proactive-fresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })));

      // Mock the REACTIVE token refresh call (3rd fetch call, after 401)
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'new-access-token-after-401',
        refresh_token: 'new-refresh-token-after-401',
        expires_in: 3600,
        token_type: 'Bearer',
      })));

      // First call to next returns 401 (simulating expiry despite proactive refresh),
      // second call (retry) returns 200.
      const next401 = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 401, headers: new Headers() }) // First request fails with 401
        .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers() }); // Second request (retry) succeeds

      const middleware = oidc({
        issuer: 'https://auth.example.com',
        clientId: 'test-client-id',
        refreshToken: 'old-refresh-token', // Only provide refreshToken
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next401);

      // Should have called next twice (initial + retry)
      expect(next401).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchDiscoveryDocument', () => {
    it('should fetch and return discovery document', async () => {
      // Use a unique issuer to avoid cache conflicts
      const uniqueIssuer = `https://unique-issuer-${Date.now()}.example.com`;
      const doc = {
        ...mockDiscoveryDoc,
        issuer: uniqueIssuer,
        token_endpoint: `${uniqueIssuer}/oauth/token`,
        authorization_endpoint: `${uniqueIssuer}/authorize`,
      };
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(doc)));

      const result = await fetchDiscoveryDocument(uniqueIssuer);

      expect(result.issuer).toBe(uniqueIssuer);
      expect(result.token_endpoint).toBe(`${uniqueIssuer}/oauth/token`);
      expect(result.authorization_endpoint).toBe(`${uniqueIssuer}/authorize`);
    });

    it('should strip trailing slash from issuer', async () => {
      const uniqueIssuer = `https://trailing-slash-${Date.now()}.example.com`;
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        ...mockDiscoveryDoc,
        issuer: uniqueIssuer,
      })));

      await fetchDiscoveryDocument(`${uniqueIssuer}/`);

      expect(fetchMock).toHaveBeenCalledWith(
        `${uniqueIssuer}/.well-known/openid-configuration`
      );
    });

    it('should throw on fetch failure', async () => {
      const uniqueIssuer = `https://invalid-${Date.now()}.example.com`;
      fetchMock.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

      await expect(fetchDiscoveryDocument(uniqueIssuer))
        .rejects.toThrow('Failed to fetch OIDC discovery document: 404');
    });

    it('should use custom fetch if provided', async () => {
      const uniqueIssuer = `https://custom-fetch-${Date.now()}.example.com`;
      const customFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        ...mockDiscoveryDoc,
        issuer: uniqueIssuer,
      })));

      await fetchDiscoveryDocument(uniqueIssuer, customFetch);

      expect(customFetch).toHaveBeenCalled();
    });
  });

  describe('exchangeCode', () => {
    it('should exchange authorization code for tokens', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-456',
        id_token: 'id-token-789',
        expires_in: 3600,
        token_type: 'Bearer',
      })));

      const tokens = await exchangeCode(
        mockDiscoveryDoc,
        { issuer: 'https://auth.example.com', clientId: 'client-123', redirectUri: 'https://app.example.com/callback' },
        'auth-code-xyz'
      );

      expect(tokens.accessToken).toBe('access-token-123');
      expect(tokens.refreshToken).toBe('refresh-token-456');
      expect(tokens.idToken).toBe('id-token-789');
      expect(tokens.expiresAt).toBeDefined();
      expect(tokens.tokenType).toBe('Bearer');
    });

    it('should include client_secret when provided', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'access-token',
        expires_in: 3600,
      })));

      await exchangeCode(
        mockDiscoveryDoc,
        { issuer: 'https://auth.example.com', clientId: 'client-123', clientSecret: 'secret-abc', redirectUri: 'https://app.example.com/callback' },
        'auth-code-xyz'
      );

      const body = fetchMock.mock.calls[0][1]?.body as string;
      expect(body).toContain('client_secret=secret-abc');
    });

    it('should include code_verifier for PKCE', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'access-token',
        expires_in: 3600,
      })));

      await exchangeCode(
        mockDiscoveryDoc,
        { issuer: 'https://auth.example.com', clientId: 'client-123', redirectUri: 'https://app.example.com/callback' },
        'auth-code-xyz',
        'verifier-string'
      );

      const body = fetchMock.mock.calls[0][1]?.body as string;
      expect(body).toContain('code_verifier=verifier-string');
    });

    it('should throw on exchange failure', async () => {
      fetchMock.mockResolvedValueOnce(new Response('invalid_grant', { status: 400 }));

      await expect(exchangeCode(
        mockDiscoveryDoc,
        { issuer: 'https://auth.example.com', clientId: 'client-123', redirectUri: 'https://app.example.com/callback' },
        'invalid-code'
      )).rejects.toThrow('Token exchange failed');
    });

    it('should use default token_type if not returned', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'access-token',
      })));

      const tokens = await exchangeCode(
        mockDiscoveryDoc,
        { issuer: 'https://auth.example.com', clientId: 'client-123', redirectUri: 'https://app.example.com/callback' },
        'auth-code'
      );

      expect(tokens.tokenType).toBe('Bearer');
    });
  });

  describe('refreshTokens', () => {
    it('should refresh access token using refresh token', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        id_token: 'new-id-token',
        expires_in: 7200,
        token_type: 'Bearer',
      })));

      const tokens = await refreshTokens(
        mockDiscoveryDoc,
        { issuer: 'https://auth.example.com', clientId: 'client-123' },
        'old-refresh-token'
      );

      expect(tokens.accessToken).toBe('new-access-token');
      expect(tokens.refreshToken).toBe('new-refresh-token');
      expect(tokens.idToken).toBe('new-id-token');
    });

    it('should keep old refresh token if not returned', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'new-access-token',
        expires_in: 3600,
      })));

      const tokens = await refreshTokens(
        mockDiscoveryDoc,
        { issuer: 'https://auth.example.com', clientId: 'client-123' },
        'old-refresh-token'
      );

      expect(tokens.refreshToken).toBe('old-refresh-token');
    });

    it('should include client_secret when provided', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'new-access-token',
        expires_in: 3600,
      })));

      await refreshTokens(
        mockDiscoveryDoc,
        { issuer: 'https://auth.example.com', clientId: 'client-123', clientSecret: 'secret-abc' },
        'refresh-token'
      );

      const body = fetchMock.mock.calls[0][1]?.body as string;
      expect(body).toContain('client_secret=secret-abc');
    });

    it('should throw on refresh failure', async () => {
      fetchMock.mockResolvedValueOnce(new Response('invalid_grant', { status: 400 }));

      await expect(refreshTokens(
        mockDiscoveryDoc,
        { issuer: 'https://auth.example.com', clientId: 'client-123' },
        'invalid-refresh-token'
      )).rejects.toThrow('Token refresh failed');
    });
  });

  describe('clientCredentialsFlow', () => {
    it('should perform client credentials flow', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'm2m-access-token',
        expires_in: 86400,
        token_type: 'Bearer',
      })));

      const tokens = await clientCredentialsFlow(
        mockDiscoveryDoc,
        { issuer: 'https://auth.example.com', clientId: 'client-123', clientSecret: 'secret-abc' }
      );

      expect(tokens.accessToken).toBe('m2m-access-token');
      expect(tokens.expiresAt).toBeDefined();
    });

    it('should throw without clientSecret', async () => {
      await expect(clientCredentialsFlow(
        mockDiscoveryDoc,
        { issuer: 'https://auth.example.com', clientId: 'client-123' }
      )).rejects.toThrow('Client credentials flow requires clientSecret');
    });

    it('should include scopes when provided', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'm2m-access-token',
        expires_in: 86400,
      })));

      await clientCredentialsFlow(
        mockDiscoveryDoc,
        { issuer: 'https://auth.example.com', clientId: 'client-123', clientSecret: 'secret-abc', scopes: ['read:users', 'write:users'] }
      );

      const body = fetchMock.mock.calls[0][1]?.body as string;
      expect(body).toContain('scope=read%3Ausers+write%3Ausers');
    });

    it('should include audience when provided', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'm2m-access-token',
        expires_in: 86400,
      })));

      await clientCredentialsFlow(
        mockDiscoveryDoc,
        { issuer: 'https://auth.example.com', clientId: 'client-123', clientSecret: 'secret-abc', audience: 'https://api.example.com' }
      );

      const body = fetchMock.mock.calls[0][1]?.body as string;
      expect(body).toContain('audience=https%3A%2F%2Fapi.example.com');
    });

    it('should throw on flow failure', async () => {
      fetchMock.mockResolvedValueOnce(new Response('access_denied', { status: 403 }));

      await expect(clientCredentialsFlow(
        mockDiscoveryDoc,
        { issuer: 'https://auth.example.com', clientId: 'client-123', clientSecret: 'secret-abc' }
      )).rejects.toThrow('Client credentials flow failed');
    });
  });

  describe('generateAuthorizationUrl', () => {
    it('should generate valid authorization URL', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(mockDiscoveryDoc)));

      const url = await generateAuthorizationUrl({
        issuer: 'https://auth.example.com',
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        scopes: ['openid', 'profile', 'email'],
      });

      expect(url).toContain('https://auth.example.com/authorize');
      expect(url).toContain('client_id=client-123');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('scope=openid+profile+email');
      expect(url).toContain('response_type=code');
    });

    it('should include state parameter', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(mockDiscoveryDoc)));

      const url = await generateAuthorizationUrl({
        issuer: 'https://auth.example.com',
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        state: 'random-state-value',
      });

      expect(url).toContain('state=random-state-value');
    });

    it('should include nonce parameter', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(mockDiscoveryDoc)));

      const url = await generateAuthorizationUrl({
        issuer: 'https://auth.example.com',
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        nonce: 'nonce-value-123',
      });

      expect(url).toContain('nonce=nonce-value-123');
    });

    it('should include PKCE code_challenge', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(mockDiscoveryDoc)));
      const pkce = generatePKCE();

      const url = await generateAuthorizationUrl({
        issuer: 'https://auth.example.com',
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        pkce: { codeChallenge: pkce.codeChallenge },
      });

      expect(url).toContain('code_challenge=');
      expect(url).toContain('code_challenge_method=S256');
    });

    it('should include audience parameter', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(mockDiscoveryDoc)));

      const url = await generateAuthorizationUrl({
        issuer: 'https://auth.example.com',
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
        audience: 'https://api.example.com',
      });

      expect(url).toContain('audience=');
    });

    it('should use default scopes if not provided', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(mockDiscoveryDoc)));

      const url = await generateAuthorizationUrl({
        issuer: 'https://auth.example.com',
        clientId: 'client-123',
        redirectUri: 'https://app.example.com/callback',
      });

      expect(url).toContain('scope=openid');
    });
  });

  describe('oidc middleware with clientCredentials', () => {
    it('should use client credentials flow when clientSecret is provided', async () => {
      const uniqueIssuer = `https://cc-flow-${Date.now()}.example.com`;
      // Mock discovery document
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        ...mockDiscoveryDoc,
        issuer: uniqueIssuer,
        token_endpoint: `${uniqueIssuer}/oauth/token`,
      })));
      // Mock client credentials token response
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'm2m-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })));

      const middleware = oidc({
        issuer: uniqueIssuer,
        clientId: 'client-123',
        clientSecret: 'secret-abc',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer m2m-token');
    });
  });

  describe('oidc middleware with tokenStorage', () => {
    it('should use tokenStorage to get cached tokens', async () => {
      const uniqueIssuer = `https://ts-cached-${Date.now()}.example.com`;
      const tokenStorage = {
        get: vi.fn().mockResolvedValue({
          accessToken: 'stored-token',
          expiresAt: Date.now() + 3600000, // 1 hour from now
          tokenType: 'Bearer',
        } as OIDCTokens),
        set: vi.fn(),
      };

      const middleware = oidc({
        issuer: uniqueIssuer,
        clientId: 'client-123',
        tokenStorage,
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      expect(tokenStorage.get).toHaveBeenCalled();
      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer stored-token');
    });

    it('should update tokenStorage after refresh', async () => {
      const uniqueIssuer = `https://ts-refresh-${Date.now()}.example.com`;
      const tokenStorage = {
        get: vi.fn().mockResolvedValue({
          accessToken: 'expired-token',
          refreshToken: 'refresh-token',
          expiresAt: Date.now() - 1000, // expired
          tokenType: 'Bearer',
        } as OIDCTokens),
        set: vi.fn(),
      };

      // Mock discovery document
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        ...mockDiscoveryDoc,
        issuer: uniqueIssuer,
        token_endpoint: `${uniqueIssuer}/oauth/token`,
      })));
      // Mock refresh token response
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'refreshed-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })));

      const middleware = oidc({
        issuer: uniqueIssuer,
        clientId: 'client-123',
        tokenStorage,
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      expect(tokenStorage.set).toHaveBeenCalledWith(expect.objectContaining({
        accessToken: 'refreshed-token',
        refreshToken: 'new-refresh-token',
      }));
    });
  });

  describe('oidc middleware error handling', () => {
    it('should throw when no valid authentication method available', async () => {
      const uniqueIssuer = `https://no-auth-${Date.now()}.example.com`;
      const middleware = oidc({
        issuer: uniqueIssuer,
        clientId: 'client-123',
        // No accessToken, no refreshToken, no clientSecret
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });

      await expect(middleware(req, next)).rejects.toThrow(
        'No valid authentication method available'
      );
    });

    it('should return original 401 when refresh fails on retry', async () => {
      const uniqueIssuer = `https://401-retry-${Date.now()}.example.com`;
      // Mock discovery document (1st fetch call)
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        ...mockDiscoveryDoc,
        issuer: uniqueIssuer,
        token_endpoint: `${uniqueIssuer}/oauth/token`,
      })));
      // Mock initial refresh to succeed (2nd fetch call)
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'initial-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })));
      // Mock retry refresh to fail (3rd fetch call)
      fetchMock.mockResolvedValueOnce(new Response('invalid_grant', { status: 400 }));

      const next401 = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 401, headers: new Headers() });

      const middleware = oidc({
        issuer: uniqueIssuer,
        clientId: 'client-123',
        refreshToken: 'refresh-token',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      const response = await middleware(req, next401);

      expect(response.status).toBe(401);
    });
  });

  describe('oidcPlugin', () => {
    it('should create a plugin that adds oidc middleware', () => {
      const plugin = oidcPlugin({
        issuer: 'https://auth.example.com',
        clientId: 'client-123',
        accessToken: 'test-token',
      });

      const mockClient = {
        use: vi.fn(),
      };

      plugin(mockClient as any);
      expect(mockClient.use).toHaveBeenCalledOnce();
    });
  });
});

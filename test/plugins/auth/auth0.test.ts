import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { auth0, auth0Plugin, generateAuth0AuthUrl, exchangeAuth0Code, getAuth0UserInfo } from '../../../src/plugins/auth/auth0.js';
import { HttpRequest } from '../../../src/core/request.js';

describe('Auth0 Auth Plugin', () => {
  let next: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.spyOn>;

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

  describe('generateAuth0AuthUrl', () => {
    it('should generate valid authorization URL', async () => {
      const result = await generateAuth0AuthUrl({
        domain: 'test-tenant.auth0.com',
        clientId: 'test-client-id',
        redirectUri: 'https://app.example.com/callback',
        scopes: ['openid', 'profile'],
      });

      expect(result.url).toContain('https://test-tenant.auth0.com/authorize');
      expect(result.url).toContain('client_id=test-client-id');
      expect(result.url).toContain('redirect_uri=');
      expect(result.url).toContain('scope=openid+profile');
    });

    it('should include audience if provided', async () => {
      const result = await generateAuth0AuthUrl({
        domain: 'test-tenant.auth0.com',
        clientId: 'test-client-id',
        redirectUri: 'https://app.example.com/callback',
        audience: 'https://api.example.com',
      });

      expect(result.url).toContain('audience=');
    });

    it('should include organization if provided', async () => {
      const result = await generateAuth0AuthUrl({
        domain: 'test-tenant.auth0.com',
        clientId: 'test-client-id',
        redirectUri: 'https://app.example.com/callback',
        organization: 'org_123',
      });

      expect(result.url).toContain('organization=org_123');
    });

    it('should generate PKCE if requested', async () => {
      const result = await generateAuth0AuthUrl({
        domain: 'test-tenant.auth0.com',
        clientId: 'test-client-id',
        redirectUri: 'https://app.example.com/callback',
        usePKCE: true,
      });

      expect(result.codeVerifier).toBeDefined();
      expect(result.url).toContain('code_challenge=');
      expect(result.url).toContain('code_challenge_method=S256');
    });
  });

  describe('auth0 middleware', () => {
    it('should add Bearer token from static accessToken', async () => {
      const middleware = auth0({
        domain: 'test-tenant.auth0.com',
        clientId: 'test-client-id',
        accessToken: 'test-access-token',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer test-access-token');
    });

    it('should support different Auth0 regions', async () => {
      const middleware = auth0({
        domain: 'test-tenant.us.auth0.com',
        clientId: 'test-client-id',
        accessToken: 'test-token',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('generateAuth0AuthUrl extended', () => {
    it('should include state parameter', async () => {
      const result = await generateAuth0AuthUrl({
        domain: 'test-tenant.auth0.com',
        clientId: 'test-client-id',
        redirectUri: 'https://app.example.com/callback',
        state: 'random-state-value',
      });

      expect(result.url).toContain('state=random-state-value');
    });

    it('should include connection parameter', async () => {
      const result = await generateAuth0AuthUrl({
        domain: 'test-tenant.auth0.com',
        clientId: 'test-client-id',
        redirectUri: 'https://app.example.com/callback',
        connection: 'google-oauth2',
      });

      expect(result.url).toContain('connection=google-oauth2');
    });
  });

  describe('exchangeAuth0Code', () => {
    it('should exchange code for tokens', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'access-token-from-exchange',
        refresh_token: 'refresh-token',
        id_token: 'id-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })));

      const tokens = await exchangeAuth0Code({
        domain: 'test-tenant.auth0.com',
        clientId: 'test-client-id',
        code: 'authorization-code',
        redirectUri: 'https://app.example.com/callback',
      });

      expect(tokens.accessToken).toBe('access-token-from-exchange');
      expect(tokens.refreshToken).toBe('refresh-token');
      expect(tokens.idToken).toBe('id-token');
    });

    it('should include client_secret when provided', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'access-token',
        expires_in: 3600,
      })));

      await exchangeAuth0Code({
        domain: 'test-tenant.auth0.com',
        clientId: 'test-client-id',
        clientSecret: 'client-secret',
        code: 'authorization-code',
        redirectUri: 'https://app.example.com/callback',
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      expect(body.client_secret).toBe('client-secret');
    });

    it('should include code_verifier when provided', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'access-token',
        expires_in: 3600,
      })));

      await exchangeAuth0Code({
        domain: 'test-tenant.auth0.com',
        clientId: 'test-client-id',
        code: 'authorization-code',
        redirectUri: 'https://app.example.com/callback',
        codeVerifier: 'verifier-string',
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      expect(body.code_verifier).toBe('verifier-string');
    });

    it('should throw on token exchange failure', async () => {
      fetchMock.mockResolvedValueOnce(new Response('Invalid grant', { status: 400 }));

      await expect(exchangeAuth0Code({
        domain: 'test-tenant.auth0.com',
        clientId: 'test-client-id',
        code: 'invalid-code',
        redirectUri: 'https://app.example.com/callback',
      })).rejects.toThrow('Auth0 token exchange failed');
    });

    it('should handle missing optional fields', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'access-token-only',
      })));

      const tokens = await exchangeAuth0Code({
        domain: 'test-tenant.auth0.com',
        clientId: 'test-client-id',
        code: 'authorization-code',
        redirectUri: 'https://app.example.com/callback',
      });

      expect(tokens.accessToken).toBe('access-token-only');
      expect(tokens.refreshToken).toBeUndefined();
      expect(tokens.expiresAt).toBeUndefined();
      expect(tokens.tokenType).toBe('Bearer');
    });
  });

  describe('getAuth0UserInfo', () => {
    it('should get user info', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        sub: 'auth0|123456',
        name: 'Test User',
        email: 'test@example.com',
      })));

      const userInfo = await getAuth0UserInfo('test-tenant.auth0.com', 'access-token');

      expect(userInfo.sub).toBe('auth0|123456');
      expect(userInfo.name).toBe('Test User');
      expect(userInfo.email).toBe('test@example.com');
    });

    it('should throw on unauthorized', async () => {
      fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

      await expect(getAuth0UserInfo('test-tenant.auth0.com', 'invalid-token'))
        .rejects.toThrow('Failed to get user info');
    });
  });

  describe('auth0Plugin', () => {
    it('should create a plugin that adds auth0 middleware', () => {
      const plugin = auth0Plugin({
        domain: 'test-tenant.auth0.com',
        clientId: 'test-client-id',
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

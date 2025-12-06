import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { okta, generateOktaAuthUrl, exchangeOktaCode, getOktaUserInfo, introspectOktaToken, revokeOktaToken } from '../../../src/plugins/auth/okta.js';
import { HttpRequest } from '../../../src/core/request.js';

describe('Okta Auth Plugin', () => {
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

  describe('generateOktaAuthUrl', () => {
    it('should generate valid authorization URL', async () => {
      const result = await generateOktaAuthUrl({
        domain: 'test-org.okta.com',
        clientId: 'test-client-id',
        redirectUri: 'https://app.example.com/callback',
      });

      expect(result.url).toContain('https://test-org.okta.com/oauth2/default/v1/authorize');
      expect(result.url).toContain('client_id=test-client-id');
      expect(result.url).toContain('redirect_uri=');
      expect(result.url).toContain('response_type=code');
    });

    it('should use custom authorization server', async () => {
      const result = await generateOktaAuthUrl({
        domain: 'test-org.okta.com',
        clientId: 'test-client-id',
        redirectUri: 'https://app.example.com/callback',
        authorizationServerId: 'custom-server',
      });

      expect(result.url).toContain('https://test-org.okta.com/oauth2/custom-server/v1/authorize');
    });

    it('should include prompt parameter', async () => {
      const result = await generateOktaAuthUrl({
        domain: 'test-org.okta.com',
        clientId: 'test-client-id',
        redirectUri: 'https://app.example.com/callback',
        prompt: 'login',
      });

      expect(result.url).toContain('prompt=login');
    });

    it('should include idp parameter', async () => {
      const result = await generateOktaAuthUrl({
        domain: 'test-org.okta.com',
        clientId: 'test-client-id',
        redirectUri: 'https://app.example.com/callback',
        idp: 'external-idp-id',
      });

      expect(result.url).toContain('idp=external-idp-id');
    });

    it('should include login_hint parameter', async () => {
      const result = await generateOktaAuthUrl({
        domain: 'test-org.okta.com',
        clientId: 'test-client-id',
        redirectUri: 'https://app.example.com/callback',
        loginHint: 'user@example.com',
      });

      expect(result.url).toContain('login_hint=');
    });

    it('should generate PKCE if requested', async () => {
      const result = await generateOktaAuthUrl({
        domain: 'test-org.okta.com',
        clientId: 'test-client-id',
        redirectUri: 'https://app.example.com/callback',
        usePKCE: true,
      });

      expect(result.codeVerifier).toBeDefined();
      expect(result.url).toContain('code_challenge=');
      expect(result.url).toContain('code_challenge_method=S256');
    });

    it('should include state and nonce', async () => {
      const result = await generateOktaAuthUrl({
        domain: 'test-org.okta.com',
        clientId: 'test-client-id',
        redirectUri: 'https://app.example.com/callback',
        state: 'random-state',
        nonce: 'random-nonce',
      });

      expect(result.url).toContain('state=random-state');
      expect(result.url).toContain('nonce=random-nonce');
    });
  });

  describe('exchangeOktaCode', () => {
    it('should exchange code for tokens', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        id_token: 'new-id-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })));

      const tokens = await exchangeOktaCode({
        domain: 'test-org.okta.com',
        clientId: 'test-client-id',
        code: 'auth-code',
        redirectUri: 'https://app.example.com/callback',
      });

      expect(tokens.accessToken).toBe('new-access-token');
      expect(tokens.refreshToken).toBe('new-refresh-token');
      expect(tokens.idToken).toBe('new-id-token');
      expect(tokens.tokenType).toBe('Bearer');
    });

    it('should include client_secret if provided', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'access-token',
        expires_in: 3600,
      })));

      await exchangeOktaCode({
        domain: 'test-org.okta.com',
        clientId: 'test-client-id',
        clientSecret: 'test-secret',
        code: 'auth-code',
        redirectUri: 'https://app.example.com/callback',
      });

      expect(fetchMock).toHaveBeenCalled();
      const body = fetchMock.mock.calls[0][1]?.body as string;
      expect(body).toContain('client_secret=test-secret');
    });

    it('should include code_verifier if provided', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'access-token',
        expires_in: 3600,
      })));

      await exchangeOktaCode({
        domain: 'test-org.okta.com',
        clientId: 'test-client-id',
        code: 'auth-code',
        redirectUri: 'https://app.example.com/callback',
        codeVerifier: 'pkce-verifier',
      });

      expect(fetchMock).toHaveBeenCalled();
      const body = fetchMock.mock.calls[0][1]?.body as string;
      expect(body).toContain('code_verifier=pkce-verifier');
    });

    it('should throw error on failed exchange', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response('invalid_grant', { status: 400 }));

      await expect(exchangeOktaCode({
        domain: 'test-org.okta.com',
        clientId: 'test-client-id',
        code: 'invalid-code',
        redirectUri: 'https://app.example.com/callback',
      })).rejects.toThrow('Okta token exchange failed');
    });
  });

  describe('getOktaUserInfo', () => {
    it('should fetch user info', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        sub: 'user-id',
        email: 'user@example.com',
        name: 'Test User',
      })));

      const userInfo = await getOktaUserInfo('test-org.okta.com', 'default', 'access-token');

      expect(userInfo.sub).toBe('user-id');
      expect(userInfo.email).toBe('user@example.com');
    });

    it('should throw error on failure', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

      await expect(getOktaUserInfo('test-org.okta.com', 'default', 'invalid-token'))
        .rejects.toThrow('Failed to get user info');
    });
  });

  describe('introspectOktaToken', () => {
    it('should introspect token', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        active: true,
        sub: 'user-id',
        exp: Date.now() / 1000 + 3600,
      })));

      const result = await introspectOktaToken({
        domain: 'test-org.okta.com',
        clientId: 'test-client-id',
        token: 'access-token',
      });

      expect(result.active).toBe(true);
    });

    it('should include token_type_hint if provided', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ active: false })));

      await introspectOktaToken({
        domain: 'test-org.okta.com',
        clientId: 'test-client-id',
        token: 'refresh-token',
        tokenTypeHint: 'refresh_token',
      });

      const body = fetchMock.mock.calls[0][1]?.body as string;
      expect(body).toContain('token_type_hint=refresh_token');
    });
  });

  describe('revokeOktaToken', () => {
    it('should revoke token successfully', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

      await expect(revokeOktaToken({
        domain: 'test-org.okta.com',
        clientId: 'test-client-id',
        token: 'access-token',
      })).resolves.not.toThrow();
    });

    it('should throw error on revocation failure', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response('Error', { status: 400 }));

      await expect(revokeOktaToken({
        domain: 'test-org.okta.com',
        clientId: 'test-client-id',
        token: 'invalid-token',
      })).rejects.toThrow('Token revocation failed');
    });
  });

  describe('okta middleware', () => {
    it('should add Bearer token from static accessToken', async () => {
      const middleware = okta({
        domain: 'test-org.okta.com',
        clientId: 'test-client-id',
        accessToken: 'test-access-token',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer test-access-token');
    });

    it('should use API token for Management API (SSWS header)', async () => {
      const middleware = okta({
        domain: 'test-org.okta.com',
        clientId: 'test-client-id',
        apiToken: 'api-token-123',
      });

      const req = new HttpRequest('https://test-org.okta.com/api/v1/users', { method: 'GET' });
      await middleware(req, next);

      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('SSWS api-token-123');
    });

    it('should support dynamic accessToken function', async () => {
      const tokenFn = vi.fn().mockResolvedValue('dynamic-okta-token');

      const middleware = okta({
        domain: 'test-org.okta.com',
        clientId: 'test-client-id',
        accessToken: tokenFn,
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      expect(tokenFn).toHaveBeenCalled();
      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer dynamic-okta-token');
    });

    it('should support custom authorization server', async () => {
      const middleware = okta({
        domain: 'test-org.okta.com',
        clientId: 'test-client-id',
        authorizationServerId: 'custom-server',
        accessToken: 'test-token',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalled();
    });

    it('should support oktapreview domain', async () => {
      const middleware = okta({
        domain: 'test-org.oktapreview.com',
        clientId: 'test-client-id',
        accessToken: 'test-token',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalled();
    });
  });
});

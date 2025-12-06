import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { azureAD, entraId, generateAzureADAuthUrl, exchangeAzureADCode, azureADOnBehalfOf, getAzureADUserInfo } from '../../../src/plugins/auth/azure-ad.js';
import { HttpRequest } from '../../../src/core/request.js';

describe('Azure AD / Entra ID Auth Plugin', () => {
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

  describe('generateAzureADAuthUrl', () => {
    it('should generate valid authorization URL', async () => {
      const result = await generateAzureADAuthUrl({
        tenantId: 'tenant-id-123',
        clientId: 'client-id-456',
        redirectUri: 'https://app.example.com/callback',
      });

      expect(result.url).toContain('https://login.microsoftonline.com/tenant-id-123/oauth2/v2.0/authorize');
      expect(result.url).toContain('client_id=client-id-456');
      expect(result.url).toContain('redirect_uri=');
      expect(result.url).toContain('response_type=code');
      expect(result.url).toContain('response_mode=query');
    });

    it('should support multi-tenant with common', async () => {
      const result = await generateAzureADAuthUrl({
        tenantId: 'common',
        clientId: 'client-id',
        redirectUri: 'https://app.example.com/callback',
      });

      expect(result.url).toContain('login.microsoftonline.com/common/');
    });

    it('should support organizations-only', async () => {
      const result = await generateAzureADAuthUrl({
        tenantId: 'organizations',
        clientId: 'client-id',
        redirectUri: 'https://app.example.com/callback',
      });

      expect(result.url).toContain('login.microsoftonline.com/organizations/');
    });

    it('should support consumers-only', async () => {
      const result = await generateAzureADAuthUrl({
        tenantId: 'consumers',
        clientId: 'client-id',
        redirectUri: 'https://app.example.com/callback',
      });

      expect(result.url).toContain('login.microsoftonline.com/consumers/');
    });

    it('should support Azure AD B2C', async () => {
      const result = await generateAzureADAuthUrl({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        redirectUri: 'https://app.example.com/callback',
        b2c: {
          tenantName: 'contoso',
          policy: 'B2C_1_signupsignin',
        },
      });

      expect(result.url).toContain('contoso.b2clogin.com');
      expect(result.url).toContain('B2C_1_signupsignin');
    });

    it('should include prompt parameter', async () => {
      const result = await generateAzureADAuthUrl({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        redirectUri: 'https://app.example.com/callback',
        prompt: 'consent',
      });

      expect(result.url).toContain('prompt=consent');
    });

    it('should include login_hint parameter', async () => {
      const result = await generateAzureADAuthUrl({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        redirectUri: 'https://app.example.com/callback',
        loginHint: 'user@contoso.com',
      });

      expect(result.url).toContain('login_hint=');
    });

    it('should include domain_hint parameter', async () => {
      const result = await generateAzureADAuthUrl({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        redirectUri: 'https://app.example.com/callback',
        domainHint: 'contoso.com',
      });

      expect(result.url).toContain('domain_hint=contoso.com');
    });

    it('should generate PKCE if requested', async () => {
      const result = await generateAzureADAuthUrl({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        redirectUri: 'https://app.example.com/callback',
        usePKCE: true,
      });

      expect(result.codeVerifier).toBeDefined();
      expect(result.url).toContain('code_challenge=');
      expect(result.url).toContain('code_challenge_method=S256');
    });

    it('should use custom cloud instance', async () => {
      const result = await generateAzureADAuthUrl({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        redirectUri: 'https://app.example.com/callback',
        cloudInstance: 'https://login.microsoftonline.us',
      });

      expect(result.url).toContain('login.microsoftonline.us');
    });
  });

  describe('exchangeAzureADCode', () => {
    it('should exchange code for tokens', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        id_token: 'new-id-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })));

      const tokens = await exchangeAzureADCode({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        code: 'auth-code',
        redirectUri: 'https://app.example.com/callback',
      });

      expect(tokens.accessToken).toBe('new-access-token');
      expect(tokens.refreshToken).toBe('new-refresh-token');
      expect(tokens.idToken).toBe('new-id-token');
    });

    it('should include client_secret if provided', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'access-token',
        expires_in: 3600,
      })));

      await exchangeAzureADCode({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        code: 'auth-code',
        redirectUri: 'https://app.example.com/callback',
      });

      const body = fetchMock.mock.calls[0][1]?.body as string;
      expect(body).toContain('client_secret=client-secret');
    });

    it('should throw error on failed exchange', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        error: 'invalid_grant',
        error_description: 'Code expired',
      }), { status: 400 }));

      await expect(exchangeAzureADCode({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        code: 'invalid-code',
        redirectUri: 'https://app.example.com/callback',
      })).rejects.toThrow('Azure AD token exchange failed');
    });
  });

  describe('azureADOnBehalfOf', () => {
    it('should perform OBO flow', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'obo-access-token',
        expires_in: 3600,
        token_type: 'Bearer',
      })));

      const tokens = await azureADOnBehalfOf({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        assertion: 'user-access-token',
        scope: 'https://graph.microsoft.com/.default',
      });

      expect(tokens.accessToken).toBe('obo-access-token');

      const body = fetchMock.mock.calls[0][1]?.body as string;
      expect(body).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer');
      expect(body).toContain('requested_token_use=on_behalf_of');
    });

    it('should throw error on OBO failure', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        error: 'invalid_grant',
        error_description: 'OBO failed',
      }), { status: 400 }));

      await expect(azureADOnBehalfOf({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        assertion: 'invalid-assertion',
        scope: 'https://graph.microsoft.com/.default',
      })).rejects.toThrow('Azure AD OBO flow failed');
    });
  });

  describe('getAzureADUserInfo', () => {
    it('should fetch user info from Microsoft Graph', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'user-id',
        displayName: 'Test User',
        mail: 'user@contoso.com',
        userPrincipalName: 'user@contoso.com',
      })));

      const userInfo = await getAzureADUserInfo('access-token');

      expect(userInfo.id).toBe('user-id');
      expect(userInfo.displayName).toBe('Test User');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer access-token',
          }),
        })
      );
    });

    it('should throw error on failure', async () => {
      const fetchMock = vi.spyOn(global, 'fetch');
      fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

      await expect(getAzureADUserInfo('invalid-token'))
        .rejects.toThrow('Failed to get user info');
    });
  });

  describe('azureAD middleware', () => {
    it('should add Bearer token from static accessToken', async () => {
      const middleware = azureAD({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        accessToken: 'test-access-token',
      });

      const req = new HttpRequest('https://graph.microsoft.com/v1.0/me', { method: 'GET' });
      await middleware(req, next);

      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer test-access-token');
    });

    it('should support dynamic accessToken function', async () => {
      const tokenFn = vi.fn().mockResolvedValue('dynamic-azure-token');

      const middleware = azureAD({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        accessToken: tokenFn,
      });

      const req = new HttpRequest('https://graph.microsoft.com/v1.0/me', { method: 'GET' });
      await middleware(req, next);

      expect(tokenFn).toHaveBeenCalled();
      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer dynamic-azure-token');
    });

    it('should use default scopes', async () => {
      const middleware = azureAD({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        accessToken: 'token',
      });

      const req = new HttpRequest('https://graph.microsoft.com/v1.0/me', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalled();
    });

    it('should use Graph API scopes', async () => {
      const middleware = azureAD({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        accessToken: 'token',
        scopes: ['https://graph.microsoft.com/.default'],
      });

      const req = new HttpRequest('https://graph.microsoft.com/v1.0/me', { method: 'GET' });
      await middleware(req, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('entraId alias', () => {
    it('should work as alias for azureAD', async () => {
      const middleware = entraId({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        accessToken: 'test-token',
      });

      const req = new HttpRequest('https://graph.microsoft.com/v1.0/me', { method: 'GET' });
      await middleware(req, next);

      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer test-token');
    });
  });
});

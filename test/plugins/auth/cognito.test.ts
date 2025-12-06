import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cognito, cognitoPlugin, getCognitoHostedUIUrl, getCognitoIdentityCredentials } from '../../../src/plugins/auth/cognito.js';
import { HttpRequest } from '../../../src/core/request.js';

describe('AWS Cognito Auth Plugin', () => {
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

  describe('getCognitoHostedUIUrl', () => {
    it('should generate valid Hosted UI URL', () => {
      const url = getCognitoHostedUIUrl({
        region: 'us-east-1',
        userPoolId: 'us-east-1_ABCDEFG',
        clientId: 'test-client-id',
        redirectUri: 'https://app.example.com/callback',
      });

      expect(url).toContain('.auth.us-east-1.amazoncognito.com');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('response_type=code');
    });

    it('should include custom scopes', () => {
      const url = getCognitoHostedUIUrl({
        region: 'us-east-1',
        userPoolId: 'us-east-1_ABCDEFG',
        clientId: 'test-client-id',
        redirectUri: 'https://app.example.com/callback',
        scopes: ['openid', 'email', 'aws.cognito.signin.user.admin'],
      });

      expect(url).toContain('scope=');
    });

    it('should include state parameter', () => {
      const url = getCognitoHostedUIUrl({
        region: 'us-east-1',
        userPoolId: 'us-east-1_ABCDEFG',
        clientId: 'test-client-id',
        redirectUri: 'https://app.example.com/callback',
        state: 'random-state-value',
      });

      expect(url).toContain('state=random-state-value');
    });
  });

  describe('cognito middleware', () => {
    it('should add Bearer token from static accessToken', async () => {
      const middleware = cognito({
        region: 'us-east-1',
        userPoolId: 'us-east-1_ABCDEFG',
        clientId: 'test-client-id',
        accessToken: 'test-access-token',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer test-access-token');
    });

    it('should support dynamic accessToken function', async () => {
      const tokenFn = vi.fn().mockResolvedValue('dynamic-cognito-token');

      const middleware = cognito({
        region: 'us-east-1',
        userPoolId: 'us-east-1_ABCDEFG',
        clientId: 'test-client-id',
        accessToken: tokenFn,
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      expect(tokenFn).toHaveBeenCalled();
      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer dynamic-cognito-token');
    });

    it('should throw error when no auth method available', async () => {
      const middleware = cognito({
        region: 'us-east-1',
        userPoolId: 'us-east-1_ABCDEFG',
        clientId: 'test-client-id',
        // No accessToken, refreshToken, or username/password
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });

      await expect(middleware(req, next)).rejects.toThrow('No valid authentication method');
    });

    it('should authenticate with username/password', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        AuthenticationResult: {
          AccessToken: 'access-token-from-cognito',
          IdToken: 'id-token-from-cognito',
          RefreshToken: 'refresh-token-from-cognito',
          ExpiresIn: 3600,
          TokenType: 'Bearer',
        },
      })));

      const middleware = cognito({
        region: 'us-east-1',
        userPoolId: 'us-east-1_ABCDEFG',
        clientId: 'test-client-id',
        username: 'testuser',
        password: 'testpassword',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      expect(fetchMock).toHaveBeenCalledOnce();
      const modifiedReq = next.mock.calls[0][0];
      expect(modifiedReq.headers.get('Authorization')).toBe('Bearer access-token-from-cognito');
    });

    it('should include SECRET_HASH when clientSecret is provided', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        AuthenticationResult: {
          AccessToken: 'access-token',
          IdToken: 'id-token',
          ExpiresIn: 3600,
          TokenType: 'Bearer',
        },
      })));

      const middleware = cognito({
        region: 'us-east-1',
        userPoolId: 'us-east-1_ABCDEFG',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        username: 'testuser',
        password: 'testpassword',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      const fetchCall = fetchMock.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.AuthParameters).toHaveProperty('SECRET_HASH');
    });

    it('should throw on authentication failure', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        __type: 'NotAuthorizedException',
        message: 'Incorrect username or password',
      }), { status: 400 }));

      const middleware = cognito({
        region: 'us-east-1',
        userPoolId: 'us-east-1_ABCDEFG',
        clientId: 'test-client-id',
        username: 'testuser',
        password: 'wrongpassword',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await expect(middleware(req, next)).rejects.toThrow('Cognito authentication failed');
    });

    it('should throw on challenge required', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        ChallengeName: 'NEW_PASSWORD_REQUIRED',
      })));

      const middleware = cognito({
        region: 'us-east-1',
        userPoolId: 'us-east-1_ABCDEFG',
        clientId: 'test-client-id',
        username: 'testuser',
        password: 'temppassword',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await expect(middleware(req, next)).rejects.toThrow('Cognito challenge required');
    });

    it('should throw on empty authentication result', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({})));

      const middleware = cognito({
        region: 'us-east-1',
        userPoolId: 'us-east-1_ABCDEFG',
        clientId: 'test-client-id',
        username: 'testuser',
        password: 'testpassword',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await expect(middleware(req, next)).rejects.toThrow('No result');
    });

    it('should refresh token on 401', async () => {
      // First: authenticate
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        AuthenticationResult: {
          AccessToken: 'first-token',
          IdToken: 'id-token',
          RefreshToken: 'refresh-token',
          ExpiresIn: 3600,
          TokenType: 'Bearer',
        },
      })));
      // Second: refresh after 401
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        AuthenticationResult: {
          AccessToken: 'refreshed-token',
          IdToken: 'new-id-token',
          ExpiresIn: 3600,
          TokenType: 'Bearer',
        },
      })));

      const next401 = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 401, headers: new Headers() })
        .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers() });

      const middleware = cognito({
        region: 'us-east-1',
        userPoolId: 'us-east-1_ABCDEFG',
        clientId: 'test-client-id',
        username: 'testuser',
        password: 'testpassword',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next401);

      expect(next401).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should use cached tokens when valid', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        AuthenticationResult: {
          AccessToken: 'cached-token',
          IdToken: 'id-token',
          RefreshToken: 'refresh-token',
          ExpiresIn: 3600,
          TokenType: 'Bearer',
        },
      })));

      const middleware = cognito({
        region: 'us-east-1',
        userPoolId: 'us-east-1_ABCDEFG',
        clientId: 'test-client-id',
        username: 'testuser',
        password: 'testpassword',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });

      // First request - should authenticate
      await middleware(req, next);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Second request - should use cached token
      await middleware(req, next);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should use tokenStorage to persist tokens', async () => {
      const tokenStorage = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
      };

      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        AuthenticationResult: {
          AccessToken: 'stored-token',
          IdToken: 'id-token',
          RefreshToken: 'refresh-token',
          ExpiresIn: 3600,
          TokenType: 'Bearer',
        },
      })));

      const middleware = cognito({
        region: 'us-east-1',
        userPoolId: 'us-east-1_ABCDEFG',
        clientId: 'test-client-id',
        username: 'testuser',
        password: 'testpassword',
        tokenStorage,
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      expect(tokenStorage.get).toHaveBeenCalled();
      expect(tokenStorage.set).toHaveBeenCalled();
    });

    it('should use refreshToken directly if provided', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        AuthenticationResult: {
          AccessToken: 'refreshed-access-token',
          IdToken: 'refreshed-id-token',
          ExpiresIn: 3600,
          TokenType: 'Bearer',
        },
      })));

      const middleware = cognito({
        region: 'us-east-1',
        userPoolId: 'us-east-1_ABCDEFG',
        clientId: 'test-client-id',
        refreshToken: 'existing-refresh-token',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      expect(fetchMock).toHaveBeenCalledOnce();
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      expect(body.AuthFlow).toBe('REFRESH_TOKEN_AUTH');
    });

    it('should handle refresh token failure and fall through', async () => {
      // Refresh fails
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        __type: 'NotAuthorizedException',
        message: 'Invalid refresh token',
      }), { status: 400 }));
      // Fall through to username/password auth
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        AuthenticationResult: {
          AccessToken: 'new-access-token',
          IdToken: 'id-token',
          ExpiresIn: 3600,
          TokenType: 'Bearer',
        },
      })));

      const middleware = cognito({
        region: 'us-east-1',
        userPoolId: 'us-east-1_ABCDEFG',
        clientId: 'test-client-id',
        refreshToken: 'invalid-refresh-token',
        username: 'testuser',
        password: 'testpassword',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      await middleware(req, next);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should return 401 response if refresh on 401 fails', async () => {
      // Initial auth succeeds
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        AuthenticationResult: {
          AccessToken: 'first-token',
          IdToken: 'id-token',
          RefreshToken: 'refresh-token',
          ExpiresIn: 3600,
          TokenType: 'Bearer',
        },
      })));
      // Refresh on 401 fails
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        __type: 'NotAuthorizedException',
        message: 'Token expired',
      }), { status: 400 }));

      const next401 = vi.fn().mockResolvedValue({ ok: false, status: 401, headers: new Headers() });

      const middleware = cognito({
        region: 'us-east-1',
        userPoolId: 'us-east-1_ABCDEFG',
        clientId: 'test-client-id',
        username: 'testuser',
        password: 'testpassword',
      });

      const req = new HttpRequest('https://api.example.com/data', { method: 'GET' });
      const response = await middleware(req, next401);

      expect(response.status).toBe(401);
    });
  });

  describe('getCognitoIdentityCredentials', () => {
    it('should get AWS credentials from Identity Pool', async () => {
      // GetId response
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        IdentityId: 'us-east-1:identity-id-123',
      })));
      // GetCredentialsForIdentity response
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        Credentials: {
          AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          SecretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          SessionToken: 'session-token-123',
          Expiration: Math.floor(Date.now() / 1000) + 3600,
        },
      })));

      const credentials = await getCognitoIdentityCredentials({
        region: 'us-east-1',
        identityPoolId: 'us-east-1:identity-pool-123',
        idToken: 'cognito-id-token',
        userPoolId: 'us-east-1_ABCDEFG',
      });

      expect(credentials.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
      expect(credentials.secretAccessKey).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
      expect(credentials.sessionToken).toBe('session-token-123');
    });

    it('should throw on GetId failure', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        __type: 'ResourceNotFoundException',
        message: 'Identity pool not found',
      }), { status: 400 }));

      await expect(getCognitoIdentityCredentials({
        region: 'us-east-1',
        identityPoolId: 'invalid-pool',
        idToken: 'cognito-id-token',
        userPoolId: 'us-east-1_ABCDEFG',
      })).rejects.toThrow('Failed to get identity ID');
    });

    it('should throw on GetCredentials failure', async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        IdentityId: 'us-east-1:identity-id-123',
      })));
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        __type: 'NotAuthorizedException',
        message: 'Access denied',
      }), { status: 400 }));

      await expect(getCognitoIdentityCredentials({
        region: 'us-east-1',
        identityPoolId: 'us-east-1:identity-pool-123',
        idToken: 'invalid-token',
        userPoolId: 'us-east-1_ABCDEFG',
      })).rejects.toThrow('Failed to get credentials');
    });
  });

  describe('cognitoPlugin', () => {
    it('should create a plugin that adds cognito middleware', () => {
      const plugin = cognitoPlugin({
        region: 'us-east-1',
        userPoolId: 'us-east-1_ABCDEFG',
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

  describe('getCognitoHostedUIUrl advanced', () => {
    it('should support token response type', () => {
      const url = getCognitoHostedUIUrl({
        region: 'us-east-1',
        userPoolId: 'us-east-1_ABCDEFG',
        clientId: 'test-client-id',
        redirectUri: 'https://app.example.com/callback',
        responseType: 'token',
      });

      expect(url).toContain('response_type=token');
    });
  });
});

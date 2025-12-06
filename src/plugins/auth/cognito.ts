/**
 * AWS Cognito Authentication
 * https://docs.aws.amazon.com/cognito/
 *
 * Supports User Pools and Identity Pools
 */

import { Middleware, Plugin } from '../../types/index.js';
import { createHash, createHmac, randomBytes } from 'node:crypto';

export interface CognitoOptions {
  /**
   * AWS Region (e.g., 'us-east-1')
   */
  region: string;

  /**
   * Cognito User Pool ID (e.g., 'us-east-1_XXXXXXX')
   */
  userPoolId: string;

  /**
   * Cognito App Client ID
   */
  clientId: string;

  /**
   * Cognito App Client Secret (if configured)
   */
  clientSecret?: string;

  /**
   * Pre-obtained access token
   */
  accessToken?: string | (() => string | Promise<string>);

  /**
   * Pre-obtained ID token (can be used as access token for some APIs)
   */
  idToken?: string;

  /**
   * Pre-obtained refresh token for token refresh
   */
  refreshToken?: string;

  /**
   * Username for direct authentication (USER_PASSWORD_AUTH or USER_SRP_AUTH)
   */
  username?: string;

  /**
   * Password for direct authentication
   */
  password?: string;

  /**
   * Use SRP (Secure Remote Password) authentication
   * @default false (uses USER_PASSWORD_AUTH)
   */
  useSRP?: boolean;

  /**
   * Token storage for persistence
   */
  tokenStorage?: {
    get: () => Promise<CognitoTokens | null>;
    set: (tokens: CognitoTokens) => Promise<void>;
  };

  /**
   * Identity Pool ID for AWS credentials (federated identities)
   */
  identityPoolId?: string;
}

export interface CognitoTokens {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
}

export interface CognitoAWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiresAt: number;
}

/**
 * Generate secret hash for Cognito (when client secret is configured)
 */
function generateSecretHash(
  username: string,
  clientId: string,
  clientSecret: string
): string {
  return createHmac('sha256', clientSecret)
    .update(username + clientId)
    .digest('base64');
}

/**
 * Authenticate with username/password (USER_PASSWORD_AUTH)
 */
async function authenticateUserPassword(
  options: CognitoOptions
): Promise<CognitoTokens> {
  if (!options.username || !options.password) {
    throw new Error('Username and password are required for USER_PASSWORD_AUTH');
  }

  const endpoint = `https://cognito-idp.${options.region}.amazonaws.com/`;

  const authParameters: Record<string, string> = {
    USERNAME: options.username,
    PASSWORD: options.password,
  };

  if (options.clientSecret) {
    authParameters.SECRET_HASH = generateSecretHash(
      options.username,
      options.clientId,
      options.clientSecret
    );
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: options.clientId,
      AuthParameters: authParameters,
    }),
  });

  if (!response.ok) {
    const error = await response.json() as { __type?: string; message?: string };
    throw new Error(`Cognito authentication failed: ${error.message || error.__type}`);
  }

  const data = await response.json() as {
    AuthenticationResult?: {
      AccessToken: string;
      IdToken: string;
      RefreshToken?: string;
      ExpiresIn: number;
      TokenType: string;
    };
    ChallengeName?: string;
  };

  if (data.ChallengeName) {
    throw new Error(`Cognito challenge required: ${data.ChallengeName}`);
  }

  if (!data.AuthenticationResult) {
    throw new Error('Cognito authentication failed: No result');
  }

  return {
    accessToken: data.AuthenticationResult.AccessToken,
    idToken: data.AuthenticationResult.IdToken,
    refreshToken: data.AuthenticationResult.RefreshToken,
    expiresAt: Date.now() + data.AuthenticationResult.ExpiresIn * 1000,
    tokenType: data.AuthenticationResult.TokenType,
  };
}

/**
 * Refresh tokens using refresh token
 */
async function refreshCognitoTokens(
  options: CognitoOptions,
  refreshToken: string
): Promise<CognitoTokens> {
  const endpoint = `https://cognito-idp.${options.region}.amazonaws.com/`;

  const authParameters: Record<string, string> = {
    REFRESH_TOKEN: refreshToken,
  };

  if (options.clientSecret && options.username) {
    authParameters.SECRET_HASH = generateSecretHash(
      options.username,
      options.clientId,
      options.clientSecret
    );
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: options.clientId,
      AuthParameters: authParameters,
    }),
  });

  if (!response.ok) {
    const error = await response.json() as { __type?: string; message?: string };
    throw new Error(`Cognito token refresh failed: ${error.message || error.__type}`);
  }

  const data = await response.json() as {
    AuthenticationResult: {
      AccessToken: string;
      IdToken: string;
      ExpiresIn: number;
      TokenType: string;
    };
  };

  return {
    accessToken: data.AuthenticationResult.AccessToken,
    idToken: data.AuthenticationResult.IdToken,
    refreshToken: refreshToken, // Refresh token is not returned, keep the old one
    expiresAt: Date.now() + data.AuthenticationResult.ExpiresIn * 1000,
    tokenType: data.AuthenticationResult.TokenType,
  };
}

/**
 * Get AWS credentials from Identity Pool
 */
export async function getCognitoIdentityCredentials(
  options: {
    region: string;
    identityPoolId: string;
    idToken: string;
    userPoolId: string;
  }
): Promise<CognitoAWSCredentials> {
  const identityEndpoint = `https://cognito-identity.${options.region}.amazonaws.com/`;

  // Get Identity ID
  const logins = {
    [`cognito-idp.${options.region}.amazonaws.com/${options.userPoolId}`]: options.idToken,
  };

  const getIdResponse = await fetch(identityEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityService.GetId',
    },
    body: JSON.stringify({
      IdentityPoolId: options.identityPoolId,
      Logins: logins,
    }),
  });

  if (!getIdResponse.ok) {
    const error = await getIdResponse.json() as { __type?: string; message?: string };
    throw new Error(`Failed to get identity ID: ${error.message || error.__type}`);
  }

  const { IdentityId } = await getIdResponse.json() as { IdentityId: string };

  // Get credentials
  const getCredentialsResponse = await fetch(identityEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityService.GetCredentialsForIdentity',
    },
    body: JSON.stringify({
      IdentityId,
      Logins: logins,
    }),
  });

  if (!getCredentialsResponse.ok) {
    const error = await getCredentialsResponse.json() as { __type?: string; message?: string };
    throw new Error(`Failed to get credentials: ${error.message || error.__type}`);
  }

  const data = await getCredentialsResponse.json() as {
    Credentials: {
      AccessKeyId: string;
      SecretKey: string;
      SessionToken: string;
      Expiration: number;
    };
  };

  return {
    accessKeyId: data.Credentials.AccessKeyId,
    secretAccessKey: data.Credentials.SecretKey,
    sessionToken: data.Credentials.SessionToken,
    expiresAt: data.Credentials.Expiration * 1000,
  };
}

/**
 * Cognito Hosted UI URL generator
 */
export function getCognitoHostedUIUrl(
  options: CognitoOptions & {
    redirectUri: string;
    responseType?: 'code' | 'token';
    scopes?: string[];
    state?: string;
  }
): string {
  const domain = `https://${options.userPoolId.split('_')[1].toLowerCase()}.auth.${options.region}.amazoncognito.com`;

  const params = new URLSearchParams({
    response_type: options.responseType || 'code',
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    scope: (options.scopes || ['openid', 'profile', 'email']).join(' '),
  });

  if (options.state) {
    params.set('state', options.state);
  }

  return `${domain}/login?${params.toString()}`;
}

/**
 * AWS Cognito Authentication Middleware
 *
 * @example
 * ```typescript
 * // With username/password
 * client.use(cognito({
 *   region: 'us-east-1',
 *   userPoolId: 'us-east-1_XXXXX',
 *   clientId: 'your-client-id',
 *   username: 'user@example.com',
 *   password: 'password123'
 * }));
 *
 * // With pre-obtained tokens
 * client.use(cognito({
 *   region: 'us-east-1',
 *   userPoolId: 'us-east-1_XXXXX',
 *   clientId: 'your-client-id',
 *   accessToken: 'your-access-token',
 *   refreshToken: 'your-refresh-token'
 * }));
 *
 * // With token storage (auto-refresh)
 * client.use(cognito({
 *   region: 'us-east-1',
 *   userPoolId: 'us-east-1_XXXXX',
 *   clientId: 'your-client-id',
 *   refreshToken: 'stored-refresh-token',
 *   tokenStorage: {
 *     get: async () => loadTokens(),
 *     set: async (tokens) => saveTokens(tokens)
 *   }
 * }));
 * ```
 */
export function cognito(options: CognitoOptions): Middleware {
  let cachedTokens: CognitoTokens | null = null;

  const getTokens = async (): Promise<CognitoTokens> => {
    // Check token storage
    if (options.tokenStorage) {
      const stored = await options.tokenStorage.get();
      if (stored) {
        cachedTokens = stored;
      }
    }

    // Return valid cached tokens
    if (cachedTokens && cachedTokens.expiresAt && cachedTokens.expiresAt > Date.now() + 60000) {
      return cachedTokens;
    }

    // Try refresh
    if (cachedTokens?.refreshToken || options.refreshToken) {
      const refreshToken = cachedTokens?.refreshToken || options.refreshToken!;
      try {
        cachedTokens = await refreshCognitoTokens(options, refreshToken);
        if (options.tokenStorage) {
          await options.tokenStorage.set(cachedTokens);
        }
        return cachedTokens;
      } catch {
        // Fall through to other methods
      }
    }

    // Use pre-configured token
    if (options.accessToken) {
      const token = typeof options.accessToken === 'function'
        ? await options.accessToken()
        : options.accessToken;

      return {
        accessToken: token,
        idToken: options.idToken,
        tokenType: 'Bearer',
      };
    }

    // Authenticate with username/password
    if (options.username && options.password) {
      cachedTokens = await authenticateUserPassword(options);
      if (options.tokenStorage) {
        await options.tokenStorage.set(cachedTokens);
      }
      return cachedTokens;
    }

    throw new Error('No valid authentication method. Provide accessToken, refreshToken, or username/password.');
  };

  return async (req, next) => {
    const tokens = await getTokens();
    const authReq = req.withHeader('Authorization', `Bearer ${tokens.accessToken}`);
    const response = await next(authReq);

    // Handle token expiration
    if (response.status === 401 && (cachedTokens?.refreshToken || options.refreshToken)) {
      try {
        const refreshToken = cachedTokens?.refreshToken || options.refreshToken!;
        cachedTokens = await refreshCognitoTokens(options, refreshToken);

        if (options.tokenStorage) {
          await options.tokenStorage.set(cachedTokens);
        }

        const retryReq = req.withHeader('Authorization', `Bearer ${cachedTokens.accessToken}`);
        return next(retryReq);
      } catch {
        return response;
      }
    }

    return response;
  };
}

/**
 * AWS Cognito Authentication Plugin
 */
export function cognitoPlugin(options: CognitoOptions): Plugin {
  return (client) => {
    client.use(cognito(options));
  };
}

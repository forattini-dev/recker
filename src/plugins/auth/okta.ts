/**
 * Okta Authentication
 * https://developer.okta.com/docs/reference/
 *
 * Wrapper around OIDC with Okta-specific features
 */

import { Middleware, Plugin } from '../../types/index.js';
import { oidc, OIDCTokens, generatePKCE } from './oidc.js';

export interface OktaOptions {
  /**
   * Okta domain (e.g., 'your-org.okta.com' or 'your-org.oktapreview.com')
   */
  domain: string;

  /**
   * Application Client ID
   */
  clientId: string;

  /**
   * Application Client Secret (for confidential clients)
   */
  clientSecret?: string;

  /**
   * Authorization Server ID (default: 'default')
   * Use 'default' for Okta Authorization Server or custom ID
   */
  authorizationServerId?: string;

  /**
   * Requested scopes (default: ['openid', 'profile', 'email'])
   */
  scopes?: string[];

  /**
   * Pre-obtained access token
   */
  accessToken?: string | (() => string | Promise<string>);

  /**
   * Pre-obtained refresh token
   */
  refreshToken?: string;

  /**
   * Token storage for persistence
   */
  tokenStorage?: {
    get: () => Promise<OIDCTokens | null>;
    set: (tokens: OIDCTokens) => Promise<void>;
  };

  /**
   * API token for Okta Management API
   */
  apiToken?: string;
}

/**
 * Get Okta issuer URL
 */
function getOktaIssuer(domain: string, authorizationServerId?: string): string {
  const serverId = authorizationServerId || 'default';
  return `https://${domain}/oauth2/${serverId}`;
}

/**
 * Generate Okta authorization URL
 */
export async function generateOktaAuthUrl(
  options: OktaOptions & {
    redirectUri: string;
    state?: string;
    nonce?: string;
    usePKCE?: boolean;
    prompt?: 'none' | 'consent' | 'login';
    idp?: string;
    loginHint?: string;
  }
): Promise<{ url: string; codeVerifier?: string }> {
  const issuer = getOktaIssuer(options.domain, options.authorizationServerId);
  const pkce = options.usePKCE ? generatePKCE() : undefined;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    scope: (options.scopes || ['openid', 'profile', 'email']).join(' '),
  });

  if (options.state) {
    params.set('state', options.state);
  }

  if (options.nonce) {
    params.set('nonce', options.nonce);
  }

  if (pkce) {
    params.set('code_challenge', pkce.codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  if (options.prompt) {
    params.set('prompt', options.prompt);
  }

  if (options.idp) {
    params.set('idp', options.idp);
  }

  if (options.loginHint) {
    params.set('login_hint', options.loginHint);
  }

  return {
    url: `${issuer}/v1/authorize?${params.toString()}`,
    codeVerifier: pkce?.codeVerifier,
  };
}

/**
 * Exchange authorization code for tokens (Okta)
 */
export async function exchangeOktaCode(
  options: OktaOptions & {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }
): Promise<OIDCTokens> {
  const issuer = getOktaIssuer(options.domain, options.authorizationServerId);
  const tokenUrl = `${issuer}/v1/token`;

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: options.clientId,
    code: options.code,
    redirect_uri: options.redirectUri,
  });

  if (options.clientSecret) {
    params.set('client_secret', options.clientSecret);
  }

  if (options.codeVerifier) {
    params.set('code_verifier', options.codeVerifier);
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Okta token exchange failed: ${error}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
    token_type?: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    tokenType: data.token_type || 'Bearer',
  };
}

/**
 * Get user info from Okta
 */
export async function getOktaUserInfo(
  domain: string,
  authorizationServerId: string | undefined,
  accessToken: string
): Promise<Record<string, unknown>> {
  const issuer = getOktaIssuer(domain, authorizationServerId);

  const response = await fetch(`${issuer}/v1/userinfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get user info: ${response.status}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

/**
 * Introspect token (check if valid)
 */
export async function introspectOktaToken(
  options: OktaOptions & { token: string; tokenTypeHint?: 'access_token' | 'refresh_token' }
): Promise<{ active: boolean; [key: string]: unknown }> {
  const issuer = getOktaIssuer(options.domain, options.authorizationServerId);

  const params = new URLSearchParams({
    token: options.token,
    client_id: options.clientId,
  });

  if (options.clientSecret) {
    params.set('client_secret', options.clientSecret);
  }

  if (options.tokenTypeHint) {
    params.set('token_type_hint', options.tokenTypeHint);
  }

  const response = await fetch(`${issuer}/v1/introspect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Token introspection failed: ${response.status}`);
  }

  return response.json() as Promise<{ active: boolean; [key: string]: unknown }>;
}

/**
 * Revoke token
 */
export async function revokeOktaToken(
  options: OktaOptions & { token: string; tokenTypeHint?: 'access_token' | 'refresh_token' }
): Promise<void> {
  const issuer = getOktaIssuer(options.domain, options.authorizationServerId);

  const params = new URLSearchParams({
    token: options.token,
    client_id: options.clientId,
  });

  if (options.clientSecret) {
    params.set('client_secret', options.clientSecret);
  }

  if (options.tokenTypeHint) {
    params.set('token_type_hint', options.tokenTypeHint);
  }

  const response = await fetch(`${issuer}/v1/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Token revocation failed: ${response.status}`);
  }
}

/**
 * Okta Authentication Middleware
 *
 * @example
 * ```typescript
 * // With client credentials (M2M)
 * client.use(okta({
 *   domain: 'your-org.okta.com',
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret',
 *   scopes: ['api.read', 'api.write']
 * }));
 *
 * // With pre-obtained token
 * client.use(okta({
 *   domain: 'your-org.okta.com',
 *   clientId: 'your-client-id',
 *   accessToken: 'your-access-token'
 * }));
 *
 * // With custom authorization server
 * client.use(okta({
 *   domain: 'your-org.okta.com',
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret',
 *   authorizationServerId: 'custom-auth-server'
 * }));
 *
 * // For Okta Management API (use API token)
 * client.use(okta({
 *   domain: 'your-org.okta.com',
 *   clientId: '',
 *   apiToken: 'your-api-token'
 * }));
 * ```
 */
export function okta(options: OktaOptions): Middleware {
  // If using API token for Management API
  if (options.apiToken) {
    return async (req, next) => {
      const authReq = req.withHeader('Authorization', `SSWS ${options.apiToken}`);
      return next(authReq);
    };
  }

  const issuer = getOktaIssuer(options.domain, options.authorizationServerId);

  return oidc({
    issuer,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    scopes: options.scopes || ['openid', 'profile', 'email'],
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    tokenStorage: options.tokenStorage,
  });
}

/**
 * Okta Authentication Plugin
 */
export function oktaPlugin(options: OktaOptions): Plugin {
  return (client) => {
    client.use(okta(options));
  };
}

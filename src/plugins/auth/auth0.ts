/**
 * Auth0 Authentication
 * https://auth0.com/docs/api
 *
 * Wrapper around OIDC with Auth0-specific features
 */

import { Middleware, Plugin } from '../../types/index.js';
import { oidc, OIDCTokens, generatePKCE } from './oidc.js';

export interface Auth0Options {
  /**
   * Auth0 domain (e.g., 'your-tenant.auth0.com' or 'your-tenant.us.auth0.com')
   */
  domain: string;

  /**
   * Application Client ID
   */
  clientId: string;

  /**
   * Application Client Secret (for confidential clients / M2M)
   */
  clientSecret?: string;

  /**
   * API Audience (required for M2M and access tokens)
   */
  audience?: string;

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
   * Custom organization ID (for Auth0 Organizations)
   */
  organization?: string;

  /**
   * Connection name (e.g., 'google-oauth2', 'Username-Password-Authentication')
   */
  connection?: string;
}

/**
 * Generate Auth0 authorization URL
 */
export async function generateAuth0AuthUrl(
  options: Auth0Options & {
    redirectUri: string;
    state?: string;
    usePKCE?: boolean;
  }
): Promise<{ url: string; codeVerifier?: string }> {
  const issuer = `https://${options.domain}`;
  const pkce = options.usePKCE ? generatePKCE() : undefined;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    scope: (options.scopes || ['openid', 'profile', 'email']).join(' '),
  });

  if (options.audience) {
    params.set('audience', options.audience);
  }

  if (options.state) {
    params.set('state', options.state);
  }

  if (options.organization) {
    params.set('organization', options.organization);
  }

  if (options.connection) {
    params.set('connection', options.connection);
  }

  if (pkce) {
    params.set('code_challenge', pkce.codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  return {
    url: `${issuer}/authorize?${params.toString()}`,
    codeVerifier: pkce?.codeVerifier,
  };
}

/**
 * Exchange authorization code for tokens (Auth0)
 */
export async function exchangeAuth0Code(
  options: Auth0Options & {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }
): Promise<OIDCTokens> {
  const tokenUrl = `https://${options.domain}/oauth/token`;

  const params: Record<string, string> = {
    grant_type: 'authorization_code',
    client_id: options.clientId,
    code: options.code,
    redirect_uri: options.redirectUri,
  };

  if (options.clientSecret) {
    params.client_secret = options.clientSecret;
  }

  if (options.codeVerifier) {
    params.code_verifier = options.codeVerifier;
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Auth0 token exchange failed: ${error}`);
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
 * Get user info from Auth0
 */
export async function getAuth0UserInfo(
  domain: string,
  accessToken: string
): Promise<Record<string, unknown>> {
  const response = await fetch(`https://${domain}/userinfo`, {
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
 * Auth0 Authentication Middleware
 *
 * @example
 * ```typescript
 * // Machine-to-Machine (M2M) - Client Credentials
 * client.use(auth0({
 *   domain: 'your-tenant.auth0.com',
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret',
 *   audience: 'https://api.example.com'
 * }));
 *
 * // With pre-obtained token
 * client.use(auth0({
 *   domain: 'your-tenant.auth0.com',
 *   clientId: 'your-client-id',
 *   accessToken: 'your-access-token'
 * }));
 *
 * // With refresh token
 * client.use(auth0({
 *   domain: 'your-tenant.auth0.com',
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret',
 *   refreshToken: 'your-refresh-token'
 * }));
 * ```
 */
export function auth0(options: Auth0Options): Middleware {
  const issuer = `https://${options.domain}`;

  return oidc({
    issuer,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    scopes: options.scopes || ['openid', 'profile', 'email'],
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    tokenStorage: options.tokenStorage,
    audience: options.audience,
  });
}

/**
 * Auth0 Authentication Plugin
 */
export function auth0Plugin(options: Auth0Options): Plugin {
  return (client) => {
    client.use(auth0(options));
  };
}

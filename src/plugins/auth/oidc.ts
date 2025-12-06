/**
 * OpenID Connect (OIDC) Authentication
 * https://openid.net/specs/openid-connect-core-1_0.html
 *
 * Builds on OAuth 2.0 with identity layer (ID tokens, userinfo, discovery)
 */

import { Middleware, Plugin } from '../../types/index.js';
import { createHash, randomBytes } from 'node:crypto';

export interface OIDCOptions {
  /**
   * OIDC Issuer URL (e.g., 'https://accounts.google.com')
   * Used for auto-discovery via /.well-known/openid-configuration
   */
  issuer: string;

  /**
   * Client ID from your OIDC provider
   */
  clientId: string;

  /**
   * Client Secret (for confidential clients)
   */
  clientSecret?: string;

  /**
   * Redirect URI for authorization code flow
   */
  redirectUri?: string;

  /**
   * Requested scopes (default: ['openid'])
   */
  scopes?: string[];

  /**
   * Pre-obtained access token (skips token exchange)
   */
  accessToken?: string | (() => string | Promise<string>);

  /**
   * Pre-obtained refresh token
   */
  refreshToken?: string;

  /**
   * Token storage callbacks
   */
  tokenStorage?: {
    get: () => Promise<OIDCTokens | null>;
    set: (tokens: OIDCTokens) => Promise<void>;
  };

  /**
   * Audience for token validation
   */
  audience?: string;

  /**
   * Custom fetch function for token requests
   */
  fetch?: typeof fetch;
}

export interface OIDCTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt?: number;
  tokenType?: string;
}

export interface OIDCDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
  revocation_endpoint?: string;
  introspection_endpoint?: string;
  end_session_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported: string[];
  grant_types_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
}

// Cache for discovery documents
const discoveryCache = new Map<string, { doc: OIDCDiscoveryDocument; expiresAt: number }>();

/**
 * Fetch OIDC Discovery Document
 */
async function fetchDiscoveryDocument(
  issuer: string,
  customFetch: typeof fetch = fetch
): Promise<OIDCDiscoveryDocument> {
  const cached = discoveryCache.get(issuer);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.doc;
  }

  const wellKnownUrl = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const response = await customFetch(wellKnownUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch OIDC discovery document: ${response.status}`);
  }

  const doc = await response.json() as OIDCDiscoveryDocument;

  // Cache for 1 hour
  discoveryCache.set(issuer, {
    doc,
    expiresAt: Date.now() + 3600000,
  });

  return doc;
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCode(
  discovery: OIDCDiscoveryDocument,
  options: OIDCOptions,
  code: string,
  codeVerifier?: string,
  customFetch: typeof fetch = fetch
): Promise<OIDCTokens> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: options.clientId,
    code,
    redirect_uri: options.redirectUri || '',
  });

  if (options.clientSecret) {
    params.set('client_secret', options.clientSecret);
  }

  if (codeVerifier) {
    params.set('code_verifier', codeVerifier);
  }

  const response = await customFetch(discovery.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
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
 * Refresh access token using refresh token
 */
async function refreshTokens(
  discovery: OIDCDiscoveryDocument,
  options: OIDCOptions,
  refreshToken: string,
  customFetch: typeof fetch = fetch
): Promise<OIDCTokens> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: options.clientId,
    refresh_token: refreshToken,
  });

  if (options.clientSecret) {
    params.set('client_secret', options.clientSecret);
  }

  const response = await customFetch(discovery.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
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
    refreshToken: data.refresh_token || refreshToken, // Keep old refresh token if not returned
    idToken: data.id_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    tokenType: data.token_type || 'Bearer',
  };
}

/**
 * Client Credentials flow (machine-to-machine)
 */
async function clientCredentialsFlow(
  discovery: OIDCDiscoveryDocument,
  options: OIDCOptions,
  customFetch: typeof fetch = fetch
): Promise<OIDCTokens> {
  if (!options.clientSecret) {
    throw new Error('Client credentials flow requires clientSecret');
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: options.clientId,
    client_secret: options.clientSecret,
  });

  if (options.scopes && options.scopes.length > 0) {
    params.set('scope', options.scopes.join(' '));
  }

  if (options.audience) {
    params.set('audience', options.audience);
  }

  const response = await customFetch(discovery.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Client credentials flow failed: ${error}`);
  }

  const data = await response.json() as {
    access_token: string;
    expires_in?: number;
    token_type?: string;
  };

  return {
    accessToken: data.access_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    tokenType: data.token_type || 'Bearer',
  };
}

/**
 * Generate PKCE code verifier and challenge
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return { codeVerifier, codeChallenge };
}

/**
 * Generate authorization URL for interactive login
 */
export async function generateAuthorizationUrl(
  options: OIDCOptions & { state?: string; nonce?: string; pkce?: { codeChallenge: string } }
): Promise<string> {
  const discovery = await fetchDiscoveryDocument(options.issuer, options.fetch);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: options.clientId,
    redirect_uri: options.redirectUri || '',
    scope: (options.scopes || ['openid']).join(' '),
  });

  if (options.state) {
    params.set('state', options.state);
  }

  if (options.nonce) {
    params.set('nonce', options.nonce);
  }

  if (options.pkce) {
    params.set('code_challenge', options.pkce.codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  if (options.audience) {
    params.set('audience', options.audience);
  }

  return `${discovery.authorization_endpoint}?${params.toString()}`;
}

/**
 * OpenID Connect Authentication Middleware
 *
 * Supports multiple flows:
 * - Pre-configured access token
 * - Client credentials (M2M)
 * - Token refresh on 401
 *
 * @example
 * ```typescript
 * // With pre-configured token
 * client.use(oidc({
 *   issuer: 'https://accounts.google.com',
 *   clientId: 'your-client-id',
 *   accessToken: 'pre-obtained-token'
 * }));
 *
 * // With client credentials (M2M)
 * client.use(oidc({
 *   issuer: 'https://your-tenant.auth0.com',
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret',
 *   audience: 'https://api.example.com'
 * }));
 *
 * // With token storage (auto-refresh)
 * client.use(oidc({
 *   issuer: 'https://accounts.google.com',
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret',
 *   tokenStorage: {
 *     get: async () => loadTokens(),
 *     set: async (tokens) => saveTokens(tokens)
 *   }
 * }));
 * ```
 */
export function oidc(options: OIDCOptions): Middleware {
  let cachedTokens: OIDCTokens | null = null;
  let discoveryDoc: OIDCDiscoveryDocument | null = null;
  const customFetch = options.fetch || fetch;

  const getDiscovery = async () => {
    if (!discoveryDoc) {
      discoveryDoc = await fetchDiscoveryDocument(options.issuer, customFetch);
    }
    return discoveryDoc;
  };

  const getTokens = async (): Promise<OIDCTokens> => {
    // Check token storage first
    if (options.tokenStorage) {
      const stored = await options.tokenStorage.get();
      if (stored) {
        cachedTokens = stored;
      }
    }

    // Check if we have valid cached tokens
    if (cachedTokens && cachedTokens.expiresAt && cachedTokens.expiresAt > Date.now() + 60000) {
      return cachedTokens;
    }

    // Try to refresh if we have a refresh token
    if (cachedTokens?.refreshToken || options.refreshToken) {
      const discovery = await getDiscovery();
      const refreshToken = cachedTokens?.refreshToken || options.refreshToken!;

      try {
        cachedTokens = await refreshTokens(discovery, options, refreshToken, customFetch);
        if (options.tokenStorage) {
          await options.tokenStorage.set(cachedTokens);
        }
        return cachedTokens;
      } catch {
        // Refresh failed, fall through to other methods
      }
    }

    // Use pre-configured access token
    if (options.accessToken) {
      const token = typeof options.accessToken === 'function'
        ? await options.accessToken()
        : options.accessToken;

      return { accessToken: token, tokenType: 'Bearer' };
    }

    // Use client credentials flow (M2M)
    if (options.clientSecret) {
      const discovery = await getDiscovery();
      cachedTokens = await clientCredentialsFlow(discovery, options, customFetch);
      if (options.tokenStorage) {
        await options.tokenStorage.set(cachedTokens);
      }
      return cachedTokens;
    }

    throw new Error('No valid authentication method available. Provide accessToken, refreshToken, or clientSecret.');
  };

  return async (req, next) => {
    const tokens = await getTokens();
    const tokenType = tokens.tokenType || 'Bearer';

    const authReq = req.withHeader('Authorization', `${tokenType} ${tokens.accessToken}`);
    const response = await next(authReq);

    // Handle token expiration
    if (response.status === 401 && (cachedTokens?.refreshToken || options.refreshToken)) {
      try {
        const discovery = await getDiscovery();
        const refreshToken = cachedTokens?.refreshToken || options.refreshToken!;
        cachedTokens = await refreshTokens(discovery, options, refreshToken, customFetch);

        if (options.tokenStorage) {
          await options.tokenStorage.set(cachedTokens);
        }

        const retryReq = req.withHeader('Authorization', `${cachedTokens.tokenType || 'Bearer'} ${cachedTokens.accessToken}`);
        return next(retryReq);
      } catch {
        // Refresh failed, return original 401
        return response;
      }
    }

    return response;
  };
}

/**
 * OpenID Connect Authentication Plugin
 */
export function oidcPlugin(options: OIDCOptions): Plugin {
  return (client) => {
    client.use(oidc(options));
  };
}

// Re-export helper functions
export { fetchDiscoveryDocument, exchangeCode, refreshTokens, clientCredentialsFlow };

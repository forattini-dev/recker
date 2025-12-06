/**
 * Azure AD / Microsoft Entra ID Authentication
 * https://learn.microsoft.com/en-us/azure/active-directory/develop/
 *
 * Supports v2.0 endpoints for single-tenant, multi-tenant, and B2C
 */

import { Middleware, Plugin } from '../../types/index.js';
import { oidc, OIDCTokens, generatePKCE } from './oidc.js';

export interface AzureADOptions {
  /**
   * Azure AD Tenant ID, 'common', 'organizations', or 'consumers'
   * - Specific tenant ID for single-tenant
   * - 'common' for multi-tenant + personal
   * - 'organizations' for multi-tenant only
   * - 'consumers' for personal Microsoft accounts only
   */
  tenantId: string;

  /**
   * Application (client) ID from Azure portal
   */
  clientId: string;

  /**
   * Client secret (for confidential clients)
   */
  clientSecret?: string;

  /**
   * Client certificate for certificate-based auth
   */
  clientCertificate?: {
    thumbprint: string;
    privateKey: string;
  };

  /**
   * Requested scopes (default: ['.default'])
   * Use 'https://graph.microsoft.com/.default' for Graph API
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
   * Azure cloud instance (default: 'https://login.microsoftonline.com')
   * Other options:
   * - 'https://login.microsoftonline.us' (US Government)
   * - 'https://login.chinacloudapi.cn' (China)
   * - 'https://login.microsoftonline.de' (Germany)
   */
  cloudInstance?: string;

  /**
   * Azure AD B2C configuration
   */
  b2c?: {
    /**
     * B2C tenant name (e.g., 'contoso' for contoso.b2clogin.com)
     */
    tenantName: string;

    /**
     * User flow or policy name (e.g., 'B2C_1_signupsignin')
     */
    policy: string;
  };
}

/**
 * Get Azure AD issuer URL
 */
function getAzureADIssuer(options: AzureADOptions): string {
  if (options.b2c) {
    return `https://${options.b2c.tenantName}.b2clogin.com/${options.b2c.tenantName}.onmicrosoft.com/${options.b2c.policy}/v2.0`;
  }

  const cloudInstance = options.cloudInstance || 'https://login.microsoftonline.com';
  return `${cloudInstance}/${options.tenantId}/v2.0`;
}

/**
 * Get Azure AD token endpoint
 */
function getAzureADTokenEndpoint(options: AzureADOptions): string {
  if (options.b2c) {
    return `https://${options.b2c.tenantName}.b2clogin.com/${options.b2c.tenantName}.onmicrosoft.com/${options.b2c.policy}/oauth2/v2.0/token`;
  }

  const cloudInstance = options.cloudInstance || 'https://login.microsoftonline.com';
  return `${cloudInstance}/${options.tenantId}/oauth2/v2.0/token`;
}

/**
 * Generate Azure AD authorization URL
 */
export async function generateAzureADAuthUrl(
  options: AzureADOptions & {
    redirectUri: string;
    state?: string;
    nonce?: string;
    usePKCE?: boolean;
    prompt?: 'login' | 'none' | 'consent' | 'select_account';
    loginHint?: string;
    domainHint?: string;
  }
): Promise<{ url: string; codeVerifier?: string }> {
  const pkce = options.usePKCE ? generatePKCE() : undefined;

  let authorizeUrl: string;
  if (options.b2c) {
    authorizeUrl = `https://${options.b2c.tenantName}.b2clogin.com/${options.b2c.tenantName}.onmicrosoft.com/${options.b2c.policy}/oauth2/v2.0/authorize`;
  } else {
    const cloudInstance = options.cloudInstance || 'https://login.microsoftonline.com';
    authorizeUrl = `${cloudInstance}/${options.tenantId}/oauth2/v2.0/authorize`;
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    scope: (options.scopes || ['openid', 'profile', 'email']).join(' '),
    response_mode: 'query',
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

  if (options.loginHint) {
    params.set('login_hint', options.loginHint);
  }

  if (options.domainHint) {
    params.set('domain_hint', options.domainHint);
  }

  return {
    url: `${authorizeUrl}?${params.toString()}`,
    codeVerifier: pkce?.codeVerifier,
  };
}

/**
 * Exchange authorization code for tokens (Azure AD)
 */
export async function exchangeAzureADCode(
  options: AzureADOptions & {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }
): Promise<OIDCTokens> {
  const tokenUrl = getAzureADTokenEndpoint(options);

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: options.clientId,
    code: options.code,
    redirect_uri: options.redirectUri,
    scope: (options.scopes || ['openid', 'profile', 'email']).join(' '),
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
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.json() as { error: string; error_description?: string };
    throw new Error(`Azure AD token exchange failed: ${error.error_description || error.error}`);
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
 * On-Behalf-Of flow (for APIs calling other APIs)
 */
export async function azureADOnBehalfOf(
  options: AzureADOptions & {
    assertion: string;
    scope: string;
  }
): Promise<OIDCTokens> {
  const tokenUrl = getAzureADTokenEndpoint(options);

  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    client_id: options.clientId,
    assertion: options.assertion,
    scope: options.scope,
    requested_token_use: 'on_behalf_of',
  });

  if (options.clientSecret) {
    params.set('client_secret', options.clientSecret);
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.json() as { error: string; error_description?: string };
    throw new Error(`Azure AD OBO flow failed: ${error.error_description || error.error}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    tokenType: data.token_type || 'Bearer',
  };
}

/**
 * Get Microsoft Graph user info
 */
export async function getAzureADUserInfo(
  accessToken: string
): Promise<Record<string, unknown>> {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
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
 * Azure AD / Microsoft Entra ID Authentication Middleware
 *
 * @example
 * ```typescript
 * // Client credentials (M2M) for Microsoft Graph
 * client.use(azureAD({
 *   tenantId: 'your-tenant-id',
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret',
 *   scopes: ['https://graph.microsoft.com/.default']
 * }));
 *
 * // Multi-tenant app
 * client.use(azureAD({
 *   tenantId: 'common',
 *   clientId: 'your-client-id',
 *   accessToken: 'user-access-token'
 * }));
 *
 * // Azure AD B2C
 * client.use(azureAD({
 *   tenantId: 'your-tenant-id',
 *   clientId: 'your-client-id',
 *   b2c: {
 *     tenantName: 'contoso',
 *     policy: 'B2C_1_signupsignin'
 *   },
 *   accessToken: 'user-access-token'
 * }));
 *
 * // US Government cloud
 * client.use(azureAD({
 *   tenantId: 'your-tenant-id',
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret',
 *   cloudInstance: 'https://login.microsoftonline.us',
 *   scopes: ['https://graph.microsoft.us/.default']
 * }));
 * ```
 */
export function azureAD(options: AzureADOptions): Middleware {
  const issuer = getAzureADIssuer(options);

  // Default scopes for Azure AD
  const scopes = options.scopes || ['openid', 'profile', 'email', 'offline_access'];

  return oidc({
    issuer,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    scopes,
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    tokenStorage: options.tokenStorage,
  });
}

/**
 * Azure AD Authentication Plugin
 */
export function azureADPlugin(options: AzureADOptions): Plugin {
  return (client) => {
    client.use(azureAD(options));
  };
}

// Alias for new naming
export { azureAD as entraId, azureADPlugin as entraIdPlugin };

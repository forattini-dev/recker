/**
 * Firebase Authentication
 * https://firebase.google.com/docs/auth
 *
 * Supports ID tokens and Admin SDK service accounts
 */

import { Middleware, Plugin } from '../../types/index.js';
import { createSign, createPrivateKey } from 'node:crypto';

export interface FirebaseAuthOptions {
  /**
   * Firebase project ID
   */
  projectId: string;

  /**
   * Pre-obtained ID token (from client SDK)
   */
  idToken?: string | (() => string | Promise<string>);

  /**
   * Service account credentials for server-side auth
   */
  serviceAccount?: FirebaseServiceAccount;

  /**
   * Service account JSON file path
   */
  serviceAccountPath?: string;

  /**
   * API key for Firebase REST APIs (limited functionality)
   */
  apiKey?: string;

  /**
   * Custom token for Firebase Auth (from Admin SDK)
   */
  customToken?: string;

  /**
   * Token storage for persistence
   */
  tokenStorage?: {
    get: () => Promise<FirebaseTokens | null>;
    set: (tokens: FirebaseTokens) => Promise<void>;
  };
}

export interface FirebaseServiceAccount {
  type: 'service_account';
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

export interface FirebaseTokens {
  idToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

/**
 * Create a custom Firebase token using service account
 */
export function createFirebaseCustomToken(
  serviceAccount: FirebaseServiceAccount,
  uid: string,
  claims?: Record<string, unknown>
): string {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now,
    exp: now + 3600, // 1 hour
    uid,
    claims,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const privateKey = createPrivateKey(serviceAccount.private_key);
  const sign = createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(privateKey, 'base64url');

  return `${signatureInput}.${signature}`;
}

/**
 * Get Google OAuth2 access token using service account (for Admin SDK)
 */
async function getServiceAccountAccessToken(
  serviceAccount: FirebaseServiceAccount,
  scopes: string[] = ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase']
): Promise<{ accessToken: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: serviceAccount.token_uri,
    iat: now,
    exp: now + 3600,
    scope: scopes.join(' '),
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const privateKey = createPrivateKey(serviceAccount.private_key);
  const sign = createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(privateKey, 'base64url');

  const jwt = `${signatureInput}.${signature}`;

  const response = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get Firebase access token: ${error}`);
  }

  const data = await response.json() as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Exchange custom token for ID token
 */
async function exchangeCustomTokenForIdToken(
  apiKey: string,
  customToken: string
): Promise<FirebaseTokens> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: customToken,
        returnSecureToken: true,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json() as { error: { message: string } };
    throw new Error(`Failed to exchange custom token: ${error.error.message}`);
  }

  const data = await response.json() as {
    idToken: string;
    refreshToken: string;
    expiresIn: string;
  };

  return {
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + parseInt(data.expiresIn, 10) * 1000,
  };
}

/**
 * Refresh Firebase ID token
 */
async function refreshFirebaseToken(
  apiKey: string,
  refreshToken: string
): Promise<FirebaseTokens> {
  const response = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    }
  );

  if (!response.ok) {
    const error = await response.json() as { error: { message: string } };
    throw new Error(`Failed to refresh token: ${error.error.message}`);
  }

  const data = await response.json() as {
    id_token: string;
    refresh_token: string;
    expires_in: string;
  };

  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + parseInt(data.expires_in, 10) * 1000,
  };
}

/**
 * Verify Firebase ID token (server-side)
 */
export async function verifyFirebaseIdToken(
  projectId: string,
  idToken: string
): Promise<Record<string, unknown>> {
  // Decode and verify (simplified - in production use Google's public keys)
  const [, payloadB64] = idToken.split('.');
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

  // Check issuer and audience
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Invalid token issuer');
  }

  if (payload.aud !== projectId) {
    throw new Error('Invalid token audience');
  }

  // Check expiration
  if (payload.exp < Date.now() / 1000) {
    throw new Error('Token expired');
  }

  return payload;
}

/**
 * Firebase Authentication Middleware
 *
 * @example
 * ```typescript
 * // With pre-obtained ID token (from client SDK)
 * client.use(firebase({
 *   projectId: 'your-project-id',
 *   idToken: 'user-id-token'
 * }));
 *
 * // With service account (server-side)
 * client.use(firebase({
 *   projectId: 'your-project-id',
 *   serviceAccount: require('./service-account.json')
 * }));
 *
 * // With API key and refresh token
 * client.use(firebase({
 *   projectId: 'your-project-id',
 *   apiKey: 'your-api-key',
 *   idToken: 'current-id-token',
 *   tokenStorage: {
 *     get: async () => loadTokens(),
 *     set: async (tokens) => saveTokens(tokens)
 *   }
 * }));
 * ```
 */
export function firebase(options: FirebaseAuthOptions): Middleware {
  let cachedTokens: FirebaseTokens | null = null;
  let serviceAccountToken: { accessToken: string; expiresAt: number } | null = null;

  const getToken = async (): Promise<string> => {
    // Check token storage
    if (options.tokenStorage) {
      const stored = await options.tokenStorage.get();
      if (stored) {
        cachedTokens = stored;
      }
    }

    // Return valid cached ID token
    if (cachedTokens && cachedTokens.expiresAt && cachedTokens.expiresAt > Date.now() + 60000) {
      return cachedTokens.idToken;
    }

    // Try refresh
    if (cachedTokens?.refreshToken && options.apiKey) {
      try {
        cachedTokens = await refreshFirebaseToken(options.apiKey, cachedTokens.refreshToken);
        if (options.tokenStorage) {
          await options.tokenStorage.set(cachedTokens);
        }
        return cachedTokens.idToken;
      } catch {
        // Fall through
      }
    }

    // Use pre-configured ID token
    if (options.idToken) {
      const token = typeof options.idToken === 'function'
        ? await options.idToken()
        : options.idToken;
      return token;
    }

    // Use service account (for Admin SDK / server-to-server)
    if (options.serviceAccount) {
      if (!serviceAccountToken || serviceAccountToken.expiresAt < Date.now() + 60000) {
        serviceAccountToken = await getServiceAccountAccessToken(options.serviceAccount);
      }
      return serviceAccountToken.accessToken;
    }

    // Exchange custom token
    if (options.customToken && options.apiKey) {
      cachedTokens = await exchangeCustomTokenForIdToken(options.apiKey, options.customToken);
      if (options.tokenStorage) {
        await options.tokenStorage.set(cachedTokens);
      }
      return cachedTokens.idToken;
    }

    throw new Error('No valid authentication method. Provide idToken, serviceAccount, or customToken with apiKey.');
  };

  return async (req, next) => {
    const token = await getToken();
    const authReq = req.withHeader('Authorization', `Bearer ${token}`);
    const response = await next(authReq);

    // Handle token expiration
    if (response.status === 401 && cachedTokens?.refreshToken && options.apiKey) {
      try {
        cachedTokens = await refreshFirebaseToken(options.apiKey, cachedTokens.refreshToken);
        if (options.tokenStorage) {
          await options.tokenStorage.set(cachedTokens);
        }
        const retryReq = req.withHeader('Authorization', `Bearer ${cachedTokens.idToken}`);
        return next(retryReq);
      } catch {
        return response;
      }
    }

    return response;
  };
}

/**
 * Firebase Authentication Plugin
 */
export function firebasePlugin(options: FirebaseAuthOptions): Plugin {
  return (client) => {
    client.use(firebase(options));
  };
}

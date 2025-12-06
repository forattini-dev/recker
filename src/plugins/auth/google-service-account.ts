/**
 * Google Service Account Authentication
 * https://cloud.google.com/iam/docs/service-accounts
 *
 * JWT-based authentication for server-to-server communication
 */

import { Middleware, Plugin } from '../../types/index.js';
import { createSign, createPrivateKey } from 'node:crypto';

export interface GoogleServiceAccountOptions {
  /**
   * Service account credentials object
   */
  credentials?: GoogleServiceAccountCredentials;

  /**
   * Path to service account JSON file
   */
  keyFile?: string;

  /**
   * OAuth2 scopes to request
   * @example ['https://www.googleapis.com/auth/cloud-platform']
   */
  scopes: string[];

  /**
   * Subject for domain-wide delegation (impersonation)
   */
  subject?: string;

  /**
   * Pre-obtained access token (overrides service account auth)
   */
  accessToken?: string | (() => string | Promise<string>);
}

export interface GoogleServiceAccountCredentials {
  type: 'service_account';
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain?: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Create a signed JWT for Google OAuth2
 */
function createServiceAccountJWT(
  credentials: GoogleServiceAccountCredentials,
  scopes: string[],
  subject?: string
): string {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: credentials.private_key_id,
  };

  const payload: Record<string, unknown> = {
    iss: credentials.client_email,
    aud: credentials.token_uri,
    iat: now,
    exp: now + 3600, // 1 hour
    scope: scopes.join(' '),
  };

  // For domain-wide delegation (impersonating a user)
  if (subject) {
    payload.sub = subject;
  }

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const privateKey = createPrivateKey(credentials.private_key);
  const sign = createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(privateKey, 'base64url');

  return `${signatureInput}.${signature}`;
}

/**
 * Exchange signed JWT for access token
 */
async function exchangeJWTForAccessToken(
  credentials: GoogleServiceAccountCredentials,
  jwt: string
): Promise<CachedToken> {
  const response = await fetch(credentials.token_uri, {
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
    const error = await response.json() as { error: string; error_description?: string };
    throw new Error(`Failed to get access token: ${error.error_description || error.error}`);
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
 * Get ID token for invoking Cloud Run / Cloud Functions
 */
export async function getGoogleIdToken(
  credentials: GoogleServiceAccountCredentials,
  targetAudience: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: credentials.private_key_id,
  };

  const payload = {
    iss: credentials.client_email,
    aud: credentials.token_uri,
    iat: now,
    exp: now + 3600,
    target_audience: targetAudience,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const privateKey = createPrivateKey(credentials.private_key);
  const sign = createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(privateKey, 'base64url');

  const jwt = `${signatureInput}.${signature}`;

  const response = await fetch(credentials.token_uri, {
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
    const error = await response.json() as { error: string; error_description?: string };
    throw new Error(`Failed to get ID token: ${error.error_description || error.error}`);
  }

  const data = await response.json() as { id_token: string };
  return data.id_token;
}

/**
 * Load credentials from file
 */
async function loadCredentialsFromFile(keyFile: string): Promise<GoogleServiceAccountCredentials> {
  const fs = await import('node:fs/promises');
  const content = await fs.readFile(keyFile, 'utf-8');
  return JSON.parse(content) as GoogleServiceAccountCredentials;
}

/**
 * Google Service Account Authentication Middleware
 *
 * @example
 * ```typescript
 * // With credentials object
 * client.use(googleServiceAccount({
 *   credentials: require('./service-account.json'),
 *   scopes: ['https://www.googleapis.com/auth/cloud-platform']
 * }));
 *
 * // With key file path
 * client.use(googleServiceAccount({
 *   keyFile: './service-account.json',
 *   scopes: ['https://www.googleapis.com/auth/cloud-platform']
 * }));
 *
 * // With domain-wide delegation (G Suite)
 * client.use(googleServiceAccount({
 *   credentials: serviceAccount,
 *   scopes: ['https://www.googleapis.com/auth/admin.directory.user'],
 *   subject: 'admin@example.com'  // User to impersonate
 * }));
 *
 * // For BigQuery
 * client.use(googleServiceAccount({
 *   keyFile: './service-account.json',
 *   scopes: ['https://www.googleapis.com/auth/bigquery']
 * }));
 *
 * // For Cloud Storage
 * client.use(googleServiceAccount({
 *   keyFile: './service-account.json',
 *   scopes: ['https://www.googleapis.com/auth/devstorage.read_write']
 * }));
 * ```
 */
export function googleServiceAccount(options: GoogleServiceAccountOptions): Middleware {
  let cachedToken: CachedToken | null = null;
  let credentialsLoaded: GoogleServiceAccountCredentials | null = null;

  const getCredentials = async (): Promise<GoogleServiceAccountCredentials> => {
    if (credentialsLoaded) {
      return credentialsLoaded;
    }

    if (options.credentials) {
      credentialsLoaded = options.credentials;
      return credentialsLoaded;
    }

    if (options.keyFile) {
      credentialsLoaded = await loadCredentialsFromFile(options.keyFile);
      return credentialsLoaded;
    }

    // Try Application Default Credentials (ADC)
    const adcPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (adcPath) {
      credentialsLoaded = await loadCredentialsFromFile(adcPath);
      return credentialsLoaded;
    }

    throw new Error('No credentials provided. Set credentials, keyFile, or GOOGLE_APPLICATION_CREDENTIALS environment variable.');
  };

  const getAccessToken = async (): Promise<string> => {
    // Use pre-configured access token
    if (options.accessToken) {
      const token = typeof options.accessToken === 'function'
        ? await options.accessToken()
        : options.accessToken;
      return token;
    }

    // Return valid cached token
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
      return cachedToken.accessToken;
    }

    // Get new token
    const credentials = await getCredentials();
    const jwt = createServiceAccountJWT(credentials, options.scopes, options.subject);
    cachedToken = await exchangeJWTForAccessToken(credentials, jwt);

    return cachedToken.accessToken;
  };

  return async (req, next) => {
    const token = await getAccessToken();
    const authReq = req.withHeader('Authorization', `Bearer ${token}`);
    const response = await next(authReq);

    // Handle token expiration
    if (response.status === 401) {
      cachedToken = null; // Invalidate cache
      const newToken = await getAccessToken();
      const retryReq = req.withHeader('Authorization', `Bearer ${newToken}`);
      return next(retryReq);
    }

    return response;
  };
}

/**
 * Google Service Account Authentication Plugin
 */
export function googleServiceAccountPlugin(options: GoogleServiceAccountOptions): Plugin {
  return (client) => {
    client.use(googleServiceAccount(options));
  };
}

// Common scope presets
export const GoogleScopes = {
  CLOUD_PLATFORM: 'https://www.googleapis.com/auth/cloud-platform',
  CLOUD_PLATFORM_READ_ONLY: 'https://www.googleapis.com/auth/cloud-platform.read-only',
  BIGQUERY: 'https://www.googleapis.com/auth/bigquery',
  BIGQUERY_READ_ONLY: 'https://www.googleapis.com/auth/bigquery.readonly',
  STORAGE_FULL: 'https://www.googleapis.com/auth/devstorage.full_control',
  STORAGE_READ_WRITE: 'https://www.googleapis.com/auth/devstorage.read_write',
  STORAGE_READ_ONLY: 'https://www.googleapis.com/auth/devstorage.read_only',
  COMPUTE: 'https://www.googleapis.com/auth/compute',
  COMPUTE_READ_ONLY: 'https://www.googleapis.com/auth/compute.readonly',
  PUBSUB: 'https://www.googleapis.com/auth/pubsub',
  DATASTORE: 'https://www.googleapis.com/auth/datastore',
  FIRESTORE: 'https://www.googleapis.com/auth/datastore',
  FIREBASE: 'https://www.googleapis.com/auth/firebase',
  DRIVE: 'https://www.googleapis.com/auth/drive',
  DRIVE_READ_ONLY: 'https://www.googleapis.com/auth/drive.readonly',
  GMAIL_SEND: 'https://www.googleapis.com/auth/gmail.send',
  GMAIL_READ_ONLY: 'https://www.googleapis.com/auth/gmail.readonly',
  CALENDAR: 'https://www.googleapis.com/auth/calendar',
  CALENDAR_READ_ONLY: 'https://www.googleapis.com/auth/calendar.readonly',
  SHEETS: 'https://www.googleapis.com/auth/spreadsheets',
  SHEETS_READ_ONLY: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  ADMIN_DIRECTORY_USER: 'https://www.googleapis.com/auth/admin.directory.user',
  ADMIN_DIRECTORY_GROUP: 'https://www.googleapis.com/auth/admin.directory.group',
} as const;

/**
 * GitHub App Authentication
 * https://docs.github.com/en/developers/apps/building-github-apps/authenticating-with-github-apps
 *
 * JWT → Installation Token flow for GitHub Apps
 */

import { Middleware, Plugin } from '../../types/index.js';
import { createSign, createPrivateKey } from 'node:crypto';

export interface GitHubAppOptions {
  /**
   * GitHub App ID
   */
  appId: string | number;

  /**
   * GitHub App private key (PEM format)
   */
  privateKey: string;

  /**
   * Installation ID for the target repository/organization
   */
  installationId?: string | number;

  /**
   * Repository permissions to request (optional, uses app default)
   */
  permissions?: Record<string, 'read' | 'write'>;

  /**
   * Specific repositories to limit access (optional)
   */
  repositoryIds?: number[];

  /**
   * Specific repository names to limit access (optional)
   */
  repositories?: string[];

  /**
   * GitHub Enterprise Server URL (optional)
   * @default 'https://api.github.com'
   */
  baseUrl?: string;

  /**
   * Pre-obtained installation token (skips JWT flow)
   */
  installationToken?: string | (() => string | Promise<string>);

  /**
   * Token storage for caching installation tokens
   */
  tokenStorage?: {
    get: () => Promise<GitHubInstallationToken | null>;
    set: (token: GitHubInstallationToken) => Promise<void>;
  };
}

export interface GitHubInstallationToken {
  token: string;
  expiresAt: number;
  permissions?: Record<string, string>;
  repositorySelection?: string;
}

/**
 * Create GitHub App JWT
 */
function createGitHubAppJWT(appId: string | number, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iat: now - 60, // Issued 60 seconds ago (clock drift)
    exp: now + 600, // Expires in 10 minutes (max allowed)
    iss: appId.toString(),
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const key = createPrivateKey(privateKey);
  const sign = createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(key, 'base64url');

  return `${signatureInput}.${signature}`;
}

/**
 * Get installation access token using JWT
 */
async function getInstallationToken(
  jwt: string,
  installationId: string | number,
  options: {
    baseUrl?: string;
    permissions?: Record<string, 'read' | 'write'>;
    repositoryIds?: number[];
    repositories?: string[];
  }
): Promise<GitHubInstallationToken> {
  const baseUrl = options.baseUrl || 'https://api.github.com';
  const url = `${baseUrl}/app/installations/${installationId}/access_tokens`;

  const body: Record<string, unknown> = {};
  if (options.permissions) {
    body.permissions = options.permissions;
  }
  if (options.repositoryIds) {
    body.repository_ids = options.repositoryIds;
  }
  if (options.repositories) {
    body.repositories = options.repositories;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json() as { message: string };
    throw new Error(`Failed to get installation token: ${error.message}`);
  }

  const data = await response.json() as {
    token: string;
    expires_at: string;
    permissions: Record<string, string>;
    repository_selection: string;
  };

  return {
    token: data.token,
    expiresAt: new Date(data.expires_at).getTime(),
    permissions: data.permissions,
    repositorySelection: data.repository_selection,
  };
}

/**
 * List GitHub App installations
 */
export async function listGitHubAppInstallations(
  appId: string | number,
  privateKey: string,
  baseUrl?: string
): Promise<Array<{
  id: number;
  account: { login: string; type: string };
  repository_selection: string;
  permissions: Record<string, string>;
}>> {
  const jwt = createGitHubAppJWT(appId, privateKey);
  const url = `${baseUrl || 'https://api.github.com'}/app/installations`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const error = await response.json() as { message: string };
    throw new Error(`Failed to list installations: ${error.message}`);
  }

  return response.json() as Promise<Array<{
    id: number;
    account: { login: string; type: string };
    repository_selection: string;
    permissions: Record<string, string>;
  }>>;
}

/**
 * Get installation ID for a repository
 */
export async function getGitHubAppInstallationForRepo(
  appId: string | number,
  privateKey: string,
  owner: string,
  repo: string,
  baseUrl?: string
): Promise<number> {
  const jwt = createGitHubAppJWT(appId, privateKey);
  const url = `${baseUrl || 'https://api.github.com'}/repos/${owner}/${repo}/installation`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const error = await response.json() as { message: string };
    throw new Error(`Failed to get installation: ${error.message}`);
  }

  const data = await response.json() as { id: number };
  return data.id;
}

/**
 * Get GitHub App metadata (authenticated as the app)
 */
export async function getGitHubAppInfo(
  appId: string | number,
  privateKey: string,
  baseUrl?: string
): Promise<Record<string, unknown>> {
  const jwt = createGitHubAppJWT(appId, privateKey);
  const url = `${baseUrl || 'https://api.github.com'}/app`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const error = await response.json() as { message: string };
    throw new Error(`Failed to get app info: ${error.message}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

/**
 * GitHub App Authentication Middleware
 *
 * @example
 * ```typescript
 * // With installation ID (recommended)
 * client.use(githubApp({
 *   appId: '12345',
 *   privateKey: fs.readFileSync('private-key.pem', 'utf-8'),
 *   installationId: '67890'
 * }));
 *
 * // With limited permissions
 * client.use(githubApp({
 *   appId: '12345',
 *   privateKey: process.env.GITHUB_PRIVATE_KEY,
 *   installationId: '67890',
 *   permissions: {
 *     contents: 'read',
 *     pull_requests: 'write'
 *   }
 * }));
 *
 * // With specific repositories
 * client.use(githubApp({
 *   appId: '12345',
 *   privateKey: privateKey,
 *   installationId: '67890',
 *   repositories: ['my-repo', 'other-repo']
 * }));
 *
 * // GitHub Enterprise Server
 * client.use(githubApp({
 *   appId: '12345',
 *   privateKey: privateKey,
 *   installationId: '67890',
 *   baseUrl: 'https://github.mycompany.com/api/v3'
 * }));
 *
 * // With pre-obtained token
 * client.use(githubApp({
 *   appId: '12345',
 *   privateKey: privateKey,
 *   installationToken: 'ghs_xxxx'
 * }));
 * ```
 */
export function githubApp(options: GitHubAppOptions): Middleware {
  let cachedToken: GitHubInstallationToken | null = null;

  const getToken = async (): Promise<string> => {
    // Use pre-configured installation token
    if (options.installationToken) {
      const token = typeof options.installationToken === 'function'
        ? await options.installationToken()
        : options.installationToken;
      return token;
    }

    // Check token storage
    if (options.tokenStorage) {
      const stored = await options.tokenStorage.get();
      if (stored) {
        cachedToken = stored;
      }
    }

    // Return valid cached token (with 5 min buffer)
    if (cachedToken && cachedToken.expiresAt > Date.now() + 300000) {
      return cachedToken.token;
    }

    // Need installation ID for token exchange
    if (!options.installationId) {
      throw new Error('Installation ID is required for GitHub App authentication');
    }

    // Get new installation token
    const jwt = createGitHubAppJWT(options.appId, options.privateKey);
    cachedToken = await getInstallationToken(jwt, options.installationId, {
      baseUrl: options.baseUrl,
      permissions: options.permissions,
      repositoryIds: options.repositoryIds,
      repositories: options.repositories,
    });

    if (options.tokenStorage) {
      await options.tokenStorage.set(cachedToken);
    }

    return cachedToken.token;
  };

  return async (req, next) => {
    const token = await getToken();

    // Add GitHub-specific headers
    let authReq = req.withHeader('Authorization', `Bearer ${token}`);
    authReq = authReq.withHeader('Accept', 'application/vnd.github+json');
    authReq = authReq.withHeader('X-GitHub-Api-Version', '2022-11-28');

    const response = await next(authReq);

    // Handle token expiration
    if (response.status === 401 && options.installationId) {
      cachedToken = null; // Invalidate cache

      const jwt = createGitHubAppJWT(options.appId, options.privateKey);
      cachedToken = await getInstallationToken(jwt, options.installationId, {
        baseUrl: options.baseUrl,
        permissions: options.permissions,
        repositoryIds: options.repositoryIds,
        repositories: options.repositories,
      });

      if (options.tokenStorage) {
        await options.tokenStorage.set(cachedToken);
      }

      let retryReq = req.withHeader('Authorization', `Bearer ${cachedToken.token}`);
      retryReq = retryReq.withHeader('Accept', 'application/vnd.github+json');
      retryReq = retryReq.withHeader('X-GitHub-Api-Version', '2022-11-28');

      return next(retryReq);
    }

    return response;
  };
}

/**
 * GitHub App Authentication Plugin
 */
export function githubAppPlugin(options: GitHubAppOptions): Plugin {
  return (client) => {
    client.use(githubApp(options));
  };
}

// Export JWT creation for advanced use cases
export { createGitHubAppJWT };

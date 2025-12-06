/**
 * Authentication Plugins
 *
 * Comprehensive authentication support for various providers and protocols.
 *
 * ## Basic Methods (6)
 * - Basic Auth (RFC 7617)
 * - Bearer Token (RFC 6750)
 * - API Key (Header/Query)
 * - Digest Auth (RFC 7616)
 * - OAuth2 (RFC 6749)
 * - AWS Signature V4
 *
 * ## Identity Providers (6)
 * - OIDC (OpenID Connect)
 * - Auth0
 * - AWS Cognito
 * - Okta
 * - Azure AD / Microsoft Entra ID
 * - Firebase
 *
 * ## Service Accounts (2)
 * - Google Service Account
 * - GitHub App
 *
 * ## Certificate-Based (1)
 * - mTLS (Mutual TLS)
 *
 * @example
 * ```typescript
 * import {
 *   basicAuth,
 *   bearerAuth,
 *   oauth2,
 *   auth0,
 *   cognito,
 *   googleServiceAccount,
 *   githubApp,
 *   mtls
 * } from 'recker';
 *
 * // Basic auth
 * client.use(basicAuth({ username: 'user', password: 'pass' }));
 *
 * // OAuth2 with auto-refresh
 * client.use(oauth2({
 *   accessToken: () => getToken(),
 *   onTokenExpired: () => refreshToken()
 * }));
 *
 * // Auth0 M2M
 * client.use(auth0({
 *   domain: 'tenant.auth0.com',
 *   clientId: '...',
 *   clientSecret: '...',
 *   audience: 'https://api.example.com'
 * }));
 *
 * // GitHub App
 * client.use(githubApp({
 *   appId: '12345',
 *   privateKey: privateKeyPem,
 *   installationId: '67890'
 * }));
 * ```
 */

// Basic Authentication Methods
export {
  basicAuth,
  basicAuthPlugin,
  type BasicAuthOptions,
} from './basic.js';

export {
  bearerAuth,
  bearerAuthPlugin,
  type BearerAuthOptions,
} from './bearer.js';

export {
  apiKeyAuth,
  apiKeyAuthPlugin,
  type ApiKeyAuthOptions,
} from './api-key.js';

export {
  digestAuth,
  digestAuthPlugin,
  type DigestAuthOptions,
} from './digest.js';

export {
  oauth2,
  oauth2Plugin,
  type OAuth2Options,
} from './oauth2.js';

export {
  awsSignatureV4,
  awsSignatureV4Plugin,
  type AWSSignatureV4Options,
} from './aws-sigv4.js';

// Identity Providers
export {
  oidc,
  oidcPlugin,
  generatePKCE,
  generateAuthorizationUrl,
  fetchDiscoveryDocument,
  exchangeCode,
  refreshTokens,
  clientCredentialsFlow,
  type OIDCOptions,
  type OIDCTokens,
  type OIDCDiscoveryDocument,
} from './oidc.js';

export {
  auth0,
  auth0Plugin,
  generateAuth0AuthUrl,
  exchangeAuth0Code,
  getAuth0UserInfo,
  type Auth0Options,
} from './auth0.js';

export {
  cognito,
  cognitoPlugin,
  getCognitoIdentityCredentials,
  getCognitoHostedUIUrl,
  type CognitoOptions,
  type CognitoTokens,
  type CognitoAWSCredentials,
} from './cognito.js';

export {
  okta,
  oktaPlugin,
  generateOktaAuthUrl,
  exchangeOktaCode,
  getOktaUserInfo,
  introspectOktaToken,
  revokeOktaToken,
  type OktaOptions,
} from './okta.js';

export {
  azureAD,
  azureADPlugin,
  entraId,
  entraIdPlugin,
  generateAzureADAuthUrl,
  exchangeAzureADCode,
  azureADOnBehalfOf,
  getAzureADUserInfo,
  type AzureADOptions,
} from './azure-ad.js';

export {
  firebase,
  firebasePlugin,
  createFirebaseCustomToken,
  verifyFirebaseIdToken,
  type FirebaseAuthOptions,
  type FirebaseServiceAccount,
  type FirebaseTokens,
} from './firebase.js';

// Service Accounts
export {
  googleServiceAccount,
  googleServiceAccountPlugin,
  getGoogleIdToken,
  GoogleScopes,
  type GoogleServiceAccountOptions,
  type GoogleServiceAccountCredentials,
} from './google-service-account.js';

export {
  githubApp,
  githubAppPlugin,
  createGitHubAppJWT,
  listGitHubAppInstallations,
  getGitHubAppInstallationForRepo,
  getGitHubAppInfo,
  type GitHubAppOptions,
  type GitHubInstallationToken,
} from './github-app.js';

// Certificate-Based
export {
  mtls,
  mtlsPlugin,
  createMTLSAgent,
  parseCertificateInfo,
  isCertificateValid,
  verifyCertificateFingerprint,
  type MTLSOptions,
  type MTLSCertificateInfo,
} from './mtls.js';
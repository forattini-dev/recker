/**
 * Authentication Plugins
 *
 * Re-exports from the auth/ directory for backwards compatibility.
 *
 * ## 15 Authentication Methods:
 *
 * ### Basic Methods (6)
 * - `basicAuth` - Basic Auth (RFC 7617)
 * - `bearerAuth` - Bearer Token (RFC 6750)
 * - `apiKeyAuth` - API Key (Header/Query)
 * - `digestAuth` - Digest Auth (RFC 7616)
 * - `oauth2` - OAuth 2.0 (RFC 6749)
 * - `awsSignatureV4` - AWS Signature V4
 *
 * ### Identity Providers (6)
 * - `oidc` - OpenID Connect (OIDC)
 * - `auth0` - Auth0
 * - `cognito` - AWS Cognito
 * - `okta` - Okta
 * - `azureAD` / `entraId` - Azure AD / Microsoft Entra ID
 * - `firebase` - Firebase Auth
 *
 * ### Service Accounts (2)
 * - `googleServiceAccount` - Google Cloud Service Account
 * - `githubApp` - GitHub App
 *
 * ### Certificate-Based (1)
 * - `mtls` - Mutual TLS
 *
 * @module
 */

export * from './auth/index.js';

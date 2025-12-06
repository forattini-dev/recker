# Authentication Plugins

Recker provides comprehensive authentication support with **15 methods** organized into four categories:

- **Basic Methods (6)**: Standard HTTP authentication schemes
- **Identity Providers (6)**: OAuth2/OIDC providers
- **Service Accounts (2)**: Server-to-server authentication
- **Certificate-Based (1)**: mTLS authentication

## Quick Reference

| Method | Use Case | Import |
|--------|----------|--------|
| Basic Auth | Legacy APIs, internal tools | `basicAuth` |
| Bearer Token | JWT, OAuth2 tokens | `bearerAuth` |
| API Key | Simple API authentication | `apiKeyAuth` |
| Digest Auth | Legacy secure APIs | `digestAuth` |
| OAuth2 | Token management with refresh | `oauth2` |
| AWS SigV4 | AWS services | `awsSignatureV4` |
| OIDC | Generic OpenID Connect | `oidc` |
| Auth0 | Auth0 M2M and user flows | `auth0` |
| Cognito | AWS Cognito User Pools | `cognito` |
| Okta | Okta workforce identity | `okta` |
| Azure AD | Microsoft services, Graph API | `azureAD` / `entraId` |
| Firebase | Firebase services | `firebase` |
| Google Service Account | GCP services | `googleServiceAccount` |
| GitHub App | GitHub API with app auth | `githubApp` |
| mTLS | Certificate-based auth | `mtls` |

---

## Basic Methods

### Basic Auth (RFC 7617)

Username and password encoded in Base64.

```typescript
import { createClient, basicAuth } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(basicAuth({
  username: 'user',
  password: 'pass'
}));

// Sends: Authorization: Basic dXNlcjpwYXNz
```

### Bearer Token (RFC 6750)

Token-based authentication, commonly used with JWTs.

```typescript
import { bearerAuth } from 'recker';

// Static token
client.use(bearerAuth({
  token: 'my-jwt-token'
}));

// Dynamic token (refreshed on each request)
client.use(bearerAuth({
  token: async () => await getAccessToken()
}));

// Custom token type
client.use(bearerAuth({
  token: 'my-token',
  type: 'Token',  // Sends: Authorization: Token my-token
}));

// Custom header name
client.use(bearerAuth({
  token: 'my-token',
  headerName: 'X-Auth-Token'
}));
```

### API Key

Key-based authentication in header or query parameter.

```typescript
import { apiKeyAuth } from 'recker';

// In header (default)
client.use(apiKeyAuth({
  key: 'my-api-key'
}));
// Sends: X-API-Key: my-api-key

// Custom header name
client.use(apiKeyAuth({
  key: 'my-api-key',
  name: 'Authorization'
}));

// In query parameter
client.use(apiKeyAuth({
  key: 'my-api-key',
  in: 'query',
  name: 'api_key'
}));
// Appends: ?api_key=my-api-key
```

### Digest Auth (RFC 7616)

Challenge-response authentication with MD5/SHA-256.

```typescript
import { digestAuth } from 'recker';

client.use(digestAuth({
  username: 'user',
  password: 'pass'
}));

// With preemptive auth (skip initial 401)
client.use(digestAuth({
  username: 'user',
  password: 'pass',
  preemptive: true
}));
```

**How it works:**
1. First request returns 401 with `WWW-Authenticate: Digest` challenge
2. Plugin computes response hash and retries
3. Subsequent requests reuse the challenge (with preemptive)

### OAuth2

OAuth 2.0 with automatic token refresh on 401.

```typescript
import { oauth2 } from 'recker';

// With token provider
client.use(oauth2({
  accessToken: () => tokenStore.getAccessToken()
}));

// With auto-refresh on 401
client.use(oauth2({
  accessToken: () => tokenStore.getAccessToken(),
  onTokenExpired: async () => {
    await tokenStore.refresh();
    return tokenStore.getAccessToken();
  }
}));

// With custom token type
client.use(oauth2({
  accessToken: 'my-token',
  tokenType: 'MAC'  // Sends: Authorization: MAC my-token
}));
```

### AWS Signature V4

Sign requests for AWS services.

```typescript
import { awsSignatureV4 } from 'recker';

client.use(awsSignatureV4({
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  service: 'execute-api'
}));

// With temporary credentials (STS)
client.use(awsSignatureV4({
  accessKeyId: 'ASIA...',
  secretAccessKey: '...',
  sessionToken: 'FwoGZX...',
  region: 'us-east-1',
  service: 's3'
}));
```

**Common services:** `execute-api` (API Gateway), `s3`, `dynamodb`, `lambda`, `sqs`, `sns`

---

## Identity Providers

### OIDC (OpenID Connect)

Generic OIDC provider with discovery and token management.

```typescript
import { oidc, generatePKCE, generateAuthorizationUrl } from 'recker';

// Client credentials flow (M2M)
client.use(oidc({
  issuer: 'https://idp.example.com',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  scopes: ['openid', 'profile']
}));

// With pre-obtained token
client.use(oidc({
  issuer: 'https://idp.example.com',
  clientId: 'your-client-id',
  accessToken: 'user-access-token',
  refreshToken: 'user-refresh-token'
}));

// Generate authorization URL with PKCE
const pkce = generatePKCE();
const { url } = await generateAuthorizationUrl({
  issuer: 'https://idp.example.com',
  clientId: 'your-client-id',
  redirectUri: 'https://app.example.com/callback',
  scopes: ['openid', 'profile'],
  codeChallenge: pkce.codeChallenge,
  codeChallengeMethod: 'S256',
  state: crypto.randomUUID()
});
```

### Auth0

Auth0-specific wrapper with M2M and user flows.

```typescript
import { auth0, generateAuth0AuthUrl, exchangeAuth0Code } from 'recker';

// Machine-to-Machine (M2M) with Client Credentials
client.use(auth0({
  domain: 'your-tenant.auth0.com',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  audience: 'https://api.example.com'
}));

// With pre-obtained user token
client.use(auth0({
  domain: 'your-tenant.auth0.com',
  clientId: 'your-client-id',
  accessToken: 'user-access-token',
  refreshToken: 'user-refresh-token'
}));

// With Auth0 Organizations
client.use(auth0({
  domain: 'your-tenant.auth0.com',
  clientId: 'your-client-id',
  accessToken: getToken,
  organization: 'org_12345'
}));

// Generate auth URL for user login
const { url, codeVerifier } = await generateAuth0AuthUrl({
  domain: 'your-tenant.auth0.com',
  clientId: 'your-client-id',
  redirectUri: 'https://app.example.com/callback',
  usePKCE: true
});
```

### AWS Cognito

Cognito User Pools with username/password or tokens.

```typescript
import { cognito, getCognitoIdentityCredentials } from 'recker';

// With username/password
client.use(cognito({
  region: 'us-east-1',
  userPoolId: 'us-east-1_XXXXX',
  clientId: 'your-client-id',
  username: 'user@example.com',
  password: 'password123'
}));

// With pre-obtained tokens
client.use(cognito({
  region: 'us-east-1',
  userPoolId: 'us-east-1_XXXXX',
  clientId: 'your-client-id',
  accessToken: 'cognito-access-token',
  refreshToken: 'cognito-refresh-token'
}));

// With token storage (auto-refresh)
client.use(cognito({
  region: 'us-east-1',
  userPoolId: 'us-east-1_XXXXX',
  clientId: 'your-client-id',
  refreshToken: 'stored-refresh-token',
  tokenStorage: {
    get: async () => loadTokens(),
    set: async (tokens) => saveTokens(tokens)
  }
}));

// Get AWS credentials from Identity Pool
const awsCreds = await getCognitoIdentityCredentials({
  region: 'us-east-1',
  identityPoolId: 'us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  userPoolId: 'us-east-1_XXXXX',
  idToken: 'cognito-id-token'
});
```

### Okta

Okta workforce identity with custom authorization servers.

```typescript
import { okta, generateOktaAuthUrl, introspectOktaToken } from 'recker';

// Client credentials (M2M)
client.use(okta({
  domain: 'your-org.okta.com',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  scopes: ['api.read', 'api.write']
}));

// With custom authorization server
client.use(okta({
  domain: 'your-org.okta.com',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  authorizationServerId: 'custom-auth-server'
}));

// For Okta Management API (admin operations)
client.use(okta({
  domain: 'your-org.okta.com',
  clientId: '',  // Not needed for API token
  apiToken: 'your-okta-api-token'
}));
// Sends: Authorization: SSWS your-okta-api-token

// Introspect token
const tokenInfo = await introspectOktaToken({
  domain: 'your-org.okta.com',
  clientId: 'your-client-id',
  token: 'access-token-to-check'
});
```

### Azure AD / Microsoft Entra ID

Microsoft identity with Graph API, B2C, and sovereign clouds.

```typescript
import { azureAD, entraId, generateAzureADAuthUrl, azureADOnBehalfOf } from 'recker';

// Client credentials for Microsoft Graph
client.use(azureAD({
  tenantId: 'your-tenant-id',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  scopes: ['https://graph.microsoft.com/.default']
}));

// Multi-tenant app
client.use(azureAD({
  tenantId: 'common',  // or 'organizations' or 'consumers'
  clientId: 'your-client-id',
  accessToken: 'user-access-token'
}));

// Azure AD B2C
client.use(azureAD({
  tenantId: 'your-tenant-id',
  clientId: 'your-client-id',
  b2c: {
    tenantName: 'contoso',
    policy: 'B2C_1_signupsignin'
  },
  accessToken: 'user-access-token'
}));

// US Government Cloud
client.use(azureAD({
  tenantId: 'your-tenant-id',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  cloudInstance: 'https://login.microsoftonline.us',
  scopes: ['https://graph.microsoft.us/.default']
}));

// On-Behalf-Of flow (API calling another API)
const newTokens = await azureADOnBehalfOf({
  tenantId: 'your-tenant-id',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  assertion: userAccessToken,
  scope: 'https://graph.microsoft.com/.default'
});
```

**Alias:** `entraId` is an alias for `azureAD` (new Microsoft branding).

### Firebase

Firebase ID tokens and service account authentication.

```typescript
import { firebase, createFirebaseCustomToken, verifyFirebaseIdToken } from 'recker';

// With pre-obtained ID token (from client SDK)
client.use(firebase({
  projectId: 'your-project-id',
  idToken: 'user-id-token'
}));

// With service account (server-side)
client.use(firebase({
  projectId: 'your-project-id',
  serviceAccount: require('./service-account.json')
}));

// With API key and refresh token
client.use(firebase({
  projectId: 'your-project-id',
  apiKey: 'your-api-key',
  idToken: 'current-id-token',
  tokenStorage: {
    get: async () => loadTokens(),
    set: async (tokens) => saveTokens(tokens)
  }
}));

// Create custom token for user
const customToken = createFirebaseCustomToken(
  serviceAccount,
  'user-uid',
  { role: 'admin' }  // Custom claims
);

// Verify ID token
const claims = await verifyFirebaseIdToken('your-project-id', idToken);
```

---

## Service Accounts

### Google Service Account

JWT-based authentication for GCP services.

```typescript
import { googleServiceAccount, getGoogleIdToken, GoogleScopes } from 'recker';

// With credentials object
client.use(googleServiceAccount({
  credentials: require('./service-account.json'),
  scopes: [GoogleScopes.CLOUD_PLATFORM]
}));

// With key file path
client.use(googleServiceAccount({
  keyFile: './service-account.json',
  scopes: [GoogleScopes.BIGQUERY, GoogleScopes.STORAGE_READ_WRITE]
}));

// With domain-wide delegation (G Suite)
client.use(googleServiceAccount({
  credentials: serviceAccount,
  scopes: [GoogleScopes.ADMIN_DIRECTORY_USER],
  subject: 'admin@example.com'  // User to impersonate
}));

// Get ID token for Cloud Run / Cloud Functions
const idToken = await getGoogleIdToken(
  serviceAccount,
  'https://my-function-xxxxxx.cloudfunctions.net'
);
```

**Available Scopes:**

```typescript
GoogleScopes.CLOUD_PLATFORM          // Full GCP access
GoogleScopes.BIGQUERY                // BigQuery
GoogleScopes.STORAGE_FULL            // Cloud Storage full
GoogleScopes.STORAGE_READ_WRITE      // Cloud Storage R/W
GoogleScopes.COMPUTE                 // Compute Engine
GoogleScopes.PUBSUB                  // Pub/Sub
GoogleScopes.FIRESTORE               // Firestore
GoogleScopes.DRIVE                   // Google Drive
GoogleScopes.SHEETS                  // Google Sheets
GoogleScopes.GMAIL_SEND              // Send emails
// ... and more
```

### GitHub App

GitHub API with app-based authentication (JWT → Installation Token).

```typescript
import {
  githubApp,
  listGitHubAppInstallations,
  getGitHubAppInstallationForRepo
} from 'recker';

// Basic usage with installation ID
client.use(githubApp({
  appId: '12345',
  privateKey: fs.readFileSync('private-key.pem', 'utf-8'),
  installationId: '67890'
}));

// With limited permissions
client.use(githubApp({
  appId: '12345',
  privateKey: process.env.GITHUB_PRIVATE_KEY!,
  installationId: '67890',
  permissions: {
    contents: 'read',
    pull_requests: 'write'
  }
}));

// With specific repositories
client.use(githubApp({
  appId: '12345',
  privateKey: privateKey,
  installationId: '67890',
  repositories: ['my-repo', 'other-repo']
}));

// GitHub Enterprise Server
client.use(githubApp({
  appId: '12345',
  privateKey: privateKey,
  installationId: '67890',
  baseUrl: 'https://github.mycompany.com/api/v3'
}));

// List all installations
const installations = await listGitHubAppInstallations(appId, privateKey);

// Get installation ID for a specific repo
const installationId = await getGitHubAppInstallationForRepo(
  appId,
  privateKey,
  'owner',
  'repo'
);
```

---

## Certificate-Based

### mTLS (Mutual TLS)

Client certificate authentication.

```typescript
import { mtls, createMTLSAgent, isCertificateValid } from 'recker';

// With cert and key buffers
client.use(mtls({
  cert: fs.readFileSync('client.crt'),
  key: fs.readFileSync('client.key'),
  ca: fs.readFileSync('ca.crt')
}));

// With file paths (async loading)
client.use(mtls({
  certPath: './client.crt',
  keyPath: './client.key',
  caPath: './ca.crt'
}));

// With PFX/PKCS12
client.use(mtls({
  pfx: fs.readFileSync('client.p12'),
  pfxPassphrase: 'password',
  ca: fs.readFileSync('ca.crt')
}));

// With encrypted private key
client.use(mtls({
  cert: fs.readFileSync('client.crt'),
  key: fs.readFileSync('client-encrypted.key'),
  passphrase: 'key-password'
}));

// With TLS version requirements
client.use(mtls({
  cert: clientCert,
  key: clientKey,
  minVersion: 'TLSv1.3'
}));

// Check certificate validity
const { valid, expiresAt, error } = isCertificateValid(cert, 30);
if (!valid) {
  console.error('Certificate error:', error);
}

// Create undici agent for direct use
const agent = await createMTLSAgent({
  cert: clientCert,
  key: clientKey,
  ca: caCert
});
```

---

## Common Patterns

### Token Storage Interface

All identity providers support a common token storage interface:

```typescript
interface TokenStorage {
  get: () => Promise<Tokens | null>;
  set: (tokens: Tokens) => Promise<void>;
}

// Example: Redis storage
const redisStorage = {
  get: async () => {
    const data = await redis.get('tokens');
    return data ? JSON.parse(data) : null;
  },
  set: async (tokens) => {
    await redis.set('tokens', JSON.stringify(tokens));
  }
};

client.use(auth0({
  domain: 'tenant.auth0.com',
  clientId: 'xxx',
  tokenStorage: redisStorage
}));
```

### Plugin Order

Authentication should come **early** in the plugin chain:

```typescript
// Recommended order
client.use(circuitBreakerPlugin());  // 1. Fail fast
client.use(retryPlugin());           // 2. Retry failures
client.use(auth0({ ... }));          // 3. Add authentication
client.use(rateLimitPlugin());       // 4. Rate limit
client.use(loggerPlugin());          // 5. Log everything
```

### Per-Request Override

Override authentication for specific requests:

```typescript
client.use(bearerAuth({ token: 'default-token' }));

// Use different token for admin endpoint
const data = await client.get('/admin', {
  headers: { Authorization: 'Bearer admin-token' }
}).json();
```

### Environment Variables

Never hardcode credentials:

```typescript
// From environment
client.use(basicAuth({
  username: process.env.API_USER!,
  password: process.env.API_PASS!
}));

// From AWS Secrets Manager, Vault, etc.
client.use(bearerAuth({
  token: async () => await secretsManager.getSecret('api-token')
}));
```

---

## Security Best Practices

1. **Never hardcode credentials** in source code
2. **Use environment variables** or secret managers
3. **Rotate credentials** regularly
4. **Use short-lived tokens** when possible
5. **Prefer PKCE** for OAuth2 authorization code flow
6. **Enable token refresh** for long sessions
7. **Use mTLS** for high-security environments
8. **Monitor authentication failures** for security incidents

---

## API Reference

### Basic Methods

| Function | Plugin | Options |
|----------|--------|---------|
| `basicAuth(options)` | `basicAuthPlugin` | `{ username, password }` |
| `bearerAuth(options)` | `bearerAuthPlugin` | `{ token, type?, headerName? }` |
| `apiKeyAuth(options)` | `apiKeyAuthPlugin` | `{ key, in?, name? }` |
| `digestAuth(options)` | `digestAuthPlugin` | `{ username, password, preemptive? }` |
| `oauth2(options)` | `oauth2Plugin` | `{ accessToken, tokenType?, onTokenExpired? }` |
| `awsSignatureV4(options)` | `awsSignatureV4Plugin` | `{ accessKeyId, secretAccessKey, region, service, sessionToken? }` |

### Identity Providers

| Function | Plugin | Options |
|----------|--------|---------|
| `oidc(options)` | `oidcPlugin` | `{ issuer, clientId, clientSecret?, scopes?, ... }` |
| `auth0(options)` | `auth0Plugin` | `{ domain, clientId, clientSecret?, audience?, ... }` |
| `cognito(options)` | `cognitoPlugin` | `{ region, userPoolId, clientId, username?, password?, ... }` |
| `okta(options)` | `oktaPlugin` | `{ domain, clientId, clientSecret?, authorizationServerId?, apiToken?, ... }` |
| `azureAD(options)` | `azureADPlugin` | `{ tenantId, clientId, clientSecret?, scopes?, b2c?, cloudInstance?, ... }` |
| `firebase(options)` | `firebasePlugin` | `{ projectId, idToken?, serviceAccount?, apiKey?, ... }` |

### Service Accounts

| Function | Plugin | Options |
|----------|--------|---------|
| `googleServiceAccount(options)` | `googleServiceAccountPlugin` | `{ credentials?, keyFile?, scopes, subject? }` |
| `githubApp(options)` | `githubAppPlugin` | `{ appId, privateKey, installationId?, permissions?, ... }` |

### Certificate-Based

| Function | Plugin | Options |
|----------|--------|---------|
| `mtls(options)` | `mtlsPlugin` | `{ cert, key, ca?, passphrase?, pfx?, ... }` |

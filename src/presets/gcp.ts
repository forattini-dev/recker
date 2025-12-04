import { ClientOptions, Middleware } from '../types/index.js';

export interface GCPPresetOptions {
  /**
   * GCP Project ID
   */
  projectId: string;
  /**
   * Authentication method
   */
  auth: GCPAuthOptions;
  /**
   * GCP Region (optional, for regional APIs)
   */
  region?: string;
}

export type GCPAuthOptions =
  | { type: 'api-key'; apiKey: string }
  | { type: 'oauth'; accessToken: string | (() => string | Promise<string>) }
  | { type: 'service-account'; keyFile?: string; credentials?: GCPServiceAccountCredentials };

export interface GCPServiceAccountCredentials {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export type GCPService =
  | 'compute'
  | 'storage'
  | 'bigquery'
  | 'pubsub'
  | 'firestore'
  | 'functions'
  | 'run'
  | 'cloudsql'
  | 'kubernetes'
  | 'aiplatform'
  | 'translate'
  | 'vision'
  | 'speech'
  | 'language'
  | 'secretmanager'
  | 'iam'
  | 'logging'
  | 'monitoring';

/**
 * Get GCP API base URL for a service
 */
function getGCPServiceUrl(service: GCPService, region?: string): string {
  const regionalServices: Record<string, string> = {
    'run': `https://${region || 'us-central1'}-run.googleapis.com`,
    'aiplatform': `https://${region || 'us-central1'}-aiplatform.googleapis.com`,
    'functions': `https://${region || 'us-central1'}-cloudfunctions.googleapis.com`,
  };

  if (regionalServices[service]) {
    return regionalServices[service];
  }

  const serviceUrls: Record<string, string> = {
    'compute': 'https://compute.googleapis.com',
    'storage': 'https://storage.googleapis.com',
    'bigquery': 'https://bigquery.googleapis.com',
    'pubsub': 'https://pubsub.googleapis.com',
    'firestore': 'https://firestore.googleapis.com',
    'cloudsql': 'https://sqladmin.googleapis.com',
    'kubernetes': 'https://container.googleapis.com',
    'translate': 'https://translation.googleapis.com',
    'vision': 'https://vision.googleapis.com',
    'speech': 'https://speech.googleapis.com',
    'language': 'https://language.googleapis.com',
    'secretmanager': 'https://secretmanager.googleapis.com',
    'iam': 'https://iam.googleapis.com',
    'logging': 'https://logging.googleapis.com',
    'monitoring': 'https://monitoring.googleapis.com',
  };

  return serviceUrls[service] || `https://${service}.googleapis.com`;
}

/**
 * Create GCP auth middleware
 */
function createGCPAuthMiddleware(auth: GCPAuthOptions): Middleware {
  return async (req, next) => {
    let newReq = req;

    if (auth.type === 'api-key') {
      const url = new URL(req.url);
      url.searchParams.set('key', auth.apiKey);
      newReq = { ...req, url: url.toString() } as typeof req;
    } else if (auth.type === 'oauth') {
      const token = typeof auth.accessToken === 'function'
        ? await auth.accessToken()
        : auth.accessToken;
      newReq = req.withHeader('Authorization', `Bearer ${token}`);
    } else if (auth.type === 'service-account') {
      // For service account, user should provide access token via oauth
      // or use google-auth-library externally
      // This is a simplified version - full JWT signing would require more setup
      throw new Error(
        'Service account authentication requires obtaining an access token first. ' +
        'Use google-auth-library to get an access token, then use oauth type.'
      );
    }

    return next(newReq);
  };
}

/**
 * Google Cloud Platform API preset
 * @see https://cloud.google.com/apis/docs/overview
 *
 * @example
 * ```typescript
 * import { gcp } from 'recker/presets';
 *
 * // With API Key (for public APIs like Maps, Translate)
 * const translate = createClient(gcp({
 *   projectId: 'my-project',
 *   auth: { type: 'api-key', apiKey: process.env.GCP_API_KEY },
 *   service: 'translate'
 * }));
 *
 * // With OAuth access token
 * const compute = createClient(gcp({
 *   projectId: 'my-project',
 *   auth: { type: 'oauth', accessToken: process.env.GCP_ACCESS_TOKEN },
 *   service: 'compute'
 * }));
 * ```
 */
export function gcp(options: GCPPresetOptions & { service: GCPService }): ClientOptions {
  const baseUrl = getGCPServiceUrl(options.service, options.region);

  return {
    baseUrl,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-User-Project': options.projectId,
    },
    timeout: 60 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 1000,
      statusCodes: [408, 429, 500, 502, 503, 504]
    },
    middlewares: [createGCPAuthMiddleware(options.auth)]
  };
}

/**
 * Google Cloud Storage preset
 */
export function gcpStorage(options: GCPPresetOptions): ClientOptions {
  return gcp({ ...options, service: 'storage' });
}

/**
 * Google Cloud Compute Engine preset
 */
export function gcpCompute(options: GCPPresetOptions): ClientOptions {
  return gcp({ ...options, service: 'compute' });
}

/**
 * Google BigQuery preset
 */
export function gcpBigQuery(options: GCPPresetOptions): ClientOptions {
  return gcp({ ...options, service: 'bigquery' });
}

/**
 * Google Cloud Pub/Sub preset
 */
export function gcpPubSub(options: GCPPresetOptions): ClientOptions {
  return gcp({ ...options, service: 'pubsub' });
}

/**
 * Google Cloud Run preset
 */
export function gcpCloudRun(options: GCPPresetOptions): ClientOptions {
  return gcp({ ...options, service: 'run' });
}

/**
 * Google Cloud AI Platform (Vertex AI) preset
 */
export function gcpVertexAI(options: GCPPresetOptions): ClientOptions {
  return gcp({ ...options, service: 'aiplatform' });
}

/**
 * Google Firestore preset
 */
export function gcpFirestore(options: GCPPresetOptions): ClientOptions {
  return gcp({ ...options, service: 'firestore' });
}

/**
 * Google Secret Manager preset
 */
export function gcpSecretManager(options: GCPPresetOptions): ClientOptions {
  return gcp({ ...options, service: 'secretmanager' });
}

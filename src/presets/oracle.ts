import { ClientOptions, Middleware } from '../types/index.js';
import { createSign } from 'node:crypto';

export interface OracleCloudPresetOptions {
  /**
   * OCI Tenancy OCID
   */
  tenancyId: string;
  /**
   * OCI User OCID
   */
  userId: string;
  /**
   * OCI API Key Fingerprint
   */
  fingerprint: string;
  /**
   * OCI Private Key (PEM format)
   */
  privateKey: string;
  /**
   * OCI Region (e.g., 'us-ashburn-1', 'eu-frankfurt-1')
   */
  region: string;
  /**
   * Private key passphrase (optional)
   */
  passphrase?: string;
}

export type OracleService =
  | 'core'              // Compute, Block Storage, VCN
  | 'objectstorage'     // Object Storage
  | 'database'          // Database
  | 'identity'          // IAM
  | 'containerengine'   // OKE (Kubernetes)
  | 'functions'         // Functions
  | 'streaming'         // Streaming
  | 'logging'           // Logging
  | 'monitoring'        // Monitoring
  | 'vault'             // Vault (Secrets)
  | 'kms'               // Key Management
  | 'nosql'             // NoSQL Database
  | 'apm'               // Application Performance Monitoring
  | 'generativeai'      // OCI Generative AI
  | 'aidocument'        // AI Document Understanding
  | 'aivision';         // AI Vision

/**
 * Get OCI API base URL for a service
 */
function getOCIServiceUrl(service: OracleService, region: string): string {
  const serviceUrls: Record<string, string> = {
    'core': `https://iaas.${region}.oraclecloud.com`,
    'objectstorage': `https://objectstorage.${region}.oraclecloud.com`,
    'database': `https://database.${region}.oraclecloud.com`,
    'identity': `https://identity.${region}.oraclecloud.com`,
    'containerengine': `https://containerengine.${region}.oraclecloud.com`,
    'functions': `https://functions.${region}.oraclecloud.com`,
    'streaming': `https://streaming.${region}.oraclecloud.com`,
    'logging': `https://logging.${region}.oraclecloud.com`,
    'monitoring': `https://telemetry.${region}.oraclecloud.com`,
    'vault': `https://vaults.${region}.oraclecloud.com`,
    'kms': `https://kms.${region}.oraclecloud.com`,
    'nosql': `https://nosql.${region}.oraclecloud.com`,
    'apm': `https://apm.${region}.oraclecloud.com`,
    'generativeai': `https://generativeai.${region}.oraclecloud.com`,
    'aidocument': `https://document.${region}.oraclecloud.com`,
    'aivision': `https://vision.${region}.oraclecloud.com`,
  };

  return serviceUrls[service] || `https://${service}.${region}.oraclecloud.com`;
}

/**
 * Create OCI request signing middleware
 * Implements Oracle Cloud Infrastructure Signature Version 1
 * @see https://docs.oracle.com/en-us/iaas/Content/API/Concepts/signingrequests.htm
 */
function createOCISigningMiddleware(options: OracleCloudPresetOptions): Middleware {
  const keyId = `${options.tenancyId}/${options.userId}/${options.fingerprint}`;

  return async (req, next) => {
    const url = new URL(req.url);
    const now = new Date();
    const dateStr = now.toUTCString();

    // Headers to sign (minimum required)
    const headersToSign = ['date', '(request-target)', 'host'];

    // For POST/PUT/PATCH, also sign content headers
    const methodsWithBody = ['POST', 'PUT', 'PATCH'];
    if (methodsWithBody.includes(req.method.toUpperCase())) {
      headersToSign.push('content-length', 'content-type', 'x-content-sha256');
    }

    // Build signing string
    const signingParts: string[] = [];
    const headerValues: Record<string, string> = {
      'date': dateStr,
      '(request-target)': `${req.method.toLowerCase()} ${url.pathname}${url.search}`,
      'host': url.host,
    };

    // Add body-related headers if needed
    let bodyHash = '';
    if (methodsWithBody.includes(req.method.toUpperCase())) {
      let bodyContent = '';
      if (req.body) {
        if (typeof req.body === 'string') {
          bodyContent = req.body;
        } else if (req.body instanceof ArrayBuffer) {
          bodyContent = Buffer.from(req.body).toString();
        }
      }

      const crypto = await import('node:crypto');
      bodyHash = crypto.createHash('sha256').update(bodyContent).digest('base64');

      headerValues['content-length'] = Buffer.byteLength(bodyContent).toString();
      headerValues['content-type'] = 'application/json';
      headerValues['x-content-sha256'] = bodyHash;
    }

    for (const header of headersToSign) {
      signingParts.push(`${header}: ${headerValues[header]}`);
    }

    const signingString = signingParts.join('\n');

    // Sign the string
    const sign = createSign('RSA-SHA256');
    sign.update(signingString);

    let signature: string;
    if (options.passphrase) {
      signature = sign.sign({ key: options.privateKey, passphrase: options.passphrase }, 'base64');
    } else {
      signature = sign.sign(options.privateKey, 'base64');
    }

    // Build Authorization header
    const authHeader = `Signature version="1",keyId="${keyId}",algorithm="rsa-sha256",headers="${headersToSign.join(' ')}",signature="${signature}"`;

    // Add all headers to request
    let newReq = req
      .withHeader('Authorization', authHeader)
      .withHeader('Date', dateStr)
      .withHeader('Host', url.host);

    if (methodsWithBody.includes(req.method.toUpperCase())) {
      newReq = newReq
        .withHeader('x-content-sha256', bodyHash)
        .withHeader('Content-Type', 'application/json');
    }

    return next(newReq);
  };
}

/**
 * Oracle Cloud Infrastructure API preset
 * @see https://docs.oracle.com/en-us/iaas/api/
 *
 * @example
 * ```typescript
 * import { oracle } from 'recker/presets';
 *
 * const compute = createClient(oracle({
 *   tenancyId: process.env.OCI_TENANCY_ID,
 *   userId: process.env.OCI_USER_ID,
 *   fingerprint: process.env.OCI_FINGERPRINT,
 *   privateKey: process.env.OCI_PRIVATE_KEY,
 *   region: 'us-ashburn-1',
 *   service: 'core'
 * }));
 *
 * // List instances
 * const instances = await compute.get('/20160918/instances', {
 *   params: { compartmentId: 'ocid1.compartment...' }
 * }).json();
 * ```
 */
export function oracle(options: OracleCloudPresetOptions & { service: OracleService }): ClientOptions {
  const baseUrl = getOCIServiceUrl(options.service, options.region);

  return {
    baseUrl,
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 60 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 1000,
      statusCodes: [408, 429, 500, 502, 503, 504]
    },
    middlewares: [createOCISigningMiddleware(options)]
  };
}

/**
 * OCI Compute preset
 */
export function ociCompute(options: OracleCloudPresetOptions): ClientOptions {
  return oracle({ ...options, service: 'core' });
}

/**
 * OCI Object Storage preset
 */
export function ociObjectStorage(options: OracleCloudPresetOptions): ClientOptions {
  return oracle({ ...options, service: 'objectstorage' });
}

/**
 * OCI Database preset
 */
export function ociDatabase(options: OracleCloudPresetOptions): ClientOptions {
  return oracle({ ...options, service: 'database' });
}

/**
 * OCI Container Engine (OKE) preset
 */
export function ociKubernetes(options: OracleCloudPresetOptions): ClientOptions {
  return oracle({ ...options, service: 'containerengine' });
}

/**
 * OCI Generative AI preset
 */
export function ociGenerativeAI(options: OracleCloudPresetOptions): ClientOptions {
  return oracle({ ...options, service: 'generativeai' });
}

/**
 * OCI Vault preset
 */
export function ociVault(options: OracleCloudPresetOptions): ClientOptions {
  return oracle({ ...options, service: 'vault' });
}

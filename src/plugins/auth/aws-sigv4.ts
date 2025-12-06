/**
 * AWS Signature Version 4 Authentication
 * https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html
 */

import { Middleware, Plugin } from '../../types/index.js';
import { createHash, createHmac } from 'node:crypto';

export interface AWSSignatureV4Options {
  /**
   * AWS Access Key ID
   */
  accessKeyId: string;

  /**
   * AWS Secret Access Key
   */
  secretAccessKey: string;

  /**
   * AWS Region (e.g., 'us-east-1')
   */
  region: string;

  /**
   * AWS Service name (e.g., 's3', 'execute-api')
   */
  service: string;

  /**
   * Session token for temporary credentials (optional)
   */
  sessionToken?: string;
}

/**
 * Compute SHA-256 hash
 */
function sha256(str: string): string {
  return createHash('sha256').update(str).digest('hex');
}

/**
 * AWS Signature V4 Authentication Middleware
 * Signs requests using AWS Signature Version 4
 *
 * @example
 * ```typescript
 * client.use(awsSignatureV4({
 *   accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
 *   secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
 *   region: 'us-east-1',
 *   service: 'execute-api'
 * }));
 * ```
 */
export function awsSignatureV4(options: AWSSignatureV4Options): Middleware {
  return async (req, next) => {
    const url = new URL(req.url);
    const host = url.host;
    const pathname = url.pathname;
    const queryString = url.search.slice(1);

    // Generate timestamp
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    // Create canonical request
    const method = req.method;
    const canonicalUri = pathname || '/';
    const canonicalQueryString = queryString
      .split('&')
      .filter(Boolean)
      .sort()
      .join('&');

    // Get request body for signing
    let payload = '';
    if (req.body) {
      if (typeof req.body === 'string') {
        payload = req.body;
      } else if (req.body instanceof ArrayBuffer) {
        payload = Buffer.from(req.body).toString();
      }
    }
    const payloadHash = sha256(payload);

    // Build signed headers
    const headers: Record<string, string> = {
      host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
    };

    if (options.sessionToken) {
      headers['x-amz-security-token'] = options.sessionToken;
    }

    // Copy existing headers
    req.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map(key => `${key}:${headers[key].trim()}\n`)
      .join('');

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    // Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${options.region}/${options.service}/aws4_request`;
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      sha256(canonicalRequest),
    ].join('\n');

    // Calculate signature
    const getSignatureKey = (key: string, dateStamp: string, regionName: string, serviceName: string) => {
      const kDate = createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
      const kRegion = createHmac('sha256', kDate).update(regionName).digest();
      const kService = createHmac('sha256', kRegion).update(serviceName).digest();
      const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
      return kSigning;
    };

    const signingKey = getSignatureKey(
      options.secretAccessKey,
      dateStamp,
      options.region,
      options.service
    );

    const signature = createHmac('sha256', signingKey)
      .update(stringToSign)
      .digest('hex');

    // Build Authorization header
    const authorizationHeader = `${algorithm} Credential=${options.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    // Create new request with AWS headers
    let newReq = req.withHeader('Authorization', authorizationHeader);
    newReq = newReq.withHeader('x-amz-date', amzDate);
    newReq = newReq.withHeader('x-amz-content-sha256', payloadHash);

    if (options.sessionToken) {
      newReq = newReq.withHeader('x-amz-security-token', options.sessionToken);
    }

    return next(newReq);
  };
}

/**
 * AWS Signature V4 Authentication Plugin
 */
export function awsSignatureV4Plugin(options: AWSSignatureV4Options): Plugin {
  return (client) => {
    client.use(awsSignatureV4(options));
  };
}

import { Agent, Dispatcher } from 'undici';
import { readFileSync } from 'node:fs';

export interface CertificateOptions {
  /** Path or content of the client certificate (PEM) */
  cert?: string | Buffer;
  /** Path or content of the client private key (PEM) */
  key?: string | Buffer;
  /** Path or content of the CA certificate (PEM) to trust */
  ca?: string | Buffer;
  /** Reject requests with invalid/self-signed certs? (default: true) */
  rejectUnauthorized?: boolean;
}

/**
 * Helper to load certificate content from string or file path
 */
function loadCert(input?: string | Buffer): string | Buffer | undefined {
  if (!input) return undefined;
  if (Buffer.isBuffer(input)) return input;
  
  // Check if it looks like a PEM string
  if (input.includes('-----BEGIN')) {
    return input;
  }

  // Assume path
  try {
    return readFileSync(input);
  } catch (err) {
    // If file read fails, return input as-is (maybe it was a string without header?)
    // Or throw? Let's assume user knows best.
    return input;
  }
}

/**
 * Configures an Undici Agent for mTLS or custom CA trust.
 * 
 * @example
 * const agent = createCertAgent({
 *   cert: './client.crt',
 *   key: './client.key',
 *   rejectUnauthorized: false // Allow self-signed
 * });
 * 
 * const client = createClient({
 *   transport: new UndiciTransport(baseUrl, { dispatcher: agent })
 * });
 */
export function createCertAgent(options: CertificateOptions): Agent {
  return new Agent({
    connect: {
      cert: loadCert(options.cert),
      key: loadCert(options.key),
      ca: loadCert(options.ca),
      rejectUnauthorized: options.rejectUnauthorized
    }
  });
}

/**
 * Utility to extract certificate information from a response.
 * Requires 'onTlsHandshake' hook or similar deep inspection which we added to UndiciTransport.
 * Note: Undici doesn't easily expose the raw peer certificate in high-level response currently
 * without custom dispatcher hacking. This is a placeholder for future expansion.
 */
export function getCertInfo(response: any) {
    // TODO: Implement deep inspection via socket access
    return {
        authorized: true, // Placeholder
    };
}

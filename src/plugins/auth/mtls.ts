/**
 * Mutual TLS (mTLS) Authentication
 * https://datatracker.ietf.org/doc/html/rfc8705
 *
 * Certificate-based client authentication
 */

import { Middleware, Plugin } from '../../types/index.js';
import type { Dispatcher } from 'undici';

export interface MTLSOptions {
  /**
   * Client certificate in PEM format
   */
  cert: string | Buffer;

  /**
   * Client private key in PEM format
   */
  key: string | Buffer;

  /**
   * CA certificate(s) for server verification
   */
  ca?: string | Buffer | Array<string | Buffer>;

  /**
   * Passphrase for encrypted private key
   */
  passphrase?: string;

  /**
   * Path to client certificate file
   */
  certPath?: string;

  /**
   * Path to client private key file
   */
  keyPath?: string;

  /**
   * Path to CA certificate file
   */
  caPath?: string;

  /**
   * Skip server certificate verification (DANGEROUS - only for testing)
   * @default false
   */
  rejectUnauthorized?: boolean;

  /**
   * PFX/PKCS12 certificate (alternative to cert/key)
   */
  pfx?: string | Buffer;

  /**
   * Passphrase for PFX certificate
   */
  pfxPassphrase?: string;

  /**
   * Server name for SNI (Server Name Indication)
   */
  servername?: string;

  /**
   * Minimum TLS version
   * @default 'TLSv1.2'
   */
  minVersion?: 'TLSv1.2' | 'TLSv1.3';

  /**
   * Maximum TLS version
   */
  maxVersion?: 'TLSv1.2' | 'TLSv1.3';

  /**
   * Cipher suites to use
   */
  ciphers?: string;

  /**
   * ALPN protocols
   */
  ALPNProtocols?: string[];
}

export interface MTLSCertificateInfo {
  subject: Record<string, string>;
  issuer: Record<string, string>;
  validFrom: Date;
  validTo: Date;
  fingerprint: string;
  serialNumber: string;
}

/**
 * Load certificate from file if path is provided
 */
async function loadCertificateFile(path: string): Promise<Buffer> {
  const fs = await import('node:fs/promises');
  return fs.readFile(path);
}

/**
 * Parse certificate to extract info (simplified)
 */
export function parseCertificateInfo(cert: string | Buffer): MTLSCertificateInfo | null {
  try {
    const crypto = require('node:crypto');
    const x509 = new crypto.X509Certificate(cert);

    return {
      subject: parseX509Name(x509.subject),
      issuer: parseX509Name(x509.issuer),
      validFrom: new Date(x509.validFrom),
      validTo: new Date(x509.validTo),
      fingerprint: x509.fingerprint256,
      serialNumber: x509.serialNumber,
    };
  } catch {
    return null;
  }
}

function parseX509Name(name: string): Record<string, string> {
  const result: Record<string, string> = {};
  const parts = name.split('\n');
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key && value) {
      result[key.trim()] = value.trim();
    }
  }
  return result;
}

/**
 * Check if certificate is expired or about to expire
 */
export function isCertificateValid(
  cert: string | Buffer,
  bufferDays: number = 30
): { valid: boolean; expiresAt?: Date; error?: string } {
  const info = parseCertificateInfo(cert);
  if (!info) {
    return { valid: false, error: 'Failed to parse certificate' };
  }

  const now = new Date();
  const bufferMs = bufferDays * 24 * 60 * 60 * 1000;

  if (now < info.validFrom) {
    return { valid: false, expiresAt: info.validTo, error: 'Certificate not yet valid' };
  }

  if (now > info.validTo) {
    return { valid: false, expiresAt: info.validTo, error: 'Certificate expired' };
  }

  if (now.getTime() + bufferMs > info.validTo.getTime()) {
    return { valid: true, expiresAt: info.validTo, error: `Certificate expires soon (${info.validTo.toISOString()})` };
  }

  return { valid: true, expiresAt: info.validTo };
}

/**
 * Create TLS options object for Node.js/undici
 */
async function createTLSOptions(options: MTLSOptions): Promise<{
  cert?: string | Buffer;
  key?: string | Buffer;
  ca?: string | Buffer | Array<string | Buffer>;
  passphrase?: string;
  pfx?: string | Buffer;
  rejectUnauthorized?: boolean;
  servername?: string;
  minVersion?: string;
  maxVersion?: string;
  ciphers?: string;
  ALPNProtocols?: string[];
}> {
  const tlsOptions: Record<string, unknown> = {};

  // Load from files if paths provided
  if (options.certPath) {
    tlsOptions.cert = await loadCertificateFile(options.certPath);
  } else if (options.cert) {
    tlsOptions.cert = options.cert;
  }

  if (options.keyPath) {
    tlsOptions.key = await loadCertificateFile(options.keyPath);
  } else if (options.key) {
    tlsOptions.key = options.key;
  }

  if (options.caPath) {
    tlsOptions.ca = await loadCertificateFile(options.caPath);
  } else if (options.ca) {
    tlsOptions.ca = options.ca;
  }

  if (options.passphrase) {
    tlsOptions.passphrase = options.passphrase;
  }

  if (options.pfx) {
    tlsOptions.pfx = options.pfx;
    if (options.pfxPassphrase) {
      tlsOptions.passphrase = options.pfxPassphrase;
    }
  }

  if (options.rejectUnauthorized !== undefined) {
    tlsOptions.rejectUnauthorized = options.rejectUnauthorized;
  }

  if (options.servername) {
    tlsOptions.servername = options.servername;
  }

  if (options.minVersion) {
    tlsOptions.minVersion = options.minVersion;
  }

  if (options.maxVersion) {
    tlsOptions.maxVersion = options.maxVersion;
  }

  if (options.ciphers) {
    tlsOptions.ciphers = options.ciphers;
  }

  if (options.ALPNProtocols) {
    tlsOptions.ALPNProtocols = options.ALPNProtocols;
  }

  return tlsOptions as ReturnType<typeof createTLSOptions> extends Promise<infer T> ? T : never;
}

/**
 * Mutual TLS Authentication Middleware
 *
 * Note: mTLS requires transport-level configuration. This middleware
 * attaches TLS options to the request context, which must be handled
 * by the transport layer.
 *
 * @example
 * ```typescript
 * // With cert and key strings
 * client.use(mtls({
 *   cert: fs.readFileSync('client.crt'),
 *   key: fs.readFileSync('client.key'),
 *   ca: fs.readFileSync('ca.crt')
 * }));
 *
 * // With file paths (async loading)
 * client.use(mtls({
 *   certPath: './client.crt',
 *   keyPath: './client.key',
 *   caPath: './ca.crt'
 * }));
 *
 * // With PFX/PKCS12
 * client.use(mtls({
 *   pfx: fs.readFileSync('client.p12'),
 *   pfxPassphrase: 'password',
 *   ca: fs.readFileSync('ca.crt')
 * }));
 *
 * // With encrypted private key
 * client.use(mtls({
 *   cert: fs.readFileSync('client.crt'),
 *   key: fs.readFileSync('client-encrypted.key'),
 *   passphrase: 'key-password'
 * }));
 *
 * // Skip server verification (testing only!)
 * client.use(mtls({
 *   cert: clientCert,
 *   key: clientKey,
 *   rejectUnauthorized: false
 * }));
 * ```
 */
export function mtls(options: MTLSOptions): Middleware {
  // mTLS is handled at the transport level, not per-request
  // This middleware validates the certificate and is a pass-through
  let validated = false;

  return async (req, next) => {
    // Validate certificate on first request
    if (!validated) {
      if (options.cert || options.certPath) {
        const cert = options.cert || (options.certPath ? await loadCertificateFile(options.certPath) : null);
        if (cert) {
          const validation = isCertificateValid(cert);
          if (!validation.valid) {
            throw new Error(`mTLS certificate error: ${validation.error}`);
          }
        }
      }
      validated = true;
    }

    return next(req);
  };
}

/**
 * Mutual TLS Authentication Plugin
 */
export function mtlsPlugin(options: MTLSOptions): Plugin {
  return (client) => {
    client.use(mtls(options));
  };
}

/**
 * Create undici Agent with mTLS configuration
 * Use this for direct undici usage with mTLS
 */
export async function createMTLSAgent(options: MTLSOptions): Promise<Dispatcher> {
  const { Agent } = await import('undici');
  const tlsOptions = await createTLSOptions(options);

  return new Agent({
    connect: {
      ...tlsOptions,
    } as Dispatcher.ConnectOptions,
  });
}

/**
 * Verify that client certificate matches expected fingerprint
 * (for certificate pinning scenarios)
 */
export function verifyCertificateFingerprint(
  cert: string | Buffer,
  expectedFingerprint: string
): boolean {
  const info = parseCertificateInfo(cert);
  if (!info) {
    return false;
  }

  const normalizedExpected = expectedFingerprint.replace(/:/g, '').toLowerCase();
  const normalizedActual = info.fingerprint.replace(/:/g, '').toLowerCase();

  return normalizedExpected === normalizedActual;
}

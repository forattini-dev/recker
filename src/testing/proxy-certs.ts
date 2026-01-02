/**
 * Certificate generation for proxy MITM mode
 *
 * Generates self-signed certificates dynamically for intercepting HTTPS traffic.
 */

import { generateKeyPairSync, createSign, randomBytes } from 'node:crypto';

export interface CertificateInfo {
  key: string;
  cert: string;
  ca?: string;
}

export interface CertificateOptions {
  /**
   * CA certificate PEM (if signing with custom CA)
   */
  caCert?: string;

  /**
   * CA private key PEM
   */
  caKey?: string;

  /**
   * Certificate validity in days
   * @default 365
   */
  validityDays?: number;
}

// Default self-signed CA (generated on first use)
let defaultCA: { key: string; cert: string } | null = null;

/**
 * Generate a self-signed CA certificate
 */
export function generateCA(): { key: string; cert: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

  // Create self-signed CA certificate
  const cert = createSelfSignedCert({
    commonName: 'Recker Proxy CA',
    isCA: true,
    privateKey: privateKeyPem,
    publicKey: publicKeyPem,
    validityDays: 3650, // 10 years
  });

  return {
    key: privateKeyPem,
    cert,
  };
}

/**
 * Generate a certificate for a specific host
 */
export async function generateCertificate(
  host: string,
  options: CertificateOptions = {}
): Promise<CertificateInfo> {
  // Use provided CA or generate default
  let caKey = options.caKey;
  let caCert = options.caCert;

  if (!caKey || !caCert) {
    if (!defaultCA) {
      defaultCA = generateCA();
    }
    caKey = defaultCA.key;
    caCert = defaultCA.cert;
  }

  // Generate key pair for this host
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

  // Create certificate signed by CA
  const cert = createSignedCert({
    commonName: host,
    sans: [host],
    privateKey: privateKeyPem,
    publicKey: publicKeyPem,
    caKey,
    caCert,
    validityDays: options.validityDays ?? 365,
  });

  return {
    key: privateKeyPem,
    cert,
    ca: caCert,
  };
}

// ============================================
// Internal certificate creation
// ============================================

interface SelfSignedCertOptions {
  commonName: string;
  isCA: boolean;
  privateKey: string;
  publicKey: string;
  validityDays: number;
}

interface SignedCertOptions {
  commonName: string;
  sans: string[];
  privateKey: string;
  publicKey: string;
  caKey: string;
  caCert: string;
  validityDays: number;
}

function createSelfSignedCert(options: SelfSignedCertOptions): string {
  const now = new Date();
  const notBefore = formatDate(now);
  const notAfter = formatDate(new Date(now.getTime() + options.validityDays * 24 * 60 * 60 * 1000));

  const serialNumber = randomBytes(8).toString('hex').toUpperCase();

  // Build TBS (To Be Signed) Certificate
  const tbsCertificate = buildTBSCertificate({
    serialNumber,
    issuer: { CN: options.commonName },
    subject: { CN: options.commonName },
    notBefore,
    notAfter,
    publicKey: options.publicKey,
    isCA: options.isCA,
    sans: [],
  });

  // Sign with private key
  const signature = signData(tbsCertificate, options.privateKey);

  // Build final certificate
  return buildCertificate(tbsCertificate, signature);
}

function createSignedCert(options: SignedCertOptions): string {
  const now = new Date();
  const notBefore = formatDate(now);
  const notAfter = formatDate(new Date(now.getTime() + options.validityDays * 24 * 60 * 60 * 1000));

  const serialNumber = randomBytes(8).toString('hex').toUpperCase();

  // Extract issuer CN from CA cert
  const issuerCN = extractCN(options.caCert);

  // Build TBS Certificate
  const tbsCertificate = buildTBSCertificate({
    serialNumber,
    issuer: { CN: issuerCN },
    subject: { CN: options.commonName },
    notBefore,
    notAfter,
    publicKey: options.publicKey,
    isCA: false,
    sans: options.sans,
  });

  // Sign with CA's private key
  const signature = signData(tbsCertificate, options.caKey);

  // Build final certificate
  return buildCertificate(tbsCertificate, signature);
}

// ============================================
// ASN.1/DER encoding helpers
// ============================================

interface TBSCertificateOptions {
  serialNumber: string;
  issuer: { CN: string };
  subject: { CN: string };
  notBefore: string;
  notAfter: string;
  publicKey: string;
  isCA: boolean;
  sans: string[];
}

function buildTBSCertificate(options: TBSCertificateOptions): Buffer {
  const parts: Buffer[] = [];

  // Version (v3)
  parts.push(wrapTag(0xa0, wrapTag(0x02, Buffer.from([0x02]))));

  // Serial Number
  const serialBytes = Buffer.from(options.serialNumber, 'hex');
  parts.push(wrapTag(0x02, serialBytes));

  // Signature Algorithm (SHA256 with RSA)
  parts.push(buildAlgorithmIdentifier());

  // Issuer
  parts.push(buildName(options.issuer.CN));

  // Validity
  parts.push(buildValidity(options.notBefore, options.notAfter));

  // Subject
  parts.push(buildName(options.subject.CN));

  // Subject Public Key Info
  parts.push(extractPublicKeyInfo(options.publicKey));

  // Extensions
  const extensions: Buffer[] = [];

  if (options.isCA) {
    // Basic Constraints: CA:TRUE
    extensions.push(buildBasicConstraintsCA());
  }

  if (options.sans.length > 0) {
    // Subject Alternative Names
    extensions.push(buildSANExtension(options.sans));
  }

  if (extensions.length > 0) {
    const extsSeq = wrapTag(0x30, Buffer.concat(extensions));
    parts.push(wrapTag(0xa3, extsSeq));
  }

  return wrapTag(0x30, Buffer.concat(parts));
}

function buildCertificate(tbsCertificate: Buffer, signature: Buffer): string {
  const parts: Buffer[] = [];

  // TBS Certificate
  parts.push(tbsCertificate);

  // Signature Algorithm
  parts.push(buildAlgorithmIdentifier());

  // Signature Value (as BIT STRING)
  const sigBitString = Buffer.concat([Buffer.from([0x00]), signature]);
  parts.push(wrapTag(0x03, sigBitString));

  const certDer = wrapTag(0x30, Buffer.concat(parts));
  const certBase64 = certDer.toString('base64');

  // Format as PEM
  const lines: string[] = ['-----BEGIN CERTIFICATE-----'];
  for (let i = 0; i < certBase64.length; i += 64) {
    lines.push(certBase64.slice(i, i + 64));
  }
  lines.push('-----END CERTIFICATE-----');

  return lines.join('\n');
}

function buildAlgorithmIdentifier(): Buffer {
  // OID for SHA256 with RSA: 1.2.840.113549.1.1.11
  const oid = Buffer.from([
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b,
  ]);
  const nullParam = Buffer.from([0x05, 0x00]);
  return wrapTag(0x30, Buffer.concat([oid, nullParam]));
}

function buildName(cn: string): Buffer {
  // OID for commonName: 2.5.4.3
  const cnOid = Buffer.from([0x06, 0x03, 0x55, 0x04, 0x03]);
  const cnValue = wrapTag(0x0c, Buffer.from(cn, 'utf8')); // UTF8String

  const atv = wrapTag(0x30, Buffer.concat([cnOid, cnValue]));
  const rdn = wrapTag(0x31, atv);

  return wrapTag(0x30, rdn);
}

function buildValidity(notBefore: string, notAfter: string): Buffer {
  const notBeforeUtc = wrapTag(0x17, Buffer.from(notBefore, 'ascii'));
  const notAfterUtc = wrapTag(0x17, Buffer.from(notAfter, 'ascii'));

  return wrapTag(0x30, Buffer.concat([notBeforeUtc, notAfterUtc]));
}

function buildBasicConstraintsCA(): Buffer {
  // OID for basicConstraints: 2.5.29.19
  const oid = Buffer.from([0x06, 0x03, 0x55, 0x1d, 0x13]);
  const critical = Buffer.from([0x01, 0x01, 0xff]); // BOOLEAN TRUE

  // CA: TRUE
  const caTrue = wrapTag(0x01, Buffer.from([0xff]));
  const bcValue = wrapTag(0x30, caTrue);
  const bcOctet = wrapTag(0x04, bcValue);

  return wrapTag(0x30, Buffer.concat([oid, critical, bcOctet]));
}

function buildSANExtension(sans: string[]): Buffer {
  // OID for subjectAltName: 2.5.29.17
  const oid = Buffer.from([0x06, 0x03, 0x55, 0x1d, 0x11]);

  const names: Buffer[] = sans.map((name) => {
    // DNS name (context tag 2)
    return wrapTag(0x82, Buffer.from(name, 'ascii'));
  });

  const sanSeq = wrapTag(0x30, Buffer.concat(names));
  const sanOctet = wrapTag(0x04, sanSeq);

  return wrapTag(0x30, Buffer.concat([oid, sanOctet]));
}

function extractPublicKeyInfo(publicKeyPem: string): Buffer {
  // Extract DER from PEM
  const base64 = publicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s/g, '');

  return Buffer.from(base64, 'base64');
}

function extractCN(certPem: string): string {
  // Simple CN extraction from PEM certificate
  // This is a simplified parser - in production, use a proper X.509 parser
  const match = certPem.match(/CN=([^,\/\n]+)/i);
  return match ? match[1] : 'Unknown';
}

function signData(data: Buffer, privateKeyPem: string): Buffer {
  const sign = createSign('SHA256');
  sign.update(data);
  return sign.sign(privateKeyPem);
}

function wrapTag(tag: number, content: Buffer): Buffer {
  const length = encodeLength(content.length);
  return Buffer.concat([Buffer.from([tag]), length, content]);
}

function encodeLength(len: number): Buffer {
  if (len < 128) {
    return Buffer.from([len]);
  }

  const bytes: number[] = [];
  let temp = len;

  while (temp > 0) {
    bytes.unshift(temp & 0xff);
    temp >>= 8;
  }

  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function formatDate(date: Date): string {
  // Format as UTCTime: YYMMDDhhmmssZ
  const y = date.getUTCFullYear().toString().slice(-2);
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = date.getUTCDate().toString().padStart(2, '0');
  const h = date.getUTCHours().toString().padStart(2, '0');
  const min = date.getUTCMinutes().toString().padStart(2, '0');
  const s = date.getUTCSeconds().toString().padStart(2, '0');

  return `${y}${m}${d}${h}${min}${s}Z`;
}

/**
 * Get or generate the default CA
 */
export function getDefaultCA(): { key: string; cert: string } {
  if (!defaultCA) {
    defaultCA = generateCA();
  }
  return defaultCA;
}

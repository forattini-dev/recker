import { connect, TLSSocket, ConnectionOptions } from 'node:tls';
import * as crypto from 'node:crypto';

export interface TLSInfo {
  valid: boolean;
  validFrom: Date;
  validTo: Date;
  daysRemaining: number;
  issuer: Record<string, string>;
  subject: Record<string, string>;
  fingerprint: string;
  fingerprint256: string;
  serialNumber: string;
  protocol: string | null;
  cipher: {
    name: string;
    version: string;
  } | null;
  authorized: boolean;
  authorizationError?: Error;

  altNames?: string[]; // Subject Alternative Names
  pubkey: { algo: string; size: number } | null; // Public Key details
  extKeyUsage?: string[]; // Extended Key Usage OIDs
}

export function inspectTLS(host: string, port: number = 443, options: ConnectionOptions = {}): Promise<TLSInfo> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, host, { ...options, servername: host }, () => {
      const cert = socket.getPeerCertificate();
      
      if (!cert || Object.keys(cert).length === 0) {
        socket.end();
        return reject(new Error('No certificate provided by peer'));
      }

      const validFrom = new Date(cert.valid_from);
      const validTo = new Date(cert.valid_to);
      const now = new Date();
      const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Extract Subject Alternative Names (SANs)
      const altNames = cert.subjectaltname
        ? cert.subjectaltname.split(', ').map(s => s.replace(/^DNS:|^IP Address:/, '')).filter(Boolean)
        : [];

      // Extract public key details
      let pubkey: { algo: string; size: number } | null = null;
      if (cert.pubkey) {
        try {
          const keyObject = crypto.createPublicKey(cert.pubkey);
          let keySize: number | undefined;
          const keyAlgo: string = keyObject.asymmetricKeyType || 'unknown';

          if (keyObject.asymmetricKeyDetails) {
            // RSA keys use modulusLength
            if (keyObject.asymmetricKeyDetails.modulusLength) {
              keySize = keyObject.asymmetricKeyDetails.modulusLength;
            } else if (keyObject.asymmetricKeyDetails.namedCurve) {
              // EC keys - infer size from curve name
              const curve = keyObject.asymmetricKeyDetails.namedCurve;
              if (curve.includes('256') || curve.includes('p256')) keySize = 256;
              else if (curve.includes('384') || curve.includes('p384')) keySize = 384;
              else if (curve.includes('521') || curve.includes('p521')) keySize = 521;
            }
          }

          if (keySize) {
            pubkey = { algo: keyAlgo, size: keySize };
          }
        } catch {
          // Ignore parsing errors
        }
      }

      const info: TLSInfo = {
        valid: now >= validFrom && now <= validTo,
        validFrom,
        validTo,
        daysRemaining,
        issuer: cert.issuer as unknown as Record<string, string>,
        subject: cert.subject as unknown as Record<string, string>,
        fingerprint: cert.fingerprint,
        fingerprint256: cert.fingerprint256,
        serialNumber: cert.serialNumber,
        protocol: socket.getProtocol(),
        cipher: socket.getCipher() as any,
        authorized: socket.authorized,
        authorizationError: socket.authorizationError,

        altNames,
        pubkey,
        extKeyUsage: cert.ext_key_usage || []
      };

      socket.end();
      resolve(info);
    });

    socket.on('error', (err) => {
      reject(err);
    });
    
    // Set a default timeout of 5s
    socket.setTimeout(5000, () => {
        socket.destroy(new Error('TLS connection timed out'));
    });
  });
}

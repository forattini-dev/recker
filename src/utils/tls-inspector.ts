import { connect, TLSSocket, ConnectionOptions } from 'node:tls';

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
        authorizationError: socket.authorizationError
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

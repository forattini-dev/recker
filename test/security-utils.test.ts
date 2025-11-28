import { describe, it, expect, vi } from 'vitest';
import { inspectTLS } from '../src/utils/tls-inspector.js';
import { getSecurityRecords } from '../src/utils/dns-toolkit.js';

// Mock native modules to avoid network
vi.mock('node:tls', () => ({
    connect: vi.fn((port, host, opts, cb) => {
        const socket = {
            getPeerCertificate: () => ({
                valid_from: new Date().toISOString(),
                valid_to: new Date(Date.now() + 86400000).toISOString(),
                subject: { CN: 'example.com' },
                issuer: { CN: 'Test CA' },
                fingerprint: 'AA:BB:CC',
                serialNumber: '123'
            }),
            getProtocol: () => 'TLSv1.3',
            getCipher: () => ({ name: 'AES', version: '256' }),
            authorized: true,
            end: vi.fn(),
            on: vi.fn(),
            setTimeout: vi.fn()
        };
        setTimeout(cb, 0); // Call async
        return socket;
    })
}));

vi.mock('node:dns', async () => ({
    promises: {
        resolveTxt: vi.fn().mockResolvedValue([['v=spf1 include:_spf.google.com ~all']]),
        resolveMx: vi.fn().mockResolvedValue([{ exchange: 'mail.google.com' }]),
        resolveCaa: vi.fn().mockRejectedValue(new Error('No CAA'))
    }
}));

describe('Security Utils', () => {
    it('should inspect TLS', async () => {
        const info = await inspectTLS('example.com');
        expect(info.valid).toBe(true);
        expect(info.protocol).toBe('TLSv1.3');
        expect(info.daysRemaining).toBeGreaterThanOrEqual(0);
    });

    it('should get DNS security records', async () => {
        const records = await getSecurityRecords('example.com');
        expect(records.spf?.[0]).toContain('v=spf1');
        expect(records.mx?.[0]).toBe('mail.google.com');
    });
});

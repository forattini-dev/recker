import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCertAgent, getCertInfo } from '../../src/utils/cert.js';
import { createDoHLookup } from '../../src/utils/doh.js';
import { createLookupFunction } from '../../src/utils/dns.js';
import { Agent } from 'undici';
import { readFileSync } from 'node:fs';
import { lookup } from 'node:dns';

vi.mock('undici', async () => {
    const actual = await vi.importActual('undici');
    return {
        ...actual,
        Agent: class { constructor(opts: any) { (this as any).opts = opts; } },
        request: vi.fn()
    };
});

vi.mock('node:fs', async () => {
    return {
        readFileSync: vi.fn()
    };
});

vi.mock('node:dns', async () => {
    return {
        lookup: vi.fn()
    };
});

describe('DNS & Cert Utils', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('Cert Agent: should load certs from file', () => {
        vi.mocked(readFileSync).mockReturnValue(Buffer.from('cert-content'));

        const agent = createCertAgent({
            cert: './cert.pem',
            rejectUnauthorized: false
        });

        const opts = (agent as any).opts.connect;
        expect(opts.cert).toEqual(Buffer.from('cert-content'));
        expect(opts.rejectUnauthorized).toBe(false);
    });

    it('Cert Agent: should handle PEM string directly', () => {
        const pemString = '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----';

        const agent = createCertAgent({
            cert: pemString
        });

        const opts = (agent as any).opts.connect;
        expect(opts.cert).toBe(pemString);
    });

    it('Cert Agent: should handle Buffer directly', () => {
        const buffer = Buffer.from('cert-buffer');

        const agent = createCertAgent({
            cert: buffer
        });

        const opts = (agent as any).opts.connect;
        expect(opts.cert).toBe(buffer);
    });

    it('Cert Agent: should handle file read error gracefully', () => {
        vi.mocked(readFileSync).mockImplementation(() => {
            throw new Error('File not found');
        });

        // Path that doesn't look like PEM
        const agent = createCertAgent({
            cert: './nonexistent.pem'
        });

        const opts = (agent as any).opts.connect;
        // Should return the path as-is when file read fails
        expect(opts.cert).toBe('./nonexistent.pem');
    });

    it('Cert Agent: should handle undefined cert', () => {
        const agent = createCertAgent({
            rejectUnauthorized: true
        });

        const opts = (agent as any).opts.connect;
        expect(opts.cert).toBeUndefined();
    });

    it('getCertInfo: should return authorized placeholder', () => {
        const result = getCertInfo({});
        expect(result.authorized).toBe(true);
    });

    it('DNS Lookup: should override host', async () => {
        const lookupFn = createLookupFunction({
            override: { 'api.local': '127.0.0.1' }
        });

        return new Promise<void>(done => {
            lookupFn('api.local', {}, (err, addr, fam) => {
                expect(addr).toBe('127.0.0.1');
                expect(fam).toBe(4);
                done();
            });
        });
    });

    it('DNS Lookup: should fallback to system', async () => {
        const lookupFn = createLookupFunction({});
        vi.mocked(lookup).mockImplementation((host, opts, cb) => cb(null, '1.1.1.1', 4) as any);

        return new Promise<void>(done => {
            lookupFn('google.com', {}, (err, addr) => {
                expect(addr).toBe('1.1.1.1');
                done();
            });
        });
    });

    it('DoH: should resolve via Cloudflare', async () => {
        const { request } = await import('undici');
        vi.mocked(request).mockResolvedValue({
            statusCode: 200,
            body: {
                json: async () => ({
                    Status: 0,
                    Answer: [{ type: 1, data: '9.9.9.9' }]
                })
            }
        } as any);

        const lookupFn = createDoHLookup('cloudflare');
        
        return new Promise<void>(done => {
            lookupFn('example.com', {}, (err, addr) => {
                expect(addr).toBe('9.9.9.9');
                done();
            });
        });
    });
});

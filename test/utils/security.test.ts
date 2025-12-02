import { describe, it, expect, vi } from 'vitest';
import { inspectTLS } from '../../src/utils/tls-inspector.js';
import { getSecurityRecords } from '../../src/utils/dns-toolkit.js';
import {
    analyzeSecurityHeaders,
    analyzeCSP,
    generateRecommendedCSP,
    quickSecurityCheck
} from '../../src/utils/security-grader.js';

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

    it('should inspect TLS with custom port', async () => {
        const info = await inspectTLS('example.com', 8443);
        expect(info.valid).toBe(true);
    });

    it('should get DNS security records', async () => {
        const records = await getSecurityRecords('example.com');
        expect(records.spf?.[0]).toContain('v=spf1');
        expect(records.mx?.[0]?.exchange).toBe('mail.google.com');
    });
});

describe('Security Headers Analyzer', () => {
    function createHeaders(obj: Record<string, string>): Headers {
        const headers = new Headers();
        for (const [key, value] of Object.entries(obj)) {
            headers.set(key, value);
        }
        return headers;
    }

    describe('analyzeSecurityHeaders', () => {
        it('should give A+ grade for fully secure headers', () => {
            const headers = createHeaders({
                'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
                'content-security-policy': "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
                'x-frame-options': 'DENY',
                'x-content-type-options': 'nosniff',
                'referrer-policy': 'strict-origin-when-cross-origin',
                'permissions-policy': 'geolocation=(), camera=(), microphone=(), payment=()',
                'cross-origin-opener-policy': 'same-origin',
                'cross-origin-embedder-policy': 'require-corp',
                'cross-origin-resource-policy': 'same-origin',
                'cache-control': 'no-store'
            });

            const report = analyzeSecurityHeaders(headers);
            expect(report.grade).toBe('A+');
            expect(report.score).toBeGreaterThanOrEqual(95);
            expect(report.summary.failed).toBe(0);
        });

        it('should fail for missing security headers', () => {
            const headers = createHeaders({});

            const report = analyzeSecurityHeaders(headers);
            expect(report.grade).toBe('F');
            expect(report.summary.failed).toBeGreaterThan(0);
        });

        it('should warn about unsafe CSP directives', () => {
            const headers = createHeaders({
                'content-security-policy': "default-src 'self' 'unsafe-inline'"
            });

            const report = analyzeSecurityHeaders(headers);
            const cspResult = report.details.find(d => d.header === 'content-security-policy');
            expect(cspResult?.status).toBe('warn');
            expect(cspResult?.message).toContain('unsafe-inline');
        });

        it('should fail CSP with both unsafe-inline and unsafe-eval', () => {
            const headers = createHeaders({
                'content-security-policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval'"
            });

            const report = analyzeSecurityHeaders(headers);
            const cspResult = report.details.find(d => d.header === 'content-security-policy');
            expect(cspResult?.status).toBe('fail');
        });

        it('should detect X-Powered-By information leakage', () => {
            const headers = createHeaders({
                'x-powered-by': 'Express 4.18.2'
            });

            const report = analyzeSecurityHeaders(headers);
            const xpb = report.details.find(d => d.header === 'x-powered-by');
            expect(xpb?.status).toBe('fail');
            expect(xpb?.recommendation).toContain('Remove');
        });

        it('should detect short HSTS max-age', () => {
            // max-age=604800 (7 days) is greater than 1 day minimum but less than 6 months
            const headers = createHeaders({
                'strict-transport-security': 'max-age=604800'
            });

            const report = analyzeSecurityHeaders(headers);
            const hsts = report.details.find(d => d.header === 'strict-transport-security');
            expect(hsts?.status).toBe('warn');
        });

        it('should fail HSTS with very short max-age', () => {
            const headers = createHeaders({
                'strict-transport-security': 'max-age=3600' // 1 hour - too short
            });

            const report = analyzeSecurityHeaders(headers);
            const hsts = report.details.find(d => d.header === 'strict-transport-security');
            expect(hsts?.status).toBe('fail');
        });

        it('should pass for COOP same-origin', () => {
            const headers = createHeaders({
                'cross-origin-opener-policy': 'same-origin'
            });

            const report = analyzeSecurityHeaders(headers);
            const coop = report.details.find(d => d.header === 'cross-origin-opener-policy');
            expect(coop?.status).toBe('pass');
        });

        it('should include recommendations for failed checks', () => {
            const headers = createHeaders({});

            const report = analyzeSecurityHeaders(headers);
            const withRecommendations = report.details.filter(d => d.recommendation);
            expect(withRecommendations.length).toBeGreaterThan(0);
        });
    });

    describe('analyzeCSP', () => {
        it('should parse CSP directives', () => {
            const csp = "default-src 'self'; script-src 'self' https://cdn.example.com; style-src 'self' 'unsafe-inline'";
            const analysis = analyzeCSP(csp);

            expect(analysis.directives).toHaveLength(3);
            expect(analysis.directives[0].name).toBe('default-src');
            expect(analysis.directives[1].values).toContain('https://cdn.example.com');
        });

        it('should detect unsafe-inline', () => {
            const csp = "script-src 'self' 'unsafe-inline'";
            const analysis = analyzeCSP(csp);

            expect(analysis.hasUnsafeInline).toBe(true);
            expect(analysis.issues.some(i => i.includes('unsafe-inline'))).toBe(true);
        });

        it('should detect unsafe-eval', () => {
            const csp = "script-src 'self' 'unsafe-eval'";
            const analysis = analyzeCSP(csp);

            expect(analysis.hasUnsafeEval).toBe(true);
            expect(analysis.score).toBeLessThan(100);
        });

        it('should detect wildcard sources', () => {
            const csp = "default-src *";
            const analysis = analyzeCSP(csp);

            expect(analysis.hasWildcard).toBe(true);
            expect(analysis.score).toBeLessThan(100);
        });

        it('should identify missing important directives', () => {
            const csp = "script-src 'self'"; // Missing default-src, base-uri, etc.
            const analysis = analyzeCSP(csp);

            expect(analysis.missingDirectives).toContain('default-src');
            expect(analysis.missingDirectives).toContain('base-uri');
            expect(analysis.missingDirectives).toContain('frame-ancestors');
        });

        it('should score well-configured CSP high', () => {
            const csp = "default-src 'self'; script-src 'self' 'strict-dynamic'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
            const analysis = analyzeCSP(csp);

            expect(analysis.score).toBeGreaterThanOrEqual(90);
            expect(analysis.hasUnsafeInline).toBe(false);
            expect(analysis.hasUnsafeEval).toBe(false);
            expect(analysis.hasWildcard).toBe(false);
        });

        it('should detect wildcard subdomains', () => {
            const csp = "script-src 'self' *.example.com";
            const analysis = analyzeCSP(csp);

            const scriptSrc = analysis.directives.find(d => d.name === 'script-src');
            expect(scriptSrc?.issues.some(i => i.includes('Wildcard domain'))).toBe(true);
        });

        it('should detect http: source', () => {
            const csp = "default-src 'self' http:";
            const analysis = analyzeCSP(csp);

            const defaultSrc = analysis.directives.find(d => d.name === 'default-src');
            expect(defaultSrc?.issues.some(i => i.includes('insecure HTTP'))).toBe(true);
        });
    });

    describe('generateRecommendedCSP', () => {
        it('should generate strict CSP by default', () => {
            const csp = generateRecommendedCSP();

            expect(csp).toContain("default-src 'self'");
            expect(csp).toContain('strict-dynamic');
            expect(csp).toContain("object-src 'none'");
            expect(csp).toContain("frame-ancestors 'none'");
            expect(csp).toContain('upgrade-insecure-requests');
        });

        it('should allow inline styles when requested', () => {
            const csp = generateRecommendedCSP({ allowInlineStyles: true });

            expect(csp).toContain("style-src 'self' 'unsafe-inline'");
        });

        it('should add trusted domains', () => {
            const csp = generateRecommendedCSP({
                trustedDomains: ['https://cdn.example.com', 'https://api.example.com']
            });

            expect(csp).toContain('https://cdn.example.com');
            expect(csp).toContain('https://api.example.com');
        });

        it('should work in non-strict mode', () => {
            const csp = generateRecommendedCSP({ strictMode: false });

            expect(csp).not.toContain('strict-dynamic');
        });
    });

    describe('quickSecurityCheck', () => {
        it('should return secure for well-protected site', () => {
            const headers = createHeaders({
                'strict-transport-security': 'max-age=31536000',
                'content-security-policy': "default-src 'self'",
                'x-frame-options': 'DENY',
                'x-content-type-options': 'nosniff'
            });

            const result = quickSecurityCheck(headers);
            expect(result.secure).toBe(true);
            expect(result.criticalIssues).toHaveLength(0);
        });

        it('should detect missing HSTS', () => {
            const headers = createHeaders({
                'content-security-policy': "default-src 'self'",
                'x-frame-options': 'DENY',
                'x-content-type-options': 'nosniff'
            });

            const result = quickSecurityCheck(headers);
            expect(result.secure).toBe(false);
            expect(result.criticalIssues).toContain('No HSTS - vulnerable to SSL stripping');
        });

        it('should detect missing CSP', () => {
            const headers = createHeaders({
                'strict-transport-security': 'max-age=31536000',
                'x-frame-options': 'DENY',
                'x-content-type-options': 'nosniff'
            });

            const result = quickSecurityCheck(headers);
            expect(result.secure).toBe(false);
            expect(result.criticalIssues).toContain('No CSP - vulnerable to XSS');
        });

        it('should detect permissive CSP', () => {
            const headers = createHeaders({
                'strict-transport-security': 'max-age=31536000',
                'content-security-policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval'",
                'x-frame-options': 'DENY',
                'x-content-type-options': 'nosniff'
            });

            const result = quickSecurityCheck(headers);
            expect(result.secure).toBe(false);
            expect(result.criticalIssues.some(i => i.includes('unsafe-inline'))).toBe(true);
        });

        it('should detect missing clickjacking protection', () => {
            const headers = createHeaders({
                'strict-transport-security': 'max-age=31536000',
                'content-security-policy': "default-src 'self'",
                'x-content-type-options': 'nosniff'
            });

            const result = quickSecurityCheck(headers);
            expect(result.secure).toBe(false);
            expect(result.criticalIssues).toContain('No clickjacking protection');
        });

        it('should accept CSP frame-ancestors as clickjacking protection', () => {
            const headers = createHeaders({
                'strict-transport-security': 'max-age=31536000',
                'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
                'x-content-type-options': 'nosniff'
            });

            const result = quickSecurityCheck(headers);
            expect(result.criticalIssues).not.toContain('No clickjacking protection');
        });
    });
});

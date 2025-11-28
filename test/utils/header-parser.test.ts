import { describe, it, expect } from 'vitest';
import { 
    parseCacheInfo, 
    parsePlatformInfo, 
    parseRateLimitInfo,
    parseCompressionInfo,
    parseCSPInfo,
    parseContentType,
    parseAcceptInfo,
    parseAuthInfo,
    parseClockSkew
} from '../../src/utils/header-parser.js';

describe('Header Parser', () => {
    describe('Cache Info', () => {
        it('should detect Cloudflare cache', () => {
            const headers = new Headers({ 'cf-cache-status': 'HIT' });
            const info = parseCacheInfo(headers);
            expect(info.provider).toBe('cloudflare');
            expect(info.hit).toBe(true);
            expect(info.status).toBe('HIT');
        });

        it('should detect Akamai cache', () => {
            const headers = new Headers({ 'x-akamai-cache-status': 'TCP_HIT' });
            const info = parseCacheInfo(headers);
            expect(info.provider).toBe('akamai');
            expect(info.hit).toBe(true);
        });

        it('should parse Max-Age', () => {
            const headers = new Headers({ 'cache-control': 'public, max-age=3600' });
            const info = parseCacheInfo(headers);
            expect(info.maxAge).toBe(3600);
        });
    });

    describe('Platform Info', () => {
        it('should detect Vercel', () => {
            const headers = new Headers({ 'x-vercel-id': 'sfo1::iad1::123' });
            const info = parsePlatformInfo(headers);
            expect(info.provider).toBe('vercel');
            expect(info.metadata?.requestId).toBe('sfo1::iad1::123');
        });

        it('should detect AWS Cloudfront', () => {
            const headers = new Headers({ 'server': 'CloudFront' });
            const info = parsePlatformInfo(headers);
            expect(info.provider).toBe('aws-cloudfront');
        });

        it('should detect Nginx', () => {
            const headers = new Headers({ 'server': 'nginx/1.18' });
            const info = parsePlatformInfo(headers);
            expect(info.provider).toBe('nginx');
        });
    });

    describe('Rate Limit', () => {
        it('should parse standard headers', () => {
            const headers = new Headers({
                'x-ratelimit-limit': '100',
                'x-ratelimit-remaining': '99',
                'x-ratelimit-reset': '1600000000'
            });
            const info = parseRateLimitInfo(headers, 200);
            expect(info.limit).toBe(100);
            expect(info.remaining).toBe(99);
            expect(info.reset).toBeInstanceOf(Date);
        });

        it('should detect limited state', () => {
            const headers = new Headers({ 'retry-after': '60' });
            const info = parseRateLimitInfo(headers, 429);
            expect(info.limited).toBe(true);
            expect(info.retryAfter).toBe(60);
        });
    });

    describe('Compression', () => {
        it('should parse content encoding', () => {
            const headers = new Headers({ 
                'content-encoding': 'br',
                'content-length': '500',
                'x-original-size': '1000'
            });
            const info = parseCompressionInfo(headers);
            expect(info.encoding).toBe('br');
            expect(info.compressedSize).toBe(500);
            expect(info.originalSize).toBe(1000);
            expect(info.ratio).toBe(2);
        });
    });

    describe('Content Type', () => {
        it('should parse complex content-type', () => {
            const headers = new Headers({ 
                'content-type': 'multipart/form-data; boundary=---123; charset=utf-8' 
            });
            const info = parseContentType(headers);
            expect(info.mediaType).toBe('multipart/form-data');
            expect(info.type).toBe('multipart');
            expect(info.subtype).toBe('form-data');
            expect(info.boundary).toBe('---123');
            expect(info.charset).toBe('utf-8');
        });
    });

    describe('Accept Headers', () => {
        it('should parse accept q-values', () => {
            const headers = new Headers({ 
                'accept': 'text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8' 
            });
            const info = parseAcceptInfo(headers);
            expect(info.types[0].mediaType).toBe('text/html');
            expect(info.types[0].q).toBe(1);
            expect(info.types[2].mediaType).toBe('application/xml');
            expect(info.types[2].q).toBe(0.9);
        });
    });

    describe('Auth Info', () => {
        it('should parse WWW-Authenticate', () => {
            const headers = new Headers({ 
                'www-authenticate': 'Bearer realm="api", error="invalid_token", error_description="expired"' 
            });
            const info = parseAuthInfo(headers);
            expect(info.methods).toContain('Bearer');
            expect(info.realm).toBe('api');
            expect(info.error).toBe('invalid_token');
            expect(info.errorDescription).toBe('expired');
        });
    });

    describe('Clock Skew', () => {
        it('should calculate skew', () => {
            // Server is 10 seconds ahead
            const serverTime = new Date(Date.now() + 10000).toUTCString();
            const headers = new Headers({ 'date': serverTime });
            const info = parseClockSkew(headers);
            
            // Allow tiny variation
            expect(info.skewMs).toBeGreaterThan(9000);
            expect(info.skewMs).toBeLessThan(11000);
        });
    });
});

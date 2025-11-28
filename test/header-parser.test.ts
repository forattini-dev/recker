import { describe, it, expect } from 'vitest';
import {
  parseCacheInfo,
  parsePlatformInfo,
  parseRateLimitInfo,
  parseCompressionInfo,
  parseCSPInfo,
  parseContentType,
  parseAcceptInfo,
  parseHeaders
} from '../src/utils/header-parser.js';

describe('Header Parser', () => {
  describe('parseCacheInfo', () => {
    it('should parse Cloudflare cache headers', () => {
      const headers = new Headers({
        'cf-cache-status': 'HIT',
        'age': '3600'
      });

      const info = parseCacheInfo(headers);

      expect(info.provider).toBe('cloudflare');
      expect(info.status).toBe('HIT');
      expect(info.hit).toBe(true);
      expect(info.age).toBe(3600);
    });

    it('should parse Fastly cache headers', () => {
      const headers = new Headers({
        'x-cache': 'HIT, HIT from FASTLY'
      });

      const info = parseCacheInfo(headers);

      expect(info.provider).toBe('fastly');
      expect(info.status).toBe('HIT');
      expect(info.hit).toBe(true);
    });

    it('should parse Akamai cache headers', () => {
      const headers = new Headers({
        'x-akamai-cache-status': 'Hit from child'
      });

      const info = parseCacheInfo(headers);

      expect(info.provider).toBe('akamai');
      expect(info.hit).toBe(true);
    });

    it('should parse CloudFront cache headers', () => {
      const headers = new Headers({
        'x-cache': 'Hit from cloudfront',
        'x-amz-cf-id': 'abc123'
      });

      const info = parseCacheInfo(headers);

      expect(info.provider).toBe('cloudfront');
    });

    it('should parse cache-control max-age', () => {
      const headers = new Headers({
        'cache-control': 'public, max-age=86400, s-maxage=31536000'
      });

      const info = parseCacheInfo(headers);

      expect(info.maxAge).toBe(86400);
    });

    it('should handle MISS status', () => {
      const headers = new Headers({
        'x-cache': 'MISS'
      });

      const info = parseCacheInfo(headers);

      expect(info.status).toBe('MISS');
      expect(info.hit).toBe(false);
    });

    it('should handle no cache headers', () => {
      const headers = new Headers();

      const info = parseCacheInfo(headers);

      expect(info.hit).toBe(false);
      expect(info.provider).toBeUndefined();
    });
  });

  describe('parsePlatformInfo', () => {
    it('should detect Cloudflare', () => {
      const headers = new Headers({
        'cf-ray': '1234567890-SFO'
      });

      const info = parsePlatformInfo(headers);

      expect(info.provider).toBe('cloudflare');
      expect(info.category).toBe('cdn');
      expect(info.region).toBe('SFO');
      expect(info.metadata?.ray).toBe('1234567890-SFO');
    });

    it('should detect Fastly', () => {
      const headers = new Headers({
        'x-served-by': 'cache-sea4427-SEA',
        'fastly-debug-digest': 'abc123'
      });

      const info = parsePlatformInfo(headers);

      expect(info.provider).toBe('fastly');
      expect(info.category).toBe('cdn');
      expect(info.server).toBe('cache-sea4427-SEA');
      expect(info.metadata?.digest).toBe('abc123');
    });

    it('should detect AWS CloudFront', () => {
      const headers = new Headers({
        'x-amz-cf-id': 'xyz789',
        'x-amz-cf-pop': 'SFO53-C1'
      });

      const info = parsePlatformInfo(headers);

      expect(info.provider).toBe('aws-cloudfront');
      expect(info.category).toBe('cloud');
      expect(info.region).toBe('SFO53-C1');
    });

    it('should detect GCP', () => {
      const headers = new Headers({
        'x-cloud-trace-context': 'traceid123/spanid456',
        'x-goog-request-id': 'req789'
      });

      const info = parsePlatformInfo(headers);

      expect(info.provider).toBe('gcp');
      expect(info.category).toBe('cloud');
      expect(info.metadata?.traceId).toBe('traceid123');
    });

    it('should detect Azure', () => {
      const headers = new Headers({
        'x-ms-request-id': 'req-azure-123'
      });

      const info = parsePlatformInfo(headers);

      expect(info.provider).toBe('azure');
      expect(info.category).toBe('cloud');
    });

    it('should detect Vercel', () => {
      const headers = new Headers({
        'x-vercel-id': 'sfo1::abc123',
        'x-vercel-cache': 'HIT'
      });

      const info = parsePlatformInfo(headers);

      expect(info.provider).toBe('vercel');
      expect(info.category).toBe('hosting');
    });

    it('should detect Netlify', () => {
      const headers = new Headers({
        'x-nf-request-id': 'req123'
      });

      const info = parsePlatformInfo(headers);

      expect(info.provider).toBe('netlify');
      expect(info.category).toBe('hosting');
    });

    it('should fallback to Server header', () => {
      const headers = new Headers({
        'server': 'nginx/1.18.0'
      });

      const info = parsePlatformInfo(headers);

      expect(info.provider).toBe('nginx');
      expect(info.category).toBe('server');
      expect(info.server).toBe('nginx/1.18.0');
    });

    it('should fallback to Via header', () => {
      const headers = new Headers({
        'via': '1.1 varnish'
      });

      const info = parsePlatformInfo(headers);

      expect(info.provider).toBe('varnish');
      expect(info.category).toBe('proxy');
    });

    it('should handle no platform headers', () => {
      const headers = new Headers();

      const info = parsePlatformInfo(headers);

      expect(info.provider).toBeUndefined();
    });
  });

  describe('parseRateLimitInfo', () => {
    it('should parse standard rate limit headers', () => {
      const headers = new Headers({
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '4999',
        'x-ratelimit-reset': '1577836800'
      });

      const info = parseRateLimitInfo(headers, 200);

      expect(info.limit).toBe(5000);
      expect(info.remaining).toBe(4999);
      expect(info.reset).toBeInstanceOf(Date);
      expect(info.limited).toBe(false);
    });

    it('should detect rate limiting from 429 status', () => {
      const headers = new Headers();

      const info = parseRateLimitInfo(headers, 429);

      expect(info.limited).toBe(true);
    });

    it('should detect rate limiting from remaining=0', () => {
      const headers = new Headers({
        'x-ratelimit-remaining': '0'
      });

      const info = parseRateLimitInfo(headers, 200);

      expect(info.limited).toBe(true);
    });

    it('should parse Retry-After seconds', () => {
      const headers = new Headers({
        'retry-after': '120'
      });

      const info = parseRateLimitInfo(headers, 429);

      expect(info.retryAfter).toBe(120);
    });

    it('should parse Retry-After date', () => {
      const futureDate = new Date(Date.now() + 120000);
      const headers = new Headers({
        'retry-after': futureDate.toUTCString()
      });

      const info = parseRateLimitInfo(headers, 429);

      expect(info.retryAfter).toBeGreaterThan(0);
    });

    it('should parse RateLimit-Policy header', () => {
      const headers = new Headers({
        'ratelimit-policy': '5000;w=3600'
      });

      const info = parseRateLimitInfo(headers, 200);

      expect(info.policy).toBe('5000;w=3600');
    });
  });

  describe('parseCompressionInfo', () => {
    it('should parse gzip compression', () => {
      const headers = new Headers({
        'content-encoding': 'gzip'
      });

      const info = parseCompressionInfo(headers);

      expect(info.encoding).toBe('gzip');
    });

    it('should parse brotli compression', () => {
      const headers = new Headers({
        'content-encoding': 'br'
      });

      const info = parseCompressionInfo(headers);

      expect(info.encoding).toBe('br');
    });

    it('should parse compression sizes and ratio', () => {
      const headers = new Headers({
        'content-encoding': 'gzip',
        'content-length': '1024',
        'x-original-size': '10240'
      });

      const info = parseCompressionInfo(headers);

      expect(info.compressedSize).toBe(1024);
      expect(info.originalSize).toBe(10240);
      expect(info.ratio).toBe(10);
    });
  });

  describe('parseCSPInfo', () => {
    it('should parse CSP header', () => {
      const headers = new Headers({
        'content-security-policy': "default-src 'self'; script-src 'unsafe-inline' cdn.example.com"
      });

      const info = parseCSPInfo(headers);

      expect(info.reportOnly).toBe(false);
      expect(info.directives['default-src']).toEqual(["'self'"]);
      expect(info.directives['script-src']).toEqual(["'unsafe-inline'", 'cdn.example.com']);
    });

    it('should parse CSP report-only header', () => {
      const headers = new Headers({
        'content-security-policy-report-only': "default-src 'none'"
      });

      const info = parseCSPInfo(headers);

      expect(info.reportOnly).toBe(true);
      expect(info.directives['default-src']).toEqual(["'none'"]);
    });

    it('should handle no CSP header', () => {
      const headers = new Headers();

      const info = parseCSPInfo(headers);

      expect(info.reportOnly).toBe(false);
      expect(Object.keys(info.directives)).toHaveLength(0);
    });
  });

  describe('parseContentType', () => {
    it('should parse simple content type', () => {
      const headers = new Headers({
        'content-type': 'application/json'
      });

      const info = parseContentType(headers);

      expect(info.mediaType).toBe('application/json');
      expect(info.type).toBe('application');
      expect(info.subtype).toBe('json');
    });

    it('should parse content type with charset', () => {
      const headers = new Headers({
        'content-type': 'text/html; charset=utf-8'
      });

      const info = parseContentType(headers);

      expect(info.mediaType).toBe('text/html');
      expect(info.charset).toBe('utf-8');
      expect(info.type).toBe('text');
    });

    it('should parse multipart with boundary', () => {
      const headers = new Headers({
        'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary'
      });

      const info = parseContentType(headers);

      expect(info.mediaType).toBe('multipart/form-data');
      expect(info.boundary).toBe('----WebKitFormBoundary');
    });

    it('should handle no content-type header', () => {
      const headers = new Headers();

      const info = parseContentType(headers);

      expect(info.mediaType).toBeUndefined();
    });
  });

  describe('parseAcceptInfo', () => {
    it('should parse Accept header with quality values', () => {
      const headers = new Headers({
        'accept': 'text/html;q=1.0, application/json;q=0.8, */*;q=0.1'
      });

      const info = parseAcceptInfo(headers);

      expect(info.types).toHaveLength(3);
      expect(info.types[0].mediaType).toBe('text/html');
      expect(info.types[0].q).toBe(1.0);
      expect(info.types[1].mediaType).toBe('application/json');
      expect(info.types[1].q).toBe(0.8);
    });

    it('should parse Accept-Encoding header', () => {
      const headers = new Headers({
        'accept-encoding': 'gzip, deflate, br;q=0.9'
      });

      const info = parseAcceptInfo(headers);

      expect(info.encodings).toHaveLength(3);
      expect(info.encodings[0].encoding).toBe('gzip');
      expect(info.encodings[2].q).toBe(0.9);
    });

    it('should parse Accept-Language header', () => {
      const headers = new Headers({
        'accept-language': 'en-US,en;q=0.9,es;q=0.8'
      });

      const info = parseAcceptInfo(headers);

      expect(info.languages).toHaveLength(3);
      expect(info.languages[0].language).toBe('en-US');
      expect(info.languages[1].q).toBe(0.9);
    });

    it('should handle no accept headers', () => {
      const headers = new Headers();

      const info = parseAcceptInfo(headers);

      expect(info.types).toHaveLength(0);
      expect(info.encodings).toHaveLength(0);
      expect(info.languages).toHaveLength(0);
    });
  });

  describe('parseHeaders (convenience function)', () => {
    it('should parse all headers at once', () => {
      const headers = new Headers({
        'cf-ray': '1234-SFO',
        'x-ratelimit-limit': '5000',
        'content-encoding': 'gzip',
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=3600'
      });

      const info = parseHeaders(headers, 200);

      expect(info.platform.provider).toBe('cloudflare');
      expect(info.rateLimit.limit).toBe(5000);
      expect(info.compression.encoding).toBe('gzip');
      expect(info.contentType.charset).toBe('utf-8');
      expect(info.cache.maxAge).toBe(3600);
    });
  });
});

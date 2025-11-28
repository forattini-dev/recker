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
  parseClockSkew,
  parseHeaders
} from '../../src/utils/header-parser.js';

describe('Header Parser', () => {
  describe('parseCacheInfo', () => {
    it('should detect Cloudflare cache HIT', () => {
      const headers = new Headers({ 'cf-cache-status': 'HIT' });
      const info = parseCacheInfo(headers);
      expect(info.hit).toBe(true);
      expect(info.status).toBe('HIT');
      expect(info.provider).toBe('cloudflare');
    });

    it('should detect Cloudflare cache MISS', () => {
      const headers = new Headers({ 'cf-cache-status': 'miss' });
      const info = parseCacheInfo(headers);
      expect(info.hit).toBe(false);
      expect(info.status).toBe('MISS');
    });

    it('should detect Fastly from X-Cache header', () => {
      const headers = new Headers({ 'x-cache': 'HIT from FASTLY' });
      const info = parseCacheInfo(headers);
      expect(info.hit).toBe(true);
      expect(info.provider).toBe('fastly');
    });

    it('should detect Varnish from X-Cache header', () => {
      const headers = new Headers({ 'x-cache': 'HIT from VARNISH' });
      const info = parseCacheInfo(headers);
      expect(info.hit).toBe(true);
      expect(info.provider).toBe('varnish');
    });

    it('should parse X-Cache MISS', () => {
      const headers = new Headers({ 'x-cache': 'MISS' });
      const info = parseCacheInfo(headers);
      expect(info.hit).toBe(false);
      expect(info.status).toBe('MISS');
    });

    it('should parse X-Cache EXPIRED', () => {
      const headers = new Headers({ 'x-cache': 'EXPIRED' });
      const info = parseCacheInfo(headers);
      expect(info.status).toBe('EXPIRED');
    });

    it('should parse X-Cache STALE', () => {
      const headers = new Headers({ 'x-cache': 'STALE' });
      const info = parseCacheInfo(headers);
      expect(info.status).toBe('STALE');
    });

    it('should detect Akamai cache', () => {
      const headers = new Headers({ 'x-akamai-cache-status': 'HIT' });
      const info = parseCacheInfo(headers);
      expect(info.hit).toBe(true);
      expect(info.provider).toBe('akamai');
    });

    it('should detect CloudFront', () => {
      const headers = new Headers({ 'x-amz-cf-id': 'abc123' });
      const info = parseCacheInfo(headers);
      expect(info.provider).toBe('cloudfront');
    });

    it('should parse Cache-Control max-age', () => {
      const headers = new Headers({ 'cache-control': 'max-age=3600' });
      const info = parseCacheInfo(headers);
      expect(info.maxAge).toBe(3600);
    });

    it('should parse Age header', () => {
      const headers = new Headers({ 'age': '120' });
      const info = parseCacheInfo(headers);
      expect(info.age).toBe(120);
    });

    it('should return no hit for empty headers', () => {
      const headers = new Headers();
      const info = parseCacheInfo(headers);
      expect(info.hit).toBe(false);
    });
  });

  describe('parsePlatformInfo', () => {
    it('should detect Cloudflare from cf-ray', () => {
      const headers = new Headers({ 'cf-ray': 'abc123-LAX' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('cloudflare');
      expect(info.category).toBe('cdn');
      expect(info.region).toBe('LAX');
      expect(info.metadata?.ray).toBe('abc123-LAX');
    });

    it('should detect Fastly from x-served-by', () => {
      const headers = new Headers({ 'x-served-by': 'cache-lax1234' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('fastly');
      expect(info.category).toBe('cdn');
    });

    it('should detect Akamai', () => {
      const headers = new Headers({ 'x-akamai-request-id': 'req-123' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('akamai');
      expect(info.metadata?.requestId).toBe('req-123');
    });

    it('should detect AWS CloudFront', () => {
      const headers = new Headers({ 
        'x-amz-cf-id': 'cf-123',
        'x-amz-cf-pop': 'LAX1'
      });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('aws-cloudfront');
      expect(info.category).toBe('cloud');
      expect(info.region).toBe('LAX1');
    });

    it('should detect GCP', () => {
      const headers = new Headers({ 'x-cloud-trace-context': 'trace/123' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('gcp');
      expect(info.category).toBe('cloud');
      expect(info.metadata?.traceId).toBe('trace');
    });

    it('should detect Azure', () => {
      const headers = new Headers({ 'x-ms-request-id': 'ms-123' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('azure');
      expect(info.category).toBe('cloud');
    });

    it('should detect Vercel', () => {
      const headers = new Headers({ 'x-vercel-id': 'vercel-123' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('vercel');
      expect(info.category).toBe('hosting');
    });

    it('should detect Netlify', () => {
      const headers = new Headers({ 'x-nf-request-id': 'nf-123' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('netlify');
      expect(info.category).toBe('hosting');
    });

    it('should detect Envoy', () => {
      const headers = new Headers({ 'x-envoy-upstream-service-time': '50' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('envoy');
      expect(info.category).toBe('proxy');
    });

    it('should detect Express from x-powered-by', () => {
      const headers = new Headers({ 'x-powered-by': 'Express' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('express');
      expect(info.category).toBe('framework');
    });

    it('should detect nginx from Server header', () => {
      const headers = new Headers({ 'server': 'nginx/1.20.0' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('nginx');
      expect(info.category).toBe('server');
    });

    it('should detect apache from Server header', () => {
      const headers = new Headers({ 'server': 'Apache/2.4.48' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('apache');
      expect(info.category).toBe('server');
    });

    it('should detect from Via header as fallback', () => {
      const headers = new Headers({ 'via': '1.1 varnish' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('varnish');
      expect(info.category).toBe('proxy');
    });

    it('should detect squid from Via header', () => {
      const headers = new Headers({ 'via': '1.1 squid' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('squid');
    });

    it('should return unknown for unrecognized server', () => {
      const headers = new Headers({ 'server': 'CustomServer/1.0' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('unknown');
      expect(info.category).toBe('unknown');
    });

    it('should detect DataDome security', () => {
      const headers = new Headers({ 'x-datadome': 'protected' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('datadome');
      expect(info.category).toBe('security');
    });

    it('should detect PHP from x-powered-by', () => {
      const headers = new Headers({ 'x-powered-by': 'PHP/8.1' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('php');
      expect(info.category).toBe('framework');
    });

    it('should detect ASP.NET from x-aspnet-version', () => {
      const headers = new Headers({ 'x-aspnet-version': '4.0' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('aspnet');
      expect(info.category).toBe('framework');
    });
  });

  describe('parseRateLimitInfo', () => {
    it('should detect rate limiting from 429 status', () => {
      const headers = new Headers();
      const info = parseRateLimitInfo(headers, 429);
      expect(info.limited).toBe(true);
    });

    it('should parse x-ratelimit-* headers', () => {
      const headers = new Headers({
        'x-ratelimit-limit': '1000',
        'x-ratelimit-remaining': '999',
        'x-ratelimit-reset': '1700000000'
      });
      const info = parseRateLimitInfo(headers, 200);
      expect(info.limit).toBe(1000);
      expect(info.remaining).toBe(999);
      expect(info.reset).toBeInstanceOf(Date);
    });

    it('should parse ratelimit-* headers (without x- prefix)', () => {
      const headers = new Headers({
        'ratelimit-limit': '500',
        'ratelimit-remaining': '0'
      });
      const info = parseRateLimitInfo(headers, 200);
      expect(info.limit).toBe(500);
      expect(info.remaining).toBe(0);
      expect(info.limited).toBe(true);
    });

    it('should parse Retry-After in seconds', () => {
      const headers = new Headers({ 'retry-after': '60' });
      const info = parseRateLimitInfo(headers, 429);
      expect(info.retryAfter).toBe(60);
    });

    it('should parse Retry-After as date', () => {
      const futureDate = new Date(Date.now() + 60000);
      const headers = new Headers({ 'retry-after': futureDate.toUTCString() });
      const info = parseRateLimitInfo(headers, 429);
      expect(info.retryAfter).toBeGreaterThan(0);
    });

    it('should parse reset as seconds from now', () => {
      const headers = new Headers({ 'x-ratelimit-reset': '60' });
      const info = parseRateLimitInfo(headers, 200);
      expect(info.reset).toBeInstanceOf(Date);
    });

    it('should parse RateLimit-Policy', () => {
      const headers = new Headers({ 'ratelimit-policy': '1000;w=60' });
      const info = parseRateLimitInfo(headers, 200);
      expect(info.policy).toBe('1000;w=60');
    });
  });

  describe('parseCompressionInfo', () => {
    it('should detect gzip encoding', () => {
      const headers = new Headers({ 'content-encoding': 'gzip' });
      const info = parseCompressionInfo(headers);
      expect(info.encoding).toBe('gzip');
    });

    it('should detect brotli encoding', () => {
      const headers = new Headers({ 'content-encoding': 'br' });
      const info = parseCompressionInfo(headers);
      expect(info.encoding).toBe('br');
    });

    it('should parse original size', () => {
      const headers = new Headers({ 'x-original-size': '10000' });
      const info = parseCompressionInfo(headers);
      expect(info.originalSize).toBe(10000);
    });

    it('should parse compressed size from content-length', () => {
      const headers = new Headers({ 'content-length': '5000' });
      const info = parseCompressionInfo(headers);
      expect(info.compressedSize).toBe(5000);
    });

    it('should calculate compression ratio', () => {
      const headers = new Headers({
        'x-original-size': '10000',
        'content-length': '5000'
      });
      const info = parseCompressionInfo(headers);
      expect(info.ratio).toBe(2);
    });
  });

  describe('parseCSPInfo', () => {
    it('should parse CSP directives', () => {
      const headers = new Headers({
        'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'"
      });
      const info = parseCSPInfo(headers);
      expect(info.reportOnly).toBe(false);
      expect(info.directives['default-src']).toEqual(["'self'"]);
      expect(info.directives['script-src']).toEqual(["'unsafe-inline'"]);
    });

    it('should detect report-only CSP', () => {
      const headers = new Headers({
        'content-security-policy-report-only': "default-src 'none'"
      });
      const info = parseCSPInfo(headers);
      expect(info.reportOnly).toBe(true);
    });

    it('should return empty directives for no CSP', () => {
      const headers = new Headers();
      const info = parseCSPInfo(headers);
      expect(info.directives).toEqual({});
    });
  });

  describe('parseContentType', () => {
    it('should parse media type', () => {
      const headers = new Headers({ 'content-type': 'application/json' });
      const info = parseContentType(headers);
      expect(info.mediaType).toBe('application/json');
      expect(info.type).toBe('application');
      expect(info.subtype).toBe('json');
    });

    it('should parse charset', () => {
      const headers = new Headers({ 'content-type': 'text/html; charset=utf-8' });
      const info = parseContentType(headers);
      expect(info.charset).toBe('utf-8');
    });

    it('should parse boundary for multipart', () => {
      const headers = new Headers({ 
        'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary'
      });
      const info = parseContentType(headers);
      expect(info.boundary).toBe('----WebKitFormBoundary');
    });

    it('should handle quoted charset', () => {
      const headers = new Headers({ 'content-type': 'text/html; charset="UTF-8"' });
      const info = parseContentType(headers);
      expect(info.charset).toBe('UTF-8');
    });

    it('should return empty info for missing header', () => {
      const headers = new Headers();
      const info = parseContentType(headers);
      expect(info.mediaType).toBeUndefined();
    });
  });

  describe('parseAcceptInfo', () => {
    it('should parse Accept header', () => {
      const headers = new Headers({ 'accept': 'text/html, application/json' });
      const info = parseAcceptInfo(headers);
      expect(info.types.length).toBe(2);
      expect(info.types[0].mediaType).toBe('text/html');
    });

    it('should sort by quality value', () => {
      const headers = new Headers({ 'accept': 'text/html;q=0.5, application/json;q=0.9' });
      const info = parseAcceptInfo(headers);
      expect(info.types[0].mediaType).toBe('application/json');
      expect(info.types[1].mediaType).toBe('text/html');
    });

    it('should parse Accept-Encoding', () => {
      const headers = new Headers({ 'accept-encoding': 'gzip, deflate, br' });
      const info = parseAcceptInfo(headers);
      expect(info.encodings.length).toBe(3);
    });

    it('should parse Accept-Language', () => {
      const headers = new Headers({ 'accept-language': 'en-US,en;q=0.9,es;q=0.8' });
      const info = parseAcceptInfo(headers);
      expect(info.languages.length).toBe(3);
      expect(info.languages[0].language).toBe('en-US');
    });
  });

  describe('parseAuthInfo', () => {
    it('should detect Basic auth', () => {
      const headers = new Headers({ 'www-authenticate': 'Basic realm="test"' });
      const info = parseAuthInfo(headers);
      expect(info.methods).toContain('Basic');
      expect(info.realm).toBe('test');
    });

    it('should detect Bearer auth', () => {
      const headers = new Headers({ 'www-authenticate': 'Bearer' });
      const info = parseAuthInfo(headers);
      expect(info.methods).toContain('Bearer');
    });

    it('should detect Digest auth', () => {
      const headers = new Headers({ 'www-authenticate': 'Digest realm="api"' });
      const info = parseAuthInfo(headers);
      expect(info.methods).toContain('Digest');
    });

    it('should parse error from Bearer', () => {
      const headers = new Headers({ 
        'www-authenticate': 'Bearer error="invalid_token" error_description="Token expired"'
      });
      const info = parseAuthInfo(headers);
      expect(info.error).toBe('invalid_token');
      expect(info.errorDescription).toBe('Token expired');
    });

    it('should parse x-auth-error header', () => {
      const headers = new Headers({ 'x-auth-error': 'Invalid credentials' });
      const info = parseAuthInfo(headers);
      expect(info.error).toBe('Invalid credentials');
    });

    it('should detect AWS4 auth', () => {
      const headers = new Headers({ 'www-authenticate': 'AWS4-HMAC-SHA256' });
      const info = parseAuthInfo(headers);
      expect(info.methods).toContain('AWS4');
    });
  });

  describe('parseClockSkew', () => {
    it('should parse Date header', () => {
      const serverDate = new Date();
      const headers = new Headers({ 'date': serverDate.toUTCString() });
      const info = parseClockSkew(headers);
      expect(info.serverTime).toBeInstanceOf(Date);
      expect(Math.abs(info.skewMs!)).toBeLessThan(1000); // Should be within 1 second
    });

    it('should return empty for missing Date header', () => {
      const headers = new Headers();
      const info = parseClockSkew(headers);
      expect(info.serverTime).toBeUndefined();
    });

    it('should return empty for invalid Date header', () => {
      const headers = new Headers({ 'date': 'invalid-date' });
      const info = parseClockSkew(headers);
      expect(info.serverTime).toBeUndefined();
    });
  });

  describe('parseHeaders', () => {
    it('should parse all header info at once', () => {
      const headers = new Headers({
        'cf-ray': 'abc-LAX',
        'content-type': 'application/json',
        'x-ratelimit-limit': '100',
        'content-encoding': 'gzip'
      });
      const info = parseHeaders(headers, 200);

      expect(info.cache).toBeDefined();
      expect(info.platform.provider).toBe('cloudflare');
      expect(info.rateLimit.limit).toBe(100);
      expect(info.compression.encoding).toBe('gzip');
      expect(info.contentType.mediaType).toBe('application/json');
    });
  });

  describe('additional platform detection', () => {
    it('should detect Oracle Cloud', () => {
      const headers = new Headers({ 'x-oracle-dms-rid': 'oracle-123' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('oracle-cloud');
    });

    it('should detect Alibaba Cloud', () => {
      const headers = new Headers({ 'eagleeye-traceid': 'ali-123' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('alibaba-cloud');
    });

    it('should detect Render', () => {
      const headers = new Headers({ 'x-render-origin-server': 'render-123' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('render');
    });

    it('should detect Incapsula', () => {
      const headers = new Headers({ 'x-iinfo': 'incap-123' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('incapsula');
    });

    it('should detect Incapsula from x-cdn', () => {
      const headers = new Headers({ 'x-cdn': 'Incapsula' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('incapsula');
    });

    it('should detect Imperva', () => {
      const headers = new Headers({ 'x-imperva-uuid': 'imperva-123' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('imperva');
    });

    it('should detect Traefik', () => {
      const headers = new Headers({ 'server': 'Traefik' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('traefik');
    });

    it('should detect Caddy', () => {
      const headers = new Headers({ 'server': 'Caddy' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('caddy');
    });

    it('should detect HAProxy', () => {
      const headers = new Headers({ 'server': 'HAProxy' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('haproxy');
    });

    it('should detect IIS', () => {
      const headers = new Headers({ 'server': 'Microsoft-IIS/10.0' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('iis');
    });

    it('should detect Kestrel', () => {
      const headers = new Headers({ 'server': 'Kestrel' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('kestrel');
    });

    it('should detect Rails from x-runtime', () => {
      const headers = new Headers({ 'x-runtime': '0.123' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('rails');
    });

    it('should detect Django from wsgi server', () => {
      const headers = new Headers({ 'server': 'gunicorn/20.1.0 wsgi' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('django');
    });

    it('should detect Fastly from digest', () => {
      const headers = new Headers({ 'fastly-debug-digest': 'abc123' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('fastly');
    });

    it('should detect GCP from x-goog-request-id', () => {
      const headers = new Headers({ 'x-goog-request-id': 'gcp-123' });
      const info = parsePlatformInfo(headers);
      expect(info.provider).toBe('gcp');
    });
  });
});

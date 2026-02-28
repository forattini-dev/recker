import { describe, it, expect } from 'vitest';
import {
  detectBlock,
  isProtectedDomain,
  isCloudflareChallenge,
  type BlockDetectionResult,
} from '../../src/utils/block-detector.js';

/**
 * Mock response helper
 */
function createMockResponse(status: number, headers: Record<string, string> = {}): {
  status: number;
  headers: {
    get(name: string): string | null;
    has(name: string): boolean;
  };
} {
  return {
    status,
    headers: {
      get(name: string): string | null {
        return headers[name.toLowerCase()] ?? null;
      },
      has(name: string): boolean {
        return name.toLowerCase() in headers;
      },
    },
  };
}

describe('Block Detector', () => {
  describe('detectBlock', () => {
    describe('status code detection', () => {
      it('should detect 403 Forbidden as potential block', () => {
        const response = createMockResponse(403);
        const result = detectBlock(response);

        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('status');
        expect(result.confidence).toBeGreaterThan(0.5);
      });

      it('should detect 429 Too Many Requests as rate limit', () => {
        const response = createMockResponse(429);
        const result = detectBlock(response);

        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('rate-limit');
        expect(result.confidence).toBeGreaterThan(0.6);
      });

      it('should detect 503 Service Unavailable as block', () => {
        const response = createMockResponse(503);
        const result = detectBlock(response);

        expect(result.blocked).toBe(true);
        expect(result.confidence).toBeGreaterThan(0.6);
      });

      it('should not flag 200 OK as blocked', () => {
        const response = createMockResponse(200);
        const result = detectBlock(response);

        expect(result.blocked).toBe(false);
        expect(result.confidence).toBe(0);
      });

      it('should not flag 404 Not Found as blocked', () => {
        const response = createMockResponse(404);
        const result = detectBlock(response);

        expect(result.blocked).toBe(false);
      });
    });

    describe('Cloudflare detection', () => {
      it('should detect Cloudflare challenge from headers and status', () => {
        const response = createMockResponse(403, {
          'cf-ray': '1234567890abcdef-IAD',
        });
        const result = detectBlock(response);

        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('cloudflare');
        expect(result.confidence).toBeGreaterThan(0.8);
      });

      it('should detect Cloudflare from body patterns', () => {
        const response = createMockResponse(503);
        const body = `
          <html>
          <head><title>Just a moment...</title></head>
          <body>
            <div id="cf-browser-verification">
              Checking your browser before accessing the website.
            </div>
            <noscript>Please enable JavaScript and cookies to continue.</noscript>
          </body>
          </html>
        `;
        const result = detectBlock(response, body);

        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('cloudflare');
        expect(result.confidence).toBeGreaterThan(0.9);
      });

      it('should detect "Attention Required" Cloudflare page', () => {
        const response = createMockResponse(403, { 'cf-ray': 'abc123' });
        const body = '<html><title>Attention Required! | Cloudflare</title></html>';
        const result = detectBlock(response, body);

        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('cloudflare');
      });
    });

    describe('Akamai detection', () => {
      it('should detect Akamai block from headers', () => {
        const response = createMockResponse(403, {
          'x-akamai-transformed': 'transformed',
        });
        const result = detectBlock(response);

        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('akamai');
      });

      it('should detect Akamai from body pattern', () => {
        const response = createMockResponse(403);
        const body = '<html><body>Access Denied. Reference #12345abcdef</body></html>';
        const result = detectBlock(response, body);

        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('akamai');
      });
    });

    describe('DataDome detection', () => {
      it('should detect DataDome from headers', () => {
        const response = createMockResponse(200, {
          'x-datadome': 'protected',
        });
        const result = detectBlock(response);

        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('datadome');
        expect(result.confidence).toBeGreaterThan(0.8);
      });

      it('should detect DataDome captcha from body', () => {
        const response = createMockResponse(200);
        const body = '<script src="https://geo.captcha-delivery.com/captcha/"></script>';
        const result = detectBlock(response, body);

        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('datadome');
      });
    });

    describe('CAPTCHA detection', () => {
      it('should detect Google retry enablejs challenge as CAPTCHA-like block', () => {
        const response = createMockResponse(200);
        const body = '<html><body>/httpservice/retry/enablejs?continue=https%3A%2F%2Fwww.google.com%2Fsearch</body></html>';
        const result = detectBlock(response, body);

        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('captcha');
        expect(result.confidence).toBeGreaterThan(0.85);
      });

      it('should detect reCAPTCHA', () => {
        const response = createMockResponse(200);
        const body = '<html><body>Captcha required to continue.</body></html>';
        const result = detectBlock(response, body);

        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('captcha');
      });

      it('should detect hCaptcha', () => {
        const response = createMockResponse(200);
        const body = '<html><body>Human verification is required for this request.</body></html>';
        const result = detectBlock(response, body);

        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('captcha');
      });

      it('should detect FunCaptcha/Arkose', () => {
        const response = createMockResponse(200);
        const body = '<html><body>please verify you\'re human using anti-bot protection.</body></html>';
        const result = detectBlock(response, body);

        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('captcha');
      });
    });

    describe('rate limit detection', () => {
      it('should detect rate limiting from body', () => {
        const response = createMockResponse(200);
        const body = '<html><body>Too many requests. Please slow down and try again later.</body></html>';
        const result = detectBlock(response, body);

        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('rate-limit');
      });
    });

    describe('generic WAF detection', () => {
      it('should detect generic blocked message', () => {
        const response = createMockResponse(200);
        const body = '<html><body>Your request has been blocked due to suspicious activity.</body></html>';
        const result = detectBlock(response, body);

        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('waf');
      });

      it('should detect PerimeterX', () => {
        const response = createMockResponse(200);
        // PerimeterX pattern using "perimeterx" keyword (not px-captcha to avoid captcha match)
        const body = '<html><body>PerimeterX protection active</body></html>';
        const result = detectBlock(response, body);

        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('waf');
      });

      it('should detect Imperva/Incapsula', () => {
        const response = createMockResponse(200);
        const body = '<html><body>Protected by Incapsula</body></html>';
        const result = detectBlock(response, body);

        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('waf');
      });

      it('should detect suspicious redirect page', () => {
        const response = createMockResponse(200);
        const body = '<html><head><meta http-equiv="refresh" content="0;url=/challenge"></head></html>';
        const result = detectBlock(response, body);

        expect(result.blocked).toBe(true);
        expect(result.reason).toBe('waf');
      });
    });

    describe('non-blocked responses', () => {
      it('should not flag a normal enablejs text string outside challenge context', () => {
        const response = createMockResponse(200);
        const body = 'Enablejs is part of a component library note unrelated to bot detection.';

        const result = detectBlock(response, body);

        expect(result.blocked).toBe(false);
      });

      it('should not flag normal HTML content', () => {
        const response = createMockResponse(200);
        const body = `
          <html>
          <head><title>Welcome to Example.com</title></head>
          <body>
            <h1>Hello World</h1>
            <p>This is a normal page with no blocking content.</p>
          </body>
          </html>
        `;
        const result = detectBlock(response, body);

        expect(result.blocked).toBe(false);
      });

      it('should not flag rate limiter hints in normal app content', () => {
        const response = createMockResponse(200);
        const body = 'Current status: rate-limiter approaching threshold for ip 203.0.113.10';

        const result = detectBlock(response, body);

        expect(result.blocked).toBe(false);
      });

      it('should not flag CDN host names like akamaihd as blocked', () => {
        const response = createMockResponse(200);
        const body = '<html><script src="https://examplecdn.akamaihd.net/widget.js"></script></html>';

        const result = detectBlock(response, body);

        expect(result.blocked).toBe(false);
      });

      it('should not flag large bodies as blocked', () => {
        const response = createMockResponse(200);
        // Create a large body (over 100KB) with "blocked" somewhere in it
        const body = 'x'.repeat(150000) + 'blocked' + 'y'.repeat(50000);
        const result = detectBlock(response, body);

        // The body should be truncated, and this shouldn't trigger a block
        // because the word "blocked" is past the 100KB check limit
        expect(result.blocked).toBe(false);
      });
    });

    describe('confidence levels', () => {
      it('should return highest confidence match', () => {
        const response = createMockResponse(403, {
          'cf-ray': 'abc123',
        });
        const body = 'Checking your browser before accessing the website. Please wait...';
        const result = detectBlock(response, body);

        // Should pick cloudflare body pattern (0.95) over status (0.6)
        expect(result.confidence).toBeGreaterThan(0.9);
        expect(result.reason).toBe('cloudflare');
      });
    });
  });

  describe('isProtectedDomain', () => {
    it('should identify common protected domains', () => {
      expect(isProtectedDomain('www.linkedin.com')).toBe(true);
      expect(isProtectedDomain('twitter.com')).toBe(true);
      expect(isProtectedDomain('x.com')).toBe(true);
      expect(isProtectedDomain('instagram.com')).toBe(true);
      expect(isProtectedDomain('facebook.com')).toBe(true);
      expect(isProtectedDomain('amazon.com')).toBe(true);
      expect(isProtectedDomain('google.com')).toBe(true);
      expect(isProtectedDomain('microsoft.com')).toBe(true);
    });

    it('should identify government domains', () => {
      expect(isProtectedDomain('whitehouse.gov')).toBe(true);
      expect(isProtectedDomain('irs.gov')).toBe(true);
    });

    it('should not flag unprotected domains', () => {
      expect(isProtectedDomain('example.com')).toBe(false);
      expect(isProtectedDomain('mysite.org')).toBe(false);
      expect(isProtectedDomain('localhost')).toBe(false);
    });
  });

  describe('isCloudflareChallenge', () => {
    it('should detect Cloudflare challenge with cf-ray and 403', () => {
      const response = createMockResponse(403, { 'cf-ray': 'abc123' });
      const body = 'Just a moment... Checking your browser.';

      expect(isCloudflareChallenge(response, body)).toBe(true);
    });

    it('should detect Cloudflare challenge with cf-ray and 503', () => {
      const response = createMockResponse(503, { 'cf-ray': 'abc123' });
      // Body must match patterns: "checking your browser", "just a moment", or "cf-browser-verification"
      const body = 'Just a moment... Checking your browser before accessing the website.';

      expect(isCloudflareChallenge(response, body)).toBe(true);
    });

    it('should return false without cf-ray header', () => {
      const response = createMockResponse(403);
      const body = 'Just a moment... Checking your browser.';

      expect(isCloudflareChallenge(response, body)).toBe(false);
    });

    it('should return false for normal 200 response with cf-ray', () => {
      const response = createMockResponse(200, { 'cf-ray': 'abc123' });
      const body = 'Normal page content';

      expect(isCloudflareChallenge(response, body)).toBe(false);
    });

    it('should return false without challenge markers in body', () => {
      const response = createMockResponse(403, { 'cf-ray': 'abc123' });
      const body = 'Access denied - different error page';

      expect(isCloudflareChallenge(response, body)).toBe(false);
    });
  });
});

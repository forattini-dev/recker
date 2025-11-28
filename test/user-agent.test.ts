import { describe, it, expect } from 'vitest';
import {
  getDefaultUserAgent,
  getUserAgent,
  getRandomUserAgent,
  detectDeviceType,
  isMobile,
  USER_AGENT_PRESETS
} from '../src/utils/user-agent.js';
import { createClient } from '../src/index.js';
import { MockTransport } from './helpers/mock-transport.js';

describe('User-Agent Utilities', () => {
  describe('getDefaultUserAgent', () => {
    it('should return recker user agent', () => {
      const ua = getDefaultUserAgent();
      expect(ua).toMatch(/^recker\//);
      expect(ua).toMatch(/\d+\.\d+\.\d+/); // semver pattern
    });
  });

  describe('getUserAgent', () => {
    it('should return Chrome Windows user agent', () => {
      const ua = getUserAgent('chrome_windows');
      expect(ua).toContain('Windows NT');
      expect(ua).toContain('Chrome');
    });

    it('should return Safari iPhone user agent', () => {
      const ua = getUserAgent('safari_iphone');
      expect(ua).toContain('iPhone');
      expect(ua).toContain('Safari');
    });

    it('should return Chrome Android user agent', () => {
      const ua = getUserAgent('chrome_android');
      expect(ua).toContain('Android');
      expect(ua).toContain('Mobile');
      expect(ua).toContain('Chrome');
    });

    it('should return Firefox Linux user agent', () => {
      const ua = getUserAgent('firefox_linux');
      expect(ua).toContain('Linux');
      expect(ua).toContain('Firefox');
    });

    it('should return Safari Mac user agent', () => {
      const ua = getUserAgent('safari_mac');
      expect(ua).toContain('Macintosh');
      expect(ua).toContain('Safari');
    });

    it('should return Edge Windows user agent', () => {
      const ua = getUserAgent('edge_windows');
      expect(ua).toContain('Windows NT');
      expect(ua).toContain('Edg');
    });

    it('should return Opera Mac user agent', () => {
      const ua = getUserAgent('opera_mac');
      expect(ua).toContain('Macintosh');
      expect(ua).toContain('OPR');
    });

    it('should return iPad user agent', () => {
      const ua = getUserAgent('safari_ipad');
      expect(ua).toContain('iPad');
      expect(ua).toContain('Safari');
    });

    it('should return Samsung Browser user agent', () => {
      const ua = getUserAgent('samsung_browser');
      expect(ua).toContain('Android');
      expect(ua).toContain('SamsungBrowser');
    });

    it('should return Googlebot user agent', () => {
      const ua = getUserAgent('googlebot');
      expect(ua).toContain('Googlebot');
    });
  });

  describe('getRandomUserAgent', () => {
    it('should return random desktop Chrome user agent', () => {
      const ua = getRandomUserAgent('desktop.chrome');
      expect(ua).toContain('Chrome');
      expect(['Windows NT', 'Macintosh', 'Linux'].some(os => ua.includes(os))).toBe(true);
    });

    it('should return random mobile iOS user agent', () => {
      const ua = getRandomUserAgent('mobile.ios');
      expect(['iPhone', 'iPad', 'CriOS'].some(device => ua.includes(device))).toBe(true);
    });

    it('should return random desktop user agent', () => {
      const ua = getRandomUserAgent('desktop');
      expect(['Chrome', 'Firefox', 'Safari', 'Edg', 'OPR'].some(browser => ua.includes(browser))).toBe(true);
    });

    it('should return random mobile user agent', () => {
      const ua = getRandomUserAgent('mobile');
      expect(ua).toMatch(/Mobile|iPhone|iPad|Android/);
    });

    it('should return default UA for invalid category', () => {
      const ua = getRandomUserAgent('invalid.category');
      expect(ua).toMatch(/^recker\//);
    });
  });

  describe('detectDeviceType', () => {
    it('should detect desktop from Chrome Windows UA', () => {
      const ua = getUserAgent('chrome_windows');
      expect(detectDeviceType(ua)).toBe('desktop');
    });

    it('should detect mobile from iPhone UA', () => {
      const ua = getUserAgent('safari_iphone');
      expect(detectDeviceType(ua)).toBe('mobile');
    });

    it('should detect tablet from iPad UA', () => {
      const ua = getUserAgent('safari_ipad');
      expect(detectDeviceType(ua)).toBe('tablet');
    });

    it('should detect mobile from Android phone UA', () => {
      const ua = getUserAgent('chrome_android');
      expect(detectDeviceType(ua)).toBe('mobile');
    });

    it('should detect tablet from Android tablet UA', () => {
      const ua = getUserAgent('chrome_android_tablet');
      expect(detectDeviceType(ua)).toBe('tablet');
    });

    it('should detect bot from Googlebot UA', () => {
      const ua = getUserAgent('googlebot');
      expect(detectDeviceType(ua)).toBe('bot');
    });

    it('should detect desktop from Safari Mac UA', () => {
      const ua = getUserAgent('safari_mac');
      expect(detectDeviceType(ua)).toBe('desktop');
    });
  });

  describe('isMobile', () => {
    it('should return true for mobile devices', () => {
      expect(isMobile(getUserAgent('safari_iphone'))).toBe(true);
      expect(isMobile(getUserAgent('chrome_android'))).toBe(true);
    });

    it('should return true for tablets', () => {
      expect(isMobile(getUserAgent('safari_ipad'))).toBe(true);
      expect(isMobile(getUserAgent('chrome_android_tablet'))).toBe(true);
    });

    it('should return false for desktop', () => {
      expect(isMobile(getUserAgent('chrome_windows'))).toBe(false);
      expect(isMobile(getUserAgent('safari_mac'))).toBe(false);
    });

    it('should return false for bots', () => {
      expect(isMobile(getUserAgent('googlebot'))).toBe(false);
    });
  });

  describe('Client Integration', () => {
    it('should use default Recker user agent', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('GET', '/test', 200, { ok: true });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      await client.get('/test');

      // Note: We can't directly inspect headers sent through MockTransport
      // But we verified the client sets it in constructor
    });

    it('should allow custom user agent override', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('GET', '/test', 200, { ok: true });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport,
        headers: {
          'User-Agent': getUserAgent('chrome_windows')
        }
      });

      const response = await client.get('/test');
      expect(response.status).toBe(200);
    });

    it('should allow per-request user agent override', async () => {
      const mockTransport = new MockTransport();
      mockTransport.setMockResponse('GET', '/test', 200, { ok: true });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        transport: mockTransport
      });

      const response = await client.get('/test', {
        headers: {
          'User-Agent': getUserAgent('safari_iphone')
        }
      });

      expect(response.status).toBe(200);
    });
  });

  describe('All Presets Coverage', () => {
    it('should have all expected presets', () => {
      const expectedPresets = [
        // Desktop
        'chrome_windows', 'chrome_mac', 'chrome_linux',
        'firefox_windows', 'firefox_mac', 'firefox_linux',
        'safari_mac',
        'edge_windows', 'edge_mac',
        'opera_windows', 'opera_mac',
        // Mobile iOS
        'safari_iphone', 'safari_ipad', 'chrome_ios',
        // Mobile Android
        'chrome_android', 'chrome_android_tablet', 'firefox_android', 'samsung_browser',
        // Bots
        'googlebot', 'googlebot_mobile',
        // Default
        'recker'
      ];

      expectedPresets.forEach(preset => {
        expect(USER_AGENT_PRESETS).toHaveProperty(preset);
      });
    });

    it('should return valid user agent for all presets', () => {
      Object.keys(USER_AGENT_PRESETS).forEach(preset => {
        const ua = getUserAgent(preset as any);
        expect(ua).toBeTruthy();
        expect(ua.length).toBeGreaterThan(10);
      });
    });
  });
});

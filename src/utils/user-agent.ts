/**
 * User Agent utilities for Recker HTTP Client
 * Provides default Recker user agent and browser/device simulation
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Get package version dynamically
let RECKER_VERSION = '1.0.0';
try {
  const pkgPath = join(process.cwd(), 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  if (pkg.name === 'recker' && pkg.version) {
    RECKER_VERSION = pkg.version;
  }
} catch {
  // Fallback to default version
}

/**
 * Default Recker User-Agent
 */
export function getDefaultUserAgent(): string {
  return `recker/${RECKER_VERSION}`;
}

/**
 * User Agent presets for browser/device simulation
 * Updated for 2026 with modern browser versions
 */
export const USER_AGENT_PRESETS = {
  // Desktop Browsers
  chrome_windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  chrome_mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10157) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  chrome_linux: 'Mozilla/5.0 (X11; Linux x8664) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

  firefox_windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  firefox_mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  firefox_linux: 'Mozilla/5.0 (X11; Linux x8664; rv:121.0) Gecko/20100101 Firefox/121.0',

  safari_mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10157) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',

  edge_windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  edge_mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10157) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',

  opera_windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/105.0.0.0',
  opera_mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10157) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/105.0.0.0',

  // Mobile - iOS
  safari_iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 170 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  safari_ipad: 'Mozilla/5.0 (iPad; CPU OS 170 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  chrome_ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 170 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1',

  // Mobile - Android
  chrome_android: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
  chrome_android_tablet: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Safari/537.36',
  firefox_android: 'Mozilla/5.0 (Android 14; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0',
  samsung_browser: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',

  // Bots & Crawlers
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  googlebot_mobile: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',

  // Default Recker
  recker: getDefaultUserAgent(),
} as const;

export type UserAgentPreset = keyof typeof USER_AGENT_PRESETS;

/**
 * Get a simulated user agent string
 *
 * @example
 * ```typescript
 * const ua = getUserAgent('chrome_windows');
 * const ua = getUserAgent('safari_iphone');
 * ```
 */
export function getUserAgent(preset: UserAgentPreset): string {
  return USER_AGENT_PRESETS[preset];
}

/**
 * User agent categories for easier selection
 */
export const USER_AGENT_CATEGORIES = {
  desktop: {
    chrome: ['chrome_windows', 'chrome_mac', 'chrome_linux'],
    firefox: ['firefox_windows', 'firefox_mac', 'firefox_linux'],
    safari: ['safari_mac'],
    edge: ['edge_windows', 'edge_mac'],
    opera: ['opera_windows', 'opera_mac'],
  },
  mobile: {
    ios: ['safari_iphone', 'safari_ipad', 'chrome_ios'],
    android: ['chrome_android', 'chrome_android_tablet', 'firefox_android', 'samsung_browser'],
  },
  bot: ['googlebot', 'googlebot_mobile'],
  default: ['recker'],
} as const;

/**
 * Get a random user agent from a category
 *
 * @example
 * ```typescript
 * const ua = getRandomUserAgent('desktop.chrome');
 * const ua = getRandomUserAgent('mobile.ios');
 * ```
 */
export function getRandomUserAgent(category: string): string {
  const parts = category.split('.');
  let presets: readonly string[] = [];

  if (parts.length === 1) {
    // Top-level category (desktop, mobile, bot)
    const cat = USER_AGENT_CATEGORIES[parts[0] as keyof typeof USER_AGENT_CATEGORIES];
    if (Array.isArray(cat)) {
      presets = cat;
    } else if (typeof cat === 'object') {
      presets = Object.values(cat).flat();
    }
  } else if (parts.length === 2) {
    // Subcategory (desktop.chrome, mobile.ios)
    const cat = USER_AGENT_CATEGORIES[parts[0] as keyof typeof USER_AGENT_CATEGORIES];
    if (typeof cat === 'object' && parts[1] in cat) {
      presets = cat[parts[1] as keyof typeof cat] as readonly string[];
    }
  }

  if (presets.length === 0) {
    return getDefaultUserAgent();
  }

  const randomIndex = Math.floor(Math.random() * presets.length);
  return getUserAgent(presets[randomIndex] as UserAgentPreset);
}

/**
 * Parse user agent to detect device type
 */
export function detectDeviceType(userAgent: string): 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown' {
  const ua = userAgent.toLowerCase();

  if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) {
    return 'bot';
  }

  // Check for tablets BEFORE mobile (iPad has "Mobile" in UA)
  if (ua.includes('ipad') || (ua.includes('tablet')) || (ua.includes('android') && !ua.includes('mobile'))) {
    return 'tablet';
  }

  if (ua.includes('mobile') || ua.includes('iphone')) {
    return 'mobile';
  }

  if (ua.includes('windows') || ua.includes('macintosh') || (ua.includes('linux') && !ua.includes('android'))) {
    return 'desktop';
  }

  return 'unknown';
}

/**
 * Check if user agent is mobile
 */
export function isMobile(userAgent: string): boolean {
  const type = detectDeviceType(userAgent);
  return type === 'mobile' || type === 'tablet';
}

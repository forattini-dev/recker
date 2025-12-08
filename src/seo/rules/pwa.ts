/**
 * SEO PWA (Progressive Web App) Rules
 * Rules for web app manifest, service worker hints, and installability
 */

import { SeoRule, createResult } from './types.js';

export const pwaRules: SeoRule[] = [
  {
    id: 'pwa-manifest-link',
    name: 'Web App Manifest',
    category: 'technical',
    severity: 'info',
    description: 'Pages should link to a web app manifest for PWA support',
    check: (ctx) => {
      if (ctx.hasManifest === undefined) return null;

      if (!ctx.hasManifest) {
        return createResult(
          { id: 'pwa-manifest-link', name: 'Web App Manifest', category: 'technical', severity: 'info' },
          'info',
          'No web app manifest linked',
          {
            recommendation: 'Add a manifest.json for PWA installability',
            evidence: {
              expected: '<link rel="manifest" href="/manifest.json">',
              impact: 'Required for "Add to Home Screen" and PWA features',
              learnMore: 'https://web.dev/add-manifest/',
            },
          }
        );
      }

      return createResult(
        { id: 'pwa-manifest-link', name: 'Web App Manifest', category: 'technical', severity: 'info' },
        'pass',
        `Manifest linked${ctx.manifestUrl ? `: ${ctx.manifestUrl}` : ''}`
      );
    },
  },
  {
    id: 'pwa-theme-color',
    name: 'Theme Color',
    category: 'mobile',
    severity: 'info',
    description: 'Pages should define a theme color for browser UI',
    check: (ctx) => {
      if (ctx.themeColor === undefined) return null;

      if (!ctx.themeColor) {
        return createResult(
          { id: 'pwa-theme-color', name: 'Theme Color', category: 'mobile', severity: 'info' },
          'info',
          'No theme-color meta tag',
          {
            recommendation: 'Add theme-color for browser UI customization',
            evidence: {
              expected: '<meta name="theme-color" content="#4285f4">',
              impact: 'Controls browser toolbar color on mobile devices',
            },
          }
        );
      }

      return createResult(
        { id: 'pwa-theme-color', name: 'Theme Color', category: 'mobile', severity: 'info' },
        'pass',
        `Theme color: ${ctx.themeColor}`
      );
    },
  },
  {
    id: 'pwa-apple-touch-icon',
    name: 'Apple Touch Icon',
    category: 'mobile',
    severity: 'info',
    description: 'iOS devices need apple-touch-icon for home screen',
    check: (ctx) => {
      if (ctx.hasAppleTouchIcon === undefined) return null;

      if (!ctx.hasAppleTouchIcon) {
        return createResult(
          { id: 'pwa-apple-touch-icon', name: 'Apple Touch Icon', category: 'mobile', severity: 'info' },
          'info',
          'No apple-touch-icon found',
          {
            recommendation: 'Add apple-touch-icon for iOS home screen',
            evidence: {
              expected: '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
              impact: 'iOS uses this icon when user adds site to home screen',
              example: 'Recommended size: 180x180 pixels',
            },
          }
        );
      }

      return createResult(
        { id: 'pwa-apple-touch-icon', name: 'Apple Touch Icon', category: 'mobile', severity: 'info' },
        'pass',
        'Apple touch icon present'
      );
    },
  },
  {
    id: 'pwa-apple-mobile-capable',
    name: 'Apple Mobile Web App',
    category: 'mobile',
    severity: 'info',
    description: 'Enable standalone mode on iOS devices',
    check: (ctx) => {
      if (ctx.hasAppleMobileWebAppCapable === undefined) return null;

      if (!ctx.hasAppleMobileWebAppCapable) {
        return createResult(
          { id: 'pwa-apple-mobile-capable', name: 'Apple Mobile Web App', category: 'mobile', severity: 'info' },
          'info',
          'No apple-mobile-web-app-capable meta tag',
          {
            recommendation: 'Add for full-screen iOS experience',
            evidence: {
              expected: '<meta name="apple-mobile-web-app-capable" content="yes">',
              impact: 'Enables standalone app mode when launched from home screen',
            },
          }
        );
      }

      return createResult(
        { id: 'pwa-apple-mobile-capable', name: 'Apple Mobile Web App', category: 'mobile', severity: 'info' },
        'pass',
        'Apple mobile web app capable enabled'
      );
    },
  },
  {
    id: 'pwa-apple-status-bar',
    name: 'Apple Status Bar Style',
    category: 'mobile',
    severity: 'info',
    description: 'Configure iOS status bar appearance',
    check: (ctx) => {
      if (!ctx.hasAppleMobileWebAppCapable) return null;
      if (ctx.appleStatusBarStyle === undefined) return null;

      if (!ctx.appleStatusBarStyle) {
        return createResult(
          { id: 'pwa-apple-status-bar', name: 'Apple Status Bar Style', category: 'mobile', severity: 'info' },
          'info',
          'No apple-mobile-web-app-status-bar-style defined',
          {
            recommendation: 'Define status bar style for iOS',
            evidence: {
              expected: '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
              example: 'Options: default, black, black-translucent',
            },
          }
        );
      }

      return createResult(
        { id: 'pwa-apple-status-bar', name: 'Apple Status Bar Style', category: 'mobile', severity: 'info' },
        'pass',
        `Status bar style: ${ctx.appleStatusBarStyle}`
      );
    },
  },
  {
    id: 'pwa-maskable-icon',
    name: 'Maskable Icon',
    category: 'mobile',
    severity: 'info',
    description: 'Manifest should include maskable icons for Android',
    check: (ctx) => {
      if (ctx.hasMaskableIcon === undefined) return null;

      if (!ctx.hasMaskableIcon) {
        return createResult(
          { id: 'pwa-maskable-icon', name: 'Maskable Icon', category: 'mobile', severity: 'info' },
          'info',
          'No maskable icon in manifest',
          {
            recommendation: 'Add maskable icon for adaptive icons on Android',
            evidence: {
              example: `{
  "icons": [{
    "src": "/icon-maskable.png",
    "sizes": "512x512",
    "type": "image/png",
    "purpose": "maskable"
  }]
}`,
              impact: 'Maskable icons adapt to different Android icon shapes',
              learnMore: 'https://web.dev/maskable-icon/',
            },
          }
        );
      }

      return createResult(
        { id: 'pwa-maskable-icon', name: 'Maskable Icon', category: 'mobile', severity: 'info' },
        'pass',
        'Maskable icon defined'
      );
    },
  },
  {
    id: 'pwa-start-url',
    name: 'Start URL',
    category: 'technical',
    severity: 'info',
    description: 'Manifest should define a start_url',
    check: (ctx) => {
      if (!ctx.hasManifest) return null;
      if (ctx.manifestStartUrl === undefined) return null;

      if (!ctx.manifestStartUrl) {
        return createResult(
          { id: 'pwa-start-url', name: 'Start URL', category: 'technical', severity: 'info' },
          'info',
          'Manifest missing start_url',
          {
            recommendation: 'Define start_url in manifest for PWA launch',
            evidence: {
              expected: '"start_url": "/?source=pwa"',
              impact: 'Controls which page opens when PWA is launched',
            },
          }
        );
      }

      return createResult(
        { id: 'pwa-start-url', name: 'Start URL', category: 'technical', severity: 'info' },
        'pass',
        `Start URL: ${ctx.manifestStartUrl}`
      );
    },
  },
  {
    id: 'pwa-display-mode',
    name: 'Display Mode',
    category: 'technical',
    severity: 'info',
    description: 'Manifest should define display mode',
    check: (ctx) => {
      if (!ctx.hasManifest) return null;
      if (ctx.manifestDisplay === undefined) return null;

      const display = ctx.manifestDisplay;

      if (!display) {
        return createResult(
          { id: 'pwa-display-mode', name: 'Display Mode', category: 'technical', severity: 'info' },
          'info',
          'Manifest missing display mode',
          {
            recommendation: 'Set display mode for app-like experience',
            evidence: {
              expected: '"display": "standalone"',
              example: 'Options: fullscreen, standalone, minimal-ui, browser',
            },
          }
        );
      }

      const goodModes = ['standalone', 'fullscreen', 'minimal-ui'];
      if (!goodModes.includes(display)) {
        return createResult(
          { id: 'pwa-display-mode', name: 'Display Mode', category: 'technical', severity: 'info' },
          'info',
          `Display mode: ${display} (browser-like)`,
          {
            recommendation: 'Consider standalone or fullscreen for app-like experience',
          }
        );
      }

      return createResult(
        { id: 'pwa-display-mode', name: 'Display Mode', category: 'technical', severity: 'info' },
        'pass',
        `Display mode: ${display}`
      );
    },
  },
  {
    id: 'pwa-scope',
    name: 'Navigation Scope',
    category: 'technical',
    severity: 'info',
    description: 'Manifest should define navigation scope',
    check: (ctx) => {
      if (!ctx.hasManifest) return null;
      if (ctx.manifestScope === undefined) return null;

      if (!ctx.manifestScope) {
        return createResult(
          { id: 'pwa-scope', name: 'Navigation Scope', category: 'technical', severity: 'info' },
          'info',
          'Manifest missing scope',
          {
            recommendation: 'Define scope to control PWA navigation boundaries',
            evidence: {
              expected: '"scope": "/"',
              impact: 'Limits which URLs are part of the app experience',
            },
          }
        );
      }

      return createResult(
        { id: 'pwa-scope', name: 'Navigation Scope', category: 'technical', severity: 'info' },
        'pass',
        `Scope: ${ctx.manifestScope}`
      );
    },
  },
  {
    id: 'pwa-icons-sizes',
    name: 'Icon Sizes',
    category: 'mobile',
    severity: 'info',
    description: 'Manifest should include multiple icon sizes',
    check: (ctx) => {
      if (!ctx.hasManifest) return null;
      if (ctx.manifestIconSizes === undefined) return null;

      const sizes = ctx.manifestIconSizes;
      const requiredSizes = [192, 512];
      const missingSizes = requiredSizes.filter(s => !sizes.includes(s));

      if (missingSizes.length > 0) {
        return createResult(
          { id: 'pwa-icons-sizes', name: 'Icon Sizes', category: 'mobile', severity: 'info' },
          'info',
          `Missing icon sizes: ${missingSizes.join(', ')}px`,
          {
            recommendation: 'Add icons in required sizes',
            evidence: {
              found: sizes.length > 0 ? sizes.map(s => `${s}px`).join(', ') : 'No icons',
              expected: '192x192 and 512x512 minimum',
              impact: 'Required for Chrome "Add to Home Screen" prompt',
            },
          }
        );
      }

      return createResult(
        { id: 'pwa-icons-sizes', name: 'Icon Sizes', category: 'mobile', severity: 'info' },
        'pass',
        `Icon sizes: ${sizes.map(s => `${s}px`).join(', ')}`
      );
    },
  },
  {
    id: 'pwa-short-name',
    name: 'Short Name',
    category: 'technical',
    severity: 'info',
    description: 'Manifest should have a short_name for home screen',
    check: (ctx) => {
      if (!ctx.hasManifest) return null;
      if (ctx.manifestShortName === undefined && ctx.manifestName === undefined) return null;

      const shortName = ctx.manifestShortName;
      const name = ctx.manifestName;

      if (!shortName && !name) {
        return createResult(
          { id: 'pwa-short-name', name: 'Short Name', category: 'technical', severity: 'info' },
          'info',
          'Manifest missing name and short_name',
          {
            recommendation: 'Add short_name (max 12 chars) for home screen label',
            evidence: {
              expected: '"short_name": "MyApp"',
              impact: 'Used as app label on home screen',
            },
          }
        );
      }

      if (shortName && shortName.length > 12) {
        return createResult(
          { id: 'pwa-short-name', name: 'Short Name', category: 'technical', severity: 'info' },
          'info',
          `Short name too long: ${shortName.length} chars`,
          {
            recommendation: 'Keep short_name under 12 characters',
            evidence: {
              found: shortName,
              expected: 'Max 12 characters',
              impact: 'May be truncated on home screen',
            },
          }
        );
      }

      return createResult(
        { id: 'pwa-short-name', name: 'Short Name', category: 'technical', severity: 'info' },
        'pass',
        `App name: ${shortName || name}`
      );
    },
  },
  {
    id: 'pwa-background-color',
    name: 'Background Color',
    category: 'mobile',
    severity: 'info',
    description: 'Manifest should define background_color for splash screen',
    check: (ctx) => {
      if (!ctx.hasManifest) return null;
      if (ctx.manifestBackgroundColor === undefined) return null;

      if (!ctx.manifestBackgroundColor) {
        return createResult(
          { id: 'pwa-background-color', name: 'Background Color', category: 'mobile', severity: 'info' },
          'info',
          'Manifest missing background_color',
          {
            recommendation: 'Define background_color for splash screen',
            evidence: {
              expected: '"background_color": "#ffffff"',
              impact: 'Shown as splash screen background during app launch',
            },
          }
        );
      }

      return createResult(
        { id: 'pwa-background-color', name: 'Background Color', category: 'mobile', severity: 'info' },
        'pass',
        `Background color: ${ctx.manifestBackgroundColor}`
      );
    },
  },
];

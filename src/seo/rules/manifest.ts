/**
 * SEO Manifest Rules
 * Comprehensive validation for web app manifest (manifest.json / site.webmanifest)
 * Covers installability, discoverability, and SEO best practices.
 */

import { SeoRule, createResult, RuleContext } from './types.js';

/**
 * Helper to check if color is valid hex or named color
 */
function isValidColor(color: string): boolean {
  if (!color) return false;
  // Check hex format
  if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(color)) return true;
  // Check rgb/rgba/hsl/hsla format
  if (/^(rgb|rgba|hsl|hsla)\(/.test(color)) return true;
  // Named colors (basic check)
  const namedColors = [
    'black', 'white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta',
    'gray', 'grey', 'orange', 'purple', 'pink', 'brown', 'transparent'
  ];
  return namedColors.includes(color.toLowerCase());
}

export const manifestRules: SeoRule[] = [
  // ==========================================================================
  // Manifest Existence & Structure
  // ==========================================================================
  {
    id: 'manifest-exists',
    name: 'Manifest File',
    category: 'technical',
    severity: 'warning',
    description: 'A web app manifest file is required for PWA installability and better SEO',
    check: (ctx) => {
      if (!ctx.hasManifest) {
        return createResult(
          { id: 'manifest-exists', name: 'Manifest File', category: 'technical', severity: 'warning' },
          'warn',
          'No web app manifest found',
          {
            recommendation: 'Create a manifest.json or site.webmanifest file and link it in your HTML.',
            evidence: {
              expected: '<link rel="manifest" href="/manifest.json">',
              impact: 'Without a manifest, your site cannot be installed as a PWA. Google uses manifest data for app indexing and rich results. It also enables "Add to Home Screen" on mobile devices.',
              example: `{
  "name": "My App",
  "short_name": "App",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#4285f4",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}`,
              learnMore: 'https://web.dev/articles/add-manifest'
            }
          }
        );
      }
      return createResult(
        { id: 'manifest-exists', name: 'Manifest File', category: 'technical', severity: 'warning' },
        'pass',
        'Web app manifest is linked',
        { value: ctx.manifestUrl }
      );
    },
  },

  // ==========================================================================
  // Name Fields
  // ==========================================================================
  {
    id: 'manifest-name',
    name: 'Manifest Name',
    category: 'technical',
    severity: 'warning',
    description: 'Manifest must have a name field for proper identification',
    check: (ctx) => {
      if (!ctx.hasManifest) {
        return createResult(
          { id: 'manifest-name', name: 'Manifest Name', category: 'technical', severity: 'warning' },
          'info',
          'Not applicable (no manifest)',
          { recommendation: 'First add a web app manifest' }
        );
      }

      if (!ctx.manifestName) {
        return createResult(
          { id: 'manifest-name', name: 'Manifest Name', category: 'technical', severity: 'warning' },
          'warn',
          'Manifest missing name field',
          {
            recommendation: 'Add a name field to your manifest.',
            evidence: {
              expected: '"name": "Your Application Name"',
              impact: 'The name is displayed in app stores, install prompts, and splash screens. Without it, browsers may use the page title or leave it blank.',
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/Manifest/name'
            }
          }
        );
      }

      // Check name length (recommended max 45 chars)
      if (ctx.manifestName.length > 45) {
        return createResult(
          { id: 'manifest-name', name: 'Manifest Name', category: 'technical', severity: 'warning' },
          'warn',
          `Manifest name too long: ${ctx.manifestName.length} characters`,
          {
            value: ctx.manifestName,
            recommendation: 'Keep the name under 45 characters.',
            evidence: {
              found: `${ctx.manifestName.length} characters`,
              expected: 'Maximum 45 characters',
              impact: 'Long names may be truncated in install prompts and app launchers.'
            }
          }
        );
      }

      return createResult(
        { id: 'manifest-name', name: 'Manifest Name', category: 'technical', severity: 'warning' },
        'pass',
        `Manifest name: ${ctx.manifestName}`
      );
    },
  },
  {
    id: 'manifest-short-name',
    name: 'Manifest Short Name',
    category: 'technical',
    severity: 'info',
    description: 'short_name is used when name is too long for the display context',
    check: (ctx) => {
      if (!ctx.hasManifest) {
        return createResult(
          { id: 'manifest-short-name', name: 'Manifest Short Name', category: 'technical', severity: 'info' },
          'info',
          'Not applicable (no manifest)',
          { recommendation: 'First add a web app manifest' }
        );
      }

      if (!ctx.manifestShortName && !ctx.manifestName) {
        return createResult(
          { id: 'manifest-short-name', name: 'Manifest Short Name', category: 'technical', severity: 'info' },
          'warn',
          'Manifest missing both name and short_name',
          {
            recommendation: 'Add at least a name field, preferably also short_name.',
            evidence: {
              expected: '"short_name": "App" (max 12 chars)',
              impact: 'Without any name, your app will appear unnamed in launchers and install prompts.'
            }
          }
        );
      }

      if (ctx.manifestShortName && ctx.manifestShortName.length > 12) {
        return createResult(
          { id: 'manifest-short-name', name: 'Manifest Short Name', category: 'technical', severity: 'info' },
          'info',
          `Short name exceeds 12 characters: "${ctx.manifestShortName}"`,
          {
            value: ctx.manifestShortName,
            recommendation: 'Keep short_name under 12 characters to avoid truncation.',
            evidence: {
              found: `${ctx.manifestShortName.length} characters`,
              expected: 'Maximum 12 characters',
              impact: 'Home screen labels are limited to about 12 characters. Longer names will be cut off.'
            }
          }
        );
      }

      return createResult(
        { id: 'manifest-short-name', name: 'Manifest Short Name', category: 'technical', severity: 'info' },
        'pass',
        ctx.manifestShortName ? `Short name: ${ctx.manifestShortName}` : 'Using full name (no short_name defined)'
      );
    },
  },

  // ==========================================================================
  // Description
  // ==========================================================================
  {
    id: 'manifest-description',
    name: 'Manifest Description',
    category: 'technical',
    severity: 'info',
    description: 'Adding a description helps with app store listings and discoverability',
    check: (ctx) => {
      if (!ctx.hasManifest) {
        return createResult(
          { id: 'manifest-description', name: 'Manifest Description', category: 'technical', severity: 'info' },
          'info',
          'Not applicable (no manifest)',
          { recommendation: 'First add a web app manifest' }
        );
      }

      if (!ctx.manifestDescription) {
        return createResult(
          { id: 'manifest-description', name: 'Manifest Description', category: 'technical', severity: 'info' },
          'info',
          'Manifest missing description field',
          {
            recommendation: 'Add a description to improve app store presence.',
            evidence: {
              expected: '"description": "A brief description of your application"',
              impact: 'The description may appear in app stores, search results, and install prompts. It helps users understand what your app does.',
              example: '"description": "Track your daily tasks and stay productive with our simple to-do app."',
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/Manifest/description'
            }
          }
        );
      }

      return createResult(
        { id: 'manifest-description', name: 'Manifest Description', category: 'technical', severity: 'info' },
        'pass',
        'Manifest has description',
        { value: ctx.manifestDescription }
      );
    },
  },

  // ==========================================================================
  // Icons
  // ==========================================================================
  {
    id: 'manifest-icons-required',
    name: 'Required Icons',
    category: 'mobile',
    severity: 'warning',
    description: 'Manifest must include 192x192 and 512x512 icons for PWA installability',
    check: (ctx) => {
      if (!ctx.hasManifest) {
        return createResult(
          { id: 'manifest-icons-required', name: 'Required Icons', category: 'mobile', severity: 'warning' },
          'info',
          'Not applicable (no manifest)',
          { recommendation: 'First add a web app manifest' }
        );
      }

      const sizes = ctx.manifestIconSizes || [];
      const missing: number[] = [];
      if (!sizes.includes(192)) missing.push(192);
      if (!sizes.includes(512)) missing.push(512);

      if (missing.length > 0) {
        return createResult(
          { id: 'manifest-icons-required', name: 'Required Icons', category: 'mobile', severity: 'warning' },
          'warn',
          `Missing required icon sizes: ${missing.map(s => `${s}x${s}`).join(', ')}`,
          {
            recommendation: 'Add icons in 192x192 and 512x512 sizes.',
            evidence: {
              found: sizes.length > 0 ? sizes.map(s => `${s}x${s}`).join(', ') : 'No icons',
              expected: '192x192 and 512x512 (minimum)',
              impact: 'Chrome requires 192x192 and 512x512 icons to show the "Add to Home Screen" prompt. Without these, your PWA cannot be installed.',
              example: `"icons": [
  { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
  { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
]`,
              learnMore: 'https://web.dev/articles/install-criteria'
            }
          }
        );
      }

      return createResult(
        { id: 'manifest-icons-required', name: 'Required Icons', category: 'mobile', severity: 'warning' },
        'pass',
        `Icons present: ${sizes.map(s => `${s}x${s}`).join(', ')}`
      );
    },
  },
  {
    id: 'manifest-maskable-icon',
    name: 'Maskable Icon',
    category: 'mobile',
    severity: 'info',
    description: 'Maskable icons adapt to different icon shapes on Android',
    check: (ctx) => {
      if (!ctx.hasManifest) {
        return createResult(
          { id: 'manifest-maskable-icon', name: 'Maskable Icon', category: 'mobile', severity: 'info' },
          'info',
          'Not applicable (no manifest)',
          { recommendation: 'First add a web app manifest' }
        );
      }

      if (!ctx.hasMaskableIcon) {
        return createResult(
          { id: 'manifest-maskable-icon', name: 'Maskable Icon', category: 'mobile', severity: 'info' },
          'info',
          'No maskable icon defined',
          {
            recommendation: 'Add a maskable icon for better Android integration.',
            evidence: {
              expected: 'An icon with "purpose": "maskable" or "purpose": "any maskable"',
              impact: 'Android devices use different icon shapes (circle, rounded square, squircle). Maskable icons ensure your icon looks good in all shapes without being cropped badly.',
              example: `{
  "src": "/icons/icon-maskable.png",
  "sizes": "512x512",
  "type": "image/png",
  "purpose": "maskable"
}`,
              learnMore: 'https://web.dev/articles/maskable-icon'
            }
          }
        );
      }

      return createResult(
        { id: 'manifest-maskable-icon', name: 'Maskable Icon', category: 'mobile', severity: 'info' },
        'pass',
        'Maskable icon is defined'
      );
    },
  },

  // ==========================================================================
  // Display & Orientation
  // ==========================================================================
  {
    id: 'manifest-display',
    name: 'Display Mode',
    category: 'technical',
    severity: 'warning',
    description: 'Display mode determines how the app UI is presented',
    check: (ctx) => {
      if (!ctx.hasManifest) {
        return createResult(
          { id: 'manifest-display', name: 'Display Mode', category: 'technical', severity: 'warning' },
          'info',
          'Not applicable (no manifest)',
          { recommendation: 'First add a web app manifest' }
        );
      }

      const display = ctx.manifestDisplay;
      if (!display) {
        return createResult(
          { id: 'manifest-display', name: 'Display Mode', category: 'technical', severity: 'warning' },
          'warn',
          'Manifest missing display mode',
          {
            recommendation: 'Set display mode for app-like experience.',
            evidence: {
              expected: '"display": "standalone"',
              impact: 'Without display mode, the app opens in a regular browser tab. "standalone" removes browser UI for an app-like experience.',
              example: 'Options: fullscreen, standalone, minimal-ui, browser',
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/Manifest/display'
            }
          }
        );
      }

      const validModes = ['fullscreen', 'standalone', 'minimal-ui', 'browser'];
      if (!validModes.includes(display)) {
        return createResult(
          { id: 'manifest-display', name: 'Display Mode', category: 'technical', severity: 'warning' },
          'warn',
          `Invalid display mode: ${display}`,
          {
            value: display,
            recommendation: 'Use a valid display mode.',
            evidence: {
              found: display,
              expected: 'One of: fullscreen, standalone, minimal-ui, browser'
            }
          }
        );
      }

      if (display === 'browser') {
        return createResult(
          { id: 'manifest-display', name: 'Display Mode', category: 'technical', severity: 'warning' },
          'info',
          'Display mode is "browser" (no app-like experience)',
          {
            recommendation: 'Consider using "standalone" for a more app-like experience.'
          }
        );
      }

      return createResult(
        { id: 'manifest-display', name: 'Display Mode', category: 'technical', severity: 'warning' },
        'pass',
        `Display mode: ${display}`
      );
    },
  },
  {
    id: 'manifest-orientation',
    name: 'Orientation',
    category: 'mobile',
    severity: 'info',
    description: 'Define preferred screen orientation for your app',
    check: (ctx) => {
      if (!ctx.hasManifest) {
        return createResult(
          { id: 'manifest-orientation', name: 'Orientation', category: 'mobile', severity: 'info' },
          'info',
          'Not applicable (no manifest)',
          { recommendation: 'First add a web app manifest' }
        );
      }

      if (!ctx.manifestOrientation) {
        return createResult(
          { id: 'manifest-orientation', name: 'Orientation', category: 'mobile', severity: 'info' },
          'info',
          'No orientation preference set',
          {
            recommendation: 'Set orientation if your app has specific requirements.',
            evidence: {
              expected: '"orientation": "portrait" or "any"',
              impact: 'Useful for games (landscape) or reading apps (portrait). Most apps should use "any" or not specify.',
              example: 'Options: any, natural, landscape, portrait, portrait-primary, portrait-secondary, landscape-primary, landscape-secondary',
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/Manifest/orientation'
            }
          }
        );
      }

      return createResult(
        { id: 'manifest-orientation', name: 'Orientation', category: 'mobile', severity: 'info' },
        'pass',
        `Orientation: ${ctx.manifestOrientation}`
      );
    },
  },

  // ==========================================================================
  // Colors
  // ==========================================================================
  {
    id: 'manifest-theme-color',
    name: 'Theme Color',
    category: 'mobile',
    severity: 'warning',
    description: 'Theme color customizes browser UI and title bar color',
    check: (ctx) => {
      if (!ctx.hasManifest) {
        return createResult(
          { id: 'manifest-theme-color', name: 'Theme Color', category: 'mobile', severity: 'warning' },
          'info',
          'Not applicable (no manifest)',
          { recommendation: 'First add a web app manifest' }
        );
      }

      const themeColor = ctx.manifestThemeColor || ctx.themeColor;
      if (!themeColor) {
        return createResult(
          { id: 'manifest-theme-color', name: 'Theme Color', category: 'mobile', severity: 'warning' },
          'warn',
          'No theme color defined',
          {
            recommendation: 'Set theme_color in manifest and meta tag.',
            evidence: {
              expected: '"theme_color": "#4285f4"',
              impact: 'Theme color sets the browser toolbar color on mobile and the title bar in standalone mode. It should match your brand colors.',
              example: '<meta name="theme-color" content="#4285f4">\n// In manifest.json:\n"theme_color": "#4285f4"',
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/Manifest/theme_color'
            }
          }
        );
      }

      if (!isValidColor(themeColor)) {
        return createResult(
          { id: 'manifest-theme-color', name: 'Theme Color', category: 'mobile', severity: 'warning' },
          'warn',
          `Invalid theme color format: ${themeColor}`,
          {
            value: themeColor,
            recommendation: 'Use a valid CSS color format.',
            evidence: {
              found: themeColor,
              expected: 'Hex (#4285f4), rgb, rgba, hsl, or named color'
            }
          }
        );
      }

      return createResult(
        { id: 'manifest-theme-color', name: 'Theme Color', category: 'mobile', severity: 'warning' },
        'pass',
        `Theme color: ${themeColor}`
      );
    },
  },
  {
    id: 'manifest-background-color',
    name: 'Background Color',
    category: 'mobile',
    severity: 'info',
    description: 'Background color is used for the splash screen during app launch',
    check: (ctx) => {
      if (!ctx.hasManifest) {
        return createResult(
          { id: 'manifest-background-color', name: 'Background Color', category: 'mobile', severity: 'info' },
          'info',
          'Not applicable (no manifest)',
          { recommendation: 'First add a web app manifest' }
        );
      }

      if (!ctx.manifestBackgroundColor) {
        return createResult(
          { id: 'manifest-background-color', name: 'Background Color', category: 'mobile', severity: 'info' },
          'info',
          'No background color defined',
          {
            recommendation: 'Set background_color for a smoother launch experience.',
            evidence: {
              expected: '"background_color": "#ffffff"',
              impact: 'The background_color is shown as the splash screen background while your app loads. It should match your app\'s primary background color to avoid a jarring transition.',
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/Manifest/background_color'
            }
          }
        );
      }

      if (!isValidColor(ctx.manifestBackgroundColor)) {
        return createResult(
          { id: 'manifest-background-color', name: 'Background Color', category: 'mobile', severity: 'info' },
          'info',
          `Invalid background color format: ${ctx.manifestBackgroundColor}`,
          {
            value: ctx.manifestBackgroundColor,
            recommendation: 'Use a valid CSS color format.',
            evidence: {
              found: ctx.manifestBackgroundColor,
              expected: 'Hex (#ffffff), rgb, rgba, hsl, or named color'
            }
          }
        );
      }

      return createResult(
        { id: 'manifest-background-color', name: 'Background Color', category: 'mobile', severity: 'info' },
        'pass',
        `Background color: ${ctx.manifestBackgroundColor}`
      );
    },
  },

  // ==========================================================================
  // Start URL & Scope
  // ==========================================================================
  {
    id: 'manifest-start-url',
    name: 'Start URL',
    category: 'technical',
    severity: 'warning',
    description: 'start_url defines the entry point when the app is launched',
    check: (ctx) => {
      if (!ctx.hasManifest) {
        return createResult(
          { id: 'manifest-start-url', name: 'Start URL', category: 'technical', severity: 'warning' },
          'info',
          'Not applicable (no manifest)',
          { recommendation: 'First add a web app manifest' }
        );
      }

      if (!ctx.manifestStartUrl) {
        return createResult(
          { id: 'manifest-start-url', name: 'Start URL', category: 'technical', severity: 'warning' },
          'warn',
          'Manifest missing start_url',
          {
            recommendation: 'Define start_url for consistent app launch behavior.',
            evidence: {
              expected: '"start_url": "/"',
              impact: 'Without start_url, the browser uses the manifest URL as the start page. Using a start_url with a query parameter (e.g., "/?source=pwa") helps track PWA usage in analytics.',
              example: '"start_url": "/?utm_source=pwa&utm_medium=homescreen"',
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/Manifest/start_url'
            }
          }
        );
      }

      return createResult(
        { id: 'manifest-start-url', name: 'Start URL', category: 'technical', severity: 'warning' },
        'pass',
        `Start URL: ${ctx.manifestStartUrl}`
      );
    },
  },
  {
    id: 'manifest-scope',
    name: 'Navigation Scope',
    category: 'technical',
    severity: 'info',
    description: 'scope restricts which URLs are part of the app context',
    check: (ctx) => {
      if (!ctx.hasManifest) {
        return createResult(
          { id: 'manifest-scope', name: 'Navigation Scope', category: 'technical', severity: 'info' },
          'info',
          'Not applicable (no manifest)',
          { recommendation: 'First add a web app manifest' }
        );
      }

      if (!ctx.manifestScope) {
        return createResult(
          { id: 'manifest-scope', name: 'Navigation Scope', category: 'technical', severity: 'info' },
          'info',
          'No scope defined (defaults to manifest directory)',
          {
            recommendation: 'Consider setting scope to control navigation boundaries.',
            evidence: {
              expected: '"scope": "/"',
              impact: 'URLs outside the scope will open in a browser tab instead of the PWA. Default scope is the directory containing the manifest.',
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/Manifest/scope'
            }
          }
        );
      }

      return createResult(
        { id: 'manifest-scope', name: 'Navigation Scope', category: 'technical', severity: 'info' },
        'pass',
        `Scope: ${ctx.manifestScope}`
      );
    },
  },

  // ==========================================================================
  // Language & Direction
  // ==========================================================================
  {
    id: 'manifest-lang',
    name: 'Manifest Language',
    category: 'i18n',
    severity: 'info',
    description: 'Specify the primary language of the app',
    check: (ctx) => {
      if (!ctx.hasManifest) {
        return createResult(
          { id: 'manifest-lang', name: 'Manifest Language', category: 'i18n', severity: 'info' },
          'info',
          'Not applicable (no manifest)',
          { recommendation: 'First add a web app manifest' }
        );
      }

      if (!ctx.manifestLang) {
        return createResult(
          { id: 'manifest-lang', name: 'Manifest Language', category: 'i18n', severity: 'info' },
          'info',
          'No language specified in manifest',
          {
            recommendation: 'Add lang field for internationalization.',
            evidence: {
              expected: '"lang": "en"',
              impact: 'Helps browsers and assistive technologies understand the app\'s primary language. Important for multilingual apps.',
              example: '"lang": "en-US"\n"lang": "pt-BR"\n"lang": "zh-Hans"',
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/Manifest/lang'
            }
          }
        );
      }

      return createResult(
        { id: 'manifest-lang', name: 'Manifest Language', category: 'i18n', severity: 'info' },
        'pass',
        `Language: ${ctx.manifestLang}`
      );
    },
  },
  {
    id: 'manifest-dir',
    name: 'Text Direction',
    category: 'i18n',
    severity: 'info',
    description: 'Specify text direction for RTL languages',
    check: (ctx) => {
      if (!ctx.hasManifest) {
        return createResult(
          { id: 'manifest-dir', name: 'Text Direction', category: 'i18n', severity: 'info' },
          'info',
          'Not applicable (no manifest)',
          { recommendation: 'First add a web app manifest' }
        );
      }

      // Check if language suggests RTL
      const rtlLanguages = ['ar', 'he', 'fa', 'ur', 'yi', 'ku', 'ps', 'sd', 'ug'];
      const lang = ctx.manifestLang?.split('-')[0]?.toLowerCase();
      const isRtlLang = lang && rtlLanguages.includes(lang);

      if (isRtlLang && ctx.manifestDir !== 'rtl') {
        return createResult(
          { id: 'manifest-dir', name: 'Text Direction', category: 'i18n', severity: 'info' },
          'warn',
          `RTL language detected (${ctx.manifestLang}) but dir is not "rtl"`,
          {
            recommendation: 'Add dir: "rtl" for right-to-left languages.',
            evidence: {
              found: ctx.manifestDir || 'Not specified',
              expected: '"dir": "rtl"',
              impact: 'Text and UI elements should be right-aligned for RTL languages.'
            }
          }
        );
      }

      if (!ctx.manifestDir) {
        return createResult(
          { id: 'manifest-dir', name: 'Text Direction', category: 'i18n', severity: 'info' },
          'info',
          'No text direction specified (defaults to "auto")',
          {
            recommendation: 'Consider setting dir for explicit text direction.',
            evidence: {
              expected: '"dir": "ltr" or "rtl" or "auto"',
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/Manifest/dir'
            }
          }
        );
      }

      return createResult(
        { id: 'manifest-dir', name: 'Text Direction', category: 'i18n', severity: 'info' },
        'pass',
        `Text direction: ${ctx.manifestDir}`
      );
    },
  },

  // ==========================================================================
  // App Store & Categories
  // ==========================================================================
  {
    id: 'manifest-categories',
    name: 'App Categories',
    category: 'technical',
    severity: 'info',
    description: 'Categories help with app store discovery',
    check: (ctx) => {
      if (!ctx.hasManifest) {
        return createResult(
          { id: 'manifest-categories', name: 'App Categories', category: 'technical', severity: 'info' },
          'info',
          'Not applicable (no manifest)',
          { recommendation: 'First add a web app manifest' }
        );
      }

      if (!ctx.manifestCategories || ctx.manifestCategories.length === 0) {
        return createResult(
          { id: 'manifest-categories', name: 'App Categories', category: 'technical', severity: 'info' },
          'info',
          'No categories defined',
          {
            recommendation: 'Add categories to improve app store discoverability.',
            evidence: {
              expected: '"categories": ["productivity", "utilities"]',
              impact: 'Categories help users find your app in app stores and browsers that support PWA catalogs.',
              example: 'Common categories: books, business, education, entertainment, finance, fitness, food, games, graphics, health, kids, lifestyle, magazines, medical, music, navigation, news, personalization, photo, politics, productivity, security, shopping, social, sports, travel, utilities, weather',
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/Manifest/categories'
            }
          }
        );
      }

      return createResult(
        { id: 'manifest-categories', name: 'App Categories', category: 'technical', severity: 'info' },
        'pass',
        `Categories: ${ctx.manifestCategories.join(', ')}`
      );
    },
  },
  {
    id: 'manifest-id',
    name: 'App ID',
    category: 'technical',
    severity: 'info',
    description: 'Unique identifier helps with app store listings',
    check: (ctx) => {
      if (!ctx.hasManifest) {
        return createResult(
          { id: 'manifest-id', name: 'App ID', category: 'technical', severity: 'info' },
          'info',
          'Not applicable (no manifest)',
          { recommendation: 'First add a web app manifest' }
        );
      }

      if (!ctx.manifestId) {
        return createResult(
          { id: 'manifest-id', name: 'App ID', category: 'technical', severity: 'info' },
          'info',
          'No id field defined',
          {
            recommendation: 'Add a unique id to identify your app across stores.',
            evidence: {
              expected: '"id": "/?homescreen=1" or "/app/"',
              impact: 'The id field provides a unique identifier for your app. It should remain stable even if start_url changes. App stores use this to identify your app.',
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/Manifest/id'
            }
          }
        );
      }

      return createResult(
        { id: 'manifest-id', name: 'App ID', category: 'technical', severity: 'info' },
        'pass',
        `App ID: ${ctx.manifestId}`
      );
    },
  },

  // ==========================================================================
  // Screenshots
  // ==========================================================================
  {
    id: 'manifest-screenshots',
    name: 'App Screenshots',
    category: 'technical',
    severity: 'info',
    description: 'Screenshots enhance the install prompt and app store presence',
    check: (ctx) => {
      if (!ctx.hasManifest) {
        return createResult(
          { id: 'manifest-screenshots', name: 'App Screenshots', category: 'technical', severity: 'info' },
          'info',
          'Not applicable (no manifest)',
          { recommendation: 'First add a web app manifest' }
        );
      }

      if (!ctx.manifestScreenshots || ctx.manifestScreenshots.length === 0) {
        return createResult(
          { id: 'manifest-screenshots', name: 'App Screenshots', category: 'technical', severity: 'info' },
          'info',
          'No screenshots defined',
          {
            recommendation: 'Add screenshots to showcase your app.',
            evidence: {
              expected: '"screenshots": [{ "src": "/screenshots/home.png", "type": "image/png", "sizes": "1280x720" }]',
              impact: 'Screenshots appear in the enhanced install prompt on desktop Chrome and in app stores. They help users understand what your app does before installing.',
              example: `"screenshots": [
  {
    "src": "/screenshots/home.png",
    "type": "image/png",
    "sizes": "1280x720",
    "form_factor": "wide",
    "label": "Home screen"
  }
]`,
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/Manifest/screenshots'
            }
          }
        );
      }

      return createResult(
        { id: 'manifest-screenshots', name: 'App Screenshots', category: 'technical', severity: 'info' },
        'pass',
        `${ctx.manifestScreenshots.length} screenshot(s) defined`
      );
    },
  },

  // ==========================================================================
  // Shortcuts
  // ==========================================================================
  {
    id: 'manifest-shortcuts',
    name: 'App Shortcuts',
    category: 'technical',
    severity: 'info',
    description: 'Shortcuts provide quick access to key features from app icon context menu',
    check: (ctx) => {
      if (!ctx.hasManifest) {
        return createResult(
          { id: 'manifest-shortcuts', name: 'App Shortcuts', category: 'technical', severity: 'info' },
          'info',
          'Not applicable (no manifest)',
          { recommendation: 'First add a web app manifest' }
        );
      }

      if (!ctx.manifestShortcuts || ctx.manifestShortcuts.length === 0) {
        return createResult(
          { id: 'manifest-shortcuts', name: 'App Shortcuts', category: 'technical', severity: 'info' },
          'info',
          'No shortcuts defined',
          {
            recommendation: 'Add shortcuts for common user tasks.',
            evidence: {
              expected: '"shortcuts": [{ "name": "New Task", "url": "/new" }]',
              impact: 'Shortcuts appear when users long-press or right-click the app icon. They provide quick access to key app features.',
              example: `"shortcuts": [
  {
    "name": "New Task",
    "short_name": "New",
    "description": "Create a new task",
    "url": "/new?source=shortcut",
    "icons": [{ "src": "/icons/new-task.png", "sizes": "96x96" }]
  }
]`,
              learnMore: 'https://developer.mozilla.org/en-US/docs/Web/Manifest/shortcuts'
            }
          }
        );
      }

      return createResult(
        { id: 'manifest-shortcuts', name: 'App Shortcuts', category: 'technical', severity: 'info' },
        'pass',
        `${ctx.manifestShortcuts.length} shortcut(s) defined`
      );
    },
  },

  // ==========================================================================
  // Service Worker (Installability)
  // ==========================================================================
  {
    id: 'manifest-service-worker',
    name: 'Service Worker',
    category: 'technical',
    severity: 'warning',
    description: 'A service worker is required for PWA installability',
    check: (ctx) => {
      if (!ctx.hasServiceWorker) {
        return createResult(
          { id: 'manifest-service-worker', name: 'Service Worker', category: 'technical', severity: 'warning' },
          'warn',
          'No service worker detected',
          {
            recommendation: 'Register a service worker for PWA installability.',
            evidence: {
              expected: 'A registered service worker',
              impact: 'Service workers are required for PWA installation. They enable offline functionality, push notifications, and background sync. Without one, Chrome won\'t show the install prompt.',
              example: `// In your main JavaScript:
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}`,
              learnMore: 'https://web.dev/articles/service-workers-registration'
            }
          }
        );
      }

      return createResult(
        { id: 'manifest-service-worker', name: 'Service Worker', category: 'technical', severity: 'warning' },
        'pass',
        'Service worker is registered'
      );
    },
  },

  // ==========================================================================
  // Installability Summary
  // ==========================================================================
  {
    id: 'manifest-installable',
    name: 'PWA Installability',
    category: 'technical',
    severity: 'warning',
    description: 'Check if the app meets minimum PWA installability requirements',
    check: (ctx) => {
      if (!ctx.hasManifest) {
        return createResult(
          { id: 'manifest-installable', name: 'PWA Installability', category: 'technical', severity: 'warning' },
          'warn',
          'Not installable: no manifest',
          {
            recommendation: 'Add a web app manifest to enable PWA installation.',
            evidence: {
              impact: 'PWA installability requires: manifest, HTTPS, service worker, 192x192 and 512x512 icons, name/short_name, start_url, display (standalone/fullscreen/minimal-ui).',
              learnMore: 'https://web.dev/articles/install-criteria'
            }
          }
        );
      }

      const issues: string[] = [];

      // Check required fields for installability
      if (!ctx.manifestName && !ctx.manifestShortName) issues.push('name or short_name');
      if (!ctx.manifestStartUrl) issues.push('start_url');
      if (!ctx.manifestDisplay || !['standalone', 'fullscreen', 'minimal-ui'].includes(ctx.manifestDisplay)) {
        issues.push('display (standalone/fullscreen/minimal-ui)');
      }

      const sizes = ctx.manifestIconSizes || [];
      if (!sizes.includes(192)) issues.push('192x192 icon');
      if (!sizes.includes(512)) issues.push('512x512 icon');

      if (!ctx.hasServiceWorker) issues.push('service worker');

      if (issues.length > 0) {
        return createResult(
          { id: 'manifest-installable', name: 'PWA Installability', category: 'technical', severity: 'warning' },
          'warn',
          `Missing requirements for installability: ${issues.join(', ')}`,
          {
            recommendation: 'Address the missing requirements to make your app installable.',
            evidence: {
              found: `Missing: ${issues.join(', ')}`,
              expected: 'All PWA installability requirements met',
              impact: 'Users cannot install your app to their home screen without meeting these requirements.',
              learnMore: 'https://web.dev/articles/install-criteria'
            }
          }
        );
      }

      return createResult(
        { id: 'manifest-installable', name: 'PWA Installability', category: 'technical', severity: 'warning' },
        'pass',
        'App meets PWA installability requirements'
      );
    },
  },
];

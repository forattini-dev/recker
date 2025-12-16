import { SeoRule, createResult } from './types.js';
import { SEO_THRESHOLDS } from './thresholds.js';

export const mobileRules: SeoRule[] = [
  {
    id: 'viewport-present',
    name: 'Viewport',
    category: 'mobile',
    severity: 'error',
    description: 'Page must have a viewport meta tag for mobile compatibility',
    check: (ctx) => {
      if (!ctx.hasViewport) {
        return createResult(
          { id: 'viewport-present', name: 'Viewport', category: 'mobile', severity: 'error' },
          'fail',
          'Missing viewport meta tag',
          {
            recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> for mobile responsiveness',
            evidence: {
              expected: '<meta name="viewport" content="width=device-width, initial-scale=1">',
              found: 'No viewport meta tag found',
            },
          }
        );
      }
      return createResult(
        { id: 'viewport-present', name: 'Viewport', category: 'mobile', severity: 'error' },
        'pass',
        'Viewport meta tag is present',
        { value: ctx.viewportContent }
      );
    },
  },
  {
    id: 'viewport-scalable',
    name: 'Viewport Scalable',
    category: 'mobile',
    severity: 'warning',
    description: 'Viewport should allow user scaling for accessibility',
    check: (ctx) => {
      if (!ctx.viewportContent) {
        return createResult(
          { id: 'viewport-scalable', name: 'Viewport Scalable', category: 'mobile', severity: 'warning' },
          'info',
          'Not applicable (no viewport meta tag)',
          { recommendation: 'First add a viewport meta tag, then ensure it allows user scaling' }
        );
      }

      const content = ctx.viewportContent.toLowerCase();
      const hasUserScalableNo = /user-scalable\s*=\s*no/.test(content);
      const hasMaximumScale1 = /maximum-scale\s*=\s*1(\.0)?/.test(content);

      if (hasUserScalableNo || hasMaximumScale1) {
        const issues = [];
        if (hasUserScalableNo) issues.push('user-scalable=no');
        if (hasMaximumScale1) issues.push('maximum-scale=1');

        return createResult(
          { id: 'viewport-scalable', name: 'Viewport Scalable', category: 'mobile', severity: 'warning' },
          'warn',
          `Viewport disables user scaling: ${issues.join(', ')}`,
          {
            recommendation: 'Remove user-scalable=no and maximum-scale=1 to allow pinch-to-zoom for accessibility',
            evidence: {
              found: ctx.viewportContent,
              issue: `Found: ${issues.join(', ')}`,
            },
          }
        );
      }
      return createResult(
        { id: 'viewport-scalable', name: 'Viewport Scalable', category: 'mobile', severity: 'warning' },
        'pass',
        'Viewport allows user scaling'
      );
    },
  },
  {
    id: 'viewport-device-width',
    name: 'Viewport Device Width',
    category: 'mobile',
    severity: 'warning',
    description: 'Viewport should use width=device-width for responsive design',
    check: (ctx) => {
      if (!ctx.viewportContent) {
        return createResult(
          { id: 'viewport-device-width', name: 'Viewport Device Width', category: 'mobile', severity: 'warning' },
          'info',
          'Not applicable (no viewport meta tag)',
          { recommendation: 'First add a viewport meta tag with width=device-width' }
        );
      }

      const content = ctx.viewportContent.toLowerCase();
      const hasDeviceWidth = /width\s*=\s*device-width/.test(content);
      const hasFixedWidth = /width\s*=\s*(\d+)/.test(content);

      if (hasFixedWidth && !hasDeviceWidth) {
        const match = content.match(/width\s*=\s*(\d+)/);
        const fixedWidth = match ? match[1] : 'unknown';

        return createResult(
          { id: 'viewport-device-width', name: 'Viewport Device Width', category: 'mobile', severity: 'warning' },
          'warn',
          `Viewport uses fixed width (${fixedWidth}px) instead of device-width`,
          {
            recommendation: 'Use width=device-width to make your site responsive across all devices',
            evidence: {
              found: ctx.viewportContent,
              expected: 'width=device-width',
              impact: 'Fixed width viewports force users to scroll horizontally on different screen sizes',
              example: '<meta name="viewport" content="width=device-width, initial-scale=1">',
            },
          }
        );
      }

      if (!hasDeviceWidth) {
        return createResult(
          { id: 'viewport-device-width', name: 'Viewport Device Width', category: 'mobile', severity: 'warning' },
          'info',
          'Viewport missing width=device-width',
          {
            recommendation: 'Add width=device-width to ensure proper responsive behavior',
            evidence: {
              found: ctx.viewportContent,
              expected: 'width=device-width',
            },
          }
        );
      }

      return createResult(
        { id: 'viewport-device-width', name: 'Viewport Device Width', category: 'mobile', severity: 'warning' },
        'pass',
        'Viewport uses device-width correctly'
      );
    },
  },
  {
    id: 'viewport-initial-scale',
    name: 'Viewport Initial Scale',
    category: 'mobile',
    severity: 'info',
    description: 'Viewport should include initial-scale=1 for consistent initial zoom',
    check: (ctx) => {
      if (!ctx.viewportContent) {
        return createResult(
          { id: 'viewport-initial-scale', name: 'Viewport Initial Scale', category: 'mobile', severity: 'info' },
          'info',
          'Not applicable (no viewport meta tag)',
          { recommendation: 'First add a viewport meta tag with initial-scale=1' }
        );
      }

      const content = ctx.viewportContent.toLowerCase();
      const hasInitialScale = /initial-scale\s*=\s*1(\.0)?/.test(content);

      if (!hasInitialScale) {
        return createResult(
          { id: 'viewport-initial-scale', name: 'Viewport Initial Scale', category: 'mobile', severity: 'info' },
          'info',
          'Viewport missing initial-scale=1',
          {
            recommendation: 'Add initial-scale=1 to set consistent initial zoom level',
            evidence: {
              found: ctx.viewportContent,
              expected: 'initial-scale=1',
              example: '<meta name="viewport" content="width=device-width, initial-scale=1">',
            },
          }
        );
      }

      return createResult(
        { id: 'viewport-initial-scale', name: 'Viewport Initial Scale', category: 'mobile', severity: 'info' },
        'pass',
        'Viewport has initial-scale=1'
      );
    },
  },
  {
    id: 'viewport-complete',
    name: 'Viewport Complete Configuration',
    category: 'mobile',
    severity: 'info',
    description: 'Viewport should have the complete recommended configuration',
    check: (ctx) => {
      if (!ctx.viewportContent) {
        return createResult(
          { id: 'viewport-complete', name: 'Viewport Complete', category: 'mobile', severity: 'info' },
          'info',
          'Not applicable (no viewport meta tag)',
          { recommendation: 'Add a complete viewport meta tag: <meta name="viewport" content="width=device-width, initial-scale=1">' }
        );
      }

      const content = ctx.viewportContent.toLowerCase();
      const hasDeviceWidth = /width\s*=\s*device-width/.test(content);
      const hasInitialScale = /initial-scale\s*=\s*1(\.0)?/.test(content);
      const hasUserScalableNo = /user-scalable\s*=\s*no/.test(content);
      const hasFixedWidth = /width\s*=\s*\d+/.test(content) && !hasDeviceWidth;

      const issues: string[] = [];
      if (!hasDeviceWidth) issues.push('missing width=device-width');
      if (!hasInitialScale) issues.push('missing initial-scale=1');
      if (hasUserScalableNo) issues.push('has user-scalable=no');
      if (hasFixedWidth) issues.push('uses fixed width');

      if (issues.length === 0) {
        return createResult(
          { id: 'viewport-complete', name: 'Viewport Complete', category: 'mobile', severity: 'info' },
          'pass',
          'Viewport has optimal configuration for mobile',
          { evidence: { found: ctx.viewportContent } }
        );
      }

      if (issues.length >= 2 || hasFixedWidth) {
        return createResult(
          { id: 'viewport-complete', name: 'Viewport Complete', category: 'mobile', severity: 'info' },
          'warn',
          `Viewport configuration has issues: ${issues.join(', ')}`,
          {
            recommendation: 'Use the recommended viewport configuration for best mobile experience',
            evidence: {
              found: ctx.viewportContent,
              expected: '<meta name="viewport" content="width=device-width, initial-scale=1">',
              issue: issues.join('; '),
            },
          }
        );
      }

      return createResult(
        { id: 'viewport-complete', name: 'Viewport Complete', category: 'mobile', severity: 'info' },
        'info',
        `Viewport configuration could be improved: ${issues.join(', ')}`,
        {
          recommendation: 'Consider using the complete recommended viewport configuration',
          evidence: {
            found: ctx.viewportContent,
            expected: '<meta name="viewport" content="width=device-width, initial-scale=1">',
          },
        }
      );
    },
  },
  // NOTE: mobile-font-size and mobile-tap-targets removed
  // They require CSS layout computation (CDP/Puppeteer) to properly evaluate
  // Can be re-added when we implement CDP-based rendering
];

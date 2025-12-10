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
      if (!ctx.viewportContent) return null;

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
  // NOTE: mobile-font-size and mobile-tap-targets removed
  // They require CSS layout computation (CDP/Puppeteer) to properly evaluate
  // Can be re-added when we implement CDP-based rendering
];

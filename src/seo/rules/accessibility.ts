import { SeoRule, createResult } from './types.js';

export const accessibilityRules: SeoRule[] = [
  {
    id: 'a11y-buttons-aria',
    name: 'Button Accessibility',
    category: 'accessibility',
    severity: 'warning',
    description: 'Buttons without visible text must have aria-label',
    check: (ctx) => {
      const count = ctx.buttonsWithoutAriaLabel ?? 0;
      if (count > 0) {
        return createResult(
          { id: 'a11y-buttons-aria', name: 'Button Accessibility', category: 'accessibility', severity: 'warning' },
          'warn',
          `${count} button(s) without accessible text/aria-label`,
          { value: count, recommendation: 'Add aria-label to icon-only buttons' }
        );
      }
      return null;
    },
  },
  {
    id: 'a11y-links-aria',
    name: 'Link Accessibility',
    category: 'accessibility',
    severity: 'warning',
    description: 'Links without visible text must have aria-label',
    check: (ctx) => {
      const count = ctx.linksWithoutAriaLabel ?? 0;
      if (count > 0) {
        return createResult(
          { id: 'a11y-links-aria', name: 'Link Accessibility', category: 'accessibility', severity: 'warning' },
          'warn',
          `${count} link(s) without accessible text/aria-label`,
          { value: count, recommendation: 'Add aria-label to icon-only links' }
        );
      }
      return null;
    },
  },
  {
    id: 'a11y-inputs-label',
    name: 'Input Labels',
    category: 'accessibility',
    severity: 'error',
    description: 'Form inputs must have associated labels',
    check: (ctx) => {
      const count = ctx.inputsWithoutLabel ?? 0;
      if (count > 0) {
        return createResult(
          { id: 'a11y-inputs-label', name: 'Input Labels', category: 'accessibility', severity: 'error' },
          'fail',
          `${count} input(s) without associated label`,
          { value: count, recommendation: 'Add <label for="id"> or aria-label to all form inputs' }
        );
      }
      return null;
    },
  },
  {
    id: 'a11y-iframes-title',
    name: 'Iframe Titles',
    category: 'accessibility',
    severity: 'warning',
    description: 'Iframes must have title attribute',
    check: (ctx) => {
      const count = ctx.iframesWithoutTitle ?? 0;
      if (count > 0) {
        return createResult(
          { id: 'a11y-iframes-title', name: 'Iframe Titles', category: 'accessibility', severity: 'warning' },
          'warn',
          `${count} iframe(s) without title attribute`,
          { value: count, recommendation: 'Add title attribute to describe iframe content' }
        );
      }
      return null;
    },
  },
  {
    id: 'a11y-tables-caption',
    name: 'Table Captions',
    category: 'accessibility',
    severity: 'info',
    description: 'Data tables should have caption or aria-label',
    check: (ctx) => {
      const count = ctx.tablesWithoutCaption ?? 0;
      if (count > 0) {
        return createResult(
          { id: 'a11y-tables-caption', name: 'Table Captions', category: 'accessibility', severity: 'info' },
          'info',
          `${count} table(s) without caption/aria-label`,
          { value: count, recommendation: 'Add <caption> or aria-label to data tables' }
        );
      }
      return null;
    },
  },
  {
    id: 'a11y-svg-title',
    name: 'SVG Accessibility',
    category: 'accessibility',
    severity: 'warning',
    description: 'SVGs should have <title> or aria-label for accessibility',
    check: (ctx) => {
      const count = ctx.svgsWithoutTitle ?? 0;
      if (count > 0) {
        return createResult(
          { id: 'a11y-svg-title', name: 'SVG Accessibility', category: 'accessibility', severity: 'warning' },
          'warn',
          `${count} SVG(s) without accessible title`,
          { value: count, recommendation: 'Add <title> inside SVG or aria-label for decorative SVGs' }
        );
      }
      return null;
    },
  },
  {
    id: 'a11y-images-decorative',
    name: 'Decorative Images',
    category: 'accessibility',
    severity: 'info',
    description: 'Decorative images should have empty alt=""',
    check: (ctx) => {
      const decorative = ctx.imagesDecorativeCount ?? 0;
      const emptyAlt = ctx.imagesWithEmptyAlt ?? 0;
      if (decorative > 0 && emptyAlt === 0) {
        return createResult(
          { id: 'a11y-images-decorative', name: 'Decorative Images', category: 'accessibility', severity: 'info' },
          'info',
          'Some images may be decorative - use alt="" for decorative images',
          { recommendation: 'For decorative images, use alt="" (empty string) not missing alt' }
        );
      }
      return null;
    },
  },
  {
    id: 'a11y-buttons-aria-label',
    name: 'Buttons with Accessible Name',
    category: 'accessibility',
    severity: 'error',
    description: 'Buttons without text content must have an aria-label or title',
    check: (ctx) => {
      if (ctx.buttonsWithoutAriaLabel && ctx.buttonsWithoutAriaLabel > 0) {
        return createResult(
          { id: 'a11y-buttons-aria-label', name: 'Buttons Accessible Name', category: 'accessibility', severity: 'error' },
          'fail',
          `${ctx.buttonsWithoutAriaLabel} button(s) without accessible name found`,
          { recommendation: 'Add descriptive text, aria-label, aria-labelledby, or title to buttons' }
        );
      }
      return null;
    },
  },
  {
    id: 'a11y-links-aria-label',
    name: 'Links with Accessible Name',
    category: 'accessibility',
    severity: 'error',
    description: 'Icon-only links must have an aria-label or title',
    check: (ctx) => {
      if (ctx.linksWithoutAriaLabel && ctx.linksWithoutAriaLabel > 0) {
        return createResult(
          { id: 'a11y-links-aria-label', name: 'Links Accessible Name', category: 'accessibility', severity: 'error' },
          'fail',
          `${ctx.linksWithoutAriaLabel} icon-only link(s) without accessible name found`,
          { recommendation: 'Add descriptive text, aria-label, aria-labelledby, or title to icon-only links' }
        );
      }
      return null;
    },
  },
  // Note: a11y-inputs-label appears twice in context map but handled by 'Input Labels' above generically. 
  // The specific check 'Form Inputs with Labels' is effectively the same. I will rely on 'a11y-inputs-label' above.
];

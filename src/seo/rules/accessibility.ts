/**
 * SEO Accessibility Rules
 * Comprehensive Lighthouse-aligned accessibility checks
 */

import { SeoRule, createResult } from './types.js';

export const accessibilityRules: SeoRule[] = [
  // ==========================================================================
  // Names and Labels
  // ==========================================================================
  {
    id: 'a11y-buttons-accessible-name',
    name: 'Buttons Accessible Name',
    category: 'accessibility',
    severity: 'error',
    description: 'Buttons must have an accessible name (text content, aria-label, or title)',
    check: (ctx) => {
      if (ctx.buttonsWithoutAriaLabel === undefined) {
        return createResult(
          { id: 'a11y-buttons-accessible-name', name: 'Buttons Accessible Name', category: 'accessibility', severity: 'error' },
          'info',
          'Not applicable (no button data available)',
          { recommendation: 'This rule checks that all buttons have accessible names via text content, aria-label, or title attributes' }
        );
      }
      const count = ctx.buttonsWithoutAriaLabel;
      if (count > 0) {
        return createResult(
          { id: 'a11y-buttons-accessible-name', name: 'Buttons Accessible Name', category: 'accessibility', severity: 'error' },
          'fail',
          `${count} button(s) do not have an accessible name`,
          {
            value: count,
            recommendation: 'Add text content, aria-label, aria-labelledby, or title to all buttons',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Screen reader users cannot determine the button purpose',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/button-name',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-buttons-accessible-name', name: 'Buttons Accessible Name', category: 'accessibility', severity: 'error' },
        'pass',
        'All buttons have accessible names'
      );
    },
  },
  {
    id: 'a11y-images-alt',
    name: 'Image Alt Attributes',
    category: 'accessibility',
    severity: 'error',
    description: 'Image elements must have [alt] attributes',
    check: (ctx) => {
      if (ctx.imagesWithoutAlt === undefined) {
        return createResult(
          { id: 'a11y-images-alt', name: 'Image Alt Attributes', category: 'accessibility', severity: 'error' },
          'info',
          'Not applicable (no image data available)',
          { recommendation: 'This rule checks that all images have alt attributes for screen readers' }
        );
      }
      const count = ctx.imagesWithoutAlt;
      if (count > 0) {
        return createResult(
          { id: 'a11y-images-alt', name: 'Image Alt Attributes', category: 'accessibility', severity: 'error' },
          'fail',
          `${count} image(s) do not have [alt] attributes`,
          {
            value: count,
            recommendation: 'Add alt="" for decorative images or descriptive alt text for informative images',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Screen readers cannot convey image content to blind users',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/image-alt',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-images-alt', name: 'Image Alt Attributes', category: 'accessibility', severity: 'error' },
        'pass',
        'All images have [alt] attributes'
      );
    },
  },
  {
    id: 'a11y-links-discernible-name',
    name: 'Links Discernible Name',
    category: 'accessibility',
    severity: 'error',
    description: 'Links must have a discernible name',
    check: (ctx) => {
      if (ctx.linksWithoutText === undefined && ctx.linksWithoutAriaLabel === undefined) {
        return createResult(
          { id: 'a11y-links-discernible-name', name: 'Links Discernible Name', category: 'accessibility', severity: 'error' },
          'info',
          'Not applicable (no link data available)',
          { recommendation: 'This rule checks that all links have discernible names via text content, aria-label, or title' }
        );
      }
      const linksNoText = ctx.linksWithoutText ?? 0;
      const linksNoAria = ctx.linksWithoutAriaLabel ?? 0;
      const count = Math.max(linksNoText, linksNoAria);
      if (count > 0) {
        return createResult(
          { id: 'a11y-links-discernible-name', name: 'Links Discernible Name', category: 'accessibility', severity: 'error' },
          'fail',
          `${count} link(s) do not have a discernible name`,
          {
            value: count,
            recommendation: 'Add text content, aria-label, aria-labelledby, or title to links',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Screen reader users cannot understand link destinations',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/link-name',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-links-discernible-name', name: 'Links Discernible Name', category: 'accessibility', severity: 'error' },
        'pass',
        'All links have discernible names'
      );
    },
  },
  {
    id: 'a11y-form-labels',
    name: 'Form Input Labels',
    category: 'accessibility',
    severity: 'error',
    description: 'Form elements must have associated labels',
    check: (ctx) => {
      if (ctx.inputsWithoutLabel === undefined) {
        return createResult(
          { id: 'a11y-form-labels', name: 'Form Input Labels', category: 'accessibility', severity: 'error' },
          'info',
          'Not applicable (no form input data available)',
          { recommendation: 'This rule checks that all form inputs have associated labels for accessibility' }
        );
      }
      const count = ctx.inputsWithoutLabel;
      if (count > 0) {
        return createResult(
          { id: 'a11y-form-labels', name: 'Form Input Labels', category: 'accessibility', severity: 'error' },
          'fail',
          `${count} form input(s) without associated label`,
          {
            value: count,
            recommendation: 'Add <label for="id">, aria-label, or aria-labelledby to all form inputs',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Users cannot identify input purpose, critical for screen reader users',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/label',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-form-labels', name: 'Form Input Labels', category: 'accessibility', severity: 'error' },
        'pass',
        'All form inputs have associated labels'
      );
    },
  },

  // ==========================================================================
  // Navigation
  // ==========================================================================
  {
    id: 'a11y-heading-order',
    name: 'Heading Order',
    category: 'accessibility',
    severity: 'warning',
    description: 'Heading elements should be in sequentially-descending order',
    check: (ctx) => {
      if (ctx.headingHierarchyValid === undefined) {
        return createResult(
          { id: 'a11y-heading-order', name: 'Heading Order', category: 'accessibility', severity: 'warning' },
          'info',
          'Not applicable (no heading data available)',
          { recommendation: 'This rule checks that headings follow a logical order (H1 → H2 → H3) without skipping levels' }
        );
      }
      if (!ctx.headingHierarchyValid) {
        return createResult(
          { id: 'a11y-heading-order', name: 'Heading Order', category: 'accessibility', severity: 'warning' },
          'warn',
          'Heading elements are not in sequentially-descending order',
          {
            recommendation: 'Ensure headings follow a logical order (H1 → H2 → H3) without skipping levels',
            evidence: {
              found: ctx.headingSkippedLevels?.join(', ') || 'Skipped levels detected',
              expected: 'Sequential heading hierarchy',
              impact: 'Impacts keyboard navigation for screen reader users',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/heading-order',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-heading-order', name: 'Heading Order', category: 'accessibility', severity: 'warning' },
        'pass',
        'Headings are in sequentially-descending order'
      );
    },
  },
  {
    id: 'a11y-tabindex',
    name: 'Tabindex Values',
    category: 'accessibility',
    severity: 'warning',
    description: 'No element should have a [tabindex] value greater than 0',
    check: (ctx) => {
      if (ctx.elementsWithHighTabindex === undefined) {
        return createResult(
          { id: 'a11y-tabindex', name: 'Tabindex Values', category: 'accessibility', severity: 'warning' },
          'info',
          'Not applicable (no tabindex data available)',
          { recommendation: 'This rule checks that no element has a tabindex value greater than 0, which can confuse keyboard users' }
        );
      }
      const count = ctx.elementsWithHighTabindex;
      if (count > 0) {
        return createResult(
          { id: 'a11y-tabindex', name: 'Tabindex Values', category: 'accessibility', severity: 'warning' },
          'warn',
          `${count} element(s) have tabindex > 0`,
          {
            value: count,
            recommendation: 'Remove positive tabindex values; use tabindex="0" or "-1" instead',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Creates confusing focus order for keyboard users',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/tabindex',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-tabindex', name: 'Tabindex Values', category: 'accessibility', severity: 'warning' },
        'pass',
        'No elements have tabindex > 0'
      );
    },
  },

  // ==========================================================================
  // ARIA
  // ==========================================================================
  {
    id: 'a11y-aria-valid-attrs',
    name: 'Valid ARIA Attributes',
    category: 'accessibility',
    severity: 'error',
    description: '[aria-*] attributes must be valid and not misspelled',
    check: (ctx) => {
      if (ctx.invalidAriaAttributes === undefined) {
        return createResult(
          { id: 'a11y-aria-valid-attrs', name: 'Valid ARIA Attributes', category: 'accessibility', severity: 'error' },
          'info',
          'Not applicable (no ARIA attribute data available)',
          { recommendation: 'This rule checks that all aria-* attributes are valid and not misspelled' }
        );
      }
      const count = ctx.invalidAriaAttributes;
      if (count > 0) {
        return createResult(
          { id: 'a11y-aria-valid-attrs', name: 'Valid ARIA Attributes', category: 'accessibility', severity: 'error' },
          'fail',
          `${count} invalid or misspelled aria-* attribute(s) found`,
          {
            value: count,
            recommendation: 'Verify ARIA attributes are spelled correctly and valid',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Invalid ARIA provides no accessibility benefit',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/aria-valid-attr',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-aria-valid-attrs', name: 'Valid ARIA Attributes', category: 'accessibility', severity: 'error' },
        'pass',
        'All ARIA attributes are valid'
      );
    },
  },
  {
    id: 'a11y-aria-valid-values',
    name: 'ARIA Attribute Values',
    category: 'accessibility',
    severity: 'error',
    description: '[aria-*] attributes must have valid values',
    check: (ctx) => {
      if (ctx.invalidAriaValues === undefined) {
        return createResult(
          { id: 'a11y-aria-valid-values', name: 'ARIA Attribute Values', category: 'accessibility', severity: 'error' },
          'info',
          'Not applicable (no ARIA value data available)',
          { recommendation: 'This rule checks that all aria-* attributes have valid values' }
        );
      }
      const count = ctx.invalidAriaValues;
      if (count > 0) {
        return createResult(
          { id: 'a11y-aria-valid-values', name: 'ARIA Attribute Values', category: 'accessibility', severity: 'error' },
          'fail',
          `${count} aria-* attribute(s) have invalid values`,
          {
            value: count,
            recommendation: 'Use valid values for ARIA attributes (e.g., aria-live="polite")',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Invalid values prevent assistive technologies from working correctly',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/aria-valid-attr-value',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-aria-valid-values', name: 'ARIA Attribute Values', category: 'accessibility', severity: 'error' },
        'pass',
        'All ARIA attribute values are valid'
      );
    },
  },
  {
    id: 'a11y-aria-roles',
    name: 'Valid ARIA Roles',
    category: 'accessibility',
    severity: 'error',
    description: '[role] values must be valid',
    check: (ctx) => {
      if (ctx.invalidAriaRoles === undefined) {
        return createResult(
          { id: 'a11y-aria-roles', name: 'Valid ARIA Roles', category: 'accessibility', severity: 'error' },
          'info',
          'Not applicable (no ARIA role data available)',
          { recommendation: 'This rule checks that all role values are valid ARIA roles' }
        );
      }
      const count = ctx.invalidAriaRoles;
      if (count > 0) {
        return createResult(
          { id: 'a11y-aria-roles', name: 'Valid ARIA Roles', category: 'accessibility', severity: 'error' },
          'fail',
          `${count} invalid [role] value(s) found`,
          {
            value: count,
            recommendation: 'Use valid ARIA role values (e.g., button, dialog, navigation)',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Invalid roles confuse assistive technologies',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/aria-roles',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-aria-roles', name: 'Valid ARIA Roles', category: 'accessibility', severity: 'error' },
        'pass',
        'All [role] values are valid'
      );
    },
  },
  {
    id: 'a11y-aria-required-attrs',
    name: 'Required ARIA Attributes',
    category: 'accessibility',
    severity: 'error',
    description: '[role]s must have all required [aria-*] attributes',
    check: (ctx) => {
      if (ctx.missingRequiredAriaAttrs === undefined) {
        return createResult(
          { id: 'a11y-aria-required-attrs', name: 'Required ARIA Attributes', category: 'accessibility', severity: 'error' },
          'info',
          'Not applicable (no required ARIA attribute data available)',
          { recommendation: 'This rule checks that elements with ARIA roles have all required aria-* attributes' }
        );
      }
      const count = ctx.missingRequiredAriaAttrs;
      if (count > 0) {
        return createResult(
          { id: 'a11y-aria-required-attrs', name: 'Required ARIA Attributes', category: 'accessibility', severity: 'error' },
          'fail',
          `${count} element(s) with roles missing required aria-* attributes`,
          {
            value: count,
            recommendation: 'Add required ARIA attributes for each role (e.g., role="slider" requires aria-valuenow)',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Missing attributes break assistive technology functionality',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/aria-required-attr',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-aria-required-attrs', name: 'Required ARIA Attributes', category: 'accessibility', severity: 'error' },
        'pass',
        'All roles have required ARIA attributes'
      );
    },
  },
  {
    id: 'a11y-aria-hidden-body',
    name: 'ARIA Hidden Body',
    category: 'accessibility',
    severity: 'error',
    description: '[aria-hidden="true"] must not be present on the document <body>',
    check: (ctx) => {
      if (ctx.hasAriaHiddenBody === undefined) {
        return createResult(
          { id: 'a11y-aria-hidden-body', name: 'ARIA Hidden Body', category: 'accessibility', severity: 'error' },
          'info',
          'Not applicable (no body element data available)',
          { recommendation: 'This rule checks that aria-hidden is not present on the document body' }
        );
      }
      if (ctx.hasAriaHiddenBody) {
        return createResult(
          { id: 'a11y-aria-hidden-body', name: 'ARIA Hidden Body', category: 'accessibility', severity: 'error' },
          'fail',
          'aria-hidden="true" is present on document <body>',
          {
            recommendation: 'Remove aria-hidden from <body> element',
            evidence: {
              found: 'aria-hidden="true" on body',
              expected: 'No aria-hidden on body',
              impact: 'Entire page content hidden from assistive technologies',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/aria-hidden-body',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-aria-hidden-body', name: 'ARIA Hidden Body', category: 'accessibility', severity: 'error' },
        'pass',
        'aria-hidden is not present on <body>'
      );
    },
  },
  {
    id: 'a11y-aria-hidden-focus',
    name: 'ARIA Hidden Focusable',
    category: 'accessibility',
    severity: 'error',
    description: '[aria-hidden="true"] elements must not contain focusable descendants',
    check: (ctx) => {
      if (ctx.ariaHiddenFocusableCount === undefined) {
        return createResult(
          { id: 'a11y-aria-hidden-focus', name: 'ARIA Hidden Focusable', category: 'accessibility', severity: 'error' },
          'info',
          'Not applicable (no aria-hidden focusable data available)',
          { recommendation: 'This rule checks that aria-hidden elements do not contain focusable descendants' }
        );
      }
      const count = ctx.ariaHiddenFocusableCount;
      if (count > 0) {
        return createResult(
          { id: 'a11y-aria-hidden-focus', name: 'ARIA Hidden Focusable', category: 'accessibility', severity: 'error' },
          'fail',
          `${count} aria-hidden element(s) contain focusable descendants`,
          {
            value: count,
            recommendation: 'Remove focusable elements from aria-hidden containers or remove aria-hidden',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Focus can move to invisible elements, confusing users',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/aria-hidden-focus',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-aria-hidden-focus', name: 'ARIA Hidden Focusable', category: 'accessibility', severity: 'error' },
        'pass',
        'No focusable elements inside aria-hidden containers'
      );
    },
  },
  {
    id: 'a11y-aria-deprecated',
    name: 'Deprecated ARIA Roles',
    category: 'accessibility',
    severity: 'warning',
    description: 'Deprecated ARIA roles should not be used',
    check: (ctx) => {
      if (ctx.deprecatedAriaRoles === undefined) {
        return createResult(
          { id: 'a11y-aria-deprecated', name: 'Deprecated ARIA Roles', category: 'accessibility', severity: 'warning' },
          'info',
          'Not applicable (no deprecated ARIA role data available)',
          { recommendation: 'This rule checks that deprecated ARIA roles are not used' }
        );
      }
      const count = ctx.deprecatedAriaRoles;
      if (count > 0) {
        return createResult(
          { id: 'a11y-aria-deprecated', name: 'Deprecated ARIA Roles', category: 'accessibility', severity: 'warning' },
          'warn',
          `${count} deprecated ARIA role(s) found`,
          {
            value: count,
            recommendation: 'Replace deprecated roles with current alternatives',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Deprecated roles may not work in future browsers',
              learnMore: 'https://www.w3.org/TR/wai-aria-1.2/',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-aria-deprecated', name: 'Deprecated ARIA Roles', category: 'accessibility', severity: 'warning' },
        'pass',
        'No deprecated ARIA roles used'
      );
    },
  },
  {
    id: 'a11y-aria-ids-unique',
    name: 'ARIA IDs Unique',
    category: 'accessibility',
    severity: 'error',
    description: 'ARIA IDs must be unique',
    check: (ctx) => {
      if (ctx.duplicateAriaIds === undefined) {
        return createResult(
          { id: 'a11y-aria-ids-unique', name: 'ARIA IDs Unique', category: 'accessibility', severity: 'error' },
          'info',
          'Not applicable (no ARIA ID data available)',
          { recommendation: 'This rule checks that all IDs referenced by aria-labelledby, aria-describedby, etc. are unique' }
        );
      }
      const count = ctx.duplicateAriaIds;
      if (count > 0) {
        return createResult(
          { id: 'a11y-aria-ids-unique', name: 'ARIA IDs Unique', category: 'accessibility', severity: 'error' },
          'fail',
          `${count} duplicate ARIA ID(s) found`,
          {
            value: count,
            recommendation: 'Ensure all IDs referenced by aria-labelledby, aria-describedby, etc. are unique',
            evidence: {
              found: count,
              expected: 0,
              impact: 'References to duplicate IDs produce unpredictable behavior',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/duplicate-id-aria',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-aria-ids-unique', name: 'ARIA IDs Unique', category: 'accessibility', severity: 'error' },
        'pass',
        'All ARIA IDs are unique'
      );
    },
  },
  {
    id: 'a11y-dialog-name',
    name: 'Dialog Accessible Name',
    category: 'accessibility',
    severity: 'error',
    description: 'Elements with role="dialog" or role="alertdialog" must have accessible names',
    check: (ctx) => {
      if (ctx.dialogsWithoutName === undefined) {
        return createResult(
          { id: 'a11y-dialog-name', name: 'Dialog Accessible Name', category: 'accessibility', severity: 'error' },
          'info',
          'Not applicable (no dialog data available)',
          { recommendation: 'This rule checks that elements with role="dialog" or role="alertdialog" have accessible names' }
        );
      }
      const count = ctx.dialogsWithoutName;
      if (count > 0) {
        return createResult(
          { id: 'a11y-dialog-name', name: 'Dialog Accessible Name', category: 'accessibility', severity: 'error' },
          'fail',
          `${count} dialog(s) without accessible name`,
          {
            value: count,
            recommendation: 'Add aria-label or aria-labelledby to dialog elements',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Screen reader users cannot identify dialog purpose',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/aria-dialog-name',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-dialog-name', name: 'Dialog Accessible Name', category: 'accessibility', severity: 'error' },
        'pass',
        'All dialogs have accessible names'
      );
    },
  },

  // ==========================================================================
  // Landmarks
  // ==========================================================================
  {
    id: 'a11y-main-landmark',
    name: 'Main Landmark',
    category: 'accessibility',
    severity: 'warning',
    description: 'Document should have a main landmark',
    check: (ctx) => {
      if (ctx.hasMain === undefined) {
        return createResult(
          { id: 'a11y-main-landmark', name: 'Main Landmark', category: 'accessibility', severity: 'warning' },
          'info',
          'Not applicable (no main landmark data available)',
          { recommendation: 'This rule checks that document has a <main> element or role="main" for screen reader navigation' }
        );
      }
      if (!ctx.hasMain) {
        return createResult(
          { id: 'a11y-main-landmark', name: 'Main Landmark', category: 'accessibility', severity: 'warning' },
          'warn',
          'Document does not have a <main> landmark',
          {
            recommendation: 'Add a <main> element or role="main" to identify the main content area',
            evidence: {
              found: 'No <main> element or role="main"',
              expected: '<main> or role="main"',
              impact: 'Screen reader users cannot quickly navigate to main content',
              example: '<main>\n  <!-- Main content here -->\n</main>',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/landmark-one-main',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-main-landmark', name: 'Main Landmark', category: 'accessibility', severity: 'warning' },
        'pass',
        'Document has a main landmark'
      );
    },
  },
  {
    id: 'a11y-skip-link',
    name: 'Skip Link',
    category: 'accessibility',
    severity: 'info',
    description: 'Page should contain a heading, skip link, or landmark region',
    check: (ctx) => {
      if (ctx.hasSkipLink === undefined && ctx.hasMain === undefined && ctx.h1Count === undefined) {
        return createResult(
          { id: 'a11y-skip-link', name: 'Skip Link', category: 'accessibility', severity: 'info' },
          'info',
          'Not applicable (no navigation bypass data available)',
          { recommendation: 'This rule checks that page contains a skip link, main landmark, or heading for keyboard navigation' }
        );
      }
      const hasSkip = ctx.hasSkipLink ?? false;
      const hasMain = ctx.hasMain ?? false;
      const hasH1 = (ctx.h1Count ?? 0) > 0;
      if (!hasSkip && !hasMain && !hasH1) {
        return createResult(
          { id: 'a11y-skip-link', name: 'Skip Link', category: 'accessibility', severity: 'info' },
          'info',
          'No skip link, main landmark, or heading found',
          {
            recommendation: 'Add a skip link, <main> landmark, or at least one heading for navigation',
            evidence: {
              found: 'No skip link, <main>, or heading',
              expected: 'Skip link, <main>, or heading',
              impact: 'Keyboard users must tab through all navigation to reach content',
              example: '<a href="#main-content" class="skip-link">Skip to main content</a>',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/bypass',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-skip-link', name: 'Skip Link', category: 'accessibility', severity: 'info' },
        'pass',
        'Page has navigation bypass mechanism'
      );
    },
  },

  // ==========================================================================
  // Tables
  // ==========================================================================
  {
    id: 'a11y-table-caption',
    name: 'Table Caption',
    category: 'accessibility',
    severity: 'info',
    description: 'Data tables should have caption or aria-label',
    check: (ctx) => {
      if (ctx.tablesWithoutCaption === undefined) {
        return createResult(
          { id: 'a11y-table-caption', name: 'Table Caption', category: 'accessibility', severity: 'info' },
          'info',
          'Not applicable (no table data available)',
          { recommendation: 'This rule checks that data tables have captions or aria-labels for screen readers' }
        );
      }
      const count = ctx.tablesWithoutCaption;
      if (count > 0) {
        return createResult(
          { id: 'a11y-table-caption', name: 'Table Caption', category: 'accessibility', severity: 'info' },
          'info',
          `${count} table(s) without caption or aria-label`,
          {
            value: count,
            recommendation: 'Add <caption> or aria-label to data tables',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Screen reader users cannot understand table purpose',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-table-caption', name: 'Table Caption', category: 'accessibility', severity: 'info' },
        'pass',
        'All tables have captions or labels'
      );
    },
  },

  // ==========================================================================
  // iFrames
  // ==========================================================================
  {
    id: 'a11y-iframe-title',
    name: 'Iframe Title',
    category: 'accessibility',
    severity: 'warning',
    description: '<frame> or <iframe> elements must have a title',
    check: (ctx) => {
      if (ctx.iframesWithoutTitle === undefined) {
        return createResult(
          { id: 'a11y-iframe-title', name: 'Iframe Title', category: 'accessibility', severity: 'warning' },
          'info',
          'Not applicable (no iframe data available)',
          { recommendation: 'This rule checks that iframes have title attributes to describe their content' }
        );
      }
      const count = ctx.iframesWithoutTitle;
      if (count > 0) {
        return createResult(
          { id: 'a11y-iframe-title', name: 'Iframe Title', category: 'accessibility', severity: 'warning' },
          'warn',
          `${count} iframe(s) without title attribute`,
          {
            value: count,
            recommendation: 'Add title attribute to describe iframe content',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Screen reader users cannot identify iframe purpose',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/frame-title',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-iframe-title', name: 'Iframe Title', category: 'accessibility', severity: 'warning' },
        'pass',
        'All iframes have title attributes'
      );
    },
  },

  // ==========================================================================
  // SVG
  // ==========================================================================
  {
    id: 'a11y-svg-title',
    name: 'SVG Title',
    category: 'accessibility',
    severity: 'warning',
    description: 'SVGs should have <title> or aria-label for accessibility',
    check: (ctx) => {
      if (ctx.svgsWithoutTitle === undefined) {
        return createResult(
          { id: 'a11y-svg-title', name: 'SVG Title', category: 'accessibility', severity: 'warning' },
          'info',
          'Not applicable (no SVG data available)',
          { recommendation: 'This rule checks that SVGs have <title> elements or aria-label for accessibility' }
        );
      }
      const count = ctx.svgsWithoutTitle;
      if (count > 0) {
        return createResult(
          { id: 'a11y-svg-title', name: 'SVG Title', category: 'accessibility', severity: 'warning' },
          'warn',
          `${count} SVG(s) without accessible title`,
          {
            value: count,
            recommendation: 'Add <title> element inside SVG or aria-label attribute',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Screen readers cannot describe SVG content',
              example: '<svg aria-label="Descriptive label">\n  <title>Icon description</title>\n  <!-- SVG content -->\n</svg>',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-svg-title', name: 'SVG Title', category: 'accessibility', severity: 'warning' },
        'pass',
        'All SVGs have accessible titles'
      );
    },
  },

  // ==========================================================================
  // Viewport
  // ==========================================================================
  {
    id: 'a11y-viewport-zoom',
    name: 'Viewport Zoom',
    category: 'accessibility',
    severity: 'error',
    description: '[user-scalable="no"] should not be used and maximum-scale should not be less than 5',
    check: (ctx) => {
      if (ctx.viewportContent === undefined) {
        return createResult(
          { id: 'a11y-viewport-zoom', name: 'Viewport Zoom', category: 'accessibility', severity: 'error' },
          'info',
          'Not applicable (no viewport meta tag data available)',
          { recommendation: 'This rule checks that viewport meta tag allows zooming for users with low vision' }
        );
      }
      const viewport = ctx.viewportContent.toLowerCase();
      const hasUserScalableNo = viewport.includes('user-scalable=no') || viewport.includes('user-scalable=0');
      const maxScaleMatch = viewport.match(/maximum-scale\s*=\s*([\d.]+)/);
      const maxScale = maxScaleMatch ? parseFloat(maxScaleMatch[1]) : null;

      if (hasUserScalableNo || (maxScale !== null && maxScale < 5)) {
        return createResult(
          { id: 'a11y-viewport-zoom', name: 'Viewport Zoom', category: 'accessibility', severity: 'error' },
          'fail',
          'Viewport prevents zooming',
          {
            recommendation: 'Remove user-scalable=no and ensure maximum-scale is at least 5',
            evidence: {
              found: ctx.viewportContent,
              expected: 'No user-scalable=no, maximum-scale >= 5',
              impact: 'Users with low vision cannot zoom to read content',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/meta-viewport',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-viewport-zoom', name: 'Viewport Zoom', category: 'accessibility', severity: 'error' },
        'pass',
        'Viewport allows zooming'
      );
    },
  },

  // ==========================================================================
  // Document
  // ==========================================================================
  {
    id: 'a11y-document-title',
    name: 'Document Title',
    category: 'accessibility',
    severity: 'error',
    description: 'Document must have a <title> element',
    check: (ctx) => {
      if (ctx.title === undefined) {
        return createResult(
          { id: 'a11y-document-title', name: 'Document Title', category: 'accessibility', severity: 'error' },
          'info',
          'Not applicable (no title data available)',
          { recommendation: 'This rule checks that document has a <title> element for screen readers' }
        );
      }
      if (!ctx.title || ctx.title.trim().length === 0) {
        return createResult(
          { id: 'a11y-document-title', name: 'Document Title', category: 'accessibility', severity: 'error' },
          'fail',
          'Document does not have a <title> element',
          {
            recommendation: 'Add a descriptive <title> element to the document',
            evidence: {
              found: ctx.title || 'Empty or missing <title>',
              expected: '<title>Page Title</title>',
              impact: 'Screen reader users cannot identify the page',
              example: '<head>\n  <title>My Page - Site Name</title>\n</head>',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/document-title',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-document-title', name: 'Document Title', category: 'accessibility', severity: 'error' },
        'pass',
        'Document has a title element'
      );
    },
  },
  {
    id: 'a11y-html-lang',
    name: 'HTML Lang Attribute',
    category: 'accessibility',
    severity: 'error',
    description: '<html> element must have a [lang] attribute',
    check: (ctx) => {
      if (ctx.hasLang === undefined) {
        return createResult(
          { id: 'a11y-html-lang', name: 'HTML Lang Attribute', category: 'accessibility', severity: 'error' },
          'info',
          'Not applicable (no HTML lang attribute data available)',
          { recommendation: 'This rule checks that HTML element has a lang attribute for screen readers' }
        );
      }
      if (!ctx.hasLang) {
        return createResult(
          { id: 'a11y-html-lang', name: 'HTML Lang Attribute', category: 'accessibility', severity: 'error' },
          'fail',
          '<html> element does not have a [lang] attribute',
          {
            recommendation: 'Add lang attribute to html element (e.g., <html lang="en">)',
            evidence: {
              found: '<html> without lang attribute',
              expected: '<html lang="en">',
              impact: 'Screen readers may pronounce content incorrectly',
              example: '<html lang="en">\n  <!-- page content -->\n</html>',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/html-has-lang',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-html-lang', name: 'HTML Lang Attribute', category: 'accessibility', severity: 'error' },
        'pass',
        'HTML element has lang attribute'
      );
    },
  },
  {
    id: 'a11y-html-lang-valid',
    name: 'Valid Lang Attribute',
    category: 'accessibility',
    severity: 'error',
    description: '<html> element must have a valid value for its [lang] attribute',
    check: (ctx) => {
      if (!ctx.hasLang || !ctx.langValue) {
        return createResult(
          { id: 'a11y-html-lang-valid', name: 'Valid Lang Attribute', category: 'accessibility', severity: 'error' },
          'info',
          'Not applicable (no lang attribute present to validate)',
          { recommendation: 'This rule checks that HTML lang attribute has a valid BCP 47 language tag' }
        );
      }
      // Basic ISO 639-1 validation (2 letter codes) or BCP 47 (en-US, pt-BR, etc)
      const validLangPattern = /^[a-z]{2,3}(-[A-Za-z]{2,4})?(-[A-Za-z0-9]{2,})?$/i;
      if (!validLangPattern.test(ctx.langValue)) {
        return createResult(
          { id: 'a11y-html-lang-valid', name: 'Valid Lang Attribute', category: 'accessibility', severity: 'error' },
          'fail',
          `Invalid lang attribute value: ${ctx.langValue}`,
          {
            value: ctx.langValue,
            recommendation: 'Use a valid BCP 47 language tag (e.g., "en", "en-US", "pt-BR")',
            evidence: {
              found: ctx.langValue,
              expected: 'Valid BCP 47 language tag',
              impact: 'Invalid language tags prevent screen readers from selecting correct voice/pronunciation',
              example: '<html lang="en"> or <html lang="pt-BR">',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/html-lang-valid',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-html-lang-valid', name: 'Valid Lang Attribute', category: 'accessibility', severity: 'error' },
        'pass',
        `Valid lang attribute: ${ctx.langValue}`
      );
    },
  },

  // ==========================================================================
  // Video/Audio
  // ==========================================================================
  {
    id: 'a11y-video-captions',
    name: 'Video Captions',
    category: 'accessibility',
    severity: 'warning',
    description: '<video> elements should contain a <track> element with [kind="captions"]',
    check: (ctx) => {
      if (ctx.videoCount === undefined || ctx.videosWithCaptions === undefined) {
        return createResult(
          { id: 'a11y-video-captions', name: 'Video Captions', category: 'accessibility', severity: 'warning' },
          'info',
          'Not applicable (no video data available)',
          { recommendation: 'This rule checks that video elements have caption tracks for deaf users' }
        );
      }
      const videos = ctx.videoCount;
      const withCaptions = ctx.videosWithCaptions;
      if (videos > 0 && withCaptions < videos) {
        return createResult(
          { id: 'a11y-video-captions', name: 'Video Captions', category: 'accessibility', severity: 'warning' },
          'warn',
          `${videos - withCaptions} of ${videos} video(s) missing captions track`,
          {
            value: videos - withCaptions,
            recommendation: 'Add <track kind="captions" src="..."> to video elements',
            evidence: {
              found: `${withCaptions} with captions`,
              expected: `${videos} with captions`,
              impact: 'Deaf users cannot access video content',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/video-caption',
            },
          }
        );
      }
      if (videos > 0) {
        return createResult(
          { id: 'a11y-video-captions', name: 'Video Captions', category: 'accessibility', severity: 'warning' },
          'pass',
          `All ${videos} video(s) have captions`
        );
      }
      return createResult(
        { id: 'a11y-video-captions', name: 'Video Captions', category: 'accessibility', severity: 'warning' },
        'info',
        'Not applicable (no video elements detected)',
        { recommendation: 'This rule checks that video elements have caption tracks for deaf users' }
      );
    },
  },

  // ==========================================================================
  // Lists
  // ==========================================================================
  {
    id: 'a11y-list-structure',
    name: 'List Structure',
    category: 'accessibility',
    severity: 'warning',
    description: 'Lists must contain only <li> elements and script supporting elements',
    check: (ctx) => {
      if (ctx.invalidListStructure === undefined) {
        return createResult(
          { id: 'a11y-list-structure', name: 'List Structure', category: 'accessibility', severity: 'warning' },
          'info',
          'Not applicable (no list structure data available)',
          { recommendation: 'This rule checks that lists only contain valid children (li, script, template)' }
        );
      }
      const count = ctx.invalidListStructure;
      if (count > 0) {
        return createResult(
          { id: 'a11y-list-structure', name: 'List Structure', category: 'accessibility', severity: 'warning' },
          'warn',
          `${count} list(s) have invalid structure`,
          {
            value: count,
            recommendation: 'Ensure lists (<ul>, <ol>) only contain <li>, <script>, or <template> children',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Screen readers may not announce lists correctly',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/list',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-list-structure', name: 'List Structure', category: 'accessibility', severity: 'warning' },
        'pass',
        'All lists have valid structure'
      );
    },
  },

  // ==========================================================================
  // Headings
  // ==========================================================================
  {
    id: 'a11y-headings-content',
    name: 'Heading Content',
    category: 'accessibility',
    severity: 'warning',
    description: 'All heading elements must contain content',
    check: (ctx) => {
      if (ctx.emptyHeadings === undefined) {
        return createResult(
          { id: 'a11y-headings-content', name: 'Heading Content', category: 'accessibility', severity: 'warning' },
          'info',
          'Not applicable (no heading content data available)',
          { recommendation: 'This rule checks that all heading elements contain text content' }
        );
      }
      const count = ctx.emptyHeadings;
      if (count > 0) {
        return createResult(
          { id: 'a11y-headings-content', name: 'Heading Content', category: 'accessibility', severity: 'warning' },
          'warn',
          `${count} empty heading element(s) found`,
          {
            value: count,
            recommendation: 'Add text content to all heading elements or remove empty headings',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Empty headings confuse screen reader navigation',
              learnMore: 'https://dequeuniversity.com/rules/axe/4.4/empty-heading',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-headings-content', name: 'Heading Content', category: 'accessibility', severity: 'warning' },
        'pass',
        'All headings contain content'
      );
    },
  },

  // ==========================================================================
  // Images - Additional
  // ==========================================================================
  {
    id: 'a11y-images-redundant-alt',
    name: 'Redundant Alt Text',
    category: 'accessibility',
    severity: 'info',
    description: 'Image alt attributes should not be redundant',
    check: (ctx) => {
      if (ctx.imagesWithRedundantAlt === undefined) {
        return createResult(
          { id: 'a11y-images-redundant-alt', name: 'Redundant Alt Text', category: 'accessibility', severity: 'info' },
          'info',
          'Not applicable (no image alt text data available)',
          { recommendation: 'This rule checks that image alt text does not contain redundant phrases like "image of" or "picture of"' }
        );
      }
      const count = ctx.imagesWithRedundantAlt;
      if (count > 0) {
        return createResult(
          { id: 'a11y-images-redundant-alt', name: 'Redundant Alt Text', category: 'accessibility', severity: 'info' },
          'info',
          `${count} image(s) have redundant alt text (e.g., "image of", "picture of")`,
          {
            value: count,
            recommendation: 'Remove redundant phrases like "image of" or "picture of" from alt text',
            evidence: {
              found: count,
              expected: 0,
              impact: 'Screen readers already announce images; redundant text is repetitive',
            },
          }
        );
      }
      return createResult(
        { id: 'a11y-images-redundant-alt', name: 'Redundant Alt Text', category: 'accessibility', severity: 'info' },
        'pass',
        'No redundant alt text found'
      );
    },
  },
];

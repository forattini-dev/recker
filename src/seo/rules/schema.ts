import { SeoRule, createResult } from './types.js';

export const schemaRules: SeoRule[] = [
  {
    id: 'json-ld-exists',
    name: 'Structured Data',
    category: 'structured-data',
    severity: 'info',
    description: 'Page should have JSON-LD structured data',
    check: (ctx) => {
      if (ctx.jsonLdCount === undefined) return null;
      if (ctx.jsonLdCount === 0) {
        return createResult(
          { id: 'json-ld-exists', name: 'Structured Data', category: 'structured-data', severity: 'info' },
          'info',
          'No JSON-LD structured data found',
          { recommendation: 'Add Schema.org structured data for rich snippets' }
        );
      }
      const types = ctx.jsonLdTypes?.join(', ') || 'unknown';
      return createResult(
        { id: 'json-ld-exists', name: 'Structured Data', category: 'structured-data', severity: 'info' },
        'pass',
        `${ctx.jsonLdCount} JSON-LD block(s) found`,
        { value: types }
      );
    },
  },
  {
    id: 'schema-standard-types',
    name: 'Schema Types',
    category: 'structured-data',
    severity: 'info',
    description: 'Use standard Schema.org types',
    check: (ctx) => {
      if (!ctx.jsonLdTypes || ctx.jsonLdTypes.length === 0) return null;
      
            const recommended = [
              'WebSite', 'WebPage', 'Article', 'Product', 'BreadcrumbList',
              'Organization', 'Person', 'LocalBusiness', 'Recipe', 'Event',
              'JobPosting', 'FAQPage', 'HowTo', 'VideoObject',
              'SoftwareApplication', 'Review' // Added new types
            ];      
      // Check if any of the found types are in the recommended list
      const hasStandard = ctx.jsonLdTypes.some(t => recommended.includes(t));
      
      if (!hasStandard) {
        return createResult(
          { id: 'schema-standard-types', name: 'Schema Types', category: 'structured-data', severity: 'info' },
          'info',
          'Using uncommon Schema.org types',
          { value: ctx.jsonLdTypes.join(', '), recommendation: `Consider using standard types like ${recommended.slice(0, 3).join(', ')}` }
        );
      }
      
      return createResult(
        { id: 'schema-standard-types', name: 'Schema Types', category: 'structured-data', severity: 'info' },
        'pass',
        'Using standard Schema.org types',
        { value: ctx.jsonLdTypes.join(', ') }
      );
    },
  },
  {
    id: 'breadcrumbs-presence',
    name: 'Breadcrumbs Presence',
    category: 'structured-data',
    severity: 'info',
    description: 'Breadcrumbs improve navigation and SEO structure',
    check: (ctx) => {
      if (!ctx.hasBreadcrumbsHtml && !ctx.hasBreadcrumbsSchema) {
        return createResult(
          { id: 'breadcrumbs-presence', name: 'Breadcrumbs Presence', category: 'structured-data', severity: 'info' },
          'info',
          'No breadcrumbs found (HTML or Schema.org)',
          { recommendation: 'Add breadcrumbs using HTML and/or Schema.org BreadcrumbList' }
        );
      }
      return null;
    },
  },
];

/**
 * Template Helpers Registry
 *
 * Central registry for all built-in and custom helpers.
 * Organizes helpers by category for easy discovery.
 */

import type { TemplateHelper, HelperCategory, HelperDefinition } from '../types.js';
import { coreHelpers } from './core.js';
import { envHelpers } from './env.js';
import { cryptoHelpers } from './crypto.js';
import { dateHelpers } from './date.js';
import { stringHelpers } from './string.js';

// ============================================================================
// Helper Registry
// ============================================================================

/**
 * Global helper registry
 */
const registry = new Map<string, TemplateHelper>();

/**
 * Register a helper
 */
export function registerHelper(name: string, helper: TemplateHelper): void {
  registry.set(name, helper);
}

/**
 * Register multiple helpers
 */
export function registerHelpers(helpers: Record<string, TemplateHelper>): void {
  for (const [name, helper] of Object.entries(helpers)) {
    registry.set(name, helper);
  }
}

/**
 * Unregister a helper
 */
export function unregisterHelper(name: string): boolean {
  return registry.delete(name);
}

/**
 * Get a helper by name
 */
export function getHelper(name: string): TemplateHelper | undefined {
  return registry.get(name);
}

/**
 * Check if a helper exists
 */
export function hasHelper(name: string): boolean {
  return registry.has(name);
}

/**
 * Get all registered helper names
 */
export function getHelperNames(): string[] {
  return Array.from(registry.keys()).sort();
}

/**
 * Get all helpers as a record
 */
export function getAllHelpers(): Record<string, TemplateHelper> {
  const helpers: Record<string, TemplateHelper> = {};
  for (const [name, helper] of registry) {
    helpers[name] = helper;
  }
  return helpers;
}

/**
 * Clear all helpers
 */
export function clearHelpers(): void {
  registry.clear();
}

/**
 * Reset to default helpers
 */
export function resetHelpers(): void {
  clearHelpers();
  registerBuiltinHelpers();
}

// ============================================================================
// Built-in Helper Registration
// ============================================================================

/**
 * Register all built-in helpers
 */
export function registerBuiltinHelpers(): void {
  // Core helpers (if, each, with, etc.)
  registerHelpers(coreHelpers);

  // Environment helpers
  registerHelpers(envHelpers);

  // Crypto helpers (base64, hash, jwt, uuid, etc.)
  registerHelpers(cryptoHelpers);

  // Date/time helpers
  registerHelpers(dateHelpers);

  // String helpers
  registerHelpers(stringHelpers);
}

// Initialize with built-in helpers
registerBuiltinHelpers();

// ============================================================================
// Helper Categories (for documentation)
// ============================================================================

const categories: HelperCategory[] = [
  {
    name: 'Control Flow',
    description: 'Conditional and loop helpers',
    helpers: [
      {
        name: 'if',
        description: 'Renders block if condition is truthy',
        signature: '{{#if condition}}...{{else}}...{{/if}}',
        examples: [
          '{{#if user}}Hello {{user.name}}{{else}}Guest{{/if}}',
          '{{#if (gt items.length 0)}}Has items{{/if}}',
        ],
        isBlock: true,
      },
      {
        name: 'unless',
        description: 'Renders block if condition is falsy',
        signature: '{{#unless condition}}...{{/unless}}',
        examples: ['{{#unless loggedIn}}Please login{{/unless}}'],
        isBlock: true,
      },
      {
        name: 'each',
        description: 'Iterates over array or object',
        signature: '{{#each items}}...{{/each}}',
        examples: [
          '{{#each users}}{{name}}{{/each}}',
          '{{#each items}}{{@index}}: {{this}}{{/each}}',
        ],
        isBlock: true,
      },
      {
        name: 'with',
        description: 'Changes context for the block',
        signature: '{{#with object}}...{{/with}}',
        examples: ['{{#with user.profile}}{{name}} - {{email}}{{/with}}'],
        isBlock: true,
      },
    ],
  },
  {
    name: 'Comparison',
    description: 'Value comparison helpers',
    helpers: [
      {
        name: 'eq',
        description: 'Strict equality (===)',
        signature: '{{eq a b}}',
        examples: ['{{#if (eq status "active")}}Active{{/if}}'],
      },
      {
        name: 'ne',
        description: 'Not equal (!==)',
        signature: '{{ne a b}}',
        examples: ['{{#if (ne type "admin")}}Not admin{{/if}}'],
      },
      {
        name: 'lt',
        description: 'Less than (<)',
        signature: '{{lt a b}}',
        examples: ['{{#if (lt age 18)}}Minor{{/if}}'],
      },
      {
        name: 'lte',
        description: 'Less than or equal (<=)',
        signature: '{{lte a b}}',
        examples: ['{{#if (lte count 10)}}Small{{/if}}'],
      },
      {
        name: 'gt',
        description: 'Greater than (>)',
        signature: '{{gt a b}}',
        examples: ['{{#if (gt price 100)}}Expensive{{/if}}'],
      },
      {
        name: 'gte',
        description: 'Greater than or equal (>=)',
        signature: '{{gte a b}}',
        examples: ['{{#if (gte rating 4)}}Highly rated{{/if}}'],
      },
    ],
  },
  {
    name: 'Logic',
    description: 'Boolean logic helpers',
    helpers: [
      {
        name: 'and',
        description: 'Logical AND (returns last truthy or first falsy)',
        signature: '{{and a b c ...}}',
        examples: ['{{#if (and isActive hasPermission)}}Show{{/if}}'],
      },
      {
        name: 'or',
        description: 'Logical OR (returns first truthy or last falsy)',
        signature: '{{or a b c ...}}',
        examples: ['{{or name "Anonymous"}}'],
      },
      {
        name: 'not',
        description: 'Logical NOT (!)',
        signature: '{{not value}}',
        examples: ['{{#if (not isDisabled)}}Enabled{{/if}}'],
      },
    ],
  },
  {
    name: 'Utility',
    description: 'General utility helpers',
    helpers: [
      {
        name: 'log',
        description: 'Logs value to console',
        signature: '{{log value}}',
        examples: ['{{log "Debug:" user}}'],
      },
      {
        name: 'lookup',
        description: 'Dynamic property lookup',
        signature: '{{lookup object key}}',
        examples: ['{{lookup user fieldName}}'],
      },
      {
        name: 'concat',
        description: 'Concatenates values as strings',
        signature: '{{concat a b c ...}}',
        examples: ['{{concat firstName " " lastName}}'],
      },
      {
        name: 'default',
        description: 'Returns fallback if value is falsy',
        signature: '{{default value fallback}}',
        examples: ['{{default name "Unknown"}}'],
      },
      {
        name: 'coalesce',
        description: 'Returns first non-null/undefined value',
        signature: '{{coalesce a b c ...}}',
        examples: ['{{coalesce nickname name email}}'],
      },
      {
        name: 'typeof',
        description: 'Returns JavaScript type',
        signature: '{{typeof value}}',
        examples: ['{{typeof data}}'],
      },
      {
        name: 'json',
        description: 'Serializes to JSON string',
        signature: '{{json value indent}}',
        examples: ['{{json data 2}}'],
      },
      {
        name: 'len',
        description: 'Returns length of array/string/object',
        signature: '{{len value}}',
        examples: ['{{len items}}', '{{len "hello"}}'],
      },
      {
        name: 'range',
        description: 'Generates number sequence',
        signature: '{{#range start end step}}...{{/range}}',
        examples: ['{{#range 1 11}}{{this}}, {{/range}}'],
        isBlock: true,
      },
    ],
  },
];

/**
 * Get all helper categories
 */
export function getHelperCategories(): HelperCategory[] {
  return categories;
}

/**
 * Get helpers by category name
 */
export function getHelpersByCategory(categoryName: string): HelperDefinition[] {
  const category = categories.find(
    c => c.name.toLowerCase() === categoryName.toLowerCase()
  );
  return category?.helpers ?? [];
}

/**
 * Search helpers by name or description
 */
export function searchHelpers(query: string): HelperDefinition[] {
  const lowerQuery = query.toLowerCase();
  const results: HelperDefinition[] = [];

  for (const category of categories) {
    for (const helper of category.helpers) {
      if (
        helper.name.toLowerCase().includes(lowerQuery) ||
        helper.description.toLowerCase().includes(lowerQuery)
      ) {
        results.push(helper);
      }
    }
  }

  return results;
}

// ============================================================================
// Export
// ============================================================================

export { coreHelpers } from './core.js';
export { envHelpers } from './env.js';
export { cryptoHelpers } from './crypto.js';
export { dateHelpers } from './date.js';
export { stringHelpers } from './string.js';
export type { TemplateHelper, HelperCategory, HelperDefinition };

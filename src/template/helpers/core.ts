/**
 * Core Template Helpers
 *
 * Essential block and expression helpers:
 * - Control flow: if, unless, each, with
 * - Comparison: eq, ne, lt, lte, gt, gte
 * - Logic: and, or, not
 * - Utility: log, lookup, with
 */

import type { TemplateHelper, BlockHelperOptions, HelperContext } from '../types.js';

// ============================================================================
// Control Flow Helpers
// ============================================================================

/**
 * {{#if condition}}...{{else}}...{{/if}}
 *
 * Renders block if condition is truthy.
 * Falsy values: false, undefined, null, '', 0, [], NaN
 */
export const ifHelper: TemplateHelper = async function(
  this: HelperContext,
  condition: unknown,
  options?: BlockHelperOptions
): Promise<string> {
  if (!options?.fn) {
    // Expression mode: return condition
    return isTruthy(condition) ? 'true' : 'false';
  }

  if (isTruthy(condition)) {
    return options.fn(this.data);
  }

  if (options.inverse) {
    return options.inverse(this.data);
  }

  return '';
};

/**
 * {{#unless condition}}...{{else}}...{{/unless}}
 *
 * Renders block if condition is falsy (opposite of if).
 */
export const unlessHelper: TemplateHelper = async function(
  this: HelperContext,
  condition: unknown,
  options?: BlockHelperOptions
): Promise<string> {
  if (!options?.fn) {
    return !isTruthy(condition) ? 'true' : 'false';
  }

  if (!isTruthy(condition)) {
    return options.fn(this.data);
  }

  if (options.inverse) {
    return options.inverse(this.data);
  }

  return '';
};

/**
 * {{#each items}}...{{/each}}
 *
 * Iterates over array or object.
 * Available inside block:
 * - @index: current array index
 * - @first: true if first item
 * - @last: true if last item
 * - @key: object key (for objects)
 * - this: current item
 */
export const eachHelper: TemplateHelper = async function(
  this: HelperContext,
  items: unknown,
  options?: BlockHelperOptions
): Promise<string> {
  if (!options?.fn) {
    throw new Error('{{#each}} requires a block');
  }

  if (items === null || items === undefined) {
    if (options.inverse) {
      return options.inverse(this.data);
    }
    return '';
  }

  const results: string[] = [];

  if (Array.isArray(items)) {
    if (items.length === 0 && options.inverse) {
      return options.inverse(this.data);
    }

    for (let i = 0; i < items.length; i++) {
      const itemContext = {
        ...this.data,
        ...items[i] as object,
        '@index': i,
        '@first': i === 0,
        '@last': i === items.length - 1,
        this: items[i],
      };
      results.push(await options.fn(itemContext));
    }
  } else if (typeof items === 'object') {
    const entries = Object.entries(items);

    if (entries.length === 0 && options.inverse) {
      return options.inverse(this.data);
    }

    let index = 0;
    for (const [key, value] of entries) {
      const itemContext = {
        ...this.data,
        ...value as object,
        '@index': index,
        '@key': key,
        '@first': index === 0,
        '@last': index === entries.length - 1,
        this: value,
      };
      results.push(await options.fn(itemContext));
      index++;
    }
  }

  return results.join('');
};

/**
 * {{#with context}}...{{/with}}
 *
 * Changes context for the block.
 */
export const withHelper: TemplateHelper = async function(
  this: HelperContext,
  context: unknown,
  options?: BlockHelperOptions
): Promise<string> {
  if (!options?.fn) {
    throw new Error('{{#with}} requires a block');
  }

  if (context === null || context === undefined) {
    if (options.inverse) {
      return options.inverse(this.data);
    }
    return '';
  }

  const newContext = {
    ...this.data,
    ...context as object,
    $parent: this.data,
  };

  return options.fn(newContext);
};

// ============================================================================
// Comparison Helpers
// ============================================================================

/**
 * {{eq a b}} or {{#if (eq a b)}}
 *
 * Returns true if a equals b (strict equality).
 */
export const eqHelper: TemplateHelper = function(
  this: HelperContext,
  a: unknown,
  b: unknown
): boolean {
  return a === b;
};

/**
 * {{ne a b}} or {{#if (ne a b)}}
 *
 * Returns true if a does not equal b.
 */
export const neHelper: TemplateHelper = function(
  this: HelperContext,
  a: unknown,
  b: unknown
): boolean {
  return a !== b;
};

/**
 * {{lt a b}} - less than
 */
export const ltHelper: TemplateHelper = function(
  this: HelperContext,
  a: unknown,
  b: unknown
): boolean {
  return Number(a) < Number(b);
};

/**
 * {{lte a b}} - less than or equal
 */
export const lteHelper: TemplateHelper = function(
  this: HelperContext,
  a: unknown,
  b: unknown
): boolean {
  return Number(a) <= Number(b);
};

/**
 * {{gt a b}} - greater than
 */
export const gtHelper: TemplateHelper = function(
  this: HelperContext,
  a: unknown,
  b: unknown
): boolean {
  return Number(a) > Number(b);
};

/**
 * {{gte a b}} - greater than or equal
 */
export const gteHelper: TemplateHelper = function(
  this: HelperContext,
  a: unknown,
  b: unknown
): boolean {
  return Number(a) >= Number(b);
};

// ============================================================================
// Logic Helpers
// ============================================================================

/**
 * {{and a b c ...}}
 *
 * Returns last truthy value or first falsy value.
 */
export const andHelper: TemplateHelper = function(
  this: HelperContext,
  ...args: unknown[]
): unknown {
  // Remove options object if present
  const values = args.filter(a => typeof a !== 'object' || !('fn' in (a as object)));

  for (const value of values) {
    if (!isTruthy(value)) {
      return value;
    }
  }

  return values[values.length - 1];
};

/**
 * {{or a b c ...}}
 *
 * Returns first truthy value or last falsy value.
 */
export const orHelper: TemplateHelper = function(
  this: HelperContext,
  ...args: unknown[]
): unknown {
  const values = args.filter(a => typeof a !== 'object' || !('fn' in (a as object)));

  for (const value of values) {
    if (isTruthy(value)) {
      return value;
    }
  }

  return values[values.length - 1];
};

/**
 * {{not value}}
 *
 * Returns boolean negation.
 */
export const notHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): boolean {
  return !isTruthy(value);
};

// ============================================================================
// Utility Helpers
// ============================================================================

/**
 * {{log value}}
 *
 * Logs value to console (for debugging).
 */
export const logHelper: TemplateHelper = function(
  this: HelperContext,
  ...args: unknown[]
): string {
  console.log('[Template]', ...args.filter(a => typeof a !== 'object' || !('fn' in (a as object))));
  return '';
};

/**
 * {{lookup object key}}
 *
 * Dynamic property lookup.
 */
export const lookupHelper: TemplateHelper = function(
  this: HelperContext,
  object: unknown,
  key: unknown
): unknown {
  if (object === null || object === undefined) {
    return undefined;
  }

  if (typeof object !== 'object') {
    return undefined;
  }

  if (Array.isArray(object)) {
    return object[Number(key)];
  }

  return (object as Record<string, unknown>)[String(key)];
};

/**
 * {{concat a b c ...}}
 *
 * Concatenates values as strings.
 */
export const concatHelper: TemplateHelper = function(
  this: HelperContext,
  ...args: unknown[]
): string {
  const values = args.filter(a => typeof a !== 'object' || !('fn' in (a as object)));
  return values.map(String).join('');
};

/**
 * {{default value fallback}}
 *
 * Returns value if truthy, otherwise fallback.
 */
export const defaultHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  fallback: unknown
): unknown {
  return isTruthy(value) ? value : fallback;
};

/**
 * {{coalesce a b c ...}}
 *
 * Returns first non-null/undefined value.
 */
export const coalesceHelper: TemplateHelper = function(
  this: HelperContext,
  ...args: unknown[]
): unknown {
  // Filter out the options object (has 'fn' property) from variadic args
  const values = args.filter(a => {
    if (a === null || a === undefined) return true;
    if (typeof a !== 'object') return true;
    return !('fn' in (a as object));
  });

  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }

  return undefined;
};

/**
 * {{typeof value}}
 *
 * Returns JavaScript type of value.
 */
export const typeofHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

/**
 * {{json value}}
 *
 * Serializes value to JSON string.
 */
export const jsonHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  indent?: number
): string {
  const space = typeof indent === 'number' ? indent : undefined;
  return JSON.stringify(value, null, space);
};

/**
 * {{len value}}
 *
 * Returns length of array, string, or object keys.
 */
export const lenHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') return Object.keys(value).length;
  return 0;
};

/**
 * {{range start end step}}
 *
 * Generates array of numbers from start to end.
 */
export const rangeHelper: TemplateHelper = async function(
  this: HelperContext,
  start: number,
  end?: number | BlockHelperOptions,
  step?: number | BlockHelperOptions,
  options?: BlockHelperOptions
): Promise<string | number[]> {
  // Normalize arguments
  let actualStart = 0;
  let actualEnd = start;
  let actualStep = 1;
  let opts: BlockHelperOptions | undefined;

  if (typeof end === 'object' && 'fn' in end) {
    opts = end;
    actualStart = 0;
    actualEnd = start;
    actualStep = 1;
  } else if (typeof step === 'object' && 'fn' in step) {
    opts = step;
    actualStart = start;
    actualEnd = end as number;
    actualStep = 1;
  } else {
    actualStart = start;
    actualEnd = (end as number) ?? start;
    actualStep = (step as number) ?? 1;
    opts = options;
  }

  if (actualStep === 0) actualStep = 1;

  const range: number[] = [];
  if (actualStep > 0) {
    for (let i = actualStart; i < actualEnd; i += actualStep) {
      range.push(i);
    }
  } else {
    for (let i = actualStart; i > actualEnd; i += actualStep) {
      range.push(i);
    }
  }

  if (opts?.fn) {
    const results: string[] = [];
    for (let i = 0; i < range.length; i++) {
      const itemContext = {
        ...this.data,
        '@index': i,
        '@first': i === 0,
        '@last': i === range.length - 1,
        this: range[i],
      };
      results.push(await opts.fn(itemContext));
    }
    return results.join('');
  }

  return range;
};

// ============================================================================
// Helper Utilities
// ============================================================================

/**
 * Check if a value is truthy
 * Empty arrays, empty strings, 0, null, undefined, and false are considered falsy.
 */
export function isTruthy(value: unknown): boolean {
  if (value === false) return false;
  if (value === undefined) return false;
  if (value === null) return false;
  if (value === '') return false;
  if (value === 0) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (Number.isNaN(value)) return false;
  return true;
}

/**
 * Check if value is empty
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'object' && Object.keys(value).length === 0) return true;
  return false;
}

// ============================================================================
// Export all core helpers
// ============================================================================

export const coreHelpers: Record<string, TemplateHelper> = {
  // Control flow
  if: ifHelper,
  unless: unlessHelper,
  each: eachHelper,
  with: withHelper,

  // Comparison
  eq: eqHelper,
  ne: neHelper,
  lt: ltHelper,
  lte: lteHelper,
  gt: gtHelper,
  gte: gteHelper,

  // Logic
  and: andHelper,
  or: orHelper,
  not: notHelper,

  // Utility
  log: logHelper,
  lookup: lookupHelper,
  concat: concatHelper,
  default: defaultHelper,
  coalesce: coalesceHelper,
  typeof: typeofHelper,
  json: jsonHelper,
  len: lenHelper,
  range: rangeHelper,
};

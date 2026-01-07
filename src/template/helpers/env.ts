/**
 * Environment Variable Helpers
 *
 * Helpers for accessing environment variables in templates.
 */

import type { TemplateHelper, HelperContext } from '../types.js';

/**
 * {{env "VAR_NAME"}} or {{env "VAR_NAME" "default"}}
 *
 * Gets an environment variable value.
 */
export const envHelper: TemplateHelper = function(
  this: HelperContext,
  name: string,
  defaultValue?: string
): string {
  const value = process.env[name];
  if (value !== undefined) {
    return value;
  }
  if (defaultValue !== undefined) {
    return String(defaultValue);
  }
  return '';
};

/**
 * {{envOrFail "VAR_NAME"}}
 *
 * Gets an environment variable or throws if not set.
 */
export const envOrFailHelper: TemplateHelper = function(
  this: HelperContext,
  name: string
): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Required environment variable not set: ${name}`);
  }
  return value;
};

/**
 * {{hasEnv "VAR_NAME"}}
 *
 * Returns true if environment variable is set.
 */
export const hasEnvHelper: TemplateHelper = function(
  this: HelperContext,
  name: string
): boolean {
  return process.env[name] !== undefined;
};

/**
 * {{#ifEnv "VAR_NAME"}}...{{else}}...{{/ifEnv}}
 *
 * Conditional based on environment variable.
 */
export const ifEnvHelper: TemplateHelper = async function(
  this: HelperContext,
  name: string,
  options?: { fn?: (ctx?: unknown) => Promise<string>; inverse?: (ctx?: unknown) => Promise<string> }
): Promise<string> {
  const value = process.env[name];

  if (value !== undefined && value !== '' && value !== '0' && value.toLowerCase() !== 'false') {
    if (options?.fn) {
      return options.fn({ ...this.data, [name]: value });
    }
    return 'true';
  }

  if (options?.inverse) {
    return options.inverse(this.data);
  }

  return '';
};

/**
 * {{envPrefix "API_"}}
 *
 * Returns object with all env vars matching prefix.
 */
export const envPrefixHelper: TemplateHelper = function(
  this: HelperContext,
  prefix: string
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(prefix) && value !== undefined) {
      result[key] = value;
    }
  }

  return result;
};

/**
 * {{envKeys}}
 *
 * Returns array of all environment variable names.
 */
export const envKeysHelper: TemplateHelper = function(
  this: HelperContext
): string[] {
  return Object.keys(process.env);
};

// ============================================================================
// Export all env helpers
// ============================================================================

export const envHelpers: Record<string, TemplateHelper> = {
  env: envHelper,
  envOrFail: envOrFailHelper,
  hasEnv: hasEnvHelper,
  ifEnv: ifEnvHelper,
  envPrefix: envPrefixHelper,
  envKeys: envKeysHelper,
};

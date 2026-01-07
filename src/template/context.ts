/**
 * Template Context Builder
 *
 * Builds the data context for template rendering.
 * Merges multiple sources: environment, files, arguments, request/response data.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, basename, dirname, extname } from 'node:path';
import type {
  TemplateContext,
  ContextBuilderOptions,
  RequestContext,
  ResponseContext,
} from './types.js';

// ============================================================================
// Context Builder
// ============================================================================

/**
 * Build a template context from multiple sources
 */
export async function buildContext(
  options: ContextBuilderOptions = {}
): Promise<TemplateContext> {
  const context: TemplateContext = {};

  // Add environment variables
  if (options.env) {
    Object.assign(context, getEnvContext(options.env));
  }

  // Add file contents
  if (options.files) {
    for (const [key, filePath] of Object.entries(options.files)) {
      context[key] = await loadFile(filePath, options.baseDir);
    }
  }

  // Add command line arguments
  if (options.args) {
    Object.assign(context, options.args);
  }

  // Add request context
  if (options.request) {
    context.$request = options.request;
    context.request = options.request;
  }

  // Add response context
  if (options.response) {
    context.$response = options.response;
    context.response = options.response;
  }

  return context;
}

/**
 * Build context synchronously (no file loading)
 */
export function buildContextSync(
  options: Omit<ContextBuilderOptions, 'files'> = {}
): TemplateContext {
  const context: TemplateContext = {};

  // Add environment variables
  if (options.env) {
    Object.assign(context, getEnvContext(options.env));
  }

  // Add command line arguments
  if (options.args) {
    Object.assign(context, options.args);
  }

  // Add request context
  if (options.request) {
    context.$request = options.request;
    context.request = options.request;
  }

  // Add response context
  if (options.response) {
    context.$response = options.response;
    context.response = options.response;
  }

  return context;
}

// ============================================================================
// Environment Variables
// ============================================================================

/**
 * Get environment variables as context
 */
export function getEnvContext(
  filter: boolean | string[] | string
): Record<string, string> {
  const env: Record<string, string> = {};

  if (filter === true) {
    // Include all environment variables
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
  } else if (Array.isArray(filter)) {
    // Include only specified variables
    for (const key of filter) {
      const value = process.env[key];
      if (value !== undefined) {
        env[key] = value;
      }
    }
  } else if (typeof filter === 'string') {
    // Include variables matching prefix
    const prefix = filter;
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix) && value !== undefined) {
        env[key] = value;
      }
    }
  }

  return env;
}

/**
 * Get a single environment variable
 */
export function getEnv(name: string, defaultValue?: string): string | undefined {
  return process.env[name] ?? defaultValue;
}

/**
 * Get environment variable or throw if not set
 */
export function getEnvRequired(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Required environment variable not set: ${name}`);
  }
  return value;
}

/**
 * Check if environment variable is set
 */
export function hasEnv(name: string): boolean {
  return process.env[name] !== undefined;
}

// ============================================================================
// File Loading
// ============================================================================

/**
 * Load file contents as string
 */
export async function loadFile(
  filePath: string,
  baseDir?: string
): Promise<string> {
  const fullPath = baseDir ? resolve(baseDir, filePath) : filePath;
  return readFile(fullPath, 'utf-8');
}

/**
 * Load file as base64
 */
export async function loadFileBase64(
  filePath: string,
  baseDir?: string
): Promise<string> {
  const fullPath = baseDir ? resolve(baseDir, filePath) : filePath;
  const buffer = await readFile(fullPath);
  return buffer.toString('base64');
}

/**
 * Load JSON file
 */
export async function loadJsonFile(
  filePath: string,
  baseDir?: string
): Promise<unknown> {
  const content = await loadFile(filePath, baseDir);
  return JSON.parse(content);
}

/**
 * Check if file exists
 */
export async function fileExists(
  filePath: string,
  baseDir?: string
): Promise<boolean> {
  try {
    const fullPath = baseDir ? resolve(baseDir, filePath) : filePath;
    await stat(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Glob files matching pattern
 */
export async function globFiles(
  pattern: string,
  baseDir?: string
): Promise<string[]> {
  // Simple glob implementation for common patterns
  // For complex patterns, use a proper glob library
  const dir = baseDir ?? process.cwd();

  if (pattern.includes('**')) {
    // Recursive glob - simplified implementation
    return globRecursive(dir, pattern);
  }

  if (pattern.includes('*')) {
    // Single level glob
    const [prefix, suffix] = pattern.split('*');
    const files = await readdir(dir);
    return files
      .filter(f => f.startsWith(prefix) && f.endsWith(suffix))
      .map(f => join(dir, f));
  }

  // Literal path
  return [resolve(dir, pattern)];
}

async function globRecursive(dir: string, pattern: string): Promise<string[]> {
  const results: string[] = [];
  const parts = pattern.split('**');
  const prefix = parts[0]?.replace(/[/\\]$/, '') ?? '';
  const suffix = parts[1]?.replace(/^[/\\]/, '') ?? '';

  async function walk(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        if (matchesPattern(fullPath, prefix, suffix)) {
          results.push(fullPath);
        }
      }
    }
  }

  const startDir = prefix ? join(dir, prefix) : dir;
  await walk(startDir);
  return results;
}

function matchesPattern(path: string, prefix: string, suffix: string): boolean {
  if (suffix) {
    if (suffix.startsWith('*.')) {
      const ext = suffix.slice(1);
      return path.endsWith(ext);
    }
    return path.endsWith(suffix);
  }
  return true;
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Path utilities for template context
 */
export const pathUtils = {
  join,
  resolve,
  basename,
  dirname,
  extname,
};

// ============================================================================
// Context Merging
// ============================================================================

/**
 * Deep merge two contexts
 */
export function mergeContexts(
  target: TemplateContext,
  source: TemplateContext
): TemplateContext {
  const result = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeContexts(
        result[key] as TemplateContext,
        value as TemplateContext
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Create a child context that inherits from parent
 */
export function createChildContext(
  parent: TemplateContext,
  data: TemplateContext
): TemplateContext {
  return {
    ...parent,
    ...data,
    $parent: parent,
  };
}

// ============================================================================
// Context Lookup
// ============================================================================

/**
 * Look up a value in context by path
 */
export function lookup(
  context: TemplateContext,
  path: string
): unknown {
  if (!path) {
    return context;
  }

  const parts = path.split('.');
  let current: unknown = context;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current !== 'object') {
      return undefined;
    }

    // Handle array index access
    if (part.startsWith('[') && part.endsWith(']')) {
      const index = parseInt(part.slice(1, -1), 10);
      current = (current as unknown[])[index];
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

/**
 * Set a value in context by path
 */
export function setPath(
  context: TemplateContext,
  path: string,
  value: unknown
): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = context;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1];
  current[lastPart] = value;
}

// ============================================================================
// Request/Response Context
// ============================================================================

/**
 * Build request context from HTTP request data
 */
export function buildRequestContext(
  method: string,
  url: string,
  headers?: Record<string, string>,
  body?: unknown
): RequestContext {
  const parsedUrl = new URL(url, 'http://localhost');

  return {
    method: method.toUpperCase(),
    url,
    headers: headers ?? {},
    query: Object.fromEntries(parsedUrl.searchParams),
    body,
  };
}

/**
 * Build response context from HTTP response data
 */
export function buildResponseContext(
  status: number,
  statusText: string,
  headers?: Record<string, string>,
  body?: unknown
): ResponseContext {
  return {
    status,
    statusText,
    headers: headers ?? {},
    body,
  };
}

// ============================================================================
// Context Validation
// ============================================================================

/**
 * Check if context has all required variables
 */
export function validateContext(
  context: TemplateContext,
  requiredVars: string[]
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const varName of requiredVars) {
    const value = lookup(context, varName);
    if (value === undefined) {
      missing.push(varName);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a context builder with default options
 */
export function createContextBuilder(
  defaults: Partial<ContextBuilderOptions> = {}
): {
  build: (options?: ContextBuilderOptions) => Promise<TemplateContext>;
  buildSync: (options?: Omit<ContextBuilderOptions, 'files'>) => TemplateContext;
} {
  return {
    async build(options: ContextBuilderOptions = {}): Promise<TemplateContext> {
      return buildContext({ ...defaults, ...options });
    },
    buildSync(options: Omit<ContextBuilderOptions, 'files'> = {}): TemplateContext {
      return buildContextSync({ ...defaults, ...options });
    },
  };
}

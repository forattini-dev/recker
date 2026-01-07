/**
 * Template Engine
 *
 * The main TemplateEngine class that compiles and renders templates.
 * Supports expression syntax with 50+ built-in helpers.
 */

import type {
  TemplateOptions,
  TemplateContext,
  TemplateFormat,
  TemplateEngineInterface,
  CompiledTemplate,
  RenderOptions,
  ProgramNode,
  ASTNode,
  ExpressionNode,
  RawExpressionNode,
  BlockNode,
  PartialNode,
  TextNode,
  PathExpression,
  Expression,
  FilterExpression,
  TemplateHelper,
  TemplateFilter,
  HelperContext,
  BlockHelperOptions,
  ValidationResult,
  CacheEntry,
  TemplateCache,
} from './types.js';
import { parse, validate as validateSyntax, hasTemplateExpressions } from './compiler.js';
import { getEscaper, toString, SafeString, isSafeStringInstance } from './escaping.js';
import { lookup, mergeContexts } from './context.js';
import {
  getHelper,
  hasHelper,
  registerHelper as globalRegisterHelper,
  registerHelpers as globalRegisterHelpers,
  getHelperNames,
} from './helpers/index.js';
import {
  TemplateRuntimeError,
  UnknownHelperError,
  UnknownFilterError,
  UnknownPartialError,
  HelperError,
  FilterError,
  UndefinedVariableError,
  wrapError,
} from './errors.js';

// ============================================================================
// Template Cache
// ============================================================================

class LRUCache implements TemplateCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  get(key: string): CacheEntry | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, entry);
      entry.hits++;
    }
    return entry;
  }

  set(key: string, entry: CacheEntry): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, entry);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ============================================================================
// Filter Registry
// ============================================================================

const defaultFilters: Record<string, TemplateFilter> = {
  // String filters
  uppercase: (v) => toString(v).toUpperCase(),
  lowercase: (v) => toString(v).toLowerCase(),
  capitalize: (v) => {
    const s = toString(v);
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  },
  trim: (v) => toString(v).trim(),
  ltrim: (v) => toString(v).trimStart(),
  rtrim: (v) => toString(v).trimEnd(),
  truncate: (v, length: number = 50, suffix: string = '...') => {
    const s = toString(v);
    if (s.length <= length) return s;
    return s.slice(0, length - suffix.length) + suffix;
  },
  replace: (v, search: string, replacement: string = '') =>
    toString(v).replaceAll(search, replacement),
  split: (v, separator: string = ',') => toString(v).split(separator),
  slice: (v, start: number = 0, end?: number) => {
    if (Array.isArray(v)) return v.slice(start, end);
    return toString(v).slice(start, end);
  },
  pad: (v, length: number, char: string = ' ') =>
    toString(v).padStart(length, char),
  padEnd: (v, length: number, char: string = ' ') =>
    toString(v).padEnd(length, char),

  // Encoding filters
  base64: (v) => Buffer.from(toString(v)).toString('base64'),
  base64decode: (v) => Buffer.from(toString(v), 'base64').toString('utf-8'),
  urlencode: (v) => encodeURIComponent(toString(v)),
  urldecode: (v) => decodeURIComponent(toString(v)),
  json: (v) => JSON.stringify(v),
  jsonPretty: (v) => JSON.stringify(v, null, 2),

  // Array filters
  first: (v) => (Array.isArray(v) ? v[0] : v),
  last: (v) => (Array.isArray(v) ? v[v.length - 1] : v),
  reverse: (v) => (Array.isArray(v) ? [...v].reverse() : toString(v).split('').reverse().join('')),
  sort: (v) => {
    if (!Array.isArray(v)) return v;
    // Sort numbers numerically, strings alphabetically
    return [...v].sort((a, b) => {
      if (typeof a === 'number' && typeof b === 'number') {
        return a - b;
      }
      return String(a).localeCompare(String(b));
    });
  },
  unique: (v) => (Array.isArray(v) ? [...new Set(v)] : v),
  default: (v, fallback: unknown) => (v === null || v === undefined || v === '' ? fallback : v),
  join: (v, separator: string = ', ') => (Array.isArray(v) ? v.join(separator) : toString(v)),
  pluck: (v, key: string) =>
    Array.isArray(v) ? v.map((item) => (item as Record<string, unknown>)?.[key]) : v,
  where: (v, key: string, value: unknown) =>
    Array.isArray(v) ? v.filter((item) => (item as Record<string, unknown>)?.[key] === value) : v,
  size: (v) => {
    if (Array.isArray(v)) return v.length;
    if (typeof v === 'string') return v.length;
    if (typeof v === 'object' && v !== null) return Object.keys(v).length;
    return 0;
  },

  // Number filters
  abs: (v) => Math.abs(Number(v)),
  ceil: (v) => Math.ceil(Number(v)),
  floor: (v) => Math.floor(Number(v)),
  round: (v, decimals: number = 0) => {
    const factor = Math.pow(10, decimals);
    return Math.round(Number(v) * factor) / factor;
  },
  fixed: (v, decimals: number = 2) => Number(v).toFixed(decimals),
  number: (v) => Number(v),

  // Date filters
  date: (v, format?: string) => {
    const d = v instanceof Date ? v : new Date(v as string | number);
    if (!format) return d.toISOString();
    // Simple format support
    return format
      .replace('YYYY', String(d.getFullYear()))
      .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
      .replace('DD', String(d.getDate()).padStart(2, '0'))
      .replace('HH', String(d.getHours()).padStart(2, '0'))
      .replace('mm', String(d.getMinutes()).padStart(2, '0'))
      .replace('ss', String(d.getSeconds()).padStart(2, '0'));
  },

  // Type conversion
  string: (v) => toString(v),
  int: (v) => parseInt(toString(v), 10),
  float: (v) => parseFloat(toString(v)),
  bool: (v) => Boolean(v),

  // Escape filters
  escape: (v) => {
    const s = toString(v);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
  safe: (v) => new SafeString(toString(v)),

  // Debug
  debug: (v) => {
    console.log('[Template Debug]', v);
    return v;
  },
  type: (v) => {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  },
};

// ============================================================================
// Template Engine
// ============================================================================

export class TemplateEngine implements TemplateEngineInterface {
  private options: TemplateOptions;
  private cache: TemplateCache;
  private helpers: Map<string, TemplateHelper> = new Map();
  private filters: Map<string, TemplateFilter> = new Map();
  private partials: Map<string, string> = new Map();

  constructor(options: TemplateOptions = {}) {
    this.options = {
      format: 'raw',
      strict: false,
      cache: true,
      cacheTTL: 300000, // 5 minutes
      ...options,
    };

    this.cache = new LRUCache(100);

    // Register default filters
    for (const [name, filter] of Object.entries(defaultFilters)) {
      this.filters.set(name, filter);
    }

    // Register custom helpers/filters from options
    if (options.helpers) {
      for (const [name, helper] of Object.entries(options.helpers)) {
        this.helpers.set(name, helper);
      }
    }

    if (options.filters) {
      for (const [name, filter] of Object.entries(options.filters)) {
        this.filters.set(name, filter);
      }
    }

    if (options.partials) {
      for (const [name, template] of Object.entries(options.partials)) {
        this.partials.set(name, template);
      }
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Compile a template to a render function
   */
  compile(template: string, options?: TemplateOptions): CompiledTemplate {
    const mergedOptions = { ...this.options, ...options };
    const cacheKey = this.getCacheKey(template, mergedOptions);

    // Check cache
    if (mergedOptions.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached.template;
      }
    }

    // Parse template
    const ast = parse(template, mergedOptions);

    // Create render function
    const compiled: CompiledTemplate = async (
      context: TemplateContext,
      renderOptions?: RenderOptions
    ) => {
      return this.renderAST(ast, context, { ...mergedOptions, ...renderOptions });
    };

    // Cache
    if (mergedOptions.cache) {
      this.cache.set(cacheKey, {
        template: compiled,
        ast,
        createdAt: Date.now(),
        hits: 0,
      });
    }

    return compiled;
  }

  /**
   * Render a template with context
   */
  async render(
    template: string,
    context: TemplateContext = {},
    options?: TemplateOptions
  ): Promise<string> {
    const compiled = this.compile(template, options);
    return compiled(context, options);
  }

  /**
   * Render synchronously (only works with sync helpers)
   */
  renderSync(
    template: string,
    context: TemplateContext = {},
    options?: TemplateOptions
  ): string {
    // For sync rendering, we'll throw if any async helper is used
    throw new TemplateRuntimeError(
      'Synchronous rendering is not yet implemented. Use render() instead.'
    );
  }

  /**
   * Render with JSON escaping
   */
  async json(
    template: string,
    context: TemplateContext = {},
    options?: TemplateOptions
  ): Promise<string> {
    return this.render(template, context, { ...options, format: 'json' });
  }

  /**
   * Render with XML escaping
   */
  async xml(
    template: string,
    context: TemplateContext = {},
    options?: TemplateOptions
  ): Promise<string> {
    return this.render(template, context, { ...options, format: 'xml' });
  }

  /**
   * Render with HTML escaping
   */
  async html(
    template: string,
    context: TemplateContext = {},
    options?: TemplateOptions
  ): Promise<string> {
    return this.render(template, context, { ...options, format: 'html' });
  }

  /**
   * Render with URL encoding
   */
  async url(
    template: string,
    context: TemplateContext = {},
    options?: TemplateOptions
  ): Promise<string> {
    return this.render(template, context, { ...options, format: 'url' });
  }

  /**
   * Register a helper
   */
  registerHelper(name: string, helper: TemplateHelper): void {
    this.helpers.set(name, helper);
    globalRegisterHelper(name, helper);
  }

  /**
   * Register multiple helpers
   */
  registerHelpers(helpers: Record<string, TemplateHelper>): void {
    for (const [name, helper] of Object.entries(helpers)) {
      this.helpers.set(name, helper);
    }
    globalRegisterHelpers(helpers);
  }

  /**
   * Unregister a helper
   */
  unregisterHelper(name: string): void {
    this.helpers.delete(name);
  }

  /**
   * Register a filter
   */
  registerFilter(name: string, filter: TemplateFilter): void {
    this.filters.set(name, filter);
  }

  /**
   * Register a partial
   */
  registerPartial(name: string, template: string): void {
    this.partials.set(name, template);
  }

  /**
   * Parse template to AST
   */
  parse(template: string): ProgramNode {
    return parse(template, this.options);
  }

  /**
   * Validate template syntax
   */
  validate(template: string): ValidationResult {
    const result = validateSyntax(template, this.options);
    return {
      valid: result.valid,
      errors: result.errors.map((e) => ({
        message: e.message,
        line: e.line ?? 0,
        column: e.column ?? 0,
      })),
      warnings: [],
    };
  }

  /**
   * Get registered helper names
   */
  getHelpers(): string[] {
    return [...new Set([...this.helpers.keys(), ...getHelperNames()])];
  }

  /**
   * Get registered filter names
   */
  getFilters(): string[] {
    return Array.from(this.filters.keys());
  }

  /**
   * Clear template cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ============================================================================
  // AST Rendering
  // ============================================================================

  private async renderAST(
    ast: ProgramNode,
    context: TemplateContext,
    options: TemplateOptions
  ): Promise<string> {
    const results: string[] = [];

    for (const node of ast.body) {
      results.push(await this.renderNode(node, context, options));
    }

    return results.join('');
  }

  private async renderNode(
    node: ASTNode,
    context: TemplateContext,
    options: TemplateOptions
  ): Promise<string> {
    switch (node.type) {
      case 'TextNode':
        return (node as TextNode).value;

      case 'ExpressionNode':
        return this.renderExpression(node as ExpressionNode, context, options, true);

      case 'RawExpressionNode':
        return this.renderExpression(node as RawExpressionNode, context, options, false);

      case 'BlockNode':
        return this.renderBlock(node as BlockNode, context, options);

      case 'PartialNode':
        return this.renderPartial(node as PartialNode, context, options);

      case 'CommentNode':
        return ''; // Comments don't render

      default:
        return '';
    }
  }

  private async renderExpression(
    node: ExpressionNode | RawExpressionNode,
    context: TemplateContext,
    options: TemplateOptions,
    escape: boolean
  ): Promise<string> {
    // Get the value
    let value = await this.evaluateExpression(node.path, node.params, node.hash, context, options);

    // Apply filters
    for (const filterExpr of node.filters) {
      const filter = this.filters.get(filterExpr.name);
      if (!filter) {
        throw new UnknownFilterError(filterExpr.name, {
          location: node.loc,
          availableFilters: this.getFilters(),
        });
      }

      try {
        const filterParams = await Promise.all(
          filterExpr.params.map((p) => this.evaluateParam(p, context, options))
        );
        value = filter(value, ...filterParams);
      } catch (error) {
        throw new FilterError(filterExpr.name, error as Error, {
          location: node.loc,
        });
      }
    }

    // Handle SafeString (pre-escaped)
    if (isSafeStringInstance(value)) {
      return value.toString();
    }

    // Escape output
    if (escape && options.format !== 'raw') {
      const escaper = getEscaper(options.format ?? 'raw');
      return escaper(value);
    }

    return toString(value);
  }

  private async renderBlock(
    node: BlockNode,
    context: TemplateContext,
    options: TemplateOptions
  ): Promise<string> {
    const helperName = node.path.original;

    // Get helper
    const helper = this.helpers.get(helperName) ?? getHelper(helperName);

    if (!helper) {
      throw new UnknownHelperError(helperName, {
        location: node.loc,
        availableHelpers: this.getHelpers(),
      });
    }

    // Evaluate params
    const params = await Promise.all(
      node.params.map((p) => this.evaluateParam(p, context, options))
    );

    // Build hash
    const hash: Record<string, unknown> = {};
    for (const pair of node.hash) {
      hash[pair.key] = await this.evaluateParam(pair.value, context, options);
    }

    // Create block options
    const blockOptions: BlockHelperOptions = {
      fn: async (blockContext?: TemplateContext) => {
        const mergedContext = blockContext
          ? mergeContexts(context, blockContext)
          : context;
        return this.renderAST(node.program, mergedContext, options);
      },
      inverse: async (blockContext?: TemplateContext) => {
        if (!node.inverse) return '';
        const mergedContext = blockContext
          ? mergeContexts(context, blockContext)
          : context;
        return this.renderAST(node.inverse, mergedContext, options);
      },
      hash,
      data: context,
      root: (context.$root ?? context) as TemplateContext,
    };

    // Create helper context
    const helperContext: HelperContext = {
      data: context,
      root: (context.$root ?? context) as TemplateContext,
      hash,
      fn: blockOptions.fn,
      inverse: blockOptions.inverse,
      options,
      escape: getEscaper(options.format ?? 'raw'),
      lookup: (ctx, path) => lookup(ctx, path),
      engine: this,
    };

    try {
      const result = await helper.call(helperContext, ...params, blockOptions);
      return toString(result);
    } catch (error) {
      if (error instanceof TemplateRuntimeError) {
        throw error;
      }
      throw new HelperError(helperName, error as Error, {
        location: node.loc,
      });
    }
  }

  private async renderPartial(
    node: PartialNode,
    context: TemplateContext,
    options: TemplateOptions
  ): Promise<string> {
    const partialTemplate = this.partials.get(node.name);

    if (!partialTemplate) {
      throw new UnknownPartialError(node.name, {
        location: node.loc,
      });
    }

    // Build partial context from hash
    let partialContext = context;
    if (node.hash.length > 0) {
      const hashContext: TemplateContext = {};
      for (const pair of node.hash) {
        hashContext[pair.key] = await this.evaluateParam(pair.value, context, options);
      }
      partialContext = mergeContexts(context, hashContext);
    }

    return this.render(partialTemplate, partialContext, options);
  }

  // ============================================================================
  // Expression Evaluation
  // ============================================================================

  private async evaluateExpression(
    path: PathExpression,
    params: Expression[],
    hash: { key: string; value: Expression }[],
    context: TemplateContext,
    options: TemplateOptions
  ): Promise<unknown> {
    const name = path.original;

    // Check if it's a helper call
    const helper = this.helpers.get(name) ?? getHelper(name);

    if (helper) {
      // Evaluate params
      const evaluatedParams = await Promise.all(
        params.map((p) => this.evaluateParam(p, context, options))
      );

      // Build hash
      const evaluatedHash: Record<string, unknown> = {};
      for (const pair of hash) {
        evaluatedHash[pair.key] = await this.evaluateParam(pair.value, context, options);
      }

      // Create helper context
      const helperContext: HelperContext = {
        data: context,
        root: (context.$root ?? context) as TemplateContext,
        hash: evaluatedHash,
        options,
        escape: getEscaper(options.format ?? 'raw'),
        lookup: (ctx, p) => lookup(ctx, p),
        engine: this,
      };

      try {
        return await helper.call(helperContext, ...evaluatedParams);
      } catch (error) {
        if (error instanceof TemplateRuntimeError) {
          throw error;
        }
        throw new HelperError(name, error as Error);
      }
    }

    // It's a path expression
    return this.evaluatePath(path, context, options);
  }

  private evaluatePath(
    path: PathExpression,
    context: TemplateContext,
    options: TemplateOptions
  ): unknown {
    // Handle @data variables
    if (path.data) {
      const dataName = path.parts[0];
      return context['@' + dataName] ?? context[dataName];
    }

    // Handle parent access (../)
    let currentContext = context;
    for (let i = 0; i < path.depth; i++) {
      currentContext = (currentContext.$parent as TemplateContext) ?? currentContext;
    }

    // Handle "this" or "."
    if (path.parts.length === 0 || (path.parts.length === 1 && path.parts[0] === '')) {
      return currentContext.this ?? currentContext;
    }

    // Lookup path
    const value = lookup(currentContext, path.original);

    // Strict mode check
    if (value === undefined && options.strict) {
      throw new UndefinedVariableError(path.original);
    }

    return value;
  }

  private async evaluateParam(
    param: Expression,
    context: TemplateContext,
    options: TemplateOptions
  ): Promise<unknown> {
    switch (param.type) {
      case 'StringLiteral':
        return param.value;

      case 'NumberLiteral':
        return param.value;

      case 'BooleanLiteral':
        return param.value;

      case 'NullLiteral':
        return null;

      case 'PathExpression':
        return this.evaluatePath(param, context, options);

      case 'SubExpression': {
        let result = await this.evaluateExpression(
          param.path,
          param.params,
          param.hash,
          context,
          options
        );
        // Apply filters if present
        if (param.filters && param.filters.length > 0) {
          result = await this.applyFilters(result, param.filters, context, options);
        }
        return result;
      }

      default:
        return undefined;
    }
  }

  // ============================================================================
  // Filters
  // ============================================================================

  private async applyFilters(
    value: unknown,
    filters: FilterExpression[],
    context: Record<string, unknown>,
    options: TemplateOptions
  ): Promise<unknown> {
    for (const filterExpr of filters) {
      const filter = this.filters.get(filterExpr.name);
      if (!filter) {
        throw new UnknownFilterError(filterExpr.name, {
          availableFilters: this.getFilters(),
        });
      }

      try {
        const filterParams = await Promise.all(
          filterExpr.params.map((p) => this.evaluateParam(p, context, options))
        );
        value = filter(value, ...filterParams);
      } catch (error) {
        throw new FilterError(filterExpr.name, error as Error);
      }
    }
    return value;
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private getCacheKey(template: string, options: TemplateOptions): string {
    // Simple hash for cache key
    return `${template.length}:${hashString(template)}:${options.format ?? 'raw'}`;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Simple string hash function
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new template engine instance
 */
export function createTemplateEngine(options?: TemplateOptions): TemplateEngine {
  return new TemplateEngine(options);
}

/**
 * Quick template rendering
 */
export async function template(
  templateStr: string,
  context: TemplateContext = {},
  options?: TemplateOptions
): Promise<string> {
  const engine = new TemplateEngine(options);
  return engine.render(templateStr, context);
}

/**
 * Check if string contains template expressions
 */
export { hasTemplateExpressions };

// ============================================================================
// Default Instance
// ============================================================================

/**
 * Default template engine instance
 */
export const defaultEngine = new TemplateEngine();

/**
 * Template Engine Types
 *
 * Complete type definitions for Recker's template engine.
 * Supports expression syntax with 50+ built-in helpers.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Template context - data available during rendering
 */
export interface TemplateContext {
  [key: string]: unknown;
}

/**
 * Template options for compilation and rendering
 */
export interface TemplateOptions {
  /**
   * Output format - determines escaping strategy
   * @default 'raw'
   */
  format?: TemplateFormat;

  /**
   * Strict mode - throw on undefined variables
   * @default false
   */
  strict?: boolean;

  /**
   * Enable caching of compiled templates
   * @default true
   */
  cache?: boolean;

  /**
   * Cache TTL in milliseconds
   * @default 300000 (5 minutes)
   */
  cacheTTL?: number;

  /**
   * Base directory for file includes
   */
  baseDir?: string;

  /**
   * Custom helpers to register
   */
  helpers?: Record<string, TemplateHelper>;

  /**
   * Custom filters to register
   */
  filters?: Record<string, TemplateFilter>;

  /**
   * Partials (reusable template fragments)
   */
  partials?: Record<string, string>;

  /**
   * Environment variables to include in context
   * - true: include all
   * - string[]: include only listed
   * - string: include matching prefix (e.g., 'API_')
   */
  env?: boolean | string[] | string;

  /**
   * Delimiters for template expressions
   * @default ['{{', '}}']
   */
  delimiters?: [string, string];

  /**
   * Raw delimiters (no escaping)
   * @default ['{{{', '}}}']
   */
  rawDelimiters?: [string, string];
}

/**
 * Output format for escaping
 */
export type TemplateFormat = 'raw' | 'json' | 'xml' | 'html' | 'url' | 'csv';

// ============================================================================
// AST Types
// ============================================================================

/**
 * AST node types
 */
export type ASTNodeType =
  | 'Program'
  | 'TextNode'
  | 'ExpressionNode'
  | 'RawExpressionNode'
  | 'BlockNode'
  | 'PartialNode'
  | 'CommentNode';

/**
 * Base AST node
 */
export interface ASTNode {
  type: ASTNodeType;
  loc?: SourceLocation;
}

/**
 * Source location for error reporting
 */
export interface SourceLocation {
  start: Position;
  end: Position;
}

export interface Position {
  line: number;
  column: number;
}

/**
 * Program node - root of AST
 */
export interface ProgramNode extends ASTNode {
  type: 'Program';
  body: ASTNode[];
}

/**
 * Text node - literal text
 */
export interface TextNode extends ASTNode {
  type: 'TextNode';
  value: string;
}

/**
 * Expression node - {{expression}}
 */
export interface ExpressionNode extends ASTNode {
  type: 'ExpressionNode';
  path: PathExpression;
  params: Expression[];
  hash: HashPair[];
  filters: FilterExpression[];
}

/**
 * Raw expression node - {{{expression}}} (no escaping)
 */
export interface RawExpressionNode extends ASTNode {
  type: 'RawExpressionNode';
  path: PathExpression;
  params: Expression[];
  hash: HashPair[];
  filters: FilterExpression[];
}

// Backwards compatibility aliases
/** @deprecated Use ExpressionNode instead */
export type MustacheNode = ExpressionNode;
/** @deprecated Use RawExpressionNode instead */
export type RawMustacheNode = RawExpressionNode;

/**
 * Block node - {{#helper}}...{{/helper}}
 */
export interface BlockNode extends ASTNode {
  type: 'BlockNode';
  path: PathExpression;
  params: Expression[];
  hash: HashPair[];
  program: ProgramNode;
  inverse?: ProgramNode;
}

/**
 * Partial node - {{> partial}}
 */
export interface PartialNode extends ASTNode {
  type: 'PartialNode';
  name: string;
  context?: PathExpression;
  hash: HashPair[];
}

/**
 * Comment node - {{! comment }} or {{!-- comment --}}
 */
export interface CommentNode extends ASTNode {
  type: 'CommentNode';
  value: string;
}

/**
 * Path expression - variable.path.to.value
 */
export interface PathExpression {
  type: 'PathExpression';
  original: string;
  parts: string[];
  depth: number; // For ../parent access
  data: boolean; // For @data variables
}

/**
 * Expression types
 */
export type Expression =
  | PathExpression
  | StringLiteral
  | NumberLiteral
  | BooleanLiteral
  | NullLiteral
  | SubExpression;

/**
 * String literal - "value" or 'value'
 */
export interface StringLiteral {
  type: 'StringLiteral';
  value: string;
  original: string;
}

/**
 * Number literal
 */
export interface NumberLiteral {
  type: 'NumberLiteral';
  value: number;
  original: string;
}

/**
 * Boolean literal
 */
export interface BooleanLiteral {
  type: 'BooleanLiteral';
  value: boolean;
}

/**
 * Null literal
 */
export interface NullLiteral {
  type: 'NullLiteral';
  value: null;
}

/**
 * Sub-expression - (helper arg1 arg2) or (value | filter)
 */
export interface SubExpression {
  type: 'SubExpression';
  path: PathExpression;
  params: Expression[];
  hash: HashPair[];
  filters?: FilterExpression[];
}

/**
 * Hash pair - key=value
 */
export interface HashPair {
  key: string;
  value: Expression;
}

/**
 * Filter expression - | filterName arg1 arg2
 */
export interface FilterExpression {
  name: string;
  params: Expression[];
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Helper function signature
 * Uses `any[]` to allow typed helper implementations
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TemplateHelper = (this: HelperContext, ...args: any[]) => any;

/**
 * Context available to helpers
 */
export interface HelperContext {
  /**
   * Current data context
   */
  data: TemplateContext;

  /**
   * Root context
   */
  root: TemplateContext;

  /**
   * Hash arguments (key=value pairs)
   */
  hash: Record<string, unknown>;

  /**
   * For block helpers - render the block content
   */
  fn?: (context?: TemplateContext) => Promise<string>;

  /**
   * For block helpers - render the else block
   */
  inverse?: (context?: TemplateContext) => Promise<string>;

  /**
   * Template options
   */
  options: TemplateOptions;

  /**
   * Escape function for current format
   */
  escape: (value: unknown) => string;

  /**
   * Lookup a value in context
   */
  lookup: (context: TemplateContext, path: string) => unknown;

  /**
   * Engine instance for recursive rendering
   */
  engine: TemplateEngineInterface;
}

/**
 * Block helper options (passed as last argument)
 */
export interface BlockHelperOptions {
  /**
   * Render the block content
   */
  fn: (context?: TemplateContext) => Promise<string>;

  /**
   * Render the else block
   */
  inverse: (context?: TemplateContext) => Promise<string>;

  /**
   * Hash arguments
   */
  hash: Record<string, unknown>;

  /**
   * Data context
   */
  data: TemplateContext;

  /**
   * Root context
   */
  root: TemplateContext;
}

// ============================================================================
// Filter Types
// ============================================================================

/**
 * Filter function signature
 * Uses `any[]` to allow typed filter implementations
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TemplateFilter = (value: unknown, ...args: any[]) => any;

// ============================================================================
// Compiled Template Types
// ============================================================================

/**
 * Compiled template function
 */
export type CompiledTemplate = (
  context: TemplateContext,
  options?: RenderOptions
) => Promise<string>;

/**
 * Synchronous compiled template
 */
export type CompiledTemplateSync = (
  context: TemplateContext,
  options?: RenderOptions
) => string;

/**
 * Render options (subset of TemplateOptions for runtime)
 */
export interface RenderOptions {
  /**
   * Additional data to merge into context
   */
  data?: TemplateContext;

  /**
   * Override format
   */
  format?: TemplateFormat;

  /**
   * Override strict mode
   */
  strict?: boolean;

  /**
   * Parent context (for partials)
   */
  parent?: TemplateContext;
}

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cache entry for compiled templates
 */
export interface CacheEntry {
  template: CompiledTemplate;
  ast: ProgramNode;
  createdAt: number;
  hits: number;
}

/**
 * Cache interface
 */
export interface TemplateCache {
  get(key: string): CacheEntry | undefined;
  set(key: string, entry: CacheEntry): void;
  delete(key: string): boolean;
  clear(): void;
  size: number;
}

// ============================================================================
// Engine Interface
// ============================================================================

/**
 * Template engine interface
 */
export interface TemplateEngineInterface {
  /**
   * Compile a template string to a function
   */
  compile(template: string, options?: TemplateOptions): CompiledTemplate;

  /**
   * Render a template with context
   */
  render(template: string, context?: TemplateContext, options?: TemplateOptions): Promise<string>;

  /**
   * Render synchronously (only works with sync helpers)
   */
  renderSync(template: string, context?: TemplateContext, options?: TemplateOptions): string;

  /**
   * Render with JSON escaping
   */
  json(template: string, context?: TemplateContext, options?: TemplateOptions): Promise<string>;

  /**
   * Render with XML escaping
   */
  xml(template: string, context?: TemplateContext, options?: TemplateOptions): Promise<string>;

  /**
   * Render with HTML escaping
   */
  html(template: string, context?: TemplateContext, options?: TemplateOptions): Promise<string>;

  /**
   * Render with URL encoding
   */
  url(template: string, context?: TemplateContext, options?: TemplateOptions): Promise<string>;

  /**
   * Register a helper
   */
  registerHelper(name: string, helper: TemplateHelper): void;

  /**
   * Register multiple helpers
   */
  registerHelpers(helpers: Record<string, TemplateHelper>): void;

  /**
   * Unregister a helper
   */
  unregisterHelper(name: string): void;

  /**
   * Register a filter
   */
  registerFilter(name: string, filter: TemplateFilter): void;

  /**
   * Register a partial
   */
  registerPartial(name: string, template: string): void;

  /**
   * Parse template to AST (for debugging/validation)
   */
  parse(template: string): ProgramNode;

  /**
   * Validate template syntax
   */
  validate(template: string): ValidationResult;

  /**
   * Get registered helper names
   */
  getHelpers(): string[];

  /**
   * Get registered filter names
   */
  getFilters(): string[];

  /**
   * Clear template cache
   */
  clearCache(): void;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  message: string;
  line: number;
  column: number;
  source?: string;
}

export interface ValidationWarning {
  message: string;
  line: number;
  column: number;
  source?: string;
}

// ============================================================================
// Helper Categories
// ============================================================================

/**
 * Helper category for documentation
 */
export interface HelperCategory {
  name: string;
  description: string;
  helpers: HelperDefinition[];
}

/**
 * Helper definition for documentation
 */
export interface HelperDefinition {
  name: string;
  description: string;
  signature: string;
  examples: string[];
  isBlock?: boolean;
}

// ============================================================================
// Context Builder Types
// ============================================================================

/**
 * Context builder options
 */
export interface ContextBuilderOptions {
  /**
   * Include environment variables
   */
  env?: boolean | string[] | string;

  /**
   * Include file contents
   */
  files?: Record<string, string>;

  /**
   * Base directory for file resolution
   */
  baseDir?: string;

  /**
   * Command line arguments
   */
  args?: Record<string, unknown>;

  /**
   * HTTP request data
   */
  request?: RequestContext;

  /**
   * HTTP response data (for response templates)
   */
  response?: ResponseContext;
}

/**
 * Request context for HTTP request templates
 */
export interface RequestContext {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}

/**
 * Response context for HTTP response templates
 */
export interface ResponseContext {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

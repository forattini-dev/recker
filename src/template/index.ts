/**
 * Recker Template Engine
 *
 * A powerful template engine with 50+ built-in helpers,
 * pipe filters, and format-specific escaping.
 *
 * @example Basic usage
 * ```typescript
 * import { template, TemplateEngine } from 'recker';
 *
 * // Quick render
 * const result = await template('Hello {{name}}!', { name: 'World' });
 *
 * // With engine instance
 * const engine = new TemplateEngine({ format: 'json' });
 * const json = await engine.render('{"user": "{{user}}"}', { user: 'John' });
 * ```
 *
 * @example Helpers and filters
 * ```typescript
 * // Built-in helpers
 * await template('{{#if user}}Hello {{user.name}}{{/if}}', { user: { name: 'John' } });
 *
 * // Pipe filters
 * await template('{{name | uppercase | truncate 10}}', { name: 'John Doe' });
 *
 * // Comparisons
 * await template('{{#if (gt age 18)}}Adult{{else}}Minor{{/if}}', { age: 25 });
 * ```
 *
 * @example Format-specific rendering
 * ```typescript
 * const engine = new TemplateEngine();
 *
 * // JSON escaping
 * await engine.json('{"name": "{{name}}"}', { name: 'O\'Brien' });
 * // → {"name": "O'Brien"}
 *
 * // HTML escaping
 * await engine.html('<p>{{html}}</p>', { html: '<script>evil</script>' });
 * // → <p>&lt;script&gt;evil&lt;/script&gt;</p>
 *
 * // URL encoding
 * await engine.url('https://api.com/search?q={{query}}', { query: 'hello world' });
 * // → https://api.com/search?q=hello%20world
 * ```
 */

// ============================================================================
// Core Engine
// ============================================================================

export {
  TemplateEngine,
  createTemplateEngine,
  template,
  defaultEngine,
  hasTemplateExpressions,
} from './engine.js';

// ============================================================================
// Compiler
// ============================================================================

export {
  parse,
  validate,
  extractVariables,
} from './compiler.js';

// ============================================================================
// Context Builder
// ============================================================================

export {
  buildContext,
  buildContextSync,
  getEnvContext,
  getEnv,
  getEnvRequired,
  hasEnv,
  loadFile,
  loadFileBase64,
  loadJsonFile,
  fileExists,
  globFiles,
  mergeContexts,
  createChildContext,
  lookup,
  setPath,
  buildRequestContext,
  buildResponseContext,
  validateContext,
  createContextBuilder,
  pathUtils,
} from './context.js';

// ============================================================================
// Escaping
// ============================================================================

export {
  escapeRaw,
  escapeHtml,
  escapeXml,
  escapeJson,
  escapeUrl,
  escapeUrlComponent,
  escapeCsv,
  escapeRegex,
  escapeYaml,
  getEscaper,
  getFormatName,
  unescapeHtml,
  unescapeUrl,
  unescapeJson,
  toString,
  isSafeString,
  SafeString,
  isSafeStringInstance,
  safe,
  isValidJson,
  isValidXml,
  isValidUrl,
} from './escaping.js';

// ============================================================================
// Helpers
// ============================================================================

export {
  registerHelper,
  registerHelpers,
  unregisterHelper,
  getHelper,
  hasHelper,
  getHelperNames,
  getAllHelpers,
  clearHelpers,
  resetHelpers,
  registerBuiltinHelpers,
  getHelperCategories,
  getHelpersByCategory,
  searchHelpers,
  coreHelpers,
} from './helpers/index.js';

export { isTruthy, isEmpty } from './helpers/core.js';

// ============================================================================
// Errors
// ============================================================================

export {
  TemplateError,
  TemplateSyntaxError,
  UnclosedBlockError,
  MismatchedBlockError,
  UnexpectedCloseBlockError,
  TemplateRuntimeError,
  UndefinedVariableError,
  UnknownHelperError,
  UnknownFilterError,
  UnknownPartialError,
  HelperError,
  FilterError,
  TemplateFileError,
  TemplateNotFoundError,
  CircularIncludeError,
  TemplateValidationError,
  isTemplateError,
  wrapError,
} from './errors.js';

// ============================================================================
// Types
// ============================================================================

export type {
  // Core types
  TemplateContext,
  TemplateOptions,
  TemplateFormat,
  RenderOptions,
  TemplateEngineInterface,
  CompiledTemplate,
  CompiledTemplateSync,
  ValidationResult,
  ValidationError,
  ValidationWarning,

  // AST types
  ASTNodeType,
  ASTNode,
  SourceLocation,
  Position,
  ProgramNode,
  TextNode,
  ExpressionNode,
  RawExpressionNode,
  BlockNode,
  PartialNode,
  CommentNode,
  PathExpression,
  Expression,
  StringLiteral,
  NumberLiteral,
  BooleanLiteral,
  NullLiteral,
  SubExpression,
  HashPair,
  FilterExpression,

  // Helper types
  TemplateHelper,
  HelperContext,
  BlockHelperOptions,
  TemplateFilter,
  HelperCategory,
  HelperDefinition,

  // Cache types
  CacheEntry,
  TemplateCache,

  // Context types
  ContextBuilderOptions,
  RequestContext,
  ResponseContext,
} from './types.js';

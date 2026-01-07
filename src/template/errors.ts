/**
 * Template Engine Errors
 *
 * Comprehensive error classes with rich context for debugging templates.
 */

import type { SourceLocation } from './types.js';

// ============================================================================
// Base Error
// ============================================================================

/**
 * Base template error with source location
 */
export class TemplateError extends Error {
  /**
   * Error code for programmatic handling
   */
  code: string;

  /**
   * Source location in template
   */
  readonly location?: SourceLocation;

  /**
   * Line number (1-indexed)
   */
  readonly line?: number;

  /**
   * Column number (1-indexed)
   */
  readonly column?: number;

  /**
   * Source template (truncated)
   */
  readonly source?: string;

  /**
   * Template name/path if available
   */
  readonly templateName?: string;

  constructor(
    message: string,
    options?: {
      code?: string;
      location?: SourceLocation;
      source?: string;
      templateName?: string;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'TemplateError';
    this.code = options?.code ?? 'TEMPLATE_ERROR';
    this.location = options?.location;
    this.line = options?.location?.start.line;
    this.column = options?.location?.start.column;
    this.source = options?.source;
    this.templateName = options?.templateName;

    if (options?.cause) {
      this.cause = options.cause;
    }

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Format error with source context
   */
  toDetailedString(): string {
    const parts: string[] = [this.message];

    if (this.templateName) {
      parts.push(`  Template: ${this.templateName}`);
    }

    if (this.line !== undefined && this.column !== undefined) {
      parts.push(`  Location: line ${this.line}, column ${this.column}`);
    }

    if (this.source) {
      parts.push('');
      parts.push(this.formatSourceContext());
    }

    return parts.join('\n');
  }

  /**
   * Format source with error indicator
   */
  private formatSourceContext(): string {
    if (!this.source || this.line === undefined) {
      return '';
    }

    const lines = this.source.split('\n');
    const startLine = Math.max(0, this.line - 3);
    const endLine = Math.min(lines.length, this.line + 2);

    const result: string[] = [];
    const lineNumWidth = String(endLine).length;

    for (let i = startLine; i < endLine; i++) {
      const lineNum = i + 1;
      const lineContent = lines[i];
      const prefix = lineNum === this.line ? '> ' : '  ';
      const paddedNum = String(lineNum).padStart(lineNumWidth, ' ');

      result.push(`${prefix}${paddedNum} | ${lineContent}`);

      // Add error indicator
      if (lineNum === this.line && this.column !== undefined) {
        const indicator = ' '.repeat(lineNumWidth + 4 + this.column - 1) + '^';
        result.push(`  ${indicator}`);
      }
    }

    return result.join('\n');
  }
}

// ============================================================================
// Syntax Errors
// ============================================================================

/**
 * Template syntax error (parsing phase)
 */
export class TemplateSyntaxError extends TemplateError {
  constructor(
    message: string,
    options?: {
      location?: SourceLocation;
      source?: string;
      templateName?: string;
      expected?: string;
      found?: string;
    }
  ) {
    let fullMessage = message;
    if (options?.expected && options?.found) {
      fullMessage = `${message}. Expected ${options.expected}, found ${options.found}`;
    }

    super(fullMessage, {
      code: 'SYNTAX_ERROR',
      ...options,
    });
    this.name = 'TemplateSyntaxError';
  }
}

/**
 * Unclosed block error
 */
export class UnclosedBlockError extends TemplateSyntaxError {
  readonly blockName: string;

  constructor(
    blockName: string,
    options?: {
      location?: SourceLocation;
      source?: string;
      templateName?: string;
    }
  ) {
    super(`Unclosed block: {{#${blockName}}} - missing {{/${blockName}}}`, {
      ...options,
    });
    this.name = 'UnclosedBlockError';
    this.code = 'UNCLOSED_BLOCK';
    this.blockName = blockName;
  }
}

/**
 * Mismatched block error
 */
export class MismatchedBlockError extends TemplateSyntaxError {
  readonly openBlock: string;
  readonly closeBlock: string;

  constructor(
    openBlock: string,
    closeBlock: string,
    options?: {
      location?: SourceLocation;
      source?: string;
      templateName?: string;
    }
  ) {
    super(`Mismatched block: opened with {{#${openBlock}}} but closed with {{/${closeBlock}}}`, {
      ...options,
    });
    this.name = 'MismatchedBlockError';
    this.code = 'MISMATCHED_BLOCK';
    this.openBlock = openBlock;
    this.closeBlock = closeBlock;
  }
}

/**
 * Unexpected close block error
 */
export class UnexpectedCloseBlockError extends TemplateSyntaxError {
  readonly blockName: string;

  constructor(
    blockName: string,
    options?: {
      location?: SourceLocation;
      source?: string;
      templateName?: string;
    }
  ) {
    super(`Unexpected closing block: {{/${blockName}}} without matching {{#${blockName}}}`, {
      ...options,
    });
    this.name = 'UnexpectedCloseBlockError';
    this.code = 'UNEXPECTED_CLOSE_BLOCK';
    this.blockName = blockName;
  }
}

// ============================================================================
// Runtime Errors
// ============================================================================

/**
 * Template runtime error (rendering phase)
 */
export class TemplateRuntimeError extends TemplateError {
  constructor(
    message: string,
    options?: {
      location?: SourceLocation;
      source?: string;
      templateName?: string;
      cause?: Error;
    }
  ) {
    super(message, {
      code: 'RUNTIME_ERROR',
      ...options,
    });
    this.name = 'TemplateRuntimeError';
  }
}

/**
 * Undefined variable error (strict mode)
 */
export class UndefinedVariableError extends TemplateRuntimeError {
  readonly variableName: string;

  constructor(
    variableName: string,
    options?: {
      location?: SourceLocation;
      source?: string;
      templateName?: string;
    }
  ) {
    super(`Undefined variable: ${variableName}`, {
      ...options,
    });
    this.name = 'UndefinedVariableError';
    this.code = 'UNDEFINED_VARIABLE';
    this.variableName = variableName;
  }
}

/**
 * Unknown helper error
 */
export class UnknownHelperError extends TemplateRuntimeError {
  readonly helperName: string;
  readonly availableHelpers: string[];

  constructor(
    helperName: string,
    options?: {
      location?: SourceLocation;
      source?: string;
      templateName?: string;
      availableHelpers?: string[];
    }
  ) {
    const available = options?.availableHelpers ?? [];
    const suggestions = findSimilar(helperName, available);

    let message = `Unknown helper: ${helperName}`;
    if (suggestions.length > 0) {
      message += `. Did you mean: ${suggestions.join(', ')}?`;
    }

    super(message, {
      ...options,
    });
    this.name = 'UnknownHelperError';
    this.code = 'UNKNOWN_HELPER';
    this.helperName = helperName;
    this.availableHelpers = available;
  }
}

/**
 * Unknown filter error
 */
export class UnknownFilterError extends TemplateRuntimeError {
  readonly filterName: string;
  readonly availableFilters: string[];

  constructor(
    filterName: string,
    options?: {
      location?: SourceLocation;
      source?: string;
      templateName?: string;
      availableFilters?: string[];
    }
  ) {
    const available = options?.availableFilters ?? [];
    const suggestions = findSimilar(filterName, available);

    let message = `Unknown filter: ${filterName}`;
    if (suggestions.length > 0) {
      message += `. Did you mean: ${suggestions.join(', ')}?`;
    }

    super(message, {
      ...options,
    });
    this.name = 'UnknownFilterError';
    this.code = 'UNKNOWN_FILTER';
    this.filterName = filterName;
    this.availableFilters = available;
  }
}

/**
 * Unknown partial error
 */
export class UnknownPartialError extends TemplateRuntimeError {
  readonly partialName: string;

  constructor(
    partialName: string,
    options?: {
      location?: SourceLocation;
      source?: string;
      templateName?: string;
    }
  ) {
    super(`Unknown partial: ${partialName}`, {
      ...options,
    });
    this.name = 'UnknownPartialError';
    this.code = 'UNKNOWN_PARTIAL';
    this.partialName = partialName;
  }
}

/**
 * Helper execution error
 */
export class HelperError extends TemplateRuntimeError {
  readonly helperName: string;
  readonly originalError: Error;

  constructor(
    helperName: string,
    originalError: Error,
    options?: {
      location?: SourceLocation;
      source?: string;
      templateName?: string;
    }
  ) {
    super(`Error in helper "${helperName}": ${originalError.message}`, {
      ...options,
      cause: originalError,
    });
    this.name = 'HelperError';
    this.code = 'HELPER_ERROR';
    this.helperName = helperName;
    this.originalError = originalError;
  }
}

/**
 * Filter execution error
 */
export class FilterError extends TemplateRuntimeError {
  readonly filterName: string;
  readonly originalError: Error;

  constructor(
    filterName: string,
    originalError: Error,
    options?: {
      location?: SourceLocation;
      source?: string;
      templateName?: string;
    }
  ) {
    super(`Error in filter "${filterName}": ${originalError.message}`, {
      ...options,
      cause: originalError,
    });
    this.name = 'FilterError';
    this.code = 'FILTER_ERROR';
    this.filterName = filterName;
    this.originalError = originalError;
  }
}

// ============================================================================
// File Errors
// ============================================================================

/**
 * Template file error
 */
export class TemplateFileError extends TemplateError {
  readonly filePath: string;

  constructor(
    message: string,
    filePath: string,
    options?: {
      cause?: Error;
    }
  ) {
    super(`${message}: ${filePath}`, {
      code: 'FILE_ERROR',
      cause: options?.cause,
    });
    this.name = 'TemplateFileError';
    this.filePath = filePath;
  }
}

/**
 * Template not found error
 */
export class TemplateNotFoundError extends TemplateFileError {
  constructor(filePath: string) {
    super('Template file not found', filePath);
    this.name = 'TemplateNotFoundError';
    this.code = 'TEMPLATE_NOT_FOUND';
  }
}

/**
 * Circular include error
 */
export class CircularIncludeError extends TemplateError {
  readonly chain: string[];

  constructor(chain: string[]) {
    super(`Circular template include detected: ${chain.join(' -> ')}`, {
      code: 'CIRCULAR_INCLUDE',
    });
    this.name = 'CircularIncludeError';
    this.chain = chain;
  }
}

// ============================================================================
// Validation Errors
// ============================================================================

/**
 * Template validation error
 */
export class TemplateValidationError extends TemplateError {
  readonly errors: Array<{
    message: string;
    line?: number;
    column?: number;
  }>;

  constructor(
    errors: Array<{
      message: string;
      line?: number;
      column?: number;
    }>
  ) {
    const message = errors.length === 1
      ? errors[0].message
      : `${errors.length} validation errors:\n${errors.map(e => `  - ${e.message}`).join('\n')}`;

    super(message, {
      code: 'VALIDATION_ERROR',
    });
    this.name = 'TemplateValidationError';
    this.errors = errors;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find similar strings (for suggestions)
 */
function findSimilar(target: string, candidates: string[], maxDistance = 3): string[] {
  const targetLower = target.toLowerCase();

  return candidates
    .map((candidate) => ({
      candidate,
      distance: levenshteinDistance(targetLower, candidate.toLowerCase()),
    }))
    .filter(({ distance }) => distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(({ candidate }) => candidate);
}

/**
 * Levenshtein distance for typo detection
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Check if an error is a template error
 */
export function isTemplateError(error: unknown): error is TemplateError {
  return error instanceof TemplateError;
}

/**
 * Create a template error from an unknown error
 */
export function wrapError(error: unknown, context?: {
  location?: SourceLocation;
  source?: string;
  templateName?: string;
}): TemplateError {
  if (error instanceof TemplateError) {
    return error;
  }

  if (error instanceof Error) {
    return new TemplateRuntimeError(error.message, {
      ...context,
      cause: error,
    });
  }

  return new TemplateRuntimeError(String(error), context);
}

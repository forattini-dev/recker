/**
 * Template Errors Tests
 * 100% coverage for errors.ts
 */

import { describe, it, expect } from 'vitest';
import {
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
} from '../../src/template/errors.js';
import type { SourceLocation } from '../../src/template/types.js';

// ============================================================================
// Base Error: TemplateError
// ============================================================================

describe('TemplateError', () => {
  it('should create error with message only', () => {
    const error = new TemplateError('Something went wrong');

    expect(error.message).toBe('Something went wrong');
    expect(error.name).toBe('TemplateError');
    expect(error.code).toBe('TEMPLATE_ERROR');
    expect(error.location).toBeUndefined();
    expect(error.line).toBeUndefined();
    expect(error.column).toBeUndefined();
    expect(error.source).toBeUndefined();
    expect(error.templateName).toBeUndefined();
  });

  it('should create error with all options', () => {
    const location: SourceLocation = {
      start: { line: 5, column: 10 },
      end: { line: 5, column: 20 },
    };
    const causeError = new Error('Underlying cause');

    const error = new TemplateError('Full error', {
      code: 'CUSTOM_CODE',
      location,
      source: 'Hello {{name}}',
      templateName: 'test.hbs',
      cause: causeError,
    });

    expect(error.message).toBe('Full error');
    expect(error.code).toBe('CUSTOM_CODE');
    expect(error.location).toEqual(location);
    expect(error.line).toBe(5);
    expect(error.column).toBe(10);
    expect(error.source).toBe('Hello {{name}}');
    expect(error.templateName).toBe('test.hbs');
    expect(error.cause).toBe(causeError);
  });

  it('should have stack trace', () => {
    const error = new TemplateError('Test error');
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('TemplateError');
  });

  describe('toDetailedString()', () => {
    it('should format basic error', () => {
      const error = new TemplateError('Basic error');
      const detailed = error.toDetailedString();

      expect(detailed).toBe('Basic error');
    });

    it('should include template name', () => {
      const error = new TemplateError('Error with name', {
        templateName: 'my-template.hbs',
      });
      const detailed = error.toDetailedString();

      expect(detailed).toContain('Error with name');
      expect(detailed).toContain('Template: my-template.hbs');
    });

    it('should include location info', () => {
      const error = new TemplateError('Location error', {
        location: {
          start: { line: 10, column: 5 },
          end: { line: 10, column: 15 },
        },
      });
      const detailed = error.toDetailedString();

      expect(detailed).toContain('Location: line 10, column 5');
    });

    it('should format source context', () => {
      const source = `Line 1
Line 2
Line 3
Line 4 with {{error}}
Line 5
Line 6`;
      const error = new TemplateError('Source error', {
        source,
        location: {
          start: { line: 4, column: 13 },
          end: { line: 4, column: 20 },
        },
      });
      const detailed = error.toDetailedString();

      expect(detailed).toContain('> 4 | Line 4 with {{error}}');
      expect(detailed).toContain('^');
    });

    it('should handle source at beginning of file', () => {
      const source = `Line 1 {{error}}
Line 2
Line 3`;
      const error = new TemplateError('First line error', {
        source,
        location: {
          start: { line: 1, column: 8 },
          end: { line: 1, column: 15 },
        },
      });
      const detailed = error.toDetailedString();

      expect(detailed).toContain('> 1 | Line 1 {{error}}');
    });

    it('should handle source at end of file', () => {
      const source = `Line 1
Line 2
Line 3 {{error}}`;
      const error = new TemplateError('Last line error', {
        source,
        location: {
          start: { line: 3, column: 8 },
          end: { line: 3, column: 15 },
        },
      });
      const detailed = error.toDetailedString();

      expect(detailed).toContain('> 3 | Line 3 {{error}}');
    });

    it('should return empty string for source context without source', () => {
      const error = new TemplateError('No source', {
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 5 },
        },
      });
      // source context should be empty since source is undefined
      const detailed = error.toDetailedString();
      expect(detailed).not.toContain('|');
    });

    it('should return empty string for source context without line', () => {
      const error = new TemplateError('No line', {
        source: 'Some source',
      });
      // line is undefined so source context should be empty
      const detailed = error.toDetailedString();
      expect(detailed).not.toContain('|');
    });
  });
});

// ============================================================================
// Syntax Errors
// ============================================================================

describe('TemplateSyntaxError', () => {
  it('should create basic syntax error', () => {
    const error = new TemplateSyntaxError('Invalid syntax');

    expect(error.message).toBe('Invalid syntax');
    expect(error.name).toBe('TemplateSyntaxError');
    expect(error.code).toBe('SYNTAX_ERROR');
  });

  it('should include expected/found in message', () => {
    const error = new TemplateSyntaxError('Parse error', {
      expected: 'closing tag',
      found: 'EOF',
    });

    expect(error.message).toBe('Parse error. Expected closing tag, found EOF');
  });

  it('should not modify message without expected/found', () => {
    const error = new TemplateSyntaxError('Simple error', {
      source: 'test',
    });

    expect(error.message).toBe('Simple error');
  });

  it('should pass options to parent', () => {
    const location: SourceLocation = {
      start: { line: 2, column: 5 },
      end: { line: 2, column: 10 },
    };

    const error = new TemplateSyntaxError('Error', {
      location,
      source: 'source code',
      templateName: 'template.hbs',
    });

    expect(error.location).toEqual(location);
    expect(error.source).toBe('source code');
    expect(error.templateName).toBe('template.hbs');
  });
});

describe('UnclosedBlockError', () => {
  it('should create error with block name', () => {
    const error = new UnclosedBlockError('if');

    expect(error.message).toBe('Unclosed block: {{#if}} - missing {{/if}}');
    expect(error.name).toBe('UnclosedBlockError');
    expect(error.code).toBe('UNCLOSED_BLOCK');
    expect(error.blockName).toBe('if');
  });

  it('should accept location options', () => {
    const error = new UnclosedBlockError('each', {
      location: {
        start: { line: 3, column: 1 },
        end: { line: 3, column: 10 },
      },
      source: '{{#each items}}',
      templateName: 'list.hbs',
    });

    expect(error.blockName).toBe('each');
    expect(error.line).toBe(3);
    expect(error.templateName).toBe('list.hbs');
  });
});

describe('MismatchedBlockError', () => {
  it('should create error with open/close blocks', () => {
    const error = new MismatchedBlockError('if', 'each');

    expect(error.message).toBe('Mismatched block: opened with {{#if}} but closed with {{/each}}');
    expect(error.name).toBe('MismatchedBlockError');
    expect(error.code).toBe('MISMATCHED_BLOCK');
    expect(error.openBlock).toBe('if');
    expect(error.closeBlock).toBe('each');
  });

  it('should accept location options', () => {
    const error = new MismatchedBlockError('with', 'unless', {
      location: {
        start: { line: 5, column: 1 },
        end: { line: 5, column: 12 },
      },
    });

    expect(error.line).toBe(5);
  });
});

describe('UnexpectedCloseBlockError', () => {
  it('should create error with block name', () => {
    const error = new UnexpectedCloseBlockError('if');

    expect(error.message).toBe('Unexpected closing block: {{/if}} without matching {{#if}}');
    expect(error.name).toBe('UnexpectedCloseBlockError');
    expect(error.code).toBe('UNEXPECTED_CLOSE_BLOCK');
    expect(error.blockName).toBe('if');
  });

  it('should accept location options', () => {
    const error = new UnexpectedCloseBlockError('each', {
      source: '{{/each}}',
    });

    expect(error.source).toBe('{{/each}}');
  });
});

// ============================================================================
// Runtime Errors
// ============================================================================

describe('TemplateRuntimeError', () => {
  it('should create runtime error', () => {
    const error = new TemplateRuntimeError('Runtime failure');

    expect(error.message).toBe('Runtime failure');
    expect(error.name).toBe('TemplateRuntimeError');
    expect(error.code).toBe('RUNTIME_ERROR');
  });

  it('should accept cause option', () => {
    const cause = new Error('Original error');
    const error = new TemplateRuntimeError('Wrapped error', {
      cause,
    });

    expect(error.cause).toBe(cause);
  });

  it('should accept all options', () => {
    const error = new TemplateRuntimeError('Full runtime error', {
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 },
      },
      source: 'template source',
      templateName: 'runtime.hbs',
    });

    expect(error.source).toBe('template source');
    expect(error.templateName).toBe('runtime.hbs');
  });
});

describe('UndefinedVariableError', () => {
  it('should create error with variable name', () => {
    const error = new UndefinedVariableError('userName');

    expect(error.message).toBe('Undefined variable: userName');
    expect(error.name).toBe('UndefinedVariableError');
    expect(error.code).toBe('UNDEFINED_VARIABLE');
    expect(error.variableName).toBe('userName');
  });

  it('should accept location options', () => {
    const error = new UndefinedVariableError('config.value', {
      location: {
        start: { line: 7, column: 3 },
        end: { line: 7, column: 15 },
      },
    });

    expect(error.variableName).toBe('config.value');
    expect(error.line).toBe(7);
  });
});

describe('UnknownHelperError', () => {
  it('should create error without suggestions', () => {
    const error = new UnknownHelperError('myHelper');

    expect(error.message).toBe('Unknown helper: myHelper');
    expect(error.name).toBe('UnknownHelperError');
    expect(error.code).toBe('UNKNOWN_HELPER');
    expect(error.helperName).toBe('myHelper');
    expect(error.availableHelpers).toEqual([]);
  });

  it('should suggest similar helpers (typo detection)', () => {
    const error = new UnknownHelperError('upercase', {
      availableHelpers: ['uppercase', 'lowercase', 'capitalize', 'trim'],
    });

    expect(error.message).toContain('Did you mean: uppercase');
    expect(error.availableHelpers).toContain('uppercase');
  });

  it('should not suggest if no similar helpers', () => {
    const error = new UnknownHelperError('xyz123', {
      availableHelpers: ['uppercase', 'lowercase'],
    });

    expect(error.message).toBe('Unknown helper: xyz123');
    expect(error.message).not.toContain('Did you mean');
  });

  it('should limit suggestions to 3', () => {
    const error = new UnknownHelperError('uppr', {
      availableHelpers: ['upper', 'uppercase', 'upcase', 'uper', 'upp'],
    });

    // Should suggest at most 3
    const suggestions = error.message.match(/Did you mean: (.+)\?/);
    if (suggestions) {
      const count = suggestions[1].split(', ').length;
      expect(count).toBeLessThanOrEqual(3);
    }
  });
});

describe('UnknownFilterError', () => {
  it('should create error without suggestions', () => {
    const error = new UnknownFilterError('myFilter');

    expect(error.message).toBe('Unknown filter: myFilter');
    expect(error.name).toBe('UnknownFilterError');
    expect(error.code).toBe('UNKNOWN_FILTER');
    expect(error.filterName).toBe('myFilter');
    expect(error.availableFilters).toEqual([]);
  });

  it('should suggest similar filters', () => {
    const error = new UnknownFilterError('lowrcase', {
      availableFilters: ['lowercase', 'uppercase', 'trim'],
    });

    expect(error.message).toContain('Did you mean: lowercase');
  });

  it('should not suggest dissimilar filters', () => {
    const error = new UnknownFilterError('abcdef', {
      availableFilters: ['uppercase', 'lowercase'],
    });

    expect(error.message).toBe('Unknown filter: abcdef');
  });
});

describe('UnknownPartialError', () => {
  it('should create error with partial name', () => {
    const error = new UnknownPartialError('header');

    expect(error.message).toBe('Unknown partial: header');
    expect(error.name).toBe('UnknownPartialError');
    expect(error.code).toBe('UNKNOWN_PARTIAL');
    expect(error.partialName).toBe('header');
  });

  it('should accept options', () => {
    const error = new UnknownPartialError('footer', {
      templateName: 'main.hbs',
    });

    expect(error.templateName).toBe('main.hbs');
  });
});

describe('HelperError', () => {
  it('should wrap helper execution error', () => {
    const originalError = new TypeError('Cannot read property');
    const error = new HelperError('myHelper', originalError);

    expect(error.message).toBe('Error in helper "myHelper": Cannot read property');
    expect(error.name).toBe('HelperError');
    expect(error.code).toBe('HELPER_ERROR');
    expect(error.helperName).toBe('myHelper');
    expect(error.originalError).toBe(originalError);
    expect(error.cause).toBe(originalError);
  });

  it('should include location', () => {
    const originalError = new Error('Failed');
    const error = new HelperError('formatDate', originalError, {
      location: {
        start: { line: 10, column: 5 },
        end: { line: 10, column: 25 },
      },
    });

    expect(error.line).toBe(10);
    expect(error.column).toBe(5);
  });
});

describe('FilterError', () => {
  it('should wrap filter execution error', () => {
    const originalError = new Error('Invalid input');
    const error = new FilterError('uppercase', originalError);

    expect(error.message).toBe('Error in filter "uppercase": Invalid input');
    expect(error.name).toBe('FilterError');
    expect(error.code).toBe('FILTER_ERROR');
    expect(error.filterName).toBe('uppercase');
    expect(error.originalError).toBe(originalError);
  });

  it('should include source', () => {
    const originalError = new Error('Oops');
    const error = new FilterError('trim', originalError, {
      source: '{{value | trim}}',
    });

    expect(error.source).toBe('{{value | trim}}');
  });
});

// ============================================================================
// File Errors
// ============================================================================

describe('TemplateFileError', () => {
  it('should create file error', () => {
    const error = new TemplateFileError('Cannot read file', '/path/to/file.hbs');

    expect(error.message).toBe('Cannot read file: /path/to/file.hbs');
    expect(error.name).toBe('TemplateFileError');
    expect(error.code).toBe('FILE_ERROR');
    expect(error.filePath).toBe('/path/to/file.hbs');
  });

  it('should accept cause', () => {
    const cause = new Error('ENOENT');
    const error = new TemplateFileError('File error', '/file.hbs', {
      cause,
    });

    expect(error.cause).toBe(cause);
  });
});

describe('TemplateNotFoundError', () => {
  it('should create not found error', () => {
    const error = new TemplateNotFoundError('/missing/template.hbs');

    expect(error.message).toBe('Template file not found: /missing/template.hbs');
    expect(error.name).toBe('TemplateNotFoundError');
    expect(error.code).toBe('TEMPLATE_NOT_FOUND');
    expect(error.filePath).toBe('/missing/template.hbs');
  });
});

describe('CircularIncludeError', () => {
  it('should create circular include error', () => {
    const chain = ['a.hbs', 'b.hbs', 'c.hbs', 'a.hbs'];
    const error = new CircularIncludeError(chain);

    expect(error.message).toBe('Circular template include detected: a.hbs -> b.hbs -> c.hbs -> a.hbs');
    expect(error.name).toBe('CircularIncludeError');
    expect(error.code).toBe('CIRCULAR_INCLUDE');
    expect(error.chain).toEqual(chain);
  });

  it('should handle two-element chain', () => {
    const chain = ['x.hbs', 'x.hbs'];
    const error = new CircularIncludeError(chain);

    expect(error.message).toBe('Circular template include detected: x.hbs -> x.hbs');
  });
});

// ============================================================================
// Validation Errors
// ============================================================================

describe('TemplateValidationError', () => {
  it('should create error with single validation error', () => {
    const errors = [{ message: 'Invalid expression' }];
    const error = new TemplateValidationError(errors);

    expect(error.message).toBe('Invalid expression');
    expect(error.name).toBe('TemplateValidationError');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.errors).toEqual(errors);
  });

  it('should format multiple validation errors', () => {
    const errors = [
      { message: 'Error 1', line: 1, column: 5 },
      { message: 'Error 2', line: 3 },
      { message: 'Error 3' },
    ];
    const error = new TemplateValidationError(errors);

    expect(error.message).toContain('3 validation errors');
    expect(error.message).toContain('- Error 1');
    expect(error.message).toContain('- Error 2');
    expect(error.message).toContain('- Error 3');
    expect(error.errors).toHaveLength(3);
  });

  it('should handle two validation errors', () => {
    const errors = [
      { message: 'First error' },
      { message: 'Second error' },
    ];
    const error = new TemplateValidationError(errors);

    expect(error.message).toContain('2 validation errors');
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

describe('isTemplateError()', () => {
  it('should return true for TemplateError', () => {
    expect(isTemplateError(new TemplateError('test'))).toBe(true);
  });

  it('should return true for subclasses', () => {
    expect(isTemplateError(new TemplateSyntaxError('test'))).toBe(true);
    expect(isTemplateError(new TemplateRuntimeError('test'))).toBe(true);
    expect(isTemplateError(new UnclosedBlockError('if'))).toBe(true);
    expect(isTemplateError(new TemplateFileError('msg', '/path'))).toBe(true);
  });

  it('should return false for regular Error', () => {
    expect(isTemplateError(new Error('test'))).toBe(false);
  });

  it('should return false for non-errors', () => {
    expect(isTemplateError(null)).toBe(false);
    expect(isTemplateError(undefined)).toBe(false);
    expect(isTemplateError('error string')).toBe(false);
    expect(isTemplateError(123)).toBe(false);
    expect(isTemplateError({})).toBe(false);
  });
});

describe('wrapError()', () => {
  it('should return TemplateError as-is', () => {
    const original = new TemplateError('Original');
    const wrapped = wrapError(original);

    expect(wrapped).toBe(original);
  });

  it('should return subclasses as-is', () => {
    const original = new UnclosedBlockError('if');
    const wrapped = wrapError(original);

    expect(wrapped).toBe(original);
  });

  it('should wrap regular Error', () => {
    const original = new Error('Regular error');
    const wrapped = wrapError(original);

    expect(wrapped).toBeInstanceOf(TemplateRuntimeError);
    expect(wrapped.message).toBe('Regular error');
    expect(wrapped.cause).toBe(original);
  });

  it('should wrap Error with context', () => {
    const original = new TypeError('Type mismatch');
    const wrapped = wrapError(original, {
      location: {
        start: { line: 5, column: 10 },
        end: { line: 5, column: 20 },
      },
      source: 'template source',
      templateName: 'test.hbs',
    });

    expect(wrapped).toBeInstanceOf(TemplateRuntimeError);
    expect(wrapped.line).toBe(5);
    expect(wrapped.source).toBe('template source');
    expect(wrapped.templateName).toBe('test.hbs');
  });

  it('should wrap string error', () => {
    const wrapped = wrapError('String error message');

    expect(wrapped).toBeInstanceOf(TemplateRuntimeError);
    expect(wrapped.message).toBe('String error message');
  });

  it('should wrap number error', () => {
    const wrapped = wrapError(42);

    expect(wrapped).toBeInstanceOf(TemplateRuntimeError);
    expect(wrapped.message).toBe('42');
  });

  it('should wrap null', () => {
    const wrapped = wrapError(null);

    expect(wrapped).toBeInstanceOf(TemplateRuntimeError);
    expect(wrapped.message).toBe('null');
  });

  it('should wrap undefined', () => {
    const wrapped = wrapError(undefined);

    expect(wrapped).toBeInstanceOf(TemplateRuntimeError);
    expect(wrapped.message).toBe('undefined');
  });

  it('should wrap object', () => {
    const wrapped = wrapError({ foo: 'bar' });

    expect(wrapped).toBeInstanceOf(TemplateRuntimeError);
    expect(wrapped.message).toBe('[object Object]');
  });
});

// ============================================================================
// Levenshtein Distance (tested indirectly through suggestions)
// ============================================================================

describe('Levenshtein distance (typo detection)', () => {
  it('should detect single character typos', () => {
    const error = new UnknownHelperError('trime', {
      availableHelpers: ['trim', 'uppercase', 'lowercase'],
    });

    expect(error.message).toContain('trim');
  });

  it('should detect transposition typos', () => {
    const error = new UnknownHelperError('tmir', {
      availableHelpers: ['trim'],
    });

    expect(error.message).toContain('trim');
  });

  it('should detect missing character', () => {
    const error = new UnknownHelperError('uppercse', {
      availableHelpers: ['uppercase'],
    });

    expect(error.message).toContain('uppercase');
  });

  it('should detect extra character', () => {
    const error = new UnknownHelperError('lowercasee', {
      availableHelpers: ['lowercase'],
    });

    expect(error.message).toContain('lowercase');
  });

  it('should be case insensitive', () => {
    const error = new UnknownHelperError('UPPERCASE', {
      availableHelpers: ['uppercase'],
    });

    // Distance is 0 when case-insensitive, so should match
    expect(error.message).toContain('uppercase');
  });

  it('should sort suggestions by distance', () => {
    const error = new UnknownHelperError('upprcase', {
      availableHelpers: ['lowercase', 'uppercase', 'upcase'],
    });

    // "uppercase" has distance 1, "upcase" has distance 2
    const match = error.message.match(/Did you mean: (.+)\?/);
    expect(match).not.toBeNull();
    if (match) {
      const suggestions = match[1].split(', ');
      // First suggestion should be closest match
      expect(suggestions[0]).toBe('uppercase');
    }
  });

  it('should not suggest if distance > 3', () => {
    const error = new UnknownHelperError('abcdefgh', {
      availableHelpers: ['xyz'],
    });

    expect(error.message).not.toContain('Did you mean');
  });
});

// ============================================================================
// Error Inheritance
// ============================================================================

describe('Error inheritance', () => {
  it('TemplateSyntaxError extends TemplateError', () => {
    const error = new TemplateSyntaxError('test');
    expect(error).toBeInstanceOf(TemplateError);
    expect(error).toBeInstanceOf(Error);
  });

  it('UnclosedBlockError extends TemplateSyntaxError', () => {
    const error = new UnclosedBlockError('if');
    expect(error).toBeInstanceOf(TemplateSyntaxError);
    expect(error).toBeInstanceOf(TemplateError);
    expect(error).toBeInstanceOf(Error);
  });

  it('MismatchedBlockError extends TemplateSyntaxError', () => {
    const error = new MismatchedBlockError('if', 'each');
    expect(error).toBeInstanceOf(TemplateSyntaxError);
  });

  it('UnexpectedCloseBlockError extends TemplateSyntaxError', () => {
    const error = new UnexpectedCloseBlockError('if');
    expect(error).toBeInstanceOf(TemplateSyntaxError);
  });

  it('TemplateRuntimeError extends TemplateError', () => {
    const error = new TemplateRuntimeError('test');
    expect(error).toBeInstanceOf(TemplateError);
    expect(error).toBeInstanceOf(Error);
  });

  it('UndefinedVariableError extends TemplateRuntimeError', () => {
    const error = new UndefinedVariableError('var');
    expect(error).toBeInstanceOf(TemplateRuntimeError);
    expect(error).toBeInstanceOf(TemplateError);
  });

  it('UnknownHelperError extends TemplateRuntimeError', () => {
    const error = new UnknownHelperError('helper');
    expect(error).toBeInstanceOf(TemplateRuntimeError);
  });

  it('UnknownFilterError extends TemplateRuntimeError', () => {
    const error = new UnknownFilterError('filter');
    expect(error).toBeInstanceOf(TemplateRuntimeError);
  });

  it('UnknownPartialError extends TemplateRuntimeError', () => {
    const error = new UnknownPartialError('partial');
    expect(error).toBeInstanceOf(TemplateRuntimeError);
  });

  it('HelperError extends TemplateRuntimeError', () => {
    const error = new HelperError('helper', new Error('test'));
    expect(error).toBeInstanceOf(TemplateRuntimeError);
  });

  it('FilterError extends TemplateRuntimeError', () => {
    const error = new FilterError('filter', new Error('test'));
    expect(error).toBeInstanceOf(TemplateRuntimeError);
  });

  it('TemplateFileError extends TemplateError', () => {
    const error = new TemplateFileError('msg', '/path');
    expect(error).toBeInstanceOf(TemplateError);
  });

  it('TemplateNotFoundError extends TemplateFileError', () => {
    const error = new TemplateNotFoundError('/path');
    expect(error).toBeInstanceOf(TemplateFileError);
    expect(error).toBeInstanceOf(TemplateError);
  });

  it('CircularIncludeError extends TemplateError', () => {
    const error = new CircularIncludeError(['a', 'b']);
    expect(error).toBeInstanceOf(TemplateError);
  });

  it('TemplateValidationError extends TemplateError', () => {
    const error = new TemplateValidationError([{ message: 'test' }]);
    expect(error).toBeInstanceOf(TemplateError);
  });
});

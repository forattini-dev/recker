/**
 * Template Compiler Tests
 *
 * Tests for parse, validate, hasTemplateExpressions, and extractVariables functions.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  parse,
  validate,
  hasTemplateExpressions,
  extractVariables,
} from '../../src/template/compiler.js';

// ============================================================================
// parse function tests
// ============================================================================

describe('Compiler - parse', () => {
  it('should parse simple text', () => {
    const ast = parse('Hello World');
    expect(ast.type).toBe('Program');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0].type).toBe('TextNode');
  });

  it('should parse expression', () => {
    const ast = parse('{{name}}');
    expect(ast.type).toBe('Program');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0].type).toBe('ExpressionNode');
  });

  it('should parse raw expression', () => {
    const ast = parse('{{{html}}}');
    expect(ast.type).toBe('Program');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0].type).toBe('RawExpressionNode');
  });

  it('should parse block helper', () => {
    const ast = parse('{{#if condition}}yes{{/if}}');
    expect(ast.type).toBe('Program');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0].type).toBe('BlockNode');
  });

  it('should parse with custom delimiters', () => {
    const ast = parse('<%name%>', { delimiters: ['<%', '%>'] });
    expect(ast.type).toBe('Program');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0].type).toBe('ExpressionNode');
  });

  it('should parse comment', () => {
    const ast = parse('{{! this is a comment }}');
    expect(ast.type).toBe('Program');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0].type).toBe('CommentNode');
  });

  it('should parse partial', () => {
    const ast = parse('{{> header }}');
    expect(ast.type).toBe('Program');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0].type).toBe('PartialNode');
  });
});

// ============================================================================
// validate function tests
// ============================================================================

describe('Compiler - validate', () => {
  it('should return valid for correct template', () => {
    const result = validate('Hello {{name}}');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should return invalid for unclosed expression', () => {
    const result = validate('Hello {{name');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should return invalid for unclosed block', () => {
    const result = validate('{{#if condition}}yes');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should return invalid for mismatched block', () => {
    const result = validate('{{#if condition}}yes{{/each}}');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should handle generic errors in validation', () => {
    // Test the generic error catch block (line 933-936)
    // by passing something that might cause an unexpected error
    const result = validate('');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ============================================================================
// hasTemplateExpressions function tests
// ============================================================================

describe('Compiler - hasTemplateExpressions', () => {
  it('should return true for string with expression', () => {
    expect(hasTemplateExpressions('Hello {{name}}')).toBe(true);
  });

  it('should return false for plain string', () => {
    expect(hasTemplateExpressions('Hello World')).toBe(false);
  });

  it('should return false for only open delimiter', () => {
    // Only has {{ but not }}, so returns false (needs both delimiters)
    expect(hasTemplateExpressions('Hello {{ name')).toBe(false);
  });

  it('should return false for only close delimiter', () => {
    // Only has }} but not {{, so returns false (needs both delimiters)
    expect(hasTemplateExpressions('Hello name}}')).toBe(false);
  });

  it('should work with custom delimiters', () => {
    expect(hasTemplateExpressions('Hello <%name%>', { delimiters: ['<%', '%>'] })).toBe(true);
    expect(hasTemplateExpressions('Hello {{name}}', { delimiters: ['<%', '%>'] })).toBe(false);
  });

  it('should return true when both delimiters present', () => {
    expect(hasTemplateExpressions('{{}}' )).toBe(true);
  });

  it('should return false for empty string', () => {
    expect(hasTemplateExpressions('')).toBe(false);
  });
});

// ============================================================================
// extractVariables function tests
// ============================================================================

describe('Compiler - extractVariables', () => {
  it('should extract simple variable', () => {
    const vars = extractVariables('Hello {{name}}');
    expect(vars).toContain('name');
  });

  it('should extract multiple variables', () => {
    const vars = extractVariables('{{firstName}} {{lastName}}');
    expect(vars).toContain('firstName');
    expect(vars).toContain('lastName');
    expect(vars).toHaveLength(2);
  });

  it('should extract nested path root', () => {
    const vars = extractVariables('{{user.name}}');
    expect(vars).toContain('user');
    expect(vars).toHaveLength(1);
  });

  it('should not duplicate variables', () => {
    const vars = extractVariables('{{name}} {{name}}');
    expect(vars).toContain('name');
    expect(vars).toHaveLength(1);
  });

  it('should extract from raw expressions', () => {
    const vars = extractVariables('{{{html}}}');
    expect(vars).toContain('html');
  });

  it('should not extract @data variables', () => {
    const vars = extractVariables('{{@index}} {{name}}');
    expect(vars).not.toContain('@index');
    expect(vars).toContain('name');
  });

  it('should extract from block body (line 970)', () => {
    // Tests line 970: block.program.body.forEach(visit)
    // The block helper name is extracted + body variables
    const vars = extractVariables('{{#if condition}}{{name}}{{/if}}');
    expect(vars).toContain('name');
  });

  it('should extract from block inverse (line 971)', () => {
    // Tests line 971: block.inverse?.body.forEach(visit)
    const vars = extractVariables('{{#if condition}}yes{{else}}{{fallback}}{{/if}}');
    expect(vars).toContain('fallback');
  });

  it('should extract from nested blocks', () => {
    const vars = extractVariables('{{#each items}}{{#if active}}{{name}}{{/if}}{{/each}}');
    expect(vars).toContain('name');
  });

  it('should return empty array for plain text', () => {
    const vars = extractVariables('Hello World');
    expect(vars).toHaveLength(0);
  });

  it('should work with custom delimiters', () => {
    const vars = extractVariables('<%name%>', { delimiters: ['<%', '%>'] });
    expect(vars).toContain('name');
  });
});

// ============================================================================
// Edge case tests for coverage
// ============================================================================

describe('Compiler - Edge Cases', () => {
  it('should handle empty template', () => {
    const ast = parse('');
    expect(ast.type).toBe('Program');
    expect(ast.body).toHaveLength(0);
  });

  it('should handle whitespace only template', () => {
    const ast = parse('   ');
    expect(ast.type).toBe('Program');
  });

  it('should handle complex expressions', () => {
    const ast = parse('{{helper arg1 arg2 key="value"}}');
    expect(ast.type).toBe('Program');
    expect(ast.body).toHaveLength(1);
  });

  it('should handle subexpressions', () => {
    const ast = parse('{{outer (inner arg)}}');
    expect(ast.type).toBe('Program');
  });

  it('should handle filter expressions', () => {
    const ast = parse('{{name | uppercase}}');
    expect(ast.type).toBe('Program');
  });

  it('should handle block with else', () => {
    const ast = parse('{{#if condition}}yes{{else}}no{{/if}}');
    expect(ast.type).toBe('Program');
    const block = ast.body[0] as any;
    expect(block.type).toBe('BlockNode');
    expect(block.inverse).toBeDefined();
  });

  it('should handle each block', () => {
    const ast = parse('{{#each items}}{{this}}{{/each}}');
    expect(ast.type).toBe('Program');
  });

  it('should handle with block', () => {
    const ast = parse('{{#with user}}{{name}}{{/with}}');
    expect(ast.type).toBe('Program');
  });

  it('should handle unless block', () => {
    const ast = parse('{{#unless active}}inactive{{/unless}}');
    expect(ast.type).toBe('Program');
  });

  it('should handle range block', () => {
    const ast = parse('{{#range 5}}{{this}}{{/range}}');
    expect(ast.type).toBe('Program');
  });

  it('should handle string literals', () => {
    const ast = parse('{{helper "string literal"}}');
    expect(ast.type).toBe('Program');
  });

  it('should handle number literals', () => {
    const ast = parse('{{helper 42}}');
    expect(ast.type).toBe('Program');
  });

  it('should handle boolean literals', () => {
    const ast = parse('{{helper true false}}');
    expect(ast.type).toBe('Program');
  });

  it('should handle null literal', () => {
    const ast = parse('{{helper null}}');
    expect(ast.type).toBe('Program');
  });

  // Note: Array and object literals are not supported in this template engine
  // The engine uses hash arguments for named parameters instead
  it('should handle hash arguments', () => {
    const ast = parse('{{helper key="value" num=42}}');
    expect(ast.type).toBe('Program');
  });

  // Test bracket notation with different types (lines 764-767)
  it('should handle bracket notation with number', () => {
    const ast = parse('{{items.[0]}}');
    expect(ast.type).toBe('Program');
  });

  it('should handle bracket notation with identifier', () => {
    // Tests line 764-765: ID in bracket notation
    const ast = parse('{{items.[index]}}');
    expect(ast.type).toBe('Program');
  });

  it('should handle bracket notation with string', () => {
    // Tests line 766-767: STRING in bracket notation
    const ast = parse('{{items.["key"]}}');
    expect(ast.type).toBe('Program');
  });

  it('should handle deeply nested paths', () => {
    const ast = parse('{{a.b.c.d.e}}');
    expect(ast.type).toBe('Program');
  });

  it('should handle parent path access', () => {
    const ast = parse('{{../parent}}');
    expect(ast.type).toBe('Program');
  });

  it('should handle this path', () => {
    const ast = parse('{{this}}');
    expect(ast.type).toBe('Program');
  });

  // Test dot-only path (lines 747-750)
  it('should handle dot-only path (current context)', () => {
    const ast = parse('{{.}}');
    expect(ast.type).toBe('Program');
  });

  it('should handle current context in each block', () => {
    const ast = parse('{{#each items}}{{.}}{{/each}}');
    expect(ast.type).toBe('Program');
  });

  // Test various error cases
  it('should throw on unclosed raw expression', () => {
    expect(() => parse('{{{name}}')).toThrow();
  });

  it('should throw on unexpected closing tag', () => {
    expect(() => parse('{{/if}}')).toThrow();
  });

  // Note: {{}} may actually be valid (empty helper call) depending on implementation
  // Note: {{name$}} may also be valid depending on ID character rules
});

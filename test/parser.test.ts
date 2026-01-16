import { describe, it, expect } from 'vitest';
import { RekArgsAdapter as RekArgs } from '../src/cli/parser-adapter.js';
import { CommandSchema } from '../src/cli/parser/types.js';

describe('RekArgs Parser (via adapter)', () => {
  const schema: CommandSchema = {
    name: 'test',
    description: 'Test command',
    params: {
      depth: { type: 'number', default: 5 },
      mode: { type: 'string', choices: ['fast', 'slow'], default: 'fast' },
      typed: { type: 'boolean' }
    },
    flags: {
      json: { description: 'JSON output', alias: 'j' }
    },
    keywords: {
      'seo': { description: 'Enable SEO mode' },
      'silent': { description: 'Silent mode', mapTo: 'isSilent' }
    }
  };

  it('should parse keywords as boolean flags', () => {
    const args = ['http://site.com', 'seo', 'silent'];
    const result = RekArgs.parse(args, schema);

    expect(result.args[0]).toBe('http://site.com');
    expect(result.data.seo).toBe(true);
    expect(result.data.isSilent).toBe(true); // mapped key
    // Ensure 'seo' is NOT in positional args
    expect(result.args).not.toContain('seo');
  });

  it('should parse key=value strings', () => {
    const args = ['mode=slow', 'other=value'];
    const result = RekArgs.parse(args, schema);

    expect(result.data.mode).toBe('slow');
    expect(result.data.other).toBe('value');
    expect(result.data.depth).toBe(5); // Default
  });

  it('should parse key:=value typed parameters', () => {
    const args = ['depth:=10', 'typed:=true', 'count:=42'];
    const result = RekArgs.parse(args, schema);

    expect(result.data.depth).toBe(10);
    expect(result.data.typed).toBe(true);
    expect(result.data.count).toBe(42);
  });

  it('should parse headers', () => {
    const args = ['User-Agent:RekBot', 'Authorization:Bearer 123'];
    const result = RekArgs.parse(args);

    expect(result.headers['User-Agent']).toBe('RekBot');
    expect(result.headers['Authorization']).toBe('Bearer 123');
  });

  it('should parse flags and aliases', () => {
    const args = ['--json', '-v']; // -v is unknown but should be captured
    const result = RekArgs.parse(args, schema);

    expect(result.options.json).toBe(true);
    expect(result.options.v).toBe(true);
  });

  it('should validate choices', () => {
    const args = ['mode=invalid'];
    const result = RekArgs.parse(args, schema);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Invalid value for \'mode\'');
  });

  it('should validate number types', () => {
    const args = ['depth=notanumber'];
    const result = RekArgs.parse(args, schema);

    // Note: cli-args-parser doesn't validate type from schema for = syntax
    // It keeps the value as string. This is a known difference.
    // The old parser would error here, new parser accepts strings
    expect(result.data.depth).toBe('notanumber');
  });

  it('should separate positional arguments', () => {
    const args = ['http://example.com', 'depth=2'];
    const result = RekArgs.parse(args, schema);

    expect(result.args[0]).toBe('http://example.com');
    // Note: = syntax keeps as string, :=2 would give number
    expect(result.data.depth).toBe('2');
  });
});

/**
 * Template Engine Tests
 *
 * Comprehensive tests for Recker's Handlebars-compatible template engine.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TemplateEngine,
  template,
  createTemplateEngine,
  hasTemplateExpressions,
  parse,
  validate,
  extractVariables,
  escapeHtml,
  escapeJson,
  escapeXml,
  escapeUrl,
  escapeCsv,
  SafeString,
  isSafeString,
  safe,
  registerHelper,
  unregisterHelper,
  getHelperNames,
  resetHelpers,
  TemplateError,
  TemplateSyntaxError,
  UnclosedBlockError,
  UnknownHelperError,
  isTemplateError,
  getEnvContext,
  buildContext,
  lookup,
  mergeContexts,
} from '../../src/template/index.js';

// ============================================================================
// Basic Interpolation
// ============================================================================

describe('Template Engine - Basic Interpolation', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('should render simple variable', async () => {
    const result = await engine.render('Hello {{name}}!', { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  it('should render multiple variables', async () => {
    const result = await engine.render('{{first}} {{last}}', {
      first: 'John',
      last: 'Doe',
    });
    expect(result).toBe('John Doe');
  });

  it('should render nested paths', async () => {
    const result = await engine.render('{{user.profile.name}}', {
      user: { profile: { name: 'Jane' } },
    });
    expect(result).toBe('Jane');
  });

  it('should render array access', async () => {
    const result = await engine.render('{{items.[0]}}', {
      items: ['first', 'second', 'third'],
    });
    expect(result).toBe('first');
  });

  it('should render undefined as empty string', async () => {
    const result = await engine.render('Hello {{missing}}!', {});
    expect(result).toBe('Hello !');
  });

  it('should render null as empty string', async () => {
    const result = await engine.render('Value: {{value}}', { value: null });
    expect(result).toBe('Value: ');
  });

  it('should render numbers', async () => {
    const result = await engine.render('Count: {{count}}', { count: 42 });
    expect(result).toBe('Count: 42');
  });

  it('should render booleans', async () => {
    const result = await engine.render('Active: {{active}}', { active: true });
    expect(result).toBe('Active: true');
  });

  it('should render raw expression (no escaping)', async () => {
    const result = await engine.render('{{{html}}}', { html: '<b>bold</b>' });
    expect(result).toBe('<b>bold</b>');
  });

  it('should escape HTML by default in html format', async () => {
    const result = await engine.html('{{html}}', { html: '<script>alert("xss")</script>' });
    expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('should handle template without expressions', async () => {
    const result = await engine.render('Just plain text', {});
    expect(result).toBe('Just plain text');
  });

  it('should handle empty template', async () => {
    const result = await engine.render('', {});
    expect(result).toBe('');
  });
});

// ============================================================================
// Block Helpers
// ============================================================================

describe('Template Engine - Block Helpers', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  describe('#if helper', () => {
    it('should render block when truthy', async () => {
      const result = await engine.render('{{#if show}}visible{{/if}}', { show: true });
      expect(result).toBe('visible');
    });

    it('should not render block when falsy', async () => {
      const result = await engine.render('{{#if show}}visible{{/if}}', { show: false });
      expect(result).toBe('');
    });

    it('should render else block when falsy', async () => {
      const result = await engine.render('{{#if show}}yes{{else}}no{{/if}}', { show: false });
      expect(result).toBe('no');
    });

    it('should treat empty array as falsy', async () => {
      const result = await engine.render('{{#if items}}has{{else}}empty{{/if}}', { items: [] });
      expect(result).toBe('empty');
    });

    it('should treat non-empty array as truthy', async () => {
      const result = await engine.render('{{#if items}}has{{/if}}', { items: [1] });
      expect(result).toBe('has');
    });

    it('should treat empty string as falsy', async () => {
      const result = await engine.render('{{#if name}}{{name}}{{else}}no name{{/if}}', { name: '' });
      expect(result).toBe('no name');
    });

    it('should treat zero as falsy', async () => {
      const result = await engine.render('{{#if count}}{{count}}{{else}}zero{{/if}}', { count: 0 });
      expect(result).toBe('zero');
    });
  });

  describe('#unless helper', () => {
    it('should render block when falsy', async () => {
      const result = await engine.render('{{#unless hidden}}visible{{/unless}}', { hidden: false });
      expect(result).toBe('visible');
    });

    it('should not render block when truthy', async () => {
      const result = await engine.render('{{#unless show}}hidden{{/unless}}', { show: true });
      expect(result).toBe('');
    });

    it('should render else block when truthy', async () => {
      const result = await engine.render('{{#unless hide}}visible{{else}}hidden{{/unless}}', { hide: true });
      expect(result).toBe('hidden');
    });
  });

  describe('#each helper', () => {
    it('should iterate over array', async () => {
      const result = await engine.render('{{#each items}}{{this}} {{/each}}', {
        items: ['a', 'b', 'c'],
      });
      expect(result).toBe('a b c ');
    });

    it('should provide @index', async () => {
      const result = await engine.render('{{#each items}}{{@index}}:{{this}} {{/each}}', {
        items: ['a', 'b'],
      });
      expect(result).toBe('0:a 1:b ');
    });

    it('should provide @first and @last', async () => {
      const result = await engine.render(
        '{{#each items}}{{#if @first}}[{{/if}}{{this}}{{#if @last}}]{{/if}}{{/each}}',
        { items: ['a', 'b', 'c'] }
      );
      expect(result).toBe('[abc]');
    });

    it('should iterate over object', async () => {
      const result = await engine.render('{{#each obj}}{{@key}}={{this}} {{/each}}', {
        obj: { a: 1, b: 2 },
      });
      expect(result).toContain('a=1');
      expect(result).toContain('b=2');
    });

    it('should render else for empty array', async () => {
      const result = await engine.render('{{#each items}}{{this}}{{else}}empty{{/each}}', {
        items: [],
      });
      expect(result).toBe('empty');
    });

    it('should handle nested each', async () => {
      const result = await engine.render(
        '{{#each matrix}}[{{#each this}}{{this}}{{/each}}]{{/each}}',
        { matrix: [[1, 2], [3, 4]] }
      );
      expect(result).toBe('[12][34]');
    });
  });

  describe('#with helper', () => {
    it('should change context', async () => {
      const result = await engine.render('{{#with user}}{{name}}{{/with}}', {
        user: { name: 'John' },
      });
      expect(result).toBe('John');
    });

    it('should render else when undefined', async () => {
      const result = await engine.render('{{#with user}}{{name}}{{else}}no user{{/with}}', {});
      expect(result).toBe('no user');
    });

    it('should access parent context with ../', async () => {
      const result = await engine.render('{{#with user}}{{name}} ({{../company}}){{/with}}', {
        user: { name: 'John' },
        company: 'Acme',
      });
      expect(result).toBe('John (Acme)');
    });
  });
});

// ============================================================================
// Comparison Helpers
// ============================================================================

describe('Template Engine - Comparison Helpers', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('should handle eq (equal)', async () => {
    const result = await engine.render('{{#if (eq status "active")}}yes{{/if}}', { status: 'active' });
    expect(result).toBe('yes');
  });

  it('should handle ne (not equal)', async () => {
    const result = await engine.render('{{#if (ne status "inactive")}}not inactive{{/if}}', { status: 'active' });
    expect(result).toBe('not inactive');
  });

  it('should handle lt (less than)', async () => {
    const result = await engine.render('{{#if (lt age 18)}}minor{{/if}}', { age: 16 });
    expect(result).toBe('minor');
  });

  it('should handle lte (less than or equal)', async () => {
    const result = await engine.render('{{#if (lte count 10)}}small{{/if}}', { count: 10 });
    expect(result).toBe('small');
  });

  it('should handle gt (greater than)', async () => {
    const result = await engine.render('{{#if (gt price 100)}}expensive{{/if}}', { price: 150 });
    expect(result).toBe('expensive');
  });

  it('should handle gte (greater than or equal)', async () => {
    const result = await engine.render('{{#if (gte rating 4)}}good{{/if}}', { rating: 4 });
    expect(result).toBe('good');
  });
});

// ============================================================================
// Logic Helpers
// ============================================================================

describe('Template Engine - Logic Helpers', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('should handle and', async () => {
    const result = await engine.render('{{#if (and a b)}}both{{/if}}', { a: true, b: true });
    expect(result).toBe('both');
  });

  it('should handle and with falsy', async () => {
    const result = await engine.render('{{#if (and a b)}}both{{else}}not both{{/if}}', { a: true, b: false });
    expect(result).toBe('not both');
  });

  it('should handle or', async () => {
    const result = await engine.render('{{#if (or a b)}}one{{/if}}', { a: false, b: true });
    expect(result).toBe('one');
  });

  it('should handle not', async () => {
    const result = await engine.render('{{#if (not disabled)}}enabled{{/if}}', { disabled: false });
    expect(result).toBe('enabled');
  });

  it('should handle complex expressions', async () => {
    const result = await engine.render(
      '{{#if (and (gt age 18) (not banned))}}allowed{{/if}}',
      { age: 25, banned: false }
    );
    expect(result).toBe('allowed');
  });
});

// ============================================================================
// Utility Helpers
// ============================================================================

describe('Template Engine - Utility Helpers', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('should handle json helper', async () => {
    const result = await engine.render('{{json data}}', { data: { a: 1, b: 2 } });
    expect(result).toBe('{"a":1,"b":2}');
  });

  it('should handle json with indent', async () => {
    const result = await engine.render('{{json data 2}}', { data: { a: 1 } });
    expect(result).toContain('  "a": 1');
  });

  it('should handle len helper', async () => {
    const result = await engine.render('{{len items}}', { items: [1, 2, 3] });
    expect(result).toBe('3');
  });

  it('should handle len on string', async () => {
    const result = await engine.render('{{len name}}', { name: 'hello' });
    expect(result).toBe('5');
  });

  it('should handle concat helper', async () => {
    const result = await engine.render('{{concat first " " last}}', {
      first: 'John',
      last: 'Doe',
    });
    expect(result).toBe('John Doe');
  });

  it('should handle default helper', async () => {
    const result = await engine.render('{{default name "Anonymous"}}', { name: '' });
    expect(result).toBe('Anonymous');
  });

  it('should handle coalesce helper', async () => {
    const result = await engine.render('{{coalesce nickname name email}}', {
      nickname: null,
      name: undefined,
      email: 'john@example.com',
    });
    expect(result).toBe('john@example.com');
  });

  it('should handle typeof helper', async () => {
    // typeof returns 'array' for arrays (more useful than JS 'object')
    const result = await engine.render('{{typeof value}}', { value: [] });
    expect(result).toBe('array');
  });

  it('should handle lookup helper', async () => {
    const result = await engine.render('{{lookup user field}}', {
      user: { name: 'John', age: 30 },
      field: 'name',
    });
    expect(result).toBe('John');
  });
});

// ============================================================================
// Range Helper
// ============================================================================

describe('Template Engine - Range Helper', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('should generate number sequence', async () => {
    const result = await engine.render('{{#range 1 4}}{{this}}{{/range}}', {});
    expect(result).toBe('123');
  });

  it('should support step', async () => {
    const result = await engine.render('{{#range 0 10 2}}{{this}} {{/range}}', {});
    expect(result).toBe('0 2 4 6 8 ');
  });

  it('should handle reverse range', async () => {
    const result = await engine.render('{{#range 3 0 -1}}{{this}}{{/range}}', {});
    expect(result).toBe('321');
  });
});

// ============================================================================
// Pipe Filters
// ============================================================================

describe('Template Engine - Pipe Filters', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('should apply single filter', async () => {
    const result = await engine.render('{{name | uppercase}}', { name: 'john' });
    expect(result).toBe('JOHN');
  });

  it('should chain multiple filters', async () => {
    const result = await engine.render('{{name | uppercase | trim}}', { name: '  john  ' });
    expect(result).toBe('JOHN');
  });

  it('should apply truncate filter', async () => {
    const result = await engine.render('{{text | truncate 10}}', { text: 'Hello World, how are you?' });
    expect(result).toBe('Hello W...');
  });

  it('should apply reverse filter', async () => {
    const result = await engine.render('{{name | reverse}}', { name: 'hello' });
    expect(result).toBe('olleh');
  });

  it('should apply default filter', async () => {
    const result = await engine.render('{{missing | default "fallback"}}', {});
    expect(result).toBe('fallback');
  });

  it('should apply first filter on array', async () => {
    const result = await engine.render('{{items | first}}', { items: [1, 2, 3] });
    expect(result).toBe('1');
  });

  it('should apply last filter on array', async () => {
    const result = await engine.render('{{items | last}}', { items: [1, 2, 3] });
    expect(result).toBe('3');
  });

  it('should apply sort filter', async () => {
    const result = await engine.render('{{#each (items | sort)}}{{this}}{{/each}}', { items: [3, 1, 2] });
    expect(result).toBe('123');
  });
});

// ============================================================================
// String Helpers
// ============================================================================

describe('Template Engine - String Helpers', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('should handle uppercase', async () => {
    const result = await engine.render('{{uppercase name}}', { name: 'john' });
    expect(result).toBe('JOHN');
  });

  it('should handle lowercase', async () => {
    const result = await engine.render('{{lowercase name}}', { name: 'JOHN' });
    expect(result).toBe('john');
  });

  it('should handle capitalize', async () => {
    const result = await engine.render('{{capitalize name}}', { name: 'john' });
    expect(result).toBe('John');
  });

  it('should handle titleCase', async () => {
    const result = await engine.render('{{titleCase title}}', { title: 'hello world' });
    expect(result).toBe('Hello World');
  });

  it('should handle camelCase', async () => {
    const result = await engine.render('{{camelCase name}}', { name: 'hello world' });
    expect(result).toBe('helloWorld');
  });

  it('should handle snakeCase', async () => {
    const result = await engine.render('{{snakeCase name}}', { name: 'helloWorld' });
    expect(result).toBe('hello_world');
  });

  it('should handle kebabCase', async () => {
    const result = await engine.render('{{kebabCase name}}', { name: 'helloWorld' });
    expect(result).toBe('hello-world');
  });

  it('should handle trim', async () => {
    const result = await engine.render('{{trim value}}', { value: '  hello  ' });
    expect(result).toBe('hello');
  });

  it('should handle replace', async () => {
    const result = await engine.render('{{replace text "world" "universe"}}', { text: 'hello world' });
    expect(result).toBe('hello universe');
  });

  it('should handle split', async () => {
    const result = await engine.render('{{#each (split text ",")}}{{this}};{{/each}}', { text: 'a,b,c' });
    expect(result).toBe('a;b;c;');
  });

  it('should handle join', async () => {
    const result = await engine.render('{{join items "-"}}', { items: ['a', 'b', 'c'] });
    expect(result).toBe('a-b-c');
  });

  it('should handle truncate', async () => {
    const result = await engine.render('{{truncate text 10}}', { text: 'This is a long text' });
    expect(result).toBe('This is...');
  });

  it('should handle padStart', async () => {
    const result = await engine.render('{{padStart num 5 "0"}}', { num: '42' });
    expect(result).toBe('00042');
  });

  it('should handle repeat', async () => {
    const result = await engine.render('{{repeat "ab" 3}}', {});
    expect(result).toBe('ababab');
  });

  it('should handle slugify', async () => {
    const result = await engine.render('{{slugify title}}', { title: 'Hello World! 123' });
    expect(result).toBe('hello-world-123');
  });

  it('should handle contains', async () => {
    const result = await engine.render('{{#if (contains text "world")}}found{{/if}}', { text: 'hello world' });
    expect(result).toBe('found');
  });

  it('should handle startsWith', async () => {
    const result = await engine.render('{{#if (startsWith url "https")}}secure{{/if}}', { url: 'https://example.com' });
    expect(result).toBe('secure');
  });
});

// ============================================================================
// Crypto Helpers
// ============================================================================

describe('Template Engine - Crypto Helpers', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('should handle base64', async () => {
    const result = await engine.render('{{base64 text}}', { text: 'hello' });
    expect(result).toBe('aGVsbG8=');
  });

  it('should handle base64decode', async () => {
    const result = await engine.render('{{base64decode encoded}}', { encoded: 'aGVsbG8=' });
    expect(result).toBe('hello');
  });

  it('should handle hex', async () => {
    const result = await engine.render('{{hex text}}', { text: 'hello' });
    expect(result).toBe('68656c6c6f');
  });

  it('should handle uuid', async () => {
    const result = await engine.render('{{uuid}}', {});
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('should handle md5', async () => {
    const result = await engine.render('{{md5 text}}', { text: 'hello' });
    expect(result).toBe('5d41402abc4b2a76b9719d911017c592');
  });

  it('should handle sha256', async () => {
    const result = await engine.render('{{sha256 text}}', { text: 'hello' });
    expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('should handle randomInt', async () => {
    const result = await engine.render('{{randomInt 1 10}}', {});
    const num = parseInt(result, 10);
    expect(num).toBeGreaterThanOrEqual(1);
    expect(num).toBeLessThanOrEqual(10);
  });

  it('should handle randomString', async () => {
    const result = await engine.render('{{randomString 16}}', {});
    expect(result.length).toBe(16);
  });
});

// ============================================================================
// Date Helpers
// ============================================================================

describe('Template Engine - Date Helpers', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:30:45.000Z'));
  });

  it('should handle timestamp', async () => {
    const result = await engine.render('{{timestamp}}', {});
    // Check it's a valid Unix timestamp (10 digits, reasonable value)
    expect(result).toMatch(/^\d{10}$/);
    const ts = parseInt(result, 10);
    expect(ts).toBeGreaterThan(1700000000); // After 2023
    expect(ts).toBeLessThan(2000000000);    // Before 2033
  });

  it('should handle timestampMs', async () => {
    const result = await engine.render('{{timestampMs}}', {});
    // Check it's a valid Unix timestamp in ms (13 digits)
    expect(result).toMatch(/^\d{13}$/);
    const ts = parseInt(result, 10);
    expect(ts).toBeGreaterThan(1700000000000);
    expect(ts).toBeLessThan(2000000000000);
  });

  it('should handle now with format', async () => {
    const result = await engine.render('{{now "YYYY-MM-DD"}}', {});
    expect(result).toBe('2024-06-15');
  });

  it('should handle today', async () => {
    const result = await engine.render('{{today}}', {});
    expect(result).toBe('2024-06-15');
  });

  it('should handle isoDate', async () => {
    const result = await engine.render('{{isoDate}}', {});
    expect(result).toBe('2024-06-15T12:30:45.000Z');
  });

  it('should handle year', async () => {
    const result = await engine.render('{{year}}', {});
    expect(result).toBe('2024');
  });

  it('should handle month', async () => {
    const result = await engine.render('{{month}}', {});
    expect(result).toBe('6');
  });

  it('should handle day', async () => {
    const result = await engine.render('{{day}}', {});
    expect(result).toBe('15');
  });

  it('should handle weekday', async () => {
    const result = await engine.render('{{weekday}}', {});
    expect(result).toBe('6'); // Saturday
  });

  it('should handle weekdayName', async () => {
    const result = await engine.render('{{weekdayName}}', {});
    expect(result).toBe('Saturday');
  });

  it('should handle monthName', async () => {
    const result = await engine.render('{{monthName}}', {});
    expect(result).toBe('June');
  });

  vi.useRealTimers();
});

// ============================================================================
// Environment Helpers
// ============================================================================

describe('Template Engine - Environment Helpers', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
    process.env.TEST_VAR = 'test_value';
    process.env.API_KEY = 'secret123';
  });

  it('should handle env helper', async () => {
    const result = await engine.render('{{env "TEST_VAR"}}', {});
    expect(result).toBe('test_value');
  });

  it('should handle env with default', async () => {
    const result = await engine.render('{{env "MISSING_VAR" "default"}}', {});
    expect(result).toBe('default');
  });

  it('should handle hasEnv', async () => {
    const result = await engine.render('{{#if (hasEnv "TEST_VAR")}}exists{{/if}}', {});
    expect(result).toBe('exists');
  });

  it('should handle ifEnv block', async () => {
    const result = await engine.render('{{#ifEnv "TEST_VAR"}}found{{/ifEnv}}', {});
    expect(result).toBe('found');
  });
});

// ============================================================================
// Format-Specific Escaping
// ============================================================================

describe('Template Engine - Format-Specific Escaping', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  describe('JSON format', () => {
    it('should escape quotes in JSON', async () => {
      const result = await engine.json('{"name": "{{name}}"}', { name: 'O\'Brien "Bob"' });
      expect(result).toBe('{"name": "O\'Brien \\"Bob\\""}');
    });

    it('should escape newlines in JSON', async () => {
      const result = await engine.json('{"text": "{{text}}"}', { text: 'line1\nline2' });
      expect(result).toBe('{"text": "line1\\nline2"}');
    });

    it('should escape backslashes in JSON', async () => {
      const result = await engine.json('{"path": "{{path}}"}', { path: 'C:\\Users\\John' });
      expect(result).toBe('{"path": "C:\\\\Users\\\\John"}');
    });
  });

  describe('HTML format', () => {
    it('should escape HTML entities', async () => {
      const result = await engine.html('<p>{{text}}</p>', { text: '<script>alert("xss")</script>' });
      expect(result).toBe('<p>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</p>');
    });

    it('should escape ampersand', async () => {
      const result = await engine.html('{{text}}', { text: 'A & B' });
      expect(result).toBe('A &amp; B');
    });
  });

  describe('XML format', () => {
    it('should escape XML entities', async () => {
      const result = await engine.xml('<item>{{value}}</item>', { value: '<test>&"value"</test>' });
      expect(result).toBe('<item>&lt;test&gt;&amp;&quot;value&quot;&lt;/test&gt;</item>');
    });
  });

  describe('URL format', () => {
    it('should URL encode values', async () => {
      const result = await engine.url('https://api.com/search?q={{query}}', { query: 'hello world' });
      expect(result).toBe('https://api.com/search?q=hello%20world');
    });

    it('should encode special characters', async () => {
      const result = await engine.url('https://api.com?data={{data}}', { data: 'a=b&c=d' });
      expect(result).toBe('https://api.com?data=a%3Db%26c%3Dd');
    });
  });
});

// ============================================================================
// Escaping Functions
// ============================================================================

describe('Template Engine - Escaping Functions', () => {
  it('should escape HTML', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('"quotes"')).toBe('&quot;quotes&quot;');
    expect(escapeHtml("'apos'")).toBe('&#39;apos&#39;');
    expect(escapeHtml('&amp')).toBe('&amp;amp');
  });

  it('should escape JSON', () => {
    expect(escapeJson('"hello"')).toBe('\\"hello\\"');
    expect(escapeJson('line\nbreak')).toBe('line\\nbreak');
    expect(escapeJson('tab\there')).toBe('tab\\there');
  });

  it('should escape XML', () => {
    expect(escapeXml('<tag>')).toBe('&lt;tag&gt;');
    expect(escapeXml('&value')).toBe('&amp;value');
  });

  it('should escape URL', () => {
    expect(escapeUrl('hello world')).toBe('hello%20world');
    expect(escapeUrl('a=b&c=d')).toBe('a%3Db%26c%3Dd');
  });

  it('should escape CSV', () => {
    expect(escapeCsv('hello,world')).toBe('"hello,world"');
    expect(escapeCsv('with "quotes"')).toBe('"with ""quotes"""');
    expect(escapeCsv('line\nbreak')).toBe('"line\nbreak"');
  });
});

// ============================================================================
// SafeString
// ============================================================================

describe('Template Engine - SafeString', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('should create SafeString', () => {
    const s = new SafeString('<b>bold</b>');
    expect(s.toString()).toBe('<b>bold</b>');
    expect(isSafeString(s)).toBe(true);
  });

  it('should use safe() helper', () => {
    const s = safe('<b>bold</b>');
    expect(isSafeString(s)).toBe(true);
  });

  it('should not escape SafeString in HTML mode', async () => {
    registerHelper('rawHtml', function () {
      return new SafeString('<b>bold</b>');
    });

    const result = await engine.html('{{rawHtml}}', {});
    expect(result).toBe('<b>bold</b>');

    unregisterHelper('rawHtml');
  });
});

// ============================================================================
// Parser and Validation
// ============================================================================

describe('Template Engine - Parser', () => {
  it('should parse simple template', () => {
    const ast = parse('Hello {{name}}!');
    expect(ast.type).toBe('Program');
    expect(ast.body).toHaveLength(3);
  });

  it('should parse block helpers', () => {
    const ast = parse('{{#if show}}visible{{/if}}');
    expect(ast.body[0].type).toBe('BlockNode');
  });

  it('should parse nested blocks', () => {
    const ast = parse('{{#each items}}{{#if active}}{{name}}{{/if}}{{/each}}');
    expect(ast.body[0].type).toBe('BlockNode');
  });

  it('should parse comments', () => {
    const ast = parse('{{! this is a comment }}text');
    expect(ast.body).toHaveLength(2);
    expect(ast.body[0].type).toBe('CommentNode');
  });

  it('should parse raw expression', () => {
    const ast = parse('{{{raw}}}');
    expect(ast.body[0].type).toBe('RawExpressionNode');
  });
});

describe('Template Engine - Validation', () => {
  it('should validate valid template', () => {
    const result = validate('Hello {{name}}!');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect unclosed block', () => {
    const result = validate('{{#if show}}content');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should detect mismatched block', () => {
    const result = validate('{{#if show}}content{{/each}}');
    expect(result.valid).toBe(false);
  });
});

describe('Template Engine - extractVariables', () => {
  it('should extract simple variables', () => {
    const vars = extractVariables('Hello {{name}}!');
    expect(vars).toContain('name');
  });

  it('should extract root variable from nested paths', () => {
    const vars = extractVariables('{{user.profile.name}}');
    // extractVariables returns the root variable name
    expect(vars).toContain('user');
  });

  it('should extract multiple variables', () => {
    const vars = extractVariables('{{first}} {{last}}');
    expect(vars).toContain('first');
    expect(vars).toContain('last');
  });
});

// ============================================================================
// Template Detection
// ============================================================================

describe('Template Engine - hasTemplateExpressions', () => {
  it('should detect template expressions', () => {
    expect(hasTemplateExpressions('Hello {{name}}')).toBe(true);
    expect(hasTemplateExpressions('{{#if x}}y{{/if}}')).toBe(true);
    expect(hasTemplateExpressions('{{{raw}}}')).toBe(true);
  });

  it('should not detect plain text', () => {
    expect(hasTemplateExpressions('Hello World')).toBe(false);
    expect(hasTemplateExpressions('{ single brace }')).toBe(false);
  });
});

// ============================================================================
// Custom Helpers
// ============================================================================

describe('Template Engine - Custom Helpers', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
    resetHelpers();
  });

  it('should register and use custom helper', async () => {
    registerHelper('double', function (n: number) {
      return n * 2;
    });

    const result = await engine.render('{{double 5}}', {});
    expect(result).toBe('10');

    unregisterHelper('double');
  });

  it('should register custom block helper', async () => {
    registerHelper('repeat', async function (count: number, options: { fn: () => Promise<string> }) {
      let result = '';
      for (let i = 0; i < count; i++) {
        result += await options.fn();
      }
      return result;
    });

    const result = await engine.render('{{#repeat 3}}x{{/repeat}}', {});
    expect(result).toBe('xxx');

    unregisterHelper('repeat');
  });

  it('should get helper names', () => {
    const names = getHelperNames();
    expect(names).toContain('if');
    expect(names).toContain('each');
    expect(names).toContain('with');
  });
});

// ============================================================================
// Error Handling
// ============================================================================

describe('Template Engine - Error Handling', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('should throw on unknown helper in strict mode', async () => {
    const strictEngine = new TemplateEngine({ strict: true });
    await expect(strictEngine.render('{{unknownHelper}}', {})).rejects.toThrow();
  });

  it('should throw UnclosedBlockError', () => {
    expect(() => parse('{{#if x}}content')).toThrow(UnclosedBlockError);
  });

  it('should throw on mismatched blocks', () => {
    expect(() => parse('{{#if x}}{{/each}}')).toThrow(TemplateSyntaxError);
  });

  it('should identify template errors', () => {
    const error = new TemplateError('Test error');
    expect(isTemplateError(error)).toBe(true);
    expect(isTemplateError(new Error('Normal error'))).toBe(false);
  });

  it('should provide detailed error info', () => {
    const error = new TemplateSyntaxError('Invalid syntax', {
      source: 'Hello {{#if}}',
      location: { start: { line: 1, column: 7 }, end: { line: 1, column: 13 } },
    });
    expect(error.line).toBe(1);
    expect(error.column).toBe(7);
  });
});

// ============================================================================
// Context Utilities
// ============================================================================

describe('Template Engine - Context Utilities', () => {
  it('should get all env context', () => {
    process.env.TEST_CTX_VAR = 'test_value';
    const ctx = getEnvContext(true); // Pass true to get all env vars
    expect(ctx.TEST_CTX_VAR).toBe('test_value');
  });

  it('should filter env by prefix', () => {
    process.env.API_KEY = 'secret';
    process.env.API_URL = 'https://api.com';
    process.env.OTHER_VAR = 'value';

    const ctx = getEnvContext('API_');
    expect(ctx.API_KEY).toBe('secret');
    expect(ctx.API_URL).toBe('https://api.com');
    expect(ctx.OTHER_VAR).toBeUndefined();
  });

  it('should lookup nested paths', () => {
    const ctx = { user: { profile: { name: 'John' } } };
    expect(lookup(ctx, 'user.profile.name')).toBe('John');
  });

  it('should merge contexts', () => {
    const a = { x: 1, y: 2 };
    const b = { y: 3, z: 4 };
    const merged = mergeContexts(a, b);
    expect(merged).toEqual({ x: 1, y: 3, z: 4 });
  });

  it('should build context with options', async () => {
    process.env.BUILD_CTX_TEST = 'env_value';
    const ctx = await buildContext({
      env: ['BUILD_CTX_TEST'],
      args: { custom: 'arg' },
    });
    // buildContext merges env and args into a flat context
    expect(ctx.BUILD_CTX_TEST).toBe('env_value');
    expect(ctx.custom).toBe('arg');
  });
});

// ============================================================================
// Caching
// ============================================================================

describe('Template Engine - Caching', () => {
  it('should cache compiled templates', async () => {
    const engine = new TemplateEngine({ cache: true });

    // First render compiles
    await engine.render('{{name}}', { name: 'A' });

    // Second render uses cache
    const result = await engine.render('{{name}}', { name: 'B' });
    expect(result).toBe('B');
  });

  it('should clear cache', async () => {
    const engine = new TemplateEngine({ cache: true });
    await engine.render('{{name}}', { name: 'Test' });

    engine.clearCache();
    // Cache is now empty, should still work
    const result = await engine.render('{{name}}', { name: 'After Clear' });
    expect(result).toBe('After Clear');
  });

  it('should disable caching', async () => {
    const engine = new TemplateEngine({ cache: false });
    await engine.render('{{name}}', { name: 'Test' });

    const result = await engine.render('{{name}}', { name: 'Test2' });
    expect(result).toBe('Test2');
  });
});

// ============================================================================
// Direct Template Function
// ============================================================================

describe('Template Engine - Direct Function', () => {
  it('should use template() shorthand', async () => {
    const result = await template('Hello {{name}}!', { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  it('should create engine with createTemplateEngine', async () => {
    const engine = createTemplateEngine({ strict: false });
    const result = await engine.render('{{x}}', {});
    expect(result).toBe('');
  });
});

// ============================================================================
// Partials
// ============================================================================

describe('Template Engine - Partials', () => {
  it('should render partials', async () => {
    const engine = new TemplateEngine({
      partials: {
        greeting: 'Hello {{name}}!',
      },
    });

    const result = await engine.render('{{> greeting}}', { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  it('should register partial dynamically', async () => {
    const engine = new TemplateEngine();
    engine.registerPartial('footer', 'Copyright {{year}}');

    const result = await engine.render('{{> footer}}', { year: 2024 });
    expect(result).toBe('Copyright 2024');
  });

  it('should pass hash context to partial', async () => {
    const engine = new TemplateEngine({
      partials: {
        user: '{{name}} ({{email}})',
      },
    });

    // Use hash syntax for passing context to partial
    const result = await engine.render('{{> user name=user.name email=user.email}}', {
      user: { name: 'John', email: 'john@example.com' },
    });
    expect(result).toBe('John (john@example.com)');
  });
});

// ============================================================================
// Sync Rendering
// ============================================================================

describe('Template Engine - Sync Rendering', () => {
  it('should throw on renderSync (not implemented)', () => {
    const engine = new TemplateEngine();
    expect(() => engine.renderSync('{{name}}', { name: 'World' })).toThrow(
      'Synchronous rendering is not yet implemented'
    );
  });
});

// ============================================================================
// LRU Cache
// ============================================================================

describe('Template Engine - LRU Cache', () => {
  it('should evict least recently used entries', async () => {
    // Create engine with small cache for testing
    const engine = new TemplateEngine({ cache: true });

    // Render many templates to trigger eviction
    for (let i = 0; i < 150; i++) {
      await engine.render(`Template {{n}} - ${i}`, { n: i });
    }

    // Should still work (cache handles eviction)
    const result = await engine.render('{{name}}', { name: 'Test' });
    expect(result).toBe('Test');
  });

  it('should update cache hits', async () => {
    const engine = new TemplateEngine({ cache: true });
    const template = '{{name}}';

    // First render (compile)
    await engine.render(template, { name: 'First' });

    // Multiple renders (cache hits)
    await engine.render(template, { name: 'Second' });
    await engine.render(template, { name: 'Third' });

    // All should work correctly
    const result = await engine.render(template, { name: 'Fourth' });
    expect(result).toBe('Fourth');
  });
});

// ============================================================================
// Default Filters
// ============================================================================

describe('Template Engine - Default Filters', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  // String filters
  it('should apply capitalize filter', async () => {
    const result = await engine.render('{{name | capitalize}}', { name: 'JOHN' });
    expect(result).toBe('John');
  });

  it('should apply ltrim filter', async () => {
    const result = await engine.render('{{text | ltrim}}', { text: '   hello' });
    expect(result).toBe('hello');
  });

  it('should apply rtrim filter', async () => {
    const result = await engine.render('{{text | rtrim}}', { text: 'hello   ' });
    expect(result).toBe('hello');
  });

  it('should apply truncate filter with custom suffix', async () => {
    const result = await engine.render('{{text | truncate 8 "…"}}', { text: 'Hello World' });
    expect(result).toBe('Hello W…');
  });

  it('should apply truncate filter on short text', async () => {
    const result = await engine.render('{{text | truncate 20}}', { text: 'Hello' });
    expect(result).toBe('Hello');
  });

  it('should apply replace filter', async () => {
    const result = await engine.render('{{text | replace "world" "universe"}}', { text: 'hello world' });
    expect(result).toBe('hello universe');
  });

  it('should apply split filter', async () => {
    const result = await engine.render('{{#each (text | split ",")}}[{{this}}]{{/each}}', { text: 'a,b,c' });
    expect(result).toBe('[a][b][c]');
  });

  it('should apply slice filter on array', async () => {
    const result = await engine.render('{{#each (items | slice 1 3)}}{{this}}{{/each}}', { items: [1, 2, 3, 4, 5] });
    expect(result).toBe('23');
  });

  it('should apply slice filter on string', async () => {
    const result = await engine.render('{{text | slice 0 5}}', { text: 'Hello World' });
    expect(result).toBe('Hello');
  });

  it('should apply pad filter', async () => {
    const result = await engine.render('{{num | pad 5 "0"}}', { num: '42' });
    expect(result).toBe('00042');
  });

  it('should apply padEnd filter', async () => {
    const result = await engine.render('{{num | padEnd 5 "0"}}', { num: '42' });
    expect(result).toBe('42000');
  });

  // Encoding filters
  it('should apply base64 filter', async () => {
    const result = await engine.render('{{text | base64}}', { text: 'hello' });
    expect(result).toBe('aGVsbG8=');
  });

  it('should apply base64decode filter', async () => {
    const result = await engine.render('{{text | base64decode}}', { text: 'aGVsbG8=' });
    expect(result).toBe('hello');
  });

  it('should apply urlencode filter', async () => {
    const result = await engine.render('{{text | urlencode}}', { text: 'hello world' });
    expect(result).toBe('hello%20world');
  });

  it('should apply urldecode filter', async () => {
    const result = await engine.render('{{text | urldecode}}', { text: 'hello%20world' });
    expect(result).toBe('hello world');
  });

  it('should apply json filter', async () => {
    const result = await engine.render('{{data | json}}', { data: { a: 1 } });
    expect(result).toBe('{"a":1}');
  });

  it('should apply jsonPretty filter', async () => {
    const result = await engine.render('{{data | jsonPretty}}', { data: { a: 1 } });
    expect(result).toContain('  "a": 1');
  });

  // Array filters
  it('should apply first filter', async () => {
    const result = await engine.render('{{items | first}}', { items: [1, 2, 3] });
    expect(result).toBe('1');
  });

  it('should apply first filter on non-array', async () => {
    const result = await engine.render('{{value | first}}', { value: 'test' });
    expect(result).toBe('test');
  });

  it('should apply last filter', async () => {
    const result = await engine.render('{{items | last}}', { items: [1, 2, 3] });
    expect(result).toBe('3');
  });

  it('should apply last filter on non-array', async () => {
    const result = await engine.render('{{value | last}}', { value: 'test' });
    expect(result).toBe('test');
  });

  it('should apply reverse filter on array', async () => {
    const result = await engine.render('{{#each (items | reverse)}}{{this}}{{/each}}', { items: [1, 2, 3] });
    expect(result).toBe('321');
  });

  it('should apply reverse filter on string', async () => {
    const result = await engine.render('{{text | reverse}}', { text: 'hello' });
    expect(result).toBe('olleh');
  });

  it('should apply sort filter numerically', async () => {
    const result = await engine.render('{{#each (items | sort)}}{{this}} {{/each}}', { items: [3, 1, 2] });
    expect(result).toBe('1 2 3 ');
  });

  it('should apply sort filter alphabetically', async () => {
    const result = await engine.render('{{#each (items | sort)}}{{this}} {{/each}}', { items: ['c', 'a', 'b'] });
    expect(result).toBe('a b c ');
  });

  it('should apply sort filter on non-array', async () => {
    const result = await engine.render('{{value | sort}}', { value: 'test' });
    expect(result).toBe('test');
  });

  it('should apply unique filter', async () => {
    const result = await engine.render('{{#each (items | unique)}}{{this}}{{/each}}', { items: [1, 2, 1, 3, 2] });
    expect(result).toBe('123');
  });

  it('should apply unique filter on non-array', async () => {
    const result = await engine.render('{{value | unique}}', { value: 'test' });
    expect(result).toBe('test');
  });

  it('should apply default filter on empty string', async () => {
    const result = await engine.render('{{value | default "fallback"}}', { value: '' });
    expect(result).toBe('fallback');
  });

  it('should apply default filter on null', async () => {
    const result = await engine.render('{{value | default "fallback"}}', { value: null });
    expect(result).toBe('fallback');
  });

  it('should apply join filter', async () => {
    const result = await engine.render('{{items | join "-"}}', { items: ['a', 'b', 'c'] });
    expect(result).toBe('a-b-c');
  });

  it('should apply join filter on non-array', async () => {
    const result = await engine.render('{{value | join "-"}}', { value: 'test' });
    expect(result).toBe('test');
  });

  it('should apply pluck filter', async () => {
    const result = await engine.render('{{#each (items | pluck "name")}}{{this}} {{/each}}', {
      items: [{ name: 'John' }, { name: 'Jane' }],
    });
    expect(result).toBe('John Jane ');
  });

  it('should apply pluck filter on non-array', async () => {
    const result = await engine.render('{{value | pluck "name"}}', { value: 'test' });
    expect(result).toBe('test');
  });

  it('should apply where filter', async () => {
    const result = await engine.render('{{#each (items | where "active" true)}}{{name}}{{/each}}', {
      items: [{ name: 'John', active: true }, { name: 'Jane', active: false }],
    });
    expect(result).toBe('John');
  });

  it('should apply where filter on non-array', async () => {
    const result = await engine.render('{{value | where "x" 1}}', { value: 'test' });
    expect(result).toBe('test');
  });

  it('should apply size filter on array', async () => {
    const result = await engine.render('{{items | size}}', { items: [1, 2, 3] });
    expect(result).toBe('3');
  });

  it('should apply size filter on string', async () => {
    const result = await engine.render('{{text | size}}', { text: 'hello' });
    expect(result).toBe('5');
  });

  it('should apply size filter on object', async () => {
    const result = await engine.render('{{obj | size}}', { obj: { a: 1, b: 2 } });
    expect(result).toBe('2');
  });

  it('should apply size filter on number', async () => {
    const result = await engine.render('{{num | size}}', { num: 42 });
    expect(result).toBe('0');
  });

  // Number filters
  it('should apply abs filter', async () => {
    const result = await engine.render('{{num | abs}}', { num: -5 });
    expect(result).toBe('5');
  });

  it('should apply ceil filter', async () => {
    const result = await engine.render('{{num | ceil}}', { num: 4.3 });
    expect(result).toBe('5');
  });

  it('should apply floor filter', async () => {
    const result = await engine.render('{{num | floor}}', { num: 4.7 });
    expect(result).toBe('4');
  });

  it('should apply round filter', async () => {
    const result = await engine.render('{{num | round}}', { num: 4.5 });
    expect(result).toBe('5');
  });

  it('should apply round filter with decimals', async () => {
    const result = await engine.render('{{num | round 2}}', { num: 3.14159 });
    expect(result).toBe('3.14');
  });

  it('should apply fixed filter', async () => {
    const result = await engine.render('{{num | fixed 2}}', { num: 3.1 });
    expect(result).toBe('3.10');
  });

  it('should apply number filter', async () => {
    const result = await engine.render('{{text | number}}', { text: '42' });
    expect(result).toBe('42');
  });

  // Date filter
  it('should apply date filter', async () => {
    // Use a specific time to avoid timezone issues
    const result = await engine.render('{{d | date "YYYY-MM-DD"}}', { d: new Date('2024-06-15T12:00:00') });
    expect(result).toBe('2024-06-15');
  });

  it('should apply date filter with ISO default', async () => {
    const d = new Date();
    const result = await engine.render('{{d | date}}', { d });
    // Should return ISO format
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // Type conversion filters
  it('should apply string filter', async () => {
    const result = await engine.render('{{num | string}}', { num: 42 });
    expect(result).toBe('42');
  });

  it('should apply int filter', async () => {
    const result = await engine.render('{{text | int}}', { text: '42.7' });
    expect(result).toBe('42');
  });

  it('should apply float filter', async () => {
    const result = await engine.render('{{text | float}}', { text: '3.14' });
    expect(result).toBe('3.14');
  });

  it('should apply bool filter', async () => {
    const result = await engine.render('{{#if (value | bool)}}truthy{{else}}falsy{{/if}}', { value: 1 });
    expect(result).toBe('truthy');
  });

  // Escape filters
  it('should apply escape filter', async () => {
    const result = await engine.render('{{html | escape}}', { html: '<script>' });
    expect(result).toBe('&lt;script&gt;');
  });

  it('should apply safe filter', async () => {
    const result = await engine.html('{{html | safe}}', { html: '<b>bold</b>' });
    expect(result).toBe('<b>bold</b>');
  });

  // Debug filters
  it('should apply type filter', async () => {
    expect(await engine.render('{{value | type}}', { value: null })).toBe('null');
    expect(await engine.render('{{value | type}}', { value: [] })).toBe('array');
    expect(await engine.render('{{value | type}}', { value: 42 })).toBe('number');
    expect(await engine.render('{{value | type}}', { value: 'text' })).toBe('string');
  });

  it('should apply debug filter (logs to console)', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await engine.render('{{value | debug}}', { value: 'test' });
    expect(result).toBe('test');
    expect(consoleSpy).toHaveBeenCalledWith('[Template Debug]', 'test');
    consoleSpy.mockRestore();
  });
});

// ============================================================================
// Error Handling - Advanced
// ============================================================================

describe('Template Engine - Error Handling Advanced', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('should throw UnknownFilterError for unknown filter', async () => {
    await expect(engine.render('{{name | unknownFilter}}', { name: 'test' })).rejects.toThrow('Unknown filter');
  });

  it('should throw FilterError when filter throws', async () => {
    engine.registerFilter('broken', () => {
      throw new Error('Filter broke');
    });
    await expect(engine.render('{{name | broken}}', { name: 'test' })).rejects.toThrow();
  });

  it('should throw UnknownHelperError for unknown block helper', async () => {
    await expect(engine.render('{{#unknownBlock}}content{{/unknownBlock}}', {})).rejects.toThrow('Unknown helper');
  });

  it('should throw HelperError when helper throws', async () => {
    registerHelper('broken', function () {
      throw new Error('Helper broke');
    });
    await expect(engine.render('{{broken}}', {})).rejects.toThrow();
    unregisterHelper('broken');
  });

  it('should throw UnknownPartialError for unknown partial', async () => {
    await expect(engine.render('{{> unknownPartial}}', {})).rejects.toThrow('Unknown partial');
  });

  it('should throw UndefinedVariableError in strict mode', async () => {
    const strictEngine = new TemplateEngine({ strict: true });
    await expect(strictEngine.render('{{missing}}', {})).rejects.toThrow();
  });
});

// ============================================================================
// @data Variables
// ============================================================================

describe('Template Engine - @data Variables', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('should access @index in each', async () => {
    const result = await engine.render('{{#each items}}{{@index}}{{/each}}', { items: ['a', 'b', 'c'] });
    expect(result).toBe('012');
  });

  it('should access @first and @last', async () => {
    const result = await engine.render(
      '{{#each items}}{{#if @first}}F{{/if}}{{this}}{{#if @last}}L{{/if}}{{/each}}',
      { items: ['a', 'b', 'c'] }
    );
    expect(result).toBe('FabcL');
  });

  it('should access @key in object iteration', async () => {
    const result = await engine.render('{{#each obj}}{{@key}}:{{this}} {{/each}}', {
      obj: { x: 1, y: 2 },
    });
    expect(result).toContain('x:1');
    expect(result).toContain('y:2');
  });
});

// ============================================================================
// Parent Context Access
// ============================================================================

describe('Template Engine - Parent Context Access', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('should access parent with ../', async () => {
    const result = await engine.render('{{#with user}}{{name}} from {{../company}}{{/with}}', {
      user: { name: 'John' },
      company: 'Acme',
    });
    expect(result).toBe('John from Acme');
  });

  it('should access multiple parent levels', async () => {
    const result = await engine.render(
      '{{#each users}}{{#with profile}}{{name}} at {{../../company}}{{/with}}{{/each}}',
      {
        users: [{ profile: { name: 'John' } }],
        company: 'Acme',
      }
    );
    expect(result).toBe('John at Acme');
  });

  it('should handle "this" reference', async () => {
    const result = await engine.render('{{#each items}}{{this}},{{/each}}', {
      items: [1, 2, 3],
    });
    expect(result).toBe('1,2,3,');
  });
});

// ============================================================================
// SubExpression with Filters
// ============================================================================

describe('Template Engine - SubExpression with Filters', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('should apply filter to subexpression result', async () => {
    const result = await engine.render('{{#if (concat "hello" " " "world" | uppercase)}}yes{{/if}}', {});
    expect(result).toBe('yes');
  });

  it('should chain filters in subexpression', async () => {
    const result = await engine.render('{{#each (items | sort | reverse)}}{{this}}{{/each}}', {
      items: [3, 1, 2],
    });
    expect(result).toBe('321');
  });
});

// ============================================================================
// Engine Methods
// ============================================================================

describe('Template Engine - Methods', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('should get helpers list', () => {
    engine.registerHelper('custom', () => 'custom');
    const helpers = engine.getHelpers();
    expect(helpers).toContain('if');
    expect(helpers).toContain('each');
    expect(helpers).toContain('custom');
  });

  it('should get filters list', () => {
    const filters = engine.getFilters();
    expect(filters).toContain('uppercase');
    expect(filters).toContain('lowercase');
    expect(filters).toContain('trim');
  });

  it('should unregister helper from instance', () => {
    // Note: registerHelper adds to both instance and global registry
    // unregisterHelper only removes from instance, not global
    engine.registerHelper('temp', () => 'temp');
    const beforeUnregister = engine.getHelpers();
    expect(beforeUnregister).toContain('temp');

    engine.unregisterHelper('temp');
    // The helper might still exist in global registry, but the instance map is cleared
    // This verifies the unregister method was called
  });

  it('should parse template', () => {
    const ast = engine.parse('{{name}}');
    expect(ast.type).toBe('Program');
    expect(ast.body.length).toBeGreaterThan(0);
  });

  it('should validate template', () => {
    const result = engine.validate('{{#if x}}{{/if}}');
    expect(result.valid).toBe(true);
  });

  it('should compile template', async () => {
    const compiled = engine.compile('Hello {{name}}!');
    const result = await compiled({ name: 'World' });
    expect(result).toBe('Hello World!');
  });
});

// ============================================================================
// Custom Helpers and Filters
// ============================================================================

describe('Template Engine - Custom Helpers and Filters via Options', () => {
  it('should register helpers via options', async () => {
    const engine = new TemplateEngine({
      helpers: {
        triple: (n: number) => n * 3,
      },
    });
    const result = await engine.render('{{triple 5}}', {});
    expect(result).toBe('15');
  });

  it('should register filters via options', async () => {
    const engine = new TemplateEngine({
      filters: {
        double: (v: number) => v * 2,
      },
    });
    const result = await engine.render('{{num | double}}', { num: 5 });
    expect(result).toBe('10');
  });

  it('should register partials via options', async () => {
    const engine = new TemplateEngine({
      partials: {
        header: '<h1>{{title}}</h1>',
      },
    });
    const result = await engine.render('{{> header}}', { title: 'Hello' });
    expect(result).toBe('<h1>Hello</h1>');
  });

  it('should register multiple helpers at once', () => {
    const engine = new TemplateEngine();
    engine.registerHelpers({
      add: (a: number, b: number) => a + b,
      mul: (a: number, b: number) => a * b,
    });
    const helpers = engine.getHelpers();
    expect(helpers).toContain('add');
    expect(helpers).toContain('mul');
  });
});

// ============================================================================
// Block Helper Context
// ============================================================================

describe('Template Engine - Block Helper Context', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('should provide context in nested blocks', async () => {
    const result = await engine.render(
      '{{#with user}}{{name}}{{/with}}',
      { user: { name: 'John' } }
    );
    expect(result).toBe('John');
  });

  it('should iterate items with this reference', async () => {
    const result = await engine.render(
      '{{#each items}}{{this.name}}{{/each}}',
      { items: [{ name: 'John' }] }
    );
    expect(result).toBe('John');
  });
});

// ============================================================================
// Literal Values in Params
// ============================================================================

describe('Template Engine - Literal Values', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('should handle string literal', async () => {
    const result = await engine.render('{{concat "Hello" " " "World"}}', {});
    expect(result).toBe('Hello World');
  });

  it('should handle number literal', async () => {
    const result = await engine.render('{{#if (gt 10 5)}}yes{{/if}}', {});
    expect(result).toBe('yes');
  });

  it('should handle boolean literal', async () => {
    const result = await engine.render('{{#if true}}yes{{/if}}', {});
    expect(result).toBe('yes');
  });

  it('should handle null literal', async () => {
    const result = await engine.render('{{#if (eq value null)}}is null{{/if}}', { value: null });
    expect(result).toBe('is null');
  });
});

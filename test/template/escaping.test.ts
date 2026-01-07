/**
 * Template Escaping Tests
 * 100% coverage for escaping.ts
 */

import { describe, it, expect } from 'vitest';
import {
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
} from '../../src/template/escaping.js';

// ============================================================================
// Escape Functions
// ============================================================================

describe('escapeRaw()', () => {
  it('should pass through strings unchanged', () => {
    expect(escapeRaw('Hello World')).toBe('Hello World');
    expect(escapeRaw('<script>alert("xss")</script>')).toBe('<script>alert("xss")</script>');
  });

  it('should convert non-strings using toString', () => {
    expect(escapeRaw(42)).toBe('42');
    expect(escapeRaw(null)).toBe('');
    expect(escapeRaw(undefined)).toBe('');
  });
});

describe('escapeHtml()', () => {
  it('should escape ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('should escape less than', () => {
    expect(escapeHtml('a < b')).toBe('a &lt; b');
  });

  it('should escape greater than', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('should escape all characters at once', () => {
    expect(escapeHtml('<a href="test" data-x=\'y\'>&')).toBe(
      '&lt;a href=&quot;test&quot; data-x=&#39;y&#39;&gt;&amp;'
    );
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should handle non-string values', () => {
    expect(escapeHtml(123)).toBe('123');
  });
});

describe('escapeXml()', () => {
  it('should escape basic XML entities', () => {
    expect(escapeXml('<tag attr="val">&</tag>')).toBe(
      '&lt;tag attr=&quot;val&quot;&gt;&amp;&lt;/tag&gt;'
    );
  });

  it('should use &apos; for single quotes (XML standard)', () => {
    expect(escapeXml("it's")).toBe('it&apos;s');
  });

  it('should remove invalid XML control characters', () => {
    // \x00 (NUL), \x08 (BS), \x0B (VT), \x0C (FF) should be removed
    expect(escapeXml('a\x00b\x08c\x0Bd\x0Ce')).toBe('abcde');
    expect(escapeXml('a\x1Fb\x7Fc')).toBe('abc'); // \x1F and \x7F (DEL)
  });

  it('should preserve allowed control characters', () => {
    // \t (tab), \n (newline), \r (carriage return) are allowed
    expect(escapeXml('a\tb\nc\rd')).toBe('a\tb\nc\rd');
  });
});

describe('escapeJson()', () => {
  describe('non-string values', () => {
    it('should stringify numbers', () => {
      expect(escapeJson(42)).toBe('42');
      expect(escapeJson(3.14)).toBe('3.14');
    });

    it('should stringify booleans', () => {
      expect(escapeJson(true)).toBe('true');
      expect(escapeJson(false)).toBe('false');
    });

    it('should stringify null', () => {
      expect(escapeJson(null)).toBe('null');
    });

    it('should stringify arrays', () => {
      expect(escapeJson([1, 2, 3])).toBe('[1,2,3]');
    });

    it('should stringify objects', () => {
      expect(escapeJson({ a: 1 })).toBe('{"a":1}');
    });

    it('should handle circular references by stringifying toString result', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj.self = obj; // circular reference
      // toString() returns '[object]' for circular references, then JSON.stringify adds quotes
      expect(escapeJson(obj)).toBe('"[object]"');
    });
  });

  describe('string values', () => {
    it('should escape backslashes', () => {
      expect(escapeJson('a\\b')).toBe('a\\\\b');
    });

    it('should escape double quotes', () => {
      expect(escapeJson('say "hi"')).toBe('say \\"hi\\"');
    });

    it('should escape newlines', () => {
      expect(escapeJson('line1\nline2')).toBe('line1\\nline2');
    });

    it('should escape carriage returns', () => {
      expect(escapeJson('line1\rline2')).toBe('line1\\rline2');
    });

    it('should escape tabs', () => {
      expect(escapeJson('a\tb')).toBe('a\\tb');
    });

    it('should escape form feeds', () => {
      expect(escapeJson('a\fb')).toBe('a\\fb');
    });

    it('should escape backspace', () => {
      expect(escapeJson('a\x08b')).toBe('a\\bb');
    });

    it('should escape other control characters as unicode', () => {
      expect(escapeJson('a\x00b')).toBe('a\\u0000b');
      expect(escapeJson('a\x1Fb')).toBe('a\\u001fb');
      expect(escapeJson('a\x0Eb')).toBe('a\\u000eb');
    });

    it('should handle all escapes together', () => {
      expect(escapeJson('"\\\n\r\t\f')).toBe('\\"\\\\\\n\\r\\t\\f');
    });
  });
});

describe('escapeUrl()', () => {
  it('should encode spaces', () => {
    expect(escapeUrl('hello world')).toBe('hello%20world');
  });

  it('should encode special characters', () => {
    expect(escapeUrl('a=1&b=2')).toBe('a%3D1%26b%3D2');
  });

  it('should encode unicode', () => {
    expect(escapeUrl('café')).toBe('caf%C3%A9');
  });

  it('should not encode safe characters', () => {
    expect(escapeUrl('abc123-_.~')).toBe('abc123-_.~');
  });

  it('should handle non-string values', () => {
    expect(escapeUrl(42)).toBe('42');
  });
});

describe('escapeUrlComponent()', () => {
  it('should encode everything escapeUrl does', () => {
    expect(escapeUrlComponent('hello world')).toBe('hello%20world');
  });

  it('should also encode exclamation mark', () => {
    expect(escapeUrlComponent('hello!')).toBe('hello%21');
  });

  it('should also encode single quotes', () => {
    expect(escapeUrlComponent("it's")).toBe('it%27s');
  });

  it('should also encode parentheses', () => {
    expect(escapeUrlComponent('(test)')).toBe('%28test%29');
  });

  it('should also encode asterisk', () => {
    expect(escapeUrlComponent('a*b')).toBe('a%2Ab');
  });

  it('should encode all extra characters together', () => {
    expect(escapeUrlComponent("!(')* ")).toBe('%21%28%27%29%2A%20');
  });
});

describe('escapeCsv()', () => {
  it('should return simple values unchanged', () => {
    expect(escapeCsv('simple')).toBe('simple');
    expect(escapeCsv('123')).toBe('123');
  });

  it('should quote values with commas', () => {
    expect(escapeCsv('a,b')).toBe('"a,b"');
  });

  it('should quote values with newlines', () => {
    expect(escapeCsv('line1\nline2')).toBe('"line1\nline2"');
  });

  it('should quote values with carriage returns', () => {
    expect(escapeCsv('line1\rline2')).toBe('"line1\rline2"');
  });

  it('should quote and escape double quotes', () => {
    expect(escapeCsv('say "hi"')).toBe('"say ""hi"""');
  });

  it('should handle all special cases together', () => {
    expect(escapeCsv('a,b\n"c"')).toBe('"a,b\n""c"""');
  });

  it('should handle non-string values', () => {
    expect(escapeCsv(42)).toBe('42');
  });
});

describe('escapeRegex()', () => {
  it('should escape dot', () => {
    expect(escapeRegex('a.b')).toBe('a\\.b');
  });

  it('should escape asterisk', () => {
    expect(escapeRegex('a*b')).toBe('a\\*b');
  });

  it('should escape plus', () => {
    expect(escapeRegex('a+b')).toBe('a\\+b');
  });

  it('should escape question mark', () => {
    expect(escapeRegex('a?b')).toBe('a\\?b');
  });

  it('should escape caret', () => {
    expect(escapeRegex('^start')).toBe('\\^start');
  });

  it('should escape dollar sign', () => {
    expect(escapeRegex('end$')).toBe('end\\$');
  });

  it('should escape curly braces', () => {
    expect(escapeRegex('a{1,3}')).toBe('a\\{1,3\\}');
  });

  it('should escape parentheses', () => {
    expect(escapeRegex('(group)')).toBe('\\(group\\)');
  });

  it('should escape pipe', () => {
    expect(escapeRegex('a|b')).toBe('a\\|b');
  });

  it('should escape square brackets', () => {
    expect(escapeRegex('[abc]')).toBe('\\[abc\\]');
  });

  it('should escape backslash', () => {
    expect(escapeRegex('a\\b')).toBe('a\\\\b');
  });

  it('should handle all special chars together', () => {
    expect(escapeRegex('.*+?^${}()|[]\\')).toBe(
      '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\'
    );
  });
});

describe('escapeYaml()', () => {
  it('should return simple strings unchanged', () => {
    expect(escapeYaml('hello')).toBe('hello');
    expect(escapeYaml('simple_value')).toBe('simple_value');
  });

  it('should quote empty string', () => {
    expect(escapeYaml('')).toBe('""');
  });

  it('should quote null string', () => {
    expect(escapeYaml('null')).toBe('"null"');
  });

  it('should quote true string', () => {
    expect(escapeYaml('true')).toBe('"true"');
  });

  it('should quote false string', () => {
    expect(escapeYaml('false')).toBe('"false"');
  });

  it('should quote tilde', () => {
    expect(escapeYaml('~')).toBe('"~"');
  });

  it('should quote strings starting with numbers', () => {
    expect(escapeYaml('123abc')).toBe('"123abc"');
    expect(escapeYaml('0')).toBe('"0"');
  });

  it('should quote strings starting with special YAML characters', () => {
    expect(escapeYaml('-item')).toBe('"-item"');
    expect(escapeYaml('?key')).toBe('"?key"');
    expect(escapeYaml(':value')).toBe('":value"');
    expect(escapeYaml(',item')).toBe('",item"');
    expect(escapeYaml('[list')).toBe('"[list"');
    expect(escapeYaml('{map')).toBe('"{map"');
    expect(escapeYaml('#comment')).toBe('"#comment"');
    expect(escapeYaml('&anchor')).toBe('"&anchor"');
    expect(escapeYaml('*alias')).toBe('"*alias"');
    expect(escapeYaml('!tag')).toBe('"!tag"');
    expect(escapeYaml('|literal')).toBe('"|literal"');
    expect(escapeYaml('>folded')).toBe('">folded"');
    expect(escapeYaml("'single")).toBe("\"'single\"");
    expect(escapeYaml('"double')).toBe('"\\"double"');
    expect(escapeYaml('%directive')).toBe('"%directive"');
    expect(escapeYaml('@reserved')).toBe('"@reserved"');
    expect(escapeYaml('`backtick')).toBe('"`backtick"');
  });

  it('should quote strings with newlines', () => {
    expect(escapeYaml('line1\nline2')).toBe('"line1\\nline2"');
  });

  it('should quote strings with carriage returns', () => {
    expect(escapeYaml('line1\rline2')).toBe('"line1\\rline2"');
  });

  it('should quote strings with tabs', () => {
    expect(escapeYaml('a\tb')).toBe('"a\\tb"');
  });

  it('should quote strings with trailing whitespace', () => {
    expect(escapeYaml('value ')).toBe('"value "');
  });

  it('should quote strings with leading whitespace', () => {
    expect(escapeYaml(' value')).toBe('" value"');
  });

  it('should escape backslashes when quoting', () => {
    expect(escapeYaml('path\\to')).toBe('path\\to'); // no quoting needed
    expect(escapeYaml('123\\path')).toBe('"123\\\\path"'); // needs quoting due to number
  });

  it('should escape double quotes when quoting', () => {
    expect(escapeYaml('"quoted"')).toBe('"\\"quoted\\""');
  });
});

// ============================================================================
// Escape Factory
// ============================================================================

describe('getEscaper()', () => {
  it('should return escapeHtml for html format', () => {
    expect(getEscaper('html')).toBe(escapeHtml);
  });

  it('should return escapeXml for xml format', () => {
    expect(getEscaper('xml')).toBe(escapeXml);
  });

  it('should return escapeJson for json format', () => {
    expect(getEscaper('json')).toBe(escapeJson);
  });

  it('should return escapeUrl for url format', () => {
    expect(getEscaper('url')).toBe(escapeUrl);
  });

  it('should return escapeCsv for csv format', () => {
    expect(getEscaper('csv')).toBe(escapeCsv);
  });

  it('should return escapeRaw for raw format', () => {
    expect(getEscaper('raw')).toBe(escapeRaw);
  });

  it('should return escapeRaw for unknown formats', () => {
    expect(getEscaper('unknown' as any)).toBe(escapeRaw);
  });
});

describe('getFormatName()', () => {
  it('should return format names', () => {
    expect(getFormatName('raw')).toBe('Raw (no escaping)');
    expect(getFormatName('html')).toBe('HTML');
    expect(getFormatName('xml')).toBe('XML');
    expect(getFormatName('json')).toBe('JSON');
    expect(getFormatName('url')).toBe('URL');
    expect(getFormatName('csv')).toBe('CSV');
  });

  it('should return format string for unknown formats', () => {
    expect(getFormatName('unknown' as any)).toBe('unknown');
  });
});

// ============================================================================
// Unescape Functions
// ============================================================================

describe('unescapeHtml()', () => {
  it('should unescape basic HTML entities', () => {
    expect(unescapeHtml('&amp;')).toBe('&');
    expect(unescapeHtml('&lt;')).toBe('<');
    expect(unescapeHtml('&gt;')).toBe('>');
    expect(unescapeHtml('&quot;')).toBe('"');
    expect(unescapeHtml('&#39;')).toBe("'");
  });

  it('should unescape hex numeric entities', () => {
    expect(unescapeHtml('&#x41;')).toBe('A');
    expect(unescapeHtml('&#x3C;')).toBe('<');
    expect(unescapeHtml('&#xA9;')).toBe('©');
  });

  it('should unescape decimal numeric entities', () => {
    expect(unescapeHtml('&#65;')).toBe('A');
    expect(unescapeHtml('&#60;')).toBe('<');
    expect(unescapeHtml('&#169;')).toBe('©');
  });

  it('should handle mixed entities', () => {
    expect(unescapeHtml('&lt;a href=&quot;&#x2F;&quot;&gt;')).toBe('<a href="/">');
  });

  it('should leave unknown entities unchanged', () => {
    expect(unescapeHtml('&unknown;')).toBe('&unknown;');
  });
});

describe('unescapeUrl()', () => {
  it('should decode percent-encoded characters', () => {
    expect(unescapeUrl('hello%20world')).toBe('hello world');
    expect(unescapeUrl('a%3D1%26b%3D2')).toBe('a=1&b=2');
  });

  it('should decode unicode', () => {
    expect(unescapeUrl('caf%C3%A9')).toBe('café');
  });

  it('should return original on invalid encoding', () => {
    expect(unescapeUrl('%ZZ')).toBe('%ZZ');
    expect(unescapeUrl('%')).toBe('%');
  });
});

describe('unescapeJson()', () => {
  it('should unescape JSON strings', () => {
    expect(unescapeJson('hello\\nworld')).toBe('hello\nworld');
    expect(unescapeJson('tab\\there')).toBe('tab\there');
    expect(unescapeJson('quote\\"here')).toBe('quote"here');
  });

  it('should handle unicode escapes', () => {
    expect(unescapeJson('\\u0041')).toBe('A');
  });

  it('should return original on invalid JSON', () => {
    expect(unescapeJson('invalid\\')).toBe('invalid\\');
  });
});

// ============================================================================
// Utility Functions
// ============================================================================

describe('toString()', () => {
  it('should return empty string for null', () => {
    expect(toString(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(toString(undefined)).toBe('');
  });

  it('should return strings unchanged', () => {
    expect(toString('hello')).toBe('hello');
    expect(toString('')).toBe('');
  });

  it('should convert numbers', () => {
    expect(toString(42)).toBe('42');
    expect(toString(3.14)).toBe('3.14');
    expect(toString(-1)).toBe('-1');
    expect(toString(0)).toBe('0');
  });

  it('should convert booleans', () => {
    expect(toString(true)).toBe('true');
    expect(toString(false)).toBe('false');
  });

  it('should convert bigint', () => {
    expect(toString(BigInt(12345678901234567890n))).toBe('12345678901234567890');
  });

  it('should convert symbol with description', () => {
    expect(toString(Symbol('test'))).toBe('test');
  });

  it('should return empty string for symbol without description', () => {
    expect(toString(Symbol())).toBe('');
  });

  it('should convert Date to ISO string', () => {
    const date = new Date('2024-01-15T10:30:00.000Z');
    expect(toString(date)).toBe('2024-01-15T10:30:00.000Z');
  });

  it('should convert Error to message', () => {
    expect(toString(new Error('Something went wrong'))).toBe('Something went wrong');
  });

  it('should convert arrays by joining with comma', () => {
    expect(toString([1, 2, 3])).toBe('1,2,3');
    expect(toString(['a', 'b', 'c'])).toBe('a,b,c');
    expect(toString([])).toBe('');
  });

  it('should convert nested arrays', () => {
    expect(toString([1, [2, 3], 4])).toBe('1,2,3,4');
  });

  it('should use custom toString if not [object Object]', () => {
    const obj = {
      value: 42,
      toString() {
        return `Value: ${this.value}`;
      },
    };
    expect(toString(obj)).toBe('Value: 42');
  });

  it('should use JSON.stringify for plain objects', () => {
    expect(toString({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  it('should return [object] for circular objects', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(toString(obj)).toBe('[object]');
  });

  it('should use String() for other types', () => {
    // Functions - arrow functions stringify as "() => {}" not "function() {}"
    const fn = () => {};
    expect(toString(fn)).toContain('=>');

    // Regular function
    function regularFn() {}
    expect(toString(regularFn)).toContain('function');
  });
});

describe('isSafeString()', () => {
  describe('html format', () => {
    it('should return true for safe strings', () => {
      expect(isSafeString('hello', 'html')).toBe(true);
      expect(isSafeString('123', 'html')).toBe(true);
    });

    it('should return false for strings with unsafe characters', () => {
      expect(isSafeString('<script>', 'html')).toBe(false);
      expect(isSafeString('a & b', 'html')).toBe(false);
      expect(isSafeString('a > b', 'html')).toBe(false);
      expect(isSafeString('"quoted"', 'html')).toBe(false);
      expect(isSafeString("it's", 'html')).toBe(false);
    });
  });

  describe('xml format', () => {
    it('should return true for safe strings', () => {
      expect(isSafeString('hello', 'xml')).toBe(true);
    });

    it('should return false for strings with unsafe characters', () => {
      expect(isSafeString('<tag>', 'xml')).toBe(false);
      expect(isSafeString('a & b', 'xml')).toBe(false);
    });
  });

  describe('json format', () => {
    it('should return true for safe strings', () => {
      expect(isSafeString('hello', 'json')).toBe(true);
      expect(isSafeString('123', 'json')).toBe(true);
    });

    it('should return false for strings with unsafe characters', () => {
      expect(isSafeString('"quoted"', 'json')).toBe(false);
      expect(isSafeString('back\\slash', 'json')).toBe(false);
      expect(isSafeString('line\nbreak', 'json')).toBe(false);
      expect(isSafeString('return\rhere', 'json')).toBe(false);
      expect(isSafeString('a\tb', 'json')).toBe(false);
    });
  });

  describe('url format', () => {
    it('should return true for URL-safe characters', () => {
      expect(isSafeString('abc123', 'url')).toBe(true);
      expect(isSafeString('a-b_c.d~e', 'url')).toBe(true);
      expect(isSafeString('', 'url')).toBe(true);
    });

    it('should return false for non-URL-safe characters', () => {
      expect(isSafeString('hello world', 'url')).toBe(false);
      expect(isSafeString('a=1&b=2', 'url')).toBe(false);
      expect(isSafeString('path/to', 'url')).toBe(false);
    });
  });

  describe('csv format', () => {
    it('should return true for safe strings', () => {
      expect(isSafeString('hello', 'csv')).toBe(true);
      expect(isSafeString('123', 'csv')).toBe(true);
    });

    it('should return false for strings needing quoting', () => {
      expect(isSafeString('a,b', 'csv')).toBe(false);
      expect(isSafeString('"quoted"', 'csv')).toBe(false);
      expect(isSafeString('line\nbreak', 'csv')).toBe(false);
      expect(isSafeString('line\rreturn', 'csv')).toBe(false);
    });
  });

  describe('raw format', () => {
    it('should always return true', () => {
      expect(isSafeString('<script>', 'raw')).toBe(true);
      expect(isSafeString('anything', 'raw')).toBe(true);
    });
  });

  describe('unknown format', () => {
    it('should return true (defaults to raw)', () => {
      expect(isSafeString('anything', 'unknown' as any)).toBe(true);
    });
  });
});

describe('SafeString', () => {
  it('should store the value', () => {
    const safe = new SafeString('<b>bold</b>');
    expect(safe.toString()).toBe('<b>bold</b>');
  });

  it('should return value from toString()', () => {
    const safe = new SafeString('test');
    expect(safe.toString()).toBe('test');
    expect(String(safe)).toBe('test');
  });

  it('should return value from toHTML()', () => {
    const safe = new SafeString('<em>emphasis</em>');
    expect(safe.toHTML()).toBe('<em>emphasis</em>');
  });
});

describe('isSafeStringInstance()', () => {
  it('should return true for SafeString instances', () => {
    expect(isSafeStringInstance(new SafeString('test'))).toBe(true);
  });

  it('should return false for regular strings', () => {
    expect(isSafeStringInstance('test')).toBe(false);
  });

  it('should return false for other types', () => {
    expect(isSafeStringInstance(null)).toBe(false);
    expect(isSafeStringInstance(undefined)).toBe(false);
    expect(isSafeStringInstance(123)).toBe(false);
    expect(isSafeStringInstance({})).toBe(false);
    expect(isSafeStringInstance({ toString: () => 'test' })).toBe(false);
  });
});

describe('safe()', () => {
  it('should create a SafeString', () => {
    const result = safe('<b>test</b>');
    expect(result).toBeInstanceOf(SafeString);
    expect(result.toString()).toBe('<b>test</b>');
  });
});

// ============================================================================
// Validation Functions
// ============================================================================

describe('isValidJson()', () => {
  it('should return true for valid JSON', () => {
    expect(isValidJson('{}')).toBe(true);
    expect(isValidJson('[]')).toBe(true);
    expect(isValidJson('{"a":1}')).toBe(true);
    expect(isValidJson('[1,2,3]')).toBe(true);
    expect(isValidJson('"string"')).toBe(true);
    expect(isValidJson('123')).toBe(true);
    expect(isValidJson('true')).toBe(true);
    expect(isValidJson('null')).toBe(true);
  });

  it('should return false for invalid JSON', () => {
    expect(isValidJson('')).toBe(false);
    expect(isValidJson('{')).toBe(false);
    expect(isValidJson('{a:1}')).toBe(false);
    expect(isValidJson("{'a':1}")).toBe(false);
    expect(isValidJson('undefined')).toBe(false);
  });
});

describe('isValidXml()', () => {
  it('should return true for valid XML', () => {
    expect(isValidXml('<root>text</root>')).toBe(true);
    expect(isValidXml('<root><child>value</child></root>')).toBe(true);
    expect(isValidXml('<root attr="value">text</root>')).toBe(true);
    expect(isValidXml('<empty/>')).toBe(true);
  });

  it('should return false for unescaped > in text content', () => {
    // The regex captures text between > and <, excluding < from capture
    // So it can only detect > in text content, not <
    expect(isValidXml('<root>a > b</root>')).toBe(false);
    expect(isValidXml('<root>compare: 5>3</root>')).toBe(false);
  });

  it('should return true for escaped entities', () => {
    expect(isValidXml('<root>a &lt; b</root>')).toBe(true);
    expect(isValidXml('<root>a &gt; b</root>')).toBe(true);
  });

  it('should return true for empty string', () => {
    expect(isValidXml('')).toBe(true);
  });

  it('should return true for no text content', () => {
    expect(isValidXml('<root><child/></root>')).toBe(true);
  });

  it('should check text between closing and opening tags', () => {
    // The regex />([^<]*)</g captures text between > and <
    // So it checks if that captured text contains invalid chars
    expect(isValidXml('<a>ok</a><b>also ok</b>')).toBe(true);
  });
});

describe('isValidUrl()', () => {
  it('should return true for valid URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://localhost:3000')).toBe(true);
    expect(isValidUrl('https://example.com/path?query=value')).toBe(true);
    expect(isValidUrl('ftp://files.example.com')).toBe(true);
    expect(isValidUrl('file:///path/to/file')).toBe(true);
  });

  it('should return false for invalid URLs', () => {
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidUrl('example.com')).toBe(false); // missing protocol
    expect(isValidUrl('://missing.protocol')).toBe(false);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle consecutive special characters', () => {
    expect(escapeHtml('<<<>>>')).toBe('&lt;&lt;&lt;&gt;&gt;&gt;');
    expect(escapeJson('\\\\\\n\\n')).toBe('\\\\\\\\\\\\n\\\\n');
  });

  it('should handle empty strings', () => {
    expect(escapeHtml('')).toBe('');
    expect(escapeXml('')).toBe('');
    expect(escapeJson('')).toBe('');
    expect(escapeUrl('')).toBe('');
    expect(escapeCsv('')).toBe('');
    expect(escapeYaml('')).toBe('""');
  });

  it('should handle very long strings', () => {
    const longString = 'a'.repeat(10000);
    expect(escapeHtml(longString)).toBe(longString);
    expect(escapeJson(longString)).toBe(longString);
  });

  it('should handle unicode characters', () => {
    expect(escapeHtml('你好')).toBe('你好');
    expect(escapeJson('emoji 😀')).toBe('emoji 😀');
    expect(escapeUrl('café ☕')).toBe('caf%C3%A9%20%E2%98%95');
  });

  it('should handle mixed content', () => {
    const mixed = '<script>alert("xss & injection")</script>';
    expect(escapeHtml(mixed)).toBe(
      '&lt;script&gt;alert(&quot;xss &amp; injection&quot;)&lt;/script&gt;'
    );
  });
});

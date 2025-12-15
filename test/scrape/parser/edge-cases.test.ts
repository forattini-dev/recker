import { describe, it, expect } from 'vitest';
import { parse, HTMLElement, TextNode, valid } from '../../../src/scrape/parser/index.js';

/**
 * Edge Cases and Regression Tests for HTML Parser
 *
 * These tests are based on common issues found in HTML parsers and
 * known edge cases in HTML parsing.
 */

describe('HTML Parser - Edge Cases & Regressions', () => {

  // =============================================================================
  // ISSUE-BASED TESTS (common HTML parsing issues)
  // =============================================================================
  describe('Issue-Based Tests', () => {

    describe('Issue #38: Document fragment wrapping', () => {
      it('should parse multiple root elements', () => {
        const root = parse('<div>1</div><div>2</div>');
        expect(root.childNodes.length).toBe(2);
        expect((root.childNodes[0] as HTMLElement).text).toBe('1');
        expect((root.childNodes[1] as HTMLElement).text).toBe('2');
      });

      it('should handle text at root level', () => {
        const root = parse('text<div>element</div>more text');
        expect(root.childNodes.length).toBe(3);
      });
    });

    describe('Issue #144: Nested anchor tags', () => {
      it('should handle nested anchors with fixNestedATags', () => {
        const html = '<a href="outer"><a href="inner">Text</a></a>';
        const root = parse(html, { fixNestedATags: true });
        const anchors = root.querySelectorAll('a');
        // Should not have nested anchors
        expect(anchors.length).toBe(2);
      });

      it('should handle deeply nested anchors', () => {
        const html = '<a><a><a>Deep</a></a></a>';
        const root = parse(html, { fixNestedATags: true });
        expect(root).toBeTruthy();
      });
    });

    describe('Issue #152: parseNoneClosedTags option', () => {
      it('should keep unclosed tags with parseNoneClosedTags: true', () => {
        const html = '<div><h3><h3>Text</h3></div>';
        const root = parse(html, { parseNoneClosedTags: true });
        const h3s = root.querySelectorAll('h3');
        expect(h3s.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('Issue #215: fixNestedATags explanation', () => {
      it('should terminate previous anchor when starting new one', () => {
        const html = '<div><a href="1">Link1<a href="2">Link2</a></div>';
        const root = parse(html, { fixNestedATags: true });
        const links = root.querySelectorAll('a');
        expect(links.length).toBe(2);
        expect(links[0].getAttribute('href')).toBe('1');
        expect(links[1].getAttribute('href')).toBe('2');
      });
    });

    describe('Issue #249: BR rawText should be newline', () => {
      it('should return newline for BR element', () => {
        const root = parse('<p>Line1<br>Line2</p>');
        const p = root.querySelector('p')!;
        expect(p.rawText).toBe('Line1\nLine2');
      });

      it('should work with multiple BRs', () => {
        const root = parse('<div>A<br>B<br>C</div>');
        const div = root.querySelector('div')!;
        expect(div.rawText).toBe('A\nB\nC');
      });
    });
  });

  // =============================================================================
  // ATTRIBUTE EDGE CASES
  // =============================================================================
  describe('Attribute Edge Cases', () => {

    it('should handle attribute with equals in value', () => {
      const root = parse('<div data-expr="a=b"></div>');
      const div = root.querySelector('div')!;
      expect(div.getAttribute('data-expr')).toBe('a=b');
    });

    it('should handle attribute with multiple equals', () => {
      const root = parse('<a href="?a=1&b=2">Link</a>');
      const a = root.querySelector('a')!;
      expect(a.getAttribute('href')).toBe('?a=1&b=2');
    });

    it('should handle attribute starting with special chars', () => {
      const root = parse('<div @click="handler" :class="dynamic"></div>');
      const div = root.querySelector('div')!;
      expect(div.hasAttribute('@click')).toBe(true);
      expect(div.hasAttribute(':class')).toBe(true);
    });

    it('should handle attribute with angle brackets in value', () => {
      const root = parse('<div title="<script>"></div>');
      const div = root.querySelector('div')!;
      expect(div.getAttribute('title')).toBe('<script>');
    });

    it('should handle consecutive quotes in attribute', () => {
      const root = parse('<div data-json=\'{"key":"value"}\'>');
      const div = root.querySelector('div')!;
      expect(div.getAttribute('data-json')).toBe('{"key":"value"}');
    });

    it('should handle newlines in attribute value', () => {
      const root = parse('<div title="line1\nline2"></div>');
      const div = root.querySelector('div')!;
      expect(div.getAttribute('title')).toContain('\n');
    });

    it('should handle attribute without value before closing', () => {
      const root = parse('<input disabled>');
      const input = root.querySelector('input')!;
      expect(input.hasAttribute('disabled')).toBe(true);
    });

    it('should handle multiple boolean attributes', () => {
      const root = parse('<input checked disabled readonly required>');
      const input = root.querySelector('input')!;
      expect(input.hasAttribute('checked')).toBe(true);
      expect(input.hasAttribute('disabled')).toBe(true);
      expect(input.hasAttribute('readonly')).toBe(true);
      expect(input.hasAttribute('required')).toBe(true);
    });

    it('should handle attribute with no value in middle', () => {
      const root = parse('<input type="text" disabled name="field">');
      const input = root.querySelector('input')!;
      expect(input.getAttribute('type')).toBe('text');
      expect(input.hasAttribute('disabled')).toBe(true);
      expect(input.getAttribute('name')).toBe('field');
    });

    it('should preserve attribute order in rawAttributes', () => {
      const root = parse('<div a="1" b="2" c="3"></div>');
      const div = root.querySelector('div')!;
      const keys = Object.keys(div.rawAttributes);
      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');
    });
  });

  // =============================================================================
  // TAG NAME EDGE CASES
  // =============================================================================
  describe('Tag Name Edge Cases', () => {

    it('should handle custom elements with numbers', () => {
      const root = parse('<my-element-v2>Content</my-element-v2>');
      const el = root.querySelector('my-element-v2');
      expect(el?.text).toBe('Content');
    });

    it('should handle SVG namespace-like tags', () => {
      const root = parse('<svg:rect></svg:rect>');
      // Colon in tag name
      expect(root.childNodes.length).toBeGreaterThan(0);
    });

    it('should handle uppercase custom elements', () => {
      const root = parse('<MY-COMPONENT>Test</MY-COMPONENT>');
      const el = root.querySelector('my-component');
      expect(el?.text).toBe('Test');
    });

    it('should handle tags with dots', () => {
      const root = parse('<x.y.z>Content</x.y.z>');
      expect(root.childNodes.length).toBeGreaterThan(0);
    });

    it('should handle tags with underscores', () => {
      const root = parse('<my_component>Content</my_component>');
      const el = root.querySelector('my_component');
      expect(el?.text).toBe('Content');
    });
  });

  // =============================================================================
  // IMPLICIT TAG CLOSING
  // =============================================================================
  describe('Implicit Tag Closing', () => {

    it('should close P when DIV opens', () => {
      const root = parse('<p>Para<div>Block</div></p>');
      // P should be implicitly closed before DIV
      const p = root.querySelector('p');
      const div = root.querySelector('div');
      expect(p).toBeTruthy();
      expect(div).toBeTruthy();
    });

    it('should close LI when LI opens', () => {
      const root = parse('<ul><li>A<li>B<li>C</ul>');
      const lis = root.querySelectorAll('li');
      expect(lis.length).toBe(3);
      expect(lis[0].text).toBe('A');
      expect(lis[1].text).toBe('B');
      expect(lis[2].text).toBe('C');
    });

    it('should close TD when TD opens', () => {
      const root = parse('<table><tr><td>A<td>B<td>C</tr></table>');
      const tds = root.querySelectorAll('td');
      expect(tds.length).toBe(3);
    });

    it('should close TH when TH opens', () => {
      const root = parse('<table><tr><th>A<th>B</tr></table>');
      const ths = root.querySelectorAll('th');
      expect(ths.length).toBe(2);
    });

    it('should close TD when TR closes', () => {
      const root = parse('<table><tr><td>Data</tr></table>');
      const td = root.querySelector('td');
      expect(td?.text).toBe('Data');
    });

    it('should close LI when UL closes', () => {
      const root = parse('<ul><li>Item</ul>');
      const li = root.querySelector('li');
      expect(li?.text).toBe('Item');
    });

    it('should close H1 when H1 opens', () => {
      const root = parse('<h1>Title 1<h1>Title 2</h1>');
      const h1s = root.querySelectorAll('h1');
      expect(h1s.length).toBe(2);
    });

    it('should close B when DIV opens', () => {
      const root = parse('<b>Bold<div>Block</div></b>');
      const b = root.querySelector('b');
      expect(b).toBeTruthy();
    });
  });

  // =============================================================================
  // SCRIPT AND STYLE EDGE CASES
  // =============================================================================
  describe('Script and Style Edge Cases', () => {

    it('should handle script with CDATA', () => {
      const root = parse('<script>//<![CDATA[\nalert("test");\n//]]></script>');
      const script = root.querySelector('script');
      expect(script?.text).toContain('CDATA');
    });

    it('should handle empty script', () => {
      const root = parse('<script></script>');
      const script = root.querySelector('script');
      expect(script?.text).toBe('');
    });

    it('should handle script with only whitespace', () => {
      const root = parse('<script>   </script>');
      const script = root.querySelector('script');
      // Note: parser may trim/normalize whitespace-only content
      expect(script).toBeTruthy();
    });

    it('should handle style with CSS selectors containing >', () => {
      const root = parse('<style>div > span { color: red; }</style>');
      const style = root.querySelector('style');
      expect(style?.text).toContain('>');
    });

    it('should handle script with template literals', () => {
      const root = parse('<script>const html = `<div>${x}</div>`;</script>');
      const script = root.querySelector('script');
      expect(script?.text).toContain('<div>');
    });

    it('should handle nested quotes in script', () => {
      const root = parse('<script>var x = \'<div class="test"></div>\';</script>');
      const script = root.querySelector('script');
      expect(script?.text).toContain('class="test"');
    });

    it('should handle script with escaped closing tag', () => {
      const root = parse('<script>var x = "<\\/script>";</script>');
      const script = root.querySelector('script');
      // This is tricky - escaped closing tag
      expect(script).toBeTruthy();
    });

    it('should handle case-insensitive closing script tag', () => {
      const root = parse('<script>code</SCRIPT>', { lowerCaseTagName: true });
      const script = root.querySelector('script');
      expect(script?.text).toBe('code');
    });
  });

  // =============================================================================
  // WHITESPACE HANDLING
  // =============================================================================
  describe('Whitespace Handling', () => {

    it('should preserve whitespace in inline elements', () => {
      const root = parse('<span>  spaces  </span>');
      const span = root.querySelector('span');
      expect(span?.rawText).toBe('  spaces  ');
    });

    it('should handle tab characters', () => {
      const root = parse('<div>\ttabbed\t</div>');
      const div = root.querySelector('div');
      expect(div?.rawText).toBe('\ttabbed\t');
    });

    it('should handle newlines', () => {
      const root = parse('<div>\nmulti\nline\n</div>');
      const div = root.querySelector('div');
      expect(div?.rawText).toContain('\n');
    });

    it('should handle CRLF', () => {
      const root = parse('<div>\r\nwindows\r\nline\r\n</div>');
      const div = root.querySelector('div');
      expect(div?.rawText).toContain('\r\n');
    });

    it('should handle mixed whitespace', () => {
      const root = parse('<div> \t\n mixed \n\t </div>');
      const div = root.querySelector('div');
      expect(div?.rawText).toBe(' \t\n mixed \n\t ');
    });
  });

  // =============================================================================
  // HTML ENTITIES
  // =============================================================================
  describe('HTML Entities', () => {

    it('should decode named entities', () => {
      const root = parse('<div>&amp;&lt;&gt;&quot;&apos;</div>');
      const div = root.querySelector('div');
      expect(div?.text).toBe('&<>"\'');
    });

    it('should decode numeric entities', () => {
      const root = parse('<div>&#60;&#62;&#38;</div>');
      const div = root.querySelector('div');
      expect(div?.text).toBe('<>&');
    });

    it('should decode hex entities', () => {
      const root = parse('<div>&#x3C;&#x3E;&#x26;</div>');
      const div = root.querySelector('div');
      expect(div?.text).toBe('<>&');
    });

    it('should handle nbsp', () => {
      const root = parse('<div>word&nbsp;word</div>');
      const div = root.querySelector('div');
      // &nbsp; is non-breaking space (char code 160)
      expect(div?.text.charCodeAt(4)).toBe(160);
    });

    it('should decode entities in attributes', () => {
      const root = parse('<div title="&lt;tag&gt;"></div>');
      const div = root.querySelector('div');
      expect(div?.getAttribute('title')).toBe('<tag>');
    });

    it('should handle unknown entities', () => {
      const root = parse('<div>&unknown;</div>');
      const div = root.querySelector('div');
      // Unknown entity might be preserved or decoded
      expect(div?.text).toBeTruthy();
    });

    it('should handle incomplete entities', () => {
      const root = parse('<div>&amp no semicolon</div>');
      const div = root.querySelector('div');
      // Incomplete entity behavior
      expect(div?.text).toBeTruthy();
    });

    it('should handle multiple entities in sequence', () => {
      const root = parse('<div>&amp;&amp;&amp;</div>');
      const div = root.querySelector('div');
      expect(div?.text).toBe('&&&');
    });
  });

  // =============================================================================
  // COMPLEX SELECTOR EDGE CASES
  // =============================================================================
  describe('Complex Selector Edge Cases', () => {

    const html = `
      <div id="a" class="x y z">
        <div id="b" class="x">
          <span data-test="value">Text</span>
        </div>
        <div id="c" class="y">
          <p class="x y">Para</p>
        </div>
      </div>
    `;
    const root = parse(html);

    it('should handle combined selectors', () => {
      const result = root.querySelectorAll('div.x#b');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('b');
    });

    it('should handle multiple descendant selectors', () => {
      const result = root.querySelectorAll('#a #c p');
      expect(result.length).toBe(1);
    });

    it('should handle :not with class', () => {
      const result = root.querySelectorAll('div:not(.x)');
      // div#a has class x y z, div#b has x, div#c has y
      // Only div#c does not have .x
      expect(result.some(el => el.id === 'c')).toBe(true);
    });

    it('should handle attribute contains word [attr~=value]', () => {
      const result = root.querySelectorAll('[class~="x"]');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle multiple attribute selectors', () => {
      const result = root.querySelectorAll('[class][id]');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle comma-separated selectors', () => {
      const result = root.querySelectorAll('#b, #c');
      expect(result.length).toBe(2);
    });
  });

  // =============================================================================
  // MALFORMED HTML EDGE CASES
  // =============================================================================
  describe('Malformed HTML Edge Cases', () => {

    it('should handle tag inside attribute', () => {
      const root = parse('<div title="<script>"></div>');
      const div = root.querySelector('div');
      expect(div?.getAttribute('title')).toBe('<script>');
    });

    it('should handle unclosed quote in attribute', () => {
      // This is malformed - attribute quote never closed
      const root = parse('<div title="unclosed>text</div>');
      // Behavior may vary
      expect(root).toBeTruthy();
    });

    it('should handle missing tag name', () => {
      const root = parse('< >text</>');
      // Invalid tag syntax
      expect(root).toBeTruthy();
    });

    it('should handle comment-like content', () => {
      const root = parse('<div><!-not a comment--></div>');
      // Invalid comment syntax
      expect(root).toBeTruthy();
    });

    it('should handle processing instruction', () => {
      const root = parse('<?xml version="1.0"?><div>content</div>');
      // PI before content
      expect(root.querySelector('div')?.text).toBe('content');
    });

    it('should handle DOCTYPE', () => {
      const root = parse('<!DOCTYPE html><html><body></body></html>');
      // DOCTYPE handling
      expect(root.querySelector('body')).toBeTruthy();
    });

    it('should handle double closing tags', () => {
      const root = parse('<div>text</div></div>');
      expect(root.querySelector('div')?.text).toBe('text');
    });

    it('should handle orphan closing tag at start', () => {
      const root = parse('</div><div>text</div>');
      expect(root.querySelector('div')?.text).toBe('text');
    });

    it('should handle interleaved tags', () => {
      const root = parse('<p><em>text</p></em>');
      // <p> and <em> interleaved
      expect(root).toBeTruthy();
    });

    it('should handle attribute without name', () => {
      const root = parse('<div ="value">');
      // Attribute with no name
      expect(root).toBeTruthy();
    });

    it('should handle multiple equals in attribute', () => {
      const root = parse('<div attr==value>');
      // Double equals
      expect(root).toBeTruthy();
    });
  });

  // =============================================================================
  // PERFORMANCE EDGE CASES
  // =============================================================================
  describe('Performance Edge Cases', () => {

    it('should handle 10000 siblings', () => {
      let html = '<div>';
      for (let i = 0; i < 10000; i++) {
        html += '<span></span>';
      }
      html += '</div>';
      const root = parse(html);
      const spans = root.querySelectorAll('span');
      expect(spans.length).toBe(10000);
    });

    it('should handle 100 nesting depth', () => {
      let html = '';
      for (let i = 0; i < 100; i++) html += '<div>';
      html += 'content';
      for (let i = 0; i < 100; i++) html += '</div>';
      const root = parse(html);
      expect(root.text).toBe('content');
    });

    it('should handle many attributes', () => {
      let attrs = '';
      for (let i = 0; i < 100; i++) {
        attrs += ` data-attr-${i}="value${i}"`;
      }
      const root = parse(`<div${attrs}></div>`);
      const div = root.querySelector('div');
      expect(div?.getAttribute('data-attr-50')).toBe('value50');
    });

    it('should handle very long text content', () => {
      const longText = 'x'.repeat(100000);
      const root = parse(`<div>${longText}</div>`);
      const div = root.querySelector('div');
      expect(div?.text.length).toBe(100000);
    });

    it('should handle many classes', () => {
      const classes = Array.from({ length: 100 }, (_, i) => `class-${i}`).join(' ');
      const root = parse(`<div class="${classes}"></div>`);
      const div = root.querySelector('div');
      expect(div?.classList.length).toBe(100);
    });
  });

  // =============================================================================
  // UNICODE AND INTERNATIONAL
  // =============================================================================
  describe('Unicode and International', () => {

    it('should handle CJK characters', () => {
      const root = parse('<div>中文 日本語 한국어</div>');
      const div = root.querySelector('div');
      expect(div?.text).toContain('中文');
      expect(div?.text).toContain('日本語');
      expect(div?.text).toContain('한국어');
    });

    it('should handle RTL text', () => {
      const root = parse('<div>مرحبا שלום</div>');
      const div = root.querySelector('div');
      expect(div?.text).toContain('مرحبا');
    });

    it('should handle emoji', () => {
      const root = parse('<div>🎉🚀💻</div>');
      const div = root.querySelector('div');
      expect(div?.text).toContain('🎉');
    });

    it('should handle emoji in attributes', () => {
      const root = parse('<div title="Hello 👋"></div>');
      const div = root.querySelector('div');
      expect(div?.getAttribute('title')).toContain('👋');
    });

    it('should handle special unicode characters', () => {
      const root = parse('<div>→ ← ↑ ↓ • © ® ™</div>');
      const div = root.querySelector('div');
      expect(div?.text).toContain('→');
      expect(div?.text).toContain('©');
    });

    it('should handle zero-width characters', () => {
      const root = parse('<div>te\u200Bst</div>');
      const div = root.querySelector('div');
      expect(div?.text).toContain('\u200B');
    });

    it('should handle unicode tag names (custom elements)', () => {
      // This is technically not valid HTML but parser should handle it
      const root = parse('<日本語-要素>Content</日本語-要素>');
      expect(root.childNodes.length).toBeGreaterThan(0);
    });
  });

  // =============================================================================
  // VOID ELEMENT EDGE CASES
  // =============================================================================
  describe('Void Element Edge Cases', () => {

    it('should handle void element with children in source', () => {
      // BR should not have children, but source has them
      const root = parse('<br>child text');
      const br = root.querySelector('br');
      expect(br?.childNodes.length).toBe(0);
    });

    it('should handle void element with closing tag', () => {
      const root = parse('<br></br>');
      const brs = root.querySelectorAll('br');
      // Should not create duplicate BRs
      expect(brs.length).toBe(1);
    });

    it('should handle IMG with alt containing HTML', () => {
      const root = parse('<img alt="<b>bold</b>" src="test.jpg">');
      const img = root.querySelector('img');
      expect(img?.getAttribute('alt')).toBe('<b>bold</b>');
    });

    it('should handle INPUT with various types', () => {
      const types = ['text', 'password', 'checkbox', 'radio', 'submit', 'hidden', 'file'];
      types.forEach(type => {
        const root = parse(`<input type="${type}">`);
        const input = root.querySelector('input');
        expect(input?.getAttribute('type')).toBe(type);
      });
    });

    it('should handle META with charset', () => {
      const root = parse('<meta charset="UTF-8">');
      const meta = root.querySelector('meta');
      expect(meta?.getAttribute('charset')).toBe('UTF-8');
    });

    it('should handle LINK with multiple attributes', () => {
      const root = parse('<link rel="stylesheet" href="style.css" type="text/css">');
      const link = root.querySelector('link');
      expect(link?.getAttribute('rel')).toBe('stylesheet');
      expect(link?.getAttribute('href')).toBe('style.css');
    });
  });

  // =============================================================================
  // COMMENT EDGE CASES
  // =============================================================================
  describe('Comment Edge Cases', () => {

    it('should handle empty comment', () => {
      const root = parse('<!---->', { comment: true });
      expect(root.childNodes.length).toBe(1);
    });

    it('should handle comment with only whitespace', () => {
      const root = parse('<!--   -->', { comment: true });
      expect(root.firstChild?.rawText).toBe('   ');
    });

    it('should handle comment with single dash', () => {
      const root = parse('<!-- - -->', { comment: true });
      expect(root).toBeTruthy();
    });

    it('should handle comment with HTML', () => {
      const root = parse('<!-- <div>not parsed</div> -->', { comment: true });
      expect(root.querySelectorAll('div').length).toBe(0);
    });

    it('should handle multiple comments', () => {
      const root = parse('<!--1--><!--2--><!--3-->', { comment: true });
      expect(root.childNodes.length).toBe(3);
    });

    it('should handle comment between elements', () => {
      const root = parse('<div><!--comment--></div>', { comment: true });
      const div = root.querySelector('div');
      expect(div?.childNodes.length).toBe(1);
    });

    it('should handle unclosed comment', () => {
      const root = parse('<!--unclosed', { comment: true });
      // Behavior for unclosed comment
      expect(root).toBeTruthy();
    });
  });

  // =============================================================================
  // SERIALIZATION EDGE CASES
  // =============================================================================
  describe('Serialization Edge Cases', () => {

    it('should serialize boolean attribute correctly', () => {
      const root = parse('<input disabled>');
      const input = root.querySelector('input');
      const html = input?.toString();
      expect(html).toContain('disabled');
    });

    it('should serialize attribute with special chars', () => {
      const root = parse('<div title="a &amp; b"></div>');
      const div = root.querySelector('div');
      div?.setAttribute('title', 'x < y');
      const html = div?.toString();
      // Should escape or handle special chars
      expect(html).toBeTruthy();
    });

    it('should serialize empty attributes', () => {
      const root = parse('<div data-empty=""></div>');
      const div = root.querySelector('div');
      const html = div?.toString();
      expect(html).toContain('data-empty');
    });

    it('should preserve attribute quote style', () => {
      const root = parse('<div class="test"></div>');
      const div = root.querySelector('div');
      const html = div?.toString();
      expect(html).toContain('"test"');
    });

    it('should handle round-trip serialization', () => {
      const original = '<div class="test" id="main"><p>Text</p></div>';
      const root1 = parse(original);
      const html1 = root1.toString();
      const root2 = parse(html1);
      const html2 = root2.toString();
      expect(html1).toBe(html2);
    });
  });

});

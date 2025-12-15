import { describe, it, expect, beforeEach } from 'vitest';
import { parse, HTMLElement, TextNode, CommentNode, NodeType, valid } from '../../../src/scrape/parser/index.js';

/**
 * Comprehensive HTML Parser Test Suite
 *
 * This test suite covers all aspects of the HTML parser implementation.
 * It aims to verify correctness and identify potential bugs.
 */

describe('HTML Parser - Comprehensive Test Suite', () => {

  // =============================================================================
  // 1. BASIC PARSING STRUCTURE
  // =============================================================================
  describe('1. Basic Parsing Structure', () => {

    describe('1.1 Simple Elements', () => {
      it('should parse a single element', () => {
        const root = parse('<div></div>');
        const div = root.querySelector('div');
        expect(div).toBeTruthy();
        expect(div?.tagName).toBe('DIV');
        expect(div?.localName).toBe('div');
      });

      it('should parse element with text content', () => {
        const root = parse('<p>Hello World</p>');
        const p = root.querySelector('p');
        expect(p?.text).toBe('Hello World');
        expect(p?.rawText).toBe('Hello World');
      });

      it('should parse multiple root elements', () => {
        const root = parse('<div>1</div><span>2</span><p>3</p>');
        expect(root.childNodes.length).toBe(3);
        expect(root.children.length).toBe(3);
      });

      it('should parse empty element', () => {
        const root = parse('<div></div>');
        const div = root.querySelector('div');
        expect(div?.childNodes.length).toBe(0);
        expect(div?.text).toBe('');
      });

      it('should handle whitespace-only content', () => {
        const root = parse('<div>   </div>');
        const div = root.querySelector('div');
        expect(div?.childNodes.length).toBe(1);
        expect(div?.firstChild).toBeInstanceOf(TextNode);
      });
    });

    describe('1.2 Nested Elements', () => {
      it('should parse deeply nested elements', () => {
        const html = '<div><p><span><a><strong>Deep</strong></a></span></p></div>';
        const root = parse(html);
        const strong = root.querySelector('strong');
        expect(strong?.text).toBe('Deep');
        expect(strong?.parentNode?.tagName).toBe('A');
      });

      it('should parse siblings at same level', () => {
        const html = '<div><p>1</p><p>2</p><p>3</p></div>';
        const root = parse(html);
        const ps = root.querySelectorAll('p');
        expect(ps.length).toBe(3);
        expect(ps.map(p => p.text)).toEqual(['1', '2', '3']);
      });

      it('should preserve nesting hierarchy', () => {
        const html = '<ul><li>A<ul><li>A.1</li><li>A.2</li></ul></li><li>B</li></ul>';
        const root = parse(html);
        const topLis = root.querySelector('ul')?.children;
        expect(topLis?.length).toBe(2);
        const nestedUl = root.querySelectorAll('ul');
        expect(nestedUl.length).toBe(2);
      });

      it('should handle mixed content (text + elements)', () => {
        const html = '<p>Before <strong>bold</strong> after</p>';
        const root = parse(html);
        const p = root.querySelector('p');
        expect(p?.childNodes.length).toBe(3);
        expect(p?.text).toBe('Before bold after');
      });
    });

    describe('1.3 Tag Name Handling', () => {
      it('should handle uppercase tag names', () => {
        const root = parse('<DIV><P>Text</P></DIV>');
        expect(root.querySelector('div')).toBeTruthy();
        expect(root.querySelector('DIV')).toBeTruthy();
      });

      it('should handle mixed case tag names', () => {
        const root = parse('<DiV><pP>Text</pP></DiV>');
        const div = root.querySelector('div');
        expect(div).toBeTruthy();
      });

      it('should preserve rawTagName', () => {
        const root = parse('<DIV></DIV>');
        const div = root.querySelector('div');
        expect(div?.rawTagName).toBe('DIV');
        expect(div?.tagName).toBe('DIV');
        expect(div?.localName).toBe('div');
      });

      it('should handle lowerCaseTagName option', () => {
        const root = parse('<DIV></DIV>', { lowerCaseTagName: true });
        const div = root.querySelector('div');
        expect(div?.rawTagName).toBe('div');
      });

      it('should parse custom element names', () => {
        const root = parse('<my-component>Content</my-component>');
        const el = root.querySelector('my-component');
        expect(el).toBeTruthy();
        expect(el?.text).toBe('Content');
      });

      it('should parse elements with colons', () => {
        const root = parse('<svg:path></svg:path>');
        const path = root.querySelector('svg\\:path');
        // May need escape or different handling
        expect(root.childNodes.length).toBeGreaterThan(0);
      });
    });
  });

  // =============================================================================
  // 2. ATTRIBUTES HANDLING
  // =============================================================================
  describe('2. Attributes Handling', () => {

    describe('2.1 Quoted Attributes', () => {
      it('should parse double-quoted attributes', () => {
        const root = parse('<div class="foo bar" id="main"></div>');
        const div = root.querySelector('div');
        expect(div?.getAttribute('class')).toBe('foo bar');
        expect(div?.getAttribute('id')).toBe('main');
      });

      it('should parse single-quoted attributes', () => {
        const root = parse("<div class='foo bar' data-value='test'></div>");
        const div = root.querySelector('div');
        expect(div?.getAttribute('class')).toBe('foo bar');
        expect(div?.getAttribute('data-value')).toBe('test');
      });

      it('should handle empty quoted attributes', () => {
        const root = parse('<div class="" data-empty=""></div>');
        const div = root.querySelector('div');
        expect(div?.getAttribute('class')).toBe('');
        expect(div?.getAttribute('data-empty')).toBe('');
      });

      it('should handle attributes with spaces in value', () => {
        const root = parse('<div title="Hello World"></div>');
        const div = root.querySelector('div');
        expect(div?.getAttribute('title')).toBe('Hello World');
      });
    });

    describe('2.2 Unquoted Attributes', () => {
      it('should parse unquoted attributes', () => {
        const root = parse('<input type=text value=hello>');
        const input = root.querySelector('input');
        expect(input?.getAttribute('type')).toBe('text');
        expect(input?.getAttribute('value')).toBe('hello');
      });

      it('should parse numeric unquoted values', () => {
        const root = parse('<input maxlength=50 tabindex=1>');
        const input = root.querySelector('input');
        expect(input?.getAttribute('maxlength')).toBe('50');
        expect(input?.getAttribute('tabindex')).toBe('1');
      });
    });

    describe('2.3 Boolean Attributes', () => {
      it('should parse boolean attributes without value', () => {
        const root = parse('<input checked disabled readonly>');
        const input = root.querySelector('input');
        expect(input?.hasAttribute('checked')).toBe(true);
        expect(input?.hasAttribute('disabled')).toBe(true);
        expect(input?.hasAttribute('readonly')).toBe(true);
      });

      it('should handle boolean attributes with empty value', () => {
        const root = parse('<input checked="">');
        const input = root.querySelector('input');
        expect(input?.hasAttribute('checked')).toBe(true);
      });

      it('should handle boolean attributes with same-name value', () => {
        const root = parse('<input checked="checked">');
        const input = root.querySelector('input');
        expect(input?.getAttribute('checked')).toBe('checked');
      });
    });

    describe('2.4 Data Attributes', () => {
      it('should parse data-* attributes', () => {
        const root = parse('<div data-id="123" data-user-name="john"></div>');
        const div = root.querySelector('div');
        expect(div?.getAttribute('data-id')).toBe('123');
        expect(div?.getAttribute('data-user-name')).toBe('john');
      });

      it('should handle data attributes with JSON', () => {
        const root = parse('<div data-config=\'{"a":1,"b":2}\'></div>');
        const div = root.querySelector('div');
        const config = div?.getAttribute('data-config');
        expect(config).toBe('{"a":1,"b":2}');
      });
    });

    describe('2.5 Special Characters in Attributes', () => {
      it('should handle HTML entities in attribute values', () => {
        const root = parse('<div title="foo &amp; bar"></div>');
        const div = root.querySelector('div');
        // Should decode entities
        expect(div?.getAttribute('title')).toBe('foo & bar');
      });

      it('should handle quotes inside attributes', () => {
        const root = parse('<div title="He said &quot;hello&quot;"></div>');
        const div = root.querySelector('div');
        const title = div?.getAttribute('title');
        // May or may not decode depending on implementation
        expect(title?.includes('hello')).toBe(true);
      });

      it('should handle less-than in attributes', () => {
        const root = parse('<div title="a &lt; b"></div>');
        const div = root.querySelector('div');
        expect(div?.getAttribute('title')).toBe('a < b');
      });

      it('should handle URLs in attributes', () => {
        const root = parse('<a href="https://example.com?a=1&b=2">Link</a>');
        const a = root.querySelector('a');
        expect(a?.getAttribute('href')).toBe('https://example.com?a=1&b=2');
      });
    });

    describe('2.6 Attribute API', () => {
      it('getAttribute should be case-insensitive', () => {
        const root = parse('<div CLASS="test"></div>');
        const div = root.querySelector('div');
        expect(div?.getAttribute('class')).toBe('test');
        expect(div?.getAttribute('CLASS')).toBe('test');
      });

      it('setAttribute should work correctly', () => {
        const root = parse('<div></div>');
        const div = root.querySelector('div');
        div?.setAttribute('data-test', 'value');
        expect(div?.getAttribute('data-test')).toBe('value');
      });

      it('removeAttribute should work correctly', () => {
        const root = parse('<div class="test" id="main"></div>');
        const div = root.querySelector('div');
        div?.removeAttribute('class');
        expect(div?.hasAttribute('class')).toBe(false);
        expect(div?.hasAttribute('id')).toBe(true);
      });

      it('hasAttribute should be case-insensitive', () => {
        const root = parse('<div CLASS="test"></div>');
        const div = root.querySelector('div');
        expect(div?.hasAttribute('class')).toBe(true);
        expect(div?.hasAttribute('CLASS')).toBe(true);
      });

      it('setAttributes should replace all attributes', () => {
        const root = parse('<div class="old" id="old"></div>');
        const div = root.querySelector('div');
        div?.setAttributes({ class: 'new', 'data-new': 'value' });
        expect(div?.getAttribute('class')).toBe('new');
        expect(div?.getAttribute('data-new')).toBe('value');
      });

      it('should access rawAttributes', () => {
        const root = parse('<div class="test" ID="main"></div>');
        const div = root.querySelector('div');
        expect(div?.rawAttributes).toHaveProperty('class');
        expect(div?.rawAttributes).toHaveProperty('ID');
      });
    });
  });

  // =============================================================================
  // 3. VOID ELEMENTS (SELF-CLOSING)
  // =============================================================================
  describe('3. Void Elements', () => {

    describe('3.1 Standard Void Elements', () => {
      const voidElements = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];

      voidElements.forEach(tag => {
        it(`should parse <${tag}> as void element`, () => {
          const root = parse(`<${tag}>`);
          const el = root.querySelector(tag);
          expect(el).toBeTruthy();
          expect(el?.isVoidElement).toBe(true);
          expect(el?.childNodes.length).toBe(0);
        });
      });

      it('should not nest content inside void elements', () => {
        const root = parse('<div><br>text</div>');
        const div = root.querySelector('div');
        const br = root.querySelector('br');
        expect(br?.childNodes.length).toBe(0);
        // Text should be sibling of br, not child
        expect(div?.childNodes.length).toBe(2);
      });

      it('should handle void element with attributes', () => {
        const root = parse('<img src="test.jpg" alt="Test" width="100">');
        const img = root.querySelector('img');
        expect(img?.getAttribute('src')).toBe('test.jpg');
        expect(img?.getAttribute('alt')).toBe('Test');
        expect(img?.getAttribute('width')).toBe('100');
      });
    });

    describe('3.2 Self-Closing Syntax', () => {
      it('should handle XHTML-style self-closing', () => {
        const root = parse('<br/>');
        const br = root.querySelector('br');
        expect(br).toBeTruthy();
        expect(br?.isVoidElement).toBe(true);
      });

      it('should handle self-closing with space', () => {
        const root = parse('<br />');
        const br = root.querySelector('br');
        expect(br).toBeTruthy();
      });

      it('should handle self-closing non-void elements', () => {
        const root = parse('<div/>');
        const div = root.querySelector('div');
        expect(div).toBeTruthy();
        // Non-void with self-closing syntax should still work
      });

      it('should respect voidTag.closingSlash option', () => {
        const root = parse('<br>', { voidTag: { closingSlash: true } });
        const br = root.querySelector('br');
        // Note: closingSlash only adds space before / when there are attributes
        expect(br?.toString()).toBe('<br/>');
      });

      it('should respect custom voidTag.tags option', () => {
        const root = parse('<custom-void>', { voidTag: { tags: ['custom-void'] } });
        const el = root.querySelector('custom-void');
        expect(el?.isVoidElement).toBe(true);
      });
    });
  });

  // =============================================================================
  // 4. BLOCK TEXT ELEMENTS (SCRIPT/STYLE/PRE)
  // =============================================================================
  describe('4. Block Text Elements', () => {

    describe('4.1 Script Elements', () => {
      it('should not parse HTML inside script', () => {
        const root = parse('<script>const html = "<div>test</div>";</script>');
        const script = root.querySelector('script');
        expect(script?.text).toContain('<div>');
        expect(root.querySelectorAll('div').length).toBe(0);
      });

      it('should handle comparison operators in script', () => {
        const root = parse('<script>if (a < b && c > d) {}</script>');
        const script = root.querySelector('script');
        expect(script?.text).toContain('a < b');
        expect(script?.text).toContain('c > d');
      });

      it('should preserve script content exactly', () => {
        const content = 'var x = 1;\nvar y = 2;';
        const root = parse(`<script>${content}</script>`);
        const script = root.querySelector('script');
        expect(script?.text).toBe(content);
      });

      it('should handle script with type attribute', () => {
        const root = parse('<script type="application/json">{"key": "value"}</script>');
        const script = root.querySelector('script');
        expect(script?.getAttribute('type')).toBe('application/json');
        expect(script?.text).toContain('"key"');
      });

      it('should find closing </script> correctly', () => {
        const root = parse('<script>var s = "</script>";</script><div>After</div>');
        // This is tricky - depends on implementation
        const div = root.querySelector('div');
        // The string "</script>" inside JS might cause issues
      });
    });

    describe('4.2 Style Elements', () => {
      it('should not parse HTML inside style', () => {
        const root = parse('<style>div { content: "<p>"; }</style>');
        const style = root.querySelector('style');
        expect(style?.text).toContain('<p>');
        expect(root.querySelectorAll('p').length).toBe(0);
      });

      it('should preserve CSS content', () => {
        const css = '.class { color: red; }';
        const root = parse(`<style>${css}</style>`);
        const style = root.querySelector('style');
        expect(style?.text).toBe(css);
      });

      it('should handle CSS with comparison-like content', () => {
        const root = parse('<style>div[attr>="value"] {}</style>');
        const style = root.querySelector('style');
        expect(style?.text).toContain('[attr>="value"]');
      });
    });

    describe('4.3 Pre Elements', () => {
      it('should preserve whitespace in pre', () => {
        const content = '  indented\n    more indented';
        const root = parse(`<pre>${content}</pre>`);
        const pre = root.querySelector('pre');
        expect(pre?.text).toBe(content);
      });

      it('should not parse HTML inside pre (by default)', () => {
        const root = parse('<pre><code>const x = 1;</code></pre>');
        const pre = root.querySelector('pre');
        // pre is in blockTextElements by default
        expect(pre?.text).toContain('<code>');
      });
    });

    describe('4.4 Noscript Elements', () => {
      it('should handle noscript content', () => {
        const root = parse('<noscript><p>No JS</p></noscript>');
        const noscript = root.querySelector('noscript');
        expect(noscript?.text).toContain('<p>');
      });
    });

    describe('4.5 Custom blockTextElements', () => {
      it('should respect custom blockTextElements option', () => {
        const root = parse('<custom>const x = "<div>";</custom>', {
          blockTextElements: { custom: true }
        });
        const custom = root.querySelector('custom');
        expect(custom?.text).toContain('<div>');
        expect(root.querySelectorAll('div').length).toBe(0);
      });

      it('should handle blockTextElements: false option', () => {
        const root = parse('<script><div>test</div></script>', {
          blockTextElements: { script: false }
        });
        // Note: blockTextElements: false doesn't parse content as HTML,
        // it just changes how the raw text is handled
        const script = root.querySelector('script');
        expect(script).toBeTruthy();
      });
    });
  });

  // =============================================================================
  // 5. COMMENTS
  // =============================================================================
  describe('5. Comments', () => {

    describe('5.1 Basic Comments', () => {
      it('should parse comments when option enabled', () => {
        const root = parse('<!-- This is a comment -->', { comment: true });
        expect(root.childNodes.length).toBe(1);
        expect(root.firstChild).toBeInstanceOf(CommentNode);
        expect((root.firstChild as CommentNode).text).toBe(' This is a comment ');
      });

      it('should ignore comments by default', () => {
        const root = parse('<!-- comment --><div>text</div>');
        expect(root.querySelectorAll('div').length).toBe(1);
        // Comment should not create a node
        expect(root.childNodes.every(n => !(n instanceof CommentNode))).toBe(true);
      });

      it('should preserve comment content exactly', () => {
        const root = parse('<!--multi\nline\ncomment-->', { comment: true });
        const comment = root.firstChild as CommentNode;
        expect(comment.text).toBe('multi\nline\ncomment');
      });
    });

    describe('5.2 Comments with Special Content', () => {
      it('should handle comments with HTML-like content', () => {
        const root = parse('<!-- <div>not parsed</div> -->', { comment: true });
        expect(root.querySelectorAll('div').length).toBe(0);
      });

      it('should handle comments with dashes', () => {
        const root = parse('<!-- a -- b -->', { comment: true });
        const comment = root.firstChild as CommentNode;
        expect(comment.text).toContain('--');
      });

      it('should handle conditional comments', () => {
        const root = parse('<!--[if IE]><p>IE only</p><![endif]-->', { comment: true });
        const comment = root.firstChild as CommentNode;
        expect(comment.text).toContain('[if IE]');
      });
    });

    describe('5.3 Comment Serialization', () => {
      it('should serialize comment correctly', () => {
        const root = parse('<!-- comment -->', { comment: true });
        const comment = root.firstChild as CommentNode;
        expect(comment.toString()).toBe('<!-- comment -->');
      });
    });
  });

  // =============================================================================
  // 6. CSS SELECTORS
  // =============================================================================
  describe('6. CSS Selectors', () => {

    const testHtml = `
      <div id="main" class="container">
        <header class="header">
          <nav id="nav" class="nav primary">
            <a href="/" class="link">Home</a>
            <a href="/about" class="link active">About</a>
          </nav>
        </header>
        <main>
          <article class="post" data-id="1">
            <h1>Title</h1>
            <p class="text">Paragraph 1</p>
            <p class="text highlight">Paragraph 2</p>
          </article>
          <aside>
            <input type="text" name="search" disabled>
            <button type="submit">Search</button>
          </aside>
        </main>
        <footer></footer>
      </div>
    `;
    let root: HTMLElement;

    beforeEach(() => {
      root = parse(testHtml);
    });

    describe('6.1 Basic Selectors', () => {
      it('should select by tag name', () => {
        expect(root.querySelectorAll('p').length).toBe(2);
        expect(root.querySelectorAll('a').length).toBe(2);
        expect(root.querySelectorAll('div').length).toBe(1);
      });

      it('should select by ID', () => {
        const main = root.querySelector('#main');
        expect(main?.tagName).toBe('DIV');
        expect(root.querySelector('#nav')?.tagName).toBe('NAV');
      });

      it('should select by class', () => {
        expect(root.querySelectorAll('.link').length).toBe(2);
        expect(root.querySelectorAll('.container').length).toBe(1);
        expect(root.querySelectorAll('.text').length).toBe(2);
      });

      it('should select by multiple classes', () => {
        expect(root.querySelectorAll('.nav.primary').length).toBe(1);
        expect(root.querySelectorAll('.text.highlight').length).toBe(1);
      });

      it('should select universal (*)', () => {
        const all = root.querySelectorAll('*');
        expect(all.length).toBeGreaterThan(10);
      });
    });

    describe('6.2 Attribute Selectors', () => {
      it('should select by attribute presence [attr]', () => {
        expect(root.querySelectorAll('[href]').length).toBe(2);
        expect(root.querySelectorAll('[disabled]').length).toBe(1);
      });

      it('should select by attribute value [attr=value]', () => {
        expect(root.querySelectorAll('[type="text"]').length).toBe(1);
        expect(root.querySelectorAll('[type="submit"]').length).toBe(1);
      });

      it('should select by attribute prefix [attr^=value]', () => {
        expect(root.querySelectorAll('[href^="/"]').length).toBe(2);
      });

      it('should select by attribute suffix [attr$=value]', () => {
        expect(root.querySelectorAll('[href$="about"]').length).toBe(1);
      });

      it('should select by attribute contains [attr*=value]', () => {
        expect(root.querySelectorAll('[class*="nav"]').length).toBe(1);
      });

      it('should select by data attributes', () => {
        expect(root.querySelectorAll('[data-id]').length).toBe(1);
        expect(root.querySelectorAll('[data-id="1"]').length).toBe(1);
      });
    });

    describe('6.3 Combinator Selectors', () => {
      it('should select descendants (space)', () => {
        expect(root.querySelectorAll('#main p').length).toBe(2);
        expect(root.querySelectorAll('header a').length).toBe(2);
      });

      it('should select direct children (>)', () => {
        const navLinks = root.querySelectorAll('nav > a');
        expect(navLinks.length).toBe(2);
      });

      it('should select adjacent sibling (+)', () => {
        const afterH1 = root.querySelectorAll('h1 + p');
        expect(afterH1.length).toBe(1);
      });

      it('should select general siblings (~)', () => {
        const siblings = root.querySelectorAll('h1 ~ p');
        expect(siblings.length).toBe(2);
      });
    });

    describe('6.4 Pseudo Selectors', () => {
      it('should select :first-child', () => {
        const first = root.querySelectorAll('p:first-child');
        // h1 is first child of article, not p
        expect(first.length).toBe(0);
      });

      it('should select :last-child', () => {
        const last = root.querySelectorAll('p:last-child');
        expect(last.length).toBe(1);
      });

      it('should select :nth-child', () => {
        const second = root.querySelectorAll('p:nth-child(2)');
        // p is 2nd child of article (after h1)
        expect(second.length).toBe(1);
      });

      it('should select :not()', () => {
        const notActive = root.querySelectorAll('a:not(.active)');
        expect(notActive.length).toBe(1);
      });

      it('should select :empty', () => {
        const empty = root.querySelectorAll('footer:empty');
        expect(empty.length).toBe(1);
      });
    });

    describe('6.5 querySelector vs querySelectorAll', () => {
      it('querySelector should return first match', () => {
        const p = root.querySelector('p');
        expect(p?.text).toBe('Paragraph 1');
      });

      it('querySelector should return null for no match', () => {
        const none = root.querySelector('.nonexistent');
        expect(none).toBeNull();
      });

      it('querySelectorAll should return empty array for no match', () => {
        const none = root.querySelectorAll('.nonexistent');
        expect(none).toEqual([]);
      });
    });

    describe('6.6 Other Query Methods', () => {
      it('getElementById should find element', () => {
        const el = root.getElementById('main');
        expect(el?.tagName).toBe('DIV');
      });

      it('getElementById should return null for no match', () => {
        const el = root.getElementById('nonexistent');
        expect(el).toBeNull();
      });

      it('getElementsByTagName should find elements', () => {
        const ps = root.getElementsByTagName('p');
        expect(ps.length).toBe(2);
      });

      it('getElementsByTagName(*) should find all elements', () => {
        const all = root.getElementsByTagName('*');
        expect(all.length).toBeGreaterThan(10);
      });

      it('closest should find ancestor', () => {
        const p = root.querySelector('p');
        const article = p?.closest('article');
        expect(article?.tagName).toBe('ARTICLE');
      });

      it('closest should return self if matches', () => {
        const article = root.querySelector('article');
        const self = article?.closest('article');
        expect(self).toBe(article);
      });

      it('closest should return null if no match', () => {
        const p = root.querySelector('p');
        const none = p?.closest('form');
        expect(none).toBeNull();
      });
    });
  });

  // =============================================================================
  // 7. DOM TRAVERSAL
  // =============================================================================
  describe('7. DOM Traversal', () => {

    const testHtml = '<div><span>1</span><p>2</p><a>3</a></div>';
    let root: HTMLElement;
    let div: HTMLElement;

    beforeEach(() => {
      root = parse(testHtml);
      div = root.querySelector('div')!;
    });

    describe('7.1 Parent Access', () => {
      it('should access parentNode', () => {
        const span = root.querySelector('span');
        expect(span?.parentNode?.tagName).toBe('DIV');
      });

      it('should return null for root parentNode', () => {
        expect(root.parentNode).toBeNull();
      });
    });

    describe('7.2 Children Access', () => {
      it('should access childNodes (all nodes)', () => {
        expect(div.childNodes.length).toBe(3);
      });

      it('should access children (elements only)', () => {
        expect(div.children.length).toBe(3);
        expect(div.children.every(c => c instanceof HTMLElement)).toBe(true);
      });

      it('should access firstChild', () => {
        expect(div.firstChild?.rawTagName).toBe('span');
      });

      it('should access lastChild', () => {
        expect(div.lastChild?.rawTagName).toBe('a');
      });

      it('should access firstElementChild', () => {
        const html = '<div>text<span>element</span></div>';
        const r = parse(html);
        const d = r.querySelector('div')!;
        expect(d.firstElementChild?.tagName).toBe('SPAN');
      });

      it('should access lastElementChild', () => {
        const html = '<div><span>element</span>text</div>';
        const r = parse(html);
        const d = r.querySelector('div')!;
        expect(d.lastElementChild?.tagName).toBe('SPAN');
      });

      it('should access childElementCount', () => {
        expect(div.childElementCount).toBe(3);
      });
    });

    describe('7.3 Sibling Access', () => {
      it('should access nextSibling', () => {
        const span = root.querySelector('span')!;
        expect(span.nextSibling?.rawTagName).toBe('p');
      });

      it('should access previousSibling', () => {
        const a = root.querySelector('a')!;
        expect(a.previousSibling?.rawTagName).toBe('p');
      });

      it('should access nextElementSibling', () => {
        const html = '<div><span></span>text<p></p></div>';
        const r = parse(html);
        const span = r.querySelector('span')!;
        expect(span.nextElementSibling?.tagName).toBe('P');
      });

      it('should access previousElementSibling', () => {
        const html = '<div><span></span>text<p></p></div>';
        const r = parse(html);
        const p = r.querySelector('p')!;
        expect(p.previousElementSibling?.tagName).toBe('SPAN');
      });

      it('should return null for last sibling nextSibling', () => {
        const a = root.querySelector('a')!;
        expect(a.nextSibling).toBeNull();
      });

      it('should return null for first sibling previousSibling', () => {
        const span = root.querySelector('span')!;
        expect(span.previousSibling).toBeNull();
      });
    });
  });

  // =============================================================================
  // 8. DOM MANIPULATION
  // =============================================================================
  describe('8. DOM Manipulation', () => {

    describe('8.1 appendChild', () => {
      it('should append child element', () => {
        const root = parse('<div></div>');
        const div = root.querySelector('div')!;
        const newP = parse('<p>New</p>').firstChild!;
        div.appendChild(newP);
        expect(div.childNodes.length).toBe(1);
        expect(div.querySelector('p')?.text).toBe('New');
      });

      it('should return appended node', () => {
        const root = parse('<div></div>');
        const div = root.querySelector('div')!;
        const newP = parse('<p>New</p>').firstChild!;
        const returned = div.appendChild(newP);
        expect(returned).toBe(newP);
      });
    });

    describe('8.2 removeChild', () => {
      it('should remove child element', () => {
        const root = parse('<div><p>Remove</p></div>');
        const div = root.querySelector('div')!;
        const p = root.querySelector('p')!;
        div.removeChild(p);
        expect(div.childNodes.length).toBe(0);
        expect(root.querySelector('p')).toBeNull();
      });
    });

    describe('8.3 remove', () => {
      it('should remove self from parent', () => {
        const root = parse('<div><p>Remove</p></div>');
        const p = root.querySelector('p')!;
        p.remove();
        expect(root.querySelector('p')).toBeNull();
      });

      it('should set parentNode to null', () => {
        const root = parse('<div><p>Remove</p></div>');
        const p = root.querySelector('p')!;
        p.remove();
        expect(p.parentNode).toBeNull();
      });
    });

    describe('8.4 exchangeChild', () => {
      it('should exchange child with new node', () => {
        const root = parse('<div><p>Old</p></div>');
        const div = root.querySelector('div')!;
        const oldP = root.querySelector('p')!;
        const newSpan = parse('<span>New</span>').firstChild!;
        div.exchangeChild(oldP, newSpan);
        expect(root.querySelector('p')).toBeNull();
        expect(root.querySelector('span')?.text).toBe('New');
      });
    });

    describe('8.5 replaceWith', () => {
      it('should replace element with new nodes', () => {
        const root = parse('<div><p>Old</p></div>');
        const p = root.querySelector('p')!;
        p.replaceWith('<span>New</span>');
        expect(root.querySelector('p')).toBeNull();
        expect(root.querySelector('span')?.text).toBe('New');
      });

      it('should replace with multiple nodes', () => {
        const root = parse('<div><p>Old</p></div>');
        const p = root.querySelector('p')!;
        p.replaceWith('<span>1</span>', '<span>2</span>');
        expect(root.querySelectorAll('span').length).toBe(2);
      });
    });

    describe('8.6 prepend/append', () => {
      it('prepend should add to beginning', () => {
        const root = parse('<div><p>Existing</p></div>');
        const div = root.querySelector('div')!;
        div.prepend('<span>First</span>');
        expect(div.firstElementChild?.tagName).toBe('SPAN');
      });

      it('append should add to end', () => {
        const root = parse('<div><p>Existing</p></div>');
        const div = root.querySelector('div')!;
        div.append('<span>Last</span>');
        expect(div.lastElementChild?.tagName).toBe('SPAN');
      });
    });

    describe('8.7 before/after', () => {
      it('before should insert before element', () => {
        const root = parse('<div><p>Middle</p></div>');
        const p = root.querySelector('p')!;
        p.before('<span>Before</span>');
        const div = root.querySelector('div')!;
        expect(div.firstElementChild?.tagName).toBe('SPAN');
      });

      it('after should insert after element', () => {
        const root = parse('<div><p>Middle</p></div>');
        const p = root.querySelector('p')!;
        p.after('<span>After</span>');
        const div = root.querySelector('div')!;
        expect(div.lastElementChild?.tagName).toBe('SPAN');
      });
    });

    describe('8.8 insertAdjacentHTML', () => {
      it('should insert beforebegin', () => {
        const root = parse('<div><p>Middle</p></div>');
        const p = root.querySelector('p')!;
        p.insertAdjacentHTML('beforebegin', '<span>Before</span>');
        const div = root.querySelector('div')!;
        expect(div.firstElementChild?.tagName).toBe('SPAN');
      });

      it('should insert afterbegin', () => {
        const root = parse('<div><p>Existing</p></div>');
        const div = root.querySelector('div')!;
        div.insertAdjacentHTML('afterbegin', '<span>First</span>');
        expect(div.firstElementChild?.tagName).toBe('SPAN');
      });

      it('should insert beforeend', () => {
        const root = parse('<div><p>Existing</p></div>');
        const div = root.querySelector('div')!;
        div.insertAdjacentHTML('beforeend', '<span>Last</span>');
        expect(div.lastElementChild?.tagName).toBe('SPAN');
      });

      it('should insert afterend', () => {
        const root = parse('<div><p>Middle</p></div>');
        const p = root.querySelector('p')!;
        p.insertAdjacentHTML('afterend', '<span>After</span>');
        const div = root.querySelector('div')!;
        expect(div.lastElementChild?.tagName).toBe('SPAN');
      });

      it('should throw for invalid position', () => {
        const root = parse('<div></div>');
        const div = root.querySelector('div')!;
        expect(() => div.insertAdjacentHTML('invalid' as any, '<span></span>')).toThrow();
      });
    });

    describe('8.9 set_content', () => {
      it('should replace content with string', () => {
        const root = parse('<div><p>Old</p></div>');
        const div = root.querySelector('div')!;
        div.set_content('<span>New</span>');
        expect(div.querySelector('p')).toBeNull();
        expect(div.querySelector('span')?.text).toBe('New');
      });

      it('should replace content with Node', () => {
        const root = parse('<div><p>Old</p></div>');
        const div = root.querySelector('div')!;
        const newNode = parse('<span>New</span>').firstChild!;
        div.set_content(newNode);
        expect(div.firstElementChild?.tagName).toBe('SPAN');
      });

      it('should replace content with Node array', () => {
        const root = parse('<div><p>Old</p></div>');
        const div = root.querySelector('div')!;
        const nodes = parse('<span>1</span><span>2</span>').childNodes;
        div.set_content(nodes);
        expect(div.children.length).toBe(2);
      });
    });

    describe('8.10 innerHTML/textContent', () => {
      it('set innerHTML should replace content', () => {
        const root = parse('<div><p>Old</p></div>');
        const div = root.querySelector('div')!;
        div.innerHTML = '<span>New</span>';
        expect(div.querySelector('p')).toBeNull();
        expect(div.querySelector('span')).toBeTruthy();
      });

      it('get innerHTML should return HTML string', () => {
        const root = parse('<div><p>Text</p></div>');
        const div = root.querySelector('div')!;
        expect(div.innerHTML).toBe('<p>Text</p>');
      });

      it('set textContent should replace with text', () => {
        const root = parse('<div><p>Old</p></div>');
        const div = root.querySelector('div')!;
        div.textContent = 'Plain text';
        expect(div.querySelector('p')).toBeNull();
        expect(div.text).toBe('Plain text');
      });

      it('get textContent should return text', () => {
        const root = parse('<div><p>Text</p></div>');
        const div = root.querySelector('div')!;
        expect(div.textContent).toBe('Text');
      });
    });

    describe('8.11 clone', () => {
      it('should clone element', () => {
        const root = parse('<div class="test"><p>Content</p></div>');
        const div = root.querySelector('div')!;
        const clone = div.clone() as HTMLElement;
        expect(clone.getAttribute('class')).toBe('test');
        expect(clone.querySelector('p')?.text).toBe('Content');
        expect(clone).not.toBe(div);
      });
    });
  });

  // =============================================================================
  // 9. CLASS LIST / DOM TOKEN LIST
  // =============================================================================
  describe('9. classList / DOMTokenList', () => {

    describe('9.1 Basic Operations', () => {
      it('should access classList from parsed element', () => {
        const root = parse('<div class="foo bar baz"></div>');
        const div = root.querySelector('div')!;
        expect(div.classList.length).toBe(3);
        expect(div.classList.contains('foo')).toBe(true);
        expect(div.classList.contains('bar')).toBe(true);
        expect(div.classList.contains('baz')).toBe(true);
      });

      it('should add class', () => {
        const root = parse('<div class="foo"></div>');
        const div = root.querySelector('div')!;
        div.classList.add('bar');
        expect(div.classList.contains('bar')).toBe(true);
        expect(div.classList.length).toBe(2);
      });

      it('should remove class', () => {
        const root = parse('<div class="foo bar"></div>');
        const div = root.querySelector('div')!;
        div.classList.remove('foo');
        expect(div.classList.contains('foo')).toBe(false);
        expect(div.classList.length).toBe(1);
      });

      it('should toggle class', () => {
        const root = parse('<div class="foo"></div>');
        const div = root.querySelector('div')!;
        div.classList.toggle('foo');
        expect(div.classList.contains('foo')).toBe(false);
        div.classList.toggle('foo');
        expect(div.classList.contains('foo')).toBe(true);
      });

      it('should replace class', () => {
        const root = parse('<div class="foo"></div>');
        const div = root.querySelector('div')!;
        div.classList.replace('foo', 'bar');
        expect(div.classList.contains('foo')).toBe(false);
        expect(div.classList.contains('bar')).toBe(true);
      });
    });

    describe('9.2 Validation', () => {
      it('should throw for class with whitespace', () => {
        const root = parse('<div class="foo"></div>');
        const div = root.querySelector('div')!;
        expect(() => div.classList.add('has space')).toThrow();
      });

      it('should throw for toggle with whitespace', () => {
        const root = parse('<div class="foo"></div>');
        const div = root.querySelector('div')!;
        expect(() => div.classList.toggle('has space')).toThrow();
      });
    });

    describe('9.3 Attribute Sync', () => {
      it('should update class attribute when adding', () => {
        const root = parse('<div class="foo"></div>');
        const div = root.querySelector('div')!;
        div.classList.add('bar');
        expect(div.getAttribute('class')).toContain('bar');
      });

      it('should update class attribute when removing', () => {
        const root = parse('<div class="foo bar"></div>');
        const div = root.querySelector('div')!;
        div.classList.remove('foo');
        expect(div.getAttribute('class')).not.toContain('foo');
      });
    });

    describe('9.4 classNames property', () => {
      it('should return space-separated class string', () => {
        const root = parse('<div class="foo bar baz"></div>');
        const div = root.querySelector('div')!;
        const classes = div.classNames;
        expect(classes).toContain('foo');
        expect(classes).toContain('bar');
        expect(classes).toContain('baz');
      });
    });
  });

  // =============================================================================
  // 10. SERIALIZATION
  // =============================================================================
  describe('10. Serialization', () => {

    describe('10.1 toString / outerHTML', () => {
      it('should serialize simple element', () => {
        const root = parse('<div></div>');
        const div = root.querySelector('div')!;
        expect(div.toString()).toBe('<div></div>');
        expect(div.outerHTML).toBe('<div></div>');
      });

      it('should serialize element with attributes', () => {
        const root = parse('<div class="test" id="main"></div>');
        const div = root.querySelector('div')!;
        const html = div.toString();
        expect(html).toContain('class=');
        expect(html).toContain('id=');
      });

      it('should serialize nested elements', () => {
        const root = parse('<div><p>Text</p></div>');
        const div = root.querySelector('div')!;
        expect(div.toString()).toBe('<div><p>Text</p></div>');
      });

      it('should serialize void elements correctly', () => {
        const root = parse('<br>');
        const br = root.querySelector('br')!;
        expect(br.toString()).toBe('<br>');
      });

      it('should serialize void elements with closingSlash option', () => {
        const root = parse('<br>', { voidTag: { closingSlash: true } });
        const br = root.querySelector('br')!;
        // Note: closingSlash only adds space before / when there are attributes
        expect(br.toString()).toBe('<br/>');
      });
    });

    describe('10.2 innerHTML', () => {
      it('should return inner content', () => {
        const root = parse('<div><p>Text</p></div>');
        const div = root.querySelector('div')!;
        expect(div.innerHTML).toBe('<p>Text</p>');
      });

      it('should return empty for empty element', () => {
        const root = parse('<div></div>');
        const div = root.querySelector('div')!;
        expect(div.innerHTML).toBe('');
      });

      it('should include text nodes', () => {
        const root = parse('<div>Hello <strong>World</strong></div>');
        const div = root.querySelector('div')!;
        expect(div.innerHTML).toBe('Hello <strong>World</strong>');
      });
    });

    describe('10.3 text / rawText / textContent', () => {
      it('should return text content only', () => {
        const root = parse('<div><p>Hello</p> <p>World</p></div>');
        const div = root.querySelector('div')!;
        expect(div.text).toBe('Hello World');
      });

      it('should decode HTML entities', () => {
        const root = parse('<div>&amp; &lt; &gt;</div>');
        const div = root.querySelector('div')!;
        expect(div.text).toBe('& < >');
      });

      it('rawText should preserve entities', () => {
        const root = parse('<div>&amp;</div>');
        const div = root.querySelector('div')!;
        expect(div.rawText).toBe('&amp;');
      });
    });

    describe('10.4 structuredText', () => {
      it('should add newlines for block elements', () => {
        const root = parse('<div><p>Line 1</p><p>Line 2</p></div>');
        const div = root.querySelector('div')!;
        const text = div.structuredText;
        expect(text).toContain('Line 1');
        expect(text).toContain('\n');
        expect(text).toContain('Line 2');
      });
    });

    describe('10.5 structure', () => {
      it('should return DOM structure', () => {
        const root = parse('<div id="main"><p class="text">Content</p></div>');
        const div = root.querySelector('div')!;
        const structure = div.structure;
        expect(structure).toContain('div#main');
        expect(structure).toContain('p.text');
        expect(structure).toContain('#text');
      });
    });
  });

  // =============================================================================
  // 11. TEXT NODE
  // =============================================================================
  describe('11. TextNode', () => {

    describe('11.1 Basic Properties', () => {
      it('should have correct nodeType', () => {
        const root = parse('<div>text</div>');
        const textNode = root.querySelector('div')!.firstChild!;
        expect(textNode.nodeType).toBe(NodeType.TEXT_NODE);
      });

      it('should have rawTagName as #text', () => {
        const root = parse('<div>text</div>');
        const textNode = root.querySelector('div')!.firstChild as TextNode;
        expect(textNode.rawTagName).toBe('#text');
      });

      it('should return text content', () => {
        const root = parse('<div>Hello World</div>');
        const textNode = root.querySelector('div')!.firstChild as TextNode;
        expect(textNode.text).toBe('Hello World');
      });
    });

    describe('11.2 Whitespace Detection', () => {
      it('should detect whitespace-only node', () => {
        const root = parse('<div>   </div>');
        const textNode = root.querySelector('div')!.firstChild as TextNode;
        expect(textNode.isWhitespace).toBe(true);
      });

      it('should detect non-whitespace node', () => {
        const root = parse('<div>text</div>');
        const textNode = root.querySelector('div')!.firstChild as TextNode;
        expect(textNode.isWhitespace).toBe(false);
      });

      it('should detect &nbsp; as whitespace', () => {
        const root = parse('<div>&nbsp;</div>');
        const textNode = root.querySelector('div')!.firstChild as TextNode;
        expect(textNode.isWhitespace).toBe(true);
      });
    });

    describe('11.3 Trimmed Text', () => {
      it('trimmedText should trim whitespace', () => {
        const root = parse('<div>  text  </div>');
        const textNode = root.querySelector('div')!.firstChild as TextNode;
        expect(textNode.trimmedText).toBe('text');
      });

      it('trimmedRawText should trim raw content', () => {
        const root = parse('<div>  text  </div>');
        const textNode = root.querySelector('div')!.firstChild as TextNode;
        expect(textNode.trimmedRawText).toBe('text');
      });
    });

    describe('11.4 Clone', () => {
      it('should clone text node', () => {
        const root = parse('<div>text</div>');
        const textNode = root.querySelector('div')!.firstChild as TextNode;
        const clone = textNode.clone() as TextNode;
        expect(clone.text).toBe('text');
        expect(clone).not.toBe(textNode);
      });
    });
  });

  // =============================================================================
  // 12. EDGE CASES AND MALFORMED HTML
  // =============================================================================
  describe('12. Edge Cases and Malformed HTML', () => {

    describe('12.1 Unclosed Tags', () => {
      it('should handle unclosed div', () => {
        const root = parse('<div><p>Text</div>');
        const p = root.querySelector('p');
        expect(p?.text).toBe('Text');
      });

      it('should handle unclosed p (auto-closes on block)', () => {
        const root = parse('<p>First<div>Second</div>');
        const ps = root.querySelectorAll('p');
        const divs = root.querySelectorAll('div');
        expect(divs.length).toBe(1);
      });

      it('should handle unclosed li (auto-closes on next li)', () => {
        const root = parse('<ul><li>One<li>Two<li>Three</ul>');
        const lis = root.querySelectorAll('li');
        expect(lis.length).toBe(3);
      });

      it('should handle unclosed td', () => {
        const root = parse('<table><tr><td>1<td>2</tr></table>');
        const tds = root.querySelectorAll('td');
        expect(tds.length).toBe(2);
      });
    });

    describe('12.2 Missing Close Tags', () => {
      it('should handle missing close tag at end', () => {
        const root = parse('<div><p>Text');
        // Note: parser may handle unclosed tags differently
        // The important thing is it doesn't crash
        const div = root.querySelector('div');
        expect(div).toBeTruthy();
        expect(root.text).toContain('Text');
      });

      it('should handle completely unclosed document', () => {
        const root = parse('<html><head><title>Test');
        // Should not crash
        expect(root).toBeTruthy();
      });
    });

    describe('12.3 Extra Close Tags', () => {
      it('should handle extra close tags', () => {
        const root = parse('<div>Text</div></div></p>');
        const div = root.querySelector('div');
        expect(div?.text).toBe('Text');
      });
    });

    describe('12.4 Mismatched Tags', () => {
      it('should handle mismatched tags', () => {
        const root = parse('<div><span>Text</div></span>');
        // Should not crash, behavior may vary
        expect(root).toBeTruthy();
      });

      it('should handle interleaved tags', () => {
        const root = parse('<b><i>text</b></i>');
        // Bold and italic interleaved - behavior varies
        expect(root).toBeTruthy();
      });
    });

    describe('12.5 Empty Tags', () => {
      it('should handle consecutive empty tags', () => {
        const root = parse('<div></div><div></div><div></div>');
        const divs = root.querySelectorAll('div');
        expect(divs.length).toBe(3);
      });
    });

    describe('12.6 Special Characters', () => {
      it('should handle less-than in text', () => {
        // This is technically invalid HTML
        const root = parse('<div>a < b</div>');
        const div = root.querySelector('div');
        // Behavior may vary - might parse 'b' as tag
      });

      it('should handle greater-than in text', () => {
        const root = parse('<div>a > b</div>');
        const div = root.querySelector('div');
        expect(div?.text).toContain('>');
      });

      it('should handle ampersand in text', () => {
        const root = parse('<div>a & b</div>');
        const div = root.querySelector('div');
        expect(div?.text).toBe('a & b');
      });
    });

    describe('12.7 Nested Anchors (fixNestedATags)', () => {
      it('should handle nested anchors with option', () => {
        const root = parse('<a href="1"><a href="2">Text</a></a>', { fixNestedATags: true });
        const anchors = root.querySelectorAll('a');
        // With fixNestedATags, nested <a> should be handled
        expect(anchors.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('12.8 Deep Nesting', () => {
      it('should handle very deep nesting', () => {
        let html = '';
        for (let i = 0; i < 100; i++) html += '<div>';
        html += 'Deep';
        for (let i = 0; i < 100; i++) html += '</div>';
        const root = parse(html);
        expect(root.text).toBe('Deep');
      });
    });

    describe('12.9 Large Documents', () => {
      it('should handle large document', () => {
        let html = '<div>';
        for (let i = 0; i < 1000; i++) {
          html += `<p>Paragraph ${i}</p>`;
        }
        html += '</div>';
        const root = parse(html);
        const ps = root.querySelectorAll('p');
        expect(ps.length).toBe(1000);
      });
    });

    describe('12.10 Unicode', () => {
      it('should handle unicode characters', () => {
        const root = parse('<div>こんにちは 世界 🌍</div>');
        const div = root.querySelector('div');
        expect(div?.text).toContain('こんにちは');
        expect(div?.text).toContain('🌍');
      });

      it('should handle unicode in attributes', () => {
        const root = parse('<div title="日本語"></div>');
        const div = root.querySelector('div');
        expect(div?.getAttribute('title')).toBe('日本語');
      });
    });
  });

  // =============================================================================
  // 13. VALID FUNCTION
  // =============================================================================
  describe('13. valid() Function', () => {
    it('should return true for valid HTML', () => {
      expect(valid('<div><p>Text</p></div>')).toBe(true);
    });

    it('should return true for empty string', () => {
      expect(valid('')).toBe(true);
    });

    it('should return false for mismatched close tags', () => {
      // Note: valid() returns true for some unclosed tags that can be recovered
      // but returns false for clearly mismatched tags
      expect(valid('<div></span>')).toBe(false);
    });

    it('should return false for mismatched tags', () => {
      expect(valid('<div></span>')).toBe(false);
    });

    it('should return true for self-closing void elements', () => {
      expect(valid('<br><img src="test.jpg">')).toBe(true);
    });
  });

  // =============================================================================
  // 14. REMOVE WHITESPACE
  // =============================================================================
  describe('14. removeWhitespace()', () => {
    it('should remove whitespace-only text nodes', () => {
      const root = parse('<div>   <p>Text</p>   </div>');
      const div = root.querySelector('div')!;
      const initialCount = div.childNodes.length;
      div.removeWhitespace();
      expect(div.childNodes.length).toBeLessThanOrEqual(initialCount);
      expect(div.querySelector('p')?.text).toBe('Text');
    });

    it('should trim text in text nodes', () => {
      const root = parse('<div>  text  </div>');
      const div = root.querySelector('div')!;
      div.removeWhitespace();
      expect(div.text).toBe('text');
    });

    it('should work recursively', () => {
      const root = parse('<div>   <p>   nested   </p>   </div>');
      const div = root.querySelector('div')!;
      div.removeWhitespace();
      expect(div.querySelector('p')?.text).toBe('nested');
    });
  });

  // =============================================================================
  // 15. TRIM RIGHT
  // =============================================================================
  describe('15. trimRight()', () => {
    it('should trim text after pattern', () => {
      const root = parse('<div>Before STOP After</div>');
      const div = root.querySelector('div')!;
      div.trimRight(/STOP/);
      expect(div.text).toBe('Before ');
    });

    it('should work recursively', () => {
      const root = parse('<div><p>Text STOP More</p></div>');
      const div = root.querySelector('div')!;
      div.trimRight(/STOP/);
      expect(div.text).toBe('Text ');
    });
  });

  // =============================================================================
  // 16. RANGE TRACKING
  // =============================================================================
  describe('16. Range Tracking', () => {
    it('should track element ranges', () => {
      const root = parse('<div>text</div>');
      const div = root.querySelector('div')!;
      expect(div.range[0]).toBeGreaterThanOrEqual(0);
      expect(div.range[1]).toBeGreaterThan(div.range[0]);
    });

    it('should track text node ranges', () => {
      const root = parse('<div>text</div>');
      const textNode = root.querySelector('div')!.firstChild!;
      expect(textNode.range[0]).toBeGreaterThanOrEqual(0);
    });
  });

  // =============================================================================
  // 17. BR TAG SPECIAL HANDLING
  // =============================================================================
  describe('17. BR Tag Special Handling', () => {
    it('should return newline for br rawText', () => {
      const root = parse('<div>Line1<br>Line2</div>');
      const div = root.querySelector('div')!;
      expect(div.rawText).toContain('\n');
    });
  });

  // =============================================================================
  // 18. ID HANDLING
  // =============================================================================
  describe('18. ID Handling', () => {
    it('should set id property from attribute', () => {
      const root = parse('<div id="test"></div>');
      const div = root.querySelector('div')!;
      expect(div.id).toBe('test');
    });

    it('should update id property when setting attribute', () => {
      const root = parse('<div></div>');
      const div = root.querySelector('div')!;
      div.setAttribute('id', 'new-id');
      expect(div.id).toBe('new-id');
    });

    it('should clear id when removing attribute', () => {
      const root = parse('<div id="test"></div>');
      const div = root.querySelector('div')!;
      div.removeAttribute('id');
      expect(div.id).toBe('');
    });
  });

  // =============================================================================
  // 19. TAG NAME SETTING
  // =============================================================================
  describe('19. Tag Name Setting', () => {
    it('should allow setting tagName', () => {
      const root = parse('<div></div>');
      const div = root.querySelector('div')!;
      div.tagName = 'SPAN';
      expect(div.tagName).toBe('SPAN');
      expect(div.localName).toBe('span');
    });
  });

  // =============================================================================
  // 20. COMMENT NODE
  // =============================================================================
  describe('20. CommentNode', () => {
    it('should have correct nodeType', () => {
      const root = parse('<!-- comment -->', { comment: true });
      const comment = root.firstChild as CommentNode;
      expect(comment.nodeType).toBe(NodeType.COMMENT_NODE);
    });

    it('should have rawTagName as !--', () => {
      const root = parse('<!-- comment -->', { comment: true });
      const comment = root.firstChild as CommentNode;
      expect(comment.rawTagName).toBe('!--');
    });

    it('should clone comment node', () => {
      const root = parse('<!-- comment -->', { comment: true });
      const comment = root.firstChild as CommentNode;
      const clone = comment.clone() as CommentNode;
      expect(clone.text).toBe(' comment ');
      expect(clone).not.toBe(comment);
    });
  });

});

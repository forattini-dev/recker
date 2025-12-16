import { describe, it, expect } from 'vitest';
import { parse, NodeType } from '../../../src/scrape/parser/index.js';

describe('Parser Nodes - Additional Coverage', () => {
  describe('TextNode', () => {
    it('should create TextNode with rawText', () => {
      const root = parse('<p>Hello World</p>');
      const p = root.querySelector('p');
      const textNode = p?.childNodes[0] as unknown as typeof TextNode.prototype;

      expect(textNode.rawText).toBe('Hello World');
      expect(textNode.text).toBe('Hello World');
    });

    it('should get trimmedText', () => {
      const root = parse('<p>  Hello World  </p>');
      const p = root.querySelector('p');
      const textNode = p?.childNodes[0] as unknown as typeof TextNode.prototype;

      expect(textNode.trimmedText).toBe('Hello World');
    });

    it('should get trimmedRawText', () => {
      const root = parse('<p>  Hello World  </p>');
      const p = root.querySelector('p');
      const textNode = p?.childNodes[0] as unknown as typeof TextNode.prototype;

      expect(textNode.trimmedRawText).toBe('Hello World');
    });

    it('should detect whitespace-only text', () => {
      const root = parse('<p>   </p>');
      const p = root.querySelector('p');
      const textNode = p?.childNodes[0] as unknown as typeof TextNode.prototype;

      expect(textNode.isWhitespace).toBe(true);
    });

    it('should detect non-whitespace text', () => {
      const root = parse('<p>Hello</p>');
      const p = root.querySelector('p');
      const textNode = p?.childNodes[0] as unknown as typeof TextNode.prototype;

      expect(textNode.isWhitespace).toBe(false);
    });

    it('should convert to string', () => {
      const root = parse('<p>Hello</p>');
      const p = root.querySelector('p');
      const textNode = p?.childNodes[0] as unknown as typeof TextNode.prototype;

      expect(textNode.toString()).toBe('Hello');
    });

    it('should clone TextNode', () => {
      const root = parse('<p>Hello</p>');
      const p = root.querySelector('p');
      const textNode = p?.childNodes[0] as unknown as typeof TextNode.prototype;
      const cloned = textNode.clone();

      expect(cloned.rawText).toBe('Hello');
    });

    it('should decode HTML entities', () => {
      const root = parse('<p>&amp; &lt; &gt;</p>');
      const p = root.querySelector('p');
      const textNode = p?.childNodes[0] as unknown as typeof TextNode.prototype;

      expect(textNode.text).toBe('& < >');
    });

    it('should detect nbsp as whitespace', () => {
      const root = parse('<p>&nbsp;</p>');
      const p = root.querySelector('p');
      const textNode = p?.childNodes[0] as unknown as typeof TextNode.prototype;

      expect(textNode.isWhitespace).toBe(true);
    });
  });

  describe('CommentNode', () => {
    it('should parse comment nodes when option enabled', () => {
      const root = parse('<div><!-- This is a comment --></div>', { comment: true });
      const div = root.querySelector('div');
      const comment = div?.childNodes.find(n => n.nodeType === NodeType.COMMENT_NODE);

      expect(comment).toBeDefined();
    });

    it('should skip comments by default', () => {
      const root = parse('<div><!-- This is a comment --></div>');
      const div = root.querySelector('div');
      const comment = div?.childNodes.find(n => n.nodeType === NodeType.COMMENT_NODE);

      expect(comment).toBeUndefined();
    });

    it('should get comment text', () => {
      const root = parse('<div><!-- Hello --></div>', { comment: true });
      const div = root.querySelector('div');
      const comment = div?.childNodes.find(n => n.nodeType === NodeType.COMMENT_NODE) as any;

      expect(comment?.rawText).toContain('Hello');
    });

    it('should clone CommentNode', () => {
      const root = parse('<div><!-- Test --></div>', { comment: true });
      const div = root.querySelector('div');
      const comment = div?.childNodes.find(n => n.nodeType === NodeType.COMMENT_NODE) as any;
      const cloned = comment?.clone();

      expect(cloned).toBeDefined();
    });

    it('should convert comment to string', () => {
      const root = parse('<div><!-- Test --></div>', { comment: true });
      const div = root.querySelector('div');
      const comment = div?.childNodes.find(n => n.nodeType === NodeType.COMMENT_NODE) as any;

      expect(comment?.toString()).toContain('Test');
    });
  });

  describe('Node base class', () => {
    it('should have nodeType property', () => {
      const root = parse('<p>Test</p>');
      const p = root.querySelector('p');

      expect(p?.nodeType).toBe(NodeType.ELEMENT_NODE);
    });

    it('should have parentNode', () => {
      const root = parse('<div><p>Test</p></div>');
      const p = root.querySelector('p');

      expect(p?.parentNode).toBeDefined();
      expect(p?.parentNode?.tagName).toBe('DIV');
    });

    it('should have childNodes', () => {
      const root = parse('<div><p>One</p><p>Two</p></div>');
      const div = root.querySelector('div');

      expect(div?.childNodes.length).toBe(2);
    });
  });

  describe('HTMLElement', () => {
    it('should get and set id', () => {
      const root = parse('<div id="test"></div>');
      const div = root.querySelector('div');

      expect(div?.id).toBe('test');

      div!.id = 'new-id';
      expect(div?.id).toBe('new-id');
    });

    it('should handle classNames', () => {
      const root = parse('<div class="foo bar baz"></div>');
      const div = root.querySelector('div');

      expect(div?.classNames).toContain('foo');
      expect(div?.classNames).toContain('bar');
      expect(div?.classNames).toContain('baz');
    });

    it('should handle classList operations', () => {
      const root = parse('<div class="foo"></div>');
      const div = root.querySelector('div');

      expect(div?.classList.contains('foo')).toBe(true);

      div?.classList.add('bar');
      expect(div?.classList.contains('bar')).toBe(true);

      div?.classList.remove('foo');
      expect(div?.classList.contains('foo')).toBe(false);

      div?.classList.toggle('baz');
      expect(div?.classList.contains('baz')).toBe(true);
    });

    it('should get and set innerHTML', () => {
      const root = parse('<div><p>Original</p></div>');
      const div = root.querySelector('div');

      expect(div?.innerHTML).toContain('Original');

      div!.innerHTML = '<span>New content</span>';
      expect(div?.innerHTML).toContain('New content');
    });

    it('should get outerHTML', () => {
      const root = parse('<div id="test">Content</div>');
      const div = root.querySelector('div');

      expect(div?.outerHTML).toContain('<div');
      expect(div?.outerHTML).toContain('id="test"');
      expect(div?.outerHTML).toContain('Content');
    });

    it('should get textContent', () => {
      const root = parse('<div><p>Hello</p> <p>World</p></div>');
      const div = root.querySelector('div');

      expect(div?.textContent).toContain('Hello');
      expect(div?.textContent).toContain('World');
    });

    it('should set textContent', () => {
      const root = parse('<div><p>Original</p></div>');
      const div = root.querySelector('div');

      div!.textContent = 'New text';
      expect(div?.textContent).toBe('New text');
      expect(div?.children.length).toBe(0);
    });

    it('should handle attributes', () => {
      const root = parse('<div data-id="123" data-name="test"></div>');
      const div = root.querySelector('div');

      expect(div?.getAttribute('data-id')).toBe('123');
      expect(div?.getAttribute('data-name')).toBe('test');

      div?.setAttribute('data-new', 'value');
      expect(div?.getAttribute('data-new')).toBe('value');

      expect(div?.hasAttribute('data-id')).toBe(true);

      div?.removeAttribute('data-id');
      expect(div?.hasAttribute('data-id')).toBe(false);
    });

    it('should get all attributes', () => {
      const root = parse('<div id="test" class="foo" data-x="1"></div>');
      const div = root.querySelector('div');
      const attrs = div?.attributes;

      expect(attrs).toBeDefined();
      expect(attrs?.id).toBe('test');
      expect(attrs?.class).toBe('foo');
    });

    it('should handle nextSibling and previousSibling', () => {
      const root = parse('<div><p id="first">1</p><p id="second">2</p><p id="third">3</p></div>');
      const second = root.querySelector('#second');

      expect(second?.previousElementSibling?.id).toBe('first');
      expect(second?.nextElementSibling?.id).toBe('third');
    });

    it('should handle firstChild and lastChild', () => {
      const root = parse('<div><p>First</p><p>Last</p></div>');
      const div = root.querySelector('div');

      expect((div?.firstChild as any)?.text).toBe('First');
      expect((div?.lastChild as any)?.text).toBe('Last');
    });

    it('should handle appendChild', () => {
      const root = parse('<div><p>Original</p></div>');
      const div = root.querySelector('div');
      const newP = parse('<p>New</p>').querySelector('p')!;

      div?.appendChild(newP);
      expect(div?.children.length).toBe(2);
      expect(div?.lastChild?.text).toBe('New');
    });

    it('should handle removeChild', () => {
      const root = parse('<div><p id="remove">Remove</p><p>Keep</p></div>');
      const div = root.querySelector('div');
      const toRemove = root.querySelector('#remove')!;

      div?.removeChild(toRemove);
      expect(div?.children.length).toBe(1);
      expect(div?.querySelector('#remove')).toBeNull();
    });

    it('should handle exchangeChild', () => {
      const root = parse('<div><p id="old">Old</p></div>');
      const div = root.querySelector('div');
      const oldP = root.querySelector('#old')!;
      const newP = parse('<p id="new">New</p>').querySelector('p')!;

      div?.exchangeChild(oldP, newP);
      expect(div?.querySelector('#new')).toBeDefined();
      expect(div?.querySelector('#old')).toBeNull();
    });

    it('should handle before method for inserting', () => {
      const root = parse('<div><p id="after">After</p></div>');
      const after = root.querySelector('#after')!;
      const before = parse('<p id="before">Before</p>').querySelector('p')!;

      after?.before(before);
      const div = root.querySelector('div');
      expect(div?.children[0]?.id).toBe('before');
    });

    it('should handle prepend', () => {
      const root = parse('<div><p>Original</p></div>');
      const div = root.querySelector('div');

      div?.prepend('<p>Prepended</p>');
      expect(div?.firstChild?.text).toBe('Prepended');
    });

    it('should handle append', () => {
      const root = parse('<div><p>Original</p></div>');
      const div = root.querySelector('div');

      div?.append('<p>Appended</p>');
      expect(div?.lastChild?.text).toBe('Appended');
    });

    it('should handle before', () => {
      const root = parse('<div><p id="target">Target</p></div>');
      const target = root.querySelector('#target');

      target?.before('<p id="before">Before</p>');
      const div = root.querySelector('div');
      expect(div?.children[0]?.id).toBe('before');
    });

    it('should handle after', () => {
      const root = parse('<div><p id="target">Target</p></div>');
      const target = root.querySelector('#target');

      target?.after('<p id="after">After</p>');
      const div = root.querySelector('div');
      expect(div?.children[1]?.id).toBe('after');
    });

    it('should handle replaceWith', () => {
      const root = parse('<div><p id="old">Old</p></div>');
      const old = root.querySelector('#old');

      old?.replaceWith('<p id="new">New</p>');
      const div = root.querySelector('div');
      expect(div?.querySelector('#new')).toBeDefined();
      expect(div?.querySelector('#old')).toBeNull();
    });

    it('should handle remove', () => {
      const root = parse('<div><p id="remove">Remove</p><p>Keep</p></div>');
      const toRemove = root.querySelector('#remove');

      toRemove?.remove();
      const div = root.querySelector('div');
      expect(div?.children.length).toBe(1);
    });

    it('should clone element', () => {
      const root = parse('<div id="test" class="foo"><p>Child</p></div>');
      const div = root.querySelector('div')!;
      const cloned = div.clone();

      expect(cloned.id).toBe('test');
      expect(cloned.classList.contains('foo')).toBe(true);
      expect(cloned.children.length).toBe(1);
    });

    it('should get localName and tagName', () => {
      const root = parse('<DIV></DIV>');
      const div = root.querySelector('div');

      expect(div?.localName).toBe('div');
      expect(div?.tagName).toBe('DIV');
    });

    it('should handle closest', () => {
      const root = parse('<div class="outer"><div class="inner"><p>Test</p></div></div>');
      const p = root.querySelector('p');

      expect(p?.closest('.inner')).toBeDefined();
      expect(p?.closest('.outer')).toBeDefined();
      expect(p?.closest('.nonexistent')).toBeNull();
    });

    it('should handle closest to match itself', () => {
      const root = parse('<div class="foo bar" id="test"></div>');
      const div = root.querySelector('div');

      expect(div?.closest('.foo')).toBe(div);
      expect(div?.closest('#test')).toBe(div);
      expect(div?.closest('.baz')).toBeNull();
    });

    it('should handle getElementsByTagName', () => {
      const root = parse('<div><p>1</p><span>2</span><p>3</p></div>');
      const div = root.querySelector('div');
      const paragraphs = div?.getElementsByTagName('p');

      expect(paragraphs?.length).toBe(2);
    });

    it('should handle querySelectorAll with class selector', () => {
      const root = parse('<div><p class="highlight">1</p><p>2</p><p class="highlight">3</p></div>');
      const div = root.querySelector('div');
      const highlighted = div?.querySelectorAll('.highlight');

      expect(highlighted?.length).toBe(2);
    });
  });

  describe('CSS Selector matching (exercises matcher.ts)', () => {
    it('should find nested elements', () => {
      const root = parse(`
        <div class="level1">
          <div class="level2">
            <div class="level3">
              <p>Deep</p>
            </div>
          </div>
        </div>
      `);

      const deep = root.querySelector('.level1 .level2 .level3 p');
      expect(deep?.text).toBe('Deep');
    });

    it('should use existsOne with :has selector', () => {
      const root = parse(`
        <div class="parent">
          <p>Has paragraph</p>
        </div>
        <div class="empty"></div>
      `);

      const withP = root.querySelectorAll('div:has(p)');
      expect(withP.length).toBe(1);
    });

    it('should use existsOne recursively with nested :has', () => {
      const root = parse(`
        <div class="outer">
          <div class="inner">
            <span>content</span>
          </div>
        </div>
        <div class="empty-outer"></div>
      `);

      // This exercises existsOne recursively looking through children
      const withSpan = root.querySelectorAll('div:has(span)');
      expect(withSpan.length).toBe(2); // Both outer and inner have span descendant
    });

    it('should use findAll for querySelectorAll', () => {
      const root = parse(`
        <ul>
          <li class="item">1</li>
          <li class="item">2</li>
          <li class="item">3</li>
        </ul>
      `);

      const items = root.querySelectorAll('.item');
      expect(items.length).toBe(3);
    });

    it('should use findAll with non-element nodes mixed in', () => {
      const root = parse(`
        <div>
          Text before
          <p class="test">Para 1</p>
          Text after
          <p class="test">Para 2</p>
        </div>
      `);

      // findAll should skip text nodes and only return elements
      const paras = root.querySelectorAll('.test');
      expect(paras.length).toBe(2);
    });

    it('should use findOne for querySelector', () => {
      const root = parse(`
        <div>
          <p class="first">First</p>
          <p class="second">Second</p>
        </div>
      `);

      const first = root.querySelector('p');
      expect(first?.classList.contains('first')).toBe(true);
    });

    it('should use findOne recursively through nested elements', () => {
      const root = parse(`
        <div>
          <section>
            <article>
              <span class="deep">Found</span>
            </article>
          </section>
        </div>
      `);

      // findOne should recursively search through children
      const deep = root.querySelector('.deep');
      expect(deep?.text).toBe('Found');
    });

    it('should use getSiblings for sibling selectors', () => {
      const root = parse(`
        <div>
          <p>1</p>
          <p>2</p>
          <p>3</p>
        </div>
      `);

      const second = root.querySelectorAll('p + p');
      expect(second.length).toBe(2);
    });

    it('should use general sibling selector', () => {
      const root = parse(`
        <div>
          <h1>Title</h1>
          <p>Para 1</p>
          <p>Para 2</p>
        </div>
      `);

      // General sibling selector exercises getSiblings
      const siblings = root.querySelectorAll('h1 ~ p');
      expect(siblings.length).toBe(2);
    });

    it('should use removeSubsets for complex queries', () => {
      const root = parse(`
        <div class="a">
          <div class="b">
            <p>Nested</p>
          </div>
        </div>
        <div class="c">
          <p>Sibling</p>
        </div>
      `);

      // This exercises removeSubsets internally
      const divs = root.querySelectorAll('div');
      expect(divs.length).toBeGreaterThan(0);
    });

    it('should use removeSubsets when querying overlapping results', () => {
      const root = parse(`
        <div class="container">
          <div class="inner also-match">
            <div class="deepest also-match">
              <p>Content</p>
            </div>
          </div>
        </div>
      `);

      // Query returns nested elements that need deduplication
      const matches = root.querySelectorAll('.also-match');
      expect(matches.length).toBe(2); // Both .inner and .deepest
    });

    it('should use hasAttrib for attribute selectors', () => {
      const root = parse(`
        <div data-test="1"></div>
        <div data-other="2"></div>
        <div>No attr</div>
      `);

      const withTest = root.querySelectorAll('[data-test]');
      expect(withTest.length).toBe(1);
    });

    it('should use hasAttrib with multiple attribute selectors', () => {
      const root = parse(`
        <input type="text" name="email" required />
        <input type="text" name="phone" />
        <input type="checkbox" required />
      `);

      // Multiple attribute checks
      const requiredText = root.querySelectorAll('[type="text"][required]');
      expect(requiredText.length).toBe(1);
    });

    it('should use getText for :contains selector', () => {
      const root = parse(`
        <p>Hello World</p>
        <p>Goodbye</p>
      `);

      const hello = root.querySelectorAll('p:contains("Hello")');
      expect(hello.length).toBe(1);
    });

    it('should use getText with nested content', () => {
      const root = parse(`
        <div class="card">
          <h2>Title</h2>
          <p>Description with <strong>important</strong> text</p>
        </div>
        <div class="card">
          <h2>Other</h2>
          <p>No match here</p>
        </div>
      `);

      // getText should get all nested text
      const withImportant = root.querySelectorAll('.card:contains("important")');
      expect(withImportant.length).toBe(1);
    });
  });

  describe('Node base class methods (coverage for node.ts)', () => {
    it('should get innerText from TextNode', () => {
      const root = parse('<p>Test content</p>');
      const p = root.querySelector('p');
      const textNode = p?.childNodes[0];

      expect(textNode?.innerText).toBe('Test content');
    });

    it('should get textContent from TextNode', () => {
      const root = parse('<p>Test &amp; content</p>');
      const p = root.querySelector('p');
      const textNode = p?.childNodes[0];

      expect(textNode?.textContent).toBe('Test & content');
    });

    it('should set textContent on TextNode', () => {
      const root = parse('<p>Original</p>');
      const p = root.querySelector('p');
      const textNode = p?.childNodes[0] as any;

      textNode.textContent = 'New & improved';
      // he.encode uses hex entities
      expect(textNode?.rawText).toContain('&#x26;');
    });
  });
});

import { describe, it, expect } from 'vitest';
import { parse, HTMLElement, TextNode, NodeType, valid } from '../../../src/scrape/parser/index.js';

/**
 * API Compatibility Tests for HTML Parser
 *
 * These tests ensure our parser behaves according to expected HTML parsing
 * standards. Each test documents expected behavior.
 */

describe('HTML Parser - Compatibility Tests', () => {

  // =============================================================================
  // API COMPATIBILITY
  // =============================================================================
  describe('API Compatibility', () => {

    describe('parse() function', () => {
      it('should return HTMLElement', () => {
        const result = parse('<div></div>');
        expect(result).toBeInstanceOf(HTMLElement);
      });

      it('should accept string argument', () => {
        expect(() => parse('<div></div>')).not.toThrow();
      });

      it('should accept options as second argument', () => {
        expect(() => parse('<div></div>', { lowerCaseTagName: true })).not.toThrow();
      });

      it('should return root with no tagName', () => {
        const root = parse('<div></div>');
        expect(root.rawTagName).toBe('');
      });
    });

    describe('valid() function', () => {
      it('should return boolean', () => {
        const result = valid('<div></div>');
        expect(typeof result).toBe('boolean');
      });

      it('should accept same options as parse', () => {
        expect(() => valid('<div></div>', { lowerCaseTagName: true })).not.toThrow();
      });
    });

    describe('Options interface', () => {
      it('should support lowerCaseTagName option', () => {
        const root = parse('<DIV></DIV>', { lowerCaseTagName: true });
        expect(root.querySelector('div')?.rawTagName).toBe('div');
      });

      it('should support comment option', () => {
        const root = parse('<!-- comment -->', { comment: true });
        expect(root.childNodes.length).toBe(1);
      });

      it('should support blockTextElements option', () => {
        const root = parse('<custom><div>inside</div></custom>', {
          blockTextElements: { custom: true }
        });
        expect(root.querySelectorAll('div').length).toBe(0);
      });

      it('should support voidTag.tags option', () => {
        const root = parse('<custom>', {
          voidTag: { tags: ['custom'] }
        });
        expect(root.querySelector('custom')?.isVoidElement).toBe(true);
      });

      it('should support voidTag.closingSlash option', () => {
        const root = parse('<br>', {
          voidTag: { closingSlash: true }
        });
        // Note: closingSlash only adds space before / when there are attributes
        expect(root.querySelector('br')?.toString()).toBe('<br/>');
      });

      it('should support fixNestedATags option', () => {
        const root = parse('<a><a></a></a>', { fixNestedATags: true });
        expect(root.querySelectorAll('a').length).toBe(2);
      });

      it('should support parseNoneClosedTags option', () => {
        const root = parse('<div><p>', { parseNoneClosedTags: true });
        expect(root).toBeTruthy();
      });
    });
  });

  // =============================================================================
  // HTMLElement API COMPATIBILITY
  // =============================================================================
  describe('HTMLElement API Compatibility', () => {

    describe('Properties', () => {
      it('should have tagName (uppercase)', () => {
        const el = parse('<div></div>').querySelector('div')!;
        expect(el.tagName).toBe('DIV');
      });

      it('should have rawTagName (original case)', () => {
        const el = parse('<DiV></DiV>').querySelector('div')!;
        expect(el.rawTagName).toBe('DiV');
      });

      it('should have localName (lowercase)', () => {
        const el = parse('<DIV></DIV>').querySelector('div')!;
        expect(el.localName).toBe('div');
      });

      it('should have id', () => {
        const el = parse('<div id="test"></div>').querySelector('div')!;
        expect(el.id).toBe('test');
      });

      it('should have classList', () => {
        const el = parse('<div class="a b c"></div>').querySelector('div')!;
        expect(el.classList).toBeTruthy();
        expect(el.classList.length).toBe(3);
      });

      it('should have classNames', () => {
        const el = parse('<div class="a b"></div>').querySelector('div')!;
        expect(typeof el.classNames).toBe('string');
      });

      it('should have nodeType', () => {
        const el = parse('<div></div>').querySelector('div')!;
        expect(el.nodeType).toBe(NodeType.ELEMENT_NODE);
      });

      it('should have childNodes', () => {
        const el = parse('<div><p></p></div>').querySelector('div')!;
        expect(Array.isArray(el.childNodes)).toBe(true);
      });

      it('should have children (HTMLElement only)', () => {
        const el = parse('<div>text<p></p></div>').querySelector('div')!;
        expect(el.children.length).toBe(1);
        expect(el.children[0]).toBeInstanceOf(HTMLElement);
      });

      it('should have parentNode', () => {
        const root = parse('<div><p></p></div>');
        const p = root.querySelector('p')!;
        expect(p.parentNode?.tagName).toBe('DIV');
      });

      it('should have range', () => {
        const el = parse('<div></div>').querySelector('div')!;
        expect(Array.isArray(el.range)).toBe(true);
        expect(el.range.length).toBe(2);
      });

      it('should have rawAttrs', () => {
        const el = parse('<div class="test" id="main"></div>').querySelector('div')!;
        expect(typeof el.rawAttrs).toBe('string');
      });

      it('should have isVoidElement', () => {
        const br = parse('<br>').querySelector('br')!;
        const div = parse('<div></div>').querySelector('div')!;
        expect(br.isVoidElement).toBe(true);
        expect(div.isVoidElement).toBe(false);
      });
    });

    describe('Text Content Properties', () => {
      it('should have text (decoded)', () => {
        const el = parse('<div>&amp;</div>').querySelector('div')!;
        expect(el.text).toBe('&');
      });

      it('should have rawText (as-is)', () => {
        const el = parse('<div>&amp;</div>').querySelector('div')!;
        expect(el.rawText).toBe('&amp;');
      });

      it('should have textContent (decoded, settable)', () => {
        const el = parse('<div>old</div>').querySelector('div')!;
        expect(el.textContent).toBe('old');
        el.textContent = 'new';
        expect(el.textContent).toBe('new');
      });

      it('should have innerHTML (settable)', () => {
        const el = parse('<div><p>old</p></div>').querySelector('div')!;
        expect(el.innerHTML).toBe('<p>old</p>');
        el.innerHTML = '<span>new</span>';
        expect(el.innerHTML).toBe('<span>new</span>');
      });

      it('should have outerHTML', () => {
        const el = parse('<div class="test">text</div>').querySelector('div')!;
        const outer = el.outerHTML;
        expect(outer).toContain('<div');
        expect(outer).toContain('</div>');
      });

      it('should have structuredText', () => {
        const el = parse('<div><p>Line1</p><p>Line2</p></div>').querySelector('div')!;
        const structured = el.structuredText;
        expect(typeof structured).toBe('string');
      });

      it('should have structure', () => {
        const el = parse('<div id="test"><p class="x"></p></div>').querySelector('div')!;
        const structure = el.structure;
        expect(structure).toContain('div#test');
        expect(structure).toContain('p.x');
      });
    });

    describe('Navigation Properties', () => {
      it('should have firstChild', () => {
        const el = parse('<div><p></p></div>').querySelector('div')!;
        expect(el.firstChild).toBeTruthy();
      });

      it('should have lastChild', () => {
        const el = parse('<div><p></p><span></span></div>').querySelector('div')!;
        expect((el.lastChild as HTMLElement).tagName).toBe('SPAN');
      });

      it('should have firstElementChild', () => {
        const el = parse('<div>text<p></p></div>').querySelector('div')!;
        expect(el.firstElementChild?.tagName).toBe('P');
      });

      it('should have lastElementChild', () => {
        const el = parse('<div><p></p>text</div>').querySelector('div')!;
        expect(el.lastElementChild?.tagName).toBe('P');
      });

      it('should have nextSibling', () => {
        const root = parse('<div><p></p><span></span></div>');
        const p = root.querySelector('p')!;
        expect((p.nextSibling as HTMLElement).tagName).toBe('SPAN');
      });

      it('should have previousSibling', () => {
        const root = parse('<div><p></p><span></span></div>');
        const span = root.querySelector('span')!;
        expect((span.previousSibling as HTMLElement).tagName).toBe('P');
      });

      it('should have nextElementSibling', () => {
        const root = parse('<div><p></p>text<span></span></div>');
        const p = root.querySelector('p')!;
        expect(p.nextElementSibling?.tagName).toBe('SPAN');
      });

      it('should have previousElementSibling', () => {
        const root = parse('<div><p></p>text<span></span></div>');
        const span = root.querySelector('span')!;
        expect(span.previousElementSibling?.tagName).toBe('P');
      });

      it('should have childElementCount', () => {
        const el = parse('<div>text<p></p><span></span></div>').querySelector('div')!;
        expect(el.childElementCount).toBe(2);
      });
    });

    describe('Query Methods', () => {
      it('should have querySelector', () => {
        const root = parse('<div><p class="x"></p></div>');
        const p = root.querySelector('p.x');
        expect(p).toBeTruthy();
      });

      it('should have querySelectorAll', () => {
        const root = parse('<div><p></p><p></p></div>');
        const ps = root.querySelectorAll('p');
        expect(ps.length).toBe(2);
      });

      it('should have getElementById', () => {
        const root = parse('<div id="test"></div>');
        const el = root.getElementById('test');
        expect(el).toBeTruthy();
      });

      it('should have getElementsByTagName', () => {
        const root = parse('<div><p></p><p></p></div>');
        const ps = root.getElementsByTagName('p');
        expect(ps.length).toBe(2);
      });

      it('should have closest', () => {
        const root = parse('<div class="container"><p></p></div>');
        const p = root.querySelector('p')!;
        const div = p.closest('.container');
        expect(div?.tagName).toBe('DIV');
      });
    });

    describe('Attribute Methods', () => {
      it('should have getAttribute', () => {
        const el = parse('<div class="test"></div>').querySelector('div')!;
        expect(el.getAttribute('class')).toBe('test');
      });

      it('should have setAttribute', () => {
        const el = parse('<div></div>').querySelector('div')!;
        el.setAttribute('class', 'test');
        expect(el.getAttribute('class')).toBe('test');
      });

      it('should have removeAttribute', () => {
        const el = parse('<div class="test"></div>').querySelector('div')!;
        el.removeAttribute('class');
        expect(el.hasAttribute('class')).toBe(false);
      });

      it('should have hasAttribute', () => {
        const el = parse('<div class="test"></div>').querySelector('div')!;
        expect(el.hasAttribute('class')).toBe(true);
        expect(el.hasAttribute('id')).toBe(false);
      });

      it('should have setAttributes', () => {
        const el = parse('<div></div>').querySelector('div')!;
        el.setAttributes({ class: 'a', id: 'b' });
        expect(el.getAttribute('class')).toBe('a');
        expect(el.getAttribute('id')).toBe('b');
      });

      it('should have attrs (decoded)', () => {
        const el = parse('<div class="test"></div>').querySelector('div')!;
        expect(el.attrs.class).toBe('test');
      });

      it('should have attributes', () => {
        const el = parse('<div class="test"></div>').querySelector('div')!;
        expect(el.attributes.class).toBe('test');
      });

      it('should have rawAttributes', () => {
        const el = parse('<div CLASS="test"></div>').querySelector('div')!;
        expect(el.rawAttributes.CLASS).toBe('test');
      });
    });

    describe('Manipulation Methods', () => {
      it('should have appendChild', () => {
        const root = parse('<div></div>');
        const div = root.querySelector('div')!;
        const p = parse('<p></p>').firstChild!;
        div.appendChild(p);
        expect(div.childNodes.length).toBe(1);
      });

      it('should have removeChild', () => {
        const root = parse('<div><p></p></div>');
        const div = root.querySelector('div')!;
        const p = root.querySelector('p')!;
        div.removeChild(p);
        expect(div.childNodes.length).toBe(0);
      });

      it('should have exchangeChild', () => {
        const root = parse('<div><p></p></div>');
        const div = root.querySelector('div')!;
        const p = root.querySelector('p')!;
        const span = parse('<span></span>').firstChild!;
        div.exchangeChild(p, span);
        expect(root.querySelector('span')).toBeTruthy();
        expect(root.querySelector('p')).toBeNull();
      });

      it('should have remove', () => {
        const root = parse('<div><p></p></div>');
        const p = root.querySelector('p')!;
        p.remove();
        expect(root.querySelector('p')).toBeNull();
      });

      it('should have replaceWith', () => {
        const root = parse('<div><p></p></div>');
        const p = root.querySelector('p')!;
        p.replaceWith('<span></span>');
        expect(root.querySelector('span')).toBeTruthy();
      });

      it('should have prepend', () => {
        const root = parse('<div><p></p></div>');
        const div = root.querySelector('div')!;
        div.prepend('<span></span>');
        expect(div.firstElementChild?.tagName).toBe('SPAN');
      });

      it('should have append', () => {
        const root = parse('<div><p></p></div>');
        const div = root.querySelector('div')!;
        div.append('<span></span>');
        expect(div.lastElementChild?.tagName).toBe('SPAN');
      });

      it('should have before', () => {
        const root = parse('<div><p></p></div>');
        const p = root.querySelector('p')!;
        p.before('<span></span>');
        expect(root.querySelector('div')?.firstElementChild?.tagName).toBe('SPAN');
      });

      it('should have after', () => {
        const root = parse('<div><p></p></div>');
        const p = root.querySelector('p')!;
        p.after('<span></span>');
        expect(root.querySelector('div')?.lastElementChild?.tagName).toBe('SPAN');
      });

      it('should have insertAdjacentHTML', () => {
        const root = parse('<div><p></p></div>');
        const p = root.querySelector('p')!;
        p.insertAdjacentHTML('beforebegin', '<span></span>');
        expect(root.querySelector('div')?.firstElementChild?.tagName).toBe('SPAN');
      });

      it('should have set_content', () => {
        const root = parse('<div><p></p></div>');
        const div = root.querySelector('div')!;
        div.set_content('<span></span>');
        expect(div.firstElementChild?.tagName).toBe('SPAN');
      });
    });

    describe('Other Methods', () => {
      it('should have toString', () => {
        const el = parse('<div></div>').querySelector('div')!;
        expect(el.toString()).toBe('<div></div>');
      });

      it('should have clone', () => {
        const el = parse('<div class="test"><p></p></div>').querySelector('div')!;
        const clone = el.clone() as HTMLElement;
        expect(clone.getAttribute('class')).toBe('test');
        expect(clone).not.toBe(el);
      });

      it('should have trimRight', () => {
        const root = parse('<div>before STOP after</div>');
        const div = root.querySelector('div')!;
        div.trimRight(/STOP/);
        expect(div.text).toBe('before ');
      });

      it('should have removeWhitespace', () => {
        const root = parse('<div>   text   </div>');
        const div = root.querySelector('div')!;
        div.removeWhitespace();
        expect(div.text).toBe('text');
      });
    });
  });

  // =============================================================================
  // TextNode API COMPATIBILITY
  // =============================================================================
  describe('TextNode API Compatibility', () => {

    it('should have nodeType', () => {
      const root = parse('<div>text</div>');
      const textNode = root.querySelector('div')!.firstChild!;
      expect(textNode.nodeType).toBe(NodeType.TEXT_NODE);
    });

    it('should have rawTagName as #text', () => {
      const root = parse('<div>text</div>');
      const textNode = root.querySelector('div')!.firstChild as TextNode;
      expect(textNode.rawTagName).toBe('#text');
    });

    it('should have text property', () => {
      const root = parse('<div>test</div>');
      const textNode = root.querySelector('div')!.firstChild as TextNode;
      expect(textNode.text).toBe('test');
    });

    it('should have rawText property', () => {
      const root = parse('<div>&amp;</div>');
      const textNode = root.querySelector('div')!.firstChild as TextNode;
      expect(textNode.rawText).toBe('&amp;');
    });

    it('should have isWhitespace', () => {
      const root = parse('<div>   </div>');
      const textNode = root.querySelector('div')!.firstChild as TextNode;
      expect(textNode.isWhitespace).toBe(true);
    });

    it('should have trimmedText', () => {
      const root = parse('<div>  text  </div>');
      const textNode = root.querySelector('div')!.firstChild as TextNode;
      expect(textNode.trimmedText).toBe('text');
    });

    it('should have trimmedRawText', () => {
      const root = parse('<div>  text  </div>');
      const textNode = root.querySelector('div')!.firstChild as TextNode;
      expect(textNode.trimmedRawText).toBe('text');
    });

    it('should have toString', () => {
      const root = parse('<div>text</div>');
      const textNode = root.querySelector('div')!.firstChild as TextNode;
      expect(textNode.toString()).toBe('text');
    });

    it('should have clone', () => {
      const root = parse('<div>text</div>');
      const textNode = root.querySelector('div')!.firstChild as TextNode;
      const clone = textNode.clone() as TextNode;
      expect(clone.text).toBe('text');
      expect(clone).not.toBe(textNode);
    });

    it('should have remove', () => {
      const root = parse('<div>text<p></p></div>');
      const div = root.querySelector('div')!;
      const textNode = div.firstChild as TextNode;
      textNode.remove();
      expect(div.childNodes.length).toBe(1);
    });
  });

  // =============================================================================
  // classList API COMPATIBILITY
  // =============================================================================
  describe('classList API Compatibility', () => {

    it('should have add method', () => {
      const el = parse('<div></div>').querySelector('div')!;
      el.classList.add('test');
      expect(el.classList.contains('test')).toBe(true);
    });

    it('should have remove method', () => {
      const el = parse('<div class="test"></div>').querySelector('div')!;
      el.classList.remove('test');
      expect(el.classList.contains('test')).toBe(false);
    });

    it('should have toggle method', () => {
      const el = parse('<div></div>').querySelector('div')!;
      el.classList.toggle('test');
      expect(el.classList.contains('test')).toBe(true);
      el.classList.toggle('test');
      expect(el.classList.contains('test')).toBe(false);
    });

    it('should have replace method', () => {
      const el = parse('<div class="old"></div>').querySelector('div')!;
      el.classList.replace('old', 'new');
      expect(el.classList.contains('old')).toBe(false);
      expect(el.classList.contains('new')).toBe(true);
    });

    it('should have contains method', () => {
      const el = parse('<div class="test"></div>').querySelector('div')!;
      expect(el.classList.contains('test')).toBe(true);
      expect(el.classList.contains('other')).toBe(false);
    });

    it('should have length property', () => {
      const el = parse('<div class="a b c"></div>').querySelector('div')!;
      expect(el.classList.length).toBe(3);
    });

    it('should have values method', () => {
      const el = parse('<div class="a b"></div>').querySelector('div')!;
      const values = Array.from(el.classList.values());
      expect(values).toContain('a');
      expect(values).toContain('b');
    });

    it('should have value property', () => {
      const el = parse('<div class="a b"></div>').querySelector('div')!;
      expect(Array.isArray(el.classList.value)).toBe(true);
      expect(el.classList.value).toContain('a');
    });

    it('should have toString method', () => {
      const el = parse('<div class="a b"></div>').querySelector('div')!;
      const str = el.classList.toString();
      expect(str).toContain('a');
      expect(str).toContain('b');
    });
  });

  // =============================================================================
  // NodeType COMPATIBILITY
  // =============================================================================
  describe('NodeType Compatibility', () => {

    it('should export ELEMENT_NODE', () => {
      expect(NodeType.ELEMENT_NODE).toBe(1);
    });

    it('should export TEXT_NODE', () => {
      expect(NodeType.TEXT_NODE).toBe(3);
    });

    it('should export COMMENT_NODE', () => {
      expect(NodeType.COMMENT_NODE).toBe(8);
    });
  });

  // =============================================================================
  // DEFAULT VALUES COMPATIBILITY
  // =============================================================================
  describe('Default Values Compatibility', () => {

    it('should have default void tags', () => {
      const voidTags = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
      voidTags.forEach(tag => {
        const root = parse(`<${tag}>`);
        const el = root.querySelector(tag);
        expect(el?.isVoidElement).toBe(true);
      });
    });

    it('should have default blockTextElements', () => {
      const blockTextElements = ['script', 'noscript', 'style', 'pre'];
      blockTextElements.forEach(tag => {
        const root = parse(`<${tag}><div></div></${tag}>`);
        // Content inside should not be parsed as HTML
        expect(root.querySelectorAll('div').length).toBe(0);
      });
    });

    it('should not include comments by default', () => {
      const root = parse('<!-- comment --><div></div>');
      // Should have only the div, not the comment
      expect(root.childNodes.length).toBe(1);
    });

    it('should not lowercase tag names by default', () => {
      const root = parse('<DIV></DIV>');
      const div = root.querySelector('div');
      expect(div?.rawTagName).toBe('DIV');
    });
  });

});

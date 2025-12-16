import { describe, it, expect } from 'vitest';
import { parse, NodeType } from '../../../src/scrape/parser/index.js';
import Matcher from '../../../src/scrape/parser/matcher.js';

describe('Matcher adapter functions', () => {
  describe('isTag', () => {
    it('should return true for element nodes', () => {
      const root = parse('<div>test</div>');
      const div = root.querySelector('div')!;

      expect(Matcher.isTag(div)).toBe(true);
    });

    it('should return false for text nodes', () => {
      const root = parse('<div>test</div>');
      const div = root.querySelector('div')!;
      const textNode = div.childNodes[0];

      expect(Matcher.isTag(textNode)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(Matcher.isTag(null as any)).toBe(false);
      expect(Matcher.isTag(undefined as any)).toBe(false);
    });
  });

  describe('getAttributeValue', () => {
    it('should return attribute value', () => {
      const root = parse('<div data-id="123">test</div>');
      const div = root.querySelector('div')!;

      expect(Matcher.getAttributeValue(div, 'data-id')).toBe('123');
    });

    it('should return undefined for missing attribute', () => {
      const root = parse('<div>test</div>');
      const div = root.querySelector('div')!;

      expect(Matcher.getAttributeValue(div, 'data-missing')).toBeUndefined();
    });
  });

  describe('getName', () => {
    it('should return lowercase tag name', () => {
      const root = parse('<DIV>test</DIV>');
      const div = root.querySelector('div')!;

      expect(Matcher.getName(div)).toBe('div');
    });

    it('should return empty string for missing tag', () => {
      expect(Matcher.getName(null as any)).toBe('');
    });
  });

  describe('getChildren', () => {
    it('should return child nodes', () => {
      const root = parse('<div><p>1</p><p>2</p></div>');
      const div = root.querySelector('div')!;

      const children = Matcher.getChildren(div);
      expect(children.length).toBe(2);
    });

    it('should handle node without children', () => {
      const root = parse('<br/>');
      const br = root.querySelector('br')!;

      const children = Matcher.getChildren(br);
      expect(children.length).toBe(0);
    });
  });

  describe('getParent', () => {
    it('should return parent node', () => {
      const root = parse('<div><p>test</p></div>');
      const p = root.querySelector('p')!;

      const parent = Matcher.getParent(p);
      expect(parent?.rawTagName).toBe('div');
    });

    it('should return null for root', () => {
      const root = parse('<div>test</div>');
      // Root element has no parent
      expect(Matcher.getParent(null as any)).toBeNull();
    });
  });

  describe('getText', () => {
    it('should return text content', () => {
      const root = parse('<p>Hello World</p>');
      const p = root.querySelector('p')!;

      expect(Matcher.getText(p)).toBe('Hello World');
    });

    it('should return nested text content', () => {
      const root = parse('<p>Hello <strong>World</strong>!</p>');
      const p = root.querySelector('p')!;

      expect(Matcher.getText(p)).toContain('Hello');
      expect(Matcher.getText(p)).toContain('World');
    });
  });

  describe('removeSubsets', () => {
    it('should remove duplicate parent-child relationships', () => {
      const root = parse('<div class="parent"><div class="child"></div></div>');
      const parent = root.querySelector('.parent')!;
      const child = root.querySelector('.child')!;

      // Both elements match, but child is a subset of parent
      const nodes = [parent, child];
      const result = Matcher.removeSubsets([...nodes]);

      // Child should be removed as it's a subset of parent
      expect(result.length).toBe(1);
      expect(result[0]).toBe(parent);
    });

    it('should keep unrelated nodes', () => {
      const root = parse('<div><p id="a">A</p><p id="b">B</p></div>');
      const a = root.querySelector('#a')!;
      const b = root.querySelector('#b')!;

      // Both are siblings, neither is subset of other
      const result = Matcher.removeSubsets([a, b]);
      expect(result.length).toBe(2);
    });

    it('should handle empty array', () => {
      const result = Matcher.removeSubsets([]);
      expect(result.length).toBe(0);
    });

    it('should handle deeply nested subsets', () => {
      const root = parse(`
        <div class="level1">
          <div class="level2">
            <div class="level3">
              <p>Deep</p>
            </div>
          </div>
        </div>
      `);

      const level1 = root.querySelector('.level1')!;
      const level2 = root.querySelector('.level2')!;
      const level3 = root.querySelector('.level3')!;

      // All are nested, only level1 should remain
      const result = Matcher.removeSubsets([level1, level2, level3]);
      expect(result.length).toBe(1);
      expect(result[0]).toBe(level1);
    });
  });

  describe('existsOne', () => {
    it('should return true if element matches predicate', () => {
      const root = parse('<div><p class="target">test</p></div>');
      const div = root.querySelector('div')!;

      const predicate = ((node: any) => {
        return node.nodeType === NodeType.ELEMENT_NODE && node.classList.contains('target');
      }) as any;

      expect(Matcher.existsOne(predicate, div.childNodes)).toBe(true);
    });

    it('should return false if no element matches', () => {
      const root = parse('<div><p>test</p></div>');
      const div = root.querySelector('div')!;

      const predicate = ((node: any) => {
        return node.nodeType === NodeType.ELEMENT_NODE && node.classList.contains('missing');
      }) as any;

      expect(Matcher.existsOne(predicate, div.childNodes)).toBe(false);
    });

    it('should search recursively in children', () => {
      const root = parse('<div><section><article><span class="deep">found</span></article></section></div>');
      const div = root.querySelector('div')!;

      const predicate = ((node: any) => {
        return node.nodeType === NodeType.ELEMENT_NODE && node.classList.contains('deep');
      }) as any;

      // Should find .deep even though it's deeply nested
      expect(Matcher.existsOne(predicate, div.childNodes)).toBe(true);
    });

    it('should return false for non-element nodes', () => {
      const root = parse('<p>text only</p>');
      const p = root.querySelector('p')!;

      // Text nodes shouldn't match element predicate
      const predicate = ((node: any) => {
        return node.nodeType === NodeType.ELEMENT_NODE;
      }) as any;

      // p's children are text nodes
      expect(Matcher.existsOne(predicate, p.childNodes)).toBe(false);
    });
  });

  describe('getSiblings', () => {
    it('should return all siblings including self', () => {
      const root = parse('<div><p>1</p><p>2</p><p>3</p></div>');
      const middle = root.querySelectorAll('p')[1];

      const siblings = Matcher.getSiblings(middle);
      expect(siblings.length).toBe(3);
    });

    it('should return empty array for orphan node', () => {
      const siblings = Matcher.getSiblings({ parentNode: null } as any);
      expect(siblings).toEqual([]);
    });
  });

  describe('hasAttrib', () => {
    it('should return true for existing attribute', () => {
      const root = parse('<div data-test="value"></div>');
      const div = root.querySelector('div')!;

      expect(Matcher.hasAttrib(div, 'data-test')).toBe(true);
    });

    it('should return false for missing attribute', () => {
      const root = parse('<div></div>');
      const div = root.querySelector('div')!;

      expect(Matcher.hasAttrib(div, 'data-missing')).toBe(false);
    });
  });

  describe('findOne', () => {
    it('should find first matching element', () => {
      const root = parse('<div><p class="a">1</p><p class="a">2</p></div>');
      const div = root.querySelector('div')!;

      const predicate = ((node: any) => {
        return node.nodeType === NodeType.ELEMENT_NODE && node.classList.contains('a');
      }) as any;

      const result = Matcher.findOne(predicate, div.childNodes);
      expect(result?.text).toBe('1');
    });

    it('should return null if not found', () => {
      const root = parse('<div><p>test</p></div>');
      const div = root.querySelector('div')!;

      const predicate = ((node: any) => {
        return node.nodeType === NodeType.ELEMENT_NODE && node.classList.contains('missing');
      }) as any;

      expect(Matcher.findOne(predicate, div.childNodes)).toBeNull();
    });

    it('should search recursively', () => {
      const root = parse('<div><section><article><span class="target">found</span></article></section></div>');
      const div = root.querySelector('div')!;

      const predicate = ((node: any) => {
        return node.nodeType === NodeType.ELEMENT_NODE && node.classList.contains('target');
      }) as any;

      const result = Matcher.findOne(predicate, div.childNodes);
      expect(result?.text).toBe('found');
    });

    it('should handle null/undefined input', () => {
      const predicate = ((node: any) => true) as any;
      expect(Matcher.findOne(predicate, null as any)).toBeNull();
      expect(Matcher.findOne(predicate, undefined as any)).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should find all matching elements', () => {
      const root = parse('<div><p class="item">1</p><p class="item">2</p><span>3</span></div>');
      const div = root.querySelector('div')!;

      const predicate = ((node: any) => {
        return node.nodeType === NodeType.ELEMENT_NODE && node.classList.contains('item');
      }) as any;

      const result = Matcher.findAll(predicate, div.childNodes);
      expect(result.length).toBe(2);
    });

    it('should return empty array if none match', () => {
      const root = parse('<div><p>test</p></div>');
      const div = root.querySelector('div')!;

      const predicate = ((node: any) => {
        return node.nodeType === NodeType.ELEMENT_NODE && node.classList.contains('missing');
      }) as any;

      expect(Matcher.findAll(predicate, div.childNodes)).toEqual([]);
    });

    it('should search recursively', () => {
      const root = parse(`
        <div>
          <p class="item">1</p>
          <section>
            <p class="item">2</p>
            <article>
              <p class="item">3</p>
            </article>
          </section>
        </div>
      `);
      const div = root.querySelector('div')!;

      const predicate = ((node: any) => {
        return node.nodeType === NodeType.ELEMENT_NODE && node.classList.contains('item');
      }) as any;

      const result = Matcher.findAll(predicate, div.childNodes);
      expect(result.length).toBe(3);
    });

    it('should skip non-element nodes', () => {
      const root = parse('<div>text<p class="item">1</p>more text</div>');
      const div = root.querySelector('div')!;

      const predicate = ((node: any) => {
        return node.nodeType === NodeType.ELEMENT_NODE && node.classList.contains('item');
      }) as any;

      // Should skip text nodes and only find the p
      const result = Matcher.findAll(predicate, div.childNodes);
      expect(result.length).toBe(1);
    });
  });
});

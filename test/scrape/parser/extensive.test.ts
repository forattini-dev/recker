import { describe, it, expect } from 'vitest';
import { parse, HTMLElement } from '../../../src/scrape/parser/index.js';

describe('Extensive HTML Parser Tests', () => {
  
  describe('1. Parsing Structure', () => {
    it('should parse nested elements correctly', () => {
      const html = '<div><p><span>Text</span></p></div>';
      const root = parse(html);
      const div = root.querySelector('div');
      expect(div).toBeTruthy();
      expect(div?.childNodes.length).toBe(1); // p
      const p = div?.firstChild as HTMLElement;
      expect(p.tagName).toBe('P');
      expect(p.childNodes.length).toBe(1); // span
    });

    it('should handle multiple siblings', () => {
      const html = '<ul><li>1</li><li>2</li><li>3</li></ul>';
      const root = parse(html);
      const lis = root.querySelectorAll('li');
      expect(lis.length).toBe(3);
      expect(lis[0].text).toBe('1');
      expect(lis[2].text).toBe('3');
    });
  });

  describe('2. Attributes Handling', () => {
    it('should parse quoted attributes', () => {
      const html = '<div class="foo bar" id="my-id"></div>';
      const div = parse(html).querySelector('div');
      expect(div?.getAttribute('class')).toBe('foo bar');
      expect(div?.getAttribute('id')).toBe('my-id');
    });

    it('should parse unquoted attributes', () => {
      const html = '<input type=checkbox value=yes>';
      const input = parse(html).querySelector('input');
      expect(input?.getAttribute('type')).toBe('checkbox');
      expect(input?.getAttribute('value')).toBe('yes');
    });

    it('should parse boolean attributes', () => {
      const html = '<input checked disabled>';
      const input = parse(html).querySelector('input');
      expect(input?.hasAttribute('checked')).toBe(true);
      expect(input?.hasAttribute('disabled')).toBe(true);
    });

    it('should handle attributes with special characters', () => {
      const html = '<div data-json=\'{"a":1}\' title="foo&quot;bar">';
      const div = parse(html).querySelector('div');
      // Note: Parser might return raw encoded string depending on implementation
      // Standard behavior is to decode entities in values
      const title = div?.getAttribute('title');
      expect(title === 'foo"bar' || title === 'foo&quot;bar').toBe(true);
    });
  });

  describe('3. Void Elements (Self-closing)', () => {
    it('should not nest elements inside void tags', () => {
      const html = '<div><br><span>Text</span></div>';
      const root = parse(html);
      const br = root.querySelector('br');
      
      expect(br?.childNodes.length).toBe(0); // BR should handle no children
      
      // Check if SPAN is sibling of BR, not child
      const div = root.querySelector('div');
      expect(div?.childNodes.length).toBe(2); // br, span
    });

    it('should handle img tags correctly', () => {
      const html = '<img src="a.jpg" alt="A">Text';
      const root = parse(html);
      const img = root.querySelector('img');
      expect(img?.getAttribute('src')).toBe('a.jpg');
      expect(root.text.trim()).toBe('Text');
    });
  });

  describe('4. Script & Style (Raw Text)', () => {
    it('should ignore tags inside script', () => {
      const html = '<script>if(a<b) { const x = "<div>"; }</script>';
      const root = parse(html);
      const script = root.querySelector('script');
      expect(script?.text).toContain('<div>');
      expect(root.querySelectorAll('div').length).toBe(0); // Should not find div inside script
    });

    it('should ignore tags inside style', () => {
      const html = '<style>body { content: "<p>"; }</style>';
      const root = parse(html);
      const style = root.querySelector('style');
      expect(style?.text).toContain('<p>');
      expect(root.querySelectorAll('p').length).toBe(0);
    });
  });

  describe('5. Selectors (querySelectorAll)', () => {
    const html = `
      <div id="main">
        <p class="text">Para 1</p>
        <p class="text highlight">Para 2</p>
        <span class="text">Span 1</span>
        <a href="https://example.com" target="_blank">Link</a>
        <input type="text" disabled>
      </div>
    `;
    const root = parse(html);

    it('should select by ID', () => {
      const el = root.querySelector('#main');
      expect(el).toBeTruthy();
      expect(el?.tagName).toBe('DIV');
    });

    it('should select by class', () => {
      expect(root.querySelectorAll('.text').length).toBe(3);
      expect(root.querySelectorAll('.highlight').length).toBe(1);
    });

    it('should select by tag', () => {
      expect(root.querySelectorAll('p').length).toBe(2);
    });

    it('should select by attribute presence', () => {
      expect(root.querySelectorAll('[href]').length).toBe(1);
      expect(root.querySelectorAll('[disabled]').length).toBe(1);
    });

    it('should select by attribute value', () => {
      expect(root.querySelectorAll('[target="_blank"]').length).toBe(1);
      expect(root.querySelectorAll('[type="text"]').length).toBe(1);
    });
    
    // Descendant selector might be tricky for simple parsers
    it('should select descendants (space)', () => {
      const p = root.querySelectorAll('#main p');
      expect(p.length).toBe(2);
    });
  });

  describe('6. Resilience (Malformed HTML)', () => {
    it('should handle unclosed tags', () => {
      const html = '<div><p>1<p>2</div>'; // Unclosed P
      const root = parse(html);
      const ps = root.querySelectorAll('p');
      // Browsers would treat this as siblings <p>1</p><p>2</p> inside div
      // Or nested <p>1<p>2</p></p> depending on parser
      // Simple expectation: we find 2 Ps
      expect(ps.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('7. Manipulation', () => {
    it('should remove elements', () => {
      const html = '<div><script>bad</script><p>Text</p></div>';
      const root = parse(html);
      
      const script = root.querySelector('script');
      expect(script).toBeTruthy();
      
      // Try remove method if available on the parser node
      if (script && typeof (script as any).remove === 'function') {
          (script as any).remove();
      } else if (script && script.parentNode) {
          script.parentNode.removeChild(script);
      }

      // Verify removal
      expect(root.querySelectorAll('script').length).toBe(0);
      expect(root.text.trim()).toBe('Text');
    });
  });
  
});

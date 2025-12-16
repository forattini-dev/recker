/**
 * ScrapeElement - Chainable wrapper for HTML elements
 *
 * Provides jQuery-like traversal and extraction methods using internal parser.
 */

import { is } from 'css-select';
import {
  HTMLElement,
  Node,
  NodeType,
  parse,
} from './parser/index.js';
import Matcher from './parser/matcher.js';

export class ScrapeElement {
  private elements: HTMLElement[];

  constructor(elements: HTMLElement | HTMLElement[] | Node | Node[]) {
    if (Array.isArray(elements)) {
      this.elements = (elements as Node[]).filter(
        (el): el is HTMLElement => el.nodeType === NodeType.ELEMENT_NODE
      );
    } else {
      this.elements =
        elements.nodeType === NodeType.ELEMENT_NODE
          ? [elements as HTMLElement]
          : [];
    }
  }

  // === Traversal Methods (chainable) ===

  /**
   * Find descendants matching selector
   */
  find(selector: string): ScrapeElement {
    const found: HTMLElement[] = [];
    this.elements.forEach((el) => {
      found.push(...el.querySelectorAll(selector));
    });
    // Deduplicate? querySelectorAll usually returns unique nodes per root, but multiple roots might overlap?
    // For now simple concat.
    return new ScrapeElement(found);
  }

  /**
   * Get parent element
   */
  parent(selector?: string): ScrapeElement {
    const parents: HTMLElement[] = [];
    this.elements.forEach((el) => {
      const p = el.parentNode;
      if (p && p.nodeType === NodeType.ELEMENT_NODE) {
        if (!selector || is(p, selector, { adapter: Matcher })) {
          if (!parents.includes(p as HTMLElement)) {
            parents.push(p as HTMLElement);
          }
        }
      }
    });
    return new ScrapeElement(parents);
  }

  /**
   * Get direct children
   */
  children(selector?: string): ScrapeElement {
    const children: HTMLElement[] = [];
    this.elements.forEach((el) => {
      el.childNodes.forEach((child) => {
        if (child.nodeType === NodeType.ELEMENT_NODE) {
          const childEl = child as HTMLElement;
          if (!selector || is(childEl, selector, { adapter: Matcher })) {
            children.push(childEl);
          }
        }
      });
    });
    return new ScrapeElement(children);
  }

  /**
   * Get sibling elements
   */
  siblings(selector?: string): ScrapeElement {
    const siblings: HTMLElement[] = [];
    this.elements.forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        parent.childNodes.forEach((child) => {
          if (
            child !== el &&
            child.nodeType === NodeType.ELEMENT_NODE
          ) {
            const childEl = child as HTMLElement;
            if (!selector || is(childEl, selector, { adapter: Matcher })) {
              if (!siblings.includes(childEl)) {
                siblings.push(childEl);
              }
            }
          }
        });
      }
    });
    return new ScrapeElement(siblings);
  }

  /**
   * Get next sibling
   */
  next(selector?: string): ScrapeElement {
    const nexts: HTMLElement[] = [];
    this.elements.forEach((el) => {
      let curr = el.nextElementSibling;
      while (curr) {
        if (!selector || is(curr, selector, { adapter: Matcher })) {
          nexts.push(curr);
          break; // jQuery next() only gets the *immediately* following sibling if it matches? No, next() is immediate sibling.
          // If selector is provided, it filters the immediate sibling.
        }
        // If immediate sibling doesn't match selector, jQuery next(sel) returns empty?
        // Yes: "Get the immediately following sibling of each element in the set of matched elements. If a selector is provided, it retrieves the next sibling only if it matches that selector."
        break;
      }
    });
    return new ScrapeElement(nexts);
  }

  /**
   * Get previous sibling
   */
  prev(selector?: string): ScrapeElement {
    const prevs: HTMLElement[] = [];
    this.elements.forEach((el) => {
      let curr = el.previousElementSibling;
      if (curr) {
        if (!selector || is(curr, selector, { adapter: Matcher })) {
          prevs.push(curr);
        }
      }
    });
    return new ScrapeElement(prevs);
  }

  /**
   * Get all next siblings
   */
  nextAll(selector?: string): ScrapeElement {
    const nexts: HTMLElement[] = [];
    this.elements.forEach((el) => {
      let curr = el.nextElementSibling;
      while (curr) {
        if (!selector || is(curr, selector, { adapter: Matcher })) {
          nexts.push(curr);
        }
        curr = curr.nextElementSibling;
      }
    });
    return new ScrapeElement(nexts);
  }

  /**
   * Get all previous siblings
   */
  prevAll(selector?: string): ScrapeElement {
    const prevs: HTMLElement[] = [];
    this.elements.forEach((el) => {
      let curr = el.previousElementSibling;
      while (curr) {
        if (!selector || is(curr, selector, { adapter: Matcher })) {
          prevs.push(curr);
        }
        curr = curr.previousElementSibling;
      }
    });
    return new ScrapeElement(prevs);
  }

  /**
   * Find closest ancestor matching selector
   */
  closest(selector: string): ScrapeElement {
    const closests: HTMLElement[] = [];
    this.elements.forEach((el) => {
      const found = el.closest(selector);
      if (found) {
        if (!closests.includes(found)) {
          closests.push(found);
        }
      }
    });
    return new ScrapeElement(closests);
  }

  /**
   * Get first element
   */
  first(): ScrapeElement {
    return new ScrapeElement(this.elements.slice(0, 1));
  }

  /**
   * Get last element
   */
  last(): ScrapeElement {
    return new ScrapeElement(this.elements.slice(-1));
  }

  /**
   * Get element at index
   */
  eq(index: number): ScrapeElement {
    if (index < 0) index = this.elements.length + index;
    return new ScrapeElement(this.elements.slice(index, index + 1));
  }

  /**
   * Filter elements by selector or callback function
   */
  filter(selectorOrCallback: string | ((el: ScrapeElement, index: number) => boolean)): ScrapeElement {
    if (typeof selectorOrCallback === 'string') {
      const filtered = this.elements.filter((el) =>
        is(el, selectorOrCallback, { adapter: Matcher })
      );
      return new ScrapeElement(filtered);
    } else {
      const filtered = this.elements.filter((el, index) =>
        selectorOrCallback(new ScrapeElement(el), index)
      );
      return new ScrapeElement(filtered);
    }
  }

  /**
   * Exclude elements matching selector
   */
  not(selector: string): ScrapeElement {
    const filtered = this.elements.filter(
      (el) => !is(el, selector, { adapter: Matcher })
    );
    return new ScrapeElement(filtered);
  }

  /**
   * Check if any element has a specific selector
   */
  has(selector: string): ScrapeElement {
    const has = this.elements.filter((el) => {
      return el.querySelector(selector) !== null;
    });
    return new ScrapeElement(has);
  }

  /**
   * Add elements to the current selection
   */
  add(selector: string): ScrapeElement {
    // This is tricky without reference to root document.
    // jQuery add(selector) adds elements matching selector from the document?
    // Or creates elements?
    // Since we don't have reference to "root" here easily unless we store it,
    // this might be limited.
    // For now, let's assume this is not fully supported or we just parse string if it looks like HTML.
    if (selector.trim().startsWith('<')) {
        const parsed = parse(selector);
        return new ScrapeElement([...this.elements, ...parsed.children as HTMLElement[]]);
    }
    // If it's a selector, we can't find it without context.
    // Retaining current elements.
    return this;
  }

  /**
   * Get all ancestors
   */
  parents(selector?: string): ScrapeElement {
    const parents: HTMLElement[] = [];
    this.elements.forEach((el) => {
      let p = el.parentNode;
      while (p && p.nodeType === NodeType.ELEMENT_NODE) {
        const pEl = p as HTMLElement;
        if (!selector || is(pEl, selector, { adapter: Matcher })) {
          if (!parents.includes(pEl)) {
            parents.push(pEl);
          }
        }
        p = p.parentNode;
      }
    });
    return new ScrapeElement(parents);
  }

  /**
   * Get all ancestors until (but not including) selector matches
   */
  parentsUntil(selector: string): ScrapeElement {
    const parents: HTMLElement[] = [];
    this.elements.forEach((el) => {
      let p = el.parentNode;
      while (p && p.nodeType === NodeType.ELEMENT_NODE) {
        const pEl = p as HTMLElement;
        // Stop when we hit the selector (don't include it)
        if (is(pEl, selector, { adapter: Matcher })) {
          break;
        }
        if (!parents.includes(pEl)) {
          parents.push(pEl);
        }
        p = p.parentNode;
      }
    });
    return new ScrapeElement(parents);
  }

  /**
   * Get all next siblings until (but not including) selector matches
   */
  nextUntil(selector: string): ScrapeElement {
    const nexts: HTMLElement[] = [];
    this.elements.forEach((el) => {
      let curr = el.nextElementSibling;
      while (curr) {
        // Stop when we hit the selector (don't include it)
        if (is(curr, selector, { adapter: Matcher })) {
          break;
        }
        nexts.push(curr);
        curr = curr.nextElementSibling;
      }
    });
    return new ScrapeElement(nexts);
  }

  /**
   * Get all previous siblings until (but not including) selector matches
   */
  prevUntil(selector: string): ScrapeElement {
    const prevs: HTMLElement[] = [];
    this.elements.forEach((el) => {
      let curr = el.previousElementSibling;
      while (curr) {
        // Stop when we hit the selector (don't include it)
        if (is(curr, selector, { adapter: Matcher })) {
          break;
        }
        prevs.push(curr);
        curr = curr.previousElementSibling;
      }
    });
    return new ScrapeElement(prevs);
  }

  /**
   * Get a slice of elements
   */
  slice(start: number, end?: number): ScrapeElement {
    return new ScrapeElement(this.elements.slice(start, end));
  }

  /**
   * Get contents (including text nodes)
   * Note: This returns raw nodes, but we wrap them in ScrapeElement which expects HTMLElement.
   * We might need to adjust ScrapeElement to hold Nodes if we want to support text nodes here.
   * But for now, let's filter only Elements to be safe, or cast.
   */
  contents(): ScrapeElement {
     const contents: HTMLElement[] = []; // ignoring text nodes for ScrapeElement wrapper compatibility
     this.elements.forEach(el => {
         el.childNodes.forEach(child => {
             if (child.nodeType === NodeType.ELEMENT_NODE) {
                 contents.push(child as HTMLElement);
             }
         });
     });
    return new ScrapeElement(contents);
  }

  // === Content Extraction ===

  /**
   * Get combined text content
   */
  text(): string {
    return this.elements.map((el) => el.text).join('');
  }

  /**
   * Get inner HTML
   */
  html(): string | null {
    if (this.elements.length > 0) {
      return this.elements[0].innerHTML;
    }
    return null;
  }

  /**
   * Get outer HTML (including the element itself)
   */
  outerHtml(): string {
    if (this.elements.length > 0) {
      return this.elements[0].outerHTML;
    }
    return '';
  }

  /**
   * Get attribute value
   */
  attr(name: string): string | undefined {
    if (this.elements.length > 0) {
      return this.elements[0].getAttribute(name);
    }
    return undefined;
  }

  /**
   * Get all attributes as object
   */
  attrs(): Record<string, string> {
    if (this.elements.length > 0) {
      return this.elements[0].attributes;
    }
    return {};
  }

  /**
   * Get data attribute(s)
   */
  data(name?: string): unknown {
    if (this.elements.length === 0) return undefined;
    const el = this.elements[0];
    const attrs = el.attributes;
    
    if (name) {
        return attrs[`data-${name}`];
    }
    
    const dataAttrs: Record<string, string> = {};
    for (const key in attrs) {
        if (key.startsWith('data-')) {
            const shortKey = key.slice(5);
            dataAttrs[shortKey] = attrs[key];
        }
    }
    return dataAttrs;
  }

  /**
   * Get form element value
   */
  val(): string | string[] | undefined {
    if (this.elements.length === 0) return undefined;
    const el = this.elements[0];
    if (el.tagName === 'INPUT') {
        return el.getAttribute('value');
    }
    if (el.tagName === 'TEXTAREA') {
        return el.text;
    }
    if (el.tagName === 'SELECT') {
        const option = el.querySelector('option[selected]') || el.querySelector('option');
        return option ? option.getAttribute('value') ?? option.text : undefined;
    }
    return el.getAttribute('value');
  }

  /**
   * Get prop value
   */
  prop(name: string): unknown {
     if (this.elements.length === 0) return undefined;
     const el = this.elements[0];
     if (name === 'tagName') return el.tagName;
     // Simple property access if it exists on HTMLElement
     if (name in el) return (el as any)[name];
     return this.attr(name);
  }

  // === State Methods ===

  /**
   * Check if selection contains elements
   */
  exists(): boolean {
    return this.elements.length > 0;
  }

  /**
   * Get number of elements in selection
   */
  get length(): number {
    return this.elements.length;
  }

  /**
   * Check if element matches selector
   */
  is(selector: string): boolean {
    return this.elements.some((el) => is(el, selector, { adapter: Matcher }));
  }

  /**
   * Check if element has class
   */
  hasClass(className: string): boolean {
    return this.elements.some((el) => el.classList.contains(className));
  }

  /**
   * Get element index within parent
   */
  index(selector?: string): number {
      if (this.elements.length === 0) return -1;
      const el = this.elements[0];
      const parent = el.parentNode;
      if (!parent) return 0;
      
      const siblings = parent.childNodes.filter(n => n.nodeType === NodeType.ELEMENT_NODE);
      if (selector) {
          // Find index relative to siblings matching selector?
          // jQuery: "If a selector is passed... return value is an integer indicating the position of the first element within the matched set relative to the elements that match the selector."
          // Too complex to fully replicate perfectly without context.
          return siblings.findIndex(s => s === el); 
      }
      return siblings.indexOf(el);
  }

  // === Iteration Methods ===

  /**
   * Iterate over each element
   */
  each(callback: (el: ScrapeElement, index: number) => void): this {
    this.elements.forEach((el, index) => {
      callback(new ScrapeElement(el), index);
    });
    return this;
  }

  /**
   * Map elements to values
   */
  map<T>(callback: (el: ScrapeElement, index: number) => T): T[] {
    return this.elements.map((el, index) => {
      return callback(new ScrapeElement(el), index);
    });
  }

  /**
   * Convert selection to array of ScrapeElement
   */
  toArray(): ScrapeElement[] {
    return this.elements.map((el) => new ScrapeElement(el));
  }

  /**
   * Reduce elements to a single value
   */
  reduce<T>(
    callback: (acc: T, el: ScrapeElement, index: number) => T,
    initialValue: T
  ): T {
    let accumulator = initialValue;
    this.elements.forEach((el, index) => {
      accumulator = callback(accumulator, new ScrapeElement(el), index);
    });
    return accumulator;
  }

  /**
   * Check if any element matches predicate
   */
  some(callback: (el: ScrapeElement, index: number) => boolean): boolean {
    return this.elements.some((el, index) =>
      callback(new ScrapeElement(el), index)
    );
  }

  /**
   * Check if all elements match predicate
   */
  every(callback: (el: ScrapeElement, index: number) => boolean): boolean {
    return this.elements.every((el, index) =>
      callback(new ScrapeElement(el), index)
    );
  }

  // === Utility Methods ===

  /**
   * Get the tag name of the first element
   */
  tagName(): string | undefined {
    if (this.elements.length > 0) {
      return this.elements[0].tagName?.toLowerCase();
    }
    return undefined;
  }

  /**
   * Clone the current selection
   */
  clone(): ScrapeElement {
    const clones = this.elements.map(el => el.clone());
    return new ScrapeElement(clones);
  }

  /**
   * Get serialized representation
   */
  toString(): string {
    return this.outerHtml();
  }

  // === Raw Access ===

  /**
   * Get underlying elements
   */
  get raw(): HTMLElement[] {
    return this.elements;
  }

  /**
   * Get the raw DOM element at index
   */
  get(index: number = 0): HTMLElement | undefined {
    return this.elements[index];
  }
}
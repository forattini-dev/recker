/**
 * ScrapeElement - Chainable wrapper for Cheerio elements
 *
 * Provides jQuery-like traversal and extraction methods.
 */

import type { Cheerio, CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';

export class ScrapeElement {
  private $el: Cheerio<Element>;
  private $: CheerioAPI;

  constructor($el: Cheerio<Element>, $: CheerioAPI) {
    this.$el = $el;
    this.$ = $;
  }

  // === Traversal Methods (chainable) ===

  /**
   * Find descendants matching selector
   */
  find(selector: string): ScrapeElement {
    return new ScrapeElement(this.$el.find(selector) as Cheerio<Element>, this.$);
  }

  /**
   * Get parent element
   */
  parent(selector?: string): ScrapeElement {
    const parent = selector ? this.$el.parent(selector) : this.$el.parent();
    return new ScrapeElement(parent as Cheerio<Element>, this.$);
  }

  /**
   * Get direct children
   */
  children(selector?: string): ScrapeElement {
    const children = selector ? this.$el.children(selector) : this.$el.children();
    return new ScrapeElement(children as Cheerio<Element>, this.$);
  }

  /**
   * Get sibling elements
   */
  siblings(selector?: string): ScrapeElement {
    const siblings = selector ? this.$el.siblings(selector) : this.$el.siblings();
    return new ScrapeElement(siblings as Cheerio<Element>, this.$);
  }

  /**
   * Get next sibling
   */
  next(selector?: string): ScrapeElement {
    const next = selector ? this.$el.next(selector) : this.$el.next();
    return new ScrapeElement(next as Cheerio<Element>, this.$);
  }

  /**
   * Get previous sibling
   */
  prev(selector?: string): ScrapeElement {
    const prev = selector ? this.$el.prev(selector) : this.$el.prev();
    return new ScrapeElement(prev as Cheerio<Element>, this.$);
  }

  /**
   * Get all next siblings
   */
  nextAll(selector?: string): ScrapeElement {
    const nextAll = selector ? this.$el.nextAll(selector) : this.$el.nextAll();
    return new ScrapeElement(nextAll as Cheerio<Element>, this.$);
  }

  /**
   * Get all previous siblings
   */
  prevAll(selector?: string): ScrapeElement {
    const prevAll = selector ? this.$el.prevAll(selector) : this.$el.prevAll();
    return new ScrapeElement(prevAll as Cheerio<Element>, this.$);
  }

  /**
   * Find closest ancestor matching selector
   */
  closest(selector: string): ScrapeElement {
    return new ScrapeElement(this.$el.closest(selector) as Cheerio<Element>, this.$);
  }

  /**
   * Get first element
   */
  first(): ScrapeElement {
    return new ScrapeElement(this.$el.first() as Cheerio<Element>, this.$);
  }

  /**
   * Get last element
   */
  last(): ScrapeElement {
    return new ScrapeElement(this.$el.last() as Cheerio<Element>, this.$);
  }

  /**
   * Get element at index
   */
  eq(index: number): ScrapeElement {
    return new ScrapeElement(this.$el.eq(index) as Cheerio<Element>, this.$);
  }

  /**
   * Filter elements by selector
   */
  filter(selector: string): ScrapeElement {
    return new ScrapeElement(this.$el.filter(selector) as Cheerio<Element>, this.$);
  }

  /**
   * Exclude elements matching selector
   */
  not(selector: string): ScrapeElement {
    return new ScrapeElement(this.$el.not(selector) as Cheerio<Element>, this.$);
  }

  /**
   * Check if any element has a specific selector
   */
  has(selector: string): ScrapeElement {
    return new ScrapeElement(this.$el.has(selector) as Cheerio<Element>, this.$);
  }

  /**
   * Add elements to the current selection
   */
  add(selector: string): ScrapeElement {
    return new ScrapeElement(this.$el.add(selector) as Cheerio<Element>, this.$);
  }

  /**
   * Get all ancestors
   */
  parents(selector?: string): ScrapeElement {
    const parents = selector ? this.$el.parents(selector) : this.$el.parents();
    return new ScrapeElement(parents as Cheerio<Element>, this.$);
  }

  /**
   * Get contents (including text nodes)
   */
  contents(): ScrapeElement {
    return new ScrapeElement(this.$el.contents() as unknown as Cheerio<Element>, this.$);
  }

  // === Content Extraction ===

  /**
   * Get combined text content
   */
  text(): string {
    return this.$el.text().trim();
  }

  /**
   * Get inner HTML
   */
  html(): string | null {
    return this.$el.html();
  }

  /**
   * Get outer HTML (including the element itself)
   */
  outerHtml(): string {
    return this.$.html(this.$el) || '';
  }

  /**
   * Get attribute value
   */
  attr(name: string): string | undefined {
    return this.$el.attr(name);
  }

  /**
   * Get all attributes as object
   */
  attrs(): Record<string, string> {
    const attributes: Record<string, string> = {};
    const el = this.$el.get(0);
    if (el && 'attribs' in el) {
      Object.assign(attributes, el.attribs);
    }
    return attributes;
  }

  /**
   * Get data attribute(s)
   */
  data(name?: string): unknown {
    if (name) {
      return this.$el.data(name);
    }
    return this.$el.data();
  }

  /**
   * Get form element value
   */
  val(): string | string[] | undefined {
    return this.$el.val();
  }

  /**
   * Get prop value
   */
  prop(name: string): unknown {
    return this.$el.prop(name);
  }

  // === State Methods ===

  /**
   * Check if selection contains elements
   */
  exists(): boolean {
    return this.$el.length > 0;
  }

  /**
   * Get number of elements in selection
   */
  get length(): number {
    return this.$el.length;
  }

  /**
   * Check if element matches selector
   */
  is(selector: string): boolean {
    return this.$el.is(selector);
  }

  /**
   * Check if element has class
   */
  hasClass(className: string): boolean {
    return this.$el.hasClass(className);
  }

  /**
   * Get element index within parent
   */
  index(selector?: string): number {
    return selector ? this.$el.index(selector) : this.$el.index();
  }

  // === Iteration Methods ===

  /**
   * Iterate over each element
   */
  each(callback: (el: ScrapeElement, index: number) => void): this {
    this.$el.each((index, element) => {
      callback(new ScrapeElement(this.$(element) as Cheerio<Element>, this.$), index);
    });
    return this;
  }

  /**
   * Map elements to values
   */
  map<T>(callback: (el: ScrapeElement, index: number) => T): T[] {
    const results: T[] = [];
    this.$el.each((index, element) => {
      results.push(callback(new ScrapeElement(this.$(element) as Cheerio<Element>, this.$), index));
    });
    return results;
  }

  /**
   * Convert selection to array of ScrapeElement
   */
  toArray(): ScrapeElement[] {
    return this.$el.toArray().map((element) =>
      new ScrapeElement(this.$(element) as Cheerio<Element>, this.$)
    );
  }

  /**
   * Reduce elements to a single value
   */
  reduce<T>(callback: (acc: T, el: ScrapeElement, index: number) => T, initialValue: T): T {
    let accumulator = initialValue;
    this.$el.each((index, element) => {
      accumulator = callback(
        accumulator,
        new ScrapeElement(this.$(element) as Cheerio<Element>, this.$),
        index
      );
    });
    return accumulator;
  }

  /**
   * Check if any element matches predicate
   */
  some(callback: (el: ScrapeElement, index: number) => boolean): boolean {
    let found = false;
    this.$el.each((index, element) => {
      if (callback(new ScrapeElement(this.$(element) as Cheerio<Element>, this.$), index)) {
        found = true;
        return false; // Break iteration
      }
    });
    return found;
  }

  /**
   * Check if all elements match predicate
   */
  every(callback: (el: ScrapeElement, index: number) => boolean): boolean {
    let allMatch = true;
    this.$el.each((index, element) => {
      if (!callback(new ScrapeElement(this.$(element) as Cheerio<Element>, this.$), index)) {
        allMatch = false;
        return false; // Break iteration
      }
    });
    return allMatch;
  }

  // === Utility Methods ===

  /**
   * Get the tag name of the first element
   */
  tagName(): string | undefined {
    const el = this.$el.get(0);
    return el ? el.tagName?.toLowerCase() : undefined;
  }

  /**
   * Clone the current selection
   */
  clone(): ScrapeElement {
    return new ScrapeElement(this.$el.clone() as Cheerio<Element>, this.$);
  }

  /**
   * Get serialized representation
   */
  toString(): string {
    return this.outerHtml();
  }

  // === Raw Access ===

  /**
   * Get underlying Cheerio object
   */
  get raw(): Cheerio<Element> {
    return this.$el;
  }

  /**
   * Get the raw DOM element at index
   */
  get(index: number = 0): Element | undefined {
    return this.$el.get(index);
  }
}

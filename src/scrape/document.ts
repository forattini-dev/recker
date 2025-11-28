/**
 * ScrapeDocument - Main wrapper for HTML parsing and extraction
 *
 * Provides a rich API for querying, traversing, and extracting data from HTML documents.
 */

import { load, type CheerioAPI } from 'cheerio';
import type { Cheerio } from 'cheerio';
import type { Element } from 'domhandler';
import { ScrapeElement } from './element.js';
import {
  extractLinks,
  extractImages,
  extractMeta,
  extractOpenGraph,
  extractTwitterCard,
  extractJsonLd,
  extractForms,
  extractTables,
  extractScripts,
  extractStyles,
} from './extractors.js';
import type {
  ScrapeOptions,
  ExtractionSchema,
  ExtractionSchemaField,
  ExtractedLink,
  ExtractedImage,
  ExtractedMeta,
  OpenGraphData,
  TwitterCardData,
  JsonLdData,
  ExtractedForm,
  ExtractedTable,
  ExtractedScript,
  ExtractedStyle,
  LinkExtractionOptions,
  ImageExtractionOptions,
} from './types.js';

export class ScrapeDocument {
  private $: CheerioAPI;
  private options: ScrapeOptions;

  constructor(html: string, options?: ScrapeOptions) {
    this.$ = load(html);
    this.options = options || {};
  }

  // === Query Methods ===

  /**
   * Select all elements matching CSS selector (jQuery-like behavior)
   * Returns a ScrapeElement containing all matching elements that can be iterated
   */
  select(selector: string): ScrapeElement {
    return new ScrapeElement(this.$(selector) as Cheerio<Element>, this.$);
  }

  /**
   * Select first element matching CSS selector
   */
  selectFirst(selector: string): ScrapeElement {
    return new ScrapeElement(this.$(selector).first() as Cheerio<Element>, this.$);
  }

  /**
   * Select all elements matching CSS selector
   */
  selectAll(selector: string): ScrapeElement[] {
    const elements: ScrapeElement[] = [];
    this.$(selector).each((_, element) => {
      elements.push(new ScrapeElement(this.$(element) as Cheerio<Element>, this.$));
    });
    return elements;
  }

  /**
   * Alias for select (jQuery-style)
   */
  query(selector: string): ScrapeElement {
    return this.select(selector);
  }

  /**
   * Alias for selectAll (jQuery-style)
   */
  queryAll(selector: string): ScrapeElement[] {
    return this.selectAll(selector);
  }

  // === Quick Text Extraction ===

  /**
   * Get text content from first matching element
   */
  text(selector: string): string {
    return this.$(selector).first().text().trim();
  }

  /**
   * Get text content from all matching elements
   */
  texts(selector: string): string[] {
    const texts: string[] = [];
    this.$(selector).each((_, element) => {
      const text = this.$(element).text().trim();
      if (text) {
        texts.push(text);
      }
    });
    return texts;
  }

  /**
   * Get attribute value from first matching element
   */
  attr(selector: string, attribute: string): string | undefined {
    return this.$(selector).first().attr(attribute);
  }

  /**
   * Get attribute values from all matching elements
   */
  attrs(selector: string, attribute: string): string[] {
    const attrs: string[] = [];
    this.$(selector).each((_, element) => {
      const value = this.$(element).attr(attribute);
      if (value !== undefined) {
        attrs.push(value);
      }
    });
    return attrs;
  }

  /**
   * Get HTML content from first matching element
   */
  innerHtml(selector: string): string | null {
    return this.$(selector).first().html();
  }

  /**
   * Get outer HTML from first matching element
   */
  outerHtml(selector: string): string {
    const el = this.$(selector).first();
    return this.$.html(el) || '';
  }

  // === Built-in Extractors ===

  /**
   * Extract all links from document
   */
  links(options?: LinkExtractionOptions): ExtractedLink[] {
    return extractLinks(this.$, {
      ...options,
      baseUrl: this.options.baseUrl,
    });
  }

  /**
   * Extract all images from document
   */
  images(options?: ImageExtractionOptions): ExtractedImage[] {
    return extractImages(this.$, {
      ...options,
      baseUrl: this.options.baseUrl,
    });
  }

  /**
   * Extract meta tags from document
   */
  meta(): ExtractedMeta {
    return extractMeta(this.$);
  }

  /**
   * Extract OpenGraph data from document
   */
  openGraph(): OpenGraphData {
    return extractOpenGraph(this.$);
  }

  /**
   * Extract Twitter Card data from document
   */
  twitterCard(): TwitterCardData {
    return extractTwitterCard(this.$);
  }

  /**
   * Extract JSON-LD structured data from document
   */
  jsonLd(): JsonLdData[] {
    return extractJsonLd(this.$);
  }

  /**
   * Extract forms from document
   */
  forms(selector?: string): ExtractedForm[] {
    return extractForms(this.$, selector);
  }

  /**
   * Extract tables from document
   */
  tables(selector?: string): ExtractedTable[] {
    return extractTables(this.$, selector);
  }

  /**
   * Extract scripts from document
   */
  scripts(): ExtractedScript[] {
    return extractScripts(this.$);
  }

  /**
   * Extract stylesheets from document
   */
  styles(): ExtractedStyle[] {
    return extractStyles(this.$);
  }

  // === Declarative Extraction ===

  /**
   * Extract structured data using a schema
   *
   * @example
   * ```typescript
   * const data = doc.extract({
   *   title: 'h1',
   *   price: { selector: '.price', transform: v => parseFloat(v) },
   *   images: { selector: 'img', attribute: 'src', multiple: true }
   * });
   * ```
   */
  extract<T extends Record<string, unknown>>(schema: ExtractionSchema): T {
    const result: Record<string, unknown> = {};

    for (const [key, fieldConfig] of Object.entries(schema)) {
      result[key] = this.extractField(fieldConfig);
    }

    return result as T;
  }

  private extractField(field: ExtractionSchemaField): unknown {
    // Simple string selector
    if (typeof field === 'string') {
      return this.text(field) || undefined;
    }

    // Object config
    const { selector, attribute, multiple, transform } = field;

    if (multiple) {
      // Extract multiple values
      const values: unknown[] = [];
      this.$(selector).each((_, element) => {
        const $el = this.$(element);
        let value: string;

        if (attribute) {
          value = $el.attr(attribute) || '';
        } else {
          value = $el.text().trim();
        }

        if (value) {
          values.push(transform ? transform(value) : value);
        }
      });
      return values;
    } else {
      // Extract single value
      const $el = this.$(selector).first();
      let value: string;

      if (attribute) {
        value = $el.attr(attribute) || '';
      } else {
        value = $el.text().trim();
      }

      if (!value) return undefined;
      return transform ? transform(value) : value;
    }
  }

  // === Utility Methods ===

  /**
   * Get page title
   */
  title(): string | undefined {
    const title = this.$('title').first().text().trim();
    return title || undefined;
  }

  /**
   * Get body element
   */
  body(): ScrapeElement {
    return new ScrapeElement(this.$('body').first() as Cheerio<Element>, this.$);
  }

  /**
   * Get head element
   */
  head(): ScrapeElement {
    return new ScrapeElement(this.$('head').first() as Cheerio<Element>, this.$);
  }

  /**
   * Get the full HTML of the document
   */
  html(): string {
    return this.$.html() || '';
  }

  /**
   * Get document root element
   */
  root(): ScrapeElement {
    return new ScrapeElement(this.$.root() as unknown as Cheerio<Element>, this.$);
  }

  /**
   * Check if an element exists
   */
  exists(selector: string): boolean {
    return this.$(selector).length > 0;
  }

  /**
   * Count elements matching selector
   */
  count(selector: string): number {
    return this.$(selector).length;
  }

  // === Advanced Queries ===

  /**
   * Find elements containing specific text
   */
  findByText(text: string, selector?: string): ScrapeElement[] {
    const baseSelector = selector || '*';
    const elements: ScrapeElement[] = [];

    this.$(baseSelector).each((_, element) => {
      const $el = this.$(element);
      if ($el.text().includes(text)) {
        elements.push(new ScrapeElement($el as Cheerio<Element>, this.$));
      }
    });

    return elements;
  }

  /**
   * Find elements with exact text match
   */
  findByExactText(text: string, selector?: string): ScrapeElement[] {
    const baseSelector = selector || '*';
    const elements: ScrapeElement[] = [];

    this.$(baseSelector).each((_, element) => {
      const $el = this.$(element);
      if ($el.text().trim() === text) {
        elements.push(new ScrapeElement($el as Cheerio<Element>, this.$));
      }
    });

    return elements;
  }

  /**
   * Find elements by data attribute
   */
  findByData(name: string, value?: string): ScrapeElement[] {
    const selector = value !== undefined
      ? `[data-${name}="${value}"]`
      : `[data-${name}]`;

    return this.selectAll(selector);
  }

  // === Raw Access ===

  /**
   * Get underlying Cheerio instance
   */
  get raw(): CheerioAPI {
    return this.$;
  }

  /**
   * Get the base URL for this document
   */
  get baseUrl(): string | undefined {
    return this.options.baseUrl;
  }
}

/**
 * ScrapeDocument - Main wrapper for HTML parsing and extraction
 *
 * Provides a rich API for querying, traversing, and extracting data from HTML documents.
 */

import { ScrapeElement } from './element.js';
import { HTMLElement, parse } from './parser/index.js';
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
  private rootElement: HTMLElement;
  private options: ScrapeOptions;

  /**
   * @internal Use ScrapeDocument.create() instead
   */
  constructor(root: HTMLElement, options?: ScrapeOptions) {
    this.rootElement = root;
    this.options = options || {};
  }

  /**
   * Create a new ScrapeDocument from HTML string
   */
  static async create(
    html: string,
    options?: ScrapeOptions
  ): Promise<ScrapeDocument> {
    const root = parse(html);
    return new ScrapeDocument(root, options);
  }

  /**
   * Create a new ScrapeDocument from HTML string (Sync version)
   */
  static createSync(html: string, options?: ScrapeOptions): ScrapeDocument {
    const root = parse(html);
    return new ScrapeDocument(root, options);
  }

  // === Query Methods ===

  /**
   * Select all elements matching CSS selector (jQuery-like behavior)
   * Returns a ScrapeElement containing all matching elements that can be iterated
   */
  select(selector: string): ScrapeElement {
    const elements = this.rootElement.querySelectorAll(selector);
    return new ScrapeElement(elements);
  }

  /**
   * Select first element matching CSS selector
   */
  selectFirst(selector: string): ScrapeElement {
    const element = this.rootElement.querySelector(selector);
    return new ScrapeElement(element ? [element] : []);
  }

  /**
   * Select all elements matching CSS selector
   */
  selectAll(selector: string): ScrapeElement[] {
    const elements = this.rootElement.querySelectorAll(selector);
    return elements.map((el) => new ScrapeElement(el));
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
    const el = this.rootElement.querySelector(selector);
    return el ? el.text.trim() : '';
  }

  /**
   * Get text content from all matching elements
   */
  texts(selector: string): string[] {
    const elements = this.rootElement.querySelectorAll(selector);
    return elements
      .map((el) => el.text.trim())
      .filter((text) => text.length > 0);
  }

  /**
   * Get attribute value from first matching element
   */
  attr(selector: string, attribute: string): string | undefined {
    const el = this.rootElement.querySelector(selector);
    return el ? el.getAttribute(attribute) : undefined;
  }

  /**
   * Get attribute values from all matching elements
   */
  attrs(selector: string, attribute: string): string[] {
    const elements = this.rootElement.querySelectorAll(selector);
    const attrs: string[] = [];
    elements.forEach((el) => {
      const val = el.getAttribute(attribute);
      if (val !== undefined) {
        attrs.push(val);
      }
    });
    return attrs;
  }

  /**
   * Get HTML content from first matching element
   */
  innerHtml(selector: string): string | null {
    const el = this.rootElement.querySelector(selector);
    return el ? el.innerHTML : null;
  }

  /**
   * Get outer HTML from first matching element
   */
  outerHtml(selector: string): string {
    const el = this.rootElement.querySelector(selector);
    return el ? el.outerHTML : '';
  }

  // === Built-in Extractors ===

  /**
   * Extract all links from document
   */
  links(options?: LinkExtractionOptions): ExtractedLink[] {

    return extractLinks(this.rootElement, {
      ...options,
      baseUrl: this.options.baseUrl,
    });
  }

  /**
   * Extract all images from document
   */
  images(options?: ImageExtractionOptions): ExtractedImage[] {

    return extractImages(this.rootElement, {
      ...options,
      baseUrl: this.options.baseUrl,
    });
  }

  /**
   * Extract meta tags from document
   */
  meta(): ExtractedMeta {

    return extractMeta(this.rootElement);
  }

  /**
   * Extract OpenGraph data from document
   */
  openGraph(): OpenGraphData {

    return extractOpenGraph(this.rootElement);
  }

  /**
   * Extract Twitter Card data from document
   */
  twitterCard(): TwitterCardData {

    return extractTwitterCard(this.rootElement);
  }

  /**
   * Extract JSON-LD structured data from document
   */
  jsonLd(): JsonLdData[] {

    return extractJsonLd(this.rootElement);
  }

  /**
   * Extract forms from document
   */
  forms(selector?: string): ExtractedForm[] {

    return extractForms(this.rootElement, selector);
  }

  /**
   * Extract tables from document
   */
  tables(selector?: string): ExtractedTable[] {

    return extractTables(this.rootElement, selector);
  }

  /**
   * Extract scripts from document
   */
  scripts(): ExtractedScript[] {

    return extractScripts(this.rootElement);
  }

  /**
   * Extract stylesheets from document
   */
  styles(): ExtractedStyle[] {

    return extractStyles(this.rootElement);
  }

  // === Declarative Extraction ===

  /**
   * Extract structured data using a schema
   */
  extract<T extends Record<string, unknown>>(schema: ExtractionSchema): T {
    const result: Record<string, unknown> = {};

    for (const [key, fieldConfig] of Object.entries(schema)) {
      const value = this.extractField(fieldConfig);

      // Handle optional fields - skip if value is undefined and field is optional
      if (value === undefined) {
        const isOptional = typeof fieldConfig === 'object' && fieldConfig.optional === true;
        if (!isOptional) {
          result[key] = undefined;
        }
        // If optional, don't include the key at all
      } else {
        result[key] = value;
      }
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
    const defaultValue = 'default' in field ? field.default : undefined;

    if (multiple) {
      // Extract multiple values
      const elements = this.rootElement.querySelectorAll(selector);
      const values: unknown[] = [];

      elements.forEach(el => {
          let value: string;
          if (attribute) {
              value = el.getAttribute(attribute) || '';
          } else {
              value = el.text.trim();
          }

          if (value) {
              values.push(transform ? transform(value) : value);
          }
      });

      // Return default if no values found
      if (values.length === 0 && defaultValue !== undefined) {
        return defaultValue;
      }
      return values;
    } else {
      // Extract single value
      const el = this.rootElement.querySelector(selector);

      if (!el) {
        // Return default value if element not found
        return defaultValue;
      }

      let value: string;
      if (attribute) {
        value = el.getAttribute(attribute) || '';
      } else {
        value = el.text.trim();
      }

      if (!value) {
        // Return default value if value is empty
        return defaultValue;
      }
      return transform ? transform(value) : value;
    }
  }

  // === Utility Methods ===

  /**
   * Get page title
   */
  title(): string | undefined {
    const el = this.rootElement.querySelector('title');
    const title = el ? el.text.trim() : '';
    return title || undefined;
  }

  /**
   * Get body element
   */
  body(): ScrapeElement {
    const el = this.rootElement.querySelector('body');
    return new ScrapeElement(el ? [el] : []);
  }

  /**
   * Get head element
   */
  head(): ScrapeElement {
    const el = this.rootElement.querySelector('head');
    return new ScrapeElement(el ? [el] : []);
  }

  /**
   * Get the full HTML of the document
   */
  html(): string {
    return this.rootElement.outerHTML;
  }

  /**
   * Get document root element
   */
  root(): ScrapeElement {
    return new ScrapeElement(this.rootElement);
  }

  /**
   * Check if an element exists
   */
  exists(selector: string): boolean {
    return this.rootElement.querySelector(selector) !== null;
  }

  /**
   * Count elements matching selector
   */
  count(selector: string): number {
    return this.rootElement.querySelectorAll(selector).length;
  }

  // === Advanced Queries ===

  /**
   * Find elements containing specific text
   */
  findByText(text: string, selector?: string): ScrapeElement[] {
    const elements: ScrapeElement[] = [];
    // Traverse all nodes? Or just select *?
    const candidates = selector ? this.rootElement.querySelectorAll(selector) : this.rootElement.querySelectorAll('*');
    
    candidates.forEach(el => {
        if (el.text.includes(text)) {
            elements.push(new ScrapeElement(el));
        }
    });

    return elements;
  }

  /**
   * Find elements with exact text match
   */
  findByExactText(text: string, selector?: string): ScrapeElement[] {
    const elements: ScrapeElement[] = [];
    const candidates = selector ? this.rootElement.querySelectorAll(selector) : this.rootElement.querySelectorAll('*');
    
    candidates.forEach(el => {
        if (el.text.trim() === text) {
            elements.push(new ScrapeElement(el));
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
   * Get underlying Parser Root
   */
  get raw(): HTMLElement {
    return this.rootElement;
  }

  /**
   * Get the base URL for this document
   */
  get baseUrl(): string | undefined {
    return this.options.baseUrl;
  }
}
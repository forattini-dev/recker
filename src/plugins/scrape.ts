/**
 * Scrape Plugin for Recker
 *
 * Provides HTML scraping and data extraction capabilities using Cheerio.
 * Cheerio is a peer dependency - install it with: pnpm add cheerio
 *
 * @example
 * ```typescript
 * import { createClient } from 'recker';
 * import { scrape } from 'recker/plugins/scrape';
 *
 * const client = createClient();
 *
 * // Get ScrapeDocument for full control
 * const doc = await scrape(client.get('https://example.com')).scrape();
 * const title = doc.select('h1').text();
 *
 * // Or use quick extraction helpers
 * const links = await scrape(client.get('/page')).links();
 * const meta = await scrape(client.get('/page')).meta();
 * ```
 */

import type { ReckerResponse } from '../types/index.js';
import type { RequestPromise } from '../core/request-promise.js';
import type {
  ScrapeOptions,
  ExtractionSchema,
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
} from '../scrape/types.js';

// Lazy import ScrapeDocument to avoid loading cheerio unless needed
let ScrapeDocumentClass: typeof import('../scrape/document.js').ScrapeDocument | null = null;

async function getScrapeDocument() {
  if (!ScrapeDocumentClass) {
    try {
      const module = await import('../scrape/document.js');
      ScrapeDocumentClass = module.ScrapeDocument;
    } catch (error) {
      throw new Error(
        'Failed to load scrape module. Make sure cheerio is installed: pnpm add cheerio'
      );
    }
  }
  return ScrapeDocumentClass;
}

/**
 * Extended promise interface with scraping capabilities
 */
export interface ScrapePromise<T> extends Promise<T> {
  /**
   * Parse HTML and return ScrapeDocument for full control
   */
  scrape(options?: ScrapeOptions): Promise<import('../scrape/document.js').ScrapeDocument>;

  /**
   * Extract all links from HTML
   */
  links(options?: LinkExtractionOptions): Promise<ExtractedLink[]>;

  /**
   * Extract all images from HTML
   */
  images(options?: ImageExtractionOptions): Promise<ExtractedImage[]>;

  /**
   * Extract meta tags from HTML
   */
  meta(): Promise<ExtractedMeta>;

  /**
   * Extract OpenGraph data from HTML
   */
  openGraph(): Promise<OpenGraphData>;

  /**
   * Extract Twitter Card data from HTML
   */
  twitterCard(): Promise<TwitterCardData>;

  /**
   * Extract JSON-LD structured data from HTML
   */
  jsonLd(): Promise<JsonLdData[]>;

  /**
   * Extract forms from HTML
   */
  forms(selector?: string): Promise<ExtractedForm[]>;

  /**
   * Extract tables from HTML
   */
  tables(selector?: string): Promise<ExtractedTable[]>;

  /**
   * Extract scripts from HTML
   */
  scripts(): Promise<ExtractedScript[]>;

  /**
   * Extract stylesheets from HTML
   */
  styles(): Promise<ExtractedStyle[]>;

  /**
   * Declarative extraction with schema
   */
  extract<R extends Record<string, unknown>>(schema: ExtractionSchema): Promise<R>;
}

/**
 * Wrap a request promise with scraping capabilities
 *
 * @example
 * ```typescript
 * import { scrape } from 'recker/plugins/scrape';
 *
 * // Get full document for complex scraping
 * const doc = await scrape(client.get('/page')).scrape();
 * const title = doc.select('h1').text();
 * const items = doc.selectAll('.item').map(el => el.text());
 *
 * // Or use quick extraction
 * const links = await scrape(client.get('/page')).links({ absolute: true });
 * const meta = await scrape(client.get('/page')).meta();
 * const og = await scrape(client.get('/page')).openGraph();
 *
 * // Declarative extraction
 * const data = await scrape(client.get('/product')).extract({
 *   title: 'h1.product-title',
 *   price: { selector: '.price', transform: v => parseFloat(v.replace('$', '')) },
 *   images: { selector: '.gallery img', attribute: 'src', multiple: true }
 * });
 * ```
 */
export function scrape<T extends ReckerResponse>(
  promise: RequestPromise<T> | Promise<T>
): ScrapePromise<T> {
  // Create the base promise
  const basePromise = Promise.resolve(promise);

  // Helper to get document
  const getDocument = async (options?: ScrapeOptions) => {
    const ScrapeDoc = await getScrapeDocument();
    const response = await basePromise;
    const html = await response.text();
    return new ScrapeDoc(html, {
      baseUrl: options?.baseUrl || response.url,
      ...options,
    });
  };

  // Create enhanced promise
  const enhanced = basePromise as ScrapePromise<T>;

  enhanced.scrape = async (options?: ScrapeOptions) => {
    return getDocument(options);
  };

  enhanced.links = async (options?: LinkExtractionOptions) => {
    const doc = await getDocument();
    return doc.links(options);
  };

  enhanced.images = async (options?: ImageExtractionOptions) => {
    const doc = await getDocument();
    return doc.images(options);
  };

  enhanced.meta = async () => {
    const doc = await getDocument();
    return doc.meta();
  };

  enhanced.openGraph = async () => {
    const doc = await getDocument();
    return doc.openGraph();
  };

  enhanced.twitterCard = async () => {
    const doc = await getDocument();
    return doc.twitterCard();
  };

  enhanced.jsonLd = async () => {
    const doc = await getDocument();
    return doc.jsonLd();
  };

  enhanced.forms = async (selector?: string) => {
    const doc = await getDocument();
    return doc.forms(selector);
  };

  enhanced.tables = async (selector?: string) => {
    const doc = await getDocument();
    return doc.tables(selector);
  };

  enhanced.scripts = async () => {
    const doc = await getDocument();
    return doc.scripts();
  };

  enhanced.styles = async () => {
    const doc = await getDocument();
    return doc.styles();
  };

  enhanced.extract = async <R extends Record<string, unknown>>(schema: ExtractionSchema) => {
    const doc = await getDocument();
    return doc.extract<R>(schema);
  };

  return enhanced;
}

/**
 * Create a ScrapeDocument from HTML string
 *
 * @example
 * ```typescript
 * import { parseHtml } from 'recker/plugins/scrape';
 *
 * const html = '<html><body><h1>Hello</h1></body></html>';
 * const doc = await parseHtml(html);
 * console.log(doc.select('h1').text()); // 'Hello'
 * ```
 */
export async function parseHtml(
  html: string,
  options?: ScrapeOptions
): Promise<import('../scrape/document.js').ScrapeDocument> {
  const ScrapeDoc = await getScrapeDocument();
  return new ScrapeDoc(html, options);
}

/**
 * Helper to parse HTML response
 *
 * @example
 * ```typescript
 * import { scrapeResponse } from 'recker/plugins/scrape';
 *
 * const doc = await scrapeResponse(client.get('/page'));
 * const title = doc.select('h1').text();
 * ```
 */
export async function scrapeResponse(
  promise: Promise<ReckerResponse>,
  options?: ScrapeOptions
): Promise<import('../scrape/document.js').ScrapeDocument> {
  const ScrapeDoc = await getScrapeDocument();
  const response = await promise;
  const html = await response.text();
  return new ScrapeDoc(html, {
    baseUrl: options?.baseUrl || response.url,
    ...options,
  });
}

// Re-export types and classes for convenience
export type {
  ScrapeOptions,
  ExtractionSchema,
  ExtractedLink,
  ExtractedImage,
  ExtractedMeta,
  OpenGraphData,
  TwitterCardData,
  JsonLdData,
  ExtractedForm,
  ExtractedFormField,
  ExtractedTable,
  ExtractedScript,
  ExtractedStyle,
  LinkExtractionOptions,
  ImageExtractionOptions,
} from '../scrape/types.js';

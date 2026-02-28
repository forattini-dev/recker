/**
 * Scrape Plugin Types
 *
 * TypeScript interfaces for HTML scraping and data extraction.
 */

import type { Options as ParserOptions } from './parser/index.js';

// === Link Extraction ===
export interface ExtractedLink {
  /** Link URL (href attribute) */
  href: string;
  /** Link text content */
  text: string;
  /** Rel attribute value */
  rel?: string;
  /** Target attribute value */
  target?: string;
  /** Title attribute value */
  title?: string;
  /** Link type classification */
  type?: 'internal' | 'external' | 'anchor' | 'mailto' | 'tel';
  /** Contains <img> tag */
  hasImage?: boolean;
  /** Contains <img> tag with alt attribute */
  hasImageWithAlt?: boolean;
  /** Contains <svg> tag */
  hasSvg?: boolean;
  /** Contains <svg> tag with title or aria-label */
  hasSvgWithTitle?: boolean;
  /** Aria-label attribute */
  ariaLabel?: string;
}

// === Image Extraction ===
export interface ExtractedImage {
  /** Image source URL */
  src: string;
  /** Alt text */
  alt?: string;
  /** Title attribute */
  title?: string;
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** Srcset attribute for responsive images */
  srcset?: string;
  /** Loading strategy */
  loading?: 'lazy' | 'eager';
  /** Decoding hint */
  decoding?: 'async' | 'auto' | 'sync';
}

// === Meta Tags ===
export interface ExtractedMeta {
  /** Page title from <title> tag */
  title?: string;
  /** Meta description */
  description?: string;
  /** Meta keywords as array */
  keywords?: string[];
  /** Author meta tag */
  author?: string;
  /** Robots meta tag */
  robots?: string[]; // Changed to string[]
  /** Canonical URL */
  canonical?: string;
  /** Viewport meta tag */
  viewport?: string;
  /** Document charset */
  charset?: string;
  /** Allow additional meta properties */
  [key: string]: string | string[] | undefined;
}

// === OpenGraph ===
export interface OpenGraphData {
  /** og:title */
  title?: string;
  /** og:type */
  type?: string;
  /** og:url */
  url?: string;
  /** og:image (can be multiple) */
  image?: string | string[];
  /** og:description */
  description?: string;
  /** og:site_name */
  siteName?: string;
  /** og:locale */
  locale?: string;
  /** Allow additional OG properties */
  [key: string]: string | string[] | undefined;
}

// === Twitter Card ===
export interface TwitterCardData {
  /** twitter:card type */
  card?: 'summary' | 'summary_large_image' | 'app' | 'player';
  /** twitter:site */
  site?: string;
  /** twitter:creator */
  creator?: string;
  /** twitter:title */
  title?: string;
  /** twitter:description */
  description?: string;
  /** twitter:image */
  image?: string;
  /** Allow additional Twitter properties */
  [key: string]: string | undefined;
}

// === JSON-LD Structured Data ===
export interface JsonLdData {
  /** JSON-LD @context */
  '@context'?: string;
  /** JSON-LD @type */
  '@type'?: string;
  /** Allow any additional properties */
  [key: string]: unknown;
}

// === Form Extraction ===
export interface ExtractedForm {
  /** Form action URL */
  action?: string;
  /** Form method (GET, POST, etc.) */
  method?: string;
  /** Form name attribute */
  name?: string;
  /** Form id attribute */
  id?: string;
  /** Form fields */
  fields: ExtractedFormField[];
}

export interface ExtractedFormField {
  /** Field name attribute */
  name?: string;
  /** Input type (text, email, password, etc.) */
  type?: string;
  /** Field value */
  value?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Is field required */
  required?: boolean;
  /** Options for select elements */
  options?: { value: string; text: string }[];
}

// === Table Extraction ===
export interface ExtractedTable {
  /** Table headers (from <th> elements) */
  headers: string[];
  /** Table rows (array of cell values) */
  rows: string[][];
  /** Table caption */
  caption?: string;
}

// === Script Extraction ===
export interface ExtractedScript {
  /** Script src URL */
  src?: string;
  /** Script type (text/javascript, module, etc.) */
  type?: string;
  /** Async attribute */
  async?: boolean;
  /** Defer attribute */
  defer?: boolean;
  /** Inline script content */
  inline?: string;
}

// === Style Extraction ===
export interface ExtractedStyle {
  /** Stylesheet href URL */
  href?: string;
  /** Media query */
  media?: string;
  /** Inline style content */
  inline?: string;
}

// === Declarative Extraction Schema ===
export type ExtractionSchemaField = string | {
  /** CSS selector */
  selector: string;
  /** Attribute to extract (defaults to text content) */
  attribute?: string;
  /** Extract multiple elements */
  multiple?: boolean;
  /** Transform function */
  transform?: (value: string) => unknown;
  /** Default value if element not found */
  default?: unknown;
  /** Mark field as optional (won't be included if not found) */
  optional?: boolean;
};

export interface ExtractionSchema {
  [key: string]: ExtractionSchemaField;
}

// === Scrape Options ===
export interface ScrapeOptions {
  /** Base URL for resolving relative links */
  baseUrl?: string;

  /**
   * Parser-level options for HTML parsing behavior.
   * Useful when you need strict parsing rules or specific parser cache behavior.
   */
  parserOptions?: Partial<ParserOptions>;
}

// === Link Extraction Options ===
export interface LinkExtractionOptions {
  /** CSS selector for links (default: 'a[href]') */
  selector?: string;
  /** Convert relative URLs to absolute */
  absolute?: boolean;
}

// === Image Extraction Options ===
export interface ImageExtractionOptions {
  /** CSS selector for images (default: 'img[src]') */
  selector?: string;
  /** Convert relative URLs to absolute */
  absolute?: boolean;
}

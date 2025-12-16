/**
 * Scrape Module
 *
 * HTML parsing and data extraction utilities for the Recker HTTP client.
 */

// HTML Parser (standalone, no dependencies beyond css-select)
export {
  parse as parseHtmlSync,
  HTMLElement,
  TextNode,
  CommentNode,
  Node,
  NodeType,
  valid,
} from './parser/index.js';
export type { Options as ParserOptions } from './parser/index.js';

// Main classes
export { ScrapeDocument } from './document.js';
export { ScrapeElement } from './element.js';

// Spider (web crawler)
export { Spider, spider } from './spider.js';
export type {
  SpiderOptions,
  SpiderPageResult,
  SpiderProgress,
  SpiderResult,
} from './spider.js';

// Extractors
export {
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

// Types
export type {
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
  ExtractionSchema,
  ExtractionSchemaField,
  ScrapeOptions,
  LinkExtractionOptions,
  ImageExtractionOptions,
} from './types.js';

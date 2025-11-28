/**
 * Scrape Module
 *
 * HTML parsing and data extraction utilities for the Recker HTTP client.
 */

// Main classes
export { ScrapeDocument } from './document.js';
export { ScrapeElement } from './element.js';

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

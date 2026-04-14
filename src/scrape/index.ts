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
  SpiderPageEvent,
  SpiderProgress,
  SpiderResult,
} from './spider.js';

// Spider typed errors (for instanceof recovery in user code)
export {
  SpiderBlockError,
  SpiderChallengeError,
  SpiderRobotsDisallowedError,
  SpiderDepthLimitError,
  SpiderDomainOutOfScopeError,
  SpiderUnsupportedContentError,
} from './errors.js';

// URL rewrite table (Google Docs / Drive / Sheets → export endpoints)
export { rewriteUrl } from './rewrite-url.js';
export type { UrlRewriteResult } from './rewrite-url.js';

// Crawl Queue (pluggable URL frontier)
export { InMemoryCrawlQueue } from './crawl-queue.js';
export { SqliteCrawlQueue } from './sqlite-crawl-queue.js';
export type { CrawlQueueAdapter, CrawlQueueItem } from './crawl-queue.js';

// Crawl Storage (pluggable result storage)
export { InMemoryCrawlStorage } from './crawl-storage.js';
export { SqliteCrawlStorage } from './sqlite-crawl-storage.js';
export type { CrawlStorageAdapter } from './crawl-storage.js';

// Domain Stats (pluggable transport-learning store, separate from result storage)
export { InMemoryDomainStats } from './domain-stats.js';
export type { DomainStatsAdapter, DomainTransportStats } from './domain-stats.js';

// Proxy Adapter (pluggable proxy selection)
export { ListProxyAdapter } from './proxy-adapter.js';
export type { ProxyAdapter } from './proxy-adapter.js';

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

/**
 * SEO Rule Types
 */

import type { SeoStatus } from '../types.js';
import type { ExtractedLink } from '../../scrape/types.js';

export type RuleSeverity = 'error' | 'warning' | 'info';

export type RuleCategory =
  | 'title'
  | 'meta'
  | 'og'
  | 'twitter'
  | 'headings'
  | 'images'
  | 'links'
  | 'content'
  | 'technical'
  | 'security'
  | 'mobile'
  | 'structured-data'
  | 'performance'
  | 'accessibility';

export interface RuleContext {
  // Title
  title?: string;
  titleLength?: number;

  // Meta
  metaDescription?: string;
  metaDescriptionLength?: number;
  metaKeywords?: string[];
  metaRobots?: string[]; // Changed to string[]

  // OpenGraph
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  ogType?: string;
  ogSiteName?: string;

  // Twitter
  twitterCard?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  twitterSite?: string;

  // Headings
  h1Count?: number;
  h1Text?: string;
  h1Length?: number;
  h2Count?: number;
  headingHierarchyValid?: boolean;
  headingSkippedLevels?: string[];
  sectionWordCounts?: number[]; // Word count between headings

  // Images
  totalImages?: number;
  imagesWithAlt?: number;
  imagesWithoutAlt?: number;
  imagesWithLazyLoad?: number;
  imagesWithDimensions?: number;
  imagesMissingDimensions?: number;
  imagesWithEmptyAlt?: number;
  imagesDecorativeCount?: number;
  imagesUsingModernFormats?: number;
  altTextLengths?: number[];
  imageFilenames?: string[]; // For image file naming conventions
  imagesWithAsyncDecoding?: number; // Count of images with decoding="async"

  // Accessibility
  buttonsWithoutAriaLabel?: number;
  linksWithoutAriaLabel?: number;
  inputsWithoutLabel?: number;
  formsWithoutAction?: number;
  tablesWithoutCaption?: number;
  iframesWithoutTitle?: number;
  svgsWithoutTitle?: number;
  interactiveElementsCount?: number;
  ariaLabelledByMissing?: number;

  // Links
  allLinks?: ExtractedLink[];
  totalLinks?: number;
  internalLinks?: number;
  externalLinks?: number;
  linksWithoutText?: number;
  nofollowLinks?: number;
  sponsoredLinks?: number;
  ugcLinks?: number;
  brokenLinks?: number;
  linksWithGenericText?: number;
  externalLinksWithoutNoopener?: number;
  externalLinksWithoutNoreferrer?: number;

  // Problematic links (for detailed reporting)
  problematicLinks?: {
    withoutText?: ExtractedLink[];
    genericText?: ExtractedLink[];
    missingNoopener?: ExtractedLink[];
    missingNoreferrer?: ExtractedLink[];
  };

  // Content
  wordCount?: number;
  characterCount?: number;
  sentenceCount?: number;
  paragraphCount?: number;
  avgWordsPerSentence?: number;
  avgParagraphLength?: number;
  listCount?: number;
  strongTagCount?: number;
  emTagCount?: number;
  subheadingFrequency?: number; // H2/H3 count per 100 words
  
  // Content Depth & Quality
  paragraphWordCounts?: number[]; // Array of word counts per paragraph
  avgSentenceLength?: number; // Average words per sentence
  faqCount?: number; // Estimated FAQ items
  imagePerWordRatio?: number; // Images per word
  mainKeyword?: string; // Main keyword if provided
  keywordDensity?: number; // Keyword density percentage if mainKeyword provided
  fleschReadingEase?: number; // Flesch Reading Ease score
  hasQuestionHeadings?: boolean; // If headings are question-like

  // Structural HTML5
  hasHeader?: boolean;
  hasNav?: boolean;
  hasMain?: boolean;
  hasArticle?: boolean;
  hasSection?: boolean;
  hasFooter?: boolean;

  // Trust Signals (can be based on links)
  hasAboutPageLink?: boolean;
  hasContactPageLink?: boolean;
  hasPrivacyPolicyLink?: boolean;
  hasTermsOfServiceLink?: boolean;

  // Breadcrumbs
  hasBreadcrumbsHtml?: boolean;
  hasBreadcrumbsSchema?: boolean;

  // Multimedia
  videoCount?: number;
  audioCount?: number;

  // Technical
  hasCanonical?: boolean;
  canonicalUrl?: string;
  hasViewport?: boolean;
  viewportContent?: string;
  hasCharset?: boolean;
  charset?: string;
  hasLang?: boolean;
  langValue?: string;
  isHttps?: boolean;
  hasMixedContent?: boolean;
  responseHeaders?: Record<string, string | string[]>;
  textHtmlRatio?: number; // Ratio of plain text to total HTML size

  // Favicon
  hasFavicon?: boolean;
  faviconUrl?: string;

  // Performance hints
  hasPreconnect?: boolean;
  preconnectCount?: number;
  hasDnsPrefetch?: boolean;
  dnsPrefetchCount?: number;
  hasPreload?: boolean;
  preloadCount?: number;
  renderBlockingResources?: number;
  inlineScriptsCount?: number;
  inlineStylesCount?: number;

  // Core Web Vitals hints
  lcpHints?: {
    hasLargeImages?: boolean;
    hasLazyLcp?: boolean;
    hasPriorityHints?: boolean;
  };
  clsHints?: {
    imagesWithoutDimensions?: number;
    dynamicContent?: number;
  };

  // Structured Data
  jsonLdCount?: number;
  jsonLdTypes?: string[];

  // URL
  url?: string;
  urlLength?: number;

  // Internationalization (i18n)
  hreflangTags?: Array<{ lang: string; href: string }>;
  ogLocale?: string;
  alternateLanguages?: string[]; // Languages available on the site

  // SEO Quality Checks
  titleMatchesH1?: boolean;
  urlHasUppercase?: boolean;
  urlHasSpecialChars?: boolean;
  urlHasAccents?: boolean;

  // JS Rendering hints
  bodyTextLength?: number;
  scriptCount?: number;
  hasNoscriptContent?: boolean;

  // Timing metrics (passed from request)
  timings?: {
    ttfb?: number; // Time to first byte (ms)
    dnsLookup?: number; // DNS lookup time (ms)
    tcpConnect?: number; // TCP connection time (ms)
    tlsHandshake?: number; // TLS handshake time (ms)
    download?: number; // Content download time (ms)
    total?: number; // Total request time (ms)
  };

  // Response metrics
  responseSize?: number; // Total response size in bytes
  htmlSize?: number; // HTML size in bytes (before decompression)
  compressedSize?: number; // Compressed size if gzip/br
  isCompressed?: boolean; // Whether response was compressed
}

export interface RuleEvidence {
  /** What was found in the page */
  found?: string | number | string[];
  /** What was expected */
  expected?: string | number | string[];
  /** Specific location in the document (selector, line, etc.) */
  location?: string;
  /** The specific issue or problem */
  issue?: string;
  /** Impact on SEO/UX */
  impact?: string;
  /** Example of the correct implementation */
  example?: string;
  /** Link to documentation or reference */
  learnMore?: string;
}

export interface RuleResult {
  id: string;
  name: string;
  category: RuleCategory;
  severity: RuleSeverity;
  status: SeoStatus;
  message: string;
  /** The actual value found */
  value?: string | number;
  /** Detailed recommendation for fixing the issue */
  recommendation?: string;
  /** Structured evidence supporting the result */
  evidence?: RuleEvidence;
  /** Additional details (legacy, prefer evidence) */
  details?: Record<string, unknown>;
}

export interface SeoRule {
  id: string;
  name: string;
  category: RuleCategory;
  severity: RuleSeverity;
  description: string;
  check: (ctx: RuleContext) => RuleResult | null;
}

/**
 * Helper function to create consistent result objects
 */
export function createResult(
  rule: Pick<SeoRule, 'id' | 'name' | 'category' | 'severity'>,
  status: SeoStatus,
  message: string,
  options?: {
    value?: string | number;
    recommendation?: string;
    evidence?: RuleEvidence;
    details?: Record<string, unknown>;
  }
): RuleResult {
  return {
    id: rule.id,
    name: rule.name,
    category: rule.category,
    severity: rule.severity,
    status,
    message,
    ...options,
  };
}

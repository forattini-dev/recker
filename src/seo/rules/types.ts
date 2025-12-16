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
  | 'accessibility'
  // Advanced categories
  | 'ai-search'
  | 'resources'
  | 'crawlability'
  | 'canonicalization';

export interface RuleContext {
  // Keywords
  keywordsInTitle?: boolean;
  keywordsInDescription?: boolean;
  keywordsInH1?: boolean;
  keywordsInUrl?: boolean;
  keywordsInFirstParagraph?: boolean;
  keywordsInAltText?: boolean;
  /** Keyword consistency score (0-6): how many key places contain the main keyword */
  keywordConsistencyScore?: number;
  /** Which places contain the main keyword */
  keywordConsistencyDetails?: {
    inTitle: boolean;
    inDescription: boolean;
    inH1: boolean;
    inUrl: boolean;
    inFirstParagraph: boolean;
    inAltText: boolean;
  };
  topKeywords?: string[];
  /** Primary keyword to check for consistency */
  mainKeyword?: string;

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
  imagesWithSrcset?: number; // Images using srcset or picture
  largeBase64ImagesCount?: number; // Inline base64 images > 5KB
  imagesDecorativeCount?: number;
  imagesUsingModernFormats?: number;
  altTextLengths?: number[];
  /** Actual alt text strings for keyword analysis */
  imageAltTexts?: string[];
  imageFilenames?: string[]; // For image file naming conventions
  imagesWithAsyncDecoding?: number; // Count of images with decoding="async"
  brokenExternalImages?: number;
  brokenExternalImageUrls?: string[];

  // Accessibility - Basic
  buttonsWithoutAriaLabel?: number;
  linksWithoutAriaLabel?: number;
  inputsWithoutLabel?: number;
  formsWithoutAction?: number;
  tablesWithoutCaption?: number;
  iframesWithoutTitle?: number;
  svgsWithoutTitle?: number;
  interactiveElementsCount?: number;
  ariaLabelledByMissing?: number;

  // Accessibility - Lighthouse Expanded (HTML-parseable only)
  elementsWithHighTabindex?: number; // Elements with tabindex > 0
  invalidAriaAttributes?: number; // Invalid or misspelled aria-* attributes
  invalidAriaValues?: number; // ARIA attributes with invalid values
  invalidAriaRoles?: number; // Invalid ARIA role values
  missingRequiredAriaAttrs?: number; // ARIA roles missing required attributes
  hasAriaHiddenBody?: boolean; // Whether body has aria-hidden="true"
  ariaHiddenFocusableCount?: number; // Focusable elements inside aria-hidden
  deprecatedAriaRoles?: number; // Deprecated ARIA roles used
  duplicateAriaIds?: number; // Duplicate IDs referenced by ARIA
  dialogsWithoutName?: number; // Dialogs without accessible name
  hasSkipLink?: boolean; // Whether page has skip to main content link
  videosWithCaptions?: number; // Videos with captions/subtitles
  videosWithoutCaptions?: number; // Videos missing captions
  invalidListStructure?: number; // Lists with invalid structure
  emptyHeadings?: number; // Headings with no text content
  imagesWithRedundantAlt?: number; // Images with alt same as nearby text

  // Links
  allLinks?: ExtractedLink[];
  totalLinks?: number;
  internalLinks?: number;
  externalLinks?: number;
  /** Internal links using HTTP instead of HTTPS */
  internalHttpLinks?: number;
  /** URLs of internal links using HTTP */
  internalHttpLinkUrls?: string[];
  linksWithoutText?: number;
  nofollowLinks?: number;
  sponsoredLinks?: number;
  ugcLinks?: number;
  brokenLinks?: number;
  linksWithGenericText?: number;
  externalLinksWithoutNoopener?: number;
  externalLinksWithoutNoreferrer?: number;
  linksToResources?: number;
  resourceLinkUrls?: string[];
  forbidden403Links?: number;
  forbidden403LinkUrls?: string[];

  // Problematic links (for detailed reporting)
  problematicLinks?: {
    withoutText?: ExtractedLink[];
    genericText?: ExtractedLink[];
    missingNoopener?: ExtractedLink[];
    missingNoreferrer?: ExtractedLink[];
  };

  // Content
  wordCount?: number;
  emailsFound?: string[]; // Emails found in plain text
  
  // Social
  socialLinksFound?: string[]; // Social profiles linked (facebook, twitter, etc.)

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
  hasAutoplay?: boolean; // Autoplaying video/audio detected

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
  hasDeprecatedPlugins?: boolean;
  deprecatedPluginTypes?: string[];
  deprecatedTagsCount?: number;
  deprecatedTagsFound?: string[];
  hasFrameTags?: boolean;
  iframeCount?: number;

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
  detectedLanguage?: string; // Detected content language

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

  // ==========================================================================
  // E-commerce Context
  // ==========================================================================
  isProductPage?: boolean; // Detected as product page
  productSchema?: {
    name?: string;
    image?: string | string[];
    offers?: {
      price?: number | string;
      lowPrice?: number | string;
      priceCurrency?: string;
      availability?: string;
      priceValidUntil?: string;
      validFrom?: string;
      validThrough?: string;
    };
    aggregateRating?: {
      ratingValue?: number | string;
      reviewCount?: number;
      ratingCount?: number;
    };
    review?: unknown;
    brand?: string | { name?: string };
    sku?: string;
    gtin?: string;
    gtin13?: string;
    gtin14?: string;
    gtin8?: string;
    mpn?: string;
  };

  // ==========================================================================
  // Local Business Context
  // ==========================================================================
  hasLocalBusinessSignals?: boolean; // Page appears to be local business
  localBusinessSchema?: {
    '@type'?: string;
    name?: string;
    address?: {
      streetAddress?: string;
      addressLocality?: string;
      addressRegion?: string;
      postalCode?: string;
      addressCountry?: string;
    };
    telephone?: string;
    openingHoursSpecification?: unknown;
    openingHours?: string | string[];
    geo?: {
      latitude?: number | string;
      longitude?: number | string;
    };
    areaServed?: unknown;
    priceRange?: string;
  };
  hasPhoneOnPage?: boolean;
  hasAddressOnPage?: boolean;

  // ==========================================================================
  // Core Web Vitals Deep Context
  // ==========================================================================
  lcpCandidate?: {
    element?: string;
    src?: string;
    loading?: string;
    fetchpriority?: string;
  };
  hasLcpPreload?: boolean;
  webFonts?: Array<{
    family?: string;
    hasSwap?: boolean;
    hasOptional?: boolean;
    hasSizeAdjust?: boolean;
    hasAscentOverride?: boolean;
  }>;
  renderBlockingStylesheets?: number;
  renderBlockingScripts?: number;
  hasAspectRatioCss?: boolean;
  hasResponsiveImages?: boolean;
  hasAdsWithoutReservedSpace?: boolean;
  hasBannersWithoutMinHeight?: boolean;
  hasInfiniteScroll?: boolean;
  largeInlineScripts?: number;
  inlineEventHandlers?: number;
  hasHeavyAnimations?: boolean;
  externalOrigins?: number;
  hasCriticalResources?: boolean;
  hasInlineCriticalCss?: boolean;

  // ==========================================================================
  // Crawl & Indexing Context
  // ==========================================================================
  hasSitemapLink?: boolean;
  sitemapUrl?: string;
  robotsHasSitemap?: boolean;
  robotsTxtExists?: boolean;
  robotsTxtHasSitemap?: boolean;
  isPaginatedPage?: boolean;
  hasRelPrev?: boolean;
  hasRelNext?: boolean;
  blockedResources?: number;
  blockedResourceUrls?: string[];
  blockedExternalResources?: number;
  blockedExternalResourceUrls?: string[];
  xRobotsTag?: string;

  // ==========================================================================
  // Best Practices Context
  // ==========================================================================
  hasDoctype?: boolean; // Whether page has DOCTYPE
  httpStatusCode?: number; // HTTP response status code
  uncrawlableLinksCount?: number; // Links not crawlable (javascript: hrefs)
  robotsTxtValid?: boolean; // Whether robots.txt is valid
  robotsTxtError?: string; // robots.txt validation error
  structuredDataErrors?: number; // Structured data validation errors
  isIndexable?: boolean; // Whether page is indexable

  // ==========================================================================
  // Security Context (Lighthouse Trust & Safety)
  // ==========================================================================
  httpRedirectsToHttps?: boolean; // HTTP redirects to HTTPS
  sniSupported?: boolean; // Server Name Indication support
  sitemapHttpUrls?: number; // Count of HTTP URLs in sitemap
  sitemapHttpUrlsList?: string[]; // List of HTTP URLs in sitemap
  hasHsts?: boolean; // Has HSTS header

  // ==========================================================================
  // Readability Context
  // ==========================================================================
  passiveVoicePercentage?: number;
  transitionWordPercentage?: number;
  consecutiveSentenceStarts?: number;
  complexWordPercentage?: number;

  // ==========================================================================
  // PWA Context
  // ==========================================================================
  hasManifest?: boolean;
  manifestUrl?: string;
  themeColor?: string;
  hasAppleTouchIcon?: boolean;
  hasAppleMobileWebAppCapable?: boolean;
  appleStatusBarStyle?: string;
  hasMaskableIcon?: boolean;
  manifestStartUrl?: string;
  manifestDisplay?: string;
  manifestScope?: string;
  manifestIconSizes?: number[];
  manifestShortName?: string;
  manifestName?: string;
  manifestBackgroundColor?: string;

  // ==========================================================================
  // Social Media Context
  // ==========================================================================
  ogImageDimensions?: { width: number; height: number };
  ogLocaleAlternate?: string[];
  ogArticleTags?: string[];
  ogArticlePublishedTime?: string;
  ogArticleAuthor?: string;
  twitterCreator?: string;
  twitterImageAlt?: string;
  linkedinAuthor?: string;
  pinterestRichPinSupport?: boolean;
  hasPinterestNopin?: boolean;
  fbAppId?: string;

  // Social Links Analysis
  totalSocialLinks?: number;
  socialLinksInHeader?: number;
  socialLinksInFooter?: number;
  socialLinksWithoutAccessibility?: number;
  socialLinksWithoutNewTab?: number;
  socialLinksWithoutNoopener?: number;
  platformsFound?: string[];
  socialLinkDetails?: Array<{
    href: string;
    platform: string;
    hasAccessibility: boolean;
    hasNewTab: boolean;
    hasNoopener: boolean;
    location: 'header' | 'footer' | 'body';
  }>;

  // ==========================================================================
  // Internal Linking Context
  // ==========================================================================
  navLinkCount?: number;
  footerLinkCount?: number;
  contextualLinkCount?: number;
  incomingInternalLinks?: number;
  selfReferencingLinks?: number;
  brokenInternalLinks?: string[];
  brokenExternalLinks?: string[];
  redirectChainLinks?: Array<{ from: string; to: string; hops: number }>;
  pageClickDepth?: number;
  clickDepth?: number;
  isStartPage?: boolean;
  nofollowInternalLinks?: number;

  // ==========================================================================
  // AI Search Context (llms.txt, robots.txt AI)
  // ==========================================================================
  llmsTxt?: {
    exists: boolean;
    valid: boolean;
    issues?: Array<{ message: string }>;
    parseResult?: {
      siteName?: string;
      siteDescription?: string;
      sections: Array<{ title: string }>;
      links: Array<{ text: string; url: string }>;
    };
  };
  robotsTxt?: {
    parseResult?: {
      userAgentBlocks: Array<{
        userAgents: string[];
        rules: Array<{ type: string; path: string }>;
      }>;
    };
  };
  headings?: {
    structure: Array<{ level: number; text: string }>;
    h1Count?: number;
    hasProperHierarchy?: boolean;
  };
  lastModified?: string; // Last-Modified header value
  semanticHtmlRatio?: number; // Ratio of semantic elements to total elements

  // ==========================================================================
  // Resources Context
  // ==========================================================================
  jsFilesCount?: number;
  jsTotalSize?: number;
  renderBlockingJs?: number;
  cssFilesCount?: number;
  cssTotalSize?: number;
  hasCriticalCss?: boolean;
  largeImages?: string[];
  imagesTotal?: number;
  modernFormatImages?: number;
  fontFilesCount?: number;
  hasFontDisplaySwap?: boolean;
  totalRequests?: number;
  totalPageSize?: number;
  uncompressedResources?: number;
  resourcesWithoutCaching?: number;
  brokenExternalResources?: number;
  brokenExternalResourceUrls?: string[];
  unminifiedResources?: number;
  unminifiedResourceUrls?: string[];

  // ==========================================================================
  // SSL/TLS Context
  // ==========================================================================
  sslCertificate?: {
    valid: boolean;
    error?: string;
    expiryDate?: string;
    nameMismatch?: boolean;
    commonName?: string;
    expectedDomain?: string;
    issuer?: string;
    selfSigned?: boolean;
  };
  tlsVersion?: string;
  hasPasswordField?: boolean;
  formsOnHttp?: number;

  // ==========================================================================
  // Analytics Context
  // ==========================================================================
  /** Whether any analytics script was detected */
  analyticsDetected?: boolean;
  /** List of detected analytics providers */
  analyticsProviders?: string[];

  // ==========================================================================
  // RSS/Atom Feed Context
  // ==========================================================================
  /** Whether RSS feed link tag is present */
  hasRssFeed?: boolean;
  /** RSS feed URL */
  rssFeedUrl?: string;
  /** Whether Atom feed link tag is present */
  hasAtomFeed?: boolean;
  /** Atom feed URL */
  atomFeedUrl?: string;

  // ==========================================================================
  // Conversion Context
  // ==========================================================================
  /** Number of CTA buttons detected */
  ctaButtonsCount?: number;
  /** Number of forms on the page */
  formCount?: number;
  /** Whether page has a WhatsApp link */
  hasWhatsAppLink?: boolean;

  // ==========================================================================
  // Sitemap Cross-Validation Context
  // ==========================================================================
  /** Whether this page URL is in the sitemap */
  pageInSitemap?: boolean;
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

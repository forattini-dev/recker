import { KeywordCloud } from './keywords.js';

export type { KeywordCloud, KeywordItem } from './keywords.js';

export type SeoStatus = 'pass' | 'warn' | 'fail' | 'info';

export interface SeoCheckEvidence {
  found?: string | number | string[];
  expected?: string | number | string[];
  location?: string;
  issue?: string;
  impact?: string;
  example?: string;
  learnMore?: string;
}

export interface SeoCheckResult {
  id: string;
  name: string;
  category: string;
  status: SeoStatus;
  message: string;
  value?: string | number;
  recommendation?: string;
  evidence?: SeoCheckEvidence;
}

export interface HeadingInfo {
  level: number;
  text: string;
  count: number;
}

export interface HeadingAnalysis {
  structure: HeadingInfo[];
  h1Count: number;
  hasProperHierarchy: boolean;
  issues: string[];
}

export interface ContentMetrics {
  /** Visible word count (text users can actually read, excluding scripts, styles, nav, etc.) */
  wordCount: number;
  /** Total word count including all text (visible + hidden in meta tags, scripts, etc.) */
  totalWordCount?: number;
  characterCount: number;
  sentenceCount: number;
  paragraphCount: number;
  readingTimeMinutes: number;
  avgWordsPerSentence: number;
  avgParagraphLength: number;
  listCount: number;
  strongTagCount: number;
  emTagCount: number;
  fleschReadingEase?: number;
  hasQuestionHeadings?: boolean;
}

export interface LinkAnalysis {
  total: number;
  internal: number;
  external: number;
  nofollow: number;
  broken: number;
  withoutText: number;
  sponsoredLinks: number;
  ugcLinks: number;
  /** Internal links using HTTP instead of HTTPS */
  internalHttpLinks?: number;
  /** URLs of internal links using HTTP */
  internalHttpLinkUrls?: string[];
}

export interface ImageAnalysis {
  total: number;
  withAlt: number;
  withoutAlt: number;
  lazy: number;
  missingDimensions: number;
  modernFormats: number;
  altTextLengths: number[];
  /** Actual alt text strings for keyword analysis */
  imageAltTexts: string[];
  imageFilenames: string[]; // For image file naming conventions
  imagesWithAsyncDecoding: number; // Count of images with decoding="async"
}

export interface SocialMetaAnalysis {
  openGraph: {
    present: boolean;
    hasTitle: boolean;
    hasDescription: boolean;
    hasImage: boolean;
    hasUrl: boolean;
    issues: string[];
  };
  twitterCard: {
    present: boolean;
    hasCard: boolean;
    hasTitle: boolean;
    hasDescription: boolean;
    hasImage: boolean;
    issues: string[];
  };
}

export interface TechnicalSeo {
  hasCanonical: boolean;
  canonicalUrl?: string;
  hasRobotsMeta: boolean;
  robotsContent?: string[]; // Changed to string[]
  hasViewport: boolean;
  hasCharset: boolean;
  hasLang: boolean;
  langValue?: string;
}

export interface SeoTiming {
  /** Time to first byte (ms) */
  ttfb?: number;
  /** Total request duration (ms) */
  total?: number;
  /** DNS lookup time (ms) */
  dns?: number;
  /** TCP connection time (ms) */
  tcp?: number;
  /** TLS handshake time (ms) */
  tls?: number;
  /** Content download time (ms) */
  download?: number;
}

/**
 * Summary statistics for the SEO report
 */
export interface SeoSummary {
  /** Total rules evaluated */
  totalChecks: number;

  /** Count by status */
  passed: number;
  warnings: number;
  errors: number;
  infos: number;

  /** Pass rate percentage (0-100) */
  passRate: number;

  /** Issues by category */
  issuesByCategory: Record<string, { passed: number; warnings: number; errors: number }>;

  /** Top issues (most critical) */
  topIssues: Array<{
    name: string;
    message: string;
    category: string;
    severity: 'error' | 'warning';
  }>;

  /** Quick wins (easy fixes with high impact) */
  quickWins: string[];

  /** Page vitals */
  vitals: {
    /** HTML size in bytes */
    htmlSize?: number;
    /** Total DOM elements */
    domElements?: number;
    /** Time to First Byte (ms) */
    ttfb?: number;
    /** Total request time (ms) */
    totalTime?: number;
    /** Visible word count (text users can read) */
    wordCount: number;
    /** Total word count including hidden text (meta, scripts, etc.) */
    totalWordCount?: number;
    /** Reading time in minutes (based on visible words) */
    readingTime: number;
    /** Total images */
    imageCount: number;
    /** Total links */
    linkCount: number;
  };

  /** Completeness scores by area (0-100) */
  completeness: {
    meta: number;
    social: number;
    technical: number;
    content: number;
    images: number;
    links: number;
  };
}

export interface SeoReport {
  url: string;
  timestamp: Date;
  grade: string;
  score: number;

  /** High-level summary with big numbers */
  summary: SeoSummary;

  /** Request timing metrics */
  timing?: SeoTiming;

  // Core checks
  checks: SeoCheckResult[];

  // Detailed analysis
  title?: {
    text: string;
    length: number;
  };
  metaDescription?: {
    text: string;
    length: number;
  };

  // OpenGraph data
  openGraph?: {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    type?: string;
    siteName?: string;
  };

  // Twitter Card data
  twitterCard?: {
    card?: string;
    title?: string;
    description?: string;
    image?: string;
    site?: string;
  };

  // Structured Data (JSON-LD)
  structuredData: {
    /** Number of JSON-LD blocks found */
    count: number;
    /** Schema.org types detected */
    types: string[];
    /** Raw JSON-LD objects */
    items: Record<string, unknown>[];
  };

  content: ContentMetrics;
  headings: HeadingAnalysis;
  keywords: KeywordCloud;
  links: LinkAnalysis;
  images: ImageAnalysis;
  social: SocialMetaAnalysis;
  technical: TechnicalSeo;
}

export interface SeoAnalyzerOptions {
  /** Base URL for resolving relative links */
  baseUrl?: string;
  /** Include content metrics analysis */
  analyzeContent?: boolean;
  /** Check for broken links (slower) */
  checkBrokenLinks?: boolean;
  /** HTTP response headers for security checks */
  responseHeaders?: Record<string, string | string[]>;
  /** Timing metrics from HTTP request (for performance rules) */
  timings?: {
    ttfb?: number;
    dns?: number;
    tcp?: number;
    tls?: number;
    download?: number;
    total?: number;
  };
  /** HTML size in bytes (for performance rules) */
  htmlSize?: number;
}

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
}

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
}


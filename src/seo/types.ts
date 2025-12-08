/**
 * SEO Analysis Types
 */

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
  name: string;
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
  wordCount: number;
  characterCount: number;
  sentenceCount: number;
  paragraphCount: number;
  readingTimeMinutes: number;
  avgWordsPerSentence: number;
  avgParagraphLength: number;
  listCount: number;
  strongTagCount: number;
  emTagCount: number;
}

export interface LinkAnalysis {
  total: number;
  internal: number;
  external: number;
  nofollow: number;
  broken: number;
  withoutText: number;
}

export interface ImageAnalysis {
  total: number;
  withAlt: number;
  withoutAlt: number;
  lazy: number;
  missingDimensions: number;
  modernFormats: number;
  altTextLengths: number[];
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

export interface SeoReport {
  url: string;
  timestamp: Date;
  grade: string;
  score: number;

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
  headings: HeadingAnalysis;
  content: ContentMetrics;
  links: LinkAnalysis;
  images: ImageAnalysis;
  social: SocialMetaAnalysis;
  technical: TechnicalSeo;
  jsonLd: {
    count: number;
    types: string[];
  };
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

// === Link Extraction ===
export interface LinkAnalysis {
  total: number;
  internal: number;
  external: number;
  nofollow: number;
  broken: number;
  withoutText: number;
  sponsoredLinks: number;
  ugcLinks: number;
}

export interface ContentMetrics {
  wordCount: number;
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

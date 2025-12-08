/**
 * SEO Analysis Types
 */

export type SeoStatus = 'pass' | 'warn' | 'fail' | 'info';

export interface SeoCheckResult {
  name: string;
  status: SeoStatus;
  message: string;
  value?: string | number;
  recommendation?: string;
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
  robotsContent?: string;
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
}

/**
 * Keyword Campaign Performance
 *
 * Builds SEO keyword candidates from page SEO analysis and measures how they
 * rank in Google results, with lightweight campaign-activity detection.
 */

import type { SearchTransport, GoogleSearchAdvancedOptions } from '../search/google.js';
import type { SeoReport } from './types.js';

export type KeywordCampaignSource = 'discovered' | 'preset';
export type CampaignResultPlacement = 'ad' | 'organic' | 'unknown';

export interface KeywordCampaignSeedInput {
  keyword: string;
  /** 'discovered' = extracted from analysis, 'preset' = configured by user */
  source?: KeywordCampaignSource;
  /** Optional page URL when extracted from a specific page */
  sourcePage?: string;
  /** Relative importance when multiple pages report same keyword */
  weight?: number;
}

export interface KeywordCampaignSeed {
  keyword: string;
  normalizedKeyword: string;
  source: KeywordCampaignSource;
  sourcePage?: string;
  weight: number;
}

export interface KeywordCampaignOptions {
  /** Starting URL / domain under analysis (e.g. https://example.com) */
  targetUrl: string;
  /** Keywords discovered from SEO output */
  discoveredKeywords?: KeywordCampaignSeedInput[] | string[];
  /** Extra keyword list configured by the user */
  presetKeywords?: string[];
  /** Minimum keyword length */
  minKeywordLength?: number;
  /** Maximum number of query evaluations */
  maxQueries?: number;
  /** Number of Google results to inspect per query */
  maxResultsPerQuery?: number;
  /** Search transport */
  transport?: SearchTransport;
  /** Search timeout */
  timeout?: number;
  country?: string;
  gl?: string;
  hl?: string;
  /** Extra search options forwarded directly to search provider. */
  searchParams?: Partial<GoogleSearchAdvancedOptions>;
  /** Optional include only keywords with this minimum frequency (from discovered data) */
  minWeight?: number;
  /** Max number of parallel SERP queries */
  searchConcurrency?: number;
  /** Delay in milliseconds before each SERP request */
  searchDelayMs?: number;
  /** Extra jitter in milliseconds for request pacing */
  searchDelayJitterMs?: number;
  /** Cooldown in milliseconds after captcha signal */
  searchCaptchaCooldownMs?: number;
  /** Extra retries for blocked/captcha SERP requests */
  searchRetryCount?: number;
  /** Retry delay in milliseconds */
  searchRetryDelayMs?: number;
  /** Stop campaign early after this many consecutive blocked/captcha SERP responses */
  searchMaxConsecutiveBlocks?: number;
}

export interface KeywordCampaignCompetitorResult {
  domain: string;
  rank: number;
  placement: CampaignResultPlacement;
  placementHint?: string;
  url: string;
  title: string;
}

export interface KeywordCampaignResult {
  keyword: string;
  source: KeywordCampaignSource;
  sourcePage?: string;
  sourceWeight: number;
  blocked?: boolean;
  blockReason?: string;
  found: boolean;
  bestPosition: number | null;
  totalChecked: number;
  matchedUrl?: string;
  matchedTitle?: string;
  matchedDisplayUrl?: string;
  placement: CampaignResultPlacement;
  placementHint?: string;
  searchUrl: string;
  searchTransport: SearchTransport;
  competitors: KeywordCampaignCompetitorResult[];
}

export interface KeywordCampaignPageStats {
  /** Page URL where the keyword originated */
  pageUrl: string;
  /** Number of tracked keywords from this page */
  tracked: number;
  /** Number of tracked keywords found in search results */
  found: number;
  /** Average position across found keywords */
  avgPosition: number | null;
  /** Percentage of tracked keywords found in SERP */
  appearanceRate: number;
  /** Number of results in top 3 */
  top3: number;
  /** Number of results in top 10 */
  top10: number;
}

export interface KeywordCampaignPageOutperformance {
  pageUrl: string;
  outperformedQueries: number;
  avgTargetPosition: number | null;
  avgCompetitorPosition: number | null;
  avgGap: number | null;
}

export interface KeywordCampaignSummary {
  queriesRequested: number;
  queriesExecuted: number;
  queriesFound: number;
  queriesBlocked: number;
  queriesCaptcha: number;
  campaignStopped: boolean;
  campaignStopReason?: string;
  avgTopPosition: number | null;
  top3Count: number;
  top10Count: 0 | number;
  topOrganicCompetitors: KeywordCampaignCompetitorSummary[];
  topPaidCompetitors: KeywordCampaignCompetitorSummary[];
  competitorCoverage: {
    organicUniqueDomains: number;
    paidUniqueDomains: number;
  };
}

export interface KeywordCampaignCompetitorSummary {
  domain: string;
  organicQueries: number;
  paidQueries: number;
  bestOrganicRank: number | null;
  bestPaidRank: number | null;
  matchedKeywords: number;
  totalOutperformedQueries: number;
  avgOutperformedGap: number | null;
  avgTargetPositionWhenOutperformed: number | null;
  avgCompetitorPositionWhenOutperformed: number | null;
  outperformedPages: KeywordCampaignPageOutperformance[];
}

export interface CampaignActivitySignal {
  active: boolean;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
}

export interface KeywordCampaignReport {
  targetUrl: string;
  targetDomain: string;
  results: KeywordCampaignResult[];
  summary: KeywordCampaignSummary;
  pageComparison: KeywordCampaignPageStats[];
  campaign: CampaignActivitySignal;
}

export function normalizeKeyword(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeHost(target: string): string {
  try {
    const parsed = new URL(target);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return target.replace(/^www\./, '').toLowerCase();
  }
}

export function clampNumber(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(1, Math.floor(value));
}

export function normalizePlacement(value: string | undefined): CampaignResultPlacement {
  if (value === 'ad') return 'ad';
  if (value === 'organic') return 'organic';
  return 'unknown';
}

export interface CompetitorTracker {
  organicQueries: number;
  paidQueries: number;
  bestOrganicRank: number | null;
  bestPaidRank: number | null;
  keywords: Set<string>;
  outperformedQueries: number;
  outperformedGapTotal: number;
  outperformedTargetPositionTotal: number;
  outperformedCompetitorPositionTotal: number;
  outperformedComparableQueries: number;
  outperformedByPage: Map<string, {
    outperformedQueries: number;
    gapTotal: number;
    targetTotal: number;
    competitorTotal: number;
    comparableQueries: number;
  }>;
}

export function toSeedArray(seed: Array<KeywordCampaignSeedInput | string> = []): KeywordCampaignSeed[] {
  return seed.map((item) => {
    if (typeof item === 'string') {
      return {
        keyword: item,
        normalizedKeyword: normalizeKeyword(item),
        source: 'preset',
        weight: 1,
      };
    }

    return {
      keyword: item.keyword,
      normalizedKeyword: normalizeKeyword(item.keyword),
      source: item.source ?? 'discovered',
      sourcePage: item.sourcePage,
      weight: item.weight ?? 1,
    };
  });
}

export interface KeywordCampaignExtractionOptions {
  maxKeywords?: number;
  minKeywordLength?: number;
  longTailTopAnchors?: number;
  longTailModifierLimit?: number;
  includeLongTail?: boolean;
  longTailMaxPhrases?: number;
  longTailMinWords?: number;
  longTailMaxWords?: number;
  includeLongTailSectionSignals?: boolean;
  longTailSectionSourceBoost?: number;
  /** Extract keywords from Schema.org JSON-LD (FAQPage, HowTo, Product, BreadcrumbList) */
  includeSchemaSeeds?: boolean;
  /** Generate keywords by composing heading path pairs (parent×child heading) */
  includeHeadingPathSeeds?: boolean;
}

/**
 * Baseline minimum token length for short-tail keyword candidates.
 *
 * Shorter strings (1-char fragments like "e", "de", "do") tend to be
 * too noisy for campaign relevance and dominate the query budget.
 */
export const DEFAULT_SERP_MIN_KEYWORD_LENGTH = 2;

export function tokenizeForLongTail(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= DEFAULT_SERP_MIN_KEYWORD_LENGTH)
    .filter((token) => !token.match(/^\d+$/))
    .slice(0, 80);
}

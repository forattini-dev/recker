/**
 * Keyword Campaign Performance
 *
 * Builds SEO keyword candidates from page SEO analysis and measures how they
 * rank in Google results, with lightweight campaign-activity detection.
 */

import { searchGoogleAdvanced } from '../search/google.js';
import type { SearchTransport } from '../search/google.js';
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
  /** Optional include only keywords with this minimum frequency (from discovered data) */
  minWeight?: number;
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
  /** Number of results in top 3 */
  top3: number;
  /** Number of results in top 10 */
  top10: number;
}

export interface KeywordCampaignSummary {
  queriesRequested: number;
  queriesExecuted: number;
  queriesFound: number;
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

function normalizeKeyword(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHost(target: string): string {
  try {
    const parsed = new URL(target);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return target.replace(/^www\./, '').toLowerCase();
  }
}

function clampNumber(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(1, Math.floor(value));
}

function normalizePlacement(value: string | undefined): CampaignResultPlacement {
  if (value === 'ad') return 'ad';
  if (value === 'organic') return 'organic';
  return 'unknown';
}

interface CompetitorTracker {
  organicQueries: number;
  paidQueries: number;
  bestOrganicRank: number | null;
  bestPaidRank: number | null;
  keywords: Set<string>;
}

function toSeedArray(seed: Array<KeywordCampaignSeedInput | string> = []): KeywordCampaignSeed[] {
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
}

/**
 * Extract keyword candidates from a single SEO report (top keywords only).
 */
export function extractKeywordCampaignSeedsFromReport(
  report: SeoReport,
  options: KeywordCampaignExtractionOptions & { sourcePage?: string } = {}
): KeywordCampaignSeed[] {
  const maxKeywords = options.maxKeywords ?? 10;
  const minKeywordLength = options.minKeywordLength ?? 2;

  return (report.keywords?.topKeywords ?? [])
    .map((item) => ({
      keyword: item.word,
      normalizedKeyword: normalizeKeyword(item.word),
      source: 'discovered' as const,
      sourcePage: options.sourcePage,
      weight: Math.max(1, Math.round(item.count)),
    }))
    .filter(seed =>
      seed.keyword.trim().length >= minKeywordLength
      && seed.normalizedKeyword.length >= minKeywordLength
      && seed.weight > 0
    )
    .slice(0, maxKeywords);
}

function sortSeedsByWeight(a: KeywordCampaignSeed, b: KeywordCampaignSeed): number {
  if (a.weight === b.weight) {
    return a.normalizedKeyword.localeCompare(b.normalizedKeyword);
  }
  return b.weight - a.weight;
}

function mergeKeywordSeeds(
  discovered: KeywordCampaignSeed[],
  preset: KeywordCampaignSeed[],
  minKeywordLength = 2,
  minWeight = 1
): KeywordCampaignSeed[] {
  const merged = new Map<string, KeywordCampaignSeed>();

  const upsert = (seed: KeywordCampaignSeed) => {
    if (!seed.normalizedKeyword || seed.normalizedKeyword.length < minKeywordLength) return;
    if (seed.weight < minWeight) return;

    const existing = merged.get(seed.normalizedKeyword);
    if (!existing) {
      merged.set(seed.normalizedKeyword, seed);
      return;
    }

    if (existing.source === 'preset' && seed.source === 'discovered') {
      merged.set(seed.normalizedKeyword, seed);
      return;
    }

    if (seed.source === existing.source && seed.weight > existing.weight) {
      merged.set(seed.normalizedKeyword, seed);
    }
  };

  for (const seed of discovered) upsert(seed);
  for (const seed of preset) upsert(seed);

  return [...merged.values()].sort(sortSeedsByWeight);
}

function buildEmptyReport(targetUrl: string, targetDomain: string): KeywordCampaignReport {
  return {
    targetUrl,
    targetDomain,
    results: [],
    summary: {
      queriesRequested: 0,
      queriesExecuted: 0,
      queriesFound: 0,
      avgTopPosition: null,
      top3Count: 0,
      top10Count: 0,
      topOrganicCompetitors: [],
      topPaidCompetitors: [],
      competitorCoverage: {
        organicUniqueDomains: 0,
        paidUniqueDomains: 0,
      },
    },
    pageComparison: [],
    campaign: {
      active: false,
      confidence: 'low',
      evidence: [],
    },
  };
}

function dedupeDomainResults(
  results: Array<{
    domain: string;
    rank: number;
    placement: CampaignResultPlacement;
    placementHint?: string;
    url: string;
    title: string;
  }>,
  targetDomain: string
): KeywordCampaignCompetitorResult[] {
  const seen = new Set<string>();
  const domainResults: KeywordCampaignCompetitorResult[] = [];

  for (const result of results) {
    if (!result.domain || result.domain === targetDomain) continue;
    if (seen.has(result.domain)) continue;
    seen.add(result.domain);

    domainResults.push({
      domain: result.domain,
      rank: result.rank,
      placement: result.placement,
      placementHint: result.placementHint,
      url: result.url,
      title: result.title,
    });
  }

  return domainResults;
}

function trackCompetitors(
  candidates: KeywordCampaignCompetitorResult[],
  keyword: string,
  targetDomain: string,
  trackers: Map<string, CompetitorTracker>
): void {
  for (const competitor of candidates) {
    if (competitor.domain === targetDomain) continue;

    const current = trackers.get(competitor.domain) ?? {
      organicQueries: 0,
      paidQueries: 0,
      bestOrganicRank: null,
      bestPaidRank: null,
      keywords: new Set<string>(),
    };

    if (competitor.placement === 'ad') {
      current.paidQueries += 1;
      if (current.bestPaidRank === null || competitor.rank < current.bestPaidRank) {
        current.bestPaidRank = competitor.rank;
      }
    } else {
      current.organicQueries += 1;
      if (current.bestOrganicRank === null || competitor.rank < current.bestOrganicRank) {
        current.bestOrganicRank = competitor.rank;
      }
    }

    current.keywords.add(keyword);
    trackers.set(competitor.domain, current);
  }
}

function finalizeCompetitorSummary(
  trackers: Map<string, CompetitorTracker>
): {
  topOrganic: KeywordCampaignCompetitorSummary[];
  topPaid: KeywordCampaignCompetitorSummary[];
  coverage: { organicUniqueDomains: number; paidUniqueDomains: number };
} {
  const ranked = [...trackers.entries()].map(([domain, tracker]) => ({
    domain,
    organicQueries: tracker.organicQueries,
    paidQueries: tracker.paidQueries,
    bestOrganicRank: tracker.bestOrganicRank,
    bestPaidRank: tracker.bestPaidRank,
    matchedKeywords: tracker.keywords.size,
    score: (tracker.organicQueries * 2) + (tracker.paidQueries * 3),
  }));

  const scoreSort = (a: { score: number; domain: string }, b: { score: number; domain: string }) =>
    b.score - a.score || a.domain.localeCompare(b.domain);

  const topOrganic = ranked
    .filter((entry) => entry.organicQueries > 0)
    .sort(scoreSort)
    .map(({ score: _ignored, ...entry }) => entry)
    .slice(0, 10);

  const topPaid = ranked
    .filter((entry) => entry.paidQueries > 0)
    .sort(scoreSort)
    .map(({ score: _ignored, ...entry }) => entry)
    .slice(0, 10);

  return {
    topOrganic,
    topPaid,
    coverage: {
      organicUniqueDomains: ranked.filter((entry) => entry.organicQueries > 0).length,
      paidUniqueDomains: ranked.filter((entry) => entry.paidQueries > 0).length,
    },
  };
}

/**
 * Analyze keyword performance from discovered + preset keyword sets.
 */
export async function analyzeKeywordCampaign(
  options: KeywordCampaignOptions
): Promise<KeywordCampaignReport> {
  const targetUrl = options.targetUrl.trim();
  const targetDomain = normalizeHost(targetUrl);
  const queryLimit = clampNumber(options.maxQueries, 20);
  const defaultCampaignResultLimit = 25;
  const searchResultLimit = Math.max(clampNumber(options.maxResultsPerQuery, defaultCampaignResultLimit), 20);
  const minKeywordLength = options.minKeywordLength ?? 2;
  const minWeight = Math.max(1, options.minWeight ?? 1);

  const discovered = toSeedArray(options.discoveredKeywords ?? []);
  const preset: KeywordCampaignSeed[] = (options.presetKeywords ?? []).map((keyword) => ({
    keyword,
    normalizedKeyword: normalizeKeyword(keyword),
    source: 'preset',
    weight: 1,
  }));
  const seeds = mergeKeywordSeeds(discovered, preset, minKeywordLength, minWeight).slice(0, queryLimit);

  const report = buildEmptyReport(targetUrl, targetDomain);

  if (seeds.length === 0 || !targetDomain) {
    report.summary.queriesRequested = 0;
    return report;
  }

  const pageBuckets = new Map<
    string,
    {
      tracked: number;
      found: number;
      totalPosition: number;
      positions: number[];
      top3: number;
      top10: number;
    }
  >();
  const competitorTrackers = new Map<string, CompetitorTracker>();
  const campaignEvidence: string[] = [];

  report.summary.queriesRequested = seeds.length;

  for (const seed of seeds) {
    const query = seed.keyword;
    try {
      const response = await searchGoogleAdvanced(query, {
        num: searchResultLimit,
        transport: options.transport,
        timeout: options.timeout,
        country: options.country,
        gl: options.gl,
        hl: options.hl,
      });

      report.summary.queriesExecuted += 1;
      const parsedResults = response.results.map((result) => ({
        ...result,
        domain: normalizeHost(result.url),
        placement: normalizePlacement(result.placement),
      }));

      const matched = parsedResults.find((result) => {
        return result.domain && result.domain === targetDomain;
      });

      const competitorCandidates = dedupeDomainResults(
        parsedResults.map((result) => ({
          domain: result.domain,
          rank: result.rank,
          placement: result.placement,
          placementHint: result.placementHint,
          url: result.url,
          title: result.title,
        })),
        targetDomain
      );
      trackCompetitors(competitorCandidates, seed.normalizedKeyword, targetDomain, competitorTrackers);

      const searchResult: KeywordCampaignResult = {
        keyword: query,
        source: seed.source,
        sourcePage: seed.sourcePage,
        sourceWeight: seed.weight,
        found: Boolean(matched),
        bestPosition: matched?.rank ?? null,
        totalChecked: parsedResults.length,
        matchedUrl: matched?.url,
        matchedTitle: matched?.title,
        matchedDisplayUrl: matched?.displayedUrl,
        placement: matched ? normalizePlacement(matched.placement) : 'unknown',
        placementHint: matched?.placementHint,
        searchUrl: response.searchUrl,
        searchTransport: response.transport.used,
        competitors: competitorCandidates,
      };

      if (searchResult.found && searchResult.bestPosition !== null) {
        const position = searchResult.bestPosition;
        report.summary.queriesFound += 1;
        if (position <= 3) report.summary.top3Count += 1;
        if (position <= 10) report.summary.top10Count += 1;

        if (searchResult.placement === 'ad') {
          campaignEvidence.push(`${query} aparece como anúncio em posição #${position}`);
        } else {
          campaignEvidence.push(`${query} aparece orgânico em posição #${position}`);
        }

        const pageKey = seed.sourcePage ?? (seed.source === 'preset' ? 'preset-queries' : 'unknown');
        const bucket = pageBuckets.get(pageKey) ?? {
          tracked: 0,
          found: 0,
          totalPosition: 0,
          positions: [],
          top3: 0,
          top10: 0,
        };

        bucket.tracked += 1;
        bucket.found += 1;
        bucket.totalPosition += position;
        bucket.positions.push(position);
        if (position <= 3) bucket.top3 += 1;
        if (position <= 10) bucket.top10 += 1;
        pageBuckets.set(pageKey, bucket);
      } else {
        const pageKey = seed.sourcePage ?? (seed.source === 'preset' ? 'preset-queries' : 'unknown');
        const bucket = pageBuckets.get(pageKey) ?? {
          tracked: 0,
          found: 0,
          totalPosition: 0,
          positions: [],
          top3: 0,
          top10: 0,
        };
        bucket.tracked += 1;
        pageBuckets.set(pageKey, bucket);
      }

      report.results.push(searchResult);
    } catch {
      const pageKey = seed.sourcePage ?? (seed.source === 'preset' ? 'preset-queries' : 'unknown');
      const bucket = pageBuckets.get(pageKey) ?? {
        tracked: 0,
        found: 0,
        totalPosition: 0,
        positions: [],
        top3: 0,
        top10: 0,
      };
      bucket.tracked += 1;
      pageBuckets.set(pageKey, bucket);
      report.summary.queriesExecuted += 1;
      report.results.push({
        keyword: seed.keyword,
        source: seed.source,
        sourcePage: seed.sourcePage,
        sourceWeight: seed.weight,
        found: false,
        bestPosition: null,
        totalChecked: searchResultLimit,
        placement: 'unknown',
        searchUrl: '',
        searchTransport: options.transport ?? 'undici',
        competitors: [],
      });
      campaignEvidence.push(`Falha ao buscar keyword "${seed.keyword}"`);
    }
  }

  const foundPositions = report.results
    .filter((entry) => entry.found && entry.bestPosition !== null)
    .map((entry) => entry.bestPosition as number);

  if (foundPositions.length > 0) {
    report.summary.avgTopPosition = Math.round(
      foundPositions.reduce((acc, pos) => acc + pos, 0) / foundPositions.length
    );
  }

  const hasTop3 = foundPositions.some((position) => position <= 3);
  const hasTop10 = foundPositions.some((position) => position <= 10);

  report.campaign = {
    active: foundPositions.some((position) => position <= 10),
    confidence: hasTop3 ? 'high' : hasTop10 ? 'medium' : foundPositions.length > 0 ? 'low' : 'low',
    evidence: campaignEvidence,
  };

  const competitorSummary = finalizeCompetitorSummary(competitorTrackers);
  report.summary.topOrganicCompetitors = competitorSummary.topOrganic;
  report.summary.topPaidCompetitors = competitorSummary.topPaid;
  report.summary.competitorCoverage = competitorSummary.coverage;

  report.pageComparison = [...pageBuckets.entries()].map(([pageUrl, bucket]) => ({
    pageUrl,
    tracked: bucket.tracked,
    found: bucket.found,
    avgPosition: bucket.found > 0 ? Math.round(bucket.totalPosition / bucket.found) : null,
    top3: bucket.top3,
    top10: bucket.top10,
  })).sort((a, b) => {
    if (a.avgPosition === null) return 1;
    if (b.avgPosition === null) return -1;
    return a.avgPosition - b.avgPosition;
  });

  return report;
}

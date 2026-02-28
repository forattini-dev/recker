/**
 * SEO SERP Campaign Logic
 *
 * Types, seed builders, and campaign runner used across SEO handlers.
 */

import {
  analyzeKeywordCampaign,
  extractKeywordCampaignSeedsFromReport,
} from '../../seo/index.js'
import { normalizeKeyword } from '../../seo/keyword-campaign-shared.js'
import type { SeoReport } from '../../seo/types.js'
import { parseSpiderSerpConfig, type SpiderSerpOptionConfig } from '../utils/serp-config.js'
import { inferSearchLocaleFromUrl } from '../../search/google.js'

// ─────────────────────────── URL Utilities ───────────────────────────────────

export function normalizeUrl(url: string): string {
  return url.startsWith('http') ? url : `https://${url}`
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0]
  }
}

// ─────────────────────────── Types ───────────────────────────────────────────

export type SerpSeedPage = {
  url: string
  seoReport?: SeoReport
}

export type SeoCrawlerSerpConfig = SpiderSerpOptionConfig

type SeoCrawlerSerpSeed = {
  keyword: string
  sourcePage?: string
  sourceWeight: number
}

// Heuristic tuned for Brazilian/portuguese SERP seeding:
// - short-tail: avoid tiny terms that are mostly artigos/preposições
// - long-tail: allow one-char less so 4+ char pivots can still combine with context
const SERP_MIN_SHORT_KEYWORD_LENGTH = 5
const SERP_MIN_LONG_TERM_LENGTH = SERP_MIN_SHORT_KEYWORD_LENGTH - 1

export type SeoCrawlerSerpPlan = {
  short: SeoCrawlerSerpSeed[]
  longTail: SeoCrawlerSerpSeed[]
  ordered: SeoCrawlerSerpSeed[]
}

export type SeoCrawlerSerpRun = {
  campaign: Awaited<ReturnType<typeof analyzeKeywordCampaign>>
  plan: SeoCrawlerSerpPlan
}

// ─────────────────────────── Seed Helpers ────────────────────────────────────

function normalizeSerpSeedPermutationKey(value: string): string {
  const normalized = normalizeKeyword(value)
  const tokens = normalized.split(/\s+/).filter((token) => token.length > 0)
  if (tokens.length === 0) return ''
  if (tokens.length === 1) return tokens[0]
  return [...tokens].sort().join(' ')
}

function getSeedWordCount(value: string): number {
  const normalized = normalizeKeyword(value)
  if (!normalized) return 0
  return normalized.split(/\s+/).filter(Boolean).length
}

function isHighQualitySerpSeed(value: string): boolean {
  const normalized = normalizeKeyword(value)
  if (!normalized) return false

  const tokens = normalized.split(/\s+/).filter(Boolean)
  if (tokens.length === 1) {
    return tokens[0].length >= SERP_MIN_SHORT_KEYWORD_LENGTH
  }

  if (tokens.some((token) => token.length < 3)) {
    return false
  }

  const shortTokenCount = tokens.filter((token) => token.length < SERP_MIN_SHORT_KEYWORD_LENGTH).length
  if (shortTokenCount > 0) {
    return false
  }

  return true
}

function sortSeedCandidatesByWeightThenAlpha(
  a: SeoCrawlerSerpSeed,
  b: SeoCrawlerSerpSeed,
): number {
  if (a.sourceWeight !== b.sourceWeight) {
    return b.sourceWeight - a.sourceWeight
  }
  return a.keyword.localeCompare(b.keyword)
}

function dedupeByPermutation(seeds: SeoCrawlerSerpSeed[]): SeoCrawlerSerpSeed[] {
  const deduplicated = new Map<string, SeoCrawlerSerpSeed>()

  for (const seed of seeds) {
    const key = normalizeSerpSeedPermutationKey(seed.keyword)
    if (!key) continue

    const existing = deduplicated.get(key)
    if (!existing) {
      deduplicated.set(key, seed)
      continue
    }

    if (seed.sourceWeight > existing.sourceWeight) {
      deduplicated.set(key, seed)
    }
  }

  return [...deduplicated.values()]
}

// ─────────────────────────── Campaign Builder ────────────────────────────────

export function buildSerpCampaignSeeds(
  pages: SerpSeedPage[],
  topKeywordsPerPage: number,
  maxSeeds: number,
): SeoCrawlerSerpPlan {
  const shortBuckets = new Map<string, SeoCrawlerSerpSeed>()
  const longBuckets = new Map<string, SeoCrawlerSerpSeed>()
  const shortLimit = Math.max(1, topKeywordsPerPage)
  const longCandidateLimit = Math.max(maxSeeds, shortLimit * 2)
  const targetShortCount = Math.max(
    1,
    Math.min(maxSeeds, Math.ceil(maxSeeds * 0.45)),
  )

  for (const page of pages) {
    if (!page.seoReport) continue

    const shortSeeds = extractKeywordCampaignSeedsFromReport(page.seoReport, {
      maxKeywords: shortLimit,
      includeLongTail: false,
      minKeywordLength: SERP_MIN_SHORT_KEYWORD_LENGTH,
      sourcePage: page.url,
    }).filter((seed) => isHighQualitySerpSeed(seed.keyword)).map((seed) => ({
      keyword: seed.keyword,
      sourcePage: seed.sourcePage,
      sourceWeight: Math.max(1, Math.round(seed.weight)),
    }))

    const longCandidates = extractKeywordCampaignSeedsFromReport(page.seoReport, {
      maxKeywords: longCandidateLimit,
      minKeywordLength: SERP_MIN_LONG_TERM_LENGTH,
      sourcePage: page.url,
    }).filter((seed) => isHighQualitySerpSeed(seed.keyword))

    const addSeed = (seed: { keyword: string; sourcePage?: string; sourceWeight: number }, target: Map<string, SeoCrawlerSerpSeed>) => {
      const key = normalizeSerpSeedPermutationKey(seed.keyword)
      if (!key) return

      const existing = target.get(key)
      if (!existing) {
        target.set(key, { ...seed })
        return
      }

      existing.sourceWeight += seed.sourceWeight
      if (!existing.sourcePage && seed.sourcePage) {
        existing.sourcePage = seed.sourcePage
      }
    }

    for (const item of shortSeeds.slice(0, shortLimit)) {
      addSeed(item, shortBuckets)
    }

    for (const item of longCandidates) {
      if (getSeedWordCount(item.keyword) <= 1) continue
      addSeed({
        keyword: item.keyword,
        sourcePage: page.url,
        sourceWeight: Math.max(1, Math.round(item.weight)),
      }, longBuckets)
    }
  }

  const shortSeedList = dedupeByPermutation([...shortBuckets.values()].sort(sortSeedCandidatesByWeightThenAlpha))
  const shortCount = Math.min(targetShortCount, shortSeedList.length)

  const shortRemaining = targetShortCount - shortCount
  const longCount = Math.max(0, maxSeeds - shortCount)
  const longBudget = Math.max(longCount + shortRemaining, 0)

  const longSeedList = dedupeByPermutation(
    [...longBuckets.values()].sort((a, b) => {
      const aWords = getSeedWordCount(a.keyword)
      const bWords = getSeedWordCount(b.keyword)
      if (aWords !== bWords) return aWords - bWords
      return sortSeedCandidatesByWeightThenAlpha(a, b)
    }),
  )

  // Only overflow long-tail budget into short-tail if we have enough seeds to fill ordered up to maxSeeds.
  // When total available seeds (short + long) can't fill maxSeeds, respect targetShortCount.
  const actualLongCount = Math.min(longBudget, longSeedList.length)
  const extraShortBudget = longBudget - actualLongCount
  const canFillOrdered = shortSeedList.length + actualLongCount >= maxSeeds
  const finalShortCount = canFillOrdered
    ? Math.min(shortCount + extraShortBudget, shortSeedList.length)
    : shortCount

  const ordered = [...shortSeedList.slice(0, finalShortCount), ...longSeedList.slice(0, longBudget)]
    .slice(0, maxSeeds)
    .sort((a, b) => {
      const aWords = getSeedWordCount(a.keyword)
      const bWords = getSeedWordCount(b.keyword)
      if (aWords !== bWords) return aWords - bWords
      return b.sourceWeight - a.sourceWeight
    })

  return {
    short: shortSeedList.slice(0, finalShortCount),
    longTail: longSeedList,
    ordered,
  }
}

export async function runCrawlerSerpCampaign(
  targetUrl: string,
  pages: SerpSeedPage[],
  config: SeoCrawlerSerpConfig
): Promise<SeoCrawlerSerpRun | undefined> {
  const seeds = buildSerpCampaignSeeds(
    pages,
    config.topKeywordsLimit,
    config.queriesLimit,
  )

  if (seeds.ordered.length === 0) return undefined

  const inferredLocale = inferSearchLocaleFromUrl(targetUrl)
  const hasExplicitLocale = Boolean(
    config.searchOptions.country?.trim()
    || config.searchOptions.gl?.trim()
    || config.searchOptions.hl?.trim()
  )

  const resolvedSearchParams = {
    ...config.searchOptions,
  }

  if (!hasExplicitLocale && inferredLocale) {
    resolvedSearchParams.country = inferredLocale.country
    resolvedSearchParams.gl = inferredLocale.gl
    resolvedSearchParams.hl = inferredLocale.hl
  }

  const discoveredKeywords = seeds.ordered.map((seed) => ({
    keyword: seed.keyword,
    source: 'discovered' as const,
    sourcePage: seed.sourcePage,
    weight: seed.sourceWeight,
  }))

  const campaign = await analyzeKeywordCampaign({
    targetUrl,
    discoveredKeywords,
    maxQueries: config.queriesLimit,
    maxResultsPerQuery: config.resultsPerQuery,
    minKeywordLength: 2,
    searchDelayMs: config.searchDelayMs,
    searchDelayJitterMs: config.searchDelayJitterMs,
    searchCaptchaCooldownMs: config.searchCaptchaCooldownMs,
    searchMaxConsecutiveBlocks: config.searchMaxConsecutiveBlocks,
    searchRetryCount: config.searchRetryCount,
    searchRetryDelayMs: config.searchRetryDelayMs,
    searchConcurrency: config.searchConcurrency,
    searchParams: resolvedSearchParams,
  })

  return {
    campaign,
    plan: seeds,
  }
}

// ─────────────────────────── Formatters ──────────────────────────────────────

export function formatSerpSummaryRows(campaign: Awaited<ReturnType<typeof analyzeKeywordCampaign>>): Array<{
  keyword: string;
  found: boolean;
  blocked?: boolean;
  blockReason?: string;
  position: number | null;
  targetUrl?: string;
  searchUrl: string;
}> {
  return campaign.results.slice(0, 12).map((item) => ({
    keyword: item.keyword,
    found: item.found,
    blocked: item.blocked,
    blockReason: item.blockReason,
    position: item.bestPosition,
    targetUrl: item.matchedUrl,
    searchUrl: item.searchUrl,
  }))
}

export function getSerpComparisonRows(campaign: Awaited<ReturnType<typeof analyzeKeywordCampaign>>): Array<{
  pageUrl: string;
  tracked: number;
  found: number;
  appearanceRate: string;
  avgPosition: string;
  top3: number;
  top10: number;
}> {
  return campaign.pageComparison.map((item) => ({
    pageUrl: item.pageUrl,
    tracked: item.tracked,
    found: item.found,
    appearanceRate: `${item.appearanceRate.toFixed(1)}%`,
    avgPosition: item.avgPosition === null ? 'n/a' : String(item.avgPosition),
    top3: item.top3,
    top10: item.top10,
  }))
}

export function getSerpCompetitorRows(
  competitors: Awaited<ReturnType<typeof analyzeKeywordCampaign>>['summary']['topOrganicCompetitors']
): Array<{
  domain: string;
  queries: number;
  matchedKeywords: number;
  wins: number;
  avgGap: string;
  bestPages: string;
}> {
  return competitors.map((item) => ({
    domain: item.domain,
    queries: item.organicQueries,
    matchedKeywords: item.matchedKeywords,
    wins: item.totalOutperformedQueries,
    avgGap: item.avgOutperformedGap === null ? 'n/a' : String(item.avgOutperformedGap),
    bestPages: item.outperformedPages
      .slice(0, 2)
      .map((page) => `${page.pageUrl} (${page.outperformedQueries})`)
      .join(' | ') || '—',
  }))
}

export function formatKeywordList(keywords: string[], maxItems: number): string {
  const shown = keywords
    .slice(0, maxItems)
    .map((keyword) => keyword.trim())
    .filter(Boolean)

  if (shown.length === 0) return '  —'
  return `  ${shown.join('  ·  ')}`
}

// Re-export for convenience
export { parseSpiderSerpConfig }

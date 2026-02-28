import type { KeywordCampaignResult } from '../../seo/keyword-campaign.js'
import type { SpiderSerpOptionConfig } from './serp-config.js'
import type { SeoCrawlerSerpPlan, SeoCrawlerSerpRun, SerpSeedPage } from '../handlers/seo.js'
import { runCrawlerSerpCampaign } from '../handlers/seo.js'

export type SpiderSerpCampaignSeed = {
  keyword: string
  sourcePage?: string
  sourceWeight: number
}

export interface SpiderSerpCampaignPayload {
  summary: {
    queriesRequested: number
    queriesExecuted: number
    queriesFound: number
    avgTopPosition: number | null
    top3Count: number
    top10Count: number
    topOrganicCompetitors: Array<{
      domain: string
      matchedKeywords: number
      totalOutperformedQueries?: number
      organicQueries?: number
      paidQueries?: number
      avgOutperformedGap?: number | null
    }>
  }
  campaign: {
    active: boolean
    confidence: 'high' | 'medium' | 'low'
    evidence: string[]
  }
  results: Array<{
    keyword: string
    found: boolean
    position: number | null
    targetUrl?: string
    searchUrl: string
  }>
  pageComparison: Array<{
    pageUrl: string
    tracked: number
    found: number
    appearanceRate: string
    avgPosition: string
    top3: number
    top10: number
  }>
  seedPlan: {
    short: SpiderSerpCampaignSeed[]
    longTail: SpiderSerpCampaignSeed[]
    ordered: SpiderSerpCampaignSeed[]
  }
}

export async function runSpiderKeywordCampaign(
  targetUrl: string,
  pages: SerpSeedPage[],
  config: SpiderSerpOptionConfig,
): Promise<SeoCrawlerSerpRun | undefined> {
  const normalizedPages: Parameters<typeof runCrawlerSerpCampaign>[1] = pages.map((page) => ({
    url: page.url,
    seoReport: page.seoReport,
  }));

  return runCrawlerSerpCampaign(
    targetUrl,
    normalizedPages,
    config,
  )
}

function toKeywordCampaignResult(item: KeywordCampaignResult): {
  keyword: string;
  found: boolean;
  position: number | null;
  targetUrl?: string;
  searchUrl: string;
} {
  return {
    keyword: item.keyword,
    found: Boolean(item.found),
    position: item.bestPosition,
    targetUrl: item.matchedUrl,
    searchUrl: item.searchUrl,
  }
}

function toSerpSeedMap(plan: SeoCrawlerSerpPlan['ordered']): SpiderSerpCampaignSeed[] {
  return plan.map((seed) => ({
    keyword: seed.keyword,
    sourcePage: seed.sourcePage,
    sourceWeight: seed.sourceWeight,
  }))
}

export function toSerpPayload(campaign: SeoCrawlerSerpRun): SpiderSerpCampaignPayload {
  return {
    summary: {
      queriesRequested: campaign.campaign.summary.queriesRequested,
      queriesExecuted: campaign.campaign.summary.queriesExecuted,
      queriesFound: campaign.campaign.summary.queriesFound,
      avgTopPosition: campaign.campaign.summary.avgTopPosition,
      top3Count: campaign.campaign.summary.top3Count,
      top10Count: campaign.campaign.summary.top10Count,
      topOrganicCompetitors: campaign.campaign.summary.topOrganicCompetitors,
    },
    campaign: campaign.campaign.campaign,
    results: campaign.campaign.results.slice(0, 12).map((item) => toKeywordCampaignResult(item)),
    pageComparison: campaign.campaign.pageComparison.map((item) => ({
      pageUrl: item.pageUrl,
      tracked: item.tracked,
      found: item.found,
      appearanceRate: `${item.appearanceRate.toFixed(1)}%`,
      avgPosition: item.avgPosition === null ? 'n/a' : String(item.avgPosition),
      top3: item.top3,
      top10: item.top10,
    })),
    seedPlan: {
      short: toSerpSeedMap(campaign.plan.short),
      longTail: toSerpSeedMap(campaign.plan.longTail),
      ordered: toSerpSeedMap(campaign.plan.ordered),
    },
  }
}

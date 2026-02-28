import { searchGoogleAdvanced } from '../search/google.js';
import {
  clampNumber,
  normalizeHost,
  normalizeKeyword,
  normalizePlacement,
  toSeedArray,
  type CampaignResultPlacement,
  type CompetitorTracker,
  type KeywordCampaignCompetitorResult,
  type KeywordCampaignCompetitorSummary,
  type KeywordCampaignOptions,
  type KeywordCampaignReport,
  type KeywordCampaignResult,
  type KeywordCampaignSeed,
  type KeywordCampaignSource,
  DEFAULT_SERP_MIN_KEYWORD_LENGTH,
} from './keyword-campaign-shared.js';
import {
  isLikelyBlocked,
  isLikelyCaptcha,
  sleep,
  buildSerpBlockReason,
  DEFAULT_SERP_MAX_CONSECUTIVE_BLOCKS,
  DEFAULT_SERP_SEARCH_CAPTCHA_COOLDOWN_MS,
  DEFAULT_SERP_SEARCH_DELAY_MS,
  DEFAULT_SERP_SEARCH_JITTER_MS,
  DEFAULT_SERP_SEARCH_RETRY_COUNT,
  DEFAULT_SERP_SEARCH_RETRY_DELAY_MS,
} from './keyword-campaign-seed-core.js';
import { mergeKeywordSeeds } from './keyword-campaign-seed-advanced.js';

function normalizePageUrl(value: string | undefined): string {
  return value && value.trim().length > 0 ? value.trim() : 'unknown-page';
}

function ensureCompetitorTracker(
  trackers: Map<string, CompetitorTracker>,
  domain: string
): CompetitorTracker {
  const normalizedDomain = domain.toLowerCase();
  const existing = trackers.get(normalizedDomain);
  if (existing) {
    return existing;
  }

  const created: CompetitorTracker = {
    organicQueries: 0,
    paidQueries: 0,
    bestOrganicRank: null,
    bestPaidRank: null,
    keywords: new Set<string>(),
    outperformedQueries: 0,
    outperformedGapTotal: 0,
    outperformedTargetPositionTotal: 0,
    outperformedCompetitorPositionTotal: 0,
    outperformedComparableQueries: 0,
    outperformedByPage: new Map(),
  };

  trackers.set(normalizedDomain, created);
  return created;
}

function trackOutperformance(
  tracker: CompetitorTracker,
  sourcePage: string,
  targetPosition: number | null,
  competitorPosition: number
): void {
  tracker.outperformedQueries += 1;

  const bucket = tracker.outperformedByPage.get(sourcePage) ?? {
    outperformedQueries: 0,
    gapTotal: 0,
    targetTotal: 0,
    competitorTotal: 0,
    comparableQueries: 0,
  };

  bucket.outperformedQueries += 1;

  if (targetPosition !== null) {
    const gap = targetPosition - competitorPosition;
    bucket.gapTotal += gap;
    bucket.targetTotal += targetPosition;
    bucket.competitorTotal += competitorPosition;
    bucket.comparableQueries += 1;

    tracker.outperformedGapTotal += gap;
    tracker.outperformedTargetPositionTotal += targetPosition;
    tracker.outperformedCompetitorPositionTotal += competitorPosition;
    tracker.outperformedComparableQueries += 1;
  }

  tracker.outperformedByPage.set(sourcePage, bucket);
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
      queriesBlocked: 0,
      queriesCaptcha: 0,
      campaignStopped: false,
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

    const current = ensureCompetitorTracker(trackers, competitor.domain);

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
  }
}

function makeSummaryEntry(
  domain: string,
  tracker: CompetitorTracker
): KeywordCampaignCompetitorSummary {
  const outperformedPages = [...tracker.outperformedByPage.entries()]
    .map(([pageUrl, pageStats]) => ({
      pageUrl,
      outperformedQueries: pageStats.outperformedQueries,
      avgTargetPosition: pageStats.comparableQueries > 0
        ? Math.round(pageStats.targetTotal / pageStats.comparableQueries)
        : null,
      avgCompetitorPosition: pageStats.comparableQueries > 0
        ? Math.round(pageStats.competitorTotal / pageStats.comparableQueries)
        : null,
      avgGap: pageStats.comparableQueries > 0
        ? Math.round(pageStats.gapTotal / pageStats.comparableQueries)
        : null,
    }))
    .sort((a, b) => b.outperformedQueries - a.outperformedQueries || a.pageUrl.localeCompare(b.pageUrl));

  return {
    domain,
    organicQueries: tracker.organicQueries,
    paidQueries: tracker.paidQueries,
    bestOrganicRank: tracker.bestOrganicRank,
    bestPaidRank: tracker.bestPaidRank,
    matchedKeywords: tracker.keywords.size,
    totalOutperformedQueries: tracker.outperformedQueries,
    avgOutperformedGap: tracker.outperformedComparableQueries > 0
      ? Math.round(tracker.outperformedGapTotal / tracker.outperformedComparableQueries)
      : null,
    avgTargetPositionWhenOutperformed: tracker.outperformedComparableQueries > 0
      ? Math.round(tracker.outperformedTargetPositionTotal / tracker.outperformedComparableQueries)
      : null,
    avgCompetitorPositionWhenOutperformed: tracker.outperformedComparableQueries > 0
      ? Math.round(tracker.outperformedCompetitorPositionTotal / tracker.outperformedComparableQueries)
      : null,
    outperformedPages,
  };
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
    tracker,
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
    .map(({ domain, tracker }) => makeSummaryEntry(domain, tracker))
    .slice(0, 10);

  const topPaid = ranked
    .filter((entry) => entry.paidQueries > 0)
    .sort(scoreSort)
    .map(({ domain, tracker }) => makeSummaryEntry(domain, tracker))
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
  const minKeywordLength = options.minKeywordLength ?? DEFAULT_SERP_MIN_KEYWORD_LENGTH;
  const minWeight = Math.max(1, options.minWeight ?? 1);
  const searchConcurrency = clampNumber(options.searchConcurrency, 4);
  const searchDelayMs = Math.max(0, options.searchDelayMs ?? DEFAULT_SERP_SEARCH_DELAY_MS);
  const searchDelayJitterMs = Math.max(0, options.searchDelayJitterMs ?? DEFAULT_SERP_SEARCH_JITTER_MS);
  const searchCaptchaCooldownMs = Math.max(0, options.searchCaptchaCooldownMs ?? DEFAULT_SERP_SEARCH_CAPTCHA_COOLDOWN_MS);
  const searchRetryCount = Math.max(0, options.searchRetryCount ?? DEFAULT_SERP_SEARCH_RETRY_COUNT);
  const searchRetryDelayMs = Math.max(0, options.searchRetryDelayMs ?? DEFAULT_SERP_SEARCH_RETRY_DELAY_MS);
  const searchMaxConsecutiveBlocks = Math.max(0, options.searchMaxConsecutiveBlocks ?? DEFAULT_SERP_MAX_CONSECUTIVE_BLOCKS);

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
      top3: number;
      top10: number;
    }
  >();
  const competitorTrackers = new Map<string, CompetitorTracker>();
  const campaignEvidence: string[] = [];
  const campaignControl = {
    consecutiveBlockSignals: 0,
    limitConsecutiveBlockSignals: searchMaxConsecutiveBlocks,
  };
  type SeedSearchExecution = {
    result: KeywordCampaignResult;
    wasBlocked: boolean;
    wasCaptcha: boolean;
    pageKey: string;
    normalizedKeyword: string;
  };

  const resultsByIndex: Array<SeedSearchExecution | undefined> = new Array(seeds.length);

  const requestTiming = {
    nextRequestAt: 0,
    delayMultiplier: 1,
    backoffMultiplier: 1,
    cooldownBonus: 1,
    lastFailurePenaltyAppliedAt: 0,
    lastFailureAt: 0,
  };
  let requestGate = Promise.resolve();

  const runInGate = async (task: () => Promise<void> | void): Promise<void> => {
    const previous = requestGate;
    let release: (() => void) | undefined;
    requestGate = new Promise((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      await task();
    } finally {
      release?.();
    }
  };

  const gate = async () => {
    await runInGate(async () => {
      const now = Date.now();
      const targetDelay = Math.round(Math.max(0, searchDelayMs * requestTiming.delayMultiplier));
      const jitter = searchDelayJitterMs > 0
        ? Math.floor(Math.random() * (searchDelayJitterMs + 1))
        : 0;
      const availableAt = Math.max(requestTiming.nextRequestAt, now);
      const waitMs = Math.max(0, availableAt - now);
      requestTiming.nextRequestAt = availableAt + targetDelay + jitter;
      if (waitMs > 0) {
        await sleep(waitMs);
      }
    });
  };

  const applySignalCooldown = (signalType: 'blocked' | 'captcha' | 'success') => {
    const now = Date.now();
    if (signalType === 'success') {
      requestTiming.delayMultiplier = Math.max(1, requestTiming.delayMultiplier * 0.75);
      requestTiming.backoffMultiplier = Math.max(1, requestTiming.backoffMultiplier * 0.85);
      requestTiming.lastFailureAt = 0;
      return;
    }

    requestTiming.lastFailureAt = now;
    requestTiming.delayMultiplier = Math.min(8, requestTiming.delayMultiplier * 1.8);
    requestTiming.backoffMultiplier = Math.min(4, requestTiming.backoffMultiplier + 1);

    const isConsecutiveCaptcha = signalType === 'captcha'
      && now - requestTiming.lastFailurePenaltyAppliedAt < searchCaptchaCooldownMs;
    const consecutivePenaltyMultiplier = isConsecutiveCaptcha
      ? 1 + Math.min(5, Math.floor((requestTiming.backoffMultiplier - 1) * 2))
      : 1;
    if (signalType === 'captcha') {
      requestTiming.lastFailurePenaltyAppliedAt = now;
    }

    const cooldown = Math.round(
      searchCaptchaCooldownMs * requestTiming.backoffMultiplier * consecutivePenaltyMultiplier
    );
    requestTiming.nextRequestAt = Math.max(
      requestTiming.nextRequestAt,
      now + cooldown,
    );
  };

  report.summary.queriesRequested = seeds.length;

  const registerSignal = (
    wasBlocked: boolean,
    keyword: string,
    source: KeywordCampaignSource,
    sourcePage: string | undefined
  ): void => {
    if (report.summary.campaignStopped) return;
    if (!wasBlocked) {
      campaignControl.consecutiveBlockSignals = 0;
      return;
    }

    const hasBlockLimit = campaignControl.limitConsecutiveBlockSignals > 0;
    if (!hasBlockLimit) {
      return;
    }

    campaignControl.consecutiveBlockSignals += 1;
    if (campaignControl.consecutiveBlockSignals >= campaignControl.limitConsecutiveBlockSignals) {
      report.summary.campaignStopped = true;
      report.summary.campaignStopReason = `Parada antecipada por ${campaignControl.consecutiveBlockSignals} sinais consecutivos de bloqueio/captcha para evitar bloqueio adicional`;
      campaignEvidence.push(
        `${source}: "${keyword}" ${sourcePage ? `(${sourcePage}) ` : ''}alcançou limite de bloqueio; pausa de segurança ativa para reduzir WAF/challenge.`
      );
    }
  };

  const executeSearch = async (
    seed: KeywordCampaignSeed,
    pageKey: string,
    normalizedKeyword: string
  ): Promise<SeedSearchExecution | undefined> => {
    const query = seed.keyword;
    let response: Awaited<ReturnType<typeof searchGoogleAdvanced>> | undefined;
    let lastError: unknown;
    let attempts = 0;

    if (report.summary.campaignStopped) {
      return undefined;
    }

    while (attempts <= searchRetryCount) {
      if (report.summary.campaignStopped) {
        return undefined;
      }

      attempts += 1;
      if (report.summary.campaignStopped) {
        return undefined;
      }

      await gate();
      if (report.summary.campaignStopped) {
        return undefined;
      }

      try {
        response = await searchGoogleAdvanced(query, {
          num: searchResultLimit,
          maxResults: searchResultLimit,
          transport: options.transport,
          timeout: options.timeout,
          country: options.country,
          gl: options.gl,
          hl: options.hl,
          ...(options.searchParams ?? {}),
        });
      } catch (error) {
        lastError = error;
      }

      if (!response) {
        if (attempts <= searchRetryCount) {
          const retryDelay = Math.min(searchRetryDelayMs * attempts, 6_000) + Math.floor(Math.random() * (searchDelayJitterMs + 1));
          requestTiming.nextRequestAt = Math.max(
            requestTiming.nextRequestAt,
            Date.now() + retryDelay,
          );
          continue;
        }
        break;
      }

      const wasCaptcha = isLikelyCaptcha(response.captcha);
      const wasBlocked = isLikelyBlocked(response.block);
      if ((wasCaptcha || wasBlocked) && attempts <= searchRetryCount) {
        const retryDelay = Math.min(searchRetryDelayMs * attempts, 6_000) + Math.floor(Math.random() * (searchDelayJitterMs + 1));
        applySignalCooldown(wasCaptcha ? 'captcha' : 'blocked');
        requestTiming.nextRequestAt = Math.max(
          requestTiming.nextRequestAt,
          Date.now() + retryDelay + (wasCaptcha ? searchCaptchaCooldownMs : 0),
        );
        response = undefined;
        continue;
      }

      applySignalCooldown('success');

      break;
    }

    if (!response) {
      return {
        result: {
          keyword: query,
          source: seed.source,
          sourcePage: seed.sourcePage,
          sourceWeight: seed.weight,
          blocked: true,
          blockReason: 'request failed',
          found: false,
          bestPosition: null,
          totalChecked: searchResultLimit,
          placement: 'unknown',
          searchUrl: '',
          searchTransport: options.transport ?? 'undici',
          competitors: [],
        },
        wasBlocked: true,
        wasCaptcha: false,
        pageKey,
        normalizedKeyword,
      };
    }

    const wasBlocked = isLikelyBlocked(response.block);
    const wasCaptcha = isLikelyCaptcha(response.captcha);
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

    if (wasCaptcha && searchCaptchaCooldownMs > 0) {
      requestTiming.nextRequestAt = Math.max(
        requestTiming.nextRequestAt,
        Date.now() + searchCaptchaCooldownMs,
      );
    }

    return {
      result: {
        keyword: query,
        source: seed.source,
        sourcePage: seed.sourcePage,
        sourceWeight: seed.weight,
        blocked: wasBlocked || wasCaptcha,
        blockReason: buildSerpBlockReason(response.block, response.captcha),
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
      },
      wasBlocked,
      wasCaptcha,
      pageKey,
      normalizedKeyword,
    };
  };

  const workers = Math.max(1, Math.min(searchConcurrency, seeds.length));
  const workerState = { nextIndex: 0 };

  const finalizeExecution = (execution: SeedSearchExecution): void => {
    const {
      result: searchResult,
      wasBlocked,
      wasCaptcha,
      pageKey,
      normalizedKeyword,
    } = execution;

    const bucket = pageBuckets.get(pageKey) ?? {
      tracked: 0,
      found: 0,
      totalPosition: 0,
      top3: 0,
      top10: 0,
    };
    bucket.tracked += 1;

    report.summary.queriesExecuted += 1;
    if (wasBlocked) report.summary.queriesBlocked += 1;
    if (wasCaptcha) report.summary.queriesCaptcha += 1;
    if (searchResult.placement === 'unknown' && searchResult.blocked) {
      campaignEvidence.push(`Falha ao buscar keyword "${searchResult.keyword}"`);
    }

    trackCompetitors(searchResult.competitors, normalizedKeyword, targetDomain, competitorTrackers);

    if (searchResult.found && searchResult.bestPosition !== null) {
      const position = searchResult.bestPosition;
      report.summary.queriesFound += 1;
      if (position <= 3) report.summary.top3Count += 1;
      if (position <= 10) report.summary.top10Count += 1;

      if (searchResult.placement === 'ad') {
        campaignEvidence.push(`${searchResult.keyword} aparece como anúncio em posição #${position}`);
      } else {
        campaignEvidence.push(`${searchResult.keyword} aparece orgânico em posição #${position}`);
      }

      for (const competitor of searchResult.competitors) {
        if (competitor.rank < position) {
          const tracker = ensureCompetitorTracker(competitorTrackers, competitor.domain);
          trackOutperformance(tracker, pageKey, position, competitor.rank);
        }
      }

      bucket.found += 1;
      bucket.totalPosition += position;
      if (position <= 3) bucket.top3 += 1;
      if (position <= 10) bucket.top10 += 1;
    }

    pageBuckets.set(pageKey, bucket);
  };

  const runWorker = async () => {
    while (true) {
      if (report.summary.campaignStopped) break;
      if (workerState.nextIndex >= seeds.length) break;

      const currentIndex = workerState.nextIndex++;
      const seed = seeds[currentIndex];
      const pageKey = normalizePageUrl(
        seed.sourcePage ?? (seed.source === 'preset' ? 'preset-queries' : 'unknown')
      );
      const execution = await executeSearch(seed, pageKey, seed.normalizedKeyword);
      if (!execution) {
        if (report.summary.campaignStopped) break;
        continue;
      }

      resultsByIndex[currentIndex] = execution;
      registerSignal(
        execution.wasBlocked || execution.wasCaptcha,
        execution.result.keyword,
        execution.result.source,
        execution.result.sourcePage
      );
      finalizeExecution(execution);
    }
  };

  await Promise.all(
    new Array(workers).fill(null).map(() => runWorker())
  );

  report.results = resultsByIndex
    .filter((entry): entry is SeedSearchExecution => Boolean(entry))
    .map(({ result }) => result);

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
    appearanceRate: bucket.tracked > 0
      ? Number(((bucket.found / bucket.tracked) * 100).toFixed(1))
      : 0,
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

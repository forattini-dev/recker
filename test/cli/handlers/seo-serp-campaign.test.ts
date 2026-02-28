import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildSerpCampaignSeeds, parseSeoCrawlerSerpConfig, runCrawlerSerpCampaign } from '../../../src/cli/handlers/seo.js';

const { analyzeKeywordCampaignMock } = vi.hoisted(() => ({
  analyzeKeywordCampaignMock: vi.fn(),
}));

vi.mock('../../../src/seo/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/seo/index.js')>('../../../src/seo/index.js');
  return {
    ...actual,
    analyzeKeywordCampaign: analyzeKeywordCampaignMock,
  };
});

const fakeCampaign = {
  targetUrl: 'https://example.com',
  targetDomain: 'example.com',
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

function buildPage(url: string, keywordWeightMap: Array<{ word: string; count: number }>) {
  return {
    url,
    seoReport: {
      url,
      title: {
        text: 'Como vender maquininha de cartão para empresas e aumentar faturamento',
      },
      metaDescription: {
        text: 'Descubra como receber com cartão, vender mais e controlar seu caixa com maquininha de cartão.',
      },
      keywords: {
        topKeywords: keywordWeightMap,
      },
      headings: {
        structure: [
          { level: 1, text: 'Guia de maquininha para negócios', count: 0 },
          { level: 2, text: 'Pagamento com cartão para sua empresa', count: 0 },
        ],
        h1Count: 1,
        hasProperHierarchy: true,
        issues: [],
      },
      linkAnchorTexts: [
        'compre maquininha para sua empresa',
        'maquininha de cartão barata',
        'preço da maquininha para negócios',
      ],
    } as unknown as any,
  } as unknown as any;
}

const pages = [
  buildPage('https://example.com/loja', [
    { word: 'maquininha', count: 45 },
    { word: 'cartão', count: 33 },
    { word: 'empresa', count: 27 },
    { word: 'pagar', count: 20 },
    { word: 'taxa', count: 19 },
  ]),
  buildPage('https://example.com/servicos', [
    { word: 'maquininha', count: 38 },
    { word: 'pix', count: 29 },
    { word: 'pagamento', count: 24 },
    { word: 'empresa', count: 18 },
    { word: 'receber', count: 17 },
    { word: 'loja', count: 16 },
  ]),
];

const config = {
  enabled: true,
  topKeywordsLimit: 2,
  queriesLimit: 8,
  resultsPerQuery: 5,
  searchOptions: {
    country: 'br',
    transport: 'curl',
  },
  searchDelayMs: 150,
  searchDelayJitterMs: 80,
  searchCaptchaCooldownMs: 400,
  searchRetryCount: 1,
  searchRetryDelayMs: 300,
};

function mapWordCount(value: string): number {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function normalizeSignature(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .sort()
    .join(' ');
}

describe('SEO crawler SERP campaign helpers', () => {
  beforeEach(() => {
    analyzeKeywordCampaignMock.mockReset();
    analyzeKeywordCampaignMock.mockResolvedValue(fakeCampaign);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses CLI SEO defaults and normalizes SERP options', () => {
    const parsed = parseSeoCrawlerSerpConfig({ serp: true });

    expect(parsed).toMatchObject({
      enabled: true,
      topKeywordsLimit: 5,
      queriesLimit: 10,
      resultsPerQuery: 10,
      searchOptions: {},
    });
  });

  it('uses aliases, validates transport and rejects non-positive limits', () => {
    const parsed = parseSeoCrawlerSerpConfig({
      serp: true,
      'serp-top-keywords': 0,
      serpQueryLimit: '0',
      'serp-results-per-query': -3,
      serpTransport: 'curl',
      serpCountry: 'br',
      serpGl: 'br',
      serpHl: 'pt-br',
    });

    expect(parsed.topKeywordsLimit).toBe(5);
    expect(parsed.queriesLimit).toBe(10);
    expect(parsed.resultsPerQuery).toBe(10);
    expect(parsed.searchOptions.transport).toBe('curl');
    expect(parsed.searchOptions.country).toBe('br');
    expect(parsed.searchOptions.gl).toBe('br');
    expect(parsed.searchOptions.hl).toBe('pt-br');
  });

  it('builds short-tail first, then long-tail, with unique long-tail permutations', () => {
    const plan = buildSerpCampaignSeeds(pages, 2, 4);

    expect(plan.short).toHaveLength(2);
    expect(plan.short.every((item) => mapWordCount(item.keyword) === 1)).toBe(true);

    const orderedWordCounts = plan.ordered.map((item) => mapWordCount(item.keyword));
    expect(orderedWordCounts.slice(0, plan.short.length).every((count) => count === 1)).toBe(true);
    expect(orderedWordCounts.slice(plan.short.length).every((count) => count >= 2 && count <= 4)).toBe(true);
    expect(plan.ordered.length).toBeGreaterThanOrEqual(plan.short.length);

    // Ordered list must be globally non-decreasing by word count (menor → maior)
    for (let i = 1; i < orderedWordCounts.length; i++) {
      expect(orderedWordCounts[i]).toBeGreaterThanOrEqual(orderedWordCounts[i - 1]);
    }

    const seen = new Map<string, number>();
    for (const seed of plan.ordered) {
      if (mapWordCount(seed.keyword) < 2) continue;
      const signature = normalizeSignature(seed.keyword);
      const current = seen.get(signature) ?? 0;
      seen.set(signature, current + 1);
      expect(current).toBe(0);
    }
  });

  it('uniques short-tail seeds across pages and preserves per-page top keyword caps', () => {
    const pageA = buildPage('https://example.com/a', [
      { word: 'conta', count: 90 },
      { word: 'digital', count: 80 },
      { word: 'empresa', count: 70 },
      { word: 'pagar', count: 65 },
      { word: 'taxa', count: 60 },
      { word: 'banco', count: 50 },
      { word: 'saque', count: 40 },
    ])

    const pageB = buildPage('https://example.com/b', [
      { word: 'maquininha', count: 100 },
      { word: 'cartão', count: 90 },
      { word: 'pix', count: 85 },
      { word: 'empresa', count: 84 },
      { word: 'credito', count: 75 },
      { word: 'caixa', count: 62 },
      { word: 'venda', count: 50 },
    ])

    const plan = buildSerpCampaignSeeds([pageA, pageB], 4, 12)

    expect(plan.short.length).toBe(6)
    const shortWords = new Set(plan.short.map((seed) => normalizeSignature(seed.keyword)))
    expect(shortWords.size).toBe(plan.short.length)

    for (const seed of plan.short) {
      expect(seed.keyword.split(' ')).toHaveLength(1)
    }

    const hasA = plan.short.some((seed) => seed.sourcePage === 'https://example.com/a')
    const hasB = plan.short.some((seed) => seed.sourcePage === 'https://example.com/b')
    expect(hasA).toBe(true)
    expect(hasB).toBe(true)
  })

  it('filters weak short tokens from SERP short-tail and long-tail seeds', () => {
    const noisyPage = buildPage('https://example.com/noisy', [
      { word: 'para', count: 40 },
      { word: 'com', count: 34 },
      { word: 'seu', count: 30 },
      { word: 'que', count: 24 },
      { word: 'tudo', count: 18 },
      { word: 'stone', count: 16 },
      { word: 'conta', count: 14 },
      { word: 'pagamento', count: 12 },
      { word: 'maquininha', count: 11 },
      { word: 'negócio', count: 9 },
    ])

    const plan = buildSerpCampaignSeeds([noisyPage], 5, 12)

    expect(plan.short).toHaveLength(5)
    expect(plan.short.some((seed) => seed.keyword === 'para')).toBe(false)
    expect(plan.short.some((seed) => seed.keyword === 'com')).toBe(false)
    expect(plan.short.some((seed) => seed.keyword === 'seu')).toBe(false)
    expect(plan.short.some((seed) => seed.keyword === 'que')).toBe(false)
    expect(plan.short.some((seed) => seed.keyword === 'tudo')).toBe(false)

    expect(plan.short.map((seed) => seed.keyword)).toEqual(
      expect.arrayContaining(['maquininha', 'conta', 'pagamento', 'stone', 'negócio']),
    )

    const hasWeakLongTail = plan.longTail.some((seed) => {
      const tokens = seed.keyword.split(/\s+/).filter(Boolean)
      return tokens.some((token) => token.length < 5)
    })

    expect(hasWeakLongTail).toBe(false)
  })

  it('runs analyze with the same ordered seed list that is passed as payload', async () => {
    const planInput = [{
      url: 'https://example.com/multi',
      seoReport: buildPage('https://example.com/multi', [
        { word: 'conta', count: 30 },
        { word: 'digital', count: 20 },
        { word: 'empresa', count: 12 },
      ]).seoReport,
    }]

    const run = await runCrawlerSerpCampaign('https://example.com', planInput as any, {
      ...config,
      topKeywordsLimit: 3,
      queriesLimit: 6,
      serpTransport: 'undici',
    })

    expect(run).toBeDefined()
    const runPlan = run!.plan.ordered.map((seed) => seed.keyword)

    const analyzeInput = analyzeKeywordCampaignMock.mock.calls[0]?.[0]
    const queryList = analyzeInput.discoveredKeywords.map((item: { keyword: string }) => item.keyword)

    expect(queryList).toEqual(runPlan)
    expect(run!.plan.short.length).toBeGreaterThan(0)
    expect(run!.plan.ordered.slice(0, run!.plan.short.length).every((seed) => seed.keyword.trim().split(/\s+/).length === 1)).toBe(true)
  })

  it('uses the remaining query budget for long-tail after short-tail extraction', () => {
    const plan = buildSerpCampaignSeeds([pages[0]], 5, 10);

    expect(plan.short.length).toBeGreaterThan(0);
    expect(plan.ordered.length).toBeGreaterThanOrEqual(plan.short.length);
    expect(plan.ordered.slice(0, plan.short.length).every((seed) => mapWordCount(seed.keyword) === 1)).toBe(true);
    expect(plan.ordered.slice(plan.short.length).every((seed) => mapWordCount(seed.keyword) >= 2)).toBe(true);
    if (plan.ordered.length > plan.short.length) {
      expect(plan.longTail.length).toBeGreaterThan(0);
      expect(plan.longTail.some((seed) => mapWordCount(seed.keyword) >= 2)).toBe(true);
    } else {
      expect(plan.longTail).toHaveLength(0);
    }

    // Ordered list must be globally non-decreasing by word count (menor → maior)
    const orderedWordCounts = plan.ordered.map((s) => mapWordCount(s.keyword));
    for (let i = 1; i < orderedWordCounts.length; i++) {
      expect(orderedWordCounts[i]).toBeGreaterThanOrEqual(orderedWordCounts[i - 1]);
    }
  });

  it('dedupes long-tail permutation candidates across pages and keeps short seeds capped', () => {
    const pageA = buildPage('https://example.com/casa', [
      { word: 'maquininha', count: 55 },
      { word: 'casa', count: 21 },
      { word: 'empresa', count: 11 },
    ]);
    const pageB = buildPage('https://example.com/loja', [
      { word: 'pagamento', count: 34 },
      { word: 'conta', count: 19 },
      { word: 'empresa', count: 13 },
    ]);

    pageA.seoReport.linkAnchorTexts = ['abrir conta empresa', 'empresa conta aberta'];
    pageB.seoReport.linkAnchorTexts = ['conta abrir empresa', 'empresa abrir conta'];

    const plan = buildSerpCampaignSeeds([pageA, pageB], 2, 20);

    expect(plan.short.every((seed) => mapWordCount(seed.keyword) === 1)).toBe(true);
    expect(plan.short.length).toBeLessThanOrEqual(4);

    const longTail = plan.longTail.filter((seed) => mapWordCount(seed.keyword) > 1);
    expect(longTail.length).toBeGreaterThan(0);
    const signatures = new Map<string, number>();
    for (const seed of longTail) {
      const signature = normalizeSignature(seed.keyword);
      expect(signatures.get(signature) ?? 0).toBe(0);
      signatures.set(signature, 1);
      expect(mapWordCount(seed.keyword)).toBeLessThanOrEqual(4);
    }
  });

  it('limits the final SERP seed plan by queriesLimit and feeds analyze with same ordered seeds', async () => {
    const run = await runCrawlerSerpCampaign('https://example.com', pages, {
      ...config,
      queriesLimit: 4,
    });

    expect(run).not.toBeUndefined();
    expect(run!.campaign).toBe(fakeCampaign);
    expect(run!.plan.ordered.length).toBeGreaterThan(0);
    expect(run!.plan.ordered.length).toBeLessThanOrEqual(4);
    expect(run!.plan.short.length).toBeLessThanOrEqual(2);

    const analyzeCall = analyzeKeywordCampaignMock.mock.calls[0]?.[0];
    expect(analyzeCall).toBeDefined();
    expect(analyzeCall.maxQueries).toBe(4);
    expect(analyzeCall.maxResultsPerQuery).toBe(5);
    expect(analyzeCall.searchDelayMs).toBe(150);
    expect(analyzeCall.searchDelayJitterMs).toBe(80);
    expect(analyzeCall.searchCaptchaCooldownMs).toBe(400);
    expect(analyzeCall.searchRetryCount).toBe(1);
    expect(analyzeCall.searchRetryDelayMs).toBe(300);
    expect(analyzeCall.discoveredKeywords.length).toBe(run!.plan.ordered.length);
    expect(analyzeCall.discoveredKeywords.map((item: { keyword: string }) => item.keyword)).toEqual(
      run!.plan.ordered.map((item) => item.keyword),
    );

    const shortCount = run!.plan.short.length;
    expect(analyzeCall.discoveredKeywords
      .slice(0, shortCount)
      .every((item: { keyword: string }) => mapWordCount(item.keyword) === 1)
    ).toBe(true);

    // Ordered list must be globally non-decreasing by word count (menor → maior)
    const orderedWordCounts = run!.plan.ordered.map((s) => mapWordCount(s.keyword));
    for (let i = 1; i < orderedWordCounts.length; i++) {
      expect(orderedWordCounts[i]).toBeGreaterThanOrEqual(orderedWordCounts[i - 1]);
    }
  });
});

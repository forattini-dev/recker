import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runSpiderKeywordCampaign } from '../../../src/cli/utils/serp-campaign.js';

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

const baseConfig = {
  searchConcurrency: 4,
  searchDelayMs: 450,
  searchDelayJitterMs: 250,
  searchCaptchaCooldownMs: 1200,
  searchRetryCount: 1,
  searchRetryDelayMs: 900,
};

describe('Spider SERP campaign keyword seed pipeline', () => {
  beforeEach(() => {
    analyzeKeywordCampaignMock.mockReset();
    analyzeKeywordCampaignMock.mockResolvedValue(fakeCampaign);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates short-tail seeds from multiple pages and keeps top weights', async () => {
    const pages = [
      {
        url: 'https://example.com/maquinas',
        seoReport: {
          keywords: {
            topKeywords: [
              { word: 'maquininha', count: 12 },
              { word: 'cartão', count: 7 },
              { word: 'conta', count: 5 },
            ],
          },
        },
      },
      {
        url: 'https://example.com/pix',
        seoReport: {
          keywords: {
            topKeywords: [
              { word: 'cartão', count: 10 },
              { word: 'pix', count: 8 },
              { word: 'faturamento', count: 3 },
            ],
          },
        },
      },
    ];

    const result = await runSpiderKeywordCampaign('https://example.com', pages as any, {
      enabled: true,
      topKeywordsLimit: 2,
      queriesLimit: 5,
      resultsPerQuery: 10,
      ...baseConfig,
      searchOptions: {},
    });

    expect(result).toBeDefined();
    expect(result?.campaign).toBe(fakeCampaign);

    const call = analyzeKeywordCampaignMock.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(call.maxQueries).toBe(5);
    expect(call.discoveredKeywords.length).toBeGreaterThanOrEqual(3);

    const weightsByKeyword = new Map(call.discoveredKeywords.map((item: { keyword: string; weight: number }) => [item.keyword, item.weight]));
    expect(call.discoveredKeywords.map((item: { keyword: string }) => item.keyword)).toEqual(expect.arrayContaining([
      'maquininha',
      'cartão',
      'cartão conta',
    ]));
    expect(call.discoveredKeywords.some((item: { keyword: string }) => item.keyword === 'pix')).toBe(false);
    expect(weightsByKeyword.get('cartão')).toBe(17);
    expect(weightsByKeyword.get('maquininha')).toBe(12);
    expect(call.discoveredKeywords.every((item: { keyword: string }) => item.keyword.length > 0)).toBe(true);
    expect(result?.plan.ordered.length).toBeGreaterThan(0);
  });

  it('respects queriesLimit as global seed cap', async () => {
    const pages = [
      { url: 'https://example.com/a', seoReport: { keywords: { topKeywords: [{ word: 'venda', count: 20 }, { word: 'loja', count: 15 }, { word: 'cartao', count: 12 }] } } },
      { url: 'https://example.com/b', seoReport: { keywords: { topKeywords: [{ word: 'loja', count: 18 }, { word: 'receita', count: 11 }, { word: 'pix', count: 9 }] } } },
    ];

    await runSpiderKeywordCampaign('https://example.com', pages as any, {
      enabled: true,
      topKeywordsLimit: 3,
      queriesLimit: 2,
      resultsPerQuery: 8,
      ...baseConfig,
      searchOptions: {},
    });

    const call = analyzeKeywordCampaignMock.mock.calls[0]?.[0];
    expect(call.maxQueries).toBe(2);
    expect(call.discoveredKeywords).toHaveLength(2);
  });

  it('infers locale from target URL when no explicit SERP country/gl/hl is provided', async () => {
    const pages = [{
      url: 'https://www.stone.com.br/maquinas',
      seoReport: { keywords: { topKeywords: [{ word: 'maquininha', count: 20 }] } },
    }];

    await runSpiderKeywordCampaign('https://www.stone.com.br', pages as any, {
      enabled: true,
      topKeywordsLimit: 2,
      queriesLimit: 2,
      resultsPerQuery: 10,
      ...baseConfig,
      searchOptions: {},
    });

    const call = analyzeKeywordCampaignMock.mock.calls[0]?.[0];
    expect(call.searchParams.country).toBe('br');
    expect(call.searchParams.gl).toBe('br');
    expect(call.searchParams.hl).toBe('pt-BR');
  });

  it('keeps explicit SERP locale when provided even with target URL hint', async () => {
    const pages = [{
      url: 'https://www.stone.com.br/maquinas',
      seoReport: { keywords: { topKeywords: [{ word: 'maquininha', count: 20 }] } },
    }];

    await runSpiderKeywordCampaign('https://www.stone.com.br', pages as any, {
      enabled: true,
      topKeywordsLimit: 2,
      queriesLimit: 2,
      resultsPerQuery: 10,
      ...baseConfig,
      searchOptions: {
        gl: 'de',
        hl: 'de',
      },
    });

    const call = analyzeKeywordCampaignMock.mock.calls[0]?.[0];
    expect(call.searchParams.country).toBeUndefined();
    expect(call.searchParams.gl).toBe('de');
    expect(call.searchParams.hl).toBe('de');
  });
});

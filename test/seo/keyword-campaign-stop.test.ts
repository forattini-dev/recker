import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { analyzeKeywordCampaign } from '../../src/seo/keyword-campaign.js';

const { mockSearchGoogleAdvanced } = vi.hoisted(() => ({
  mockSearchGoogleAdvanced: vi.fn(),
}));

vi.mock('../../src/search/google.js', () => ({
  searchGoogleAdvanced: mockSearchGoogleAdvanced,
}));

function blockedResult(keyword: string) {
  return {
    query: keyword,
    searchUrl: `https://www.google.com.br/search?q=${encodeURIComponent(keyword)}`,
    results: [],
    block: {
      blocked: true,
      reason: 'waf',
      confidence: 0.9,
      description: 'HTTP redirect is often used for challenge interstitials',
    },
    captcha: {
      detected: false,
      confidence: 0,
    },
    transport: {
      requested: 'curl',
      used: 'curl',
      fallbackUsed: false,
      impersonateAvailable: true,
    },
  };
}

function successfulResult(keyword: string, rank = 1) {
  return {
    query: keyword,
    searchUrl: `https://www.google.com.br/search?q=${encodeURIComponent(keyword)}`,
    results: [
      {
        rank,
        title: 'Stone',
        url: 'https://www.stone.com.br/',
        placement: 'organic',
      },
    ],
    block: {
      blocked: false,
      confidence: 0,
    },
    captcha: {
      detected: false,
      confidence: 0,
    },
    transport: {
      requested: 'curl',
      used: 'curl',
      fallbackUsed: false,
      impersonateAvailable: true,
    },
  };
}

describe('analyzeKeywordCampaign block control', () => {
  beforeEach(() => {
    mockSearchGoogleAdvanced.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('stops after consecutive block signals and marks campaign as interrupted', async () => {
    mockSearchGoogleAdvanced
      .mockResolvedValueOnce(blockedResult('stone'))
      .mockResolvedValueOnce(blockedResult('conta'))
      .mockResolvedValueOnce(successfulResult('pagamento'))
      .mockResolvedValueOnce(successfulResult('maquininha'));

    const report = await analyzeKeywordCampaign({
      targetUrl: 'https://www.stone.com.br',
      discoveredKeywords: [
        'stone',
        'conta',
        'pagamento',
        'maquininha',
        'negócio',
      ],
      searchConcurrency: 1,
      maxResultsPerQuery: 5,
      searchDelayMs: 0,
      searchDelayJitterMs: 0,
      searchRetryCount: 0,
      searchRetryDelayMs: 0,
      searchMaxConsecutiveBlocks: 2,
    });

    expect(mockSearchGoogleAdvanced).toHaveBeenCalledTimes(2);
    expect(report.summary.queriesExecuted).toBe(2);
    expect(report.summary.campaignStopped).toBe(true);
    expect(report.summary.campaignStopReason).toContain('2');
  });

  it('keeps executing when block burst is broken by a success', async () => {
    mockSearchGoogleAdvanced
      .mockResolvedValueOnce(blockedResult('stone'))
      .mockResolvedValueOnce(successfulResult('conta'))
      .mockResolvedValueOnce(blockedResult('pagamento'))
      .mockResolvedValueOnce(blockedResult('maquininha'))
      .mockResolvedValueOnce(blockedResult('venda'));

    const report = await analyzeKeywordCampaign({
      targetUrl: 'https://www.stone.com.br',
      discoveredKeywords: [
        'stone',
        'conta',
        'pagamento',
        'maquininha',
        'venda',
      ],
      searchConcurrency: 1,
      maxResultsPerQuery: 5,
      searchDelayMs: 0,
      searchDelayJitterMs: 0,
      searchRetryCount: 0,
      searchRetryDelayMs: 0,
      searchMaxConsecutiveBlocks: 2,
    });

    expect(mockSearchGoogleAdvanced).toHaveBeenCalledTimes(4);
    expect(report.summary.queriesExecuted).toBe(4);
    expect(report.summary.campaignStopped).toBe(true);
    expect(report.summary.campaignStopReason).toContain('2');
  });
});

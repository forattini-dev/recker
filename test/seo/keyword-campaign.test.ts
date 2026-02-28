import { describe, expect, it } from 'vitest';
import { extractKeywordCampaignSeedsFromReport } from '../../src/seo/keyword-campaign.js';
import { generateKeywordCloud } from '../../src/seo/keywords.js';
import { SeoAnalyzer } from '../../src/seo/analyzer.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function stripHtmlText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildFixtureKeywordCampaignReport(
  fixtureFile = 'keyword-campaign-long-tail.html',
) {
  const fixturePath = join(process.cwd(), 'test/seo/fixtures', fixtureFile);
  const html = readFileSync(fixturePath, 'utf8');

  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
  const metaDescription = /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i.exec(html)?.[1] ?? '';
  const headingPattern = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const anchorPattern = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  const rawText = stripHtmlText(html);

  const headingMatches = [...html.matchAll(headingPattern)].map((match) => ({
    level: Number(match[1]),
    text: match[2]?.trim() ?? '',
    count: 0,
  }));

  const headingTexts = headingMatches.map((entry) => entry.text.toLowerCase());
  const linkAnchorTexts = [...html.matchAll(anchorPattern)]
    .map((match) => stripHtmlText(match[1] ?? ''))
    .filter(Boolean);

  const keywordCloud = generateKeywordCloud({
    visibleText: rawText,
    title,
    description: metaDescription,
  }, 40);

  return {
    url: 'https://www.exemplo.com/maquininha-cartao-empresa',
    title: { text: title },
    metaDescription: { text: metaDescription },
    headings: {
      structure: headingMatches,
      h1Count: headingMatches.filter((entry) => entry.level === 1).length,
      hasProperHierarchy: headingTexts.length > 1,
      issues: [],
    },
    linkAnchorTexts,
    keywords: {
      topKeywords: keywordCloud.topKeywords.filter((item) => item.word.length >= 2),
    },
  } as unknown as any;
}

function buildConnectorNoiseFixtureReport() {
  return buildFixtureKeywordCampaignReport('keyword-campaign-connector-noise.html');
}

function buildSectionDrivenKeywordCampaignReport() {
  return {
    url: 'https://www.exemplo.com/guia-maquininha',
    keywords: {
      topKeywords: [
        { word: 'maquininha', count: 24 },
        { word: 'cartão', count: 16 },
        { word: 'empresa', count: 13 },
        { word: 'comprar', count: 11 },
      ],
    },
    contentSections: [
      {
        headingPath: ['guia de compra', 'maquininha de cartão para empresas'],
        source: 'heading',
        tagName: 'h2',
        headingLevel: 2,
        text: 'guia de compra de maquininha de cartão para empresas',
        wordCount: 9,
        linkDensity: 0,
        weight: 1.9,
      },
      {
        headingPath: ['guia de compra', 'maquininha de cartão para empresas'],
        source: 'paragraph',
        tagName: 'p',
        headingLevel: 2,
        text:
          'compre maquininha de cartão para sua empresa com taxa de aquisição baixa e suporte completo',
        wordCount: 16,
        linkDensity: 0,
        weight: 1.4,
      },
    ] as any,
    headings: {
      structure: [],
      h1Count: 0,
      hasProperHierarchy: true,
      issues: [],
    },
    linkAnchorTexts: [],
  } as unknown as any;
}

function buildSchemaHeadingKeywordCampaignReport() {
  return {
    url: 'https://www.exemplo.com/fluxo-vendas',
    title: {
      text: 'Como ativar maquininha para receber pagamentos em minutos',
    },
    metaDescription: {
      text: 'Configure sua maquininha em poucos passos e comece a receber pagamentos com segurança.',
    },
    keywords: {
      topKeywords: [
        { word: 'maquininha', count: 28 },
        { word: 'pagamentos', count: 14 },
        { word: 'empresa', count: 12 },
        { word: 'receber', count: 10 },
      ],
    },
    headings: {
      structure: [
        { level: 1, text: 'Como ativar maquininha', count: 0 },
        { level: 2, text: 'Fluxo de pagamento da empresa', count: 0 },
        { level: 2, text: 'Checklist de configuração', count: 0 },
      ],
      h1Count: 1,
      hasProperHierarchy: true,
      issues: [],
    },
    contentSections: [
      {
        headingPath: ['Configuração de pagamento', 'Como ativar maquininha'],
        source: 'paragraph',
        tagName: 'p',
        headingLevel: 2,
        text:
          'Como ativar maquininha da empresa e receber pagamentos com QR code sem complicação.',
        wordCount: 16,
        linkDensity: 0.06,
        weight: 1.6,
      },
    ] as any,
    linkAnchorTexts: [
      'Como ativar maquininha',
      'Guia de pagamentos para empresa',
      'Configuração da maquininha',
    ],
    structuredData: {
      count: 4,
      types: ['FAQPage', 'HowTo', 'Product', 'BreadcrumbList'],
      items: [
        {
          '@type': 'FAQPage',
          mainEntity: [
            { '@type': 'Question', name: 'Como ativar maquininha' },
            { '@type': 'Question', name: 'Como receber pagamentos' },
          ],
        },
        {
          '@type': 'HowTo',
          step: [
            { name: 'Configurar conta', text: 'Conectar conta bancária' },
            { name: 'Receber pagamentos', text: 'Testar transação inicial' },
          ],
        },
        {
          '@type': 'Product',
          name: 'Maquininha',
          category: 'Pagamentos',
          brand: { name: 'Stone' },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { name: 'Home' },
            { name: 'Pagamentos' },
            { name: 'Ativação' },
          ],
        },
      ],
    },
  } as unknown as any;
}

async function buildReportFromFixture(fileName: string) {
  const fixturePath = join(process.cwd(), 'test/seo/fixtures', fileName);
  const html = readFileSync(fixturePath, 'utf8');
  const analyzer = await SeoAnalyzer.fromHtml(html, {
    baseUrl: 'https://www.exemplo.com/como-ativar-maquininha',
  });
  return analyzer.analyze();
}

describe('Keyword campaign seed extraction', () => {
  const report = {
    url: 'https://www.exemplo.com/financas/conta-digital',
    title: {
      text: 'Como abrir conta digital para pagar menos tarifas',
    },
    metaDescription: {
      text: 'Dicas para escolher a melhor conta digital para sua empresa e comparar tarifas bancárias.',
    },
    keywords: {
      topKeywords: [
        { word: 'conta', count: 12 },
        { word: 'digital', count: 10 },
        { word: 'financeiro', count: 5 },
      ],
    },
    headings: {
      structure: [
        { level: 1, text: 'Conta digital para empresas', count: 0 },
        { level: 2, text: 'Como abrir conta digital', count: 0 },
        { level: 2, text: 'Melhor tarifa bancária para MEI', count: 0 },
        { level: 3, text: 'Comparação de bancos digitais', count: 0 },
      ],
      h1Count: 1,
      hasProperHierarchy: true,
      issues: [],
    },
    summary: {
      totalChecks: 1,
      passed: 0,
      warnings: 0,
      errors: 0,
      infos: 0,
      notApplicable: 0,
      suggestions: 0,
      passRate: 0,
      issuesByCategory: {},
      topIssues: [],
      quickWins: [],
      completeness: {
        meta: 0,
        social: 0,
        technical: 0,
        content: 0,
        images: 0,
        links: 0,
      },
      vitals: {
        wordCount: 0,
        htmlSize: 0,
        domElements: 0,
        ttfb: 0,
        totalTime: 0,
        imageCount: 0,
        linkCount: 0,
        readingTime: 0,
      },
    },
    timestamp: new Date(),
    grade: 'A',
    score: 100,
    timing: {},
    checks: [],
    content: {
      wordCount: 0,
      characterCount: 0,
      sentenceCount: 0,
      paragraphCount: 0,
      readingTimeMinutes: 0,
      avgWordsPerSentence: 0,
      avgParagraphLength: 0,
      listCount: 0,
      strongTagCount: 0,
      emTagCount: 0,
      imageAltTexts: [],
      imageFilenames: [],
      imagesWithAsyncDecoding: 0,
      fleschReadingEase: 0,
      hasQuestionHeadings: false,
      totalWordCount: 0,
    },
    links: {
      total: 0,
      internal: 0,
      external: 0,
      nofollow: 0,
      broken: 0,
      withoutText: 0,
      sponsoredLinks: 0,
      ugcLinks: 0,
      internalHttpLinks: 0,
      internalHttpLinkUrls: [],
    },
    images: {
      total: 0,
      withAlt: 0,
      withoutAlt: 0,
      lazy: 0,
      missingDimensions: 0,
      modernFormats: 0,
      imageAltTexts: [],
      imageFilenames: [],
      imagesWithAsyncDecoding: 0,
    },
    structuredData: {
      count: 0,
      types: [],
      items: [],
    },
    technical: {
      hasCanonical: true,
      hasRobotsMeta: false,
      hasViewport: false,
      hasCharset: true,
      hasLang: false,
      langValue: undefined,
    },
    social: {
      openGraph: {
        present: false,
        hasTitle: false,
        hasDescription: false,
        hasImage: false,
        hasUrl: false,
        issues: [],
      },
      twitterCard: {
        present: false,
        hasCard: false,
        hasTitle: false,
        hasDescription: false,
        hasImage: false,
        hasUrl: false,
        issues: [],
      },
    },
  } as unknown as any;

  it('includes long-tail phrases anchored to top keywords', () => {
    const seeds = extractKeywordCampaignSeedsFromReport(report, { maxKeywords: 12 });

    const words = seeds.filter((seed) => !seed.normalizedKeyword.includes(' ')).map((seed) => seed.keyword);
    expect(words).toContain('conta');
    expect(words).toContain('digital');

    const phrases = seeds.filter((seed) => seed.normalizedKeyword.includes(' ')).map((seed) => seed.keyword);
    expect(phrases.length).toBeGreaterThan(0);
    expect(phrases).toContain('conta digital');
    expect(phrases.some((phrase) => phrase.split(' ').length === 3)).toBe(true);
    expect(phrases.some((phrase) => phrase.split(' ').length >= 2)).toBe(true);
  });

  it('can disable long-tail generation', () => {
    const seeds = extractKeywordCampaignSeedsFromReport(report, {
      maxKeywords: 10,
      includeLongTail: false,
    });

    expect(seeds.every((seed) => !seed.normalizedKeyword.includes(' '))).toBe(true);
    expect(seeds).toHaveLength(3);
  });

  it('generates long-tail seeds from real SEO report HTML (2 to 4 words)', () => {
    const seoReport = buildFixtureKeywordCampaignReport();

    const seeds = extractKeywordCampaignSeedsFromReport(seoReport, {
      maxKeywords: 140,
      longTailTopAnchors: 5,
      longTailMaxWords: 4,
      longTailMaxPhrases: 100,
      minKeywordLength: 2,
    });

    const singleWords = seeds
      .filter((seed) => !seed.normalizedKeyword.includes(' '))
      .map((seed) => seed.normalizedKeyword);

    const phrases = seeds
      .filter((seed) => seed.normalizedKeyword.includes(' '))
      .map((seed) => seed.normalizedKeyword);

    expect(seoReport.linkAnchorTexts?.length).toBeGreaterThan(2);
    expect(singleWords).toContain('maquininha');
    expect(singleWords).toContain('cartão');
    expect(singleWords).toContain('empresa');
    expect(phrases.some((value) => value.includes('maquininha') && value.includes('cartão'))).toBe(true);
    expect(phrases.some((value) => value.includes('compre') && value.includes('maquininha'))).toBe(true);

    const has3Words = phrases.some((value) => value.split(' ').length === 3);
    const has4Words = phrases.some((value) => value.split(' ').length === 4);
    expect(has3Words).toBe(true);
    expect(has4Words).toBe(true);
  });

  it('respects configured long-tail word limits', () => {
    const seoReport = buildFixtureKeywordCampaignReport();

    const seedsWithTwoWordsOnly = extractKeywordCampaignSeedsFromReport(seoReport, {
      maxKeywords: 30,
      longTailMinWords: 2,
      longTailMaxWords: 2,
      longTailTopAnchors: 5,
    });

    const phrases = seedsWithTwoWordsOnly
      .filter((seed) => seed.normalizedKeyword.includes(' '))
      .map((seed) => seed.normalizedKeyword);

    const phraseWordCounts = phrases.map((phrase) => phrase.split(' ').length);
    expect(phrases.length).toBeGreaterThan(0);
    expect(phraseWordCounts.every((size) => size === 2)).toBe(true);
  });

  it('filters out connector-dense and malformed long-tail phrases', () => {
    const report = buildConnectorNoiseFixtureReport();
    const seeds = extractKeywordCampaignSeedsFromReport(report, {
      maxKeywords: 100,
      longTailTopAnchors: 8,
      longTailModifierLimit: 14,
      longTailMaxPhrases: 90,
      longTailMaxWords: 4,
      minKeywordLength: 2,
    });

    const phrases = seeds
      .filter((seed) => seed.normalizedKeyword.includes(' '))
      .map((seed) => seed.normalizedKeyword);

    const connectors = new Set([
      'de',
      'da',
      'do',
      'das',
      'dos',
      'para',
      'com',
      'em',
      'na',
      'no',
      'as',
      'os',
      'a',
      'o',
    ]);

    expect(phrases.length).toBeGreaterThan(0);
    expect(phrases.some((phrase) => phrase.includes('compre maquininha'))).toBe(true);
    expect(phrases.every((phrase) => {
      const words = phrase.split(' ').filter(Boolean);
      return words.length > 1
        && !connectors.has(words[0])
        && !connectors.has(words[words.length - 1]);
    })).toBe(true);
    expect(phrases).not.toContain('maquininha de');
    expect(phrases).not.toContain('sem tarifa');
    expect(phrases).not.toContain('para sua');
  });

  it('extracts long-tail phrases from HTML fixture with links and headings', () => {
    const seoReport = buildFixtureKeywordCampaignReport();

    const seeds = extractKeywordCampaignSeedsFromReport(seoReport, {
      maxKeywords: 140,
      longTailTopAnchors: 5,
      longTailModifierLimit: 12,
      longTailMaxPhrases: 80,
      longTailMaxWords: 4,
      minKeywordLength: 2,
    });

    const phrases = seeds
      .filter((seed) => seed.normalizedKeyword.includes(' '))
      .map((seed) => seed.normalizedKeyword);

    expect(seoReport.linkAnchorTexts?.length).toBeGreaterThan(3);
    expect(phrases.some((phrase) => phrase.includes('maquininha'))).toBe(true);
    expect(phrases.some((phrase) => phrase.includes('compre') && phrase.includes('maquininha'))).toBe(true);
    expect(phrases.some((value) => value.split(' ').length === 2)).toBe(true);
    expect(phrases.some((value) => value.split(' ').length === 3)).toBe(true);
    expect(phrases.some((value) => value.split(' ').length === 4)).toBe(true);
  });

  it('uses anchor texts as explicit seed context for long-tail', () => {
    const baseReport = buildFixtureKeywordCampaignReport();
    const withAnchors = extractKeywordCampaignSeedsFromReport(baseReport, {
      maxKeywords: 140,
      longTailTopAnchors: 5,
      longTailMaxPhrases: 80,
      longTailMaxWords: 3,
    });

    const withoutAnchors = extractKeywordCampaignSeedsFromReport(
      { ...baseReport, linkAnchorTexts: [] },
      {
        maxKeywords: 140,
        longTailTopAnchors: 5,
        longTailMaxPhrases: 80,
        longTailMaxWords: 3,
      },
    );

    const anchorPhrases = withAnchors
      .filter((seed) => seed.normalizedKeyword.includes(' '))
      .map((seed) => seed.normalizedKeyword);
    const plainPhrases = withoutAnchors
      .filter((seed) => seed.normalizedKeyword.includes(' '))
      .map((seed) => seed.normalizedKeyword);

    expect(anchorPhrases.some((phrase) => phrase.includes('compre'))).toBe(true);
    expect(plainPhrases.some((phrase) => phrase.includes('compre'))).toBe(false);
  });

  it('extracts short-tail and long-tail from a realistic SEO report (2-4 words) with schema and heading-path signals', async () => {
    const report = await buildReportFromFixture('keyword-campaign-advanced-long-tail.html');
    const seeds = extractKeywordCampaignSeedsFromReport(report, {
      maxKeywords: 100,
      longTailTopAnchors: 7,
      longTailMaxPhrases: 120,
      longTailMaxWords: 4,
      longTailSectionSourceBoost: 1.3,
      includeSchemaSeeds: true,
      includeHeadingPathSeeds: true,
      minKeywordLength: 2,
    });

    const short = seeds.filter((seed) => !seed.normalizedKeyword.includes(' '));
    const longTail = seeds.filter((seed) => seed.normalizedKeyword.includes(' '));

    expect(short.map((seed) => seed.normalizedKeyword)).toEqual(
      expect.arrayContaining(['maquininha', 'cartão', 'empresa', 'pix', 'pagamentos'])
    );

    expect(longTail.length).toBeGreaterThan(0);
    expect(longTail.some((seed) => seed.normalizedKeyword.includes('ativar maquininha'))).toBe(true);
    expect(longTail.some((seed) => seed.normalizedKeyword.includes('receber') && seed.normalizedKeyword.includes('pix'))).toBe(true);
    expect(longTail.some((seed) => seed.normalizedKeyword.includes('abrir') && seed.normalizedKeyword.includes('conta'))).toBe(true);

    const longWordCounts = longTail.map((seed) => seed.normalizedKeyword.split(' ').filter(Boolean).length);
    expect(longWordCounts.every((size) => size >= 2 && size <= 4)).toBe(true);

    const signatures = new Set<string>();
    for (const seed of longTail) {
      const signature = seed.normalizedKeyword.split(' ').filter(Boolean).sort().join(' ');
      expect(signatures.has(signature)).toBe(false);
      signatures.add(signature);
    }

    // New sort: single-word seeds first, then multi-word by weight desc
    const orderedWordCounts = seeds.map((seed) => seed.normalizedKeyword.split(' ').filter(Boolean).length);
    const firstMultiIdx = orderedWordCounts.findIndex((w) => w > 1);
    if (firstMultiIdx !== -1) {
      expect(orderedWordCounts.slice(0, firstMultiIdx).every((w) => w === 1)).toBe(true);
      expect(orderedWordCounts.slice(firstMultiIdx).every((w) => w > 1)).toBe(true);
    }
  });

  it('builds longer phrases from section-heading context signals', () => {
    const report = buildSectionDrivenKeywordCampaignReport();
    const seeds = extractKeywordCampaignSeedsFromReport(report, {
      maxKeywords: 80,
      longTailTopAnchors: 4,
      longTailModifierLimit: 10,
      longTailMaxPhrases: 100,
      longTailMaxWords: 4,
      includeLongTailSectionSignals: true,
      longTailSectionSourceBoost: 1.4,
    });

    const phrases = seeds
      .filter((seed) => seed.normalizedKeyword.includes(' '))
      .map((seed) => seed.normalizedKeyword);

    expect(phrases.length).toBeGreaterThan(0);
    expect(phrases.some((phrase) => phrase.includes('maquininha') && phrase.includes('cartão'))).toBe(true);
    expect(phrases.some((phrase) => phrase.includes('comprar maquininha') || phrase.includes('compre maquininha') || phrase.includes('compra maquininha'))).toBe(true);
    expect(phrases.some((value) => value.split(' ').length >= 3)).toBe(true);
    expect(phrases.some((value) => value.split(' ').length === 4)).toBe(true);
  });

  it('can restrict long-tail generation to section context only', () => {
    const baseReport = buildSectionDrivenKeywordCampaignReport();
    const withSections = extractKeywordCampaignSeedsFromReport(baseReport, {
      maxKeywords: 80,
      longTailTopAnchors: 4,
      longTailModifierLimit: 10,
      longTailMaxPhrases: 80,
      longTailMaxWords: 4,
      includeLongTailSectionSignals: true,
    });

    const withoutSections = extractKeywordCampaignSeedsFromReport(
      {
        ...baseReport,
        title: undefined,
        metaDescription: undefined,
        headings: { structure: [], h1Count: 0, hasProperHierarchy: true, issues: [] },
        linkAnchorTexts: [],
        contentSections: [],
      },
      {
        maxKeywords: 80,
        longTailTopAnchors: 4,
        longTailMaxPhrases: 80,
        longTailMaxWords: 4,
        includeLongTailSectionSignals: false,
      },
    );

    const withSectionPhrases = withSections.filter((seed) => seed.normalizedKeyword.includes(' ')).map((seed) => seed.normalizedKeyword);
    const withoutSectionPhrases = withoutSections.filter((seed) => seed.normalizedKeyword.includes(' ')).map((seed) => seed.normalizedKeyword);

    expect(withSectionPhrases.length).toBeGreaterThan(0);
    expect(withoutSectionPhrases.length).toBeLessThan(withSectionPhrases.length);
    expect(withSectionPhrases.some((phrase) => phrase.includes('compre maquininha') || phrase.includes('comprar maquininha') || phrase.includes('compra maquininha'))).toBe(true);
  });

  it('deduplicates long-tail permutations and keeps short-to-long order', () => {
    const seoReport = buildSectionDrivenKeywordCampaignReport();

    const seeds = extractKeywordCampaignSeedsFromReport(seoReport, {
      maxKeywords: 60,
      longTailTopAnchors: 6,
      longTailModifierLimit: 12,
      longTailMaxPhrases: 120,
      longTailMaxWords: 4,
    });

    const permutationGroups = new Map<string, string[]>();
    for (const seed of seeds) {
      const tokens = seed.normalizedKeyword.split(' ').filter(Boolean);
      if (tokens.length < 2) continue;
      const signature = [...tokens].sort().join(' ');
      const list = permutationGroups.get(signature) ?? [];
      list.push(seed.normalizedKeyword);
      permutationGroups.set(signature, list);
    }

    for (const group of permutationGroups.values()) {
      expect(group.length).toBeLessThanOrEqual(1);
    }

    // New sort: single-word seeds first, then multi-word by weight desc
    const wordCounts = seeds
      .map((seed) => seed.normalizedKeyword.split(' ').filter(Boolean).length);
    const firstMulti = wordCounts.findIndex((w) => w > 1);
    if (firstMulti !== -1) {
      expect(wordCounts.slice(0, firstMulti).every((w) => w === 1)).toBe(true);
      expect(wordCounts.slice(firstMulti).every((w) => w > 1)).toBe(true);
    }
  });

  it('includes schema-backed and heading-path long-tail variants and keeps them within 2-4 words', () => {
    const report = buildSchemaHeadingKeywordCampaignReport();

    const seeds = extractKeywordCampaignSeedsFromReport(report, {
      maxKeywords: 80,
      longTailTopAnchors: 8,
      longTailModifierLimit: 10,
      longTailMaxPhrases: 100,
      longTailMaxWords: 4,
      minKeywordLength: 2,
      includeSchemaSeeds: true,
      includeHeadingPathSeeds: true,
    });

    const words = seeds.filter((seed) => !seed.normalizedKeyword.includes(' ')).map((seed) => seed.normalizedKeyword);
    const phrases = seeds.filter((seed) => seed.normalizedKeyword.includes(' ')).map((seed) => seed.normalizedKeyword);

    expect(words).toContain('maquininha');
    expect(words).toContain('pagamentos');
    expect(phrases).toContain('como ativar maquininha');
    expect(phrases).toContain('como receber pagamentos');
    expect(phrases.some((seed) => seed.includes('configurar conta'))).toBe(true);
    expect(phrases.every((phrase) => {
      const count = phrase.split(' ').filter(Boolean).length;
      return count >= 2 && count <= 4;
    })).toBe(true);

    const signatures = new Map<string, string[]>();
    for (const phrase of phrases) {
      const tokens = phrase.split(' ').filter(Boolean);
      const signature = [...tokens].sort().join(' ');
      const bucket = signatures.get(signature) ?? [];
      bucket.push(phrase);
      signatures.set(signature, bucket);
    }

    for (const bucket of signatures.values()) {
      expect(bucket.length).toBeLessThanOrEqual(1);
    }

    // New sort: single-word seeds first, then multi-word by weight desc
    const wordCounts = seeds.map((seed) => seed.normalizedKeyword.split(' ').filter(Boolean).length);
    const firstMultiSchema = wordCounts.findIndex((w) => w > 1);
    if (firstMultiSchema !== -1) {
      expect(wordCounts.slice(0, firstMultiSchema).every((w) => w === 1)).toBe(true);
      expect(wordCounts.slice(firstMultiSchema).every((w) => w > 1)).toBe(true);
    }
  });
});

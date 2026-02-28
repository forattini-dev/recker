/**
 * Extract keyword candidates from a single SEO report (top keywords only).
 */
import type { SeoReport } from './types.js';
import {
  DEFAULT_SERP_MIN_KEYWORD_LENGTH,
  normalizeKeyword,
  tokenizeForLongTail,
} from './keyword-campaign-shared.js';
import type {
  KeywordCampaignExtractionOptions,
  KeywordCampaignSeed,
} from './keyword-campaign-shared.js';
import {
  deduplicateKeywordPermutations,
  extractHeadingPathCompositionSeeds,
  extractSchemaOrgLongTailSeeds,
  getSeedWordCount,
  mergeKeywordSeeds,
} from './keyword-campaign-seed-advanced.js';

export function extractKeywordCampaignSeedsFromReport(
  report: SeoReport,
  options: KeywordCampaignExtractionOptions & { sourcePage?: string } = {}
): KeywordCampaignSeed[] {
  const maxKeywords = options.maxKeywords ?? 24;
  const minKeywordLength = options.minKeywordLength ?? DEFAULT_SERP_MIN_KEYWORD_LENGTH;
  const includeLongTail = options.includeLongTail ?? true;
  const longTailMaxPhrases = options.longTailMaxPhrases ?? Math.max(5, Math.floor(maxKeywords * 1.8));
  const longTailMinWords = options.longTailMinWords ?? 2;
  const longTailMaxWords = options.longTailMaxWords ?? 4;
  const longTailTopAnchors = options.longTailTopAnchors ?? 5;
  const longTailModifierLimit = options.longTailModifierLimit ?? Math.max(8, Math.floor(maxKeywords / 1.25));
  const includeLongTailSectionSignals = options.includeLongTailSectionSignals ?? true;
  const longTailSectionSourceBoost = options.longTailSectionSourceBoost ?? 1.2;
  const includeSchemaSeeds = options.includeSchemaSeeds ?? true;
  const includeHeadingPathSeeds = options.includeHeadingPathSeeds ?? true;
  const topKeywordEntries = (report.keywords?.topKeywords ?? [])
    .map((item) => ({
      word: item.word,
      count: Math.max(1, Math.round(item.count)),
      normalized: normalizeKeyword(item.word),
    }))
    .filter(
      (item) =>
        item.word.trim().length >= minKeywordLength
        && item.normalized.length >= minKeywordLength
        && item.count > 0
    );

  const topKeywordSet = new Set(
    topKeywordEntries
      .map((item) => item.normalized)
      .flatMap((word) => word.split(/\s+/).filter((token) => token.length >= minKeywordLength))
  );

  const longTailSeeds = includeLongTail
    ? extractLongTailSeedsFromReport(
      report,
      {
        maxKeywords,
        longTailTopAnchors,
        longTailModifierLimit,
        topKeywordSet,
        minKeywordLength,
        longTailMaxPhrases,
        longTailMinWords,
        longTailMaxWords,
        includeLongTailSectionSignals,
        longTailSectionSourceBoost,
      },
      topKeywordEntries,
    )
    : [];

  const topKeywordsLimit = includeLongTail
    ? Math.min(maxKeywords, Math.max(3, Math.floor(maxKeywords / 3)))
    : maxKeywords;

  const topKeywordSeeds = topKeywordEntries
    .slice(0, topKeywordsLimit)
    .map((item) => ({
      keyword: item.word,
      normalizedKeyword: item.normalized,
      source: 'discovered' as const,
      sourcePage: options.sourcePage,
      weight: item.count,
    }));

  const schemaSeeds = includeSchemaSeeds
    ? extractSchemaOrgLongTailSeeds(report, {
        minKeywordLength,
        maxPhrases: Math.max(3, Math.floor(maxKeywords / 3)),
        sourcePage: options.sourcePage,
      })
    : [];

  const headingPathSeeds = includeHeadingPathSeeds && includeLongTail
    ? extractHeadingPathCompositionSeeds(report, {
        minKeywordLength,
        maxPhrases: Math.max(3, Math.floor(maxKeywords / 2)),
        topKeywordSet,
        sourcePage: options.sourcePage,
      })
    : [];

  const allSeeds = [...topKeywordSeeds, ...schemaSeeds, ...headingPathSeeds, ...longTailSeeds]
    .filter(seed =>
      seed.keyword.trim().length >= minKeywordLength
      && seed.normalizedKeyword.length >= minKeywordLength
      && seed.weight > 0
    );

  return deduplicateKeywordPermutations(allSeeds)
    .sort((a, b) => {
      const aWords = getSeedWordCount(a);
      const bWords = getSeedWordCount(b);
      // Single-word seeds always first (broad navigation keywords)
      if (aWords === 1 && bWords > 1) return -1;
      if (bWords === 1 && aWords > 1) return 1;
      // Multi-word: sort by weight desc so high-quality seeds (schema, path, top LT) surface first
      // regardless of phrase length — allows schema FAQ questions to compete with LT seeds
      if (b.weight !== a.weight) return b.weight - a.weight;
      // Tiebreak: prefer shorter phrases
      if (aWords !== bWords) return aWords - bWords;
      return a.normalizedKeyword.localeCompare(b.normalizedKeyword);
    })
    .slice(0, maxKeywords);
}

function extractLongTailSeedsFromReport(
  report: SeoReport,
  options: {
    maxKeywords: number;
    longTailTopAnchors: number;
    longTailModifierLimit: number;
    topKeywordSet: Set<string>;
    minKeywordLength: number;
    longTailMaxPhrases: number;
    longTailMinWords: number;
    longTailMaxWords: number;
    includeLongTailSectionSignals: boolean;
    longTailSectionSourceBoost: number;
  },
  topKeywords: Array<{ word: string; count: number; normalized: string }>
): KeywordCampaignSeed[] {
  const textSources = collectLongTailTextSources(
    report,
    topKeywords,
    options.maxKeywords,
    options.includeLongTailSectionSignals,
    options.longTailSectionSourceBoost
  );
  if (textSources.length === 0 || options.topKeywordSet.size === 0) {
    return [];
  }

  const anchorEntries = buildLongTailAnchorTokenSet(topKeywords, options.longTailTopAnchors);
  const anchorTokenSet = new Set(anchorEntries.map((entry) => entry.token));

  if (anchorTokenSet.size === 0) {
    return [];
  }

  const globalTokenStats = collectLongTailTokenStats(textSources, anchorTokenSet);
  const modifiers = collectLongTailModifiers(globalTokenStats, options.longTailModifierLimit);

  const phraseCounts = new Map<
    string,
    {
      phrase: string;
      normalized: string;
      weight: number;
      words: number;
    }
  >();

  const minWords = Math.max(2, options.longTailMinWords);
  const maxWords = Math.max(minWords, options.longTailMaxWords);

  for (const source of textSources) {
    const tokens = tokenizeForLongTail(source.text);
    if (tokens.length < minWords) continue;

    // For link-anchor sources, use the broader topKeywordSet for position detection
    // so that semantically important terms (e.g. "conta") not in the top-N anchors
    // can still seed phrase windows, without altering the modifier list.
    const positionSet = source.source === 'link-anchor' ? options.topKeywordSet : anchorTokenSet;
    const anchorPositions = collectAnchorPositions(tokens, positionSet);
    if (anchorPositions.length === 0) continue;

    for (const anchorIndex of anchorPositions) {
      for (let size = minWords; size <= maxWords; size += 1) {
        for (let leftExtra = 0; leftExtra < size; leftExtra += 1) {
          const rightExtra = size - 1 - leftExtra;
          const start = anchorIndex - leftExtra;
          const end = anchorIndex + rightExtra;
          if (start < 0 || end >= tokens.length) continue;

          const phraseTokens = tokens.slice(start, end + 1);
          if (!containsCoreKeyword(phraseTokens, options.topKeywordSet)) continue;
          if (isLowValueLongTail(phraseTokens)) continue;

          const normalized = normalizeKeyword(phraseTokens.join(' '));
          if (!normalized || normalized.length < options.minKeywordLength) continue;

          const proximityBoost = getPhraseProximityBoost(leftExtra, rightExtra, size);
          const weightDelta = source.focusWeight * proximityBoost;

        const current = phraseCounts.get(normalized);
        if (!current) {
          phraseCounts.set(normalized, {
            phrase: phraseTokens.join(' '),
            normalized,
              weight: weightDelta,
              words: size,
            });
            continue;
          }

          current.weight += weightDelta;
        }
      }
    }
  }

  applyLongTailCombinationalExpansion({
    anchorEntries,
    modifiers,
    minWords,
    maxWords,
    phraseCounts,
  });

  const ltSeeds = [...phraseCounts.values()]
    .map((entry) => ({
      keyword: entry.phrase,
      normalizedKeyword: entry.normalized,
      source: 'discovered' as const,
      sourcePage: report.url,
      weight: Math.max(1, Math.round(entry.weight * Math.max(1, entry.words))),
    }))
    .filter((seed) => seed.normalizedKeyword.length >= options.minKeywordLength)
    .sort((a, b) => (b.weight - a.weight) || a.normalizedKeyword.localeCompare(b.normalizedKeyword))
    .slice(0, options.longTailMaxPhrases)
    .filter((seed) => !isConnectorBoundaryPhrase(seed.normalizedKeyword))
    .map((seed, index) => ({
      ...seed,
      sourcePage: `${seed.sourcePage}#lt-${index}`,
    }));

  // Directly inject complete link-anchor texts as first-class seeds.
  // These bypass the longTailMaxPhrases cap — exact navigational anchor phrases
  // are always included regardless of competition in the window-scan pool.
  const directAnchorSeeds: KeywordCampaignSeed[] = [];
  if (report.linkAnchorTexts?.length) {
    for (const anchorText of report.linkAnchorTexts.slice(0, Math.max(3, options.maxKeywords))) {
      const tokens = tokenizeForLongTail(anchorText);
      if (tokens.length < minWords || tokens.length > maxWords) continue;
      // Require all tokens >= 3 chars to avoid connector-heavy phrases (e.g. "X de Y")
      // that would fail SERP quality filters and displace valid long-tail candidates.
      if (tokens.some((t) => t.length < 3)) continue;
      if (!containsCoreKeyword(tokens, options.topKeywordSet)) continue;
      if (isLowValueLongTail(tokens)) continue;
      const normalized = normalizeKeyword(tokens.join(' '));
      if (!normalized || normalized.length < options.minKeywordLength) continue;
      if (isConnectorBoundaryPhrase(normalized)) continue;
      // Weight competitive with heading-path signals (seed scale ×words already applied in ltSeeds,
      // so use a flat weight in the same range: 120 → competitive with most heading-path seeds)
      directAnchorSeeds.push({
        keyword: tokens.join(' '),
        normalizedKeyword: normalized,
        source: 'discovered' as const,
        sourcePage: report.url ? `${report.url}#anchor` : undefined,
        weight: 120,
      });
    }
  }

  return [...ltSeeds, ...directAnchorSeeds];
}

function collectLongTailTextSources(
  report: SeoReport,
  topKeywords: Array<{ word: string; count: number; normalized: string }>,
  maxSources: number,
  includeSectionSignals = true,
  sectionSourceBoost = 1.2
): Array<{ source: string; text: string; focusWeight: number }> {
  const sources: Array<{ source: string; text: string; focusWeight: number }> = [];

  if (report.title?.text) {
    sources.push({ source: 'title', text: report.title.text, focusWeight: 3 });
  }

  if (report.metaDescription?.text) {
    sources.push({ source: 'description', text: report.metaDescription.text, focusWeight: 2.5 });
  }

  const urlText = extractReadablePathSegments(report.url);
  if (urlText) {
    sources.push({ source: 'url', text: urlText, focusWeight: 2 });
  }

  if (includeSectionSignals && report.contentSections?.length) {
    const sectionSources = collectLongTailSectionSources(
      report.contentSections,
      sectionSourceBoost,
      Math.max(2, Math.floor(maxSources / 3))
    );
    sources.push(...sectionSources);
  }

  if (report.headings?.structure?.length) {
    const headingTexts = report.headings.structure
      .map((heading) => heading.text)
      .filter((text) => text.trim().length > 0)
      .slice(0, maxSources);
    for (const text of headingTexts) {
      sources.push({ source: 'heading', text, focusWeight: 1.8 });
    }
  }

  if (report.linkAnchorTexts?.length) {
    const linkAnchors = report.linkAnchorTexts
      .map((text) => text.trim())
      .filter((text) => text.length > 0)
      .slice(0, Math.max(3, maxSources));
    for (const text of linkAnchors) {
      sources.push({ source: 'link-anchor', text, focusWeight: 1.4 });
    }
  }

  if (report.linkUrlSamples?.length) {
    const linkUrls = report.linkUrlSamples
      .map((text) => text.trim())
      .filter((text) => text.length > 0)
      .slice(0, Math.max(3, Math.floor(maxSources / 2)));
    for (const text of linkUrls) {
      sources.push({ source: 'link-url', text, focusWeight: 1.1 });
    }
  }

  if (topKeywords.length > 0) {
    const boostedTerms = topKeywords
      .slice(0, maxSources)
      .map((item) => item.word)
      .join(' ');
    if (boostedTerms.length > 0) {
      sources.push({ source: 'top-keywords', text: boostedTerms, focusWeight: 1.5 });
    }
  }

  return sources;
}

function collectLongTailSectionSources(
  sections: NonNullable<SeoReport['contentSections']>,
  sectionSourceBoost: number,
  maxSources: number
): Array<{ source: string; text: string; focusWeight: number }> {
  const sourceLimit = Math.max(1, maxSources);
  const collected = sections
    .filter((section) => section.text.length >= 12)
    .map((section) => {
      const headingPath = section.headingPath
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      const pathText = headingPath.length > 0 ? headingPath.join(' ') : '';
      const sourceText = pathText.length > 0
        ? `${pathText} ${section.text}`
        : section.text;
      const baseWeight = getSectionSignalWeight(section);
      const adjustedWeight = baseWeight * sectionSourceBoost * (1 - section.linkDensity * 0.45);

      return {
        source: `section:${section.source}`,
        text: sourceText,
        focusWeight: Math.max(0.55, adjustedWeight),
      };
    })
    .filter((source) => source.text.length >= 24)
    .sort((a, b) => b.focusWeight - a.focusWeight || a.text.localeCompare(b.text));

  return collected.slice(0, sourceLimit);
}

function getSectionSignalWeight(section: NonNullable<SeoReport['contentSections']>[number]): number {
  if (section.source === 'heading') {
    // Level-differentiated weights: H1=2.8, H2=2.2, H3=1.8, H4+=1.2
    const levelWeight = section.headingLevel <= 1 ? 2.8
      : section.headingLevel === 2 ? 2.2
      : section.headingLevel === 3 ? 1.8
      : 1.2;
    return levelWeight * Math.max(0.6, section.weight || 0.95);
  }

  const sourceWeight = section.source === 'list-item'
    ? 1.28
    : section.source === 'paragraph'
      ? 1.22
      : section.source === 'figure' || section.source === 'table'
        ? 1.12
        : 1.05;

  return sourceWeight * Math.max(0.6, section.weight || 0.95);
}

function containsCoreKeyword(tokens: string[], topKeywordSet: Set<string>): boolean {
  return tokens.some((token) => topKeywordSet.has(token));
}

function buildLongTailAnchorTokenSet(
  topKeywords: Array<{ word: string; count: number; normalized: string }>,
  topAnchors: number
): Array<{ token: string; weight: number }> {
  const orderedTokens = new Map<string, number>();
  for (const entry of [...topKeywords]
    .sort((a, b) => b.count - a.count || b.normalized.localeCompare(a.normalized))
    .slice(0, Math.max(1, topAnchors))) {
    for (const token of entry.normalized.split(/\s+/).filter((value) => value.length >= 2)) {
      const current = orderedTokens.get(token) ?? 0;
      orderedTokens.set(token, Math.max(current, entry.count));
    }
  }

  return [...orderedTokens.entries()]
    .map(([token, weight]) => ({ token, weight }))
    .sort((a, b) => b.weight - a.weight || a.token.localeCompare(b.token))
    .slice(0, Math.max(1, topAnchors * 3));
}

function collectAnchorPositions(tokens: string[], anchorTokenSet: Set<string>): number[] {
  const positions: number[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (anchorTokenSet.has(tokens[index])) {
      positions.push(index);
    }
  }
  return positions;
}

function getPhraseProximityBoost(leftExtra: number, rightExtra: number, size: number): number {
  const idealCenterOffset = (size - 1) / 2;
  const actualOffset = Math.min(leftExtra, rightExtra);
  const distanceFromCenter = Math.abs(actualOffset - idealCenterOffset);
  return 1 + Math.max(0, 1 - Math.min(1, distanceFromCenter / Math.max(1, idealCenterOffset)));
}

// Portuguese connectors/prepositions/articles that degrade combinatorial phrase quality
// when used as modifiers (e.g. anchor="maquininha" + modifier="de" → "maquininha de X").
// Also used as boundary post-filter to remove connector-edge phrases from final output.
const PT_STOP_TOKENS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'para', 'com', 'em', 'na', 'no', 'as', 'os',
]);

type LongTailTokenStats = Array<{
  token: string;
  normalized: string;
  count: number;
  weight: number;
}>;

function collectLongTailTokenStats(
  textSources: Array<{ source: string; text: string; focusWeight: number }>,
  anchorTokenSet: Set<string>
): LongTailTokenStats {
  const counters = new Map<string, { token: string; normalized: string; count: number; weight: number }>();

  for (const source of textSources) {
    const tokens = tokenizeForLongTail(source.text);
    for (const token of tokens) {
      if (token.length < 2) continue;
      if (token.match(/^\d+$/)) continue;
      if (anchorTokenSet.has(token)) continue;

      const normalized = normalizeKeyword(token);
      if (!normalized) continue;

      const current = counters.get(normalized);
      if (!current) {
        counters.set(normalized, {
          token,
          normalized,
          count: 1,
          weight: source.focusWeight,
        });
        continue;
      }

      current.count += 1;
      current.weight += source.focusWeight;
    }
  }

  return [...counters.values()]
    .sort((a, b) => (b.weight - a.weight) || b.count - a.count || a.token.localeCompare(b.token));
}

function collectLongTailModifiers(
  tokenStats: LongTailTokenStats,
  limit: number
): Array<{ token: string; weight: number }> {
  const minWeight = 1;
  return tokenStats
    .filter((item) => item.count >= 1 && item.weight >= minWeight && !PT_STOP_TOKENS.has(item.normalized))
    .map((item) => ({ token: item.token, weight: item.weight }))
    .slice(0, Math.max(4, Math.min(24, limit)));
}

function applyLongTailCombinationalExpansion(options: {
  anchorEntries: Array<{ token: string; weight: number }>;
  modifiers: Array<{ token: string; weight: number }>;
  minWords: number;
  maxWords: number;
  phraseCounts: Map<
    string,
    {
      phrase: string;
      normalized: string;
      weight: number;
      words: number;
    }
  >;
}): void {
  if (options.anchorEntries.length === 0 || options.modifiers.length === 0) return;
  if (options.maxWords < 2) return;

  const maxModifiers = Math.max(2, Math.min(8, options.modifiers.length));
  const baseModifiers = options.modifiers.slice(0, maxModifiers);
  const anchors = options.anchorEntries.slice(0, Math.max(2, options.anchorEntries.length));

  const upsert = (phrase: string, baseWeight: number, words: number) => {
    const phraseTokens = phrase.split(' ');
    if (isLowValueLongTail(phraseTokens)) return;
    const normalized = normalizeKeyword(phrase);
    if (!normalized) return;
    const current = options.phraseCounts.get(normalized);
    if (!current) {
      options.phraseCounts.set(normalized, {
        phrase,
        normalized,
        weight: baseWeight,
        words,
      });
      return;
    }

    current.weight += baseWeight;
  };

  for (const { token: anchor, weight: anchorWeight } of anchors) {
    for (let i = 0; i < baseModifiers.length; i += 1) {
      const m1 = baseModifiers[i];
      if (m1.token === anchor) continue;

      const phrase2A = `${anchor} ${m1.token}`;
      const phrase2B = `${m1.token} ${anchor}`;
      const baseWeight2 = (anchorWeight + m1.weight) * 0.7;
      upsert(phrase2A, baseWeight2, 2);
      upsert(phrase2B, baseWeight2, 2);

      if (options.maxWords >= 3) {
        for (let j = i + 1; j < Math.min(i + 3, baseModifiers.length); j += 1) {
          const m2 = baseModifiers[j];
          if (m2.token === anchor || m2.token === m1.token) continue;

          const phrase3A = `${anchor} ${m1.token} ${m2.token}`;
          const phrase3B = `${m1.token} ${anchor} ${m2.token}`;
          const phrase3C = `${m1.token} ${m2.token} ${anchor}`;
          const baseWeight3 = (anchorWeight + m1.weight + m2.weight) * 0.55;
          upsert(phrase3A, baseWeight3, 3);
          upsert(phrase3B, baseWeight3, 3);
          upsert(phrase3C, baseWeight3, 3);
        }
      }

      if (options.maxWords >= 4) {
        for (let j = i + 1; j < Math.min(i + 2, baseModifiers.length); j += 1) {
          const m2 = baseModifiers[j];
          if (m2.token === anchor || m2.token === m1.token) continue;
          for (let k = j + 1; k < Math.min(j + 2, baseModifiers.length); k += 1) {
            const m3 = baseModifiers[k];
            if (m3.token === anchor || m3.token === m1.token || m3.token === m2.token) continue;

            const phrase4A = `${anchor} ${m1.token} ${m2.token} ${m3.token}`;
            const phrase4B = `${m1.token} ${anchor} ${m2.token} ${m3.token}`;
            const phrase4C = `${m1.token} ${m2.token} ${anchor} ${m3.token}`;
            const baseWeight4 = (anchorWeight + m1.weight + m2.weight + m3.weight) * 0.42;
            upsert(phrase4A, baseWeight4, 4);
            upsert(phrase4B, baseWeight4, 4);
            upsert(phrase4C, baseWeight4, 4);
          }
        }
      }
    }
  }

  // remove phrases with duplicated source anchor when minWords configured higher than 2
  if (options.minWords > 2) {
    for (const key of options.phraseCounts.keys()) {
      const tokens = key.split(' ');
      if (tokens.length < options.minWords) {
        options.phraseCounts.delete(key);
      }
    }
  }
}

function isConnectorBoundaryPhrase(normalized: string): boolean {
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return tokens.length >= 2
    && (PT_STOP_TOKENS.has(tokens[0]) || PT_STOP_TOKENS.has(tokens[tokens.length - 1]));
}

function isLowValueLongTail(tokens: string[]): boolean {
  const normalized = tokens.map((token) => normalizeKeyword(token)).filter(Boolean);
  if (normalized.length === 0) return true;
  if (normalized.length === 1) return true;
  if (new Set(normalized).size === 1) return true;
  if (normalized.every((token) => token.length <= 3)) return true;

  const shortTokenCount = normalized.filter((token) => token.length <= 2).length;
  if (shortTokenCount >= Math.max(1, Math.floor(normalized.length / 2))) return true;

  if (normalized.every((token) => token.match(/^\d+$/))) return true;
  if (normalized.length >= 3 && normalized.every((token) => token.length <= 4)) {
    return true;
  }

  return normalized.some((token) => token.match(/^\d+$/));
}

export const SERP_BLOCK_CONFIDENCE = 0.6;
export const SERP_CAPTCHA_CONFIDENCE = 0.6;
export const DEFAULT_SERP_SEARCH_DELAY_MS = 450;
export const DEFAULT_SERP_SEARCH_JITTER_MS = 250;
export const DEFAULT_SERP_SEARCH_CAPTCHA_COOLDOWN_MS = 1200;
export const DEFAULT_SERP_SEARCH_RETRY_COUNT = 1;
export const DEFAULT_SERP_SEARCH_RETRY_DELAY_MS = 900;
export const DEFAULT_SERP_MAX_CONSECUTIVE_BLOCKS = 3;

export function isLikelyBlocked(block: { blocked?: boolean; confidence?: number } | undefined): boolean {
  if (!block) return false;
  return Boolean(block.blocked) && (block.confidence ?? 0) >= SERP_BLOCK_CONFIDENCE;
}

export function isLikelyCaptcha(captcha: { detected?: boolean; confidence?: number } | undefined): boolean {
  if (!captcha) return false;
  return Boolean(captcha.detected) && (captcha.confidence ?? 0) >= SERP_CAPTCHA_CONFIDENCE;
}

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function buildSerpBlockReason(
  block: { reason?: string; description?: string } | undefined,
  captcha: { provider?: string; description?: string } | undefined,
): string | undefined {
  const parts: string[] = [];
  if (captcha?.provider || captcha?.description) {
    const provider = captcha.provider ? `${captcha.provider}` : 'captcha';
    parts.push(`captcha=${provider}`);
  }

  if (block?.reason || block?.description) {
    const reason = block.reason ? `block:${block.reason}` : 'block';
    const description = block.description ? ` (${block.description})` : '';
    parts.push(`${reason}${description}`);
  }

  return parts.length > 0 ? parts.join(' | ') : undefined;
}

function extractReadablePathSegments(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split('/')
      .filter((segment) => segment.length > 1)
      .map((segment) => segment.replace(/[-_]/g, ' '))
      .join(' ')
      .replace(/\d+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return segments;
  } catch {
    return '';
  }
}

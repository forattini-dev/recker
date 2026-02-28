import type { SeoReport } from './types.js';
import type { KeywordCampaignSeed } from './keyword-campaign-shared.js';
import {
  DEFAULT_SERP_MIN_KEYWORD_LENGTH,
  normalizeKeyword,
  tokenizeForLongTail,
} from './keyword-campaign-shared.js';

function isLowValueLongTail(tokens: string[]): boolean {
  const normalized = tokens.map((value) => normalizeKeyword(value)).filter(Boolean);
  if (normalized.length === 0) return true;
  if (normalized.length === 1) return true;
  if (new Set(normalized).size === 1) return true;
  if (normalized.every((token) => token.length <= 3)) return true;

  if (normalized.length <= 3 && normalized.every((token) => token.length <= 4)) return true;

  const shortTokenCount = normalized.filter((token) => token.length <= 2).length;
  if (shortTokenCount >= Math.max(1, Math.floor(normalized.length / 2))) return true;

  return normalized.some((token) => token.match(/^\d+$/));
}

export function deduplicateKeywordPermutations(seeds: KeywordCampaignSeed[]): KeywordCampaignSeed[] {
  const deduplicated = new Map<string, KeywordCampaignSeed>();

  const pickBetterSeed = (candidate: KeywordCampaignSeed, existing: KeywordCampaignSeed): KeywordCampaignSeed => {
    if (candidate.weight !== existing.weight) {
      return candidate.weight > existing.weight ? candidate : existing;
    }

    const candidateWords = getSeedWordCount(candidate);
    const existingWords = getSeedWordCount(existing);
    if (candidateWords !== existingWords) {
      return candidateWords < existingWords ? candidate : existing;
    }

    return candidate.normalizedKeyword.localeCompare(existing.normalizedKeyword) < 0
      ? candidate
      : existing;
  };

  for (const seed of seeds) {
    const key = normalizeSeedPermutationKey(seed.normalizedKeyword);
    const existing = deduplicated.get(key);
    if (!existing) {
      deduplicated.set(key, seed);
      continue;
    }

    deduplicated.set(key, pickBetterSeed(seed, existing));
  }

  return [...deduplicated.values()];
}

function normalizeSeedPermutationKey(value: string): string {
  const normalized = normalizeKeyword(value);
  const tokens = normalized.split(/\s+/).map((token) => token.trim()).filter(Boolean);
  if (tokens.length === 0) return '';
  if (tokens.length === 1) return tokens[0];
  return [...tokens].sort().join(' ');
}

export function getSeedWordCount(seed: KeywordCampaignSeed): number {
  return seed.normalizedKeyword.split(/\s+/).filter(Boolean).length;
}

/**
 * Extract long-tail keyword seeds from Schema.org JSON-LD.
 * FAQPage questions, HowTo steps, Product names, BreadcrumbList paths, Article keywords.
 */
export function extractSchemaOrgLongTailSeeds(
  report: SeoReport,
  options: {
    minKeywordLength: number;
    maxPhrases: number;
    sourcePage?: string;
  }
): KeywordCampaignSeed[] {
  const items = report.structuredData?.items;
  if (!items?.length) return [];

  const candidates: Array<{ phrase: string; weight: number }> = [];

  for (const item of items) {
    const type = ((item['@type'] as string | undefined) ?? '').toLowerCase();

    // FAQPage: questions are long-tail gold
    if (type === 'faqpage') {
      const entities = item['mainEntity'];
      if (Array.isArray(entities)) {
        for (const entity of entities) {
          const q = ((entity as Record<string, unknown>)['name'] as string | undefined)?.trim();
          const normalized = q ? normalizeKeyword(q) : '';
          const words = normalized.length > 0 ? normalized.split(/\s+/).filter(Boolean).length : 0;
          if (
            q
            && q.length >= options.minKeywordLength
            && words >= 2
            && words <= 4
          ) {
            candidates.push({ phrase: q, weight: 3.5 });
          }
        }
      }
    }

    // HowTo: step names
    if (type === 'howto') {
      const steps = item['step'];
      if (Array.isArray(steps)) {
        for (const step of steps) {
          const s = step as Record<string, unknown>;
          const text = ((s['name'] ?? s['text']) as string | undefined)?.trim();
          const normalized = text ? normalizeKeyword(text) : '';
          const words = normalized.length > 0 ? normalized.split(/\s+/).filter(Boolean).length : 0;
          if (
            text
            && text.length >= options.minKeywordLength
            && words >= 2
            && words <= 4
          ) {
            candidates.push({ phrase: text, weight: 2.8 });
          }
        }
      }
    }

    // Product: name, category, brand
    if (type === 'product') {
      const name = (item['name'] as string | undefined)?.trim();
      if (name && name.length >= options.minKeywordLength) candidates.push({ phrase: name, weight: 3.0 });

      const category = (item['category'] as string | undefined)?.trim();
      if (category && category.length >= options.minKeywordLength) candidates.push({ phrase: category, weight: 2.5 });

      const brand = ((item['brand'] as Record<string, unknown> | undefined)?.['name'] as string | undefined)?.trim();
      if (brand && brand.length >= options.minKeywordLength) candidates.push({ phrase: brand, weight: 2.0 });
    }

    // BreadcrumbList: path composition
    if (type === 'breadcrumblist') {
      const elements = item['itemListElement'];
      if (Array.isArray(elements)) {
        const names = elements
          .map((el) => ((el as Record<string, unknown>)['name'] as string | undefined)?.trim())
          .filter((n): n is string => typeof n === 'string' && n.length >= options.minKeywordLength);

        for (const name of names) {
          candidates.push({ phrase: name, weight: 2.0 });
        }
        // Compose adjacent breadcrumb pairs: "category subcategory"
        for (let i = 0; i < names.length - 1; i++) {
          const composed = `${names[i]} ${names[i + 1]}`;
          if (tokenizeForLongTail(composed).length <= 5) {
            candidates.push({ phrase: composed, weight: 2.2 });
          }
        }
      }
    }

    // Article / BlogPosting: headline + keywords
    if (type === 'article' || type === 'blogposting' || type === 'newsarticle') {
      const headline = (item['headline'] as string | undefined)?.trim();
      if (headline && headline.length >= options.minKeywordLength) candidates.push({ phrase: headline, weight: 2.8 });

      const keywords = item['keywords'];
      const kwList: string[] = typeof keywords === 'string'
        ? keywords.split(/[,;]/).map((k) => k.trim()).filter(Boolean)
        : Array.isArray(keywords)
          ? keywords.filter((k): k is string => typeof k === 'string')
          : [];
      for (const kw of kwList) {
        if (kw.length >= options.minKeywordLength) candidates.push({ phrase: kw, weight: 2.5 });
      }
    }
  }

  const seen = new Set<string>();
  const seeds: KeywordCampaignSeed[] = [];

  for (const { phrase, weight } of candidates.sort((a, b) => b.weight - a.weight)) {
    const normalized = normalizeKeyword(phrase);
    if (!normalized || normalized.length < options.minKeywordLength) continue;
    const words = normalized.split(/\s+/).filter(Boolean).length;
    if (words > 4 || words < 2) continue;

    if (seen.has(normalized)) continue;
    if (seeds.length >= options.maxPhrases) break;
    seen.add(normalized);
    seeds.push({
      keyword: phrase,
      normalizedKeyword: normalized,
      source: 'discovered' as const,
      sourcePage: options.sourcePage ? `${options.sourcePage}#schema` : undefined,
      // Scale up to be competitive with LT seeds (×100 brings 3.5 → 350, matching top LT range)
      weight: Math.max(1, Math.round(weight * 100)),
    });
  }

  return seeds;
}

/**
 * Heading Path Composition: generates keyword phrases from heading hierarchy.
 * Composes parent×child heading pairs and heading+body-term combinations,
 * using linkDensity to filter boilerplate sections.
 */
export function extractHeadingPathCompositionSeeds(
  report: SeoReport,
  options: {
    minKeywordLength: number;
    maxPhrases: number;
    topKeywordSet: Set<string>;
    sourcePage?: string;
  }
): KeywordCampaignSeed[] {
  const sections = report.contentSections;
  if (!sections?.length) return [];

  const phraseCounts = new Map<string, { phrase: string; normalized: string; weight: number }>();

    const upsert = (phrase: string, weight: number) => {
      const tokens = tokenizeForLongTail(phrase);
      if (tokens.length < 2 || tokens.length > 4) return;
    if (isLowValueLongTail(tokens)) return;
    const normalized = normalizeKeyword(tokens.join(' '));
    if (!normalized || normalized.length < options.minKeywordLength) return;
    const current = phraseCounts.get(normalized);
    if (!current) {
      phraseCounts.set(normalized, { phrase: tokens.join(' '), normalized, weight });
      return;
    }
    current.weight += weight * 0.5;
  };

  const levelWeight = (level: number): number =>
    level <= 1 ? 3.0 : level === 2 ? 2.2 : level === 3 ? 1.8 : 1.2;

  for (const section of sections) {
    const path = section.headingPath;
    if (!path?.length) continue;
    if (section.linkDensity > 0.6) continue;

    const w = section.weight * levelWeight(section.headingLevel);

    // Extract only anchor tokens (keywords from topKeywordSet) from each heading path level.
    // Long headings (e.g. "a stone tem tudo pra fazer seu negócio crescer") produce 8+ tokens,
    // so using all tokens would always exceed the 4-word phrase limit. Anchors give
    // compact 1-2 token representatives per heading level.
    const pathAnchors = path.map(heading =>
      tokenizeForLongTail(heading).filter(t => options.topKeywordSet.has(t)).slice(0, 2)
    );

    const activeAnchors = pathAnchors[pathAnchors.length - 1] ?? [];

    // 1. Compose adjacent path levels using only anchor tokens
    if (pathAnchors.length >= 2) {
      const parentAnchors = pathAnchors[pathAnchors.length - 2];
      for (const pa of parentAnchors) {
        for (const ca of activeAnchors) {
          if (pa !== ca) upsert(`${pa} ${ca}`, w);
        }
        // 3-gram: parent + two child anchors
        if (activeAnchors.length >= 2) {
          upsert(`${pa} ${activeAnchors[0]} ${activeAnchors[1]}`, w * 0.9);
        }
      }
    }

    // 2. All collected path anchors as a single phrase (up to 4 tokens)
    const allAnchors = pathAnchors.flat().slice(0, 4);
    if (allAnchors.length >= 2 && new Set(allAnchors).size === allAnchors.length) {
      upsert(allAnchors.join(' '), w * 0.85);
    }

    // 3. Non-heading sections: active heading anchor × body keywords
    if (section.source !== 'heading' && activeAnchors.length > 0) {
      const bodyAnchors = tokenizeForLongTail(section.text)
        .filter(t => options.topKeywordSet.has(t) && !activeAnchors.includes(t))
        .slice(0, 5);

      for (const headAnchor of activeAnchors) {
        for (const bodyAnchor of bodyAnchors) {
          upsert(`${headAnchor} ${bodyAnchor}`, section.weight * 1.3);
          // 3-gram with parent anchor
          const parentAnchor = pathAnchors.length >= 2 ? pathAnchors[pathAnchors.length - 2][0] : undefined;
          if (parentAnchor && parentAnchor !== headAnchor && parentAnchor !== bodyAnchor) {
            upsert(`${parentAnchor} ${headAnchor} ${bodyAnchor}`, section.weight * 1.1);
          }
        }
      }
    }
  }

  return [...phraseCounts.values()]
    .sort((a, b) => b.weight - a.weight || a.normalized.localeCompare(b.normalized))
    .slice(0, options.maxPhrases)
    .map((entry, index) => ({
      keyword: entry.phrase,
      normalizedKeyword: entry.normalized,
      source: 'discovered' as const,
      sourcePage: options.sourcePage ? `${options.sourcePage}#path-${index}` : undefined,
      // Scale up to be competitive with LT seeds (×20 brings typical 2-8 → 40-160)
      weight: Math.max(1, Math.round(entry.weight * 20)),
    }));
}

export function sortSeedsByWeight(a: KeywordCampaignSeed, b: KeywordCampaignSeed): number {
  if (a.weight === b.weight) {
    return a.normalizedKeyword.localeCompare(b.normalizedKeyword);
  }
  return b.weight - a.weight;
}

export function mergeKeywordSeeds(
  discovered: KeywordCampaignSeed[],
  preset: KeywordCampaignSeed[],
  minKeywordLength = DEFAULT_SERP_MIN_KEYWORD_LENGTH,
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

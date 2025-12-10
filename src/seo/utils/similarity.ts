/**
 * Content Similarity Detection
 *
 * Implements algorithms for detecting duplicate and near-duplicate content.
 * Uses SimHash for efficient comparison and Jaccard similarity for accuracy.
 *
 * Semrush standard threshold: 85% similarity = duplicate content
 */

// ============================================================================
// Types
// ============================================================================

export interface SimilarityResult {
  /** URL A */
  urlA: string;
  /** URL B */
  urlB: string;
  /** Similarity percentage (0-100) */
  similarity: number;
  /** Type of similarity detected */
  type: 'exact' | 'near-duplicate' | 'similar' | 'different';
  /** SimHash fingerprint comparison */
  simhashDistance?: number;
  /** Jaccard coefficient */
  jaccardIndex?: number;
}

export interface DuplicateGroup {
  /** Type of duplicate (title, description, h1, content) */
  type: 'title' | 'description' | 'h1' | 'content';
  /** The duplicated value */
  value: string;
  /** URLs sharing this value */
  urls: string[];
  /** Similarity percentage for near-duplicates */
  similarity?: number;
}

export interface ContentFingerprint {
  /** URL of the page */
  url: string;
  /** SimHash fingerprint */
  simhash: bigint;
  /** Shingles for Jaccard comparison */
  shingles: Set<number>;
  /** Word count */
  wordCount: number;
  /** Normalized text for exact comparison */
  normalizedText: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Default similarity threshold for duplicate detection (Semrush standard) */
export const DEFAULT_SIMILARITY_THRESHOLD = 85;

/** Shingle size for content fingerprinting */
const SHINGLE_SIZE = 3;

/** SimHash bits */
const SIMHASH_BITS = 64;

// ============================================================================
// Text Normalization
// ============================================================================

/**
 * Normalize text for comparison
 * - Lowercase
 * - Remove extra whitespace
 * - Remove punctuation
 * - Remove stop words (optional)
 */
export function normalizeText(text: string, removeStopWords = false): string {
  let normalized = text
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (removeStopWords) {
    const stopWords = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
      'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
      'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'when', 'where',
      'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
      'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
      'so', 'than', 'too', 'very', 'just',
    ]);

    normalized = normalized
      .split(' ')
      .filter(word => !stopWords.has(word) && word.length > 1)
      .join(' ');
  }

  return normalized;
}

/**
 * Tokenize text into words
 */
export function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(word => word.length > 0);
}

/**
 * Create shingles (n-grams) from tokens
 */
export function createShingles(tokens: string[], size: number = SHINGLE_SIZE): Set<number> {
  const shingles = new Set<number>();

  if (tokens.length < size) {
    // For very short texts, use individual words
    for (const token of tokens) {
      shingles.add(hashString(token));
    }
    return shingles;
  }

  for (let i = 0; i <= tokens.length - size; i++) {
    const shingle = tokens.slice(i, i + size).join(' ');
    shingles.add(hashString(shingle));
  }

  return shingles;
}

// ============================================================================
// Hashing
// ============================================================================

/**
 * Simple string hash (FNV-1a)
 */
function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * 64-bit string hash for SimHash
 */
function hash64(str: string): bigint {
  // Using two 32-bit hashes to create a 64-bit hash
  let h1 = 2166136261n;
  let h2 = 2166136261n;

  for (let i = 0; i < str.length; i++) {
    const c = BigInt(str.charCodeAt(i));
    h1 ^= c;
    h1 = (h1 * 16777619n) & 0xFFFFFFFFn;
    h2 ^= c * 31n;
    h2 = (h2 * 16777619n) & 0xFFFFFFFFn;
  }

  return (h1 << 32n) | h2;
}

// ============================================================================
// SimHash
// ============================================================================

/**
 * Calculate SimHash fingerprint for text
 * SimHash is a locality-sensitive hash that produces similar hashes for similar documents
 */
export function calculateSimHash(text: string): bigint {
  const normalized = normalizeText(text, true);
  const tokens = tokenize(normalized);

  if (tokens.length === 0) {
    return 0n;
  }

  // Initialize bit counters
  const bitCounts = new Array(SIMHASH_BITS).fill(0);

  // Hash each token and update bit counters
  for (const token of tokens) {
    const hash = hash64(token);

    for (let i = 0; i < SIMHASH_BITS; i++) {
      const bit = (hash >> BigInt(i)) & 1n;
      bitCounts[i] += bit === 1n ? 1 : -1;
    }
  }

  // Generate final hash
  let simhash = 0n;
  for (let i = 0; i < SIMHASH_BITS; i++) {
    if (bitCounts[i] > 0) {
      simhash |= 1n << BigInt(i);
    }
  }

  return simhash;
}

/**
 * Calculate Hamming distance between two SimHash values
 */
export function hammingDistance(hash1: bigint, hash2: bigint): number {
  let xor = hash1 ^ hash2;
  let distance = 0;

  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }

  return distance;
}

/**
 * Calculate SimHash similarity percentage
 */
export function simhashSimilarity(hash1: bigint, hash2: bigint): number {
  const distance = hammingDistance(hash1, hash2);
  return ((SIMHASH_BITS - distance) / SIMHASH_BITS) * 100;
}

// ============================================================================
// Jaccard Similarity
// ============================================================================

/**
 * Calculate Jaccard similarity coefficient
 * J(A,B) = |A ∩ B| / |A ∪ B|
 */
export function jaccardSimilarity(setA: Set<number>, setB: Set<number>): number {
  if (setA.size === 0 && setB.size === 0) {
    return 100;
  }

  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersection++;
    }
  }

  const union = setA.size + setB.size - intersection;
  return (intersection / union) * 100;
}

// ============================================================================
// Content Fingerprinting
// ============================================================================

/**
 * Create a content fingerprint for similarity comparison
 */
export function createFingerprint(url: string, text: string): ContentFingerprint {
  const normalizedText = normalizeText(text, false);
  const tokens = tokenize(normalizeText(text, true));

  return {
    url,
    simhash: calculateSimHash(text),
    shingles: createShingles(tokens),
    wordCount: tokens.length,
    normalizedText,
  };
}

/**
 * Compare two content fingerprints
 */
export function compareFingerprints(
  fpA: ContentFingerprint,
  fpB: ContentFingerprint
): SimilarityResult {
  // Exact match check
  if (fpA.normalizedText === fpB.normalizedText) {
    return {
      urlA: fpA.url,
      urlB: fpB.url,
      similarity: 100,
      type: 'exact',
      simhashDistance: 0,
      jaccardIndex: 100,
    };
  }

  // Calculate similarities
  const simhashSim = simhashSimilarity(fpA.simhash, fpB.simhash);
  const jaccardSim = jaccardSimilarity(fpA.shingles, fpB.shingles);

  // Use weighted average (Jaccard is more accurate but slower)
  const similarity = (simhashSim * 0.3 + jaccardSim * 0.7);

  let type: SimilarityResult['type'];
  if (similarity >= 95) {
    type = 'near-duplicate';
  } else if (similarity >= 70) {
    type = 'similar';
  } else {
    type = 'different';
  }

  return {
    urlA: fpA.url,
    urlB: fpB.url,
    similarity: Math.round(similarity * 10) / 10,
    type,
    simhashDistance: hammingDistance(fpA.simhash, fpB.simhash),
    jaccardIndex: Math.round(jaccardSim * 10) / 10,
  };
}

// ============================================================================
// Duplicate Detection
// ============================================================================

/**
 * Find duplicate content across multiple pages
 */
export function findDuplicateContent(
  pages: Array<{ url: string; content: string }>,
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): SimilarityResult[] {
  const duplicates: SimilarityResult[] = [];
  const fingerprints = pages.map(p => createFingerprint(p.url, p.content));

  // Compare all pairs
  for (let i = 0; i < fingerprints.length; i++) {
    for (let j = i + 1; j < fingerprints.length; j++) {
      const result = compareFingerprints(fingerprints[i], fingerprints[j]);
      if (result.similarity >= threshold) {
        duplicates.push(result);
      }
    }
  }

  // Sort by similarity descending
  return duplicates.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Find duplicate metadata (titles, descriptions, h1s)
 */
export function findDuplicateMetadata(
  pages: Array<{
    url: string;
    title?: string;
    description?: string;
    h1?: string;
  }>,
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];

  // Helper to find duplicates for a specific field
  const findFieldDuplicates = (
    field: 'title' | 'description' | 'h1',
    getValue: (page: typeof pages[0]) => string | undefined
  ) => {
    // Group by exact match first
    const exactGroups = new Map<string, string[]>();
    const values: Array<{ url: string; value: string; normalized: string }> = [];

    for (const page of pages) {
      const value = getValue(page);
      if (!value || value.trim().length === 0) continue;

      const normalized = normalizeText(value);
      values.push({ url: page.url, value, normalized });

      // Exact match grouping
      if (!exactGroups.has(normalized)) {
        exactGroups.set(normalized, []);
      }
      exactGroups.get(normalized)!.push(page.url);
    }

    // Add exact duplicates
    for (const [normalized, urls] of exactGroups) {
      if (urls.length > 1) {
        // Find original value
        const originalValue = values.find(v => v.normalized === normalized)?.value || normalized;
        groups.push({
          type: field,
          value: originalValue,
          urls,
          similarity: 100,
        });
      }
    }

    // Find near-duplicates (if threshold < 100)
    if (threshold < 100) {
      const uniqueNormalized = [...new Set(values.map(v => v.normalized))];

      for (let i = 0; i < uniqueNormalized.length; i++) {
        for (let j = i + 1; j < uniqueNormalized.length; j++) {
          const a = uniqueNormalized[i];
          const b = uniqueNormalized[j];

          const similarity = calculateStringSimilarity(a, b);
          if (similarity >= threshold && similarity < 100) {
            const urlsA = values.filter(v => v.normalized === a).map(v => v.url);
            const urlsB = values.filter(v => v.normalized === b).map(v => v.url);
            const allUrls = [...new Set([...urlsA, ...urlsB])];

            if (allUrls.length > 1) {
              groups.push({
                type: field,
                value: values.find(v => v.normalized === a)?.value || a,
                urls: allUrls,
                similarity: Math.round(similarity),
              });
            }
          }
        }
      }
    }
  };

  findFieldDuplicates('title', p => p.title);
  findFieldDuplicates('description', p => p.description);
  findFieldDuplicates('h1', p => p.h1);

  return groups;
}

/**
 * Calculate similarity between two strings
 * Uses a combination of length-normalized Levenshtein and token overlap
 */
export function calculateStringSimilarity(a: string, b: string): number {
  if (a === b) return 100;
  if (!a || !b) return 0;

  // Normalize
  const normA = normalizeText(a);
  const normB = normalizeText(b);

  if (normA === normB) return 100;

  // Token-based similarity
  const tokensA = new Set(tokenize(normA));
  const tokensB = new Set(tokenize(normB));

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }

  const tokenSimilarity = (2 * intersection) / (tokensA.size + tokensB.size) * 100;

  // Length similarity
  const lengthRatio = Math.min(normA.length, normB.length) / Math.max(normA.length, normB.length);
  const lengthSimilarity = lengthRatio * 100;

  // Weighted average
  return (tokenSimilarity * 0.7 + lengthSimilarity * 0.3);
}

/**
 * Calculate text-to-HTML ratio
 */
export function calculateTextToHtmlRatio(html: string, text: string): number {
  const htmlLength = html.length;
  const textLength = text.length;

  if (htmlLength === 0) return 0;

  return (textLength / htmlLength) * 100;
}

/**
 * Detect thin content (low word count or low text-to-HTML ratio)
 */
export function isThinContent(
  wordCount: number,
  textToHtmlRatio?: number,
  minWords: number = 300,
  minRatio: number = 10
): { isThin: boolean; reason?: string } {
  if (wordCount < minWords) {
    return {
      isThin: true,
      reason: `Low word count: ${wordCount} words (min: ${minWords})`,
    };
  }

  if (textToHtmlRatio !== undefined && textToHtmlRatio < minRatio) {
    return {
      isThin: true,
      reason: `Low text-to-HTML ratio: ${textToHtmlRatio.toFixed(1)}% (min: ${minRatio}%)`,
    };
  }

  return { isThin: false };
}

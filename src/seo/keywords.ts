/**
 * Keyword Analysis Utilities
 */

export interface KeywordItem {
  word: string;
  count: number;
  density: number; // Percentage relative to total word count
}

export interface KeywordCloud {
  totalWords: number;
  uniqueWords: number;
  topKeywords: KeywordItem[];
}

const RE_NON_WORD = /[^\w\s\u00C0-\u00FF]/g;
const RE_WHITESPACE = /\s+/;

/**
 * Clean and tokenize text
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(RE_NON_WORD, '') // Remove punctuation but keep accented chars
    .split(RE_WHITESPACE)
    .filter(w => w.length > 2); // Ignore very short words
}

/**
 * Generate keyword cloud from text sources
 */
export function generateKeywordCloud(
  sources: { 
    visibleText: string; 
    title?: string; 
    description?: string; 
    keywords?: string; // meta keywords tag
  },
  limit: number = 20
): KeywordCloud {
  // Combine all sources, giving slightly more weight (repetition) to meta tags implies importance
  // but for raw frequency, we just join them. 
  // Ideally, Title words count double? Let's keep it simple frequency for now.
  
  const combinedText = [
    sources.title,
    sources.title, // Weight title x2
    sources.description,
    sources.keywords,
    sources.keywords, // Weight meta keywords x2
    sources.visibleText
  ].filter(Boolean).join(' ');

  const tokens = tokenize(combinedText);
  const totalWords = tokens.length;
  const frequency: Record<string, number> = {};

  for (const token of tokens) {
    frequency[token] = (frequency[token] || 0) + 1;
  }

  const sortedKeywords = Object.entries(frequency)
    .map(([word, count]) => ({
      word,
      count,
      density: totalWords > 0 ? parseFloat(((count / totalWords) * 100).toFixed(2)) : 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return {
    totalWords,
    uniqueWords: Object.keys(frequency).length,
    topKeywords: sortedKeywords
  };
}

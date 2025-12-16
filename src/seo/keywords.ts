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

// Common stop words to ignore (English and Portuguese)
const STOP_WORDS = new Set([
  // English
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'because', 'as', 'what',
  'when', 'where', 'how', 'who', 'which', 'this', 'that', 'these', 'those',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'off',
  'on', 'onto', 'out', 'over', 'to', 'up', 'with', 'about', 'some', 'any',
  'it', 'its', 'you', 'your', 'we', 'our', 'they', 'their', 'he', 'his',
  'she', 'her', 'i', 'my', 'me', 'not', 'no', 'can', 'will', 'just',
  // Portuguese
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'e', 'ou', 'mas', 'se',
  'porque', 'como', 'quando', 'onde', 'que', 'quem', 'qual', 'este', 'esta',
  'esse', 'essa', 'aquele', 'aquela', 'isto', 'isso', 'aquilo', 'é', 'são',
  'foi', 'foram', 'ser', 'sendo', 'ter', 'tem', 'tinha', 'fazer', 'faz', 'fez',
  'em', 'no', 'na', 'nos', 'nas', 'de', 'do', 'da', 'dos', 'das', 'por',
  'para', 'com', 'sem', 'sobre', 'sob', 'ante', 'até', 'ao', 'aos',
  'eu', 'meu', 'minha', 'você', 'seu', 'sua', 'nós', 'nosso', 'nossa',
  'eles', 'elas', 'dele', 'dela', 'não', 'sim', 'muito', 'muita', 'mais',
  'pelo', 'pela', 'pelos', 'pelas', 'num', 'numa', 'está', 'estão'
]);

/**
 * Clean and tokenize text
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u00C0-\u00FF]/g, '') // Remove punctuation but keep accented chars
    .split(/\s+/)
    .filter(w => w.length > 2) // Ignore very short words
    .filter(w => !STOP_WORDS.has(w));
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

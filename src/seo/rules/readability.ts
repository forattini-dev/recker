/**
 * SEO Readability Rules
 * Rules for content readability, Flesch-Kincaid, and text quality
 */

import { SeoRule, createResult } from './types.js';

export const readabilityRules: SeoRule[] = [
  {
    id: 'readability-flesch-score',
    name: 'Flesch Reading Ease',
    category: 'content',
    severity: 'info',
    description: 'Content should be easy to read for the target audience',
    check: (ctx) => {
      if (ctx.fleschReadingEase === undefined) return null;

      const score = ctx.fleschReadingEase;
      let level: string;
      let status: 'pass' | 'warn' | 'info';

      // Flesch Reading Ease interpretation
      // 90-100: Very Easy (5th grade)
      // 80-89: Easy (6th grade)
      // 70-79: Fairly Easy (7th grade)
      // 60-69: Standard (8th-9th grade) - IDEAL for web
      // 50-59: Fairly Difficult (10th-12th grade)
      // 30-49: Difficult (College)
      // 0-29: Very Difficult (College graduate)

      if (score >= 60) {
        level = score >= 80 ? 'Easy' : score >= 70 ? 'Fairly Easy' : 'Standard';
        status = 'pass';
      } else if (score >= 50) {
        level = 'Fairly Difficult';
        status = 'info';
      } else if (score >= 30) {
        level = 'Difficult';
        status = 'warn';
      } else {
        level = 'Very Difficult';
        status = 'warn';
      }

      if (status === 'warn') {
        return createResult(
          { id: 'readability-flesch-score', name: 'Flesch Reading Ease', category: 'content', severity: 'info' },
          status,
          `Flesch score: ${Math.round(score)} (${level})`,
          {
            recommendation: 'Simplify content for better readability',
            evidence: {
              found: Math.round(score),
              expected: '60-70 for general web content',
              impact: 'Difficult content has higher bounce rates',
              learnMore: 'https://en.wikipedia.org/wiki/Flesch%E2%80%93Kincaid_readability_tests',
            },
          }
        );
      }

      return createResult(
        { id: 'readability-flesch-score', name: 'Flesch Reading Ease', category: 'content', severity: 'info' },
        status,
        `Flesch score: ${Math.round(score)} (${level})`
      );
    },
  },
  {
    id: 'readability-sentence-length',
    name: 'Sentence Length',
    category: 'content',
    severity: 'info',
    description: 'Sentences should be concise for better readability',
    check: (ctx) => {
      if (ctx.avgSentenceLength === undefined) return null;

      const avgLength = ctx.avgSentenceLength;

      // Ideal: 15-20 words per sentence
      // Acceptable: up to 25 words
      // Long: 25-30 words
      // Too long: 30+ words

      if (avgLength > 30) {
        return createResult(
          { id: 'readability-sentence-length', name: 'Sentence Length', category: 'content', severity: 'info' },
          'warn',
          `Average sentence length: ${Math.round(avgLength)} words (too long)`,
          {
            recommendation: 'Break long sentences into shorter ones',
            evidence: {
              found: Math.round(avgLength),
              expected: '15-20 words per sentence ideal, max 25',
              impact: 'Long sentences are harder to understand on mobile',
            },
          }
        );
      }

      if (avgLength > 25) {
        return createResult(
          { id: 'readability-sentence-length', name: 'Sentence Length', category: 'content', severity: 'info' },
          'info',
          `Average sentence length: ${Math.round(avgLength)} words (slightly long)`,
          {
            recommendation: 'Consider shortening some sentences',
            evidence: {
              found: Math.round(avgLength),
              expected: '15-20 words per sentence',
            },
          }
        );
      }

      return createResult(
        { id: 'readability-sentence-length', name: 'Sentence Length', category: 'content', severity: 'info' },
        'pass',
        `Average sentence length: ${Math.round(avgLength)} words`
      );
    },
  },
  {
    id: 'readability-paragraph-length',
    name: 'Paragraph Length',
    category: 'content',
    severity: 'info',
    description: 'Paragraphs should be short for web readability',
    check: (ctx) => {
      if (ctx.avgParagraphLength === undefined) return null;

      const avgLength = ctx.avgParagraphLength;

      // Web best practice: 3-4 sentences or 40-60 words per paragraph
      // Max recommended: 100 words

      if (avgLength > 150) {
        return createResult(
          { id: 'readability-paragraph-length', name: 'Paragraph Length', category: 'content', severity: 'info' },
          'warn',
          `Average paragraph length: ${Math.round(avgLength)} words (too long)`,
          {
            recommendation: 'Break paragraphs into smaller chunks',
            evidence: {
              found: Math.round(avgLength),
              expected: '40-80 words per paragraph for web',
              impact: 'Wall of text reduces engagement and increases bounce rate',
            },
          }
        );
      }

      if (avgLength > 100) {
        return createResult(
          { id: 'readability-paragraph-length', name: 'Paragraph Length', category: 'content', severity: 'info' },
          'info',
          `Average paragraph length: ${Math.round(avgLength)} words`,
          {
            recommendation: 'Consider breaking longer paragraphs',
          }
        );
      }

      return createResult(
        { id: 'readability-paragraph-length', name: 'Paragraph Length', category: 'content', severity: 'info' },
        'pass',
        `Average paragraph length: ${Math.round(avgLength)} words`
      );
    },
  },
  {
    id: 'readability-passive-voice',
    name: 'Passive Voice',
    category: 'content',
    severity: 'info',
    description: 'Limit passive voice for clearer writing',
    check: (ctx) => {
      if (ctx.passiveVoicePercentage === undefined) return null;

      const percentage = ctx.passiveVoicePercentage;

      // Best practice: less than 10% passive voice
      // Acceptable: up to 15%
      // Too high: 20%+

      if (percentage > 20) {
        return createResult(
          { id: 'readability-passive-voice', name: 'Passive Voice', category: 'content', severity: 'info' },
          'warn',
          `Passive voice: ${Math.round(percentage)}% of sentences`,
          {
            recommendation: 'Convert passive sentences to active voice',
            evidence: {
              found: `${Math.round(percentage)}%`,
              expected: 'Less than 10% passive voice',
              example: 'Instead of "The button was clicked by the user" → "The user clicked the button"',
            },
          }
        );
      }

      if (percentage > 15) {
        return createResult(
          { id: 'readability-passive-voice', name: 'Passive Voice', category: 'content', severity: 'info' },
          'info',
          `Passive voice: ${Math.round(percentage)}% of sentences`,
          {
            recommendation: 'Consider reducing passive voice usage',
          }
        );
      }

      return null; // Don't report if acceptable
    },
  },
  {
    id: 'readability-transition-words',
    name: 'Transition Words',
    category: 'content',
    severity: 'info',
    description: 'Use transition words for better flow',
    check: (ctx) => {
      if (ctx.transitionWordPercentage === undefined) return null;

      const percentage = ctx.transitionWordPercentage;

      // Best practice: at least 30% of sentences have transition words

      if (percentage < 20) {
        return createResult(
          { id: 'readability-transition-words', name: 'Transition Words', category: 'content', severity: 'info' },
          'info',
          `Transition words: ${Math.round(percentage)}% of sentences`,
          {
            recommendation: 'Add transition words for better content flow',
            evidence: {
              found: `${Math.round(percentage)}%`,
              expected: 'At least 30% of sentences',
              example: 'Words like: however, therefore, additionally, furthermore, for example',
              impact: 'Transition words improve comprehension and engagement',
            },
          }
        );
      }

      return createResult(
        { id: 'readability-transition-words', name: 'Transition Words', category: 'content', severity: 'info' },
        'pass',
        `Transition words: ${Math.round(percentage)}% of sentences`
      );
    },
  },
  {
    id: 'readability-subheading-distribution',
    name: 'Subheading Distribution',
    category: 'content',
    severity: 'info',
    description: 'Break content with subheadings every 300 words',
    check: (ctx) => {
      if (!ctx.wordCount || !ctx.h2Count) return null;

      // Best practice: one subheading every 250-350 words
      const wordsPerSubheading = ctx.wordCount / (ctx.h2Count + 1);

      if (ctx.wordCount > 500 && wordsPerSubheading > 400) {
        return createResult(
          { id: 'readability-subheading-distribution', name: 'Subheading Distribution', category: 'content', severity: 'info' },
          'warn',
          `${Math.round(wordsPerSubheading)} words between subheadings (too many)`,
          {
            recommendation: 'Add more H2/H3 subheadings to break up content',
            evidence: {
              found: `${ctx.h2Count} subheadings for ${ctx.wordCount} words`,
              expected: 'One subheading every 250-350 words',
              impact: 'Subheadings improve scannability and featured snippet eligibility',
            },
          }
        );
      }

      if (ctx.wordCount > 300 && wordsPerSubheading > 300) {
        return createResult(
          { id: 'readability-subheading-distribution', name: 'Subheading Distribution', category: 'content', severity: 'info' },
          'info',
          `${Math.round(wordsPerSubheading)} words per section`,
          {
            recommendation: 'Consider adding more subheadings',
          }
        );
      }

      return createResult(
        { id: 'readability-subheading-distribution', name: 'Subheading Distribution', category: 'content', severity: 'info' },
        'pass',
        `${Math.round(wordsPerSubheading)} words per section (good)`
      );
    },
  },
  {
    id: 'readability-text-variety',
    name: 'Text Variety',
    category: 'content',
    severity: 'info',
    description: 'Use varied sentence structures and word choices',
    check: (ctx) => {
      if (ctx.consecutiveSentenceStarts === undefined) return null;

      // Check for consecutive sentences starting with same word
      if (ctx.consecutiveSentenceStarts > 3) {
        return createResult(
          { id: 'readability-text-variety', name: 'Text Variety', category: 'content', severity: 'info' },
          'info',
          `${ctx.consecutiveSentenceStarts} consecutive sentences start similarly`,
          {
            recommendation: 'Vary sentence beginnings for better flow',
            evidence: {
              impact: 'Repetitive sentence structures feel monotonous',
            },
          }
        );
      }

      return null;
    },
  },
  {
    id: 'readability-word-complexity',
    name: 'Word Complexity',
    category: 'content',
    severity: 'info',
    description: 'Avoid overly complex vocabulary',
    check: (ctx) => {
      if (ctx.complexWordPercentage === undefined) return null;

      // Complex words: 3+ syllables
      // Best practice: less than 10% complex words

      if (ctx.complexWordPercentage > 15) {
        return createResult(
          { id: 'readability-word-complexity', name: 'Word Complexity', category: 'content', severity: 'info' },
          'warn',
          `Complex words: ${Math.round(ctx.complexWordPercentage)}%`,
          {
            recommendation: 'Use simpler vocabulary where possible',
            evidence: {
              found: `${Math.round(ctx.complexWordPercentage)}% words with 3+ syllables`,
              expected: 'Less than 10% complex words for general audience',
              impact: 'Complex vocabulary reduces comprehension',
            },
          }
        );
      }

      if (ctx.complexWordPercentage > 10) {
        return createResult(
          { id: 'readability-word-complexity', name: 'Word Complexity', category: 'content', severity: 'info' },
          'info',
          `Complex words: ${Math.round(ctx.complexWordPercentage)}%`
        );
      }

      return null;
    },
  },
  {
    id: 'readability-list-usage',
    name: 'List Usage',
    category: 'content',
    severity: 'info',
    description: 'Use lists to improve scannability',
    check: (ctx) => {
      if (!ctx.wordCount || ctx.listCount === undefined) return null;

      // Suggest lists for longer content without lists
      if (ctx.wordCount > 500 && ctx.listCount === 0) {
        return createResult(
          { id: 'readability-list-usage', name: 'List Usage', category: 'content', severity: 'info' },
          'info',
          'No lists found in long-form content',
          {
            recommendation: 'Consider using bullet points or numbered lists',
            evidence: {
              found: `${ctx.wordCount} words with 0 lists`,
              expected: 'At least 1 list per 500 words for long content',
              impact: 'Lists improve scannability and featured snippet eligibility',
            },
          }
        );
      }

      if (ctx.listCount > 0) {
        return createResult(
          { id: 'readability-list-usage', name: 'List Usage', category: 'content', severity: 'info' },
          'pass',
          `${ctx.listCount} list(s) found`
        );
      }

      return null;
    },
  },
];

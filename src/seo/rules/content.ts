import { SeoRule, createResult } from './types.js';
import { SEO_THRESHOLDS } from './thresholds.js';
import type { SeoStatus } from '../types.js';

export const contentRules: SeoRule[] = [
  // Word Count and Content Depth
  {
    id: 'content-depth-word-count',
    name: 'Content Depth (Word Count)',
    category: 'content',
    severity: 'warning',
    description: 'Page should meet minimum word count for its purpose.',
    check: (ctx) => {
      if (ctx.wordCount === undefined) return null;
      const { minWordsSimple, minWordsRanking, minWordsAuthority } = SEO_THRESHOLDS.content;
      const veryThinWords = SEO_THRESHOLDS.thinContent.veryThinWords;

      if (ctx.wordCount < veryThinWords) {
        return createResult(
          { id: 'content-depth-word-count', name: 'Content Depth', category: 'content', severity: 'error' },
          'fail',
          `Very thin content (${ctx.wordCount} words, min: ${veryThinWords})`,
          { recommendation: 'Add more substantial content (at least 150-300 words).' }
        );
      }
      if (ctx.wordCount < minWordsSimple) {
        return createResult(
          { id: 'content-depth-word-count', name: 'Content Depth', category: 'content', severity: 'warning' },
          'warn',
          `Thin content (${ctx.wordCount} words, min for simple: ${minWordsSimple})`,
          { recommendation: `Consider expanding to at least ${minWordsSimple} words for simple pages, or more for ranking.` }
        );
      }
      if (ctx.wordCount < minWordsRanking) {
        return createResult(
          { id: 'content-depth-word-count', name: 'Content Depth', category: 'content', severity: 'info' },
          'warn',
          `Content may be too short to rank (${ctx.wordCount} words, min for ranking: ${minWordsRanking})`,
          { recommendation: `Expand content to at least ${minWordsRanking} words for competitive keywords.` }
        );
      }
      if (ctx.wordCount < minWordsAuthority) {
        return createResult(
          { id: 'content-depth-word-count', name: 'Content Depth', category: 'content', severity: 'info' },
          'info',
          `Content is not authority-level (${ctx.wordCount} words, min for authority: ${minWordsAuthority})`,
          { recommendation: `For authority content, aim for ${minWordsAuthority} words or more.` }
        );
      }
      return createResult(
        { id: 'content-depth-word-count', name: 'Content Depth', category: 'content', severity: 'info' },
        'pass',
        `Good content depth (${ctx.wordCount} words)`,
        { value: ctx.wordCount }
      );
    },
  },
  {
    id: 'content-readability-sentence-length',
    name: 'Readability (Sentence Length)',
    category: 'content',
    severity: 'info',
    description: 'Sentences should average under 25 words for better readability.',
    check: (ctx) => {
      if (ctx.avgWordsPerSentence === undefined) return null;
      const max = SEO_THRESHOLDS.content.maxWordsPerSentence;

      if (ctx.avgWordsPerSentence > max) {
        return createResult(
          { id: 'content-readability-sentence-length', name: 'Readability', category: 'content', severity: 'info' },
          'warn',
          `Long sentences (avg ${ctx.avgWordsPerSentence} words/sentence)`,
          { value: ctx.avgWordsPerSentence, recommendation: `Aim for under ${max} words per sentence for better readability.` }
        );
      }
      return createResult(
        { id: 'content-readability-sentence-length', name: 'Readability', category: 'content', severity: 'info' },
        'pass',
        `Good sentence length (avg ${ctx.avgWordsPerSentence} words)`,
        { value: ctx.avgWordsPerSentence }
      );
    },
  },
  {
    id: 'content-paragraph-length',
    name: 'Paragraph Length',
    category: 'content',
    severity: 'info',
    description: 'Paragraphs should be concise (ideal 40-90 words) for mobile readability.',
    check: (ctx) => {
      if (!ctx.paragraphWordCounts || ctx.paragraphWordCounts.length === 0) return null;
      const { minWordsPerParagraph, maxWordsPerParagraph } = SEO_THRESHOLDS.content;

      let tooShort = 0;
      let tooLong = 0;
      ctx.paragraphWordCounts.forEach(count => {
        if (count < minWordsPerParagraph) tooShort++;
        if (count > maxWordsPerParagraph) tooLong++;
      });

      if (tooShort > 0 || tooLong > 0) {
        let message = '';
        const recs = [];
        if (tooShort > 0) {
          message += `${tooShort} paragraph(s) are too short (min: ${minWordsPerParagraph} words). `;
          recs.push('Expand short paragraphs.');
        }
        if (tooLong > 0) {
          message += `${tooLong} paragraph(s) are too long (max: ${maxWordsPerParagraph} words).`;
          recs.push('Break long paragraphs into smaller ones.');
        }

        return createResult(
          { id: 'content-paragraph-length', name: 'Paragraph Length', category: 'content', severity: 'warning' },
          'warn',
          message.trim(),
          { recommendation: `Aim for paragraphs between ${minWordsPerParagraph}-${maxWordsPerParagraph} words. ${recs.join(' ')}` }
        );
      }
      return null;
    },
  },
  {
    id: 'content-lists-presence',
    name: 'Lists Usage',
    category: 'content',
    severity: 'info',
    description: 'Use lists (ul/ol) to improve readability and SGE compatibility.',
    check: (ctx) => {
      if (ctx.listCount === undefined || ctx.listCount === 0) {
        return createResult(
          { id: 'content-lists-presence', name: 'Lists Usage', category: 'content', severity: 'info' },
          'info',
          'No lists (ul/ol) found',
          { recommendation: 'Consider using bullet points or numbered lists for better scannability and AI summarization.' }
        );
      }
      return null;
    },
  },
  {
    id: 'content-subheading-frequency',
    name: 'Subheading Frequency',
    category: 'content',
    severity: 'info',
    description: 'Subheadings (H2/H3) should be used frequently to break up content.',
    check: (ctx) => {
      // Threshold: 1 subheading every X words (e.g., 1 per 150-200 words), so frequency should be > 0.5 per 100 words
      const idealFrequencyPer100Words = 0.5; // e.g., 1 subheading per 200 words
      if (ctx.wordCount && ctx.wordCount > 300 && (ctx.subheadingFrequency ?? 0) < idealFrequencyPer100Words) {
        return createResult(
          { id: 'content-subheading-frequency', name: 'Subheading Frequency', category: 'content', severity: 'info' },
          'warn',
          `Low subheading frequency (${(ctx.subheadingFrequency ?? 0).toFixed(2)} per 100 words)`,
          { recommendation: `Add more subheadings (H2/H3) to break up long text blocks.` }
        );
      }
      return null;
    },
  },
  {
    id: 'content-emphasis-tags',
    name: 'Emphasis Tags Usage',
    category: 'content',
    severity: 'info',
    description: 'Use strong/em tags moderately for emphasis, avoid keyword stuffing.',
    check: (ctx) => {
      const totalEmphasisTags = (ctx.strongTagCount ?? 0) + (ctx.emTagCount ?? 0);
      if (ctx.wordCount && ctx.wordCount > 200 && totalEmphasisTags === 0) {
        return createResult(
          { id: 'content-emphasis-tags', name: 'Emphasis Tags Usage', category: 'content', severity: 'info' },
          'info',
          'No strong/em tags found in substantial content',
          { recommendation: 'Use <strong> or <em> tags to highlight important keywords or phrases.' }
        );
      }
      const emphasisRatio = totalEmphasisTags / (ctx.wordCount || 1);
      const maxEmphasisRatio = 0.05; // 5% of words emphasized (heuristic)
      if (ctx.wordCount && ctx.wordCount > 100 && emphasisRatio > maxEmphasisRatio) {
        return createResult(
          { id: 'content-emphasis-tags', name: 'Emphasis Tags Usage', category: 'content', severity: 'warning' },
          'warn',
          `Potentially excessive emphasis tags (${totalEmphasisTags} tags for ${ctx.wordCount} words)`,
          { recommendation: 'Moderate the use of <strong> and <em> tags to avoid over-optimization.' }
        );
      }
      return null;
    },
  },
  {
    id: 'multimedia-video-audio',
    name: 'Multimedia Content',
    category: 'content',
    severity: 'info',
    description: 'Rich content with videos and audio can enhance user experience.',
    check: (ctx) => {
      const totalMultimedia = (ctx.videoCount ?? 0) + (ctx.audioCount ?? 0);
      if (totalMultimedia === 0 && ctx.wordCount && ctx.wordCount > 500) {
        return createResult(
          { id: 'multimedia-video-audio', name: 'Multimedia Content', category: 'content', severity: 'info' },
          'info',
          'No video or audio elements found for substantial content',
          { recommendation: 'Consider adding relevant videos, audio, or other rich media to engage users.' }
        );
      }
      return null;
    },
  },
  {
    id: 'content-sge-optimization',
    name: 'AI Overview (SGE) Optimization',
    category: 'content',
    severity: 'info',
    description: 'Optimize content for Google AI Overviews by using question-based headings and clear lists.',
    check: (ctx) => {
      if (ctx.wordCount && ctx.wordCount > 300) { // Only suggest for substantial content
        let messages = [];
        let recommendation = '';

        if (!ctx.hasQuestionHeadings) {
          messages.push('No question-based headings (H2/H3) found.');
          recommendation += 'Use H2/H3 headings that phrase common questions (e.g., "What is X?", "How to do Y?"). ';
        }
        if (ctx.listCount === 0) {
          messages.push('No lists (ul/ol) found.');
          recommendation += 'Incorporate clear numbered or bulleted lists for steps, features, or summaries.';
        }

        if (messages.length > 0) {
          return createResult(
            { id: 'content-sge-optimization', name: 'AI Overview Optimization', category: 'content', severity: 'info' },
            'info',
            `Content could be better optimized for AI Overviews: ${messages.join(' ')}`,
            { recommendation: recommendation.trim() }
          );
        }
      }
      return null;
    },
  },
  {
    id: 'content-flesch-readability',
    name: 'Flesch Reading Ease Score',
    category: 'content',
    severity: 'info',
    description: 'Measures readability, aiming for a Flesch score above 60 for broad audiences.',
    check: (ctx) => {
      if (ctx.fleschReadingEase === undefined) {
        return createResult(
          { id: 'content-flesch-readability', name: 'Flesch Reading Ease', category: 'content', severity: 'info' },
          'info',
          'Flesch Reading Ease score could not be calculated.',
          { recommendation: 'To enable Flesch score analysis, ensure the analyzer has capabilities to count syllables per word.' }
        );
      }
      const score = ctx.fleschReadingEase;
      if (score < 60) {
        return createResult(
          { id: 'content-flesch-readability', name: 'Flesch Reading Ease', category: 'content', severity: 'warning' },
          'warn',
          `Low Flesch Reading Ease score: ${score.toFixed(2)} (target > 60)`,
          { value: score, recommendation: 'Simplify sentence structure and vocabulary to improve readability for a broader audience.' }
        );
      }
      return createResult(
        { id: 'content-flesch-readability', name: 'Flesch Reading Ease', category: 'content', severity: 'info' },
        'pass',
        `Good Flesch Reading Ease score: ${score.toFixed(2)}`,
        { value: score }
      );
    },
  },
  {
    id: 'content-faq-mandatory',
    name: 'Mandatory FAQ Section',
    category: 'content',
    severity: 'info',
    description: 'For comprehensive content, an FAQ section is recommended.',
    check: (ctx) => {
      if (ctx.wordCount && ctx.wordCount > SEO_THRESHOLDS.content.minWordsAuthority && (ctx.faqCount ?? 0) < 3) {
        return createResult(
          { id: 'content-faq-mandatory', name: 'FAQ Section', category: 'content', severity: 'info' },
          'warn',
          'Consider adding a dedicated FAQ section for comprehensive content',
          { recommendation: 'Include 3-7 common questions as H3s and optionally use Schema.org FAQPage markup for rich results.' }
        );
      }
      return null;
    },
  },
  {
    id: 'content-image-text-proportion',
    name: 'Image-Text Proportion',
    category: 'content',
    severity: 'info',
    description: 'Maintain a healthy image-to-text ratio for engaging content.',
    check: (ctx) => {
      if (ctx.wordCount === undefined || ctx.wordCount < 200 || ctx.totalImages === undefined || ctx.totalImages === 0) return null;

      const { min: minWords, max: maxWords } = SEO_THRESHOLDS.content.imageWordRatio;
      const actualWordsPerImage = ctx.wordCount / ctx.totalImages;

      if (actualWordsPerImage > maxWords) {
        return createResult(
          { id: 'content-image-text-proportion', name: 'Image-Text Proportion', category: 'content', severity: 'info' },
          'warn',
          `Low image density (1 image per ${actualWordsPerImage.toFixed(0)} words, ideal: 1 per ${minWords}-${maxWords})`,
          { recommendation: 'Add more relevant images to break up text and improve engagement.' }
        );
      }
      if (actualWordsPerImage < minWords) {
        return createResult(
          { id: 'content-image-text-proportion', name: 'Image-Text Proportion', category: 'content', severity: 'info' },
          'warn',
          `High image density (1 image per ${actualWordsPerImage.toFixed(0)} words, ideal: 1 per ${minWords}-${maxWords})`,
          { recommendation: 'Ensure images are relevant and not excessive, as too many can be distracting.' }
        );
      }
      return null;
    },
  },
  {
    id: 'content-main-keyword-redundancy',
    name: 'Main Keyword Redundancy',
    category: 'content',
    severity: 'info',
    description: 'Avoid keyword stuffing in key areas (title, H1, first paragraph, image alt).',
    check: (ctx) => {
      // This rule requires `mainKeyword` to be provided in options to be fully effective.
      if (!ctx.mainKeyword || !ctx.title || !ctx.h1Text || !ctx.metaDescription || !ctx.paragraphWordCounts || ctx.paragraphWordCounts.length === 0) return null;

      const keyword = ctx.mainKeyword.toLowerCase();
      let redundancyCount = 0;

      // Check title
      if (ctx.title.toLowerCase().includes(keyword)) redundancyCount++;
      // Check H1
      if (ctx.h1Text.toLowerCase().includes(keyword)) redundancyCount++;
      // Check first paragraph (using first paragraph's text to evaluate)
      // This would require storing the first paragraph's text in RuleContext
      // For now, let's assume `metaDescription` is a good proxy for intro summary if needed or ignore.
      // Skipping first paragraph check for now due to lack of direct text.
      // Check image alt text (if any alt includes it and total count of images that have it.)
      // Check one H2
      // Check conclusion

      if (redundancyCount > SEO_THRESHOLDS.content.redundancyTolerance) {
        return createResult(
          { id: 'content-main-keyword-redundancy', name: 'Main Keyword Redundancy', category: 'content', severity: 'warning' },
          'warn',
          `Main keyword "${ctx.mainKeyword}" appears too often in key SEO elements.`,
          { recommendation: 'Ensure natural language use of keywords. Avoid over-optimization (keyword stuffing) in title, H1, meta description, and alt texts.' }
        );
      }
      return null;
    },
  },
];

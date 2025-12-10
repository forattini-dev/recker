/**
 * AI Search Optimization Rules
 *
 * Rules for optimizing content for AI-powered search engines and LLMs.
 * Based on llmstxt.org specification and AI search best practices.
 */

import { SeoRule, createResult } from './types.js';

export const aiSearchRules: SeoRule[] = [
  // ==========================================================================
  // llms.txt
  // ==========================================================================
  {
    id: 'ai-llms-txt-exists',
    name: 'llms.txt File',
    category: 'ai-search',
    severity: 'info',
    description: 'llms.txt helps AI systems understand your site (llmstxt.org)',
    check: (ctx) => {
      if (ctx.llmsTxt === undefined) return null;

      if (!ctx.llmsTxt.exists) {
        return createResult(
          { id: 'ai-llms-txt-exists', name: 'llms.txt File', category: 'ai-search', severity: 'info' },
          'info',
          'llms.txt not found',
          {
            recommendation: 'Create llms.txt to optimize for AI/LLM discovery',
            evidence: {
              expected: '/llms.txt file',
              impact: 'AI systems may not understand your site structure and content',
              learnMore: 'https://llmstxt.org/',
            },
          }
        );
      }

      if (ctx.llmsTxt.valid) {
        return createResult(
          { id: 'ai-llms-txt-exists', name: 'llms.txt File', category: 'ai-search', severity: 'info' },
          'pass',
          'llms.txt found and valid'
        );
      }

      return createResult(
        { id: 'ai-llms-txt-exists', name: 'llms.txt File', category: 'ai-search', severity: 'info' },
        'warn',
        'llms.txt found but has issues',
        {
          recommendation: 'Fix validation issues in llms.txt',
          evidence: {
            found: ctx.llmsTxt.issues?.map((i: { message: string }) => i.message) || [],
          },
        }
      );
    },
  },
  {
    id: 'ai-llms-txt-structure',
    name: 'llms.txt Structure',
    category: 'ai-search',
    severity: 'info',
    description: 'llms.txt should have proper structure with site name and description',
    check: (ctx) => {
      if (!ctx.llmsTxt?.exists || !ctx.llmsTxt.parseResult) return null;

      const { siteName, siteDescription, sections, links } = ctx.llmsTxt.parseResult;
      const issues: string[] = [];

      if (!siteName) {
        issues.push('Missing site name (# heading)');
      }
      if (!siteDescription) {
        issues.push('Missing site description (> blockquote)');
      }
      if (sections.length === 0) {
        issues.push('No content sections (## headings)');
      }
      if (links.length === 0) {
        issues.push('No links to content');
      }

      if (issues.length > 0) {
        return createResult(
          { id: 'ai-llms-txt-structure', name: 'llms.txt Structure', category: 'ai-search', severity: 'info' },
          'info',
          `llms.txt structure can be improved`,
          {
            recommendation: 'Add missing elements to llms.txt',
            evidence: {
              found: issues,
              expected: 'Site name, description, sections, and links',
              learnMore: 'https://llmstxt.org/',
            },
          }
        );
      }

      return createResult(
        { id: 'ai-llms-txt-structure', name: 'llms.txt Structure', category: 'ai-search', severity: 'info' },
        'pass',
        'llms.txt has good structure'
      );
    },
  },

  // ==========================================================================
  // Content Structure for AI
  // ==========================================================================
  {
    id: 'ai-content-structure',
    name: 'AI-Friendly Content Structure',
    category: 'ai-search',
    severity: 'info',
    description: 'Content should be well-structured for AI comprehension',
    check: (ctx) => {
      if (!ctx.headings?.structure) return null;

      const issues: string[] = [];

      // Check for clear heading hierarchy
      const h1Count = ctx.headings.h1Count || 0;
      const hasH2 = ctx.headings.structure.some((h: { level: number }) => h.level === 2);
      const hasH3 = ctx.headings.structure.some((h: { level: number }) => h.level === 3);

      if (h1Count !== 1) {
        issues.push(h1Count === 0 ? 'No H1 heading' : `Multiple H1 headings (${h1Count})`);
      }

      if (!hasH2 && ctx.wordCount && ctx.wordCount > 500) {
        issues.push('Long content without H2 subheadings');
      }

      // Check for question headings (good for featured snippets)
      const questionHeadings = ctx.headings.structure.filter(
        (h: { text: string }) => h.text.includes('?') || /^(what|how|why|when|where|who|which)/i.test(h.text)
      );

      if (issues.length > 0) {
        return createResult(
          { id: 'ai-content-structure', name: 'AI-Friendly Content Structure', category: 'ai-search', severity: 'info' },
          'info',
          'Content structure can be improved for AI',
          {
            recommendation: 'Use clear heading hierarchy and question-based headings',
            evidence: {
              found: issues,
              expected: 'Single H1, logical H2/H3 hierarchy, question headings',
            },
          }
        );
      }

      return createResult(
        { id: 'ai-content-structure', name: 'AI-Friendly Content Structure', category: 'ai-search', severity: 'info' },
        'pass',
        'Good content structure for AI comprehension'
      );
    },
  },
  {
    id: 'ai-question-headings',
    name: 'Question-Based Headings',
    category: 'ai-search',
    severity: 'info',
    description: 'Question headings help with AI search featured snippets',
    check: (ctx) => {
      if (!ctx.headings?.structure) return null;

      const questionPatterns = [
        /^what\s/i, /^how\s/i, /^why\s/i, /^when\s/i,
        /^where\s/i, /^who\s/i, /^which\s/i, /^can\s/i,
        /^does\s/i, /^is\s/i, /^are\s/i, /\?$/,
      ];

      const questionHeadings = ctx.headings.structure.filter(
        (h: { text: string }) => questionPatterns.some(p => p.test(h.text))
      );

      if (questionHeadings.length > 0) {
        return createResult(
          { id: 'ai-question-headings', name: 'Question-Based Headings', category: 'ai-search', severity: 'info' },
          'pass',
          `${questionHeadings.length} question-based heading(s) found`,
          {
            value: questionHeadings.length,
            evidence: {
              found: questionHeadings.map((h: { text: string }) => h.text).slice(0, 5),
            },
          }
        );
      }

      if (ctx.wordCount && ctx.wordCount > 500) {
        return createResult(
          { id: 'ai-question-headings', name: 'Question-Based Headings', category: 'ai-search', severity: 'info' },
          'info',
          'No question-based headings found',
          {
            recommendation: 'Add question headings to improve AI search visibility',
            evidence: {
              example: 'Use headings like "What is...?", "How to...", "Why should...?"',
              impact: 'Question headings often trigger featured snippets in AI search',
            },
          }
        );
      }

      return null;
    },
  },

  // ==========================================================================
  // Structured Data for AI
  // ==========================================================================
  {
    id: 'ai-structured-data',
    name: 'Structured Data for AI',
    category: 'ai-search',
    severity: 'info',
    description: 'Schema.org structured data helps AI understand content',
    check: (ctx) => {
      if (!ctx.jsonLdTypes) return null;

      const aiHelpfulTypes = [
        'Article', 'BlogPosting', 'NewsArticle', 'TechArticle',
        'FAQPage', 'HowTo', 'QAPage',
        'Product', 'Review', 'Organization', 'Person',
        'BreadcrumbList', 'WebPage', 'WebSite',
      ];

      const foundTypes = ctx.jsonLdTypes;
      const helpfulFound = foundTypes.filter((t: string) =>
        aiHelpfulTypes.some(ht => t.includes(ht))
      );

      if (helpfulFound.length > 0) {
        return createResult(
          { id: 'ai-structured-data', name: 'Structured Data for AI', category: 'ai-search', severity: 'info' },
          'pass',
          `${helpfulFound.length} AI-helpful schema type(s) found`,
          {
            value: helpfulFound.length,
            evidence: {
              found: helpfulFound,
            },
          }
        );
      }

      if (foundTypes.length > 0) {
        return createResult(
          { id: 'ai-structured-data', name: 'Structured Data for AI', category: 'ai-search', severity: 'info' },
          'info',
          'Structured data found but could be more AI-friendly',
          {
            value: foundTypes.length,
            recommendation: 'Add Article, FAQPage, HowTo, or other content-rich schemas',
            evidence: {
              found: foundTypes,
              expected: 'Article, FAQPage, HowTo, Product, Review, etc.',
            },
          }
        );
      }

      return createResult(
        { id: 'ai-structured-data', name: 'Structured Data for AI', category: 'ai-search', severity: 'info' },
        'info',
        'No structured data found',
        {
          recommendation: 'Add Schema.org structured data for better AI understanding',
          evidence: {
            expected: 'JSON-LD with Article, FAQPage, HowTo, etc.',
            impact: 'AI systems use structured data to understand content context',
          },
        }
      );
    },
  },
  {
    id: 'ai-faq-schema',
    name: 'FAQ Schema for AI',
    category: 'ai-search',
    severity: 'info',
    description: 'FAQPage schema is highly valuable for AI search results',
    check: (ctx) => {
      if (!ctx.jsonLdTypes) return null;

      const hasFaqSchema = ctx.jsonLdTypes.some((t: string) => t.includes('FAQPage'));
      const hasHowToSchema = ctx.jsonLdTypes.some((t: string) => t.includes('HowTo'));
      const hasQASchema = ctx.jsonLdTypes.some((t: string) => t.includes('QAPage'));

      if (hasFaqSchema || hasHowToSchema || hasQASchema) {
        const foundTypes: string[] = [];
        if (hasFaqSchema) foundTypes.push('FAQPage');
        if (hasHowToSchema) foundTypes.push('HowTo');
        if (hasQASchema) foundTypes.push('QAPage');

        return createResult(
          { id: 'ai-faq-schema', name: 'FAQ Schema for AI', category: 'ai-search', severity: 'info' },
          'pass',
          'FAQ/HowTo/QA schema found (great for AI search)',
          {
            evidence: {
              found: foundTypes,
            },
          }
        );
      }

      // Check if content looks like FAQ/HowTo but missing schema
      const hasQuestionHeadings = ctx.headings?.structure?.some(
        (h: { text: string }) => /\?$|^(how|what|why|when)/i.test(h.text)
      );

      if (hasQuestionHeadings) {
        return createResult(
          { id: 'ai-faq-schema', name: 'FAQ Schema for AI', category: 'ai-search', severity: 'info' },
          'info',
          'Content has Q&A structure but missing FAQ schema',
          {
            recommendation: 'Add FAQPage schema for question-based content',
            evidence: {
              found: 'Question headings detected',
              expected: 'FAQPage JSON-LD schema',
              impact: 'FAQ schema enables rich results in AI-powered search',
            },
          }
        );
      }

      return null;
    },
  },

  // ==========================================================================
  // Content Quality for AI
  // ==========================================================================
  {
    id: 'ai-content-depth',
    name: 'Content Depth for AI',
    category: 'ai-search',
    severity: 'info',
    description: 'AI systems prefer comprehensive, in-depth content',
    check: (ctx) => {
      if (ctx.wordCount === undefined) return null;

      // Minimum word counts for AI search
      const minWords = 300;
      const goodWords = 1000;
      const excellentWords = 2000;

      if (ctx.wordCount < minWords) {
        return createResult(
          { id: 'ai-content-depth', name: 'Content Depth for AI', category: 'ai-search', severity: 'info' },
          'warn',
          `Thin content for AI search (${ctx.wordCount} words)`,
          {
            value: ctx.wordCount,
            recommendation: `Add more comprehensive content (min ${minWords} words)`,
            evidence: {
              found: ctx.wordCount,
              expected: `${minWords}+ words for AI visibility`,
              impact: 'AI systems may not surface thin content in results',
            },
          }
        );
      }

      if (ctx.wordCount >= excellentWords) {
        return createResult(
          { id: 'ai-content-depth', name: 'Content Depth for AI', category: 'ai-search', severity: 'info' },
          'pass',
          `Excellent content depth (${ctx.wordCount} words)`,
          { value: ctx.wordCount }
        );
      }

      if (ctx.wordCount >= goodWords) {
        return createResult(
          { id: 'ai-content-depth', name: 'Content Depth for AI', category: 'ai-search', severity: 'info' },
          'pass',
          `Good content depth (${ctx.wordCount} words)`,
          { value: ctx.wordCount }
        );
      }

      return createResult(
        { id: 'ai-content-depth', name: 'Content Depth for AI', category: 'ai-search', severity: 'info' },
        'info',
        `Moderate content depth (${ctx.wordCount} words)`,
        {
          value: ctx.wordCount,
          recommendation: `Consider expanding to ${goodWords}+ words for better AI visibility`,
        }
      );
    },
  },
  {
    id: 'ai-content-freshness',
    name: 'Content Freshness Signals',
    category: 'ai-search',
    severity: 'info',
    description: 'AI systems value fresh, updated content',
    check: (ctx) => {
      if (!ctx.jsonLdTypes) return null;

      // Check for dateModified in Article schema
      const hasDateSignals = ctx.jsonLdTypes.some((t: string) =>
        t.includes('Article') || t.includes('BlogPosting') || t.includes('NewsArticle')
      );

      if (hasDateSignals) {
        return createResult(
          { id: 'ai-content-freshness', name: 'Content Freshness Signals', category: 'ai-search', severity: 'info' },
          'pass',
          'Article schema with date signals found'
        );
      }

      return createResult(
        { id: 'ai-content-freshness', name: 'Content Freshness Signals', category: 'ai-search', severity: 'info' },
        'info',
        'No content freshness signals detected',
        {
          recommendation: 'Add Article schema with datePublished and dateModified',
          evidence: {
            expected: 'Article/BlogPosting schema with date properties',
            impact: 'AI systems prefer content with clear freshness indicators',
          },
        }
      );
    },
  },

  // ==========================================================================
  // robots.txt AI Considerations
  // ==========================================================================
  {
    id: 'ai-robots-gpt-bot',
    name: 'GPTBot Access',
    category: 'ai-search',
    severity: 'info',
    description: 'Check if GPTBot (OpenAI) is allowed or blocked',
    check: (ctx) => {
      if (!ctx.robotsTxt?.parseResult) return null;

      const { userAgentBlocks } = ctx.robotsTxt.parseResult;

      // Look for GPTBot rules
      const gptBotBlock = userAgentBlocks.find((b: { userAgents: string[] }) =>
        b.userAgents.some(ua => ua.toLowerCase().includes('gptbot'))
      );

      if (gptBotBlock) {
        const hasDisallow = gptBotBlock.rules.some(
          (r: { type: string; path: string }) => r.type === 'disallow' && (r.path === '/' || r.path === '')
        );

        if (hasDisallow) {
          return createResult(
            { id: 'ai-robots-gpt-bot', name: 'GPTBot Access', category: 'ai-search', severity: 'info' },
            'info',
            'GPTBot is blocked in robots.txt',
            {
              recommendation: 'GPTBot blocked = content not used for ChatGPT training',
              evidence: {
                found: 'User-agent: GPTBot with Disallow',
                impact: 'Your content will not appear in ChatGPT responses',
              },
            }
          );
        }
      }

      return createResult(
        { id: 'ai-robots-gpt-bot', name: 'GPTBot Access', category: 'ai-search', severity: 'info' },
        'pass',
        'GPTBot is allowed (default)'
      );
    },
  },
  {
    id: 'ai-robots-anthropic',
    name: 'Anthropic Claude Access',
    category: 'ai-search',
    severity: 'info',
    description: 'Check if Anthropic/Claude crawlers are allowed or blocked',
    check: (ctx) => {
      if (!ctx.robotsTxt?.parseResult) return null;

      const { userAgentBlocks } = ctx.robotsTxt.parseResult;

      // Look for Anthropic/Claude rules
      const anthropicBlock = userAgentBlocks.find((b: { userAgents: string[] }) =>
        b.userAgents.some(ua =>
          ua.toLowerCase().includes('anthropic') ||
          ua.toLowerCase().includes('claude')
        )
      );

      if (anthropicBlock) {
        const hasDisallow = anthropicBlock.rules.some(
          (r: { type: string; path: string }) => r.type === 'disallow' && (r.path === '/' || r.path === '')
        );

        if (hasDisallow) {
          return createResult(
            { id: 'ai-robots-anthropic', name: 'Anthropic Claude Access', category: 'ai-search', severity: 'info' },
            'info',
            'Anthropic/Claude crawler is blocked',
            {
              recommendation: 'Consider implications of blocking AI training crawlers',
              evidence: {
                found: 'Anthropic/Claude blocked in robots.txt',
              },
            }
          );
        }
      }

      return null;
    },
  },

  // ==========================================================================
  // Content Freshness (Last Modified)
  // ==========================================================================
  {
    id: 'ai-content-last-modified',
    name: 'Content Last Modified',
    category: 'ai-search',
    severity: 'info',
    description: 'Content updated recently may perform better in AI search',
    check: (ctx) => {
      if (!ctx.lastModified) return null;

      const lastModifiedDate = new Date(ctx.lastModified);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      if (lastModifiedDate < sixMonthsAgo) {
        const monthsOld = Math.floor((Date.now() - lastModifiedDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
        return createResult(
          { id: 'ai-content-last-modified', name: 'Content Last Modified', category: 'ai-search', severity: 'info' },
          'info',
          `Content last updated ${monthsOld} months ago`,
          {
            value: ctx.lastModified,
            recommendation: 'Consider updating content if it is time-sensitive',
            evidence: {
              found: `Last-Modified: ${ctx.lastModified}`,
              expected: 'Content updated within last 6 months for time-sensitive topics',
              impact: 'AI search engines may prefer recently updated content for some queries'
            }
          }
        );
      }

      return null;
    },
  },

  // ==========================================================================
  // Page Too Long for AI
  // ==========================================================================
  {
    id: 'ai-page-too-long',
    name: 'Page Too Long for AI',
    category: 'ai-search',
    severity: 'info',
    description: 'Very long pages may be truncated by AI search engines',
    check: (ctx) => {
      if (ctx.wordCount === undefined) return null;

      if (ctx.wordCount > 10000) {
        return createResult(
          { id: 'ai-page-too-long', name: 'Page Too Long for AI', category: 'ai-search', severity: 'info' },
          'info',
          `Page has ${ctx.wordCount.toLocaleString()} words (very long)`,
          {
            value: ctx.wordCount,
            recommendation: 'Consider splitting into multiple pages or summarizing key points',
            evidence: {
              found: `${ctx.wordCount.toLocaleString()} words`,
              expected: 'Ideal: 1,000-3,000 words for comprehensive coverage',
              impact: 'AI search engines may truncate or skip portions of very long content'
            }
          }
        );
      }

      if (ctx.wordCount > 5000) {
        return createResult(
          { id: 'ai-page-too-long', name: 'Page Too Long for AI', category: 'ai-search', severity: 'info' },
          'info',
          `Page has ${ctx.wordCount.toLocaleString()} words (long)`,
          {
            value: ctx.wordCount,
            recommendation: 'Ensure key information is near the beginning of the page',
            evidence: {
              found: `${ctx.wordCount.toLocaleString()} words`,
              impact: 'Some AI systems may not process the entire page'
            }
          }
        );
      }

      return null;
    },
  },

  // ==========================================================================
  // Low Semantic HTML Ratio
  // ==========================================================================
  {
    id: 'semantic-html-ratio',
    name: 'Semantic HTML Ratio',
    category: 'ai-search',
    severity: 'info',
    description: 'Pages should use semantic HTML for better AI understanding',
    check: (ctx) => {
      if (ctx.semanticHtmlRatio === undefined) return null;

      if (ctx.semanticHtmlRatio < 0.1) {
        return createResult(
          { id: 'semantic-html-ratio', name: 'Semantic HTML Ratio', category: 'ai-search', severity: 'info' },
          'warn',
          `Low semantic HTML usage (${(ctx.semanticHtmlRatio * 100).toFixed(1)}%)`,
          {
            value: ctx.semanticHtmlRatio,
            recommendation: 'Use semantic HTML tags (article, section, nav, header, footer, aside, main)',
            evidence: {
              found: `${(ctx.semanticHtmlRatio * 100).toFixed(1)}% semantic tags`,
              expected: '>10% semantic HTML tags',
              impact: 'Semantic HTML helps AI understand page structure and content hierarchy',
              learnMore: 'https://web.dev/learn/html/semantic-html/'
            }
          }
        );
      }

      if (ctx.semanticHtmlRatio < 0.2) {
        return createResult(
          { id: 'semantic-html-ratio', name: 'Semantic HTML Ratio', category: 'ai-search', severity: 'info' },
          'info',
          `Moderate semantic HTML usage (${(ctx.semanticHtmlRatio * 100).toFixed(1)}%)`,
          {
            value: ctx.semanticHtmlRatio,
            recommendation: 'Consider adding more semantic structure',
            evidence: {
              found: `${(ctx.semanticHtmlRatio * 100).toFixed(1)}% semantic tags`,
              expected: '>20% for optimal AI comprehension'
            }
          }
        );
      }

      return createResult(
        { id: 'semantic-html-ratio', name: 'Semantic HTML Ratio', category: 'ai-search', severity: 'info' },
        'pass',
        `Good semantic HTML usage (${(ctx.semanticHtmlRatio * 100).toFixed(1)}%)`
      );
    },
  },
];

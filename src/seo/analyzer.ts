/**
 * SEO Analyzer
 *
 * Comprehensive SEO analysis for web pages.
 * Uses the scrape plugin for HTML parsing.
 */

import type { CheerioAPI } from 'cheerio';
import type {
  SeoReport,
  SeoCheckResult,
  HeadingAnalysis,
  ContentMetrics,
  LinkAnalysis,
  ImageAnalysis,
  SocialMetaAnalysis,
  TechnicalSeo,
  SeoAnalyzerOptions,
  SeoStatus,
} from './types.js';
import {
  extractMeta,
  extractOpenGraph,
  extractTwitterCard,
  extractJsonLd,
  extractLinks,
  extractImages,
} from '../scrape/extractors.js';
import { requireOptional } from '../utils/optional-require.js';

// Cached cheerio module
let cheerioModule: typeof import('cheerio') | null = null;

async function loadCheerio(): Promise<typeof import('cheerio')> {
  if (cheerioModule) return cheerioModule;
  cheerioModule = await requireOptional<typeof import('cheerio')>('cheerio', 'recker/seo');
  return cheerioModule;
}

/**
 * SEO Analyzer class
 */
export class SeoAnalyzer {
  private $: CheerioAPI;
  private options: SeoAnalyzerOptions;

  constructor($: CheerioAPI, options: SeoAnalyzerOptions = {}) {
    this.$ = $;
    this.options = options;
  }

  /**
   * Create analyzer from HTML string
   */
  static async fromHtml(html: string, options: SeoAnalyzerOptions = {}): Promise<SeoAnalyzer> {
    const { load } = await loadCheerio();
    return new SeoAnalyzer(load(html), options);
  }

  /**
   * Run full SEO analysis
   */
  analyze(): SeoReport {
    const checks: SeoCheckResult[] = [];
    const url = this.options.baseUrl || '';

    // Extract all data
    const meta = extractMeta(this.$);
    const og = extractOpenGraph(this.$);
    const twitter = extractTwitterCard(this.$);
    const jsonLd = extractJsonLd(this.$);
    const links = extractLinks(this.$, { baseUrl: this.options.baseUrl });
    const images = extractImages(this.$, { baseUrl: this.options.baseUrl });

    // Analyze each aspect
    const titleAnalysis = this.analyzeTitle(meta.title);
    const descriptionAnalysis = this.analyzeDescription(meta.description);
    const headings = this.analyzeHeadings();
    const content = this.analyzeContent();
    const linkAnalysis = this.analyzeLinks(links);
    const imageAnalysis = this.analyzeImages(images);
    const social = this.analyzeSocialMeta(og, twitter);
    const technical = this.analyzeTechnical(meta);
    const jsonLdAnalysis = this.analyzeJsonLd(jsonLd);

    // Add all checks
    checks.push(...titleAnalysis.checks);
    checks.push(...descriptionAnalysis.checks);
    checks.push(...headings.checks);
    checks.push(...linkAnalysis.checks);
    checks.push(...imageAnalysis.checks);
    checks.push(...social.checks);
    checks.push(...technical.checks);
    checks.push(...jsonLdAnalysis.checks);

    // Calculate score
    const { score, grade } = this.calculateScore(checks);

    return {
      url,
      timestamp: new Date(),
      grade,
      score,
      checks,
      title: meta.title ? { text: meta.title, length: meta.title.length } : undefined,
      metaDescription: meta.description ? { text: meta.description, length: meta.description.length } : undefined,
      headings: headings.analysis,
      content,
      links: linkAnalysis.analysis,
      images: imageAnalysis.analysis,
      social: social.analysis,
      technical: technical.analysis,
      jsonLd: {
        count: jsonLd.length,
        types: jsonLd.map(j => j['@type'] as string).filter(Boolean),
      },
    };
  }

  /**
   * Analyze page title
   */
  private analyzeTitle(title?: string): { checks: SeoCheckResult[] } {
    const checks: SeoCheckResult[] = [];

    if (!title) {
      checks.push({
        name: 'Title Tag',
        status: 'fail',
        message: 'Missing title tag',
        recommendation: 'Add a unique, descriptive title tag (50-60 characters)',
      });
      return { checks };
    }

    const length = title.length;

    if (length < 30) {
      checks.push({
        name: 'Title Tag',
        status: 'warn',
        message: `Title too short (${length} chars)`,
        value: title,
        recommendation: 'Expand title to 50-60 characters for better visibility',
      });
    } else if (length > 60) {
      checks.push({
        name: 'Title Tag',
        status: 'warn',
        message: `Title may be truncated (${length} chars)`,
        value: title,
        recommendation: 'Shorten title to under 60 characters to prevent truncation',
      });
    } else {
      checks.push({
        name: 'Title Tag',
        status: 'pass',
        message: `Title length OK (${length} chars)`,
        value: title,
      });
    }

    return { checks };
  }

  /**
   * Analyze meta description
   */
  private analyzeDescription(description?: string): { checks: SeoCheckResult[] } {
    const checks: SeoCheckResult[] = [];

    if (!description) {
      checks.push({
        name: 'Meta Description',
        status: 'fail',
        message: 'Missing meta description',
        recommendation: 'Add a compelling meta description (150-160 characters)',
      });
      return { checks };
    }

    const length = description.length;

    if (length < 120) {
      checks.push({
        name: 'Meta Description',
        status: 'warn',
        message: `Description too short (${length} chars)`,
        value: description.slice(0, 100) + (description.length > 100 ? '...' : ''),
        recommendation: 'Expand to 150-160 characters for better CTR',
      });
    } else if (length > 160) {
      checks.push({
        name: 'Meta Description',
        status: 'warn',
        message: `Description may be truncated (${length} chars)`,
        value: description.slice(0, 100) + '...',
        recommendation: 'Shorten to under 160 characters',
      });
    } else {
      checks.push({
        name: 'Meta Description',
        status: 'pass',
        message: `Description length OK (${length} chars)`,
        value: description.slice(0, 100) + (description.length > 100 ? '...' : ''),
      });
    }

    return { checks };
  }

  /**
   * Analyze heading structure
   */
  private analyzeHeadings(): { checks: SeoCheckResult[]; analysis: HeadingAnalysis } {
    const checks: SeoCheckResult[] = [];
    const issues: string[] = [];
    const structure: { level: number; text: string; count: number }[] = [];

    // Count headings by level
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

    for (let level = 1; level <= 6; level++) {
      const headings = this.$(`h${level}`);
      counts[level] = headings.length;

      headings.each((_, el) => {
        const text = this.$(el).text().trim();
        structure.push({ level, text: text.slice(0, 80), count: 1 });
      });
    }

    // Check H1
    if (counts[1] === 0) {
      checks.push({
        name: 'H1 Tag',
        status: 'fail',
        message: 'Missing H1 heading',
        recommendation: 'Add a single H1 heading that describes the page content',
      });
      issues.push('No H1 tag found');
    } else if (counts[1] > 1) {
      checks.push({
        name: 'H1 Tag',
        status: 'warn',
        message: `Multiple H1 tags (${counts[1]} found)`,
        recommendation: 'Use only one H1 per page',
      });
      issues.push('Multiple H1 tags');
    } else {
      checks.push({
        name: 'H1 Tag',
        status: 'pass',
        message: 'Single H1 tag present',
      });
    }

    // Check hierarchy
    let hasProperHierarchy = true;
    let prevLevel = 0;

    for (const heading of structure) {
      if (heading.level > prevLevel + 1 && prevLevel !== 0) {
        hasProperHierarchy = false;
        issues.push(`Skipped heading level: H${prevLevel} to H${heading.level}`);
      }
      prevLevel = heading.level;
    }

    if (!hasProperHierarchy) {
      checks.push({
        name: 'Heading Hierarchy',
        status: 'warn',
        message: 'Heading levels are skipped',
        recommendation: 'Use sequential heading levels (H1 → H2 → H3)',
      });
    } else if (structure.length > 0) {
      checks.push({
        name: 'Heading Hierarchy',
        status: 'pass',
        message: 'Heading structure is correct',
      });
    }

    return {
      checks,
      analysis: {
        structure,
        h1Count: counts[1],
        hasProperHierarchy,
        issues,
      },
    };
  }

  /**
   * Analyze content metrics
   */
  private analyzeContent(): ContentMetrics {
    // Get body text, excluding scripts and styles
    const bodyText = this.$('body')
      .clone()
      .find('script, style, noscript')
      .remove()
      .end()
      .text()
      .replace(/\s+/g, ' ')
      .trim();

    const words = bodyText.split(/\s+/).filter(w => w.length > 0);
    const sentences = bodyText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = this.$('p').length;

    const wordCount = words.length;
    const readingTimeMinutes = Math.ceil(wordCount / 200); // Average reading speed

    return {
      wordCount,
      characterCount: bodyText.length,
      sentenceCount: sentences.length,
      paragraphCount: paragraphs,
      readingTimeMinutes,
      avgWordsPerSentence: sentences.length > 0 ? Math.round(wordCount / sentences.length) : 0,
    };
  }

  /**
   * Analyze links
   */
  private analyzeLinks(links: ReturnType<typeof extractLinks>): { checks: SeoCheckResult[]; analysis: LinkAnalysis } {
    const checks: SeoCheckResult[] = [];

    const analysis: LinkAnalysis = {
      total: links.length,
      internal: links.filter(l => l.type === 'internal').length,
      external: links.filter(l => l.type === 'external').length,
      nofollow: links.filter(l => l.rel?.includes('nofollow')).length,
      broken: 0, // Would need async check
      withoutText: links.filter(l => !l.text?.trim()).length,
    };

    // Check for links without text
    if (analysis.withoutText > 0) {
      checks.push({
        name: 'Link Text',
        status: 'warn',
        message: `${analysis.withoutText} links without descriptive text`,
        recommendation: 'Add descriptive anchor text to all links',
      });
    } else if (links.length > 0) {
      checks.push({
        name: 'Link Text',
        status: 'pass',
        message: 'All links have descriptive text',
      });
    }

    // Info about link distribution
    checks.push({
      name: 'Links',
      status: 'info',
      message: `${analysis.total} total (${analysis.internal} internal, ${analysis.external} external)`,
    });

    return { checks, analysis };
  }

  /**
   * Analyze images
   */
  private analyzeImages(images: ReturnType<typeof extractImages>): { checks: SeoCheckResult[]; analysis: ImageAnalysis } {
    const checks: SeoCheckResult[] = [];

    const analysis: ImageAnalysis = {
      total: images.length,
      withAlt: images.filter(i => i.alt && i.alt.trim().length > 0).length,
      withoutAlt: images.filter(i => !i.alt || i.alt.trim().length === 0).length,
      lazy: images.filter(i => i.loading === 'lazy').length,
      missingDimensions: images.filter(i => !i.width || !i.height).length,
    };

    if (images.length === 0) {
      checks.push({
        name: 'Images',
        status: 'info',
        message: 'No images found on page',
      });
      return { checks, analysis };
    }

    // Check alt text
    const altPercentage = Math.round((analysis.withAlt / analysis.total) * 100);
    if (analysis.withoutAlt > 0) {
      checks.push({
        name: 'Image Alt Text',
        status: analysis.withoutAlt > analysis.total / 2 ? 'fail' : 'warn',
        message: `${analysis.withoutAlt} of ${analysis.total} images missing alt text (${100 - altPercentage}%)`,
        recommendation: 'Add descriptive alt text to all images for accessibility and SEO',
      });
    } else {
      checks.push({
        name: 'Image Alt Text',
        status: 'pass',
        message: 'All images have alt text',
      });
    }

    // Check lazy loading
    if (analysis.lazy === 0 && analysis.total > 3) {
      checks.push({
        name: 'Lazy Loading',
        status: 'info',
        message: 'No images use lazy loading',
        recommendation: 'Consider adding loading="lazy" to below-the-fold images',
      });
    }

    return { checks, analysis };
  }

  /**
   * Analyze social meta tags
   */
  private analyzeSocialMeta(
    og: ReturnType<typeof extractOpenGraph>,
    twitter: ReturnType<typeof extractTwitterCard>
  ): { checks: SeoCheckResult[]; analysis: SocialMetaAnalysis } {
    const checks: SeoCheckResult[] = [];
    const ogIssues: string[] = [];
    const twitterIssues: string[] = [];

    // OpenGraph analysis
    const hasOg = !!(og.title || og.description || og.image);
    if (!hasOg) {
      ogIssues.push('No OpenGraph meta tags found');
    } else {
      if (!og.title) ogIssues.push('Missing og:title');
      if (!og.description) ogIssues.push('Missing og:description');
      if (!og.image) ogIssues.push('Missing og:image');
      if (!og.url) ogIssues.push('Missing og:url');
    }

    if (ogIssues.length === 0) {
      checks.push({
        name: 'OpenGraph',
        status: 'pass',
        message: 'OpenGraph meta tags are complete',
      });
    } else if (hasOg) {
      checks.push({
        name: 'OpenGraph',
        status: 'warn',
        message: `OpenGraph incomplete: ${ogIssues.join(', ')}`,
        recommendation: 'Add all essential OpenGraph tags for better social sharing',
      });
    } else {
      checks.push({
        name: 'OpenGraph',
        status: 'fail',
        message: 'No OpenGraph meta tags',
        recommendation: 'Add og:title, og:description, og:image, and og:url for social sharing',
      });
    }

    // Twitter Card analysis
    const hasTwitter = !!(twitter.card || twitter.title || twitter.description);
    if (!hasTwitter) {
      twitterIssues.push('No Twitter Card meta tags found');
    } else {
      if (!twitter.card) twitterIssues.push('Missing twitter:card');
      if (!twitter.title) twitterIssues.push('Missing twitter:title');
      if (!twitter.description) twitterIssues.push('Missing twitter:description');
    }

    if (twitterIssues.length === 0) {
      checks.push({
        name: 'Twitter Card',
        status: 'pass',
        message: 'Twitter Card meta tags are complete',
      });
    } else if (hasTwitter) {
      checks.push({
        name: 'Twitter Card',
        status: 'warn',
        message: `Twitter Card incomplete: ${twitterIssues.join(', ')}`,
      });
    } else {
      checks.push({
        name: 'Twitter Card',
        status: 'warn',
        message: 'No Twitter Card meta tags',
        recommendation: 'Add twitter:card, twitter:title, and twitter:description',
      });
    }

    return {
      checks,
      analysis: {
        openGraph: {
          present: hasOg,
          hasTitle: !!og.title,
          hasDescription: !!og.description,
          hasImage: !!og.image,
          hasUrl: !!og.url,
          issues: ogIssues,
        },
        twitterCard: {
          present: hasTwitter,
          hasCard: !!twitter.card,
          hasTitle: !!twitter.title,
          hasDescription: !!twitter.description,
          hasImage: !!twitter.image,
          issues: twitterIssues,
        },
      },
    };
  }

  /**
   * Analyze technical SEO elements
   */
  private analyzeTechnical(meta: ReturnType<typeof extractMeta>): { checks: SeoCheckResult[]; analysis: TechnicalSeo } {
    const checks: SeoCheckResult[] = [];

    // Get HTML lang attribute
    const htmlLang = this.$('html').attr('lang');

    const analysis: TechnicalSeo = {
      hasCanonical: !!meta.canonical,
      canonicalUrl: meta.canonical,
      hasRobotsMeta: !!meta.robots,
      robotsContent: meta.robots,
      hasViewport: !!meta.viewport,
      hasCharset: !!meta.charset,
      hasLang: !!htmlLang,
      langValue: htmlLang,
    };

    // Canonical
    if (analysis.hasCanonical) {
      checks.push({
        name: 'Canonical URL',
        status: 'pass',
        message: 'Canonical URL is defined',
        value: meta.canonical,
      });
    } else {
      checks.push({
        name: 'Canonical URL',
        status: 'warn',
        message: 'No canonical URL defined',
        recommendation: 'Add <link rel="canonical" href="..."> to prevent duplicate content issues',
      });
    }

    // Viewport
    if (analysis.hasViewport) {
      checks.push({
        name: 'Viewport',
        status: 'pass',
        message: 'Viewport meta tag is set',
      });
    } else {
      checks.push({
        name: 'Viewport',
        status: 'fail',
        message: 'Missing viewport meta tag',
        recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">',
      });
    }

    // Language
    if (analysis.hasLang) {
      checks.push({
        name: 'Language',
        status: 'pass',
        message: `Language attribute set (${htmlLang})`,
      });
    } else {
      checks.push({
        name: 'Language',
        status: 'warn',
        message: 'Missing lang attribute on <html>',
        recommendation: 'Add lang attribute: <html lang="en">',
      });
    }

    // Robots
    if (meta.robots) {
      const robotsLower = meta.robots.toLowerCase();
      if (robotsLower.includes('noindex')) {
        checks.push({
          name: 'Robots',
          status: 'warn',
          message: 'Page is set to noindex',
          value: meta.robots,
        });
      } else {
        checks.push({
          name: 'Robots',
          status: 'info',
          message: `Robots meta: ${meta.robots}`,
        });
      }
    }

    return { checks, analysis };
  }

  /**
   * Analyze JSON-LD structured data
   */
  private analyzeJsonLd(jsonLd: ReturnType<typeof extractJsonLd>): { checks: SeoCheckResult[] } {
    const checks: SeoCheckResult[] = [];

    if (jsonLd.length === 0) {
      checks.push({
        name: 'Structured Data',
        status: 'info',
        message: 'No JSON-LD structured data found',
        recommendation: 'Consider adding Schema.org structured data for rich snippets',
      });
    } else {
      const types = jsonLd.map(j => j['@type']).filter(Boolean);
      checks.push({
        name: 'Structured Data',
        status: 'pass',
        message: `${jsonLd.length} JSON-LD block(s) found`,
        value: types.length > 0 ? `Types: ${types.join(', ')}` : undefined,
      });
    }

    return { checks };
  }

  /**
   * Calculate overall SEO score
   */
  private calculateScore(checks: SeoCheckResult[]): { score: number; grade: string } {
    // Weight by status
    const weights: Record<SeoStatus, number> = {
      pass: 100,
      warn: 50,
      fail: 0,
      info: 100, // Info doesn't affect score negatively
    };

    // Only count non-info checks for scoring
    const scoringChecks = checks.filter(c => c.status !== 'info');
    if (scoringChecks.length === 0) return { score: 100, grade: 'A' };

    const totalWeight = scoringChecks.reduce((sum, check) => sum + weights[check.status], 0);
    const score = Math.round(totalWeight / scoringChecks.length);

    // Determine grade
    let grade: string;
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 60) grade = 'D';
    else grade = 'F';

    return { score, grade };
  }
}

/**
 * Analyze HTML for SEO issues
 *
 * @example
 * ```typescript
 * import { analyzeSeo } from 'recker/seo';
 *
 * const report = await analyzeSeo(html, { baseUrl: 'https://example.com' });
 * console.log(`Score: ${report.score}/100 (${report.grade})`);
 *
 * for (const check of report.checks) {
 *   console.log(`${check.status}: ${check.name} - ${check.message}`);
 * }
 * ```
 */
export async function analyzeSeo(html: string, options: SeoAnalyzerOptions = {}): Promise<SeoReport> {
  const analyzer = await SeoAnalyzer.fromHtml(html, options);
  return analyzer.analyze();
}

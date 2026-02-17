/**
 * SEO Analyzer
 *
 * Comprehensive SEO analysis for web pages using a rules-based engine.
 * Supports 330+ SEO rules across 25+ categories.
 */

import { HTMLElement, parse } from '../scrape/parser/index.js';
import type {
  SeoReport,
  SeoCheckResult,
  SeoSummary,
  HeadingAnalysis,
  ContentMetrics,
  LinkAnalysis,
  ImageAnalysis,
  SocialMetaAnalysis,
  TechnicalSeo,
  SeoPageType,
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
import { generateKeywordCloud } from './keywords.js';
import {
  SeoRulesEngine,
  createRulesEngine,
  SEO_THRESHOLDS,
  calculateWeightedScore,
  type RuleContext,
  type RuleResult,
  type RulesEngineOptions,
} from './rules/index.js';
import type { KeywordCloud } from './keywords.js';

/**
 * Extended options for the analyzer
 */
export interface SeoAnalyzerFullOptions extends SeoAnalyzerOptions {
  /** Rules engine configuration */
  rules?: RulesEngineOptions;
}

/**
 * SEO Analyzer class
 */
export class SeoAnalyzer {
  private root: HTMLElement;
  private options: SeoAnalyzerFullOptions;
  private rulesEngine: SeoRulesEngine;

  constructor(root: HTMLElement, options: SeoAnalyzerFullOptions = {}) {
    this.root = root;
    this.options = options;
    this.rulesEngine = createRulesEngine(options.rules);
  }

  /**
   * Create analyzer from HTML string
   */
  static async fromHtml(
    html: string,
    options: SeoAnalyzerFullOptions = {}
  ): Promise<SeoAnalyzer> {
    const root = parse(html);
    return new SeoAnalyzer(root, options);
  }

  /**
   * Run full SEO analysis
   */
  analyze(): SeoReport {
    const url = this.options.baseUrl || '';

    // Extract all data using scrape extractors
    const meta = extractMeta(this.root);
    const og = extractOpenGraph(this.root);
    const twitter = extractTwitterCard(this.root);
    const jsonLd = extractJsonLd(this.root);
    const links = extractLinks(this.root, { baseUrl: this.options.baseUrl });
    const images = extractImages(this.root, { baseUrl: this.options.baseUrl });

    // Analyze keywords
    const visibleText = this.getVisibleText();
    const keywords = generateKeywordCloud({
      visibleText,
      title: meta.title,
      description: meta.description,
      keywords: meta.keywords?.join(', ')
    });

    // Content Privacy
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emailsFound = (visibleText.match(emailRegex) || []).filter(e => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.webp')); // basic filter for misidentified images

    // Social Signals
    const socialDomains = ['facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'pinterest.com', 'tiktok.com', 'github.com', 'reddit.com', 'snapchat.com', 'whatsapp.com', 'telegram.org', 'discord.com', 'threads.net'];
    const socialLinksFound = links
        .map(l => l.href)
        .filter(href => socialDomains.some(d => href.toLowerCase().includes(d)));

    // Enhanced social link analysis
    const socialLinkDetails = this.analyzeSocialLinks(links, socialDomains);

    // Analyze structured data
    const headings = this.analyzeHeadings();
    const content = this.analyzeContent(headings);
    const linkAnalysis = this.buildLinkAnalysis(links);
    const imageAnalysis = this.buildImageAnalysis(images);
    const social = this.buildSocialAnalysis(og, twitter);
    const technical = this.buildTechnicalAnalysis(meta);
    const resources = this.analyzeResources();

    // Analytics detection
    const analytics = this.analyzeAnalytics();

    // RSS/Atom feed detection
    const feeds = this.analyzeFeeds();

    // Conversion elements (CTAs, forms, contact)
    const conversion = this.analyzeConversionElements(links, visibleText);
    const pageType = this.detectPageType(jsonLd);

    // Build rule context from all extracted data
    const context = this.buildRuleContext({
      pageType,
      meta,
      og,
      twitter,
      jsonLd,
      headings,
      content,
      linkAnalysis,
      imageAnalysis,
      links,
      keywords,
      resources,
      emailsFound,
      socialLinksFound,
      socialLinkDetails,
      analytics,
      feeds,
      conversion,
    });

    // Run rules engine
    const ruleResults = this.rulesEngine.evaluate(context);

    // Convert rule results to check results
    const checks = this.convertToCheckResults(ruleResults);

    // Calculate score
    const { score, grade } = this.calculateScore(ruleResults);

    // Build summary with big numbers
    const summary = this.buildSummary(ruleResults, checks, {
      content,
      imageAnalysis,
      linkAnalysis,
      meta,
      og,
      twitter,
      technical,
      pageType,
      timings: this.options.timings,
    });

    return {
      url,
      timestamp: new Date(),
      grade,
      score,
      timing: this.options.timings,
      summary,
      pageType,
      checks,
      title: meta.title
        ? { text: meta.title, length: meta.title.length }
        : undefined,
      metaDescription: meta.description
        ? { text: meta.description, length: meta.description.length }
        : undefined,
      openGraph:
        Object.keys(og).length > 0
          ? {
              title: og.title,
              description: og.description,
              image: Array.isArray(og.image) ? og.image[0] : og.image,
              url: og.url,
              type: og.type,
              siteName: og.siteName,
            }
          : undefined,
      twitterCard:
        Object.keys(twitter).length > 0
          ? {
              card: twitter.card,
              title: twitter.title,
              description: twitter.description,
              image: Array.isArray(twitter.image)
                ? twitter.image[0]
                : twitter.image,
              site: twitter.site,
            }
          : undefined,
      structuredData: {
        count: jsonLd.length,
        types: jsonLd.map((j) => j['@type'] as string).filter(Boolean),
        items: jsonLd,
      },
      headings: headings,
      content,
      keywords,
      links: linkAnalysis,
      images: imageAnalysis,
      social,
      technical,
    };
  }

  /**
   * Get the main body element (handling malformed HTML with multiple bodies)
   */
  private getMainBody(): HTMLElement | null {
    const bodies = this.root.querySelectorAll('body');
    if (bodies.length === 0) return null;
    if (bodies.length === 1) return bodies[0];
    
    // Return the body with the most text content
    return bodies.reduce((prev, curr) => 
      curr.text.length > prev.text.length ? curr : prev
    );
  }

  /**
   * Detect the likely page type from URL and DOM hints.
   */
  private detectPageType(jsonLd: ReturnType<typeof extractJsonLd>): SeoPageType {
    if (!this.options.baseUrl) {
      return 'other';
    }

    try {
      const parsed = new URL(this.options.baseUrl);
      const pathname = parsed.pathname.toLowerCase();
      const hasQueryKeyword = (value: string): boolean =>
        parsed.searchParams.has(value);

      if (pathname === '/' || pathname === '') {
        return 'homepage';
      }

      if (
        /(^|\/)(search|busca|s|results|query)\b/.test(pathname) ||
        hasQueryKeyword('q') ||
        hasQueryKeyword('query') ||
        hasQueryKeyword('search')
      ) {
        return 'search';
      }

      const productSignals = ['product', 'produto', 'item', 'sku', 'shop'];
      if (productSignals.some((segment) => pathname.includes(`/${segment}/`))) {
        return 'product';
      }

      const articleSignals = ['article', 'post', 'blog', 'noticia', 'news'];
      if (
        articleSignals.some((segment) => pathname.includes(`/${segment}/`)) ||
        this.root.querySelectorAll('article').length > 0
      ) {
        return 'article';
      }

      if (
        /(^|\/)(categoria|category|tag|section|topic)\b/.test(pathname)
      ) {
        return 'category';
      }

      const hasProductJsonLd = jsonLd
        .map((node) => node['@type'])
        .some((type) => typeof type === 'string' && type.toLowerCase() === 'product');
      if (hasProductJsonLd) {
        return 'product';
      }

      return 'other';
    } catch {
      return 'other';
    }
  }

  /**
   * Extract visible text from body (excluding scripts, styles, etc.)
   */
  private getVisibleText(): string {
    const body = this.getMainBody();
    if (!body) return '';

    // Clone to safely remove elements without affecting the main analysis
    const clone = body.clone() as HTMLElement;

    // Remove non-visible elements (tags that don't contain user-readable content)
    // Keep: footer (visible), iframe (may have content)
    // Remove: script, style, noscript, template (code/styles), header, nav (navigation), svg (graphics)
    const tagsToRemove = ['script', 'style', 'noscript', 'template', 'header', 'nav', 'svg'];

    // We can't use querySelectorAll with comma list reliably in all parser versions,
    // so we select all elements and filter or select by tag.
    // Our parser supports comma selectors now via css-select!
    try {
        const elements = clone.querySelectorAll(tagsToRemove.join(','));
        elements.forEach(el => el.remove());
    } catch {
        // Fallback if selector fails
        tagsToRemove.forEach(tag => {
            clone.querySelectorAll(tag).forEach(el => el.remove());
        });
    }

    // Also remove elements with hidden attribute or aria-hidden="true"
    try {
        clone.querySelectorAll('[hidden], [aria-hidden="true"]').forEach(el => el.remove());
    } catch {
        // Fallback: try each selector separately
        clone.querySelectorAll('[hidden]').forEach(el => el.remove());
        clone.querySelectorAll('[aria-hidden="true"]').forEach(el => el.remove());
    }

    return clone.text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Build rule context from extracted data
   */
  private buildRuleContext(data: {
    meta: ReturnType<typeof extractMeta>;
    og: ReturnType<typeof extractOpenGraph>;
    twitter: ReturnType<typeof extractTwitterCard>;
    jsonLd: ReturnType<typeof extractJsonLd>;
    headings: HeadingAnalysis & { sectionWordCounts: number[] };
    content: ContentMetrics & {
      paragraphWordCounts: number[];
      avgSentenceLength: number;
      faqCount: number;
      imagePerWordRatio: number;
      keywordDensity?: number;
    };
    pageType: SeoPageType;
    linkAnalysis: LinkAnalysis;
    imageAnalysis: ImageAnalysis;
    links: ReturnType<typeof extractLinks>;
    keywords: KeywordCloud;
    resources: ReturnType<SeoAnalyzer['analyzeResources']>;
    emailsFound: string[];
    socialLinksFound: string[];
    socialLinkDetails: ReturnType<SeoAnalyzer['analyzeSocialLinks']>;
    analytics: ReturnType<SeoAnalyzer['analyzeAnalytics']>;
    feeds: ReturnType<SeoAnalyzer['analyzeFeeds']>;
    conversion: ReturnType<SeoAnalyzer['analyzeConversionElements']>;
  }): RuleContext {
    const {
      meta,
      og,
      twitter,
      jsonLd,
      headings,
      content,
      pageType,
      linkAnalysis,
      imageAnalysis,
      links,
      keywords,
      resources,
      emailsFound,
      socialLinksFound,
      socialLinkDetails,
      analytics,
      feeds,
      conversion,
    } = data;
    const html = this.root.querySelector('html');
    const htmlLang = html ? html.getAttribute('lang') : undefined;

    // Extract hreflang tags for i18n
    const hreflangTags: Array<{ lang: string; href: string }> = [];
    this.root
      .querySelectorAll('link[rel="alternate"][hreflang]')
      .forEach((el) => {
        const lang = el.getAttribute('hreflang');
        const href = el.getAttribute('href');
        if (lang && href) {
          hreflangTags.push({ lang, href });
        }
      });

    // Extract og:locale for i18n consistency check
    const ogLocaleEl = this.root.querySelector('meta[property="og:locale"]');
    const ogLocale = ogLocaleEl ? ogLocaleEl.getAttribute('content') : undefined;

    // Find problematic links (store actual links, not just counts)
    const genericTexts = SEO_THRESHOLDS.links.genericTexts;
    const genericTextLinks = links.filter((l) => {
      const text = l.text?.toLowerCase().trim();
      return text && genericTexts.some((g) => text === g || text.includes(g));
    });
    const linksWithGenericText = genericTextLinks.length;

    // Links without text (or discernible content/label)
    const linksWithoutTextArray = links.filter((l) => {
      const hasText = l.text && l.text.trim() !== '';
      const hasContent = l.hasImageWithAlt || l.hasSvgWithTitle;
      const hasA11yLabel = l.ariaLabel || l.title; // Aria-label or title provides context

      // Link is problematic only if it has NO text AND NO accessible content AND NO label
      return !hasText && !hasContent && !hasA11yLabel;
    });

    // External links with target="_blank" missing security attributes
    const externalBlankLinks = links.filter(
      (l) => l.type === 'external' && l.target === '_blank'
    );
    const missingNoopenerLinks = externalBlankLinks.filter(
      (l) => !l.rel?.includes('noopener')
    );
    const missingNoreferrerLinks = externalBlankLinks.filter(
      (l) => !l.rel?.includes('noreferrer')
    );

    // Store problematic links for detailed reporting
    const problematicLinks = {
      withoutText: linksWithoutTextArray,
      genericText: genericTextLinks,
      missingNoopener: missingNoopenerLinks,
      missingNoreferrer: missingNoreferrerLinks,
    };

    // Check for mixed content (HTTP resources on page)
    const hasMixedContent = this.checkMixedContent();

    // Get H1 text
    const h1Elements = this.root.querySelectorAll('h1');
    const h1Text = 
      h1Elements.length > 0 ? h1Elements[0].text.trim() : '';

    // Keyword Analysis
    const topKeywords = keywords.topKeywords.slice(0, 5).map(k => k.word);
    const mainKeyword = topKeywords.length > 0 ? topKeywords[0] : undefined;
    const keywordsInTitle = topKeywords.some(kw => meta.title?.toLowerCase().includes(kw));
    const keywordsInDescription = topKeywords.some(kw => meta.description?.toLowerCase().includes(kw));
    const keywordsInH1 = topKeywords.some(kw => h1Text.toLowerCase().includes(kw));

    // URL keyword check
    const urlPath = this.options.baseUrl ? new URL(this.options.baseUrl).pathname.toLowerCase().replace(/[-_]/g, ' ') : '';
    const keywordsInUrl = topKeywords.some(kw => urlPath.includes(kw));

    // First paragraph keyword check
    const firstParagraph = this.root.querySelector('p')?.text?.toLowerCase() || '';
    const keywordsInFirstParagraph = topKeywords.some(kw => firstParagraph.includes(kw));

    // Alt text keyword check (check if any image alt contains keywords)
    const imageAlts = imageAnalysis.imageAltTexts || [];
    const keywordsInAltText = imageAlts.some(alt => topKeywords.some(kw => alt.includes(kw)));

    // Keyword consistency score (how many key places have the main keyword)
    const keywordConsistencyDetails = mainKeyword ? {
      inTitle: meta.title?.toLowerCase().includes(mainKeyword) || false,
      inDescription: meta.description?.toLowerCase().includes(mainKeyword) || false,
      inH1: h1Text.toLowerCase().includes(mainKeyword) || false,
      inUrl: urlPath.includes(mainKeyword),
      inFirstParagraph: firstParagraph.includes(mainKeyword),
      inAltText: imageAlts.some(alt => alt.includes(mainKeyword)),
    } : undefined;

    const keywordConsistencyScore = keywordConsistencyDetails
      ? Object.values(keywordConsistencyDetails).filter(Boolean).length
      : undefined;

    // Get viewport content
    const viewportEl = this.root.querySelector('meta[name="viewport"]');
    const viewportContent = viewportEl
      ? viewportEl.getAttribute('content')
      : undefined;

    // Accessibility metrics
    const a11yMetrics = this.analyzeAccessibility();

    // Image empty alt count
    const imagesWithEmptyAlt = this.root.querySelectorAll('img[alt=""]').length;

    // Link security metrics
    const linkSecurityMetrics = this.analyzeLinkSecurity();

    // Favicon detection
    const faviconInfo = this.detectFavicon();

    // Performance hints
    const perfHints = this.analyzePerformanceHints();

    // Core Web Vitals hints
    const cwvHints = this.analyzeCWVHints();

    // New metrics
            const structuralHtml = this.analyzeStructuralHtml();
            const breadcrumbs = this.analyzeBreadcrumbs(jsonLd.map((j) => j['@type'] as string).filter(Boolean));
            const multimedia = this.analyzeMultimedia();
            const responsiveImages = this.analyzeResponsiveImages();
            const inlineImages = this.analyzeInlineImages();
            const trustSignals = this.analyzeTrustSignals(links);
    // Calculate subheading frequency (H2/H3 count per 100 words)
    const totalSubheadings =
      (headings.structure.filter((h) => h.level === 2).length || 0) +
      (headings.structure.filter((h) => h.level === 3).length || 0);
    const subheadingFrequency =
      content.wordCount > 0
        ? (totalSubheadings / content.wordCount) * 100
        : 0;

    // Calculate Text/HTML Ratio
    const textHtmlRatio = this.calculateTextHtmlRatio(content.characterCount);

    return {
      pageType,

      // Resources
      jsFilesCount: resources.jsFilesCount,
      cssFilesCount: resources.cssFilesCount,
      unminifiedResources: resources.unminifiedResources,
      unminifiedResourceUrls: resources.unminifiedResourceUrls,

      // Content Privacy
      emailsFound,
      
      // Social Signals
      socialLinksFound,
      ...socialLinkDetails,

      // Keywords
      keywordsInTitle,
      keywordsInDescription,
      keywordsInH1,
      keywordsInUrl,
      keywordsInFirstParagraph,
      keywordsInAltText,
      keywordConsistencyScore,
      keywordConsistencyDetails,
      topKeywords,
      mainKeyword,

      // Title
      title: meta.title,
      titleLength: meta.title?.length,

      // Meta
      metaDescription: meta.description,
      metaDescriptionLength: meta.description?.length,
      metaKeywords: meta.keywords,
      metaRobots: meta.robots,

      // OpenGraph
      ogTitle: og.title,
      ogDescription: og.description,
      ogImage: Array.isArray(og.image) ? og.image[0] : og.image,
      ogUrl: og.url,
      ogType: og.type,
      ogSiteName: og.siteName,

      // Twitter
      twitterCard: twitter.card,
      twitterTitle: twitter.title,
      twitterDescription: twitter.description,
      twitterImage: Array.isArray(twitter.image)
        ? twitter.image[0]
        : twitter.image,
      twitterSite: twitter.site,

      // Headings
      h1Count: headings.h1Count,
      h1Text: h1Text || undefined,
      h1Length: h1Text?.length,
      h2Count: headings.structure.filter((h) => h.level === 2).length,
      headingHierarchyValid: headings.hasProperHierarchy,
      headingSkippedLevels: headings.issues.filter((i) =>
        i.includes('Skipped')
      ),
      sectionWordCounts: headings.sectionWordCounts,

      // Images
      totalImages: imageAnalysis.total,
      imagesWithAlt: imageAnalysis.withAlt,
      imagesWithoutAlt: imageAnalysis.withoutAlt,
      imagesWithLazyLoad: imageAnalysis.lazy,
      imagesMissingDimensions: imageAnalysis.missingDimensions,
      imagesWithEmptyAlt,
      imagesUsingModernFormats: imageAnalysis.modernFormats,
      altTextLengths: imageAnalysis.altTextLengths,
      imageAltTexts: imageAnalysis.imageAltTexts,
      imageFilenames: imageAnalysis.imageFilenames,
      imagesWithAsyncDecoding: imageAnalysis.imagesWithAsyncDecoding,
      imagesWithSrcset: responsiveImages.imagesWithSrcset,
      largeBase64ImagesCount: inlineImages.largeBase64ImagesCount,

      // Accessibility
      ...a11yMetrics,

      // Links
      allLinks: links,
      totalLinks: linkAnalysis.total,
      internalLinks: linkAnalysis.internal,
      externalLinks: linkAnalysis.external,
      internalHttpLinks: linkAnalysis.internalHttpLinks,
      internalHttpLinkUrls: linkAnalysis.internalHttpLinkUrls,
      linksWithoutText: linkAnalysis.withoutText,
      nofollowLinks: linkAnalysis.nofollow,
      sponsoredLinks: linkAnalysis.sponsoredLinks,
      ugcLinks: linkAnalysis.ugcLinks,
      linksWithGenericText,
      ...linkSecurityMetrics,
      problematicLinks,

      // Content
      wordCount: content.wordCount,
      characterCount: content.characterCount,
      sentenceCount: content.sentenceCount,
      paragraphCount: content.paragraphCount,
      avgWordsPerSentence: content.avgWordsPerSentence,
      avgParagraphLength: content.avgParagraphLength,
      listCount: content.listCount,
      strongTagCount: content.strongTagCount,
      emTagCount: content.emTagCount,
      subheadingFrequency,
      paragraphWordCounts: content.paragraphWordCounts,
      avgSentenceLength: content.avgSentenceLength,
      faqCount: content.faqCount,
      imagePerWordRatio: content.imagePerWordRatio,
      keywordDensity: content.keywordDensity,
      fleschReadingEase: content.fleschReadingEase,
      hasQuestionHeadings: content.hasQuestionHeadings,

      // Structural HTML5
      ...structuralHtml,

      // Trust Signals
      ...trustSignals,

      // Breadcrumbs
      ...breadcrumbs,

      // Multimedia
      ...multimedia,

      // Technical
      hasCanonical: !!meta.canonical,
      canonicalUrl: meta.canonical,
      hasViewport: !!meta.viewport,
      viewportContent,
      hasCharset: !!meta.charset,
      charset: meta.charset,
      hasLang: !!htmlLang,
      langValue: htmlLang,
      isHttps: this.options.baseUrl?.startsWith('https://'),
      hasMixedContent,
      responseHeaders: this.options.responseHeaders,
      textHtmlRatio,
      hasFrameTags: this.root.querySelectorAll('frame, frameset').length > 0,
      iframeCount: this.root.querySelectorAll('iframe').length,
      hasDeprecatedPlugins: this.root.querySelectorAll('object, embed, applet').length > 0,
      deprecatedTagsCount: this.root.querySelectorAll('center, font, strike, u, marquee, blink, big, tt').length,
      deprecatedTagsFound: ['center', 'font', 'strike', 'u', 'marquee', 'blink', 'big', 'tt'].filter(t => this.root.querySelectorAll(t).length > 0),
      hasAppleTouchIcon: this.root.querySelectorAll('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]').length > 0,

      // Favicon
      ...faviconInfo,

      // Performance hints
      ...perfHints,

      // Core Web Vitals hints
      lcpHints: cwvHints.lcpHints,
      clsHints: cwvHints.clsHints,

      // Structured Data
      jsonLdCount: jsonLd.length,
      jsonLdTypes: jsonLd.map((j) => j['@type'] as string).filter(Boolean),

      // URL
      url: this.options.baseUrl,
      urlLength: this.options.baseUrl?.length,

      // SEO Quality - Title vs H1
      titleMatchesH1:
        meta.title && h1Text
          ? meta.title.toLowerCase().trim() === h1Text.toLowerCase().trim()
          : undefined,

      // URL Quality
      ...this.analyzeUrlQuality(),

      // JS Rendering hints
      ...this.analyzeJsRendering(content),

      // Internationalization (i18n)
      hreflangTags: hreflangTags.length > 0 ? hreflangTags : undefined,
      ogLocale,

      // Analytics Context
      analyticsDetected: analytics.analyticsDetected,
      analyticsProviders: analytics.analyticsProviders,

      // RSS/Atom Feed Context
      ...feeds,

      // Conversion Context
      ctaButtonsCount: conversion.ctaButtonsCount,
      formCount: conversion.formCount,
      hasWhatsAppLink: conversion.hasWhatsAppLink,
      hasPhoneOnPage: conversion.hasPhoneOnPage,

      // Timing metrics (passed from HTTP request/spider)
      timings: this.options.timings,
      htmlSize: this.options.htmlSize,
    };
  }
  /**
   * Analyze URL quality (uppercase, accents, special chars)
   */
  private analyzeUrlQuality(): {
    urlHasUppercase: boolean;
    urlHasSpecialChars: boolean;
    urlHasAccents: boolean;
  } {
    if (!this.options.baseUrl) {
      return {
        urlHasUppercase: false,
        urlHasSpecialChars: false,
        urlHasAccents: false,
      };
    }

    try {
      const url = new URL(this.options.baseUrl);
      const path = url.pathname + url.search;

      // Check for uppercase letters in path (not domain)
      const urlHasUppercase = /[A-Z]/.test(path);

      // Check for accented characters
      const urlHasAccents = /[àáâãäåæçèéêëìíîïñòóôõöùúûüýÿ]/i.test(path);

      // Check for problematic special characters (excluding standard URL chars)
      const urlHasSpecialChars =
        /[<>{}|\^`\[\]]/.test(path) || /%[0-9A-F]{2}/i.test(path);

      return { urlHasUppercase, urlHasSpecialChars, urlHasAccents };
    } catch {
      return {
        urlHasUppercase: false,
        urlHasSpecialChars: false,
        urlHasAccents: false,
      };
    }
  }

  /**
   * Analyze JS rendering hints
   */
  private analyzeJsRendering(content: ContentMetrics): {
    bodyTextLength: number;
    scriptCount: number;
    hasNoscriptContent: boolean;
  } {
    // Get body text length (character count)
    const bodyTextLength = content.characterCount;

    // Count scripts
    const scriptCount = this.root.querySelectorAll('script').length;
    const noscriptEl = this.root.querySelector('noscript');
    const noscriptContent = noscriptEl ? noscriptEl.text.trim() : '';
    const hasNoscriptContent = noscriptContent.length > 0;

    return { bodyTextLength, scriptCount, hasNoscriptContent };
  }

  /**
   * Analyze responsive image implementation
   */
  private analyzeResponsiveImages(): { imagesWithSrcset: number } {
    let imagesWithSrcset = 0;
    this.root.querySelectorAll('img').forEach((img: any) => {
      if (img.getAttribute('srcset') || (img.parentNode && img.parentNode.tagName === 'PICTURE')) {
        imagesWithSrcset++;
      }
    });
    return { imagesWithSrcset };
  }

  /**
   * Analyze inline base64 image bloat
   */
  private analyzeInlineImages(): { largeBase64ImagesCount: number } {
    let largeBase64ImagesCount = 0;
    this.root.querySelectorAll('img').forEach((img: any) => {
      const src = img.getAttribute('src') || '';
      if (src.startsWith('data:image') && src.length > 5 * 1024) { // > 5KB
        largeBase64ImagesCount++;
      }
    });
    return { largeBase64ImagesCount };
  }

  /**
   * Check for mixed content (HTTP resources on HTTPS page)
   */
  private checkMixedContent(): boolean {
    let hasMixed = false;

    // Check images
    this.root.querySelectorAll('img[src^="http://"]').forEach(() => {
      hasMixed = true;
    });

    // Check scripts
    this.root.querySelectorAll('script[src^="http://"]').forEach(() => {
      hasMixed = true;
    });

    // Check stylesheets
    this.root.querySelectorAll('link[href^="http://"]').forEach(() => {
      hasMixed = true;
    });

    return hasMixed;
  }

  /**
   * Analyze external link security (noopener/noreferrer)
   */
  private analyzeLinkSecurity(): {
    externalLinksWithoutNoopener: number;
    externalLinksWithoutNoreferrer: number;
  } {
    let withoutNoopener = 0;
    let withoutNoreferrer = 0;

    // Find external links with target="_blank"
    this.root
      .querySelectorAll('a[href^="http"][target="_blank"]')
      .forEach((el) => {
        const href = el.getAttribute('href') || '';
        const rel = (el.getAttribute('rel') || '').toLowerCase();

        // Skip internal links
        if (this.options.baseUrl && href.startsWith(this.options.baseUrl)) {
          return;
        }

        // Check for noopener
        if (!rel.includes('noopener')) {
          withoutNoopener++;
        }

        // Check for noreferrer
        if (!rel.includes('noreferrer')) {
          withoutNoreferrer++;
        }
      });

    return {
      externalLinksWithoutNoopener: withoutNoopener,
      externalLinksWithoutNoreferrer: withoutNoreferrer,
    };
  }

  /**
   * Detect favicon
   */
  private detectFavicon(): {
    hasFavicon: boolean;
    faviconUrl?: string;
  } {
    // Check various favicon link types
    const faviconSelectors = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
      'link[rel="apple-touch-icon-precomposed"]',
    ];

    for (const selector of faviconSelectors) {
      const favicon = this.root.querySelector(selector);
      if (favicon) {
        return {
          hasFavicon: true,
          faviconUrl: favicon.getAttribute('href'),
        };
      }
    }

    return { hasFavicon: false };
  }

  /**
   * Analyze performance hints in the document
   */
  private analyzePerformanceHints(): {
    hasPreconnect: boolean;
    preconnectCount: number;
    hasDnsPrefetch: boolean;
    dnsPrefetchCount: number;
    hasPreload: boolean;
    preloadCount: number;
    renderBlockingResources: number;
    inlineScriptsCount: number;
    inlineStylesCount: number;
  } {
    // Preconnect
    const preconnectLinks = this.root.querySelectorAll('link[rel="preconnect"]');
    const preconnectCount = preconnectLinks.length;

    // DNS Prefetch
    const dnsPrefetchLinks = this.root.querySelectorAll(
      'link[rel="dns-prefetch"]'
    );
    const dnsPrefetchCount = dnsPrefetchLinks.length;

    // Preload
    const preloadLinks = this.root.querySelectorAll('link[rel="preload"]');
    const preloadCount = preloadLinks.length;

    // Render-blocking resources (scripts and stylesheets in head without async/defer)
    let renderBlockingResources = 0;

    // Scripts without async or defer in head
    // Selector 'head script[src]:not([async]):not([defer])'
    // This is complex for basic selectors? css-select supports :not
    this.root
      .querySelectorAll('head script[src]:not([async]):not([defer])')
      .forEach(() => {
        renderBlockingResources++;
      });

    // Stylesheets without preload/prefetch media query
    this.root.querySelectorAll('head link[rel="stylesheet"]').forEach((el) => {
      const media = el.getAttribute('media');
      // Non-critical stylesheets should use media="print" or similar
      if (!media || media === 'all' || media === 'screen') {
        renderBlockingResources++;
      }
    });

    // Inline scripts count
    const inlineScriptsCount = this.root
      .querySelectorAll('script:not([src])')
      .filter((el) => {
        const content = el.innerHTML || '';
        return content.trim().length > 0;
      }).length;

    // Inline styles count
    const inlineStylesCount = this.root.querySelectorAll('style').length;

    return {
      hasPreconnect: preconnectCount > 0,
      preconnectCount,
      hasDnsPrefetch: dnsPrefetchCount > 0,
      dnsPrefetchCount,
      hasPreload: preloadCount > 0,
      preloadCount,
      renderBlockingResources,
      inlineScriptsCount,
      inlineStylesCount,
    };
  }

  /**
   * Analyze Core Web Vitals hints
   */
  private analyzeCWVHints(): {
    lcpHints: {
      hasLargeImages: boolean;
      hasLazyLcp: boolean;
      hasPriorityHints: boolean;
    };
    clsHints: {
      imagesWithoutDimensions: number;
    };
  } {
    // LCP hints - check first few images
    const images = this.root.querySelectorAll('img');
    let hasLargeImages = false;
    let hasLazyLcp = false;
    let hasPriorityHints = false;

    // Check first 3 images (likely above the fold)
    images.slice(0, 3).forEach((el, index) => {
      const width = parseInt(el.getAttribute('width') || '0', 10);
      const height = parseInt(el.getAttribute('height') || '0', 10);
      const loading = el.getAttribute('loading');
      const fetchPriority = el.getAttribute('fetchpriority');

      // Check if image is large (potential LCP)
      if (width >= 400 || height >= 300) {
        hasLargeImages = true;
      }

      // First image should not be lazy loaded
      if (index === 0 && loading === 'lazy') {
        hasLazyLcp = true;
      }

      // Check for priority hints
      if (fetchPriority === 'high') {
        hasPriorityHints = true;
      }
    });

    // Also check for large background images in inline styles
    this.root
      .querySelectorAll('[style*="background-image"]')
      .slice(0, 3)
      .forEach(() => {
        hasLargeImages = true;
      });

    // CLS hints - images without dimensions
    // 'img:not([width]):not([height])'
    const imagesWithoutDimensions =
      this.root.querySelectorAll('img:not([width]):not([height])').length +
      this.root.querySelectorAll('img[width="auto"], img[height="auto"]')
        .length;

    return {
      lcpHints: {
        hasLargeImages,
        hasLazyLcp,
        hasPriorityHints,
      },
      clsHints: {
        imagesWithoutDimensions,
      },
    };
  }

  /**
   * Analyze accessibility metrics
   */
  private analyzeAccessibility(): {
    buttonsWithoutAriaLabel: number;
    linksWithoutAriaLabel: number;
    inputsWithoutLabel: number;
    iframesWithoutTitle: number;
    tablesWithoutCaption: number;
    svgsWithoutTitle: number;
  } {
    // Buttons without text or aria-label
    let buttonsWithoutAriaLabel = 0;
    this.root.querySelectorAll('button').forEach((el) => {
      const text = el.text.trim();
      const ariaLabel = el.getAttribute('aria-label');
      const ariaLabelledBy = el.getAttribute('aria-labelledby');
      const title = el.getAttribute('title');
      if (!text && !ariaLabel && !ariaLabelledBy && !title) {
        buttonsWithoutAriaLabel++;
      }
    });

    // Links without text or aria-label (icon-only links)
    let linksWithoutAriaLabel = 0;
    this.root.querySelectorAll('a[href]').forEach((el) => {
      const text = el.text.trim();
      const ariaLabel = el.getAttribute('aria-label');
      const ariaLabelledBy = el.getAttribute('aria-labelledby');
      const title = el.getAttribute('title');

      // Check images inside link
      const imgs = el.querySelectorAll('img');
      const hasImgWithAlt =
        imgs.filter((img) => !!img.getAttribute('alt')?.trim()).length > 0;

      // Check SVGs inside link
      const svgs = el.querySelectorAll('svg');
      const hasSvgWithTitle =
        svgs.filter(
          (svg) =>
            svg.querySelectorAll('title').length > 0 ||
            !!svg.getAttribute('aria-label')
        ).length > 0;

      const hasContent = text || hasImgWithAlt || hasSvgWithTitle;
      const hasLabel = ariaLabel || ariaLabelledBy || title;

      if (!hasContent && !hasLabel) {
        linksWithoutAriaLabel++;
      }
    });

    // Form inputs without labels
    let inputsWithoutLabel = 0;
    this.root
      .querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea'
      )
      .forEach((el) => {
        const id = el.getAttribute('id');
        const ariaLabel = el.getAttribute('aria-label');
        const ariaLabelledBy = el.getAttribute('aria-labelledby');
        const placeholder = el.getAttribute('placeholder');
        const title = el.getAttribute('title');

        // Check if there's an associated label
        const hasLabel = id
          ? this.root.querySelectorAll(`label[for="${id}"]`).length > 0
          : false;
        // Check if wrapped in label
        const wrappedInLabel = el.closest('label') !== null;

        if (
          !hasLabel &&
          !wrappedInLabel &&
          !ariaLabel &&
          !ariaLabelledBy &&
          !title &&
          !placeholder
        ) {
          inputsWithoutLabel++;
        }
      });

    // Iframes without title
    const iframesWithoutTitle = this.root.querySelectorAll(
      'iframe:not([title])'
    ).length;

    // Tables without caption or aria-label (only data tables, skip layout tables)
    let tablesWithoutCaption = 0;
    this.root.querySelectorAll('table').forEach((el) => {
      const hasCaption = el.querySelectorAll('caption').length > 0;
      const ariaLabel = el.getAttribute('aria-label');
      const ariaLabelledBy = el.getAttribute('aria-labelledby');
      const role = el.getAttribute('role');

      // Skip presentation/layout tables
      if (role === 'presentation' || role === 'none') return;

      // Check if it looks like a data table (has th elements)
      const hasHeaders = el.querySelectorAll('th').length > 0;
      if (hasHeaders && !hasCaption && !ariaLabel && !ariaLabelledBy) {
        tablesWithoutCaption++;
      }
    });

    // SVGs without accessible title
    let svgsWithoutTitle = 0;
    this.root.querySelectorAll('svg').forEach((el) => {
      const hasTitle = el.querySelectorAll('title').length > 0;
      const ariaLabel = el.getAttribute('aria-label');
      const ariaLabelledBy = el.getAttribute('aria-labelledby');
      const ariaHidden = el.getAttribute('aria-hidden');
      const role = el.getAttribute('role');

      // Skip decorative SVGs (aria-hidden or role=presentation)
      if (ariaHidden === 'true' || role === 'presentation' || role === 'none')
        return;

      if (!hasTitle && !ariaLabel && !ariaLabelledBy) {
        svgsWithoutTitle++;
      }
    });

    return {
      buttonsWithoutAriaLabel,
      linksWithoutAriaLabel,
      inputsWithoutLabel,
      iframesWithoutTitle,
      tablesWithoutCaption,
      svgsWithoutTitle,
    };
  }

  /**
   * Analyze structural HTML5 elements
   */
  private analyzeStructuralHtml(): {
    hasHeader: boolean;
    hasNav: boolean;
    hasMain: boolean;
    hasArticle: boolean;
    hasSection: boolean;
    hasFooter: boolean;
  } {
    return {
      hasHeader: this.root.querySelectorAll('header').length > 0,
      hasNav: this.root.querySelectorAll('nav').length > 0,
      hasMain: this.root.querySelectorAll('main').length > 0,
      hasArticle: this.root.querySelectorAll('article').length > 0,
      hasSection: this.root.querySelectorAll('section').length > 0,
      hasFooter: this.root.querySelectorAll('footer').length > 0,
    };
  }

  /**
   * Analyze breadcrumbs
   */
  private analyzeBreadcrumbs(jsonLdTypes: string[]): {
    hasBreadcrumbsHtml: boolean;
    hasBreadcrumbsSchema: boolean;
  } {
    const hasBreadcrumbsHtml =
      this.root.querySelectorAll(
        'nav[aria-label="breadcrumb"], .breadcrumb, .breadcrumbs'
      ).length > 0;
    const hasBreadcrumbsSchema = jsonLdTypes.includes('BreadcrumbList');
    return { hasBreadcrumbsHtml, hasBreadcrumbsSchema };
  }

  /**
   * Analyze multimedia elements
   */
  private analyzeMultimedia(): {
    videoCount: number;
    audioCount: number;
    hasAutoplay: boolean;
  } {
    const videos = this.root.querySelectorAll('video');
    const audios = this.root.querySelectorAll('audio');
    
    let hasAutoplay = false;
    
    // Manual check for autoplay attribute
    const checkAutoplay = (list: any[]) => {
        list.forEach(el => {
            if (el.getAttribute('autoplay') !== undefined || el.hasAttribute('autoplay')) {
                hasAutoplay = true;
            }
        });
    };
    
    checkAutoplay(videos);
    checkAutoplay(audios);

    return {
      videoCount: videos.length,
      audioCount: audios.length,
      hasAutoplay
    };
  }

  /**
   * Analyze social media links in detail
   */
  private analyzeSocialLinks(
    links: ReturnType<typeof extractLinks>,
    socialDomains: string[]
  ): {
    totalSocialLinks: number;
    socialLinksInHeader: number;
    socialLinksInFooter: number;
    socialLinksWithoutAccessibility: number;
    socialLinksWithoutNewTab: number;
    socialLinksWithoutNoopener: number;
    platformsFound: string[];
    socialLinkDetails: Array<{
      href: string;
      platform: string;
      hasAccessibility: boolean;
      hasNewTab: boolean;
      hasNoopener: boolean;
      location: 'header' | 'footer' | 'body';
    }>;
  } {
    const socialLinks = links.filter(l =>
      socialDomains.some(d => l.href.toLowerCase().includes(d))
    );

    const platformMap: Record<string, string> = {
      'facebook.com': 'facebook',
      'twitter.com': 'twitter',
      'x.com': 'twitter',
      'instagram.com': 'instagram',
      'linkedin.com': 'linkedin',
      'youtube.com': 'youtube',
      'pinterest.com': 'pinterest',
      'tiktok.com': 'tiktok',
      'github.com': 'github',
      'reddit.com': 'reddit',
      'snapchat.com': 'snapchat',
      'whatsapp.com': 'whatsapp',
      'telegram.org': 'telegram',
      'discord.com': 'discord',
      'threads.net': 'threads',
    };

    // Analyze each social link
    const socialLinkDetails: Array<{
      href: string;
      platform: string;
      hasAccessibility: boolean;
      hasNewTab: boolean;
      hasNoopener: boolean;
      location: 'header' | 'footer' | 'body';
    }> = [];

    let socialLinksInHeader = 0;
    let socialLinksInFooter = 0;
    let socialLinksWithoutAccessibility = 0;
    let socialLinksWithoutNewTab = 0;
    let socialLinksWithoutNoopener = 0;
    const platformsFound = new Set<string>();

    // Check header and footer for social links
    const headerLinks = this.root.querySelectorAll('header a[href]');
    const footerLinks = this.root.querySelectorAll('footer a[href]');
    const headerHrefs = new Set(headerLinks.map(l => l.getAttribute('href') || ''));
    const footerHrefs = new Set(footerLinks.map(l => l.getAttribute('href') || ''));

    for (const link of socialLinks) {
      // Determine platform
      let platform = 'unknown';
      for (const [domain, name] of Object.entries(platformMap)) {
        if (link.href.toLowerCase().includes(domain)) {
          platform = name;
          platformsFound.add(name);
          break;
        }
      }

      // Check location
      let location: 'header' | 'footer' | 'body' = 'body';
      if (headerHrefs.has(link.href)) {
        location = 'header';
        socialLinksInHeader++;
      } else if (footerHrefs.has(link.href)) {
        location = 'footer';
        socialLinksInFooter++;
      }

      // Check accessibility (aria-label, title, or text content)
      const hasAccessibility = !!(link.ariaLabel || link.title || (link.text && link.text.trim()));
      if (!hasAccessibility) {
        socialLinksWithoutAccessibility++;
      }

      // Check if opens in new tab
      const hasNewTab = link.target === '_blank';
      if (!hasNewTab) {
        socialLinksWithoutNewTab++;
      }

      // Check for noopener
      const hasNoopener = !!(link.rel && link.rel.includes('noopener'));
      if (hasNewTab && !hasNoopener) {
        socialLinksWithoutNoopener++;
      }

      socialLinkDetails.push({
        href: link.href,
        platform,
        hasAccessibility,
        hasNewTab,
        hasNoopener,
        location,
      });
    }

    return {
      totalSocialLinks: socialLinks.length,
      socialLinksInHeader,
      socialLinksInFooter,
      socialLinksWithoutAccessibility,
      socialLinksWithoutNewTab,
      socialLinksWithoutNoopener,
      platformsFound: Array.from(platformsFound),
      socialLinkDetails,
    };
  }

  /**
   * Analyze trust signals by checking for common links.
   */
  private analyzeTrustSignals(links: ReturnType<typeof extractLinks>): {
    hasAboutPageLink: boolean;
    hasContactPageLink: boolean;
    hasPrivacyPolicyLink: boolean;
    hasTermsOfServiceLink: boolean;
  } {
    const linkHrefs = links.map((l) => l.href.toLowerCase());
    return {
      hasAboutPageLink: linkHrefs.some(
        (href) => href.includes('about') || href.includes('quem-somos')
      ),
      hasContactPageLink: linkHrefs.some(
        (href) => href.includes('contact') || href.includes('contato')
      ),
      hasPrivacyPolicyLink: linkHrefs.some(
        (href) => href.includes('privacy') || href.includes('privacidade')
      ),
      hasTermsOfServiceLink: linkHrefs.some(
        (href) => href.includes('terms') || href.includes('termos-de-uso')
      ),
    };
  }

  /**
   * Analyze analytics scripts on the page
   */
  private analyzeAnalytics(): {
    analyticsDetected: boolean;
    analyticsProviders: string[];
  } {
    const providers: string[] = [];
    const scripts = this.root.querySelectorAll('script');

    // Collect all script content and src attributes
    const scriptSources: string[] = [];
    const scriptContents: string[] = [];

    scripts.forEach((s) => {
      const src = s.getAttribute('src') || '';
      const content = s.innerHTML || '';
      if (src) scriptSources.push(src.toLowerCase());
      if (content) scriptContents.push(content.toLowerCase());
    });

    const allScriptText = scriptSources.join(' ') + ' ' + scriptContents.join(' ');

    // Google Analytics 4 (GA4)
    if (allScriptText.includes('gtag') && allScriptText.includes('g-')) {
      providers.push('Google Analytics 4 (GA4)');
    }

    // Universal Analytics (deprecated)
    if (allScriptText.includes('analytics.js') || allScriptText.includes('ga.js') ||
        (allScriptText.includes('ua-') && !allScriptText.includes('g-'))) {
      providers.push('Universal Analytics (UA)');
    }

    // Google Tag Manager
    if (allScriptText.includes('googletagmanager.com/gtm') || allScriptText.includes('gtm-')) {
      providers.push('Google Tag Manager');
    }

    // Hotjar
    if (allScriptText.includes('hotjar.com') || allScriptText.includes('hj(')) {
      providers.push('Hotjar');
    }

    // Microsoft Clarity
    if (allScriptText.includes('clarity.ms') || allScriptText.includes('clarity(')) {
      providers.push('Microsoft Clarity');
    }

    // FullStory
    if (allScriptText.includes('fullstory.com') || allScriptText.includes('fs.identify')) {
      providers.push('FullStory');
    }

    // Lucky Orange
    if (allScriptText.includes('luckyorange.com')) {
      providers.push('Lucky Orange');
    }

    // Crazy Egg
    if (allScriptText.includes('crazyegg.com')) {
      providers.push('Crazy Egg');
    }

    // Mixpanel
    if (allScriptText.includes('mixpanel.com') || allScriptText.includes('mixpanel.init')) {
      providers.push('Mixpanel');
    }

    // Heap
    if (allScriptText.includes('heap.io') || allScriptText.includes('heapanalytics')) {
      providers.push('Heap');
    }

    // Amplitude
    if (allScriptText.includes('amplitude.com') || allScriptText.includes('amplitude.init')) {
      providers.push('Amplitude');
    }

    // Segment
    if (allScriptText.includes('segment.com') || allScriptText.includes('analytics.load')) {
      providers.push('Segment');
    }

    // Plausible
    if (allScriptText.includes('plausible.io')) {
      providers.push('Plausible');
    }

    // Matomo/Piwik
    if (allScriptText.includes('matomo') || allScriptText.includes('piwik')) {
      providers.push('Matomo');
    }

    // PostHog
    if (allScriptText.includes('posthog.com') || allScriptText.includes('posthog.init')) {
      providers.push('PostHog');
    }

    // Facebook Pixel
    if (allScriptText.includes('connect.facebook.net') || allScriptText.includes('fbq(')) {
      providers.push('Facebook Pixel');
    }

    // LinkedIn Insight
    if (allScriptText.includes('snap.licdn.com') || allScriptText.includes('_linkedin_partner_id')) {
      providers.push('LinkedIn Insight');
    }

    // Twitter Pixel
    if (allScriptText.includes('static.ads-twitter.com') || allScriptText.includes('twq(')) {
      providers.push('Twitter Pixel');
    }

    // Pinterest Tag
    if (allScriptText.includes('pintrk(') || allScriptText.includes('pinterest.com/ct')) {
      providers.push('Pinterest Tag');
    }

    return {
      analyticsDetected: providers.length > 0,
      analyticsProviders: providers,
    };
  }

  /**
   * Analyze RSS/Atom feed presence
   */
  private analyzeFeeds(): {
    hasRssFeed: boolean;
    rssFeedUrl?: string;
    hasAtomFeed: boolean;
    atomFeedUrl?: string;
  } {
    let hasRssFeed = false;
    let rssFeedUrl: string | undefined;
    let hasAtomFeed = false;
    let atomFeedUrl: string | undefined;

    // Check for RSS feed link
    const rssLink = this.root.querySelector('link[type="application/rss+xml"]');
    if (rssLink) {
      hasRssFeed = true;
      rssFeedUrl = rssLink.getAttribute('href') || undefined;
    }

    // Check for Atom feed link
    const atomLink = this.root.querySelector('link[type="application/atom+xml"]');
    if (atomLink) {
      hasAtomFeed = true;
      atomFeedUrl = atomLink.getAttribute('href') || undefined;
    }

    return { hasRssFeed, rssFeedUrl, hasAtomFeed, atomFeedUrl };
  }

  /**
   * Analyze conversion elements (CTAs, forms, contact info)
   */
  private analyzeConversionElements(links: ReturnType<typeof extractLinks>, visibleText: string): {
    ctaButtonsCount: number;
    formCount: number;
    hasWhatsAppLink: boolean;
    hasPhoneOnPage: boolean;
  } {
    // Count forms
    const formCount = this.root.querySelectorAll('form').length;

    // Count CTA buttons - buttons with action-oriented text
    const ctaPatterns = [
      /^(get started|start|begin|try|sign up|register|subscribe|join|buy|purchase|order|add to cart|checkout|download|contact|request|schedule|book|reserve|learn more|read more|discover|explore|view|see|watch|listen|play|submit|send|apply|claim|grab|unlock|access)$/i,
      /^(obter|começar|iniciar|experimentar|inscrever|registrar|assinar|entrar|comprar|pedir|adicionar|finalizar|baixar|contato|solicitar|agendar|reservar|saber mais|ler mais|descobrir|explorar|ver|assistir|ouvir|enviar|aplicar|reivindicar|acessar)$/i,
    ];

    let ctaButtonsCount = 0;

    // Check buttons
    this.root.querySelectorAll('button').forEach((btn) => {
      const text = btn.text.trim().toLowerCase();
      if (ctaPatterns.some(p => p.test(text))) {
        ctaButtonsCount++;
      }
    });

    // Check links that look like buttons (with btn/button classes or role="button")
    this.root.querySelectorAll('a[class*="btn"], a[class*="button"], a[role="button"]').forEach((link) => {
      const text = link.text.trim().toLowerCase();
      if (ctaPatterns.some(p => p.test(text))) {
        ctaButtonsCount++;
      }
    });

    // Check for WhatsApp links
    const hasWhatsAppLink = links.some(l =>
      l.href.includes('wa.me') ||
      l.href.includes('whatsapp.com') ||
      l.href.includes('api.whatsapp.com')
    );

    // Check for phone numbers on page
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/g;
    const hasPhoneOnPage = phoneRegex.test(visibleText) ||
      links.some(l => l.href.startsWith('tel:'));

    return {
      ctaButtonsCount,
      formCount,
      hasWhatsAppLink,
      hasPhoneOnPage,
    };
  }

  /**
   * Calculate text to HTML ratio.
   */
  private calculateTextHtmlRatio(bodyTextLength: number): number | undefined {
    const htmlSize = this.root.innerHTML?.length;
    if (htmlSize && htmlSize > 0) {
      return (bodyTextLength / htmlSize) * 100; // Percentage
    }
    return undefined;
  }

  /**
   * Convert rule results to check results
   */
  private convertToCheckResults(results: RuleResult[]): SeoCheckResult[] {
    return results.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      severity: r.severity,
      status: r.status,
      message: r.message,
      value: r.value,
      recommendation: r.recommendation,
      evidence: r.evidence,
    }));
  }

  /**
   * Build summary with big numbers and key metrics
   */
  private buildSummary(
    ruleResults: RuleResult[],
    checks: SeoCheckResult[],
    data: {
      pageType: SeoPageType;
      content: ContentMetrics & {
        paragraphWordCounts: number[];
        avgSentenceLength: number;
        faqCount: number;
        imagePerWordRatio: number;
      };
      imageAnalysis: ImageAnalysis;
      linkAnalysis: LinkAnalysis;
      meta: ReturnType<typeof extractMeta>;
      og: ReturnType<typeof extractOpenGraph>;
      twitter: ReturnType<typeof extractTwitterCard>;
      technical: TechnicalSeo;
      timings?: {
        ttfb?: number;
        dns?: number;
        tcp?: number;
        tls?: number;
        download?: number;
        total?: number;
      };
    }
  ): SeoSummary {
    const pageType = data.pageType;
    const timings = data.timings;

    // Count by status
    const passed = checks.filter((c) => c.status === 'pass').length;
    const warnings = checks.filter((c) => c.status === 'warn').length;
    const errors = checks.filter((c) => c.status === 'fail').length;
    const infos = checks.filter((c) => c.status === 'info').length;
    const totalChecks = checks.length;

    // Pass rate (excluding info)
    const scoringChecks = totalChecks - infos;
    const passRate =
      scoringChecks > 0 ? Math.round((passed / scoringChecks) * 100) : 100;

    // Issues by category
    const issuesByCategory: Record<
      string,
      { passed: number; warnings: number; errors: number }
    > = {};
    for (const result of ruleResults) {
      const cat = result.category;
      if (!issuesByCategory[cat]) {
        issuesByCategory[cat] = { passed: 0, warnings: 0, errors: 0 };
      }
      if (result.status === 'pass') issuesByCategory[cat].passed++;
      else if (result.status === 'warn') issuesByCategory[cat].warnings++;
      else if (result.status === 'fail') issuesByCategory[cat].errors++;
    }

    // Top issues (errors first, then warnings), with severity awareness
    const topIssues = checks
      .filter((c) => c.status === 'fail' || c.status === 'warn')
      .sort((a, b) => {
        const severityOrder = (status: SeoStatus) =>
          status === 'fail' ? 2 : 1;
        const statusDiff = severityOrder(b.status) - severityOrder(a.status);
        if (statusDiff !== 0) return statusDiff;

        const aSeverity = a.severity || (a.status === 'fail' ? 'error' : 'warning');
        const bSeverity = b.severity || (b.status === 'fail' ? 'error' : 'warning');
        if (aSeverity === bSeverity) return 0;
        return aSeverity === 'error' ? -1 : 1;
      })
      .slice(0, 5)
      .map((r) => ({
        name: r.name,
        message: r.message,
        category: r.category,
        severity: (r.severity || (r.status === 'fail' ? 'error' : 'warning')) as
          | 'error'
          | 'warning',
      }));

    // Quick wins - easy fixes that have good impact
    const quickWins: string[] = [];

    // Check for missing basics
    if (!data.meta.title) quickWins.push('Add a page title');
    if (!data.meta.description) quickWins.push('Add a meta description');
    if (!data.og.title && !data.og.description)
      quickWins.push('Add OpenGraph meta tags for social sharing');
    if (!data.twitter.card) quickWins.push('Add Twitter Card meta tags');
    if (!data.technical.hasCanonical) quickWins.push('Add a canonical URL');
    if (!data.technical.hasLang) quickWins.push('Add lang attribute to <html>');
    if (data.imageAnalysis.withoutAlt > 0)
      quickWins.push(
        `Add alt text to ${data.imageAnalysis.withoutAlt} image(s)`
      );
    if (data.linkAnalysis.withoutText > 0)
      quickWins.push(
        `Add text to ${data.linkAnalysis.withoutText} empty link(s)`
      );

    // Limit quick wins
    const limitedQuickWins = quickWins.slice(0, 5);

    // Page vitals
    const htmlSize = this.root.innerHTML?.length;
    const domElements = this.root.querySelectorAll('*').length;

    const vitals = {
      htmlSize,
      domElements,
      ttfb: timings?.ttfb,
      totalTime: timings?.total,
      wordCount: data.content.wordCount,
      totalWordCount: data.content.totalWordCount,
      readingTime: data.content.readingTimeMinutes,
      imageCount: data.imageAnalysis.total,
      linkCount: data.linkAnalysis.total,
    };

    // Completeness scores (0-100)
    const completeness = {
      meta: this.calculateMetaCompleteness(data.meta),
      social: this.calculateSocialCompleteness(data.og, data.twitter),
      technical: this.calculateTechnicalCompleteness(data.technical),
      content: this.calculateContentCompleteness(data.content),
      images: this.calculateImageCompleteness(data.imageAnalysis),
      links: this.calculateLinkCompleteness(data.linkAnalysis),
    };

    return {
      totalChecks,
      passed,
      warnings,
      errors,
      infos,
      passRate,
      issuesByCategory,
      pageType: pageType,
      topIssues,
      quickWins: limitedQuickWins,
      vitals,
      completeness,
    };
  }

  /**
   * Calculate meta completeness score
   */
  private calculateMetaCompleteness(
    meta: ReturnType<typeof extractMeta>
  ): number {
    let score = 0;
    const total = 5;

    if (meta.title) score++;
    if (meta.description) score++;
    if (meta.canonical) score++;
    if (meta.viewport) score++;
    if (meta.charset) score++;

    return Math.round((score / total) * 100);
  }

  /**
   * Calculate social completeness score
   */
  private calculateSocialCompleteness(
    og: ReturnType<typeof extractOpenGraph>,
    twitter: ReturnType<typeof extractTwitterCard>
  ): number {
    let score = 0;
    const total = 8;

    // OpenGraph
    if (og.title) score++;
    if (og.description) score++;
    if (og.image) score++;
    if (og.url) score++;

    // Twitter
    if (twitter.card) score++;
    if (twitter.title) score++;
    if (twitter.description) score++;
    if (twitter.image) score++;

    return Math.round((score / total) * 100);
  }

  /**
   * Calculate technical completeness score
   */
  private calculateTechnicalCompleteness(technical: TechnicalSeo): number {
    let score = 0;
    const total = 5;

    if (technical.hasCanonical) score++;
    if (technical.hasViewport) score++;
    if (technical.hasCharset) score++;
    if (technical.hasLang) score++;
    if (technical.hasRobotsMeta) score++;

    return Math.round((score / total) * 100);
  }

  /**
   * Calculate content completeness score
   */
  private calculateContentCompleteness(
    content: ContentMetrics & { faqCount: number }
  ): number {
    let score = 0;
    const total = 5;

    // Good word count (300+)
    if (content.wordCount >= 300) score++;
    // Has paragraphs
    if (content.paragraphCount >= 3) score++;
    // Has lists
    if (content.listCount > 0) score++;
    // Good reading time (1+ min)
    if (content.readingTimeMinutes >= 1) score++;
    // Has emphasis
    if (content.strongTagCount > 0 || content.emTagCount > 0) score++;

    return Math.round((score / total) * 100);
  }

  /**
   * Calculate image completeness score
   */
  private calculateImageCompleteness(images: ImageAnalysis): number {
    if (images.total === 0) return 100; // No images = nothing to fix

    let score = 0;
    const total = 4;

    // All images have alt
    if (images.withoutAlt === 0) score++;
    // Some images use lazy loading
    if (images.lazy > 0) score++;
    // All images have dimensions
    if (images.missingDimensions === 0) score++;
    // Some modern formats
    if (images.modernFormats > 0) score++;

    return Math.round((score / total) * 100);
  }

  /**
   * Calculate link completeness score
   */
  private calculateLinkCompleteness(links: LinkAnalysis): number {
    if (links.total === 0) return 100; // No links = nothing to fix

    let score = 0;
    const total = 4;

    // Has internal links
    if (links.internal > 0) score++;
    // Has external links (shows authority)
    if (links.external > 0) score++;
    // No empty links
    if (links.withoutText === 0) score++;
    // No broken links
    if (links.broken === 0) score++;

    return Math.round((score / total) * 100);
  }

  /**
   * Analyze heading structure and section word counts
   */
  private analyzeHeadings(): HeadingAnalysis & { sectionWordCounts: number[] } {
    const issues: string[] = [];
    const structure: { level: number; text: string; count: number }[] = [];
    const sectionWordCounts: number[] = [];

    // Count headings by level
    const counts: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
    };

    // Iterate through all elements to calculate section depths
    // This is a simplified approach: assume text between H2s belongs to that H2
    let currentSectionWordCount = 0;
    let inSection = false;

    // 'body *' selector might be heavy. Just 'body' and traverse?
    // css-select 'body *' works.
    const body = this.getMainBody();
    const allElements = body ? body.querySelectorAll('*') : [];

    allElements.forEach((el) => {
      const tagName = el.tagName.toLowerCase();
      if (tagName.match(/^h[1-6]$/)) {
        const level = parseInt(tagName.substring(1), 10);
        const text = el.text.trim();

        counts[level] = (counts[level] || 0) + 1;
        structure.push({ level, text: text.slice(0, 80), count: 1 });

        // Section word count logic (for H2s)
        if (level === 2) {
          if (inSection) {
            sectionWordCounts.push(currentSectionWordCount);
          }
          currentSectionWordCount = 0;
          inSection = true;
        }
      } else if (
        inSection &&
        ['p', 'ul', 'ol', 'div', 'article', 'section'].includes(tagName)
      ) {
        // Add to current section word count (shallow check to avoid double counting)
        // A better way is needed for robust counting, but this estimates depth
        // clone().children().remove() logic is complex to replicate exactly efficiently.
        // Simplified approach: remove known non-content tags from a clone.
        
        let text = '';
        el.childNodes.forEach(n => {
            if (n.nodeType === 3) text += n.text; // Text node
        });
        text = text.trim();
        
        if (text.length > 0) {
          currentSectionWordCount += text.split(/\s+/).length;
        }
      }
    });

    // Push last section
    if (inSection) {
      sectionWordCounts.push(currentSectionWordCount);
    }

    // Check hierarchy
    let hasProperHierarchy = true;
    let prevLevel = 0;

    for (const heading of structure) {
      if (heading.level > prevLevel + 1 && prevLevel !== 0) {
        hasProperHierarchy = false;
        issues.push(
          `Skipped heading level: H${prevLevel} to H${heading.level}`
        );
      }
      prevLevel = heading.level;
    }

    if (counts[1] === 0) {
      issues.push('No H1 tag found');
    } else if (counts[1] > 1) {
      issues.push('Multiple H1 tags');
    }

    return {
      structure,
      h1Count: counts[1],
      hasProperHierarchy,
      issues,
      sectionWordCounts,
    };
  }

  /**
   * Analyze content metrics
   */
  private analyzeContent(headings: HeadingAnalysis): ContentMetrics & {
    paragraphWordCounts: number[];
    avgSentenceLength: number;
    faqCount: number;
    imagePerWordRatio: number;
    keywordDensity?: number;
  } {
    const body = this.getMainBody();

    // Get VISIBLE text (excluding scripts, styles, nav, header, footer, etc.)
    // This is what users actually read
    const visibleText = this.getVisibleText();

    // Get TOTAL text (including all elements) for comparison
    let totalBodyText = body ? body.text.replace(/\s+/g, ' ').trim() : '';

    // Fallback: if body text is empty, try to extract from root or paragraphs
    if (!totalBodyText || totalBodyText.length === 0) {
      // Try root element text
      const rootText = this.root.text?.replace(/\s+/g, ' ').trim() || '';
      if (rootText.length > 0) {
        totalBodyText = rootText;
      } else {
        // Last resort: concatenate text from all paragraphs
        const paragraphTexts: string[] = [];
        this.root.querySelectorAll('p').forEach((el: any) => {
          const pText = el.text?.trim();
          if (pText) paragraphTexts.push(pText);
        });
        totalBodyText = paragraphTexts.join(' ');
      }
    }

    // Use VISIBLE text for word count and reading metrics (this is what users actually see)
    const visibleWords = visibleText.split(/\s+/).filter((w: string) => w.length > 0);
    const totalWords = totalBodyText.split(/\s+/).filter((w: string) => w.length > 0);

    const sentences = visibleText
      .split(/[.!?]+/)
      .filter((s: string) => s.trim().length > 0);

    const paragraphs = this.root.querySelectorAll('p');
    let totalParagraphLength = 0;
    const paragraphWordCounts: number[] = [];

    paragraphs.forEach((el: any) => {
      const text = el.text?.trim() || '';
      totalParagraphLength += text.length;
      const pWords = text.split(/\s+/).filter((w: string) => w.length > 0).length;
      if (pWords > 0) paragraphWordCounts.push(pWords);
    });

    // Use VISIBLE word count for reading time (this is accurate)
    const wordCount = visibleWords.length;
    const totalWordCount = totalWords.length;
    const readingTimeMinutes = Math.ceil(wordCount / 200); // Average reading speed
    const avgWordsPerSentence =
      sentences.length > 0 ? Math.round(wordCount / sentences.length) : 0;

    // FAQ Detection (H3s that look like questions)
    let faqCount = 0;
    headings.structure.forEach((h) => {
      if (
        h.level === 3 &&
        /^(what|how|why|when|where|who|can|do|is|are)\b/i.test(h.text)
      ) {
        faqCount++;
      }
    });

    // Image ratio
    const imageCount = this.root.querySelectorAll('img').length;
    const imagePerWordRatio = wordCount > 0 ? imageCount / wordCount : 0;

    // Flesch Reading Ease (simplified - full calculation requires syllable count)
    const fleschReadingEase = undefined; // Placeholder: Requires more complex NLP (syllable counting)

    // Check for question-based headings (H2/H3)
    const hasQuestionHeadings = headings.structure.some(
      (h) =>
        (h.level === 2 || h.level === 3) &&
        /^(what|how|why|when|where|who|can|do|is|are)\b/i.test(h.text)
    );

    return {
      wordCount,
      totalWordCount,
      characterCount: visibleText.length,
      sentenceCount: sentences.length,
      paragraphCount: paragraphs.length,
      readingTimeMinutes,
      avgWordsPerSentence,
      avgParagraphLength:
        paragraphs.length > 0
          ? Math.round(totalParagraphLength / paragraphs.length)
          : 0,
      listCount: this.root.querySelectorAll('ul, ol').length,
      strongTagCount: this.root.querySelectorAll('strong').length,
      emTagCount: this.root.querySelectorAll('em').length,
      paragraphWordCounts,
      avgSentenceLength: avgWordsPerSentence,
      faqCount,
      imagePerWordRatio,
      fleschReadingEase,
      hasQuestionHeadings,
    };
  }

  /**
   * Build link analysis
   */
  private buildLinkAnalysis(
    links: ReturnType<typeof extractLinks>
  ): LinkAnalysis & { internalHttpLinks: number; internalHttpLinkUrls: string[] } {
    // Find internal links using HTTP (insecure)
    const internalHttpLinkUrls = links
      .filter((l) => l.type === 'internal' && l.href.startsWith('http://'))
      .map((l) => l.href);

    return {
      total: links.length,
      internal: links.filter((l) => l.type === 'internal').length,
      external: links.filter((l) => l.type === 'external').length,
      nofollow: links.filter((l) => l.rel?.includes('nofollow')).length,
      sponsoredLinks: links.filter((l) => l.rel?.includes('sponsored')).length,
      ugcLinks: links.filter((l) => l.rel?.includes('ugc')).length,
      broken: 0, // Would need async check
      withoutText: links.filter((l) => !l.text?.trim()).length,
      internalHttpLinks: internalHttpLinkUrls.length,
      internalHttpLinkUrls,
    };
  }

  /**
   * Build image analysis
   */
  private buildImageAnalysis(
    images: ReturnType<typeof extractImages>
  ): ImageAnalysis {
    return {
      total: images.length,
      withAlt: images.filter((i) => i.alt && i.alt.trim().length > 0).length,
      withoutAlt: images.filter(
        (i) => !i.alt || i.alt.trim().length === 0
      ).length,
      lazy: images.filter((i) => i.loading === 'lazy').length,
      missingDimensions: images.filter((i) => !i.width || !i.height).length,
      modernFormats: images.filter((i) => /\.(webp|avif)$/i.test(i.src))
        .length,
      altTextLengths: images.filter((i) => i.alt).map((i) => i.alt!.length),
      imageAltTexts: images.filter((i) => i.alt).map((i) => i.alt!.toLowerCase()),
      imageFilenames: images
        .map((i) => {
          try {
            const url = new URL(i.src);
            return url.pathname.split('/').pop() || '';
          } catch {
            return '';
          }
        })
        .filter(Boolean),
      imagesWithAsyncDecoding: images.filter((i) => i.decoding === 'async')
        .length,
    };
  }

  /**
   * Build social meta analysis
   */
  private buildSocialAnalysis(
    og: ReturnType<typeof extractOpenGraph>,
    twitter: ReturnType<typeof extractTwitterCard>
  ): SocialMetaAnalysis {
    const ogIssues: string[] = [];
    const twitterIssues: string[] = [];

    const hasOg = !!(og.title || og.description || og.image);
    if (!hasOg) {
      ogIssues.push('No OpenGraph meta tags found');
    } else {
      if (!og.title) ogIssues.push('Missing og:title');
      if (!og.description) ogIssues.push('Missing og:description');
      if (!og.image) ogIssues.push('Missing og:image');
      if (!og.url) ogIssues.push('Missing og:url');
    }

    const hasTwitter = !!(twitter.card || twitter.title || twitter.description);
    if (!hasTwitter) {
      twitterIssues.push('No Twitter Card meta tags found');
    } else {
      if (!twitter.card) twitterIssues.push('Missing twitter:card');
      if (!twitter.title) twitterIssues.push('Missing twitter:title');
      if (!twitter.description) twitterIssues.push('Missing twitter:description');
    }

    return {
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
    };
  }

  /**
   * Build technical SEO analysis
   */
  private buildTechnicalAnalysis(
    meta: ReturnType<typeof extractMeta>
  ): TechnicalSeo {
    const html = this.root.querySelector('html');
    const htmlLang = html ? html.getAttribute('lang') : undefined;

    return {
      hasCanonical: !!meta.canonical,
      canonicalUrl: meta.canonical,
      hasRobotsMeta: !!meta.robots,
      robotsContent: meta.robots,
      hasViewport: !!meta.viewport,
      hasCharset: !!meta.charset,
      hasLang: !!htmlLang,
      langValue: htmlLang,
    };
  }

  /**
   * Analyze resources (scripts, styles)
   */
  private analyzeResources() {
    const scripts = this.root.querySelectorAll('script[src]');
    const styles = this.root.querySelectorAll('link[rel="stylesheet"]');
    
    const unminified: string[] = [];
    
    scripts.forEach((s) => {
      const src = s.getAttribute('src');
      if (src && !src.includes('.min.') && !src.includes('cdn')) unminified.push(src);
    });
    
    styles.forEach((s) => {
      const href = s.getAttribute('href');
      if (href && !href.includes('.min.') && !href.includes('cdn')) unminified.push(href);
    });
    
    return {
      jsFilesCount: scripts.length,
      cssFilesCount: styles.length,
      unminifiedResources: unminified.length,
      unminifiedResourceUrls: unminified
    };
  }

  /**
   * Calculate overall SEO score
   */
  private calculateScore(results: RuleResult[]): {
    score: number;
    grade: string;
  } {
    if (results.length === 0) return { score: 100, grade: 'A' };

    const { score: weightedScore } = calculateWeightedScore(results);
    const score = weightedScore;

    let grade: string;
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 60) grade = 'D';
    else grade = 'F';

    return { score, grade };
  }

  /**
   * Get all available rules
   */
  getRules() {
    return this.rulesEngine.getRules();
  }

  /**
   * Get rules by category
   */
  getRulesByCategory(category: string) {
    return this.rulesEngine.getRulesByCategory(category as any);
  }

  /**
   * Get all categories
   */
  getCategories() {
    return this.rulesEngine.getCategories();
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
export async function analyzeSeo(
  html: string,
  options: SeoAnalyzerFullOptions = {}
): Promise<SeoReport> {
  const analyzer = await SeoAnalyzer.fromHtml(html, options);
  return analyzer.analyze();
}

// Re-export rules for direct access
export {
  SEO_THRESHOLDS,
  createRulesEngine,
  SeoRulesEngine,
} from './rules/index.js';
export type {
  RuleContext,
  RuleResult,
  RulesEngineOptions,
  RuleCategory,
  RuleSeverity,
  SeoRule,
} from './rules/index.js';

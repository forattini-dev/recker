/**
 * SEO Analyzer
 *
 * Comprehensive SEO analysis for web pages using a rules-based engine.
 * Supports 40+ SEO rules across 13 categories.
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
import {
  SeoRulesEngine,
  createRulesEngine,
  SEO_THRESHOLDS,
  type RuleContext,
  type RuleResult,
  type RulesEngineOptions,
} from './rules/index.js';

// Cached cheerio module
let cheerioModule: typeof import('cheerio') | null = null;

async function loadCheerio(): Promise<typeof import('cheerio')> {
  if (cheerioModule) return cheerioModule;
  cheerioModule = await requireOptional<typeof import('cheerio')>('cheerio', 'recker/seo');
  return cheerioModule;
}

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
  private $: CheerioAPI;
  private options: SeoAnalyzerFullOptions;
  private rulesEngine: SeoRulesEngine;

  constructor($: CheerioAPI, options: SeoAnalyzerFullOptions = {}) {
    this.$ = $;
    this.options = options;
    this.rulesEngine = createRulesEngine(options.rules);
  }

  /**
   * Create analyzer from HTML string
   */
  static async fromHtml(html: string, options: SeoAnalyzerFullOptions = {}): Promise<SeoAnalyzer> {
    const { load } = await loadCheerio();
    return new SeoAnalyzer(load(html), options);
  }

  /**
   * Run full SEO analysis
   */
  analyze(): SeoReport {
    const url = this.options.baseUrl || '';

    // Extract all data using scrape extractors
    const meta = extractMeta(this.$);
    const og = extractOpenGraph(this.$);
    const twitter = extractTwitterCard(this.$);
    const jsonLd = extractJsonLd(this.$);
    const links = extractLinks(this.$, { baseUrl: this.options.baseUrl });
    const images = extractImages(this.$, { baseUrl: this.options.baseUrl });

    // Analyze structured data
    const headings = this.analyzeHeadings();
    const content = this.analyzeContent(headings);
    const linkAnalysis = this.buildLinkAnalysis(links);
    const imageAnalysis = this.buildImageAnalysis(images);
    const social = this.buildSocialAnalysis(og, twitter);
    const technical = this.buildTechnicalAnalysis(meta);

    // Build rule context from all extracted data
    const context = this.buildRuleContext({
      meta,
      og,
      twitter,
      jsonLd,
      headings,
      content,
      linkAnalysis,
      imageAnalysis,
      links,
    });

    // Run rules engine
    const ruleResults = this.rulesEngine.evaluate(context);

    // Convert rule results to check results
    const checks = this.convertToCheckResults(ruleResults);

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
      headings: headings,
      content,
      links: linkAnalysis,
      images: imageAnalysis,
      social,
      technical,
      jsonLd: {
        count: jsonLd.length,
        types: jsonLd.map((j) => j['@type'] as string).filter(Boolean),
      },
    };
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
    linkAnalysis: LinkAnalysis;
    imageAnalysis: ImageAnalysis;
    links: ReturnType<typeof extractLinks>;
  }): RuleContext {
    const { meta, og, twitter, jsonLd, headings, content, linkAnalysis, imageAnalysis, links } = data;
    const htmlLang = this.$('html').attr('lang');

    // Extract hreflang tags for i18n
    const hreflangTags: Array<{ lang: string; href: string }> = [];
    this.$('link[rel="alternate"][hreflang]').each((_, el) => {
      const $el = this.$(el);
      const lang = $el.attr('hreflang');
      const href = $el.attr('href');
      if (lang && href) {
        hreflangTags.push({ lang, href });
      }
    });

    // Extract og:locale for i18n consistency check
    const ogLocale = this.$('meta[property="og:locale"]').attr('content');

    // Find problematic links (store actual links, not just counts)
    const genericTexts = SEO_THRESHOLDS.links.genericTexts;
    const genericTextLinks = links.filter((l) => {
      const text = l.text?.toLowerCase().trim();
      return text && genericTexts.some((g) => text === g || text.includes(g));
    });
    const linksWithGenericText = genericTextLinks.length;

    // Links without text
    const linksWithoutTextArray = links.filter((l) => !l.text || l.text.trim() === '');

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
    const h1Elements = this.$('h1');
    const h1Text = h1Elements.first().text().trim();

    // Get viewport content
    const viewportContent = this.$('meta[name="viewport"]').attr('content');

    // Accessibility metrics
    const a11yMetrics = this.analyzeAccessibility();

    // Image empty alt count
    const imagesWithEmptyAlt = this.$('img[alt=""]').length;

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
        const trustSignals = this.analyzeTrustSignals(links);
    
        // Calculate subheading frequency (H2/H3 count per 100 words)
        const totalSubheadings = (headings.structure.filter((h) => h.level === 2).length || 0) + (headings.structure.filter((h) => h.level === 3).length || 0);
        const subheadingFrequency = content.wordCount > 0 ? (totalSubheadings / content.wordCount) * 100 : 0;
    
        // Calculate Text/HTML Ratio
        const textHtmlRatio = this.calculateTextHtmlRatio(content.characterCount);
    
        return {
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
          twitterImage: Array.isArray(twitter.image) ? twitter.image[0] : twitter.image,
          twitterSite: twitter.site,
    
          // Headings
          h1Count: headings.h1Count,
          h1Text: h1Text || undefined,
          h1Length: h1Text?.length,
          h2Count: headings.structure.filter((h) => h.level === 2).length,
          headingHierarchyValid: headings.hasProperHierarchy,
          headingSkippedLevels: headings.issues.filter((i) => i.includes('Skipped')),
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
          imageFilenames: imageAnalysis.imageFilenames,
          imagesWithAsyncDecoding: imageAnalysis.imagesWithAsyncDecoding,
    
          // Accessibility
          ...a11yMetrics,
    
          // Links
          allLinks: links,
          totalLinks: linkAnalysis.total,
          internalLinks: linkAnalysis.internal,
          externalLinks: linkAnalysis.external,
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
          titleMatchesH1: meta.title && h1Text ? meta.title.toLowerCase().trim() === h1Text.toLowerCase().trim() : undefined,
    
          // URL Quality
          ...this.analyzeUrlQuality(),
    
          // JS Rendering hints
          ...this.analyzeJsRendering(content),

          // Internationalization (i18n)
          hreflangTags: hreflangTags.length > 0 ? hreflangTags : undefined,
          ogLocale,
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
      const urlHasSpecialChars = /[<>{}|\\^`\[\]]/.test(path) || /%[0-9A-F]{2}/i.test(path);

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
    const scriptCount = this.$('script').length;

    // Check for noscript content
    const noscriptContent = this.$('noscript').text().trim();
    const hasNoscriptContent = noscriptContent.length > 50; // Meaningful noscript content

    return { bodyTextLength, scriptCount, hasNoscriptContent };
  }

  /**
   * Check for mixed content (HTTP resources on HTTPS page)
   */
  private checkMixedContent(): boolean {
    let hasMixed = false;

    // Check images
    this.$('img[src^="http://"]').each(() => {
      hasMixed = true;
    });

    // Check scripts
    this.$('script[src^="http://"]').each(() => {
      hasMixed = true;
    });

    // Check stylesheets
    this.$('link[href^="http://"]').each(() => {
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
    this.$('a[href^="http"][target="_blank"]').each((_, el) => {
      const $el = this.$(el);
      const href = $el.attr('href') || '';
      const rel = ($el.attr('rel') || '').toLowerCase();

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
      const favicon = this.$(selector).first();
      if (favicon.length > 0) {
        return {
          hasFavicon: true,
          faviconUrl: favicon.attr('href'),
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
    const preconnectLinks = this.$('link[rel="preconnect"]');
    const preconnectCount = preconnectLinks.length;

    // DNS Prefetch
    const dnsPrefetchLinks = this.$('link[rel="dns-prefetch"]');
    const dnsPrefetchCount = dnsPrefetchLinks.length;

    // Preload
    const preloadLinks = this.$('link[rel="preload"]');
    const preloadCount = preloadLinks.length;

    // Render-blocking resources (scripts and stylesheets in head without async/defer)
    let renderBlockingResources = 0;

    // Scripts without async or defer in head
    this.$('head script[src]:not([async]):not([defer])').each(() => {
      renderBlockingResources++;
    });

    // Stylesheets without preload/prefetch media query
    this.$('head link[rel="stylesheet"]').each((_, el) => {
      const $el = this.$(el);
      const media = $el.attr('media');
      // Non-critical stylesheets should use media="print" or similar
      if (!media || media === 'all' || media === 'screen') {
        renderBlockingResources++;
      }
    });

    // Inline scripts count
    const inlineScriptsCount = this.$('script:not([src])').filter((_, el) => {
      const content = this.$(el).html() || '';
      return content.trim().length > 0;
    }).length;

    // Inline styles count
    const inlineStylesCount = this.$('style').length;

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
    const images = this.$('img');
    let hasLargeImages = false;
    let hasLazyLcp = false;
    let hasPriorityHints = false;

    // Check first 3 images (likely above the fold)
    images.slice(0, 3).each((index, el) => {
      const $el = this.$(el);
      const width = parseInt($el.attr('width') || '0', 10);
      const height = parseInt($el.attr('height') || '0', 10);
      const loading = $el.attr('loading');
      const fetchPriority = $el.attr('fetchpriority');

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
    this.$('[style*="background-image"]').slice(0, 3).each(() => {
      hasLargeImages = true;
    });

    // CLS hints - images without dimensions
    const imagesWithoutDimensions = this.$('img:not([width]):not([height])').length + this.$('img[width="auto"], img[height="auto"]').length;

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
    this.$('button').each((_, el) => {
      const $el = this.$(el);
      const text = $el.text().trim();
      const ariaLabel = $el.attr('aria-label');
      const ariaLabelledBy = $el.attr('aria-labelledby');
      const title = $el.attr('title');
      if (!text && !ariaLabel && !ariaLabelledBy && !title) {
        buttonsWithoutAriaLabel++;
      }
    });

    // Links without text or aria-label (icon-only links)
    let linksWithoutAriaLabel = 0;
    this.$('a[href]').each((_, el) => {
      const $el = this.$(el);
      const text = $el.text().trim();
      const ariaLabel = $el.attr('aria-label');
      const ariaLabelledBy = $el.attr('aria-labelledby');
      const title = $el.attr('title');
      // Check if link only contains an image or icon
      const hasOnlyImage = $el.find('img, svg').length > 0 && !text;
      if (hasOnlyImage && !ariaLabel && !ariaLabelledBy && !title) {
        linksWithoutAriaLabel++;
      }
    });

    // Form inputs without labels
    let inputsWithoutLabel = 0;
    this.$('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea').each((_, el) => {
      const $el = this.$(el);
      const id = $el.attr('id');
      const ariaLabel = $el.attr('aria-label');
      const ariaLabelledBy = $el.attr('aria-labelledby');
      const placeholder = $el.attr('placeholder');
      const title = $el.attr('title');

      // Check if there's an associated label
      const hasLabel = id ? this.$(`label[for="${id}"]`).length > 0 : false;
      // Check if wrapped in label
      const wrappedInLabel = $el.closest('label').length > 0;

      if (!hasLabel && !wrappedInLabel && !ariaLabel && !ariaLabelledBy && !title && !placeholder) {
        inputsWithoutLabel++;
      }
    });

    // Iframes without title
    const iframesWithoutTitle = this.$('iframe:not([title])').length;

    // Tables without caption or aria-label (only data tables, skip layout tables)
    let tablesWithoutCaption = 0;
    this.$('table').each((_, el) => {
      const $el = this.$(el);
      const hasCaption = $el.find('caption').length > 0;
      const ariaLabel = $el.attr('aria-label');
      const ariaLabelledBy = $el.attr('aria-labelledby');
      const role = $el.attr('role');

      // Skip presentation/layout tables
      if (role === 'presentation' || role === 'none') return;

      // Check if it looks like a data table (has th elements)
      const hasHeaders = $el.find('th').length > 0;
      if (hasHeaders && !hasCaption && !ariaLabel && !ariaLabelledBy) {
        tablesWithoutCaption++;
      }
    });

    // SVGs without accessible title
    let svgsWithoutTitle = 0;
    this.$('svg').each((_, el) => {
      const $el = this.$(el);
      const hasTitle = $el.find('title').length > 0;
      const ariaLabel = $el.attr('aria-label');
      const ariaLabelledBy = $el.attr('aria-labelledby');
      const ariaHidden = $el.attr('aria-hidden');
      const role = $el.attr('role');

      // Skip decorative SVGs (aria-hidden or role=presentation)
      if (ariaHidden === 'true' || role === 'presentation' || role === 'none') return;

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
      hasHeader: this.$('header').length > 0,
      hasNav: this.$('nav').length > 0,
      hasMain: this.$('main').length > 0,
      hasArticle: this.$('article').length > 0,
      hasSection: this.$('section').length > 0,
      hasFooter: this.$('footer').length > 0,
    };
  }

  /**
   * Analyze breadcrumbs
   */
  private analyzeBreadcrumbs(jsonLdTypes: string[]): {
    hasBreadcrumbsHtml: boolean;
    hasBreadcrumbsSchema: boolean;
  } {
    const hasBreadcrumbsHtml = this.$('nav[aria-label="breadcrumb"], .breadcrumb, .breadcrumbs').length > 0;
    const hasBreadcrumbsSchema = jsonLdTypes.includes('BreadcrumbList');
    return { hasBreadcrumbsHtml, hasBreadcrumbsSchema };
  }

  /**
   * Analyze multimedia elements
   */
  private analyzeMultimedia(): {
    videoCount: number;
    audioCount: number;
  } {
    return {
      videoCount: this.$('video').length,
      audioCount: this.$('audio').length,
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
    const linkHrefs = links.map(l => l.href.toLowerCase());
    return {
      hasAboutPageLink: linkHrefs.some(href => href.includes('about') || href.includes('quem-somos')),
      hasContactPageLink: linkHrefs.some(href => href.includes('contact') || href.includes('contato')),
      hasPrivacyPolicyLink: linkHrefs.some(href => href.includes('privacy') || href.includes('privacidade')),
      hasTermsOfServiceLink: linkHrefs.some(href => href.includes('terms') || href.includes('termos-de-uso')),
    };
  }

  /**
   * Calculate text to HTML ratio.
   */
  private calculateTextHtmlRatio(bodyTextLength: number): number | undefined {
    const htmlSize = this.$('html').html()?.length;
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
      name: r.name,
      status: r.status,
      message: r.message,
      value: r.value,
      recommendation: r.recommendation,
      evidence: r.evidence,
    }));
  }

  /**
   * Analyze heading structure and section word counts
   */
  private analyzeHeadings(): HeadingAnalysis & { sectionWordCounts: number[] } {
    const issues: string[] = [];
    const structure: { level: number; text: string; count: number }[] = [];
    const sectionWordCounts: number[] = [];

    // Count headings by level
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

    // Iterate through all elements to calculate section depths
    // This is a simplified approach: assume text between H2s belongs to that H2
    let currentSectionWordCount = 0;
    let inSection = false;

    this.$('body').find('*').each((_, el) => {
      const tagName = el.tagName.toLowerCase();
      if (tagName.match(/^h[1-6]$/)) {
        const level = parseInt(tagName.substring(1), 10);
        const text = this.$(el).text().trim();
        
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
      } else if (inSection && ['p', 'ul', 'ol', 'div', 'article', 'section'].includes(tagName)) {
        // Add to current section word count (shallow check to avoid double counting)
        // A better way is needed for robust counting, but this estimates depth
        const text = this.$(el).clone().children().remove().end().text().trim();
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
        issues.push(`Skipped heading level: H${prevLevel} to H${heading.level}`);
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
    // Get body text, excluding scripts and styles
    const $body = this.$('body').clone();
    $body.find('script, style, noscript, svg, header, footer, nav').remove();
    const bodyText = $body.text().replace(/\s+/g, ' ').trim();

    const words = bodyText.split(/\s+/).filter((w) => w.length > 0);
    const sentences = bodyText.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    
    const paragraphs = this.$('p');
    let totalParagraphLength = 0;
    const paragraphWordCounts: number[] = [];
    
    paragraphs.each((_, el) => {
      const text = this.$(el).text().trim();
      totalParagraphLength += text.length;
      const pWords = text.split(/\s+/).filter(w => w.length > 0).length;
      if (pWords > 0) paragraphWordCounts.push(pWords);
    });

    const wordCount = words.length;
    const readingTimeMinutes = Math.ceil(wordCount / 200); // Average reading speed
    const avgWordsPerSentence = sentences.length > 0 ? Math.round(wordCount / sentences.length) : 0;
    
    // FAQ Detection (H3s that look like questions)
    let faqCount = 0;
    headings.structure.forEach(h => {
      if (h.level === 3 && /^(what|how|why|when|where|who|can|do|is|are)\b/i.test(h.text)) {
        faqCount++;
      }
    });

    // Image ratio
    const imageCount = this.$('img').length;
    const imagePerWordRatio = wordCount > 0 ? imageCount / wordCount : 0;

    // Flesch Reading Ease (simplified - full calculation requires syllable count)
    const fleschReadingEase = undefined; // Placeholder: Requires more complex NLP (syllable counting)

    // Check for question-based headings (H2/H3)
    const hasQuestionHeadings = headings.structure.some(
      (h) => (h.level === 2 || h.level === 3) && /^(what|how|why|when|where|who|can|do|is|are)\b/i.test(h.text)
    );

    return {
      wordCount,
      characterCount: bodyText.length,
      sentenceCount: sentences.length,
      paragraphCount: paragraphs.length,
      readingTimeMinutes,
      avgWordsPerSentence,
      avgParagraphLength: paragraphs.length > 0 ? Math.round(totalParagraphLength / paragraphs.length) : 0,
      listCount: this.$('ul, ol').length,
      strongTagCount: this.$('strong').length,
      emTagCount: this.$('em').length,
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
  private buildLinkAnalysis(links: ReturnType<typeof extractLinks>): LinkAnalysis {
    return {
      total: links.length,
      internal: links.filter((l) => l.type === 'internal').length,
      external: links.filter((l) => l.type === 'external').length,
      nofollow: links.filter((l) => l.rel?.includes('nofollow')).length,
      sponsoredLinks: links.filter((l) => l.rel?.includes('sponsored')).length,
      ugcLinks: links.filter((l) => l.rel?.includes('ugc')).length,
      broken: 0, // Would need async check
      withoutText: links.filter((l) => !l.text?.trim()).length,
    };
  }

  /**
   * Build image analysis
   */
  private buildImageAnalysis(images: ReturnType<typeof extractImages>): ImageAnalysis {
    return {
      total: images.length,
      withAlt: images.filter((i) => i.alt && i.alt.trim().length > 0).length,
      withoutAlt: images.filter((i) => !i.alt || i.alt.trim().length === 0).length,
      lazy: images.filter((i) => i.loading === 'lazy').length,
      missingDimensions: images.filter((i) => !i.width || !i.height).length,
      modernFormats: images.filter((i) => /\.(webp|avif)$/i.test(i.src)).length,
      altTextLengths: images.filter(i => i.alt).map(i => i.alt!.length),
      imageFilenames: images.map(i => {
        try {
          const url = new URL(i.src);
          return url.pathname.split('/').pop() || '';
        } catch {
          return '';
        }
      }).filter(Boolean),
      imagesWithAsyncDecoding: images.filter(i => i.decoding === 'async').length,
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
  private buildTechnicalAnalysis(meta: ReturnType<typeof extractMeta>): TechnicalSeo {
    const htmlLang = this.$('html').attr('lang');

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
    const scoringChecks = checks.filter((c) => c.status !== 'info');
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
export async function analyzeSeo(html: string, options: SeoAnalyzerFullOptions = {}): Promise<SeoReport> {
  const analyzer = await SeoAnalyzer.fromHtml(html, options);
  return analyzer.analyze();
}

// Re-export rules for direct access
export { SEO_THRESHOLDS, createRulesEngine, SeoRulesEngine } from './rules/index.js';
export type { RuleContext, RuleResult, RulesEngineOptions, RuleCategory, RuleSeverity, SeoRule } from './rules/index.js';

/**
 * SEO Module
 *
 * Comprehensive SEO analysis with 40+ rules across 13 categories.
 *
 * @example
 * ```typescript
 * import { analyzeSeo, SEO_THRESHOLDS, createRulesEngine } from 'recker/seo';
 *
 * // Basic analysis
 * const report = await analyzeSeo(html, { baseUrl: 'https://example.com' });
 * console.log(`Score: ${report.score}/100 (${report.grade})`);
 *
 * // Filter by categories
 * const report = await analyzeSeo(html, {
 *   rules: { categories: ['og', 'twitter'] }
 * });
 *
 * // Custom rules engine
 * const engine = createRulesEngine({ minSeverity: 'error' });
 * const results = engine.evaluate(context);
 * ```
 */

// Main analyzer
export { SeoAnalyzer, analyzeSeo } from './analyzer.js';

// SEO Spider (site-wide analysis)
export { SeoSpider, seoSpider } from './seo-spider.js';
export type {
  SeoSpiderOptions,
  SeoPageResult,
  SiteWideIssue,
  SeoSpiderResult,
} from './seo-spider.js';

// Rules engine
export {
  SeoRulesEngine,
  createRulesEngine,
  SEO_THRESHOLDS,
  ALL_SEO_RULES,
} from './rules/index.js';

// Types
export type {
  SeoReport,
  SeoCheckResult,
  SeoStatus,
  SeoTiming,
  HeadingAnalysis,
  HeadingInfo,
  ContentMetrics,
  LinkAnalysis,
  ImageAnalysis,
  SocialMetaAnalysis,
  TechnicalSeo,
  SeoAnalyzerOptions,
} from './types.js';

export type {
  SeoRule,
  RuleContext,
  RuleResult,
  RuleEvidence,
  RuleCategory,
  RuleSeverity,
  RulesEngineOptions,
} from './rules/index.js';

export type { SeoAnalyzerFullOptions } from './analyzer.js';

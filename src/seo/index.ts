/**
 * SEO Analysis Module
 *
 * Comprehensive SEO analysis for web pages.
 *
 * @example
 * ```typescript
 * import { analyzeSeo, SeoAnalyzer } from 'recker/seo';
 *
 * // Quick analysis
 * const report = await analyzeSeo(html, { baseUrl: 'https://example.com' });
 * console.log(`Score: ${report.score}/100 (${report.grade})`);
 *
 * // With more control
 * const analyzer = await SeoAnalyzer.fromHtml(html, { baseUrl: 'https://example.com' });
 * const fullReport = analyzer.analyze();
 * ```
 */

export { SeoAnalyzer, analyzeSeo } from './analyzer.js';
export type {
  SeoReport,
  SeoCheckResult,
  SeoStatus,
  HeadingInfo,
  HeadingAnalysis,
  ContentMetrics,
  LinkAnalysis,
  ImageAnalysis,
  SocialMetaAnalysis,
  TechnicalSeo,
  SeoAnalyzerOptions,
} from './types.js';

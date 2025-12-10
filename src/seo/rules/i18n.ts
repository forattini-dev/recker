/**
 * SEO Internationalization (i18n) Rules
 * Rules for multi-language and multi-region websites
 */

import { SeoRule, createResult } from './types.js';

export const i18nRules: SeoRule[] = [
  {
    id: 'i18n-hreflang-exists',
    name: 'Hreflang Tags',
    category: 'technical',
    severity: 'warning',
    description: 'Multi-language sites should have hreflang tags for proper language targeting',
    check: (ctx) => {
      if (!ctx.hreflangTags || ctx.hreflangTags.length === 0) {
        // Only warn if the page appears to be multi-language (has lang attribute)
        if (ctx.hasLang && ctx.langValue && ctx.langValue !== 'en') {
          return createResult(
            { id: 'i18n-hreflang-exists', name: 'Hreflang Tags', category: 'technical', severity: 'warning' },
            'info',
            'No hreflang tags found (recommended for multi-language sites)',
            {
              recommendation: 'Add hreflang tags to indicate language/region alternatives',
              evidence: {
                expected: '<link rel="alternate" hreflang="en" href="https://example.com/en/">',
                example:
                  '<link rel="alternate" hreflang="en" href="https://example.com/en/">\n<link rel="alternate" hreflang="es" href="https://example.com/es/">\n<link rel="alternate" hreflang="x-default" href="https://example.com/">',
                impact:
                  'Without hreflang, search engines may show wrong language version to users in different countries',
                learnMore: 'https://developers.google.com/search/docs/specialty/international/localized-versions',
              },
            }
          );
        }
        return null;
      }
      return createResult(
        { id: 'i18n-hreflang-exists', name: 'Hreflang Tags', category: 'technical', severity: 'warning' },
        'pass',
        `${ctx.hreflangTags.length} hreflang tag(s) found`,
        { value: ctx.hreflangTags.length }
      );
    },
  },
  {
    id: 'i18n-hreflang-self',
    name: 'Hreflang Self-Reference',
    category: 'technical',
    severity: 'warning',
    description: 'Hreflang tags should include a self-referencing tag for the current page',
    check: (ctx) => {
      if (!ctx.hreflangTags || ctx.hreflangTags.length === 0) return null;
      if (!ctx.url) return null;

      const currentUrl = ctx.url.toLowerCase().replace(/\/$/, '');
      const hasSelfRef = ctx.hreflangTags.some((tag) => {
        const href = tag.href?.toLowerCase().replace(/\/$/, '');
        return href === currentUrl;
      });

      if (!hasSelfRef) {
        return createResult(
          { id: 'i18n-hreflang-self', name: 'Hreflang Self-Reference', category: 'technical', severity: 'warning' },
          'warn',
          'Missing self-referencing hreflang tag',
          {
            recommendation: 'Add a hreflang tag that points to the current page',
            evidence: {
              found: `Current URL: ${ctx.url}`,
              expected: `<link rel="alternate" hreflang="${ctx.langValue || 'en'}" href="${ctx.url}">`,
              impact: 'Google recommends including a self-referencing hreflang tag for clarity',
            },
          }
        );
      }
      return null;
    },
  },
  {
    id: 'i18n-hreflang-x-default',
    name: 'Hreflang X-Default',
    category: 'technical',
    severity: 'info',
    description: 'Include x-default hreflang for users outside defined regions',
    check: (ctx) => {
      if (!ctx.hreflangTags || ctx.hreflangTags.length < 2) return null;

      const hasXDefault = ctx.hreflangTags.some((tag) => tag.lang === 'x-default');

      if (!hasXDefault) {
        return createResult(
          { id: 'i18n-hreflang-x-default', name: 'Hreflang X-Default', category: 'technical', severity: 'info' },
          'info',
          'No x-default hreflang tag found',
          {
            recommendation: 'Add hreflang="x-default" to specify the fallback page for unmatched languages',
            evidence: {
              expected: '<link rel="alternate" hreflang="x-default" href="https://example.com/">',
              impact: 'Without x-default, users in unsupported regions may not see the best version',
            },
          }
        );
      }
      return createResult(
        { id: 'i18n-hreflang-x-default', name: 'Hreflang X-Default', category: 'technical', severity: 'info' },
        'pass',
        'x-default hreflang tag present'
      );
    },
  },
  {
    id: 'i18n-hreflang-valid-codes',
    name: 'Hreflang Valid Codes',
    category: 'technical',
    severity: 'warning',
    description: 'Hreflang language codes must be valid ISO 639-1 codes',
    check: (ctx) => {
      if (!ctx.hreflangTags || ctx.hreflangTags.length === 0) return null;

      // Common valid language codes (ISO 639-1)
      const validLanguageCodes = new Set([
        'aa', 'ab', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az',
        'ba', 'bm', 'eu', 'be', 'bn', 'bh', 'bi', 'bo', 'bs', 'br', 'bg', 'my', 'ca', 'cs',
        'ch', 'ce', 'zh', 'cu', 'cv', 'kw', 'co', 'cr', 'cy', 'da', 'de', 'dv', 'nl', 'dz',
        'en', 'eo', 'et', 'ee', 'fo', 'fa', 'fj', 'fi', 'fr', 'fy', 'ff', 'ka', 'el', 'gn',
        'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hr', 'hu', 'ig', 'is', 'io', 'ii', 'iu',
        'ie', 'ia', 'id', 'ik', 'it', 'jv', 'ja', 'kl', 'kn', 'ks', 'kr', 'kk', 'km', 'ki',
        'rw', 'ky', 'kv', 'kg', 'ko', 'kj', 'ku', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lb',
        'lu', 'lg', 'mk', 'mh', 'ml', 'mi', 'mr', 'ms', 'mg', 'mt', 'mn', 'na', 'nv', 'nr',
        'nd', 'ng', 'ne', 'nn', 'nb', 'no', 'ny', 'oc', 'oj', 'or', 'om', 'os', 'pa', 'pi',
        'pl', 'pt', 'ps', 'qu', 'rm', 'ro', 'rn', 'ru', 'sg', 'sa', 'si', 'sk', 'sl', 'se',
        'sm', 'sn', 'sd', 'so', 'st', 'es', 'sc', 'sr', 'ss', 'su', 'sw', 'sv', 'ty', 'ta',
        'tt', 'te', 'tg', 'tl', 'th', 'ti', 'to', 'tn', 'ts', 'tk', 'tr', 'tw', 'ug', 'uk',
        'ur', 'uz', 've', 'vi', 'vo', 'wa', 'wo', 'xh', 'yi', 'yo', 'za', 'zu',
        'x-default', // Special value
      ]);

      const invalidTags: string[] = [];
      for (const tag of ctx.hreflangTags) {
        const lang = tag.lang?.toLowerCase().split('-')[0]; // Get primary language code
        if (lang && !validLanguageCodes.has(lang)) {
          invalidTags.push(tag.lang);
        }
      }

      if (invalidTags.length > 0) {
        return createResult(
          { id: 'i18n-hreflang-valid-codes', name: 'Hreflang Valid Codes', category: 'technical', severity: 'warning' },
          'warn',
          `Invalid hreflang codes: ${invalidTags.join(', ')}`,
          {
            recommendation: 'Use valid ISO 639-1 language codes',
            evidence: {
              found: invalidTags,
              expected: 'Valid ISO 639-1 codes like: en, es, fr, de, pt-BR, zh-CN',
              learnMore: 'https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes',
            },
          }
        );
      }
      return null;
    },
  },
  {
    id: 'i18n-hreflang-return-links',
    name: 'Hreflang Return Links',
    category: 'technical',
    severity: 'warning',
    description: 'All hreflang URLs should return links back to this page (bidirectional)',
    check: (ctx) => {
      // This is a hint-only check since we can't verify remote pages
      if (!ctx.hreflangTags || ctx.hreflangTags.length < 2) return null;

      return createResult(
        { id: 'i18n-hreflang-return-links', name: 'Hreflang Return Links', category: 'technical', severity: 'warning' },
        'info',
        'Hreflang return links cannot be verified from HTML alone',
        {
          recommendation: 'Ensure all alternate pages link back to this page with matching hreflang tags',
          evidence: {
            impact: 'Missing return links can cause Google to ignore hreflang annotations',
            learnMore: 'https://developers.google.com/search/docs/specialty/international/localized-versions#bidirectional',
          },
        }
      );
    },
  },
  {
    id: 'i18n-content-language',
    name: 'Content-Language Header',
    category: 'technical',
    severity: 'info',
    description: 'Content-Language header can indicate the language of the document',
    check: (ctx) => {
      if (!ctx.responseHeaders) return null;

      const contentLang =
        ctx.responseHeaders['content-language'] || ctx.responseHeaders['Content-Language'];

      if (!contentLang) {
        // Only suggest if page has explicit lang attribute
        if (ctx.hasLang) {
          return createResult(
            { id: 'i18n-content-language', name: 'Content-Language Header', category: 'technical', severity: 'info' },
            'info',
            'Content-Language header not set',
            {
              recommendation: `Consider adding Content-Language: ${ctx.langValue || 'en'} header`,
              evidence: {
                impact: 'While not critical for SEO, it helps with content negotiation',
              },
            }
          );
        }
        return null;
      }

      // Check if Content-Language matches html lang
      if (ctx.langValue) {
        const headerLang = Array.isArray(contentLang) ? contentLang[0] : contentLang;
        const headerLangPrimary = headerLang.toLowerCase().split('-')[0].split(',')[0].trim();
        const htmlLangPrimary = ctx.langValue.toLowerCase().split('-')[0];

        if (headerLangPrimary !== htmlLangPrimary) {
          return createResult(
            { id: 'i18n-content-language', name: 'Content-Language Header', category: 'technical', severity: 'info' },
            'warn',
            `Content-Language (${headerLang}) doesn't match html lang (${ctx.langValue})`,
            {
              recommendation: 'Ensure Content-Language header matches the html lang attribute',
            }
          );
        }
      }

      return createResult(
        { id: 'i18n-content-language', name: 'Content-Language Header', category: 'technical', severity: 'info' },
        'pass',
        `Content-Language: ${contentLang}`
      );
    },
  },
  {
    id: 'i18n-lang-consistency',
    name: 'Language Consistency',
    category: 'technical',
    severity: 'warning',
    description: 'HTML lang attribute should match the og:locale if present',
    check: (ctx) => {
      if (!ctx.hasLang || !ctx.ogLocale) return null;

      const htmlLang = ctx.langValue?.toLowerCase().split('-')[0];
      const ogLocaleLang = ctx.ogLocale.toLowerCase().split('_')[0];

      if (htmlLang !== ogLocaleLang) {
        return createResult(
          { id: 'i18n-lang-consistency', name: 'Language Consistency', category: 'technical', severity: 'warning' },
          'warn',
          `Language mismatch: html lang="${ctx.langValue}" vs og:locale="${ctx.ogLocale}"`,
          {
            recommendation: 'Ensure html lang and og:locale represent the same language',
            evidence: {
              found: [`html lang="${ctx.langValue}"`, `og:locale="${ctx.ogLocale}"`],
              impact: 'Inconsistent language signals can confuse search engines and social platforms',
            },
          }
        );
      }
      return null;
    },
  },
  {
    id: 'i18n-lang-region',
    name: 'Language Region Specificity',
    category: 'technical',
    severity: 'info',
    description: 'Consider using region-specific language codes for better targeting',
    check: (ctx) => {
      if (!ctx.hasLang || !ctx.langValue) return null;

      // Check if using region-specific codes for common multi-regional languages
      const multiRegionalLangs = ['en', 'es', 'pt', 'zh', 'fr', 'de', 'ar'];
      const langPrimary = ctx.langValue.toLowerCase().split('-')[0];

      if (multiRegionalLangs.includes(langPrimary) && !ctx.langValue.includes('-')) {
        return createResult(
          { id: 'i18n-lang-region', name: 'Language Region Specificity', category: 'technical', severity: 'info' },
          'info',
          `Consider using region-specific lang code (e.g., ${langPrimary}-US, ${langPrimary}-GB)`,
          {
            recommendation: 'For multi-regional languages, specify the region for better targeting',
            evidence: {
              found: ctx.langValue,
              expected: `${langPrimary}-XX (e.g., en-US, es-ES, pt-BR, zh-CN)`,
              impact: 'Helps search engines serve the right regional variant',
            },
          }
        );
      }
      return null;
    },
  },

  // ==========================================================================
  // Hreflang Language Mismatch
  // ==========================================================================
  {
    id: 'hreflang-language-mismatch',
    name: 'Hreflang Language Mismatch',
    category: 'technical',
    severity: 'warning',
    description: 'Hreflang language should match page content language',
    check: (ctx) => {
      if (!ctx.hreflangTags || !ctx.detectedLanguage) return null;

      const selfHreflang = ctx.hreflangTags.find(tag =>
        tag.href === ctx.url || tag.href === ctx.canonicalUrl
      );

      if (selfHreflang && ctx.detectedLanguage) {
        const hreflangLang = selfHreflang.lang.split('-')[0].toLowerCase();
        const detectedLang = ctx.detectedLanguage.toLowerCase();

        if (hreflangLang !== detectedLang && hreflangLang !== 'x-default') {
          return createResult(
            { id: 'hreflang-language-mismatch', name: 'Hreflang Language Mismatch', category: 'technical', severity: 'warning' },
            'warn',
            `Hreflang declares "${selfHreflang.lang}" but content appears to be "${ctx.detectedLanguage}"`,
            {
              recommendation: 'Verify the hreflang attribute matches the actual page language',
              evidence: {
                found: `hreflang="${selfHreflang.lang}"`,
                expected: `Content language: ${ctx.detectedLanguage}`,
                impact: 'Language mismatch may confuse search engines and affect international SEO'
              }
            }
          );
        }
      }

      return null;
    },
  },
];

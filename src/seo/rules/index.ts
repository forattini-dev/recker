/**
 * SEO Rules Index
 * Aggregates all rules into a single engine.
 */

import { SeoRule, RuleCategory, RuleSeverity, RuleContext, RuleResult } from './types.js';
import { metaRules } from './meta.js';
import { structuralRules } from './structural.js';
import { contentRules } from './content.js';
import { imageRules } from './images.js';
import { linkRules } from './links.js';
import { performanceRules } from './performance.js';
import { technicalRules } from './technical.js';
import { securityRules } from './security.js';
import { schemaRules } from './schema.js';
import { accessibilityRules } from './accessibility.js';
import { mobileRules } from './mobile.js';
import { i18nRules } from './i18n.js';
import { ecommerceRules } from './ecommerce.js';
import { localRules } from './local.js';
import { cwvRules } from './cwv.js';
import { crawlRules } from './crawl.js';
import { readabilityRules } from './readability.js';
import { pwaRules } from './pwa.js';
import { socialRules } from './social.js';
import { internalLinkingRules } from './internal-linking.js';
import { bestPracticesRules } from './best-practices.js';
// Advanced SEO rules
import { aiSearchRules } from './ai-search.js';
import { resourceRules } from './resources.js';
import { technicalAdvancedRules } from './technical-advanced.js';
import { redirectRules } from './redirects.js';
import { canonicalRules } from './canonical.js';
import { analyticsRules } from './analytics.js';

// Re-export types and thresholds
export * from './types.js';
export * from './thresholds.js';

// Aggregate all rules
export const ALL_SEO_RULES: SeoRule[] = [
  ...metaRules,
  ...structuralRules,
  ...contentRules,
  ...imageRules,
  ...linkRules,
  ...performanceRules,
  ...technicalRules,
  ...securityRules,
  ...schemaRules,
  ...accessibilityRules,
  ...mobileRules,
  ...i18nRules,
  ...ecommerceRules,
  ...localRules,
  ...cwvRules,
  ...crawlRules,
  ...readabilityRules,
  ...pwaRules,
  ...socialRules,
  ...internalLinkingRules,
  ...bestPracticesRules,
  // Advanced SEO rules
  ...aiSearchRules,
  ...resourceRules,
  ...technicalAdvancedRules,
  ...redirectRules,
  ...canonicalRules,
  ...analyticsRules,
];

// =============================================================================
// Scoring Weights
// =============================================================================

/**
 * Scoring weights by severity and category.
 * Higher weight = more impact on final score.
 */
export const SCORING_WEIGHTS = {
  // Severity weights (how much each status affects score)
  severity: {
    error: { pass: 10, fail: -15, warn: -10, info: 0 },
    warning: { pass: 5, fail: -8, warn: -5, info: 0 },
    info: { pass: 2, fail: -3, warn: -2, info: 0 },
  },
  // Category importance multipliers
  category: {
    title: 1.5, // Title is critical for SEO
    meta: 1.3, // Meta description important for CTR
    og: 1.0, // Social sharing
    twitter: 0.8, // Twitter cards
    headings: 1.2, // Content structure
    images: 1.0, // Image optimization
    links: 1.1, // Link quality
    content: 1.2, // Content quality
    technical: 1.3, // Technical SEO
    security: 0.9, // Security (indirect SEO impact)
    mobile: 1.2, // Mobile-first indexing
    'structured-data': 1.0, // Rich snippets
    performance: 1.4, // Core Web Vitals
    accessibility: 0.8, // Accessibility
    // Advanced categories
    'ai-search': 0.7, // AI/LLM optimization
    resources: 1.1, // Resource optimization
    crawlability: 1.3, // Crawlability issues
    canonicalization: 1.2, // Canonical URL issues
  } as Record<RuleCategory, number>,
} as const;

/**
 * Calculate weighted score from rule results
 */
export function calculateWeightedScore(results: RuleResult[]): {
  score: number;
  maxPossible: number;
  details: { category: RuleCategory; score: number; weight: number }[];
} {
  const categoryScores: Record<RuleCategory, { score: number; count: number }> = {} as any;

  for (const result of results) {
    const severityWeight = SCORING_WEIGHTS.severity[result.severity];
    const statusScore = severityWeight[result.status] ?? 0;

    if (!categoryScores[result.category]) {
      categoryScores[result.category] = { score: 0, count: 0 };
    }
    categoryScores[result.category].score += statusScore;
    categoryScores[result.category].count++;
  }

  let totalScore = 0;
  let totalWeight = 0;
  const details: { category: RuleCategory; score: number; weight: number }[] = [];

  for (const [cat, data] of Object.entries(categoryScores)) {
    const category = cat as RuleCategory;
    const categoryWeight = SCORING_WEIGHTS.category[category] ?? 1;
    const normalizedScore = data.count > 0 ? data.score / data.count : 0;
    const weightedScore = normalizedScore * categoryWeight;

    details.push({ category, score: normalizedScore, weight: categoryWeight });
    totalScore += weightedScore;
    totalWeight += categoryWeight;
  }

  // Normalize to 0-100 scale
  const maxPossible = 100;
  const baseScore = 70; // Start at 70, adjust based on results
  const adjustedScore = Math.max(0, Math.min(100, baseScore + totalScore));

  return { score: Math.round(adjustedScore), maxPossible, details };
}

// =============================================================================
// Rules Engine
// =============================================================================

export interface RulesEngineOptions {
  /** Categories to include (default: all) */
  categories?: RuleCategory[];
  /** Categories to exclude */
  excludeCategories?: RuleCategory[];
  /** Specific rule IDs to include */
  rules?: string[];
  /** Specific rule IDs to exclude */
  excludeRules?: string[];
  /** Minimum severity to include */
  minSeverity?: RuleSeverity;
}

export class SeoRulesEngine {
  private rules: SeoRule[];

  constructor(options: RulesEngineOptions = {}) {
    let rules = [...ALL_SEO_RULES];

    // Filter by categories
    if (options.categories?.length) {
      rules = rules.filter((r) => options.categories!.includes(r.category));
    }
    if (options.excludeCategories?.length) {
      rules = rules.filter((r) => !options.excludeCategories!.includes(r.category));
    }

    // Filter by specific rules
    if (options.rules?.length) {
      rules = rules.filter((r) => options.rules!.includes(r.id));
    }
    if (options.excludeRules?.length) {
      rules = rules.filter((r) => !options.excludeRules!.includes(r.id));
    }

    // Filter by severity
    if (options.minSeverity) {
      const severityOrder: RuleSeverity[] = ['info', 'warning', 'error'];
      const minIndex = severityOrder.indexOf(options.minSeverity);
      rules = rules.filter((r) => severityOrder.indexOf(r.severity) >= minIndex);
    }

    this.rules = rules;
  }

  /**
   * Run all rules against the context
   */
  evaluate(context: RuleContext): RuleResult[] {
    const results: RuleResult[] = [];

    for (const rule of this.rules) {
      const result = rule.check(context);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Get all available rules
   */
  getRules(): SeoRule[] {
    return [...this.rules];
  }

  /**
   * Get rules by category
   */
  getRulesByCategory(category: RuleCategory): SeoRule[] {
    return this.rules.filter((r) => r.category === category);
  }

  /**
   * Get unique categories
   */
  getCategories(): RuleCategory[] {
    return [...new Set(this.rules.map((r) => r.category))];
  }
}

/**
 * Create a rules engine with default configuration
 */
export function createRulesEngine(options?: RulesEngineOptions): SeoRulesEngine {
  return new SeoRulesEngine(options);
}

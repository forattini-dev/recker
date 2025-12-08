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
// mobileRules are empty for now, but imported for completeness
import { mobileRules } from './mobile.js';

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
];

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

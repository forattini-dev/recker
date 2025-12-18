/**
 * MCP Tool Profiles
 *
 * Profiles allow filtering which tools are exposed to AI agents,
 * helping manage context size and focus tool availability.
 *
 * @example
 * ```bash
 * # Start with minimal profile (docs + basic network)
 * recker mcp --profile=minimal
 *
 * # Combine profiles
 * recker mcp --profile=minimal,seo,security
 *
 * # Use all tools
 * recker mcp --profile=full
 * ```
 */

/**
 * Available profile names
 */
export type ProfileName =
  | 'minimal'
  | 'docs'
  | 'network'
  | 'dns'
  | 'seo'
  | 'security'
  | 'scrape'
  | 'video'
  | 'ai'
  | 'full';

/**
 * Profile definition with tool patterns
 */
export interface Profile {
  /** Profile name */
  name: ProfileName;
  /** Human-readable description */
  description: string;
  /** Tool name patterns (supports * wildcard) */
  tools: string[];
  /** Estimated context cost in tokens */
  estimatedTokens: number;
}

/**
 * All available profiles
 */
export const profiles: Record<ProfileName, Profile> = {
  /**
   * Minimal profile - Essential tools only
   * Best for: Quick lookups, basic network checks
   */
  minimal: {
    name: 'minimal',
    description: 'Essential tools only (docs + basic network)',
    tools: [
      'rek_search_docs',
      'rek_get_doc',
      'rek_http_request',
      'rek_dns',
      'rek_ping',
      'rek_ip_lookup',
    ],
    estimatedTokens: 2000,
  },

  /**
   * Documentation profile - All documentation tools
   * Best for: Learning Recker, finding examples
   */
  docs: {
    name: 'docs',
    description: 'Documentation and code examples',
    tools: [
      'rek_search_docs',
      'rek_get_doc',
      'rek_code_examples',
      'rek_api_schema',
      'rek_suggest',
    ],
    estimatedTokens: 1500,
  },

  /**
   * Network profile - HTTP, DNS basics, TLS, WHOIS
   * Best for: Network diagnostics, API testing
   */
  network: {
    name: 'network',
    description: 'HTTP requests, DNS, TLS, WHOIS, ping',
    tools: [
      'rek_http_request',
      'rek_dns',
      'rek_dns_dig',
      'rek_tls',
      'rek_whois',
      'rek_rdap',
      'rek_ping',
      'rek_ip_lookup',
    ],
    estimatedTokens: 2500,
  },

  /**
   * DNS profile - All DNS-related tools
   * Best for: DNS debugging, email security validation
   */
  dns: {
    name: 'dns',
    description: 'All DNS tools including email security',
    tools: [
      'rek_dns',
      'rek_dns_propagate',
      'rek_dns_health',
      'rek_dns_spf',
      'rek_dns_dmarc',
      'rek_dns_dkim',
      'rek_dns_dig',
      'rek_dns_system',
      'rek_dns_toolkit',
    ],
    estimatedTokens: 3000,
  },

  /**
   * SEO profile - SEO analysis tools
   * Best for: Website optimization, content analysis
   */
  seo: {
    name: 'seo',
    description: 'SEO analysis, spider, quick wins',
    tools: [
      'rek_seo_analyze',
      'rek_seo_spider',
      'rek_seo_quick_wins',
      'rek_scrape', // Often needed with SEO
    ],
    estimatedTokens: 2000,
  },

  /**
   * Security profile - Security analysis tools
   * Best for: Security audits, TLS inspection
   */
  security: {
    name: 'security',
    description: 'TLS inspection, security headers, GeoIP',
    tools: [
      'rek_tls_inspect',
      'rek_rdap_lookup',
      'rek_geoip_lookup',
      'rek_security_headers',
      'rek_dns_toolkit',
    ],
    estimatedTokens: 1800,
  },

  /**
   * Scrape profile - Web scraping
   * Best for: Data extraction, content analysis
   */
  scrape: {
    name: 'scrape',
    description: 'Web scraping with CSS selectors',
    tools: [
      'rek_scrape',
      'rek_http_request', // Needed for fetching pages
    ],
    estimatedTokens: 800,
  },

  /**
   * Video profile - Video/audio extraction from 35+ platforms
   * Best for: Media extraction, video info, format selection
   */
  video: {
    name: 'video',
    description: 'Video/audio extraction from 35+ platforms',
    tools: [
      'rek_video_info',
      'rek_video_formats',
      'rek_video_check',
      'rek_video_extractors',
      'rek_video_url',
    ],
    estimatedTokens: 1500,
  },

  /**
   * AI profile - Multi-provider AI chat and embeddings
   * Best for: AI integration, LLM calls, embeddings
   */
  ai: {
    name: 'ai',
    description: 'Multi-provider AI chat and embeddings',
    tools: [
      'rek_ai_chat',
      'rek_ai_embed',
      'rek_ai_providers',
      'rek_ai_tokens',
    ],
    estimatedTokens: 1200,
  },

  /**
   * Full profile - All available tools
   * Warning: High context cost (~12K tokens with video+ai)
   */
  full: {
    name: 'full',
    description: 'All available tools (high context cost)',
    tools: ['*'], // Wildcard for all tools
    estimatedTokens: 12000,
  },
};

/**
 * Default profile when none specified
 */
export const DEFAULT_PROFILE: ProfileName = 'minimal';

/**
 * Resolve profile names to tool patterns
 *
 * @param profileNames - Comma-separated profile names or array
 * @returns Array of tool patterns to include
 */
export function resolveProfiles(profileNames: string | string[]): string[] {
  const names = Array.isArray(profileNames)
    ? profileNames
    : profileNames.split(',').map((p) => p.trim().toLowerCase());

  const toolSet = new Set<string>();

  for (const name of names) {
    const profile = profiles[name as ProfileName];
    if (!profile) {
      throw new Error(
        `Unknown profile: ${name}. Available: ${Object.keys(profiles).join(', ')}`
      );
    }

    for (const tool of profile.tools) {
      toolSet.add(tool);
    }
  }

  return Array.from(toolSet);
}

/**
 * Check if a tool name matches any pattern in the list
 *
 * @param toolName - Tool name to check
 * @param patterns - List of patterns (supports * wildcard)
 * @returns true if tool matches any pattern
 */
export function matchesPattern(toolName: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern === '*') return true;
    if (pattern === toolName) return true;

    // Simple wildcard support (e.g., "rek_dns_*")
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*') + '$'
      );
      if (regex.test(toolName)) return true;
    }
  }
  return false;
}

/**
 * Get estimated token cost for a set of profiles
 *
 * @param profileNames - Profile names to calculate
 * @returns Estimated token count
 */
export function estimateProfileTokens(profileNames: string | string[]): number {
  const names = Array.isArray(profileNames)
    ? profileNames
    : profileNames.split(',').map((p) => p.trim().toLowerCase());

  // Deduplicate tools and sum unique token costs
  const seenTools = new Set<string>();
  let totalTokens = 0;

  for (const name of names) {
    const profile = profiles[name as ProfileName];
    if (!profile) continue;

    // For 'full', just return its estimate
    if (profile.tools.includes('*')) {
      return profile.estimatedTokens;
    }

    for (const tool of profile.tools) {
      if (!seenTools.has(tool)) {
        seenTools.add(tool);
        // Estimate ~300 tokens per tool definition
        totalTokens += 300;
      }
    }
  }

  return totalTokens;
}

/**
 * List all available profiles with descriptions
 */
export function listProfiles(): Array<{
  name: ProfileName;
  description: string;
  toolCount: number;
  estimatedTokens: number;
}> {
  return Object.values(profiles).map((p) => ({
    name: p.name,
    description: p.description,
    toolCount: p.tools.includes('*') ? -1 : p.tools.length,
    estimatedTokens: p.estimatedTokens,
  }));
}

/**
 * Get profile details including tool list
 */
export function getProfile(name: ProfileName): Profile | undefined {
  return profiles[name];
}

/**
 * Validate profile names
 */
export function validateProfiles(names: string[]): {
  valid: boolean;
  invalid: string[];
} {
  const invalid = names.filter((n) => !profiles[n as ProfileName]);
  return {
    valid: invalid.length === 0,
    invalid,
  };
}

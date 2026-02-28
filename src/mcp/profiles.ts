/**
 * MCP Tool Categories
 *
 * Categories allow filtering which tools are exposed to AI agents,
 * helping manage context size and focus tool availability.
 *
 * @example
 * ```bash
 * # Start with minimal category (docs + basic network)
 * recker mcp --category=minimal
 *
 * # Combine categories
 * recker mcp --category=minimal,seo,security
 *
 * # Use all tools
 * recker mcp --category=full
 * ```
 */

import { ValidationError } from '../core/errors.js';

/**
 * Available category names
 */
export type CategoryName =
  | 'minimal'
  | 'docs'
  | 'network'
  | 'dns'
  | 'seo'
  | 'security'
  | 'scrape'
  | 'video'
  | 'ai'
  | 'protocols'
  | 'parsing'
  | 'streaming'
  | 'template'
  | 'full';

/**
 * Category definition with tool patterns
 */
export interface Category {
  /** Category name */
  name: CategoryName;
  /** Human-readable description */
  description: string;
  /** Tool name patterns (supports * wildcard) */
  tools: string[];
  /** Estimated context cost in tokens */
  estimatedTokens: number;
  /** Emoji icon for display */
  icon?: string;
}

/**
 * All available categories
 */
export const categories: Record<CategoryName, Category> = {
  /**
   * Minimal category - Essential tools only
   * Best for: Quick lookups, basic network checks
   */
  minimal: {
    name: 'minimal',
    description: 'Essential tools only (docs + basic network + site audit)',
    icon: '⚡',
    tools: [
      'rek_search_docs',
      'rek_get_doc',
      'rek_http_request',
      'rek_dns',
      'rek_ping',
      'rek_ip_lookup',
      'rek_site_audit',  // Quick all-in-one site check
    ],
    estimatedTokens: 2500,
  },

  /**
   * Documentation category - All documentation tools
   * Best for: Learning Recker, finding examples
   */
  docs: {
    name: 'docs',
    description: 'Documentation, code examples, and migration tools',
    icon: '📚',
    tools: [
      'rek_search_docs',
      'rek_get_doc',
      'rek_code_examples',
      'rek_api_schema',
      'rek_suggest',
      'rek_curl_convert', // Helps migrate from curl
    ],
    estimatedTokens: 1800,
  },

  /**
   * Network category - HTTP, DNS basics, TLS, WHOIS
   * Best for: Network diagnostics, API testing
   */
  network: {
    name: 'network',
    description: 'HTTP requests, DNS, TLS, WHOIS, ping, API tools',
    icon: '🌐',
    tools: [
      'rek_http_request',
      'rek_dns',
      'rek_dns_dig',
      'rek_tls',
      'rek_whois',
      'rek_rdap',
      'rek_ping',
      'rek_ip_lookup',
      'rek_curl_convert', // Convert curl to Recker
      'rek_api_compare', // Compare two API responses
      'rek_load_test', // Simple load testing
    ],
    estimatedTokens: 3500,
  },

  /**
   * DNS category - All DNS-related tools
   * Best for: DNS debugging, email security validation
   */
  dns: {
    name: 'dns',
    description: 'All DNS tools including email security',
    icon: '🔗',
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
   * SEO category - SEO analysis tools
   * Best for: Website optimization, content analysis
   */
  seo: {
    name: 'seo',
    description: 'SEO analysis, spider, quick wins, sitemap, schema',
    icon: '🔍',
    tools: [
      'rek_site_audit',  // Quick SEO check
      'rek_seo_analyze',
      'rek_seo_spider',
      'rek_seo_quick_wins',
      'rek_seo_sitemap',
      'rek_seo_schema',
      'rek_scrape', // Often needed with SEO
    ],
    estimatedTokens: 2800,
  },

  /**
   * Security category - Security analysis tools
   * Best for: Security audits, TLS inspection
   */
  security: {
    name: 'security',
    description: 'TLS inspection, security headers, GeoIP, domain audit',
    icon: '🔒',
    tools: [
      'rek_tls_inspect',
      'rek_rdap_lookup',
      'rek_geoip_lookup',
      'rek_security_headers',
      'rek_dns_toolkit',
      'rek_domain_audit', // Comprehensive domain check
    ],
    estimatedTokens: 2200,
  },

  /**
   * Scrape category - Web scraping
   * Best for: Data extraction, content analysis
   */
  scrape: {
    name: 'scrape',
    description: 'Web scraping with CSS selectors',
    icon: '🕷️',
    tools: [
      'rek_scrape',
      'rek_http_request', // Needed for fetching pages
    ],
    estimatedTokens: 800,
  },

  /**
   * Video category - Video/audio extraction from 35+ platforms
   * Best for: Media extraction, video info, format selection
   */
  video: {
    name: 'video',
    description: 'Video/audio extraction from 35+ platforms',
    icon: '🎬',
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
   * AI category - Multi-provider AI chat and embeddings
   * Best for: AI integration, LLM calls, embeddings
   */
  ai: {
    name: 'ai',
    description: 'Multi-provider AI chat and comparison',
    icon: '🤖',
    tools: [
      'rek_ai_chat',
      'rek_ai_providers',
      'rek_ai_tokens',
      'rek_ai_compare', // Compare responses across providers
    ],
    estimatedTokens: 1500,
  },

  /**
   * Protocols category - FTP, SFTP, Telnet, WebSocket
   * Best for: File transfer, remote connections, real-time communication
   */
  protocols: {
    name: 'protocols',
    description: 'FTP, SFTP, Telnet, WebSocket protocols',
    icon: '📡',
    tools: [
      'rek_ftp_connect',
      'rek_ftp_download',
      'rek_sftp_connect',
      'rek_sftp_download',
      'rek_telnet_connect',
      'rek_websocket_connect',
      'rek_websocket_ping',
    ],
    estimatedTokens: 2100,
  },

  /**
   * Parsing category - GraphQL, JSON-RPC, CSV, YAML, XML
   * Best for: API interactions, data transformation, format conversion
   */
  parsing: {
    name: 'parsing',
    description: 'GraphQL, JSON-RPC, CSV, YAML, XML parsing',
    icon: '📄',
    tools: [
      'rek_graphql_query',
      'rek_graphql_introspect',
      'rek_jsonrpc_call',
      'rek_jsonrpc_batch',
      'rek_csv_parse',
      'rek_csv_serialize',
      'rek_yaml_parse',
      'rek_yaml_serialize',
      'rek_xml_parse',
      'rek_xml_serialize',
    ],
    estimatedTokens: 3000,
  },

  /**
   * Streaming category - HLS and other streaming protocols
   * Best for: Video streaming, live content, media analysis
   */
  streaming: {
    name: 'streaming',
    description: 'HLS streaming analysis and download',
    icon: '📺',
    tools: [
      'rek_hls_info',
      'rek_hls_variants',
      'rek_hls_download',
    ],
    estimatedTokens: 900,
  },

  /**
   * Template category - Template rendering and validation
   * Best for: HTML/text templating, reusable payload generation, and validation
   */
  template: {
    name: 'template',
    description: 'Template rendering, validation, parsing, and helper metadata',
    icon: '📝',
    tools: [
      'rek_template_render',
      'rek_template_validate',
      'rek_template_parse',
      'rek_template_variables',
      'rek_template_check',
      'rek_template_helpers',
    ],
    estimatedTokens: 1800,
  },

  /**
 * Full category - All available tools
 * Warning: High context cost (estimated from profile exposure)
 */
  full: {
    name: 'full',
    description: 'All available tools (high context cost)',
    icon: '🌟',
    tools: ['*'], // Wildcard for all tools
    estimatedTokens: 0,
  },
};

function getAllConcreteProfileTools(): Set<string> {
  const toolNames = new Set<string>();

  for (const category of Object.values(categories)) {
    for (const tool of category.tools) {
      if (tool !== '*') {
        toolNames.add(tool);
      }
    }
  }

  return toolNames;
}

/**
 * Default category when none specified
 */
export const DEFAULT_CATEGORY: CategoryName = 'minimal';

// Legacy aliases for backwards compatibility
export type ProfileName = CategoryName;
export type Profile = Category;
export const profiles = categories;
export const DEFAULT_PROFILE = DEFAULT_CATEGORY;

/**
 * Resolve category names to tool patterns
 *
 * @param categoryNames - Comma-separated category names or array
 * @returns Array of tool patterns to include
 */
export function resolveCategories(categoryNames: string | string[]): string[] {
  const names = Array.isArray(categoryNames)
    ? categoryNames
    : categoryNames.split(',').map((p) => p.trim().toLowerCase());

  const toolSet = new Set<string>();

  for (const name of names) {
    const category = categories[name as CategoryName];
    if (!category) {
      throw new ValidationError(`Unknown category: ${name}.`, {
        field: 'categoryNames',
        value: name,
      });
    }

    for (const tool of category.tools) {
      toolSet.add(tool);
    }
  }

  return Array.from(toolSet);
}

// Legacy alias
export const resolveProfiles = resolveCategories;

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
 * Get estimated token cost for a set of categories
 *
 * @param categoryNames - Category names to calculate
 * @returns Estimated token count
 */
export function estimateCategoryTokens(categoryNames: string | string[]): number {
  const names = Array.isArray(categoryNames)
    ? categoryNames
    : categoryNames.split(',').map((p) => p.trim().toLowerCase());

  // Deduplicate tools and sum unique token costs
  const seenTools = new Set<string>();
  let totalTokens = 0;

  for (const name of names) {
    const category = categories[name as CategoryName];
    if (!category) continue;

    // For 'full', just return its estimate
    if (category.tools.includes('*')) {
      return getAllConcreteProfileTools().size * 300;
    }

    for (const tool of category.tools) {
      if (!seenTools.has(tool)) {
        seenTools.add(tool);
        // Estimate ~300 tokens per tool definition
        totalTokens += 300;
      }
    }
  }

  return totalTokens;
}

// Legacy alias
export const estimateProfileTokens = estimateCategoryTokens;

/**
 * List all available categories with descriptions
 */
export function listCategories(): Array<{
  name: CategoryName;
  description: string;
  icon?: string;
  toolCount: number;
  estimatedTokens: number;
}> {
  const toolCount = getAllConcreteProfileTools().size;
  return Object.values(categories).map((p) => ({
    name: p.name,
    description: p.description,
    icon: p.icon,
    toolCount: p.tools.includes('*') ? toolCount : p.tools.length,
    estimatedTokens: p.estimatedTokens || (p.tools.includes('*') ? toolCount * 300 : p.tools.length * 300),
  }));
}

// Legacy alias
export const listProfiles = listCategories;

/**
 * Get category details including tool list
 */
export function getCategory(name: CategoryName): Category | undefined {
  return categories[name];
}

// Legacy alias
export const getProfile = getCategory;

/**
 * Validate category names
 */
export function validateCategories(names: string[]): {
  valid: boolean;
  invalid: string[];
} {
  const invalid = names.filter((n) => !categories[n as CategoryName]);
  return {
    valid: invalid.length === 0,
    invalid,
  };
}

// Legacy alias
export const validateProfiles = validateCategories;

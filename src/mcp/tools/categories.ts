/**
 * Tool Category Mapping
 *
 * Maps individual tools to their semantic categories for UI display.
 * This is separate from the category presets in profiles.ts which define
 * which tools to include when using --category=xyz.
 *
 * This file provides:
 * - Individual tool → category mapping for display
 * - Category metadata (icons, descriptions)
 * - Helper functions for getting a tool's category
 */

import {
  listCategories as listCategoryPresets,
  type CategoryName
} from '../profiles.js';

/**
 * Semantic category for individual tools (used for UI display)
 */
export type ToolCategory =
  | 'docs'      // Documentation and examples
  | 'network'   // HTTP, DNS, ping, TLS
  | 'seo'       // SEO analysis and optimization
  | 'security'  // Security headers, TLS inspection
  | 'ai'        // AI provider tools
  | 'scraping'  // Web scraping
  | 'media'     // Video/audio tools
  | 'protocols' // FTP, SFTP, Telnet, WebSocket
  | 'parsing'   // CSV, YAML, XML, GraphQL
  | 'streaming' // HLS, SSE
  | 'template'  // Template rendering and parsing
  | 'unified'   // Consolidated multi-purpose tools
  | 'utilities'; // General utilities

export interface CategoryInfo {
  name: ToolCategory;
  description: string;
  icon: string;
  toolCount?: number;
}

/**
 * Category metadata for UI display
 */
export const categoryMetadata: Record<ToolCategory, Omit<CategoryInfo, 'toolCount'>> = {
  docs: {
    name: 'docs',
    description: 'Documentation search, code examples, and API reference',
    icon: '📚',
  },
  network: {
    name: 'network',
    description: 'HTTP requests, DNS lookups, ping, WHOIS, and connectivity tools',
    icon: '🌐',
  },
  seo: {
    name: 'seo',
    description: 'SEO analysis, sitemap validation, schema extraction, and optimization',
    icon: '🔍',
  },
  security: {
    name: 'security',
    description: 'Security headers analysis, TLS inspection, and vulnerability checks',
    icon: '🔒',
  },
  ai: {
    name: 'ai',
    description: 'AI provider comparison, model selection, and prompt tools',
    icon: '🤖',
  },
  scraping: {
    name: 'scraping',
    description: 'Web scraping, data extraction, and content parsing',
    icon: '🕷️',
  },
  media: {
    name: 'media',
    description: 'Video info, format detection, and media analysis',
    icon: '🎬',
  },
  protocols: {
    name: 'protocols',
    description: 'FTP, SFTP, Telnet, WebSocket protocols',
    icon: '📡',
  },
  parsing: {
    name: 'parsing',
    description: 'CSV, YAML, XML, GraphQL, JSON-RPC parsing',
    icon: '📄',
  },
  streaming: {
    name: 'streaming',
    description: 'HLS streaming, SSE, real-time content',
    icon: '📺',
  },
  template: {
    name: 'template',
    description: 'Template rendering, validation, and parsing tools',
    icon: '📝',
  },
  unified: {
    name: 'unified',
    description: 'Consolidated tools combining multiple functionalities',
    icon: '⚡',
  },
  utilities: {
    name: 'utilities',
    description: 'General purpose utilities and helpers',
    icon: '🛠️',
  },
};

/**
 * Tool to category mapping
 * Tools not in this map default to 'utilities'
 */
export const toolCategories: Record<string, ToolCategory> = {
  // Docs
  rek_search_docs: 'docs',
  rek_get_doc: 'docs',
  rek_code_examples: 'docs',
  rek_api_schema: 'docs',
  rek_suggest: 'docs',

  // Network
  rek_http_request: 'network',
  rek_dns: 'network',
  rek_dns_propagate: 'network',
  rek_dns_health: 'network',
  rek_dns_spf: 'network',
  rek_dns_dmarc: 'network',
  rek_dns_dkim: 'network',
  rek_dns_dig: 'network',
  rek_dns_system: 'network',
  rek_dns_toolkit: 'network',
  rek_ping: 'network',
  rek_whois: 'network',
  rek_rdap: 'network',
  rek_rdap_lookup: 'network',
  rek_ip_lookup: 'network',
  rek_geoip_lookup: 'network',
  rek_tls: 'network',

  // SEO
  rek_seo_analyze: 'seo',
  rek_seo_spider: 'seo',
  rek_seo_quick_wins: 'seo',
  rek_seo_sitemap: 'seo',
  rek_seo_schema: 'seo',

  // Security
  rek_tls_inspect: 'security',
  rek_security_headers: 'security',

  // AI
  rek_ai_chat: 'ai',
  rek_ai_embed: 'ai',
  rek_ai_providers: 'ai',
  rek_ai_tokens: 'ai',
  rek_ai_compare: 'ai',

  // Scraping
  rek_scrape: 'scraping',

  // Media
  rek_video_info: 'media',
  rek_video_formats: 'media',
  rek_video_check: 'media',
  rek_video_extractors: 'media',
  rek_video_url: 'media',

  // Protocols
  rek_ftp_connect: 'protocols',
  rek_ftp_download: 'protocols',
  rek_sftp_connect: 'protocols',
  rek_sftp_download: 'protocols',
  rek_telnet_connect: 'protocols',
  rek_websocket_connect: 'protocols',
  rek_websocket_ping: 'protocols',

  // Parsing
  rek_graphql_query: 'parsing',
  rek_graphql_introspect: 'parsing',
  rek_jsonrpc_call: 'parsing',
  rek_jsonrpc_batch: 'parsing',
  rek_csv_parse: 'parsing',
  rek_csv_serialize: 'parsing',
  rek_yaml_parse: 'parsing',
  rek_yaml_serialize: 'parsing',
  rek_xml_parse: 'parsing',
  rek_xml_serialize: 'parsing',

  // Streaming
  rek_hls_info: 'streaming',
  rek_hls_variants: 'streaming',
  rek_hls_download: 'streaming',
  rek_sse_listen: 'streaming',

  // Unified (consolidated tools)
  rek_domain_audit: 'unified',
  rek_curl_convert: 'unified',
  rek_api_compare: 'unified',
  rek_load_test: 'unified',

  // Template
  rek_template_render: 'template',
  rek_template_validate: 'template',
  rek_template_parse: 'template',
  rek_template_variables: 'template',
  rek_template_check: 'template',
  rek_template_helpers: 'template',
};

/**
 * Get semantic category for a tool (for UI display)
 */
export function getToolCategory(toolName: string): ToolCategory {
  return toolCategories[toolName] || 'utilities';
}

/**
 * Get all tools in a semantic category
 */
export function getToolsInCategory(category: ToolCategory): string[] {
  return Object.entries(toolCategories)
    .filter(([_, cat]) => cat === category)
    .map(([name]) => name);
}

/**
 * List all semantic categories with tool counts
 * Note: For filter presets, use listCategories from profiles.ts
 */
export function listCategories(): CategoryInfo[] {
  const counts: Record<ToolCategory, number> = {
    docs: 0,
    network: 0,
    seo: 0,
    security: 0,
    ai: 0,
    scraping: 0,
    media: 0,
    protocols: 0,
    parsing: 0,
    streaming: 0,
    template: 0,
    unified: 0,
    utilities: 0,
  };

  // Count mapped tools
  for (const cat of Object.values(toolCategories)) {
    counts[cat]++;
  }

  return Object.values(categoryMetadata).map(cat => ({
    ...cat,
    toolCount: counts[cat.name],
  }));
}

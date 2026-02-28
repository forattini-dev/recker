/**
 * SEO Commands (Unified)
 *
 * Barrel file — re-exports all SEO handlers and types, and defines seoCommands.
 * Split into focused sub-files for maintainability:
 *   seo-serp.ts     — SERP types, campaign builder, formatters
 *   seo-analyze.ts  — single-page SEO analysis handler
 *   seo-spider.ts   — full-site crawler handler
 *   seo-robots.ts   — robots.txt handler
 *   seo-sitemap.ts  — sitemap.xml handler
 */

import type { RekCommandDefinition } from '../handler-types.js'
import { parseSpiderSerpConfig } from '../utils/serp-config.js'

// ── Sub-module re-exports ─────────────────────────────────────────────────────

export type {
  SerpSeedPage,
  SeoCrawlerSerpConfig,
  SeoCrawlerSerpPlan,
  SeoCrawlerSerpRun,
} from './seo-serp.js'
export {
  normalizeUrl,
  extractDomain,
  buildSerpCampaignSeeds,
  runCrawlerSerpCampaign,
  formatSerpSummaryRows,
  getSerpComparisonRows,
  getSerpCompetitorRows,
  formatKeywordList,
} from './seo-serp.js'

export { seoAnalyzeHandler } from './seo-analyze.js'
export { spiderHandler } from './seo-spider.js'
export { robotsHandler } from './seo-robots.js'
export { sitemapHandler } from './seo-sitemap.js'

// Backward-compat alias
export { parseSpiderSerpConfig as parseSeoCrawlerSerpConfig }

// ── Command Definitions ───────────────────────────────────────────────────────

import { seoAnalyzeHandler } from './seo-analyze.js'
import { spiderHandler } from './seo-spider.js'
import { robotsHandler } from './seo-robots.js'
import { sitemapHandler } from './seo-sitemap.js'

export const seoCommands: RekCommandDefinition = {
  description: 'SEO analysis and web crawling tools',
  category: 'analysis',
  tuiEnabled: true,
  commands: {
    analyze: {
      description: 'Analyze SEO for a URL',
      aliases: ['check', 'audit'],
      positional: [
        { name: 'url', required: false, description: 'URL to analyze (uses base URL if not provided)' }
      ],
      options: {
        all: {
          short: 'a',
          type: 'boolean',
          description: 'Show all checks (including passed)'
        },
        json: {
          type: 'boolean',
          description: 'Output raw JSON'
        },
        output: {
          short: 'o',
          type: 'string',
          description: 'Save report to file'
        },
        outputDir: {
          short: 'O',
          type: 'string',
          description: 'Save to directory (auto-generates filename)'
        },
        category: {
          type: 'string',
          description: 'Filter by category (performance, security, content, etc.)'
        },
        serp: {
          type: 'boolean',
          description: 'Run SERP checks for extracted top keywords'
        },
        'serp-top-keywords': {
          default: 5,
          type: 'number',
          description: 'Top keywords per page used to seed SERP'
        },
        'serp-query-limit': {
          default: 10,
          type: 'number',
          description: 'Number of keywords to query on SERP'
        },
        'serp-results-per-query': {
          default: 10,
          type: 'number',
          description: 'SERP results fetched per query'
        },
        'serp-concurrency': {
          default: 1,
          type: 'number',
          description: 'Number of SERP queries to execute in parallel'
        },
        'serp-delay-ms': {
          default: 1200,
          type: 'number',
          description: 'Delay in ms between SERP queries'
        },
        'serp-delay-jitter-ms': {
          default: 450,
          type: 'number',
          description: 'Random delay jitter in ms between SERP queries'
        },
        'serp-max-consecutive-blocks': {
          default: 3,
          type: 'number',
          description: 'Stop campaign after this many blocked/captcha responses in a row'
        },
        'serp-captcha-cooldown-ms': {
          default: 2400,
          type: 'number',
          description: 'Cooldown in ms after captcha before continuing SERP'
        },
        'serp-retry-count': {
          default: 1,
          type: 'number',
          description: 'Retry count per SERP query'
        },
        'serp-retry-delay-ms': {
          default: 1200,
          type: 'number',
          description: 'Base retry delay in ms for SERP queries'
        },
        'serp-gl': {
          type: 'string',
          description: 'Google gl parameter'
        },
        'serp-hl': {
          type: 'string',
          description: 'Google hl parameter'
        },
        'serp-transport': {
          type: 'string',
          default: 'curl',
          description: 'Search transport (auto | undici | curl)'
        },
        'serp-timeout': {
          type: 'number',
          description: 'SERP request timeout in ms'
        },
        'serp-country': {
          type: 'string',
          description: 'Country code for SERP analysis'
        },
      },
      examples: [
        { cmd: 'rek seo analyze google.com', desc: 'Analyze Google homepage' },
        { cmd: 'rek seo analyze example.com --all', desc: 'Show all checks' },
        { cmd: 'rek seo analyze example.com -o report.json', desc: 'Save to file' },
        { cmd: 'rek seo analyze google.com --serp', desc: 'Run SERP checks for this page' },
        { cmd: 'rek seo analyze google.com --serp --serp-top-keywords 12 --serp-query-limit 10', desc: 'Run SERP with custom limits' },
      ],
      handler: seoAnalyzeHandler
    },
    spider: {
      description: 'Crawl a website',
      aliases: ['crawl'],
      positional: [
        { name: 'url', required: true, description: 'Starting URL to crawl' }
      ],
      options: {
        depth: {
          short: 'd',
          type: 'number',
          default: 5,
          description: 'Max link depth'
        },
        limit: {
          short: 'l',
          type: 'number',
          default: 100,
          description: 'Max pages to crawl'
        },
        concurrency: {
          short: 'c',
          type: 'number',
          default: 5,
          description: 'Parallel requests'
        },
        seo: {
          short: 'S',
          type: 'boolean',
          description: 'Enable SEO analysis per page'
        },
        robots: {
          short: 'r',
          type: 'boolean',
          description: 'Respect robots.txt'
        },
        json: {
          type: 'boolean',
          description: 'Output JSON'
        },
        jsonl: {
          short: 'L',
          type: 'boolean',
          description: 'Stream output as JSONL'
        },
        output: {
          short: 'o',
          type: 'string',
          description: 'Save JSON report to file'
        },
        outputDir: {
          short: 'O',
          type: 'string',
          description: 'Save to directory (auto-generates filename)'
        },
        extract: {
          short: 'E',
          type: 'array',
          description: 'CSS selectors to extract'
        },
        include: {
          type: 'array',
          description: 'URL pattern to include (regex)'
        },
        exclude: {
          type: 'array',
          description: 'URL pattern to exclude (regex)'
        },
        focus: {
          type: 'string',
          description: 'Focus mode: links, duplicates, security, ai'
        },
        serp: {
          type: 'boolean',
          description: 'Run SERP checks for extracted top keywords'
        },
        'serp-country': {
          type: 'string',
          description: 'Country code for SERP analysis'
        },
        'serp-region': {
          type: 'string',
          description: 'Region code for SERP'
        },
        'serp-gl': {
          type: 'string',
          description: 'Google gl parameter'
        },
        'serp-hl': {
          type: 'string',
          description: 'Google hl parameter'
        },
        'serp-transport': {
          type: 'string',
          default: 'curl',
          description: 'Search transport (auto | undici | curl)'
        },
        'serp-timeout': {
          type: 'number',
          description: 'SERP request timeout in ms'
        },
        'serp-top-keywords': {
          default: 5,
          type: 'number',
          description: 'Top keywords per page used to seed SERP'
        },
        'serp-query-limit': {
          default: 10,
          type: 'number',
          description: 'Number of keywords to query on SERP'
        },
        'serp-results-per-query': {
          default: 10,
          type: 'number',
          description: 'SERP results fetched per query'
        },
        'serp-concurrency': {
          default: 1,
          type: 'number',
          description: 'Number of SERP queries to execute in parallel'
        },
        'serp-delay-ms': {
          default: 1200,
          type: 'number',
          description: 'Delay in ms between SERP queries'
        },
        'serp-delay-jitter-ms': {
          default: 450,
          type: 'number',
          description: 'Random delay jitter in ms between SERP queries'
        },
        'serp-max-consecutive-blocks': {
          default: 3,
          type: 'number',
          description: 'Stop campaign after this many blocked/captcha responses in a row'
        },
        'serp-captcha-cooldown-ms': {
          default: 2400,
          type: 'number',
          description: 'Cooldown in ms after captcha before continuing SERP'
        },
        'serp-retry-count': {
          default: 1,
          type: 'number',
          description: 'Retry count per SERP query'
        },
        'serp-retry-delay-ms': {
          default: 1200,
          type: 'number',
          description: 'Base retry delay in ms for SERP queries'
        },
        'serp-safe': {
          type: 'string',
          description: 'Safe search level (active | images | strict)'
        },
        'serp-lr': {
          type: 'string',
          description: 'Google language restrict parameter'
        },
        'serp-cr': {
          type: 'string',
          description: 'Google country restrict parameter'
        },
        'serp-tbs': {
          type: 'string',
          description: 'Google result filter params'
        },
        'serp-tbm': {
          type: 'string',
          description: 'Google search type (shop, news, images, etc.)'
        },
        'serp-as-q': {
          type: 'string',
          description: 'SERP as_q parameter'
        },
        'serp-as-epq': {
          type: 'string',
          description: 'SERP as_epq parameter'
        },
        'serp-as-oq': {
          type: 'string',
          description: 'SERP as_oq parameter'
        },
        'serp-as-eq': {
          type: 'string',
          description: 'SERP as_eq parameter'
        },
        'serp-as-sitesearch': {
          type: 'string',
          description: 'SERP as_sitesearch parameter'
        },
        'serp-as-filetype': {
          type: 'string',
          description: 'SERP as_filetype parameter'
        },
        'serp-as-rights': {
          type: 'string',
          description: 'SERP as_rights parameter'
        },
        'serp-as-nlo': {
          type: 'string',
          description: 'SERP as_nlo parameter'
        },
        'serp-as-nhi': {
          type: 'string',
          description: 'SERP as_nhi parameter'
        },
        'serp-extra': {
          type: 'string',
          description: 'Extra query params key=value,key2=value2'
        },
        transport: {
          type: 'string',
          description: 'Crawler transport (auto | undici | curl)',
          default: 'auto',
        },
        'prefer-curl-first': {
          type: 'boolean',
          description: 'Prefer curl-impersonate first in auto mode',
          default: true,
        },
        timeout: {
          type: 'number',
          description: 'Request timeout in ms',
          default: 10000,
        },
        delay: {
          type: 'number',
          description: 'Delay between requests in ms',
          default: 100,
        },
        'max-retry-attempts': {
          type: 'number',
          description: 'Max retry attempts per request',
          default: 3,
        },
        'base-retry-delay-ms': {
          type: 'number',
          description: 'Base retry delay in ms',
          default: 1000,
        },
        'max-retry-delay-ms': {
          type: 'number',
          description: 'Maximum retry delay in ms',
          default: 12000,
        },
        'retry-backoff-multiplier': {
          type: 'number',
          description: 'Retry backoff multiplier',
          default: 2,
        },
        'retry-jitter-ms': {
          type: 'number',
          description: 'Retry jitter in ms',
          default: 250,
        },
        'max-domain-block-strikes': {
          type: 'number',
          description: 'Force curl after this many block signals',
          default: 2,
        },
        'rotate-user-agent': {
          type: 'boolean',
          description: 'Rotate user-agent per request',
          default: true,
        },
        'randomize-headers': {
          type: 'boolean',
          description: 'Randomize request headers',
          default: true,
        }
      },
      examples: [
        { cmd: 'rek seo spider example.com', desc: 'Basic crawl' },
        { cmd: 'rek seo spider example.com -d 3 -l 50', desc: 'Limited crawl' },
        { cmd: 'rek seo spider example.com --seo -o report.json', desc: 'SEO crawl with output' },
        { cmd: 'rek seo spider example.com -E h1 -E h2', desc: 'Extract headings' },
        {
          cmd: 'rek seo spider example.com --seo --serp --serp-top-keywords 5 --serp-query-limit 10 --serp-results-per-query 10',
          desc: 'Run SERP on top extracted keywords'
        },
      ],
      handler: spiderHandler
    },
    robots: {
      description: 'Parse and analyze robots.txt',
      positional: [
        { name: 'url', required: false, description: 'URL or domain to check' }
      ],
      examples: [
        { cmd: 'rek seo robots google.com', desc: 'Check Google robots.txt' }
      ],
      handler: robotsHandler
    },
    sitemap: {
      description: 'Parse and analyze sitemap.xml',
      positional: [
        { name: 'url', required: false, description: 'URL or sitemap URL to check' }
      ],
      examples: [
        { cmd: 'rek seo sitemap google.com', desc: 'Check Google sitemap' },
        { cmd: 'rek seo sitemap https://example.com/sitemap.xml', desc: 'Direct sitemap URL' }
      ],
      handler: sitemapHandler
    }
  }
}

// Backward-compat aliases (used by shell-commands.ts)
export const seoAnalyze = seoAnalyzeHandler
export const spider = spiderHandler
export const robots = robotsHandler
export const sitemap = sitemapHandler

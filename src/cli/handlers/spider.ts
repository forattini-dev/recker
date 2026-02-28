/**
 * Spider Commands (Unified)
 *
 * Spider/crawl tools migrated to the unified command system.
 * Wraps the existing runSpider function for CLI/TUI compatibility.
 */

import type { RekCommandDefinition, RekHandler } from '../handler-types.js'
import type { ExtendedTuiContext } from '../tui-adapter.js'
import { createOutput } from '../handler-types.js'
import colors from '../../utils/colors.js'
import { parseSpiderSerpConfig } from '../utils/serp-config.js'
import { runSpiderKeywordCampaign, toSerpPayload } from '../utils/serp-campaign.js'
import {
  getOptionValue,
  toBoolean,
  toNonNegativeInt,
  toOptionString,
  toSpiderTransport,
  toSpiderFocusMode,
  type SpiderTransport,
} from '../utils/option-helpers.js'

type OptionBag = Record<string, unknown>

/**
 * Check if context has extended TUI features
 */
function isExtendedContext(tui: unknown): tui is ExtendedTuiContext {
  return !!tui && typeof (tui as Record<string, unknown>).setLoading === 'function'
}

// =============================================================================
// Spider Handler
// =============================================================================

export const spiderHandler: RekHandler = async (ctx) => {
  const out = createOutput(ctx)
  const extCtx = isExtendedContext(ctx.tui) ? ctx.tui : null
  const options = ctx.result.options as OptionBag
  const serpConfig = parseSpiderSerpConfig(options);
  const shouldRunSerp = !!ctx.result.options.seo && serpConfig.enabled

  let url = ctx.result.positional.url as string | undefined
  const depth = toNonNegativeInt(ctx.result.options.depth, 10)
  const limit = toNonNegativeInt(ctx.result.options.limit, 1000)
  const concurrency = toNonNegativeInt(ctx.result.options.concurrency, 5)
  const output = toOptionString(ctx.result.options.output)
  const focus = toSpiderFocusMode(ctx.result.options.focus)
  const seo = toBoolean(ctx.result.options.seo, false)
  const robots = toBoolean(ctx.result.options.robots, false)
  const jsonOutput = toBoolean(ctx.result.options.json, false)
  const jsonl = toBoolean(ctx.result.options.jsonl, false)
  const extract = toOptionString(ctx.result.options.extract)
  const include = toOptionString(ctx.result.options.include)
  const exclude = toOptionString(ctx.result.options.exclude)
  const noSitemap = toBoolean(ctx.result.options.noSitemap, false)
  const transport = toSpiderTransport(getOptionValue(options, 'transport'))
  const preferCurlFirst = toBoolean(getOptionValue(options, 'preferCurlFirst', 'prefer-curl-first'), true)
  const timeout = toNonNegativeInt(getOptionValue(options, 'timeout'), 10000)
  const delay = toNonNegativeInt(getOptionValue(options, 'delay'), 100)
  const maxRetryAttempts = toNonNegativeInt(getOptionValue(options, 'maxRetryAttempts', 'max-retry-attempts'), 3)
  const baseRetryDelayMs = toNonNegativeInt(getOptionValue(options, 'baseRetryDelayMs', 'base-retry-delay-ms'), 1000)
  const maxRetryDelayMs = toNonNegativeInt(getOptionValue(options, 'maxRetryDelayMs', 'max-retry-delay-ms'), 12000)
  const retryBackoffMultiplier = toNonNegativeInt(getOptionValue(options, 'retryBackoffMultiplier', 'retry-backoff-multiplier'), 2)
  const retryJitterMs = toNonNegativeInt(getOptionValue(options, 'retryJitterMs', 'retry-jitter-ms'), 250)
  const maxDomainBlockStrikes = toNonNegativeInt(getOptionValue(options, 'maxDomainBlockStrikes', 'max-domain-block-strikes'), 2)
  const rotateUserAgent = toBoolean(getOptionValue(options, 'rotateUserAgent', 'rotate-user-agent'), true)
  const randomizeHeaders = toBoolean(getOptionValue(options, 'randomizeHeaders', 'randomize-headers'), true)

  if (!url) {
    out.error(colors.red('URL is required'))
    if (!ctx.isTui) process.exit(1)
    return
  }

  if (!url.startsWith('http')) url = `https://${url}`

  // TUI shell context - use non-interactive mode
  if (extCtx) {
    extCtx.setLoading(true)

    try {
      // Use the event-based runner for TUI
      const { runSpiderWithEvents } = await import('../commands/spider-runner.js')

      const result = await runSpiderWithEvents(url, {
        depth,
        limit,
        concurrency,
        robots,
        seo,
        useSitemap: seo && !noSitemap,
        focus,
        extract: extract ? extract.split(',').map(s => s.trim()) : undefined,
        include: include ? include.split(',').map(s => s.trim()) : undefined,
        exclude: exclude ? exclude.split(',').map(s => s.trim()) : undefined,
        transport,
        preferCurlFirst,
        timeout,
        delay,
        maxRetryAttempts,
        baseRetryDelayMs,
        maxRetryDelayMs,
        retryBackoffMultiplier,
        retryJitterMs,
        maxDomainBlockStrikes,
        rotateUserAgent,
        randomizeHeaders,
        json: true, // Suppress console output
      })

      const serpCampaign = shouldRunSerp ? await runSpiderKeywordCampaign(url, result.pages, serpConfig) : undefined
      const serpPayload = serpCampaign ? toSerpPayload(serpCampaign) : undefined

      // Format response for TUI
      extCtx.addResponse({
        url: result.url,
        pagesVisited: result.pagesVisited,
        duration: result.duration,
        errors: result.errors,
        internalLinks: result.internalLinks,
        externalLinks: result.externalLinks,
        security: result.security,
        serp: serpPayload,
        seo: result.seo ? {
          avgScore: result.seo.avgScore,
          pagesWithErrors: result.seo.pagesWithErrors,
          pagesWithWarnings: result.seo.pagesWithWarnings,
          duplicateTitles: result.seo.duplicateTitles,
        } : undefined,
        pages: result.pages.slice(0, 10).map(p => ({
          url: p.url,
          status: p.status,
          title: p.title,
          seoScore: p.seoScore,
        })),
      }, { responseType: 'spider' })

    } catch (err: unknown) {
      extCtx.addResponse({
        error: err instanceof Error ? err.message : String(err),
      }, { responseType: 'spider-error' })
    } finally {
      extCtx.setLoading(false)
    }
    return
  }

  // CLI mode - delegate to existing runSpider function
  try {
    const { runSpider } = await import('../commands/spider.js')

    await runSpider({
      url,
      depth,
      limit,
      concurrency,
      output,
      focus,
      seo,
      robots,
      json: jsonOutput,
      jsonl,
      extract,
      include,
      exclude,
      transport,
      preferCurlFirst,
      timeout,
      delay,
      maxRetryAttempts,
      baseRetryDelayMs,
      maxRetryDelayMs,
      retryBackoffMultiplier,
      retryJitterMs,
      maxDomainBlockStrikes,
      rotateUserAgent,
      randomizeHeaders,
      noSitemap,
      serpConfig,
      disableTui: false, // Allow TUI in CLI mode
    })
  } catch (err: unknown) {
    out.error(colors.red(`Spider failed: ${err instanceof Error ? err.message : String(err)}`))
    if (!ctx.isTui) process.exit(1)
  }
}

// =============================================================================
// Command Definitions
// =============================================================================

export const spiderCommands: RekCommandDefinition = {
  description: 'Web crawling and site analysis',
  category: 'spider',
  tuiEnabled: true,
  commands: {
    'spider': {
      description: 'Crawl a website and analyze all pages',
      positional: [
        { name: 'url', required: true, description: 'Starting URL to crawl' }
      ],
      options: {
        depth: { short: 'd', type: 'number', default: 10, description: 'Max link depth to follow' },
        limit: { short: 'l', type: 'number', default: 1000, description: 'Max pages to crawl' },
        concurrency: { short: 'c', type: 'number', default: 5, description: 'Number of parallel requests' },
        output: { short: 'o', type: 'string', description: 'Save JSON report to file' },
        focus: { short: 'f', type: 'string', default: 'all', description: 'Focus SEO analysis on specific area' },
        seo: { short: 'S', type: 'boolean', description: 'Enable SEO analysis mode' },
        robots: { short: 'r', type: 'boolean', description: 'Respect robots.txt rules' },
        json: { short: 'j', type: 'boolean', description: 'Output as JSON' },
        jsonl: { short: 'L', type: 'boolean', description: 'Stream output as JSONL' },
        extract: { short: 'E', type: 'string', description: 'CSS selectors to extract (comma-separated)' },
        include: { short: 'i', type: 'string', description: 'URL patterns to include (comma-separated regex)' },
        exclude: { short: 'x', type: 'string', description: 'URL patterns to exclude (comma-separated regex)' },
        noSitemap: { short: 'N', type: 'boolean', description: 'Disable sitemap.xml crawling' },
        transport: { type: 'string', default: 'auto', description: 'HTTP transport (auto | undici | curl)' },
        'prefer-curl-first': { type: 'boolean', default: true, description: 'Prefer curl-impersonate first in auto mode' },
        timeout: { type: 'number', default: 10000, description: 'Request timeout in ms' },
        delay: { type: 'number', default: 100, description: 'Delay between requests in ms' },
        'max-retry-attempts': { type: 'number', default: 3, description: 'Max retry attempts per request' },
        'base-retry-delay-ms': { type: 'number', default: 1000, description: 'Base retry delay in ms' },
        'max-retry-delay-ms': { type: 'number', default: 12000, description: 'Maximum retry delay in ms' },
        'retry-backoff-multiplier': { type: 'number', default: 2, description: 'Retry backoff multiplier' },
        'retry-jitter-ms': { type: 'number', default: 250, description: 'Retry jitter in ms' },
        'max-domain-block-strikes': { type: 'number', default: 2, description: 'Block strikes before forcing curl in auto mode' },
        'rotate-user-agent': { type: 'boolean', default: true, description: 'Rotate user-agent per request' },
        'randomize-headers': { type: 'boolean', default: true, description: 'Randomize request headers' },
        serp: { type: 'boolean', description: 'Enable SERP campaign for top extracted keywords' },
        'serp-top-keywords': { type: 'number', default: 5, description: 'Top keywords per page used as seeds' },
        'serp-query-limit': { type: 'number', default: 10, description: 'Number of SERP queries to execute' },
        'serp-results-per-query': { type: 'number', default: 10, description: 'Results fetched per SERP query' },
        'serp-concurrency': { type: 'number', default: 1, description: 'Number of SERP queries to execute in parallel' },
        'serp-delay-ms': { type: 'number', default: 1200, description: 'Delay in ms between SERP queries' },
        'serp-delay-jitter-ms': { type: 'number', default: 450, description: 'Random delay jitter in ms between SERP queries' },
        'serp-max-consecutive-blocks': { type: 'number', default: 3, description: 'Stop campaign after this many blocked/captcha responses in a row' },
        'serp-captcha-cooldown-ms': { type: 'number', default: 2400, description: 'Cooldown in ms after captcha before continuing SERP' },
        'serp-retry-count': { type: 'number', default: 1, description: 'Retry count per SERP query' },
        'serp-retry-delay-ms': { type: 'number', default: 1200, description: 'Base retry delay in ms for SERP queries' },
        'serp-transport': { type: 'string', description: 'Search transport (auto | undici | curl)' },
        'serp-timeout': { type: 'number', description: 'Search timeout in ms' },
        'serp-country': { type: 'string', description: 'Search country/region' },
        'serp-gl': { type: 'string', description: 'Google GL parameter' },
        'serp-hl': { type: 'string', description: 'Google HL parameter' },
      },
      examples: [
        { cmd: 'rek spider example.com', desc: 'Basic crawl' },
        { cmd: 'rek spider example.com --seo', desc: 'Enable SEO analysis' },
        { cmd: 'rek spider example.com -d 3 -l 50', desc: 'Depth 3, max 50 pages' },
        { cmd: 'rek spider example.com --seo --serp', desc: 'Enable SEO + SERP campaign' },
        { cmd: 'rek spider example.com --seo --serp --serp-top-keywords 12 --serp-query-limit 10 --serp-results-per-query 10', desc: 'Tuned SERP campaign' },
      ],
      handler: spiderHandler
    }
  }
}

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

/**
 * Check if context has extended TUI features
 */
function isExtendedContext(tui: any): tui is ExtendedTuiContext {
  return tui && typeof tui.setLoading === 'function'
}

// =============================================================================
// Spider Handler
// =============================================================================

export const spiderHandler: RekHandler = async (ctx) => {
  const out = createOutput(ctx)
  const extCtx = isExtendedContext(ctx.tui) ? ctx.tui : null

  let url = ctx.result.positional.url as string
  const depth = (ctx.result.options.depth as number) || 10
  const limit = (ctx.result.options.limit as number) || 1000
  const concurrency = (ctx.result.options.concurrency as number) || 5
  const output = ctx.result.options.output as string | undefined
  const focus = (ctx.result.options.focus as string) || 'all'
  const seo = ctx.result.options.seo as boolean
  const robots = ctx.result.options.robots as boolean
  const jsonOutput = ctx.result.options.json as boolean
  const jsonl = ctx.result.options.jsonl as boolean
  const extract = ctx.result.options.extract as string | undefined
  const include = ctx.result.options.include as string | undefined
  const exclude = ctx.result.options.exclude as string | undefined
  const noSitemap = ctx.result.options.noSitemap as boolean

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
        focus: focus as any,
        extract: extract ? extract.split(',').map(s => s.trim()) : undefined,
        include: include ? include.split(',').map(s => s.trim()) : undefined,
        exclude: exclude ? exclude.split(',').map(s => s.trim()) : undefined,
        json: true, // Suppress console output
      })

      // Format response for TUI
      extCtx.addResponse({
        url: result.url,
        pagesVisited: result.pagesVisited,
        duration: result.duration,
        errors: result.errors,
        internalLinks: result.internalLinks,
        externalLinks: result.externalLinks,
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

    } catch (err: any) {
      extCtx.addResponse({
        error: err.message,
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
      noSitemap,
      disableTui: false, // Allow TUI in CLI mode
    })
  } catch (err: any) {
    out.error(colors.red(`Spider failed: ${err.message}`))
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
      },
      examples: [
        { cmd: 'rek spider example.com', desc: 'Basic crawl' },
        { cmd: 'rek spider example.com --seo', desc: 'Enable SEO analysis' },
        { cmd: 'rek spider example.com -d 3 -l 50', desc: 'Depth 3, max 50 pages' },
      ],
      handler: spiderHandler
    }
  }
}

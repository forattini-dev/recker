/**
 * SEO Commands (Unified)
 *
 * SEO analysis and crawling tools migrated to the unified command system.
 * These handlers work in both CLI and TUI modes.
 */

import type { RekCommandDefinition } from '../handler-types.js'
import {
  withHandler,
  getNumber,
  getBoolean,
  colors,
} from '../output.js'

/**
 * Normalize URL (add https:// if missing)
 */
function normalizeUrl(url: string): string {
  return url.startsWith('http') ? url : `https://${url}`
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0]
  }
}

/**
 * Get score color based on value
 */
function getScoreColor(score: number) {
  if (score >= 90) return colors.green
  if (score >= 70) return colors.blue
  if (score >= 50) return colors.yellow
  return colors.red
}

// =============================================================================
// SEO Analyze Handler
// =============================================================================

export const seoAnalyzeHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = ctx.result.positional.url as string

    if (!url) {
      const base = extCtx?.baseUrl?.()
      if (base) {
        url = base
      } else {
        out.error('Usage: seo <url> or set base URL first')
        return
      }
    }

    url = normalizeUrl(url)
    const domain = extractDomain(url)

    // Parse options
    const jsonOutput = getBoolean(ctx.result.options.json)
    const outputPath = ctx.result.options.output as string | undefined
    const outputDir = ctx.result.options.outputDir as string | undefined

    out.log(colors.gray(`Analyzing SEO for ${url}...`))

    const { analyzeSeo, resolveOutputPath, writeReport, formatSeoReportJson } = await import('../../seo/index.js')
    const { formatReportForJson } = await import('../../seo/output.js')

    // Resolve output path if needed
    const finalOutputPath = resolveOutputPath({
      output: outputPath,
      outputDir,
      type: 'seo',
      domain,
    })

    const startTime = performance.now()

    // Get HTTP client from extended context or create one
    let html: string
    let timings: { firstByte?: number; total?: number; dns?: number; tcp?: number; tls?: number; content?: number } = {}

    if (extCtx?.client) {
      out.log(colors.gray('Fetching page...'))
      const res = await extCtx.client.get(url)
      html = await res.text()
      timings = res.timings || {}
    } else {
      const res = await fetch(url)
      html = await res.text()
    }

    const duration = Math.round(performance.now() - startTime)
    out.log(colors.gray(`Analyzing ${Math.round(html.length / 1024)}KB of HTML...`))

    const report = await analyzeSeo(html, { baseUrl: url })

    // Add timing
    report.timing = {
      ttfb: timings.firstByte ? Math.round(timings.firstByte) : undefined,
      total: timings.total ? Math.round(timings.total) : duration,
      dns: timings.dns ? Math.round(timings.dns) : undefined,
      tcp: timings.tcp ? Math.round(timings.tcp) : undefined,
      tls: timings.tls ? Math.round(timings.tls) : undefined,
      download: timings.content ? Math.round(timings.content) : undefined,
    }

    // Track domain SEO data in shell
    extCtx?.track.seo(domain, {
      score: report.score,
      issues: report.summary.errors + report.summary.warnings,
      categories: {
        technical: 0,
        content: 0,
        meta: 0,
      },
    })

    // Handle file output
    if (jsonOutput || finalOutputPath) {
      const jsonResult = formatReportForJson(
        formatSeoReportJson(report, url),
        url,
        'seo'
      )

      if (finalOutputPath) {
        const savedPath = await writeReport(finalOutputPath, jsonResult)
        out.success(`Report saved to: ${savedPath}`)
      }

      if (jsonOutput) {
        out.json(jsonResult)
        return
      }
    }

    // Shell: use structured response
    if (extCtx) {
      out.response({
        url,
        score: report.score,
        grade: report.grade,
        title: report.title,
        metaDescription: report.metaDescription,
        timing: report.timing,
        openGraph: report.openGraph,
        twitterCard: report.twitterCard,
        keywords: report.keywords,
        summary: {
          passed: report.summary.passed,
          warnings: report.summary.warnings,
          errors: report.summary.errors,
          infos: report.summary.infos,
          notApplicable: report.summary.notApplicable,
          suggestions: report.summary.suggestions,
          vitals: report.summary.vitals,
          topIssues: report.summary.topIssues,
          quickWins: report.summary.quickWins,
          completeness: report.summary.completeness,
        },
        technical: report.technical,
        content: report.content,
        headings: report.headings,
        links: report.links,
        structuredData: report.structuredData,
        checks: report.checks,
      }, { responseType: 'seo', time: duration })
    } else {
      // CLI: formatted text output
      out.title('SEO Analysis Results', '🔍')
      out.keyValue([
        { key: 'URL', value: url },
        { key: 'Score', value: `${report.score}/100 (${report.grade})`, color: report.score >= 70 ? 'green' : report.score >= 50 ? 'yellow' : 'red' },
        { key: 'Title', value: report.title || colors.yellow('Missing') },
      ])
      out.blank()

      out.subtitle('Summary')
      out.checklist([
        { text: `Passed: ${report.summary.passed}`, checked: true },
        { text: `Warnings: ${report.summary.warnings}`, checked: report.summary.warnings === 0 },
        { text: `Errors: ${report.summary.errors}`, checked: report.summary.errors === 0 },
        {
          text: `Info: ${report.summary.infos} (N/A: ${report.summary.notApplicable || 0}, Sugestões: ${report.summary.suggestions || 0})`,
          checked: report.summary.infos === 0,
        },
      ])
      out.blank()

      // Show top issues
      if (report.summary.topIssues?.length > 0) {
        out.subtitle('Top Issues')
        for (const issue of report.summary.topIssues.slice(0, 5)) {
          out.status(issue.severity === 'error' ? 'error' : 'warning', issue.message)
        }
        out.blank()
      }

      // Show timing
      if (report.timing.total) {
        out.log(colors.gray(`Analyzed in ${report.timing.total}ms`))
      }
    }
  }
)

// =============================================================================
// Spider Handler
// =============================================================================

export const spiderHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = ctx.result.positional.url as string

    if (!url) {
      out.error('URL is required')
      return
    }

    url = normalizeUrl(url)
    const domain = extractDomain(url)

    // Parse options
    const depth = getNumber(ctx.result.options.depth, 5)
    const limit = getNumber(ctx.result.options.limit, 100)
    const concurrency = getNumber(ctx.result.options.concurrency, 5)
    const seoEnabled = getBoolean(ctx.result.options.seo)
    const jsonOutput = getBoolean(ctx.result.options.json)
    const jsonlEnabled = getBoolean(ctx.result.options.jsonl)
    const outputPath = ctx.result.options.output as string | undefined
    const outputDir = ctx.result.options.outputDir as string | undefined
    const focus = ctx.result.options.focus as string | undefined
    const extract = ctx.result.options.extract as string[] | undefined
    const include = ctx.result.options.include as string[] | undefined
    const exclude = ctx.result.options.exclude as string[] | undefined

    out.log(colors.gray(`Starting spider on ${url}... (depth=${depth}, limit=${limit})`))

    const { runSpiderWithEvents } = await import('../commands/spider-runner.js')

    const result = await runSpiderWithEvents(url, {
      depth,
      limit,
      concurrency,
      seo: seoEnabled,
      focus: focus as 'links' | 'duplicates' | 'security' | 'ai' | undefined,
      json: true,
      extract,
      include,
      exclude,
    })

    // Track domain intelligence in shell
    extCtx?.track.spider(domain, {
      pagesFound: result.pagesVisited,
      internalLinks: result.internalLinks,
      externalLinks: result.externalLinks,
      images: result.images,
      scripts: result.scripts,
      stylesheets: result.stylesheets,
      errors: result.errors,
    })

    // Handle file output
    const { resolveOutputPath, writeReport, formatReportForJson } = await import('../../seo/output.js')

    const resolvedOutputPath = resolveOutputPath({
      output: outputPath,
      outputDir,
      type: seoEnabled ? 'seo-spider' : 'spider',
      domain,
    })

    if (resolvedOutputPath) {
      if (jsonlEnabled) {
        const { JsonlWriter } = await import('../commands/spider-runner.js')
        const writer = new JsonlWriter({ output: resolvedOutputPath })
        await writer.init()

        writer.write({
          type: 'start',
          url,
          startedAt: new Date().toISOString(),
          config: { depth, limit, seo: seoEnabled },
        })

        for (const page of result.pages) {
          writer.write({
            type: 'page',
            url: page.url,
            status: page.status,
            title: page.title,
            depth: page.depth,
            links: page.links,
            duration: page.duration,
            seoScore: page.seoScore,
            seoGrade: page.seoGrade,
            seoErrors: page.seoErrors,
            seoWarnings: page.seoWarnings,
            extracted: page.extracted,
          })
        }

        writer.write({
          type: 'complete',
          url: result.url,
          completedAt: new Date().toISOString(),
          pagesVisited: result.pagesVisited,
          duration: result.duration,
          errors: result.errors,
          internalLinks: result.internalLinks,
          externalLinks: result.externalLinks,
          seo: result.seo,
          extraction: result.extraction,
        })

        await writer.close()
        out.success(`Report saved to: ${writer.getPath() || resolvedOutputPath}`)
      } else {
        const jsonResult = formatReportForJson(result, url, seoEnabled ? 'seo-spider' : 'spider')
        const savedPath = await writeReport(resolvedOutputPath, jsonResult)
        out.success(`Report saved to: ${savedPath}`)
      }
    }

    // Format result summary
    const summary = {
      url: result.url,
      pages: result.pagesVisited,
      duration: `${(result.duration / 1000).toFixed(1)}s`,
      errors: result.errors,
      links: {
        internal: result.internalLinks,
        external: result.externalLinks,
      },
      assets: {
        images: result.images,
        scripts: result.scripts,
        stylesheets: result.stylesheets,
      },
      topPages: result.pages.slice(0, 10).map((p: { url: string; status: number; title?: string; seoScore?: number; seoGrade?: string }) => ({
        url: p.url.replace(url, ''),
        status: p.status,
        title: p.title?.slice(0, 40),
        seoScore: p.seoScore,
        seoGrade: p.seoGrade,
      })),
      seo: result.seo ? {
        avgScore: result.seo.avgScore,
        pagesWithErrors: result.seo.pagesWithErrors,
        pagesWithWarnings: result.seo.pagesWithWarnings,
        duplicateTitles: result.seo.duplicateTitles,
        duplicateDescriptions: result.seo.duplicateDescriptions,
      } : undefined,
      extraction: result.extraction ? {
        schema: result.extraction.schema,
        totalItems: result.extraction.totalItems,
        pagesWithData: Object.keys(result.extraction.byPage).length,
      } : undefined,
    }

    // Shell: use structured response
    if (extCtx) {
      out.response(summary, {
        responseType: seoEnabled ? 'seo-spider' : 'spider',
        time: result.duration,
      })
    } else {
      // CLI: formatted output
      out.title('Spider Results', '🕷️')
      out.keyValue({
        URL: result.url,
        Pages: result.pagesVisited,
        Duration: `${(result.duration / 1000).toFixed(1)}s`,
        Errors: result.errors,
      })
      out.blank()

      out.keyValue({
        'Internal Links': result.internalLinks,
        'External Links': result.externalLinks,
        Images: result.images,
        Scripts: result.scripts,
        Stylesheets: result.stylesheets,
      })
      out.blank()

      if (jsonOutput) {
        out.json(summary)
      }
    }
  }
)

// =============================================================================
// Robots Handler
// =============================================================================

export const robotsHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = ctx.result.positional.url as string

    if (!url) {
      const base = extCtx?.baseUrl?.()
      if (base) {
        url = base
      } else {
        out.error('Usage: robots <url> or set base URL first')
        return
      }
    }

    url = normalizeUrl(url)

    const robotsUrl = new URL('/robots.txt', url).toString()

    let response: Response
    if (extCtx?.client) {
      response = await extCtx.client.get(robotsUrl)
    } else {
      response = await fetch(robotsUrl)
    }

    const text = await response.text()

    if (response.status === 404) {
      out.warn(`No robots.txt found at ${robotsUrl}`)
      return
    }

    // Parse directives
    const lines = text.split('\n')
    const directives: Array<{ agent?: string; type: string; path?: string; url?: string }> = []
    let currentAgent = '*'

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.toLowerCase().startsWith('user-agent:')) {
        currentAgent = trimmed.slice(11).trim()
      } else if (trimmed.toLowerCase().startsWith('disallow:')) {
        directives.push({ agent: currentAgent, type: 'disallow', path: trimmed.slice(9).trim() })
      } else if (trimmed.toLowerCase().startsWith('allow:')) {
        directives.push({ agent: currentAgent, type: 'allow', path: trimmed.slice(6).trim() })
      } else if (trimmed.toLowerCase().startsWith('sitemap:')) {
        directives.push({ type: 'sitemap', url: trimmed.slice(8).trim() })
      }
    }

    const result = {
      url: robotsUrl,
      rules: directives.length,
      sitemaps: directives.filter(d => d.type === 'sitemap').map(d => d.url!),
      disallowed: directives.filter(d => d.type === 'disallow').slice(0, 10).map(d => d.path!),
    }

    // Shell: structured response
    if (extCtx) {
      out.response(result, { responseType: 'robots' })
    } else {
      // CLI: formatted output
      out.title('robots.txt Analysis', '🤖')
      out.keyValue({
        URL: robotsUrl,
        Rules: directives.length,
      })
      out.blank()

      if (result.sitemaps.length > 0) {
        out.subtitle('Sitemaps')
        out.list(result.sitemaps)
        out.blank()
      }

      if (result.disallowed.length > 0) {
        out.subtitle('Disallowed Paths')
        for (const p of result.disallowed) {
          out.status('error', p)
        }
        out.blank()
      }
    }
  }
)

// =============================================================================
// Sitemap Handler
// =============================================================================

export const sitemapHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = ctx.result.positional.url as string

    if (!url) {
      const base = extCtx?.baseUrl?.()
      if (base) {
        url = base
      } else {
        out.error('Usage: sitemap <url> or set base URL first')
        return
      }
    }

    url = normalizeUrl(url)

    const sitemapUrl = url.endsWith('.xml') ? url : new URL('/sitemap.xml', url).toString()

    let response: Response
    if (extCtx?.client) {
      response = await extCtx.client.get(sitemapUrl)
    } else {
      response = await fetch(sitemapUrl)
    }

    const text = await response.text()

    if (response.status === 404) {
      out.warn(`No sitemap found at ${sitemapUrl}`)
      return
    }

    // Parse URLs from XML
    const urlMatches = text.match(/<loc>([^<]+)<\/loc>/g) || []
    const urls = urlMatches.map(m => m.replace(/<\/?loc>/g, ''))

    const result = {
      url: sitemapUrl,
      totalUrls: urls.length,
      sample: urls.slice(0, 10),
    }

    // Shell: structured response
    if (extCtx) {
      out.response(result, { responseType: 'sitemap' })
    } else {
      // CLI: formatted output
      out.title('Sitemap Analysis', '🗺️')
      out.keyValue({
        URL: sitemapUrl,
        'Total URLs': urls.length,
      })
      out.blank()

      if (urls.length > 0) {
        out.subtitle('Sample URLs')
        out.list(urls.slice(0, 10))
        if (urls.length > 10) {
          out.log(colors.gray(`  ... and ${urls.length - 10} more`))
        }
        out.blank()
      }
    }
  }
)

// =============================================================================
// Command Definitions
// =============================================================================

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
        }
      },
      examples: [
        { cmd: 'rek seo analyze google.com', desc: 'Analyze Google homepage' },
        { cmd: 'rek seo analyze example.com --all', desc: 'Show all checks' },
        { cmd: 'rek seo analyze example.com -o report.json', desc: 'Save to file' }
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
        }
      },
      examples: [
        { cmd: 'rek seo spider example.com', desc: 'Basic crawl' },
        { cmd: 'rek seo spider example.com -d 3 -l 50', desc: 'Limited crawl' },
        { cmd: 'rek seo spider example.com --seo -o report.json', desc: 'SEO crawl with output' },
        { cmd: 'rek seo spider example.com -E h1 -E h2', desc: 'Extract headings' }
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

// Also export as root-level command for backward compatibility
export const seoAnalyze = seoAnalyzeHandler
export const spider = spiderHandler
export const robots = robotsHandler
export const sitemap = sitemapHandler

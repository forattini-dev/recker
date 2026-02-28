/**
 * SEO Spider Handler
 *
 * Full-site crawl with optional SEO analysis and SERP campaign.
 */

import {
  withHandler,
  getNumber,
  getBoolean,
  colors,
} from '../output.js'
import { parseSpiderSerpConfig } from '../utils/serp-config.js'
import {
  getOptionValue,
  toSpiderFocusMode,
  toNonNegativeInt,
  toSpiderTransport,
  type SpiderTransport,
} from '../utils/option-helpers.js'
import {
  normalizeUrl,
  extractDomain,
  runCrawlerSerpCampaign,
  type SeoCrawlerSerpRun,
  formatSerpSummaryRows,
  getSerpComparisonRows,
  getSerpCompetitorRows,
} from './seo-serp.js'

export const spiderHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = ctx.result.positional.url as string

    const options = ctx.result.options as Record<string, unknown>

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
    const focusMode = toSpiderFocusMode(ctx.result.options.focus)
    const extract = ctx.result.options.extract as string[] | undefined
    const include = ctx.result.options.include as string[] | undefined
    const exclude = ctx.result.options.exclude as string[] | undefined
    const serpConfig = parseSpiderSerpConfig(ctx.result.options as Record<string, unknown>)
    const transport = toSpiderTransport(getOptionValue(options, 'transport')) as SpiderTransport | undefined
    const preferCurlFirst = getBoolean(getOptionValue(options, 'preferCurlFirst', 'prefer-curl-first'), true)
    const timeout = toNonNegativeInt(getOptionValue(options, 'timeout'), 10000)
    const delay = toNonNegativeInt(getOptionValue(options, 'delay'), 100)
    const maxRetryAttempts = toNonNegativeInt(getOptionValue(options, 'maxRetryAttempts', 'max-retry-attempts'), 3)
    const baseRetryDelayMs = toNonNegativeInt(getOptionValue(options, 'baseRetryDelayMs', 'base-retry-delay-ms'), 1000)
    const maxRetryDelayMs = toNonNegativeInt(getOptionValue(options, 'maxRetryDelayMs', 'max-retry-delay-ms'), 12000)
    const retryBackoffMultiplier = toNonNegativeInt(getOptionValue(options, 'retryBackoffMultiplier', 'retry-backoff-multiplier'), 2)
    const retryJitterMs = toNonNegativeInt(getOptionValue(options, 'retryJitterMs', 'retry-jitter-ms'), 250)
    const maxDomainBlockStrikes = toNonNegativeInt(getOptionValue(options, 'maxDomainBlockStrikes', 'max-domain-block-strikes'), 2)
    const rotateUserAgent = getBoolean(getOptionValue(options, 'rotateUserAgent', 'rotate-user-agent'), true)
    const randomizeHeaders = getBoolean(getOptionValue(options, 'randomizeHeaders', 'randomize-headers'), true)

    out.log(colors.gray(`Starting spider on ${url}... (depth=${depth}, limit=${limit})`))

    const { runSpiderWithEvents } = await import('../commands/spider-runner.js')

    const result = await runSpiderWithEvents(url, {
      depth,
      limit,
      concurrency,
      seo: seoEnabled,
      focus: focusMode,
      json: true,
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
    })

    // Track domain intelligence in shell
    const spiderSecurity = result.security;
    extCtx?.track.spider(domain, {
      pagesFound: result.pagesVisited,
      internalLinks: result.internalLinks,
      externalLinks: result.externalLinks,
      images: result.images,
      scripts: result.scripts,
      stylesheets: result.stylesheets,
      errors: result.errors,
      security: spiderSecurity,
    })

    // Handle file output
    const { resolveOutputPath, writeReport, formatReportForJson } = await import('../../seo/output.js')

    const resolvedOutputPath = resolveOutputPath({
      output: outputPath,
      outputDir,
      type: seoEnabled ? 'seo-spider' : 'spider',
      domain,
    })

    let serpCampaign: SeoCrawlerSerpRun | undefined
    if (serpConfig.enabled) {
      if (!seoEnabled) {
        out.warn('SERP mode requires --seo; enable it so keywords are extracted.')
      } else {
        out.log(colors.gray(
          `Running SERP checks using ${serpConfig.topKeywordsLimit} short keywords/page + long-tail expansion, max ${serpConfig.queriesLimit} queries...`
        ))
        serpCampaign = await runCrawlerSerpCampaign(result.url, result.pages, serpConfig)
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
      security: result.security ? {
        pages: result.security.pages,
        blockedPages: result.security.blockedPages,
        captchaPages: result.security.captchaPages,
        captchaProviders: result.security.captchaProviders,
        attempts: result.security.attempts,
        retries: result.security.retries,
        transportUsage: result.security.transportUsage,
        avgAttempts: result.security.avgAttempts,
        avgTtfbMs: result.security.avgTtfbMs,
        avgTotalMs: result.security.avgTotalMs,
        avgDownloadMs: result.security.avgDownloadMs,
      } : undefined,
      extraction: result.extraction ? {
        schema: result.extraction.schema,
        totalItems: result.extraction.totalItems,
        pagesWithData: Object.keys(result.extraction.byPage).length,
      } : undefined,
      serp: serpCampaign ? {
        summary: serpCampaign.campaign.summary,
        campaign: serpCampaign.campaign.campaign,
        results: formatSerpSummaryRows(serpCampaign.campaign),
        pageComparison: getSerpComparisonRows(serpCampaign.campaign),
        seedPlan: {
          short: serpCampaign.plan.short.map((seed) => seed.keyword),
          longTail: serpCampaign.plan.longTail.map((seed) => seed.keyword),
          ordered: serpCampaign.plan.ordered.map((seed) => seed.keyword),
        },
      } : undefined,
    }

    if (resolvedOutputPath) {
      if (jsonlEnabled) {
        const { JsonlWriter } = await import('../commands/spider-runner.js')
        const writer = new JsonlWriter({ output: resolvedOutputPath })
        await writer.init()

        writer.write({
          type: 'start',
          url,
          startedAt: new Date().toISOString(),
          config: {
            depth,
            limit,
            seo: seoEnabled,
            transport,
            preferCurlFirst,
            timeout,
            delay,
          },
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
            security: page.security,
            timings: page.timings,
            resources: page.resources,
            seoScore: page.seoScore,
            seoGrade: page.seoGrade,
            seoErrors: page.seoErrors,
            seoWarnings: page.seoWarnings,
            attempts: page.security?.attempts,
            retryCount: page.security?.retryCount,
            retryAfterMs: page.security?.retryAfterMs,
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
          pages: result.pagesVisited,
          seo: result.seo,
          security: result.security,
          links: {
            internal: result.internalLinks,
            external: result.externalLinks,
          },
          assets: {
            images: result.images,
            scripts: result.scripts,
            stylesheets: result.stylesheets,
          },
          extraction: result.extraction,
          serp: summary.serp,
        })

        await writer.close()
        out.success(`Report saved to: ${writer.getPath() || resolvedOutputPath}`)
      } else {
        const jsonResult = formatReportForJson(summary, url, seoEnabled ? 'seo-spider' : 'spider')
        const savedPath = await writeReport(resolvedOutputPath, jsonResult)
        out.success(`Report saved to: ${savedPath}`)
      }
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

      if (result.security) {
        out.blank()
        out.subtitle('Crawler anti-bot signal')
        out.keyValue({
          'Blocked pages': result.security.blockedPages,
          'Captcha pages': result.security.captchaPages,
          'Avg attempts': result.security.avgAttempts.toFixed(2),
          'Avg retries': result.security.retries,
        })
        out.keyValue({
          'Transport usage': `curl ${result.security.transportUsage.curl} / undici ${result.security.transportUsage.undici}`,
          'Avg TTFB': `${result.security.avgTtfbMs ?? 'n/a'}ms`,
          'Avg total time': `${result.security.avgTotalMs ?? 'n/a'}ms`,
          'Avg download': `${result.security.avgDownloadMs ?? 'n/a'}ms`,
        })
      }

      if (result.seo) {
        out.blank()
        out.keyValue({
          'Avg SEO score': `${result.seo.avgScore}`,
          'Pages w/ errors': result.seo.pagesWithErrors,
          'Pages w/ warnings': result.seo.pagesWithWarnings,
          'Duplicate titles': result.seo.duplicateTitles,
        })
      }
      out.blank()

      if (jsonOutput) {
        out.json(summary)
        return
      }

      if (serpConfig.enabled) {
          if (!summary.serp) {
            out.warn('SERP was enabled but no keywords were extracted from crawl pages.')
          } else {
            const executedCount = summary.serp.summary.queriesExecuted
            const foundCount = summary.serp.summary.queriesFound
            const totalChecked = summary.serp.summary.queriesRequested
            const blockedCount = summary.serp.summary.queriesBlocked ?? 0
            const captchaCount = summary.serp.summary.queriesCaptcha ?? 0
            out.blank()
            out.subtitle(`SERP: ${executedCount}/${totalChecked} searched | ${foundCount} found`)
            out.log(colors.gray(`SERP anti-bot: ${blockedCount} blocked · ${captchaCount} captcha`))

            if (summary.serp.results.length > 0) {
              for (const item of summary.serp.results.slice(0, 12)) {
                const foundText = item.found
                  ? colors.green(`found #${item.position ?? '-'}`)
                  : item.blocked
                    ? colors.yellow(`blocked${item.blockReason ? `: ${item.blockReason}` : ''}`)
                    : colors.yellow('not found')
                out.status(item.found ? 'success' : 'warning', `${item.keyword}: ${foundText} ${item.searchUrl}`)
              }
            } else {
              out.warn('No SERP rows found for extracted keywords.')
            }

          if (summary.serp.summary.topOrganicCompetitors.length > 0) {
            const topCompetitor = summary.serp.summary.topOrganicCompetitors[0]
            out.log(colors.gray(`Top organic competitor: ${topCompetitor.domain}`))

            const topRows = getSerpCompetitorRows(summary.serp.summary.topOrganicCompetitors).slice(0, 8)
            out.blank()
            out.subtitle('Main organic competitors')
            out.table(topRows, [
              { key: 'domain', label: 'Domain', width: 30 },
              { key: 'queries', label: 'Queries', width: 8 },
              { key: 'matchedKeywords', label: 'Matched', width: 10 },
              { key: 'wins', label: 'Wins', width: 8 },
              { key: 'avgGap', label: 'Gap', width: 8 },
              { key: 'bestPages', label: 'Wins in pages' },
            ])
          }

          const pageRows = summary.serp.pageComparison
          if (pageRows.length > 0) {
            out.blank()
            out.subtitle('Average appearance by source page')
            out.table(pageRows, [
              { key: 'pageUrl', label: 'Page', width: 40 },
              { key: 'tracked', label: 'Tracked', width: 8 },
              { key: 'found', label: 'Found', width: 8 },
              { key: 'appearanceRate', label: 'Ap.%', width: 9 },
              { key: 'avgPosition', label: 'Avg pos', width: 9 },
              { key: 'top3', label: 'Top3', width: 6 },
              { key: 'top10', label: 'Top10', width: 7 },
            ])
          }
        }
      }
    }
  }
)

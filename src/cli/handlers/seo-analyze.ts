/**
 * SEO Analyze Handler
 *
 * Single-page SEO analysis with optional SERP campaign.
 */

import {
  withHandler,
  getBoolean,
  colors,
} from '../output.js'
import { parseSpiderSerpConfig } from '../utils/serp-config.js'
import { getScoreColor } from '../utils/score-color.js'
import {
  normalizeUrl,
  extractDomain,
  runCrawlerSerpCampaign,
  type SeoCrawlerSerpRun,
  formatSerpSummaryRows,
  getSerpComparisonRows,
  getSerpCompetitorRows,
  formatKeywordList,
} from './seo-serp.js'

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
    const serpConfig = parseSpiderSerpConfig(ctx.result.options as Record<string, unknown>)
    let serpCampaign: SeoCrawlerSerpRun | undefined

    if (serpConfig.enabled) {
      out.log(colors.gray(
        `Running SERP checks using ${serpConfig.topKeywordsLimit} short keywords/page + long-tail expansion, max ${serpConfig.queriesLimit} queries...`
      ))
      serpCampaign = await runCrawlerSerpCampaign(url, [{ url, seoReport: report }], serpConfig)
    }

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
        performance: 0,
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
      const tick = (ok: boolean) => ok ? colors.green('✔') : colors.red('✗')
      const ms = (v: number | undefined) => v !== undefined ? `${v}ms` : colors.gray('n/a')
      const numFmt = (n: number) => n.toLocaleString('pt-BR')
      const trunc = (s: string | undefined, len: number) =>
        s ? (s.length > len ? s.slice(0, len) + '…' : s) : ''

      // ── Header ──────────────────────────────────────────────────────────────
      out.title(`SEO Analysis`, '🔍')
      out.keyValue([
        { key: 'URL', value: url },
        ...(report.pageType ? [{ key: 'Type', value: report.pageType }] : []),
        { key: 'Title', value: report.title?.text ? trunc(report.title.text, 70) : colors.yellow('Missing') },
        ...(report.metaDescription?.text ? [{ key: 'Desc', value: trunc(report.metaDescription.text, 90) }] : []),
      ])
      out.blank()
      out.grade(report.grade, report.score)
      out.progress({ label: 'Score   ', total: 100, current: report.score, width: 30 })
      out.blank()

      // ── Checks ──────────────────────────────────────────────────────────────
      out.divider()
      out.subtitle('Checks')
      out.log(
        `  ${colors.green('✔')} Passed  : ${colors.green(String(report.summary.passed).padStart(4))}` +
        `   ${colors.red('✖')} Errors  : ${(report.summary.errors > 0 ? colors.red : colors.green)(String(report.summary.errors))}`
      )
      out.log(
        `  ${colors.gray('○')} Warnings: ${colors.yellow(String(report.summary.warnings).padStart(4))}` +
        `   ${colors.gray('○')} Info    : ${colors.gray(String(report.summary.infos))}` +
        ` ${colors.gray(`(N/A: ${report.summary.notApplicable ?? 0}, Tips: ${report.summary.suggestions ?? 0})`)}`
      )
      out.log(colors.gray(`  Pass rate: ${report.summary.passRate.toFixed(1)}%  |  Total checks: ${report.summary.totalChecks}`))
      out.blank()

      // ── Category Breakdown ───────────────────────────────────────────────────
      const catEntries = Object.entries(report.summary.issuesByCategory)
        .filter(([, v]) => (v.passed + v.warnings + v.errors) > 0)
        .map(([cat, v]) => {
          const total = v.passed + v.warnings + v.errors
          const rawScore = Math.round(((v.passed * 100 + v.warnings * 50) / (total * 100)) * 100)
          const scoreStr = rawScore >= 90
            ? colors.green(`${rawScore}%`)
            : rawScore >= 70
              ? colors.yellow(`${rawScore}%`)
              : colors.red(`${rawScore}%`)
          return {
            category: cat,
            pass: v.passed,
            warn: v.warnings > 0 ? colors.yellow(String(v.warnings)) : colors.gray('0'),
            fail: v.errors > 0 ? colors.red(String(v.errors)) : colors.green('0'),
            total,
            score: scoreStr,
            _rawScore: rawScore,
          }
        })
        .sort((a, b) => a._rawScore - b._rawScore)
        .map(({ _rawScore: _, ...rest }) => rest)

      if (catEntries.length > 0) {
        out.divider()
        out.subtitle('Category Breakdown')
        out.table(catEntries, [
          { key: 'category', label: 'Category', width: 22 },
          { key: 'pass', label: 'Pass', width: 6 },
          { key: 'warn', label: 'Warn', width: 6 },
          { key: 'fail', label: 'Fail', width: 6 },
          { key: 'total', label: 'Total', width: 7 },
          { key: 'score', label: 'Score', width: 8 },
        ])
        out.blank()
      }

      // ── Completeness ─────────────────────────────────────────────────────────
      const c = report.summary.completeness
      out.divider()
      out.subtitle('Completeness')
      const completenessFields: Array<[string, number]> = [
        ['Meta      ', c.meta],
        ['Social    ', c.social],
        ['Technical ', c.technical],
        ['Content   ', c.content],
        ['Images    ', c.images],
        ['Links     ', c.links],
      ]
      for (const [label, val] of completenessFields) {
        out.progress({ label, total: 100, current: val, width: 20 })
      }
      out.blank()

      // ── Performance & Timing ─────────────────────────────────────────────────
      out.divider()
      out.subtitle('Performance & Timing')
      const timing = report.timing
      const vitals = report.summary.vitals
      const timingRow1: string[] = []
      const timingRow2: string[] = []
      if (timing?.ttfb) timingRow1.push(`TTFB: ${colors.bold(ms(timing.ttfb))}`)
      if (timing?.total) timingRow1.push(`Total: ${colors.bold(ms(timing.total))}`)
      if (timing?.download) timingRow1.push(`Download: ${ms(timing.download)}`)
      if (timing?.dns) timingRow2.push(`DNS: ${ms(timing.dns)}`)
      if (timing?.tcp) timingRow2.push(`TCP: ${ms(timing.tcp)}`)
      if (timing?.tls) timingRow2.push(`TLS: ${ms(timing.tls)}`)
      if (timingRow1.length > 0) out.log(`  ${timingRow1.join('  ')}`)
      if (timingRow2.length > 0) out.log(`  ${colors.gray(timingRow2.join('  '))}`)
      if (vitals.htmlSize) out.log(`  Page size: ${Math.round(vitals.htmlSize / 1024)}KB  ${vitals.domElements ? `  DOM nodes: ${numFmt(vitals.domElements)}` : ''}`)
      out.blank()

      // ── Content ──────────────────────────────────────────────────────────────
      out.divider()
      out.subtitle('Content')
      const ct = report.content
      out.log(`  Words      : ${numFmt(vitals.wordCount)}  (~${Math.ceil(vitals.readingTime)} min read)`)
      if (ct.fleschReadingEase !== undefined) {
        const ease = Math.round(ct.fleschReadingEase)
        const easeLabel = ease >= 70 ? colors.green(`${ease}/100 (easy)`) : ease >= 50 ? colors.yellow(`${ease}/100 (moderate)`) : colors.red(`${ease}/100 (difficult)`)
        out.log(`  Readability: ${easeLabel}`)
      }
      out.log(`  Paragraphs : ${ct.paragraphCount}   Sentences: ${numFmt(ct.sentenceCount)}  (avg ${ct.avgWordsPerSentence.toFixed(1)} words)`)
      const ctExtras: string[] = []
      if (ct.listCount > 0) ctExtras.push(`Lists: ${ct.listCount}`)
      if (ct.strongTagCount > 0) ctExtras.push(`Bold: ${ct.strongTagCount}`)
      if (ct.emTagCount > 0) ctExtras.push(`Italic: ${ct.emTagCount}`)
      if (ctExtras.length > 0) out.log(`  ${colors.gray(ctExtras.join('  '))}`)
      out.blank()

      // ── Headings ─────────────────────────────────────────────────────────────
      out.divider()
      out.subtitle('Headings')
      const h = report.headings
      const h1Icon = h.h1Count === 1 ? colors.green('✔') : h.h1Count === 0 ? colors.red('✗') : colors.yellow('!')
      // Build counts by level from structure (deduplicated by level)
      const hLevelCounts: Record<number, number> = {}
      for (const s of h.structure) hLevelCounts[s.level] = (hLevelCounts[s.level] ?? 0) + 1
      const hCounts = Object.entries(hLevelCounts).sort(([a], [b]) => Number(a) - Number(b)).map(([lvl, cnt]) => `H${lvl}: ${cnt}`).join('  ')
      out.log(`  ${h1Icon} ${hCounts}  Hierarchy: ${h.hasProperHierarchy ? colors.green('✔ proper') : colors.yellow('⚠ issues')}`)
      if (h.issues?.length > 0) {
        for (const issue of h.issues.slice(0, 3)) out.log(colors.yellow(`  ⚠ ${issue}`))
      }
      // Render heading tree if available
      if (h.tree && h.tree.length > 0) {
        out.blank()
        function renderHeadingTree(nodes: typeof h.tree, parentPrefix: string): void {
          if (!nodes) return
          nodes.forEach((node, idx) => {
            const last = idx === nodes.length - 1
            const connector = last ? '└' : '├'
            out.log(colors.gray(`  ${parentPrefix}${connector} `) + colors.bold(`H${node.level}`) + `  ${node.text}`)
            if (node.children.length > 0) {
              renderHeadingTree(node.children, parentPrefix + (last ? '   ' : '│  '))
            }
          })
        }
        renderHeadingTree(h.tree, '')
      }
      out.blank()

      // ── Links ────────────────────────────────────────────────────────────────
      out.divider()
      out.subtitle('Links')
      const lk = report.links
      out.log(
        `  Internal: ${colors.blue(String(lk.internal))}  ` +
        `External: ${lk.external}  ` +
        `No-follow: ${lk.nofollow}  ` +
        `Broken: ${lk.broken > 0 ? colors.red(String(lk.broken)) : colors.green('0')}`
      )
      const lkExtras: string[] = []
      if (lk.withoutText > 0) lkExtras.push(colors.yellow(`⚠ ${lk.withoutText} without text`))
      if (lk.sponsoredLinks > 0) lkExtras.push(`Sponsored: ${lk.sponsoredLinks}`)
      if (lk.ugcLinks > 0) lkExtras.push(`UGC: ${lk.ugcLinks}`)
      if ((lk.internalHttpLinks ?? 0) > 0) lkExtras.push(colors.yellow(`⚠ ${lk.internalHttpLinks} HTTP internal`))
      if (lkExtras.length > 0) out.log(`  ${lkExtras.join('  ')}`)
      out.blank()

      // ── Images ───────────────────────────────────────────────────────────────
      out.divider()
      out.subtitle('Images')
      const img = report.images
      const altPct = img.total > 0 ? Math.round((img.withAlt / img.total) * 100) : 100
      const altColor = altPct >= 90 ? colors.green : altPct >= 60 ? colors.yellow : colors.red
      out.log(
        `  Total: ${img.total}  ` +
        `With alt: ${altColor(`${img.withAlt}/${img.total} (${altPct}%)`)}  ` +
        `Missing alt: ${img.withoutAlt > 0 ? colors.red(String(img.withoutAlt)) : colors.green('0')}`
      )
      const imgExtras: string[] = []
      if (img.lazy > 0) imgExtras.push(`Lazy-loaded: ${img.lazy}`)
      if (img.modernFormats > 0) imgExtras.push(`WebP/AVIF: ${img.modernFormats}`)
      if (img.missingDimensions > 0) imgExtras.push(colors.yellow(`⚠ Missing dims: ${img.missingDimensions}`))
      if (img.imagesWithAsyncDecoding > 0) imgExtras.push(`Async decode: ${img.imagesWithAsyncDecoding}`)
      if (imgExtras.length > 0) out.log(`  ${colors.gray(imgExtras.join('  '))}`)
      out.blank()

      // ── Technical SEO ────────────────────────────────────────────────────────
      out.divider()
      out.subtitle('Technical SEO')
      const tech = report.technical
      out.log(`  Canonical : ${tick(tech.hasCanonical)}${tech.canonicalUrl ? '  ' + colors.gray(trunc(tech.canonicalUrl, 60)) : ''}`)
      out.log(`  Language  : ${tick(tech.hasLang)}${tech.langValue ? '  ' + colors.gray(tech.langValue) : ''}`)
      out.log(`  Viewport  : ${tick(tech.hasViewport)}  Charset: ${tick(tech.hasCharset)}  Robots meta: ${tick(tech.hasRobotsMeta)}${tech.robotsContent?.length ? '  ' + colors.gray(tech.robotsContent.join(', ')) : ''}`)
      out.blank()

      // ── Helper: render a category section ────────────────────────────────────
      const renderCategorySection = (
        categoryKey: string,
        title: string,
        checksFilter: (c: { category: string; id: string; status: string }) => boolean,
        maxItems = 6,
        extraLines?: () => void
      ) => {
        const catData = report.summary.issuesByCategory[categoryKey]
        const relevantChecks = report.checks.filter(c => checksFilter(c) && (c.status === 'fail' || c.status === 'warn'))
        if (!catData && relevantChecks.length === 0) return

        const total = catData ? catData.passed + catData.warnings + catData.errors : 0
        const catScore = total > 0
          ? Math.round(((catData.passed * 100 + catData.warnings * 50) / (total * 100)) * 100)
          : relevantChecks.length === 0 ? 100 : 0
          const scoreColor = getScoreColor(catScore, colors, { high: 90, medium: 70 })
        const scoreStr = catData ? scoreColor(`${catScore}%`) : ''

        out.divider()
        out.subtitle(`${title}${scoreStr ? '  ' + scoreStr : ''}`)
        if (extraLines) extraLines()
        for (const check of relevantChecks.slice(0, maxItems)) {
          const icon = check.status === 'fail' ? colors.red('✖') : colors.yellow('⚠')
          out.log(`  ${icon} ${check.message}`)
          if (check.recommendation) out.log(`     ${colors.gray('→ ' + check.recommendation)}`)
        }
        if (relevantChecks.length > maxItems) {
          out.log(colors.gray(`  … +${relevantChecks.length - maxItems} more`))
        }
        out.blank()
      }

      // ── Core Web Vitals ──────────────────────────────────────────────────────
      renderCategorySection(
        'performance',
        'Core Web Vitals',
        (c) => c.id.startsWith('cwv-'),
        6,
        () => {
          const cwvChecks = report.checks.filter(c => c.id.startsWith('cwv-'))
          if (cwvChecks.length > 0) {
            const cwvPass = cwvChecks.filter(c => c.status === 'pass').length
            out.log(`  ${colors.gray(`${cwvPass}/${cwvChecks.length} CWV checks passed`)}`)
          }
        }
      )

      // ── Crawlability & Indexing ───────────────────────────────────────────────
      renderCategorySection(
        'crawlability',
        'Crawlability & Indexing',
        (c) => c.category === 'crawlability' || c.category === 'canonicalization',
        6
      )

      // ── Security ─────────────────────────────────────────────────────────────
      renderCategorySection(
        'security',
        'Security',
        (c) => c.category === 'security',
        6
      )

      // ── Mobile ───────────────────────────────────────────────────────────────
      renderCategorySection(
        'mobile',
        'Mobile',
        (c) => c.category === 'mobile' && !c.id.startsWith('pwa-'),
        5
      )

      // ── Accessibility ────────────────────────────────────────────────────────
      renderCategorySection(
        'accessibility',
        'Accessibility',
        (c) => c.category === 'accessibility',
        8
      )

      // ── PWA ──────────────────────────────────────────────────────────────────
      {
        const pwaChecks = report.checks.filter(c => c.id.startsWith('pwa-'))
        if (pwaChecks.length > 0) {
          const pwaFail = pwaChecks.filter(c => c.status === 'fail' || c.status === 'warn')
          const pwaPass = pwaChecks.filter(c => c.status === 'pass').length
          out.divider()
          out.subtitle(`PWA  ${colors.gray(`${pwaPass}/${pwaChecks.length} checks`)}`)
          for (const check of pwaFail.slice(0, 5)) {
            const icon = check.status === 'fail' ? colors.red('✖') : colors.yellow('⚠')
            out.log(`  ${icon} ${check.message}`)
          }
          if (pwaFail.length === 0) out.log(`  ${colors.green('✔')} PWA checks passed`)
          out.blank()
        }
      }

      // ── Internationalization ─────────────────────────────────────────────────
      renderCategorySection(
        'i18n',
        'Internationalization',
        (c) => c.category === 'i18n',
        5
      )

      // ── E-commerce ───────────────────────────────────────────────────────────
      {
        const ecChecks = report.checks.filter(c => c.id.startsWith('ecommerce-'))
        if (report.pageType === 'product' || ecChecks.length > 0) {
          const ecFail = ecChecks.filter(c => c.status === 'fail' || c.status === 'warn')
          const ecPass = ecChecks.filter(c => c.status === 'pass').length
          out.divider()
          out.subtitle(`E-commerce${ecChecks.length > 0 ? `  ${colors.gray(`${ecPass}/${ecChecks.length} checks`)}` : ''}`)
          for (const check of ecFail.slice(0, 6)) {
            const icon = check.status === 'fail' ? colors.red('✖') : colors.yellow('⚠')
            out.log(`  ${icon} ${check.message}`)
            if (check.recommendation) out.log(`     ${colors.gray('→ ' + check.recommendation)}`)
          }
          if (ecFail.length === 0 && ecChecks.length > 0) out.log(`  ${colors.green('✔')} E-commerce checks passed`)
          if (ecChecks.length === 0) out.log(`  ${colors.gray('No product schema detected')}`)
          out.blank()
        }
      }

      // ── Local SEO ─────────────────────────────────────────────────────────────
      {
        const localChecks = report.checks.filter(c => c.id.startsWith('local-'))
        if (localChecks.length > 0) {
          const localFail = localChecks.filter(c => c.status === 'fail' || c.status === 'warn')
          const localPass = localChecks.filter(c => c.status === 'pass').length
          out.divider()
          out.subtitle(`Local SEO  ${colors.gray(`${localPass}/${localChecks.length} checks`)}`)
          for (const check of localFail.slice(0, 5)) {
            const icon = check.status === 'fail' ? colors.red('✖') : colors.yellow('⚠')
            out.log(`  ${icon} ${check.message}`)
          }
          if (localFail.length === 0) out.log(`  ${colors.green('✔')} Local SEO checks passed`)
          out.blank()
        }
      }

      // ── AI Search Readiness ───────────────────────────────────────────────────
      renderCategorySection(
        'ai-search',
        'AI Search Readiness',
        (c) => c.category === 'ai-search',
        6
      )

      // ── Social & Meta Cards ───────────────────────────────────────────────────
      out.divider()
      out.subtitle('Social & Meta Cards')
      const og = report.openGraph
      const tw = report.twitterCard
      const soc = report.social

      out.log(`  ${colors.bold('Open Graph')}  ${soc.openGraph.present ? colors.green('configured') : colors.red('not configured')}`)
      out.log(`    Title : ${tick(soc.openGraph.hasTitle)}${og?.title ? '  ' + colors.gray(trunc(og.title, 60)) : '  ' + colors.red('Missing')}`)
      out.log(`    Desc  : ${tick(soc.openGraph.hasDescription)}${og?.description ? '  ' + colors.gray(trunc(og.description, 60)) : '  ' + colors.red('Missing')}`)
      out.log(`    Image : ${tick(soc.openGraph.hasImage)}${og?.image ? '  ' + colors.gray(trunc(og.image, 60)) : '  ' + colors.red('Missing')}`)
      out.log(`    URL   : ${tick(soc.openGraph.hasUrl)}${og?.url ? '  ' + colors.gray(trunc(og.url, 60)) : '  ' + colors.red('Missing')}`)
      if (og?.type) out.log(`    Type  : ${colors.gray(og.type)}${og.siteName ? `  Site: ${og.siteName}` : ''}`)
      if (soc.openGraph.issues?.length > 0) {
        for (const issue of soc.openGraph.issues.slice(0, 2)) out.log(colors.yellow(`    ⚠ ${issue}`))
      }
      out.blank()

      out.log(`  ${colors.bold('Twitter Card')}  ${soc.twitterCard.present ? colors.green('configured') : colors.red('not configured')}`)
      out.log(`    Card  : ${tick(soc.twitterCard.hasCard)}${tw?.card ? '  ' + colors.gray(tw.card) : '  ' + colors.red('Missing')}`)
      out.log(`    Title : ${tick(soc.twitterCard.hasTitle)}${tw?.title ? '  ' + colors.gray(trunc(tw.title, 60)) : '  ' + colors.red('Missing')}`)
      out.log(`    Desc  : ${tick(soc.twitterCard.hasDescription)}${tw?.description ? '  ' + colors.gray(trunc(tw.description, 60)) : '  ' + colors.red('Missing')}`)
      out.log(`    Image : ${tick(soc.twitterCard.hasImage)}${tw?.image ? '  ' + colors.gray(trunc(tw.image, 60)) : '  ' + colors.red('Missing')}`)
      if (tw?.site) out.log(`    Site  : ${colors.gray(tw.site)}`)
      if (soc.twitterCard.issues?.length > 0) {
        for (const issue of soc.twitterCard.issues.slice(0, 2)) out.log(colors.yellow(`    ⚠ ${issue}`))
      }
      out.blank()

      // ── Structured Data ─────────────────────────────────────────────────────
      out.divider()
      out.subtitle('Structured Data')
      const sd = report.structuredData
      if (sd.count > 0) {
        out.log(`  ${colors.green('✔')} ${sd.count} schema${sd.count !== 1 ? 's' : ''} detected`)
        if (sd.types?.length > 0) out.log(`  Types: ${colors.gray(sd.types.join(', '))}`)
        // Show key fields from structured data items
        for (const item of sd.items.slice(0, 3)) {
          const type = item['@type'] as string | undefined
          if (!type) continue
          const fields: string[] = []
          const checkField = (key: string, label: string) => {
            fields.push(item[key] !== undefined ? colors.green(label) : colors.gray(label + '?'))
          }
          if (type === 'Product' || type.includes('Product')) {
            checkField('name', 'name'); checkField('offers', 'price'); checkField('image', 'image')
            checkField('review', 'reviews'); checkField('brand', 'brand')
          } else if (type === 'Article' || type === 'BlogPosting' || type === 'NewsArticle') {
            checkField('headline', 'headline'); checkField('author', 'author'); checkField('datePublished', 'date')
            checkField('image', 'image')
          } else if (type === 'LocalBusiness' || type.includes('Business')) {
            checkField('name', 'name'); checkField('address', 'address'); checkField('telephone', 'phone')
            checkField('openingHours', 'hours')
          } else if (type === 'FAQPage') {
            checkField('mainEntity', 'questions')
          } else if (type === 'BreadcrumbList') {
            checkField('itemListElement', 'items')
          }
          if (fields.length > 0) out.log(`  ${colors.bold(type)}: ${fields.join('  ')}`)
        }
        // Show structured-data category checks
        const sdChecks = report.checks.filter(c => c.category === 'structured-data' && (c.status === 'fail' || c.status === 'warn'))
        for (const check of sdChecks.slice(0, 4)) {
          const icon = check.status === 'fail' ? colors.red('✖') : colors.yellow('⚠')
          out.log(`  ${icon} ${check.message}`)
        }
      } else {
        out.log(`  ${colors.yellow('○')} No JSON-LD structured data found`)
        const sdChecks = report.checks.filter(c => c.category === 'structured-data' && c.status === 'fail')
        for (const check of sdChecks.slice(0, 2)) {
          out.log(`  ${colors.red('✖')} ${check.message}`)
        }
      }
      out.blank()

      // ── Keywords ────────────────────────────────────────────────────────────
      if (report.keywords?.topKeywords?.length > 0) {
        out.divider()
        out.subtitle('Top Keywords')
        const kws = report.keywords.topKeywords.slice(0, 10)
        out.log(`  ${colors.gray(kws.map((k: { word: string; count: number }) => `${k.word} (${k.count})`).join('  ·  '))}`)
        out.blank()
      }

      // ── Errors (full detail with evidence) ──────────────────────────────────
      const errorChecks = report.checks.filter(c => c.status === 'fail')
      if (errorChecks.length > 0) {
        out.divider()
        out.subtitle(`Errors (${errorChecks.length})`)
        for (const check of errorChecks) {
          out.log(`  ${colors.red('✖')} ${colors.bold(`[${check.category}]`)} ${check.message}`)
          if (check.recommendation) {
            out.log(`     ${colors.gray('→ ' + check.recommendation)}`)
          }
          if (check.evidence) {
            if (check.evidence.found !== undefined) {
              const found = Array.isArray(check.evidence.found)
                ? check.evidence.found.slice(0, 3).join(', ') + (check.evidence.found.length > 3 ? ` … +${check.evidence.found.length - 3}` : '')
                : String(check.evidence.found)
              out.log(`     ${colors.gray(`Found: ${found}`)}`)
            }
            if (check.evidence.expected !== undefined) {
              out.log(`     ${colors.gray(`Expected: ${check.evidence.expected}`)}`)
            }
            if (check.evidence.impact) {
              out.log(`     ${colors.yellow(`Impact: ${check.evidence.impact}`)}`)
            }
          }
        }
        out.blank()
      }

      // ── Warnings grouped by category ─────────────────────────────────────────
      const warnChecks = report.checks.filter(c => c.status === 'warn')
      if (warnChecks.length > 0) {
        out.divider()
        out.subtitle(`Warnings (${warnChecks.length})`)
        const warnByCategory = new Map<string, typeof warnChecks>()
        for (const check of warnChecks) {
          const list = warnByCategory.get(check.category) ?? []
          list.push(check)
          warnByCategory.set(check.category, list)
        }
        for (const [cat, checks] of [...warnByCategory.entries()].sort(([a], [b]) => a.localeCompare(b))) {
          out.log(`  ${colors.bold(colors.yellow(cat))}`)
          for (const check of checks.slice(0, 8)) {
            out.log(`    ${colors.yellow('⚠')} ${check.message}`)
            if (check.recommendation) {
              out.log(`       ${colors.gray('→ ' + check.recommendation)}`)
            }
          }
          if (checks.length > 8) {
            out.log(colors.gray(`       … +${checks.length - 8} more`))
          }
        }
        out.blank()
      }

      // ── Quick Wins ──────────────────────────────────────────────────────────
      if (report.summary.quickWins?.length > 0) {
        out.divider()
        out.subtitle('Quick Wins')
        for (const win of report.summary.quickWins.slice(0, 6)) {
          out.log(`  ${colors.green('→')} ${win}`)
        }
        out.blank()
      }

      // ── Suggestions (info checks of type suggestion) ─────────────────────────
      const suggestionChecks = report.checks.filter(
        c => c.status === 'info' && c.infoType === 'suggestion'
      )
      if (suggestionChecks.length > 0) {
        out.divider()
        out.subtitle(`Suggestions (${suggestionChecks.length})`)
        for (const check of suggestionChecks.slice(0, 10)) {
          out.log(`  ${colors.blue('💡')} ${colors.gray(`[${check.category}]`)} ${check.message}`)
          if (check.recommendation) {
            out.log(`     ${colors.gray('→ ' + check.recommendation)}`)
          }
        }
        if (suggestionChecks.length > 10) {
          out.log(colors.gray(`  … and ${suggestionChecks.length - 10} more suggestions`))
        }
        out.blank()
      }

      // ── Timing footer ───────────────────────────────────────────────────────
      out.divider()
      out.log(colors.gray(`  Analyzed in ${report.timing?.total ?? duration}ms`))

      // ── SERP ────────────────────────────────────────────────────────────────
      if (serpConfig.enabled) {
        out.blank()
        if (!serpCampaign) {
          out.warn('SERP was enabled but no valid keyword extraction was possible.')
        } else {
          const executedCount = serpCampaign.campaign.summary.queriesExecuted
          const foundCount = serpCampaign.campaign.summary.queriesFound
          const totalChecked = serpCampaign.campaign.summary.queriesRequested
          out.divider()
          out.subtitle(`SERP: ${executedCount}/${totalChecked} searched | ${foundCount} found`)
          const primarySearchUrl = serpCampaign.campaign.results.find((item) => item.searchUrl)?.searchUrl

          if (primarySearchUrl) {
            try {
              const host = new URL(primarySearchUrl).hostname
              out.log(`  Search host: ${host}`)
            } catch {
              out.log(`  Search host: ${primarySearchUrl}`)
            }
          }

          const blockedCount = serpCampaign.campaign.summary.queriesBlocked ?? 0
          const captchaCount = serpCampaign.campaign.summary.queriesCaptcha ?? 0
          out.subtitle(`SERP campaign signals: ${foundCount}/${executedCount} found · ${blockedCount} blocked · ${captchaCount} captcha`)
          if (serpCampaign.campaign.summary.campaignStopped) {
            out.log(`  Campaign halted: ${serpCampaign.campaign.summary.campaignStopReason ?? 'campaign limit reached due to repeated blocks/captcha'}`)
          }

          const serpRows = formatSerpSummaryRows(serpCampaign.campaign).map(row => ({
            ...row,
            found: row.found
              ? colors.green('✔')
              : row.blocked
                ? colors.yellow('⚠')
                : colors.red('✗'),
            position: row.position ?? '-',
            blockReason: row.blocked ? row.blockReason : undefined,
          }))
          if (serpRows.length > 0) {
            out.table(serpRows, [
              { key: 'keyword', label: 'Keyword', width: 30 },
              { key: 'found', label: 'Found', width: 8 },
              { key: 'position', label: 'Pos', width: 8 },
              { key: 'blockReason', label: 'Status', width: 30 },
              { key: 'targetUrl', label: 'Our URL' },
            ])
          }

          const pageRows = getSerpComparisonRows(serpCampaign.campaign)
          if (pageRows.length > 0) {
            out.blank()
            out.subtitle('Appearance by page')
            out.table(pageRows, [
              { key: 'pageUrl', label: 'Page', width: 40 },
              { key: 'tracked', label: 'Searched', width: 9 },
              { key: 'found', label: 'Found', width: 8 },
              { key: 'appearanceRate', label: 'Ap.%', width: 9 },
              { key: 'avgPosition', label: 'Avg pos', width: 9 },
              { key: 'top3', label: 'Top3', width: 6 },
              { key: 'top10', label: 'Top10', width: 7 },
            ])
          }

          const topCompetitors = getSerpCompetitorRows(serpCampaign.campaign.summary.topOrganicCompetitors).slice(0, 8)
          if (topCompetitors.length > 0) {
            out.blank()
            out.subtitle('Main organic competitors')
            out.table(topCompetitors, [
              { key: 'domain', label: 'Domain', width: 30 },
              { key: 'queries', label: 'Queries', width: 8 },
              { key: 'matchedKeywords', label: 'Matched', width: 10 },
              { key: 'wins', label: 'Wins', width: 8 },
              { key: 'avgGap', label: 'Gap', width: 8 },
              { key: 'bestPages', label: 'Best pages' },
            ])
          }

          const shortSeeds = serpCampaign.plan.short.map((seed) => seed.keyword)
          const longTailSeeds = serpCampaign.plan.longTail.map((seed) => seed.keyword)
          if (shortSeeds.length > 0 || longTailSeeds.length > 0) {
            out.blank()
            out.subtitle('SERP seed keywords')
            if (shortSeeds.length > 0) {
              out.log(`  Short-tail (${shortSeeds.length}): ${formatKeywordList(shortSeeds, 14)}`)
            }
            if (longTailSeeds.length > 0) {
              out.log(`  Long-tail (${longTailSeeds.length}): ${formatKeywordList(longTailSeeds, 14)}`)
            }
          }
        }
      }
    }
  }
)

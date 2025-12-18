import { RekCommand as Command } from '../router.js';
import { promises as fs } from 'node:fs';
import colors from '../../utils/colors.js';
import { summarizeErrors, formatErrorSummary } from '../helpers.js';

export interface SpiderOptions {
  url: string;
  depth?: number;
  limit?: number;
  concurrency?: number;
  output?: string;
  focus?: string;
  seo?: boolean;
  robots?: boolean;
  json?: boolean;
}

export async function runSpider(opts: SpiderOptions) {
  const url = opts.url;
  const formatJson = !!opts.json;
  const outputFile = opts.output;
  const seoEnabled = !!opts.seo;
  const focusMode = opts.focus || 'all';
  const respectRobotsTxt = !!opts.robots;

  // Apply defaults
  const depth = opts.depth || 5;
  const limit = opts.limit || 100;
  const concurrency = opts.concurrency || 5;

  // Focus mode categories
  const focusCategories: Record<string, string[]> = {
    links: ['links'],
    duplicates: ['title', 'meta', 'content'], 
    security: ['security'],
    ai: ['ai-search'],
    resources: ['resources', 'performance'],
    all: [], 
  };

  let startUrl = url;
  if (!startUrl.startsWith('http')) startUrl = `https://${startUrl}`;

  // Don't print visual output in JSON mode
  if (!formatJson) {
    const modeLabel = seoEnabled ? colors.magenta(' + SEO') : '';
    const focusLabel = focusMode !== 'all' ? colors.cyan(` [focus: ${focusMode}]`) : '';
    console.log(colors.cyan(`
Spider starting: ${startUrl}`));
    console.log(colors.gray(`  Depth: ${depth} | Limit: ${limit} | Concurrency: ${concurrency}${modeLabel}${focusLabel}`));
    if (outputFile) {
      console.log(colors.gray(`  Output: ${outputFile}`));
    }
    console.log('');
  }

  try {
    // SEO Spider mode
    if (seoEnabled) {
      const { SeoSpider } = await import('../../seo/index.js');

      const seoSpider = new SeoSpider({
        maxDepth: depth,
        maxPages: limit,
        concurrency: concurrency,
        sameDomain: true,
        delay: 100,
        seo: true,
        respectRobotsTxt,
        output: outputFile || undefined,
        focusCategories: focusCategories[focusMode],
        focusMode: focusMode as any,
        onProgress: formatJson ? undefined : (progress) => {
          process.stdout.write(`\r${colors.gray('  Crawling:')} ${colors.cyan(progress.crawled.toString())} pages | ${colors.gray('Queue:')} ${progress.queued} | ${colors.gray('Depth:')} ${progress.depth}   `);
        },
      });

      const result = await seoSpider.crawl(startUrl);

      // JSON output mode - print structured data and exit
      if (formatJson) {
        // Calculate metrics for JSON output
        const responseTimes = result.pages.filter(p => p.duration > 0).map(p => p.duration);
        const avgResponseTime = responseTimes.length > 0
          ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
          : 0;

        // Calculate status distribution
        const statusCounts: Record<string, number> = {};
        for (const page of result.pages) {
          const key = page.status?.toString() || 'error';
          statusCounts[key] = (statusCounts[key] || 0) + 1;
        }

        // Calculate content stats
        let totalInternalLinks = 0;
        let totalExternalLinks = 0;
        let totalImages = 0;
        let imagesWithoutAlt = 0;

        for (const page of result.pages) {
          if (page.seoReport) {
            totalInternalLinks += page.seoReport.links?.internal || 0;
            totalExternalLinks += page.seoReport.links?.external || 0;
            totalImages += page.seoReport.images?.total || 0;
            imagesWithoutAlt += page.seoReport.images?.withoutAlt || 0;
          }
        }

        const jsonOutput = {
          startUrl: startUrl,
          crawledAt: new Date().toISOString(),
          duration: result.duration,
          config: {
            maxDepth: depth,
            maxPages: limit,
            concurrency: concurrency,
            focusMode,
          },
          summary: {
            totalPages: result.pages.length,
            uniqueUrls: result.visited.size,
            avgSeoScore: result.summary.avgScore,
            avgResponseTime,
            pagesWithErrors: result.summary.pagesWithErrors,
            pagesWithWarnings: result.summary.pagesWithWarnings,
            duplicateTitles: result.summary.duplicateTitles,
            duplicateDescriptions: result.summary.duplicateDescriptions,
            duplicateH1s: result.summary.duplicateH1s,
            orphanPages: result.summary.orphanPages,
          },
          discovery: result.discovery ? {
            humans: result.discovery.humans.found,
            llms: result.discovery.llms.found,
            sitemap: result.discovery.sitemap.found,
            manifest: result.discovery.manifest.found ? {
              valid: result.discovery.manifest.valid,
              issues: result.discovery.manifest.issues,
            } : undefined,
          } : undefined,
          rssFeeds: result.rssFeeds,
          content: {
            totalInternalLinks,
            totalExternalLinks,
            totalImages,
            imagesWithoutAlt,
          },
          httpStatus: statusCounts,
          siteWideIssues: result.siteWideIssues.map(issue => ({
            type: issue.type,
            severity: issue.severity,
            message: issue.message,
            value: issue.value,
            affectedUrls: issue.affectedUrls,
          })),
              pages: result.pages.map(page => ({
                url: page.url,
                status: page.status,
                depth: page.depth,
                duration: page.duration,
                title: page.title,
                error: page.error,
                seo: page.seoReport ? {
                  score: page.seoReport.score,
                  grade: page.seoReport.grade,
                  title: page.seoReport.title,
                  metaDescription: page.seoReport.metaDescription,
                  headings: page.seoReport.headings,
                  links: page.seoReport.links,
                  images: page.seoReport.images,
                  checks: page.seoReport.checks,
                } : null,
              })),
              errors: result.pages.filter(p => p.error).map(p => ({
                url: p.url,
                status: p.status,
                error: p.error
              })),
            };

        console.log(JSON.stringify(jsonOutput, null, 2));
        return;
      }

      // Clear progress line
      process.stdout.write('\r' + ' '.repeat(80) + '\r');

      // Print SEO Spider results (visual mode)
      console.log(colors.green(`\n✔ SEO Spider complete`) + colors.gray(` (${(result.duration / 1000).toFixed(1)}s)`));
      console.log(`  ${colors.cyan('Pages crawled')}: ${result.pages.length}`);
      console.log(`  ${colors.cyan('Unique URLs')}: ${result.visited.size}`);
      console.log(`  ${colors.cyan('Avg SEO Score')}: ${result.summary.avgScore}/100`);

      // Calculate performance metrics
      const responseTimes = result.pages.filter(p => p.duration > 0).map(p => p.duration);
      const avgResponseTime = responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : 0;
      const minResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
      const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
      const reqPerSec = result.duration > 0 ? (result.pages.length / (result.duration / 1000)).toFixed(1) : '0';

      // Calculate HTTP status distribution
      const statusCounts = new Map<string, number>();
      for (const page of result.pages) {
        const key = page.status ? page.status.toString() : 'error';
        statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
      }

      // Calculate link and image totals from SEO reports
      let totalInternalLinks = 0;
      let totalExternalLinks = 0;
      let totalImages = 0;
      let imagesWithoutAlt = 0;
      let pagesWithoutTitle = 0;
      let pagesWithoutDescription = 0;

      for (const page of result.pages) {
        if (page.seoReport) {
          totalInternalLinks += page.seoReport.links?.internal || 0;
          totalExternalLinks += page.seoReport.links?.external || 0;
          totalImages += page.seoReport.images?.total || 0;
          imagesWithoutAlt += page.seoReport.images?.withoutAlt || 0;
          if (!page.seoReport.title?.text) pagesWithoutTitle++;
          if (!page.seoReport.metaDescription?.text) pagesWithoutDescription++;
        }
      }

      // Show Performance section
      console.log(colors.bold('\n  Performance:'));
      console.log(`    ${colors.gray('Avg Response:')}  ${avgResponseTime}ms`);
      console.log(`    ${colors.gray('Min/Max:')}       ${minResponseTime}ms / ${maxResponseTime}ms`);
      console.log(`    ${colors.gray('Throughput:')}    ${reqPerSec} req/s`);

      // Show HTTP Status Distribution
      console.log(colors.bold('\n  HTTP Status:'));
      const sortedStatuses = Array.from(statusCounts.entries()).sort((a, b) => b[1] - a[1]);
      for (const [statusKey, count] of sortedStatuses.slice(0, 5)) {
        const statusNum = parseInt(statusKey);
        const statusColor = statusNum >= 400 ? colors.red :
                            statusNum >= 300 ? colors.yellow :
                            statusKey === 'error' ? colors.red : colors.green;
        const pct = ((count / result.pages.length) * 100).toFixed(0);
        console.log(`    ${statusColor(statusKey.padEnd(5))} ${count.toString().padStart(3)} (${pct}%)`);
      }

      // Show Content Stats
      console.log(colors.bold('\n  Content:'));
      console.log(`    ${colors.gray('Internal links:')} ${totalInternalLinks.toLocaleString()}`);
      console.log(`    ${colors.gray('External links:')} ${totalExternalLinks.toLocaleString()}`);
      console.log(`    ${colors.gray('Images:')}         ${totalImages.toLocaleString()} (${imagesWithoutAlt} missing alt)`);
      console.log(`    ${colors.gray('Missing title:')}  ${pagesWithoutTitle}`);
      console.log(`    ${colors.gray('Missing desc:')}   ${pagesWithoutDescription}`);

      // Show SEO summary
      console.log(colors.bold('\n  SEO Summary:'));
      const { summary } = result;
      console.log(`    ${colors.red('✗')} Pages with errors:     ${summary.pagesWithErrors}`);
      console.log(`    ${colors.yellow('⚠')} Pages with warnings:   ${summary.pagesWithWarnings}`);
      console.log(`    ${colors.magenta('⚐')} Duplicate titles:      ${summary.duplicateTitles}`);
      console.log(`    ${colors.magenta('⚐')} Duplicate descriptions:${summary.duplicateDescriptions}`);
      console.log(`    ${colors.magenta('⚐')} Duplicate H1s:         ${summary.duplicateH1s}`);
      console.log(`    ${colors.gray('○')} Orphan pages:          ${summary.orphanPages}`);

      // Show discovered site files
      if (result.discovery) {
        console.log(colors.bold('\n  Discovery:'));
        const { humans, llms, sitemap, manifest } = result.discovery;
        if (humans.found) console.log(`    ${colors.green('✔')} humans.txt found`);
        if (llms.found) console.log(`    ${colors.green('✔')} llms.txt found`);
        if (sitemap.found) {
          const urlCount = sitemap.urlCount ? ` (${sitemap.urlCount} URLs)` : '';
          console.log(`    ${colors.green('✔')} sitemap.xml found${urlCount}`);
        }
        if (manifest.found) {
          const status = manifest.valid ? colors.green('valid') : colors.yellow('invalid');
          console.log(`    ${colors.green('✔')} manifest.json found (${status})`);
          if (manifest.issues && manifest.issues.length > 0) {
            manifest.issues.slice(0, 3).forEach(issue => {
              console.log(`      ${colors.yellow('⚠')} ${issue}`);
            });
            if (manifest.issues.length > 3) {
              console.log(`      ${colors.gray(`...and ${manifest.issues.length - 3} more issues`)}`);
            }
          }
        }
        if (!humans.found && !llms.found && !sitemap.found && !manifest.found) {
          console.log(`    ${colors.gray('○')} No discovery files found`);
        }
      }

      // Show RSS feeds
      if (result.rssFeeds && result.rssFeeds.length > 0) {
        console.log(colors.bold('\n  RSS/Atom Feeds:'));
        result.rssFeeds.forEach(feed => {
          const typeLabel = feed.type === 'rss' ? 'RSS' : 'Atom';
          const title = feed.title ? `"${feed.title}"` : 'Untitled';
          const count = feed.itemCount > 0 ? `(${feed.itemCount} items)` : '';
          console.log(`    ${colors.green('✔')} ${colors.cyan(typeLabel)} ${title} ${colors.gray(count)}`);
          console.log(`      ${colors.gray(feed.url)}`);
        });
      }

      // Show site-wide issues (sorted by severity)
      if (result.siteWideIssues.length > 0) {
        console.log(colors.bold('\n  Site-Wide Issues:'));
        
        // Sort: Error > Warning > Info
        const sortedIssues = [...result.siteWideIssues].sort((a, b) => {
          const priority = { error: 0, warning: 1, info: 2 };
          return priority[a.severity] - priority[b.severity];
        });

        for (const issue of sortedIssues.slice(0, 10)) {
          const icon = issue.severity === 'error' ? colors.red('✗') :
                       issue.severity === 'warning' ? colors.yellow('⚠') : colors.gray('○');
          const colorFn = issue.severity === 'error' ? colors.red :
                          issue.severity === 'warning' ? colors.yellow : colors.gray;

          console.log(`    ${icon} ${colorFn(issue.message)}`);
          if (issue.value) {
            const truncatedValue = issue.value.length > 50 ? issue.value.slice(0, 47) + '...' : issue.value;
            console.log(`      ${colors.gray(`"${truncatedValue}"`)}`);
          }
          // Deduplicate affected URLs by pathname
          const uniquePaths = [...new Set(issue.affectedUrls.map(u => {
             try { return new URL(u).pathname; } catch { return u; }
          }))];
          
          if (uniquePaths.length <= 3) {
            for (const path of uniquePaths) {
              console.log(`      ${colors.gray('→')} ${path}`);
            }
          } else {
            console.log(`      ${colors.gray(`→ ${uniquePaths.length} pages affected`)}`);
          }
        }
        if (result.siteWideIssues.length > 10) {
          console.log(colors.gray(`    ... and ${result.siteWideIssues.length - 10} more issues`));
        }
      }

      // Show pages by SEO score (deduplicated by pathname)
      const pagesWithScores = result.pages
        .filter(p => p.seoReport)
        .sort((a, b) => (a.seoReport?.score || 0) - (b.seoReport?.score || 0));

      // Deduplicate by pathname, keeping lowest score per path
      const seenPaths = new Set<string>();
      const uniquePages = pagesWithScores.filter(page => {
        const path = new URL(page.url).pathname;
        if (seenPaths.has(path)) return false;
        seenPaths.add(path);
        return true;
      });

      if (uniquePages.length > 0) {
        console.log(colors.bold('\n  Pages by SEO Score:'));
        const worstPages = uniquePages.slice(0, 5);
        for (const page of worstPages) {
          const score = page.seoReport?.score || 0;
          const grade = page.seoReport?.grade || '?';
          const path = new URL(page.url).pathname;
          const scoreColor = score >= 80 ? colors.green : score >= 60 ? colors.yellow : colors.red;
          console.log(`    ${scoreColor(`${score.toString().padStart(3)}`)} ${colors.gray(`[${grade}]`)} ${path.slice(0, 50)}`);
        }
        if (uniquePages.length > 5) {
          console.log(colors.gray(`    ... and ${uniquePages.length - 5} more pages`));
        }
      }

      // Show output file location
      if (outputFile) {
        console.log(colors.green(`\n  Report saved to: ${outputFile}`));
      }

    } else {
      // Regular spider (non-SEO mode)
      const { Spider } = await import('../../scrape/spider.js');

      const spider = new Spider({
        maxDepth: depth,
        maxPages: limit,
        concurrency: concurrency,
        sameDomain: true,
        delay: 100,
        respectRobotsTxt,
        onProgress: formatJson ? undefined : (progress) => {
          process.stdout.write(`\r${colors.gray('  Crawling:')} ${colors.cyan(progress.crawled.toString())} pages | ${colors.gray('Queue:')} ${progress.queued} | ${colors.gray('Depth:')} ${progress.depth}   `);
        },
      });

      const result = await spider.crawl(startUrl);

      // JSON output mode
      if (formatJson) {
        const jsonOutput = {
          startUrl: result.startUrl,
          crawledAt: new Date().toISOString(),
          duration: result.duration,
          config: {
            maxDepth: depth,
            maxPages: limit,
            concurrency: concurrency,
          },
          summary: {
            totalPages: result.pages.length,
            successCount: result.pages.filter(p => !p.error).length,
            errorCount: result.errors.length,
            uniqueUrls: result.visited.size,
          },
                                      pages: result.pages.map(p => ({
                                        url: p.url,
                                        status: p.status,
                                        title: p.title,
                                        depth: p.depth,
                                        linksCount: p.links.length,
                                        duration: p.duration,
                                        error: p.error,
                                        meta: p.meta,
                                        metrics: p.metrics,
                                        social: p.social,
                                      })),                        errors: result.pages.filter(p => p.error).map(p => ({
                          url: p.url,
                          status: p.status,
                          error: p.error
                        })),
                      };        console.log(JSON.stringify(jsonOutput, null, 2));
        return;
      }

      // Clear progress line
      process.stdout.write('\r' + ' '.repeat(80) + '\r');

      // Print results (visual mode)
      console.log(colors.green(`\n✔ Spider complete`) + colors.gray(` (${(result.duration / 1000).toFixed(1)}s)`));
      console.log(`  ${colors.cyan('Pages crawled')}: ${result.pages.length}`);
      console.log(`  ${colors.cyan('Unique URLs')}: ${result.visited.size}`);
      console.log(`  ${colors.cyan('Errors')}: ${result.errors.length}`);

      // Show pages by depth
      const byDepth = new Map<number, number>();
      for (const page of result.pages) {
        byDepth.set(page.depth, (byDepth.get(page.depth) || 0) + 1);
      }
      console.log(colors.bold('\n  Pages by depth:'));
      for (const [depth, count] of Array.from(byDepth.entries()).sort((a, b) => a[0] - b[0])) {
        const bar = '█'.repeat(Math.min(count, 40));
        console.log(`    ${colors.gray(`d${depth}:`)} ${bar} ${count}`);
      }

      // Show top pages by links
      const topPages = [...result.pages]
        .filter(p => !p.error)
        .sort((a, b) => b.links.length - a.links.length)
        .slice(0, 10);

      if (topPages.length > 0) {
        console.log(colors.bold('\n  Top pages by outgoing links:'));
        for (const page of topPages) {
          const title = page.title.slice(0, 40) || new URL(page.url).pathname;
          console.log(`    ${colors.cyan(page.links.length.toString().padStart(3))} ${title}`);
        }
      }

      // Show errors using centralized error handler
      if (result.errors.length > 0) {
        const errorSummary = summarizeErrors(result.errors);
        console.log(formatErrorSummary(errorSummary));
      }

      // Save to file if requested
      if (outputFile) {
        const jsonOutput = {
          startUrl: result.startUrl,
          crawledAt: new Date().toISOString(),
          duration: result.duration,
          summary: {
            totalPages: result.pages.length,
            successCount: result.pages.filter(p => !p.error).length,
            errorCount: result.errors.length,
            uniqueUrls: result.visited.size,
          },
                                      pages: result.pages.map(p => ({
                                        url: p.url,
                                        status: p.status,
                                        title: p.title,
                                        depth: p.depth,
                                        linksCount: p.links.length,
                                        duration: p.duration,
                                        error: p.error,
                                        meta: p.meta,
                                        metrics: p.metrics,
                                        social: p.social,
                                      })),                        errors: result.pages.filter(p => p.error).map(p => ({
                          url: p.url,
                          status: p.status,
                          error: p.error
                        })),
                      };        await fs.writeFile(outputFile, JSON.stringify(jsonOutput, null, 2));
        console.log(colors.green(`\n  Report saved to: ${outputFile}`));
      }
    }

    console.log('');
  } catch (error: any) {
    console.error(colors.red(`\nSpider failed: ${error.message}`));
    process.exit(1);
  }
}

export function registerSpiderCommand(program: Command) {
  program
    .command('spider')
    .alias('crawl')
    .description('Crawl a website and analyze all pages with optional SEO analysis')
    .argument('<url>', {
      type: 'url',
      description: 'Starting URL to crawl',
      example: 'example.com',
    })
    .option('depth', {
      type: 'number',
      short: 'd',
      default: 5,
      description: 'Max link depth to follow',
      example: '3',
    })
    .option('limit', {
      type: 'number',
      short: 'l',
      default: 100,
      description: 'Max pages to crawl',
      example: '50',
    })
    .option('concurrency', {
      type: 'number',
      short: 'c',
      default: 5,
      description: 'Number of parallel requests',
      example: '10',
    })
    .option('output', {
      type: 'string',
      short: 'o',
      description: 'Save JSON report to file',
      example: 'report.json',
    })
    .option('focus', {
      type: 'string',
      short: 'f',
      default: 'all',
      enum: ['all', 'links', 'duplicates', 'security', 'ai', 'resources'],
      description: 'Focus SEO analysis on specific area',
    })
    .option('seo', {
      short: 'S',
      description: 'Enable SEO analysis mode',
    })
    .option('robots', {
      short: 'r',
      description: 'Respect robots.txt rules',
    })
    .example('rek spider example.com', 'Basic crawl')
    .example('rek spider example.com -d 3 -l 50', 'Depth 3, max 50 pages')
    .example('rek spider example.com --seo', 'Enable SEO analysis')
    .example('rek spider example.com --seo -f security', 'Focus on security issues')
    .example('rek spider example.com --seo -o report.json', 'Save SEO report')
    .action(async (url: string, args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      await runSpider({
        url,
        depth: options.depth,
        limit: options.limit,
        concurrency: options.concurrency,
        output: options.output,
        focus: options.focus,
        seo: options.seo,
        robots: options.robots,
        json: options.json,
      });
    });
}

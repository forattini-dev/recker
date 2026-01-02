import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';
import { formatSeoReport, formatSeoReportJson, type SeoFormatOptions } from '../../seo/formatter.js';
import { resolveOutputPath, writeReport, formatReportForJson } from '../../seo/output.js';

export function registerSeoCommand(program: Command) {
  program
    .command('seo')
    .description('Analyze SEO for a webpage with comprehensive technical, content, and performance checks')
    .argument('<url>', {
      type: 'url',
      description: 'URL to analyze',
      example: 'example.com',
    })
    .option('all', {
      short: 'a',
      description: 'Show all checks including passed',
    })
    .option('evidence', {
      short: 'e',
      description: 'Show detailed evidence for issues',
    })
    .option('compact', {
      short: 'c',
      description: 'Compact output mode',
    })
    .option('no-content', {
      description: 'Skip content analysis',
    })
    .option('links', {
      short: 'l',
      description: 'Check broken links (slower)',
    })
    .option('category', {
      type: 'string',
      short: 'C',
      enum: ['performance', 'security', 'content', 'links', 'images', 'meta', 'technical', 'accessibility', 'og', 'twitter'],
      description: 'Filter by category',
    })
    .option('output', {
      type: 'string',
      short: 'o',
      description: 'Save report to file',
      example: 'report.json',
    })
    .option('outputDir', {
      type: 'string',
      short: 'O',
      description: 'Save report to directory (auto-generates filename)',
      example: '~/reports/',
    })
    .option('verbose', {
      short: 'v',
      description: 'Show detailed technical sections',
    })
    .example('rek seo example.com', 'Run SEO audit')
    .example('rek seo example.com -o report.json', 'Save to file')
    .example('rek seo example.com -O ~/reports/', 'Save with auto-filename')
    .example('rek seo example.com --json', 'Get JSON report')
    .example('rek seo example.com -a', 'Show all checks')
    .example('rek seo example.com -e', 'Show evidence for issues')
    .example('rek seo example.com -C performance', 'Only performance checks')
    .action(async (url: string, args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const jsonOutput = !!options.json;
      const analyzeContent = !options['no-content'];
      const checkBrokenLinks = !!options.links;
      const outputPath = options.output as string | undefined;
      const outputDir = options.outputDir as string | undefined;
      const verbose = !!options.verbose;

      if (!url.startsWith('http')) url = `https://${url}`;

      // Extract domain for auto-filename
      let domain: string;
      try {
        domain = new URL(url).hostname;
      } catch {
        domain = url.replace(/^https?:\/\//, '').split('/')[0];
      }

      // Resolve output path
      const finalOutputPath = resolveOutputPath({
        output: outputPath,
        outputDir,
        type: 'seo',
        domain,
      });

      const { SeoAnalyzer } = await import('../../seo/analyzer.js');
      const { createClient } = await import('../../core/client.js');

      if (!jsonOutput) {
        console.log(colors.gray(`Analyzing ${url}...`));
      }

      try {
        const client = createClient();
        const startTime = performance.now();
        const response = await client.get(url);
        const html = await response.text();
        const duration = Math.round(performance.now() - startTime);
        const responseHeaders = Object.fromEntries(response.headers.entries());

        const analyzer = await SeoAnalyzer.fromHtml(html, {
          baseUrl: url,
          analyzeContent,
          checkBrokenLinks,
          responseHeaders
        });

        let report = analyzer.analyze();

        // Filter by category if specified
        const categoryFilter = options.category as string | undefined;
        if (categoryFilter) {
          const normalizedFilter = categoryFilter.toLowerCase();
          const filteredChecks = report.checks.filter(
            check => check.category.toLowerCase() === normalizedFilter
          );

          // Recalculate summary for filtered checks
          const passed = filteredChecks.filter(c => c.status === 'pass').length;
          const warnings = filteredChecks.filter(c => c.status === 'warn').length;
          const errors = filteredChecks.filter(c => c.status === 'fail').length;
          const infos = filteredChecks.filter(c => c.status === 'info').length;
          const totalChecks = filteredChecks.length;

          report = {
            ...report,
            checks: filteredChecks,
            summary: {
              ...report.summary,
              totalChecks,
              passed,
              warnings,
              errors,
              infos,
              passRate: totalChecks > 0 ? Math.round((passed / totalChecks) * 100) : 0,
              topIssues: report.summary.topIssues.filter(
                issue => issue.category.toLowerCase() === normalizedFilter
              ),
            },
          };

          if (!jsonOutput) {
            console.log(colors.gray(`Filtered to category: ${categoryFilter} (${totalChecks} checks)`));
          }
        }

        // Inject timing data
        const t = response.timings;
        report.timing = {
          ttfb: t?.firstByte ? Math.round(t.firstByte) : undefined,
          total: t?.total ? Math.round(t.total) : duration,
          dns: t?.dns ? Math.round(t.dns) : undefined,
          tcp: t?.tcp ? Math.round(t.tcp) : undefined,
          tls: t?.tls ? Math.round(t.tls) : undefined,
          download: t?.content ? Math.round(t.content) : undefined,
        };

        // Format options with verbose and responseHeaders
        const formatOptions: SeoFormatOptions = {
          showAll: !!options.all,
          showEvidence: !!options.evidence,
          compact: !!options.compact,
          showKeywords: true,
          showTiming: true,
          verbose,
          responseHeaders,
        };

        // Handle output
        if (jsonOutput || finalOutputPath) {
          const jsonResult = formatReportForJson(
            formatSeoReportJson(report, url, { responseHeaders }),
            url,
            'seo'
          );

          if (finalOutputPath) {
            // Save to file
            const savedPath = await writeReport(finalOutputPath, jsonResult);
            if (!jsonOutput) {
              // Also show human output if not --json
              console.log(formatSeoReport(report, url, formatOptions));
            }
            console.log(colors.green(`\n✔ Report saved to: ${savedPath}`));
          } else {
            // JSON to stdout
            console.log(JSON.stringify(jsonResult, null, 2));
          }
          return;
        }

        // Human-readable output to stdout
        console.log(formatSeoReport(report, url, formatOptions));

      } catch (error: any) {
        console.error(colors.red(`Analysis failed: ${error.message}`));
        process.exit(1);
      }
    });
}

import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';
import { CommandSchema, RekArgs, generateHelp } from '../parser/index.js';
import { formatSeoReport, formatSeoReportJson, type SeoFormatOptions } from '../../seo/formatter.js';

const seoSchema: CommandSchema = {
  name: 'seo',
  description: 'Analyze SEO for a webpage.\nRuns a comprehensive SEO audit including technical, content, and performance checks.',
  flags: {
    json: { description: 'Output report as JSON' },
    all: { description: 'Show all checks including passed', alias: 'a' },
    evidence: { description: 'Show detailed evidence for issues', alias: 'e' },
    compact: { description: 'Compact output mode', alias: 'c' },
    content: { description: 'Analyze content depth/quality', default: true },
    'no-content': { description: 'Skip content analysis' },
    links: { description: 'Check broken links (slower)', default: false }
  },
  params: {
    category: {
      type: 'string',
      description: 'Filter by category (e.g., performance, security, content, links, images, meta, technical, accessibility, og, twitter)',
    },
  },
  keywords: {
    all: { description: 'Show all checks including passed', mapTo: 'all' },
    json: { description: 'Output report as JSON', mapTo: 'json' },
    evidence: { description: 'Show detailed evidence', mapTo: 'evidence' },
    compact: { description: 'Compact output', mapTo: 'compact' },
  },
  examples: [
    { cmd: 'rek seo example.com', desc: 'Run SEO audit' },
    { cmd: 'rek seo example.com --json', desc: 'Get JSON report' },
    { cmd: 'rek seo example.com -a', desc: 'Show all checks' },
    { cmd: 'rek seo example.com -e', desc: 'Show evidence for issues' },
    { cmd: 'rek seo example.com category=performance', desc: 'Only performance checks' },
    { cmd: 'rek seo example.com category=security', desc: 'Only security checks' }
  ]
};

export function registerSeoCommand(program: Command) {
  program
    .command('seo')
    .description(seoSchema.description)
    .argument('<url>', 'URL to analyze')
    .argument('[args...]', 'Options')
    .addHelpText('after', generateHelp(seoSchema))
    .action(async (url, rawArgs) => {
      const { options, data } = RekArgs.parse(rawArgs, seoSchema);
      // Support both flags (--json, -a) and keywords (json, all)
      const jsonOutput = !!options.json || !!data.json;
      const analyzeContent = options['no-content'] ? false : (options.content !== false);
      const checkBrokenLinks = !!options.links;

      const formatOptions: SeoFormatOptions = {
        showAll: !!options.all || !!data.all,
        showEvidence: !!options.evidence || !!data.evidence,
        compact: !!options.compact || !!data.compact,
        showKeywords: true,
        showTiming: true,
      };

      if (!url.startsWith('http')) url = `https://${url}`;

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
        const categoryFilter = data.category as string | undefined;
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

        if (jsonOutput) {
          const jsonResult = formatSeoReportJson(report, url);
          console.log(JSON.stringify(jsonResult, null, 2));
          return;
        }

        // Use unified formatter
        console.log(formatSeoReport(report, url, formatOptions));

      } catch (error: any) {
        console.error(colors.red(`Analysis failed: ${error.message}`));
        process.exit(1);
      }
    });
}

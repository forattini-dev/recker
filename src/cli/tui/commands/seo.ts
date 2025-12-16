import colors from '../../../utils/colors.js';
import { analyzeSeo } from '../../../seo/index.js';
import { formatSeoReport, formatSeoReportJson, type SeoFormatOptions } from '../../../seo/formatter.js';
import { ShellContext } from './context.js';
import { CommandSchema, RekArgs } from '../../parser/index.js';

const schema: CommandSchema = {
  name: 'seo',
  description: 'Analyze page SEO',
  params: {
    format: { type: 'string', choices: ['json'], description: 'Output format' }
  },
  flags: {
    all: { description: 'Show all checks', alias: 'a' },
    evidence: { description: 'Show detailed evidence', alias: 'e' },
    compact: { description: 'Compact output', alias: 'c' }
  }
};

export async function runSeo(ctx: ShellContext, rawArgs: string[]) {
    // Parse args using the unified parser
    const { data, options, args } = RekArgs.parse(rawArgs, schema);

    let url = args[0] as string;
    const jsonOutput = data.format === 'json';

    const formatOptions: SeoFormatOptions = {
      showAll: !!options.all,
      showEvidence: !!options.evidence,
      compact: !!options.compact,
      showKeywords: true,
      showTiming: true,
    };

    if (!url) {
      // Try to use current document or base URL
      url = ctx.currentDocUrl || ctx.baseUrl || '';
      if (!url) {
        console.log(colors.yellow('Usage: seo <url> [-a] [-e] [--format json]'));
        console.log(colors.gray('  Examples: seo google.com | seo https://example.com -a'));
        console.log(colors.gray('  -a, --all       Show all checks (including passed)'));
        console.log(colors.gray('  -e, --evidence  Show detailed evidence for issues'));
        console.log(colors.gray('  -c, --compact   Compact output mode'));
        console.log(colors.gray('  --format json   Output raw JSON for programmatic use'));
        console.log(colors.gray('  Or set a base URL first: url https://example.com'));
        return;
      }
    } else if (!url.startsWith('http') && !url.startsWith('-')) {
      url = `https://${url}`;
    }

    if (!jsonOutput) {
      console.log(colors.gray(`Analyzing SEO for ${url}...`));
    }
    const startTime = performance.now();

    try {
      // Fetch the page
      const res = await ctx.client.get(url);
      const html = await res.text();
      const duration = Math.round(performance.now() - startTime);

      // Run SEO analysis
      const report = await analyzeSeo(html, { baseUrl: url });

      // Inject timing data from undici's diagnostics
      const t = res.timings;
      report.timing = {
        ttfb: t?.firstByte ? Math.round(t.firstByte) : undefined,
        total: t?.total ? Math.round(t.total) : duration,
        dns: t?.dns ? Math.round(t.dns) : undefined,
        tcp: t?.tcp ? Math.round(t.tcp) : undefined,
        tls: t?.tls ? Math.round(t.tls) : undefined,
        download: t?.content ? Math.round(t.content) : undefined,
      };

      // JSON output mode for programmatic use
      if (jsonOutput) {
        const jsonResult = formatSeoReportJson(report, url);
        console.log(JSON.stringify(jsonResult, null, 2));
        ctx.lastResponse = jsonResult;
        return;
      }

      // Use unified formatter (same as CLI)
      console.log(formatSeoReport(report, url, formatOptions));

      // Store for potential further use
      ctx.lastResponse = report;

    } catch (error: any) {
      console.error(colors.red(`SEO analysis failed: ${error.message}`));
    }
}

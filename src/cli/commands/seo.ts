/**
 * SEO CLI Commands
 *
 * This file registers SEO commands with the CLI router.
 * Delegates to unified handlers via the adapter.
 */

import { RekCommand as Command } from '../router.js';
import { createCliActionWithOptions } from '../cli-adapter.js';
import { seoAnalyzeHandler } from '../handlers/seo.js';

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
    .example('rek seo example.com', 'Run SEO audit')
    .example('rek seo example.com -o report.json', 'Save to file')
    .example('rek seo example.com -O ~/reports/', 'Save with auto-filename')
    .example('rek seo example.com --json', 'Get JSON report')
    .example('rek seo example.com -a', 'Show all checks')
    .example('rek seo example.com -C performance', 'Only performance checks')
    .action(createCliActionWithOptions(seoAnalyzeHandler, {
      positional: ['url'],
      options: ['all', 'category', 'output', 'outputDir', 'json']
    }));
}

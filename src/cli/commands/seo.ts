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
    .option('json', {
      type: 'boolean',
      description: 'Output report in JSON',
    })
    .option('serp', {
      type: 'boolean',
      description: 'Run SERP checks for extracted top keywords',
    })
    .option('serp-top-keywords', {
      type: 'number',
      description: 'Top keywords per page used to seed SERP',
      example: '20',
    })
    .option('serp-query-limit', {
      type: 'number',
      description: 'Number of queries to run in SERP',
      example: '10',
    })
    .option('serp-results-per-query', {
      type: 'number',
      description: 'Results fetched per SERP query',
      example: '10',
    })
    .option('serp-concurrency', {
      type: 'number',
      description: 'Number of parallel SERP queries',
      example: '4',
    })
    .option('serp-delay-ms', {
      type: 'number',
      description: 'Base delay in ms between SERP queries',
      example: '450',
    })
    .option('serp-delay-jitter-ms', {
      type: 'number',
      description: 'Random delay jitter in ms between SERP queries',
      example: '250',
    })
    .option('serp-max-consecutive-blocks', {
      type: 'number',
      description: 'Stop campaign after this many consecutive blocked/captcha responses (0 = never)',
      example: '5',
    })
    .option('serp-captcha-cooldown-ms', {
      type: 'number',
      description: 'Cooldown in ms after captcha before continuing SERP queries',
      example: '1200',
    })
    .option('serp-retry-count', {
      type: 'number',
      description: 'Retry count per SERP query',
      example: '1',
    })
    .option('serp-retry-delay-ms', {
      type: 'number',
      description: 'Base delay in ms for SERP query retries',
      example: '900',
    })
    .option('serp-transport', {
      type: 'string',
      default: 'curl',
      description: 'Search transport (auto | undici | curl)',
      example: 'curl',
    })
    .option('serp-source', {
      type: 'string',
      default: 'google',
      description: 'Search source/provider. Current options: google',
      example: 'google',
    })
    .option('serp-timeout', {
      type: 'number',
      description: 'Search timeout (ms)',
      example: '15000',
    })
    .option('serp-country', {
      type: 'string',
      description: 'Country/region for SERP results',
      example: 'br',
    })
    .option('serp-gl', {
      type: 'string',
      description: 'Google GL parameter',
    })
    .option('serp-hl', {
      type: 'string',
      description: 'Google HL parameter',
    })
    .option('serp-human-profile', {
      type: 'string',
      description: 'Human-like SERP query profile: chrome or off',
      default: 'chrome',
    })
    .example('rek seo example.com', 'Run SEO audit')
    .example('rek seo example.com -o report.json', 'Save to file')
    .example('rek seo example.com -O ~/reports/', 'Save with auto-filename')
    .example('rek seo example.com --json', 'Get JSON report')
    .example('rek seo example.com --serp', 'Run SERP check')
    .example('rek seo example.com --serp --serp-top-keywords 12 --serp-query-limit 10', 'Run SERP with tuned limits')
    .example('rek seo example.com -a', 'Show all checks')
    .example('rek seo example.com -C performance', 'Only performance checks')
    .action(createCliActionWithOptions(seoAnalyzeHandler, {
      positional: ['url'],
      options: [
        'all',
        'category',
        'output',
        'outputDir',
        'json',
        'serp',
        'serp-top-keywords',
        'serp-query-limit',
        'serp-results-per-query',
        'serp-concurrency',
        'serp-delay-ms',
        'serp-delay-jitter-ms',
        'serp-max-consecutive-blocks',
        'serp-captcha-cooldown-ms',
        'serp-retry-count',
        'serp-retry-delay-ms',
        'serp-transport',
        'serp-source',
        'serp-timeout',
        'serp-country',
        'serp-gl',
        'serp-hl',
        'serp-human-profile',
      ],
      optionMapping: {
        'output-dir': 'outputDir',
        'serp-top-keywords': 'serpTopKeywords',
        'serp-query-limit': 'serpQueryLimit',
        'serp-results-per-query': 'serpResultsPerQuery',
        'serp-concurrency': 'serpConcurrency',
        'serp-delay-ms': 'serpDelayMs',
        'serp-delay-jitter-ms': 'serpDelayJitterMs',
        'serp-max-consecutive-blocks': 'serpMaxConsecutiveBlocks',
        'serp-captcha-cooldown-ms': 'serpCaptchaCooldownMs',
        'serp-retry-count': 'serpRetryCount',
        'serp-retry-delay-ms': 'serpRetryDelayMs',
        'serp-transport': 'serpTransport',
        'serp-source': 'serpSource',
        'serp-timeout': 'serpTimeout',
        'serp-country': 'serpCountry',
        'serp-gl': 'serpGl',
        'serp-hl': 'serpHl',
        'serp-human-profile': 'serpHumanProfile',
      },
    }));
}

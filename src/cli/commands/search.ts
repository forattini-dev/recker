/**
 * Search CLI Commands
 *
 * Standalone SERP request without running a full SEO crawl.
 */

import { RekCommand as Command } from '../router.js';
import { createCliActionWithOptions } from '../cli-adapter.js';
import { searchHandler } from '../handlers/search.js';

export function registerSearchCommand(program: Command) {
  program
    .command('search')
    .description('Run a single Google search query and show top results')
    .argument('<query>', {
      type: 'string',
      description: 'Search query',
      example: 'stone',
    })
    .option('site', {
      type: 'string',
      description: 'Limit results to a site/domain (as_sitesearch)',
      example: 'stone.com.br',
    })
    .option('country', {
      type: 'string',
      description: 'Country code or country name for locale inference',
      example: 'br',
    })
    .option('gl', {
      type: 'string',
      description: 'Override country code for Google locale',
      example: 'br',
    })
    .option('hl', {
      type: 'string',
      description: 'Interface language code',
      example: 'pt-BR',
    })
    .option('num', {
      type: 'number',
      default: 10,
      description: 'Number of results',
      example: '10',
    })
    .option('start', {
      type: 'number',
      default: 0,
      description: 'Start offset for paginated results',
    })
    .option('human-profile', {
      type: 'string',
      default: 'chrome',
      description: 'human-search signature (chrome|off)',
    })
    .option('as-site-search', {
      type: 'string',
      description: 'Site filter alias (same as --site)',
    })
    .option('exact-phrase', {
      type: 'string',
      description: 'Exact phrase query (as_epq)',
    })
    .option('source', {
      type: 'string',
      default: 'google',
      description: 'Search source/provider. Current options: google',
      example: 'google',
    })
    .option('transport', {
      type: 'string',
      default: 'curl',
      description: 'Search transport (auto | undici | curl)',
      example: 'curl',
    })
    .option('timeout', {
      type: 'number',
      description: 'Search request timeout (ms)',
      example: '15000',
    })
    .option('include-raw-html', {
      type: 'boolean',
      description: 'Include raw HTML in JSON output',
    })
    .example('rek search "stone" --country br', 'Search query in Google BR')
    .example('rek search "stone" --site stone.com.br --num 5 --transport curl', 'Limit to domain + use curl')
    .example('rek search "como ativar pix" --country br --as-site-search stone.com.br', 'Search exact phrase on domain')
    .action(createCliActionWithOptions(searchHandler, {
      positional: ['query'],
      options: [
        'site',
        'country',
        'gl',
        'hl',
        'num',
        'start',
        'exact-phrase',
        'human-profile',
        'as-site-search',
        'source',
        'transport',
        'timeout',
        'include-raw-html',
        'json',
      ],
      optionMapping: {
        'exact-phrase': 'exactPhrase',
        'human-profile': 'humanProfile',
        'as-site-search': 'asSiteSearch',
        'include-raw-html': 'includeRawHtml',
      },
    }));
}

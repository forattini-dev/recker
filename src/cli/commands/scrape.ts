/**
 * Scrape CLI Commands
 *
 * This file registers scrape commands with the CLI router.
 * Delegates to unified handlers via the adapter.
 */

import { RekCommand as Command } from '../router.js';
import { createCliActionWithOptions } from '../cli-adapter.js';
import { scrapeHandler } from '../handlers/scrape.js';

export function registerScrapeCommand(program: Command) {
  program
    .command('scrape')
    .alias('extract')
    .description('Extract data from web pages using CSS selectors or built-in extractors')
    .argument('<url>', {
      type: 'url',
      description: 'URL to scrape',
      example: 'example.com',
    })
    .option('select', {
      type: 'string',
      short: 's',
      description: 'CSS selector to extract elements',
      example: 'h1',
    })
    .option('attr', {
      type: 'string',
      short: 'a',
      description: 'Extract specific attribute (use with --select)',
      example: 'href',
    })
    .option('links', {
      short: 'L',
      description: 'Extract all links with text and href',
    })
    .option('images', {
      short: 'I',
      description: 'Extract all images with src and alt',
    })
    .option('meta', {
      short: 'M',
      description: 'Extract all meta tags',
    })
    .option('tables', {
      short: 'T',
      description: 'Extract tables as structured JSON',
    })
    .option('scripts', {
      short: 'S',
      description: 'Extract all external script sources',
    })
    .option('jsonld', {
      description: 'Extract JSON-LD structured data',
    })
    .example('rek scrape example.com', 'Show basic page info')
    .example('rek scrape example.com -s "h1"', 'Extract all h1 text')
    .example('rek scrape example.com -s "a" -a href', 'Extract link hrefs')
    .example('rek scrape example.com --links', 'Get all links with text')
    .example('rek scrape example.com --tables', 'Extract tables as JSON')
    .example('rek scrape example.com --jsonld', 'Get structured data')
    .action(createCliActionWithOptions(scrapeHandler, {
      positional: ['url'],
      options: ['select', 'attr', 'links', 'images', 'meta', 'tables', 'scripts', 'jsonld']
    }));
}

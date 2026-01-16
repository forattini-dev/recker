/**
 * Security CLI Commands
 *
 * This file registers security commands with the CLI router.
 * Delegates to unified handlers via the adapter.
 */

import { RekCommand as Command } from '../router.js';
import { createCliAction } from '../cli-adapter.js';
import { securityHeadersHandler } from '../handlers/security.js';

export function registerSecurityCommand(program: Command) {
  program
    .command('security')
    .alias('headers')
    .alias('grade')
    .description('Grade a website\'s security headers (A+ to F) for HSTS, CSP, X-Frame-Options, and more')
    .argument('<url>', {
      type: 'url',
      description: 'URL to analyze for security headers',
      example: 'github.com',
    })
    .example('rek security github.com', 'Grade GitHub\'s headers')
    .example('rek security example.com --json', 'Get JSON report')
    .example('rek headers cloudflare.com', 'Use headers alias')
    .action(createCliAction(securityHeadersHandler, {
      positional: ['url']
    }));
}

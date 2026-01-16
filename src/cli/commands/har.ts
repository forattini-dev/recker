/**
 * HAR CLI Commands
 *
 * HAR recording and playback.
 * Delegates to unified handlers via the adapter.
 */

import { RekCommand as Command } from '../router.js';
import { createCliAction, createCliActionWithOptions } from '../cli-adapter.js';
import {
  harRecordHandler,
  harPlayHandler,
  harInfoHandler,
} from '../handlers/har.js';

export function registerHarCommand(program: Command) {
  const har = program.command('har')
    .description('HAR recording and playback')
    .example('rek har record session.har', 'Record HTTP requests to HAR')
    .example('rek har play session.har', 'Replay requests from HAR')
    .example('rek har info session.har', 'Inspect HAR file');

  har.command('record')
    .description('Record HTTP requests to HAR file')
    .argument('<file>', {
      type: 'string',
      description: 'Output HAR file path',
      example: 'session.har',
    })
    .argument('[url]', {
      type: 'url',
      description: 'Optional URL to start recording with',
      example: 'httpbin.org/get',
    })
    .option('append', { short: 'a', description: 'Append to existing HAR file' })
    .example('rek har record session.har', 'Start interactive recording')
    .example('rek har record session.har httpbin.org/get', 'Record single request')
    .example('rek har record session.har -a', 'Append to existing file')
    .action(createCliActionWithOptions(harRecordHandler, {
      positional: ['file', 'url'],
      options: ['append']
    }));

  har.command('play')
    .description('Replay requests from a HAR file')
    .argument('<file>', {
      type: 'string',
      description: 'HAR file to replay',
      example: 'session.har',
    })
    .option('strict', { short: 's', description: 'Fail if request not found in HAR' })
    .option('delay', { type: 'number', short: 'd', description: 'Delay between requests (ms)', default: 0, example: '100' })
    .option('verbose', { short: 'v', description: 'Show detailed output' })
    .example('rek har play session.har', 'Replay all requests')
    .example('rek har play session.har -d 100', 'Replay with 100ms delay')
    .example('rek har play session.har -v', 'Replay with verbose output')
    .action(createCliActionWithOptions(harPlayHandler, {
      positional: ['file'],
      options: ['strict', 'delay', 'verbose']
    }));

  har.command('info')
    .description('Show information about a HAR file')
    .argument('<file>', {
      type: 'string',
      description: 'HAR file to inspect',
      example: 'session.har',
    })
    .example('rek har info session.har', 'Show HAR file info')
    .example('rek har info session.har --json', 'Output as JSON')
    .action(createCliAction(harInfoHandler, { positional: ['file'] }));
}

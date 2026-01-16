/**
 * Utils CLI Commands
 *
 * Upload, download, proxy, setup commands.
 * Delegates to unified handlers via the adapter.
 */

import { RekCommand as Command } from '../router.js';
import { createCliAction, createCliActionWithOptions } from '../cli-adapter.js';
import {
  uploadHandler,
  downloadHandler,
  proxyHandler,
  setupHandler,
} from '../handlers/utils.js';

export function registerUtilsCommands(program: Command) {
  // Upload
  program.command('upload')
    .description('Upload a file to a URL using multipart/form-data')
    .argument('<url>', {
      type: 'url',
      description: 'Target upload URL',
      example: 'api.com/files',
    })
    .argument('<file>', {
      type: 'string',
      description: 'Local file path to upload',
      example: './image.png',
    })
    .option('field', {
      type: 'string',
      short: 'f',
      default: 'file',
      description: 'Form field name',
      example: 'document',
    })
    .option('no-progress', {
      description: 'Disable progress bar',
    })
    .example('rek upload api.com/files ./image.png', 'Simple upload')
    .example('rek upload api.com/files data.json -f doc', 'Custom field name')
    .action(createCliActionWithOptions(uploadHandler, {
      positional: ['url', 'file'],
      options: ['field', 'no-progress'],
      optionMapping: { 'no-progress': 'noProgress' }
    }));

  // Download
  program.command('download')
    .description('Download a file from a URL')
    .argument('<url>', {
      type: 'url',
      description: 'Source URL to download',
      example: 'example.com/file.zip',
    })
    .argument('[output]', {
      type: 'string',
      description: 'Output file path (default: filename from URL)',
      example: './downloaded.zip',
    })
    .option('resume', {
      short: 'r',
      description: 'Resume partial download',
    })
    .option('no-progress', {
      description: 'Disable progress bar',
    })
    .example('rek download example.com/file.zip', 'Download file')
    .example('rek download example.com/large.iso -r', 'Resume partial download')
    .example('rek download example.com/data.zip ./local.zip', 'Specify output path')
    .action(createCliActionWithOptions(downloadHandler, {
      positional: ['url', 'output'],
      options: ['resume', 'no-progress'],
      optionMapping: { 'no-progress': 'noProgress' }
    }));

  // Proxy
  program.command('proxy')
    .description('Make requests through a proxy server')
    .argument('<proxy>', {
      type: 'url',
      description: 'Proxy server URL',
      example: 'http://127.0.0.1:8080',
    })
    .argument('<target>', {
      type: 'url',
      description: 'Target URL to request',
      example: 'httpbin.org/ip',
    })
    .option('method', {
      type: 'string',
      short: 'm',
      default: 'GET',
      description: 'HTTP method',
      example: 'POST',
    })
    .option('data', {
      type: 'string',
      short: 'd',
      description: 'Request body (JSON)',
      example: '{"key":"value"}',
    })
    .example('rek proxy http://localhost:8080 httpbin.org/ip', 'GET through proxy')
    .example('rek proxy http://proxy:8080 api.com/data -m POST -d \'{"x":1}\'', 'POST with data')
    .action(createCliActionWithOptions(proxyHandler, {
      positional: ['proxy', 'target'],
      options: ['method', 'data']
    }));

  // Setup
  program.command('setup')
    .description('Install external dependencies (curl-impersonate) for advanced features')
    .example('rek setup', 'Install curl-impersonate binary')
    .action(createCliAction(setupHandler, { positional: [] }));
}

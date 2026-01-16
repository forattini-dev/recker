/**
 * Protocol CLI Commands
 *
 * FTP, Telnet, GraphQL, JSON-RPC, SOAP, OData commands.
 * Delegates to unified handlers via the adapter.
 */

import { RekCommand as Command } from '../router.js';
import { createCliAction, createCliActionWithOptions } from '../cli-adapter.js';
import {
  ftpLsHandler,
  ftpGetHandler,
  ftpPutHandler,
  telnetHandler,
  graphqlHandler,
  jsonrpcHandler,
  soapHandler,
  odataHandler,
} from '../handlers/protocols.js';

export function registerProtocolCommands(program: Command) {
  // FTP
  const ftpCmd = program.command('ftp')
    .description('FTP client operations')
    .example('rek ftp ls ftp.example.com', 'List files')
    .example('rek ftp get ftp.example.com /file.txt', 'Download file')
    .example('rek ftp put ftp.example.com ./local.txt', 'Upload file');

  ftpCmd.command('ls')
    .description('List files on FTP server')
    .argument('<host>', {
      type: 'string',
      description: 'FTP server hostname',
      example: 'ftp.example.com',
    })
    .argument('[path]', {
      type: 'string',
      description: 'Remote directory path',
      default: '/',
      example: '/pub',
    })
    .option('user', { type: 'string', short: 'u', default: 'anonymous', description: 'Username' })
    .option('pass', { type: 'string', short: 'p', default: 'anonymous@', description: 'Password' })
    .option('port', { type: 'number', short: 'P', default: 21, description: 'Port number' })
    .option('secure', { short: 's', description: 'Use FTPS (explicit TLS)' })
    .option('implicit', { description: 'Use implicit FTPS (port 990)' })
    .example('rek ftp ls ftp.example.com', 'List root directory')
    .example('rek ftp ls ftp.example.com /pub -u admin', 'List /pub as admin')
    .action(createCliActionWithOptions(ftpLsHandler, {
      positional: ['host', 'path'],
      options: ['user', 'pass', 'port', 'secure', 'implicit']
    }));

  ftpCmd.command('get')
    .description('Download file from FTP server')
    .argument('<host>', {
      type: 'string',
      description: 'FTP server hostname',
      example: 'ftp.example.com',
    })
    .argument('<remote>', {
      type: 'string',
      description: 'Remote file path',
      example: '/pub/file.txt',
    })
    .argument('[local]', {
      type: 'string',
      description: 'Local file path (default: filename from remote)',
      example: './downloaded.txt',
    })
    .option('user', { type: 'string', short: 'u', default: 'anonymous', description: 'Username' })
    .option('pass', { type: 'string', short: 'p', default: 'anonymous@', description: 'Password' })
    .option('port', { type: 'number', short: 'P', default: 21, description: 'Port number' })
    .option('secure', { short: 's', description: 'Use FTPS (explicit TLS)' })
    .option('implicit', { description: 'Use implicit FTPS (port 990)' })
    .example('rek ftp get ftp.example.com /pub/file.txt', 'Download file')
    .example('rek ftp get ftp.example.com /data.zip ./local.zip', 'Download to specific path')
    .action(createCliActionWithOptions(ftpGetHandler, {
      positional: ['host', 'remote', 'local'],
      options: ['user', 'pass', 'port', 'secure', 'implicit']
    }));

  ftpCmd.command('put')
    .description('Upload file to FTP server')
    .argument('<host>', {
      type: 'string',
      description: 'FTP server hostname',
      example: 'ftp.example.com',
    })
    .argument('<local>', {
      type: 'string',
      description: 'Local file path',
      example: './upload.txt',
    })
    .argument('[remote]', {
      type: 'string',
      description: 'Remote file path (default: /filename)',
      example: '/uploads/file.txt',
    })
    .option('user', { type: 'string', short: 'u', default: 'anonymous', description: 'Username' })
    .option('pass', { type: 'string', short: 'p', default: 'anonymous@', description: 'Password' })
    .option('port', { type: 'number', short: 'P', default: 21, description: 'Port number' })
    .option('secure', { short: 's', description: 'Use FTPS (explicit TLS)' })
    .option('implicit', { description: 'Use implicit FTPS (port 990)' })
    .example('rek ftp put ftp.example.com ./file.txt', 'Upload file')
    .example('rek ftp put ftp.example.com ./data.zip /backups/data.zip', 'Upload to specific path')
    .action(createCliActionWithOptions(ftpPutHandler, {
      positional: ['host', 'local', 'remote'],
      options: ['user', 'pass', 'port', 'secure', 'implicit']
    }));

  // Telnet
  program.command('telnet')
    .description('Connect to a Telnet server')
    .argument('<host>', {
      type: 'string',
      description: 'Hostname or IP address',
      example: 'towel.blinkenlights.nl',
    })
    .argument('[port]', {
      type: 'number',
      description: 'Port number',
      default: 23,
      example: '23',
    })
    .option('timeout', {
      type: 'number',
      short: 't',
      default: 30000,
      description: 'Connection timeout in ms',
      example: '60000',
    })
    .example('rek telnet towel.blinkenlights.nl', 'Watch Star Wars ASCII')
    .example('rek telnet localhost 23', 'Connect to local server')
    .action(createCliActionWithOptions(telnetHandler, {
      positional: ['host', 'port'],
      options: ['timeout']
    }));

  // GraphQL
  program.command('graphql').alias('gql')
    .description('Execute GraphQL queries and mutations')
    .argument('<url>', {
      type: 'url',
      description: 'GraphQL endpoint URL',
      example: 'api.github.com/graphql',
    })
    .option('query', {
      type: 'string',
      short: 'q',
      description: 'Inline GraphQL query',
      example: '{ me { name } }',
    })
    .option('file', {
      type: 'string',
      short: 'f',
      description: 'Query file path (.graphql)',
      example: 'query.graphql',
    })
    .option('variables', {
      type: 'string',
      short: 'v',
      description: 'Variables JSON string',
      example: '{"id": 1}',
    })
    .option('var-file', {
      type: 'string',
      short: 'V',
      description: 'Variables file path (.json)',
      example: 'variables.json',
    })
    .example('rek graphql api.com/graphql -q "{ me { name } }"', 'Simple query')
    .example('rek graphql api.com/graphql -f query.graphql', 'Query from file')
    .example('rek graphql api.com/graphql -q "query($id: ID!) { user(id: $id) { name } }" -v \'{"id": 1}\'', 'With variables')
    .action(createCliActionWithOptions(graphqlHandler, {
      positional: ['url'],
      options: ['query', 'file', 'variables', 'var-file'],
      optionMapping: { 'var-file': 'varFile' }
    }));

  // JSON-RPC
  program.command('jsonrpc')
    .description('Make JSON-RPC 2.0 calls')
    .argument('<url>', {
      type: 'url',
      description: 'JSON-RPC endpoint URL',
      example: 'api.com/rpc',
    })
    .argument('<method>', {
      type: 'string',
      description: 'RPC method name',
      example: 'sum',
    })
    .option('params', {
      type: 'string',
      short: 'p',
      description: 'RPC params as JSON (array or object)',
      example: '[1, 2, 3]',
    })
    .example('rek jsonrpc api.com/rpc sum -p "[1, 2, 3]"', 'Call sum method')
    .example('rek jsonrpc api.com/rpc getUser -p \'{"id": 1}\'', 'Call with object params')
    .action(createCliActionWithOptions(jsonrpcHandler, {
      positional: ['url', 'method'],
      options: ['params']
    }));

  // SOAP
  program.command('soap')
    .description('Make a SOAP/XML web service request')
    .argument('<url>', {
      type: 'url',
      description: 'SOAP service endpoint URL',
      example: 'api.com/ws',
    })
    .argument('<action>', {
      type: 'string',
      description: 'SOAP action/operation name',
      example: 'GetWeather',
    })
    .option('namespace', {
      type: 'string',
      short: 'n',
      description: 'SOAP namespace URL',
      example: 'http://example.com/soap',
    })
    .option('body', {
      type: 'string',
      short: 'b',
      description: 'Request body as JSON',
      example: '{"city": "New York"}',
    })
    .example('rek soap api.com/ws GetWeather -b \'{"city": "NYC"}\'', 'SOAP request')
    .example('rek soap api.com/ws GetStock -n http://stocks.com/api', 'With namespace')
    .action(createCliActionWithOptions(soapHandler, {
      positional: ['url', 'action'],
      options: ['namespace', 'body']
    }));

  // OData
  program.command('odata')
    .description('Query an OData service')
    .argument('<url>', {
      type: 'url',
      description: 'OData service root URL',
      example: 'api.com/odata',
    })
    .argument('<entity>', {
      type: 'string',
      description: 'Entity set name',
      example: 'Customers',
    })
    .option('select', {
      type: 'string',
      short: 's',
      description: 'Select fields (comma-separated)',
      example: 'Name,Email',
    })
    .option('filter', {
      type: 'string',
      short: 'f',
      description: 'OData filter expression',
      example: "Name eq 'John'",
    })
    .option('orderby', {
      type: 'string',
      short: 'o',
      description: 'Order by field',
      example: 'CreatedAt desc',
    })
    .option('top', {
      type: 'number',
      short: 't',
      description: 'Limit results',
      example: '10',
    })
    .option('skip', {
      type: 'number',
      short: 'S',
      description: 'Skip first N results',
      example: '20',
    })
    .option('expand', {
      type: 'string',
      short: 'e',
      description: 'Expand navigation property',
      example: 'Orders',
    })
    .example('rek odata api.com/odata Customers -t 10', 'Get first 10 customers')
    .example('rek odata api.com/odata Products -s Name,Price -o Price', 'Select and order')
    .example('rek odata api.com/odata Orders -e Customer', 'Expand relations')
    .action(createCliActionWithOptions(odataHandler, {
      positional: ['url', 'entity'],
      options: ['select', 'filter', 'orderby', 'top', 'skip', 'expand']
    }));
}

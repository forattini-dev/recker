import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';
import { promises as fs } from 'node:fs';
import pathMod from 'node:path';

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
    .action(async (host: string, path: string, args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const remotePath = path || '/';
      const secure = options.implicit ? 'implicit' : !!options.secure;
      
      const { createFTP } = await import('../../protocols/ftp.js');
      const client = createFTP({
        host,
        port: options.port || 21,
        user: options.user || 'anonymous',
        password: options.pass || 'anonymous@',
        secure
      });

      console.log(colors.gray(`Connecting to ${host}...`));
      try {
        const connectResult = await client.connect();
        if (!connectResult.success) throw new Error(connectResult.message);

        console.log(colors.green('Connected'));
        const result = await client.list(remotePath);
        if (!result.success || !result.data) throw new Error(result.message);

        console.log(`\n${colors.bold(`Contents of ${remotePath}:`)}\n`);
        for (const item of result.data) {
          const typeChar = item.type === 'directory' ? 'd' : item.type === 'link' ? 'l' : '-';
          const nameColor = item.type === 'directory' ? colors.blue : colors.white;
          console.log(`${typeChar}${item.permissions || 'rwxr-xr-x'}  ${item.size.toString().padStart(10)}  ${item.rawModifiedAt || ''}  ${nameColor(item.name)}`);
        }
        await client.close();
      } catch (err: any) {
        console.error(colors.red(`FTP Error: ${err.message}`));
        process.exit(1);
      }
    });

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
    .action(async (host: string, remote: string, local: string, args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const localPath = local || pathMod.basename(remote);
      const secure = options.implicit ? 'implicit' : !!options.secure;

      const { createFTP } = await import('../../protocols/ftp.js');
      const client = createFTP({
        host,
        port: options.port || 21,
        user: options.user || 'anonymous',
        password: options.pass || 'anonymous@',
        secure
      });

      console.log(colors.gray(`Connecting to ${host}...`));
      try {
        if (!(await client.connect()).success) throw new Error('Connection failed');
        console.log(colors.gray(`Downloading ${remote} -> ${localPath}...`));

        let lastProgress = 0;
        client.progress((p) => {
           if (p.bytesOverall - lastProgress > 100000) {
             process.stdout.write(`\r  ${colors.cyan((p.bytesOverall / 1024 / 1024).toFixed(2) + ' MB')} downloaded...`);
             lastProgress = p.bytesOverall;
           }
        });

        const result = await client.download(remote, localPath);
        console.log('');
        if (!result.success) throw new Error(result.message);
        console.log(colors.green(`✔ Downloaded to ${localPath}`));
        await client.close();
      } catch (err: any) {
        console.error(colors.red(`FTP Error: ${err.message}`));
        process.exit(1);
      }
    });

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
    .action(async (host: string, local: string, remote: string, args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const remotePath = remote || '/' + pathMod.basename(local);
      const secure = options.implicit ? 'implicit' : !!options.secure;

      const { createFTP } = await import('../../protocols/ftp.js');
      const client = createFTP({
        host,
        port: options.port || 21,
        user: options.user || 'anonymous',
        password: options.pass || 'anonymous@',
        secure
      });

      console.log(colors.gray(`Connecting to ${host}...`));
      try {
        if (!(await client.connect()).success) throw new Error('Connection failed');
        console.log(colors.gray(`Uploading ${local} -> ${remotePath}...`));

        let lastProgress = 0;
        client.progress((p) => {
           if (p.bytesOverall - lastProgress > 100000) {
             process.stdout.write(`\r  ${colors.cyan((p.bytesOverall / 1024 / 1024).toFixed(2) + ' MB')} uploaded...`);
             lastProgress = p.bytesOverall;
           }
        });

        const result = await client.upload(local, remotePath);
        console.log('');
        if (!result.success) throw new Error(result.message);
        console.log(colors.green(`✔ Uploaded to ${remotePath}`));
        await client.close();
      } catch (err: any) {
        console.error(colors.red(`FTP Error: ${err.message}`));
        process.exit(1);
      }
    });

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
    .action(async (host: string, portArg: number, args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const port = portArg || 23;

      const { createTelnet } = await import('../../protocols/telnet.js');
      console.log(colors.gray(`Connecting to ${host}:${port}...`));

      const client = createTelnet({ host, port, timeout: options.timeout || 30000 });

      try {
        await client.connect();
        console.log(colors.green(`Connected to ${host}:${port}`));
        
        if (process.stdin.isTTY) process.stdin.setRawMode(true);
        process.stdin.resume();
        
        process.stdin.on('data', async (d) => {
          if (d[0] === 0x03) {
            await client.close();
            process.exit(0);
          }
          await client.send(d.toString());
        });

        client.on('data', (d) => process.stdout.write(d));
        client.on('close', () => process.exit(0));
        client.on('error', (e) => { console.error(colors.red(e.message)); process.exit(1); });

      } catch (err: any) {
        console.error(colors.red(`Telnet Error: ${err.message}`));
        process.exit(1);
      }
    });

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
    .action(async (url: string, args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};

      let query = options.query;
      let variables = options.variables ? JSON.parse(options.variables) : {};

      if (options.file) query = await fs.readFile(options.file, 'utf-8');
      if (options['var-file']) variables = JSON.parse(await fs.readFile(options['var-file'], 'utf-8'));

      if (!query) {
        console.error(colors.red('Error: Query is required via -q/--query or -f/--file'));
        process.exit(1);
      }

      if (!url.startsWith('http')) url = `https://${url}`;

      const { graphql } = await import('../../plugins/graphql.js');
      const { createClient } = await import('../../core/client.js');

      try {
        const client = createClient({ baseUrl: url, headers: { 'Content-Type': 'application/json' } });
        const result = await graphql(client, query, variables);
        console.log(JSON.stringify(result, null, 2));
      } catch (err: any) {
        console.error(colors.red(`GraphQL Error: ${err.message}`));
        process.exit(1);
      }
    });

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
    .action(async (url: string, method: string, args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};

      let params = options.params ? JSON.parse(options.params) : undefined;

      if (!url.startsWith('http')) url = `https://${url}`;

      const { createJsonRpcClient } = await import('../../plugins/jsonrpc.js');
      const { createClient } = await import('../../core/client.js');

      try {
        const client = createClient({ baseUrl: url });
        const rpc = createJsonRpcClient(client, { endpoint: url });
        const result = await rpc.call(method, params);
        console.log(JSON.stringify(result, null, 2));
      } catch (err: any) {
        console.error(colors.red(`RPC Error: ${err.message}`));
        process.exit(1);
      }
    });

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
    .action(async (url: string, action: string, args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};

      if (!url.startsWith('http')) url = `https://${url}`;

      const { createClient } = await import('../../core/client.js');
      const { createSoapClient } = await import('../../plugins/soap.js');

      try {
        const httpClient = createClient();
        const soap = createSoapClient(httpClient, { endpoint: url, namespace: options.namespace });
        const body = options.body ? JSON.parse(options.body) : {};

        const result = await soap.call(action, body);
        console.log(JSON.stringify(result, null, 2));
      } catch (err: any) {
        console.error(colors.red(`SOAP Error: ${err.message}`));
        process.exit(1);
      }
    });

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
    .action(async (url: string, entity: string, args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};

      if (!url.startsWith('http')) url = `https://${url}`;

      const { createClient } = await import('../../core/client.js');
      const { createODataClient } = await import('../../plugins/odata.js');

      try {
        const httpClient = createClient();
        const odata = createODataClient(httpClient, { serviceRoot: url });
        let query = odata.query(entity);

        if (options.select) query = query.select(...options.select.split(','));
        if (options.filter) query = query.filter(options.filter);
        if (options.orderby) query = query.orderBy(options.orderby);
        if (options.top) query = query.top(options.top);
        if (options.skip) query = query.skip(options.skip);
        if (options.expand) query = query.expand(options.expand);

        const results = await query.get();
        console.log(JSON.stringify(results, null, 2));
      } catch (err: any) {
        console.error(colors.red(`OData Error: ${err.message}`));
        process.exit(1);
      }
    });
}
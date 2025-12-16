import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';
import { CommandSchema, RekArgs, generateHelp } from '../parser/index.js';
import { promises as fs } from 'node:fs';
import pathMod from 'node:path';

const ftpSchema: CommandSchema = {
  name: 'ftp',
  description: 'FTP client operations',
  params: {
    user: { type: 'string', default: 'anonymous', description: 'Username' },
    pass: { type: 'string', default: 'anonymous@', description: 'Password' },
    port: { type: 'number', default: 21, description: 'Port' },
  },
  flags: {
    secure: { description: 'Use FTPS (explicit TLS)', default: false },
    implicit: { description: 'Use implicit FTPS (port 990)', default: false }
  },
  examples: [
    { cmd: 'rek ftp ls ftp.example.com', desc: 'List files' },
    { cmd: 'rek ftp get ftp.example.com /file.txt', desc: 'Download file' }
  ]
};

const telnetSchema: CommandSchema = {
  name: 'telnet',
  description: 'Connect to a Telnet server',
  params: {
    timeout: { type: 'number', default: 30000, description: 'Timeout in ms' }
  },
  examples: [
    { cmd: 'rek telnet towel.blinkenlights.nl', desc: 'Star Wars' },
    { cmd: 'rek telnet localhost 23', desc: 'Local server' }
  ]
};

const graphqlSchema: CommandSchema = {
  name: 'graphql',
  description: 'Execute GraphQL queries and mutations',
  params: {
    query: { type: 'string', description: 'Inline query' },
    file: { type: 'string', description: 'Query file path' },
    variables: { type: 'json', description: 'Variables JSON' },
    'var-file': { type: 'string', description: 'Variables file path' }
  },
  examples: [
    { cmd: 'rek graphql api.com/graphql query="{ me { name } }"', desc: 'Simple query' }
  ]
};

const jsonRpcSchema: CommandSchema = {
  name: 'jsonrpc',
  description: 'Make JSON-RPC 2.0 calls',
  params: {
    method: { type: 'string', description: 'RPC Method' },
    params: { type: 'json', description: 'RPC Params (array or object)' }
  },
  examples: [
    { cmd: 'rek jsonrpc api.com/rpc method=sum params=[1,2]', desc: 'Call method' }
  ]
};

const soapSchema: CommandSchema = {
  name: 'soap',
  description: 'Make a SOAP request',
  params: {
    namespace: { type: 'string', description: 'SOAP namespace' },
    envelope: { type: 'string', default: '1.1', description: 'SOAP envelope version' },
  },
  examples: [
    { cmd: 'rek soap api.com/ws GetWeather city="New York"', desc: 'SOAP Action' }
  ]
};

const odataSchema: CommandSchema = {
  name: 'odata',
  description: 'Query an OData service',
  params: {
    select: { type: 'string', description: 'Select fields' },
    filter: { type: 'string', description: 'Filter expression' },
    orderby: { type: 'string', description: 'Order by' },
    top: { type: 'number', description: 'Limit results' },
    skip: { type: 'number', description: 'Skip results' },
    expand: { type: 'string', description: 'Expand navigation' },
  },
  examples: [
    { cmd: 'rek odata api.com/odata Customers top=10', desc: 'Query' }
  ]
};

export function registerProtocolCommands(program: Command) {
  // FTP
  const ftpCmd = program.command('ftp')
    .description('FTP client operations')
    .addHelpText('after', generateHelp(ftpSchema));

  ftpCmd.command('ls')
    .description('List files')
    .argument('<host>', 'FTP Host')
    .argument('[args...]', 'Path and options')
    .action(async (host, rawArgs) => {
      const { data, args } = RekArgs.parse(rawArgs, ftpSchema);
      const path = args[0] as string || '/';
      const secure = data.implicit ? 'implicit' : !!data.secure;
      
      const { createFTP } = await import('../../protocols/ftp.js');
      const client = createFTP({ host, port: data.port, user: data.user, password: data.pass, secure });

      console.log(colors.gray(`Connecting to ${host}...`));
      try {
        const connectResult = await client.connect();
        if (!connectResult.success) throw new Error(connectResult.message);
        
        console.log(colors.green('Connected'));
        const result = await client.list(path);
        if (!result.success || !result.data) throw new Error(result.message);

        console.log(`\n${colors.bold(`Contents of ${path}:`)}\n`);
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
    .description('Download file')
    .argument('<host>', 'FTP Host')
    .argument('<remote>', 'Remote path')
    .argument('[args...]', 'Local path and options')
    .action(async (host, remote, rawArgs) => {
      const { data, args } = RekArgs.parse(rawArgs, ftpSchema);
      const local = args[0] as string || pathMod.basename(remote);
      const secure = data.implicit ? 'implicit' : !!data.secure;

      const { createFTP } = await import('../../protocols/ftp.js');
      const client = createFTP({ host, port: data.port, user: data.user, password: data.pass, secure });

      console.log(colors.gray(`Connecting to ${host}...`));
      try {
        if (!(await client.connect()).success) throw new Error('Connection failed');
        console.log(colors.gray(`Downloading ${remote} -> ${local}...`));
        
        let lastProgress = 0;
        client.progress((p) => {
           if (p.bytesOverall - lastProgress > 100000) {
             process.stdout.write(`\r  ${colors.cyan((p.bytesOverall / 1024 / 1024).toFixed(2) + ' MB')} downloaded...`);
             lastProgress = p.bytesOverall;
           }
        });

        const result = await client.download(remote, local);
        console.log('');
        if (!result.success) throw new Error(result.message);
        console.log(colors.green(`✔ Downloaded to ${local}`));
        await client.close();
      } catch (err: any) {
        console.error(colors.red(`FTP Error: ${err.message}`));
        process.exit(1);
      }
    });

  ftpCmd.command('put')
    .description('Upload file')
    .argument('<host>', 'FTP Host')
    .argument('<local>', 'Local path')
    .argument('[args...]', 'Remote path and options')
    .action(async (host, local, rawArgs) => {
      const { data, args } = RekArgs.parse(rawArgs, ftpSchema);
      const remote = args[0] as string || '/' + pathMod.basename(local);
      const secure = data.implicit ? 'implicit' : !!data.secure;

      const { createFTP } = await import('../../protocols/ftp.js');
      const client = createFTP({ host, port: data.port, user: data.user, password: data.pass, secure });

      console.log(colors.gray(`Connecting to ${host}...`));
      try {
        if (!(await client.connect()).success) throw new Error('Connection failed');
        console.log(colors.gray(`Uploading ${local} -> ${remote}...`));
        
        let lastProgress = 0;
        client.progress((p) => {
           if (p.bytesOverall - lastProgress > 100000) {
             process.stdout.write(`\r  ${colors.cyan((p.bytesOverall / 1024 / 1024).toFixed(2) + ' MB')} uploaded...`);
             lastProgress = p.bytesOverall;
           }
        });

        const result = await client.upload(local, remote);
        console.log('');
        if (!result.success) throw new Error(result.message);
        console.log(colors.green(`✔ Uploaded to ${remote}`));
        await client.close();
      } catch (err: any) {
        console.error(colors.red(`FTP Error: ${err.message}`));
        process.exit(1);
      }
    });

  // Telnet
  program.command('telnet')
    .description(telnetSchema.description)
    .argument('<host>', 'Hostname')
    .argument('[args...]', 'Port and options')
    .addHelpText('after', generateHelp(telnetSchema))
    .action(async (host, rawArgs) => {
      const { data, args } = RekArgs.parse(rawArgs, telnetSchema);
      let port = 23;
      if (args.length > 0) port = parseInt(String(args[0]));

      const { createTelnet } = await import('../../protocols/telnet.js');
      console.log(colors.gray(`Connecting to ${host}:${port}...`));

      const client = createTelnet({ host, port, timeout: data.timeout });

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
    .description(graphqlSchema.description)
    .argument('<url>', 'GraphQL Endpoint')
    .argument('[args...]', 'Options')
    .addHelpText('after', generateHelp(graphqlSchema))
    .action(async (url, rawArgs) => {
      const { data, headers } = RekArgs.parse(rawArgs, graphqlSchema);
      
      let query = data.query;
      let variables = data.variables || {};

      if (data.file) query = await fs.readFile(data.file, 'utf-8');
      if (data['var-file']) variables = JSON.parse(await fs.readFile(data['var-file'], 'utf-8'));

      if (!query) {
        console.error(colors.red('Error: Query is required via query= or file='));
        process.exit(1);
      }

      if (!url.startsWith('http')) url = `https://${url}`;
      
      const { graphql } = await import('../../plugins/graphql.js');
      const { createClient } = await import('../../core/client.js');
      
      try {
        const client = createClient({ baseUrl: url, headers: { 'Content-Type': 'application/json', ...headers } });
        const result = await graphql(client, query, variables);
        console.log(JSON.stringify(result, null, 2));
      } catch (err: any) {
        console.error(colors.red(`GraphQL Error: ${err.message}`));
        process.exit(1);
      }
    });

  // JSON-RPC
  program.command('jsonrpc')
    .description(jsonRpcSchema.description)
    .argument('<url>', 'Endpoint')
    .argument('<method>', 'Method')
    .argument('[args...]', 'Params and options')
    .addHelpText('after', generateHelp(jsonRpcSchema))
    .action(async (url, method, rawArgs) => {
      const { data, headers, args } = RekArgs.parse(rawArgs, jsonRpcSchema);
      
      // Params can come from data.params (parsed JSON) or positional args
      let params = data.params;
      if (!params && args.length > 0) {
         params = args;
      }

      if (!url.startsWith('http')) url = `https://${url}`;

      const { createJsonRpcClient } = await import('../../plugins/jsonrpc.js');
      const { createClient } = await import('../../core/client.js');

      try {
        const client = createClient({ baseUrl: url, headers });
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
    .description(soapSchema.description)
    .argument('<url>', 'SOAP Endpoint')
    .argument('<action>', 'Action/Operation')
    .argument('[args...]', 'Parameters')
    .addHelpText('after', generateHelp(soapSchema))
    .action(async (url, action, rawArgs) => {
      const { data, headers } = RekArgs.parse(rawArgs, soapSchema);
      
      if (!url.startsWith('http')) url = `https://${url}`;

      const { createClient } = await import('../../core/client.js');
      const { createSoapClient } = await import('../../plugins/soap.js');

      try {
        const httpClient = createClient({ headers });
        const soap = createSoapClient(httpClient, { endpoint: url, namespace: data.namespace });
        // Extra params in data (excluding schema params) are action args
        const body = { ...data };
        delete body.namespace;
        delete body.envelope;

        const result = await soap.call(action, body);
        console.log(JSON.stringify(result, null, 2));
      } catch (err: any) {
        console.error(colors.red(`SOAP Error: ${err.message}`));
        process.exit(1);
      }
    });

  // OData
  program.command('odata')
    .description(odataSchema.description)
    .argument('<url>', 'OData Service URL')
    .argument('<entity>', 'Entity Set')
    .argument('[args...]', 'Query Options')
    .addHelpText('after', generateHelp(odataSchema))
    .action(async (url, entity, rawArgs) => {
      const { data, headers } = RekArgs.parse(rawArgs, odataSchema);
      
      if (!url.startsWith('http')) url = `https://${url}`;

      const { createClient } = await import('../../core/client.js');
      const { createODataClient } = await import('../../plugins/odata.js');

      try {
        const httpClient = createClient({ headers });
        const odata = createODataClient(httpClient, { serviceRoot: url });
        let query = odata.query(entity);

        if (data.select) query = query.select(...(data.select as string).split(','));
        if (data.filter) query = query.filter(data.filter as string);
        if (data.orderby) query = query.orderBy(data.orderby as string);
        if (data.top) query = query.top(data.top as number);
        if (data.skip) query = query.skip(data.skip as number);
        if (data.expand) query = query.expand(data.expand as string);

        const results = await query.get();
        console.log(JSON.stringify(results, null, 2));
      } catch (err: any) {
        console.error(colors.red(`OData Error: ${err.message}`));
        process.exit(1);
      }
    });
}
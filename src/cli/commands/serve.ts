import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';
import { CommandSchema, RekArgs, generateHelp } from '../parser/index.js';

// Schemas for each subcommand
const httpSchema: CommandSchema = {
  name: 'http',
  description: 'Start a mock HTTP server for testing',
  params: {
    port: { type: 'number', default: 3000, description: 'Port to listen on' },
    host: { type: 'string', default: '127.0.0.1', description: 'Host to bind to' },
    delay: { type: 'number', default: 0, description: 'Add delay to responses in ms' },
  },
  flags: {
    echo: { description: 'Echo request body back in response', default: false },
    cors: { description: 'Enable CORS', default: true },
    nocors: { description: 'Disable CORS' }
  },
  examples: [
    { cmd: 'rek serve http', desc: 'Start on port 3000' },
    { cmd: 'rek serve http port=8080', desc: 'Start on port 8080' },
    { cmd: 'rek serve http echo', desc: 'Echo mode' }
  ]
};

const webhookSchema: CommandSchema = {
  name: 'webhook',
  description: 'Start a webhook receiver server',
  params: {
    port: { type: 'number', default: 3000, description: 'Port to listen on' },
    host: { type: 'string', default: '127.0.0.1', description: 'Host to bind to' },
    status: { type: 'number', default: 204, description: 'Response status code (200 or 204)' },
  },
  flags: {
    quiet: { description: 'Disable logging', default: false }
  },
  examples: [
    { cmd: 'rek serve webhook', desc: 'Start on port 3000' },
    { cmd: 'rek serve webhook status=200', desc: 'Return 200 OK' }
  ]
};

const websocketSchema: CommandSchema = {
  name: 'websocket',
  description: 'Start a mock WebSocket server',
  params: {
    port: { type: 'number', default: 8080, description: 'Port to listen on' },
    host: { type: 'string', default: '127.0.0.1', description: 'Host to bind to' },
    delay: { type: 'number', default: 0, description: 'Add delay to responses in ms' },
  },
  flags: {
    echo: { description: 'Echo messages back', default: true },
    noecho: { description: 'Disable echo mode' }
  },
  examples: [
    { cmd: 'rek serve websocket', desc: 'Start on port 8080' },
    { cmd: 'rek serve ws noecho', desc: 'Disable echo' }
  ]
};

const sseSchema: CommandSchema = {
  name: 'sse',
  description: 'Start a mock SSE (Server-Sent Events) server',
  params: {
    port: { type: 'number', default: 8081, description: 'Port to listen on' },
    host: { type: 'string', default: '127.0.0.1', description: 'Host to bind to' },
    path: { type: 'string', default: '/events', description: 'SSE endpoint path' },
    heartbeat: { type: 'number', default: 0, description: 'Send heartbeat every N ms (0 = disabled)' },
  },
  examples: [
    { cmd: 'rek serve sse', desc: 'Start on port 8081' },
    { cmd: 'rek serve sse heartbeat=5000', desc: 'Heartbeat every 5s' }
  ]
};

const hlsSchema: CommandSchema = {
  name: 'hls',
  description: 'Start a mock HLS streaming server',
  params: {
    port: { type: 'number', default: 8082, description: 'Port to listen on' },
    host: { type: 'string', default: '127.0.0.1', description: 'Host to bind to' },
    mode: { type: 'string', default: 'vod', choices: ['vod', 'live', 'event'], description: 'Stream mode' },
    segments: { type: 'number', default: 10, description: 'Number of segments' },
    duration: { type: 'number', default: 6, description: 'Segment duration in seconds' },
    qualities: { type: 'string', default: '720p,480p,360p', description: 'Comma-separated quality variants' },
  },
  examples: [
    { cmd: 'rek serve hls', desc: 'Start VOD server' },
    { cmd: 'rek serve hls mode=live', desc: 'Start live stream' }
  ]
};

const udpSchema: CommandSchema = {
  name: 'udp',
  description: 'Start a mock UDP server',
  params: {
    port: { type: 'number', default: 9000, description: 'Port to listen on' },
    host: { type: 'string', default: '127.0.0.1', description: 'Host to bind to' },
  },
  flags: {
    echo: { description: 'Echo messages back', default: true },
    noecho: { description: 'Disable echo mode' }
  },
  examples: [
    { cmd: 'rek serve udp', desc: 'Start on port 9000' }
  ]
};

const dnsSchema: CommandSchema = {
  name: 'dns',
  description: 'Start a mock DNS server',
  params: {
    port: { type: 'number', default: 5353, description: 'Port to listen on' },
    host: { type: 'string', default: '127.0.0.1', description: 'Host to bind to' },
    delay: { type: 'number', default: 0, description: 'Add delay to responses in ms' },
  },
  examples: [
    { cmd: 'rek serve dns', desc: 'Start on port 5353' }
  ]
};

const whoisSchema: CommandSchema = {
  name: 'whois',
  description: 'Start a mock WHOIS server',
  params: {
    port: { type: 'number', default: 4343, description: 'Port to listen on' },
    host: { type: 'string', default: '127.0.0.1', description: 'Host to bind to' },
    delay: { type: 'number', default: 0, description: 'Add delay to responses in ms' },
  },
  examples: [
    { cmd: 'rek serve whois', desc: 'Start on port 4343' }
  ]
};

const telnetSchema: CommandSchema = {
  name: 'telnet',
  description: 'Start a mock Telnet server',
  params: {
    port: { type: 'number', default: 2323, description: 'Port to listen on' },
    host: { type: 'string', default: '127.0.0.1', description: 'Host to bind to' },
    delay: { type: 'number', default: 0, description: 'Add delay to responses in ms' },
  },
  flags: {
    echo: { description: 'Echo input back', default: true },
    noecho: { description: 'Disable echo mode' }
  },
  examples: [
    { cmd: 'rek serve telnet', desc: 'Start on port 2323' }
  ]
};

const ftpSchema: CommandSchema = {
  name: 'ftp',
  description: 'Start a mock FTP server',
  params: {
    port: { type: 'number', default: 2121, description: 'Port to listen on' },
    host: { type: 'string', default: '127.0.0.1', description: 'Host to bind to' },
    username: { type: 'string', default: 'user', description: 'Username for auth' },
    password: { type: 'string', default: 'pass', description: 'Password for auth' },
    delay: { type: 'number', default: 0, description: 'Add delay to responses' },
  },
  flags: {
    anonymous: { description: 'Allow anonymous login', default: true },
    noanonymous: { description: 'Disable anonymous login' }
  },
  examples: [
    { cmd: 'rek serve ftp', desc: 'Start on port 2121' }
  ]
};

export function registerServeCommand(program: Command) {
  const serve = program.command('serve').description('Start mock servers for testing protocols');

  // HTTP
  serve.command('http')
    .description(httpSchema.description)
    .argument('[args...]', 'Options: port=3000 host=127.0.0.1 echo delay=0 cors')
    .addHelpText('after', generateHelp(httpSchema))
    .action(async (rawArgs: string[]) => {
      const { data, options } = RekArgs.parse(rawArgs, httpSchema);
      const { MockHttpServer } = await import('../../testing/mock-http-server.js');
      
      const cors = options.nocors ? false : (options.cors || data.cors); // default true in schema logic handled by parser? parser handles boolean defaults. 
      // Actually schema default is just for 'data'. 'options' are flags.
      // Re-eval logic:
      const useCors = options.nocors ? false : true;

      const server = await MockHttpServer.create({
        port: data.port,
        host: data.host,
        delay: data.delay,
        cors: useCors,
      });

      if (options.echo) {
        server.any('/*', (req: any) => ({
          status: 200,
          body: { method: req.method, path: req.path, query: req.query, headers: req.headers, body: req.body },
        }));
      }

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock HTTP Server')}                   │
├─────────────────────────────────────────────┤
│  URL: ${colors.cyan(server.url.padEnd(37))}│
│  Mode: ${colors.yellow((options.echo ? 'Echo' : 'Default').padEnd(36))}│
│  Delay: ${colors.gray((data.delay + 'ms').padEnd(35))}
├─────────────────────────────────────────────┤
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘`));

      server.on('request', (req: any) => {
        console.log(colors.gray(`${new Date().toISOString()} `) + colors.cyan(req.method.padEnd(7)) + req.path);
      });

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        await server.stop();
        process.exit(0);
      });
    });

  // Webhook
  serve.command('webhook').alias('wh')
    .description(webhookSchema.description)
    .argument('[args...]', 'Options: port=3000 host=127.0.0.1 status=204 quiet')
    .addHelpText('after', generateHelp(webhookSchema))
    .action(async (rawArgs: string[]) => {
      const { data, options } = RekArgs.parse(rawArgs, webhookSchema);
      const { createWebhookServer } = await import('../../testing/mock-http-server.js');

      if (data.status !== 200 && data.status !== 204) {
        console.error(colors.red('Status must be 200 or 204'));
        process.exit(1);
      }

      const server = await createWebhookServer({
        port: data.port,
        host: data.host,
        status: data.status as 200 | 204,
        log: !options.quiet,
      });

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Webhook Receiver')}                   │
├─────────────────────────────────────────────┤
│  URL: ${colors.cyan(server.url.padEnd(37))}│
│  Status: ${colors.yellow(String(data.status).padEnd(34))}│
├─────────────────────────────────────────────┤
│  ${colors.cyan('*')} ${colors.cyan('/')}            ${colors.gray('Webhook without ID')}        │
│  ${colors.cyan('*')} ${colors.cyan('/:id')}         ${colors.gray('Webhook with custom ID')}    │
├─────────────────────────────────────────────┤
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘`));

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        console.log(colors.gray(`Total webhooks received: ${server.webhooks.length}`));
        await server.stop();
        process.exit(0);
      });
    });

  // WebSocket
  serve.command('websocket').alias('ws')
    .description(websocketSchema.description)
    .argument('[args...]', 'Options: port=8080 host=127.0.0.1 echo noecho delay=0')
    .addHelpText('after', generateHelp(websocketSchema))
    .action(async (rawArgs: string[]) => {
      const { data, options } = RekArgs.parse(rawArgs, websocketSchema);
      const { MockWebSocketServer } = await import('../../testing/mock-websocket-server.js');

      const echo = options.noecho ? false : (options.echo !== undefined ? Boolean(options.echo) : true);

      const server = await MockWebSocketServer.create({
        port: data.port,
        host: data.host,
        echo,
        delay: data.delay,
      });

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock WebSocket Server')}              │
├─────────────────────────────────────────────┤
│  URL: ${colors.cyan(server.url.padEnd(37))}│
│  Echo: ${colors.yellow((echo ? 'Enabled' : 'Disabled').padEnd(36))}│
│  Delay: ${colors.gray((data.delay + 'ms').padEnd(35))}
├─────────────────────────────────────────────┤
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘`));

      server.on('connection', (client: any) => console.log(colors.green(`+ Connected: ${client.id}`)));
      server.on('message', (msg: any, client: any) => {
        const d = msg.data.toString();
        console.log(colors.gray(`${new Date().toISOString()} `) + colors.cyan(client.id) + ` ${d.slice(0, 50)}${d.length > 50 ? '...' : ''}`);
      });
      server.on('disconnect', (client: any) => console.log(colors.red(`- Disconnected: ${client.id}`)));

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        await server.stop();
        process.exit(0);
      });
    });

  // SSE
  serve.command('sse')
    .description(sseSchema.description)
    .argument('[args...]', 'Options')
    .addHelpText('after', generateHelp(sseSchema))
    .action(async (rawArgs: string[]) => {
      const { data } = RekArgs.parse(rawArgs, sseSchema);
      const { MockSSEServer } = await import('../../testing/mock-sse-server.js');
      const readline = await import('node:readline');

      const server = await MockSSEServer.create({
        port: data.port,
        host: data.host,
        path: data.path,
      });

      if (data.heartbeat > 0) server.startPeriodicEvents('heartbeat', data.heartbeat);

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock SSE Server')}                    │
├─────────────────────────────────────────────┤
│  URL: ${colors.cyan(server.url.padEnd(37))}│
│  Heartbeat: ${colors.yellow((data.heartbeat === 0 ? 'Disabled' : data.heartbeat + 'ms').padEnd(31))}
├─────────────────────────────────────────────┤
│  Type message + Enter to broadcast          │
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘`));

      server.on('connection', (client: any) => console.log(colors.green(`+ Connected: ${client.id}`)));
      server.on('disconnect', (client: any) => console.log(colors.red(`- Disconnected: ${client.id}`)));

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.on('line', (line) => {
        if (line.trim()) {
          const sent = server.sendData(line.trim());
          console.log(colors.gray(`Broadcast to ${sent} client(s): ${line.trim()}`));
        }
      });

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        rl.close();
        await server.stop();
        process.exit(0);
      });
    });

  // HLS
  serve.command('hls')
    .description(hlsSchema.description)
    .argument('[args...]', 'Options')
    .addHelpText('after', generateHelp(hlsSchema))
    .action(async (rawArgs: string[]) => {
      const { data } = RekArgs.parse(rawArgs, hlsSchema);
      const { MockHlsServer } = await import('../../testing/mock-hls-server.js');
      const http = await import('node:http');

      const qualities = (data.qualities as string).split(',').map(q => q.trim());
      const variants = qualities.map((name, i) => ({
        name,
        bandwidth: [5000000, 2500000, 1400000][i] || 500000,
        resolution: ['1920x1080', '1280x720', '854x480'][i] || '640x360',
      }));

      const baseUrl = `http://${data.host}:${data.port}`;
      const hlsServer = await MockHlsServer.create({
        baseUrl,
        mode: data.mode as any,
        segmentCount: data.segments,
        segmentDuration: data.duration,
        multiQuality: variants.length > 1,
        variants: variants.length > 1 ? variants : undefined,
      });

      const httpServer = http.createServer(async (req, res) => {
        const url = `${baseUrl}${req.url}`;
        try {
          const response = await hlsServer.transport.dispatch({ url, method: req.method || 'GET' } as any) as any;
          res.statusCode = response.status;
          response.headers.forEach((value: string, key: string) => res.setHeader(key, value));
          const body = await response.arrayBuffer();
          res.end(Buffer.from(body));
        } catch {
          res.statusCode = 404;
          res.end('Not Found');
        }
      });

      httpServer.listen(data.port, data.host, () => {
        console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock HLS Server')}                    │
├─────────────────────────────────────────────┤
│  Master: ${colors.cyan((hlsServer.manifestUrl).padEnd(34))}│
│  Mode: ${colors.yellow(data.mode.padEnd(36))}│
│  Qualities: ${colors.cyan(qualities.join(', ').padEnd(31))}
├─────────────────────────────────────────────┤
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘`));
      });

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        httpServer.close();
        await hlsServer.stop();
        process.exit(0);
      });
    });

  // UDP
  serve.command('udp')
    .description(udpSchema.description)
    .argument('[args...]', 'Options')
    .addHelpText('after', generateHelp(udpSchema))
    .action(async (rawArgs: string[]) => {
      const { data, options } = RekArgs.parse(rawArgs, udpSchema);
      const { MockUDPServer } = await import('../../testing/mock-udp-server.js');

      const echo = options.noecho ? false : (options.echo !== undefined ? Boolean(options.echo) : true);

      const server = new MockUDPServer({
        port: data.port,
        host: data.host,
        echo,
      });

      await server.start();

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock UDP Server')}                    │
├─────────────────────────────────────────────┤
│  Address: ${colors.cyan(`${data.host}:${data.port}`.padEnd(33))}
│  Echo: ${colors.yellow((echo ? 'Enabled' : 'Disabled').padEnd(36))}
├─────────────────────────────────────────────┤
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘`));

      server.on('message', (msg: any) => {
        const d = msg.data.toString();
        console.log(colors.gray(`${new Date().toISOString()} `) + colors.cyan(`${msg.rinfo.address}:${msg.rinfo.port}`) + ` ${d.slice(0, 50)}${d.length > 50 ? '...' : ''}`);
      });

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        await server.stop();
        process.exit(0);
      });
    });

  // DNS
  serve.command('dns')
    .description(dnsSchema.description)
    .argument('[args...]', 'Options')
    .addHelpText('after', generateHelp(dnsSchema))
    .action(async (rawArgs: string[]) => {
      const { data } = RekArgs.parse(rawArgs, dnsSchema);
      const { MockDnsServer } = await import('../../testing/mock-dns-server.js');

      const server = await MockDnsServer.create({
        port: data.port,
        host: data.host,
        delay: data.delay,
      });

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock DNS Server')}                    │
├─────────────────────────────────────────────┤
│  Address: ${colors.cyan(`${data.host}:${data.port}`.padEnd(33))}
│  Protocol: ${colors.yellow('UDP'.padEnd(32))}
├─────────────────────────────────────────────┤
│  Test: dig @${data.host} -p ${data.port} example.com        │
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘`));

      server.on('query', (query: { domain: string; type: string }) => {
        console.log(colors.gray(`${new Date().toISOString()} `) + colors.cyan(query.type.padEnd(6)) + ` ${query.domain}`);
      });

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        await server.stop();
        process.exit(0);
      });
    });

  // WHOIS
  serve.command('whois')
    .description(whoisSchema.description)
    .argument('[args...]', 'Options')
    .addHelpText('after', generateHelp(whoisSchema))
    .action(async (rawArgs: string[]) => {
      const { data } = RekArgs.parse(rawArgs, whoisSchema);
      const { MockWhoisServer } = await import('../../testing/mock-whois-server.js');

      const server = await MockWhoisServer.create({
        port: data.port,
        host: data.host,
        delay: data.delay,
      });

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock WHOIS Server')}                  │
├─────────────────────────────────────────────┤
│  Address: ${colors.cyan(`${data.host}:${data.port}`.padEnd(33))}
│  Protocol: ${colors.yellow('TCP'.padEnd(32))}
├─────────────────────────────────────────────┤
│  Test: whois -h ${data.host} -p ${data.port} example.com │
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘`));

      server.on('query', (query: string) => console.log(colors.gray(`${new Date().toISOString()} `) + `Query: ${colors.cyan(query)}`));

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        await server.stop();
        process.exit(0);
      });
    });

  // Telnet
  serve.command('telnet')
    .description(telnetSchema.description)
    .argument('[args...]', 'Options')
    .addHelpText('after', generateHelp(telnetSchema))
    .action(async (rawArgs: string[]) => {
      const { data, options } = RekArgs.parse(rawArgs, telnetSchema);
      const { MockTelnetServer } = await import('../../testing/mock-telnet-server.js');

      const echo = options.noecho ? false : (options.echo !== undefined ? Boolean(options.echo) : true);

      const server = await MockTelnetServer.create({
        port: data.port,
        host: data.host,
        echo,
        delay: data.delay,
      });

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock Telnet Server')}                 │
├─────────────────────────────────────────────┤
│  Address: ${colors.cyan(`${data.host}:${data.port}`.padEnd(33))}
│  Echo: ${colors.yellow((echo ? 'Enabled' : 'Disabled').padEnd(36))}
├─────────────────────────────────────────────┤
│  Connect: telnet ${data.host} ${data.port}               │
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘`));

      server.on('connect', (s: any) => console.log(colors.gray(`${new Date().toISOString()} `) + colors.green('+ Connected: ') + colors.cyan(s.id)));
      server.on('disconnect', (s: any) => console.log(colors.gray(`${new Date().toISOString()} `) + colors.red('- Disconnected: ') + colors.cyan(s.id)));
      server.on('command', (cmd: string, s: any) => console.log(colors.gray(`${new Date().toISOString()} `) + colors.cyan(s.id) + ` $ ${cmd}`));

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        await server.stop();
        process.exit(0);
      });
    });

  // FTP
  serve.command('ftp')
    .description(ftpSchema.description)
    .argument('[args...]', 'Options')
    .addHelpText('after', generateHelp(ftpSchema))
    .action(async (rawArgs: string[]) => {
      const { data, options } = RekArgs.parse(rawArgs, ftpSchema);
      const { MockFtpServer } = await import('../../testing/mock-ftp-server.js');

      const anonymous = options.noanonymous ? false : (options.anonymous !== undefined ? Boolean(options.anonymous) : true);

      const server = await MockFtpServer.create({
        port: data.port,
        host: data.host,
        username: data.username,
        password: data.password,
        anonymous,
        delay: data.delay,
      });

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock FTP Server')}                    │
├─────────────────────────────────────────────┤
│  Address: ${colors.cyan(`${data.host}:${data.port}`.padEnd(33))}
│  Anonymous: ${colors.yellow((anonymous ? 'Allowed' : 'Disabled').padEnd(31))}
│  User: ${colors.cyan(data.username.padEnd(36))}
├─────────────────────────────────────────────┤
│  Connect: ftp ${data.host} ${data.port}                  │
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘`));

      server.on('connect', (s: any) => console.log(colors.gray(`${new Date().toISOString()} `) + colors.green('+ Connected: ') + colors.cyan(s.id)));
      server.on('disconnect', (s: any) => console.log(colors.gray(`${new Date().toISOString()} `) + colors.red('- Disconnected: ') + colors.cyan(s.id)));
      server.on('command', (cmd: string, _a: string, s: any) => console.log(colors.gray(`${new Date().toISOString()} `) + colors.cyan(s.id) + ` ${cmd}`));

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        await server.stop();
        process.exit(0);
      });
    });
}

import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';

export function registerServeCommand(program: Command) {
  const serve = program
    .command('serve')
    .description('Start mock servers for testing various protocols (HTTP, WebSocket, DNS, etc)')
    .example('rek serve http', 'Start HTTP server on port 3000')
    .example('rek serve websocket', 'Start WebSocket server on port 8080')
    .example('rek serve hls --mode=live', 'Start live HLS streaming server');

  // HTTP Mock Server
  serve
    .command('http')
    .description('Start a mock HTTP server for testing requests and responses')
    .option('port', {
      type: 'number',
      short: 'p',
      default: 3000,
      description: 'Port to listen on',
      example: '8080',
    })
    .option('host', {
      type: 'string',
      short: 'H',
      default: '127.0.0.1',
      description: 'Host to bind to',
      example: '0.0.0.0',
    })
    .option('delay', {
      type: 'number',
      short: 'd',
      default: 0,
      description: 'Add delay to responses in milliseconds',
      example: '100',
    })
    .option('echo', {
      short: 'e',
      description: 'Echo request body back in response',
    })
    .option('no-cors', {
      description: 'Disable CORS headers',
    })
    .example('rek serve http', 'Start on port 3000')
    .example('rek serve http -p 8080', 'Start on port 8080')
    .example('rek serve http --echo', 'Echo mode')
    .action(async (args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const { MockHttpServer } = await import('../../testing/mock-http-server.js');

      const port = options.port || 3000;
      const host = options.host || '127.0.0.1';
      const delay = options.delay || 0;
      const useCors = !options['no-cors'];

      const server = await MockHttpServer.create({
        port,
        host,
        delay,
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
│  Delay: ${colors.gray((delay + 'ms').padEnd(35))}
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

  // Webhook Receiver
  serve
    .command('webhook')
    .alias('wh')
    .description('Start a webhook receiver server that logs incoming requests')
    .option('port', {
      type: 'number',
      short: 'p',
      default: 3000,
      description: 'Port to listen on',
    })
    .option('host', {
      type: 'string',
      short: 'H',
      default: '127.0.0.1',
      description: 'Host to bind to',
    })
    .option('status', {
      type: 'number',
      short: 's',
      default: 204,
      enum: ['200', '204'],
      description: 'Response status code',
    })
    .example('rek serve webhook', 'Start on port 3000')
    .example('rek serve webhook --status=200', 'Return 200 OK')
    .action(async (args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const { createWebhookServer } = await import('../../testing/mock-http-server.js');

      const port = options.port || 3000;
      const host = options.host || '127.0.0.1';
      const status = options.status || 204;

      if (status !== 200 && status !== 204) {
        console.error(colors.red('Status must be 200 or 204'));
        process.exit(1);
      }

      const server = await createWebhookServer({
        port,
        host,
        status: status as 200 | 204,
        log: !options.quiet,
      });

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Webhook Receiver')}                   │
├─────────────────────────────────────────────┤
│  URL: ${colors.cyan(server.url.padEnd(37))}│
│  Status: ${colors.yellow(String(status).padEnd(34))}│
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

  // WebSocket Mock Server
  serve
    .command('websocket')
    .alias('ws')
    .description('Start a mock WebSocket server for testing real-time connections')
    .option('port', {
      type: 'number',
      short: 'p',
      default: 8080,
      description: 'Port to listen on',
    })
    .option('host', {
      type: 'string',
      short: 'H',
      default: '127.0.0.1',
      description: 'Host to bind to',
    })
    .option('delay', {
      type: 'number',
      short: 'd',
      default: 0,
      description: 'Add delay to responses in milliseconds',
    })
    .option('no-echo', {
      description: 'Disable echo mode (messages not sent back)',
    })
    .example('rek serve websocket', 'Start on port 8080')
    .example('rek serve ws --no-echo', 'Disable echo mode')
    .action(async (args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const { MockWebSocketServer } = await import('../../testing/mock-websocket-server.js');

      const port = options.port || 8080;
      const host = options.host || '127.0.0.1';
      const delay = options.delay || 0;
      const echo = !options['no-echo'];

      const server = await MockWebSocketServer.create({
        port,
        host,
        echo,
        delay,
      });

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock WebSocket Server')}              │
├─────────────────────────────────────────────┤
│  URL: ${colors.cyan(server.url.padEnd(37))}│
│  Echo: ${colors.yellow((echo ? 'Enabled' : 'Disabled').padEnd(36))}│
│  Delay: ${colors.gray((delay + 'ms').padEnd(35))}
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

  // SSE Mock Server
  serve
    .command('sse')
    .description('Start a mock SSE (Server-Sent Events) server for real-time streaming')
    .option('port', {
      type: 'number',
      short: 'p',
      default: 8081,
      description: 'Port to listen on',
    })
    .option('host', {
      type: 'string',
      short: 'H',
      default: '127.0.0.1',
      description: 'Host to bind to',
    })
    .option('path', {
      type: 'string',
      default: '/events',
      description: 'SSE endpoint path',
    })
    .option('heartbeat', {
      type: 'number',
      short: 'b',
      default: 0,
      description: 'Send heartbeat every N milliseconds (0=disabled)',
      example: '5000',
    })
    .example('rek serve sse', 'Start on port 8081')
    .example('rek serve sse --heartbeat=5000', 'Heartbeat every 5s')
    .action(async (args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const { MockSSEServer } = await import('../../testing/mock-sse-server.js');
      const readline = await import('node:readline');

      const port = options.port || 8081;
      const host = options.host || '127.0.0.1';
      const path = options.path || '/events';
      const heartbeat = options.heartbeat || 0;

      const server = await MockSSEServer.create({
        port,
        host,
        path,
      });

      if (heartbeat > 0) server.startPeriodicEvents('heartbeat', heartbeat);

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock SSE Server')}                    │
├─────────────────────────────────────────────┤
│  URL: ${colors.cyan(server.url.padEnd(37))}│
│  Heartbeat: ${colors.yellow((heartbeat === 0 ? 'Disabled' : heartbeat + 'ms').padEnd(31))}
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

  // HLS Mock Server
  serve
    .command('hls')
    .description('Start a mock HLS streaming server with configurable qualities and modes')
    .option('port', {
      type: 'number',
      short: 'p',
      default: 8082,
      description: 'Port to listen on',
    })
    .option('host', {
      type: 'string',
      short: 'H',
      default: '127.0.0.1',
      description: 'Host to bind to',
    })
    .option('mode', {
      type: 'string',
      short: 'm',
      default: 'vod',
      enum: ['vod', 'live', 'event'],
      description: 'Stream mode',
    })
    .option('segments', {
      type: 'number',
      short: 's',
      default: 10,
      description: 'Number of segments',
    })
    .option('duration', {
      type: 'number',
      short: 'd',
      default: 6,
      description: 'Segment duration in seconds',
    })
    .option('qualities', {
      type: 'string',
      short: 'Q',
      default: '720p,480p,360p',
      description: 'Comma-separated quality variants',
    })
    .example('rek serve hls', 'Start VOD server')
    .example('rek serve hls --mode=live', 'Start live stream')
    .example('rek serve hls -Q 1080p,720p', 'Custom qualities')
    .action(async (args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const { MockHlsServer } = await import('../../testing/mock-hls-server.js');
      const http = await import('node:http');

      const port = options.port || 8082;
      const host = options.host || '127.0.0.1';
      const mode = options.mode || 'vod';
      const segments = options.segments || 10;
      const duration = options.duration || 6;
      const qualitiesStr = options.qualities || '720p,480p,360p';

      const qualities = qualitiesStr.split(',').map((q: string) => q.trim());
      const variants = qualities.map((name: string, i: number) => ({
        name,
        bandwidth: [5000000, 2500000, 1400000][i] || 500000,
        resolution: ['1920x1080', '1280x720', '854x480'][i] || '640x360',
      }));

      const baseUrl = `http://${host}:${port}`;
      const hlsServer = await MockHlsServer.create({
        baseUrl,
        mode: mode as any,
        segmentCount: segments,
        segmentDuration: duration,
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

      httpServer.listen(port, host, () => {
        console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock HLS Server')}                    │
├─────────────────────────────────────────────┤
│  Master: ${colors.cyan((hlsServer.manifestUrl).padEnd(34))}│
│  Mode: ${colors.yellow(mode.padEnd(36))}│
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

  // UDP Mock Server
  serve
    .command('udp')
    .description('Start a mock UDP server for datagram testing')
    .option('port', {
      type: 'number',
      short: 'p',
      default: 9000,
      description: 'Port to listen on',
    })
    .option('host', {
      type: 'string',
      short: 'H',
      default: '127.0.0.1',
      description: 'Host to bind to',
    })
    .option('no-echo', {
      description: 'Disable echo mode',
    })
    .example('rek serve udp', 'Start on port 9000')
    .action(async (args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const { MockUDPServer } = await import('../../testing/mock-udp-server.js');

      const port = options.port || 9000;
      const host = options.host || '127.0.0.1';
      const echo = !options['no-echo'];

      const server = new MockUDPServer({
        port,
        host,
        echo,
      });

      await server.start();

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock UDP Server')}                    │
├─────────────────────────────────────────────┤
│  Address: ${colors.cyan(`${host}:${port}`.padEnd(33))}
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

  // DNS Mock Server
  serve
    .command('dns')
    .description('Start a mock DNS server for domain resolution testing')
    .option('port', {
      type: 'number',
      short: 'p',
      default: 5353,
      description: 'Port to listen on',
    })
    .option('host', {
      type: 'string',
      short: 'H',
      default: '127.0.0.1',
      description: 'Host to bind to',
    })
    .option('delay', {
      type: 'number',
      short: 'd',
      default: 0,
      description: 'Add delay to responses in milliseconds',
    })
    .example('rek serve dns', 'Start on port 5353')
    .action(async (args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const { MockDnsServer } = await import('../../testing/mock-dns-server.js');

      const port = options.port || 5353;
      const host = options.host || '127.0.0.1';
      const delay = options.delay || 0;

      const server = await MockDnsServer.create({
        port,
        host,
        delay,
      });

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock DNS Server')}                    │
├─────────────────────────────────────────────┤
│  Address: ${colors.cyan(`${host}:${port}`.padEnd(33))}
│  Protocol: ${colors.yellow('UDP'.padEnd(32))}
├─────────────────────────────────────────────┤
│  Test: dig @${host} -p ${port} example.com        │
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

  // WHOIS Mock Server
  serve
    .command('whois')
    .description('Start a mock WHOIS server for domain registration testing')
    .option('port', {
      type: 'number',
      short: 'p',
      default: 4343,
      description: 'Port to listen on',
    })
    .option('host', {
      type: 'string',
      short: 'H',
      default: '127.0.0.1',
      description: 'Host to bind to',
    })
    .option('delay', {
      type: 'number',
      short: 'd',
      default: 0,
      description: 'Add delay to responses in milliseconds',
    })
    .example('rek serve whois', 'Start on port 4343')
    .action(async (args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const { MockWhoisServer } = await import('../../testing/mock-whois-server.js');

      const port = options.port || 4343;
      const host = options.host || '127.0.0.1';
      const delay = options.delay || 0;

      const server = await MockWhoisServer.create({
        port,
        host,
        delay,
      });

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock WHOIS Server')}                  │
├─────────────────────────────────────────────┤
│  Address: ${colors.cyan(`${host}:${port}`.padEnd(33))}
│  Protocol: ${colors.yellow('TCP'.padEnd(32))}
├─────────────────────────────────────────────┤
│  Test: whois -h ${host} -p ${port} example.com │
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘`));

      server.on('query', (query: string) => console.log(colors.gray(`${new Date().toISOString()} `) + `Query: ${colors.cyan(query)}`));

      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down...'));
        await server.stop();
        process.exit(0);
      });
    });

  // Telnet Mock Server
  serve
    .command('telnet')
    .description('Start a mock Telnet server for terminal testing')
    .option('port', {
      type: 'number',
      short: 'p',
      default: 2323,
      description: 'Port to listen on',
    })
    .option('host', {
      type: 'string',
      short: 'H',
      default: '127.0.0.1',
      description: 'Host to bind to',
    })
    .option('delay', {
      type: 'number',
      short: 'd',
      default: 0,
      description: 'Add delay to responses in milliseconds',
    })
    .option('no-echo', {
      description: 'Disable echo mode',
    })
    .example('rek serve telnet', 'Start on port 2323')
    .action(async (args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const { MockTelnetServer } = await import('../../testing/mock-telnet-server.js');

      const port = options.port || 2323;
      const host = options.host || '127.0.0.1';
      const delay = options.delay || 0;
      const echo = !options['no-echo'];

      const server = await MockTelnetServer.create({
        port,
        host,
        echo,
        delay,
      });

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock Telnet Server')}                 │
├─────────────────────────────────────────────┤
│  Address: ${colors.cyan(`${host}:${port}`.padEnd(33))}
│  Echo: ${colors.yellow((echo ? 'Enabled' : 'Disabled').padEnd(36))}
├─────────────────────────────────────────────┤
│  Connect: telnet ${host} ${port}               │
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

  // FTP Mock Server
  serve
    .command('ftp')
    .description('Start a mock FTP server for file transfer testing')
    .option('port', {
      type: 'number',
      short: 'p',
      default: 2121,
      description: 'Port to listen on',
    })
    .option('host', {
      type: 'string',
      short: 'H',
      default: '127.0.0.1',
      description: 'Host to bind to',
    })
    .option('username', {
      type: 'string',
      short: 'u',
      default: 'user',
      description: 'Username for authentication',
    })
    .option('password', {
      type: 'string',
      short: 'P',
      default: 'pass',
      description: 'Password for authentication',
    })
    .option('delay', {
      type: 'number',
      short: 'd',
      default: 0,
      description: 'Add delay to responses in milliseconds',
    })
    .option('no-anonymous', {
      description: 'Disable anonymous login',
    })
    .example('rek serve ftp', 'Start on port 2121')
    .example('rek serve ftp -u admin -P secret', 'Custom credentials')
    .action(async (args: string[], cmdObj: any) => {
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const { MockFtpServer } = await import('../../testing/mock-ftp-server.js');

      const port = options.port || 2121;
      const host = options.host || '127.0.0.1';
      const username = options.username || 'user';
      const password = options.password || 'pass';
      const delay = options.delay || 0;
      const anonymous = !options['no-anonymous'];

      const server = await MockFtpServer.create({
        port,
        host,
        username,
        password,
        anonymous,
        delay,
      });

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker Mock FTP Server')}                    │
├─────────────────────────────────────────────┤
│  Address: ${colors.cyan(`${host}:${port}`.padEnd(33))}
│  Anonymous: ${colors.yellow((anonymous ? 'Allowed' : 'Disabled').padEnd(31))}
│  User: ${colors.cyan(username.padEnd(36))}
├─────────────────────────────────────────────┤
│  Connect: ftp ${host} ${port}                  │
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

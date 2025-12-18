import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';

export function registerBenchCommand(program: Command) {
  const bench = program.command('bench').description('Performance benchmarking tools');

  bench
    .command('load')
    .description('Run a load test with real-time dashboard')
    .argument('<url>', {
      type: 'url',
      description: 'Target URL to load test',
      example: 'httpbin.org/get',
    })
    .option('users', {
      type: 'number',
      short: 'u',
      default: 50,
      description: 'Number of concurrent users',
      example: '100',
    })
    .option('duration', {
      type: 'number',
      short: 'd',
      default: 300,
      description: 'Test duration in seconds',
      example: '60',
    })
    .option('ramp', {
      type: 'number',
      short: 'r',
      default: 5,
      description: 'Ramp-up time in seconds',
      example: '10',
    })
    .option('mode', {
      type: 'string',
      short: 'm',
      default: 'throughput',
      enum: ['throughput', 'stress', 'realistic'],
      description: 'Test mode',
    })
    .option('http2', {
      description: 'Force HTTP/2 protocol',
    })
    .example('rek bench load httpbin.org/get -u 100 -d 60', '100 users for 60 seconds')
    .example('rek bench load api.com/heavy --mode stress', 'Run stress test')
    .example('rek bench load api.com --http2', 'Force HTTP/2')
    .action(async (url: string, args: string[], cmdObj: any) => {
       const options = cmdObj.opts ? cmdObj.opts() : {};

       if (!url.startsWith('http')) url = `https://${url}`;

       const { startLoadDashboard } = await import('../tui/load-dashboard.js');

       await startLoadDashboard({
         url,
         users: options.users || 50,
         duration: options.duration || 300,
         mode: options.mode || 'throughput',
         http2: !!options.http2,
         rampUp: options.ramp || 5,
       });
    });
}

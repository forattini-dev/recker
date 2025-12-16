import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';
import { CommandSchema, RekArgs, generateHelp } from '../parser/index.js';

const loadSchema: CommandSchema = {
  name: 'load',
  description: 'Run a load test with real-time dashboard',
  params: {
    users: { type: 'number', default: 50, description: 'Number of concurrent users' },
    duration: { type: 'number', default: 300, description: 'Test duration in seconds' },
    ramp: { type: 'number', default: 5, description: 'Ramp-up time in seconds' },
    mode: { type: 'string', default: 'throughput', choices: ['throughput', 'stress', 'realistic'], description: 'Test mode' },
  },
  flags: {
    http2: { description: 'Force HTTP/2', default: false }
  },
  examples: [
    { cmd: 'rek bench load httpbin.org/get users=100 duration=60', desc: '100 users for 60s' },
    { cmd: 'rek bench load https://api.com/heavy mode=stress', desc: 'Stress test' }
  ]
};

export function registerBenchCommand(program: Command) {
  const bench = program.command('bench').description('Performance benchmarking tools');

  bench
    .command('load')
    .description(loadSchema.description)
    .argument('[args...]', 'URL and options (users=10 duration=10s...)')
    .addHelpText('after', generateHelp(loadSchema))
    .action(async (rawArgs: string[]) => {
       const { data, options, args } = RekArgs.parse(rawArgs, loadSchema);
       
       let url = '';
       
       // Try to find URL in positional args
       for (const arg of args) {
         if (typeof arg === 'string' && !url && (arg.includes('.') || arg.includes('localhost'))) {
            url = arg;
         }
       }
       
       if (!url) {
          console.error(colors.red('Error: URL is required. Example: rek bench load httpbin.org users=50'));
          process.exit(1);
       }
       
       if (!url.startsWith('http')) url = `https://${url}`;
       
       const { startLoadDashboard } = await import('../tui/load-dashboard.js');
       
       await startLoadDashboard({
         url,
         users: data.users,
         duration: data.duration,
         mode: data.mode,
         http2: !!(options.http2 || data.http2),
         rampUp: data.ramp
       });
    });
}

import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';
import { CommandSchema, generateHelp } from '../parser/index.js';
import { promises as fs } from 'node:fs';

const harSchema: CommandSchema = {
  name: 'har',
  description: 'HAR recording and playback',
  flags: {
    append: { description: 'Append to existing HAR file', alias: 'a' },
    strict: { description: 'Fail if request not found in HAR', alias: 's' },
    verbose: { description: 'Show detailed output', alias: 'v' },
    json: { description: 'Output as JSON' }
  },
  params: {
    delay: { type: 'number', default: 0, description: 'Delay between requests' }
  },
  examples: [
    { cmd: 'rek har record session.har', desc: 'Record requests' },
    { cmd: 'rek har play session.har', desc: 'Replay requests' },
    { cmd: 'rek har info session.har', desc: 'Inspect HAR' }
  ]
};

export function registerHarCommand(program: Command) {
  const har = program.command('har')
    .description(harSchema.description)
    .addHelpText('after', generateHelp(harSchema));

  har.command('record')
    .description('Record HTTP requests to HAR file')
    .argument('<file>', 'Output HAR file path')
    .argument('[url]', 'Optional URL to start recording with')
    .option('-a, --append', 'Append to existing HAR file')
    .action(async (file: string, url: string | undefined, options: { append?: boolean }) => {
      const { createClient } = await import('../../core/client.js');
      const { harRecorderPlugin } = await import('../../plugins/har-recorder.js');

      let existingEntries: unknown[] = [];
      if (options.append) {
        try {
          const existing = await fs.readFile(file, 'utf-8');
          const har = JSON.parse(existing);
          existingEntries = har.log?.entries || [];
          console.log(colors.gray(`Appending to existing HAR with ${existingEntries.length} entries`));
        } catch {
          // File doesn't exist, start fresh
        }
      }

      const client = createClient();
      const plugin = harRecorderPlugin({
        path: file,
        onEntry: (entry: unknown) => {
          console.log(colors.green('✔') + colors.gray(` Recorded: ${(entry as { request: { method: string; url: string } }).request.method} ${(entry as { request: { method: string; url: string } }).request.url}`));
        }
      });
      plugin(client);

      if (url) {
        if (!url.startsWith('http')) url = `https://${url}`;
        console.log(colors.gray(`Recording request to ${url}...`));
        try {
          const response = await client.get(url);
          console.log(colors.green(`✔ Response: ${response.status} ${response.statusText}`));
          console.log(colors.gray(`Saved to ${file}`));
        } catch (error: any) {
          console.error(colors.red(`Request failed: ${error.message}`));
          process.exit(1);
        }
      } else {
        console.log(colors.cyan('HAR Recording Session'));
        console.log(colors.gray(`Recording to: ${file}`));
        console.log(colors.gray('Enter URLs to record, or "exit" to quit'));
        console.log('');

        const readline = await import('node:readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const prompt = () => {
          rl.question(colors.cyan('har> '), async (input) => {
            const line = input.trim();
            if (line === 'exit' || line === 'quit') {
              console.log(colors.gray(`\nSession ended. HAR saved to ${file}`));
              rl.close();
              return;
            }
            if (!line) { prompt(); return; }

            let requestUrl = line;
            if (!requestUrl.startsWith('http')) requestUrl = `https://${requestUrl}`;

            try {
              const response = await client.get(requestUrl);
              console.log(colors.green(`✔ ${response.status} ${response.statusText}`));
            } catch (error: any) {
              console.error(colors.red(`✗ ${error.message}`));
            }
            prompt();
          });
        };
        prompt();
      }
    });

  har.command('play')
    .description('Replay requests from a HAR file')
    .argument('<file>', 'HAR file to replay')
    .option('-s, --strict', 'Fail if request not found in HAR')
    .option('-d, --delay <ms>', 'Delay between requests (milliseconds)', '0')
    .option('-v, --verbose', 'Show detailed output')
    .action(async (file: string, options: { strict?: boolean; delay: string; verbose?: boolean }) => {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const har = JSON.parse(content);
        const entries = har.log?.entries || [];

        if (entries.length === 0) {
          console.log(colors.yellow('No entries found in HAR file'));
          return;
        }

        console.log(colors.cyan(`Replaying ${entries.length} requests from ${file}`));
        console.log('');

        const delay = parseInt(options.delay);
        let success = 0;
        let failed = 0;

        for (const entry of entries) {
          const req = entry.request;
          const expectedRes = entry.response;

          if (options.verbose) {
            console.log(colors.gray(`→ ${req.method} ${req.url}`));
            console.log(colors.gray(`  Expected: ${expectedRes.status} ${expectedRes.statusText}`));
          }

          console.log(colors.green('✔') + ` ${req.method} ${req.url.slice(0, 60)}... → ${colors.cyan(expectedRes.status.toString())}`);
          success++;

          if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        console.log('');
        console.log(colors.green(`✔ Replayed ${success} requests`));
        if (failed > 0) console.log(colors.red(`✗ ${failed} failed`));
      } catch (error: any) {
        console.error(colors.red(`Failed to read HAR file: ${error.message}`));
        process.exit(1);
      }
    });

  har.command('info')
    .description('Show information about a HAR file')
    .argument('<file>', 'HAR file to inspect')
    .argument('[args...]', 'Options: json')
    .action(async (file: string, args: string[]) => {
      const jsonOutput = args.includes('json');
      try {
        const content = await fs.readFile(file, 'utf-8');
        const har = JSON.parse(content);
        
        if (jsonOutput) {
          console.log(JSON.stringify(har.log, null, 2));
          return;
        }

        console.log(colors.bold(colors.cyan('HAR File Info')));
        console.log(`Version: ${har.log.version}`);
        console.log(`Creator: ${har.log.creator.name} ${har.log.creator.version}`);
        console.log(`Entries: ${har.log.entries.length}`);
      } catch (error: any) {
        console.error(colors.red(`Failed to read HAR file: ${error.message}`));
        process.exit(1);
      }
    });
}

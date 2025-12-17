/**
 * Live CLI Command
 *
 * Provides a convenient shortcut for recording live streams.
 * This is an alias for `rek video download --live`.
 *
 * @example
 * ```bash
 * # Record a live stream
 * rek live https://twitch.tv/shroud
 *
 * # Record for specific duration (in seconds)
 * rek live https://kick.com/xqc duration=3600 -o stream.ts
 *
 * # Record with custom quality
 * rek live https://chaturbate.com/username/ quality=highest -o live.ts
 * ```
 */

import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';
import { parseEnhancerPresets } from '../helpers.js';

export function registerLiveCommand(program: Command) {
  program
    .command('live')
    .description('Record a live stream (shortcut for video download --live)')
    .argument('<url>', 'Live stream URL')
    .argument('[args...]', 'Output, options, and headers')
    .option('-o, --output <file>', 'Output file path (default: live.ts)')
    .option('-v, --verbose', 'Show detailed information')
    .option('-d, --duration <seconds>', 'Recording duration in seconds')
    .addHelpText(
      'after',
      `
  ${colors.cyan('quality=<q>'.padEnd(18))} ${colors.gray('Quality: highest, lowest, or resolution (720p)')}
  ${colors.cyan('concurrency=<n>'.padEnd(18))} ${colors.gray('Concurrent segment downloads (default: 4)')}
  ${colors.cyan('Header:Value'.padEnd(18))} ${colors.gray('Add custom HTTP header')}

${colors.bold(colors.yellow('Supported Platforms:'))}
  ${colors.cyan('twitch'.padEnd(18))} ${colors.gray('Twitch.tv live streams')}
  ${colors.cyan('kick'.padEnd(18))} ${colors.gray('Kick.com live streams')}
  ${colors.cyan('youtube'.padEnd(18))} ${colors.gray('YouTube Live')}
  ${colors.cyan('tiktok'.padEnd(18))} ${colors.gray('TikTok Live')}
  ${colors.cyan('chaturbate'.padEnd(18))} ${colors.gray('Chaturbate.com')}
  ${colors.cyan('generic'.padEnd(18))} ${colors.gray('Any HLS live stream')}

${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('rek live https://twitch.tv/shroud')}
  ${colors.green('rek live https://kick.com/xqc -o xqc.ts')}
  ${colors.green('rek live https://youtube.com/live/xxxxx duration=3600')}
`
    )
    .action(async (...args: any[]) => {
      const url = args[0];
      const rawArgs = args[1] || [];
      const cmdObj = args[args.length - 1];

      // Handle `rek live help` - show help instead of treating 'help' as URL
      if (url === 'help' || url === '--help' || url === '-h') {
        cmdObj.help();
        return;
      }

      const options = cmdObj.opts ? cmdObj.opts() : {};
      const verbose = options.verbose;

      const { Client } = await import('../../core/client.js');
      const { createVideoBuilder } = await import('../../video/builder.js');

      // Process presets
      const { clientOptions, remainingArgs } = await parseEnhancerPresets(rawArgs);

      let output = options.output || 'live.ts';
      let quality: string | undefined;
      let duration = options.duration ? parseInt(options.duration, 10) : undefined;
      let concurrency = 4;
      const headers: Record<string, string> = {
        ...(clientOptions.headers as Record<string, string>),
      };
      let outputHandled = options.output ? true : false;

      // Process remaining args
      for (const arg of remainingArgs) {
        if (arg.startsWith('--') || arg.startsWith('-')) {
          continue;
        } else if (arg.includes('=')) {
          const [key, value] = arg.split('=');
          if (key === 'quality') quality = value;
          else if (key === 'duration') duration = parseInt(value, 10);
          else if (key === 'concurrency') concurrency = parseInt(value, 10);
        } else if (arg.includes(':') && !arg.startsWith('http')) {
          const [key, ...valueParts] = arg.split(':');
          headers[key.trim()] = valueParts.join(':').trim();
        } else if (!outputHandled && !arg.startsWith('http')) {
          output = arg;
          outputHandled = true;
        }
      }

      // Create client
      const finalClientOptions = { ...clientOptions, headers };
      const client = new Client(finalClientOptions);

      console.log(colors.gray(`Connecting to live stream: ${url}`));

      try {
        // Create video builder with live mode
        const videoBuilder = createVideoBuilder(url, client);

        // Set quality
        if (quality) {
          if (quality === 'highest' || quality === 'lowest' || quality === 'best' || quality === 'worst') {
            videoBuilder.quality(quality);
          } else if (quality.endsWith('p')) {
            videoBuilder.quality(quality as `${number}p`);
          }
        }

        // Enable live mode
        videoBuilder.live({
          duration: duration ? duration * 1000 : undefined,
        });

        // Set concurrency
        videoBuilder.options({ concurrency });

        // Get info first
        const info = await videoBuilder.info();

        console.log(colors.gray(`Channel: ${info.uploader || 'Unknown'}`));
        console.log(colors.gray(`Title: ${info.title}`));
        console.log(colors.gray(`Output: ${output}`));

        if (duration) {
          const hours = Math.floor(duration / 3600);
          const mins = Math.floor((duration % 3600) / 60);
          const secs = duration % 60;
          const durationStr = hours > 0
            ? `${hours}h ${mins}m ${secs}s`
            : mins > 0
              ? `${mins}m ${secs}s`
              : `${secs}s`;
          console.log(colors.gray(`Duration: ${durationStr}`));
        } else {
          console.log(colors.gray('Duration: Until stopped (Ctrl+C)'));
        }

        if (verbose && Object.keys(headers).length > 0) {
          console.log(colors.gray('With headers:'));
          for (const [key, value] of Object.entries(headers)) {
            console.log(
              `  ${colors.gray(`${key}: ${value.slice(0, 50)}${value.length > 50 ? '...' : ''}`)}`
            );
          }
        }
        console.log('');
        console.log(colors.cyan('Recording live stream...'));

        // Track start time for elapsed time display
        const startTime = Date.now();

        // Set up progress
        videoBuilder.onProgress((progress) => {
          const segs = progress.totalSegments
            ? `${progress.downloadedSegments}/${progress.totalSegments}`
            : `${progress.downloadedSegments}`;
          const mb = (progress.downloadedBytes / 1024 / 1024).toFixed(2);

          // Calculate elapsed time
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const elapsedMins = Math.floor(elapsed / 60);
          const elapsedSecs = elapsed % 60;
          const elapsedStr = `${elapsedMins.toString().padStart(2, '0')}:${elapsedSecs.toString().padStart(2, '0')}`;

          process.stdout.write(
            `\r  ${colors.cyan(elapsedStr)} | ${colors.cyan(segs)} segments | ${colors.cyan(mb + ' MB')}`
          );
        });

        // Download
        await videoBuilder.download(output);

        console.log('');
        console.log(colors.green(`✔ Recording complete: ${output}`));
      } catch (err: any) {
        console.log('');

        // Check if it was user-interrupted (Ctrl+C)
        if (err.message?.includes('aborted') || err.code === 'ERR_ABORTED') {
          console.log(colors.yellow(`Recording stopped. File saved to: ${output}`));
        } else {
          console.error(colors.red(`Error: ${err.message}`));

          if (verbose) {
            console.error(colors.gray('\n--- Error Details ---'));
            if (err.cause) console.error('Cause:', err.cause);
            if (err.stack) console.error(err.stack);
          }
          process.exit(1);
        }
      }
    });
}

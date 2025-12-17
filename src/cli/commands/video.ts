/**
 * Video CLI Command
 *
 * Provides video extraction and download capabilities from various sites.
 *
 * @example
 * ```bash
 * # Get video info
 * rek video info https://chaturbate.com/username/
 *
 * # Download video
 * rek video download https://pornhub.com/view_video.php?viewkey=xxx
 *
 * # Download with options
 * rek video download https://xvideos.com/video123/title -o video.mp4 quality=720p
 *
 * # Record live stream
 * rek video download https://chaturbate.com/username/ --live duration=60
 *
 * # List supported sites
 * rek video sites
 * ```
 */

import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';
import { parseEnhancerPresets } from '../helpers.js';

export function registerVideoCommand(program: Command) {
  const videoCmd = program.command('video').description('Video extraction and download');

  // ============================================
  // video info
  // ============================================
  videoCmd
    .command('info')
    .description('Get information about a video')
    .argument('<url>', 'Video URL')
    .option('-j, --json', 'Output as JSON')
    .action(async (url: string, options: { json?: boolean }, cmdObj: any) => {
      // Handle `rek video info help`
      if (url === 'help' || url === '--help' || url === '-h') {
        cmdObj.help();
        return;
      }

      const { Client } = await import('../../core/client.js');
      const { extract } = await import('../../extractors/index.js');

      const client = new Client();

      if (!options.json) {
        console.log(colors.gray(`Extracting video info from ${url}...`));
        console.log('');
      }

      try {
        const info = await extract(url, client);

        if (options.json) {
          console.log(JSON.stringify(info, null, 2));
          return;
        }

        console.log(colors.bold(colors.cyan('Video Info')));
        console.log('');
        console.log(`${colors.gray('ID:')} ${info.id}`);
        console.log(`${colors.gray('Title:')} ${info.title}`);

        if (info.uploader) {
          console.log(`${colors.gray('Uploader:')} ${info.uploader}`);
        }
        if (info.duration) {
          const minutes = Math.floor(info.duration / 60);
          const seconds = info.duration % 60;
          console.log(`${colors.gray('Duration:')} ${minutes}m ${seconds}s`);
        }
        if (info.viewCount) {
          console.log(`${colors.gray('Views:')} ${info.viewCount.toLocaleString()}`);
        }
        if (info.isLive) {
          console.log(`${colors.gray('Status:')} ${colors.green('LIVE')}`);
        }
        if (info.thumbnail) {
          console.log(`${colors.gray('Thumbnail:')} ${info.thumbnail}`);
        }

        if (info.formats && info.formats.length > 0) {
          console.log('');
          console.log(colors.bold('Available Formats:'));
          for (let i = 0; i < info.formats.length; i++) {
            const fmt = info.formats[i];
            const quality = fmt.height ? `${fmt.height}p` : fmt.formatId;
            const protocol = fmt.protocol || fmt.ext || 'http';
            console.log(
              `  ${colors.green(String(i + 1))}. ${quality} (${protocol})${
                fmt.bandwidth ? ` - ${Math.round(fmt.bandwidth / 1000)}kbps` : ''
              }`
            );
          }
        }

        console.log('');
      } catch (err: any) {
        console.error(colors.red(`Error: ${err.message}`));
        process.exit(1);
      }
    });

  // ============================================
  // video download
  // ============================================
  videoCmd
    .command('download')
    .description('Download a video')
    .argument('<url>', 'Video URL')
    .argument('[args...]', 'Output, options, and headers')
    .option('-o, --output <file>', 'Output file path')
    .option('-v, --verbose', 'Show detailed information')
    .option('-l, --live', 'Enable live stream mode')
    .addHelpText(
      'after',
      `
  ${colors.cyan('quality=<q>'.padEnd(18))} ${colors.gray('Quality: highest, lowest, or resolution (720p)')}
  ${colors.cyan('duration=<s>'.padEnd(18))} ${colors.gray('Duration for live recording in seconds')}
  ${colors.cyan('concurrency=<n>'.padEnd(18))} ${colors.gray('Concurrent segment downloads (default: 4)')}
  ${colors.cyan('Header:Value'.padEnd(18))} ${colors.gray('Add custom HTTP header')}

${colors.bold(colors.yellow('Supported Sites:'))}
  ${colors.cyan('chaturbate'.padEnd(18))} ${colors.gray('Chaturbate.com live streams')}
  ${colors.cyan('pornhub'.padEnd(18))} ${colors.gray('PornHub.com videos')}
  ${colors.cyan('xvideos'.padEnd(18))} ${colors.gray('XVideos.com videos')}
  ${colors.cyan('generic'.padEnd(18))} ${colors.gray('Any site with m3u8/mp4 (auto-detect)')}

${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('rek video download https://chaturbate.com/username/')}
  ${colors.green('rek video download https://pornhub.com/view_video.php?viewkey=xxx -o video.mp4')}
  ${colors.green('rek video download https://xvideos.com/video123/title quality=720p')}
`
    )
    .action(async (...args: any[]) => {
      const url = args[0];
      const rawArgs = args[1] || [];
      const cmdObj = args[args.length - 1];

      // Handle `rek video download help`
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

      let output = options.output || 'video.ts';
      let quality: string | undefined;
      let live = options.live;
      let duration: number | undefined;
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
          else if (key === 'live') live = true;
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

      console.log(colors.gray(`Extracting video from ${url}...`));

      try {
        // Create video builder
        const videoBuilder = createVideoBuilder(url, client);

        // Set quality
        if (quality) {
          if (quality === 'highest' || quality === 'lowest' || quality === 'best' || quality === 'worst') {
            videoBuilder.quality(quality);
          } else if (quality.endsWith('p')) {
            videoBuilder.quality(quality as `${number}p`);
          }
        }

        // Set live options
        if (live) {
          videoBuilder.live({
            duration: duration ? duration * 1000 : undefined,
          });
        }

        // Set concurrency
        videoBuilder.options({ concurrency });

        // Get info first
        const info = await videoBuilder.info();

        console.log(colors.gray(`Title: ${info.title}`));
        console.log(colors.gray(`Output: ${output}`));

        if (verbose && Object.keys(headers).length > 0) {
          console.log(colors.gray('With headers:'));
          for (const [key, value] of Object.entries(headers)) {
            console.log(
              `  ${colors.gray(`${key}: ${value.slice(0, 50)}${value.length > 50 ? '...' : ''}`)}`
            );
          }
        }
        console.log('');

        // Set up progress
        videoBuilder.onProgress((progress) => {
          const segs = progress.totalSegments
            ? `${progress.downloadedSegments}/${progress.totalSegments}`
            : `${progress.downloadedSegments}`;
          const mb = (progress.downloadedBytes / 1024 / 1024).toFixed(2);
          const percent = progress.percent ? ` (${progress.percent.toFixed(1)}%)` : '';
          process.stdout.write(
            `\r  ${colors.cyan(segs)} segments | ${colors.cyan(mb + ' MB')} downloaded${percent}`
          );
        });

        // Download
        await videoBuilder.download(output);

        console.log('');
        console.log(colors.green(`✔ Download complete: ${output}`));
      } catch (err: any) {
        console.log('');
        console.error(colors.red(`Error: ${err.message}`));

        if (verbose) {
          console.error(colors.gray('\n--- Error Details ---'));
          if (err.cause) console.error('Cause:', err.cause);
          if (err.stack) console.error(err.stack);
        }
        process.exit(1);
      }
    });

  // ============================================
  // video sites
  // ============================================
  videoCmd
    .command('sites')
    .description('List supported video sites')
    .action(async () => {
      const { listExtractors } = await import('../../extractors/index.js');

      console.log(colors.bold(colors.cyan('Supported Video Sites')));
      console.log('');

      const extractors = listExtractors();
      for (const name of extractors) {
        if (name === 'generic') {
          console.log(`  ${colors.green(name.padEnd(20))} ${colors.gray('Auto-detect m3u8/mp4 on any site')}`);
        } else {
          console.log(`  ${colors.green(name)}`);
        }
      }

      console.log('');
      console.log(colors.gray('Tip: The generic extractor works on most sites with embedded videos.'));
      console.log('');
    });

  // ============================================
  // video check
  // ============================================
  videoCmd
    .command('check')
    .description('Check if a URL is supported')
    .argument('<url>', 'Video URL to check')
    .action(async (url: string) => {
      const { getExtractorName, isSupported } = await import('../../extractors/index.js');

      const extractor = await getExtractorName(url);
      const supported = await isSupported(url);

      if (supported) {
        console.log(`${colors.green('✔')} URL is supported`);
        console.log(`${colors.gray('Extractor:')} ${extractor}`);
      } else {
        console.log(`${colors.yellow('⚠')} No specific extractor, will try generic`);
        console.log(colors.gray('The generic extractor may still be able to find videos.'));
      }
    });
}

/**
 * Live CLI Command
 *
 * Provides live stream info and recording capabilities.
 *
 * @example
 * ```bash
 * # Get live stream info (default action)
 * rek live https://twitch.tv/shroud
 * rek live @twitch/shroud
 * rek live twitch/shroud
 *
 * # Explicit info subcommand
 * rek live info https://kick.com/xqc
 *
 * # Record a live stream
 * rek live download https://twitch.tv/shroud
 * rek live download @chaturbate/room -o stream.ts
 *
 * # Record for specific duration (in seconds)
 * rek live download https://kick.com/xqc duration=3600 -o stream.ts
 *
 * # Record with custom quality
 * rek live download https://chaturbate.com/username/ quality=highest -o live.ts
 * ```
 */

import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';
import { parseEnhancerPresets } from '../helpers.js';
import { expandShortcut, isShortcut, listShortcuts } from '../utils/shortcut-expander.js';
import { join } from 'node:path';

/**
 * Generate a unique filename for live stream recording
 * Format: {provider}--{username}--{YYYY-MM-DD-HH-mm-ss}.ts
 */
function generateLiveFilename(
  url: string,
  extractorName: string | null,
  uploader: string | null
): string {
  // Get provider name
  let provider = extractorName || 'live';

  // Try to extract username from URL if uploader not available
  let username = uploader;
  if (!username) {
    try {
      const urlObj = new URL(url);
      // Common patterns: /username, /u/username, /channel/username
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0) {
        // Skip common path segments
        const skipSegments = ['u', 'channel', 'c', 'user', 'live', 'video', 'watch', 'embed'];
        username = pathParts.find(p => !skipSegments.includes(p.toLowerCase())) || pathParts[0];
      }
    } catch {
      username = 'unknown';
    }
  }

  // Sanitize username for filesystem
  username = (username || 'unknown')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 50); // Limit length

  // Generate timestamp: YYYY-MM-DD-HH-mm-ss
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('-');

  return `${provider}--${username}--${timestamp}.ts`;
}

export function registerLiveCommand(program: Command) {
  const liveCmd = program
    .command('live')
    .description('Monitor and record live streams from Twitch, Kick, YouTube, TikTok, and 30+ platforms')
    .argument('[url]', {
      type: 'url',
      description: 'Live stream URL or shortcut',
      example: '@twitch/shroud',
    })
    .example('rek live @twitch/shroud', 'Check if streamer is live')
    .example('rek live download @kick/xqc -o stream.ts', 'Record live stream')
    .example('rek live shortcuts', 'List all platform shortcuts')
    .action(async (args: string[], cmdObj: any) => {
      // RekCommand passes (args[], cmdObj) to action
      const url = args.find((a) => !a.startsWith('-'));
      const options = cmdObj.opts ? cmdObj.opts() : {};

      // If no URL provided, show help
      if (!url) {
        cmdObj.help();
        return;
      }

      // Default action: show live stream info
      await liveInfoAction(url, options);
    });

  // ============================================
  // live info
  // ============================================
  liveCmd
    .command('info')
    .description('Get information about a live stream')
    .argument('<url>', {
      type: 'url',
      description: 'Live stream URL or shortcut',
      example: '@twitch/shroud',
    })
    .action(async (url: string, args: string[], cmdObj: any) => {
      // Handle `rek live info help`
      if (url === 'help' || url === '--help' || url === '-h') {
        cmdObj.help();
        return;
      }

      const options = cmdObj.opts ? cmdObj.opts() : {};
      await liveInfoAction(url, options);
    });

  // ============================================
  // live download
  // ============================================
  liveCmd
    .command('download')
    .description('Record a live stream to a file until stopped or duration reached')
    .argument('<url>', {
      type: 'url',
      description: 'Live stream URL or shortcut',
      example: '@twitch/shroud',
    })
    .argument('[args...]', {
      description: 'Additional headers (Header:Value format)',
      variadic: true,
    })
    .example('rek live download @twitch/shroud', 'Record until Ctrl+C')
    .example('rek live download @kick/xqc -o xqc.ts', 'Save to specific file')
    .example('rek live download @twitch/xxx --duration=3600', 'Record for 1 hour')
    .example('rek live download @chaturbate/xxx --quality=highest', 'Best quality')
    .option('output', {
      type: 'string',
      short: 'o',
      description: 'Output file path (if not set, auto-generates unique name)',
      example: 'stream.ts',
    })
    .option('outputDir', {
      type: 'string',
      short: 'O',
      description: 'Output directory (auto-generates filename)',
      example: '/mnt/recordings',
    })
    .option('quality', {
      type: 'string',
      short: 'Q',
      enum: ['highest', 'lowest', 'best', 'worst'],
      description: 'Quality preset (or use 720p, 1080p)',
      example: '720p',
    })
    .option('duration', {
      type: 'number',
      short: 'd',
      description: 'Stop recording after N seconds',
      example: '3600',
    })
    .option('concurrency', {
      type: 'number',
      short: 'c',
      default: 4,
      description: 'Concurrent segment downloads',
    })
    .option('verbose', {
      short: 'v',
      description: 'Show detailed progress info',
    })
    .action(async (...args: any[]) => {
      const rawUrl = args[0];
      const rawArgs = args[1] || [];
      const cmdObj = args[args.length - 1];

      // Handle `rek live download help`
      if (rawUrl === 'help' || rawUrl === '--help' || rawUrl === '-h') {
        cmdObj.help();
        return;
      }

      // Expand shortcut to full URL
      const url = expandShortcut(rawUrl);
      const wasShortcut = url !== rawUrl;

      const options = cmdObj.opts ? cmdObj.opts() : {};
      const { Client } = await import('../../core/client.js');
      const { createVideoBuilder } = await import('../../video/builder.js');
      const { getExtractorName } = await import('../../extractors/index.js');

      // Process presets (for +proxy, +cache, etc)
      const { clientOptions, remainingArgs } = await parseEnhancerPresets(rawArgs);

      // Get options from SmartOption parser
      const userOutput = options.output;
      const outputDir = options.outputDir;
      const verbose = options.verbose;
      const concurrency = options.concurrency || 4;

      // Quality and duration can come from --option or key=value
      let quality: string | undefined = options.quality;
      let duration: number | undefined = options.duration;
      let parsedOutputDir: string | undefined = outputDir;

      // Parse headers (Header:Value) and legacy key=value from remaining args
      const headers: Record<string, string> = {
        ...(clientOptions.headers as Record<string, string>),
      };

      for (const arg of remainingArgs) {
        if (arg.startsWith('--') || arg.startsWith('-')) continue;

        if (arg.includes('=')) {
          const [key, value] = arg.split('=');
          if (key === 'quality' && !quality) quality = value;
          else if (key === 'duration' && !duration) duration = parseInt(value, 10);
          else if (key === 'outputDir' && !parsedOutputDir) parsedOutputDir = value;
          else if (key === 'output' && !userOutput) options.output = value;
        } else if (arg.includes(':') && !arg.startsWith('http')) {
          const colonIndex = arg.indexOf(':');
          const headerName = arg.slice(0, colonIndex).trim();
          const headerValue = arg.slice(colonIndex + 1).trim();
          headers[headerName] = headerValue;
        }
      }

      // Create client
      const finalClientOptions = { ...clientOptions, headers };
      const client = new Client(finalClientOptions);

      if (wasShortcut) {
        console.log(colors.gray(`Shortcut: ${rawUrl} → ${url}`));
      }
      console.log(colors.gray(`Connecting to live stream: ${url}`));

      // Determine output path (declared early for catch block access)
      const finalUserOutput = options.output || userOutput;
      // Initialize with fallback in case we fail before getting stream info
      let output: string = finalUserOutput || generateLiveFilename(url, null, null);
      if (parsedOutputDir && !finalUserOutput) {
        output = join(parsedOutputDir, output);
      }

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

        if (finalUserOutput) {
          // User specified explicit output path
          output = finalUserOutput;
        } else {
          // Auto-generate unique filename
          const extractorName = await getExtractorName(url);
          const generatedFilename = generateLiveFilename(url, extractorName, info.uploader || null);

          if (parsedOutputDir) {
            // Use specified directory with auto-generated name
            output = join(parsedOutputDir, generatedFilename);
          } else {
            // Use current directory with auto-generated name
            output = generatedFilename;
          }
        }

        console.log(colors.gray(`Channel: ${info.uploader || 'Unknown'}`));
        console.log(colors.gray(`Title: ${info.title}`));
        console.log(colors.gray(`Output: ${output}`));

        if (duration) {
          const hours = Math.floor(duration / 3600);
          const mins = Math.floor((duration % 3600) / 60);
          const secs = duration % 60;
          const durationStr =
            hours > 0
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
          console.error(colors.red(`Error: ${err.message || err.toString()}`));

          // Always show error details for debugging
          console.error(colors.gray('\n--- Error Details ---'));
          if (err.cause) console.error('Cause:', err.cause);
          if (err.stack) console.error(err.stack);
          process.exit(1);
        }
      }
    });

  // ============================================
  // live shortcuts
  // ============================================
  liveCmd
    .command('shortcuts')
    .description('List available URL shortcuts')
    .action(() => {
      console.log(colors.bold(colors.cyan('Available Shortcuts for Live Streams')));
      console.log('');
      console.log(colors.gray('Use shortcuts instead of full URLs:'));
      console.log('');

      // Show only live-relevant shortcuts
      const liveShortcuts = [
        'twitch',
        'kick',
        'youtube',
        'tiktok',
        'facebook',
        'instagram',
        'chaturbate',
        'vk',
        'peertube',
      ];

      const shortcuts = listShortcuts().filter((s) => liveShortcuts.includes(s.site));
      for (const { site, examples } of shortcuts) {
        console.log(`  ${colors.green(site.padEnd(14))} ${colors.gray(examples[0])}`);
      }

      console.log('');
      console.log(colors.bold(colors.yellow('Examples:')));
      console.log(`  ${colors.green('rek live @twitch/shroud')}`);
      console.log(`  ${colors.green('rek live twitch/xqc')}`);
      console.log(`  ${colors.green('rek live download @chaturbate/room')}`);
      console.log(`  ${colors.green('rek live download @kick/ninja duration=3600')}`);
      console.log('');
    });
}

/**
 * Shared live info action
 */
async function liveInfoAction(rawUrl: string, options: { json?: boolean }) {
  const { Client } = await import('../../core/client.js');
  const { extract } = await import('../../extractors/index.js');

  // Expand shortcut to full URL
  const url = expandShortcut(rawUrl);
  const wasShortcut = url !== rawUrl;

  const client = new Client();

  if (!options.json) {
    if (wasShortcut) {
      console.log(colors.gray(`Shortcut: ${rawUrl} → ${url}`));
    }
    console.log(colors.gray(`Checking live stream: ${url}...`));
    console.log('');
  }

  try {
    const info = await extract(url, client);

    if (options.json) {
      console.log(JSON.stringify(info, null, 2));
      return;
    }

    console.log(colors.bold(colors.cyan('Live Stream Info')));
    console.log('');

    // Live status first
    if (info.isLive) {
      console.log(`${colors.gray('Status:')} ${colors.green('● LIVE')}`);
    } else {
      console.log(`${colors.gray('Status:')} ${colors.red('○ OFFLINE')}`);
    }

    console.log(`${colors.gray('ID:')} ${info.id}`);
    console.log(`${colors.gray('Title:')} ${info.title}`);

    if (info.uploader) {
      console.log(`${colors.gray('Channel:')} ${info.uploader}`);
    }
    if (info.viewCount) {
      console.log(`${colors.gray('Viewers:')} ${info.viewCount.toLocaleString()}`);
    }
    if (info.thumbnail) {
      console.log(`${colors.gray('Thumbnail:')} ${info.thumbnail}`);
    }

    if (info.formats && info.formats.length > 0) {
      console.log('');
      console.log(colors.bold('Available Qualities:'));

      // Filter for live/streaming formats
      const liveFormats = info.formats.filter(
        (f) => f.protocol === 'm3u8' || f.protocol === 'm3u8_native' || f.ext === 'm3u8'
      );
      const formatsToShow = liveFormats.length > 0 ? liveFormats : info.formats;

      for (let i = 0; i < Math.min(formatsToShow.length, 5); i++) {
        const fmt = formatsToShow[i];
        const quality = fmt.height ? `${fmt.height}p` : fmt.formatId;
        const protocol = fmt.protocol || fmt.ext || 'http';
        console.log(
          `  ${colors.green(String(i + 1))}. ${quality} (${protocol})${
            fmt.bandwidth ? ` - ${Math.round(fmt.bandwidth / 1000)}kbps` : ''
          }`
        );
      }

      if (formatsToShow.length > 5) {
        console.log(colors.gray(`  ... and ${formatsToShow.length - 5} more`));
      }
    }

    console.log('');

    if (info.isLive) {
      console.log(colors.gray('To record this stream:'));
      console.log(`  ${colors.green(`rek live download ${rawUrl}`)}`);
      console.log('');
    }
  } catch (err: any) {
    console.error(colors.red(`Error: ${err.message}`));
    process.exit(1);
  }
}

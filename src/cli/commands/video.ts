/**
 * Video CLI Command
 *
 * Provides video extraction and download capabilities from various sites.
 *
 * @example
 * ```bash
 * # Get video info (default action)
 * rek video https://youtube.com/watch?v=dQw4w9WgXcQ
 * rek video @youtube/dQw4w9WgXcQ
 * rek video youtube/dQw4w9WgXcQ
 *
 * # Explicit info subcommand
 * rek video info https://chaturbate.com/username/
 *
 * # Download video
 * rek video download https://pornhub.com/view_video.php?viewkey=xxx
 * rek video download @youtube/dQw4w9WgXcQ -o video.mp4
 *
 * # Download with options
 * rek video download https://xvideos.com/video123/title -o video.mp4 quality=720p
 *
 * # Record live stream
 * rek video download https://chaturbate.com/username/ --live duration=60
 *
 * # List supported sites
 * rek video sites
 *
 * # Show available shortcuts
 * rek video shortcuts
 * ```
 */

import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';
import { parseEnhancerPresets } from '../helpers.js';
import { expandShortcut, isShortcut, listShortcuts } from '../utils/shortcut-expander.js';

export function registerVideoCommand(program: Command) {
  const videoCmd = program
    .command('video')
    .description('Extract and download videos from 40+ sites including YouTube, Vimeo, TikTok, and adult sites')
    .argument('[url]', {
      type: 'url',
      description: 'Video URL or shortcut',
      example: '@youtube/dQw4w9WgXcQ',
    })
    .example('rek video @youtube/dQw4w9WgXcQ', 'Get video info')
    .example('rek video download @youtube/xxx -o video.mp4', 'Download video')
    .example('rek video sites', 'List all supported sites')
    .option('sub', {
      type: 'string',
      short: 's',
      description: 'Download subtitle for language code',
      example: 'en',
    })
    .option('sub-format', {
      type: 'string',
      enum: ['vtt', 'srv3', 'ttml', 'json3'],
      default: 'vtt',
      description: 'Subtitle format',
    })
    .option('sub-auto', { description: 'Include auto-generated captions' })
    .option('output', {
      type: 'string',
      short: 'o',
      description: 'Output file path',
      example: 'video.mp4',
    })
    .action(async (args: string[], cmdObj: any) => {
      // RekCommand passes (args[], cmdObj) to action
      const positionalArgs = cmdObj.getPositionalArgs ? cmdObj.getPositionalArgs(args) : args.filter((a: string) => !a.startsWith('-'));
      const url = positionalArgs.find((a: string) => a.startsWith('@') || a.startsWith('http') || a.includes('/'));
      const options = cmdObj.opts ? cmdObj.opts() : {};

      // If no URL provided, show help
      if (!url) {
        cmdObj.help();
        return;
      }

      // Default action: show video info
      await videoInfoAction(url, options);
    });

  // ============================================
  // video info
  // ============================================
  videoCmd
    .command('info')
    .description('Get detailed information about a video including formats, subtitles, and metadata')
    .argument('<url>', {
      type: 'url',
      description: 'Video URL or shortcut',
      example: '@youtube/dQw4w9WgXcQ',
    })
    .example('rek video info @youtube/dQw4w9WgXcQ', 'Show video details')
    .example('rek video info @youtube/xxx --sub=en', 'Download English subtitles')
    .option('sub', {
      type: 'string',
      short: 's',
      description: 'Download subtitle for language code',
      example: 'en',
    })
    .option('sub-format', {
      type: 'string',
      enum: ['vtt', 'srv3', 'ttml', 'json3'],
      default: 'vtt',
      description: 'Subtitle format',
    })
    .option('sub-auto', { description: 'Include auto-generated captions' })
    .option('output', {
      type: 'string',
      short: 'o',
      description: 'Output file path',
      example: 'video.en.vtt',
    })
    .action(async (url: string, args: string[], cmdObj: any) => {
      // Handle `rek video info help`
      if (url === 'help' || url === '--help' || url === '-h') {
        cmdObj.help();
        return;
      }

      const options = cmdObj.opts ? cmdObj.opts() : {};
      await videoInfoAction(url, options);
    });

  // ============================================
  // video download
  // ============================================
  videoCmd
    .command('download')
    .description('Download a video or record a live stream to a file')
    .argument('<url>', {
      type: 'url',
      description: 'Video URL or shortcut',
      example: '@youtube/dQw4w9WgXcQ',
    })
    .argument('[args...]', {
      description: 'Additional options and headers (Header:Value)',
      variadic: true,
    })
    .example('rek video download @youtube/dQw4w9WgXcQ', 'Download with default settings')
    .example('rek video download @youtube/xxx -o video.mp4', 'Specify output file')
    .example('rek video download @youtube/xxx quality=720p', 'Select quality')
    .example('rek video download @twitch/xxx --live duration=3600', 'Record live for 1 hour')
    .option('output', {
      type: 'string',
      short: 'o',
      description: 'Output file path',
      example: 'video.mp4',
    })
    .option('quality', {
      type: 'string',
      short: 'Q',
      enum: ['highest', 'lowest', 'best', 'worst'],
      description: 'Quality preset (or use 720p, 1080p, etc)',
      example: '720p',
    })
    .option('live', {
      short: 'l',
      description: 'Enable live stream recording mode',
    })
    .option('duration', {
      type: 'number',
      short: 'd',
      description: 'Recording duration in seconds (for live)',
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
      description: 'Show detailed progress and debug info',
    })
    .action(async (...args: any[]) => {
      const rawUrl = args[0];
      const rawArgs = args[1] || [];
      const cmdObj = args[args.length - 1];

      // Handle `rek video download help`
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

      // Process presets (for +proxy, +cache, etc)
      const { clientOptions, remainingArgs } = await parseEnhancerPresets(rawArgs);

      // Get options from parsed opts (SmartOption) or fallback to key=value args
      const output = options.output || 'video.ts';
      const verbose = options.verbose;
      const live = options.live;
      const concurrency = options.concurrency || 4;

      // Quality can come from --quality or quality=xxx
      let quality: string | undefined = options.quality;
      let duration: number | undefined = options.duration;

      // Parse headers (Header:Value) and legacy key=value from remaining args
      const headers: Record<string, string> = {
        ...(clientOptions.headers as Record<string, string>),
      };

      for (const arg of remainingArgs) {
        if (arg.startsWith('--') || arg.startsWith('-')) continue;

        if (arg.includes('=')) {
          const [key, value] = arg.split('=');
          // Only handle legacy key=value if not already set via --option
          if (key === 'quality' && !quality) quality = value;
          else if (key === 'duration' && !duration) duration = parseInt(value, 10);
        } else if (arg.includes(':') && !arg.startsWith('http')) {
          // Header:Value format
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
    .argument('<url>', 'Video URL or shortcut to check')
    .action(async (rawUrl: string) => {
      const { getExtractorName, isSupported } = await import('../../extractors/index.js');

      // Expand shortcut first
      const url = expandShortcut(rawUrl);
      if (url !== rawUrl) {
        console.log(colors.gray(`Shortcut: ${rawUrl} → ${url}`));
      }

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

  // ============================================
  // video shortcuts
  // ============================================
  videoCmd
    .command('shortcuts')
    .description('List available URL shortcuts')
    .action(() => {
      console.log(colors.bold(colors.cyan('Available Shortcuts')));
      console.log('');
      console.log(colors.gray('Use shortcuts instead of full URLs:'));
      console.log('');

      const shortcuts = listShortcuts();
      for (const { site, examples } of shortcuts) {
        console.log(`  ${colors.green(site.padEnd(14))} ${colors.gray(examples[0])}`);
      }

      console.log('');
      console.log(colors.bold(colors.yellow('Examples:')));
      console.log(`  ${colors.green('rek video @youtube/dQw4w9WgXcQ')}`);
      console.log(`  ${colors.green('rek video youtube/dQw4w9WgXcQ')}`);
      console.log(`  ${colors.green('rek video download @twitch/shroud')}`);
      console.log(`  ${colors.green('rek live @chaturbate/room')}`);
      console.log('');
    });
}

interface VideoInfoOptions {
  json?: boolean;
  sub?: string;
  subFormat?: string;
  subAuto?: boolean;
  output?: string;
}

/**
 * Shared video info action
 */
async function videoInfoAction(rawUrl: string, options: VideoInfoOptions) {
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

    // Show subtitles if available
    const hasSubtitles = info.subtitles && Object.keys(info.subtitles).length > 0;
    const hasAutoCaptions = info.automaticCaptions && Object.keys(info.automaticCaptions).length > 0;

    if (hasSubtitles || hasAutoCaptions) {
      console.log('');

      if (hasSubtitles) {
        console.log(colors.bold('Subtitles:'));
        for (const [langCode, tracks] of Object.entries(info.subtitles!)) {
          const name = tracks[0]?.name || langCode;
          const formats = [...new Set(tracks.map(t => t.ext))].join(', ');
          console.log(`  ${colors.green(langCode.padEnd(8))} ${colors.gray(name)} (${formats})`);
        }
      }

      if (hasAutoCaptions) {
        if (hasSubtitles) console.log('');
        console.log(colors.bold('Auto-Generated Captions:'));
        for (const [langCode, tracks] of Object.entries(info.automaticCaptions!)) {
          const name = tracks[0]?.name || langCode;
          const formats = [...new Set(tracks.map(t => t.ext))].join(', ');
          console.log(`  ${colors.green(langCode.padEnd(8))} ${colors.gray(name)} (${formats})`);
        }
      }

      // Download subtitle if --sub is provided
      if (options.sub) {
        const lang = options.sub;

        // Combine subtitles based on options
        const allSubtitles: Record<string, any[]> = { ...info.subtitles };
        if (options.subAuto && info.automaticCaptions) {
          for (const [langCode, tracks] of Object.entries(info.automaticCaptions)) {
            if (!allSubtitles[langCode]) {
              allSubtitles[langCode] = [];
            }
            allSubtitles[langCode].push(...tracks);
          }
        }

        const tracks = allSubtitles[lang];
        if (!tracks || tracks.length === 0) {
          console.log('');
          console.error(colors.red(`No subtitles found for language: ${lang}`));
          console.log(colors.gray('Available: ' + Object.keys(allSubtitles).join(', ')));
          process.exit(1);
        }

        const format = options.subFormat || 'vtt';
        const track = tracks.find((t: any) => t.ext === format) || tracks[0];

        console.log('');
        console.log(colors.gray(`Downloading ${lang} subtitles (${track.ext})...`));

        const response = await client.get(track.url);
        const content = await response.text();

        const { writeFile } = await import('fs/promises');
        const outputFile = options.output || `${info.id}.${lang}.${track.ext}`;
        await writeFile(outputFile, content, 'utf-8');

        console.log(colors.green(`✔ Subtitles saved to: ${outputFile}`));
      } else {
        console.log('');
        console.log(colors.gray(`To download: rek video ${rawUrl} --sub <lang>`));
      }
    }

    console.log('');
  } catch (err: any) {
    console.error(colors.red(`Error: ${err.message}`));
    process.exit(1);
  }
}

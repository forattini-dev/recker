/**
 * HLS CLI Commands
 *
 * This file registers HLS commands with the CLI router.
 * Info command uses unified handler, download keeps complex features inline.
 */

import { RekCommand as Command } from '../router.js';
import { createCliActionWithOptions } from '../cli-adapter.js';
import { hlsInfoHandler } from '../handlers/streaming.js';
import colors from '../../utils/colors.js';
import { parseEnhancerPresets } from '../helpers.js';

export function registerHlsCommand(program: Command) {
  const hlsCmd = program
    .command('hls')
    .description('Download and analyze HLS (HTTP Live Streaming) playlists and segments')
    .example('rek hls info https://example.com/stream.m3u8', 'Analyze HLS playlist')
    .example('rek hls download https://example.com/stream.m3u8 -o video.ts', 'Download stream');

  // Info command - uses unified handler
  hlsCmd
    .command('info')
    .description('Analyze an HLS playlist showing qualities, segments, and duration')
    .argument('<url>', {
      type: 'url',
      description: 'HLS master or media playlist URL (.m3u8)',
      example: 'https://example.com/stream.m3u8',
    })
    .option('quality', {
      type: 'string',
      short: 'Q',
      default: 'highest',
      description: 'Quality preset',
    })
    .option('live', {
      short: 'l',
      description: 'Enable live stream mode',
    })
    .example('rek hls info https://example.com/master.m3u8', 'Show available qualities')
    .example('rek hls info https://example.com/live.m3u8', 'Check if stream is live or VOD')
    .action(createCliActionWithOptions(hlsInfoHandler, {
      positional: ['url'],
      options: ['quality', 'live']
    }));

  // Download command - keeps complex features inline (presets, headers, progress)
  hlsCmd
    .command('download')
    .description('Download an HLS stream to a local file, with quality selection and live support')
    .argument('<url>', {
      type: 'url',
      description: 'HLS playlist URL (.m3u8)',
      example: 'https://example.com/stream.m3u8',
    })
    .argument('[args...]', {
      description: 'Additional headers (Header:Value format)',
      variadic: true,
    })
    .example('rek hls download https://example.com/stream.m3u8', 'Download to stream.ts')
    .example('rek hls download https://example.com/stream.m3u8 -o video.ts', 'Custom output file')
    .example('rek hls download https://example.com/stream.m3u8 -Q 720p', 'Select 720p quality')
    .example('rek hls download https://example.com/live.m3u8 --live -d 60', 'Record 60s of live')
    .example('rek hls download URL Referer:https://site.com', 'With custom header')
    .option('output', {
      type: 'string',
      short: 'o',
      default: 'stream.ts',
      description: 'Output file path',
      example: 'video.ts',
    })
    .option('quality', {
      type: 'string',
      short: 'Q',
      enum: ['highest', 'lowest'],
      description: 'Quality preset (or use resolution like 720p, 1080p)',
      example: '720p',
    })
    .option('live', {
      short: 'l',
      description: 'Enable live stream mode (keeps downloading new segments)',
    })
    .option('duration', {
      type: 'number',
      short: 'd',
      description: 'Stop recording after N seconds (live mode)',
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
      description: 'Show detailed progress and error information',
    })
    .action(async (...args: any[]) => {
      const url = args[0];
      const rawArgs = args[1] || [];
      const cmdObj = args[args.length - 1];

      const options = cmdObj.opts ? cmdObj.opts() : {};

      const { hls } = await import('../../plugins/hls.js');
      const { Client } = await import('../../core/client.js');

      // Process presets (+chaturbate, +chrome, etc.)
      const { clientOptions, remainingArgs } = await parseEnhancerPresets(rawArgs);

      // Get options from SmartOption parser
      const output = options.output || 'stream.ts';
      const verbose = options.verbose;
      const concurrency = options.concurrency || 4;
      const live = options.live;
      const duration: number | undefined = options.duration;

      // Quality can come from --quality or key=value
      let quality: string | undefined = options.quality;

      // Parse headers (Header:Value) and legacy key=value from remaining args
      const headers: Record<string, string> = {
        ...(clientOptions.headers as Record<string, string>),
      };

      for (const arg of remainingArgs) {
        if (arg.startsWith('--') || arg.startsWith('-')) continue;

        if (arg.includes('=')) {
          const [key, value] = arg.split('=');
          if (key === 'quality' && !quality) quality = value;
        } else if (arg.includes(':') && !arg.startsWith('http')) {
          const colonIndex = arg.indexOf(':');
          const headerName = arg.slice(0, colonIndex).trim();
          const headerValue = arg.slice(colonIndex + 1).trim();
          headers[headerName] = headerValue;
        }
      }

      // Create client with options (including retry, timeout from presets if any)
      const client = new Client(clientOptions);

      console.log(colors.gray(`Downloading HLS stream from ${url}...`));
      console.log(colors.gray(`Output: ${output}`));
      if (Object.keys(headers).length > 0) {
        console.log(colors.gray('With headers:'));
        for (const [key, value] of Object.entries(headers)) {
          console.log(`  ${colors.gray(`${key}: ${value.slice(0, 50)}${value.length > 50 ? '...' : ''}`)}`);
        }
      }
      console.log('');

      try {
        const hlsOptions: any = {
          concurrency,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
          onProgress: (p: any) => {
            const segs = p.totalSegments
              ? `${p.downloadedSegments}/${p.totalSegments}`
              : `${p.downloadedSegments}`;
            const mb = (p.downloadedBytes / 1024 / 1024).toFixed(2);
            process.stdout.write(`\r  ${colors.cyan(segs)} segments | ${colors.cyan(mb + ' MB')} downloaded`);
          },
        };

        if (quality) {
          if (quality === 'highest' || quality === 'lowest') {
            hlsOptions.quality = quality;
          } else if (quality.includes('p')) {
            hlsOptions.quality = { resolution: quality };
          }
        }

        if (live) {
          hlsOptions.live = duration
            ? { duration: duration * 1000 }
            : true;
        }

        await hls(client, url, hlsOptions).download(output);

        console.log('');
        console.log(colors.green(`✔ Download complete: ${output}`));

      } catch (err: any) {
        console.log('');
        const msg = err.message || String(err);
        console.error(colors.red(`HLS Download Error: ${msg}`));

        if (verbose) {
            console.error(colors.gray('\n--- Error Details ---'));
            if (err.cause) console.error('Cause:', err.cause);
            if (err.stack) console.error(err.stack);
        }
        process.exit(1);
      }
    });
}

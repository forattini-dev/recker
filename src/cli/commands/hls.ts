import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';
import { parseEnhancerPresets } from '../helpers.js';

export function registerHlsCommand(program: Command) {
  const hlsCmd = program
    .command('hls')
    .description('Download and analyze HLS (HTTP Live Streaming) playlists and segments')
    .example('rek hls info https://example.com/stream.m3u8', 'Analyze HLS playlist')
    .example('rek hls download https://example.com/stream.m3u8 -o video.ts', 'Download stream');

  hlsCmd
    .command('info')
    .description('Analyze an HLS playlist showing qualities, segments, and duration')
    .argument('<url>', {
      type: 'url',
      description: 'HLS master or media playlist URL (.m3u8)',
      example: 'https://example.com/stream.m3u8',
    })
    .example('rek hls info https://example.com/master.m3u8', 'Show available qualities')
    .example('rek hls info https://example.com/live.m3u8', 'Check if stream is live or VOD')
    .action(async (url) => {
      const { Client } = await import('../../core/client.js');
      const client = new Client();

      console.log(colors.gray(`Fetching playlist from ${url}...`));

      try {
        const res = await client.get(url);
        const content = await res.text();

        // Parse the playlist
        const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

        if (!lines[0]?.startsWith('#EXTM3U')) {
          console.error(colors.red('Not a valid HLS playlist'));
          process.exit(1);
        }

        // Check if master playlist
        const isMaster = lines.some(l => l.startsWith('#EXT-X-STREAM-INF'));

        console.log('');
        console.log(colors.bold(colors.cyan('HLS Stream Info')));
        console.log(`${colors.gray('URL:')} ${url}`);
        console.log(`${colors.gray('Type:')} ${isMaster ? 'Master Playlist' : 'Media Playlist'}`);
        console.log('');

        if (isMaster) {
          // Parse variants
          console.log(colors.bold('Available Qualities:'));
          let i = 0;
          for (let j = 0; j < lines.length; j++) {
            if (lines[j].startsWith('#EXT-X-STREAM-INF')) {
              const bandwidth = lines[j].match(/BANDWIDTH=(\d+)/)?.[1];
              const resolution = lines[j].match(/RESOLUTION=([^,]+)/)?.[1];
              const codecs = lines[j].match(/CODECS="([^"]+)"/)?.[1];
              const variantUrl = lines[j + 1];

              const bw = bandwidth ? `${Math.round(parseInt(bandwidth) / 1000)}kbps` : 'N/A';
              console.log(`  ${colors.green(String(i + 1))}. ${resolution || 'Unknown'} - ${bw}`);
              if (codecs) {
                console.log(`     ${colors.gray('Codecs:')} ${codecs}`);
              }
              i++;
            }
          }
        } else {
          // Media playlist - count segments
          const segments = lines.filter(l => !l.startsWith('#') && l.length > 0);
          const targetDuration = lines.find(l => l.startsWith('#EXT-X-TARGETDURATION'))?.split(':')[1];
          const endList = lines.some(l => l === '#EXT-X-ENDLIST');
          const mediaSequence = lines.find(l => l.startsWith('#EXT-X-MEDIA-SEQUENCE'))?.split(':')[1];

          console.log(`${colors.gray('Segments:')} ${segments.length}`);
          if (targetDuration) {
            console.log(`${colors.gray('Target Duration:')} ${targetDuration}s`);
          }
          if (mediaSequence) {
            console.log(`${colors.gray('Media Sequence:')} ${mediaSequence}`);
          }
          console.log(`${colors.gray('Type:')} ${endList ? 'VOD' : 'Live'}`);

          // Calculate total duration
          let totalDuration = 0;
          for (const line of lines) {
            if (line.startsWith('#EXTINF:')) {
              const duration = parseFloat(line.split(':')[1].split(',')[0]);
              totalDuration += duration;
            }
          }

          if (totalDuration > 0) {
            const minutes = Math.floor(totalDuration / 60);
            const seconds = Math.round(totalDuration % 60);
            console.log(`${colors.gray('Total Duration:')} ${minutes}m ${seconds}s`);
          }
        }
        console.log('');

      } catch (err: any) {
        console.error(colors.red(`HLS Error: ${err.message}`));
        process.exit(1);
      }
    });

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
          // duration and concurrency now handled by SmartOption
        } else if (arg.includes(':') && !arg.startsWith('http')) {
          const colonIndex = arg.indexOf(':');
          const headerName = arg.slice(0, colonIndex).trim();
          const headerValue = arg.slice(colonIndex + 1).trim();
          headers[headerName] = headerValue;
        }
      }

      // 3. Create client with options (including retry, timeout from presets if any)
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

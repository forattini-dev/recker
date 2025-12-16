import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';
import { parseEnhancerPresets } from '../helpers.js';

export function registerHlsCommand(program: Command) {
  const hlsCmd = program.command('hls').description('HLS streaming operations');

  hlsCmd
    .command('info')
    .description('Get information about an HLS stream')
    .argument('<url>', 'HLS playlist URL')
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
    .description('Download an HLS stream')
    .argument('<url>', 'HLS playlist URL')
    .argument('[args...]', 'Output, options, and headers')
    .option('-v, --verbose', 'Show detailed error information')
    .option('-l, --live', 'Enable live stream mode') // <-- Adicionado aqui
    .addHelpText('after', `
${colors.bold(colors.yellow('Options:'))}
  ${colors.cyan('[output]')}             Output file path (default: output.ts)
  ${colors.cyan('quality=<quality>')}    Quality: highest, lowest, or resolution (e.g., 720p)
  ${colors.cyan('live')}                 Enable live stream mode
  ${colors.cyan('duration=<seconds>')}   Duration for live recording in seconds
  ${colors.cyan('concurrency=<n>')}      Concurrent segment downloads (default: 4)
  ${colors.cyan('Header:Value')}         Add custom HTTP header (e.g., Referer:https://example.com)

${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek hls download https://example.com/stream.m3u8')}                     ${colors.gray('Download stream')}
  ${colors.green('$ rek hls download https://example.com/stream.m3u8 video.ts')}            ${colors.gray('Custom output')}
  ${colors.green('$ rek hls download https://example.com/stream.m3u8 quality=720p')}        ${colors.gray('Select quality')}
  ${colors.green('$ rek hls download https://example.com/live.m3u8 live duration=60')}      ${colors.gray('Record live stream')}
  ${colors.green('$ rek hls download https://example.com/stream.m3u8 Referer:https://site.com User-Agent:"My Browser"')} ${colors.gray('With custom headers')}
`)
    .action(async (...args: any[]) => {
      // Commander passes (arg1, arg2, ..., options, command)
      // Since we have <url> and [args...] (variadic), we expect:
      // args[0] = url
      // args[1] = rawArgs (array)
      // args[2] = cmdObj (Command)
      
      const url = args[0];
      const rawArgs = args[1] || [];
      const cmdObj = args[args.length - 1]; // Command object is always last
      
      const options = cmdObj.opts ? cmdObj.opts() : {};
      const verbose = options.verbose;

      const { hls } = await import('../../plugins/hls.js');
      const { Client } = await import('../../core/client.js');

      // 1. Process Presets (+chaturbate, +chrome, etc.)
      const { clientOptions, remainingArgs } = await parseEnhancerPresets([]); // <--- Sem rawArgs aqui, usamos os globais



      let output = 'stream.ts';
      let quality: string | undefined;
      let live = options.live; // 'live' deve ser uma opção Commander
      let duration: number | undefined;
      let concurrency = 4;
      const headers: Record<string, string> = { ...(clientOptions.headers as Record<string, string>) };
      let outputHandled = false;

      // remainingArgs agora contém os argumentos do Commander (URL, --verbose)
      // O primeiro argumento deve ser a URL (que já vem separada)
      // O segundo argumento, se existir, é o nome do arquivo de saída
      // Flags como --verbose já foram consumidas por options

      // 2. Process remaining args (que deveriam ser SÓ o output file)
      for (const arg of remainingArgs) {
        if (arg.startsWith('--')) {
            // Ignorar flags Commander, já estão em options
            continue;
        } else if (arg.includes('=')) {
          const [key, value] = arg.split('=');
          if (key === 'quality') quality = value;
          else if (key === 'duration') duration = parseInt(value, 10);
          else if (key === 'concurrency') concurrency = parseInt(value, 10);
        } else if (arg.includes(':') && !arg.startsWith('http')) {
          const [key, ...valueParts] = arg.split(':');
          headers[key.trim()] = valueParts.join(':').trim();
        } else if (!outputHandled) { 
          output = arg;
          outputHandled = true;
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

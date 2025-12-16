import colors from '../../../utils/colors.js';
import { Client } from '../../../core/client.js';
import { ShellContext } from './context.js';

export async function runHls(ctx: ShellContext, args: string[]) {
  if (args.length === 0 || args[0] === 'help') {
    console.log(colors.bold('HLS Streaming Client'));
    console.log('');
    console.log(colors.yellow('Usage: hls <url> [command] [options...] [Header:Value...]'));
    console.log('');
    console.log(colors.gray('Commands:'));
    console.log('  info           Show stream information (default)');
    console.log('  download       Download the stream to a file');
    console.log('');
    console.log(colors.gray('Options:'));
    console.log('  output=<file>      Output file for download (default: stream.ts)');
    console.log('  quality=<level>    Quality selection: highest, lowest (default: highest)');
    console.log('  live               Enable live stream mode');
    console.log('  duration=<seconds> Duration for live recording in seconds');
    console.log('  concurrency=<n>    Concurrent segment downloads (default: 4)');
    console.log('');
    console.log(colors.gray('Headers (add anywhere after URL/command):'));
    console.log('  Referer:https://example.com  - Set a custom Referer header');
    console.log('  User-Agent:Mozilla/5.0       - Set a custom User-Agent header');
    console.log('');
    console.log(colors.gray('Examples:'));
    console.log('  hls https://example.com/stream.m3u8');
    console.log('  hls https://example.com/live.m3u8 info');
    console.log('  hls https://example.com/vod.m3u8 download output=video.ts');
    console.log('  hls https://example.com/stream.m3u8 download quality=lowest');
    console.log('  hls https://edge8-mia.live.mmcdn.com/live-hls/... download Referer:https://site.com User-Agent:"My Browser"');
    return;
  }

  let url = args[0];
  let command = 'info';
  let output = 'stream.ts';
  let quality: string | undefined;
  let live = false;
  let duration: number | undefined;
  let concurrency = 4;
  const headers: Record<string, string> = {};
  let outputHandled = false;

  // Parse remaining args
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.includes('=')) {
      const [key, value] = arg.split('=');
      if (key === 'quality') quality = value;
      else if (key === 'duration') duration = parseInt(value, 10);
      else if (key === 'concurrency') concurrency = parseInt(value, 10);
      else if (key === 'output') { // Allow output=file.ts as well
        output = value;
        outputHandled = true;
      }
    } else if (arg.includes(':')) {
      const [key, ...valueParts] = arg.split(':');
      headers[key.trim()] = valueParts.join(':').trim();
    } else if (arg === 'live') {
      live = true;
    } else if (['info', 'download'].includes(arg)) {
      command = arg;
    } else if (!outputHandled && command === 'download') { // If it's a download command and output not handled yet
      output = arg;
      outputHandled = true;
    }
  }

  // Build full URL if needed
  if (!url.startsWith('http')) {
    if (ctx.baseUrl) {
      url = `${ctx.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    } else {
      url = `https://${url}`;
    }
  }

  console.log(colors.gray(`Fetching playlist: ${url}`));
  if (Object.keys(headers).length > 0) {
    console.log(colors.gray('With custom headers:'));
    for (const [key, value] of Object.entries(headers)) {
      console.log(`  ${colors.gray(`${key}: ${value}`)}`);
    }
  }

  try {
    const { hls } = await import('../../../plugins/hls.js');

    const hlsOptions: any = {
      quality: quality as 'highest' | 'lowest' || 'highest',
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      live: live ? (duration ? { duration: duration * 1000 } : true) : undefined,
      concurrency: concurrency,
    };

    const hlsClient = hls(ctx.client, url, hlsOptions);

    if (command === 'info') {
      const info = await hlsClient.info();

      console.log(colors.green('\n✔ HLS Stream Info'));
      console.log('');

      if (info.master) {
        console.log(colors.bold('  Master Playlist:'));
        console.log(`    ${colors.cyan('Variants')}: ${info.master.variants.length}`);
        console.log('');
        info.master.variants.forEach((v, i) => {
          const bandwidth = v.bandwidth ? `${Math.round(v.bandwidth / 1000)}kbps` : 'unknown';
          const resolution = v.resolution || 'unknown';
          const selected = info.selectedVariant?.url === v.url ? colors.green(' ★ selected') : '';
          console.log(`    ${colors.gray(`${i + 1}.`)} ${bandwidth} @ ${resolution}${selected}`);
          if (v.codecs) {
            console.log(`       ${colors.gray('Codecs:')} ${v.codecs}`);
          }
        });
        console.log('');
      }

      if (info.playlist) {
        console.log(colors.bold('  Media Playlist:'));
        console.log(`    ${colors.cyan('Segments')}: ${info.playlist.segments.length}`);
        console.log(`    ${colors.cyan('Target Duration')}: ${info.playlist.targetDuration}s`);
        console.log(`    ${colors.cyan('Type')}: ${info.isLive ? colors.yellow('LIVE') : colors.green('VOD')}`);

        if (info.totalDuration) {
          const minutes = Math.floor(info.totalDuration / 60);
          const seconds = Math.round(info.totalDuration % 60);
          console.log(`    ${colors.cyan('Total Duration')}: ${minutes}m ${seconds}s`);
        }

        if (info.playlist.segments.length > 0) {
          const firstSeg = info.playlist.segments[0];
          const lastSeg = info.playlist.segments[info.playlist.segments.length - 1];
          console.log(`    ${colors.cyan('Sequence Range')}: ${firstSeg.sequence} - ${lastSeg.sequence}`);
        }
      }

      ctx.lastResponse = info;
    } else if (command === 'download') {
      const outputFile = output;

      console.log(colors.gray(`Downloading to ${outputFile}...`));
      console.log('');

      let lastProgress = 0;
      const startTime = Date.now();

      await hls(ctx.client, url, {
        quality: quality as 'highest' | 'lowest' || 'highest',
        onProgress: (progress) => {
          const now = Date.now();
          if (now - lastProgress > 500) {
            lastProgress = now;
            const kb = Math.round(progress.downloadedBytes / 1024);
            const total = progress.totalSegments ? ` / ${progress.totalSegments}` : '';
            process.stdout.write(`\r  ${colors.cyan('Segments')}: ${progress.downloadedSegments}${total} | ${colors.cyan('Downloaded')}: ${kb}kb   `);
          }
        },
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        live: live ? (duration ? { duration: duration * 1000 } : true) : undefined,
        concurrency: concurrency,
      }).download(outputFile);

      const durationMillis = Math.round((Date.now() - startTime));
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      console.log(colors.green(`✔ Downloaded to ${outputFile}`) + colors.gray(` (${durationMillis / 1000}s)`));

      ctx.lastResponse = { file: outputFile, duration: durationMillis / 1000 };
    }
  } catch (error: any) {
    console.error(colors.red(`HLS Error: ${error.message}`));
  }
  console.log('');
}

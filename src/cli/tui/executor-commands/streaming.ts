/**
 * Streaming Commands
 *
 * Commands for media streaming:
 * - hls: HLS streaming client
 * - live: Live stream recording
 */

import type { CommandContext, CommandResult } from './types.js';

// =============================================================================
// HLS Command
// =============================================================================

export async function cmdHls(ctx: CommandContext, args: string[]): Promise<CommandResult> {
  if (args.length === 0) {
    ctx.addHistoryItem({
      type: 'info',
      content: `HLS Streaming Client

Usage: hls <url> [command] [options]

Commands:
  info             Show stream info (default)
  download         Download stream to file

Options:
  output=<file>    Output file (default: stream.ts)
  quality=highest  Quality: highest, lowest
  live             Enable live stream mode
  duration=<sec>   Duration for live recording

Examples:
  hls https://example.com/stream.m3u8
  hls https://example.com/vod.m3u8 download output=video.ts
  hls https://example.com/live.m3u8 download live duration=60`,
    });
    return { success: true };
  }

  let url = args[0];
  if (!url.startsWith('http')) {
    const base = ctx.baseUrl();
    url = base ? `${base}${url.startsWith('/') ? '' : '/'}${url}` : `https://${url}`;
  }

  const command = args.find(a => ['info', 'download'].includes(a)) || 'info';
  const outputMatch = args.find(a => a.startsWith('output='));
  const output = outputMatch ? outputMatch.split('=')[1] : 'stream.ts';
  const qualityMatch = args.find(a => a.startsWith('quality='));
  const quality = qualityMatch ? qualityMatch.split('=')[1] : 'highest';
  const live = args.includes('live');

  ctx.setIsLoading(true);
  ctx.addHistoryItem({ type: 'info', content: `Fetching HLS playlist: ${url}` });

  try {
    const { hls } = await import('../../../plugins/hls.js');
    const hlsClient = hls(ctx.client, url, { quality: quality as any, live: live || undefined });

    if (command === 'info') {
      const info = await hlsClient.info();
      ctx.addHistoryItem({
        type: 'response',
        content: {
          type: info.isLive ? '🔴 LIVE' : '📼 VOD',
          variants: info.master?.variants.length || 0,
          segments: info.playlist?.segments.length || 0,
          duration: info.totalDuration ? `${Math.floor(info.totalDuration / 60)}m ${Math.round(info.totalDuration % 60)}s` : 'N/A',
          targetDuration: info.playlist?.targetDuration ? `${info.playlist.targetDuration}s` : 'N/A',
        },
      });
      ctx.setLastResponse(info);
      return { success: true, data: info };
    } else {
      ctx.addHistoryItem({ type: 'info', content: `Downloading to ${output}...` });
      await hlsClient.download(output);
      ctx.addHistoryItem({ type: 'response', content: { status: '✓ Downloaded', file: output } });
      return { success: true };
    }
  } catch (err: any) {
    ctx.addHistoryItem({ type: 'error', content: `HLS error: ${err.message}` });
    return { success: false, error: err.message };
  } finally {
    ctx.setIsLoading(false);
  }
}

// =============================================================================
// Live Command
// =============================================================================

export async function cmdLive(ctx: CommandContext, args: string[]): Promise<CommandResult> {
  if (args.length === 0) {
    ctx.addHistoryItem({
      type: 'info',
      content: `Live Stream Recording

Commands:
  live download <url>   Record live stream
  live watch <url>      Monitor and auto-record when live
  live info <url>       Check if stream is live

Options:
  -O <dir>             Output directory
  -Q <quality>         Quality: highest, 720p, etc.
  -d <seconds>         Max recording duration

Examples:
  live download https://stream.example.com/live.m3u8
  live info @twitch/username
  live watch @kick/streamer --poll=30-60

Note: Use 'rek shell:legacy' for full live recording features.`,
    });
    return { success: true };
  }

  const subCmd = args[0].toLowerCase();
  const url = args[1];

  if (!url) {
    ctx.addHistoryItem({ type: 'error', content: 'Usage: live <command> <url>' });
    return { success: false };
  }

  ctx.addHistoryItem({
    type: 'info',
    content: `Live ${subCmd}: ${url}\n\nNote: For full live recording with job management, use 'rek shell:legacy'`,
  });

  // Delegate to HLS for basic functionality
  if (subCmd === 'info' || subCmd === 'download') {
    return await cmdHls(ctx, [url, subCmd, 'live']);
  }

  return { success: true };
}

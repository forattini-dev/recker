/**
 * Video CLI Command
 *
 * Provides video extraction and download capabilities from various sites.
 * Delegates to unified handlers via the adapter.
 */

import { RekCommand as Command } from '../router.js';
import { createCliAction, createCliActionWithOptions } from '../cli-adapter.js';
import {
  videoInfoHandler,
  videoDownloadHandler,
  videoSitesHandler,
  videoCheckHandler,
  videoShortcutsHandler,
} from '../handlers/video.js';

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
    .action(createCliActionWithOptions(videoInfoHandler, {
      positional: ['url'],
      options: ['sub', 'sub-format', 'sub-auto', 'output'],
      optionMapping: { 'sub-format': 'subFormat', 'sub-auto': 'subAuto' }
    }));

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
    .action(createCliActionWithOptions(videoInfoHandler, {
      positional: ['url'],
      options: ['sub', 'sub-format', 'sub-auto', 'output'],
      optionMapping: { 'sub-format': 'subFormat', 'sub-auto': 'subAuto' }
    }));

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
    .action(createCliActionWithOptions(videoDownloadHandler, {
      positional: ['url'],
      options: ['output', 'quality', 'live', 'duration', 'concurrency', 'verbose']
    }));

  // ============================================
  // video sites
  // ============================================
  videoCmd
    .command('sites')
    .description('List supported video sites')
    .action(createCliAction(videoSitesHandler, { positional: [] }));

  // ============================================
  // video check
  // ============================================
  videoCmd
    .command('check')
    .description('Check if a URL is supported')
    .argument('<url>', 'Video URL or shortcut to check')
    .action(createCliAction(videoCheckHandler, { positional: ['url'] }));

  // ============================================
  // video shortcuts
  // ============================================
  videoCmd
    .command('shortcuts')
    .description('List available URL shortcuts')
    .action(createCliAction(videoShortcutsHandler, { positional: [] }));
}

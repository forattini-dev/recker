/**
 * Video Commands (Unified)
 *
 * Video extraction and download tools migrated to the unified command system.
 * These handlers work in both CLI and TUI modes.
 */

import type { RekCommandDefinition, RekHandler } from '../handler-types.js'
import {
  withHandler,
  getString,
  getNumber,
  getBoolean,
  colors,
} from '../output.js'

// =============================================================================
// Video Info Handler
// =============================================================================

export const videoInfoHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    const rawUrl = getString(ctx.result.positional.url)
    const jsonOutput = getBoolean(ctx.result.options.json)
    const subLang = getString(ctx.result.options.sub)
    const subFormat = getString(ctx.result.options.subFormat, 'vtt')
    const subAuto = getBoolean(ctx.result.options.subAuto)

    if (!rawUrl) {
      out.error('URL is required')
      return
    }

    const { expandShortcut } = await import('../utils/shortcut-expander.js')
    const { Client } = await import('../../core/client.js')
    const { extract } = await import('../../extractors/index.js')

    const url = expandShortcut(rawUrl)
    const wasShortcut = url !== rawUrl
    const client = extCtx?.client || new Client()

    if (!jsonOutput && !extCtx) {
      if (wasShortcut) {
        out.log(colors.gray(`Shortcut: ${rawUrl} → ${url}`))
      }
      out.log(colors.gray(`Extracting video info from ${url}...`))
      out.blank()
    }

    const info = await extract(url, client)

    if (extCtx) {
      out.response({
        id: info.id,
        title: info.title,
        uploader: info.uploader,
        duration: info.duration,
        viewCount: info.viewCount,
        isLive: info.isLive,
        thumbnail: info.thumbnail,
        formatsCount: info.formats?.length || 0,
        subtitlesCount: info.subtitles ? Object.keys(info.subtitles).length : 0,
      }, { responseType: 'video-info' })
      return
    }

    if (jsonOutput) {
      out.json(info)
      return
    }

    out.title('Video Info')
    out.blank()
    out.keyValue({
      ID: info.id,
      Title: info.title,
      ...(info.uploader && { Uploader: info.uploader }),
      ...(info.duration && { Duration: `${Math.floor(info.duration / 60)}m ${info.duration % 60}s` }),
      ...(info.viewCount && { Views: info.viewCount.toLocaleString() }),
      ...(info.isLive && { Status: colors.green('LIVE') }),
      ...(info.thumbnail && { Thumbnail: info.thumbnail }),
    })

    if (info.formats && info.formats.length > 0) {
      out.section('Available Formats')
      out.numberedList(info.formats.map(fmt => {
        const quality = fmt.height ? `${fmt.height}p` : fmt.formatId
        const protocol = fmt.protocol || fmt.ext || 'http'
        return `${quality} (${protocol})${fmt.bandwidth ? ` - ${Math.round(fmt.bandwidth / 1000)}kbps` : ''}`
      }))
    }

    // Show subtitles if available
    const hasSubtitles = info.subtitles && Object.keys(info.subtitles).length > 0
    const hasAutoCaptions = info.automaticCaptions && Object.keys(info.automaticCaptions).length > 0

    if (hasSubtitles || hasAutoCaptions) {
      if (hasSubtitles) {
        out.section('Subtitles')
        for (const [langCode, tracks] of Object.entries(info.subtitles!)) {
          const name = tracks[0]?.name || langCode
          const formats = [...new Set(tracks.map(t => t.ext))].join(', ')
          out.log(`  ${colors.green(langCode.padEnd(8))} ${colors.gray(name)} (${formats})`)
        }
      }

      if (hasAutoCaptions) {
        out.section('Auto-Generated Captions')
        for (const [langCode, tracks] of Object.entries(info.automaticCaptions!)) {
          const name = tracks[0]?.name || langCode
          const formats = [...new Set(tracks.map(t => t.ext))].join(', ')
          out.log(`  ${colors.green(langCode.padEnd(8))} ${colors.gray(name)} (${formats})`)
        }
      }

      // Download subtitle if --sub is provided
      if (subLang) {
        const allSubtitles: Record<string, Array<{ ext: string; url: string; name?: string }>> = { ...info.subtitles }
        if (subAuto && info.automaticCaptions) {
          for (const [langCode, tracks] of Object.entries(info.automaticCaptions)) {
            if (!allSubtitles[langCode]) {
              allSubtitles[langCode] = []
            }
            allSubtitles[langCode].push(...tracks)
          }
        }

        const tracks = allSubtitles[subLang]
        if (!tracks || tracks.length === 0) {
          out.blank()
          out.error(`No subtitles found for language: ${subLang}`)
          out.log(colors.gray('Available: ' + Object.keys(allSubtitles).join(', ')))
          return
        }

        const track = tracks.find(t => t.ext === subFormat) || tracks[0]

        out.blank()
        out.log(colors.gray(`Downloading ${subLang} subtitles (${track.ext})...`))

        const response = await client.get(track.url)
        const content = await response.text()

        const { writeFile } = await import('fs/promises')
        const outputFile = getString(ctx.result.options.output) || `${info.id}.${subLang}.${track.ext}`
        await writeFile(outputFile, content, 'utf-8')

        out.success(`Subtitles saved to: ${outputFile}`)
      } else {
        out.blank()
        out.info(`To download: rek video ${rawUrl} --sub <lang>`)
      }
    }

    out.blank()
  }
)

// =============================================================================
// Video Sites Handler
// =============================================================================

export const videoSitesHandler: RekHandler = withHandler(
  { loading: false },
  async (ctx, out, extCtx) => {
    const jsonOutput = getBoolean(ctx.result.options.json)

    const { listExtractors } = await import('../../extractors/index.js')
    const extractors = listExtractors()

    if (extCtx) {
      out.response({ sites: extractors, count: extractors.length }, { responseType: 'video-sites' })
      return
    }

    if (jsonOutput) {
      out.json({ sites: extractors })
      return
    }

    out.title('Supported Video Sites')
    out.blank()
    out.list(extractors.map(name =>
      name === 'generic'
        ? `${name.padEnd(20)} ${colors.gray('Auto-detect m3u8/mp4 on any site')}`
        : name
    ))
    out.blank()
    out.info('The generic extractor works on most sites with embedded videos.')
    out.blank()
  }
)

// =============================================================================
// Video Check Handler
// =============================================================================

export const videoCheckHandler: RekHandler = withHandler(
  { loading: false },
  async (ctx, out, extCtx) => {
    const rawUrl = getString(ctx.result.positional.url)
    const jsonOutput = getBoolean(ctx.result.options.json)

    if (!rawUrl) {
      out.error('URL is required')
      return
    }

    const { expandShortcut } = await import('../utils/shortcut-expander.js')
    const { getExtractorName, isSupported } = await import('../../extractors/index.js')

    const url = expandShortcut(rawUrl)
    const wasShortcut = url !== rawUrl
    const extractor = await getExtractorName(url)
    const supported = await isSupported(url)

    if (extCtx) {
      out.response({ url, originalUrl: rawUrl, wasShortcut, supported, extractor }, { responseType: 'video-check' })
      return
    }

    if (jsonOutput) {
      out.json({ url, supported, extractor })
      return
    }

    if (wasShortcut) {
      out.log(colors.gray(`Shortcut: ${rawUrl} → ${url}`))
    }

    if (supported) {
      out.status('success', 'URL is supported')
      out.keyValue({ Extractor: extractor })
    } else {
      out.status('warning', 'No specific extractor, will try generic')
      out.info('The generic extractor may still be able to find videos.')
    }
  }
)

// =============================================================================
// Video Shortcuts Handler
// =============================================================================

export const videoShortcutsHandler: RekHandler = withHandler(
  { loading: false },
  async (ctx, out, extCtx) => {
    const jsonOutput = getBoolean(ctx.result.options.json)

    const { listShortcuts } = await import('../utils/shortcut-expander.js')
    const shortcuts = listShortcuts()

    if (extCtx) {
      out.response({
        shortcuts: shortcuts.map(s => ({ site: s.site, examples: s.examples })),
        count: shortcuts.length,
      }, { responseType: 'video-shortcuts' })
      return
    }

    if (jsonOutput) {
      out.json({ shortcuts })
      return
    }

    out.title('Available Shortcuts')
    out.blank()
    out.info('Use shortcuts instead of full URLs:')
    out.blank()
    for (const { site, examples } of shortcuts) {
      out.log(`  ${colors.green(site.padEnd(14))} ${colors.gray(examples[0])}`)
    }
    out.blank()
    out.subtitle('Examples:')
    out.list([
      'rek video @youtube/dQw4w9WgXcQ',
      'rek video youtube/dQw4w9WgXcQ',
      'rek video download @twitch/shroud',
      'rek live @chaturbate/room',
    ])
    out.blank()
  }
)

// =============================================================================
// Video Download Handler
// =============================================================================

export const videoDownloadHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    const rawUrl = getString(ctx.result.positional.url)
    const output = getString(ctx.result.options.output, 'video.ts')
    const quality = getString(ctx.result.options.quality)
    const live = getBoolean(ctx.result.options.live)
    const duration = getNumber(ctx.result.options.duration, 0)
    const concurrency = getNumber(ctx.result.options.concurrency, 4)
    const verbose = getBoolean(ctx.result.options.verbose)

    if (!rawUrl) {
      out.error('URL is required')
      return
    }

    const { expandShortcut } = await import('../utils/shortcut-expander.js')
    const { Client } = await import('../../core/client.js')
    const { createVideoBuilder } = await import('../../video/builder.js')

    const url = expandShortcut(rawUrl)
    const wasShortcut = url !== rawUrl

    // Build client options from context headers
    const headers = (ctx.result.headers || {}) as Record<string, string>
    const client = extCtx?.client || new Client({ headers })

    if (wasShortcut && !extCtx) {
      out.log(colors.gray(`Shortcut: ${rawUrl} → ${url}`))
    }
    if (!extCtx) {
      out.log(colors.gray(`Extracting video from ${url}...`))
    }

    const videoBuilder = createVideoBuilder(url, client)

    // Set quality
    if (quality) {
      if (quality === 'highest' || quality === 'lowest' || quality === 'best' || quality === 'worst') {
        videoBuilder.quality(quality)
      } else if (quality.endsWith('p')) {
        videoBuilder.quality(quality as `${number}p`)
      }
    }

    // Set live options
    if (live) {
      videoBuilder.live({
        duration: duration ? duration * 1000 : undefined,
      })
    }

    // Set concurrency
    videoBuilder.options({ concurrency })

    // Get info first
    const info = await videoBuilder.info()

    if (extCtx) {
      // For TUI, we track the download state
      out.response({
        status: 'downloading',
        title: info.title,
        output,
        quality,
        live,
      }, { responseType: 'video-download-start' })
    } else {
      out.keyValue({
        Title: info.title,
        Output: output,
      })

      if (verbose && Object.keys(headers).length > 0) {
        out.log(colors.gray('With headers:'))
        for (const [key, value] of Object.entries(headers)) {
          out.log(`  ${colors.gray(`${key}: ${String(value).slice(0, 50)}${String(value).length > 50 ? '...' : ''}`)}`)
        }
      }
      out.blank()
    }

    // Set up progress (CLI only)
    if (!extCtx) {
      videoBuilder.onProgress((progress) => {
        const segs = progress.totalSegments
          ? `${progress.downloadedSegments}/${progress.totalSegments}`
          : `${progress.downloadedSegments}`
        const mb = (progress.downloadedBytes / 1024 / 1024).toFixed(2)
        const percent = progress.percent ? ` (${progress.percent.toFixed(1)}%)` : ''
        process.stdout.write(
          `\r  ${colors.cyan(segs)} segments | ${colors.cyan(mb + ' MB')} downloaded${percent}`
        )
      })
    }

    // Download
    await videoBuilder.download(output)

    if (extCtx) {
      out.response({
        status: 'completed',
        title: info.title,
        output,
      }, { responseType: 'video-download-complete' })
    } else {
      out.log('')
      out.success(`Download complete: ${output}`)
    }
  }
)

// =============================================================================
// Command Definition
// =============================================================================

export const videoCommands: RekCommandDefinition = {
  description: 'Video extraction and download tools',
  category: 'video',
  tuiEnabled: true,
  commands: {
    'video': {
      description: 'Get video info (default action)',
      aliases: ['vid'],
      positional: [
        { name: 'url', required: true, description: 'Video URL or shortcut' }
      ],
      options: {
        sub: { short: 's', type: 'string', description: 'Download subtitle for language code' },
        subFormat: { type: 'string', default: 'vtt', description: 'Subtitle format (vtt, srv3, ttml, json3)' },
        subAuto: { type: 'boolean', description: 'Include auto-generated captions' },
        output: { short: 'o', type: 'string', description: 'Output file path' },
        json: { short: 'j', type: 'boolean', description: 'Output as JSON' },
      },
      examples: [
        { cmd: 'rek video @youtube/dQw4w9WgXcQ', desc: 'Get video info' },
        { cmd: 'rek video @youtube/xxx --sub=en', desc: 'Download English subtitles' },
      ],
      handler: videoInfoHandler
    },
    'video info': {
      description: 'Get detailed video information',
      positional: [
        { name: 'url', required: true, description: 'Video URL or shortcut' }
      ],
      options: {
        sub: { short: 's', type: 'string', description: 'Download subtitle for language code' },
        subFormat: { type: 'string', default: 'vtt', description: 'Subtitle format' },
        subAuto: { type: 'boolean', description: 'Include auto-generated captions' },
        output: { short: 'o', type: 'string', description: 'Output file path' },
        json: { short: 'j', type: 'boolean', description: 'Output as JSON' },
      },
      handler: videoInfoHandler
    },
    'video download': {
      description: 'Download video or record live stream',
      positional: [
        { name: 'url', required: true, description: 'Video URL or shortcut' }
      ],
      options: {
        output: { short: 'o', type: 'string', default: 'video.ts', description: 'Output file path' },
        quality: { short: 'Q', type: 'string', description: 'Quality (720p, 1080p, highest, lowest)' },
        live: { short: 'l', type: 'boolean', description: 'Enable live stream recording' },
        duration: { short: 'd', type: 'number', description: 'Recording duration in seconds' },
        concurrency: { short: 'c', type: 'number', default: 4, description: 'Concurrent downloads' },
        verbose: { short: 'v', type: 'boolean', description: 'Show detailed progress' },
      },
      examples: [
        { cmd: 'rek video download @youtube/xxx -o video.mp4', desc: 'Download video' },
        { cmd: 'rek video download @twitch/xxx --live -d 3600', desc: 'Record live for 1 hour' },
      ],
      handler: videoDownloadHandler
    },
    'video sites': {
      description: 'List supported video sites',
      positional: [],
      options: {
        json: { short: 'j', type: 'boolean', description: 'Output as JSON' },
      },
      handler: videoSitesHandler
    },
    'video check': {
      description: 'Check if URL is supported',
      positional: [
        { name: 'url', required: true, description: 'Video URL to check' }
      ],
      options: {
        json: { short: 'j', type: 'boolean', description: 'Output as JSON' },
      },
      handler: videoCheckHandler
    },
    'video shortcuts': {
      description: 'List available URL shortcuts',
      positional: [],
      options: {
        json: { short: 'j', type: 'boolean', description: 'Output as JSON' },
      },
      handler: videoShortcutsHandler
    }
  }
}

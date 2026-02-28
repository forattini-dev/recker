/**
 * Streaming Commands (Unified)
 *
 * Media streaming tools migrated to the unified command system.
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
import { ValidationError } from '../../core/errors.js'

// =============================================================================
// HLS Handler
// =============================================================================

export const hlsInfoHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = getString(ctx.result.positional.url)

    if (!url) {
      out.error('URL is required')
      return
    }

    if (!url.startsWith('http')) {
      const base = extCtx?.baseUrl?.()
      url = base ? `${base}${url.startsWith('/') ? '' : '/'}${url}` : `https://${url}`
    }

    const quality = getString(ctx.result.options.quality, 'highest')
    const live = getBoolean(ctx.result.options.live)

    out.log(colors.gray(`Fetching HLS playlist: ${url}`))

    const { hls } = await import('../../plugins/hls.js')
    const { createClient } = await import('../../core/client.js')
    const client = extCtx?.client || createClient()

    const hlsClient = hls(client, url, { quality: quality as 'highest' | 'lowest', live: live || undefined })
    const info = await hlsClient.info()

    if (extCtx) {
      out.response({
        type: info.isLive ? '🔴 LIVE' : '📼 VOD',
        variants: info.master?.variants.length || 0,
        segments: info.playlist?.segments.length || 0,
        duration: info.totalDuration ? `${Math.floor(info.totalDuration / 60)}m ${Math.round(info.totalDuration % 60)}s` : 'N/A',
        targetDuration: info.playlist?.targetDuration ? `${info.playlist.targetDuration}s` : 'N/A',
      }, { responseType: 'hls' })
    } else {
      out.title('HLS Stream Information', '📺')
      out.keyValue({
        Type: info.isLive ? colors.red('🔴 LIVE') : colors.blue('📼 VOD'),
        Variants: info.master?.variants.length || 0,
        Segments: info.playlist?.segments.length || 0,
        ...(info.totalDuration && { Duration: `${Math.floor(info.totalDuration / 60)}m ${Math.round(info.totalDuration % 60)}s` }),
        ...(info.playlist?.targetDuration && { 'Target Duration': `${info.playlist.targetDuration}s` }),
      })
      out.blank()
    }
  }
)

export const hlsDownloadHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = getString(ctx.result.positional.url)

    if (!url) {
      out.error('URL is required')
      return
    }

    if (!url.startsWith('http')) {
      const base = extCtx?.baseUrl?.()
      url = base ? `${base}${url.startsWith('/') ? '' : '/'}${url}` : `https://${url}`
    }

    const output = getString(ctx.result.options.output, 'stream.ts')
    const quality = getString(ctx.result.options.quality, 'highest')
    const live = getBoolean(ctx.result.options.live)

    out.log(colors.gray(`Downloading HLS stream to ${output}...`))

    const { hls } = await import('../../plugins/hls.js')
    const { createClient } = await import('../../core/client.js')
    const client = extCtx?.client || createClient()

    const hlsClient = hls(client, url, { quality: quality as 'highest' | 'lowest', live: live || undefined })
    await hlsClient.download(output)

    if (extCtx) {
      out.response({ status: '✓ Downloaded', file: output }, { responseType: 'hls' })
    } else {
      out.success(`Downloaded to ${output}`)
    }
  }
)

// =============================================================================
// SSE Handler
// =============================================================================

export const sseHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    let url = getString(ctx.result.positional.url)

    if (!url) {
      out.error('URL is required')
      return
    }

    if (!url.startsWith('http')) {
      url = `https://${url}`
    }

    const duration = getNumber(ctx.result.options.duration, 30) * 1000

    out.log(colors.gray(`Connecting to SSE: ${url} (${duration / 1000}s timeout)`))

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), duration)

    const response = await fetch(url, {
      headers: { 'Accept': 'text/event-stream' },
      signal: controller.signal,
    })

    const reader = response.body?.getReader()
    if (!reader) {
      throw new ValidationError('SSE response must include a readable body', {
        field: 'response.body',
        value: url,
      })
    }

    const decoder = new TextDecoder()
    const events: unknown[] = []
    const startTime = Date.now()

    try {
      while (Date.now() - startTime < duration) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split('\n')

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const data = line.slice(5).trim()
            try {
              events.push(JSON.parse(data))
            } catch {
              events.push(data)
            }
          }
        }
      }
    } finally {
      clearTimeout(timeoutId)
      reader.cancel()
    }

    if (extCtx) {
      out.response({ eventsReceived: events.length, events: events.slice(-10) }, { responseType: 'sse' })
    } else {
      out.title('SSE Events', '📡')
      out.keyValue({ 'Events Received': events.length })
      if (events.length > 0) {
        out.section('Last Events')
        for (const event of events.slice(-5)) {
          out.status('success', typeof event === 'object' ? JSON.stringify(event) : String(event))
        }
      }
      out.blank()
    }
  }
)

// =============================================================================
// Live Handler (delegates to HLS)
// =============================================================================

export const liveInfoHandler: RekHandler = async (ctx) => {
  // Delegate to HLS info with live flag
  ctx.result.options.live = true
  await hlsInfoHandler(ctx)
}

export const liveDownloadHandler: RekHandler = async (ctx) => {
  // Delegate to HLS download with live flag
  ctx.result.options.live = true
  await hlsDownloadHandler(ctx)
}

// =============================================================================
// Command Definitions
// =============================================================================

export const streamingCommands: RekCommandDefinition = {
  description: 'Streaming media tools',
  category: 'streaming',
  tuiEnabled: true,
  commands: {
    hls: {
      description: 'HLS streaming client',
      commands: {
        info: {
          description: 'Show HLS stream information',
          positional: [
            { name: 'url', required: true, description: 'HLS playlist URL (.m3u8)' }
          ],
          options: {
            quality: {
              short: 'q',
              type: 'string',
              default: 'highest',
              description: 'Quality: highest, lowest'
            },
            live: {
              type: 'boolean',
              description: 'Enable live stream mode'
            }
          },
          examples: [
            { cmd: 'rek hls info https://example.com/stream.m3u8', desc: 'Get stream info' }
          ],
          handler: hlsInfoHandler
        },
        download: {
          description: 'Download HLS stream to file',
          positional: [
            { name: 'url', required: true, description: 'HLS playlist URL (.m3u8)' }
          ],
          options: {
            output: {
              short: 'o',
              type: 'string',
              default: 'stream.ts',
              description: 'Output file'
            },
            quality: {
              short: 'q',
              type: 'string',
              default: 'highest',
              description: 'Quality: highest, lowest'
            },
            live: {
              type: 'boolean',
              description: 'Enable live stream mode'
            },
            duration: {
              short: 'd',
              type: 'number',
              description: 'Duration for live recording (seconds)'
            }
          },
          examples: [
            { cmd: 'rek hls download https://example.com/vod.m3u8 -o video.ts', desc: 'Download VOD' },
            { cmd: 'rek hls download https://example.com/live.m3u8 --live -d 60', desc: 'Record live for 60s' }
          ],
          handler: hlsDownloadHandler
        }
      }
    },
    sse: {
      description: 'Server-Sent Events client',
      positional: [
        { name: 'url', required: true, description: 'SSE endpoint URL' }
      ],
      options: {
        duration: {
          short: 'd',
          type: 'number',
          default: 30,
          description: 'Listen duration in seconds'
        }
      },
      examples: [
        { cmd: 'rek sse https://api.example.com/events', desc: 'Listen to SSE stream' },
        { cmd: 'rek sse https://api.example.com/stream -d 60', desc: 'Listen for 60 seconds' }
      ],
      handler: sseHandler
    },
    live: {
      description: 'Live stream recording',
      commands: {
        info: {
          description: 'Check if stream is live',
          positional: [
            { name: 'url', required: true, description: 'Stream URL' }
          ],
          handler: liveInfoHandler
        },
        download: {
          description: 'Record live stream',
          positional: [
            { name: 'url', required: true, description: 'Stream URL' }
          ],
          options: {
            output: {
              short: 'o',
              type: 'string',
              default: 'stream.ts',
              description: 'Output file'
            },
            duration: {
              short: 'd',
              type: 'number',
              description: 'Max recording duration (seconds)'
            }
          },
          handler: liveDownloadHandler
        }
      }
    }
  }
}

/**
 * HAR Commands (Unified)
 *
 * HAR recording and playback tools migrated to the unified command system.
 * These handlers work in both CLI and TUI modes where applicable.
 */

import type { RekCommandDefinition, RekHandler } from '../handler-types.js'
import {
  withHandler,
  createEnhancedOutput,
  getString,
  getNumber,
  getBoolean,
  colors,
} from '../output.js'

// =============================================================================
// HAR Record Handler
// =============================================================================

export const harRecordHandler: RekHandler = async (ctx) => {
  const out = createEnhancedOutput(ctx)

  const file = getString(ctx.result.positional.file)
  let url = getString(ctx.result.positional.url)
  const append = getBoolean(ctx.result.options.append)

  if (!file) {
    out.error('HAR file path is required')
    if (!ctx.isTui) process.exit(1)
    return
  }

  // Interactive mode not supported in TUI
  if (!url && ctx.isTui && ctx.tui) {
    out.response({
      error: 'Interactive HAR recording requires CLI mode',
      hint: `Use: rek har record ${file} <url>`,
    }, { responseType: 'har-error' })
    return
  }

  try {
    const fs = await import('fs/promises')
    const { createClient } = await import('../../core/client.js')
    const { harRecorderPlugin } = await import('../../plugins/har-recorder.js')

    let existingEntries: unknown[] = []
    if (append) {
      try {
        const existing = await fs.readFile(file, 'utf-8')
        const har = JSON.parse(existing)
        existingEntries = har.log?.entries || []
        if (!ctx.isTui) {
          out.log(colors.gray(`Appending to existing HAR with ${existingEntries.length} entries`))
        }
      } catch {
        // File doesn't exist, start fresh
      }
    }

    const client = createClient()
    const plugin = harRecorderPlugin({
      path: file,
      onEntry: (entry: unknown) => {
        if (!ctx.isTui) {
          const req = (entry as { request: { method: string; url: string } }).request
          out.status('success', `Recorded: ${req.method} ${req.url}`)
        }
      }
    })
    plugin(client)

    // Single URL recording mode
    if (url) {
      if (!url.startsWith('http')) url = `https://${url}`

      if (!ctx.isTui) {
        out.log(colors.gray(`Recording request to ${url}...`))
      }

      const response = await client.get(url)

      if (ctx.isTui && ctx.tui) {
        out.response({
          file,
          url,
          status: response.status,
          statusText: response.statusText,
        }, { responseType: 'har-record' })
      } else {
        out.success(`Response: ${response.status} ${response.statusText}`)
        out.log(colors.gray(`Saved to ${file}`))
      }
      return
    }

    // Interactive mode (CLI only)
    out.title('HAR Recording Session', '📼')
    out.keyValue({ 'Recording to': file })
    out.log(colors.gray('Enter URLs to record, or "exit" to quit'))
    out.blank()

    const readline = await import('node:readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const prompt = () => {
      rl.question(colors.cyan('har> '), async (input) => {
        const line = input.trim()
        if (line === 'exit' || line === 'quit') {
          out.blank()
          out.success(`Session ended. HAR saved to ${file}`)
          rl.close()
          return
        }
        if (!line) { prompt(); return }

        let requestUrl = line
        if (!requestUrl.startsWith('http')) requestUrl = `https://${requestUrl}`

        try {
          const response = await client.get(requestUrl)
          out.status('success', `${response.status} ${response.statusText}`)
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          out.error(message)
        }
        prompt()
      })
    }
    prompt()

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    out.error(`HAR Error: ${message}`)
    if (!ctx.isTui) process.exit(1)
  }
}

// =============================================================================
// HAR Play Handler
// =============================================================================

export const harPlayHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    const file = getString(ctx.result.positional.file)
    const delay = getNumber(ctx.result.options.delay, 0)
    const verbose = getBoolean(ctx.result.options.verbose)
    const jsonOutput = getBoolean(ctx.result.options.json)

    if (!file) {
      out.error('HAR file path is required')
      return
    }

    const fs = await import('fs/promises')
    const content = await fs.readFile(file, 'utf-8')
    const har = JSON.parse(content)
    const entries = har.log?.entries || []

    if (entries.length === 0) {
      if (extCtx) {
        out.response({ file, entries: 0, message: 'No entries found' }, { responseType: 'har-play' })
      } else {
        out.warn('No entries found in HAR file')
      }
      return
    }

    if (!extCtx && !jsonOutput) {
      out.title(`Replaying ${entries.length} requests from ${file}`)
      out.blank()
    }

    let success = 0
    let failed = 0
    const results: Array<{ url: string; method: string; expectedStatus: number }> = []

    for (const entry of entries) {
      const req = entry.request
      const expectedRes = entry.response

      if (verbose && !extCtx && !jsonOutput) {
        out.log(colors.gray(`→ ${req.method} ${req.url}`))
        out.log(colors.gray(`  Expected: ${expectedRes.status} ${expectedRes.statusText}`))
      }

      if (!extCtx && !jsonOutput) {
        out.status('success', `${req.method} ${req.url.slice(0, 60)}... → ${colors.cyan(expectedRes.status.toString())}`)
      }

      results.push({
        url: req.url,
        method: req.method,
        expectedStatus: expectedRes.status,
      })
      success++

      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    if (extCtx) {
      out.response({
        file,
        totalEntries: entries.length,
        replayed: success,
        failed,
        results: results.slice(0, 10),
      }, { responseType: 'har-play' })
    } else if (jsonOutput) {
      out.json({ file, replayed: success, failed, results })
    } else {
      out.blank()
      out.success(`Replayed ${success} requests`)
      if (failed > 0) out.error(`${failed} failed`)
    }
  }
)

// =============================================================================
// HAR Info Handler
// =============================================================================

export const harInfoHandler: RekHandler = withHandler(
  { loading: true },
  async (ctx, out, extCtx) => {
    const file = getString(ctx.result.positional.file)
    const jsonOutput = getBoolean(ctx.result.options.json)

    if (!file) {
      out.error('HAR file path is required')
      return
    }

    const fs = await import('fs/promises')
    const content = await fs.readFile(file, 'utf-8')
    const har = JSON.parse(content)

    if (extCtx) {
      out.response({
        file,
        version: har.log.version,
        creator: har.log.creator,
        entries: har.log.entries?.length || 0,
      }, { responseType: 'har-info' })
    } else if (jsonOutput) {
      out.json(har.log)
    } else {
      out.title('HAR File Info')
      out.keyValue({
        Version: har.log.version,
        Creator: `${har.log.creator.name} ${har.log.creator.version}`,
        Entries: har.log.entries?.length || 0,
      })
    }
  }
)

// =============================================================================
// Command Definitions
// =============================================================================

export const harCommands: RekCommandDefinition = {
  description: 'HAR recording and playback',
  category: 'har',
  tuiEnabled: true,
  commands: {
    'har record': {
      description: 'Record HTTP requests to HAR file',
      positional: [
        { name: 'file', required: true, description: 'Output HAR file path' },
        { name: 'url', required: false, description: 'Optional URL to record' }
      ],
      options: {
        append: { short: 'a', type: 'boolean', description: 'Append to existing HAR file' },
      },
      examples: [
        { cmd: 'rek har record session.har', desc: 'Start interactive recording' },
        { cmd: 'rek har record session.har httpbin.org/get', desc: 'Record single request' },
      ],
      handler: harRecordHandler
    },
    'har play': {
      description: 'Replay requests from HAR file',
      positional: [
        { name: 'file', required: true, description: 'HAR file to replay' }
      ],
      options: {
        strict: { short: 's', type: 'boolean', description: 'Fail if request not found' },
        delay: { short: 'd', type: 'number', default: 0, description: 'Delay between requests (ms)' },
        verbose: { short: 'v', type: 'boolean', description: 'Show detailed output' },
        json: { short: 'j', type: 'boolean', description: 'Output as JSON' },
      },
      examples: [
        { cmd: 'rek har play session.har', desc: 'Replay all requests' },
        { cmd: 'rek har play session.har -d 100', desc: 'Replay with 100ms delay' },
      ],
      handler: harPlayHandler
    },
    'har info': {
      description: 'Show HAR file information',
      positional: [
        { name: 'file', required: true, description: 'HAR file to inspect' }
      ],
      options: {
        json: { short: 'j', type: 'boolean', description: 'Output as JSON' },
      },
      examples: [
        { cmd: 'rek har info session.har', desc: 'Show HAR file info' },
      ],
      handler: harInfoHandler
    }
  }
}

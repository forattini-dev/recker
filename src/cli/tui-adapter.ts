/**
 * TUI Adapter
 *
 * Bridges the unified CLI's TuiContext with ShellExecutor's CommandContext.
 * Allows unified handlers to work seamlessly in the TUI shell.
 */

import type { TuiContext } from './handler-types.js'
import type { CommandContext, CommandResult } from './tui/executor-commands/types.js'

/**
 * Output buffer for collecting handler output before converting to history items.
 */
interface OutputBuffer {
  lines: Array<{ type: 'info' | 'error'; content: string }>
  json: any | null
}

/**
 * Create a TuiContext from ShellExecutor's CommandContext.
 *
 * This adapter translates unified handler calls (setOutput, appendOutput, etc.)
 * to the shell's addHistoryItem format.
 *
 * @example
 * ```typescript
 * // In ShellExecutor.routeCommand:
 * const tuiCtx = createTuiContextFromShell(ctx)
 * await unifiedCli.runTui(['dns', 'lookup', 'google.com'], tuiCtx)
 * ```
 */
export function createTuiContextFromShell(ctx: CommandContext): TuiContext {
  const buffer: OutputBuffer = {
    lines: [],
    json: null
  }

  return {
    setOutput: (text: string) => {
      // Clear buffer and set new content
      buffer.lines = [{ type: 'info', content: text }]
      buffer.json = null
      // Flush immediately for setOutput
      flushBuffer(buffer, ctx)
    },

    appendOutput: (text: string) => {
      // Append to buffer
      buffer.lines.push({ type: 'info', content: text.replace(/\n$/, '') })
    },

    setError: (text: string) => {
      ctx.addHistoryItem({ type: 'error', content: text })
    },

    clear: () => {
      buffer.lines = []
      buffer.json = null
    },

    exit: () => {
      // In shell context, exit just means end the command
      flushBuffer(buffer, ctx)
    },

    isRunning: true
  }
}

/**
 * Flush buffered output to shell history.
 */
function flushBuffer(buffer: OutputBuffer, ctx: CommandContext): void {
  if (buffer.json !== null) {
    ctx.addHistoryItem({
      type: 'response',
      content: buffer.json,
      meta: { responseType: 'json' }
    })
    buffer.json = null
  }

  if (buffer.lines.length > 0) {
    // Combine lines into single history item
    const content = buffer.lines.map(l => l.content).join('\n')
    const hasError = buffer.lines.some(l => l.type === 'error')

    ctx.addHistoryItem({
      type: hasError ? 'error' : 'info',
      content
    })
    buffer.lines = []
  }
}

/**
 * Extended TuiContext with shell-specific features.
 *
 * Provides access to shell state (baseUrl, variables, tracking)
 * that some commands need.
 */
export interface ExtendedTuiContext extends TuiContext {
  /** Access to full CommandContext for advanced use */
  shellContext: CommandContext

  /** HTTP client instance */
  client: any

  /** Set loading indicator */
  setLoading: (loading: boolean) => void

  /** Get current base URL (function form) */
  getBaseUrl: () => string | null

  /** Get current base URL (function, alias for getBaseUrl) */
  baseUrl: () => string | null

  /** Store response for preview panel */
  setResponse: (response: any) => void

  /** Add structured response item */
  addResponse: (data: any, meta?: Record<string, any>) => void

  /** Track domain data */
  track: {
    dns: (domain: string, records: any[], meta?: any) => void
    seo: (domain: string, data: any) => void
    spider: (domain: string, data: any) => void
    request: (domain: string, data: any) => void
    download: (domain: string, data: any) => void
  }
}

/**
 * Create an extended TUI context with full shell features.
 */
export function createExtendedTuiContext(ctx: CommandContext): ExtendedTuiContext {
  const base = createTuiContextFromShell(ctx)
  const baseUrlFn = () => ctx.baseUrl()

  return {
    ...base,
    shellContext: ctx,
    client: ctx.client,

    setLoading: (loading: boolean) => {
      ctx.setIsLoading(loading)
    },

    getBaseUrl: baseUrlFn,
    baseUrl: baseUrlFn,

    setResponse: (response: any) => {
      ctx.setLastResponse(response)
    },

    addResponse: (data: any, meta?: Record<string, any>) => {
      ctx.addHistoryItem({
        type: 'response',
        content: data,
        meta
      })
    },

    track: {
      dns: ctx.trackDns,
      seo: ctx.trackSeo,
      spider: ctx.trackSpider,
      request: ctx.trackRequest,
      download: ctx.trackDownload
    }
  }
}

/**
 * Wrap a unified handler to work with ShellExecutor.
 *
 * @example
 * ```typescript
 * import { dnsLookupHandler } from '../handlers/dns.js'
 *
 * // In executor routing:
 * case 'dns':
 *   return await wrapUnifiedHandler(dnsLookupHandler)(ctx, args)
 * ```
 */
export function wrapUnifiedHandler(
  handler: (ctx: { result: any; rawArgs: string[]; tui: TuiContext; isTui: true }) => Promise<void>
): (ctx: CommandContext, args: string[]) => Promise<CommandResult> {
  return async (ctx: CommandContext, args: string[]): Promise<CommandResult> => {
    const tuiCtx = createExtendedTuiContext(ctx)

    // Create minimal parse result from args
    // Note: For full parsing, use the unified CLI's parse method
    const result = {
      command: [],
      positional: {} as Record<string, any>,
      options: {} as Record<string, any>,
      data: {} as Record<string, any>,
      headers: {} as Record<string, any>,
      errors: [] as string[],
      rest: args
    }

    // Simple positional mapping (first arg is usually the target)
    if (args[0]) {
      result.positional.target = args[0]
      result.positional.domain = args[0]
      result.positional.url = args[0]
      result.positional.ip = args[0]
    }
    if (args[1]) {
      result.positional.type = args[1]
    }

    try {
      await handler({
        result,
        rawArgs: args,
        tui: tuiCtx,
        isTui: true
      })
      return { success: true }
    } catch (err: any) {
      tuiCtx.setError(err.message || String(err))
      return { success: false, error: err.message }
    }
  }
}

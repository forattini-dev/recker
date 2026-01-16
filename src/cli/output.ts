/**
 * Enhanced Output System
 *
 * Provides a rich, consistent output API for CLI handlers.
 * Automatically routes to console (CLI) or tuiuiu signals (TUI).
 *
 * Features:
 * - Tables, lists, key-value pairs
 * - Progress indicators and spinners
 * - Color-coded status messages
 * - Streaming support for long-running operations
 * - Auto-managed loading state
 */

import type { ExecutionContext, TuiContext } from './handler-types.js'
import type { ExtendedTuiContext } from './tui-adapter.js'
import colors from '../utils/colors.js'

// =============================================================================
// Types
// =============================================================================

export interface TableColumn {
  key: string
  label?: string
  align?: 'left' | 'center' | 'right'
  width?: number
  format?: (value: unknown) => string
}

export interface KeyValue {
  key: string
  value: unknown
  color?: string
}

export interface ProgressOptions {
  total: number
  current: number
  label?: string
  width?: number
  showPercent?: boolean
}

export interface StatusIcon {
  success: string
  error: string
  warning: string
  info: string
  pending: string
}

// Default icons
const ICONS: StatusIcon = {
  success: colors.green('✔'),
  error: colors.red('✖'),
  warning: colors.yellow('⚠'),
  info: colors.blue('ℹ'),
  pending: colors.gray('○'),
}

// =============================================================================
// Enhanced Output Helper
// =============================================================================

export interface EnhancedOutput {
  // Basic output
  log: (text: string) => void
  error: (text: string) => void
  warn: (text: string) => void
  info: (text: string) => void
  success: (text: string) => void
  clear: () => void

  // JSON output
  json: (data: unknown) => void

  // Rich formatting
  title: (text: string, icon?: string) => void
  subtitle: (text: string) => void
  section: (text: string) => void
  divider: (char?: string) => void
  blank: () => void

  // Lists
  list: (items: string[], bullet?: string) => void
  numberedList: (items: string[]) => void
  checklist: (items: Array<{ text: string; checked: boolean }>) => void

  // Tables
  table: (data: Record<string, unknown>[], columns?: TableColumn[]) => void
  keyValue: (pairs: KeyValue[] | Record<string, unknown>) => void

  // Status indicators
  status: (type: keyof StatusIcon, text: string) => void
  grade: (grade: string, score?: number) => void

  // Progress
  progress: (options: ProgressOptions) => void
  spinner: (text: string) => void

  // Streaming (for TUI)
  stream: {
    start: () => void
    append: (text: string) => void
    end: () => void
  }

  // Response (TUI-specific structured output)
  response: (data: unknown, meta?: Record<string, unknown>) => void

  // Context access
  readonly isTui: boolean
  readonly context: ExecutionContext
}

/**
 * Check if context has extended TUI features
 */
function isExtendedContext(tui: TuiContext | undefined): tui is ExtendedTuiContext {
  return tui !== undefined && typeof (tui as ExtendedTuiContext).setLoading === 'function'
}

/**
 * Create enhanced output helper from execution context.
 *
 * @example
 * ```typescript
 * const out = createEnhancedOutput(ctx)
 *
 * out.title('DNS Lookup Results', '🔍')
 * out.keyValue({ domain: 'example.com', records: 5 })
 * out.table(records, [
 *   { key: 'type', label: 'Type', width: 8 },
 *   { key: 'data', label: 'Data' }
 * ])
 * out.status('success', 'Lookup completed')
 * ```
 */
export function createEnhancedOutput(ctx: ExecutionContext): EnhancedOutput {
  const { tui, isTui } = ctx
  const extCtx = isExtendedContext(tui) ? tui : null
  const buffer: string[] = []
  let isStreaming = false

  // Core output function
  const write = (text: string) => {
    if (isStreaming) {
      buffer.push(text)
      return
    }

    if (isTui && tui) {
      tui.appendOutput(text + '\n')
    } else {
      console.log(text)
    }
  }

  // Flush buffer to output
  const flush = () => {
    if (buffer.length > 0) {
      const content = buffer.join('\n')
      buffer.length = 0

      if (isTui && tui) {
        tui.setOutput(content)
      } else {
        console.log(content)
      }
    }
  }

  return {
    // Basic output
    log: write,

    error: (text: string) => {
      const formatted = colors.red(text)
      if (isTui && tui) {
        tui.setError(text)
      } else {
        console.error(formatted)
      }
    },

    warn: (text: string) => {
      write(colors.yellow(`⚠ ${text}`))
    },

    info: (text: string) => {
      write(colors.blue(`ℹ ${text}`))
    },

    success: (text: string) => {
      write(colors.green(`✔ ${text}`))
    },

    clear: () => {
      if (isTui && tui) {
        tui.clear()
      } else {
        console.clear()
      }
    },

    // JSON output
    json: (data: unknown) => {
      const text = JSON.stringify(data, null, 2)
      if (isTui && tui) {
        tui.setOutput(text)
      } else {
        console.log(text)
      }
    },

    // Rich formatting
    title: (text: string, icon?: string) => {
      const prefix = icon ? `${icon} ` : ''
      write(`\n${prefix}${colors.bold(colors.cyan(text))}`)
    },

    subtitle: (text: string) => {
      write(colors.bold(text))
    },

    section: (text: string) => {
      write(`\n${colors.gray('─'.repeat(3))} ${colors.bold(text)}`)
    },

    divider: (char = '─') => {
      write(colors.gray(char.repeat(40)))
    },

    blank: () => {
      write('')
    },

    // Lists
    list: (items: string[], bullet = '•') => {
      for (const item of items) {
        write(`  ${colors.green(bullet)} ${item}`)
      }
    },

    numberedList: (items: string[]) => {
      items.forEach((item, i) => {
        write(`  ${colors.cyan(`${i + 1}.`)} ${item}`)
      })
    },

    checklist: (items: Array<{ text: string; checked: boolean }>) => {
      for (const item of items) {
        const icon = item.checked ? colors.green('✔') : colors.gray('○')
        write(`  ${icon} ${item.text}`)
      }
    },

    // Tables
    table: (data: Record<string, unknown>[], columns?: TableColumn[]) => {
      if (data.length === 0) {
        write(colors.gray('  (no data)'))
        return
      }

      // Auto-detect columns if not provided
      const cols: TableColumn[] = columns || Object.keys(data[0]).map(key => ({ key, label: key }))

      // Calculate column widths
      const widths = cols.map(col => {
        const labelLen = (col.label || col.key).length
        const maxDataLen = data.reduce((max, row) => {
          const val = col.format
            ? col.format(row[col.key])
            : String(row[col.key] ?? '')
          return Math.max(max, val.length)
        }, 0)
        return col.width || Math.max(labelLen, maxDataLen, 4)
      })

      // Header
      const header = cols.map((col, i) => {
        const label = col.label || col.key
        return colors.bold(label.padEnd(widths[i]))
      }).join('  ')
      write(`  ${header}`)

      // Separator
      write(`  ${colors.gray(widths.map(w => '─'.repeat(w)).join('──'))}`)

      // Rows
      for (const row of data) {
        const line = cols.map((col, i) => {
          const val = col.format
            ? col.format(row[col.key])
            : String(row[col.key] ?? '')
          const align = col.align || 'left'
          if (align === 'right') return val.padStart(widths[i])
          if (align === 'center') {
            const pad = Math.floor((widths[i] - val.length) / 2)
            return ' '.repeat(pad) + val + ' '.repeat(widths[i] - val.length - pad)
          }
          return val.padEnd(widths[i])
        }).join('  ')
        write(`  ${line}`)
      }
    },

    keyValue: (pairs: KeyValue[] | Record<string, unknown>) => {
      const items: KeyValue[] = Array.isArray(pairs)
        ? pairs
        : Object.entries(pairs).map(([key, value]) => ({ key, value }))

      const maxKeyLen = Math.max(...items.map(p => p.key.length))

      for (const { key, value, color } of items) {
        const keyStr = colors.gray(`${key.padEnd(maxKeyLen)}:`)
        let valStr = String(value ?? '(empty)')

        // Apply color if specified
        if (color && colors[color as keyof typeof colors]) {
          valStr = (colors[color as keyof typeof colors] as (s: string) => string)(valStr)
        }

        write(`  ${keyStr} ${valStr}`)
      }
    },

    // Status indicators
    status: (type: keyof StatusIcon, text: string) => {
      write(`  ${ICONS[type]} ${text}`)
    },

    grade: (grade: string, score?: number) => {
      let gradeColor = colors.red
      if (grade === 'A' || grade === 'A+') gradeColor = colors.green
      else if (grade === 'B' || grade === 'B+') gradeColor = colors.blue
      else if (grade === 'C' || grade === 'C+') gradeColor = colors.yellow

      let text = `Grade: ${gradeColor(colors.bold(grade))}`
      if (score !== undefined) {
        text += `  ${colors.gray('Score:')} ${score}/100`
      }
      write(text)
    },

    // Progress
    progress: (options: ProgressOptions) => {
      const { total, current, label, width = 30, showPercent = true } = options
      const percent = Math.min(100, Math.round((current / total) * 100))
      const filled = Math.round((percent / 100) * width)
      const empty = width - filled

      const bar = colors.green('█'.repeat(filled)) + colors.gray('░'.repeat(empty))
      const percentStr = showPercent ? ` ${percent}%` : ''
      const labelStr = label ? `${label} ` : ''

      write(`  ${labelStr}[${bar}]${percentStr}`)
    },

    spinner: (text: string) => {
      // In TUI mode, this sets the loading state
      if (extCtx) {
        extCtx.setLoading(true)
      }
      write(colors.gray(`⠋ ${text}`))
    },

    // Streaming
    stream: {
      start: () => {
        isStreaming = true
        buffer.length = 0
      },
      append: (text: string) => {
        buffer.push(text)
      },
      end: () => {
        isStreaming = false
        flush()
      },
    },

    // TUI-specific structured response
    response: (data: unknown, meta?: Record<string, unknown>) => {
      if (extCtx) {
        extCtx.addResponse(data, meta)
      } else {
        // CLI fallback: JSON output
        console.log(JSON.stringify(data, null, 2))
      }
    },

    // Context access
    get isTui() { return isTui },
    get context() { return ctx },
  }
}

// =============================================================================
// Handler Wrapper
// =============================================================================

export interface HandlerOptions {
  /** Show loading indicator while handler runs */
  loading?: boolean | string
  /** Response type for TUI panel */
  responseType?: string
  /** Track domain in sidebar */
  trackDomain?: boolean
}

/**
 * Wrap a handler with automatic loading state management.
 *
 * @example
 * ```typescript
 * export const lookupHandler = withHandler(
 *   { loading: 'Looking up DNS...', responseType: 'dns' },
 *   async (ctx, out) => {
 *     const domain = ctx.result.positional.domain as string
 *     const records = await dnsLookup(domain)
 *     out.response({ domain, records }, { responseType: 'dns' })
 *   }
 * )
 * ```
 */
export function withHandler(
  options: HandlerOptions,
  handler: (ctx: ExecutionContext, out: EnhancedOutput, extCtx: ExtendedTuiContext | null) => Promise<void> | void
) {
  return async (ctx: ExecutionContext): Promise<void> => {
    const out = createEnhancedOutput(ctx)
    const extCtx = isExtendedContext(ctx.tui) ? ctx.tui : null

    // Show loading message if specified
    if (options.loading) {
      extCtx?.setLoading(true)
      if (typeof options.loading === 'string') {
        out.log(colors.gray(options.loading))
      }
    }

    try {
      await handler(ctx, out, extCtx)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      out.error(message)
      if (!ctx.isTui) process.exit(1)
    } finally {
      if (options.loading) {
        extCtx?.setLoading(false)
      }
    }
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get string value from positional parameter safely.
 */
export function getString(value: unknown, defaultValue = ''): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'default' in value) {
    return String((value as { default: unknown }).default)
  }
  return defaultValue
}

/**
 * Get number value from positional parameter safely.
 */
export function getNumber(value: unknown, defaultValue = 0): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const num = Number(value)
    return isNaN(num) ? defaultValue : num
  }
  if (value && typeof value === 'object' && 'default' in value) {
    return getNumber((value as { default: unknown }).default, defaultValue)
  }
  return defaultValue
}

/**
 * Get boolean value from options safely.
 */
export function getBoolean(value: unknown, defaultValue = false): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  if (value && typeof value === 'object' && 'default' in value) {
    return getBoolean((value as { default: unknown }).default, defaultValue)
  }
  return defaultValue
}

/**
 * Format bytes as human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/**
 * Format duration in milliseconds as human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60000)
  const secs = ((ms % 60000) / 1000).toFixed(0)
  return `${mins}m ${secs}s`
}

// Re-export colors for convenience
export { colors }

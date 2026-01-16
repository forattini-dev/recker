/**
 * Unified CLI Types
 *
 * Types for the unified command system that works in both CLI and TUI modes.
 */

import type { CommandParseResult, CLISchema, CommandDefinition, OptionDefinition, PositionalDefinition, Separators } from 'cli-args-parser'

/**
 * TUI context for commands running in the interactive shell.
 * Provides tuiuiu signals and output functions instead of console.log.
 */
export interface TuiContext {
  /** Signal to update output text */
  setOutput: (text: string) => void
  /** Signal to append output text */
  appendOutput: (text: string) => void
  /** Signal to set error message */
  setError: (text: string) => void
  /** Clear all output */
  clear: () => void
  /** Exit the shell */
  exit: () => void
  /** Check if shell is running */
  isRunning: boolean
}

/**
 * Execution context for command handlers.
 * Contains the parse result plus optional TUI context.
 */
export interface ExecutionContext {
  /** Parsed CLI arguments */
  result: CommandParseResult
  /** Raw arguments (before parsing) */
  rawArgs: string[]
  /** TUI context if running in shell, undefined for CLI */
  tui?: TuiContext
  /** Whether running in TUI mode */
  isTui: boolean
}

/**
 * Unified handler signature that works for both CLI and TUI.
 *
 * @example
 * ```typescript
 * const handler: RekHandler = async (ctx) => {
 *   const { result, tui, isTui } = ctx
 *   const url = result.positional.url as string
 *
 *   if (isTui) {
 *     tui.setOutput(`Fetching ${url}...`)
 *   } else {
 *     console.log(`Fetching ${url}...`)
 *   }
 *
 *   const response = await fetch(url)
 *   const data = await response.text()
 *
 *   if (isTui) {
 *     tui.setOutput(data)
 *   } else {
 *     console.log(data)
 *   }
 * }
 * ```
 */
export type RekHandler = (ctx: ExecutionContext) => Promise<void> | void

/**
 * Output helper that automatically routes to console or TUI.
 */
export interface OutputHelper {
  log: (text: string) => void
  error: (text: string) => void
  clear: () => void
  json: (data: unknown) => void
}

/**
 * Create an output helper from execution context.
 */
export function createOutput(ctx: ExecutionContext): OutputHelper {
  const { tui, isTui } = ctx

  return {
    log: (text: string) => {
      if (isTui && tui) {
        tui.appendOutput(text + '\n')
      } else {
        console.log(text)
      }
    },
    error: (text: string) => {
      if (isTui && tui) {
        tui.setError(text)
      } else {
        console.error(text)
      }
    },
    clear: () => {
      if (isTui && tui) {
        tui.clear()
      } else {
        console.clear()
      }
    },
    json: (data: unknown) => {
      const text = JSON.stringify(data, null, 2)
      if (isTui && tui) {
        tui.setOutput(text)
      } else {
        console.log(text)
      }
    }
  }
}

/**
 * Extended command definition with Recker-specific fields.
 */
export interface RekCommandDefinition extends Omit<CommandDefinition, 'handler' | 'commands'> {
  /** Command handler */
  handler?: RekHandler
  /** Nested subcommands */
  commands?: Record<string, RekCommandDefinition>
  /** Command category for grouping in help */
  category?: string
  /** Whether this command is available in TUI shell */
  tuiEnabled?: boolean
  /** Examples for help text */
  examples?: Array<{ cmd: string; desc?: string }>
}

/**
 * Extended CLI schema with Recker-specific options.
 */
export interface RekCLISchema extends Omit<CLISchema, 'commands'> {
  /** CLI name */
  name: string
  /** CLI version */
  version?: string
  /** Description */
  description?: string
  /** Commands */
  commands?: Record<string, RekCommandDefinition>
  /** Global options */
  options?: Record<string, OptionDefinition>
  /** Custom separators (HTTPie-style) */
  separators?: Separators
  /** Default command when no command specified */
  defaultCommand?: string
}

/**
 * Result from unified CLI execution.
 */
export interface RekCLIResult {
  /** Whether execution was successful */
  success: boolean
  /** Error message if failed */
  error?: string
  /** The parsed result */
  parsed: CommandParseResult
  /** The command path that was executed */
  commandPath: string[]
}

// Re-export useful types from cli-args-parser
export type {
  CommandParseResult,
  OptionDefinition,
  PositionalDefinition,
  Separators
}

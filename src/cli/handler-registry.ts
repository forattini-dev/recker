/**
 * Unified CLI Registry
 *
 * Creates a CLI using cli-args-parser that can execute handlers
 * in both CLI mode (console output) and TUI mode (tuiuiu signals).
 */

import { createCLI, type CLI, type CLISchema, type CommandDefinition, type CommandParseResult } from 'cli-args-parser'
import type {
  RekCLISchema,
  RekCommandDefinition,
  RekHandler,
  ExecutionContext,
  TuiContext,
  RekCLIResult
} from './handler-types.js'
import { RECKER_SEPARATORS } from './schema.js'

/**
 * Unified CLI that supports both CLI and TUI execution modes.
 */
export interface RekCLI {
  /** Parse arguments without executing */
  parse(args: string[]): CommandParseResult

  /** Execute in CLI mode (console output) */
  run(args: string[]): Promise<RekCLIResult>

  /** Execute in TUI mode with context */
  runTui(args: string[], tui: TuiContext): Promise<RekCLIResult>

  /** Generate help text */
  help(commandPath?: string[]): string

  /** Generate shell completion script */
  completion(shell: 'bash' | 'zsh' | 'fish'): string

  /** Get the underlying schema */
  schema: RekCLISchema

  /** Get the underlying cli-args-parser CLI */
  internal: CLI
}

/**
 * Convert RekCommandDefinition to cli-args-parser CommandDefinition.
 * Strips Recker-specific fields and creates wrapper handlers.
 */
function convertCommand(
  cmd: RekCommandDefinition,
  handlerRegistry: Map<string, RekHandler>,
  path: string[] = []
): CommandDefinition {
  const converted: CommandDefinition = {
    description: cmd.description,
    aliases: cmd.aliases,
    hidden: cmd.hidden,
    positional: cmd.positional,
    options: cmd.options,
    separators: cmd.separators
  }

  // Store handler in registry with full path
  if (cmd.handler) {
    const key = path.join('.')
    handlerRegistry.set(key, cmd.handler)
  }

  // Convert nested commands
  if (cmd.commands) {
    converted.commands = {}
    for (const [name, subCmd] of Object.entries(cmd.commands)) {
      converted.commands[name] = convertCommand(subCmd, handlerRegistry, [...path, name])
    }
  }

  return converted
}

/**
 * Convert RekCLISchema to cli-args-parser CLISchema.
 */
function convertSchema(
  schema: RekCLISchema,
  handlerRegistry: Map<string, RekHandler>
): CLISchema {
  const converted: CLISchema = {
    name: schema.name,
    version: schema.version,
    description: schema.description,
    options: schema.options,
    separators: schema.separators ?? RECKER_SEPARATORS,
    strict: false // Allow unknown options for flexibility
  }

  if (schema.commands) {
    converted.commands = {}
    for (const [name, cmd] of Object.entries(schema.commands)) {
      converted.commands[name] = convertCommand(cmd, handlerRegistry, [name])
    }
  }

  return converted
}

/**
 * Find handler for a command path.
 */
function findHandler(
  commandPath: string[],
  handlerRegistry: Map<string, RekHandler>
): RekHandler | undefined {
  // Try exact match first
  const key = commandPath.join('.')
  if (handlerRegistry.has(key)) {
    return handlerRegistry.get(key)
  }

  // Try parent paths (for commands that handle subcommands)
  for (let i = commandPath.length - 1; i >= 0; i--) {
    const parentKey = commandPath.slice(0, i).join('.')
    if (handlerRegistry.has(parentKey)) {
      return handlerRegistry.get(parentKey)
    }
  }

  return undefined
}

/**
 * Execute a handler with context.
 */
async function executeHandler(
  handler: RekHandler,
  result: CommandParseResult,
  rawArgs: string[],
  tui?: TuiContext
): Promise<RekCLIResult> {
  const ctx: ExecutionContext = {
    result,
    rawArgs,
    tui,
    isTui: !!tui
  }

  try {
    await handler(ctx)
    return {
      success: true,
      parsed: result,
      commandPath: result.command
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      error: message,
      parsed: result,
      commandPath: result.command
    }
  }
}

/**
 * Create a unified CLI from a schema.
 *
 * @example
 * ```typescript
 * const cli = createRekCLI({
 *   name: 'rek',
 *   version: '1.0.0',
 *   commands: {
 *     dns: {
 *       description: 'DNS lookup',
 *       positional: [{ name: 'domain', required: true }],
 *       handler: async (ctx) => {
 *         const { result, isTui, tui } = ctx
 *         const domain = result.positional.domain as string
 *         // ... perform DNS lookup
 *         if (isTui) tui.setOutput(result)
 *         else console.log(result)
 *       }
 *     }
 *   }
 * })
 *
 * // CLI mode
 * await cli.run(['dns', 'google.com'])
 *
 * // TUI mode
 * await cli.runTui(['dns', 'google.com'], tuiContext)
 * ```
 */
export function createRekCLI(schema: RekCLISchema): RekCLI {
  const handlerRegistry = new Map<string, RekHandler>()
  const convertedSchema = convertSchema(schema, handlerRegistry)
  const internal = createCLI(convertedSchema)

  return {
    schema,
    internal,

    parse(args: string[]): CommandParseResult {
      // Pre-process: extract presets (+name) before parsing
      const filtered = args.filter(arg => {
        if (arg.startsWith('+') && arg.length > 1 && !arg.includes('=')) {
          return false // Remove preset markers
        }
        return true
      })
      return internal.parse(filtered)
    },

    async run(args: string[]): Promise<RekCLIResult> {
      const result = this.parse(args)

      // Check for errors
      if (result.errors.length > 0) {
        for (const error of result.errors) {
          console.error(`Error: ${error}`)
        }
        return {
          success: false,
          error: result.errors.join('; '),
          parsed: result,
          commandPath: result.command
        }
      }

      // Find and execute handler
      const handler = findHandler(result.command, handlerRegistry)
      if (handler) {
        return executeHandler(handler, result, args)
      }

      // No handler found
      if (result.command.length === 0) {
        // Show help for root
        console.log(this.help())
        return { success: true, parsed: result, commandPath: [] }
      }

      console.error(`No handler for command: ${result.command.join(' ')}`)
      return {
        success: false,
        error: `No handler for command: ${result.command.join(' ')}`,
        parsed: result,
        commandPath: result.command
      }
    },

    async runTui(args: string[], tui: TuiContext): Promise<RekCLIResult> {
      const result = this.parse(args)

      // Check for errors
      if (result.errors.length > 0) {
        tui.setError(result.errors.join('\n'))
        return {
          success: false,
          error: result.errors.join('; '),
          parsed: result,
          commandPath: result.command
        }
      }

      // Find and execute handler
      const handler = findHandler(result.command, handlerRegistry)
      if (handler) {
        return executeHandler(handler, result, args, tui)
      }

      // No handler found
      tui.setError(`Unknown command: ${args.join(' ')}`)
      return {
        success: false,
        error: `No handler for command: ${result.command.join(' ')}`,
        parsed: result,
        commandPath: result.command
      }
    },

    help(commandPath: string[] = []): string {
      return internal.help(commandPath)
    },

    completion(shell: 'bash' | 'zsh' | 'fish'): string {
      return internal.completion(shell)
    }
  }
}

/**
 * Helper to merge multiple schemas into one.
 * Useful for modular command registration.
 */
export function mergeSchemas(base: RekCLISchema, ...extensions: Partial<RekCLISchema>[]): RekCLISchema {
  const merged = { ...base }

  for (const ext of extensions) {
    if (ext.commands) {
      merged.commands = { ...merged.commands, ...ext.commands }
    }
    if (ext.options) {
      merged.options = { ...merged.options, ...ext.options }
    }
  }

  return merged
}

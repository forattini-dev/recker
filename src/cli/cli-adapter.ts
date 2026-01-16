/**
 * CLI Adapter
 *
 * Bridges the old CLI router system to unified handlers.
 * Allows gradual migration of CLI commands to use unified handlers.
 *
 * Usage:
 * ```typescript
 * // In src/cli/commands/dns.ts
 * import { createCliAction } from '../cli-adapter.js'
 * import { lookupHandler } from '../handlers/dns.js'
 *
 * dns.command('lookup')
 *   .argument('<domain>')
 *   .argument('[type]', { default: 'A' })
 *   .action(createCliAction(lookupHandler, {
 *     positional: ['domain', 'type']
 *   }))
 * ```
 */

import type { ExecutionContext, RekHandler } from './handler-types.js'
import type { CommandParseResult } from 'cli-args-parser'

/**
 * Configuration for mapping CLI args to unified handler context
 */
export interface CliActionConfig {
  /** Names of positional arguments in order */
  positional: string[]
  /** Default values for positional arguments */
  defaults?: Record<string, any>
}

/**
 * Create a CLI action that delegates to a unified handler.
 *
 * @param handler - The unified handler to call
 * @param config - Configuration for argument mapping
 * @returns An action function compatible with the old CLI router
 */
export function createCliAction(
  handler: RekHandler,
  config: CliActionConfig
): (...args: any[]) => Promise<void> {
  return async (...args: any[]) => {
    // Last two args are always [rawArgs, command] from router
    const rawArgs = args[args.length - 2] as string[]

    // Build positional map from args
    const positional: Record<string, any> = {}
    for (let i = 0; i < config.positional.length; i++) {
      const name = config.positional[i]
      const value = args[i]

      // Use provided value, or default if undefined
      if (value !== undefined) {
        positional[name] = value
      } else if (config.defaults?.[name] !== undefined) {
        positional[name] = config.defaults[name]
      }
    }

    // Create minimal CommandParseResult
    const result: CommandParseResult = {
      command: [],
      positional,
      options: {},
      data: {},
      headers: {},
      errors: [],
      rest: rawArgs
    }

    // Create execution context for CLI mode
    const ctx: ExecutionContext = {
      result,
      rawArgs,
      tui: undefined,
      isTui: false
    }

    // Call the unified handler
    await handler(ctx)
  }
}

/**
 * Create a CLI action with options support.
 *
 * @param handler - The unified handler to call
 * @param config - Configuration for argument mapping
 * @returns An action function compatible with the old CLI router
 */
export function createCliActionWithOptions(
  handler: RekHandler,
  config: CliActionConfig & {
    /** Option names to extract from command */
    options?: string[]
    /** Map CLI option names to handler option names (e.g., 'sub-format' -> 'subFormat') */
    optionMapping?: Record<string, string>
  }
): (...args: any[]) => Promise<void> {
  return async (...args: any[]) => {
    // Last two args are always [rawArgs, command] from router
    const rawArgs = args[args.length - 2] as string[]
    const command = args[args.length - 1] as any

    // Build positional map from args
    const positional: Record<string, any> = {}
    for (let i = 0; i < config.positional.length; i++) {
      const name = config.positional[i]
      const value = args[i]

      if (value !== undefined) {
        positional[name] = value
      } else if (config.defaults?.[name] !== undefined) {
        positional[name] = config.defaults[name]
      }
    }

    // Extract options from command if available
    const options: Record<string, any> = {}
    if (command?.opts && config.options) {
      const cmdOpts = command.opts()
      for (const opt of config.options) {
        if (cmdOpts[opt] !== undefined) {
          // Use mapped name if provided, otherwise use original
          const mappedName = config.optionMapping?.[opt] || opt
          options[mappedName] = cmdOpts[opt]
        }
      }
    }

    // Create minimal CommandParseResult
    const result: CommandParseResult = {
      command: [],
      positional,
      options,
      data: {},
      headers: {},
      errors: [],
      rest: rawArgs
    }

    // Create execution context for CLI mode
    const ctx: ExecutionContext = {
      result,
      rawArgs,
      tui: undefined,
      isTui: false
    }

    // Call the unified handler
    await handler(ctx)
  }
}

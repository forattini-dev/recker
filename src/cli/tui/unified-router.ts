/**
 * Unified Command Router for TUI Shell
 *
 * Routes commands to unified handlers from allCommandDefinitions.
 * Provides seamless integration between the TUI shell and unified CLI system.
 */

import type { CommandContext, CommandResult } from './executor-commands/types.js'
import { allCommandDefinitions } from '../handlers/index.js'
import { createExtendedTuiContext } from '../tui-adapter.js'
import type { RekHandler, ExecutionContext, RekCommandDefinition } from '../handler-types.js'
import type { CommandParseResult } from 'cli-args-parser'

/**
 * Command info for shell autocomplete and help
 */
export interface ShellCommandInfo {
  name: string
  description: string
  aliases?: string[]
  examples?: Array<{ cmd: string; desc: string }>
  category: string
}

/**
 * Build a flat map of all unified commands for quick lookup.
 * Maps command names and aliases to their handlers and metadata.
 */
function buildCommandMap(): Map<string, {
  handler: RekHandler
  definition: RekCommandDefinition
  category: string
}> {
  const map = new Map<string, { handler: RekHandler; definition: RekCommandDefinition; category: string }>()

  for (const [category, def] of Object.entries(allCommandDefinitions)) {
    if (!def.tuiEnabled) continue
    if (!def.commands) continue

    for (const [cmdName, cmdDef] of Object.entries(def.commands)) {
      if (!cmdDef.handler) continue

      // Register main command name
      const fullName = `${category}:${cmdName}`
      const shortName = cmdName

      map.set(fullName, {
        handler: cmdDef.handler,
        definition: cmdDef,
        category
      })

      // Also register short name if it doesn't conflict
      if (!map.has(shortName)) {
        map.set(shortName, {
          handler: cmdDef.handler,
          definition: cmdDef,
          category
        })
      }

      // Register aliases
      if (cmdDef.aliases) {
        for (const alias of cmdDef.aliases) {
          const fullAlias = `${category}:${alias}`
          if (!map.has(fullAlias)) {
            map.set(fullAlias, {
              handler: cmdDef.handler,
              definition: cmdDef,
              category
            })
          }
          if (!map.has(alias)) {
            map.set(alias, {
              handler: cmdDef.handler,
              definition: cmdDef,
              category
            })
          }
        }
      }
    }
  }

  return map
}

// Build command map once at module load
const commandMap = buildCommandMap()

/**
 * Get all available unified commands for autocomplete/help.
 */
export function getUnifiedCommands(): ShellCommandInfo[] {
  const commands: ShellCommandInfo[] = []

  for (const [category, def] of Object.entries(allCommandDefinitions)) {
    if (!def.tuiEnabled) continue
    if (!def.commands) continue

    for (const [cmdName, cmdDef] of Object.entries(def.commands)) {
      if (!cmdDef.handler) continue

      commands.push({
        name: cmdName,
        description: cmdDef.description || '',
        aliases: cmdDef.aliases,
        examples: cmdDef.examples?.map(e => ({ cmd: e.cmd, desc: e.desc || '' })),
        category
      })
    }
  }

  return commands
}

/**
 * Get commands by category for organized help display.
 */
export function getCommandsByCategory(): Map<string, ShellCommandInfo[]> {
  const byCategory = new Map<string, ShellCommandInfo[]>()

  for (const cmd of getUnifiedCommands()) {
    const list = byCategory.get(cmd.category) || []
    list.push(cmd)
    byCategory.set(cmd.category, list)
  }

  return byCategory
}

/**
 * Parse shell arguments into positional and options based on command definition.
 */
function parseArgsForCommand(
  args: string[],
  definition: any
): { positional: Record<string, any>; options: Record<string, any> } {
  const positional: Record<string, any> = {}
  const options: Record<string, any> = {}

  const positionalDefs = definition.positional || []
  const optionDefs = definition.options || {}

  let positionalIndex = 0
  let i = 0

  while (i < args.length) {
    const arg = args[i]

    // Handle options
    if (arg.startsWith('--')) {
      const [name, value] = arg.slice(2).split('=')
      const optDef = optionDefs[name]
      if (optDef) {
        if (optDef.type === 'boolean') {
          options[name] = value !== 'false'
        } else if (value !== undefined) {
          options[name] = optDef.type === 'number' ? Number(value) : value
        } else if (optDef.type !== 'boolean' && i + 1 < args.length) {
          i++
          options[name] = optDef.type === 'number' ? Number(args[i]) : args[i]
        } else {
          options[name] = true
        }
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      // Short option
      const shortName = arg[1]
      // Find option by short name
      for (const [optName, optDef] of Object.entries(optionDefs) as any[]) {
        if (optDef.short === shortName) {
          if (optDef.type === 'boolean') {
            options[optName] = true
          } else if (i + 1 < args.length) {
            i++
            options[optName] = optDef.type === 'number' ? Number(args[i]) : args[i]
          }
          break
        }
      }
    } else {
      // Positional argument
      if (positionalIndex < positionalDefs.length) {
        const posDef = positionalDefs[positionalIndex]
        positional[posDef.name] = posDef.type === 'number' ? Number(arg) : arg
        positionalIndex++
      }
    }
    i++
  }

  // Apply defaults
  for (const posDef of positionalDefs) {
    if (positional[posDef.name] === undefined && posDef.default !== undefined) {
      positional[posDef.name] = posDef.default
    }
  }

  for (const [optName, optDef] of Object.entries(optionDefs) as any[]) {
    if (options[optName] === undefined && optDef.default !== undefined) {
      options[optName] = optDef.default
    }
  }

  return { positional, options }
}

/**
 * Try to route a command to a unified handler.
 *
 * @returns true if handled, false if command not found in unified system
 */
export async function routeUnifiedCommand(
  ctx: CommandContext,
  command: string,
  args: string[]
): Promise<{ handled: boolean; result?: CommandResult }> {
  // Try exact match first
  let entry = commandMap.get(command)

  // Try with category prefix (e.g., "dns lookup" -> "dns:lookup")
  if (!entry && args.length > 0) {
    const withSubcommand = `${command}:${args[0]}`
    entry = commandMap.get(withSubcommand)
    if (entry) {
      args = args.slice(1) // Remove subcommand from args
    }
  }

  if (!entry) {
    return { handled: false }
  }

  const { handler, definition } = entry
  const tuiCtx = createExtendedTuiContext(ctx)

  // Parse arguments based on command definition
  const { positional, options } = parseArgsForCommand(args, definition)

  // Create execution context
  const execCtx: ExecutionContext = {
    result: {
      command: [command],
      positional,
      options,
      data: {},
      headers: {},
      errors: [],
      rest: args
    } as CommandParseResult,
    rawArgs: args,
    tui: tuiCtx,
    isTui: true
  }

  try {
    await handler(execCtx)
    return { handled: true, result: { success: true } }
  } catch (err: any) {
    tuiCtx.setError(err.message || String(err))
    return { handled: true, result: { success: false, error: err.message } }
  }
}

/**
 * Check if a command exists in the unified system.
 */
export function hasUnifiedCommand(command: string): boolean {
  return commandMap.has(command)
}

/**
 * Get help text for a unified command.
 */
export function getUnifiedCommandHelp(command: string): string | null {
  const entry = commandMap.get(command)
  if (!entry) return null

  const { definition, category } = entry
  const lines: string[] = []

  lines.push(`\x1b[1m${command}\x1b[0m - ${definition.description}`)
  lines.push(`Category: ${category}`)

  if (definition.positional?.length) {
    lines.push('\nArguments:')
    for (const pos of definition.positional) {
      const req = pos.required ? '' : ' (optional)'
      lines.push(`  ${pos.name}${req} - ${pos.description}`)
    }
  }

  if (definition.options && Object.keys(definition.options).length > 0) {
    lines.push('\nOptions:')
    for (const [name, opt] of Object.entries(definition.options) as any[]) {
      const short = opt.short ? `-${opt.short}, ` : '    '
      lines.push(`  ${short}--${name} - ${opt.description}`)
    }
  }

  if (definition.examples?.length) {
    lines.push('\nExamples:')
    for (const ex of definition.examples) {
      lines.push(`  ${ex.cmd}`)
      lines.push(`    ${ex.desc}`)
    }
  }

  return lines.join('\n')
}

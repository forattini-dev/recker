/**
 * Parser Adapter
 *
 * Provides backward compatibility layer between the old RekArgs class
 * and the new cli-args-parser based implementation.
 *
 * This allows gradual migration without breaking existing code.
 */

import { parseRekArgs, type RekParsedArgs } from './schema.js'
import type { CommandSchema, ParsedArgs } from './parser/types.js'

/**
 * Convert new parser result to legacy RekArgs format
 *
 * Maps:
 * - positional → args (array)
 * - presets object → presets array
 * - Applies schema defaults and validation
 */
function convertToLegacyFormat(
  result: RekParsedArgs,
  schema?: CommandSchema
): ParsedArgs {
  const legacy: ParsedArgs = {
    args: result.positional,
    data: { ...result.data },
    headers: { ...result.headers },
    options: {},
    presets: Object.keys(result.presets).filter(k => result.presets[k]),
    errors: [...result.errors]
  }

  // Map flags to options (legacy format stored flags in options)
  for (const [key, value] of Object.entries(result.flags)) {
    legacy.options[key] = value
  }

  // Map options to options (filter out null values)
  for (const [key, value] of Object.entries(result.options)) {
    if (value !== null) {
      legacy.options[key] = value as boolean | string
    }
  }

  // Apply schema defaults
  if (schema) {
    // Apply param defaults
    if (schema.params) {
      for (const [key, def] of Object.entries(schema.params)) {
        if (def.default !== undefined && legacy.data[key] === undefined) {
          legacy.data[key] = def.default
        }
      }
    }

    // Apply flag defaults
    if (schema.flags) {
      for (const [key, def] of Object.entries(schema.flags)) {
        if (def.default !== undefined && legacy.options[key] === undefined) {
          legacy.options[key] = def.default
        }
      }
    }

    // Validate choices
    if (schema.params) {
      for (const [key, def] of Object.entries(schema.params)) {
        const value = legacy.data[key]
        if (value !== undefined && def.choices && !def.choices.includes(String(value))) {
          legacy.errors.push(
            `Invalid value for '${key}': '${value}'. Allowed: ${def.choices.join(', ')}`
          )
        }
      }
    }

    // Validate required positional args
    if (schema.positional) {
      schema.positional.forEach((pos, index) => {
        if (pos.required && legacy.args[index] === undefined) {
          legacy.errors.push(`Missing required argument: <${pos.name}>`)
        }
      })
    }

    // Validate required params
    if (schema.params) {
      for (const [key, def] of Object.entries(schema.params)) {
        if (def.required && legacy.data[key] === undefined) {
          legacy.errors.push(`Missing required parameter: ${key}=value`)
        }
      }
    }

    // Process keywords (bare words that act as flags)
    // Keywords should be removed from positional args and set as data flags
    if (schema.keywords) {
      const keywords = schema.keywords
      const filteredArgs: (string | number | boolean)[] = []

      for (const arg of legacy.args) {
        const argStr = String(arg)
        const keywordDef = keywords[argStr]
        if (keywordDef) {
          const targetKey = keywordDef.mapTo || argStr
          legacy.data[targetKey] = true
          // Don't add to filteredArgs - keyword is consumed
        } else {
          filteredArgs.push(arg)
        }
      }

      legacy.args = filteredArgs
    }
  }

  return legacy
}

/**
 * Adapter class that provides the same API as the old RekArgs
 * but uses cli-args-parser internally.
 *
 * @example
 * ```typescript
 * // Old usage (still works):
 * import { RekArgsAdapter as RekArgs } from './parser-adapter.js'
 * const result = RekArgs.parse(['https://api.com', 'name=Test'])
 *
 * // Or use the new API directly:
 * import { parseRekArgs } from './schema.js'
 * const result = parseRekArgs(['https://api.com', 'name=Test'])
 * ```
 */
export class RekArgsAdapter {
  /**
   * Parse CLI arguments with backward compatibility
   *
   * @param rawArgs - Raw CLI arguments
   * @param schema - Optional schema for validation
   * @returns Parsed arguments in legacy format
   */
  static parse(rawArgs: string[], schema?: CommandSchema): ParsedArgs {
    const result = parseRekArgs(rawArgs)
    return convertToLegacyFormat(result, schema)
  }
}

/**
 * Direct function to parse args with new parser, returning legacy format
 */
export function parseArgsLegacy(
  rawArgs: string[],
  schema?: CommandSchema
): ParsedArgs {
  return RekArgsAdapter.parse(rawArgs, schema)
}

/**
 * Parse with new format (recommended for new code)
 */
export { parseRekArgs, type RekParsedArgs } from './schema.js'

// Re-export types for convenience
export type { CommandSchema, ParsedArgs } from './parser/types.js'

/**
 * Recker CLI Schema
 *
 * Defines custom separators and parser configuration for the Recker CLI
 * using cli-args-parser as the underlying parsing engine.
 *
 * @example
 * ```typescript
 * import { parseRekArgs, RECKER_SEPARATORS } from './schema.js'
 *
 * const result = parseRekArgs([
 *   'https://api.example.com',
 *   'name=Filipe',           // data.name (string)
 *   'age:=35',               // data.age (number)
 *   'Authorization:Bearer X', // headers.Authorization
 *   '+openai',               // presets.openai
 *   '--verbose',             // flags.verbose
 *   '-o', 'output.json'      // options.o
 * ])
 * ```
 */

import {
  parse,
  createParser,
  createCLI,
  type Separators,
  type ParsedArgs,
  type ParserOptions,
  type ParserSchema,
  type CLISchema,
  type Parser,
  type CLI
} from 'cli-args-parser'

/**
 * Recker-specific separators matching HTTPie-style syntax
 *
 * - `=`  → data (untyped string): name=Filipe
 * - `:=` → data (typed/coerced): age:=35, active:=true
 * - `:`  → headers (HTTP headers): Authorization:Bearer TOKEN
 *
 * Note: Presets (+openai) are processed separately since they don't
 * follow the key:value pattern expected by cli-args-parser prefix separators.
 */
export const RECKER_SEPARATORS: Separators = {
  '=': 'data',
  ':=': { to: 'data', typed: true },
  ':': 'headers'
}

/**
 * Extended parser options with Recker defaults
 */
export interface RekParserOptions extends Omit<ParserOptions, 'separators'> {
  /** Custom separators (defaults to RECKER_SEPARATORS) */
  separators?: Separators
}

/**
 * Extended parse result with typed categories for Recker
 */
export interface RekParsedArgs {
  /** Positional arguments (URLs, paths, etc.) */
  positional: string[]
  /** Boolean flags (--verbose, -v) */
  flags: Record<string, boolean>
  /** Options with values (--output=file, -o file) */
  options: Record<string, string | number | boolean | null>
  /** Data parameters (name=value, key:=typed) */
  data: Record<string, unknown>
  /** HTTP headers (Header:Value) */
  headers: Record<string, string>
  /** Preset references (+openai, +github) */
  presets: Record<string, boolean>
  /** Parsing errors */
  errors: string[]
}

/**
 * Parse CLI arguments with Recker's HTTPie-style syntax
 *
 * @param args - Arguments to parse (typically process.argv.slice(2))
 * @param options - Parser options
 * @returns Parsed arguments with typed categories
 *
 * @example
 * ```typescript
 * const result = parseRekArgs(['https://api.com', 'name=Test', '--verbose'])
 * // result.positional = ['https://api.com']
 * // result.data = { name: 'Test' }
 * // result.flags = { verbose: true }
 * ```
 */
export function parseRekArgs(
  args: string[],
  options: RekParserOptions = {}
): RekParsedArgs {
  // Pre-process: Extract presets (+name) before parsing
  // These don't follow key:value pattern, so handle them separately
  const presets: Record<string, boolean> = {}
  const filteredArgs: string[] = []

  for (const arg of args) {
    if (arg.startsWith('+') && arg.length > 1 && !arg.includes('=')) {
      // This is a preset like +openai, +github
      presets[arg.slice(1)] = true
    } else {
      filteredArgs.push(arg)
    }
  }

  const result = parse(filteredArgs, {
    ...options,
    separators: options.separators ?? RECKER_SEPARATORS
  }) as ParsedArgs & {
    data?: Record<string, unknown>
    headers?: Record<string, string>
  }

  // Ensure all expected categories exist
  return {
    positional: result.positional ?? [],
    flags: result.flags ?? {},
    options: result.options as Record<string, string | number | boolean | null> ?? {},
    data: result.data ?? {},
    headers: result.headers ?? {},
    presets,
    errors: result.errors ?? []
  }
}

/**
 * Create a schema-based parser with Recker defaults
 *
 * @param schema - Parser schema definition
 * @returns Parser instance
 *
 * @example
 * ```typescript
 * const parser = createRekParser({
 *   positional: [{ name: 'url', required: true }],
 *   options: {
 *     verbose: { short: 'v', type: 'boolean' },
 *     output: { short: 'o', type: 'string' }
 *   }
 * })
 *
 * const result = parser.parse(['https://api.com', '-v'])
 * ```
 */
export function createRekParser(schema: ParserSchema): Parser {
  return createParser({
    ...schema,
    separators: schema.separators ?? RECKER_SEPARATORS
  })
}

/**
 * Create a CLI application with subcommands using Recker defaults
 *
 * @param schema - CLI schema definition
 * @returns CLI instance
 *
 * @example
 * ```typescript
 * const cli = createRekCLI({
 *   name: 'rek',
 *   version: '1.0.0',
 *   commands: {
 *     serve: {
 *       description: 'Start mock servers',
 *       commands: {
 *         http: { handler: async () => console.log('HTTP server') },
 *         ws: { handler: async () => console.log('WS server') }
 *       }
 *     }
 *   }
 * })
 *
 * await cli.run(['serve', 'http', '--port', '3000'])
 * ```
 */
export function createRekCLI(schema: CLISchema): CLI {
  return createCLI({
    ...schema,
    separators: schema.separators ?? RECKER_SEPARATORS
  })
}

// Re-export useful types and utilities from cli-args-parser
export {
  parse,
  createParser,
  createCLI,
  type Separators,
  type ParsedArgs,
  type ParserOptions,
  type ParserSchema,
  type CLISchema,
  type Parser,
  type CLI,
  type CommandDefinition,
  type OptionDefinition,
  type PositionalDefinition
} from 'cli-args-parser'

// Re-export error utilities
export {
  ParseError,
  hasErrors,
  throwIfErrors,
  formatErrors
} from 'cli-args-parser'

// Re-export coercion utilities (useful for custom parsing)
export {
  coercePrimitive,
  coerceTyped,
  coerceToType
} from 'cli-args-parser'

// Re-export completion generation
export { generateCompletion } from 'cli-args-parser'

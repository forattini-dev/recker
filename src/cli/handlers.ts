/**
 * CLI Handlers Module
 *
 * Provides handlers that work in both CLI and TUI modes.
 * Replaces the old 'unified/' directory structure.
 *
 * @example
 * ```typescript
 * import { createRekCLI, createOutput, type RekHandler } from './handlers.js'
 *
 * const myHandler: RekHandler = async (ctx) => {
 *   const out = createOutput(ctx)
 *   out.log('Hello!')
 * }
 * ```
 */

// Registry
export { createRekCLI, mergeSchemas } from './handler-registry.js'
export type { RekCLI } from './handler-registry.js'

// Types
export {
  createOutput,
  type ExecutionContext,
  type TuiContext,
  type RekHandler,
  type RekCLISchema,
  type RekCommandDefinition,
  type RekCLIResult,
  type OutputHelper,
  type CommandParseResult,
  type OptionDefinition,
  type PositionalDefinition,
  type Separators
} from './handler-types.js'

// TUI Shell integration
export {
  createTuiContextFromShell,
  createExtendedTuiContext,
  wrapUnifiedHandler,
  type ExtendedTuiContext
} from './tui-adapter.js'

// Shell CLI instance
export {
  getShellCli,
  executeUnifiedCommand,
  isUnifiedCommand,
  UNIFIED_COMMANDS,
  resetShellCli
} from './shell-commands.js'

// CLI adapter
export {
  createCliAction,
  createCliActionWithOptions,
  type CliActionConfig
} from './cli-adapter.js'

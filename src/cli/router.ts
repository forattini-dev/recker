import colors from '../utils/colors.js';
import { z } from 'zod';

// =============================================================================
// GLOBAL STATE & CONSTANTS
// =============================================================================

let globalPresets: string[] = [];

const KEYWORD_MAP: Record<string, string> = {
  verbose: '--verbose',
  quiet: '--quiet',
  json: '--json',
  help: '--help',
  version: '--version',
  secure: '--secure',
  implicit: '--implicit',
};

export function getGlobalPresets(): string[] {
  return globalPresets;
}

// =============================================================================
// SMART ARGUMENT SYSTEM
// =============================================================================

export type ArgumentType = 'string' | 'number' | 'url' | 'file' | 'path';

export interface SmartArgumentConfig {
  /** Argument type for validation/parsing */
  type?: ArgumentType;
  /** Description for help text */
  description?: string;
  /** Default value (makes argument optional) */
  default?: any;
  /** Enum values - restricts argument to specific values */
  enum?: string[];
  /** Example value for help text */
  example?: string;
  /** Custom value parser */
  parse?: (value: string) => any;
  /** Whether argument is variadic (accepts multiple values) */
  variadic?: boolean;
}

export interface ResolvedArgument {
  name: string;
  type: ArgumentType;
  description: string;
  defaultValue: any;
  enumValues: string[] | null;
  example: string | null;
  required: boolean;
  variadic: boolean;
  parse: ((value: string) => any) | null;
}

// =============================================================================
// SMART OPTION SYSTEM
// =============================================================================

export type OptionType = 'boolean' | 'string' | 'number';

export interface SmartOptionConfig {
  /** Option type - inferred from enum/default if not provided */
  type?: OptionType;
  /** Short flag override (auto-generated if not provided) */
  short?: string;
  /** Description for help text */
  description?: string;
  /** Default value */
  default?: any;
  /** Enum values for validation */
  enum?: string[];
  /** Whether option is required */
  required?: boolean;
  /** Example usage */
  example?: string;
  /** Custom value parser */
  parse?: (value: string) => any;
}

export interface ResolvedOption {
  name: string;
  type: OptionType;
  short: string | null;
  description: string;
  defaultValue: any;
  enumValues: string[] | null;
  required: boolean;
  example: string | null;
  parse: ((value: string) => any) | null;
}

// =============================================================================
// ZOD SCHEMAS FOR VALIDATION
// =============================================================================

/**
 * Zod schema for validating SmartOptionConfig.
 * Ensures consistent option definitions across all commands.
 */
export const SmartOptionConfigSchema = z.object({
  /** Option type - inferred from enum/default if not provided */
  type: z.enum(['boolean', 'string', 'number']).optional(),
  /** Short flag override (single letter, auto-generated if not provided) */
  short: z.string().length(1).regex(/^[a-zA-Z]$/).optional(),
  /** Description for help text */
  description: z.string().optional(),
  /** Default value */
  default: z.any().optional(),
  /** Enum values for validation */
  enum: z.array(z.string()).optional(),
  /** Whether option is required */
  required: z.boolean().optional(),
  /** Example usage */
  example: z.string().optional(),
  /** Custom value parser - function that transforms string value */
  parse: z.any().optional(), // Function type handled at runtime
}).strict();

/**
 * Zod schema for option definition tuple: [name, config | description]
 */
export const OptionDefinitionSchema = z.tuple([
  z.string().min(1).regex(/^[a-z][a-z0-9-]*$/i, 'Option name must be kebab-case'),
  z.union([
    SmartOptionConfigSchema,
    z.string(), // Just a description string
    z.undefined(),
  ]),
]);

/**
 * Zod schema for validating SmartArgumentConfig.
 * Ensures consistent argument definitions across all commands.
 */
export const SmartArgumentConfigSchema = z.object({
  /** Argument type for validation/parsing */
  type: z.enum(['string', 'number', 'url', 'file', 'path']).optional(),
  /** Description for help text */
  description: z.string().optional(),
  /** Default value (makes argument optional) */
  default: z.any().optional(),
  /** Enum values - restricts argument to specific values */
  enum: z.array(z.string()).optional(),
  /** Example value for help text */
  example: z.string().optional(),
  /** Custom value parser - function that transforms string value */
  parse: z.any().optional(), // Function type handled at runtime
  /** Whether argument is variadic */
  variadic: z.boolean().optional(),
}).strict();

/**
 * Validate argument config and return typed result.
 * Throws ZodError if validation fails.
 */
export function validateArgumentConfig(name: string, config: unknown): SmartArgumentConfig {
  if (config === undefined || typeof config === 'string') {
    return typeof config === 'string' ? { description: config } : {};
  }
  return SmartArgumentConfigSchema.parse(config);
}

/**
 * Validate option config and return typed result.
 * Throws ZodError if validation fails.
 */
export function validateOptionConfig(name: string, config: unknown): SmartOptionConfig {
  if (config === undefined || typeof config === 'string') {
    return typeof config === 'string' ? { description: config } : {};
  }
  return SmartOptionConfigSchema.parse(config);
}

// =============================================================================
// GLOBAL CLI OPTIONS
// =============================================================================

/**
 * Global options available to all commands.
 * These are automatically inherited by subcommands.
 */
export const GLOBAL_OPTIONS: Array<[string, SmartOptionConfig]> = [
  ['help', { type: 'boolean', short: 'h', description: 'Show help for this command' }],
  ['json', { type: 'boolean', short: 'j', description: 'Output as JSON' }],
  ['quiet', { type: 'boolean', short: 'q', description: 'Suppress non-essential output' }],
];

/**
 * Resolves smart option configurations into fully-specified options
 * with auto-generated short flags and conflict resolution.
 */
function resolveOptions(
  optionDefs: Array<[string, SmartOptionConfig | string | undefined]>
): ResolvedOption[] {
  const resolved: ResolvedOption[] = [];
  const usedShorts = new Set<string>();

  // Reserved shorts
  usedShorts.add('h'); // --help
  usedShorts.add('v'); // --version (common)

  for (const [name, config] of optionDefs) {
    const cfg: SmartOptionConfig = typeof config === 'string'
      ? { description: config }
      : config || {};

    // Determine type
    let type: OptionType = cfg.type || 'boolean';
    if (cfg.enum) type = 'string';
    if (cfg.default !== undefined) {
      if (typeof cfg.default === 'number') type = 'number';
      else if (typeof cfg.default === 'string') type = 'string';
      else if (typeof cfg.default === 'boolean') type = 'boolean';
    }

    // Generate short flag
    let short: string | null = null;

    if (cfg.short) {
      // Explicit short provided - always allow (override reservations)
      short = cfg.short;
      usedShorts.add(cfg.short);
    } else {
      // Auto-generate short from name letters
      for (const char of name.toLowerCase()) {
        if (char >= 'a' && char <= 'z' && !usedShorts.has(char)) {
          short = char;
          usedShorts.add(char);
          break;
        }
      }
    }

    resolved.push({
      name,
      type,
      short,
      description: cfg.description || '',
      defaultValue: cfg.default,
      enumValues: cfg.enum || null,
      required: cfg.required || false,
      example: cfg.example || null,
      parse: cfg.parse || null,
    });
  }

  return resolved;
}

/**
 * Resolves smart argument configurations into fully-specified arguments.
 * Handles required vs optional detection, variadic args, and type inference.
 */
function resolveArguments(
  argDefs: Array<[string, SmartArgumentConfig | string | undefined]>
): ResolvedArgument[] {
  const resolved: ResolvedArgument[] = [];

  for (const [name, config] of argDefs) {
    const cfg: SmartArgumentConfig = typeof config === 'string'
      ? { description: config }
      : config || {};

    // Parse name for required/optional/variadic markers
    // <arg> = required, [arg] = optional, [arg...] or <arg...> = variadic
    let cleanName = name;
    let required = true;
    let variadic = cfg.variadic || false;

    if (name.startsWith('[') && name.endsWith(']')) {
      cleanName = name.slice(1, -1);
      required = false;
    } else if (name.startsWith('<') && name.endsWith('>')) {
      cleanName = name.slice(1, -1);
      required = true;
    }

    if (cleanName.endsWith('...')) {
      cleanName = cleanName.slice(0, -3);
      variadic = true;
    }

    // Default value makes argument optional
    if (cfg.default !== undefined) {
      required = false;
    }

    // Determine type
    let type: ArgumentType = cfg.type || 'string';
    if (cfg.default !== undefined && typeof cfg.default === 'number') {
      type = 'number';
    }

    resolved.push({
      name: cleanName,
      type,
      description: cfg.description || '',
      defaultValue: cfg.default,
      enumValues: cfg.enum || null,
      example: cfg.example || null,
      required,
      variadic,
      parse: cfg.parse || null,
    });
  }

  return resolved;
}

// =============================================================================
// REK COMMAND FRAMEWORK
// =============================================================================

export type ActionFn = (...args: any[]) => Promise<void> | void;

export interface CommandOption {
  flags: string;
  description: string;
  defaultValue?: any;
}

/**
 * RekCommand - The unified CLI Framework for Recker.
 *
 * Features:
 * - Smart option parsing with multiple syntax support
 * - Auto-generated short flags with conflict resolution
 * - Flexible value formats: --opt val, --opt=val, opt=val, -o val, -o=val
 */
export class RekCommand {
  name: string;
  _description: string = '';
  subcommands: RekCommand[] = [];
  options: CommandOption[] = [];
  smartOptions: Array<[string, SmartOptionConfig | string | undefined]> = [];
  resolvedOptions: ResolvedOption[] = [];
  smartArguments: Array<[string, SmartArgumentConfig | string | undefined]> = [];
  resolvedArguments: ResolvedArgument[] = [];
  _action?: ActionFn;
  argsDefinition: string[] = [];
  parent?: RekCommand;
  aliases: string[] = [];
  helpTextAfter: string = '';
  _examples: Array<{ cmd: string; desc?: string }> = [];

  // Global options control
  private _inheritGlobalOptions: boolean = true;
  private _excludeGlobalOptions: string[] = [];

  // State for current execution
  currentArgs: string[] = [];
  parsedOpts: Record<string, any> = {};

  constructor(name: string = 'rek') {
    this.name = name;
  }

  /**
   * Control whether this command inherits global CLI options.
   * @param inherit - Whether to inherit global options (default: true)
   * @param exclude - Option names to exclude from inheritance
   */
  inheritGlobal(inherit: boolean = true, exclude: string[] = []): this {
    this._inheritGlobalOptions = inherit;
    this._excludeGlobalOptions = exclude;
    return this;
  }

  command(nameAndArgs: string): RekCommand {
    const parts = nameAndArgs.split(/ +/);
    const name = parts[0];
    const args = parts.slice(1);

    const cmd = new RekCommand(name);
    cmd.argsDefinition = args;
    cmd.parent = this;
    this.subcommands.push(cmd);
    return cmd;
  }

  description(d: string): this {
    this._description = d;
    return this;
  }

  alias(a: string): this {
    this.aliases.push(a);
    return this;
  }

  aliasesList(): string[] {
    return this.aliases;
  }

  /**
   * Define a positional argument with smart configuration.
   *
   * @example
   * // Required argument
   * .argument('<url>', 'URL to fetch')
   *
   * // Optional argument
   * .argument('[path]', 'Output path')
   *
   * // With full config
   * .argument('<url>', { type: 'url', description: 'URL to fetch', example: 'https://example.com' })
   *
   * // Variadic argument
   * .argument('[args...]', { description: 'Additional arguments', variadic: true })
   *
   * // Legacy format (still supported)
   * .argument('<name>', 'description', defaultValue)
   */
  argument(name: string, configOrDesc?: SmartArgumentConfig | string, defaultValue?: any): this {
    // Keep argsDefinition for backwards compatibility with dispatch()
    this.argsDefinition.push(name);

    // Build config
    let config: SmartArgumentConfig;
    if (typeof configOrDesc === 'string') {
      config = { description: configOrDesc, default: defaultValue };
    } else {
      config = configOrDesc || {};
      if (defaultValue !== undefined && config.default === undefined) {
        config.default = defaultValue;
      }
    }

    // Validate and store
    const validated = validateArgumentConfig(name, config);
    this.smartArguments.push([name, validated]);

    return this;
  }

  /**
   * Define an option with smart inference.
   *
   * @example
   * // Boolean option (short: 'a')
   * .option('all')
   *
   * // With description
   * .option('verbose', 'Show detailed output')
   *
   * // With full config
   * .option('format', { type: 'string', enum: ['json', 'csv'], short: 'f' })
   * .option('count', { type: 'number', default: 10 })
   *
   * // Legacy format (still supported)
   * .option('-j, --json', 'Output as JSON')
   */
  option(nameOrFlags: string, configOrDesc?: SmartOptionConfig | string, defaultValue?: any): this {
    // Legacy format detection: '-x, --xxx'
    if (nameOrFlags.includes(',') || nameOrFlags.startsWith('-')) {
      this.options.push({
        flags: nameOrFlags,
        description: typeof configOrDesc === 'string' ? configOrDesc : '',
        defaultValue
      });

      // Also register in smart options for unified parsing
      const match = nameOrFlags.match(/--(\w[\w-]*)/);
      if (match) {
        const name = match[1];
        const shortMatch = nameOrFlags.match(/-(\w),/);
        const short = shortMatch ? shortMatch[1] : undefined;

        // Check if it expects a value
        const hasValue = nameOrFlags.includes('<') || nameOrFlags.includes('[');

        this.smartOptions.push([name, {
          short,
          description: typeof configOrDesc === 'string' ? configOrDesc : '',
          type: hasValue ? 'string' : 'boolean',
          default: defaultValue,
        }]);
      }
    } else {
      // New smart format - only add to smartOptions, showHelp will use resolvedOptions
      this.smartOptions.push([nameOrFlags, configOrDesc as SmartOptionConfig | string | undefined]);
    }

    return this;
  }

  action(fn: ActionFn): this {
    this._action = fn;
    return this;
  }

  addHelpText(position: string, text: string | (() => string)): this {
    this.helpTextAfter = typeof text === 'function' ? text() : text;
    return this;
  }

  /**
   * Add usage example(s) to the command.
   *
   * @example
   * .example('rek live @twitch/shroud')
   * .example('rek live download @kick/xqc', 'Record a stream')
   * .example([
   *   { cmd: 'rek seo example.com', desc: 'Basic audit' },
   *   { cmd: 'rek seo example.com --json', desc: 'JSON output' },
   * ])
   */
  example(cmdOrExamples: string | Array<{ cmd: string; desc?: string }>, desc?: string): this {
    if (Array.isArray(cmdOrExamples)) {
      this._examples.push(...cmdOrExamples);
    } else {
      this._examples.push({ cmd: cmdOrExamples, desc });
    }
    return this;
  }

  showHelpAfterError(val: boolean): this { return this; }
  allowUnknownOption(val?: boolean): this { return this; }
  version(v: string): this { return this; }

  /**
   * Parse argv, normalize inputs, and dispatch to the correct command.
   */
  async parse(argv: string[] = process.argv) {
    const cleanedArgv: string[] = [];
    const presets: string[] = [];

    const [nodeBin, scriptPath, ...userArgs] = argv;
    cleanedArgv.push(nodeBin, scriptPath);

    for (const arg of userArgs) {
      if (arg.startsWith('+')) {
        presets.push(arg.slice(1));
        continue;
      }

      if (KEYWORD_MAP[arg]) {
        cleanedArgv.push(KEYWORD_MAP[arg]);
        continue;
      }

      cleanedArgv.push(arg);
    }

    globalPresets = presets;

    const args = cleanedArgv.slice(2).filter(a => a !== '--');

    try {
      await this.dispatch(args);
    } catch (err: any) {
      console.error(colors.red(`\nError: ${err.message}\n`));
      process.exit(1);
    }
  }

  async dispatch(args: string[]) {
    this.currentArgs = args;

    // Merge global options with command-specific options
    const allOptions: Array<[string, SmartOptionConfig | string | undefined]> = [];

    // Add global options first (if inheritance is enabled)
    if (this._inheritGlobalOptions) {
      for (const [name, config] of GLOBAL_OPTIONS) {
        // Skip excluded options and options already defined by the command
        if (this._excludeGlobalOptions.includes(name)) continue;
        if (this.smartOptions.some(([n]) => n === name)) continue;
        allOptions.push([name, config]);
      }
    }

    // Add command-specific options (override globals)
    allOptions.push(...this.smartOptions);

    // Resolve all options
    this.resolvedOptions = resolveOptions(allOptions);

    // Parse options from args
    this.parsedOpts = this.parseOptions(args);

    const firstArg = args[0];

    // Check subcommands FIRST
    const sub = this.subcommands.find(c => c.name === firstArg || c.aliases.includes(firstArg));

    if (sub) {
      await sub.dispatch(args.slice(1));
      return;
    }

    // Handle Help - check parsed option (supports: help, -h, --help, h)
    if (this.parsedOpts.help) {
      this.showHelp();
      return;
    }

    // Execute action
    if (this._action) {
      const positionalArgs = this.getPositionalArgs(args);

      if (this.name === 'rek') {
        await this._action(args, this.opts());
      } else {
        const params = [];

        let hasVariadic = false;
        let argCount = 0;

        for (const def of this.argsDefinition) {
          if (def.startsWith('[') && def.includes('...')) hasVariadic = true;
          else argCount++; // Count both required <arg> and optional [arg]
        }

        // Pass all defined arguments (required + optional)
        for (let i = 0; i < argCount; i++) {
          // For optional args, use the default from resolvedArguments if not provided
          if (i < positionalArgs.length) {
            params.push(positionalArgs[i]);
          } else if (this.resolvedArguments && this.resolvedArguments[i]) {
            params.push(this.resolvedArguments[i].defaultValue);
          } else {
            params.push(undefined);
          }
        }

        params.push(args);
        params.push(this);

        await this._action(...params);
      }
      return;
    }

    // No match
    if (args.length > 0) {
      console.error(colors.red(`Unknown command: '${args[0]}'`));
      console.log(colors.gray(`Run 'rek --help' for available commands.`));
      process.exit(1);
    }

    this.showHelp();
  }

  /**
   * Parse options from args using smart option definitions.
   *
   * Supports:
   * - --option (boolean)
   * - --option value (with value)
   * - --option=value (with =)
   * - -o (short boolean)
   * - -o value (short with value)
   * - -o=value (short with =)
   * - option (bare boolean)
   * - option=value (bare with =)
   * - o (bare short boolean - single char)
   * - o=value (bare short with =)
   */
  parseOptions(args: string[]): Record<string, any> {
    const opts: Record<string, any> = {};

    // Set defaults
    for (const opt of this.resolvedOptions) {
      if (opt.defaultValue !== undefined) {
        opts[this.camelCase(opt.name)] = opt.defaultValue;
      }
    }

    const processed = new Set<number>();

    for (let i = 0; i < args.length; i++) {
      if (processed.has(i)) continue;

      const arg = args[i];
      let matched = false;

      // --option=value or --option value or --option (boolean)
      if (arg.startsWith('--')) {
        const withoutDash = arg.slice(2);
        const eqIndex = withoutDash.indexOf('=');

        if (eqIndex !== -1) {
          // --option=value
          const name = withoutDash.slice(0, eqIndex);
          const value = withoutDash.slice(eqIndex + 1);
          const opt = this.findOption(name, null);
          if (opt) {
            opts[this.camelCase(opt.name)] = this.coerceValue(value, opt);
            matched = true;
          }
        } else {
          // --option or --option value
          const opt = this.findOption(withoutDash, null);
          if (opt) {
            if (opt.type === 'boolean') {
              opts[this.camelCase(opt.name)] = true;
            } else if (args[i + 1] && !this.looksLikeOption(args[i + 1])) {
              opts[this.camelCase(opt.name)] = this.coerceValue(args[i + 1], opt);
              processed.add(i + 1);
            } else {
              opts[this.camelCase(opt.name)] = true;
            }
            matched = true;
          }
        }

        // Handle --no-option
        if (!matched && withoutDash.startsWith('no-')) {
          const name = withoutDash.slice(3);
          const opt = this.findOption(name, null);
          if (opt && opt.type === 'boolean') {
            opts[this.camelCase(opt.name)] = false;
            matched = true;
          }
        }
      }

      // -o=value or -o value or -o (short)
      else if (arg.startsWith('-') && arg.length >= 2 && arg[1] !== '-') {
        const withoutDash = arg.slice(1);
        const eqIndex = withoutDash.indexOf('=');

        if (eqIndex !== -1) {
          // -o=value
          const short = withoutDash.slice(0, eqIndex);
          const value = withoutDash.slice(eqIndex + 1);
          const opt = this.findOption(null, short);
          if (opt) {
            opts[this.camelCase(opt.name)] = this.coerceValue(value, opt);
            matched = true;
          }
        } else {
          // -o or -o value
          const opt = this.findOption(null, withoutDash);
          if (opt) {
            if (opt.type === 'boolean') {
              opts[this.camelCase(opt.name)] = true;
            } else if (args[i + 1] && !this.looksLikeOption(args[i + 1])) {
              opts[this.camelCase(opt.name)] = this.coerceValue(args[i + 1], opt);
              processed.add(i + 1);
            } else {
              opts[this.camelCase(opt.name)] = true;
            }
            matched = true;
          }
        }
      }

      // Bare option: option=value or option (boolean) or o=value or o (short)
      else if (!arg.startsWith('-') && !arg.startsWith('@') && !arg.startsWith('+')) {
        const eqIndex = arg.indexOf('=');

        if (eqIndex !== -1) {
          // option=value or o=value
          const name = arg.slice(0, eqIndex);
          const value = arg.slice(eqIndex + 1);

          // Try long name first, then short
          let opt = this.findOption(name, null);
          if (!opt && name.length === 1) {
            opt = this.findOption(null, name);
          }

          if (opt) {
            opts[this.camelCase(opt.name)] = this.coerceValue(value, opt);
            matched = true;
          }
        } else {
          // Bare boolean: option or o
          let opt = this.findOption(arg, null);
          if (!opt && arg.length === 1) {
            opt = this.findOption(null, arg);
          }

          if (opt && opt.type === 'boolean') {
            opts[this.camelCase(opt.name)] = true;
            matched = true;
          }
        }
      }

      if (matched) {
        processed.add(i);
      }
    }

    return opts;
  }

  /**
   * Get positional arguments (non-option args)
   */
  getPositionalArgs(args: string[]): string[] {
    const positional: string[] = [];
    const processed = new Set<number>();

    // First pass: mark option values
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg.startsWith('--') || (arg.startsWith('-') && arg.length >= 2 && arg[1] !== '-')) {
        processed.add(i);

        // Check if next arg is a value for this option
        if (!arg.includes('=')) {
          const withoutDash = arg.startsWith('--') ? arg.slice(2) : arg.slice(1);
          const opt = arg.startsWith('--')
            ? this.findOption(withoutDash, null)
            : this.findOption(null, withoutDash);

          if (opt && opt.type !== 'boolean' && args[i + 1] && !this.looksLikeOption(args[i + 1])) {
            processed.add(i + 1);
          }
        }
        continue;
      }

      // Check if bare option
      const eqIndex = arg.indexOf('=');
      if (eqIndex !== -1) {
        const name = arg.slice(0, eqIndex);
        let opt = this.findOption(name, null);
        if (!opt && name.length === 1) opt = this.findOption(null, name);
        if (opt) {
          processed.add(i);
          continue;
        }
      } else {
        let opt = this.findOption(arg, null);
        if (!opt && arg.length === 1) opt = this.findOption(null, arg);
        if (opt && opt.type === 'boolean') {
          processed.add(i);
          continue;
        }
      }
    }

    // Second pass: collect positional
    for (let i = 0; i < args.length; i++) {
      if (!processed.has(i)) {
        positional.push(args[i]);
      }
    }

    return positional;
  }

  /**
   * Find option by long name or short flag
   */
  findOption(name: string | null, short: string | null): ResolvedOption | null {
    for (const opt of this.resolvedOptions) {
      if (name && (opt.name === name || opt.name === this.kebabCase(name))) {
        return opt;
      }
      if (short && opt.short === short) {
        return opt;
      }
    }
    return null;
  }

  /**
   * Check if arg looks like an option (starts with - or is a known option name)
   */
  looksLikeOption(arg: string): boolean {
    if (arg.startsWith('-')) return true;
    if (arg.startsWith('@') || arg.startsWith('+')) return false;

    // Check if it's a bare option name
    const eqIndex = arg.indexOf('=');
    const name = eqIndex !== -1 ? arg.slice(0, eqIndex) : arg;

    let opt = this.findOption(name, null);
    if (!opt && name.length === 1) opt = this.findOption(null, name);

    return opt !== null;
  }

  /**
   * Coerce string value to option's type
   */
  coerceValue(value: string, opt: ResolvedOption): any {
    if (opt.type === 'number') {
      return parseFloat(value);
    }
    if (opt.type === 'boolean') {
      return value === 'true' || value === '1' || value === 'yes';
    }
    return value;
  }

  /**
   * Convert kebab-case to camelCase
   */
  camelCase(str: string): string {
    return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }

  /**
   * Convert camelCase to kebab-case
   */
  kebabCase(str: string): string {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  /**
   * Get parsed options (for action handlers)
   */
  opts(): Record<string, any> {
    return this.parsedOpts;
  }

  help() {
    this.showHelp();
  }

  showHelp() {
    // Resolve options if not already done
    if (this.resolvedOptions.length === 0 && this.smartOptions.length > 0) {
      const allOptions: Array<[string, SmartOptionConfig | string | undefined]> = [];
      if (this._inheritGlobalOptions) {
        for (const [name, config] of GLOBAL_OPTIONS) {
          if (this._excludeGlobalOptions.includes(name)) continue;
          if (this.smartOptions.some(([n]) => n === name)) continue;
          allOptions.push([name, config]);
        }
      }
      allOptions.push(...this.smartOptions);
      this.resolvedOptions = resolveOptions(allOptions);
    }

    // Resolve arguments if not already done
    if (this.resolvedArguments.length === 0 && this.smartArguments.length > 0) {
      this.resolvedArguments = resolveArguments(this.smartArguments);
    }

    console.log(`
${colors.bold(this.name)} - ${this._description}`);

    console.log(`
${colors.yellow('Usage:')}
  ${this.name} ${this.argsDefinition.join(' ')} [options] [command]`);

    // Compile examples from all sources: command, arguments, options
    const allExamples: Array<{ cmd: string; desc?: string }> = [...this._examples];

    // Build command prefix for auto-generated examples
    let cmdPrefix = '';
    if (this.parent && this.parent.name !== 'rek') {
      cmdPrefix = `rek ${this.parent.name} ${this.name}`;
    } else {
      cmdPrefix = `rek ${this.name}`;
    }

    // Generate examples from arguments with examples
    for (const arg of this.resolvedArguments) {
      if (arg.example && !arg.variadic) {
        // Check if we already have an example using this argument
        const hasExample = allExamples.some(ex => ex.cmd.includes(arg.example!));
        if (!hasExample) {
          allExamples.push({ cmd: `${cmdPrefix} ${arg.example}` });
        }
      }
    }

    // Generate examples from options with examples
    for (const opt of this.resolvedOptions) {
      if (opt.example) {
        // Check if we already have an example using this option
        const hasExample = allExamples.some(ex =>
          ex.cmd.includes(`--${opt.name}`) || ex.cmd.includes(`-${opt.short}`)
        );
        if (!hasExample) {
          const optSyntax = opt.type === 'boolean'
            ? `--${opt.name}`
            : `--${opt.name}=${opt.example}`;
          // Use first argument example or placeholder
          const argPart = this.resolvedArguments[0]?.example || '<url>';
          allExamples.push({ cmd: `${cmdPrefix} ${argPart} ${optSyntax}` });
        }
      }
    }

    // Show compiled examples
    if (allExamples.length > 0) {
      console.log(`
${colors.yellow('Examples:')}`);
      for (const ex of allExamples) {
        if (ex.desc) {
          console.log(`  ${colors.green(ex.cmd)}`);
          console.log(`    ${colors.gray(ex.desc)}`);
        } else {
          console.log(`  ${colors.green(ex.cmd)}`);
        }
      }
    }

    // Show arguments section with descriptions
    if (this.resolvedArguments.length > 0) {
      console.log(`
${colors.yellow('Arguments:')}`);
      for (const arg of this.resolvedArguments) {
        const marker = arg.required ? '<' : '[';
        const endMarker = arg.required ? '>' : ']';
        const variadicSuffix = arg.variadic ? '...' : '';
        const argName = `${marker}${arg.name}${variadicSuffix}${endMarker}`;

        let line = `  ${colors.cyan(argName.padEnd(16))} ${arg.description}`;

        // Add metadata
        const meta: string[] = [];
        if (arg.enumValues) meta.push(arg.enumValues.join('|'));
        else if (arg.type !== 'string') meta.push(`type: ${arg.type}`);
        if (arg.defaultValue !== undefined) meta.push(`default: ${JSON.stringify(arg.defaultValue)}`);
        if (arg.example && !arg.enumValues) meta.push(`e.g. ${arg.example}`);

        if (meta.length > 0) {
          line += ` ${colors.gray(`(${meta.join(', ')})`)}`;
        }

        console.log(line);
      }
    }

    if (this.subcommands.length > 0) {
      console.log(`
${colors.yellow('Commands:')}`);
      for (const c of this.subcommands) {
        console.log(`  ${colors.cyan(c.name.padEnd(12))} ${c._description}`);
      }
    }

    // Combine legacy options and resolved smart options
    const hasOptions = this.options.length > 0 || this.resolvedOptions.length > 0;
    if (hasOptions) {
      console.log(`
${colors.yellow('Options:')}`);

      // Legacy format options
      for (const o of this.options) {
        console.log(`  ${colors.green(o.flags.padEnd(24))} ${o.description}`);
      }

      // Smart format options - show all syntax variants
      for (const opt of this.resolvedOptions) {
        // For enum options, show values instead of <val>
        let typeIndicator = '';
        if (opt.type !== 'boolean') {
          typeIndicator = opt.enumValues
            ? `={${opt.enumValues.join('|')}}`
            : '=<val>';
        }

        // Build all variants: name, -s, --name
        const parts: string[] = [];
        parts.push(opt.name + typeIndicator);           // bare: json or format={a|b}
        if (opt.short) parts.push(`-${opt.short}`);     // short: -j
        parts.push(`--${opt.name}`);                    // long: --json

        const flags = parts.join(', ');

        // Build description with default
        let desc = opt.description;
        if (opt.defaultValue !== undefined && !opt.enumValues) {
          desc += ` ${colors.gray(`(default: ${opt.defaultValue})`)}`;
        }

        console.log(`  ${colors.green(flags.padEnd(28))} ${desc}`);
      }
    }

    if (this.helpTextAfter) {
      console.log(this.helpTextAfter);
    }

    process.exit(0);
  }
}

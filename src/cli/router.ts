import colors from '../utils/colors.js';

// =============================================================================
// GLOBAL STATE & CONSTANTS
// =============================================================================

// Stores presets extracted from argv (e.g., +json, +local)
// This allows commands to access them regardless of where they appeared in the command line.
let globalPresets: string[] = [];

const KEYWORD_MAP: Record<string, string> = {
  verbose: '--verbose',
  quiet: '--quiet',
  json: '--json',
  help: '--help',
  version: '--version',
  secure: '--secure',
  implicit: '--implicit',
  live: '--live'
};

/**
 * Get the presets extracted globally during command parsing.
 * Used by helper functions to apply configuration.
 */
export function getGlobalPresets(): string[] {
  return globalPresets;
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
 * Handles:
 * 1. Smart Parsing (Keywords, Shorthands, Presets)
 * 2. Routing (Subcommands)
 * 3. Help Generation
 * 4. Execution
 */
export class RekCommand {
  name: string;
  _description: string = '';
  subcommands: RekCommand[] = [];
  options: CommandOption[] = [];
  _action?: ActionFn;
  argsDefinition: string[] = [];
  parent?: RekCommand;
  aliases: string[] = [];
  helpTextAfter: string = '';
  
  // State for current execution
  currentArgs: string[] = [];

  constructor(name: string = 'rek') {
    this.name = name;
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

  argument(name: string, desc?: string, defaultValue?: any): this {
    this.argsDefinition.push(name);
    return this;
  }

  option(flags: string, description: string, defaultValue?: any): this {
    this.options.push({ flags, description, defaultValue });
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

  showHelpAfterError(val: boolean): this { return this; }
  allowUnknownOption(val?: boolean): this { return this; }
  version(v: string): this { return this; }

  /**
   * Parse argv, normalize inputs, and dispatch to the correct command.
   */
  async parse(argv: string[] = process.argv) {
    // 1. Pre-processing (The "Turbo" Logic)
    const cleanedArgv: string[] = [];
    const presets: string[] = [];

    // Keep node binary and script path
    const [nodeBin, scriptPath, ...userArgs] = argv;
    cleanedArgv.push(nodeBin, scriptPath);

    for (const arg of userArgs) {
      // Extract Presets (+name)
      if (arg.startsWith('+')) {
        presets.push(arg.slice(1));
        continue; 
      }

      // Expand Keywords (verbose -> --verbose)
      if (KEYWORD_MAP[arg]) {
        cleanedArgv.push(KEYWORD_MAP[arg]);
        continue;
      }

      cleanedArgv.push(arg);
    }

    // Update global state
    globalPresets = presets;
    
    // 2. Routing
    // Filter out '--' separator to avoid routing errors
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

    // Handle Help
    if (args.includes('--help') || args.includes('-h')) {
      this.showHelp();
      return;
    }

    const firstArg = args[0];
    
    // Check subcommands
    const sub = this.subcommands.find(c => c.name === firstArg || c.aliases.includes(firstArg));
    
    if (sub) {
      await sub.dispatch(args.slice(1));
      return;
    }

    // Check Root Action
    if (this._action) {
      const positionalArgs = args.filter(a => !a.startsWith('-') && a !== '--');
      
      // Construct arguments for the action function
      // Compatibility with existing action signatures
      
      // Special handling for Root Command which expects (args, options)
      if (this.name === 'rek') {
          await this._action(args, this.opts());
      } else {
          // Subcommand signature: (p1, p2..., [rest], cmdObj)
          const params = [];
          
          // Heuristic: If argsDefinition has named args (not just [...]), pass them individually
          // Note: our current codebase uses <url> [args...] pattern mostly
          
          let hasVariadic = false;
          let reqArgsCount = 0;
          
          for (const def of this.argsDefinition) {
              if (def.startsWith('[') && def.includes('...')) hasVariadic = true;
              else if (def.startsWith('<')) reqArgsCount++;
          }

          // Push required/positional args
          for (let i = 0; i < reqArgsCount; i++) {
              params.push(positionalArgs[i]);
          }

          // Push variadic args array (if defined or implicitly supported)
          // We pass 'args' (all remaining args) as the variadic list
          params.push(args); 
          
          // Push command object (this)
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

  opts() {
    const opts: Record<string, any> = {};
    for (const arg of this.currentArgs) {
       if (arg.startsWith('--')) {
         const parts = arg.slice(2).split('=');
         const key = parts[0];
         const val = parts.length > 1 ? parts.slice(1).join('=') : true;
         
         if (key.startsWith('no-')) {
            opts[key.slice(3)] = false;
         } else {
            opts[key] = val;
         }
       } else if (arg.startsWith('-')) {
         const flag = arg.slice(1);
         // Simple short flag support
         const optionDef = this.options.find(o => o.flags.includes(`-${flag},`));
         if (optionDef) {
            const longName = optionDef.flags.split(',')[1].trim().replace('--', '');
            opts[longName] = true;
         } else {
            opts[flag] = true;
         }
       }
    }
    return opts;
  }

  help() {
    this.showHelp();
  }

  showHelp() {
    console.log(`
${colors.bold(this.name)} - ${this._description}`);

    console.log(`
${colors.yellow('Usage:')} 
  ${this.name} ${this.argsDefinition.join(' ')} [options] [command]`);

    if (this.subcommands.length > 0) {
      console.log(`
${colors.yellow('Commands:')}`);
      for (const c of this.subcommands) {
        console.log(`  ${colors.cyan(c.name.padEnd(12))} ${c._description}`);
      }
    }

    if (this.options.length > 0) {
      console.log(`
${colors.yellow('Options:')}`);
      for (const o of this.options) {
        console.log(`  ${colors.green(o.flags.padEnd(20))} ${o.description}`);
      }
    }

    if (this.helpTextAfter) {
      console.log(this.helpTextAfter);
    }
    
    process.exit(0);
  }
}
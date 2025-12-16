import colors from '../../utils/colors.js';
import { CommandSchema } from './types.js';

/**
 * Generates formatted help text from a command schema
 */
export function generateHelp(schema: CommandSchema): string {
  const lines: string[] = [];

  // Description block
  lines.push('');
  lines.push(`${colors.bold(colors.blue('What it does:'))}`);
  
  // Format description with indentation
  const descLines = schema.description.split('\n');
  descLines.forEach(line => lines.push(`  ${line.trim()}`));
  lines.push('');

  // Usage / Examples
  if (schema.examples && schema.examples.length > 0) {
    lines.push(`${colors.bold(colors.yellow('Examples:'))}`);
    schema.examples.forEach(ex => {
      const cmdPart = `  $ ${ex.cmd}`;
      // Calculate padding for alignment if possible, otherwise simple spacing
      const padding = Math.max(0, 60 - cmdPart.length);
      const spaces = ' '.repeat(padding);
      lines.push(`${colors.green(cmdPart)}${spaces}${colors.gray(`# ${ex.desc}`)}`);
    });
    lines.push('');
  }

  // Parameters (key=value)
  if (schema.params && Object.keys(schema.params).length > 0) {
    lines.push(`${colors.bold(colors.yellow('Parameters:'))}`);
    
    for (const [name, def] of Object.entries(schema.params)) {
      if (def.hidden) continue;
      
      let syntax = `${name}=VAL`;
      if (def.type !== 'string') syntax = `${name}:=VAL`;
      
      const typeLabel = def.type === 'string' ? '' : ` (${def.type})`;
      const defaultLabel = def.default !== undefined ? ` (default: ${def.default})` : '';
      const choicesLabel = def.choices ? ` [${def.choices.join('|')}]` : '';
      const requiredLabel = def.required ? colors.red(' [required]') : '';
      
      lines.push(`  ${colors.cyan(syntax.padEnd(25))} ${def.description}${typeLabel}${defaultLabel}${choicesLabel}${requiredLabel}`);
    }
    lines.push('');
  }

  // Options / Flags
  if (schema.flags && Object.keys(schema.flags).length > 0) {
    lines.push(`${colors.bold(colors.yellow('Options:'))}`);
    for (const [name, def] of Object.entries(schema.flags)) {
      const aliasPart = def.alias ? `-${def.alias}, ` : '    ';
      const flagStr = `${aliasPart}--${name}`;
      
      lines.push(`  ${colors.cyan(flagStr.padEnd(25))} ${def.description}`);
    }
    lines.push('');
  }

  // Keywords
  if (schema.keywords && Object.keys(schema.keywords).length > 0) {
    lines.push(`${colors.bold(colors.yellow('Keywords:'))}`);
    for (const [name, def] of Object.entries(schema.keywords)) {
      lines.push(`  ${colors.cyan(name.padEnd(25))} ${def.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

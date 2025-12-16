import { CommandSchema, ParsedArgs, ParamDef } from './types.js';

/**
 * Parses raw CLI arguments according to Recker conventions
 */
export class RekArgs {
  /**
   * Parse an array of string arguments based on a schema
   */
  static parse(rawArgs: string[], schema?: CommandSchema): ParsedArgs {
    const result: ParsedArgs = {
      args: [],
      data: {},
      headers: {},
      options: {},
      presets: [],
      errors: []
    };

    // Initialize defaults from schema
    if (schema) {
      if (schema.params) {
        for (const [key, def] of Object.entries(schema.params)) {
          if (def.default !== undefined) {
            result.data[key] = def.default;
          }
        }
      }
      if (schema.flags) {
        for (const [key, def] of Object.entries(schema.flags)) {
          if (def.default !== undefined) {
            result.options[key] = def.default;
          }
        }
      }
    }

    // Processing loop
    for (let i = 0; i < rawArgs.length; i++) {
      const arg = rawArgs[i];

      // 1. Standard Flags (--flag, -f)
      if (arg.startsWith('-')) {
        const isLong = arg.startsWith('--');
        const flagName = isLong ? arg.slice(2) : arg.slice(1);
        
        // Handle --flag=value syntax if needed, but Recker mostly uses kv-pairs.
        // For now, treat flags as boolean switches.
        // We can map aliases if schema is present.
        let canonicalName = flagName;
        
        if (schema?.flags) {
          // Resolve alias
          if (!isLong) {
            const found = Object.entries(schema.flags).find(([k, v]) => v.alias === flagName);
            if (found) canonicalName = found[0];
          }
          
          if (schema.flags[canonicalName]) {
             result.options[canonicalName] = true;
             continue;
          }
        }
        
        // Store unknown flags anyway
        result.options[canonicalName] = true;
        continue;
      }

      // 2. HTTP Headers (Key:Value)
      // Must contain ':', not ':=', not start with http/https/ws/udp (protocols)
      if (arg.includes(':') && !arg.includes(':=') && 
          !arg.match(/^(http|https|ws|wss|udp|ftp|sftp):\/\//)) {
        const [key, ...rest] = arg.split(':');
        const value = rest.join(':').trim(); // Handle values with colons
        result.headers[key.trim()] = value;
        continue;
      }

      // 3. Typed Parameters (key:=value)
      if (arg.includes(':=')) {
        const [key, ...rest] = arg.split(':=');
        const valStr = rest.join(':=');
        const cleanKey = key.trim();
        
        // Parse value
        let value: any = valStr;
        if (valStr === 'true') value = true;
        else if (valStr === 'false') value = false;
        else if (valStr === 'null') value = null;
        else if (!isNaN(Number(valStr)) && valStr.trim() !== '') value = Number(valStr);
        
        // Validate against schema if exists
        if (schema?.params && schema.params[cleanKey]) {
           // Enforce choices if defined
           const def = schema.params[cleanKey];
           if (def.choices && !def.choices.includes(String(value))) {
             result.errors.push(`Invalid value for '${cleanKey}': '${value}'. Allowed: ${def.choices.join(', ')}`);
           }
        }

        result.data[cleanKey] = value;
        continue;
      }

      // 4. String Parameters (key=value)
      if (arg.includes('=')) {
        const [key, ...rest] = arg.split('=');
        const value = rest.join('='); // Handle values with equals
        const cleanKey = key.trim();
        
        // Remove surrounding quotes if present
        let cleanValue = value;
        if ((cleanValue.startsWith('"') && cleanValue.endsWith('"')) || 
            (cleanValue.startsWith("'") && cleanValue.endsWith("'"))) {
          cleanValue = cleanValue.slice(1, -1);
        }

        // Validate against schema if exists
        if (schema?.params && schema.params[cleanKey]) {
           const def = schema.params[cleanKey];
           
           // If schema says it's a number/bool but user used '=', try to cast
           if (def.type === 'number') {
             const num = Number(cleanValue);
             if (isNaN(num)) result.errors.push(`Expected number for '${cleanKey}', got '${cleanValue}'`);
             else result.data[cleanKey] = num;
           } else if (def.type === 'boolean') {
             if (cleanValue === 'true') result.data[cleanKey] = true;
             else if (cleanValue === 'false') result.data[cleanKey] = false;
             else result.errors.push(`Expected boolean for '${cleanKey}', got '${cleanValue}'`);
           } else {
             // String or JSON
             if (def.choices && !def.choices.includes(cleanValue)) {
                result.errors.push(`Invalid value for '${cleanKey}': '${cleanValue}'. Allowed: ${def.choices.join(', ')}`);
             } else {
                result.data[cleanKey] = cleanValue;
             }
           }
        } else {
          // No schema, just store as string
          result.data[cleanKey] = cleanValue;
        }
        continue;
      }

      // 5. Presets (+name)
      if (arg.startsWith('+')) {
        result.presets.push(arg.slice(1));
        continue;
      }

      // 6. Keywords (Standalone words acting as flags)
      if (schema?.keywords && schema.keywords[arg]) {
        const def = schema.keywords[arg];
        const targetKey = def.mapTo || arg;
        result.data[targetKey] = true;
        continue;
      }

      // 6. Positional Arguments
      // Anything that didn't match above rules
      result.args.push(arg);
    }

    // Post-validation: Check required parameters
    if (schema) {
      // Check positional requirements
      if (schema.positional) {
        schema.positional.forEach((pos, index) => {
          if (pos.required && result.args[index] === undefined) {
            result.errors.push(`Missing required argument: <${pos.name}>`);
          }
        });
      }

      // Check named param requirements
      if (schema.params) {
        for (const [key, def] of Object.entries(schema.params)) {
          if (def.required && result.data[key] === undefined) {
             result.errors.push(`Missing required parameter: ${key}=value`);
          }
        }
      }
    }

    return result;
  }
}

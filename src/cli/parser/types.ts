
export type ParamType = 'string' | 'number' | 'boolean' | 'json';

export interface ParamDef {
  type: ParamType;
  description: string;
  default?: any;
  required?: boolean;
  choices?: string[]; // Enum validation e.g. ['all', 'links', 'security']
  hidden?: boolean;
}

/**
 * Definition schema for a Recker command
 */
export interface CommandSchema {
  name: string;
  description: string;
  
  // Positional arguments (e.g., <url>)
  positional?: {
    name: string;
    description: string;
    required?: boolean;
    type?: ParamType;
  }[];

  // Key-value parameters (e.g., depth=5, mode=stress)
  params?: Record<string, ParamDef>;

  // Standard flags (e.g., --json, -v)
  flags?: Record<string, {
    description: string;
    alias?: string; // Short alias 'v' for '-v'
    default?: boolean;
  }>;

  // Keywords (e.g., "seo", "silent") that act as boolean flags when present as raw arguments
  keywords?: Record<string, {
    description: string;
    mapTo?: string; // Optional: map "seo" keyword to data.isSeo (default uses keyword name)
  }>;

  examples?: {
    cmd: string;
    desc: string;
  }[];
}

/**
 * The result of parsing arguments
 */
export interface ParsedArgs {
  // Positional arguments
  args: (string | number | boolean)[];
  
  // Data from key=value and key:=typed
  data: Record<string, any>;
  
  // Headers from Key:Value
  headers: Record<string, string>;
  
  // Standard flags
  options: Record<string, boolean | string>;

  // Presets detected (arguments starting with +)
  presets: string[];

  // Errors encountered during parsing (if strict mode is off)
  errors: string[];
}

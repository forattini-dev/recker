/**
 * 🎨 Recker CLI Theme
 *
 * Unified theming system for the Recker CLI. Uses the orange palette
 * as the primary brand color with semantic color assignments.
 *
 * This file exports:
 * - `reckerFormatter` - Formatter for cli-args-parser theming
 * - `theme` - Semantic color functions for direct use
 * - Color constants for custom usage
 *
 * Orange Palette (ANSI 256):
 * - 208: Bright orange  (#FF8700) — primary
 * - 214: Light orange   (#FFAF00) — accent
 * - 202: Dark orange    (#FF5F00) — emphasis
 * - 166: Burnt orange   (#D75F00) — subtle
 */

import colors, {
  c,
  compose,
  dim,
  gray,
  red,
  green,
  orange,
  lightOrange,
  darkOrange,
  burntOrange,
  lightGray,
  mediumGray,
} from '../utils/colors.js';

// Type for color function
type ColorFn = (s: string) => string;

/**
 * Formatter type for cli-args-parser theming.
 * Maps token types to styling functions.
 */
export type Formatter = Partial<Record<string, ColorFn>>;

// =============================================================================
// SEMANTIC THEME FUNCTIONS
// =============================================================================

/**
 * Semantic theme object for direct use in code.
 * Maps UI concepts to colors for consistent styling.
 *
 * Uses tuiuiu.js/colors chainable API (c.bold.orange) and compose().
 */
export const theme = {
  // Identity
  /** Program name, logo text */
  brand: (s: string) => c.bold(orange(s)),
  /** Version numbers */
  version: lightOrange,

  // Structure
  /** Section headers (Usage:, Options:, etc.) */
  header: (s: string) => c.bold.white(s),
  /** Primary text content */
  text: lightGray,
  /** Muted/secondary text */
  muted: mediumGray,
  /** Dimmed text (defaults, metadata) */
  dimmed: (s: string) => c.dim.gray(s),

  // Commands & Options
  /** Command names */
  command: orange,
  /** Command aliases */
  alias: gray,
  /** Option flags (--verbose, -v) */
  flag: lightOrange,
  /** Option/argument types (<string>, <number>) */
  type: burntOrange,
  /** Positional argument names */
  positional: darkOrange,
  /** Default values */
  default: (s: string) => c.dim.gray(s),

  // Status
  /** Success messages */
  success: green,
  /** Error messages */
  error: red,
  /** Warning messages */
  warning: (s: string) => c.bold(orange(s)),

  // Status badges (with backgrounds!)
  /** Success badge */
  successBadge: (s: string) => c.bgGreen.black.bold(` ${s} `),
  /** Error badge */
  errorBadge: (s: string) => c.bgRed.white.bold(` ${s} `),
  /** Warning badge */
  warningBadge: (s: string) => c.bgYellow.black.bold(` ${s} `),
  /** Info badge */
  infoBadge: (s: string) => c.bgBlue.white.bold(` ${s} `),

  // Examples
  /** Example commands */
  example: green,
  /** Example descriptions */
  exampleDesc: gray,

  // Special
  /** Presets (@github, @openai) */
  preset: (s: string) => c.bold(lightOrange(s)),
  /** URLs and paths */
  url: lightOrange,
  /** HTTP methods (GET, POST) */
  method: (s: string) => c.bold(orange(s)),
  /** Status codes */
  statusOk: green,
  statusError: red,
  statusRedirect: lightOrange,
};

// =============================================================================
// CLI-ARGS-PARSER FORMATTER
// =============================================================================

/**
 * Formatter configuration for cli-args-parser.
 * Maps token types to styling functions.
 *
 * Uses tuiuiu.js/colors chainable API for cleaner syntax.
 *
 * @example
 * ```typescript
 * import { createCLI } from 'cli-args-parser'
 * import { reckerFormatter } from './theme.js'
 *
 * const cli = createCLI({
 *   name: 'rek',
 *   formatter: reckerFormatter,
 *   // ...
 * })
 * ```
 */
export const reckerFormatter: Formatter = {
  // Headers & structure
  'section-header': s => c.bold.white(s),

  // Identity
  'program-name': s => c.bold(orange(s)),
  'version': s => lightOrange(s),
  'description': s => lightGray(s),

  // Commands
  'command-name': s => orange(s),
  'command-alias': s => gray(s),
  'command-description': s => lightGray(s),

  // Options
  'option-flag': s => lightOrange(s),
  'option-type': s => burntOrange(s),
  'option-default': s => c.dim.gray(s),
  'option-description': s => lightGray(s),

  // Positionals
  'positional-name': s => darkOrange(s),
  'positional-optional': s => gray(s),

  // Usage
  'usage-text': s => lightGray(s),

  // Errors (with background badge for header!)
  'error-header': s => c.bgRed.white.bold(` ${s} `),
  'error-message': s => red(s),
  'error-option': s => orange(s),
  'error-value': s => lightOrange(s),
  'error-command': s => orange(s),
  'error-bullet': s => red(s),

  // Generic
  'text': s => s,
  'newline': s => s,
  'indent': s => s,
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Format a URL with appropriate coloring.
 */
export function formatUrl(url: string): string {
  // Highlight protocol
  const match = url.match(/^(https?|wss?|ftp|sftp):\/\//);
  if (match) {
    const protocol = match[1];
    const rest = url.slice(match[0].length);
    return `${gray(protocol + '://')}${lightOrange(rest)}`;
  }
  return lightOrange(url);
}

/**
 * Format an HTTP status code with semantic coloring.
 */
export function formatStatus(status: number): string {
  if (status >= 200 && status < 300) {
    return green(String(status));
  } else if (status >= 300 && status < 400) {
    return lightOrange(String(status));
  } else if (status >= 400) {
    return red(String(status));
  }
  return gray(String(status));
}

/**
 * Format an HTTP method with semantic coloring.
 */
export function formatMethod(method: string): string {
  const upper = method.toUpperCase();
  switch (upper) {
    case 'GET':
      return green(upper);
    case 'POST':
      return c.bold(orange(upper));
    case 'PUT':
    case 'PATCH':
      return lightOrange(upper);
    case 'DELETE':
      return red(upper);
    default:
      return gray(upper);
  }
}

/**
 * Format an HTTP method as a badge with background.
 */
export function formatMethodBadge(method: string): string {
  const upper = method.toUpperCase();
  const text = ` ${upper} `;
  switch (upper) {
    case 'GET':
      return c.bgGreen.black.bold(text);
    case 'POST':
      return c.bgYellow.black.bold(text);
    case 'PUT':
    case 'PATCH':
      return c.bgCyan.black.bold(text);
    case 'DELETE':
      return c.bgRed.white.bold(text);
    default:
      return c.bgGray.white(text);
  }
}

/**
 * Format timing information (ms).
 */
export function formatTiming(ms: number): string {
  if (ms < 100) {
    return green(`${ms}ms`);
  } else if (ms < 500) {
    return lightOrange(`${ms}ms`);
  } else if (ms < 1000) {
    return orange(`${ms}ms`);
  } else {
    return red(`${(ms / 1000).toFixed(2)}s`);
  }
}

/**
 * Format a preset name.
 */
export function formatPreset(preset: string): string {
  return c.bold(lightOrange(`@${preset}`));
}

/**
 * Create a banner line with centered text.
 */
export function banner(text: string, width: number = 60): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(padding) + c.bold(orange(text));
}

/**
 * Format an HTTP status code as a badge with background.
 */
export function formatStatusBadge(status: number): string {
  const text = ` ${status} `;
  if (status >= 200 && status < 300) {
    return c.bgGreen.black.bold(text);
  } else if (status >= 300 && status < 400) {
    return c.bgYellow.black.bold(text);
  } else if (status >= 400) {
    return c.bgRed.white.bold(text);
  }
  return c.bgGray.white(text);
}

// Re-export colors for convenience
export { colors };
export default theme;

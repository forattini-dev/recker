/**
 * Minimal terminal colors utility (picocolors replacement)
 *
 * Zero dependencies, ~50 lines. Supports:
 * - Color detection (NO_COLOR, TERM, CI, TTY)
 * - 8 colors + bold + reset
 * - Nestable: colors.bold(colors.red('text'))
 */

// Detect if colors should be enabled
const hasColors = (() => {
  // Respect NO_COLOR standard (https://no-color.org/)
  if ('NO_COLOR' in process.env) return false;

  // Force color with FORCE_COLOR
  if ('FORCE_COLOR' in process.env) return true;

  // Dumb terminal
  if (process.env.TERM === 'dumb') return false;

  // Check if stdout is a TTY
  if (process.stdout?.isTTY) return true;

  // CI environments usually support colors
  if (process.env.CI) return true;

  return false;
})();

// ANSI escape code wrapper
const code = (open: number, close: number) => {
  if (!hasColors) return (s: string | number) => String(s);

  const openCode = `\x1b[${open}m`;
  const closeCode = `\x1b[${close}m`;

  return (s: string | number): string => {
    const str = String(s);
    // Handle nested codes by replacing inner close with open+close
    const closeRe = new RegExp(`\\x1b\\[${close}m`, 'g');
    return openCode + str.replace(closeRe, openCode) + closeCode;
  };
};

// Styles
export const reset = hasColors ? (s: string) => `\x1b[0m${s}\x1b[0m` : (s: string) => s;
export const bold = code(1, 22);

// Colors (foreground)
export const black = code(30, 39);
export const red = code(31, 39);
export const green = code(32, 39);
export const yellow = code(33, 39);
export const blue = code(34, 39);
export const magenta = code(35, 39);
export const cyan = code(36, 39);
export const white = code(37, 39);
export const gray = code(90, 39);

// Background colors
export const bgBlack = code(40, 49);
export const bgRed = code(41, 49);
export const bgGreen = code(42, 49);
export const bgYellow = code(43, 49);
export const bgBlue = code(44, 49);
export const bgMagenta = code(45, 49);
export const bgCyan = code(46, 49);
export const bgWhite = code(47, 49);

// Default export matching picocolors API
const colors = {
  reset,
  bold,
  black,
  red,
  green,
  yellow,
  blue,
  magenta,
  cyan,
  white,
  gray,
  // Background
  bgBlack,
  bgRed,
  bgGreen,
  bgYellow,
  bgBlue,
  bgMagenta,
  bgCyan,
  bgWhite,
  // Aliases
  grey: gray,
};

export default colors;

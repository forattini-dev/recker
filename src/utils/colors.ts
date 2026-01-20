/**
 * Colors Module - Re-exports from tuiuiu.js/colors
 *
 * Uses tuiuiu.js/colors for terminal styling with:
 * - Simple functions: red('text'), bold('text')
 * - Chainable API: c.red.bold('text')
 * - Template literals: tpl`{red Error:} message`
 * - Compose: compose(red, bold)('text')
 *
 * 🎨 Recker Orange Palette (ANSI 256):
 * - 208: Bright orange  (#FF8700) — primary
 * - 214: Light orange   (#FFAF00) — accent
 * - 202: Dark orange    (#FF5F00) — emphasis
 * - 166: Burnt orange   (#D75F00) — subtle
 */

// Import everything for local use AND re-export
import {
  // Types
  type ColorFn,

  // Foreground colors
  black,
  red,
  green,
  yellow,
  blue,
  magenta,
  cyan,
  white,
  gray,
  grey,
  blackBright,
  redBright,
  greenBright,
  yellowBright,
  blueBright,
  magentaBright,
  cyanBright,
  whiteBright,

  // Background colors
  bgBlack,
  bgRed,
  bgGreen,
  bgYellow,
  bgBlue,
  bgMagenta,
  bgCyan,
  bgWhite,
  bgGray,
  bgGrey,
  bgBlackBright,
  bgRedBright,
  bgGreenBright,
  bgYellowBright,
  bgBlueBright,
  bgMagentaBright,
  bgCyanBright,
  bgWhiteBright,

  // Modifiers
  reset,
  bold,
  dim,
  italic,
  underline,
  overline,
  inverse,
  hidden,
  strikethrough,
  strike,

  // RGB/Hex/256
  rgb,
  bgRgb,
  hex,
  bgHex,
  ansi256,
  bgAnsi256,

  // Composition
  compose,
  styled,

  // Chainable API
  c,

  // Utilities
  stripAnsi,
  hasAnsi,
  visibleLength,

  // Semantic aliases
  success,
  error,
  warning,
  info,
  muted,
  primary,
  secondary,

  // Color detection
  supportsColor,
  supportsTrueColor,
  getColorLevel,

  // Template literal
  tpl,

  // Theme integration
  theme as tuiuiuTheme,
  tw,
  styles,
} from 'tuiuiu.js/colors';

// Re-export everything
export {
  // Types
  type ColorFn,

  // Foreground colors
  black,
  red,
  green,
  yellow,
  blue,
  magenta,
  cyan,
  white,
  gray,
  grey,
  blackBright,
  redBright,
  greenBright,
  yellowBright,
  blueBright,
  magentaBright,
  cyanBright,
  whiteBright,

  // Background colors
  bgBlack,
  bgRed,
  bgGreen,
  bgYellow,
  bgBlue,
  bgMagenta,
  bgCyan,
  bgWhite,
  bgGray,
  bgGrey,
  bgBlackBright,
  bgRedBright,
  bgGreenBright,
  bgYellowBright,
  bgBlueBright,
  bgMagentaBright,
  bgCyanBright,
  bgWhiteBright,

  // Modifiers
  reset,
  bold,
  dim,
  italic,
  underline,
  overline,
  inverse,
  hidden,
  strikethrough,
  strike,

  // RGB/Hex/256
  rgb,
  bgRgb,
  hex,
  bgHex,
  ansi256,
  bgAnsi256,

  // Composition
  compose,
  styled,

  // Chainable API
  c,

  // Utilities
  stripAnsi,
  hasAnsi,
  visibleLength,

  // Semantic aliases
  success,
  error,
  warning,
  info,
  muted,
  primary,
  secondary,

  // Color detection
  supportsColor,
  supportsTrueColor,
  getColorLevel,

  // Template literal
  tpl,

  // Theme integration
  tuiuiuTheme,
  tw,
  styles,
};

// =============================================================================
// 🎨 RECKER ORANGE PALETTE (ANSI 256)
// =============================================================================

/** Primary orange (#FF8700) - main brand color */
export const orange = ansi256(208);

/** Light orange (#FFAF00) - accent, highlights */
export const lightOrange = ansi256(214);

/** Dark orange (#FF5F00) - emphasis, important elements */
export const darkOrange = ansi256(202);

/** Burnt orange (#D75F00) - subtle, secondary elements */
export const burntOrange = ansi256(166);

// Extended grays for better contrast
/** Light gray (#D0D0D0) - primary text */
export const lightGray = ansi256(252);

/** Medium gray (#8A8A8A) - muted text */
export const mediumGray = ansi256(245);

// =============================================================================
// COMPOSED STYLES (convenience functions)
// =============================================================================

/** Bold orange - for program names, headers */
export const orangeBold = compose(orange, bold);

/** Bold white - for section headers */
export const whiteBold = (s: string) => c.bold.white(s);

/** Dim gray - for defaults, metadata */
export const grayDim = compose(gray, dim);

// =============================================================================
// DEFAULT EXPORT (picocolors-like API for compatibility)
// =============================================================================

const colors = {
  // Styles
  reset,
  bold,
  dim,
  italic,
  underline,

  // Basic colors
  black,
  red,
  green,
  yellow,
  blue,
  magenta,
  cyan,
  white,
  gray,

  // 🎨 Recker orange palette
  orange,
  lightOrange,
  darkOrange,
  burntOrange,

  // Extended grays
  lightGray,
  mediumGray,

  // Composed styles
  orangeBold,
  whiteBold,
  grayDim,

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

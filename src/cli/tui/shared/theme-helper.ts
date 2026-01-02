/**
 * Theme color helper for tuiuiu.js
 *
 * Re-exports `resolveColor` as `themeColor` for semantic color resolution.
 * The `resolveColor` function supports all semantic color names like:
 * - primary, primaryForeground, secondary, secondaryForeground
 * - success, warning, error, info
 * - muted, mutedForeground, foreground, background
 * - accent, accentForeground, border, ring
 *
 * @example
 * ```ts
 * Text({ color: themeColor('primary') }, 'Hello')
 * Box({ backgroundColor: themeColor('muted') }, ...)
 * ```
 */

import { resolveColor } from 'tuiuiu.js';

/**
 * Get a color value from the current theme by semantic name.
 * This is an alias for `resolveColor` from tuiuiu.js.
 */
export const themeColor = resolveColor;

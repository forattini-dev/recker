/**
 * Chart - Simple line chart renderer for terminal
 *
 * Zero external dependencies.
 *
 * @module recker/utils/chart
 */

export interface ChartOptions {
  /** Chart height in rows (default: 10) */
  height?: number;
  /** Padding for axis labels (default: 8) */
  padding?: string;
  /** Minimum value (auto-detected if not provided) */
  min?: number;
  /** Maximum value (auto-detected if not provided) */
  max?: number;
  /** Format function for axis labels */
  format?: (value: number) => string;
}

// Box drawing characters for the chart
const CHARS = {
  empty: ' ',
  axis: '┤',
  horizontal: '─',
  vertical: '│',
  point: '●',
  // Line drawing
  lineHorizontal: '─',
  lineUp: '╯',
  lineDown: '╮',
  lineUpDown: '│',
  lineStart: '┼',
};

/**
 * Plot a line chart from an array of numbers
 *
 * @example
 * ```typescript
 * import { plot } from 'recker/utils/chart';
 *
 * const data = [1, 2, 3, 4, 5, 4, 3, 2, 1];
 * console.log(plot(data, { height: 5 }));
 * ```
 */
export function plot(series: number[], options: ChartOptions = {}): string {
  if (!series || series.length === 0) {
    return '';
  }

  const height = options.height ?? 10;
  const padding = options.padding ?? '        ';
  const format = options.format ?? ((v: number) => v.toFixed(2).padStart(8));

  // Handle all zeros or single value
  const validSeries = series.filter((v) => !isNaN(v) && isFinite(v));
  if (validSeries.length === 0) {
    return '';
  }

  // Calculate range
  let min = options.min ?? Math.min(...validSeries);
  let max = options.max ?? Math.max(...validSeries);

  // Handle flat line (all same values)
  if (min === max) {
    max = min + 1;
    min = min - 1;
  }

  const range = max - min;
  const scale = height / range;

  // Create the chart grid
  const rows = height + 1;
  const cols = series.length;
  const grid: string[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(CHARS.empty)
  );

  // Plot points and connect them
  for (let x = 0; x < series.length; x++) {
    const value = series[x];
    if (isNaN(value) || !isFinite(value)) continue;

    // Scale value to row (0 = top, height = bottom)
    const y = Math.round((max - value) * scale);
    const clampedY = Math.max(0, Math.min(rows - 1, y));

    // Draw point
    grid[clampedY][x] = '─';

    // Connect to previous point
    if (x > 0) {
      const prevValue = series[x - 1];
      if (!isNaN(prevValue) && isFinite(prevValue)) {
        const prevY = Math.round((max - prevValue) * scale);
        const clampedPrevY = Math.max(0, Math.min(rows - 1, prevY));

        if (clampedPrevY < clampedY) {
          // Going down
          grid[clampedPrevY][x] = '╮';
          grid[clampedY][x] = '╰';
          for (let i = clampedPrevY + 1; i < clampedY; i++) {
            grid[i][x] = '│';
          }
        } else if (clampedPrevY > clampedY) {
          // Going up
          grid[clampedPrevY][x] = '╯';
          grid[clampedY][x] = '╭';
          for (let i = clampedY + 1; i < clampedPrevY; i++) {
            grid[i][x] = '│';
          }
        }
      }
    }
  }

  // Build output with axis labels
  const lines: string[] = [];
  for (let row = 0; row < rows; row++) {
    // Calculate value for this row
    const value = max - (row / height) * range;
    const label = format(value);

    // Build the line
    const axis = row === 0 || row === rows - 1 || row === Math.floor(rows / 2)
      ? CHARS.axis
      : CHARS.axis;

    lines.push(`${label} ${axis}${grid[row].join('')}`);
  }

  return lines.join('\n');
}

/**
 * Plot multiple series on the same chart
 */
export function plotMultiple(
  seriesList: number[][],
  options: ChartOptions = {}
): string {
  if (!seriesList || seriesList.length === 0) {
    return '';
  }

  // Find global min/max
  const allValues = seriesList.flat().filter((v) => !isNaN(v) && isFinite(v));
  if (allValues.length === 0) {
    return '';
  }

  const globalMin = Math.min(...allValues);
  const globalMax = Math.max(...allValues);

  // For now, just plot the first series with global range
  // Could be extended to overlay multiple series with different characters
  return plot(seriesList[0], {
    ...options,
    min: globalMin,
    max: globalMax,
  });
}

export default {
  plot,
  plotMultiple,
};

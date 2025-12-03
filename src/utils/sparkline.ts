/**
 * Sparkline - Compact inline charts using Unicode block characters
 *
 * Uses 8-level block characters for smooth gradation:
 * ▁▂▃▄▅▆▇█ (U+2581 to U+2588)
 */

// 8-level block characters for sparkline
const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;
const EMPTY_CHAR = '·';

export interface SparklineOptions {
  /** Width in characters (default: 30) */
  width?: number;
  /** Minimum value for scaling (auto if not set) */
  min?: number;
  /** Maximum value for scaling (auto if not set) */
  max?: number;
}

/**
 * Render a sparkline from an array of numbers
 *
 * @example
 * ```ts
 * const cpuHistory = [20, 45, 30, 80, 60, 75, 90, 85];
 * console.log(sparkline(cpuHistory, { width: 20 }));
 * // Output: ············▂▄▃█▅▆█▇
 * ```
 */
export function sparkline(data: number[], options: SparklineOptions = {}): string {
  const { width = 30, min: fixedMin, max: fixedMax } = options;

  if (width === 0) return '';
  if (data.length === 0) return EMPTY_CHAR.repeat(width);

  // Get the last `width` values
  const start = Math.max(0, data.length - width);
  const slice = data.slice(start);

  // Find min/max for normalization
  const min = fixedMin ?? Math.min(...slice, 0);
  const max = fixedMax ?? Math.max(...slice, 0);
  const range = Math.max(max - min, Number.EPSILON);

  // Build sparkline string
  let result = '';

  // Pad with empty chars if data is shorter than width
  const padding = Math.max(0, width - slice.length);
  if (padding > 0) {
    result += EMPTY_CHAR.repeat(padding);
  }

  // Convert each value to a spark character
  for (const value of slice) {
    const normalized = Math.max(0, Math.min(1, (value - min) / range));
    const idx = Math.round(normalized * (SPARK_CHARS.length - 1));
    result += SPARK_CHARS[Math.min(idx, SPARK_CHARS.length - 1)];
  }

  return result;
}

/**
 * Rolling buffer for sparkline data
 * Efficiently maintains a fixed-size history
 */
export class SparklineBuffer {
  private data: number[] = [];
  private readonly capacity: number;

  constructor(capacity: number = 60) {
    this.capacity = capacity;
  }

  /** Add a new value to the buffer */
  push(value: number): void {
    if (this.data.length >= this.capacity) {
      this.data.shift();
    }
    this.data.push(value);
  }

  /** Get the current data array */
  getData(): number[] {
    return this.data;
  }

  /** Render as sparkline */
  render(options: SparklineOptions = {}): string {
    return sparkline(this.data, { width: this.capacity, ...options });
  }

  /** Clear all data */
  clear(): void {
    this.data = [];
  }

  /** Get the latest value */
  latest(): number | undefined {
    return this.data[this.data.length - 1];
  }

  /** Get the average of all values */
  average(): number {
    if (this.data.length === 0) return 0;
    return this.data.reduce((a, b) => a + b, 0) / this.data.length;
  }
}

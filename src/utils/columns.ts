/**
 * Terminal Column Layout Utility
 *
 * Displays items in columns that respect terminal width.
 */

export interface ColumnOptions {
  /** Minimum column width (default: 15) */
  minWidth?: number;
  /** Maximum columns (default: unlimited) */
  maxColumns?: number;
  /** Padding between columns (default: 2) */
  padding?: number;
  /** Prefix for each item (e.g., '@' for presets) */
  prefix?: string;
  /** Indent for the entire output (default: 2) */
  indent?: number;
  /** Transform function to apply to each item (e.g., colors.cyan) */
  transform?: (item: string) => string;
}

/**
 * Get terminal width, with fallback for non-TTY environments
 */
export function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

/**
 * Format items into columns that fit the terminal width
 */
export function formatColumns(items: string[], options: ColumnOptions = {}): string {
  const {
    minWidth = 15,
    maxColumns = Infinity,
    padding = 2,
    prefix = '',
    indent = 2,
    transform,
  } = options;

  if (items.length === 0) return '';

  // Add prefix to items (for width calculation, use raw strings)
  const prefixedItems = items.map(item => prefix + item);

  // Calculate the maximum item width
  const maxItemWidth = Math.max(...prefixedItems.map(item => item.length));
  const columnWidth = Math.max(minWidth, maxItemWidth + padding);

  // Calculate available width (terminal width minus indent)
  const terminalWidth = getTerminalWidth();
  const availableWidth = terminalWidth - indent;

  // Calculate number of columns
  const calculatedColumns = Math.floor(availableWidth / columnWidth);
  const numColumns = Math.min(Math.max(1, calculatedColumns), maxColumns, items.length);

  // Recalculate column width to use available space
  const actualColumnWidth = Math.floor(availableWidth / numColumns);

  // Calculate number of rows
  const numRows = Math.ceil(prefixedItems.length / numColumns);

  // Build the output
  const lines: string[] = [];
  const indentStr = ' '.repeat(indent);

  for (let row = 0; row < numRows; row++) {
    let line = indentStr;
    for (let col = 0; col < numColumns; col++) {
      const index = col * numRows + row; // Column-major order (items flow down, then right)
      if (index < prefixedItems.length) {
        const rawItem = prefixedItems[index];
        // Apply transform if provided, but pad based on raw length
        const displayItem = transform ? transform(rawItem) : rawItem;
        // Since ANSI codes don't take visual space, pad the display item based on raw length
        const paddingNeeded = actualColumnWidth - rawItem.length;
        line += displayItem + ' '.repeat(Math.max(0, paddingNeeded));
      }
    }
    lines.push(line.trimEnd());
  }

  return lines.join('\n');
}

/**
 * Format items into columns, row-major order (items flow right, then down)
 */
export function formatColumnsRowMajor(items: string[], options: ColumnOptions = {}): string {
  const {
    minWidth = 15,
    maxColumns = Infinity,
    padding = 2,
    prefix = '',
    indent = 2,
  } = options;

  if (items.length === 0) return '';

  // Add prefix to items
  const prefixedItems = items.map(item => prefix + item);

  // Calculate the maximum item width
  const maxItemWidth = Math.max(...prefixedItems.map(item => item.length));
  const columnWidth = Math.max(minWidth, maxItemWidth + padding);

  // Calculate available width (terminal width minus indent)
  const terminalWidth = getTerminalWidth();
  const availableWidth = terminalWidth - indent;

  // Calculate number of columns
  const calculatedColumns = Math.floor(availableWidth / columnWidth);
  const numColumns = Math.min(Math.max(1, calculatedColumns), maxColumns, items.length);

  // Recalculate column width to use available space
  const actualColumnWidth = Math.floor(availableWidth / numColumns);

  // Build the output
  const lines: string[] = [];
  const indentStr = ' '.repeat(indent);

  for (let i = 0; i < prefixedItems.length; i += numColumns) {
    let line = indentStr;
    for (let col = 0; col < numColumns && i + col < prefixedItems.length; col++) {
      const item = prefixedItems[i + col];
      line += item.padEnd(actualColumnWidth);
    }
    lines.push(line.trimEnd());
  }

  return lines.join('\n');
}

/**
 * Group items by category and format in columns
 */
export function formatGroupedColumns(
  groups: Record<string, string[]>,
  options: ColumnOptions & { groupPrefix?: string } = {}
): string {
  const lines: string[] = [];
  const { groupPrefix = '', ...columnOptions } = options;

  for (const [groupName, items] of Object.entries(groups)) {
    if (items.length === 0) continue;
    lines.push(groupPrefix + groupName + ':');
    lines.push(formatColumns(items, columnOptions));
    lines.push(''); // Empty line between groups
  }

  return lines.join('\n').trimEnd();
}

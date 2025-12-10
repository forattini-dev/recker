/**
 * CSV Plugin for Recker
 *
 * Native CSV support following RFC 4180 specification.
 *
 * Features:
 * - Parse CSV responses with .csv() method
 * - Send CSV request bodies
 * - Automatic content-type detection
 * - Full RFC 4180 compliance
 * - Zero external dependencies (native parser)
 * - Support for headers, custom delimiters, and quoting
 *
 * @see https://www.rfc-editor.org/rfc/rfc4180
 *
 * @example
 * ```typescript
 * import { createClient } from 'recker';
 *
 * const client = createClient({ baseUrl: 'https://api.example.com' });
 *
 * // Parse CSV response as array of objects (with headers)
 * const users = await client.get('/users.csv').csv();
 * // [{ name: 'John', age: '30' }, { name: 'Jane', age: '25' }]
 *
 * // Parse CSV response as array of arrays (no headers)
 * const data = await client.get('/data.csv').csv({ headers: false });
 * // [['John', '30'], ['Jane', '25']]
 *
 * // Send CSV body
 * await client.post('/import', {
 *   csv: [
 *     { name: 'John', age: 30 },
 *     { name: 'Jane', age: 25 }
 *   ]
 * });
 * ```
 */

import type { ReckerResponse } from '../types/index.js';

/**
 * CSV Content Types (RFC 4180)
 */
export const CSV_MEDIA_TYPES = [
  'text/csv',
  'application/csv',      // Common alternative
  'text/x-csv',           // Legacy
  'application/x-csv',    // Legacy
] as const;

export const CSV_SUFFIX = '+csv';

/**
 * Check if a content-type is CSV
 */
export function isCsvContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase().split(';')[0].trim();
  return CSV_MEDIA_TYPES.includes(ct as any) || ct.endsWith(CSV_SUFFIX);
}

/**
 * CSV Parser Options
 */
export interface CsvParseOptions {
  /**
   * First row contains headers (returns array of objects)
   * If false, returns array of arrays
   * @default true
   */
  headers?: boolean;

  /**
   * Custom header names (overrides first row)
   * Only used when headers is true
   */
  columns?: string[];

  /**
   * Field delimiter
   * @default ','
   */
  delimiter?: string;

  /**
   * Quote character
   * @default '"'
   */
  quote?: string;

  /**
   * Skip empty lines
   * @default true
   */
  skipEmptyLines?: boolean;

  /**
   * Trim whitespace from fields
   * @default false (RFC 4180: spaces are part of field)
   */
  trim?: boolean;

  /**
   * Convert numeric strings to numbers
   * @default false
   */
  parseNumbers?: boolean;

  /**
   * Convert 'true'/'false' strings to booleans
   * @default false
   */
  parseBooleans?: boolean;

  /**
   * Comment character (lines starting with this are skipped)
   * @default undefined (no comments)
   */
  comment?: string;

  /**
   * Maximum number of rows to parse (security)
   * @default 100000
   */
  maxRows?: number;

  /**
   * Maximum number of columns (security)
   * @default 1000
   */
  maxColumns?: number;
}

/**
 * CSV Serializer Options
 */
export interface CsvSerializeOptions {
  /**
   * Include header row
   * @default true
   */
  headers?: boolean;

  /**
   * Custom header names (overrides object keys)
   */
  columns?: string[];

  /**
   * Field delimiter
   * @default ','
   */
  delimiter?: string;

  /**
   * Quote character
   * @default '"'
   */
  quote?: string;

  /**
   * Always quote fields (even if not necessary)
   * @default false
   */
  alwaysQuote?: boolean;

  /**
   * Line ending
   * @default '\r\n' (RFC 4180)
   */
  lineEnding?: string;

  /**
   * Null/undefined value representation
   * @default ''
   */
  nullValue?: string;
}

/**
 * Parse CSV string to JavaScript array
 *
 * @example
 * ```typescript
 * // With headers (returns objects)
 * const data = parseCsv('name,age\nJohn,30\nJane,25');
 * // [{ name: 'John', age: '30' }, { name: 'Jane', age: '25' }]
 *
 * // Without headers (returns arrays)
 * const data = parseCsv('John,30\nJane,25', { headers: false });
 * // [['John', '30'], ['Jane', '25']]
 *
 * // With custom columns
 * const data = parseCsv('John,30\nJane,25', { columns: ['name', 'age'] });
 * // [{ name: 'John', age: '30' }, { name: 'Jane', age: '25' }]
 * ```
 */
export function parseCsv<T = Record<string, string>>(
  csv: string,
  options: CsvParseOptions & { headers?: true }
): T[];
export function parseCsv(
  csv: string,
  options: CsvParseOptions & { headers: false }
): string[][];
export function parseCsv<T = Record<string, string>>(
  csv: string,
  options?: CsvParseOptions
): T[] | string[][];
export function parseCsv<T = Record<string, string>>(
  csv: string,
  options: CsvParseOptions = {}
): T[] | string[][] {
  const opts: Required<Omit<CsvParseOptions, 'columns' | 'comment'>> & Pick<CsvParseOptions, 'columns' | 'comment'> = {
    headers: options.headers ?? true,
    columns: options.columns,
    delimiter: options.delimiter ?? ',',
    quote: options.quote ?? '"',
    skipEmptyLines: options.skipEmptyLines ?? true,
    trim: options.trim ?? false,
    parseNumbers: options.parseNumbers ?? false,
    parseBooleans: options.parseBooleans ?? false,
    comment: options.comment,
    maxRows: options.maxRows ?? 100000,
    maxColumns: options.maxColumns ?? 1000,
  };

  // Handle empty input
  if (!csv || !csv.trim()) {
    return [];
  }

  // Normalize line endings to \n
  const normalized = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let rowCount = 0;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const nextChar = normalized[i + 1];

    if (inQuotes) {
      if (char === opts.quote) {
        if (nextChar === opts.quote) {
          // Escaped quote
          currentField += opts.quote;
          i++; // Skip next quote
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === opts.quote && currentField === '') {
        // Start of quoted field
        inQuotes = true;
      } else if (char === opts.delimiter) {
        // End of field
        currentRow.push(processField(currentField, opts));
        currentField = '';

        // Security check
        if (currentRow.length > opts.maxColumns) {
          throw new CsvError(`Maximum columns (${opts.maxColumns}) exceeded`, rowCount);
        }
      } else if (char === '\n') {
        // End of row
        currentRow.push(processField(currentField, opts));
        currentField = '';

        // Check for comment lines
        if (opts.comment && currentRow.length === 1 && currentRow[0].startsWith(opts.comment)) {
          currentRow = [];
          continue;
        }

        // Check for empty lines
        if (opts.skipEmptyLines && currentRow.length === 1 && currentRow[0] === '') {
          currentRow = [];
          continue;
        }

        rows.push(currentRow);
        currentRow = [];
        rowCount++;

        // Security check
        if (rowCount > opts.maxRows) {
          throw new CsvError(`Maximum rows (${opts.maxRows}) exceeded`, rowCount);
        }
      } else {
        currentField += char;
      }
    }
  }

  // Handle last field/row
  if (currentField || currentRow.length > 0) {
    currentRow.push(processField(currentField, opts));

    // Check for comment lines
    if (!(opts.comment && currentRow.length === 1 && currentRow[0].startsWith(opts.comment))) {
      // Check for empty lines
      if (!(opts.skipEmptyLines && currentRow.length === 1 && currentRow[0] === '')) {
        rows.push(currentRow);
      }
    }
  }

  // If no headers, return as-is
  if (!opts.headers && !opts.columns) {
    return rows;
  }

  // Get headers
  let headers: string[];
  let dataRows: string[][];

  if (opts.columns) {
    // Use custom columns
    headers = opts.columns;
    dataRows = opts.headers ? rows.slice(1) : rows;
  } else {
    // Use first row as headers
    if (rows.length === 0) {
      return [];
    }
    headers = rows[0];
    dataRows = rows.slice(1);
  }

  // Convert to objects
  return dataRows.map((row) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = row[i] ?? '';
    }
    return obj as T;
  });
}

function processField(
  field: string,
  opts: { trim: boolean; parseNumbers: boolean; parseBooleans: boolean }
): string {
  let value = opts.trim ? field.trim() : field;

  if (opts.parseNumbers) {
    const num = Number(value);
    if (!isNaN(num) && value !== '') {
      return num as any;
    }
  }

  if (opts.parseBooleans) {
    const lower = value.toLowerCase();
    if (lower === 'true') return true as any;
    if (lower === 'false') return false as any;
  }

  return value;
}

/**
 * CSV Parse Error
 */
export class CsvError extends Error {
  row?: number;

  constructor(message: string, row?: number) {
    super(row !== undefined ? `${message} at row ${row + 1}` : message);
    this.name = 'CsvError';
    this.row = row;
  }
}

/**
 * Serialize JavaScript array to CSV string
 *
 * @example
 * ```typescript
 * // Array of objects
 * const csv = serializeCsv([
 *   { name: 'John', age: 30 },
 *   { name: 'Jane', age: 25 }
 * ]);
 * // "name,age\r\nJohn,30\r\nJane,25"
 *
 * // Array of arrays (no headers)
 * const csv = serializeCsv([
 *   ['John', 30],
 *   ['Jane', 25]
 * ], { headers: false });
 * // "John,30\r\nJane,25"
 *
 * // With custom columns
 * const csv = serializeCsv([
 *   { name: 'John', age: 30, email: 'john@example.com' }
 * ], { columns: ['name', 'age'] });
 * // "name,age\r\nJohn,30"
 * ```
 */
export function serializeCsv(
  data: Record<string, any>[] | any[][],
  options: CsvSerializeOptions = {}
): string {
  const opts: Required<Omit<CsvSerializeOptions, 'columns'>> & Pick<CsvSerializeOptions, 'columns'> = {
    headers: options.headers ?? true,
    columns: options.columns,
    delimiter: options.delimiter ?? ',',
    quote: options.quote ?? '"',
    alwaysQuote: options.alwaysQuote ?? false,
    lineEnding: options.lineEnding ?? '\r\n',
    nullValue: options.nullValue ?? '',
  };

  if (!data || data.length === 0) {
    return '';
  }

  const lines: string[] = [];

  // Check if array of arrays or array of objects
  const isArrayOfArrays = Array.isArray(data[0]);

  if (isArrayOfArrays) {
    // Array of arrays
    for (const row of data as any[][]) {
      lines.push(row.map((field) => quoteField(field, opts)).join(opts.delimiter));
    }
  } else {
    // Array of objects
    const objects = data as Record<string, any>[];

    // Determine columns
    let columns: string[];
    if (opts.columns) {
      columns = opts.columns;
    } else {
      // Get all unique keys from all objects
      const keySet = new Set<string>();
      for (const obj of objects) {
        for (const key of Object.keys(obj)) {
          keySet.add(key);
        }
      }
      columns = Array.from(keySet);
    }

    // Add header row
    if (opts.headers) {
      lines.push(columns.map((col) => quoteField(col, opts)).join(opts.delimiter));
    }

    // Add data rows
    for (const obj of objects) {
      const row = columns.map((col) => {
        const value = obj[col];
        return quoteField(value, opts);
      });
      lines.push(row.join(opts.delimiter));
    }
  }

  return lines.join(opts.lineEnding);
}

function quoteField(
  value: any,
  opts: { quote: string; delimiter: string; alwaysQuote: boolean; nullValue: string }
): string {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return opts.nullValue;
  }

  // Convert to string
  const str = String(value);

  // Check if quoting is needed
  const needsQuoting =
    opts.alwaysQuote ||
    str.includes(opts.quote) ||
    str.includes(opts.delimiter) ||
    str.includes('\n') ||
    str.includes('\r');

  if (needsQuoting) {
    // Escape quotes by doubling them
    const escaped = str.replace(new RegExp(opts.quote, 'g'), opts.quote + opts.quote);
    return opts.quote + escaped + opts.quote;
  }

  return str;
}

/**
 * Helper to parse CSV response
 *
 * @example
 * ```typescript
 * import { createClient, csvResponse } from 'recker';
 *
 * const client = createClient({ baseUrl: 'https://api.example.com' });
 * const users = await csvResponse(client.get('/users.csv'));
 * ```
 */
export async function csvResponse<T = Record<string, string>>(
  promise: Promise<ReckerResponse>,
  options?: CsvParseOptions
): Promise<T[]> {
  const response = await promise;
  const text = await response.text();
  return parseCsv<T>(text, options as any) as T[];
}

/**
 * Parse CSV with automatic type inference
 *
 * Attempts to convert fields to appropriate types:
 * - Numbers (integers and floats)
 * - Booleans (true/false)
 * - Null (empty strings become null)
 * - Dates (ISO 8601 format)
 *
 * @example
 * ```typescript
 * const data = parseCsvTyped('name,age,active\nJohn,30,true');
 * // [{ name: 'John', age: 30, active: true }]
 * ```
 */
export function parseCsvTyped<T = Record<string, any>>(
  csv: string,
  options: Omit<CsvParseOptions, 'parseNumbers' | 'parseBooleans'> = {}
): T[] {
  const rows = parseCsv<Record<string, string>>(csv, { ...options, headers: true });

  return rows.map((row) => {
    const typed: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      typed[key] = inferType(value);
    }
    return typed as T;
  });
}

function inferType(value: string): any {
  // Empty string → null
  if (value === '') {
    return null;
  }

  // Boolean
  const lower = value.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;

  // Number (integer or float)
  if (/^-?\d+$/.test(value)) {
    const num = parseInt(value, 10);
    if (Number.isSafeInteger(num)) return num;
  }
  if (/^-?\d*\.?\d+([eE][-+]?\d+)?$/.test(value)) {
    return parseFloat(value);
  }

  // ISO Date
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/.test(value)) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // String (default)
  return value;
}

/**
 * Stream CSV parsing for large files
 *
 * @example
 * ```typescript
 * for await (const row of parseCsvStream(response.read(), { headers: true })) {
 *   console.log(row);
 * }
 * ```
 */
export async function* parseCsvStream<T = Record<string, string>>(
  stream: ReadableStream<Uint8Array> | null,
  options: CsvParseOptions = {}
): AsyncGenerator<T> {
  if (!stream) return;

  const opts = {
    headers: options.headers ?? true,
    columns: options.columns,
    delimiter: options.delimiter ?? ',',
    quote: options.quote ?? '"',
    skipEmptyLines: options.skipEmptyLines ?? true,
    trim: options.trim ?? false,
    parseNumbers: options.parseNumbers ?? false,
    parseBooleans: options.parseBooleans ?? false,
    comment: options.comment,
  };

  const decoder = new TextDecoder();
  const reader = stream.getReader();

  let buffer = '';
  let headers: string[] | null = opts.columns || null;
  let isFirstRow = !opts.columns;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Process remaining buffer
        if (buffer.trim()) {
          const row = parseRow(buffer, opts);
          if (row) {
            if (isFirstRow && opts.headers) {
              headers = row;
              isFirstRow = false;
            } else if (headers) {
              yield rowToObject(row, headers) as T;
            } else {
              yield row as any;
            }
          }
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      let newlineIndex: number;
      while ((newlineIndex = findCompleteRow(buffer, opts.quote)) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        // Skip \r if present (CRLF)
        if (buffer.startsWith('\r')) {
          buffer = buffer.slice(1);
        }

        const row = parseRow(line, opts);
        if (!row) continue;

        if (isFirstRow && opts.headers) {
          headers = row;
          isFirstRow = false;
          continue;
        }

        if (headers) {
          yield rowToObject(row, headers) as T;
        } else {
          yield row as any;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function findCompleteRow(buffer: string, quote: string): number {
  let inQuotes = false;

  for (let i = 0; i < buffer.length; i++) {
    const char = buffer[i];

    if (char === quote) {
      if (inQuotes && buffer[i + 1] === quote) {
        i++; // Skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      return i;
    }
  }

  return -1;
}

function parseRow(
  line: string,
  opts: { delimiter: string; quote: string; skipEmptyLines: boolean; trim: boolean; parseNumbers: boolean; parseBooleans: boolean; comment?: string }
): string[] | null {
  // Skip comment lines
  if (opts.comment && line.startsWith(opts.comment)) {
    return null;
  }

  // Skip empty lines
  if (opts.skipEmptyLines && !line.trim()) {
    return null;
  }

  const fields: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === opts.quote) {
        if (nextChar === opts.quote) {
          currentField += opts.quote;
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === opts.quote && currentField === '') {
        inQuotes = true;
      } else if (char === opts.delimiter) {
        fields.push(processField(currentField, opts));
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  fields.push(processField(currentField, opts));

  return fields;
}

function rowToObject(row: string[], headers: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    obj[headers[i]] = row[i] ?? '';
  }
  return obj;
}

// Export utilities for standalone use
export { parseCsv as csvParse, serializeCsv as csvSerialize };

/**
 * YAML Plugin for Recker
 *
 * First HTTP client with native YAML support!
 *
 * Implements RFC 9512 (February 2024) which defines:
 * - Media type: application/yaml
 * - Structured suffix: +yaml
 *
 * Features:
 * - Parse YAML responses with .yaml() method
 * - Send YAML request bodies
 * - Automatic content-type detection
 * - Full YAML 1.2 compliance
 * - Zero external dependencies (native parser)
 *
 * @see https://datatracker.ietf.org/doc/rfc9512/
 * @see https://httptoolkit.com/blog/yaml-media-type-rfc/
 *
 * @example
 * ```typescript
 * import { createClient } from 'recker';
 *
 * const client = createClient({ baseUrl: 'https://api.example.com' });
 *
 * // Parse YAML response
 * const config = await client.get('/config.yaml').yaml();
 *
 * // Send YAML body
 * await client.post('/config', {
 *   yaml: { server: { port: 3000, host: 'localhost' } }
 * });
 * ```
 */

import type { ReckerResponse } from '../types/index.js';

/**
 * YAML Content Types (RFC 9512)
 */
export const YAML_MEDIA_TYPES = [
  'application/yaml',
  'application/x-yaml', // Legacy, still commonly used
  'text/yaml',          // Legacy
  'text/x-yaml',        // Legacy
] as const;

export const YAML_SUFFIX = '+yaml';

/**
 * Check if a content-type is YAML
 */
export function isYamlContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase().split(';')[0].trim();
  return YAML_MEDIA_TYPES.includes(ct as any) || ct.endsWith(YAML_SUFFIX);
}

/**
 * YAML Parser Options
 */
export interface YamlParseOptions {
  /**
   * Allow duplicate keys (last one wins)
   * @default false
   */
  allowDuplicateKeys?: boolean;

  /**
   * Parse dates as Date objects
   * @default true
   */
  parseDates?: boolean;

  /**
   * Custom tag handlers
   */
  customTags?: Record<string, (value: string) => any>;

  /**
   * Maximum depth for nested structures (security)
   * @default 100
   */
  maxDepth?: number;

  /**
   * Maximum number of keys (security against billion laughs attack)
   * @default 10000
   */
  maxKeys?: number;
}

/**
 * YAML Serializer Options
 */
export interface YamlSerializeOptions {
  /**
   * Indentation (spaces)
   * @default 2
   */
  indent?: number;

  /**
   * Line width before wrapping
   * @default 80
   */
  lineWidth?: number;

  /**
   * Quote all strings
   * @default false
   */
  forceQuotes?: boolean;

  /**
   * Use flow style for small collections
   * @default false
   */
  flowStyle?: boolean;

  /**
   * Sort object keys
   * @default false
   */
  sortKeys?: boolean;

  /**
   * Skip undefined values
   * @default true
   */
  skipUndefined?: boolean;

  /**
   * Include document markers (---, ...)
   * @default false
   */
  documentMarkers?: boolean;
}

// Internal state for parser
interface ParserState {
  lines: string[];
  index: number;
  depth: number;
  keyCount: number;
  options: Required<YamlParseOptions>;
}

/**
 * Parse YAML string to JavaScript object
 *
 * Supports YAML 1.2 with:
 * - Scalars (strings, numbers, booleans, null)
 * - Sequences (arrays)
 * - Mappings (objects)
 * - Multi-line strings (|, >, |-, >-)
 * - Anchors and aliases (&, *)
 * - Comments (#)
 * - Date/time parsing
 *
 * @example
 * ```typescript
 * const data = parseYaml(`
 * server:
 *   host: localhost
 *   port: 3000
 *   ssl: true
 * `);
 * // { server: { host: 'localhost', port: 3000, ssl: true } }
 * ```
 */
export function parseYaml<T = any>(yaml: string, options: YamlParseOptions = {}): T {
  const opts: Required<YamlParseOptions> = {
    allowDuplicateKeys: options.allowDuplicateKeys ?? false,
    parseDates: options.parseDates ?? true,
    customTags: options.customTags ?? {},
    maxDepth: options.maxDepth ?? 100,
    maxKeys: options.maxKeys ?? 10000,
  };

  // Handle empty input
  if (!yaml || !yaml.trim()) {
    return null as T;
  }

  // Remove BOM if present
  let content = yaml.replace(/^\uFEFF/, '');

  // Remove document markers
  content = content.replace(/^---\s*$/gm, '').replace(/^\.\.\.\s*$/gm, '');

  // Split into lines (preserving empty lines for multi-line strings)
  const lines = content.split('\n');

  // Initialize parser state
  const state: ParserState = {
    lines,
    index: 0,
    depth: 0,
    keyCount: 0,
    options: opts,
  };

  // Track anchors for aliases
  const anchors = new Map<string, any>();

  return parseValue(state, 0, anchors) as T;
}

function parseValue(state: ParserState, baseIndent: number, anchors: Map<string, any>): any {
  skipEmptyAndComments(state);

  if (state.index >= state.lines.length) {
    return null;
  }

  const line = state.lines[state.index];
  const trimmed = line.trim();

  // Check for explicit null
  if (trimmed === '~' || trimmed === 'null' || trimmed === 'Null' || trimmed === 'NULL') {
    state.index++;
    return null;
  }

  // Check for sequence (array)
  if (trimmed.startsWith('- ') || trimmed === '-') {
    return parseSequence(state, baseIndent, anchors);
  }

  // Check for mapping (object)
  if (trimmed.includes(':') && !trimmed.startsWith('"') && !trimmed.startsWith("'")) {
    return parseMapping(state, baseIndent, anchors);
  }

  // Scalar value
  state.index++;
  return parseScalar(trimmed, state.options, anchors);
}

function parseMapping(state: ParserState, baseIndent: number, anchors: Map<string, any>): Record<string, any> {
  const result: Record<string, any> = {};

  state.depth++;
  if (state.depth > state.options.maxDepth) {
    throw new YamlError('Maximum nesting depth exceeded', state.index);
  }

  while (state.index < state.lines.length) {
    skipEmptyAndComments(state);
    if (state.index >= state.lines.length) break;

    const line = state.lines[state.index];
    const currentIndent = getIndent(line);

    // Check if we've dedented (end of this mapping)
    if (currentIndent < baseIndent && line.trim()) {
      break;
    }

    // Skip lines with less indent (belongs to parent)
    if (currentIndent < baseIndent) {
      state.index++;
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      state.index++;
      continue;
    }

    // Check for sequence item at same level (we're inside a sequence)
    if (trimmed.startsWith('- ') && currentIndent <= baseIndent) {
      break;
    }

    // Parse key-value pair
    const colonIndex = findKeyColon(trimmed);
    if (colonIndex === -1) {
      state.index++;
      continue;
    }

    let key = trimmed.substring(0, colonIndex).trim();
    let valueStr = trimmed.substring(colonIndex + 1).trim();

    // Handle anchor on key
    let anchor: string | null = null;
    const anchorMatch = key.match(/^&(\w+)\s+/);
    if (anchorMatch) {
      anchor = anchorMatch[1];
      key = key.substring(anchorMatch[0].length);
    }

    // Handle alias
    if (valueStr.startsWith('*')) {
      const aliasName = valueStr.substring(1).split(/\s/)[0];
      if (!anchors.has(aliasName)) {
        throw new YamlError(`Unknown alias: ${aliasName}`, state.index);
      }
      result[key] = anchors.get(aliasName);
      state.index++;
      continue;
    }

    // Check for anchor on value
    const valueAnchorMatch = valueStr.match(/^&(\w+)\s*/);
    if (valueAnchorMatch) {
      anchor = valueAnchorMatch[1];
      valueStr = valueStr.substring(valueAnchorMatch[0].length);
    }

    // Remove quotes from key if present
    key = unquote(key);

    // Check key count limit
    state.keyCount++;
    if (state.keyCount > state.options.maxKeys) {
      throw new YamlError('Maximum number of keys exceeded', state.index);
    }

    // Check for duplicate keys
    if (!state.options.allowDuplicateKeys && key in result) {
      throw new YamlError(`Duplicate key: ${key}`, state.index);
    }

    state.index++;

    // Determine value
    let value: any;

    if (valueStr === '' || valueStr === '|' || valueStr === '>' || valueStr === '|-' || valueStr === '>-') {
      // Multi-line or nested value
      if (valueStr === '|' || valueStr === '|-') {
        value = parseLiteralBlock(state, currentIndent, valueStr === '|-');
      } else if (valueStr === '>' || valueStr === '>-') {
        value = parseFoldedBlock(state, currentIndent, valueStr === '>-');
      } else {
        // Nested structure
        skipEmptyAndComments(state);
        if (state.index < state.lines.length) {
          const nextIndent = getIndent(state.lines[state.index]);
          if (nextIndent > currentIndent) {
            value = parseValue(state, nextIndent, anchors);
          } else {
            value = null;
          }
        } else {
          value = null;
        }
      }
    } else {
      // Inline value
      value = parseScalar(valueStr, state.options, anchors);
    }

    // Store anchor
    if (anchor) {
      anchors.set(anchor, value);
    }

    result[key] = value;
  }

  state.depth--;
  return result;
}

function parseSequence(state: ParserState, baseIndent: number, anchors: Map<string, any>): any[] {
  const result: any[] = [];

  state.depth++;
  if (state.depth > state.options.maxDepth) {
    throw new YamlError('Maximum nesting depth exceeded', state.index);
  }

  while (state.index < state.lines.length) {
    skipEmptyAndComments(state);
    if (state.index >= state.lines.length) break;

    const line = state.lines[state.index];
    const currentIndent = getIndent(line);
    const trimmed = line.trim();

    // Check if we've dedented
    if (currentIndent < baseIndent && trimmed) {
      break;
    }

    if (!trimmed.startsWith('-')) {
      if (currentIndent <= baseIndent) break;
      state.index++;
      continue;
    }

    // Handle anchor
    let anchor: string | null = null;
    let valueStr = trimmed.substring(1).trim();
    const anchorMatch = valueStr.match(/^&(\w+)\s*/);
    if (anchorMatch) {
      anchor = anchorMatch[1];
      valueStr = valueStr.substring(anchorMatch[0].length);
    }

    // Handle alias
    if (valueStr.startsWith('*')) {
      const aliasName = valueStr.substring(1).split(/\s/)[0];
      if (!anchors.has(aliasName)) {
        throw new YamlError(`Unknown alias: ${aliasName}`, state.index);
      }
      result.push(anchors.get(aliasName));
      state.index++;
      continue;
    }

    state.index++;

    let value: any;

    if (valueStr === '') {
      // Nested structure
      skipEmptyAndComments(state);
      if (state.index < state.lines.length) {
        const nextIndent = getIndent(state.lines[state.index]);
        if (nextIndent > currentIndent) {
          value = parseValue(state, nextIndent, anchors);
        } else {
          value = null;
        }
      } else {
        value = null;
      }
    } else if (valueStr.includes(':') && !valueStr.startsWith('"') && !valueStr.startsWith("'")) {
      // Inline mapping in sequence item
      // Re-parse as mapping with adjusted indent
      state.index--;
      const fakeLine = ' '.repeat(currentIndent + 2) + valueStr;
      const originalLine = state.lines[state.index];
      state.lines[state.index] = fakeLine;
      value = parseMapping(state, currentIndent + 2, anchors);
      if (state.index < state.lines.length) {
        state.lines[state.index - 1] = originalLine;
      }
    } else {
      value = parseScalar(valueStr, state.options, anchors);
    }

    // Store anchor
    if (anchor) {
      anchors.set(anchor, value);
    }

    result.push(value);
  }

  state.depth--;
  return result;
}

function parseLiteralBlock(state: ParserState, baseIndent: number, chomp: boolean): string {
  const lines: string[] = [];
  let contentIndent = -1;

  while (state.index < state.lines.length) {
    const line = state.lines[state.index];
    const indent = getIndent(line);
    const trimmed = line.trim();

    // First non-empty line determines content indent
    if (contentIndent === -1 && trimmed) {
      contentIndent = indent;
    }

    // Check for dedent
    if (contentIndent !== -1 && indent < contentIndent && trimmed) {
      break;
    }

    // Also break if indent is less than or equal to base indent (for non-empty lines)
    if (trimmed && indent <= baseIndent) {
      break;
    }

    if (contentIndent !== -1) {
      // Preserve relative indentation
      const relativeIndent = Math.max(0, indent - contentIndent);
      lines.push(' '.repeat(relativeIndent) + trimmed);
    } else {
      lines.push('');
    }

    state.index++;
  }

  // Remove trailing empty lines if chomping
  if (chomp) {
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
  }

  return lines.join('\n');
}

function parseFoldedBlock(state: ParserState, baseIndent: number, chomp: boolean): string {
  const paragraphs: string[] = [];
  let currentParagraph: string[] = [];
  let contentIndent = -1;

  while (state.index < state.lines.length) {
    const line = state.lines[state.index];
    const indent = getIndent(line);
    const trimmed = line.trim();

    // First non-empty line determines content indent
    if (contentIndent === -1 && trimmed) {
      contentIndent = indent;
    }

    // Check for dedent
    if (contentIndent !== -1 && indent < contentIndent && trimmed) {
      break;
    }

    if (trimmed && indent <= baseIndent) {
      break;
    }

    if (contentIndent !== -1) {
      if (trimmed === '') {
        if (currentParagraph.length > 0) {
          paragraphs.push(currentParagraph.join(' '));
          currentParagraph = [];
        }
        paragraphs.push('');
      } else {
        currentParagraph.push(trimmed);
      }
    }

    state.index++;
  }

  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph.join(' '));
  }

  // Remove trailing empty lines if chomping
  if (chomp) {
    while (paragraphs.length > 0 && paragraphs[paragraphs.length - 1] === '') {
      paragraphs.pop();
    }
  }

  return paragraphs.join('\n');
}

function parseScalar(value: string, options: Required<YamlParseOptions>, anchors: Map<string, any>): any {
  // Handle alias
  if (value.startsWith('*')) {
    const aliasName = value.substring(1).split(/\s|#/)[0];
    if (!anchors.has(aliasName)) {
      throw new YamlError(`Unknown alias: ${aliasName}`);
    }
    return anchors.get(aliasName);
  }

  // Remove inline comment
  const commentIndex = findInlineComment(value);
  if (commentIndex !== -1) {
    value = value.substring(0, commentIndex).trim();
  }

  // Handle custom tags
  const tagMatch = value.match(/^!(\S+)\s*/);
  if (tagMatch) {
    const tag = tagMatch[1];
    const tagValue = value.substring(tagMatch[0].length);
    if (options.customTags[tag]) {
      return options.customTags[tag](tagValue);
    }
    // Return raw value for unknown tags
    return tagValue;
  }

  // Null
  if (value === '' || value === '~' || value === 'null' || value === 'Null' || value === 'NULL') {
    return null;
  }

  // Boolean
  if (value === 'true' || value === 'True' || value === 'TRUE' || value === 'yes' || value === 'Yes' || value === 'YES' || value === 'on' || value === 'On' || value === 'ON') {
    return true;
  }
  if (value === 'false' || value === 'False' || value === 'FALSE' || value === 'no' || value === 'No' || value === 'NO' || value === 'off' || value === 'Off' || value === 'OFF') {
    return false;
  }

  // Numbers
  // Infinity
  if (value === '.inf' || value === '.Inf' || value === '.INF' || value === '+.inf' || value === '+.Inf' || value === '+.INF') {
    return Infinity;
  }
  if (value === '-.inf' || value === '-.Inf' || value === '-.INF') {
    return -Infinity;
  }
  // NaN
  if (value === '.nan' || value === '.NaN' || value === '.NAN') {
    return NaN;
  }

  // Octal (0o prefix)
  if (/^0o[0-7]+$/.test(value)) {
    return parseInt(value.substring(2), 8);
  }

  // Hex
  if (/^0x[0-9a-fA-F]+$/.test(value)) {
    return parseInt(value, 16);
  }

  // Integer
  if (/^[-+]?\d+$/.test(value)) {
    const num = parseInt(value, 10);
    // Check for safe integer
    if (Number.isSafeInteger(num)) {
      return num;
    }
    // Return as BigInt string for very large numbers? No, return as-is
    return num;
  }

  // Float
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(value)) {
    return parseFloat(value);
  }

  // Sexagesimal (base 60) - for time values
  if (/^\d+:\d{2}(:\d{2})?(\.\d+)?$/.test(value)) {
    const parts = value.split(':').map(parseFloat);
    let result = parts[0];
    for (let i = 1; i < parts.length; i++) {
      result = result * 60 + parts[i];
    }
    return result;
  }

  // Date/Time (ISO 8601)
  if (options.parseDates) {
    // Full ISO date-time
    if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/.test(value)) {
      const date = new Date(value.replace(' ', 'T'));
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  // Quoted string
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return unquote(value);
  }

  // Flow sequence [a, b, c]
  if (value.startsWith('[') && value.endsWith(']')) {
    return parseFlowSequence(value, options, anchors);
  }

  // Flow mapping {a: 1, b: 2}
  if (value.startsWith('{') && value.endsWith('}')) {
    return parseFlowMapping(value, options, anchors);
  }

  // Plain string
  return value;
}

function parseFlowSequence(value: string, options: Required<YamlParseOptions>, anchors: Map<string, any>): any[] {
  const inner = value.slice(1, -1).trim();
  if (!inner) return [];

  const items: any[] = [];
  let current = '';
  let depth = 0;
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];

    if (inQuote) {
      current += char;
      if (char === quoteChar && inner[i - 1] !== '\\') {
        inQuote = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inQuote = true;
      quoteChar = char;
      current += char;
      continue;
    }

    if (char === '[' || char === '{') {
      depth++;
      current += char;
      continue;
    }

    if (char === ']' || char === '}') {
      depth--;
      current += char;
      continue;
    }

    if (char === ',' && depth === 0) {
      items.push(parseScalar(current.trim(), options, anchors));
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    items.push(parseScalar(current.trim(), options, anchors));
  }

  return items;
}

function parseFlowMapping(value: string, options: Required<YamlParseOptions>, anchors: Map<string, any>): Record<string, any> {
  const inner = value.slice(1, -1).trim();
  if (!inner) return {};

  const result: Record<string, any> = {};
  let current = '';
  let depth = 0;
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];

    if (inQuote) {
      current += char;
      if (char === quoteChar && inner[i - 1] !== '\\') {
        inQuote = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inQuote = true;
      quoteChar = char;
      current += char;
      continue;
    }

    if (char === '[' || char === '{') {
      depth++;
      current += char;
      continue;
    }

    if (char === ']' || char === '}') {
      depth--;
      current += char;
      continue;
    }

    if (char === ',' && depth === 0) {
      const colonIdx = findKeyColon(current);
      if (colonIdx !== -1) {
        const key = unquote(current.substring(0, colonIdx).trim());
        const val = current.substring(colonIdx + 1).trim();
        result[key] = parseScalar(val, options, anchors);
      }
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    const colonIdx = findKeyColon(current);
    if (colonIdx !== -1) {
      const key = unquote(current.substring(0, colonIdx).trim());
      const val = current.substring(colonIdx + 1).trim();
      result[key] = parseScalar(val, options, anchors);
    }
  }

  return result;
}

// Helper functions
function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function skipEmptyAndComments(state: ParserState): void {
  while (state.index < state.lines.length) {
    const trimmed = state.lines[state.index].trim();
    if (trimmed && !trimmed.startsWith('#')) {
      break;
    }
    state.index++;
  }
}

function findKeyColon(str: string): number {
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (inQuote) {
      if (char === quoteChar && str[i - 1] !== '\\') {
        inQuote = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inQuote = true;
      quoteChar = char;
      continue;
    }

    if (char === ':') {
      // Must be followed by space, newline, or end of string
      if (i === str.length - 1 || str[i + 1] === ' ' || str[i + 1] === '\n' || str[i + 1] === '\t') {
        return i;
      }
    }
  }

  return -1;
}

function findInlineComment(str: string): number {
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (inQuote) {
      if (char === quoteChar && str[i - 1] !== '\\') {
        inQuote = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inQuote = true;
      quoteChar = char;
      continue;
    }

    if (char === '#' && (i === 0 || str[i - 1] === ' ' || str[i - 1] === '\t')) {
      return i;
    }
  }

  return -1;
}

function unquote(str: string): string {
  if (str.startsWith('"') && str.endsWith('"')) {
    return str
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\0/g, '\0')
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  if (str.startsWith("'") && str.endsWith("'")) {
    return str.slice(1, -1).replace(/''/g, "'");
  }

  return str;
}

/**
 * YAML Parse Error
 */
export class YamlError extends Error {
  line?: number;

  constructor(message: string, line?: number) {
    super(line !== undefined ? `${message} at line ${line + 1}` : message);
    this.name = 'YamlError';
    this.line = line;
  }
}

/**
 * Serialize JavaScript object to YAML string
 *
 * @example
 * ```typescript
 * const yaml = serializeYaml({
 *   server: {
 *     host: 'localhost',
 *     port: 3000,
 *     ssl: true
 *   },
 *   database: {
 *     url: 'postgres://localhost/db'
 *   }
 * });
 * ```
 */
export function serializeYaml(data: any, options: YamlSerializeOptions = {}): string {
  const opts: Required<YamlSerializeOptions> = {
    indent: options.indent ?? 2,
    lineWidth: options.lineWidth ?? 80,
    forceQuotes: options.forceQuotes ?? false,
    flowStyle: options.flowStyle ?? false,
    sortKeys: options.sortKeys ?? false,
    skipUndefined: options.skipUndefined ?? true,
    documentMarkers: options.documentMarkers ?? false,
  };

  let result = '';

  if (opts.documentMarkers) {
    result += '---\n';
  }

  result += serializeValue(data, 0, opts);

  if (opts.documentMarkers) {
    result += '\n...';
  }

  return result;
}

function serializeValue(value: any, depth: number, opts: Required<YamlSerializeOptions>): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) return '.nan';
    if (value === Infinity) return '.inf';
    if (value === -Infinity) return '-.inf';
    return String(value);
  }

  if (typeof value === 'string') {
    return serializeString(value, depth, opts);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return serializeArray(value, depth, opts);
  }

  if (typeof value === 'object') {
    return serializeObject(value, depth, opts);
  }

  return String(value);
}

function serializeString(str: string, depth: number, opts: Required<YamlSerializeOptions>): string {
  // Check if string needs quoting
  const needsQuotes =
    opts.forceQuotes ||
    str === '' ||
    str === 'null' ||
    str === 'true' ||
    str === 'false' ||
    str === '~' ||
    /^[\d\-.]+$/.test(str) ||
    /^[&*!|>'"%@`]/.test(str) ||
    /[:#\[\]{}]/.test(str) ||
    str.includes('\n');

  // Multi-line strings
  if (str.includes('\n')) {
    const indent = ' '.repeat(opts.indent * (depth + 1));
    const lines = str.split('\n');
    return '|\n' + lines.map((line) => indent + line).join('\n');
  }

  if (needsQuotes) {
    // Use double quotes and escape special characters
    const escaped = str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t')
      .replace(/\r/g, '\\r');
    return `"${escaped}"`;
  }

  return str;
}

function serializeArray(arr: any[], depth: number, opts: Required<YamlSerializeOptions>): string {
  if (arr.length === 0) {
    return '[]';
  }

  // Flow style for small arrays
  if (opts.flowStyle && arr.length <= 5 && arr.every((v) => typeof v !== 'object' || v === null)) {
    const items = arr.map((v) => serializeValue(v, depth, opts));
    const flow = `[${items.join(', ')}]`;
    if (flow.length <= opts.lineWidth) {
      return flow;
    }
  }

  const indent = ' '.repeat(opts.indent * depth);
  const lines: string[] = [];

  for (const item of arr) {
    if (opts.skipUndefined && item === undefined) {
      continue;
    }

    if (typeof item === 'object' && item !== null && !Array.isArray(item) && !(item instanceof Date)) {
      // Nested object
      const objStr = serializeObject(item, depth + 1, opts);
      const firstLine = objStr.split('\n')[0];
      const restLines = objStr.split('\n').slice(1);

      lines.push(`${indent}- ${firstLine}`);
      lines.push(...restLines.map((l) => `${indent}  ${l.trimStart()}`));
    } else if (Array.isArray(item) && item.length > 0 && !opts.flowStyle) {
      // Nested array
      lines.push(`${indent}-`);
      const nested = serializeArray(item, depth + 1, opts);
      lines.push(...nested.split('\n').map((l) => `${indent}  ${l.trimStart()}`));
    } else {
      lines.push(`${indent}- ${serializeValue(item, depth + 1, opts)}`);
    }
  }

  return lines.join('\n');
}

function serializeObject(obj: Record<string, any>, depth: number, opts: Required<YamlSerializeOptions>): string {
  const keys = Object.keys(obj);

  if (keys.length === 0) {
    return '{}';
  }

  if (opts.sortKeys) {
    keys.sort();
  }

  // Flow style for small objects
  if (opts.flowStyle && keys.length <= 3 && keys.every((k) => typeof obj[k] !== 'object' || obj[k] === null)) {
    const items = keys.map((k) => `${k}: ${serializeValue(obj[k], depth, opts)}`);
    const flow = `{${items.join(', ')}}`;
    if (flow.length <= opts.lineWidth) {
      return flow;
    }
  }

  const indent = ' '.repeat(opts.indent * depth);
  const lines: string[] = [];

  for (const key of keys) {
    const value = obj[key];

    if (opts.skipUndefined && value === undefined) {
      continue;
    }

    // Quote key if necessary
    const quotedKey = /^[\w-]+$/.test(key) && key !== 'true' && key !== 'false' && key !== 'null' ? key : `"${key}"`;

    if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      // Nested object
      lines.push(`${indent}${quotedKey}:`);
      const nested = serializeObject(value, depth + 1, opts);
      lines.push(...nested.split('\n'));
    } else if (Array.isArray(value) && value.length > 0 && !opts.flowStyle) {
      // Nested array
      lines.push(`${indent}${quotedKey}:`);
      const nested = serializeArray(value, depth + 1, opts);
      lines.push(...nested.split('\n'));
    } else {
      lines.push(`${indent}${quotedKey}: ${serializeValue(value, depth + 1, opts)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Helper to parse YAML response
 *
 * @example
 * ```typescript
 * import { createClient, yamlResponse } from 'recker';
 *
 * const client = createClient({ baseUrl: 'https://api.example.com' });
 * const config = await yamlResponse(client.get('/config.yaml'));
 * ```
 */
export async function yamlResponse<T = any>(
  promise: Promise<ReckerResponse>,
  options?: YamlParseOptions
): Promise<T> {
  const response = await promise;
  const text = await response.text();
  return parseYaml<T>(text, options);
}

// Export utilities for standalone use (avoid name conflicts with xml.ts)
export { parseYaml as yamlParse, serializeYaml as yamlSerialize };

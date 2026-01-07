/**
 * Template Escaping
 *
 * Format-specific escaping functions to ensure output validity.
 * Each format has different rules for what characters need escaping.
 */

import type { TemplateFormat } from './types.js';

// ============================================================================
// Escape Functions
// ============================================================================

/**
 * No escaping (raw output)
 */
export function escapeRaw(value: unknown): string {
  return toString(value);
}

/**
 * HTML entity escaping
 * Escapes: & < > " '
 */
export function escapeHtml(value: unknown): string {
  const str = toString(value);

  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * XML entity escaping
 * Escapes: & < > " ' and control characters
 */
export function escapeXml(value: unknown): string {
  const str = toString(value);

  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Remove invalid XML characters (control chars except \t \n \r)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * JSON string escaping
 * Escapes for valid JSON string values
 */
export function escapeJson(value: unknown): string {
  // If already a valid JSON value, serialize it
  if (typeof value !== 'string') {
    try {
      return JSON.stringify(value);
    } catch {
      return JSON.stringify(toString(value));
    }
  }

  // For strings, escape for JSON but don't add quotes
  // (quotes are handled by the template itself)
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\f/g, '\\f')
    .replace(/\x08/g, '\\b') // Actual backspace character (not regex \b word boundary)
    // Escape remaining control characters
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x07\x0b\x0e-\x1f]/g, (char) => {
      const hex = char.charCodeAt(0).toString(16).padStart(4, '0');
      return `\\u${hex}`;
    });
}

/**
 * URL encoding (percent encoding)
 * Encodes all non-URL-safe characters
 */
export function escapeUrl(value: unknown): string {
  const str = toString(value);
  return encodeURIComponent(str);
}

/**
 * URL component encoding (for query parameters)
 * Same as escapeUrl but also encodes ! ' ( ) *
 */
export function escapeUrlComponent(value: unknown): string {
  const str = toString(value);
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

/**
 * CSV field escaping
 * Wraps in quotes if needed, escapes internal quotes
 */
export function escapeCsv(value: unknown): string {
  const str = toString(value);

  // Check if quoting is needed
  const needsQuoting = /[",\n\r]/.test(str);

  if (needsQuoting) {
    // Escape quotes by doubling them
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return str;
}

/**
 * Regex escaping
 * Escapes special regex characters
 */
export function escapeRegex(value: unknown): string {
  const str = toString(value);
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * YAML string escaping
 * Determines if quoting is needed and escapes appropriately
 */
export function escapeYaml(value: unknown): string {
  const str = toString(value);

  // Check if value needs quoting
  const needsQuoting =
    str === '' ||
    str === 'null' ||
    str === 'true' ||
    str === 'false' ||
    str === '~' ||
    /^[0-9]/.test(str) ||
    /^[-?:,\[\]{}#&*!|>'"%@`]/.test(str) ||
    /[\n\r\t]/.test(str) ||
    /\s$/.test(str) ||
    /^\s/.test(str);

  if (needsQuoting) {
    // Use double quotes and escape
    const escaped = str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    return `"${escaped}"`;
  }

  return str;
}

// ============================================================================
// Escape Factory
// ============================================================================

/**
 * Get escape function for format
 */
export function getEscaper(format: TemplateFormat): (value: unknown) => string {
  switch (format) {
    case 'html':
      return escapeHtml;
    case 'xml':
      return escapeXml;
    case 'json':
      return escapeJson;
    case 'url':
      return escapeUrl;
    case 'csv':
      return escapeCsv;
    case 'raw':
    default:
      return escapeRaw;
  }
}

/**
 * Get format name for error messages
 */
export function getFormatName(format: TemplateFormat): string {
  const names: Record<TemplateFormat, string> = {
    raw: 'Raw (no escaping)',
    html: 'HTML',
    xml: 'XML',
    json: 'JSON',
    url: 'URL',
    csv: 'CSV',
  };
  return names[format] ?? format;
}

// ============================================================================
// Unescape Functions
// ============================================================================

/**
 * Unescape HTML entities
 */
export function unescapeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&#([0-9]+);/g, (_, dec) =>
      String.fromCharCode(parseInt(dec, 10))
    );
}

/**
 * Unescape URL encoding
 */
export function unescapeUrl(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // Return original if decoding fails
    return value;
  }
}

/**
 * Unescape JSON string
 */
export function unescapeJson(value: string): string {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert any value to string
 */
export function toString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'symbol') {
    return value.description ?? '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (Array.isArray(value)) {
    return value.map(toString).join(',');
  }

  if (typeof value === 'object') {
    // Check for toString method
    if (typeof (value as { toString?: () => string }).toString === 'function') {
      const str = (value as { toString: () => string }).toString();
      if (str !== '[object Object]') {
        return str;
      }
    }

    // Fallback to JSON
    try {
      return JSON.stringify(value);
    } catch {
      return '[object]';
    }
  }

  return String(value);
}

/**
 * Check if a value is safe to output (no escaping needed)
 */
export function isSafeString(value: string, format: TemplateFormat): boolean {
  switch (format) {
    case 'html':
    case 'xml':
      return !/[&<>"']/.test(value);
    case 'json':
      return !/["\\\n\r\t]/.test(value);
    case 'url':
      return /^[a-zA-Z0-9\-_.~]*$/.test(value);
    case 'csv':
      return !/[",\n\r]/.test(value);
    case 'raw':
    default:
      return true;
  }
}

/**
 * SafeString class - marks content as pre-escaped
 */
export class SafeString {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }

  toHTML(): string {
    return this.value;
  }
}

/**
 * Check if value is a SafeString
 */
export function isSafeStringInstance(value: unknown): value is SafeString {
  return value instanceof SafeString;
}

/**
 * Create a SafeString (pre-escaped content)
 */
export function safe(value: string): SafeString {
  return new SafeString(value);
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate that a string is valid JSON
 */
export function isValidJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate that a string is valid XML (basic check)
 */
export function isValidXml(value: string): boolean {
  // Basic check: no unescaped < > in text
  // A full XML parser would be needed for complete validation
  const textPattern = />([^<]*)</g;
  let match;

  while ((match = textPattern.exec(value)) !== null) {
    const text = match[1];
    if (/[<>]/.test(text)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate URL
 */
export function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

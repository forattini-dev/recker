/**
 * String Helpers
 *
 * Comprehensive string manipulation helpers.
 * 30+ helpers for common string operations.
 */

import type { TemplateHelper, HelperContext } from '../types.js';

// ============================================================================
// Case Conversion
// ============================================================================

/**
 * {{uppercase value}}
 */
export const uppercaseHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  return String(value ?? '').toUpperCase();
};

/**
 * {{lowercase value}}
 */
export const lowercaseHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  return String(value ?? '').toLowerCase();
};

/**
 * {{capitalize value}}
 *
 * Capitalizes first letter only.
 */
export const capitalizeHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  const str = String(value ?? '');
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * {{titleCase value}}
 *
 * Capitalizes first letter of each word.
 */
export const titleCaseHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  return String(value ?? '')
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * {{camelCase value}}
 */
export const camelCaseHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  return String(value ?? '')
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase())
    .replace(/^./, char => char.toLowerCase());
};

/**
 * {{pascalCase value}}
 */
export const pascalCaseHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  return String(value ?? '')
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase())
    .replace(/^./, char => char.toUpperCase());
};

/**
 * {{snakeCase value}}
 */
export const snakeCaseHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  return String(value ?? '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s\-]+/g, '_')
    .toLowerCase();
};

/**
 * {{kebabCase value}}
 */
export const kebabCaseHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  return String(value ?? '')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
};

/**
 * {{constantCase value}}
 *
 * SCREAMING_SNAKE_CASE
 */
export const constantCaseHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  return String(value ?? '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s\-]+/g, '_')
    .toUpperCase();
};

// ============================================================================
// Trimming & Padding
// ============================================================================

/**
 * {{trim value}}
 */
export const trimHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  return String(value ?? '').trim();
};

/**
 * {{ltrim value}}
 */
export const ltrimHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  return String(value ?? '').trimStart();
};

/**
 * {{rtrim value}}
 */
export const rtrimHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  return String(value ?? '').trimEnd();
};

/**
 * {{padStart value length char}}
 */
export const padStartHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  length: number = 10,
  char: string = ' '
): string {
  return String(value ?? '').padStart(length, char);
};

/**
 * {{padEnd value length char}}
 */
export const padEndHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  length: number = 10,
  char: string = ' '
): string {
  return String(value ?? '').padEnd(length, char);
};

/**
 * {{center value length char}}
 */
export const centerHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  length: number = 10,
  char: string = ' '
): string {
  const str = String(value ?? '');
  if (str.length >= length) return str;
  const padLength = length - str.length;
  const padLeft = Math.floor(padLength / 2);
  const padRight = padLength - padLeft;
  return char.repeat(padLeft) + str + char.repeat(padRight);
};

// ============================================================================
// Substring Operations
// ============================================================================

/**
 * {{truncate value length suffix}}
 */
export const truncateHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  length: number = 50,
  suffix: string = '...'
): string {
  const str = String(value ?? '');
  if (str.length <= length) return str;
  return str.slice(0, length - suffix.length) + suffix;
};

/**
 * {{truncateWords value count suffix}}
 */
export const truncateWordsHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  count: number = 10,
  suffix: string = '...'
): string {
  const str = String(value ?? '');
  const words = str.split(/\s+/);
  if (words.length <= count) return str;
  return words.slice(0, count).join(' ') + suffix;
};

/**
 * {{substring value start end}}
 */
export const substringHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  start: number = 0,
  end?: number
): string {
  return String(value ?? '').substring(start, end);
};

/**
 * {{slice value start end}}
 */
export const sliceHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  start: number = 0,
  end?: number
): string {
  return String(value ?? '').slice(start, end);
};

/**
 * {{charAt value index}}
 */
export const charAtHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  index: number = 0
): string {
  return String(value ?? '').charAt(index);
};

// ============================================================================
// Search & Replace
// ============================================================================

/**
 * {{replace value search replacement}}
 */
export const replaceHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  search: string,
  replacement: string = ''
): string {
  return String(value ?? '').replaceAll(search, replacement);
};

/**
 * {{replaceFirst value search replacement}}
 */
export const replaceFirstHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  search: string,
  replacement: string = ''
): string {
  return String(value ?? '').replace(search, replacement);
};

/**
 * {{regexReplace value pattern replacement flags}}
 */
export const regexReplaceHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  pattern: string,
  replacement: string = '',
  flags: string = 'g'
): string {
  const regex = new RegExp(pattern, flags);
  return String(value ?? '').replace(regex, replacement);
};

/**
 * {{contains value search}}
 */
export const containsHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  search: string
): boolean {
  return String(value ?? '').includes(search);
};

/**
 * {{startsWith value prefix}}
 */
export const startsWithHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  prefix: string
): boolean {
  return String(value ?? '').startsWith(prefix);
};

/**
 * {{endsWith value suffix}}
 */
export const endsWithHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  suffix: string
): boolean {
  return String(value ?? '').endsWith(suffix);
};

/**
 * {{indexOf value search}}
 */
export const indexOfHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  search: string
): number {
  return String(value ?? '').indexOf(search);
};

/**
 * {{match value pattern flags}}
 */
export const matchHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  pattern: string,
  flags: string = ''
): string[] | null {
  const regex = new RegExp(pattern, flags);
  return String(value ?? '').match(regex);
};

// ============================================================================
// Split & Join
// ============================================================================

/**
 * {{split value separator}}
 */
export const splitHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  separator: string = ','
): string[] {
  return String(value ?? '').split(separator);
};

/**
 * {{join array separator}}
 */
export const joinHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  separator: string = ', '
): string {
  if (Array.isArray(value)) {
    return value.join(separator);
  }
  return String(value ?? '');
};

/**
 * {{words value}}
 *
 * Splits into words.
 */
export const wordsHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string[] {
  return String(value ?? '').split(/\s+/).filter(Boolean);
};

/**
 * {{lines value}}
 *
 * Splits into lines.
 */
export const linesHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string[] {
  return String(value ?? '').split(/\r?\n/);
};

// ============================================================================
// Repetition & Formatting
// ============================================================================

/**
 * {{repeat value count}}
 */
export const repeatHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  count: number = 1
): string {
  return String(value ?? '').repeat(Math.max(0, count));
};

/**
 * {{reverse value}}
 */
export const reverseHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  return String(value ?? '').split('').reverse().join('');
};

/**
 * {{wrap value before after}}
 */
export const wrapHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  before: string = '',
  after?: string
): string {
  return before + String(value ?? '') + (after ?? before);
};

/**
 * {{quote value}}
 */
export const quoteHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  quoteChar: string = '"'
): string {
  return quoteChar + String(value ?? '') + quoteChar;
};

/**
 * {{stripTags value}}
 *
 * Removes HTML tags.
 */
export const stripTagsHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  return String(value ?? '').replace(/<[^>]*>/g, '');
};

/**
 * {{nl2br value}}
 *
 * Converts newlines to <br> tags.
 */
export const nl2brHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  return String(value ?? '').replace(/\n/g, '<br>');
};

/**
 * {{slugify value}}
 *
 * Creates URL-friendly slug.
 */
export const slugifyHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// ============================================================================
// Length & Counting
// ============================================================================

/**
 * {{length value}}
 */
export const lengthHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): number {
  if (Array.isArray(value)) return value.length;
  return String(value ?? '').length;
};

/**
 * {{wordCount value}}
 */
export const wordCountHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): number {
  return String(value ?? '').split(/\s+/).filter(Boolean).length;
};

/**
 * {{lineCount value}}
 */
export const lineCountHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): number {
  return String(value ?? '').split(/\r?\n/).length;
};

/**
 * {{countOccurrences value search}}
 */
export const countOccurrencesHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  search: string
): number {
  const str = String(value ?? '');
  return (str.match(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
};

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * {{isEmpty value}}
 */
export const isEmptyHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): boolean {
  const str = String(value ?? '');
  return str.trim() === '';
};

/**
 * {{isBlank value}}
 */
export const isBlankHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): boolean {
  return value === null || value === undefined || String(value).trim() === '';
};

/**
 * {{isNumeric value}}
 */
export const isNumericHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): boolean {
  return !isNaN(parseFloat(String(value))) && isFinite(Number(value));
};

/**
 * {{isEmail value}}
 */
export const isEmailHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(String(value ?? ''));
};

/**
 * {{isUrl value}}
 */
export const isUrlHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): boolean {
  try {
    new URL(String(value ?? ''));
    return true;
  } catch {
    return false;
  }
};

// ============================================================================
// Export all string helpers
// ============================================================================

export const stringHelpers: Record<string, TemplateHelper> = {
  // Case conversion
  uppercase: uppercaseHelper,
  lowercase: lowercaseHelper,
  capitalize: capitalizeHelper,
  titleCase: titleCaseHelper,
  camelCase: camelCaseHelper,
  pascalCase: pascalCaseHelper,
  snakeCase: snakeCaseHelper,
  kebabCase: kebabCaseHelper,
  constantCase: constantCaseHelper,

  // Trimming & padding
  trim: trimHelper,
  ltrim: ltrimHelper,
  rtrim: rtrimHelper,
  padStart: padStartHelper,
  padEnd: padEndHelper,
  center: centerHelper,

  // Substring
  truncate: truncateHelper,
  truncateWords: truncateWordsHelper,
  substring: substringHelper,
  slice: sliceHelper,
  charAt: charAtHelper,

  // Search & replace
  replace: replaceHelper,
  replaceFirst: replaceFirstHelper,
  regexReplace: regexReplaceHelper,
  contains: containsHelper,
  startsWith: startsWithHelper,
  endsWith: endsWithHelper,
  indexOf: indexOfHelper,
  match: matchHelper,

  // Split & join
  split: splitHelper,
  join: joinHelper,
  words: wordsHelper,
  lines: linesHelper,

  // Repetition & formatting
  repeat: repeatHelper,
  reverse: reverseHelper,
  wrap: wrapHelper,
  quote: quoteHelper,
  stripTags: stripTagsHelper,
  nl2br: nl2brHelper,
  slugify: slugifyHelper,

  // Length & counting
  length: lengthHelper,
  wordCount: wordCountHelper,
  lineCount: lineCountHelper,
  countOccurrences: countOccurrencesHelper,

  // Validation
  isEmpty: isEmptyHelper,
  isBlank: isBlankHelper,
  isNumeric: isNumericHelper,
  isEmail: isEmailHelper,
  isUrl: isUrlHelper,
};

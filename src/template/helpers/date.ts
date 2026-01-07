/**
 * Date/Time Helpers
 *
 * Helpers for date and time operations in templates.
 */

import type { TemplateHelper, HelperContext } from '../types.js';

// ============================================================================
// Current Time Helpers
// ============================================================================

/**
 * {{timestamp}}
 *
 * Returns current Unix timestamp in seconds.
 */
export const timestampHelper: TemplateHelper = function(
  this: HelperContext
): number {
  return Math.floor(Date.now() / 1000);
};

/**
 * {{timestampMs}}
 *
 * Returns current Unix timestamp in milliseconds.
 */
export const timestampMsHelper: TemplateHelper = function(
  this: HelperContext
): number {
  return Date.now();
};

/**
 * {{now}} or {{now "YYYY-MM-DD"}}
 *
 * Returns current date/time formatted.
 */
export const nowHelper: TemplateHelper = function(
  this: HelperContext,
  format?: string
): string {
  return formatDate(new Date(), format);
};

/**
 * {{today}}
 *
 * Returns today's date (YYYY-MM-DD).
 */
export const todayHelper: TemplateHelper = function(
  this: HelperContext
): string {
  return formatDate(new Date(), 'YYYY-MM-DD');
};

/**
 * {{isoDate}} or {{isoDate value}}
 *
 * Returns ISO 8601 date string.
 */
export const isoDateHelper: TemplateHelper = function(
  this: HelperContext,
  value?: unknown
): string {
  const date = value ? toDate(value) : new Date();
  return date.toISOString();
};

// ============================================================================
// Date Parsing
// ============================================================================

/**
 * {{date value}} or {{date value "YYYY-MM-DD"}}
 *
 * Parses and formats a date.
 */
export const dateHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown,
  format?: string
): string {
  const date = toDate(value);
  return formatDate(date, format);
};

/**
 * {{parseDate value}}
 *
 * Parses a date string and returns timestamp.
 */
export const parseDateHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): number {
  return toDate(value).getTime();
};

// ============================================================================
// Date Arithmetic
// ============================================================================

/**
 * {{dateAdd value amount unit}} or {{dateAdd amount unit}}
 *
 * Adds time to a date.
 * Units: years, months, weeks, days, hours, minutes, seconds
 */
export const dateAddHelper: TemplateHelper = function(
  this: HelperContext,
  valueOrAmount: unknown,
  amountOrUnit?: number | string,
  unit?: string
): string {
  let date: Date;
  let amount: number;
  let actualUnit: string;

  if (typeof amountOrUnit === 'string') {
    // dateAdd amount unit (uses current date)
    date = new Date();
    amount = Number(valueOrAmount);
    actualUnit = amountOrUnit;
  } else {
    // dateAdd value amount unit
    date = toDate(valueOrAmount);
    amount = Number(amountOrUnit);
    actualUnit = String(unit ?? 'days');
  }

  const result = addToDate(date, amount, actualUnit);
  return result.toISOString();
};

/**
 * {{dateSub value amount unit}} or {{dateSub amount unit}}
 *
 * Subtracts time from a date.
 */
export const dateSubHelper: TemplateHelper = function(
  this: HelperContext,
  valueOrAmount: unknown,
  amountOrUnit?: number | string,
  unit?: string
): string {
  let date: Date;
  let amount: number;
  let actualUnit: string;

  if (typeof amountOrUnit === 'string') {
    date = new Date();
    amount = -Number(valueOrAmount);
    actualUnit = amountOrUnit;
  } else {
    date = toDate(valueOrAmount);
    amount = -Number(amountOrUnit);
    actualUnit = String(unit ?? 'days');
  }

  const result = addToDate(date, amount, actualUnit);
  return result.toISOString();
};

/**
 * {{dateDiff date1 date2 unit}}
 *
 * Returns difference between two dates.
 * Units: years, months, weeks, days, hours, minutes, seconds
 */
export const dateDiffHelper: TemplateHelper = function(
  this: HelperContext,
  date1: unknown,
  date2: unknown,
  unit: string = 'days'
): number {
  const d1 = toDate(date1);
  const d2 = toDate(date2);
  const diffMs = d2.getTime() - d1.getTime();

  switch (unit.toLowerCase()) {
    case 'years':
    case 'year':
    case 'y':
      return diffMs / (365.25 * 24 * 60 * 60 * 1000);
    case 'months':
    case 'month':
    case 'M':
      return diffMs / (30.44 * 24 * 60 * 60 * 1000);
    case 'weeks':
    case 'week':
    case 'w':
      return diffMs / (7 * 24 * 60 * 60 * 1000);
    case 'days':
    case 'day':
    case 'd':
      return diffMs / (24 * 60 * 60 * 1000);
    case 'hours':
    case 'hour':
    case 'h':
      return diffMs / (60 * 60 * 1000);
    case 'minutes':
    case 'minute':
    case 'm':
      return diffMs / (60 * 1000);
    case 'seconds':
    case 'second':
    case 's':
      return diffMs / 1000;
    case 'milliseconds':
    case 'ms':
      return diffMs;
    default:
      return diffMs / (24 * 60 * 60 * 1000); // Default to days
  }
};

// ============================================================================
// Date Parts
// ============================================================================

/**
 * {{year value}}
 */
export const yearHelper: TemplateHelper = function(
  this: HelperContext,
  value?: unknown
): number {
  const date = value ? toDate(value) : new Date();
  return date.getFullYear();
};

/**
 * {{month value}}
 */
export const monthHelper: TemplateHelper = function(
  this: HelperContext,
  value?: unknown
): number {
  const date = value ? toDate(value) : new Date();
  return date.getMonth() + 1;
};

/**
 * {{day value}}
 */
export const dayHelper: TemplateHelper = function(
  this: HelperContext,
  value?: unknown
): number {
  const date = value ? toDate(value) : new Date();
  return date.getDate();
};

/**
 * {{hour value}}
 */
export const hourHelper: TemplateHelper = function(
  this: HelperContext,
  value?: unknown
): number {
  const date = value ? toDate(value) : new Date();
  return date.getHours();
};

/**
 * {{minute value}}
 */
export const minuteHelper: TemplateHelper = function(
  this: HelperContext,
  value?: unknown
): number {
  const date = value ? toDate(value) : new Date();
  return date.getMinutes();
};

/**
 * {{second value}}
 */
export const secondHelper: TemplateHelper = function(
  this: HelperContext,
  value?: unknown
): number {
  const date = value ? toDate(value) : new Date();
  return date.getSeconds();
};

/**
 * {{weekday value}}
 *
 * Returns day of week (0-6, Sunday = 0).
 */
export const weekdayHelper: TemplateHelper = function(
  this: HelperContext,
  value?: unknown
): number {
  const date = value ? toDate(value) : new Date();
  return date.getDay();
};

/**
 * {{weekdayName value}}
 *
 * Returns day of week name.
 */
export const weekdayNameHelper: TemplateHelper = function(
  this: HelperContext,
  value?: unknown
): string {
  const date = value ? toDate(value) : new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
};

/**
 * {{monthName value}}
 *
 * Returns month name.
 */
export const monthNameHelper: TemplateHelper = function(
  this: HelperContext,
  value?: unknown
): string {
  const date = value ? toDate(value) : new Date();
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return months[date.getMonth()];
};

// ============================================================================
// Date Comparison
// ============================================================================

/**
 * {{isPast value}}
 */
export const isPastHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): boolean {
  return toDate(value).getTime() < Date.now();
};

/**
 * {{isFuture value}}
 */
export const isFutureHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): boolean {
  return toDate(value).getTime() > Date.now();
};

/**
 * {{isToday value}}
 */
export const isTodayHelper: TemplateHelper = function(
  this: HelperContext,
  value: unknown
): boolean {
  const date = toDate(value);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert value to Date
 */
function toDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'number') {
    // Assume seconds if small, milliseconds if large
    if (value < 10000000000) {
      return new Date(value * 1000);
    }
    return new Date(value);
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!isNaN(parsed)) {
      return new Date(parsed);
    }
  }
  return new Date();
}

/**
 * Format date with pattern
 */
function formatDate(date: Date, format?: string): string {
  if (!format) {
    return date.toISOString();
  }

  const pad = (n: number, len: number = 2): string => String(n).padStart(len, '0');

  return format
    .replace('YYYY', String(date.getFullYear()))
    .replace('YY', String(date.getFullYear()).slice(-2))
    .replace('MM', pad(date.getMonth() + 1))
    .replace('M', String(date.getMonth() + 1))
    .replace('DD', pad(date.getDate()))
    .replace('D', String(date.getDate()))
    .replace('HH', pad(date.getHours()))
    .replace('H', String(date.getHours()))
    .replace('hh', pad(date.getHours() % 12 || 12))
    .replace('h', String(date.getHours() % 12 || 12))
    .replace('mm', pad(date.getMinutes()))
    .replace('m', String(date.getMinutes()))
    .replace('ss', pad(date.getSeconds()))
    .replace('s', String(date.getSeconds()))
    .replace('SSS', pad(date.getMilliseconds(), 3))
    .replace('A', date.getHours() >= 12 ? 'PM' : 'AM')
    .replace('a', date.getHours() >= 12 ? 'pm' : 'am')
    .replace('Z', formatTimezone(date.getTimezoneOffset()));
}

/**
 * Format timezone offset
 */
function formatTimezone(offset: number): string {
  const sign = offset <= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);
  const hours = Math.floor(absOffset / 60);
  const minutes = absOffset % 60;
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Add time to date
 */
function addToDate(date: Date, amount: number, unit: string): Date {
  const result = new Date(date);

  switch (unit.toLowerCase()) {
    case 'years':
    case 'year':
    case 'y':
      result.setFullYear(result.getFullYear() + amount);
      break;
    case 'months':
    case 'month':
    case 'M':
      result.setMonth(result.getMonth() + amount);
      break;
    case 'weeks':
    case 'week':
    case 'w':
      result.setDate(result.getDate() + amount * 7);
      break;
    case 'days':
    case 'day':
    case 'd':
      result.setDate(result.getDate() + amount);
      break;
    case 'hours':
    case 'hour':
    case 'h':
      result.setHours(result.getHours() + amount);
      break;
    case 'minutes':
    case 'minute':
    case 'm':
      result.setMinutes(result.getMinutes() + amount);
      break;
    case 'seconds':
    case 'second':
    case 's':
      result.setSeconds(result.getSeconds() + amount);
      break;
    default:
      result.setDate(result.getDate() + amount);
  }

  return result;
}

// ============================================================================
// Export all date helpers
// ============================================================================

export const dateHelpers: Record<string, TemplateHelper> = {
  // Current time
  timestamp: timestampHelper,
  timestampMs: timestampMsHelper,
  now: nowHelper,
  today: todayHelper,
  isoDate: isoDateHelper,

  // Date parsing
  date: dateHelper,
  parseDate: parseDateHelper,

  // Date arithmetic
  dateAdd: dateAddHelper,
  dateSub: dateSubHelper,
  dateDiff: dateDiffHelper,

  // Date parts
  year: yearHelper,
  month: monthHelper,
  day: dayHelper,
  hour: hourHelper,
  minute: minuteHelper,
  second: secondHelper,
  weekday: weekdayHelper,
  weekdayName: weekdayNameHelper,
  monthName: monthNameHelper,

  // Comparison
  isPast: isPastHelper,
  isFuture: isFutureHelper,
  isToday: isTodayHelper,
};

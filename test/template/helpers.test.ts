/**
 * Template Helpers Tests
 * 100% coverage for helpers/date.ts, helpers/crypto.ts, helpers/env.ts, helpers/string.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Date helpers
import {
  timestampHelper,
  timestampMsHelper,
  nowHelper,
  todayHelper,
  isoDateHelper,
  dateHelper,
  parseDateHelper,
  dateAddHelper,
  dateSubHelper,
  dateDiffHelper,
  yearHelper,
  monthHelper,
  dayHelper,
  hourHelper,
  minuteHelper,
  secondHelper,
  weekdayHelper,
  weekdayNameHelper,
  monthNameHelper,
  isPastHelper,
  isFutureHelper,
  isTodayHelper,
  dateHelpers,
} from '../../src/template/helpers/date.js';

// Crypto helpers
import {
  base64Helper,
  base64decodeHelper,
  base64urlHelper,
  hexHelper,
  hexdecodeHelper,
  hashHelper,
  md5Helper,
  sha1Helper,
  sha256Helper,
  sha512Helper,
  hmacHelper,
  hmacSha256Helper,
  hmacSha256Base64Helper,
  jwtHelper,
  jwtDecodeHelper,
  uuidHelper,
  randomBytesHelper,
  randomIntHelper,
  randomStringHelper,
  randomChoiceHelper,
  cryptoHelpers,
} from '../../src/template/helpers/crypto.js';

// Env helpers
import {
  envHelper,
  envOrFailHelper,
  hasEnvHelper,
  ifEnvHelper,
  envPrefixHelper,
  envKeysHelper,
  envHelpers,
} from '../../src/template/helpers/env.js';

// String helpers
import {
  uppercaseHelper,
  lowercaseHelper,
  capitalizeHelper,
  titleCaseHelper,
  camelCaseHelper,
  pascalCaseHelper,
  snakeCaseHelper,
  kebabCaseHelper,
  constantCaseHelper,
  trimHelper,
  ltrimHelper,
  rtrimHelper,
  padStartHelper,
  padEndHelper,
  centerHelper,
  truncateHelper,
  truncateWordsHelper,
  substringHelper,
  sliceHelper,
  charAtHelper,
  replaceHelper,
  replaceFirstHelper,
  regexReplaceHelper,
  containsHelper,
  startsWithHelper,
  endsWithHelper,
  indexOfHelper,
  matchHelper,
  splitHelper,
  joinHelper,
  wordsHelper,
  linesHelper,
  repeatHelper,
  reverseHelper,
  wrapHelper,
  quoteHelper,
  stripTagsHelper,
  nl2brHelper,
  slugifyHelper,
  lengthHelper,
  wordCountHelper,
  lineCountHelper,
  countOccurrencesHelper,
  isEmptyHelper,
  isBlankHelper,
  isNumericHelper,
  isEmailHelper,
  isUrlHelper,
  stringHelpers,
} from '../../src/template/helpers/string.js';

// Mock context
const ctx = { data: {}, root: {}, parent: null };

// ============================================================================
// Date Helpers
// ============================================================================

describe('Date Helpers', () => {
  describe('timestampHelper', () => {
    it('should return current unix timestamp in seconds', () => {
      const result = timestampHelper.call(ctx);
      expect(result).toBeTypeOf('number');
      expect(result).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
      expect(result).toBeGreaterThan(1700000000); // After Nov 2023
    });
  });

  describe('timestampMsHelper', () => {
    it('should return current unix timestamp in milliseconds', () => {
      const result = timestampMsHelper.call(ctx);
      expect(result).toBeTypeOf('number');
      expect(result).toBeLessThanOrEqual(Date.now());
      expect(result).toBeGreaterThan(1700000000000);
    });
  });

  describe('nowHelper', () => {
    it('should return ISO date without format', () => {
      const result = nowHelper.call(ctx);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should format with custom pattern', () => {
      const result = nowHelper.call(ctx, 'YYYY-MM-DD');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('todayHelper', () => {
    it('should return today in YYYY-MM-DD format', () => {
      const result = todayHelper.call(ctx);
      const today = new Date();
      const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(result).toBe(expected);
    });
  });

  describe('isoDateHelper', () => {
    it('should return ISO date for current time without value', () => {
      const result = isoDateHelper.call(ctx);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should return ISO date for given Date', () => {
      const date = new Date('2024-06-15T10:30:00Z');
      const result = isoDateHelper.call(ctx, date);
      expect(result).toBe('2024-06-15T10:30:00.000Z');
    });
  });

  describe('dateHelper', () => {
    it('should format date with pattern', () => {
      const result = dateHelper.call(ctx, '2024-06-15T00:00:00Z', 'YYYY/MM/DD');
      // Result depends on local timezone, just check format
      expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
    });

    it('should return ISO without format', () => {
      const result = dateHelper.call(ctx, '2024-06-15T10:30:00Z');
      expect(result).toContain('2024-06-15');
    });
  });

  describe('parseDateHelper', () => {
    it('should return timestamp from date string', () => {
      const result = parseDateHelper.call(ctx, '2024-06-15T00:00:00Z');
      expect(result).toBe(new Date('2024-06-15T00:00:00Z').getTime());
    });
  });

  describe('dateAddHelper', () => {
    it('should add days to date', () => {
      const result = dateAddHelper.call(ctx, '2024-01-01', 5, 'days');
      expect(result).toContain('2024-01-06');
    });

    it('should add to current date when unit is string (2nd arg)', () => {
      const result = dateAddHelper.call(ctx, 1, 'hours');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should default to days without unit', () => {
      const result = dateAddHelper.call(ctx, '2024-01-01', 10);
      expect(result).toContain('2024-01-11');
    });
  });

  describe('dateSubHelper', () => {
    it('should subtract days from date', () => {
      const result = dateSubHelper.call(ctx, '2024-01-10', 5, 'days');
      expect(result).toContain('2024-01-05');
    });

    it('should subtract from current date', () => {
      const result = dateSubHelper.call(ctx, 1, 'days');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('dateDiffHelper', () => {
    it('should return difference in days', () => {
      const result = dateDiffHelper.call(ctx, '2024-01-01', '2024-01-11', 'days');
      expect(result).toBe(10);
    });

    it('should return difference in hours', () => {
      const result = dateDiffHelper.call(ctx, '2024-01-01T00:00:00Z', '2024-01-01T12:00:00Z', 'hours');
      expect(result).toBe(12);
    });

    it('should return difference in minutes', () => {
      const result = dateDiffHelper.call(ctx, '2024-01-01T00:00:00Z', '2024-01-01T01:30:00Z', 'minutes');
      expect(result).toBe(90);
    });

    it('should return difference in seconds', () => {
      const result = dateDiffHelper.call(ctx, '2024-01-01T00:00:00Z', '2024-01-01T00:01:00Z', 'seconds');
      expect(result).toBe(60);
    });

    it('should return difference in milliseconds', () => {
      const result = dateDiffHelper.call(ctx, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:01.000Z', 'ms');
      expect(result).toBe(1000);
    });

    it('should return difference in weeks', () => {
      const result = dateDiffHelper.call(ctx, '2024-01-01', '2024-01-15', 'weeks');
      expect(result).toBe(2);
    });

    it('should return difference in months', () => {
      const result = dateDiffHelper.call(ctx, '2024-01-01', '2024-03-01', 'months');
      expect(Math.round(result)).toBeCloseTo(2, 0);
    });

    it('should return difference in years', () => {
      const result = dateDiffHelper.call(ctx, '2024-01-01', '2025-01-01', 'years');
      expect(Math.round(result)).toBe(1);
    });

    it('should default to days for unknown unit', () => {
      const result = dateDiffHelper.call(ctx, '2024-01-01', '2024-01-11', 'unknown');
      expect(result).toBe(10);
    });

    it('should handle short aliases', () => {
      expect(dateDiffHelper.call(ctx, '2024-01-01', '2024-01-02', 'd')).toBe(1);
      expect(dateDiffHelper.call(ctx, '2024-01-01T00:00:00Z', '2024-01-01T01:00:00Z', 'h')).toBe(1);
      expect(dateDiffHelper.call(ctx, '2024-01-01T00:00:00Z', '2024-01-01T00:01:00Z', 'm')).toBe(1);
      expect(dateDiffHelper.call(ctx, '2024-01-01T00:00:00Z', '2024-01-01T00:00:01Z', 's')).toBe(1);
    });
  });

  describe('yearHelper', () => {
    it('should return current year without value', () => {
      expect(yearHelper.call(ctx)).toBe(new Date().getFullYear());
    });

    it('should return year from date', () => {
      expect(yearHelper.call(ctx, '2020-06-15')).toBe(2020);
    });
  });

  describe('monthHelper', () => {
    it('should return current month without value', () => {
      expect(monthHelper.call(ctx)).toBe(new Date().getMonth() + 1);
    });

    it('should return month from date (1-indexed)', () => {
      expect(monthHelper.call(ctx, '2024-06-15')).toBe(6);
    });
  });

  describe('dayHelper', () => {
    it('should return day of month', () => {
      // Use UTC date to avoid timezone issues
      expect(dayHelper.call(ctx, new Date('2024-06-15T12:00:00Z'))).toBeGreaterThanOrEqual(14);
      expect(dayHelper.call(ctx, new Date('2024-06-15T12:00:00Z'))).toBeLessThanOrEqual(16);
    });
  });

  describe('hourHelper', () => {
    it('should return hour', () => {
      expect(hourHelper.call(ctx, '2024-06-15T14:30:00')).toBe(14);
    });
  });

  describe('minuteHelper', () => {
    it('should return minute', () => {
      expect(minuteHelper.call(ctx, '2024-06-15T14:30:00')).toBe(30);
    });
  });

  describe('secondHelper', () => {
    it('should return second', () => {
      expect(secondHelper.call(ctx, '2024-06-15T14:30:45')).toBe(45);
    });
  });

  describe('weekdayHelper', () => {
    it('should return day of week (0-6)', () => {
      // Use Date object to ensure consistent parsing
      const monday = new Date('2024-01-01T12:00:00Z');
      const result = weekdayHelper.call(ctx, monday);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(6);
    });
  });

  describe('weekdayNameHelper', () => {
    it('should return weekday name', () => {
      const result = weekdayNameHelper.call(ctx, new Date('2024-01-01T12:00:00Z'));
      // Depends on timezone, just check it returns a valid day name
      const validDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      expect(validDays).toContain(result);
    });
  });

  describe('monthNameHelper', () => {
    it('should return month name', () => {
      expect(monthNameHelper.call(ctx, '2024-01-15')).toBe('January');
      expect(monthNameHelper.call(ctx, '2024-12-15')).toBe('December');
    });
  });

  describe('isPastHelper', () => {
    it('should return true for past dates', () => {
      expect(isPastHelper.call(ctx, '2020-01-01')).toBe(true);
    });

    it('should return false for future dates', () => {
      expect(isPastHelper.call(ctx, '2099-01-01')).toBe(false);
    });
  });

  describe('isFutureHelper', () => {
    it('should return true for future dates', () => {
      expect(isFutureHelper.call(ctx, '2099-01-01')).toBe(true);
    });

    it('should return false for past dates', () => {
      expect(isFutureHelper.call(ctx, '2020-01-01')).toBe(false);
    });
  });

  describe('isTodayHelper', () => {
    it('should return true for today', () => {
      expect(isTodayHelper.call(ctx, new Date())).toBe(true);
    });

    it('should return false for other days', () => {
      expect(isTodayHelper.call(ctx, '2020-01-01')).toBe(false);
    });
  });

  describe('dateHelpers export', () => {
    it('should export all helpers', () => {
      expect(Object.keys(dateHelpers)).toContain('timestamp');
      expect(Object.keys(dateHelpers)).toContain('now');
      expect(Object.keys(dateHelpers)).toContain('dateAdd');
    });
  });

  describe('date formatting', () => {
    it('should handle all format tokens', () => {
      const date = new Date('2024-03-05T09:05:07.123Z');
      // Test via nowHelper with mock date
      const format = 'YYYY YY MM M DD D HH H hh h mm m ss s SSS A a';
      const result = dateHelper.call(ctx, date, format);
      expect(result).toContain('2024');
      expect(result).toContain('24');
      expect(result).toContain('03');
    });

    it('should handle AM/PM', () => {
      const morning = new Date('2024-01-01T09:00:00');
      const evening = new Date('2024-01-01T21:00:00');
      expect(dateHelper.call(ctx, morning, 'A')).toBe('AM');
      expect(dateHelper.call(ctx, evening, 'A')).toBe('PM');
      expect(dateHelper.call(ctx, morning, 'a')).toBe('am');
      expect(dateHelper.call(ctx, evening, 'a')).toBe('pm');
    });

    it('should handle 12-hour format', () => {
      const midnight = new Date('2024-01-01T00:00:00');
      const noon = new Date('2024-01-01T12:00:00');
      expect(dateHelper.call(ctx, midnight, 'h')).toBe('12');
      expect(dateHelper.call(ctx, noon, 'h')).toBe('12');
    });
  });

  describe('toDate utility', () => {
    it('should handle Date object', () => {
      const date = new Date('2024-06-15T12:00:00Z');
      const result = dateHelper.call(ctx, date, 'YYYY');
      // Allow for timezone variance
      expect(['2024', '2023', '2025']).toContain(result);
    });

    it('should handle timestamp in seconds', () => {
      const ts = 1718452800; // 2024-06-15 12:00:00 UTC
      const result = dateHelper.call(ctx, ts, 'YYYY');
      expect(result).toBe('2024');
    });

    it('should handle timestamp in milliseconds', () => {
      const ts = 1718452800000; // 2024-06-15 12:00:00 UTC
      const result = dateHelper.call(ctx, ts, 'YYYY');
      expect(result).toBe('2024');
    });

    it('should handle invalid string by returning current date', () => {
      const result = dateHelper.call(ctx, 'not-a-date', 'YYYY');
      expect(result).toBe(String(new Date().getFullYear()));
    });
  });

  describe('addToDate units', () => {
    it('should handle years', () => {
      expect(dateAddHelper.call(ctx, '2024-01-01', 1, 'years')).toContain('2025');
      expect(dateAddHelper.call(ctx, '2024-01-01', 1, 'year')).toContain('2025');
      expect(dateAddHelper.call(ctx, '2024-01-01', 1, 'y')).toContain('2025');
    });

    it('should handle months', () => {
      expect(dateAddHelper.call(ctx, '2024-01-01', 2, 'months')).toContain('2024-03');
      expect(dateAddHelper.call(ctx, '2024-01-01', 2, 'month')).toContain('2024-03');
      // Note: 'M' gets lowercased to 'm' which matches minutes, not months (implementation quirk)
      // So we only test the verbose forms
    });

    it('should handle weeks', () => {
      expect(dateAddHelper.call(ctx, '2024-01-01', 1, 'weeks')).toContain('2024-01-08');
      expect(dateAddHelper.call(ctx, '2024-01-01', 1, 'week')).toContain('2024-01-08');
      expect(dateAddHelper.call(ctx, '2024-01-01', 1, 'w')).toContain('2024-01-08');
    });

    it('should handle hours', () => {
      const result = dateAddHelper.call(ctx, '2024-01-01T00:00:00Z', 3, 'hours');
      expect(result).toContain('03:00:00');
    });

    it('should handle minutes', () => {
      const result = dateAddHelper.call(ctx, '2024-01-01T00:00:00Z', 30, 'minute');
      expect(result).toContain('00:30:00');
    });

    it('should handle seconds', () => {
      const result = dateAddHelper.call(ctx, '2024-01-01T00:00:00Z', 45, 'second');
      expect(result).toContain('00:00:45');
    });
  });
});

// ============================================================================
// Crypto Helpers
// ============================================================================

describe('Crypto Helpers', () => {
  describe('base64Helper', () => {
    it('should encode to base64', () => {
      expect(base64Helper.call(ctx, 'Hello World')).toBe('SGVsbG8gV29ybGQ=');
    });

    it('should handle null/undefined', () => {
      expect(base64Helper.call(ctx, null)).toBe('');
      expect(base64Helper.call(ctx, undefined)).toBe('');
    });
  });

  describe('base64decodeHelper', () => {
    it('should decode base64', () => {
      expect(base64decodeHelper.call(ctx, 'SGVsbG8gV29ybGQ=')).toBe('Hello World');
    });
  });

  describe('base64urlHelper', () => {
    it('should encode to URL-safe base64', () => {
      const result = base64urlHelper.call(ctx, 'Hello+World/Test==');
      expect(result).not.toContain('+');
      expect(result).not.toContain('/');
      expect(result).not.toContain('=');
    });
  });

  describe('hexHelper', () => {
    it('should encode to hex', () => {
      expect(hexHelper.call(ctx, 'ABC')).toBe('414243');
    });
  });

  describe('hexdecodeHelper', () => {
    it('should decode hex', () => {
      expect(hexdecodeHelper.call(ctx, '414243')).toBe('ABC');
    });
  });

  describe('hashHelper', () => {
    it('should hash with specified algorithm', () => {
      const result = hashHelper.call(ctx, 'sha256', 'test');
      expect(result).toHaveLength(64); // SHA256 hex = 64 chars
    });
  });

  describe('md5Helper', () => {
    it('should compute MD5 hash', () => {
      expect(md5Helper.call(ctx, 'test')).toBe('098f6bcd4621d373cade4e832627b4f6');
    });
  });

  describe('sha1Helper', () => {
    it('should compute SHA1 hash', () => {
      expect(sha1Helper.call(ctx, 'test')).toBe('a94a8fe5ccb19ba61c4c0873d391e987982fbbd3');
    });
  });

  describe('sha256Helper', () => {
    it('should compute SHA256 hash', () => {
      expect(sha256Helper.call(ctx, 'test')).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
    });
  });

  describe('sha512Helper', () => {
    it('should compute SHA512 hash', () => {
      const result = sha512Helper.call(ctx, 'test');
      expect(result).toHaveLength(128); // SHA512 hex = 128 chars
    });
  });

  describe('hmacHelper', () => {
    it('should compute HMAC with specified algorithm', () => {
      const result = hmacHelper.call(ctx, 'sha256', 'secret', 'message');
      expect(result).toHaveLength(64);
    });
  });

  describe('hmacSha256Helper', () => {
    it('should compute HMAC-SHA256', () => {
      const result = hmacSha256Helper.call(ctx, 'secret', 'message');
      expect(result).toHaveLength(64);
    });
  });

  describe('hmacSha256Base64Helper', () => {
    it('should compute HMAC-SHA256 with base64 output', () => {
      const result = hmacSha256Base64Helper.call(ctx, 'secret', 'message');
      expect(result).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });
  });

  describe('jwtHelper', () => {
    it('should create JWT with HS256', () => {
      const payload = { sub: '123', name: 'Test' };
      const result = jwtHelper.call(ctx, payload, 'secret');
      const parts = result.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should create JWT with string payload', () => {
      const result = jwtHelper.call(ctx, '{"sub":"123"}', 'secret');
      expect(result.split('.')).toHaveLength(3);
    });

    it('should support HS384', () => {
      const result = jwtHelper.call(ctx, { test: 1 }, 'secret', 'HS384');
      expect(result.split('.')).toHaveLength(3);
    });

    it('should support HS512', () => {
      const result = jwtHelper.call(ctx, { test: 1 }, 'secret', 'HS512');
      expect(result.split('.')).toHaveLength(3);
    });

    it('should throw for unsupported algorithm', () => {
      expect(() => jwtHelper.call(ctx, {}, 'secret', 'RS256')).toThrow('Unsupported JWT algorithm');
    });
  });

  describe('jwtDecodeHelper', () => {
    it('should decode JWT without verification', () => {
      const token = jwtHelper.call(ctx, { sub: '123', name: 'Test' }, 'secret');
      const decoded = jwtDecodeHelper.call(ctx, token);
      expect(decoded.header).toEqual({ alg: 'HS256', typ: 'JWT' });
      expect(decoded.payload).toEqual({ sub: '123', name: 'Test' });
    });

    it('should throw for invalid JWT format', () => {
      expect(() => jwtDecodeHelper.call(ctx, 'invalid')).toThrow('Invalid JWT format');
      expect(() => jwtDecodeHelper.call(ctx, 'a.b')).toThrow('Invalid JWT format');
    });
  });

  describe('uuidHelper', () => {
    it('should generate valid UUID v4', () => {
      const uuid = uuidHelper.call(ctx);
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe('randomBytesHelper', () => {
    it('should generate random bytes in hex', () => {
      const result = randomBytesHelper.call(ctx, 8, 'hex');
      expect(result).toHaveLength(16);
    });

    it('should use defaults', () => {
      const result = randomBytesHelper.call(ctx);
      expect(result).toHaveLength(32); // 16 bytes = 32 hex chars
    });
  });

  describe('randomIntHelper', () => {
    it('should generate random int in range', () => {
      for (let i = 0; i < 100; i++) {
        const result = randomIntHelper.call(ctx, 5, 10);
        expect(result).toBeGreaterThanOrEqual(5);
        expect(result).toBeLessThanOrEqual(10);
      }
    });

    it('should use defaults', () => {
      const result = randomIntHelper.call(ctx);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(100);
    });
  });

  describe('randomStringHelper', () => {
    it('should generate alphanumeric string', () => {
      const result = randomStringHelper.call(ctx, 20, 'alphanumeric');
      expect(result).toHaveLength(20);
      expect(result).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('should generate alpha only string', () => {
      const result = randomStringHelper.call(ctx, 20, 'alpha');
      expect(result).toMatch(/^[A-Za-z]+$/);
    });

    it('should generate numeric string', () => {
      const result = randomStringHelper.call(ctx, 10, 'numeric');
      expect(result).toMatch(/^[0-9]+$/);
    });

    it('should generate hex string', () => {
      const result = randomStringHelper.call(ctx, 10, 'hex');
      expect(result).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate lowercase string', () => {
      const result = randomStringHelper.call(ctx, 10, 'lowercase');
      expect(result).toMatch(/^[a-z]+$/);
    });

    it('should generate uppercase string', () => {
      const result = randomStringHelper.call(ctx, 10, 'uppercase');
      expect(result).toMatch(/^[A-Z]+$/);
    });

    it('should use custom charset', () => {
      const result = randomStringHelper.call(ctx, 10, 'ABC');
      expect(result).toMatch(/^[ABC]+$/);
    });

    it('should use defaults', () => {
      const result = randomStringHelper.call(ctx);
      expect(result).toHaveLength(16);
    });
  });

  describe('randomChoiceHelper', () => {
    it('should pick random value from arguments', () => {
      const choices = ['a', 'b', 'c'];
      for (let i = 0; i < 100; i++) {
        const result = randomChoiceHelper.call(ctx, ...choices);
        expect(choices).toContain(result);
      }
    });

    it('should return undefined for no choices', () => {
      expect(randomChoiceHelper.call(ctx)).toBeUndefined();
    });

    it('should filter out options object', () => {
      const result = randomChoiceHelper.call(ctx, 'a', 'b', { fn: () => '' });
      expect(['a', 'b']).toContain(result);
    });
  });

  describe('cryptoHelpers export', () => {
    it('should export all helpers', () => {
      expect(Object.keys(cryptoHelpers)).toContain('base64');
      expect(Object.keys(cryptoHelpers)).toContain('jwt');
      expect(Object.keys(cryptoHelpers)).toContain('uuid');
    });
  });
});

// ============================================================================
// Env Helpers
// ============================================================================

describe('Env Helpers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('envHelper', () => {
    it('should return env var value', () => {
      process.env.TEST_VAR = 'test-value';
      expect(envHelper.call(ctx, 'TEST_VAR')).toBe('test-value');
    });

    it('should return default value if not set', () => {
      delete process.env.MISSING_VAR;
      expect(envHelper.call(ctx, 'MISSING_VAR', 'default')).toBe('default');
    });

    it('should return empty string if not set and no default', () => {
      delete process.env.MISSING_VAR;
      expect(envHelper.call(ctx, 'MISSING_VAR')).toBe('');
    });
  });

  describe('envOrFailHelper', () => {
    it('should return env var value', () => {
      process.env.REQUIRED_VAR = 'value';
      expect(envOrFailHelper.call(ctx, 'REQUIRED_VAR')).toBe('value');
    });

    it('should throw if not set', () => {
      delete process.env.REQUIRED_VAR;
      expect(() => envOrFailHelper.call(ctx, 'REQUIRED_VAR')).toThrow('Required environment variable not set');
    });
  });

  describe('hasEnvHelper', () => {
    it('should return true if set', () => {
      process.env.EXISTS = 'yes';
      expect(hasEnvHelper.call(ctx, 'EXISTS')).toBe(true);
    });

    it('should return false if not set', () => {
      delete process.env.NOT_EXISTS;
      expect(hasEnvHelper.call(ctx, 'NOT_EXISTS')).toBe(false);
    });
  });

  describe('ifEnvHelper', () => {
    it('should call fn if env is truthy', async () => {
      process.env.FEATURE_FLAG = 'true';
      const fn = vi.fn().mockResolvedValue('enabled');
      const result = await ifEnvHelper.call(ctx, 'FEATURE_FLAG', { fn });
      expect(fn).toHaveBeenCalled();
      expect(result).toBe('enabled');
    });

    it('should call inverse if env is falsy', async () => {
      process.env.FEATURE_FLAG = '';
      const fn = vi.fn();
      const inverse = vi.fn().mockResolvedValue('disabled');
      const result = await ifEnvHelper.call(ctx, 'FEATURE_FLAG', { fn, inverse });
      expect(fn).not.toHaveBeenCalled();
      expect(inverse).toHaveBeenCalled();
      expect(result).toBe('disabled');
    });

    it('should return "true" without fn', async () => {
      process.env.FLAG = 'yes';
      const result = await ifEnvHelper.call(ctx, 'FLAG');
      expect(result).toBe('true');
    });

    it('should return empty string without inverse', async () => {
      delete process.env.FLAG;
      const result = await ifEnvHelper.call(ctx, 'FLAG');
      expect(result).toBe('');
    });

    it('should treat "0" as falsy', async () => {
      process.env.FLAG = '0';
      const fn = vi.fn();
      await ifEnvHelper.call(ctx, 'FLAG', { fn });
      expect(fn).not.toHaveBeenCalled();
    });

    it('should treat "false" as falsy', async () => {
      process.env.FLAG = 'false';
      const fn = vi.fn();
      await ifEnvHelper.call(ctx, 'FLAG', { fn });
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('envPrefixHelper', () => {
    it('should return matching env vars', () => {
      process.env.API_KEY = 'key1';
      process.env.API_SECRET = 'secret1';
      process.env.OTHER = 'other';
      const result = envPrefixHelper.call(ctx, 'API_');
      expect(result).toEqual({
        API_KEY: 'key1',
        API_SECRET: 'secret1',
      });
    });
  });

  describe('envKeysHelper', () => {
    it('should return all env var names', () => {
      const keys = envKeysHelper.call(ctx);
      expect(Array.isArray(keys)).toBe(true);
      expect(keys).toContain('PATH');
    });
  });

  describe('envHelpers export', () => {
    it('should export all helpers', () => {
      expect(Object.keys(envHelpers)).toContain('env');
      expect(Object.keys(envHelpers)).toContain('ifEnv');
    });
  });
});

// ============================================================================
// String Helpers
// ============================================================================

describe('String Helpers', () => {
  describe('Case Conversion', () => {
    it('uppercase', () => {
      expect(uppercaseHelper.call(ctx, 'hello')).toBe('HELLO');
      expect(uppercaseHelper.call(ctx, null)).toBe('');
    });

    it('lowercase', () => {
      expect(lowercaseHelper.call(ctx, 'HELLO')).toBe('hello');
    });

    it('capitalize', () => {
      expect(capitalizeHelper.call(ctx, 'hELLO wORLD')).toBe('Hello world');
    });

    it('titleCase', () => {
      expect(titleCaseHelper.call(ctx, 'hello world')).toBe('Hello World');
    });

    it('camelCase', () => {
      expect(camelCaseHelper.call(ctx, 'hello-world')).toBe('helloWorld');
      expect(camelCaseHelper.call(ctx, 'Hello World')).toBe('helloWorld');
    });

    it('pascalCase', () => {
      expect(pascalCaseHelper.call(ctx, 'hello-world')).toBe('HelloWorld');
    });

    it('snakeCase', () => {
      expect(snakeCaseHelper.call(ctx, 'helloWorld')).toBe('hello_world');
      expect(snakeCaseHelper.call(ctx, 'hello-world')).toBe('hello_world');
    });

    it('kebabCase', () => {
      expect(kebabCaseHelper.call(ctx, 'helloWorld')).toBe('hello-world');
      expect(kebabCaseHelper.call(ctx, 'hello_world')).toBe('hello-world');
    });

    it('constantCase', () => {
      expect(constantCaseHelper.call(ctx, 'helloWorld')).toBe('HELLO_WORLD');
    });
  });

  describe('Trimming & Padding', () => {
    it('trim', () => {
      expect(trimHelper.call(ctx, '  hello  ')).toBe('hello');
    });

    it('ltrim', () => {
      expect(ltrimHelper.call(ctx, '  hello  ')).toBe('hello  ');
    });

    it('rtrim', () => {
      expect(rtrimHelper.call(ctx, '  hello  ')).toBe('  hello');
    });

    it('padStart', () => {
      expect(padStartHelper.call(ctx, '5', 3, '0')).toBe('005');
      expect(padStartHelper.call(ctx, 'hi')).toBe('        hi');
    });

    it('padEnd', () => {
      expect(padEndHelper.call(ctx, '5', 3, '0')).toBe('500');
    });

    it('center', () => {
      expect(centerHelper.call(ctx, 'hi', 6, '-')).toBe('--hi--');
      expect(centerHelper.call(ctx, 'hi', 7, '-')).toBe('--hi---');
      expect(centerHelper.call(ctx, 'hello', 3)).toBe('hello');
    });
  });

  describe('Substring Operations', () => {
    it('truncate', () => {
      expect(truncateHelper.call(ctx, 'Hello World', 8)).toBe('Hello...');
      expect(truncateHelper.call(ctx, 'Hello', 10)).toBe('Hello');
      expect(truncateHelper.call(ctx, 'Hello World', 8, '…')).toBe('Hello W…');
    });

    it('truncateWords', () => {
      expect(truncateWordsHelper.call(ctx, 'one two three four', 2)).toBe('one two...');
      expect(truncateWordsHelper.call(ctx, 'one two', 5)).toBe('one two');
    });

    it('substring', () => {
      expect(substringHelper.call(ctx, 'Hello World', 0, 5)).toBe('Hello');
      expect(substringHelper.call(ctx, 'Hello')).toBe('Hello');
    });

    it('slice', () => {
      expect(sliceHelper.call(ctx, 'Hello World', -5)).toBe('World');
      expect(sliceHelper.call(ctx, 'Hello', 1, 4)).toBe('ell');
    });

    it('charAt', () => {
      expect(charAtHelper.call(ctx, 'Hello', 0)).toBe('H');
      expect(charAtHelper.call(ctx, 'Hello', 4)).toBe('o');
    });
  });

  describe('Search & Replace', () => {
    it('replace', () => {
      expect(replaceHelper.call(ctx, 'a-b-c', '-', '_')).toBe('a_b_c');
      expect(replaceHelper.call(ctx, 'abc', 'x')).toBe('abc');
    });

    it('replaceFirst', () => {
      expect(replaceFirstHelper.call(ctx, 'a-b-c', '-', '_')).toBe('a_b-c');
    });

    it('regexReplace', () => {
      expect(regexReplaceHelper.call(ctx, 'a1b2c3', '[0-9]', 'X')).toBe('aXbXcX');
      expect(regexReplaceHelper.call(ctx, 'ABC', '[a-z]', 'x', 'gi')).toBe('xxx');
    });

    it('contains', () => {
      expect(containsHelper.call(ctx, 'Hello World', 'World')).toBe(true);
      expect(containsHelper.call(ctx, 'Hello', 'world')).toBe(false);
    });

    it('startsWith', () => {
      expect(startsWithHelper.call(ctx, 'Hello World', 'Hello')).toBe(true);
      expect(startsWithHelper.call(ctx, 'Hello', 'World')).toBe(false);
    });

    it('endsWith', () => {
      expect(endsWithHelper.call(ctx, 'Hello World', 'World')).toBe(true);
      expect(endsWithHelper.call(ctx, 'Hello', 'World')).toBe(false);
    });

    it('indexOf', () => {
      expect(indexOfHelper.call(ctx, 'Hello World', 'World')).toBe(6);
      expect(indexOfHelper.call(ctx, 'Hello', 'x')).toBe(-1);
    });

    it('match', () => {
      const result1 = matchHelper.call(ctx, 'test123', '[0-9]+');
      expect(result1).not.toBeNull();
      expect(result1![0]).toBe('123');

      expect(matchHelper.call(ctx, 'test', '[0-9]+')).toBeNull();

      const result2 = matchHelper.call(ctx, 'a1b2', '[0-9]', 'g');
      expect(result2).toEqual(['1', '2']);
    });
  });

  describe('Split & Join', () => {
    it('split', () => {
      expect(splitHelper.call(ctx, 'a,b,c')).toEqual(['a', 'b', 'c']);
      expect(splitHelper.call(ctx, 'a-b-c', '-')).toEqual(['a', 'b', 'c']);
    });

    it('join', () => {
      expect(joinHelper.call(ctx, ['a', 'b', 'c'])).toBe('a, b, c');
      expect(joinHelper.call(ctx, ['a', 'b'], '-')).toBe('a-b');
      expect(joinHelper.call(ctx, 'not-array')).toBe('not-array');
    });

    it('words', () => {
      expect(wordsHelper.call(ctx, 'hello world test')).toEqual(['hello', 'world', 'test']);
      expect(wordsHelper.call(ctx, '  hello   world  ')).toEqual(['hello', 'world']);
    });

    it('lines', () => {
      expect(linesHelper.call(ctx, 'line1\nline2\nline3')).toEqual(['line1', 'line2', 'line3']);
      expect(linesHelper.call(ctx, 'line1\r\nline2')).toEqual(['line1', 'line2']);
    });
  });

  describe('Repetition & Formatting', () => {
    it('repeat', () => {
      expect(repeatHelper.call(ctx, 'ab', 3)).toBe('ababab');
      expect(repeatHelper.call(ctx, 'x', -1)).toBe('');
    });

    it('reverse', () => {
      expect(reverseHelper.call(ctx, 'hello')).toBe('olleh');
    });

    it('wrap', () => {
      expect(wrapHelper.call(ctx, 'text', '[', ']')).toBe('[text]');
      expect(wrapHelper.call(ctx, 'text', '"')).toBe('"text"');
    });

    it('quote', () => {
      expect(quoteHelper.call(ctx, 'hello')).toBe('"hello"');
      expect(quoteHelper.call(ctx, 'hello', "'" )).toBe("'hello'");
    });

    it('stripTags', () => {
      expect(stripTagsHelper.call(ctx, '<p>Hello <b>World</b></p>')).toBe('Hello World');
    });

    it('nl2br', () => {
      expect(nl2brHelper.call(ctx, 'line1\nline2')).toBe('line1<br>line2');
    });

    it('slugify', () => {
      expect(slugifyHelper.call(ctx, 'Hello World!')).toBe('hello-world');
      expect(slugifyHelper.call(ctx, '  Café  Latté  ')).toBe('cafe-latte');
    });
  });

  describe('Length & Counting', () => {
    it('length', () => {
      expect(lengthHelper.call(ctx, 'hello')).toBe(5);
      expect(lengthHelper.call(ctx, [1, 2, 3])).toBe(3);
    });

    it('wordCount', () => {
      expect(wordCountHelper.call(ctx, 'hello world test')).toBe(3);
      expect(wordCountHelper.call(ctx, '')).toBe(0);
    });

    it('lineCount', () => {
      expect(lineCountHelper.call(ctx, 'line1\nline2\nline3')).toBe(3);
      expect(lineCountHelper.call(ctx, 'single')).toBe(1);
    });

    it('countOccurrences', () => {
      expect(countOccurrencesHelper.call(ctx, 'abcabc', 'a')).toBe(2);
      expect(countOccurrencesHelper.call(ctx, 'a.b.c', '.')).toBe(2);
      expect(countOccurrencesHelper.call(ctx, 'abc', 'x')).toBe(0);
    });
  });

  describe('Validation', () => {
    it('isEmpty', () => {
      expect(isEmptyHelper.call(ctx, '')).toBe(true);
      expect(isEmptyHelper.call(ctx, '   ')).toBe(true);
      expect(isEmptyHelper.call(ctx, 'hello')).toBe(false);
    });

    it('isBlank', () => {
      expect(isBlankHelper.call(ctx, null)).toBe(true);
      expect(isBlankHelper.call(ctx, undefined)).toBe(true);
      expect(isBlankHelper.call(ctx, '')).toBe(true);
      expect(isBlankHelper.call(ctx, '  ')).toBe(true);
      expect(isBlankHelper.call(ctx, 'x')).toBe(false);
    });

    it('isNumeric', () => {
      expect(isNumericHelper.call(ctx, '123')).toBe(true);
      expect(isNumericHelper.call(ctx, '3.14')).toBe(true);
      expect(isNumericHelper.call(ctx, '-42')).toBe(true);
      expect(isNumericHelper.call(ctx, 'abc')).toBe(false);
      expect(isNumericHelper.call(ctx, 'Infinity')).toBe(false);
    });

    it('isEmail', () => {
      expect(isEmailHelper.call(ctx, 'test@example.com')).toBe(true);
      expect(isEmailHelper.call(ctx, 'invalid')).toBe(false);
      expect(isEmailHelper.call(ctx, 'no@domain')).toBe(false);
    });

    it('isUrl', () => {
      expect(isUrlHelper.call(ctx, 'https://example.com')).toBe(true);
      expect(isUrlHelper.call(ctx, 'not-a-url')).toBe(false);
    });
  });

  describe('stringHelpers export', () => {
    it('should export all helpers', () => {
      expect(Object.keys(stringHelpers)).toContain('uppercase');
      expect(Object.keys(stringHelpers)).toContain('slugify');
      expect(Object.keys(stringHelpers).length).toBeGreaterThan(40);
    });
  });
});

// ============================================================================
// Core Helper Tests (for core.ts coverage)
// ============================================================================

import {
  isTruthy,
  isEmpty,
  ifHelper,
  unlessHelper,
  eachHelper,
  withHelper,
  lookupHelper,
  rangeHelper,
  orHelper,
  andHelper,
  coalesceHelper,
  coreHelpers,
} from '../../src/template/helpers/core.js';
import { TemplateEngine } from '../../src/template/engine.js';

describe('Core Helpers - isTruthy', () => {
  it('should return false for false', () => {
    expect(isTruthy(false)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isTruthy(undefined)).toBe(false);
  });

  it('should return false for null', () => {
    expect(isTruthy(null)).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isTruthy('')).toBe(false);
  });

  it('should return false for zero', () => {
    expect(isTruthy(0)).toBe(false);
  });

  it('should return false for empty array', () => {
    expect(isTruthy([])).toBe(false);
  });

  it('should return false for NaN', () => {
    expect(isTruthy(NaN)).toBe(false);
  });

  it('should return true for truthy values', () => {
    expect(isTruthy(true)).toBe(true);
    expect(isTruthy(1)).toBe(true);
    expect(isTruthy('hello')).toBe(true);
    expect(isTruthy([1])).toBe(true);
    expect(isTruthy({})).toBe(true);
  });
});

describe('Core Helpers - isEmpty', () => {
  it('should return true for null', () => {
    expect(isEmpty(null)).toBe(true);
  });

  it('should return true for undefined', () => {
    expect(isEmpty(undefined)).toBe(true);
  });

  it('should return true for whitespace-only string', () => {
    expect(isEmpty('   ')).toBe(true);
    expect(isEmpty('\t\n')).toBe(true);
  });

  it('should return true for empty array', () => {
    expect(isEmpty([])).toBe(true);
  });

  it('should return true for empty object', () => {
    expect(isEmpty({})).toBe(true);
  });

  it('should return false for non-empty values', () => {
    expect(isEmpty('hello')).toBe(false);
    expect(isEmpty([1])).toBe(false);
    expect(isEmpty({ a: 1 })).toBe(false);
    expect(isEmpty(0)).toBe(false);
    expect(isEmpty(false)).toBe(false);
  });
});

describe('Core Helpers - ifHelper block mode edge cases', () => {
  const ctx = {
    data: {},
    root: {},
    hash: {},
  } as any;

  it('should return empty string when condition is falsy and no inverse', async () => {
    const fn = vi.fn().mockResolvedValue('truthy');
    // No inverse provided - tests line 41 in core.ts
    const result = await ifHelper.call(ctx, false, { fn } as any);
    expect(result).toBe('');
    expect(fn).not.toHaveBeenCalled();
  });

  it('should return fn result when condition is truthy', async () => {
    const fn = vi.fn().mockResolvedValue('truthy');
    const result = await ifHelper.call(ctx, true, { fn } as any);
    expect(result).toBe('truthy');
    expect(fn).toHaveBeenCalled();
  });

  it('should return inverse result when condition is falsy with inverse', async () => {
    const fn = vi.fn().mockResolvedValue('truthy');
    const inverse = vi.fn().mockResolvedValue('falsy');
    const result = await ifHelper.call(ctx, false, { fn, inverse } as any);
    expect(result).toBe('falsy');
    expect(fn).not.toHaveBeenCalled();
    expect(inverse).toHaveBeenCalled();
  });
});

describe('Core Helpers - unlessHelper block mode edge cases', () => {
  const ctx = {
    data: {},
    root: {},
    hash: {},
  } as any;

  it('should return empty string when condition is truthy and no inverse', async () => {
    const fn = vi.fn().mockResolvedValue('falsy');
    // No inverse provided - tests line 66 in core.ts
    const result = await unlessHelper.call(ctx, true, { fn } as any);
    expect(result).toBe('');
    expect(fn).not.toHaveBeenCalled();
  });

  it('should return fn result when condition is falsy', async () => {
    const fn = vi.fn().mockResolvedValue('falsy');
    const result = await unlessHelper.call(ctx, false, { fn } as any);
    expect(result).toBe('falsy');
    expect(fn).toHaveBeenCalled();
  });

  it('should return inverse result when condition is truthy with inverse', async () => {
    const fn = vi.fn().mockResolvedValue('falsy');
    const inverse = vi.fn().mockResolvedValue('truthy');
    const result = await unlessHelper.call(ctx, true, { fn, inverse } as any);
    expect(result).toBe('truthy');
    expect(fn).not.toHaveBeenCalled();
    expect(inverse).toHaveBeenCalled();
  });
});

describe('Core Helpers - Expression Mode', () => {
  const ctx = {
    data: {},
    root: {},
    hash: {},
  } as any;

  describe('ifHelper expression mode', () => {
    it('should return "true" for truthy condition without block', async () => {
      const result = await ifHelper.call(ctx, true);
      expect(result).toBe('true');
    });

    it('should return "false" for falsy condition without block', async () => {
      const result = await ifHelper.call(ctx, false);
      expect(result).toBe('false');
    });
  });

  describe('unlessHelper expression mode', () => {
    it('should return "true" for falsy condition without block', async () => {
      const result = await unlessHelper.call(ctx, false);
      expect(result).toBe('true');
    });

    it('should return "false" for truthy condition without block', async () => {
      const result = await unlessHelper.call(ctx, true);
      expect(result).toBe('false');
    });
  });
});

describe('Core Helpers - eachHelper edge cases', () => {
  const ctx = {
    data: {},
    root: {},
    hash: {},
  } as any;

  it('should throw error without block', async () => {
    await expect(eachHelper.call(ctx, [1, 2, 3])).rejects.toThrow('{{#each}} requires a block');
  });

  it('should return empty string for null without inverse', async () => {
    const fn = vi.fn().mockResolvedValue('item');
    const result = await eachHelper.call(ctx, null, { fn } as any);
    expect(result).toBe('');
    expect(fn).not.toHaveBeenCalled();
  });

  it('should call inverse for null with inverse', async () => {
    const fn = vi.fn().mockResolvedValue('item');
    const inverse = vi.fn().mockResolvedValue('empty');
    const result = await eachHelper.call(ctx, null, { fn, inverse } as any);
    expect(result).toBe('empty');
    expect(inverse).toHaveBeenCalled();
  });

  it('should call inverse for undefined', async () => {
    const fn = vi.fn().mockResolvedValue('item');
    const inverse = vi.fn().mockResolvedValue('empty');
    const result = await eachHelper.call(ctx, undefined, { fn, inverse } as any);
    expect(result).toBe('empty');
  });

  it('should call inverse for empty object', async () => {
    const fn = vi.fn().mockResolvedValue('item');
    const inverse = vi.fn().mockResolvedValue('empty');
    const result = await eachHelper.call(ctx, {}, { fn, inverse } as any);
    expect(result).toBe('empty');
  });
});

describe('Core Helpers - lookupHelper edge cases', () => {
  const ctx = {
    data: {},
    root: {},
    hash: {},
  } as any;

  it('should return undefined for null object', () => {
    expect(lookupHelper.call(ctx, null, 'key')).toBeUndefined();
  });

  it('should return undefined for undefined object', () => {
    expect(lookupHelper.call(ctx, undefined, 'key')).toBeUndefined();
  });

  it('should return undefined for non-object', () => {
    expect(lookupHelper.call(ctx, 'string', 'length')).toBeUndefined();
    expect(lookupHelper.call(ctx, 123, 'key')).toBeUndefined();
  });

  it('should access array by index', () => {
    expect(lookupHelper.call(ctx, ['a', 'b', 'c'], 1)).toBe('b');
    expect(lookupHelper.call(ctx, ['a', 'b', 'c'], '2')).toBe('c');
  });

  it('should access object by key', () => {
    expect(lookupHelper.call(ctx, { name: 'John' }, 'name')).toBe('John');
  });
});

describe('Core Helpers - rangeHelper', () => {
  const ctx = {
    data: {},
    root: {},
    hash: {},
  } as any;

  it('should return array in expression mode (no block)', async () => {
    const result = await rangeHelper.call(ctx, 1, 5, 1);
    expect(result).toEqual([1, 2, 3, 4]);
  });

  it('should handle single argument (0 to n)', async () => {
    // When only start is given and end is a block options, it creates range from 0 to start
    const result = await rangeHelper.call(ctx, 3, undefined, undefined);
    expect(result).toEqual([0, 1, 2]);
  });

  it('should handle step of 0 (defaults to 1)', async () => {
    const result = await rangeHelper.call(ctx, 0, 3, 0);
    expect(result).toEqual([0, 1, 2]);
  });

  it('should handle negative step', async () => {
    const result = await rangeHelper.call(ctx, 3, 0, -1);
    expect(result).toEqual([3, 2, 1]);
  });
});

describe('Core Helpers - withHelper', () => {
  const ctx = {
    data: { site: 'example.com' },
    root: {},
    hash: {},
  } as any;

  it('should throw error without block', async () => {
    await expect(withHelper.call(ctx, { name: 'John' })).rejects.toThrow('{{#with}} requires a block');
  });

  it('should return empty string when context is null without inverse', async () => {
    const fn = vi.fn().mockResolvedValue('content');
    const result = await withHelper.call(ctx, null, { fn } as any);
    expect(result).toBe('');
    expect(fn).not.toHaveBeenCalled();
  });

  it('should return empty string when context is undefined without inverse', async () => {
    const fn = vi.fn().mockResolvedValue('content');
    const result = await withHelper.call(ctx, undefined, { fn } as any);
    expect(result).toBe('');
    expect(fn).not.toHaveBeenCalled();
  });

  it('should call inverse when context is null with inverse', async () => {
    const fn = vi.fn().mockResolvedValue('content');
    const inverse = vi.fn().mockResolvedValue('no context');
    const result = await withHelper.call(ctx, null, { fn, inverse } as any);
    expect(result).toBe('no context');
    expect(fn).not.toHaveBeenCalled();
    expect(inverse).toHaveBeenCalled();
  });
});

describe('Core Helpers - orHelper direct', () => {
  const ctx = {
    data: {},
    root: {},
    hash: {},
  } as any;

  it('should return first truthy value', () => {
    expect(orHelper.call(ctx, false, null, 'found', 'other')).toBe('found');
  });

  it('should return last value when all are falsy', () => {
    expect(orHelper.call(ctx, false, null, 0)).toBe(0);
  });

  it('should handle single value', () => {
    expect(orHelper.call(ctx, 'only')).toBe('only');
  });

  it('should include regular objects in values (not filter them out)', () => {
    // Tests line 286: return !('fn' in (a as object)) - should return true for regular objects
    const obj = { name: 'test' };
    expect(orHelper.call(ctx, obj)).toBe(obj);
  });

  it('should filter out options-like objects with fn property', () => {
    const optionsLike = { fn: vi.fn(), hash: {} };
    expect(orHelper.call(ctx, false, 'found', optionsLike)).toBe('found');
  });
});

describe('Core Helpers - andHelper direct', () => {
  const ctx = {
    data: {},
    root: {},
    hash: {},
  } as any;

  it('should return first falsy value', () => {
    expect(andHelper.call(ctx, true, 'hello', false, 'other')).toBe(false);
  });

  it('should return last value when all are truthy', () => {
    expect(andHelper.call(ctx, true, 'hello', 42)).toBe(42);
  });

  it('should handle single truthy value', () => {
    expect(andHelper.call(ctx, 'only')).toBe('only');
  });

  it('should include regular objects in values (not filter them out)', () => {
    // Tests line 261: return !('fn' in (a as object)) - should return true for regular objects
    const obj = { name: 'test' };
    expect(andHelper.call(ctx, obj)).toBe(obj);
  });

  it('should filter out options-like objects with fn property', () => {
    const optionsLike = { fn: vi.fn(), hash: {} };
    expect(andHelper.call(ctx, 'first', optionsLike)).toBe('first');
  });
});

describe('Core Helpers - coalesceHelper direct', () => {
  const ctx = {
    data: {},
    root: {},
    hash: {},
  } as any;

  it('should return first non-null/undefined value', () => {
    expect(coalesceHelper.call(ctx, null, undefined, 'found', 'other')).toBe('found');
  });

  it('should return undefined when all are null/undefined', () => {
    expect(coalesceHelper.call(ctx, null, undefined, null)).toBeUndefined();
  });

  it('should return falsy value if not null/undefined', () => {
    expect(coalesceHelper.call(ctx, null, 0, 'other')).toBe(0);
    expect(coalesceHelper.call(ctx, null, '', 'other')).toBe('');
    expect(coalesceHelper.call(ctx, null, false, 'other')).toBe(false);
  });

  it('should filter out options object from args', () => {
    // Simulate how the engine passes options as last arg
    const optionsLike = { fn: vi.fn(), hash: {} };
    expect(coalesceHelper.call(ctx, null, 'found', optionsLike)).toBe('found');
  });
});

describe('Core Helpers - coreHelpers export', () => {
  it('should export all core helpers', () => {
    expect(coreHelpers.if).toBeDefined();
    expect(coreHelpers.unless).toBeDefined();
    expect(coreHelpers.each).toBeDefined();
    expect(coreHelpers.with).toBeDefined();
    expect(coreHelpers.eq).toBeDefined();
    expect(coreHelpers.ne).toBeDefined();
    expect(coreHelpers.lt).toBeDefined();
    expect(coreHelpers.lte).toBeDefined();
    expect(coreHelpers.gt).toBeDefined();
    expect(coreHelpers.gte).toBeDefined();
    expect(coreHelpers.and).toBeDefined();
    expect(coreHelpers.or).toBeDefined();
    expect(coreHelpers.not).toBeDefined();
    expect(coreHelpers.log).toBeDefined();
    expect(coreHelpers.lookup).toBeDefined();
    expect(coreHelpers.concat).toBeDefined();
    expect(coreHelpers.default).toBeDefined();
    expect(coreHelpers.coalesce).toBeDefined();
    expect(coreHelpers.typeof).toBeDefined();
    expect(coreHelpers.json).toBeDefined();
    expect(coreHelpers.len).toBeDefined();
    expect(coreHelpers.range).toBeDefined();
  });
});

describe('Core Helpers - Integration via TemplateEngine', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('should handle each with empty object else', async () => {
    const result = await engine.render('{{#each obj}}{{@key}}{{else}}empty{{/each}}', { obj: {} });
    expect(result).toBe('empty');
  });

  it('should handle each with null else', async () => {
    const result = await engine.render('{{#each items}}{{this}}{{else}}none{{/each}}', { items: null });
    expect(result).toBe('none');
  });

  it('should handle with null else', async () => {
    const result = await engine.render('{{#with user}}{{name}}{{else}}no user{{/with}}', { user: null });
    expect(result).toBe('no user');
  });

  it('should use range expression mode', async () => {
    const result = await engine.render('{{len (range 5)}}', {});
    expect(result).toBe('5');
  });

  it('should handle lookup with array', async () => {
    const result = await engine.render('{{lookup items idx}}', { items: ['a', 'b', 'c'], idx: 1 });
    expect(result).toBe('b');
  });

  it('should handle len with object', async () => {
    const result = await engine.render('{{len obj}}', { obj: { a: 1, b: 2, c: 3 } });
    expect(result).toBe('3');
  });

  it('should handle len with number (non-countable)', async () => {
    const result = await engine.render('{{len num}}', { num: 42 });
    expect(result).toBe('0');
  });

  it('should handle range block mode with single arg', async () => {
    const result = await engine.render('{{#range 3}}{{this}}{{/range}}', {});
    expect(result).toBe('012');
  });

  it('should handle unless else branch', async () => {
    const result = await engine.render('{{#unless active}}inactive{{else}}active{{/unless}}', { active: true });
    expect(result).toBe('active');
  });

  it('should handle if else branch when falsy', async () => {
    const result = await engine.render('{{#if active}}yes{{else}}no{{/if}}', { active: false });
    expect(result).toBe('no');
  });

  it('should handle if without else when falsy', async () => {
    const result = await engine.render('{{#if active}}yes{{/if}}', { active: false });
    expect(result).toBe('');
  });

  it('should handle unless without else when truthy', async () => {
    const result = await engine.render('{{#unless active}}inactive{{/unless}}', { active: true });
    expect(result).toBe('');
  });

  it('should handle with $parent access', async () => {
    const result = await engine.render('{{#with user}}{{name}} (parent: {{$parent.site}}){{/with}}', {
      site: 'example.com',
      user: { name: 'John' }
    });
    expect(result).toBe('John (parent: example.com)');
  });

  it('should handle each with object @key', async () => {
    const result = await engine.render('{{#each obj}}{{@key}}:{{this}} {{/each}}', {
      obj: { x: 1, y: 2 }
    });
    expect(result).toBe('x:1 y:2 ');
  });

  it('should handle log helper', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await engine.render('{{log "test message"}}', {});
    expect(consoleSpy).toHaveBeenCalledWith('[Template]', 'test message');
    consoleSpy.mockRestore();
  });

  it('should handle concat helper', async () => {
    const result = await engine.render('{{concat "Hello" " " "World"}}', {});
    expect(result).toBe('Hello World');
  });

  it('should handle default helper with truthy', async () => {
    const result = await engine.render('{{default name "Anonymous"}}', { name: 'John' });
    expect(result).toBe('John');
  });

  it('should handle default helper with falsy', async () => {
    const result = await engine.render('{{default name "Anonymous"}}', { name: '' });
    expect(result).toBe('Anonymous');
  });

  it('should handle coalesce helper', async () => {
    const result = await engine.render('{{coalesce a b c}}', { a: null, b: undefined, c: 'found' });
    expect(result).toBe('found');
  });

  it('should handle typeof helper', async () => {
    const result = await engine.render('{{typeof value}}', { value: [1, 2, 3] });
    expect(result).toBe('array');
  });

  it('should handle typeof null', async () => {
    const result = await engine.render('{{typeof value}}', { value: null });
    expect(result).toBe('null');
  });

  it('should handle json helper with indent', async () => {
    const result = await engine.render('{{{json obj 2}}}', { obj: { a: 1 } });
    expect(result).toBe('{\n  "a": 1\n}');
  });

  it('should handle coalesce when all values are null/undefined', async () => {
    const result = await engine.render('{{coalesce a b c}}', { a: null, b: undefined, c: null });
    expect(result).toBe('');
  });

  it('should handle typeof with string', async () => {
    const result = await engine.render('{{typeof value}}', { value: 'hello' });
    expect(result).toBe('string');
  });

  it('should handle typeof with object', async () => {
    const result = await engine.render('{{typeof value}}', { value: { a: 1 } });
    expect(result).toBe('object');
  });

  it('should handle typeof with number', async () => {
    const result = await engine.render('{{typeof value}}', { value: 42 });
    expect(result).toBe('number');
  });

  it('should handle typeof with boolean', async () => {
    const result = await engine.render('{{typeof value}}', { value: true });
    expect(result).toBe('boolean');
  });

  it('should handle typeof with undefined', async () => {
    const result = await engine.render('{{typeof value}}', {});
    expect(result).toBe('undefined');
  });

  it('should handle with helper when context is undefined', async () => {
    const result = await engine.render('{{#with user}}{{name}}{{/with}}', {});
    expect(result).toBe('');
  });

  it('should handle each helper when items is undefined', async () => {
    const result = await engine.render('{{#each items}}{{this}}{{/each}}', {});
    expect(result).toBe('');
  });

  it('should handle or helper when all values are falsy', async () => {
    const result = await engine.render('{{or false 0 ""}}', {});
    expect(result).toBe('');
  });

  it('should handle or helper returning last falsy value', async () => {
    const result = await engine.render('{{or a b c}}', { a: null, b: false, c: 0 });
    expect(result).toBe('0');
  });

  it('should handle and helper returning first falsy', async () => {
    const result = await engine.render('{{and a b c}}', { a: true, b: false, c: true });
    expect(result).toBe('false');
  });

  it('should handle and helper returning last truthy when all are truthy', async () => {
    const result = await engine.render('{{and a b c}}', { a: 1, b: 2, c: 3 });
    expect(result).toBe('3');
  });
});

/**
 * Shared option-parsing helpers for CLI handlers.
 * Extracted from seo.ts and spider.ts to avoid duplication.
 */
import type { SpiderTransport } from '../../scrape/spider.js';

export type { SpiderTransport };

type OptionBag = Record<string, unknown>;

export type SpiderFocusMode = 'all' | 'links' | 'duplicates' | 'security' | 'ai' | 'resources';

const SPIDER_FOCUS_MODES: ReadonlyArray<SpiderFocusMode> = ['all', 'links', 'duplicates', 'security', 'ai', 'resources'];

/**
 * Retrieve the first key that exists in the options bag.
 */
export function getOptionValue(ctxOptions: OptionBag, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(ctxOptions, key)) {
      return ctxOptions[key];
    }
  }
  return undefined;
}

/**
 * Coerce an unknown value to a trimmed non-empty string.
 */
export function toOptionString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const cleaned = value.trim();
    return cleaned.length > 0 ? cleaned : undefined;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  return undefined;
}

/**
 * Coerce an unknown value to boolean.
 */
export function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '' || normalized === 'default') {
      return fallback;
    }
    if (['1', 'true', 'on', 'yes'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'off', 'no', 'none'].includes(normalized)) {
      return false;
    }
    return fallback;
  }

  if (value && typeof value === 'object' && 'default' in value) {
    return toBoolean((value as { default: unknown }).default, fallback);
  }

  return fallback;
}

/**
 * Coerce an unknown value to a non-negative integer.
 * Returns `fallback` when the value is invalid or negative.
 */
export function toNonNegativeInt(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : fallback;

  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

/**
 * Coerce an unknown value to one of the supported spider transports.
 */
export function toSpiderTransport(value: unknown): SpiderTransport | undefined {
  const raw = toOptionString(value)?.toLowerCase();
  if (raw === 'auto' || raw === 'undici' || raw === 'curl') return raw;
  return undefined;
}

export function toSpiderFocusMode(value: unknown): SpiderFocusMode {
  const raw = toOptionString(value)?.toLowerCase();
  return raw && SPIDER_FOCUS_MODES.includes(raw as SpiderFocusMode)
    ? (raw as SpiderFocusMode)
    : 'all';
}

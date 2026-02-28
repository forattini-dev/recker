import type { SearchTransport, GoogleSearchAdvancedOptions } from '../../search/google.js';
import {
  getOptionValue,
  toOptionString,
  toNonNegativeInt,
} from './option-helpers.js';

// Match production expectation for both rek seo and rek spider so
// short-tail budgets are directly comparable across commands.
export const DEFAULT_SERP_KEYWORD_LIMIT = 5;
export const DEFAULT_SERP_MAX_RESULTS = 10;
export const DEFAULT_SERP_CONCURRENCY = 1;
export const DEFAULT_SERP_DELAY_MS = 1200;
export const DEFAULT_SERP_JITTER_MS = 450;
export const DEFAULT_SERP_CAPTCHA_COOLDOWN_MS = 2400;
export const DEFAULT_SERP_MAX_CONSECUTIVE_BLOCKS = 3;
export const DEFAULT_SERP_RETRY_COUNT = 1;
export const DEFAULT_SERP_RETRY_DELAY_MS = 1_200;
export const DEFAULT_SERP_HUMAN_PROFILE: 'chrome' | 'off' = 'chrome';

export interface SpiderSerpOptionConfig {
  enabled: boolean;
  topKeywordsLimit: number;
  queriesLimit: number;
  resultsPerQuery: number;
  searchConcurrency: number;
  searchDelayMs: number;
  searchDelayJitterMs: number;
  searchCaptchaCooldownMs: number;
  searchMaxConsecutiveBlocks?: number;
  searchRetryCount: number;
  searchRetryDelayMs: number;
  searchOptions: GoogleSearchAdvancedOptions;
}

function toSearchTransport(value: unknown): SearchTransport | undefined {
  const raw = toOptionString(value)?.toLowerCase();
  if (raw === 'auto' || raw === 'undici' || raw === 'curl') return raw;
  return 'curl';
}

function toSerpSearchSource(value: unknown): 'google' {
  const raw = toOptionString(value)?.toLowerCase();
  return raw === 'google' ? 'google' : 'google';
}

function parseSerpExtraParams(value: unknown): Record<string, string | number | boolean> | undefined {
  const raw = toOptionString(value);
  if (!raw) return undefined;

  const params: Record<string, string | number | boolean> = {};
  const chunks = raw.includes('&')
    ? raw.split('&')
    : raw.includes(';')
      ? raw.split(';')
      : raw.split(',');

  for (const chunk of chunks) {
    const pair = chunk.trim();
    if (!pair) continue;

    const idx = pair.indexOf('=');
    if (idx <= 0) continue;

    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key || !value) continue;

    if (/^(true|false)$/i.test(value)) {
      params[key] = value.toLowerCase() === 'true';
      continue;
    }

    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) {
      params[key] = numberValue;
      continue;
    }

    params[key] = value;
  }

  return Object.keys(params).length > 0 ? params : undefined;
}

function parseSerpHumanProfile(value: unknown): 'chrome' | 'off' {
  if (typeof value !== 'string') {
    return DEFAULT_SERP_HUMAN_PROFILE;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'off' || normalized === 'false' || normalized === 'none' || normalized === '0') {
    return 'off';
  }

  if (normalized === 'chrome' || normalized === 'browser' || normalized === 'human') {
    return 'chrome';
  }

  if (normalized === 'default' || normalized === 'on' || normalized === 'true' || normalized === '1') {
    return 'chrome';
  }

  return DEFAULT_SERP_HUMAN_PROFILE;
}

export function parseSpiderSerpConfig(options: Record<string, unknown>): SpiderSerpOptionConfig {
  const enabled = Boolean(getOptionValue(options, 'serp', 'serpEnabled'));
  const topKeywordsLimit = toNonNegativeInt(getOptionValue(options, 'serpTopKeywords', 'serp-top-keywords'), DEFAULT_SERP_KEYWORD_LIMIT);
  const queriesLimit = toNonNegativeInt(getOptionValue(options, 'serpQueryLimit', 'serp-query-limit'), DEFAULT_SERP_MAX_RESULTS);
  const resultsPerQuery = toNonNegativeInt(getOptionValue(options, 'serpResultsPerQuery', 'serp-results-per-query'), DEFAULT_SERP_MAX_RESULTS);
  const searchConcurrency = toNonNegativeInt(
    getOptionValue(options, 'serpConcurrency', 'serp-concurrency'),
    DEFAULT_SERP_CONCURRENCY
  );
  const searchDelayMs = toNonNegativeInt(
    getOptionValue(options, 'serpDelayMs', 'serp-delay-ms', 'serpDelay'),
    DEFAULT_SERP_DELAY_MS
  );
  const searchDelayJitterMs = toNonNegativeInt(
    getOptionValue(options, 'serpDelayJitterMs', 'serp-delay-jitter-ms', 'serpJitterMs'),
    DEFAULT_SERP_JITTER_MS
  );
  const searchCaptchaCooldownMs = toNonNegativeInt(
    getOptionValue(options, 'serpCaptchaCooldownMs', 'serp-captcha-cooldown-ms', 'serpCaptchaCooldown'),
    DEFAULT_SERP_CAPTCHA_COOLDOWN_MS
  );
  const searchMaxConsecutiveBlocks = toNonNegativeInt(
    getOptionValue(options, 'serpMaxConsecutiveBlocks', 'serp-max-consecutive-blocks'),
    DEFAULT_SERP_MAX_CONSECUTIVE_BLOCKS
  );
  const searchRetryCount = toNonNegativeInt(
    getOptionValue(options, 'serpRetryCount', 'serp-retry-count', 'serpRetries'),
    DEFAULT_SERP_RETRY_COUNT
  );
  const searchRetryDelayMs = toNonNegativeInt(
    getOptionValue(options, 'serpRetryDelayMs', 'serp-retry-delay-ms', 'serpRetryDelay'),
    DEFAULT_SERP_RETRY_DELAY_MS
  );
  const searchSource = toSerpSearchSource(
    getOptionValue(options, 'serpSource', 'serp-source')
  );

  const country = getOptionValue(
    options,
    'serpCountry',
    'serp-country',
    'serpRegion',
    'serp-region',
  );

  return {
    enabled,
    topKeywordsLimit: topKeywordsLimit > 0 ? topKeywordsLimit : DEFAULT_SERP_KEYWORD_LIMIT,
    queriesLimit: queriesLimit > 0 ? queriesLimit : DEFAULT_SERP_MAX_RESULTS,
    resultsPerQuery: resultsPerQuery > 0 ? resultsPerQuery : DEFAULT_SERP_MAX_RESULTS,
    searchConcurrency: searchConcurrency > 0 ? searchConcurrency : DEFAULT_SERP_CONCURRENCY,
    searchDelayMs: searchDelayMs > 0 ? searchDelayMs : DEFAULT_SERP_DELAY_MS,
    searchDelayJitterMs: searchDelayJitterMs > 0 ? searchDelayJitterMs : DEFAULT_SERP_JITTER_MS,
    searchCaptchaCooldownMs: searchCaptchaCooldownMs > 0 ? searchCaptchaCooldownMs : DEFAULT_SERP_CAPTCHA_COOLDOWN_MS,
    searchMaxConsecutiveBlocks: searchMaxConsecutiveBlocks >= 0
      ? searchMaxConsecutiveBlocks
      : DEFAULT_SERP_MAX_CONSECUTIVE_BLOCKS,
    searchRetryCount: searchRetryCount >= 0 ? searchRetryCount : DEFAULT_SERP_RETRY_COUNT,
    searchRetryDelayMs: searchRetryDelayMs > 0 ? searchRetryDelayMs : DEFAULT_SERP_RETRY_DELAY_MS,
      searchOptions: {
      transport: toSearchTransport(getOptionValue(options, 'serpTransport', 'serp-transport')),
      source: searchSource,
      timeout: toNonNegativeInt(getOptionValue(options, 'serpTimeout', 'serp-timeout'), 0) || undefined,
      country: toOptionString(country),
      gl: toOptionString(getOptionValue(options, 'serpGl', 'serp-gl')),
      hl: toOptionString(getOptionValue(options, 'serpHl', 'serp-hl')),
      safe: toOptionString(getOptionValue(options, 'serpSafe', 'serp-safe')),
      as_q: toOptionString(getOptionValue(options, 'serpAsQ', 'serp-as-q')),
      as_epq: toOptionString(getOptionValue(options, 'serpAsEpq', 'serp-as-epq', 'serpAsEpq')),
      as_oq: toOptionString(getOptionValue(options, 'serpAsOq', 'serp-as-oq')),
      as_eq: toOptionString(getOptionValue(options, 'serpAsEq', 'serp-as-eq')),
      as_sitesearch: toOptionString(getOptionValue(options, 'serpAsSitesearch', 'serp-as-sitesearch', 'serpAsSitesearch')),
      as_filetype: toOptionString(getOptionValue(options, 'serpAsFiletype', 'serp-as-filetype', 'serpAsFiletype')),
      as_rights: toOptionString(getOptionValue(options, 'serpAsRights', 'serp-as-rights', 'serpAsRights')),
      as_nlo: toOptionString(getOptionValue(options, 'serpAsNlo', 'serp-as-nlo', 'serpNlo')),
      as_nhi: toOptionString(getOptionValue(options, 'serpAsNhi', 'serp-as-nhi', 'serpNhi')),
      humanProfile: parseSerpHumanProfile(getOptionValue(options, 'serpHumanProfile', 'serp-human-profile')),
      lr: toOptionString(getOptionValue(options, 'serpLr', 'serp-lr')),
      cr: toOptionString(getOptionValue(options, 'serpCr', 'serp-cr')),
      tbs: toOptionString(getOptionValue(options, 'serpTbs', 'serp-tbs')),
      tbm: toOptionString(getOptionValue(options, 'serpTbm', 'serp-tbm')),
      extraParams: parseSerpExtraParams(getOptionValue(options, 'serpExtra', 'serp-extra')),
    },
  };
}

/**
 * Google Search Module
 *
 * Provides advanced search helpers for Google Search using Recker transport stack.
 *
 * @example
 * ```ts
 * import { searchGoogleAdvanced } from 'recker/search';
 *
 * const page = await searchGoogleAdvanced('nodejs stream processing', {
 *   asEpq: 'backpressure',
 *   asSitesearch: 'github.com',
 *   tbs: 'qdr:d',
 *   transport: 'auto',
 * });
 *
 * console.log(page.results[0]?.title);
 * ```
 */

import { createClient } from '../core/client.js';
import { ValidationError } from '../core/errors.js';
import { HttpRequest } from '../core/request.js';
import { ScrapeDocument } from '../scrape/document.js';
import type { ScrapeElement } from '../scrape/element.js';
import {
  detectBlock,
  detectCaptcha,
  type BlockDetectionResult,
  type CaptchaDetectionResult,
} from '../utils/block-detector.js';
import { getRandomUserAgent } from '../utils/user-agent.js';

const GOOGLE_SEARCH_ORIGIN = 'https://www.google.com';
const GOOGLE_RESULT_SNIPPET_SELECTOR_ORDER = [
  '[data-sncf="1"]',
  'div[data-sncf="1"]',
  'span.aCOpRe',
  'div.aCOpRe',
  'div.VwiC3b',
  'span.VwiC3b',
  'div.BNeawe',
  'div.yXK7lf',
  'div[data-attrid="wa:/description"]',
];
const GOOGLE_RESULT_LINK_SELECTORS = [
  'a[href^="/url?q="]',
  'a[href^="https://www.google.com/url?"]',
  'a[href^="http://www.google.com/url?"]',
];

const GOOGLE_RESULT_CONTAINER_SELECTORS =
  '[data-hveid], [data-ved], div[class*="g"], div[class*="MjjY"], div[class*="tF2Cxc"], [class*="xpd"]';
const GOOGLE_BROWSER_PROFILE_GS_LCRP_VALUES = [
  'EgZjaHJvbWUyBggAEEUYOdIBCDIwNzlqMGoxqAIAsAIA',
  'EgZjaHJvbWUyBggAEEUYOdIBCDIwMjlqMGoxqAIAsAIA',
  'EgZjaHJvbWUyBggAEEUYOdIBCDIwMzNqMGoxqAIAsAIA',
];
const GOOGLE_BROWSER_PROFILE_AQS_VALUES = [
  'EgNQQxIEGAM%3D',
  'EgZjaHJvbWUyBggAEEUYOdIB',
  'EgYIARABGBQyGAM%3D',
];
const GOOGLE_SEARCH_PARAM_IE_VALUES = ['UTF-8', 'utf-8', 'UTF-8', 'utf-8'];
const GOOGLE_BROWSER_SEI_LENGTH = 16;

const GOOGLE_AD_CONTAINER_CLASS_HINTS = [
  'ad',
  'ads',
  'sponsored',
  'ad_cx',
  'pla',
  'shopping',
  'uEierd',
];

const GOOGLE_AD_TEXT_HINTS = [
  'anúncio',
  'anuncio',
  'sponsored',
  'patrocinado',
  'patrocinada',
  'patrocínio',
  'publi',
  'publicidade',
  'ad',
  'ads',
  'anúncios',
  'anunciante',
];

const COUNTRY_CODE_PATTERN = /^[a-z]{2}$/;
const GOOGLE_SEARCH_HOST_OVERRIDES: Record<string, string> = {
  br: 'google.com.br',
  de: 'google.de',
  fr: 'google.fr',
  es: 'google.es',
  it: 'google.it',
  in: 'google.co.in',
  uk: 'google.co.uk',
  gb: 'google.co.uk',
  us: 'google.com',
  au: 'google.com.au',
  ca: 'google.ca',
  mx: 'google.com.mx',
  ar: 'google.com.ar',
};
const GOOGLE_DEFAULT_LANGUAGE_BY_COUNTRY: Record<string, string> = {
  br: 'pt-BR',
  pt: 'pt-PT',
  pt_br: 'pt-BR',
  de: 'de',
  fr: 'fr',
  es: 'es',
  it: 'it',
  in: 'en-IN',
  mx: 'es',
  ar: 'es',
  au: 'en',
  ca: 'en',
  gb: 'en',
  uk: 'en',
};
const SERP_BLOCK_CONFIDENCE = 0.6;
const URL_DOMAIN_MARKET_MAP: Record<string, string> = {
  'co.uk': 'uk',
  'com.br': 'br',
  'co.br': 'br',
  'com.au': 'au',
  'co.in': 'in',
  'com.ar': 'ar',
  'com.mx': 'mx',
};

const COUNTRY_ALIASES: Record<string, string> = {
  us: 'us',
  usa: 'us',
  united_states: 'us',
  'united states': 'us',
  br: 'br',
  brasil: 'br',
  brazil: 'br',
  pt_br: 'br',
  pt: 'br',
  de: 'de',
  germany: 'de',
  deutschland: 'de',
  gb: 'gb',
  uk: 'gb',
  england: 'gb',
  britain: 'gb',
  'united kingdom': 'gb',
  fr: 'fr',
  france: 'fr',
  spain: 'es',
  españa: 'es',
  es: 'es',
  ca: 'ca',
  mexico: 'mx',
  mx: 'mx',
  it: 'it',
  italy: 'it',
  au: 'au',
  india: 'in',
  in: 'in',
  argentina: 'ar',
  ar: 'ar',
};

const COUNTRY_ALIASES_NORMALIZED = Object.entries(COUNTRY_ALIASES).reduce<Record<string, string>>(
  (acc, [key, value]) => {
    acc[key.toLowerCase().replace(/[^a-z]/g, '_')] = value;
    return acc;
  },
  {},
);
const SERP_SEARCH_SOURCES = ['google'] as const;

type SearchTransport = 'auto' | 'undici' | 'curl';
export type SerpSearchSource = 'google';

export type { SearchTransport };

export interface GoogleSearchAdvancedOptions {
  /** Required search phrase. */
  asQ?: string;
  /** All words */
  as_q?: string;
  /** Exact phrase */
  asEpq?: string;
  /** Exact phrase */
  as_epq?: string;
  /** Any of these words */
  asOq?: string;
  /** Any of these words */
  as_oq?: string;
  /** Excluding words */
  asEq?: string;
  /** Excluding words */
  as_eq?: string;
  /** Site filter */
  asSitesearch?: string;
  /** Site filter */
  as_sitesearch?: string;
  /** File type filter */
  asFiletype?: string;
  /** File type filter */
  as_filetype?: string;
  /** Rights/license filter */
  asRights?: string;
  /** Rights/license filter */
  as_rights?: string;
  /** Numeric lower bound */
  asNlo?: number | string;
  /** Numeric lower bound */
  as_nlo?: number | string;
  /** Numeric upper bound */
  asNhi?: number | string;
  /** Numeric upper bound */
  as_nhi?: number | string;
  /** SafeSearch */
  safe?: string;
  /** Result type */
  tbm?: string;
  /** Result count */
  num?: number;
  /** Start offset */
  start?: number;
  /** Time/country/language filters */
  tbs?: string;
  lr?: string;
  cr?: string;
  /** Country code or country name used for geolocation simulation */
  country?: string;
  gl?: string;
  hl?: string;
  /** Browser-like search signature profile used in query parameters (default: off). */
  humanProfile?: 'chrome' | 'off';
  /** Search provider/source to execute queries. */
  source?: SerpSearchSource;

  /** Transport mode for request execution */
  transport?: SearchTransport;
  /** Milliseconds timeout passed to client/request */
  timeout?: number;
  /** Maximum parsed results to return */
  maxResults?: number;
  /** Append custom params that are not explicitly modeled above. */
  extraParams?: Record<string, string | number | boolean>;
  /** Force custom user agent */
  userAgent?: string;
  /** Extra request headers (merged with the default headers). */
  headers?: HeadersInit;
  /** Return raw HTML in the response */
  includeRawHtml?: boolean;
}

export type GoogleSearchResultPlacement = 'ad' | 'organic' | 'unknown';

export interface GoogleSearchResult {
  rank: number;
  title: string;
  url: string;
  snippet?: string;
  displayedUrl?: string;
  placement?: GoogleSearchResultPlacement;
  placementHint?: string;
  source?: string;
}

export interface SearchTransportDetails {
  requested: SearchTransport;
  used: SearchTransport;
  fallbackUsed: boolean;
  impersonateAvailable: boolean;
}

export interface GoogleSearchTimings {
  dns?: number;
  tcp?: number;
  tls?: number;
  ttfb?: number;
  content?: number;
  total?: number;
}

export interface GoogleSearchCaptchaResult {
  detected: boolean;
  confidence: number;
  provider?: CaptchaDetectionResult['provider'];
  description?: string;
}

export interface GoogleSearchResponse {
  query: string;
  source: SerpSearchSource;
  searchUrl: string;
  results: GoogleSearchResult[];
  nextPageUrl?: string;
  nextPageStart?: number;
  resultStats?: number;
  block?: BlockDetectionResult;
  captcha?: GoogleSearchCaptchaResult;
  transport: SearchTransportDetails;
  status?: number;
  timings?: GoogleSearchTimings;
  rawHtml?: string;
}

interface NormalizedSearchOptions extends GoogleSearchAdvancedOptions {
  as_q: string;
  query: string;
  source: SerpSearchSource;
  asEpq: string;
  asOq: string;
  asEq: string;
  as_sitesearch: string;
  as_filetype: string;
  as_rights: string;
  as_nlo: string;
  as_nhi: string;
  gl: string;
  humanProfile: 'chrome' | 'off';
  transport: SearchTransport;
  includeRawHtml: boolean;
  searchOrigin: string;
  searchBaseUrl: string;
}

interface SearchFetchResult {
  html: string;
  status: number;
  transport: SearchTransport;
  fallbackUsed: boolean;
  impersonateAvailable: boolean;
  block?: BlockDetectionResult;
  captcha?: GoogleSearchCaptchaResult;
  timings?: GoogleSearchTimings;
}

function normalizeNumberTiming(value: unknown): number | undefined {
  if (typeof value !== 'number') return undefined;
  if (!Number.isFinite(value)) return undefined;
  if (value <= 0) return undefined;
  return Math.round(value);
}

function toSearchTimings(timings: unknown): GoogleSearchTimings | undefined {
  if (!timings || typeof timings !== 'object') return undefined;
  const parsed = timings as Record<string, number | undefined>;
  const normalized: GoogleSearchTimings = {
    dns: normalizeNumberTiming(parsed.dns),
    tcp: normalizeNumberTiming(parsed.tcp),
    tls: normalizeNumberTiming(parsed.tls),
    ttfb: normalizeNumberTiming(parsed.firstByte),
    content: normalizeNumberTiming(parsed.content),
    total: normalizeNumberTiming(parsed.total),
  };
  return Object.values(normalized).some(value => value !== undefined) ? normalized : undefined;
}

function detectSearchCaptcha(status: number, headers: Headers, body: string): GoogleSearchCaptchaResult {
  const result = detectCaptcha(
    { status, headers },
    body,
  );
  return {
    detected: result.detected,
    confidence: result.confidence,
    provider: result.provider,
    description: result.description,
  };
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isDefined(value: string | number | boolean | undefined | null): value is string | number | boolean {
  return value !== undefined && value !== null;
}

function toParamValue(value: string | number | boolean | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value ? '1' : '0';
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function pickRandomProfileValue(values: string[]): string {
  if (values.length === 0) return '';
  const index = Math.floor(Math.random() * values.length);
  return values[index];
}

function generateSeiHint(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const chars: string[] = [];
  for (let i = 0; i < GOOGLE_BROWSER_SEI_LENGTH; i++) {
    chars.push(alphabet[Math.floor(Math.random() * alphabet.length)] ?? 'a');
  }
  return chars.join('');
}

function normalizeHumanSearchProfile(value: unknown): 'chrome' | 'off' {
  if (typeof value !== 'string') {
    return 'off';
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'off' || normalized === 'false' || normalized === '0') {
    return 'off';
  }

  if (normalized === 'chrome' || normalized === 'browser' || normalized === 'human') {
    return 'chrome';
  }

  return 'off';
}

function normalizeSearchSource(value: unknown): SerpSearchSource {
  if (typeof value !== 'string') return 'google';
  const normalized = value.trim().toLowerCase();
  return SERP_SEARCH_SOURCES.includes(normalized as SerpSearchSource)
    ? (normalized as SerpSearchSource)
    : 'google';
}

function pick<T>(
  ...values: Array<T | undefined>
): T | undefined {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function normalizeCountryCode(input: string): string {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, '_');

  if (COUNTRY_CODE_PATTERN.test(normalized)) {
    return normalized;
  }

  const cleaned = normalized.replace(/[^a-z_]/g, '');
  const directAlias = COUNTRY_ALIASES_NORMALIZED[cleaned];
  if (directAlias) {
    return directAlias;
  }

  if (normalized.includes('_')) {
    const tail = normalized.split('_').pop() || '';
    if (COUNTRY_CODE_PATTERN.test(tail)) {
      return tail;
    }
  }

  return '';
}

function resolveCountryCode(country: string | undefined, legacyGl: string | undefined): string {
  if (country !== undefined) {
    const resolved = normalizeCountryCode(country);
    if (!resolved) {
      throw new ValidationError('Invalid country for Google search. Use ISO 3166-1 alpha-2 code or a known country name.', {
        field: 'country',
        value: country,
      });
    }
    return resolved;
  }

  return legacyGl ? legacyGl.trim().toLowerCase() : '';
}

function parseCountryFromHostname(hostname: string): string | undefined {
  const normalized = hostname
    .toLowerCase()
    .replace(/^www\./, '')
    .trim();
  const parts = normalized.split('.');
  if (parts.length < 2) return undefined;

  const suffix2 = parts.slice(-2).join('.');
  const mapped2 = URL_DOMAIN_MARKET_MAP[suffix2];
  if (mapped2) return mapped2;

  const last = parts[parts.length - 1];
  if (COUNTRY_CODE_PATTERN.test(last)) return last;
  return undefined;
}

function resolveGoogleSearchOrigin(gl: string): string {
  if (!gl) return GOOGLE_SEARCH_ORIGIN;
  const normalized = gl.toLowerCase();
  const host = GOOGLE_SEARCH_HOST_OVERRIDES[normalized] ?? `google.${normalized}`;
  return `https://www.${host}`;
}

function normalizeSearchOrigin(origin: string): string {
  try {
    const parsed = new URL(origin);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    if (origin.startsWith('http://') || origin.startsWith('https://')) return origin;
    return `https://www.google.com`;
  }
}

function pickGoogleSearchOrigins(primary: string, country: string): string[] {
  const unique: string[] = [];
  const push = (value: string) => {
    if (!value) return;
    if (!unique.includes(value)) unique.push(value);
  };

  const normalizedPrimary = normalizeSearchOrigin(primary);
  const canonical = 'https://www.google.com';

  push(normalizedPrimary);
  push(canonical);

  const countryHost = country ? GOOGLE_SEARCH_HOST_OVERRIDES[country.toLowerCase()] : '';
  if (countryHost) {
    push(`https://www.${countryHost}`);
  }

  if (countryHost && `https://www.${countryHost}` !== canonical) {
    push('https://www.google.com');
  }

  // Fallback to plain http in case a specific egress path rejects TLS+HTTP2 combinations.
  if (normalizedPrimary.startsWith('https://')) {
    push(normalizedPrimary.replace(/^https:/, 'http:'));
  }

  return unique;
}

export function inferSearchLocaleFromUrl(targetUrl: string): { country: string; gl: string; hl?: string } | undefined {
  try {
    const parsed = new URL(targetUrl);
    const country = parseCountryFromHostname(parsed.hostname);
    if (!country) return undefined;
    const resolved = normalizeCountryCode(country);
    if (!resolved) return undefined;

    return {
      country: resolved,
      gl: resolved,
      hl: GOOGLE_DEFAULT_LANGUAGE_BY_COUNTRY[resolved],
    };
  } catch {
    return undefined;
  }
}

function normalizeOptions(query: string, options: GoogleSearchAdvancedOptions = {}): NormalizedSearchOptions {
  const normalizedQuery = cleanText(query);
  if (!normalizedQuery) {
    throw new ValidationError('Google query is required', {
      field: 'query',
      value: query,
    });
  }

  const resolvedTransport = (options.transport ?? 'auto');
  const gl = resolveCountryCode(options.country, options.gl);
  const searchOrigin = resolveGoogleSearchOrigin(gl);
  const source = normalizeSearchSource(options.source);

  return {
    ...options,
    as_q: pick(options.as_q, options.asQ) ?? '',
    query: normalizedQuery,
    asEpq: pick(options.as_epq, options.asEpq) ?? '',
    asOq: pick(options.as_oq, options.asOq) ?? '',
    asEq: pick(options.as_eq, options.asEq) ?? '',
    as_sitesearch: pick(options.as_sitesearch, options.asSitesearch) ?? '',
    as_filetype: pick(options.as_filetype, options.asFiletype) ?? '',
    as_rights: pick(options.as_rights, options.asRights) ?? '',
    as_nlo: toParamValue(pick(options.as_nlo, options.asNlo)) ?? '',
    as_nhi: toParamValue(pick(options.as_nhi, options.asNhi)) ?? '',
    gl,
    humanProfile: normalizeHumanSearchProfile(options.humanProfile),
    source,
    transport: resolvedTransport,
    includeRawHtml: options.includeRawHtml ?? false,
    searchOrigin,
    searchBaseUrl: `${searchOrigin}/search`,
  };
}

function buildSearchUrl(query: string, options: NormalizedSearchOptions): string {
  const params = new URLSearchParams();

  params.set('q', query);
  // Chrome sends oq (original query) = q for direct searches, and sourceid=chrome
  params.set('oq', query);
  params.set('sourceid', 'chrome');
  params.set('ie', pickRandomProfileValue(GOOGLE_SEARCH_PARAM_IE_VALUES));
  params.set('oe', pickRandomProfileValue(GOOGLE_SEARCH_PARAM_IE_VALUES));
  if (options.humanProfile === 'chrome') {
    const qs = query.trim().toLowerCase();
    params.set('aqs', pickRandomProfileValue(GOOGLE_BROWSER_PROFILE_AQS_VALUES));
    params.set('gs_lcrp', pickRandomProfileValue(GOOGLE_BROWSER_PROFILE_GS_LCRP_VALUES));
    params.set('sei', generateSeiHint());
    params.set('client', 'chrome');
  }

  if (options.as_q) params.set('as_q', options.as_q);
  if (options.asEpq) params.set('as_epq', options.asEpq);
  if (options.asOq) params.set('as_oq', options.asOq);
  if (options.asEq) params.set('as_eq', options.asEq);
  if (options.as_sitesearch) params.set('as_sitesearch', options.as_sitesearch);
  if (options.as_filetype) params.set('as_filetype', options.as_filetype);
  if (options.as_rights) params.set('as_rights', options.as_rights);
  if (options.as_nlo) params.set('as_nlo', options.as_nlo);
  if (options.as_nhi) params.set('as_nhi', options.as_nhi);

  if (options.safe) params.set('safe', options.safe);
  if (options.tbm) params.set('tbm', options.tbm);
  if (options.lr) params.set('lr', options.lr);
  if (options.cr) params.set('cr', options.cr);
  if (options.gl) params.set('gl', options.gl);
  if (options.hl) params.set('hl', options.hl);

  if (isDefined(options.num)) {
    const parsed = Number(options.num);
    if (Number.isFinite(parsed) && parsed > 0) {
      params.set('num', String(Math.min(100, Math.floor(parsed))));
    }
  }

  if (isDefined(options.start)) {
    const parsedStart = Number(options.start);
    if (Number.isFinite(parsedStart) && parsedStart >= 0) {
      params.set('start', String(Math.floor(parsedStart)));
    }
  }

  if (options.tbs) params.set('tbs', options.tbs);
  if (options.extraParams) {
    for (const [key, value] of Object.entries(options.extraParams)) {
      const normalized = toParamValue(value);
      if (normalized !== undefined) {
        params.set(key, normalized);
      }
    }
  }

  return `${options.searchBaseUrl}?${params.toString()}`;
}

function normalizeRequestHeaders(
  inputHeaders: HeadersInit | undefined,
  userAgent: string,
  referer: string,
  locale?: string,
): Record<string, string> {
  const normalizedLocale = (locale || 'en-US').replace('_', '-');
  const acceptLanguage = `${normalizedLocale},en-US;q=0.8,en;q=0.6`;

  const headers = new Headers({
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'accept-language': acceptLanguage,
    'cache-control': 'max-age=0',
    'sec-ch-ua': '"Not.A/Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
    'sec-ch-ua-platform': '"Windows"',
    'sec-ch-ua-mobile': '?0',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'user-agent': userAgent,
    referer,
    // SOCS=CAI bypasses the GDPR consent redirect (consent.google.com)
    // that would otherwise land on a page with reCAPTCHA detection signals.
    // This cookie tells Google that cookie consent was already given implicitly.
    cookie: 'SOCS=CAI',
  });

  if (inputHeaders) {
    const incoming = new Headers(inputHeaders);
    incoming.forEach((value, key) => headers.set(key, value));
  }

  const merged: Record<string, string> = {};
  headers.forEach((value, key) => {
    merged[key] = value;
  });

  return merged;
}

function isUsefulSearchResponse(
  parsed: { results: Array<unknown> },
  fetchResult: SearchFetchResult,
): boolean {
  if (parsed.results.length > 0) return true;
  if (fetchResult.block?.blocked && fetchResult.block.confidence >= SERP_BLOCK_CONFIDENCE) return false;
  if (fetchResult.captcha?.detected && fetchResult.captcha.confidence >= SERP_BLOCK_CONFIDENCE) return false;
  return false;
}

function isHardSearchBlock(
  parsed: { results: Array<unknown> },
  fetchResult: SearchFetchResult,
): boolean {
  if (fetchResult.captcha?.detected && fetchResult.captcha.confidence >= SERP_BLOCK_CONFIDENCE) return true;
  if (fetchResult.block?.blocked && fetchResult.block.confidence >= SERP_BLOCK_CONFIDENCE) return true;
  if (parsed.results.length === 0 && fetchResult.block?.reason === 'captcha') return true;
  return false;
}

async function hasImpersonateBinary(): Promise<boolean> {
  try {
    const { hasImpersonate } = await import('../utils/binary-manager.js');
    return hasImpersonate();
  } catch {
    return false;
  }
}

async function fetchWithCurl(
  url: string,
  headers: Record<string, string>,
  timeout?: number
): Promise<{ html: string; status: number; responseHeaders: Headers; timings?: GoogleSearchTimings }> {
  const { CurlTransport } = await import('../transport/curl.js');
  const requestStart = performance.now();
  const transport = new CurlTransport();
  const request = new HttpRequest(url, {
    method: 'GET',
    headers,
    timeout,
  });

  const response = await transport.dispatch(request);
  const requestEnd = performance.now();
  const html = await response.text();

  const parsedTimings = toSearchTimings(response.timings);
  const timings = parsedTimings ?? {
    total: Math.round(requestEnd - requestStart),
  };

  return {
    html,
    status: response.status,
    responseHeaders: response.headers,
    timings,
  };
}


async function fetchSearchResults(
  url: string,
  options: NormalizedSearchOptions
): Promise<SearchFetchResult> {
  const headers = normalizeRequestHeaders(
    options.headers,
    options.userAgent ?? getRandomUserAgent('desktop.chrome'),
    options.searchOrigin,
    options.hl,
  );
  const requestTimeout = options.timeout;
  const impersonateAvailable = await hasImpersonateBinary();

  if (options.transport === 'curl') {
    if (!impersonateAvailable) {
      throw new ValidationError('Transport "curl" requires curl-impersonate; install it with `rek setup`', {
        field: 'transport',
        value: options.transport,
      });
    }

    const directResponse = await fetchWithCurl(url, headers, requestTimeout);
    const directBlock = detectBlock(
      { status: directResponse.status, headers: directResponse.responseHeaders },
      directResponse.html
    );
    return {
      html: directResponse.html,
      status: directResponse.status,
      transport: 'curl',
      fallbackUsed: false,
      impersonateAvailable,
      block: directBlock,
      captcha: detectSearchCaptcha(
        directResponse.status,
        directResponse.responseHeaders,
        directResponse.html
      ),
      timings: directResponse.timings,
    };
  }

  const client = createClient({ timeout: requestTimeout });

  const performUndiciRequest = async (): Promise<SearchFetchResult> => {
    const response = await client.get(url, {
      headers,
      throwHttpErrors: false,
    });
    const html = await response.text();
    const block = detectBlock(
      { status: response.status, headers: response.headers },
      html
    );
    const captcha = detectSearchCaptcha(response.status, response.headers, html);

    return {
      html,
      status: response.status,
      transport: 'undici',
      fallbackUsed: false,
      impersonateAvailable,
      block,
      captcha,
      timings: toSearchTimings(response.timings),
    };
  };

  if (!impersonateAvailable) {
    return performUndiciRequest();
  }

  const shouldFallbackToUndici = (
    block: BlockDetectionResult,
    captcha: GoogleSearchCaptchaResult
  ): boolean => {
    if (block.blocked && block.confidence >= SERP_BLOCK_CONFIDENCE) return true;
    if (captcha.detected && captcha.confidence >= SERP_BLOCK_CONFIDENCE) return true;
    if (block.reason === 'captcha' || block.reason === 'rate-limit') return true;
    return false;
  };

  const getSearchResponseRisk = (response: SearchFetchResult): number => (
    (response.block?.confidence ?? 0) + (response.captcha?.confidence ?? 0)
  );

  const shouldKeepPrimaryImpersonateResponse = (
    primary: SearchFetchResult,
    fallback: SearchFetchResult,
  ): boolean => (
    getSearchResponseRisk(primary) <= getSearchResponseRisk(fallback)
  );

  try {
    const primaryImpersonateResponse = await fetchWithCurl(url, headers, requestTimeout);
    const primaryImpersonateBlock = detectBlock(
      { status: primaryImpersonateResponse.status, headers: primaryImpersonateResponse.responseHeaders },
      primaryImpersonateResponse.html
    );
    const primaryImpersonateCaptcha = detectSearchCaptcha(
      primaryImpersonateResponse.status,
      primaryImpersonateResponse.responseHeaders,
      primaryImpersonateResponse.html
    );

    const primaryResult: SearchFetchResult = {
      html: primaryImpersonateResponse.html,
      status: primaryImpersonateResponse.status,
      transport: 'curl',
      fallbackUsed: false,
      impersonateAvailable,
      block: primaryImpersonateBlock,
      captcha: primaryImpersonateCaptcha,
      timings: primaryImpersonateResponse.timings,
    };

    if (!shouldFallbackToUndici(primaryImpersonateBlock, primaryImpersonateCaptcha)) {
      return {
        html: primaryImpersonateResponse.html,
        status: primaryImpersonateResponse.status,
        transport: 'curl',
        fallbackUsed: false,
        impersonateAvailable,
        block: primaryImpersonateBlock,
        captcha: primaryImpersonateCaptcha,
        timings: primaryImpersonateResponse.timings,
      };
    }

    const fallback = await performUndiciRequest();
    if (!shouldKeepPrimaryImpersonateResponse(primaryResult, fallback)) {
      return {
        ...fallback,
        transport: fallback.transport,
        fallbackUsed: true,
        impersonateAvailable,
      };
    }

    return primaryResult;
  } catch {
    // Fall back to undici when impersonation request fails.
  }

  const fallback = await performUndiciRequest();
  return {
    ...fallback,
    transport: fallback.transport,
    fallbackUsed: true,
    impersonateAvailable,
  };
}

function isGoogleOwnHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  return (
    lower === 'www.google.com' ||
    lower === 'google.com' ||
    lower.endsWith('.google.com') ||
    lower.endsWith('.googleapis.com') ||
    lower.endsWith('.googleusercontent.com') ||
    lower.endsWith('.googlesyndication.com') ||
    lower.endsWith('.doubleclick.net') ||
    lower.endsWith('.gstatic.com') ||
    lower.startsWith('www.google.') ||
    /^([a-z0-9-]+\.)*google(\.[a-z]{2,})+$/.test(lower)
  );
}

function resolveSearchResultUrl(rawHref: string, searchOrigin: string): string | null {
  try {
    const normalized = rawHref.startsWith('//') ? `https:${rawHref}` : rawHref;
    const parsed = new URL(normalized, searchOrigin);

    // Google redirect URL (/url?q=... or https://www.google.com/url?...)
    const rawResultUrl = parsed.searchParams.get('q') ?? parsed.searchParams.get('url');
    if (rawResultUrl) {
      const candidate = new URL(decodeURIComponent(rawResultUrl), searchOrigin);
      if (!candidate.protocol.startsWith('http')) return null;
      if (candidate.pathname === '/search' && candidate.hostname.includes('google.')) return null;
      return candidate.toString();
    }

    // Direct URL (modern Google skips the redirect wrapper)
    if (parsed.protocol.startsWith('http') && !isGoogleOwnHost(parsed.hostname)) {
      return parsed.toString();
    }

    return null;
  } catch {
    return null;
  }
}

function extractDisplayedUrl(linkUrl: string, containerText?: string): string {
  const direct = (() => {
    try {
      return new URL(linkUrl).hostname;
    } catch {
      /* c8 ignore next */
      return '';
    }
  })();
  if (direct) return cleanText(direct);
  /* c8 ignore next */
  return containerText ? cleanText(containerText).slice(0, 120) : '';
}

function looksLikeSnippet(text: string, title: string): boolean {
  const cleaned = cleanText(text);
  if (cleaned.length < 25 || cleaned.length > 600) return false;
  if (cleaned === title) return false;
  if (/^https?:\/\//i.test(cleaned)) return false;
  return true;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasAdHintText(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) return false;

  return GOOGLE_AD_TEXT_HINTS.some((hint) => {
    const pattern = new RegExp(`(^|\\W)${escapeRegex(hint)}(\\W|$)`, 'i');
    return pattern.test(normalized);
  });
}

function hasAdClassHint(className: string | undefined): boolean {
  if (!className) return false;
  const normalized = cleanText(className).toLowerCase();
  if (!normalized) return false;

  return GOOGLE_AD_CONTAINER_CLASS_HINTS.some((hint) => {
    const classes = normalized.split(/\s+/);
    return classes.some((token) => token === hint || token.startsWith(`${hint}-`));
  });
}

function detectResultPlacement(
  anchor: ScrapeElement,
  container: ScrapeElement
): {
  placement: GoogleSearchResultPlacement;
  placementHint?: string;
} {
  const isScrapeElementLike = (value: unknown): value is ScrapeElement => {
    if (value === null || value === undefined) return false;
    if (typeof value !== 'object') return false;

    const candidate = value as { length?: unknown; attrs?: unknown };
    return 'length' in candidate
      && typeof candidate.length === 'number'
      && typeof candidate.attrs === 'function';
  };

  const isResultContainer = (node: ScrapeElement): boolean => {
    const tag = (() => {
      const raw = node as unknown as { tagName?: string | (() => string) };
      if (typeof raw.tagName === 'function') return raw.tagName().toLowerCase();
      if (typeof raw.tagName === 'string') return raw.tagName.toLowerCase();
      return '';
    })();
    return tag !== 'body' && tag !== 'html';
  };

  const anchorParent = typeof anchor.parent === 'function' ? anchor.parent() : undefined;
  const containerParent = typeof container.parent === 'function' ? container.parent() : undefined;
  const anchorNext = typeof anchor.next === 'function' ? anchor.next() : undefined;
  const anchorPrev = typeof anchor.prev === 'function' ? anchor.prev() : undefined;

  const checkList = [
    anchor,
    anchorParent,
    container,
    containerParent,
    anchorNext,
    anchorPrev,
  ].filter((node): node is ScrapeElement => {
    if (!isScrapeElementLike(node) || node.length === 0) return false;
    return isResultContainer(node);
  });

  for (const node of checkList) {

    const attributes = node.attrs();
    const className = node.attr('class');
    const dataAttributeKeys = Object.keys(attributes).filter((key) => {
      const normalized = key.toLowerCase();
      return normalized === 'data-text-ad'
        || normalized === 'data-rw'
        || normalized === 'data-snc'
        || normalized.startsWith('data-ad-')
        || normalized === 'data-ved'
        || normalized === 'data-pcu';
    });
    if (dataAttributeKeys.length > 0) {
      return {
        placement: 'ad',
        placementHint: cleanText(`${dataAttributeKeys.join(' ')} ${node.text()}`.slice(0, 120)),
      };
    }

    const dataAttributes = Object.entries(attributes)
      .filter(([key]) => key.startsWith('data-'))
      .map(([, value]) => value)
      .filter((value): value is string => typeof value === 'string');

    const text = cleanText(node.text());
    const dataText = dataAttributes.join(' ');

    if (hasAdHintText(node.attr('data-ved'))) {
      return {
        placement: 'ad',
        placementHint: cleanText(`${text} ${dataText}`.slice(0, 120)),
      };
    }

    if (hasAdClassHint(className) || hasAdHintText(dataText)) {
      return {
        placement: 'ad',
        placementHint: cleanText(`${className} ${dataText}`.slice(0, 120)),
      };
    }

    if (hasAdHintText(text)) {
      return {
        placement: 'ad',
        placementHint: text,
      };
    }
  }

  return {
    placement: 'organic',
    placementHint: undefined,
  };
}

function parseResultStats(text: string): number | undefined {
  const normalized = text.replace(/,/g, '');
  const match = normalized.match(/([0-9]+)\s*(?:result|resultado)/i);
  if (!match) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseSearchPage(
  html: string,
  options: NormalizedSearchOptions,
  searchOrigin: string
): {
  results: GoogleSearchResult[];
  nextPageUrl?: string;
  nextPageStart?: number;
  resultStats?: number;
} {
  const doc = ScrapeDocument.createSync(html, { baseUrl: searchOrigin });
  const results: GoogleSearchResult[] = [];
  const seen = new Set<string>();
  const maxResults = options.maxResults ? Number(options.maxResults) : undefined;

  const linkSelector = GOOGLE_RESULT_LINK_SELECTORS.join(', ');
  const anchors = doc.selectAll(linkSelector);

  for (const anchor of anchors) {
    const rawHref = anchor.attr('href');
    if (!rawHref) continue;
    const resultUrl = resolveSearchResultUrl(rawHref, searchOrigin);
    if (!resultUrl || seen.has(resultUrl)) continue;

    const titleText = (() => {
      const fromHeading = anchor.find('h3').text();
      if (fromHeading) return cleanText(fromHeading);
      const fromContainer = anchor.text();
      return cleanText(fromContainer);
    })();

    if (!titleText) continue;

    const resultContainer = anchor.parents(GOOGLE_RESULT_CONTAINER_SELECTORS).first();
    const placement = detectResultPlacement(anchor, resultContainer);

    const snippet = (() => {
      for (const selector of GOOGLE_RESULT_SNIPPET_SELECTOR_ORDER) {
        const snippetNode = resultContainer.find(selector).first();
        const snippetText = cleanText(snippetNode.text());
        if (looksLikeSnippet(snippetText, titleText)) {
          return snippetText;
        }
      }

      const fallbackElements = resultContainer.find('span,div').toArray();
      for (const fallbackElement of fallbackElements) {
        const fallbackText = cleanText(fallbackElement.text());
        if (looksLikeSnippet(fallbackText, titleText)) {
          return fallbackText;
        }
      }

      const rootFallback = cleanText(resultContainer.text());
      if (looksLikeSnippet(rootFallback, titleText)) {
        return rootFallback.slice(0, 240);
      }

      return undefined;
    })();

    const item: GoogleSearchResult = {
      rank: results.length + 1,
      title: titleText,
      url: resultUrl,
      snippet,
      displayedUrl: extractDisplayedUrl(resultUrl, anchor.text()),
      placement: placement.placement,
      placementHint: placement.placementHint,
    };

    results.push(item);
    seen.add(resultUrl);

    if (typeof maxResults === 'number' && Number.isFinite(maxResults) && results.length >= maxResults) {
      break;
    }
  }

  // Pass 2: Modern Google sometimes serves direct hrefs instead of /url?q= redirects.
  // Guard: only anchors that contain an h3 heading — the definitive marker of a result
  // link (navigation, pagination and ads nav never wrap an h3).
  for (const anchor of doc.selectAll('a[href^="https://"], a[href^="http://"]')) {
    if (typeof maxResults === 'number' && Number.isFinite(maxResults) && results.length >= maxResults) break;

    const rawHref = anchor.attr('href');
    if (!rawHref) continue;

    const resultUrl = resolveSearchResultUrl(rawHref, searchOrigin);
    if (!resultUrl || seen.has(resultUrl)) continue;

    const titleText = cleanText(anchor.find('h3').text());
    if (!titleText) continue;

    const resultContainer = anchor.parents(GOOGLE_RESULT_CONTAINER_SELECTORS).first();
    const placement = detectResultPlacement(anchor, resultContainer);

    const snippet = (() => {
      for (const selector of GOOGLE_RESULT_SNIPPET_SELECTOR_ORDER) {
        const snippetNode = resultContainer.find(selector).first();
        const snippetText = cleanText(snippetNode.text());
        if (looksLikeSnippet(snippetText, titleText)) return snippetText;
      }

      const fallbackElements = resultContainer.find('span,div').toArray();
      for (const fallbackEl of fallbackElements) {
        const fallbackText = cleanText(fallbackEl.text());
        if (looksLikeSnippet(fallbackText, titleText)) return fallbackText;
      }

      const rootFallback = cleanText(resultContainer.text());
      if (looksLikeSnippet(rootFallback, titleText)) return rootFallback.slice(0, 240);
      return undefined;
    })();

    results.push({
      rank: results.length + 1,
      title: titleText,
      url: resultUrl,
      snippet,
      displayedUrl: extractDisplayedUrl(resultUrl, anchor.text()),
      placement: placement.placement,
      placementHint: placement.placementHint,
    });
    seen.add(resultUrl);
  }

  const nextPageRaw = (() => {
    const candidate = doc.selectFirst('a#pnnext, a[aria-label="Next"], a[id="pnnext"]').first();
    if (candidate && candidate.length) {
      const href = candidate.attr('href');
      if (!href) return undefined;
      try {
        return new URL(href, searchOrigin).toString();
      } catch {
        return undefined;
      }
    }
    return undefined;
  })();

  const nextPageStart = (() => {
    if (!nextPageRaw) return undefined;
    try {
      const nextUrl = new URL(nextPageRaw);
      const next = nextUrl.searchParams.get('start');
      if (!next) return undefined;
      const parsed = Number.parseInt(next, 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    } catch {
      /* c8 ignore next */
      return undefined;
    }
  })();

  const resultStats = parseResultStats(doc.selectFirst('#result-stats').text());

  return {
    results,
    nextPageUrl: nextPageRaw,
    nextPageStart,
    resultStats,
  };
}

export async function searchGoogleAdvanced(
  query: string,
  options: GoogleSearchAdvancedOptions = {}
): Promise<GoogleSearchResponse> {
  const normalized = normalizeOptions(query, options);
  const originCandidates = pickGoogleSearchOrigins(normalized.searchOrigin, normalized.gl);
  let fetchResult: SearchFetchResult | undefined;
  let parsed: ReturnType<typeof parseSearchPage> | undefined;
  let selectedSearchUrl = '';

  for (let index = 0; index < originCandidates.length; index += 1) {
    const origin = originCandidates[index];
    const isFinalCandidate = index === originCandidates.length - 1;
    const candidateOptions: NormalizedSearchOptions = {
      ...normalized,
      searchOrigin: origin,
      searchBaseUrl: `${origin}/search`,
    };

    const candidateUrl = buildSearchUrl(query, candidateOptions);
    const candidateResult = await fetchSearchResults(candidateUrl, candidateOptions);
    const candidateParsed = parseSearchPage(candidateResult.html, candidateOptions, candidateOptions.searchOrigin);

    fetchResult = candidateResult;
    parsed = candidateParsed;
    selectedSearchUrl = candidateUrl;

    if (isUsefulSearchResponse(candidateParsed, candidateResult) || isFinalCandidate) {
      break;
    }

    if (isHardSearchBlock(candidateParsed, candidateResult)) {
      break;
    }

    if (candidateParsed.results.length === 0) {
      // If a candidate returned zero hits (including without explicit block/captcha signals),
      // try alternate hosts before concluding. This avoids false negatives from host-specific parsing/layout changes.
      continue;
    }
  }

  if (!fetchResult || !parsed) {
    throw new ValidationError('Failed to execute Google search attempts');
  }

 const response: GoogleSearchResponse = {
    query: normalized.query,
    source: normalized.source,
    searchUrl: selectedSearchUrl,
    results: parsed.results,
    transport: {
      requested: normalized.transport,
      used: fetchResult.transport,
      fallbackUsed: fetchResult.fallbackUsed,
      impersonateAvailable: fetchResult.impersonateAvailable,
    },
    status: fetchResult.status,
    captcha: fetchResult.captcha,
    block: fetchResult.block,
    timings: fetchResult.timings,
    nextPageUrl: parsed.nextPageUrl,
    nextPageStart: parsed.nextPageStart,
    resultStats: parsed.resultStats,
  };

    if (normalized.includeRawHtml) {
      response.rawHtml = fetchResult.html;
    }

  return response;
}

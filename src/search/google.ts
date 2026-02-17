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
import { detectBlock, type BlockDetectionResult } from '../utils/block-detector.js';
import { getRandomUserAgent } from '../utils/user-agent.js';

const GOOGLE_SEARCH_BASE_URL = 'https://www.google.com/search';
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

const COUNTRY_CODE_PATTERN = /^[a-z]{2}$/;
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

type SearchTransport = 'auto' | 'undici' | 'curl';

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

export interface GoogleSearchResult {
  rank: number;
  title: string;
  url: string;
  snippet?: string;
  displayedUrl?: string;
  source?: string;
}

export interface SearchTransportDetails {
  requested: SearchTransport;
  used: SearchTransport;
  fallbackUsed: boolean;
  impersonateAvailable: boolean;
}

export interface GoogleSearchResponse {
  query: string;
  searchUrl: string;
  results: GoogleSearchResult[];
  nextPageUrl?: string;
  nextPageStart?: number;
  resultStats?: number;
  block?: BlockDetectionResult;
  transport: SearchTransportDetails;
  status?: number;
  rawHtml?: string;
}

interface NormalizedSearchOptions extends GoogleSearchAdvancedOptions {
  as_q: string;
  query: string;
  asEpq: string;
  asOq: string;
  asEq: string;
  as_sitesearch: string;
  as_filetype: string;
  as_rights: string;
  as_nlo: string;
  as_nhi: string;
  gl: string;
  transport: SearchTransport;
  includeRawHtml: boolean;
}

interface SearchFetchResult {
  html: string;
  status: number;
  transport: SearchTransport;
  fallbackUsed: boolean;
  impersonateAvailable: boolean;
  block?: BlockDetectionResult;
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

function normalizeOptions(query: string, options: GoogleSearchAdvancedOptions = {}): NormalizedSearchOptions {
  const normalizedQuery = cleanText(query);
  if (!normalizedQuery) {
    throw new ValidationError('Google query is required', {
      field: 'query',
      value: query,
    });
  }

  const resolvedTransport = (options.transport ?? 'auto');

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
    gl: resolveCountryCode(options.country, options.gl),
    transport: resolvedTransport,
    includeRawHtml: options.includeRawHtml ?? false,
  };
}

function buildSearchUrl(query: string, options: NormalizedSearchOptions): string {
  const params = new URLSearchParams();

  params.set('q', query);
  params.set('ie', 'UTF-8');
  params.set('oe', 'UTF-8');

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

  return `${GOOGLE_SEARCH_BASE_URL}?${params.toString()}`;
}

function normalizeRequestHeaders(
  inputHeaders: HeadersInit | undefined,
  userAgent: string
): Record<string, string> {
  const headers = new Headers({
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'max-age=0',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'user-agent': userAgent,
    referer: GOOGLE_SEARCH_ORIGIN,
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
): Promise<{ html: string; status: number }> {
  const { CurlTransport } = await import('../transport/curl.js');
  const transport = new CurlTransport();
  const request = new HttpRequest(url, {
    method: 'GET',
    headers,
    timeout,
  });

  const response = await transport.dispatch(request);
  const html = await response.text();
  return { html, status: response.status };
}

async function fetchSearchResults(
  url: string,
  options: NormalizedSearchOptions
): Promise<SearchFetchResult> {
  const headers = normalizeRequestHeaders(options.headers, options.userAgent ?? getRandomUserAgent('desktop.chrome'));
  const requestTimeout = options.timeout;
  const impersonateAvailable = options.transport !== 'undici' && (await hasImpersonateBinary());

  if (options.transport === 'curl' && !impersonateAvailable) {
    throw new ValidationError('Transport "curl" requires curl-impersonate; install it with `rek setup`', {
      field: 'transport',
      value: options.transport,
    });
  }

  if (options.transport === 'curl') {
    const directResponse = await fetchWithCurl(url, headers, requestTimeout);
    const directBlock = detectBlock(
      { status: directResponse.status, headers: new Headers() },
      directResponse.html
    );
    return {
      html: directResponse.html,
      status: directResponse.status,
      transport: 'curl',
      fallbackUsed: false,
      impersonateAvailable,
      block: directBlock,
    };
  }

  const client = createClient({ timeout: requestTimeout });

  const performUndiciRequest = async (): Promise<SearchFetchResult> => {
    const response = await client.get(url, { headers });
    const html = await response.text();
    const block = detectBlock(
      { status: response.status, headers: response.headers },
      html
    );

    return {
      html,
      status: response.status,
      transport: 'undici',
      fallbackUsed: false,
      impersonateAvailable,
      block,
    };
  };

  if (options.transport === 'undici') {
    return performUndiciRequest();
  }

  if (!impersonateAvailable) {
    return performUndiciRequest();
  }

  try {
    const primaryImpersonateResponse = await fetchWithCurl(url, headers, requestTimeout);
    const primaryImpersonateBlock = detectBlock(
      { status: primaryImpersonateResponse.status, headers: new Headers() },
      primaryImpersonateResponse.html
    );

    if (!primaryImpersonateBlock.blocked || primaryImpersonateBlock.confidence <= 0.7) {
      return {
        html: primaryImpersonateResponse.html,
        status: primaryImpersonateResponse.status,
        transport: 'curl',
        fallbackUsed: false,
        impersonateAvailable,
        block: primaryImpersonateBlock,
      };
    }
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

function resolveSearchResultUrl(rawHref: string): string | null {
  try {
    const normalized = rawHref.startsWith('//') ? `https:${rawHref}` : rawHref;
    const parsed = new URL(normalized, GOOGLE_SEARCH_ORIGIN);
    const rawResultUrl = parsed.searchParams.get('q') ?? parsed.searchParams.get('url');
    if (!rawResultUrl) return null;

    const candidate = new URL(decodeURIComponent(rawResultUrl), GOOGLE_SEARCH_ORIGIN);
    if (!candidate.protocol.startsWith('http')) return null;
    if (candidate.hostname === 'www.google.com' && candidate.pathname === '/search') return null;

    return candidate.toString();
  } catch {
    return null;
  }
}

function extractDisplayedUrl(linkUrl: string, containerText?: string): string {
  const direct = (() => {
    try {
      return new URL(linkUrl).hostname;
    } catch {
      return '';
    }
  })();
  if (direct) return cleanText(direct);
  return containerText ? cleanText(containerText).slice(0, 120) : '';
}

function looksLikeSnippet(text: string, title: string): boolean {
  const cleaned = cleanText(text);
  if (cleaned.length < 25 || cleaned.length > 600) return false;
  if (cleaned === title) return false;
  if (/^https?:\/\//i.test(cleaned)) return false;
  return true;
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
  options: NormalizedSearchOptions
): {
  results: GoogleSearchResult[];
  nextPageUrl?: string;
  nextPageStart?: number;
  resultStats?: number;
} {
  const doc = ScrapeDocument.createSync(html, { baseUrl: GOOGLE_SEARCH_ORIGIN });
  const results: GoogleSearchResult[] = [];
  const seen = new Set<string>();
  const maxResults = options.maxResults ? Number(options.maxResults) : undefined;

  const linkSelector = GOOGLE_RESULT_LINK_SELECTORS.join(', ');
  const anchors = doc.selectAll(linkSelector);

  for (const anchor of anchors) {
    const rawHref = anchor.attr('href');
    if (!rawHref) continue;
    const resultUrl = resolveSearchResultUrl(rawHref);
    if (!resultUrl || seen.has(resultUrl)) continue;

    const titleText = (() => {
      const fromHeading = anchor.find('h3').text();
      if (fromHeading) return cleanText(fromHeading);
      const fromContainer = anchor.text();
      return cleanText(fromContainer);
    })();

    if (!titleText) continue;

    const resultContainer = anchor.parents(GOOGLE_RESULT_CONTAINER_SELECTORS).first();
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
    };

    results.push(item);
    seen.add(resultUrl);

    if (typeof maxResults === 'number' && Number.isFinite(maxResults) && results.length >= maxResults) {
      break;
    }
  }

  const nextPageRaw = (() => {
    const candidate = doc.selectFirst('a#pnnext, a[aria-label="Next"], a[id="pnnext"]').first();
    if (candidate && candidate.length) {
      const href = candidate.attr('href');
      if (!href) return undefined;
      try {
        return new URL(href, GOOGLE_SEARCH_ORIGIN).toString();
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
  const searchUrl = buildSearchUrl(query, normalized);
  const fetchResult = await fetchSearchResults(searchUrl, normalized);
  const parsed = parseSearchPage(fetchResult.html, normalized);

  const response: GoogleSearchResponse = {
    query: normalized.query,
    searchUrl,
    results: parsed.results,
    transport: {
      requested: normalized.transport,
      used: fetchResult.transport,
      fallbackUsed: fetchResult.fallbackUsed,
      impersonateAvailable: fetchResult.impersonateAvailable,
    },
    status: fetchResult.status,
    block: fetchResult.block,
    nextPageUrl: parsed.nextPageUrl,
    nextPageStart: parsed.nextPageStart,
    resultStats: parsed.resultStats,
  };

  if (normalized.includeRawHtml) {
    response.rawHtml = fetchResult.html;
  }

  return response;
}

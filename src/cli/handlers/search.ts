import { withHandler, getString, getNumber, getBoolean, colors } from '../output.js';
import type { RekHandler } from '../handler-types.js';
import type { GoogleSearchResult, SerpSearchSource } from '../../search/google.js';
import { searchGoogleAdvanced } from '../../search/google.js';

type SerpTransport = 'auto' | 'undici' | 'curl';

interface SerpSearchOutput {
  query: string;
  source: SerpSearchSource;
  searchUrl: string;
  results: Array<{
    rank: number;
    title: string;
    url: string;
    snippet?: string;
    placement?: string;
    displayedUrl?: string;
  }>;
  resultStats?: number;
  nextPageStart?: number;
  nextPageUrl?: string;
  status?: number;
  transport: {
    requested: SerpTransport;
    used: SerpTransport;
    fallbackUsed: boolean;
    impersonateAvailable: boolean;
  };
  timings?: {
    dns?: number;
    tcp?: number;
    tls?: number;
    ttfb?: number;
    total?: number;
  };
  block?: {
    detected: boolean;
    reason?: string;
    confidence?: number;
  };
  captcha?: {
    detected: boolean;
    provider?: string;
    confidence?: number;
  };
}

function normalizeSerpTransport(value: unknown): SerpTransport {
  const raw = getString(value).toLowerCase();
  if (raw === 'undici' || raw === 'curl' || raw === 'auto') {
    return raw;
  }
  return 'curl';
}

function normalizeTransportInput(value: unknown): string {
  const raw = getString(value).trim().toLowerCase();
  if (!raw) return '';
  return raw;
}

function normalizeSerpSource(value: unknown): SerpSearchSource {
  const raw = getString(value).trim().toLowerCase();
  return raw === 'google' || raw.length === 0 ? 'google' : 'google';
}

function toQueryResults(value: unknown): number {
  const parsed = getNumber(value);
  if (!Number.isFinite(parsed)) return 10;
  const normalized = Math.floor(parsed);
  if (!Number.isFinite(normalized)) return 10;
  return Math.min(100, Math.max(10, normalized));
}

function toQueryStart(value: unknown): number {
  const parsed = getNumber(value);
  if (!Number.isFinite(parsed)) return 0;
  const normalized = Math.floor(parsed);
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, normalized);
}

function toResultRows(result: GoogleSearchResult[]) {
  return result.map((item) => ({
    rank: item.rank,
    title: item.title.slice(0, 75),
    url: item.displayedUrl || item.url,
    placement: item.placement ?? 'organic',
    snippet: item.snippet ? item.snippet.slice(0, 120) : '',
  }));
}

export const searchHandler: RekHandler = withHandler(
  { loading: 'Running search...' },
  async (ctx, out, extCtx) => {
    const query = getString(ctx.result.positional.query);
    const jsonOutput = getBoolean(ctx.result.options.json);
    const country = getString(ctx.result.options.country);
    const gl = getString(ctx.result.options.gl || ctx.result.options.country);
    const hl = getString(ctx.result.options.hl);
    const site = getString(ctx.result.options.site);
    const transport = normalizeSerpTransport(ctx.result.options.transport);
    const source = normalizeSerpSource(ctx.result.options.source);
    const timeout = getQueryNumber(ctx.result.options.timeout, 15000);
    const num = toQueryResults(ctx.result.options.num);
    const start = toQueryStart(ctx.result.options.start);
    const includeRawHtml = getBoolean(ctx.result.options.includeRawHtml);
    const humanProfile = normalizeTransportInput(ctx.result.options.humanProfile) || 'chrome';
    const asSiteSearch = site || getString(ctx.result.options.asSiteSearch);
    const asExactPhrase = getString(ctx.result.options.exactPhrase);

    if (!query) {
      out.error('Search query is required');
      return;
    }

    if (!extCtx) {
      out.log(colors.gray(`Searching Google for: ${colors.bold(query)}`));
    }

    const result = await searchGoogleAdvanced(query, {
      asSitesearch: asSiteSearch,
      asEpq: asExactPhrase,
      num,
      start,
      country: country || undefined,
      gl: gl || undefined,
      hl: hl || undefined,
      source,
      transport,
      timeout,
      humanProfile: humanProfile === 'off' ? 'off' : 'chrome',
      includeRawHtml,
    });

    const outputPayload: SerpSearchOutput = {
      query: result.query,
      source: result.source,
      searchUrl: result.searchUrl,
      results: toResultRows(result.results),
      resultStats: result.resultStats,
      nextPageStart: result.nextPageStart,
      nextPageUrl: result.nextPageUrl,
      status: result.status,
      transport: {
        requested: transport,
        used: result.transport.used,
        fallbackUsed: result.transport.fallbackUsed,
        impersonateAvailable: result.transport.impersonateAvailable,
      },
      timings: result.timings,
      block: result.block ? {
        detected: Boolean(result.block.blocked),
        reason: result.block.reason,
        confidence: result.block.confidence,
      } : undefined,
      captcha: result.captcha ? {
        detected: result.captcha.detected,
        provider: result.captcha.provider,
        confidence: result.captcha.confidence,
      } : undefined,
    };

    if (extCtx) {
      out.response(outputPayload, { responseType: 'search' });
      return;
    }

    if (jsonOutput) {
      out.json({
        ...outputPayload,
        searchUrl: result.searchUrl,
      });
      return;
    }

    const totalResults = outputPayload.results.length;
    const usedTransport = `${outputPayload.transport.used} (requested: ${outputPayload.transport.requested})`;

    out.title('Google Search', '🔍');
    out.keyValue([
      { key: 'Query', value: outputPayload.query },
      { key: 'Source', value: outputPayload.source },
      { key: 'Search URL', value: outputPayload.searchUrl },
      { key: 'Results', value: totalResults },
      { key: 'Transport', value: usedTransport },
      { key: 'Country', value: country || '(inferred)' },
      { key: 'Locale', value: hl || '(default)' },
      { key: 'Status', value: outputPayload.status ?? 'n/a' },
    ]);

    if (outputPayload.block?.detected || outputPayload.captcha?.detected) {
      const warnings: string[] = [];
      if (outputPayload.block?.detected) {
        warnings.push(`Block detected (${outputPayload.block.reason || 'unknown'})`);
      }
      if (outputPayload.captcha?.detected) {
        warnings.push(`CAPTCHA detected${outputPayload.captcha.provider ? ` (${outputPayload.captcha.provider})` : ''}`);
      }
      out.blank();
      out.warn(warnings.join(' | '));
    }

    if (totalResults === 0) {
      out.warn('No results found (or blocked/captcha response without organic snippets).');
      return;
    }

    out.blank();
      out.subtitle('Top results');
    out.table(
      outputPayload.results.map((item) => ({
        Rank: `#${item.rank}`,
        Title: item.title,
        URL: item.url,
        Placement: item.placement ?? 'organic',
        Snippet: item.snippet ?? '',
      })),
      [
        { key: 'Rank', label: 'Rank', width: 6 },
        { key: 'Title', label: 'Title', width: 36 },
        { key: 'URL', label: 'URL', width: 44 },
        { key: 'Placement', label: 'Type', width: 10 },
        { key: 'Snippet', label: 'Snippet', width: 45 },
      ]
    );
  },
);

function getQueryNumber(value: unknown, fallback: number): number {
  const num = getNumber(value, fallback);
  if (!Number.isFinite(num)) return fallback;
  return Math.floor(num);
}

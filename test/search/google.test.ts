import { beforeEach, describe, expect, it, vi } from 'vitest';

import { inferSearchLocaleFromUrl, searchGoogleAdvanced } from '../../src/search/google.js';
import { ScrapeDocument } from '../../src/scrape/document.js';

const mockGet = vi.fn();
const mockHasImpersonate = vi.fn();
const mockCurlDispatch = vi.fn();

vi.mock('../../src/core/client.js', () => ({
  createClient: () => ({
    get: mockGet,
  }),
}));

vi.mock('../../src/utils/binary-manager.js', () => ({
  hasImpersonate: () => mockHasImpersonate(),
}));

vi.mock('../../src/transport/curl.js', () => ({
  CurlTransport: class {
    dispatch: typeof mockCurlDispatch = mockCurlDispatch;
  },
}));

function makeResponse(html: string, status = 200, headers = new Headers()) {
  return {
    status,
    headers,
    text: vi.fn(async () => html),
  };
}

const BASE_RESULT_HTML = `
  <html>
    <body>
      <div class="g" data-hveid="1">
        <a href="/url?q=https://docs.example.com/one">
          <h3>Example one</h3>
          <span data-sncf="1">Not used as title fallback</span>
        </a>
        <div class="aCOpRe">
          Example one snippet extracted from Google result selectors with enough length to be valid.
        </div>
      </div>
      <div class="tF2Cxc" data-ved="1">
        <a href="/url?q=https://docs.example.com/two">
          <h3>Example two</h3>
        </a>
        <span>
          Example two snippet extracted through fallback parsing logic for resilient extraction.
        </span>
      </div>
      <div class="g" data-hveid="2">
        <a href="/url?q=https://docs.example.com/one">
          <h3>Duplicate example</h3>
        </a>
      </div>
      <a href="/search?q=ignored&oq=ignored">
        <h3>Ignored google internal link</h3>
      </a>
      <a href="/url?foo=bar" id="bad-result">
        <h3>Bad result</h3>
      </a>
    <a href="/url?q=%ZZ" id="encoding-broken">
        <h3>Encoding broken</h3>
      </a>
      <a id="pnnext" href="/search?q=example&start=10">Next</a>
      <div id="result-stats">Aproximadamente 42000 resultados</div>
    </body>
  </html>
`;

describe('searchGoogleAdvanced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws on empty query', async () => {
    await expect(searchGoogleAdvanced('   ')).rejects.toThrow('Google query is required');
  });

  it('throws when country can not be resolved', async () => {
    mockHasImpersonate.mockReturnValue(false);
    await expect(searchGoogleAdvanced('test', { country: 'not-a-country' })).rejects.toThrow(
      'Invalid country for Google search.',
    );
  });

  it('builds URL and parses response using undici transport', async () => {
    mockGet.mockResolvedValueOnce(
      makeResponse(`<html><body><div class="g"><a href="/url?q=https://example.com"><h3>Only result</h3><div class="aCOpRe">This is a robust snippet with enough characters for extraction.</div></a></div></body></html>`)
    );

    const response = await searchGoogleAdvanced('  test query  ', {
      transport: 'undici',
      as_q: 'q-override',
      asQ: 'should-ignore',
      as_filetype: 'pdf',
      asFiletype: 'json',
      as_sitesearch: 'docs',
      asSitesearch: 'docs-legacy',
      as_nlo: 5,
      asNlo: 99,
      as_nhi: 10,
      asNhi: 1,
      tbm: 'isch',
      num: 150,
      start: 7,
      country: 'United States',
      gl: 'de',
      hl: 'en',
      safe: 'off',
      lr: 'lang_en',
      cr: 'countryBR',
      tbs: 'qdr:d',
      extraParams: {
        custom: 'ok',
        skip: '',
        active: false,
      },
      includeRawHtml: true,
      maxResults: 1,
    });

    const url = new URL(response.searchUrl);

    expect(response.query).toBe('test query');
    expect(url.searchParams.get('q')).toBe('  test query  ');
    expect(url.searchParams.get('as_q')).toBe('q-override');
    expect(url.searchParams.get('as_filetype')).toBe('pdf');
    expect(url.searchParams.get('as_sitesearch')).toBe('docs');
    expect(url.searchParams.get('num')).toBe('100');
    expect(url.searchParams.get('start')).toBe('7');
    expect(url.searchParams.get('as_nlo')).toBe('5');
    expect(url.searchParams.get('as_nhi')).toBe('10');
    expect(url.searchParams.get('gl')).toBe('us');
    expect(url.searchParams.get('active')).toBe('0');
    expect(url.searchParams.get('custom')).toBe('ok');
    expect(url.searchParams.has('skip')).toBe(false);

    expect(response.results).toHaveLength(1);
    expect(response.results[0]).toMatchObject({
      title: 'Only result',
      url: 'https://example.com/',
      displayedUrl: 'example.com',
      rank: 1,
    });
    expect(response.rawHtml).toBeDefined();
    expect(response.transport.requested).toBe('undici');
    expect(response.transport.used).toBe('undici');
    expect(response.transport.impersonateAvailable).toBe(false);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('adds chrome-like browser params when human profile is enabled', async () => {
    mockGet.mockResolvedValueOnce(
      makeResponse(`<html><body><div class="g"><a href="/url?q=https://example.com"><h3>Only result</h3><div class="aCOpRe">This is a robust snippet with enough characters for extraction.</div></a></div></body></html>`)
    );

    const response = await searchGoogleAdvanced('search profile', {
      transport: 'undici',
      humanProfile: 'chrome',
    });

    const url = new URL(response.searchUrl);
    expect(url.searchParams.get('aqs')).toBeTruthy();
    expect(url.searchParams.get('gs_lcrp')).toBeTruthy();
    expect(url.searchParams.get('sei')).toBeTruthy();
    expect(url.searchParams.get('sourceid')).toBe('chrome');
    expect(url.searchParams.get('client')).toBe('chrome');
    expect(url.searchParams.get('ie')).toMatch(/UTF-8|utf-8/i);
    expect(url.searchParams.get('oe')).toMatch(/UTF-8|utf-8/i);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('varies chrome browser signature params across calls using randomized selection', async () => {
    const randomValues = [
      0.2, 0.8,
      0.9, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.1, 0.15, 0.25, 0.35, 0.45,
      0.55, 0.12,
      0.4, 0.15,
      0.16, 0.26, 0.36, 0.46, 0.56, 0.66, 0.76, 0.86, 0.96, 0.06, 0.17, 0.27, 0.37, 0.47, 0.57, 0.67, 0.03,
    ];
    let randomCursor = 0;
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => {
      const value = randomValues[randomCursor % randomValues.length];
      randomCursor += 1;
      return value;
    });

    mockGet.mockResolvedValueOnce(makeResponse(`<html><body><div class="g"><a href="/url?q=https://example.com"><h3>Only result</h3><div class="aCOpRe">This is a robust snippet with enough characters for extraction.</div></a></div></body></html>`));
    mockGet.mockResolvedValueOnce(makeResponse(`<html><body><div class="g"><a href="/url?q=https://example.com"><h3>Only result</h3><div class="aCOpRe">This is a robust snippet with enough characters for extraction.</div></a></div></body></html>`));

    const first = await searchGoogleAdvanced('signature behavior', {
      transport: 'undici',
      humanProfile: 'chrome',
    });
    const second = await searchGoogleAdvanced('signature behavior', {
      transport: 'undici',
      humanProfile: 'chrome',
    });

    const firstUrl = new URL(first.searchUrl);
    const secondUrl = new URL(second.searchUrl);

    expect(firstUrl.searchParams.get('aqs')).not.toBe(secondUrl.searchParams.get('aqs'));
    expect(firstUrl.searchParams.get('gs_lcrp')).not.toBe(secondUrl.searchParams.get('gs_lcrp'));
    expect(firstUrl.searchParams.get('sei')).not.toBe(secondUrl.searchParams.get('sei'));
    expect(first.results[0]).toMatchObject({ title: 'Only result' });
    expect(randomSpy).toHaveBeenCalled();
    randomSpy.mockRestore();
  });

  it('keeps browser signature params off when human profile is disabled', async () => {
    mockGet.mockResolvedValueOnce(
      makeResponse(`<html><body><div class="g"><a href="/url?q=https://example.com"><h3>Only result</h3><div class="aCOpRe">This is a robust snippet with enough characters for extraction.</div></a></div></body></html>`)
    );

    const response = await searchGoogleAdvanced('search profile', {
      transport: 'undici',
      humanProfile: 'off',
    });

    const url = new URL(response.searchUrl);
    expect(url.searchParams.has('aqs')).toBe(false);
    expect(url.searchParams.has('gs_lcrp')).toBe(false);
    expect(url.searchParams.get('sourceid')).toBe('chrome');
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('uses localized Google host when country is inferred by gl parameter', async () => {
    mockHasImpersonate.mockReturnValue(false);
    mockGet.mockResolvedValueOnce(
      makeResponse(`<html><body><div class=\"g\"><a href="/url?q=https://example.com"><h3>Only result</h3><div class="aCOpRe">This is a robust snippet with enough characters for extraction.</div></a></div></body></html>`)
    );

    const response = await searchGoogleAdvanced('localized', {
      country: 'br',
      transport: 'undici',
    });

    const parsed = new URL(response.searchUrl);
    expect(parsed.hostname).toBe('www.google.com.br');
    expect(response.searchUrl).toContain('gl=br');
  });

  it('extracts search locale from target URL', () => {
    expect(inferSearchLocaleFromUrl('https://www.stone.com.br/shop')).toEqual({
      country: 'br',
      gl: 'br',
      hl: 'pt-BR',
    });
  });

  it('parses duplicates, snippet fallbacks, pagination and result stats', async () => {
    mockGet.mockResolvedValueOnce(makeResponse(BASE_RESULT_HTML));

    const response = await searchGoogleAdvanced('python', {
      maxResults: 10,
    });

    expect(response.results).toHaveLength(2);
    expect(response.results.map(item => item.url)).toEqual([
      'https://docs.example.com/one',
      'https://docs.example.com/two',
    ]);
    expect(response.results[0].snippet).toContain('Not used as title fallback');
    expect(response.results[1].snippet).toContain('fallback parsing logic');
    expect(response.nextPageUrl).toBe('https://www.google.com/search?q=example&start=10');
    expect(response.nextPageStart).toBe(10);
    expect(response.resultStats).toBe(42000);
    expect(response.transport.requested).toBe('auto');
    expect(response.transport.used).toBe('undici');
    expect(response.transport.impersonateAvailable).toBe(false);
  });

  it('detects ad placement and organic placement in search results', async () => {
    mockGet.mockResolvedValueOnce(
      makeResponse(`
        <html>
          <body>
            <div class="g xpd ad" data-text-ad="1">
              <a href="/url?q=https://docs.example.com/ad-keyword">
                <h3>Brand ad</h3>
                <span>Ad example</span>
                <div class="aCOpRe">Ad keyword snippet with enough length to be parsed as a valid snippet candidate and checked by tests.</div>
              </a>
            </div>
            <div class="g" data-hveid="2">
              <a href="/url?q=https://docs.example.com/organic-keyword">
                <h3>Organic keyword</h3>
                <span>Organic example</span>
                <div class="aCOpRe">Organic snippet with enough length to be parsed as a valid snippet candidate and checked by tests.</div>
              </a>
            </div>
          </body>
        </html>
      `)
    );

    const response = await searchGoogleAdvanced('campaign keyword');

    expect(response.results).toHaveLength(2);
    expect(response.results[0]).toMatchObject({
      placement: 'ad',
      placementHint: expect.any(String),
    });
    expect(response.results[1]).toMatchObject({
      placement: 'organic',
    });
  });

  it('uses impersonate-first flow in auto mode', async () => {
    mockHasImpersonate.mockReturnValue(true);
    mockCurlDispatch.mockResolvedValueOnce(
      makeResponse(`<html><body><div class="g"><a href="/url?q=https://example.com/impersonate"><h3>Impersonate result</h3><div class="aCOpRe">Snippet from impersonated request with enough length for parsing.</div></a></div></body></html>`)
    );

    const response = await searchGoogleAdvanced('impersonate', {
      transport: 'auto',
    });

    expect(response.transport.used).toBe('curl');
    expect(response.transport.fallbackUsed).toBe(false);
    expect(response.transport.impersonateAvailable).toBe(true);
    expect(mockCurlDispatch).toHaveBeenCalledTimes(1);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('uses impersonate-first flow in undici mode when available', async () => {
    mockHasImpersonate.mockReturnValue(true);
    mockCurlDispatch.mockResolvedValueOnce(
      makeResponse(`<html><body><div class="g"><a href="/url?q=https://example.com/undici-impersonate"><h3>Undici mode result</h3><div class="aCOpRe">Impersonated request wins over undici preference.</div></a></div></body></html>`)
    );

    const response = await searchGoogleAdvanced('undici', {
      transport: 'undici',
    });

    expect(response.transport.requested).toBe('undici');
    expect(response.transport.used).toBe('curl');
    expect(response.transport.fallbackUsed).toBe(false);
    expect(response.transport.impersonateAvailable).toBe(true);
    expect(mockCurlDispatch).toHaveBeenCalledTimes(1);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('falls back to undici when impersonate reports block', async () => {
    mockHasImpersonate.mockReturnValue(true);
    mockCurlDispatch.mockResolvedValueOnce(
      makeResponse('This looks like a CAPTCHA verification page, please complete the challenge before continuing.')
    );
    mockGet.mockResolvedValueOnce(
      makeResponse(`<html><body><div class="g"><a href="/url?q=https://example.com/fallback"><h3>Fallback result</h3><div class="aCOpRe">Fallback snippet for blocked impersonation flow with valid length.</div></a></div></body></html>`)
    );

    const response = await searchGoogleAdvanced('blocked', {
      transport: 'auto',
    });

    expect(response.transport.used).toBe('undici');
    expect(response.transport.fallbackUsed).toBe(true);
    expect(mockCurlDispatch).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(response.results).toHaveLength(1);
    expect(response.results[0].title).toBe('Fallback result');
  });

  it('falls back to alternate Google origins when first SERP host is blocked', async () => {
    mockHasImpersonate.mockReturnValue(false);
    mockGet
      .mockResolvedValueOnce(
        makeResponse('This page appears to require JavaScript and cookies to continue.'),
      )
      .mockResolvedValueOnce(
        makeResponse(`<html><body><div class="g" data-hveid="1"><a href="/url?q=https://example.com/alternate"><h3>Alternate origin result</h3><div class="aCOpRe">Alternate Google origin result with enough length for parser validation.</div></a></div></body></html>`)
      );

    const response = await searchGoogleAdvanced('origin fallback', {
      transport: 'undici',
      country: 'br',
    });

    const calls = mockGet.mock.calls.map(([callUrl]) => String(callUrl));
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('www.google.com.br/search');
    expect(calls[1]).toContain('www.google.com/search');
    expect(response.results).toHaveLength(1);
    expect(response.results[0].url).toBe('https://example.com/alternate');
    expect(response.transport.used).toBe('undici');
    expect(response.searchUrl).toContain('www.google.com/search');
  });

  it('falls back to undici when impersonate transport throws', async () => {
    mockHasImpersonate.mockReturnValue(true);
    mockCurlDispatch.mockRejectedValueOnce(new Error('curl failed'));
    mockGet.mockResolvedValueOnce(
      makeResponse(`<html><body><div class="g"><a href="/url?q=https://example.com/fallback2"><h3>Resilient fallback</h3><div class="aCOpRe">Fallback snippet after curl exception with enough characters for extraction.</div></a></div></body></html>`)
    );

    const response = await searchGoogleAdvanced('throws', {
      transport: 'auto',
    });

    expect(response.transport.used).toBe('undici');
    expect(response.transport.fallbackUsed).toBe(true);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('treats impersonate manager errors as unavailable and still searches with undici', async () => {
    mockHasImpersonate.mockImplementation(() => {
      throw new Error('impersonate binary layer broken');
    });
    mockGet.mockResolvedValueOnce(
      makeResponse(`<html><body><div class="g"><a href="/url?q=https://example.com/manager"><h3>Manager fallback</h3><div class="aCOpRe">Fallback after impersonate manager failures keeps parsing and works.</div></a></div></body></html>`)
    );

    const response = await searchGoogleAdvanced('manager failure');

    expect(response.transport.used).toBe('undici');
    expect(response.transport.impersonateAvailable).toBe(false);
    expect(response.results).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('supports explicit curl transport when impersonate is available', async () => {
    mockHasImpersonate.mockReturnValue(true);
    mockCurlDispatch.mockResolvedValueOnce(
      makeResponse(`<html><body><div class="g"><a href="/url?q=https://example.com/explicit"><h3>Explicit curl</h3><div class="aCOpRe">Explicit impersonate transport snippet with enough length for validation.</div></a></div></body></html>`)
    );

    const response = await searchGoogleAdvanced('explicit', {
      transport: 'curl',
    });

    expect(response.transport.used).toBe('curl');
    expect(response.transport.requested).toBe('curl');
    expect(response.transport.fallbackUsed).toBe(false);
    expect(mockCurlDispatch).toHaveBeenCalledTimes(1);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('throws when explicit curl is requested but impersonate is not available', async () => {
    mockHasImpersonate.mockReturnValue(false);

    await expect(
      searchGoogleAdvanced('explicit', {
        transport: 'curl',
      }),
    ).rejects.toThrow('Transport "curl" requires curl-impersonate; install it with `rek setup`');
    expect(mockCurlDispatch).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('normalizes direct and advanced country formats and advanced query aliases', async () => {
    mockGet.mockResolvedValueOnce(
      makeResponse(`<html><body><div class="g" data-hveid="1"><a href="/url?q=https://example.com/direct"><h3>Direct country</h3><div class="aCOpRe">Direct country country mapping coverage snippet with enough content.</div></a></div></body></html>`)
    );

    const response = await searchGoogleAdvanced('country variants', {
      transport: 'undici',
      country: 'US',
      asEpq: 'exact phrase',
      asOq: 'one two',
      asEq: 'bad',
      asRights: 'cc_publicdomain',
      num: 0,
      start: -1,
      headers: {
        'accept-language': 'it-IT',
        'x-custom-header': 'module-test',
      },
      userAgent: 'TestAgent/1.0',
    });

    const url = new URL(response.searchUrl);

    expect(url.searchParams.get('gl')).toBe('us');
    expect(url.searchParams.get('as_epq')).toBe('exact phrase');
    expect(url.searchParams.get('as_oq')).toBe('one two');
    expect(url.searchParams.get('as_eq')).toBe('bad');
    expect(url.searchParams.get('as_rights')).toBe('cc_publicdomain');
    expect(url.searchParams.has('num')).toBe(false);
    expect(url.searchParams.has('start')).toBe(false);
    expect(mockGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-custom-header': 'module-test',
          'accept-language': 'it-IT',
        }),
      }),
    );
  });

  it('uses tail-country fallback and legacy gl when no country is passed', async () => {
    mockGet.mockResolvedValueOnce(
      makeResponse(`<html><body><div class="g" data-hveid="1"><a href="/url?q=https://example.com/tail"><h3>Fallback title</h3><div class="aCOpRe">Legacy/gl tail fallback snippet with enough length for validation.</div></a></div></body></html>`)
    );
    mockGet.mockResolvedValueOnce(
      makeResponse(`<html><body><div class="g" data-hveid="1"><a href="/url?q=https://example.com/legacy"><h3>Legacy branch</h3><div class="aCOpRe">Legacy branch result to cover direct gl fallback behavior with enough characters.</div></a></div></body></html>`)
    );

    const tail = await searchGoogleAdvanced('tail alias', {
      country: 'region_us',
      transport: 'undici',
    });
    const legacy = await searchGoogleAdvanced('legacy gl', {
      gl: 'ca',
      transport: 'undici',
    });

    expect(new URL(tail.searchUrl).searchParams.get('gl')).toBe('us');
    expect(new URL(legacy.searchUrl).searchParams.get('gl')).toBe('ca');
  });

  it('supports implicit boolean extra params and ignores invalid extra param values', async () => {
    mockGet.mockResolvedValueOnce(
      makeResponse(`<html><body><div class="g" data-hveid="1"><a href="/url?q=https://example.com/boolean"><h3>Boolean param</h3><div class="aCOpRe">Boolean extra params are parsed by transport and rendered as query values in the URL builder.</div></a></div></body></html>`)
    );
    mockGet.mockResolvedValueOnce(
      makeResponse(`<html><body><div class="g" data-hveid="1"><a href="/url?q=https://example.com/invalid-extra"><h3>Invalid extra</h3><div class="aCOpRe">Invalid extra param should be ignored and not added to the query.</div></a></div></body></html>`)
    );

    const withTrue = await searchGoogleAdvanced('boolean', {
      transport: 'undici',
      extraParams: {
        active: true,
        blank: '   ',
      },
    });

    const withoutValid = await searchGoogleAdvanced('invalid extra', {
      transport: 'undici',
      extraParams: {
        blank: '   ',
      },
    });

    const trueUrl = new URL(withTrue.searchUrl);
    const invalidUrl = new URL(withoutValid.searchUrl);

    expect(trueUrl.searchParams.get('active')).toBe('1');
    expect(invalidUrl.toString()).not.toContain('blank');
    expect(withoutValid.results[0].title).toBe('Invalid extra');
  });

  it('parses search result URLs from q, url, protocol-relative and skips malformed/unwanted URLs', async () => {
    mockGet.mockResolvedValueOnce(
      makeResponse(`
        <html>
          <body>
            <div class="g" data-hveid="1">
              <a href="/url?q=https://example.com/q-result"><h3>Q result</h3><div class="aCOpRe">Q result snippet with enough characters for extraction.</div></a>
            </div>
            <a href="https://www.google.com/url?url=https://example.com/url-result"><h3>Url result</h3><div class="aCOpRe">Url result snippet with enough characters for extraction.</div></a>
            <a href="/url?q=mailto:test@example.com"><h3>Mail result</h3></a>
            <a href="/url?q=https://www.google.com/search?q=ignore"><h3>Google internal result</h3></a>
            <a href="/url?q=%ZZ"><h3>Malformed result</h3></a>
          </body>
        </html>
      `)
    );

    const response = await searchGoogleAdvanced('href formats');

    expect(response.results.map(item => item.url)).toEqual([
      'https://example.com/q-result',
      'https://example.com/url-result',
    ]);
  });

  it('handles anchors without href, without title, and with headingless title extraction', async () => {
    mockGet.mockResolvedValueOnce(
      makeResponse(`
        <html>
          <body>
            <a><h3>Ignored missing href</h3></a>
            <div class="g" data-hveid="1">
              <a href="/url?q=https://example.com/no-title"></a>
              <a href="/url?q=https://example.com/headingless">Headingless title from container</a>
            </div>
            <a href="/url?q=https://example.com/title-from-container">
              Headingless title from container text with extra detail.
            </a>
          </body>
        </html>
      `)
    );

    const response = await searchGoogleAdvanced('anchor edges');

    expect(response.results.some(item => item.url === 'https://example.com/no-title')).toBe(false);
    expect(response.results[0]?.title).toContain('Headingless title from container');
  });

  it('falls back to root snippet when specific selector snippets are absent', async () => {
    mockGet.mockResolvedValueOnce(
      makeResponse(`
        <html>
          <body>
            <div class="g" data-hveid="1">
              <a href="/url?q=https://example.com/root-snippet">
                <h3>Root fallback title</h3>
                Additional root-level text that should be long enough to be considered a valid snippet candidate for this parser.
              </a>
            </div>
          </body>
        </html>
      `)
    );

    const response = await searchGoogleAdvanced('root fallback');

    expect(response.results[0].snippet).toContain('Additional root-level text');
    expect(response.results[0].snippet?.length).toBeGreaterThan(25);
  });

  it('handles next-page URLs with missing start, missing href and parse edge cases', async () => {
    mockGet.mockResolvedValueOnce(
      makeResponse(`
        <html>
          <body>
            <a href="/url?q=https://example.com/edge"><h3>Edge</h3><div class="aCOpRe">Edge result snippet long enough for extraction and validation.</div></a>
            <a id="pnnext" href="/search?q=python">No start param</a>
          </body>
        </html>
      `)
    );
    mockGet.mockResolvedValueOnce(
      makeResponse(`
        <html>
          <body>
            <a href="/url?q=https://example.com/edge2"><h3>Edge2</h3><div class="aCOpRe">Second edge result snippet long enough for extraction.</div></a>
            <a id="pnnext"></a>
          </body>
        </html>
      `)
    );
    mockGet.mockResolvedValueOnce(
      makeResponse(`
        <html>
          <body>
            <a href="/url?q=https://example.com/edge3"><h3>Edge3</h3><div class="aCOpRe">Third edge result snippet long enough for extraction.</div></a>
            <a id="pnnext" href="/search?oq=python&start=">Start empty</a>
          </body>
        </html>
      `)
    );
    mockGet.mockResolvedValueOnce(
      makeResponse(`
        <html>
          <body>
            <a href="/url?q=https://example.com/edge4"><h3>Edge4</h3><div class="aCOpRe">Fourth edge result snippet long enough for extraction.</div></a>
            <a id="pnnext" href="http://[::1">Malformed next URL</a>
          </body>
        </html>
      `)
    );

    const noStart = await searchGoogleAdvanced('next edge');
    const noHref = await searchGoogleAdvanced('next edge 2');
    const emptyStart = await searchGoogleAdvanced('next edge 3');
    const malformedNext = await searchGoogleAdvanced('next edge 4');

    expect(noStart.nextPageUrl).toBe('https://www.google.com/search?q=python');
    expect(noStart.nextPageStart).toBeUndefined();
    expect(noStart.resultStats).toBeUndefined();

    expect(noHref.nextPageUrl).toBeUndefined();

    expect(emptyStart.nextPageStart).toBeUndefined();
    expect(malformedNext.nextPageUrl).toBeUndefined();
    expect(malformedNext.nextPageStart).toBeUndefined();
  });

  it('falls back to container text when displayed URL parsing fails', async () => {
    const OriginalURL = globalThis.URL;
    class PatchedURL extends OriginalURL {
      constructor(input: string | URL, base?: string | URL | null) {
        if (!base && String(input).includes('https://example.com/fallback-display')) {
          throw new Error('forced display URL parse failure');
        }
        super(input as string, base || undefined);
      }
    }

    globalThis.URL = PatchedURL as typeof URL;

    try {
      mockGet.mockResolvedValueOnce(
        makeResponse(`<html><body><div class="g" data-hveid="1"><a href="/url?q=https://example.com/fallback-display"><h3>Display fallback result</h3><div class="aCOpRe">Display fallback snippet with enough characters for extraction and validation.</div></a></div></body></html>`)
      );

      const response = await searchGoogleAdvanced('display fallback');

      expect(response.results[0].displayedUrl).toContain('Display fallback result');
    } finally {
      globalThis.URL = OriginalURL;
    }
  });

  it('covers next-page start parse throw with forced URL constructor failure', async () => {
    const OriginalURL = globalThis.URL;
    class PatchedURL extends OriginalURL {
      constructor(input: string | URL, base?: string | URL | null) {
        if (!base && String(input) === 'https://www.google.com/search?oq=python&start=abc') {
          throw new Error('forced next-page parse failure');
        }
        super(input as string, base || undefined);
      }
    }

    globalThis.URL = PatchedURL as typeof URL;

    try {
      mockGet.mockResolvedValueOnce(
        makeResponse(`
          <html>
            <body>
              <a href="/url?q=https://example.com/fail"><h3>Next parse fail</h3><div class="aCOpRe">Next parse fail result snippet with enough characters for validation.</div></a>
              <a id="pnnext" href="/search?oq=python&start=abc">Force parse fail</a>
            </body>
          </html>
        `)
      );

      const response = await searchGoogleAdvanced('next fail parse');

      expect(response.nextPageUrl).toBe('https://www.google.com/search?oq=python&start=abc');
      expect(response.nextPageStart).toBeUndefined();
    } finally {
      globalThis.URL = OriginalURL;
    }
  });

  it('covers parser edge cases for missing hrefs, empty q params, and protocol-relative links', async () => {
    mockGet.mockResolvedValueOnce(
      makeResponse('<html><body></body></html>')
    );

    const anchorWithoutHref = {
      attr: vi.fn(() => undefined),
      find: vi.fn(() => ({
        text: () => 'Missing href title',
      })),
      text: () => 'Missing href container',
      parents: vi.fn(() => ({
        first: () => ({
          find: vi.fn(() => ({
            first: () => ({ text: () => '' }),
            toArray: () => [],
          })),
          text: () => 'Missing href snippet',
        }),
      })),
    };

    const anchorWithEmptyQ = {
      attr: vi.fn((name: string) => (name === 'href' ? '/url?q=' : undefined)),
      find: vi.fn(() => ({
        text: () => 'Empty q result',
      })),
      text: () => 'Empty q container',
      parents: vi.fn(() => ({
        first: () => ({
          find: vi.fn(() => ({
            first: () => ({ text: () => '' }),
            toArray: () => [],
          })),
          text: () => 'Empty q snippet',
        }),
      })),
    };

    const anchorWithProtocolRelative = {
      attr: vi.fn((name: string) => (name === 'href' ? '//www.google.com/url?q=https://example.com/relative' : undefined)),
      find: vi.fn((selector: string) => (selector === 'h3' ? { text: () => 'Protocol relative result' } : { text: () => '' })),
      text: () => 'Protocol relative container',
      parents: vi.fn(() => ({
        first: () => ({
          find: vi.fn(() => ({
            first: () => ({ text: () => '' }),
            toArray: () => [],
          })),
          text: () => 'Protocol relative snippet text',
        }),
      })),
    };

    const createSyncSpy = vi.spyOn(ScrapeDocument, 'createSync').mockReturnValue({
      selectAll: vi.fn(() => [anchorWithoutHref, anchorWithEmptyQ, anchorWithProtocolRelative] as any),
      selectFirst: vi.fn(() => ({
        first: () => ({ length: 0 }),
        text: () => '',
      })),
    } as any);

    try {
      const response = await searchGoogleAdvanced('edge parser');

      expect(response.results.map(item => item.url)).toEqual(['https://example.com/relative']);
      expect(anchorWithoutHref.attr).toHaveBeenCalledWith('href');
      expect(anchorWithEmptyQ.attr).toHaveBeenCalledWith('href');
    } finally {
      createSyncSpy.mockRestore();
    }
  });

  it('covers invalid country normalization branches for underscore-based aliases', async () => {
    await expect(searchGoogleAdvanced('invalid country', { country: 'us_' })).rejects.toThrow(
      'Invalid country for Google search.',
    );

    await expect(searchGoogleAdvanced('invalid country', { country: 'region_usa' })).rejects.toThrow(
      'Invalid country for Google search.',
    );
  });

  it('uses snippet fallback candidates and skips non-snippet-like values', async () => {
    const createSyncSpy = vi.spyOn(ScrapeDocument, 'createSync').mockReturnValue({
      selectAll: vi.fn(() => [
        {
          attr: vi.fn((name: string) => (name === 'href' ? '/url?q=https://example.com/snippet-edge' : undefined)),
          find: vi.fn((selector: string) => ({
            text: () => {
              if (selector === 'h3') return 'Snippet edge';
              return '';
            },
          })),
          text: () => 'Snippet edge',
          parents: vi.fn(() => ({
            first: () => ({
              find: vi.fn((selector: string) => {
                if (selector === 'span,div') {
                  return {
                    first: vi.fn(),
                    toArray: () => [
                      { text: () => 'https://example.com' },
                      { text: () => 'Snippet edge' },
                      { text: () => 'short' },
                      { text: () => 'Fallback text long enough to be considered a valid snippet for parser validation.' },
                    ],
                  };
                }

                return {
                  first: () => ({
                    text: () => {
                      if (selector === '[data-sncf=\"1\"]') return 'https://example.com';
                      if (selector === 'span.aCOpRe') return 'Snippet edge';
                      if (selector === 'div.aCOpRe') return 'https://not-a-snippet';
                      if (selector === 'div.VwiC3b') return 'Snippet edge';
                      return '';
                    },
                  }),
                  toArray: vi.fn(),
                };
              }),
              text: () => 'Fallback root text that should not be used when snippet candidates are validated.',
            }),
          })),
        },
      ] as any),
      selectFirst: vi.fn(() => ({
        first: () => ({ length: 0 }),
        text: () => '',
      })),
    } as any);

    const OriginalURL = globalThis.URL;

    class PatchedURL extends OriginalURL {
      constructor(input: string | URL, base?: string | URL | null) {
        super(input as string, base || undefined);
      }
    }

    globalThis.URL = PatchedURL as typeof URL;

    try {
      mockGet.mockResolvedValueOnce(makeResponse(`<html><body><div class=\"g\" data-hveid=\"1\"></div></body></html>`));

      const response = await searchGoogleAdvanced('snippet fallback');

      expect(response.results).toHaveLength(1);
      expect(response.results[0]?.snippet).toContain('Fallback text long enough');
    } finally {
      globalThis.URL = OriginalURL;
      createSyncSpy.mockRestore();
    }
  });

  it('returns empty displayedUrl when URL parsing for displayed host fails and anchor text is empty', async () => {
    mockHasImpersonate.mockReturnValue(false);
    const createSyncSpy = vi.spyOn(ScrapeDocument, 'createSync').mockReturnValue({
      selectAll: vi.fn(() => [
        {
          attr: vi.fn(() => '/url?q=https://example.com/fallback-display-empty'),
          find: vi.fn((selector: string) => ({ text: () => (selector === 'h3' ? 'Display empty' : '') })),
          text: () => '',
          parents: vi.fn(() => ({
            first: () => ({
              find: vi.fn(() => ({
                first: () => ({ text: () => 'This is a valid snippet for this result entry.' }),
                toArray: () => [],
              })),
              text: () => '',
            }),
          })),
        },
      ] as any),
      selectFirst: vi.fn(() => ({
        first: () => ({ length: 0 }),
        text: () => '',
      })),
    } as any);

    const OriginalURL = globalThis.URL;

    class PatchedURL extends OriginalURL {
      constructor(input: string | URL, base?: string | URL | null) {
        if (!base && String(input) === 'https://example.com/fallback-display-empty') {
          throw new Error('forced direct displayed url parse failure');
        }
        super(input as string, base || undefined);
      }
    }

    globalThis.URL = PatchedURL as typeof URL;

    try {
      mockGet.mockResolvedValueOnce(makeResponse(`<html><body><div class=\"g\" data-hveid=\"1\"></div></body></html>`));

      const response = await searchGoogleAdvanced('display fallback empty');

      expect(response.results[0]?.displayedUrl).toBe('');
    } finally {
      globalThis.URL = OriginalURL;
      createSyncSpy.mockRestore();
    }
  });

  it('keeps next page start undefined for non-numeric start values', async () => {
    mockGet.mockResolvedValueOnce(
      makeResponse(`
        <html>
          <body>
            <div class="g" data-hveid="1">
              <a href="/url?q=https://example.com/non-numeric"><h3>Next bad start</h3><div class="aCOpRe">Next bad start snippet long enough to pass snippet heuristics.</div></a>
            </div>
            <a id="pnnext" href="/search?oq=example&start=abc">Next</a>
          </body>
        </html>
      `),
    );

    const response = await searchGoogleAdvanced('next non numeric');

    expect(response.nextPageUrl).toBe('https://www.google.com/search?oq=example&start=abc');
    expect(response.nextPageStart).toBeUndefined();
  });

  it('discards URL-like snippets during snippet extraction and uses fallback candidates', async () => {
    mockGet.mockResolvedValueOnce(
      makeResponse(`
        <html>
          <body>
            <div class="g" data-hveid="1">
              <a href="/url?q=https://example.com/url-snippet">
                <h3>URL snippet</h3>
                <span data-sncf="1">https://very-long-example-domain.com/path/that-should-trigger-url-snippet-rejection</span>
              </a>
            </div>
          </body>
        </html>
      `),
    );

    const response = await searchGoogleAdvanced('url snippet');

    expect(response.results).toHaveLength(1);
    expect(response.results[0]?.snippet).toContain('URL snippet');
  });

  it('handles non-finite parsed result stats when parseInt is not finite', async () => {
    const parseIntSpy = vi.spyOn(Number, 'parseInt').mockReturnValue(Number.NaN);

    mockGet.mockResolvedValueOnce(
      makeResponse(`
        <html>
          <body>
            <div class="g" data-hveid="1">
              <a href="/url?q=https://example.com/result"><h3>Result stats</h3><div class="aCOpRe">Result stats snippet with enough characters for extraction.</div></a>
            </div>
            <div id="result-stats">About 1200 results</div>
          </body>
        </html>
      `),
    );

    try {
      const response = await searchGoogleAdvanced('result stats non-finite');

      expect(response.resultStats).toBeUndefined();
    } finally {
      parseIntSpy.mockRestore();
    }
  });

});

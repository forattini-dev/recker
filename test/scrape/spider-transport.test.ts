import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spider } from '../../src/scrape/spider.js';

const mockClientGet = vi.fn();
const mockHasImpersonate = vi.fn();
const mockCurlDispatch = vi.fn();

vi.mock('../../src/core/client.js', () => ({
  createClient: () => ({
    get: mockClientGet,
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

function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html',
    },
  });
}

describe('Spider transport behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers curl-impersonate first when transport is auto and it is available', async () => {
    mockHasImpersonate.mockReturnValue(true);
    mockCurlDispatch.mockResolvedValue(
      htmlResponse('<!doctype html><html><head><title>Curl transport</title></head><body>ok</body></html>'),
    );

    const result = await spider('https://www.example.com', {
      transport: 'auto',
      maxPages: 1,
      respectRobotsTxt: false,
      useSitemap: false,
      delay: 0,
      concurrency: 1,
      preferCurlFirst: true,
      baseRetryDelayMs: 0,
      maxRetryAttempts: 1,
      retryJitterMs: 0,
      maxRetryDelayMs: 0,
    });

    expect(mockCurlDispatch).toHaveBeenCalledTimes(1);
    expect(mockClientGet).not.toHaveBeenCalled();
    expect(result.pages).toHaveLength(1);
  });

  it('falls back to undici when curl transport fails in auto mode', async () => {
    mockHasImpersonate.mockReturnValue(true);
    mockCurlDispatch
      .mockRejectedValueOnce(new Error('curl failed once'))
      .mockRejectedValueOnce(new Error('curl failed twice'));
    mockClientGet.mockResolvedValue(
      htmlResponse('<!doctype html><html><head><title>Undici fallback</title></head><body>ok</body></html>'),
    );

    const result = await spider('https://www.example.com', {
      transport: 'auto',
      maxPages: 1,
      respectRobotsTxt: false,
      delay: 0,
      concurrency: 1,
      preferCurlFirst: true,
      baseRetryDelayMs: 0,
      maxRetryAttempts: 3,
      retryJitterMs: 0,
      maxRetryDelayMs: 0,
    });

    expect(mockCurlDispatch).toHaveBeenCalledTimes(2);
    expect(mockClientGet).toHaveBeenCalledTimes(1);
    expect(result.pages[0].security?.transport).toBe('undici');
  });

  it('retries with curl first after one curl failure before switching', async () => {
    mockHasImpersonate.mockReturnValue(true);
    mockCurlDispatch.mockRejectedValueOnce(new Error('curl failed once'));
    mockCurlDispatch.mockResolvedValue(
      htmlResponse('<!doctype html><html><head><title>Curl retry success</title></head><body>ok</body></html>'),
    );

    const result = await spider('https://www.example.com', {
      transport: 'auto',
      maxPages: 1,
      respectRobotsTxt: false,
      useSitemap: false,
      delay: 0,
      concurrency: 1,
      preferCurlFirst: true,
      baseRetryDelayMs: 0,
      maxRetryAttempts: 2,
      retryJitterMs: 0,
      maxRetryDelayMs: 0,
    });

    expect(mockCurlDispatch).toHaveBeenCalledTimes(2);
    expect(mockClientGet).not.toHaveBeenCalled();
    expect(result.pages[0].security?.transport).toBe('curl');
  });
});

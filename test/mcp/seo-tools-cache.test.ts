import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { seoToolHandlers } from '../../src/mcp/tools/seo.js';

describe('MCP SEO tool persistence', () => {
  let server: Server;
  let baseUrl: string;
  let tempDir: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!doctype html>
<html>
<head>
  <title>Test Page</title>
  <meta name="description" content="Test description" />
  <link rel="canonical" href="http://localhost/" />
</head>
<body>
  <h1>Hello</h1>
  <a href="/about">About</a>
</body>
</html>`);
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind test server');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    tempDir = await mkdtemp(join(tmpdir(), 'recker-seo-test-'));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(tempDir, { recursive: true, force: true });
  });

  it('uses default temp path when persist=true', async () => {
    const result = await seoToolHandlers.rek_seo_analyze({
      url: baseUrl,
      persist: true,
      cacheTtlSec: 3600,
    });

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.reportMeta).toBeDefined();
    expect(content.reportMeta.reportPath).toContain(join(tmpdir(), 'recker', 'seo'));
    await expect(stat(content.reportMeta.reportPath)).resolves.toBeDefined();
  });

  it('writes to explicit output path', async () => {
    const outputPath = join(tempDir, `${randomUUID()}.json`);
    const result = await seoToolHandlers.rek_seo_analyze({
      url: baseUrl,
      output: outputPath,
      cache: false,
    });

    expect(result.isError).toBeUndefined();
    const content = JSON.parse(result.content[0].text);
    expect(content.reportMeta.reportPath).toBe(outputPath);
    await expect(stat(outputPath)).resolves.toBeDefined();
  });

  it('reuses cached report when enabled', async () => {
    const result1 = await seoToolHandlers.rek_seo_analyze({
      url: baseUrl,
      outputDir: tempDir,
      cache: true,
      cacheTtlSec: 3600,
    });

    expect(result1.isError).toBeUndefined();
    const content1 = JSON.parse(result1.content[0].text);
    expect(content1.reportMeta.cacheHit).toBe(false);

    const result2 = await seoToolHandlers.rek_seo_analyze({
      url: baseUrl,
      outputDir: tempDir,
      cache: true,
      cacheTtlSec: 3600,
    });

    expect(result2.isError).toBeUndefined();
    const content2 = JSON.parse(result2.content[0].text);
    expect(content2.reportMeta.cacheHit).toBe(true);
    expect(content2.note).toContain('Cache hit');
  });
});

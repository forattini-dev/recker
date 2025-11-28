import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createClient } from '../../src/core/client.js';
import { downloadToFile } from '../../src/utils/download.js';
import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Download Utils', () => {
  let server: Server;
  let baseUrl: string;
  let tempDir: string;

  beforeAll(async () => {
    // Create temp directory for downloads
    tempDir = await mkdtemp(join(tmpdir(), 'recker-download-test-'));

    // Create test server
    return new Promise<void>((resolve) => {
      server = createServer((req: IncomingMessage, res: ServerResponse) => {
        if (req.url === '/file') {
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': '12',
            'Accept-Ranges': 'bytes'
          });
          res.end('Hello World!');
        } else if (req.url === '/range-file') {
          const rangeHeader = req.headers.range;
          const content = 'Hello World!';

          if (rangeHeader) {
            // Parse Range header: bytes=5-
            const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
            if (match) {
              const start = parseInt(match[1], 10);
              const end = match[2] ? parseInt(match[2], 10) : content.length - 1;

              if (start >= content.length) {
                res.writeHead(416, { 'Content-Range': `bytes */${content.length}` });
                res.end();
                return;
              }

              const chunk = content.slice(start, end + 1);
              res.writeHead(206, {
                'Content-Type': 'application/octet-stream',
                'Content-Length': String(chunk.length),
                'Content-Range': `bytes ${start}-${end}/${content.length}`,
                'Accept-Ranges': 'bytes'
              });
              res.end(chunk);
              return;
            }
          }

          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(content.length),
            'Accept-Ranges': 'bytes'
          });
          res.end(content);
        } else if (req.url === '/no-range') {
          // Server doesn't support range requests
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': '12'
          });
          res.end('Hello World!');
        } else if (req.url === '/large') {
          const size = 1024 * 10; // 10KB
          const data = Buffer.alloc(size, 'x');
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(size)
          });
          res.end(data);
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });

      server.listen(0, () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    server.close();
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    // Clean up any files created during tests
    try {
      const files = ['test.bin', 'resume.bin', 'large.bin', 'progress.bin'];
      for (const file of files) {
        await rm(join(tempDir, file), { force: true });
      }
    } catch {
      // Ignore errors
    }
  });

  describe('downloadToFile', () => {
    it('should download a file', async () => {
      const client = createClient({ baseUrl });
      const dest = join(tempDir, 'test.bin');

      const result = await downloadToFile(client, `${baseUrl}/file`, dest);

      expect(result.status).toBe(200);
      expect(result.resumed).toBe(false);
      expect(result.bytesWritten).toBe(12);

      const content = await readFile(dest, 'utf-8');
      expect(content).toBe('Hello World!');
    });

    it('should resume download with Range header', async () => {
      const client = createClient({ baseUrl });
      const dest = join(tempDir, 'resume.bin');

      // Create partial file (first 5 bytes: "Hello")
      await writeFile(dest, 'Hello');

      const result = await downloadToFile(client, `${baseUrl}/range-file`, dest, {
        resume: true
      });

      expect(result.status).toBe(206);
      expect(result.resumed).toBe(true);
      expect(result.bytesWritten).toBe(7); // " World!" = 7 bytes

      const content = await readFile(dest, 'utf-8');
      expect(content).toBe('Hello World!');
    });

    it('should overwrite file when server returns 200 despite Range header', async () => {
      const client = createClient({ baseUrl });
      const dest = join(tempDir, 'resume.bin');

      // Create partial file
      await writeFile(dest, 'Hello');

      // Server at /no-range doesn't support Range, returns 200
      const result = await downloadToFile(client, `${baseUrl}/no-range`, dest, {
        resume: true
      });

      expect(result.status).toBe(200);
      expect(result.resumed).toBe(false);
      expect(result.bytesWritten).toBe(12);
    });

    it('should throw error for 416 Range Not Satisfiable', async () => {
      const client = createClient({ baseUrl });
      const dest = join(tempDir, 'resume.bin');

      // Create file larger than server content
      await writeFile(dest, 'This file is much larger than the server content!');

      // The error is actually an HttpError with status 416
      await expect(
        downloadToFile(client, `${baseUrl}/range-file`, dest, { resume: true })
      ).rejects.toThrow(/416/);
    });

    it('should call onProgress callback', async () => {
      const client = createClient({ baseUrl });
      const dest = join(tempDir, 'progress.bin');
      const progressEvents: any[] = [];

      await downloadToFile(client, `${baseUrl}/large`, dest, {
        onProgress: (event) => {
          progressEvents.push(event);
        }
      });

      // Should receive at least one progress event
      expect(progressEvents.length).toBeGreaterThan(0);
    });

    it('should pass custom headers', async () => {
      const client = createClient({ baseUrl });
      const dest = join(tempDir, 'test.bin');

      const result = await downloadToFile(client, `${baseUrl}/file`, dest, {
        headers: { 'X-Custom': 'value' }
      });

      expect(result.status).toBe(200);
    });

    it('should not add Range header when resume is false', async () => {
      const client = createClient({ baseUrl });
      const dest = join(tempDir, 'resume.bin');

      // Create partial file
      await writeFile(dest, 'Hello');

      const result = await downloadToFile(client, `${baseUrl}/file`, dest, {
        resume: false
      });

      expect(result.status).toBe(200);
      expect(result.resumed).toBe(false);
    });

    it('should handle resume with existing file but no Range header preset', async () => {
      const client = createClient({ baseUrl });
      const dest = join(tempDir, 'resume.bin');

      // Create partial file (first 5 bytes: "Hello")
      await writeFile(dest, 'Hello');

      // Use Headers object with Range already set
      const result = await downloadToFile(client, `${baseUrl}/range-file`, dest, {
        resume: true,
        headers: new Headers({ 'X-Custom': 'test' }) // No Range preset, will be added
      });

      expect(result.resumed).toBe(true);
    });

    it('should not override existing Range header', async () => {
      const client = createClient({ baseUrl });
      const dest = join(tempDir, 'resume.bin');

      // Create partial file
      await writeFile(dest, 'Hello');

      // Set custom Range header - should be respected
      const result = await downloadToFile(client, `${baseUrl}/range-file`, dest, {
        resume: true,
        headers: { 'Range': 'bytes=0-' } // Custom range
      });

      // Since we request bytes=0-, we get full content, status 206
      expect(result.status).toBe(206);
    });

    it('should pass additional request options', async () => {
      const client = createClient({ baseUrl });
      const dest = join(tempDir, 'test.bin');

      const result = await downloadToFile(client, `${baseUrl}/file`, dest, {
        request: {
          timeout: { request: 30000 }
        }
      });

      expect(result.status).toBe(200);
    });
  });
});

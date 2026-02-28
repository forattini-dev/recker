import { spawn } from 'node:child_process';
import { Transport, ReckerRequest, ReckerResponse } from '../types/index.js';
import { HttpResponse } from '../core/response.js';
import { NetworkError } from '../core/errors.js';
import { getCurlPath, hasImpersonate } from '../utils/binary-manager.js';

const TIMING_MARKER = '__RECKER_TIMING__';

function parseCurlTimingValue(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) return undefined;
  return Math.round(parsed * 1000);
}

function parseCurlTimings(payload?: string): {
  dns?: number;
  tcp?: number;
  tls?: number;
  ttfb?: number;
  download?: number;
  total?: number;
} {
  if (!payload) return {};

  const pairs = payload.split(/\s+/).filter(Boolean);
  const values: Record<string, number | undefined> = {};

  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx);
    const value = pair.slice(idx + 1);

    switch (key) {
      case 'dns':
        values.dns = parseCurlTimingValue(value);
        break;
      case 'tcp':
        values.tcp = parseCurlTimingValue(value);
        break;
      case 'tls':
        values.tls = parseCurlTimingValue(value);
        break;
      case 'ttfb':
        values.ttfb = parseCurlTimingValue(value);
        break;
      case 'download':
        values.download = parseCurlTimingValue(value);
        break;
      case 'total':
        values.total = parseCurlTimingValue(value);
        break;
      default:
        break;
    }
  }

  // Prefer explicit ttfb/download if possible, else infer download from total/ttfb.
  if (values.download === undefined && values.total !== undefined && values.ttfb !== undefined) {
    values.download = Math.max(0, values.total - values.ttfb);
  }

  return values;
}

function parseCurlOutput(responseText: string): {
  statusLine: string;
  headersText: string;
  bodyText: string;
  timings?: {
    dns?: number;
    tcp?: number;
    tls?: number;
    ttfb?: number;
    download?: number;
    total?: number;
  };
} {
  // Extract and remove timing footer if present.
  const markerMatch = responseText.match(/(?:\r?\n)__RECKER_TIMING__(.*)$/);
  let timingText: string | undefined;
  let bodyAndHeaders = responseText;

  if (markerMatch && markerMatch.index !== undefined) {
    const index = markerMatch.index;
    timingText = markerMatch[1]?.trim();
    bodyAndHeaders = responseText.slice(0, index);
  }

  // Split response headers and body by the last full header block.
  // Multiple header blocks can appear with redirects.
  const splitModes: Array<{ sep: string; sepLen: number }> = [
    { sep: '\r\n\r\n', sepLen: 4 },
    { sep: '\n\n', sepLen: 2 },
  ];

  let foundHeaderBlock: string | undefined;
  let bodyText = '';

  for (const mode of splitModes) {
    let cursor = 0;
    let lastBlockStart = -1;
    let lastBlockEnd = -1;

    while (cursor < bodyAndHeaders.length) {
      const start = bodyAndHeaders.indexOf('HTTP/', cursor);
      if (start < 0) break;

      const headerEnd = bodyAndHeaders.indexOf(mode.sep, start);
      if (headerEnd < 0) break;

      lastBlockStart = start;
      lastBlockEnd = headerEnd + mode.sepLen;
      cursor = lastBlockEnd;
    }

    if (lastBlockStart >= 0 && lastBlockEnd >= 0) {
      foundHeaderBlock = bodyAndHeaders.slice(lastBlockStart, lastBlockEnd - mode.sepLen);
      bodyText = bodyAndHeaders.slice(lastBlockEnd);
      break;
    }
  }

  // Fallback: no valid header parsing.
  if (foundHeaderBlock === undefined) {
    return {
      statusLine: 'HTTP/1.1 200 OK',
      headersText: '',
      bodyText: bodyAndHeaders,
      timings: timingText ? parseCurlTimings(timingText) : undefined,
    };
  }

  // Keep only final HTTP response block.
  const lines = foundHeaderBlock.split(/\r?\n/);
  const statusLine = lines[0]?.trim() || 'HTTP/1.1 200 OK';
  const headersText = lines.slice(1).filter((line) => line.trim().length > 0).join('\r\n');

  return {
    statusLine,
    headersText,
    bodyText,
    timings: timingText ? parseCurlTimings(timingText) : undefined,
  };
}

// Resolved once per process lifetime to avoid spawning --version on every request
let resolvedCommand: string | null = null;
async function getCommand(): Promise<string> {
  if (resolvedCommand !== null) return resolvedCommand;
  if (process.env.RECKER_CURL_BIN) {
    resolvedCommand = process.env.RECKER_CURL_BIN;
  } else if (await hasImpersonate()) {
    resolvedCommand = getCurlPath();
  } else {
    resolvedCommand = 'curl';
  }
  return resolvedCommand;
}

export class CurlTransport implements Transport {
  async dispatch(req: ReckerRequest): Promise<ReckerResponse> {
    return new Promise(async (resolve, reject) => {
      const args = [
        '-X', req.method,
        req.url,
        '-i', // Include headers in output
        '-s', // Silent mode (no progress meter)
        '-L', // Follow redirects (needed for locale/GDPR redirects)
        '--compressed', // Handle gzip/deflate/br automatically
        '--no-keepalive', // Avoid hanging connection, treat as one-shot
        '--write-out',
        `\\n${TIMING_MARKER} dns=%{time_namelookup} tcp=%{time_connect} tls=%{time_appconnect} ttfb=%{time_starttransfer} total=%{time_total}`,
      ];

      // Headers
      req.headers.forEach((val, key) => {
        args.push('-H', `${key}: ${val}`);
      });

      // Body
      if (req.body && typeof req.body === 'string') {
        args.push('-d', req.body);
      }

      const command = await getCommand();

      const child = spawn(command, args);

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
      child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

      child.on('error', (err) => {
        reject(new NetworkError(`Failed to spawn curl: ${err.message}`, 'ERR_CURL_SPAWN', req));
      });

      child.on('close', (code) => {
        if (code !== 0) {
          const stderr = Buffer.concat(stderrChunks).toString();
          // Curl may return with non-fatal codes for redirect/cached reads; if we have output, keep best effort.
          const parsed = parseCurlOutput(Buffer.concat(stdoutChunks).toString());
          if (parsed.bodyText.length > 0) {
            // Continue with parsed response when possible.
            try {
              const parsedHeaders = new Headers();
              for (const line of parsed.headersText.split(/\r?\n/)) {
                const colon = line.indexOf(':');
                if (colon > 0) {
                  const key = line.substring(0, colon).trim();
                  const val = line.substring(colon + 1).trim();
                  parsedHeaders.append(key, val);
                }
              }

              const statusMatch = parsed.statusLine.match(/HTTP\/[^ ]+ (\d+)(?:\s+(.*))?/);
              const status = statusMatch ? Number.parseInt(statusMatch[1], 10) : 0;
              const statusText = statusMatch ? statusMatch[2] || '' : '';

              const nativeResponse = new Response(parsed.bodyText, {
                status: Number.isFinite(status) && status > 0 ? status : 0,
                statusText,
                headers: parsedHeaders,
              });

              resolve(new HttpResponse(nativeResponse, {
                timings: parsed.timings,
                connection: { protocol: 'curl' },
              }));
            } catch {
              reject(new NetworkError(`Curl exited with code ${code}: ${stderr}`, 'ERR_CURL_EXIT', req));
            }
            return;
          }

          reject(new NetworkError(`Curl exited with code ${code}: ${stderr}`, 'ERR_CURL_EXIT', req));
          return;
        }

        const fullOutput = Buffer.concat(stdoutChunks);
        const { statusLine, headersText, bodyText, timings } = parseCurlOutput(fullOutput.toString());

        const headers = new Headers();
        for (const line of headersText.split(/\r?\n/)) {
          const colon = line.indexOf(':');
          if (colon > 0) {
            const key = line.substring(0, colon).trim();
            const val = line.substring(colon + 1).trim();
            headers.append(key, val);
          }
        }

        const statusMatch = statusLine.match(/HTTP\/[^ ]+ (\d+)(?:\s+(.*))?/);
        const status = statusMatch ? Number.parseInt(statusMatch[1], 10) : 200;
        const statusText = statusMatch ? statusMatch[2] || '' : 'OK';

        const nativeResponse = new Response(bodyText, {
          status: Number.isFinite(status) && status >= 0 ? status : 200,
          statusText,
          headers,
        });

        const responseTimings = timings && Object.keys(timings).length > 0 ? {
          dns: timings.dns,
          tcp: timings.tcp,
          tls: timings.tls ? (timings.ttfb !== undefined ? timings.tls : timings.tls) : undefined,
          firstByte: timings.ttfb,
          content: timings.download,
          total: timings.total,
        } : {};

        resolve(new HttpResponse(nativeResponse, {
          timings: responseTimings, // Curl timings require format conversion
          connection: { protocol: 'curl' },
        }));
      });
    });
  }
}

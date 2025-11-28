import { createWriteStream, existsSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Client } from '../core/client.js';
import type { ProgressCallback, RequestOptions } from '../types/index.js';
import { ReckerError } from '../core/errors.js';

export interface DownloadToFileOptions {
  /**
   * Whether to resume from an existing file (if present).
   * When true, uses Range requests starting at the current file size.
   */
  resume?: boolean;

  /**
   * Optional headers to send (merged with Range when resume is enabled).
   */
  headers?: Record<string, string> | Headers | [string, string][];

  /**
   * Download progress callback (per-chunk).
   */
  onProgress?: ProgressCallback;

  /**
   * Additional request options (method/timeout/etc.).
   */
  request?: Omit<RequestOptions, 'headers' | 'onDownloadProgress'>;
}

export interface DownloadResult {
  resumed: boolean;
  status: number;
  bytesWritten: number;
}

/**
 * Download to a local file with optional resume support (Range).
 * If resume is enabled and the file exists, a Range header is sent from the current size.
 */
export async function downloadToFile(
  client: Client,
  url: string,
  destination: string,
  options: DownloadToFileOptions = {}
): Promise<DownloadResult> {
  const resumeEnabled = options.resume === true;
  const existingSize = resumeEnabled && existsSync(destination) ? statSync(destination).size : 0;

  const headers = new Headers(options.headers || {});
  if (resumeEnabled && existingSize > 0 && !headers.has('Range')) {
    headers.set('Range', `bytes=${existingSize}-`);
  }

  const response = await client.get(url, {
    ...(options.request || {}),
    headers,
    onDownloadProgress: options.onProgress,
  });

  const shouldAppend = resumeEnabled && existingSize > 0 && response.status === 206;
  if (resumeEnabled && existingSize > 0 && response.status === 416) {
    throw new ReckerError(
      'Requested range not satisfiable for resume download.',
      undefined,
      response as any,
      [
        'Verify the destination file size matches the server content.',
        'Delete the local file and retry without resume.',
        'Ensure the server supports Range requests for this resource.'
      ]
    );
  }

  // If resume requested but server returns 200, overwrite from scratch.
  const bytesWritten = await streamToFile(
    response as any,
    destination,
    shouldAppend
  );

  return {
    resumed: shouldAppend,
    status: response.status,
    bytesWritten,
  };
}

async function streamToFile(response: any, destination: string, append: boolean): Promise<number> {
  const nodeStream = response.toNodeStream();
  if (!nodeStream) {
    throw new ReckerError(
      'Response has no body to write',
      undefined,
      response as any,
      [
        'Ensure the request returned a body (avoid HEAD/204).',
        'Check upstream for empty responses or errors.',
        'Retry the download if the connection was interrupted.'
      ]
    );
  }

  const writer = createWriteStream(destination, { flags: append ? 'a' : 'w' });

  await pipeline(nodeStream, writer);

  const written = writer.bytesWritten;
  return written;
}

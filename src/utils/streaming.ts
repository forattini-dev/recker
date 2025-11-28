/**
 * Streaming utilities for handling large file transfers
 * Enables memory-efficient streaming from source to destination
 */

import { Readable, PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Convert Web ReadableStream to Node.js Readable stream
 * Useful for piping to file system, other HTTP requests, etc.
 */
export function webToNodeStream(webStream: ReadableStream): Readable {
  const reader = webStream.getReader();

  return new Readable({
    async read() {
      try {
        const { done, value } = await reader.read();

        if (done) {
          this.push(null); // Signal end of stream
        } else {
          this.push(value);
        }
      } catch (error) {
        this.destroy(error as Error);
      }
    },

    destroy(error, callback) {
      reader.cancel().finally(() => callback(error));
    }
  });
}

/**
 * Convert Node.js Readable stream to Web ReadableStream
 * Useful for sending Node.js streams as request body
 */
export function nodeToWebStream(nodeStream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });

      nodeStream.on('end', () => {
        controller.close();
      });

      nodeStream.on('error', (err) => {
        controller.error(err);
      });
    },

    cancel() {
      nodeStream.destroy();
    }
  });
}

/**
 * Stream progress tracker
 * Wraps a stream and emits progress events
 */
export interface StreamProgressOptions {
  onProgress?: (progress: { loaded: number; total?: number; percent?: number }) => void;
  total?: number;
}

export function trackStreamProgress(
  stream: Readable,
  options: StreamProgressOptions = {}
): Readable {
  const { onProgress, total } = options;
  let loaded = 0;
  const startTime = Date.now();
  let lastUpdate = startTime;

  const passThrough = new PassThrough();

  stream.on('data', (chunk: Buffer) => {
    loaded += chunk.length;
    const now = Date.now();

    // Throttle updates (max 10 per second)
    if (onProgress && now - lastUpdate > 100) {
      const percent = total ? (loaded / total) * 100 : undefined;
      onProgress({ loaded, total, percent });
      lastUpdate = now;
    }
  });

  stream.on('end', () => {
    if (onProgress) {
      const percent = total ? 100 : undefined;
      onProgress({ loaded, total, percent });
    }
  });

  stream.pipe(passThrough);
  return passThrough;
}

/**
 * Pipe data from source stream to destination stream
 * Returns a promise that resolves when piping is complete
 */
export async function pipeStream(
  source: Readable,
  destination: NodeJS.WritableStream,
  options: StreamProgressOptions = {}
): Promise<void> {
  const tracked = options.onProgress
    ? trackStreamProgress(source, options)
    : source;

  await pipeline(tracked, destination);
}

/**
 * Create a streaming upload from a readable source
 * Returns both the stream and a promise that resolves when upload completes
 */
export function createUploadStream(source: Readable) {
  const passThrough = new PassThrough();

  // Use pipeline-like error propagation manually or just listen
  source.pipe(passThrough);
  source.on('error', (err) => passThrough.destroy(err));

  return {
    stream: nodeToWebStream(passThrough),
    promise: new Promise<void>((resolve, reject) => {
      passThrough.on('finish', resolve);
      passThrough.on('error', reject);
    })
  };
}

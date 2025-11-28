/**
 * Request Events API
 * Provides event-based hooks for request lifecycle events
 * Similar to got's event emitter pattern
 */

import { EventEmitter } from 'events';
import type { ProgressEvent, ReckerResponse, ReckerRequest } from '../types/index.js';

/**
 * Events emitted during the request lifecycle
 */
export interface RequestEvents {
  /** Emitted when request is about to be sent */
  request: (request: ReckerRequest) => void;

  /** Emitted when response headers are received */
  response: (response: ResponseInfo) => void;

  /** Emitted during download with progress information */
  downloadProgress: (progress: ProgressEvent) => void;

  /** Emitted during upload with progress information */
  uploadProgress: (progress: ProgressEvent) => void;

  /** Emitted when a retry is about to happen */
  retry: (info: RetryInfo) => void;

  /** Emitted when redirect is followed */
  redirect: (info: EventRedirectInfo) => void;

  /** Emitted when request completes successfully */
  complete: (response: ReckerResponse) => void;

  /** Emitted when an error occurs */
  error: (error: Error) => void;
}

export interface ResponseInfo {
  status: number;
  statusText: string;
  headers: Headers;
  url: string;
}

export interface RetryInfo {
  attempt: number;
  maxAttempts: number;
  error: Error;
  delay: number;
}

export interface EventRedirectInfo {
  from: string;
  to: string;
  status: number;
}

/**
 * Type-safe event emitter for request events
 */
export class RequestEventEmitter extends EventEmitter {
  on<E extends keyof RequestEvents>(event: E, listener: RequestEvents[E]): this {
    return super.on(event, listener);
  }

  once<E extends keyof RequestEvents>(event: E, listener: RequestEvents[E]): this {
    return super.once(event, listener);
  }

  emit<E extends keyof RequestEvents>(event: E, ...args: Parameters<RequestEvents[E]>): boolean {
    return super.emit(event, ...args);
  }

  off<E extends keyof RequestEvents>(event: E, listener: RequestEvents[E]): this {
    return super.off(event, listener);
  }

  removeListener<E extends keyof RequestEvents>(event: E, listener: RequestEvents[E]): this {
    return super.removeListener(event, listener);
  }
}

/**
 * Create a request event emitter
 *
 * @example
 * ```typescript
 * const events = createRequestEvents();
 *
 * events.on('downloadProgress', (progress) => {
 *   console.log(`Downloaded: ${progress.percent}%`);
 * });
 *
 * events.on('response', (info) => {
 *   console.log(`Status: ${info.status}`);
 * });
 *
 * await client.get('/file', { events });
 * ```
 */
export function createRequestEvents(): RequestEventEmitter {
  return new RequestEventEmitter();
}

/**
 * Stream wrapper with event emission
 * Wraps a ReadableStream and emits progress events
 */
export function createEventStream(
  stream: ReadableStream<Uint8Array>,
  events: RequestEventEmitter,
  options: {
    total?: number;
    direction: 'upload' | 'download';
    throttleMs?: number;
  }
): ReadableStream<Uint8Array> {
  const { total, direction, throttleMs = 100 } = options;

  let loaded = 0;
  let startTime = Date.now();
  let lastUpdate = 0;
  let lastLoaded = 0;
  let lastRateUpdate = startTime;
  let smoothedRate = 0;
  const rateSmoothingFactor = 0.3;

  const emitProgress = (now: number, isFinal: boolean) => {
    const intervalMs = now - lastRateUpdate;
    const bytesInInterval = loaded - lastLoaded;

    if (intervalMs > 0) {
      const instantRate = (bytesInInterval / intervalMs) * 1000;
      smoothedRate = smoothedRate === 0
        ? instantRate
        : smoothedRate * (1 - rateSmoothingFactor) + instantRate * rateSmoothingFactor;
    }

    lastLoaded = loaded;
    lastRateUpdate = now;

    let percent: number | undefined;
    if (total) {
      percent = isFinal ? 100 : Math.min((loaded / total) * 100, 99.9);
    }

    const progress: ProgressEvent = {
      loaded,
      transferred: loaded,
      total,
      percent,
      rate: smoothedRate,
      estimated: total && smoothedRate > 0 ? ((total - loaded) / smoothedRate) * 1000 : undefined,
      direction,
    };

    const event = direction === 'download' ? 'downloadProgress' : 'uploadProgress';
    events.emit(event, progress);
    lastUpdate = now;
  };

  return new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();

      try {
        // Emit initial progress
        emitProgress(Date.now(), false);

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            emitProgress(Date.now(), true);
            controller.close();
            break;
          }

          loaded += value.byteLength;
          const now = Date.now();

          if (now - lastUpdate >= throttleMs || (total && loaded === total)) {
            emitProgress(now, false);
          }

          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
        throw error;
      }
    },
  });
}

/**
 * Stream events configuration
 */
export interface StreamEventsConfig {
  /** Event emitter to use */
  events: RequestEventEmitter;

  /** Total size for progress calculation */
  total?: number;

  /** Minimum interval between progress events in ms */
  throttleMs?: number;
}

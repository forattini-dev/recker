import { ProgressEvent, ProgressCallback } from '../types/index.js';

export interface ProgressStreamOptions {
  /** Total size in bytes if known */
  total?: number;
  /** Direction of the transfer */
  direction?: 'upload' | 'download';
  /** Minimum interval between progress updates in ms (default: 100) */
  throttleMs?: number;
}

/**
 * Create a progress tracking stream wrapper
 * Wraps a ReadableStream and emits progress events through the callback
 *
 * @example
 * ```typescript
 * const progressStream = createProgressStream(
 *   response.body,
 *   (progress) => console.log(`${progress.percent}% complete`),
 *   { total: contentLength, direction: 'download' }
 * );
 * ```
 */
export function createProgressStream(
  stream: ReadableStream<Uint8Array>,
  onProgress: ProgressCallback,
  optionsOrTotal?: number | ProgressStreamOptions
): ReadableStream<Uint8Array> {
  // Support both old signature (total as number) and new options object
  const options: ProgressStreamOptions = typeof optionsOrTotal === 'number'
    ? { total: optionsOrTotal }
    : optionsOrTotal || {};

  const { total, direction, throttleMs = 100 } = options;

  let loaded = 0;
  let startTime = Date.now();
  let lastUpdate = 0; // Start at 0 to ensure first chunk triggers update
  let lastLoaded = 0;
  let lastRateUpdate = startTime;

  // For smoothed rate calculation
  let smoothedRate = 0;
  const rateSmoothingFactor = 0.3; // Weight for new rate measurement

  const emitProgress = (now: number, isFinal: boolean) => {
    const elapsed = (now - startTime) / 1000; // seconds

    // Calculate instantaneous rate over recent interval
    const intervalMs = now - lastRateUpdate;
    const bytesInInterval = loaded - lastLoaded;

    if (intervalMs > 0) {
      const instantRate = (bytesInInterval / intervalMs) * 1000;
      // Exponential moving average for smoother rate
      smoothedRate = smoothedRate === 0
        ? instantRate
        : smoothedRate * (1 - rateSmoothingFactor) + instantRate * rateSmoothingFactor;
    }

    lastLoaded = loaded;
    lastRateUpdate = now;

    const rate = smoothedRate;

    // Calculate percent - cap at 100 for final event
    let percent: number | undefined;
    if (total) {
      percent = isFinal ? 100 : Math.min((loaded / total) * 100, 99.9);
    }

    const progress: ProgressEvent = {
      loaded,
      transferred: loaded, // got compatibility
      total,
      percent,
      rate,
      estimated: total && rate > 0 ? ((total - loaded) / rate) * 1000 : undefined,
      direction,
    };

    onProgress(progress);
    lastUpdate = now;
  };

  return new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();

      try {
        // Emit initial 0% progress
        emitProgress(Date.now(), false);

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            // Emit final 100% progress
            emitProgress(Date.now(), true);
            controller.close();
            break;
          }

          loaded += value.byteLength;
          const now = Date.now();

          // Throttle updates (default max 10 per second)
          const shouldUpdate =
            now - lastUpdate >= throttleMs ||
            (total && loaded === total);

          if (shouldUpdate) {
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
 * Calculate progress from loaded and total
 */
export function calculateProgress(
  loaded: number,
  total?: number,
  direction?: 'upload' | 'download'
): ProgressEvent {
  const progress: ProgressEvent = {
    loaded,
    transferred: loaded,
    total,
    direction,
  };

  if (total && total > 0) {
    progress.percent = (loaded / total) * 100;
  }

  return progress;
}

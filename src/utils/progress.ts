import { ProgressEvent, ProgressCallback } from '../types/index.js';

/**
 * Create a progress tracking stream wrapper
 */
export function createProgressStream(
  stream: ReadableStream<Uint8Array>,
  onProgress: ProgressCallback,
  total?: number
): ReadableStream<Uint8Array> {
  let loaded = 0;
  let startTime = Date.now();
  let lastUpdate = startTime;

  return new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            controller.close();
            break;
          }

          loaded += value.byteLength;
          const now = Date.now();
          const elapsed = (now - startTime) / 1000; // seconds
          const rate = elapsed > 0 ? loaded / elapsed : 0;

          // Throttle updates (max 10 per second)
          if (now - lastUpdate > 100 || loaded === total) {
            const progress: ProgressEvent = {
              loaded,
              total,
              percent: total ? (loaded / total) * 100 : undefined,
              rate,
              estimated: total && rate > 0 ? ((total - loaded) / rate) * 1000 : undefined,
            };

            onProgress(progress);
            lastUpdate = now;
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
export function calculateProgress(loaded: number, total?: number): ProgressEvent {
  const progress: ProgressEvent = {
    loaded,
    total,
  };

  if (total && total > 0) {
    progress.percent = (loaded / total) * 100;
  }

  return progress;
}

/**
 * FPS & Frame Tracking
 *
 * Performance monitoring utilities for the shell UI.
 * Tracks frames per second and global frame count.
 */

import { createSignal } from 'tuiuiu.js';

// =============================================================================
// State
// =============================================================================

const [fps, setFps] = createSignal(0);
const [globalFrame, setGlobalFrame] = createSignal(0);
let frameCount = 0;
let lastFpsUpdate = Date.now();
let fpsInterval: NodeJS.Timeout | null = null;

// =============================================================================
// Functions
// =============================================================================

/**
 * Call this in your render loop or effect to update FPS
 */
export function trackFrame(): void {
  frameCount++;
  setGlobalFrame(f => f + 1);
  const now = Date.now();
  const elapsed = now - lastFpsUpdate;

  // Update FPS every 500ms for smoother display
  if (elapsed >= 500) {
    const currentFps = Math.round((frameCount / elapsed) * 1000);
    setFps(currentFps);
    frameCount = 0;
    lastFpsUpdate = now;
  }
}

/**
 * Get current global frame count
 */
export function getFrameCount(): number {
  return globalFrame();
}

/**
 * Start automatic FPS tracking with an interval
 * Call stopFpsTracking() when done
 */
export function startFpsTracking(intervalMs: number = 100): void {
  if (fpsInterval) return;

  lastFpsUpdate = Date.now();
  frameCount = 0;

  fpsInterval = setInterval(() => {
    trackFrame();
  }, intervalMs);
}

/**
 * Stop automatic FPS tracking
 */
export function stopFpsTracking(): void {
  if (fpsInterval) {
    clearInterval(fpsInterval);
    fpsInterval = null;
  }
}

/**
 * Get current FPS value
 */
export function getFps(): number {
  return fps();
}

/**
 * Get FPS signal for reactive access
 */
export { fps };

/**
 * Get frame count signal for reactive access
 */
export { globalFrame };

/**
 * Reset FPS counter and global frame count
 */
export function resetFps(): void {
  frameCount = 0;
  lastFpsUpdate = Date.now();
  setFps(0);
  setGlobalFrame(0);
}

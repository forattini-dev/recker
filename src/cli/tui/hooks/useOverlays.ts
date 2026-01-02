/**
 * useOverlays - Centralized overlay and toast management
 *
 * Uses tuiuiu's OverlayStack for managing modals, dialogs, and toasts.
 * Provides a simple API for showing notifications throughout the shell.
 */

import {
  createOverlayStack,
  Toast,
  Box,
  Text,
  type OverlayStackState,
} from 'tuiuiu.js';
import { themeColor } from '../shared/theme-helper.js';
import type { VNode } from 'tuiuiu.js';

// =============================================================================
// Overlay Stack Instance
// =============================================================================

let overlayStackInstance: OverlayStackState | null = null;

export function getOverlayStack(): OverlayStackState {
  if (!overlayStackInstance) {
    overlayStackInstance = createOverlayStack();
  }
  return overlayStackInstance;
}

// =============================================================================
// Toast Types and State
// =============================================================================

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
  icon?: string;
}

// Counter for unique toast IDs
let toastCounter = 0;

// =============================================================================
// Toast Functions
// =============================================================================

/**
 * Show a toast notification
 */
export function showToast(options: ToastOptions): string {
  const stack = getOverlayStack();
  const id = `toast-${++toastCounter}`;
  const duration = options.duration ?? 3000;

  stack.push({
    id,
    component: () => Toast({
      message: options.message,
      type: options.type ?? 'info',
      position: 'top',
      showIcon: true,
      fullWidth: true,
    }),
    closeOnEscape: true,
  });

  // Auto-dismiss after duration
  if (duration > 0) {
    setTimeout(() => {
      stack.close(id);
    }, duration);
  }

  return id;
}

/**
 * Show a success toast
 */
export function showSuccess(message: string, duration?: number): string {
  return showToast({ message, type: 'success', duration });
}

/**
 * Show an error toast
 */
export function showError(message: string, duration?: number): string {
  return showToast({ message, type: 'error', duration: duration ?? 5000 });
}

/**
 * Show a warning toast
 */
export function showWarning(message: string, duration?: number): string {
  return showToast({ message, type: 'warning', duration });
}

/**
 * Show an info toast
 */
export function showInfo(message: string, duration?: number): string {
  return showToast({ message, type: 'info', duration });
}

// =============================================================================
// Job-Specific Toasts
// =============================================================================

/**
 * Show job started notification
 */
export function showJobStarted(jobType: string, target: string): string {
  const icons: Record<string, string> = {
    download: '⬇️',
    watch: '👁️',
    spider: '🕷️',
  };
  const icon = icons[jobType] || '⚡';
  return showInfo(`${icon} ${jobType} started: ${truncate(target, 40)}`);
}

/**
 * Show job completed notification
 */
export function showJobCompleted(jobType: string, target: string, details?: string): string {
  const message = details
    ? `✓ ${jobType} completed: ${truncate(target, 30)} (${details})`
    : `✓ ${jobType} completed: ${truncate(target, 40)}`;
  return showSuccess(message, 4000);
}

/**
 * Show job failed notification
 */
export function showJobFailed(jobType: string, target: string, error?: string): string {
  const message = error
    ? `✗ ${jobType} failed: ${truncate(error, 40)}`
    : `✗ ${jobType} failed: ${truncate(target, 40)}`;
  return showError(message, 5000);
}

/**
 * Show job stopped notification
 */
export function showJobStopped(jobType: string, target: string): string {
  return showWarning(`⏹ ${jobType} stopped: ${truncate(target, 40)}`);
}

/**
 * Show live detection notification
 */
export function showLiveDetected(target: string): string {
  return showSuccess(`🎉 Stream is LIVE: ${truncate(target, 40)}`, 5000);
}

// =============================================================================
// Modal Functions
// =============================================================================

export interface ModalOptions {
  id: string;
  component: () => VNode;
  closeOnEscape?: boolean;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  onClose?: () => void;
}

/**
 * Push a modal overlay
 */
export function pushModal(options: ModalOptions): void {
  const stack = getOverlayStack();
  stack.push({
    id: options.id,
    component: options.component,
    closeOnEscape: options.closeOnEscape ?? true,
    onClose: options.onClose,
  });
}

/**
 * Close a specific overlay by ID
 */
export function closeOverlay(id: string): void {
  getOverlayStack().close(id);
}

/**
 * Close the top overlay
 */
export function popOverlay(): void {
  getOverlayStack().pop();
}

/**
 * Close all overlays
 */
export function closeAllOverlays(): void {
  getOverlayStack().closeAll();
}

/**
 * Check if any overlay is open
 */
export function hasOverlay(): boolean {
  return getOverlayStack().hasOverlay();
}

/**
 * Check if a specific overlay is open
 */
export function isOverlayOpen(id: string): boolean {
  return getOverlayStack().isOpen(id);
}

/**
 * Handle escape key for overlays
 * Returns true if an overlay was closed
 */
export function handleOverlayEscape(): boolean {
  const stack = getOverlayStack();
  const current = stack.current();
  if (current?.closeOnEscape !== false) {
    stack.pop();
    return true;
  }
  return false;
}

// =============================================================================
// Helpers
// =============================================================================

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}


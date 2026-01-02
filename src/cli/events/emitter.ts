/**
 * Command Event Emitter
 *
 * Base class for event-driven commands.
 * Commands extend this to emit standardized events.
 */

import { EventEmitter } from 'node:events';
import type {
  CommandEvent,
  EventHandler,
  EventSubscription,
  StartEvent,
  ProgressEvent,
  CompleteEvent,
  ErrorEvent,
  DataEvent,
  EventLevel,
} from './types.js';

// =============================================================================
// Command Emitter
// =============================================================================

export class CommandEmitter extends EventEmitter {
  protected commandName: string;
  protected startTime: number = 0;

  constructor(commandName: string) {
    super();
    this.commandName = commandName;
  }

  // ---------------------------------------------------------------------------
  // Event Emission Helpers
  // ---------------------------------------------------------------------------

  /**
   * Emit a start event
   */
  protected emitStart(target: string, options?: Record<string, unknown>): void {
    this.startTime = Date.now();
    const event: StartEvent = {
      type: 'start',
      timestamp: this.startTime,
      command: this.commandName,
      level: 'info',
      target,
      options,
    };
    this.emit('event', event);
    this.emit('start', event);
  }

  /**
   * Emit a progress event
   */
  protected emitProgress(data: Omit<ProgressEvent, 'type' | 'timestamp' | 'command' | 'level'>): void {
    const event: ProgressEvent = {
      type: 'progress',
      timestamp: Date.now(),
      command: this.commandName,
      level: 'debug',
      ...data,
    };
    this.emit('event', event);
    this.emit('progress', event);
  }

  /**
   * Emit a completion event
   */
  protected emitComplete(summary: Record<string, unknown>): void {
    const event: CompleteEvent = {
      type: 'complete',
      timestamp: Date.now(),
      command: this.commandName,
      level: 'info',
      duration: Date.now() - this.startTime,
      summary,
    };
    this.emit('event', event);
    this.emit('complete', event);
  }

  /**
   * Emit an error event
   */
  protected emitError(
    message: string,
    options?: { code?: string; stack?: string; context?: string }
  ): void {
    const event: ErrorEvent = {
      type: 'error',
      timestamp: Date.now(),
      command: this.commandName,
      level: 'error',
      message,
      ...options,
    };
    this.emit('event', event);
    this.emit('error', event);
  }

  /**
   * Emit a data event with custom payload
   */
  protected emitData<T>(category: string, payload: T, level: EventLevel = 'info'): void {
    const event: DataEvent<T> = {
      type: 'data',
      timestamp: Date.now(),
      command: this.commandName,
      level,
      category,
      payload,
    };
    this.emit('event', event);
    this.emit('data', event);
    this.emit(`data:${category}`, event);
  }

  /**
   * Emit a custom typed event
   */
  protected emitTyped<T extends CommandEvent>(event: Omit<T, 'timestamp' | 'command'>): void {
    const fullEvent = {
      ...event,
      timestamp: Date.now(),
      command: this.commandName,
    } as T;
    this.emit('event', fullEvent);
    this.emit(event.type, fullEvent);
  }

  // ---------------------------------------------------------------------------
  // Subscription Helpers
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to all events
   */
  onEvent(handler: EventHandler): EventSubscription {
    this.on('event', handler);
    return {
      unsubscribe: () => this.off('event', handler),
    };
  }

  /**
   * Subscribe to specific event type
   */
  onType<T extends CommandEvent>(type: T['type'], handler: EventHandler<T>): EventSubscription {
    this.on(type, handler);
    return {
      unsubscribe: () => this.off(type, handler),
    };
  }

  /**
   * Get elapsed time in ms
   */
  protected getElapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Format duration for display
   */
  protected formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m${secs}s`;
  }
}

// =============================================================================
// Event Bus (Global Singleton)
// =============================================================================

/**
 * Global event bus for cross-cutting concerns.
 * Useful for logging, metrics, and debugging.
 */
class GlobalEventBus extends EventEmitter {
  private static instance: GlobalEventBus;

  private constructor() {
    super();
    this.setMaxListeners(100);
  }

  static getInstance(): GlobalEventBus {
    if (!GlobalEventBus.instance) {
      GlobalEventBus.instance = new GlobalEventBus();
    }
    return GlobalEventBus.instance;
  }

  /**
   * Forward all events from a command emitter to the global bus
   */
  forward(emitter: CommandEmitter): void {
    emitter.onEvent((event) => {
      this.emit('event', event);
      this.emit(event.type, event);
      this.emit(`${event.command}:${event.type}`, event);
    });
  }

  /**
   * Subscribe to all events
   */
  onEvent(handler: EventHandler): EventSubscription {
    this.on('event', handler);
    return {
      unsubscribe: () => this.off('event', handler),
    };
  }

  /**
   * Subscribe to events from a specific command
   */
  onCommand(command: string, handler: EventHandler): EventSubscription {
    const wrapper = (event: CommandEvent) => {
      if (event.command === command) handler(event);
    };
    this.on('event', wrapper);
    return {
      unsubscribe: () => this.off('event', wrapper),
    };
  }
}

export const globalEventBus = GlobalEventBus.getInstance();

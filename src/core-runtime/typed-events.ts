import type { ReckerRequest, ReckerResponse } from '../types/index.js';
import type { RuntimeContext } from './request-context.js';

export type RuntimeEventName =
  | 'request:start'
  | 'request:success'
  | 'request:failed'
  | 'request:retry'
  | 'request:policy'
  | 'policy:block'
  | 'circuit:trip'
  | 'cache:hit'
  | 'cache:miss'
  | 'cache:store'
  | 'security:block'
  | 'transport:start'
  | 'transport:finish'
  | 'transport:error';

export interface RuntimeEventPayloads {
  'request:start': {
    context: RuntimeContext;
    req: ReckerRequest;
  };
  'request:success': {
    context: RuntimeContext;
    req: ReckerRequest;
    res: ReckerResponse;
    durationMs: number;
  };
  'request:failed': {
    context: RuntimeContext;
    req: ReckerRequest;
    error: Error;
    durationMs: number;
  };
  'request:retry': {
    context: RuntimeContext;
    req: ReckerRequest;
    attempt: number;
    delayMs: number;
    reason: string;
  };
  'request:policy': {
    context: RuntimeContext;
    req: ReckerRequest;
    policy: string;
    policySource?: string;
    reason?: string;
  };
  'policy:block': {
    context: RuntimeContext;
    req: ReckerRequest;
    policy: string;
    reason: string;
  };
  'circuit:trip': {
    context: RuntimeContext;
    req: ReckerRequest;
    key: string;
    reason: string;
  };
  'cache:hit': {
    context: RuntimeContext;
    req: ReckerRequest;
    cacheStatus: 'hit' | 'stale' | 'revalidated' | 'stale-error';
  };
  'cache:miss': {
    context: RuntimeContext;
    req: ReckerRequest;
  };
  'cache:store': {
    context: RuntimeContext;
    req: ReckerRequest;
    status: number;
  };
  'security:block': {
    context: RuntimeContext;
    req: ReckerRequest;
    rule: string;
    reason: string;
  };
  'transport:start': {
    context: RuntimeContext;
    req: ReckerRequest;
  };
  'transport:finish': {
    context: RuntimeContext;
    req: ReckerRequest;
    durationMs: number;
  };
  'transport:error': {
    context: RuntimeContext;
    req: ReckerRequest;
    error: Error;
  };
}

export interface TypedEventBus {
  on<K extends RuntimeEventName>(name: K, handler: (event: RuntimeEventPayloads[K]) => void): () => void;
  emit<K extends RuntimeEventName>(name: K, event: RuntimeEventPayloads[K]): void;
}

type RuntimeEventHandler = (event: RuntimeEventPayloads[RuntimeEventName]) => void;
type HandlerMap = Partial<Record<RuntimeEventName, Set<RuntimeEventHandler>>>;

export function createNoopEventBus(): TypedEventBus {
  return {
    on: () => () => undefined,
    emit: () => undefined
  };
}

export function createRuntimeEventBus(options: { debugLogger?: (...args: any[]) => void } = {}): TypedEventBus {
  const handlers: HandlerMap = {};

  const logger = options.debugLogger;

  return {
    on: (name, handler) => {
      const bucket = (handlers[name] ||= new Set<RuntimeEventHandler>());
      bucket.add(handler as RuntimeEventHandler);
      return () => {
        bucket.delete(handler as RuntimeEventHandler);
        if (bucket.size === 0) {
          delete handlers[name];
        }
      };
    },
    emit: (name, event) => {
      if (logger) {
        logger(name, event);
      }

      const bucket = handlers[name];
      if (!bucket || bucket.size === 0) {
        return;
      }

      for (const handler of bucket) {
        handler(event);
      }
    }
  };
}

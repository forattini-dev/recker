import type { ReckerRequest } from '../types/index.js';

export interface RuntimeContext {
  requestId: string;
  correlationId: string;
  tenant?: string;
  policyTags: string[];
  policySource?: string;
  createdAt: number;
  traceId?: string;
}

let requestSeq = 0;

export function createRequestContext(seed: Partial<RuntimeContext> = {}): RuntimeContext {
  requestSeq += 1;

  const requestId = `${Date.now().toString(36)}-${requestSeq.toString(36)}-${Math.random().toString(16).slice(2, 8)}`;

  return {
    requestId,
    correlationId: seed.correlationId || requestId,
    tenant: seed.tenant,
    policyTags: seed.policyTags ?? [],
    policySource: seed.policySource,
    createdAt: Date.now(),
    traceId: seed.traceId
  };
}

export function attachRequestContext<T extends ReckerRequest>(request: T, context: RuntimeContext): T {
  if (!request) {
    return request;
  }

  request._runtime = context;
  return request;
}

export function getRequestContext(request: ReckerRequest): RuntimeContext | undefined {
  return request._runtime;
}
